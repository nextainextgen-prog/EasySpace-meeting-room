import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "เช็กห้องว่าง — EasySpace",
  description: "สแกน QR เพื่อดูเวลาว่างของห้องประชุมแบบ real-time",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RoomsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-surface-subtle/40 to-white">
      {children}
    </div>
  );
}
