import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';

import { PageListHeader } from '@/components/header';

export const All = () => {
  const { pageList: allPageList } = useEditor();
  return (
    <>
      <PageListHeader icon={<AllPagesIcon />}>All Page</PageListHeader>
      <PageList
        pageList={allPageList.filter(p => !p.trash)}
        showFavoriteTag={true}
      />
    </>
  );
};

export default All;
