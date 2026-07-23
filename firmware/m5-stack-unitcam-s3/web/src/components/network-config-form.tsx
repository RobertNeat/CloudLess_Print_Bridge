import { useEffect, useState } from "react";
import type { Copy } from "../i18n";
import type { DeviceConfig } from "../types";

export function NetworkConfigForm({ initial, copy }: { initial: DeviceConfig; copy: Copy }) {
  const [config, setConfig] = useState(initial);

  useEffect(() => setConfig(initial), [initial]);
  const setField = (field: keyof DeviceConfig, value: string | number) => setConfig((current) => ({ ...current, [field]: value }));

  const inputClass = "min-h-12 w-full rounded-xl border-2 border-divider bg-content1 px-4 text-foreground outline-none focus:border-primary";

  return (
    <form acceptCharset="UTF-8" action="/api/v1/set_config_form" className="grid gap-5 md:grid-cols-2" method="post">
      <label className="grid gap-2 text-sm font-medium md:col-span-2">
        <span>{copy.cameraMac}</span>
        <output className={`${inputClass} flex items-center font-mono`} title={copy.cameraMacDescription}>{config.cameraMacAddress || copy.unavailable}</output>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.ssid}</span>
        <input required autoComplete="username" className={inputClass} maxLength={32} name="wifiSsid" placeholder={copy.ssidPlaceholder} value={config.wifiSsid} onChange={(event) => setField("wifiSsid", event.currentTarget.value)} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.password}</span>
        <input autoComplete="current-password" className={inputClass} maxLength={64} name="wifiPass" placeholder={copy.passwordPlaceholder} type="password" value={config.wifiPass} onChange={(event) => setField("wifiPass", event.currentTarget.value)} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.cameraIp}</span>
        <input required className={inputClass} inputMode="decimal" name="unitCamIp" pattern="[0-9.]+" placeholder="192.168.1.231" value={config.unitCamIp} onChange={(event) => setField("unitCamIp", event.currentTarget.value)} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.gatewayIp}</span>
        <input required className={inputClass} inputMode="decimal" name="gatewayIp" pattern="[0-9.]+" placeholder="192.168.1.1" value={config.gatewayIp} onChange={(event) => setField("gatewayIp", event.currentTarget.value)} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.subnetMask}</span>
        <input required className={inputClass} inputMode="decimal" name="subnetMask" pattern="[0-9.]+" placeholder="255.255.255.0" value={config.subnetMask} onChange={(event) => setField("subnetMask", event.currentTarget.value)} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.dnsIp}</span>
        <input required className={inputClass} inputMode="decimal" name="dnsIp" pattern="[0-9.]+" placeholder="192.168.1.1" value={config.dnsIp} onChange={(event) => setField("dnsIp", event.currentTarget.value)} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.videoIp}</span>
        <input required className={inputClass} inputMode="decimal" name="videoServiceIp" pattern="[0-9.]+" placeholder="192.168.1.100" value={config.videoServiceIp} onChange={(event) => setField("videoServiceIp", event.currentTarget.value)} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.videoPort}</span>
        <input required className={inputClass} min={1} max={65535} name="videoServicePort" type="number" value={config.videoServicePort} onChange={(event) => setField("videoServicePort", Number(event.currentTarget.value))} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.mqttPort}</span>
        <input required className={inputClass} min={1} max={65535} name="mqttPort" type="number" value={config.mqttPort} onChange={(event) => setField("mqttPort", Number(event.currentTarget.value))} />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        <span>{copy.heartbeatInterval}</span>
        <input required className={inputClass} min={5} max={3600} name="heartbeatIntervalSeconds" type="number" value={config.heartbeatIntervalSeconds} onChange={(event) => setField("heartbeatIntervalSeconds", Number(event.currentTarget.value))} />
      </label>
      <div className="flex flex-col items-start gap-4 pt-1 md:col-span-2">
        <button className="min-h-11 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-sm" type="submit">{copy.saveConnect}</button>
      </div>
    </form>
  );
}
