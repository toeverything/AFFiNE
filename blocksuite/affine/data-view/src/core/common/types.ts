export type GroupBy = {
  type: 'groupBy';
  columnId: string;
  name: string;
  hideEmpty?: boolean;
  sort?: {
    desc: boolean;
  };
};
export type GroupProperty = {
  key: string;
  hide?: boolean;
  manuallyCardSort: string[];
};
