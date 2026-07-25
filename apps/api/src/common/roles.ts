/** RBAC roles. String-union so non-repository code never imports the Prisma enum.
 * `service` is a machine identity behind an API key (ingestion), never an interactive login. */
export const ROLES = ['admin', 'accountant', 'auditor', 'viewer', 'service'] as const;
export type Role = (typeof ROLES)[number];
