import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#000000", // TIDAL pitch black
        surface: "#121212",    // TIDAL dark graphite surface / bottom player
        card: "#181818",       // TIDAL card background
        cardHover: "#242424",  // TIDAL card hover
        border: "rgba(255, 255, 255, 0.08)", // Crisp subtle 1px divider
        borderHover: "rgba(255, 255, 255, 0.2)",
        primary: "#00ffff",    // TIDAL Cyan / Electric Blue
        primaryHover: "#33ffff",
        textPrimary: "#ffffff", // Crisp white
        textSecondary: "#8a8a8a", // TIDAL muted grey
        badgeMax: "#e5a00d",   // TIDAL MAX gold
        badgeMaxBg: "rgba(229, 160, 13, 0.15)",
        badgeHigh: "#00ffff",  // TIDAL HIGH cyan
        accent: "#10b981",     // Download green
      },
      borderRadius: {
        tidal: "4px",
      },
    },
  },
  plugins: [],
} satisfies Config;
