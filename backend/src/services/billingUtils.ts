import type { BillingUsageRow } from "../types/billing";

/**
 * Generic cursor-based pagination fetcher for billing APIs.
 * Both OpenAI and Anthropic use { has_more, next_page } pagination.
 */
export async function fetchAllPages<T extends { has_more: boolean; next_page: string | null }>(
  buildUrl: (page?: string) => string,
  headers: Record<string, string>,
  label: string,
): Promise<T[]> {
  const pages: T[] = [];
  let page: string | undefined;

  for (let i = 0; i < 50; i++) {
    const url = buildUrl(page);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${label} API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as T;
    pages.push(data);

    if (!data.has_more || !data.next_page) break;
    page = data.next_page;
  }

  return pages;
}

/**
 * Merges cost and token-usage rows:
 * 1. Token rows that match cost data get proportional costUsd assigned
 * 2. Cost rows with NO matching token data are preserved as-is (images, web search, etc.)
 */
export function mergeCostAndTokenRows(
  costRows: BillingUsageRow[],
  tokenRows: BillingUsageRow[],
): BillingUsageRow[] {
  if (costRows.length === 0) return tokenRows;
  if (tokenRows.length === 0) return costRows;

  // Build token totals per date+project
  const tokenTotals = new Map<string, number>();
  for (const tr of tokenRows) {
    const key = `${tr.date}|${tr.project ?? ""}`;
    tokenTotals.set(key, (tokenTotals.get(key) ?? 0) + tr.totalTokens);
  }

  // Build cost totals per date+project and track which keys have token matches
  const costByKey = new Map<string, number>();
  for (const cr of costRows) {
    const key = `${cr.date}|${cr.project ?? ""}`;
    costByKey.set(key, (costByKey.get(key) ?? 0) + cr.costUsd);
  }

  // Distribute costs proportionally to token rows where matches exist
  const matchedKeys = new Set<string>();
  for (const tr of tokenRows) {
    const key = `${tr.date}|${tr.project ?? ""}`;
    const totalCost = costByKey.get(key);
    const total = tokenTotals.get(key);
    if (totalCost && total && total > 0) {
      tr.costUsd = (totalCost * tr.totalTokens) / total;
      matchedKeys.add(key);
    }
  }

  // Collect cost rows that had NO matching token rows (images, web search, audio, etc.)
  const unmatchedCostRows = costRows.filter((cr) => {
    const key = `${cr.date}|${cr.project ?? ""}`;
    return !matchedKeys.has(key);
  });

  return [...tokenRows, ...unmatchedCostRows];
}
