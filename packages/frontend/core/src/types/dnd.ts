import type { DNDData } from '@affine/component';

export type AffineDNDEntity =
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

export interface AffineDNDData extends DNDData {
  draggable: {
    entity?: AffineDNDEntity;
    from?:
      | {
          at: 'navigation-panel:organize:folder-node';
          nodeId: string;
        }
      | {
          at: 'navigation-panel:collection:list';
        }
      | {
          at: 'navigation-panel:doc:linked-docs';
          docId: string;
        }
      | {
          at: 'navigation-panel:collection:filtered-docs';
          collectionId: string;
        }
      | {
          at: 'navigation-panel:favorite:list';
        }
      | {
          at: 'navigation-panel:old-favorite:list';
        }
      | {
          at: 'navigation-panel:migration-data:list';
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
          at: 'navigation-panel:tags:list';
        }
      | {
          at: 'navigation-panel:tags:docs';
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
        }
      | {
          at: 'doc-detail:header';
          docId: string;
        }
      | {
          at: 'workbench:view';
          viewId: string;
        }
      | {
          at: 'workbench:link';
          to: string;
        }
      | {
          at: 'workbench:resize-handle';
          viewId: string;
          edge: 'left' | 'right';
        }
      | {
          at: 'blocksuite-editor';
        }
      | {
          at: 'external'; // for external apps
        };
  };
  dropTarget:
    | {
        at: 'navigation-panel:organize:root';
      }
    | {
        at: 'navigation-panel:favorite:root';
      }
    | {
        at: 'navigation-panel:organize:folder';
      }
    | {
        at: 'navigation-panel:favorite:root';
      }
    | {
        at: 'navigation-panel:old-favorite:root';
      }
    | {
        at: 'navigation-panel:doc';
      }
    | {
        at: 'app-sidebar:trash';
      }
    | {
        at: 'navigation-panel:tag';
      }
    | {
        at: 'app-header:tabs';
      }
    | {
        at: 'workbench:view';
        viewId: string;
      }
    | Record<string, unknown>;
}
