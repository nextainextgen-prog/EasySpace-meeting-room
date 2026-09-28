import type { Metadata, Viewport } from "next";
import { getPublicRoomConfig } from "@/lib/data/public-rooms";
import { LiffProvider } from "./_components/liff";

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

export default async function RoomsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { liff_id } = await getPublicRoomConfig();
  return (
    <div className="min-h-dvh bg-[#F6F7FB] text-ink-1 print:bg-white">
      <LiffProvider liffId={liff_id}>{children}</LiffProvider>
    </div>
  );
}
