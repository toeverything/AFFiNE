import type { DisposableClass } from '@blocksuite/global/lit';
import type { BlockComponent, BlockStdScope } from '@blocksuite/std';
import type { LitElement, TemplateResult } from 'lit';

export type PeekableClass = { std: BlockStdScope } & DisposableClass &
  LitElement;

export interface PeekOptions {
  /**
   * Abort signal to abort the peek view
   */
  abortSignal?: AbortSignal;
}

export interface PeekViewService {
  /**
   * Peek a target element page ref info
   * @param pageRef The page ref info to peek.
   * @returns A promise that resolves when the peek view is closed.
   */
  peek(
    pageRef: {
      docId: string;
      blockIds?: string[];
      databaseId?: string;
      databaseDocId?: string;
      databaseRowId?: string;
      elementIds?: string[];
      target?: HTMLElement;
    },
    options?: PeekOptions
  ): Promise<void>;

  /**
   * Peek a target element with a optional template
   * @param target The target element to peek. There are two use cases:
   * 1. If the template is not given, peek view content rendering will be delegated to the implementation of peek view service.
   * 2. To determine the origin of the peek view modal animation
   * @param template Optional template to render in the peek view modal. If not given, the peek view service will render the content.
   * @returns A promise that resolves when the peek view is closed.
   */
  peek(
    // eslint-disable-next-line @typescript-eslint/unified-signatures
    element: { target: HTMLElement; template?: TemplateResult },
    options?: PeekOptions
  ): Promise<void>;

  peek<Element extends BlockComponent>(
    element: { target: Element; template?: TemplateResult },
    options?: PeekOptions
  ): Promise<void>;
}

type PeekableAction = 'double-click' | 'shift-click';

export type PeekableOptions<T extends PeekableClass> = {
  /**
   * Action to bind to the peekable element. default to ['double-click', 'shift-click']
   * false means do not bind any action.
   */
  action?: PeekableAction | PeekableAction[] | false;
  /**
   * It will check the block is enable to peek or not
   */
  enableOn?: (block: T) => boolean;
  /**
   * Selector inside of the peekable element to bind the action
   */
  selector?: string;
};
