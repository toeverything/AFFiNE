import type { Framework } from '@toeverything/infra';

import { DocsService } from '../doc';
import { DocsSearchService } from '../docs-search';
import { FavoriteService } from '../favorite';
import { ShareDocsListService } from '../share-doc';
import { TagService } from '../tag';
import { WorkspaceScope } from '../workspace';
import { WorkspacePropertyService } from '../workspace-property';
import { CheckboxPropertyFilterProvider } from './impls/filters/checkbox';
import { CreatedAtFilterProvider } from './impls/filters/created-at';
import { CreatedByFilterProvider } from './impls/filters/created-by';
import { DatePropertyFilterProvider } from './impls/filters/date';
import { DocPrimaryModeFilterProvider } from './impls/filters/doc-primary-mode';
import { EdgelessThemeFilterProvider } from './impls/filters/edgeless-theme';
import { EmptyJournalFilterProvider } from './impls/filters/empty-journal';
import { FavoriteFilterProvider } from './impls/filters/favorite';
import { IntegrationTypeFilterProvider } from './impls/filters/integration-type';
import { JournalFilterProvider } from './impls/filters/journal';
import { NumberPropertyFilterProvider } from './impls/filters/number';
import { PageWidthFilterProvider } from './impls/filters/page-width';
import { PropertyFilterProvider } from './impls/filters/property';
import { SharedFilterProvider } from './impls/filters/shared';
import { SystemFilterProvider } from './impls/filters/system';
import { TagsFilterProvider } from './impls/filters/tags';
import { TemplateFilterProvider } from './impls/filters/template';
import { TextPropertyFilterProvider } from './impls/filters/text';
import { TitleFilterProvider } from './impls/filters/title';
import { TrashFilterProvider } from './impls/filters/trash';
import { UpdatedAtFilterProvider } from './impls/filters/updated-at';
import { UpdatedByFilterProvider } from './impls/filters/updated-by';
import { CheckboxPropertyGroupByProvider } from './impls/group-by/checkbox';
import { CreatedAtGroupByProvider } from './impls/group-by/created-at';
import { CreatedByGroupByProvider } from './impls/group-by/created-by';
import { DatePropertyGroupByProvider } from './impls/group-by/date';
import { DocPrimaryModeGroupByProvider } from './impls/group-by/doc-primary-mode';
import { EdgelessThemeGroupByProvider } from './impls/group-by/edgeless-theme';
import { IntegrationTypeGroupByProvider } from './impls/group-by/integration-type';
import { JournalGroupByProvider } from './impls/group-by/journal';
import { NumberPropertyGroupByProvider } from './impls/group-by/number';
import { PageWidthGroupByProvider } from './impls/group-by/page-width';
import { PropertyGroupByProvider } from './impls/group-by/property';
import { SystemGroupByProvider } from './impls/group-by/system';
import { TagsGroupByProvider } from './impls/group-by/tags';
import { TemplateGroupByProvider } from './impls/group-by/template';
import { TextPropertyGroupByProvider } from './impls/group-by/text';
import { UpdatedAtGroupByProvider } from './impls/group-by/updated-at';
import { UpdatedByGroupByProvider } from './impls/group-by/updated-by';
import { CheckboxPropertyOrderByProvider } from './impls/order-by/checkbox';
import { CreatedAtOrderByProvider } from './impls/order-by/created-at';
import { CreatedByOrderByProvider } from './impls/order-by/created-by';
import { DatePropertyOrderByProvider } from './impls/order-by/date';
import { DocPrimaryModeOrderByProvider } from './impls/order-by/doc-primary-mode';
import { EdgelessThemeOrderByProvider } from './impls/order-by/edgeless-theme';
import { IntegrationTypeOrderByProvider } from './impls/order-by/integration-type';
import { JournalOrderByProvider } from './impls/order-by/journal';
import { NumberPropertyOrderByProvider } from './impls/order-by/number';
import { PageWidthOrderByProvider } from './impls/order-by/page-width';
import { PropertyOrderByProvider } from './impls/order-by/property';
import { SystemOrderByProvider } from './impls/order-by/system';
import { TagsOrderByProvider } from './impls/order-by/tags';
import { TemplateOrderByProvider } from './impls/order-by/template';
import { TextPropertyOrderByProvider } from './impls/order-by/text';
import { TitleOrderByProvider } from './impls/order-by/title';
import { UpdatedAtOrderByProvider } from './impls/order-by/updated-at';
import { UpdatedByOrderByProvider } from './impls/order-by/updated-by';
import { FilterProvider, GroupByProvider, OrderByProvider } from './provider';
import { CollectionRulesService } from './services/collection-rules';

export { CollectionRulesService } from './services/collection-rules';
export type { FilterParams } from './types';

export function configureCollectionRulesModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(CollectionRulesService)
    // --------------- Filter ---------------
    .impl(FilterProvider('system'), SystemFilterProvider)
    .impl(FilterProvider('property'), PropertyFilterProvider, [
      WorkspacePropertyService,
    ])
    .impl(FilterProvider('property:checkbox'), CheckboxPropertyFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:text'), TextPropertyFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:number'), NumberPropertyFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:tags'), TagsFilterProvider, [
      TagService,
      DocsService,
    ])
    .impl(FilterProvider('system:tags'), TagsFilterProvider, [
      TagService,
      DocsService,
    ])
    .impl(
      FilterProvider('property:docPrimaryMode'),
      DocPrimaryModeFilterProvider,
      [DocsService]
    )
    .impl(
      FilterProvider('system:docPrimaryMode'),
      DocPrimaryModeFilterProvider,
      [DocsService]
    )
    .impl(FilterProvider('system:trash'), TrashFilterProvider, [DocsService])
    .impl(FilterProvider('property:date'), DatePropertyFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:createdAt'), CreatedAtFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:createdAt'), CreatedAtFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:updatedAt'), UpdatedAtFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:updatedAt'), UpdatedAtFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:journal'), JournalFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:journal'), JournalFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:createdBy'), CreatedByFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:createdBy'), CreatedByFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:updatedBy'), UpdatedByFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:updatedBy'), UpdatedByFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:empty-journal'), EmptyJournalFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:favorite'), FavoriteFilterProvider, [
      FavoriteService,
      DocsService,
    ])
    .impl(FilterProvider('system:shared'), SharedFilterProvider, [
      ShareDocsListService,
      DocsService,
    ])
    .impl(FilterProvider('system:title'), TitleFilterProvider, [
      DocsSearchService,
    ])
    .impl(
      FilterProvider('system:integrationType'),
      IntegrationTypeFilterProvider,
      [DocsService]
    )
    .impl(
      FilterProvider('property:edgelessTheme'),
      EdgelessThemeFilterProvider,
      [DocsService]
    )
    .impl(FilterProvider('system:edgelessTheme'), EdgelessThemeFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:template'), TemplateFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:template'), TemplateFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('property:pageWidth'), PageWidthFilterProvider, [
      DocsService,
    ])
    .impl(FilterProvider('system:pageWidth'), PageWidthFilterProvider, [
      DocsService,
    ])
    // --------------- Group By ---------------
    .impl(GroupByProvider('system'), SystemGroupByProvider)
    .impl(GroupByProvider('property'), PropertyGroupByProvider, [
      WorkspacePropertyService,
    ])
    .impl(GroupByProvider('property:date'), DatePropertyGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('property:tags'), TagsGroupByProvider, [
      DocsService,
      TagService,
    ])
    .impl(GroupByProvider('system:tags'), TagsGroupByProvider, [
      DocsService,
      TagService,
    ])
    .impl(
      GroupByProvider('property:checkbox'),
      CheckboxPropertyGroupByProvider,
      [DocsService]
    )
    .impl(GroupByProvider('property:text'), TextPropertyGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('property:number'), NumberPropertyGroupByProvider, [
      DocsService,
    ])
    .impl(
      GroupByProvider('property:docPrimaryMode'),
      DocPrimaryModeGroupByProvider,
      [DocsService]
    )
    .impl(
      GroupByProvider('system:docPrimaryMode'),
      DocPrimaryModeGroupByProvider,
      [DocsService]
    )
    .impl(GroupByProvider('property:createdAt'), CreatedAtGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('system:createdAt'), CreatedAtGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('property:updatedAt'), UpdatedAtGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('system:updatedAt'), UpdatedAtGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('property:journal'), JournalGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('system:journal'), JournalGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('property:createdBy'), CreatedByGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('system:createdBy'), CreatedByGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('property:updatedBy'), UpdatedByGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('system:updatedBy'), UpdatedByGroupByProvider, [
      DocsService,
    ])
    .impl(
      GroupByProvider('system:integrationType'),
      IntegrationTypeGroupByProvider,
      [DocsService]
    )
    .impl(
      GroupByProvider('property:edgelessTheme'),
      EdgelessThemeGroupByProvider,
      [DocsService]
    )
    .impl(
      GroupByProvider('system:edgelessTheme'),
      EdgelessThemeGroupByProvider,
      [DocsService]
    )
    .impl(GroupByProvider('property:pageWidth'), PageWidthGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('system:pageWidth'), PageWidthGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('property:template'), TemplateGroupByProvider, [
      DocsService,
    ])
    .impl(GroupByProvider('system:template'), TemplateGroupByProvider, [
      DocsService,
    ])
    // --------------- Order By ---------------
    .impl(OrderByProvider('system'), SystemOrderByProvider)
    .impl(OrderByProvider('property'), PropertyOrderByProvider, [
      WorkspacePropertyService,
    ])
    .impl(
      OrderByProvider('property:docPrimaryMode'),
      DocPrimaryModeOrderByProvider,
      [DocsService]
    )
    .impl(
      OrderByProvider('system:docPrimaryMode'),
      DocPrimaryModeOrderByProvider,
      [DocsService]
    )
    .impl(OrderByProvider('property:updatedAt'), UpdatedAtOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('system:updatedAt'), UpdatedAtOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('property:createdAt'), CreatedAtOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('system:createdAt'), CreatedAtOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('property:text'), TextPropertyOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('property:number'), NumberPropertyOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('property:date'), DatePropertyOrderByProvider, [
      DocsService,
    ])
    .impl(
      OrderByProvider('property:checkbox'),
      CheckboxPropertyOrderByProvider,
      [DocsService]
    )
    .impl(OrderByProvider('property:tags'), TagsOrderByProvider, [
      DocsService,
      TagService,
    ])
    .impl(OrderByProvider('system:tags'), TagsOrderByProvider, [
      DocsService,
      TagService,
    ])
    .impl(OrderByProvider('property:journal'), JournalOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('system:journal'), JournalOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('property:createdBy'), CreatedByOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('system:createdBy'), CreatedByOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('property:updatedBy'), UpdatedByOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('system:updatedBy'), UpdatedByOrderByProvider, [
      DocsService,
    ])
    .impl(
      OrderByProvider('system:integrationType'),
      IntegrationTypeOrderByProvider,
      [DocsService]
    )
    .impl(
      OrderByProvider('property:edgelessTheme'),
      EdgelessThemeOrderByProvider,
      [DocsService]
    )
    .impl(
      OrderByProvider('system:edgelessTheme'),
      EdgelessThemeOrderByProvider,
      [DocsService]
    )
    .impl(OrderByProvider('property:pageWidth'), PageWidthOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('system:pageWidth'), PageWidthOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('property:template'), TemplateOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('system:template'), TemplateOrderByProvider, [
      DocsService,
    ])
    .impl(OrderByProvider('system:title'), TitleOrderByProvider, [DocsService]);
}
