import type { MetadataRoute } from "next";

// Installability groundwork only — no service worker registered yet (the app is read-mostly for now).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FuelOS — تطبيق الزبون",
    short_name: "FuelOS",
    description: "أسعار المحطات القريبة، فواتيرك، ونقاط الولاء",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#0F766E",
    background_color: "#071E2D",
    icons: [{ src: "/icon.png", sizes: "192x192", type: "image/png", purpose: "any" }],
  };
}
