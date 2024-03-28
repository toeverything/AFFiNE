import * as styles from '../favorite/styles.css';

export const DragMenuItemOverlay = ({
  title,
  icon,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
}) => {
  return (
    <div className={styles.dragPageItemOverlay}>
      {icon}
      <span>{title}</span>
    </div>
  );
};
