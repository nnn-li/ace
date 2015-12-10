import Editor from "../Editor";
export default class TextInput {
    focus(): void;
    blur(): void;
    isFocused(): void;
    setReadOnly(readOnly: boolean): void;
    onContextMenuClose(): void;
    onContextMenu(e: any): void;
    moveToMouse(e: any, bringToFront: any): void;
    setInputHandler(cb: any): void;
    getInputHandler(): void;
    getElement(): void;
    constructor(parentNode: Element, host: Editor);
}
