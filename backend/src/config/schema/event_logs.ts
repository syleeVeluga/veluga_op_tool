import type { DataTypeSchema } from "./types";

export const eventLogsSchema: DataTypeSchema = {
  dataType: "event_logs",
  dbName: "logdb",
  collection: "logentrydbs",
  customerField: "user_id",
  timestampField: "timestamp",
  filters: [
    { key: "serverType", label: "Server Type", type: "search" },
    { key: "serviceType", label: "Service Type", type: "search" },
    { key: "action", label: "Action", type: "search" },
    { key: "category", label: "Category", type: "search" },
    { key: "subcategory", label: "Subcategory", type: "search" },
    { key: "channel_id", label: "Channel ID", type: "search" },
  ],
  columns: [
    { key: "timestamp", label: "시간", type: "datetime" },
    { key: "user_id", label: "User ID", type: "string" },
    { key: "channel_id", label: "Channel ID", type: "string" },
    { key: "serverType", label: "Server Type", type: "string" },
    { key: "serviceType", label: "Service Type", type: "string" },
    { key: "action", label: "Action", type: "string" },
    { key: "category", label: "Category", type: "string" },
    { key: "subcategory", label: "Subcategory", type: "string" },
    { key: "ip", label: "IP", type: "string" },
    { key: "details", label: "Details", type: "object" },
  ],
};
