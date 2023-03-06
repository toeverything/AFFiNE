import {
  FlexWrapper,
  Modal,
  ModalCloseButton,
  ModalWrapper,
} from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { atom, useAtomValue } from 'jotai';

import {
  DiscordIcon,
  DocIcon,
  GithubIcon,
  LinkIcon,
  LogoIcon,
  RedditIcon,
  TelegramIcon,
  TwitterIcon,
} from './Icons';
import {
  StyledBigLink,
  StyledLogo,
  StyledModalFooter,
  StyledModalHeader,
  StyledPrivacyContainer,
  StyledSmallLink,
  StyledSubTitle,
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

type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};

const logoImgAtom = atom(import('./affine-text-logo.png'));

export const ContactModal = ({
  open,
  onClose,
}: TransitionsModalProps): JSX.Element => {
  const { t } = useTranslation();
  const topLinkList = [
    {
      icon: <LogoIcon />,
      title: t('Official Website'),
      subTitle: 'AFFiNE.pro',
      link: 'https://affine.pro',
    },
    {
      icon: <DocIcon />,
      title: t('Check Our Docs'),
      subTitle: 'Open Source',
      link: 'https://github.com/toeverything/AFFiNE',
    },
  ];
  const date = new Date();
  const year = date.getFullYear();
  const logo = useAtomValue(logoImgAtom);
  return (
    <Modal open={open} onClose={onClose} data-testid="contact-us-modal-content">
      <ModalWrapper width={720} height={436} style={{ letterSpacing: '1px' }}>
        <StyledModalHeader>
          <StyledLogo src={logo.default.src} alt="" />

          <ModalCloseButton
            onClick={() => {
              onClose();
            }}
          />
        </StyledModalHeader>

        <FlexWrapper alignItems="center" justifyContent="center">
          {topLinkList.map(({ icon, title, subTitle, link }) => {
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
        </FlexWrapper>
        <StyledSubTitle>
          {t('Get in touch! Join our communities.')}
        </StyledSubTitle>
        <FlexWrapper justifyContent="center">
          {linkList.map(({ icon, title, link }) => {
            return (
              <StyledSmallLink key={title} href={link} target="_blank">
                {icon}
                <p>{title}</p>
              </StyledSmallLink>
            );
          })}
        </FlexWrapper>

        <StyledModalFooter>
          <p>Copyright &copy; {year} Toeverything</p>
          <StyledPrivacyContainer>
            <a href="https://affine.pro/terms">Terms</a>
            <a href="https://affine.pro/privacy">Privacy</a>
          </StyledPrivacyContainer>
        </StyledModalFooter>
      </ModalWrapper>
    </Modal>
  );
};

export default ContactModal;
