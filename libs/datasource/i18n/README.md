# i18n

## Usages

```tsx
import { useTranslation } from '@toeverything/datasource/i18n';

// base.json
// {
//     'Text': 'some text',
//     'Switch to language': 'Switch to {language}',
// };

const App = () => {
    const { t } = useTranslation();

    const changeLanguage = (language: string) => {
        i18n.changeLanguage(language);
    };

    return (
        <div>
            <div>{t('Text')}</div>

            <button onClick={() => changeLanguage('en')}>
                {t('Switch to language', { language: 'en' })}
            </button>
            <button onClick={() => changeLanguage('zh-Hans')}>
                {t('Switch to language', { language: 'zh-Hans' })}
            </button>
        </div>
    );
};
```

## How to sync translations

-   Set token as environment variable

```shell
export TOLGEE_API_KEY=tgpak_XXXXXXX
```

-   Run the `sync` script from package script

## References

-   [i18next](https://www.i18next.com/)
-   [react-i18next](https://react.i18next.com/)
-   [Tolgee](https://tolgee.io/docs/)
