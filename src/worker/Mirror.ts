import EditorDocument from "../EditorDocument";
import {delayedCall} from "../lib/lang";
import WorkerCallback from "../WorkerCallback";
import Range from "../Range";

export default class Mirror {
    public sender: WorkerCallback;
    public doc: EditorDocument;
    public deferredUpdate;
    public $timeout: number;
    /**
     * Initializes the 'sender' property to the specified argument.
     * Initializes the 'doc' property to a new EditDocument.
     * Initializes the 'deferredUpdate' property to a delayed call to 'onUpdate'.
     * Binds the 'sender' "change" event to a function
     */
    constructor(sender: WorkerCallback, timeout: number = 500) {
        this.sender = sender;
        this.$timeout = timeout;
        this.doc = new EditorDocument("");

        var deferredUpdate = this.deferredUpdate = delayedCall(this.onUpdate.bind(this));

        // Binding for use in the following callback.
        var _self = this;

        sender.on('change', function(e: { data: { action: string; range: Range; text: string; lines: string[] }[] }) {

            _self.doc.applyDeltas(e.data);

            if (_self.$timeout) {
                return deferredUpdate.schedule(_self.$timeout);
            }
            else {
                // I'm not sure that we need to special-case this code.
                _self.onUpdate();
            }
        });
    }

    setTimeout(timeout: number): void {
        this.$timeout = timeout;
    }

    setValue(value: string): void {
        this.doc.setValue(value);
        this.deferredUpdate.schedule(this.$timeout);
    }

    getValue(callbackId: number) {
        this.sender.callback(this.doc.getValue(), callbackId);
    }
    
    /**
     * Called after the timeout period. Derived classes will normally perform
     * a computationally expensive analysis then report annotations to the
     * sender.
     */
    onUpdate() {
        // abstract method
    }

    isPending() {
        return this.deferredUpdate.isPending();
    }
}
