export interface AwarenessProvider {
  connect(): void;
  disconnect(): void;
}

export * from './affine';
export * from './broadcast-channel';
