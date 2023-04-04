module.exports = {
  packagerConfig: {
    name: 'AFFiNE',
    icon: './resources/icons/icon.icns',
    osxSign: {
      identity: 'Developer ID Application: TOEVERYTHING PTE. LTD.',
      'hardened-runtime': true,
    }, // object must exist even if empty
    osxNotarize: {
      tool: 'notarytool',
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        icon: './resources/icons/icon.icns',
        name: 'AFFiNE',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      config: {
        name: 'affine',
        iconUrl: './resources/icons/icon.ico',
        setupIcon: './resources/icons/icon.ico',
      },
    },
  ],
};
