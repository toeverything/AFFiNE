import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import { css } from '@emotion/css';
import { format } from 'date-fns/format';
import { html } from 'lit';

import { createdTimePropertyModelConfig } from './define.js';
const createdTimeCellStyle = css({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '100%',
});

const textStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
});

export class CreatedTimeCell extends BaseCellRenderer<number, number> {
  renderContent() {
    const formattedDate = this.value
      ? format(this.value, 'yyyy-MM-dd HH:mm:ss')
      : '';
    return html`<div class="${textStyle}">${formattedDate}</div>`;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add(createdTimeCellStyle);
  }

  override beforeEnterEditMode() {
    return false;
  }

  override render() {
    return html`<div class="date-container">${this.renderContent()}</div>`;
  }
}

export const createdTimeColumnConfig =
  createdTimePropertyModelConfig.createPropertyMeta({
    icon: createIcon('DateTimeIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(CreatedTimeCell),
    },
  });
