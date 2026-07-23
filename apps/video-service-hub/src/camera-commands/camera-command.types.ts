export const cameraCommandPaths = {
  capture: '/api/v1/video-service/captures',
  'periodic-capture': '/api/v1/video-service/captures/periodic',
  'timed-recording': '/api/v1/video-service/recordings/timed',
  'start-recording': '/api/v1/video-service/recordings/start',
  'stop-recording': '/api/v1/video-service/recordings/stop',
  'start-live': '/api/v1/video-service/live/start',
  'start-dynamic-live': '/api/v1/video-service/live/dynamic/start',
  'stop-live': '/api/v1/video-service/live/stop',
  'record-audio': '/api/v1/video-service/audio',
} as const;

export type CameraCommand = keyof typeof cameraCommandPaths;

export type CameraCommandResult = {
  status: number;
  contentType?: string;
  body: unknown;
};
