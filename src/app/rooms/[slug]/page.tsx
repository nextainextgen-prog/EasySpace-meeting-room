import { notFound } from "next/navigation";
import {
  bkkToday,
  listPublicBusy,
  listPublicPackages,
  listPublicRooms,
  resolvePublicRoom,
  slugForRoom,
} from "@/lib/data/public-rooms";
import { parseChannel } from "@/lib/public-booking/shared";
import { getPublicPaymentInfo } from "@/lib/server/payment-slips";
import { getPublicLineContact } from "@/lib/server/booking-line";
import { LiveBadge, PublicFooter, PublicTopBar } from "../_components/chrome";
import { MyBookingsStrip } from "../_components/my-bookings";
import { BookingFlow } from "../_components/booking-flow";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ src?: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const { room } = await resolvePublicRoom(slug);
  return {
    title: room ? `${room.name} — จองห้องประชุม · EasySpace` : "จองห้องประชุม — EasySpace",
  };
}

export default async function PublicRoomPage({ params, searchParams }: PageProps) {
  const [{ slug }, { src }] = await Promise.all([params, searchParams]);
  const { room, config } = await resolvePublicRoom(slug);
  if (!room || !config.enabled || room.status !== "active") return notFound();
  const channel = parseChannel(src);

  const others = (await listPublicRooms()).filter((r) => r.id !== room.id);
  const [busyMap, packages, payment, contact] = await Promise.all([
    listPublicBusy({
      roomIds: [room.id, ...others.map((r) => r.id)],
      fromDate: bkkToday(),
      days: config.booking_days_ahead + 1,
      includeInternal: !config.allow_override_internal,
      protectMinutes: config.override_protect_minutes,
    }),
    listPublicPackages([room.id]),
    getPublicPaymentInfo(),
    getPublicLineContact(config),
  ]);

  return (
    <>
      <PublicTopBar channel={channel} right={<LiveBadge />} />
      <MyBookingsStrip channel={channel} />
      <BookingFlow
        room={{
          id: room.id,
          name: room.name,
          slug: slugForRoom(config, room),
          capacity_min: room.capacity_min,
          capacity_max: room.capacity_max,
          hourly_rate: room.hourly_rate,
          color: room.color,
          thumbnail_url: room.thumbnail_url,
          gallery_urls: room.gallery_urls,
          amenities: room.amenities,
          perks: room.perks,
          floor: room.floor,
        }}
        packages={packages.get(room.id) ?? []}
        busy={busyMap.get(room.id) ?? []}
        config={{
          booking_enabled: config.booking_enabled,
          booking_days_ahead: config.booking_days_ahead,
          min_duration_minutes: config.min_duration_minutes,
          max_duration_minutes: config.max_duration_minutes,
          line_url: contact.line_url,
          line_id: contact.line_id,
          line_oa_id: contact.line_oa_id,
          phone: config.phone,
          confirm_message: config.confirm_message,
          show_capacity: config.show_capacity,
          show_hourly_rate: config.show_hourly_rate,
          pricing: config.pricing,
        }}
        otherRooms={others.map((r) => ({
          id: r.id,
          name: r.name,
          slug: slugForRoom(config, r),
          thumbnail_url: r.thumbnail_url,
          color: r.color,
          capacity_min: r.capacity_min,
          capacity_max: r.capacity_max,
          hourly_rate: r.hourly_rate,
          // Only today matters for the "ว่างตอนนี้" badge.
          busy: (busyMap.get(r.id) ?? []).filter(
            (b) => new Date(b.startsAt).getTime() < Date.now() + 86_400_000,
          ),
        }))}
        channel={channel}
        serverNow={new Date().toISOString()}
        payment={payment}
      />
      <PublicFooter lineUrl={contact.line_url} lineId={contact.line_id} phone={config.phone} />
      {/* Room for the mobile sticky CTA so it never covers the footer. */}
      {config.booking_enabled && <div className="h-24 lg:hidden" />}
    </>
  );
}
