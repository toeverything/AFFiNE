import type { Framework } from '@toeverything/infra';

interface AppTabBase {
  key: string;
  onClick?: (framework: Framework, isActive: boolean) => void;
}
export interface AppTabLink extends AppTabBase {
  Icon: React.FC;
  to: string;
  LinkComponent?: React.FC;
}

export interface AppTabCustom extends AppTabBase {
  custom: (props: AppTabCustomFCProps) => React.ReactNode;
}

export type Tab = AppTabLink | AppTabCustom;

export interface AppTabCustomFCProps {
  tab: Tab;
}
