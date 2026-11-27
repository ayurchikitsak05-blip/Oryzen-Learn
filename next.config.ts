import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // sql.js (Anki import) mentions Node's fs/path/crypto for its Node build; the browser doesn't need them.
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = { ...(config.resolve.fallback ?? {}), fs: false, path: false, crypto: false };
    }
    return config;
  },
};

export default nextConfig;
