// let '$' stands for unspecific matrix
/* eslint-disable rxjs/finnish */
export interface Events {
  $: {
    cmdk: {
      settings: ['openSettings', 'changeLanguage'];
    };
    navigationPanel: {
      generalFunction: [
        'quickSearch',
        'createDoc',
        'goToAllPage',
        'goToJournals',
        'openSettings',
      ];
      collection: ['createDoc'];
      bottomButtong: ['downloadApp', 'restartAndInstallUpdate'];
      others: ['openTrash', 'export'];
    };
  };
  doc: {
    editor: {
      formatToolbar: ['bold'];
    };
  };
  edgeless: {
    editor: {
      formatToolbar: ['drawConnector'];
    };
  };
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  allDocs: {};
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  collection: {};
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  tag: {};
  // remove when type added
  // eslint-disable-next-line @typescript-eslint/ban-types
  trash: {};
}
