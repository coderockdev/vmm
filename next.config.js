/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Keep Remotion / AWS SDK out of the webpack graph — they break Next with
  // deep @smithy/* package-export resolves (e.g. @smithy/core/retry).
  experimental: {
    serverComponentsExternalPackages: [
      "better-sqlite3",
      "@remotion/renderer",
      "@remotion/bundler",
      "@remotion/cli",
      "@remotion/lambda",
      "remotion",
      "esbuild",
      "webpack",
      "@aws-sdk/client-s3",
      "@aws-sdk/credential-providers",
      "@smithy/core",
    ],
  },
};

module.exports = nextConfig;
