"use client";

import { useState } from "react";
import { Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerFormModal } from "./customer-form-modal";

export function CustomersToolbar({
  owners,
}: {
  owners: Array<{ id: string; full_name: string | null; email: string }>;
}) {
  const [open, setOpen] = useState(false);

  function handleExport() {
    // Hand-off to a future CSV endpoint; for now, link to printable view
    window.print();
  }

  return (
    <>
      <Button
        variant="secondary"
        iconLeft={<Download size={16} />}
        onClick={handleExport}
      >
        Export
      </Button>
      <Button iconLeft={<Plus size={16} />} onClick={() => setOpen(true)}>
        เพิ่มลูกค้า
      </Button>

      <CustomerFormModal
        open={open}
        onClose={() => setOpen(false)}
        mode="create"
        owners={owners}
      />
    </>
  );
}
