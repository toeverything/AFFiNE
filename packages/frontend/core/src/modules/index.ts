import { configureQuotaModule } from '@affine/core/modules/quota';
import { type Framework } from '@toeverything/infra';

import {
  configureAIButtonModule,
  configureAIDraftModule,
  configureAIModelModule,
  configureAIPlaygroundModule,
  configureAIReasoningModule,
  configureAIToolsConfigModule,
} from './ai-button';
import { configureAppSidebarModule } from './app-sidebar';
import { configAtMenuConfigModule } from './at-menu-config';
import { configureBlobManagementModule } from './blob-management';
import { configureCloudModule } from './cloud';
import { configureCollectionModule } from './collection';
import { configureCollectionRulesModule } from './collection-rules';
import { configureCommentModule } from './comment';
import { configureWorkspaceDBModule } from './db';
import { configureDialogModule } from './dialogs';
import { configureDndModule } from './dnd';
import { configureDocModule } from './doc';
import { configureDocDisplayMetaModule } from './doc-display-meta';
import { configureDocInfoModule } from './doc-info';
import { configureDocLinksModule } from './doc-link';
import { configureDocSummaryModule } from './doc-summary';
import { configureDocsSearchModule } from './docs-search';
import { configureEditorModule } from './editor';
import { configureEditorSettingModule } from './editor-setting';
import { configureExplorerIconModule } from './explorer-icon';
import { configureFavoriteModule } from './favorite';
import { configureFeatureFlagModule } from './feature-flag';
import { configureGlobalContextModule } from './global-context';
import { configureI18nModule } from './i18n';
import { configureIconPickerModule } from './icon-picker';
import { configureImportClipperModule } from './import-clipper';
import { configureImportTemplateModule } from './import-template';
import { configureIntegrationModule } from './integration';
import { configureJournalModule } from './journal';
import { configureLifecycleModule } from './lifecycle';
import { configureMediaModule } from './media';
import { configureNavigationModule } from './navigation';
import { configureNavigationPanelModule } from './navigation-panel';
import { configureNotificationModule } from './notification';
import { configureOpenInApp } from './open-in-app';
import { configureOrganizeModule } from './organize';
import { configurePaywallModule } from './paywall';
import { configurePDFModule } from './pdf';
import { configurePeekViewModule } from './peek-view';
import { configurePermissionsModule } from './permissions';
import { configureQuickSearchModule } from './quicksearch';
import { configSearchMenuModule } from './search-menu';
import { configureShareDocsModule } from './share-doc';
import { configureShareSettingModule } from './share-setting';
import {
  configureCommonGlobalStorageImpls,
  configureStorageModule,
} from './storage';
import { configureSystemFontFamilyModule } from './system-font-family';
import { configureTagModule } from './tag';
import { configureTelemetryModule } from './telemetry';
import { configureTemplateDocModule } from './template-doc';
import { configureAppThemeModule } from './theme';
import { configureThemeEditorModule } from './theme-editor';
import { configureUrlModule } from './url';
import { configureUserspaceModule } from './userspace';
import { configureWorkspaceModule } from './workspace';
import { configureIndexerEmbeddingModule } from './workspace-indexer-embedding';
import { configureWorkspacePropertyModule } from './workspace-property';

export function configureCommonModules(framework: Framework) {
  configureI18nModule(framework);
  configureWorkspaceModule(framework);
  configureDocModule(framework);
  configureWorkspaceDBModule(framework);
  configureStorageModule(framework);
  configureGlobalContextModule(framework);
  configureLifecycleModule(framework);
  configureFeatureFlagModule(framework);
  configureCollectionModule(framework);
  configureNavigationModule(framework);
  configureTagModule(framework);
  configureCloudModule(framework);
  configureQuotaModule(framework);
  configurePermissionsModule(framework);
  configureShareDocsModule(framework);
  configureShareSettingModule(framework);
  configureTelemetryModule(framework);
  configurePDFModule(framework);
  configurePeekViewModule(framework);
  configureExplorerIconModule(framework);
  configureDocDisplayMetaModule(framework);
  configureQuickSearchModule(framework);
  configureDocsSearchModule(framework);
  configureDocLinksModule(framework);
  configureOrganizeModule(framework);
  configureFavoriteModule(framework);
  configureNavigationPanelModule(framework);
  configureThemeEditorModule(framework);
  configureEditorModule(framework);
  configureSystemFontFamilyModule(framework);
  configureEditorSettingModule(framework);
  configureImportTemplateModule(framework);
  configureUserspaceModule(framework);
  configureAppSidebarModule(framework);
  configureJournalModule(framework);
  configureUrlModule(framework);
  configureAppThemeModule(framework);
  configureDialogModule(framework);
  configureDocInfoModule(framework);
  configureOpenInApp(framework);
  configAtMenuConfigModule(framework);
  configSearchMenuModule(framework);
  configureDndModule(framework);
  configureCommonGlobalStorageImpls(framework);
  configureAIReasoningModule(framework);
  configureAIPlaygroundModule(framework);
  configureAIButtonModule(framework);
  configureAIDraftModule(framework);
  configureAIToolsConfigModule(framework);
  configureAIModelModule(framework);
  configureTemplateDocModule(framework);
  configureBlobManagementModule(framework);
  configureMediaModule(framework);
  configureImportClipperModule(framework);
  configureNotificationModule(framework);
  configureIntegrationModule(framework);
  configureWorkspacePropertyModule(framework);
  configureCollectionRulesModule(framework);
  configureIndexerEmbeddingModule(framework);
  configureCommentModule(framework);
  configureDocSummaryModule(framework);
  configurePaywallModule(framework);
  configureIconPickerModule(framework);
}
