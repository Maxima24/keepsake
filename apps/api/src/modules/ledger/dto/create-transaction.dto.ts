import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateEntryDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsIn(['debit', 'credit'])
  direction!: 'debit' | 'credit';

  // Positive integer minor units (e.g. kobo/cents). Never floats, never <= 0.
  @IsInt()
  @Min(1)
  amount!: number;
}

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => CreateEntryDto)
  entries!: CreateEntryDto[];
}
