import { ObjectId, ReadPreference } from "mongodb";
import { getDb } from "../config/database";
import { env, type BatchDbConfig } from "../config/env";
import {
  buildConversationCustomerReport,
  type ConversationCustomerRow,
} from "./conversationCustomerReport";
import { resolveCustomersByPartnerId } from "./customerSearch";
import type { QueryRequest } from "./queryBuilder";

export interface BatchConversationWorkflowRequest {
  batchDbName: string;
  partnerId?: string;
  dateRange: {
    start: string;
    end: string;
  };
  chunkOptions?: {
    customerBatchSize?: number;
    channelChunkSize?: number;
    maxWorkers?: number;
    pauseMs?: number;
    maxRetries?: number;
  };
  filters?: {
    customerIds?: string[];
    channelIds?: string[];
  };
  includeTotal?: boolean;
  rowLimit?: number;
}

interface DateWindow {
  start: Date;
  end: Date;
  isLast: boolean;
}

interface WorkflowTask {
  chunkId: string;
  request: QueryRequest;
}

class ChunkRetryError extends Error {
  attempts: number;

  constructor(message: string, attempts: number) {
    super(message);
    this.name = "ChunkRetryError";
    this.attempts = attempts;
  }
}

interface FailedChunkMeta {
  chunkId: string;
  attempts: number;
  reason: string;
}

interface WindowPlanItem {
  start: string;
  end: string;
}

export interface BatchConversationWorkflowResponse {
  rows: ConversationCustomerRow[];
  pageSize: number;
  hasMore: boolean;
  total?: number;
  meta: {
    batchDbName: string;
    partnerId?: string;
    memberCount: number;
    processedChunks: number;
    failedChunks: FailedChunkMeta[];
    elapsedMs: number;
    executionPlan: {
      strategy: "monthly_window_forced";
      windowCount: number;
      windows: WindowPlanItem[];
      customerBatchSize: number;
      channelChunkSize: number;
      maxWorkers: number;
      pauseMs: number;
      maxRetries: number;
      estimatedTasks: number;
    };
  };
}

function parseDate(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid datetime string`);
  }
  return parsed;
}

function splitByMonth(start: Date, end: Date): DateWindow[] {
  const windows: DateWindow[] = [];

  let cursor = new Date(start.getTime());
  while (cursor < end) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    const windowEnd = next < end ? next : end;

    windows.push({
      start: new Date(cursor.getTime()),
      end: new Date(windowEnd.getTime()),
      isLast: windowEnd.getTime() === end.getTime(),
    });

    cursor = windowEnd;
  }

  if (windows.length === 0) {
    windows.push({ start, end, isLast: true });
  }

  return windows;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeChunkOptions(request: BatchConversationWorkflowRequest): {
  customerBatchSize: number;
  channelChunkSize: number;
  maxWorkers: number;
  pauseMs: number;
  maxRetries: number;
} {
  return {
    customerBatchSize: Math.max(1, Math.min(request.chunkOptions?.customerBatchSize ?? 200, 500)),
    channelChunkSize: Math.max(1, Math.min(request.chunkOptions?.channelChunkSize ?? 25, 100)),
    maxWorkers: Math.max(1, Math.min(request.chunkOptions?.maxWorkers ?? 1, 2)),
    pauseMs: Math.max(0, Math.min(request.chunkOptions?.pauseMs ?? 200, 5000)),
    maxRetries: Math.max(0, Math.min(request.chunkOptions?.maxRetries ?? 2, 5)),
  };
}

function normalizeId(value: unknown): string {
  if (value instanceof ObjectId) {
    return value.toHexString();
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function toWindowEndIso(window: DateWindow): string {
  if (window.isLast) {
    return window.end.toISOString();
  }

  return new Date(window.end.getTime() - 1).toISOString();
}

function buildStringOrObjectIdCandidates(values: string[]): Array<string | ObjectId> {
  const result: Array<string | ObjectId> = [];

  for (const value of values) {
    result.push(value);
    if (ObjectId.isValid(value)) {
      result.push(new ObjectId(value));
    }
  }

  return result;
}

function buildRowKey(row: ConversationCustomerRow): string {
  return [row.occurredAt, row.channel, row.sessionId, row.customerId, row.questionText].join("::");
}

function getBatchDbConfig(batchDbName: string): BatchDbConfig {
  const dbName = batchDbName.trim();
  if (!dbName) {
    throw new Error("batchDbName is required");
  }

  const found = env.batchDbConfigs.find((item) => item.dbName === dbName);
  if (!found) {
    throw new Error(`Unknown batchDbName: ${dbName}`);
  }

  return found;
}

async function resolveCustomerScope(
  batchConfig: BatchDbConfig,
  start: Date,
  end: Date,
  request: BatchConversationWorkflowRequest
): Promise<{ partnerId?: string; customerIds: string[] }> {
  const partnerId = request.partnerId?.trim();
  const explicitCustomerIds = (request.filters?.customerIds ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (explicitCustomerIds.length > 0) {
    return {
      partnerId,
      customerIds: Array.from(new Set(explicitCustomerIds)),
    };
  }

  if (partnerId) {
    const resolved = await resolveCustomersByPartnerId(partnerId);
    return {
      partnerId,
      customerIds: resolved.customerIds,
    };
  }

  const batchDb = await getDb(batchConfig.dbName);
  const channelIds = (request.filters?.channelIds ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const match: Record<string, unknown> = {
    createdAt: {
      $gte: start,
      $lte: end,
    },
  };

  if (channelIds.length > 0) {
    match.channel = {
      $in: buildStringOrObjectIdCandidates(channelIds),
    };
  }

  const creators = (await batchDb
    .collection(batchConfig.collections.chats)
    .distinct("creator", match, {
      maxTimeMS: env.QUERY_TIMEOUT_MS,
      readPreference: ReadPreference.SECONDARY_PREFERRED,
    })) as unknown[];

  return {
    partnerId,
    customerIds: Array.from(
      new Set(
        creators
          .map((value) => normalizeId(value))
          .filter((value) => value.length > 0)
      )
    ),
  };
}

async function listBatchCustomerChannels(
  batchConfig: BatchDbConfig,
  customerId: string,
  start: Date,
  end: Date,
  request: BatchConversationWorkflowRequest
): Promise<string[]> {
  const batchDb = await getDb(batchConfig.dbName);

  const match: Record<string, unknown> = {
    creator: {
      $in: buildStringOrObjectIdCandidates([customerId]),
    },
    createdAt: {
      $gte: start,
      $lte: end,
    },
  };

  const filterChannelIds = (request.filters?.channelIds ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (filterChannelIds.length > 0) {
    match.channel = {
      $in: buildStringOrObjectIdCandidates(filterChannelIds),
    };
  }

  const channelValues = (await batchDb
    .collection(batchConfig.collections.chats)
    .distinct("channel", match, {
      maxTimeMS: env.QUERY_TIMEOUT_MS,
      readPreference: ReadPreference.SECONDARY_PREFERRED,
    })) as unknown[];

  return Array.from(
    new Set(
      channelValues
        .map((value) => normalizeId(value))
        .filter((value) => value.length > 0)
    )
  );
}

async function runTaskWithRetry(
  task: WorkflowTask,
  maxRetries: number,
  batchConfig: BatchDbConfig
): Promise<{
  rows: ConversationCustomerRow[];
  hasMore: boolean;
  attempts: number;
}> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      const report = await buildConversationCustomerReport(task.request, {
        dbName: batchConfig.dbName,
        collections: {
          chats: batchConfig.collections.chats,
          usagelogs: batchConfig.collections.usagelogs,
          botchats: batchConfig.collections.botchats,
        },
      });

      return {
        rows: report.rows,
        hasMore: report.hasMore,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt > maxRetries) {
        break;
      }
      await sleep(300 * attempt);
    }
  }

  throw new ChunkRetryError(
    lastError instanceof Error ? lastError.message : "task_failed",
    attempt
  );
}

async function enrichRows(
  rows: ConversationCustomerRow[],
  batchConfig: BatchDbConfig
): Promise<ConversationCustomerRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const prodDb = await getDb("prod");
  const customerIds = Array.from(new Set(rows.map((row) => row.customerId).filter(Boolean)));
  const channelIds = Array.from(new Set(rows.map((row) => row.channel).filter(Boolean)));

  const customerCandidates = buildStringOrObjectIdCandidates(customerIds);
  const channelCandidates = buildStringOrObjectIdCandidates(channelIds);
  const objectIdChannelCandidates = channelCandidates.filter((v) => v instanceof ObjectId) as ObjectId[];

  const users = await prodDb
    .collection(batchConfig.collections.users)
    .find(
      {
        $expr: {
          $in: [{ $toString: "$_id" }, customerIds],
        },
      },
      {
        projection: { _id: 1, name: 1, email: 1 },
        maxTimeMS: env.QUERY_TIMEOUT_MS,
        readPreference: ReadPreference.SECONDARY_PREFERRED,
      }
    )
    .toArray();

  const orConditions = [];
  if (objectIdChannelCandidates.length > 0) {
    orConditions.push({ _id: { $in: objectIdChannelCandidates } });
  }
  orConditions.push({ channel: { $in: channelCandidates } });

  const channels = await prodDb
    .collection(batchConfig.collections.channels)
    .find(
      {
        $or: orConditions,
      },
      {
        projection: { _id: 1, channel: 1, name: 1, displayName: 1, title: 1 },
        maxTimeMS: env.QUERY_TIMEOUT_MS,
        readPreference: ReadPreference.SECONDARY_PREFERRED,
      }
    )
    .toArray();

  const customerNameById = new Map<string, string>();
  for (const user of users) {
    const userObj = user as Record<string, unknown>;
    const id = normalizeId(userObj._id);
    const name = typeof userObj.name === "string" && userObj.name.trim().length > 0
      ? userObj.name.trim()
      : typeof userObj.email === "string"
        ? userObj.email.trim()
        : "";

    if (id && name) {
      customerNameById.set(id, name);
    }
  }

  const channelNameById = new Map<string, string>();
  for (const channel of channels) {
    const channelObj = channel as Record<string, unknown>;
    const ids = [normalizeId(channelObj._id), normalizeId(channelObj.channel)].filter(Boolean);
    const nameCandidate = [
      channelObj.displayName,
      channelObj.name,
      channelObj.title,
    ].find((value) => typeof value === "string" && value.trim().length > 0) as string | undefined;

    if (!nameCandidate) {
      continue;
    }

    const resolvedName = nameCandidate.trim();
    for (const id of ids) {
      channelNameById.set(id, resolvedName);
    }
  }

  return rows.map((row) => ({
    ...row,
    customerName: customerNameById.get(row.customerId) ?? "",
    channelName: channelNameById.get(row.channel) ?? "",
  }));
}

export async function runBatchConversationWorkflow(
  request: BatchConversationWorkflowRequest
): Promise<BatchConversationWorkflowResponse> {
  const startedAt = Date.now();

  const start = parseDate(request.dateRange.start, "dateRange.start");
  const end = parseDate(request.dateRange.end, "dateRange.end");
  if (start.getTime() > end.getTime()) {
    throw new Error("dateRange.start must be before or equal to dateRange.end");
  }

  const rowLimit = Math.max(1, Math.min(request.rowLimit ?? env.MAX_EXPORT_ROWS, env.MAX_EXPORT_ROWS));
  const chunkOptions = normalizeChunkOptions(request);
  const windows = splitByMonth(start, end);
  const batchConfig = getBatchDbConfig(request.batchDbName);

  const customerScope = await resolveCustomerScope(batchConfig, start, end, request);
  const customerBatches = chunkArray(customerScope.customerIds, chunkOptions.customerBatchSize);

  const channelMap = new Map<string, string[]>();
  for (const customerId of customerScope.customerIds) {
    const channels = await listBatchCustomerChannels(batchConfig, customerId, start, end, request);
    channelMap.set(customerId, channels);
  }

  const tasks: WorkflowTask[] = [];

  for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
    const window = windows[windowIndex];

    for (let batchIndex = 0; batchIndex < customerBatches.length; batchIndex += 1) {
      const customerBatch = customerBatches[batchIndex];

      for (const customerId of customerBatch) {
        const channels = channelMap.get(customerId) ?? [];
        const channelGroups = channels.length > 0
          ? chunkArray(channels, chunkOptions.channelChunkSize)
          : [[]];

        for (let groupIndex = 0; groupIndex < channelGroups.length; groupIndex += 1) {
          const channelGroup = channelGroups[groupIndex];

          if (channelGroup.length === 0) {
            tasks.push({
              chunkId: `${windowIndex + 1}/${windows.length}-${batchIndex + 1}/${customerBatches.length}-${customerId}-all`,
              request: {
                dataType: "conversations",
                customerId,
                dateRange: {
                  start: window.start.toISOString(),
                  end: toWindowEndIso(window),
                },
                includeSessionMessages: true,
                reportMode: "customer",
                sortOrder: "asc",
                matchWindowSec: 60,
                pageSize: env.MAX_EXPORT_ROWS,
                includeTotal: request.includeTotal,
              },
            });
            continue;
          }

          for (let channelIndex = 0; channelIndex < channelGroup.length; channelIndex += 1) {
            const channel = channelGroup[channelIndex];
            tasks.push({
              chunkId: `${windowIndex + 1}/${windows.length}-${batchIndex + 1}/${customerBatches.length}-${customerId}-${groupIndex + 1}/${channelGroups.length}-c${channelIndex + 1}/${channelGroup.length}`,
              request: {
                dataType: "conversations",
                customerId,
                dateRange: {
                  start: window.start.toISOString(),
                  end: toWindowEndIso(window),
                },
                filters: {
                  channel,
                },
                includeSessionMessages: true,
                reportMode: "customer",
                sortOrder: "asc",
                matchWindowSec: 60,
                pageSize: env.MAX_EXPORT_ROWS,
                includeTotal: request.includeTotal,
              },
            });
          }
        }
      }
    }
  }

  const rowMap = new Map<string, ConversationCustomerRow>();
  const failedChunks: FailedChunkMeta[] = [];
  let processedChunks = 0;
  let hasMore = false;
  let total = 0;

  let nextTaskIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;

      if (taskIndex >= tasks.length) {
        return;
      }

      const task = tasks[taskIndex];
      processedChunks += 1;

      if (rowMap.size >= rowLimit) {
        hasMore = true;
        continue;
      }

      try {
        const result = await runTaskWithRetry(task, chunkOptions.maxRetries, batchConfig);
        total += result.rows.length;
        if (result.hasMore) {
          hasMore = true;
        }

        for (const row of result.rows) {
          const rowKey = buildRowKey(row);
          if (!rowMap.has(rowKey)) {
            rowMap.set(rowKey, row);
          }

          if (rowMap.size >= rowLimit) {
            hasMore = true;
            break;
          }
        }
      } catch (error) {
        failedChunks.push({
          chunkId: task.chunkId,
          attempts: error instanceof ChunkRetryError ? error.attempts : chunkOptions.maxRetries + 1,
          reason: error instanceof Error ? error.message : "task_failed",
        });
      }

      await sleep(chunkOptions.pauseMs);
    }
  }

  await Promise.all(Array.from({ length: chunkOptions.maxWorkers }, () => worker()));

  const rows = await enrichRows(
    Array.from(rowMap.values())
      .sort((left, right) => {
        if (left.occurredAt === right.occurredAt) {
          return buildRowKey(left).localeCompare(buildRowKey(right));
        }

        return left.occurredAt.localeCompare(right.occurredAt);
      })
      .slice(0, rowLimit),
    batchConfig
  );

  return {
    rows,
    pageSize: rowLimit,
    hasMore,
    total: request.includeTotal ? total : undefined,
    meta: {
      batchDbName: batchConfig.dbName,
      partnerId: customerScope.partnerId,
      memberCount: customerScope.customerIds.length,
      processedChunks,
      failedChunks,
      elapsedMs: Date.now() - startedAt,
      executionPlan: {
        strategy: "monthly_window_forced",
        windowCount: windows.length,
        windows: windows.map((window) => ({
          start: window.start.toISOString(),
          end: window.end.toISOString(),
        })),
        customerBatchSize: chunkOptions.customerBatchSize,
        channelChunkSize: chunkOptions.channelChunkSize,
        maxWorkers: chunkOptions.maxWorkers,
        pauseMs: chunkOptions.pauseMs,
        maxRetries: chunkOptions.maxRetries,
        estimatedTasks: tasks.length,
      },
    },
  };
}
