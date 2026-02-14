import type { DataTypeSchema } from "./types";

export const errorLogsSchema: DataTypeSchema = {
  dataType: "error_logs",
  dbName: "prod",
  collection: "errorlogs",
  customerField: "ip",
  timestampField: "createdAt",
  filters: [
    { key: "method", label: "Method", type: "search" },
    { key: "errorCode", label: "Error Code", type: "search" },
    { key: "originalUrl", label: "Original URL", type: "search" },
  ],
  columns: [
    { key: "createdAt", label: "시간", type: "datetime" },
    { key: "ip", label: "IP", type: "string" },
    { key: "method", label: "Method", type: "string" },
    { key: "originalUrl", label: "Original URL", type: "string" },
    { key: "errorCode", label: "Error Code", type: "string" },
    { key: "message", label: "Message", type: "string" },
    { key: "stack", label: "Stack", type: "string" },
  ],
};
