import EventEmitterClass from './event_emitter';
import WorkerCallback from '../WorkerCallback';

/**
 * Used in Web Workers.
 * Uses postMessage to communicate with a taget window.
 */
export default class Sender extends EventEmitterClass implements WorkerCallback {
    private target: Window;
    constructor(target: Window) {
        super();
        console.log("Sender constructor");
        this.target = target;
    }
    // FIXME: I'm not sure why we extend EventEmitterClass? Convenience?
    callback(data, callbackId: number) {
        this.target.postMessage({ type: "call", id: callbackId, data: data }, void 0);
    }
    // FIXME: I'm not sure why we extend EventEmitterClass? Convenience?
    emit(name: string, data?) {
        this.target.postMessage({ type: "event", name: name, data: data }, void 0);
    }
}