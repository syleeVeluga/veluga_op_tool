import cors from "cors";
import express from "express";
import {
  checkMongoConnection,
  connectToMongo,
  getMongoConnectionStatus,
  registerMongoShutdownHooks,
} from "./config/database";
import { env } from "./config/env";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: env.corsOrigins === "*" ? true : env.corsOrigins,
    credentials: true,
  })
);

app.get("/health", async (_req, res) => {
  try {
    const mongo = await checkMongoConnection();
    res.status(200).json({ status: "ok", mongo });
  } catch (error) {
    res.status(503).json({
      status: "degraded",
      mongo: {
        ok: false,
        detail: error instanceof Error ? error.message : "unknown error",
      },
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "log-csv-api",
    mongo: getMongoConnectionStatus(),
  });
});

const port = env.PORT;

async function bootstrap(): Promise<void> {
  registerMongoShutdownHooks();
  await connectToMongo();

  app.listen(port, "0.0.0.0", () => {
    console.log(`API server listening on port ${port}`);
  });
}

void bootstrap().catch((error) => {
  console.error("Failed to start API server", error);
  process.exit(1);
});