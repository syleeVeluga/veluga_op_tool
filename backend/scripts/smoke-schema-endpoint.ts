import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "../src/app";

interface SchemaResponse {
  columns: Array<{ key: string; label: string; type: string }>;
  filters: Array<{ key: string; label: string; type: string; options?: string[] }>;
}

interface ErrorResponse {
  error: string;
  message: string;
  supportedDataTypes: string[];
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
    const okResponse = await fetch(`${baseUrl}/api/schema/api_usage_logs`);
    assert.equal(okResponse.status, 200, "expected 200 for valid dataType");

    const okJson = (await okResponse.json()) as SchemaResponse;
    assert.ok(Array.isArray(okJson.columns), "columns should be an array");
    assert.ok(Array.isArray(okJson.filters), "filters should be an array");
    assert.ok(okJson.columns.length > 0, "columns should not be empty");
    assert.ok(
      okJson.columns.every((column) =>
        ["key", "label", "type"].every((field) => field in column)
      ),
      "all columns should include key/label/type"
    );

    const badResponse = await fetch(`${baseUrl}/api/schema/not_supported_type`);
    assert.equal(badResponse.status, 400, "expected 400 for invalid dataType");

    const badJson = (await badResponse.json()) as ErrorResponse;
    assert.equal(badJson.error, "invalid_data_type");
    assert.ok(Array.isArray(badJson.supportedDataTypes));
    assert.ok(
      badJson.supportedDataTypes.includes("api_usage_logs"),
      "supportedDataTypes should include api_usage_logs"
    );

    console.log("Smoke test passed: GET /api/schema/:dataType (valid + invalid)");
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
