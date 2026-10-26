"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SHORTCUT_NAME } from "@/lib/branding";

// Flip to false to hide the AssistiveTouch tab (and the tab UI altogether).
const SHOW_ASSISTIVE_TOUCH = true;

const TABS = {
  backtap: {
    label: "Back Tap",
    steps: [
      "Buka Settings > Accessibility > Touch > Back Tap.",
      "Pilih Double Tap.",
      `Scroll ke bagian Shortcuts, pilih ${SHORTCUT_NAME}.`,
      "Coba: buka struk atau bukti transfer, terus ketok dua kali bagian belakang iPhone Lo. Tunggu notifnya."
    ],
    note: "Butuh iPhone 8 ke atas. Kalo iPhone Lo lebih lama, pakai tab AssistiveTouch."
  },
  assistive: {
    label: "AssistiveTouch",
    steps: [
      "Buka Settings > Accessibility > Touch > AssistiveTouch, terus nyalain.",
      "Di Custom Actions, pilih Double-Tap.",
      `Scroll ke bagian Shortcuts, pilih ${SHORTCUT_NAME}.`,
      "Coba: buka struk atau bukti transfer, terus ketuk dua kali bulatan AssistiveTouch di layar. Tunggu notifnya."
    ],
    note: "Nama menu bisa beda dikit tergantung versi iOS Lo."
  }
};
type Tab = keyof typeof TABS;

function SetupTipsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("backtap");
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const current = TABS[tab];
  // Latest onClose without re-running the focus/scroll-lock effect on every render.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-lg outline-none sm:rounded-2xl"
      >
        <div className="grid gap-3 overflow-y-auto p-5 sm:p-6">
          <h2 id={titleId} className="text-lg font-semibold">
            Biar nyatet struk tinggal mencet doang
          </h2>
          <p className="text-sm text-neutral-600">
            Diaturnya di iPhone Lo, bukan di laptop. Pilih aja Lo nyamannya pake yang mana
          </p>

          {SHOW_ASSISTIVE_TOUCH && (
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
              {(Object.keys(TABS) as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`h-10 rounded-md text-sm font-medium ${
                    tab === t ? "bg-white shadow-sm" : "text-neutral-600"
                  }`}
                >
                  {TABS[t].label}
                </button>
              ))}
            </div>
          )}

          <ol className="grid gap-3 text-sm text-neutral-700">
            {current.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-neutral-500">{current.note}</p>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white"
          >
            Oke, ngerti
          </button>
        </div>
      </div>
    </div>
  );
}

/** Dashboard: opens once for `?tips=1`, then drops the param without a re-render. */
export function SetupTips({ initialOpen = false }: { initialOpen?: boolean }) {
  // Seeded once from the prop. Never re-derived, so a server re-render cannot close it.
  const [open, setOpen] = useState(initialOpen);

  useEffect(() => {
    if (!initialOpen) return;
    // replaceState, not router.replace: no RSC request, so the modal stays open
    // and a refresh does not reopen it.
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tips")) return;
    url.searchParams.delete("tips");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [initialOpen]);

  return open ? <SetupTipsModal onClose={() => setOpen(false)} /> : null;
}

/** /devices: reopen the same guide on demand. */
export function SetupTipsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center rounded-full border border-neutral-300 bg-white px-4 text-sm font-medium transition hover:bg-neutral-50"
      >
        Cara pasang trigger
      </button>
      {open && <SetupTipsModal onClose={() => setOpen(false)} />}
    </>
  );
}
