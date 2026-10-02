import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the project root (a parent folder has its own lockfile, which confuses auto-detection).
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
