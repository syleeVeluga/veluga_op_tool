import type { DataTypeSchema } from "./types";

export const userActivitiesSchema: DataTypeSchema = {
  dataType: "user_activities",
  collection: "user_activities",
  customerField: "userId",
  timestampField: "timestamp",
  filters: [],
  columns: [
    { key: "timestamp", label: "시간", type: "datetime" },
    { key: "activity", label: "Activity", type: "string" },
  ],
};
