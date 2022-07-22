import { styled } from '@toeverything/components/ui';
import { useContext } from 'react';
import { FilterContext } from './context/filter-context';
import { MODE_CONFIG } from './config/filter-mode-config';
import { AddViewIcon } from '@toeverything/components/icons';
import { IconBtn } from './IconBtn';
import type { CSSProperties } from 'react';

const StyledBtn = styled('div')<{ extraStyle?: CSSProperties }>(
    ({ extraStyle }) => {
        return {
            padding: '6px 12px',
            border: '1px solid #E0E6EB',
            borderRadius: 5,
            fontSize: 12,
            lineHeight: '18px',
            ...extraStyle,
        };
    }
);

const StyledBtnPanel = styled('div')({
    display: 'flex',
});

const StyledButtonGroup = styled('div')({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
});

interface Props {
    addRule?: () => void;
    confirm?: () => void;
}

const HandleGroup = (props: Props) => {
    const { mode, switchMode, makeView } = useContext(FilterContext);
    const { addRule, confirm } = props;

    return (
        <StyledButtonGroup>
            {mode === MODE_CONFIG.NORMAL ? (
                <IconBtn Icon={AddViewIcon} text="Add Rule" onClick={addRule} />
            ) : (
                <StyledBtn onClick={confirm}>Confirm</StyledBtn>
            )}
            <StyledBtnPanel>
                <StyledBtn
                    extraStyle={{ marginRight: 10 }}
                    onClick={switchMode}
                >
                    Switch to Filter Panel
                </StyledBtn>
                <StyledBtn onClick={makeView}>Make Panel</StyledBtn>
            </StyledBtnPanel>
        </StyledButtonGroup>
    );
};

export { HandleGroup };
