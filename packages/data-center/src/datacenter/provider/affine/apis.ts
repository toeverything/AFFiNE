import { client } from './request.js';

export async function downloadWorkspace(
  workspaceId: string
): Promise<ArrayBuffer> {
  return client.get(`api/workspace/${workspaceId}/doc`).arrayBuffer();
}
