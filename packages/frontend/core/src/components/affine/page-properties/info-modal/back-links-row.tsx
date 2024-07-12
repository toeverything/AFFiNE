import { useI18n } from '@affine/i18n';
import { useContext } from 'react';

import { AffinePageReference } from '../../reference-link';
import { managerContext } from '../common';
import * as styles from './back-links-row.css';
export const BackLinksRow = ({
  references,
  onClick,
}: {
  references: { docId: string; title: string }[];
  onClick?: () => void;
}) => {
  const manager = useContext(managerContext);
  const t = useI18n();
  return (
    <div>
      <div className={styles.title}>
        {t['com.affine.page-properties.backlinks']()} · {references.length}
      </div>
      {references.map(link => (
        <AffinePageReference
          key={link.docId}
          pageId={link.docId}
          wrapper={props => (
            <div className={styles.wrapper} onClick={onClick} {...props} />
          )}
          docCollection={manager.workspace.docCollection}
        />
      ))}
    </div>
  );
};
