export interface Touch {
    clientX: number;
    clientY: number;
    pageX: number;
    pageY: number;
}
export interface TouchEvent extends Event {
    type: string;
    touches: Touch[];
    changedTouches: Touch[];
}
export declare var TOUCH_ACTION_COMPUTE: string;
export declare var TOUCH_ACTION_AUTO: string;
export declare var TOUCH_ACTION_MANIPULATION: string;
export declare var TOUCH_ACTION_NONE: string;
export declare var TOUCH_ACTION_PAN_X: string;
export declare var TOUCH_ACTION_PAN_Y: string;
export declare class VectorE2 {
    x: any;
    y: any;
    constructor(x: number, y: number);
    add(other: VectorE2): VectorE2;
    sub(other: VectorE2): VectorE2;
    div(other: number): VectorE2;
    dot(other: VectorE2): number;
    norm(): number;
    quadrance(): number;
    toString(): string;
}
export declare class ClientLocation {
    clientX: any;
    clientY: any;
    constructor(clientX: number, clientY: number);
    moveTo(clientX: number, clientY: number): void;
    sub(other: ClientLocation): VectorE2;
    static fromTouch(touch: {
        clientX: number;
        clientY: number;
    }): ClientLocation;
    toString(): string;
}
export interface IComputedEvent {
    eventType: number;
    touchesLength: number;
    timeStamp: number;
    center: ClientLocation;
    rotation: number;
    deltaTime: number;
    distance: number;
    movement: VectorE2;
    direction: number;
    scale: number;
    velocity: VectorE2;
}
/**
 * Maintains the history of events for a gesture recognition.
 */
export declare class Session {
    startTime: number;
    stopped: number;
    curRecognizer: IRecognizer;
    private compEvents;
    constructor();
    reset(): void;
    push(compEvent: IComputedEvent): void;
    computeMovement(center: ClientLocation): VectorE2;
    computeVelocity(center: ClientLocation, deltaTime: number): VectorE2;
}
/**
 * The contract for what the Manager requires from a Recognizer.
 */
export interface IRecognizer {
    eventName: string;
    canRecognizeWith(recognizer: IRecognizer): boolean;
    recognizeWith(recognizer: IRecognizer): IRecognizer;
    requireFailure(recognizer: IRecognizer): IRecognizer;
    recognize(inputData: IComputedEvent): void;
    reset(): void;
    state: number;
    manager: IRecognizerCallback;
    id: number;
}
export interface IRecognizerCallback {
    emit(eventName: string, data?: any): any;
    get(eventName: string): IRecognizer;
    updateTouchAction(): void;
}
export declare class Manager implements IRecognizerCallback {
    handlers: {};
    session: Session;
    recognizers: IRecognizer[];
    element: any;
    input: any;
    private touchAction;
    private domEvents;
    enable: boolean;
    inputTarget: any;
    private cssProps;
    private callback;
    /**
     * Manager
     * @param {HTMLElement} element
     * @constructor
     */
    constructor(element: HTMLElement);
    /**
     * stop recognizing for this session.
     * This session will be discarded, when a new [input]start event is fired.
     * When forced, the recognizer cycle is stopped immediately.
     * @param {Boolean} [force]
     */
    stop(force: boolean): void;
    /**
     * run the recognizers!
     * called by the inputHandler function on every movement of the pointers (touches)
     * it walks through all the recognizers and tries to detect the gesture that is being made
     * @param {Object} inputData
     */
    recognize(inputData: IComputedEvent, touchEvent: TouchEvent): void;
    /**
     * get a recognizer by its event name.
     */
    get(eventName: string): IRecognizer;
    /**
     * add a recognizer to the manager
     * existing recognizers with the same event name will be removed
     * @param {Recognizer} recognizer
     */
    add(recognizer: IRecognizer): IRecognizer;
    /**
     * remove a recognizer by name or instance
     * @param {Recognizer|String} recognizer
     * @returns {Manager}
     */
    remove(recognizer: IRecognizer): this;
    /**
     * bind event
     * @param {String} events
     * @param {Function} handler
     * @returns {EventEmitter} this
     */
    on(events: string, handler: any): Manager;
    /**
     * unbind event, leave emit blank to remove all handlers
     * @param {String} events
     * @param {Function} [handler]
     * @returns {EventEmitter} this
     */
    off(events: string, handler: any): Manager;
    /**
     * emit event to the listeners
     * @param {String} event
     * @param {IComputedEvent} data
     */
    emit(eventName: string, data: Event): void;
    updateTouchAction(): void;
    /**
     * destroy the manager and unbinds all events
     * it doesn't unbind dom events, that is the user own responsibility
     */
    destroy(): void;
    toggleCssProps(add: boolean): void;
    cancelContextMenu(): void;
}
export declare var INPUT_TYPE_TOUCH: string;
export declare var INPUT_TYPE_PEN: string;
export declare var INPUT_TYPE_MOUSE: string;
export declare var INPUT_TYPE_KINECT: string;
export declare var INPUT_START: number;
export declare var INPUT_MOVE: number;
export declare var INPUT_END: number;
export declare var INPUT_CANCEL: number;
export declare function decodeEventType(eventType: number): string;
export declare var DIRECTION_UNDEFINED: number;
export declare var DIRECTION_LEFT: number;
export declare var DIRECTION_RIGHT: number;
export declare var DIRECTION_UP: number;
export declare var DIRECTION_DOWN: number;
export declare var DIRECTION_HORIZONTAL: number;
export declare var DIRECTION_VERTICAL: number;
export declare var DIRECTION_ALL: number;
/**
 * calculate the absolute distance between two points
 * @param {Object} p1 {x, y}
 * @param {Object} p2 {x, y}
 * @param {Array} [props] containing x and y keys
 * @return {Number} distance
 */
export declare function getDistance(p1: any, p2: any, props?: any): number;
/**
 * Recognizer flow explained; *
 * All recognizers have the initial state of POSSIBLE when a input session starts.
 * The definition of a input session is from the first input until the last input, with all it's movement in it. *
 * Example session for mouse-input: mousedown -> mousemove -> mouseup
 *
 * On each recognizing cycle (see Manager.recognize) the .recognize() method is executed
 * which determines with state it should be.
 *
 * If the recognizer has the state FAILED, CANCELLED or RECOGNIZED (equals ENDED), it is reset to
 * POSSIBLE to give it another change on the next cycle.
 *
 *               Possible
 *                  |
 *            +-----+---------------+
 *            |                     |
 *      +-----+-----+               |
 *      |           |               |
 *   Failed      Cancelled          |
 *                          +-------+------+
 *                          |              |
 *                      Recognized       Began
 *                                         |
 *                                      Changed
 *                                         |
 *                                     Recognized
 */
export declare var STATE_UNDEFINED: number;
export declare var STATE_POSSIBLE: number;
export declare var STATE_BEGAN: number;
export declare var STATE_CHANGED: number;
export declare var STATE_RECOGNIZED: number;
export declare var STATE_CANCELLED: number;
export declare var STATE_FAILED: number;
export declare class Recognizer implements IRecognizer {
    id: any;
    manager: IRecognizerCallback;
    eventName: string;
    enabled: boolean;
    state: number;
    simultaneous: {};
    requireFail: IRecognizer[];
    /**
     * Recognizer
     * Every recognizer needs to extend from this class.
     * @constructor
     */
    constructor(eventName: string, enabled: boolean);
    set(options: any): this;
    /**
     * recognize simultaneous with an other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    recognizeWith(otherRecognizer: IRecognizer): IRecognizer;
    /**
     * drop the simultaneous link. it doesnt remove the link on the other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    dropRecognizeWith(otherRecognizer: IRecognizer): this;
    /**
     * recognizer can only run when an other is failing
     */
    requireFailure(otherRecognizer: IRecognizer): IRecognizer;
    /**
     * drop the requireFailure link. it does not remove the link on the other recognizer.
     * @param {Recognizer} otherRecognizer
     * @returns {Recognizer} this
     */
    dropRequireFailure(otherRecognizer: IRecognizer): this;
    /**
     * has require failures boolean
     * @returns {boolean}
     */
    hasRequireFailures(): boolean;
    /**
     * if the recognizer can recognize simultaneous with an other recognizer
     * @param {Recognizer} otherRecognizer
     * @returns {Boolean}
     */
    canRecognizeWith(otherRecognizer: IRecognizer): boolean;
    /**
     * You should use `tryEmit` instead of `emit` directly to check
     * that all the needed recognizers has failed before emitting.
     * @param {Object} input
     */
    emit(): void;
    /**
     * Check that all the require failure recognizers has failed,
     * if true, it emits a gesture event,
     * otherwise, setup the state to FAILED.
     * @param {Object} input
     */
    tryEmit(): void;
    /**
     * can we emit?
     * @returns {boolean}
     */
    canEmit(): boolean;
    /**
     * update the recognizer
     * @param {Object} inputData
     */
    recognize(compEvent: IComputedEvent): void;
    /**
     * return the state of the recognizer
     * the actual recognizing happens in this method
     * @virtual
     * @param {Object} inputData
     * @returns {Const} STATE
     */
    process(inputData: IComputedEvent): number;
    /**
     * return the preferred touch-action
     * @virtual
     * @returns {Array}
     */
    getTouchAction(): string[];
    /**
     * called when the gesture isn't allowed to recognize
     * like when another is being recognized or it is disabled
     * @virtual
     */
    reset(): void;
}
/**
 * TODO: Are the string values part of the API, or just for debugging?
 * get a usable string, used as event postfix
 * @param {Const} state
 * @returns {String} state
 */
export declare function stateStr(state: number): string;
/**
 * Provide a decode of the state.
 * The result is not normative and should not be considered API.
 * Sine the state is a bit field, show all bits even though they may/should be exclusive.
 */
export declare function stateDecode(state: number): string;
/**
 * TODO: This really belongs in the input service.
 * direction cons to string
 * @param {Const} direction
 * @returns {String}
 */
export declare function directionStr(direction: number): string;
