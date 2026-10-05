import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const adminRoot = fileURLToPath(new URL(".", import.meta.url));

// The Content-Security-Policy is set per request in src/proxy.ts, where each
// page gets its own script nonce. These are the headers that never change.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The admin is its own app inside the Expo repo; without this Next.js
  // takes the repo root, with the app's lockfile, as its workspace.
  turbopack: { root: adminRoot },
  outputFileTracingRoot: adminRoot,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Staff tooling has no business in a search index.
          { key: "X-Robots-Tag", value: "noindex, nofollow" }
        ]
      }
    ];
  }
};

export default nextConfig;
