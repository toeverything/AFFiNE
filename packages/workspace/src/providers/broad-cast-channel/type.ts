import type { Awareness as YAwareness } from 'y-protocols/awareness';

export type ClientId = YAwareness['clientID'];
// eslint-disable-next-line @typescript-eslint/ban-types
export type DefaultClientData = {};

type EventHandler = (...args: any[]) => void;
export type DefaultEvents = {
  [eventName: string]: EventHandler;
};

type EventNameWithScope<
  Scope extends string,
  Type extends string = string
> = `${Scope}:${Type}`;

type DataScope = 'data';
type RoomScope = 'room';

type YDocScope = 'doc';
type AwarenessScope = 'awareness';
type ObservableScope = YDocScope | AwarenessScope;
type ObservableEventName = EventNameWithScope<ObservableScope>;

type ValidEventScope = DataScope | RoomScope | ObservableScope;

type ValidateEvents<
  Events extends DefaultEvents & {
    [EventName in keyof Events]: EventName extends EventNameWithScope<
      infer EventScope
    >
      ? EventScope extends ValidEventScope
        ? Events[EventName]
        : never
      : Events[EventName];
  }
> = Events;

export type DefaultServerToClientEvents<
  ClientData extends DefaultClientData = DefaultClientData
> = ValidateEvents<{
  ['data:update']: (data: ClientData) => void;
  ['doc:diff']: (diff: ArrayBuffer) => void;
  ['doc:update']: (update: ArrayBuffer) => void;
  ['awareness:update']: (update: ArrayBuffer) => void;
}>;

export type ServerToClientEvents<
  ClientData extends DefaultClientData = DefaultClientData
> = DefaultServerToClientEvents<ClientData>;

export type DefaultClientToServerEvents = ValidateEvents<{
  ['room:close']: () => void;
  ['doc:diff']: (diff: Uint8Array) => void;
  ['doc:update']: (update: Uint8Array, callback?: () => void) => void;
  ['awareness:update']: (update: Uint8Array) => void;
}>;

export type ClientToServerEvents = DefaultClientToServerEvents;

type ClientToServerEventNames = keyof ClientToServerEvents;

export type BroadcastChannelMessageData<
  EventName extends ClientToServerEventNames = ClientToServerEventNames
> =
  | (EventName extends ObservableEventName
      ? [eventName: EventName, payload: Uint8Array, clientId?: ClientId]
      : never)
  | [eventName: `${AwarenessScope}:query`, clientId: ClientId];

export type BroadcastChannelMessageEvent =
  MessageEvent<BroadcastChannelMessageData>;

export type AwarenessChanges = Record<
  'added' | 'updated' | 'removed',
  ClientId[]
>;

export interface TypedBroadcastChannel extends BroadcastChannel {
  onmessage: ((event: BroadcastChannelMessageEvent) => void) | null;
  postMessage: (message: BroadcastChannelMessageData) => void;
}

export const getClients = (awareness: YAwareness): ClientId[] => [
  ...awareness.getStates().keys(),
];
