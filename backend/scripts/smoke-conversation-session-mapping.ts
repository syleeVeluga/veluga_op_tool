import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "../src/app";

interface CustomerReportResponse {
  rows: Array<Record<string, unknown>>;
  summary?: {
    unmatchedCount?: number;
    fallbackCount?: number;
    totalCreditUsed?: number;
    totalRows?: number;
  };
  pageSize: number;
  hasMore: boolean;
}

async function run() {
  if (!process.env.MONGODB_URI) {
    console.log("Smoke test skipped: MONGODB_URI is not configured");
    return;
  }

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
    const response = await fetch(`${baseUrl}/api/data/query`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dataType: "conversations",
        customerId: "65965c32ee6de0ec4c44d183",
        dateRange: {
          start: "2026-02-01T00:00:00.000Z",
          end: "2026-02-15T23:59:59.999Z",
        },
        includeSessionMessages: true,
        reportMode: "customer",
        sortOrder: "asc",
        matchWindowSec: 60,
        pageSize: 20,
      }),
    });

    const payload = (await response.json()) as CustomerReportResponse & {
      error?: string;
      message?: string;
      detail?: string;
    };

    assert.equal(
      response.status,
      200,
      `expected 200 for customer report mode request, got ${response.status}: ${JSON.stringify(payload)}`,
    );

    assert.ok(Array.isArray(payload.rows), "rows should be an array");
    assert.ok(typeof payload.pageSize === "number", "pageSize should be numeric");
    assert.ok(typeof payload.hasMore === "boolean", "hasMore should be boolean");
    assert.ok(payload.summary, "summary should be present in customer report mode");

    if (payload.rows.length > 0) {
      const first = payload.rows[0];
      assert.ok("occurredAt" in first, "row should include occurredAt");
      assert.ok("questionText" in first, "row should include questionText");
      assert.ok("finalAnswerText" in first, "row should include finalAnswerText");
      assert.ok("finalAnswerModel" in first, "row should include finalAnswerModel");
      assert.ok("creditUsed" in first, "row should include creditUsed");
      assert.ok("sessionCreditTotal" in first, "row should include sessionCreditTotal");
      assert.ok("matchSource" in first, "row should include matchSource");
    }

    console.log("Smoke test passed: conversation session mapping customer report mode");
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
