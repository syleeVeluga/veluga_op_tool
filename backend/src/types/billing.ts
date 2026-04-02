export type BillingPlatform = "openai" | "anthropic";

export interface BillingQueryParams {
  platform: BillingPlatform;
  startDate: string;
  endDate: string;
  bucketWidth: "1h" | "1d";
  groupBy?: string[];
  projectIds?: string[];
}

export interface BillingUsageRow {
  platform: BillingPlatform;
  date: string;
  model: string;
  project?: string;
  apiKeyId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface BillingQueryResponse {
  rows: BillingUsageRow[];
  platform: BillingPlatform;
  queriedAt: string;
}

export interface BillingProject {
  id: string;
  name: string;
}
