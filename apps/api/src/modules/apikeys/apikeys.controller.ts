import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiKeyService } from './apikeys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyDto, MintedApiKeyDto } from './dto/api-key.dto';

@Roles('admin')
@Controller('api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeys: ApiKeyService) {}

  /** Mint a key. The plaintext `key` is returned ONCE and never again. */
  @Post()
  mint(
    @Body() dto: CreateApiKeyDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<MintedApiKeyDto> {
    return this.apiKeys.mint(dto.label, actor.id);
  }

  @Get()
  list(): Promise<ApiKeyDto[]> {
    return this.apiKeys.list();
  }

  @Delete(':id')
  revoke(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<ApiKeyDto> {
    return this.apiKeys.revoke(id, actor.id);
  }
}
