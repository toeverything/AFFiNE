import { createPortal } from 'react-dom';
import Fade from '@mui/material/Fade';
import CloseIcon from '@mui/icons-material/Close';
import {
  LogoIcon,
  DocIcon,
  TwitterIcon,
  GithubIcon,
  DiscordIcon,
  TelegramIcon,
  RedditIcon,
  LinkIcon,
} from './icons';
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
    icon: <GithubIcon />,
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
    title: 'Official Website ',
    subTitle: 'AFFiNE.pro',
    link: 'https://affine.pro',
  },
  {
    icon: <DocIcon />,
    title: 'Check Our Docs',
    subTitle: 'docs.AFFiNE.pro',
    link: 'https://docs.affine.pro',
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
            </StyledModalHeaderLeft>
            <CloseButton
              onClick={() => {
                onClose();
              }}
            >
              <CloseIcon width={12} height={12} />
            </CloseButton>
          </StyledModalHeader>

          <StyledContent>
            <StyledLeftContainer>
              {rightLinkList.map(({ icon, title, subTitle, link }) => {
                return (
                  <StyledBigLink key={title} href={link} target="_blank">
                    {icon}
                    <p>{title}</p>
                    <p>
                      {subTitle}
                      <LinkIcon />
                    </p>
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
              <a href="">How is AFFiNE Alpha different？</a>
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
