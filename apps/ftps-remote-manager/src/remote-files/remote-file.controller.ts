import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  PayloadTooLargeException,
  Query,
  Req,
  Res,
  UnsupportedMediaTypeException,
  UseFilters,
} from '@nestjs/common';
import type {
  CreateRemoteDirectoryRequestDto,
  DeleteRemoteFilesByNameRequestDto,
  MoveRemoteEntryRequestDto,
} from '@cloudless/printer-contracts';
import type { Request, Response } from 'express';
import { SERVICE_CONFIG } from '../config/config.module';
import type { ServiceConfig } from '../config/service-config';
import { RemoteFileService } from './remote-file.service';
import { RemoteFilesExceptionFilter } from './remote-files-exception.filter';
import {
  DeleteByNameRequestPipe,
  OptionalBooleanPipe,
  OptionalStringPipe,
  RequiredStringFieldsPipe,
  RequiredStringPipe,
  UploadSizeLimitStream,
} from './request-validation';

@Controller('files')
@UseFilters(RemoteFilesExceptionFilter)
export class RemoteFileController {
  constructor(
    private readonly files: RemoteFileService,
    @Inject(SERVICE_CONFIG) private readonly config: ServiceConfig,
  ) {}

  @Get('connection')
  testConnection() {
    return this.files.testConnection();
  }

  @Get()
  list(@Query('path', new OptionalStringPipe('path', '/')) path: string) {
    return this.files.list(path);
  }

  @Post('move')
  @HttpCode(HttpStatus.NO_CONTENT)
  move(
    @Body(new RequiredStringFieldsPipe(['source', 'destination'] as const))
    body: MoveRemoteEntryRequestDto,
  ) {
    return this.files.move(body.source, body.destination);
  }

  @Post('directories')
  @HttpCode(HttpStatus.NO_CONTENT)
  createDirectory(
    @Body(new RequiredStringFieldsPipe(['path'] as const))
    body: CreateRemoteDirectoryRequestDto,
  ) {
    return this.files.createDirectory(body.path);
  }

  @Delete('directories')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDirectory(@Query('path', new RequiredStringPipe('path')) path: string) {
    return this.files.deleteDirectory(path);
  }

  @Delete('by-name/:name')
  deleteFilesByName(
    @Param('name', new RequiredStringPipe('name')) name: string,
    @Body(new DeleteByNameRequestPipe())
    body: DeleteRemoteFilesByNameRequestDto,
  ) {
    return this.files.deleteFilesByName(name, body.targets);
  }

  @Delete('by-extension')
  deleteFilesByExtension(
    @Query('path', new RequiredStringPipe('path')) path: string,
    @Query('extension', new RequiredStringPipe('extension'))
    extension: string,
  ) {
    return this.files.deleteFilesByExtension(path, extension);
  }

  @Get('*path')
  @Header('Content-Type', 'application/octet-stream')
  download(
    @Param('path') path: string | string[],
    @Res() response: Response,
  ): Promise<void> {
    return this.files.download(this.wildcardPath(path), response);
  }

  @Put('*path')
  @HttpCode(HttpStatus.NO_CONTENT)
  upload(
    @Param('path') path: string | string[],
    @Query('force', new OptionalBooleanPipe('force', false)) force: boolean,
    @Req() request: Request,
  ) {
    if (!request.is('application/octet-stream')) {
      throw new UnsupportedMediaTypeException(
        'Content-Type must be application/octet-stream',
      );
    }
    this.assertContentLength(request.headers['content-length']);
    return this.files.upload(
      this.wildcardPath(path),
      request.pipe(new UploadSizeLimitStream(this.config.upload.maximumBytes)),
      force,
    );
  }

  @Delete('*path')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteFile(@Param('path') path: string | string[]) {
    return this.files.deleteFile(this.wildcardPath(path));
  }

  private wildcardPath(value: string | string[]): string {
    return `/${Array.isArray(value) ? value.join('/') : value}`;
  }

  private assertContentLength(value: string | undefined): void {
    if (value === undefined) return;
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(
        'Content-Length must be a non-negative integer',
      );
    }
    if (Number(value) > this.config.upload.maximumBytes) {
      throw new PayloadTooLargeException(
        `Upload exceeds the ${this.config.upload.maximumBytes} byte limit`,
      );
    }
  }
}
