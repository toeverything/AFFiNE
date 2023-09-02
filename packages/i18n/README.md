# i18n

## Usages

- Update missing translations into the base resources, a.k.a the `src/resources/en.json`
- Replace literal text with translation keys

```tsx
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { LOCALES, useI18N } from '@affine/i18n';
// src/resources/en.json
// {
//     'Text': 'some text',
//     'Switch to language': 'Switch to {{language}}', // <- you can interpolation by curly brackets
// };

const App = () => {
  const t = useAFFiNEI18N();
  const i18n = useI18N();
  const changeLanguage = (language: string) => {
    i18n.changeLanguage(language);
  };

  return (
    <div>
      <div>{t['Workspace Settings']()}</div>
      <>
        {LOCALES.map(option => {
          return (
            <button
              key={option.name}
              onClick={() => {
                changeLanguage(option.tag);
              }}
            >
              {option.originalName}
            </button>
          );
        })}
      </>
    </div>
  );
};
```

## How the i18n workflow works?

- When the `src/resources/en.json`(base language) updated and merged to the develop branch, will trigger the `languages-sync` action.
- The `languages-sync` action will check the base language and add missing translations to the Tolgee platform.
- This way, partners from the community can update the translations.

## How to sync translations manually

- Set token as environment variable

```shell
export TOLGEE_API_KEY=tgpak_XXXXXXX
```

- Run the `sync-languages:check` to check all languages
- Run the `sync-languages` script to add new keys to the Tolgee platform
- Run the `download-resources` script to download the latest full-translation translation resources from the Tolgee platform

## References

- [AFFiNE | Tolgee](https://i18n.affine.pro/)
- [Tolgee Documentation](https://tolgee.io/docs/)
- [i18next](https://www.i18next.com/)
- [react-i18next](https://react.i18next.com/)
