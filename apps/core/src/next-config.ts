export default function getConfig() {
  return {
    publicRuntimeConfig: {
      PROJECT_NAME: 'AFFiNE Mock',
      BUILD_DATE: '2021-09-01T00:00:00.000Z',
      gitVersion: 'UNKNOWN',
      hash: 'UNKNOWN',
      appVersion: '0.0.0',
      editorVersion: '0.0.0',
      serverAPI: 'http://127.0.0.1:3000/',
      editorFlags: {
        enable_database: true,
        enable_slash_menu: true,
        enable_edgeless_toolbar: true,
        enable_block_hub: true,
        enable_drag_handle: true,
        enable_surface: true,
        enable_linked_page: true,
        enable_bookmark_operation: false,
      },
      enablePlugin: true,
      enableTestProperties: true,
      enableBroadcastChannelProvider: true,
      enableDebugPage: true,
      changelogUrl: 'https://affine.pro/blog/what-is-new-affine-0717',
      imageProxyUrl: 'https://workers.toeverything.workers.dev/proxy/image',
      enablePreloading: true,
      enableNewSettingModal: true,
      enableNewSettingUnstableApi: false,
      enableSQLiteProvider: true,
      enableMoveDatabase: false,
      enableNotificationCenter: true,
      enableCloud: false,
    }
  }
}
