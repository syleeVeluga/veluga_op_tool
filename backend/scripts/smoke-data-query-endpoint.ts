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
    const invalidResponse = await fetch(`${baseUrl}/api/data/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataType: "event_logs",
        customerId: "",
        dateRange: { start: "", end: "" },
      }),
    });

    assert.equal(invalidResponse.status, 400, "expected 400 for invalid body");

    const invalidJson = (await invalidResponse.json()) as ErrorResponse;
    assert.equal(invalidJson.error, "invalid_request");

    const injectionResponse = await fetch(`${baseUrl}/api/data/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataType: "event_logs",
        customerId: "user_123",
        dateRange: {
          start: "2026-01-01T00:00:00.000Z",
          end: "2026-01-31T23:59:59.999Z",
        },
        filters: {
          serverType: { $ne: "api" },
        },
      }),
    });

    assert.equal(injectionResponse.status, 400, "expected 400 for unsafe filter key");

    const injectionJson = (await injectionResponse.json()) as ErrorResponse;
    assert.equal(injectionJson.error, "invalid_request");

    const invalidIncludeTotalResponse = await fetch(`${baseUrl}/api/data/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataType: "event_logs",
        customerId: "user_123",
        dateRange: {
          start: "2026-01-01T00:00:00.000Z",
          end: "2026-01-31T23:59:59.999Z",
        },
        includeTotal: "yes",
      }),
    });

    assert.equal(
      invalidIncludeTotalResponse.status,
      400,
      "expected 400 for invalid includeTotal type"
    );

    console.log("Smoke test passed: POST /api/data/query validation");
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
