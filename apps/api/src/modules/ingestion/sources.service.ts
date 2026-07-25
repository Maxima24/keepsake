import { Injectable } from '@nestjs/common';
import { SourcesRepository } from './sources.repository';
import { SourceDto } from './dto/sources.dto';

interface SourceRow {
  id: string;
  name: string;
  kind: string;
  mapping: unknown;
  createdAt: Date;
}

function toSourceDto(r: SourceRow): SourceDto {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    hasMapping: r.mapping != null,
    createdAt: r.createdAt.toISOString(),
  };
}

@Injectable()
export class SourcesService {
  constructor(private readonly repo: SourcesRepository) {}

  async list(): Promise<SourceDto[]> {
    return (await this.repo.list()).map(toSourceDto);
  }

  async create(name: string, kind: 'ledger' | 'counterparty'): Promise<SourceDto> {
    return toSourceDto(await this.repo.create(name, kind));
  }

  async setMapping(
    id: string,
    mapping: Record<string, unknown>,
    actorId: string,
  ): Promise<SourceDto> {
    return toSourceDto(await this.repo.setMapping(id, mapping, actorId));
  }
}
