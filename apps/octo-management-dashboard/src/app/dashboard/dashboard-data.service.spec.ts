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
});
