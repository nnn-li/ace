define(["require", "exports"], function (require, exports) {
    var VENDOR_PREFIXES = ['', 'webkit', 'moz', 'MS', 'ms', 'o'];
    exports.TEST_ELEMENT = document.createElement('div');
    var TYPE_FUNCTION = 'function';
    var round = Math.round;
    var abs = Math.abs;
    var now = Date.now;
    /**
     * set a timeout with a given `this` scope.
     * @param {Function} fn
     * @param {Number} timeout
     * @param {Object} context
     * @return {number}
     */
    function setTimeoutContext(fn, timeout, context) {
        return setTimeout(bindFn(fn, context), timeout);
    }
    exports.setTimeoutContext = setTimeoutContext;
    /**
     * if the argument is an array, we want to execute the fn on each entry
     * if it aint an array we don't want to do a thing.
     * this is used by all the methods that accept a single and array argument.
     * @param {*|Array} arg
     * @param {String} fn
     * @param {Object} [context]
     * @return {Boolean}
     */
    function invokeArrayArg(arg, fn, context) {
        if (Array.isArray(arg)) {
            each(arg, context[fn], context);
            return true;
        }
        return false;
    }
    exports.invokeArrayArg = invokeArrayArg;
    /**
     * walk objects and arrays
     * @param {Object} obj
     * @param {Function} iterator
     * @param {Object} context
     */
    function each(obj, iterator, context) {
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
    exports.each = each;
    /**
     * extend object.
     * means that properties in dest will be overwritten by the ones in src.
     * @param {Object} dest
     * @param {Object} src
     * @param {Boolean} [merge]
     * @return {Object} dest
     */
    function extend(dest, src, merge) {
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
    exports.extend = extend;
    /**
     * merge the values from src in the dest.
     * means that properties that exist in dest will not be overwritten by src
     * @param {Object} dest
     * @param {Object} src
     * @return {Object} dest
     */
    function merge(dest, src) {
        return extend(dest, src, true);
    }
    exports.merge = merge;
    /**
     * simple class inheritance
     * @param {Function} child
     * @param {Function} base
     * @param {Object} [properties]
     */
    function inherit(child, base, properties) {
        var baseP = base.prototype, childP;
        childP = child.prototype = Object.create(baseP);
        childP.constructor = child;
        childP._super = baseP;
        if (properties) {
            extend(childP, properties);
        }
    }
    exports.inherit = inherit;
    /**
     * simple function bind
     * @param {Function} fn
     * @param {Object} context
     * @return {Function}
     */
    function bindFn(fn, context) {
        return function boundFn() {
            return fn.apply(context, arguments);
        };
    }
    exports.bindFn = bindFn;
    /**
     * use the val2 when val1 is undefined
     * @param {*} val1
     * @param {*} val2
     * @return {*}
     */
    function ifUndefined(val1, val2) {
        return (val1 === undefined) ? val2 : val1;
    }
    exports.ifUndefined = ifUndefined;
    /**
     * addEventListener with multiple events at once
     * @param {EventTarget} eventTarget
     * @param {String} types
     * @param {Function} handler
     */
    function addEventListeners(eventTarget, types, handler) {
        each(splitStr(types), function (type) {
            eventTarget.addEventListener(type, handler, false);
        });
    }
    exports.addEventListeners = addEventListeners;
    /**
     * removeEventListener with multiple events at once
     * @param {EventTarget} eventTarget
     * @param {String} types
     * @param {Function} handler
     */
    function removeEventListeners(eventTarget, types, handler) {
        each(splitStr(types), function (type) {
            eventTarget.removeEventListener(type, handler, false);
        });
    }
    exports.removeEventListeners = removeEventListeners;
    /**
     * find if a node is in the given parent
     * @method hasParent
     * @param {HTMLElement} node
     * @param {HTMLElement} parent
     * @return {Boolean} found
     */
    function hasParent(node, parent) {
        while (node) {
            if (node == parent) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    }
    exports.hasParent = hasParent;
    /**
     * small indexOf wrapper
     * @param {String} str
     * @param {String} find
     * @return {Boolean} found
     */
    function inStr(str, find) {
        return str.indexOf(find) > -1;
    }
    exports.inStr = inStr;
    /**
     * split string on whitespace
     * @param {String} str
     * @return {Array} words
     */
    function splitStr(str) {
        return str.trim().split(/\s+/g);
    }
    exports.splitStr = splitStr;
    /**
     * find if a array contains the object using indexOf or a simple polyFill
     * @param {Array} src
     * @param {String} find
     * @param {String} [findByKey]
     * @return {Boolean|Number} false when not found, or the index
     */
    function inArray(src, find, findByKey) {
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
    exports.inArray = inArray;
    /**
     * convert array-like objects to real arrays
     * @param {Object} obj
     * @return {Array}
     */
    function toArray(obj) {
        return Array.prototype.slice.call(obj, 0);
    }
    exports.toArray = toArray;
    /**
     * unique array with objects based on a key (like 'id') or just by the array's value
     * @param {Array} src [{id:1},{id:2},{id:1}]
     * @param {String} [key]
     * @param {Boolean} [sort=False]
     * @return {Array} [{id:1},{id:2}]
     */
    function uniqueArray(src, key, sort) {
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
    exports.uniqueArray = uniqueArray;
    /**
     * get the prefixed property
     * @param {Object} obj
     * @param {String} property
     * @return {String|Undefined} prefixed
     */
    function prefixed(obj, property) {
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
    exports.prefixed = prefixed;
    /**
     * get a unique id
     * @return {number} uniqueId
     */
    var _uniqueId = 1;
    function uniqueId() {
        return _uniqueId++;
    }
    exports.uniqueId = uniqueId;
    /**
     * get the window object of an element
     * @param {HTMLElement} element
     * @return {Window}
     */
    function getWindowForElement(element) {
        var doc = element.ownerDocument;
        if (doc) {
            return doc.defaultView || window;
        }
        else {
            return window;
        }
    }
    exports.getWindowForElement = getWindowForElement;
});
