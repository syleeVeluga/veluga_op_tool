import cors from "cors";
import express from "express";
import { env } from "./config/env";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: env.corsOrigins === "*" ? true : env.corsOrigins,
    credentials: true,
  })
);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "log-csv-api" });
});

const port = env.PORT;
app.listen(port, "0.0.0.0", () => {
  console.log(`API server listening on port ${port}`);
});