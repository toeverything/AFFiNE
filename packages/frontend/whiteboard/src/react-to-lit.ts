import { createIdentifier } from '@blocksuite/affine/global/di';
import type { ExtensionType } from '@blocksuite/affine/store';
import type { TemplateResult } from 'lit';

export type WhiteboardReactToLit = (
  element: unknown,
  rerendering?: boolean
) => TemplateResult;

export const WhiteboardReactToLitIdentifier =
  createIdentifier<WhiteboardReactToLit>('affine-whiteboard-react-to-lit');

export function WhiteboardReactToLitExtension(
  reactToLit: WhiteboardReactToLit
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(WhiteboardReactToLitIdentifier, () => reactToLit);
    },
  };
}
