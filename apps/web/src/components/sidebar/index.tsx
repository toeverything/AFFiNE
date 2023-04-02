import styles from './index.module.css';

export const Sidebar = () => {
  return (
    <div role="menubar" className={styles.sidebar}>
      <div>Affine Workspace</div>
      <div>Workspace</div>
    </div>
  );
};
