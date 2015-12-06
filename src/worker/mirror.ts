import {Document} from "../document";
import {delayedCall} from "./lib/lang";

export class Mirror {
    public sender/*FIXME: ace.WorkerSender*/;
    public doc: Document;
    public deferredUpdate;
    public $timeout: number;
    /**
     * Initializes the 'sender' property to the specified argument.
     * Initializes the 'doc' property to a new Document.
     * Initializes the 'deferredUpdate' property to a delayed call to 'onUpdate'.
     * Binds the 'sender' "change" event to a function
     */
    constructor(sender/*FIXME: ace.WorkerSender*/, timeout?: number) {
        this.sender = sender;
        this.$timeout = timeout;

        var doc = this.doc = new Document("");

        var deferredUpdate = this.deferredUpdate = delayedCall(this.onUpdate.bind(this));

        // Binding for use in the following callback.        
        var _self = this;

        sender.on('change', function(e: { data: { action: string; range: { start: { row: number; column: number }; end: { row: number; column: number } }; text: string; lines: string[] }[] }) {

            doc.applyDeltas(e.data);

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

    getValue(callbackId) {
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
