import type { IVec, PointLocation } from '@blocksuite/global/gfx';
import { Bound, linePolygonIntersects } from '@blocksuite/global/gfx';
import type {
  BaseElementProps,
  GfxModel,
  SerializedElement,
} from '@blocksuite/std/gfx';
import {
  canSafeAddToContainer,
  field,
  GfxGroupLikeElementModel,
  local,
  observe,
} from '@blocksuite/std/gfx';
import * as Y from 'yjs';

type GroupElementProps = BaseElementProps & {
  children: Y.Map<boolean>;
  title: Y.Text;
};

export type SerializedGroupElement = SerializedElement & {
  title: string;
  children: Record<string, boolean>;
};

export class GroupElementModel extends GfxGroupLikeElementModel<GroupElementProps> {
  get rotate() {
    return 0;
  }

  set rotate(_: number) {}

  get type() {
    return 'group';
  }

  static propsToY(props: Record<string, unknown>) {
    if (typeof props.title === 'string') {
      props.title = new Y.Text(props.title as string);
    }

    if (props.children && !(props.children instanceof Y.Map)) {
      const children = new Y.Map() as Y.Map<boolean>;

      Object.keys(props.children).forEach(key => {
        children.set(key as string, true);
      });

      props.children = children;
    }

    return props as GroupElementProps;
  }

  override addChild(element: GfxModel) {
    if (!canSafeAddToContainer(this, element)) {
      return;
    }

    this.surface.store.transact(() => {
      this.children.set(element.id, true);
    });
  }

  override containsBound(bound: Bound): boolean {
    return bound.contains(Bound.deserialize(this.xywh));
  }

  override getLineIntersections(
    start: IVec,
    end: IVec
  ): PointLocation[] | null {
    const bound = Bound.deserialize(this.xywh);
    return linePolygonIntersects(start, end, bound.points);
  }

  removeChild(element: GfxModel) {
    if (!this.children) {
      return;
    }
    this.surface.store.transact(() => {
      this.children.delete(element.id);
    });
  }

  override serialize() {
    const result = super.serialize();
    return result as SerializedGroupElement;
  }

  override lock(): void {
    super.lock();
    this.showTitle = false;
  }

  override unlock(): void {
    super.unlock();
    this.showTitle = true;
  }

  @observe(
    // use `GroupElementModel` type in decorator will cause playwright error
    (_, instance: GfxGroupLikeElementModel<GroupElementProps>, transaction) => {
      if (instance.children.doc) {
        instance.setChildIds(
          Array.from(instance.children.keys()),
          transaction?.local ?? false
        );
      }
    }
  )
  @field()
  accessor children: Y.Map<boolean> = new Y.Map<boolean>();

  @local()
  accessor showTitle: boolean = true;

  @field()
  accessor title: Y.Text = new Y.Text();
}
