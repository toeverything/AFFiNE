/**
 * Custom fetch utility with AFFiNE version header
 * Automatically adds the x-affine-version header to all fetch requests
 */

// BUILD_CONFIG is defined globally in the AFFiNE project

/**
 * Wrapper around fetch that automatically adds the x-affine-version header
 * @param input Request URL
 * @param init Request initialization options
 * @returns Promise with the fetch Response
 */
export const affineFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      'x-affine-version': BUILD_CONFIG.appVersion,
    },
  });
};
