import {
  PropsWithChildren,
  ReactElement,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { EditorHeader } from '@/components/header';
import EdgelessToolbar from '@/components/edgeless-toolbar';
import MobileModal from '@/components/mobile-modal';
import { useAppState } from '@/providers/app-state-provider';
import type { NextPageWithLayout } from '../..//_app';
import WorkspaceLayout from '@/components/workspace-layout';
import { useRouter } from 'next/router';
import { usePageHelper } from '@/hooks/use-page-helper';
import dynamic from 'next/dynamic';
import { EditorContainer } from '@blocksuite/editor';
const DynamicBlocksuite = dynamic(() => import('@/components/editor'), {
  ssr: false,
});
const Page: NextPageWithLayout = () => {
  const { currentPage, currentWorkspace, setEditor } = useAppState();

  const setEditorHandler = useCallback(
    (editor: EditorContainer) => setEditor.current(editor),
    [setEditor]
  );
  return (
    <>
      <EditorHeader />
      <MobileModal />

      {currentPage && currentWorkspace?.blocksuiteWorkspace && (
        <DynamicBlocksuite
          page={currentPage}
          workspace={currentWorkspace.blocksuiteWorkspace}
          setEditor={setEditorHandler}
        />
      )}
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
      const isPageExist =
        currentWorkspace?.blocksuiteWorkspace?.meta?.pageMetas.find(
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
