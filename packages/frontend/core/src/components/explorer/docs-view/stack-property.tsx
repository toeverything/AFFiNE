import * as styles from './properties.css';

export const StackProperty = ({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) => {
  return (
    <div className={styles.stackItem}>
      <div className={styles.stackItemContent}>
        {icon ? <div className={styles.stackItemIcon}>{icon}</div> : null}
        <div className={styles.stackItemLabel}>{children}</div>
      </div>
    </div>
  );
};
