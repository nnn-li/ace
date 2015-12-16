export function last(a) {
    return a[a.length - 1];
}
export function stringReverse(s) {
    return s.split("").reverse().join("");
}
export function stringRepeat(s, count) {
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
var trimBeginRegexp = /^\s\s*/;
var trimEndRegexp = /\s\s*$/;
export function stringTrimLeft(s) {
    return s.replace(trimBeginRegexp, '');
}
;
export function stringTrimRight(s) {
    return s.replace(trimEndRegexp, '');
}
export function copyObject(obj) {
    var copy = {};
    for (var key in obj) {
        copy[key] = obj[key];
    }
    return copy;
}
export function copyArray(array) {
    var copy = [];
    for (var i = 0, l = array.length; i < l; i++) {
        if (array[i] && typeof array[i] == "object")
            copy[i] = this.copyObject(array[i]);
        else
            copy[i] = array[i];
    }
    return copy;
}
export function deepCopy(obj) {
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
export function arrayToMap(xs, value) {
    var map = {};
    for (var i = 0, iLength = xs.length; i < iLength; i++) {
        map[xs[i]] = value;
    }
    return map;
}
export function createMap(props) {
    var map = Object.create(null);
    for (var i in props) {
        map[i] = props[i];
    }
    return map;
}
export function arrayRemove(array, value) {
    for (var i = 0; i <= array.length; i++) {
        if (value === array[i]) {
            array.splice(i, 1);
        }
    }
}
export function escapeRegExp(str) {
    return str.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1');
}
export function escapeHTML(str) {
    return str.replace(/&/g, "&#38;").replace(/"/g, "&#34;").replace(/'/g, "&#39;").replace(/</g, "&#60;");
}
;
export function getMatchOffsets(s, searchValue) {
    var matches = [];
    s.replace(searchValue, function (str) {
        matches.push({
            offset: arguments[arguments.length - 2],
            length: str.length
        });
        return "lang.getMatchOffsets";
    });
    return matches;
}
;
export function deferredCall(fcn) {
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
;
export function delayedCall(fcn, defaultTimeout) {
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
;
