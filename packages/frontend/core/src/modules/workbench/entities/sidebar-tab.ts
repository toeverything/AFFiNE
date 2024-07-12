import { Entity } from '@toeverything/infra';

export class SidebarTab extends Entity<{ id: string }> {
  readonly id = this.props.id;
}
