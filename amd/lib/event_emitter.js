define(["require", "exports"], function (require, exports) {
    var stopPropagation = function () { this.propagationStopped = true; };
    var preventDefault = function () { this.defaultPrevented = true; };
    /**
     * Intended to be used as a Mixin.
     * N.B. The original implementation was an object, the TypeScript way is
     * designed to satisfy the compiler.
     */
    var EventEmitterClass = (function () {
        function EventEmitterClass() {
        }
        EventEmitterClass.prototype._dispatchEvent = function (eventName, e) {
            this._eventRegistry || (this._eventRegistry = {});
            this._defaultHandlers || (this._defaultHandlers = {});
            var listeners = this._eventRegistry[eventName] || [];
            var defaultHandler = this._defaultHandlers[eventName];
            if (!listeners.length && !defaultHandler)
                return;
            if (typeof e !== "object" || !e) {
                e = {};
            }
            if (!e.type)
                e.type = eventName;
            if (!e.stopPropagation)
                e.stopPropagation = stopPropagation;
            if (!e.preventDefault)
                e.preventDefault = preventDefault;
            listeners = listeners.slice();
            for (var i = 0; i < listeners.length; i++) {
                listeners[i](e, this);
                if (e['propagationStopped']) {
                    break;
                }
            }
            if (defaultHandler && !e.defaultPrevented)
                return defaultHandler(e, this);
        };
        /**
         *
         */
        EventEmitterClass.prototype._emit = function (eventName, e) {
            return this._dispatchEvent(eventName, e);
        };
        /**
         *
         */
        EventEmitterClass.prototype._signal = function (eventName, e) {
            var listeners = (this._eventRegistry || {})[eventName];
            if (!listeners) {
                return;
            }
            // slice just makes a copy so that we don't mess up on array bounds.
            // It's a bit expensive though?
            listeners = listeners.slice();
            for (var i = 0, iLength = listeners.length; i < iLength; i++)
                listeners[i](e, this);
        };
        EventEmitterClass.prototype.once = function (eventName, callback) {
            var _self = this;
            callback && this.addEventListener(eventName, function newCallback() {
                _self.removeEventListener(eventName, newCallback);
                callback.apply(null, arguments);
            });
        };
        EventEmitterClass.prototype.setDefaultHandler = function (eventName, callback) {
            var handlers = this._defaultHandlers;
            if (!handlers)
                handlers = this._defaultHandlers = { _disabled_: {} };
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
        };
        EventEmitterClass.prototype.removeDefaultHandler = function (eventName, callback) {
            var handlers = this._defaultHandlers;
            if (!handlers)
                return;
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
        };
        // Discourage usage.
        EventEmitterClass.prototype.addEventListener = function (eventName, callback, capturing) {
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
        };
        EventEmitterClass.prototype.on = function (eventName, callback, capturing) {
            return this.addEventListener(eventName, callback, capturing);
        };
        // Discourage usage.
        EventEmitterClass.prototype.removeEventListener = function (eventName, callback) {
            this._eventRegistry = this._eventRegistry || {};
            var listeners = this._eventRegistry[eventName];
            if (!listeners)
                return;
            var index = listeners.indexOf(callback);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        };
        // Discourage usage.
        EventEmitterClass.prototype.removeListener = function (eventName, callback) {
            return this.removeEventListener(eventName, callback);
        };
        EventEmitterClass.prototype.off = function (eventName, callback) {
            return this.removeEventListener(eventName, callback);
        };
        EventEmitterClass.prototype.removeAllListeners = function (eventName) {
            if (this._eventRegistry)
                this._eventRegistry[eventName] = [];
        };
        return EventEmitterClass;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = EventEmitterClass;
});
/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */
