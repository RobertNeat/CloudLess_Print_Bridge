import { isManagementDashboardData } from './dashboard-data.service';

describe('management dashboard data decoder', () => {
  it('rejects the old shallow shape check false positive', () => {
    expect(
      isManagementDashboardData({
        printJob: {},
        controls: {},
        temperatures: {},
        coordinates: {},
        navigation: {},
        livePreview: {},
        widgets: [],
        charts: {},
      }),
    ).toBe(false);
  });

  it('rejects an unsupported print status', () => {
    expect(
      isManagementDashboardData({
        printJob: { status: 'unknown' },
        controls: {},
        temperatures: {},
        coordinates: {},
        navigation: {},
        livePreview: {},
        widgets: [],
        charts: {},
      }),
    ).toBe(false);
  });

  describe('deviceCapabilities', () => {
    function validPayloadWith(deviceCapabilities: unknown): Record<string, unknown> {
      return {
        printJob: {
          name: 'Part',
          thumbnailUrl: '',
          thumbnailAlt: '',
          progress: 10,
          currentLayer: 1,
          totalLayers: 10,
          estimatedPrintTime: '—',
          status: 'printing',
        },
        controls: { lightEnabled: false, fansEnabled: false, fanSpeed: 0, printSpeed: 'standard' },
        temperatures: { chamber: null, bed: 60, nozzle: 210 },
        coordinates: { X: 0, Y: 0, Z: 20 },
        positionSource: 'commanded',
        axisRanges: {
          X: { min: 0, max: 256 },
          Y: { min: 0, max: 256 },
          Z: { min: 20, max: 240 },
        },
        deviceCapabilities,
        navigation: {
          axisPoints: {
            X: { positive: null, negative: null },
            Y: { positive: null, negative: null },
            Z: { positive: null, negative: null },
          },
          hotendPoint: { x: 0, y: 0 },
          steps: [1, 10],
          viewport: {
            imageUrl: '',
            imageAlt: '',
            width: 100,
            height: 100,
            viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
          },
        },
        livePreview: {
          cameraName: '',
          resolution: '',
          availableResolutions: [],
          active: false,
          latencyMs: 0,
        },
        widgets: [{ id: 'temperatures', type: 'temperatures', x: 0, y: 0, cols: 6, rows: 1 }],
        charts: {
          progress: {
            kind: 'progress',
            titleKey: 'chart.progress.title',
            subtitleKey: 'chart.progress.subtitle',
            xAxisLabelKey: 'chart.axis.time',
            yAxisLabelKey: 'chart.axis.progress',
            yMin: 0,
            yMax: 100,
            yStepSize: 10,
            valueSuffix: '%',
            labels: [],
            datasets: [],
          },
          temperature: {
            kind: 'temperature',
            titleKey: 'chart.temperature.title',
            subtitleKey: 'chart.temperature.subtitle',
            xAxisLabelKey: 'chart.axis.time',
            yAxisLabelKey: 'chart.axis.temperature',
            yMin: 0,
            yMax: 250,
            yStepSize: 50,
            valueSuffix: '°C',
            labels: [],
            datasets: [],
          },
          fan: {
            kind: 'fan',
            titleKey: 'chart.fan.title',
            subtitleKey: 'chart.fan.subtitle',
            xAxisLabelKey: 'chart.axis.time',
            yAxisLabelKey: 'chart.axis.fan',
            yMin: 0,
            yMax: 100,
            yStepSize: 10,
            valueSuffix: '%',
            labels: [],
            datasets: [],
          },
        },
      };
    }

    it('accepts an otherwise-complete payload with a valid deviceCapabilities flag', () => {
      expect(isManagementDashboardData(validPayloadWith({ hasChamberHeater: false }))).toBe(true);
      expect(isManagementDashboardData(validPayloadWith({ hasChamberHeater: true }))).toBe(true);
    });

    it('rejects an otherwise-complete payload missing deviceCapabilities', () => {
      const payload = validPayloadWith({ hasChamberHeater: false });
      delete payload['deviceCapabilities'];

      expect(isManagementDashboardData(payload)).toBe(false);
    });

    it('rejects an otherwise-complete payload with a non-boolean hasChamberHeater', () => {
      expect(isManagementDashboardData(validPayloadWith({ hasChamberHeater: 'yes' }))).toBe(false);
    });
  });
});
