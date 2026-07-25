import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { FilesService } from './files.service';
import { FileDto, FileUploadResultDto } from './dto/file.dto';

// Minimal shape of a memory-stored multer file (avoids depending on @types/express).
interface UploadedCsv {
  buffer: Buffer;
  originalname: string;
}

@Roles('service', 'admin', 'accountant')
@Controller('ingest/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: UploadedCsv | undefined,
    @Body('sourceName') sourceName: string,
    @CurrentUser() user: AuthUser,
  ): Promise<FileUploadResultDto> {
    if (!file) throw new BadRequestException('No file uploaded (field "file").');
    if (!sourceName) throw new BadRequestException('sourceName is required.');
    return this.files.upload(
      sourceName,
      file.buffer,
      file.originalname,
      user.id,
    );
  }

  @Roles('admin', 'accountant', 'auditor')
  @Get(':id')
  get(@Param('id') id: string): Promise<FileDto> {
    return this.files.get(id);
  }
}
