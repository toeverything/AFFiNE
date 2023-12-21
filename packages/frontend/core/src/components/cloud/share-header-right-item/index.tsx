import type { PageMode } from '../../../atoms';
import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { AuthenticatedItem } from './authenticated-item';
import { PresentButton } from './present';
import * as styles from './styles.css';

export type ShareHeaderRightItemProps = {
  workspaceId: string;
  pageId: string;
  publishMode: PageMode;
};

const ShareHeaderRightItem = ({ ...props }: ShareHeaderRightItemProps) => {
  const loginStatus = useCurrentLoginStatus();
  const { publishMode } = props;

  // TODO: Add TOC
  return (
    <div className={styles.rightItemContainer}>
      {loginStatus === 'authenticated' ? (
        <AuthenticatedItem {...props} />
      ) : null}
      {publishMode === 'edgeless' ? <PresentButton /> : null}
    </div>
  );
};

export default ShareHeaderRightItem;
