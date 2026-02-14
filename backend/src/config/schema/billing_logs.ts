import type { DataTypeSchema } from "./types";

export const billingLogsSchema: DataTypeSchema = {
  dataType: "billing_logs",
  collection: "billing_logs",
  customerField: "customerId",
  timestampField: "timestamp",
  filters: [],
  columns: [
    { key: "timestamp", label: "시간", type: "datetime" },
    { key: "billingType", label: "Billing Type", type: "string" },
    { key: "amount", label: "Amount", type: "number" },
  ],
};
