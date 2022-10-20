import { createPortal } from 'react-dom';
import Fade from '@mui/material/Fade';
import GitHubIcon from '@mui/icons-material/GitHub';
import RedditIcon from '@mui/icons-material/Reddit';
import TelegramIcon from '@mui/icons-material/Telegram';
import TwitterIcon from '@mui/icons-material/Twitter';
import CloseIcon from '@mui/icons-material/Close';

import { LogoIcon, DiscordIcon } from './icons';
import logo from './affine-text-logo.png';
import {
  StyledModalContainer,
  StyledModalWrapper,
  StyledBigLink,
  StyledSmallLink,
  StyledSubTitle,
  StyledLeftContainer,
  StyledRightContainer,
  StyledContent,
  StyledBackdrop,
  StyledLogo,
  StyledModalHeader,
  StyledModalHeaderLeft,
  CloseButton,
  StyledModalFooter,
} from './style';

const linkList = [
  {
    icon: <GitHubIcon />,
    title: 'Github',
    link: 'https://github.com/toeverything/AFFiNE',
  },
  {
    icon: <RedditIcon />,
    title: 'Reddit',
    link: 'https://www.reddit.com/r/Affine/',
  },
  {
    icon: <TwitterIcon />,
    title: 'Twitter',
    link: 'https://twitter.com/AffineOfficial',
  },
  {
    icon: <TelegramIcon />,
    title: 'Telegram',
    link: 'https://t.me/affineworkos',
  },
  {
    icon: <DiscordIcon />,
    title: 'Discord',
    link: 'https://discord.gg/Arn7TqJBvG',
  },
];
const rightLinkList = [
  {
    icon: <LogoIcon />,
    title: 'Official Website AFFiNE.pro',
    link: 'https://affine.pro',
  },
  {
    icon: <GitHubIcon />,
    title: 'Check Our Docs Open Source',
    link: 'https://github.com/toeverything/AFFiNE',
  },
];

type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};

export const ContactModal = ({ open, onClose }: TransitionsModalProps) => {
  return createPortal(
    <Fade in={open}>
      <StyledModalContainer>
        <StyledBackdrop onClick={onClose} />
        <StyledModalWrapper>
          <StyledModalHeader>
            <StyledModalHeaderLeft>
              <StyledLogo src={logo.src} alt="" />
              <span>Alpha</span>
              <span>live demo</span>
            </StyledModalHeaderLeft>
            <CloseButton
              onClick={() => {
                onClose();
              }}
            >
              <CloseIcon />
            </CloseButton>
          </StyledModalHeader>

          <StyledContent>
            <StyledLeftContainer>
              {rightLinkList.map(({ icon, title, link }) => {
                return (
                  <StyledBigLink key={title} href={link} target="_blank">
                    {icon}
                    {title}
                  </StyledBigLink>
                );
              })}
            </StyledLeftContainer>
            <StyledRightContainer>
              <StyledSubTitle>
                Get in touch! <br />
                Join our community.
              </StyledSubTitle>
              {linkList.map(({ icon, title, link }) => {
                return (
                  <StyledSmallLink key={title} href={link} target="_blank">
                    {icon}
                    {title}
                  </StyledSmallLink>
                );
              })}
            </StyledRightContainer>
          </StyledContent>

          <StyledModalFooter>
            <p>
              <a href="javascript:;">
                What is the different from the affine 1.0?
              </a>
            </p>
            <p>Copyright &copy; 2022 Toeverything</p>
          </StyledModalFooter>
        </StyledModalWrapper>
      </StyledModalContainer>
    </Fade>,
    document.body
  );
};

export default ContactModal;
