import { jsPDF } from "jspdf";
import type { AssignedTable } from "@/lib/assign-seats";
import { SEATS_PER_TABLE } from "@/lib/assign-seats";

type SeatLine = {
  text: string;
  kind: "main" | "guest" | "empty";
};

const COLORS = {
  header: "#1a1a1a",
  guest: "#555555",
  empty: "#aaaaaa",
  border: "#cccccc",
  gold: "#c9a227",
  white: "#ffffff",
};

const PAGE = {
  cols: 3,
  rows: 2,
  perPage: 6,
  margin: 14,
  gapX: 7,
  gapY: 9,
  footerY: 200,
};

function buildSeatLines(table: AssignedTable): SeatLine[] {
  const lines: SeatLine[] = [];

  for (const entry of table.entries) {
    lines.push({
      text: `${entry.vorname} ${entry.nachname}`,
      kind: "main",
    });
    const guestCount = entry.total_persons - 1;
    for (let i = 0; i < guestCount; i++) {
      const name = entry.guests?.[i] ?? `Begleitung ${i + 1}`;
      lines.push({ text: `  – ${name}`, kind: "guest" });
    }
  }

  const emptyCount = Math.max(0, SEATS_PER_TABLE - table.seatsUsed);
  for (let i = 0; i < emptyCount; i++) {
    lines.push({ text: "  – (frei)", kind: "empty" });
  }

  return lines;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setDraw(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setText(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function drawFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = PAGE.margin;

  setText(doc, COLORS.guest);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Kabisino 2026 · Tischplan", pageW / 2, PAGE.footerY, { align: "center" });
  doc.text(`${pageNum} / ${totalPages}`, pageW - margin, PAGE.footerY, { align: "right" });
}

function drawTableCard(
  doc: jsPDF,
  tableIndex: number,
  table: AssignedTable,
  x: number,
  y: number,
  w: number,
  h: number
) {
  setDraw(doc, COLORS.border);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, "S");

  const padX = 5;
  const innerX = x + padX;
  const innerW = w - padX * 2;
  let cursorY = y + 9;

  setText(doc, COLORS.header);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Tisch ${tableIndex + 1}`, x + w / 2, cursorY, { align: "center" });

  cursorY += 3;
  setDraw(doc, COLORS.gold);
  doc.setLineWidth(0.4);
  doc.line(innerX, cursorY, innerX + innerW, cursorY);

  cursorY += 5;
  doc.setFontSize(10);

  for (const line of buildSeatLines(table)) {
    if (line.kind === "main") {
      setText(doc, COLORS.header);
      doc.setFont("helvetica", "normal");
    } else if (line.kind === "guest") {
      setText(doc, COLORS.guest);
      doc.setFont("helvetica", "normal");
    } else {
      setText(doc, COLORS.empty);
      doc.setFont("helvetica", "normal");
    }

    const wrapped = doc.splitTextToSize(line.text, innerW) as string[];
    for (const segment of wrapped) {
      if (cursorY > y + h - 4) break;
      doc.text(segment, innerX, cursorY);
      cursorY += 4.5;
    }
  }
}

export function downloadSeatingPlanPdf(tables: AssignedTable[], filename = "kabisino-tischplan.pdf") {
  if (tables.length === 0) {
    throw new Error("Keine Tische zum Exportieren.");
  }

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = Math.ceil(tables.length / PAGE.perPage);

  const usableW = pageW - PAGE.margin * 2;
  const usableH = PAGE.footerY - PAGE.margin - 6;
  const cardW = (usableW - (PAGE.cols - 1) * PAGE.gapX) / PAGE.cols;
  const cardH = (usableH - (PAGE.rows - 1) * PAGE.gapY) / PAGE.rows;

  let pageNum = 1;

  tables.forEach((table, index) => {
    const slotOnPage = index % PAGE.perPage;
    if (slotOnPage === 0 && index > 0) {
      doc.addPage();
      pageNum++;
    }

    if (slotOnPage === 0) {
      setFill(doc, COLORS.white);
      doc.rect(0, 0, pageW, pageH, "F");
    }

    const col = slotOnPage % PAGE.cols;
    const row = Math.floor(slotOnPage / PAGE.cols);
    const x = PAGE.margin + col * (cardW + PAGE.gapX);
    const y = PAGE.margin + row * (cardH + PAGE.gapY);

    drawTableCard(doc, index, table, x, y, cardW, cardH);

    const isLastOnPage =
      slotOnPage === PAGE.perPage - 1 || index === tables.length - 1;
    if (isLastOnPage) {
      drawFooter(doc, pageNum, totalPages);
    }
  });

  doc.save(filename);
}
