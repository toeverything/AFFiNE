import type { TldrawApp } from '@toeverything/components/board-state';
import type {
    ArrowBinding,
    TDShape,
} from '@toeverything/components/board-types';
import { ConnectorIcon } from '@toeverything/components/icons';
import { IconButton, Popover, Tooltip } from '@toeverything/components/ui';
import { useEffect, useState } from 'react';
import { ListItemContainer, ListItemTitle } from './FontSizeConfig';

interface GroupAndUnGroupProps {
    app: TldrawApp;
    shapes: TDShape[];
}

export const ArrowTo = ({ app, shapes }: GroupAndUnGroupProps) => {
    const [arrowToArr, setarrowToArr] = useState([]);
    useEffect(() => {
        let allShape = app.shapes;
        let bindings = app.page.bindings;
        let activeShape = shapes[0];
        let toNextShapBindings: ArrowBinding[] = [];
        let bindingId = '';
        Object.keys(bindings).forEach(key => {
            if (bindings[key].toId === activeShape.id) {
                bindingId = bindings[key].fromId;
            }
        });
        Object.keys(bindings).forEach(key => {
            if (bindings[key].fromId === bindingId) {
                toNextShapBindings.push(bindings[key]);
            }
        });
        let ArrowToArr: TDShape[] = [];
        toNextShapBindings.forEach(binding => {
            if (binding.toId !== activeShape.id) {
                allShape.forEach(item => {
                    console.log(item);
                    if (item.id === binding.toId) {
                        ArrowToArr.push(item);
                    }
                });
            }
        });
        setarrowToArr(ArrowToArr);
        return () => {};
    }, [app.page.bindings, app.shapes]);
    const jumpToNextShap = (shape: TDShape) => {
        app.zoomToShapes([shape]);
    };

    return (
        <Popover
            trigger="hover"
            placement="bottom-start"
            content={
                <div>
                    {arrowToArr.map((arrow: any) => {
                        return (
                            <ListItemContainer
                                key={arrow.id}
                                onClick={() => jumpToNextShap(arrow)}
                            >
                                <ListItemTitle>{arrow.name}</ListItemTitle>
                            </ListItemContainer>
                        );
                    })}
                </div>
            }
        >
            <Tooltip content="Font Size" placement="top-start">
                <IconButton>
                    <ConnectorIcon></ConnectorIcon>
                </IconButton>
            </Tooltip>
        </Popover>
    );
};
