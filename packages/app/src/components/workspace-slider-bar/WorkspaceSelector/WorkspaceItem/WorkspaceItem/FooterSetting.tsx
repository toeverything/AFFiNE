import { SettingsIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import { IconButton } from '@/ui/button';

type SettingProps = {
  onClick?: () => void;
};

export const FooterSetting = ({ onClick }: SettingProps) => {
  const handleClick = () => {
    onClick && onClick();
  };
  return (
    <Wrapper
      className="footer-setting"
      onClick={e => {
        e.stopPropagation();
        handleClick();
      }}
    >
      <SettingsIcon />
    </Wrapper>
  );
};

const Wrapper = styled(IconButton)(({ theme }) => {
  return {
    fontSize: '20px',
  };
});
