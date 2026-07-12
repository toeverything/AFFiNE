import { createLitPortal } from '@blocksuite/affine/components/portal';
import { EditorChevronDown } from '@blocksuite/affine/components/toolbar';
import { AttachmentBlockModel } from '@blocksuite/affine/model';
import {
  type ToolbarContext,
  type ToolbarModuleConfig,
} from '@blocksuite/affine/shared/services';
import {
  CommentIcon,
  EditIcon,
  EmbedIcon,
  HistoryIcon,
  LockIcon,
  OpenInNewIcon,
  PenIcon,
  ViewIcon,
} from '@blocksuite/icons/lit';
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

import { OnlyOfficeVersionPanel } from './version-panel';

// Office document extensions that OnlyOffice can edit. Self-contained here to
// avoid coupling to other parts of the app.
const OFFICE_EXTS = new Set([
  'doc',
  'docx',
  'docm',
  'dot',
  'dotx',
  'odt',
  'ott',
  'rtf',
  'xls',
  'xlsx',
  'xlsm',
  'ods',
  'ots',
  'csv',
  'ppt',
  'pptx',
  'pptm',
  'odp',
  'otp',
]);

function isOfficeAttachment(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return OFFICE_EXTS.has(ext);
}

// The interaction modes offered in the dropdown. `mode` is forwarded to the
// standalone editor page, which forwards it to the config endpoint.
// `writable` modes can change content and are hidden when the doc is read-only
// (e.g. a workspace shared with read-only access).
const MODES: Array<{
  mode: string;
  label: string;
  icon: unknown;
  writable: boolean;
}> = [
  { mode: 'edit', label: 'Edit', icon: EditIcon(), writable: true },
  {
    mode: 'review',
    label: 'Track changes (review)',
    icon: PenIcon(),
    writable: true,
  },
  {
    mode: 'comment',
    label: 'Comment only',
    icon: CommentIcon(),
    writable: true,
  },
  { mode: 'fillForms', label: 'Fill forms', icon: EditIcon(), writable: true },
  {
    mode: 'view',
    label: 'Read-only (no copy/print)',
    icon: LockIcon(),
    writable: false,
  },
  {
    mode: 'embedded',
    label: 'Embedded preview',
    icon: EmbedIcon(),
    writable: false,
  },
  {
    mode: 'mobile',
    label: 'Mobile / touch',
    icon: ViewIcon(),
    writable: false,
  },
];

function buildEditorUrl(
  workspaceId: string,
  blobId: string,
  filename: string,
  mode: string,
  docId: string,
  blockId: string
): string {
  // Read the current UI language from the main document so the editor matches
  // AFFiNE (applyDocumentLanguage keeps <html lang> in sync). Passed to every
  // mode, fixing the previous "only edit mode was localized" gap.
  const lang = document.documentElement.lang || '';
  const search = new URLSearchParams({ filename, mode });
  if (lang) search.set('lang', lang);
  // docId + blockId scope the OnlyOffice document key to THIS attachment
  // instance, so two attachments sharing the same blob don't share an editing
  // session / cache (which would leak one's edits into the other).
  search.set('docId', docId);
  search.set('blockId', blockId);
  // Same-origin path; the standalone editor page reads the session cookie.
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/onlyoffice/editor/${encodeURIComponent(blobId)}?${search.toString()}`;
}

function openOnlyOffice(ctx: ToolbarContext, mode: string): void {
  const model = ctx.getCurrentModelByType(AttachmentBlockModel);
  if (!model) return;
  const sourceId = model.props.sourceId;
  if (!sourceId) return;
  const workspaceId = ctx.workspace.id;
  const store = ctx.store;
  const url = buildEditorUrl(
    workspaceId,
    sourceId,
    model.props.name,
    mode,
    store.id,
    model.id
  );

  // NOTE: must NOT use 'noopener' — the standalone editor page needs
  // window.opener to post the save result back here.
  const win = window.open(url, '_blank');
  if (!win) return;

  // Listen for the save-back message and repoint the attachment to the new
  // content-addressed blob. blobSync.get(newId) lazily fetches it from the
  // server (the backend already stored it), so download/size become correct.
  const onMessage = (e: MessageEvent) => {
    // Bind to the actual popup window, not just same-origin, so another
    // same-origin window/tab can't forge a save-back and mutate the block.
    if (e.source !== win) return;
    if (e.origin !== window.location.origin) return;
    const d = e.data;
    if (
      !d ||
      d.type !== 'affine-onlyoffice-saved' ||
      d.workspaceId !== workspaceId ||
      d.originalBlobId !== sourceId ||
      typeof d.blobId !== 'string'
    ) {
      return;
    }
    try {
      const update: Record<string, unknown> = { sourceId: d.blobId };
      if (typeof d.size === 'number') update.size = d.size;
      store.updateBlock(model, update);
      // No deletion here: every saved version is kept and managed from the
      // version-history panel (switch / delete), per the version model.
    } catch {
      // ignore — model may have been removed
    }
  };
  window.addEventListener('message', onMessage);

  // Clean up the listener once the editor window closes.
  const timer = setInterval(() => {
    if (win.closed) {
      clearInterval(timer);
      window.removeEventListener('message', onMessage);
    }
  }, 2000);
}

/**
 * Open the in-app version-history panel (a popover, not a new window) for the
 * current attachment. Switching repoints the block directly in this same
 * context, so it takes effect immediately.
 */
function openVersionHistory(ctx: ToolbarContext): void {
  const model = ctx.getCurrentModelByType(AttachmentBlockModel);
  if (!model) return;
  const sourceId = model.props.sourceId;
  if (!sourceId) return;
  const workspaceId = ctx.workspace.id;
  const store = ctx.store;
  const docId = store.id;
  const blockId = model.id;

  const abortController = new AbortController();
  const panel = new OnlyOfficeVersionPanel();
  panel.workspaceId = workspaceId;
  panel.docId = docId;
  panel.blockId = blockId;
  panel.blobId = sourceId;
  panel.currentBlobId = sourceId;
  panel.onSwitch = (blobId: string, size: number) => {
    try {
      const update: Record<string, unknown> = { sourceId: blobId };
      if (typeof size === 'number') update.size = size;
      store.updateBlock(model, update);
    } catch {
      // ignore — model may have been removed
    }
  };
  panel.onClose = () => abortController.abort();

  // Centered modal overlay — no anchor element (the dropdown item that
  // triggered it is detached once the menu closes, which broke positioning).
  createLitPortal({
    template: panel,
    container: document.body,
    abortController,
    closeOnClickAway: false,
  });
}

// PLACEHOLDER_CONFIG
/**
 * Toolbar dropdown: opens the current office attachment in the standalone
 * OnlyOffice editor page (new window/tab) with the selected interaction mode.
 */
export const onlyofficeToolbarConfig = {
  actions: [
    {
      id: 'z.onlyoffice',
      when(ctx: ToolbarContext) {
        const model = ctx.getCurrentModelByType(AttachmentBlockModel);
        if (!model) return false;
        return !!model.props.sourceId && isOfficeAttachment(model.props.name);
      },
      content(ctx: ToolbarContext) {
        const model = ctx.getCurrentModelByType(AttachmentBlockModel);
        if (!model || !model.props.sourceId) return null;
        if (!isOfficeAttachment(model.props.name)) return null;

        // Respect the doc/share permission: when the doc is read-only (e.g. a
        // workspace shared with read-only access), only offer view-oriented
        // modes. Editable shares get the full set (edit + comment + ...).
        // The backend independently enforces this via Workspace.Blobs.Write.
        const readonly = ctx.readonly;
        const modes = readonly ? MODES.filter(m => !m.writable) : MODES;
        const defaultMode = readonly ? 'view' : 'edit';

        return html`
          <editor-icon-button
            aria-label="Open with OnlyOffice"
            .tooltip="${'Open with OnlyOffice'}"
            @click=${() => openOnlyOffice(ctx, defaultMode)}
          >
            ${OpenInNewIcon()}
            <span class="label">OnlyOffice</span>
          </editor-icon-button>
          <editor-menu-button
            aria-label="OnlyOffice modes"
            .contentPadding="${'8px'}"
            .button=${html`
              <editor-icon-button aria-label="OnlyOffice modes">
                ${EditorChevronDown}
              </editor-icon-button>
            `}
          >
            <div data-orientation="vertical">
              ${repeat(
                modes,
                m => m.mode,
                m => html`
                  <editor-menu-action
                    aria-label=${m.label}
                    @click=${() => openOnlyOffice(ctx, m.mode)}
                  >
                    ${m.icon}
                    <div class="label">${m.label}</div>
                  </editor-menu-action>
                `
              )}
              <editor-menu-action
                aria-label="Version history"
                @click=${() => openVersionHistory(ctx)}
              >
                ${HistoryIcon()}
                <div class="label">Version history</div>
              </editor-menu-action>
            </div>
          </editor-menu-button>
        `;
      },
    },
  ],
} as const satisfies ToolbarModuleConfig;
