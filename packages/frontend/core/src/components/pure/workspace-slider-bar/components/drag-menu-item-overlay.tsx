import * as styles from '../favorite/styles.css';

export const DragMenuItemOverlay = ({
  pageTitle,
  icon,
}: {
  icon: React.ReactNode;
  pageTitle: React.ReactNode;
}) => {
  return (
    <div className={styles.dragPageItemOverlay}>
      {icon}
      <span>{pageTitle}</span>
    </div>
  );
};
