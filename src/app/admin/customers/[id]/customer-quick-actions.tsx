"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MessageCircle,
  Mail,
  Phone,
  Plus,
  Pencil,
  Ban,
  Archive,
  MoreVertical,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleBlacklist, archiveCustomer } from "@/lib/actions/customers";
import { CustomerFormModal } from "../customer-form-modal";
import type { CustomerWithOwner } from "@/lib/data/customers";

interface Props {
  customer: CustomerWithOwner;
  owners: Array<{ id: string; full_name: string | null; email: string }>;
}

export function CustomerQuickActions({ customer, owners }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();

  function onBlacklistToggle() {
    const isBlocked = !!customer.blacklisted_at;
    const reason = isBlocked
      ? undefined
      : (prompt("เหตุผลที่แบล็คลิสต์ลูกค้านี้?") ?? undefined);
    if (!isBlocked && !reason) return;
    startTransition(async () => {
      await toggleBlacklist(customer.id, reason);
      router.refresh();
    });
    setMenuOpen(false);
  }

  function onArchive() {
    if (!confirm("ซ่อน (Archive) ลูกค้านี้?")) return;
    startTransition(async () => {
      await archiveCustomer(customer.id);
      router.push("/admin/customers");
    });
    setMenuOpen(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {customer.line_id && (
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<MessageCircle size={14} />}
          onClick={() =>
            window.open(
              `https://line.me/R/ti/p/${encodeURIComponent(customer.line_id ?? "")}`,
              "_blank",
            )
          }
        >
          LINE
        </Button>
      )}
      {customer.email && (
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Mail size={14} />}
          onClick={() => (window.location.href = `mailto:${customer.email}`)}
        >
          Email
        </Button>
      )}
      {customer.phone && (
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<Phone size={14} />}
          onClick={() => (window.location.href = `tel:${customer.phone}`)}
        >
          Call
        </Button>
      )}
      <Link href={`/admin/bookings?customerId=${customer.id}`}>
        <Button size="sm" iconLeft={<Plus size={14} />}>
          จองให้
        </Button>
      </Link>

      <Button
        variant="secondary"
        size="sm"
        iconLeft={<Pencil size={14} />}
        onClick={() => setEditOpen(true)}
      >
        แก้ไข
      </Button>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="h-9 w-9 rounded-pill border border-line text-ink-2 hover:bg-surface-subtle grid place-items-center"
          title="More"
        >
          <MoreVertical size={16} strokeWidth={1.75} />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 mt-1.5 z-40 w-52 bg-white rounded-card-sm border border-line shadow-card py-1.5 text-sm">
              <button
                onClick={onBlacklistToggle}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-ink-2 hover:bg-surface-subtle"
              >
                {customer.blacklisted_at ? (
                  <>
                    <ShieldCheck size={14} strokeWidth={1.75} />
                    ปลดแบล็คลิสต์
                  </>
                ) : (
                  <>
                    <Ban size={14} strokeWidth={1.75} />
                    แบล็คลิสต์ลูกค้านี้
                  </>
                )}
              </button>
              <button
                onClick={onArchive}
                className="w-full px-3 py-2 text-left flex items-center gap-2 text-ink-2 hover:bg-surface-subtle"
              >
                <Archive size={14} strokeWidth={1.75} />
                ซ่อน (Archive)
              </button>
            </div>
          </>
        )}
      </div>

      <CustomerFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        initial={{
          id: customer.id,
          display_name: customer.display_name,
          type: customer.type,
          phone: customer.phone ?? undefined,
          email: customer.email ?? undefined,
          line_id: customer.line_id ?? undefined,
          contact_name: customer.contact_name ?? undefined,
          company_name: customer.company_name ?? undefined,
          tax_id: customer.tax_id ?? undefined,
          vat_type: customer.vat_type ?? "non_vat",
          billing_address: customer.billing_address ?? undefined,
          source: customer.source ?? undefined,
          source_detail: customer.source_detail ?? undefined,
          birthday: customer.birthday ?? undefined,
          company_anniversary: customer.company_anniversary ?? undefined,
          owner_id: customer.owner_id ?? undefined,
          tags: customer.tags,
          notes: customer.notes ?? undefined,
        }}
        owners={owners}
      />
    </div>
  );
}
