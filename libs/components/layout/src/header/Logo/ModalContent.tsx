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
                <LeftButtonContainer href="https://affine.pro" target="_blank">
                    <LeftLogoIcon />
                    <LeftButtonText>Official Website AFFiNE.pro</LeftButtonText>
                </LeftButtonContainer>
                <LeftButtonContainer
                    href="https://github.com/toeverything/AFFiNE"
                    target="_blank"
                >
                    <LeftGithubIcon />
                    <LeftButtonText>Check Our Docs Open Source</LeftButtonText>
                </LeftButtonContainer>
            </LeftContainer>
            <RightContainer>
                <RightTitle>
                    <div>Get in touch!</div>
                    <div>Join our community.</div>
                </RightTitle>

                <Button
                    href="https://github.com/toeverything/AFFiNE"
                    target="_blank"
                >
                    <GitHubIcon />
                    <ButtonText>Github</ButtonText>
                </Button>
                <Button href="https://www.reddit.com/r/Affine/" target="_blank">
                    <RedditIcon />
                    <ButtonText>Reddit</ButtonText>
                </Button>
                <Button
                    href="https://twitter.com/AffineOfficial"
                    target="_blank"
                >
                    <TwitterIcon />
                    <ButtonText>Twitter</ButtonText>
                </Button>
                <Button href="https://t.me/affineworkos" target="_blank">
                    <TelegramIcon />
                    <ButtonText>Telegram</ButtonText>
                </Button>
                <Button href="https://discord.gg/Arn7TqJBvG" target="_blank">
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
    padding-left: 120px;

    &::before {
        content: '';
        position: absolute;
        z-index: -1;
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
        z-index: -1;
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

const LeftButtonContainer = styled('a')(({ theme }) => ({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    color: theme.affine.palette.primary,
    height: '110px',
    cursor: 'pointer',
    padding: '6px 12px',
    borderRadius: '10px',
    textDecoration: 'none',

    '& + &': {
        marginTop: '50px',
    },
}));

const LeftGithubIcon = styled(GitHubIcon)({
    fontSize: '50px !important',
    cursor: 'pointer',
});

const LeftLogoIcon = styled(LogoIcon)({
    fontSize: '50px !important',
    cursor: 'pointer',
});

const LeftButtonText = styled('span')({
    color: '#000',
    fontSize: '24px',
    lineHeight: '36px',
    width: '200px',
    marginLeft: '40px',
    cursor: 'pointer',
});

const RightTitle = styled('div')({
    paddingLeft: '24px',
    marginBottom: '24px',
    fontSize: '18px',
    lineHeight: '25px',
    color: '#000',
});

const Button = styled('a')(({ theme }) => ({
    cursor: 'pointer',
    padding: '6px 24px',
    fontSize: '18px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: '10px',
    color: theme.affine.palette.primary,
    textDecoration: 'none',

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
