"use client";

import { useRef, useState, useCallback } from "react";
import type { Entry } from "@/lib/supabase";
import { CasinoTicket, downloadCasinoTicket } from "@/components/casino-ticket";

export function EntryTicketDownload({
  entry,
  className = "",
}: {
  entry: Entry;
  className?: string;
}) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!ticketRef.current) return;
    setDownloading(true);
    try {
      await downloadCasinoTicket(entry, ticketRef.current);
    } finally {
      setDownloading(false);
    }
  }, [entry]);

  return (
    <>
      <div className="fixed left-[-9999px] top-0 w-[400px] pointer-events-none" aria-hidden>
        <CasinoTicket entry={entry} ticketRef={ticketRef} />
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className={`px-3 py-2 rounded-lg border border-gold/30 text-gold text-xs font-sans font-medium hover:border-gold/50 hover:bg-gold/5 transition-all disabled:opacity-50 ${className}`}
      >
        {downloading ? "…" : "↓ QR-Code"}
      </button>
    </>
  );
}

export function EntryTicketDownloadFull({ entry }: { entry: Entry }) {
  const ticketRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!ticketRef.current) return;
    setDownloading(true);
    try {
      await downloadCasinoTicket(entry, ticketRef.current);
    } finally {
      setDownloading(false);
    }
  }, [entry]);

  return (
    <>
      <div className="fixed left-[-9999px] top-0 w-[400px] pointer-events-none" aria-hidden>
        <CasinoTicket entry={entry} ticketRef={ticketRef} />
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="w-full mt-3 py-3 rounded-xl border border-gold/30 text-gold hover:border-gold/60 hover:bg-gold/5 font-sans text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <span>↓</span> {downloading ? "Wird gespeichert…" : "Ticket als Bild speichern"}
      </button>
    </>
  );
}
