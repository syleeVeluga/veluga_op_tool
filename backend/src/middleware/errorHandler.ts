import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { MongoServerError } from "mongodb";
import { ZodError } from "zod";

type ErrorCode =
  | "bad_request"
  | "not_found"
  | "validation_failed"
  | "db_error"
  | "internal_error";

export type StructuredErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type AppErrorOptions = {
  statusCode: number;
  code: string;
  details?: unknown;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, options: AppErrorOptions) {
    super(message);
    this.name = "AppError";
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.details = options.details;
  }
}

export function createAppError(
  message: string,
  options: AppErrorOptions
): AppError {
  return new AppError(message, options);
}

export const notFoundHandler: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  next(
    createAppError("Requested resource was not found", {
      statusCode: 404,
      code: "not_found",
      details: {
        method: req.method,
        path: req.originalUrl,
      },
    })
  );
};

function normalizeError(error: unknown): {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: "validation_failed",
      message: "Request validation failed",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  if (error instanceof MongoServerError) {
    return {
      statusCode: 500,
      code: "db_error",
      message: "Database operation failed",
      details: {
        name: error.name,
        code: error.code,
      },
    };
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "type" in error &&
    (error as { status?: unknown }).status === 400
  ) {
    return {
      statusCode: 400,
      code: "bad_request",
      message: "Malformed JSON payload",
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: 500,
      code: "internal_error",
      message: error.message || "Internal server error",
    };
  }

  return {
    statusCode: 500,
    code: "internal_error",
    message: "Internal server error",
  };
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const normalized = normalizeError(error);

  if (normalized.statusCode >= 500) {
    console.error("[errorHandler]", error);
  }

  const body: StructuredErrorBody = {
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
    },
  };

  res.status(normalized.statusCode).json(body);
};

export const errorCodes: Record<ErrorCode, ErrorCode> = {
  bad_request: "bad_request",
  not_found: "not_found",
  validation_failed: "validation_failed",
  db_error: "db_error",
  internal_error: "internal_error",
};
