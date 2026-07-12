import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    onlyoffice: {
      enabled: boolean;
      documentServerUrl: string;
      internalUrl: string;
      callbackHost: string;
      jwtSecret: string;
    };
  }
}

defineModuleConfig('onlyoffice', {
  enabled: {
    desc: 'Enable OnlyOffice Document Server integration for editing office attachments (docx/xlsx/pptx, ...).',
    default: false,
    env: ['AFFINE_ONLYOFFICE_ENABLED', 'boolean'],
  },
  documentServerUrl: {
    desc: 'Public URL of the OnlyOffice Document Server, used by the browser to load the editor api.js. e.g. https://office.yourdomain.com',
    default: '',
    env: 'AFFINE_ONLYOFFICE_DOCUMENT_SERVER_URL',
  },
  internalUrl: {
    desc: 'Internal URL the AFFiNE server uses to reach the Document Server (server-to-server). Falls back to `documentServerUrl` when empty. e.g. http://onlyoffice',
    default: '',
    env: 'AFFINE_ONLYOFFICE_INTERNAL_URL',
  },
  callbackHost: {
    desc: 'Base URL the Document Server uses to reach back to AFFiNE for downloading the source file and posting edits back. Must be reachable from the Document Server container. e.g. http://affine:3010',
    default: '',
    env: 'AFFINE_ONLYOFFICE_CALLBACK_HOST',
  },
  jwtSecret: {
    desc: 'Shared JWT secret between AFFiNE and the Document Server (must match the Document Server `JWT_SECRET`).',
    default: '',
    env: 'AFFINE_ONLYOFFICE_JWT_SECRET',
  },
});
