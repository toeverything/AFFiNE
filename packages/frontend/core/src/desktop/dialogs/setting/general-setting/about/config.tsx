import {
  DiscordIcon,
  GithubIcon,
  RedditIcon,
  TwitterIcon,
  YouTubeIcon,
} from './icons';

export const relatedLinks = [
  {
    icon: <GithubIcon />,
    title: 'GitHub',
    link: 'https://github.com/toeverything/AFFiNE',
  },
  {
    icon: <TwitterIcon />,
    title: 'X',
    link: 'https://twitter.com/AffineOfficial',
  },
  {
    icon: <DiscordIcon />,
    title: 'Discord',
    link: BUILD_CONFIG.discordUrl,
  },
  {
    icon: <YouTubeIcon />,
    title: 'YouTube',
    link: 'https://www.youtube.com/@affinepro',
  },
  {
    icon: <RedditIcon />,
    title: 'Reddit',
    link: 'https://www.reddit.com/r/Affine/',
  },
];
