import { ExplorerNavigation } from '@affine/core/components/explorer/header/navigation';
import { Header } from '@affine/core/components/pure/header';

export const AllTagHeader = () => {
  return <Header left={<ExplorerNavigation active={'tags'} />} />;
};
