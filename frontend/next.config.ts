import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
      allowedOrigins: [
        "localhost:3000",
        "*.app.github.dev",
      ],
    },
  },
  async headers() {
    // 'strict-dynamic' makes 'unsafe-inline' a no-op in CSP3-aware browsers:
    // only scripts explicitly trusted by a nonce/hash can load further scripts.
    // 'unsafe-inline' is kept for CSP2 fallback. 'unsafe-eval' is removed in
    // production (Next.js doesn't need it; only the dev HMR runtime does).
    const scriptSrc = process.env.NODE_ENV === "production"
      ? "script-src 'self' 'strict-dynamic' 'unsafe-inline'"
      : "script-src 'self' 'strict-dynamic' 'unsafe-inline' 'unsafe-eval'";
    const securityHeaders: { key: string; value: string }[] = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ];

    // Only in production — sending HSTS during `next dev` makes browsers cache HTTPS-only for
    // localhost, then http://localhost:3000 stops working (no TLS in dev).
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }

    securityHeaders.push({
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    });

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
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
