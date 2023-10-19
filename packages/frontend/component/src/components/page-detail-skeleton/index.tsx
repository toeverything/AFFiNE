import { BlockSuiteFallback } from '../block-suite-editor';
import {
  pageDetailSkeletonStyle,
  pageDetailSkeletonTitleStyle,
} from './index.css';

export const PageDetailSkeleton = () => {
  return (
    <div className={pageDetailSkeletonStyle}>
      <div className={pageDetailSkeletonTitleStyle} />
      <BlockSuiteFallback />
    </div>
  );
};
