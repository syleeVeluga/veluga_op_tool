import { schemaRegistry } from "../config/schema";
import type { DataType, SchemaColumn, SchemaFilter } from "../config/schema/types";

export interface SchemaResponse {
  columns: SchemaColumn[];
  filters: SchemaFilter[];
}

export function getSchemaByDataType(dataType: DataType): SchemaResponse {
  const schema = schemaRegistry[dataType];
  return {
    columns: schema.columns,
    filters: schema.filters,
  };
}
