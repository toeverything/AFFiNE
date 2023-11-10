import { atom } from 'jotai';
import { nanoid } from 'nanoid';

export type GlobalLoadingEvent = {
  key?: string;
};

const globalLoadingEventsBaseAtom = atom<GlobalLoadingEvent[]>([]);

export const globalLoadingEventsAtom = atom<GlobalLoadingEvent[]>(get =>
  get(globalLoadingEventsBaseAtom)
);

export const resolveGlobalLoadingEventAtom = atom(
  null,
  (_, set, key: string) => {
    set(globalLoadingEventsBaseAtom, globalLoadingEvent =>
      globalLoadingEvent.filter(notification => notification.key !== key)
    );
  }
);

export const pushGlobalLoadingEventAtom = atom<
  null,
  [GlobalLoadingEvent],
  void
>(null, (_, set, newGlobalLoadingEvent) => {
  newGlobalLoadingEvent.key = newGlobalLoadingEvent.key || nanoid();

  set(globalLoadingEventsBaseAtom, globalLoadingEvents => [
    // push to the top
    { ...newGlobalLoadingEvent },
    ...globalLoadingEvents,
  ]);
});
