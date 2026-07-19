import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
      // Production uses Next.js's same-origin default. The wildcard is only
      // needed for ephemeral local-development Codespaces.
      allowedOrigins: process.env.NODE_ENV === "production"
        ? []
        : ["localhost:3000", "*.app.github.dev"],
    },
  },
  async headers() {
    const securityHeaders: { key: string; value: string }[] = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // SAMEORIGIN (not DENY) so our own admin pages can embed authenticated
      // resources via <iframe> — specifically the resume PDF viewer at
      // /api/jobs/.../resume. Still blocks cross-origin embedding, so the
      // clickjacking protection that DENY provided is preserved.
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];

    // Only in production — sending HSTS during `next dev` makes browsers cache HTTPS-only for
    // localhost, then http://localhost:3000 stops working (no TLS in dev).
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }

    return [
      // Security headers on every route
      { source: "/:path*", headers: securityHeaders },
      // Noindex only on admin and careers — keeps link previews working for
      // the root page while still hiding internal routes from search engines.
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/careers/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, nollms" }],
      },
    ];
  },
};

export default nextConfig;
