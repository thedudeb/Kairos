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
    const headers: { key: string; value: string }[] = [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, nollms" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ];

    // Only in production — sending HSTS during `next dev` makes browsers cache HTTPS-only for
    // localhost, then http://localhost:3000 stops working (no TLS in dev).
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      });
    }

    headers.push({
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

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
