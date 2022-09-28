import GitHubIcon from '@mui/icons-material/GitHub';
import { LogoIcon } from '@toeverything/components/icons';

import RedditIcon from '@mui/icons-material/Reddit';
import TelegramIcon from '@mui/icons-material/Telegram';
import TwitterIcon from '@mui/icons-material/Twitter';
import { DiscordIcon } from './DiscordIcon';

import { styled } from '@toeverything/components/ui';

export const ModalContent = () => {
    return (
        <Container>
            <LeftContainer>
                <LeftButtonContainer>
                    <LeftLogoIcon />
                    <LeftButtonText>Official Website AFFiNE.pro</LeftButtonText>
                </LeftButtonContainer>
                <LeftButtonContainer>
                    <LeftGithubIcon />
                    <LeftButtonText>Check Our Docs Open Source</LeftButtonText>
                </LeftButtonContainer>
            </LeftContainer>
            <RightContainer>
                <RightTitle>
                    <div>Get in touch!</div>
                    <div>Join our community.</div>
                </RightTitle>

                <Button>
                    <GitHubIcon />
                    <ButtonText>Github</ButtonText>
                </Button>
                <Button>
                    <RedditIcon />
                    <ButtonText>Reddit</ButtonText>
                </Button>
                <Button>
                    <TwitterIcon />
                    <ButtonText>Twitter</ButtonText>
                </Button>
                <Button>
                    <TelegramIcon />
                    <ButtonText>Telegram</ButtonText>
                </Button>
                <Button>
                    <DiscordIcon />
                    <ButtonText>Discord</ButtonText>
                </Button>
            </RightContainer>
        </Container>
    );
};

const Container = styled('div')({
    margin: '80px 0 100px 0',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
});

const RightContainer = styled('div')({
    paddingRight: '132px',
});

const LeftContainer = styled('div')`
    padding-left: 132px;

    &::before {
        content: '';
        position: absolute;
        left: 158px;
        display: block;
        width: 122px;
        height: 122px;
        background-color: #dda82a;
        opacity: 0.45;
        filter: blur(78px);
    }

    &::after {
        content: '';
        position: absolute;
        top: 330px;
        left: 280px;
        display: block;
        width: 122px;
        height: 122px;
        background-color: #4461f2;
        filter: blur(78px);
    }
`;

// const LeftContainer = styled('div')({
//     paddingLeft: '132px',

//     '&::before': {
//         content: '*',
//         display: 'block',
//         width: '122px',
//         height: '122px',
//         backgroundColor: '#dda82a',
//         opacity: 0.45,
//         filter: 'blur(78px)',
//     },
// });

const LeftButtonContainer = styled('div')(({ theme }) => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    color: theme.affine.palette.primary,
    height: '110px',

    '& + &': {
        marginTop: '50px',
    },
}));

const LeftGithubIcon = styled(GitHubIcon)({
    fontSize: '50px !important',
});

const LeftLogoIcon = styled(LogoIcon)({
    fontSize: '50px !important',
});

const LeftButtonText = styled('span')({
    color: '#000',
    fontSize: '24px',
    lineHeight: '36px',
    width: '200px',
    marginLeft: '40px',
});

const RightTitle = styled('div')({
    paddingLeft: '24px',
    marginBottom: '24px',
    fontSize: '18px',
    lineHeight: '25px',
    color: '#000',
});

const Button = styled('div')(({ theme }) => ({
    cursor: 'pointer',
    padding: '6px 24px',
    fontSize: '18px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: '10px',
    color: theme.affine.palette.primary,

    '&:hover': {
        backgroundColor: '#EDF3FF',
    },

    '& + &': {
        marginTop: '8px',
    },
}));

const ButtonText = styled('span')(({ theme }) => ({
    marginLeft: '30px',
    color: '#000100',
}));
