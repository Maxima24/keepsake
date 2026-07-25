import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SourcesService } from './sources.service';
import { CreateSourceDto, SetMappingDto, SourceDto } from './dto/sources.dto';

@Roles('admin', 'accountant', 'auditor')
@Controller('sources')
export class SourcesController {
  constructor(private readonly sources: SourcesService) {}

  @Get()
  list(): Promise<SourceDto[]> {
    return this.sources.list();
  }

  @Roles('admin')
  @Post()
  create(@Body() dto: CreateSourceDto): Promise<SourceDto> {
    return this.sources.create(dto.name, dto.kind);
  }

  @Roles('admin')
  @Post(':id/mapping')
  setMapping(
    @Param('id') id: string,
    @Body() dto: SetMappingDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SourceDto> {
    return this.sources.setMapping(id, dto.mapping, actor.id);
  }
}
