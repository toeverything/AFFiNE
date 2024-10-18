import type { Socket as SocketIO } from 'socket.io-client';

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
  'space:join-awareness': [
    {
      spaceType: string;
      spaceId: string;
      docId: string;
      clientVersion: string;
    },
    { clientId: string },
  ];
  'space:leave-awareness': {
    spaceType: string;
    spaceId: string;
    docId: string;
  };
  'space:join-blob': [
    { spaceType: string; spaceId: string; key: string },
    { clientId: string },
  ];
  'space:leave-blob': { spaceType: string; spaceId: string };
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

export type Socket = SocketIO<ServerEventsMap, ClientEventsMap>;

export function uint8ArrayToBase64(array: Uint8Array): Promise<string> {
  return new Promise<string>(resolve => {
    // Create a blob from the Uint8Array
    const blob = new Blob([array]);

    const reader = new FileReader();
    reader.onload = function () {
      const dataUrl = reader.result as string | null;
      if (!dataUrl) {
        resolve('');
        return;
      }
      // The result includes the `data:` URL prefix and the MIME type. We only want the Base64 data
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };

    reader.readAsDataURL(blob);
  });
}

export function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const binaryArray = binaryString.split('').map(function (char) {
    return char.charCodeAt(0);
  });
  return new Uint8Array(binaryArray);
}

export const SocketProtocol = {
  async join(socket: Socket, spaceType: string, spaceId: string) {
    const res = await socket.emitWithAck('space:join', {
      spaceType,
      spaceId,
      clientVersion: BUILD_CONFIG.appVersion,
    });

    if ('error' in res) {
      // TODO(@forehalo): use [UserFriendlyError]
      throw new Error(res.error.message);
    }
  },
  leave(socket: Socket, spaceType: string, spaceId: string) {
    socket.emit('space:leave', {
      spaceType,
      spaceId,
    });
  },

  async joinAwareness(
    socket: Socket,
    spaceType: string,
    spaceId: string,
    docId: string
  ) {
    const res = await socket.emitWithAck('space:join-awareness', {
      spaceType,
      spaceId,
      docId,
      clientVersion: BUILD_CONFIG.appVersion,
    });

    if ('error' in res) {
      throw new Error(res.error.message);
    }
  },
  leaveAwareness(
    socket: Socket,
    spaceType: string,
    spaceId: string,
    docId: string
  ) {
    socket.emit('space:leave-awareness', {
      spaceType,
      spaceId,
      docId,
    });
  },
  async joinBlob(
    socket: Socket,
    spaceType: string,
    spaceId: string,
    key: string
  ) {
    const res = await socket.emitWithAck('space:join-blob', {
      spaceType,
      spaceId,
      key,
    });

    if ('error' in res) {
      throw new Error(res.error.message);
    }
  },
  leaveBlob(socket: Socket, spaceType: string, spaceId: string) {
    socket.emit('space:leave-blob', {
      spaceType,
      spaceId,
    });
  },
};
