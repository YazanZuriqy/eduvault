import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  basePath: "/eduvault",
  assetPrefix: "/eduvault",
  env: {
    NEXT_PUBLIC_BASE_PATH: "/eduvault",
  },
};

export default nextConfig;
