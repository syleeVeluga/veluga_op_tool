import { env } from "../config/env";
import type { BillingProject, BillingQueryParams, BillingUsageRow } from "../types/billing";
import { fetchAllPages, mergeCostAndTokenRows } from "./billingUtils";

const OPENAI_BASE = "https://api.openai.com/v1/organization";

interface OpenAICostResult {
  object: string;
  amount: { value: number; currency: string };
  line_item?: string | null;
  project_id?: string | null;
}

interface OpenAICostBucket {
  object: string;
  start_time: number;
  end_time: number;
  results: OpenAICostResult[];
}

interface OpenAICostResponse {
  object: string;
  data: OpenAICostBucket[];
  has_more: boolean;
  next_page: string | null;
}

interface OpenAIUsageResult {
  object: string;
  input_tokens: number;
  output_tokens: number;
  input_cached_tokens?: number;
  num_model_requests?: number;
  project_id?: string | null;
  user_id?: string | null;
  api_key_id?: string | null;
  model?: string | null;
}

interface OpenAIUsageBucket {
  object: string;
  start_time: number;
  end_time: number;
  results: OpenAIUsageResult[];
}

interface OpenAIUsageResponse {
  object: string;
  data: OpenAIUsageBucket[];
  has_more: boolean;
  next_page: string | null;
}

function toEpochSeconds(isoDate: string): number {
  return Math.floor(new Date(isoDate).getTime() / 1000);
}

function epochToIso(epoch: number): string {
  return new Date(epoch * 1000).toISOString();
}

function buildHeaders(): Record<string, string> {
  if (!env.OPENAI_ADMIN_API_KEY) {
    throw new Error("OPENAI_ADMIN_API_KEY is not configured");
  }
  return {
    Authorization: `Bearer ${env.OPENAI_ADMIN_API_KEY}`,
    "Content-Type": "application/json",
  };
}

interface OpenAIProjectItem {
  id: string;
  name: string;
  status: string;
}

interface OpenAIProjectsResponse {
  data: OpenAIProjectItem[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

export async function fetchOpenAIProjects(): Promise<BillingProject[]> {
  const headers = buildHeaders();
  const projects: BillingProject[] = [];
  let afterId: string | undefined;

  for (let i = 0; i < 10; i++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (afterId) qs.set("after", afterId);

    const res = await fetch(`${OPENAI_BASE}/projects?${qs}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI Projects API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OpenAIProjectsResponse;
    for (const p of data.data) {
      if (p.status === "active") {
        projects.push({ id: p.id, name: p.name });
      }
    }

    if (!data.has_more || !data.last_id) break;
    afterId = data.last_id;
  }

  return projects;
}

async function fetchCosts(params: BillingQueryParams): Promise<BillingUsageRow[]> {
  const startTime = toEpochSeconds(params.startDate);
  const endTime = toEpochSeconds(params.endDate);
  const headers = buildHeaders();

  const buildUrl = (page?: string) => {
    const qs = new URLSearchParams({
      start_time: String(startTime),
      end_time: String(endTime),
      bucket_width: params.bucketWidth,
      limit: params.bucketWidth === "1h" ? "168" : "31",
    });
    for (const g of ["project_id", "line_item"]) qs.append("group_by", g);
    if (params.projectIds?.length) {
      for (const pid of params.projectIds) qs.append("project_ids", pid);
    }
    if (page) qs.set("page", page);
    return `${OPENAI_BASE}/costs?${qs}`;
  };

  const pages = await fetchAllPages<OpenAICostResponse>(buildUrl, headers, "OpenAI");
  const rows: BillingUsageRow[] = [];

  for (const page of pages) {
    for (const bucket of page.data) {
      const date = epochToIso(bucket.start_time);
      for (const r of bucket.results) {
        if (r.amount.value === 0) continue;
        rows.push({
          platform: "openai",
          date,
          model: r.line_item ?? "unknown",
          project: r.project_id ?? undefined,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          costUsd: r.amount.value,
        });
      }
    }
  }

  return rows;
}

async function fetchTokenUsage(params: BillingQueryParams): Promise<BillingUsageRow[]> {
  const startTime = toEpochSeconds(params.startDate);
  const endTime = toEpochSeconds(params.endDate);
  const headers = buildHeaders();

  // Always include project_id to match cost endpoint grouping for merge
  const userGroupBy = params.groupBy?.length ? params.groupBy : ["model"];
  const groupBy = userGroupBy.includes("project_id")
    ? userGroupBy
    : [...userGroupBy, "project_id"];

  const buildUrl = (page?: string) => {
    const qs = new URLSearchParams({
      start_time: String(startTime),
      end_time: String(endTime),
      bucket_width: params.bucketWidth,
      limit: params.bucketWidth === "1h" ? "168" : "31",
    });
    for (const g of groupBy) qs.append("group_by", g);
    if (params.projectIds?.length) {
      for (const pid of params.projectIds) qs.append("project_ids", pid);
    }
    if (page) qs.set("page", page);
    return `${OPENAI_BASE}/usage/completions?${qs}`;
  };

  const pages = await fetchAllPages<OpenAIUsageResponse>(buildUrl, headers, "OpenAI");
  const rows: BillingUsageRow[] = [];

  for (const page of pages) {
    for (const bucket of page.data) {
      const date = epochToIso(bucket.start_time);
      for (const r of bucket.results) {
        const input = r.input_tokens ?? 0;
        const output = r.output_tokens ?? 0;
        if (input === 0 && output === 0) continue;
        rows.push({
          platform: "openai",
          date,
          model: r.model ?? "unknown",
          project: r.project_id ?? undefined,
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

export async function fetchOpenAIUsage(
  params: BillingQueryParams,
): Promise<BillingUsageRow[]> {
  const canFetchCosts = params.bucketWidth === "1d";

  const [costRows, tokenRows] = await Promise.all([
    canFetchCosts
      ? fetchCosts(params).catch((err) => {
          console.warn("[billing] OpenAI cost fetch failed:", err.message);
          return [] as BillingUsageRow[];
        })
      : Promise.resolve([] as BillingUsageRow[]),
    fetchTokenUsage(params).catch((err) => {
      console.warn("[billing] OpenAI token usage fetch failed:", err.message);
      return [] as BillingUsageRow[];
    }),
  ]);

  return mergeCostAndTokenRows(costRows, tokenRows);
}
