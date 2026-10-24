import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // pdfjs-dist sets up its worker at runtime; bundling it breaks server-side PDF parsing.
  serverExternalPackages: ["pdfjs-dist"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
