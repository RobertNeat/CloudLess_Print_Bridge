/* Single source of truth for site navigation. Content pages must not
   hand-write sidebar markup — app.js renders it from this config. */
window.CLOUDLESS_NAV = [
  {
    id: "quickstart",
    href: "index.html",
    label: { en: "Quickstart", pl: "Szybki start" },
    sections: [
      { id: "desktop-launch", label: { en: "Desktop launch", pl: "Uruchomienie na desktopie" } },
    ],
  },
  {
    id: "setup-options",
    href: "pages/setup-options.html",
    label: { en: "Setup options", pl: "Opcje instalacji" },
    sections: [
      { id: "development-environment", label: { en: "Development environment", pl: "Środowisko deweloperskie" } },
      { id: "docker-desktop", label: { en: "Docker Desktop", pl: "Docker Desktop" } },
      { id: "local-server", label: { en: "Local server", pl: "Serwer lokalny" } },
    ],
  },
  {
    id: "management-page",
    href: "pages/management-page.html",
    label: { en: "Management page", pl: "Panel zarządzania" },
    sections: [
      { id: "overview", label: { en: "Overview", pl: "Przegląd" } },
      { id: "layout-theme-language", label: { en: "Layout, theme & language", pl: "Układ, motyw i język" } },
      { id: "app-current-print-job", label: { en: "Current print job", pl: "Bieżące zadanie druku" } },
      { id: "app-printer-quick-controls", label: { en: "Printer quick controls", pl: "Szybkie sterowanie drukarką" } },
      { id: "app-printer-navigation", label: { en: "Printer navigation", pl: "Nawigacja drukarki" } },
      { id: "app-live-preview", label: { en: "Live preview", pl: "Podgląd na żywo" } },
      { id: "app-telemetry-chart", label: { en: "Telemetry chart", pl: "Wykres telemetrii" } },
    ],
  },
  {
    id: "files-page",
    href: "pages/files-page.html",
    label: { en: "Files page", pl: "Strona plików" },
    sections: [
      { id: "overview", label: { en: "Overview", pl: "Przegląd" } },
      { id: "layout-theme-language", label: { en: "Layout, theme & language", pl: "Układ, motyw i język" } },
      { id: "app-file-tree", label: { en: "File tree", pl: "Drzewo plików" } },
      { id: "app-file-list", label: { en: "File list", pl: "Lista plików" } },
      { id: "app-file-details", label: { en: "File details", pl: "Szczegóły pliku" } },
    ],
  },
  {
    id: "video-page",
    href: "pages/video-page.html",
    label: { en: "Video page", pl: "Strona wideo" },
    sections: [
      { id: "overview", label: { en: "Overview", pl: "Przegląd" } },
      { id: "layout-theme-language", label: { en: "Filtering, theme & language", pl: "Filtrowanie, motyw i język" } },
      { id: "camera-panel", label: { en: "Camera panel", pl: "Panel kamery" } },
      { id: "app-video-player", label: { en: "Video player", pl: "Odtwarzacz wideo" } },
      { id: "media-library-section-audio", label: { en: "Media library — Audio", pl: "Biblioteka mediów — Audio" } },
      { id: "media-library-section-recording", label: { en: "Media library — Recordings", pl: "Biblioteka mediów — Nagrania" } },
      { id: "media-library-section-timelapse", label: { en: "Media library — Timelapses", pl: "Biblioteka mediów — Timelapse" } },
      { id: "media-library-section-image", label: { en: "Media library — Images", pl: "Biblioteka mediów — Zdjęcia" } },
    ],
  },
];
