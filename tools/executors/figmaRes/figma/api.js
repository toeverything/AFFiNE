const PREFIX_URL = 'https://api.figma.com/v1/';
async function initializeApi(token) {
    const got = await import('got');
    const api = got.got.extend({
        prefixUrl: PREFIX_URL,
        headers: {
            'X-Figma-Token': token,
        },
    });

    return {
        async getChildren(fileId, nodeId) {
            const decodedNodeId = decodeURIComponent(nodeId);
            console.log(
                `Fetching: ${`${PREFIX_URL}files/${fileId}/nodes?ids=${decodedNodeId}`}`
            );
            let data;
            try {
                data = await api({
                    url: `files/${fileId}/nodes?ids=${decodedNodeId}`,
                }).json();
            } catch (error) {
                console.log(`Error: ${error}`);
            }

            return data.nodes[decodedNodeId].document.children;
        },

        async getIconsUrl(fileId, iconId) {
            console.log(
                `Fetching: ${`${PREFIX_URL}images/${fileId}/?ids=${iconId}&format=svg`}`
            );

            let body;
            try {
                body = await api({
                    url: `images/${fileId}/?ids=${iconId}&format=svg`,
                }).json();
            } catch (error) {
                console.log(`Error: ${error}`);
            }

            return body.images;
        },

        async downloadIcon(iconUrl) {
            const { body } = await got.got({
                url: iconUrl,
            });

            return body;
        },
    };
}

module.exports = initializeApi;
