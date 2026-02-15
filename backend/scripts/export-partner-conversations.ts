import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../src/config/env";
import { closeMongoConnection } from "../src/config/database";
import { listCustomerChannels } from "../src/services/customerChannels";
import {
  buildConversationCustomerReport,
  type ConversationCustomerRow,
} from "../src/services/conversationCustomerReport";
import { resolveCustomersByPartnerId } from "../src/services/customerSearch";
import type { QueryRequest } from "../src/services/queryBuilder";

interface ScriptOptions {
  partnerId: string;
  start: string;
  end: string;
  outputDir: string;
  customerBatchSize: number;
  channelChunkSize: number;
  maxWorkers: number;
  includeTotal: boolean;
  pauseMs: number;
  maxRetries: number;
  resumeOccurredAt?: string;
  resumeRowId?: string;
}

interface DateWindow {
  start: Date;
  end: Date;
}

interface FailedChunk {
  chunkId: string;
  reason: string;
  attempts: number;
}

interface ExportTask {
  chunkId: string;
  request: QueryRequest;
}

interface SummaryReport {
  requestedAt: string;
  partnerId: string;
  dateRange: {
    start: string;
    end: string;
  };
  options: Omit<ScriptOptions, "partnerId" | "start" | "end" | "outputDir">;
  memberCount: number;
  processedChunks: number;
  failedChunks: FailedChunk[];
  resultCount: number;
  elapsedMs: number;
  status: "success" | "partial" | "failed";
  outputFile: string;
  summaryFile: string;
}

function parseBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (!raw) {
    return defaultValue;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseInteger(raw: string | undefined, defaultValue: number, min: number, max: number): number {
  if (!raw) {
    return defaultValue;
  }

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Expected integer but received: ${raw}`);
  }

  return Math.max(min, Math.min(max, value));
}

function parseArgs(argv: string[]): ScriptOptions {
  const map = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      map.set(key, "true");
      continue;
    }

    map.set(key, nextToken);
    index += 1;
  }

  const partnerId = (map.get("partnerId") ?? "").trim();
  const start = (map.get("start") ?? "").trim();
  const end = (map.get("end") ?? "").trim();

  if (!partnerId || !start || !end) {
    throw new Error("Usage: --partnerId <id> --start <ISO> --end <ISO>");
  }

  return {
    partnerId,
    start,
    end,
    outputDir: (map.get("outputDir") ?? "reports").trim(),
    customerBatchSize: parseInteger(map.get("customerBatchSize"), 200, 1, 500),
    channelChunkSize: parseInteger(map.get("channelChunkSize"), 25, 1, 100),
    maxWorkers: parseInteger(map.get("maxWorkers"), 1, 1, 2),
    includeTotal: parseBoolean(map.get("includeTotal"), false),
    pauseMs: parseInteger(map.get("pauseMs"), 200, 0, 5000),
    maxRetries: parseInteger(map.get("maxRetries"), 2, 0, 5),
    resumeOccurredAt: map.get("resumeOccurredAt")?.trim() || undefined,
    resumeRowId: map.get("resumeRowId")?.trim() || undefined,
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function splitByMonth(start: Date, end: Date): DateWindow[] {
  const windows: DateWindow[] = [];

  let cursor = new Date(start.getTime());
  while (cursor < end) {
    const nextMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    const windowEnd = nextMonth < end ? nextMonth : end;
    windows.push({ start: new Date(cursor.getTime()), end: new Date(windowEnd.getTime()) });
    cursor = windowEnd;
  }

  if (windows.length === 0) {
    windows.push({ start, end });
  }

  return windows;
}

function buildRowId(row: ConversationCustomerRow): string {
  return [row.occurredAt, row.channel, row.sessionId, row.customerId].join("::");
}

function shouldSkipByResumeCursor(
  row: ConversationCustomerRow,
  resumeOccurredAt: string | undefined,
  resumeRowId: string | undefined,
): boolean {
  if (!resumeOccurredAt) {
    return false;
  }

  if (row.occurredAt < resumeOccurredAt) {
    return true;
  }

  if (row.occurredAt > resumeOccurredAt) {
    return false;
  }

  if (!resumeRowId) {
    return true;
  }

  return buildRowId(row) <= resumeRowId;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runChunkWithRetry(
  request: QueryRequest,
  maxRetries: number,
): Promise<{ rows: ConversationCustomerRow[]; truncated: boolean; attempts: number }> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      const report = await buildConversationCustomerReport(request);
      return {
        rows: report.rows,
        truncated: report.hasMore,
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

  throw new Error(lastError instanceof Error ? lastError.message : "Unknown chunk failure");
}

async function run(): Promise<void> {
  const startedAt = Date.now();
  const options = parseArgs(process.argv.slice(2));

  const started = new Date(options.start);
  const ended = new Date(options.end);

  if (Number.isNaN(started.getTime()) || Number.isNaN(ended.getTime())) {
    throw new Error("start/end must be valid ISO datetime");
  }

  if (started.getTime() > ended.getTime()) {
    throw new Error("start must be before or equal to end");
  }

  const outputDir = path.resolve(process.cwd(), options.outputDir);
  await mkdir(outputDir, { recursive: true });

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const safePartnerId = options.partnerId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outputFile = path.join(outputDir, `partner-conversations-${safePartnerId}-${stamp}.ndjson`);
  const summaryFile = path.join(outputDir, `partner-conversations-${safePartnerId}-${stamp}.summary.json`);

  const resolved = await resolveCustomersByPartnerId(options.partnerId);
  const windows = splitByMonth(started, ended);
  const customerBatches = chunkArray(resolved.customerIds, options.customerBatchSize);

  const failedChunks: FailedChunk[] = [];
  const allRows: Array<ConversationCustomerRow & { _rowId: string; _chunkId: string }> = [];
  let processedChunks = 0;
  const tasks: ExportTask[] = [];

  console.log("[partner-export] partnerId=%s members=%d windows=%d customerBatches=%d maxWorkers=%d",
    options.partnerId,
    resolved.customerIds.length,
    windows.length,
    customerBatches.length,
    options.maxWorkers,
  );

  for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
    const window = windows[windowIndex];

    for (let batchIndex = 0; batchIndex < customerBatches.length; batchIndex += 1) {
      const customerBatch = customerBatches[batchIndex];

      for (const customerId of customerBatch) {
        const channels = await listCustomerChannels("conversations", customerId);
        const channelIds = channels.map((channel) => channel.channelId);
        const channelGroups = channelIds.length > 0
          ? chunkArray(channelIds, options.channelChunkSize)
          : [[]];

        for (let groupIndex = 0; groupIndex < channelGroups.length; groupIndex += 1) {
          const channelGroup = channelGroups[groupIndex];
          if (channelGroup.length === 0) {
            tasks.push({
              chunkId: `${windowIndex + 1}/${windows.length}-${batchIndex + 1}/${customerBatches.length}-${customerId}-${groupIndex + 1}/${channelGroups.length}-all`,
              request: {
                dataType: "conversations",
                customerId,
                dateRange: {
                  start: window.start.toISOString(),
                  end: window.end.toISOString(),
                },
                includeSessionMessages: true,
                reportMode: "customer",
                sortOrder: "asc",
                matchWindowSec: 60,
                pageSize: env.MAX_EXPORT_ROWS,
                includeTotal: options.includeTotal,
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
                  end: window.end.toISOString(),
                },
                filters: { channel },
                includeSessionMessages: true,
                reportMode: "customer",
                sortOrder: "asc",
                matchWindowSec: 60,
                pageSize: env.MAX_EXPORT_ROWS,
                includeTotal: options.includeTotal,
              },
            });
          }
        }
      }
    }
  }

  console.log("[partner-export] preparedTasks=%d", tasks.length);

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

      try {
        const { rows, truncated, attempts } = await runChunkWithRetry(task.request, options.maxRetries);

        if (truncated) {
          failedChunks.push({
            chunkId: task.chunkId,
            reason: "chunk_truncated_hasMore_true",
            attempts,
          });
        }

        for (const row of rows) {
          if (shouldSkipByResumeCursor(row, options.resumeOccurredAt, options.resumeRowId)) {
            continue;
          }

          allRows.push({
            ...row,
            _rowId: buildRowId(row),
            _chunkId: task.chunkId,
          });
        }
      } catch (error) {
        failedChunks.push({
          chunkId: task.chunkId,
          reason: error instanceof Error ? error.message : "unknown_chunk_error",
          attempts: options.maxRetries + 1,
        });
      }

      if (processedChunks % 50 === 0 || processedChunks === tasks.length) {
        console.log("[partner-export] progress=%d/%d", processedChunks, tasks.length);
      }

      await sleep(options.pauseMs);
    }
  }

  await Promise.all(Array.from({ length: options.maxWorkers }, () => worker()));

  allRows.sort((left, right) => {
    if (left.occurredAt === right.occurredAt) {
      return left._rowId.localeCompare(right._rowId);
    }
    return left.occurredAt.localeCompare(right.occurredAt);
  });

  const ndjson = allRows.map((row) => JSON.stringify(row)).join("\n");
  await writeFile(outputFile, ndjson.length > 0 ? `${ndjson}\n` : "", "utf8");

  const elapsedMs = Date.now() - startedAt;
  const summary: SummaryReport = {
    requestedAt: new Date().toISOString(),
    partnerId: options.partnerId,
    dateRange: {
      start: started.toISOString(),
      end: ended.toISOString(),
    },
    options: {
      customerBatchSize: options.customerBatchSize,
      channelChunkSize: options.channelChunkSize,
      maxWorkers: options.maxWorkers,
      includeTotal: options.includeTotal,
      pauseMs: options.pauseMs,
      maxRetries: options.maxRetries,
      resumeOccurredAt: options.resumeOccurredAt,
      resumeRowId: options.resumeRowId,
    },
    memberCount: resolved.customerIds.length,
    processedChunks,
    failedChunks,
    resultCount: allRows.length,
    elapsedMs,
    status: failedChunks.length === 0 ? "success" : allRows.length > 0 ? "partial" : "failed",
    outputFile,
    summaryFile,
  };

  await writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("[partner-export] status=%s rows=%d processedChunks=%d failedChunks=%d elapsedMs=%d",
    summary.status,
    summary.resultCount,
    summary.processedChunks,
    summary.failedChunks.length,
    summary.elapsedMs,
  );
  console.log("[partner-export] output=%s", outputFile);
  console.log("[partner-export] summary=%s", summaryFile);

  await closeMongoConnection();
}

void run().catch(async (error) => {
  console.error("[partner-export] failed", error);
  await closeMongoConnection();
  process.exit(1);
});
