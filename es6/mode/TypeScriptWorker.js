"use strict";
import { mixin } from '../lib/oop';
import Mirror from '../worker/Mirror';
export default class TypeScriptWorker extends Mirror {
    constructor(sender) {
        super(sender, 500);
        this.setOptions();
        sender.emit('initAfter');
    }
    setOptions(options) {
        this.options = options || {};
    }
    changeOptions(newOptions) {
        mixin(this.options, newOptions);
        this.deferredUpdate.schedule(100);
    }
    onUpdate() {
        this.sender.emit("compiled");
    }
}
