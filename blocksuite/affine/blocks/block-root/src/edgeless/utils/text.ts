import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import type {
  ConnectorElementModel,
  GroupElementModel,
} from '@blocksuite/affine-model';
import { ShapeElementModel } from '@blocksuite/affine-model';
import type { BlockComponent } from '@blocksuite/block-std';
import { GfxControllerIdentifier } from '@blocksuite/block-std/gfx';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { IVec } from '@blocksuite/global/gfx';
import { Bound } from '@blocksuite/global/gfx';
import * as Y from 'yjs';

import { EdgelessConnectorLabelEditor } from '../components/text/edgeless-connector-label-editor.js';
import { EdgelessGroupTitleEditor } from '../components/text/edgeless-group-title-editor.js';
import { EdgelessShapeTextEditor } from '../components/text/edgeless-shape-text-editor.js';

export function mountShapeTextEditor(
  shapeElement: ShapeElementModel,
  edgeless: BlockComponent
) {
  const mountElm = edgeless.querySelector('.edgeless-mount-point');
  if (!mountElm) {
    throw new BlockSuiteError(
      ErrorCode.ValueNotExists,
      "edgeless block's mount point does not exist"
    );
  }

  const gfx = edgeless.std.get(GfxControllerIdentifier);
  const crud = edgeless.std.get(EdgelessCRUDIdentifier);

  const updatedElement = crud.getElementById(shapeElement.id);

  if (!(updatedElement instanceof ShapeElementModel)) {
    console.error('Cannot mount text editor on a non-shape element');
    return;
  }

  gfx.tool.setTool('default');
  gfx.selection.set({
    elements: [shapeElement.id],
    editing: true,
  });

  if (!shapeElement.text) {
    const text = new Y.Text();
    edgeless.std
      .get(EdgelessCRUDIdentifier)
      .updateElement(shapeElement.id, { text });
  }

  const shapeEditor = new EdgelessShapeTextEditor();
  shapeEditor.element = updatedElement;
  shapeEditor.edgeless = edgeless;
  shapeEditor.mountEditor = mountShapeTextEditor;

  mountElm.append(shapeEditor);
}

export function mountGroupTitleEditor(
  group: GroupElementModel,
  edgeless: BlockComponent
) {
  const mountElm = edgeless.querySelector('.edgeless-mount-point');
  if (!mountElm) {
    throw new BlockSuiteError(
      ErrorCode.ValueNotExists,
      "edgeless block's mount point does not exist"
    );
  }

  const gfx = edgeless.std.get(GfxControllerIdentifier);

  gfx.tool.setTool('default');
  gfx.selection.set({
    elements: [group.id],
    editing: true,
  });

  const groupEditor = new EdgelessGroupTitleEditor();
  groupEditor.group = group;
  groupEditor.edgeless = edgeless;

  mountElm.append(groupEditor);
}

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

  gfx.tool.setTool('default');
  gfx.selection.set({
    elements: [connector.id],
    editing: true,
  });

  if (!connector.text) {
    const text = new Y.Text();
    const labelOffset = connector.labelOffset;
    let labelXYWH = connector.labelXYWH ?? [0, 0, 16, 16];

    if (point) {
      const center = connector.getNearestPoint(point);
      const distance = connector.getOffsetDistanceByPoint(center as IVec);
      const bounds = Bound.fromXYWH(labelXYWH);
      bounds.center = center;
      labelOffset.distance = distance;
      labelXYWH = bounds.toXYWH();
    }

    edgeless.std.get(EdgelessCRUDIdentifier).updateElement(connector.id, {
      text,
      labelXYWH,
      labelOffset: { ...labelOffset },
    });
  }

  const editor = new EdgelessConnectorLabelEditor();
  editor.connector = connector;
  editor.edgeless = edgeless;

  mountElm.append(editor);
  editor.updateComplete
    .then(() => {
      editor.inlineEditor?.focusEnd();
    })
    .catch(console.error);
}
