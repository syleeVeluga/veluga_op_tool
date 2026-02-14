import type { DataTypeSchema } from "./types";

export const conversationsSchema: DataTypeSchema = {
  dataType: "conversations",
  dbName: "prod",
  collection: "chats",
  customerField: "creator",
  timestampField: "createdAt",
  filters: [
    { key: "channel", label: "Channel", type: "search" },
    { key: "creatorType", label: "Creator Type", type: "search" },
  ],
  columns: [
    { key: "createdAt", label: "시간", type: "datetime" },
    { key: "creator", label: "Creator", type: "string" },
    { key: "creatorType", label: "Creator Type", type: "string" },
    { key: "channel", label: "Channel", type: "string" },
    { key: "session", label: "Session", type: "string" },
    { key: "text", label: "Text", type: "string" },
  ],
};
