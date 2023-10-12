import { atom, useAtom } from 'jotai';
import { useCallback } from 'react';

export type OnceSignedInEvent = () => void;

export const onceSignedInEventsAtom = atom<OnceSignedInEvent[]>([]);

export const setOnceSignedInEventAtom = atom(
  null,
  (get, set, event: OnceSignedInEvent) => {
    set(onceSignedInEventsAtom, [...get(onceSignedInEventsAtom), event]);
  }
);

export const useOnceSignedInEvents = () => {
  const [events, setEvents] = useAtom(onceSignedInEventsAtom);
  return useCallback(async () => {
    try {
      await Promise.all(events.map(event => event()));
    } catch (err) {
      console.error('Error executing one of the events:', err);
    }
    setEvents([]);
  }, [events, setEvents]);
};
