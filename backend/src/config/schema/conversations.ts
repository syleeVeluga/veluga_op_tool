import type { DataTypeSchema } from "./types";

export const conversationsSchema: DataTypeSchema = {
  dataType: "conversations",
  collection: "conversations",
  customerField: "customerId",
  timestampField: "createdAt",
  filters: [],
  columns: [
    { key: "createdAt", label: "시간", type: "datetime" },
    { key: "conversationId", label: "Conversation ID", type: "string" },
  ],
};
