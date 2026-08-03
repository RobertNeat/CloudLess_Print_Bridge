import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import type { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenubarModule } from 'primeng/menubar';
import { SelectModule } from 'primeng/select';
import { TieredMenuModule } from 'primeng/tieredmenu';
import { TooltipModule } from 'primeng/tooltip';
import { filter, map, startWith } from 'rxjs';

import { DashboardCatalogService, type DashboardId } from './core/dashboard-catalog.service';
import { DashboardLayoutService } from './core/dashboard-layout.service';
import {
  FilesDashboardLayoutService,
  type FilesBrowserWidth,
  type FilesDetailsPosition,
} from './core/files-dashboard-layout.service';
import { I18nService } from './core/i18n.service';
import { ThemeService } from './core/theme.service';
import { VideoSearch } from './videos/video-search/video-search';

@Component({
  selector: 'app-root',
  imports: [
    ButtonModule,
    FormsModule,
    MenubarModule,
    RouterOutlet,
    SelectModule,
    TieredMenuModule,
    TooltipModule,
    VideoSearch,
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
  protected readonly filesLayout = inject(FilesDashboardLayoutService);

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
  protected readonly themeIcon = computed(() => (this.theme.isDark() ? 'pi pi-sun' : 'pi pi-moon'));

  protected readonly layoutMenuItems = computed<MenuItem[]>(() => {
    if (this.activeDashboardId() === 'files') {
      const activeWidth = this.filesLayout.browserWidth();
      const activePosition = this.filesLayout.detailsPosition();
      const widthOption = (label: string, value: FilesBrowserWidth): MenuItem => ({
        label,
        icon: activeWidth === value ? 'pi pi-check' : 'pi pi-arrows-h',
        command: () => this.filesLayout.setBrowserWidth(value),
      });
      const positionOption = (label: string, value: FilesDetailsPosition): MenuItem => ({
        label,
        icon: activePosition === value ? 'pi pi-check' : 'pi pi-arrow-right-arrow-left',
        command: () => this.filesLayout.setDetailsPosition(value),
      });
      return [
        {
          label: this.i18n.t('layout.fileAreaWidth'),
          icon: 'pi pi-arrows-h',
          items: [
            widthOption(this.i18n.t('layout.fileAreaStandard'), 'standard'),
            widthOption(this.i18n.t('layout.fileAreaWide'), 'wide'),
            widthOption(this.i18n.t('layout.fileAreaMaximum'), 'maximum'),
          ],
        },
        {
          label: this.i18n.t('layout.detailsPosition'),
          icon: 'pi pi-arrow-right-arrow-left',
          items: [
            positionOption(this.i18n.t('layout.detailsRight'), 'right'),
            positionOption(this.i18n.t('layout.detailsLeft'), 'left'),
          ],
        },
        { separator: true },
        {
          label: this.i18n.t('layout.reset'),
          icon: 'pi pi-refresh',
          command: () => this.filesLayout.reset(),
        },
      ];
    }

    return [
      {
        label: this.i18n.t(this.layout.editing() ? 'layout.confirm' : 'layout.edit'),
        icon: this.layout.editing() ? 'pi pi-check' : 'pi pi-arrows-alt',
        command: () => this.layout.toggle(),
      },
      { separator: true },
      {
        label: this.i18n.t('layout.reset'),
        icon: 'pi pi-refresh',
        command: () => this.layout.reset(),
      },
    ];
  });

  protected readonly layoutButtonLabel = computed(() =>
    this.activeDashboardId() === 'files'
      ? this.i18n.t('layout.filesAria')
      : this.i18n.t('layout.dashboardAria'),
  );

  protected readonly showsLayoutSettings = computed(() => this.activeDashboardId() !== 'videos');

  protected t(key: Parameters<I18nService['t']>[0]): string {
    return this.i18n.t(key);
  }

  protected navigateToDashboard(dashboardId: DashboardId | null): void {
    if (dashboardId) void this.router.navigate(['/', dashboardId]);
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
