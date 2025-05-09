import {
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
} from '@blocksuite/affine-block-surface';
import type { BlockStdScope } from '@blocksuite/std';

/**
 * move connectors from origin to target
 * @param originId origin element id
 * @param targetId target element id
 * @param service edgeless root service
 */
export function moveConnectors(
  originId: string,
  targetId: string,
  std: BlockStdScope
) {
  const model = getSurfaceBlock(std.store);
  if (!model) return;
  const connectors = model.getConnectors(originId);
  const crud = std.get(EdgelessCRUDIdentifier);
  connectors.forEach(connector => {
    if (connector.source.id === originId) {
      crud.updateElement(connector.id, {
        source: { ...connector.source, id: targetId },
      });
    }
    if (connector.target.id === originId) {
      crud.updateElement(connector.id, {
        target: { ...connector.target, id: targetId },
      });
    }
  });
}
