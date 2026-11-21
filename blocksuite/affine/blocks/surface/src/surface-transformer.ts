import type { SurfaceBlockProps } from '@blocksuite/std/gfx';
import {
  surfaceElementFromJSON,
  surfaceElementsFromJSON,
  surfaceElementsToJSON,
} from '@blocksuite/std/gfx';
import type {
  FromSnapshotPayload,
  SnapshotNode,
  ToSnapshotPayload,
} from '@blocksuite/store';
import { BaseBlockTransformer } from '@blocksuite/store';

export class SurfaceBlockTransformer extends BaseBlockTransformer<SurfaceBlockProps> {
  elementFromJSON(element: Record<string, unknown>) {
    return surfaceElementFromJSON(element);
  }

  override async fromSnapshot(
    payload: FromSnapshotPayload
  ): Promise<SnapshotNode<SurfaceBlockProps>> {
    const snapshotRet = await super.fromSnapshot(payload);
    const elementsJSON = snapshotRet.props.elements as unknown as Record<
      string,
      unknown
    >;
    const elements = this._internal.Boxed(
      surfaceElementsFromJSON(elementsJSON)
    );

    snapshotRet.props = {
      elements,
    };

    return snapshotRet;
  }

  override toSnapshot(payload: ToSnapshotPayload<SurfaceBlockProps>) {
    const snapshot = super.toSnapshot(payload);
    const elementsValue = payload.model.props.elements.getValue();
    /**
     * When the selectedElements is defined, only the selected elements will be serialized.
     */
    const selectedElements = this.transformerConfigs.get(
      'selectedElements'
    ) as Set<string>;

    snapshot.props = {
      elements: surfaceElementsToJSON(elementsValue, selectedElements),
    };

    return snapshot;
  }
}
