"use client";

import { useState, useTransition } from "react";
import { Save, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { setSettingValue } from "@/lib/actions/settings";

export function JsonSettingEditor({
  settingKey,
  category,
  defaultValue,
  initial,
  hint,
}: {
  settingKey: string;
  category?: string;
  defaultValue: unknown;
  initial: unknown;
  hint?: string;
}) {
  const initialText = JSON.stringify(initial ?? defaultValue, null, 2);
  const [text, setText] = useState(initialText);
  const [savedText, setSavedText] = useState(initialText);
  const [err, setErr] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = text !== savedText;

  function parse() {
    try {
      const v = JSON.parse(text);
      setErr(null);
      return v;
    } catch (e) {
      setErr((e as Error).message);
      return undefined;
    }
  }

  function save() {
    const v = parse();
    if (v === undefined) return;
    startTransition(async () => {
      const r = await setSettingValue(settingKey, v, category);
      if (r.ok) {
        setSavedText(text);
        setSavedHint(true);
        setTimeout(() => setSavedHint(false), 2000);
      } else {
        setErr(r.error);
      }
    });
  }

  function restoreDefault() {
    const formatted = JSON.stringify(defaultValue, null, 2);
    setText(formatted);
    setErr(null);
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="font-semibold tracking-tight">Configuration</p>
          {hint && <p className="text-xs text-ink-3 mt-0.5">{hint}</p>}
          <p className="text-[11px] text-ink-3 mt-1 font-mono">
            key:{" "}
            <code className="text-ink-2">{settingKey}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Badge tone="warning" className="!text-[10px]">
              ยังไม่บันทึก
            </Badge>
          )}
          {savedHint && (
            <Badge tone="success" className="!text-[10px]">
              บันทึกแล้ว
            </Badge>
          )}
        </div>
      </div>

      <Label>JSON</Label>
      <Textarea
        rows={12}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setErr(null);
        }}
        className="!font-mono !text-[12px]"
        spellCheck={false}
      />
      {err && (
        <p className="text-xs text-red-600 mt-2 inline-flex items-center gap-1">
          <AlertTriangle size={11} />
          {err}
        </p>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<RotateCcw size={12} />}
          onClick={restoreDefault}
        >
          Restore Default
        </Button>
        <Button
          variant="primary"
          size="sm"
          iconLeft={<Save size={12} />}
          onClick={save}
          disabled={pending || !!err || !dirty}
        >
          {pending ? "บันทึก..." : "บันทึก"}
        </Button>
      </div>
    </Card>
  );
}
