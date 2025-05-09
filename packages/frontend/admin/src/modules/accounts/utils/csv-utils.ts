import { toast } from 'sonner';

import { emailRegex } from '../../../utils';

export interface ParsedUser {
  name: string | null;
  email: string;
  valid?: boolean;
  error?: string;
  importStatus?: ImportStatus;
  importError?: string;
}

export enum ImportStatus {
  Success = 'success',
  Failed = 'failed',
  Processing = 'processing',
}

/**
 * Validates email addresses for duplicates and format
 */
export const validateEmails = (users: ParsedUser[]): ParsedUser[] => {
  const emailMap = new Map<string, number>();

  users.forEach(user => {
    const lowerCaseEmail = user.email.toLowerCase();
    emailMap.set(lowerCaseEmail, (emailMap.get(lowerCaseEmail) || 0) + 1);
  });

  return users.map(user => {
    const lowerCaseEmail = user.email.toLowerCase();

    if (!emailRegex.test(user.email)) {
      return { ...user, valid: false, error: 'Invalid email format' };
    }

    const emailCount = emailMap.get(lowerCaseEmail) || 0;
    if (emailCount > 1) {
      return { ...user, valid: false, error: 'Duplicate email address' };
    }

    return { ...user, valid: true };
  });
};

/**
 * Filters valid users for import
 */
export const getValidUsersToImport = (users: ParsedUser[]) => {
  return users
    .filter(user => user.valid === true)
    .map(user => ({
      name: user.name || undefined,
      email: user.email,
    }));
};

/**
 * Downloads a CSV template for user import
 */
export const downloadCsvTemplate = () => {
  const csvContent = 'Username,Email\n,example@example.com';
  downloadCsv(csvContent, 'user_import_template.csv');
};

/**
 * Exports failed imports to a CSV file
 */
export const exportImportResults = (results: ParsedUser[]) => {
  const csvContent = [
    'Username,Email,status',
    ...results.map(
      user =>
        `${user.name || ''},${user.email},${user.importStatus}${user.importError ? ` (${user.importError})` : ''}`
    ),
  ].join('\n');

  // Create and download the file
  downloadCsv(
    csvContent,
    `import_results_${new Date().toISOString().slice(0, 10)}.csv`
  );

  toast.success(`Exported ${results.length} import results`);
};

/**
 * Utility function for downloading CSV content with proper UTF-8 encoding for international characters
 */
export const downloadCsv = (csvContent: string, filename: string) => {
  // Add BOM (Byte Order Mark) to force Excel to interpret the file as UTF-8
  const BOM = '\uFEFF';
  const csvContentWithBOM = BOM + csvContent;

  const blob = new Blob([csvContentWithBOM], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.append(link);
  link.click();

  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 100);
};

/**
 * Processes a CSV file to extract user data
 */
export const processCSVFile = async (
  file: File,
  onSuccess: (users: ParsedUser[]) => void,
  onError: () => void
) => {
  try {
    const csvContent = await file.text();
    const rows = csvContent
      .split('\n')
      .filter(row => row.trim() !== '')
      .map(row => row.split(','));

    if (rows.length < 2) {
      toast.error('CSV file format is incorrect or empty');
      onError();
      return;
    }

    const dataRows = rows.slice(1);

    const users = dataRows.map(row => ({
      name: row[0]?.trim() || null,
      email: row[1]?.trim() || '',
    }));

    const usersWithEmail = users.filter(user => user.email);

    if (usersWithEmail.length === 0) {
      toast.error('CSV file contains no valid user data');
      onError();
      return;
    }

    const validatedUsers = validateEmails(usersWithEmail);
    const hasValidUsers = validatedUsers.some(user => user.valid !== false);

    if (!hasValidUsers) {
      toast.error('CSV file contains no valid user data');
      onError();
      return;
    }

    onSuccess(validatedUsers);
  } catch (error) {
    console.error('Failed to parse CSV file', error);
    toast.error('Failed to parse CSV file');
    onError();
  }
};
