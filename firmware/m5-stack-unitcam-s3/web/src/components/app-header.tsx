import type { Copy } from "../i18n";
import type { Language, ThemeMode } from "../types";

const GlobeIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
  </svg>
);

const ThemeIcon = () => (
  <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" />
  </svg>
);

type Props = {
  copy: Copy;
  language: Language;
  theme: ThemeMode;
  onLanguageChange: (language: Language) => void;
  onThemeChange: (theme: ThemeMode) => void;
};

export function AppHeader({ copy, language, theme, onLanguageChange, onThemeChange }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-divider bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <h1 className="text-sm font-semibold tracking-tight sm:text-base">M5Stack Unit Cam S3</h1>
        <div className="flex items-center gap-2">
          <label className="flex min-h-9 items-center gap-2 rounded-lg border border-divider bg-content1 px-2 shadow-sm">
            <GlobeIcon />
            <span className="sr-only">{copy.language}</span>
            <select aria-label={copy.language} className="bg-transparent text-sm font-semibold outline-none" value={language} onChange={(event) => onLanguageChange(event.currentTarget.value as Language)}>
              <option value="pl">PL</option>
              <option value="en">EN</option>
            </select>
          </label>
          <label className="flex min-h-9 items-center gap-2 rounded-lg border border-divider bg-content1 px-2 shadow-sm">
            <ThemeIcon />
            <span className="sr-only">{copy.mode}</span>
            <select aria-label={copy.mode} className="bg-transparent text-sm font-semibold outline-none" value={theme} onChange={(event) => onThemeChange(event.currentTarget.value as ThemeMode)}>
              <option value="light">{copy.light}</option>
              <option value="dark">{copy.dark}</option>
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}
