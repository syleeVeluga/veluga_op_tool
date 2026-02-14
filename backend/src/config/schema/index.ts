import { apiUsageLogsSchema } from "./api_usage_logs";
import { billingLogsSchema } from "./billing_logs";
import { conversationsSchema } from "./conversations";
import { errorLogsSchema } from "./error_logs";
import { eventLogsSchema } from "./event_logs";
import type { DataType, DataTypeSchema } from "./types";
import { userActivitiesSchema } from "./user_activities";

const schemas: DataTypeSchema[] = [
  conversationsSchema,
  apiUsageLogsSchema,
  eventLogsSchema,
  errorLogsSchema,
  billingLogsSchema,
  userActivitiesSchema,
];

export const schemaRegistry: Record<DataType, DataTypeSchema> = {
  conversations: conversationsSchema,
  api_usage_logs: apiUsageLogsSchema,
  event_logs: eventLogsSchema,
  error_logs: errorLogsSchema,
  billing_logs: billingLogsSchema,
  user_activities: userActivitiesSchema,
};

export const supportedDataTypes: DataType[] = schemas.map(
  (schema) => schema.dataType
);

export function isDataType(value: string): value is DataType {
  return value in schemaRegistry;
}
