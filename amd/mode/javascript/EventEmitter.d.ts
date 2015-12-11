export default class EventEmitter {
    _events: any;
    _maxListeners: any;
    constructor();
    setMaxListeners(n: any): this;
    emit(type: string, event: any, listener?: any): boolean;
    on(type: any, listener: any): this;
    once: (type: any, listener: any) => any;
    off(type: string, listener: any): this;
    removeAllListeners(type?: any): this;
    listeners(type: any): any;
    static defaultMaxListeners: number;
    static listenerCount(emitter: any, type: any): any;
}
