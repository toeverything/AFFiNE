import type { DocSnapshot } from '@blocksuite/store';
import { createContext } from '@lit/context';
import type { Signal } from '@preact/signals-core';

export type AdapterItem = {
  id: string;
  label: string;
};

export const ADAPTERS: AdapterItem[] = [
  { id: 'markdown', label: 'Markdown' },
  { id: 'plaintext', label: 'PlainText' },
  { id: 'html', label: 'HTML' },
  { id: 'snapshot', label: 'Snapshot' },
];

export type AdapterPanelContext = {
  activeAdapter$: Signal<AdapterItem>;
  isHtmlPreview$: Signal<boolean>;
  docSnapshot$: Signal<DocSnapshot | null>;
  htmlContent$: Signal<string>;
  markdownContent$: Signal<string>;
  plainTextContent$: Signal<string>;
};

export const adapterPanelContext = createContext<AdapterPanelContext>(
  'adapterPanelContext'
);
