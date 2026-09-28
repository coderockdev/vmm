/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "@remotion/renderer",
      "@remotion/bundler",
      "@remotion/cli",
      "remotion",
      "esbuild",
      "webpack",
    ],
  },
};

module.exports = nextConfig;
