import type { Routes } from '@angular/router';
import { dashboardAccessGuard } from './core/dashboard-access.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'management' },
  {
    path: 'access-denied',
    loadComponent: () =>
      import('./core/access-denied-page').then(({ AccessDeniedPage }) => AccessDeniedPage),
  },
  {
    path: 'management',
    loadComponent: () =>
      import('./dashboard/dashboard-page').then(({ DashboardPage }) => DashboardPage),
    canActivate: [dashboardAccessGuard],
    data: { dashboardId: 'management' },
  },
  {
    path: 'files',
    loadComponent: () =>
      import('./files/files-dashboard-page').then(({ FilesDashboardPage }) => FilesDashboardPage),
    canActivate: [dashboardAccessGuard],
    data: { dashboardId: 'files', permission: 'files.read' },
  },
  {
    path: 'videos',
    loadComponent: () =>
      import('./videos/videos-dashboard-page').then(
        ({ VideosDashboardPage }) => VideosDashboardPage,
      ),
    canActivate: [dashboardAccessGuard],
    data: { dashboardId: 'videos' },
  },
  { path: '**', redirectTo: 'management' },
];
