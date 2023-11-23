import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { AuthenticatedItem } from './authenticated-item';

export type ShareHeaderRightItemProps = {
  workspaceId: string;
  pageId: string;
};

const ShareHeaderRightItem = ({ ...props }: ShareHeaderRightItemProps) => {
  const loginStatus = useCurrentLoginStatus();
  if (loginStatus === 'authenticated') {
    return <AuthenticatedItem {...props} />;
  }
  // TODO: Add TOC
  return null;
};

export default ShareHeaderRightItem;
