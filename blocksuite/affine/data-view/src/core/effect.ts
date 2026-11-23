import { DataViewPropertiesSettingView } from './common/properties.js';
import { Button } from './component/button/button.js';
import { Overflow } from './component/overflow/overflow.js';
import { MultiTagSelect, MultiTagView } from './component/tags/index.js';
import { DataViewRootUI } from './data-view.js';
import { RecordDetail } from './detail/detail.js';
import { RecordField } from './detail/field.js';
import { VariableRefView } from './expression/ref/ref-view.js';
import { BooleanGroupView } from './group-by/renderer/boolean-group.js';
import { NumberGroupView } from './group-by/renderer/number-group.js';
import { SelectGroupView } from './group-by/renderer/select-group.js';
import { StringGroupView } from './group-by/renderer/string-group.js';
import { GroupSetting } from './group-by/setting.js';
import { AffineLitIcon, UniAnyRender, UniLit } from './index.js';
import { AnyRender } from './utils/uni-component/render-template.js';

export function coreEffects() {
  customElements.define('affine-data-view-renderer', DataViewRootUI);
  customElements.define('any-render', AnyRender);
  customElements.define(
    'data-view-properties-setting',
    DataViewPropertiesSettingView
  );
  customElements.define('affine-data-view-record-field', RecordField);
  customElements.define('data-view-component-button', Button);
  customElements.define('component-overflow', Overflow);
  customElements.define('data-view-group-title-select-view', SelectGroupView);
  customElements.define('data-view-group-title-string-view', StringGroupView);
  customElements.define('data-view-group-title-number-view', NumberGroupView);
  customElements.define('affine-lit-icon', AffineLitIcon);
  customElements.define('data-view-group-setting', GroupSetting);
  customElements.define('affine-multi-tag-select', MultiTagSelect);
  customElements.define('data-view-group-title-boolean-view', BooleanGroupView);
  customElements.define('affine-multi-tag-view', MultiTagView);
  customElements.define('uni-lit', UniLit);
  customElements.define('uni-any-render', UniAnyRender);
  customElements.define('variable-ref-view', VariableRefView);
  customElements.define('affine-data-view-record-detail', RecordDetail);
}
