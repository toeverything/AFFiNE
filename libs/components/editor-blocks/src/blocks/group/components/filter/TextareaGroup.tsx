import { useContext, useState } from 'react';
import { styled } from '@toeverything/components/ui';
import { HandleGroup } from './HandleGroup';
import { toAsync, weakSqlCreator } from '../../utils';
import { FilterContext } from './context/filter-context';
import type { ChangeEvent } from 'react';
import type { Context } from './types';

const StyledTextarea = styled('textarea')({
    marginTop: 16,
    width: 684,
    height: 170,
    border: '1px solid #E0E6EB',
    borderRadius: 5,
    padding: 12,
    fontWeight: 400,
    fontSize: 12,
    lineHeight: '16px',
    color: '#98ACBD',
});

const TextareaGroup = () => {
    const { block } = useContext<Context>(FilterContext);
    const filterWeakSqlConstraint =
        block.getProperties()?.filterWeakSqlConstraint || '';
    const [textareaValue, setTextareaValue] = useState<string>(
        filterWeakSqlConstraint
    );
    const [errStatus, setErrStatus] = useState<boolean>(false);

    /**
     * textarea change: input weak-sql string
     * @param e
     */
    const onTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setTextareaValue(e.target.value);
    };

    /**
     * confirm filter: if string is valid，update filter-rule to store, and redistribute data
     */
    const confirm = async () => {
        const [err, filterWeakSqlConstraint] = await toAsync(
            weakSqlCreator(textareaValue)
        );

        /* need optimization */
        setErrStatus(err ? true : false);

        /* when weak-sql analysis success, update textarea */
        if (!err) {
            await block.setProperties({
                filterWeakSqlConstraint: textareaValue,
            });
        }
    };

    return (
        <>
            <StyledTextarea value={textareaValue} onChange={onTextareaChange} />
            {errStatus &&
                "Syntax error, reference: status = 'complete' & price >= 1000"}
            <HandleGroup confirm={confirm} />
        </>
    );
};

export { TextareaGroup };
