import { styled, ListItem, Divider, Switch } from '@toeverything/components/ui';
import { useSettings } from './use-settings';

export const SettingsList = () => {
    const settings = useSettings();

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
                            key={item.name}
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
                    <ListItem key={item.name} onClick={() => item.onClick()}>
                        {item.name}
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
