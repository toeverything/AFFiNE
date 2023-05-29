import { useState } from 'react';

import { evalFilterList } from './filter';
import type { Filter, VariableMap } from './filter/vars';

export type View = {
  name: string;
  filterList: Filter[];
};
export type AllPageSetting = {
  mainView: View;
  currentView?: number;
  savedViews: View[];
};
export const useAllPageSetting = () => {
  const [setting, changeSetting] = useState<AllPageSetting>({
    mainView: {
      name: 'default',
      filterList: [],
    },
    savedViews: [],
  });

  const changeView = (view: View, i?: number) =>
    changeSetting(setting => {
      if (i != null) {
        return {
          ...setting,
          savedViews: setting.savedViews.map((v, index) =>
            i === index ? view : v
          ),
        };
      } else {
        return {
          ...setting,
          mainView: view,
        };
      }
    });
  const createView = (view: View) =>
    changeSetting(setting => ({
      ...setting,
      currentView: setting.savedViews.length,
      savedViews: [...setting.savedViews, view],
    }));
  const selectView = (i?: number) =>
    changeSetting(setting => ({ ...setting, currentView: i }));
  const currentView =
    setting.currentView != null
      ? setting.savedViews[setting.currentView]
      : setting.mainView;
  return {
    currentView,
    currentViewIndex: setting.currentView,
    viewList: setting.savedViews,
    selectView,
    createView,
    changeView,
  };
};
export const filterByView = (view: View, varMap: VariableMap) =>
  evalFilterList(view.filterList, varMap);
