import cors from "cors";
import express from "express";
import {
  checkMongoConnection,
  getMongoConnectionStatus,
} from "./config/database";
import { ensureDnsServers } from "./config/dns";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { adminUsersRouter } from "./routes/adminUsers";
import { authRouter } from "./routes/auth";
import { dataRouter } from "./routes/data";

export function createApp() {
  ensureDnsServers();

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

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminUsersRouter);
  app.use("/api", dataRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
