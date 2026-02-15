import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createApp } from "../src/app";

interface PartnerWorkflowResponse {
  rows: Array<Record<string, unknown>>;
  pageSize: number;
  hasMore: boolean;
  total?: number;
  meta: {
    partnerId: string;
    memberCount: number;
    processedChunks: number;
    failedChunks: Array<Record<string, unknown>>;
    elapsedMs: number;
    executionPlan: {
      strategy: string;
      windowCount: number;
      windows: Array<{ start: string; end: string }>;
      customerBatchSize: number;
      channelChunkSize: number;
      maxWorkers: number;
      estimatedTasks: number;
    };
  };
}

async function run() {
  const partnerId = (process.env.SMOKE_PARTNER_ID ?? "").trim();
  if (!process.env.MONGODB_URI || !partnerId) {
    console.log("Smoke test skipped: MONGODB_URI or SMOKE_PARTNER_ID is not configured");
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
    const response = await fetch(`${baseUrl}/api/data/query-partner/conversations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        partnerId,
        dateRange: {
          start: "2026-02-01T00:00:00.000Z",
          end: "2026-02-15T23:59:59.999Z",
        },
        chunkOptions: {
          customerBatchSize: 50,
          channelChunkSize: 10,
          maxWorkers: 1,
          pauseMs: 0,
          maxRetries: 1,
        },
        rowLimit: 100,
        includeTotal: true,
      }),
    });

    const payload = (await response.json()) as
      | (PartnerWorkflowResponse & {
          error?: string;
          message?: string;
          detail?: string;
        });

    assert.equal(
      response.status,
      200,
      `expected 200 for partner workflow request, got ${response.status}: ${JSON.stringify(payload)}`,
    );

    assert.ok(Array.isArray(payload.rows), "rows should be array");
    assert.ok(typeof payload.pageSize === "number", "pageSize should be numeric");
    assert.ok(typeof payload.hasMore === "boolean", "hasMore should be boolean");
    assert.ok(payload.meta, "meta should be present");
    assert.equal(payload.meta.partnerId, partnerId, "meta.partnerId should match request partnerId");
    assert.ok(typeof payload.meta.memberCount === "number", "meta.memberCount should be numeric");
    assert.ok(typeof payload.meta.processedChunks === "number", "meta.processedChunks should be numeric");
    assert.ok(Array.isArray(payload.meta.failedChunks), "meta.failedChunks should be array");
    assert.ok(typeof payload.meta.elapsedMs === "number", "meta.elapsedMs should be numeric");
    assert.equal(payload.meta.executionPlan.strategy, "monthly_window_forced");
    assert.ok(Array.isArray(payload.meta.executionPlan.windows), "executionPlan.windows should be array");
    assert.ok(payload.meta.executionPlan.windowCount >= 1, "executionPlan.windowCount should be positive");

    console.log("Smoke test passed: partner conversation workflow endpoint");
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
