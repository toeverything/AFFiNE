import { IconButton, MobileMenu } from '@affine/component';
import type { Tag } from '@affine/core/modules/tag';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { useLiveData } from '@toeverything/infra';

import { PageHeader } from '../../../components';
import { AllDocsMenu } from '../doc';
import * as styles from './detail.css';

export const TagDetailHeader = ({ tag }: { tag: Tag }) => {
  const name = useLiveData(tag.value$);
  const color = useLiveData(tag.color$);
  return (
    <PageHeader
      back
      suffix={
        <MobileMenu items={<AllDocsMenu />}>
          <IconButton
            size="24"
            style={{ padding: 10 }}
            icon={<MoreHorizontalIcon />}
          />
        </MobileMenu>
      }
    >
      <div className={styles.headerContent}>
        <div className={styles.headerIcon} style={{ color }} />
        {name}
      </div>
    </PageHeader>
  );
};
