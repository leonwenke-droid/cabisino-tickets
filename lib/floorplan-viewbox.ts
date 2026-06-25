/** Visible crop of the floor plan SVG (table coordinates unchanged). */
export const FLOORPLAN_VIEWBOX = { x: 460, y: 360, w: 1340, h: 475 } as const;

export function floorplanViewBoxAttr(): string {
  const { x, y, w, h } = FLOORPLAN_VIEWBOX;
  return `${x} ${y} ${w} ${h}`;
}

export function floorplanPointToPercent(tx: number, ty: number): {
  left: number;
  top: number;
} {
  const { x, y, w, h } = FLOORPLAN_VIEWBOX;
  return {
    left: ((tx - x) / w) * 100,
    top: ((ty - y) / h) * 100,
  };
}
