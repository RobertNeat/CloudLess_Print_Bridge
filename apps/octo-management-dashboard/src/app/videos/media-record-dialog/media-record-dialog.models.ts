export type MediaRecordAction = 'audio' | 'recording' | 'timelapse' | 'capture';

export interface MediaRecordSourceOption {
  readonly id: string;
  readonly name: string;
  readonly commandable: boolean;
}

export interface AudioRecordRequest {
  readonly action: 'audio';
  readonly sourceId: string;
  readonly durationSeconds: number;
}

export interface RecordingRequest {
  readonly action: 'recording';
  readonly sourceId: string;
  readonly resolution: string;
  readonly durationSeconds: number;
}

export interface TimelapseRequest {
  readonly action: 'timelapse';
  readonly sourceId: string;
  readonly resolution: string;
  readonly durationSeconds: number;
  readonly intervalSeconds: number;
}

export interface CaptureRequest {
  readonly action: 'capture';
  readonly sourceId: string;
  readonly resolution: string;
}

export type MediaRecordRequest =
  AudioRecordRequest | RecordingRequest | TimelapseRequest | CaptureRequest;
