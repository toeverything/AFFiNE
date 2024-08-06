import type { EventArgs, Events } from './events';

type EventPropsOverride = {
  page?: keyof Events;
  segment?: string;
  module?: string;
  control?: string;
};

export type CallableEventsChain = {
  [Page in keyof Events]: {
    [Segment in keyof Events[Page]]: {
      [Module in keyof Events[Page][Segment]]: {
        // @ts-expect-error ignore `symbol | number` as key
        [Event in Events[Page][Segment][Module][number]]: Event extends keyof EventArgs
          ? (
              // we make all args partial to simply satisfies nullish type checking
              args?: Partial<EventArgs[Event]> & EventPropsOverride
            ) => void
          : (args?: EventPropsOverride) => void;
      };
    };
  };
};

export type EventsUnion = {
  [Page in keyof Events]: {
    [Segment in keyof Events[Page]]: {
      [Module in keyof Events[Page][Segment]]: {
        // @ts-expect-error ignore `symbol | number` as key
        [Event in Events[Page][Segment][Module][number]]: `${Page}.${Segment}.${Module}.${Event}`;
        // @ts-expect-error ignore `symbol | number` as key
      }[Events[Page][Segment][Module][number]];
    }[keyof Events[Page][Segment]];
  }[keyof Events[Page]];
}[keyof Events];

// page > segment > module > [events]
type IsFourLevelsDeep<
  T,
  Depth extends number[] = [],
> = Depth['length'] extends 3
  ? T extends Array<any>
    ? true
    : false
  : T extends object
    ? {
        [K in keyof T]: IsFourLevelsDeep<T[K], [...Depth, 0]>;
      }[keyof T] extends true
      ? true
      : false
    : false;

// for type checking
export const _assertIsAllEventsDefinedInFourLevels: IsFourLevelsDeep<Events> =
  true;

export interface EventProps {
  // location
  page?: keyof Events;
  segment?: string;
  module?: string;
  control?: string;
  arg?: string;

  // entity
  type?: string;
  category?: string;
  id?: string;
}
