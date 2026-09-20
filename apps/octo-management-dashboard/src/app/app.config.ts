import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { routes } from './app.routes';
import { cloudlessAuthInterceptor } from './core/cloudless-auth.interceptor';
import { HttpManagementDashboardDataSource } from './dashboard/backend/http-management-dashboard-data.source';
import { HttpPrinterCommandAdapter } from './dashboard/backend/http-printer-command.adapter';
import { MANAGEMENT_DASHBOARD_DATA_SOURCE } from './dashboard/dashboard-data.service';
import { PRINTER_COMMAND_PORT } from './dashboard/printer-command.port';
import { HttpFilesDataService } from './files/backend/http-files-data.service';
import { HttpFilesOperationsAdapter } from './files/backend/http-files-operations.adapter';
import { FILES_OPERATIONS, FILES_REPOSITORY } from './files/files-dashboard.ports';
import { HttpVideosDataService } from './videos/backend/http-videos-data.service';
import { VIDEOS_REPOSITORY } from './videos/videos-dashboard.ports';

// Aura's default toast severities use a translucent color-mix() background
// (near-invisible tint in light mode, ~16% opaque in dark mode). The app
// wants a solid, fully opaque background per severity in both themes, so
// these tokens are overridden at the preset level: PrimeNG's runtime-injected
// :root rules carry the same specificity as a plain CSS override, and last-wins.
const OctoAura = definePreset(Aura, {
  components: {
    toast: {
      info: {
        background: '{blue.600}',
        borderColor: '{blue.700}',
        color: '{surface.0}',
        detailColor: '{surface.0}',
      },
      warn: {
        background: '{amber.600}',
        borderColor: '{amber.700}',
        color: '{surface.0}',
        detailColor: '{surface.0}',
      },
      error: {
        background: '{red.600}',
        borderColor: '{red.700}',
        color: '{surface.0}',
        detailColor: '{surface.0}',
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([cloudlessAuthInterceptor])),
    provideRouter(routes),
    provideCharts(withDefaultRegisterables()),
    MessageService,
    providePrimeNG({
      theme: {
        preset: OctoAura,
        options: {
          darkModeSelector: '.app-dark',
        },
      },
      ripple: true,
    }),
    { provide: MANAGEMENT_DASHBOARD_DATA_SOURCE, useExisting: HttpManagementDashboardDataSource },
    { provide: PRINTER_COMMAND_PORT, useExisting: HttpPrinterCommandAdapter },
    { provide: FILES_REPOSITORY, useExisting: HttpFilesDataService },
    { provide: FILES_OPERATIONS, useExisting: HttpFilesOperationsAdapter },
    { provide: VIDEOS_REPOSITORY, useExisting: HttpVideosDataService },
  ],
};
