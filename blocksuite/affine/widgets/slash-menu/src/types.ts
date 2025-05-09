import type { BlockStdScope } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';
import type { TemplateResult } from 'lit';

export type SlashMenuContext = {
  std: BlockStdScope;
  model: BlockModel;
};

export type SlashMenuTooltip = {
  figure: TemplateResult;
  caption: string;
};

type SlashMenuItemBase = {
  name: string;
  description?: string;
  icon?: TemplateResult;
  /**
   * This field defines sorting and grouping of menu items like VSCode.
   * The first number indicates the group index, the second number indicates the item index in the group.
   * The group name is the string between `_` and `@`.
   * You can find an example figure in https://code.visualstudio.com/api/references/contribution-points#menu-example
   */
  group?: `${number}_${string}@${number}`;

  searchAlias?: string[];
  /**
   * The condition to show the menu item.
   */
  when?: (ctx: SlashMenuContext) => boolean;
};

export type SlashMenuActionItem = SlashMenuItemBase & {
  action: (ctx: SlashMenuContext) => void;
  tooltip?: SlashMenuTooltip;
  /**
   * The alias of the menu item for search.
   */
  searchAlias?: string[];
};

export type SlashMenuSubMenu = SlashMenuItemBase & {
  subMenu: SlashMenuItem[];
};

export type SlashMenuItem = SlashMenuActionItem | SlashMenuSubMenu;

export type SlashMenuConfig = {
  /**
   * The items in the slash menu. It can be generated dynamically with the context.
   */
  items: SlashMenuItem[] | ((ctx: SlashMenuContext) => SlashMenuItem[]);

  /**
   * Slash menu will not be triggered when the condition is true.
   */
  disableWhen?: (ctx: SlashMenuContext) => boolean;
};
