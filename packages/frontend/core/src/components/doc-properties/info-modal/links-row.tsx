import type { Backlink, Link } from '@affine/core/modules/doc-link';

import { AffinePageReference } from '../../affine/reference-link';
import * as styles from './links-row.css';

export const LinksRow = ({
  references,
  label,
  className,
  onClick,
}: {
  references: Backlink[] | Link[];
  label: string;
  className?: string;
  onClick?: () => void;
}) => {
  return (
    <div className={className}>
      <div className={styles.title}>
        {label} · {references.length}
      </div>
      {references.map((link, index) => (
        <AffinePageReference
          key={index}
          pageId={link.docId}
          params={'params' in link ? link.params : undefined}
          wrapper={props => (
            <div className={styles.wrapper} onClick={onClick} {...props} />
          )}
        />
      ))}
    </div>
  );
};
