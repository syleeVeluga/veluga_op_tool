import type { DataTypeSchema } from "./types";

export const errorLogsSchema: DataTypeSchema = {
  dataType: "error_logs",
  collection: "error_logs",
  customerField: "userId",
  timestampField: "timestamp",
  filters: [],
  columns: [
    { key: "timestamp", label: "시간", type: "datetime" },
    { key: "errorCode", label: "Error Code", type: "string" },
    { key: "message", label: "Message", type: "string" },
  ],
};
