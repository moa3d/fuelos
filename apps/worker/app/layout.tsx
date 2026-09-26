import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { PersistStorage } from "./persist-storage";
import { SyncRunner } from "./sync-runner";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FuelOS — العامل",
  description: "تطبيق عامل المحطة: المناوبة والتعبئة، ويعمل دون اتصال",
  applicationName: "FuelOS — العامل",
  appleWebApp: { capable: true, title: "FuelOS", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0F766E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-dvh antialiased">
        <PersistStorage />
        <SyncRunner />
        {children}
      </body>
    </html>
  );
}
