import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateRetentionDto {
  // null / omitted => retain everything (archival off).
  @IsOptional()
  @IsInt()
  @Min(0)
  auditRetentionDays!: number | null;
}
