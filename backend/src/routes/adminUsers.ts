import { Router } from "express";
import { z } from "zod";
import { requireAnyRole, requireAuth } from "../middleware/authz";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from "../services/userService";

const adminUsersRouter = Router();

const roleSchema = z.enum(["super_admin", "admin", "user"]);

const createUserSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  role: roleSchema,
  password: z.string().min(8),
  isActive: z.boolean().optional(),
});

const updateUserSchema = z.object({
  email: z.string().trim().email().optional(),
  name: z.string().trim().min(1).optional(),
  role: roleSchema.optional(),
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

adminUsersRouter.use(requireAuth);
adminUsersRouter.use(requireAnyRole(["super_admin", "admin"]));

adminUsersRouter.get("/users", async (_req, res) => {
  try {
    const users = await listUsers();
    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({
      error: "list_users_failed",
      message: "Failed to list users",
      detail: error instanceof Error ? error.message : "unknown error",
    });
  }
});

adminUsersRouter.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: "Invalid create-user payload" });
    return;
  }

  try {
    const created = await createUser(parsed.data);
    res.status(201).json({ user: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create user";
    const status = /already exists/i.test(message) ? 409 : 400;
    res.status(status).json({ error: "create_user_failed", message });
  }
});

adminUsersRouter.put("/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: "Invalid update-user payload" });
    return;
  }

  try {
    const updated = await updateUser(req.params.id, parsed.data);
    res.status(200).json({ user: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user";
    let status = 400;
    if (/not found/i.test(message)) {
      status = 404;
    } else if (/already exists/i.test(message)) {
      status = 409;
    }

    res.status(status).json({ error: "update_user_failed", message });
  }
});

adminUsersRouter.delete("/users/:id", async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete user";
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: "delete_user_failed", message });
  }
});

export { adminUsersRouter };
