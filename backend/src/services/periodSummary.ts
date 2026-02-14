import { ReadPreference, type Document } from "mongodb";
import { env } from "../config/env";
import { getDb } from "../config/database";
import { schemaRegistry } from "../config/schema";

export type SummaryDataType = "api_usage_logs" | "conversations";
export type SummaryGroupBy = "month" | "quarter" | "halfyear";

export interface PeriodSummaryRequest {
  dataType: SummaryDataType;
  groupBy: SummaryGroupBy;
  customerId?: string;
  channelIds?: string[];
  dateRange: {
    start: string;
    end: string;
  };
}

export interface PeriodSummaryBucket {
  periodStart: string;
  requestCount?: number;
  conversationCount?: number;
  activeChannels?: number;
  activeCreators?: number;
  creditsUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  avgBalance?: number;
}

export interface PeriodSummaryResponse {
  dataType: SummaryDataType;
  groupBy: SummaryGroupBy;
  buckets: PeriodSummaryBucket[];
  meta: {
    bucketCount: number;
    dateRangeDays: number;
    channelFilterCount: number;
  };
}

function parseDate(value: string, fieldName: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid datetime string`);
  }
  return parsed;
}

function dayDiff(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function halfYearStartExpr(dateFieldRef: string): Document {
  return {
    $dateFromParts: {
      year: { $year: dateFieldRef },
      month: {
        $cond: [
          { $lte: [{ $month: dateFieldRef }, 6] },
          1,
          7,
        ],
      },
      day: 1,
    },
  };
}

function periodStartExpr(groupBy: SummaryGroupBy, dateFieldRef: string): Document {
  if (groupBy === "month") {
    return { $dateTrunc: { date: dateFieldRef, unit: "month" } };
  }

  if (groupBy === "quarter") {
    return { $dateTrunc: { date: dateFieldRef, unit: "quarter" } };
  }

  return halfYearStartExpr(dateFieldRef);
}

function buildMatch(request: PeriodSummaryRequest): Document {
  const schema = schemaRegistry[request.dataType];

  const start = parseDate(request.dateRange.start, "dateRange.start");
  const end = parseDate(request.dateRange.end, "dateRange.end");

  if (start > end) {
    throw new Error("dateRange.start must be before or equal to dateRange.end");
  }

  const rangeDays = dayDiff(start, end);
  if (rangeDays > 190) {
    throw new Error("dateRange exceeds 190 days limit for summary endpoint");
  }

  const match: Document = {
    [schema.timestampField]: {
      $gte: start,
      $lte: end,
    },
  };

  if (request.customerId) {
    match[schema.customerField] = request.customerId;
  }

  if (request.channelIds && request.channelIds.length > 0) {
    match.channel = { $in: request.channelIds };
  }

  return match;
}

function tokenProjectionExpr(path: string): Document {
  return {
    $ifNull: [
      `$transactions.${path}`,
      0,
    ],
  };
}

export async function getPeriodSummary(
  request: PeriodSummaryRequest
): Promise<PeriodSummaryResponse> {
  const schema = schemaRegistry[request.dataType];
  const match = buildMatch(request);

  const tsFieldRef = `$${schema.timestampField}`;
  const periodStart = periodStartExpr(request.groupBy, tsFieldRef);

  const db = await getDb(schema.dbName);
  const collection = db.collection(schema.collection);

  let pipeline: Document[];

  if (request.dataType === "api_usage_logs") {
    pipeline = [
      { $match: match },
      {
        $project: {
          periodStart,
          amount: { $ifNull: ["$amount", 0] },
          balance: { $ifNull: ["$balance", 0] },
          inputTokens: {
            $add: [
              tokenProjectionExpr("inputTokens"),
              tokenProjectionExpr("promptTokens"),
              tokenProjectionExpr("input"),
            ],
          },
          outputTokens: {
            $add: [
              tokenProjectionExpr("outputTokens"),
              tokenProjectionExpr("completionTokens"),
              tokenProjectionExpr("output"),
            ],
          },
          totalTokens: {
            $ifNull: [
              "$transactions.totalTokens",
              {
                $add: [
                  tokenProjectionExpr("inputTokens"),
                  tokenProjectionExpr("promptTokens"),
                  tokenProjectionExpr("input"),
                  tokenProjectionExpr("outputTokens"),
                  tokenProjectionExpr("completionTokens"),
                  tokenProjectionExpr("output"),
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: "$periodStart",
          requestCount: { $sum: 1 },
          creditsUsed: { $sum: "$amount" },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          totalTokens: { $sum: "$totalTokens" },
          avgBalance: { $avg: "$balance" },
        },
      },
      { $sort: { _id: 1 } },
    ];
  } else {
    pipeline = [
      { $match: match },
      {
        $project: {
          periodStart,
          channel: "$channel",
          creator: "$creator",
        },
      },
      {
        $group: {
          _id: "$periodStart",
          conversationCount: { $sum: 1 },
          channels: { $addToSet: "$channel" },
          creators: { $addToSet: "$creator" },
        },
      },
      {
        $project: {
          _id: 1,
          conversationCount: 1,
          activeChannels: { $size: "$channels" },
          activeCreators: { $size: "$creators" },
        },
      },
      { $sort: { _id: 1 } },
    ];
  }

  const docs = await collection
    .aggregate(pipeline, {
      maxTimeMS: env.QUERY_TIMEOUT_MS,
      readPreference: ReadPreference.SECONDARY_PREFERRED,
    })
    .toArray();

  const buckets = docs.map((doc) => ({
    periodStart:
      doc._id instanceof Date
        ? doc._id.toISOString()
        : new Date(String(doc._id)).toISOString(),
    requestCount:
      typeof doc.requestCount === "number" ? doc.requestCount : undefined,
    conversationCount:
      typeof doc.conversationCount === "number"
        ? doc.conversationCount
        : undefined,
    activeChannels:
      typeof doc.activeChannels === "number" ? doc.activeChannels : undefined,
    activeCreators:
      typeof doc.activeCreators === "number" ? doc.activeCreators : undefined,
    creditsUsed:
      typeof doc.creditsUsed === "number" ? doc.creditsUsed : undefined,
    inputTokens:
      typeof doc.inputTokens === "number" ? doc.inputTokens : undefined,
    outputTokens:
      typeof doc.outputTokens === "number" ? doc.outputTokens : undefined,
    totalTokens:
      typeof doc.totalTokens === "number" ? doc.totalTokens : undefined,
    avgBalance:
      typeof doc.avgBalance === "number" ? doc.avgBalance : undefined,
  }));

  const start = parseDate(request.dateRange.start, "dateRange.start");
  const end = parseDate(request.dateRange.end, "dateRange.end");

  return {
    dataType: request.dataType,
    groupBy: request.groupBy,
    buckets,
    meta: {
      bucketCount: buckets.length,
      dateRangeDays: dayDiff(start, end),
      channelFilterCount: request.channelIds?.length ?? 0,
    },
  };
}
