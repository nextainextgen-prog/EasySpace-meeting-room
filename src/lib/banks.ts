/**
 * Thai banks — one registry for logos, names and matching.
 *
 * Logos are self-hosted in /public/banks (from the ISC-licensed
 * `thai-banks-logo` set). `resolveBank` accepts whatever a human or an API
 * calls a bank — "KBank", "กสิกร", "004", EasySlip's `short` "KBANK" — so
 * older free-text rows and slip data both find their logo.
 */

export interface ThaiBank {
  code: string;
  /** Bank-of-Thailand / clearing code EasySlip reports as `bank.id`. */
  id: string | null;
  name: string;
  nameLong: string;
  nameEN: string;
  logo: string;
  aliases: string[];
}

export const THAI_BANKS: ThaiBank[] = [
  { code: "KBANK", id: "004", name: "กสิกรไทย", nameLong: "ธนาคารกสิกรไทย", nameEN: "Kasikornbank", aliases: ["kbank", "k-bank", "kasikorn", "กสิกร"] },
  { code: "SCB", id: "014", name: "ไทยพาณิชย์", nameLong: "ธนาคารไทยพาณิชย์", nameEN: "Siam Commercial Bank", aliases: ["scb", "siam commercial", "ไทยพาณิชย์"] },
  { code: "BBL", id: "002", name: "กรุงเทพ", nameLong: "ธนาคารกรุงเทพ", nameEN: "Bangkok Bank", aliases: ["bbl", "bangkok bank", "กรุงเทพ"] },
  { code: "KTB", id: "006", name: "กรุงไทย", nameLong: "ธนาคารกรุงไทย", nameEN: "Krungthai Bank", aliases: ["ktb", "krungthai", "krung thai", "กรุงไทย"] },
  { code: "BAY", id: "025", name: "กรุงศรีอยุธยา", nameLong: "ธนาคารกรุงศรีอยุธยา", nameEN: "Krungsri (Bank of Ayudhya)", aliases: ["bay", "krungsri", "ayudhya", "กรุงศรี"] },
  { code: "TTB", id: "011", name: "ทีเอ็มบีธนชาต", nameLong: "ธนาคารทหารไทยธนชาต", nameEN: "TMBThanachart Bank", aliases: ["ttb", "tmb", "thanachart", "ทหารไทย", "ธนชาต", "ทีทีบี"] },
  { code: "GSB", id: "030", name: "ออมสิน", nameLong: "ธนาคารออมสิน", nameEN: "Government Savings Bank", aliases: ["gsb", "ออมสิน"] },
  { code: "BAAC", id: "034", name: "ธ.ก.ส.", nameLong: "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร", nameEN: "BAAC", aliases: ["baac", "ธกส", "ธ.ก.ส"] },
  { code: "GHB", id: "033", name: "อาคารสงเคราะห์", nameLong: "ธนาคารอาคารสงเคราะห์", nameEN: "Government Housing Bank", aliases: ["ghb", "ธอส", "อาคารสงเคราะห์"] },
  { code: "KKP", id: "069", name: "เกียรตินาคินภัทร", nameLong: "ธนาคารเกียรตินาคินภัทร", nameEN: "Kiatnakin Phatra Bank", aliases: ["kkp", "kiatnakin", "เกียรตินาคิน"] },
  { code: "CIMB", id: "022", name: "ซีไอเอ็มบี ไทย", nameLong: "ธนาคารซีไอเอ็มบี ไทย", nameEN: "CIMB Thai", aliases: ["cimb", "ซีไอเอ็มบี"] },
  { code: "UOB", id: "024", name: "ยูโอบี", nameLong: "ธนาคารยูโอบี", nameEN: "United Overseas Bank", aliases: ["uob", "ยูโอบี"] },
  { code: "TISCO", id: "067", name: "ทิสโก้", nameLong: "ธนาคารทิสโก้", nameEN: "TISCO Bank", aliases: ["tisco", "ทิสโก้"] },
  { code: "LHB", id: "073", name: "แลนด์ แอนด์ เฮ้าส์", nameLong: "ธนาคารแลนด์ แอนด์ เฮ้าส์", nameEN: "Land and Houses Bank", aliases: ["lhb", "lh bank", "land and houses", "แลนด์ แอนด์ เฮ้าส์"] },
  { code: "TCRB", id: "071", name: "ไทยเครดิต", nameLong: "ธนาคารไทยเครดิต", nameEN: "Thai Credit Bank", aliases: ["tcrb", "thai credit", "ไทยเครดิต"] },
  { code: "ICBC", id: "070", name: "ไอซีบีซี (ไทย)", nameLong: "ธนาคารไอซีบีซี (ไทย)", nameEN: "ICBC (Thai)", aliases: ["icbc", "ไอซีบีซี"] },
  { code: "IBANK", id: "066", name: "อิสลามแห่งประเทศไทย", nameLong: "ธนาคารอิสลามแห่งประเทศไทย", nameEN: "Islamic Bank of Thailand", aliases: ["ibank", "islamic", "อิสลาม"] },
  { code: "CITI", id: "017", name: "ซิตี้แบงก์", nameLong: "ธนาคารซิตี้แบงก์", nameEN: "Citibank", aliases: ["citi", "citibank", "ซิตี้"] },
  { code: "HSBC", id: "031", name: "เอชเอสบีซี", nameLong: "ธนาคารเอชเอสบีซี", nameEN: "HSBC", aliases: ["hsbc", "เอชเอสบีซี"] },
  { code: "PromptPay", id: null, name: "พร้อมเพย์", nameLong: "พร้อมเพย์", nameEN: "PromptPay", aliases: ["promptpay", "prompt pay", "พร้อมเพย์"] },
  { code: "TrueMoney", id: null, name: "ทรูมันนี่", nameLong: "ทรูมันนี่ วอลเล็ท", nameEN: "TrueMoney Wallet", aliases: ["truemoney", "true money", "ทรูมันนี่"] },
].map((b) => ({ ...b, logo: `/banks/${b.code}.png` }));

/** Banks an account can live at (wallets excluded) — for the admin picker. */
export const ACCOUNT_BANKS = THAI_BANKS.filter((b) => b.id !== null);

const norm = (s: string) => s.toLowerCase().replace(/^ธนาคาร/, "").replace(/[\s.()-]/g, "");

export function resolveBank(input: string | null | undefined): ThaiBank | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const byId = THAI_BANKS.find((b) => b.id && b.id === raw.padStart(3, "0"));
  if (/^\d{1,3}$/.test(raw)) return byId ?? null;
  const n = norm(raw);
  return (
    THAI_BANKS.find(
      (b) =>
        norm(b.code) === n ||
        norm(b.name) === n ||
        norm(b.nameLong) === n ||
        norm(b.nameEN) === n ||
        b.aliases.some((a) => norm(a) === n),
    ) ??
    // "ธนาคารกสิกรไทย จำกัด (มหาชน)", "KBank สาขาสยาม" …
    THAI_BANKS.find((b) => [b.name, ...b.aliases].some((a) => norm(a).length >= 3 && n.includes(norm(a)))) ??
    null
  );
}
