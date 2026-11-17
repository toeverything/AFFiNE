/**
 * 999.11 follow-up: touch caret placement inside a linked note.
 *
 * A linked note's text is an editable region nested inside a
 * `contenteditable="false"` island inside the page's own editable note. On
 * iOS a tap there is delivered normally (touchend / mousedown / mouseup /
 * click, recorded on device with nothing `preventDefault`ed) yet WebKit does
 * NOT move the caret -- it took many taps, or a scroll, to get one. Placing
 * the caret programmatically works and sticks (also recorded), so a still
 * touch tap that left the caret where it was places it at the tap point.
 */
const TAP_SLOP_PX = 10;

const nodeIds = new WeakMap<Node, number>();
let nextNodeId = 1;
const nodeId = (node: Node) => {
  let id = nodeIds.get(node);
  if (id === undefined) {
    id = nextNodeId++;
    nodeIds.set(node, id);
  }
  return id;
};

/** Comparable identity of the current caret (anchor node + offset). */
export function caretKey(selection: Selection | null): string {
  if (!selection || !selection.rangeCount || !selection.anchorNode)
    return 'none';
  return `${nodeId(selection.anchorNode)}:${selection.anchorOffset}`;
}

export function shouldPlaceCaretAfterTap(
  down: { x: number; y: number; caret: string },
  up: { x: number; y: number },
  caretNow: string
): boolean {
  if (
    Math.abs(up.x - down.x) > TAP_SLOP_PX ||
    Math.abs(up.y - down.y) > TAP_SLOP_PX
  )
    return false;
  return caretNow === down.caret;
}
