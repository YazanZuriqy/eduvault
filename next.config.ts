import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  basePath: "/eduvault",
  assetPrefix: "/eduvault",
};

export default nextConfig;
