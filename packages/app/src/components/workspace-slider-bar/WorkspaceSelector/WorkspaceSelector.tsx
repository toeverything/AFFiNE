import { Popper } from '@/ui/popper';
import { Avatar, WorkspaceName, SelectorWrapper } from './styles';
import { SelectorPopperContent } from './SelectorPopperContent';
import { useState } from 'react';

export const WorkspaceSelector = () => {
  const [isShow, setIsShow] = useState(false);

  return (
    <Popper
      content={<SelectorPopperContent isShow={isShow} />}
      zIndex={1000}
      placement="bottom-start"
      trigger="click"
      onVisibleChange={setIsShow}
    >
      <SelectorWrapper>
        <Avatar alt="Affine" />
        <WorkspaceName>AFFiNE</WorkspaceName>
      </SelectorWrapper>
    </Popper>
  );
};
