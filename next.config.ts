import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // trailingSlash ensures every route becomes a real directory with an index.html,
  // which is required for GitHub Pages to serve sub-routes without 404s.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: "/eduvault",
  // assetPrefix tells Next.js to prepend /eduvault to every /_next/static/... URL
  // so JS chunks, CSS, and public-folder assets all resolve correctly under the
  // GitHub Pages sub-directory deployment (https://<user>.github.io/eduvault/).
  assetPrefix: "/eduvault",
  env: {
    NEXT_PUBLIC_BASE_PATH: "/eduvault",
  },
};

export default nextConfig;
