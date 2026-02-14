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
    const tooShort = await fetch(`${baseUrl}/api/customers/search?q=a`);
    assert.equal(tooShort.status, 400, "expected 400 for short query");

    const body = (await tooShort.json()) as ErrorResponse;
    assert.equal(body.error, "invalid_query");

    console.log("Smoke test passed: GET /api/customers/search (min-length guard)");
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
