import type { Response } from "express";
import { finished } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { ReadPreference, type Document } from "mongodb";
import { env } from "../config/env";
import { getDb } from "../config/database";
import { schemaRegistry } from "../config/schema";
import { buildAggregationPipeline, type QueryRequest } from "./queryBuilder";

type ExportTarget = {
  write: (chunk: string) => Promise<void>;
  end: () => Promise<void>;
};

class ExportSemaphore {
  private active = 0;

  private readonly queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

const exportSemaphore = new ExportSemaphore(env.MAX_CONCURRENT_EXPORTS);

export async function runWithExportSemaphore<T>(task: () => Promise<T>): Promise<T> {
  await exportSemaphore.acquire();

  try {
    return await task();
  } finally {
    exportSemaphore.release();
  }
}

function toSafeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function formatFileName(dataType: string, ext: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${toSafeFilePart(dataType)}-${timestamp}.${ext}`;
}

function resolveExportColumns(request: QueryRequest): string[] {
  const schema = schemaRegistry[request.dataType];
  const selected = (request.columns ?? schema.columns.map((column) => column.key)).filter(Boolean);
  return selected.length > 0 ? selected : schema.columns.map((column) => column.key);
}

function normalizeExportLimit(request: QueryRequest): number {
  if (!request.pageSize || !Number.isFinite(request.pageSize)) {
    return env.MAX_EXPORT_ROWS;
  }

  return Math.max(1, Math.min(Math.floor(request.pageSize), env.MAX_EXPORT_ROWS));
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const escaped = raw.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function projectRow(row: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  return columns.reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = row[key];
    return acc;
  }, {});
}

async function writeTextChunk(res: Response, chunk: string): Promise<void> {
  if (res.write(chunk)) {
    return;
  }

  await new Promise<void>((resolve) => {
    res.once("drain", () => resolve());
  });
}

function createExportTarget(res: Response, gzipEnabled: boolean): ExportTarget {
  if (!gzipEnabled) {
    return {
      write: (chunk) => writeTextChunk(res, chunk),
      end: async () => {
        res.end();
      },
    };
  }

  const gzip = createGzip();
  gzip.pipe(res);

  return {
    write: async (chunk) => {
      if (gzip.write(chunk)) {
        return;
      }

      await new Promise<void>((resolve) => {
        gzip.once("drain", () => resolve());
      });
    },
    end: async () => {
      gzip.end();
      await finished(gzip);
    },
  };
}

async function getExportCursor(request: QueryRequest) {
  const schema = schemaRegistry[request.dataType];
  const db = await getDb(schema.dbName);
  const exportLimit = normalizeExportLimit(request);

  const pipeline = buildAggregationPipeline({
    ...request,
    includeTotal: false,
    cursor: undefined,
    pageSize: exportLimit,
  });

  const lastStage = pipeline[pipeline.length - 1] as Document | undefined;
  if (lastStage && typeof (lastStage as { $limit?: unknown }).$limit === "number") {
    (lastStage as { $limit: number }).$limit = exportLimit;
  }

  const cursor = db.collection(schema.collection).aggregate(pipeline, {
    maxTimeMS: env.QUERY_TIMEOUT_MS,
    readPreference: ReadPreference.SECONDARY_PREFERRED,
  });

  return {
    cursor,
    columns: resolveExportColumns(request),
  };
}

export async function streamCsvExportFromRows(
  request: QueryRequest,
  rows: Array<Record<string, unknown>>,
  res: Response
): Promise<void> {
  const columns = resolveExportColumns(request);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${formatFileName(request.dataType, "csv")}\"`);

  await writeTextChunk(res, "\uFEFF");
  await writeTextChunk(res, `${columns.map((key) => escapeCsvCell(key)).join(",")}\n`);

  for (const row of rows) {
    const line = columns.map((key) => escapeCsvCell(row[key])).join(",");
    await writeTextChunk(res, `${line}\n`);
  }

  res.end();
}

export async function streamJsonExportFromRows(
  request: QueryRequest,
  rows: Array<Record<string, unknown>>,
  res: Response,
  options?: { gzip?: boolean }
): Promise<void> {
  const columns = resolveExportColumns(request);
  const gzipEnabled = options?.gzip === true;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=\"${formatFileName(request.dataType, gzipEnabled ? "json.gz" : "json")}\"`
  );
  if (gzipEnabled) {
    res.setHeader("Content-Encoding", "gzip");
  }

  const target = createExportTarget(res, gzipEnabled);

  await target.write("[");

  for (let index = 0; index < rows.length; index += 1) {
    const projected = projectRow(rows[index], columns);
    const prefix = index === 0 ? "" : ",";
    await target.write(`${prefix}${JSON.stringify(projected)}`);
  }

  await target.write("]");
  await target.end();
}

export async function streamCsvExport(request: QueryRequest, res: Response): Promise<void> {
  const { cursor, columns } = await getExportCursor(request);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${formatFileName(request.dataType, "csv")}\"`);

  await writeTextChunk(res, "\uFEFF");
  await writeTextChunk(res, `${columns.map((key) => escapeCsvCell(key)).join(",")}\n`);

  for await (const doc of cursor) {
    const row = doc as Record<string, unknown>;
    const line = columns.map((key) => escapeCsvCell(row[key])).join(",");
    await writeTextChunk(res, `${line}\n`);
  }

  res.end();
}

export async function streamJsonExport(
  request: QueryRequest,
  res: Response,
  options?: { gzip?: boolean }
): Promise<void> {
  const { cursor, columns } = await getExportCursor(request);
  const gzipEnabled = options?.gzip === true;

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=\"${formatFileName(request.dataType, gzipEnabled ? "json.gz" : "json")}\"`
  );
  if (gzipEnabled) {
    res.setHeader("Content-Encoding", "gzip");
  }

  const target = createExportTarget(res, gzipEnabled);

  await target.write("[");

  let isFirst = true;
  for await (const doc of cursor) {
    const row = doc as Record<string, unknown>;
    const projected = projectRow(row, columns);
    const prefix = isFirst ? "" : ",";
    await target.write(`${prefix}${JSON.stringify(projected)}`);
    isFirst = false;
  }

  await target.write("]");
  await target.end();
}
