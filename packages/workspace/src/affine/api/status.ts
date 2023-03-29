export function createStatusApis(prefixUrl = '/') {
  return {
    healthz: async (): Promise<boolean> => {
      return fetch(`${prefixUrl}api/healthz`).then(r => r.status === 204);
    },
  } as const;
}
