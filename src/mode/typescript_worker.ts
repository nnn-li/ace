import oop = require('../lib/oop');
import mir = require('../worker/mirror');
import lang = require('../lib/lang');
import dcm = require('../document');

/**
 * Doesn't really do much because TypeScript requires the concept of a workspace.
 * 
 * However, does provide some notifications to trigger further actions.
 */
export class TypeScriptWorker extends mir.Mirror {
    private options;

    constructor(sender/*FIXME: ace.WorkerSender*/) {
        super(sender, 500);

        this.setOptions();

        sender.emit('initAfter');
    }

    private setOptions(options?) {
        this.options = options || {};
    }

    private changeOptions(newOptions) {
        oop.mixin(this.options, newOptions);
        this.deferredUpdate.schedule(100);
    }

    public onUpdate() {
        // The normal behaviour here is to perform a syntax check and report annotations. 
        this.sender.emit("compiled");
    }
}
