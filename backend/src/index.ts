import dns from "node:dns";
import {
  connectToMongo,
  registerMongoShutdownHooks,
} from "./config/database";
import { env } from "./config/env";
import { createApp } from "./app";

/* ------------------------------------------------------------------ *
 * Node.js의 c-ares DNS resolver가 시스템 DNS 서버를 올바르게 상속받지
 * 못하는 환경(예: WSL, 일부 Windows VPN/프록시 구성)에서는 SRV 조회가
 * ECONNREFUSED로 실패합니다. 감지 시 Google Public DNS로 대체합니다.
 * ------------------------------------------------------------------ */
(function ensureDnsServers() {
  const servers = dns.getServers();
  const hasOnlyLocalhost =
    servers.length === 0 ||
    servers.every((s) => s === "127.0.0.1" || s === "::1");

  if (hasOnlyLocalhost) {
    console.warn(
      `[dns] Node.js DNS servers are localhost-only (${servers.join(",")}), overriding with 8.8.8.8 / 8.8.4.4`
    );
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
  }
})();

const app = createApp();

const port = env.PORT;

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