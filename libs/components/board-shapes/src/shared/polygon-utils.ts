import { intersectLineLine } from '@tldraw/intersect';
import Vec from '@tldraw/vec';

const PI2 = Math.PI * 2;

type Vert = number[];
type Edge = Vert[];
type Polygon = Vert[];

export class PolygonUtils {
    static inward_edge_normal(edge: Edge) {
        // Assuming that polygon vertices are in clockwise order
        const delta = Vec.sub(edge[1], edge[0]);
        const len = Vec.len2(delta);
        return [-delta[0] / len, delta[1] / len];
    }

    static outward_edge_normal(edge: Edge) {
        return Vec.neg(PolygonUtils.inward_edge_normal(edge));
    }

    // If the slope of line v1,v2 greater than the slope of v1,p then p is on the left side of v1,v2 and the return value is > 0.
    // If p is colinear with v1,v2 then return 0, otherwise return a value < 0.

    static left_side = Vec.isLeft;

    static is_reflex_vertex(polygon: Polygon, index: number) {
        const len = polygon.length;
        // Assuming that polygon vertices are in clockwise order
        const v0 = polygon[(index + len - 1) % len];
        const v1 = polygon[index];
        const v2 = polygon[(index + 1) % len];
        if (PolygonUtils.left_side(v0, v2, v1) < 0) return true;
        return false;
    }

    static get_edges(vertices: Vert[]) {
        return vertices.map((vert, i) => [
            vert,
            vertices[(i + 1) % vertices.length],
        ]);
    }

    // based on http://local.wasp.uwa.edu.au/~pbourke/geometry/lineline2d/, A => "line a", B => "line b"
    static edges_intersection([A1, A2]: number[][], [B1, B2]: number[][]) {
        const den =
            (B2[1] - B1[1]) * (A2[0] - A1[0]) -
            (B2[0] - B1[0]) * (A2[1] - A1[1]);

        if (den == 0) return null; // lines are parallel or conincident

        const ua =
            ((B2[0] - B1[0]) * (A1[1] - B1[1]) -
                (B2[1] - B1[1]) * (A1[0] - B1[0])) /
            den;

        const ub =
            ((A2[0] - A1[0]) * (A1[1] - B1[1]) -
                (A2[1] - A1[1]) * (A1[0] - B1[0])) /
            den;

        if (ua < 0 || ub < 0 || ua > 1 || ub > 1) return null;

        return [A1[0] + ua * (A2[0] - A1[0]), A1[1] + ua * (A2[1] - A1[1])];
    }

    static append_arc(
        polygon: number[][],
        center: number[],
        radius: number,
        startVertex: number[],
        endVertex: number[],
        isPaddingBoundary = false
    ) {
        const vertices = [...polygon];
        let startAngle = Math.atan2(
            startVertex[1] - center[1],
            startVertex[0] - center[0]
        );
        let endAngle = Math.atan2(
            endVertex[1] - center[1],
            endVertex[0] - center[0]
        );
        if (startAngle < 0) startAngle += PI2;
        if (endAngle < 0) endAngle += PI2;
        const arcSegmentCount = 5; // An odd number so that one arc vertex will be eactly arcRadius from center.
        const angle =
            startAngle > endAngle
                ? startAngle - endAngle
                : startAngle + PI2 - endAngle;
        const angle5 =
            (isPaddingBoundary ? -angle : PI2 - angle) / arcSegmentCount;

        vertices.push(startVertex);
        for (let i = 1; i < arcSegmentCount; ++i) {
            const angle = startAngle + angle5 * i;
            vertices.push([
                center[0] + Math.cos(angle) * radius,
                center[1] + Math.sin(angle) * radius,
            ]);
        }
        vertices.push(endVertex);

        return vertices;
    }

    static create_offset_edge(edge: Edge, offset: number[]) {
        return edge.map(vert => Vec.add(vert, offset));
    }

    static get_offset_polygon(polygon: Polygon, offset = 0) {
        const edges = PolygonUtils.get_edges(polygon);

        const offsetEdges = edges.map(edge =>
            PolygonUtils.create_offset_edge(
                edge,
                Vec.mul(PolygonUtils.outward_edge_normal(edge), offset)
            )
        );

        const vertices = [];

        for (let i = 0; i < offsetEdges.length; i++) {
            const thisEdge = offsetEdges[i];
            const prevEdge =
                offsetEdges[(i + offsetEdges.length - 1) % offsetEdges.length];
            const vertex = PolygonUtils.edges_intersection(prevEdge, thisEdge);
            if (vertex) vertices.push(vertex);
            else {
                PolygonUtils.append_arc(
                    vertices,
                    edges[i][0],
                    offset,
                    prevEdge[1],
                    thisEdge[0],
                    false
                );
            }
        }

        // var marginPolygon = PolygonUtils.createPolygon(vertices)
        // marginPolygon.offsetEdges = offsetEdges
        return vertices;
    }

    static create_padding_polygon(polygon: number[][][], shapePadding = 0) {
        const offsetEdges = polygon.map(edge =>
            PolygonUtils.create_offset_edge(
                edge,
                PolygonUtils.inward_edge_normal(edge)
            )
        );

        const vertices = [];
        for (let i = 0; i < offsetEdges.length; i++) {
            const thisEdge = offsetEdges[i];
            const prevEdge =
                offsetEdges[(i + offsetEdges.length - 1) % offsetEdges.length];
            const vertex = PolygonUtils.edges_intersection(prevEdge, thisEdge);
            if (vertex) vertices.push(vertex);
            else {
                PolygonUtils.append_arc(
                    vertices,
                    polygon[i][0],
                    shapePadding,
                    prevEdge[1],
                    thisEdge[0],
                    true
                );
            }
        }

        return vertices;
    }
}

export function getOffsetPolygon(points: number[][], offset: number) {
    if (points.length < 3) throw Error('Polygon must have at least 3 points');
    const len = points.length;
    return points
        .map((point, i) => [point, points[(i + 1) % len]])
        .map(([A, B]) => {
            const offsetVector = Vec.mul(
                Vec.per(Vec.uni(Vec.sub(B, A))),
                offset
            );
            return [Vec.add(A, offsetVector), Vec.add(B, offsetVector)];
        })
        .map((edge, i, edges) => {
            const intersection = intersectLineLine(
                edge,
                edges[(i + 1) % edges.length]
            );
            if (intersection === undefined)
                throw Error('Expected an intersection');
            return intersection;
        });
}
