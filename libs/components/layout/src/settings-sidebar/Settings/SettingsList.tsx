import {
    Divider,
    ListItem,
    Option,
    Select,
    styled,
    Switch,
} from '@toeverything/components/ui';
import { LOCALES, useTranslation } from '@toeverything/datasource/i18n';
import { useSettings } from './use-settings';

export const SettingsList = () => {
    const settings = useSettings();
    const { i18n } = useTranslation();
    const changeLanguage = event => {
        i18n.changeLanguage(event);
    };

    return (
        <StyledSettingsList>
            {settings.map((item, index) => {
                const type = item.type;
                if (type === 'separator') {
                    return <Divider key={index} />;
                }

                if (type === 'switch') {
                    return (
                        <SwitchItemContainer
                            key={item.key}
                            onClick={() => {
                                item.onChange(!item.value);
                            }}
                        >
                            <span>{item.name}</span>
                            <Switch
                                checked={item.value}
                                checkedLabel="ON"
                                uncheckedLabel="OFF"
                            />
                        </SwitchItemContainer>
                    );
                }

                return (
                    <ListItem key={item.key} onClick={() => item.onClick()}>
                        {item.name}
                        {item.key === 'Language' ? (
                            <div style={{ marginLeft: '12em' }}>
                                <Select
                                    defaultValue={i18n.resolvedLanguage}
                                    onChange={changeLanguage}
                                >
                                    {LOCALES.map(option => (
                                        <Option
                                            key={option.tag}
                                            value={option.tag}
                                        >
                                            {option.originalName}
                                        </Option>
                                    ))}
                                </Select>
                            </div>
                        ) : null}
                    </ListItem>
                );
            })}
        </StyledSettingsList>
    );
};

const StyledSettingsList = styled('div')({
    overflow: 'auto',
    padding: '0 4px',
});

const SwitchItemContainer = styled(ListItem)({
    display: 'flex',
    alignContent: 'center',
    justifyContent: 'space-between',
});
