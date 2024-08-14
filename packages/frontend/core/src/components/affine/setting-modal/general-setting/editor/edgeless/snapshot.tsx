import { snapshot, snapshotContainer, snapshotTitle } from '../style.css';

export const EdgelessSnapshot = ({
  title,
  option,
  type,
}: {
  title: string;
  option: string[];
  type: string;
}) => {
  return (
    <div className={snapshotContainer}>
      <div className={snapshotTitle}>{title}</div>
      <div
        className={snapshot}
        data-editor-option={option}
        data-editor-type={type}
      >
        Mock Preview
      </div>
    </div>
  );
};
