// @ts-check

/**
 * First-frame discoverable write-only accessibility semantic subtree for the
 * Web Mobile thin host (`#a11y-tree`).
 *
 * - Exposes a discoverable initial semantic entry on frame 1 without waiting
 *   for screen-reader detection heuristics.
 * - Incrementally patches `role`, `aria-label`, `aria-selected`, and `tabindex`
 *   on non-visual DOM nodes inside `#a11y-tree`.
 * - Enforces strict focus mutual exclusion across `#a11y-tree`, `#ime`, and
 *   `#embed-layer` to prevent screen-reader double announcements.
 */

/**
 * @typedef {'none' | 'a11y' | 'ime' | 'embed'} FocusOwner
 */

/**
 * @typedef {Object} A11yNodeDescriptor
 * @property {string} id
 * @property {string} role
 * @property {string} label
 * @property {boolean} [selected]
 * @property {number} [tabIndex]
 * @property {string | null} [parentId]
 * @property {boolean} [expanded]
 * @property {boolean} [disabled]
 */

/**
 * @typedef {Object} A11yPatchOp
 * @property {'upsert' | 'remove'} op
 * @property {string} id
 * @property {A11yNodeDescriptor} [node]
 */

const DEFAULT_ENTRY_ID = 'workspace-entry';

/**
 * @param {HTMLElement | null | undefined} el
 * @param {string} name
 * @param {string | null} value
 */
function setOrRemoveAttr(el, name, value) {
  if (!el) {
    return;
  }
  if (value === null || value === undefined) {
    el.removeAttribute?.(name);
  } else {
    el.setAttribute?.(name, value);
  }
}

/**
 * Creates the write-only ARIA semantic subtree controller bound to `#a11y-tree`,
 * `#ime`, and `#embed-layer`.
 *
 * @param {Object} options
 * @param {Document} options.doc
 * @param {HTMLElement} options.root
 * @param {HTMLTextAreaElement | null} [options.ime]
 * @param {HTMLElement | null} [options.embedLayer]
 * @param {string} [options.workspaceLabel='AFFiNE workspace']
 */
export function createA11yTree(options) {
  const { doc, root } = options;
  const ime = options.ime || null;
  const embedLayer = options.embedLayer || null;
  const workspaceLabel = options.workspaceLabel || 'AFFiNE workspace';

  /** @type {Map<string, { el: HTMLElement, state: A11yNodeDescriptor }>} */
  const nodes = new Map();
  /** @type {FocusOwner} */
  let focusOwner = 'a11y';
  /** @type {string | null} */
  let activeNodeId = null;

  /**
   * Applies incremental attribute updates to a single semantic node.
   *
   * @param {HTMLElement} el
   * @param {A11yNodeDescriptor} prev
   * @param {A11yNodeDescriptor} next
   */
  function patchAttributes(el, prev, next) {
    if (prev.role !== next.role) {
      setOrRemoveAttr(el, 'role', next.role);
    }
    if (prev.label !== next.label) {
      setOrRemoveAttr(el, 'aria-label', next.label);
    }
    if (prev.selected !== next.selected) {
      setOrRemoveAttr(
        el,
        'aria-selected',
        next.selected === undefined ? null : String(Boolean(next.selected))
      );
    }
    if (prev.expanded !== next.expanded) {
      setOrRemoveAttr(
        el,
        'aria-expanded',
        next.expanded === undefined ? null : String(Boolean(next.expanded))
      );
    }
    if (prev.disabled !== next.disabled) {
      setOrRemoveAttr(
        el,
        'aria-disabled',
        next.disabled === undefined ? null : String(Boolean(next.disabled))
      );
    }
    const nextTabIndex =
      typeof next.tabIndex === 'number' ? next.tabIndex : undefined;
    const prevTabIndex =
      typeof prev.tabIndex === 'number' ? prev.tabIndex : undefined;
    const a11yActive = focusOwner === 'a11y' || focusOwner === 'none';
    if (!a11yActive) {
      setOrRemoveAttr(el, 'tabindex', '-1');
    } else if (prevTabIndex !== nextTabIndex) {
      setOrRemoveAttr(
        el,
        'tabindex',
        nextTabIndex === undefined ? null : String(nextTabIndex)
      );
    }
  }

  /**
   * Upserts a semantic node by ID using incremental attribute diffing.
   *
   * @param {A11yNodeDescriptor} descriptor
   */
  function upsertNode(descriptor) {
    const existing = nodes.get(descriptor.id);
    if (existing) {
      patchAttributes(existing.el, existing.state, descriptor);
      if (existing.state.parentId !== descriptor.parentId) {
        const nextParent =
          (descriptor.parentId && nodes.get(descriptor.parentId)?.el) || root;
        nextParent.append(existing.el);
      }
      existing.state = { ...descriptor };
      return existing.el;
    }

    const el = doc.createElement('div');
    setOrRemoveAttr(el, 'data-a11y-id', descriptor.id);
    setOrRemoveAttr(el, 'role', descriptor.role);
    setOrRemoveAttr(el, 'aria-label', descriptor.label);
    if (descriptor.selected !== undefined) {
      setOrRemoveAttr(
        el,
        'aria-selected',
        String(Boolean(descriptor.selected))
      );
    }
    if (descriptor.expanded !== undefined) {
      setOrRemoveAttr(
        el,
        'aria-expanded',
        String(Boolean(descriptor.expanded))
      );
    }
    if (descriptor.disabled !== undefined) {
      setOrRemoveAttr(
        el,
        'aria-disabled',
        String(Boolean(descriptor.disabled))
      );
    }
    const a11yActive = focusOwner === 'a11y' || focusOwner === 'none';
    if (!a11yActive) {
      setOrRemoveAttr(el, 'tabindex', '-1');
    } else if (typeof descriptor.tabIndex === 'number') {
      setOrRemoveAttr(el, 'tabindex', String(descriptor.tabIndex));
    }

    const parent =
      (descriptor.parentId && nodes.get(descriptor.parentId)?.el) || root;
    parent.append(el);
    nodes.set(descriptor.id, { el, state: { ...descriptor } });
    return el;
  }

  /**
   * Removes a semantic node by ID.
   *
   * @param {string} id
   */
  function removeNode(id) {
    const entry = nodes.get(id);
    if (!entry) {
      return false;
    }
    entry.el.remove?.();
    const toRemove = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [childId, childEntry] of nodes.entries()) {
        if (
          !toRemove.has(childId) &&
          childEntry.state.parentId &&
          toRemove.has(childEntry.state.parentId)
        ) {
          toRemove.add(childId);
          grew = true;
        }
      }
    }
    for (const removedId of toRemove) {
      nodes.delete(removedId);
      if (activeNodeId === removedId) {
        activeNodeId = null;
      }
    }
    return true;
  }

  /**
   * Applies an ordered batch of incremental upsert/remove patch operations.
   *
   * @param {A11yPatchOp[]} ops
   */
  function patch(ops) {
    for (const item of ops) {
      if (item.op === 'upsert' && item.node) {
        upsertNode(item.node);
      } else if (item.op === 'remove') {
        removeNode(item.id);
      }
    }
  }

  /**
   * Synchronizes `tabindex` on semantic child nodes when `#a11y-tree` enters or
   * leaves exclusive focus ownership so real keyboard `Tab`/`Shift+Tab` never
   * reaches hidden semantic nodes.
   *
   * @param {boolean} active
   */
  function syncChildTabIndexes(active) {
    for (const entry of nodes.values()) {
      if (active) {
        setOrRemoveAttr(
          entry.el,
          'tabindex',
          typeof entry.state.tabIndex === 'number'
            ? String(entry.state.tabIndex)
            : null
        );
      } else {
        setOrRemoveAttr(entry.el, 'tabindex', '-1');
      }
    }
  }

  /**
   * Synchronizes `inert` and iframe `tabindex` on `#embed-layer` so inactive
   * embeds are unreachable by keyboard Tab order.
   *
   * @param {boolean} active
   */
  function syncEmbedInteractivity(active) {
    if (!embedLayer) {
      return;
    }
    embedLayer.inert = !active;
    const children = embedLayer.children ? Array.from(embedLayer.children) : [];
    for (const child of children) {
      if (child && typeof child.setAttribute === 'function') {
        if (active) {
          child.removeAttribute?.('tabindex');
        } else {
          child.setAttribute('tabindex', '-1');
        }
      }
    }
  }

  /**
   * Switches exclusive focus ownership among `'a11y'`, `'ime'`, `'embed'`, and
   * `'none'` so screen readers and keyboard Tab order never expose two surfaces
   * simultaneously.
   *
   * @param {FocusOwner} nextOwner
   */
  function setFocusOwner(nextOwner) {
    focusOwner = nextOwner;

    if (nextOwner === 'ime') {
      root.inert = true;
      setOrRemoveAttr(root, 'aria-hidden', 'true');
      syncChildTabIndexes(false);
      setOrRemoveAttr(embedLayer, 'aria-hidden', 'true');
      syncEmbedInteractivity(false);
      setOrRemoveAttr(ime, 'aria-hidden', null);
      if (ime) {
        ime.tabIndex = 0;
        ime.readOnly = false;
      }
      return;
    }

    if (nextOwner === 'embed') {
      root.inert = true;
      setOrRemoveAttr(root, 'aria-hidden', 'true');
      syncChildTabIndexes(false);
      setOrRemoveAttr(ime, 'aria-hidden', 'true');
      setOrRemoveAttr(embedLayer, 'aria-hidden', null);
      syncEmbedInteractivity(true);
      if (ime) {
        ime.tabIndex = -1;
        ime.readOnly = true;
        ime.blur?.();
      }
      return;
    }

    if (nextOwner === 'a11y') {
      root.inert = false;
      setOrRemoveAttr(root, 'aria-hidden', null);
      syncChildTabIndexes(true);
      setOrRemoveAttr(ime, 'aria-hidden', 'true');
      setOrRemoveAttr(embedLayer, 'aria-hidden', 'true');
      syncEmbedInteractivity(false);
      if (ime) {
        ime.tabIndex = -1;
        ime.blur?.();
      }
      return;
    }

    root.inert = false;
    setOrRemoveAttr(root, 'aria-hidden', null);
    syncChildTabIndexes(true);
    setOrRemoveAttr(ime, 'aria-hidden', null);
    setOrRemoveAttr(embedLayer, 'aria-hidden', null);
    syncEmbedInteractivity(true);
    if (ime) {
      ime.tabIndex = 0;
      ime.readOnly = false;
    }
  }

  /**
   * Keyboard-reachable entry point that returns exclusive focus to the
   * workspace semantic entry node (`DEFAULT_ENTRY_ID`).
   */
  function activateA11yEntry() {
    return focusNode(DEFAULT_ENTRY_ID);
  }

  /**
   * Moves exclusive focus to a specific semantic node inside `#a11y-tree`.
   *
   * @param {string} id
   * @returns {boolean}
   */
  function focusNode(id) {
    const entry = nodes.get(id);
    if (!entry) {
      return false;
    }
    setFocusOwner('a11y');
    activeNodeId = id;
    if (entry.state.tabIndex === undefined) {
      setOrRemoveAttr(entry.el, 'tabindex', '0');
      entry.state.tabIndex = 0;
    }
    entry.el.focus?.({ preventScroll: true });
    return true;
  }

  // Mount the first-frame discoverable semantic entry immediately without
  // relying on screen-reader detection heuristics.
  setOrRemoveAttr(root, 'role', 'application');
  setOrRemoveAttr(root, 'aria-label', workspaceLabel);
  upsertNode({
    id: DEFAULT_ENTRY_ID,
    role: 'main',
    label: workspaceLabel,
    tabIndex: 0,
  });
  setFocusOwner('a11y');

  return {
    root,
    defaultEntryId: DEFAULT_ENTRY_ID,
    patch,
    upsertNode,
    removeNode,
    setFocusOwner,
    focusNode,
    activateA11yEntry,
    getFocusOwner: () => focusOwner,
    getActiveNodeId: () => activeNodeId,
    getNode: id => nodes.get(id)?.el || null,
    nodeCount: () => nodes.size,
  };
}
