import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { isDataType } from "../config/schema";
import type { QueryRequest } from "../services/queryBuilder";

const rangeFilterValueSchema = z
  .object({
    min: z.union([z.string(), z.number()]).optional(),
    max: z.union([z.string(), z.number()]).optional(),
  })
  .refine((value) => value.min !== undefined || value.max !== undefined, {
    message: "range filter must include min or max",
  });

const queryFilterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  rangeFilterValueSchema,
]);

const queryRequestSchema = z.object({
  dataType: z.string().refine((value) => isDataType(value), {
    message: "Unsupported dataType",
  }),
  customerId: z.string().trim().min(1),
  dateRange: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
  }),
  filters: z.record(z.string(), queryFilterValueSchema).optional(),
  columns: z.array(z.string().min(1)).optional(),
  pageSize: z.coerce.number().int().positive().max(env.MAX_EXPORT_ROWS).optional(),
  includeTotal: z.boolean().optional(),
  cursor: z
    .object({
      afterTs: z.string().min(1),
      afterId: z.string().min(1),
    })
    .optional(),
});

const conversationBatchRequestSchema = z.object({
  channelIds: z.array(z.string().trim().min(1)).min(1).max(500),
  dateRange: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
  }),
  filters: z.record(z.string(), queryFilterValueSchema).optional(),
  columns: z.array(z.string().min(1)).optional(),
  rowLimit: z.coerce.number().int().positive().max(env.MAX_EXPORT_ROWS).optional(),
  includeTotal: z.boolean().optional(),
  batch: z
    .object({
      channelChunkSize: z.coerce.number().int().min(10).max(100).optional(),
    })
    .optional(),
});

const periodSummaryRequestSchema = z
  .object({
    dataType: z.enum(["api_usage_logs", "conversations"]),
    groupBy: z.enum(["month", "quarter", "halfyear"]),
    customerId: z.string().trim().min(1).optional(),
    channelIds: z.array(z.string().trim().min(1)).min(1).max(500).optional(),
    dateRange: z.object({
      start: z.string().min(1),
      end: z.string().min(1),
    }),
  })
  .superRefine((value, ctx) => {
    if (!value.customerId && (!value.channelIds || value.channelIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "customerId or channelIds is required",
        path: ["customerId"],
      });
    }
  });

function hasUnsafeDollarKey(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasUnsafeDollarKey(item));
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.startsWith("$")) {
      return true;
    }

    if (hasUnsafeDollarKey(nestedValue)) {
      return true;
    }
  }

  return false;
}

export function validateDataQueryRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (hasUnsafeDollarKey(req.body)) {
    res.status(400).json({
      error: "invalid_request",
      message: "Request contains disallowed key starting with '$'",
    });
    return;
  }

  const parsed = queryRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_request",
      message: "Invalid query request",
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  res.locals.queryRequest = parsed.data as QueryRequest;
  next();
}

export function validateConversationBatchRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (hasUnsafeDollarKey(req.body)) {
    res.status(400).json({
      error: "invalid_request",
      message: "Request contains disallowed key starting with '$'",
    });
    return;
  }

  const parsed = conversationBatchRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_request",
      message: "Invalid conversation batch request",
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  res.locals.conversationBatchRequest = parsed.data;
  next();
}

export function validatePeriodSummaryRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (hasUnsafeDollarKey(req.body)) {
    res.status(400).json({
      error: "invalid_request",
      message: "Request contains disallowed key starting with '$'",
    });
    return;
  }

  const parsed = periodSummaryRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_request",
      message: "Invalid period summary request",
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  res.locals.periodSummaryRequest = parsed.data;
  next();
}
