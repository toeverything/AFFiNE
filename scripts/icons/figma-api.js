const BASE_URL = 'https://api.figma.com/v1/';

/**
 *
 * @param {*} request got instance
 * @param {string} fileId
 * @param {string} nodeId
 * @returns {Array<{id: string; name: string}>}
 */
async function getChildren(request, fileId, nodeId) {
  const decodedNodeId = decodeURIComponent(nodeId);
  console.log(
    `Fetching: ${`${BASE_URL}files/${fileId}/nodes?ids=${decodedNodeId}`}`
  );

  try {
    let data = await request({
      url: `files/${fileId}/nodes?ids=${decodedNodeId}`,
    }).json();

    return data.nodes[decodedNodeId].document.children;
  } catch (error) {
    console.error(error);
  }
}

/**
 *
 * @param {*} request got instance
 * @param {string} fileId
 * @param {string} svgIds
 * @returns { Object<string, string> }
 */
async function getSvgUrls(request, fileId, svgIds) {
  console.log(
    `Fetching: ${`${BASE_URL}images/${fileId}/?format=svg&ids=${svgIds}`}`
  );

  try {
    body = await request({
      url: `images/${fileId}/?ids=${svgIds}&format=svg`,
    }).json();
    return body.images;
  } catch (error) {
    console.error(error);
  }
}

async function downloadSvg(request, svgUrl) {
  console.log(`Downloading: ${svgUrl}`);
  const got = await import('got');
  const { body } = await got.got({ url: svgUrl });
  return body;
}

/**
 *
 * @param {string} token
 * @returns {{
 *  getChildren: (fileId: string, nodeId: string) => Array<{id: string; name: string}>
 *  getSvgUrls: (fileId: string, svgIds: string) => Object<string, string>
 *  downloadSvg: (svgUrl: string) => string
 * }}
 */
async function initializeAPI(token) {
  const got = await import('got');
  const request = got.got.extend({
    prefixUrl: BASE_URL,
    headers: {
      'X-Figma-Token': token,
    },
  });

  return {
    getChildren: getChildren.bind(null, request),
    getSvgUrls: getSvgUrls.bind(null, request),
    downloadSvg: downloadSvg.bind(null, request),
  };
}

module.exports = initializeAPI;
