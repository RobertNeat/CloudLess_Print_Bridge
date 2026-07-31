import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { ButtonModule } from 'primeng/button';
import { MenubarModule } from 'primeng/menubar';
import { MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import type { MenuItem } from 'primeng/api';

import { DashboardCatalogService, type DashboardId } from './core/dashboard-catalog.service';
import { I18nService } from './core/i18n.service';
import { ThemeService } from './core/theme.service';
import { DashboardLayoutService } from './core/dashboard-layout.service';

@Component({
  selector: 'app-root',
  imports: [
    ButtonModule,
    FormsModule,
    MenubarModule,
    MenuModule,
    RouterOutlet,
    SelectModule,
    TooltipModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  private readonly catalog = inject(DashboardCatalogService);
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  protected readonly layout = inject(DashboardLayoutService);

  protected readonly menuItems: MenuItem[] = [];
  protected readonly activeDashboardId = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => this.dashboardIdFromUrl(event.urlAfterRedirects)),
      startWith(this.dashboardIdFromUrl(this.router.url)),
    ),
    { initialValue: 'management' as DashboardId },
  );

  protected readonly dashboardOptions = computed(() =>
    this.catalog.availableDashboards().map((dashboard) => ({
      ...dashboard,
      label: this.i18n.t(dashboard.labelKey),
    })),
  );
  protected readonly languageLabel = computed(() => this.i18n.language().toUpperCase());
  protected readonly themeIcon = computed(() =>
    this.theme.isDark() ? 'pi pi-sun' : 'pi pi-moon',
  );
  protected readonly layoutMenuItems = computed<MenuItem[]>(() => [
    {
      label: this.layout.editing() ? 'Zatwierdź układ' : 'Edytuj układ',
      icon: this.layout.editing() ? 'pi pi-check' : 'pi pi-arrows-alt',
      command: () => this.layout.toggle(),
    },
    { separator: true },
    {
      label: 'Przywróć oryginalny układ',
      icon: 'pi pi-refresh',
      command: () => this.layout.reset(),
    },
  ]);

  protected t(key: Parameters<I18nService['t']>[0]): string {
    return this.i18n.t(key);
  }

  protected navigateToDashboard(dashboardId: DashboardId | null): void {
    if (dashboardId) {
      void this.router.navigate(['/', dashboardId]);
    }
  }

  protected toggleLanguage(): void {
    this.i18n.toggleLanguage();
  }

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  private dashboardIdFromUrl(url: string): DashboardId {
    const segment = url.split(/[/?#]/).filter(Boolean)[0] as DashboardId | undefined;
    return this.catalog.isDashboardId(segment) ? segment : 'management';
  }
}
