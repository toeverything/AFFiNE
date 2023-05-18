export interface NotifyEvent {
  type: EventKind;
  paths: string[];
}

export type EventKind =
  | 'any'
  | 'other'
  | {
      remove: {
        kind: 'any' | 'file' | 'folder' | 'other';
      };
    }
  | {
      create: {
        kind: 'any' | 'file' | 'folder' | 'other';
      };
    }
  | {
      modify:
        | {
            kind: 'any' | 'other';
          }
        | {
            kind: 'data';
            mode: 'any' | 'size' | 'content' | 'other';
          }
        | {
            kind: 'metadata';
            mode:
              | 'any'
              | 'access-time'
              | 'write-time'
              | 'permissions'
              | 'ownership'
              | 'extended'
              | 'other';
          }
        | {
            kind: 'rename';
            mode: 'any' | 'to' | 'from' | 'both' | 'other';
          };
    };
