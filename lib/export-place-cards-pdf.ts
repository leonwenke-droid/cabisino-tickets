import type { AssignedTable } from "@/lib/assign-seats";
import { getZollhausTableNumber } from "@/lib/zollhaus-tables";
import {
  BRAND_FOOTER_HTML,
  CARD_BG,
  CARD_CREAM_MUTED,
  CARD_GOLD,
  CARD_H_MM,
  CARD_W_MM,
  EXPORT_H_PX,
  EXPORT_W_PX,
  SHARP_TEXT_STYLE,
  appendFamilyNames,
  captureNodeJpeg,
  captureNodePng,
  computeCardNameTypography,
  createCardPdfDocument,
  createCardRenderContainer,
  createOrnamentalDivider,
  ensureExportFontsReady,
  namesPanelStyle,
  scalePx,
} from "@/lib/export-card-render";

export type PlaceCardData = {
  tableNumber: number;
  vorname: string;
  nachname: string;
  guestNames: string[];
};

export function collectPlaceCards(tables: AssignedTable[]): PlaceCardData[] {
  const cards: PlaceCardData[] = [];

  tables.forEach((table, tableIdx) => {
    for (const entry of table.entries) {
      const guestNames: string[] = [];
      const guestCount = entry.total_persons - 1;
      for (let i = 0; i < guestCount; i++) {
        guestNames.push(entry.guests?.[i] ?? `Begleitung ${i + 1}`);
      }
      cards.push({
        tableNumber: getZollhausTableNumber(tableIdx),
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

function createPlaceCardElement(
  card: PlaceCardData,
  widthPx: number,
  heightPx: number
): HTMLDivElement {
  const lineCount = 1 + card.guestNames.length;
  const { mainSize, guestSize, nameLineGap } = computeCardNameTypography(
    lineCount,
    widthPx,
    "full"
  );
  const tableSize = Math.round(
    widthPx * (lineCount <= 4 ? 0.076 : 0.064)
  );
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

  const el = document.createElement("div");
  el.style.cssText = [
    `width:${widthPx}px`,
    `height:${heightPx}px`,
    `box-sizing:border-box`,
    `position:relative`,
    `overflow:hidden`,
    `background:${CARD_BG}`,
    `border:${borderPx}px solid ${CARD_GOLD}`,
    `border-radius:${scalePx(16, widthPx)}px`,
    `display:flex`,
    `flex-direction:column`,
    `align-items:center`,
    `padding:${padTop}px ${padX}px ${padBottom}px`,
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
    span.style.cssText = `position:absolute;${suitPositions[i]};font-size:${suitSize}px;color:${CARD_GOLD};opacity:0.4;user-select:none;line-height:1;${SHARP_TEXT_STYLE}`;
    el.appendChild(span);
  });

  const top = document.createElement("div");
  top.style.cssText = "text-align:center;width:100%;flex-shrink:0";

  const label = document.createElement("p");
  label.textContent = "Tischnummer";
  label.style.cssText = `margin:0 0 ${scalePx(10, widthPx)}px;font-size:${labelSize}px;letter-spacing:0.22em;text-transform:uppercase;color:${CARD_GOLD};font-family:'DM Sans',system-ui,sans-serif;font-weight:500;${SHARP_TEXT_STYLE}`;

  const tableNum = document.createElement("p");
  tableNum.textContent = `Tisch ${card.tableNumber}`;
  tableNum.style.cssText = `margin:0;font-size:${tableSize}px;font-weight:700;color:${CARD_GOLD};line-height:1.05;${SHARP_TEXT_STYLE}`;

  const headerDivider = createOrnamentalDivider(68, "♦", ornamentSize);
  headerDivider.style.marginTop = `${scalePx(16, widthPx)}px`;

  const suitRow = document.createElement("div");
  suitRow.style.cssText = `display:flex;justify-content:center;gap:${Math.round(ornamentSize * 1.1)}px;margin-top:${scalePx(14, widthPx)}px`;
  (["♠", "♥", "♦", "♣"] as const).forEach((suit) => {
    const span = document.createElement("span");
    span.textContent = suit;
    span.style.cssText = `font-size:${ornamentSize}px;color:${CARD_GOLD};opacity:0.22;line-height:1;user-select:none;${SHARP_TEXT_STYLE}`;
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
    namesPanelStyle(widthPx),
    SHARP_TEXT_STYLE,
  ].join(";");

  appendFamilyNames(
    names,
    card.vorname,
    card.nachname,
    card.guestNames,
    { mainSize, guestSize, nameLineGap }
  );

  const bottomDivider = createOrnamentalDivider(62, "♠", ornamentSize);
  bottomDivider.style.marginTop = `${Math.round(nameLineGap * 1.2)}px`;
  names.append(bottomDivider);

  const footer = document.createElement("div");
  footer.style.cssText = "text-align:center;width:100%;flex-shrink:0;margin-top:auto";

  const footerText = document.createElement("p");
  footerText.innerHTML = BRAND_FOOTER_HTML;
  footerText.style.cssText = `margin:0;font-size:${footerSize}px;letter-spacing:0.14em;color:${CARD_CREAM_MUTED};font-family:'DM Sans',system-ui,sans-serif;${SHARP_TEXT_STYLE}`;

  footer.append(footerText);
  el.append(top, names, footer);
  return el;
}

async function renderCardPng(
  card: PlaceCardData,
  container: HTMLDivElement
): Promise<string> {
  const cardEl = createPlaceCardElement(card, EXPORT_W_PX, EXPORT_H_PX);
  container.appendChild(cardEl);

  try {
    return await captureNodePng(cardEl, EXPORT_W_PX, EXPORT_H_PX);
  } finally {
    container.removeChild(cardEl);
  }
}

async function renderCardJpeg(
  card: PlaceCardData,
  container: HTMLDivElement
): Promise<string> {
  const cardEl = createPlaceCardElement(card, EXPORT_W_PX, EXPORT_H_PX);
  container.appendChild(cardEl);

  try {
    return await captureNodeJpeg(cardEl, EXPORT_W_PX, EXPORT_H_PX);
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

  await ensureExportFontsReady();

  const container = createCardRenderContainer();
  const doc = createCardPdfDocument();

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

  await ensureExportFontsReady();

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const container = createCardRenderContainer();

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
