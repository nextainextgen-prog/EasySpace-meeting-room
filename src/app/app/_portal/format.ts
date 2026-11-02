import { addDays, bkkParts, fromBkk } from "@/lib/time/bkk";

const WD = ["", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const WD_LONG = ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export function hhmm(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Date chip pieces: "วันนี้"/"จ." over the day number, plus a full label. */
export function dayChip(date: string, today: string) {
  const p = bkkParts(fromBkk(date, "12:00"));
  const day = Number(date.slice(8, 10));
  const mon = MON[Number(date.slice(5, 7)) - 1];
  const rel = date === today ? "วันนี้" : date === addDays(today, 1) ? "พรุ่งนี้" : null;
  return {
    top: rel ?? WD[p.weekday],
    day,
    label: rel ?? `${WD_LONG[p.weekday]} ${day} ${mon}`,
    long: `${rel ? `${rel} · ` : ""}${WD_LONG[p.weekday]} ${day} ${mon}`,
  };
}
