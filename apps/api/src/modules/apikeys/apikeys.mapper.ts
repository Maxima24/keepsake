import { ApiKeyDto, MintedApiKeyDto } from './dto/api-key.dto';

// Structural row shape (no Prisma import at the mapper boundary).
interface ApiKeyRow {
  id: string;
  label: string;
  prefix: string;
  serviceUserId: string;
  disabled: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function toApiKeyDto(r: ApiKeyRow): ApiKeyDto {
  return {
    id: r.id,
    label: r.label,
    prefix: r.prefix,
    serviceUserId: r.serviceUserId,
    disabled: r.disabled,
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toMintedApiKeyDto(r: ApiKeyRow, key: string): MintedApiKeyDto {
  return { ...toApiKeyDto(r), key };
}
