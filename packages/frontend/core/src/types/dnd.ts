import type { DNDData } from '@affine/component';

export interface AffineDNDData extends DNDData {
  draggable: {
    entity?:
      | {
          type: 'doc';
          id: string;
        }
      | {
          type: 'folder';
          id: string;
        }
      | {
          type: 'collection';
          id: string;
        }
      | {
          type: 'tag';
          id: string;
        }
      | {
          type: 'custom-property';
          id: string;
        };
    from?:
      | {
          at: 'explorer:organize:folder-node';
          nodeId: string;
        }
      | {
          at: 'explorer:collection:list';
        }
      | {
          at: 'explorer:doc:linked-docs';
          docId: string;
        }
      | {
          at: 'explorer:collection:filtered-docs';
          collectionId: string;
        }
      | {
          at: 'explorer:favorite:list';
        }
      | {
          at: 'explorer:old-favorite:list';
        }
      | {
          at: 'explorer:migration-data:list';
        }
      | {
          at: 'all-docs:list';
        }
      | {
          at: 'all-tags:list';
        }
      | {
          at: 'all-collections:list';
        }
      | {
          at: 'explorer:tags:list';
        }
      | {
          at: 'explorer:tags:docs';
        }
      | {
          at: 'app-header:tabs';
          tabId: string;
        }
      | {
          at: 'doc-property:table';
          docId: string;
        }
      | {
          at: 'doc-property:manager';
          workspaceId: string;
        };
  };
  dropTarget:
    | {
        at: 'explorer:organize:root';
      }
    | {
        at: 'explorer:favorite:root';
      }
    | {
        at: 'explorer:organize:folder';
      }
    | {
        at: 'explorer:favorite:root';
      }
    | {
        at: 'explorer:old-favorite:root';
      }
    | {
        at: 'explorer:doc';
      }
    | {
        at: 'app-sidebar:trash';
      }
    | {
        at: 'explorer:tag';
      }
    | {
        at: 'app-header:tabs';
      }
    | Record<string, unknown>;
}
