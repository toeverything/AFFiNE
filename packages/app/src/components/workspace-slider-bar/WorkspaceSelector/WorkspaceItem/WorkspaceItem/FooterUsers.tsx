import { UsersIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import { IconButton } from '@/ui/button';

export const FooterUsers = () => {
  return (
    <Wrapper className="footer-users">
      <>
        <UsersIcon />
        <Tip>99+</Tip>
      </>
    </Wrapper>
  );
};

const Wrapper = styled(IconButton)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
});

const Tip = styled('span')({
  fontSize: '12px',
});
