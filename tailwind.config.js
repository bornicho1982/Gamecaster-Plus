/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: "#07090E",
          900: "#0B0E17",
          850: "#101522",
          800: "#151C2C",
          700: "#1E273C",
          600: "#2B3752",
        },
        cyber: {
          cyan: "#00F0FF",
          blue: "#2563EB",
          purple: "#7C3AED",
          crimson: "#FF2A54",
          emerald: "#10B981",
          amber: "#F59E0B",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        display: ["Rajdhani", "Plus Jakarta Sans", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
