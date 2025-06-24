import type { MessagePortMain } from 'electron';

/**
 * Type for namespaced handlers, used for RPC registration
 */
export type NamespacedHandlers = Record<
  string,
  Record<string, (...args: any[]) => any>
>;

/**
 * Type for event registrations
 * These are functions that take a callback and return an unsubscribe function
 */
export type EventRegistration = (cb: (...args: any[]) => void) => () => void;

/**
 * Type for namespaced events
 */
export type NamespacedEvents = Record<
  string,
  Record<string, EventRegistration>
>;

/**
 * Interface for the RPC service that communicates with the renderer
 */
export interface RendererRpcInterface {
  connect(port: MessagePortMain): void;
  postEvent(channel: string, ...args: any[]): Promise<void>;
}

/**
 * Interface for renderer to helper communication
 */
export interface RendererToHelper {
  postEvent: (channel: string, ...args: any[]) => void;
}

/**
 * Interface for helper to renderer communication
 */
export interface HelperToRenderer {
  [key: string]: (...args: any[]) => Promise<any>;
}
