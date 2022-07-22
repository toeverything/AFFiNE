Create or edit the `.env.local` file in the project root directory, add `FIGMA_TOKEN`, you can refer to Generate ACCESS_TOKEN: https://www.figma.com/developers/api#access-tokens

```
FIGMA_TOKEN=your-figma-token
```

Execute the command `nx run components-icons:figmaRes` to synchronize figma resources

figma icon resource address: https://www.figma.com/file/7pyx5gMz6CN0qSRADmScQ7/AFFINE?node-id=665%3A1734

### Icon Supplementary Style

Some icons downloaded directly have incorrect styles. You can add supplementary styles in `tools/executors/figmaRes/patch-styles.js`. The key is the name of the icon kebab-case.
