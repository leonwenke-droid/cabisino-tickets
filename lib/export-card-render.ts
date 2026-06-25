import { jsPDF } from "jspdf";

/** Print resolution for card raster exports (10×15 cm). */
export const EXPORT_DPI = 600;
export const CARD_W_MM = 100;
export const CARD_H_MM = 150;
export const EXPORT_W_PX = Math.round((CARD_W_MM / 25.4) * EXPORT_DPI);
export const EXPORT_H_PX = Math.round((CARD_H_MM / 25.4) * EXPORT_DPI);
export const EXPORT_HALF_H_PX = EXPORT_H_PX / 2;

/** Legacy 300 DPI width — used to scale fixed layout constants. */
export const LEGACY_EXPORT_W_PX = 1181;

export const CARD_GOLD = "#C9A227";
export const CARD_CREAM = "#f0ead6";
export const CARD_CREAM_MUTED = "#c8bfa8";
/** High-contrast name text for legibility on dark backgrounds. */
export const CARD_NAME_BRIGHT = "#faf6e8";
export const CARD_BG = "#0a0a0f";
export const BRAND_FOOTER_HTML = `Cabisino 2026 <span style="opacity:0.7">♠</span>`;

export const SHARP_TEXT_STYLE =
  "-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:geometricPrecision";

export function scalePx(value: number, widthPx: number = EXPORT_W_PX): number {
  return Math.round(value * (widthPx / LEGACY_EXPORT_W_PX));
}

export type CardNameTypography = {
  mainSize: number;
  guestSize: number;
  nameLineGap: number;
};

export function computeCardNameTypography(
  lineCount: number,
  widthPx: number,
  density: "full" | "half"
): CardNameTypography {
  const baseMain =
    density === "full"
      ? lineCount <= 2
        ? 36
        : lineCount <= 4
          ? 30
          : lineCount <= 6
            ? 26
            : 22
      : lineCount <= 2
        ? 22
        : lineCount <= 4
          ? 18
          : lineCount <= 6
            ? 15
            : 13;

  const mainMultiplier = density === "full" ? 1.3 * 1.12 : 1.25 * 1.12;
  const guestBase = density === "full" ? baseMain - 6 : baseMain - 4;
  const guestMultiplier = density === "full" ? 1.2 * 1.45 : 1.15 * 1.45;

  const mainSize = scalePx(Math.round(baseMain * mainMultiplier), widthPx);
  const guestSize = scalePx(Math.round(guestBase * guestMultiplier), widthPx);
  const nameLineGap = Math.round(mainSize * 0.3);

  return { mainSize, guestSize, nameLineGap };
}

export function namesPanelStyle(widthPx: number): string {
  return [
    `background:rgba(255,255,255,0.05)`,
    `border-radius:${scalePx(12, widthPx)}px`,
    `padding:${scalePx(16, widthPx)}px ${scalePx(20, widthPx)}px`,
    `box-sizing:border-box`,
  ].join(";");
}

export function mainNameStyle(mainSize: number): string {
  return `margin:0;font-size:${mainSize}px;font-weight:700;color:${CARD_NAME_BRIGHT};line-height:1.18;word-break:break-word;${SHARP_TEXT_STYLE}`;
}

export function guestNameStyle(guestSize: number): string {
  return `margin:0;font-size:${guestSize}px;font-weight:500;color:${CARD_NAME_BRIGHT};opacity:1;line-height:1.22;word-break:break-word;${SHARP_TEXT_STYLE}`;
}

export function appendFamilyNames(
  container: HTMLDivElement,
  vorname: string,
  nachname: string,
  guestNames: string[],
  typography: CardNameTypography
): void {
  const main = document.createElement("p");
  main.textContent = `${vorname} ${nachname}`;
  main.style.cssText = mainNameStyle(typography.mainSize);
  container.append(main);

  for (const guest of guestNames) {
    const guestEl = document.createElement("p");
    guestEl.textContent = guest;
    guestEl.style.cssText = guestNameStyle(typography.guestSize);
    container.append(guestEl);
  }
}

export function createOrnamentalDivider(
  widthPercent: number,
  accent: string,
  accentSizePx: number,
  lineHeightPx = scalePx(2)
): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = `display:flex;align-items:center;justify-content:center;width:${widthPercent}%;margin:0 auto;gap:${Math.round(accentSizePx * 0.45)}px;${SHARP_TEXT_STYLE}`;

  const lineStyle = `flex:1;height:${lineHeightPx}px;background:linear-gradient(90deg,transparent,${CARD_GOLD},transparent)`;

  const left = document.createElement("div");
  left.style.cssText = lineStyle;

  const center = document.createElement("span");
  center.textContent = accent;
  center.style.cssText = `font-size:${accentSizePx}px;color:${CARD_GOLD};opacity:0.55;line-height:1;user-select:none;${SHARP_TEXT_STYLE}`;

  const right = document.createElement("div");
  right.style.cssText = lineStyle;

  wrap.append(left, center, right);
  return wrap;
}

export function createCardRenderContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:-1";
  document.body.appendChild(container);
  return container;
}

export async function ensureExportFontsReady(): Promise<void> {
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('400 32px "DM Sans"'),
    document.fonts.load('500 32px "DM Sans"'),
    document.fonts.load('700 32px "Playfair Display"'),
    document.fonts.load('700 96px "Playfair Display"'),
  ]);
}

const CAPTURE_STYLE = {
  transform: "scale(1)",
  transformOrigin: "top left",
} as const;

export async function captureNodePng(
  node: HTMLElement,
  widthPx: number,
  heightPx: number
): Promise<string> {
  const { toPng } = await import("html-to-image");
  return toPng(node, {
    width: widthPx,
    height: heightPx,
    pixelRatio: 1,
    cacheBust: true,
    backgroundColor: CARD_BG,
    style: CAPTURE_STYLE,
  });
}

export async function captureNodeJpeg(
  node: HTMLElement,
  widthPx: number,
  heightPx: number,
  quality = 0.96
): Promise<string> {
  const { toJpeg } = await import("html-to-image");
  return toJpeg(node, {
    width: widthPx,
    height: heightPx,
    pixelRatio: 1,
    quality,
    cacheBust: true,
    backgroundColor: CARD_BG,
    style: CAPTURE_STYLE,
  });
}

export function createCardPdfDocument(): jsPDF {
  return new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [CARD_W_MM, CARD_H_MM],
    compress: false,
  });
}
