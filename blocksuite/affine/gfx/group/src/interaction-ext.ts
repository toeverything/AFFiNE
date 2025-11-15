import { GroupElementModel } from '@blocksuite/affine-model';
import { InteractivityExtension } from '@blocksuite/std/gfx';

export class GroupInteractionExtension extends InteractivityExtension {
  static override key = 'group-selection';

  override mounted(): void {
    this.action.onElementSelect(context => {
      const { candidates, suggest } = context;
      const { activeGroup } = this.gfx.selection;
      let target = context.target;

      if (activeGroup && activeGroup.hasDescendant(target)) {
        const groups = target.groups;
        const activeGroupIdx = groups.indexOf(activeGroup);

        if (activeGroupIdx !== -1) {
          target =
            groups
              .slice(0, activeGroupIdx)
              .findLast(
                group =>
                  group instanceof GroupElementModel &&
                  candidates.includes(group)
              ) ?? target;
        }
      } else {
        const groups = target.groups;

        target =
          groups.findLast(group => {
            return (
              group instanceof GroupElementModel && candidates.includes(group)
            );
          }) ?? target;
      }

      if (target !== context.target) {
        suggest({
          id: target.id,
        });
      }
    });
  }
}
