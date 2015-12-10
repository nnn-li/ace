import EditorDocument from "../EditorDocument";
import Sender from "../lib/Sender";
export default class Mirror {
    sender: Sender;
    doc: EditorDocument;
    deferredUpdate: any;
    $timeout: number;
    /**
     * Initializes the 'sender' property to the specified argument.
     * Initializes the 'doc' property to a new EditDocument.
     * Initializes the 'deferredUpdate' property to a delayed call to 'onUpdate'.
     * Binds the 'sender' "change" event to a function
     */
    constructor(sender: Sender, timeout?: number);
    setTimeout(timeout: number): void;
    setValue(value: string): void;
    getValue(callbackId: number): void;
    /**
     * Called after the timeout period. Derived classes will normally perform
     * a computationally expensive analysis then report annotations to the
     * sender.
     */
    onUpdate(): void;
    isPending(): any;
}
