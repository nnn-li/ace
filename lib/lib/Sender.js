import EventEmitterClass from './event_emitter';
export default class Sender extends EventEmitterClass {
    constructor(target) {
        super();
        this.target = target;
    }
    callback(data, callbackId) {
        this.target.postMessage({ type: "call", id: callbackId, data: data }, void 0);
    }
    emit(name, data) {
        this.target.postMessage({ type: "event", name: name, data: data }, void 0);
    }
}
