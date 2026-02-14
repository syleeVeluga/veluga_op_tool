import { Router } from "express";
import { z } from "zod";
import { requireAuth, getRequestUserSafe } from "../middleware/authz";
import { issueAccessToken, verifyPassword } from "../services/authService";
import {
  changeOwnPassword,
  getUserByEmail,
  getUserById,
  prepareUserStore,
} from "../services/userService";

const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_request",
      message: "Invalid login payload",
    });
    return;
  }

  try {
    await prepareUserStore();
    const user = await getUserByEmail(parsed.data.email);

    if (!user || !user.isActive) {
      res.status(401).json({ error: "invalid_credentials", message: "Invalid credentials" });
      return;
    }

    const matched = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!matched) {
      res.status(401).json({ error: "invalid_credentials", message: "Invalid credentials" });
      return;
    }

    const token = issueAccessToken(user);

    res.status(200).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "login_failed",
      message: "Failed to login",
      detail: error instanceof Error ? error.message : "unknown error",
    });
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = getRequestUserSafe(req);
  res.status(200).json({ user });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success || !req.authUser) {
    res.status(400).json({
      error: "invalid_request",
      message: "Invalid change-password payload",
    });
    return;
  }

  try {
    await changeOwnPassword({
      userId: req.authUser._id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });

    const refreshed = await getUserById(req.authUser._id);
    res.status(200).json({
      ok: true,
      user: refreshed
        ? {
            id: refreshed._id,
            email: refreshed.email,
            name: refreshed.name,
            role: refreshed.role,
            mustChangePassword: refreshed.mustChangePassword,
          }
        : null,
    });
  } catch (error) {
    res.status(400).json({
      error: "change_password_failed",
      message: error instanceof Error ? error.message : "Failed to change password",
    });
  }
});

export { authRouter };
