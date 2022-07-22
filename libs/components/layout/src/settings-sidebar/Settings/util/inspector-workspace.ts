/**
 * @deprecated debugging method, deprecated
 */
export const importWorkspace = (workspaceId: string) => {
    //@ts-ignore
    window.client
        .inspector()
        .load()
        .then(() => {
            window.location.href = `/${workspaceId}/`;
        });
};

/**
 * @deprecated debugging method, deprecated
 */
export const exportWorkspace = () => {
    //@ts-ignore
    window.client.inspector().save();
};

/**
 * @deprecated debugging method, deprecated
 */
export const clearWorkspace = async workspaceId => {
    //@ts-ignore
    if (window.confirm('Are you sure you want to clear the workspace?')) {
        //@ts-ignore
        await window.client.inspector().clear();
        window.location.href = `/${workspaceId}/`;
    }
};
