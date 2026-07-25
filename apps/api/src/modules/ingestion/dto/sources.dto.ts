import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateSourceDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(['ledger', 'counterparty'])
  kind!: 'ledger' | 'counterparty';
}

export class SetMappingDto {
  // The mapping profile (see mapping.ts MappingProfile). Stored as JSON; shape is
  // validated at parse time so a source can be registered before its columns are known.
  @IsObject()
  mapping!: Record<string, unknown>;
}

export interface SourceDto {
  id: string;
  name: string;
  kind: string;
  hasMapping: boolean;
  createdAt: string;
}
