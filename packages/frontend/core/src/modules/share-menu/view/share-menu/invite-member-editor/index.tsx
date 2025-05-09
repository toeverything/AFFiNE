import { Input } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { SearchIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';

import * as styles from './styles.css';

export const InviteInput = ({ onFocus }: { onFocus: () => void }) => {
  const t = useI18n();

  return (
    <Input
      preFix={<SearchIcon className={styles.iconStyle} />}
      className={styles.inputStyle}
      onFocus={onFocus}
      inputStyle={{
        paddingLeft: '0',
        fontSize: cssVar('fontSm'),
      }}
      placeholder={t['com.affine.share-menu.invite-editor.placeholder']()}
    />
  );
};
