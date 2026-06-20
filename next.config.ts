import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pins the workspace root to this project folder, since a yarn.lock elsewhere
  // on your machine (outside this project) can otherwise confuse Next.js's
  // auto-detection and trigger a "multiple lockfiles" warning.
  outputFileTracingRoot: path.resolve(__dirname),
};

export default nextConfig;
