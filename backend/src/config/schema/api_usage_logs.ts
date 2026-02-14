import type { DataTypeSchema } from "./types";

export const apiUsageLogsSchema: DataTypeSchema = {
  dataType: "api_usage_logs",
  dbName: "prod",
  collection: "usagelogs",
  customerField: "creator",
  timestampField: "createdAt",
  filters: [
    { key: "type", label: "Type", type: "search" },
    { key: "channel", label: "Channel", type: "search" },
    { key: "creatorType", label: "Creator Type", type: "search" },
  ],
  columns: [
    { key: "createdAt", label: "시간", type: "datetime" },
    { key: "creator", label: "Creator", type: "string" },
    { key: "creatorType", label: "Creator Type", type: "string" },
    { key: "channel", label: "Channel", type: "string" },
    { key: "type", label: "Type", type: "string" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "balance", label: "Balance", type: "number" },
  ],
};
