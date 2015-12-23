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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFtbWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaGFtbWVyLnRzIl0sIm5hbWVzIjpbIlZlY3RvckUyIiwiVmVjdG9yRTIuY29uc3RydWN0b3IiLCJWZWN0b3JFMi5hZGQiLCJWZWN0b3JFMi5zdWIiLCJWZWN0b3JFMi5kaXYiLCJWZWN0b3JFMi5kb3QiLCJWZWN0b3JFMi5ub3JtIiwiVmVjdG9yRTIucXVhZHJhbmNlIiwiVmVjdG9yRTIudG9TdHJpbmciLCJDbGllbnRMb2NhdGlvbiIsIkNsaWVudExvY2F0aW9uLmNvbnN0cnVjdG9yIiwiQ2xpZW50TG9jYXRpb24ubW92ZVRvIiwiQ2xpZW50TG9jYXRpb24uc3ViIiwiQ2xpZW50TG9jYXRpb24uZnJvbVRvdWNoIiwiQ2xpZW50TG9jYXRpb24udG9TdHJpbmciLCJTZXNzaW9uIiwiU2Vzc2lvbi5jb25zdHJ1Y3RvciIsIlNlc3Npb24ucmVzZXQiLCJTZXNzaW9uLnB1c2giLCJTZXNzaW9uLmNvbXB1dGVNb3ZlbWVudCIsIlNlc3Npb24uY29tcHV0ZVZlbG9jaXR5IiwiTWFuYWdlciIsIk1hbmFnZXIuY29uc3RydWN0b3IiLCJNYW5hZ2VyLnN0b3AiLCJNYW5hZ2VyLnJlY29nbml6ZSIsIk1hbmFnZXIuZ2V0IiwiTWFuYWdlci5hZGQiLCJNYW5hZ2VyLnJlbW92ZSIsIk1hbmFnZXIub24iLCJNYW5hZ2VyLm9mZiIsIk1hbmFnZXIuZW1pdCIsIk1hbmFnZXIudXBkYXRlVG91Y2hBY3Rpb24iLCJNYW5hZ2VyLmRlc3Ryb3kiLCJNYW5hZ2VyLnRvZ2dsZUNzc1Byb3BzIiwiTWFuYWdlci5jYW5jZWxDb250ZXh0TWVudSIsInRyaWdnZXJEb21FdmVudCIsIlRvdWNoQWN0aW9uIiwiVG91Y2hBY3Rpb24uY29uc3RydWN0b3IiLCJUb3VjaEFjdGlvbi5zZXQiLCJUb3VjaEFjdGlvbi51cGRhdGUiLCJUb3VjaEFjdGlvbi5jb21wdXRlIiwiVG91Y2hBY3Rpb24ucHJldmVudERlZmF1bHRzIiwiVG91Y2hBY3Rpb24ucHJldmVudFNyYyIsImNsZWFuVG91Y2hBY3Rpb25zIiwiZGVjb2RlRXZlbnRUeXBlIiwiSW5wdXQiLCJJbnB1dC5jb25zdHJ1Y3RvciIsIklucHV0LmhhbmRsZXIiLCJJbnB1dC5pbml0IiwiSW5wdXQuZGVzdHJveSIsImlucHV0SGFuZGxlciIsImNvbXB1dGVJQ29tcHV0ZWRFdmVudCIsImNvbXB1dGVDZW50ZXIiLCJnZXRWZWxvY2l0eSIsImdldERpcmVjdGlvbiIsImdldERpc3RhbmNlIiwiZ2V0QW5nbGUiLCJnZXRSb3RhdGlvbiIsImdldFNjYWxlIiwiVG91Y2hJbnB1dCIsIlRvdWNoSW5wdXQuY29uc3RydWN0b3IiLCJUb3VjaElucHV0LmhhbmRsZXIiLCJnZXRUb3VjaGVzIiwiUmVjb2duaXplciIsIlJlY29nbml6ZXIuY29uc3RydWN0b3IiLCJSZWNvZ25pemVyLnNldCIsIlJlY29nbml6ZXIucmVjb2duaXplV2l0aCIsIlJlY29nbml6ZXIuZHJvcFJlY29nbml6ZVdpdGgiLCJSZWNvZ25pemVyLnJlcXVpcmVGYWlsdXJlIiwiUmVjb2duaXplci5kcm9wUmVxdWlyZUZhaWx1cmUiLCJSZWNvZ25pemVyLmhhc1JlcXVpcmVGYWlsdXJlcyIsIlJlY29nbml6ZXIuY2FuUmVjb2duaXplV2l0aCIsIlJlY29nbml6ZXIuZW1pdCIsIlJlY29nbml6ZXIuZW1pdC5lbWl0IiwiUmVjb2duaXplci50cnlFbWl0IiwiUmVjb2duaXplci5jYW5FbWl0IiwiUmVjb2duaXplci5yZWNvZ25pemUiLCJSZWNvZ25pemVyLnByb2Nlc3MiLCJSZWNvZ25pemVyLmdldFRvdWNoQWN0aW9uIiwiUmVjb2duaXplci5yZXNldCIsInN0YXRlU3RyIiwic3RhdGVEZWNvZGUiLCJkaXJlY3Rpb25TdHIiLCJnZXRSZWNvZ25pemVyQnlOYW1lSWZNYW5hZ2VyIl0sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7T0FFTixFQUFFLGlCQUFpQixFQUFFLElBQUksRUFBRSxtQkFBbUIsRUFBRSxTQUFTLEVBQUUsT0FB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QSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDN0JBLElBQUlBLElBQUlBLEdBQW1CQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ25DQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDckJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBO1FBQ3JCQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUNESixlQUFlQSxDQUFDQSxNQUFzQkEsRUFBRUEsU0FBaUJBO1FBQ3JESyxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNUQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDN0JBLElBQUlBLElBQUlBLEdBQW1CQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ25FQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDckJBLENB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NkIsU0FBaUI7SUFDMUNDLElBQUlBLEVBQUVBLEdBQWFBLEVBQUVBLENBQUNBO0lBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM3QkEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDcEJBLENBQUNBO0lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLEdBQUdBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1FBQzNCQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNsQkEsQ0FBQ0E7SUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsR0FBR0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO0lBQ3BCQSxDQUFDQTtJQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5QkEsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7SUFDckJBLENBQUNBO0lBQ0RBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO0FBQ3hCQSxDQUFDQTtBQVFELHNDQUFzQyxVQUF1QixFQUFFLE9BQTRCO0lBQ3ZGQyxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNWQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUM3Q0EsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7QUFDdEJBLENBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7IGFkZEV2ZW50TGlzdGVuZXJzLCBlYWNoLCBnZXRXaW5kb3dGb3JFbGVtZW50LCBoYXNQYXJlbnQsIGluQXJyYXksIGluU3RyLCBwcmVmaXhlZCwgcmVtb3ZlRXZlbnRMaXN0ZW5lcnMsIHNwbGl0U3RyLCBURVNUX0VMRU1FTlQsIHRvQXJyYXksIHVuaXF1ZUFycmF5LCB1bmlxdWVJZCB9IGZyb20gJy4vdXRpbHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFRvdWNoIHtcbiAgICBjbGllbnRYOiBudW1iZXI7XG4gICAgY2xpZW50WTogbnVtYmVyO1xuICAgIHBhZ2VYOiBudW1iZXI7XG4gICAgcGFnZVk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUb3VjaEV2ZW50IGV4dGVuZHMgRXZlbnQge1xuICAgIHR5cGU6IHN0cmluZztcbiAgICB0b3VjaGVzOiBUb3VjaFtdO1xuICAgIGNoYW5nZWRUb3VjaGVzOiBUb3VjaFtdO1xufVxuXG4vLyBtYWdpY2FsIHRvdWNoQWN0aW9uIHZhbHVlXG5leHBvcnQgdmFyIFRPVUNIX0FDVElPTl9DT01QVVRFID0gJ2NvbXB1dGUnO1xuZXhwb3J0IHZhciBUT1VDSF9BQ1RJT05fQVVUTyA9ICdhdXRvJztcbmV4cG9ydCB2YXIgVE9VQ0hfQUNUSU9OX01BTklQVUxBVElPTiA9ICdtYW5pcHVsYXRpb24nOyAvLyBub3QgaW1wbGVtZW50ZWRcbmV4cG9ydCB2YXIgVE9VQ0hfQUNUSU9OX05PTkUgPSAnbm9uZSc7XG5leHBvcnQgdmFyIFRPVUNIX0FDVElPTl9QQU5fWCA9ICdwYW4teCc7XG5leHBvcnQgdmFyIFRPVUNIX0FDVElPTl9QQU5fWSA9ICdwYW4teSc7XG5cbnZhciBTVE9QID0gMTtcbnZhciBGT1JDRURfU1RPUCA9IDI7XG5cbmV4cG9ydCBjbGFzcyBWZWN0b3JFMiB7XG4gICAgcHVibGljIHg7XG4gICAgcHVibGljIHk7XG4gICAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy54ID0geDtcbiAgICAgICAgdGhpcy55ID0geTtcbiAgICB9XG4gICAgYWRkKG90aGVyOiBWZWN0b3JFMik6IFZlY3RvckUyIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWZWN0b3JFMih0aGlzLnggKyBvdGhlci54LCB0aGlzLnkgKyBvdGhlci55KTtcbiAgICB9XG4gICAgc3ViKG90aGVyOiBWZWN0b3JFMik6IFZlY3RvckUyIHtcbiAgICAgICAgcmV0dXJuIG5ldyBWZWN0b3JFMih0aGlzLnggLSBvdGhlci54LCB0aGlzLnkgLSBvdGhlci55KTtcbiAgICB9XG4gICAgZGl2KG90aGVyOiBudW1iZXIpOiBWZWN0b3JFMiB7XG4gICAgICAgIHJldHVybiBuZXcgVmVjdG9yRTIodGhpcy54IC8gb3RoZXIsIHRoaXMueSAvIG90aGVyKTtcbiAgICB9XG4gICAgZG90KG90aGVyOiBWZWN0b3JFMik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnggKiBvdGhlci54ICsgdGhpcy55ICogb3RoZXIueTtcbiAgICB9XG4gICAgbm9ybSgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gTWF0aC5zcXJ0KHRoaXMucXVhZHJhbmNlKCkpO1xuICAgIH1cbiAgICBxdWFkcmFuY2UoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueTtcbiAgICB9XG4gICAgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuICdWZWN0b3JFMignICsgdGhpcy54ICsgJywgJyArIHRoaXMueSArICcpJztcbiAgICB9XG59XG5cbmV4cG9ydCBjbGFzcyBDbGllbnRMb2NhdGlvbiB7XG4gICAgcHVibGljIGNsaWVudFg7XG4gICAgcHVibGljIGNsaWVudFk7XG4gICAgY29uc3RydWN0b3IoY2xpZW50WDogbnVtYmVyLCBjbGllbnRZOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5jbGllbnRYID0gY2xpZW50WDtcbiAgICAgICAgdGhpcy5jbGllbnRZID0gY2xpZW50WTtcbiAgICB9XG4gICAgbW92ZVRvKGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGNsaWVudFk7XG4gICAgfVxuICAgIHN1YihvdGhlcjogQ2xpZW50TG9jYXRpb24pOiBWZWN0b3JFMiB7XG4gICAgICAgIHJldHVybiBuZXcgVmVjdG9yRTIodGhpcy5jbGllbnRYIC0gb3RoZXIuY2xpZW50WCwgdGhpcy5jbGllbnRZIC0gb3RoZXIuY2xpZW50WSk7XG4gICAgfVxuICAgIHN0YXRpYyBmcm9tVG91Y2godG91Y2g6IHsgY2xpZW50WDogbnVtYmVyOyBjbGllbnRZOiBudW1iZXIgfSkge1xuICAgICAgICByZXR1cm4gbmV3IENsaWVudExvY2F0aW9uKHRvdWNoLmNsaWVudFgsIHRvdWNoLmNsaWVudFkpO1xuICAgIH1cbiAgICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gJ0NsaWVudExvY2F0aW9uKCcgKyB0aGlzLmNsaWVudFggKyAnLCAnICsgdGhpcy5jbGllbnRZICsgJyknO1xuICAgIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcHV0ZWRFdmVudCB7XG4gICAgZXZlbnRUeXBlOiBudW1iZXI7XG4gICAgdG91Y2hlc0xlbmd0aDogbnVtYmVyO1xuICAgIHRpbWVTdGFtcDogbnVtYmVyO1xuICAgIGNlbnRlcjogQ2xpZW50TG9jYXRpb247XG4gICAgcm90YXRpb246IG51bWJlcjtcbiAgICBkZWx0YVRpbWU6IG51bWJlcjtcbiAgICBkaXN0YW5jZTogbnVtYmVyO1xuICAgIG1vdmVtZW50OiBWZWN0b3JFMjtcbiAgICBkaXJlY3Rpb246IG51bWJlcjtcbiAgICBzY2FsZTogbnVtYmVyO1xuICAgIHZlbG9jaXR5OiBWZWN0b3JFMjtcbn1cblxuLyoqXG4gKiBNYWludGFpbnMgdGhlIGhpc3Rvcnkgb2YgZXZlbnRzIGZvciBhIGdlc3R1cmUgcmVjb2duaXRpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uIHtcbiAgICBwdWJsaWMgc3RhcnRUaW1lOiBudW1iZXI7XG4gICAgcHVibGljIHN0b3BwZWQ6IG51bWJlcjtcbiAgICBwdWJsaWMgY3VyUmVjb2duaXplcjogSVJlY29nbml6ZXI7XG4gICAgcHJpdmF0ZSBjb21wRXZlbnRzOiBJQ29tcHV0ZWRFdmVudFtdID0gW107XG4gICAgY29uc3RydWN0b3IoKSB7XG4gICAgICAgIHRoaXMucmVzZXQoKTtcbiAgICB9XG4gICAgcmVzZXQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgdGhpcy5jb21wRXZlbnRzID0gW107XG4gICAgICAgIHRoaXMuY3VyUmVjb2duaXplciA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcHVzaChjb21wRXZlbnQ6IElDb21wdXRlZEV2ZW50KTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29tcEV2ZW50cy5wdXNoKGNvbXBFdmVudCk7XG4gICAgfVxuICAgIGNvbXB1dGVNb3ZlbWVudChjZW50ZXI6IENsaWVudExvY2F0aW9uKTogVmVjdG9yRTIge1xuICAgICAgICBpZiAoY2VudGVyKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jb21wRXZlbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJldjogSUNvbXB1dGVkRXZlbnQgPSB0aGlzLmNvbXBFdmVudHNbdGhpcy5jb21wRXZlbnRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgIHJldHVybiBjZW50ZXIuc3ViKHByZXYuY2VudGVyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuICAgIGNvbXB1dGVWZWxvY2l0eShjZW50ZXI6IENsaWVudExvY2F0aW9uLCBkZWx0YVRpbWU6IG51bWJlcik6IFZlY3RvckUyIHtcbiAgICAgICAgaWYgKGNlbnRlcikge1xuICAgICAgICAgICAgaWYgKHRoaXMuY29tcEV2ZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdmFyIHByZXY6IElDb21wdXRlZEV2ZW50ID0gdGhpcy5jb21wRXZlbnRzW3RoaXMuY29tcEV2ZW50cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2VudGVyLnN1YihwcmV2LmNlbnRlcikuZGl2KGRlbHRhVGltZSAtIHByZXYuZGVsdGFUaW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfVxuXG59XG5cbi8qKlxuICogVGhlIGNvbnRyYWN0IGZvciB3aGF0IHRoZSBNYW5hZ2VyIHJlcXVpcmVzIGZyb20gYSBSZWNvZ25pemVyLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElSZWNvZ25pemVyIHtcbiAgICBldmVudE5hbWU6IHN0cmluZztcbiAgICBjYW5SZWNvZ25pemVXaXRoKHJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogYm9vbGVhbjtcbiAgICByZWNvZ25pemVXaXRoKHJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogSVJlY29nbml6ZXI7XG4gICAgcmVxdWlyZUZhaWx1cmUocmVjb2duaXplcjogSVJlY29nbml6ZXIpOiBJUmVjb2duaXplcjtcbiAgICByZWNvZ25pemUoaW5wdXREYXRhOiBJQ29tcHV0ZWRFdmVudCk6IHZvaWQ7XG4gICAgcmVzZXQoKTogdm9pZDtcbiAgICBzdGF0ZTogbnVtYmVyO1xuICAgIG1hbmFnZXI6IElSZWNvZ25pemVyQ2FsbGJhY2s7XG4gICAgaWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVjb2duaXplckNhbGxiYWNrIHtcbiAgICBlbWl0KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPyk7XG4gICAgZ2V0KGV2ZW50TmFtZTogc3RyaW5nKTogSVJlY29nbml6ZXI7XG4gICAgdXBkYXRlVG91Y2hBY3Rpb24oKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIE1hbmFnZXIgaW1wbGVtZW50cyBJUmVjb2duaXplckNhbGxiYWNrIHtcbiAgICBwdWJsaWMgaGFuZGxlcnMgPSB7fTtcbiAgICBwdWJsaWMgc2Vzc2lvbiA9IG5ldyBTZXNzaW9uKCk7XG4gICAgcHVibGljIHJlY29nbml6ZXJzOiBJUmVjb2duaXplcltdID0gW107XG4gICAgcHVibGljIGVsZW1lbnQ7XG4gICAgcHVibGljIGlucHV0O1xuICAgIHByaXZhdGUgdG91Y2hBY3Rpb246IFRvdWNoQWN0aW9uO1xuICAgIC8vIFRoZSBmb2xsb3dpbmcgcHJvcGVydGllcyBhcmUgZGVmYXVsdHMuXG4gICAgcHJpdmF0ZSBkb21FdmVudHMgPSBmYWxzZTtcbiAgICBwdWJsaWMgZW5hYmxlID0gdHJ1ZTsgIC8vIFdoYXQgZG9lcyB0aGlzIGVuYWJsZT9cbiAgICBwdWJsaWMgaW5wdXRUYXJnZXQ7XG4gICAgcHJpdmF0ZSBjc3NQcm9wcyA9IHt9O1xuICAgIHByaXZhdGUgY2FsbGJhY2s6IElSZWNvZ25pemVyQ2FsbGJhY2s7XG4gICAgLyoqXG4gICAgICogTWFuYWdlclxuICAgICAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsZW1lbnRcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihlbGVtZW50OiBIVE1MRWxlbWVudCkge1xuICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICB0aGlzLmlucHV0VGFyZ2V0ID0gZWxlbWVudDsgLy8gV2h5IHdvdWxkIHRoaXMgYmUgZGlmZmVyZW50P1xuICAgICAgICB0aGlzLmlucHV0ID0gbmV3IFRvdWNoSW5wdXQodGhpcywgaW5wdXRIYW5kbGVyKTtcbiAgICAgICAgdGhpcy50b3VjaEFjdGlvbiA9IG5ldyBUb3VjaEFjdGlvbih0aGlzLCBUT1VDSF9BQ1RJT05fQ09NUFVURSk7XG4gICAgICAgIHRoaXMudG9nZ2xlQ3NzUHJvcHModHJ1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogc3RvcCByZWNvZ25pemluZyBmb3IgdGhpcyBzZXNzaW9uLlxuICAgICAqIFRoaXMgc2Vzc2lvbiB3aWxsIGJlIGRpc2NhcmRlZCwgd2hlbiBhIG5ldyBbaW5wdXRdc3RhcnQgZXZlbnQgaXMgZmlyZWQuXG4gICAgICogV2hlbiBmb3JjZWQsIHRoZSByZWNvZ25pemVyIGN5Y2xlIGlzIHN0b3BwZWQgaW1tZWRpYXRlbHkuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBbZm9yY2VdXG4gICAgICovXG4gICAgc3RvcChmb3JjZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNlc3Npb24uc3RvcHBlZCA9IGZvcmNlID8gRk9SQ0VEX1NUT1AgOiBTVE9QO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHJ1biB0aGUgcmVjb2duaXplcnMhXG4gICAgICogY2FsbGVkIGJ5IHRoZSBpbnB1dEhhbmRsZXIgZnVuY3Rpb24gb24gZXZlcnkgbW92ZW1lbnQgb2YgdGhlIHBvaW50ZXJzICh0b3VjaGVzKVxuICAgICAqIGl0IHdhbGtzIHRocm91Z2ggYWxsIHRoZSByZWNvZ25pemVycyBhbmQgdHJpZXMgdG8gZGV0ZWN0IHRoZSBnZXN0dXJlIHRoYXQgaXMgYmVpbmcgbWFkZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dERhdGFcbiAgICAgKi9cbiAgICByZWNvZ25pemUoaW5wdXREYXRhOiBJQ29tcHV0ZWRFdmVudCwgdG91Y2hFdmVudDogVG91Y2hFdmVudCk6IHZvaWQge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgaWYgKHNlc3Npb24uc3RvcHBlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcnVuIHRoZSB0b3VjaC1hY3Rpb24gcG9seWZpbGxcbiAgICAgICAgdGhpcy50b3VjaEFjdGlvbi5wcmV2ZW50RGVmYXVsdHMoaW5wdXREYXRhLCB0b3VjaEV2ZW50KTtcblxuICAgICAgICB2YXIgcmVjb2duaXplcjogSVJlY29nbml6ZXI7XG4gICAgICAgIHZhciByZWNvZ25pemVycyA9IHRoaXMucmVjb2duaXplcnM7XG5cbiAgICAgICAgLy8gdGhpcyBob2xkcyB0aGUgcmVjb2duaXplciB0aGF0IGlzIGJlaW5nIHJlY29nbml6ZWQuXG4gICAgICAgIC8vIHNvIHRoZSByZWNvZ25pemVyJ3Mgc3RhdGUgbmVlZHMgdG8gYmUgQkVHQU4sIENIQU5HRUQsIEVOREVEIG9yIFJFQ09HTklaRURcbiAgICAgICAgLy8gaWYgbm8gcmVjb2duaXplciBpcyBkZXRlY3RpbmcgYSB0aGluZywgaXQgaXMgc2V0IHRvIGBudWxsYFxuICAgICAgICB2YXIgY3VyUmVjb2duaXplciA9IHNlc3Npb24uY3VyUmVjb2duaXplcjtcblxuICAgICAgICAvLyByZXNldCB3aGVuIHRoZSBsYXN0IHJlY29nbml6ZXIgaXMgcmVjb2duaXplZFxuICAgICAgICAvLyBvciB3aGVuIHdlJ3JlIGluIGEgbmV3IHNlc3Npb25cbiAgICAgICAgaWYgKCFjdXJSZWNvZ25pemVyIHx8IChjdXJSZWNvZ25pemVyICYmIGN1clJlY29nbml6ZXIuc3RhdGUgJiBTVEFURV9SRUNPR05JWkVEKSkge1xuICAgICAgICAgICAgY3VyUmVjb2duaXplciA9IHNlc3Npb24uY3VyUmVjb2duaXplciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIHdoaWxlIChpIDwgcmVjb2duaXplcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZWNvZ25pemVyID0gcmVjb2duaXplcnNbaV07XG5cbiAgICAgICAgICAgIC8vIGZpbmQgb3V0IGlmIHdlIGFyZSBhbGxvd2VkIHRyeSB0byByZWNvZ25pemUgdGhlIGlucHV0IGZvciB0aGlzIG9uZS5cbiAgICAgICAgICAgIC8vIDEuICAgYWxsb3cgaWYgdGhlIHNlc3Npb24gaXMgTk9UIGZvcmNlZCBzdG9wcGVkIChzZWUgdGhlIC5zdG9wKCkgbWV0aG9kKVxuICAgICAgICAgICAgLy8gMi4gICBhbGxvdyBpZiB3ZSBzdGlsbCBoYXZlbid0IHJlY29nbml6ZWQgYSBnZXN0dXJlIGluIHRoaXMgc2Vzc2lvbiwgb3IgdGhlIHRoaXMgcmVjb2duaXplciBpcyB0aGUgb25lXG4gICAgICAgICAgICAvLyAgICAgIHRoYXQgaXMgYmVpbmcgcmVjb2duaXplZC5cbiAgICAgICAgICAgIC8vIDMuICAgYWxsb3cgaWYgdGhlIHJlY29nbml6ZXIgaXMgYWxsb3dlZCB0byBydW4gc2ltdWx0YW5lb3VzIHdpdGggdGhlIGN1cnJlbnQgcmVjb2duaXplZCByZWNvZ25pemVyLlxuICAgICAgICAgICAgLy8gICAgICB0aGlzIGNhbiBiZSBzZXR1cCB3aXRoIHRoZSBgcmVjb2duaXplV2l0aCgpYCBtZXRob2Qgb24gdGhlIHJlY29nbml6ZXIuXG4gICAgICAgICAgICBpZiAoc2Vzc2lvbi5zdG9wcGVkICE9PSBGT1JDRURfU1RPUCAmJiAoIC8vIDFcbiAgICAgICAgICAgICAgICAhY3VyUmVjb2duaXplciB8fCByZWNvZ25pemVyID09IGN1clJlY29nbml6ZXIgfHwgLy8gMlxuICAgICAgICAgICAgICAgIHJlY29nbml6ZXIuY2FuUmVjb2duaXplV2l0aChjdXJSZWNvZ25pemVyKSkpIHsgLy8gM1xuXG4gICAgICAgICAgICAgICAgcmVjb2duaXplci5yZWNvZ25pemUoaW5wdXREYXRhKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlY29nbml6ZXIucmVzZXQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgdGhlIHJlY29nbml6ZXIgaGFzIGJlZW4gcmVjb2duaXppbmcgdGhlIGlucHV0IGFzIGEgdmFsaWQgZ2VzdHVyZSwgd2Ugd2FudCB0byBzdG9yZSB0aGlzIG9uZSBhcyB0aGVcbiAgICAgICAgICAgIC8vIGN1cnJlbnQgYWN0aXZlIHJlY29nbml6ZXIuIGJ1dCBvbmx5IGlmIHdlIGRvbid0IGFscmVhZHkgaGF2ZSBhbiBhY3RpdmUgcmVjb2duaXplclxuICAgICAgICAgICAgaWYgKCFjdXJSZWNvZ25pemVyICYmIHJlY29nbml6ZXIuc3RhdGUgJiAoU1RBVEVfQkVHQU4gfCBTVEFURV9DSEFOR0VEIHwgU1RBVEVfUkVDT0dOSVpFRCkpIHtcbiAgICAgICAgICAgICAgICBjdXJSZWNvZ25pemVyID0gc2Vzc2lvbi5jdXJSZWNvZ25pemVyID0gcmVjb2duaXplcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGdldCBhIHJlY29nbml6ZXIgYnkgaXRzIGV2ZW50IG5hbWUuXG4gICAgICovXG4gICAgZ2V0KGV2ZW50TmFtZTogc3RyaW5nKTogSVJlY29nbml6ZXIge1xuICAgICAgICB2YXIgcmVjb2duaXplcnMgPSB0aGlzLnJlY29nbml6ZXJzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlY29nbml6ZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAocmVjb2duaXplcnNbaV0uZXZlbnROYW1lID09PSBldmVudE5hbWUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVjb2duaXplcnNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogYWRkIGEgcmVjb2duaXplciB0byB0aGUgbWFuYWdlclxuICAgICAqIGV4aXN0aW5nIHJlY29nbml6ZXJzIHdpdGggdGhlIHNhbWUgZXZlbnQgbmFtZSB3aWxsIGJlIHJlbW92ZWRcbiAgICAgKiBAcGFyYW0ge1JlY29nbml6ZXJ9IHJlY29nbml6ZXJcbiAgICAgKi9cbiAgICBhZGQocmVjb2duaXplcjogSVJlY29nbml6ZXIpOiBJUmVjb2duaXplciB7XG4gICAgICAgIHZhciBleGlzdGluZyA9IHRoaXMuZ2V0KHJlY29nbml6ZXIuZXZlbnROYW1lKTtcbiAgICAgICAgaWYgKGV4aXN0aW5nKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZShleGlzdGluZyk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnJlY29nbml6ZXJzLnB1c2gocmVjb2duaXplcik7XG4gICAgICAgIHJlY29nbml6ZXIubWFuYWdlciA9IHRoaXM7XG5cbiAgICAgICAgdGhpcy50b3VjaEFjdGlvbi51cGRhdGUoKTtcbiAgICAgICAgcmV0dXJuIHJlY29nbml6ZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogcmVtb3ZlIGEgcmVjb2duaXplciBieSBuYW1lIG9yIGluc3RhbmNlXG4gICAgICogQHBhcmFtIHtSZWNvZ25pemVyfFN0cmluZ30gcmVjb2duaXplclxuICAgICAqIEByZXR1cm4ge01hbmFnZXJ9XG4gICAgICovXG4gICAgcmVtb3ZlKHJlY29nbml6ZXI6IElSZWNvZ25pemVyKSB7XG4gICAgICAgIHZhciByZWNvZ25pemVycyA9IHRoaXMucmVjb2duaXplcnM7XG4gICAgICAgIHJlY29nbml6ZXIgPSB0aGlzLmdldChyZWNvZ25pemVyLmV2ZW50TmFtZSk7XG4gICAgICAgIHJlY29nbml6ZXJzLnNwbGljZShpbkFycmF5KHJlY29nbml6ZXJzLCByZWNvZ25pemVyKSwgMSk7XG5cbiAgICAgICAgdGhpcy50b3VjaEFjdGlvbi51cGRhdGUoKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogYmluZCBldmVudFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudHNcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBoYW5kbGVyXG4gICAgICogQHJldHVybiB7RXZlbnRFbWl0dGVyfSB0aGlzXG4gICAgICovXG4gICAgb24oZXZlbnRzOiBzdHJpbmcsIGhhbmRsZXIpOiBNYW5hZ2VyIHtcbiAgICAgICAgdmFyIGhhbmRsZXJzID0gdGhpcy5oYW5kbGVycztcbiAgICAgICAgZWFjaChzcGxpdFN0cihldmVudHMpLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgaGFuZGxlcnNbZXZlbnRdID0gaGFuZGxlcnNbZXZlbnRdIHx8IFtdO1xuICAgICAgICAgICAgaGFuZGxlcnNbZXZlbnRdLnB1c2goaGFuZGxlcik7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB1bmJpbmQgZXZlbnQsIGxlYXZlIGVtaXQgYmxhbmsgdG8gcmVtb3ZlIGFsbCBoYW5kbGVyc1xuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudHNcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbaGFuZGxlcl1cbiAgICAgKiBAcmV0dXJuIHtFdmVudEVtaXR0ZXJ9IHRoaXNcbiAgICAgKi9cbiAgICBvZmYoZXZlbnRzOiBzdHJpbmcsIGhhbmRsZXIpOiBNYW5hZ2VyIHtcbiAgICAgICAgdmFyIGhhbmRsZXJzID0gdGhpcy5oYW5kbGVycztcbiAgICAgICAgZWFjaChzcGxpdFN0cihldmVudHMpLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgaWYgKCFoYW5kbGVyKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIGhhbmRsZXJzW2V2ZW50XTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGhhbmRsZXJzW2V2ZW50XS5zcGxpY2UoaW5BcnJheShoYW5kbGVyc1tldmVudF0sIGhhbmRsZXIpLCAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGVtaXQgZXZlbnQgdG8gdGhlIGxpc3RlbmVyc1xuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICAgICAqIEBwYXJhbSB7SUNvbXB1dGVkRXZlbnR9IGRhdGFcbiAgICAgKi9cbiAgICBlbWl0KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhOiBFdmVudCkge1xuICAgICAgICAvLyB3ZSBhbHNvIHdhbnQgdG8gdHJpZ2dlciBkb20gZXZlbnRzXG4gICAgICAgIGlmICh0aGlzLmRvbUV2ZW50cykge1xuICAgICAgICAgICAgdHJpZ2dlckRvbUV2ZW50KGV2ZW50LCBkYXRhKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIG5vIGhhbmRsZXJzLCBzbyBza2lwIGl0IGFsbFxuICAgICAgICB2YXIgaGFuZGxlcnMgPSB0aGlzLmhhbmRsZXJzW2V2ZW50TmFtZV0gJiYgdGhpcy5oYW5kbGVyc1tldmVudE5hbWVdLnNsaWNlKCk7XG4gICAgICAgIGlmICghaGFuZGxlcnMgfHwgIWhhbmRsZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gTWFrZSBpdCBsb29rIGxpa2UgYSBub3JtYWwgRE9NIGV2ZW50P1xuICAgICAgICAvKlxuICAgICAgICBkYXRhLnR5cGUgPSBldmVudE5hbWU7XG4gICAgICAgIGRhdGEucHJldmVudERlZmF1bHQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICBkYXRhLnNyY0V2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH07XG4gICAgICAgICovXG5cbiAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICB3aGlsZSAoaSA8IGhhbmRsZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgaGFuZGxlcnNbaV0oZGF0YSk7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB1cGRhdGVUb3VjaEFjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy50b3VjaEFjdGlvbi51cGRhdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBkZXN0cm95IHRoZSBtYW5hZ2VyIGFuZCB1bmJpbmRzIGFsbCBldmVudHNcbiAgICAgKiBpdCBkb2Vzbid0IHVuYmluZCBkb20gZXZlbnRzLCB0aGF0IGlzIHRoZSB1c2VyIG93biByZXNwb25zaWJpbGl0eVxuICAgICAqL1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMuZWxlbWVudCAmJiB0aGlzLnRvZ2dsZUNzc1Byb3BzKGZhbHNlKTtcblxuICAgICAgICB0aGlzLmhhbmRsZXJzID0ge307XG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHVuZGVmaW5lZDtcbiAgICAgICAgdGhpcy5pbnB1dC5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuZWxlbWVudCA9IG51bGw7XG4gICAgfVxuXG4gICAgdG9nZ2xlQ3NzUHJvcHMoYWRkOiBib29sZWFuKSB7XG4gICAgICAgIGlmICghdGhpcy5lbGVtZW50LnN0eWxlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGVsZW1lbnQgPSB0aGlzLmVsZW1lbnQ7XG4gICAgICAgIGVhY2godGhpcy5jc3NQcm9wcywgZnVuY3Rpb24odmFsdWUsIG5hbWUpIHtcbiAgICAgICAgICAgIGVsZW1lbnQuc3R5bGVbcHJlZml4ZWQoZWxlbWVudC5zdHlsZSwgbmFtZSldID0gYWRkID8gdmFsdWUgOiAnJztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY2FuY2VsQ29udGV4dE1lbnUoKTogdm9pZCB7XG4gICAgfVxufVxuXG4vKipcbiAqIHRyaWdnZXIgZG9tIGV2ZW50XG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhXG4gKi9cbmZ1bmN0aW9uIHRyaWdnZXJEb21FdmVudChldmVudCwgZGF0YSkge1xuICAgIHZhciBnZXN0dXJlRXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudCgnRXZlbnQnKTtcbiAgICBnZXN0dXJlRXZlbnQuaW5pdEV2ZW50KGV2ZW50LCB0cnVlLCB0cnVlKTtcbiAgICBnZXN0dXJlRXZlbnRbJ2dlc3R1cmUnXSA9IGRhdGE7XG4gICAgZGF0YS50YXJnZXQuZGlzcGF0Y2hFdmVudChnZXN0dXJlRXZlbnQpO1xufVxuXG52YXIgTU9CSUxFX1JFR0VYID0gL21vYmlsZXx0YWJsZXR8aXAoYWR8aG9uZXxvZCl8YW5kcm9pZC9pO1xuXG52YXIgU1VQUE9SVF9UT1VDSCA9ICgnb250b3VjaHN0YXJ0JyBpbiB3aW5kb3cpO1xudmFyIFNVUFBPUlRfUE9JTlRFUl9FVkVOVFMgPSBwcmVmaXhlZCh3aW5kb3csICdQb2ludGVyRXZlbnQnKSAhPT0gdW5kZWZpbmVkO1xudmFyIFNVUFBPUlRfT05MWV9UT1VDSCA9IFNVUFBPUlRfVE9VQ0ggJiYgTU9CSUxFX1JFR0VYLnRlc3QobmF2aWdhdG9yLnVzZXJBZ2VudCk7XG5cbnZhciBQUkVGSVhFRF9UT1VDSF9BQ1RJT04gPSBwcmVmaXhlZChURVNUX0VMRU1FTlQuc3R5bGUsICd0b3VjaEFjdGlvbicpO1xudmFyIE5BVElWRV9UT1VDSF9BQ1RJT04gPSBQUkVGSVhFRF9UT1VDSF9BQ1RJT04gIT09IHVuZGVmaW5lZDtcblxuY2xhc3MgVG91Y2hBY3Rpb24ge1xuICAgIHB1YmxpYyBtYW5hZ2VyOiBNYW5hZ2VyO1xuICAgIHB1YmxpYyBhY3Rpb25zOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBwcmV2ZW50ZWQ7XG4gICAgLyoqXG4gICAgICogVG91Y2ggQWN0aW9uXG4gICAgICogc2V0cyB0aGUgdG91Y2hBY3Rpb24gcHJvcGVydHkgb3IgdXNlcyB0aGUganMgYWx0ZXJuYXRpdmVcbiAgICAgKiBAcGFyYW0ge01hbmFnZXJ9IG1hbmFnZXJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdmFsdWVcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihtYW5hZ2VyOiBNYW5hZ2VyLCB2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMubWFuYWdlciA9IG1hbmFnZXI7XG4gICAgICAgIHRoaXMuc2V0KHZhbHVlKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogc2V0IHRoZSB0b3VjaEFjdGlvbiB2YWx1ZSBvbiB0aGUgZWxlbWVudCBvciBlbmFibGUgdGhlIHBvbHlmaWxsXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHZhbHVlXG4gICAgICovXG4gICAgc2V0KHZhbHVlOiBzdHJpbmcpIHtcbiAgICAgICAgLy8gZmluZCBvdXQgdGhlIHRvdWNoLWFjdGlvbiBieSB0aGUgZXZlbnQgaGFuZGxlcnNcbiAgICAgICAgaWYgKHZhbHVlID09PSBUT1VDSF9BQ1RJT05fQ09NUFVURSkge1xuICAgICAgICAgICAgdmFsdWUgPSB0aGlzLmNvbXB1dGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChOQVRJVkVfVE9VQ0hfQUNUSU9OICYmIHRoaXMubWFuYWdlci5lbGVtZW50LnN0eWxlKSB7XG4gICAgICAgICAgICB0aGlzLm1hbmFnZXIuZWxlbWVudC5zdHlsZVtQUkVGSVhFRF9UT1VDSF9BQ1RJT05dID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hY3Rpb25zID0gdmFsdWUudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICoganVzdCByZS1zZXQgdGhlIHRvdWNoQWN0aW9uIHZhbHVlXG4gICAgICovXG4gICAgdXBkYXRlKCkge1xuICAgICAgICB0aGlzLnNldChUT1VDSF9BQ1RJT05fQ09NUFVURSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogY29tcHV0ZSB0aGUgdmFsdWUgZm9yIHRoZSB0b3VjaEFjdGlvbiBwcm9wZXJ0eSBiYXNlZCBvbiB0aGUgcmVjb2duaXplcidzIHNldHRpbmdzXG4gICAgICogQHJldHVybiB7U3RyaW5nfSB2YWx1ZVxuICAgICAqL1xuICAgIGNvbXB1dGUoKSB7XG4gICAgICAgIHZhciBhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAvLyBGSVhNRTogTWFrZSB0aGlzIHR5cGUtc2FmZSBhdXRvbWFnaWNhbGx5XG4gICAgICAgIGVhY2godGhpcy5tYW5hZ2VyLnJlY29nbml6ZXJzLCBmdW5jdGlvbihyZWNvZ25pemVyOiBSZWNvZ25pemVyKSB7XG4gICAgICAgICAgICBpZiAocmVjb2duaXplci5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgYWN0aW9ucyA9IGFjdGlvbnMuY29uY2F0KHJlY29nbml6ZXIuZ2V0VG91Y2hBY3Rpb24oKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY2xlYW5Ub3VjaEFjdGlvbnMoYWN0aW9ucy5qb2luKCcgJykpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHRoaXMgbWV0aG9kIGlzIGNhbGxlZCBvbiBlYWNoIGlucHV0IGN5Y2xlIGFuZCBwcm92aWRlcyB0aGUgcHJldmVudGluZyBvZiB0aGUgYnJvd3NlciBiZWhhdmlvclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dFxuICAgICAqL1xuICAgIHByZXZlbnREZWZhdWx0cyhpbnB1dDogSUNvbXB1dGVkRXZlbnQsIHRvdWNoRXZlbnQ6IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgLy8gbm90IG5lZWRlZCB3aXRoIG5hdGl2ZSBzdXBwb3J0IGZvciB0aGUgdG91Y2hBY3Rpb24gcHJvcGVydHlcbiAgICAgICAgaWYgKE5BVElWRV9UT1VDSF9BQ1RJT04pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHZhciBkaXJlY3Rpb24gPSBpbnB1dC5vZmZzZXREaXJlY3Rpb247XG5cbiAgICAgICAgaWYgKHRoaXMucHJldmVudGVkKSB7XG4gICAgICAgICAgICB0b3VjaEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLypcbiAgICAgICAgdmFyIGFjdGlvbnMgPSB0aGlzLmFjdGlvbnM7XG4gICAgICAgIHZhciBoYXNOb25lID0gaW5TdHIoYWN0aW9ucywgVE9VQ0hfQUNUSU9OX05PTkUpO1xuICAgICAgICB2YXIgaGFzUGFuWSA9IGluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9QQU5fWSk7XG4gICAgICAgIHZhciBoYXNQYW5YID0gaW5TdHIoYWN0aW9ucywgVE9VQ0hfQUNUSU9OX1BBTl9YKTtcblxuICAgICAgICBpZiAoaGFzTm9uZSB8fFxuICAgICAgICAgICAgKGhhc1BhblkgJiYgZGlyZWN0aW9uICYgRElSRUNUSU9OX0hPUklaT05UQUwpIHx8XG4gICAgICAgICAgICAoaGFzUGFuWCAmJiBkaXJlY3Rpb24gJiBESVJFQ1RJT05fVkVSVElDQUwpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcmV2ZW50U3JjKHRvdWNoRXZlbnQpO1xuICAgICAgICB9XG4gICAgICAgICovXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogY2FsbCBwcmV2ZW50RGVmYXVsdCB0byBwcmV2ZW50IHRoZSBicm93c2VyJ3MgZGVmYXVsdCBiZWhhdmlvciAoc2Nyb2xsaW5nIGluIG1vc3QgY2FzZXMpXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHNyY0V2ZW50XG4gICAgICovXG4gICAgcHJldmVudFNyYyhzcmNFdmVudCkge1xuICAgICAgICB0aGlzLnByZXZlbnRlZCA9IHRydWU7XG4gICAgICAgIHNyY0V2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxufVxuXG4vKipcbiAqIHdoZW4gdGhlIHRvdWNoQWN0aW9ucyBhcmUgY29sbGVjdGVkIHRoZXkgYXJlIG5vdCBhIHZhbGlkIHZhbHVlLCBzbyB3ZSBuZWVkIHRvIGNsZWFuIHRoaW5ncyB1cC4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGFjdGlvbnNcbiAqIEByZXR1cm4geyp9XG4gKi9cbmZ1bmN0aW9uIGNsZWFuVG91Y2hBY3Rpb25zKGFjdGlvbnM6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgLy8gbm9uZVxuICAgIGlmIChpblN0cihhY3Rpb25zLCBUT1VDSF9BQ1RJT05fTk9ORSkpIHtcbiAgICAgICAgcmV0dXJuIFRPVUNIX0FDVElPTl9OT05FO1xuICAgIH1cblxuICAgIHZhciBoYXNQYW5YID0gaW5TdHIoYWN0aW9ucywgVE9VQ0hfQUNUSU9OX1BBTl9YKTtcbiAgICB2YXIgaGFzUGFuWSA9IGluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9QQU5fWSk7XG5cbiAgICAvLyBwYW4teCBhbmQgcGFuLXkgY2FuIGJlIGNvbWJpbmVkXG4gICAgaWYgKGhhc1BhblggJiYgaGFzUGFuWSkge1xuICAgICAgICByZXR1cm4gVE9VQ0hfQUNUSU9OX1BBTl9YICsgJyAnICsgVE9VQ0hfQUNUSU9OX1BBTl9ZO1xuICAgIH1cblxuICAgIC8vIHBhbi14IE9SIHBhbi15XG4gICAgaWYgKGhhc1BhblggfHwgaGFzUGFuWSkge1xuICAgICAgICByZXR1cm4gaGFzUGFuWCA/IFRPVUNIX0FDVElPTl9QQU5fWCA6IFRPVUNIX0FDVElPTl9QQU5fWTtcbiAgICB9XG5cbiAgICAvLyBtYW5pcHVsYXRpb25cbiAgICBpZiAoaW5TdHIoYWN0aW9ucywgVE9VQ0hfQUNUSU9OX01BTklQVUxBVElPTikpIHtcbiAgICAgICAgcmV0dXJuIFRPVUNIX0FDVElPTl9NQU5JUFVMQVRJT047XG4gICAgfVxuXG4gICAgcmV0dXJuIFRPVUNIX0FDVElPTl9BVVRPO1xufVxuXG5leHBvcnQgdmFyIElOUFVUX1RZUEVfVE9VQ0ggPSAndG91Y2gnO1xuZXhwb3J0IHZhciBJTlBVVF9UWVBFX1BFTiA9ICdwZW4nO1xuZXhwb3J0IHZhciBJTlBVVF9UWVBFX01PVVNFID0gJ21vdXNlJztcbmV4cG9ydCB2YXIgSU5QVVRfVFlQRV9LSU5FQ1QgPSAna2luZWN0JztcblxudmFyIENPTVBVVEVfSU5URVJWQUwgPSAyNTtcblxuZXhwb3J0IHZhciBJTlBVVF9TVEFSVCA9IDE7XG5leHBvcnQgdmFyIElOUFVUX01PVkUgPSAyO1xuZXhwb3J0IHZhciBJTlBVVF9FTkQgPSA0O1xuZXhwb3J0IHZhciBJTlBVVF9DQU5DRUwgPSA4O1xuXG5leHBvcnQgZnVuY3Rpb24gZGVjb2RlRXZlbnRUeXBlKGV2ZW50VHlwZTogbnVtYmVyKSB7XG4gICAgc3dpdGNoIChldmVudFR5cGUpIHtcbiAgICAgICAgY2FzZSBJTlBVVF9TVEFSVDoge1xuICAgICAgICAgICAgcmV0dXJuIFwiU1RBUlRcIjtcbiAgICAgICAgfVxuICAgICAgICBjYXNlIElOUFVUX01PVkU6IHtcbiAgICAgICAgICAgIHJldHVybiBcIk1PVkVcIjtcbiAgICAgICAgfVxuICAgICAgICBjYXNlIElOUFVUX0VORDoge1xuICAgICAgICAgICAgcmV0dXJuIFwiRU5EXCI7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBJTlBVVF9DQU5DRUw6IHtcbiAgICAgICAgICAgIHJldHVybiBcIkNBTkNFTFwiO1xuICAgICAgICB9XG4gICAgICAgIGRlZmF1bHQ6IHtcbiAgICAgICAgICAgIHJldHVybiBcImV2ZW50VHlwZT1cIiArIGV2ZW50VHlwZTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0IHZhciBESVJFQ1RJT05fVU5ERUZJTkVEID0gMDtcbmV4cG9ydCB2YXIgRElSRUNUSU9OX0xFRlQgPSAxO1xuZXhwb3J0IHZhciBESVJFQ1RJT05fUklHSFQgPSAyO1xuZXhwb3J0IHZhciBESVJFQ1RJT05fVVAgPSA0O1xuZXhwb3J0IHZhciBESVJFQ1RJT05fRE9XTiA9IDg7XG5cbmV4cG9ydCB2YXIgRElSRUNUSU9OX0hPUklaT05UQUwgPSBESVJFQ1RJT05fTEVGVCB8IERJUkVDVElPTl9SSUdIVDtcbmV4cG9ydCB2YXIgRElSRUNUSU9OX1ZFUlRJQ0FMID0gRElSRUNUSU9OX1VQIHwgRElSRUNUSU9OX0RPV047XG5leHBvcnQgdmFyIERJUkVDVElPTl9BTEwgPSBESVJFQ1RJT05fSE9SSVpPTlRBTCB8IERJUkVDVElPTl9WRVJUSUNBTDtcblxudmFyIFBST1BTX1hZID0gWyd4JywgJ3knXTtcbnZhciBQUk9QU19DTElFTlRfWFkgPSBbJ2NsaWVudFgnLCAnY2xpZW50WSddO1xuXG5jbGFzcyBJbnB1dCB7XG4gICAgcHVibGljIG1hbmFnZXI6IE1hbmFnZXI7XG4gICAgcHVibGljIGVsZW1lbnQ7XG4gICAgcHVibGljIHRhcmdldDtcbiAgICBwdWJsaWMgZG9tSGFuZGxlcjtcbiAgICBwcml2YXRlIGV2RWw7XG4gICAgcHJpdmF0ZSBldlRhcmdldDtcbiAgICBwcml2YXRlIGV2V2luO1xuICAgIC8qKlxuICAgICAqIGNyZWF0ZSBuZXcgaW5wdXQgdHlwZSBtYW5hZ2VyXG4gICAgICogQHBhcmFtIHtNYW5hZ2VyfSBtYW5hZ2VyXG4gICAgICogQHJldHVybiB7SW5wdXR9XG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgY29uc3RydWN0b3IoXG4gICAgICAgIG1hbmFnZXI6IE1hbmFnZXIsXG4gICAgICAgIHRvdWNoRWxlbWVudEV2ZW50czogc3RyaW5nLFxuICAgICAgICB0b3VjaFRhcmdldEV2ZW50czogc3RyaW5nLFxuICAgICAgICB0b3VjaFdpbmRvd0V2ZW50czogc3RyaW5nKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5tYW5hZ2VyID0gbWFuYWdlcjtcbiAgICAgICAgdGhpcy5ldkVsID0gdG91Y2hFbGVtZW50RXZlbnRzO1xuICAgICAgICB0aGlzLmV2VGFyZ2V0ID0gdG91Y2hUYXJnZXRFdmVudHM7XG4gICAgICAgIHRoaXMuZXZXaW4gPSB0b3VjaFdpbmRvd0V2ZW50cztcbiAgICAgICAgdGhpcy5lbGVtZW50ID0gbWFuYWdlci5lbGVtZW50O1xuICAgICAgICB0aGlzLnRhcmdldCA9IG1hbmFnZXIuaW5wdXRUYXJnZXQ7XG5cbiAgICAgICAgLy8gc21hbGxlciB3cmFwcGVyIGFyb3VuZCB0aGUgaGFuZGxlciwgZm9yIHRoZSBzY29wZSBhbmQgdGhlIGVuYWJsZWQgc3RhdGUgb2YgdGhlIG1hbmFnZXIsXG4gICAgICAgIC8vIHNvIHdoZW4gZGlzYWJsZWQgdGhlIGlucHV0IGV2ZW50cyBhcmUgY29tcGxldGVseSBieXBhc3NlZC5cbiAgICAgICAgdGhpcy5kb21IYW5kbGVyID0gZnVuY3Rpb24oZXZlbnQ6IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgICAgIGlmIChtYW5hZ2VyLmVuYWJsZSkge1xuICAgICAgICAgICAgICAgIHNlbGYuaGFuZGxlcihldmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5pbml0KCk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIHNob3VsZCBoYW5kbGUgdGhlIGlucHV0RXZlbnQgZGF0YSBhbmQgdHJpZ2dlciB0aGUgY2FsbGJhY2tcbiAgICAgKiBAdmlydHVhbFxuICAgICAqL1xuICAgIGhhbmRsZXIoZXZlbnQ6IGFueSkgeyB9XG5cbiAgICAvKipcbiAgICAgKiBiaW5kIHRoZSBldmVudHNcbiAgICAgKi9cbiAgICBpbml0KCkge1xuICAgICAgICB0aGlzLmV2RWwgJiYgYWRkRXZlbnRMaXN0ZW5lcnModGhpcy5lbGVtZW50LCB0aGlzLmV2RWwsIHRoaXMuZG9tSGFuZGxlcik7XG4gICAgICAgIHRoaXMuZXZUYXJnZXQgJiYgYWRkRXZlbnRMaXN0ZW5lcnModGhpcy50YXJnZXQsIHRoaXMuZXZUYXJnZXQsIHRoaXMuZG9tSGFuZGxlcik7XG4gICAgICAgIHRoaXMuZXZXaW4gJiYgYWRkRXZlbnRMaXN0ZW5lcnMoZ2V0V2luZG93Rm9yRWxlbWVudCh0aGlzLmVsZW1lbnQpLCB0aGlzLmV2V2luLCB0aGlzLmRvbUhhbmRsZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHVuYmluZCB0aGUgZXZlbnRzXG4gICAgICovXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy5ldkVsICYmIHJlbW92ZUV2ZW50TGlzdGVuZXJzKHRoaXMuZWxlbWVudCwgdGhpcy5ldkVsLCB0aGlzLmRvbUhhbmRsZXIpO1xuICAgICAgICB0aGlzLmV2VGFyZ2V0ICYmIHJlbW92ZUV2ZW50TGlzdGVuZXJzKHRoaXMudGFyZ2V0LCB0aGlzLmV2VGFyZ2V0LCB0aGlzLmRvbUhhbmRsZXIpO1xuICAgICAgICB0aGlzLmV2V2luICYmIHJlbW92ZUV2ZW50TGlzdGVuZXJzKGdldFdpbmRvd0ZvckVsZW1lbnQodGhpcy5lbGVtZW50KSwgdGhpcy5ldldpbiwgdGhpcy5kb21IYW5kbGVyKTtcbiAgICB9XG59XG5cbi8qKlxuICogaGFuZGxlIGlucHV0IGV2ZW50c1xuICogQHBhcmFtIHtNYW5hZ2VyfSBtYW5hZ2VyXG4gKiBAcGFyYW0ge051bWJlcn0gZXZlbnRUeXBlXG4gKiBAcGFyYW0ge0lDb21wdXRlZEV2ZW50fSBpbnB1dFxuICovXG5mdW5jdGlvbiBpbnB1dEhhbmRsZXIobWFuYWdlcjogTWFuYWdlciwgZXZlbnRUeXBlOiBudW1iZXIsIHRvdWNoRXZlbnQ6IFRvdWNoRXZlbnQpIHtcblxuICAgIHZhciBjb21wRXZlbnQ6IElDb21wdXRlZEV2ZW50ID0gY29tcHV0ZUlDb21wdXRlZEV2ZW50KG1hbmFnZXIsIGV2ZW50VHlwZSwgdG91Y2hFdmVudCk7XG5cbiAgICBtYW5hZ2VyLnJlY29nbml6ZShjb21wRXZlbnQsIHRvdWNoRXZlbnQpO1xuXG4gICAgbWFuYWdlci5zZXNzaW9uLnB1c2goY29tcEV2ZW50KTtcbn1cblxuLyoqXG4gKiBleHRlbmQgdGhlIGRhdGEgd2l0aCBzb21lIHVzYWJsZSBwcm9wZXJ0aWVzIGxpa2Ugc2NhbGUsIHJvdGF0ZSwgdmVsb2NpdHkgZXRjXG4gKiBAcGFyYW0ge01hbmFnZXJ9IG1hbmFnZXJcbiAqIEBwYXJhbSB7SUNvbXB1dGVkRXZlbnR9IGlucHV0XG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVJQ29tcHV0ZWRFdmVudChtYW5hZ2VyOiBNYW5hZ2VyLCBldmVudFR5cGU6IG51bWJlciwgdG91Y2hFdmVudDogVG91Y2hFdmVudCk6IElDb21wdXRlZEV2ZW50IHtcbiAgICB2YXIgdG91Y2hlc0xlbmd0aCA9IHRvdWNoRXZlbnQudG91Y2hlcy5sZW5ndGg7XG4gICAgdmFyIGNoYW5nZWRQb2ludGVyc0xlbiA9IHRvdWNoRXZlbnQuY2hhbmdlZFRvdWNoZXMubGVuZ3RoO1xuICAgIHZhciBpc0ZpcnN0OiBib29sZWFuID0gKGV2ZW50VHlwZSAmIElOUFVUX1NUQVJUICYmICh0b3VjaGVzTGVuZ3RoIC0gY2hhbmdlZFBvaW50ZXJzTGVuID09PSAwKSk7XG4gICAgdmFyIGlzRmluYWw6IGJvb2xlYW4gPSAoZXZlbnRUeXBlICYgKElOUFVUX0VORCB8IElOUFVUX0NBTkNFTCkgJiYgKHRvdWNoZXNMZW5ndGggLSBjaGFuZ2VkUG9pbnRlcnNMZW4gPT09IDApKTtcblxuICAgIC8vdmFyIGNvbXBFdmVudDogYW55LypJQ29tcHV0ZWRFdmVudCovID0ge307XG4gICAgLy9jb21wRXZlbnQuaXNGaXJzdCA9ICEhaXNGaXJzdDtcbiAgICAvL2NvbXBFdmVudC5pc0ZpbmFsID0gISFpc0ZpbmFsO1xuXG4gICAgaWYgKGlzRmlyc3QpIHtcbiAgICAgICAgbWFuYWdlci5zZXNzaW9uLnJlc2V0KCk7XG4gICAgfVxuXG4gICAgLy8gc291cmNlIGV2ZW50IGlzIHRoZSBub3JtYWxpemVkIHZhbHVlIG9mIHRoZSBkb21FdmVudHNcbiAgICAvLyBsaWtlICd0b3VjaHN0YXJ0LCBtb3VzZXVwLCBwb2ludGVyZG93bidcbiAgICB2YXIgc2Vzc2lvbiA9IG1hbmFnZXIuc2Vzc2lvbjtcbiAgICAvLyAgdmFyIHBvaW50ZXJzID0gaW5wdXQucG9pbnRlcnM7XG4gICAgLy8gIHZhciBwb2ludGVyc0xlbmd0aCA9IHBvaW50ZXJzLmxlbmd0aDtcblxuICAgIHZhciBjZW50ZXI6IENsaWVudExvY2F0aW9uID0gY29tcHV0ZUNlbnRlcih0b3VjaEV2ZW50LnRvdWNoZXMpO1xuICAgIHZhciBtb3ZlbWVudDogVmVjdG9yRTIgPSBzZXNzaW9uLmNvbXB1dGVNb3ZlbWVudChjZW50ZXIpO1xuXG4gICAgLy8gc3RvcmUgdGhlIGZpcnN0IGlucHV0IHRvIGNhbGN1bGF0ZSB0aGUgZGlzdGFuY2UgYW5kIGRpcmVjdGlvblxuICAgIC8qXG4gICAgaWYgKCFzZXNzaW9uLmZpcnN0SW5wdXQpIHtcbiAgICAgIHNlc3Npb24uZmlyc3RJbnB1dCA9IHNuYXBzaG90KHRvdWNoRXZlbnQsIG1vdmVtZW50KTtcbiAgICB9XG4gIFxuICAgIC8vIHRvIGNvbXB1dGUgc2NhbGUgYW5kIHJvdGF0aW9uIHdlIG5lZWQgdG8gc3RvcmUgdGhlIG11bHRpcGxlIHRvdWNoZXNcbiAgICBpZiAodG91Y2hlc0xlbmd0aCA+IDEgJiYgIXNlc3Npb24uZmlyc3RNdWx0aXBsZSkge1xuICAgICAgc2Vzc2lvbi5maXJzdE11bHRpcGxlID0gc25hcHNob3QodG91Y2hFdmVudCwgbW92ZW1lbnQpO1xuICAgIH1cbiAgICBlbHNlIGlmICh0b3VjaGVzTGVuZ3RoID09PSAxKSB7XG4gICAgICBzZXNzaW9uLmZpcnN0TXVsdGlwbGUgPSB1bmRlZmluZWQ7XG4gICAgfVxuICBcbiAgICB2YXIgZmlyc3RJbnB1dCA9IHNlc3Npb24uZmlyc3RJbnB1dDtcbiAgICB2YXIgZmlyc3RNdWx0aXBsZSA9IHNlc3Npb24uZmlyc3RNdWx0aXBsZTtcbiAgICB2YXIgb2Zmc2V0Q2VudGVyID0gZmlyc3RNdWx0aXBsZSA/IGZpcnN0TXVsdGlwbGUuY2VudGVyIDogZmlyc3RJbnB1dC5jZW50ZXI7XG4gICAgKi9cblxuICAgIHZhciB0aW1lU3RhbXAgPSBEYXRlLm5vdygpO1xuICAgIHZhciBtb3ZlbWVudFRpbWUgPSB0aW1lU3RhbXAgLSBzZXNzaW9uLnN0YXJ0VGltZTtcblxuICAgIC8vdmFyIGFuZ2xlID0gZ2V0QW5nbGUob2Zmc2V0Q2VudGVyLCBjZW50ZXIpO1xuICAgIHZhciBkaXN0YW5jZTogbnVtYmVyID0gbW92ZW1lbnQgPyBtb3ZlbWVudC5ub3JtKCkgOiAwO1xuICAgIHZhciBkaXJlY3Rpb246IG51bWJlciA9IGdldERpcmVjdGlvbihtb3ZlbWVudCk7XG5cbiAgICAvLyB2YXIgc2NhbGUgPSBmaXJzdE11bHRpcGxlID8gZ2V0U2NhbGUoZmlyc3RNdWx0aXBsZS5wb2ludGVycywgdG91Y2hFdmVudC50b3VjaGVzKSA6IDE7XG4gICAgLy8gdmFyIHJvdGF0aW9uID0gZmlyc3RNdWx0aXBsZSA/IGdldFJvdGF0aW9uKGZpcnN0TXVsdGlwbGUucG9pbnRlcnMsIHRvdWNoRXZlbnQudG91Y2hlcykgOiAwO1xuXG4gICAgdmFyIHZlbG9jaXR5OiBWZWN0b3JFMiA9IHNlc3Npb24uY29tcHV0ZVZlbG9jaXR5KGNlbnRlciwgbW92ZW1lbnRUaW1lKTtcblxuICAgIC8vIGZpbmQgdGhlIGNvcnJlY3QgdGFyZ2V0XG4gICAgLypcbiAgICB2YXIgdGFyZ2V0ID0gbWFuYWdlci5lbGVtZW50O1xuICAgIGlmIChoYXNQYXJlbnQodG91Y2hFdmVudC50YXJnZXQsIHRhcmdldCkpIHtcbiAgICAgICAgdGFyZ2V0ID0gaW5wdXQuc3JjRXZlbnQudGFyZ2V0O1xuICAgIH1cbiAgICAqL1xuICAgIC8vICBpbnB1dC50YXJnZXQgPSB0YXJnZXQ7XG4gICAgdmFyIGNvbXBFdmVudDogSUNvbXB1dGVkRXZlbnQgPSB7XG4gICAgICAgIGNlbnRlcjogY2VudGVyLFxuICAgICAgICBtb3ZlbWVudDogbW92ZW1lbnQsXG4gICAgICAgIGRlbHRhVGltZTogbW92ZW1lbnRUaW1lLFxuICAgICAgICBkaXJlY3Rpb246IGRpcmVjdGlvbixcbiAgICAgICAgZGlzdGFuY2U6IGRpc3RhbmNlLFxuICAgICAgICBldmVudFR5cGU6IGV2ZW50VHlwZSxcbiAgICAgICAgcm90YXRpb246IDAsXG4gICAgICAgIHRpbWVTdGFtcDogdGltZVN0YW1wLFxuICAgICAgICB0b3VjaGVzTGVuZ3RoOiB0b3VjaEV2ZW50LnRvdWNoZXMubGVuZ3RoLFxuICAgICAgICAvLyB0eXBlOiB0b3VjaEV2ZW50LnR5cGUsXG4gICAgICAgIHNjYWxlOiAxLFxuICAgICAgICB2ZWxvY2l0eTogdmVsb2NpdHlcbiAgICB9O1xuICAgIHJldHVybiBjb21wRXZlbnQ7XG59XG5cbi8qKlxuICogZ2V0IHRoZSBjZW50ZXIgb2YgYWxsIHRoZSBwb2ludGVyc1xuICogQHBhcmFtIHtBcnJheX0gcG9pbnRlcnNcbiAqIEByZXR1cm4ge0NsaWVudExvY2F0aW9ufSBjZW50ZXIgY29udGFpbnMgYGNsaWVudFhgIGFuZCBgY2xpZW50WWAgcHJvcGVydGllc1xuICovXG5mdW5jdGlvbiBjb21wdXRlQ2VudGVyKHRvdWNoZXM6IFRvdWNoW10pOiBDbGllbnRMb2NhdGlvbiB7XG4gICAgdmFyIHRvdWNoZXNMZW5ndGggPSB0b3VjaGVzLmxlbmd0aDtcbiAgICBpZiAodG91Y2hlc0xlbmd0aCA9PT0gMSkge1xuICAgICAgICByZXR1cm4gQ2xpZW50TG9jYXRpb24uZnJvbVRvdWNoKHRvdWNoZXNbMF0pO1xuICAgIH1cbiAgICBlbHNlIGlmICh0b3VjaGVzTGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIgeCA9IDAsIHkgPSAwLCBpID0gMDtcbiAgICAgICAgd2hpbGUgKGkgPCB0b3VjaGVzTGVuZ3RoKSB7XG4gICAgICAgICAgICB4ICs9IHRvdWNoZXNbaV0uY2xpZW50WDtcbiAgICAgICAgICAgIHkgKz0gdG91Y2hlc1tpXS5jbGllbnRZO1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgQ2xpZW50TG9jYXRpb24oTWF0aC5yb3VuZCh4IC8gdG91Y2hlc0xlbmd0aCksIE1hdGgucm91bmQoeSAvIHRvdWNoZXNMZW5ndGgpKTtcbiAgICB9XG59XG5cbi8qKlxuICogY2FsY3VsYXRlIHRoZSB2ZWxvY2l0eSBiZXR3ZWVuIHR3byBwb2ludHMuIHVuaXQgaXMgaW4gcHggcGVyIG1zLlxuICogQHBhcmFtIHtOdW1iZXJ9IGRlbHRhVGltZVxuICogQHBhcmFtIHtOdW1iZXJ9IHhcbiAqIEBwYXJhbSB7TnVtYmVyfSB5XG4gKiBAcmV0dXJuIHtPYmplY3R9IHZlbG9jaXR5IGB4YCBhbmQgYHlgXG4gKi9cbmZ1bmN0aW9uIGdldFZlbG9jaXR5KGRlbHRhVGltZTogbnVtYmVyLCB4OiBudW1iZXIsIHk6IG51bWJlcik6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gICAgcmV0dXJuIHsgeDogeCAvIGRlbHRhVGltZSB8fCAwLCB5OiB5IC8gZGVsdGFUaW1lIHx8IDAgfTtcbn1cblxuLyoqXG4gKiBnZXQgdGhlIGRpcmVjdGlvbiBiZXR3ZWVuIHR3byBwb2ludHNcbiAqIEBwYXJhbSB7VmVjdG9yRTJ9IG1vdmVtZW50XG4gKiBAcGFyYW0ge051bWJlcn0geVxuICogQHJldHVybiB7TnVtYmVyfSBkaXJlY3Rpb25cbiAqL1xuZnVuY3Rpb24gZ2V0RGlyZWN0aW9uKG1vdmVtZW50OiBWZWN0b3JFMik6IG51bWJlciB7XG4gICAgdmFyIE4gPSBuZXcgVmVjdG9yRTIoMCwgLTEpO1xuICAgIHZhciBTID0gbmV3IFZlY3RvckUyKDAsICsxKTtcbiAgICB2YXIgRSA9IG5ldyBWZWN0b3JFMigrMSwgMCk7XG4gICAgdmFyIFcgPSBuZXcgVmVjdG9yRTIoLTEsIDApO1xuICAgIC8vIEFsbG93IGNvbWJpbmF0aW9ucyBvZiB0aGUgY2FyZGluYWwgZGlyZWN0aW9ucy5cbiAgICAvLyBBIGNhcmRpbmFsIGRpcmVjdGlvbiBtYXRjaGVzIGlmIHdlIGFyZSB3aXRoaW4gMjIuNSBkZWdyZWVzIGVpdGhlciBzaWRlLlxuICAgIHZhciBjb3NpbmVUaHJlc2hvbGQgPSBNYXRoLmNvcyg3ICogTWF0aC5QSSAvIDE2KTtcbiAgICBpZiAobW92ZW1lbnQpIHtcbiAgICAgICAgdmFyIHVuaXQgPSBtb3ZlbWVudC5kaXYobW92ZW1lbnQubm9ybSgpKTtcbiAgICAgICAgdmFyIGRpcmVjdGlvbiA9IERJUkVDVElPTl9VTkRFRklORUQ7XG4gICAgICAgIGlmICh1bml0LmRvdChOKSA+IGNvc2luZVRocmVzaG9sZCkge1xuICAgICAgICAgICAgZGlyZWN0aW9uIHw9IERJUkVDVElPTl9VUDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdC5kb3QoUykgPiBjb3NpbmVUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgIGRpcmVjdGlvbiB8PSBESVJFQ1RJT05fRE9XTjtcbiAgICAgICAgfVxuICAgICAgICBpZiAodW5pdC5kb3QoRSkgPiBjb3NpbmVUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgIGRpcmVjdGlvbiB8PSBESVJFQ1RJT05fUklHSFQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHVuaXQuZG90KFcpID4gY29zaW5lVGhyZXNob2xkKSB7XG4gICAgICAgICAgICBkaXJlY3Rpb24gfD0gRElSRUNUSU9OX0xFRlQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRpcmVjdGlvbjtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBESVJFQ1RJT05fVU5ERUZJTkVEO1xuICAgIH1cbn1cblxuLyoqXG4gKiBjYWxjdWxhdGUgdGhlIGFic29sdXRlIGRpc3RhbmNlIGJldHdlZW4gdHdvIHBvaW50c1xuICogQHBhcmFtIHtPYmplY3R9IHAxIHt4LCB5fVxuICogQHBhcmFtIHtPYmplY3R9IHAyIHt4LCB5fVxuICogQHBhcmFtIHtBcnJheX0gW3Byb3BzXSBjb250YWluaW5nIHggYW5kIHkga2V5c1xuICogQHJldHVybiB7TnVtYmVyfSBkaXN0YW5jZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RGlzdGFuY2UocDEsIHAyLCBwcm9wcz8pIHtcbiAgICBpZiAoIXByb3BzKSB7XG4gICAgICAgIHByb3BzID0gUFJPUFNfWFk7XG4gICAgfVxuICAgIHZhciB4ID0gcDJbcHJvcHNbMF1dIC0gcDFbcHJvcHNbMF1dLFxuICAgICAgICB5ID0gcDJbcHJvcHNbMV1dIC0gcDFbcHJvcHNbMV1dO1xuXG4gICAgcmV0dXJuIE1hdGguc3FydCgoeCAqIHgpICsgKHkgKiB5KSk7XG59XG5cbi8qKlxuICogY2FsY3VsYXRlIHRoZSBhbmdsZSBiZXR3ZWVuIHR3byBjb29yZGluYXRlc1xuICogQHBhcmFtIHtPYmplY3R9IHAxXG4gKiBAcGFyYW0ge09iamVjdH0gcDJcbiAqIEBwYXJhbSB7QXJyYXl9IFtwcm9wc10gY29udGFpbmluZyB4IGFuZCB5IGtleXNcbiAqIEByZXR1cm4ge051bWJlcn0gYW5nbGVcbiAqL1xuZnVuY3Rpb24gZ2V0QW5nbGUocDEsIHAyLCBwcm9wcz8pIHtcbiAgICBpZiAoIXByb3BzKSB7XG4gICAgICAgIHByb3BzID0gUFJPUFNfWFk7XG4gICAgfVxuICAgIHZhciB4ID0gcDJbcHJvcHNbMF1dIC0gcDFbcHJvcHNbMF1dLFxuICAgICAgICB5ID0gcDJbcHJvcHNbMV1dIC0gcDFbcHJvcHNbMV1dO1xuICAgIHJldHVybiBNYXRoLmF0YW4yKHksIHgpICogMTgwIC8gTWF0aC5QSTtcbn1cblxuLyoqXG4gKiBjYWxjdWxhdGUgdGhlIHJvdGF0aW9uIGRlZ3JlZXMgYmV0d2VlbiB0d28gcG9pbnRlcnNldHNcbiAqIEBwYXJhbSB7QXJyYXl9IHN0YXJ0IGFycmF5IG9mIHBvaW50ZXJzXG4gKiBAcGFyYW0ge0FycmF5fSBlbmQgYXJyYXkgb2YgcG9pbnRlcnNcbiAqIEByZXR1cm4ge051bWJlcn0gcm90YXRpb25cbiAqL1xuZnVuY3Rpb24gZ2V0Um90YXRpb24oc3RhcnQsIGVuZCkge1xuICAgIHJldHVybiBnZXRBbmdsZShlbmRbMV0sIGVuZFswXSwgUFJPUFNfQ0xJRU5UX1hZKSAtIGdldEFuZ2xlKHN0YXJ0WzFdLCBzdGFydFswXSwgUFJPUFNfQ0xJRU5UX1hZKTtcbn1cblxuLyoqXG4gKiBjYWxjdWxhdGUgdGhlIHNjYWxlIGZhY3RvciBiZXR3ZWVuIHR3byBwb2ludGVyc2V0c1xuICogbm8gc2NhbGUgaXMgMSwgYW5kIGdvZXMgZG93biB0byAwIHdoZW4gcGluY2hlZCB0b2dldGhlciwgYW5kIGJpZ2dlciB3aGVuIHBpbmNoZWQgb3V0XG4gKiBAcGFyYW0ge0FycmF5fSBzdGFydCBhcnJheSBvZiBwb2ludGVyc1xuICogQHBhcmFtIHtBcnJheX0gZW5kIGFycmF5IG9mIHBvaW50ZXJzXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IHNjYWxlXG4gKi9cbmZ1bmN0aW9uIGdldFNjYWxlKHN0YXJ0LCBlbmQpIHtcbiAgICByZXR1cm4gZ2V0RGlzdGFuY2UoZW5kWzBdLCBlbmRbMV0sIFBST1BTX0NMSUVOVF9YWSkgLyBnZXREaXN0YW5jZShzdGFydFswXSwgc3RhcnRbMV0sIFBST1BTX0NMSUVOVF9YWSk7XG59XG5cbnZhciBUT1VDSF9JTlBVVF9NQVA6IHsgW3M6IHN0cmluZ106IG51bWJlcjsgfSA9IHtcbiAgICB0b3VjaHN0YXJ0OiBJTlBVVF9TVEFSVCxcbiAgICB0b3VjaG1vdmU6IElOUFVUX01PVkUsXG4gICAgdG91Y2hlbmQ6IElOUFVUX0VORCxcbiAgICB0b3VjaGNhbmNlbDogSU5QVVRfQ0FOQ0VMXG59O1xuXG52YXIgVE9VQ0hfVEFSR0VUX0VWRU5UUyA9ICd0b3VjaHN0YXJ0IHRvdWNobW92ZSB0b3VjaGVuZCB0b3VjaGNhbmNlbCc7XG5cbmNsYXNzIFRvdWNoSW5wdXQgZXh0ZW5kcyBJbnB1dCB7XG4gICAgcHJpdmF0ZSB0YXJnZXRJZHMgPSB7fTtcbiAgICBwcml2YXRlIGNhbGxiYWNrOiAobWFuYWdlcjogTWFuYWdlciwgdHlwZTogbnVtYmVyLCBkYXRhOiBUb3VjaEV2ZW50KSA9PiB2b2lkO1xuICAgIC8qKlxuICAgICAqIE11bHRpLXVzZXIgdG91Y2ggZXZlbnRzIGlucHV0XG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQGV4dGVuZHMgSW5wdXRcbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihtYW5hZ2VyOiBNYW5hZ2VyLCBjYWxsYmFjazogKG1hbmFnZXI6IE1hbmFnZXIsIHR5cGU6IG51bWJlciwgZGF0YTogVG91Y2hFdmVudCkgPT4gdm9pZCkge1xuICAgICAgICAvLyBGSVhNRTogVGhlIGJhc2UgY2xhc3MgcmVnaXN0ZXJzIGhhbmRsZXJzIGFuZCBjb3VsZCBiZSBmaXJpbmcgZXZlbnRzXG4gICAgICAgIC8vIGJlZm9yZSB0aGlzIGNvbnN0cnVjdG9yIGhhcyBpbml0aWFsaXplZCBjYWxsYmFjaz9cbiAgICAgICAgc3VwZXIobWFuYWdlciwgdW5kZWZpbmVkLCBUT1VDSF9UQVJHRVRfRVZFTlRTLCB1bmRlZmluZWQpO1xuICAgICAgICB0aGlzLmNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgfVxuICAgIGhhbmRsZXIoZXZlbnQ6IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgdmFyIGV2ZW50VHlwZTogbnVtYmVyID0gVE9VQ0hfSU5QVVRfTUFQW2V2ZW50LnR5cGVdO1xuICAgICAgICB0aGlzLmNhbGxiYWNrKHRoaXMubWFuYWdlciwgZXZlbnRUeXBlLCBldmVudCk7XG4gICAgfVxufVxuXG4vKipcbiAqIEB0aGlzIHtUb3VjaElucHV0fVxuICogQHBhcmFtIHtPYmplY3R9IGV2XG4gKiBAcGFyYW0ge051bWJlcn0gdHlwZSBmbGFnXG4gKiBAcmV0dXJuIHt1bmRlZmluZWR8QXJyYXl9IFthbGwsIGNoYW5nZWRdXG4gKi9cbmZ1bmN0aW9uIGdldFRvdWNoZXMoZXZlbnQ6IFRvdWNoRXZlbnQsIHR5cGU6IG51bWJlcikge1xuICAgIHZhciBhbGxUb3VjaGVzID0gdG9BcnJheShldmVudC50b3VjaGVzKTtcbiAgICB2YXIgdGFyZ2V0SWRzID0gdGhpcy50YXJnZXRJZHM7XG5cbiAgICAvLyB3aGVuIHRoZXJlIGlzIG9ubHkgb25lIHRvdWNoLCB0aGUgcHJvY2VzcyBjYW4gYmUgc2ltcGxpZmllZFxuICAgIGlmICh0eXBlICYgKElOUFVUX1NUQVJUIHwgSU5QVVRfTU9WRSkgJiYgYWxsVG91Y2hlcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgdGFyZ2V0SWRzW2FsbFRvdWNoZXNbMF0uaWRlbnRpZmllcl0gPSB0cnVlO1xuICAgICAgICByZXR1cm4gW2FsbFRvdWNoZXMsIGFsbFRvdWNoZXNdO1xuICAgIH1cblxuICAgIHZhciBpLFxuICAgICAgICB0YXJnZXRUb3VjaGVzLFxuICAgICAgICBjaGFuZ2VkVG91Y2hlcyA9IHRvQXJyYXkoZXZlbnQuY2hhbmdlZFRvdWNoZXMpLFxuICAgICAgICBjaGFuZ2VkVGFyZ2V0VG91Y2hlcyA9IFtdLFxuICAgICAgICB0YXJnZXQgPSB0aGlzLnRhcmdldDtcblxuICAgIC8vIGdldCB0YXJnZXQgdG91Y2hlcyBmcm9tIHRvdWNoZXNcbiAgICB0YXJnZXRUb3VjaGVzID0gYWxsVG91Y2hlcy5maWx0ZXIoZnVuY3Rpb24odG91Y2gpIHtcbiAgICAgICAgcmV0dXJuIGhhc1BhcmVudCh0b3VjaC50YXJnZXQsIHRhcmdldCk7XG4gICAgfSk7XG5cbiAgICAvLyBjb2xsZWN0IHRvdWNoZXNcbiAgICBpZiAodHlwZSA9PT0gSU5QVVRfU1RBUlQpIHtcbiAgICAgICAgaSA9IDA7XG4gICAgICAgIHdoaWxlIChpIDwgdGFyZ2V0VG91Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRhcmdldElkc1t0YXJnZXRUb3VjaGVzW2ldLmlkZW50aWZpZXJdID0gdHJ1ZTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGZpbHRlciBjaGFuZ2VkIHRvdWNoZXMgdG8gb25seSBjb250YWluIHRvdWNoZXMgdGhhdCBleGlzdCBpbiB0aGUgY29sbGVjdGVkIHRhcmdldCBpZHNcbiAgICBpID0gMDtcbiAgICB3aGlsZSAoaSA8IGNoYW5nZWRUb3VjaGVzLmxlbmd0aCkge1xuICAgICAgICBpZiAodGFyZ2V0SWRzW2NoYW5nZWRUb3VjaGVzW2ldLmlkZW50aWZpZXJdKSB7XG4gICAgICAgICAgICBjaGFuZ2VkVGFyZ2V0VG91Y2hlcy5wdXNoKGNoYW5nZWRUb3VjaGVzW2ldKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNsZWFudXAgcmVtb3ZlZCB0b3VjaGVzXG4gICAgICAgIGlmICh0eXBlICYgKElOUFVUX0VORCB8IElOUFVUX0NBTkNFTCkpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0YXJnZXRJZHNbY2hhbmdlZFRvdWNoZXNbaV0uaWRlbnRpZmllcl07XG4gICAgICAgIH1cbiAgICAgICAgaSsrO1xuICAgIH1cblxuICAgIGlmICghY2hhbmdlZFRhcmdldFRvdWNoZXMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gW1xuICAgICAgICAvLyBtZXJnZSB0YXJnZXRUb3VjaGVzIHdpdGggY2hhbmdlZFRhcmdldFRvdWNoZXMgc28gaXQgY29udGFpbnMgQUxMIHRvdWNoZXMsIGluY2x1ZGluZyAnZW5kJyBhbmQgJ2NhbmNlbCdcbiAgICAgICAgdW5pcXVlQXJyYXkodGFyZ2V0VG91Y2hlcy5jb25jYXQoY2hhbmdlZFRhcmdldFRvdWNoZXMpLCAnaWRlbnRpZmllcicsIHRydWUpLFxuICAgICAgICBjaGFuZ2VkVGFyZ2V0VG91Y2hlc1xuICAgIF07XG59XG5cbi8qKlxuICogUmVjb2duaXplciBmbG93IGV4cGxhaW5lZDsgKlxuICogQWxsIHJlY29nbml6ZXJzIGhhdmUgdGhlIGluaXRpYWwgc3RhdGUgb2YgUE9TU0lCTEUgd2hlbiBhIGlucHV0IHNlc3Npb24gc3RhcnRzLlxuICogVGhlIGRlZmluaXRpb24gb2YgYSBpbnB1dCBzZXNzaW9uIGlzIGZyb20gdGhlIGZpcnN0IGlucHV0IHVudGlsIHRoZSBsYXN0IGlucHV0LCB3aXRoIGFsbCBpdCdzIG1vdmVtZW50IGluIGl0LiAqXG4gKiBFeGFtcGxlIHNlc3Npb24gZm9yIG1vdXNlLWlucHV0OiBtb3VzZWRvd24gLT4gbW91c2Vtb3ZlIC0+IG1vdXNldXBcbiAqXG4gKiBPbiBlYWNoIHJlY29nbml6aW5nIGN5Y2xlIChzZWUgTWFuYWdlci5yZWNvZ25pemUpIHRoZSAucmVjb2duaXplKCkgbWV0aG9kIGlzIGV4ZWN1dGVkXG4gKiB3aGljaCBkZXRlcm1pbmVzIHdpdGggc3RhdGUgaXQgc2hvdWxkIGJlLlxuICpcbiAqIElmIHRoZSByZWNvZ25pemVyIGhhcyB0aGUgc3RhdGUgRkFJTEVELCBDQU5DRUxMRUQgb3IgUkVDT0dOSVpFRCAoZXF1YWxzIEVOREVEKSwgaXQgaXMgcmVzZXQgdG9cbiAqIFBPU1NJQkxFIHRvIGdpdmUgaXQgYW5vdGhlciBjaGFuZ2Ugb24gdGhlIG5leHQgY3ljbGUuXG4gKlxuICogICAgICAgICAgICAgICBQb3NzaWJsZVxuICogICAgICAgICAgICAgICAgICB8XG4gKiAgICAgICAgICAgICstLS0tLSstLS0tLS0tLS0tLS0tLS0rXG4gKiAgICAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICB8XG4gKiAgICAgICstLS0tLSstLS0tLSsgICAgICAgICAgICAgICB8XG4gKiAgICAgIHwgICAgICAgICAgIHwgICAgICAgICAgICAgICB8XG4gKiAgIEZhaWxlZCAgICAgIENhbmNlbGxlZCAgICAgICAgICB8XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgKy0tLS0tLS0rLS0tLS0tK1xuICogICAgICAgICAgICAgICAgICAgICAgICAgIHwgICAgICAgICAgICAgIHxcbiAqICAgICAgICAgICAgICAgICAgICAgIFJlY29nbml6ZWQgICAgICAgQmVnYW5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQ2hhbmdlZFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHxcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJlY29nbml6ZWRcbiAqL1xuZXhwb3J0IHZhciBTVEFURV9VTkRFRklORUQgPSAwO1xuZXhwb3J0IHZhciBTVEFURV9QT1NTSUJMRSA9IDE7XG5leHBvcnQgdmFyIFNUQVRFX0JFR0FOID0gMjtcbmV4cG9ydCB2YXIgU1RBVEVfQ0hBTkdFRCA9IDQ7XG5leHBvcnQgdmFyIFNUQVRFX1JFQ09HTklaRUQgPSA4O1xuZXhwb3J0IHZhciBTVEFURV9DQU5DRUxMRUQgPSAxNjtcbmV4cG9ydCB2YXIgU1RBVEVfRkFJTEVEID0gMzI7XG5cbmV4cG9ydCBjbGFzcyBSZWNvZ25pemVyIGltcGxlbWVudHMgSVJlY29nbml6ZXIge1xuICAgIHB1YmxpYyBpZDtcbiAgICBwdWJsaWMgbWFuYWdlcjogSVJlY29nbml6ZXJDYWxsYmFjaztcbiAgICBwdWJsaWMgZXZlbnROYW1lOiBzdHJpbmc7XG4gICAgcHVibGljIGVuYWJsZWQ6IGJvb2xlYW47XG4gICAgcHVibGljIHN0YXRlOiBudW1iZXI7XG4gICAgcHVibGljIHNpbXVsdGFuZW91cyA9IHt9OyAvLyBUT0RPOiBUeXBlIGFzIG1hcCBvZiBzdHJpbmcgdG8gUmVjb2duaXplci5cbiAgICBwdWJsaWMgcmVxdWlyZUZhaWw6IElSZWNvZ25pemVyW10gPSBbXTtcbiAgICAvKipcbiAgICAgKiBSZWNvZ25pemVyXG4gICAgICogRXZlcnkgcmVjb2duaXplciBuZWVkcyB0byBleHRlbmQgZnJvbSB0aGlzIGNsYXNzLlxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGV2ZW50TmFtZTogc3RyaW5nLCBlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuZXZlbnROYW1lID0gZXZlbnROYW1lO1xuICAgICAgICB0aGlzLmVuYWJsZWQgPSBlbmFibGVkO1xuICAgICAgICB0aGlzLmlkID0gdW5pcXVlSWQoKTtcblxuICAgICAgICB0aGlzLm1hbmFnZXIgPSBudWxsO1xuICAgICAgICAvLyAgICAgIHRoaXMub3B0aW9ucyA9IG1lcmdlKG9wdGlvbnMgfHwge30sIHRoaXMuZGVmYXVsdHMpO1xuXG4gICAgICAgIC8vIGRlZmF1bHQgaXMgZW5hYmxlIHRydWVcbiAgICAgICAgLy8gICAgICB0aGlzLm9wdGlvbnMuZW5hYmxlID0gaWZVbmRlZmluZWQodGhpcy5vcHRpb25zLmVuYWJsZSwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX1BPU1NJQkxFO1xuICAgIH1cbiAgICBzZXQob3B0aW9ucykge1xuICAgICAgICAvLyAgICAgIGV4dGVuZCh0aGlzLm9wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAgIC8vIGFsc28gdXBkYXRlIHRoZSB0b3VjaEFjdGlvbiwgaW4gY2FzZSBzb21ldGhpbmcgY2hhbmdlZCBhYm91dCB0aGUgZGlyZWN0aW9ucy9lbmFibGVkIHN0YXRlXG4gICAgICAgIHRoaXMubWFuYWdlciAmJiB0aGlzLm1hbmFnZXIudXBkYXRlVG91Y2hBY3Rpb24oKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogcmVjb2duaXplIHNpbXVsdGFuZW91cyB3aXRoIGFuIG90aGVyIHJlY29nbml6ZXIuXG4gICAgICogQHBhcmFtIHtSZWNvZ25pemVyfSBvdGhlclJlY29nbml6ZXJcbiAgICAgKiBAcmV0dXJuIHtSZWNvZ25pemVyfSB0aGlzXG4gICAgICovXG4gICAgcmVjb2duaXplV2l0aChvdGhlclJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogSVJlY29nbml6ZXIge1xuICAgICAgICB2YXIgc2ltdWx0YW5lb3VzID0gdGhpcy5zaW11bHRhbmVvdXM7XG4gICAgICAgIG90aGVyUmVjb2duaXplciA9IGdldFJlY29nbml6ZXJCeU5hbWVJZk1hbmFnZXIob3RoZXJSZWNvZ25pemVyLCB0aGlzLm1hbmFnZXIpO1xuICAgICAgICBpZiAoIXNpbXVsdGFuZW91c1tvdGhlclJlY29nbml6ZXIuaWRdKSB7XG4gICAgICAgICAgICBzaW11bHRhbmVvdXNbb3RoZXJSZWNvZ25pemVyLmlkXSA9IG90aGVyUmVjb2duaXplcjtcbiAgICAgICAgICAgIG90aGVyUmVjb2duaXplci5yZWNvZ25pemVXaXRoKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGRyb3AgdGhlIHNpbXVsdGFuZW91cyBsaW5rLiBpdCBkb2VzbnQgcmVtb3ZlIHRoZSBsaW5rIG9uIHRoZSBvdGhlciByZWNvZ25pemVyLlxuICAgICAqIEBwYXJhbSB7UmVjb2duaXplcn0gb3RoZXJSZWNvZ25pemVyXG4gICAgICogQHJldHVybiB7UmVjb2duaXplcn0gdGhpc1xuICAgICAqL1xuICAgIGRyb3BSZWNvZ25pemVXaXRoKG90aGVyUmVjb2duaXplcjogSVJlY29nbml6ZXIpIHtcbiAgICAgICAgb3RoZXJSZWNvZ25pemVyID0gZ2V0UmVjb2duaXplckJ5TmFtZUlmTWFuYWdlcihvdGhlclJlY29nbml6ZXIsIHRoaXMubWFuYWdlcik7XG4gICAgICAgIGRlbGV0ZSB0aGlzLnNpbXVsdGFuZW91c1tvdGhlclJlY29nbml6ZXIuaWRdO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiByZWNvZ25pemVyIGNhbiBvbmx5IHJ1biB3aGVuIGFuIG90aGVyIGlzIGZhaWxpbmdcbiAgICAgKi9cbiAgICByZXF1aXJlRmFpbHVyZShvdGhlclJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogSVJlY29nbml6ZXIge1xuICAgICAgICB2YXIgcmVxdWlyZUZhaWwgPSB0aGlzLnJlcXVpcmVGYWlsO1xuICAgICAgICBvdGhlclJlY29nbml6ZXIgPSBnZXRSZWNvZ25pemVyQnlOYW1lSWZNYW5hZ2VyKG90aGVyUmVjb2duaXplciwgdGhpcy5tYW5hZ2VyKTtcbiAgICAgICAgaWYgKGluQXJyYXkocmVxdWlyZUZhaWwsIG90aGVyUmVjb2duaXplcikgPT09IC0xKSB7XG4gICAgICAgICAgICByZXF1aXJlRmFpbC5wdXNoKG90aGVyUmVjb2duaXplcik7XG4gICAgICAgICAgICBvdGhlclJlY29nbml6ZXIucmVxdWlyZUZhaWx1cmUodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogZHJvcCB0aGUgcmVxdWlyZUZhaWx1cmUgbGluay4gaXQgZG9lcyBub3QgcmVtb3ZlIHRoZSBsaW5rIG9uIHRoZSBvdGhlciByZWNvZ25pemVyLlxuICAgICAqIEBwYXJhbSB7UmVjb2duaXplcn0gb3RoZXJSZWNvZ25pemVyXG4gICAgICogQHJldHVybiB7UmVjb2duaXplcn0gdGhpc1xuICAgICAqL1xuICAgIGRyb3BSZXF1aXJlRmFpbHVyZShvdGhlclJlY29nbml6ZXI6IElSZWNvZ25pemVyKSB7XG4gICAgICAgIG90aGVyUmVjb2duaXplciA9IGdldFJlY29nbml6ZXJCeU5hbWVJZk1hbmFnZXIob3RoZXJSZWNvZ25pemVyLCB0aGlzLm1hbmFnZXIpO1xuICAgICAgICB2YXIgaW5kZXggPSBpbkFycmF5KHRoaXMucmVxdWlyZUZhaWwsIG90aGVyUmVjb2duaXplcik7XG4gICAgICAgIGlmIChpbmRleCA+IC0xKSB7XG4gICAgICAgICAgICB0aGlzLnJlcXVpcmVGYWlsLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogaGFzIHJlcXVpcmUgZmFpbHVyZXMgYm9vbGVhblxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgaGFzUmVxdWlyZUZhaWx1cmVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZXF1aXJlRmFpbC5sZW5ndGggPiAwO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGlmIHRoZSByZWNvZ25pemVyIGNhbiByZWNvZ25pemUgc2ltdWx0YW5lb3VzIHdpdGggYW4gb3RoZXIgcmVjb2duaXplclxuICAgICAqIEBwYXJhbSB7UmVjb2duaXplcn0gb3RoZXJSZWNvZ25pemVyXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBjYW5SZWNvZ25pemVXaXRoKG90aGVyUmVjb2duaXplcjogSVJlY29nbml6ZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5zaW11bHRhbmVvdXNbb3RoZXJSZWNvZ25pemVyLmlkXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBZb3Ugc2hvdWxkIHVzZSBgdHJ5RW1pdGAgaW5zdGVhZCBvZiBgZW1pdGAgZGlyZWN0bHkgdG8gY2hlY2tcbiAgICAgKiB0aGF0IGFsbCB0aGUgbmVlZGVkIHJlY29nbml6ZXJzIGhhcyBmYWlsZWQgYmVmb3JlIGVtaXR0aW5nLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dFxuICAgICAqL1xuICAgIGVtaXQoKTogdm9pZCB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5zdGF0ZTtcblxuICAgICAgICBmdW5jdGlvbiBlbWl0KHdpdGhTdGF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgICAgIHZhciBldmVudE5hbWUgPSBzZWxmLmV2ZW50TmFtZSArICh3aXRoU3RhdGUgPyBzdGF0ZVN0cihzdGF0ZSkgOiAnJyk7XG4gICAgICAgICAgICBzZWxmLm1hbmFnZXIuZW1pdChldmVudE5hbWUsIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGSVhNRTogTm90IG5pY2UsIG1lYW5pbmcgaW1wbGljaXQgaW4gc3RhdGUgbnVtYmVyaW5nLlxuICAgICAgICAvLyAncGFuc3RhcnQnIGFuZCAncGFubW92ZSdcbiAgICAgICAgaWYgKHN0YXRlIDwgU1RBVEVfUkVDT0dOSVpFRCkge1xuICAgICAgICAgICAgZW1pdCh0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGVtaXQoZmFsc2UpOyAvLyBzaW1wbGUgJ2V2ZW50TmFtZScgZXZlbnRzXG5cbiAgICAgICAgLy8gcGFuZW5kIGFuZCBwYW5jYW5jZWxcbiAgICAgICAgaWYgKHN0YXRlID49IFNUQVRFX1JFQ09HTklaRUQpIHtcbiAgICAgICAgICAgIGVtaXQodHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayB0aGF0IGFsbCB0aGUgcmVxdWlyZSBmYWlsdXJlIHJlY29nbml6ZXJzIGhhcyBmYWlsZWQsXG4gICAgICogaWYgdHJ1ZSwgaXQgZW1pdHMgYSBnZXN0dXJlIGV2ZW50LFxuICAgICAqIG90aGVyd2lzZSwgc2V0dXAgdGhlIHN0YXRlIHRvIEZBSUxFRC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gaW5wdXRcbiAgICAgKi9cbiAgICB0cnlFbWl0KCkge1xuICAgICAgICBpZiAodGhpcy5jYW5FbWl0KCkpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmVtaXQoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgfVxuICAgICAgICAvLyBpdCdzIGZhaWxpbmcgYW55d2F5P1xuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfRkFJTEVEO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGNhbiB3ZSBlbWl0P1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgY2FuRW1pdCgpIHtcbiAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICB3aGlsZSAoaSA8IHRoaXMucmVxdWlyZUZhaWwubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAoISh0aGlzLnJlcXVpcmVGYWlsW2ldLnN0YXRlICYgKFNUQVRFX0ZBSUxFRCB8IFNUQVRFX1BPU1NJQkxFKSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogdXBkYXRlIHRoZSByZWNvZ25pemVyXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGlucHV0RGF0YVxuICAgICAqL1xuICAgIHJlY29nbml6ZShjb21wRXZlbnQ6IElDb21wdXRlZEV2ZW50KTogdm9pZCB7XG5cbiAgICAgICAgaWYgKCF0aGlzLmVuYWJsZWQpIHtcbiAgICAgICAgICAgIHRoaXMucmVzZXQoKTtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9GQUlMRUQ7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyByZXNldCB3aGVuIHdlJ3ZlIHJlYWNoZWQgdGhlIGVuZFxuICAgICAgICBpZiAodGhpcy5zdGF0ZSAmIChTVEFURV9SRUNPR05JWkVEIHwgU1RBVEVfQ0FOQ0VMTEVEIHwgU1RBVEVfRkFJTEVEKSkge1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX1BPU1NJQkxFO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zdGF0ZSA9IHRoaXMucHJvY2Vzcyhjb21wRXZlbnQpO1xuXG4gICAgICAgIC8vIHRoZSByZWNvZ25pemVyIGhhcyByZWNvZ25pemVkIGEgZ2VzdHVyZSBzbyB0cmlnZ2VyIGFuIGV2ZW50XG4gICAgICAgIGlmICh0aGlzLnN0YXRlICYgKFNUQVRFX0JFR0FOIHwgU1RBVEVfQ0hBTkdFRCB8IFNUQVRFX1JFQ09HTklaRUQgfCBTVEFURV9DQU5DRUxMRUQpKSB7XG4gICAgICAgICAgICB0aGlzLnRyeUVtaXQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHJldHVybiB0aGUgc3RhdGUgb2YgdGhlIHJlY29nbml6ZXJcbiAgICAgKiB0aGUgYWN0dWFsIHJlY29nbml6aW5nIGhhcHBlbnMgaW4gdGhpcyBtZXRob2RcbiAgICAgKiBAdmlydHVhbFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dERhdGFcbiAgICAgKiBAcmV0dXJuIHtDb25zdH0gU1RBVEVcbiAgICAgKi9cbiAgICBwcm9jZXNzKGlucHV0RGF0YTogSUNvbXB1dGVkRXZlbnQpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gU1RBVEVfVU5ERUZJTkVEO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHJldHVybiB0aGUgcHJlZmVycmVkIHRvdWNoLWFjdGlvblxuICAgICAqIEB2aXJ0dWFsXG4gICAgICogQHJldHVybiB7QXJyYXl9XG4gICAgICovXG4gICAgZ2V0VG91Y2hBY3Rpb24oKTogc3RyaW5nW10geyByZXR1cm4gW107IH1cblxuICAgIC8qKlxuICAgICAqIGNhbGxlZCB3aGVuIHRoZSBnZXN0dXJlIGlzbid0IGFsbG93ZWQgdG8gcmVjb2duaXplXG4gICAgICogbGlrZSB3aGVuIGFub3RoZXIgaXMgYmVpbmcgcmVjb2duaXplZCBvciBpdCBpcyBkaXNhYmxlZFxuICAgICAqIEB2aXJ0dWFsXG4gICAgICovXG4gICAgcmVzZXQoKSB7IH1cbn1cblxuLyoqXG4gKiBUT0RPOiBBcmUgdGhlIHN0cmluZyB2YWx1ZXMgcGFydCBvZiB0aGUgQVBJLCBvciBqdXN0IGZvciBkZWJ1Z2dpbmc/XG4gKiBnZXQgYSB1c2FibGUgc3RyaW5nLCB1c2VkIGFzIGV2ZW50IHBvc3RmaXhcbiAqIEBwYXJhbSB7Q29uc3R9IHN0YXRlXG4gKiBAcmV0dXJuIHtTdHJpbmd9IHN0YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZVN0cihzdGF0ZTogbnVtYmVyKTogc3RyaW5nIHtcbiAgICBpZiAoc3RhdGUgJiBTVEFURV9DQU5DRUxMRUQpIHtcbiAgICAgICAgcmV0dXJuICdjYW5jZWwnO1xuICAgIH1cbiAgICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX1JFQ09HTklaRUQpIHtcbiAgICAgICAgcmV0dXJuICdlbmQnO1xuICAgIH1cbiAgICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX0NIQU5HRUQpIHtcbiAgICAgICAgcmV0dXJuICdtb3ZlJztcbiAgICB9XG4gICAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9CRUdBTikge1xuICAgICAgICByZXR1cm4gJ3N0YXJ0JztcbiAgICB9XG4gICAgcmV0dXJuICcnO1xufVxuXG4vKipcbiAqIFByb3ZpZGUgYSBkZWNvZGUgb2YgdGhlIHN0YXRlLlxuICogVGhlIHJlc3VsdCBpcyBub3Qgbm9ybWF0aXZlIGFuZCBzaG91bGQgbm90IGJlIGNvbnNpZGVyZWQgQVBJLlxuICogU2luZSB0aGUgc3RhdGUgaXMgYSBiaXQgZmllbGQsIHNob3cgYWxsIGJpdHMgZXZlbiB0aG91Z2ggdGhleSBtYXkvc2hvdWxkIGJlIGV4Y2x1c2l2ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0YXRlRGVjb2RlKHN0YXRlOiBudW1iZXIpOiBzdHJpbmcge1xuICAgIHZhciBzdGF0ZXM6IHN0cmluZ1tdID0gW107XG4gICAgaWYgKHN0YXRlICYgU1RBVEVfUE9TU0lCTEUpIHtcbiAgICAgICAgc3RhdGVzLnB1c2goJ1NUQVRFX1BPU1NJQkxFJyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfQ0FOQ0VMTEVEKSB7XG4gICAgICAgIHN0YXRlcy5wdXNoKCdTVEFURV9DQU5DRUxMRUQnKTtcbiAgICB9XG4gICAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9SRUNPR05JWkVEKSB7XG4gICAgICAgIHN0YXRlcy5wdXNoKCdTVEFURV9SRUNPR05JWkVEJyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfQ0hBTkdFRCkge1xuICAgICAgICBzdGF0ZXMucHVzaCgnU1RBVEVfQ0hBTkdFRCcpO1xuICAgIH1cbiAgICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX0JFR0FOKSB7XG4gICAgICAgIHN0YXRlcy5wdXNoKCdTVEFURV9CRUdBTicpO1xuICAgIH1cbiAgICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX1VOREVGSU5FRCkge1xuICAgICAgICBzdGF0ZXMucHVzaCgnU1RBVEVfVU5ERUZJTkVEJyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfRkFJTEVEKSB7XG4gICAgICAgIHN0YXRlcy5wdXNoKCdTVEFURV9GQUlMRUQnKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHN0YXRlcy5wdXNoKCcnICsgc3RhdGUpO1xuICAgIH1cbiAgICByZXR1cm4gc3RhdGVzLmpvaW4oJyAnKTtcbn1cblxuLyoqXG4gKiBUT0RPOiBUaGlzIHJlYWxseSBiZWxvbmdzIGluIHRoZSBpbnB1dCBzZXJ2aWNlLlxuICogZGlyZWN0aW9uIGNvbnMgdG8gc3RyaW5nXG4gKiBAcGFyYW0ge0NvbnN0fSBkaXJlY3Rpb25cbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRpcmVjdGlvblN0cihkaXJlY3Rpb246IG51bWJlcik6IHN0cmluZyB7XG4gICAgdmFyIGRzOiBzdHJpbmdbXSA9IFtdO1xuICAgIGlmIChkaXJlY3Rpb24gJiBESVJFQ1RJT05fRE9XTikge1xuICAgICAgICBkcy5wdXNoKCdkb3duJyk7XG4gICAgfVxuICAgIGlmIChkaXJlY3Rpb24gJiBESVJFQ1RJT05fVVApIHtcbiAgICAgICAgZHMucHVzaCgndXAnKTtcbiAgICB9XG4gICAgaWYgKGRpcmVjdGlvbiAmIERJUkVDVElPTl9MRUZUKSB7XG4gICAgICAgIGRzLnB1c2goJ2xlZnQnKTtcbiAgICB9XG4gICAgaWYgKGRpcmVjdGlvbiAmIERJUkVDVElPTl9SSUdIVCkge1xuICAgICAgICBkcy5wdXNoKCdyaWdodCcpO1xuICAgIH1cbiAgICByZXR1cm4gZHMuam9pbignICcpO1xufVxuXG4vKipcbiAqIGdldCBhIHJlY29nbml6ZXIgYnkgbmFtZSBpZiBpdCBpcyBib3VuZCB0byBhIG1hbmFnZXJcbiAqIEBwYXJhbSB7UmVjb2duaXplcnxTdHJpbmd9IG90aGVyUmVjb2duaXplclxuICogQHBhcmFtIHtSZWNvZ25pemVyfSByZWNvZ25pemVyXG4gKiBAcmV0dXJuIHtSZWNvZ25pemVyfVxuICovXG5mdW5jdGlvbiBnZXRSZWNvZ25pemVyQnlOYW1lSWZNYW5hZ2VyKHJlY29nbml6ZXI6IElSZWNvZ25pemVyLCBtYW5hZ2VyOiBJUmVjb2duaXplckNhbGxiYWNrKTogSVJlY29nbml6ZXIge1xuICAgIGlmIChtYW5hZ2VyKSB7XG4gICAgICAgIHJldHVybiBtYW5hZ2VyLmdldChyZWNvZ25pemVyLmV2ZW50TmFtZSk7XG4gICAgfVxuICAgIHJldHVybiByZWNvZ25pemVyO1xufVxuIl19