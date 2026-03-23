import assert from "node:assert/strict";
import { createServer } from "node:http";
import { env } from "../src/config/env";
import { createApp } from "../src/app";
import {
  createUser,
  deleteUser,
  prepareUserStore,
  resetUserPasswordByEmail,
} from "../src/services/userService";

async function run() {
  if (!env.MONGODB_URI || !env.JWT_SECRET) {
    console.log("Smoke test skipped: MONGODB_URI or JWT_SECRET is not configured");
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
  const email = `smoke.reset.${Date.now()}@example.com`;
  const oldPassword = "SmokePass123!";
  const newPassword = "ResetPass123!";
  let createdUserId: string | null = null;

  try {
    const created = await createUser({
      email,
      name: "Smoke Reset User",
      role: "user",
      password: oldPassword,
      isActive: true,
    });

    createdUserId = created.id;

    const updated = await resetUserPasswordByEmail({
      email,
      password: newPassword,
      mustChangePassword: false,
    });

    assert.equal(updated.email, email);
    assert.equal(updated.mustChangePassword, false);

    const oldPasswordResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: oldPassword }),
    });
    assert.equal(oldPasswordResponse.status, 401, "expected 401 for old password");

    const newPasswordResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: newPassword }),
    });
    assert.equal(newPasswordResponse.status, 200, "expected 200 for reset password");

    const body = (await newPasswordResponse.json()) as {
      user?: { email?: string; mustChangePassword?: boolean };
      token?: string;
    };
    assert.equal(body.user?.email, email);
    assert.equal(body.user?.mustChangePassword, false);
    assert.ok(body.token, "expected login token after password reset");

    console.log("Smoke test passed: dashboard user password reset enables login");
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