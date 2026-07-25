export type Role = 'admin' | 'accountant' | 'auditor' | 'viewer';

export interface User {
  id: string;
  email: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
}

export interface RetentionPolicy {
  auditRetentionDays: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}
