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
  ['data:update']: (guid: string, data: ClientData) => void;
  ['doc:diff']: (guid: string, diff: ArrayBuffer) => void;
  ['doc:update']: (guid: string, update: ArrayBuffer) => void;
  ['awareness:update']: (guid: string, update: ArrayBuffer) => void;
}>;

export type ServerToClientEvents<
  ClientData extends DefaultClientData = DefaultClientData
> = DefaultServerToClientEvents<ClientData>;

export type DefaultClientToServerEvents = ValidateEvents<{
  ['room:close']: () => void;
  ['doc:diff']: (guid: string, diff: Uint8Array) => void;
  ['doc:update']: (
    guid: string,
    update: Uint8Array,
    callback?: () => void
  ) => void;
  ['awareness:update']: (update: Uint8Array, clientId: ClientId) => void;
}>;

export type ClientToServerEvents = DefaultClientToServerEvents;

type ClientToServerEventNames = keyof ClientToServerEvents;

export type BroadcastChannelMessageData<
  EventName extends ClientToServerEventNames = ClientToServerEventNames
> =
  | (EventName extends EventNameWithScope<AwarenessScope>
      ? [eventName: EventName, payload: Uint8Array, clientId?: ClientId]
      : never)
  | (EventName extends EventNameWithScope<YDocScope>
      ? [
          eventName: EventName,
          guid: string,
          payload: Uint8Array,
          clientId?: ClientId
        ]
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
