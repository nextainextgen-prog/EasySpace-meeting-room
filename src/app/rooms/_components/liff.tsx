"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * LIFF bridge for the public pages.
 *
 * Inside LINE (rich menu / LIFF links) we learn who the customer is, so the
 * booking card and payment confirmation can be pushed to their chat. Outside
 * LINE nothing loads — a QR scanned with the phone camera stays a plain page,
 * and "รับการยืนยันทาง LINE" hands off to LIFF when they want it.
 */

interface LiffSdk {
  init(opts: { liffId: string }): Promise<void>;
  isInClient(): boolean;
  isLoggedIn(): boolean;
  getAccessToken(): string | null;
  login(opts?: { redirectUri?: string }): void;
}

declare global {
  interface Window {
    liff?: LiffSdk;
  }
}

interface LiffState {
  liffId: string;
  /** SDK initialised (or skipped because we're not in LINE). */
  ready: boolean;
  inLine: boolean;
  accessToken: string | null;
  /** Open a /rooms sub-path through LIFF, i.e. inside the LINE app. */
  openInLine: (path: string) => void;
}

const Ctx = createContext<LiffState>({
  liffId: "",
  ready: true,
  inLine: false,
  accessToken: null,
  openInLine: () => {},
});

export const useLiff = () => useContext(Ctx);

const SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

function loadSdk(): Promise<LiffSdk> {
  if (window.liff) return Promise.resolve(window.liff);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => (window.liff ? resolve(window.liff) : reject(new Error("liff missing")));
    s.onerror = () => reject(new Error("liff load failed"));
    document.head.appendChild(s);
  });
}

export function LiffProvider({ liffId, children }: { liffId: string; children: React.ReactNode }) {
  const [state, setState] = useState({ ready: !liffId, inLine: false, accessToken: null as string | null });

  useEffect(() => {
    if (!liffId) return;
    const ua = navigator.userAgent;
    const url = new URL(window.location.href);
    const viaLiff = url.searchParams.has("liff.state") || /liff/i.test(document.referrer);
    const inLineBrowser = /\bLine\//i.test(ua);
    if (!viaLiff && !inLineBrowser) {
      setState((s) => ({ ...s, ready: true }));
      return;
    }
    let cancelled = false;
    loadSdk()
      .then(async (liff) => {
        await liff.init({ liffId });
        if (cancelled) return;
        const loggedIn = liff.isLoggedIn();
        setState({
          ready: true,
          inLine: liff.isInClient() || loggedIn,
          accessToken: loggedIn ? liff.getAccessToken() : null,
        });
      })
      .catch(() => !cancelled && setState((s) => ({ ...s, ready: true })));
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  const value: LiffState = {
    liffId,
    ...state,
    openInLine: (path) => {
      if (!liffId) return;
      window.location.href = `https://liff.line.me/${liffId}/${path.replace(/^\/+/, "")}`;
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
