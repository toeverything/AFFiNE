import type { SurfaceBlockProps } from '@blocksuite/std/gfx';
import {
  SURFACE_TEXT_UNIQ_IDENTIFIER,
  SURFACE_YMAP_UNIQ_IDENTIFIER,
} from '@blocksuite/std/gfx';
import type {
  FromSnapshotPayload,
  SnapshotNode,
  ToSnapshotPayload,
} from '@blocksuite/store';
import { BaseBlockTransformer } from '@blocksuite/store';
import * as Y from 'yjs';

export class SurfaceBlockTransformer extends BaseBlockTransformer<SurfaceBlockProps> {
  private _elementToJSON(element: Y.Map<unknown>) {
    const value: Record<string, unknown> = {};
    element.forEach((_value, _key) => {
      value[_key] = this._toJSON(_value);
    });

    return value;
  }

  private _fromJSON(value: unknown): unknown {
    if (value instanceof Object) {
      if (Reflect.has(value, SURFACE_TEXT_UNIQ_IDENTIFIER)) {
        const yText = new Y.Text();
        yText.applyDelta(Reflect.get(value, 'delta'));
        return yText;
      } else if (Reflect.has(value, SURFACE_YMAP_UNIQ_IDENTIFIER)) {
        const yMap = new Y.Map();
        const json = Reflect.get(value, 'json') as Record<string, unknown>;
        Object.entries(json).forEach(([key, value]) => {
          yMap.set(key, value);
        });
        return yMap;
      }
    }
    return value;
  }

  private _toJSON(value: unknown): unknown {
    if (value instanceof Y.Text) {
      return {
        [SURFACE_TEXT_UNIQ_IDENTIFIER]: true,
        delta: value.toDelta(),
      };
    } else if (value instanceof Y.Map) {
      return {
        [SURFACE_YMAP_UNIQ_IDENTIFIER]: true,
        json: value.toJSON(),
      };
    }
    return value;
  }

  elementFromJSON(element: Record<string, unknown>) {
    const yMap = new Y.Map();
    Object.entries(element).forEach(([key, value]) => {
      yMap.set(key, this._fromJSON(value));
    });

    return yMap;
  }

  override async fromSnapshot(
    payload: FromSnapshotPayload
  ): Promise<SnapshotNode<SurfaceBlockProps>> {
    const snapshotRet = await super.fromSnapshot(payload);
    const elementsJSON = snapshotRet.props.elements as unknown as Record<
      string,
      unknown
    >;
    const yMap = new Y.Map<Y.Map<unknown>>();

    Object.entries(elementsJSON).forEach(([key, value]) => {
      const element = this.elementFromJSON(value as Record<string, unknown>);

      yMap.set(key, element);
    });

    const elements = this._internal.Boxed(yMap);

    snapshotRet.props = {
      elements,
    };

    return snapshotRet;
  }

  override toSnapshot(payload: ToSnapshotPayload<SurfaceBlockProps>) {
    const snapshot = super.toSnapshot(payload);
    const elementsValue = payload.model.props.elements.getValue();
    const value: Record<string, unknown> = {};
    /**
     * When the selectedElements is defined, only the selected elements will be serialized.
     */
    const selectedElements = this.transformerConfigs.get(
      'selectedElements'
    ) as Set<string>;

    if (elementsValue) {
      elementsValue.forEach((element, key) => {
        if (selectedElements?.has(key) || !selectedElements) {
          value[key] = this._elementToJSON(element as Y.Map<unknown>);
        }
      });
    }
    snapshot.props = {
      elements: value,
    };

    return snapshot;
  }
}
