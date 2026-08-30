import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSessionService } from './auth-session.service';

export const cloudlessAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(AuthSessionService).accessToken();
  if (!token || request.url.includes('/auth/token')) return next(request);
  return next(
    request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
};
