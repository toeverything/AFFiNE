import React from 'react';

type NodesMap = Map<
  number,
  {
    node: React.ReactNode;
    debugKey?: string;
  }
>;

const ScopeRootComponentsContext = React.createContext<{
  nodes: NodesMap;
  setNodes: React.Dispatch<React.SetStateAction<NodesMap>>;
}>({ nodes: new Map(), setNodes: () => {} });

let _id = 0;
/**
 * A hook to add nodes to the nearest scope's root
 */
export const useMount = (debugKey?: string) => {
  const [id] = React.useState(_id++);
  const { setNodes } = React.useContext(ScopeRootComponentsContext);

  const unmount = React.useCallback(() => {
    setNodes(prev => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, [id, setNodes]);

  const mount = React.useCallback(
    (node: React.ReactNode) => {
      setNodes(prev => new Map(prev).set(id, { node, debugKey }));
      return unmount;
    },
    [setNodes, id, debugKey, unmount]
  );

  return React.useMemo(() => {
    return {
      /**
       * Add a node to the nearest scope root
       * ```tsx
       * const { mount } = useMount();
       * useEffect(() => {
       *  const unmount = mount(<div>Node</div>);
       *  return unmount;
       * }, [])
       * ```
       * @return A function to unmount the added node.
       */
      mount,
    };
  }, [mount]);
};

export const MountPoint = ({ children }: React.PropsWithChildren) => {
  const [nodes, setNodes] = React.useState<NodesMap>(new Map());

  return (
    <ScopeRootComponentsContext.Provider value={{ nodes, setNodes }}>
      {children}
      {Array.from(nodes.entries()).map(([id, { node, debugKey }]) => (
        <div data-testid={debugKey} key={id} style={{ display: 'contents' }}>
          {node}
        </div>
      ))}
    </ScopeRootComponentsContext.Provider>
  );
};
