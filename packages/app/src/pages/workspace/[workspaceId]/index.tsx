import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { useAppState } from '@/providers/app-state-provider/context';

const Page = () => {
  const router = useRouter();
  const workspace = useLoadWorkspace();
  const { createPage, currentWorkspaceId } = useAppState();

  useEffect(() => {
    if (!workspace) {
      return;
    }

    const savedPageId = workspace.meta.pageMetas[0]?.id;
    if (savedPageId) {
      router.push(`/workspace/${currentWorkspaceId}/${savedPageId}`);
      return;
    }

    createPage?.current?.()?.then(async pageId => {
      if (!pageId) {
        return;
      }
      router.push(`/workspace/${currentWorkspaceId}/${pageId}`);
    });
  }, [workspace, currentWorkspaceId, createPage, router]);

  return <div></div>;
};

export default Page;
