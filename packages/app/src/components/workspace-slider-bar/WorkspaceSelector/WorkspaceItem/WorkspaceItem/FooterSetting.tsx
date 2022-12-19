import { SettingsIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import { IconButton } from '@/ui/button';

export const FooterSetting = () => {
  return (
    <Wrapper className="footer-setting">
      <SettingsIcon />
    </Wrapper>
  );
};

const Wrapper = styled(IconButton)(({ theme }) => {
  return {
    fontSize: '20px',
  };
});
