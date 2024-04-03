import { ShapeIcon } from '@blocksuite/icons';

import * as styles from './ai-plan.css';

const benefits = [
  {
    name: 'Write with you',
    icon: <ShapeIcon />,
    items: [
      'Create quality content from sentences to articles on topics you need',
      'Rewrite like the professionals',
      'Change the tones / fix spelling & grammar',
    ],
  },
  {
    name: 'Draw with you',
    icon: <ShapeIcon />,
    items: [
      'Visualize your mind, magically',
      'Turn your outline into beautiful, engaging presentations',
      'Summarize your content into structured mind-map',
    ],
  },
  {
    name: 'Plan with you',
    icon: <ShapeIcon />,
    items: [
      'Memorize and tidy up your knowledge',
      'Auto-sorting and auto-tagging',
      'Open source & Privacy ensured',
    ],
  },
];

export const AIBenefits = () => {
  // TODO: responsive
  return (
    <div className={styles.benefits}>
      {benefits.map(({ name, icon, items }) => {
        return (
          <div key={name} className={styles.benefitGroup}>
            <div className={styles.benefitTitle}>
              {icon}
              {name}
            </div>

            <ul className={styles.benefitList}>
              {items.map(item => (
                <li className={styles.benefitItem} key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};
