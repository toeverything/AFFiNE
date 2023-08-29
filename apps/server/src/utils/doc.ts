export function trimGuid(ws: string, guid: string) {
  if (guid.startsWith(`${ws}:space:`)) {
    return guid.substring(ws.length + 1);
  }

  return guid;
}
