import type { BillingUsageRow } from "../types/billing";

function normalizeMergeLabel(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

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
 * Merges cost and token-usage rows in two phases:
 * 1. Exact match: Cost rows that match token rows by date+project+model get proportional costUsd assigned
 * 2. Fallback: Remaining cost rows (e.g. OpenAI line_items that don't have exact model IDs) are distributed
 *    proportionally to ALL token rows in the same date+project bucket
 * 3. Unmatched: Cost rows with no token data at all are preserved as-is
 */
export function mergeCostAndTokenRows(
  costRows: BillingUsageRow[],
  tokenRows: BillingUsageRow[],
): BillingUsageRow[] {
  if (costRows.length === 0) return tokenRows;
  if (tokenRows.length === 0) return costRows;

  // Build token totals per date+project+model for Phase 1 (exact match).
  const tokenTotals = new Map<string, number>();
  const tokenRowsByKey = new Map<string, BillingUsageRow[]>();
  for (const tr of tokenRows) {
    const key = `${tr.date}|${tr.project ?? ""}|${normalizeMergeLabel(tr.model)}`;
    tokenTotals.set(key, (tokenTotals.get(key) ?? 0) + tr.totalTokens);
    const existing = tokenRowsByKey.get(key);
    if (existing) {
      existing.push(tr);
    } else {
      tokenRowsByKey.set(key, [tr]);
    }
  }

  // Also build token totals per date+project for Phase 2 (fallback).
  const tokenTotalsByDateProject = new Map<string, number>();
  const tokenRowsByDateProject = new Map<string, BillingUsageRow[]>();
  for (const tr of tokenRows) {
    const key = `${tr.date}|${tr.project ?? ""}`;
    tokenTotalsByDateProject.set(key, (tokenTotalsByDateProject.get(key) ?? 0) + tr.totalTokens);
    const existing = tokenRowsByDateProject.get(key);
    if (existing) {
      existing.push(tr);
    } else {
      tokenRowsByDateProject.set(key, [tr]);
    }
  }

  const unmatchedCostRows: BillingUsageRow[] = [];

  // Phase 1: Exact match by date+project+model
  for (const cr of costRows) {
    const key = `${cr.date}|${cr.project ?? ""}|${normalizeMergeLabel(cr.model)}`;
    const matchingTokenRows = tokenRowsByKey.get(key);
    const totalTokens = tokenTotals.get(key) ?? 0;

    if (!matchingTokenRows?.length || totalTokens <= 0) {
      unmatchedCostRows.push(cr);
      continue;
    }

    for (const tr of matchingTokenRows) {
      tr.costUsd += (cr.costUsd * tr.totalTokens) / totalTokens;
    }
  }

  // Phase 2: Fallback — distribute unmatched cost rows to all tokens in the same date+project
  const stillUnmatchedCostRows: BillingUsageRow[] = [];
  for (const cr of unmatchedCostRows) {
    const key = `${cr.date}|${cr.project ?? ""}`;
    const matchingTokenRows = tokenRowsByDateProject.get(key);
    const totalTokens = tokenTotalsByDateProject.get(key) ?? 0;

    if (!matchingTokenRows?.length || totalTokens <= 0) {
      stillUnmatchedCostRows.push(cr);
      continue;
    }

    for (const tr of matchingTokenRows) {
      tr.costUsd += (cr.costUsd * tr.totalTokens) / totalTokens;
    }
  }

  return [...tokenRows, ...stillUnmatchedCostRows];
}
