import Editor from "../Editor";
import HashHandler from "./HashHandler";
export default class KeyBinding {
    $editor: Editor;
    $data: any;
    $handlers: HashHandler[];
    $defaultHandler: HashHandler;
    constructor(editor: Editor);
    setDefaultHandler(kb: HashHandler): void;
    setKeyboardHandler(kb: HashHandler): void;
    addKeyboardHandler(kb: any, pos?: number): void;
    removeKeyboardHandler(kb: any): boolean;
    getKeyboardHandler(): HashHandler;
    $callKeyboardHandlers(hashId: number, keyString: string, keyCode?: number, e?: any): boolean;
    onCommandKey(e: any, hashId: number, keyCode: number): void;
    onTextInput(text: string): void;
}
