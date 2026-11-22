import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "sharp",
    "postgres",
    "@atproto/oauth-client-node",
  ],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
