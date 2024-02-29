import { HubIsland } from '@affine/core/components/affine/hub-island';
import { useTagMetas } from '@affine/core/components/page-list';
import {
  TagListHeader,
  VirtualizedTagList,
} from '@affine/core/components/page-list/tags';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';

import { EmptyTagList } from '../page-list-empty';
import { AllTagHeader } from './header';

export const AllTag = () => {
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);

  const { tags, tagMetas, deleteTags } = useTagMetas(
    currentWorkspace.blockSuiteWorkspace,
    pageMetas
  );

  return (
    <>
      <AllTagHeader />
      {tags.length > 0 ? (
        <VirtualizedTagList
          tags={tags}
          tagMetas={tagMetas}
          onTagDelete={deleteTags}
        />
      ) : (
        <EmptyTagList heading={<TagListHeader />} />
      )}
      <HubIsland />
    </>
  );
};

export const Component = () => {
  return <AllTag />;
};
