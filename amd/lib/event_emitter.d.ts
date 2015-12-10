/**
 * Intended to be used as a Mixin.
 * N.B. The original implementation was an object, the TypeScript way is
 * designed to satisfy the compiler.
 */
export default class EventEmitterClass {
    /**
     * Each event name has multiple callbacks.
     */
    _eventRegistry: {
        [name: string]: ((event, ee: EventEmitterClass) => any)[];
    };
    /**
     * There may be one default handler for an event too.
     */
    private _defaultHandlers;
    constructor();
    _dispatchEvent(eventName: string, e: any): any;
    /**
     *
     */
    _emit(eventName: string, e?: any): any;
    /**
     *
     */
    _signal(eventName: string, e?: any): void;
    once(eventName: string, callback: (event, ee: EventEmitterClass) => any): void;
    setDefaultHandler(eventName: string, callback: (event, ee: EventEmitterClass) => any): void;
    removeDefaultHandler(eventName: string, callback: (event, ee: EventEmitterClass) => any): void;
    private addEventListener(eventName, callback, capturing?);
    on(eventName: string, callback: (event, ee: EventEmitterClass) => any, capturing?: boolean): (event: any, ee: EventEmitterClass) => void;
    private removeEventListener(eventName, callback);
    private removeListener(eventName, callback);
    off(eventName: string, callback: (event, ee: EventEmitterClass) => any): void;
    removeAllListeners(eventName: string): void;
}
