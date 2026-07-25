import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/roles';
import { ApiKeyRepository, hashKey } from './apikeys.repository';
import { toApiKeyDto, toMintedApiKeyDto } from './apikeys.mapper';
import { ApiKeyDto, MintedApiKeyDto } from './dto/api-key.dto';

@Injectable()
export class ApiKeyService {
  constructor(private readonly repo: ApiKeyRepository) {}

  /** Resolve a raw `X-API-Key` to the service principal, or throw. */
  async authenticate(rawKey: string): Promise<AuthUser> {
    const key = await this.repo.findByHash(hashKey(rawKey));
    if (!key || key.disabled) {
      throw new UnauthorizedException('Invalid API key.');
    }
    const user = await this.repo.findServiceUser(key.serviceUserId);
    if (!user || user.disabled) {
      throw new UnauthorizedException('API key is not active.');
    }
    void this.repo.touch(key.id); // best-effort last-used stamp
    return {
      id: user.id,
      email: user.email,
      role: user.role as Role,
      disabled: user.disabled,
    };
  }

  async mint(label: string, actorId: string): Promise<MintedApiKeyDto> {
    const { record, key } = await this.repo.mint(label, actorId);
    return toMintedApiKeyDto(record, key);
  }

  async list(): Promise<ApiKeyDto[]> {
    return (await this.repo.list()).map(toApiKeyDto);
  }

  async revoke(id: string, actorId: string): Promise<ApiKeyDto> {
    return toApiKeyDto(await this.repo.revoke(id, actorId));
  }
}
