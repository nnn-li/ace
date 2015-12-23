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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXRpbHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1dGlscy50cyJdLCJuYW1lcyI6WyJzZXRUaW1lb3V0Q29udGV4dCIsImludm9rZUFycmF5QXJnIiwiZWFjaCIsImV4dGVuZCIsIm1lcmdlIiwiaW5oZXJpdCIsImJpbmRGbiIsImJpbmRGbi5ib3VuZEZuIiwiaWZVbmRlZmluZWQiLCJhZGRFdmVudExpc3RlbmVycyIsInJlbW92ZUV2ZW50TGlzdGVuZXJzIiwiaGFzUGFyZW50IiwiaW5TdHIiLCJzcGxpdFN0ciIsImluQXJyYXkiLCJ0b0FycmF5IiwidW5pcXVlQXJyYXkiLCJ1bmlxdWVBcnJheS5zb3J0VW5pcXVlQXJyYXkiLCJwcmVmaXhlZCIsInVuaXF1ZUlkIiwiZ2V0V2luZG93Rm9yRWxlbWVudCJdLCJtYXBwaW5ncyI6IkFBQUEsSUFBSSxlQUFlLEdBQUcsQ0FBQyxFQUFFLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0FBQzdELFdBQVcsWUFBWSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7QUFFeEQsSUFBSSxhQUFhLEdBQUcsVUFBVSxDQUFDO0FBRS9CLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7QUFDdkIsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztBQUNuQixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO0FBU25CLGtDQUFrQyxFQUFFLEVBQUUsT0FBZSxFQUFFLE9BQU87SUFDMURBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLEVBQUVBLE9BQU9BLENBQUNBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0FBQ3BEQSxDQUFDQTtBQVdELCtCQUErQixHQUFHLEVBQUUsRUFBRSxFQUFFLE9BQU87SUFDM0NDLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUNoQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBQ0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0FBQ2pCQSxDQUFDQTtBQVFELHFCQUFxQixHQUFHLEVBQUUsUUFBUSxFQUFFLE9BQVE7SUFDeENDLElBQUlBLENBQUNBLENBQUNBO0lBRU5BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ1BBLE1BQU1BLENBQUNBO0lBQ1hBLENBQUNBO0lBRURBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1FBQ2RBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQ25DQSxDQUFDQTtJQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDTkEsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFDcEJBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3ZDQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNSQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNKQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNaQSxHQUFHQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNwRUEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7QUFDTEEsQ0FBQ0E7QUFVRCx1QkFBdUIsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFlO0lBQzdDQyxJQUFJQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUM1QkEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDVkEsT0FBT0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25EQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7UUFDREEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7SUFDUkEsQ0FBQ0E7SUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7QUFDaEJBLENBQUNBO0FBU0Qsc0JBQXNCLElBQUksRUFBRSxHQUFHO0lBQzNCQyxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtBQUNuQ0EsQ0FBQ0E7QUFRRCx3QkFBd0IsS0FBSyxFQUFFLElBQUksRUFBRSxVQUFVO0lBQzNDQyxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUN0QkEsTUFBTUEsQ0FBQ0E7SUFFWEEsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsU0FBU0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDaERBLE1BQU1BLENBQUNBLFdBQVdBLEdBQUdBLEtBQUtBLENBQUNBO0lBQzNCQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQTtJQUV0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDL0JBLENBQUNBO0FBQ0xBLENBQUNBO0FBUUQsdUJBQXVCLEVBQUUsRUFBRSxPQUFPO0lBQzlCQyxNQUFNQSxDQUFDQTtRQUNIQyxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN4Q0EsQ0FBQ0EsQ0FBQ0Q7QUFDTkEsQ0FBQ0E7QUFRRCw0QkFBNEIsSUFBSSxFQUFFLElBQUk7SUFDbENFLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLFNBQVNBLENBQUNBLEdBQUdBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO0FBQzlDQSxDQUFDQTtBQVFELGtDQUFrQyxXQUF3QixFQUFFLEtBQWEsRUFBRSxPQUFPO0lBQzlFQyxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxVQUFTQSxJQUFJQTtRQUMvQixXQUFXLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN2RCxDQUFDLENBQUNBLENBQUNBO0FBQ1BBLENBQUNBO0FBUUQscUNBQXFDLFdBQXdCLEVBQUUsS0FBYSxFQUFFLE9BQU87SUFDakZDLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLFVBQVNBLElBQUlBO1FBQy9CLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzFELENBQUMsQ0FBQ0EsQ0FBQ0E7QUFDUEEsQ0FBQ0E7QUFTRCwwQkFBMEIsSUFBUyxFQUFFLE1BQW1CO0lBQ3BEQyxPQUFPQSxJQUFJQSxFQUFFQSxDQUFDQTtRQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO1FBQ0RBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO0lBQzNCQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtBQUNqQkEsQ0FBQ0E7QUFRRCxzQkFBc0IsR0FBVyxFQUFFLElBQVk7SUFDM0NDLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO0FBQ2xDQSxDQUFDQTtBQU9ELHlCQUF5QixHQUFHO0lBQ3hCQyxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtBQUNwQ0EsQ0FBQ0E7QUFTRCx3QkFBd0IsR0FBVSxFQUFFLElBQUksRUFBRSxTQUFrQjtJQUN4REMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUJBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQzdCQSxDQUFDQTtJQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNKQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzlFQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxDQUFDQTtZQUNEQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNSQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNkQSxDQUFDQTtBQUNMQSxDQUFDQTtBQU9ELHdCQUF3QixHQUFHO0lBQ3ZCQyxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtBQUM5Q0EsQ0FBQ0E7QUFTRCw0QkFBNEIsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJO0lBQ3RDQyxJQUFJQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUNqQkEsSUFBSUEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDaEJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO0lBRVZBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO1FBQ3BCQSxJQUFJQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNyQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pCQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQTtRQUNoQkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7SUFDUkEsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDUEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsT0FBT0EsR0FBR0EsT0FBT0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLE9BQU9BLEdBQUdBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLHlCQUF5QkEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ2hEQyxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNuQ0EsQ0FBQ0EsQ0FBQ0QsQ0FBQ0E7UUFDUEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFREEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7QUFDbkJBLENBQUNBO0FBUUQseUJBQXlCLEdBQUcsRUFBRSxRQUFRO0lBQ2xDRSxJQUFJQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQTtJQUNqQkEsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsRUFBRUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFFOURBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO0lBQ1ZBLE9BQU9BLENBQUNBLEdBQUdBLGVBQWVBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO1FBQ2hDQSxNQUFNQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM1QkEsSUFBSUEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsTUFBTUEsR0FBR0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFaERBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBQ2hCQSxDQUFDQTtRQUNEQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUNSQSxDQUFDQTtJQUNEQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtBQUNyQkEsQ0FBQ0E7QUFNRCxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbEI7SUFDSUMsTUFBTUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7QUFDdkJBLENBQUNBO0FBT0Qsb0NBQW9DLE9BQW9CO0lBQ3BEQyxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQTtJQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDTkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsV0FBV0EsSUFBSUEsTUFBTUEsQ0FBQ0E7SUFDckNBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO0lBQ2xCQSxDQUFDQTtBQUNMQSxDQUFDQSIsInNvdXJjZXNDb250ZW50IjpbInZhciBWRU5ET1JfUFJFRklYRVMgPSBbJycsICd3ZWJraXQnLCAnbW96JywgJ01TJywgJ21zJywgJ28nXTtcbmV4cG9ydCB2YXIgVEVTVF9FTEVNRU5UID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cbnZhciBUWVBFX0ZVTkNUSU9OID0gJ2Z1bmN0aW9uJztcblxudmFyIHJvdW5kID0gTWF0aC5yb3VuZDtcbnZhciBhYnMgPSBNYXRoLmFicztcbnZhciBub3cgPSBEYXRlLm5vdztcblxuLyoqXG4gKiBzZXQgYSB0aW1lb3V0IHdpdGggYSBnaXZlbiBgdGhpc2Agc2NvcGUuXG4gKiBwYXJhbSB7RnVuY3Rpb259IGZuXG4gKiBwYXJhbSB7TnVtYmVyfSB0aW1lb3V0XG4gKiBwYXJhbSB7T2JqZWN0fSBjb250ZXh0XG4gKiByZXR1cm4ge251bWJlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldFRpbWVvdXRDb250ZXh0KGZuLCB0aW1lb3V0OiBudW1iZXIsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gc2V0VGltZW91dChiaW5kRm4oZm4sIGNvbnRleHQpLCB0aW1lb3V0KTtcbn1cblxuLyoqXG4gKiBpZiB0aGUgYXJndW1lbnQgaXMgYW4gYXJyYXksIHdlIHdhbnQgdG8gZXhlY3V0ZSB0aGUgZm4gb24gZWFjaCBlbnRyeVxuICogaWYgaXQgYWludCBhbiBhcnJheSB3ZSBkb24ndCB3YW50IHRvIGRvIGEgdGhpbmcuXG4gKiB0aGlzIGlzIHVzZWQgYnkgYWxsIHRoZSBtZXRob2RzIHRoYXQgYWNjZXB0IGEgc2luZ2xlIGFuZCBhcnJheSBhcmd1bWVudC5cbiAqIHBhcmFtIHsqfEFycmF5fSBhcmdcbiAqIHBhcmFtIHtTdHJpbmd9IGZuXG4gKiBwYXJhbSB7T2JqZWN0fSBbY29udGV4dF1cbiAqIHJldHVybiB7Qm9vbGVhbn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludm9rZUFycmF5QXJnKGFyZywgZm4sIGNvbnRleHQpIHtcbiAgICBpZiAoQXJyYXkuaXNBcnJheShhcmcpKSB7XG4gICAgICAgIGVhY2goYXJnLCBjb250ZXh0W2ZuXSwgY29udGV4dCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8qKlxuICogd2FsayBvYmplY3RzIGFuZCBhcnJheXNcbiAqIHBhcmFtIHtPYmplY3R9IG9ialxuICogcGFyYW0ge0Z1bmN0aW9ufSBpdGVyYXRvclxuICogcGFyYW0ge09iamVjdH0gY29udGV4dFxuICovXG5leHBvcnQgZnVuY3Rpb24gZWFjaChvYmosIGl0ZXJhdG9yLCBjb250ZXh0Pykge1xuICAgIHZhciBpO1xuXG4gICAgaWYgKCFvYmopIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChvYmouZm9yRWFjaCkge1xuICAgICAgICBvYmouZm9yRWFjaChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgfSBlbHNlIGlmIChvYmoubGVuZ3RoICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgaSA9IDA7XG4gICAgICAgIHdoaWxlIChpIDwgb2JqLmxlbmd0aCkge1xuICAgICAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpbaV0sIGksIG9iaik7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKGkgaW4gb2JqKSB7XG4gICAgICAgICAgICBvYmouaGFzT3duUHJvcGVydHkoaSkgJiYgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpbaV0sIGksIG9iaik7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8qKlxuICogZXh0ZW5kIG9iamVjdC5cbiAqIG1lYW5zIHRoYXQgcHJvcGVydGllcyBpbiBkZXN0IHdpbGwgYmUgb3ZlcndyaXR0ZW4gYnkgdGhlIG9uZXMgaW4gc3JjLlxuICogcGFyYW0ge09iamVjdH0gZGVzdFxuICogcGFyYW0ge09iamVjdH0gc3JjXG4gKiBwYXJhbSB7Qm9vbGVhbn0gW21lcmdlXVxuICogcmV0dXJuIHtPYmplY3R9IGRlc3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4dGVuZChkZXN0LCBzcmMsIG1lcmdlPzogYm9vbGVhbikge1xuICAgIHZhciBrZXlzID0gT2JqZWN0LmtleXMoc3JjKTtcbiAgICB2YXIgaSA9IDA7XG4gICAgd2hpbGUgKGkgPCBrZXlzLmxlbmd0aCkge1xuICAgICAgICBpZiAoIW1lcmdlIHx8IChtZXJnZSAmJiBkZXN0W2tleXNbaV1dID09PSB1bmRlZmluZWQpKSB7XG4gICAgICAgICAgICBkZXN0W2tleXNbaV1dID0gc3JjW2tleXNbaV1dO1xuICAgICAgICB9XG4gICAgICAgIGkrKztcbiAgICB9XG4gICAgcmV0dXJuIGRlc3Q7XG59XG5cbi8qKlxuICogbWVyZ2UgdGhlIHZhbHVlcyBmcm9tIHNyYyBpbiB0aGUgZGVzdC5cbiAqIG1lYW5zIHRoYXQgcHJvcGVydGllcyB0aGF0IGV4aXN0IGluIGRlc3Qgd2lsbCBub3QgYmUgb3ZlcndyaXR0ZW4gYnkgc3JjXG4gKiBwYXJhbSB7T2JqZWN0fSBkZXN0XG4gKiBwYXJhbSB7T2JqZWN0fSBzcmNcbiAqIHJldHVybiB7T2JqZWN0fSBkZXN0XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZShkZXN0LCBzcmMpIHtcbiAgICByZXR1cm4gZXh0ZW5kKGRlc3QsIHNyYywgdHJ1ZSk7XG59XG5cbi8qKlxuICogc2ltcGxlIGNsYXNzIGluaGVyaXRhbmNlXG4gKiBwYXJhbSB7RnVuY3Rpb259IGNoaWxkXG4gKiBwYXJhbSB7RnVuY3Rpb259IGJhc2VcbiAqIHBhcmFtIHtPYmplY3R9IFtwcm9wZXJ0aWVzXVxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5oZXJpdChjaGlsZCwgYmFzZSwgcHJvcGVydGllcykge1xuICAgIHZhciBiYXNlUCA9IGJhc2UucHJvdG90eXBlLFxuICAgICAgICBjaGlsZFA7XG5cbiAgICBjaGlsZFAgPSBjaGlsZC5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKGJhc2VQKTtcbiAgICBjaGlsZFAuY29uc3RydWN0b3IgPSBjaGlsZDtcbiAgICBjaGlsZFAuX3N1cGVyID0gYmFzZVA7XG5cbiAgICBpZiAocHJvcGVydGllcykge1xuICAgICAgICBleHRlbmQoY2hpbGRQLCBwcm9wZXJ0aWVzKTtcbiAgICB9XG59XG5cbi8qKlxuICogc2ltcGxlIGZ1bmN0aW9uIGJpbmRcbiAqIHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIHBhcmFtIHtPYmplY3R9IGNvbnRleHRcbiAqIHJldHVybiB7RnVuY3Rpb259XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiaW5kRm4oZm4sIGNvbnRleHQpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gYm91bmRGbigpIHtcbiAgICAgICAgcmV0dXJuIGZuLmFwcGx5KGNvbnRleHQsIGFyZ3VtZW50cyk7XG4gICAgfTtcbn1cblxuLyoqXG4gKiB1c2UgdGhlIHZhbDIgd2hlbiB2YWwxIGlzIHVuZGVmaW5lZFxuICogcGFyYW0geyp9IHZhbDFcbiAqIHBhcmFtIHsqfSB2YWwyXG4gKiByZXR1cm4geyp9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpZlVuZGVmaW5lZCh2YWwxLCB2YWwyKSB7XG4gICAgcmV0dXJuICh2YWwxID09PSB1bmRlZmluZWQpID8gdmFsMiA6IHZhbDE7XG59XG5cbi8qKlxuICogYWRkRXZlbnRMaXN0ZW5lciB3aXRoIG11bHRpcGxlIGV2ZW50cyBhdCBvbmNlXG4gKiBwYXJhbSB7RXZlbnRUYXJnZXR9IGV2ZW50VGFyZ2V0XG4gKiBwYXJhbSB7U3RyaW5nfSB0eXBlc1xuICogcGFyYW0ge0Z1bmN0aW9ufSBoYW5kbGVyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZGRFdmVudExpc3RlbmVycyhldmVudFRhcmdldDogRXZlbnRUYXJnZXQsIHR5cGVzOiBzdHJpbmcsIGhhbmRsZXIpIHtcbiAgICBlYWNoKHNwbGl0U3RyKHR5cGVzKSwgZnVuY3Rpb24odHlwZSkge1xuICAgICAgICBldmVudFRhcmdldC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGhhbmRsZXIsIGZhbHNlKTtcbiAgICB9KTtcbn1cblxuLyoqXG4gKiByZW1vdmVFdmVudExpc3RlbmVyIHdpdGggbXVsdGlwbGUgZXZlbnRzIGF0IG9uY2VcbiAqIHBhcmFtIHtFdmVudFRhcmdldH0gZXZlbnRUYXJnZXRcbiAqIHBhcmFtIHtTdHJpbmd9IHR5cGVzXG4gKiBwYXJhbSB7RnVuY3Rpb259IGhhbmRsZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUV2ZW50TGlzdGVuZXJzKGV2ZW50VGFyZ2V0OiBFdmVudFRhcmdldCwgdHlwZXM6IHN0cmluZywgaGFuZGxlcikge1xuICAgIGVhY2goc3BsaXRTdHIodHlwZXMpLCBmdW5jdGlvbih0eXBlKSB7XG4gICAgICAgIGV2ZW50VGFyZ2V0LnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgaGFuZGxlciwgZmFsc2UpO1xuICAgIH0pO1xufVxuXG4vKipcbiAqIGZpbmQgaWYgYSBub2RlIGlzIGluIHRoZSBnaXZlbiBwYXJlbnRcbiAqIG1ldGhvZCBoYXNQYXJlbnRcbiAqIHBhcmFtIHtIVE1MRWxlbWVudH0gbm9kZVxuICogcGFyYW0ge0hUTUxFbGVtZW50fSBwYXJlbnRcbiAqIHJldHVybiB7Qm9vbGVhbn0gZm91bmRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc1BhcmVudChub2RlOiBhbnksIHBhcmVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcbiAgICB3aGlsZSAobm9kZSkge1xuICAgICAgICBpZiAobm9kZSA9PSBwYXJlbnQpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIG5vZGUgPSBub2RlLnBhcmVudE5vZGU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBzbWFsbCBpbmRleE9mIHdyYXBwZXJcbiAqIHBhcmFtIHtTdHJpbmd9IHN0clxuICogcGFyYW0ge1N0cmluZ30gZmluZFxuICogcmV0dXJuIHtCb29sZWFufSBmb3VuZFxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5TdHIoc3RyOiBzdHJpbmcsIGZpbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBzdHIuaW5kZXhPZihmaW5kKSA+IC0xO1xufVxuXG4vKipcbiAqIHNwbGl0IHN0cmluZyBvbiB3aGl0ZXNwYWNlXG4gKiBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIHJldHVybiB7QXJyYXl9IHdvcmRzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzcGxpdFN0cihzdHIpIHtcbiAgICByZXR1cm4gc3RyLnRyaW0oKS5zcGxpdCgvXFxzKy9nKTtcbn1cblxuLyoqXG4gKiBmaW5kIGlmIGEgYXJyYXkgY29udGFpbnMgdGhlIG9iamVjdCB1c2luZyBpbmRleE9mIG9yIGEgc2ltcGxlIHBvbHlGaWxsXG4gKiBwYXJhbSB7QXJyYXl9IHNyY1xuICogcGFyYW0ge1N0cmluZ30gZmluZFxuICogcGFyYW0ge1N0cmluZ30gW2ZpbmRCeUtleV1cbiAqIHJldHVybiB7Qm9vbGVhbnxOdW1iZXJ9IGZhbHNlIHdoZW4gbm90IGZvdW5kLCBvciB0aGUgaW5kZXhcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGluQXJyYXkoc3JjOiBhbnlbXSwgZmluZCwgZmluZEJ5S2V5Pzogc3RyaW5nKSB7XG4gICAgaWYgKHNyYy5pbmRleE9mICYmICFmaW5kQnlLZXkpIHtcbiAgICAgICAgcmV0dXJuIHNyYy5pbmRleE9mKGZpbmQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgd2hpbGUgKGkgPCBzcmMubGVuZ3RoKSB7XG4gICAgICAgICAgICBpZiAoKGZpbmRCeUtleSAmJiBzcmNbaV1bZmluZEJ5S2V5XSA9PSBmaW5kKSB8fCAoIWZpbmRCeUtleSAmJiBzcmNbaV0gPT09IGZpbmQpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpKys7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIC0xO1xuICAgIH1cbn1cblxuLyoqXG4gKiBjb252ZXJ0IGFycmF5LWxpa2Ugb2JqZWN0cyB0byByZWFsIGFycmF5c1xuICogcGFyYW0ge09iamVjdH0gb2JqXG4gKiByZXR1cm4ge0FycmF5fVxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9BcnJheShvYmopIHtcbiAgICByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwob2JqLCAwKTtcbn1cblxuLyoqXG4gKiB1bmlxdWUgYXJyYXkgd2l0aCBvYmplY3RzIGJhc2VkIG9uIGEga2V5IChsaWtlICdpZCcpIG9yIGp1c3QgYnkgdGhlIGFycmF5J3MgdmFsdWVcbiAqIHBhcmFtIHtBcnJheX0gc3JjIFt7aWQ6MX0se2lkOjJ9LHtpZDoxfV1cbiAqIHBhcmFtIHtTdHJpbmd9IFtrZXldXG4gKiBwYXJhbSB7Qm9vbGVhbn0gW3NvcnQ9RmFsc2VdXG4gKiByZXR1cm4ge0FycmF5fSBbe2lkOjF9LHtpZDoyfV1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVuaXF1ZUFycmF5KHNyYywga2V5LCBzb3J0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICB2YXIgdmFsdWVzID0gW107XG4gICAgdmFyIGkgPSAwO1xuXG4gICAgd2hpbGUgKGkgPCBzcmMubGVuZ3RoKSB7XG4gICAgICAgIHZhciB2YWwgPSBrZXkgPyBzcmNbaV1ba2V5XSA6IHNyY1tpXTtcbiAgICAgICAgaWYgKGluQXJyYXkodmFsdWVzLCB2YWwpIDwgMCkge1xuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKHNyY1tpXSk7XG4gICAgICAgIH1cbiAgICAgICAgdmFsdWVzW2ldID0gdmFsO1xuICAgICAgICBpKys7XG4gICAgfVxuXG4gICAgaWYgKHNvcnQpIHtcbiAgICAgICAgaWYgKCFrZXkpIHtcbiAgICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLnNvcnQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLnNvcnQoZnVuY3Rpb24gc29ydFVuaXF1ZUFycmF5KGEsIGIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gYVtrZXldID4gYltrZXldID8gMSA6IDA7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZXN1bHRzO1xufVxuXG4vKipcbiAqIGdldCB0aGUgcHJlZml4ZWQgcHJvcGVydHlcbiAqIHBhcmFtIHtPYmplY3R9IG9ialxuICogcGFyYW0ge1N0cmluZ30gcHJvcGVydHlcbiAqIHJldHVybiB7U3RyaW5nfFVuZGVmaW5lZH0gcHJlZml4ZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHByZWZpeGVkKG9iaiwgcHJvcGVydHkpIHtcbiAgICB2YXIgcHJlZml4LCBwcm9wO1xuICAgIHZhciBjYW1lbFByb3AgPSBwcm9wZXJ0eVswXS50b1VwcGVyQ2FzZSgpICsgcHJvcGVydHkuc2xpY2UoMSk7XG5cbiAgICB2YXIgaSA9IDA7XG4gICAgd2hpbGUgKGkgPCBWRU5ET1JfUFJFRklYRVMubGVuZ3RoKSB7XG4gICAgICAgIHByZWZpeCA9IFZFTkRPUl9QUkVGSVhFU1tpXTtcbiAgICAgICAgcHJvcCA9IChwcmVmaXgpID8gcHJlZml4ICsgY2FtZWxQcm9wIDogcHJvcGVydHk7XG5cbiAgICAgICAgaWYgKHByb3AgaW4gb2JqKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvcDtcbiAgICAgICAgfVxuICAgICAgICBpKys7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogZ2V0IGEgdW5pcXVlIGlkXG4gKiByZXR1cm4ge251bWJlcn0gdW5pcXVlSWRcbiAqL1xudmFyIF91bmlxdWVJZCA9IDE7XG5leHBvcnQgZnVuY3Rpb24gdW5pcXVlSWQoKSB7XG4gICAgcmV0dXJuIF91bmlxdWVJZCsrO1xufVxuXG4vKipcbiAqIGdldCB0aGUgd2luZG93IG9iamVjdCBvZiBhbiBlbGVtZW50XG4gKiBwYXJhbSB7SFRNTEVsZW1lbnR9IGVsZW1lbnRcbiAqIHJldHVybiB7V2luZG93fVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0V2luZG93Rm9yRWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IFdpbmRvdyB7XG4gICAgdmFyIGRvYyA9IGVsZW1lbnQub3duZXJEb2N1bWVudDtcbiAgICBpZiAoZG9jKSB7XG4gICAgICAgIHJldHVybiBkb2MuZGVmYXVsdFZpZXcgfHwgd2luZG93O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHdpbmRvdztcbiAgICB9XG59XG4iXX0=