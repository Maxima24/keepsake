import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** One entry of an ingested transaction. `account` is a NAME (mapped to an Account). */
export class IngestEntryDto {
  @IsString()
  @IsNotEmpty()
  account!: string;

  @IsIn(['debit', 'credit'])
  direction!: 'debit' | 'credit';

  @IsInt()
  @Min(1)
  amount!: number; // positive minor units
}

/** Source A: a transaction the fintech recorded, pushed to Keepsake. */
export class IngestTransactionDto {
  @IsString()
  @IsNotEmpty()
  source!: string; // ingest source name (kind 'ledger')

  @IsString()
  @IsNotEmpty()
  externalId!: string; // their id — idempotency + join key

  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => IngestEntryDto)
  entries!: IngestEntryDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class IngestBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => IngestTransactionDto)
  transactions!: IngestTransactionDto[];
}
