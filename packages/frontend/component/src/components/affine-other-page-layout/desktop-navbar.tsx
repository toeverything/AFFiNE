import * as styles from './index.css';
import { useNavConfig } from './use-nav-config';

export const DesktopNavbar = () => {
  const config = useNavConfig();

  return (
    <div className={styles.topNavLinks}>
      {config.map(item => {
        return (
          <a
            key={item.title}
            href={item.path}
            target="_blank"
            rel="noreferrer"
            className={styles.topNavLink}
          >
            {item.title}
          </a>
        );
      })}
    </div>
  );
};
