import { env } from "../config/env";
import { listCustomerChannels } from "./customerChannels";
import {
  buildConversationCustomerReport,
  type ConversationCustomerRow,
} from "./conversationCustomerReport";
import { resolveCustomersByPartnerId } from "./customerSearch";
import type { QueryFilterValue, QueryRequest } from "./queryBuilder";

export interface PartnerConversationWorkflowRequest {
  partnerId: string;
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
  filters?: Record<string, QueryFilterValue | undefined>;
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

interface FailedChunkMeta {
  chunkId: string;
  attempts: number;
  reason: string;
}

interface WindowPlanItem {
  start: string;
  end: string;
}

export interface PartnerConversationWorkflowResponse {
  rows: ConversationCustomerRow[];
  pageSize: number;
  hasMore: boolean;
  total?: number;
  meta: {
    partnerId: string;
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

function normalizeChunkOptions(request: PartnerConversationWorkflowRequest): {
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

async function runTaskWithRetry(task: WorkflowTask, maxRetries: number): Promise<{
  rows: ConversationCustomerRow[];
  hasMore: boolean;
  attempts: number;
}> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      const report = await buildConversationCustomerReport(task.request);
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

  throw new Error(lastError instanceof Error ? lastError.message : "task_failed");
}

function buildRowKey(row: ConversationCustomerRow): string {
  return [row.occurredAt, row.channel, row.sessionId, row.customerId, row.questionText].join("::");
}

export async function runPartnerConversationWorkflow(
  request: PartnerConversationWorkflowRequest
): Promise<PartnerConversationWorkflowResponse> {
  const startedAt = Date.now();

  const partnerId = request.partnerId.trim();
  if (!partnerId) {
    throw new Error("partnerId is required");
  }

  const start = parseDate(request.dateRange.start, "dateRange.start");
  const end = parseDate(request.dateRange.end, "dateRange.end");
  if (start.getTime() > end.getTime()) {
    throw new Error("dateRange.start must be before or equal to dateRange.end");
  }

  const rowLimit = Math.max(1, Math.min(request.rowLimit ?? env.MAX_EXPORT_ROWS, env.MAX_EXPORT_ROWS));
  const chunkOptions = normalizeChunkOptions(request);
  const windows = splitByMonth(start, end);

  const resolvedCustomers = await resolveCustomersByPartnerId(partnerId);
  const customerBatches = chunkArray(resolvedCustomers.customerIds, chunkOptions.customerBatchSize);

  const channelMap = new Map<string, string[]>();
  for (const customerId of resolvedCustomers.customerIds) {
    const channels = await listCustomerChannels("conversations", customerId);
    channelMap.set(customerId, channels.map((channel) => channel.channelId));
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
                  end: window.end.toISOString(),
                },
                filters: request.filters,
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
                  end: window.isLast ? window.end.toISOString() : new Date(window.end.getTime() - 1).toISOString(),
                },
                filters: {
                  ...(request.filters ?? {}),
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
        const result = await runTaskWithRetry(task, chunkOptions.maxRetries);
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
          attempts: chunkOptions.maxRetries + 1,
          reason: error instanceof Error ? error.message : "task_failed",
        });
      }

      await sleep(chunkOptions.pauseMs);
    }
  }

  await Promise.all(Array.from({ length: chunkOptions.maxWorkers }, () => worker()));

  const rows = Array.from(rowMap.values())
    .sort((left, right) => {
      if (left.occurredAt === right.occurredAt) {
        return buildRowKey(left).localeCompare(buildRowKey(right));
      }

      return left.occurredAt.localeCompare(right.occurredAt);
    })
    .slice(0, rowLimit);

  return {
    rows,
    pageSize: rowLimit,
    hasMore,
    total: request.includeTotal ? total : undefined,
    meta: {
      partnerId,
      memberCount: resolvedCustomers.customerIds.length,
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
        estimatedTasks: tasks.length,
      },
    },
  };
}
