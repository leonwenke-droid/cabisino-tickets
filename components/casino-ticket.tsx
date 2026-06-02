"use client";

import { QRCodeSVG } from "qrcode.react";
import type { Entry } from "@/lib/supabase";

export function CasinoTicket({
  entry,
  ticketRef,
}: {
  entry: Entry;
  ticketRef?: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div ref={ticketRef} className="casino-ticket rounded-2xl p-6 relative overflow-hidden">
      <span className="absolute top-3 left-4 text-gold/40 text-lg select-none">♠</span>
      <span className="absolute top-3 right-4 text-gold/40 text-lg select-none">♥</span>
      <span className="absolute bottom-3 left-4 text-gold/40 text-lg select-none">♣</span>
      <span className="absolute bottom-3 right-4 text-gold/40 text-lg select-none">♦</span>

      <div className="text-center mb-5">
        <p className="font-serif text-gold text-xs tracking-[0.25em] uppercase mb-1">
          Cabisino 2026
        </p>
        <div
          className="w-16 h-px mx-auto"
          style={{ background: "linear-gradient(90deg,transparent,#C9A227,transparent)" }}
        />
      </div>

      <div className="flex justify-center mb-5">
        <div
          className="p-3 bg-white rounded-xl shadow-2xl"
          style={{ boxShadow: "0 4px 30px rgba(0,0,0,0.5), 0 0 0 3px rgba(201,162,39,0.3)" }}
        >
          <QRCodeSVG
            value={entry.id}
            size={180}
            level="H"
            fgColor="#080f0a"
            bgColor="#ffffff"
          />
        </div>
      </div>

      <div className="space-y-2 text-sm font-sans">
        <div className="flex justify-between">
          <span className="text-cream-muted">Name</span>
          <span className="text-cream font-medium">
            {entry.vorname} {entry.nachname}
          </span>
        </div>
        {entry.guests && entry.guests.length > 0 && (
          <div className="flex justify-between">
            <span className="text-cream-muted">Begleitung</span>
            <span className="text-cream text-right max-w-[60%]">{entry.guests.join(", ")}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-cream-muted">Personen</span>
          <span className="text-cream">{entry.total_persons}</span>
        </div>
        <div
          className="flex justify-between items-center pt-3 mt-1"
          style={{ borderTop: "1px solid rgba(201,162,39,0.25)" }}
        >
          <span className="text-cream-muted">Zu zahlen</span>
          <span className="font-serif text-2xl text-gold font-bold">{entry.total_price} €</span>
        </div>
      </div>

      <div className="mt-4 text-center">
        <div
          className="w-20 h-px mx-auto mb-2"
          style={{ background: "linear-gradient(90deg,transparent,#C9A227,transparent)" }}
        />
        <p className="text-gold/40 text-xs font-sans tracking-widest uppercase">
          Ticket · Abiball 2026
        </p>
      </div>
    </div>
  );
}

export async function downloadCasinoTicket(entry: Entry, element: HTMLElement) {
  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(element, { pixelRatio: 3, cacheBust: true });
  const link = document.createElement("a");
  link.download = `cabisino-ticket-${entry.vorname}-${entry.nachname}.png`;
  link.href = dataUrl;
  link.click();
}
