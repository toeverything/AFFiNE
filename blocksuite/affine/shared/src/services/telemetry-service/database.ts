type OrderType = 'desc' | 'asc';
export type WithParams<Map, T> = { [K in keyof Map]: Map[K] & T };
export type SortParams = {
  fieldId: string;
  fieldType: string;
  orderType: OrderType;
  orderIndex: number;
};
export type ViewParams = {
  viewId: string;
  viewType: string;
};
export type DatabaseParams = {
  blockId: string;
};

export type DatabaseViewEvents = {
  DatabaseSortClear: {
    rulesCount: number;
  };
  CreateDatabaseView: {
    viewType: string; // e.g., 'table', 'gallery'
  };
  ChangeDatabaseLayout: {
    fromViewType: string;
    toViewType: string;
  };
};

export type DatabasePropertyEvents = {
  CreateDatabaseProperty: {
    propertyType: string; // e.g., 'text', 'number', 'select'
  };
};

export type DatabaseFilterEvents = {
  CreateDatabaseFilter: {};
};

export type DatabaseGroupEvents = {
  CreateDatabaseGroup: {
    groupBy: string;
  };
};

export type DatabaseEvents = {
  AddDatabase: {};
  AddDatabaseView: {
    type: string;
  };
};

export interface DatabaseAllSortEvents {
  DatabaseSortAdd: {};
  DatabaseSortRemove: {};
  DatabaseSortModify: {
    oldOrderType: OrderType;
    oldFieldType: string;
    oldFieldId: string;
  };
  DatabaseSortReorder: {
    prevFieldType: string;
    nextFieldType: string;
    newOrderIndex: number;
  };
}

export type DatabaseAllViewEvents = DatabaseViewEvents &
  WithParams<DatabaseAllSortEvents, SortParams> &
  DatabasePropertyEvents &
  DatabaseFilterEvents &
  DatabaseGroupEvents;

export type DatabaseAllEvents = DatabaseEvents &
  WithParams<DatabaseAllViewEvents, ViewParams>;

export type OutDatabaseAllEvents = WithParams<
  DatabaseAllEvents,
  DatabaseParams
>;

export type EventTraceFn<Events> = <K extends keyof Events>(
  key: K,
  params: Events[K]
) => void;
