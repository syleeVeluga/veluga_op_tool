import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { AuthTokenPayload, DashboardUser } from "../types/auth";

const JWT_ALGORITHM = "HS256";
const PASSWORD_SALT_ROUNDS = 10;

function assertJwtSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required for auth endpoints");
  }

  return env.JWT_SECRET;
}

export async function hashPassword(rawPassword: string): Promise<string> {
  return bcrypt.hash(rawPassword, PASSWORD_SALT_ROUNDS);
}

export async function verifyPassword(
  rawPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(rawPassword, passwordHash);
}

export function issueAccessToken(user: DashboardUser): string {
  const payload: AuthTokenPayload = {
    sub: user._id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, assertJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  const verified = jwt.verify(token, assertJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
  });

  if (!verified || typeof verified !== "object") {
    throw new Error("Invalid token payload");
  }

  const payload = verified as Partial<AuthTokenPayload>;

  if (!payload.sub || !payload.email || !payload.role) {
    throw new Error("Invalid token payload fields");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
  };
}
