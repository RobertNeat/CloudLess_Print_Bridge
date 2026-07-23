/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--unit-color-background) / <alpha-value>)",
        foreground: {
          DEFAULT: "rgb(var(--unit-color-foreground) / <alpha-value>)",
          400: "rgb(var(--unit-color-muted) / <alpha-value>)",
          500: "rgb(var(--unit-color-muted) / <alpha-value>)",
          600: "rgb(var(--unit-color-muted-strong) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--unit-color-primary) / <alpha-value>)",
          foreground: "rgb(var(--unit-color-primary-foreground) / <alpha-value>)",
        },
        content1: "rgb(var(--unit-color-content-1) / <alpha-value>)",
        content2: "rgb(var(--unit-color-content-2) / <alpha-value>)",
        divider: "rgb(var(--unit-color-divider) / <alpha-value>)",
        danger: "rgb(var(--unit-color-danger) / <alpha-value>)",
      },
      fontFamily: { sans: ["var(--unit-font-sans)"] },
    },
  },
  plugins: [],
};
