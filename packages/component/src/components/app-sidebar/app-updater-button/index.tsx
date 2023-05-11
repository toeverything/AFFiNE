import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ResetIcon } from '@blocksuite/icons';
import clsx from 'clsx';

import * as styles from './index.css';

interface AddPageButtonProps {
  className?: string;
  style?: React.CSSProperties;
}

// Although it is called an input, it is actually a button.
export function AppUpdaterButton({ className, style }: AddPageButtonProps) {
  const t = useAFFiNEI18N();

  return (
    <button
      data-testid="new-page-button"
      style={style}
      className={clsx([styles.root, className])}
      onClick={() => {
        window.apis?.updater.updateClient();
      }}
    >
      <div className={styles.particles} aria-hidden="true"></div>
      <span className={styles.halo} aria-hidden="true"></span>
      <div className={clsx([styles.installLabelNormal])}>
        <span>{t['Update Available']()}</span>
      </div>
      <div className={clsx([styles.installLabelHover])}>
        <ResetIcon className={styles.icon} />
        <span>{t['Restart Install Client Update']()}</span>
      </div>
    </button>
  );
}
