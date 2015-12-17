import Document from "../Document";
import { delayedCall } from "../lib/lang";
export default class Mirror {
    constructor(sender, timeout = 500) {
        this.sender = sender;
        this.$timeout = timeout;
        this.doc = new Document("");
        var deferredUpdate = this.deferredUpdate = delayedCall(this.onUpdate.bind(this));
        var _self = this;
        sender.on('change', function (e) {
            _self.doc.applyDeltas(e.data);
            if (_self.$timeout) {
                return deferredUpdate.schedule(_self.$timeout);
            }
            else {
                _self.onUpdate();
            }
        });
    }
    setTimeout(timeout) {
        this.$timeout = timeout;
    }
    setValue(value) {
        this.doc.setValue(value);
        this.deferredUpdate.schedule(this.$timeout);
    }
    getValue(callbackId) {
        this.sender.callback(this.doc.getValue(), callbackId);
    }
    onUpdate() {
    }
    isPending() {
        return this.deferredUpdate.isPending();
    }
}
