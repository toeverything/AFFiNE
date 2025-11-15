import type { Command } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

type Role = 'content' | 'hub';

/**
 * Get the last block with specified roles and flavours in the document
 *
 * @param ctx - Command context
 * @param ctx.root - The root note block model
 * @param ctx.role - The roles to match, can be string or string array. If not provided, default to all supported roles.
 * @param ctx.flavour - The flavours to match, can be string or string array. If not provided, match any flavour.
 * @param next - Next handler function
 * @returns The last block model matched or null
 */
export const getLastBlockCommand: Command<
  {
    root?: BlockModel;
    role?: Role | Role[];
    flavour?: string | string[];
  },
  {
    lastBlock: BlockModel | null;
  }
> = (ctx, next) => {
  const root = ctx.root || ctx.std.host.store.root;
  if (!root) {
    next({
      lastBlock: null,
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

  const children = root.children;
  for (let i = children.length - 1; i >= 0; i--) {
    const roleMatches = rolesToMatch.includes(children[i].role);

    const flavourMatches =
      !flavoursToMatch || flavoursToMatch.includes(children[i].flavour);

    // Both role and flavour must match
    if (roleMatches && flavourMatches) {
      next({
        lastBlock: children[i],
      });
      return;
    }
  }

  next({
    lastBlock: null,
  });
};
