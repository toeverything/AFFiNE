module.exports = {
  packagerConfig: {
    name: 'AFFiNE',
    icon: './resources/icons/icon.icns',
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
