// provide a backdoor to set dialog path for testing in playwright
interface FakeDialogResult {
  canceled?: boolean;
  filePath?: string;
  filePaths?: string[];
}
// result will be used in the next call to showOpenDialog
// if it is being read once, it will be reset to undefined
let fakeDialogResult: FakeDialogResult | undefined = undefined;
export function getFakedResult() {
  const result = fakeDialogResult;
  fakeDialogResult = undefined;
  return result;
}

export function setFakeDialogResult(result: FakeDialogResult | undefined) {
  fakeDialogResult = result;
  // for convenience, we will fill filePaths with filePath if it is not set
  if (result?.filePaths === undefined && result?.filePath !== undefined) {
    result.filePaths = [result.filePath];
  }
}
const ErrorMessages = ['FILE_ALREADY_EXISTS', 'UNKNOWN_ERROR'] as const;
export type ErrorMessage = (typeof ErrorMessages)[number];
