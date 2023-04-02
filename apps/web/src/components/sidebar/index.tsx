import { CurrentWorkspace } from '../current-workspace';
import styles from './index.module.css';

export const Sidebar = () => {
  return (
    <div role="menubar" className={styles.sidebar}>
      <CurrentWorkspace />
      <div>Workspace</div>
    </div>
  );
};
