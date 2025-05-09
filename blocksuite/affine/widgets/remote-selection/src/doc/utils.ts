import type { DirectiveResult } from 'lit/directive.js';
import { styleMap, type StyleMapDirective } from 'lit/directives/style-map.js';

import type { SelectionRect } from './doc-remote-selection.js';

export function selectionStyle(
  rect: SelectionRect,
  color: string
): DirectiveResult<typeof StyleMapDirective> {
  return styleMap({
    position: 'absolute',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    backgroundColor: rect.transparent ? 'transparent' : color,
    pointerEvent: 'none',
    opacity: '20%',
    borderRadius: '3px',
  });
}

export function cursorStyle(
  rect: SelectionRect,
  color: string
): DirectiveResult<typeof StyleMapDirective> {
  return styleMap({
    position: 'absolute',
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    backgroundColor: color,
    pointerEvent: 'none',
  });
}
