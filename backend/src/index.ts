import {
  connectToMongo,
  registerMongoShutdownHooks,
} from "./config/database";
import { ensureDnsServers } from "./config/dns";
import { env } from "./config/env";
import { createApp } from "./app";

ensureDnsServers();

const app = createApp();

const port = env.PORT;

if (env.batchDbConfigs.length === 0) {
  console.warn(
    "[bootstrap] BATCH_DB_CONFIGS is not configured. 대량 배치 로그 대상 DB 목록이 비어 있습니다."
  );
}

async function bootstrap(): Promise<void> {
  registerMongoShutdownHooks();

  try {
    await connectToMongo();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";

    if (env.NODE_ENV === "production") {
      throw error;
    }

    console.warn(
      `[bootstrap] MongoDB connection is unavailable in ${env.NODE_ENV} mode: ${detail}`
    );
    console.warn(
      "[bootstrap] Server will start in degraded mode. Set MONGODB_URI to enable data APIs."
    );
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`API server listening on port ${port}`);
  });
}

void bootstrap().catch((error) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});