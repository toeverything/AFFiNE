import { IconButton, MobileMenu } from '@affine/component';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';

import { header } from './style.css';
import { AllDocsTabs } from './tabs';

export interface AllDocsHeaderProps {
  operations?: React.ReactNode;
}

export const AllDocsHeader = ({ operations }: AllDocsHeaderProps) => {
  return (
    <header className={header}>
      <AllDocsTabs />
      <div>
        {operations ? (
          <MobileMenu items={operations}>
            <IconButton icon={<MoreHorizontalIcon />} />
          </MobileMenu>
        ) : null}
      </div>
    </header>
  );
};
