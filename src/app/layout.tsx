import type { Metadata } from "next";
import { Inter, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "../styles/globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"], weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono", display: "swap",
});

export const metadata: Metadata = {
  title: "Sales Coach AI",
  description: "AI-powered coaching system for sales orgs — personality, skills, and execution in one place.",
  metadataBase: new URL("https://portal.benjohnson.ai"),
  openGraph: {
    title: "Sales Coach AI",
    description: "Coaching that compounds. Personality + skill scoring + AI recommendations.",
    url: "https://portal.benjohnson.ai",
    siteName: "Sales Coach AI",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Sales Coach AI" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sales Coach AI",
    description: "Coaching that compounds.",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
    apple: { url: "/apple-icon.png", sizes: "180x180" },
  },
};

// Next.js 14: themeColor lives in the viewport export, not metadata.
export const viewport = {
  themeColor: "#0B1F3A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
      <body className="bg-surface-app text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
