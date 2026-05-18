import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

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
  title: "EasySpace — ระบบจองห้องประชุม",
  description: "ระบบจัดการและจองห้องประชุม EasySpace",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
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
