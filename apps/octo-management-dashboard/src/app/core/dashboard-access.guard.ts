import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { DashboardCatalogService, type DashboardId } from './dashboard-catalog.service';
import { AccessPolicy } from './auth-session.service';

export const dashboardAccessGuard: CanActivateFn = (route) => {
  const catalog = inject(DashboardCatalogService);
  const access = inject(AccessPolicy);
  const router = inject(Router);
  const dashboardId = route.data['dashboardId'] as DashboardId;

  if (access.isReady() && access.can('dashboard.view') && catalog.isAvailable(dashboardId)) {
    return true;
  }

  const fallback = catalog.availableDashboards()[0]?.id ?? 'management';
  return router.createUrlTree(['/', fallback]);
};
