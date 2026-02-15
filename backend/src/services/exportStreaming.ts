import type { Response } from "express";
import { ReadPreference, type Document } from "mongodb";
import { env } from "../config/env";
import { getDb } from "../config/database";
import { schemaRegistry } from "../config/schema";
import { buildAggregationPipeline, type QueryRequest } from "./queryBuilder";

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
  res: Response
): Promise<void> {
  const columns = resolveExportColumns(request);

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${formatFileName(request.dataType, "json")}\"`);

  await writeTextChunk(res, "[");

  for (let index = 0; index < rows.length; index += 1) {
    const projected = projectRow(rows[index], columns);
    const prefix = index === 0 ? "" : ",";
    await writeTextChunk(res, `${prefix}${JSON.stringify(projected)}`);
  }

  await writeTextChunk(res, "]");
  res.end();
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

export async function streamJsonExport(request: QueryRequest, res: Response): Promise<void> {
  const { cursor, columns } = await getExportCursor(request);

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"${formatFileName(request.dataType, "json")}\"`);

  await writeTextChunk(res, "[");

  let isFirst = true;
  for await (const doc of cursor) {
    const row = doc as Record<string, unknown>;
    const projected = projectRow(row, columns);
    const prefix = isFirst ? "" : ",";
    await writeTextChunk(res, `${prefix}${JSON.stringify(projected)}`);
    isFirst = false;
  }

  await writeTextChunk(res, "]");
  res.end();
}
