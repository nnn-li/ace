var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var utils = require('./utils');
exports.TOUCH_ACTION_COMPUTE = 'compute';
exports.TOUCH_ACTION_AUTO = 'auto';
exports.TOUCH_ACTION_MANIPULATION = 'manipulation';
exports.TOUCH_ACTION_NONE = 'none';
exports.TOUCH_ACTION_PAN_X = 'pan-x';
exports.TOUCH_ACTION_PAN_Y = 'pan-y';
var STOP = 1;
var FORCED_STOP = 2;
var VectorE2 = (function () {
    function VectorE2(x, y) {
        this.x = x;
        this.y = y;
    }
    VectorE2.prototype.add = function (other) {
        return new VectorE2(this.x + other.x, this.y + other.y);
    };
    VectorE2.prototype.sub = function (other) {
        return new VectorE2(this.x - other.x, this.y - other.y);
    };
    VectorE2.prototype.div = function (other) {
        return new VectorE2(this.x / other, this.y / other);
    };
    VectorE2.prototype.dot = function (other) {
        return this.x * other.x + this.y * other.y;
    };
    VectorE2.prototype.norm = function () {
        return Math.sqrt(this.quadrance());
    };
    VectorE2.prototype.quadrance = function () {
        return this.x * this.x + this.y * this.y;
    };
    VectorE2.prototype.toString = function () {
        return 'VectorE2(' + this.x + ', ' + this.y + ')';
    };
    return VectorE2;
})();
exports.VectorE2 = VectorE2;
var ClientLocation = (function () {
    function ClientLocation(clientX, clientY) {
        this.clientX = clientX;
        this.clientY = clientY;
    }
    ClientLocation.prototype.moveTo = function (clientX, clientY) {
        this.clientX = clientX;
        this.clientY = clientY;
    };
    ClientLocation.prototype.sub = function (other) {
        return new VectorE2(this.clientX - other.clientX, this.clientY - other.clientY);
    };
    ClientLocation.fromTouch = function (touch) {
        return new ClientLocation(touch.clientX, touch.clientY);
    };
    ClientLocation.prototype.toString = function () {
        return 'ClientLocation(' + this.clientX + ', ' + this.clientY + ')';
    };
    return ClientLocation;
})();
exports.ClientLocation = ClientLocation;
var Session = (function () {
    function Session() {
        this.compEvents = [];
        this.reset();
    }
    Session.prototype.reset = function () {
        this.startTime = Date.now();
        this.compEvents = [];
        this.curRecognizer = undefined;
    };
    Session.prototype.push = function (compEvent) {
        this.compEvents.push(compEvent);
    };
    Session.prototype.computeMovement = function (center) {
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
    };
    Session.prototype.computeVelocity = function (center, deltaTime) {
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
    };
    return Session;
})();
exports.Session = Session;
var Manager = (function () {
    function Manager(element) {
        this.handlers = {};
        this.session = new Session();
        this.recognizers = [];
        this.domEvents = false;
        this.enable = true;
        this.cssProps = {};
        this.element = element;
        this.inputTarget = element;
        this.input = new TouchInput(this, inputHandler);
        this.touchAction = new TouchAction(this, exports.TOUCH_ACTION_COMPUTE);
        this.toggleCssProps(true);
    }
    Manager.prototype.stop = function (force) {
        this.session.stopped = force ? FORCED_STOP : STOP;
    };
    Manager.prototype.recognize = function (inputData, touchEvent) {
        var session = this.session;
        if (session.stopped) {
            return;
        }
        this.touchAction.preventDefaults(inputData, touchEvent);
        var recognizer;
        var recognizers = this.recognizers;
        var curRecognizer = session.curRecognizer;
        if (!curRecognizer || (curRecognizer && curRecognizer.state & exports.STATE_RECOGNIZED)) {
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
            if (!curRecognizer && recognizer.state & (exports.STATE_BEGAN | exports.STATE_CHANGED | exports.STATE_RECOGNIZED)) {
                curRecognizer = session.curRecognizer = recognizer;
            }
            i++;
        }
    };
    Manager.prototype.get = function (eventName) {
        var recognizers = this.recognizers;
        for (var i = 0; i < recognizers.length; i++) {
            if (recognizers[i].eventName === eventName) {
                return recognizers[i];
            }
        }
        return null;
    };
    Manager.prototype.add = function (recognizer) {
        var existing = this.get(recognizer.eventName);
        if (existing) {
            this.remove(existing);
        }
        this.recognizers.push(recognizer);
        recognizer.manager = this;
        this.touchAction.update();
        return recognizer;
    };
    Manager.prototype.remove = function (recognizer) {
        var recognizers = this.recognizers;
        recognizer = this.get(recognizer.eventName);
        recognizers.splice(utils.inArray(recognizers, recognizer), 1);
        this.touchAction.update();
        return this;
    };
    Manager.prototype.on = function (events, handler) {
        var handlers = this.handlers;
        utils.each(utils.splitStr(events), function (event) {
            handlers[event] = handlers[event] || [];
            handlers[event].push(handler);
        });
        return this;
    };
    Manager.prototype.off = function (events, handler) {
        var handlers = this.handlers;
        utils.each(utils.splitStr(events), function (event) {
            if (!handler) {
                delete handlers[event];
            }
            else {
                handlers[event].splice(utils.inArray(handlers[event], handler), 1);
            }
        });
        return this;
    };
    Manager.prototype.emit = function (eventName, data) {
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
    };
    Manager.prototype.updateTouchAction = function () {
        this.touchAction.update();
    };
    Manager.prototype.destroy = function () {
        this.element && this.toggleCssProps(false);
        this.handlers = {};
        this.session = undefined;
        this.input.destroy();
        this.element = null;
    };
    Manager.prototype.toggleCssProps = function (add) {
        if (!this.element.style) {
            return;
        }
        var element = this.element;
        utils.each(this.cssProps, function (value, name) {
            element.style[utils.prefixed(element.style, name)] = add ? value : '';
        });
    };
    Manager.prototype.cancelContextMenu = function () {
    };
    return Manager;
})();
exports.Manager = Manager;
function triggerDomEvent(event, data) {
    var gestureEvent = document.createEvent('Event');
    gestureEvent.initEvent(event, true, true);
    gestureEvent['gesture'] = data;
    data.target.dispatchEvent(gestureEvent);
}
var MOBILE_REGEX = /mobile|tablet|ip(ad|hone|od)|android/i;
var SUPPORT_TOUCH = ('ontouchstart' in window);
var SUPPORT_POINTER_EVENTS = utils.prefixed(window, 'PointerEvent') !== undefined;
var SUPPORT_ONLY_TOUCH = SUPPORT_TOUCH && MOBILE_REGEX.test(navigator.userAgent);
var PREFIXED_TOUCH_ACTION = utils.prefixed(utils.TEST_ELEMENT.style, 'touchAction');
var NATIVE_TOUCH_ACTION = PREFIXED_TOUCH_ACTION !== undefined;
var TouchAction = (function () {
    function TouchAction(manager, value) {
        this.manager = manager;
        this.set(value);
    }
    TouchAction.prototype.set = function (value) {
        if (value === exports.TOUCH_ACTION_COMPUTE) {
            value = this.compute();
        }
        if (NATIVE_TOUCH_ACTION && this.manager.element.style) {
            this.manager.element.style[PREFIXED_TOUCH_ACTION] = value;
        }
        this.actions = value.toLowerCase().trim();
    };
    TouchAction.prototype.update = function () {
        this.set(exports.TOUCH_ACTION_COMPUTE);
    };
    TouchAction.prototype.compute = function () {
        var actions = [];
        utils.each(this.manager.recognizers, function (recognizer) {
            if (recognizer.enabled) {
                actions = actions.concat(recognizer.getTouchAction());
            }
        });
        return cleanTouchActions(actions.join(' '));
    };
    TouchAction.prototype.preventDefaults = function (input, touchEvent) {
        if (NATIVE_TOUCH_ACTION) {
            return;
        }
        if (this.prevented) {
            touchEvent.preventDefault();
            return;
        }
    };
    TouchAction.prototype.preventSrc = function (srcEvent) {
        this.prevented = true;
        srcEvent.preventDefault();
    };
    return TouchAction;
})();
function cleanTouchActions(actions) {
    if (utils.inStr(actions, exports.TOUCH_ACTION_NONE)) {
        return exports.TOUCH_ACTION_NONE;
    }
    var hasPanX = utils.inStr(actions, exports.TOUCH_ACTION_PAN_X);
    var hasPanY = utils.inStr(actions, exports.TOUCH_ACTION_PAN_Y);
    if (hasPanX && hasPanY) {
        return exports.TOUCH_ACTION_PAN_X + ' ' + exports.TOUCH_ACTION_PAN_Y;
    }
    if (hasPanX || hasPanY) {
        return hasPanX ? exports.TOUCH_ACTION_PAN_X : exports.TOUCH_ACTION_PAN_Y;
    }
    if (utils.inStr(actions, exports.TOUCH_ACTION_MANIPULATION)) {
        return exports.TOUCH_ACTION_MANIPULATION;
    }
    return exports.TOUCH_ACTION_AUTO;
}
exports.INPUT_TYPE_TOUCH = 'touch';
exports.INPUT_TYPE_PEN = 'pen';
exports.INPUT_TYPE_MOUSE = 'mouse';
exports.INPUT_TYPE_KINECT = 'kinect';
var COMPUTE_INTERVAL = 25;
exports.INPUT_START = 1;
exports.INPUT_MOVE = 2;
exports.INPUT_END = 4;
exports.INPUT_CANCEL = 8;
function decodeEventType(eventType) {
    switch (eventType) {
        case exports.INPUT_START: {
            return "START";
        }
        case exports.INPUT_MOVE: {
            return "MOVE";
        }
        case exports.INPUT_END: {
            return "END";
        }
        case exports.INPUT_CANCEL: {
            return "CANCEL";
        }
        default: {
            return "eventType=" + eventType;
        }
    }
}
exports.decodeEventType = decodeEventType;
exports.DIRECTION_UNDEFINED = 0;
exports.DIRECTION_LEFT = 1;
exports.DIRECTION_RIGHT = 2;
exports.DIRECTION_UP = 4;
exports.DIRECTION_DOWN = 8;
exports.DIRECTION_HORIZONTAL = exports.DIRECTION_LEFT | exports.DIRECTION_RIGHT;
exports.DIRECTION_VERTICAL = exports.DIRECTION_UP | exports.DIRECTION_DOWN;
exports.DIRECTION_ALL = exports.DIRECTION_HORIZONTAL | exports.DIRECTION_VERTICAL;
var PROPS_XY = ['x', 'y'];
var PROPS_CLIENT_XY = ['clientX', 'clientY'];
var Input = (function () {
    function Input(manager, touchElementEvents, touchTargetEvents, touchWindowEvents) {
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
    Input.prototype.handler = function (event) { };
    Input.prototype.init = function () {
        this.evEl && utils.addEventListeners(this.element, this.evEl, this.domHandler);
        this.evTarget && utils.addEventListeners(this.target, this.evTarget, this.domHandler);
        this.evWin && utils.addEventListeners(utils.getWindowForElement(this.element), this.evWin, this.domHandler);
    };
    Input.prototype.destroy = function () {
        this.evEl && utils.removeEventListeners(this.element, this.evEl, this.domHandler);
        this.evTarget && utils.removeEventListeners(this.target, this.evTarget, this.domHandler);
        this.evWin && utils.removeEventListeners(utils.getWindowForElement(this.element), this.evWin, this.domHandler);
    };
    return Input;
})();
function inputHandler(manager, eventType, touchEvent) {
    var compEvent = computeIComputedEvent(manager, eventType, touchEvent);
    manager.recognize(compEvent, touchEvent);
    manager.session.push(compEvent);
}
function computeIComputedEvent(manager, eventType, touchEvent) {
    var touchesLength = touchEvent.touches.length;
    var changedPointersLen = touchEvent.changedTouches.length;
    var isFirst = (eventType & exports.INPUT_START && (touchesLength - changedPointersLen === 0));
    var isFinal = (eventType & (exports.INPUT_END | exports.INPUT_CANCEL) && (touchesLength - changedPointersLen === 0));
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
        var direction = exports.DIRECTION_UNDEFINED;
        if (unit.dot(N) > cosineThreshold) {
            direction |= exports.DIRECTION_UP;
        }
        if (unit.dot(S) > cosineThreshold) {
            direction |= exports.DIRECTION_DOWN;
        }
        if (unit.dot(E) > cosineThreshold) {
            direction |= exports.DIRECTION_RIGHT;
        }
        if (unit.dot(W) > cosineThreshold) {
            direction |= exports.DIRECTION_LEFT;
        }
        return direction;
    }
    else {
        return exports.DIRECTION_UNDEFINED;
    }
}
function getDistance(p1, p2, props) {
    if (!props) {
        props = PROPS_XY;
    }
    var x = p2[props[0]] - p1[props[0]], y = p2[props[1]] - p1[props[1]];
    return Math.sqrt((x * x) + (y * y));
}
exports.getDistance = getDistance;
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
    touchstart: exports.INPUT_START,
    touchmove: exports.INPUT_MOVE,
    touchend: exports.INPUT_END,
    touchcancel: exports.INPUT_CANCEL
};
var TOUCH_TARGET_EVENTS = 'touchstart touchmove touchend touchcancel';
var TouchInput = (function (_super) {
    __extends(TouchInput, _super);
    function TouchInput(manager, callback) {
        _super.call(this, manager, undefined, TOUCH_TARGET_EVENTS, undefined);
        this.targetIds = {};
        this.callback = callback;
    }
    TouchInput.prototype.handler = function (event) {
        var eventType = TOUCH_INPUT_MAP[event.type];
        this.callback(this.manager, eventType, event);
    };
    return TouchInput;
})(Input);
function getTouches(event, type) {
    var allTouches = utils.toArray(event.touches);
    var targetIds = this.targetIds;
    if (type & (exports.INPUT_START | exports.INPUT_MOVE) && allTouches.length === 1) {
        targetIds[allTouches[0].identifier] = true;
        return [allTouches, allTouches];
    }
    var i, targetTouches, changedTouches = utils.toArray(event.changedTouches), changedTargetTouches = [], target = this.target;
    targetTouches = allTouches.filter(function (touch) {
        return utils.hasParent(touch.target, target);
    });
    if (type === exports.INPUT_START) {
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
        if (type & (exports.INPUT_END | exports.INPUT_CANCEL)) {
            delete targetIds[changedTouches[i].identifier];
        }
        i++;
    }
    if (!changedTargetTouches.length) {
        return;
    }
    return [
        utils.uniqueArray(targetTouches.concat(changedTargetTouches), 'identifier', true),
        changedTargetTouches
    ];
}
exports.STATE_UNDEFINED = 0;
exports.STATE_POSSIBLE = 1;
exports.STATE_BEGAN = 2;
exports.STATE_CHANGED = 4;
exports.STATE_RECOGNIZED = 8;
exports.STATE_CANCELLED = 16;
exports.STATE_FAILED = 32;
var Recognizer = (function () {
    function Recognizer(eventName, enabled) {
        this.simultaneous = {};
        this.requireFail = [];
        this.eventName = eventName;
        this.enabled = enabled;
        this.id = utils.uniqueId();
        this.manager = null;
        this.state = exports.STATE_POSSIBLE;
    }
    Recognizer.prototype.set = function (options) {
        this.manager && this.manager.updateTouchAction();
        return this;
    };
    Recognizer.prototype.recognizeWith = function (otherRecognizer) {
        var simultaneous = this.simultaneous;
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
        if (!simultaneous[otherRecognizer.id]) {
            simultaneous[otherRecognizer.id] = otherRecognizer;
            otherRecognizer.recognizeWith(this);
        }
        return this;
    };
    Recognizer.prototype.dropRecognizeWith = function (otherRecognizer) {
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
        delete this.simultaneous[otherRecognizer.id];
        return this;
    };
    Recognizer.prototype.requireFailure = function (otherRecognizer) {
        var requireFail = this.requireFail;
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
        if (utils.inArray(requireFail, otherRecognizer) === -1) {
            requireFail.push(otherRecognizer);
            otherRecognizer.requireFailure(this);
        }
        return this;
    };
    Recognizer.prototype.dropRequireFailure = function (otherRecognizer) {
        otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
        var index = utils.inArray(this.requireFail, otherRecognizer);
        if (index > -1) {
            this.requireFail.splice(index, 1);
        }
        return this;
    };
    Recognizer.prototype.hasRequireFailures = function () {
        return this.requireFail.length > 0;
    };
    Recognizer.prototype.canRecognizeWith = function (otherRecognizer) {
        return !!this.simultaneous[otherRecognizer.id];
    };
    Recognizer.prototype.emit = function () {
        var self = this;
        var state = this.state;
        function emit(withState) {
            var eventName = self.eventName + (withState ? stateStr(state) : '');
            self.manager.emit(eventName, undefined);
        }
        if (state < exports.STATE_RECOGNIZED) {
            emit(true);
        }
        emit(false);
        if (state >= exports.STATE_RECOGNIZED) {
            emit(true);
        }
    };
    Recognizer.prototype.tryEmit = function () {
        if (this.canEmit()) {
            return this.emit();
        }
        else {
        }
        this.state = exports.STATE_FAILED;
    };
    Recognizer.prototype.canEmit = function () {
        var i = 0;
        while (i < this.requireFail.length) {
            if (!(this.requireFail[i].state & (exports.STATE_FAILED | exports.STATE_POSSIBLE))) {
                return false;
            }
            i++;
        }
        return true;
    };
    Recognizer.prototype.recognize = function (compEvent) {
        if (!this.enabled) {
            this.reset();
            this.state = exports.STATE_FAILED;
            return;
        }
        if (this.state & (exports.STATE_RECOGNIZED | exports.STATE_CANCELLED | exports.STATE_FAILED)) {
            this.state = exports.STATE_POSSIBLE;
        }
        this.state = this.process(compEvent);
        if (this.state & (exports.STATE_BEGAN | exports.STATE_CHANGED | exports.STATE_RECOGNIZED | exports.STATE_CANCELLED)) {
            this.tryEmit();
        }
    };
    Recognizer.prototype.process = function (inputData) {
        return exports.STATE_UNDEFINED;
    };
    Recognizer.prototype.getTouchAction = function () { return []; };
    Recognizer.prototype.reset = function () { };
    return Recognizer;
})();
exports.Recognizer = Recognizer;
function stateStr(state) {
    if (state & exports.STATE_CANCELLED) {
        return 'cancel';
    }
    else if (state & exports.STATE_RECOGNIZED) {
        return 'end';
    }
    else if (state & exports.STATE_CHANGED) {
        return 'move';
    }
    else if (state & exports.STATE_BEGAN) {
        return 'start';
    }
    return '';
}
exports.stateStr = stateStr;
function stateDecode(state) {
    var states = [];
    if (state & exports.STATE_POSSIBLE) {
        states.push('STATE_POSSIBLE');
    }
    else if (state & exports.STATE_CANCELLED) {
        states.push('STATE_CANCELLED');
    }
    else if (state & exports.STATE_RECOGNIZED) {
        states.push('STATE_RECOGNIZED');
    }
    else if (state & exports.STATE_CHANGED) {
        states.push('STATE_CHANGED');
    }
    else if (state & exports.STATE_BEGAN) {
        states.push('STATE_BEGAN');
    }
    else if (state & exports.STATE_UNDEFINED) {
        states.push('STATE_UNDEFINED');
    }
    else if (state & exports.STATE_FAILED) {
        states.push('STATE_FAILED');
    }
    else {
        states.push('' + state);
    }
    return states.join(' ');
}
exports.stateDecode = stateDecode;
function directionStr(direction) {
    var ds = [];
    if (direction & exports.DIRECTION_DOWN) {
        ds.push('down');
    }
    if (direction & exports.DIRECTION_UP) {
        ds.push('up');
    }
    if (direction & exports.DIRECTION_LEFT) {
        ds.push('left');
    }
    if (direction & exports.DIRECTION_RIGHT) {
        ds.push('right');
    }
    return ds.join(' ');
}
exports.directionStr = directionStr;
function getRecognizerByNameIfManager(recognizer, manager) {
    if (manager) {
        return manager.get(recognizer.eventName);
    }
    return recognizer;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaGFtbWVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL2hhbW1lci9oYW1tZXIudHMiXSwibmFtZXMiOlsiVmVjdG9yRTIiLCJWZWN0b3JFMi5jb25zdHJ1Y3RvciIsIlZlY3RvckUyLmFkZCIsIlZlY3RvckUyLnN1YiIsIlZlY3RvckUyLmRpdiIsIlZlY3RvckUyLmRvdCIsIlZlY3RvckUyLm5vcm0iLCJWZWN0b3JFMi5xdWFkcmFuY2UiLCJWZWN0b3JFMi50b1N0cmluZyIsIkNsaWVudExvY2F0aW9uIiwiQ2xpZW50TG9jYXRpb24uY29uc3RydWN0b3IiLCJDbGllbnRMb2NhdGlvbi5tb3ZlVG8iLCJDbGllbnRMb2NhdGlvbi5zdWIiLCJDbGllbnRMb2NhdGlvbi5mcm9tVG91Y2giLCJDbGllbnRMb2NhdGlvbi50b1N0cmluZyIsIlNlc3Npb24iLCJTZXNzaW9uLmNvbnN0cnVjdG9yIiwiU2Vzc2lvbi5yZXNldCIsIlNlc3Npb24ucHVzaCIsIlNlc3Npb24uY29tcHV0ZU1vdmVtZW50IiwiU2Vzc2lvbi5jb21wdXRlVmVsb2NpdHkiLCJNYW5hZ2VyIiwiTWFuYWdlci5jb25zdHJ1Y3RvciIsIk1hbmFnZXIuc3RvcCIsIk1hbmFnZXIucmVjb2duaXplIiwiTWFuYWdlci5nZXQiLCJNYW5hZ2VyLmFkZCIsIk1hbmFnZXIucmVtb3ZlIiwiTWFuYWdlci5vbiIsIk1hbmFnZXIub2ZmIiwiTWFuYWdlci5lbWl0IiwiTWFuYWdlci51cGRhdGVUb3VjaEFjdGlvbiIsIk1hbmFnZXIuZGVzdHJveSIsIk1hbmFnZXIudG9nZ2xlQ3NzUHJvcHMiLCJNYW5hZ2VyLmNhbmNlbENvbnRleHRNZW51IiwidHJpZ2dlckRvbUV2ZW50IiwiVG91Y2hBY3Rpb24iLCJUb3VjaEFjdGlvbi5jb25zdHJ1Y3RvciIsIlRvdWNoQWN0aW9uLnNldCIsIlRvdWNoQWN0aW9uLnVwZGF0ZSIsIlRvdWNoQWN0aW9uLmNvbXB1dGUiLCJUb3VjaEFjdGlvbi5wcmV2ZW50RGVmYXVsdHMiLCJUb3VjaEFjdGlvbi5wcmV2ZW50U3JjIiwiY2xlYW5Ub3VjaEFjdGlvbnMiLCJkZWNvZGVFdmVudFR5cGUiLCJJbnB1dCIsIklucHV0LmNvbnN0cnVjdG9yIiwiSW5wdXQuaGFuZGxlciIsIklucHV0LmluaXQiLCJJbnB1dC5kZXN0cm95IiwiaW5wdXRIYW5kbGVyIiwiY29tcHV0ZUlDb21wdXRlZEV2ZW50IiwiY29tcHV0ZUNlbnRlciIsImdldFZlbG9jaXR5IiwiZ2V0RGlyZWN0aW9uIiwiZ2V0RGlzdGFuY2UiLCJnZXRBbmdsZSIsImdldFJvdGF0aW9uIiwiZ2V0U2NhbGUiLCJUb3VjaElucHV0IiwiVG91Y2hJbnB1dC5jb25zdHJ1Y3RvciIsIlRvdWNoSW5wdXQuaGFuZGxlciIsImdldFRvdWNoZXMiLCJSZWNvZ25pemVyIiwiUmVjb2duaXplci5jb25zdHJ1Y3RvciIsIlJlY29nbml6ZXIuc2V0IiwiUmVjb2duaXplci5yZWNvZ25pemVXaXRoIiwiUmVjb2duaXplci5kcm9wUmVjb2duaXplV2l0aCIsIlJlY29nbml6ZXIucmVxdWlyZUZhaWx1cmUiLCJSZWNvZ25pemVyLmRyb3BSZXF1aXJlRmFpbHVyZSIsIlJlY29nbml6ZXIuaGFzUmVxdWlyZUZhaWx1cmVzIiwiUmVjb2duaXplci5jYW5SZWNvZ25pemVXaXRoIiwiUmVjb2duaXplci5lbWl0IiwiUmVjb2duaXplci5lbWl0LmVtaXQiLCJSZWNvZ25pemVyLnRyeUVtaXQiLCJSZWNvZ25pemVyLmNhbkVtaXQiLCJSZWNvZ25pemVyLnJlY29nbml6ZSIsIlJlY29nbml6ZXIucHJvY2VzcyIsIlJlY29nbml6ZXIuZ2V0VG91Y2hBY3Rpb24iLCJSZWNvZ25pemVyLnJlc2V0Iiwic3RhdGVTdHIiLCJzdGF0ZURlY29kZSIsImRpcmVjdGlvblN0ciIsImdldFJlY29nbml6ZXJCeU5hbWVJZk1hbmFnZXIiXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsSUFBTyxLQUFLLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFnQnZCLDRCQUFvQixH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QSxDQUFDQSxDQUFDQTtRQUNiQSxJQUFJQSxJQUFJQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUN6Q0EsSUFBSUEsU0FBU0EsR0FBR0EsMkJBQW1CQSxDQUFDQTtRQUNwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLFNBQVNBLElBQUlBLG9CQUFZQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLFNBQVNBLElBQUlBLHNCQUFjQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLFNBQVNBLElBQUlBLHVCQUFlQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLFNBQVNBLElBQUlBLHNCQUFjQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDbkJBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0pBLE1BQU1BLENBQUNBLDJCQUFtQkEsQ0FBQ0E7SUFDN0JBLENBQUNBO0FBQ0hBLENBQUNBO0FBU0QscUJBQTRCLEVBQUUsRUFBRSxFQUFFLEVBQUUsS0FBTTtJQUN0Q0MsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDVEEs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QSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO0lBQ2pDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSx3QkFBZ0JBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO0lBQ2xDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxxQkFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO0lBQy9CQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxtQkFBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO0lBQzdCQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSx1QkFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7SUFDakNBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLG9CQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5QkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0E7SUFDOUJBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0pBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBO0lBQzFCQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtBQUMxQkEsQ0FBQ0E7QUEzQmUsbUJBQVcsY0EyQjFCLENBQUE7QUFRRCxzQkFBNkIsU0FBaUI7SUFDNUNDLElBQUlBLEVBQUVBLEdBQWFBLEVBQUVBLENBQUNBO0lBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxzQkFBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO0lBQ2xCQSxDQUFDQTtJQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxvQkFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSxzQkFBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO0lBQ2xCQSxDQUFDQTtJQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxHQUFHQSx1QkFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDaENBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQ25CQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtBQUN0QkEsQ0FBQ0E7QUFmZSxvQkFBWSxlQWUzQixDQUFBO0FBUUQsc0NBQXNDLFVBQXVCLEVBQUUsT0FBNEI7SUFDdkZDLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1FBQ1pBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO0lBQzNDQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtBQUN0QkEsQ0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVG91Y2gge1xuICBjbGllbnRYOiBudW1iZXI7XG4gIGNsaWVudFk6IG51bWJlcjtcbiAgcGFnZVg6IG51bWJlcjtcbiAgcGFnZVk6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUb3VjaEV2ZW50IGV4dGVuZHMgRXZlbnQge1xuICB0eXBlOiBzdHJpbmc7XG4gIHRvdWNoZXM6IFRvdWNoW107XG4gIGNoYW5nZWRUb3VjaGVzOiBUb3VjaFtdO1xufVxuXG4vLyBtYWdpY2FsIHRvdWNoQWN0aW9uIHZhbHVlXG5leHBvcnQgdmFyIFRPVUNIX0FDVElPTl9DT01QVVRFID0gJ2NvbXB1dGUnO1xuZXhwb3J0IHZhciBUT1VDSF9BQ1RJT05fQVVUTyA9ICdhdXRvJztcbmV4cG9ydCB2YXIgVE9VQ0hfQUNUSU9OX01BTklQVUxBVElPTiA9ICdtYW5pcHVsYXRpb24nOyAvLyBub3QgaW1wbGVtZW50ZWRcbmV4cG9ydCB2YXIgVE9VQ0hfQUNUSU9OX05PTkUgPSAnbm9uZSc7XG5leHBvcnQgdmFyIFRPVUNIX0FDVElPTl9QQU5fWCA9ICdwYW4teCc7XG5leHBvcnQgdmFyIFRPVUNIX0FDVElPTl9QQU5fWSA9ICdwYW4teSc7XG5cbnZhciBTVE9QID0gMTtcbnZhciBGT1JDRURfU1RPUCA9IDI7XG5cbmV4cG9ydCBjbGFzcyBWZWN0b3JFMiB7XG4gIHB1YmxpYyB4O1xuICBwdWJsaWMgeTtcbiAgY29uc3RydWN0b3IoeDogbnVtYmVyLCB5Om51bWJlcikge1xuICAgIHRoaXMueCA9IHg7XG4gICAgdGhpcy55ID0geTtcbiAgfVxuICBhZGQob3RoZXI6IFZlY3RvckUyKTogVmVjdG9yRTIge1xuICAgIHJldHVybiBuZXcgVmVjdG9yRTIodGhpcy54ICsgb3RoZXIueCwgdGhpcy55ICsgb3RoZXIueSk7XG4gIH1cbiAgc3ViKG90aGVyOiBWZWN0b3JFMik6IFZlY3RvckUyIHtcbiAgICByZXR1cm4gbmV3IFZlY3RvckUyKHRoaXMueCAtIG90aGVyLngsIHRoaXMueSAtIG90aGVyLnkpO1xuICB9XG4gIGRpdihvdGhlcjogbnVtYmVyKTogVmVjdG9yRTIge1xuICAgIHJldHVybiBuZXcgVmVjdG9yRTIodGhpcy54IC8gb3RoZXIsIHRoaXMueSAvIG90aGVyKTtcbiAgfVxuICBkb3Qob3RoZXI6IFZlY3RvckUyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy54ICogb3RoZXIueCArIHRoaXMueSAqIG90aGVyLnk7XG4gIH1cbiAgbm9ybSgpOiBudW1iZXIge1xuICAgIHJldHVybiBNYXRoLnNxcnQodGhpcy5xdWFkcmFuY2UoKSk7XG4gIH1cbiAgcXVhZHJhbmNlKCk6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMueCAqIHRoaXMueCArIHRoaXMueSAqIHRoaXMueTtcbiAgfVxuICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiAnVmVjdG9yRTIoJyArIHRoaXMueCArICcsICcgKyB0aGlzLnkgKyAnKSc7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIENsaWVudExvY2F0aW9uIHtcbiAgcHVibGljIGNsaWVudFg7XG4gIHB1YmxpYyBjbGllbnRZO1xuICBjb25zdHJ1Y3RvcihjbGllbnRYOiBudW1iZXIsIGNsaWVudFk6IG51bWJlcikge1xuICAgIHRoaXMuY2xpZW50WCA9IGNsaWVudFg7XG4gICAgdGhpcy5jbGllbnRZID0gY2xpZW50WTtcbiAgfVxuICBtb3ZlVG8oY2xpZW50WDogbnVtYmVyLCBjbGllbnRZOiBudW1iZXIpIHtcbiAgICB0aGlzLmNsaWVudFggPSBjbGllbnRYO1xuICAgIHRoaXMuY2xpZW50WSA9IGNsaWVudFk7XG4gIH1cbiAgc3ViKG90aGVyOiBDbGllbnRMb2NhdGlvbik6IFZlY3RvckUyIHtcbiAgICByZXR1cm4gbmV3IFZlY3RvckUyKHRoaXMuY2xpZW50WCAtIG90aGVyLmNsaWVudFgsIHRoaXMuY2xpZW50WSAtIG90aGVyLmNsaWVudFkpO1xuICB9XG4gIHN0YXRpYyBmcm9tVG91Y2godG91Y2g6IHsgY2xpZW50WDogbnVtYmVyOyBjbGllbnRZOiBudW1iZXJ9KSB7XG4gICAgcmV0dXJuIG5ldyBDbGllbnRMb2NhdGlvbih0b3VjaC5jbGllbnRYLCB0b3VjaC5jbGllbnRZKTtcbiAgfVxuICB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiAnQ2xpZW50TG9jYXRpb24oJyArIHRoaXMuY2xpZW50WCArICcsICcgKyB0aGlzLmNsaWVudFkgKyAnKSc7XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcHV0ZWRFdmVudCB7XG4gIGV2ZW50VHlwZTogbnVtYmVyO1xuICB0b3VjaGVzTGVuZ3RoOiBudW1iZXI7XG4gIHRpbWVTdGFtcDogbnVtYmVyO1xuICBjZW50ZXI6IENsaWVudExvY2F0aW9uO1xuICByb3RhdGlvbjogbnVtYmVyO1xuICBkZWx0YVRpbWU6IG51bWJlcjtcbiAgZGlzdGFuY2U6IG51bWJlcjtcbiAgbW92ZW1lbnQ6IFZlY3RvckUyO1xuICBkaXJlY3Rpb246IG51bWJlcjtcbiAgc2NhbGU6IG51bWJlcjtcbiAgdmVsb2NpdHk6IFZlY3RvckUyO1xufVxuXG4vKipcbiAqIE1haW50YWlucyB0aGUgaGlzdG9yeSBvZiBldmVudHMgZm9yIGEgZ2VzdHVyZSByZWNvZ25pdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlc3Npb24ge1xuICBwdWJsaWMgc3RhcnRUaW1lOiBudW1iZXI7XG4gIHB1YmxpYyBzdG9wcGVkOiBudW1iZXI7XG4gIHB1YmxpYyBjdXJSZWNvZ25pemVyOiBJUmVjb2duaXplcjtcbiAgcHJpdmF0ZSBjb21wRXZlbnRzOiBJQ29tcHV0ZWRFdmVudFtdID0gW107XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMucmVzZXQoKTtcbiAgfVxuICByZXNldCgpOiB2b2lkIHtcbiAgICB0aGlzLnN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgdGhpcy5jb21wRXZlbnRzID0gW107XG4gICAgdGhpcy5jdXJSZWNvZ25pemVyID0gdW5kZWZpbmVkO1xuICB9XG4gIHB1c2goY29tcEV2ZW50OiBJQ29tcHV0ZWRFdmVudCk6IHZvaWQge1xuICAgIHRoaXMuY29tcEV2ZW50cy5wdXNoKGNvbXBFdmVudCk7XG4gIH1cbiAgY29tcHV0ZU1vdmVtZW50KGNlbnRlcjogQ2xpZW50TG9jYXRpb24pOiBWZWN0b3JFMiB7XG4gICAgaWYgKGNlbnRlcikge1xuICAgICAgaWYgKHRoaXMuY29tcEV2ZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBwcmV2OiBJQ29tcHV0ZWRFdmVudCA9IHRoaXMuY29tcEV2ZW50c1t0aGlzLmNvbXBFdmVudHMubGVuZ3RoIC0gMV07XG4gICAgICAgIHJldHVybiBjZW50ZXIuc3ViKHByZXYuY2VudGVyKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGNvbXB1dGVWZWxvY2l0eShjZW50ZXI6IENsaWVudExvY2F0aW9uLCBkZWx0YVRpbWU6IG51bWJlcik6IFZlY3RvckUyIHtcbiAgICBpZiAoY2VudGVyKSB7XG4gICAgICBpZiAodGhpcy5jb21wRXZlbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIHByZXY6IElDb21wdXRlZEV2ZW50ID0gdGhpcy5jb21wRXZlbnRzW3RoaXMuY29tcEV2ZW50cy5sZW5ndGggLSAxXTtcbiAgICAgICAgcmV0dXJuIGNlbnRlci5zdWIocHJldi5jZW50ZXIpLmRpdihkZWx0YVRpbWUgLSBwcmV2LmRlbHRhVGltZSk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbn1cblxufVxuXG4vKipcbiAqIFRoZSBjb250cmFjdCBmb3Igd2hhdCB0aGUgTWFuYWdlciByZXF1aXJlcyBmcm9tIGEgUmVjb2duaXplci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUmVjb2duaXplciB7XG4gIGV2ZW50TmFtZTogc3RyaW5nO1xuICBjYW5SZWNvZ25pemVXaXRoKHJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogYm9vbGVhbjtcbiAgcmVjb2duaXplV2l0aChyZWNvZ25pemVyOiBJUmVjb2duaXplcik6IElSZWNvZ25pemVyO1xuICByZXF1aXJlRmFpbHVyZShyZWNvZ25pemVyOiBJUmVjb2duaXplcik6IElSZWNvZ25pemVyO1xuICByZWNvZ25pemUoaW5wdXREYXRhOiBJQ29tcHV0ZWRFdmVudCk6IHZvaWQ7XG4gIHJlc2V0KCk6IHZvaWQ7XG4gIHN0YXRlOiBudW1iZXI7XG4gIG1hbmFnZXI6IElSZWNvZ25pemVyQ2FsbGJhY2s7XG4gIGlkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlY29nbml6ZXJDYWxsYmFjayB7XG4gIGVtaXQoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/KTtcbiAgZ2V0KGV2ZW50TmFtZTogc3RyaW5nKTogSVJlY29nbml6ZXI7XG4gIHVwZGF0ZVRvdWNoQWN0aW9uKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VyIGltcGxlbWVudHMgSVJlY29nbml6ZXJDYWxsYmFjayB7XG4gIHB1YmxpYyBoYW5kbGVycyA9IHt9O1xuICBwdWJsaWMgc2Vzc2lvbiA9IG5ldyBTZXNzaW9uKCk7XG4gIHB1YmxpYyByZWNvZ25pemVyczogSVJlY29nbml6ZXJbXSA9IFtdO1xuICBwdWJsaWMgZWxlbWVudDtcbiAgcHVibGljIGlucHV0O1xuICBwcml2YXRlIHRvdWNoQWN0aW9uOiBUb3VjaEFjdGlvbjtcbiAgLy8gVGhlIGZvbGxvd2luZyBwcm9wZXJ0aWVzIGFyZSBkZWZhdWx0cy5cbiAgcHJpdmF0ZSBkb21FdmVudHMgPSBmYWxzZTtcbiAgcHVibGljIGVuYWJsZSA9IHRydWU7ICAvLyBXaGF0IGRvZXMgdGhpcyBlbmFibGU/XG4gIHB1YmxpYyBpbnB1dFRhcmdldDtcbiAgcHJpdmF0ZSBjc3NQcm9wcyA9IHt9O1xuICBwcml2YXRlIGNhbGxiYWNrOiBJUmVjb2duaXplckNhbGxiYWNrO1xuICAvKipcbiAgICogTWFuYWdlclxuICAgKiBAcGFyYW0ge0hUTUxFbGVtZW50fSBlbGVtZW50XG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKi9cbiAgY29uc3RydWN0b3IoZWxlbWVudDogSFRNTEVsZW1lbnQpIHtcbiAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgIHRoaXMuaW5wdXRUYXJnZXQgPSBlbGVtZW50OyAvLyBXaHkgd291bGQgdGhpcyBiZSBkaWZmZXJlbnQ/XG4gICAgdGhpcy5pbnB1dCA9IG5ldyBUb3VjaElucHV0KHRoaXMsIGlucHV0SGFuZGxlcik7XG4gICAgdGhpcy50b3VjaEFjdGlvbiA9IG5ldyBUb3VjaEFjdGlvbih0aGlzLCBUT1VDSF9BQ1RJT05fQ09NUFVURSk7XG4gICAgdGhpcy50b2dnbGVDc3NQcm9wcyh0cnVlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdG9wIHJlY29nbml6aW5nIGZvciB0aGlzIHNlc3Npb24uXG4gICAqIFRoaXMgc2Vzc2lvbiB3aWxsIGJlIGRpc2NhcmRlZCwgd2hlbiBhIG5ldyBbaW5wdXRdc3RhcnQgZXZlbnQgaXMgZmlyZWQuXG4gICAqIFdoZW4gZm9yY2VkLCB0aGUgcmVjb2duaXplciBjeWNsZSBpcyBzdG9wcGVkIGltbWVkaWF0ZWx5LlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtmb3JjZV1cbiAgICovXG4gIHN0b3AoZm9yY2U6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnNlc3Npb24uc3RvcHBlZCA9IGZvcmNlID8gRk9SQ0VEX1NUT1AgOiBTVE9QO1xuICB9XG5cbiAgLyoqXG4gICAqIHJ1biB0aGUgcmVjb2duaXplcnMhXG4gICAqIGNhbGxlZCBieSB0aGUgaW5wdXRIYW5kbGVyIGZ1bmN0aW9uIG9uIGV2ZXJ5IG1vdmVtZW50IG9mIHRoZSBwb2ludGVycyAodG91Y2hlcylcbiAgICogaXQgd2Fsa3MgdGhyb3VnaCBhbGwgdGhlIHJlY29nbml6ZXJzIGFuZCB0cmllcyB0byBkZXRlY3QgdGhlIGdlc3R1cmUgdGhhdCBpcyBiZWluZyBtYWRlXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dERhdGFcbiAgICovXG4gIHJlY29nbml6ZShpbnB1dERhdGE6IElDb21wdXRlZEV2ZW50LCB0b3VjaEV2ZW50OiBUb3VjaEV2ZW50KTogdm9pZCB7XG4gICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgaWYgKHNlc3Npb24uc3RvcHBlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIHJ1biB0aGUgdG91Y2gtYWN0aW9uIHBvbHlmaWxsXG4gICAgdGhpcy50b3VjaEFjdGlvbi5wcmV2ZW50RGVmYXVsdHMoaW5wdXREYXRhLCB0b3VjaEV2ZW50KTtcblxuICAgIHZhciByZWNvZ25pemVyOiBJUmVjb2duaXplcjtcbiAgICB2YXIgcmVjb2duaXplcnMgPSB0aGlzLnJlY29nbml6ZXJzO1xuXG4gICAgLy8gdGhpcyBob2xkcyB0aGUgcmVjb2duaXplciB0aGF0IGlzIGJlaW5nIHJlY29nbml6ZWQuXG4gICAgLy8gc28gdGhlIHJlY29nbml6ZXIncyBzdGF0ZSBuZWVkcyB0byBiZSBCRUdBTiwgQ0hBTkdFRCwgRU5ERUQgb3IgUkVDT0dOSVpFRFxuICAgIC8vIGlmIG5vIHJlY29nbml6ZXIgaXMgZGV0ZWN0aW5nIGEgdGhpbmcsIGl0IGlzIHNldCB0byBgbnVsbGBcbiAgICB2YXIgY3VyUmVjb2duaXplciA9IHNlc3Npb24uY3VyUmVjb2duaXplcjtcblxuICAgIC8vIHJlc2V0IHdoZW4gdGhlIGxhc3QgcmVjb2duaXplciBpcyByZWNvZ25pemVkXG4gICAgLy8gb3Igd2hlbiB3ZSdyZSBpbiBhIG5ldyBzZXNzaW9uXG4gICAgaWYgKCFjdXJSZWNvZ25pemVyIHx8IChjdXJSZWNvZ25pemVyICYmIGN1clJlY29nbml6ZXIuc3RhdGUgJiBTVEFURV9SRUNPR05JWkVEKSkge1xuICAgICAgICBjdXJSZWNvZ25pemVyID0gc2Vzc2lvbi5jdXJSZWNvZ25pemVyID0gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgaSA9IDA7XG4gICAgd2hpbGUgKGkgPCByZWNvZ25pemVycy5sZW5ndGgpIHtcbiAgICAgIHJlY29nbml6ZXIgPSByZWNvZ25pemVyc1tpXTtcblxuICAgICAgLy8gZmluZCBvdXQgaWYgd2UgYXJlIGFsbG93ZWQgdHJ5IHRvIHJlY29nbml6ZSB0aGUgaW5wdXQgZm9yIHRoaXMgb25lLlxuICAgICAgLy8gMS4gICBhbGxvdyBpZiB0aGUgc2Vzc2lvbiBpcyBOT1QgZm9yY2VkIHN0b3BwZWQgKHNlZSB0aGUgLnN0b3AoKSBtZXRob2QpXG4gICAgICAvLyAyLiAgIGFsbG93IGlmIHdlIHN0aWxsIGhhdmVuJ3QgcmVjb2duaXplZCBhIGdlc3R1cmUgaW4gdGhpcyBzZXNzaW9uLCBvciB0aGUgdGhpcyByZWNvZ25pemVyIGlzIHRoZSBvbmVcbiAgICAgIC8vICAgICAgdGhhdCBpcyBiZWluZyByZWNvZ25pemVkLlxuICAgICAgLy8gMy4gICBhbGxvdyBpZiB0aGUgcmVjb2duaXplciBpcyBhbGxvd2VkIHRvIHJ1biBzaW11bHRhbmVvdXMgd2l0aCB0aGUgY3VycmVudCByZWNvZ25pemVkIHJlY29nbml6ZXIuXG4gICAgICAvLyAgICAgIHRoaXMgY2FuIGJlIHNldHVwIHdpdGggdGhlIGByZWNvZ25pemVXaXRoKClgIG1ldGhvZCBvbiB0aGUgcmVjb2duaXplci5cbiAgICAgIGlmIChzZXNzaW9uLnN0b3BwZWQgIT09IEZPUkNFRF9TVE9QICYmICggLy8gMVxuICAgICAgICAgICAgICAhY3VyUmVjb2duaXplciB8fCByZWNvZ25pemVyID09IGN1clJlY29nbml6ZXIgfHwgLy8gMlxuICAgICAgICAgICAgICByZWNvZ25pemVyLmNhblJlY29nbml6ZVdpdGgoY3VyUmVjb2duaXplcikpKSB7IC8vIDNcblxuICAgICAgICAgIHJlY29nbml6ZXIucmVjb2duaXplKGlucHV0RGF0YSk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcmVjb2duaXplci5yZXNldCgpO1xuICAgICAgfVxuXG4gICAgICAvLyBpZiB0aGUgcmVjb2duaXplciBoYXMgYmVlbiByZWNvZ25pemluZyB0aGUgaW5wdXQgYXMgYSB2YWxpZCBnZXN0dXJlLCB3ZSB3YW50IHRvIHN0b3JlIHRoaXMgb25lIGFzIHRoZVxuICAgICAgLy8gY3VycmVudCBhY3RpdmUgcmVjb2duaXplci4gYnV0IG9ubHkgaWYgd2UgZG9uJ3QgYWxyZWFkeSBoYXZlIGFuIGFjdGl2ZSByZWNvZ25pemVyXG4gICAgICBpZiAoIWN1clJlY29nbml6ZXIgJiYgcmVjb2duaXplci5zdGF0ZSAmIChTVEFURV9CRUdBTiB8IFNUQVRFX0NIQU5HRUQgfCBTVEFURV9SRUNPR05JWkVEKSkge1xuICAgICAgICAgIGN1clJlY29nbml6ZXIgPSBzZXNzaW9uLmN1clJlY29nbml6ZXIgPSByZWNvZ25pemVyO1xuICAgICAgfVxuICAgICAgaSsrO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBnZXQgYSByZWNvZ25pemVyIGJ5IGl0cyBldmVudCBuYW1lLlxuICAgKi9cbiAgZ2V0KGV2ZW50TmFtZTogc3RyaW5nKTogSVJlY29nbml6ZXIge1xuICAgIHZhciByZWNvZ25pemVycyA9IHRoaXMucmVjb2duaXplcnM7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWNvZ25pemVycy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHJlY29nbml6ZXJzW2ldLmV2ZW50TmFtZSA9PT0gZXZlbnROYW1lKSB7XG4gICAgICAgIHJldHVybiByZWNvZ25pemVyc1tpXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvKipcbiAgICogYWRkIGEgcmVjb2duaXplciB0byB0aGUgbWFuYWdlclxuICAgKiBleGlzdGluZyByZWNvZ25pemVycyB3aXRoIHRoZSBzYW1lIGV2ZW50IG5hbWUgd2lsbCBiZSByZW1vdmVkXG4gICAqIEBwYXJhbSB7UmVjb2duaXplcn0gcmVjb2duaXplclxuICAgKi9cbiAgYWRkKHJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogSVJlY29nbml6ZXIge1xuICAgIHZhciBleGlzdGluZyA9IHRoaXMuZ2V0KHJlY29nbml6ZXIuZXZlbnROYW1lKTtcbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHRoaXMucmVtb3ZlKGV4aXN0aW5nKTtcbiAgICB9XG5cbiAgICB0aGlzLnJlY29nbml6ZXJzLnB1c2gocmVjb2duaXplcik7XG4gICAgcmVjb2duaXplci5tYW5hZ2VyID0gdGhpcztcblxuICAgIHRoaXMudG91Y2hBY3Rpb24udXBkYXRlKCk7XG4gICAgcmV0dXJuIHJlY29nbml6ZXI7XG4gIH1cblxuICAvKipcbiAgICogcmVtb3ZlIGEgcmVjb2duaXplciBieSBuYW1lIG9yIGluc3RhbmNlXG4gICAqIEBwYXJhbSB7UmVjb2duaXplcnxTdHJpbmd9IHJlY29nbml6ZXJcbiAgICogQHJldHVybnMge01hbmFnZXJ9XG4gICAqL1xuICByZW1vdmUocmVjb2duaXplcjogSVJlY29nbml6ZXIpIHtcbiAgICAgIHZhciByZWNvZ25pemVycyA9IHRoaXMucmVjb2duaXplcnM7XG4gICAgICByZWNvZ25pemVyID0gdGhpcy5nZXQocmVjb2duaXplci5ldmVudE5hbWUpO1xuICAgICAgcmVjb2duaXplcnMuc3BsaWNlKHV0aWxzLmluQXJyYXkocmVjb2duaXplcnMsIHJlY29nbml6ZXIpLCAxKTtcblxuICAgICAgdGhpcy50b3VjaEFjdGlvbi51cGRhdGUoKTtcbiAgICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIGJpbmQgZXZlbnRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50c1xuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBoYW5kbGVyXG4gICAqIEByZXR1cm5zIHtFdmVudEVtaXR0ZXJ9IHRoaXNcbiAgICovXG4gIG9uKGV2ZW50czogc3RyaW5nLCBoYW5kbGVyKTogTWFuYWdlciB7XG4gICAgICB2YXIgaGFuZGxlcnMgPSB0aGlzLmhhbmRsZXJzO1xuICAgICAgdXRpbHMuZWFjaCh1dGlscy5zcGxpdFN0cihldmVudHMpLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgIGhhbmRsZXJzW2V2ZW50XSA9IGhhbmRsZXJzW2V2ZW50XSB8fCBbXTtcbiAgICAgICAgICBoYW5kbGVyc1tldmVudF0ucHVzaChoYW5kbGVyKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogdW5iaW5kIGV2ZW50LCBsZWF2ZSBlbWl0IGJsYW5rIHRvIHJlbW92ZSBhbGwgaGFuZGxlcnNcbiAgICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50c1xuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbaGFuZGxlcl1cbiAgICogQHJldHVybnMge0V2ZW50RW1pdHRlcn0gdGhpc1xuICAgKi9cbiAgb2ZmKGV2ZW50czogc3RyaW5nLCBoYW5kbGVyKTogTWFuYWdlciB7XG4gICAgdmFyIGhhbmRsZXJzID0gdGhpcy5oYW5kbGVycztcbiAgICB1dGlscy5lYWNoKHV0aWxzLnNwbGl0U3RyKGV2ZW50cyksIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICBpZiAoIWhhbmRsZXIpIHtcbiAgICAgICAgICBkZWxldGUgaGFuZGxlcnNbZXZlbnRdO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgICAgaGFuZGxlcnNbZXZlbnRdLnNwbGljZSh1dGlscy5pbkFycmF5KGhhbmRsZXJzW2V2ZW50XSwgaGFuZGxlciksIDEpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIGVtaXQgZXZlbnQgdG8gdGhlIGxpc3RlbmVyc1xuICAgKiBAcGFyYW0ge1N0cmluZ30gZXZlbnRcbiAgICogQHBhcmFtIHtJQ29tcHV0ZWRFdmVudH0gZGF0YVxuICAgKi9cbiAgZW1pdChldmVudE5hbWU6IHN0cmluZywgZGF0YTogRXZlbnQpIHtcbiAgICAgIC8vIHdlIGFsc28gd2FudCB0byB0cmlnZ2VyIGRvbSBldmVudHNcbiAgICAgIGlmICh0aGlzLmRvbUV2ZW50cykge1xuICAgICAgICAgIHRyaWdnZXJEb21FdmVudChldmVudCwgZGF0YSk7XG4gICAgICB9XG5cbiAgICAgIC8vIG5vIGhhbmRsZXJzLCBzbyBza2lwIGl0IGFsbFxuICAgICAgdmFyIGhhbmRsZXJzID0gdGhpcy5oYW5kbGVyc1tldmVudE5hbWVdICYmIHRoaXMuaGFuZGxlcnNbZXZlbnROYW1lXS5zbGljZSgpO1xuICAgICAgaWYgKCFoYW5kbGVycyB8fCAhaGFuZGxlcnMubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBNYWtlIGl0IGxvb2sgbGlrZSBhIG5vcm1hbCBET00gZXZlbnQ/XG4gICAgICAvKlxuICAgICAgZGF0YS50eXBlID0gZXZlbnROYW1lO1xuICAgICAgZGF0YS5wcmV2ZW50RGVmYXVsdCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBkYXRhLnNyY0V2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICB9O1xuICAgICAgKi9cblxuICAgICAgdmFyIGkgPSAwO1xuICAgICAgd2hpbGUgKGkgPCBoYW5kbGVycy5sZW5ndGgpIHtcbiAgICAgICAgaGFuZGxlcnNbaV0oZGF0YSk7XG4gICAgICAgIGkrKztcbiAgICAgIH1cbiAgfVxuXG4gIHVwZGF0ZVRvdWNoQWN0aW9uKCk6IHZvaWQge1xuICAgIHRoaXMudG91Y2hBY3Rpb24udXBkYXRlKCk7XG4gIH1cblxuICAvKipcbiAgICogZGVzdHJveSB0aGUgbWFuYWdlciBhbmQgdW5iaW5kcyBhbGwgZXZlbnRzXG4gICAqIGl0IGRvZXNuJ3QgdW5iaW5kIGRvbSBldmVudHMsIHRoYXQgaXMgdGhlIHVzZXIgb3duIHJlc3BvbnNpYmlsaXR5XG4gICAqL1xuICBkZXN0cm95KCkge1xuICAgICAgdGhpcy5lbGVtZW50ICYmIHRoaXMudG9nZ2xlQ3NzUHJvcHMoZmFsc2UpO1xuXG4gICAgICB0aGlzLmhhbmRsZXJzID0ge307XG4gICAgICB0aGlzLnNlc3Npb24gPSB1bmRlZmluZWQ7XG4gICAgICB0aGlzLmlucHV0LmRlc3Ryb3koKTtcbiAgICAgIHRoaXMuZWxlbWVudCA9IG51bGw7XG4gIH1cbiAgXG4gIHRvZ2dsZUNzc1Byb3BzKGFkZDogYm9vbGVhbikge1xuICAgIGlmICghdGhpcy5lbGVtZW50LnN0eWxlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIGVsZW1lbnQgPSB0aGlzLmVsZW1lbnQ7XG4gICAgdXRpbHMuZWFjaCh0aGlzLmNzc1Byb3BzLCBmdW5jdGlvbih2YWx1ZSwgbmFtZSkge1xuICAgICAgZWxlbWVudC5zdHlsZVt1dGlscy5wcmVmaXhlZChlbGVtZW50LnN0eWxlLCBuYW1lKV0gPSBhZGQgPyB2YWx1ZSA6ICcnO1xuICAgIH0pO1xuICB9XG5cbiAgY2FuY2VsQ29udGV4dE1lbnUoKTogdm9pZCB7XG4gIH1cbn1cblxuLyoqXG4gKiB0cmlnZ2VyIGRvbSBldmVudFxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50XG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YVxuICovXG5mdW5jdGlvbiB0cmlnZ2VyRG9tRXZlbnQoZXZlbnQsIGRhdGEpIHtcbiAgdmFyIGdlc3R1cmVFdmVudCA9IGRvY3VtZW50LmNyZWF0ZUV2ZW50KCdFdmVudCcpO1xuICBnZXN0dXJlRXZlbnQuaW5pdEV2ZW50KGV2ZW50LCB0cnVlLCB0cnVlKTtcbiAgZ2VzdHVyZUV2ZW50WydnZXN0dXJlJ10gPSBkYXRhO1xuICBkYXRhLnRhcmdldC5kaXNwYXRjaEV2ZW50KGdlc3R1cmVFdmVudCk7XG59XG5cbnZhciBNT0JJTEVfUkVHRVggPSAvbW9iaWxlfHRhYmxldHxpcChhZHxob25lfG9kKXxhbmRyb2lkL2k7XG5cbnZhciBTVVBQT1JUX1RPVUNIID0gKCdvbnRvdWNoc3RhcnQnIGluIHdpbmRvdyk7XG52YXIgU1VQUE9SVF9QT0lOVEVSX0VWRU5UUyA9IHV0aWxzLnByZWZpeGVkKHdpbmRvdywgJ1BvaW50ZXJFdmVudCcpICE9PSB1bmRlZmluZWQ7XG52YXIgU1VQUE9SVF9PTkxZX1RPVUNIID0gU1VQUE9SVF9UT1VDSCAmJiBNT0JJTEVfUkVHRVgudGVzdChuYXZpZ2F0b3IudXNlckFnZW50KTtcblxudmFyIFBSRUZJWEVEX1RPVUNIX0FDVElPTiA9IHV0aWxzLnByZWZpeGVkKHV0aWxzLlRFU1RfRUxFTUVOVC5zdHlsZSwgJ3RvdWNoQWN0aW9uJyk7XG52YXIgTkFUSVZFX1RPVUNIX0FDVElPTiA9IFBSRUZJWEVEX1RPVUNIX0FDVElPTiAhPT0gdW5kZWZpbmVkO1xuXG5jbGFzcyBUb3VjaEFjdGlvbiB7XG4gIHB1YmxpYyBtYW5hZ2VyOiBNYW5hZ2VyO1xuICBwdWJsaWMgYWN0aW9uczogc3RyaW5nO1xuICBwcml2YXRlIHByZXZlbnRlZDtcbiAgLyoqXG4gICAqIFRvdWNoIEFjdGlvblxuICAgKiBzZXRzIHRoZSB0b3VjaEFjdGlvbiBwcm9wZXJ0eSBvciB1c2VzIHRoZSBqcyBhbHRlcm5hdGl2ZVxuICAgKiBAcGFyYW0ge01hbmFnZXJ9IG1hbmFnZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IHZhbHVlXG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKi9cbiAgY29uc3RydWN0b3IobWFuYWdlcjogTWFuYWdlciwgdmFsdWU6IHN0cmluZykge1xuICAgICAgdGhpcy5tYW5hZ2VyID0gbWFuYWdlcjtcbiAgICAgIHRoaXMuc2V0KHZhbHVlKTtcbiAgfVxuICAgIC8qKlxuICAgICAqIHNldCB0aGUgdG91Y2hBY3Rpb24gdmFsdWUgb24gdGhlIGVsZW1lbnQgb3IgZW5hYmxlIHRoZSBwb2x5ZmlsbFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB2YWx1ZVxuICAgICAqL1xuICAgIHNldCh2YWx1ZTogc3RyaW5nKSB7XG4gICAgICAgIC8vIGZpbmQgb3V0IHRoZSB0b3VjaC1hY3Rpb24gYnkgdGhlIGV2ZW50IGhhbmRsZXJzXG4gICAgICAgIGlmICh2YWx1ZSA9PT0gVE9VQ0hfQUNUSU9OX0NPTVBVVEUpIHtcbiAgICAgICAgICAgIHZhbHVlID0gdGhpcy5jb21wdXRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoTkFUSVZFX1RPVUNIX0FDVElPTiAmJiB0aGlzLm1hbmFnZXIuZWxlbWVudC5zdHlsZSkge1xuICAgICAgICAgICAgdGhpcy5tYW5hZ2VyLmVsZW1lbnQuc3R5bGVbUFJFRklYRURfVE9VQ0hfQUNUSU9OXSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuYWN0aW9ucyA9IHZhbHVlLnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGp1c3QgcmUtc2V0IHRoZSB0b3VjaEFjdGlvbiB2YWx1ZVxuICAgICAqL1xuICAgIHVwZGF0ZSgpIHtcbiAgICAgIHRoaXMuc2V0KFRPVUNIX0FDVElPTl9DT01QVVRFKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBjb21wdXRlIHRoZSB2YWx1ZSBmb3IgdGhlIHRvdWNoQWN0aW9uIHByb3BlcnR5IGJhc2VkIG9uIHRoZSByZWNvZ25pemVyJ3Mgc2V0dGluZ3NcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSB2YWx1ZVxuICAgICAqL1xuICAgIGNvbXB1dGUoKSB7XG4gICAgICAgIHZhciBhY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICAvLyBGSVhNRTogTWFrZSB0aGlzIHR5cGUtc2FmZSBhdXRvbWFnaWNhbGx5XG4gICAgICAgIHV0aWxzLmVhY2godGhpcy5tYW5hZ2VyLnJlY29nbml6ZXJzLCBmdW5jdGlvbihyZWNvZ25pemVyOiBSZWNvZ25pemVyKSB7XG4gICAgICAgICAgICBpZiAocmVjb2duaXplci5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgYWN0aW9ucyA9IGFjdGlvbnMuY29uY2F0KHJlY29nbml6ZXIuZ2V0VG91Y2hBY3Rpb24oKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gY2xlYW5Ub3VjaEFjdGlvbnMoYWN0aW9ucy5qb2luKCcgJykpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHRoaXMgbWV0aG9kIGlzIGNhbGxlZCBvbiBlYWNoIGlucHV0IGN5Y2xlIGFuZCBwcm92aWRlcyB0aGUgcHJldmVudGluZyBvZiB0aGUgYnJvd3NlciBiZWhhdmlvclxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dFxuICAgICAqL1xuICAgIHByZXZlbnREZWZhdWx0cyhpbnB1dDogSUNvbXB1dGVkRXZlbnQsIHRvdWNoRXZlbnQ6IFRvdWNoRXZlbnQpIHtcbiAgICAgICAgLy8gbm90IG5lZWRlZCB3aXRoIG5hdGl2ZSBzdXBwb3J0IGZvciB0aGUgdG91Y2hBY3Rpb24gcHJvcGVydHlcbiAgICAgICAgaWYgKE5BVElWRV9UT1VDSF9BQ1RJT04pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHZhciBkaXJlY3Rpb24gPSBpbnB1dC5vZmZzZXREaXJlY3Rpb247XG5cbiAgICAgICAgaWYgKHRoaXMucHJldmVudGVkKSB7XG4gICAgICAgICAgICB0b3VjaEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLypcbiAgICAgICAgdmFyIGFjdGlvbnMgPSB0aGlzLmFjdGlvbnM7XG4gICAgICAgIHZhciBoYXNOb25lID0gdXRpbHMuaW5TdHIoYWN0aW9ucywgVE9VQ0hfQUNUSU9OX05PTkUpO1xuICAgICAgICB2YXIgaGFzUGFuWSA9IHV0aWxzLmluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9QQU5fWSk7XG4gICAgICAgIHZhciBoYXNQYW5YID0gdXRpbHMuaW5TdHIoYWN0aW9ucywgVE9VQ0hfQUNUSU9OX1BBTl9YKTtcblxuICAgICAgICBpZiAoaGFzTm9uZSB8fFxuICAgICAgICAgICAgKGhhc1BhblkgJiYgZGlyZWN0aW9uICYgRElSRUNUSU9OX0hPUklaT05UQUwpIHx8XG4gICAgICAgICAgICAoaGFzUGFuWCAmJiBkaXJlY3Rpb24gJiBESVJFQ1RJT05fVkVSVElDQUwpKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wcmV2ZW50U3JjKHRvdWNoRXZlbnQpO1xuICAgICAgICB9XG4gICAgICAgICovXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogY2FsbCBwcmV2ZW50RGVmYXVsdCB0byBwcmV2ZW50IHRoZSBicm93c2VyJ3MgZGVmYXVsdCBiZWhhdmlvciAoc2Nyb2xsaW5nIGluIG1vc3QgY2FzZXMpXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHNyY0V2ZW50XG4gICAgICovXG4gICAgcHJldmVudFNyYyhzcmNFdmVudCkge1xuICAgICAgICB0aGlzLnByZXZlbnRlZCA9IHRydWU7XG4gICAgICAgIHNyY0V2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxufVxuXG4vKipcbiAqIHdoZW4gdGhlIHRvdWNoQWN0aW9ucyBhcmUgY29sbGVjdGVkIHRoZXkgYXJlIG5vdCBhIHZhbGlkIHZhbHVlLCBzbyB3ZSBuZWVkIHRvIGNsZWFuIHRoaW5ncyB1cC4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGFjdGlvbnNcbiAqIEByZXR1cm5zIHsqfVxuICovXG5mdW5jdGlvbiBjbGVhblRvdWNoQWN0aW9ucyhhY3Rpb25zOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIC8vIG5vbmVcbiAgICBpZiAodXRpbHMuaW5TdHIoYWN0aW9ucywgVE9VQ0hfQUNUSU9OX05PTkUpKSB7XG4gICAgICAgIHJldHVybiBUT1VDSF9BQ1RJT05fTk9ORTtcbiAgICB9XG5cbiAgICB2YXIgaGFzUGFuWCA9IHV0aWxzLmluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9QQU5fWCk7XG4gICAgdmFyIGhhc1BhblkgPSB1dGlscy5pblN0cihhY3Rpb25zLCBUT1VDSF9BQ1RJT05fUEFOX1kpO1xuXG4gICAgLy8gcGFuLXggYW5kIHBhbi15IGNhbiBiZSBjb21iaW5lZFxuICAgIGlmIChoYXNQYW5YICYmIGhhc1BhblkpIHtcbiAgICAgICAgcmV0dXJuIFRPVUNIX0FDVElPTl9QQU5fWCArICcgJyArIFRPVUNIX0FDVElPTl9QQU5fWTtcbiAgICB9XG5cbiAgICAvLyBwYW4teCBPUiBwYW4teVxuICAgIGlmIChoYXNQYW5YIHx8IGhhc1BhblkpIHtcbiAgICAgICAgcmV0dXJuIGhhc1BhblggPyBUT1VDSF9BQ1RJT05fUEFOX1ggOiBUT1VDSF9BQ1RJT05fUEFOX1k7XG4gICAgfVxuXG4gICAgLy8gbWFuaXB1bGF0aW9uXG4gICAgaWYgKHV0aWxzLmluU3RyKGFjdGlvbnMsIFRPVUNIX0FDVElPTl9NQU5JUFVMQVRJT04pKSB7XG4gICAgICAgIHJldHVybiBUT1VDSF9BQ1RJT05fTUFOSVBVTEFUSU9OO1xuICAgIH1cblxuICAgIHJldHVybiBUT1VDSF9BQ1RJT05fQVVUTztcbn1cblxuZXhwb3J0IHZhciBJTlBVVF9UWVBFX1RPVUNIID0gJ3RvdWNoJztcbmV4cG9ydCB2YXIgSU5QVVRfVFlQRV9QRU4gPSAncGVuJztcbmV4cG9ydCB2YXIgSU5QVVRfVFlQRV9NT1VTRSA9ICdtb3VzZSc7XG5leHBvcnQgdmFyIElOUFVUX1RZUEVfS0lORUNUID0gJ2tpbmVjdCc7XG5cbnZhciBDT01QVVRFX0lOVEVSVkFMID0gMjU7XG5cbmV4cG9ydCB2YXIgSU5QVVRfU1RBUlQgPSAxO1xuZXhwb3J0IHZhciBJTlBVVF9NT1ZFID0gMjtcbmV4cG9ydCB2YXIgSU5QVVRfRU5EID0gNDtcbmV4cG9ydCB2YXIgSU5QVVRfQ0FOQ0VMID0gODtcblxuZXhwb3J0IGZ1bmN0aW9uIGRlY29kZUV2ZW50VHlwZShldmVudFR5cGU6IG51bWJlcikge1xuICBzd2l0Y2goZXZlbnRUeXBlKSB7XG4gICAgY2FzZSBJTlBVVF9TVEFSVDoge1xuICAgICAgcmV0dXJuIFwiU1RBUlRcIjtcbiAgICB9XG4gICAgY2FzZSBJTlBVVF9NT1ZFOiB7XG4gICAgICByZXR1cm4gXCJNT1ZFXCI7XG4gICAgfVxuICAgIGNhc2UgSU5QVVRfRU5EOiB7XG4gICAgICByZXR1cm4gXCJFTkRcIjtcbiAgICB9XG4gICAgY2FzZSBJTlBVVF9DQU5DRUw6IHtcbiAgICAgIHJldHVybiBcIkNBTkNFTFwiO1xuICAgIH1cbiAgICBkZWZhdWx0IDoge1xuICAgICAgcmV0dXJuIFwiZXZlbnRUeXBlPVwiICsgZXZlbnRUeXBlO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgdmFyIERJUkVDVElPTl9VTkRFRklORUQgPSAwO1xuZXhwb3J0IHZhciBESVJFQ1RJT05fTEVGVCA9IDE7XG5leHBvcnQgdmFyIERJUkVDVElPTl9SSUdIVCA9IDI7XG5leHBvcnQgdmFyIERJUkVDVElPTl9VUCA9IDQ7XG5leHBvcnQgdmFyIERJUkVDVElPTl9ET1dOID0gODtcblxuZXhwb3J0IHZhciBESVJFQ1RJT05fSE9SSVpPTlRBTCA9IERJUkVDVElPTl9MRUZUIHwgRElSRUNUSU9OX1JJR0hUO1xuZXhwb3J0IHZhciBESVJFQ1RJT05fVkVSVElDQUwgPSBESVJFQ1RJT05fVVAgfCBESVJFQ1RJT05fRE9XTjtcbmV4cG9ydCB2YXIgRElSRUNUSU9OX0FMTCA9IERJUkVDVElPTl9IT1JJWk9OVEFMIHwgRElSRUNUSU9OX1ZFUlRJQ0FMO1xuXG52YXIgUFJPUFNfWFkgPSBbJ3gnLCAneSddO1xudmFyIFBST1BTX0NMSUVOVF9YWSA9IFsnY2xpZW50WCcsICdjbGllbnRZJ107XG5cbmNsYXNzIElucHV0IHtcbiAgcHVibGljIG1hbmFnZXI6IE1hbmFnZXI7XG4gIHB1YmxpYyBlbGVtZW50O1xuICBwdWJsaWMgdGFyZ2V0O1xuICBwdWJsaWMgZG9tSGFuZGxlcjtcbiAgcHJpdmF0ZSBldkVsO1xuICBwcml2YXRlIGV2VGFyZ2V0O1xuICBwcml2YXRlIGV2V2luO1xuICAvKipcbiAgICogY3JlYXRlIG5ldyBpbnB1dCB0eXBlIG1hbmFnZXJcbiAgICogQHBhcmFtIHtNYW5hZ2VyfSBtYW5hZ2VyXG4gICAqIEByZXR1cm5zIHtJbnB1dH1cbiAgICogQGNvbnN0cnVjdG9yXG4gICAqL1xuICBjb25zdHJ1Y3RvcihcbiAgICBtYW5hZ2VyOiBNYW5hZ2VyLFxuICAgIHRvdWNoRWxlbWVudEV2ZW50czogc3RyaW5nLFxuICAgIHRvdWNoVGFyZ2V0RXZlbnRzOiBzdHJpbmcsXG4gICAgdG91Y2hXaW5kb3dFdmVudHM6IHN0cmluZykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB0aGlzLm1hbmFnZXIgPSBtYW5hZ2VyO1xuICAgIHRoaXMuZXZFbCA9IHRvdWNoRWxlbWVudEV2ZW50cztcbiAgICB0aGlzLmV2VGFyZ2V0ID0gdG91Y2hUYXJnZXRFdmVudHM7XG4gICAgdGhpcy5ldldpbiA9IHRvdWNoV2luZG93RXZlbnRzO1xuICAgIHRoaXMuZWxlbWVudCA9IG1hbmFnZXIuZWxlbWVudDtcbiAgICB0aGlzLnRhcmdldCA9IG1hbmFnZXIuaW5wdXRUYXJnZXQ7XG5cbiAgICAvLyBzbWFsbGVyIHdyYXBwZXIgYXJvdW5kIHRoZSBoYW5kbGVyLCBmb3IgdGhlIHNjb3BlIGFuZCB0aGUgZW5hYmxlZCBzdGF0ZSBvZiB0aGUgbWFuYWdlcixcbiAgICAvLyBzbyB3aGVuIGRpc2FibGVkIHRoZSBpbnB1dCBldmVudHMgYXJlIGNvbXBsZXRlbHkgYnlwYXNzZWQuXG4gICAgdGhpcy5kb21IYW5kbGVyID0gZnVuY3Rpb24oZXZlbnQ6IFRvdWNoRXZlbnQpIHtcbiAgICAgIGlmIChtYW5hZ2VyLmVuYWJsZSkge1xuICAgICAgICBzZWxmLmhhbmRsZXIoZXZlbnQpO1xuICAgICAgfVxuICAgIH07XG5cbiAgICB0aGlzLmluaXQoKTtcbiAgfVxuICAvKipcbiAgICogc2hvdWxkIGhhbmRsZSB0aGUgaW5wdXRFdmVudCBkYXRhIGFuZCB0cmlnZ2VyIHRoZSBjYWxsYmFja1xuICAgKiBAdmlydHVhbFxuICAgKi9cbiAgaGFuZGxlcihldmVudDogYW55KSB7IH1cblxuICAvKipcbiAgICogYmluZCB0aGUgZXZlbnRzXG4gICAqL1xuICBpbml0KCkge1xuICAgICAgdGhpcy5ldkVsICYmIHV0aWxzLmFkZEV2ZW50TGlzdGVuZXJzKHRoaXMuZWxlbWVudCwgdGhpcy5ldkVsLCB0aGlzLmRvbUhhbmRsZXIpO1xuICAgICAgdGhpcy5ldlRhcmdldCAmJiB1dGlscy5hZGRFdmVudExpc3RlbmVycyh0aGlzLnRhcmdldCwgdGhpcy5ldlRhcmdldCwgdGhpcy5kb21IYW5kbGVyKTtcbiAgICAgIHRoaXMuZXZXaW4gJiYgdXRpbHMuYWRkRXZlbnRMaXN0ZW5lcnModXRpbHMuZ2V0V2luZG93Rm9yRWxlbWVudCh0aGlzLmVsZW1lbnQpLCB0aGlzLmV2V2luLCB0aGlzLmRvbUhhbmRsZXIpO1xuICB9XG5cbiAgLyoqXG4gICAqIHVuYmluZCB0aGUgZXZlbnRzXG4gICAqL1xuICBkZXN0cm95KCkge1xuICAgICAgdGhpcy5ldkVsICYmIHV0aWxzLnJlbW92ZUV2ZW50TGlzdGVuZXJzKHRoaXMuZWxlbWVudCwgdGhpcy5ldkVsLCB0aGlzLmRvbUhhbmRsZXIpO1xuICAgICAgdGhpcy5ldlRhcmdldCAmJiB1dGlscy5yZW1vdmVFdmVudExpc3RlbmVycyh0aGlzLnRhcmdldCwgdGhpcy5ldlRhcmdldCwgdGhpcy5kb21IYW5kbGVyKTtcbiAgICAgIHRoaXMuZXZXaW4gJiYgdXRpbHMucmVtb3ZlRXZlbnRMaXN0ZW5lcnModXRpbHMuZ2V0V2luZG93Rm9yRWxlbWVudCh0aGlzLmVsZW1lbnQpLCB0aGlzLmV2V2luLCB0aGlzLmRvbUhhbmRsZXIpO1xuICB9XG59XG5cbi8qKlxuICogaGFuZGxlIGlucHV0IGV2ZW50c1xuICogQHBhcmFtIHtNYW5hZ2VyfSBtYW5hZ2VyXG4gKiBAcGFyYW0ge051bWJlcn0gZXZlbnRUeXBlXG4gKiBAcGFyYW0ge0lDb21wdXRlZEV2ZW50fSBpbnB1dFxuICovXG5mdW5jdGlvbiBpbnB1dEhhbmRsZXIobWFuYWdlcjogTWFuYWdlciwgZXZlbnRUeXBlOiBudW1iZXIsIHRvdWNoRXZlbnQ6IFRvdWNoRXZlbnQpIHtcblxuICB2YXIgY29tcEV2ZW50OiBJQ29tcHV0ZWRFdmVudCA9IGNvbXB1dGVJQ29tcHV0ZWRFdmVudChtYW5hZ2VyLCBldmVudFR5cGUsIHRvdWNoRXZlbnQpO1xuXG4gIG1hbmFnZXIucmVjb2duaXplKGNvbXBFdmVudCwgdG91Y2hFdmVudCk7XG5cbiAgbWFuYWdlci5zZXNzaW9uLnB1c2goY29tcEV2ZW50KTtcbn1cblxuLyoqXG4gKiBleHRlbmQgdGhlIGRhdGEgd2l0aCBzb21lIHVzYWJsZSBwcm9wZXJ0aWVzIGxpa2Ugc2NhbGUsIHJvdGF0ZSwgdmVsb2NpdHkgZXRjXG4gKiBAcGFyYW0ge01hbmFnZXJ9IG1hbmFnZXJcbiAqIEBwYXJhbSB7SUNvbXB1dGVkRXZlbnR9IGlucHV0XG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVJQ29tcHV0ZWRFdmVudChtYW5hZ2VyOiBNYW5hZ2VyLCBldmVudFR5cGU6IG51bWJlciwgdG91Y2hFdmVudDogVG91Y2hFdmVudCk6IElDb21wdXRlZEV2ZW50IHtcbiAgdmFyIHRvdWNoZXNMZW5ndGggPSB0b3VjaEV2ZW50LnRvdWNoZXMubGVuZ3RoO1xuICB2YXIgY2hhbmdlZFBvaW50ZXJzTGVuID0gdG91Y2hFdmVudC5jaGFuZ2VkVG91Y2hlcy5sZW5ndGg7XG4gIHZhciBpc0ZpcnN0OiBib29sZWFuID0gKGV2ZW50VHlwZSAmIElOUFVUX1NUQVJUICYmICh0b3VjaGVzTGVuZ3RoIC0gY2hhbmdlZFBvaW50ZXJzTGVuID09PSAwKSk7XG4gIHZhciBpc0ZpbmFsOiBib29sZWFuID0gKGV2ZW50VHlwZSAmIChJTlBVVF9FTkQgfCBJTlBVVF9DQU5DRUwpICYmICh0b3VjaGVzTGVuZ3RoIC0gY2hhbmdlZFBvaW50ZXJzTGVuID09PSAwKSk7XG5cbi8vdmFyIGNvbXBFdmVudDogYW55LypJQ29tcHV0ZWRFdmVudCovID0ge307XG4vL2NvbXBFdmVudC5pc0ZpcnN0ID0gISFpc0ZpcnN0O1xuLy9jb21wRXZlbnQuaXNGaW5hbCA9ICEhaXNGaW5hbDtcblxuICBpZiAoaXNGaXJzdCkge1xuICAgIG1hbmFnZXIuc2Vzc2lvbi5yZXNldCgpO1xuICB9XG5cbiAgLy8gc291cmNlIGV2ZW50IGlzIHRoZSBub3JtYWxpemVkIHZhbHVlIG9mIHRoZSBkb21FdmVudHNcbiAgLy8gbGlrZSAndG91Y2hzdGFydCwgbW91c2V1cCwgcG9pbnRlcmRvd24nXG4gIHZhciBzZXNzaW9uID0gbWFuYWdlci5zZXNzaW9uO1xuLy8gIHZhciBwb2ludGVycyA9IGlucHV0LnBvaW50ZXJzO1xuLy8gIHZhciBwb2ludGVyc0xlbmd0aCA9IHBvaW50ZXJzLmxlbmd0aDtcblxuICB2YXIgY2VudGVyOiBDbGllbnRMb2NhdGlvbiA9IGNvbXB1dGVDZW50ZXIodG91Y2hFdmVudC50b3VjaGVzKTtcbiAgdmFyIG1vdmVtZW50OiBWZWN0b3JFMiA9IHNlc3Npb24uY29tcHV0ZU1vdmVtZW50KGNlbnRlcik7XG5cbiAgLy8gc3RvcmUgdGhlIGZpcnN0IGlucHV0IHRvIGNhbGN1bGF0ZSB0aGUgZGlzdGFuY2UgYW5kIGRpcmVjdGlvblxuICAvKlxuICBpZiAoIXNlc3Npb24uZmlyc3RJbnB1dCkge1xuICAgIHNlc3Npb24uZmlyc3RJbnB1dCA9IHNuYXBzaG90KHRvdWNoRXZlbnQsIG1vdmVtZW50KTtcbiAgfVxuXG4gIC8vIHRvIGNvbXB1dGUgc2NhbGUgYW5kIHJvdGF0aW9uIHdlIG5lZWQgdG8gc3RvcmUgdGhlIG11bHRpcGxlIHRvdWNoZXNcbiAgaWYgKHRvdWNoZXNMZW5ndGggPiAxICYmICFzZXNzaW9uLmZpcnN0TXVsdGlwbGUpIHtcbiAgICBzZXNzaW9uLmZpcnN0TXVsdGlwbGUgPSBzbmFwc2hvdCh0b3VjaEV2ZW50LCBtb3ZlbWVudCk7XG4gIH1cbiAgZWxzZSBpZiAodG91Y2hlc0xlbmd0aCA9PT0gMSkge1xuICAgIHNlc3Npb24uZmlyc3RNdWx0aXBsZSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHZhciBmaXJzdElucHV0ID0gc2Vzc2lvbi5maXJzdElucHV0O1xuICB2YXIgZmlyc3RNdWx0aXBsZSA9IHNlc3Npb24uZmlyc3RNdWx0aXBsZTtcbiAgdmFyIG9mZnNldENlbnRlciA9IGZpcnN0TXVsdGlwbGUgPyBmaXJzdE11bHRpcGxlLmNlbnRlciA6IGZpcnN0SW5wdXQuY2VudGVyO1xuICAqL1xuXG4gIHZhciB0aW1lU3RhbXAgPSBEYXRlLm5vdygpO1xuICB2YXIgbW92ZW1lbnRUaW1lID0gdGltZVN0YW1wIC0gc2Vzc2lvbi5zdGFydFRpbWU7XG5cbi8vdmFyIGFuZ2xlID0gZ2V0QW5nbGUob2Zmc2V0Q2VudGVyLCBjZW50ZXIpO1xuICB2YXIgZGlzdGFuY2U6IG51bWJlciA9IG1vdmVtZW50ID8gbW92ZW1lbnQubm9ybSgpIDogMDtcbiAgdmFyIGRpcmVjdGlvbjogbnVtYmVyID0gZ2V0RGlyZWN0aW9uKG1vdmVtZW50KTtcblxuICAvLyB2YXIgc2NhbGUgPSBmaXJzdE11bHRpcGxlID8gZ2V0U2NhbGUoZmlyc3RNdWx0aXBsZS5wb2ludGVycywgdG91Y2hFdmVudC50b3VjaGVzKSA6IDE7XG4gIC8vIHZhciByb3RhdGlvbiA9IGZpcnN0TXVsdGlwbGUgPyBnZXRSb3RhdGlvbihmaXJzdE11bHRpcGxlLnBvaW50ZXJzLCB0b3VjaEV2ZW50LnRvdWNoZXMpIDogMDtcblxuICB2YXIgdmVsb2NpdHk6IFZlY3RvckUyID0gc2Vzc2lvbi5jb21wdXRlVmVsb2NpdHkoY2VudGVyLCBtb3ZlbWVudFRpbWUpO1xuXG4gIC8vIGZpbmQgdGhlIGNvcnJlY3QgdGFyZ2V0XG4gIC8qXG4gIHZhciB0YXJnZXQgPSBtYW5hZ2VyLmVsZW1lbnQ7XG4gIGlmICh1dGlscy5oYXNQYXJlbnQodG91Y2hFdmVudC50YXJnZXQsIHRhcmdldCkpIHtcbiAgICAgIHRhcmdldCA9IGlucHV0LnNyY0V2ZW50LnRhcmdldDtcbiAgfVxuICAqL1xuLy8gIGlucHV0LnRhcmdldCA9IHRhcmdldDtcbiAgdmFyIGNvbXBFdmVudDogSUNvbXB1dGVkRXZlbnQgPSB7XG4gICAgY2VudGVyOiBjZW50ZXIsXG4gICAgbW92ZW1lbnQ6IG1vdmVtZW50LFxuICAgIGRlbHRhVGltZTogbW92ZW1lbnRUaW1lLFxuICAgIGRpcmVjdGlvbjogZGlyZWN0aW9uLFxuICAgIGRpc3RhbmNlOiBkaXN0YW5jZSxcbiAgICBldmVudFR5cGU6IGV2ZW50VHlwZSxcbiAgICByb3RhdGlvbjogMCxcbiAgICB0aW1lU3RhbXA6IHRpbWVTdGFtcCxcbiAgICB0b3VjaGVzTGVuZ3RoOiB0b3VjaEV2ZW50LnRvdWNoZXMubGVuZ3RoLFxuICAgIC8vIHR5cGU6IHRvdWNoRXZlbnQudHlwZSxcbiAgICBzY2FsZTogMSxcbiAgICB2ZWxvY2l0eTogdmVsb2NpdHlcbiAgfTtcbiAgcmV0dXJuIGNvbXBFdmVudDtcbn1cblxuLyoqXG4gKiBnZXQgdGhlIGNlbnRlciBvZiBhbGwgdGhlIHBvaW50ZXJzXG4gKiBAcGFyYW0ge0FycmF5fSBwb2ludGVyc1xuICogQHJldHVybiB7Q2xpZW50TG9jYXRpb259IGNlbnRlciBjb250YWlucyBgY2xpZW50WGAgYW5kIGBjbGllbnRZYCBwcm9wZXJ0aWVzXG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVDZW50ZXIodG91Y2hlczogVG91Y2hbXSk6IENsaWVudExvY2F0aW9uIHtcbiAgICB2YXIgdG91Y2hlc0xlbmd0aCA9IHRvdWNoZXMubGVuZ3RoO1xuICAgIGlmICh0b3VjaGVzTGVuZ3RoID09PSAxKSB7XG4gICAgICByZXR1cm4gQ2xpZW50TG9jYXRpb24uZnJvbVRvdWNoKHRvdWNoZXNbMF0pO1xuICAgIH1cbiAgICBlbHNlIGlmICh0b3VjaGVzTGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHZhciB4ID0gMCwgeSA9IDAsIGkgPSAwO1xuICAgICAgd2hpbGUgKGkgPCB0b3VjaGVzTGVuZ3RoKSB7XG4gICAgICAgICAgeCArPSB0b3VjaGVzW2ldLmNsaWVudFg7XG4gICAgICAgICAgeSArPSB0b3VjaGVzW2ldLmNsaWVudFk7XG4gICAgICAgICAgaSsrO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG5ldyBDbGllbnRMb2NhdGlvbihNYXRoLnJvdW5kKHggLyB0b3VjaGVzTGVuZ3RoKSwgTWF0aC5yb3VuZCh5IC8gdG91Y2hlc0xlbmd0aCkpO1xuICAgIH1cbn1cblxuLyoqXG4gKiBjYWxjdWxhdGUgdGhlIHZlbG9jaXR5IGJldHdlZW4gdHdvIHBvaW50cy4gdW5pdCBpcyBpbiBweCBwZXIgbXMuXG4gKiBAcGFyYW0ge051bWJlcn0gZGVsdGFUaW1lXG4gKiBAcGFyYW0ge051bWJlcn0geFxuICogQHBhcmFtIHtOdW1iZXJ9IHlcbiAqIEByZXR1cm4ge09iamVjdH0gdmVsb2NpdHkgYHhgIGFuZCBgeWBcbiAqL1xuZnVuY3Rpb24gZ2V0VmVsb2NpdHkoZGVsdGFUaW1lOiBudW1iZXIsIHg6IG51bWJlciwgeTogbnVtYmVyKTogeyB4OiBudW1iZXI7eTpudW1iZXJ9IHtcbiAgICByZXR1cm4ge3g6IHggLyBkZWx0YVRpbWUgfHwgMCwgeTogeSAvIGRlbHRhVGltZSB8fCAwfTtcbn1cblxuLyoqXG4gKiBnZXQgdGhlIGRpcmVjdGlvbiBiZXR3ZWVuIHR3byBwb2ludHNcbiAqIEBwYXJhbSB7VmVjdG9yRTJ9IG1vdmVtZW50XG4gKiBAcGFyYW0ge051bWJlcn0geVxuICogQHJldHVybiB7TnVtYmVyfSBkaXJlY3Rpb25cbiAqL1xuZnVuY3Rpb24gZ2V0RGlyZWN0aW9uKG1vdmVtZW50OiBWZWN0b3JFMik6IG51bWJlciB7XG4gIHZhciBOID0gbmV3IFZlY3RvckUyKDAsLTEpO1xuICB2YXIgUyA9IG5ldyBWZWN0b3JFMigwLCsxKTtcbiAgdmFyIEUgPSBuZXcgVmVjdG9yRTIoKzEsMCk7XG4gIHZhciBXID0gbmV3IFZlY3RvckUyKC0xLDApO1xuICAvLyBBbGxvdyBjb21iaW5hdGlvbnMgb2YgdGhlIGNhcmRpbmFsIGRpcmVjdGlvbnMuXG4gIC8vIEEgY2FyZGluYWwgZGlyZWN0aW9uIG1hdGNoZXMgaWYgd2UgYXJlIHdpdGhpbiAyMi41IGRlZ3JlZXMgZWl0aGVyIHNpZGUuXG4gIHZhciBjb3NpbmVUaHJlc2hvbGQgPSBNYXRoLmNvcyg3ICogTWF0aC5QSSAvIDE2KTtcbiAgaWYgKG1vdmVtZW50KSB7XG4gICAgdmFyIHVuaXQgPSBtb3ZlbWVudC5kaXYobW92ZW1lbnQubm9ybSgpKTtcbiAgICB2YXIgZGlyZWN0aW9uID0gRElSRUNUSU9OX1VOREVGSU5FRDtcbiAgICBpZiAodW5pdC5kb3QoTikgPiBjb3NpbmVUaHJlc2hvbGQpIHtcbiAgICAgIGRpcmVjdGlvbiB8PSBESVJFQ1RJT05fVVA7XG4gICAgfVxuICAgIGlmICh1bml0LmRvdChTKSA+IGNvc2luZVRocmVzaG9sZCkge1xuICAgICAgZGlyZWN0aW9uIHw9IERJUkVDVElPTl9ET1dOO1xuICAgIH1cbiAgICBpZiAodW5pdC5kb3QoRSkgPiBjb3NpbmVUaHJlc2hvbGQpIHtcbiAgICAgIGRpcmVjdGlvbiB8PSBESVJFQ1RJT05fUklHSFQ7XG4gICAgfVxuICAgIGlmICh1bml0LmRvdChXKSA+IGNvc2luZVRocmVzaG9sZCkge1xuICAgICAgZGlyZWN0aW9uIHw9IERJUkVDVElPTl9MRUZUO1xuICAgIH1cbiAgICByZXR1cm4gZGlyZWN0aW9uO1xuICB9XG4gIGVsc2Uge1xuICAgIHJldHVybiBESVJFQ1RJT05fVU5ERUZJTkVEO1xuICB9XG59XG5cbi8qKlxuICogY2FsY3VsYXRlIHRoZSBhYnNvbHV0ZSBkaXN0YW5jZSBiZXR3ZWVuIHR3byBwb2ludHNcbiAqIEBwYXJhbSB7T2JqZWN0fSBwMSB7eCwgeX1cbiAqIEBwYXJhbSB7T2JqZWN0fSBwMiB7eCwgeX1cbiAqIEBwYXJhbSB7QXJyYXl9IFtwcm9wc10gY29udGFpbmluZyB4IGFuZCB5IGtleXNcbiAqIEByZXR1cm4ge051bWJlcn0gZGlzdGFuY2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldERpc3RhbmNlKHAxLCBwMiwgcHJvcHM/KSB7XG4gICAgaWYgKCFwcm9wcykge1xuICAgICAgICBwcm9wcyA9IFBST1BTX1hZO1xuICAgIH1cbiAgICB2YXIgeCA9IHAyW3Byb3BzWzBdXSAtIHAxW3Byb3BzWzBdXSxcbiAgICAgICAgeSA9IHAyW3Byb3BzWzFdXSAtIHAxW3Byb3BzWzFdXTtcblxuICAgIHJldHVybiBNYXRoLnNxcnQoKHggKiB4KSArICh5ICogeSkpO1xufVxuXG4vKipcbiAqIGNhbGN1bGF0ZSB0aGUgYW5nbGUgYmV0d2VlbiB0d28gY29vcmRpbmF0ZXNcbiAqIEBwYXJhbSB7T2JqZWN0fSBwMVxuICogQHBhcmFtIHtPYmplY3R9IHAyXG4gKiBAcGFyYW0ge0FycmF5fSBbcHJvcHNdIGNvbnRhaW5pbmcgeCBhbmQgeSBrZXlzXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IGFuZ2xlXG4gKi9cbmZ1bmN0aW9uIGdldEFuZ2xlKHAxLCBwMiwgcHJvcHM/KSB7XG4gICAgaWYgKCFwcm9wcykge1xuICAgICAgICBwcm9wcyA9IFBST1BTX1hZO1xuICAgIH1cbiAgICB2YXIgeCA9IHAyW3Byb3BzWzBdXSAtIHAxW3Byb3BzWzBdXSxcbiAgICAgICAgeSA9IHAyW3Byb3BzWzFdXSAtIHAxW3Byb3BzWzFdXTtcbiAgICByZXR1cm4gTWF0aC5hdGFuMih5LCB4KSAqIDE4MCAvIE1hdGguUEk7XG59XG5cbi8qKlxuICogY2FsY3VsYXRlIHRoZSByb3RhdGlvbiBkZWdyZWVzIGJldHdlZW4gdHdvIHBvaW50ZXJzZXRzXG4gKiBAcGFyYW0ge0FycmF5fSBzdGFydCBhcnJheSBvZiBwb2ludGVyc1xuICogQHBhcmFtIHtBcnJheX0gZW5kIGFycmF5IG9mIHBvaW50ZXJzXG4gKiBAcmV0dXJuIHtOdW1iZXJ9IHJvdGF0aW9uXG4gKi9cbmZ1bmN0aW9uIGdldFJvdGF0aW9uKHN0YXJ0LCBlbmQpIHtcbiAgICByZXR1cm4gZ2V0QW5nbGUoZW5kWzFdLCBlbmRbMF0sIFBST1BTX0NMSUVOVF9YWSkgLSBnZXRBbmdsZShzdGFydFsxXSwgc3RhcnRbMF0sIFBST1BTX0NMSUVOVF9YWSk7XG59XG5cbi8qKlxuICogY2FsY3VsYXRlIHRoZSBzY2FsZSBmYWN0b3IgYmV0d2VlbiB0d28gcG9pbnRlcnNldHNcbiAqIG5vIHNjYWxlIGlzIDEsIGFuZCBnb2VzIGRvd24gdG8gMCB3aGVuIHBpbmNoZWQgdG9nZXRoZXIsIGFuZCBiaWdnZXIgd2hlbiBwaW5jaGVkIG91dFxuICogQHBhcmFtIHtBcnJheX0gc3RhcnQgYXJyYXkgb2YgcG9pbnRlcnNcbiAqIEBwYXJhbSB7QXJyYXl9IGVuZCBhcnJheSBvZiBwb2ludGVyc1xuICogQHJldHVybiB7TnVtYmVyfSBzY2FsZVxuICovXG5mdW5jdGlvbiBnZXRTY2FsZShzdGFydCwgZW5kKSB7XG4gICAgcmV0dXJuIGdldERpc3RhbmNlKGVuZFswXSwgZW5kWzFdLCBQUk9QU19DTElFTlRfWFkpIC8gZ2V0RGlzdGFuY2Uoc3RhcnRbMF0sIHN0YXJ0WzFdLCBQUk9QU19DTElFTlRfWFkpO1xufVxuXG52YXIgVE9VQ0hfSU5QVVRfTUFQOiAgeyBbczogc3RyaW5nXTogbnVtYmVyOyB9ID0ge1xuICAgIHRvdWNoc3RhcnQ6IElOUFVUX1NUQVJULFxuICAgIHRvdWNobW92ZTogSU5QVVRfTU9WRSxcbiAgICB0b3VjaGVuZDogSU5QVVRfRU5ELFxuICAgIHRvdWNoY2FuY2VsOiBJTlBVVF9DQU5DRUxcbn07XG5cbnZhciBUT1VDSF9UQVJHRVRfRVZFTlRTID0gJ3RvdWNoc3RhcnQgdG91Y2htb3ZlIHRvdWNoZW5kIHRvdWNoY2FuY2VsJztcblxuY2xhc3MgVG91Y2hJbnB1dCBleHRlbmRzIElucHV0IHtcbiAgcHJpdmF0ZSB0YXJnZXRJZHMgPSB7fTtcbiAgcHJpdmF0ZSBjYWxsYmFjazogKG1hbmFnZXI6IE1hbmFnZXIsIHR5cGU6IG51bWJlciwgZGF0YTogVG91Y2hFdmVudCkgPT4gdm9pZDtcbiAgLyoqXG4gICAqIE11bHRpLXVzZXIgdG91Y2ggZXZlbnRzIGlucHV0XG4gICAqIEBjb25zdHJ1Y3RvclxuICAgKiBAZXh0ZW5kcyBJbnB1dFxuICAgKi9cbiAgY29uc3RydWN0b3IobWFuYWdlcjogTWFuYWdlciwgY2FsbGJhY2s6IChtYW5hZ2VyOiBNYW5hZ2VyLCB0eXBlOiBudW1iZXIsIGRhdGE6IFRvdWNoRXZlbnQpPT52b2lkKSB7XG4gICAgLy8gRklYTUU6IFRoZSBiYXNlIGNsYXNzIHJlZ2lzdGVycyBoYW5kbGVycyBhbmQgY291bGQgYmUgZmlyaW5nIGV2ZW50c1xuICAgIC8vIGJlZm9yZSB0aGlzIGNvbnN0cnVjdG9yIGhhcyBpbml0aWFsaXplZCBjYWxsYmFjaz9cbiAgICBzdXBlcihtYW5hZ2VyLCB1bmRlZmluZWQsIFRPVUNIX1RBUkdFVF9FVkVOVFMsIHVuZGVmaW5lZCk7XG4gICAgdGhpcy5jYWxsYmFjayA9IGNhbGxiYWNrO1xuICB9XG4gIGhhbmRsZXIoZXZlbnQ6IFRvdWNoRXZlbnQpIHtcbiAgICB2YXIgZXZlbnRUeXBlOiBudW1iZXIgPSBUT1VDSF9JTlBVVF9NQVBbZXZlbnQudHlwZV07XG4gICAgdGhpcy5jYWxsYmFjayh0aGlzLm1hbmFnZXIsIGV2ZW50VHlwZSwgZXZlbnQpO1xuICB9XG59XG5cbi8qKlxuICogQHRoaXMge1RvdWNoSW5wdXR9XG4gKiBAcGFyYW0ge09iamVjdH0gZXZcbiAqIEBwYXJhbSB7TnVtYmVyfSB0eXBlIGZsYWdcbiAqIEByZXR1cm5zIHt1bmRlZmluZWR8QXJyYXl9IFthbGwsIGNoYW5nZWRdXG4gKi9cbmZ1bmN0aW9uIGdldFRvdWNoZXMoZXZlbnQ6IFRvdWNoRXZlbnQsIHR5cGU6IG51bWJlcikge1xuICAgIHZhciBhbGxUb3VjaGVzID0gdXRpbHMudG9BcnJheShldmVudC50b3VjaGVzKTtcbiAgICB2YXIgdGFyZ2V0SWRzID0gdGhpcy50YXJnZXRJZHM7XG5cbiAgICAvLyB3aGVuIHRoZXJlIGlzIG9ubHkgb25lIHRvdWNoLCB0aGUgcHJvY2VzcyBjYW4gYmUgc2ltcGxpZmllZFxuICAgIGlmICh0eXBlICYgKElOUFVUX1NUQVJUIHwgSU5QVVRfTU9WRSkgJiYgYWxsVG91Y2hlcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgdGFyZ2V0SWRzW2FsbFRvdWNoZXNbMF0uaWRlbnRpZmllcl0gPSB0cnVlO1xuICAgICAgICByZXR1cm4gW2FsbFRvdWNoZXMsIGFsbFRvdWNoZXNdO1xuICAgIH1cblxuICAgIHZhciBpLFxuICAgICAgICB0YXJnZXRUb3VjaGVzLFxuICAgICAgICBjaGFuZ2VkVG91Y2hlcyA9IHV0aWxzLnRvQXJyYXkoZXZlbnQuY2hhbmdlZFRvdWNoZXMpLFxuICAgICAgICBjaGFuZ2VkVGFyZ2V0VG91Y2hlcyA9IFtdLFxuICAgICAgICB0YXJnZXQgPSB0aGlzLnRhcmdldDtcblxuICAgIC8vIGdldCB0YXJnZXQgdG91Y2hlcyBmcm9tIHRvdWNoZXNcbiAgICB0YXJnZXRUb3VjaGVzID0gYWxsVG91Y2hlcy5maWx0ZXIoZnVuY3Rpb24odG91Y2gpIHtcbiAgICAgICAgcmV0dXJuIHV0aWxzLmhhc1BhcmVudCh0b3VjaC50YXJnZXQsIHRhcmdldCk7XG4gICAgfSk7XG5cbiAgICAvLyBjb2xsZWN0IHRvdWNoZXNcbiAgICBpZiAodHlwZSA9PT0gSU5QVVRfU1RBUlQpIHtcbiAgICAgICAgaSA9IDA7XG4gICAgICAgIHdoaWxlIChpIDwgdGFyZ2V0VG91Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRhcmdldElkc1t0YXJnZXRUb3VjaGVzW2ldLmlkZW50aWZpZXJdID0gdHJ1ZTtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIGZpbHRlciBjaGFuZ2VkIHRvdWNoZXMgdG8gb25seSBjb250YWluIHRvdWNoZXMgdGhhdCBleGlzdCBpbiB0aGUgY29sbGVjdGVkIHRhcmdldCBpZHNcbiAgICBpID0gMDtcbiAgICB3aGlsZSAoaSA8IGNoYW5nZWRUb3VjaGVzLmxlbmd0aCkge1xuICAgICAgICBpZiAodGFyZ2V0SWRzW2NoYW5nZWRUb3VjaGVzW2ldLmlkZW50aWZpZXJdKSB7XG4gICAgICAgICAgICBjaGFuZ2VkVGFyZ2V0VG91Y2hlcy5wdXNoKGNoYW5nZWRUb3VjaGVzW2ldKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNsZWFudXAgcmVtb3ZlZCB0b3VjaGVzXG4gICAgICAgIGlmICh0eXBlICYgKElOUFVUX0VORCB8IElOUFVUX0NBTkNFTCkpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0YXJnZXRJZHNbY2hhbmdlZFRvdWNoZXNbaV0uaWRlbnRpZmllcl07XG4gICAgICAgIH1cbiAgICAgICAgaSsrO1xuICAgIH1cblxuICAgIGlmICghY2hhbmdlZFRhcmdldFRvdWNoZXMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICByZXR1cm4gW1xuICAgICAgICAvLyBtZXJnZSB0YXJnZXRUb3VjaGVzIHdpdGggY2hhbmdlZFRhcmdldFRvdWNoZXMgc28gaXQgY29udGFpbnMgQUxMIHRvdWNoZXMsIGluY2x1ZGluZyAnZW5kJyBhbmQgJ2NhbmNlbCdcbiAgICAgICAgdXRpbHMudW5pcXVlQXJyYXkodGFyZ2V0VG91Y2hlcy5jb25jYXQoY2hhbmdlZFRhcmdldFRvdWNoZXMpLCAnaWRlbnRpZmllcicsIHRydWUpLFxuICAgICAgICBjaGFuZ2VkVGFyZ2V0VG91Y2hlc1xuICAgIF07XG59XG5cbi8qKlxuICogUmVjb2duaXplciBmbG93IGV4cGxhaW5lZDsgKlxuICogQWxsIHJlY29nbml6ZXJzIGhhdmUgdGhlIGluaXRpYWwgc3RhdGUgb2YgUE9TU0lCTEUgd2hlbiBhIGlucHV0IHNlc3Npb24gc3RhcnRzLlxuICogVGhlIGRlZmluaXRpb24gb2YgYSBpbnB1dCBzZXNzaW9uIGlzIGZyb20gdGhlIGZpcnN0IGlucHV0IHVudGlsIHRoZSBsYXN0IGlucHV0LCB3aXRoIGFsbCBpdCdzIG1vdmVtZW50IGluIGl0LiAqXG4gKiBFeGFtcGxlIHNlc3Npb24gZm9yIG1vdXNlLWlucHV0OiBtb3VzZWRvd24gLT4gbW91c2Vtb3ZlIC0+IG1vdXNldXBcbiAqXG4gKiBPbiBlYWNoIHJlY29nbml6aW5nIGN5Y2xlIChzZWUgTWFuYWdlci5yZWNvZ25pemUpIHRoZSAucmVjb2duaXplKCkgbWV0aG9kIGlzIGV4ZWN1dGVkXG4gKiB3aGljaCBkZXRlcm1pbmVzIHdpdGggc3RhdGUgaXQgc2hvdWxkIGJlLlxuICpcbiAqIElmIHRoZSByZWNvZ25pemVyIGhhcyB0aGUgc3RhdGUgRkFJTEVELCBDQU5DRUxMRUQgb3IgUkVDT0dOSVpFRCAoZXF1YWxzIEVOREVEKSwgaXQgaXMgcmVzZXQgdG9cbiAqIFBPU1NJQkxFIHRvIGdpdmUgaXQgYW5vdGhlciBjaGFuZ2Ugb24gdGhlIG5leHQgY3ljbGUuXG4gKlxuICogICAgICAgICAgICAgICBQb3NzaWJsZVxuICogICAgICAgICAgICAgICAgICB8XG4gKiAgICAgICAgICAgICstLS0tLSstLS0tLS0tLS0tLS0tLS0rXG4gKiAgICAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICB8XG4gKiAgICAgICstLS0tLSstLS0tLSsgICAgICAgICAgICAgICB8XG4gKiAgICAgIHwgICAgICAgICAgIHwgICAgICAgICAgICAgICB8XG4gKiAgIEZhaWxlZCAgICAgIENhbmNlbGxlZCAgICAgICAgICB8XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgKy0tLS0tLS0rLS0tLS0tK1xuICogICAgICAgICAgICAgICAgICAgICAgICAgIHwgICAgICAgICAgICAgIHxcbiAqICAgICAgICAgICAgICAgICAgICAgIFJlY29nbml6ZWQgICAgICAgQmVnYW5cbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgQ2hhbmdlZFxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHxcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFJlY29nbml6ZWRcbiAqL1xuZXhwb3J0IHZhciBTVEFURV9VTkRFRklORUQgPSAwO1xuZXhwb3J0IHZhciBTVEFURV9QT1NTSUJMRSA9IDE7XG5leHBvcnQgdmFyIFNUQVRFX0JFR0FOID0gMjtcbmV4cG9ydCB2YXIgU1RBVEVfQ0hBTkdFRCA9IDQ7XG5leHBvcnQgdmFyIFNUQVRFX1JFQ09HTklaRUQgPSA4O1xuZXhwb3J0IHZhciBTVEFURV9DQU5DRUxMRUQgPSAxNjtcbmV4cG9ydCB2YXIgU1RBVEVfRkFJTEVEID0gMzI7XG5cbmV4cG9ydCBjbGFzcyBSZWNvZ25pemVyIGltcGxlbWVudHMgSVJlY29nbml6ZXIge1xuICBwdWJsaWMgaWQ7XG4gIHB1YmxpYyBtYW5hZ2VyOiBJUmVjb2duaXplckNhbGxiYWNrO1xuICBwdWJsaWMgZXZlbnROYW1lOiBzdHJpbmc7XG4gIHB1YmxpYyBlbmFibGVkOiBib29sZWFuO1xuICBwdWJsaWMgc3RhdGU6IG51bWJlcjtcbiAgcHVibGljIHNpbXVsdGFuZW91cyA9IHt9OyAvLyBUT0RPOiBUeXBlIGFzIG1hcCBvZiBzdHJpbmcgdG8gUmVjb2duaXplci5cbiAgcHVibGljIHJlcXVpcmVGYWlsOiBJUmVjb2duaXplcltdID0gW107XG4gIC8qKlxuICAgKiBSZWNvZ25pemVyXG4gICAqIEV2ZXJ5IHJlY29nbml6ZXIgbmVlZHMgdG8gZXh0ZW5kIGZyb20gdGhpcyBjbGFzcy5cbiAgICogQGNvbnN0cnVjdG9yXG4gICAqL1xuICBjb25zdHJ1Y3RvcihldmVudE5hbWU6IHN0cmluZywgZW5hYmxlZDogYm9vbGVhbikge1xuICAgIHRoaXMuZXZlbnROYW1lID0gZXZlbnROYW1lO1xuICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgdGhpcy5pZCA9IHV0aWxzLnVuaXF1ZUlkKCk7XG5cbiAgICB0aGlzLm1hbmFnZXIgPSBudWxsO1xuLy8gICAgICB0aGlzLm9wdGlvbnMgPSB1dGlscy5tZXJnZShvcHRpb25zIHx8IHt9LCB0aGlzLmRlZmF1bHRzKTtcblxuICAgIC8vIGRlZmF1bHQgaXMgZW5hYmxlIHRydWVcbi8vICAgICAgdGhpcy5vcHRpb25zLmVuYWJsZSA9IHV0aWxzLmlmVW5kZWZpbmVkKHRoaXMub3B0aW9ucy5lbmFibGUsIHRydWUpO1xuXG4gICAgdGhpcy5zdGF0ZSA9IFNUQVRFX1BPU1NJQkxFO1xuICB9XG4gIHNldChvcHRpb25zKSB7XG4vLyAgICAgIHV0aWxzLmV4dGVuZCh0aGlzLm9wdGlvbnMsIG9wdGlvbnMpO1xuXG4gICAgICAvLyBhbHNvIHVwZGF0ZSB0aGUgdG91Y2hBY3Rpb24sIGluIGNhc2Ugc29tZXRoaW5nIGNoYW5nZWQgYWJvdXQgdGhlIGRpcmVjdGlvbnMvZW5hYmxlZCBzdGF0ZVxuICAgICAgdGhpcy5tYW5hZ2VyICYmIHRoaXMubWFuYWdlci51cGRhdGVUb3VjaEFjdGlvbigpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAgIC8qKlxuICAgICAqIHJlY29nbml6ZSBzaW11bHRhbmVvdXMgd2l0aCBhbiBvdGhlciByZWNvZ25pemVyLlxuICAgICAqIEBwYXJhbSB7UmVjb2duaXplcn0gb3RoZXJSZWNvZ25pemVyXG4gICAgICogQHJldHVybnMge1JlY29nbml6ZXJ9IHRoaXNcbiAgICAgKi9cbiAgICByZWNvZ25pemVXaXRoKG90aGVyUmVjb2duaXplcjogSVJlY29nbml6ZXIpOiBJUmVjb2duaXplciB7XG4gICAgICAgIHZhciBzaW11bHRhbmVvdXMgPSB0aGlzLnNpbXVsdGFuZW91cztcbiAgICAgICAgb3RoZXJSZWNvZ25pemVyID0gZ2V0UmVjb2duaXplckJ5TmFtZUlmTWFuYWdlcihvdGhlclJlY29nbml6ZXIsIHRoaXMubWFuYWdlcik7XG4gICAgICAgIGlmICghc2ltdWx0YW5lb3VzW290aGVyUmVjb2duaXplci5pZF0pIHtcbiAgICAgICAgICAgIHNpbXVsdGFuZW91c1tvdGhlclJlY29nbml6ZXIuaWRdID0gb3RoZXJSZWNvZ25pemVyO1xuICAgICAgICAgICAgb3RoZXJSZWNvZ25pemVyLnJlY29nbml6ZVdpdGgodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogZHJvcCB0aGUgc2ltdWx0YW5lb3VzIGxpbmsuIGl0IGRvZXNudCByZW1vdmUgdGhlIGxpbmsgb24gdGhlIG90aGVyIHJlY29nbml6ZXIuXG4gICAgICogQHBhcmFtIHtSZWNvZ25pemVyfSBvdGhlclJlY29nbml6ZXJcbiAgICAgKiBAcmV0dXJucyB7UmVjb2duaXplcn0gdGhpc1xuICAgICAqL1xuICAgIGRyb3BSZWNvZ25pemVXaXRoKG90aGVyUmVjb2duaXplcjogSVJlY29nbml6ZXIpIHtcbiAgICAgICAgb3RoZXJSZWNvZ25pemVyID0gZ2V0UmVjb2duaXplckJ5TmFtZUlmTWFuYWdlcihvdGhlclJlY29nbml6ZXIsIHRoaXMubWFuYWdlcik7XG4gICAgICAgIGRlbGV0ZSB0aGlzLnNpbXVsdGFuZW91c1tvdGhlclJlY29nbml6ZXIuaWRdO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiByZWNvZ25pemVyIGNhbiBvbmx5IHJ1biB3aGVuIGFuIG90aGVyIGlzIGZhaWxpbmdcbiAgICAgKi9cbiAgICByZXF1aXJlRmFpbHVyZShvdGhlclJlY29nbml6ZXI6IElSZWNvZ25pemVyKTogSVJlY29nbml6ZXIge1xuICAgICAgICB2YXIgcmVxdWlyZUZhaWwgPSB0aGlzLnJlcXVpcmVGYWlsO1xuICAgICAgICBvdGhlclJlY29nbml6ZXIgPSBnZXRSZWNvZ25pemVyQnlOYW1lSWZNYW5hZ2VyKG90aGVyUmVjb2duaXplciwgdGhpcy5tYW5hZ2VyKTtcbiAgICAgICAgaWYgKHV0aWxzLmluQXJyYXkocmVxdWlyZUZhaWwsIG90aGVyUmVjb2duaXplcikgPT09IC0xKSB7XG4gICAgICAgICAgICByZXF1aXJlRmFpbC5wdXNoKG90aGVyUmVjb2duaXplcik7XG4gICAgICAgICAgICBvdGhlclJlY29nbml6ZXIucmVxdWlyZUZhaWx1cmUodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogZHJvcCB0aGUgcmVxdWlyZUZhaWx1cmUgbGluay4gaXQgZG9lcyBub3QgcmVtb3ZlIHRoZSBsaW5rIG9uIHRoZSBvdGhlciByZWNvZ25pemVyLlxuICAgICAqIEBwYXJhbSB7UmVjb2duaXplcn0gb3RoZXJSZWNvZ25pemVyXG4gICAgICogQHJldHVybnMge1JlY29nbml6ZXJ9IHRoaXNcbiAgICAgKi9cbiAgICBkcm9wUmVxdWlyZUZhaWx1cmUob3RoZXJSZWNvZ25pemVyOiBJUmVjb2duaXplcikge1xuICAgICAgICBvdGhlclJlY29nbml6ZXIgPSBnZXRSZWNvZ25pemVyQnlOYW1lSWZNYW5hZ2VyKG90aGVyUmVjb2duaXplciwgdGhpcy5tYW5hZ2VyKTtcbiAgICAgICAgdmFyIGluZGV4ID0gdXRpbHMuaW5BcnJheSh0aGlzLnJlcXVpcmVGYWlsLCBvdGhlclJlY29nbml6ZXIpO1xuICAgICAgICBpZiAoaW5kZXggPiAtMSkge1xuICAgICAgICAgICAgdGhpcy5yZXF1aXJlRmFpbC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIGhhcyByZXF1aXJlIGZhaWx1cmVzIGJvb2xlYW5cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBoYXNSZXF1aXJlRmFpbHVyZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlcXVpcmVGYWlsLmxlbmd0aCA+IDA7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogaWYgdGhlIHJlY29nbml6ZXIgY2FuIHJlY29nbml6ZSBzaW11bHRhbmVvdXMgd2l0aCBhbiBvdGhlciByZWNvZ25pemVyXG4gICAgICogQHBhcmFtIHtSZWNvZ25pemVyfSBvdGhlclJlY29nbml6ZXJcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBjYW5SZWNvZ25pemVXaXRoKG90aGVyUmVjb2duaXplcjogSVJlY29nbml6ZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuICEhdGhpcy5zaW11bHRhbmVvdXNbb3RoZXJSZWNvZ25pemVyLmlkXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBZb3Ugc2hvdWxkIHVzZSBgdHJ5RW1pdGAgaW5zdGVhZCBvZiBgZW1pdGAgZGlyZWN0bHkgdG8gY2hlY2tcbiAgICAgKiB0aGF0IGFsbCB0aGUgbmVlZGVkIHJlY29nbml6ZXJzIGhhcyBmYWlsZWQgYmVmb3JlIGVtaXR0aW5nLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBpbnB1dFxuICAgICAqL1xuICAgIGVtaXQoKTogdm9pZCB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5zdGF0ZTtcblxuICAgICAgICBmdW5jdGlvbiBlbWl0KHdpdGhTdGF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgICAgIHZhciBldmVudE5hbWUgPSBzZWxmLmV2ZW50TmFtZSArICh3aXRoU3RhdGUgPyBzdGF0ZVN0cihzdGF0ZSkgOiAnJyk7XG4gICAgICAgICAgICBzZWxmLm1hbmFnZXIuZW1pdChldmVudE5hbWUsIHVuZGVmaW5lZCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGSVhNRTogTm90IG5pY2UsIG1lYW5pbmcgaW1wbGljaXQgaW4gc3RhdGUgbnVtYmVyaW5nLlxuICAgICAgICAvLyAncGFuc3RhcnQnIGFuZCAncGFubW92ZSdcbiAgICAgICAgaWYgKHN0YXRlIDwgU1RBVEVfUkVDT0dOSVpFRCkge1xuICAgICAgICAgICAgZW1pdCh0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGVtaXQoZmFsc2UpOyAvLyBzaW1wbGUgJ2V2ZW50TmFtZScgZXZlbnRzXG5cbiAgICAgICAgLy8gcGFuZW5kIGFuZCBwYW5jYW5jZWxcbiAgICAgICAgaWYgKHN0YXRlID49IFNUQVRFX1JFQ09HTklaRUQpIHtcbiAgICAgICAgICAgIGVtaXQodHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDaGVjayB0aGF0IGFsbCB0aGUgcmVxdWlyZSBmYWlsdXJlIHJlY29nbml6ZXJzIGhhcyBmYWlsZWQsXG4gICAgICogaWYgdHJ1ZSwgaXQgZW1pdHMgYSBnZXN0dXJlIGV2ZW50LFxuICAgICAqIG90aGVyd2lzZSwgc2V0dXAgdGhlIHN0YXRlIHRvIEZBSUxFRC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gaW5wdXRcbiAgICAgKi9cbiAgICB0cnlFbWl0KCkge1xuICAgICAgICBpZiAodGhpcy5jYW5FbWl0KCkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5lbWl0KCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgIH1cbiAgICAgICAgLy8gaXQncyBmYWlsaW5nIGFueXdheT9cbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0ZBSUxFRDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBjYW4gd2UgZW1pdD9cbiAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBjYW5FbWl0KCkge1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIHdoaWxlIChpIDwgdGhpcy5yZXF1aXJlRmFpbC5sZW5ndGgpIHtcbiAgICAgICAgICAgIGlmICghKHRoaXMucmVxdWlyZUZhaWxbaV0uc3RhdGUgJiAoU1RBVEVfRkFJTEVEIHwgU1RBVEVfUE9TU0lCTEUpKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB1cGRhdGUgdGhlIHJlY29nbml6ZXJcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gaW5wdXREYXRhXG4gICAgICovXG4gICAgcmVjb2duaXplKGNvbXBFdmVudDogSUNvbXB1dGVkRXZlbnQpOiB2b2lkIHtcblxuICAgICAgaWYgKCF0aGlzLmVuYWJsZWQpIHtcbiAgICAgICAgICB0aGlzLnJlc2V0KCk7XG4gICAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0ZBSUxFRDtcbiAgICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIC8vIHJlc2V0IHdoZW4gd2UndmUgcmVhY2hlZCB0aGUgZW5kXG4gICAgICBpZiAodGhpcy5zdGF0ZSAmIChTVEFURV9SRUNPR05JWkVEIHwgU1RBVEVfQ0FOQ0VMTEVEIHwgU1RBVEVfRkFJTEVEKSkge1xuICAgICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9QT1NTSUJMRTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5zdGF0ZSA9IHRoaXMucHJvY2Vzcyhjb21wRXZlbnQpO1xuXG4gICAgICAvLyB0aGUgcmVjb2duaXplciBoYXMgcmVjb2duaXplZCBhIGdlc3R1cmUgc28gdHJpZ2dlciBhbiBldmVudFxuICAgICAgaWYgKHRoaXMuc3RhdGUgJiAoU1RBVEVfQkVHQU4gfCBTVEFURV9DSEFOR0VEIHwgU1RBVEVfUkVDT0dOSVpFRCB8IFNUQVRFX0NBTkNFTExFRCkpIHtcbiAgICAgICAgdGhpcy50cnlFbWl0KCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogcmV0dXJuIHRoZSBzdGF0ZSBvZiB0aGUgcmVjb2duaXplclxuICAgICAqIHRoZSBhY3R1YWwgcmVjb2duaXppbmcgaGFwcGVucyBpbiB0aGlzIG1ldGhvZFxuICAgICAqIEB2aXJ0dWFsXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGlucHV0RGF0YVxuICAgICAqIEByZXR1cm5zIHtDb25zdH0gU1RBVEVcbiAgICAgKi9cbiAgICBwcm9jZXNzKGlucHV0RGF0YTogSUNvbXB1dGVkRXZlbnQpOiBudW1iZXIge1xuICAgICAgcmV0dXJuIFNUQVRFX1VOREVGSU5FRDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiByZXR1cm4gdGhlIHByZWZlcnJlZCB0b3VjaC1hY3Rpb25cbiAgICAgKiBAdmlydHVhbFxuICAgICAqIEByZXR1cm5zIHtBcnJheX1cbiAgICAgKi9cbiAgICBnZXRUb3VjaEFjdGlvbigpOiBzdHJpbmdbXSB7IHJldHVybiBbXTsgfVxuXG4gICAgLyoqXG4gICAgICogY2FsbGVkIHdoZW4gdGhlIGdlc3R1cmUgaXNuJ3QgYWxsb3dlZCB0byByZWNvZ25pemVcbiAgICAgKiBsaWtlIHdoZW4gYW5vdGhlciBpcyBiZWluZyByZWNvZ25pemVkIG9yIGl0IGlzIGRpc2FibGVkXG4gICAgICogQHZpcnR1YWxcbiAgICAgKi9cbiAgICByZXNldCgpIHsgfVxufVxuXG4vKipcbiAqIFRPRE86IEFyZSB0aGUgc3RyaW5nIHZhbHVlcyBwYXJ0IG9mIHRoZSBBUEksIG9yIGp1c3QgZm9yIGRlYnVnZ2luZz9cbiAqIGdldCBhIHVzYWJsZSBzdHJpbmcsIHVzZWQgYXMgZXZlbnQgcG9zdGZpeFxuICogQHBhcmFtIHtDb25zdH0gc3RhdGVcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0YXRlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZVN0cihzdGF0ZTogbnVtYmVyKTogc3RyaW5nIHtcbiAgICBpZiAoc3RhdGUgJiBTVEFURV9DQU5DRUxMRUQpIHtcbiAgICAgIHJldHVybiAnY2FuY2VsJztcbiAgICB9XG4gICAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9SRUNPR05JWkVEKSB7XG4gICAgICByZXR1cm4gJ2VuZCc7XG4gICAgfVxuICAgIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfQ0hBTkdFRCkge1xuICAgICAgcmV0dXJuICdtb3ZlJztcbiAgICB9XG4gICAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9CRUdBTikge1xuICAgICAgcmV0dXJuICdzdGFydCc7XG4gICAgfVxuICAgIHJldHVybiAnJztcbn1cblxuLyoqXG4gKiBQcm92aWRlIGEgZGVjb2RlIG9mIHRoZSBzdGF0ZS5cbiAqIFRoZSByZXN1bHQgaXMgbm90IG5vcm1hdGl2ZSBhbmQgc2hvdWxkIG5vdCBiZSBjb25zaWRlcmVkIEFQSS5cbiAqIFNpbmUgdGhlIHN0YXRlIGlzIGEgYml0IGZpZWxkLCBzaG93IGFsbCBiaXRzIGV2ZW4gdGhvdWdoIHRoZXkgbWF5L3Nob3VsZCBiZSBleGNsdXNpdmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdGF0ZURlY29kZShzdGF0ZTogbnVtYmVyKTogc3RyaW5nIHtcbiAgdmFyIHN0YXRlczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKHN0YXRlICYgU1RBVEVfUE9TU0lCTEUpIHtcbiAgICBzdGF0ZXMucHVzaCgnU1RBVEVfUE9TU0lCTEUnKTtcbiAgfVxuICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX0NBTkNFTExFRCkge1xuICAgIHN0YXRlcy5wdXNoKCdTVEFURV9DQU5DRUxMRUQnKTtcbiAgfVxuICBlbHNlIGlmIChzdGF0ZSAmIFNUQVRFX1JFQ09HTklaRUQpIHtcbiAgICBzdGF0ZXMucHVzaCgnU1RBVEVfUkVDT0dOSVpFRCcpO1xuICB9XG4gIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfQ0hBTkdFRCkge1xuICAgIHN0YXRlcy5wdXNoKCdTVEFURV9DSEFOR0VEJyk7XG4gIH1cbiAgZWxzZSBpZiAoc3RhdGUgJiBTVEFURV9CRUdBTikge1xuICAgIHN0YXRlcy5wdXNoKCdTVEFURV9CRUdBTicpO1xuICB9XG4gIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfVU5ERUZJTkVEKSB7XG4gICAgc3RhdGVzLnB1c2goJ1NUQVRFX1VOREVGSU5FRCcpO1xuICB9XG4gIGVsc2UgaWYgKHN0YXRlICYgU1RBVEVfRkFJTEVEKSB7XG4gICAgc3RhdGVzLnB1c2goJ1NUQVRFX0ZBSUxFRCcpO1xuICB9XG4gIGVsc2Uge1xuICAgIHN0YXRlcy5wdXNoKCcnICsgc3RhdGUpO1xuICB9XG4gIHJldHVybiBzdGF0ZXMuam9pbignICcpO1xufVxuXG4vKipcbiAqIFRPRE86IFRoaXMgcmVhbGx5IGJlbG9uZ3MgaW4gdGhlIGlucHV0IHNlcnZpY2UuXG4gKiBkaXJlY3Rpb24gY29ucyB0byBzdHJpbmdcbiAqIEBwYXJhbSB7Q29uc3R9IGRpcmVjdGlvblxuICogQHJldHVybnMge1N0cmluZ31cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRpcmVjdGlvblN0cihkaXJlY3Rpb246IG51bWJlcik6IHN0cmluZyB7XG4gIHZhciBkczogc3RyaW5nW10gPSBbXTtcbiAgaWYgKGRpcmVjdGlvbiAmIERJUkVDVElPTl9ET1dOKSB7XG4gICAgZHMucHVzaCgnZG93bicpO1xuICB9XG4gIGlmIChkaXJlY3Rpb24gJiBESVJFQ1RJT05fVVApIHtcbiAgICBkcy5wdXNoKCd1cCcpO1xuICB9XG4gIGlmIChkaXJlY3Rpb24gJiBESVJFQ1RJT05fTEVGVCkge1xuICAgIGRzLnB1c2goJ2xlZnQnKTtcbiAgfVxuICBpZiAoZGlyZWN0aW9uICYgRElSRUNUSU9OX1JJR0hUKSB7XG4gICAgZHMucHVzaCgncmlnaHQnKTtcbiAgfVxuICByZXR1cm4gZHMuam9pbignICcpO1xufVxuXG4vKipcbiAqIGdldCBhIHJlY29nbml6ZXIgYnkgbmFtZSBpZiBpdCBpcyBib3VuZCB0byBhIG1hbmFnZXJcbiAqIEBwYXJhbSB7UmVjb2duaXplcnxTdHJpbmd9IG90aGVyUmVjb2duaXplclxuICogQHBhcmFtIHtSZWNvZ25pemVyfSByZWNvZ25pemVyXG4gKiBAcmV0dXJucyB7UmVjb2duaXplcn1cbiAqL1xuZnVuY3Rpb24gZ2V0UmVjb2duaXplckJ5TmFtZUlmTWFuYWdlcihyZWNvZ25pemVyOiBJUmVjb2duaXplciwgbWFuYWdlcjogSVJlY29nbml6ZXJDYWxsYmFjayk6IElSZWNvZ25pemVyIHtcbiAgICBpZiAobWFuYWdlcikge1xuICAgICAgcmV0dXJuIG1hbmFnZXIuZ2V0KHJlY29nbml6ZXIuZXZlbnROYW1lKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlY29nbml6ZXI7XG59XG4iXX0=