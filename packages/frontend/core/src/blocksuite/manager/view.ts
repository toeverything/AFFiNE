import type { ReactToLit } from '@affine/component';
import { AIViewExtension } from '@affine/core/blocksuite/view-extensions/ai';
import { CloudViewExtension } from '@affine/core/blocksuite/view-extensions/cloud';
import { CodeBlockPreviewViewExtension } from '@affine/core/blocksuite/view-extensions/code-block-preview';
import { AffineDatabaseViewExtension } from '@affine/core/blocksuite/view-extensions/database';
import {
  EdgelessBlockHeaderConfigViewExtension,
  type EdgelessBlockHeaderViewOptions,
} from '@affine/core/blocksuite/view-extensions/edgeless-block-header';
import { AffineEditorConfigViewExtension } from '@affine/core/blocksuite/view-extensions/editor-config';
import { createDatabaseOptionsConfig } from '@affine/core/blocksuite/view-extensions/editor-config/database';
import { createLinkedWidgetConfig } from '@affine/core/blocksuite/view-extensions/editor-config/linked';
import {
  AffineEditorViewExtension,
  type AffineEditorViewOptions,
} from '@affine/core/blocksuite/view-extensions/editor-view/editor-view';
import { ElectronViewExtension } from '@affine/core/blocksuite/view-extensions/electron';
import { AffineLinkPreviewExtension } from '@affine/core/blocksuite/view-extensions/link-preview-service';
import { MobileViewExtension } from '@affine/core/blocksuite/view-extensions/mobile';
import { PdfViewExtension } from '@affine/core/blocksuite/view-extensions/pdf';
import { AffineThemeViewExtension } from '@affine/core/blocksuite/view-extensions/theme';
import { TurboRendererViewExtension } from '@affine/core/blocksuite/view-extensions/turbo-renderer';
import { PeekViewService } from '@affine/core/modules/peek-view';
import { DebugLogger } from '@affine/debug';
import { mixpanel } from '@affine/track';
import { DatabaseViewExtension } from '@blocksuite/affine/blocks/database/view';
import { ParagraphViewExtension } from '@blocksuite/affine/blocks/paragraph/view';
import type {
  PeekOptions,
  PeekViewService as BSPeekViewService,
} from '@blocksuite/affine/components/peek';
import { ViewExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalViewExtensions } from '@blocksuite/affine/extensions/view';
import { FoundationViewExtension } from '@blocksuite/affine/foundation/view';
import { AffineCanvasTextFonts } from '@blocksuite/affine/shared/services';
import { LinkedDocViewExtension } from '@blocksuite/affine/widgets/linked-doc/view';
import type { FrameworkProvider } from '@toeverything/infra';
import type { TemplateResult } from 'lit';

type Configure = {
  init: () => Configure;

  foundation: (framework?: FrameworkProvider) => Configure;
  editorView: (options?: AffineEditorViewOptions) => Configure;
  theme: (framework?: FrameworkProvider) => Configure;
  editorConfig: (framework?: FrameworkProvider) => Configure;
  edgelessBlockHeader: (options?: EdgelessBlockHeaderViewOptions) => Configure;
  database: (framework?: FrameworkProvider) => Configure;
  linkedDoc: (framework?: FrameworkProvider) => Configure;
  paragraph: (enableAI?: boolean) => Configure;
  cloud: (framework?: FrameworkProvider, enableCloud?: boolean) => Configure;
  turboRenderer: (enableTurboRenderer?: boolean) => Configure;
  pdf: (enablePDFEmbedPreview?: boolean, reactToLit?: ReactToLit) => Configure;
  mobile: (framework?: FrameworkProvider) => Configure;
  ai: (enable?: boolean, framework?: FrameworkProvider) => Configure;
  electron: (framework?: FrameworkProvider) => Configure;
  linkPreview: (framework?: FrameworkProvider) => Configure;
  codeBlockHtmlPreview: (framework?: FrameworkProvider) => Configure;

  value: ViewExtensionManager;
};

const peekViewLogger = new DebugLogger('affine::patch-peek-view-service');

class ViewProvider {
  static instance: ViewProvider | null = null;
  static getInstance() {
    if (!ViewProvider.instance) {
      ViewProvider.instance = new ViewProvider();
    }
    return ViewProvider.instance;
  }

  private readonly _manager: ViewExtensionManager;

  constructor() {
    this._manager = new ViewExtensionManager([
      ...getInternalViewExtensions(),

      AffineThemeViewExtension,
      AffineEditorViewExtension,
      AffineEditorConfigViewExtension,
      CodeBlockPreviewViewExtension,
      EdgelessBlockHeaderConfigViewExtension,
      TurboRendererViewExtension,
      CloudViewExtension,
      PdfViewExtension,
      MobileViewExtension,
      AIViewExtension,
      ElectronViewExtension,
      AffineLinkPreviewExtension,
      AffineDatabaseViewExtension,
    ]);
  }

  get value() {
    return this._manager;
  }

  get config(): Configure {
    return {
      init: this._initDefaultConfig,
      foundation: this._configureFoundation,
      editorView: this._configureEditorView,
      theme: this._configureTheme,
      editorConfig: this._configureEditorConfig,
      edgelessBlockHeader: this._configureEdgelessBlockHeader,
      database: this._configureDatabase,
      linkedDoc: this._configureLinkedDoc,
      paragraph: this._configureParagraph,
      cloud: this._configureCloud,
      turboRenderer: this._configureTurboRenderer,
      pdf: this._configurePdf,
      mobile: this._configureMobile,
      ai: this._configureAI,
      electron: this._configureElectron,
      linkPreview: this._configureLinkPreview,
      codeBlockHtmlPreview: this._configureCodeBlockHtmlPreview,
      value: this._manager,
    };
  }

  private readonly _initDefaultConfig = () => {
    this.config
      .foundation()
      .theme()
      .editorView()
      .editorConfig()
      .edgelessBlockHeader()
      .database()
      .linkedDoc()
      .paragraph()
      .cloud()
      .turboRenderer()
      .pdf()
      .mobile()
      .ai()
      .electron()
      .linkPreview()
      .codeBlockHtmlPreview();

    return this.config;
  };

  private readonly _configureFoundation = (framework?: FrameworkProvider) => {
    const peekViewService = framework?.get(PeekViewService);

    this._manager.configure(FoundationViewExtension, {
      telemetry: {
        track: (eventName, props) => {
          mixpanel.track(eventName, props);
        },
      },
      fontConfig: AffineCanvasTextFonts.map(font => ({
        ...font,
        url: environment.publicPath + 'fonts/' + font.url.split('/').pop(),
      })),
      peekView: !peekViewService
        ? undefined
        : ({
            peek: (
              element: {
                target: HTMLElement;
                docId: string;
                blockIds?: string[];
                template?: TemplateResult;
              },
              options?: PeekOptions
            ) => {
              peekViewLogger.debug('center peek', element);
              const { template, target, ...props } = element;

              return peekViewService.peekView.open(
                {
                  element: target,
                  docRef: props,
                },
                template,
                options?.abortSignal
              );
            },
          } satisfies BSPeekViewService),
    });

    return this.config;
  };

  private readonly _configureEditorView = (
    options?: AffineEditorViewOptions
  ) => {
    this._manager.configure(AffineEditorViewExtension, options);
    return this.config;
  };

  private readonly _configureTheme = (framework?: FrameworkProvider) => {
    this._manager.configure(AffineThemeViewExtension, { framework });
    return this.config;
  };

  private readonly _configureEditorConfig = (framework?: FrameworkProvider) => {
    this._manager.configure(AffineEditorConfigViewExtension, { framework });
    return this.config;
  };

  private readonly _configureEdgelessBlockHeader = (
    options?: EdgelessBlockHeaderViewOptions
  ) => {
    this._manager.configure(EdgelessBlockHeaderConfigViewExtension, options);
    return this.config;
  };

  private readonly _configureDatabase = (framework?: FrameworkProvider) => {
    if (framework) {
      this._manager.configure(
        DatabaseViewExtension,
        createDatabaseOptionsConfig(framework)
      );
    }
    return this.config;
  };

  private readonly _configureLinkedDoc = (framework?: FrameworkProvider) => {
    if (framework) {
      this._manager.configure(
        LinkedDocViewExtension,
        createLinkedWidgetConfig(framework)
      );
    }
    return this.config;
  };

  private readonly _configureParagraph = (enableAI?: boolean) => {
    if (BUILD_CONFIG.isMobileEdition) {
      this._manager.configure(ParagraphViewExtension, {
        getPlaceholder: model => {
          const placeholders = {
            text: '',
            h1: 'Heading 1',
            h2: 'Heading 2',
            h3: 'Heading 3',
            h4: 'Heading 4',
            h5: 'Heading 5',
            h6: 'Heading 6',
            quote: '',
          };
          return placeholders[model.props.type] ?? '';
        },
      });
    } else if (enableAI) {
      this._manager.configure(ParagraphViewExtension, {
        getPlaceholder: model => {
          const placeholders = {
            text: "Type '/' for commands, 'space' for AI",
            h1: 'Heading 1',
            h2: 'Heading 2',
            h3: 'Heading 3',
            h4: 'Heading 4',
            h5: 'Heading 5',
            h6: 'Heading 6',
            quote: '',
          };
          return placeholders[model.props.type] ?? '';
        },
      });
    }
    return this.config;
  };

  private readonly _configureCloud = (
    framework?: FrameworkProvider,
    enableCloud?: boolean
  ) => {
    this._manager.configure(CloudViewExtension, { framework, enableCloud });
    return this.config;
  };

  private readonly _configureTurboRenderer = (
    enableTurboRenderer?: boolean
  ) => {
    this._manager.configure(TurboRendererViewExtension, {
      enableTurboRenderer,
    });
    return this.config;
  };

  private readonly _configurePdf = (
    enablePDFEmbedPreview?: boolean,
    reactToLit?: ReactToLit
  ) => {
    this._manager.configure(PdfViewExtension, {
      enablePDFEmbedPreview,
      reactToLit,
    });
    return this.config;
  };

  private readonly _configureMobile = (framework?: FrameworkProvider) => {
    this._manager.configure(MobileViewExtension, { framework });
    return this.config;
  };

  private readonly _configureAI = (
    enable?: boolean,
    framework?: FrameworkProvider
  ) => {
    this._manager.configure(AIViewExtension, { framework, enable });
    return this.config;
  };

  private readonly _configureElectron = (framework?: FrameworkProvider) => {
    this._manager.configure(ElectronViewExtension, { framework });
    return this.config;
  };

  private readonly _configureLinkPreview = (framework?: FrameworkProvider) => {
    this._manager.configure(AffineLinkPreviewExtension, { framework });
    return this.config;
  };

  private readonly _configureCodeBlockHtmlPreview = (
    framework?: FrameworkProvider
  ) => {
    this._manager.configure(CodeBlockPreviewViewExtension, { framework });
    return this.config;
  };
}

export function getViewManager() {
  return ViewProvider.getInstance();
}
