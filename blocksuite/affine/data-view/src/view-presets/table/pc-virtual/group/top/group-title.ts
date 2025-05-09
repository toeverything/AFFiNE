import { MoreHorizontalIcon, PlusIcon } from '@blocksuite/icons/lit';
import clsx from 'clsx';
import { nothing } from 'lit';
import { html } from 'lit/static-html.js';

import {
  type GroupData,
  type GroupRenderProps,
  renderUniLit,
} from '../../../../../core';
import {
  groupHeaderCount,
  groupHeaderIcon,
  groupHeaderOp,
  groupHeaderOps,
  groupHeaderTitle,
  groupTitleRow,
  show,
} from './group-title.css';

function GroupHeaderCount(group: GroupData) {
  const cards = group.rows;
  if (!cards.length) {
    return;
  }
  return html` <div class="${groupHeaderCount}">${cards.length}</div>`;
}

export const GroupTitle = (
  groupData: GroupData,
  ops: {
    groupHover: boolean;
    readonly: boolean;
    clickAdd: (evt: MouseEvent) => void;
    clickOps: (evt: MouseEvent) => void;
  }
) => {
  const data = groupData.manager.config$.value;
  if (!data) return nothing;
  const icon =
    groupData.value == null
      ? ''
      : html` <uni-lit
          class="${groupHeaderIcon}"
          .uni="${groupData.manager.property$.value?.icon}"
        ></uni-lit>`;
  const props: GroupRenderProps = {
    value: groupData.value,
    data: groupData.property.data$.value,
    updateData: groupData.manager.updateData,
    updateValue: value =>
      groupData.manager.updateValue(
        groupData.rows.map(row => row.rowId),
        value
      ),
    readonly: ops.readonly,
  };

  const showColumnName = groupData.property.type$.value === 'checkbox';
  const columnName = showColumnName
    ? html`<span class="${groupHeaderTitle}"
        >${groupData.property.name$.value}</span
      >`
    : nothing;
  const opsClass = clsx(ops.groupHover && show, groupHeaderOps);
  return html`
    <div class="${groupTitleRow}">
      ${icon} ${renderUniLit(data.view, props)} ${columnName}
      ${GroupHeaderCount(groupData)}
    </div>
    ${!ops.readonly
      ? html` <div class="${opsClass}">
          <div @click="${ops.clickAdd}" class="${groupHeaderOp}">
            ${PlusIcon()}
          </div>
          <div @click="${ops.clickOps}" class="${groupHeaderOp}">
            ${MoreHorizontalIcon()}
          </div>
        </div>`
      : nothing}
  `;
};
