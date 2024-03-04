import { useTagMetas } from '@affine/core/components/page-list';
import {
  TagListHeader,
  VirtualizedTagList,
} from '@affine/core/components/page-list/tags';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';

import { ViewBodyIsland, ViewHeaderIsland } from '../../../modules/workbench';
import { EmptyTagList } from '../page-list-empty';
import * as styles from './all-tag.css';
import { AllTagHeader } from './header';

export const AllTag = () => {
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuiteDocMeta(currentWorkspace.blockSuiteWorkspace);

  const { tags, tagMetas, deleteTags } = useTagMetas(
    currentWorkspace.blockSuiteWorkspace,
    pageMetas
  );

  return (
    <>
      <ViewHeaderIsland>
        <AllTagHeader />
      </ViewHeaderIsland>
      <ViewBodyIsland>
        <div className={styles.body}>
          {tags.length > 0 ? (
            <VirtualizedTagList
              tags={tags}
              tagMetas={tagMetas}
              onTagDelete={deleteTags}
            />
          ) : (
            <EmptyTagList heading={<TagListHeader />} />
          )}
        </div>
      </ViewBodyIsland>
    </>
  );
};

export const Component = () => {
  return <AllTag />;
};
