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
    const tooManyChannels = await fetch(
      `${baseUrl}/api/data/query-batch/conversations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channelIds: Array.from({ length: 501 }, (_, index) => `ch_${index}`),
          dateRange: {
            start: "2025-08-01T00:00:00.000Z",
            end: "2026-01-31T23:59:59.999Z",
          },
        }),
      }
    );

    assert.equal(tooManyChannels.status, 400, "expected 400 for 501 channels");

    const tooManyChannelsBody = (await tooManyChannels.json()) as ErrorResponse;
    assert.equal(tooManyChannelsBody.error, "invalid_request");

    const unsafePayload = await fetch(
      `${baseUrl}/api/data/query-batch/conversations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channelIds: ["ch_1", "ch_2"],
          dateRange: {
            start: "2025-08-01T00:00:00.000Z",
            end: "2026-01-31T23:59:59.999Z",
          },
          filters: {
            channel: { $ne: "ch_1" },
          },
        }),
      }
    );

    assert.equal(unsafePayload.status, 400, "expected 400 for unsafe $ key");

    console.log("Smoke test passed: POST /api/data/query-batch/conversations validation");
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
