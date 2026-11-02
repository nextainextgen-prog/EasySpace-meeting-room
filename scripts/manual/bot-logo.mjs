// Profile picture for @EasySpaceBookingBot: a calendar with a check, in the
// product blue, kept inside the circle Telegram crops avatars to.
//   node scripts/manual/bot-logo.mjs public/brand/easyspace-bot.png
import fs from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const out = process.argv[2] ?? "public/brand/easyspace-bot.png";
const S = 1024;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" fill="#2D4EF5"/>
  <!-- calendar body -->
  <rect x="262" y="300" width="500" height="452" rx="72" fill="#FFFFFF"/>
  <!-- header band -->
  <path d="M262 372 a72 72 0 0 1 72 -72 h356 a72 72 0 0 1 72 72 v38 h-500 z" fill="#E0E7FF"/>
  <!-- rings -->
  <rect x="368" y="236" width="44" height="128" rx="22" fill="#FFFFFF"/>
  <rect x="612" y="236" width="44" height="128" rx="22" fill="#FFFFFF"/>
  <rect x="380" y="248" width="20" height="104" rx="10" fill="#1E3AE8"/>
  <rect x="624" y="248" width="20" height="104" rx="10" fill="#1E3AE8"/>
  <!-- check -->
  <path d="M392 572 l86 86 l166 -170" fill="none" stroke="#2D4EF5" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
fs.writeFileSync(out, new Resvg(svg, { fitTo: { mode: "width", value: S } }).render().asPng());
console.log("wrote", out);
