export type DataType =
  | "conversations"
  | "api_usage_logs"
  | "event_logs"
  | "error_logs"
  | "billing_logs"
  | "user_activities";

export type SchemaFilterType = "search" | "select" | "range";

export type SchemaColumnType =
  | "string"
  | "number"
  | "boolean"
  | "datetime"
  | "object";

export interface SchemaFilter {
  key: string;
  label: string;
  type: SchemaFilterType;
  options?: string[];
}

export interface SchemaColumn {
  key: string;
  label: string;
  type: SchemaColumnType;
}

export interface DataTypeSchema {
  dataType: DataType;
  dbName: string;
  collection: string;
  customerField: string;
  timestampField: string;
  filters: SchemaFilter[];
  columns: SchemaColumn[];
}
