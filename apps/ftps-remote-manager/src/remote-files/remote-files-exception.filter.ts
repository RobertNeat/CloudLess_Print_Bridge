import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Response } from 'express';
import { RemoteStorageOperationError } from '../ftps/remote-storage.errors';
import { InvalidRemoteFileSelectorError } from './remote-file-selector';
import {
  InvalidRemotePathError,
  ProtectedRemotePathError,
} from './remote-path.errors';

@Injectable()
@Catch(
  InvalidRemotePathError,
  ProtectedRemotePathError,
  InvalidRemoteFileSelectorError,
  RemoteStorageOperationError,
)
export class RemoteFilesExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      | InvalidRemotePathError
      | ProtectedRemotePathError
      | InvalidRemoteFileSelectorError
      | RemoteStorageOperationError,
    host: ArgumentsHost,
  ): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      response.destroy(exception);
      return;
    }

    const status = statusFor(exception);
    response
      .status(status)
      .type('application/json')
      .json({
        statusCode: status,
        message: messageFor(exception),
      });
  }
}

function statusFor(
  exception:
    | InvalidRemotePathError
    | ProtectedRemotePathError
    | InvalidRemoteFileSelectorError
    | RemoteStorageOperationError,
): number {
  if (!(exception instanceof RemoteStorageOperationError)) {
    return HttpStatus.BAD_REQUEST;
  }
  switch (exception.kind) {
    case 'timeout':
      return HttpStatus.GATEWAY_TIMEOUT;
    case 'not-found':
      return HttpStatus.NOT_FOUND;
    case 'conflict':
      return HttpStatus.CONFLICT;
    default:
      return HttpStatus.BAD_GATEWAY;
  }
}

function messageFor(
  exception:
    | InvalidRemotePathError
    | ProtectedRemotePathError
    | InvalidRemoteFileSelectorError
    | RemoteStorageOperationError,
): string {
  if (!(exception instanceof RemoteStorageOperationError)) {
    return exception.message;
  }
  switch (exception.kind) {
    case 'timeout':
      return 'Remote storage operation timed out';
    case 'not-found':
      return 'Remote entry was not found';
    case 'conflict':
      return 'Remote entry conflicts with an existing entry';
    default:
      return 'Remote storage is unavailable';
  }
}
