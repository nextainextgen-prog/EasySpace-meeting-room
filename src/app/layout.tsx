import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#2D4EF5",
};

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ["thai"],
  display: "swap",
  variable: "--font-plex-thai",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "EasySpace — ระบบจองห้องประชุม",
    template: "%s",
  },
  description:
    "ระบบจัดการและจองห้องประชุมอัจฉริยะสำหรับตึกของคุณ พร้อม AI · Telegram · CRM",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "EasySpace — ระบบจองห้องประชุม",
    description:
      "ระบบจัดการและจองห้องประชุมอัจฉริยะ พร้อม AI · Telegram · CRM",
    locale: "th_TH",
    type: "website",
    images: [{ url: "/og-image.svg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EasySpace — ระบบจองห้องประชุม",
    description:
      "ระบบจัดการและจองห้องประชุมอัจฉริยะ พร้อม AI · Telegram · CRM",
    images: ["/og-image.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={`${jakarta.variable} ${plexThai.variable}`}>
      <body className="bg-surface-page text-ink-1 antialiased">{children}</body>
    </html>
  );
}
