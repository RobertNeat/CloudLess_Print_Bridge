import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Copy } from "../i18n";
import type { DeviceConfig, Resolution, RuntimeStatus, ViewerSource } from "../types";
import { NetworkConfigForm } from "./network-config-form";

const resolutions: Resolution[] = [
  { value: 5, dimensions: "320 × 240", abbreviation: "QVGA" },
  { value: 8, dimensions: "640 × 480", abbreviation: "VGA" },
  { value: 9, dimensions: "800 × 600", abbreviation: "SVGA" },
  { value: 10, dimensions: "1024 × 768", abbreviation: "XGA" },
  { value: 13, dimensions: "1600 × 1200", abbreviation: "UXGA" },
];

const initialRuntime: RuntimeStatus = { temperature: null, framesize: 8, streaming: false, cameraPowered: false, dynamic: false, fps: 0, maxFps: 25 };
const panelClass = "rounded-2xl border border-divider bg-content1 shadow-sm";
const actionClass = "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-center text-sm font-semibold text-primary-foreground shadow-sm";

function ExternalIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M14 5h5v5M19 5l-8 8" /><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></svg>;
}

function StatusPanel({ runtime, config, copy, reachable }: { runtime: RuntimeStatus; config: DeviceConfig; copy: Copy; reachable: boolean }) {
  const resolution = resolutions.find((item) => item.value === runtime.framesize);
  const rows: Array<[string, ReactNode]> = [
    [copy.status, <span className="flex items-center gap-2"><span>{runtime.streaming ? "🟡" : "🟢"}</span>{runtime.streaming ? copy.streaming : copy.idle}</span>],
    [copy.cameraPowered, <span>{runtime.cameraPowered ? `⚡ ${copy.yes}` : copy.no}</span>],
    [copy.cameraMode, reachable ? copy.ready : copy.error],
    [copy.currentResolution, resolution ? `${resolution.dimensions} (${resolution.abbreviation})` : copy.unavailable],
    [copy.currentFps, `${Math.round(runtime.streaming ? runtime.fps || 0 : 0)} FPS`],
    [copy.chipTemperature, runtime.temperature == null ? copy.unavailable : `${runtime.temperature.toFixed(1)}°C`],
    [copy.cameraAddress, config.currentIp],
    [copy.videoService, config.videoServiceIp],
  ];

  return (
    <section className={`${panelClass} p-6`}>
      {rows.map(([label, value]) => <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 border-b border-divider py-3 text-sm first:pt-0 last:border-0 last:pb-0" key={label}><span className="text-foreground-500">{label}</span><strong className="break-words font-medium">{value}</strong></div>)}
    </section>
  );
}

function PreviewPanel({ source, copy, error, onClose, onError }: { source: ViewerSource | null; copy: Copy; error: boolean; onClose: () => void; onError: () => void }) {
  return (
    <section className={`${panelClass} min-h-[360px] overflow-hidden`}>
      <header className="flex min-h-14 items-center justify-between border-b border-divider px-6 py-4">
        <h2 className="text-sm font-semibold">{copy.preview}</h2>
        {source && <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="button" onClick={onClose}>{copy.stopPreview}</button>}
      </header>
      <div className="grid min-h-[304px] place-items-center bg-content2">
        {source && !error && <img key={`${source.kind}-${source.url}`} alt={copy.preview} className="block max-h-[34rem] max-w-full object-contain" src={source.url} onError={onError} />}
        {error && <p className="max-w-sm p-8 text-center text-sm text-danger">{copy.previewError}</p>}
        {!source && !error && <p className="max-w-sm p-8 text-center text-sm text-foreground-500">{copy.previewEmpty}</p>}
      </div>
    </section>
  );
}

type StreamPanelProps = { title: string; description: string; copy: Copy; children?: ReactNode; onEmbedded: () => void; newTabUrl: string; cacheBustNewTab?: boolean };
function StreamPanel({ title, description, copy, children, onEmbedded, newTabUrl, cacheBustNewTab = false }: StreamPanelProps) {
  return (
    <article className={`${panelClass} flex h-full flex-col gap-5 p-6`}>
      <div className="space-y-2"><h2 className="font-semibold tracking-tight">{title}</h2><p className="text-sm leading-6 text-foreground-500">{description}</p></div>
      {children}
      <div className="mt-auto grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <button className={actionClass} type="button" onClick={onEmbedded}>{copy.watchEmbedded}</button>
        <a className={`${actionClass} gap-2`} href={newTabUrl} rel="noopener noreferrer" target="_blank" onClick={(event) => {
          if (cacheBustNewTab) event.currentTarget.href = cacheBusted(newTabUrl);
        }}>{copy.startNewTab}<ExternalIcon /></a>
      </div>
    </article>
  );
}

const cacheBusted = (url: string) => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;

export function CameraDashboard({ config, copy }: { config: DeviceConfig; copy: Copy }) {
  const [resolution, setResolution] = useState(8);
  const [runtime, setRuntime] = useState(initialRuntime);
  const [reachable, setReachable] = useState(true);
  const [source, setSource] = useState<ViewerSource | null>(null);
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch(`/api/v1/camera/runtime?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        if (!stopped) {
          setRuntime(await response.json());
          setReachable(true);
        }
      } catch {
        if (!stopped) setReachable(false);
      } finally {
        if (!stopped) timer = window.setTimeout(refresh, 3000);
      }
    };
    void refresh();
    return () => {
      stopped = true;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  const fixedUrl = `/api/v1/stream?framesize=${resolution}`;
  const dynamicUrl = "/api/v1/stream/dynamic";
  const captureUrl = "/api/v1/capture/uxga";
  const embed = (kind: ViewerSource["kind"], url: string) => {
    setPreviewError(false);
    setSource({ kind, url: cacheBusted(url) });
  };
  const closePreview = () => {
    setSource(null);
    setPreviewError(false);
  };

  return (
    <div className="space-y-6">
      <section className="grid items-stretch gap-6 lg:grid-cols-[minmax(20rem,0.82fr)_minmax(0,1.7fr)]">
        <StatusPanel config={config} copy={copy} reachable={reachable} runtime={runtime} />
        <PreviewPanel copy={copy} error={previewError} onClose={closePreview} onError={() => setPreviewError(true)} source={source} />
      </section>
      <section className="grid items-stretch gap-5 lg:grid-cols-3">
        <StreamPanel copy={copy} description={copy.fixedDescription} title={copy.fixedTitle} newTabUrl={fixedUrl} onEmbedded={() => embed("fixed", fixedUrl)}>
          <select aria-label={copy.currentResolution} className="min-h-12 w-full rounded-xl border-2 border-primary bg-content1 px-4 font-medium text-foreground shadow-sm outline-none" value={resolution} onChange={(event) => setResolution(Number(event.currentTarget.value))}>
            {resolutions.map((item) => <option key={item.value} value={item.value}>{item.dimensions} · {item.abbreviation}</option>)}
          </select>
        </StreamPanel>
        <StreamPanel copy={copy} description={copy.dynamicDescription} title={copy.dynamicTitle} newTabUrl={dynamicUrl} onEmbedded={() => embed("dynamic", dynamicUrl)} />
        <StreamPanel cacheBustNewTab copy={copy} description={copy.captureDescription} title={copy.captureTitle} newTabUrl={captureUrl} onEmbedded={() => embed("capture", captureUrl)} />
      </section>
      <details className={panelClass}>
        <summary className="cursor-pointer px-6 py-5 font-semibold">{copy.networkTitle}</summary>
        <div className="border-t border-divider px-6 pb-6 pt-5">
          <p className="mb-6 text-sm leading-6 text-foreground-500">{copy.networkDescription}</p>
          <NetworkConfigForm copy={copy} initial={config} />
        </div>
      </details>
    </div>
  );
}
