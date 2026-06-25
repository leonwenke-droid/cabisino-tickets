import {
  BRAND_FOOTER_HTML,
  CARD_BG,
  CARD_CREAM_MUTED,
  CARD_GOLD,
  SHARP_TEXT_STYLE,
  captureNodeJpeg,
  createCardRenderContainer,
  createOrnamentalDivider,
  ensureExportFontsReady,
  scalePx,
} from "@/lib/export-card-render";

import QRCode from "qrcode";

// Pinnwand cards: 20×30cm at 300 DPI => 2362×3543px
const PINNWAND_DPI = 300;
const PINNWAND_W_MM = 200;
const PINNWAND_H_MM = 300;
const PINNWAND_W_PX = Math.round((PINNWAND_W_MM / 25.4) * PINNWAND_DPI);
const PINNWAND_H_PX = Math.round((PINNWAND_H_MM / 25.4) * PINNWAND_DPI);

type PersonRow = {
  first: string;
  last: string;
  tableNumber: number;
};

type PinnwandDataResponse =
  | {
      ok: true;
      published_at: string | null;
      assignment: Record<string, unknown>;
      entries: {
        id: string;
        vorname: string;
        nachname: string;
        guests: string[] | null;
      }[];
    }
  | { ok?: false; error: string; published_at?: string | null };

const PINNWAND_URL = "https://cabisino-tickets.vercel.app/finden";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function rangeLabelFor(rows: PersonRow[]): string {
  const first = rows[0]?.last?.trim()?.[0]?.toUpperCase() ?? "A";
  const last = rows[rows.length - 1]?.last?.trim()?.[0]?.toUpperCase() ?? first;
  if (first === last) return first;
  return `${first}–${last}`;
}

function rangeSlug(label: string): string {
  return slugify(label.replace("–", "-"));
}

function getTableNumberFromAssignment(
  assignment: Record<string, unknown>,
  entryId: string
): number | null {
  const raw = assignment[entryId];
  const tableNumber =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseInt(raw, 10)
        : NaN;
  return Number.isFinite(tableNumber) ? tableNumber : null;
}

function collectPeople(data: Extract<PinnwandDataResponse, { ok: true }>): PersonRow[] {
  const people: PersonRow[] = [];

  for (const e of data.entries) {
    const tableNumber = getTableNumberFromAssignment(data.assignment, e.id);
    if (!tableNumber) continue;

    people.push({
      first: e.vorname.trim(),
      last: e.nachname.trim(),
      tableNumber,
    });
  }

  return people
    .filter((p) => p.first || p.last)
    .sort((a, b) => {
      const lastCmp = a.last.localeCompare(b.last, "de", { sensitivity: "base" });
      if (lastCmp !== 0) return lastCmp;
      const firstCmp = a.first.localeCompare(b.first, "de", { sensitivity: "base" });
      if (firstCmp !== 0) return firstCmp;
      return a.tableNumber - b.tableNumber;
    });
}

function splitIntoCards(rows: PersonRow[], targetRowsPerCard = 38): PersonRow[][] {
  void targetRowsPerCard;
  if (rows.length === 0) return [];

  const cards: PersonRow[][] = [];
  const total = rows.length;
  const cardCount = 4;
  const base = Math.floor(total / cardCount);
  const rest = total % cardCount;

  let offset = 0;
  for (let i = 0; i < cardCount; i++) {
    const size = base + (i < rest ? 1 : 0);
    const slice = rows.slice(offset, offset + size);
    if (slice.length > 0) cards.push(slice);
    offset += size;
  }

  return cards;
}

function createBaseCard(widthPx: number, heightPx: number): HTMLDivElement {
  const borderPx = Math.round(widthPx * 0.008);
  const padX = Math.round(widthPx * 0.085);
  const padY = Math.round(heightPx * 0.07);
  const suitSize = Math.round(heightPx * 0.034);
  const suitInset = Math.round(widthPx * 0.06);
  const footerOffset = Math.round(heightPx * 0.095);

  const el = document.createElement("div");
  el.style.cssText = [
    `width:${widthPx}px`,
    `height:${heightPx}px`,
    `box-sizing:border-box`,
    `position:relative`,
    `overflow:hidden`,
    `background:${CARD_BG}`,
    `border:${borderPx}px solid ${CARD_GOLD}`,
    `border-radius:${scalePx(18, widthPx)}px`,
    `display:flex`,
    `flex-direction:column`,
    `padding:${padY}px ${padX}px`,
    `font-family:'Playfair Display',Georgia,serif`,
    SHARP_TEXT_STYLE,
  ].join(";");

  const suits = ["♠", "♥", "♣", "♦"] as const;
  const suitPositions = [
    `top:${suitInset}px;left:${suitInset}px`,
    `top:${suitInset}px;right:${suitInset}px`,
    `bottom:${footerOffset}px;left:${suitInset}px`,
    `bottom:${footerOffset}px;right:${suitInset}px`,
  ];
  suits.forEach((suit, i) => {
    const span = document.createElement("span");
    span.textContent = suit;
    span.style.cssText = `position:absolute;${suitPositions[i]};font-size:${suitSize}px;color:${CARD_GOLD};opacity:0.35;user-select:none;line-height:1;${SHARP_TEXT_STYLE}`;
    el.appendChild(span);
  });

  return el;
}

function createFooter(widthPx: number, heightPx: number): HTMLDivElement {
  const footerSize = Math.round(heightPx * 0.011);
  const footer = document.createElement("div");
  footer.style.cssText = "text-align:center;width:100%;margin-top:auto";

  const footerText = document.createElement("p");
  footerText.innerHTML = `${BRAND_FOOTER_HTML} · Powered by LYNIQ Media`;
  footerText.style.cssText = `margin:0;font-size:${footerSize}px;letter-spacing:0.14em;color:${CARD_CREAM_MUTED};font-family:'DM Sans',system-ui,sans-serif;${SHARP_TEXT_STYLE}`;
  footer.append(footerText);
  return footer;
}

function createQrCard(qrSvg: string): HTMLDivElement {
  const widthPx = PINNWAND_W_PX;
  const heightPx = PINNWAND_H_PX;
  const el = createBaseCard(widthPx, heightPx);

  const heading = document.createElement("h1");
  heading.textContent = "Wo sitze ich?";
  heading.style.cssText = [
    "margin:0",
    `font-size:${Math.round(heightPx * 0.06)}px`,
    "font-weight:800",
    `color:${CARD_GOLD}`,
    "line-height:1.05",
    SHARP_TEXT_STYLE,
  ].join(";");

  const sub = document.createElement("p");
  sub.textContent = "QR-Code scannen & Namen eingeben";
  sub.style.cssText = `margin:${Math.round(heightPx * 0.015)}px 0 0;font-size:${Math.round(
    heightPx * 0.018
  )}px;color:${CARD_CREAM_MUTED};font-family:'DM Sans',system-ui,sans-serif;${SHARP_TEXT_STYLE}`;

  const divider = createOrnamentalDivider(64, "♦", Math.round(heightPx * 0.018));
  divider.style.margin = `${Math.round(heightPx * 0.03)}px auto 0`;

  const qrWrap = document.createElement("div");
  qrWrap.style.cssText =
    "display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:18px";

  const qrBox = document.createElement("div");
  const qrSize = Math.round(widthPx * 0.6);
  qrBox.style.cssText = [
    `width:${qrSize}px`,
    `height:${qrSize}px`,
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:#ffffff",
    `padding:${Math.round(widthPx * 0.02)}px`,
    `border-radius:${Math.round(widthPx * 0.02)}px`,
    `box-shadow:0 0 0 2px rgba(201,162,39,0.25)`,
  ].join(";");

  const qrSvgWrap = document.createElement("div");
  qrSvgWrap.innerHTML = qrSvg;
  qrSvgWrap.style.cssText = `width:${qrSize}px;height:${qrSize}px`;
  const svg = qrSvgWrap.querySelector("svg") as SVGElement | null;
  if (svg) {
    svg.setAttribute("width", String(qrSize));
    svg.setAttribute("height", String(qrSize));
    svg.setAttribute("viewBox", svg.getAttribute("viewBox") ?? `0 0 ${qrSize} ${qrSize}`);
    svg.style.width = `${qrSize}px`;
    svg.style.height = `${qrSize}px`;
    svg.style.display = "block";
  }
  qrBox.appendChild(qrSvgWrap);

  const urlText = document.createElement("p");
  urlText.textContent = PINNWAND_URL;
  urlText.style.cssText = `margin:0;font-size:${Math.round(
    heightPx * 0.014
  )}px;color:${CARD_GOLD};opacity:0.9;letter-spacing:0.06em;font-family:'DM Sans',system-ui,sans-serif;${SHARP_TEXT_STYLE}`;

  qrWrap.append(qrBox, urlText);

  const footer = createFooter(widthPx, heightPx);

  const top = document.createElement("div");
  top.style.cssText = "text-align:center";
  top.append(heading, sub, divider);

  el.append(top, qrWrap, footer);
  return el;
}

function createNameListCard(rows: PersonRow[], rangeLabel: string): HTMLDivElement {
  const widthPx = PINNWAND_W_PX;
  const heightPx = PINNWAND_H_PX;
  const el = createBaseCard(widthPx, heightPx);

  const title = document.createElement("h1");
  title.textContent = "Tischordnung";
  title.style.cssText = [
    "margin:0",
    `font-size:${Math.round(heightPx * 0.055)}px`,
    "font-weight:800",
    `color:${CARD_GOLD}`,
    "line-height:1.05",
    SHARP_TEXT_STYLE,
  ].join(";");

  const sub = document.createElement("p");
  sub.textContent = rangeLabel;
  sub.style.cssText = `margin:${Math.round(heightPx * 0.01)}px 0 0;font-size:${Math.round(
    heightPx * 0.02
  )}px;color:${CARD_CREAM_MUTED};font-family:'DM Sans',system-ui,sans-serif;letter-spacing:0.12em;text-transform:uppercase;${SHARP_TEXT_STYLE}`;

  const divider = createOrnamentalDivider(70, "♠", Math.round(heightPx * 0.016));
  divider.style.margin = `${Math.round(heightPx * 0.02)}px auto 0`;

  const header = document.createElement("div");
  header.style.cssText = "text-align:center";
  header.append(title, sub, divider);

  const list = document.createElement("div");
  // With a fixed 4-card split, we can afford larger, more readable rows.
  const rowFont = Math.round(heightPx * 0.0185);
  const tableFont = Math.round(heightPx * 0.019);
  const rowGap = Math.round(heightPx * 0.0085);
  list.style.cssText = [
    `margin-top:${Math.round(heightPx * 0.035)}px`,
    "display:flex",
    "flex-direction:column",
    `gap:${rowGap}px`,
    "flex:1",
  ].join(";");

  for (const r of rows) {
    const row = document.createElement("div");
    row.style.cssText = [
      "display:flex",
      "justify-content:space-between",
      "align-items:baseline",
      "gap:16px",
      `padding:${Math.round(rowGap * 0.35)}px 0`,
      "border-bottom:1px solid rgba(201,162,39,0.14)",
      SHARP_TEXT_STYLE,
    ].join(";");

    const left = document.createElement("span");
    left.textContent = `${r.last}, ${r.first}`.replace(/^,\s*/, "");
    left.style.cssText = `font-size:${rowFont}px;color:rgba(250,246,232,0.92);font-family:'DM Sans',system-ui,sans-serif;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:${Math.round(
      widthPx * 0.74
    )}px;${SHARP_TEXT_STYLE}`;

    const right = document.createElement("span");
    right.textContent = `Tisch ${r.tableNumber}`;
    right.style.cssText = `font-size:${tableFont}px;color:${CARD_GOLD};font-family:'DM Sans',system-ui,sans-serif;font-weight:800;white-space:nowrap;${SHARP_TEXT_STYLE}`;

    row.append(left, right);
    list.append(row);
  }

  const footer = createFooter(widthPx, heightPx);
  el.append(header, list, footer);
  return el;
}

async function renderCardJpeg(el: HTMLDivElement, container: HTMLDivElement): Promise<string> {
  container.appendChild(el);
  try {
    return await captureNodeJpeg(el, PINNWAND_W_PX, PINNWAND_H_PX);
  } finally {
    container.removeChild(el);
  }
}

export async function downloadPinnwandCardsZip(): Promise<void> {
  const adminToken = sessionStorage.getItem("admin_auth_token") ?? "";
  const res = await fetch("/api/pinnwand-cards-data", {
    method: "GET",
    headers: { "x-admin-token": adminToken },
  });
  const json = (await res.json()) as PinnwandDataResponse;

  if (!res.ok) {
    throw new Error("error" in json ? json.error : "Daten konnten nicht geladen werden.");
  }
  if (!("ok" in json) || !json.ok) {
    throw new Error("error" in json ? json.error : "Noch kein Sitzplan veröffentlicht.");
  }

  await ensureExportFontsReady();
  await Promise.all([
    document.fonts.load('600 48px "DM Sans"'),
    document.fonts.load('800 64px "Playfair Display"'),
  ]);

  const people = collectPeople(json);
  if (
    !people.some(
      (p) => `${p.first} ${p.last}`.trim().toLowerCase() === "frank wieligmann"
    ) &&
    !people.some(
      (p) => `${p.first} ${p.last}`.trim().toLowerCase() === "frank willigmann"
    ) &&
    !people.some(
      (p) => `${p.first} ${p.last}`.trim().toLowerCase() === "frank williegmann"
    )
  ) {
    // This is a data issue: the pinnwand list only contains main entries from Supabase.
    // Surface it so the admin knows they need to add/create an entry for Frank.
    // (Do not hardcode him into the export.)
    console.warn(
      "[pinnwand] Frank Wieligmann not found in entries table; will not appear on name cards."
    );
  }
  const listCards = splitIntoCards(people, 38);

  const qrSvg = await QRCode.toString(PINNWAND_URL, {
    type: "svg",
    margin: 1,
    color: {
      dark: "#111827",
      light: "#ffffff",
    },
  });

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const container = createCardRenderContainer();

  try {
    // Card 01 — QR
    const qrEl = createQrCard(qrSvg);
    const qrJpg = await renderCardJpeg(qrEl, container);
    const qrBase64 = qrJpg.split(",")[1];
    if (qrBase64) {
      zip.file("karte-01-qr-code.jpg", qrBase64, { base64: true });
    }

    // Cards 02..N — Name lists
    for (let i = 0; i < listCards.length; i++) {
      const rows = listCards[i]!;
      const label = rangeLabelFor(rows);
      const slug = rangeSlug(label);
      const cardIdx = i + 2;
      const filename = `karte-${String(cardIdx).padStart(2, "0")}-namen-${slug}.jpg`;

      const el = createNameListCard(rows, label);
      const jpg = await renderCardJpeg(el, container);
      const base64 = jpg.split(",")[1];
      if (base64) {
        zip.file(filename, base64, { base64: true });
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cabisino-pinnwand-karten.zip";
    link.click();
    URL.revokeObjectURL(link.href);
  } finally {
    document.body.removeChild(container);
  }
}

