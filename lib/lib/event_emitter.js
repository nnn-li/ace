"use strict";
var stopPropagation = function () { this.propagationStopped = true; };
var preventDefault = function () { this.defaultPrevented = true; };
export default class EventEmitterClass {
    constructor() {
    }
    _dispatchEvent(eventName, event) {
        this._eventRegistry || (this._eventRegistry = {});
        this._defaultHandlers || (this._defaultHandlers = {});
        var listeners = this._eventRegistry[eventName] || [];
        var defaultHandler = this._defaultHandlers[eventName];
        if (!listeners.length && !defaultHandler)
            return;
        if (typeof event !== "object" || !event) {
            event = {};
        }
        if (!event.type) {
            event.type = eventName;
        }
        if (!event.stopPropagation) {
            event.stopPropagation = stopPropagation;
        }
        if (!event.preventDefault) {
            event.preventDefault = preventDefault;
        }
        listeners = listeners.slice();
        for (var i = 0; i < listeners.length; i++) {
            listeners[i](event, this);
            if (event['propagationStopped']) {
                break;
            }
        }
        if (defaultHandler && !event.defaultPrevented) {
            return defaultHandler(event, this);
        }
    }
    _emit(eventName, event) {
        return this._dispatchEvent(eventName, event);
    }
    _signal(eventName, e) {
        var listeners = (this._eventRegistry || {})[eventName];
        if (!listeners) {
            return;
        }
        listeners = listeners.slice();
        for (var i = 0, iLength = listeners.length; i < iLength; i++) {
            listeners[i](e, this);
        }
    }
    once(eventName, callback) {
        var _self = this;
        callback && this.addEventListener(eventName, function newCallback() {
            _self.removeEventListener(eventName, newCallback);
            callback.apply(null, arguments);
        });
    }
    setDefaultHandler(eventName, callback) {
        var handlers = this._defaultHandlers;
        if (!handlers) {
            handlers = this._defaultHandlers = { _disabled_: {} };
        }
        if (handlers[eventName]) {
            var old = handlers[eventName];
            var disabled = handlers._disabled_[eventName];
            if (!disabled)
                handlers._disabled_[eventName] = disabled = [];
            disabled.push(old);
            var i = disabled.indexOf(callback);
            if (i != -1)
                disabled.splice(i, 1);
        }
        handlers[eventName] = callback;
    }
    removeDefaultHandler(eventName, callback) {
        var handlers = this._defaultHandlers;
        if (!handlers) {
            return;
        }
        var disabled = handlers._disabled_[eventName];
        if (handlers[eventName] === callback) {
            var old = handlers[eventName];
            if (disabled)
                this.setDefaultHandler(eventName, disabled.pop());
        }
        else if (disabled) {
            var i = disabled.indexOf(callback);
            if (i != -1)
                disabled.splice(i, 1);
        }
    }
    addEventListener(eventName, callback, capturing) {
        this._eventRegistry = this._eventRegistry || {};
        var listeners = this._eventRegistry[eventName];
        if (!listeners) {
            listeners = this._eventRegistry[eventName] = [];
        }
        if (listeners.indexOf(callback) === -1) {
            if (capturing) {
                listeners.unshift(callback);
            }
            else {
                listeners.push(callback);
            }
        }
        return callback;
    }
    on(eventName, callback, capturing) {
        return this.addEventListener(eventName, callback, capturing);
    }
    removeEventListener(eventName, callback) {
        this._eventRegistry = this._eventRegistry || {};
        var listeners = this._eventRegistry[eventName];
        if (!listeners)
            return;
        var index = listeners.indexOf(callback);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }
    removeListener(eventName, callback) {
        return this.removeEventListener(eventName, callback);
    }
    off(eventName, callback) {
        return this.removeEventListener(eventName, callback);
    }
    removeAllListeners(eventName) {
        if (this._eventRegistry)
            this._eventRegistry[eventName] = [];
    }
}
