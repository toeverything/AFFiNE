/* eslint-disable @typescript-eslint/no-restricted-imports */
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/button-group/button-group.js';
import '@shoelace-style/shoelace/dist/components/color-picker/color-picker.js';
import '@shoelace-style/shoelace/dist/components/divider/divider.js';
import '@shoelace-style/shoelace/dist/components/dropdown/dropdown.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/icon-button/icon-button.js';
import '@shoelace-style/shoelace/dist/components/menu/menu.js';
import '@shoelace-style/shoelace/dist/components/menu-item/menu-item.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/themes/light.css';
import '@shoelace-style/shoelace/dist/themes/dark.css';
import './left-side-panel.js';

import { PresentTool } from '@blocksuite/affine/blocks/frame';
import { ExportManager } from '@blocksuite/affine/blocks/surface';
import { toast } from '@blocksuite/affine/components/toast';
import { StoreExtensionManagerIdentifier } from '@blocksuite/affine/ext-loader';
import {
  BlockSuiteError,
  ErrorCode,
} from '@blocksuite/affine/global/exceptions';
import type { SerializedXYWH } from '@blocksuite/affine/global/gfx';
import { ColorScheme, type DocMode } from '@blocksuite/affine/model';
import {
  defaultImageProxyMiddleware,
  docLinkBaseURLMiddleware,
  HtmlAdapterFactoryIdentifier,
  MarkdownAdapterFactoryIdentifier,
  PlainTextAdapterFactoryIdentifier,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import { DocModeProvider } from '@blocksuite/affine/shared/services';
import {
  ColorVariables,
  FontFamilyVariables,
  SizeVariables,
  StyleVariables,
} from '@blocksuite/affine/shared/theme';
import {
  openFilesWith,
  openSingleFileWith,
  printToPdf,
} from '@blocksuite/affine/shared/utils';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import {
  type DeltaInsert,
  Text,
  type Workspace,
} from '@blocksuite/affine/store';
import {
  createAssetsArchive,
  download,
  HtmlTransformer,
  MarkdownTransformer,
  NotionHtmlTransformer,
  ZipTransformer,
} from '@blocksuite/affine/widgets/linked-doc';
import { NotionHtmlAdapter } from '@blocksuite/affine-shared/adapters';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { TestAffineEditorContainer } from '@blocksuite/integration-test';
import type { SlDropdown } from '@shoelace-style/shoelace';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
import { css, html } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import * as lz from 'lz-string';
import type { Pane } from 'tweakpane';

import type { CommentPanel } from '../../comment/index.js';
import { createTestEditor } from '../../starter/utils/extensions.js';
import { mockEdgelessTheme } from '../mock-services.js';
import type { CustomAdapterPanel } from './custom-adapter-panel.js';
import type { CustomFramePanel } from './custom-frame-panel.js';
import type { CustomOutlinePanel } from './custom-outline-panel.js';
import type { CustomOutlineViewer } from './custom-outline-viewer.js';
import type { DocsPanel } from './docs-panel.js';
import type { LeftSidePanel } from './left-side-panel.js';

const basePath =
  'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.11.2/dist';
setBasePath(basePath);

const OTHER_CSS_VARIABLES = StyleVariables.filter(
  variable =>
    !SizeVariables.includes(variable) &&
    !ColorVariables.includes(variable) &&
    !FontFamilyVariables.includes(variable)
);
let styleDebugMenuLoaded = false;

function initStyleDebugMenu(
  styleMenu: Pane,
  { writer, reader }: Record<'writer' | 'reader', CSSStyleDeclaration>
) {
  const sizeFolder = styleMenu.addFolder({ title: 'Size', expanded: false });
  const fontFamilyFolder = styleMenu.addFolder({
    title: 'Font Family',
    expanded: false,
  });
  const colorFolder = styleMenu.addFolder({ title: 'Color', expanded: false });
  const othersFolder = styleMenu.addFolder({
    title: 'Others',
    expanded: false,
  });
  SizeVariables.forEach(name => {
    const value = reader.getPropertyValue(name);
    sizeFolder
      .addBinding(
        {
          [name]: isNaN(parseFloat(value)) ? 0 : parseFloat(value),
        },
        name,
        {
          min: 0,
          max: 100,
        }
      )
      .on('change', e => {
        writer.setProperty(name, `${Math.round(e.value)}px`);
      });
  });
  FontFamilyVariables.forEach(name => {
    const value = reader.getPropertyValue(name);
    fontFamilyFolder
      .addBinding(
        {
          [name]: value,
        },
        name
      )
      .on('change', e => {
        writer.setProperty(name, e.value);
      });
  });
  OTHER_CSS_VARIABLES.forEach(name => {
    const value = reader.getPropertyValue(name);
    othersFolder.addBinding({ [name]: value }, name).on('change', e => {
      writer.setProperty(name, e.value);
    });
  });
  fontFamilyFolder
    .addBinding(
      {
        '--affine-font-family':
          'Roboto Mono, apple-system, BlinkMacSystemFont,Helvetica Neue, Tahoma, PingFang SC, Microsoft Yahei, Arial,Hiragino Sans GB, sans-serif, Apple Color Emoji, Segoe UI Emoji,Segoe UI Symbol, Noto Color Emoji',
      },
      '--affine-font-family'
    )
    .on('change', e => {
      writer.setProperty('--affine-font-family', e.value);
    });
  ColorVariables.forEach(name => {
    const value = reader.getPropertyValue(name);
    colorFolder.addBinding({ [name]: value }, name).on('change', e => {
      writer.setProperty(name, e.value);
    });
  });
}

function getDarkModeConfig(): boolean {
  const updatedDarkModeConfig = localStorage.getItem('blocksuite:dark');
  if (updatedDarkModeConfig !== null) {
    return updatedDarkModeConfig === 'true';
  }

  const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
  return matchMedia.matches;
}

interface AdapterResult {
  file: string;
  assetsIds: string[];
}

type AdapterFactoryIdentifier =
  | typeof HtmlAdapterFactoryIdentifier
  | typeof MarkdownAdapterFactoryIdentifier
  | typeof PlainTextAdapterFactoryIdentifier;

interface AdapterConfig {
  identifier: AdapterFactoryIdentifier;
  fileExtension: string; // file extension need to be lower case with dot prefix, e.g. '.md', '.txt', '.html'
  contentType: string;
  indexFileName: string;
}

@customElement('starter-debug-menu')
export class StarterDebugMenu extends ShadowlessElement {
  static override styles = css`
    :root {
      --sl-font-size-medium: var(--affine-font-xs);
      --sl-input-font-size-small: var(--affine-font-xs);
    }

    .dg.ac {
      z-index: 1001 !important;
    }
  `;

  private readonly _darkModeChange = (e: MediaQueryListEvent) => {
    this._setThemeMode(!!e.matches);
  };

  private readonly _handleDocsPanelClose = () => {
    this.leftSidePanel.toggle(this.docsPanel);
  };

  private _showStyleDebugMenu = false;

  private _styleMenu!: Pane;

  get doc() {
    return this.editor.doc;
  }

  get mode() {
    return this.editor.mode;
  }

  set mode(value: DocMode) {
    this.editor.mode = value;
  }

  private _addNote() {
    const rootModel = this.doc.root;
    if (!rootModel) return;
    const rootId = rootModel.id;

    this.doc.captureSync();

    const count = rootModel.children.length;
    const xywh: SerializedXYWH = `[0,${count * 60},800,95]`;

    const noteId = this.doc.addBlock('affine:note', { xywh }, rootId);
    this.doc.addBlock('affine:paragraph', {}, noteId);
  }

  private async _clearSiteData() {
    await fetch('/Clear-Site-Data');
    window.location.reload();
  }

  private _enableOutlineViewer() {
    this.outlineViewer.toggleDisplay();
  }

  private async _exportFile(config: AdapterConfig) {
    const doc = this.editor.doc;
    const job = doc.getTransformer([
      docLinkBaseURLMiddleware(this.collection.id),
      titleMiddleware(this.collection.meta.docMetas),
    ]);

    const adapterFactory = this.editor.std.provider.get(config.identifier);
    const adapter = adapterFactory.get(job);
    const result = (await adapter.fromDoc(doc)) as AdapterResult;

    if (!result || (!result.file && !result.assetsIds.length)) {
      return;
    }

    const docTitle = doc.meta?.title || 'Untitled';
    const contentBlob = new Blob([result.file], { type: config.contentType });

    let downloadBlob: Blob;
    let name: string;

    if (result.assetsIds.length > 0) {
      if (!job.assets) {
        throw new BlockSuiteError(ErrorCode.ValueNotExists, 'No assets found');
      }
      const zip = await createAssetsArchive(job.assets, result.assetsIds);
      await zip.file(config.indexFileName, contentBlob);
      downloadBlob = await zip.generate();
      name = `${docTitle}.zip`;
    } else {
      downloadBlob = contentBlob;
      name = `${docTitle}${config.fileExtension}`;
    }

    download(downloadBlob, name);
  }

  private async _exportHtml() {
    await this._exportFile({
      identifier: HtmlAdapterFactoryIdentifier,
      fileExtension: '.html',
      contentType: 'text/html',
      indexFileName: 'index.html',
    });
  }

  /**
   * Export markdown file using markdown adapter factory extension
   */
  private async _exportMarkDown() {
    await this._exportFile({
      identifier: MarkdownAdapterFactoryIdentifier,
      fileExtension: '.md',
      contentType: 'text/plain',
      indexFileName: 'index.md',
    });
  }

  private _exportPdf() {
    this.editor.std.get(ExportManager).exportPdf().catch(console.error);
  }

  /**
   * Export plain text file using plain text adapter factory extension
   */
  private async _exportPlainText() {
    await this._exportFile({
      identifier: PlainTextAdapterFactoryIdentifier,
      fileExtension: '.txt',
      contentType: 'text/plain',
      indexFileName: 'index.txt',
    });
  }

  private _exportPng() {
    this.editor.std.get(ExportManager).exportPng().catch(console.error);
  }

  private async _exportSnapshot() {
    await ZipTransformer.exportDocs(
      this.collection,
      this.editor.doc.schema,
      Array.from(this.collection.docs.values()).map(collection =>
        collection.getStore()
      )
    );
  }

  private _getStoreManager() {
    return this.editor.std.get(StoreExtensionManagerIdentifier);
  }

  private async _importHTML() {
    try {
      const files = await openFilesWith('Html');

      if (!files) return;

      const pageIds: string[] = [];
      for (const file of files) {
        const text = await file.text();
        const fileName = file.name.split('.').slice(0, -1).join('.');
        const pageId = await HtmlTransformer.importHTMLToDoc({
          collection: this.collection,
          schema: this.editor.doc.schema,
          html: text,
          fileName,
          extensions: this._getStoreManager().get('store'),
        });
        if (pageId) {
          pageIds.push(pageId);
        }
      }
      if (!this.editor.host) return;
      toast(
        this.editor.host,
        `Successfully imported ${pageIds.length} HTML files.`
      );
    } catch (error) {
      console.error(' Import HTML files failed:', error);
    }
  }

  private async _importHTMLZip() {
    try {
      const file = await openSingleFileWith('Zip');
      if (!file) return;
      const result = await HtmlTransformer.importHTMLZip({
        collection: this.collection,
        schema: this.editor.doc.schema,
        imported: file,
        extensions: this._getStoreManager().get('store'),
      });
      if (!this.editor.host) return;
      toast(
        this.editor.host,
        `Successfully imported ${result.length} HTML files.`
      );
    } catch (error) {
      console.error('Import HTML zip files failed:', error);
    }
  }

  private async _importMarkdown() {
    try {
      const files = await openFilesWith('Markdown');

      if (!files) return;

      const pageIds: string[] = [];
      for (const file of files) {
        const text = await file.text();
        const fileName = file.name.split('.').slice(0, -1).join('.');
        const pageId = await MarkdownTransformer.importMarkdownToDoc({
          collection: this.collection,
          schema: this.editor.doc.schema,
          markdown: text,
          fileName,
          extensions: this._getStoreManager().get('store'),
        });
        if (pageId) {
          pageIds.push(pageId);
        }
      }
      if (!this.editor.host) return;
      toast(
        this.editor.host,
        `Successfully imported ${pageIds.length} markdown files.`
      );
    } catch (error) {
      console.error(' Import markdown files failed:', error);
    }
  }

  private async _importMarkdownZip() {
    try {
      const file = await openSingleFileWith('Zip');
      if (!file) return;
      const result = await MarkdownTransformer.importMarkdownZip({
        collection: this.collection,
        schema: this.editor.doc.schema,
        imported: file,
        extensions: this._getStoreManager().get('store'),
      });
      if (!this.editor.host) return;
      toast(
        this.editor.host,
        `Successfully imported ${result.length} markdown files.`
      );
    } catch (error) {
      console.error('Import markdown zip files failed:', error);
    }
  }

  private async _importNotionHTML() {
    try {
      const file = await openSingleFileWith('Html');
      if (!file) return;
      const doc = this.editor.doc;
      const job = doc.getTransformer([defaultImageProxyMiddleware]);
      const htmlAdapter = new NotionHtmlAdapter(job, this.editor.std.provider);
      await htmlAdapter.toDoc({
        file: await file.text(),
        pageId: this.collection.idGenerator(),
        assets: job.assetsManager,
      });
    } catch (error) {
      console.error('Failed to import Notion HTML:', error);
    }
  }

  private async _importNotionHTMLZip() {
    try {
      const file = await openSingleFileWith('Zip');
      if (!file) return;
      const result = await NotionHtmlTransformer.importNotionZip({
        collection: this.collection,
        schema: this.editor.doc.schema,
        imported: file,
        extensions: this._getStoreManager().get('store'),
      });
      if (!this.editor.host) return;
      toast(
        this.editor.host,
        `Successfully imported ${result.pageIds.length} Notion HTML pages.`
      );
    } catch (error) {
      console.error('Failed to import Notion HTML Zip:', error);
    }
  }

  private _importSnapshot() {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', '.zip');
    input.multiple = false;
    input.onchange = async () => {
      const file = input.files?.item(0);
      if (!file) {
        return;
      }
      try {
        const docs = await ZipTransformer.importDocs(
          this.collection,
          this.editor.doc.schema,
          file
        );
        for (const doc of docs) {
          if (doc) {
            const noteBlock = window.doc.getModelsByFlavour('affine:note');
            window.doc.addBlock(
              'affine:paragraph',
              {
                type: 'text',
                text: new Text([
                  {
                    insert: ' ',
                    attributes: {
                      reference: {
                        type: 'LinkedPage',
                        pageId: doc.id,
                      },
                    },
                  } as DeltaInsert<AffineTextAttributes>,
                ]),
              },
              noteBlock[0].id
            );
          }
        }
        this.requestUpdate();
      } catch (e) {
        console.error('Invalid snapshot.');
        console.error(e);
      } finally {
        input.remove();
      }
    };
    input.click();
  }

  private _insertTransitionStyle(classKey: string, duration: number) {
    const $html = document.documentElement;
    const $style = document.createElement('style');
    const slCSSKeys = ['sl-transition-x-fast'];
    $style.innerHTML = `html.${classKey} * { transition: all ${duration}ms 0ms linear !important; } :root { ${slCSSKeys.map(
      key => `--${key}: ${duration}ms`
    )} }`;

    $html.append($style);
    $html.classList.add(classKey);

    setTimeout(() => {
      $style.remove();
      $html.classList.remove(classKey);
    }, duration);
  }

  private _present() {
    if (!this.editor.std || !this.editor.host) return;
    const gfx = this.editor.std.get(GfxControllerIdentifier);
    gfx.tool.setTool(PresentTool, {
      mode: 'fit',
    });
  }

  private _print() {
    printToPdf().catch(console.error);
  }

  private _setThemeMode(dark: boolean) {
    const html = document.querySelector('html');

    this._dark = dark;
    localStorage.setItem('blocksuite:dark', dark ? 'true' : 'false');
    if (!html) return;
    html.dataset.theme = dark ? 'dark' : 'light';

    this._insertTransitionStyle('color-transition', 0);

    if (dark) {
      html.classList.add('dark');
      html.classList.add('sl-theme-dark');
    } else {
      html.classList.remove('dark');
      html.classList.remove('sl-theme-dark');
    }

    const theme = dark ? ColorScheme.Dark : ColorScheme.Light;
    mockEdgelessTheme.setTheme(theme);
  }

  private _shareSelection() {
    const selection = this.editor.host?.selection.value;
    if (!selection || selection.length === 0) {
      return;
    }
    const json = selection.map(sel => sel.toJSON());
    const hash = lz.compressToEncodedURIComponent(JSON.stringify(json));
    const url = new URL(window.location.toString());
    url.searchParams.set('sel', hash);
    window.history.pushState({}, '', url);
  }

  private _switchEditorMode() {
    if (!this.editor.host) return;
    const newMode = this.mode === 'page' ? 'edgeless' : 'page';
    const docModeService = this.editor.host.std.get(DocModeProvider);
    if (docModeService) {
      docModeService.setPrimaryMode(newMode, this.editor.doc.id);
    }
    this.mode = newMode;
  }

  private _switchOffsetMode() {
    this._hasOffset = !this._hasOffset;
  }

  private _toggleCommentPanel() {
    document.body.append(this.commentPanel);
  }

  private _toggleDarkMode() {
    this._setThemeMode(!this._dark);
  }

  private _toggleDocsPanel() {
    this.docsPanel.onClose = this._handleDocsPanelClose;
    this.leftSidePanel.toggle(this.docsPanel);
  }

  private _toggleFramePanel() {
    this.framePanel.toggleDisplay();
  }

  private _toggleAdapterPanel() {
    this.adapterPanel.toggleDisplay();
  }

  private _toggleMultipleEditors() {
    const app = document.querySelector('#app');
    if (app) {
      const currentEditorCount = app.querySelectorAll(
        'affine-editor-container'
      ).length;
      if (currentEditorCount === 1) {
        // Add a second editor
        const newEditor = createTestEditor(this.doc, this.collection);
        app.append(newEditor);
        app.childNodes.forEach(child => {
          if (child instanceof TestAffineEditorContainer) {
            child.style.flex = '1';
          }
        });
        (app as HTMLElement).style.display = 'flex';
      } else {
        // Remove the second editor
        const secondEditor = app.querySelectorAll('affine-editor-container')[1];
        if (secondEditor) {
          secondEditor.remove();
        }
        (app as HTMLElement).style.display = 'block';
      }
    }
  }

  private _toggleOutlinePanel() {
    this.outlinePanel.toggleDisplay();
  }

  private _toggleReadonly() {
    const doc = this.doc;
    doc.readonly = !doc.readonly;
  }

  private async _toggleStyleDebugMenu() {
    if (!styleDebugMenuLoaded) {
      styleDebugMenuLoaded = true;
      const { Pane } = await import('tweakpane');
      this._styleMenu = new Pane({ title: 'Waiting' });
      this._styleMenu.hidden = true;
      this._styleMenu.element.style.width = '650';
      initStyleDebugMenu(this._styleMenu, {
        writer: document.documentElement.style,
        reader: getComputedStyle(document.documentElement),
      });
    }

    this._showStyleDebugMenu = !this._showStyleDebugMenu;
    this._showStyleDebugMenu
      ? (this._styleMenu.hidden = false)
      : (this._styleMenu.hidden = true);
  }

  override connectedCallback() {
    super.connectedCallback();

    const readSelectionFromURL = async () => {
      const editorHost = this.editor.host;
      if (!editorHost) {
        await new Promise(resolve => {
          setTimeout(resolve, 500);
        });
        readSelectionFromURL().catch(console.error);
        return;
      }
      const url = new URL(window.location.toString());
      const sel = url.searchParams.get('sel');
      if (!sel) return;
      try {
        const json = JSON.parse(lz.decompressFromEncodedURIComponent(sel));
        editorHost.std.selection.fromJSON(json);
      } catch {
        return;
      }
    };
    readSelectionFromURL().catch(console.error);
  }

  override createRenderRoot() {
    this._setThemeMode(this._dark);

    const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
    matchMedia.addEventListener('change', this._darkModeChange);

    return this;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();

    const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
    matchMedia.removeEventListener('change', this._darkModeChange);
  }

  override firstUpdated() {
    this.doc.history.onUpdated.subscribe(() => {
      this._canUndo = this.doc.canUndo;
      this._canRedo = this.doc.canRedo;
    });

    this.editor.std.get(DocModeProvider).onPrimaryModeChange(() => {
      this.requestUpdate();
    }, this.editor.doc.id);
  }

  override render() {
    return html`
      <style>
        .debug-menu {
          display: flex;
          flex-wrap: nowrap;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          overflow: auto;
          z-index: 1000; /* for debug visibility */
          pointer-events: none;
        }

        @media print {
          .debug-menu {
            display: none;
          }
        }

        .default-toolbar {
          display: flex;
          gap: 5px;
          padding: 8px;
          width: 100%;
          min-width: 390px;
        }

        .default-toolbar > * {
          pointer-events: auto;
        }

        .edgeless-toolbar {
          align-items: center;
          margin-right: 17px;
          pointer-events: auto;
        }

        .edgeless-toolbar sl-select,
        .edgeless-toolbar sl-color-picker,
        .edgeless-toolbar sl-button {
          margin-right: 4px;
        }
      </style>
      <div class="debug-menu default">
        <div class="default-toolbar">
          <!-- undo/redo group -->
          <sl-button-group label="History">
            <!-- undo -->
            <sl-tooltip content="Undo" placement="bottom" hoist>
              <sl-button
                size="small"
                .disabled="${!this._canUndo}"
                @click="${() => this.doc.undo()}"
              >
                <sl-icon name="arrow-counterclockwise" label="Undo"></sl-icon>
              </sl-button>
            </sl-tooltip>
            <!-- redo -->
            <sl-tooltip content="Redo" placement="bottom" hoist>
              <sl-button
                size="small"
                .disabled="${!this._canRedo}"
                @click="${() => this.doc.redo()}"
              >
                <sl-icon name="arrow-clockwise" label="Redo"></sl-icon>
              </sl-button>
            </sl-tooltip>
          </sl-button-group>

          <!-- test operations -->
          <sl-dropdown id="test-operations-dropdown" placement="bottom" hoist>
            <sl-button size="small" slot="trigger" caret>
              Test Operations
            </sl-button>
            <sl-menu>
              <sl-menu-item @click="${this._print}">Print</sl-menu-item>
              <sl-menu-item>
                Export
                <sl-menu slot="submenu">
                  <sl-menu-item @click="${this._exportMarkDown}">
                    Export Markdown
                  </sl-menu-item>
                  <sl-menu-item @click="${this._exportHtml}">
                    Export HTML
                  </sl-menu-item>
                  <sl-menu-item @click="${this._exportPlainText}">
                    Export Plain Text
                  </sl-menu-item>
                  <sl-menu-item @click="${this._exportPdf}">
                    Export PDF
                  </sl-menu-item>
                  <sl-menu-item @click="${this._exportPng}">
                    Export PNG
                  </sl-menu-item>
                  <sl-menu-item @click="${this._exportSnapshot}">
                    Export Snapshot
                  </sl-menu-item>
                </sl-menu>
              </sl-menu-item>
              <sl-menu-item>
                Import
                <sl-menu slot="submenu">
                  <sl-menu-item @click="${this._importSnapshot}">
                    Import Snapshot
                  </sl-menu-item>
                  <sl-menu-item>
                    Import Notion HTML
                    <sl-menu slot="submenu">
                      <sl-menu-item @click="${this._importNotionHTML}">
                        Single Notion HTML Page
                      </sl-menu-item>
                      <sl-menu-item @click="${this._importNotionHTMLZip}">
                        Notion HTML Zip
                      </sl-menu-item>
                    </sl-menu>
                  </sl-menu-item>
                  <sl-menu-item>
                    Import Markdown
                    <sl-menu slot="submenu">
                      <sl-menu-item @click="${this._importMarkdown}">
                        Markdown Files
                      </sl-menu-item>
                      <sl-menu-item @click="${this._importMarkdownZip}">
                        Markdown Zip
                      </sl-menu-item>
                    </sl-menu>
                  </sl-menu-item>
                  <sl-menu-item>
                    Import HTML
                    <sl-menu slot="submenu">
                      <sl-menu-item @click="${this._importHTML}">
                        HTML Files
                      </sl-menu-item>
                      <sl-menu-item @click="${this._importHTMLZip}">
                        HTML Zip
                      </sl-menu-item>
                    </sl-menu>
                  </sl-menu-item>
                </sl-menu>
              </sl-menu-item>
              <sl-menu-item @click="${this._toggleStyleDebugMenu}">
                Toggle CSS Debug Menu
              </sl-menu-item>
              <sl-menu-item @click="${this._toggleReadonly}">
                Toggle Readonly
              </sl-menu-item>
              <sl-menu-item @click="${this._shareSelection}">
                Share Selection
              </sl-menu-item>
              <sl-menu-item @click="${this._switchOffsetMode}">
                Switch Offset Mode
              </sl-menu-item>
              <sl-menu-item @click="${this._toggleOutlinePanel}">
                Toggle Outline Panel
              </sl-menu-item>
              <sl-menu-item @click="${this._enableOutlineViewer}">
                Enable Outline Viewer
              </sl-menu-item>
              <sl-menu-item @click="${this._toggleFramePanel}">
                Toggle Frame Panel
              </sl-menu-item>
              <sl-menu-item @click="${this._toggleCommentPanel}">
                Toggle Comment Panel
              </sl-menu-item>
              <sl-menu-item @click="${this._addNote}"> Add Note </sl-menu-item>
              <sl-menu-item @click="${this._toggleMultipleEditors}">
                Toggle Multiple Editors
              </sl-menu-item>
              <sl-menu-item @click="${this._toggleAdapterPanel}">
                Toggle Adapter Panel
              </sl-menu-item>
            </sl-menu>
          </sl-dropdown>

          <sl-tooltip content="Switch Editor" placement="bottom" hoist>
            <sl-button size="small" @click="${this._switchEditorMode}">
              <sl-icon name="repeat"></sl-icon>
            </sl-button>
          </sl-tooltip>

          <sl-tooltip content="Clear Site Data" placement="bottom" hoist>
            <sl-button size="small" @click="${this._clearSiteData}">
              <sl-icon name="trash"></sl-icon>
            </sl-button>
          </sl-tooltip>

          <sl-tooltip
            content="Toggle ${this._dark ? 'Light' : 'Dark'} Mode"
            placement="bottom"
            hoist
          >
            <sl-button size="small" @click="${this._toggleDarkMode}">
              <sl-icon
                name="${this._dark ? 'moon' : 'brightness-high'}"
              ></sl-icon>
            </sl-button>
          </sl-tooltip>

          <sl-tooltip
            content="Enter presentation mode"
            placement="bottom"
            hoist
          >
            <sl-button size="small" @click="${this._present}">
              <sl-icon name="easel"></sl-icon>
            </sl-button>
          </sl-tooltip>

          <sl-button
            data-testid="docs-button"
            size="small"
            @click="${this._toggleDocsPanel}"
            data-docs-panel-toggle
          >
            Docs
          </sl-button>
        </div>
      </div>
    `;
  }

  override update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('_hasOffset')) {
      const appRoot = document.getElementById('app');
      if (!appRoot) return;
      const style: Partial<CSSStyleDeclaration> = this._hasOffset
        ? {
            margin: '60px 40px 240px 40px',
            overflow: 'auto',
            height: '400px',
            boxShadow: '0 0 10px 0 rgba(0, 0, 0, 0.2)',
          }
        : {
            margin: '0',
            overflow: 'initial',
            // edgeless needs the container height
            height: '100%',
            boxShadow: 'initial',
          };
      Object.assign(appRoot.style, style);
    }
    super.update(changedProperties);
  }

  @state()
  private accessor _canRedo = false;

  @state()
  private accessor _canUndo = false;

  @state()
  private accessor _dark = getDarkModeConfig();

  @state()
  private accessor _hasOffset = false;

  @query('#block-type-dropdown')
  accessor blockTypeDropdown!: SlDropdown;

  @property({ attribute: false })
  accessor collection!: Workspace;

  @property({ attribute: false })
  accessor commentPanel!: CommentPanel;

  @property({ attribute: false })
  accessor docsPanel!: DocsPanel;

  @property({ attribute: false })
  accessor editor!: TestAffineEditorContainer;

  @property({ attribute: false })
  accessor framePanel!: CustomFramePanel;

  @property({ attribute: false })
  accessor adapterPanel!: CustomAdapterPanel;

  @property({ attribute: false })
  accessor leftSidePanel!: LeftSidePanel;

  @property({ attribute: false })
  accessor outlinePanel!: CustomOutlinePanel;

  @property({ attribute: false })
  accessor outlineViewer!: CustomOutlineViewer;

  @property({ attribute: false })
  accessor readonly = false;
}

declare global {
  interface HTMLElementTagNameMap {
    'starter-debug-menu': StarterDebugMenu;
  }
}
