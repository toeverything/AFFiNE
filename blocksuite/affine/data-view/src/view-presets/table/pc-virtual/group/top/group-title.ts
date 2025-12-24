import { MoreHorizontalIcon, PlusIcon } from '@blocksuite/icons/lit';
import clsx from 'clsx';
import { nothing } from 'lit';
import { html } from 'lit/static-html.js';

import {
  type Group,
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
} from './group-title-css';

function GroupHeaderCount(group: Group) {
  const cards = group.rows;
  if (!cards.length) {
    return;
  }
  return html` <div class="${groupHeaderCount}">${cards.length}</div>`;
}

export const GroupTitle = (
  groupData: Group,
  ops: {
    groupHover: boolean;
    readonly: boolean;
    clickAdd: (evt: MouseEvent) => void;
    clickOps: (evt: MouseEvent) => void;
  }
) => {
  const view = groupData.view;
  const type = groupData.property.dataType$.value;
  if (!view || !type) {
    return nothing;
  }
  const icon =
    groupData.value == null
      ? ''
      : html` <uni-lit
          class="${groupHeaderIcon}"
          .uni="${groupData.property.icon}"
        ></uni-lit>`;
  const props: GroupRenderProps = {
    group: groupData,
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
      ${icon} ${renderUniLit(view, props)} ${columnName}
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
