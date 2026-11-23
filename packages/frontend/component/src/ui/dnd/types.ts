import type { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { dropTargetForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';

export type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';

export interface DNDData<
  Draggable extends Record<string, unknown> = Record<string, unknown>,
  DropTarget extends Record<string, unknown> = Record<string, unknown>,
> {
  draggable: Draggable;
  dropTarget: DropTarget;
}

export type ExternalGetDataFeedbackArgs = Parameters<
  NonNullable<Parameters<typeof dropTargetForExternal>[0]['getData']>
>[0];

export type fromExternalData<D extends DNDData> = (
  args: ExternalGetDataFeedbackArgs,
  isDropEvent?: boolean
) => D['draggable'];

export type DraggableGetFeedback = Parameters<
  NonNullable<Parameters<typeof draggable>[0]['getInitialData']>
>[0];

type DraggableGetFeedbackArgs = Parameters<
  NonNullable<Parameters<typeof draggable>[0]['getInitialData']>
>[0];

export function draggableGet<T>(
  get: T
): T extends undefined
  ? undefined
  : T extends DraggableGet<infer I>
    ? (args: DraggableGetFeedback) => I
    : never {
  if (get === undefined) {
    return undefined as any;
  }
  return ((args: DraggableGetFeedback) =>
    typeof get === 'function' ? (get as any)(args) : get) as any;
}

export type DraggableGet<T> = T | ((data: DraggableGetFeedback) => T);

export type toExternalData<D extends DNDData> = (
  args: DraggableGetFeedbackArgs,
  data?: DraggableGet<D['draggable']>
) => {
  [
    Key in
      | 'text/uri-list'
      | 'text/plain'
      | 'text/html'
      | 'Files'
      | (string & {})
  ]?: string;
};
