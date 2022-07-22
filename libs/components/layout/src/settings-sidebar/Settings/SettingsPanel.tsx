import { styled } from '@toeverything/components/ui';
import { SettingsList } from './SettingsList';
import { Footer } from './footer';

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
        paddingTop: 44,
        paddingBottom: 44,
        height: '100%',
    };
});
