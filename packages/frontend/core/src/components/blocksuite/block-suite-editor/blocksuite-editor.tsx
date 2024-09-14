import { useRefEffect } from '@affine/component';
import { EditorLoading } from '@affine/component/page-detail-skeleton';
import {
  BookmarkBlockService,
  customImageProxyMiddleware,
  type DocMode,
  EmbedGithubBlockService,
  EmbedLoomBlockService,
  EmbedYoutubeBlockService,
  ImageBlockService,
} from '@blocksuite/blocks';
import { DisposableGroup } from '@blocksuite/global/utils';
import type { AffineEditorContainer } from '@blocksuite/presets';
import type { Doc } from '@blocksuite/store';
import { use } from 'foxact/use';
import type { CSSProperties } from 'react';
import { Suspense, useEffect } from 'react';

import { BlocksuiteEditorContainer } from './blocksuite-editor-container';
import { NoPageRootError } from './no-page-error';

export type EditorProps = {
  page: Doc;
  mode: DocMode;
  shared?: boolean;
  // on Editor ready
  onEditorReady?: (editor: AffineEditorContainer) => (() => void) | void;
  style?: CSSProperties;
  className?: string;
};

function usePageRoot(page: Doc) {
  if (!page.ready) {
    page.load();
  }

  if (!page.root) {
    use(
      new Promise<void>((resolve, reject) => {
        const disposable = page.slots.rootAdded.once(() => {
          resolve();
        });
        window.setTimeout(() => {
          disposable.dispose();
          reject(new NoPageRootError(page));
        }, 20 * 1000);
      })
    );
  }

  return page.root;
}

const BlockSuiteEditorImpl = ({
  mode,
  page,
  className,
  shared,
  style,
  onEditorReady,
}: EditorProps) => {
  usePageRoot(page);

  useEffect(() => {
    const disposable = page.slots.blockUpdated.once(() => {
      page.collection.setDocMeta(page.id, {
        updatedDate: Date.now(),
      });
    });
    return () => {
      disposable.dispose();
    };
  }, [page]);

  const editorRef = useRefEffect(
    (editor: AffineEditorContainer) => {
      globalThis.currentEditor = editor;
      let canceled = false;
      const disposableGroup = new DisposableGroup();

      if (onEditorReady) {
        // Invoke onLoad once the editor has been mounted to the DOM.
        editor.updateComplete
          .then(() => {
            if (canceled) {
              return;
            }
            // host should be ready

            // provide image proxy endpoint to blocksuite
            editor.host?.std.clipboard.use(
              customImageProxyMiddleware(BUILD_CONFIG.imageProxyUrl)
            );
            ImageBlockService.setImageProxyURL(BUILD_CONFIG.imageProxyUrl);

            // provide link preview endpoint to blocksuite
            BookmarkBlockService.setLinkPreviewEndpoint(
              BUILD_CONFIG.linkPreviewUrl
            );
            EmbedGithubBlockService.setLinkPreviewEndpoint(
              BUILD_CONFIG.linkPreviewUrl
            );
            EmbedYoutubeBlockService.setLinkPreviewEndpoint(
              BUILD_CONFIG.linkPreviewUrl
            );
            EmbedLoomBlockService.setLinkPreviewEndpoint(
              BUILD_CONFIG.linkPreviewUrl
            );

            return editor.host?.updateComplete;
          })
          .then(() => {
            if (canceled) {
              return;
            }
            const dispose = onEditorReady(editor);
            if (dispose) {
              disposableGroup.add(dispose);
            }
          })
          .catch(console.error);
      }

      return () => {
        canceled = true;
        disposableGroup.dispose();
      };
    },
    [onEditorReady, page]
  );

  return (
    <BlocksuiteEditorContainer
      mode={mode}
      page={page}
      shared={shared}
      ref={editorRef}
      className={className}
      style={style}
    />
  );
};

export const BlockSuiteEditor = (props: EditorProps) => {
  return (
    <Suspense fallback={<EditorLoading />}>
      <BlockSuiteEditorImpl key={props.page.id} {...props} />
    </Suspense>
  );
};
