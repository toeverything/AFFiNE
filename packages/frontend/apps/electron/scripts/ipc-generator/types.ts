/**
 * Types for IPC generator
 */

export interface ParsedDecoratorInfo {
  /** ipc scope */
  scope?: string;
  /** method name that will show up in the generated API */
  apiMethodName?: string;
  /** optional error message when decorator is invalid */
  error?: string;
  /** entry: main/helper */
  entry?: Entry;
  /** absolute path to the source file */
  filePath?: string;
}

export interface ParsedEventInfo {
  scope: string;
  /** event name without the scope prefix */
  eventName: string;
  /** full ipc channel (e.g. ui:maximized) */
  ipcChannel: string;
  /** payload type extracted from rxjs observable – kept for compatibility */
  payloadType: string;
  /** original property name in the class */
  originalPropertyName: string;
  /** entry of the source file */
  entry: Entry;
  description?: string;
  error?: string;
  /** absolute path to the source file */
  filePath?: string;
}

export type Entry = 'main' | 'helper';

export interface CollectedApiMethodInfo {
  apiMethodName: string;
  modulePath: string;
  className: string;
  methodName: string;
  description?: string;
  entry: Entry;
  filePath: string;
}
export type CollectedApisMap = Map<string, CollectedApiMethodInfo[]>;

export interface CollectedEventInfoForMeta {
  eventName: string;
}
export interface CollectedEventInfoForTypes extends CollectedEventInfoForMeta {
  payloadType: string;
  description?: string;
  entry: Entry;
  filePath: string;
  className: string; // Class containing the event property
  propertyName: string; // Original property name
  modulePath: string;
}
export type CollectedEventsMap = Map<string, CollectedEventInfoForTypes[]>; // Keyed by scope

export interface OutputPaths {
  apiTypes: string; // Type definitions for API handlers
  eventTypes: string; // Type definitions for events
  ipcMeta: string; // Combined metadata for both handlers and events
}
