import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import {
  FilesRepository,
  ImportError,
  ImportRecord,
} from './files.repository';
import { SourcesRepository } from './sources.repository';
import { MappingProfile, mapRow } from './mapping';
import { FileDto, FileRowError, FileUploadResultDto } from './dto/file.dto';

interface FileRow {
  id: string;
  sourceId: string;
  filename: string;
  contentHash: string;
  rowCount: number;
  errorCount: number;
  status: string;
  errors: unknown;
  createdAt: Date;
}

function toFileDto(f: FileRow): FileDto {
  return {
    id: f.id,
    sourceId: f.sourceId,
    filename: f.filename,
    contentHash: f.contentHash,
    rowCount: f.rowCount,
    errorCount: f.errorCount,
    status: f.status,
    errors: (f.errors as FileRowError[] | null) ?? [],
    createdAt: f.createdAt.toISOString(),
  };
}

@Injectable()
export class FilesService {
  constructor(
    private readonly files: FilesRepository,
    private readonly sources: SourcesRepository,
  ) {}

  /** Upload + parse + map a counterparty CSV. Idempotent by content hash. */
  async upload(
    sourceName: string,
    buffer: Buffer,
    filename: string,
    actorId: string,
  ): Promise<FileUploadResultDto> {
    const source = await this.sources.ensureCounterparty(sourceName);
    if (source.mapping == null) {
      throw new BadRequestException(
        `Source "${sourceName}" has no mapping profile; set one via POST /sources/${source.id}/mapping first.`,
      );
    }

    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const existing = await this.files.findByContentHash(contentHash);
    if (existing) {
      return { ...toFileDto(existing), duplicate: true };
    }

    const profile = source.mapping as unknown as MappingProfile;
    let rows: Record<string, string>[];
    try {
      rows = parse(buffer, {
        columns: profile.hasHeader !== false,
        delimiter: profile.delimiter ?? ',',
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }) as unknown as Record<string, string>[];
    } catch (e) {
      throw new BadRequestException(
        `CSV parse failed: ${e instanceof Error ? e.message : 'unknown error'}`,
      );
    }

    // Per-row mapping — a bad row is reported, never fatal to the file.
    const records: ImportRecord[] = [];
    const errors: ImportError[] = [];
    rows.forEach((row, i) => {
      try {
        records.push({ ...mapRow(row, profile.columns), rawRow: row });
      } catch (e) {
        errors.push({
          row: i + 1,
          error: e instanceof Error ? e.message : 'row mapping failed',
        });
      }
    });

    const file = await this.files.importFile({
      sourceId: source.id,
      filename,
      contentHash,
      records,
      errors,
      actorId,
    });
    return { ...toFileDto(file), duplicate: false };
  }

  async get(id: string): Promise<FileDto> {
    const file = await this.files.get(id);
    if (!file) throw new NotFoundException(`File ${id} not found.`);
    return toFileDto(file);
  }
}
