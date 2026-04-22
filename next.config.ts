import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desktop (Electron) packaging requires a self-contained server bundle at
  // .next/standalone/server.js. Forked by electron/next-server.ts on app boot.
  output: "standalone",
};

export default nextConfig;
