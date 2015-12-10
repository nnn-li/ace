import Mirror from "../worker/Mirror";
import Sender from "../lib/Sender";
export default class HtmlWorker extends Mirror {
    context: any;
    constructor(sender: Sender);
    setOptions(options?: {
        context;
    }): void;
    onUpdate(): void;
}
