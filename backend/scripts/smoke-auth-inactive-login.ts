import assert from "node:assert/strict";
import { createServer } from "node:http";
import { env } from "../src/config/env";
import { createApp } from "../src/app";
import {
  createUser,
  deleteUser,
  updateUser,
  prepareUserStore,
} from "../src/services/userService";

async function run() {
  if (!env.MONGODB_URI) {
    console.log("Smoke test skipped: MONGODB_URI is not configured");
    return;
  }

  await prepareUserStore();

  const app = createApp();
  const server = createServer(app);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to resolve test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const email = `smoke.inactive.${Date.now()}@example.com`;
  const password = "SmokePass123!";
  let createdUserId: string | null = null;

  try {
    const created = await createUser({
      email,
      name: "Smoke Inactive User",
      role: "user",
      password,
      isActive: true,
    });

    createdUserId = created.id;

    await updateUser(created.id, { isActive: false });

    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    assert.equal(response.status, 401, "expected 401 for inactive user login");

    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, "invalid_credentials");

    console.log("Smoke test passed: inactive user login is blocked");
  } finally {
    if (createdUserId) {
      try {
        await deleteUser(createdUserId);
      } catch {
      }
    }

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
