import { env } from "../config/env";
import type { BillingProject, BillingQueryParams, BillingUsageRow } from "../types/billing";
import { fetchAllPages, mergeCostAndTokenRows } from "./billingUtils";

const ANTHROPIC_BASE = "https://api.anthropic.com/v1/organizations";

interface AnthropicUsageResult {
  uncached_input_tokens: number;
  cache_read_input_tokens: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  output_tokens: number;
  server_tool_use?: { web_search_requests?: number };
  model?: string | null;
  api_key_id?: string | null;
  workspace_id?: string | null;
  service_tier?: string | null;
}

interface AnthropicUsageBucket {
  starting_at: string;
  ending_at: string;
  results: AnthropicUsageResult[];
}

interface AnthropicUsageResponse {
  data: AnthropicUsageBucket[];
  has_more: boolean;
  next_page: string | null;
}

interface AnthropicCostResult {
  amount: string;
  currency: string;
  cost_type?: string | null;
  token_type?: string | null;
  model?: string | null;
  workspace_id?: string | null;
  description?: string | null;
}

interface AnthropicCostBucket {
  starting_at: string;
  ending_at: string;
  results: AnthropicCostResult[];
}

interface AnthropicCostResponse {
  data: AnthropicCostBucket[];
  has_more: boolean;
  next_page: string | null;
}

function buildHeaders(): Record<string, string> {
  if (!env.ANTHROPIC_ADMIN_API_KEY) {
    throw new Error("ANTHROPIC_ADMIN_API_KEY is not configured");
  }
  return {
    "x-api-key": env.ANTHROPIC_ADMIN_API_KEY,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };
}

interface AnthropicWorkspaceItem {
  id: string;
  name: string;
  display_name?: string;
}

interface AnthropicWorkspacesResponse {
  data: AnthropicWorkspaceItem[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

export async function fetchAnthropicWorkspaces(): Promise<BillingProject[]> {
  const headers = buildHeaders();
  const workspaces: BillingProject[] = [];
  let afterId: string | undefined;

  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (afterId) qs.set("after_id", afterId);

    const res = await fetch(`${ANTHROPIC_BASE}/workspaces?${qs}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anthropic Workspaces API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as AnthropicWorkspacesResponse;
    for (const w of data.data) {
      workspaces.push({ id: w.id, name: w.display_name ?? w.name });
    }

    if (!data.has_more || !data.last_id) break;
    afterId = data.last_id;
  }

  return workspaces;
}

async function fetchCosts(params: BillingQueryParams): Promise<BillingUsageRow[]> {
  const headers = buildHeaders();

  const buildUrl = (page?: string) => {
    const qs = new URLSearchParams({
      starting_at: new Date(params.startDate).toISOString(),
      ending_at: new Date(params.endDate).toISOString(),
      bucket_width: "1d",
      limit: "31",
    });
    qs.append("group_by[]", "workspace_id");
    qs.append("group_by[]", "description");
    if (page) qs.set("page", page);
    return `${ANTHROPIC_BASE}/cost_report?${qs}`;
  };

  const pages = await fetchAllPages<AnthropicCostResponse>(buildUrl, headers, "Anthropic");
  const rows: BillingUsageRow[] = [];

  for (const page of pages) {
    for (const bucket of page.data) {
      const date = bucket.starting_at;
      for (const r of bucket.results) {
        const cents = parseFloat(r.amount) || 0;
        if (cents === 0) continue;
        rows.push({
          platform: "anthropic",
          date,
          model: r.description ?? r.model ?? r.cost_type ?? "unknown",
          project: r.workspace_id ?? undefined,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: cents / 100,
        });
      }
    }
  }

  // cost_report doesn't support workspace_ids filter, so filter locally
  if (params.projectIds?.length) {
    const allowed = new Set(params.projectIds);
    return rows.filter((r) => r.project && allowed.has(r.project));
  }

  return rows;
}

async function fetchTokenUsage(params: BillingQueryParams): Promise<BillingUsageRow[]> {
  const headers = buildHeaders();

  // Always include workspace_id to match cost endpoint grouping for merge
  const userGroupBy = params.groupBy?.length ? params.groupBy : ["model"];
  const groupBy = userGroupBy.includes("workspace_id")
    ? userGroupBy
    : [...userGroupBy, "workspace_id"];

  const buildUrl = (page?: string) => {
    const qs = new URLSearchParams({
      starting_at: new Date(params.startDate).toISOString(),
      ending_at: new Date(params.endDate).toISOString(),
      bucket_width: params.bucketWidth,
      limit: params.bucketWidth === "1h" ? "168" : "31",
    });
    for (const g of groupBy) qs.append("group_by[]", g);
    if (params.projectIds?.length) {
      for (const wid of params.projectIds) qs.append("workspace_ids[]", wid);
    }
    if (page) qs.set("page", page);
    return `${ANTHROPIC_BASE}/usage_report/messages?${qs}`;
  };

  const pages = await fetchAllPages<AnthropicUsageResponse>(buildUrl, headers, "Anthropic");
  const rows: BillingUsageRow[] = [];

  for (const page of pages) {
    for (const bucket of page.data) {
      const date = bucket.starting_at;
      for (const r of bucket.results) {
        const cacheCreation =
          (r.cache_creation?.ephemeral_5m_input_tokens ?? 0) +
          (r.cache_creation?.ephemeral_1h_input_tokens ?? 0);
        const input = (r.uncached_input_tokens ?? 0) + (r.cache_read_input_tokens ?? 0) + cacheCreation;
        const output = r.output_tokens ?? 0;
        if (input === 0 && output === 0) continue;
        rows.push({
          platform: "anthropic",
          date,
          model: r.model ?? (groupBy.includes("model") ? "unknown" : "(전체)"),
          project: r.workspace_id ?? undefined,
          apiKeyId: r.api_key_id ?? undefined,
          inputTokens: input,
          outputTokens: output,
          totalTokens: input + output,
          costUsd: 0,
        });
      }
    }
  }

  return rows;
}

export async function fetchAnthropicUsage(
  params: BillingQueryParams,
): Promise<BillingUsageRow[]> {
  const canFetchCosts = params.bucketWidth === "1d";

  // Fetch both cost and token data in parallel (like OpenAI), then merge.
  // cost_report only supports 1d buckets; token usage supports 1h/1d.
  const tokenParams = canFetchCosts
    ? { ...params, bucketWidth: "1d" as const }
    : params;

  const [allCostRows, tokenRows] = await Promise.all([
    canFetchCosts
      ? fetchCosts(params).catch((err) => {
          console.warn("[billing] Anthropic cost fetch failed:", (err as Error).message);
          return [] as BillingUsageRow[];
        })
      : Promise.resolve([] as BillingUsageRow[]),
    fetchTokenUsage(tokenParams).catch((err) => {
      console.warn("[billing] Anthropic token usage fetch failed:", (err as Error).message);
      return [] as BillingUsageRow[];
    }),
  ]);

  // Separate non-token costs (web search, code execution) so they aren't
  // absorbed into the proportional token-cost distribution.
  const isNonTokenCost = (r: BillingUsageRow) => {
    const m = r.model.toLowerCase();
    return m.includes("web search") || m.includes("code execution");
  };
  const nonTokenCosts = allCostRows.filter(isNonTokenCost);
  const tokenCosts = allCostRows.filter((r) => !isNonTokenCost(r));

  const merged = mergeCostAndTokenRows(tokenCosts, tokenRows);
  return [...merged, ...nonTokenCosts];
}
