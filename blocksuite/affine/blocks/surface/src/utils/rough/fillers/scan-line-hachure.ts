import type { ResolvedOptions } from '../core.js';
import type { Line, Point } from '../geometry.js';
import { rotateLines, rotatePoints } from '../geometry.js';

interface EdgeEntry {
  ymin: number;
  ymax: number;
  x: number;
  islope: number;
}

interface ActiveEdgeEntry {
  s: number;
  edge: EdgeEntry;
}

export function polygonHachureLines(
  polygonList: Point[][],
  o: ResolvedOptions
): Line[] {
  const angle = o.hachureAngle + 90;
  let gap = o.hachureGap;
  if (gap < 0) {
    gap = o.strokeWidth * 4;
  }
  gap = Math.max(gap, 0.1);

  const rotationCenter: Point = [0, 0];
  if (angle) {
    for (const polygon of polygonList) {
      rotatePoints(polygon, rotationCenter, angle);
    }
  }
  const lines = straightHachureLines(polygonList, gap);
  if (angle) {
    for (const polygon of polygonList) {
      rotatePoints(polygon, rotationCenter, -angle);
    }
    rotateLines(lines, rotationCenter, -angle);
  }
  return lines;
}

function straightHachureLines(polygonList: Point[][], gap: number): Line[] {
  const vertexArray: Point[][] = [];
  for (const polygon of polygonList) {
    const vertices = [...polygon];
    if (vertices[0].join(',') !== vertices[vertices.length - 1].join(',')) {
      vertices.push([vertices[0][0], vertices[0][1]]);
    }
    if (vertices.length > 2) {
      vertexArray.push(vertices);
    }
  }

  const lines: Line[] = [];
  gap = Math.max(gap, 0.1);

  // Create sorted edges table
  const edges: EdgeEntry[] = [];

  for (const vertices of vertexArray) {
    for (let i = 0; i < vertices.length - 1; i++) {
      const p1 = vertices[i];
      const p2 = vertices[i + 1];
      if (p1[1] !== p2[1]) {
        const ymin = Math.min(p1[1], p2[1]);
        edges.push({
          ymin,
          ymax: Math.max(p1[1], p2[1]),
          x: ymin === p1[1] ? p1[0] : p2[0],
          islope: (p2[0] - p1[0]) / (p2[1] - p1[1]),
        });
      }
    }
  }

  edges.sort((e1, e2) => {
    if (e1.ymin < e2.ymin) {
      return -1;
    }
    if (e1.ymin > e2.ymin) {
      return 1;
    }
    if (e1.x < e2.x) {
      return -1;
    }
    if (e1.x > e2.x) {
      return 1;
    }
    if (e1.ymax === e2.ymax) {
      return 0;
    }
    return (e1.ymax - e2.ymax) / Math.abs(e1.ymax - e2.ymax);
  });
  if (!edges.length) {
    return lines;
  }

  // Start scanning
  let activeEdges: ActiveEdgeEntry[] = [];
  let y = edges[0].ymin;
  while (activeEdges.length || edges.length) {
    if (edges.length) {
      let ix = -1;
      for (let i = 0; i < edges.length; i++) {
        if (edges[i].ymin > y) {
          break;
        }
        ix = i;
      }
      const removed = edges.splice(0, ix + 1);
      removed.forEach(edge => {
        activeEdges.push({ s: y, edge });
      });
    }
    activeEdges = activeEdges.filter(ae => {
      if (ae.edge.ymax <= y) {
        return false;
      }
      return true;
    });
    activeEdges.sort((ae1, ae2) => {
      if (ae1.edge.x === ae2.edge.x) {
        return 0;
      }
      return (ae1.edge.x - ae2.edge.x) / Math.abs(ae1.edge.x - ae2.edge.x);
    });

    // fill between the edges
    if (activeEdges.length > 1) {
      for (let i = 0; i < activeEdges.length; i = i + 2) {
        const nexti = i + 1;
        if (nexti >= activeEdges.length) {
          break;
        }
        const ce = activeEdges[i].edge;
        const ne = activeEdges[nexti].edge;
        lines.push([
          [Math.round(ce.x), y],
          [Math.round(ne.x), y],
        ]);
      }
    }

    y += gap;
    activeEdges.forEach(ae => {
      ae.edge.x = ae.edge.x + gap * ae.edge.islope;
    });
  }
  return lines;
}
