import type { Command } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

type Role = 'content' | 'hub';

/**
 * Get the first block with specified roles and flavours in the document
 *
 * @param ctx - Command context
 * @param ctx.root - The root note block model
 * @param ctx.role - The roles to match, can be string or string array. If not provided, default to all supported roles.
 * @param ctx.flavour - The flavours to match, can be string or string array. If not provided, match any flavour.
 * @param next - Next handler function
 * @returns The first block model matched or null
 */
export const getFirstBlockCommand: Command<
  {
    root?: BlockModel;
    role?: Role | Role[];
    flavour?: string | string[];
  },
  {
    firstBlock: BlockModel | null;
  }
> = (ctx, next) => {
  const root = ctx.root || ctx.std.host.store.root;
  if (!root) {
    next({
      firstBlock: null,
    });
    return;
  }

  const defaultRoles = ['content', 'hub'];

  const rolesToMatch = ctx.role
    ? Array.isArray(ctx.role)
      ? ctx.role
      : [ctx.role]
    : defaultRoles;

  const flavoursToMatch = ctx.flavour
    ? Array.isArray(ctx.flavour)
      ? ctx.flavour
      : [ctx.flavour]
    : null;

  for (const child of root.children) {
    const roleMatches = rolesToMatch.includes(child.role);

    const flavourMatches =
      !flavoursToMatch || flavoursToMatch.includes(child.flavour);

    if (roleMatches && flavourMatches) {
      next({
        firstBlock: child,
      });
      return;
    }
  }

  next({
    firstBlock: null,
  });
};
