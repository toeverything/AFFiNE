/**
 * @deprecated debugging method, deprecated
 */
export const importWorkspace = async () => {
    if (window.confirm('Your currently open data will be lost.')) {
        //@ts-ignore
        const status = await window.client.inspector().load();

        if (status) {
            window.location.reload();
        }
    }
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
