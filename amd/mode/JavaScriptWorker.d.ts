import Mirror from "../worker/Mirror";
import Sender from "../lib/Sender";
export default class JavaScriptWorker extends Mirror {
    options: any;
    constructor(sender: Sender);
    setOptions(options?: {}): void;
    changeOptions(newOptions: any): void;
    isValidJS(str: string): boolean;
    onUpdate(): void;
}
