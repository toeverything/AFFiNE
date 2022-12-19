import { Popper } from '@/ui/popper';
import { Avatar, WorkspaceName, SelectorWrapper } from './styles';
import { SelectorPopperContent } from './SelectorPopperContent';

export const WorkspaceSelector = () => {
  return (
    <Popper
      content={<SelectorPopperContent />}
      zIndex={1000}
      placement="bottom-start"
      trigger="click"
    >
      <SelectorWrapper>
        <Avatar alt="Affine" />
        <WorkspaceName>AFFiNE</WorkspaceName>
      </SelectorWrapper>
    </Popper>
  );
};
