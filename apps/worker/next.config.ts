import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Revision for the precached pages: the git commit, or a fresh id when git is unavailable.
const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || randomUUID();

// Service worker for the offline app shell. Serwist needs webpack, hence `--webpack` in package.json.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // The pages handle `online` themselves; a reload would wipe a PIN or a half-entered sale.
  reloadOnOnline: false,
  additionalPrecacheEntries: ["/", "/setup", "/shift/start", "/shift"].map((url) => ({ url, revision })),
});

const nextConfig: NextConfig = {
  // workspace packages ship TypeScript source
  transpilePackages: ["@fuelos/ui", "@fuelos/core"],
};

export default withSerwist(nextConfig);
