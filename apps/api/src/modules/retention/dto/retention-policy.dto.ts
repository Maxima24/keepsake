export interface RetentionPolicyDto {
  auditRetentionDays: number | null; // null/0 => retain everything (archival off)
  updatedAt: string | null;
  updatedBy: string | null;
}
