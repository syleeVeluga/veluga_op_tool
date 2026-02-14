export type UserRole = "super_admin" | "admin" | "user";

export interface DashboardUser {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface SafeDashboardUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
