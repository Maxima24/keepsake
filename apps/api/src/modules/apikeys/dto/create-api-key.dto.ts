import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;
}
