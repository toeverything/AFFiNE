import { PropsWithChildren, ReactElement, useEffect, useState } from 'react';
import { EditorHeader } from '@/components/header';
import MobileModal from '@/components/mobile-modal';
import { useAppState } from '@/providers/app-state-provider';
import type { NextPageWithLayout } from '../..//_app';
import WorkspaceLayout from '@/components/workspace-layout';
import { useRouter } from 'next/router';
import { usePageHelper } from '@/hooks/use-page-helper';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useTranslation } from '@affine/i18n';
import { useBlockSuite } from '@/store/workspace';
const DynamicBlocksuite = dynamic(() => import('@/components/editor'), {
  ssr: false,
});

const BlockHubAppender = () => {
  const setBlockHub = useBlockSuite(store => store.setBlockHub);
  const editor = useBlockSuite(store => store.editor);
  useEffect(() => {
    let blockHubElement: HTMLElement | null = null;

    editor?.createBlockHub().then(blockHub => {
      const toolWrapper = document.querySelector('#toolWrapper');
      if (!toolWrapper) {
        // In an invitation page there is no toolWrapper, which contains helper icon and blockHub icon
        return;
      }
      blockHubElement = blockHub;
      setBlockHub(blockHub);
      toolWrapper.appendChild(blockHub);
    });
    return () => {
      blockHubElement?.remove();
    };
  }, [editor, setBlockHub]);
  return null;
};

const Page: NextPageWithLayout = () => {
  const currentPage = useBlockSuite(store => store.currentPage);
  const setEditor = useBlockSuite(store => store.setEditor);
  const { currentWorkspace } = useAppState();

  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{currentPage?.meta?.title || t('Untitled')} - AFFiNE</title>
      </Head>
      <EditorHeader />
      <MobileModal />

      {currentPage && currentWorkspace?.blocksuiteWorkspace && (
        <>
          <DynamicBlocksuite
            page={currentPage}
            workspace={currentWorkspace.blocksuiteWorkspace}
            setEditor={setEditor}
          />
          <BlockHubAppender />
        </>
      )}
    </>
  );
};

const PageDefender = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const [pageLoaded, setPageLoaded] = useState(false);
  const loadPage = useBlockSuite(store => store.loadPage);
  const { currentWorkspace } = useAppState();
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
