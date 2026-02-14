import assert from "node:assert/strict";
import { buildAggregationPipeline, buildCountPipeline } from "../src/services/queryBuilder";

function run() {
  const pipeline = buildAggregationPipeline({
    dataType: "event_logs",
    customerId: "user_123",
    dateRange: {
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-31T23:59:59.999Z",
    },
    filters: {
      serverType: "api",
      action: "login",
      channel_id: "chn_001",
    },
    columns: ["timestamp", "user_id", "action"],
    pageSize: 100,
    cursor: {
      afterTs: "2026-01-15T00:00:00.000Z",
      afterId: "65f2b3f1e73f7302a12d3b77",
    },
  });

  assert.equal(Array.isArray(pipeline), true);
  assert.equal(pipeline.length, 4);
  assert.deepEqual(pipeline[1], { $sort: { timestamp: -1, _id: -1 } });
  assert.deepEqual(pipeline[3], { $limit: 101 });

  const countPipeline = buildCountPipeline({
    dataType: "event_logs",
    customerId: "user_123",
    dateRange: {
      start: "2026-01-01T00:00:00.000Z",
      end: "2026-01-31T23:59:59.999Z",
    },
    filters: {
      serverType: "api",
    },
  });

  assert.deepEqual(countPipeline[1], { $count: "total" });

  assert.throws(() => {
    buildAggregationPipeline({
      dataType: "event_logs",
      customerId: "",
      dateRange: {
        start: "2026-01-01T00:00:00.000Z",
        end: "2026-01-31T23:59:59.999Z",
      },
    });
  });

  assert.throws(() => {
    buildAggregationPipeline({
      dataType: "event_logs",
      customerId: "user_123",
      dateRange: {
        start: "2026-02-01T00:00:00.000Z",
        end: "2026-01-01T00:00:00.000Z",
      },
    });
  });

  console.log("Smoke test passed: queryBuilder pipeline + guards");
}

run();
