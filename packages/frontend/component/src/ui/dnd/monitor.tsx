import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { monitorForExternal } from '@atlaskit/pragmatic-drag-and-drop/external/adapter';
import type {
  DragLocationHistory,
  ElementDragType,
} from '@atlaskit/pragmatic-drag-and-drop/types';
import { useContext, useEffect, useMemo } from 'react';

import { getAdaptedEventArgs } from './common';
import { DNDContext } from './context';
import type { DNDData, fromExternalData } from './types';

export type MonitorGetFeedback<D extends DNDData = DNDData> = Parameters<
  NonNullable<Parameters<typeof monitorForElements>[0]['canMonitor']>
>[0] & {
  source: {
    data: D['draggable'];
  };
};

type MonitorGet<T, D extends DNDData = DNDData> =
  | T
  | ((data: MonitorGetFeedback<D>) => T);

export type MonitorDragEvent<D extends DNDData = DNDData> = {
  /**
   * Location history for the drag operation
   */
  location: DragLocationHistory;
  /**
   * Data associated with the entity that is being dragged
   */
  source: Exclude<ElementDragType['payload'], 'data'> & {
    data: D['draggable'];
  };
};

export interface MonitorOptions<D extends DNDData = DNDData> {
  canMonitor?: MonitorGet<boolean, D>;
  onDragStart?: (data: MonitorDragEvent<D>) => void;
  onDrag?: (data: MonitorDragEvent<D>) => void;
  onDrop?: (data: MonitorDragEvent<D>) => void;
  onDropTargetChange?: (data: MonitorDragEvent<D>) => void;
  /**
   * external data adapter.
   * Will use the external data adapter from the context if not provided.
   */
  fromExternalData?: fromExternalData<D>;
  /**
   * Make the drop target allow external data.
   * If this is undefined, it will be set to true if fromExternalData is provided.
   *
   * @default undefined
   */
  allowExternal?: boolean;
}

function monitorGet<D extends DNDData, T>(
  get: T,
  options: MonitorOptions<D>
): T extends undefined
  ? undefined
  : T extends MonitorGet<infer I>
    ? (args: MonitorGetFeedback<D>) => I
    : never {
  if (get === undefined) {
    return undefined as any;
  }
  return ((args: MonitorGetFeedback<D>) => {
    const adaptedArgs = getAdaptedEventArgs(args, options.fromExternalData);
    return typeof get === 'function'
      ? (get as any)(adaptedArgs)
      : {
          ...adaptedArgs,
          ...get,
        };
  }) as any;
}

export const useDndMonitor = <D extends DNDData = DNDData>(
  getOptions: () => MonitorOptions<D> = () => ({}),
  deps: any[] = []
) => {
  const dropTargetContext = useContext(DNDContext);

  const options = useMemo(() => {
    const opts = getOptions();
    const allowExternal = opts.allowExternal ?? !!opts.fromExternalData;
    return {
      ...opts,
      allowExternal,
      fromExternalData: allowExternal
        ? (opts.fromExternalData ??
          (dropTargetContext.fromExternalData as fromExternalData<D>))
        : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, getOptions]);

  const monitorOptions = useMemo(() => {
    return {
      canMonitor: monitorGet(options.canMonitor, options),
      onDragStart: monitorGet(options.onDragStart, options),
      onDrag: monitorGet(options.onDrag, options),
      onDrop: monitorGet(options.onDrop, options),
      onDropTargetChange: monitorGet(options.onDropTargetChange, options),
    };
  }, [options]);

  useEffect(() => {
    return monitorForElements(monitorOptions);
  }, [monitorOptions]);

  useEffect(() => {
    if (!options.fromExternalData) {
      return;
    }
    // @ts-expect-error external & element adapter types have some subtle differences
    return monitorForExternal(monitorOptions);
  }, [monitorOptions, options.fromExternalData]);
};

export { monitorForElements };
