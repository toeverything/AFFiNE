export interface FilterParams {
  type: string;
  key: string;
  method: string;
  value?: string;
}

export interface GroupByParams {
  type: string;
  key: string;
}

export interface OrderByParams {
  type: string;
  key: string;
  desc?: boolean;
}
