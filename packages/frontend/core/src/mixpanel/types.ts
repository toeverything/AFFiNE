import type { Events } from './events';

export type CallableEventsChain = {
  [Page in keyof Events]: {
    [Segment in keyof Events[Page]]: {
      [Module in keyof Events[Page][Segment]]: {
        // @ts-expect-error ignore `symbol | number` as key
        [Control in Events[Page][Segment][Module][number]]: (
          arg?: string
        ) => void;
      };
    };
  };
};

export type EventsUnion = {
  [Page in keyof Events]: {
    [Segment in keyof Events[Page]]: {
      [Module in keyof Events[Page][Segment]]: {
        // @ts-expect-error ignore `symbol | number` as key
        [Control in Events[Page][Segment][Module][number]]: `${Page}.${Segment}.${Module}.${Control}`;
        // @ts-expect-error ignore `symbol | number` as key
      }[Events[Page][Segment][Module][number]];
    }[keyof Events[Page][Segment]];
  }[keyof Events[Page]];
}[keyof Events];

// page > segment > module > [controls]
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
