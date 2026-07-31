import type { Routes } from '@angular/router';
import { dashboardAccessGuard } from './core/dashboard-access.guard';
import { DashboardPage } from './dashboard/dashboard-page';
import { FilesDashboardPage } from './files/files-dashboard-page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'management' },
  {
    path: 'management',
    component: DashboardPage,
    canActivate: [dashboardAccessGuard],
    data: { dashboardId: 'management' },
  },
  {
    path: 'files',
    component: FilesDashboardPage,
    canActivate: [dashboardAccessGuard],
    data: { dashboardId: 'files' },
  },
  {
    path: 'videos',
    component: DashboardPage,
    canActivate: [dashboardAccessGuard],
    data: { dashboardId: 'videos' },
  },
  { path: '**', redirectTo: 'management' },
];
