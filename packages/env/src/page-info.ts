export type PageInfo = {
  isEdgeless: boolean;
  title: string;
  id: string;
};

export type GetPageInfoById = (id: string) => PageInfo | undefined;
