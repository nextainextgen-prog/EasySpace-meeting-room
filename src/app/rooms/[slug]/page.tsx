import { notFound } from "next/navigation";
import {
  resolvePublicRoom,
  listPublicAvailability,
  listOtherPublicRoomStrips,
} from "@/lib/data/public-rooms";
import { RoomAvailability } from "./room-availability";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const { room } = await resolvePublicRoom(slug);
  return {
    title: room
      ? `${room.name} — เช็กห้องว่าง · EasySpace`
      : "เช็กห้องว่าง — EasySpace",
  };
}

export default async function PublicRoomPage({ params }: PageProps) {
  const { slug } = await params;
  const { room, config } = await resolvePublicRoom(slug);
  if (!room || !config.enabled) return notFound();

  const [bookings, otherRooms] = await Promise.all([
    listPublicAvailability(room.id, config.show_days),
    listOtherPublicRoomStrips(room.id),
  ]);

  return (
    <RoomAvailability
      room={{
        id: room.id,
        name: room.name,
        capacity_min: room.capacity_min,
        capacity_max: room.capacity_max,
        hourly_rate: Number(room.hourly_rate),
        color: room.color,
        thumbnail_url: room.thumbnail_url,
        amenities: room.amenities,
        perks: room.perks,
        floor: room.floor,
      }}
      bookings={bookings}
      otherRooms={otherRooms}
      config={config}
    />
  );
}
