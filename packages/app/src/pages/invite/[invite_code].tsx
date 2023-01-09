import { styled } from '@/styles';
import { Empty } from '@/ui/empty';
import { Avatar } from '@mui/material';
// import { getDataCenter } from '@affine/datacenter';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

const User = ({ name, avatar }: { name: string; avatar?: string }) => {
  return (
    <UserContent>
      {avatar ? (
        <Avatar src={avatar}></Avatar>
      ) : (
        <UserIcon>{name.slice(0, 1)}</UserIcon>
      )}
      <span>{name}</span>
    </UserContent>
  );
};

export default function DevPage() {
  const router = useRouter();
  const [successInvited, setSuccessInvited] = useState<boolean>(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inviteData, setInviteData] = useState<any>(null);
  useEffect(() => {
    // getDataCenter()
    //   .then(dc =>
    //     dc.apis.acceptInviting({
    //       invitingCode: router.query.invite_code as string,
    //     })
    //   )
    //   .then(data => {
    //     setSuccessInvited(true);
    //     setInviteData(data);
    //   })
    //   .catch(err => {
    //     console.log('err: ', err);
    //   });
    setSuccessInvited(true);
    setInviteData(null);
  }, [router.query.invite_code]);

  return (
    <Invited>
      <div>
        <Empty width={310} height={310}></Empty>

        <Content>
          <User name={inviteData?.name ? inviteData.name : '-'}></User> invited
          you to join
          <User
            name={inviteData?.workspaceName ? inviteData.workspaceName : '-'}
          ></User>
          {successInvited ? (
            <Status>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle opacity="0.14" cx="12" cy="12" r="9" fill="#6880FF" />
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4ZM2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16.6783 8.2652C17.0841 8.6398 17.1094 9.27246 16.7348 9.67828L11.1963 15.6783C11.007 15.8834 10.7406 16 10.4615 16C10.1824 16 9.91604 15.8834 9.72674 15.6783L7.2652 13.0116C6.89059 12.6058 6.9159 11.9731 7.32172 11.5985C7.72754 11.2239 8.3602 11.2492 8.7348 11.6551L10.4615 13.5257L15.2652 8.32172C15.6398 7.9159 16.2725 7.89059 16.6783 8.2652Z"
                  fill="#6880FF"
                />
              </svg>
              Successfully joined
            </Status>
          ) : (
            <Status>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  opacity="0.14"
                  x="2"
                  y="7"
                  width="12"
                  height="10"
                  rx="5"
                  fill="#6880FF"
                />
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M2.29289 2.29289C2.68342 1.90237 3.31658 1.90237 3.70711 2.29289L7.70678 6.29256C7.707 6.29278 7.70655 6.29234 7.70678 6.29256L21.7071 20.2929C22.0976 20.6834 22.0976 21.3166 21.7071 21.7071C21.3166 22.0976 20.6834 22.0976 20.2929 21.7071L16.5858 18H16.5C15.9477 18 15.5 17.5523 15.5 17C15.5 16.9722 15.5011 16.9447 15.5033 16.9176L13.961 15.3752C12.8815 16.959 11.0631 18 9 18H7C3.68629 18 1 15.3137 1 12C1 9.40763 2.64407 7.19925 4.94642 6.36064L2.29289 3.70711C1.90237 3.31658 1.90237 2.68342 2.29289 2.29289ZM6.60504 8.01925C4.5813 8.21761 3 9.92414 3 12C3 14.2091 4.79086 16 7 16H9C10.511 16 11.8282 15.1618 12.5087 13.9229L10.9367 12.3509C10.7946 12.7301 10.4288 13 10 13C9.44772 13 9 12.5523 9 12C9 11.5127 9.0583 11.0379 9.16858 10.5828L6.60504 8.01925ZM15 8C14.4436 8 13.9162 8.11302 13.4375 8.31642C12.9291 8.53238 12.342 8.29538 12.1261 7.78707C11.9101 7.27876 12.1471 6.69162 12.6554 6.47566C13.377 6.1691 14.17 6 15 6H17C20.3137 6 23 8.68629 23 12C23 13.4573 22.4792 14.7955 21.6146 15.8349C21.2615 16.2595 20.6309 16.3174 20.2063 15.9642C19.7817 15.6111 19.7239 14.9806 20.077 14.556C20.6539 13.8624 21 12.973 21 12C21 9.79086 19.2091 8 17 8H15Z"
                  fill="#6880FF"
                />
              </svg>
              The link has expired
            </Status>
          )}
        </Content>
      </div>
    </Invited>
  );
}
const UserIcon = styled('div')({
  display: 'inline-block',
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: '#FFF5AB',
  textAlign: 'center',
  color: '#896406',
  lineHeight: '28px',
});

const Invited = styled('div')(({ theme }) => {
  return {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    color: theme.colors.textColor,
    backgroundColor: theme.colors.pageBackground,
  };
});

const Content = styled('div')({
  fontSize: '16px',
  marginTop: '35px',
});

const UserContent = styled('span')({
  fontSize: '18px',
  marginLeft: '12px',
  span: {
    padding: '0 12px',
  },
});

const Status = styled('div')(() => {
  return {
    marginTop: '16px',
    svg: {
      verticalAlign: 'middle',
      marginRight: '12px',
    },
  };
});
