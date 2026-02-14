import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  CORS_ORIGIN: z.string().default("*"),
  MONGODB_URI: z.string().optional(),
  MONGODB_DB_NAME: z.string().default("logdb"),
  OPS_TOOL_DB_NAME: z.string().default("ops_tool"),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default("8h"),
  MAX_EXPORT_ROWS: z.coerce.number().int().positive().default(10000),
  CSV_TRUNCATE_LENGTH: z.coerce.number().int().positive().default(5000),
  MAX_CONCURRENT_EXPORTS: z.coerce.number().int().positive().default(2),
  QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

const rawEnv = parsed.data;

const corsOrigins = rawEnv.CORS_ORIGIN === "*"
  ? "*"
  : rawEnv.CORS_ORIGIN
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

export const env = {
  ...rawEnv,
  corsOrigins,
};
