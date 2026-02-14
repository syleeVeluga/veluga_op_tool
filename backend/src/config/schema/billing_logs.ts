import type { DataTypeSchema } from "./types";

export const billingLogsSchema: DataTypeSchema = {
  dataType: "billing_logs",
  dbName: "prod",
  collection: "userplanhistories",
  customerField: "user",
  timestampField: "createdAt",
  filters: [
    { key: "type", label: "Type", type: "search" },
    { key: "plan", label: "Plan", type: "search" },
    { key: "expired", label: "Expired", type: "select", options: ["true", "false"] },
  ],
  columns: [
    { key: "createdAt", label: "시간", type: "datetime" },
    { key: "user", label: "User", type: "string" },
    { key: "userPlan", label: "User Plan", type: "string" },
    { key: "type", label: "Type", type: "string" },
    { key: "plan", label: "Plan", type: "object" },
    { key: "usage", label: "Usage", type: "object" },
    { key: "expired", label: "Expired", type: "boolean" },
    { key: "expiredAt", label: "Expired At", type: "datetime" },
  ],
};
