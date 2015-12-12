"use strict";

import {mixin} from '../lib/oop';
import Mirror from '../worker/Mirror';
import EditorDocument from '../EditorDocument';
import IWorkerCallback from "../IWorkerCallback";

/**
 * Doesn't really do much because TypeScript requires the concept of a workspace.
 * 
 * However, does provide some notifications to trigger further actions.
 * @class TypeScriptWorker
 * @extends Mirror
 */
export default class TypeScriptWorker extends Mirror {

    /**
     * @property options
     * @private
     */
    private options;

    /**
     * @class TypeScriptWorker
     * @constructor
     * @param sender {IWorkerCallback}
     */
    constructor(sender: IWorkerCallback) {
        super(sender, 500);

        this.setOptions();

        sender.emit('initAfter');
    }

    /**
     * @method setOptions
     * @param [options]
     * @return {void}
     * @private
     */
    private setOptions(options?) {
        this.options = options || {};
    }

    /**
     * @method changeOptions
     * @param newOptions
     * @return {void}
     * @private
     */
    private changeOptions(newOptions): void {
        mixin(this.options, newOptions);
        this.deferredUpdate.schedule(100);
    }

    /**
     * @method onUpdate
     * @return {void}
     */
    public onUpdate(): void {
        // The normal behaviour here is to perform a syntax check and report annotations. 
        this.sender.emit("compiled");
    }
}
