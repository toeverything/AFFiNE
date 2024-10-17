import type { Socket as IO } from 'socket.io-client';

// TODO(@forehalo): use [UserFriendlyError]
interface EventError {
  name: string;
  message: string;
}

type WebsocketResponse<T> =
  | {
      error: EventError;
    }
  | {
      data: T;
    };

interface ServerEvents {
  'space:broadcast-doc-updates': {
    spaceType: string;
    spaceId: string;
    docId: string;
    updates: string[];
    timestamp: number;
  };
  'space:broadcast-blob-update': {
    spaceType: string;
    spaceId: string;
    key: string;
    data: string;
    mime: string;
  };
}

interface ClientEvents {
  'space:join': [
    { spaceType: string; spaceId: string; clientVersion: string },
    { clientId: string },
  ];
  'space:leave': { spaceType: string; spaceId: string };
  'space:push-doc-updates': [
    { spaceType: string; spaceId: string; docId: string; updates: string[] },
    { timestamp: number },
  ];
  'space:load-doc-timestamps': [
    {
      spaceType: string;
      spaceId: string;
      timestamp?: number;
    },
    Record<string, number>,
  ];
  'space:load-doc': [
    {
      spaceType: string;
      spaceId: string;
      docId: string;
      stateVector?: string;
    },
    {
      missing: string;
      state: string;
      timestamp: number;
    },
  ];

  // blobs
  'space:get-blob': [
    {
      spaceType: string;
      spaceId: string;
      key: string;
    },
    {
      key: string;
      data: string;
      mime: string;
    },
  ];
  'space:set-blob': {
    spaceType: string;
    spaceId: string;
    key: string;
    data: string;
    mime: string;
  };
  'space:delete-blob': {
    spaceType: string;
    spaceId: string;
    key: string;
    permanently: boolean;
  };
  'space:release-blobs': {
    spaceType: string;
    spaceId: string;
  };
  'space:list-blobs': [
    {
      spaceType: string;
      spaceId: string;
    },
    { key: string; size: number }[],
  ];
}

export type ServerEventsMap = {
  [Key in keyof ServerEvents]: (data: ServerEvents[Key]) => void;
};

export type ClientEventsMap = {
  [Key in keyof ClientEvents]: ClientEvents[Key] extends Array<any>
    ? (
        data: ClientEvents[Key][0],
        ack: (res: WebsocketResponse<ClientEvents[Key][1]>) => void
      ) => void
    : (data: ClientEvents[Key]) => void;
};

export type Socket = IO<ServerEventsMap, ClientEventsMap>;
