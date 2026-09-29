import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // workspace packages ship TypeScript source
  transpilePackages: ["@fuelos/ui", "@fuelos/core"],
};

export default nextConfig;
