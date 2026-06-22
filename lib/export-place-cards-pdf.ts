import { jsPDF } from "jspdf";
import type { AssignedTable } from "@/lib/assign-seats";

const CARD_W_MM = 100;
const CARD_H_MM = 150;
const EXPORT_W_PX = 1181;
const EXPORT_H_PX = 1772;

const GOLD = "#C9A227";
const CREAM = "#f0ead6";
const CREAM_MUTED = "#c8bfa8";
const BG = "#0a0a0f";

export type PlaceCardData = {
  tableNumber: number;
  vorname: string;
  nachname: string;
  guestNames: string[];
};

function collectPlaceCards(tables: AssignedTable[]): PlaceCardData[] {
  const cards: PlaceCardData[] = [];

  tables.forEach((table, tableIdx) => {
    for (const entry of table.entries) {
      const guestNames: string[] = [];
      const guestCount = entry.total_persons - 1;
      for (let i = 0; i < guestCount; i++) {
        guestNames.push(entry.guests?.[i] ?? `Begleitung ${i + 1}`);
      }
      cards.push({
        tableNumber: tableIdx + 1,
        vorname: entry.vorname,
        nachname: entry.nachname,
        guestNames,
      });
    }
  });

  return cards;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function placeCardZipFilename(card: PlaceCardData): string {
  const vorname = slugify(card.vorname) || "gast";
  const nachname = slugify(card.nachname) || "unbekannt";
  return `tisch-${card.tableNumber}-${vorname}-${nachname}.jpg`;
}

function createOrnamentalDivider(
  widthPercent: number,
  accent: string,
  accentSizePx: number
): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `display:flex;align-items:center;justify-content:center;width:${widthPercent}%;margin:0 auto;gap:${Math.round(accentSizePx * 0.45)}px`;

  const lineStyle = `flex:1;height:2px;background:linear-gradient(90deg,transparent,${GOLD},transparent)`;

  const left = document.createElement("div");
  left.style.cssText = lineStyle;

  const center = document.createElement("span");
  center.textContent = accent;
  center.style.cssText = `font-size:${accentSizePx}px;color:${GOLD};opacity:0.55;line-height:1;user-select:none`;

  const right = document.createElement("div");
  right.style.cssText = lineStyle;

  wrap.append(left, center, right);
  return wrap;
}

function createPlaceCardElement(
  card: PlaceCardData,
  widthPx: number,
  heightPx: number
): HTMLDivElement {
  const lineCount = 1 + card.guestNames.length;
  const baseMain =
    lineCount <= 2 ? 36 : lineCount <= 4 ? 30 : lineCount <= 6 ? 26 : 22;
  const mainSize = Math.round(baseMain * 1.3);
  const guestSize = Math.round((baseMain - 6) * 1.2);
  const tableSize = lineCount <= 4 ? 64 : 54;
  const suitSize = Math.round(heightPx * 0.034);
  const ornamentSize = Math.round(heightPx * 0.016);
  const labelSize = Math.round(heightPx * 0.012);
  const footerSize = Math.round(heightPx * 0.011);
  const borderPx = Math.round(widthPx * 0.005);
  const padX = Math.round(widthPx * 0.08);
  const padTop = Math.round(heightPx * 0.065);
  const padBottom = Math.round(heightPx * 0.06);
  const suitInset = Math.round(widthPx * 0.06);
  const footerOffset = Math.round(heightPx * 0.1);
  const nameLineGap = Math.round(mainSize * 0.18);

  const el = document.createElement("div");
  el.style.cssText = [
    `width:${widthPx}px`,
    `height:${heightPx}px`,
    `box-sizing:border-box`,
    `position:relative`,
    `overflow:hidden`,
    `background:${BG}`,
    `border:${borderPx}px solid ${GOLD}`,
    `border-radius:16px`,
    `display:flex`,
    `flex-direction:column`,
    `align-items:center`,
    `padding:${padTop}px ${padX}px ${padBottom}px`,
    `font-family:'Playfair Display',Georgia,serif`,
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
    span.style.cssText = `position:absolute;${suitPositions[i]};font-size:${suitSize}px;color:${GOLD};opacity:0.4;user-select:none;line-height:1`;
    el.appendChild(span);
  });

  const top = document.createElement("div");
  top.style.cssText = "text-align:center;width:100%;flex-shrink:0";

  const label = document.createElement("p");
  label.textContent = "Tischnummer";
  label.style.cssText = `margin:0 0 10px;font-size:${labelSize}px;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};font-family:'DM Sans',system-ui,sans-serif;font-weight:500`;

  const tableNum = document.createElement("p");
  tableNum.textContent = `Tisch ${card.tableNumber}`;
  tableNum.style.cssText = `margin:0;font-size:${tableSize}px;font-weight:700;color:${GOLD};line-height:1.05`;

  const headerDivider = createOrnamentalDivider(68, "♦", ornamentSize);
  headerDivider.style.marginTop = "16px";

  const suitRow = document.createElement("div");
  suitRow.style.cssText = `display:flex;justify-content:center;gap:${Math.round(ornamentSize * 1.1)}px;margin-top:14px`;
  (["♠", "♥", "♦", "♣"] as const).forEach((suit) => {
    const span = document.createElement("span");
    span.textContent = suit;
    span.style.cssText = `font-size:${ornamentSize}px;color:${GOLD};opacity:0.22;line-height:1;user-select:none`;
    suitRow.append(span);
  });

  top.append(label, tableNum, headerDivider, suitRow);

  const names = document.createElement("div");
  names.style.cssText = [
    `position:absolute`,
    `top:40%`,
    `left:${padX}px`,
    `right:${padX}px`,
    `transform:translateY(-50%)`,
    `text-align:center`,
    `display:flex`,
    `flex-direction:column`,
    `align-items:center`,
    `gap:${nameLineGap}px`,
  ].join(";");

  const main = document.createElement("p");
  main.textContent = `${card.vorname} ${card.nachname}`;
  main.style.cssText = `margin:0;font-size:${mainSize}px;font-weight:700;color:${CREAM};line-height:1.15;word-break:break-word`;

  names.append(main);

  for (const guest of card.guestNames) {
    const guestEl = document.createElement("p");
    guestEl.textContent = guest;
    guestEl.style.cssText = `margin:0;font-size:${guestSize}px;font-weight:400;color:${CREAM};opacity:0.92;line-height:1.12;word-break:break-word`;
    names.append(guestEl);
  }

  const bottomDivider = createOrnamentalDivider(62, "♠", ornamentSize);
  bottomDivider.style.marginTop = `${Math.round(nameLineGap * 1.4)}px`;
  names.append(bottomDivider);

  const footer = document.createElement("div");
  footer.style.cssText = "text-align:center;width:100%;flex-shrink:0;margin-top:auto";

  const footerText = document.createElement("p");
  footerText.innerHTML = `Cabisino 2026 <span style="opacity:0.7">♠</span>`;
  footerText.style.cssText = `margin:0;font-size:${footerSize}px;letter-spacing:0.14em;color:${CREAM_MUTED};font-family:'DM Sans',system-ui,sans-serif`;

  footer.append(footerText);
  el.append(top, names, footer);
  return el;
}

function createRenderContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;pointer-events:none;z-index:-1";
  document.body.appendChild(container);
  return container;
}

async function renderCardPng(
  card: PlaceCardData,
  container: HTMLDivElement
): Promise<string> {
  const { toPng } = await import("html-to-image");
  const cardEl = createPlaceCardElement(card, EXPORT_W_PX, EXPORT_H_PX);
  container.appendChild(cardEl);

  try {
    return await toPng(cardEl, {
      width: EXPORT_W_PX,
      height: EXPORT_H_PX,
      pixelRatio: 1,
      cacheBust: true,
    });
  } finally {
    container.removeChild(cardEl);
  }
}

async function renderCardJpeg(
  card: PlaceCardData,
  container: HTMLDivElement
): Promise<string> {
  const { toJpeg } = await import("html-to-image");
  const cardEl = createPlaceCardElement(card, EXPORT_W_PX, EXPORT_H_PX);
  container.appendChild(cardEl);

  try {
    return await toJpeg(cardEl, {
      quality: 0.92,
      width: EXPORT_W_PX,
      height: EXPORT_H_PX,
      pixelRatio: 1,
      cacheBust: true,
    });
  } finally {
    container.removeChild(cardEl);
  }
}

export async function downloadPlaceCardsPdf(
  tables: AssignedTable[],
  filename = "cabisino-platzkarten.pdf"
): Promise<void> {
  const cards = collectPlaceCards(tables);
  if (cards.length === 0) {
    throw new Error("Keine Einträge zum Exportieren.");
  }

  await document.fonts.ready;

  const container = createRenderContainer();
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [CARD_W_MM, CARD_H_MM],
  });

  try {
    for (let i = 0; i < cards.length; i++) {
      if (i > 0) {
        doc.addPage([CARD_W_MM, CARD_H_MM], "portrait");
      }

      const dataUrl = await renderCardPng(cards[i], container);
      doc.addImage(dataUrl, "PNG", 0, 0, CARD_W_MM, CARD_H_MM);
    }

    doc.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

export async function downloadPlaceCardsZip(
  tables: AssignedTable[],
  filename = "cabisino-platzkarten.zip"
): Promise<void> {
  const cards = collectPlaceCards(tables);
  if (cards.length === 0) {
    throw new Error("Keine Einträge zum Exportieren.");
  }

  await document.fonts.ready;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const container = createRenderContainer();

  try {
    for (const card of cards) {
      const dataUrl = await renderCardJpeg(card, container);
      const base64 = dataUrl.split(",")[1];
      if (!base64) continue;
      zip.file(placeCardZipFilename(card), base64, { base64: true });
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } finally {
    document.body.removeChild(container);
  }
}
