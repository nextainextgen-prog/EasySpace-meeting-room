"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center rounded-pill bg-ink-1 px-5 text-[13px] font-semibold text-white"
    >
      พิมพ์ / บันทึก PDF
    </button>
  );
}
