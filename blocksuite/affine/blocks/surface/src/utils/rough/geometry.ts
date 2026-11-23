export type Point = [number, number];
export type Line = [Point, Point];

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rotatePoints(
  points: Point[],
  center: Point,
  degrees: number
): void {
  if (points && points.length) {
    const [cx, cy] = center;
    const angle = (Math.PI / 180) * degrees;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    points.forEach(p => {
      const [x, y] = p;
      p[0] = (x - cx) * cos - (y - cy) * sin + cx;
      p[1] = (x - cx) * sin + (y - cy) * cos + cy;
    });
  }
}

export function rotateLines(
  lines: Line[],
  center: Point,
  degrees: number
): void {
  const points: Point[] = [];
  lines.forEach(line => points.push(...line));
  rotatePoints(points, center, degrees);
}

export function lineLength(line: Line): number {
  const p1 = line[0];
  const p2 = line[1];
  return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
}
