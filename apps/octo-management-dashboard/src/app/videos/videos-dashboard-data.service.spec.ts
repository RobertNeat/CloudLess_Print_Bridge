import { isVideosDashboardData } from './videos-dashboard-data.service';

describe('videos dashboard data decoder', () => {
  it('rejects a shallow shape that used to pass validation', () => {
    expect(
      isVideosDashboardData({
        metrics: [],
        sources: [],
        media: [],
        player: { availableResolutions: [] },
      }),
    ).toBe(false);
  });

  it('rejects an online source without a preview URL', () => {
    expect(
      isVideosDashboardData({
        metrics: [{ code: 'status', valueCode: 'stream' }],
        sources: [
          {
            id: 'camera',
            name: 'Camera',
            locationCode: 'workshop',
            status: 'online',
          },
        ],
        media: [],
        player: {
          active: false,
          selectedSourceId: 'camera',
          resolution: 'auto',
          availableResolutions: ['auto'],
        },
      }),
    ).toBe(false);
  });
});
