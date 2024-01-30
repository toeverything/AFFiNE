import { TagListHeader, useTagMetas } from '@affine/core/components/page-list';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useService, Workspace } from '@toeverything/infra';
import { useMemo } from 'react';
import { type LoaderFunction, redirect, useParams } from 'react-router-dom';

import { AllPage } from './all-page/all-page';
import { AllPageHeader } from './all-page/all-page-header';
import { EmptyPageList } from './page-list-empty';

export const loader: LoaderFunction = async args => {
  if (!args.params.tagId) {
    return redirect('/404');
  }

  return null;
};

export const Component = function TagPage() {
  const params = useParams();
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const { tagUsageCounts } = useTagMetas(
    currentWorkspace.blockSuiteWorkspace,
    pageMetas
  );
  const isEmpty = useMemo(() => {
    if (params.tagId) {
      return tagUsageCounts[params.tagId] === 0;
    }
    return true;
  }, [params.tagId, tagUsageCounts]);

  return isEmpty ? (
    <>
      <AllPageHeader
        workspace={currentWorkspace.blockSuiteWorkspace}
        showCreateNew={false}
        isDefaultFilter={true}
        activeFilter={'tags'}
      />
      <EmptyPageList
        type="all"
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        heading={<TagListHeader />}
      />
    </>
  ) : (
    <AllPage activeFilter="tags" />
  );
};
