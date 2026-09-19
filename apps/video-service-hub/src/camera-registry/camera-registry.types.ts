export type CameraRegistryEntry = {
  schemaVersion: 1;
  cameraId: string;
  baseUrl: string;
  displayName?: string;
  locationCode?: string;
  createdAt: string;
  updatedAt: string;
};

export type CameraRegistryInput = {
  baseUrl: string;
  displayName?: string;
  locationCode?: string;
};
