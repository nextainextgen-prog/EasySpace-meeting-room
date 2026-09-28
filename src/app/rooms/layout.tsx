import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "จองห้องประชุม — EasySpace",
  description: "เช็กห้องว่างแบบเรียลไทม์และจองห้องประชุมออนไลน์ได้ทันที",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RoomsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-[#F6F7FB] text-ink-1">{children}</div>;
}
