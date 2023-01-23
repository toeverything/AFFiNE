/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  PropsWithChildren,
  ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';
import { styled } from '@/styles';
import { EditorHeader } from '@/components/header';
import EdgelessToolbar from '@/components/edgeless-toolbar';
import MobileModal from '@/components/mobile-modal';
import { useAppState } from '@/providers/app-state-provider/context';
import exampleMarkdown from '@/templates/Welcome-to-AFFiNE-Alpha-v2.0.md';
import type { NextPageWithLayout } from '../..//_app';
import WorkspaceLayout from '@/components/workspace-layout';
import { useRouter } from 'next/router';
import { usePageHelper } from '@/hooks/use-page-helper';
import { Disposable } from '@blocksuite/store/dist/utils/disposable';

const StyledEditorContainer = styled('div')(() => {
  return {
    height: 'calc(100vh - 60px)',
    padding: '0 32px',
  };
});

const firstPageTitle = 'Welcome to AFFiNE Alpha "Abbey Wood"' as const;

const Page: NextPageWithLayout = () => {
  const editorContainer = useRef<HTMLDivElement>(null);
  const { createEditor, setEditor, currentPage, currentWorkspace } =
    useAppState();

  useEffect(() => {
    const ret = () => {
      const node = editorContainer.current;
      while (node?.firstChild) {
        node.removeChild(node.firstChild);
      }
    };
    let disposable: Disposable | undefined;

    const editor = createEditor?.current?.(currentPage!);
    if (editor) {
      editorContainer.current?.appendChild(editor);
      setEditor?.current?.(editor);
      if (currentPage!.isEmpty) {
        const isFirstPage = currentWorkspace?.meta.pageMetas.length === 1;
        // Can not use useCurrentPageMeta to get new title, cause meta title will trigger rerender, but the second time can not remove title
        const { title: metaTitle } = currentPage!.meta;
        const title = metaTitle ? metaTitle : isFirstPage ? firstPageTitle : '';
        currentWorkspace?.setPageMeta(currentPage!.id, { title });

        const pageId = currentPage!.addBlock({
          flavour: 'affine:page',
          title,
        });
        currentPage!.addBlock({ flavour: 'affine:surface' }, null);
        const frameId = currentPage!.addBlock(
          { flavour: 'affine:frame' },
          pageId
        );
        currentPage!.addBlock({ flavour: 'affine:frame' }, pageId);
        // If this is a first page in workspace, init an introduction markdown
        if (isFirstPage) {
          editor.clipboard
            .importMarkdown(exampleMarkdown, `${frameId}`)
            .then(() => {
              currentWorkspace!.setPageMeta(currentPage!.id, { title });
              currentPage!.resetHistory();
            });
        }
        currentPage!.resetHistory();
        disposable = editor.pageBlockModel?.propsUpdated.on(() => {
          document.title = isFirstPage
            ? firstPageTitle
            : currentPage?.meta.title || 'Untitled';
        });
      }
    }
    return () => {
      ret();
      disposable?.dispose();
    };
  }, [currentWorkspace, currentPage, createEditor, setEditor]);

  return (
    <>
      <EditorHeader />
      <MobileModal />
      <StyledEditorContainer ref={editorContainer} />
      <EdgelessToolbar />
    </>
  );
};

const PageDefender = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const [pageLoaded, setPageLoaded] = useState(false);
  const { currentWorkspace, loadPage } = useAppState();
  const { createPage } = usePageHelper();

  useEffect(() => {
    const initPage = async () => {
      const pageId = router.query.pageId as string;
      const isPageExist = !!currentWorkspace!.meta.pageMetas.find(
        p => p.id === pageId
      );
      if (!isPageExist) {
        await createPage({ pageId });
      }
      await loadPage(pageId);
      setPageLoaded(true);
    };
    initPage();
  }, [createPage, currentWorkspace, loadPage, router.query.pageId]);

  return <>{pageLoaded ? children : null}</>;
};

Page.getLayout = function getLayout(page: ReactElement) {
  return (
    <WorkspaceLayout>
      <PageDefender>{page}</PageDefender>
    </WorkspaceLayout>
  );
};

export default Page;
