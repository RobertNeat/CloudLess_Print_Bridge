import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { OperationRequest } from '../common/operation-context';
import { BridgeEventsService } from './bridge-events.service';

interface HttpRequestContext extends OperationRequest {
  method?: string;
  url?: string;
}

@Catch()
export class ServiceExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly events: BridgeEventsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequestContext>();
    const error =
      exception instanceof Error ? exception : new Error(String(exception));
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    this.events.serviceErrors$.next({
      operationId: request.operationId,
      occurredAt: new Date().toISOString(),
      source: 'http',
      name: error.name,
      message: error.message,
      statusCode,
      method: request.method,
      path: request.url,
    });

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? { ...exceptionResponse, operationId: request.operationId }
        : {
            statusCode,
            message:
              typeof exceptionResponse === 'string'
                ? exceptionResponse
                : 'Internal server error',
            operationId: request.operationId,
          };
    this.adapterHost.httpAdapter.reply(http.getResponse(), body, statusCode);
  }
}
