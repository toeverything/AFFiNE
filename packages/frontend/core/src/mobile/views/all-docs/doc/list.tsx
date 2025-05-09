import { EmptyDocs } from '@affine/core/components/affine/empty';
import { useBlockSuiteDocMeta } from '@affine/core/components/hooks/use-block-suite-page-meta';
import {
  type ItemGroupProps,
  useAllDocDisplayProperties,
  useFilteredPageMetas,
} from '@affine/core/components/page-list';
import type { Tag } from '@affine/core/modules/tag';
import { WorkspaceService } from '@affine/core/modules/workspace';
import type { Collection, Filter } from '@affine/env/filter';
import type { DocMeta } from '@blocksuite/affine/store';
import { ToggleDownIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import * as styles from './list.css';
import { MasonryDocs } from './masonry';

export const DocGroup = ({ group }: { group: ItemGroupProps<DocMeta> }) => {
  const [properties] = useAllDocDisplayProperties();
  const showTags = properties.displayProperties.tags;

  if (group.id === 'all') {
    return <MasonryDocs items={group.items} showTags={showTags} />;
  }

  return (
    <Collapsible.Root defaultOpen>
      <Collapsible.Trigger className={styles.groupTitle}>
        {group.label}
        <ToggleDownIcon className={styles.groupTitleIcon} />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <MasonryDocs items={group.items} showTags={showTags} />
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

export interface AllDocListProps {
  collection?: Collection;
  tag?: Tag;
  filters?: Filter[];
  trash?: boolean;
}

export const AllDocList = ({
  trash,
  collection,
  tag,
  filters = [],
}: AllDocListProps) => {
  const [properties] = useAllDocDisplayProperties();
  const workspace = useService(WorkspaceService).workspace;
  const allPageMetas = useBlockSuiteDocMeta(workspace.docCollection);

  const tagPageIds = useLiveData(tag?.pageIds$);

  const filteredPageMetas = useFilteredPageMetas(allPageMetas, {
    trash,
    filters,
    collection,
  });

  const finalPageMetas = useMemo(() => {
    if (tag) {
      const pageIdsSet = new Set(tagPageIds);
      return filteredPageMetas.filter(page => pageIdsSet.has(page.id));
    }
    return filteredPageMetas;
  }, [filteredPageMetas, tag, tagPageIds]);

  // const groupDefs =
  //   usePageItemGroupDefinitions() as ItemGroupDefinition<DocMeta>[];

  // const groups = useMemo(() => {
  //   return itemsToItemGroups(finalPageMetas ?? [], groupDefs);
  // }, [finalPageMetas, groupDefs]);

  if (!finalPageMetas.length) {
    return (
      <>
        <EmptyDocs absoluteCenter tagId={tag?.id} />
        <div className={styles.emptySpaceY} />
      </>
    );
  }

  // return (
  //   <div className={styles.groups}>
  //     {groups.map(group => (
  //       <DocGroup key={group.id} group={group} />
  //     ))}
  //   </div>
  // );

  return (
    <MasonryDocs
      items={finalPageMetas}
      showTags={properties.displayProperties.tags}
    />
  );
};
