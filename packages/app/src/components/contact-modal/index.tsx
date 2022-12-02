import { Modal, ModalCloseButton } from '@/ui/modal';
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
  StyledModalWrapper,
  StyledBigLink,
  StyledSmallLink,
  StyledSubTitle,
  StyledLeftContainer,
  StyledRightContainer,
  StyledContent,
  StyledLogo,
  StyledModalHeader,
  StyledModalHeaderLeft,
  StyledModalFooter,
} from './style';

const linkList = [
  {
    icon: <GithubIcon />,
    title: 'GitHub',
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
  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper data-testid="contact-us-modal-content">
        <StyledModalHeader>
          <StyledModalHeaderLeft>
            <StyledLogo src={logo.src} alt="" />
            <span>Alpha</span>
          </StyledModalHeaderLeft>
          <ModalCloseButton
            top={6}
            right={6}
            size={[30, 30]}
            iconSize={[20, 20]}
            onClick={() => {
              onClose();
            }}
          />
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
            <a
              href="https://affine.pro/content/blog/affine-alpha-is-coming/index"
              target="_blank"
              rel="noreferrer"
            >
              How is AFFiNE Alpha different？
            </a>
          </p>
          <p>Copyright &copy; 2022 Toeverything</p>
        </StyledModalFooter>
      </StyledModalWrapper>
    </Modal>
  );
};

export default ContactModal;
