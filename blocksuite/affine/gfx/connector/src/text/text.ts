import {
  DefaultTool,
  EdgelessCRUDIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  type ConnectorElementModel,
  ConnectorLabelOffsetAnchor,
} from '@blocksuite/affine-model';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { IVec } from '@blocksuite/global/gfx';
import { Bound } from '@blocksuite/global/gfx';
import type { BlockComponent } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import * as Y from 'yjs';

import { EdgelessConnectorLabelEditor } from './edgeless-connector-label-editor';

export function mountConnectorLabelEditor(
  connector: ConnectorElementModel,
  edgeless: BlockComponent,
  point?: IVec
) {
  const mountElm = edgeless.querySelector('.edgeless-mount-point');
  if (!mountElm) {
    throw new BlockSuiteError(
      ErrorCode.ValueNotExists,
      "edgeless block's mount point does not exist"
    );
  }

  const gfx = edgeless.std.get(GfxControllerIdentifier);

  gfx.tool.setTool(DefaultTool);
  gfx.selection.set({
    elements: [connector.id],
    editing: true,
  });

  const shouldCenterLabel =
    !connector.labelXYWH ||
    !connector.labelOffset ||
    (connector.text && connector.text.length === 0);

  if (!connector.text || shouldCenterLabel) {
    const text = connector.text ?? new Y.Text();
    const labelOffset = {
      ...(connector.labelOffset ?? {
        distance: 0.5,
        anchor: ConnectorLabelOffsetAnchor.Center,
      }),
      distance: 0.5,
    };
    const defaultSize: [number, number] = [80, 24];
    const center = connector.getPointByOffsetDistance(0.5);
    const labelXYWH: [number, number, number, number] = [
      center[0] - defaultSize[0] / 2,
      center[1] - defaultSize[1] / 2,
      ...defaultSize,
    ];

    connector.labelOffset = { ...labelOffset };
    connector.labelXYWH = labelXYWH;

    edgeless.std.get(EdgelessCRUDIdentifier).updateElement(connector.id, {
      text,
      labelXYWH,
      labelOffset: { ...labelOffset },
    });
  }

  const editor = new EdgelessConnectorLabelEditor();
  editor.connector = connector;

  mountElm.append(editor);
  editor.updateComplete
    .then(() => {
      editor.inlineEditor?.focusEnd();
    })
    .catch(console.error);
}
