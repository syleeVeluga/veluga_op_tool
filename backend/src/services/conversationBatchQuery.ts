import { ReadPreference, type Document } from "mongodb";
import { env } from "../config/env";
import { getDb } from "../config/database";
import { schemaRegistry } from "../config/schema";
import type { QueryFilterValue } from "./queryBuilder";

export interface ConversationBatchRequest {
  channelIds: string[];
  dateRange: {
    start: string;
    end: string;
  };
  filters?: Record<string, QueryFilterValue | undefined>;
  columns?: string[];
  rowLimit?: number;
  includeTotal?: boolean;
  batch?: {
    channelChunkSize?: number;
  };
}

export interface ConversationBatchResponse {
  rows: Document[];
  hasMore: boolean;
  total?: number;
  meta: {
    channelCount: number;
    channelChunkSize: number;
    timeWindows: number;
    processedChunks: number;
    elapsedMs: number;
  };
}

interface DateWindow {
  start: Date;
  end: Date;
  isLast: boolean;
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFilterConditions(
  filters: Record<string, QueryFilterValue | undefined> | undefined
): Document {
  if (!filters) {
    return {};
  }

  const schema = schemaRegistry.conversations;
  const allowed = new Map(schema.filters.map((filter) => [filter.key, filter]));
  const out: Document = {};

  for (const [key, rawValue] of Object.entries(filters)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    const schemaFilter = allowed.get(key);
    if (!schemaFilter) {
      throw new Error(`Unsupported filter key for conversations: ${key}`);
    }

    if (schemaFilter.type === "search") {
      if (typeof rawValue !== "string") {
        throw new Error(`search filter '${key}' must be a string`);
      }

      out[key] = { $regex: escapeRegex(rawValue), $options: "i" };
      continue;
    }

    if (schemaFilter.type === "select") {
      out[key] = rawValue;
      continue;
    }

    if (schemaFilter.type === "range") {
      if (
        typeof rawValue !== "object" ||
        rawValue === null ||
        Array.isArray(rawValue)
      ) {
        throw new Error(`range filter '${key}' must include min or max`);
      }

      const condition: Document = {};
      if (rawValue.min !== undefined) {
        condition.$gte = rawValue.min;
      }
      if (rawValue.max !== undefined) {
        condition.$lte = rawValue.max;
      }
      out[key] = condition;
    }
  }

  return out;
}

function toProjection(columns: string[] | undefined): Document {
  const defaults = schemaRegistry.conversations.columns.map((column) => column.key);
  const selected = (columns ?? defaults).filter(Boolean);

  return selected.reduce<Document>((acc, key) => {
    acc[key] = 1;
    return acc;
  }, { _id: 1 });
}

function sortRows(rows: Document[]): Document[] {
  return rows.sort((left, right) => {
    const lTs = left.createdAt instanceof Date ? left.createdAt.getTime() : new Date(String(left.createdAt)).getTime();
    const rTs = right.createdAt instanceof Date ? right.createdAt.getTime() : new Date(String(right.createdAt)).getTime();

    if (rTs !== lTs) {
      return rTs - lTs;
    }

    const lId = String(left._id ?? "");
    const rId = String(right._id ?? "");
    if (lId === rId) {
      return 0;
    }
    return rId > lId ? 1 : -1;
  });
}

export async function queryConversationsInBatches(
  request: ConversationBatchRequest
): Promise<ConversationBatchResponse> {
  const startedAt = Date.now();

  const start = parseDate(request.dateRange.start, "dateRange.start");
  const end = parseDate(request.dateRange.end, "dateRange.end");
  if (start > end) {
    throw new Error("dateRange.start must be before or equal to dateRange.end");
  }

  const rowLimit = Math.min(request.rowLimit ?? 100, env.MAX_EXPORT_ROWS);
  const channelChunkSize = Math.min(request.batch?.channelChunkSize ?? 50, 100);

  const windows = splitByMonth(start, end);
  const channelChunks = chunkArray(request.channelIds, channelChunkSize);
  const filterConditions = buildFilterConditions(request.filters);
  const projection = toProjection(request.columns);

  const db = await getDb("prod");
  const collection = db.collection(schemaRegistry.conversations.collection);

  const rowMap = new Map<string, Document>();
  let total = 0;
  let processedChunks = 0;
  let hasMore = false;

  for (const window of windows) {
    for (const chunk of channelChunks) {
      processedChunks += 1;

      const timestampCondition = window.isLast
        ? { $gte: window.start, $lte: window.end }
        : { $gte: window.start, $lt: window.end };

      const match: Document = {
        channel: { $in: chunk },
        createdAt: timestampCondition,
        ...filterConditions,
      };

      if (request.includeTotal) {
        const countResult = await collection
          .aggregate([{ $match: match }, { $count: "total" }], {
            maxTimeMS: env.QUERY_TIMEOUT_MS,
            readPreference: ReadPreference.SECONDARY_PREFERRED,
          })
          .toArray();

        total +=
          countResult.length > 0 && typeof countResult[0]?.total === "number"
            ? countResult[0].total
            : 0;
      }

      const remaining = rowLimit - rowMap.size;
      if (remaining <= 0) {
        hasMore = true;
        break;
      }

      const rows = await collection
        .aggregate(
          [
            { $match: match },
            { $sort: { createdAt: -1, _id: -1 } },
            { $project: projection },
            { $limit: remaining + 1 },
          ],
          {
            maxTimeMS: env.QUERY_TIMEOUT_MS,
            readPreference: ReadPreference.SECONDARY_PREFERRED,
          }
        )
        .toArray();

      if (rows.length > remaining) {
        hasMore = true;
      }

      for (const row of rows.slice(0, remaining)) {
        const key = String(row._id ?? "");
        if (key && !rowMap.has(key)) {
          rowMap.set(key, row);
        }
      }

      if (rowMap.size >= rowLimit) {
        hasMore = true;
        break;
      }
    }

    if (hasMore) {
      break;
    }
  }

  const rows = sortRows(Array.from(rowMap.values())).slice(0, rowLimit);

  return {
    rows,
    hasMore,
    total: request.includeTotal ? total : undefined,
    meta: {
      channelCount: request.channelIds.length,
      channelChunkSize,
      timeWindows: windows.length,
      processedChunks,
      elapsedMs: Date.now() - startedAt,
    },
  };
}
