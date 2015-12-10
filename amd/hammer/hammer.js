var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", './utils'], function (require, exports, utils_1) {
    // magical touchAction value
    exports.TOUCH_ACTION_COMPUTE = 'compute';
    exports.TOUCH_ACTION_AUTO = 'auto';
    exports.TOUCH_ACTION_MANIPULATION = 'manipulation'; // not implemented
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
    /**
     * Maintains the history of events for a gesture recognition.
     */
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
        /**
         * Manager
         * @param {HTMLElement} element
         * @constructor
         */
        function Manager(element) {
            this.handlers = {};
            this.session = new Session();
            this.recognizers = [];
            // The following properties are defaults.
            this.domEvents = false;
            this.enable = true; // What does this enable?
            this.cssProps = {};
            this.element = element;
            this.inputTarget = element; // Why would this be different?
            this.input = new TouchInput(this, inputHandler);
            this.touchAction = new TouchAction(this, exports.TOUCH_ACTION_COMPUTE);
            this.toggleCssProps(true);
        }
        /**
         * stop recognizing for this session.
         * This session will be discarded, when a new [input]start event is fired.
         * When forced, the recognizer cycle is stopped immediately.
         * @param {Boolean} [force]
         */
        Manager.prototype.stop = function (force) {
            this.session.stopped = force ? FORCED_STOP : STOP;
        };
        /**
         * run the recognizers!
         * called by the inputHandler function on every movement of the pointers (touches)
         * it walks through all the recognizers and tries to detect the gesture that is being made
         * @param {Object} inputData
         */
        Manager.prototype.recognize = function (inputData, touchEvent) {
            var session = this.session;
            if (session.stopped) {
                return;
            }
            // run the touch-action polyfill
            this.touchAction.preventDefaults(inputData, touchEvent);
            var recognizer;
            var recognizers = this.recognizers;
            // this holds the recognizer that is being recognized.
            // so the recognizer's state needs to be BEGAN, CHANGED, ENDED or RECOGNIZED
            // if no recognizer is detecting a thing, it is set to `null`
            var curRecognizer = session.curRecognizer;
            // reset when the last recognizer is recognized
            // or when we're in a new session
            if (!curRecognizer || (curRecognizer && curRecognizer.state & exports.STATE_RECOGNIZED)) {
                curRecognizer = session.curRecognizer = null;
            }
            var i = 0;
            while (i < recognizers.length) {
                recognizer = recognizers[i];
                // find out if we are allowed try to recognize the input for this one.
                // 1.   allow if the session is NOT forced stopped (see the .stop() method)
                // 2.   allow if we still haven't recognized a gesture in this session, or the this recognizer is the one
                //      that is being recognized.
                // 3.   allow if the recognizer is allowed to run simultaneous with the current recognized recognizer.
                //      this can be setup with the `recognizeWith()` method on the recognizer.
                if (session.stopped !== FORCED_STOP && (!curRecognizer || recognizer == curRecognizer ||
                    recognizer.canRecognizeWith(curRecognizer))) {
                    recognizer.recognize(inputData);
                }
                else {
                    recognizer.reset();
                }
                // if the recognizer has been recognizing the input as a valid gesture, we want to store this one as the
                // current active recognizer. but only if we don't already have an active recognizer
                if (!curRecognizer && recognizer.state & (exports.STATE_BEGAN | exports.STATE_CHANGED | exports.STATE_RECOGNIZED)) {
                    curRecognizer = session.curRecognizer = recognizer;
                }
                i++;
            }
        };
        /**
         * get a recognizer by its event name.
         */
        Manager.prototype.get = function (eventName) {
            var recognizers = this.recognizers;
            for (var i = 0; i < recognizers.length; i++) {
                if (recognizers[i].eventName === eventName) {
                    return recognizers[i];
                }
            }
            return null;
        };
        /**
         * add a recognizer to the manager
         * existing recognizers with the same event name will be removed
         * @param {Recognizer} recognizer
         */
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
        /**
         * remove a recognizer by name or instance
         * @param {Recognizer|String} recognizer
         * @returns {Manager}
         */
        Manager.prototype.remove = function (recognizer) {
            var recognizers = this.recognizers;
            recognizer = this.get(recognizer.eventName);
            recognizers.splice(utils_1.inArray(recognizers, recognizer), 1);
            this.touchAction.update();
            return this;
        };
        /**
         * bind event
         * @param {String} events
         * @param {Function} handler
         * @returns {EventEmitter} this
         */
        Manager.prototype.on = function (events, handler) {
            var handlers = this.handlers;
            utils_1.each(utils_1.splitStr(events), function (event) {
                handlers[event] = handlers[event] || [];
                handlers[event].push(handler);
            });
            return this;
        };
        /**
         * unbind event, leave emit blank to remove all handlers
         * @param {String} events
         * @param {Function} [handler]
         * @returns {EventEmitter} this
         */
        Manager.prototype.off = function (events, handler) {
            var handlers = this.handlers;
            utils_1.each(utils_1.splitStr(events), function (event) {
                if (!handler) {
                    delete handlers[event];
                }
                else {
                    handlers[event].splice(utils_1.inArray(handlers[event], handler), 1);
                }
            });
            return this;
        };
        /**
         * emit event to the listeners
         * @param {String} event
         * @param {IComputedEvent} data
         */
        Manager.prototype.emit = function (eventName, data) {
            // we also want to trigger dom events
            if (this.domEvents) {
                triggerDomEvent(event, data);
            }
            // no handlers, so skip it all
            var handlers = this.handlers[eventName] && this.handlers[eventName].slice();
            if (!handlers || !handlers.length) {
                return;
            }
            // Make it look like a normal DOM event?
            /*
            data.type = eventName;
            data.preventDefault = function() {
              data.srcEvent.preventDefault();
            };
            */
            var i = 0;
            while (i < handlers.length) {
                handlers[i](data);
                i++;
            }
        };
        Manager.prototype.updateTouchAction = function () {
            this.touchAction.update();
        };
        /**
         * destroy the manager and unbinds all events
         * it doesn't unbind dom events, that is the user own responsibility
         */
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
            utils_1.each(this.cssProps, function (value, name) {
                element.style[utils_1.prefixed(element.style, name)] = add ? value : '';
            });
        };
        Manager.prototype.cancelContextMenu = function () {
        };
        return Manager;
    })();
    exports.Manager = Manager;
    /**
     * trigger dom event
     * @param {String} event
     * @param {Object} data
     */
    function triggerDomEvent(event, data) {
        var gestureEvent = document.createEvent('Event');
        gestureEvent.initEvent(event, true, true);
        gestureEvent['gesture'] = data;
        data.target.dispatchEvent(gestureEvent);
    }
    var MOBILE_REGEX = /mobile|tablet|ip(ad|hone|od)|android/i;
    var SUPPORT_TOUCH = ('ontouchstart' in window);
    var SUPPORT_POINTER_EVENTS = utils_1.prefixed(window, 'PointerEvent') !== undefined;
    var SUPPORT_ONLY_TOUCH = SUPPORT_TOUCH && MOBILE_REGEX.test(navigator.userAgent);
    var PREFIXED_TOUCH_ACTION = utils_1.prefixed(utils_1.TEST_ELEMENT.style, 'touchAction');
    var NATIVE_TOUCH_ACTION = PREFIXED_TOUCH_ACTION !== undefined;
    var TouchAction = (function () {
        /**
         * Touch Action
         * sets the touchAction property or uses the js alternative
         * @param {Manager} manager
         * @param {String} value
         * @constructor
         */
        function TouchAction(manager, value) {
            this.manager = manager;
            this.set(value);
        }
        /**
         * set the touchAction value on the element or enable the polyfill
         * @param {String} value
         */
        TouchAction.prototype.set = function (value) {
            // find out the touch-action by the event handlers
            if (value === exports.TOUCH_ACTION_COMPUTE) {
                value = this.compute();
            }
            if (NATIVE_TOUCH_ACTION && this.manager.element.style) {
                this.manager.element.style[PREFIXED_TOUCH_ACTION] = value;
            }
            this.actions = value.toLowerCase().trim();
        };
        /**
         * just re-set the touchAction value
         */
        TouchAction.prototype.update = function () {
            this.set(exports.TOUCH_ACTION_COMPUTE);
        };
        /**
         * compute the value for the touchAction property based on the recognizer's settings
         * @returns {String} value
         */
        TouchAction.prototype.compute = function () {
            var actions = [];
            // FIXME: Make this type-safe automagically
            utils_1.each(this.manager.recognizers, function (recognizer) {
                if (recognizer.enabled) {
                    actions = actions.concat(recognizer.getTouchAction());
                }
            });
            return cleanTouchActions(actions.join(' '));
        };
        /**
         * this method is called on each input cycle and provides the preventing of the browser behavior
         * @param {Object} input
         */
        TouchAction.prototype.preventDefaults = function (input, touchEvent) {
            // not needed with native support for the touchAction property
            if (NATIVE_TOUCH_ACTION) {
                return;
            }
            // var direction = input.offsetDirection;
            if (this.prevented) {
                touchEvent.preventDefault();
                return;
            }
            /*
            var actions = this.actions;
            var hasNone = inStr(actions, TOUCH_ACTION_NONE);
            var hasPanY = inStr(actions, TOUCH_ACTION_PAN_Y);
            var hasPanX = inStr(actions, TOUCH_ACTION_PAN_X);
    
            if (hasNone ||
                (hasPanY && direction & DIRECTION_HORIZONTAL) ||
                (hasPanX && direction & DIRECTION_VERTICAL)) {
                return this.preventSrc(touchEvent);
            }
            */
        };
        /**
         * call preventDefault to prevent the browser's default behavior (scrolling in most cases)
         * @param {Object} srcEvent
         */
        TouchAction.prototype.preventSrc = function (srcEvent) {
            this.prevented = true;
            srcEvent.preventDefault();
        };
        return TouchAction;
    })();
    /**
     * when the touchActions are collected they are not a valid value, so we need to clean things up. *
     * @param {String} actions
     * @returns {*}
     */
    function cleanTouchActions(actions) {
        // none
        if (utils_1.inStr(actions, exports.TOUCH_ACTION_NONE)) {
            return exports.TOUCH_ACTION_NONE;
        }
        var hasPanX = utils_1.inStr(actions, exports.TOUCH_ACTION_PAN_X);
        var hasPanY = utils_1.inStr(actions, exports.TOUCH_ACTION_PAN_Y);
        // pan-x and pan-y can be combined
        if (hasPanX && hasPanY) {
            return exports.TOUCH_ACTION_PAN_X + ' ' + exports.TOUCH_ACTION_PAN_Y;
        }
        // pan-x OR pan-y
        if (hasPanX || hasPanY) {
            return hasPanX ? exports.TOUCH_ACTION_PAN_X : exports.TOUCH_ACTION_PAN_Y;
        }
        // manipulation
        if (utils_1.inStr(actions, exports.TOUCH_ACTION_MANIPULATION)) {
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
        /**
         * create new input type manager
         * @param {Manager} manager
         * @returns {Input}
         * @constructor
         */
        function Input(manager, touchElementEvents, touchTargetEvents, touchWindowEvents) {
            var self = this;
            this.manager = manager;
            this.evEl = touchElementEvents;
            this.evTarget = touchTargetEvents;
            this.evWin = touchWindowEvents;
            this.element = manager.element;
            this.target = manager.inputTarget;
            // smaller wrapper around the handler, for the scope and the enabled state of the manager,
            // so when disabled the input events are completely bypassed.
            this.domHandler = function (event) {
                if (manager.enable) {
                    self.handler(event);
                }
            };
            this.init();
        }
        /**
         * should handle the inputEvent data and trigger the callback
         * @virtual
         */
        Input.prototype.handler = function (event) { };
        /**
         * bind the events
         */
        Input.prototype.init = function () {
            this.evEl && utils_1.addEventListeners(this.element, this.evEl, this.domHandler);
            this.evTarget && utils_1.addEventListeners(this.target, this.evTarget, this.domHandler);
            this.evWin && utils_1.addEventListeners(utils_1.getWindowForElement(this.element), this.evWin, this.domHandler);
        };
        /**
         * unbind the events
         */
        Input.prototype.destroy = function () {
            this.evEl && utils_1.removeEventListeners(this.element, this.evEl, this.domHandler);
            this.evTarget && utils_1.removeEventListeners(this.target, this.evTarget, this.domHandler);
            this.evWin && utils_1.removeEventListeners(utils_1.getWindowForElement(this.element), this.evWin, this.domHandler);
        };
        return Input;
    })();
    /**
     * handle input events
     * @param {Manager} manager
     * @param {Number} eventType
     * @param {IComputedEvent} input
     */
    function inputHandler(manager, eventType, touchEvent) {
        var compEvent = computeIComputedEvent(manager, eventType, touchEvent);
        manager.recognize(compEvent, touchEvent);
        manager.session.push(compEvent);
    }
    /**
     * extend the data with some usable properties like scale, rotate, velocity etc
     * @param {Manager} manager
     * @param {IComputedEvent} input
     */
    function computeIComputedEvent(manager, eventType, touchEvent) {
        var touchesLength = touchEvent.touches.length;
        var changedPointersLen = touchEvent.changedTouches.length;
        var isFirst = (eventType & exports.INPUT_START && (touchesLength - changedPointersLen === 0));
        var isFinal = (eventType & (exports.INPUT_END | exports.INPUT_CANCEL) && (touchesLength - changedPointersLen === 0));
        //var compEvent: any/*IComputedEvent*/ = {};
        //compEvent.isFirst = !!isFirst;
        //compEvent.isFinal = !!isFinal;
        if (isFirst) {
            manager.session.reset();
        }
        // source event is the normalized value of the domEvents
        // like 'touchstart, mouseup, pointerdown'
        var session = manager.session;
        //  var pointers = input.pointers;
        //  var pointersLength = pointers.length;
        var center = computeCenter(touchEvent.touches);
        var movement = session.computeMovement(center);
        // store the first input to calculate the distance and direction
        /*
        if (!session.firstInput) {
          session.firstInput = snapshot(touchEvent, movement);
        }
      
        // to compute scale and rotation we need to store the multiple touches
        if (touchesLength > 1 && !session.firstMultiple) {
          session.firstMultiple = snapshot(touchEvent, movement);
        }
        else if (touchesLength === 1) {
          session.firstMultiple = undefined;
        }
      
        var firstInput = session.firstInput;
        var firstMultiple = session.firstMultiple;
        var offsetCenter = firstMultiple ? firstMultiple.center : firstInput.center;
        */
        var timeStamp = Date.now();
        var movementTime = timeStamp - session.startTime;
        //var angle = getAngle(offsetCenter, center);
        var distance = movement ? movement.norm() : 0;
        var direction = getDirection(movement);
        // var scale = firstMultiple ? getScale(firstMultiple.pointers, touchEvent.touches) : 1;
        // var rotation = firstMultiple ? getRotation(firstMultiple.pointers, touchEvent.touches) : 0;
        var velocity = session.computeVelocity(center, movementTime);
        // find the correct target
        /*
        var target = manager.element;
        if (hasParent(touchEvent.target, target)) {
            target = input.srcEvent.target;
        }
        */
        //  input.target = target;
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
            // type: touchEvent.type,
            scale: 1,
            velocity: velocity
        };
        return compEvent;
    }
    /**
     * get the center of all the pointers
     * @param {Array} pointers
     * @return {ClientLocation} center contains `clientX` and `clientY` properties
     */
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
    /**
     * calculate the velocity between two points. unit is in px per ms.
     * @param {Number} deltaTime
     * @param {Number} x
     * @param {Number} y
     * @return {Object} velocity `x` and `y`
     */
    function getVelocity(deltaTime, x, y) {
        return { x: x / deltaTime || 0, y: y / deltaTime || 0 };
    }
    /**
     * get the direction between two points
     * @param {VectorE2} movement
     * @param {Number} y
     * @return {Number} direction
     */
    function getDirection(movement) {
        var N = new VectorE2(0, -1);
        var S = new VectorE2(0, +1);
        var E = new VectorE2(+1, 0);
        var W = new VectorE2(-1, 0);
        // Allow combinations of the cardinal directions.
        // A cardinal direction matches if we are within 22.5 degrees either side.
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
    /**
     * calculate the absolute distance between two points
     * @param {Object} p1 {x, y}
     * @param {Object} p2 {x, y}
     * @param {Array} [props] containing x and y keys
     * @return {Number} distance
     */
    function getDistance(p1, p2, props) {
        if (!props) {
            props = PROPS_XY;
        }
        var x = p2[props[0]] - p1[props[0]], y = p2[props[1]] - p1[props[1]];
        return Math.sqrt((x * x) + (y * y));
    }
    exports.getDistance = getDistance;
    /**
     * calculate the angle between two coordinates
     * @param {Object} p1
     * @param {Object} p2
     * @param {Array} [props] containing x and y keys
     * @return {Number} angle
     */
    function getAngle(p1, p2, props) {
        if (!props) {
            props = PROPS_XY;
        }
        var x = p2[props[0]] - p1[props[0]], y = p2[props[1]] - p1[props[1]];
        return Math.atan2(y, x) * 180 / Math.PI;
    }
    /**
     * calculate the rotation degrees between two pointersets
     * @param {Array} start array of pointers
     * @param {Array} end array of pointers
     * @return {Number} rotation
     */
    function getRotation(start, end) {
        return getAngle(end[1], end[0], PROPS_CLIENT_XY) - getAngle(start[1], start[0], PROPS_CLIENT_XY);
    }
    /**
     * calculate the scale factor between two pointersets
     * no scale is 1, and goes down to 0 when pinched together, and bigger when pinched out
     * @param {Array} start array of pointers
     * @param {Array} end array of pointers
     * @return {Number} scale
     */
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
        /**
         * Multi-user touch events input
         * @constructor
         * @extends Input
         */
        function TouchInput(manager, callback) {
            // FIXME: The base class registers handlers and could be firing events
            // before this constructor has initialized callback?
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
    /**
     * @this {TouchInput}
     * @param {Object} ev
     * @param {Number} type flag
     * @returns {undefined|Array} [all, changed]
     */
    function getTouches(event, type) {
        var allTouches = utils_1.toArray(event.touches);
        var targetIds = this.targetIds;
        // when there is only one touch, the process can be simplified
        if (type & (exports.INPUT_START | exports.INPUT_MOVE) && allTouches.length === 1) {
            targetIds[allTouches[0].identifier] = true;
            return [allTouches, allTouches];
        }
        var i, targetTouches, changedTouches = utils_1.toArray(event.changedTouches), changedTargetTouches = [], target = this.target;
        // get target touches from touches
        targetTouches = allTouches.filter(function (touch) {
            return utils_1.hasParent(touch.target, target);
        });
        // collect touches
        if (type === exports.INPUT_START) {
            i = 0;
            while (i < targetTouches.length) {
                targetIds[targetTouches[i].identifier] = true;
                i++;
            }
        }
        // filter changed touches to only contain touches that exist in the collected target ids
        i = 0;
        while (i < changedTouches.length) {
            if (targetIds[changedTouches[i].identifier]) {
                changedTargetTouches.push(changedTouches[i]);
            }
            // cleanup removed touches
            if (type & (exports.INPUT_END | exports.INPUT_CANCEL)) {
                delete targetIds[changedTouches[i].identifier];
            }
            i++;
        }
        if (!changedTargetTouches.length) {
            return;
        }
        return [
            // merge targetTouches with changedTargetTouches so it contains ALL touches, including 'end' and 'cancel'
            utils_1.uniqueArray(targetTouches.concat(changedTargetTouches), 'identifier', true),
            changedTargetTouches
        ];
    }
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
    exports.STATE_UNDEFINED = 0;
    exports.STATE_POSSIBLE = 1;
    exports.STATE_BEGAN = 2;
    exports.STATE_CHANGED = 4;
    exports.STATE_RECOGNIZED = 8;
    exports.STATE_CANCELLED = 16;
    exports.STATE_FAILED = 32;
    var Recognizer = (function () {
        /**
         * Recognizer
         * Every recognizer needs to extend from this class.
         * @constructor
         */
        function Recognizer(eventName, enabled) {
            this.simultaneous = {}; // TODO: Type as map of string to Recognizer.
            this.requireFail = [];
            this.eventName = eventName;
            this.enabled = enabled;
            this.id = utils_1.uniqueId();
            this.manager = null;
            //      this.options = merge(options || {}, this.defaults);
            // default is enable true
            //      this.options.enable = ifUndefined(this.options.enable, true);
            this.state = exports.STATE_POSSIBLE;
        }
        Recognizer.prototype.set = function (options) {
            //      extend(this.options, options);
            // also update the touchAction, in case something changed about the directions/enabled state
            this.manager && this.manager.updateTouchAction();
            return this;
        };
        /**
         * recognize simultaneous with an other recognizer.
         * @param {Recognizer} otherRecognizer
         * @returns {Recognizer} this
         */
        Recognizer.prototype.recognizeWith = function (otherRecognizer) {
            var simultaneous = this.simultaneous;
            otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
            if (!simultaneous[otherRecognizer.id]) {
                simultaneous[otherRecognizer.id] = otherRecognizer;
                otherRecognizer.recognizeWith(this);
            }
            return this;
        };
        /**
         * drop the simultaneous link. it doesnt remove the link on the other recognizer.
         * @param {Recognizer} otherRecognizer
         * @returns {Recognizer} this
         */
        Recognizer.prototype.dropRecognizeWith = function (otherRecognizer) {
            otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
            delete this.simultaneous[otherRecognizer.id];
            return this;
        };
        /**
         * recognizer can only run when an other is failing
         */
        Recognizer.prototype.requireFailure = function (otherRecognizer) {
            var requireFail = this.requireFail;
            otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
            if (utils_1.inArray(requireFail, otherRecognizer) === -1) {
                requireFail.push(otherRecognizer);
                otherRecognizer.requireFailure(this);
            }
            return this;
        };
        /**
         * drop the requireFailure link. it does not remove the link on the other recognizer.
         * @param {Recognizer} otherRecognizer
         * @returns {Recognizer} this
         */
        Recognizer.prototype.dropRequireFailure = function (otherRecognizer) {
            otherRecognizer = getRecognizerByNameIfManager(otherRecognizer, this.manager);
            var index = utils_1.inArray(this.requireFail, otherRecognizer);
            if (index > -1) {
                this.requireFail.splice(index, 1);
            }
            return this;
        };
        /**
         * has require failures boolean
         * @returns {boolean}
         */
        Recognizer.prototype.hasRequireFailures = function () {
            return this.requireFail.length > 0;
        };
        /**
         * if the recognizer can recognize simultaneous with an other recognizer
         * @param {Recognizer} otherRecognizer
         * @returns {Boolean}
         */
        Recognizer.prototype.canRecognizeWith = function (otherRecognizer) {
            return !!this.simultaneous[otherRecognizer.id];
        };
        /**
         * You should use `tryEmit` instead of `emit` directly to check
         * that all the needed recognizers has failed before emitting.
         * @param {Object} input
         */
        Recognizer.prototype.emit = function () {
            var self = this;
            var state = this.state;
            function emit(withState) {
                var eventName = self.eventName + (withState ? stateStr(state) : '');
                self.manager.emit(eventName, undefined);
            }
            // FIXME: Not nice, meaning implicit in state numbering.
            // 'panstart' and 'panmove'
            if (state < exports.STATE_RECOGNIZED) {
                emit(true);
            }
            emit(false); // simple 'eventName' events
            // panend and pancancel
            if (state >= exports.STATE_RECOGNIZED) {
                emit(true);
            }
        };
        /**
         * Check that all the require failure recognizers has failed,
         * if true, it emits a gesture event,
         * otherwise, setup the state to FAILED.
         * @param {Object} input
         */
        Recognizer.prototype.tryEmit = function () {
            if (this.canEmit()) {
                return this.emit();
            }
            else {
            }
            // it's failing anyway?
            this.state = exports.STATE_FAILED;
        };
        /**
         * can we emit?
         * @returns {boolean}
         */
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
        /**
         * update the recognizer
         * @param {Object} inputData
         */
        Recognizer.prototype.recognize = function (compEvent) {
            if (!this.enabled) {
                this.reset();
                this.state = exports.STATE_FAILED;
                return;
            }
            // reset when we've reached the end
            if (this.state & (exports.STATE_RECOGNIZED | exports.STATE_CANCELLED | exports.STATE_FAILED)) {
                this.state = exports.STATE_POSSIBLE;
            }
            this.state = this.process(compEvent);
            // the recognizer has recognized a gesture so trigger an event
            if (this.state & (exports.STATE_BEGAN | exports.STATE_CHANGED | exports.STATE_RECOGNIZED | exports.STATE_CANCELLED)) {
                this.tryEmit();
            }
        };
        /**
         * return the state of the recognizer
         * the actual recognizing happens in this method
         * @virtual
         * @param {Object} inputData
         * @returns {Const} STATE
         */
        Recognizer.prototype.process = function (inputData) {
            return exports.STATE_UNDEFINED;
        };
        /**
         * return the preferred touch-action
         * @virtual
         * @returns {Array}
         */
        Recognizer.prototype.getTouchAction = function () { return []; };
        /**
         * called when the gesture isn't allowed to recognize
         * like when another is being recognized or it is disabled
         * @virtual
         */
        Recognizer.prototype.reset = function () { };
        return Recognizer;
    })();
    exports.Recognizer = Recognizer;
    /**
     * TODO: Are the string values part of the API, or just for debugging?
     * get a usable string, used as event postfix
     * @param {Const} state
     * @returns {String} state
     */
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
    /**
     * Provide a decode of the state.
     * The result is not normative and should not be considered API.
     * Sine the state is a bit field, show all bits even though they may/should be exclusive.
     */
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
    /**
     * TODO: This really belongs in the input service.
     * direction cons to string
     * @param {Const} direction
     * @returns {String}
     */
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
    /**
     * get a recognizer by name if it is bound to a manager
     * @param {Recognizer|String} otherRecognizer
     * @param {Recognizer} recognizer
     * @returns {Recognizer}
     */
    function getRecognizerByNameIfManager(recognizer, manager) {
        if (manager) {
            return manager.get(recognizer.eventName);
        }
        return recognizer;
    }
});
