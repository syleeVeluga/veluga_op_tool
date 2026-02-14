import { ReadPreference, type Document } from "mongodb";
import { getDb } from "../config/database";
import { env } from "../config/env";
import { schemaRegistry } from "../config/schema";
import type { DataType } from "../config/schema/types";

export interface DataTypeSummaryRequest {
  dataType: DataType;
  targetId: string;
  dateRange: {
    start: string;
    end: string;
  };
}

export interface DataTypeSummaryResponse {
  dataType: DataType;
  targetField: string;
  targetId: string;
  dateRange: {
    start: string;
    end: string;
  };
  metrics: {
    totalCount: number;
    requestCount?: number;
    conversationCount?: number;
    activeChannels?: number;
    activeCreators?: number;
    creditsUsed?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    avgBalance?: number;
    expiredCount?: number;
    publicCount?: number;
    privateCount?: number;
    uniqueErrorCodes?: number;
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

function tokenExpr(path: string): Document {
  return {
    $ifNull: [`$transactions.${path}`, 0],
  };
}

function buildSummaryPipeline(dataType: DataType): Document[] {
  if (dataType === "api_usage_logs") {
    return [
      {
        $project: {
          amount: { $ifNull: ["$amount", 0] },
          balance: { $ifNull: ["$balance", 0] },
          inputTokens: {
            $add: [
              tokenExpr("inputTokens"),
              tokenExpr("promptTokens"),
              tokenExpr("input"),
            ],
          },
          outputTokens: {
            $add: [
              tokenExpr("outputTokens"),
              tokenExpr("completionTokens"),
              tokenExpr("output"),
            ],
          },
          totalTokens: {
            $ifNull: [
              "$transactions.totalTokens",
              {
                $add: [
                  tokenExpr("inputTokens"),
                  tokenExpr("promptTokens"),
                  tokenExpr("input"),
                  tokenExpr("outputTokens"),
                  tokenExpr("completionTokens"),
                  tokenExpr("output"),
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          creditsUsed: { $sum: "$amount" },
          inputTokens: { $sum: "$inputTokens" },
          outputTokens: { $sum: "$outputTokens" },
          totalTokens: { $sum: "$totalTokens" },
          avgBalance: { $avg: "$balance" },
        },
      },
      {
        $project: {
          _id: 0,
          totalCount: 1,
          requestCount: "$totalCount",
          creditsUsed: 1,
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 1,
          avgBalance: 1,
        },
      },
    ];
  }

  if (dataType === "conversations") {
    return [
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          channels: { $addToSet: "$channel" },
          creators: { $addToSet: "$creator" },
        },
      },
      {
        $project: {
          _id: 0,
          totalCount: 1,
          conversationCount: "$totalCount",
          activeChannels: { $size: "$channels" },
          activeCreators: { $size: "$creators" },
        },
      },
    ];
  }

  if (dataType === "billing_logs") {
    return [
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          expiredCount: {
            $sum: {
              $cond: [{ $eq: ["$expired", true] }, 1, 0],
            },
          },
        },
      },
      { $project: { _id: 0, totalCount: 1, expiredCount: 1 } },
    ];
  }

  if (dataType === "user_activities") {
    return [
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          publicCount: {
            $sum: {
              $cond: [{ $eq: ["$isPublic", true] }, 1, 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalCount: 1,
          publicCount: 1,
          privateCount: { $subtract: ["$totalCount", "$publicCount"] },
        },
      },
    ];
  }

  if (dataType === "error_logs") {
    return [
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          errorCodes: { $addToSet: "$errorCode" },
        },
      },
      {
        $project: {
          _id: 0,
          totalCount: 1,
          uniqueErrorCodes: {
            $size: {
              $filter: {
                input: "$errorCodes",
                as: "code",
                cond: {
                  $and: [
                    { $ne: ["$$code", null] },
                    { $ne: ["$$code", ""] },
                  ],
                },
              },
            },
          },
        },
      },
    ];
  }

  return [
    {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
      },
    },
    { $project: { _id: 0, totalCount: 1 } },
  ];
}

export async function getDataTypeSummary(
  request: DataTypeSummaryRequest
): Promise<DataTypeSummaryResponse> {
  const schema = schemaRegistry[request.dataType];
  const startedAt = parseDate(request.dateRange.start, "dateRange.start");
  const endedAt = parseDate(request.dateRange.end, "dateRange.end");

  if (startedAt > endedAt) {
    throw new Error("dateRange.start must be before or equal to dateRange.end");
  }

  const rangeDays = dayDiff(startedAt, endedAt);
  if (rangeDays > 190) {
    throw new Error("dateRange exceeds 190 days limit for summary endpoint");
  }

  const db = await getDb(schema.dbName);
  const collection = db.collection(schema.collection);

  const pipeline: Document[] = [
    {
      $match: {
        [schema.customerField]: request.targetId,
        [schema.timestampField]: {
          $gte: startedAt,
          $lte: endedAt,
        },
      },
    },
    ...buildSummaryPipeline(request.dataType),
  ];

  const docs = await collection
    .aggregate(pipeline, {
      maxTimeMS: env.QUERY_TIMEOUT_MS,
      readPreference: ReadPreference.SECONDARY_PREFERRED,
    })
    .toArray();

  const first = docs[0] as Record<string, unknown> | undefined;

  return {
    dataType: request.dataType,
    targetField: schema.customerField,
    targetId: request.targetId,
    dateRange: {
      start: startedAt.toISOString(),
      end: endedAt.toISOString(),
    },
    metrics: {
      totalCount: typeof first?.totalCount === "number" ? first.totalCount : 0,
      requestCount: typeof first?.requestCount === "number" ? first.requestCount : undefined,
      conversationCount:
        typeof first?.conversationCount === "number"
          ? first.conversationCount
          : undefined,
      activeChannels:
        typeof first?.activeChannels === "number" ? first.activeChannels : undefined,
      activeCreators:
        typeof first?.activeCreators === "number" ? first.activeCreators : undefined,
      creditsUsed: typeof first?.creditsUsed === "number" ? first.creditsUsed : undefined,
      inputTokens: typeof first?.inputTokens === "number" ? first.inputTokens : undefined,
      outputTokens: typeof first?.outputTokens === "number" ? first.outputTokens : undefined,
      totalTokens: typeof first?.totalTokens === "number" ? first.totalTokens : undefined,
      avgBalance: typeof first?.avgBalance === "number" ? first.avgBalance : undefined,
      expiredCount:
        typeof first?.expiredCount === "number" ? first.expiredCount : undefined,
      publicCount: typeof first?.publicCount === "number" ? first.publicCount : undefined,
      privateCount: typeof first?.privateCount === "number" ? first.privateCount : undefined,
      uniqueErrorCodes:
        typeof first?.uniqueErrorCodes === "number"
          ? first.uniqueErrorCodes
          : undefined,
    },
  };
}
