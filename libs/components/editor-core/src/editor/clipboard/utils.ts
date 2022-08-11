import {Editor} from "../editor";

export const shouldHandlerContinue = (event: Event, editor: Editor) => {
    const filterNodes = ['INPUT', 'SELECT', 'TEXTAREA'];

    if (event.defaultPrevented) {
        return false;
    }
    if (filterNodes.includes((event.target as HTMLElement)?.tagName)) {
        return false;
    }

    return editor.selectionManager.currentSelectInfo.type !== 'None';
};
