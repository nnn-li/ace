import EventEmitterClass from './event_emitter';
/**
 * Used in Web Workers.
 * Uses postMessage to communicate with a taget window.
 */
export default class Sender extends EventEmitterClass {
    private target;
    constructor(target: Window);
    callback(data: any, callbackId: number): void;
    emit(name: string, data?: any): void;
}
