export type Language = "pl" | "en";
export type ThemeMode = "light" | "dark";

export type DeviceConfig = {
  wifiSsid: string;
  wifiPass: string;
  cameraMacAddress: string;
  unitCamIp: string;
  gatewayIp: string;
  subnetMask: string;
  dnsIp: string;
  videoServiceIp: string;
  videoServicePort: number;
  mqttPort: number;
  heartbeatIntervalSeconds: number;
  mode: "ap" | "station";
  currentIp: string;
};

export type RuntimeStatus = {
  temperature: number | null;
  framesize: number;
  streaming: boolean;
  cameraPowered: boolean;
  dynamic: boolean;
  fps: number;
  maxFps: number;
};

export type ViewerSource = {
  kind: "fixed" | "dynamic" | "capture";
  url: string;
};

export type Resolution = {
  value: number;
  dimensions: string;
  abbreviation: string;
};
