import { styled } from '@toeverything/components/ui';
import { Footer } from './footer';
import { SettingsList } from './SettingsList';

export const SettingsPanel = () => {
    return (
        <StyledContainerForSettingsPanel>
            <SettingsList />
            <Footer />
        </StyledContainerForSettingsPanel>
    );
};

const StyledContainerForSettingsPanel = styled('div')(({ theme }) => {
    return {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        paddingBottom: 44,
        height: '100%',
    };
});
