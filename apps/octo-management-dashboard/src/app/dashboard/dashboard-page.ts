import { Component } from '@angular/core';
import { Gridster, type GridsterConfig, type GridsterItem as GridsterItemConfig } from 'angular-gridster2';

@Component({
  selector: 'app-dashboard-page',
  imports: [Gridster],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  protected readonly widgets: GridsterItemConfig[] = [];

  protected readonly gridsterOptions: GridsterConfig = {
    draggable: { enabled: true },
    resizable: { enabled: true },
    displayGrid: 'onDrag&Resize',
    gridType: 'fit',
    minCols: 12,
    maxCols: 12,
    minRows: 12,
    maxRows: 100,
    margin: 8,
    outerMargin: false,
    pushItems: true,
  };
}
