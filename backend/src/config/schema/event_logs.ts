import type { DataTypeSchema } from "./types";

export const eventLogsSchema: DataTypeSchema = {
  dataType: "event_logs",
  collection: "event_logs",
  customerField: "userId",
  timestampField: "timestamp",
  filters: [],
  columns: [
    { key: "timestamp", label: "시간", type: "datetime" },
    { key: "eventName", label: "Event", type: "string" },
  ],
};
