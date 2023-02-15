import { Modal, ModalCloseButton, ModalWrapper } from '@affine/component';
import {
  LogoIcon,
  DocIcon,
  TwitterIcon,
  GithubIcon,
  DiscordIcon,
  TelegramIcon,
  RedditIcon,
  LinkIcon,
} from './Icons';
import logo from './affine-text-logo.png';
import {
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
import bg from '@/components/contact-modal/bg.png';
import { useTranslation } from '@affine/i18n';
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

type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};

export const ContactModal = ({
  open,
  onClose,
}: TransitionsModalProps): JSX.Element => {
  const { t } = useTranslation();
  const rightLinkList = [
    {
      icon: <LogoIcon />,
      title: t('Official Website'),
      subTitle: 'AFFiNE.pro',
      link: 'https://affine.pro',
    },
    {
      icon: <DocIcon />,
      title: t('AFFiNE Community'),
      subTitle: 'community.affine.pro',
      link: 'https://community.affine.pro',
    },
  ];
  const date = new Date();
  const year = date.getFullYear();
  return (
    <Modal open={open} onClose={onClose} data-testid="contact-us-modal-content">
      <ModalWrapper
        width={860}
        height={540}
        style={{ backgroundImage: `url(${bg.src})` }}
      >
        <StyledModalHeader>
          <StyledModalHeaderLeft>
            <StyledLogo src={logo.src} alt="" />
            <span>Alpha</span>
          </StyledModalHeaderLeft>
          <ModalCloseButton
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
            <StyledSubTitle>{t('Get in touch!')}</StyledSubTitle>
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
              {t('How is AFFiNE Alpha different?')}
            </a>
          </p>
          <p>Copyright &copy; {year} Toeverything</p>
        </StyledModalFooter>
      </ModalWrapper>
    </Modal>
  );
};

export default ContactModal;
