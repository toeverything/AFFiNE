import Icon from './Icon.png';
import { styled } from '@/styles';

const User = ({ name, avatar }: { name: string; avatar?: string }) => {
  return (
    <UserContent>
      <UserIcon>{name.slice(0, 1)}</UserIcon> {name}
    </UserContent>
  );
};

export default function DevPage() {
  return (
    <Invited>
      <div>
        <ImageStyle src={Icon.src}></ImageStyle>
        <Content>
          <User name={'Svaney'}></User> invited you to join
          <User name={'Dev Space'}></User>
          <p>Successfully joined</p>
        </Content>
      </div>
    </Invited>
  );
}

const ImageStyle = styled('img')({
  width: '400px',
  height: '400px',
});

const UserIcon = styled('span')({
  display: 'inline-block',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: '#FFF5AB',
  textAlign: 'center',
  color: '#896406',
  lineHeight: '28px',
});

const Invited = styled('div')({
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
});

const Content = styled('div')({
  fontSize: '16px',
});

const UserContent = styled('span')({
  fontSize: '18px',
  margin: '0 5px',
});

const InviteStatus = styled('div')({
  fontSize: '16px',
  marginTop: '16px',
});
