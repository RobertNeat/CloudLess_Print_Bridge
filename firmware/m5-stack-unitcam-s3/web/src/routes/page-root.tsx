import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "../components/app-header";
import { CameraDashboard } from "../components/camera-dashboard";
import { NetworkConfigForm } from "../components/network-config-form";
import { getCopy } from "../i18n";
import type { DeviceConfig, Language, ThemeMode } from "../types";

const emptyConfig: DeviceConfig = { wifiSsid: "", wifiPass: "", cameraMacAddress: "", unitCamIp: "192.168.1.231", gatewayIp: "192.168.1.1", subnetMask: "255.255.255.0", dnsIp: "192.168.1.1", videoServiceIp: "192.168.1.100", videoServicePort: 3000, mqttPort: 1883, heartbeatIntervalSeconds: 15, mode: "ap", currentIp: "192.168.1.1" };
const readStoredValue = (key: string) => {
  try { return window.localStorage.getItem(key); } catch { return null; }
};
const storeValue = (key: string, value: string) => {
  try { window.localStorage.setItem(key, value); } catch { /* Captive portal storage can be disabled. */ }
};
const storedLanguage = (): Language => readStoredValue("unitcam-language") === "en" ? "en" : "pl";
const storedTheme = (): ThemeMode => readStoredValue("unitcam-theme") === "dark" ? "dark" : "light";

export default function PageRoot() {
  const [language, setLanguage] = useState<Language>(storedLanguage);
  const [theme, setTheme] = useState<ThemeMode>(storedTheme);
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const copy = useMemo(() => getCopy(language), [language]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [language, theme]);
  useEffect(() => {
    let active = true;
    const loadConfig = async () => {
      try {
        if (typeof fetch !== "function") throw new Error("fetch unavailable");
        const response = await fetch("/api/v1/get_config", { cache: "no-store" });
        if (!response.ok) throw new Error("config unavailable");
        const data = await response.json();
        if (active) setConfig({ ...emptyConfig, ...data });
      } catch {
        if (active) setConfig(emptyConfig);
      }
    };
    void loadConfig();
    return () => { active = false; };
  }, []);

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    storeValue("unitcam-language", next);
  };
  const changeTheme = (next: ThemeMode) => {
    setTheme(next);
    storeValue("unitcam-theme", next);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader copy={copy} language={language} theme={theme} onLanguageChange={changeLanguage} onThemeChange={changeTheme} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {!config ? <div className="grid min-h-[60vh] place-items-center text-sm text-foreground-500">{copy.connecting}</div> : config.mode === "ap" ? (
          <section className="mx-auto mt-6 max-w-3xl rounded-2xl border border-divider bg-content1 shadow-sm">
            <header className="px-6 pb-3 pt-6 sm:px-8 sm:pt-8"><h2 className="text-xl font-semibold">{copy.setupTitle}</h2><p className="mt-2 text-sm leading-6 text-foreground-500">{copy.setupDescription}</p></header>
            <div className="px-6 pb-6 pt-3 sm:px-8 sm:pb-8"><NetworkConfigForm copy={copy} initial={config} /></div>
          </section>
        ) : <CameraDashboard config={config} copy={copy} />}
      </main>
    </div>
  );
}
