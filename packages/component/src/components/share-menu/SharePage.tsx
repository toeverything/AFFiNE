import type { FC } from 'react';

import { Button } from '../..';
import type { ShareMenuProps } from './index';
import { buttonStyle, descriptionStyle, menuItemStyle } from './index.css';
const SharePage: FC<ShareMenuProps> = props => {
  const handleSwitchChange = (checked: boolean) => {
    console.log('Switch state:', checked);
  };
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        Sharing page publicly requires AFFiNE Cloud service.
      </div>
      <div>
        <Button className={buttonStyle} type="light" shape="round">
          Enable AFFiNE Cloud
        </Button>
      </div>
    </div>
  );
};

export default SharePage;
