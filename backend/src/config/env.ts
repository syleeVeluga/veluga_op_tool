import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

export interface BatchDbConfig {
  name: string;
  dbName: string;
  collections: {
    chats: string;
    usagelogs: string;
    botchats: string;
    channels: string;
    users: string;
  };
}

const defaultBatchCollections: BatchDbConfig["collections"] = {
  chats: "chats",
  usagelogs: "usagelogs",
  botchats: "botchats",
  channels: "channels",
  users: "users",
};

function parseBatchDbConfigs(raw: string | undefined): BatchDbConfig[] {
  if (!raw || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("BATCH_DB_CONFIGS must be a JSON array");
    }

    const result: BatchDbConfig[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const candidate = item as Record<string, unknown>;
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      const dbName = typeof candidate.dbName === "string" ? candidate.dbName.trim() : "";
      const collectionsCandidate =
        candidate.collections && typeof candidate.collections === "object"
          ? (candidate.collections as Record<string, unknown>)
          : {};

      if (!name || !dbName) {
        continue;
      }

      result.push({
        name,
        dbName,
        collections: {
          chats:
            typeof collectionsCandidate.chats === "string" && collectionsCandidate.chats.trim().length > 0
              ? collectionsCandidate.chats.trim()
              : defaultBatchCollections.chats,
          usagelogs:
            typeof collectionsCandidate.usagelogs === "string" && collectionsCandidate.usagelogs.trim().length > 0
              ? collectionsCandidate.usagelogs.trim()
              : defaultBatchCollections.usagelogs,
          botchats:
            typeof collectionsCandidate.botchats === "string" && collectionsCandidate.botchats.trim().length > 0
              ? collectionsCandidate.botchats.trim()
              : defaultBatchCollections.botchats,
          channels:
            typeof collectionsCandidate.channels === "string" && collectionsCandidate.channels.trim().length > 0
              ? collectionsCandidate.channels.trim()
              : defaultBatchCollections.channels,
          users:
            typeof collectionsCandidate.users === "string" && collectionsCandidate.users.trim().length > 0
              ? collectionsCandidate.users.trim()
              : defaultBatchCollections.users,
        },
      });
    }

    return result;
  } catch (error) {
    console.warn(
      `[env] Failed to parse BATCH_DB_CONFIGS. expected JSON array. detail=${error instanceof Error ? error.message : "unknown"}`
    );
    return [];
  }
}

// Load environment variables:
// 1. DOTENV_CONFIG_PATH if explicitly set
// 2. backend/.env (default dotenv behavior)
// 3. project root .env.veluga.mongo (fallback)
dotenv.config();

if (!process.env.MONGODB_URI) {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env.veluga.mongo") });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  CORS_ORIGIN: z.string().default("*"),
  MONGODB_URI: z.string().optional(),
  MONGODB_DB_NAME: z.string().default("logdb"),
  OPS_TOOL_DB_NAME: z.string().default("ops_tool"),
  BATCH_DB_CONFIGS: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default("8h"),
  SUPER_ADMIN_EMAILS: z
    .string()
    .default("syleee@veluga.io,sylee@veluga.io"),
  SUPER_ADMIN_INITIAL_PASSWORD: z.string().default("ChangeMe123!"),
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
  batchDbConfigs: parseBatchDbConfigs(rawEnv.BATCH_DB_CONFIGS),
  SUPER_ADMIN_EMAILS: rawEnv.SUPER_ADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
};
