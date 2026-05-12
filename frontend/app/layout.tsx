import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LenisProvider } from "@/components/lenis-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Viewport meta. Without this, mobile browsers render the page at desktop
 * width (~980px) and zoom out to fit — so the responsive Tailwind classes
 * (sm: / md: / lg:) never actually trigger on phones. Adding device-width
 * is the single most important mobile fix; rubric #30 ("not optimised for
 * mobile") was largely this. themeColor matches our hero background so
 * iOS Safari paints the status bar in our dark color instead of white.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5ff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0f" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Kairos",
  description: "Kairos — Recruitment Intelligence Platform",
  openGraph: {
    title: "Kairos",
    description: "Recruitment Intelligence Platform",
    url: APP_URL,
    siteName: "Kairos",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Kairos" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kairos",
    description: "Recruitment Intelligence Platform",
    images: ["/opengraph-image"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <ThemeProvider>
          <LenisProvider>{children}</LenisProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
