"use client";

import {
  Car,
  ChalkboardSimple,
  Coffee,
  Microphone,
  Plug,
  ProjectorScreen,
  Snowflake,
  SpeakerHigh,
  Television,
  Toilet,
  VideoConference,
  WifiHigh,
  Check,
  type Icon,
} from "@phosphor-icons/react";

const RULES: Array<[RegExp, Icon]> = [
  [/wi-?fi|อินเทอร์เน็ต|internet/i, WifiHigh],
  [/โปรเจ|projector/i, ProjectorScreen],
  [/ไมโครโฟน|ไมค์|mic/i, Microphone],
  [/เครื่องเสียง|ลำโพง|speaker|sound/i, SpeakerHigh],
  [/จอ|tv|ทีวี|โทรทัศน์|display/i, Television],
  [/ปลั๊ก|plug|power/i, Plug],
  [/แอร์|air/i, Snowflake],
  [/กาแฟ|coffee|pantry|อาหาร|เครื่องดื่ม/i, Coffee],
  [/ที่จอดรถ|parking|จอดรถ/i, Car],
  [/ห้องน้ำ|restroom/i, Toilet],
  [/ไวท์บอร์ด|whiteboard|board/i, ChalkboardSimple],
  [/conference|vdo|video|zoom/i, VideoConference],
];

/** A thin-line glyph for an amenity label; a plain check when nothing fits. */
export function AmenityIcon({ label, size = 20 }: { label: string; size?: number }) {
  const Glyph = RULES.find(([re]) => re.test(label))?.[1] ?? Check;
  return <Glyph size={size} weight="light" aria-hidden />;
}
