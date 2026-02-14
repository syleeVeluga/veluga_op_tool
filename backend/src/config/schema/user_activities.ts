import type { DataTypeSchema } from "./types";

export const userActivitiesSchema: DataTypeSchema = {
  dataType: "user_activities",
  dbName: "prod",
  collection: "sessions",
  customerField: "channel",
  timestampField: "createdAt",
  filters: [
    { key: "channel", label: "Channel", type: "search" },
    { key: "isPublic", label: "Is Public", type: "select", options: ["true", "false"] },
  ],
  columns: [
    { key: "createdAt", label: "시간", type: "datetime" },
    { key: "updatedAt", label: "수정 시간", type: "datetime" },
    { key: "channel", label: "Channel", type: "string" },
    { key: "participants", label: "Participants", type: "object" },
    { key: "guests", label: "Guests", type: "object" },
    { key: "lastChat", label: "Last Chat", type: "object" },
    { key: "isPublic", label: "Is Public", type: "boolean" },
  ],
};
