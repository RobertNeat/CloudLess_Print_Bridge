import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { DashboardCatalogService, type DashboardId } from './dashboard-catalog.service';
import { AccessPolicy, type Permission } from './auth-session.service';

export const dashboardAccessGuard: CanActivateFn = (route) => {
  const catalog = inject(DashboardCatalogService);
  const access = inject(AccessPolicy);
  const router = inject(Router);
  const dashboardId = route.data['dashboardId'] as DashboardId;
  const permission = (route.data['permission'] as Permission | undefined) ?? 'dashboard.view';

  const decide = () => {
    if (access.can(permission) && catalog.isAvailable(dashboardId)) return true;
    return router.createUrlTree(['/access-denied']);
  };

  if (access.isReady()) return decide();
  return toObservable(access.ready).pipe(filter(Boolean), take(1), map(decide));
};
