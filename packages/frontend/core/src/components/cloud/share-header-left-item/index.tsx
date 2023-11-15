import { Logo1Icon } from '@blocksuite/icons';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import * as styles from './styles.css';
import { PublishPageUserAvatar } from './user-avatar';

const ShareHeaderLeftItem = () => {
  const loginStatus = useCurrentLoginStatus();
  if (loginStatus === 'authenticated') {
    return <PublishPageUserAvatar />;
  }

  return (
    <a
      href="https://affine.pro/"
      target="_blank"
      rel="noreferrer"
      className={styles.iconWrapper}
      data-testid="share-page-logo"
    >
      <Logo1Icon />
    </a>
  );
};

export default ShareHeaderLeftItem;
