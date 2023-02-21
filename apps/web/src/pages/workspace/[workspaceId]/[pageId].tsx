import { useTranslation } from '@affine/i18n';
import { useDataCenterWorkspacePage } from '@affine/store';
import { assertEquals } from '@blocksuite/store';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { PropsWithChildren, ReactElement, useCallback, useEffect } from 'react';

import { EditorHeader } from '@/components/header';
import { PageLoading } from '@/components/loading';
import MobileModal from '@/components/mobile-modal';
import WorkspaceLayout from '@/components/workspace-layout';
import usePageHelper from '@/hooks/use-page-helper';
import { useDataCenter, useGlobalState, useGlobalStateApi } from '@/store/app';
import exampleMarkdown from '@/templates/Welcome-to-AFFiNE-Alpha-Downhills.md';

import type { NextPageWithLayout } from '../..//_app';

const DynamicBlocksuite = dynamic(() => import('@/components/editor'), {
  ssr: false,
});

const BlockHubAppender = () => {
  const setBlockHub = useGlobalState(store => store.setBlockHub);
  const editor = useGlobalState(store => store.editor);
  useEffect(() => {
    // todo(himself65): refactor with `useRef`
    const abortController = new AbortController();
    let blockHubElement: HTMLElement | null = null;
    abortController.signal.addEventListener('abort', () => {
      blockHubElement?.remove();
      const toolWrapper = document.querySelector('#toolWrapper');
      if (toolWrapper) {
        assertEquals(toolWrapper.childNodes.length, 0);
      }
    });

    editor?.createBlockHub().then(blockHub => {
      const toolWrapper = document.querySelector('#toolWrapper');
      if (!toolWrapper) {
        // In an invitation page there is no toolWrapper, which contains helper icon and blockHub icon
        return;
      }
      if (abortController.signal.aborted) {
        return;
      }
      blockHubElement = blockHub;
      setBlockHub(blockHub);
      toolWrapper.appendChild(blockHub);
    });
    return () => {
      abortController.abort();
    };
  }, [editor, setBlockHub]);
  return null;
};

const Page: NextPageWithLayout = () => {
  const currentPage = useGlobalState(store => store.currentPage);
  const setEditor = useGlobalState(store => store.setEditor);
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );

  const { t } = useTranslation();

  // Only first workspace and first page will have template markdown
  const shouldInitTemplateContent =
    currentPage?.isEmpty &&
    currentWorkspace?.blocksuiteWorkspace?.meta.pageMetas.length === 1;
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
            templateMarkdown={
              shouldInitTemplateContent ? exampleMarkdown : undefined
            }
            templateTitle={
              shouldInitTemplateContent
                ? 'Welcome to AFFiNE Alpha "Downhills"'
                : undefined
            }
          />
          <BlockHubAppender key={currentWorkspace.id + currentPage.id} />
        </>
      )}
    </>
  );
};

const PageDefender = ({ children }: PropsWithChildren) => {
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const loadWorkspace = useGlobalState(
    useCallback(store => store.loadWorkspace, [])
  );
  const router = useRouter();
  const { page, exist } = useDataCenterWorkspacePage(
    currentWorkspace?.id ?? null,
    typeof router.query.pageId === 'string' && router.query.pageId !== 'null'
      ? router.query.pageId
      : null
  );
  const { createPage } = usePageHelper();
  const dataCenter = useDataCenter();
  const api = useGlobalStateApi();
  useEffect(() => {
    if (currentWorkspace && page) {
      api.setState({
        currentPage: page,
      });
      router.push(`/workspace/${currentWorkspace.id}/${page.id}`);
    } else if (currentWorkspace && !exist) {
      if (currentWorkspace.blocksuiteWorkspace?.meta.pageMetas.length === 0) {
        loadWorkspace(currentWorkspace.id);
        createPage({}, currentWorkspace);
      }
    }
  }, [api, createPage, currentWorkspace, exist, loadWorkspace, page, router]);
  useEffect(
    () =>
      dataCenter.onWorkspacesChange(({ deleted }) => {
        if (deleted?.some(workspace => workspace.id === currentWorkspace?.id)) {
          router.replace('/404?code=kicked');
        }
      }),
    [api, currentWorkspace?.id, dataCenter, router]
  );

  if (!page) {
    return <PageLoading />;
  }

  return <>{children}</>;
};

Page.getLayout = function getLayout(page: ReactElement) {
  return (
    <WorkspaceLayout>
      <PageDefender>{page}</PageDefender>
    </WorkspaceLayout>
  );
};

export default Page;
