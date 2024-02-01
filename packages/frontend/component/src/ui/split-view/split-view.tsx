import { SplitViewContext } from './split-view.context';
import { SplitViewProvider } from './split-view.provider';
import { SplitViewRoot } from './split-view.root';
import { SplitViewTrigger } from './split-view.trigger';
import type { SplitViewRootProps, SplitViewTriggerProps } from './types';

const SplitView = {
  Context: SplitViewContext,
  Provider: SplitViewProvider,
  Root: SplitViewRoot,
  Trigger: SplitViewTrigger,
};
export default SplitView;
export { SplitView };
export type { SplitViewRootProps, SplitViewTriggerProps };
