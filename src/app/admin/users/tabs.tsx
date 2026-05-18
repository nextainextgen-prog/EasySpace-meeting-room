"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

const TABS = [
  { id: "admins", label: "แอดมินระบบ" },
  { id: "orgs", label: "องค์กรในตึก" },
  { id: "audit", label: "Audit Log" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function UsersTabs({
  admins,
  orgs,
  audit,
}: {
  admins: React.ReactNode;
  orgs: React.ReactNode;
  audit: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("admins");

  return (
    <>
      <Card className="!p-2">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 rounded-pill text-sm font-medium tracking-tight transition ${
                tab === t.id
                  ? "bg-primary-600 text-white"
                  : "text-ink-2 hover:bg-surface-subtle"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      {tab === "admins" && admins}
      {tab === "orgs" && orgs}
      {tab === "audit" && audit}
    </>
  );
}
