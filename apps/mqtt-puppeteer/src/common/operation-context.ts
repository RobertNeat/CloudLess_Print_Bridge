import {
  createParamDecorator,
  ExecutionContext,
  Injectable,
  type CallHandler,
  type NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';

export interface OperationRequest {
  operationId?: string;
}

@Injectable()
export class OperationContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<OperationRequest>();
    request.operationId ??= randomUUID();
    return next.handle();
  }
}

export const OperationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<OperationRequest>();
    request.operationId ??= randomUUID();
    return request.operationId;
  },
);
