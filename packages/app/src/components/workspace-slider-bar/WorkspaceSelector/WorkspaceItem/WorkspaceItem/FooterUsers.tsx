import { UsersIcon } from '@blocksuite/icons';
import { styled } from '@/styles';
import { IconButton } from '@/ui/button';

type FooterUsersProps = {
  memberCount: number;
};

export const FooterUsers = ({ memberCount = 1 }: FooterUsersProps) => {
  return (
    <Wrapper className="footer-users">
      <>
        <UsersIcon />
        <Tip>{memberCount > 99 ? '99+' : memberCount}</Tip>
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
