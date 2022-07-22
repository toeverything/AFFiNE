// import { FC, useMemo, useState } from 'react';
// import { useParams } from 'react-router-dom';
// import { TDPage } from '@toeverything/framework/whiteboard';
// import {
//     AffineWhiteboard,
//     WhiteboardMeta,
//     AffineEditorShape
// } from '@toeverything/components/affine-whiteboard';

// interface EditorShapeProps {
//     blockIds: string | string[];
//     point: [number, number];
// }

// const createEditorShape = (props: EditorShapeProps): AffineEditorShape => {
//     const block_ids = Array.isArray(props.blockIds)
//         ? props.blockIds
//         : [props.blockIds];
//     return {
//         id: block_ids.join('_'),
//         label: '',
//         childIndex: 1,
//         name: 'affine_editor',
//         parentId: 'page',
//         point: props.point,
//         rotation: 0,
//         size: [400, 200],
//         style: {
//             color: 'black',
//             size: 'small',
//             isFilled: false,
//             dash: 'draw',
//             scale: 1
//         } as any,
//         type: 'affineEditor',
//         blockIds: block_ids
//     };
// };

// const Whiteboard: FC = () => {
//     const { workspace_id, page_id } = useParams();
//     const [shapes, set_shapes] = useState<TDPage['shapes']>({});
//     const meta = useMemo<WhiteboardMeta>(() => {
//         return {
//             workspace: workspace_id,
//             rootBlockId: page_id
//         };
//     }, [workspace_id, page_id]);

//     return page_id ? <AffineWhiteboard meta={meta} shapes={shapes} /> : null;
// };

// export default Whiteboard;
