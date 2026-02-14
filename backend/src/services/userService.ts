import { Collection, ObjectId } from "mongodb";
import { env } from "../config/env";
import { getOpsToolDb } from "../config/database";
import type { DashboardUser, SafeDashboardUser, UserRole } from "../types/auth";
import { hashPassword, verifyPassword } from "./authService";

interface DashboardUserDocument {
  _id: ObjectId;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  mustChangePassword?: boolean;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const USERS_COLLECTION = "dashboard_users";
let bootstrapDone = false;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getSuperAdminEmails(): string[] {
  return env.SUPER_ADMIN_EMAILS.map((email) => normalizeEmail(email)).filter(
    (email, index, source) => email.length > 0 && source.indexOf(email) === index
  );
}

async function getUsersCollection(): Promise<Collection<DashboardUserDocument>> {
  const db = await getOpsToolDb();
  const collection = db.collection<DashboardUserDocument>(USERS_COLLECTION);
  await collection.createIndex({ email: 1 }, { unique: true });
  return collection;
}

function toModel(doc: DashboardUserDocument): DashboardUser {
  return {
    _id: doc._id.toHexString(),
    email: doc.email,
    name: doc.name,
    role: doc.role,
    passwordHash: doc.passwordHash,
    mustChangePassword: doc.mustChangePassword ?? false,
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toSafeUser(user: DashboardUser): SafeDashboardUser {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

async function ensureBootstrapSuperAdmins(): Promise<void> {
  if (bootstrapDone) {
    return;
  }

  const superAdminEmails = getSuperAdminEmails();
  if (superAdminEmails.length === 0) {
    bootstrapDone = true;
    return;
  }

  const collection = await getUsersCollection();
  const defaultPasswordHash = await hashPassword(env.SUPER_ADMIN_INITIAL_PASSWORD);
  const now = new Date();

  for (const email of superAdminEmails) {
    const existing = await collection.findOne({ email });
    if (existing) {
      continue;
    }

    await collection.insertOne({
      _id: new ObjectId(),
      email,
      name: email.split("@")[0] ?? "superadmin",
      role: "super_admin",
      passwordHash: defaultPasswordHash,
      mustChangePassword: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  bootstrapDone = true;
}

export async function prepareUserStore(): Promise<void> {
  await ensureBootstrapSuperAdmins();
}

export async function getUserByEmail(email: string): Promise<DashboardUser | null> {
  await ensureBootstrapSuperAdmins();
  const collection = await getUsersCollection();
  const doc = await collection.findOne({ email: normalizeEmail(email) });
  return doc ? toModel(doc) : null;
}

export async function getUserById(id: string): Promise<DashboardUser | null> {
  await ensureBootstrapSuperAdmins();

  if (!ObjectId.isValid(id)) {
    return null;
  }

  const collection = await getUsersCollection();
  const doc = await collection.findOne({ _id: new ObjectId(id) });
  return doc ? toModel(doc) : null;
}

export async function listUsers(): Promise<SafeDashboardUser[]> {
  await ensureBootstrapSuperAdmins();
  const collection = await getUsersCollection();
  const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
  return docs.map((doc) => toSafeUser(toModel(doc)));
}

export async function createUser(input: {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  isActive?: boolean;
}): Promise<SafeDashboardUser> {
  await ensureBootstrapSuperAdmins();
  const collection = await getUsersCollection();
  const email = normalizeEmail(input.email);
  const now = new Date();

  const existing = await collection.findOne({ email });
  if (existing) {
    throw new Error("Email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const doc: DashboardUserDocument = {
    _id: new ObjectId(),
    email,
    name: input.name.trim(),
    role: input.role,
    passwordHash,
    mustChangePassword: true,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne(doc);
  return toSafeUser(toModel(doc));
}

export async function updateUser(
  id: string,
  input: {
    email?: string;
    name?: string;
    role?: UserRole;
    password?: string;
    isActive?: boolean;
  }
): Promise<SafeDashboardUser> {
  await ensureBootstrapSuperAdmins();

  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid user id");
  }

  const collection = await getUsersCollection();
  const objectId = new ObjectId(id);
  const existing = await collection.findOne({ _id: objectId });

  if (!existing) {
    throw new Error("User not found");
  }

  const nextEmail = input.email ? normalizeEmail(input.email) : existing.email;

  if (nextEmail !== existing.email) {
    const duplicate = await collection.findOne({ email: nextEmail, _id: { $ne: objectId } });
    if (duplicate) {
      throw new Error("Email already exists");
    }
  }

  const updateDoc: Partial<DashboardUserDocument> = {
    email: nextEmail,
    name: input.name ? input.name.trim() : existing.name,
    role: input.role ?? existing.role,
    isActive: input.isActive ?? (existing.isActive ?? true),
    updatedAt: new Date(),
  };

  if (input.password) {
    updateDoc.passwordHash = await hashPassword(input.password);
    updateDoc.mustChangePassword = true;
  }

  await collection.updateOne({ _id: objectId }, { $set: updateDoc });

  const updated = await collection.findOne({ _id: objectId });
  if (!updated) {
    throw new Error("User not found after update");
  }

  return toSafeUser(toModel(updated));
}

export async function deleteUser(id: string): Promise<void> {
  await ensureBootstrapSuperAdmins();

  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid user id");
  }

  const collection = await getUsersCollection();
  const objectId = new ObjectId(id);
  const result = await collection.deleteOne({ _id: objectId });

  if (result.deletedCount === 0) {
    throw new Error("User not found");
  }
}

export async function changeOwnPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await ensureBootstrapSuperAdmins();

  if (!ObjectId.isValid(input.userId)) {
    throw new Error("Invalid user id");
  }

  const collection = await getUsersCollection();
  const objectId = new ObjectId(input.userId);
  const existing = await collection.findOne({ _id: objectId });

  if (!existing) {
    throw new Error("User not found");
  }

  const matched = await verifyPassword(input.currentPassword, existing.passwordHash);
  if (!matched) {
    throw new Error("Current password is incorrect");
  }

  const passwordHash = await hashPassword(input.newPassword);

  await collection.updateOne(
    { _id: objectId },
    {
      $set: {
        passwordHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      },
    }
  );
}
