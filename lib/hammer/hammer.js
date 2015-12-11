import { addEventListeners, each, getWindowForElement, hasParent, inArray, inStr, prefixed, removeEventListeners, splitStr, TEST_ELEMENT, toArray, uniqueArray, uniqueId } from './utils';
export var TOUCH_ACTION_COMPUTE = 'compute';
export var TOUCH_ACTION_AUTO = 'auto';
export var TOUCH_ACTION_MANIPULATION = 'manipulation';
export var TOUCH_ACTION_NONE = 'none';
export var TOUCH_ACTION_PAN_X = 'pan-x';
export var TOUCH_ACTION_PAN_Y = 'pan-y';
var STOP = 1;
var FORCED_STOP = 2;
export class VectorE2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    add(other) {
        return new VectorE2(this.x + other.x, this.y + other.y);
    }
    sub(other) {
        return new VectorE2(this.x - other.x, this.y - other.y);
    }
    div(other) {
        return new VectorE2(this.x / other, this.y / other);
    }
    dot(other) {
        return this.x * other.x + this.y * other.y;
    }
    norm() {
        return Math.sqrt(this.quadrance());
    }
    quadrance() {
        return this.x * this.x + this.y * this.y;
    }
    toString() {
        return 'VectorE2(' + this.x + ', ' + this.y + ')';
    }
}
export class ClientLocation {
    constructor(clientX, clientY) {
        this.clientX = clientX;
        this.clientY = clientY;
    }
    moveTo(clientX, clientY) {
        this.clientX = clientX;
        this.clientY = clientY;
    }
    sub(other) {
        return new VectorE2(this.clientX - other.clientX, this.clientY - other.clientY);
    }
    static fromTouch(touch) {
        return new ClientLocation(touch.clientX, touch.clientY);
    }
    toString() {
        return 'ClientLocation(' + this.clientX + ', ' + this.clientY + ')';
    }
}
export class Session {
    constructor() {
        this.compEvents = [];
        this.reset();
    }
    reset() {
        this.startTime = Date.now();
        this.compEvents = [];
        this.curRecognizer = undefined;
    }
    push(compEvent) {
        this.compEvents.push(compEvent);
    }
    computeMovement(center) {
        if (center) {
            if (this.compEvents.length > 0) {
                var prev = this.compEvents[this.compEvents.length - 1];
                return center.sub(prev.center);
            }
            else {
                return undefined;
            }
        }
        else {
            return undefined;
        }
    }
    computeVelocity(center, deltaTime) {
        if (center) {
            if (this.compEvents.length > 0) {
                var prev = this.compEvents[this.compEvents.length - 1];
                return center.sub(prev.center).div(deltaTime - prev.deltaTime);
            }
            else {
                return undefined;
            }
        }
        else {
            return undefined;
        }
    }
}
export class Manager {
    constructor(element) {
        this.handlers = {};
        this.session = new Session();
        this.recognizers = [];
        this.domEvents = false;
        this.enable = true;
        this.cssProps = {};
        this.element = element;
        this.inputTarget = element;
        this.input = new TouchInput(this, inputHandler);
        this.touchAction = new TouchAction(this, TOUCH_ACTION_COMPUTE);
        this.toggleCssProps(true);
    }
    stop(force) {
        this.session.stopped = force ? FORCED_STOP : STOP;
    }
    recognize(inputData, touchEvent) {
        var session = this.session;
        if (session.stopped) {
            return;
        }
        this.touchAction.preventDefaults(inputData, touchEvent);
        var recognizer;
        var recognizers = this.recognizers;
        var curRecognizer = session.curRecognizer;
        if (!curRecognizer || (curRecognizer && curRecognizer.state & STATE_RECOGNIZED)) {
            curRecognizer = session.curRecognizer = null;
        }
        var i = 0;
        while (i < recognizers.length) {
            recognizer = recognizers[i];
            if (session.stopped !== FORCED_STOP && (!curRecognizer || recognizer == curRecognizer ||
                recognizer.canRecognizeWith(curRecognizer))) {
                recognizer.recognize(inputData);
            }
            else {
                recognizer.reset();
            }
            if (!curRecognizer && recognizer.state & (STATE_BEGAN | STATE_CHANGED | STATE_RECOGNIZED)) {
                curRecognizer = session.curRecognizer = recognizer;
            }
            i++;
        }
    }
    get(eventName) {
        var recognizers = this.recognizers;
        for (var i = 0; i < recognizers.length; i++) {
            if (recognizers[i].eventName === eventName) {
                return recognizers[i];
            }
        }
        return null;
    }
    add(recognizer) {
        var existing = this.get(recognizer.eventName);
        if (existing) {
            this.remove(existing);
        }
        this.recognizers.push(recognizer);
        recognizer.manager = this;
        this.touchAction.update();
        return recognizer;
    }
    remove(recognizer) {
        var recognizers = this.recognizers;
        recognizer = this.get(recognizer.eventName);
        recognizers.splice(inArray(recognizers, recognizer), 1);
        this.touchAction.update();
        return this;
    }
    on(events, handler) {
        var handlers = this.handlers;
        each(splitStr(events), function (event) {
            handlers[event] = handlers[event] || [];
            handlers[event].push(handler);
        });
        return this;
    }
    off(events, handler) {
        var handlers = this.handlers;
        each(splitStr(events), function (event) {
            if (!handler) {
                delete handlers[event];
            }
            else {
                handlers[event].splice(inArray(handlers[event], handler), 1);
            }
        });
        return this;
    }
    emit(eventName, data) {
        if (this.domEvents) {
            triggerDomEvent(event, data);
        }
        var handlers = this.handlers[eventName] && this.handlers[eventName].slice();
        if (!handlers || !handlers.length) {
            return;
        }
        var i = 0;
        while (i < handlers.length) {
            handlers[i](data);
            i++;
        }
    }
    updateTouchAction() {
        this.touchAction.update();
    }
    destroy() {
        this.element && this.toggleCssProps(false);
        this.handlers = {};
        this.session = undefined;
        this.input.destroy();
        this.element = null;
    }
    toggleCssProps(add) {
        if (!this.element.style) {
            return;
        }
        var element = this.element;
        each(this.cssProps, function (value, name) {
            element.style[prefixed(element.style, name)] = add ? value : '';
        });
    }
    cancelContextMenu() {
    }
}
function triggerDomEvent(event, data) {
    var gestureEvent = document.createEvent('Event');
    gestureEvent.initEvent(event, true, true);
    gestureEvent['gesture'] = data;
    data.target.dispatchEvent(gestureEvent);
}
var MOBILE_REGEX = /mobile|tablet|ip(ad|hone|od)|android/i;
var SUPPORT_TOUCH = ('ontouchstart' in window);
var SUPPORT_POINTER_EVENTS = prefixed(window, 'PointerEvent') !== undefined;
var SUPPORT_ONLY_TOUCH = SUPPORT_TOUCH && MOBILE_REGEX.test(navigator.userAgent);
var PREFIXED_TOUCH_ACTION = prefixed(TEST_ELEMENT.style, 'touchAction');
var NATIVE_TOUCH_ACTION = PREFIXED_TOUCH_ACTION !== undefined;
class TouchAction {
    constructor(manager, value) {
        this.manager = manager;
        this.set(value);
    }
    set(value) {
        if (value === TOUCH_ACTION_COMPUTE) {
            value = this.compute();
        }
        if (NATIVE_TOUCH_ACTION && this.manager.element.style) {
            this.manager.element.style[PREFIXED_TOUCH_ACTION] = value;
        }
        this.actions = value.toLowerCase().trim();
    }
    update() {
        this.set(TOUCH_ACTION_COMPUTE);
    }
    compute() {
        var actions = [];
        each(this.manager.recognizers, function (recognizer) {
            if (recognizer.enabled) {
                actions = actions.concat(recognizer.getTouchAction());
            }
        });
        return cleanTouchActions(actions.join(' '));
    }
    preventDefaults(input, touchEvent) {
        if (NATIVE_TOUCH_ACTION) {
            return;
        }
        if (this.prevented) {
            touchEvent.preventDefault();
            return;
        }
    }
    preventSrc(srcEvent) {
        this.prevented = true;
        srcEvent.preventDefault();
    }
}
function cleanTouchActions(actions) {
    if (inStr(actions, TOUCH_ACTION_NONE)) {
        return TOUCH_ACTION_NONE;
    }
    var hasPanX = inStr(actions, TOUCH_ACTION_PAN_X);
    var hasPanY = inStr(actions, TOUCH_ACTION_PAN_Y);
    if (hasPanX && hasPanY) {
        return TOUCH_ACTION_PAN_X + ' ' + TOUCH_ACTION_PAN_Y;
    }
    if (hasPanX || hasPanY) {
        return hasPanX ? TOUCH_ACTION_PAN_X : TOUCH_ACTION_PAN_Y;
    }
    if (inStr(actions, TOUCH_ACTION_MANIPULATION)) {
        return TOUCH_ACTION_MANIPULATION;
    }
    return TOUCH_ACTION_AUTO;
}
export var INPUT_TYPE_TOUCH = 'touch';
export var INPUT_TYPE_PEN = 'pen';
export var INPUT_TYPE_MOUSE = 'mouse';
export var INPUT_TYPE_KINECT = 'kinect';
var COMPUTE_INTERVAL = 25;
export var INPUT_START = 1;
export var INPUT_MOVE = 2;
export var INPUT_END = 4;
export var INPUT_CANCEL = 8;
export function decodeEventType(eventType) {
    switch (eventType) {
        case INPUT_START: {
            return "START";
        }
        case INPUT_MOVE: {
            return "MOVE";
        }
        case INPUT_END: {
            return "END";
        }
        case INPUT_CANCEL: {
            return "CANCEL";
        }
        default: {
            return "eventType=" + eventType;
        }
    }
}
export var DIRECTION_UNDEFINED = 0;
export var DIRECTION_LEFT = 1;
export var DIRECTION_RIGHT = 2;
export var DIRECTION_UP = 4;
export var DIRECTION_DOWN = 8;
export var DIRECTION_HORIZONTAL = DIRECTION_LEFT | DIRECTION_RIGHT;
export var DIRECTION_VERTICAL = DIRECTION_UP | DIRECTION_DOWN;
export var DIRECTION_ALL = DIRECTION_HORIZONTAL | DIRECTION_VERTICAL;
var PROPS_XY = ['x', 'y'];
var PROPS_CLIENT_XY = ['clientX', 'clientY'];
class Input {
    constructor(manager, touchElementEvents, touchTargetEvents, touchWindowEvents) {
        var self = this;
        this.manager = manager;
        this.evEl = touchElementEvents;
        this.evTarget = touchTargetEvents;
        this.evWin = touchWindowEvents;
        this.element = manager.element;
        this.target = manager.inputTarget;
        this.domHandler = function (event) {
            if (manager.enable) {
                self.handler(event);
            }
        };
        this.init();
    }
    handler(event) { }
    init() {
        this.evEl && addEventListeners(this.element, this.evEl, this.domHandler);
        this.evTarget && addEventListeners(this.target, this.evTarget, this.domHandler);
        this.evWin && addEventListeners(getWindowForElement(this.element), this.evWin, this.domHandler);
    }
    destroy() {
        this.evEl && removeEventListeners(this.element, this.evEl, this.domHandler);
        this.evTarget && removeEventListeners(this.target, this.evTarget, this.domHandler);
        this.evWin && removeEventListeners(getWindowForElement(this.element), this.evWin, this.domHandler);
    }
}
function inputHandler(manager, eventType, touchEvent) {
    var compEvent = computeIComputedEvent(manager, eventType, touchEvent);
    manager.recognize(compEvent, touchEvent);
    manager.session.push(compEvent);
}
function computeIComputedEvent(manager, eventType, touchEvent) {
    var touchesLength = touchEvent.touches.length;
    var changedPointersLen = touchEvent.changedTouches.length;
    var isFirst = (eventType & INPUT_START && (touchesLength - changedPointersLen === 0));
    var isFinal = (eventType & (INPUT_END | INPUT_CANCEL) && (touchesLength - changedPointersLen === 0));
    if (isFirst) {
        manager.session.reset();
    }
    var session = manager.session;
    var center = computeCenter(touchEvent.touches);
    var movement = session.computeMovement(center);
    var timeStamp = Date.now();
    var movementTime = timeStamp - session.startTime;
    var distance = movement ? movement.norm() : 0;
    var direction = getDirection(movement);
    var velocity = session.computeVelocity(center, movementTime);
    var compEvent = {
        center: center,
        movement: movement,
        deltaTime: movementTime,
        direction: direction,
        distance: distance,
        eventType: eventType,
        rotation: 0,
        timeStamp: timeStamp,
        touchesLength: touchEvent.touches.length,
        scale: 1,
        velocity: velocity
    };
    return compEvent;
}
function computeCenter(touches) {
    var touchesLength = touches.length;
    if (touchesLength === 1) {
        return ClientLocation.fromTouch(touches[0]);
    }
    else if (touchesLength === 0) {
        return undefined;
    }
    else {
        var x = 0, y = 0, i = 0;
        while (i < touchesLength) {
            x += touches[i].clientX;
            y += touches[i].clientY;
            i++;
        }
        return new ClientLocation(Math.round(x / touchesLength), Math.round(y / touchesLength));
    }
}
function getVelocity(deltaTime, x, y) {
    return { x: x / deltaTime || 0, y: y / deltaTime || 0 };
}
function getDirection(movement) {
    var N = new VectorE2(0, -1);
    var S = new VectorE2(0, +1);
    var E = new VectorE2(+1, 0);
    var W = new VectorE2(-1, 0);
    var cosineThreshold = Math.cos(7 * Math.PI / 16);
    if (movement) {
        var unit = movement.div(movement.norm());
        var direction = DIRECTION_UNDEFINED;
        if (unit.dot(N) > cosineThreshold) {
            direction |= DIRECTION_UP;
        }
        if (unit.dot(S) > cosineThreshold) {
            direction |= DIRECTION_DOWN;
        }
        if (unit.dot(E) > cosineThreshold) {
            direction |= DIRECTION_RIGHT;
        }
        if (unit.dot(W) > cosineThreshold) {
            direction |= DIRECTION_LEFT;
        }
        return direction;
    }
    else {
        return DIRECTION_UNDEFINED;
    }
}
export function getDistance(p1, p2, props) {
    if (!props) {
        props = PROPS_XY;
    }
    var x = p2[props[0]] - p1[props[0]], y = p2[props[1]] - p1[props[1]];
    return Math.sqrt((x * x) + (y * y));
}
function getAngle(p1, p2, props) {
    if (!props) {
        props = PROPS_XY;
    }
    var x = p2[props[0]] - p1[props[0]], y = p2[props[1]] - p1[props[1]];
    return Math.atan2(y, x) * 180 / Math.PI;
}
function getRotation(start, end) {
    return getAngle(end[1], end[0], PROPS_CLIENT_XY) - getAngle(start[1], start[0], PROPS_CLIENT_XY);
}
function getScale(start, end) {
    return getDistance(end[0], end[1], PROPS_CLIENT_XY) / getDistance(start[0], start[1], PROPS_CLIENT_XY);
}
var TOUCH_INPUT_MAP = {
    touchstart: INPUT_START,
    touchmove: INPUT_MOVE,
    touchend: INPUT_END,
    touchcancel: INPUT_CANCEL
};
var TOUCH_TARGET_EVENTS = 'touchstart touchmove touchend touchcancel';
class TouchInput extends Input {
    constructor(manager, callback) {
        super(manager, undefined, TOUCH_TARGET_EVENTS, undefined);
        this.targetIds = {};
        this.callback = callback;
    }
    handler(event) {
        var eventType = TOUCH_INPUT_MAP[event.type];
        this.callback(this.manager, eventType, event);
    }
}
function getTouches(event, type) {
    var allTouches = toArray(event.touches);
    var targetIds = this.targetIds;
    if (type & (INPUT_START | INPUT_MOVE) && allTouches.length === 1) {
        targetIds[allTouches[0].identifier] = true;
        return [allTouches, allTouches];
    }
    var i, targetTouches, changedTouches = toArray(event.changedTouches), changedTargetTouches = [], target = this.target;
    targetTouches = allTouches.filter(function (touch) {
        return hasParent(touch.target, target);
    });
    if (type === INPUT_START) {
        i = 0;
        while (i < targetTouches.length) {
            targetIds[targetTouches[i].identifier] = true;
            i++;
        }
    }
    i = 0;
    while (i < changedTouches.length) {
        if (targetIds[changedTouches[i].identifier]) {
            changedTargetTouches.push(changedTouches[i]);
        }
        if (type & (INPUT_END | INPUT_CANCEL)) {
            delete targetIds[changedTouches[i].identifier];
        }
        i++;
    }
    if (!changedTargetTouches.length) {
        return;
    }
    return [
        uniqueArray(targetTouches.concat(changedTargetTouches), 'identifier', true),
        changedTargetTouches
    ];
}
export var STATE_UNDEFINED = 0;
export var STATE_POSSIBLE = 1;
export var STATE_BEGAN = 2;
export var STATE_CHANGED = 4;
export var STATE_RECOGNIZED = 8;
export var STATE_CANCELLED = 16;
export var STATE_FAILED = 32;
export class Recognizer {
    constructor(eventName, enabled) {
        this.simultaneous = {};
        this.requireFail = [];
        this.eventName = eventName;
        this.enabled = enabled;
        this.id = uniqueId();
        this.manager = null;
        this.state = STATE_POSSIBLE;
    }
    set(options) {
        this.manager && this.manager.updateTouchAction();
        return this;
    }
    recognizeWith(otherRecognizer) {
        var simultaneous = this.simultaneous;
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
        if (!simultaneous[otherRecognizer.id]) {
            simultaneous[otherRecognizer.id] = otherRecognizer;
            otherRecognizer.recognizeWith(this);
        }
        return this;
    }
    dropRecognizeWith(otherRecognizer) {
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
        delete this.simultaneous[otherRecognizer.id];
        return this;
    }
    requireFailure(otherRecognizer) {
        var requireFail = this.requireFail;
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
        if (inArray(requireFail, otherRecognizer) === -1) {
            requireFail.push(otherRecognizer);
            otherRecognizer.requireFailure(this);
        }
        return this;
    }
    dropRequireFailure(otherRecognizer) {
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
        var index = inArray(this.requireFail, otherRecognizer);
        if (index > -1) {
            this.requireFail.splice(index, 1);
        }
        return this;
    }
    hasRequireFailures() {
        return this.requireFail.length > 0;
    }
    canRecognizeWith(otherRecognizer) {
        return !!this.simultaneous[otherRecognizer.id];
    }
    emit() {
        var self = this;
        var state = this.state;
        function emit(withState) {
            var eventName = self.eventName + (withState ? stateStr(state) : '');
            self.manager.emit(eventName, undefined);
        }
        if (state < STATE_RECOGNIZED) {
            emit(true);
        }
        emit(false);
        if (state >= STATE_RECOGNIZED) {
            emit(true);
        }
    }
    tryEmit() {
        if (this.canEmit()) {
            return this.emit();
        }
        else {
        }
        this.state = STATE_FAILED;
    }
    canEmit() {
        var i = 0;
        while (i < this.requireFail.length) {
            if (!(this.requireFail[i].state & (STATE_FAILED | STATE_POSSIBLE))) {
                return false;
            }
            i++;
        }
        return true;
    }
    recognize(compEvent) {
        if (!this.enabled) {
            this.reset();
            this.state = STATE_FAILED;
            return;
        }
        if (this.state & (STATE_RECOGNIZED | STATE_CANCELLED | STATE_FAILED)) {
            this.state = STATE_POSSIBLE;
        }
        this.state = this.process(compEvent);
        if (this.state & (STATE_BEGAN | STATE_CHANGED | STATE_RECOGNIZED | STATE_CANCELLED)) {
            this.tryEmit();
        }
    }
    process(inputData) {
        return STATE_UNDEFINED;
    }
    getTouchAction() { return []; }
    reset() { }
}
export function stateStr(state) {
    if (state & STATE_CANCELLED) {
        return 'cancel';
    }
    else if (state & STATE_RECOGNIZED) {
        return 'end';
    }
    else if (state & STATE_CHANGED) {
        return 'move';
    }
    else if (state & STATE_BEGAN) {
        return 'start';
    }
    return '';
}
export function stateDecode(state) {
    var states = [];
    if (state & STATE_POSSIBLE) {
        states.push('STATE_POSSIBLE');
    }
    else if (state & STATE_CANCELLED) {
        states.push('STATE_CANCELLED');
    }
    else if (state & STATE_RECOGNIZED) {
        states.push('STATE_RECOGNIZED');
    }
    else if (state & STATE_CHANGED) {
        states.push('STATE_CHANGED');
    }
    else if (state & STATE_BEGAN) {
        states.push('STATE_BEGAN');
    }
    else if (state & STATE_UNDEFINED) {
        states.push('STATE_UNDEFINED');
    }
    else if (state & STATE_FAILED) {
        states.push('STATE_FAILED');
    }
    else {
        states.push('' + state);
    }
    return states.join(' ');
}
export function directionStr(direction) {
    var ds = [];
    if (direction & DIRECTION_DOWN) {
        ds.push('down');
    }
    if (direction & DIRECTION_UP) {
        ds.push('up');
    }
    if (direction & DIRECTION_LEFT) {
        ds.push('left');
    }
    if (direction & DIRECTION_RIGHT) {
        ds.push('right');
    }
    return ds.join(' ');
}
function getRecognizerByNameIfManager(recognizer, manager) {
    if (manager) {
        return manager.get(recognizer.eventName);
    }
    return recognizer;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFtbWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2hhbW1lci9oYW1tZXIudHMiXSwibmFtZXMiOlsiVmVjdG9yRTIiLCJWZWN0b3JFMi5jb25zdHJ1Y3RvciIsIlZlY3RvckUyLmFkZCIsIlZlY3RvckUyLnN1YiIsIlZlY3RvckUyLmRpdiIsIlZlY3RvckUyLmRvdCIsIlZlY3RvckUyLm5vcm0iLCJWZWN0b3JFMi5xdWFkcmFuY2UiLCJWZWN0b3JFMi50b1N0cmluZyIsIkNsaWVudExvY2F0aW9uIiwiQ2xpZW50TG9jYXRpb24uY29uc3RydWN0b3IiLCJDbGllbnRMb2NhdGlvbi5tb3ZlVG8iLCJDbGllbnRMb2NhdGlvbi5zdWIiLCJDbGllbnRMb2NhdGlvbi5mcm9tVG91Y2giLCJDbGllbnRMb2NhdGlvbi50b1N0cmluZyIsIlNlc3Npb24iLCJTZXNzaW9uLmNvbnN0cnVjdG9yIiwiU2Vzc2lvbi5yZXNldCIsIlNlc3Npb24ucHVzaCIsIlNlc3Npb24uY29tcHV0ZU1vdmVtZW50IiwiU2Vzc2lvbi5jb21wdXRlVmVsb2NpdHkiLCJNYW5hZ2VyIiwiTWFuYWdlci5jb25zdHJ1Y3RvciIsIk1hbmFnZXIuc3RvcCIsIk1hbmFnZXIucmVjb2duaXplIiwiTWFuYWdlci5nZXQiLCJNYW5hZ2VyLmFkZCIsIk1hbmFnZXIucmVtb3ZlIiwiTWFuYWdlci5vbiIsIk1hbmFnZXIub2ZmIiwiTWFuYWdlci5lbWl0IiwiTWFuYWdlci51cGRhdGVUb3VjaEFjdGlvbiIsIk1hbmFnZXIuZGVzdHJveSIsIk1hbmFnZXIudG9nZ2xlQ3NzUHJvcHMiLCJNYW5hZ2VyLmNhbmNlbENvbnRleHRNZW51IiwidHJpZ2dlckRvbUV2ZW50IiwiVG91Y2hBY3Rpb24iLCJUb3VjaEFjdGlvbi5jb25zdHJ1Y3RvciIsIlRvdWNoQWN0aW9uLnNldCIsIlRvdWNoQWN0aW9uLnVwZGF0ZSIsIlRvdWNoQWN0aW9uLmNvbXB1dGUiLCJUb3VjaEFjdGlvbi5wcmV2ZW50RGVmYXVsdHMiLCJUb3VjaEFjdGlvbi5wcmV2ZW50U3JjIiwiY2xlYW5Ub3VjaEFjdGlvbnMiLCJkZWNvZGVFdmVudFR5cGUiLCJJbnB1dCIsIklucHV0LmNvbnN0cnVjdG9yIiwiSW5wdXQuaGFuZGxlciIsIklucHV0LmluaXQiLCJJbnB1dC5kZXN0cm95IiwiaW5wdXRIYW5kbGVyIiwiY29tcHV0ZUlDb21wdXRlZEV2ZW50IiwiY29tcHV0ZUNlbnRlciIsImdldFZlbG9jaXR5IiwiZ2V0RGlyZWN0aW9uIiwiZ2V0RGlzdGFuY2UiLCJnZXRBbmdsZSIsImdldFJvdGF0aW9uIiwiZ2V0U2NhbGUiLCJUb3VjaElucHV0IiwiVG91Y2hJbnB1dC5jb25zdHJ1Y3RvciIsIlRvdWNoSW5wdXQuaGFuZGxlciIsImdldFRvdWNoZXMiLCJSZWNvZ25pemVyIiwiUmVjb2duaXplci5jb25zdHJ1Y3RvciIsIlJlY29nbml6ZXIuc2V0IiwiUmVjb2duaXplci5yZWNvZ25pemVXaXRoIiwiUmVjb2duaXplci5kcm9wUmVjb2duaXplV2l0aCIsIlJlY29nbml6ZXIucmVxdWlyZUZhaWx1cmUiLCJSZWNvZ25pemVyLmRyb3BSZXF1aXJlRmFpbHVyZSIsIlJlY29nbml6ZXIuaGFzUmVxdWlyZUZhaWx1cmVzIiwiUmVjb2duaXplci5jYW5SZWNvZ25pemVXaXRoIiwiUmVjb2duaXplci5lbWl0IiwiUmVjb2duaXplci5lbWl0LmVtaXQiLCJSZWNvZ25pemVyLnRyeUVtaXQiLCJSZWNvZ25pemVyLmNhbkVtaXQiLCJSZWNvZ25pemVyLnJlY29nbml6ZSIsIlJlY29nbml6ZXIucHJvY2VzcyIsIlJlY29nbml6ZXIuZ2V0VG91Y2hBY3Rpb24iLCJSZWNvZ25pemVyLnJlc2V0Iiwic3RhdGVTdHIiLCJzdGF0ZURlY29kZSIsImRpcmVjdGlvblN0ciIsImdldFJlY29nbml6ZXJCeU5hbWVJZk1hbmFnZXIiXSwibWFwcGluZ3MiOiJPQUFPLEVBQUUsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLG1CQUFtQixFQUFFLFNBQVMsRUFBRSxP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QUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsSUFBSUEsSUFBSUEsR0FBbUJBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN2RUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNGQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNyQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDckJBLENBQUNBO0lBQ0xBLENBQUNBO0lBQ0RKLGVBQWVBLENBQUNBLE1BQXNCQSxFQUFFQSxTQUFpQkE7UUFDckRLLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ1RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsSUFBSUEsSUFBSUEsR0FBbUJBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN2RUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDbkVBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNGQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNyQkEs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Q0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDNUJBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQzVCQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUc1QkEsSUFBSUEsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDakRBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBQ1hBLElBQUlBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO1FBQ3pDQSxJQUFJQSxTQUFTQSxHQUFHQSxtQkFBbUJBLENBQUNBO1FBQ3BDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsU0FBU0EsSUFBSUEsWUFBWUEsQ0FBQ0E7UUFDOUJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxTQUFTQSxJQUFJQSxjQUFjQSxDQUFDQTtRQUNoQ0EsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLFNBQVNBLElBQUlBLGVBQWVBLENBQUNBO1FBQ2pDQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsU0FBU0EsSUFBSUEsY0FBY0EsQ0FBQ0E7UUFDaENBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBO0lBQ3JCQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxNQUFNQSxDQUFDQSxtQkFBbUJBLENBQUNBO0lBQy9CQSxDQUFDQTtBQUNMQSxDQUFDQTtBQVNELDRCQUE0QixFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQU07SUFDdENDLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1FBQ1RBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBO0lBQ3JCQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUMvQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFFcENBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0FBQ3hDQSxDQUFDQTtBQVNELGtCQUFrQixFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQU07SUFDNUJDLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1FBQ1RBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBO0lBQ3JCQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUMvQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDcENBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBO0FBQzVDQSxDQUFDQTtBQVFELHFCQUFxQixLQUFLLEVBQUUsR0FBRztJQUMzQkMsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsZUFBZUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsZUFBZUEsQ0FBQ0EsQ0FBQ0E7QUFDckdBLENBQUNBO0FBU0Qsa0JBQWtCLEtBQUssRUFBRSxHQUFHO0lBQ3hCQyxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxlQUFlQSxDQUFDQSxHQUFHQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxlQUFlQSxDQUFDQSxDQUFDQTtBQUMzR0EsQ0FBQ0E7QUFFRCxJQUFJLGVBQWUsR0FBNkI7SUFDNUMsVUFBVSxFQUFFLFdBQVc7SUFDdkIsU0FBUyxFQUFFLFVBQVU7SUFDckIsUUFBUSxFQUFFLFNBQVM7SUFDbkIsV0FBVyxFQUFFLFlBQVk7Q0FDNUIsQ0FBQztBQUVGLElBQUksbUJBQW1CLEdBQUcsMkNBQTJDLENBQUM7QUFFdEUseUJBQXlCLEtBQUs7SUFRMUJDLFlBQVlBLE9BQWdCQSxFQUFFQSxRQUFvRUE7UUFHOUZDLE1BQU1BLE9BQU9BLEVBQUVBLFNBQVNBLEVBQUVBLG1CQUFtQkEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFWdERBLGNBQVNBLEdBQUdBLEVBQUVBLENBQUNBO1FBV25CQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFDREQsT0FBT0EsQ0FBQ0EsS0FBaUJBO1FBQ3JCRSxJQUFJQSxTQUFTQSxHQUFXQSxlQUFlQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsU0FBU0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDbERBLENBQUNBO0FBQ0xGLENBQUNBO0FBUUQsb0JBQW9CLEtBQWlCLEVBQUUsSUFBWTtJQUMvQ0csSUFBSUEsVUFBVUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7SUFDeENBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO0lBRy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxXQUFXQSxHQUFHQSxVQUFVQSxDQUFDQSxJQUFJQSxVQUFVQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMvREEsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDM0NBLE1BQU1BLENBQUNBLENBQUNBLFVBQVVBLEVBQUVBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3BDQSxDQUFDQTtJQUVEQSxJQUFJQSxDQUFDQSxFQUNEQSxhQUFhQSxFQUNiQSxjQUFjQSxHQUFHQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxFQUM5Q0Esb0JBQW9CQSxHQUFHQSxFQUFFQSxFQUN6QkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFHekJBLGFBQWFBLEdBQUdBLFVBQVVBLENBQUNBLE1BQU1BLENBQUNBLFVBQVNBLEtBQUtBO1FBQzVDLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztJQUMzQyxDQUFDLENBQUNBLENBQUNBO0lBR0hBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZCQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNOQSxPQUFPQSxDQUFDQSxHQUFHQSxhQUFhQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUM5QkEsU0FBU0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDOUNBLENBQUNBLEVBQUVBLENBQUNBO1FBQ1JBLENBQUNBO0lBQ0xBLENBQUNBO0lBR0RBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO0lBQ05BLE9BQU9BLENBQUNBLEdBQUdBLGNBQWNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO1FBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQ0Esb0JBQW9CQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqREEsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0EsU0FBU0EsR0FBR0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLE9BQU9BLFNBQVNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ25EQSxDQUFDQTtRQUNEQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUNSQSxDQUFDQTtJQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxvQkFBb0JBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1FBQy9CQSxNQUFNQSxDQUFDQTtJQUNYQSxDQUFDQTtJQUVEQSxNQUFNQSxDQUFDQTtRQUVIQSxXQUFXQSxDQUFDQSxhQUFhQSxDQUFDQSxNQUFNQSxDQUFDQSxvQkFBb0JBLENBQUNBLEVBQUVBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBO1FBQzNFQSxvQkFBb0JBO0tBQ3ZCQSxDQUFDQTtBQUNOQSxDQUFDQTtBQTZCRCxXQUFXLGVBQWUsR0FBRyxDQUFDLENBQUM7QUFDL0IsV0FBVyxjQUFjLEdBQUcsQ0FBQyxDQUFDO0FBQzlCLFdBQVcsV0FBVyxHQUFHLENBQUMsQ0FBQztBQUMzQixXQUFXLGFBQWEsR0FBRyxDQUFDLENBQUM7QUFDN0IsV0FBVyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7QUFDaEMsV0FBVyxlQUFlLEdBQUcsRUFBRSxDQUFDO0FBQ2hDLFdBQVcsWUFBWSxHQUFHLEVBQUUsQ0FBQztBQUU3QjtJQWFJQyxZQUFZQSxTQUFpQkEsRUFBRUEsT0FBZ0JBO1FBUHhDQyxpQkFBWUEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDbEJBLGdCQUFXQSxHQUFrQkEsRUFBRUEsQ0FBQ0E7UUFPbkNBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1FBQzNCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxPQUFPQSxDQUFDQTtRQUN2QkEsSUFBSUEsQ0FBQ0EsRUFBRUEsR0FBR0EsUUFBUUEsRUFBRUEsQ0FBQ0E7UUFFckJBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO1FBTXBCQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxjQUFjQSxDQUFDQTtJQUNoQ0EsQ0FBQ0E7SUFDREQsR0FBR0EsQ0FBQ0EsT0FBT0E7UUFJUEUsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUNqREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBT0RGLGFBQWFBLENBQUNBLGVBQTRCQTtRQUN0Q0csSUFBSUEsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7UUFDckNBLGVBQWVBLEdBQUdBLDRCQUE0QkEsQ0FBQ0EsZUFBZUEsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDOUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFlBQVlBLENBQUNBLGVBQWVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BDQSxZQUFZQSxDQUFDQSxlQUFlQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxlQUFlQSxDQUFDQTtZQUNuREEsZUFBZUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQU9ESCxpQkFBaUJBLENBQUNBLGVBQTRCQTtRQUMxQ0ksZUFBZUEsR0FBR0EsNEJBQTRCQSxDQUFDQSxlQUFlQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUM5RUEsT0FBT0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUtESixjQUFjQSxDQUFDQSxlQUE0QkE7UUFDdkNLLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO1FBQ25DQSxlQUFlQSxHQUFHQSw0QkFBNEJBLENBQUNBLGVBQWVBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzlFQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxXQUFXQSxFQUFFQSxlQUFlQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7WUFDbENBLGVBQWVBLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFPREwsa0JBQWtCQSxDQUFDQSxlQUE0QkE7UUFDM0NNLGVBQWVBLEdBQUdBLDRCQUE0QkEsQ0FBQ0EsZUFBZUEsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDOUVBLElBQUlBLEtBQUtBLEdBQUdBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLGVBQWVBLENBQUNBLENBQUNBO1FBQ3ZEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBTUROLGtCQUFrQkE7UUFDZE8sTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDdkNBLENBQUNBO0lBT0RQLGdCQUFnQkEsQ0FBQ0EsZUFBNEJBO1FBQ3pDUSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxlQUFlQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNuREEsQ0FBQ0E7SUFPRFIsSUFBSUE7UUFDQVMsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1FBRXZCQSxjQUFjQSxTQUFtQkE7WUFDN0JDLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLFNBQVNBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3BFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM1Q0EsQ0FBQ0E7UUFJREQsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDZkEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFHWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDZkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFRRFQsT0FBT0E7UUFDSFcsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1FBQ3ZCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNOQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxZQUFZQSxDQUFDQTtJQUM5QkEsQ0FBQ0E7SUFNRFgsT0FBT0E7UUFDSFksSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDVkEsT0FBT0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFDakNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLElB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QUE2QixTQUFpQjtJQUMxQ0MsSUFBSUEsRUFBRUEsR0FBYUEsRUFBRUEsQ0FBQ0E7SUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLEdBQUdBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1FBQzdCQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDM0JBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQ2xCQSxDQUFDQTtJQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM3QkEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDcEJBLENBQUNBO0lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLEdBQUdBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUNyQkEsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7QUFDeEJBLENBQUNBO0FBUUQsc0NBQXNDLFVBQXVCLEVBQUUsT0FBNEI7SUFDdkZDLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1FBQ1ZBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO0lBQzdDQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtBQUN0QkEsQ0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBhZGRFdmVudExpc3RlbmVycywgZWFjaCwgZ2V0V2luZG93Rm9yRWxlbWVudCwgaGFzUGFyZW50LCBpbkFycmF5LCBpblN0ciwgcHJlZml4ZWQsIHJlbW92ZUV2ZW50TGlzdGVuZXJzLCBzcGxpdFN0ciwgVEVTVF9FTEVNRU5ULCB0b0FycmF5LCB1bmlxdWVBcnJheSwgdW5pcXVlSWQgfSBmcm9tICcuL3V0aWxzJztcblxuZXhwb3J0IGludGVyZmFjZSBUb3VjaCB7XG4gICAgY2xpZW50WDogbnVtYmVyO1xuICAgIGNsaWVudFk6IG51bWJlcjtcbiAgICBwYWdlWDogbnVtYmVyO1xuICAgIHBhZ2VZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVG91Y2hFdmVudCBleHRlbmRzIEV2ZW50IHtcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgdG91Y2hlczogVG91Y2hbXTtcbiAgICBjaGFuZ2VkVG91Y2hlczogVG91Y2hbXTtcbn1cblxuLy8gbWFnaWNhbCB0b3VjaEFjdGlvbiB2YWx1ZVxuZXhwb3J0IHZhciBUT1VDSF9BQ1RJT05fQ09NUFVURSA9ICdjb21wdXRlJztcbmV4cG9ydCB2YXIgVE9VQ0hfQUNUSU9OX0FVVE8gPSAnYXV0byc7XG5leHBvcnQgdmFyIFRPVUNIX0FDVElPTl9NQU5JUFVMQVRJT04gPSAnbWFuaXB1bGF0aW9uJzsgLy8gbm90IGltcGxlbWVudGVkXG5leHBvcnQgdmFyIFRPVUNIX0FDVElPTl9OT05FID0gJ25vbmUnO1xuZXhwb3J0IHZhciBUT1VDSF9BQ1RJT05fUEFOX1ggPSAncGFuLXgnO1xuZXhwb3J0IHZhciBUT1VDSF9BQ1RJT05fUEFOX1kgPSAncGFuLXknO1xuXG52YXIgU1RPUCA9IDE7XG52YXIgRk9SQ0VEX1NUT1AgPSAyO1xuXG5leHBvcnQgY2xhc3MgVmVjdG9yRTIge1xuICAgIHB1YmxpYyB4O1xuICAgIHB1YmxpYyB5O1xuICAgIGNvbnN0cnVjdG9yKHg6IG51bWJlciwgeTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMueCA9IHg7XG4gICAgICAgIHRoaXMueSA9IHk7XG4gICAgfVxuICAgIGFkZChvdGhlcjogVmVjdG9yRTIpOiBWZWN0b3JFMiB7XG4gICAgICAgIHJldHVybiBuZXcgVmVjdG9yRTIodGhpcy54ICsgb3RoZXIueCwgdGhpcy55ICsgb3RoZXIueSk7XG4gICAgfVxuICAgIHN1YihvdGhlcjogVmVjdG9yRTIpOiBWZWN0b3JFMiB7XG4gICAgICAgIHJldHVybiBuZXcgVmVjdG9yRTIodGhpcy54IC0gb3RoZXIueCwgdGhpcy55IC0gb3RoZXIueSk7XG4gICAgfVxuICAgIGRpdihvdGhlcjogbnVtYmVyKTogVmVjdG9yRTIge1xuICAgICAgICByZXR1cm4gbmV3IFZlY3RvckUyKHRoaXMueCAvIG90aGVyLCB0aGlzLnkgLyBvdGhlcik7XG4gICAgfVxuICAgIGRvdChvdGhlcjogVmVjdG9yRTIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy54ICogb3RoZXIueCArIHRoaXMueSAqIG90aGVyLnk7XG4gICAgfVxuICAgIG5vcm0oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIE1hdGguc3FydCh0aGlzLnF1YWRyYW5jZSgpKTtcbiAgICB9XG4gICAgcXVhZHJhbmNlKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnggKiB0aGlzLnggKyB0aGlzLnkgKiB0aGlzLnk7XG4gICAgfVxuICAgIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiAnVmVjdG9yRTIoJyArIHRoaXMueCArICcsICcgKyB0aGlzLnkgKyAnKSc7XG4gICAgfVxufVxuXG5leHBvcnQgY2xhc3MgQ2xpZW50TG9jYXRpb24ge1xuICAgIHB1YmxpYyBjbGllbnRYO1xuICAgIHB1YmxpYyBjbGllbnRZO1xuICAgIGNvbnN0cnVjdG9yKGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGNsaWVudFk7XG4gICAgfVxuICAgIG1vdmVUbyhjbGllbnRYOiBudW1iZXIsIGNsaWVudFk6IG51bWJlcikge1xuICAgICAgICB0aGlzLmNsaWVudFggPSBjbGllbnRYO1xuICAgICAgICB0aGlzLmNsaWVudFkgPSBjbGllbnRZO1xuICAgIH1cbiAgICBzdWIob3RoZXI6IENsaWVudExvY2F0aW9uKTogVmVjdG9yRTIge1xuICAgICAgICByZXR1cm4gbmV3IFZlY3RvckUyKHRoaXMuY2xpZW50WCAtIG90aGVyLmNsaWVudFgsIHRoaXMuY2xpZW50WSAtIG90aGVyLmNsaWVudFkpO1xuICAgIH1cbiAgICBzdGF0aWMgZnJvbVRvdWNoKHRvdWNoOiB7IGNsaWVudFg6IG51bWJlcjsgY2xpZW50WTogbnVtYmVyIH0pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBDbGllbnRMb2NhdGlvbih0b3VjaC5jbGllbnRYLCB0b3VjaC5jbGllbnRZKTtcbiAgICB9XG4gICAgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdDbGllbnRMb2NhdGlvbignICsgdGhpcy5jbGllbnRYICsgJywgJyArIHRoaXMuY2xpZW50WSArICcpJztcbiAgICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXB1dGVkRXZlbnQge1xuICAgIGV2ZW50VHlwZTogbnVtYmVyO1xuICAgIHRvdWNoZXNMZW5ndGg6IG51bWJlcjtcbiAgICB0aW1lU3RhbXA6IG51bWJlcjtcbiAgICBjZW50ZXI6IENsaWVudExvY2F0aW9uO1xuICAgIHJvdGF0aW9uOiBudW1iZXI7XG4gICAgZGVsdGFUaW1lOiBudW1iZXI7XG4gICAgZGlzdGFuY2U6IG51bWJlcjtcbiAgICBtb3ZlbWVudDogVmVjdG9yRTI7XG4gICAgZGlyZWN0aW9uOiBudW1iZXI7XG4gICAgc2NhbGU6IG51bWJlcjtcbiAgICB2ZWxvY2l0eTogVmVjdG9yRTI7XG59XG5cbi8qKlxuICogTWFpbnRhaW5zIHRoZSBoaXN0b3J5IG9mIGV2ZW50cyBmb3IgYSBnZXN0dXJlIHJlY29nbml0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbiB7XG4gICAgcHVibGljIHN0YXJ0VGltZTogbnVtYmVyO1xuICAgIHB1YmxpYyBzdG9wcGVkOiBudW1iZXI7XG4gICAgcHVibGljIGN1clJlY29nbml6ZXI6IElSZWNvZ25pemVyO1xuICAgIHByaXZhdGUgY29tcEV2ZW50czogSUNvbXB1dGVkRXZlbnRbXSA9IFtdO1xuICAgIGNvbnN0cnVjdG9yKCkge1xuICAgICAgICB0aGlzLnJlc2V0KCk7XG4gICAgfVxuICAgIHJlc2V0KCk6IHZvaWQge1xuICAgICAgICB0aGlzLnN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgICAgIHRoaXMuY29tcEV2ZW50cyA9IFtdO1xuICAgICAgICB0aGlzLmN1clJlY29nbml6ZXIgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHB1c2goY29tcEV2ZW50OiBJQ29tcHV0ZWRFdmVudCk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbXBFdmVudHMucHVzaChjb21wRXZlbnQpO1xuICAgIH1cbiAgICBjb21wdXRlTW92ZW1lbnQoY2VudGVyOiBDbGllbnRMb2NhdGlvbik6IFZlY3RvckUyIHtcbiAgICAgICAgaWYgKGNlbnRlcikge1xuICAgICAgICAgICAgaWYgKHRoaXMuY29tcEV2ZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdmFyIHByZXY6IElDb21wdXRlZEV2ZW50ID0gdGhpcy5jb21wRXZlbnRzW3RoaXMuY29tcEV2ZW50cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2VudGVyLnN1YihwcmV2LmNlbnRlcik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb21wdXRlVmVsb2NpdHkoY2VudGVyOiBDbGllbnRMb2NhdGlvbiwgZGVsdGFUaW1lOiBudW1iZXIpOiBWZWN0b3JFMiB7XG4gICAgICAgIGlmIChjZW50ZXIpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmNvbXBFdmVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIHZhciBwcmV2OiBJQ29tcHV0ZWRFdmVudCA9IHRoaXMuY29tcEV2ZW50c1t0aGlzLmNvbXBFdmVudHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNlbnRlci5zdWIocHJldi5jZW50ZXIpLmRpdihkZWx0YVRpbWUgLSBwcmV2LmRlbHRhVGltZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG4vKipcbiAqIFRoZSBjb250cmFjdCBmb3Igd2hhdCB0aGUgTWFuYWdlciByZXF1aXJlcyBmcm9tIGEgUmVjb2duaXplci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUmVjb2duaXplciB7XG4gICAgZXZlbnROYW1lOiBzdHJpbmc7XG4gICAgY2FuUmVjb2duaXplV2l0aChyZWNvZ25pemVyOiBJUmVjb2duaXplcik6IGJvb2xlYW47XG4gICAgcmVjb2duaXplV2l0aChyZWNvZ25pemVyOiBJUmVjb2duaXplcik6IElSZWNvZ25pemVyO1xuICAgIHJlcXVpcmVGYWlsdXJlKHJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogSVJlY29nbml6ZXI7XG4gICAgcmVjb2duaXplKGlucHV0RGF0YTogSUNvbXB1dGVkRXZlbnQpOiB2b2lkO1xuICAgIHJlc2V0KCk6IHZvaWQ7XG4gICAgc3RhdGU6IG51bWJlcjtcbiAgICBtYW5hZ2VyOiBJUmVjb2duaXplckNhbGxiYWNrO1xuICAgIGlkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlY29nbml6ZXJDYWxsYmFjayB7XG4gICAgZW1pdChldmVudE5hbWU6IHN0cmluZywgZGF0YT8pO1xuICAgIGdldChldmVudE5hbWU6IHN0cmluZyk6IElSZWNvZ25pemVyO1xuICAgIHVwZGF0ZVRvdWNoQWN0aW9uKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VyIGltcGxlbWVudHMgSVJlY29nbml6ZXJDYWxsYmFjayB7XG4gICAgcHVibGljIGhhbmRsZXJzID0ge307XG4gICAgcHVibGljIHNlc3Npb24gPSBuZXcgU2Vzc2lvbigpO1xuICAgIHB1YmxpYyByZWNvZ25pemVyczogSVJlY29nbml6ZXJbXSA9IFtdO1xuICAgIHB1YmxpYyBlbGVtZW50O1xuICAgIHB1YmxpYyBpbnB1dDtcbiAgICBwcml2YXRlIHRvdWNoQWN0aW9uOiBUb3VjaEFjdGlvbjtcbiAgICAvLyBUaGUgZm9sbG93aW5nIHByb3BlcnRpZXMgYXJlIGRlZmF1bHRzLlxuICAgIHByaXZhdGUgZG9tRXZlbnRzID0gZmFsc2U7XG4gICAgcHVibGljIGVuYWJsZSA9IHRydWU7ICAvLyBXaGF0IGRvZXMgdGhpcyBlbmFibGU/XG4gICAgcHVibGljIGlucHV0VGFyZ2V0O1xuICAgIHByaXZhdGUgY3NzUHJvcHMgPSB7fTtcbiAgICBwcml2YXRlIGNhbGxiYWNrOiBJUmVjb2duaXplckNhbGxiYWNrO1xuICAgIC8qKlxuICAgICAqIE1hbmFnZXJcbiAgICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbGVtZW50XG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoZWxlbWVudDogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gZWxlbWVudDtcbiAgICAgICAgdGhpcy5pbnB1dFRhcmdldCA9IGVsZW1lbnQ7IC8vIFdoeSB3b3VsZCB0aGlzIGJlIGRpZmZlcmVudD9cbiAgICAgICAgdGhpcy5pbnB1dCA9IG5ldyBUb3VjaElucHV0KHRoaXMsIGlucHV0SGFuZGxlcik7XG4gICAgICAgIHRoaXMudG91Y2hBY3Rpb24gPSBuZXcgVG91Y2hBY3Rpb24odGhpcywgVE9VQ0hfQUNUSU9OX0NPTVBVVEUpO1xuICAgICAgICB0aGlzLnRvZ2dsZUNzc1Byb3BzKHRydWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHN0b3AgcmVjb2duaXppbmcgZm9yIHRoaXMgc2Vzc2lvbi5cbiAgICAgKiBUaGlzIHNlc3Npb24gd2lsbCBiZSBkaXNjYXJkZWQsIHdoZW4gYSBuZXcgW2lucHV0XXN0YXJ0IGV2ZW50IGlzIGZpcmVkLlxuICAgICAqIFdoZW4gZm9yY2VkLCB0aGUgcmVjb2duaXplciBjeWNsZSBpcyBzdG9wcGVkIGltbWVkaWF0ZWx5LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gW2ZvcmNlXVxuICAgICAqL1xuICAgIHN0b3AoZm9yY2U6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnN0b3BwZWQgPSBmb3JjZSA/IEZPUkNFRF9TVE9QIDogU1RPUDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBydW4gdGhlIHJlY29nbml6ZXJzIVxuICAgICAqIGNhbGxlZCBieSB0aGUgaW5wdXRIYW5kbGVyIGZ1bmN0aW9uIG9uIGV2ZXJ5IG1vdmVtZW50IG9mIHRoZSBwb2ludGVycyAodG91Y2hlcylcbiAgICAgKiBpdCB3YWxrcyB0aHJvdWdoIGFsbCB0aGUgcmVjb2duaXplcnMgYW5kIHRyaWVzIHRvIGRldGVjdCB0aGUgZ2VzdHVyZSB0aGF0IGlzIGJlaW5nIG1hZGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gaW5wdXREYXRhXG4gICAgICovXG4gICAgcmVjb2duaXplKGlucHV0RGF0YTogSUNvbXB1dGVkRXZlbnQsIHRvdWNoRXZlbnQ6IFRvdWNoRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIGlmIChzZXNzaW9uLnN0b3BwZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJ1biB0aGUgdG91Y2gtYWN0aW9uIHBvbHlmaWxsXG4gICAgICAgIHRoaXMudG91Y2hBY3Rpb24ucHJldmVudERlZmF1bHRzKGlucHV0RGF0YSwgdG91Y2hFdmVudCk7XG5cbiAgICAgICAgdmFyIHJlY29nbml6ZXI6IElSZWNvZ25pemVyO1xuICAgICAgICB2YXIgcmVjb2duaXplcnMgPSB0aGlzLnJlY29nbml6ZXJzO1xuXG4gICAgICAgIC8vIHRoaXMgaG9sZHMgdGhlIHJlY29nbml6ZXIgdGhhdCBpcyBiZWluZyByZWNvZ25pemVkLlxuICAgICAgICAvLyBzbyB0aGUgcmVjb2duaXplcidzIHN0YXRlIG5lZWRzIHRvIGJlIEJFR0FOLCBDSEFOR0VELCBFTkRFRCBvciBSRUNPR05JWkVEXG4gICAgICAgIC8vIGlmIG5vIHJlY29nbml6ZXIgaXMgZGV0ZWN0aW5nIGEgdGhpbmcsIGl0IGlzIHNldCB0byBgbnVsbGBcbiAgICAgICAgdmFyIGN1clJlY29nbml6ZXIgPSBzZXNzaW9uLmN1clJlY29nbml6ZXI7XG5cbiAgICAgICAgLy8gcmVzZXQgd2hlbiB0aGUgbGFzdCByZWNvZ25pemVyIGlzIHJlY29nbml6ZWRcbiAgICAgICAgLy8gb3Igd2hlbiB3ZSdyZSBpbiBhIG5ldyBzZXNzaW9uXG4gICAgICAgIGlmICghY3VyUmVjb2duaXplciB8fCAoY3VyUmVjb2duaXplciAmJiBjdXJSZWNvZ25pemVyLnN0YXRlICYgU1RBVEVfUkVDT0dOSVpFRCkpIHtcbiAgICAgICAgICAgIGN1clJlY29nbml6ZXIgPSBzZXNzaW9uLmN1clJlY29nbml6ZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICB3aGlsZSAoaSA8IHJlY29nbml6ZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmVjb2duaXplciA9IHJlY29nbml6ZXJzW2ldO1xuXG4gICAgICAgICAgICAvLyBmaW5kIG91dCBpZiB3ZSBhcmUgYWxsb3dlZCB0cnkgdG8gcmVjb2duaXplIHRoZSBpbnB1dCBmb3IgdGhpcyBvbmUuXG4gICAgICAgICAgICAvLyAxLiAgIGFsbG93IGlmIHRoZSBzZXNzaW9uIGlzIE5PVCBmb3JjZWQgc3RvcHBlZCAoc2VlIHRoZSAuc3RvcCgpIG1ldGhvZClcbiAgICAgICAgICAgIC8vIDIuICAgYWxsb3cgaWYgd2Ugc3RpbGwgaGF2ZW4ndCByZWNvZ25pemVkIGEgZ2VzdHVyZSBpbiB0aGlzIHNlc3Npb24sIG9yIHRoZSB0aGlzIHJlY29nbml6ZXIgaXMgdGhlIG9uZVxuICAgICAgICAgICAgLy8gICAgICB0aGF0IGlzIGJlaW5nIHJlY29nbml6ZWQuXG4gICAgICAgICAgICAvLyAzLiAgIGFsbG93IGlmIHRoZSByZWNvZ25pemVyIGlzIGFsbG93ZWQgdG8gcnVuIHNpbXVsdGFuZW91cyB3aXRoIHRoZSBjdXJyZW50IHJlY29nbml6ZWQgcmVjb2duaXplci5cbiAgICAgICAgICAgIC8vICAgICAgdGhpcyBjYW4gYmUgc2V0dXAgd2l0aCB0aGUgYHJlY29nbml6ZVdpdGgoKWAgbWV0aG9kIG9uIHRoZSByZWNvZ25pemVyLlxuICAgICAgICAgICAgaWYgKHNlc3Npb24uc3RvcHBlZCAhPT0gRk9SQ0VEX1NUT1AgJiYgKCAvLyAxXG4gICAgICAgICAgICAgICAgIWN1clJlY29nbml6ZXIgfHwgcmVjb2duaXplciA9PSBjdXJSZWNvZ25pemVyIHx8IC8vIDJcbiAgICAgICAgICAgICAgICByZWNvZ25pemVyLmNhblJlY29nbml6ZVdpdGgoY3VyUmVjb2duaXplcikpKSB7IC8vIDNcblxuICAgICAgICAgICAgICAgIHJlY29nbml6ZXIucmVjb2duaXplKGlucHV0RGF0YSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZWNvZ25pemVyLnJlc2V0KCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGlmIHRoZSByZWNvZ25pemVyIGhhcyBiZWVuIHJlY29nbml6aW5nIHRoZSBpbnB1dCBhcyBhIHZhbGlkIGdlc3R1cmUsIHdlIHdhbnQgdG8gc3RvcmUgdGhpcyBvbmUgYXMgdGhlXG4gICAgICAgICAgICAvLyBjdXJyZW50IGFjdGl2ZSByZWNvZ25pemVyLiBidXQgb25seSBpZiB3ZSBkb24ndCBhbHJlYWR5IGhhdmUgYW4gYWN0aXZlIHJlY29nbml6ZXJcbiAgICAgICAgICAgIGlmICghY3VyUmVjb2duaXplciAmJiByZWNvZ25pemVyLnN0YXRlICYgKFNUQVRFX0JFR0FOIHwgU1RBVEVfQ0hBTkdFRCB8IFNUQVRFX1JFQ09HTklaRUQpKSB7XG4gICAgICAgICAgICAgICAgY3VyUmVjb2duaXplciA9IHNlc3Npb24uY3VyUmVjb2duaXplciA9IHJlY29nbml6ZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBnZXQgYSByZWNvZ25pemVyIGJ5IGl0cyBldmVudCBuYW1lLlxuICAgICAqL1xuICAgIGdldChldmVudE5hbWU6IHN0cmluZyk6IElSZWNvZ25pemVyIHtcbiAgICAgICAgdmFyIHJlY29nbml6ZXJzID0gdGhpcy5yZWNvZ25pemVycztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWNvZ25pemVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKHJlY29nbml6ZXJzW2ldLmV2ZW50TmFtZSA9PT0gZXZlbnROYW1lKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlY29nbml6ZXJzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGFkZCBhIHJlY29nbml6ZXIgdG8gdGhlIG1hbmFnZXJcbiAgICAgKiBleGlzdGluZyByZWNvZ25pemVycyB3aXRoIHRoZSBzYW1lIGV2ZW50IG5hbWUgd2lsbCBiZSByZW1vdmVkXG4gICAgICogQHBhcmFtIHtSZWNvZ25pemVyfSByZWNvZ25pemVyXG4gICAgICovXG4gICAgYWRkKHJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogSVJlY29nbml6ZXIge1xuICAgICAgICB2YXIgZXhpc3RpbmcgPSB0aGlzLmdldChyZWNvZ25pemVyLmV2ZW50TmFtZSk7XG4gICAgICAgIGlmIChleGlzdGluZykge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZXhpc3RpbmcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZWNvZ25pemVycy5wdXNoKHJlY29nbml6ZXIpO1xuICAgICAgICByZWNvZ25pemVyLm1hbmFnZXIgPSB0aGlzO1xuXG4gICAgICAgIHRoaXMudG91Y2hBY3Rpb24udXBkYXRlKCk7XG4gICAgICAgIHJldHVybiByZWNvZ25pemVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHJlbW92ZSBhIHJlY29nbml6ZXIgYnkgbmFtZSBvciBpbnN0YW5jZVxuICAgICAqIEBwYXJhbSB7UmVjb2duaXplcnxTdHJpbmd9IHJlY29nbml6ZXJcbiAgICAgKiBAcmV0dXJuIHtNYW5hZ2VyfVxuICAgICAqL1xuICAgIHJlbW92ZShyZWNvZ25pemVyOiBJUmVjb2duaXplcikge1xuICAgICAgICB2YXIgcmVjb2duaXplcnMgPSB0aGlzLnJlY29nbml6ZXJzO1xuICAgICAgICByZWNvZ25pemVyID0gdGhpcy5nZXQocmVjb2duaXplci5ldmVudE5hbWUpO1xuICAgICAgICByZWNvZ25pemVycy5zcGxpY2UoaW5BcnJheShyZWNvZ25pemVycywgcmVjb2duaXplciksIDEpO1xuXG4gICAgICAgIHRoaXMudG91Y2hBY3Rpb24udXBkYXRlKCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGJpbmQgZXZlbnRcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRzXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gaGFuZGxlclxuICAgICAqIEByZXR1cm4ge0V2ZW50RW1pdHRlcn0gdGhpc1xuICAgICAqL1xuICAgIG9uKGV2ZW50czogc3RyaW5nLCBoYW5kbGVyKTogTWFuYWdlciB7XG4gICAgICAgIHZhciBoYW5kbGVycyA9IHRoaXMuaGFuZGxlcnM7XG4gICAgICAgIGVhY2goc3BsaXRTdHIoZXZlbnRzKSwgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIGhhbmRsZXJzW2V2ZW50XSA9IGhhbmRsZXJzW2V2ZW50XSB8fCBbXTtcbiAgICAgICAgICAgIGhhbmRsZXJzW2V2ZW50XS5wdXNoKGhhbmRsZXIpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdW5iaW5kIGV2ZW50LCBsZWF2ZSBlbWl0IGJsYW5rIHRvIHJlbW92ZSBhbGwgaGFuZGxlcnNcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRzXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW2hhbmRsZXJdXG4gICAgICogQHJldHVybiB7RXZlbnRFbWl0dGVyfSB0aGlzXG4gICAgICovXG4gICAgb2ZmKGV2ZW50czogc3RyaW5nLCBoYW5kbGVyKTogTWFuYWdlciB7XG4gICAgICAgIHZhciBoYW5kbGVycyA9IHRoaXMuaGFuZGxlcnM7XG4gICAgICAgIGVhY2goc3BsaXRTdHIoZXZlbnRzKSwgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghaGFuZGxlcikge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBoYW5kbGVyc1tldmVudF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBoYW5kbGVyc1tldmVudF0uc3BsaWNlKGluQXJyYXkoaGFuZGxlcnNbZXZlbnRdLCBoYW5kbGVyKSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBlbWl0IGV2ZW50IHRvIHRoZSBsaXN0ZW5lcnNcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAgICAgKiBAcGFyYW0ge0lDb21wdXRlZEV2ZW50fSBkYXRhXG4gICAgICovXG4gICAgZW1pdChldmVudE5hbWU6IHN0cmluZywgZGF0YTogRXZlbnQpIHtcbiAgICAgICAgLy8gd2UgYWxzbyB3YW50IHRvIHRyaWdnZXIgZG9tIGV2ZW50c1xuICAgICAgICBpZiAodGhpcy5kb21FdmVudHMpIHtcbiAgICAgICAgICAgIHRyaWdnZXJEb21FdmVudChldmVudCwgZGF0YSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBubyBoYW5kbGVycywgc28gc2tpcCBpdCBhbGxcbiAgICAgICAgdmFyIGhhbmRsZXJzID0gdGhpcy5oYW5kbGVyc1tldmVudE5hbWVdICYmIHRoaXMuaGFuZGxlcnNbZXZlbnROYW1lXS5zbGljZSgpO1xuICAgICAgICBpZiAoIWhhbmRsZXJzIHx8ICFoYW5kbGVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE1ha2UgaXQgbG9vayBsaWtlIGEgbm9ybWFsIERPTSBldmVudD9cbiAgICAgICAgLypcbiAgICAgICAgZGF0YS50eXBlID0gZXZlbnROYW1lO1xuICAgICAgICBkYXRhLnByZXZlbnREZWZhdWx0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgZGF0YS5zcmNFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9O1xuICAgICAgICAqL1xuXG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgd2hpbGUgKGkgPCBoYW5kbGVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGhhbmRsZXJzW2ldKGRhdGEpO1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdXBkYXRlVG91Y2hBY3Rpb24oKTogdm9pZCB7XG4gICAgICAgIHRoaXMudG91Y2hBY3Rpb24udXBkYXRlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogZGVzdHJveSB0aGUgbWFuYWdlciBhbmQgdW5iaW5kcyBhbGwgZXZlbnRzXG4gICAgICogaXQgZG9lc24ndCB1bmJpbmQgZG9tIGV2ZW50cywgdGhhdCBpcyB0aGUgdXNlciBvd24gcmVzcG9uc2liaWxpdHlcbiAgICAgKi9cbiAgICBkZXN0cm95KCkge1xuICAgICAgICB0aGlzLmVsZW1lbnQgJiYgdGhpcy50b2dnbGVDc3NQcm9wcyhmYWxzZSk7XG5cbiAgICAgICAgdGhpcy5oYW5kbGVycyA9IHt9O1xuICAgICAgICB0aGlzLnNlc3Npb24gPSB1bmRlZmluZWQ7XG4gICAgICAgIHRoaXMuaW5wdXQuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBudWxsO1xuICAgIH1cblxuICAgIHRvZ2dsZUNzc1Byb3BzKGFkZDogYm9vbGVhbikge1xuICAgICAgICBpZiAoIXRoaXMuZWxlbWVudC5zdHlsZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBlbGVtZW50ID0gdGhpcy5lbGVtZW50O1xuICAgICAgICBlYWNoKHRoaXMuY3NzUHJvcHMsIGZ1bmN0aW9uKHZhbHVlLCBuYW1lKSB7XG4gICAgICAgICAgICBlbGVtZW50LnN0eWxlW3ByZWZpeGVkKGVsZW1lbnQuc3R5bGUsIG5hbWUpXSA9IGFkZCA/IHZhbHVlIDogJyc7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNhbmNlbENvbnRleHRNZW51KCk6IHZvaWQge1xuICAgIH1cbn1cblxuLyoqXG4gKiB0cmlnZ2VyIGRvbSBldmVudFxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YVxuICovXG5mdW5jdGlvbiB0cmlnZ2VyRG9tRXZlbnQoZXZlbnQsIGRhdGEpIHtcbiAgICB2YXIgZ2VzdHVyZUV2ZW50ID0gZG9jdW1lbnQuY3JlYXRlRXZlbnQoJ0V2ZW50Jyk7XG4gICAgZ2VzdHVyZUV2ZW50LmluaXRFdmVudChldmVudCwgdHJ1ZSwgdHJ1ZSk7XG4gICAgZ2VzdHVyZUV2ZW50WydnZXN0dXJlJ10gPSBkYXRhO1xuICAgIGRhdGEudGFyZ2V0LmRpc3BhdGNoRXZlbnQoZ2VzdHVyZUV2ZW50KTtcbn1cblxudmFyIE1PQklMRV9SRUdFWCA9IC9tb2JpbGV8dGFibGV0fGlwKGFkfGhvbmV8b2QpfGFuZHJvaWQvaTtcblxudmFyIFNVUFBPUlRfVE9VQ0ggPSAoJ29udG91Y2hzdGFydCcgaW4gd2luZG93KTtcbnZhciBTVVBQT1JUX1BPSU5URVJfRVZFTlRTID0gcHJlZml4ZWQod2luZG93LCAnUG9pbnRlckV2ZW50JykgIT09IHVuZGVmaW5lZDtcbnZhciBTVVBQT1JUX09OTFlfVE9VQ0ggPSBTVVBQT1JUX1RPVUNIICYmIE1PQklMRV9SRUdFWC50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpO1xuXG52YXIgUFJFRklYRURfVE9VQ0hfQUNUSU9OID0gcHJlZml4ZWQoVEVTVF9FTEVNRU5ULnN0eWxlLCAndG91Y2hBY3Rpb24nKTtcbnZhciBOQVRJVkVfVE9VQ0hfQUNUSU9OID0gUFJFRklYRURfVE9VQ0hfQUNUSU9OICE9PSB1bmRlZmluZWQ7XG5cbmNsYXNzIFRvdWNoQWN0aW9uIHtcbiAgICBwdWJsaWMgbWFuYWdlcjogTWFuYWdlcjtcbiAgICBwdWJsaWMgYWN0aW9uczogc3RyaW5nO1xuICAgIHByaXZhdGUgcHJldmVudGVkO1xuICAgIC8qKlxuICAgICAqIFRvdWNoIEFjdGlvblxuICAgICAqIHNldHMgdGhlIHRvdWNoQWN0aW9uIHByb3BlcnR5IG9yIHVzZXMgdGhlIGpzIGFsdGVybmF0aXZlXG4gICAgICogQHBhcmFtIHtNYW5hZ2VyfSBtYW5hZ2VyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHZhbHVlXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IobWFuYWdlcjogTWFuYWdlciwgdmFsdWU6IHN0cmluZykge1xuICAgICAgICB0aGlzLm1hbmFnZXIgPSBtYW5hZ2VyO1xuICAgICAgICB0aGlzLnNldCh2YWx1ZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIHNldCB0aGUgdG91Y2hBY3Rpb24gdmFsdWUgb24gdGhlIGVsZW1lbnQgb3IgZW5hYmxlIHRoZSBwb2x5ZmlsbFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB2YWx1ZVxuICAgICAqL1xuICAgIHNldCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIC8vIGZpbmQgb3V0IHRoZSB0b3VjaC1hY3Rpb24gYnkgdGhlIGV2ZW50IGhhbmRsZXJzXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gVE9VQ0hfQUNUSU9OX0NPTVBVVEUpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5jb21wdXRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoTkFUSVZFX1RPVUNIX0FDVElPTiAmJiB0aGlzLm1hbmFnZXIuZWxlbWVudC5zdHlsZSkge1xuICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVsZW1lbnQuc3R5bGVbUFJFRklYRURfVE9VQ0hfQUNUSU9OXSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYWN0aW9ucyA9IHZhbHVlLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGp1c3QgcmUtc2V0IHRoZSB0b3VjaEFjdGlvbiB2YWx1ZVxuICAgICAqL1xuICAgIHVwZGF0ZSgpIHtcbiAgICAgICAgdGhpcy5zZXQoVE9VQ0hfQUNUSU9OX0NPTVBVVEUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGNvbXB1dGUgdGhlIHZhbHVlIGZvciB0aGUgdG91Y2hBY3Rpb24gcHJvcGVydHkgYmFzZWQgb24gdGhlIHJlY29nbml6ZXIncyBzZXR0aW5nc1xuICAgICAqIEByZXR1cm4ge1N0cmluZ30gdmFsdWVcbiAgICAgKi9cbiAgICBjb21wdXRlKCkge1xuICAgICAgICB2YXIgYWN0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgLy8gRklYTUU6IE1ha2UgdGhpcyB0eXBlLXNhZmUgYXV0b21hZ2ljYWxseVxuICAgICAgICBlYWNoKHRoaXMubWFuYWdlci5yZWNvZ25pemVycywgZnVuY3Rpb24ocmVjb2duaXplcjogUmVjb2duaXplcikge1xuICAgICAgICAgICAgaWYgKHJlY29nbml6ZXIuZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIGFjdGlvbnMgPSBhY3Rpb25zLmNvbmNhdChyZWNvZ25pemVyLmdldFRvdWNoQWN0aW9uKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGNsZWFuVG91Y2hBY3Rpb25zKGFjdGlvbnMuam9pbignICcpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB0aGlzIG1ldGhvZCBpcyBjYWxsZWQgb24gZWFjaCBpbnB1dCBjeWNsZSBhbmQgcHJvdmlkZXMgdGhlIHByZXZlbnRpbmcgb2YgdGhlIGJyb3dzZXIgYmVoYXZpb3JcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gaW5wdXRcbiAgICAgKi9cbiAgICBwcmV2ZW50RGVmYXVsdHMoaW5wdXQ6IElDb21wdXRlZEV2ZW50LCB0b3VjaEV2ZW50OiBUb3VjaEV2ZW50KSB7XG4gICAgICAgIC8vIG5vdCBuZWVkZWQgd2l0aCBuYXRpdmUgc3VwcG9ydCBmb3IgdGhlIHRvdWNoQWN0aW9uIHByb3BlcnR5XG4gICAgICAgIGlmIChOQVRJVkVfVE9VQ0hfQUNUSU9OKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyB2YXIgZGlyZWN0aW9uID0gaW5wdXQub2Zmc2V0RGlyZWN0aW9uO1xuXG4gICAgICAgIGlmICh0aGlzLnByZXZlbnRlZCkge1xuICAgICAgICAgICAgdG91Y2hFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8qXG4gICAgICAgIHZhciBhY3Rpb25zID0gdGhpcy5hY3Rpb25zO1xuICAgICAgICB2YXIgaGFzTm9uZSA9IGluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9OT05FKTtcbiAgICAgICAgdmFyIGhhc1BhblkgPSBpblN0cihhY3Rpb25zLCBUT1VDSF9BQ1RJT05fUEFOX1kpO1xuICAgICAgICB2YXIgaGFzUGFuWCA9IGluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9QQU5fWCk7XG5cbiAgICAgICAgaWYgKGhhc05vbmUgfHxcbiAgICAgICAgICAgIChoYXNQYW5ZICYmIGRpcmVjdGlvbiAmIERJUkVDVElPTl9IT1JJWk9OVEFMKSB8fFxuICAgICAgICAgICAgKGhhc1BhblggJiYgZGlyZWN0aW9uICYgRElSRUNUSU9OX1ZFUlRJQ0FMKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMucHJldmVudFNyYyh0b3VjaEV2ZW50KTtcbiAgICAgICAgfVxuICAgICAgICAqL1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGNhbGwgcHJldmVudERlZmF1bHQgdG8gcHJldmVudCB0aGUgYnJvd3NlcidzIGRlZmF1bHQgYmVoYXZpb3IgKHNjcm9sbGluZyBpbiBtb3N0IGNhc2VzKVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBzcmNFdmVudFxuICAgICAqL1xuICAgIHByZXZlbnRTcmMoc3JjRXZlbnQpIHtcbiAgICAgICAgdGhpcy5wcmV2ZW50ZWQgPSB0cnVlO1xuICAgICAgICBzcmNFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbn1cblxuLyoqXG4gKiB3aGVuIHRoZSB0b3VjaEFjdGlvbnMgYXJlIGNvbGxlY3RlZCB0aGV5IGFyZSBub3QgYSB2YWxpZCB2YWx1ZSwgc28gd2UgbmVlZCB0byBjbGVhbiB0aGluZ3MgdXAuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBhY3Rpb25zXG4gKiBAcmV0dXJuIHsqfVxuICovXG5mdW5jdGlvbiBjbGVhblRvdWNoQWN0aW9ucyhhY3Rpb25zOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIG5vbmVcbiAgICBpZiAoaW5TdHIoYWN0aW9ucywgVE9VQ0hfQUNUSU9OX05PTkUpKSB7XG4gICAgICAgIHJldHVybiBUT1VDSF9BQ1RJT05fTk9ORTtcbiAgICB9XG5cbiAgICB2YXIgaGFzUGFuWCA9IGluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9QQU5fWCk7XG4gICAgdmFyIGhhc1BhblkgPSBpblN0cihhY3Rpb25zLCBUT1VDSF9BQ1RJT05fUEFOX1kpO1xuXG4gICAgLy8gcGFuLXggYW5kIHBhbi15IGNhbiBiZSBjb21iaW5lZFxuICAgIGlmIChoYXNQYW5YICYmIGhhc1BhblkpIHtcbiAgICAgICAgcmV0dXJuIFRPVUNIX0FDVElPTl9QQU5fWCArICcgJyArIFRPVUNIX0FDVElPTl9QQU5fWTtcbiAgICB9XG5cbiAgICAvLyBwYW4teCBPUiBwYW4teVxuICAgIGlmIChoYXNQYW5YIHx8IGhhc1BhblkpIHtcbiAgICAgICAgcmV0dXJuIGhhc1BhblggPyBUT1VDSF9BQ1RJT05fUEFOX1ggOiBUT1VDSF9BQ1RJT05fUEFOX1k7XG4gICAgfVxuXG4gICAgLy8gbWFuaXB1bGF0aW9uXG4gICAgaWYgKGluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9NQU5JUFVMQVRJT04pKSB7XG4gICAgICAgIHJldHVybiBUT1VDSF9BQ1RJT05fTUFOSVBVTEFUSU9OO1xuICAgIH1cblxuICAgIHJldHVybiBUT1VDSF9BQ1RJT05fQVVUTztcbn1cblxuZXhwb3J0IHZhciBJTlBVVF9UWVBFX1RPVUNIID0gJ3RvdWNoJztcbmV4cG9ydCB2YXIgSU5QVVRfVFlQRV9QRU4gPSAncGVuJztcbmV4cG9ydCB2YXIgSU5QVVRfVFlQRV9NT1VTRSA9ICdtb3VzZSc7XG5leHBvcnQgdmFyIElOUFVUX1RZUEVfS0lORUNUID0gJ2tpbmVjdCc7XG5cbnZhciBDT01QVVRFX0lOVEVSVkFMID0gMjU7XG5cbmV4cG9ydCB2YXIgSU5QVVRfU1RBUlQgPSAxO1xuZXhwb3J0IHZhciBJTlBVVF9NT1ZFID0gMjtcbmV4cG9ydCB2YXIgSU5QVVRfRU5EID0gNDtcbmV4cG9ydCB2YXIgSU5QVVRfQ0FOQ0VMID0gODtcblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUV2ZW50VHlwZShldmVudFR5cGU6IG51bWJlcikge1xuICAgIHN3aXRjaCAoZXZlbnRUeXBlKSB7XG4gICAgICAgIGNhc2UgSU5QVVRfU1RBUlQ6IHtcbiAgICAgICAgICAgIHJldHVybiBcIlNUQVJUXCI7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBJTlBVVF9NT1ZFOiB7XG4gICAgICAgICAgICByZXR1cm4gXCJNT1ZFXCI7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBJTlBVVF9FTkQ6IHtcbiAgICAgICAgICAgIHJldHVybiBcIkVORFwiO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgSU5QVVRfQ0FOQ0VMOiB7XG4gICAgICAgICAgICByZXR1cm4gXCJDQU5DRUxcIjtcbiAgICAgICAgfVxuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgICByZXR1cm4gXCJldmVudFR5cGU9XCIgKyBldmVudFR5cGU7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCB2YXIgRElSRUNUSU9OX1VOREVGSU5FRCA9IDA7XG5leHBvcnQgdmFyIERJUkVDVElPTl9MRUZUID0gMTtcbmV4cG9ydCB2YXIgRElSRUNUSU9OX1JJR0hUID0gMjtcbmV4cG9ydCB2YXIgRElSRUNUSU9OX1VQID0gNDtcbmV4cG9ydCB2YXIgRElSRUNUSU9OX0RPV04gPSA4O1xuXG5leHBvcnQgdmFyIERJUkVDVElPTl9IT1JJWk9OVEFMID0gRElSRUNUSU9OX0xFRlQgfCBESVJFQ1RJT05fUklHSFQ7XG5leHBvcnQgdmFyIERJUkVDVElPTl9WRVJUSUNBTCA9IERJUkVDVElPTl9VUCB8IERJUkVDVElPTl9ET1dOO1xuZXhwb3J0IHZhciBESVJFQ1RJT05fQUxMID0gRElSRUNUSU9OX0hPUklaT05UQUwgfCBESVJFQ1RJT05fVkVSVElDQUw7XG5cbnZhciBQUk9QU19YWSA9IFsneCcsICd5J107XG52YXIgUFJPUFNfQ0xJRU5UX1hZID0gWydjbGllbnRYJywgJ2NsaWVudFknXTtcblxuY2xhc3MgSW5wdXQge1xuICAgIHB1YmxpYyBtYW5hZ2VyOiBNYW5hZ2VyO1xuICAgIHB1YmxpYyBlbGVtZW50O1xuICAgIHB1YmxpYyB0YXJnZXQ7XG4gICAgcHVibGljIGRvbUhhbmRsZXI7XG4gICAgcHJpdmF0ZSBldkVsO1xuICAgIHByaXZhdGUgZXZUYXJnZXQ7XG4gICAgcHJpdmF0ZSBldldpbjtcbiAgICAvKipcbiAgICAgKiBjcmVhdGUgbmV3IGlucHV0IHR5cGUgbWFuYWdlclxuICAgICAqIEBwYXJhbSB7TWFuYWdlcn0gbWFuYWdlclxuICAgICAqIEByZXR1cm4ge0lucHV0fVxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKFxuICAgICAgICBtYW5hZ2VyOiBNYW5hZ2VyLFxuICAgICAgICB0b3VjaEVsZW1lbnRFdmVudHM6IHN0cmluZyxcbiAgICAgICAgdG91Y2hUYXJnZXRFdmVudHM6IHN0cmluZyxcbiAgICAgICAgdG91Y2hXaW5kb3dFdmVudHM6IHN0cmluZykge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMubWFuYWdlciA9IG1hbmFnZXI7XG4gICAgICAgIHRoaXMuZXZFbCA9IHRvdWNoRWxlbWVudEV2ZW50cztcbiAgICAgICAgdGhpcy5ldlRhcmdldCA9IHRvdWNoVGFyZ2V0RXZlbnRzO1xuICAgICAgICB0aGlzLmV2V2luID0gdG91Y2hXaW5kb3dFdmVudHM7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IG1hbmFnZXIuZWxlbWVudDtcbiAgICAgICAgdGhpcy50YXJnZXQgPSBtYW5hZ2VyLmlucHV0VGFyZ2V0O1xuXG4gICAgICAgIC8vIHNtYWxsZXIgd3JhcHBlciBhcm91bmQgdGhlIGhhbmRsZXIsIGZvciB0aGUgc2NvcGUgYW5kIHRoZSBlbmFibGVkIHN0YXRlIG9mIHRoZSBtYW5hZ2VyLFxuICAgICAgICAvLyBzbyB3aGVuIGRpc2FibGVkIHRoZSBpbnB1dCBldmVudHMgYXJlIGNvbXBsZXRlbHkgYnlwYXNzZWQuXG4gICAgICAgIHRoaXMuZG9tSGFuZGxlciA9IGZ1bmN0aW9uKGV2ZW50OiBUb3VjaEV2ZW50KSB7XG4gICAgICAgICAgICBpZiAobWFuYWdlci5lbmFibGUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmhhbmRsZXIoZXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuaW5pdCgpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBzaG91bGQgaGFuZGxlIHRoZSBpbnB1dEV2ZW50IGRhdGEgYW5kIHRyaWdnZXIgdGhlIGNhbGxiYWNrXG4gICAgICogQHZpcnR1YWxcbiAgICAgKi9cbiAgICBoYW5kbGVyKGV2ZW50OiBhbnkpIHsgfVxuXG4gICAgLyoqXG4gICAgICogYmluZCB0aGUgZXZlbnRzXG4gICAgICovXG4gICAgaW5pdCgpIHtcbiAgICAgICAgdGhpcy5ldkVsICYmIGFkZEV2ZW50TGlzdGVuZXJzKHRoaXMuZWxlbWVudCwgdGhpcy5ldkVsLCB0aGlzLmRvbUhhbmRsZXIpO1xuICAgICAgICB0aGlzLmV2VGFyZ2V0ICYmIGFkZEV2ZW50TGlzdGVuZXJzKHRoaXMudGFyZ2V0LCB0aGlzLmV2VGFyZ2V0LCB0aGlzLmRvbUhhbmRsZXIpO1xuICAgICAgICB0aGlzLmV2V2luICYmIGFkZEV2ZW50TGlzdGVuZXJzKGdldFdpbmRvd0ZvckVsZW1lbnQodGhpcy5lbGVtZW50KSwgdGhpcy5ldldpbiwgdGhpcy5kb21IYW5kbGVyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB1bmJpbmQgdGhlIGV2ZW50c1xuICAgICAqL1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMuZXZFbCAmJiByZW1vdmVFdmVudExpc3RlbmVycyh0aGlzLmVsZW1lbnQsIHRoaXMuZXZFbCwgdGhpcy5kb21IYW5kbGVyKTtcbiAgICAgICAgdGhpcy5ldlRhcmdldCAmJiByZW1vdmVFdmVudExpc3RlbmVycyh0aGlzLnRhcmdldCwgdGhpcy5ldlRhcmdldCwgdGhpcy5kb21IYW5kbGVyKTtcbiAgICAgICAgdGhpcy5ldldpbiAmJiByZW1vdmVFdmVudExpc3RlbmVycyhnZXRXaW5kb3dGb3JFbGVtZW50KHRoaXMuZWxlbWVudCksIHRoaXMuZXZXaW4sIHRoaXMuZG9tSGFuZGxlcik7XG4gICAgfVxufVxuXG4vKipcbiAqIGhhbmRsZSBpbnB1dCBldmVudHNcbiAqIEBwYXJhbSB7TWFuYWdlcn0gbWFuYWdlclxuICogQHBhcmFtIHtOdW1iZXJ9IGV2ZW50VHlwZVxuICogQHBhcmFtIHtJQ29tcHV0ZWRFdmVudH0gaW5wdXRcbiAqL1xuZnVuY3Rpb24gaW5wdXRIYW5kbGVyKG1hbmFnZXI6IE1hbmFnZXIsIGV2ZW50VHlwZTogbnVtYmVyLCB0b3VjaEV2ZW50OiBUb3VjaEV2ZW50KSB7XG5cbiAgICB2YXIgY29tcEV2ZW50OiBJQ29tcHV0ZWRFdmVudCA9IGNvbXB1dGVJQ29tcHV0ZWRFdmVudChtYW5hZ2VyLCBldmVudFR5cGUsIHRvdWNoRXZlbnQpO1xuXG4gICAgbWFuYWdlci5yZWNvZ25pemUoY29tcEV2ZW50LCB0b3VjaEV2ZW50KTtcblxuICAgIG1hbmFnZXIuc2Vzc2lvbi5wdXNoKGNvbXBFdmVudCk7XG59XG5cbi8qKlxuICogZXh0ZW5kIHRoZSBkYXRhIHdpdGggc29tZSB1c2FibGUgcHJvcGVydGllcyBsaWtlIHNjYWxlLCByb3RhdGUsIHZlbG9jaXR5IGV0Y1xuICogQHBhcmFtIHtNYW5hZ2VyfSBtYW5hZ2VyXG4gKiBAcGFyYW0ge0lDb21wdXRlZEV2ZW50fSBpbnB1dFxuICovXG5mdW5jdGlvbiBjb21wdXRlSUNvbXB1dGVkRXZlbnQobWFuYWdlcjogTWFuYWdlciwgZXZlbnRUeXBlOiBudW1iZXIsIHRvdWNoRXZlbnQ6IFRvdWNoRXZlbnQpOiBJQ29tcHV0ZWRFdmVudCB7XG4gICAgdmFyIHRvdWNoZXNMZW5ndGggPSB0b3VjaEV2ZW50LnRvdWNoZXMubGVuZ3RoO1xuICAgIHZhciBjaGFuZ2VkUG9pbnRlcnNMZW4gPSB0b3VjaEV2ZW50LmNoYW5nZWRUb3VjaGVzLmxlbmd0aDtcbiAgICB2YXIgaXNGaXJzdDogYm9vbGVhbiA9IChldmVudFR5cGUgJiBJTlBVVF9TVEFSVCAmJiAodG91Y2hlc0xlbmd0aCAtIGNoYW5nZWRQb2ludGVyc0xlbiA9PT0gMCkpO1xuICAgIHZhciBpc0ZpbmFsOiBib29sZWFuID0gKGV2ZW50VHlwZSAmIChJTlBVVF9FTkQgfCBJTlBVVF9DQU5DRUwpICYmICh0b3VjaGVzTGVuZ3RoIC0gY2hhbmdlZFBvaW50ZXJzTGVuID09PSAwKSk7XG5cbiAgICAvL3ZhciBjb21wRXZlbnQ6IGFueS8qSUNvbXB1dGVkRXZlbnQqLyA9IHt9O1xuICAgIC8vY29tcEV2ZW50LmlzRmlyc3QgPSAhIWlzRmlyc3Q7XG4gICAgLy9jb21wRXZlbnQuaXNGaW5hbCA9ICEhaXNGaW5hbDtcblxuICAgIGlmIChpc0ZpcnN0KSB7XG4gICAgICAgIG1hbmFnZXIuc2Vzc2lvbi5yZXNldCgpO1xuICAgIH1cblxuICAgIC8vIHNvdXJjZSBldmVudCBpcyB0aGUgbm9ybWFsaXplZCB2YWx1ZSBvZiB0aGUgZG9tRXZlbnRzXG4gICAgLy8gbGlrZSAndG91Y2hzdGFydCwgbW91c2V1cCwgcG9pbnRlcmRvd24nXG4gICAgdmFyIHNlc3Npb24gPSBtYW5hZ2VyLnNlc3Npb247XG4gICAgLy8gIHZhciBwb2ludGVycyA9IGlucHV0LnBvaW50ZXJzO1xuICAgIC8vICB2YXIgcG9pbnRlcnNMZW5ndGggPSBwb2ludGVycy5sZW5ndGg7XG5cbiAgICB2YXIgY2VudGVyOiBDbGllbnRMb2NhdGlvbiA9IGNvbXB1dGVDZW50ZXIodG91Y2hFdmVudC50b3VjaGVzKTtcbiAgICB2YXIgbW92ZW1lbnQ6IFZlY3RvckUyID0gc2Vzc2lvbi5jb21wdXRlTW92ZW1lbnQoY2VudGVyKTtcblxuICAgIC8vIHN0b3JlIHRoZSBmaXJzdCBpbnB1dCB0byBjYWxjdWxhdGUgdGhlIGRpc3RhbmNlIGFuZCBkaXJlY3Rpb25cbiAgICAvKlxuICAgIGlmICghc2Vzc2lvbi5maXJzdElucHV0KSB7XG4gICAgICBzZXNzaW9uLmZpcnN0SW5wdXQgPSBzbmFwc2hvdCh0b3VjaEV2ZW50LCBtb3ZlbWVudCk7XG4gICAgfVxuICBcbiAgICAvLyB0byBjb21wdXRlIHNjYWxlIGFuZCByb3RhdGlvbiB3ZSBuZWVkIHRvIHN0b3JlIHRoZSBtdWx0aXBsZSB0b3VjaGVzXG4gICAgaWYgKHRvdWNoZXNMZW5ndGggPiAxICYmICFzZXNzaW9uLmZpcnN0TXVsdGlwbGUpIHtcbiAgICAgIHNlc3Npb24uZmlyc3RNdWx0aXBsZSA9IHNuYXBzaG90KHRvdWNoRXZlbnQsIG1vdmVtZW50KTtcbiAgICB9XG4gICAgZWxzZSBpZiAodG91Y2hlc0xlbmd0aCA9PT0gMSkge1xuICAgICAgc2Vzc2lvbi5maXJzdE11bHRpcGxlID0gdW5kZWZpbmVkO1xuICAgIH1cbiAgXG4gICAgdmFyIGZpcnN0SW5wdXQgPSBzZXNzaW9uLmZpcnN0SW5wdXQ7XG4gICAgdmFyIGZpcnN0TXVsdGlwbGUgPSBzZXNzaW9uLmZpcnN0TXVsdGlwbGU7XG4gICAgdmFyIG9mZnNldENlbnRlciA9IGZpcnN0TXVsdGlwbGUgPyBmaXJzdE11bHRpcGxlLmNlbnRlciA6IGZpcnN0SW5wdXQuY2VudGVyO1xuICAgICovXG5cbiAgICB2YXIgdGltZVN0YW1wID0gRGF0ZS5ub3coKTtcbiAgICB2YXIgbW92ZW1lbnRUaW1lID0gdGltZVN0YW1wIC0gc2Vzc2lvbi5zdGFydFRpbWU7XG5cbiAgICAvL3ZhciBhbmdsZSA9IGdldEFuZ2xlKG9mZnNldENlbnRlciwgY2VudGVyKTtcbiAgICB2YXIgZGlzdGFuY2U6IG51bWJlciA9IG1vdmVtZW50ID8gbW92ZW1lbnQubm9ybSgpIDogMDtcbiAgICB2YXIgZGlyZWN0aW9uOiBudW1iZXIgPSBnZXREaXJlY3Rpb24obW92ZW1lbnQpO1xuXG4gICAgLy8gdmFyIHNjYWxlID0gZmlyc3RNdWx0aXBsZSA/IGdldFNjYWxlKGZpcnN0TXVsdGlwbGUucG9pbnRlcnMsIHRvdWNoRXZlbnQudG91Y2hlcykgOiAxO1xuICAgIC8vIHZhciByb3RhdGlvbiA9IGZpcnN0TXVsdGlwbGUgPyBnZXRSb3RhdGlvbihmaXJzdE11bHRpcGxlLnBvaW50ZXJzLCB0b3VjaEV2ZW50LnRvdWNoZXMpIDogMDtcblxuICAgIHZhciB2ZWxvY2l0eTogVmVjdG9yRTIgPSBzZXNzaW9uLmNvbXB1dGVWZWxvY2l0eShjZW50ZXIsIG1vdmVtZW50VGltZSk7XG5cbiAgICAvLyBmaW5kIHRoZSBjb3JyZWN0IHRhcmdldFxuICAgIC8qXG4gICAgdmFyIHRhcmdldCA9IG1hbmFnZXIuZWxlbWVudDtcbiAgICBpZiAoaGFzUGFyZW50KHRvdWNoRXZlbnQudGFyZ2V0LCB0YXJnZXQpKSB7XG4gICAgICAgIHRhcmdldCA9IGlucHV0LnNyY0V2ZW50LnRhcmdldDtcbiAgICB9XG4gICAgKi9cbiAgICAvLyAgaW5wdXQudGFyZ2V0ID0gdGFyZ2V0O1xuICAgIHZhciBjb21wRXZlbnQ6IElDb21wdXRlZEV2ZW50ID0ge1xuICAgICAgICBjZW50ZXI6IGNlbnRlcixcbiAgICAgICAgbW92ZW1lbnQ6IG1vdmVtZW50LFxuICAgICAgICBkZWx0YVRpbWU6IG1vdmVtZW50VGltZSxcbiAgICAgICAgZGlyZWN0aW9uOiBkaXJlY3Rpb24sXG4gICAgICAgIGRpc3RhbmNlOiBkaXN0YW5jZSxcbiAgICAgICAgZXZlbnRUeXBlOiBldmVudFR5cGUsXG4gICAgICAgIHJvdGF0aW9uOiAwLFxuICAgICAgICB0aW1lU3RhbXA6IHRpbWVTdGFtcCxcbiAgICAgICAgdG91Y2hlc0xlbmd0aDogdG91Y2hFdmVudC50b3VjaGVzLmxlbmd0aCxcbiAgICAgICAgLy8gdHlwZTogdG91Y2hFdmVudC50eXBlLFxuICAgICAgICBzY2FsZTogMSxcbiAgICAgICAgdmVsb2NpdHk6IHZlbG9jaXR5XG4gICAgfTtcbiAgICByZXR1cm4gY29tcEV2ZW50O1xufVxuXG4vKipcbiAqIGdldCB0aGUgY2VudGVyIG9mIGFsbCB0aGUgcG9pbnRlcnNcbiAqIEBwYXJhbSB7QXJyYXl9IHBvaW50ZXJzXG4gKiBAcmV0dXJuIHtDbGllbnRMb2NhdGlvbn0gY2VudGVyIGNvbnRhaW5zIGBjbGllbnRYYCBhbmQgYGNsaWVudFlgIHByb3BlcnRpZXNcbiAqL1xuZnVuY3Rpb24gY29tcHV0ZUNlbnRlcih0b3VjaGVzOiBUb3VjaFtdKTogQ2xpZW50TG9jYXRpb24ge1xuICAgIHZhciB0b3VjaGVzTGVuZ3RoID0gdG91Y2hlcy5sZW5ndGg7XG4gICAgaWYgKHRvdWNoZXNMZW5ndGggPT09IDEpIHtcbiAgICAgICAgcmV0dXJuIENsaWVudExvY2F0aW9uLmZyb21Ub3VjaCh0b3VjaGVzWzBdKTtcbiAgICB9XG4gICAgZWxzZSBpZiAodG91Y2hlc0xlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdmFyIHggPSAwLCB5ID0gMCwgaSA9IDA7XG4gICAgICAgIHdoaWxlIChpIDwgdG91Y2hlc0xlbmd0aCkge1xuICAgICAgICAgICAgeCArPSB0b3VjaGVzW2ldLmNsaWVudFg7XG4gICAgICAgICAgICB5ICs9IHRvdWNoZXNbaV0uY2xpZW50WTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IENsaWVudExvY2F0aW9uKE1hdGgucm91bmQoeCAvIHRvdWNoZXNMZW5ndGgpLCBNYXRoLnJvdW5kKHkgLyB0b3VjaGVzTGVuZ3RoKSk7XG4gICAgfVxufVxuXG4vKipcbiAqIGNhbGN1bGF0ZSB0aGUgdmVsb2NpdHkgYmV0d2VlbiB0d28gcG9pbnRzLiB1bml0IGlzIGluIHB4IHBlciBtcy5cbiAqIEBwYXJhbSB7TnVtYmVyfSBkZWx0YVRpbWVcbiAqIEBwYXJhbSB7TnVtYmVyfSB4XG4gKiBAcGFyYW0ge051bWJlcn0geVxuICogQHJldHVybiB7T2JqZWN0fSB2ZWxvY2l0eSBgeGAgYW5kIGB5YFxuICovXG5mdW5jdGlvbiBnZXRWZWxvY2l0eShkZWx0YVRpbWU6IG51bWJlciwgeDogbnVtYmVyLCB5OiBudW1iZXIpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xuICAgIHJldHVybiB7IHg6IHggLyBkZWx0YVRpbWUgfHwgMCwgeTogeSAvIGRlbHRhVGltZSB8fCAwIH07XG59XG5cbi8qKlxuICogZ2V0IHRoZSBkaXJlY3Rpb24gYmV0d2VlbiB0d28gcG9pbnRzXG4gKiBAcGFyYW0ge1ZlY3RvckUyfSBtb3ZlbWVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHlcbiAqIEByZXR1cm4ge051bWJlcn0gZGlyZWN0aW9uXG4gKi9cbmZ1bmN0aW9uIGdldERpcmVjdGlvbihtb3ZlbWVudDogVmVjdG9yRTIpOiBudW1iZXIge1xuICAgIHZhciBOID0gbmV3IFZlY3RvckUyKDAsIC0xKTtcbiAgICB2YXIgUyA9IG5ldyBWZWN0b3JFMigwLCArMSk7XG4gICAgdmFyIEUgPSBuZXcgVmVjdG9yRTIoKzEsIDApO1xuICAgIHZhciBXID0gbmV3IFZlY3RvckUyKC0xLCAwKTtcbiAgICAvLyBBbGxvdyBjb21iaW5hdGlvbnMgb2YgdGhlIGNhcmRpbmFsIGRpcmVjdGlvbnMuXG4gICAgLy8gQSBjYXJkaW5hbCBkaXJlY3Rpb24gbWF0Y2hlcyBpZiB3ZSBhcmUgd2l0aGluIDIyLjUgZGVncmVlcyBlaXRoZXIgc2lkZS5cbiAgICB2YXIgY29zaW5lVGhyZXNob2xkID0gTWF0aC5jb3MoNyAqIE1hdGguUEkgLyAxNik7XG4gICAgaWYgKG1vdmVtZW50KSB7XG4gICAgICAgIHZhciB1bml0ID0gbW92ZW1lbnQuZGl2KG1vdmVtZW50Lm5vcm0oKSk7XG4gICAgICAgIHZhciBkaXJlY3Rpb24gPSBESVJFQ1RJT05fVU5ERUZJTkVEO1xuICAgICAgICBpZiAodW5pdC5kb3QoTikgPiBjb3NpbmVUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgIGRpcmVjdGlvbiB8PSBESVJFQ1RJT05fVVA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQuZG90KFMpID4gY29zaW5lVGhyZXNob2xkKSB7XG4gICAgICAgICAgICBkaXJlY3Rpb24gfD0gRElSRUNUSU9OX0RPV047XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQuZG90KEUpID4gY29zaW5lVGhyZXNob2xkKSB7XG4gICAgICAgICAgICBkaXJlY3Rpb24gfD0gRElSRUNUSU9OX1JJR0hUO1xuICAgICAgICB9XG4gICAgICAgIGlmICh1bml0LmRvdChXKSA+IGNvc2luZVRocmVzaG9sZCkge1xuICAgICAgICAgICAgZGlyZWN0aW9uIHw9IERJUkVDVElPTl9MRUZUO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkaXJlY3Rpb247XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gRElSRUNUSU9OX1VOREVGSU5FRDtcbiAgICB9XG59XG5cbi8qKlxuICogY2FsY3VsYXRlIHRoZSBhYnNvbHV0ZSBkaXN0YW5jZSBiZXR3ZWVuIHR3byBwb2ludHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBwMSB7eCwgeX1cbiAqIEBwYXJhbSB7T2JqZWN0fSBwMiB7eCwgeX1cbiAqIEBwYXJhbSB7QXJyYXl9IFtwcm9wc10gY29udGFpbmluZyB4IGFuZCB5IGtleXNcbiAqIEByZXR1cm4ge051bWJlcn0gZGlzdGFuY2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldERpc3RhbmNlKHAxLCBwMiwgcHJvcHM/KSB7XG4gICAgaWYgKCFwcm9wcykge1xuICAgICAgICBwcm9wcyA9IFBST1BTX1hZO1xuICAgIH1cbiAgICB2YXIgeCA9IHAyW3Byb3BzWzBdXSAtIHAxW3Byb3BzWzBdXSxcbiAgICAgICAgeSA9IHAyW3Byb3BzWzFdXSAtIHAxW3Byb3BzWzFdXTtcblxuICAgIHJldHVybiBNYXRoLnNxcnQoKHggKiB4KSArICh5ICogeSkpO1xufVxuXG4vKipcbiAqIGNhbGN1bGF0ZSB0aGUgYW5nbGUgYmV0d2VlbiB0d28gY29vcmRpbmF0ZXNcbiAqIEBwYXJhbSB7T2JqZWN0fSBwMVxuICogQHBhcmFtIHtPYmplY3R9IHAyXG4gKiBAcGFyYW0ge0FycmF5fSBbcHJvcHNdIGNvbnRhaW5pbmcgeCBhbmQgeSBrZXlzXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IGFuZ2xlXG4gKi9cbmZ1bmN0aW9uIGdldEFuZ2xlKHAxLCBwMiwgcHJvcHM/KSB7XG4gICAgaWYgKCFwcm9wcykge1xuICAgICAgICBwcm9wcyA9IFBST1BTX1hZO1xuICAgIH1cbiAgICB2YXIgeCA9IHAyW3Byb3BzWzBdXSAtIHAxW3Byb3BzWzBdXSxcbiAgICAgICAgeSA9IHAyW3Byb3BzWzFdXSAtIHAxW3Byb3BzWzFdXTtcbiAgICByZXR1cm4gTWF0aC5hdGFuMih5LCB4KSAqIDE4MCAvIE1hdGguUEk7XG59XG5cbi8qKlxuICogY2FsY3VsYXRlIHRoZSByb3RhdGlvbiBkZWdyZWVzIGJldHdlZW4gdHdvIHBvaW50ZXJzZXRzXG4gKiBAcGFyYW0ge0FycmF5fSBzdGFydCBhcnJheSBvZiBwb2ludGVyc1xuICogQHBhcmFtIHtBcnJheX0gZW5kIGFycmF5IG9mIHBvaW50ZXJzXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IHJvdGF0aW9uXG4gKi9cbmZ1bmN0aW9uIGdldFJvdGF0aW9uKHN0YXJ0LCBlbmQpIHtcbiAgICByZXR1cm4gZ2V0QW5nbGUoZW5kWzFdLCBlbmRbMF0sIFBST1BTX0NMSUVOVF9YWSkgLSBnZXRBbmdsZShzdGFydFsxXSwgc3RhcnRbMF0sIFBST1BTX0NMSUVOVF9YWSk7XG59XG5cbi8qKlxuICogY2FsY3VsYXRlIHRoZSBzY2FsZSBmYWN0b3IgYmV0d2VlbiB0d28gcG9pbnRlcnNldHNcbiAqIG5vIHNjYWxlIGlzIDEsIGFuZCBnb2VzIGRvd24gdG8gMCB3aGVuIHBpbmNoZWQgdG9nZXRoZXIsIGFuZCBiaWdnZXIgd2hlbiBwaW5jaGVkIG91dFxuICogQHBhcmFtIHtBcnJheX0gc3RhcnQgYXJyYXkgb2YgcG9pbnRlcnNcbiAqIEBwYXJhbSB7QXJyYXl9IGVuZCBhcnJheSBvZiBwb2ludGVyc1xuICogQHJldHVybiB7TnVtYmVyfSBzY2FsZVxuICovXG5mdW5jdGlvbiBnZXRTY2FsZShzdGFydCwgZW5kKSB7XG4gICAgcmV0dXJuIGdldERpc3RhbmNlKGVuZFswXSwgZW5kWzFdLCBQUk9QU19DTElFTlRfWFkpIC8gZ2V0RGlzdGFuY2Uoc3RhcnRbMF0sIHN0YXJ0WzFdLCBQUk9QU19DTElFTlRfWFkpO1xufVxuXG52YXIgVE9VQ0hfSU5QVVRfTUFQOiB7IFtzOiBzdHJpbmddOiBudW1iZXI7IH0gPSB7XG4gICAgdG91Y2hzdGFydDogSU5QVVRfU1RBUlQsXG4gICAgdG91Y2htb3ZlOiBJTlBVVF9NT1ZFLFxuICAgIHRvdWNoZW5kOiBJTlBVVF9FTkQsXG4gICAgdG91Y2hjYW5jZWw6IElOUFVUX0NBTkNFTFxufTtcblxudmFyIFRPVUNIX1RBUkdFVF9FVkVOVFMgPSAndG91Y2hzdGFydCB0b3VjaG1vdmUgdG91Y2hlbmQgdG91Y2hjYW5jZWwnO1xuXG5jbGFzcyBUb3VjaElucHV0IGV4dGVuZHMgSW5wdXQge1xuICAgIHByaXZhdGUgdGFyZ2V0SWRzID0ge307XG4gICAgcHJpdmF0ZSBjYWxsYmFjazogKG1hbmFnZXI6IE1hbmFnZXIsIHR5cGU6IG51bWJlciwgZGF0YTogVG91Y2hFdmVudCkgPT4gdm9pZDtcbiAgICAvKipcbiAgICAgKiBNdWx0aS11c2VyIHRvdWNoIGV2ZW50cyBpbnB1dFxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBleHRlbmRzIElucHV0XG4gICAgICovXG4gICAgY29uc3RydWN0b3IobWFuYWdlcjogTWFuYWdlciwgY2FsbGJhY2s6IChtYW5hZ2VyOiBNYW5hZ2VyLCB0eXBlOiBudW1iZXIsIGRhdGE6IFRvdWNoRXZlbnQpID0+IHZvaWQpIHtcbiAgICAgICAgLy8gRklYTUU6IFRoZSBiYXNlIGNsYXNzIHJlZ2lzdGVycyBoYW5kbGVycyBhbmQgY291bGQgYmUgZmlyaW5nIGV2ZW50c1xuICAgICAgICAvLyBiZWZvcmUgdGhpcyBjb25zdHJ1Y3RvciBoYXMgaW5pdGlhbGl6ZWQgY2FsbGJhY2s/XG4gICAgICAgIHN1cGVyKG1hbmFnZXIsIHVuZGVmaW5lZCwgVE9VQ0hfVEFSR0VUX0VWRU5UUywgdW5kZWZpbmVkKTtcbiAgICAgICAgdGhpcy5jYWxsYmFjayA9IGNhbGxiYWNrO1xuICAgIH1cbiAgICBoYW5kbGVyKGV2ZW50OiBUb3VjaEV2ZW50KSB7XG4gICAgICAgIHZhciBldmVudFR5cGU6IG51bWJlciA9IFRPVUNIX0lOUFVUX01BUFtldmVudC50eXBlXTtcbiAgICAgICAgdGhpcy5jYWxsYmFjayh0aGlzLm1hbmFnZXIsIGV2ZW50VHlwZSwgZXZlbnQpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAdGhpcyB7VG91Y2hJbnB1dH1cbiAqIEBwYXJhbSB7T2JqZWN0fSBldlxuICogQHBhcmFtIHtOdW1iZXJ9IHR5cGUgZmxhZ1xuICogQHJldHVybiB7dW5kZWZpbmVkfEFycmF5fSBbYWxsLCBjaGFuZ2VkXVxuICovXG5mdW5jdGlvbiBnZXRUb3VjaGVzKGV2ZW50OiBUb3VjaEV2ZW50LCB0eXBlOiBudW1iZXIpIHtcbiAgICB2YXIgYWxsVG91Y2hlcyA9IHRvQXJyYXkoZXZlbnQudG91Y2hlcyk7XG4gICAgdmFyIHRhcmdldElkcyA9IHRoaXMudGFyZ2V0SWRzO1xuXG4gICAgLy8gd2hlbiB0aGVyZSBpcyBvbmx5IG9uZSB0b3VjaCwgdGhlIHByb2Nlc3MgY2FuIGJlIHNpbXBsaWZpZWRcbiAgICBpZiAodHlwZSAmIChJTlBVVF9TVEFSVCB8IElOUFVUX01PVkUpICYmIGFsbFRvdWNoZXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHRhcmdldElkc1thbGxUb3VjaGVzWzBdLmlkZW50aWZpZXJdID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIFthbGxUb3VjaGVzLCBhbGxUb3VjaGVzXTtcbiAgICB9XG5cbiAgICB2YXIgaSxcbiAgICAgICAgdGFyZ2V0VG91Y2hlcyxcbiAgICAgICAgY2hhbmdlZFRvdWNoZXMgPSB0b0FycmF5KGV2ZW50LmNoYW5nZWRUb3VjaGVzKSxcbiAgICAgICAgY2hhbmdlZFRhcmdldFRvdWNoZXMgPSBbXSxcbiAgICAgICAgdGFyZ2V0ID0gdGhpcy50YXJnZXQ7XG5cbiAgICAvLyBnZXQgdGFyZ2V0IHRvdWNoZXMgZnJvbSB0b3VjaGVzXG4gICAgdGFyZ2V0VG91Y2hlcyA9IGFsbFRvdWNoZXMuZmlsdGVyKGZ1bmN0aW9uKHRvdWNoKSB7XG4gICAgICAgIHJldHVybiBoYXNQYXJlbnQodG91Y2gudGFyZ2V0LCB0YXJnZXQpO1xuICAgIH0pO1xuXG4gICAgLy8gY29sbGVjdCB0b3VjaGVzXG4gICAgaWYgKHR5cGUgPT09IElOUFVUX1NUQVJUKSB7XG4gICAgICAgIGkgPSAwO1xuICAgICAgICB3aGlsZSAoaSA8IHRhcmdldFRvdWNoZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0YXJnZXRJZHNbdGFyZ2V0VG91Y2hlc1tpXS5pZGVudGlmaWVyXSA9IHRydWU7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBmaWx0ZXIgY2hhbmdlZCB0b3VjaGVzIHRvIG9ubHkgY29udGFpbiB0b3VjaGVzIHRoYXQgZXhpc3QgaW4gdGhlIGNvbGxlY3RlZCB0YXJnZXQgaWRzXG4gICAgaSA9IDA7XG4gICAgd2hpbGUgKGkgPCBjaGFuZ2VkVG91Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgaWYgKHRhcmdldElkc1tjaGFuZ2VkVG91Y2hlc1tpXS5pZGVudGlmaWVyXSkge1xuICAgICAgICAgICAgY2hhbmdlZFRhcmdldFRvdWNoZXMucHVzaChjaGFuZ2VkVG91Y2hlc1tpXSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBjbGVhbnVwIHJlbW92ZWQgdG91Y2hlc1xuICAgICAgICBpZiAodHlwZSAmIChJTlBVVF9FTkQgfCBJTlBVVF9DQU5DRUwpKSB7XG4gICAgICAgICAgICBkZWxldGUgdGFyZ2V0SWRzW2NoYW5nZWRUb3VjaGVzW2ldLmlkZW50aWZpZXJdO1xuICAgICAgICB9XG4gICAgICAgIGkrKztcbiAgICB9XG5cbiAgICBpZiAoIWNoYW5nZWRUYXJnZXRUb3VjaGVzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgcmV0dXJuIFtcbiAgICAgICAgLy8gbWVyZ2UgdGFyZ2V0VG91Y2hlcyB3aXRoIGNoYW5nZWRUYXJnZXRUb3VjaGVzIHNvIGl0IGNvbnRhaW5zIEFMTCB0b3VjaGVzLCBpbmNsdWRpbmcgJ2VuZCcgYW5kICdjYW5jZWwnXG4gICAgICAgIHVuaXF1ZUFycmF5KHRhcmdldFRvdWNoZXMuY29uY2F0KGNoYW5nZWRUYXJnZXRUb3VjaGVzKSwgJ2lkZW50aWZpZXInLCB0cnVlKSxcbiAgICAgICAgY2hhbmdlZFRhcmdldFRvdWNoZXNcbiAgICBdO1xufVxuXG4vKipcbiAqIFJlY29nbml6ZXIgZmxvdyBleHBsYWluZWQ7ICpcbiAqIEFsbCByZWNvZ25pemVycyBoYXZlIHRoZSBpbml0aWFsIHN0YXRlIG9mIFBPU1NJQkxFIHdoZW4gYSBpbnB1dCBzZXNzaW9uIHN0YXJ0cy5cbiAqIFRoZSBkZWZpbml0aW9uIG9mIGEgaW5wdXQgc2Vzc2lvbiBpcyBmcm9tIHRoZSBmaXJzdCBpbnB1dCB1bnRpbCB0aGUgbGFzdCBpbnB1dCwgd2l0aCBhbGwgaXQncyBtb3ZlbWVudCBpbiBpdC4gKlxuICogRXhhbXBsZSBzZXNzaW9uIGZvciBtb3VzZS1pbnB1dDogbW91c2Vkb3duIC0+IG1vdXNlbW92ZSAtPiBtb3VzZXVwXG4gKlxuICogT24gZWFjaCByZWNvZ25pemluZyBjeWNsZSAoc2VlIE1hbmFnZXIucmVjb2duaXplKSB0aGUgLnJlY29nbml6ZSgpIG1ldGhvZCBpcyBleGVjdXRlZFxuICogd2hpY2ggZGV0ZXJtaW5lcyB3aXRoIHN0YXRlIGl0IHNob3VsZCBiZS5cbiAqXG4gKiBJZiB0aGUgcmVjb2duaXplciBoYXMgdGhlIHN0YXRlIEZBSUxFRCwgQ0FOQ0VMTEVEIG9yIFJFQ09HTklaRUQgKGVxdWFscyBFTkRFRCksIGl0IGlzIHJlc2V0IHRvXG4gKiBQT1NTSUJMRSB0byBnaXZlIGl0IGFub3RoZXIgY2hhbmdlIG9uIHRoZSBuZXh0IGN5Y2xlLlxuICpcbiAqICAgICAgICAgICAgICAgUG9zc2libGVcbiAqICAgICAgICAgICAgICAgICAgfFxuICogICAgICAgICAgICArLS0tLS0rLS0tLS0tLS0tLS0tLS0tK1xuICogICAgICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgfFxuICogICAgICArLS0tLS0rLS0tLS0rICAgICAgICAgICAgICAgfFxuICogICAgICB8ICAgICAgICAgICB8ICAgICAgICAgICAgICAgfFxuICogICBGYWlsZWQgICAgICBDYW5jZWxsZWQgICAgICAgICAgfFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICstLS0tLS0tKy0tLS0tLStcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICB8ICAgICAgICAgICAgICB8XG4gKiAgICAgICAgICAgICAgICAgICAgICBSZWNvZ25pemVkICAgICAgIEJlZ2FuXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIENoYW5nZWRcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBSZWNvZ25pemVkXG4gKi9cbmV4cG9ydCB2YXIgU1RBVEVfVU5ERUZJTkVEID0gMDtcbmV4cG9ydCB2YXIgU1RBVEVfUE9TU0lCTEUgPSAxO1xuZXhwb3J0IHZhciBTVEFURV9CRUdBTiA9IDI7XG5leHBvcnQgdmFyIFNUQVRFX0NIQU5HRUQgPSA0O1xuZXhwb3J0IHZhciBTVEFURV9SRUNPR05JWkVEID0gODtcbmV4cG9ydCB2YXIgU1RBVEVfQ0FOQ0VMTEVEID0gMTY7XG5leHBvcnQgdmFyIFNUQVRFX0ZBSUxFRCA9IDMyO1xuXG5leHBvcnQgY2xhc3MgUmVjb2duaXplciBpbXBsZW1lbnRzIElSZWNvZ25pemVyIHtcbiAgICBwdWJsaWMgaWQ7XG4gICAgcHVibGljIG1hbmFnZXI6IElSZWNvZ25pemVyQ2FsbGJhY2s7XG4gICAgcHVibGljIGV2ZW50TmFtZTogc3RyaW5nO1xuICAgIHB1YmxpYyBlbmFibGVkOiBib29sZWFuO1xuICAgIHB1YmxpYyBzdGF0ZTogbnVtYmVyO1xuICAgIHB1YmxpYyBzaW11bHRhbmVvdXMgPSB7fTsgLy8gVE9ETzogVHlwZSBhcyBtYXAgb2Ygc3RyaW5nIHRvIFJlY29nbml6ZXIuXG4gICAgcHVibGljIHJlcXVpcmVGYWlsOiBJUmVjb2duaXplcltdID0gW107XG4gICAgLyoqXG4gICAgICogUmVjb2duaXplclxuICAgICAqIEV2ZXJ5IHJlY29nbml6ZXIgbmVlZHMgdG8gZXh0ZW5kIGZyb20gdGhpcyBjbGFzcy5cbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihldmVudE5hbWU6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLmV2ZW50TmFtZSA9IGV2ZW50TmFtZTtcbiAgICAgICAgdGhpcy5lbmFibGVkID0gZW5hYmxlZDtcbiAgICAgICAgdGhpcy5pZCA9IHVuaXF1ZUlkKCk7XG5cbiAgICAgICAgdGhpcy5tYW5hZ2VyID0gbnVsbDtcbiAgICAgICAgLy8gICAgICB0aGlzLm9wdGlvbnMgPSBtZXJnZShvcHRpb25zIHx8IHt9LCB0aGlzLmRlZmF1bHRzKTtcblxuICAgICAgICAvLyBkZWZhdWx0IGlzIGVuYWJsZSB0cnVlXG4gICAgICAgIC8vICAgICAgdGhpcy5vcHRpb25zLmVuYWJsZSA9IGlmVW5kZWZpbmVkKHRoaXMub3B0aW9ucy5lbmFibGUsIHRydWUpO1xuXG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9QT1NTSUJMRTtcbiAgICB9XG4gICAgc2V0KG9wdGlvbnMpIHtcbiAgICAgICAgLy8gICAgICBleHRlbmQodGhpcy5vcHRpb25zLCBvcHRpb25zKTtcblxuICAgICAgICAvLyBhbHNvIHVwZGF0ZSB0aGUgdG91Y2hBY3Rpb24sIGluIGNhc2Ugc29tZXRoaW5nIGNoYW5nZWQgYWJvdXQgdGhlIGRpcmVjdGlvbnMvZW5hYmxlZCBzdGF0ZVxuICAgICAgICB0aGlzLm1hbmFnZXIgJiYgdGhpcy5tYW5hZ2VyLnVwZGF0ZVRvdWNoQWN0aW9uKCk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHJlY29nbml6ZSBzaW11bHRhbmVvdXMgd2l0aCBhbiBvdGhlciByZWNvZ25pemVyLlxuICAgICAqIEBwYXJhbSB7UmVjb2duaXplcn0gb3RoZXJSZWNvZ25pemVyXG4gICAgICogQHJldHVybiB7UmVjb2duaXplcn0gdGhpc1xuICAgICAqL1xuICAgIHJlY29nbml6ZVdpdGgob3RoZXJSZWNvZ25pemVyOiBJUmVjb2duaXplcik6IElSZWNvZ25pemVyIHtcbiAgICAgICAgdmFyIHNpbXVsdGFuZW91cyA9IHRoaXMuc2ltdWx0YW5lb3VzO1xuICAgICAgICBvdGhlclJlY29nbml6ZXIgPSBnZXRSZWNvZ25pemVyQnlOYW1lSWZNYW5hZ2VyKG90aGVyUmVjb2duaXplciwgdGhpcy5tYW5hZ2VyKTtcbiAgICAgICAgaWYgKCFzaW11bHRhbmVvdXNbb3RoZXJSZWNvZ25pemVyLmlkXSkge1xuICAgICAgICAgICAgc2ltdWx0YW5lb3VzW290aGVyUmVjb2duaXplci5pZF0gPSBvdGhlclJlY29nbml6ZXI7XG4gICAgICAgICAgICBvdGhlclJlY29nbml6ZXIucmVjb2duaXplV2l0aCh0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBkcm9wIHRoZSBzaW11bHRhbmVvdXMgbGluay4gaXQgZG9lc250IHJlbW92ZSB0aGUgbGluayBvbiB0aGUgb3RoZXIgcmVjb2duaXplci5cbiAgICAgKiBAcGFyYW0ge1JlY29nbml6ZXJ9IG90aGVyUmVjb2duaXplclxuICAgICAqIEByZXR1cm4ge1JlY29nbml6ZXJ9IHRoaXNcbiAgICAgKi9cbiAgICBkcm9wUmVjb2duaXplV2l0aChvdGhlclJlY29nbml6ZXI6IElSZWNvZ25pemVyKSB7XG4gICAgICAgIG90aGVyUmVjb2duaXplciA9IGdldFJlY29nbml6ZXJCeU5hbWVJZk1hbmFnZXIob3RoZXJSZWNvZ25pemVyLCB0aGlzLm1hbmFnZXIpO1xuICAgICAgICBkZWxldGUgdGhpcy5zaW11bHRhbmVvdXNbb3RoZXJSZWNvZ25pemVyLmlkXTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogcmVjb2duaXplciBjYW4gb25seSBydW4gd2hlbiBhbiBvdGhlciBpcyBmYWlsaW5nXG4gICAgICovXG4gICAgcmVxdWlyZUZhaWx1cmUob3RoZXJSZWNvZ25pemVyOiBJUmVjb2duaXplcik6IElSZWNvZ25pemVyIHtcbiAgICAgICAgdmFyIHJlcXVpcmVGYWlsID0gdGhpcy5yZXF1aXJlRmFpbDtcbiAgICAgICAgb3RoZXJSZWNvZ25pemVyID0gZ2V0UmVjb2duaXplckJ5TmFtZUlmTWFuYWdlcihvdGhlclJlY29nbml6ZXIsIHRoaXMubWFuYWdlcik7XG4gICAgICAgIGlmIChpbkFycmF5KHJlcXVpcmVGYWlsLCBvdGhlclJlY29nbml6ZXIpID09PSAtMSkge1xuICAgICAgICAgICAgcmVxdWlyZUZhaWwucHVzaChvdGhlclJlY29nbml6ZXIpO1xuICAgICAgICAgICAgb3RoZXJSZWNvZ25pemVyLnJlcXVpcmVGYWlsdXJlKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGRyb3AgdGhlIHJlcXVpcmVGYWlsdXJlIGxpbmsuIGl0IGRvZXMgbm90IHJlbW92ZSB0aGUgbGluayBvbiB0aGUgb3RoZXIgcmVjb2duaXplci5cbiAgICAgKiBAcGFyYW0ge1JlY29nbml6ZXJ9IG90aGVyUmVjb2duaXplclxuICAgICAqIEByZXR1cm4ge1JlY29nbml6ZXJ9IHRoaXNcbiAgICAgKi9cbiAgICBkcm9wUmVxdWlyZUZhaWx1cmUob3RoZXJSZWNvZ25pemVyOiBJUmVjb2duaXplcikge1xuICAgICAgICBvdGhlclJlY29nbml6ZXIgPSBnZXRSZWNvZ25pemVyQnlOYW1lSWZNYW5hZ2VyKG90aGVyUmVjb2duaXplciwgdGhpcy5tYW5hZ2VyKTtcbiAgICAgICAgdmFyIGluZGV4ID0gaW5BcnJheSh0aGlzLnJlcXVpcmVGYWlsLCBvdGhlclJlY29nbml6ZXIpO1xuICAgICAgICBpZiAoaW5kZXggPiAtMSkge1xuICAgICAgICAgICAgdGhpcy5yZXF1aXJlRmFpbC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGhhcyByZXF1aXJlIGZhaWx1cmVzIGJvb2xlYW5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGhhc1JlcXVpcmVGYWlsdXJlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVxdWlyZUZhaWwubGVuZ3RoID4gMDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBpZiB0aGUgcmVjb2duaXplciBjYW4gcmVjb2duaXplIHNpbXVsdGFuZW91cyB3aXRoIGFuIG90aGVyIHJlY29nbml6ZXJcbiAgICAgKiBAcGFyYW0ge1JlY29nbml6ZXJ9IG90aGVyUmVjb2duaXplclxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgY2FuUmVjb2duaXplV2l0aChvdGhlclJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuc2ltdWx0YW5lb3VzW290aGVyUmVjb2duaXplci5pZF07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogWW91IHNob3VsZCB1c2UgYHRyeUVtaXRgIGluc3RlYWQgb2YgYGVtaXRgIGRpcmVjdGx5IHRvIGNoZWNrXG4gICAgICogdGhhdCBhbGwgdGhlIG5lZWRlZCByZWNvZ25pemVycyBoYXMgZmFpbGVkIGJlZm9yZSBlbWl0dGluZy5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gaW5wdXRcbiAgICAgKi9cbiAgICBlbWl0KCk6IHZvaWQge1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXMuc3RhdGU7XG5cbiAgICAgICAgZnVuY3Rpb24gZW1pdCh3aXRoU3RhdGU/OiBib29sZWFuKSB7XG4gICAgICAgICAgICB2YXIgZXZlbnROYW1lID0gc2VsZi5ldmVudE5hbWUgKyAod2l0aFN0YXRlID8gc3RhdGVTdHIoc3RhdGUpIDogJycpO1xuICAgICAgICAgICAgc2VsZi5tYW5hZ2VyLmVtaXQoZXZlbnROYW1lLCB1bmRlZmluZWQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRklYTUU6IE5vdCBuaWNlLCBtZWFuaW5nIGltcGxpY2l0IGluIHN0YXRlIG51bWJlcmluZy5cbiAgICAgICAgLy8gJ3BhbnN0YXJ0JyBhbmQgJ3Bhbm1vdmUnXG4gICAgICAgIGlmIChzdGF0ZSA8IFNUQVRFX1JFQ09HTklaRUQpIHtcbiAgICAgICAgICAgIGVtaXQodHJ1ZSk7XG4gICAgICAgIH1cblxuICAgICAgICBlbWl0KGZhbHNlKTsgLy8gc2ltcGxlICdldmVudE5hbWUnIGV2ZW50c1xuXG4gICAgICAgIC8vIHBhbmVuZCBhbmQgcGFuY2FuY2VsXG4gICAgICAgIGlmIChzdGF0ZSA+PSBTVEFURV9SRUNPR05JWkVEKSB7XG4gICAgICAgICAgICBlbWl0KHRydWUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2hlY2sgdGhhdCBhbGwgdGhlIHJlcXVpcmUgZmFpbHVyZSByZWNvZ25pemVycyBoYXMgZmFpbGVkLFxuICAgICAqIGlmIHRydWUsIGl0IGVtaXRzIGEgZ2VzdHVyZSBldmVudCxcbiAgICAgKiBvdGhlcndpc2UsIHNldHVwIHRoZSBzdGF0ZSB0byBGQUlMRUQuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGlucHV0XG4gICAgICovXG4gICAgdHJ5RW1pdCgpIHtcbiAgICAgICAgaWYgKHRoaXMuY2FuRW1pdCgpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5lbWl0KCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaXQncyBmYWlsaW5nIGFueXdheT9cbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0ZBSUxFRDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBjYW4gd2UgZW1pdD9cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGNhbkVtaXQoKSB7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgd2hpbGUgKGkgPCB0aGlzLnJlcXVpcmVGYWlsLmxlbmd0aCkge1xuICAgICAgICAgICAgaWYgKCEodGhpcy5yZXF1aXJlRmFpbFtpXS5zdGF0ZSAmIChTVEFURV9GQUlMRUQgfCBTVEFURV9QT1NTSUJMRSkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHVwZGF0ZSB0aGUgcmVjb2duaXplclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dERhdGFcbiAgICAgKi9cbiAgICByZWNvZ25pemUoY29tcEV2ZW50OiBJQ29tcHV0ZWRFdmVudCk6IHZvaWQge1xuXG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLnJlc2V0KCk7XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfRkFJTEVEO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmVzZXQgd2hlbiB3ZSd2ZSByZWFjaGVkIHRoZSBlbmRcbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgJiAoU1RBVEVfUkVDT0dOSVpFRCB8IFNUQVRFX0NBTkNFTExFRCB8IFNUQVRFX0ZBSUxFRCkpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9QT1NTSUJMRTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc3RhdGUgPSB0aGlzLnByb2Nlc3MoY29tcEV2ZW50KTtcblxuICAgICAgICAvLyB0aGUgcmVjb2duaXplciBoYXMgcmVjb2duaXplZCBhIGdlc3R1cmUgc28gdHJpZ2dlciBhbiBldmVudFxuICAgICAgICBpZiAodGhpcy5zdGF0ZSAmIChTVEFURV9CRUdBTiB8IFNUQVRFX0NIQU5HRUQgfCBTVEFURV9SRUNPR05JWkVEIHwgU1RBVEVfQ0FOQ0VMTEVEKSkge1xuICAgICAgICAgICAgdGhpcy50cnlFbWl0KCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiByZXR1cm4gdGhlIHN0YXRlIG9mIHRoZSByZWNvZ25pemVyXG4gICAgICogdGhlIGFjdHVhbCByZWNvZ25pemluZyBoYXBwZW5zIGluIHRoaXMgbWV0aG9kXG4gICAgICogQHZpcnR1YWxcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gaW5wdXREYXRhXG4gICAgICogQHJldHVybiB7Q29uc3R9IFNUQVRFXG4gICAgICovXG4gICAgcHJvY2VzcyhpbnB1dERhdGE6IElDb21wdXRlZEV2ZW50KTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIFNUQVRFX1VOREVGSU5FRDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiByZXR1cm4gdGhlIHByZWZlcnJlZCB0b3VjaC1hY3Rpb25cbiAgICAgKiBAdmlydHVhbFxuICAgICAqIEByZXR1cm4ge0FycmF5fVxuICAgICAqL1xuICAgIGdldFRvdWNoQWN0aW9uKCk6IHN0cmluZ1tdIHsgcmV0dXJuIFtdOyB9XG5cbiAgICAvKipcbiAgICAgKiBjYWxsZWQgd2hlbiB0aGUgZ2VzdHVyZSBpc24ndCBhbGxvd2VkIHRvIHJlY29nbml6ZVxuICAgICAqIGxpa2Ugd2hlbiBhbm90aGVyIGlzIGJlaW5nIHJlY29nbml6ZWQgb3IgaXQgaXMgZGlzYWJsZWRcbiAgICAgKiBAdmlydHVhbFxuICAgICAqL1xuICAgIHJlc2V0KCkgeyB9XG59XG5cbi8qKlxuICogVE9ETzogQXJlIHRoZSBzdHJpbmcgdmFsdWVzIHBhcnQgb2YgdGhlIEFQSSwgb3IganVzdCBmb3IgZGVidWdnaW5nP1xuICogZ2V0IGEgdXNhYmxlIHN0cmluZywgdXNlZCBhcyBldmVudCBwb3N0Zml4XG4gKiBAcGFyYW0ge0NvbnN0fSBzdGF0ZVxuICogQHJldHVybiB7U3RyaW5nfSBzdGF0ZVxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhdGVTdHIoc3RhdGU6IG51bWJlcik6IHN0cmluZyB7XG4gICAgaWYgKHN0YXRlICYgU1RBVEVfQ0FOQ0VMTEVEKSB7XG4gICAgICAgIHJldHVybiAnY2FuY2VsJztcbiAgICB9XG4gICAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9SRUNPR05JWkVEKSB7XG4gICAgICAgIHJldHVybiAnZW5kJztcbiAgICB9XG4gICAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9DSEFOR0VEKSB7XG4gICAgICAgIHJldHVybiAnbW92ZSc7XG4gICAgfVxuICAgIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfQkVHQU4pIHtcbiAgICAgICAgcmV0dXJuICdzdGFydCc7XG4gICAgfVxuICAgIHJldHVybiAnJztcbn1cblxuLyoqXG4gKiBQcm92aWRlIGEgZGVjb2RlIG9mIHRoZSBzdGF0ZS5cbiAqIFRoZSByZXN1bHQgaXMgbm90IG5vcm1hdGl2ZSBhbmQgc2hvdWxkIG5vdCBiZSBjb25zaWRlcmVkIEFQSS5cbiAqIFNpbmUgdGhlIHN0YXRlIGlzIGEgYml0IGZpZWxkLCBzaG93IGFsbCBiaXRzIGV2ZW4gdGhvdWdoIHRoZXkgbWF5L3Nob3VsZCBiZSBleGNsdXNpdmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZURlY29kZShzdGF0ZTogbnVtYmVyKTogc3RyaW5nIHtcbiAgICB2YXIgc3RhdGVzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChzdGF0ZSAmIFNUQVRFX1BPU1NJQkxFKSB7XG4gICAgICAgIHN0YXRlcy5wdXNoKCdTVEFURV9QT1NTSUJMRScpO1xuICAgIH1cbiAgICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX0NBTkNFTExFRCkge1xuICAgICAgICBzdGF0ZXMucHVzaCgnU1RBVEVfQ0FOQ0VMTEVEJyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfUkVDT0dOSVpFRCkge1xuICAgICAgICBzdGF0ZXMucHVzaCgnU1RBVEVfUkVDT0dOSVpFRCcpO1xuICAgIH1cbiAgICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX0NIQU5HRUQpIHtcbiAgICAgICAgc3RhdGVzLnB1c2goJ1NUQVRFX0NIQU5HRUQnKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9CRUdBTikge1xuICAgICAgICBzdGF0ZXMucHVzaCgnU1RBVEVfQkVHQU4nKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9VTkRFRklORUQpIHtcbiAgICAgICAgc3RhdGVzLnB1c2goJ1NUQVRFX1VOREVGSU5FRCcpO1xuICAgIH1cbiAgICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX0ZBSUxFRCkge1xuICAgICAgICBzdGF0ZXMucHVzaCgnU1RBVEVfRkFJTEVEJyk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBzdGF0ZXMucHVzaCgnJyArIHN0YXRlKTtcbiAgICB9XG4gICAgcmV0dXJuIHN0YXRlcy5qb2luKCcgJyk7XG59XG5cbi8qKlxuICogVE9ETzogVGhpcyByZWFsbHkgYmVsb25ncyBpbiB0aGUgaW5wdXQgc2VydmljZS5cbiAqIGRpcmVjdGlvbiBjb25zIHRvIHN0cmluZ1xuICogQHBhcmFtIHtDb25zdH0gZGlyZWN0aW9uXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkaXJlY3Rpb25TdHIoZGlyZWN0aW9uOiBudW1iZXIpOiBzdHJpbmcge1xuICAgIHZhciBkczogc3RyaW5nW10gPSBbXTtcbiAgICBpZiAoZGlyZWN0aW9uICYgRElSRUNUSU9OX0RPV04pIHtcbiAgICAgICAgZHMucHVzaCgnZG93bicpO1xuICAgIH1cbiAgICBpZiAoZGlyZWN0aW9uICYgRElSRUNUSU9OX1VQKSB7XG4gICAgICAgIGRzLnB1c2goJ3VwJyk7XG4gICAgfVxuICAgIGlmIChkaXJlY3Rpb24gJiBESVJFQ1RJT05fTEVGVCkge1xuICAgICAgICBkcy5wdXNoKCdsZWZ0Jyk7XG4gICAgfVxuICAgIGlmIChkaXJlY3Rpb24gJiBESVJFQ1RJT05fUklHSFQpIHtcbiAgICAgICAgZHMucHVzaCgncmlnaHQnKTtcbiAgICB9XG4gICAgcmV0dXJuIGRzLmpvaW4oJyAnKTtcbn1cblxuLyoqXG4gKiBnZXQgYSByZWNvZ25pemVyIGJ5IG5hbWUgaWYgaXQgaXMgYm91bmQgdG8gYSBtYW5hZ2VyXG4gKiBAcGFyYW0ge1JlY29nbml6ZXJ8U3RyaW5nfSBvdGhlclJlY29nbml6ZXJcbiAqIEBwYXJhbSB7UmVjb2duaXplcn0gcmVjb2duaXplclxuICogQHJldHVybiB7UmVjb2duaXplcn1cbiAqL1xuZnVuY3Rpb24gZ2V0UmVjb2duaXplckJ5TmFtZUlmTWFuYWdlcihyZWNvZ25pemVyOiBJUmVjb2duaXplciwgbWFuYWdlcjogSVJlY29nbml6ZXJDYWxsYmFjayk6IElSZWNvZ25pemVyIHtcbiAgICBpZiAobWFuYWdlcikge1xuICAgICAgICByZXR1cm4gbWFuYWdlci5nZXQocmVjb2duaXplci5ldmVudE5hbWUpO1xuICAgIH1cbiAgICByZXR1cm4gcmVjb2duaXplcjtcbn1cbiJdfQ==