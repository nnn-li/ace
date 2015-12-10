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
define(["require", "exports"], function (require, exports) {
    /**
     * Returns the last element in an array.
     * @param {T[]} a
     */
    function last(a) {
        return a[a.length - 1];
    }
    exports.last = last;
    function stringReverse(s) {
        return s.split("").reverse().join("");
    }
    exports.stringReverse = stringReverse;
    function stringRepeat(s, count) {
        var result = '';
        while (count > 0) {
            if (count & 1) {
                result += s;
            }
            if (count >>= 1) {
                s += s;
            }
        }
        return result;
    }
    exports.stringRepeat = stringRepeat;
    var trimBeginRegexp = /^\s\s*/;
    var trimEndRegexp = /\s\s*$/;
    function stringTrimLeft(s) {
        return s.replace(trimBeginRegexp, '');
    }
    exports.stringTrimLeft = stringTrimLeft;
    ;
    function stringTrimRight(s) {
        return s.replace(trimEndRegexp, '');
    }
    exports.stringTrimRight = stringTrimRight;
    function copyObject(obj) {
        var copy = {};
        for (var key in obj) {
            copy[key] = obj[key];
        }
        return copy;
    }
    exports.copyObject = copyObject;
    function copyArray(array) {
        var copy = [];
        for (var i = 0, l = array.length; i < l; i++) {
            if (array[i] && typeof array[i] == "object")
                copy[i] = this.copyObject(array[i]);
            else
                copy[i] = array[i];
        }
        return copy;
    }
    exports.copyArray = copyArray;
    function deepCopy(obj) {
        if (typeof obj !== "object" || !obj)
            return obj;
        var cons = obj.constructor;
        if (cons === RegExp)
            return obj;
        var copy = cons();
        for (var key in obj) {
            if (typeof obj[key] === "object") {
                copy[key] = deepCopy(obj[key]);
            }
            else {
                copy[key] = obj[key];
            }
        }
        return copy;
    }
    exports.deepCopy = deepCopy;
    function arrayToMap(arr) {
        var map = {};
        for (var i = 0; i < arr.length; i++) {
            map[arr[i]] = 1;
        }
        return map;
    }
    exports.arrayToMap = arrayToMap;
    function createMap(props) {
        var map = Object.create(null);
        for (var i in props) {
            map[i] = props[i];
        }
        return map;
    }
    exports.createMap = createMap;
    /**
     * splice out of 'array' anything that === 'value'
     */
    function arrayRemove(array, value) {
        for (var i = 0; i <= array.length; i++) {
            if (value === array[i]) {
                array.splice(i, 1);
            }
        }
    }
    exports.arrayRemove = arrayRemove;
    function escapeRegExp(str) {
        return str.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
    }
    exports.escapeRegExp = escapeRegExp;
    function escapeHTML(str) {
        return str.replace(/&/g, "&#38;").replace(/"/g, "&#34;").replace(/'/g, "&#39;").replace(/</g, "&#60;");
    }
    exports.escapeHTML = escapeHTML;
    ;
    /**
     *
     */
    function getMatchOffsets(s, searchValue) {
        var matches = [];
        s.replace(searchValue, function (str) {
            matches.push({
                offset: arguments[arguments.length - 2],
                length: str.length
            });
            // FIXME: This is required for the TypeScript compiler.
            // It should not impact the function?
            return "lang.getMatchOffsets";
        });
        return matches;
    }
    exports.getMatchOffsets = getMatchOffsets;
    ;
    /* deprecated */
    function deferredCall(fcn) {
        var timer = null;
        var callback = function () {
            timer = null;
            fcn();
        };
        var deferred = function (timeout) {
            deferred.cancel();
            timer = setTimeout(callback, timeout || 0);
            return deferred;
        };
        deferred.schedule = deferred;
        deferred.call = function () {
            this.cancel();
            fcn();
            return deferred;
        };
        deferred.cancel = function () {
            clearTimeout(timer);
            timer = null;
            return deferred;
        };
        deferred.isPending = function () {
            return timer;
        };
        return deferred;
    }
    exports.deferredCall = deferredCall;
    ;
    function delayedCall(fcn, defaultTimeout) {
        var timer = null;
        var callback = function () {
            timer = null;
            fcn();
        };
        var _self = function (timeout) {
            if (timer == null)
                timer = setTimeout(callback, timeout || defaultTimeout);
        };
        _self.delay = function (timeout) {
            timer && clearTimeout(timer);
            timer = setTimeout(callback, timeout || defaultTimeout);
        };
        _self.schedule = _self;
        _self.call = function () {
            this.cancel();
            fcn();
        };
        _self.cancel = function () {
            timer && clearTimeout(timer);
            timer = null;
        };
        _self.isPending = function () {
            return timer;
        };
        return _self;
    }
    exports.delayedCall = delayedCall;
    ;
});
