import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/authService";
import { getUserById, toSafeUser } from "../services/userService";
import type { DashboardUser, UserRole } from "../types/auth";

declare global {
  namespace Express {
    interface Request {
      authUser?: DashboardUser;
    }
  }
}

function parseBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim() || null;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = parseBearerToken(req.header("authorization"));

  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Missing bearer token" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await getUserById(payload.sub);

    if (!user || !user.isActive) {
      res.status(401).json({ error: "unauthorized", message: "Invalid user" });
      return;
    }

    req.authUser = user;
    next();
  } catch (error) {
    res.status(401).json({
      error: "unauthorized",
      message: "Invalid token",
      detail: error instanceof Error ? error.message : "unknown error",
    });
  }
}

export function requireAnyRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.authUser;
    if (!user) {
      res.status(401).json({ error: "unauthorized", message: "Login required" });
      return;
    }

    if (!roles.includes(user.role)) {
      res.status(403).json({
        error: "forbidden",
        message: "Insufficient role",
        requiredRoles: roles,
        currentRole: user.role,
      });
      return;
    }

    next();
  };
}

export function getRequestUserSafe(req: Request) {
  if (!req.authUser) {
    return null;
  }

  return toSafeUser(req.authUser);
}
