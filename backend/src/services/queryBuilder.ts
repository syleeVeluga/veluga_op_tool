import { ObjectId, type Document } from "mongodb";
import { env } from "../config/env";
import { schemaRegistry } from "../config/schema";
import type { DataType, SchemaFilter } from "../config/schema/types";

export interface DateRangeInput {
  start: string;
  end: string;
}

export interface QueryCursor {
  afterTs: string;
  afterId: string;
}

export type QueryFilterValue =
  | string
  | number
  | boolean
  | {
      min?: string | number;
      max?: string | number;
    };

export interface QueryRequest {
  dataType: DataType;
  customerId?: string;
  customerIds?: string[];
  dateRange: DateRangeInput;
  filters?: Record<string, QueryFilterValue | undefined>;
  columns?: string[];
  pageSize?: number;
  includeTotal?: boolean;
  cursor?: QueryCursor;
  includeSessionMessages?: boolean;
  reportMode?: "default" | "customer";
  sortOrder?: "asc" | "desc";
  matchWindowSec?: number;
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (!value || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
}

function parseDateString(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid datetime string`);
  }

  return parsed;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveSearchCondition(rawValue: string): Document {
  const keyword = rawValue.trim();

  if (ObjectId.isValid(keyword)) {
    const objectId = new ObjectId(keyword);

    return {
      $in: [keyword, objectId],
    };
  }

  return {
    $regex: escapeRegex(keyword),
    $options: "i",
  };
}

function normalizePageSize(pageSize: number | undefined): number {
  const defaultSize = 100;

  if (pageSize === undefined || pageSize === null) {
    return defaultSize;
  }

  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("pageSize must be a positive integer");
  }

  return Math.min(pageSize, env.MAX_EXPORT_ROWS);
}

function resolveProjection(columns: string[] | undefined, fallbackColumns: string[]): Document {
  const selectedColumns = (columns ?? fallbackColumns).filter(Boolean);

  if (selectedColumns.length === 0) {
    return { _id: 1 };
  }

  return selectedColumns.reduce<Document>((acc, columnKey) => {
    acc[columnKey] = 1;
    return acc;
  }, { _id: 1 });
}

function resolveRangeCondition(filterKey: string, value: QueryFilterValue): Document {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (!Object.prototype.hasOwnProperty.call(value, "min") &&
      !Object.prototype.hasOwnProperty.call(value, "max"))
  ) {
    throw new Error(`range filter '${filterKey}' must include min or max`);
  }

  const condition: Document = {};

  if (value.min !== undefined) {
    condition.$gte = value.min;
  }

  if (value.max !== undefined) {
    condition.$lte = value.max;
  }

  return condition;
}

function applySchemaFilters(
  match: Document,
  schemaFilters: SchemaFilter[],
  requestFilters: Record<string, QueryFilterValue | undefined> | undefined
): void {
  if (!requestFilters) {
    return;
  }

  const supportedFilterMap = new Map(schemaFilters.map((filter) => [filter.key, filter]));

  for (const [filterKey, rawValue] of Object.entries(requestFilters)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    const schemaFilter = supportedFilterMap.get(filterKey);
    if (!schemaFilter) {
      throw new Error(`Unsupported filter key: ${filterKey}`);
    }

    if (schemaFilter.type === "search") {
      if (typeof rawValue !== "string") {
        throw new Error(`search filter '${filterKey}' must be a string`);
      }

      match[filterKey] = resolveSearchCondition(rawValue);
      continue;
    }

    if (schemaFilter.type === "select") {
      match[filterKey] = rawValue;
      continue;
    }

    if (schemaFilter.type === "range") {
      match[filterKey] = resolveRangeCondition(filterKey, rawValue);
    }
  }
}

function resolveCursorCondition(timestampField: string, cursor: QueryCursor | undefined): Document | null {
  if (!cursor) {
    return null;
  }

  assertNonEmptyString(cursor.afterTs, "cursor.afterTs");
  assertNonEmptyString(cursor.afterId, "cursor.afterId");

  const afterTs = parseDateString(cursor.afterTs, "cursor.afterTs");
  const afterId = ObjectId.isValid(cursor.afterId)
    ? new ObjectId(cursor.afterId)
    : cursor.afterId;

  return {
    $or: [
      { [timestampField]: { $lt: afterTs } },
      {
        [timestampField]: afterTs,
        _id: { $lt: afterId },
      },
    ],
  };
}

function expandCustomerIds(ids: string[]): Array<string | ObjectId> {
  const expanded = new Map<string, string | ObjectId>();

  for (const id of ids) {
    expanded.set(`str:${id}`, id);

    if (ObjectId.isValid(id)) {
      const objectId = new ObjectId(id);
      expanded.set(`oid:${objectId.toHexString()}`, objectId);
    }
  }

  return Array.from(expanded.values());
}

function buildBaseMatch(request: QueryRequest): { match: Document; timestampField: string; projection: Document; limit: number } {
  const schema = schemaRegistry[request.dataType];
  const { customerField, timestampField, filters: schemaFilters, columns: schemaColumns } = schema;

  const normalizedCustomerId = request.customerId?.trim();
  const normalizedCustomerIds =
    request.customerIds
      ?.map((item) => item.trim())
      .filter((item) => item.length > 0) ?? [];

  if (!normalizedCustomerId && normalizedCustomerIds.length === 0) {
    throw new Error("customerId or customerIds is required");
  }

  assertNonEmptyString(request.dateRange?.start ?? "", "dateRange.start");
  assertNonEmptyString(request.dateRange?.end ?? "", "dateRange.end");

  const startedAt = parseDateString(request.dateRange.start, "dateRange.start");
  const endedAt = parseDateString(request.dateRange.end, "dateRange.end");

  if (startedAt > endedAt) {
    throw new Error("dateRange.start must be before or equal to dateRange.end");
  }

  const requestedCustomerIds =
    normalizedCustomerIds.length > 0
      ? Array.from(new Set(normalizedCustomerIds))
      : [normalizedCustomerId as string];

  const customerCondition: Document = {
    $in: expandCustomerIds(requestedCustomerIds),
  };

  const match: Document = {
    [customerField]: customerCondition,
    [timestampField]: {
      $gte: startedAt,
      $lte: endedAt,
    },
  };

  applySchemaFilters(match, schemaFilters, request.filters);

  const cursorCondition = resolveCursorCondition(timestampField, request.cursor);
  if (cursorCondition) {
    match.$and = [cursorCondition];
  }

  const projection = resolveProjection(
    request.columns,
    schemaColumns.map((column) => column.key)
  );

  const limit = normalizePageSize(request.pageSize);

  return {
    match,
    timestampField,
    projection,
    limit,
  };
}

export function buildAggregationPipeline(request: QueryRequest): Document[] {
  const { match, timestampField, projection, limit } = buildBaseMatch(request);

  return [
    { $match: match },
    { $sort: { [timestampField]: -1, _id: -1 } },
    { $project: projection },
    { $limit: limit + 1 },
  ];
}

export function buildCountPipeline(request: QueryRequest): Document[] {
  const { match } = buildBaseMatch({
    ...request,
    cursor: undefined,
    pageSize: undefined,
    columns: undefined,
  });

  return [{ $match: match }, { $count: "total" }];
}
