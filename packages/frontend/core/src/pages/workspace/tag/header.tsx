import { PageDisplayMenu } from '@affine/core/components/page-list';
import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';

export const TagDetailHeader = () => {
  return (
    <Header
      center={<WorkspaceModeFilterTab activeFilter={'tags'} />}
      right={<PageDisplayMenu />}
    />
  );
};
