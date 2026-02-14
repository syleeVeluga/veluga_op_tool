import type { DataTypeSchema } from "./types";

export const apiUsageLogsSchema: DataTypeSchema = {
  dataType: "api_usage_logs",
  collection: "api_usage_logs",
  customerField: "userId",
  timestampField: "timestamp",
  filters: [
    { key: "endpoint", label: "Endpoint", type: "search" },
    {
      key: "method",
      label: "Method",
      type: "select",
      options: ["GET", "POST", "PUT", "DELETE"],
    },
  ],
  columns: [
    { key: "timestamp", label: "시간", type: "datetime" },
    { key: "endpoint", label: "Endpoint", type: "string" },
    { key: "method", label: "Method", type: "string" },
    { key: "statusCode", label: "Status Code", type: "number" },
  ],
};
