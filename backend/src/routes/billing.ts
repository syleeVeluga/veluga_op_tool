import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { fetchAnthropicUsage, fetchAnthropicWorkspaces } from "../services/anthropicUsage";
import { fetchOpenAIUsage, fetchOpenAIProjects } from "../services/openaiUsage";
import type { BillingPlatform, BillingUsageRow } from "../types/billing";

export const billingRouter = Router();

const billingQuerySchema = z.object({
  platform: z.enum(["openai", "anthropic"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  bucketWidth: z.enum(["1h", "1d", "1M"]).default("1d"),
  groupBy: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
});

function aggregateByMonth(rows: BillingUsageRow[]): BillingUsageRow[] {
  const map = new Map<string, BillingUsageRow>();

  for (const row of rows) {
    const month = row.date.slice(0, 7); // "2026-03"
    const key = `${month}|${row.platform}|${row.model}|${row.project ?? ""}|${row.apiKeyId ?? ""}`;
    const existing = map.get(key);

    if (existing) {
      existing.inputTokens += row.inputTokens;
      existing.outputTokens += row.outputTokens;
      existing.totalTokens += row.totalTokens;
      existing.costUsd += row.costUsd;
    } else {
      map.set(key, { ...row, date: `${month}-01T00:00:00.000Z` });
    }
  }

  return [...map.values()];
}

const PLATFORM_LABELS: Record<BillingPlatform, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

function getAdminApiKey(platform: BillingPlatform): string | undefined {
  return platform === "openai"
    ? env.OPENAI_ADMIN_API_KEY
    : env.ANTHROPIC_ADMIN_API_KEY;
}

billingRouter.get("/projects", async (req, res) => {
  const platform = req.query.platform as string;
  if (platform !== "openai" && platform !== "anthropic") {
    res.status(400).json({ error: "invalid_request", message: "platform must be openai or anthropic" });
    return;
  }

  if (!getAdminApiKey(platform)) {
    res.status(400).json({
      error: "missing_api_key",
      message: `${PLATFORM_LABELS[platform]} Admin API key is not configured`,
    });
    return;
  }

  try {
    const projects = platform === "openai"
      ? await fetchOpenAIProjects()
      : await fetchAnthropicWorkspaces();
    res.status(200).json({ projects });
  } catch (error) {
    res.status(502).json({
      error: "upstream_error",
      message: `Failed to fetch ${PLATFORM_LABELS[platform]} projects`,
      details: error instanceof Error ? error.message : "unknown error",
    });
  }
});

billingRouter.post("/usage", async (req, res) => {
  const parsed = billingQuerySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_request",
      message: "Invalid billing query",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { platform } = parsed.data;

  if (!getAdminApiKey(platform)) {
    res.status(400).json({
      error: "missing_api_key",
      message: `${PLATFORM_LABELS[platform]} Admin API key is not configured`,
    });
    return;
  }

  try {
    const isMonthly = parsed.data.bucketWidth === "1M";
    const apiBucketWidth: "1h" | "1d" = isMonthly ? "1d" : parsed.data.bucketWidth as "1h" | "1d";
    const fetchParams = { ...parsed.data, bucketWidth: apiBucketWidth };

    const fetchFn = platform === "openai" ? fetchOpenAIUsage : fetchAnthropicUsage;
    const rawRows = await fetchFn(fetchParams);
    const rows = isMonthly ? aggregateByMonth(rawRows) : rawRows;

    res.status(200).json({
      rows,
      platform,
      queriedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(502).json({
      error: "upstream_error",
      message: `Failed to fetch ${PLATFORM_LABELS[platform]} billing data`,
      details: error instanceof Error ? error.message : "unknown error",
    });
  }
});
