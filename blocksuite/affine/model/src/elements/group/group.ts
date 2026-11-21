import type { IVec, PointLocation } from '@blocksuite/global/gfx';
import { Bound, linePolygonIntersects } from '@blocksuite/global/gfx';
import type {
  BaseElementProps,
  GfxModel,
  SerializedElement,
  SurfaceMap,
  SurfaceText,
} from '@blocksuite/std/gfx';
import {
  canSafeAddToContainer,
  createSurfaceMap,
  createSurfaceText,
  field,
  GfxGroupLikeElementModel,
  isSurfaceMap,
  local,
  observe,
} from '@blocksuite/std/gfx';

type GroupElementProps = BaseElementProps & {
  children: SurfaceMap<boolean>;
  title: SurfaceText;
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
      props.title = createSurfaceText(props.title);
    }

    if (props.children && !isSurfaceMap(props.children)) {
      const children = createSurfaceMap<boolean>();

      Object.keys(props.children).forEach(key => {
        children.set(key as string, true);
      });

      props.children = children;
    }

    return props as GroupElementProps;
  }

  override addChild(element: GfxModel) {
    this.addChildren([element]);
  }

  addChildren(elements: GfxModel[]) {
    elements = [...new Set(elements)].filter(element =>
      canSafeAddToContainer(this, element)
    );
    if (elements.length === 0) {
      return;
    }

    this.surface.store.transact(() => {
      elements.forEach(element => {
        this.children.set(element.id, true);
      });
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
    this.removeChildren([element]);
  }

  removeChildren(elements: GfxModel[]) {
    if (!this.children) {
      return;
    }
    const childIds = [...new Set(elements.map(element => element.id))];
    if (childIds.length === 0) {
      return;
    }

    this.surface.store.transact(() => {
      childIds.forEach(childId => {
        this.children.delete(childId);
      });
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
  accessor children: SurfaceMap<boolean> = createSurfaceMap<boolean>();

  @local()
  accessor showTitle: boolean = true;

  @field()
  accessor title: SurfaceText = createSurfaceText();
}
