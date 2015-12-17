"use strict";
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
