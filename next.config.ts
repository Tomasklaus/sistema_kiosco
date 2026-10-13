import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app es dinámica por usuario (cookies de sesión de Supabase): sin cacheComponents.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
