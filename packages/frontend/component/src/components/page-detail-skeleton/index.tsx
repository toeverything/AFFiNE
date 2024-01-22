import { Skeleton } from '../../ui/skeleton';
import {
  blockSuiteEditorHeaderStyle,
  blockSuiteEditorStyle,
  pageDetailSkeletonStyle,
  pageDetailSkeletonTitleStyle,
} from './index.css';

export const EditorLoading = () => {
  return (
    <div className={blockSuiteEditorStyle}>
      <Skeleton
        className={blockSuiteEditorHeaderStyle}
        animation="wave"
        height={50}
      />
      <Skeleton animation="wave" height={30} width="40%" />
    </div>
  );
};

export const PageDetailSkeleton = () => {
  return (
    <div className={pageDetailSkeletonStyle}>
      <div className={pageDetailSkeletonTitleStyle} />
      <EditorLoading />
    </div>
  );
};
