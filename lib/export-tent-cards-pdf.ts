import { jsPDF } from "jspdf";
import type { AssignedTable } from "@/lib/assign-seats";
import type { Entry } from "@/lib/supabase";
import { getZollhausTableNumber } from "@/lib/zollhaus-tables";
import type { PlaceCardData } from "@/lib/export-place-cards-pdf";

const CARD_W_MM = 100;
const CARD_H_MM = 150;
const EXPORT_W_PX = 1181;
const EXPORT_H_PX = 1772;
const HALF_H_PX = EXPORT_H_PX / 2;

const GOLD = "#C9A227";
const CREAM = "#f0ead6";
const CREAM_MUTED = "#c8bfa8";
const BG = "#0a0a0f";
const BRAND_FOOTER_HTML = `Cabisino 2026 <span style="opacity:0.7">♠</span>`;

export type TentCardExportOptions = {
  showFoldGuides?: boolean;
  showCropMarks?: boolean;
};

export type TentCardData = {
  tableNumber: number;
  cardIndex: number;
  cardTotal: number;
  /** Bottom half (upright when folded as tent). */
  bottomFamily: PlaceCardData | null;
  /** Top half (printed rotated 180°). null = branding-only side. */
  topFamily: PlaceCardData | null;
  topBrandingOnly: boolean;
};

type TentPair = [PlaceCardData, PlaceCardData | "branding"];

function entryToFamily(entry: Entry, tableNumber: number): PlaceCardData {
  const guestNames: string[] = [];
  const guestCount = entry.total_persons - 1;
  for (let i = 0; i < guestCount; i++) {
    guestNames.push(entry.guests?.[i] ?? `Begleitung ${i + 1}`);
  }
  return {
    tableNumber,
    vorname: entry.vorname,
    nachname: entry.nachname,
    guestNames,
  };
}

function familySize(family: PlaceCardData): number {
  return 1 + family.guestNames.length;
}

function pairFamiliesForTent(families: PlaceCardData[]): TentPair[] {
  if (families.length === 1) {
    return [[families[0], families[0]]];
  }

  const sorted = [...families].sort((a, b) => familySize(b) - familySize(a));
  const pairs: TentPair[] = [];
  let left = 0;
  let right = sorted.length - 1;

  while (left <= right) {
    if (left === right) {
      pairs.push([sorted[left], "branding"]);
      left++;
    } else {
      pairs.push([sorted[left], sorted[right]]);
      left++;
      right--;
    }
  }

  return pairs;
}

export function collectTentCards(tables: AssignedTable[]): TentCardData[] {
  const cards: TentCardData[] = [];

  tables.forEach((table, tableIdx) => {
    if (table.entries.length === 0) return;

    const tableNumber = getZollhausTableNumber(tableIdx);
    const families = table.entries.map((entry) =>
      entryToFamily(entry, tableNumber)
    );
    const pairs = pairFamiliesForTent(families);

    pairs.forEach(([bottom, top], idx) => {
      const topBrandingOnly = top === "branding";
      cards.push({
        tableNumber,
        cardIndex: idx + 1,
        cardTotal: pairs.length,
        bottomFamily: bottom,
        topFamily: topBrandingOnly ? null : top,
        topBrandingOnly,
      });
    });
  });

  return cards;
}

function tentCardZipFilename(card: TentCardData): string {
  if (card.cardTotal > 1) {
    return `tisch-${card.tableNumber}-aufsteller-${card.cardIndex}von${card.cardTotal}.jpg`;
  }
  return `tisch-${card.tableNumber}-aufsteller.jpg`;
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

function createTentCardHalfContent(
  tableNumber: number,
  family: PlaceCardData | null,
  brandingOnly: boolean,
  cardIndex: number,
  cardTotal: number,
  widthPx: number,
  halfHeightPx: number,
  foldEdge: "top" | "bottom"
): HTMLDivElement {
  const lineCount = family ? 1 + family.guestNames.length : 0;
  const baseMain =
    lineCount <= 2 ? 22 : lineCount <= 4 ? 18 : lineCount <= 6 ? 15 : 13;
  const mainSize = Math.round(baseMain * 1.25);
  const guestSize = Math.round((baseMain - 4) * 1.15);
  const tableSize = brandingOnly ? 48 : lineCount <= 4 ? 40 : 34;
  const suitSize = Math.round(halfHeightPx * 0.038);
  const ornamentSize = Math.round(halfHeightPx * 0.02);
  const labelSize = Math.round(halfHeightPx * 0.016);
  const footerSize = Math.round(halfHeightPx * 0.014);
  const borderPx = Math.round(widthPx * 0.005);
  const padX = Math.round(widthPx * 0.08);
  const padTop = Math.round(halfHeightPx * 0.07);
  const padBottom = Math.round(halfHeightPx * 0.06);
  const foldSafe = Math.round(halfHeightPx * 0.07);
  const suitInset = Math.round(widthPx * 0.06);
  const footerOffset = Math.round(halfHeightPx * 0.1);
  const nameLineGap = Math.round(mainSize * 0.16);

  const foldPadTop = foldEdge === "top" ? padTop + foldSafe : padTop;
  const foldPadBottom = foldEdge === "bottom" ? padBottom + foldSafe : padBottom;

  const el = document.createElement("div");
  el.style.cssText = [
    `width:${widthPx}px`,
    `height:${halfHeightPx}px`,
    `box-sizing:border-box`,
    `position:relative`,
    `overflow:hidden`,
    `background:${BG}`,
    `border:${borderPx}px solid transparent`,
    `display:flex`,
    `flex-direction:column`,
    `align-items:center`,
    `padding:${foldPadTop}px ${padX}px ${foldPadBottom}px`,
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
  label.style.cssText = `margin:0 0 6px;font-size:${labelSize}px;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};font-family:'DM Sans',system-ui,sans-serif;font-weight:500`;

  const tableNum = document.createElement("p");
  tableNum.textContent = `Tisch ${tableNumber}`;
  tableNum.style.cssText = `margin:0;font-size:${tableSize}px;font-weight:700;color:${GOLD};line-height:1.05`;

  top.append(label, tableNum);

  if (cardTotal > 1) {
    const cardNote = document.createElement("p");
    cardNote.textContent = `Tisch ${tableNumber} · Karte ${cardIndex}/${cardTotal}`;
    cardNote.style.cssText = `margin:6px 0 0;font-size:${Math.round(labelSize * 0.95)}px;letter-spacing:0.06em;color:${CREAM_MUTED};font-family:'DM Sans',system-ui,sans-serif;font-weight:500`;
    top.append(cardNote);
  }

  const headerDivider = createOrnamentalDivider(68, "♦", ornamentSize);
  headerDivider.style.marginTop = "10px";

  const suitRow = document.createElement("div");
  suitRow.style.cssText = `display:flex;justify-content:center;gap:${Math.round(ornamentSize * 1.1)}px;margin-top:8px`;
  (["♠", "♥", "♦", "♣"] as const).forEach((suit) => {
    const span = document.createElement("span");
    span.textContent = suit;
    span.style.cssText = `font-size:${ornamentSize}px;color:${GOLD};opacity:0.22;line-height:1;user-select:none`;
    suitRow.append(span);
  });

  top.append(headerDivider, suitRow);

  const names = document.createElement("div");
  names.style.cssText = [
    `flex:1`,
    `display:flex`,
    `flex-direction:column`,
    `align-items:center`,
    `justify-content:center`,
    `text-align:center`,
    `width:100%`,
    `gap:${nameLineGap}px`,
    `padding:${Math.round(nameLineGap * 0.5)}px 0`,
  ].join(";");

  if (!brandingOnly && family) {
    const main = document.createElement("p");
    main.textContent = `${family.vorname} ${family.nachname}`;
    main.style.cssText = `margin:0;font-size:${mainSize}px;font-weight:700;color:${CREAM};line-height:1.15;word-break:break-word`;
    names.append(main);

    for (const guest of family.guestNames) {
      const guestEl = document.createElement("p");
      guestEl.textContent = guest;
      guestEl.style.cssText = `margin:0;font-size:${guestSize}px;font-weight:400;color:${CREAM};opacity:0.92;line-height:1.12;word-break:break-word`;
      names.append(guestEl);
    }

    const bottomDivider = createOrnamentalDivider(62, "♠", ornamentSize);
    bottomDivider.style.marginTop = `${Math.round(nameLineGap * 0.8)}px`;
    names.append(bottomDivider);
  }

  const footer = document.createElement("div");
  footer.style.cssText = "text-align:center;width:100%;flex-shrink:0";

  const footerText = document.createElement("p");
  footerText.innerHTML = BRAND_FOOTER_HTML;
  footerText.style.cssText = `margin:0;font-size:${footerSize}px;letter-spacing:0.14em;color:${CREAM_MUTED};font-family:'DM Sans',system-ui,sans-serif`;

  footer.append(footerText);
  el.append(top, names, footer);
  return el;
}

function appendCropMarks(parent: HTMLDivElement, widthPx: number, heightPx: number) {
  const markLen = Math.round(widthPx * 0.025);
  const inset = Math.round(widthPx * 0.012);
  const color = "rgba(156,163,175,0.45)";

  const marks: Array<{ x: number; y: number }> = [
    { x: inset, y: inset },
    { x: widthPx - inset, y: inset },
    { x: inset, y: heightPx - inset },
    { x: widthPx - inset, y: heightPx - inset },
  ];

  for (const { x, y } of marks) {
    const h = document.createElement("div");
    const hLeft = x <= widthPx / 2 ? x : x - markLen;
    h.style.cssText = `position:absolute;left:${hLeft}px;top:${y}px;width:${markLen}px;height:1px;background:${color};pointer-events:none;`;

    const v = document.createElement("div");
    const vTop = y <= heightPx / 2 ? y : y - markLen;
    v.style.cssText = `position:absolute;left:${x}px;top:${vTop}px;width:1px;height:${markLen}px;background:${color};pointer-events:none;`;

    parent.append(h, v);
  }
}

function createTentCardElement(
  card: TentCardData,
  options: TentCardExportOptions = {}
): HTMLDivElement {
  const { showFoldGuides = true, showCropMarks = true } = options;
  const borderPx = Math.round(EXPORT_W_PX * 0.005);
  const { tableNumber, cardIndex, cardTotal, bottomFamily, topFamily, topBrandingOnly } =
    card;

  const el = document.createElement("div");
  el.style.cssText = [
    `width:${EXPORT_W_PX}px`,
    `height:${EXPORT_H_PX}px`,
    `box-sizing:border-box`,
    `position:relative`,
    `overflow:hidden`,
    `background:${BG}`,
    `border:${borderPx}px solid ${GOLD}`,
    `border-radius:16px`,
  ].join(";");

  const topHalf = document.createElement("div");
  topHalf.style.cssText = `position:absolute;top:0;left:0;width:100%;height:${HALF_H_PX}px;overflow:hidden;box-sizing:border-box;`;

  const topRotated = document.createElement("div");
  topRotated.style.cssText =
    "width:100%;height:100%;display:flex;align-items:stretch;justify-content:center;transform:rotate(180deg);transform-origin:center center;";
  topRotated.appendChild(
    createTentCardHalfContent(
      tableNumber,
      topFamily,
      topBrandingOnly,
      cardIndex,
      cardTotal,
      EXPORT_W_PX,
      HALF_H_PX,
      "bottom"
    )
  );
  topHalf.appendChild(topRotated);

  const bottomHalf = document.createElement("div");
  bottomHalf.style.cssText = `position:absolute;bottom:0;left:0;width:100%;height:${HALF_H_PX}px;overflow:hidden;box-sizing:border-box;display:flex;align-items:stretch;justify-content:center;`;
  bottomHalf.appendChild(
    createTentCardHalfContent(
      tableNumber,
      bottomFamily,
      false,
      cardIndex,
      cardTotal,
      EXPORT_W_PX,
      HALF_H_PX,
      "top"
    )
  );

  el.append(topHalf, bottomHalf);

  if (showFoldGuides) {
    const foldLine = document.createElement("div");
    foldLine.style.cssText =
      "position:absolute;top:50%;left:7%;right:14%;height:0;border-top:1px dashed rgba(156,163,175,0.55);pointer-events:none;transform:translateY(-0.5px);";

    const foldLabel = document.createElement("span");
    foldLabel.textContent = "↕ falzen";
    foldLabel.style.cssText = `position:absolute;top:50%;right:3.5%;transform:translateY(-50%);font-size:9px;color:rgba(156,163,175,0.7);font-family:'DM Sans',system-ui,sans-serif;pointer-events:none;letter-spacing:0.04em;user-select:none`;

    el.append(foldLine, foldLabel);
  }

  if (showCropMarks) {
    appendCropMarks(el, EXPORT_W_PX, EXPORT_H_PX);
  }

  return el;
}

function createRenderContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;pointer-events:none;z-index:-1";
  document.body.appendChild(container);
  return container;
}

async function renderTentCardPng(
  card: TentCardData,
  container: HTMLDivElement,
  options: TentCardExportOptions
): Promise<string> {
  const { toPng } = await import("html-to-image");
  const cardEl = createTentCardElement(card, options);
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

async function renderTentCardJpeg(
  card: TentCardData,
  container: HTMLDivElement,
  options: TentCardExportOptions
): Promise<string> {
  const { toJpeg } = await import("html-to-image");
  const cardEl = createTentCardElement(card, options);
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

export async function downloadTentCardsPdf(
  tables: AssignedTable[],
  filename = "cabisino-tischaufsteller.pdf",
  options: TentCardExportOptions = {}
): Promise<void> {
  const cards = collectTentCards(tables);
  if (cards.length === 0) {
    throw new Error("Keine belegten Tische zum Exportieren.");
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

      const dataUrl = await renderTentCardPng(cards[i], container, options);
      doc.addImage(dataUrl, "PNG", 0, 0, CARD_W_MM, CARD_H_MM);
    }

    doc.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

export async function downloadTentCardsZip(
  tables: AssignedTable[],
  filename = "cabisino-tischaufsteller.zip",
  options: TentCardExportOptions = {}
): Promise<void> {
  const cards = collectTentCards(tables);
  if (cards.length === 0) {
    throw new Error("Keine belegten Tische zum Exportieren.");
  }

  await document.fonts.ready;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const container = createRenderContainer();

  try {
    for (const card of cards) {
      const dataUrl = await renderTentCardJpeg(card, container, options);
      const base64 = dataUrl.split(",")[1];
      if (!base64) continue;
      zip.file(tentCardZipFilename(card), base64, { base64: true });
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
