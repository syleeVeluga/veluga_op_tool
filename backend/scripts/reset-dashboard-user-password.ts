import { env } from "../src/config/env";
import { closeMongoConnection } from "../src/config/database";
import { resetUserPasswordByEmail } from "../src/services/userService";

interface CliArgs {
  email: string;
  password: string;
  activate: boolean;
  mustChangePassword?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let email = "";
  let password = "";
  let activate = false;
  let mustChangePassword: boolean | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--email") {
      email = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--password") {
      password = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--activate") {
      activate = true;
      continue;
    }

    if (arg === "--must-change-password") {
      mustChangePassword = true;
      continue;
    }

    if (arg === "--no-must-change-password") {
      mustChangePassword = false;
      continue;
    }
  }

  if (!email || !password) {
    throw new Error(
      "Usage: tsx scripts/reset-dashboard-user-password.ts --email <email> --password <new-password> [--activate] [--must-change-password|--no-must-change-password]"
    );
  }

  return { email, password, activate, mustChangePassword };
}

async function run(): Promise<void> {
  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  const args = parseArgs(process.argv.slice(2));
  const updated = await resetUserPasswordByEmail({
    email: args.email,
    password: args.password,
    isActive: args.activate ? true : undefined,
    mustChangePassword: args.mustChangePassword,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        user: {
          id: updated.id,
          email: updated.email,
          role: updated.role,
          isActive: updated.isActive,
          mustChangePassword: updated.mustChangePassword,
          updatedAt: updated.updatedAt,
        },
      },
      null,
      2
    )
  );
}

void run()
  .catch((error) => {
    console.error(
      "Password reset failed",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongoConnection().catch(() => undefined);
  });