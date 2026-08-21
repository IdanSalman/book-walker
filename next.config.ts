import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "*": [
      "./node_modules/.prisma/client/**",
      "./node_modules/@prisma/client/**",
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
    ],
  },
  experimental: {
    serverActions: {
      // Vercel request bodies cap around 4.5 MB; keep a higher local limit.
      bodySizeLimit: process.env.VERCEL ? "4.5mb" : "64mb",
    },
  },
};

export default nextConfig;
