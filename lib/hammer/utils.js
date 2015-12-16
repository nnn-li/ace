var VENDOR_PREFIXES = ['', 'webkit', 'moz', 'MS', 'ms', 'o'];
export var TEST_ELEMENT = document.createElement('div');
var TYPE_FUNCTION = 'function';
var round = Math.round;
var abs = Math.abs;
var now = Date.now;
export function setTimeoutContext(fn, timeout, context) {
    return setTimeout(bindFn(fn, context), timeout);
}
export function invokeArrayArg(arg, fn, context) {
    if (Array.isArray(arg)) {
        each(arg, context[fn], context);
        return true;
    }
    return false;
}
export function each(obj, iterator, context) {
    var i;
    if (!obj) {
        return;
    }
    if (obj.forEach) {
        obj.forEach(iterator, context);
    }
    else if (obj.length !== undefined) {
        i = 0;
        while (i < obj.length) {
            iterator.call(context, obj[i], i, obj);
            i++;
        }
    }
    else {
        for (i in obj) {
            obj.hasOwnProperty(i) && iterator.call(context, obj[i], i, obj);
        }
    }
}
export function extend(dest, src, merge) {
    var keys = Object.keys(src);
    var i = 0;
    while (i < keys.length) {
        if (!merge || (merge && dest[keys[i]] === undefined)) {
            dest[keys[i]] = src[keys[i]];
        }
        i++;
    }
    return dest;
}
export function merge(dest, src) {
    return extend(dest, src, true);
}
export function inherit(child, base, properties) {
    var baseP = base.prototype, childP;
    childP = child.prototype = Object.create(baseP);
    childP.constructor = child;
    childP._super = baseP;
    if (properties) {
        extend(childP, properties);
    }
}
export function bindFn(fn, context) {
    return function boundFn() {
        return fn.apply(context, arguments);
    };
}
export function ifUndefined(val1, val2) {
    return (val1 === undefined) ? val2 : val1;
}
export function addEventListeners(eventTarget, types, handler) {
    each(splitStr(types), function (type) {
        eventTarget.addEventListener(type, handler, false);
    });
}
export function removeEventListeners(eventTarget, types, handler) {
    each(splitStr(types), function (type) {
        eventTarget.removeEventListener(type, handler, false);
    });
}
export function hasParent(node, parent) {
    while (node) {
        if (node == parent) {
            return true;
        }
        node = node.parentNode;
    }
    return false;
}
export function inStr(str, find) {
    return str.indexOf(find) > -1;
}
export function splitStr(str) {
    return str.trim().split(/\s+/g);
}
export function inArray(src, find, findByKey) {
    if (src.indexOf && !findByKey) {
        return src.indexOf(find);
    }
    else {
        var i = 0;
        while (i < src.length) {
            if ((findByKey && src[i][findByKey] == find) || (!findByKey && src[i] === find)) {
                return i;
            }
            i++;
        }
        return -1;
    }
}
export function toArray(obj) {
    return Array.prototype.slice.call(obj, 0);
}
export function uniqueArray(src, key, sort) {
    var results = [];
    var values = [];
    var i = 0;
    while (i < src.length) {
        var val = key ? src[i][key] : src[i];
        if (inArray(values, val) < 0) {
            results.push(src[i]);
        }
        values[i] = val;
        i++;
    }
    if (sort) {
        if (!key) {
            results = results.sort();
        }
        else {
            results = results.sort(function sortUniqueArray(a, b) {
                return a[key] > b[key] ? 1 : 0;
            });
        }
    }
    return results;
}
export function prefixed(obj, property) {
    var prefix, prop;
    var camelProp = property[0].toUpperCase() + property.slice(1);
    var i = 0;
    while (i < VENDOR_PREFIXES.length) {
        prefix = VENDOR_PREFIXES[i];
        prop = (prefix) ? prefix + camelProp : property;
        if (prop in obj) {
            return prop;
        }
        i++;
    }
    return undefined;
}
var _uniqueId = 1;
export function uniqueId() {
    return _uniqueId++;
}
export function getWindowForElement(element) {
    var doc = element.ownerDocument;
    if (doc) {
        return doc.defaultView || window;
    }
    else {
        return window;
    }
}
