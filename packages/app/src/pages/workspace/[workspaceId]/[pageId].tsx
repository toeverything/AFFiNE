/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  useRef,
  useEffect,
  useState,
  ReactElement,
  PropsWithChildren,
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
const StyledEditorContainer = styled('div')(() => {
  return {
    height: 'calc(100vh - 60px)',
  };
});

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

    const editor = createEditor?.current?.(currentPage!);
    if (editor) {
      editorContainer.current?.appendChild(editor);
      setEditor?.current?.(editor);
      if (currentPage!.isEmpty) {
        const isFirstPage = currentWorkspace?.meta.pageMetas.length === 1;
        // Can not use useCurrentPageMeta to get new title, cause meta title will trigger rerender, but the second time can not remove title
        const { title: metaTitle } = currentPage!.meta;
        const title = metaTitle
          ? metaTitle
          : isFirstPage
          ? 'Welcome to AFFiNE Alpha "Abbey Wood"'
          : '';
        currentWorkspace?.setPageMeta(currentPage!.id, { title });

        const pageId = currentPage!.addBlock({
          flavour: 'affine:page',
          title,
        });
        const groupId = currentPage!.addBlock(
          { flavour: 'affine:group' },
          pageId
        );
        currentPage!.addBlock({ flavour: 'affine:group' }, pageId);
        // If this is a first page in workspace, init an introduction markdown
        if (isFirstPage) {
          editor.clipboard.importMarkdown(exampleMarkdown, `${groupId}`);
          currentWorkspace!.setPageMeta(currentPage!.id, { title });
        }
        currentPage!.resetHistory();
      }
    }

    return ret;
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
