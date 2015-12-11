import Mirror from "../worker/Mirror";
import Sender from "../lib/Sender";
import JSHintOptions from "./javascript/JSHintOptions";
export default class JavaScriptWorker extends Mirror {
    options: JSHintOptions;
    constructor(sender: Sender);
    setOptions(options?: {}): void;
    changeOptions(newOptions: any): void;
    isValidJS(str: string): boolean;
    onUpdate(): void;
}
