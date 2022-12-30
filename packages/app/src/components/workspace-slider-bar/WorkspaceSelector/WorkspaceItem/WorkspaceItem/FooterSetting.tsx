import { SettingsIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import { IconButton } from '@/ui/button';
import { MouseEventHandler } from 'react';

type SettingProps = {
  onClick?: () => void;
};

export const FooterSetting = ({ onClick }: SettingProps) => {
  const handleClick: MouseEventHandler<HTMLButtonElement> = e => {
    e.stopPropagation();
    onClick && onClick();
  };
  return (
    <Wrapper
      className="footer-setting"
      onClick={e => {
        e.stopPropagation();
        handleClick(e);
      }}
    >
      <SettingsIcon />
    </Wrapper>
  );
};

const Wrapper = styled(IconButton)(() => {
  return {
    fontSize: '20px',
  };
});
