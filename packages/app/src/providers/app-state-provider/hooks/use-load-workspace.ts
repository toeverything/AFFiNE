// import { useRef } from 'react';
// import { AppStateContext } from '@/providers/app-state-provider';
//
// export const useLoadWorkspace = ({}:{
//   state,
//   loadWorkspaceHandler
// }) => {
//   const loadWorkspace = useRef<AppStateContext['loadWorkspace']>(() =>
//     Promise.resolve(null)
//   );
//   loadWorkspace.current = async (workspaceId: string) => {
//     if (state.currentWorkspaceId === workspaceId) {
//       return state.currentWorkspace;
//     }
//
//     const workspace =
//       (await loadWorkspaceHandler?.(workspaceId, true, state.user)) || null;
//
//     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//     // @ts-expect-error
//     window.workspace = workspace;
//     // FIXME: there needs some method to destroy websocket.
//     // Or we need a manager to manage websocket.
//     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
//     // @ts-expect-error
//     state.currentWorkspace?.__ws__?.destroy();
//
//     setState(state => ({
//       ...state,
//       currentWorkspace: workspace,
//       currentWorkspaceId: workspaceId,
//     }));
//     return workspace;
//   };
// };
