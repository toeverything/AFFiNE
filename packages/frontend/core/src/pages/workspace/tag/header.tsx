import { Header } from '@affine/core/components/pure/header';
import { WorkspaceModeFilterTab } from '@affine/core/components/pure/workspace-mode-filter-tab';

export const TagDetailHeader = () => {
  return <Header center={<WorkspaceModeFilterTab activeFilter={'tags'} />} />;
};
