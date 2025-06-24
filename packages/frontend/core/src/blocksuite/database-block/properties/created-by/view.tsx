import { Avatar, uniReactRoot } from '@affine/component';
import {
  type CellRenderProps,
  createIcon,
  type DataViewCellLifeCycle,
  EditorHostKey,
} from '@blocksuite/affine/blocks/database';
import {
  UserProvider,
  type UserService,
} from '@blocksuite/affine/shared/services';
import { css } from '@emotion/css';
import {
  forwardRef,
  type ForwardRefRenderFunction,
  type ReactNode,
  useImperativeHandle,
} from 'react';

import { useSignalValue } from '../../../../modules/doc-info/utils';
import { useMemberInfo } from '../../hooks/use-member-info';
import { createdByPropertyModelConfig } from './define';

const cellContainer = css({
  width: '100%',
  position: 'relative',
  gap: '6px',
  display: 'flex',
  flexWrap: 'wrap',
  overflow: 'hidden',
});
const memberPreviewContainer = css({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  overflow: 'hidden',
});
const memberName = css({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '14px',
  lineHeight: '22px',
});
const avatar = css({
  flexShrink: 0,
});

const CreatedByCellComponent: ForwardRefRenderFunction<
  DataViewCellLifeCycle,
  CellRenderProps<{}, string | null, string | null>
> = (props, ref): ReactNode => {
  useImperativeHandle(
    ref,
    () => ({
      beforeEnterEditMode: () => {
        return false;
      },
      beforeExitEditingMode: () => {},
      afterEnterEditingMode: () => {},
      focusCell: () => true,
      blurCell: () => true,
      forceUpdate: () => {},
    }),
    []
  );
  const host = props.cell.view.serviceGet(EditorHostKey);
  const userService = host?.std.getOptional(UserProvider);
  const memberId = useSignalValue(props.cell.value$);
  if (!memberId) {
    return null;
  }
  return (
    <div style={{ overflow: 'hidden' }}>
      <div className={cellContainer}>
        <MemberPreview
          key={memberId}
          memberId={memberId}
          userService={userService}
        />
      </div>
    </div>
  );
};

const MemberPreview = ({
  memberId,
  userService,
}: {
  memberId: string;
  userService: UserService | null | undefined;
}) => {
  const userInfo = useMemberInfo(memberId, userService);
  if (!userInfo) {
    return null;
  }
  return (
    <div className={memberPreviewContainer}>
      <Avatar
        name={userInfo.removed ? undefined : (userInfo.name ?? undefined)}
        className={avatar}
        url={!userInfo.removed ? userInfo.avatar : undefined}
        size={24}
      />
      <div className={memberName}>
        {userInfo.removed ? 'Deleted user' : userInfo.name || 'Unnamed'}
      </div>
    </div>
  );
};

const CreatedByCell = forwardRef(CreatedByCellComponent);

export const createdByPropertyConfig =
  createdByPropertyModelConfig.createPropertyMeta({
    icon: createIcon('MemberIcon'),
    cellRenderer: {
      view: uniReactRoot.createUniComponent(CreatedByCell),
    },
  });
