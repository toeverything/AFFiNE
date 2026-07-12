/**
 * OnlyOffice Document Server integration types.
 *
 * Protocol reference:
 *  - Editor config:   https://api.onlyoffice.com/docs/docs-api/usage-api/config/
 *  - Callback handler: https://api.onlyoffice.com/docs/docs-api/usage-api/callback-handler/
 */

// File types OnlyOffice can edit, mapped to its `documentType`.
export const ONLYOFFICE_DOCUMENT_TYPES: Record<string, string> = {
  // word
  doc: 'word',
  docx: 'word',
  docm: 'word',
  dot: 'word',
  dotx: 'word',
  odt: 'word',
  ott: 'word',
  rtf: 'word',
  txt: 'word',
  // cell
  xls: 'cell',
  xlsx: 'cell',
  xlsm: 'cell',
  ods: 'cell',
  ots: 'cell',
  csv: 'cell',
  // slide
  ppt: 'slide',
  pptx: 'slide',
  pptm: 'slide',
  odp: 'slide',
  otp: 'slide',
  // pdf (OnlyOffice >= 7.x renders pdf as its own type)
  pdf: 'pdf',
};

export function getOnlyOfficeDocumentType(ext: string): string | null {
  return ONLYOFFICE_DOCUMENT_TYPES[ext.toLowerCase()] ?? null;
}

// Editor interaction modes exposed to the user. Each maps to a combination of
// OnlyOffice editorConfig.mode / type / document.permissions / customization.
export const ONLYOFFICE_MODES = [
  'edit', // full editing
  'review', // strict track-changes review
  'view', // read-only + anti-leak (no copy/print/download)
  'fillForms', // form filling only
  'comment', // comment/annotation only
  'embedded', // pure embedded (compact, view)
  'mobile', // mobile touch layout
] as const;

export type OnlyOfficeMode = (typeof ONLYOFFICE_MODES)[number];

export function isOnlyOfficeMode(v: string | undefined): v is OnlyOfficeMode {
  return !!v && (ONLYOFFICE_MODES as readonly string[]).includes(v);
}

// Modes that can produce changes and therefore need the save callback.
export const ONLYOFFICE_WRITABLE_MODES: ReadonlySet<OnlyOfficeMode> = new Set([
  'edit',
  'review',
  'fillForms',
  'comment',
]);

export interface OnlyOfficeEditorConfig {
  documentServerUrl: string;
  config: {
    document: {
      fileType: string;
      key: string;
      title: string;
      url: string;
      permissions: {
        edit: boolean;
        download: boolean;
        print?: boolean;
        copy?: boolean;
        review?: boolean;
        comment?: boolean;
        fillForms?: boolean;
      };
    };
    documentType: string;
    type?: 'desktop' | 'mobile' | 'embedded';
    editorConfig: {
      mode: 'edit' | 'view';
      callbackUrl?: string;
      lang?: string;
      user?: {
        id: string;
        name: string;
      };
      customization?: Record<string, unknown>;
      embedded?: Record<string, unknown>;
    };
    // signed JWT for the whole config payload
    token: string;
  };
}

// OnlyOffice callback payload (subset we care about).
// status: 1=editing, 2=ready to save, 3=save error, 4=closed no change,
//         6=force save, 7=force save error
export interface OnlyOfficeCallbackBody {
  key: string;
  status: number;
  url?: string;
  users?: string[];
  token?: string;
  [k: string]: unknown;
}

// Result of a save: the new content-addressed blob id + its size.
export interface OnlyOfficeSaveResult {
  blobId: string;
  size: number;
}

// One stored version of an attachment (a content-addressed blob).
export interface OnlyOfficeVersion {
  blobId: string;
  size: number;
  createdAt: number; // epoch ms
  // The OnlyOffice document key of the editing session that produced this
  // version. Consecutive autosaves in the same session share a docKey and are
  // collapsed onto one entry until the session is sealed.
  docKey?: string;
  // Sealed = a finalized history version (set on explicit close/forcesave).
  // An unsealed entry is the live working copy of an ongoing session and gets
  // replaced by later autosaves of the same session.
  sealed?: boolean;
}

// Per-attachment version manifest (stored as a fixed-key JSON blob).
export interface OnlyOfficeVersionManifest {
  versions: OnlyOfficeVersion[];
}
