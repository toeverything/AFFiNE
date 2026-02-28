import { Avatar, Popover, uniReactRoot } from '@affine/component';
import {
  type Cell,
  type CellRenderProps,
  createIcon,
  type DataViewCellLifeCycle,
  EditorHostKey,
} from '@blocksuite/affine/blocks/database';
import {
  UserListProvider,
  type UserListService,
  UserProvider,
  type UserService,
} from '@blocksuite/affine/shared/services';
import { computed, type ReadonlySignal } from '@preact/signals-core';
import {
  forwardRef,
  type ForwardRefRenderFunction,
  type ReactNode,
  useImperativeHandle,
  useMemo,
} from 'react';

import { useSignalValue } from '../../../../modules/doc-info/utils';
import { useMemberInfo } from '../../hooks/use-member-info';
import type {
  MemberCellJsonValueType,
  MemberCellRawValueType,
  MemberItemType,
} from './define';
import { memberPropertyModelConfig } from './define';
import { MultiMemberSelect } from './multi-member-select';
import * as styles from './style.css';

class MemberManager {
  private readonly cell: Cell<
    MemberCellRawValueType,
    MemberCellJsonValueType,
    {}
  >;
  readonly selectCurrentCell: (editing: boolean) => void;
  readonly isEditing: ReadonlySignal<boolean>;
  public readonly userService?: UserService | null;
  public readonly userListService?: UserListService | null;

  memberList = computed(() => this.cell.value$.value ?? []);

  get readonly() {
    return this.cell.property.readonly$;
  }

  constructor(
    props: CellRenderProps<{}, MemberCellRawValueType, MemberCellJsonValueType>
  ) {
    this.cell = props.cell;
    this.selectCurrentCell = props.selectCurrentCell;
    this.isEditing = props.isEditing$;
    const host = this.cell.view.serviceGet(EditorHostKey);
    this.userService = host?.std.getOptional(UserProvider);
    this.userListService = host?.std.getOptional(UserListProvider);
  }

  setMemberList = (memberList: MemberItemType[]): void => {
    this.cell.valueSet(memberList);
  };
}

const MemberCellComponent: ForwardRefRenderFunction<
  DataViewCellLifeCycle,
  CellRenderProps<{}, MemberCellRawValueType, MemberCellJsonValueType>
> = (props, ref): ReactNode => {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const manager = useMemo(() => new MemberManager(props), []);

  useImperativeHandle(
    ref,
    () => ({
      beforeEnterEditMode: () => {
        return true;
      },
      beforeExitEditingMode: () => {},
      afterEnterEditingMode: () => {},
      focusCell: () => true,
      blurCell: () => true,
      forceUpdate: () => {},
    }),
    []
  );

  const memberList = useSignalValue(manager.memberList);
  const isEditing = useSignalValue(manager.isEditing);

  const renderPopoverContent = () => {
    if (!manager.userService || !manager.userListService) {
      return (
        <div className={styles.memberPopoverContainer}>
          member list only works in cloud
        </div>
      );
    }
    return (
      <MultiMemberSelect
        multiple
        value={manager.memberList}
        onChange={newIds => {
          manager.setMemberList(newIds);
        }}
        userService={manager.userService}
        userListService={manager.userListService}
        onComplete={() => {
          //   manager.selectCurrentCell(false);
        }}
      />
    );
  };
  return (
    <div style={{ overflow: 'hidden' }}>
      <Popover
        open={isEditing}
        onOpenChange={open => {
          manager.selectCurrentCell(open);
        }}
        contentOptions={{
          className: styles.memberPopoverContent,
        }}
        content={renderPopoverContent()}
      >
        <div></div>
      </Popover>
      <div className={styles.cellContainer}>
        {memberList.map(memberId => (
          <MemberPreview
            key={memberId}
            memberId={memberId}
            memberManager={manager}
          />
        ))}
      </div>
    </div>
  );
};

const MemberPreview = ({
  memberId,
  memberManager,
}: {
  memberId: string;
  memberManager: MemberManager;
}) => {
  const userInfo = useMemberInfo(memberId, memberManager.userService);
  if (!userInfo) {
    return null;
  }
  return (
    <div className={styles.memberPreviewContainer}>
      <Avatar
        name={userInfo.removed ? undefined : (userInfo.name ?? undefined)}
        className={styles.avatar}
        url={!userInfo.removed ? userInfo.avatar : undefined}
        size={24}
      />
      <div className={styles.memberName}>
        {userInfo.removed ? 'Deleted user' : userInfo.name || 'Unnamed'}
      </div>
    </div>
  );
};

const MemberCell = forwardRef(MemberCellComponent);

export const memberPropertyConfig =
  memberPropertyModelConfig.createPropertyMeta({
    icon: createIcon('MultiPeopleIcon'),
    cellRenderer: {
      view: uniReactRoot.createUniComponent(MemberCell),
    },
  });
