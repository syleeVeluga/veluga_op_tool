import { Router } from "express";
import { ReadPreference } from "mongodb";
import { getDb } from "../config/database";
import { isDataType, supportedDataTypes } from "../config/schema";
import { schemaRegistry } from "../config/schema";
import { env } from "../config/env";
import { validateDataQueryRequest } from "../middleware/validators";
import { validateConversationBatchRequest } from "../middleware/validators";
import { validatePeriodSummaryRequest } from "../middleware/validators";
import { validateDataTypeSummaryRequest } from "../middleware/validators";
import {
  buildAggregationPipeline,
  buildCountPipeline,
  type QueryRequest,
} from "../services/queryBuilder";
import {
  queryConversationsInBatches,
  type ConversationBatchRequest,
} from "../services/conversationBatchQuery";
import {
  resolveCustomersByPartnerId,
  searchCustomers,
} from "../services/customerSearch";
import { getSchemaByDataType } from "../services/schemaProvider";
import {
  getPeriodSummary,
  type PeriodSummaryRequest,
} from "../services/periodSummary";
import {
  getDataTypeSummary,
  type DataTypeSummaryRequest,
} from "../services/dataTypeSummary";

const dataRouter = Router();

dataRouter.get("/schema/:dataType", (req, res) => {
  const { dataType } = req.params;

  if (!isDataType(dataType)) {
    res.status(400).json({
      error: "invalid_data_type",
      message: `Unsupported dataType: ${dataType}`,
      supportedDataTypes,
    });
    return;
  }

  const schema = getSchemaByDataType(dataType);

  res.status(200).json(schema);
});

dataRouter.get("/customers/search", async (req, res) => {
  const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
  const q = rawQuery.trim();

  if (q.length < 2) {
    res.status(400).json({
      error: "invalid_query",
      message: "Query must be at least 2 characters",
    });
    return;
  }

  try {
    const customers = await searchCustomers(q);
    res.status(200).json({ customers });
  } catch (error) {
    res.status(500).json({
      error: "customer_search_failed",
      message: "Failed to search customers",
      detail: error instanceof Error ? error.message : "unknown error",
    });
  }
});

dataRouter.get("/customers/by-partner", async (req, res) => {
  const rawPartnerId =
    typeof req.query.partnerId === "string" ? req.query.partnerId : "";
  const partnerId = rawPartnerId.trim();

  if (!partnerId) {
    res.status(400).json({
      error: "invalid_partner_id",
      message: "partnerId is required",
    });
    return;
  }

  try {
    const result = await resolveCustomersByPartnerId(partnerId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: "partner_customer_resolve_failed",
      message: "Failed to resolve customers by partnerId",
      detail: error instanceof Error ? error.message : "unknown error",
    });
  }
});

dataRouter.post(
  "/data/query-batch/conversations",
  validateConversationBatchRequest,
  async (_req, res) => {
    const request = res.locals
      .conversationBatchRequest as ConversationBatchRequest;

    try {
      const result = await queryConversationsInBatches(request);
      res.status(200).json(result);
    } catch (error) {
      res.status(500).json({
        error: "batch_query_failed",
        message: "Failed to execute batched conversations query",
        detail: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
);

dataRouter.post(
  "/data/summary/period",
  validatePeriodSummaryRequest,
  async (_req, res) => {
    const request = res.locals.periodSummaryRequest as PeriodSummaryRequest;

    try {
      const summary = await getPeriodSummary(request);
      res.status(200).json(summary);
    } catch (error) {
      res.status(500).json({
        error: "summary_failed",
        message: "Failed to build period summary",
        detail: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
);

dataRouter.post(
  "/data/summary/by-data-type",
  validateDataTypeSummaryRequest,
  async (_req, res) => {
    const request = res.locals.dataTypeSummaryRequest as DataTypeSummaryRequest;

    try {
      const summary = await getDataTypeSummary(request);
      res.status(200).json(summary);
    } catch (error) {
      res.status(500).json({
        error: "summary_failed",
        message: "Failed to build data type summary",
        detail: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
);

dataRouter.post("/data/query", validateDataQueryRequest, async (_req, res) => {
  const request = res.locals.queryRequest as QueryRequest;

  const schema = schemaRegistry[request.dataType];
  const pipeline = buildAggregationPipeline(request);
  const pageSize = Math.min(request.pageSize ?? 100, env.MAX_EXPORT_ROWS);

  try {
    const db = await getDb(schema.dbName);
    const rows = await db
      .collection(schema.collection)
      .aggregate(pipeline, {
        maxTimeMS: env.QUERY_TIMEOUT_MS,
        readPreference: ReadPreference.SECONDARY_PREFERRED,
      })
      .toArray();

    let total: number | undefined;

    if (request.includeTotal) {
      const countPipeline = buildCountPipeline(request);
      const countResult = await db
        .collection(schema.collection)
        .aggregate(countPipeline, {
          maxTimeMS: env.QUERY_TIMEOUT_MS,
          readPreference: ReadPreference.SECONDARY_PREFERRED,
        })
        .toArray();

      total =
        countResult.length > 0 && typeof countResult[0]?.total === "number"
          ? countResult[0].total
          : 0;
    }

    const hasMore = rows.length > pageSize;
    const visibleRows = hasMore ? rows.slice(0, pageSize) : rows;

    const lastRow = visibleRows[visibleRows.length - 1] as
      | { _id?: unknown; [key: string]: unknown }
      | undefined;

    const cursorSource = lastRow?.[schema.timestampField];
    const cursorTs =
      cursorSource instanceof Date
        ? cursorSource.toISOString()
        : typeof cursorSource === "string"
          ? cursorSource
          : null;

    const cursorId =
      lastRow?._id !== undefined && lastRow?._id !== null
        ? String(lastRow._id)
        : null;

    res.status(200).json({
      rows: visibleRows,
      total,
      pageSize,
      hasMore,
      nextCursor:
        hasMore && cursorTs && cursorId
          ? {
              afterTs: cursorTs,
              afterId: cursorId,
            }
          : undefined,
    });
  } catch (error) {
    res.status(500).json({
      error: "query_failed",
      message: "Failed to execute query",
      detail: error instanceof Error ? error.message : "unknown error",
    });
  }
});

export { dataRouter };
