import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "../src/app";

interface ErrorResponse {
  error: string;
  message: string;
}

async function run() {
  const app = createApp();
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to resolve test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const missingTarget = await fetch(`${baseUrl}/api/data/summary/period`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataType: "api_usage_logs",
        groupBy: "month",
        dateRange: {
          start: "2025-08-01T00:00:00.000Z",
          end: "2026-01-31T23:59:59.999Z",
        },
      }),
    });

    assert.equal(missingTarget.status, 400, "expected 400 when no customerId/channelIds");

    const missingTargetBody = (await missingTarget.json()) as ErrorResponse;
    assert.equal(missingTargetBody.error, "invalid_request");

    const invalidGroupBy = await fetch(`${baseUrl}/api/data/summary/period`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataType: "api_usage_logs",
        groupBy: "weekly",
        customerId: "user_123",
        dateRange: {
          start: "2025-08-01T00:00:00.000Z",
          end: "2026-01-31T23:59:59.999Z",
        },
      }),
    });

    assert.equal(invalidGroupBy.status, 400, "expected 400 for invalid groupBy");

    console.log("Smoke test passed: POST /api/data/summary/period validation");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

void run().catch((error) => {
  console.error("Smoke test failed", error);
  process.exit(1);
});
