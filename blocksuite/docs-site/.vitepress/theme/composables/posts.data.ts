import { format, formatDistance } from 'date-fns';
import { createContentLoader } from 'vitepress';

interface Post {
  title: string;
  authors: { name: string; link: string }[];
  url: string;
  date: {
    raw: string;
    time: number;
    formatted: string;
    since: string;
  };
}

function formatDate(raw: string) {
  const date = new Date(raw);
  date.setUTCHours(8);
  return {
    raw: date.toISOString().split('T')[0],
    time: +date,
    formatted: format(date, 'yyyy/MM/dd'),
    since: formatDistance(date, new Date(), { addSuffix: true }),
  };
}

const data = [] as Post[];
export { data };

export default createContentLoader('blog/*.md', {
  includeSrc: true,
  transform(raw) {
    return raw
      .filter(item => item.url !== '/blog/')
      .map(({ url, frontmatter }) => ({
        title: frontmatter.title,
        authors: frontmatter.authors ?? [],
        excerpt: frontmatter.excerpt ?? '',
        url,
        date: formatDate(frontmatter.date),
      }))
      .sort((a, b) => b.date.time - a.date.time);
  },
});
