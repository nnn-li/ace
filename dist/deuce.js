(function(global, define) {
  var globalDefine = global.define;
/**
 * @license almond 0.3.1 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                //Lop off the last part of baseParts, so that . matches the
                //"directory" and not name of the baseName's module. For instance,
                //baseName of "one/two/three", maps to "one/two/three.js", but we
                //want the directory, "one/two" for this normalization.
                name = baseParts.slice(0, baseParts.length - 1).concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("../vendor/almond/almond", function(){});

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
define('lib/dom',["require", "exports"], function (require, exports) {
    var XHTML_NS = "http://www.w3.org/1999/xhtml";
    function getDocumentHead(doc) {
        if (doc === void 0) { doc = document; }
        return (doc.head || doc.getElementsByTagName("head")[0] || doc.documentElement);
    }
    exports.getDocumentHead = getDocumentHead;
    function getDocumentBody(doc) {
        if (doc === void 0) { doc = document; }
        return (doc.body || doc.getElementsByTagName("body")[0]);
    }
    exports.getDocumentBody = getDocumentBody;
    function createElement(tagName, namespaceURI) {
        return document.createElementNS ?
            document.createElementNS(namespaceURI || XHTML_NS, tagName) :
            document.createElement(tagName);
    }
    exports.createElement = createElement;
    function hasCssClass(element, name) {
        var classes = element.className.split(/\s+/g);
        return classes.indexOf(name) !== -1;
    }
    exports.hasCssClass = hasCssClass;
    /**
     * Add a CSS class to the list of classes on the given node
     */
    function addCssClass(element, name) {
        if (!hasCssClass(element, name)) {
            element.className += " " + name;
        }
    }
    exports.addCssClass = addCssClass;
    /**
     * Remove a CSS class from the list of classes on the given node
     */
    function removeCssClass(element, name) {
        var classes = element.className.split(/\s+/g);
        while (true) {
            var index = classes.indexOf(name);
            if (index === -1) {
                break;
            }
            classes.splice(index, 1);
        }
        element.className = classes.join(" ");
    }
    exports.removeCssClass = removeCssClass;
    function toggleCssClass(element, name) {
        var classes = element.className.split(/\s+/g);
        var add = true;
        while (true) {
            var index = classes.indexOf(name);
            if (index == -1) {
                break;
            }
            add = false;
            classes.splice(index, 1);
        }
        if (add)
            classes.push(name);
        element.className = classes.join(" ");
        return add;
    }
    exports.toggleCssClass = toggleCssClass;
    /*
     * Add or remove a CSS class from the list of classes on the given node
     * depending on the value of <tt>include</tt>
     */
    function setCssClass(node, className, include) {
        if (include) {
            addCssClass(node, className);
        }
        else {
            removeCssClass(node, className);
        }
    }
    exports.setCssClass = setCssClass;
    function hasCssString(id, doc) {
        if (doc === void 0) { doc = document; }
        var index = 0;
        var sheets = doc.getElementsByTagName('style');
        if (sheets) {
            while (index < sheets.length) {
                if (sheets[index++].id === id) {
                    return true;
                }
            }
        }
        return false;
    }
    exports.hasCssString = hasCssString;
    function importCssString(cssText, id, doc) {
        if (doc === void 0) { doc = document; }
        // If style is already imported return immediately.
        if (id && hasCssString(id, doc)) {
            return;
        }
        else {
            var style = createElement('style');
            style.appendChild(doc.createTextNode(cssText));
            if (id) {
                style.id = id;
            }
            getDocumentHead(doc).appendChild(style);
        }
    }
    exports.importCssString = importCssString;
    function importCssStylsheet(href, doc) {
        var link = createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        getDocumentHead(doc).appendChild(link);
    }
    exports.importCssStylsheet = importCssStylsheet;
    /*
    export function getInnerWidth(element: HTMLElement): number {
        return (
            parseInt(exports.computedStyle(element, "paddingLeft"), 10) +
            parseInt(exports.computedStyle(element, "paddingRight"), 10) +
            element.clientWidth
        );
    }
    */
    /*
    export function getInnerHeight(element: HTMLElement): number {
        return (
            parseInt(exports.computedStyle(element, "paddingTop"), 10) +
            parseInt(exports.computedStyle(element, "paddingBottom"), 10) +
            element.clientHeight
        );
    }
    */
    /*
    if (window.pageYOffset !== undefined) {
        exports.getPageScrollTop = function() {
            return window.pageYOffset;
        };
    
        exports.getPageScrollLeft = function() {
            return window.pageXOffset;
        };
    }
    else {
        exports.getPageScrollTop = function() {
            return document.body.scrollTop;
        };
    
        exports.getPageScrollLeft = function() {
            return document.body.scrollLeft;
        };
    }
    */
    // FIXME: I don't like this because we lose type safety.
    function makeComputedStyle() {
        if (window.getComputedStyle) {
            // You can also call getPropertyValue!
            return function (element, style) {
                return (window.getComputedStyle(element, "") || {})[style] || "";
            };
        }
        else {
            return function (element, style) {
                if (style) {
                    return element['currentStyle'][style];
                }
                return element['currentStyle'];
            };
        }
    }
    exports.computedStyle = makeComputedStyle();
    // FIXME
    /*
    if (window.getComputedStyle)
        exports.computedStyle = function(element, style): any {
            if (style)
                return (window.getComputedStyle(element, "") || {})[style] || "";
            return window.getComputedStyle(element, "") || {};
        };
    else
        exports.computedStyle = function(element, style) {
            if (style)
                return element.currentStyle[style];
            return element.currentStyle;
        };
    */
    function scrollbarWidth(document) {
        var inner = createElement("ace_inner");
        inner.style.width = "100%";
        inner.style.minWidth = "0px";
        inner.style.height = "200px";
        inner.style.display = "block";
        var outer = createElement("ace_outer");
        var style = outer.style;
        style.position = "absolute";
        style.left = "-10000px";
        style.overflow = "hidden";
        style.width = "200px";
        style.minWidth = "0px";
        style.height = "150px";
        style.display = "block";
        outer.appendChild(inner);
        var body = document.documentElement;
        body.appendChild(outer);
        var noScrollbar = inner.offsetWidth;
        style.overflow = "scroll";
        var withScrollbar = inner.offsetWidth;
        if (noScrollbar === withScrollbar) {
            withScrollbar = outer.clientWidth;
        }
        body.removeChild(outer);
        return noScrollbar - withScrollbar;
    }
    exports.scrollbarWidth = scrollbarWidth;
    /*
     * Optimized set innerHTML. This is faster than plain innerHTML if the element
     * already contains a lot of child elements.
     *
     * See http://blog.stevenlevithan.com/archives/faster-than-innerhtml for details
     */
    function setInnerHtml(element, innerHTML) {
        var clonedElement = element.cloneNode(false);
        clonedElement.innerHTML = innerHTML;
        element.parentNode.replaceChild(clonedElement, element);
        return clonedElement;
    }
    exports.setInnerHtml = setInnerHtml;
    function makeGetInnerText() {
        if ("textContent" in document.documentElement) {
            return function (el) {
                return el.textContent;
            };
        }
        else {
            return function (el) {
                return el.innerText;
            };
        }
    }
    function makeSetInnerText() {
        if ("textContent" in document.documentElement) {
            return function (el, innerText) {
                el.textContent = innerText;
            };
        }
        else {
            return function (el, innerText) {
                el.innerText = innerText;
            };
        }
    }
    exports.getInnerText = makeGetInnerText();
    exports.setInnerText = makeSetInnerText();
    function getParentWindow(document) {
        // This is a bit redundant now that parentWindow has been removed.
        return document.defaultView;
    }
    exports.getParentWindow = getParentWindow;
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
define('lib/oop',["require", "exports"], function (require, exports) {
    /**
     * Classic ACE
     */
    function inherits(ctor, superCtor) {
        ctor.super_ = superCtor;
        ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
                value: ctor,
                enumerable: false,
                writable: true,
                configurable: true
            }
        });
    }
    exports.inherits = inherits;
    /**
     * Classic ACE
     */
    function mixin(obj, base) {
        for (var key in base) {
            obj[key] = base[key];
        }
        return obj;
    }
    exports.mixin = mixin;
    /**
     * Classic ACE
     */
    function implement(proto, base) {
        mixin(proto, base);
    }
    exports.implement = implement;
});

/*! @license
==========================================================================
SproutCore -- JavaScript Application Framework
copyright 2006-2009, Sprout Systems Inc., Apple Inc. and contributors.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

SproutCore and the SproutCore logo are trademarks of Sprout Systems, Inc.

For more information about SproutCore, visit http://www.sproutcore.com


==========================================================================
@license */
define('lib/keys',["require", "exports", './oop'], function (require, exports, oop_1) {
    /*
     * Helper functions and hashes for key handling.
     */
    var Keys = {
        MODIFIER_KEYS: {
            16: 'Shift', 17: 'Ctrl', 18: 'Alt', 224: 'Meta'
        },
        KEY_MODS: {
            "ctrl": 1, "alt": 2, "option": 2, "shift": 4,
            "super": 8, "meta": 8, "command": 8, "cmd": 8
        },
        FUNCTION_KEYS: {
            8: "Backspace",
            9: "Tab",
            13: "Return",
            19: "Pause",
            27: "Esc",
            32: "Space",
            33: "PageUp",
            34: "PageDown",
            35: "End",
            36: "Home",
            37: "Left",
            38: "Up",
            39: "Right",
            40: "Down",
            44: "Print",
            45: "Insert",
            46: "Delete",
            96: "Numpad0",
            97: "Numpad1",
            98: "Numpad2",
            99: "Numpad3",
            100: "Numpad4",
            101: "Numpad5",
            102: "Numpad6",
            103: "Numpad7",
            104: "Numpad8",
            105: "Numpad9",
            '-13': "NumpadEnter",
            112: "F1",
            113: "F2",
            114: "F3",
            115: "F4",
            116: "F5",
            117: "F6",
            118: "F7",
            119: "F8",
            120: "F9",
            121: "F10",
            122: "F11",
            123: "F12",
            144: "Numlock",
            145: "Scrolllock"
        },
        PRINTABLE_KEYS: {
            32: ' ', 48: '0', 49: '1', 50: '2', 51: '3', 52: '4', 53: '5',
            54: '6', 55: '7', 56: '8', 57: '9', 59: ';', 61: '=', 65: 'a',
            66: 'b', 67: 'c', 68: 'd', 69: 'e', 70: 'f', 71: 'g', 72: 'h',
            73: 'i', 74: 'j', 75: 'k', 76: 'l', 77: 'm', 78: 'n', 79: 'o',
            80: 'p', 81: 'q', 82: 'r', 83: 's', 84: 't', 85: 'u', 86: 'v',
            87: 'w', 88: 'x', 89: 'y', 90: 'z', 107: '+', 109: '-', 110: '.',
            187: '=', 188: ',', 189: '-', 190: '.', 191: '/', 192: '`', 219: '[',
            220: '\\', 221: ']', 222: '\''
        },
        enter: 13,
        esc: 27,
        escape: 27,
        del: 46
    };
    // A reverse map of FUNCTION_KEYS
    var name, i;
    for (i in Keys.FUNCTION_KEYS) {
        name = Keys.FUNCTION_KEYS[i].toLowerCase();
        Keys[name] = parseInt(i, 10);
    }
    // A reverse map of PRINTABLE_KEYS
    for (i in Keys.PRINTABLE_KEYS) {
        name = Keys.PRINTABLE_KEYS[i].toLowerCase();
        Keys[name] = parseInt(i, 10);
    }
    // Add the MODIFIER_KEYS, FUNCTION_KEYS and PRINTABLE_KEYS to the KEY variables as well.
    oop_1.mixin(Keys, Keys.MODIFIER_KEYS);
    oop_1.mixin(Keys, Keys.PRINTABLE_KEYS);
    oop_1.mixin(Keys, Keys.FUNCTION_KEYS);
    // workaround for firefox bug
    Keys[173] = '-';
    (function () {
        // Why do I need to set any here rather than string?
        var mods = ["cmd", "ctrl", "alt", "shift"];
        for (var i = Math.pow(2, mods.length); i--;) {
            var f = function (s) {
                return i & Keys.KEY_MODS[s];
            };
            var filtrate = mods.filter(f);
            Keys.KEY_MODS[i] = mods.filter(f).join("-") + "-";
        }
    })();
    exports.FUNCTION_KEYS = Keys.FUNCTION_KEYS;
    exports.PRINTABLE_KEYS = Keys.PRINTABLE_KEYS;
    exports.MODIFIER_KEYS = Keys.MODIFIER_KEYS;
    exports.KEY_MODS = Keys.KEY_MODS;
    // aliases
    exports.enter = Keys["return"];
    exports.escape = Keys.esc;
    exports.del = Keys["delete"];
    function keyCodeToString(keyCode) {
        // Language-switching keystroke in Chrome/Linux emits keyCode 0.
        var keyString = Keys[keyCode];
        if (typeof keyString !== "string") {
            keyString = String.fromCharCode(keyCode);
        }
        return keyString.toLowerCase();
    }
    exports.keyCodeToString = keyCodeToString;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Keys;
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
define('lib/useragent',["require", "exports"], function (require, exports) {
    "use strict";
    /*
     * I hate doing this, but we need some way to determine if the user is on a Mac
     * The reason is that users have different expectations of their key combinations.
     *
     * Take copy as an example, Mac people expect to use CMD or APPLE + C
     * Windows folks expect to use CTRL + C
     */
    exports.OS = {
        LINUX: "LINUX",
        MAC: "MAC",
        WINDOWS: "WINDOWS"
    };
    /**
     * Return an exports.OS constant
     */
    function getOS() {
        if (exports.isMac) {
            return exports.OS.MAC;
        }
        else if (exports.isLinux) {
            return exports.OS.LINUX;
        }
        else {
            return exports.OS.WINDOWS;
        }
    }
    exports.getOS = getOS;
    // this can be called in non browser environments (e.g. from ace/requirejs/text)
    //if (typeof navigator != "object") {
    //  return;
    //}
    var os = (navigator.platform.match(/mac|win|linux/i) || ["other"])[0].toLowerCase();
    var ua = navigator.userAgent;
    // Is the user using a browser that identifies itself as Windows
    exports.isWin = (os == "win");
    // Is the user using a browser that identifies itself as Mac OS
    exports.isMac = (os == "mac");
    // Is the user using a browser that identifies itself as Linux
    exports.isLinux = (os == "linux");
    // Windows Store JavaScript apps (aka Metro apps written in HTML5 and JavaScript) do not use the "Microsoft Internet Explorer" string in their user agent, but "MSAppHost" instead.
    exports.isIE = (navigator.appName == "Microsoft Internet Explorer" || navigator.appName.indexOf("MSAppHost") >= 0)
        ? parseFloat((ua.match(/(?:MSIE |Trident\/[0-9]+[\.0-9]+;.*rv:)([0-9]+[\.0-9]+)/) || [])[1])
        : parseFloat((ua.match(/(?:Trident\/[0-9]+[\.0-9]+;.*rv:)([0-9]+[\.0-9]+)/) || [])[1]); // for ie
    exports.isOldIE = exports.isIE && exports.isIE < 9;
    // Is this Firefox or related?
    exports.isGecko = (('Controllers' in window) || ('controllers' in window)) && window.navigator.product === "Gecko";
    exports.isMozilla = exports.isGecko;
    // oldGecko == rev < 2.0 
    exports.isOldGecko = exports.isGecko && parseInt((ua.match(/rv\:(\d+)/) || [])[1], 10) < 4;
    // Is this Opera 
    exports.isOpera = ('opera' in window) && Object.prototype.toString.call(window['opera']) == "[object Opera]";
    // Is the user using a browser that identifies itself as WebKit 
    exports.isWebKit = parseFloat(ua.split("WebKit/")[1]) || undefined;
    exports.isChrome = parseFloat(ua.split(" Chrome/")[1]) || undefined;
    exports.isChromeOS = ua.indexOf(" CrOS ") >= 0;
    exports.isAIR = ua.indexOf("AdobeAIR") >= 0;
    exports.isAndroid = ua.indexOf("Android") >= 0;
    exports.isIPad = ua.indexOf("iPad") >= 0;
    exports.isTouchPad = ua.indexOf("TouchPad") >= 0;
    exports.isMobile = exports.isAndroid || exports.isIPad || exports.isTouchPad;
});

define('lib/event',["require", "exports", './keys', './useragent'], function (require, exports, keys_1, useragent_1) {
    function addListener(target, type, callback, useCapture) {
        if (target.addEventListener) {
            return target.addEventListener(type, callback, false);
        }
    }
    exports.addListener = addListener;
    function removeListener(target, type, callback, useCapture) {
        if (target.removeEventListener) {
            return target.removeEventListener(type, callback, false);
        }
    }
    exports.removeListener = removeListener;
    /*
    * Prevents propagation and clobbers the default action of the passed event
    */
    function stopEvent(e) {
        stopPropagation(e);
        preventDefault(e);
        return false;
    }
    exports.stopEvent = stopEvent;
    function stopPropagation(e) {
        if (e.stopPropagation) {
            e.stopPropagation();
        }
        else {
            e.cancelBubble = true;
        }
    }
    exports.stopPropagation = stopPropagation;
    function preventDefault(e) {
        // returnValue is no longer documented in typings.
        var RETURN_VALUE_DEPRECATED = 'returnValue';
        if (e.preventDefault) {
            e.preventDefault();
        }
        else if (e[RETURN_VALUE_DEPRECATED]) {
            e[RETURN_VALUE_DEPRECATED] = false;
        }
    }
    exports.preventDefault = preventDefault;
    /*
     * @return {Number} 0 for left button, 1 for middle button, 2 for right button
     */
    function getButton(e) {
        if (e.type == "dblclick")
            return 0;
        if (e.type == "contextmenu" || (useragent_1.isMac && (e.ctrlKey && !e.altKey && !e.shiftKey)))
            return 2;
        // DOM Event
        if (e.preventDefault) {
            return e.button;
        }
        else {
            return { 1: 0, 2: 2, 4: 1 }[e.button];
        }
    }
    exports.getButton = getButton;
    // FIXME: We should not be assuming the document as window.document!
    /**
     * Returns a function which may be used to manually release the mouse.
     */
    function capture(unused, acquireCaptureHandler, releaseCaptureHandler) {
        // FIXME: 'Document' is missing property 'onmouseleave' from 'HTMLElement'.
        var element = document;
        function releaseMouse(e) {
            // It seems redundant and cumbersome to provide this event to both handlers?
            acquireCaptureHandler && acquireCaptureHandler(e);
            releaseCaptureHandler && releaseCaptureHandler(e);
            removeListener(element, "mousemove", acquireCaptureHandler, true);
            removeListener(element, "mouseup", releaseMouse, true);
            removeListener(element, "dragstart", releaseMouse, true);
        }
        addListener(element, "mousemove", acquireCaptureHandler, true);
        addListener(element, "mouseup", releaseMouse, true);
        addListener(element, "dragstart", releaseMouse, true);
        return releaseMouse;
    }
    exports.capture = capture;
    /**
     * Adds a portable 'mousewheel' ['wheel','DOM MouseScroll'] listener to an element.
     */
    function addMouseWheelListener(element, callback) {
        if ("onmousewheel" in element) {
            addListener(element, "mousewheel", function (e) {
                var factor = 8;
                if (e['wheelDeltaX'] !== undefined) {
                    e['wheelX'] = -e['wheelDeltaX'] / factor;
                    e['wheelY'] = -e['wheelDeltaY'] / factor;
                }
                else {
                    e['wheelX'] = 0;
                    e['wheelY'] = -e.wheelDelta / factor;
                }
                callback(e);
            });
        }
        else if ("onwheel" in element) {
            addListener(element, "wheel", function (e) {
                var factor = 0.35;
                switch (e.deltaMode) {
                    case e.DOM_DELTA_PIXEL:
                        e.wheelX = e.deltaX * factor || 0;
                        e.wheelY = e.deltaY * factor || 0;
                        break;
                    case e.DOM_DELTA_LINE:
                    case e.DOM_DELTA_PAGE:
                        e.wheelX = (e.deltaX || 0) * 5;
                        e.wheelY = (e.deltaY || 0) * 5;
                        break;
                }
                callback(e);
            });
        }
        else {
            // TODO: Define interface for DOMMouseScroll.
            addListener(element, "DOMMouseScroll", function (e) {
                if (e.axis && e.axis == e.HORIZONTAL_AXIS) {
                    e.wheelX = (e.detail || 0) * 5;
                    e.wheelY = 0;
                }
                else {
                    e.wheelX = 0;
                    e.wheelY = (e.detail || 0) * 5;
                }
                callback(e);
            });
        }
    }
    exports.addMouseWheelListener = addMouseWheelListener;
    function addMultiMouseDownListener(el, timeouts, eventHandler, callbackName) {
        var clicks = 0;
        var startX, startY, timer;
        var eventNames = {
            2: "dblclick",
            3: "tripleclick",
            4: "quadclick"
        };
        addListener(el, "mousedown", function (e) {
            if (getButton(e) !== 0) {
                clicks = 0;
            }
            else if (e.detail > 1) {
                clicks++;
                if (clicks > 4)
                    clicks = 1;
            }
            else {
                clicks = 1;
            }
            if (useragent_1.isIE) {
                var isNewClick = Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5;
                if (!timer || isNewClick)
                    clicks = 1;
                if (timer)
                    clearTimeout(timer);
                timer = setTimeout(function () { timer = null; }, timeouts[clicks - 1] || 600);
                if (clicks == 1) {
                    startX = e.clientX;
                    startY = e.clientY;
                }
            }
            // TODO. This custom property is not part of MouseEvent.
            e['_clicks'] = clicks;
            eventHandler[callbackName]("mousedown", e);
            if (clicks > 4)
                clicks = 0;
            else if (clicks > 1)
                return eventHandler[callbackName](eventNames[clicks], e);
        });
        if (useragent_1.isOldIE) {
            addListener(el, "dblclick", function (e) {
                clicks = 2;
                if (timer)
                    clearTimeout(timer);
                timer = setTimeout(function () { timer = null; }, timeouts[clicks - 1] || 600);
                eventHandler[callbackName]("mousedown", e);
                eventHandler[callbackName](eventNames[clicks], e);
            });
        }
    }
    exports.addMultiMouseDownListener = addMultiMouseDownListener;
    var getModifierHash = useragent_1.isMac && useragent_1.isOpera && !("KeyboardEvent" in window)
        ? function (e) {
            return 0 | (e.metaKey ? 1 : 0) | (e.altKey ? 2 : 0) | (e.shiftKey ? 4 : 0) | (e.ctrlKey ? 8 : 0);
        }
        : function (e) {
            return 0 | (e.ctrlKey ? 1 : 0) | (e.altKey ? 2 : 0) | (e.shiftKey ? 4 : 0) | (e.metaKey ? 8 : 0);
        };
    function getModifierString(e) {
        return keys_1.KEY_MODS[getModifierHash(e)];
    }
    exports.getModifierString = getModifierString;
    function normalizeCommandKeys(callback, e, keyCode) {
        var hashId = getModifierHash(e);
        if (!useragent_1.isMac && pressedKeys) {
            if (pressedKeys[91] || pressedKeys[92])
                hashId |= 8;
            if (pressedKeys.altGr) {
                if ((3 & hashId) != 3)
                    pressedKeys.altGr = 0;
                else
                    return;
            }
            if (keyCode === 18 || keyCode === 17) {
                if (keyCode === 17 && e.location === 1) {
                    ts = e.timeStamp;
                }
                else if (keyCode === 18 && hashId === 3 && e.location === 2) {
                    var dt = -ts;
                    ts = e.timeStamp;
                    dt += ts;
                    if (dt < 3)
                        pressedKeys.altGr = true;
                }
            }
        }
        if (keyCode in keys_1.MODIFIER_KEYS) {
            switch (keys_1.MODIFIER_KEYS[keyCode]) {
                case "Alt":
                    hashId = 2;
                    break;
                case "Shift":
                    hashId = 4;
                    break;
                case "Ctrl":
                    hashId = 1;
                    break;
                default:
                    hashId = 8;
                    break;
            }
            keyCode = -1;
        }
        if (hashId & 8 && (keyCode === 91 || keyCode === 93)) {
            keyCode = -1;
        }
        if (!hashId && keyCode === 13) {
            if (e.location === 3) {
                callback(e, hashId, -keyCode);
                if (e.defaultPrevented)
                    return;
            }
        }
        if (useragent_1.isChromeOS && hashId & 8) {
            callback(e, hashId, keyCode);
            if (e.defaultPrevented)
                return;
            else
                hashId &= ~8;
        }
        // If there is no hashId and the keyCode is not a function key, then
        // we don't call the callback as we don't handle a command key here
        // (it's a normal key/character input).
        if (!hashId && !(keyCode in keys_1.FUNCTION_KEYS) && !(keyCode in keys_1.PRINTABLE_KEYS)) {
            return false;
        }
        return callback(e, hashId, keyCode);
    }
    var pressedKeys = null;
    function resetPressedKeys(e) {
        pressedKeys = Object.create(null);
    }
    var ts = 0;
    function addCommandKeyListener(el, callback) {
        if (useragent_1.isOldGecko || (useragent_1.isOpera && !("KeyboardEvent" in window))) {
            // Old versions of Gecko aka. Firefox < 4.0 didn't repeat the keydown
            // event if the user pressed the key for a longer time. Instead, the
            // keydown event was fired once and later on only the keypress event.
            // To emulate the 'right' keydown behavior, the keyCode of the initial
            // keyDown event is stored and in the following keypress events the
            // stores keyCode is used to emulate a keyDown event.
            var lastKeyDownKeyCode = null;
            addListener(el, "keydown", function (e) {
                lastKeyDownKeyCode = e.keyCode;
            });
            addListener(el, "keypress", function (e) {
                return normalizeCommandKeys(callback, e, lastKeyDownKeyCode);
            });
        }
        else {
            var lastDefaultPrevented = null;
            addListener(el, "keydown", function (e) {
                pressedKeys[e.keyCode] = true;
                var result = normalizeCommandKeys(callback, e, e.keyCode);
                lastDefaultPrevented = e.defaultPrevented;
                return result;
            });
            addListener(el, 'keypress', function (e) {
                if (lastDefaultPrevented && (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey)) {
                    stopEvent(e);
                    lastDefaultPrevented = null;
                }
            });
            addListener(el, 'keyup', function (e) {
                pressedKeys[e.keyCode] = null;
            });
            if (!pressedKeys) {
                pressedKeys = Object.create(null);
                addListener(window, 'focus', resetPressedKeys);
            }
        }
    }
    exports.addCommandKeyListener = addCommandKeyListener;
    // FIXME: Conditional exports not supported by TypeScript or Harmony/ES6.
    // declare var exports: any;
    /*
    if (window.postMessage && !isOldIE) {
        var postMessageId = 1;
        exports.nextTick = function(callback, win) {
            win = win || window;
            var messageName = "zero-timeout-message-" + postMessageId;
            addListener(win, "message", function listener(e) {
                if (e.data == messageName) {
                    stopPropagation(e);
                    removeListener(win, "message", listener);
                    callback();
                }
            });
            win.postMessage(messageName, "*");
        };
    }
    */
    var nextFrameCandidate = window.requestAnimationFrame ||
        window['mozRequestAnimationFrame'] ||
        window['webkitRequestAnimationFrame'] ||
        window.msRequestAnimationFrame ||
        window['oRequestAnimationFrame'];
    if (nextFrameCandidate) {
        nextFrameCandidate = nextFrameCandidate.bind(window);
    }
    else {
        nextFrameCandidate = function (callback) {
            setTimeout(callback, 17);
        };
    }
    /**
     * A backwards-compatible, browser-neutral, requestAnimationFrame.
     */
    exports.requestAnimationFrame = nextFrameCandidate;
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
define('lib/lang',["require", "exports"], function (require, exports) {
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
define('keyboard/KeyBinding',["require", "exports", "../lib/keys", "../lib/event"], function (require, exports, keys_1, event_1) {
    var KeyBinding = (function () {
        function KeyBinding(editor) {
            this.$editor = editor;
            this.$data = { editor: editor };
            this.$handlers = [];
            this.setDefaultHandler(editor.commands);
        }
        KeyBinding.prototype.setDefaultHandler = function (kb) {
            this.removeKeyboardHandler(this.$defaultHandler);
            this.$defaultHandler = kb;
            this.addKeyboardHandler(kb, 0);
        };
        KeyBinding.prototype.setKeyboardHandler = function (kb) {
            var h = this.$handlers;
            if (h[h.length - 1] === kb)
                return;
            while (h[h.length - 1] && h[h.length - 1] != this.$defaultHandler)
                this.removeKeyboardHandler(h[h.length - 1]);
            this.addKeyboardHandler(kb, 1);
        };
        KeyBinding.prototype.addKeyboardHandler = function (kb /*: CommandManager*/, pos) {
            if (!kb)
                return;
            if (typeof kb == "function" && !kb.handleKeyboard)
                kb.handleKeyboard = kb;
            var i = this.$handlers.indexOf(kb);
            if (i != -1)
                this.$handlers.splice(i, 1);
            if (pos === void 0)
                this.$handlers.push(kb);
            else
                this.$handlers.splice(pos, 0, kb);
            if (i == -1 && kb.attach)
                kb.attach(this.$editor);
        };
        KeyBinding.prototype.removeKeyboardHandler = function (kb) {
            var i = this.$handlers.indexOf(kb);
            if (i == -1)
                return false;
            this.$handlers.splice(i, 1);
            kb.detach && kb.detach(this.$editor);
            return true;
        };
        KeyBinding.prototype.getKeyboardHandler = function () {
            return this.$handlers[this.$handlers.length - 1];
        };
        KeyBinding.prototype.$callKeyboardHandlers = function (hashId, keyString, keyCode, e) {
            // FIXME: What is going on here?
            var toExecute;
            var success = false;
            var commands = this.$editor.commands;
            for (var i = this.$handlers.length; i--;) {
                toExecute = this.$handlers[i].handleKeyboard(this.$data, hashId, keyString, keyCode, e);
                if (!toExecute || !toExecute.command)
                    continue;
                // allow keyboardHandler to consume keys
                if (toExecute.command == "null") {
                    success = true;
                }
                else {
                    success = commands.exec(toExecute.command, this.$editor, toExecute.args);
                }
                // do not stop input events to not break repeating
                if (success && e && hashId != -1 && toExecute.passEvent != true && toExecute.command.passEvent != true) {
                    event_1.stopEvent(e);
                }
                if (success)
                    break;
            }
            return success;
        };
        KeyBinding.prototype.onCommandKey = function (e, hashId, keyCode) {
            var keyString = keys_1.keyCodeToString(keyCode);
            this.$callKeyboardHandlers(hashId, keyString, keyCode, e);
        };
        KeyBinding.prototype.onTextInput = function (text) {
            var success = this.$callKeyboardHandlers(-1, text);
            if (!success) {
                this.$editor.commands.exec("insertstring", this.$editor, text);
            }
        };
        return KeyBinding;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = KeyBinding;
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
define('keyboard/TextInput',["require", "exports", "../lib/event", "../lib/useragent", "../lib/dom", "../lib/lang"], function (require, exports, event_1, useragent_1, dom_1, lang_1) {
    var BROKEN_SETDATA = useragent_1.isChrome < 18;
    var USE_IE_MIME_TYPE = useragent_1.isIE;
    var TextInput = (function () {
        function TextInput(parentNode, host) {
            // FIXME: I'm sure this shuld become a property.
            // Don't know why we have all these monkey patched methods?!.
            var text = dom_1.createElement("textarea");
            text.className = "ace_text-input";
            if (useragent_1.isTouchPad) {
                text.setAttribute("x-palm-disable-auto-cap", 'true');
            }
            text.wrap = "off";
            text['autocorrect'] = "off";
            text['autocapitalize'] = "off";
            text.spellcheck = false;
            text.style.opacity = "0";
            parentNode.insertBefore(text, parentNode.firstChild);
            var PLACEHOLDER = "\x01\x01";
            var copied = false;
            var pasted = false;
            var inComposition = false;
            var tempStyle = '';
            var isSelectionEmpty = true;
            // FOCUS
            // ie9 throws error if document.activeElement is accessed too soon
            try {
                var isFocused = document.activeElement === text;
            }
            catch (e) { }
            event_1.addListener(text, "blur", function () {
                host.onBlur();
                isFocused = false;
            });
            event_1.addListener(text, "focus", function () {
                isFocused = true;
                host.onFocus();
                resetSelection();
            });
            this.focus = function () { text.focus(); };
            this.blur = function () { text.blur(); };
            this.isFocused = function () {
                return isFocused;
            };
            // modifying selection of blured textarea can focus it (chrome mac/linux)
            var syncSelection = lang_1.delayedCall(function () {
                isFocused && resetSelection(isSelectionEmpty);
            });
            var syncValue = lang_1.delayedCall(function () {
                if (!inComposition) {
                    text.value = PLACEHOLDER;
                    isFocused && resetSelection();
                }
            });
            function resetSelection(isEmpty) {
                if (inComposition)
                    return;
                if (inputHandler) {
                    selectionStart = 0;
                    selectionEnd = isEmpty ? 0 : text.value.length - 1;
                }
                else {
                    var selectionStart = isEmpty ? 2 : 1;
                    var selectionEnd = 2;
                }
                // on firefox this throws if textarea is hidden
                try {
                    text.setSelectionRange(selectionStart, selectionEnd);
                }
                catch (e) { }
            }
            function resetValue() {
                if (inComposition)
                    return;
                text.value = PLACEHOLDER;
                //http://code.google.com/p/chromium/issues/detail?id=76516
                if (useragent_1.isWebKit)
                    syncValue.schedule();
            }
            useragent_1.isWebKit || host.on('changeSelection', function (event, editor) {
                if (host.selection.isEmpty() != isSelectionEmpty) {
                    isSelectionEmpty = !isSelectionEmpty;
                    syncSelection.schedule();
                }
            });
            resetValue();
            if (isFocused)
                host.onFocus();
            var isAllSelected = function (text) {
                return text.selectionStart === 0 && text.selectionEnd === text.value.length;
            };
            // IE8 does not support setSelectionRange
            if (!text.setSelectionRange && text.createTextRange) {
                text.setSelectionRange = function (selectionStart, selectionEnd) {
                    var range = this.createTextRange();
                    range.collapse(true);
                    range.moveStart('character', selectionStart);
                    range.moveEnd('character', selectionEnd);
                    range.select();
                };
                isAllSelected = function (text) {
                    try {
                        var range = text.ownerDocument['selection'].createRange();
                    }
                    catch (e) {
                    }
                    if (!range || range.parentElement() != text)
                        return false;
                    return range.text == text.value;
                };
            }
            if (useragent_1.isOldIE) {
                var inPropertyChange = false;
                var onPropertyChange = function (e) {
                    if (inPropertyChange)
                        return;
                    var data = text.value;
                    if (inComposition || !data || data == PLACEHOLDER)
                        return;
                    // can happen either after delete or during insert operation
                    if (e && data == PLACEHOLDER[0])
                        return syncProperty.schedule();
                    sendText(data);
                    // ie8 calls propertychange handlers synchronously!
                    inPropertyChange = true;
                    resetValue();
                    inPropertyChange = false;
                };
                var syncProperty = lang_1.delayedCall(onPropertyChange);
                event_1.addListener(text, "propertychange", onPropertyChange);
                var keytable = { 13: 1, 27: 1 };
                event_1.addListener(text, "keyup", function (e) {
                    if (inComposition && (!text.value || keytable[e.keyCode]))
                        setTimeout(onCompositionEnd, 0);
                    if ((text.value.charCodeAt(0) || 0) < 129) {
                        return syncProperty.call();
                    }
                    inComposition ? onCompositionUpdate() : onCompositionStart();
                });
                // when user presses backspace after focusing the editor 
                // propertychange isn't called for the next character
                event_1.addListener(text, "keydown", function (e) {
                    syncProperty.schedule(50);
                });
            }
            var onSelect = function (e) {
                if (copied) {
                    copied = false;
                }
                else if (isAllSelected(text)) {
                    host.selectAll();
                    resetSelection();
                }
                else if (inputHandler) {
                    resetSelection(host.selection.isEmpty());
                }
            };
            var inputHandler = null;
            this.setInputHandler = function (cb) { inputHandler = cb; };
            this.getInputHandler = function () { return inputHandler; };
            var afterContextMenu = false;
            var sendText = function (data) {
                if (inputHandler) {
                    data = inputHandler(data);
                    inputHandler = null;
                }
                if (pasted) {
                    resetSelection();
                    if (data)
                        host.onPaste(data);
                    pasted = false;
                }
                else if (data == PLACEHOLDER.charAt(0)) {
                    if (afterContextMenu)
                        host.execCommand("del", { source: "ace" });
                    else
                        host.execCommand("backspace", { source: "ace" });
                }
                else {
                    if (data.substring(0, 2) == PLACEHOLDER)
                        data = data.substr(2);
                    else if (data.charAt(0) == PLACEHOLDER.charAt(0))
                        data = data.substr(1);
                    else if (data.charAt(data.length - 1) == PLACEHOLDER.charAt(0))
                        data = data.slice(0, -1);
                    // can happen if undo in textarea isn't stopped
                    if (data.charAt(data.length - 1) == PLACEHOLDER.charAt(0))
                        data = data.slice(0, -1);
                    if (data)
                        host.onTextInput(data);
                }
                if (afterContextMenu)
                    afterContextMenu = false;
            };
            var onInput = function (e) {
                // console.log("onInput", inComposition)
                if (inComposition)
                    return;
                var data = text.value;
                sendText(data);
                resetValue();
            };
            var handleClipboardData = function (e, data) {
                var clipboardData = e.clipboardData || window['clipboardData'];
                if (!clipboardData || BROKEN_SETDATA)
                    return;
                // using "Text" doesn't work on old webkit but ie needs it
                // TODO are there other browsers that require "Text"?
                var mime = USE_IE_MIME_TYPE ? "Text" : "text/plain";
                if (data) {
                    // Safari 5 has clipboardData object, but does not handle setData()
                    return clipboardData.setData(mime, data) !== false;
                }
                else {
                    return clipboardData.getData(mime);
                }
            };
            var doCopy = function (e, isCut) {
                var data = host.getCopyText();
                if (!data)
                    return event_1.preventDefault(e);
                if (handleClipboardData(e, data)) {
                    isCut ? host.onCut() : host.onCopy();
                    event_1.preventDefault(e);
                }
                else {
                    copied = true;
                    text.value = data;
                    text.select();
                    setTimeout(function () {
                        copied = false;
                        resetValue();
                        resetSelection();
                        isCut ? host.onCut() : host.onCopy();
                    });
                }
            };
            var onCut = function (e) {
                doCopy(e, true);
            };
            var onCopy = function (e) {
                doCopy(e, false);
            };
            var onPaste = function (e) {
                var data = handleClipboardData(e);
                if (typeof data === "string") {
                    if (data)
                        host.onPaste(data);
                    if (useragent_1.isIE)
                        setTimeout(resetSelection);
                    event_1.preventDefault(e);
                }
                else {
                    text.value = "";
                    pasted = true;
                }
            };
            event_1.addCommandKeyListener(text, host.onCommandKey.bind(host));
            event_1.addListener(text, "select", onSelect);
            event_1.addListener(text, "input", onInput);
            event_1.addListener(text, "cut", onCut);
            event_1.addListener(text, "copy", onCopy);
            event_1.addListener(text, "paste", onPaste);
            // Opera has no clipboard events
            if (!('oncut' in text) || !('oncopy' in text) || !('onpaste' in text)) {
                event_1.addListener(parentNode, "keydown", function (e) {
                    if ((useragent_1.isMac && !e.metaKey) || !e.ctrlKey)
                        return;
                    switch (e.keyCode) {
                        case 67:
                            onCopy(e);
                            break;
                        case 86:
                            onPaste(e);
                            break;
                        case 88:
                            onCut(e);
                            break;
                    }
                });
            }
            // COMPOSITION
            var onCompositionStart = function () {
                if (inComposition || !host.onCompositionStart || host.$readOnly)
                    return;
                // console.log("onCompositionStart", inComposition)
                inComposition = {};
                host.onCompositionStart();
                setTimeout(onCompositionUpdate, 0);
                host.on("mousedown", onCompositionEnd);
                if (!host.selection.isEmpty()) {
                    host.insert("");
                    host.session.markUndoGroup();
                    host.selection.clearSelection();
                }
                host.session.markUndoGroup();
            };
            var onCompositionUpdate = function () {
                // console.log("onCompositionUpdate", inComposition && JSON.stringify(text.value))
                if (!inComposition || !host.onCompositionUpdate || host.$readOnly)
                    return;
                var val = text.value.replace(/\x01/g, "");
                if (inComposition.lastValue === val)
                    return;
                host.onCompositionUpdate(val);
                if (inComposition.lastValue)
                    host.undo();
                inComposition.lastValue = val;
                if (inComposition.lastValue) {
                    var r = host.selection.getRange();
                    host.insert(inComposition.lastValue);
                    host.session.markUndoGroup();
                    inComposition.range = host.selection.getRange();
                    host.selection.setRange(r);
                    host.selection.clearSelection();
                }
            };
            var onCompositionEnd = function (e, editor) {
                if (!host.onCompositionEnd || host.$readOnly)
                    return;
                // console.log("onCompositionEnd", inComposition &&inComposition.lastValue)
                var c = inComposition;
                inComposition = false;
                var timer = setTimeout(function () {
                    timer = null;
                    var str = text.value.replace(/\x01/g, "");
                    // console.log(str, c.lastValue)
                    if (inComposition)
                        return;
                    else if (str == c.lastValue)
                        resetValue();
                    else if (!c.lastValue && str) {
                        resetValue();
                        sendText(str);
                    }
                });
                inputHandler = function compositionInputHandler(str) {
                    // console.log("onCompositionEnd", str, c.lastValue)
                    if (timer)
                        clearTimeout(timer);
                    str = str.replace(/\x01/g, "");
                    if (str == c.lastValue)
                        return "";
                    if (c.lastValue && timer)
                        host.undo();
                    return str;
                };
                host.onCompositionEnd();
                host.off("mousedown", onCompositionEnd);
                if (e.type == "compositionend" && c.range) {
                    host.selection.setRange(c.range);
                }
            };
            var syncComposition = lang_1.delayedCall(onCompositionUpdate, 50);
            event_1.addListener(text, "compositionstart", onCompositionStart);
            if (useragent_1.isGecko) {
                event_1.addListener(text, "text", function () { syncComposition.schedule(); });
            }
            else {
                event_1.addListener(text, "keyup", function () { syncComposition.schedule(); });
                event_1.addListener(text, "keydown", function () { syncComposition.schedule(); });
            }
            event_1.addListener(text, "compositionend", onCompositionEnd);
            this.getElement = function () {
                return text;
            };
            this.setReadOnly = function (readOnly) {
                text.readOnly = readOnly;
            };
            this.onContextMenu = function (e) {
                afterContextMenu = true;
                resetSelection(host.selection.isEmpty());
                host._emit("nativecontextmenu", { target: host, domEvent: e });
                this.moveToMouse(e, true);
            };
            this.moveToMouse = function (e, bringToFront) {
                if (!tempStyle)
                    tempStyle = text.style.cssText;
                text.style.cssText = (bringToFront ? "z-index:100000;" : "")
                    + "height:" + text.style.height + ";"
                    + (useragent_1.isIE ? "opacity:0.1;" : "");
                var rect = host.container.getBoundingClientRect();
                var style = window.getComputedStyle(host.container);
                var top = rect.top + (parseInt(style.borderTopWidth) || 0);
                var left = rect.left + (parseInt(style.borderLeftWidth) || 0);
                var maxTop = rect.bottom - top - text.clientHeight - 2;
                var move = function (e) {
                    text.style.left = e.clientX - left - 2 + "px";
                    text.style.top = Math.min(e.clientY - top - 2, maxTop) + "px";
                };
                move(e);
                if (e.type != "mousedown")
                    return;
                if (host.renderer.$keepTextAreaAtCursor)
                    host.renderer.$keepTextAreaAtCursor = null;
                // on windows context menu is opened after mouseup
                if (useragent_1.isWin)
                    event_1.capture(host.container, move, onContextMenuClose);
            };
            this.onContextMenuClose = onContextMenuClose;
            function onContextMenuClose() {
                setTimeout(function () {
                    if (tempStyle) {
                        text.style.cssText = tempStyle;
                        tempStyle = '';
                    }
                    if (host.renderer.$keepTextAreaAtCursor == null) {
                        host.renderer.$keepTextAreaAtCursor = true;
                        host.renderer.$moveTextAreaToCursor();
                    }
                }, 0);
            }
            var onContextMenu = function (e) {
                host.textInput.onContextMenu(e);
                onContextMenuClose();
            };
            event_1.addListener(host.renderer.scroller, "contextmenu", onContextMenu);
            event_1.addListener(text, "contextmenu", onContextMenu);
        }
        TextInput.prototype.focus = function () { };
        ;
        TextInput.prototype.blur = function () { };
        ;
        TextInput.prototype.isFocused = function () { };
        ;
        TextInput.prototype.setReadOnly = function (readOnly) { };
        ;
        TextInput.prototype.onContextMenuClose = function () { };
        ;
        TextInput.prototype.onContextMenu = function (e) { };
        ;
        TextInput.prototype.moveToMouse = function (e, bringToFront) { };
        ;
        TextInput.prototype.setInputHandler = function (cb) { };
        ;
        TextInput.prototype.getInputHandler = function () { };
        ;
        TextInput.prototype.getElement = function () {
        };
        ;
        return TextInput;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = TextInput;
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
/**
 * This object is used in various places to indicate a region within the editor.
 * To better visualize how this works, imagine a rectangle.
 * Each quadrant of the rectangle is analogus to a range, as ranges contain a starting row and starting column, and an ending row, and ending column.
 * @class Range
 */
define('Range',["require", "exports"], function (require, exports) {
    /**
     * Creates a new `EditorRange` object with the given starting and ending row and column points.
     * @param {Number} startRow The starting row
     * @param {Number} startColumn The starting column
     * @param {Number} endRow The ending row
     * @param {Number} endColumn The ending column
     *
     * @constructor
     **/
    var Range = (function () {
        //  public cursor: Range;
        //  public isBackwards: boolean;
        /**
         * @class Range
         * @constructor
         */
        function Range(startRow, startColumn, endRow, endColumn) {
            this.start = {
                row: startRow,
                column: startColumn
            };
            this.end = {
                row: endRow,
                column: endColumn
            };
        }
        /**
         * Returns `true` if and only if the starting row and column, and ending row and column, are equivalent to those given by `range`.
         * @param {EditorRange} range A range to check against
         *
         * @return {Boolean}
         **/
        Range.prototype.isEqual = function (range) {
            return this.start.row === range.start.row &&
                this.end.row === range.end.row &&
                this.start.column === range.start.column &&
                this.end.column === range.end.column;
        };
        /**
         *
         * Returns a string containing the range's row and column information, given like this:
         * ```
         *    [start.row/start.column] -> [end.row/end.column]
         * ```
         * @return {String}
         **/
        Range.prototype.toString = function () {
            return ("Range: [" + this.start.row + "/" + this.start.column +
                "] -> [" + this.end.row + "/" + this.end.column + "]");
        };
        /**
         *
         * Returns `true` if the `row` and `column` provided are within the given range. This can better be expressed as returning `true` if:
         * ```javascript
         *    this.start.row <= row <= this.end.row &&
         *    this.start.column <= column <= this.end.column
         * ```
         * @param {Number} row A row to check for
         * @param {Number} column A column to check for
         * @returns {Boolean}
         * @related EditorRange.compare
         **/
        Range.prototype.contains = function (row, column) {
            return this.compare(row, column) === 0;
        };
        /**
         * Compares `this` range (A) with another range (B).
         * @param {EditorRange} range A range to compare with
         *
         * @related EditorRange.compare
         * @returns {Number} This method returns one of the following numbers:<br/>
         * <br/>
         * * `-2`: (B) is in front of (A), and doesn't intersect with (A)<br/>
         * * `-1`: (B) begins before (A) but ends inside of (A)<br/>
         * * `0`: (B) is completely inside of (A) OR (A) is completely inside of (B)<br/>
         * * `+1`: (B) begins inside of (A) but ends outside of (A)<br/>
         * * `+2`: (B) is after (A) and doesn't intersect with (A)<br/>
         * * `42`: FTW state: (B) ends in (A) but starts outside of (A)
         **/
        Range.prototype.compareRange = function (range) {
            var cmp;
            var end = range.end;
            var start = range.start;
            cmp = this.compare(end.row, end.column);
            if (cmp === 1) {
                cmp = this.compare(start.row, start.column);
                if (cmp === 1) {
                    return 2;
                }
                else if (cmp === 0) {
                    return 1;
                }
                else {
                    return 0;
                }
            }
            else if (cmp === -1) {
                return -2;
            }
            else {
                cmp = this.compare(start.row, start.column);
                if (cmp === -1) {
                    return -1;
                }
                else if (cmp === 1) {
                    return 42;
                }
                else {
                    return 0;
                }
            }
        };
        /**
         * Checks the row and column points of `p` with the row and column points of the calling range.
         *
         * @param {EditorRange} p A point to compare with
         *
         * @related EditorRange.compare
         * @returns {Number} This method returns one of the following numbers:<br/>
         * * `0` if the two points are exactly equal<br/>
         * * `-1` if `p.row` is less then the calling range<br/>
         * * `1` if `p.row` is greater than the calling range<br/>
         * <br/>
         * If the starting row of the calling range is equal to `p.row`, and:<br/>
         * * `p.column` is greater than or equal to the calling range's starting column, this returns `0`<br/>
         * * Otherwise, it returns -1<br/>
         *<br/>
         * If the ending row of the calling range is equal to `p.row`, and:<br/>
         * * `p.column` is less than or equal to the calling range's ending column, this returns `0`<br/>
         * * Otherwise, it returns 1<br/>
         **/
        Range.prototype.comparePoint = function (p) {
            return this.compare(p.row, p.column);
        };
        /**
         * Checks the start and end points of `range` and compares them to the calling range. Returns `true` if the `range` is contained within the caller's range.
         * @param {EditorRange} range A range to compare with
         *
         * @returns {Boolean}
         * @related EditorRange.comparePoint
         **/
        Range.prototype.containsRange = function (range) {
            return this.comparePoint(range.start) === 0 && this.comparePoint(range.end) === 0;
        };
        /**
         * Returns `true` if passed in `range` intersects with the one calling this method.
         * @param {EditorRange} range A range to compare with
         *
         * @returns {Boolean}
         **/
        Range.prototype.intersects = function (range) {
            var cmp = this.compareRange(range);
            return (cmp === -1 || cmp === 0 || cmp === 1);
        };
        /**
         * Returns `true` if the caller's ending row point is the same as `row`, and if the caller's ending column is the same as `column`.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @returns {Boolean}
         **/
        Range.prototype.isEnd = function (row, column) {
            return this.end.row === row && this.end.column === column;
        };
        /**
         * Returns `true` if the caller's starting row point is the same as `row`, and if the caller's starting column is the same as `column`.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @returns {Boolean}
         **/
        Range.prototype.isStart = function (row, column) {
            return this.start.row === row && this.start.column === column;
        };
        /**
         * Sets the starting row and column for the range.
         * @param row {number} A row point to set
         * @param column {number} A column point to set
         *
         **/
        Range.prototype.setStart = function (row, column) {
            if (typeof row === "object") {
                // Fallback until code is completely typed.
                this.start.column = row['column'];
                this.start.row = row['row'];
            }
            else {
                this.start.row = row;
                this.start.column = column;
            }
        };
        /**
         * Sets the starting row and column for the range.
         * @param row {number} A row point to set
         * @param column {number} A column point to set
         *
         **/
        Range.prototype.setEnd = function (row, column) {
            if (typeof row === "object") {
                // Fallback until code is completely typed.
                this.end.column = row['column'];
                this.end.row = row['row'];
            }
            else {
                this.end.row = row;
                this.end.column = column;
            }
        };
        /**
         * Returns `true` if the `row` and `column` are within the given range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         *
         * @returns {Boolean}
         * @related EditorRange.compare
         **/
        Range.prototype.inside = function (row, column) {
            if (this.compare(row, column) === 0) {
                if (this.isEnd(row, column) || this.isStart(row, column)) {
                    return false;
                }
                else {
                    return true;
                }
            }
            return false;
        };
        /**
         * Returns `true` if the `row` and `column` are within the given range's starting points.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @returns {Boolean}
         * @related EditorRange.compare
         **/
        Range.prototype.insideStart = function (row, column) {
            if (this.compare(row, column) === 0) {
                if (this.isEnd(row, column)) {
                    return false;
                }
                else {
                    return true;
                }
            }
            return false;
        };
        /**
         * Returns `true` if the `row` and `column` are within the given range's ending points.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @returns {Boolean}
         * @related EditorRange.compare
         *
         **/
        Range.prototype.insideEnd = function (row, column) {
            if (this.compare(row, column) === 0) {
                if (this.isStart(row, column)) {
                    return false;
                }
                else {
                    return true;
                }
            }
            return false;
        };
        /**
         * Checks the row and column points with the row and column points of the calling range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         *
         * @returns {Number} This method returns one of the following numbers:<br/>
         * `0` if the two points are exactly equal <br/>
         * `-1` if `p.row` is less then the calling range <br/>
         * `1` if `p.row` is greater than the calling range <br/>
         *  <br/>
         * If the starting row of the calling range is equal to `p.row`, and: <br/>
         * `p.column` is greater than or equal to the calling range's starting column, this returns `0`<br/>
         * Otherwise, it returns -1<br/>
         * <br/>
         * If the ending row of the calling range is equal to `p.row`, and: <br/>
         * `p.column` is less than or equal to the calling range's ending column, this returns `0` <br/>
         * Otherwise, it returns 1
         **/
        Range.prototype.compare = function (row, column) {
            if (!this.isMultiLine()) {
                if (row === this.start.row) {
                    return column < this.start.column ? -1 : (column > this.end.column ? 1 : 0);
                }
            }
            if (row < this.start.row)
                return -1;
            if (row > this.end.row)
                return 1;
            if (this.start.row === row)
                return column >= this.start.column ? 0 : -1;
            if (this.end.row === row)
                return column <= this.end.column ? 0 : 1;
            return 0;
        };
        /**
         * Checks the row and column points with the row and column points of the calling range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         * @returns {Number} This method returns one of the following numbers:<br/>
         * <br/>
         * `0` if the two points are exactly equal<br/>
         * `-1` if `p.row` is less then the calling range<br/>
         * `1` if `p.row` is greater than the calling range, or if `isStart` is `true`.<br/>
         * <br/>
         * If the starting row of the calling range is equal to `p.row`, and:<br/>
         * `p.column` is greater than or equal to the calling range's starting column, this returns `0`<br/>
         * Otherwise, it returns -1<br/>
         * <br/>
         * If the ending row of the calling range is equal to `p.row`, and:<br/>
         * `p.column` is less than or equal to the calling range's ending column, this returns `0`<br/>
         * Otherwise, it returns 1
         *
         **/
        Range.prototype.compareStart = function (row, column) {
            if (this.start.row === row && this.start.column === column) {
                return -1;
            }
            else {
                return this.compare(row, column);
            }
        };
        /**
         * Checks the row and column points with the row and column points of the calling range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         *
         * @returns {Number} This method returns one of the following numbers:<br/>
         * `0` if the two points are exactly equal<br/>
         * `-1` if `p.row` is less then the calling range<br/>
         * `1` if `p.row` is greater than the calling range, or if `isEnd` is `true.<br/>
         * <br/>
         * If the starting row of the calling range is equal to `p.row`, and:<br/>
         * `p.column` is greater than or equal to the calling range's starting column, this returns `0`<br/>
         * Otherwise, it returns -1<br/>
         *<br/>
         * If the ending row of the calling range is equal to `p.row`, and:<br/>
         * `p.column` is less than or equal to the calling range's ending column, this returns `0`<br/>
         * Otherwise, it returns 1
         */
        Range.prototype.compareEnd = function (row, column) {
            if (this.end.row === row && this.end.column === column) {
                return 1;
            }
            else {
                return this.compare(row, column);
            }
        };
        /**
         * Checks the row and column points with the row and column points of the calling range.
         * @param {Number} row A row point to compare with
         * @param {Number} column A column point to compare with
         *
         *
         * @returns {Number} This method returns one of the following numbers:<br/>
         * * `1` if the ending row of the calling range is equal to `row`, and the ending column of the calling range is equal to `column`<br/>
         * * `-1` if the starting row of the calling range is equal to `row`, and the starting column of the calling range is equal to `column`<br/>
         * <br/>
         * Otherwise, it returns the value after calling [[EditorRange.compare `compare()`]].
         *
         **/
        Range.prototype.compareInside = function (row, column) {
            if (this.end.row === row && this.end.column === column) {
                return 1;
            }
            else if (this.start.row === row && this.start.column === column) {
                return -1;
            }
            else {
                return this.compare(row, column);
            }
        };
        /**
         * Returns the part of the current `EditorRange` that occurs within the boundaries of `firstRow` and `lastRow` as a new `EditorRange` object.
         * @param {Number} firstRow The starting row
         * @param {Number} lastRow The ending row
         * @returns {EditorRange}
        **/
        Range.prototype.clipRows = function (firstRow, lastRow) {
            var start;
            var end;
            if (this.end.row > lastRow)
                end = { row: lastRow + 1, column: 0 };
            else if (this.end.row < firstRow)
                end = { row: firstRow, column: 0 };
            if (this.start.row > lastRow)
                start = { row: lastRow + 1, column: 0 };
            else if (this.start.row < firstRow)
                start = { row: firstRow, column: 0 };
            return Range.fromPoints(start || this.start, end || this.end);
        };
        /**
         * Changes the row and column points for the calling range for both the starting and ending points.
         * @param {Number} row A new row to extend to
         * @param {Number} column A new column to extend to
         * @returns {EditorRange} The original range with the new row
        **/
        Range.prototype.extend = function (row, column) {
            var cmp = this.compare(row, column);
            if (cmp === 0) {
                return this;
            }
            else if (cmp === -1) {
                var start = { row: row, column: column };
            }
            else {
                var end = { row: row, column: column };
            }
            return Range.fromPoints(start || this.start, end || this.end);
        };
        Range.prototype.isEmpty = function () {
            return (this.start.row === this.end.row && this.start.column === this.end.column);
        };
        /**
         * Returns `true` if the range spans across multiple lines.
         * @returns {Boolean}
         */
        Range.prototype.isMultiLine = function () {
            return (this.start.row !== this.end.row);
        };
        /**
         *
         * Returns a duplicate of the calling range.
         * @returns {EditorRange}
        **/
        Range.prototype.clone = function () {
            return Range.fromPoints(this.start, this.end);
        };
        /**
         *
         * Returns a range containing the starting and ending rows of the original range, but with a column value of `0`.
         * @returns {EditorRange}
        **/
        Range.prototype.collapseRows = function () {
            if (this.end.column === 0)
                return new Range(this.start.row, 0, Math.max(this.start.row, this.end.row - 1), 0);
            else
                return new Range(this.start.row, 0, this.end.row, 0);
        };
        /* experimental */
        Range.prototype.moveBy = function (row, column) {
            this.start.row += row;
            this.start.column += column;
            this.end.row += row;
            this.end.column += column;
        };
        /**
         * Creates and returns a new `EditorRange` based on the row and column of the given parameters.
         * @param {EditorRange} start A starting point to use
         * @param {EditorRange} end An ending point to use
         *
         * @returns {EditorRange}
        **/
        Range.fromPoints = function (start, end) {
            return new Range(start.row, start.column, end.row, end.column);
        };
        Range.comparePoints = function (p1, p2) {
            return p1.row - p2.row || p1.column - p2.column;
        };
        return Range;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Range;
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
define('Search',["require", "exports", "./lib/lang", "./lib/oop", "./Range"], function (require, exports, lang_1, oop_1, Range_1) {
    /**
     * @class Search
     *
     * A class designed to handle all sorts of text searches within a [[Document `Document`]].
     *
     **/
    /**
     *
     *
     * Creates a new `Search` object. The following search options are avaliable:
     *
     * - `needle`: The string or regular expression you're looking for
     * - `backwards`: Whether to search backwards from where cursor currently is. Defaults to `false`.
     * - `wrap`: Whether to wrap the search back to the beginning when it hits the end. Defaults to `false`.
     * - `caseSensitive`: Whether the search ought to be case-sensitive. Defaults to `false`.
     * - `wholeWord`: Whether the search matches only on whole words. Defaults to `false`.
     * - `range`: The [[Range]] to search within. Set this to `null` for the whole document
     * - `regExp`: Whether the search is a regular expression or not. Defaults to `false`.
     * - `start`: The starting [[Range]] or cursor position to begin the search
     * - `skipCurrent`: Whether or not to include the current line in the search. Default to `false`.
     *
     * @constructor
     **/
    var Search = (function () {
        function Search() {
            this.$options = {};
        }
        /**
         * Sets the search options via the `options` parameter.
         * @param {Object} options An object containing all the new search properties
         *
         *
         * @returns {Search}
         * @chainable
        **/
        Search.prototype.set = function (options) {
            oop_1.mixin(this.$options, options);
            return this;
        };
        /**
         * [Returns an object containing all the search options.]{: #Search.getOptions}
         * @returns {Object}
        **/
        Search.prototype.getOptions = function () {
            return lang_1.copyObject(this.$options);
        };
        /**
         * Sets the search options via the `options` parameter.
         * @param {Object} An object containing all the search propertie
         * @related Search.set
        **/
        Search.prototype.setOptions = function (options) {
            this.$options = options;
        };
        /**
         * Searches for `options.needle`. If found, this method returns the [[Range `Range`]] where the text first occurs. If `options.backwards` is `true`, the search goes backwards in the session.
         * @param {EditSession} session The session to search with
         *
         *
         * @returns {Range}
        **/
        Search.prototype.find = function (session) {
            var iterator = this.$matchIterator(session, this.$options);
            if (!iterator) {
                return void 0;
            }
            var firstRange = null;
            iterator.forEach(function (range, row, offset) {
                if (!range.start) {
                    var column = range.offset + (offset || 0);
                    firstRange = new Range_1.default(row, column, row, column + range.length);
                }
                else
                    firstRange = range;
                return true;
            });
            return firstRange;
        };
        /**
         * Searches for all occurances `options.needle`. If found, this method returns an array of [[Range `Range`s]] where the text first occurs. If `options.backwards` is `true`, the search goes backwards in the session.
         * @param {EditSession} session The session to search with
         *
         *
         * @returns {[Range]}
        **/
        Search.prototype.findAll = function (session) {
            var options = this.$options;
            if (!options.needle)
                return [];
            this.$assembleRegExp(options);
            var range = options.range;
            var lines = range
                ? session.getLines(range.start.row, range.end.row)
                : session.doc.getAllLines();
            var ranges = [];
            var re = options.re;
            if (options.$isMultiLine) {
                var len = re.length;
                var maxRow = lines.length - len;
                var prevRange;
                outer: for (var row = re.offset || 0; row <= maxRow; row++) {
                    for (var j = 0; j < len; j++)
                        if (lines[row + j].search(re[j]) == -1)
                            continue outer;
                    var startLine = lines[row];
                    var line = lines[row + len - 1];
                    var startIndex = startLine.length - startLine.match(re[0])[0].length;
                    var endIndex = line.match(re[len - 1])[0].length;
                    if (prevRange && prevRange.end.row === row &&
                        prevRange.end.column > startIndex) {
                        continue;
                    }
                    ranges.push(prevRange = new Range_1.default(row, startIndex, row + len - 1, endIndex));
                    if (len > 2)
                        row = row + len - 2;
                }
            }
            else {
                for (var i = 0; i < lines.length; i++) {
                    var matches = lang_1.getMatchOffsets(lines[i], re);
                    for (var j = 0; j < matches.length; j++) {
                        var match = matches[j];
                        ranges.push(new Range_1.default(i, match.offset, i, match.offset + match.length));
                    }
                }
            }
            if (range) {
                var startColumn = range.start.column;
                var endColumn = range.start.column;
                var i = 0, j = ranges.length - 1;
                while (i < j && ranges[i].start.column < startColumn && ranges[i].start.row == range.start.row)
                    i++;
                while (i < j && ranges[j].end.column > endColumn && ranges[j].end.row == range.end.row)
                    j--;
                ranges = ranges.slice(i, j + 1);
                for (i = 0, j = ranges.length; i < j; i++) {
                    ranges[i].start.row += range.start.row;
                    ranges[i].end.row += range.start.row;
                }
            }
            return ranges;
        };
        /**
         * Searches for `options.needle` in `input`, and, if found, replaces it with `replacement`.
         * @param {String} input The text to search in
         * @param {String} replacement The replacing text
         * + (String): If `options.regExp` is `true`, this function returns `input` with the replacement already made. Otherwise, this function just returns `replacement`.<br/>
         * If `options.needle` was not found, this function returns `null`.
         *
         *
         * @returns {String}
        **/
        Search.prototype.replace = function (input, replacement) {
            var options = this.$options;
            var re = this.$assembleRegExp(options);
            if (options.$isMultiLine)
                return replacement;
            if (!re)
                return;
            var match = re.exec(input);
            if (!match || match[0].length != input.length)
                return null;
            replacement = input.replace(re, replacement);
            if (options.preserveCase) {
                var parts = replacement.split("");
                for (var i = Math.min(input.length, input.length); i--;) {
                    var ch = input[i];
                    if (ch && ch.toLowerCase() != ch)
                        parts[i] = parts[i].toUpperCase();
                    else
                        parts[i] = parts[i].toLowerCase();
                }
                replacement = parts.join("");
            }
            return replacement;
        };
        Search.prototype.$matchIterator = function (session, options) {
            var re = this.$assembleRegExp(options);
            if (!re)
                return false;
            var self = this, callback, backwards = options.backwards;
            if (options.$isMultiLine) {
                var len = re.length;
                var matchIterator = function (line, row, offset) {
                    var startIndex = line.search(re[0]);
                    if (startIndex == -1)
                        return;
                    for (var i = 1; i < len; i++) {
                        line = session.getLine(row + i);
                        if (line.search(re[i]) == -1)
                            return;
                    }
                    var endIndex = line.match(re[len - 1])[0].length;
                    var range = new Range_1.default(row, startIndex, row + len - 1, endIndex);
                    if (re.offset == 1) {
                        range.start.row--;
                        range.start.column = Number.MAX_VALUE;
                    }
                    else if (offset)
                        range.start.column += offset;
                    if (callback(range))
                        return true;
                };
            }
            else if (backwards) {
                var matchIterator = function (line, row, startIndex) {
                    var matches = lang_1.getMatchOffsets(line, re);
                    for (var i = matches.length - 1; i >= 0; i--)
                        if (callback(matches[i], row, startIndex))
                            return true;
                };
            }
            else {
                var matchIterator = function (line, row, startIndex) {
                    var matches = lang_1.getMatchOffsets(line, re);
                    for (var i = 0; i < matches.length; i++)
                        if (callback(matches[i], row, startIndex))
                            return true;
                };
            }
            return {
                forEach: function (_callback) {
                    callback = _callback;
                    self.$lineIterator(session, options).forEach(matchIterator);
                }
            };
        };
        // FIXME: Editor needs access.
        Search.prototype.$assembleRegExp = function (options, $disableFakeMultiline) {
            if (options.needle instanceof RegExp)
                return options.re = options.needle;
            var needle = options.needle;
            if (!options.needle)
                return options.re = false;
            if (!options.regExp)
                needle = lang_1.escapeRegExp(needle);
            if (options.wholeWord)
                needle = "\\b" + needle + "\\b";
            var modifier = options.caseSensitive ? "g" : "gi";
            options.$isMultiLine = !$disableFakeMultiline && /[\n\r]/.test(needle);
            if (options.$isMultiLine)
                return options.re = this.$assembleMultilineRegExp(needle, modifier);
            try {
                var re = new RegExp(needle, modifier);
            }
            catch (e) {
                re = false;
            }
            return options.re = re;
        };
        Search.prototype.$assembleMultilineRegExp = function (needle, modifier) {
            var parts = needle.replace(/\r\n|\r|\n/g, "$\n^").split("\n");
            var re = [];
            for (var i = 0; i < parts.length; i++) {
                try {
                    re.push(new RegExp(parts[i], modifier));
                }
                catch (e) {
                    return void 0;
                }
            }
            if (parts[0] == "") {
                re.shift();
                re['offset'] = 1;
            }
            else {
                re['offset'] = 0;
            }
            return re;
        };
        Search.prototype.$lineIterator = function (session, options) {
            var backwards = options.backwards == true;
            var skipCurrent = options.skipCurrent != false;
            var range = options.range;
            var start = options.start;
            if (!start)
                start = range ? range[backwards ? "end" : "start"] : session.getSelection().getRange();
            if (start.start)
                start = start[skipCurrent != backwards ? "end" : "start"];
            var firstRow = range ? range.start.row : 0;
            var lastRow = range ? range.end.row : session.getLength() - 1;
            var forEach = backwards ? function (callback) {
                var row = start.row;
                var line = session.getLine(row).substring(0, start.column);
                if (callback(line, row))
                    return;
                for (row--; row >= firstRow; row--)
                    if (callback(session.getLine(row), row))
                        return;
                if (options.wrap == false)
                    return;
                for (row = lastRow, firstRow = start.row; row >= firstRow; row--)
                    if (callback(session.getLine(row), row))
                        return;
            } : function (callback) {
                var row = start.row;
                var line = session.getLine(row).substr(start.column);
                if (callback(line, row, start.column))
                    return;
                for (row = row + 1; row <= lastRow; row++)
                    if (callback(session.getLine(row), row))
                        return;
                if (options.wrap == false)
                    return;
                for (row = firstRow, lastRow = start.row; row <= lastRow; row++)
                    if (callback(session.getLine(row), row))
                        return;
            };
            return { forEach: forEach };
        };
        return Search;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Search;
});

define('lib/event_emitter',["require", "exports"], function (require, exports) {
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
;
define('lib/mix',["require", "exports"], function (require, exports) {
    /**
     * See TypeScript Mixins documentation.
     */
    function applyMixins(derivedCtor, baseCtors) {
        baseCtors.forEach(function (baseCtor) {
            Object.getOwnPropertyNames(baseCtor.prototype).forEach(function (name) {
                derivedCtor.prototype[name] = baseCtor.prototype[name];
            });
        });
    }
    exports.applyMixins = applyMixins;
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
define('keyboard/HashHandler',["require", "exports", "../lib/keys", "../lib/keys", "../lib/useragent"], function (require, exports, keys_1, keys_2, useragent_1) {
    var HashHandler = (function () {
        function HashHandler(config, platform) {
            this.platform = platform || (useragent_1.isMac ? "mac" : "win");
            this.commands = {};
            this.commandKeyBinding = {};
            this.addCommands(config);
        }
        HashHandler.prototype.addCommand = function (command) {
            if (this.commands[command.name]) {
                this.removeCommand(command);
            }
            this.commands[command.name] = command;
            if (command.bindKey)
                this._buildKeyHash(command);
        };
        HashHandler.prototype.removeCommand = function (command) {
            var name = (typeof command === 'string' ? command : command.name);
            command = this.commands[name];
            delete this.commands[name];
            // exhaustive search is brute force but since removeCommand is
            // not a performance critical operation this should be OK
            var ckb = this.commandKeyBinding;
            for (var hashId in ckb) {
                for (var key in ckb[hashId]) {
                    if (ckb[hashId][key] == command)
                        delete ckb[hashId][key];
                }
            }
        };
        HashHandler.prototype.bindKey = function (key, command) {
            var self = this;
            if (!key)
                return;
            if (typeof command === "function") {
                this.addCommand({ exec: command, bindKey: key, name: command.name || key });
                return;
            }
            var ckb = this.commandKeyBinding;
            key.split("|").forEach(function (keyPart) {
                var binding = self.parseKeys(keyPart /*, command*/);
                var hashId = binding.hashId;
                (ckb[hashId] || (ckb[hashId] = {}))[binding.key] = command;
            }, self);
        };
        HashHandler.prototype.addCommands = function (commands) {
            commands && Object.keys(commands).forEach(function (name) {
                var command = commands[name];
                if (!command) {
                    return;
                }
                if (typeof command === "string") {
                    return this.bindKey(command, name);
                }
                if (typeof command === "function") {
                    command = { exec: command };
                }
                if (typeof command !== "object") {
                    return;
                }
                if (!command.name) {
                    command.name = name;
                }
                this.addCommand(command);
            }, this);
        };
        HashHandler.prototype.removeCommands = function (commands) {
            Object.keys(commands).forEach(function (name) {
                this.removeCommand(commands[name]);
            }, this);
        };
        HashHandler.prototype.bindKeys = function (keyList) {
            var self = this;
            Object.keys(keyList).forEach(function (key) {
                self.bindKey(key, keyList[key]);
            }, self);
        };
        HashHandler.prototype._buildKeyHash = function (command) {
            var binding = command.bindKey;
            if (!binding)
                return;
            var key = typeof binding == "string" ? binding : binding[this.platform];
            this.bindKey(key, command);
        };
        // accepts keys in the form ctrl+Enter or ctrl-Enter
        // keys without modifiers or shift only 
        HashHandler.prototype.parseKeys = function (keys) {
            // todo support keychains 
            if (keys.indexOf(" ") != -1)
                keys = keys.split(/\s+/).pop();
            var parts = keys.toLowerCase().split(/[\-\+]([\-\+])?/).filter(function (x) { return x; });
            var key = parts.pop();
            var keyCode = keys_2.default[key];
            if (keys_1.FUNCTION_KEYS[keyCode])
                key = keys_1.FUNCTION_KEYS[keyCode].toLowerCase();
            else if (!parts.length)
                return { key: key, hashId: -1 };
            else if (parts.length == 1 && parts[0] == "shift")
                return { key: key.toUpperCase(), hashId: -1 };
            var hashId = 0;
            for (var i = parts.length; i--;) {
                var modifier = keys_1.KEY_MODS[parts[i]];
                if (modifier === null) {
                    throw new Error("invalid modifier " + parts[i] + " in " + keys);
                }
                hashId |= modifier;
            }
            return { key: key, hashId: hashId };
        };
        HashHandler.prototype.findKeyCommand = function (hashId, keyString) {
            var ckbr = this.commandKeyBinding;
            return ckbr[hashId] && ckbr[hashId][keyString];
        };
        HashHandler.prototype.handleKeyboard = function (dataUnused, hashId, keyString, keyCodeUnused, e) {
            var response = {
                command: this.findKeyCommand(hashId, keyString)
            };
            return response;
        };
        return HashHandler;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = HashHandler;
});

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('commands/CommandManager',["require", "exports", "../lib/mix", "../keyboard/HashHandler", "../lib/event_emitter"], function (require, exports, mix_1, HashHandler_1, event_emitter_1) {
    var CommandManager = (function (_super) {
        __extends(CommandManager, _super);
        /**
         * @param {string} platform Identifier for the platform; must be either `'mac'` or `'win'`
         * @param {Array} commands A list of commands
         */
        function CommandManager(platform, commands) {
            _super.call(this);
            this.hashHandler = new HashHandler_1.default(commands, platform);
            this.setDefaultHandler("exec", function (e) {
                return e.command.exec(e.editor, e.args || {});
            });
        }
        Object.defineProperty(CommandManager.prototype, "platform", {
            get: function () {
                return this.hashHandler.platform;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(CommandManager.prototype, "commands", {
            get: function () {
                return this.hashHandler.commands;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(CommandManager.prototype, "commandKeyBinding", {
            get: function () {
                return this.hashHandler.commandKeyBinding;
            },
            enumerable: true,
            configurable: true
        });
        CommandManager.prototype.bindKey = function (key, command) {
            return this.hashHandler.bindKey(key, command);
        };
        CommandManager.prototype.bindKeys = function (keyList) {
            return this.hashHandler.bindKeys(keyList);
        };
        CommandManager.prototype.addCommand = function (command) {
            this.hashHandler.addCommand(command);
        };
        CommandManager.prototype.removeCommand = function (commandName) {
            this.hashHandler.removeCommand(commandName);
        };
        CommandManager.prototype.findKeyCommand = function (hashId, keyString) {
            return this.hashHandler.findKeyCommand(hashId, keyString);
        };
        CommandManager.prototype.parseKeys = function (keys) {
            return this.hashHandler.parseKeys(keys);
        };
        CommandManager.prototype.addCommands = function (commands) {
            this.hashHandler.addCommands(commands);
        };
        CommandManager.prototype.removeCommands = function (commands) {
            this.hashHandler.removeCommands(commands);
        };
        CommandManager.prototype.handleKeyboard = function (data, hashId, keyString, keyCode) {
            return this.hashHandler.handleKeyboard(data, hashId, keyString, keyCode);
        };
        CommandManager.prototype.exec = function (command, editor, args) {
            if (typeof command === 'string') {
                command = this.hashHandler.commands[command];
            }
            if (!command) {
                return false;
            }
            if (editor && editor.$readOnly && !command.readOnly) {
                return false;
            }
            var e = { editor: editor, command: command, args: args };
            var retvalue = this._emit("exec", e);
            this._signal("afterExec", e);
            return retvalue === false ? false : true;
        };
        CommandManager.prototype.toggleRecording = function (editor) {
            if (this.$inReplay)
                return;
            editor && editor._emit("changeStatus");
            if (this.recording) {
                this.macro.pop();
                this.off("exec", this.$addCommandToMacro);
                if (!this.macro.length)
                    this.macro = this.oldMacro;
                return this.recording = false;
            }
            if (!this.$addCommandToMacro) {
                this.$addCommandToMacro = function (e) {
                    this.macro.push([e.command, e.args]);
                }.bind(this);
            }
            this.oldMacro = this.macro;
            this.macro = [];
            this.on("exec", this.$addCommandToMacro);
            return this.recording = true;
        };
        CommandManager.prototype.replay = function (editor) {
            if (this.$inReplay || !this.macro)
                return;
            if (this.recording)
                return this.toggleRecording(editor);
            try {
                this.$inReplay = true;
                this.macro.forEach(function (x) {
                    if (typeof x == "string")
                        this.exec(x, editor);
                    else
                        this.exec(x[0], editor, x[1]);
                }, this);
            }
            finally {
                this.$inReplay = false;
            }
        };
        CommandManager.prototype.trimMacro = function (m) {
            return m.map(function (x) {
                if (typeof x[0] != "string")
                    x[0] = x[0].name;
                if (!x[1])
                    x = x[0];
                return x;
            });
        };
        return CommandManager;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = CommandManager;
    mix_1.applyMixins(CommandManager, [HashHandler_1.default]);
});

/**
 * based on code from:
 *
 * @license RequireJS text 0.25.0 Copyright (c) 2010-2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/requirejs for details
 */
define('lib/net',["require", "exports", './dom'], function (require, exports, dom_1) {
    /**
     * Executes a 'GET' HTTP request with a responseText callback.
     */
    function get(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
            // Do not explicitly handle errors, those should be
            // visible via console output in the browser.
            if (xhr.readyState === 4) {
                callback(xhr.responseText);
            }
        };
        xhr.send(null);
    }
    exports.get = get;
    /**
     * Creates a <script> tag, sets the 'src' property, and calls back when loaded.
     */
    function loadScript(src, callback, doc) {
        // TODO: This is a standard trick. Are there any best practices?
        var head = dom_1.getDocumentHead();
        var s = doc.createElement('script');
        s.src = src;
        head.appendChild(s);
        s.onload = s['onreadystatechange'] = function (_, isAbort) {
            if (isAbort || !s['readyState'] || s['readyState'] === "loaded" || s['readyState'] === "complete") {
                s = s.onload = s['onreadystatechange'] = null;
                if (!isAbort) {
                    callback();
                }
            }
        };
    }
    exports.loadScript = loadScript;
    ;
    /**
     * Convert a url into a fully qualified absolute URL.
     * This function does not work in IE6
     */
    function qualifyURL(url) {
        // TODO: This is a standard trick. Are there any best practices?
        var a = document.createElement('a');
        a.href = url;
        return a.href;
    }
    exports.qualifyURL = qualifyURL;
});

define('config',["require", "exports", "./lib/lang", "./lib/oop", "./lib/net", './lib/event_emitter'], function (require, exports, lang_1, oop_1, net_1, event_emitter_1) {
    var global = (function () {
        return this || typeof window !== 'undefined' && window;
    })();
    var options = {
        packaged: false,
        workerPath: null,
        modePath: null,
        themePath: null,
        basePath: "",
        suffix: ".js",
        $moduleUrls: {}
    };
    function get(key) {
        if (!options.hasOwnProperty(key)) {
            throw new Error("Unknown config key: " + key);
        }
        return options[key];
    }
    exports.get = get;
    function set(key, value) {
        if (!options.hasOwnProperty(key)) {
            throw new Error("Unknown config key: " + key);
        }
        options[key] = value;
    }
    exports.set = set;
    function all() {
        return lang_1.copyObject(options);
    }
    exports.all = all;
    var eventEmitter = new event_emitter_1.default();
    oop_1.implement(exports, eventEmitter);
    function _emit(eventName, e) {
        return eventEmitter._emit(eventName, e);
    }
    exports._emit = _emit;
    function _signal(eventName, e) {
        return eventEmitter._signal(eventName, e);
    }
    exports._signal = _signal;
    /**
     *
     */
    function moduleUrl(name, component) {
        if (options.$moduleUrls[name]) {
            return options.$moduleUrls[name];
        }
        var parts = name.split("/");
        component = component || parts[parts.length - 2] || "";
        // TODO: Configurable or get rid of '-'?
        var sep = component === "snippets" ? "/" : "-";
        var base = parts[parts.length - 1];
        if (component === 'worker' && sep === '-') {
            var re = new RegExp("^" + component + "[\\-_]|[\\-_]" + component + "$", "g");
            base = base.replace(re, "");
        }
        if ((!base || base == component) && parts.length > 1) {
            base = parts[parts.length - 2];
        }
        var path = options[component + "Path"];
        if (path == null) {
            path = options.basePath;
        }
        else if (sep == "/") {
            component = sep = "";
        }
        if (path && path.slice(-1) != "/") {
            path += "/";
        }
        return path + component + sep + base + get("suffix");
    }
    exports.moduleUrl = moduleUrl;
    function setModuleUrl(name, subst) {
        return options.$moduleUrls[name] = subst;
    }
    exports.setModuleUrl = setModuleUrl;
    /**
     * A map from module name to an array of callbacks.
     */
    exports.$loading = {};
    // This is an important function.
    // FIXME. It would be more type-safe if the first argument where an array of strings.
    // What is the type of the module returned by the require function?
    // We're actually going to insert a script tag.
    function loadModule(moduleName, onLoad, doc) {
        if (doc === void 0) { doc = document; }
        var module;
        var moduleType;
        if (Array.isArray(moduleName)) {
            moduleType = moduleName[0];
            moduleName = moduleName[1];
        }
        try {
        }
        catch (e) { }
        // require(moduleName) can return empty object if called after require([moduleName], callback)
        if (module && !exports.$loading[moduleName])
            return onLoad && onLoad(module);
        if (!exports.$loading[moduleName]) {
            exports.$loading[moduleName] = [];
        }
        exports.$loading[moduleName].push(onLoad);
        if (exports.$loading[moduleName].length > 1)
            return;
        var afterLoad = function () {
            // FIXME: Re-instate
            /*
            require([moduleName], function(module) {
                exports._emit("load.module", { name: moduleName, module: module });
                //
                // A local copy of all the listeners who want to hear when the module has loaded.
                // We make a local copy because we are going to clear the entry for the module.
                //
                var listeners = $loading[moduleName];
                $loading[moduleName] = null;
                listeners.forEach(function(onLoad) {
                    onLoad && onLoad(module);
                });
            });
            */
        };
        // What is this special name?
        if (!get("packaged")) {
            return afterLoad();
        }
        // Delegate the loading of the script but hook the notification.
        net_1.loadScript(moduleUrl(moduleName, moduleType), afterLoad, doc);
    }
    exports.loadModule = loadModule;
    /**
     * Who calls this function?
     */
    function init(packaged) {
        // FIXME: Restore require of 'packaged' and define.
        options.packaged = packaged /*|| require['packaged']*/ || module.packaged /*|| (global.define && define['packaged'])*/;
        if (!global.document)
            return "";
        var scriptOptions = {};
        var scriptUrl = "";
        // Use currentScript.ownerDocument in case this file was loaded from imported document. (HTML Imports)
        var currentScript = (document['currentScript'] || document['_currentScript']); // native or polyfill
        var currentDocument = currentScript && currentScript.ownerDocument || document;
        var scripts = currentDocument.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
            var script = scripts[i];
            var src = script.src || script.getAttribute("src");
            if (!src)
                continue;
            var attributes = script.attributes;
            for (var j = 0, l = attributes.length; j < l; j++) {
                var attr = attributes[j];
                if (attr.name.indexOf("data-ace-") === 0) {
                    scriptOptions[deHyphenate(attr.name.replace(/^data-ace-/, ""))] = attr.value;
                }
            }
            var m = src.match(/^(.*)\/ace(\-\w+)?\.js(\?|$)/);
            if (m) {
                scriptUrl = m[1];
            }
        }
        if (scriptUrl) {
            scriptOptions['base'] = scriptOptions['base'] || scriptUrl;
            scriptOptions['packaged'] = true;
        }
        scriptOptions['basePath'] = scriptOptions['base'];
        scriptOptions['workerPath'] = scriptOptions['workerPath'] || scriptOptions['base'];
        scriptOptions['modePath'] = scriptOptions['modePath'] || scriptOptions['base'];
        scriptOptions['themePath'] = scriptOptions['themePath'] || scriptOptions['base'];
        delete scriptOptions['base'];
        for (var key in scriptOptions)
            if (typeof scriptOptions[key] !== "undefined")
                set(key, scriptOptions[key]);
    }
    exports.init = init;
    ;
    function deHyphenate(str) {
        return str.replace(/-(.)/g, function (m, m1) { return m1.toUpperCase(); });
    }
    // FIXME: Make this an OptionsProviderMixIn
    var optionsProvider = {
        setOptions: function (optList) {
            Object.keys(optList).forEach(function (key) {
                this.setOption(key, optList[key]);
            }, this);
        },
        getOptions: function (optionNames) {
            var result = {};
            if (!optionNames) {
                optionNames = Object.keys(this.$options);
            }
            else if (!Array.isArray(optionNames)) {
                result = optionNames;
                optionNames = Object.keys(result);
            }
            optionNames.forEach(function (key) {
                result[key] = this.getOption(key);
            }, this);
            return result;
        },
        setOption: function (name, value) {
            if (this["$" + name] === value)
                return;
            var opt = this.$options[name];
            if (!opt) {
                if (typeof console != "undefined" && console.warn)
                    console.warn('misspelled option "' + name + '"');
                return undefined;
            }
            if (opt.forwardTo)
                return this[opt.forwardTo] && this[opt.forwardTo].setOption(name, value);
            if (!opt.handlesSet)
                this["$" + name] = value;
            if (opt && opt.set)
                opt.set.call(this, value);
        },
        getOption: function (name) {
            var opt = this.$options[name];
            if (!opt) {
                if (typeof console != "undefined" && console.warn)
                    console.warn('misspelled option "' + name + '"');
                return undefined;
            }
            if (opt.forwardTo)
                return this[opt.forwardTo] && this[opt.forwardTo].getOption(name);
            return opt && opt.get ? opt.get.call(this) : this["$" + name];
        }
    };
    var defaultOptions = {};
    /*
     * option {name, value, initialValue, setterName, set, get }
     */
    function defineOptions(obj, path, options) {
        if (!obj.$options) {
            defaultOptions[path] = obj.$options = {};
        }
        Object.keys(options).forEach(function (key) {
            var opt = options[key];
            if (typeof opt === "string") {
                opt = { forwardTo: opt };
            }
            opt.name || (opt.name = key);
            obj.$options[opt.name] = opt;
            if ("initialValue" in opt) {
                obj["$" + opt.name] = opt.initialValue;
            }
        });
        // implement option provider interface
        oop_1.implement(obj, optionsProvider);
        return this;
    }
    exports.defineOptions = defineOptions;
    function resetOptions(obj) {
        Object.keys(obj.$options).forEach(function (key) {
            var opt = obj.$options[key];
            if ("value" in opt) {
                obj.setOption(key, opt.value);
            }
        });
    }
    exports.resetOptions = resetOptions;
    function setDefaultValue(path, name, value) {
        var opts = defaultOptions[path] || (defaultOptions[path] = {});
        if (opts[name]) {
            if (opts.forwardTo)
                setDefaultValue(opts.forwardTo, name, value);
            else
                opts[name].value = value;
        }
    }
    exports.setDefaultValue = setDefaultValue;
    function setDefaultValues(path, optionHash) {
        Object.keys(optionHash).forEach(function (key) {
            setDefaultValue(path, key, optionHash[key]);
        });
    }
    exports.setDefaultValues = setDefaultValues;
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
;
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
define('commands/default_commands',["require", "exports", "../lib/lang", "../config", "../Range"], function (require, exports, lang_1, config_1, Range_1) {
    function bindKey(win, mac) {
        return { win: win, mac: mac };
    }
    /*
        multiSelectAction: "forEach"|"forEachLine"|function|undefined,
        scrollIntoView: true|"cursor"|"center"|"selectionPart"
    */
    var commands = [{
            name: "showSettingsMenu",
            bindKey: bindKey("Ctrl-,", "Command-,"),
            exec: function (editor /*: Editor*/) {
                config_1.loadModule("ace/ext/settings_menu", function (module) {
                    module.init(editor);
                    editor.showSettingsMenu();
                });
            },
            readOnly: true
        }, {
            name: "goToNextError",
            bindKey: bindKey("Alt-E", "Ctrl-E"),
            exec: function (editor /*: Editor*/) {
                config_1.loadModule("ace/ext/error_marker", function (module) {
                    module.showErrorMarker(editor, 1);
                });
            },
            scrollIntoView: "animate",
            readOnly: true
        }, {
            name: "goToPreviousError",
            bindKey: bindKey("Alt-Shift-E", "Ctrl-Shift-E"),
            exec: function (editor /*: Editor*/) {
                config_1.loadModule("ace/ext/error_marker", function (module) {
                    module.showErrorMarker(editor, -1);
                });
            },
            scrollIntoView: "animate",
            readOnly: true
        }, {
            name: "selectall",
            bindKey: bindKey("Ctrl-A", "Command-A"),
            exec: function (editor /*: Editor*/) { editor.selectAll(); },
            readOnly: true
        }, {
            name: "centerselection",
            bindKey: bindKey(null, "Ctrl-L"),
            exec: function (editor /*: Editor*/) { editor.centerSelection(); },
            readOnly: true
        }, {
            name: "gotoline",
            bindKey: bindKey("Ctrl-L", "Command-L"),
            exec: function (editor /*: Editor*/) {
                var line = parseInt(prompt("Enter line number:"), 10);
                if (!isNaN(line)) {
                    editor.gotoLine(line);
                }
            },
            readOnly: true
        }, {
            name: "fold",
            bindKey: bindKey("Alt-L|Ctrl-F1", "Command-Alt-L|Command-F1"),
            exec: function (editor /*: Editor*/) { editor.session.toggleFold(false); },
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "unfold",
            bindKey: bindKey("Alt-Shift-L|Ctrl-Shift-F1", "Command-Alt-Shift-L|Command-Shift-F1"),
            exec: function (editor /*: Editor*/) { editor.session.toggleFold(true); },
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "toggleFoldWidget",
            bindKey: bindKey("F2", "F2"),
            exec: function (editor /*: Editor*/) { editor.session.toggleFoldWidget(); },
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "toggleParentFoldWidget",
            bindKey: bindKey("Alt-F2", "Alt-F2"),
            exec: function (editor /*: Editor*/) { editor.session.toggleFoldWidget(true); },
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "foldall",
            bindKey: bindKey("Ctrl-Alt-0", "Ctrl-Command-Option-0"),
            exec: function (editor /*: Editor*/) { editor.session.foldAll(); },
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "foldOther",
            bindKey: bindKey("Alt-0", "Command-Option-0"),
            exec: function (editor /*: Editor*/) {
                editor.session.foldAll();
                editor.session.unfold(editor.selection.getAllRanges());
            },
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "unfoldall",
            bindKey: bindKey("Alt-Shift-0", "Command-Option-Shift-0"),
            exec: function (editor /*: Editor*/) { editor.session.unfold(); },
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "findnext",
            bindKey: bindKey("Ctrl-K", "Command-G"),
            exec: function (editor /*: Editor*/) { editor.findNext(); },
            multiSelectAction: "forEach",
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "findprevious",
            bindKey: bindKey("Ctrl-Shift-K", "Command-Shift-G"),
            exec: function (editor /*: Editor*/) { editor.findPrevious(); },
            multiSelectAction: "forEach",
            scrollIntoView: "center",
            readOnly: true
        }, {
            name: "selectOrFindNext",
            bindKey: bindKey("Alt-K", "Ctrl-G"),
            exec: function (editor /*: Editor*/) {
                if (editor.selection.isEmpty()) {
                    editor.selection.selectWord();
                }
                else {
                    editor.findNext();
                }
            },
            readOnly: true
        }, {
            name: "selectOrFindPrevious",
            bindKey: bindKey("Alt-Shift-K", "Ctrl-Shift-G"),
            exec: function (editor /*: Editor*/) {
                if (editor.selection.isEmpty()) {
                    editor.selection.selectWord();
                }
                else {
                    editor.findPrevious();
                }
            },
            readOnly: true
        }, {
            name: "find",
            bindKey: bindKey("Ctrl-F", "Command-F"),
            exec: function (editor /*: Editor*/) {
                config_1.loadModule("ace/ext/searchbox", function (e) { e.Search(editor); });
            },
            readOnly: true
        }, {
            name: "overwrite",
            bindKey: bindKey("Insert", "Insert"),
            exec: function (editor /*: Editor*/) { editor.toggleOverwrite(); },
            readOnly: true
        }, {
            name: "selecttostart",
            bindKey: bindKey("Ctrl-Shift-Home", "Command-Shift-Up"),
            exec: function (editor /*: Editor*/) { editor.getSelection().selectFileStart(); },
            multiSelectAction: "forEach",
            readOnly: true,
            scrollIntoView: "animate",
            aceCommandGroup: "fileJump"
        }, {
            name: "gotostart",
            bindKey: bindKey("Ctrl-Home", "Command-Home|Command-Up"),
            exec: function (editor) { editor.navigateFileStart(); },
            multiSelectAction: "forEach",
            readOnly: true,
            scrollIntoView: "animate",
            aceCommandGroup: "fileJump"
        }, {
            name: "selectup",
            bindKey: bindKey("Shift-Up", "Shift-Up"),
            exec: function (editor) { editor.getSelection().selectUp(); },
            multiSelectAction: "forEach",
            readOnly: true
        }, {
            name: "golineup",
            bindKey: bindKey("Up", "Up|Ctrl-P"),
            exec: function (editor, args) { editor.navigateUp(args.times); },
            multiSelectAction: "forEach",
            readOnly: true
        }, {
            name: "selecttoend",
            bindKey: bindKey("Ctrl-Shift-End", "Command-Shift-Down"),
            exec: function (editor) { editor.getSelection().selectFileEnd(); },
            multiSelectAction: "forEach",
            readOnly: true,
            scrollIntoView: "animate",
            aceCommandGroup: "fileJump"
        }, {
            name: "gotoend",
            bindKey: bindKey("Ctrl-End", "Command-End|Command-Down"),
            exec: function (editor) { editor.navigateFileEnd(); },
            multiSelectAction: "forEach",
            readOnly: true,
            scrollIntoView: "animate",
            aceCommandGroup: "fileJump"
        }, {
            name: "selectdown",
            bindKey: bindKey("Shift-Down", "Shift-Down"),
            exec: function (editor) { editor.getSelection().selectDown(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "golinedown",
            bindKey: bindKey("Down", "Down|Ctrl-N"),
            exec: function (editor, args) { editor.navigateDown(args.times); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "selectwordleft",
            bindKey: bindKey("Ctrl-Shift-Left", "Option-Shift-Left"),
            exec: function (editor) { editor.getSelection().selectWordLeft(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "gotowordleft",
            bindKey: bindKey("Ctrl-Left", "Option-Left"),
            exec: function (editor) { editor.navigateWordLeft(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "selecttolinestart",
            bindKey: bindKey("Alt-Shift-Left", "Command-Shift-Left"),
            exec: function (editor) { editor.getSelection().selectLineStart(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "gotolinestart",
            bindKey: bindKey("Alt-Left|Home", "Command-Left|Home|Ctrl-A"),
            exec: function (editor) { editor.navigateLineStart(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "selectleft",
            bindKey: bindKey("Shift-Left", "Shift-Left"),
            exec: function (editor) { editor.getSelection().selectLeft(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "gotoleft",
            bindKey: bindKey("Left", "Left|Ctrl-B"),
            exec: function (editor, args) { editor.navigateLeft(args.times); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "selectwordright",
            bindKey: bindKey("Ctrl-Shift-Right", "Option-Shift-Right"),
            exec: function (editor) { editor.getSelection().selectWordRight(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "gotowordright",
            bindKey: bindKey("Ctrl-Right", "Option-Right"),
            exec: function (editor) { editor.navigateWordRight(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "selecttolineend",
            bindKey: bindKey("Alt-Shift-Right", "Command-Shift-Right"),
            exec: function (editor) { editor.getSelection().selectLineEnd(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "gotolineend",
            bindKey: bindKey("Alt-Right|End", "Command-Right|End|Ctrl-E"),
            exec: function (editor) { editor.navigateLineEnd(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "selectright",
            bindKey: bindKey("Shift-Right", "Shift-Right"),
            exec: function (editor) { editor.getSelection().selectRight(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "gotoright",
            bindKey: bindKey("Right", "Right|Ctrl-F"),
            exec: function (editor, args) { editor.navigateRight(args.times); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "selectpagedown",
            bindKey: "Shift-PageDown",
            exec: function (editor) { editor.selectPageDown(); },
            readOnly: true
        }, {
            name: "pagedown",
            bindKey: bindKey(null, "Option-PageDown"),
            exec: function (editor) { editor.scrollPageDown(); },
            readOnly: true
        }, {
            name: "gotopagedown",
            bindKey: bindKey("PageDown", "PageDown|Ctrl-V"),
            exec: function (editor) { editor.gotoPageDown(); },
            readOnly: true
        }, {
            name: "selectpageup",
            bindKey: "Shift-PageUp",
            exec: function (editor) { editor.selectPageUp(); },
            readOnly: true
        }, {
            name: "pageup",
            bindKey: bindKey(null, "Option-PageUp"),
            exec: function (editor) { editor.scrollPageUp(); },
            readOnly: true
        }, {
            name: "gotopageup",
            bindKey: "PageUp",
            exec: function (editor) { editor.gotoPageUp(); },
            readOnly: true
        }, {
            name: "scrollup",
            bindKey: bindKey("Ctrl-Up", null),
            exec: function (e) { e.renderer.scrollBy(0, -2 * e.renderer.layerConfig.lineHeight); },
            readOnly: true
        }, {
            name: "scrolldown",
            bindKey: bindKey("Ctrl-Down", null),
            exec: function (e) { e.renderer.scrollBy(0, 2 * e.renderer.layerConfig.lineHeight); },
            readOnly: true
        }, {
            name: "selectlinestart",
            bindKey: "Shift-Home",
            exec: function (editor) { editor.getSelection().selectLineStart(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "selectlineend",
            bindKey: "Shift-End",
            exec: function (editor) { editor.getSelection().selectLineEnd(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "togglerecording",
            bindKey: bindKey("Ctrl-Alt-E", "Command-Option-E"),
            exec: function (editor) { editor.commands.toggleRecording(editor); },
            readOnly: true
        }, {
            name: "replaymacro",
            bindKey: bindKey("Ctrl-Shift-E", "Command-Shift-E"),
            exec: function (editor) { editor.commands.replay(editor); },
            readOnly: true
        }, {
            name: "jumptomatching",
            bindKey: bindKey("Ctrl-P", "Ctrl-P"),
            exec: function (editor) { editor.jumpToMatching(); },
            multiSelectAction: "forEach",
            readOnly: true
        }, {
            name: "selecttomatching",
            bindKey: bindKey("Ctrl-Shift-P", "Ctrl-Shift-P"),
            exec: function (editor) { editor.jumpToMatching(true); },
            multiSelectAction: "forEach",
            readOnly: true
        }, {
            name: "passKeysToBrowser",
            bindKey: bindKey("null", "null"),
            exec: function () { },
            passEvent: true,
            readOnly: true
        },
        // commands disabled in readOnly mode
        {
            name: "cut",
            exec: function (editor) {
                var range = editor.getSelectionRange();
                editor._emit("cut", range);
                if (!editor.selection.isEmpty()) {
                    editor.session.remove(range);
                    editor.clearSelection();
                }
            },
            scrollIntoView: "cursor",
            multiSelectAction: "forEach"
        }, {
            name: "removeline",
            bindKey: bindKey("Ctrl-D", "Command-D"),
            exec: function (editor) { editor.removeLines(); },
            scrollIntoView: "cursor",
            multiSelectAction: "forEachLine"
        }, {
            name: "duplicateSelection",
            bindKey: bindKey("Ctrl-Shift-D", "Command-Shift-D"),
            exec: function (editor) { editor.duplicateSelection(); },
            scrollIntoView: "cursor",
            multiSelectAction: "forEach"
        }, {
            name: "sortlines",
            bindKey: bindKey("Ctrl-Alt-S", "Command-Alt-S"),
            exec: function (editor) { editor.sortLines(); },
            scrollIntoView: "selection",
            multiSelectAction: "forEachLine"
        }, {
            name: "togglecomment",
            bindKey: bindKey("Ctrl-/", "Command-/"),
            exec: function (editor) { editor.toggleCommentLines(); },
            multiSelectAction: "forEachLine",
            scrollIntoView: "selectionPart"
        }, {
            name: "toggleBlockComment",
            bindKey: bindKey("Ctrl-Shift-/", "Command-Shift-/"),
            exec: function (editor) { editor.toggleBlockComment(); },
            multiSelectAction: "forEach",
            scrollIntoView: "selectionPart"
        }, {
            name: "modifyNumberUp",
            bindKey: bindKey("Ctrl-Shift-Up", "Alt-Shift-Up"),
            exec: function (editor) { editor.modifyNumber(1); },
            multiSelectAction: "forEach"
        }, {
            name: "modifyNumberDown",
            bindKey: bindKey("Ctrl-Shift-Down", "Alt-Shift-Down"),
            exec: function (editor) { editor.modifyNumber(-1); },
            multiSelectAction: "forEach"
        }, {
            name: "replace",
            bindKey: bindKey("Ctrl-H", "Command-Option-F"),
            exec: function (editor) {
                config_1.loadModule("ace/ext/searchbox", function (e) { e.Search(editor, true); });
            }
        }, {
            name: "undo",
            bindKey: bindKey("Ctrl-Z", "Command-Z"),
            exec: function (editor) { editor.undo(); }
        }, {
            name: "redo",
            bindKey: bindKey("Ctrl-Shift-Z|Ctrl-Y", "Command-Shift-Z|Command-Y"),
            exec: function (editor) { editor.redo(); }
        }, {
            name: "copylinesup",
            bindKey: bindKey("Alt-Shift-Up", "Command-Option-Up"),
            exec: function (editor) { editor.copyLinesUp(); },
            scrollIntoView: "cursor"
        }, {
            name: "movelinesup",
            bindKey: bindKey("Alt-Up", "Option-Up"),
            exec: function (editor) { editor.moveLinesUp(); },
            scrollIntoView: "cursor"
        }, {
            name: "copylinesdown",
            bindKey: bindKey("Alt-Shift-Down", "Command-Option-Down"),
            exec: function (editor) { editor.copyLinesDown(); },
            scrollIntoView: "cursor"
        }, {
            name: "movelinesdown",
            bindKey: bindKey("Alt-Down", "Option-Down"),
            exec: function (editor) { editor.moveLinesDown(); },
            scrollIntoView: "cursor"
        }, {
            name: "del",
            bindKey: bindKey("Delete", "Delete|Ctrl-D|Shift-Delete"),
            exec: function (editor) { editor.remove("right"); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "backspace",
            bindKey: bindKey("Shift-Backspace|Backspace", "Ctrl-Backspace|Shift-Backspace|Backspace|Ctrl-H"),
            exec: function (editor) { editor.remove("left"); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "cut_or_delete",
            bindKey: bindKey("Shift-Delete", null),
            exec: function (editor) {
                if (editor.selection.isEmpty()) {
                    editor.remove("left");
                }
                else {
                    return false;
                }
            },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "removetolinestart",
            bindKey: bindKey("Alt-Backspace", "Command-Backspace"),
            exec: function (editor) { editor.removeToLineStart(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "removetolineend",
            bindKey: bindKey("Alt-Delete", "Ctrl-K"),
            exec: function (editor) { editor.removeToLineEnd(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "removewordleft",
            bindKey: bindKey("Ctrl-Backspace", "Alt-Backspace|Ctrl-Alt-Backspace"),
            exec: function (editor) { editor.removeWordLeft(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "removewordright",
            bindKey: bindKey("Ctrl-Delete", "Alt-Delete"),
            exec: function (editor) { editor.removeWordRight(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "outdent",
            bindKey: bindKey("Shift-Tab", "Shift-Tab"),
            exec: function (editor) { editor.blockOutdent(); },
            multiSelectAction: "forEach",
            scrollIntoView: "selectionPart"
        }, {
            name: "indent",
            bindKey: bindKey("Tab", "Tab"),
            exec: function (editor) { editor.indent(); },
            multiSelectAction: "forEach",
            scrollIntoView: "selectionPart"
        }, {
            name: "blockoutdent",
            bindKey: bindKey("Ctrl-[", "Ctrl-["),
            exec: function (editor) { editor.blockOutdent(); },
            multiSelectAction: "forEachLine",
            scrollIntoView: "selectionPart"
        }, {
            name: "blockindent",
            bindKey: bindKey("Ctrl-]", "Ctrl-]"),
            exec: function (editor) { editor.blockIndent(); },
            multiSelectAction: "forEachLine",
            scrollIntoView: "selectionPart"
        }, {
            name: "insertstring",
            exec: function (editor, str) { editor.insert(str); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "inserttext",
            exec: function (editor, args) {
                editor.insert(lang_1.stringRepeat(args.text || "", args.times || 1));
            },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "splitline",
            bindKey: bindKey(null, "Ctrl-O"),
            exec: function (editor) { editor.splitLine(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "transposeletters",
            bindKey: bindKey("Ctrl-T", "Ctrl-T"),
            exec: function (editor) { editor.transposeLetters(); },
            multiSelectAction: function (editor) { editor.transposeSelections(1); },
            scrollIntoView: "cursor"
        }, {
            name: "touppercase",
            bindKey: bindKey("Ctrl-U", "Ctrl-U"),
            exec: function (editor) { editor.toUpperCase(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "tolowercase",
            bindKey: bindKey("Ctrl-Shift-U", "Ctrl-Shift-U"),
            exec: function (editor) { editor.toLowerCase(); },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor"
        }, {
            name: "expandtoline",
            bindKey: bindKey("Ctrl-Shift-L", "Command-Shift-L"),
            exec: function (editor) {
                var range = editor.selection.getRange();
                range.start.column = range.end.column = 0;
                range.end.row++;
                editor.selection.setRange(range, false);
            },
            multiSelectAction: "forEach",
            scrollIntoView: "cursor",
            readOnly: true
        }, {
            name: "joinlines",
            bindKey: bindKey(null, null),
            exec: function (editor) {
                var isBackwards = editor.selection.isBackwards();
                var selectionStart = isBackwards ? editor.selection.getSelectionLead() : editor.selection.getSelectionAnchor();
                var selectionEnd = isBackwards ? editor.selection.getSelectionAnchor() : editor.selection.getSelectionLead();
                var firstLineEndCol = editor.session.doc.getLine(selectionStart.row).length;
                var selectedText = editor.session.doc.getTextRange(editor.selection.getRange());
                var selectedCount = selectedText.replace(/\n\s*/, " ").length;
                var insertLine = editor.session.doc.getLine(selectionStart.row);
                for (var i = selectionStart.row + 1; i <= selectionEnd.row + 1; i++) {
                    var curLine = lang_1.stringTrimLeft(lang_1.stringTrimRight(editor.session.doc.getLine(i)));
                    if (curLine.length !== 0) {
                        curLine = " " + curLine;
                    }
                    insertLine += curLine;
                }
                ;
                if (selectionEnd.row + 1 < (editor.session.doc.getLength() - 1)) {
                    // Don't insert a newline at the end of the document
                    insertLine += editor.session.doc.getNewLineCharacter();
                }
                editor.clearSelection();
                editor.session.doc.replace(new Range_1.default(selectionStart.row, 0, selectionEnd.row + 2, 0), insertLine);
                if (selectedCount > 0) {
                    // Select the text that was previously selected
                    editor.selection.moveCursorTo(selectionStart.row, selectionStart.column);
                    editor.selection.selectTo(selectionStart.row, selectionStart.column + selectedCount);
                }
                else {
                    // If the joined line had something in it, start the cursor at that something
                    firstLineEndCol = editor.session.doc.getLine(selectionStart.row).length > firstLineEndCol ? (firstLineEndCol + 1) : firstLineEndCol;
                    editor.selection.moveCursorTo(selectionStart.row, firstLineEndCol);
                }
            },
            multiSelectAction: "forEach",
            readOnly: true
        }, {
            name: "invertSelection",
            bindKey: bindKey(null, null),
            exec: function (editor) {
                var endRow = editor.session.doc.getLength() - 1;
                var endCol = editor.session.doc.getLine(endRow).length;
                var ranges = editor.selection.rangeList.ranges;
                var newRanges = [];
                // If multiple selections don't exist, rangeList will return 0 so replace with single range
                if (ranges.length < 1) {
                    ranges = [editor.selection.getRange()];
                }
                for (var i = 0; i < ranges.length; i++) {
                    if (i == (ranges.length - 1)) {
                        // The last selection must connect to the end of the document, unless it already does
                        if (!(ranges[i].end.row === endRow && ranges[i].end.column === endCol)) {
                            newRanges.push(new Range_1.default(ranges[i].end.row, ranges[i].end.column, endRow, endCol));
                        }
                    }
                    if (i === 0) {
                        // The first selection must connect to the start of the document, unless it already does
                        if (!(ranges[i].start.row === 0 && ranges[i].start.column === 0)) {
                            newRanges.push(new Range_1.default(0, 0, ranges[i].start.row, ranges[i].start.column));
                        }
                    }
                    else {
                        newRanges.push(new Range_1.default(ranges[i - 1].end.row, ranges[i - 1].end.column, ranges[i].start.row, ranges[i].start.column));
                    }
                }
                editor.exitMultiSelectMode();
                editor.clearSelection();
                for (var i = 0; i < newRanges.length; i++) {
                    editor.selection.addRange(newRanges[i], false);
                }
            },
            readOnly: true,
            scrollIntoView: "none"
        }];
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = commands;
});

define('TokenIterator',["require", "exports"], function (require, exports) {
    /**
     *
     *
     * This class provides an essay way to treat the document as a stream of tokens, and provides methods to iterate over these tokens.
     * @class TokenIterator
     **/
    /**
     * Creates a new token iterator object. The inital token index is set to the provided row and column coordinates.
     * @param {EditSession} session The session to associate with
     * @param {Number} initialRow The row to start the tokenizing at
     * @param {Number} initialColumn The column to start the tokenizing at
     *
     * @constructor
     **/
    var TokenIterator = (function () {
        function TokenIterator(session, initialRow, initialColumn) {
            this.$session = session;
            this.$row = initialRow;
            this.$rowTokens = session.getTokens(initialRow);
            var token = session.getTokenAt(initialRow, initialColumn);
            this.$tokenIndex = token ? token.index : -1;
        }
        /**
        *
        * Tokenizes all the items from the current point to the row prior in the document.
        * @returns {[String]} If the current point is not at the top of the file, this function returns `null`. Otherwise, it returns an array of the tokenized strings.
        **/
        TokenIterator.prototype.stepBackward = function () {
            this.$tokenIndex -= 1;
            while (this.$tokenIndex < 0) {
                this.$row -= 1;
                if (this.$row < 0) {
                    this.$row = 0;
                    return null;
                }
                this.$rowTokens = this.$session.getTokens(this.$row);
                this.$tokenIndex = this.$rowTokens.length - 1;
            }
            return this.$rowTokens[this.$tokenIndex];
        };
        /**
        *
        * Tokenizes all the items from the current point until the next row in the document. If the current point is at the end of the file, this function returns `null`. Otherwise, it returns the tokenized string.
        * @returns {String}
        **/
        TokenIterator.prototype.stepForward = function () {
            this.$tokenIndex += 1;
            var rowCount;
            while (this.$tokenIndex >= this.$rowTokens.length) {
                this.$row += 1;
                if (!rowCount)
                    rowCount = this.$session.getLength();
                if (this.$row >= rowCount) {
                    this.$row = rowCount - 1;
                    return null;
                }
                this.$rowTokens = this.$session.getTokens(this.$row);
                this.$tokenIndex = 0;
            }
            return this.$rowTokens[this.$tokenIndex];
        };
        /**
        *
        * Returns the current tokenized string.
        * @returns {String}
        **/
        TokenIterator.prototype.getCurrentToken = function () {
            return this.$rowTokens[this.$tokenIndex];
        };
        /**
        *
        * Returns the current row.
        * @returns {Number}
        **/
        TokenIterator.prototype.getCurrentTokenRow = function () {
            return this.$row;
        };
        /**
        *
        * Returns the current column.
        * @returns {Number}
        **/
        TokenIterator.prototype.getCurrentTokenColumn = function () {
            var rowTokens = this.$rowTokens;
            var tokenIndex = this.$tokenIndex;
            // If a column was cached by EditSession.getTokenAt, then use it
            var column = rowTokens[tokenIndex].start;
            if (column !== undefined)
                return column;
            column = 0;
            while (tokenIndex > 0) {
                tokenIndex -= 1;
                column += rowTokens[tokenIndex].value.length;
            }
            return column;
        };
        return TokenIterator;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = TokenIterator;
});

define('editor_protocol',["require", "exports"], function (require, exports) {
    exports.COMMAND_NAME_AUTO_COMPLETE = "autoComplete";
});

define('hammer/utils',["require", "exports"], function (require, exports) {
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
     * @returns {number}
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
     * @returns {Boolean}
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
     * @returns {Object} dest
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
     * @returns {Object} dest
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
     * @returns {Function}
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
     * @returns {*}
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
     * @returns {Boolean} found
     */
    function inStr(str, find) {
        return str.indexOf(find) > -1;
    }
    exports.inStr = inStr;
    /**
     * split string on whitespace
     * @param {String} str
     * @returns {Array} words
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
     * @returns {Array}
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
     * @returns {Array} [{id:1},{id:2}]
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
     * @returns {String|Undefined} prefixed
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
     * @returns {number} uniqueId
     */
    var _uniqueId = 1;
    function uniqueId() {
        return _uniqueId++;
    }
    exports.uniqueId = uniqueId;
    /**
     * get the window object of an element
     * @param {HTMLElement} element
     * @returns {Window}
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

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('hammer/hammer',["require", "exports", './utils'], function (require, exports, utils_1) {
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

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('hammer/recognizers/attribute',["require", "exports", '../hammer'], function (require, exports, hammer_1) {
    var ContinuousRecognizer = (function (_super) {
        __extends(ContinuousRecognizer, _super);
        /**
         * This recognizer is just used as a base for the simple attribute recognizers.
         * @constructor
         * @extends Recognizer
         */
        function ContinuousRecognizer(eventName, enabled, pointers) {
            _super.call(this, eventName, enabled);
            this.pointers = pointers;
        }
        /**
         * Used to check if the recognizer receives valid input, like input.distance > 10.
         * @memberof ContinuousRecognizer
         * @param {IComputedEvent} input
         * @returns {Boolean} recognized
         */
        ContinuousRecognizer.prototype.attributeTest = function (input) {
            switch (input.eventType) {
                case hammer_1.INPUT_START:
                    {
                        return input.touchesLength === this.pointers;
                    }
                    break;
                case hammer_1.INPUT_MOVE:
                    {
                        return input.touchesLength === this.pointers;
                    }
                    break;
                case hammer_1.INPUT_END:
                    {
                        return input.touchesLength === this.pointers - 1;
                    }
                    break;
                case hammer_1.INPUT_CANCEL:
                    {
                        return true;
                    }
                    break;
                default: {
                    throw new Error(hammer_1.decodeEventType(input.eventType));
                }
            }
        };
        /**
         * Process the input and return the state for the recognizer
         * @memberof ContinuousRecognizer
         * @param {Object} input
         * @returns {*} State
         */
        ContinuousRecognizer.prototype.process = function (input) {
            var state = this.state;
            var eventType = input.eventType;
            var isRecognized = state & (hammer_1.STATE_BEGAN | hammer_1.STATE_CHANGED);
            var isValid = this.attributeTest(input);
            // on cancel input and we've recognized before, return STATE_CANCELLED
            if (isRecognized && (eventType & hammer_1.INPUT_CANCEL || !isValid)) {
                return state | hammer_1.STATE_CANCELLED;
            }
            else if (isRecognized || isValid) {
                if (eventType & hammer_1.INPUT_END) {
                    return state | hammer_1.STATE_RECOGNIZED;
                }
                else if (!(state & hammer_1.STATE_BEGAN)) {
                    return hammer_1.STATE_BEGAN;
                }
                else {
                    return state | hammer_1.STATE_CHANGED;
                }
            }
            return hammer_1.STATE_FAILED;
        };
        return ContinuousRecognizer;
    })(hammer_1.Recognizer);
    exports.ContinuousRecognizer = ContinuousRecognizer;
});

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('hammer/recognizers/pan',["require", "exports", './attribute', '../hammer'], function (require, exports, attribute_1, hammer_1) {
    /**
     *
     */
    var PanRecognizer = (function (_super) {
        __extends(PanRecognizer, _super);
        function PanRecognizer(eventName, enabled) {
            _super.call(this, eventName, enabled, 1);
            this.direction = hammer_1.DIRECTION_ALL;
            this.threshold = 10;
        }
        PanRecognizer.prototype.setDirection = function (direction) {
            this.direction = direction;
            return this;
        };
        PanRecognizer.prototype.setThreshold = function (threshold) {
            this.threshold = threshold;
            return this;
        };
        PanRecognizer.prototype.getTouchAction = function () {
            var actions = [];
            if (this.direction & hammer_1.DIRECTION_HORIZONTAL) {
                actions.push(hammer_1.TOUCH_ACTION_PAN_Y);
            }
            if (this.direction & hammer_1.DIRECTION_VERTICAL) {
                actions.push(hammer_1.TOUCH_ACTION_PAN_X);
            }
            return actions;
        };
        PanRecognizer.prototype.directionTest = function (input) {
            var hasMoved = true;
            var distance = input.distance;
            var direction = input.direction;
            var x = input.movement.x;
            var y = input.movement.y;
            // lock to axis?
            if (!(direction & this.direction)) {
                if (this.direction & hammer_1.DIRECTION_HORIZONTAL) {
                    direction = (x === 0) ? hammer_1.DIRECTION_UNDEFINED : (x < 0) ? hammer_1.DIRECTION_LEFT : hammer_1.DIRECTION_RIGHT;
                    hasMoved = x != this.pX;
                    distance = Math.abs(input.movement.x);
                }
                else {
                    direction = (y === 0) ? hammer_1.DIRECTION_UNDEFINED : (y < 0) ? hammer_1.DIRECTION_UP : hammer_1.DIRECTION_DOWN;
                    hasMoved = y != this.pY;
                    distance = Math.abs(input.movement.y);
                }
            }
            var directionAllowed = (direction & this.direction) > 0;
            return hasMoved && distance > this.threshold && directionAllowed;
        };
        PanRecognizer.prototype.attributeTest = function (input) {
            this.movement = input.movement;
            // The first and last events will not have movement defined.
            // The direction test requires movement!
            if (input.movement) {
                var directionOK = this.directionTest(input);
                var began = (this.state & hammer_1.STATE_BEGAN) > 0;
                return _super.prototype.attributeTest.call(this, input) && (began || (!began && directionOK));
            }
            else {
                return true;
            }
        };
        PanRecognizer.prototype.emit = function () {
            if (this.movement) {
                this.manager.emit(this.eventName, this.movement);
            }
        };
        return PanRecognizer;
    })(attribute_1.ContinuousRecognizer);
    exports.PanRecognizer = PanRecognizer;
});

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('hammer/recognizers/tap',["require", "exports", '../hammer', '../utils'], function (require, exports, hammer_1, utils_1) {
    function isCorrectTouchCount(input) {
        switch (input.eventType) {
            case hammer_1.INPUT_START:
                {
                    return input.touchesLength === 1;
                }
                break;
            case hammer_1.INPUT_MOVE:
                {
                    return input.touchesLength === 1;
                }
                break;
            case hammer_1.INPUT_END:
                {
                    return input.touchesLength === 0;
                }
                break;
            case hammer_1.INPUT_CANCEL:
                {
                    return true;
                }
                break;
            default: {
                throw new Error(hammer_1.decodeEventType(input.eventType));
            }
        }
    }
    var TapRecognizer = (function (_super) {
        __extends(TapRecognizer, _super);
        function TapRecognizer(eventName, enabled) {
            _super.call(this, eventName ? eventName : 'tap', enabled);
            //private _input: IComputedEvent;
            this.count = 0;
            this.taps = 1;
            this.pointers = 1;
            this.time = 250; // max time of the pointer to be down (like finger on the screen)
            this.threshold = 6; // a minimal movement is ok, but keep it low
            this.interval = 300; // max time between the multi-tap taps
            this.posThreshold = 10; // a multi-tap can be a bit off the initial position
        }
        TapRecognizer.prototype.getTouchAction = function () {
            return [hammer_1.TOUCH_ACTION_MANIPULATION];
        };
        TapRecognizer.prototype.process = function (input) {
            this.reset();
            if (!isCorrectTouchCount(input)) {
                return hammer_1.STATE_FAILED;
            }
            if ((input.eventType & hammer_1.INPUT_START) && (this.count === 0)) {
                this.center = input.center;
                return this.failTimeout();
            }
            if (input.distance >= this.threshold) {
                return hammer_1.STATE_FAILED;
            }
            if (input.deltaTime >= this.time) {
                return hammer_1.STATE_FAILED;
            }
            // and we've reached an end event, so a tap is possible
            if (input.eventType !== hammer_1.INPUT_END) {
                this.center = input.center;
                return this.failTimeout();
            }
            else {
            }
            var validInterval = this.pTime ? (input.timeStamp - this.pTime < this.interval) : true;
            var validMultiTap = !this.pCenter || hammer_1.getDistance(this.pCenter, input.center) < this.posThreshold;
            this.pTime = input.timeStamp;
            this.pCenter = input.center;
            if (!validMultiTap || !validInterval) {
                this.count = 1;
            }
            else {
                this.count += 1;
            }
            // if tap count matches we have recognized it,
            // else it has began recognizing...
            var tapCount = this.count % this.taps;
            if (tapCount === 0) {
                // no failing requirements, immediately trigger the tap event
                // or wait as long as the multitap interval to trigger
                if (!this.hasRequireFailures()) {
                    return hammer_1.STATE_RECOGNIZED;
                }
                else {
                    this._timer = utils_1.setTimeoutContext(function () {
                        this.state = hammer_1.STATE_RECOGNIZED;
                        this.tryEmit();
                    }, this.interval, this);
                    return hammer_1.STATE_BEGAN;
                }
            }
            return hammer_1.STATE_FAILED;
        };
        TapRecognizer.prototype.failTimeout = function () {
            this._timer = utils_1.setTimeoutContext(function () {
                this.state = hammer_1.STATE_FAILED;
            }, this.interval, this);
            return hammer_1.STATE_FAILED;
        };
        TapRecognizer.prototype.reset = function () {
            clearTimeout(this._timer);
        };
        TapRecognizer.prototype.emit = function () {
            if (this.state === hammer_1.STATE_RECOGNIZED) {
                this.manager.emit(this.eventName, this.center);
            }
        };
        return TapRecognizer;
    })(hammer_1.Recognizer);
    exports.TapRecognizer = TapRecognizer;
});

define('touch/touch',["require", "exports", '../hammer/hammer', '../hammer/recognizers/pan', '../hammer/recognizers/tap'], function (require, exports, hammer_1, pan_1, tap_1) {
    function touchManager(editor) {
        var target = editor.renderer.getMouseEventTarget();
        var manager = new hammer_1.Manager(target);
        manager.add(new pan_1.PanRecognizer('pan', true).setDirection(hammer_1.DIRECTION_VERTICAL).setThreshold(20));
        manager.add(new tap_1.TapRecognizer('tap', true));
        manager.on('pan', function (movement) {
            editor.renderer.scrollBy(-movement.x, -movement.y);
        });
        manager.on('tap', function (event) {
            var pos = editor.renderer.screenToTextCoordinates(event.clientX, event.clientY);
            pos.row = Math.max(0, Math.min(pos.row, editor.session.getLength() - 1));
            editor.moveCursorToPosition(pos);
            editor.renderer.scrollCursorIntoView();
            editor.focus();
        });
        return manager;
    }
    exports.touchManager = touchManager;
});

define('Tooltip',["require", "exports", "./lib/dom"], function (require, exports, dom_1) {
    /**
     * @class Tooltip
     */
    var Tooltip = (function () {
        /**
         * @class Tooltip
         * @constructor
         * @param parentElement {HTMLElement}
         */
        function Tooltip(parentElement) {
            this.isOpen = false;
            this.$element = null;
            this.$parentElement = parentElement;
        }
        /**
         * This internal method is called (lazily) once through the `getElement` method.
         * It creates the $element member.
         * @method $init
         * @return {HTMLElement}
         * @private
         */
        Tooltip.prototype.$init = function () {
            this.$element = dom_1.createElement('div');
            this.$element.className = "ace_tooltip";
            this.$element.style.display = "none";
            this.$parentElement.appendChild(this.$element);
            return this.$element;
        };
        /**
         * Provides the HTML div element.
         * @method getElement
         * @returns {HTMLElement}
         */
        Tooltip.prototype.getElement = function () {
            return this.$element || this.$init();
        };
        /**
         * Use the dom method `setInnerText`
         * @method setText
         * @param {string} text
         * @return {void}
         */
        Tooltip.prototype.setText = function (text) {
            dom_1.setInnerText(this.getElement(), text);
        };
        /**
         * Sets the `innerHTML` property on the div element.
         * @method setHtml
         * @param {string} html
         * @return {void}
         */
        Tooltip.prototype.setHtml = function (html) {
            this.getElement().innerHTML = html;
        };
        /**
         * Sets the `left` and `top` CSS style properties.
         * This action can also happen during the `show` method.
         * @method setPosition
         * @param {number} left The style 'left' value in pixels.
         * @param {number} top The style 'top' value in pixels.
         */
        Tooltip.prototype.setPosition = function (left, top) {
            var style = this.getElement().style;
            style.left = left + "px";
            style.top = top + "px";
        };
        /**
         * Adds a CSS class to the underlying tooltip div element using the dom method `addCssClass`
         * @method setClassName
         * @param {string} className
         * @return {void}
         */
        Tooltip.prototype.setClassName = function (className) {
            dom_1.addCssClass(this.getElement(), className);
        };
        /**
         * Shows the tool by setting the CSS display property to 'block'.
         * The text parameter is optional, but if provided sets HTML.
         * FIXME: Remove the text parameter in favor of explicit pre-setting.
         * FIXME: Remove left and top too.
         * @method show
         * @param [string] text
         * @param [number] left
         * @param [number] top
         * @return {void}
         */
        Tooltip.prototype.show = function (text, left, top) {
            if (typeof text === 'string') {
                this.setText(text);
            }
            if ((typeof left === 'number') && (typeof top === 'number')) {
                this.setPosition(left, top);
            }
            if (!this.isOpen) {
                this.getElement().style.display = 'block';
                this.isOpen = true;
            }
        };
        /**
         * Hides the tool by setting the CSS display property to 'none'.
         * @method hide
         * @return {void}
         */
        Tooltip.prototype.hide = function () {
            if (this.isOpen) {
                this.getElement().style.display = 'none';
                this.isOpen = false;
            }
        };
        /**
         * Returns the `offsetHeight` property of the div element.
         * @method getHeight
         * @return {number}
         */
        Tooltip.prototype.getHeight = function () {
            return this.getElement().offsetHeight;
        };
        /**
         * Returns the `offsetWidth` property of the div element.
         * @method getWidth
         * @return {number}
         */
        Tooltip.prototype.getWidth = function () {
            return this.getElement().offsetWidth;
        };
        return Tooltip;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Tooltip;
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('Editor',["require", "exports", "./lib/oop", "./lib/dom", "./lib/lang", "./lib/useragent", "./keyboard/KeyBinding", "./keyboard/TextInput", "./Search", "./Range", "./lib/event_emitter", "./commands/CommandManager", "./commands/default_commands", "./config", "./TokenIterator", './editor_protocol', "./lib/event", './touch/touch', "./Tooltip"], function (require, exports, oop_1, dom_1, lang_1, useragent_1, KeyBinding_1, TextInput_1, Search_1, Range_1, event_emitter_1, CommandManager_1, default_commands_1, config_1, TokenIterator_1, editor_protocol_1, event_1, touch_1, Tooltip_1) {
    //var DragdropHandler = require("./mouse/dragdrop_handler").DragdropHandler;
    /**
     * The main entry point into the Ace functionality.
     *
     * The `Editor` manages the [[EditSession]] (which manages [[Document]]s), as well as the [[VirtualRenderer]], which draws everything to the screen.
     *
     * Event sessions dealing with the mouse and keyboard are bubbled up from `Document` to the `Editor`, which decides what to do with them.
     * @class Editor
     */
    /**
     * Creates a new `Editor` object.
     *
     * @param {VirtualRenderer} renderer Associated `VirtualRenderer` that draws everything
     * @param {EditSession} session The `EditSession` to refer to
     *
     *
     * @constructor
     */
    var Editor = (function (_super) {
        __extends(Editor, _super);
        function Editor(renderer, session) {
            _super.call(this);
            this.curOp = null;
            this.prevOp = {};
            this.$mergeableCommands = ["backspace", "del", "insertstring"];
            this.commands = new CommandManager_1.default(useragent_1.isMac ? "mac" : "win", default_commands_1.default);
            this.container = renderer.getContainerElement();
            this.renderer = renderer;
            this.textInput = new TextInput_1.default(renderer.getTextAreaContainer(), this);
            this.renderer.textarea = this.textInput.getElement();
            this.keyBinding = new KeyBinding_1.default(this);
            if (useragent_1.isMobile) {
                this.$touchHandler = touch_1.touchManager(this);
                this.$mouseHandler = new MouseHandler(this);
            }
            else {
                this.$touchHandler = touch_1.touchManager(this);
                this.$mouseHandler = new MouseHandler(this);
            }
            new FoldHandler(this);
            this.$blockScrolling = 0;
            this.$search = new Search_1.default().set({ wrap: true });
            this.$historyTracker = this.$historyTracker.bind(this);
            this.commands.on("exec", this.$historyTracker);
            this.$initOperationListeners();
            this._$emitInputEvent = lang_1.delayedCall(function () {
                this._signal("input", {});
                this.session.bgTokenizer && this.session.bgTokenizer.scheduleStart();
            }.bind(this));
            var self = this;
            this.on("change", function () {
                self._$emitInputEvent.schedule(31);
            });
            this.setSession(session);
            config_1.resetOptions(this);
            config_1._signal("editor", this);
        }
        Editor.prototype.cancelMouseContextMenu = function () {
            this.$mouseHandler.cancelContextMenu();
        };
        Object.defineProperty(Editor.prototype, "selection", {
            get: function () {
                return this.session.getSelection();
            },
            set: function (selection) {
                this.session.setSelection(selection);
            },
            enumerable: true,
            configurable: true
        });
        Editor.prototype.$initOperationListeners = function () {
            function last(a) { return a[a.length - 1]; }
            this.selections = [];
            this.commands.on("exec", function (e) {
                this.startOperation(e);
                var command = e.command;
                if (command.aceCommandGroup == "fileJump") {
                    var prev = this.prevOp;
                    if (!prev || prev.command.aceCommandGroup != "fileJump") {
                        this.lastFileJumpPos = last(this.selections);
                    }
                }
                else {
                    this.lastFileJumpPos = null;
                }
            }.bind(this), true);
            this.commands.on("afterExec", function (e) {
                var command = e.command;
                if (command.aceCommandGroup == "fileJump") {
                    if (this.lastFileJumpPos && !this.curOp.selectionChanged) {
                        this.selection.fromJSON(this.lastFileJumpPos);
                    }
                }
                this.endOperation(e);
            }.bind(this), true);
            this.$opResetTimer = lang_1.delayedCall(this.endOperation.bind(this));
            this.on("change", function () {
                this.curOp || this.startOperation();
                this.curOp.docChanged = true;
            }.bind(this), true);
            this.on("changeSelection", function () {
                this.curOp || this.startOperation();
                this.curOp.selectionChanged = true;
            }.bind(this), true);
        };
        Editor.prototype.startOperation = function (commadEvent) {
            if (this.curOp) {
                if (!commadEvent || this.curOp.command)
                    return;
                this.prevOp = this.curOp;
            }
            if (!commadEvent) {
                this.previousCommand = null;
                commadEvent = {};
            }
            this.$opResetTimer.schedule();
            this.curOp = {
                command: commadEvent.command || {},
                args: commadEvent.args,
                scrollTop: this.renderer.scrollTop
            };
            var command = this.curOp.command;
            if (command && command.scrollIntoView)
                this.$blockScrolling++;
            this.selections.push(this.selection.toJSON());
        };
        Editor.prototype.endOperation = function () {
            if (this.curOp) {
                var command = this.curOp.command;
                if (command && command.scrollIntoView) {
                    this.$blockScrolling--;
                    switch (command.scrollIntoView) {
                        case "center":
                            this.renderer.scrollCursorIntoView(null, 0.5);
                            break;
                        case "animate":
                        case "cursor":
                            this.renderer.scrollCursorIntoView();
                            break;
                        case "selectionPart":
                            var range = this.selection.getRange();
                            var config = this.renderer.layerConfig;
                            if (range.start.row >= config.lastRow || range.end.row <= config.firstRow) {
                                this.renderer.scrollSelectionIntoView(this.selection.anchor, this.selection.lead);
                            }
                            break;
                        default:
                            break;
                    }
                    if (command.scrollIntoView == "animate")
                        this.renderer.animateScrolling(this.curOp.scrollTop);
                }
                this.prevOp = this.curOp;
                this.curOp = null;
            }
        };
        Editor.prototype.$historyTracker = function (e) {
            if (!this.$mergeUndoDeltas)
                return;
            var prev = this.prevOp;
            var mergeableCommands = this.$mergeableCommands;
            // previous command was the same
            var shouldMerge = prev.command && (e.command.name == prev.command.name);
            if (e.command.name == "insertstring") {
                var text = e.args;
                if (this.mergeNextCommand === undefined)
                    this.mergeNextCommand = true;
                shouldMerge = shouldMerge
                    && this.mergeNextCommand // previous command allows to coalesce with
                    && (!/\s/.test(text) || /\s/.test(prev.args)); // previous insertion was of same type
                this.mergeNextCommand = true;
            }
            else {
                shouldMerge = shouldMerge
                    && mergeableCommands.indexOf(e.command.name) !== -1; // the command is mergeable
            }
            if (this.$mergeUndoDeltas != "always"
                && Date.now() - this.sequenceStartTime > 2000) {
                shouldMerge = false; // the sequence is too long
            }
            if (shouldMerge)
                this.session.mergeUndoDeltas = true;
            else if (mergeableCommands.indexOf(e.command.name) !== -1)
                this.sequenceStartTime = Date.now();
        };
        /**
         * Sets a new key handler, such as "vim" or "windows".
         * @param {string|HasgHandler} keyboardHandler The new key handler
         *
         **/
        Editor.prototype.setKeyboardHandler = function (keyboardHandler) {
            if (!keyboardHandler) {
                this.keyBinding.setKeyboardHandler(null);
            }
            else if (typeof keyboardHandler === "string") {
                this.$keybindingId = keyboardHandler;
                var _self = this;
                config_1.loadModule(["keybinding", keyboardHandler], function (module) {
                    if (_self.$keybindingId == keyboardHandler)
                        _self.keyBinding.setKeyboardHandler(module && module.handler);
                }, this.container.ownerDocument);
            }
            else {
                this.$keybindingId = null;
                this.keyBinding.setKeyboardHandler(keyboardHandler);
            }
        };
        /**
         * Returns the keyboard handler, such as "vim" or "windows".
         *
         * @returns {String}
         *
         */
        Editor.prototype.getKeyboardHandler = function () {
            return this.keyBinding.getKeyboardHandler();
        };
        /**
         * Emitted whenever the [[EditSession]] changes.
         * @event changeSession
         * @param {Object} e An object with two properties, `oldSession` and `session`, that represent the old and new [[EditSession]]s.
         *
         **/
        /**
         * Sets a new editsession to use. This method also emits the `'changeSession'` event.
         * @param {EditSession} session The new session to use
         *
         **/
        Editor.prototype.setSession = function (session) {
            if (this.session == session)
                return;
            var oldSession = this.session;
            if (oldSession) {
                this.session.off("change", this.$onDocumentChange);
                this.session.off("changeMode", this.$onChangeMode);
                this.session.off("tokenizerUpdate", this.$onTokenizerUpdate);
                this.session.off("changeTabSize", this.$onChangeTabSize);
                this.session.off("changeWrapLimit", this.$onChangeWrapLimit);
                this.session.off("changeWrapMode", this.$onChangeWrapMode);
                this.session.off("onChangeFold", this.$onChangeFold);
                this.session.off("changeFrontMarker", this.$onChangeFrontMarker);
                this.session.off("changeBackMarker", this.$onChangeBackMarker);
                this.session.off("changeBreakpoint", this.$onChangeBreakpoint);
                this.session.off("changeAnnotation", this.$onChangeAnnotation);
                this.session.off("changeOverwrite", this.$onCursorChange);
                this.session.off("changeScrollTop", this.$onScrollTopChange);
                this.session.off("changeScrollLeft", this.$onScrollLeftChange);
                var selection = this.session.getSelection();
                selection.off("changeCursor", this.$onCursorChange);
                selection.off("changeSelection", this.$onSelectionChange);
            }
            this.session = session;
            if (session) {
                this.$onDocumentChange = this.onDocumentChange.bind(this);
                session.on("change", this.$onDocumentChange);
                this.renderer.setSession(session);
                this.$onChangeMode = this.onChangeMode.bind(this);
                session.on("changeMode", this.$onChangeMode);
                this.$onTokenizerUpdate = this.onTokenizerUpdate.bind(this);
                session.on("tokenizerUpdate", this.$onTokenizerUpdate);
                this.$onChangeTabSize = this.renderer.onChangeTabSize.bind(this.renderer);
                session.on("changeTabSize", this.$onChangeTabSize);
                this.$onChangeWrapLimit = this.onChangeWrapLimit.bind(this);
                session.on("changeWrapLimit", this.$onChangeWrapLimit);
                this.$onChangeWrapMode = this.onChangeWrapMode.bind(this);
                session.on("changeWrapMode", this.$onChangeWrapMode);
                this.$onChangeFold = this.onChangeFold.bind(this);
                session.on("changeFold", this.$onChangeFold);
                this.$onChangeFrontMarker = this.onChangeFrontMarker.bind(this);
                session.on("changeFrontMarker", this.$onChangeFrontMarker);
                this.$onChangeBackMarker = this.onChangeBackMarker.bind(this);
                session.on("changeBackMarker", this.$onChangeBackMarker);
                this.$onChangeBreakpoint = this.onChangeBreakpoint.bind(this);
                session.on("changeBreakpoint", this.$onChangeBreakpoint);
                this.$onChangeAnnotation = this.onChangeAnnotation.bind(this);
                session.on("changeAnnotation", this.$onChangeAnnotation);
                this.$onCursorChange = this.onCursorChange.bind(this);
                session.on("changeOverwrite", this.$onCursorChange);
                this.$onScrollTopChange = this.onScrollTopChange.bind(this);
                session.on("changeScrollTop", this.$onScrollTopChange);
                this.$onScrollLeftChange = this.onScrollLeftChange.bind(this);
                session.on("changeScrollLeft", this.$onScrollLeftChange);
                this.selection = session.getSelection();
                this.selection.on("changeCursor", this.$onCursorChange);
                this.$onSelectionChange = this.onSelectionChange.bind(this);
                this.selection.on("changeSelection", this.$onSelectionChange);
                this.onChangeMode(void 0, this.session);
                this.$blockScrolling += 1;
                this.onCursorChange(void 0, this.session);
                this.$blockScrolling -= 1;
                this.onScrollTopChange(void 0, this.session);
                this.onScrollLeftChange(void 0, this.session);
                this.onSelectionChange(void 0, this.selection);
                this.onChangeFrontMarker(void 0, this.session);
                this.onChangeBackMarker(void 0, this.session);
                this.onChangeBreakpoint(void 0, this.session);
                this.onChangeAnnotation(void 0, this.session);
                session.getUseWrapMode() && this.renderer.adjustWrapLimit();
                this.renderer.updateFull();
            }
            this._signal("changeSession", {
                session: session,
                oldSession: oldSession
            });
            oldSession && oldSession._signal("changeEditor", { oldEditor: this });
            session && session._signal("changeEditor", { editor: this });
        };
        /**
         * Returns the current session being used.
         * @returns {EditSession}
         **/
        Editor.prototype.getSession = function () {
            return this.session;
        };
        /**
         * Sets the current document to `val`.
         * @param {String} val The new value to set for the document
         * @param {Number} cursorPos Where to set the new value. `undefined` or 0 is selectAll, -1 is at the document start, and +1 is at the end
         *
         * @returns {String} The current document value
         * @related Document.setValue
         **/
        Editor.prototype.setValue = function (val, cursorPos) {
            this.session.doc.setValue(val);
            if (!cursorPos) {
                this.selectAll();
            }
            else if (cursorPos == +1) {
                this.navigateFileEnd();
            }
            else if (cursorPos == -1) {
                this.navigateFileStart();
            }
            // TODO: Rather crazy! Either return this or the former value?
            return val;
        };
        /**
         * Returns the current session's content.
         *
         * @returns {String}
         * @related EditSession.getValue
         **/
        Editor.prototype.getValue = function () {
            return this.session.getValue();
        };
        /**
         *
         * Returns the currently highlighted selection.
         * @returns {String} The highlighted selection
         **/
        Editor.prototype.getSelection = function () {
            return this.selection;
        };
        /**
         * @method resize
         * @param [force] {boolean} force If `true`, recomputes the size, even if the height and width haven't changed.
         * @return {void}
         */
        Editor.prototype.resize = function (force) {
            this.renderer.onResize(force);
        };
        /**
         * {:VirtualRenderer.setTheme}
         * @param {String} theme The path to a theme
         * @param {Function} cb optional callback called when theme is loaded
         **/
        Editor.prototype.setTheme = function (theme, cb) {
            this.renderer.setTheme(theme, cb);
        };
        /**
         * {:VirtualRenderer.getTheme}
         *
         * @returns {String} The set theme
         * @related VirtualRenderer.getTheme
         **/
        Editor.prototype.getTheme = function () {
            return this.renderer.getTheme();
        };
        /**
         * {:VirtualRenderer.setStyle}
         * @param {String} style A class name
         *
         * @related VirtualRenderer.setStyle
         **/
        Editor.prototype.setStyle = function (style) {
            this.renderer.setStyle(style);
        };
        /**
         * {:VirtualRenderer.unsetStyle}
         * @related VirtualRenderer.unsetStyle
         **/
        Editor.prototype.unsetStyle = function (style) {
            this.renderer.unsetStyle(style);
        };
        /**
         * Gets the current font size of the editor text.
         */
        Editor.prototype.getFontSize = function () {
            return this.getOption("fontSize") || dom_1.computedStyle(this.container, "fontSize");
        };
        /**
         * Set a new font size (in pixels) for the editor text.
         * @param {string} fontSize A font size ( _e.g._ "12px")
         *
         *
         **/
        Editor.prototype.setFontSize = function (fontSize) {
            this.setOption("fontSize", fontSize);
        };
        Editor.prototype.$highlightBrackets = function () {
            if (this.session.$bracketHighlight) {
                this.session.removeMarker(this.session.$bracketHighlight);
                this.session.$bracketHighlight = void 0;
            }
            if (this.$highlightPending) {
                return;
            }
            // perform highlight async to not block the browser during navigation
            var self = this;
            this.$highlightPending = true;
            setTimeout(function () {
                self.$highlightPending = false;
                var pos = self.session.findMatchingBracket(self.getCursorPosition());
                if (pos) {
                    var range = new Range_1.default(pos.row, pos.column, pos.row, pos.column + 1);
                }
                else if (self.session.$mode.getMatching) {
                    var range = self.session.$mode.getMatching(self.session);
                }
                if (range)
                    self.session.$bracketHighlight = self.session.addMarker(range, "ace_bracket", "text");
            }, 50);
        };
        // todo: move to mode.getMatching
        Editor.prototype.$highlightTags = function () {
            var session = this.session;
            if (this.$highlightTagPending) {
                return;
            }
            // perform highlight async to not block the browser during navigation
            var self = this;
            this.$highlightTagPending = true;
            setTimeout(function () {
                self.$highlightTagPending = false;
                var pos = self.getCursorPosition();
                var iterator = new TokenIterator_1.default(self.session, pos.row, pos.column);
                var token = iterator.getCurrentToken();
                if (!token || token.type.indexOf('tag-name') === -1) {
                    session.removeMarker(session.$tagHighlight);
                    session.$tagHighlight = null;
                    return;
                }
                var tag = token.value;
                var depth = 0;
                var prevToken = iterator.stepBackward();
                if (prevToken.value == '<') {
                    //find closing tag
                    do {
                        prevToken = token;
                        token = iterator.stepForward();
                        if (token && token.value === tag && token.type.indexOf('tag-name') !== -1) {
                            if (prevToken.value === '<') {
                                depth++;
                            }
                            else if (prevToken.value === '</') {
                                depth--;
                            }
                        }
                    } while (token && depth >= 0);
                }
                else {
                    //find opening tag
                    do {
                        token = prevToken;
                        prevToken = iterator.stepBackward();
                        if (token && token.value === tag && token.type.indexOf('tag-name') !== -1) {
                            if (prevToken.value === '<') {
                                depth++;
                            }
                            else if (prevToken.value === '</') {
                                depth--;
                            }
                        }
                    } while (prevToken && depth <= 0);
                    //select tag again
                    iterator.stepForward();
                }
                if (!token) {
                    session.removeMarker(session.$tagHighlight);
                    session.$tagHighlight = null;
                    return;
                }
                var row = iterator.getCurrentTokenRow();
                var column = iterator.getCurrentTokenColumn();
                var range = new Range_1.default(row, column, row, column + token.value.length);
                //remove range if different
                if (session.$tagHighlight && range.compareRange(session.$backMarkers[session.$tagHighlight].range) !== 0) {
                    session.removeMarker(session.$tagHighlight);
                    session.$tagHighlight = null;
                }
                if (range && !session.$tagHighlight)
                    session.$tagHighlight = session.addMarker(range, "ace_bracket", "text");
            }, 50);
        };
        /**
         *
         * Brings the current `textInput` into focus.
         **/
        Editor.prototype.focus = function () {
            // Safari needs the timeout
            // iOS and Firefox need it called immediately
            // to be on the save side we do both
            var _self = this;
            setTimeout(function () {
                _self.textInput.focus();
            });
            this.textInput.focus();
        };
        /**
         * Returns `true` if the current `textInput` is in focus.
         * @return {Boolean}
         **/
        Editor.prototype.isFocused = function () {
            return this.textInput.isFocused();
        };
        /**
         *
         * Blurs the current `textInput`.
         **/
        Editor.prototype.blur = function () {
            this.textInput.blur();
        };
        /**
         * Emitted once the editor comes into focus.
         * @event focus
         *
         **/
        Editor.prototype.onFocus = function () {
            if (this.$isFocused) {
                return;
            }
            this.$isFocused = true;
            this.renderer.showCursor();
            this.renderer.visualizeFocus();
            this._emit("focus");
        };
        /**
         * Emitted once the editor has been blurred.
         * @event blur
         *
         *
         **/
        Editor.prototype.onBlur = function () {
            if (!this.$isFocused) {
                return;
            }
            this.$isFocused = false;
            this.renderer.hideCursor();
            this.renderer.visualizeBlur();
            this._emit("blur");
        };
        Editor.prototype.$cursorChange = function () {
            this.renderer.updateCursor();
        };
        /**
         * Emitted whenever the document is changed.
         * @event change
         * @param {Object} e Contains a single property, `data`, which has the delta of changes
         *
         **/
        Editor.prototype.onDocumentChange = function (e, editSession) {
            var delta = e.data;
            var range = delta.range;
            var lastRow;
            if (range.start.row == range.end.row && delta.action != "insertLines" && delta.action != "removeLines")
                lastRow = range.end.row;
            else
                lastRow = Infinity;
            var r = this.renderer;
            r.updateLines(range.start.row, lastRow, this.session.$useWrapMode);
            this._signal("change", e);
            // update cursor because tab characters can influence the cursor position
            this.$cursorChange();
            this.$updateHighlightActiveLine();
        };
        Editor.prototype.onTokenizerUpdate = function (event, editSession) {
            var rows = event.data;
            this.renderer.updateLines(rows.first, rows.last);
        };
        Editor.prototype.onScrollTopChange = function (event, editSession) {
            this.renderer.scrollToY(this.session.getScrollTop());
        };
        Editor.prototype.onScrollLeftChange = function (event, editSession) {
            this.renderer.scrollToX(this.session.getScrollLeft());
        };
        /**
         * Handler for cursor or selection changes.
         */
        Editor.prototype.onCursorChange = function (event, editSession) {
            this.$cursorChange();
            if (!this.$blockScrolling) {
                this.renderer.scrollCursorIntoView();
            }
            this.$highlightBrackets();
            this.$highlightTags();
            this.$updateHighlightActiveLine();
            // TODO; How is signal different from emit?
            this._signal("changeSelection");
        };
        Editor.prototype.$updateHighlightActiveLine = function () {
            var session = this.session;
            var renderer = this.renderer;
            var highlight;
            if (this.$highlightActiveLine) {
                if ((this.$selectionStyle != "line" || !this.selection.isMultiLine())) {
                    highlight = this.getCursorPosition();
                }
                if (renderer.$maxLines && session.getLength() === 1 && !(renderer.$minLines > 1)) {
                    highlight = false;
                }
            }
            if (session.$highlightLineMarker && !highlight) {
                session.removeMarker(session.$highlightLineMarker.markerId);
                session.$highlightLineMarker = null;
            }
            else if (!session.$highlightLineMarker && highlight) {
                var range = new Range_1.default(highlight.row, highlight.column, highlight.row, Infinity);
                range.markerId = session.addMarker(range, "ace_active-line", "screenLine");
                session.$highlightLineMarker = range;
            }
            else if (highlight) {
                session.$highlightLineMarker.start.row = highlight.row;
                session.$highlightLineMarker.end.row = highlight.row;
                session.$highlightLineMarker.start.column = highlight.column;
                session._signal("changeBackMarker");
            }
        };
        // This version has not been bound to `this`, so don't use it directly.
        Editor.prototype.onSelectionChange = function (event, selection) {
            var session = this.session;
            if (typeof session.$selectionMarker === 'number') {
                session.removeMarker(session.$selectionMarker);
                session.$selectionMarker = null;
            }
            if (!this.selection.isEmpty()) {
                var range = this.selection.getRange();
                var style = this.getSelectionStyle();
                session.$selectionMarker = session.addMarker(range, "ace_selection", style);
            }
            else {
                this.$updateHighlightActiveLine();
            }
            var re = this.$highlightSelectedWord && this.$getSelectionHighLightRegexp();
            this.session.highlight(re);
            this._signal("changeSelection");
        };
        Editor.prototype.$getSelectionHighLightRegexp = function () {
            var session = this.session;
            var selection = this.getSelectionRange();
            if (selection.isEmpty() || selection.isMultiLine())
                return;
            var startOuter = selection.start.column - 1;
            var endOuter = selection.end.column + 1;
            var line = session.getLine(selection.start.row);
            var lineCols = line.length;
            var needle = line.substring(Math.max(startOuter, 0), Math.min(endOuter, lineCols));
            // Make sure the outer characters are not part of the word.
            if ((startOuter >= 0 && /^[\w\d]/.test(needle)) ||
                (endOuter <= lineCols && /[\w\d]$/.test(needle)))
                return;
            needle = line.substring(selection.start.column, selection.end.column);
            if (!/^[\w\d]+$/.test(needle))
                return;
            var re = this.$search.$assembleRegExp({
                wholeWord: true,
                caseSensitive: true,
                needle: needle
            });
            return re;
        };
        Editor.prototype.onChangeFrontMarker = function (event, editSession) {
            this.renderer.updateFrontMarkers();
        };
        Editor.prototype.onChangeBackMarker = function (event, editSession) {
            this.renderer.updateBackMarkers();
        };
        Editor.prototype.onChangeBreakpoint = function (event, editSession) {
            this.renderer.updateBreakpoints();
            this._emit("changeBreakpoint", event);
        };
        Editor.prototype.onChangeAnnotation = function (event, editSession) {
            this.renderer.setAnnotations(editSession.getAnnotations());
            this._emit("changeAnnotation", event);
        };
        Editor.prototype.onChangeMode = function (event, editSession) {
            this.renderer.updateText();
            this._emit("changeMode", event);
        };
        Editor.prototype.onChangeWrapLimit = function (event, editSession) {
            this.renderer.updateFull();
        };
        Editor.prototype.onChangeWrapMode = function (event, editSession) {
            this.renderer.onResize(true);
        };
        Editor.prototype.onChangeFold = function (event, editSession) {
            // Update the active line marker as due to folding changes the current
            // line range on the screen might have changed.
            this.$updateHighlightActiveLine();
            // TODO: This might be too much updating. Okay for now.
            this.renderer.updateFull();
        };
        /**
         * Returns the string of text currently highlighted.
         * @returns {String}
         **/
        Editor.prototype.getSelectedText = function () {
            return this.session.getTextRange(this.getSelectionRange());
        };
        /**
         * Emitted when text is copied.
         * @event copy
         * @param {String} text The copied text
         *
         **/
        /**
         * Returns the string of text currently highlighted.
         * @returns {String}
         * @deprecated Use getSelectedText instead.
         **/
        Editor.prototype.getCopyText = function () {
            var text = this.getSelectedText();
            this._signal("copy", text);
            return text;
        };
        /**
         * Called whenever a text "copy" happens.
         **/
        Editor.prototype.onCopy = function () {
            this.commands.exec("copy", this);
        };
        /**
         * Called whenever a text "cut" happens.
         **/
        Editor.prototype.onCut = function () {
            this.commands.exec("cut", this);
        };
        /**
         * Emitted when text is pasted.
         * @event paste
         * @param {String} text The pasted text
         *
         *
         **/
        /**
         * Called whenever a text "paste" happens.
         * @param {String} text The pasted text
         *
         *
         **/
        Editor.prototype.onPaste = function (text) {
            // todo this should change when paste becomes a command
            if (this.$readOnly)
                return;
            var e = { text: text };
            this._signal("paste", e);
            this.insert(e.text, true);
        };
        Editor.prototype.execCommand = function (command, args) {
            this.commands.exec(command, this, args);
        };
        /**
         * Inserts `text` into wherever the cursor is pointing.
         * @param {String} text The new text to add
         *
         **/
        Editor.prototype.insert = function (text, pasted) {
            var session = this.session;
            var mode = session.getMode();
            var cursor = this.getCursorPosition();
            if (this.getBehavioursEnabled() && !pasted) {
                // Get a transform if the current mode wants one.
                var transform = mode.transformAction(session.getState(cursor.row), 'insertion', this, session, text);
                if (transform) {
                    if (text !== transform.text) {
                        this.session.mergeUndoDeltas = false;
                        this.$mergeNextCommand = false;
                    }
                    text = transform.text;
                }
            }
            if (text === "\t") {
                text = this.session.getTabString();
            }
            // remove selected text
            if (!this.selection.isEmpty()) {
                var range = this.getSelectionRange();
                cursor = this.session.remove(range);
                this.clearSelection();
            }
            else if (this.session.getOverwrite()) {
                var range = Range_1.default.fromPoints(cursor, cursor);
                range.end.column += text.length;
                this.session.remove(range);
            }
            if (text === "\n" || text === "\r\n") {
                var line = session.getLine(cursor.row);
                if (cursor.column > line.search(/\S|$/)) {
                    var d = line.substr(cursor.column).search(/\S|$/);
                    session.doc.removeInLine(cursor.row, cursor.column, cursor.column + d);
                }
            }
            this.clearSelection();
            var start = cursor.column;
            var lineState = session.getState(cursor.row);
            var line = session.getLine(cursor.row);
            var shouldOutdent = mode.checkOutdent(lineState, line, text);
            var end = session.insert(cursor, text);
            if (transform && transform.selection) {
                if (transform.selection.length == 2) {
                    this.selection.setSelectionRange(new Range_1.default(cursor.row, start + transform.selection[0], cursor.row, start + transform.selection[1]));
                }
                else {
                    this.selection.setSelectionRange(new Range_1.default(cursor.row + transform.selection[0], transform.selection[1], cursor.row + transform.selection[2], transform.selection[3]));
                }
            }
            if (session.getDocument().isNewLine(text)) {
                var lineIndent = mode.getNextLineIndent(lineState, line.slice(0, cursor.column), session.getTabString());
                session.insert({ row: cursor.row + 1, column: 0 }, lineIndent);
            }
            if (shouldOutdent) {
                mode.autoOutdent(lineState, session, cursor.row);
            }
        };
        Editor.prototype.onTextInput = function (text) {
            this.keyBinding.onTextInput(text);
            // TODO: This should be pluggable.
            if (text === '.') {
                this.commands.exec(editor_protocol_1.COMMAND_NAME_AUTO_COMPLETE);
            }
            else if (this.getSession().getDocument().isNewLine(text)) {
                var lineNumber = this.getCursorPosition().row;
            }
        };
        Editor.prototype.onCommandKey = function (e, hashId, keyCode) {
            this.keyBinding.onCommandKey(e, hashId, keyCode);
        };
        /**
         * Pass in `true` to enable overwrites in your session, or `false` to disable. If overwrites is enabled, any text you enter will type over any text after it. If the value of `overwrite` changes, this function also emites the `changeOverwrite` event.
         * @param {Boolean} overwrite Defines wheter or not to set overwrites
         *
         *
         * @related EditSession.setOverwrite
         **/
        Editor.prototype.setOverwrite = function (overwrite) {
            this.session.setOverwrite(overwrite);
        };
        /**
         * Returns `true` if overwrites are enabled; `false` otherwise.
         * @returns {Boolean}
         * @related EditSession.getOverwrite
         **/
        Editor.prototype.getOverwrite = function () {
            return this.session.getOverwrite();
        };
        /**
         * Sets the value of overwrite to the opposite of whatever it currently is.
         * @related EditSession.toggleOverwrite
         **/
        Editor.prototype.toggleOverwrite = function () {
            this.session.toggleOverwrite();
        };
        /**
         * Sets how fast the mouse scrolling should do.
         * @param {Number} speed A value indicating the new speed (in milliseconds)
         **/
        Editor.prototype.setScrollSpeed = function (speed) {
            this.setOption("scrollSpeed", speed);
        };
        /**
         * Returns the value indicating how fast the mouse scroll speed is (in milliseconds).
         * @returns {Number}
         **/
        Editor.prototype.getScrollSpeed = function () {
            return this.getOption("scrollSpeed");
        };
        /**
         * Sets the delay (in milliseconds) of the mouse drag.
         * @param {Number} dragDelay A value indicating the new delay
         **/
        Editor.prototype.setDragDelay = function (dragDelay) {
            this.setOption("dragDelay", dragDelay);
        };
        /**
         * Returns the current mouse drag delay.
         * @returns {Number}
         **/
        Editor.prototype.getDragDelay = function () {
            return this.getOption("dragDelay");
        };
        /**
         * Emitted when the selection style changes, via [[Editor.setSelectionStyle]].
         * @event changeSelectionStyle
         * @param {Object} data Contains one property, `data`, which indicates the new selection style
         **/
        /**
         * Draw selection markers spanning whole line, or only over selected text. Default value is "line"
         * @param {String} style The new selection style "line"|"text"
         *
         **/
        Editor.prototype.setSelectionStyle = function (val) {
            this.setOption("selectionStyle", val);
        };
        /**
         * Returns the current selection style.
         * @returns {String}
         **/
        Editor.prototype.getSelectionStyle = function () {
            return this.getOption("selectionStyle");
        };
        /**
         * Determines whether or not the current line should be highlighted.
         * @param {Boolean} shouldHighlight Set to `true` to highlight the current line
         **/
        Editor.prototype.setHighlightActiveLine = function (shouldHighlight) {
            this.setOption("highlightActiveLine", shouldHighlight);
        };
        /**
         * Returns `true` if current lines are always highlighted.
         * @return {Boolean}
         **/
        Editor.prototype.getHighlightActiveLine = function () {
            return this.getOption("highlightActiveLine");
        };
        Editor.prototype.setHighlightGutterLine = function (shouldHighlight) {
            this.setOption("highlightGutterLine", shouldHighlight);
        };
        Editor.prototype.getHighlightGutterLine = function () {
            return this.getOption("highlightGutterLine");
        };
        /**
         * Determines if the currently selected word should be highlighted.
         * @param {Boolean} shouldHighlight Set to `true` to highlight the currently selected word
         *
         **/
        Editor.prototype.setHighlightSelectedWord = function (shouldHighlight) {
            this.setOption("highlightSelectedWord", shouldHighlight);
        };
        /**
         * Returns `true` if currently highlighted words are to be highlighted.
         * @returns {Boolean}
         **/
        Editor.prototype.getHighlightSelectedWord = function () {
            return this.$highlightSelectedWord;
        };
        Editor.prototype.setAnimatedScroll = function (shouldAnimate) {
            this.renderer.setAnimatedScroll(shouldAnimate);
        };
        Editor.prototype.getAnimatedScroll = function () {
            return this.renderer.getAnimatedScroll();
        };
        /**
         * If `showInvisibles` is set to `true`, invisible characters&mdash;like spaces or new lines&mdash;are show in the editor.
         * @param {Boolean} showInvisibles Specifies whether or not to show invisible characters
         *
         **/
        Editor.prototype.setShowInvisibles = function (showInvisibles) {
            this.renderer.setShowInvisibles(showInvisibles);
        };
        /**
         * Returns `true` if invisible characters are being shown.
         * @returns {Boolean}
         **/
        Editor.prototype.getShowInvisibles = function () {
            return this.renderer.getShowInvisibles();
        };
        Editor.prototype.setDisplayIndentGuides = function (displayIndentGuides) {
            this.renderer.setDisplayIndentGuides(displayIndentGuides);
        };
        Editor.prototype.getDisplayIndentGuides = function () {
            return this.renderer.getDisplayIndentGuides();
        };
        /**
         * If `showPrintMargin` is set to `true`, the print margin is shown in the editor.
         * @param {Boolean} showPrintMargin Specifies whether or not to show the print margin
         **/
        Editor.prototype.setShowPrintMargin = function (showPrintMargin) {
            this.renderer.setShowPrintMargin(showPrintMargin);
        };
        /**
         * Returns `true` if the print margin is being shown.
         * @returns {Boolean}
         */
        Editor.prototype.getShowPrintMargin = function () {
            return this.renderer.getShowPrintMargin();
        };
        /**
         * Sets the column defining where the print margin should be.
         * @param {Number} showPrintMargin Specifies the new print margin
         */
        Editor.prototype.setPrintMarginColumn = function (showPrintMargin) {
            this.renderer.setPrintMarginColumn(showPrintMargin);
        };
        /**
         * Returns the column number of where the print margin is.
         * @returns {Number}
         */
        Editor.prototype.getPrintMarginColumn = function () {
            return this.renderer.getPrintMarginColumn();
        };
        /**
         * If `readOnly` is true, then the editor is set to read-only mode, and none of the content can change.
         * @param {Boolean} readOnly Specifies whether the editor can be modified or not
         *
         **/
        Editor.prototype.setReadOnly = function (readOnly) {
            this.setOption("readOnly", readOnly);
        };
        /**
         * Returns `true` if the editor is set to read-only mode.
         * @returns {Boolean}
         **/
        Editor.prototype.getReadOnly = function () {
            return this.getOption("readOnly");
        };
        /**
         * Specifies whether to use behaviors or not. ["Behaviors" in this case is the auto-pairing of special characters, like quotation marks, parenthesis, or brackets.]{: #BehaviorsDef}
         * @param {Boolean} enabled Enables or disables behaviors
         *
         **/
        Editor.prototype.setBehavioursEnabled = function (enabled) {
            this.setOption("behavioursEnabled", enabled);
        };
        /**
         * Returns `true` if the behaviors are currently enabled. {:BehaviorsDef}
         *
         * @returns {Boolean}
         **/
        Editor.prototype.getBehavioursEnabled = function () {
            return this.getOption("behavioursEnabled");
        };
        /**
         * Specifies whether to use wrapping behaviors or not, i.e. automatically wrapping the selection with characters such as brackets
         * when such a character is typed in.
         * @param {Boolean} enabled Enables or disables wrapping behaviors
         *
         **/
        Editor.prototype.setWrapBehavioursEnabled = function (enabled) {
            this.setOption("wrapBehavioursEnabled", enabled);
        };
        /**
         * Returns `true` if the wrapping behaviors are currently enabled.
         **/
        Editor.prototype.getWrapBehavioursEnabled = function () {
            return this.getOption("wrapBehavioursEnabled");
        };
        /**
         * Indicates whether the fold widgets should be shown or not.
         * @param {Boolean} show Specifies whether the fold widgets are shown
         **/
        Editor.prototype.setShowFoldWidgets = function (show) {
            this.setOption("showFoldWidgets", show);
        };
        /**
         * Returns `true` if the fold widgets are shown.
         * @return {Boolean}
         */
        Editor.prototype.getShowFoldWidgets = function () {
            return this.getOption("showFoldWidgets");
        };
        Editor.prototype.setFadeFoldWidgets = function (fade) {
            this.setOption("fadeFoldWidgets", fade);
        };
        Editor.prototype.getFadeFoldWidgets = function () {
            return this.getOption("fadeFoldWidgets");
        };
        /**
         * Removes words of text from the editor. A "word" is defined as a string of characters bookended by whitespace.
         * @param {String} direction The direction of the deletion to occur, either "left" or "right"
         *
         **/
        Editor.prototype.remove = function (direction) {
            if (this.selection.isEmpty()) {
                if (direction == "left")
                    this.selection.selectLeft();
                else
                    this.selection.selectRight();
            }
            var range = this.getSelectionRange();
            if (this.getBehavioursEnabled()) {
                var session = this.session;
                var state = session.getState(range.start.row);
                var new_range = session.getMode().transformAction(state, 'deletion', this, session, range);
                if (range.end.column === 0) {
                    var text = session.getTextRange(range);
                    if (text[text.length - 1] == "\n") {
                        var line = session.getLine(range.end.row);
                        if (/^\s+$/.test(line)) {
                            range.end.column = line.length;
                        }
                    }
                }
                if (new_range)
                    range = new_range;
            }
            this.session.remove(range);
            this.clearSelection();
        };
        /**
         * Removes the word directly to the right of the current selection.
         **/
        Editor.prototype.removeWordRight = function () {
            if (this.selection.isEmpty())
                this.selection.selectWordRight();
            this.session.remove(this.getSelectionRange());
            this.clearSelection();
        };
        /**
         * Removes the word directly to the left of the current selection.
         **/
        Editor.prototype.removeWordLeft = function () {
            if (this.selection.isEmpty())
                this.selection.selectWordLeft();
            this.session.remove(this.getSelectionRange());
            this.clearSelection();
        };
        /**
         * Removes all the words to the left of the current selection, until the start of the line.
         **/
        Editor.prototype.removeToLineStart = function () {
            if (this.selection.isEmpty())
                this.selection.selectLineStart();
            this.session.remove(this.getSelectionRange());
            this.clearSelection();
        };
        /**
         * Removes all the words to the right of the current selection, until the end of the line.
         **/
        Editor.prototype.removeToLineEnd = function () {
            if (this.selection.isEmpty())
                this.selection.selectLineEnd();
            var range = this.getSelectionRange();
            if (range.start.column === range.end.column && range.start.row === range.end.row) {
                range.end.column = 0;
                range.end.row++;
            }
            this.session.remove(range);
            this.clearSelection();
        };
        /**
         * Splits the line at the current selection (by inserting an `'\n'`).
         **/
        Editor.prototype.splitLine = function () {
            if (!this.selection.isEmpty()) {
                this.session.remove(this.getSelectionRange());
                this.clearSelection();
            }
            var cursor = this.getCursorPosition();
            this.insert("\n");
            this.moveCursorToPosition(cursor);
        };
        /**
         * Transposes current line.
         **/
        Editor.prototype.transposeLetters = function () {
            if (!this.selection.isEmpty()) {
                return;
            }
            var cursor = this.getCursorPosition();
            var column = cursor.column;
            if (column === 0)
                return;
            var line = this.session.getLine(cursor.row);
            var swap, range;
            if (column < line.length) {
                swap = line.charAt(column) + line.charAt(column - 1);
                range = new Range_1.default(cursor.row, column - 1, cursor.row, column + 1);
            }
            else {
                swap = line.charAt(column - 1) + line.charAt(column - 2);
                range = new Range_1.default(cursor.row, column - 2, cursor.row, column);
            }
            this.session.replace(range, swap);
        };
        /**
         * Converts the current selection entirely into lowercase.
         **/
        Editor.prototype.toLowerCase = function () {
            var originalRange = this.getSelectionRange();
            if (this.selection.isEmpty()) {
                this.selection.selectWord();
            }
            var range = this.getSelectionRange();
            var text = this.session.getTextRange(range);
            this.session.replace(range, text.toLowerCase());
            this.selection.setSelectionRange(originalRange);
        };
        /**
         * Converts the current selection entirely into uppercase.
         **/
        Editor.prototype.toUpperCase = function () {
            var originalRange = this.getSelectionRange();
            if (this.selection.isEmpty()) {
                this.selection.selectWord();
            }
            var range = this.getSelectionRange();
            var text = this.session.getTextRange(range);
            this.session.replace(range, text.toUpperCase());
            this.selection.setSelectionRange(originalRange);
        };
        /**
         * Inserts an indentation into the current cursor position or indents the selected lines.
         *
         * @related EditSession.indentRows
         **/
        Editor.prototype.indent = function () {
            var session = this.session;
            var range = this.getSelectionRange();
            if (range.start.row < range.end.row) {
                var rows = this.$getSelectedRows();
                session.indentRows(rows.first, rows.last, "\t");
                return;
            }
            else if (range.start.column < range.end.column) {
                var text = session.getTextRange(range);
                if (!/^\s+$/.test(text)) {
                    var rows = this.$getSelectedRows();
                    session.indentRows(rows.first, rows.last, "\t");
                    return;
                }
            }
            var line = session.getLine(range.start.row);
            var position = range.start;
            var size = session.getTabSize();
            var column = session.documentToScreenColumn(position.row, position.column);
            if (this.session.getUseSoftTabs()) {
                var count = (size - column % size);
                var indentString = lang_1.stringRepeat(" ", count);
            }
            else {
                var count = column % size;
                while (line[range.start.column] == " " && count) {
                    range.start.column--;
                    count--;
                }
                this.selection.setSelectionRange(range);
                indentString = "\t";
            }
            return this.insert(indentString);
        };
        /**
         * Indents the current line.
         * @related EditSession.indentRows
         **/
        Editor.prototype.blockIndent = function () {
            var rows = this.$getSelectedRows();
            this.session.indentRows(rows.first, rows.last, "\t");
        };
        /**
         * Outdents the current line.
         * @related EditSession.outdentRows
         **/
        Editor.prototype.blockOutdent = function () {
            var selection = this.session.getSelection();
            this.session.outdentRows(selection.getRange());
        };
        // TODO: move out of core when we have good mechanism for managing extensions
        Editor.prototype.sortLines = function () {
            var rows = this.$getSelectedRows();
            var session = this.session;
            var lines = [];
            for (i = rows.first; i <= rows.last; i++)
                lines.push(session.getLine(i));
            lines.sort(function (a, b) {
                if (a.toLowerCase() < b.toLowerCase())
                    return -1;
                if (a.toLowerCase() > b.toLowerCase())
                    return 1;
                return 0;
            });
            var deleteRange = new Range_1.default(0, 0, 0, 0);
            for (var i = rows.first; i <= rows.last; i++) {
                var line = session.getLine(i);
                deleteRange.start.row = i;
                deleteRange.end.row = i;
                deleteRange.end.column = line.length;
                session.replace(deleteRange, lines[i - rows.first]);
            }
        };
        /**
         * Given the currently selected range, this function either comments all the lines, or uncomments all of them.
         **/
        Editor.prototype.toggleCommentLines = function () {
            var state = this.session.getState(this.getCursorPosition().row);
            var rows = this.$getSelectedRows();
            this.session.getMode().toggleCommentLines(state, this.session, rows.first, rows.last);
        };
        Editor.prototype.toggleBlockComment = function () {
            var cursor = this.getCursorPosition();
            var state = this.session.getState(cursor.row);
            var range = this.getSelectionRange();
            this.session.getMode().toggleBlockComment(state, this.session, range, cursor);
        };
        /**
         * Works like [[EditSession.getTokenAt]], except it returns a number.
         * @returns {Number}
         **/
        Editor.prototype.getNumberAt = function (row, column) {
            var _numberRx = /[\-]?[0-9]+(?:\.[0-9]+)?/g;
            _numberRx.lastIndex = 0;
            var s = this.session.getLine(row);
            while (_numberRx.lastIndex < column) {
                var m = _numberRx.exec(s);
                if (m.index <= column && m.index + m[0].length >= column) {
                    var retval = {
                        value: m[0],
                        start: m.index,
                        end: m.index + m[0].length
                    };
                    return retval;
                }
            }
            return null;
        };
        /**
         * If the character before the cursor is a number, this functions changes its value by `amount`.
         * @param {Number} amount The value to change the numeral by (can be negative to decrease value)
         */
        Editor.prototype.modifyNumber = function (amount) {
            var row = this.selection.getCursor().row;
            var column = this.selection.getCursor().column;
            // get the char before the cursor
            var charRange = new Range_1.default(row, column - 1, row, column);
            var c = parseFloat(this.session.getTextRange(charRange));
            // if the char is a digit
            if (!isNaN(c) && isFinite(c)) {
                // get the whole number the digit is part of
                var nr = this.getNumberAt(row, column);
                // if number found
                if (nr) {
                    var fp = nr.value.indexOf(".") >= 0 ? nr.start + nr.value.indexOf(".") + 1 : nr.end;
                    var decimals = nr.start + nr.value.length - fp;
                    var t = parseFloat(nr.value);
                    t *= Math.pow(10, decimals);
                    if (fp !== nr.end && column < fp) {
                        amount *= Math.pow(10, nr.end - column - 1);
                    }
                    else {
                        amount *= Math.pow(10, nr.end - column);
                    }
                    t += amount;
                    t /= Math.pow(10, decimals);
                    var nnr = t.toFixed(decimals);
                    //update number
                    var replaceRange = new Range_1.default(row, nr.start, row, nr.end);
                    this.session.replace(replaceRange, nnr);
                    //reposition the cursor
                    this.moveCursorTo(row, Math.max(nr.start + 1, column + nnr.length - nr.value.length));
                }
            }
        };
        /**
         * Removes all the lines in the current selection
         * @related EditSession.remove
         **/
        Editor.prototype.removeLines = function () {
            var rows = this.$getSelectedRows();
            var range;
            if (rows.first === 0 || rows.last + 1 < this.session.getLength())
                range = new Range_1.default(rows.first, 0, rows.last + 1, 0);
            else
                range = new Range_1.default(rows.first - 1, this.session.getLine(rows.first - 1).length, rows.last, this.session.getLine(rows.last).length);
            this.session.remove(range);
            this.clearSelection();
        };
        Editor.prototype.duplicateSelection = function () {
            var sel = this.selection;
            var doc = this.session;
            var range = sel.getRange();
            var reverse = sel.isBackwards();
            if (range.isEmpty()) {
                var row = range.start.row;
                doc.duplicateLines(row, row);
            }
            else {
                var point = reverse ? range.start : range.end;
                var endPoint = doc.insert(point, doc.getTextRange(range));
                range.start = point;
                range.end = endPoint;
                sel.setSelectionRange(range, reverse);
            }
        };
        /**
         * Shifts all the selected lines down one row.
         *
         * @returns {Number} On success, it returns -1.
         * @related EditSession.moveLinesUp
         **/
        Editor.prototype.moveLinesDown = function () {
            this.$moveLines(function (firstRow, lastRow) {
                return this.session.moveLinesDown(firstRow, lastRow);
            });
        };
        /**
         * Shifts all the selected lines up one row.
         * @returns {Number} On success, it returns -1.
         * @related EditSession.moveLinesDown
         **/
        Editor.prototype.moveLinesUp = function () {
            this.$moveLines(function (firstRow, lastRow) {
                return this.session.moveLinesUp(firstRow, lastRow);
            });
        };
        /**
         * Moves a range of text from the given range to the given position. `toPosition` is an object that looks like this:
         * ```json
         *    { row: newRowLocation, column: newColumnLocation }
         * ```
         * @param {Range} fromRange The range of text you want moved within the document
         * @param {Object} toPosition The location (row and column) where you want to move the text to
         *
         * @returns {Range} The new range where the text was moved to.
         * @related EditSession.moveText
         **/
        Editor.prototype.moveText = function (range, toPosition, copy) {
            return this.session.moveText(range, toPosition, copy);
        };
        /**
         * Copies all the selected lines up one row.
         * @returns {Number} On success, returns 0.
         *
         **/
        Editor.prototype.copyLinesUp = function () {
            this.$moveLines(function (firstRow, lastRow) {
                this.session.duplicateLines(firstRow, lastRow);
                return 0;
            });
        };
        /**
         * Copies all the selected lines down one row.
         * @returns {Number} On success, returns the number of new rows added; in other words, `lastRow - firstRow + 1`.
         * @related EditSession.duplicateLines
         *
         **/
        Editor.prototype.copyLinesDown = function () {
            this.$moveLines(function (firstRow, lastRow) {
                return this.session.duplicateLines(firstRow, lastRow);
            });
        };
        /**
         * Executes a specific function, which can be anything that manipulates selected lines, such as copying them, duplicating them, or shifting them.
         * @param {Function} mover A method to call on each selected row
         *
         *
         **/
        Editor.prototype.$moveLines = function (mover) {
            var selection = this.selection;
            if (!selection['inMultiSelectMode'] || this.inVirtualSelectionMode) {
                var range = selection.toOrientedRange();
                var selectedRows = this.$getSelectedRows();
                var linesMoved = mover.call(this, selectedRows.first, selectedRows.last);
                range.moveBy(linesMoved, 0);
                selection.fromOrientedRange(range);
            }
            else {
                var ranges = selection.rangeList.ranges;
                selection.rangeList.detach();
                for (var i = ranges.length; i--;) {
                    var rangeIndex = i;
                    var collapsedRows = ranges[i].collapseRows();
                    var last = collapsedRows.end.row;
                    var first = collapsedRows.start.row;
                    while (i--) {
                        collapsedRows = ranges[i].collapseRows();
                        if (first - collapsedRows.end.row <= 1)
                            first = collapsedRows.end.row;
                        else
                            break;
                    }
                    i++;
                    var linesMoved = mover.call(this, first, last);
                    while (rangeIndex >= i) {
                        ranges[rangeIndex].moveBy(linesMoved, 0);
                        rangeIndex--;
                    }
                }
                selection.fromOrientedRange(selection.ranges[0]);
                selection.rangeList.attach(this.session);
            }
        };
        /**
         * Returns an object indicating the currently selected rows.
         *
         * @returns {Object}
         **/
        Editor.prototype.$getSelectedRows = function () {
            var range = this.getSelectionRange().collapseRows();
            return {
                first: this.session.getRowFoldStart(range.start.row),
                last: this.session.getRowFoldEnd(range.end.row)
            };
        };
        Editor.prototype.onCompositionStart = function (text) {
            this.renderer.showComposition(this.getCursorPosition());
        };
        Editor.prototype.onCompositionUpdate = function (text) {
            this.renderer.setCompositionText(text);
        };
        Editor.prototype.onCompositionEnd = function () {
            this.renderer.hideComposition();
        };
        /**
         * {:VirtualRenderer.getFirstVisibleRow}
         *
         * @returns {Number}
         * @related VirtualRenderer.getFirstVisibleRow
         **/
        Editor.prototype.getFirstVisibleRow = function () {
            return this.renderer.getFirstVisibleRow();
        };
        /**
         * {:VirtualRenderer.getLastVisibleRow}
         *
         * @returns {Number}
         * @related VirtualRenderer.getLastVisibleRow
         **/
        Editor.prototype.getLastVisibleRow = function () {
            return this.renderer.getLastVisibleRow();
        };
        /**
         * Indicates if the row is currently visible on the screen.
         * @param {Number} row The row to check
         *
         * @returns {Boolean}
         **/
        Editor.prototype.isRowVisible = function (row) {
            return (row >= this.getFirstVisibleRow() && row <= this.getLastVisibleRow());
        };
        /**
         * Indicates if the entire row is currently visible on the screen.
         * @param {Number} row The row to check
         *
         *
         * @returns {Boolean}
         **/
        Editor.prototype.isRowFullyVisible = function (row) {
            return (row >= this.renderer.getFirstFullyVisibleRow() && row <= this.renderer.getLastFullyVisibleRow());
        };
        /**
         * Returns the number of currently visibile rows.
         * @returns {Number}
         **/
        Editor.prototype.$getVisibleRowCount = function () {
            return this.renderer.getScrollBottomRow() - this.renderer.getScrollTopRow() + 1;
        };
        /**
         * FIXME: The semantics of select are not easily understood.
         * @param direction +1 for page down, -1 for page up. Maybe N for N pages?
         * @param select true | false | undefined
         */
        Editor.prototype.$moveByPage = function (direction, select) {
            var renderer = this.renderer;
            var config = this.renderer.layerConfig;
            var rows = direction * Math.floor(config.height / config.lineHeight);
            this.$blockScrolling++;
            if (select === true) {
                this.selection.$moveSelection(function () {
                    this.moveCursorBy(rows, 0);
                });
            }
            else if (select === false) {
                this.selection.moveCursorBy(rows, 0);
                this.selection.clearSelection();
            }
            this.$blockScrolling--;
            var scrollTop = renderer.scrollTop;
            renderer.scrollBy(0, rows * config.lineHeight);
            // Why don't we assert our args and do typeof select === 'undefined'?
            if (select != null) {
                // This is called when select is undefined.
                renderer.scrollCursorIntoView(null, 0.5);
            }
            renderer.animateScrolling(scrollTop);
        };
        /**
         * Selects the text from the current position of the document until where a "page down" finishes.
         **/
        Editor.prototype.selectPageDown = function () {
            this.$moveByPage(+1, true);
        };
        /**
         * Selects the text from the current position of the document until where a "page up" finishes.
         **/
        Editor.prototype.selectPageUp = function () {
            this.$moveByPage(-1, true);
        };
        /**
         * Shifts the document to wherever "page down" is, as well as moving the cursor position.
         **/
        Editor.prototype.gotoPageDown = function () {
            this.$moveByPage(+1, false);
        };
        /**
         * Shifts the document to wherever "page up" is, as well as moving the cursor position.
         **/
        Editor.prototype.gotoPageUp = function () {
            this.$moveByPage(-1, false);
        };
        /**
         * Scrolls the document to wherever "page down" is, without changing the cursor position.
         **/
        Editor.prototype.scrollPageDown = function () {
            this.$moveByPage(1);
        };
        /**
         * Scrolls the document to wherever "page up" is, without changing the cursor position.
         **/
        Editor.prototype.scrollPageUp = function () {
            this.$moveByPage(-1);
        };
        /**
         * Moves the editor to the specified row.
         * @related VirtualRenderer.scrollToRow
         */
        Editor.prototype.scrollToRow = function (row) {
            this.renderer.scrollToRow(row);
        };
        /**
         * Scrolls to a line. If `center` is `true`, it puts the line in middle of screen (or attempts to).
         * @param {Number} line The line to scroll to
         * @param {Boolean} center If `true`
         * @param {Boolean} animate If `true` animates scrolling
         * @param {Function} callback Function to be called when the animation has finished
         *
         *
         * @related VirtualRenderer.scrollToLine
         **/
        Editor.prototype.scrollToLine = function (line, center, animate, callback) {
            this.renderer.scrollToLine(line, center, animate, callback);
        };
        /**
         * Attempts to center the current selection on the screen.
         **/
        Editor.prototype.centerSelection = function () {
            var range = this.getSelectionRange();
            var pos = {
                row: Math.floor(range.start.row + (range.end.row - range.start.row) / 2),
                column: Math.floor(range.start.column + (range.end.column - range.start.column) / 2)
            };
            this.renderer.alignCursor(pos, 0.5);
        };
        /**
         * Gets the current position of the cursor.
         * @returns {Object} An object that looks something like this:
         *
         * ```json
         * { row: currRow, column: currCol }
         * ```
         *
         * @related Selection.getCursor
         **/
        Editor.prototype.getCursorPosition = function () {
            return this.selection.getCursor();
        };
        /**
         * Returns the screen position of the cursor.
         **/
        Editor.prototype.getCursorPositionScreen = function () {
            var cursor = this.getCursorPosition();
            return this.session.documentToScreenPosition(cursor.row, cursor.column);
        };
        /**
         * {:Selection.getRange}
         * @returns {Range}
         * @related Selection.getRange
         **/
        Editor.prototype.getSelectionRange = function () {
            return this.selection.getRange();
        };
        /**
         * Selects all the text in editor.
         * @related Selection.selectAll
         **/
        Editor.prototype.selectAll = function () {
            this.$blockScrolling += 1;
            this.selection.selectAll();
            this.$blockScrolling -= 1;
        };
        /**
         * {:Selection.clearSelection}
         * @related Selection.clearSelection
         **/
        Editor.prototype.clearSelection = function () {
            this.selection.clearSelection();
        };
        /**
         * Moves the cursor to the specified row and column. Note that this does not de-select the current selection.
         * @param {Number} row The new row number
         * @param {Number} column The new column number
         * @param {boolean} animate
         *
         * @related Selection.moveCursorTo
         **/
        Editor.prototype.moveCursorTo = function (row, column, animate) {
            this.selection.moveCursorTo(row, column, animate);
        };
        /**
         * Moves the cursor to the position indicated by `pos.row` and `pos.column`.
         * @param {Object} pos An object with two properties, row and column
         *
         *
         * @related Selection.moveCursorToPosition
         **/
        Editor.prototype.moveCursorToPosition = function (pos) {
            this.selection.moveCursorToPosition(pos);
        };
        /**
         * Moves the cursor's row and column to the next matching bracket or HTML tag.
         *
         **/
        Editor.prototype.jumpToMatching = function (select) {
            var cursor = this.getCursorPosition();
            var iterator = new TokenIterator_1.default(this.session, cursor.row, cursor.column);
            var prevToken = iterator.getCurrentToken();
            var token = prevToken;
            if (!token)
                token = iterator.stepForward();
            if (!token)
                return;
            //get next closing tag or bracket
            var matchType;
            var found = false;
            var depth = {};
            var i = cursor.column - token.start;
            var bracketType;
            var brackets = {
                ")": "(",
                "(": "(",
                "]": "[",
                "[": "[",
                "{": "{",
                "}": "{"
            };
            do {
                if (token.value.match(/[{}()\[\]]/g)) {
                    for (; i < token.value.length && !found; i++) {
                        if (!brackets[token.value[i]]) {
                            continue;
                        }
                        bracketType = brackets[token.value[i]] + '.' + token.type.replace("rparen", "lparen");
                        if (isNaN(depth[bracketType])) {
                            depth[bracketType] = 0;
                        }
                        switch (token.value[i]) {
                            case '(':
                            case '[':
                            case '{':
                                depth[bracketType]++;
                                break;
                            case ')':
                            case ']':
                            case '}':
                                depth[bracketType]--;
                                if (depth[bracketType] === -1) {
                                    matchType = 'bracket';
                                    found = true;
                                }
                                break;
                        }
                    }
                }
                else if (token && token.type.indexOf('tag-name') !== -1) {
                    if (isNaN(depth[token.value])) {
                        depth[token.value] = 0;
                    }
                    if (prevToken.value === '<') {
                        depth[token.value]++;
                    }
                    else if (prevToken.value === '</') {
                        depth[token.value]--;
                    }
                    if (depth[token.value] === -1) {
                        matchType = 'tag';
                        found = true;
                    }
                }
                if (!found) {
                    prevToken = token;
                    token = iterator.stepForward();
                    i = 0;
                }
            } while (token && !found);
            //no match found
            if (!matchType) {
                return;
            }
            var range;
            if (matchType === 'bracket') {
                range = this.session.getBracketRange(cursor);
                if (!range) {
                    range = new Range_1.default(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + i - 1, iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + i - 1);
                    if (!range)
                        return;
                    var pos = range.start;
                    if (pos.row === cursor.row && Math.abs(pos.column - cursor.column) < 2)
                        range = this.session.getBracketRange(pos);
                }
            }
            else if (matchType === 'tag') {
                if (token && token.type.indexOf('tag-name') !== -1)
                    var tag = token.value;
                else
                    return;
                var range = new Range_1.default(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() - 2, iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() - 2);
                //find matching tag
                if (range.compare(cursor.row, cursor.column) === 0) {
                    found = false;
                    do {
                        token = prevToken;
                        prevToken = iterator.stepBackward();
                        if (prevToken) {
                            if (prevToken.type.indexOf('tag-close') !== -1) {
                                range.setEnd(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + 1);
                            }
                            if (token.value === tag && token.type.indexOf('tag-name') !== -1) {
                                if (prevToken.value === '<') {
                                    depth[tag]++;
                                }
                                else if (prevToken.value === '</') {
                                    depth[tag]--;
                                }
                                if (depth[tag] === 0)
                                    found = true;
                            }
                        }
                    } while (prevToken && !found);
                }
                //we found it
                if (token && token.type.indexOf('tag-name')) {
                    var pos = range.start;
                    if (pos.row == cursor.row && Math.abs(pos.column - cursor.column) < 2)
                        pos = range.end;
                }
            }
            pos = range && range['cursor'] || pos;
            if (pos) {
                if (select) {
                    if (range && range.isEqual(this.getSelectionRange()))
                        this.clearSelection();
                    else
                        this.selection.selectTo(pos.row, pos.column);
                }
                else {
                    this.selection.moveTo(pos.row, pos.column);
                }
            }
        };
        /**
         * Moves the cursor to the specified line number, and also into the indiciated column.
         * @param {Number} lineNumber The line number to go to
         * @param {Number} column A column number to go to
         * @param {Boolean} animate If `true` animates scolling
         **/
        Editor.prototype.gotoLine = function (lineNumber, column, animate) {
            this.selection.clearSelection();
            this.session.unfold({ row: lineNumber - 1, column: column || 0 });
            this.$blockScrolling += 1;
            // todo: find a way to automatically exit multiselect mode
            this.exitMultiSelectMode && this.exitMultiSelectMode();
            this.moveCursorTo(lineNumber - 1, column || 0);
            this.$blockScrolling -= 1;
            if (!this.isRowFullyVisible(lineNumber - 1)) {
                this.scrollToLine(lineNumber - 1, true, animate);
            }
        };
        /**
         * Moves the cursor to the specified row and column. Note that this does de-select the current selection.
         * @param {Number} row The new row number
         * @param {Number} column The new column number
         *
         *
         * @related Editor.moveCursorTo
         **/
        Editor.prototype.navigateTo = function (row, column) {
            this.selection.moveTo(row, column);
        };
        /**
         * Moves the cursor up in the document the specified number of times. Note that this does de-select the current selection.
         * @param {Number} times The number of times to change navigation
         *
         *
         **/
        Editor.prototype.navigateUp = function (times) {
            if (this.selection.isMultiLine() && !this.selection.isBackwards()) {
                var selectionStart = this.selection.anchor.getPosition();
                return this.moveCursorToPosition(selectionStart);
            }
            this.selection.clearSelection();
            this.selection.moveCursorBy(-times || -1, 0);
        };
        /**
         * Moves the cursor down in the document the specified number of times. Note that this does de-select the current selection.
         * @param {Number} times The number of times to change navigation
         *
         *
         **/
        Editor.prototype.navigateDown = function (times) {
            if (this.selection.isMultiLine() && this.selection.isBackwards()) {
                var selectionEnd = this.selection.anchor.getPosition();
                return this.moveCursorToPosition(selectionEnd);
            }
            this.selection.clearSelection();
            this.selection.moveCursorBy(times || 1, 0);
        };
        /**
         * Moves the cursor left in the document the specified number of times. Note that this does de-select the current selection.
         * @param {Number} times The number of times to change navigation
         *
         *
         **/
        Editor.prototype.navigateLeft = function (times) {
            if (!this.selection.isEmpty()) {
                var selectionStart = this.getSelectionRange().start;
                this.moveCursorToPosition(selectionStart);
            }
            else {
                times = times || 1;
                while (times--) {
                    this.selection.moveCursorLeft();
                }
            }
            this.clearSelection();
        };
        /**
         * Moves the cursor right in the document the specified number of times. Note that this does de-select the current selection.
         * @param {Number} times The number of times to change navigation
         *
         *
         **/
        Editor.prototype.navigateRight = function (times) {
            if (!this.selection.isEmpty()) {
                var selectionEnd = this.getSelectionRange().end;
                this.moveCursorToPosition(selectionEnd);
            }
            else {
                times = times || 1;
                while (times--) {
                    this.selection.moveCursorRight();
                }
            }
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the start of the current line. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateLineStart = function () {
            this.selection.moveCursorLineStart();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the end of the current line. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateLineEnd = function () {
            this.selection.moveCursorLineEnd();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the end of the current file. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateFileEnd = function () {
            this.selection.moveCursorFileEnd();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the start of the current file. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateFileStart = function () {
            this.selection.moveCursorFileStart();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the word immediately to the right of the current position. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateWordRight = function () {
            this.selection.moveCursorWordRight();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the word immediately to the left of the current position. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateWordLeft = function () {
            this.selection.moveCursorWordLeft();
            this.clearSelection();
        };
        /**
         * Replaces the first occurance of `options.needle` with the value in `replacement`.
         * @param {String} replacement The text to replace with
         * @param {Object} options The [[Search `Search`]] options to use
         *
         *
         **/
        Editor.prototype.replace = function (replacement, options) {
            if (options)
                this.$search.set(options);
            var range = this.$search.find(this.session);
            var replaced = 0;
            if (!range)
                return replaced;
            if (this.$tryReplace(range, replacement)) {
                replaced = 1;
            }
            if (range !== null) {
                this.selection.setSelectionRange(range);
                this.renderer.scrollSelectionIntoView(range.start, range.end);
            }
            return replaced;
        };
        /**
         * Replaces all occurances of `options.needle` with the value in `replacement`.
         * @param {String} replacement The text to replace with
         * @param {Object} options The [[Search `Search`]] options to use
         *
         *
         **/
        Editor.prototype.replaceAll = function (replacement, options) {
            if (options) {
                this.$search.set(options);
            }
            var ranges = this.$search.findAll(this.session);
            var replaced = 0;
            if (!ranges.length)
                return replaced;
            this.$blockScrolling += 1;
            var selection = this.getSelectionRange();
            this.selection.moveTo(0, 0);
            for (var i = ranges.length - 1; i >= 0; --i) {
                if (this.$tryReplace(ranges[i], replacement)) {
                    replaced++;
                }
            }
            this.selection.setSelectionRange(selection);
            this.$blockScrolling -= 1;
            return replaced;
        };
        Editor.prototype.$tryReplace = function (range, replacement) {
            var input = this.session.getTextRange(range);
            replacement = this.$search.replace(input, replacement);
            if (replacement !== null) {
                range.end = this.session.replace(range, replacement);
                return range;
            }
            else {
                return null;
            }
        };
        /**
         * {:Search.getOptions} For more information on `options`, see [[Search `Search`]].
         * @related Search.getOptions
         * @returns {Object}
         **/
        Editor.prototype.getLastSearchOptions = function () {
            return this.$search.getOptions();
        };
        /**
         * Attempts to find `needle` within the document. For more information on `options`, see [[Search `Search`]].
         * @param {String} needle The text to search for (optional)
         * @param {Object} options An object defining various search properties
         * @param {Boolean} animate If `true` animate scrolling
         *
         *
         * @related Search.find
         **/
        Editor.prototype.find = function (needle, options, animate) {
            if (!options)
                options = {};
            if (typeof needle == "string" || needle instanceof RegExp)
                options.needle = needle;
            else if (typeof needle == "object")
                oop_1.mixin(options, needle);
            var range = this.selection.getRange();
            if (options.needle == null) {
                needle = this.session.getTextRange(range) || this.$search.$options.needle;
                if (!needle) {
                    range = this.session.getWordRange(range.start.row, range.start.column);
                    needle = this.session.getTextRange(range);
                }
                this.$search.set({ needle: needle });
            }
            this.$search.set(options);
            if (!options.start)
                this.$search.set({ start: range });
            var newRange = this.$search.find(this.session);
            if (options.preventScroll)
                return newRange;
            if (newRange) {
                this.revealRange(newRange, animate);
                return newRange;
            }
            // clear selection if nothing is found
            if (options.backwards)
                range.start = range.end;
            else
                range.end = range.start;
            this.selection.setRange(range);
        };
        /**
         * Performs another search for `needle` in the document. For more information on `options`, see [[Search `Search`]].
         * @param {Object} options search options
         * @param {Boolean} animate If `true` animate scrolling
         *
         *
         * @related Editor.find
         **/
        Editor.prototype.findNext = function (needle, animate) {
            // FIXME: This looks flipped compared to findPrevious. 
            this.find(needle, { skipCurrent: true, backwards: false }, animate);
        };
        /**
         * Performs a search for `needle` backwards. For more information on `options`, see [[Search `Search`]].
         * @param {Object} options search options
         * @param {Boolean} animate If `true` animate scrolling
         *
         *
         * @related Editor.find
         **/
        Editor.prototype.findPrevious = function (needle, animate) {
            this.find(needle, { skipCurrent: true, backwards: true }, animate);
        };
        Editor.prototype.revealRange = function (range, animate) {
            this.$blockScrolling += 1;
            this.session.unfold(range);
            this.selection.setSelectionRange(range);
            this.$blockScrolling -= 1;
            var scrollTop = this.renderer.scrollTop;
            this.renderer.scrollSelectionIntoView(range.start, range.end, 0.5);
            if (animate !== false)
                this.renderer.animateScrolling(scrollTop);
        };
        /**
         * {:UndoManager.undo}
         * @related UndoManager.undo
         **/
        Editor.prototype.undo = function () {
            this.$blockScrolling++;
            this.session.getUndoManager().undo();
            this.$blockScrolling--;
            this.renderer.scrollCursorIntoView(null, 0.5);
        };
        /**
         * {:UndoManager.redo}
         * @related UndoManager.redo
         **/
        Editor.prototype.redo = function () {
            this.$blockScrolling++;
            this.session.getUndoManager().redo();
            this.$blockScrolling--;
            this.renderer.scrollCursorIntoView(null, 0.5);
        };
        /**
         *
         * Cleans up the entire editor.
         **/
        Editor.prototype.destroy = function () {
            this.renderer.destroy();
            this._signal("destroy", this);
        };
        /**
         * Enables automatic scrolling of the cursor into view when editor itself is inside scrollable element
         * @param {Boolean} enable default true
         **/
        Editor.prototype.setAutoScrollEditorIntoView = function (enable) {
            if (!enable)
                return;
            var rect;
            var self = this;
            var shouldScroll = false;
            if (!this.$scrollAnchor)
                this.$scrollAnchor = document.createElement("div");
            var scrollAnchor = this.$scrollAnchor;
            scrollAnchor.style.cssText = "position:absolute";
            this.container.insertBefore(scrollAnchor, this.container.firstChild);
            var onChangeSelection = this.on("changeSelection", function () {
                shouldScroll = true;
            });
            // needed to not trigger sync reflow
            var onBeforeRender = this.renderer.on("beforeRender", function () {
                if (shouldScroll)
                    rect = self.renderer.container.getBoundingClientRect();
            });
            var onAfterRender = this.renderer.on("afterRender", function () {
                if (shouldScroll && rect && self.isFocused()) {
                    var renderer = self.renderer;
                    var pos = renderer.$cursorLayer.$pixelPos;
                    var config = renderer.layerConfig;
                    var top = pos.top - config.offset;
                    if (pos.top >= 0 && top + rect.top < 0) {
                        shouldScroll = true;
                    }
                    else if (pos.top < config.height &&
                        pos.top + rect.top + config.lineHeight > window.innerHeight) {
                        shouldScroll = false;
                    }
                    else {
                        shouldScroll = null;
                    }
                    if (shouldScroll != null) {
                        scrollAnchor.style.top = top + "px";
                        scrollAnchor.style.left = pos.left + "px";
                        scrollAnchor.style.height = config.lineHeight + "px";
                        scrollAnchor.scrollIntoView(shouldScroll);
                    }
                    shouldScroll = rect = null;
                }
            });
            this.setAutoScrollEditorIntoView = function (enable) {
                if (enable)
                    return;
                delete this.setAutoScrollEditorIntoView;
                this.removeEventListener("changeSelection", onChangeSelection);
                this.renderer.removeEventListener("afterRender", onAfterRender);
                this.renderer.removeEventListener("beforeRender", onBeforeRender);
            };
        };
        Editor.prototype.$resetCursorStyle = function () {
            var style = this.$cursorStyle || "ace";
            var cursorLayer = this.renderer.$cursorLayer;
            if (!cursorLayer) {
                return;
            }
            cursorLayer.setSmoothBlinking(/smooth/.test(style));
            cursorLayer.isBlinking = !this.$readOnly && style != "wide";
            dom_1.setCssClass(cursorLayer.element, "ace_slim-cursors", /slim/.test(style));
        };
        return Editor;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Editor;
    config_1.defineOptions(Editor.prototype, "editor", {
        selectionStyle: {
            set: function (style) {
                var that = this;
                that.$onSelectionChange(void 0, that.selection);
                that._signal("changeSelectionStyle", { data: style });
            },
            initialValue: "line"
        },
        highlightActiveLine: {
            set: function () {
                var that = this;
                that.$updateHighlightActiveLine();
            },
            initialValue: true
        },
        highlightSelectedWord: {
            set: function (shouldHighlight) {
                var that = this;
                that.$onSelectionChange(void 0, that.selection);
            },
            initialValue: true
        },
        readOnly: {
            set: function (readOnly) {
                // disabled to not break vim mode!
                // this.textInput.setReadOnly(readOnly);
                this.$resetCursorStyle();
            },
            initialValue: false
        },
        cursorStyle: {
            set: function (val) {
                var that = this;
                that.$resetCursorStyle();
            },
            values: ["ace", "slim", "smooth", "wide"],
            initialValue: "ace"
        },
        mergeUndoDeltas: {
            values: [false, true, "always"],
            initialValue: true
        },
        behavioursEnabled: { initialValue: true },
        wrapBehavioursEnabled: { initialValue: true },
        autoScrollEditorIntoView: {
            set: function (enable) {
                var that = this;
                that.setAutoScrollEditorIntoView(enable);
            }
        },
        hScrollBarAlwaysVisible: "renderer",
        vScrollBarAlwaysVisible: "renderer",
        highlightGutterLine: "renderer",
        animatedScroll: "renderer",
        showInvisibles: "renderer",
        showPrintMargin: "renderer",
        printMarginColumn: "renderer",
        printMargin: "renderer",
        fadeFoldWidgets: "renderer",
        showFoldWidgets: "renderer",
        showLineNumbers: "renderer",
        showGutter: "renderer",
        displayIndentGuides: "renderer",
        fontSize: "renderer",
        fontFamily: "renderer",
        maxLines: "renderer",
        minLines: "renderer",
        scrollPastEnd: "renderer",
        fixedWidthGutter: "renderer",
        theme: "renderer",
        scrollSpeed: "$mouseHandler",
        dragDelay: "$mouseHandler",
        dragEnabled: "$mouseHandler",
        focusTimout: "$mouseHandler",
        tooltipFollowsMouse: "$mouseHandler",
        firstLineNumber: "session",
        overwrite: "session",
        newLineMode: "session",
        useWorker: "session",
        useSoftTabs: "session",
        tabSize: "session",
        wrap: "session",
        foldStyle: "session",
        mode: "session"
    });
    var FoldHandler = (function () {
        function FoldHandler(editor) {
            // The following handler detects clicks in the editor (not gutter) region
            // to determine whether to remove or expand a fold.
            editor.on("click", function (e) {
                var position = e.getDocumentPosition();
                var session = editor.session;
                // If the user clicked on a fold, then expand it.
                var fold = session.getFoldAt(position.row, position.column, 1);
                if (fold) {
                    if (e.getAccelKey()) {
                        session.removeFold(fold);
                    }
                    else {
                        session.expandFold(fold);
                    }
                    e.stop();
                }
                else {
                }
            });
            // The following handler detects clicks on the gutter.
            editor.on('gutterclick', function (e) {
                var gutterRegion = editor.renderer.$gutterLayer.getRegion(e);
                if (gutterRegion === 'foldWidgets') {
                    var row = e.getDocumentPosition().row;
                    var session = editor.session;
                    if (session['foldWidgets'] && session['foldWidgets'][row]) {
                        editor.session['onFoldWidgetClick'](row, e);
                    }
                    if (!editor.isFocused()) {
                        editor.focus();
                    }
                    e.stop();
                }
            });
            editor.on('gutterdblclick', function (e) {
                var gutterRegion = editor.renderer.$gutterLayer.getRegion(e);
                if (gutterRegion == 'foldWidgets') {
                    var row = e.getDocumentPosition().row;
                    var session = editor.session;
                    var data = session['getParentFoldRangeData'](row, true);
                    var range = data.range || data.firstRange;
                    if (range) {
                        row = range.start.row;
                        var fold = session.getFoldAt(row, session.getLine(row).length, 1);
                        if (fold) {
                            session.removeFold(fold);
                        }
                        else {
                            session['addFold']("...", range);
                            editor.renderer.scrollCursorIntoView({ row: range.start.row, column: 0 });
                        }
                    }
                    e.stop();
                }
            });
        }
        return FoldHandler;
    })();
    var MouseHandler = (function () {
        function MouseHandler(editor) {
            this.$scrollSpeed = 2;
            this.$dragDelay = 0;
            this.$dragEnabled = true;
            this.$focusTimout = 0;
            this.$tooltipFollowsMouse = true;
            this.$clickSelection = null;
            // FIXME: Did I mention that `this`, `new`, `class`, `bind` are the 4 horsemen?
            // FIXME: Function Scoping is the answer.
            var _self = this;
            this.editor = editor;
            // FIXME: We should be cleaning up these handlers in a dispose method...
            editor.setDefaultHandler('mousedown', makeMouseDownHandler(editor, this));
            editor.setDefaultHandler('mousewheel', makeMouseWheelHandler(editor, this));
            editor.setDefaultHandler("dblclick", makeDoubleClickHandler(editor, this));
            editor.setDefaultHandler("tripleclick", makeTripleClickHandler(editor, this));
            editor.setDefaultHandler("quadclick", makeQuadClickHandler(editor, this));
            this.selectByLines = makeExtendSelectionBy(editor, this, "getLineRange");
            this.selectByWords = makeExtendSelectionBy(editor, this, "getWordRange");
            new GutterHandler(this);
            //      FIXME: new DragdropHandler(this);
            var onMouseDown = function (e) {
                if (!editor.isFocused() && editor.textInput) {
                    editor.textInput.moveToMouse(e);
                }
                editor.focus();
            };
            var mouseTarget = editor.renderer.getMouseEventTarget();
            event_1.addListener(mouseTarget, "click", this.onMouseEvent.bind(this, "click"));
            event_1.addListener(mouseTarget, "mousemove", this.onMouseMove.bind(this, "mousemove"));
            event_1.addMultiMouseDownListener(mouseTarget, [400, 300, 250], this, "onMouseEvent");
            if (editor.renderer.scrollBarV) {
                event_1.addMultiMouseDownListener(editor.renderer.scrollBarV.inner, [400, 300, 250], this, "onMouseEvent");
                event_1.addMultiMouseDownListener(editor.renderer.scrollBarH.inner, [400, 300, 250], this, "onMouseEvent");
                if (useragent_1.isIE) {
                    event_1.addListener(editor.renderer.scrollBarV.element, "mousedown", onMouseDown);
                    // TODO: I wonder if we should be responding to mousedown (by symmetry)?
                    event_1.addListener(editor.renderer.scrollBarH.element, "mousemove", onMouseDown);
                }
            }
            // We hook 'mousewheel' using the portable 
            event_1.addMouseWheelListener(editor.container, this.emitEditorMouseWheelEvent.bind(this, "mousewheel"));
            var gutterEl = editor.renderer.$gutter;
            event_1.addListener(gutterEl, "mousedown", this.onMouseEvent.bind(this, "guttermousedown"));
            event_1.addListener(gutterEl, "click", this.onMouseEvent.bind(this, "gutterclick"));
            event_1.addListener(gutterEl, "dblclick", this.onMouseEvent.bind(this, "gutterdblclick"));
            event_1.addListener(gutterEl, "mousemove", this.onMouseEvent.bind(this, "guttermousemove"));
            event_1.addListener(mouseTarget, "mousedown", onMouseDown);
            event_1.addListener(gutterEl, "mousedown", function (e) {
                editor.focus();
                return event_1.preventDefault(e);
            });
            // Handle `mousemove` while the mouse is over the editing area (and not the gutter).
            editor.on('mousemove', function (e) {
                if (_self.state || _self.$dragDelay || !_self.$dragEnabled) {
                    return;
                }
                // FIXME: Probably s/b clientXY
                var char = editor.renderer.screenToTextCoordinates(e.x, e.y);
                var range = editor.session.getSelection().getRange();
                var renderer = editor.renderer;
                if (!range.isEmpty() && range.insideStart(char.row, char.column)) {
                    renderer.setCursorStyle('default');
                }
                else {
                    renderer.setCursorStyle("");
                }
            });
        }
        MouseHandler.prototype.onMouseEvent = function (name, e) {
            this.editor._emit(name, new EditorMouseEvent(e, this.editor));
        };
        MouseHandler.prototype.onMouseMove = function (name, e) {
            // If nobody is listening, avoid the creation of the temporary wrapper.
            // optimization, because mousemove doesn't have a default handler.
            var listeners = this.editor._eventRegistry && this.editor._eventRegistry['mousemove'];
            if (!listeners || !listeners.length) {
                return;
            }
            this.editor._emit(name, new EditorMouseEvent(e, this.editor));
        };
        MouseHandler.prototype.emitEditorMouseWheelEvent = function (name, e) {
            var mouseEvent = new EditorMouseEvent(e, this.editor);
            mouseEvent.speed = this.$scrollSpeed * 2;
            mouseEvent.wheelX = e['wheelX'];
            mouseEvent.wheelY = e['wheelY'];
            this.editor._emit(name, mouseEvent);
        };
        MouseHandler.prototype.setState = function (state) {
            this.state = state;
        };
        MouseHandler.prototype.textCoordinates = function () {
            return this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
        };
        MouseHandler.prototype.captureMouse = function (ev, mouseMoveHandler) {
            this.clientX = ev.clientX;
            this.clientY = ev.clientY;
            this.isMousePressed = true;
            // do not move textarea during selection
            var renderer = this.editor.renderer;
            if (renderer.$keepTextAreaAtCursor) {
                renderer.$keepTextAreaAtCursor = null;
            }
            var onMouseMove = (function (editor, mouseHandler) {
                return function (mouseEvent) {
                    if (!mouseEvent)
                        return;
                    // if editor is loaded inside iframe, and mouseup event is outside
                    // we won't recieve it, so we cancel on first mousemove without button
                    if (useragent_1.isWebKit && !mouseEvent.which && mouseHandler.releaseMouse) {
                        // TODO: For backwards compatibility I'm passing undefined,
                        // but it would probably make more sense to pass the mouse event
                        // since that is the final event.
                        return mouseHandler.releaseMouse(undefined);
                    }
                    mouseHandler.clientX = mouseEvent.clientX;
                    mouseHandler.clientY = mouseEvent.clientY;
                    mouseMoveHandler && mouseMoveHandler(mouseEvent);
                    mouseHandler.mouseEvent = new EditorMouseEvent(mouseEvent, editor);
                    mouseHandler.$mouseMoved = true;
                };
            })(this.editor, this);
            var onCaptureEnd = (function (mouseHandler) {
                return function (e) {
                    clearInterval(timerId);
                    onCaptureInterval();
                    mouseHandler[mouseHandler.state + "End"] && mouseHandler[mouseHandler.state + "End"](e);
                    mouseHandler.state = "";
                    if (renderer.$keepTextAreaAtCursor == null) {
                        renderer.$keepTextAreaAtCursor = true;
                        renderer.$moveTextAreaToCursor();
                    }
                    mouseHandler.isMousePressed = false;
                    mouseHandler.$onCaptureMouseMove = mouseHandler.releaseMouse = null;
                    e && mouseHandler.onMouseEvent("mouseup", e);
                };
            })(this);
            var onCaptureInterval = (function (mouseHandler) {
                return function () {
                    mouseHandler[mouseHandler.state] && mouseHandler[mouseHandler.state]();
                    mouseHandler.$mouseMoved = false;
                };
            })(this);
            if (useragent_1.isOldIE && ev.domEvent.type == "dblclick") {
                return setTimeout(function () { onCaptureEnd(ev); });
            }
            this.$onCaptureMouseMove = onMouseMove;
            this.releaseMouse = event_1.capture(this.editor.container, onMouseMove, onCaptureEnd);
            var timerId = setInterval(onCaptureInterval, 20);
        };
        MouseHandler.prototype.cancelContextMenu = function () {
            var stop = function (e) {
                if (e && e.domEvent && e.domEvent.type != "contextmenu") {
                    return;
                }
                this.editor.off("nativecontextmenu", stop);
                if (e && e.domEvent) {
                    event_1.stopEvent(e.domEvent);
                }
            }.bind(this);
            setTimeout(stop, 10);
            this.editor.on("nativecontextmenu", stop);
        };
        MouseHandler.prototype.select = function () {
            var anchor;
            var cursor = this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
            if (this.$clickSelection) {
                var cmp = this.$clickSelection.comparePoint(cursor);
                if (cmp == -1) {
                    anchor = this.$clickSelection.end;
                }
                else if (cmp == 1) {
                    anchor = this.$clickSelection.start;
                }
                else {
                    var orientedRange = calcRangeOrientation(this.$clickSelection, cursor);
                    cursor = orientedRange.cursor;
                    anchor = orientedRange.anchor;
                }
                this.editor.selection.setSelectionAnchor(anchor.row, anchor.column);
            }
            this.editor.selection.selectToPosition(cursor);
            this.editor.renderer.scrollCursorIntoView();
        };
        MouseHandler.prototype.selectByLinesEnd = function () {
            this.$clickSelection = null;
            this.editor.unsetStyle("ace_selecting");
            if (this.editor.renderer.scroller.releaseCapture) {
                this.editor.renderer.scroller.releaseCapture();
            }
        };
        MouseHandler.prototype.startSelect = function (pos, waitForClickSelection) {
            pos = pos || this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
            var editor = this.editor;
            // allow double/triple click handlers to change selection
            if (this.mousedownEvent.getShiftKey()) {
                editor.selection.selectToPosition(pos);
            }
            else if (!waitForClickSelection) {
                editor.selection.moveToPosition(pos);
            }
            if (!waitForClickSelection) {
                this.select();
            }
            if (this.editor.renderer.scroller.setCapture) {
                this.editor.renderer.scroller.setCapture();
            }
            editor.setStyle("ace_selecting");
            this.setState("select");
        };
        MouseHandler.prototype.selectEnd = function () {
            this.selectByLinesEnd();
        };
        MouseHandler.prototype.selectAllEnd = function () {
            this.selectByLinesEnd();
        };
        MouseHandler.prototype.selectByWordsEnd = function () {
            this.selectByLinesEnd();
        };
        MouseHandler.prototype.focusWait = function () {
            var distance = calcDistance(this.mousedownEvent.clientX, this.mousedownEvent.clientY, this.clientX, this.clientY);
            var time = Date.now();
            if (distance > DRAG_OFFSET || time - this.mousedownEvent.time > this.$focusTimout) {
                this.startSelect(this.mousedownEvent.getDocumentPosition());
            }
        };
        return MouseHandler;
    })();
    config_1.defineOptions(MouseHandler.prototype, "mouseHandler", {
        scrollSpeed: { initialValue: 2 },
        dragDelay: { initialValue: (useragent_1.isMac ? 150 : 0) },
        dragEnabled: { initialValue: true },
        focusTimout: { initialValue: 0 },
        tooltipFollowsMouse: { initialValue: true }
    });
    /*
     * Custom Ace mouse event
     */
    var EditorMouseEvent = (function () {
        function EditorMouseEvent(domEvent, editor) {
            this.propagationStopped = false;
            this.defaultPrevented = false;
            this.getAccelKey = useragent_1.isMac ? function () { return this.domEvent.metaKey; } : function () { return this.domEvent.ctrlKey; };
            this.domEvent = domEvent;
            this.editor = editor;
            this.clientX = domEvent.clientX;
            this.clientY = domEvent.clientY;
            this.$pos = null;
            this.$inSelection = null;
        }
        Object.defineProperty(EditorMouseEvent.prototype, "toElement", {
            get: function () {
                return this.domEvent.toElement;
            },
            enumerable: true,
            configurable: true
        });
        EditorMouseEvent.prototype.stopPropagation = function () {
            event_1.stopPropagation(this.domEvent);
            this.propagationStopped = true;
        };
        EditorMouseEvent.prototype.preventDefault = function () {
            event_1.preventDefault(this.domEvent);
            this.defaultPrevented = true;
        };
        EditorMouseEvent.prototype.stop = function () {
            this.stopPropagation();
            this.preventDefault();
        };
        /*
         * Get the document position below the mouse cursor
         *
         * @return {Object} 'row' and 'column' of the document position
         */
        EditorMouseEvent.prototype.getDocumentPosition = function () {
            if (!this.$pos) {
                this.$pos = this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
            }
            return this.$pos;
        };
        /*
         * Check if the mouse cursor is inside of the text selection
         *
         * @return {Boolean} whether the mouse cursor is inside of the selection
         */
        EditorMouseEvent.prototype.inSelection = function () {
            if (this.$inSelection !== null)
                return this.$inSelection;
            var editor = this.editor;
            var selectionRange = editor.getSelectionRange();
            if (selectionRange.isEmpty())
                this.$inSelection = false;
            else {
                var pos = this.getDocumentPosition();
                this.$inSelection = selectionRange.contains(pos.row, pos.column);
            }
            return this.$inSelection;
        };
        /*
         * Get the clicked mouse button
         *
         * @return {Number} 0 for left button, 1 for middle button, 2 for right button
         */
        EditorMouseEvent.prototype.getButton = function () {
            return event_1.getButton(this.domEvent);
        };
        /*
         * @return {Boolean} whether the shift key was pressed when the event was emitted
         */
        EditorMouseEvent.prototype.getShiftKey = function () {
            return this.domEvent.shiftKey;
        };
        return EditorMouseEvent;
    })();
    var DRAG_OFFSET = 0; // pixels
    function makeMouseDownHandler(editor, mouseHandler) {
        return function (ev) {
            var inSelection = ev.inSelection();
            var pos = ev.getDocumentPosition();
            mouseHandler.mousedownEvent = ev;
            var button = ev.getButton();
            if (button !== 0) {
                var selectionRange = editor.getSelectionRange();
                var selectionEmpty = selectionRange.isEmpty();
                if (selectionEmpty)
                    editor.selection.moveToPosition(pos);
                // 2: contextmenu, 1: linux paste
                editor.textInput.onContextMenu(ev.domEvent);
                return; // stopping event here breaks contextmenu on ff mac
            }
            mouseHandler.mousedownEvent.time = Date.now();
            // if this click caused the editor to be focused should not clear the
            // selection
            if (inSelection && !editor.isFocused()) {
                editor.focus();
                if (mouseHandler.$focusTimout && !mouseHandler.$clickSelection && !editor.inMultiSelectMode) {
                    mouseHandler.setState("focusWait");
                    mouseHandler.captureMouse(ev);
                    return;
                }
            }
            mouseHandler.captureMouse(ev);
            // TODO: _clicks is a custom property added in event.ts by the 'mousedown' listener.
            mouseHandler.startSelect(pos, ev.domEvent['_clicks'] > 1);
            return ev.preventDefault();
        };
    }
    function makeMouseWheelHandler(editor, mouseHandler) {
        return function (ev) {
            if (ev.getAccelKey()) {
                return;
            }
            //shift wheel to horiz scroll
            if (ev.getShiftKey() && ev.wheelY && !ev.wheelX) {
                ev.wheelX = ev.wheelY;
                ev.wheelY = 0;
            }
            var t = ev.domEvent.timeStamp;
            var dt = t - (mouseHandler.$lastScrollTime || 0);
            var isScrolable = editor.renderer.isScrollableBy(ev.wheelX * ev.speed, ev.wheelY * ev.speed);
            if (isScrolable || dt < 200) {
                mouseHandler.$lastScrollTime = t;
                editor.renderer.scrollBy(ev.wheelX * ev.speed, ev.wheelY * ev.speed);
                return ev.stop();
            }
        };
    }
    function makeDoubleClickHandler(editor, mouseHandler) {
        return function (editorMouseEvent) {
            var pos = editorMouseEvent.getDocumentPosition();
            var session = editor.session;
            var range = session.getBracketRange(pos);
            if (range) {
                if (range.isEmpty()) {
                    range.start.column--;
                    range.end.column++;
                }
                mouseHandler.setState("select");
            }
            else {
                range = editor.selection.getWordRange(pos.row, pos.column);
                mouseHandler.setState("selectByWords");
            }
            mouseHandler.$clickSelection = range;
            mouseHandler.select();
        };
    }
    function makeTripleClickHandler(editor, mouseHandler) {
        return function (editorMouseEvent) {
            var pos = editorMouseEvent.getDocumentPosition();
            mouseHandler.setState("selectByLines");
            var range = editor.getSelectionRange();
            if (range.isMultiLine() && range.contains(pos.row, pos.column)) {
                mouseHandler.$clickSelection = editor.selection.getLineRange(range.start.row);
                mouseHandler.$clickSelection.end = editor.selection.getLineRange(range.end.row).end;
            }
            else {
                mouseHandler.$clickSelection = editor.selection.getLineRange(pos.row);
            }
            mouseHandler.select();
        };
    }
    function makeQuadClickHandler(editor, mouseHandler) {
        return function (editorMouseEvent) {
            editor.selectAll();
            mouseHandler.$clickSelection = editor.getSelectionRange();
            mouseHandler.setState("selectAll");
        };
    }
    function makeExtendSelectionBy(editor, mouseHandler, unitName) {
        return function () {
            var anchor;
            var cursor = mouseHandler.textCoordinates();
            var range = editor.selection[unitName](cursor.row, cursor.column);
            if (mouseHandler.$clickSelection) {
                var cmpStart = mouseHandler.$clickSelection.comparePoint(range.start);
                var cmpEnd = mouseHandler.$clickSelection.comparePoint(range.end);
                if (cmpStart == -1 && cmpEnd <= 0) {
                    anchor = mouseHandler.$clickSelection.end;
                    if (range.end.row != cursor.row || range.end.column != cursor.column)
                        cursor = range.start;
                }
                else if (cmpEnd == 1 && cmpStart >= 0) {
                    anchor = mouseHandler.$clickSelection.start;
                    if (range.start.row != cursor.row || range.start.column != cursor.column)
                        cursor = range.end;
                }
                else if (cmpStart == -1 && cmpEnd == 1) {
                    cursor = range.end;
                    anchor = range.start;
                }
                else {
                    var orientedRange = calcRangeOrientation(mouseHandler.$clickSelection, cursor);
                    cursor = orientedRange.cursor;
                    anchor = orientedRange.anchor;
                }
                editor.selection.setSelectionAnchor(anchor.row, anchor.column);
            }
            editor.selection.selectToPosition(cursor);
            editor.renderer.scrollCursorIntoView();
        };
    }
    function calcDistance(ax, ay, bx, by) {
        return Math.sqrt(Math.pow(bx - ax, 2) + Math.pow(by - ay, 2));
    }
    function calcRangeOrientation(range, cursor) {
        if (range.start.row == range.end.row) {
            var cmp = 2 * cursor.column - range.start.column - range.end.column;
        }
        else if (range.start.row == range.end.row - 1 && !range.start.column && !range.end.column) {
            var cmp = cursor.column - 4;
        }
        else {
            var cmp = 2 * cursor.row - range.start.row - range.end.row;
        }
        if (cmp < 0) {
            return { cursor: range.start, anchor: range.end };
        }
        else {
            return { cursor: range.end, anchor: range.start };
        }
    }
    var GutterHandler = (function () {
        function GutterHandler(mouseHandler) {
            var editor = mouseHandler.editor;
            var gutter = editor.renderer.$gutterLayer;
            var tooltip = new GutterTooltip(editor.container);
            mouseHandler.editor.setDefaultHandler("guttermousedown", function (e) {
                if (!editor.isFocused() || e.getButton() != 0) {
                    return;
                }
                var gutterRegion = gutter.getRegion(e);
                if (gutterRegion === "foldWidgets") {
                    return;
                }
                var row = e.getDocumentPosition().row;
                var selection = editor.session.getSelection();
                if (e.getShiftKey()) {
                    selection.selectTo(row, 0);
                }
                else {
                    if (e.domEvent.detail == 2) {
                        editor.selectAll();
                        return e.preventDefault();
                    }
                    mouseHandler.$clickSelection = editor.selection.getLineRange(row);
                }
                mouseHandler.setState("selectByLines");
                mouseHandler.captureMouse(e);
                return e.preventDefault();
            });
            var tooltipTimeout;
            var mouseEvent;
            var tooltipAnnotation;
            function showTooltip() {
                var row = mouseEvent.getDocumentPosition().row;
                var annotation = gutter.$annotations[row];
                if (!annotation) {
                    return hideTooltip(void 0, editor);
                }
                var maxRow = editor.session.getLength();
                if (row == maxRow) {
                    var screenRow = editor.renderer.pixelToScreenCoordinates(0, mouseEvent.clientY).row;
                    var pos = mouseEvent.getDocumentPosition();
                    if (screenRow > editor.session.documentToScreenRow(pos.row, pos.column)) {
                        return hideTooltip(void 0, editor);
                    }
                }
                if (tooltipAnnotation == annotation) {
                    return;
                }
                tooltipAnnotation = annotation.text.join("<br/>");
                tooltip.setHtml(tooltipAnnotation);
                tooltip.show();
                editor.on("mousewheel", hideTooltip);
                if (mouseHandler.$tooltipFollowsMouse) {
                    moveTooltip(mouseEvent);
                }
                else {
                    var gutterElement = gutter.$cells[editor.session.documentToScreenRow(row, 0)].element;
                    var rect = gutterElement.getBoundingClientRect();
                    var style = tooltip.getElement().style;
                    style.left = rect.right + "px";
                    style.top = rect.bottom + "px";
                }
            }
            function hideTooltip(event, editor) {
                if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = undefined;
                }
                if (tooltipAnnotation) {
                    tooltip.hide();
                    tooltipAnnotation = null;
                    editor.off("mousewheel", hideTooltip);
                }
            }
            function moveTooltip(event) {
                tooltip.setPosition(event.clientX, event.clientY);
            }
            mouseHandler.editor.setDefaultHandler("guttermousemove", function (e) {
                // FIXME: Obfuscating the type of target to thwart compiler.
                var target = e.domEvent.target || e.domEvent.srcElement;
                if (dom_1.hasCssClass(target, "ace_fold-widget")) {
                    return hideTooltip(void 0, editor);
                }
                if (tooltipAnnotation && mouseHandler.$tooltipFollowsMouse) {
                    moveTooltip(e);
                }
                mouseEvent = e;
                if (tooltipTimeout) {
                    return;
                }
                tooltipTimeout = setTimeout(function () {
                    tooltipTimeout = null;
                    if (mouseEvent && !mouseHandler.isMousePressed)
                        showTooltip();
                    else
                        hideTooltip(void 0, editor);
                }, 50);
            });
            event_1.addListener(editor.renderer.$gutter, "mouseout", function (e) {
                mouseEvent = null;
                if (!tooltipAnnotation || tooltipTimeout)
                    return;
                tooltipTimeout = setTimeout(function () {
                    tooltipTimeout = null;
                    hideTooltip(void 0, editor);
                }, 50);
            });
            editor.on("changeSession", hideTooltip);
        }
        return GutterHandler;
    })();
    /**
     * @class GutterTooltip
     * @extends Tooltip
     */
    var GutterTooltip = (function (_super) {
        __extends(GutterTooltip, _super);
        function GutterTooltip(parentNode) {
            _super.call(this, parentNode);
        }
        /**
         * @method setPosition
         * @param x {number}
         * @param y {number}
         * @return {void}
         */
        GutterTooltip.prototype.setPosition = function (x, y) {
            var windowWidth = window.innerWidth || document.documentElement.clientWidth;
            var windowHeight = window.innerHeight || document.documentElement.clientHeight;
            var width = this.getWidth();
            var height = this.getHeight();
            x += 15;
            y += 15;
            if (x + width > windowWidth) {
                x -= (x + width) - windowWidth;
            }
            if (y + height > windowHeight) {
                y -= 20 + height;
            }
            _super.prototype.setPosition.call(this, x, y);
        };
        return GutterTooltip;
    })(Tooltip_1.default);
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
define('FoldLine',["require", "exports", "./Range"], function (require, exports, Range_1) {
    /*
     * If an array is passed in, the folds are expected to be sorted already.
     */
    var FoldLine = (function () {
        function FoldLine(foldData, folds) {
            this.foldData = foldData;
            if (Array.isArray(folds)) {
                this.folds = folds;
            }
            else {
                folds = this.folds = [folds];
            }
            var last = folds[folds.length - 1];
            this.range = new Range_1.default(folds[0].start.row, folds[0].start.column, last.end.row, last.end.column);
            this.start = this.range.start;
            this.end = this.range.end;
            this.folds.forEach(function (fold) {
                fold.setFoldLine(this);
            }, this);
        }
        /*
         * Note: This doesn't update wrapData!
         */
        FoldLine.prototype.shiftRow = function (shift) {
            this.start.row += shift;
            this.end.row += shift;
            this.folds.forEach(function (fold) {
                fold.start.row += shift;
                fold.end.row += shift;
            });
        };
        FoldLine.prototype.addFold = function (fold) {
            if (fold.sameRow) {
                if (fold.start.row < this.startRow || fold.endRow > this.endRow) {
                    throw new Error("Can't add a fold to this FoldLine as it has no connection");
                }
                this.folds.push(fold);
                this.folds.sort(function (a, b) {
                    return -a.range.compareEnd(b.start.row, b.start.column);
                });
                if (this.range.compareEnd(fold.start.row, fold.start.column) > 0) {
                    this.end.row = fold.end.row;
                    this.end.column = fold.end.column;
                }
                else if (this.range.compareStart(fold.end.row, fold.end.column) < 0) {
                    this.start.row = fold.start.row;
                    this.start.column = fold.start.column;
                }
            }
            else if (fold.start.row == this.end.row) {
                this.folds.push(fold);
                this.end.row = fold.end.row;
                this.end.column = fold.end.column;
            }
            else if (fold.end.row == this.start.row) {
                this.folds.unshift(fold);
                this.start.row = fold.start.row;
                this.start.column = fold.start.column;
            }
            else {
                throw new Error("Trying to add fold to FoldRow that doesn't have a matching row");
            }
            fold.foldLine = this;
        };
        FoldLine.prototype.containsRow = function (row) {
            return row >= this.start.row && row <= this.end.row;
        };
        FoldLine.prototype.walk = function (callback, endRow, endColumn) {
            var lastEnd = 0, folds = this.folds, fold, cmp, stop, isNewRow = true;
            if (endRow == null) {
                endRow = this.end.row;
                endColumn = this.end.column;
            }
            for (var i = 0; i < folds.length; i++) {
                fold = folds[i];
                cmp = fold.range.compareStart(endRow, endColumn);
                // This fold is after the endRow/Column.
                if (cmp == -1) {
                    callback(null, endRow, endColumn, lastEnd, isNewRow);
                    return;
                }
                stop = callback(null, fold.start.row, fold.start.column, lastEnd, isNewRow);
                stop = !stop && callback(fold.placeholder, fold.start.row, fold.start.column, lastEnd);
                // If the user requested to stop the walk or endRow/endColumn is
                // inside of this fold (cmp == 0), then end here.
                if (stop || cmp === 0) {
                    return;
                }
                // Note the new lastEnd might not be on the same line. However,
                // it's the callback's job to recognize this.
                isNewRow = !fold.sameRow;
                lastEnd = fold.end.column;
            }
            callback(null, endRow, endColumn, lastEnd, isNewRow);
        };
        FoldLine.prototype.getNextFoldTo = function (row, column) {
            var fold;
            var cmp;
            for (var i = 0; i < this.folds.length; i++) {
                fold = this.folds[i];
                cmp = fold.range.compareEnd(row, column);
                if (cmp == -1) {
                    return {
                        fold: fold,
                        kind: "after"
                    };
                }
                else if (cmp === 0) {
                    return {
                        fold: fold,
                        kind: "inside"
                    };
                }
            }
            return null;
        };
        FoldLine.prototype.addRemoveChars = function (row, column, len) {
            var ret = this.getNextFoldTo(row, column);
            var fold;
            var folds;
            if (ret) {
                fold = ret.fold;
                if (ret.kind == "inside"
                    && fold.start.column != column
                    && fold.start.row != row) {
                    //throwing here breaks whole editor
                    //TODO: properly handle this
                    window.console && window.console.log(row, column, fold);
                }
                else if (fold.start.row == row) {
                    folds = this.folds;
                    var i = folds.indexOf(fold);
                    if (i === 0) {
                        this.start.column += len;
                    }
                    for (i; i < folds.length; i++) {
                        fold = folds[i];
                        fold.start.column += len;
                        if (!fold.sameRow) {
                            return;
                        }
                        fold.end.column += len;
                    }
                    this.end.column += len;
                }
            }
        };
        FoldLine.prototype.split = function (row, column) {
            var pos = this.getNextFoldTo(row, column);
            if (!pos || pos.kind == "inside")
                return null;
            var fold = pos.fold;
            var folds = this.folds;
            var foldData = this.foldData;
            var i = folds.indexOf(fold);
            var foldBefore = folds[i - 1];
            this.end.row = foldBefore.end.row;
            this.end.column = foldBefore.end.column;
            // Remove the folds after row/column and create a new FoldLine
            // containing these removed folds.
            folds = folds.splice(i, folds.length - i);
            var newFoldLine = new FoldLine(foldData, folds);
            foldData.splice(foldData.indexOf(this) + 1, 0, newFoldLine);
            return newFoldLine;
        };
        FoldLine.prototype.merge = function (foldLineNext) {
            var folds = foldLineNext.folds;
            for (var i = 0; i < folds.length; i++) {
                this.addFold(folds[i]);
            }
            // Remove the foldLineNext - no longer needed, as
            // it's merged now with foldLineNext.
            var foldData = this.foldData;
            foldData.splice(foldData.indexOf(foldLineNext), 1);
        };
        FoldLine.prototype.toString = function () {
            var ret = [this.range.toString() + ": ["];
            this.folds.forEach(function (fold) {
                ret.push("  " + fold.toString());
            });
            ret.push("]");
            return ret.join("\n");
        };
        FoldLine.prototype.idxToPosition = function (idx) {
            var lastFoldEndColumn = 0;
            for (var i = 0; i < this.folds.length; i++) {
                var fold = this.folds[i];
                idx -= fold.start.column - lastFoldEndColumn;
                if (idx < 0) {
                    return {
                        row: fold.start.row,
                        column: fold.start.column + idx
                    };
                }
                idx -= fold.placeholder.length;
                if (idx < 0) {
                    return fold.start;
                }
                lastFoldEndColumn = fold.end.column;
            }
            return {
                row: this.end.row,
                column: this.end.column + idx
            };
        };
        return FoldLine;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = FoldLine;
});

define('comparePoints',["require", "exports"], function (require, exports) {
    function comparePoints(p1, p2) {
        return p1.row - p2.row || p1.column - p2.column;
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = comparePoints;
    ;
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
define('range_list',["require", "exports", "./comparePoints"], function (require, exports, comparePoints_1) {
    var RangeList = (function () {
        function RangeList() {
            this.ranges = [];
        }
        RangeList.prototype.pointIndex = function (pos, excludeEdges, startIndex) {
            var list = this.ranges;
            for (var i = startIndex || 0; i < list.length; i++) {
                var range = list[i];
                var cmpEnd = comparePoints_1.default(pos, range.end);
                if (cmpEnd > 0) {
                    continue;
                }
                var cmpStart = comparePoints_1.default(pos, range.start);
                if (cmpEnd === 0) {
                    return excludeEdges && cmpStart !== 0 ? -i - 2 : i;
                }
                if (cmpStart > 0 || (cmpStart === 0 && !excludeEdges)) {
                    return i;
                }
                return -i - 1;
            }
            return -i - 1;
        };
        RangeList.prototype.add = function (range) {
            var excludeEdges = !range.isEmpty();
            var startIndex = this.pointIndex(range.start, excludeEdges);
            if (startIndex < 0)
                startIndex = -startIndex - 1;
            var endIndex = this.pointIndex(range.end, excludeEdges, startIndex);
            if (endIndex < 0) {
                endIndex = -endIndex - 1;
            }
            else {
                endIndex++;
            }
            return this.ranges.splice(startIndex, endIndex - startIndex, range);
        };
        RangeList.prototype.addList = function (list) {
            var removed = [];
            for (var i = list.length; i--;) {
                removed.push.call(removed, this.add(list[i]));
            }
            return removed;
        };
        RangeList.prototype.substractPoint = function (pos) {
            var i = this.pointIndex(pos);
            if (i >= 0) {
                return this.ranges.splice(i, 1);
            }
        };
        /**
         * merge overlapping ranges
         */
        RangeList.prototype.merge = function () {
            var removed = [];
            var list = this.ranges;
            list = list.sort(function (a, b) {
                return comparePoints_1.default(a.start, b.start);
            });
            var next = list[0], range;
            for (var i = 1; i < list.length; i++) {
                range = next;
                next = list[i];
                var cmp = comparePoints_1.default(range.end, next.start);
                if (cmp < 0)
                    continue;
                if (cmp == 0 && !range.isEmpty() && !next.isEmpty())
                    continue;
                if (comparePoints_1.default(range.end, next.end) < 0) {
                    range.end.row = next.end.row;
                    range.end.column = next.end.column;
                }
                list.splice(i, 1);
                removed.push(next);
                next = range;
                i--;
            }
            this.ranges = list;
            return removed;
        };
        RangeList.prototype.contains = function (row, column) {
            return this.pointIndex({ row: row, column: column }) >= 0;
        };
        RangeList.prototype.containsPoint = function (pos) {
            return this.pointIndex(pos) >= 0;
        };
        RangeList.prototype.rangeAtPoint = function (pos) {
            var i = this.pointIndex(pos);
            if (i >= 0) {
                return this.ranges[i];
            }
        };
        RangeList.prototype.clipRows = function (startRow, endRow) {
            var list = this.ranges;
            if (list[0].start.row > endRow || list[list.length - 1].start.row < startRow) {
                return [];
            }
            var startIndex = this.pointIndex({ row: startRow, column: 0 });
            if (startIndex < 0) {
                startIndex = -startIndex - 1;
            }
            // TODO: Had to make a guess here, excludeEdges was not provided.
            var excludeEdges = true;
            var endIndex = this.pointIndex({ row: endRow, column: 0 }, excludeEdges, startIndex);
            if (endIndex < 0) {
                endIndex = -endIndex - 1;
            }
            var clipped = [];
            for (var i = startIndex; i < endIndex; i++) {
                clipped.push(list[i]);
            }
            return clipped;
        };
        RangeList.prototype.removeAll = function () {
            return this.ranges.splice(0, this.ranges.length);
        };
        RangeList.prototype.attach = function (session) {
            if (this.session) {
                this.detach();
            }
            this.session = session;
            this.onChange = this.$onChange.bind(this);
            this.session.on('change', this.onChange);
        };
        RangeList.prototype.detach = function () {
            if (!this.session) {
                return;
            }
            this.session.off('change', this.onChange);
            this.session = null;
        };
        RangeList.prototype.$onChange = function (e, session) {
            var changeRange = e.data.range;
            if (e.data.action[0] == "i") {
                var start = changeRange.start;
                var end = changeRange.end;
            }
            else {
                var end = changeRange.start;
                var start = changeRange.end;
            }
            var startRow = start.row;
            var endRow = end.row;
            var lineDif = endRow - startRow;
            var colDiff = -start.column + end.column;
            var ranges = this.ranges;
            for (var i = 0, n = ranges.length; i < n; i++) {
                var r = ranges[i];
                if (r.end.row < startRow) {
                    continue;
                }
                if (r.start.row > startRow) {
                    break;
                }
                if (r.start.row == startRow && r.start.column >= start.column) {
                    if (r.start.column == start.column && this['$insertRight']) {
                    }
                    else {
                        r.start.column += colDiff;
                        r.start.row += lineDif;
                    }
                }
                if (r.end.row == startRow && r.end.column >= start.column) {
                    if (r.end.column == start.column && this['$insertRight']) {
                        continue;
                    }
                    // special handling for the case when two ranges share an edge
                    if (r.end.column == start.column && colDiff > 0 && i < n - 1) {
                        if (r.end.column > r.start.column && r.end.column == ranges[i + 1].start.column) {
                            r.end.column -= colDiff;
                        }
                    }
                    r.end.column += colDiff;
                    r.end.row += lineDif;
                }
            }
            if (lineDif != 0 && i < n) {
                for (; i < n; i++) {
                    var r = ranges[i];
                    r.start.row += lineDif;
                    r.end.row += lineDif;
                }
            }
        };
        return RangeList;
    })();
    exports.RangeList = RangeList;
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('Fold',["require", "exports", "./range_list"], function (require, exports, range_list_1) {
    /*
     * Simple fold-data struct.
     **/
    var Fold = (function (_super) {
        __extends(Fold, _super);
        function Fold(range, placeholder) {
            _super.call(this);
            this.foldLine = null;
            this.placeholder = placeholder;
            this.range = range;
            this.start = range.start;
            this.end = range.end;
            this.sameRow = range.start.row === range.end.row;
            this.subFolds = this.ranges = [];
        }
        Fold.prototype.toString = function () {
            return '"' + this.placeholder + '" ' + this.range.toString();
        };
        Fold.prototype.setFoldLine = function (foldLine) {
            this.foldLine = foldLine;
            this.subFolds.forEach(function (fold) {
                fold.setFoldLine(foldLine);
            });
        };
        Fold.prototype.clone = function () {
            var range = this.range.clone();
            var fold = new Fold(range, this.placeholder);
            this.subFolds.forEach(function (subFold) {
                fold.subFolds.push(subFold.clone());
            });
            fold.collapseChildren = this.collapseChildren;
            return fold;
        };
        Fold.prototype.addSubFold = function (fold) {
            if (this.range.isEqual(fold))
                return;
            if (!this.range.containsRange(fold))
                throw new Error("A fold can't intersect already existing fold" + fold.range + this.range);
            // transform fold to local coordinates
            consumeRange(fold, this.start);
            var row = fold.start.row, column = fold.start.column;
            for (var i = 0, cmp = -1; i < this.subFolds.length; i++) {
                cmp = this.subFolds[i].range.compare(row, column);
                if (cmp != 1)
                    break;
            }
            var afterStart = this.subFolds[i];
            if (cmp == 0)
                return afterStart.addSubFold(fold);
            // cmp == -1
            var row = fold.range.end.row, column = fold.range.end.column;
            for (var j = i, cmp = -1; j < this.subFolds.length; j++) {
                cmp = this.subFolds[j].range.compare(row, column);
                if (cmp != 1)
                    break;
            }
            var afterEnd = this.subFolds[j];
            if (cmp == 0)
                throw new Error("A fold can't intersect already existing fold" + fold.range + this.range);
            var consumedFolds = this.subFolds.splice(i, j - i, fold);
            fold.setFoldLine(this.foldLine);
            return fold;
        };
        Fold.prototype.restoreRange = function (range) {
            return restoreRange(range, this.start);
        };
        return Fold;
    })(range_list_1.RangeList);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Fold;
    function consumePoint(point, anchor) {
        point.row -= anchor.row;
        if (point.row == 0)
            point.column -= anchor.column;
    }
    function consumeRange(range, anchor) {
        consumePoint(range.start, anchor);
        consumePoint(range.end, anchor);
    }
    function restorePoint(point, anchor) {
        if (point.row == 0)
            point.column += anchor.column;
        point.row += anchor.row;
    }
    function restoreRange(range, anchor) {
        restorePoint(range.start, anchor);
        restorePoint(range.end, anchor);
    }
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('Selection',["require", "exports", "./lib/lang", "./lib/event_emitter", "./Range"], function (require, exports, lang_1, event_emitter_1, Range_1) {
    /**
     * Contains the cursor position and the text selection of an edit session.
     *
     * The row/columns used in the selection are in document coordinates representing ths coordinates as thez appear in the document before applying soft wrap and folding.
     * @class Selection
     **/
    /**
     * Emitted when the cursor position changes.
     * @event changeCursor
     *
    **/
    /**
     * Emitted when the cursor selection changes.
     *
     *  @event changeSelection
    **/
    /**
     * Creates a new `Selection` object.
     * @param {EditSession} session The session to use
     *
     * @constructor
     **/
    var Selection = (function (_super) {
        __extends(Selection, _super);
        function Selection(session) {
            _super.call(this);
            this.session = session;
            this.doc = session.getDocument();
            this.clearSelection();
            this.lead = this.selectionLead = this.doc.createAnchor(0, 0);
            this.anchor = this.selectionAnchor = this.doc.createAnchor(0, 0);
            var self = this;
            this.lead.on("change", function (e) {
                self._emit("changeCursor");
                if (!self.$isEmpty)
                    self._emit("changeSelection");
                if (!self.$keepDesiredColumnOnChange && e.old.column != e.value.column)
                    self.$desiredColumn = null;
            });
            this.selectionAnchor.on("change", function () {
                if (!self.$isEmpty) {
                    self._emit("changeSelection");
                }
            });
        }
        /**
         *
         * Returns `true` if the selection is empty.
         * @returns {Boolean}
         */
        Selection.prototype.isEmpty = function () {
            // What is the difference between $isEmpty and what this function returns?
            return (this.$isEmpty || (this.anchor.row == this.lead.row &&
                this.anchor.column == this.lead.column));
        };
        /**
        * Returns `true` if the selection is a multi-line.
        * @returns {Boolean}
        **/
        Selection.prototype.isMultiLine = function () {
            if (this.isEmpty()) {
                return false;
            }
            return this.getRange().isMultiLine();
        };
        /**
        * Returns an object containing the `row` and `column` current position of the cursor.
        * @returns {Object}
        **/
        Selection.prototype.getCursor = function () {
            return this.lead.getPosition();
        };
        /**
        * Sets the row and column position of the anchor. This function also emits the `'changeSelection'` event.
        * @param {number} row The new row
        * @param {number} column The new column
        **/
        Selection.prototype.setSelectionAnchor = function (row, column) {
            this.anchor.setPosition(row, column);
            if (this.$isEmpty) {
                this.$isEmpty = false;
                this._emit("changeSelection");
            }
        };
        /**
        * Returns an object containing the `row` and `column` of the calling selection anchor.
        *
        * @returns {Object}
        * @related Anchor.getPosition
        **/
        Selection.prototype.getSelectionAnchor = function () {
            if (this.$isEmpty)
                return this.getSelectionLead();
            else
                return this.anchor.getPosition();
        };
        /**
        *
        * Returns an object containing the `row` and `column` of the calling selection lead.
        * @returns {Object}
        **/
        Selection.prototype.getSelectionLead = function () {
            return this.lead.getPosition();
        };
        /**
        * Shifts the selection up (or down, if [[Selection.isBackwards `isBackwards()`]] is true) the given number of columns.
        * @param {Number} columns The number of columns to shift by
        *
        *
        *
        **/
        Selection.prototype.shiftSelection = function (columns) {
            if (this.$isEmpty) {
                this.moveCursorTo(this.lead.row, this.lead.column + columns);
                return;
            }
            var anchor = this.getSelectionAnchor();
            var lead = this.getSelectionLead();
            var isBackwards = this.isBackwards();
            if (!isBackwards || anchor.column !== 0)
                this.setSelectionAnchor(anchor.row, anchor.column + columns);
            if (isBackwards || lead.column !== 0) {
                this.$moveSelection(function () {
                    this.moveCursorTo(lead.row, lead.column + columns);
                });
            }
        };
        /**
        * Returns `true` if the selection is going backwards in the document.
        * @returns {Boolean}
        **/
        Selection.prototype.isBackwards = function () {
            var anchor = this.anchor;
            var lead = this.lead;
            return (anchor.row > lead.row || (anchor.row == lead.row && anchor.column > lead.column));
        };
        /**
        * [Returns the [[Range]] for the selected text.]{: #Selection.getRange}
        * @returns {Range}
        **/
        Selection.prototype.getRange = function () {
            var anchor = this.anchor;
            var lead = this.lead;
            if (this.isEmpty())
                return Range_1.default.fromPoints(lead, lead);
            if (this.isBackwards()) {
                return Range_1.default.fromPoints(lead, anchor);
            }
            else {
                return Range_1.default.fromPoints(anchor, lead);
            }
        };
        /**
        * [Empties the selection (by de-selecting it). This function also emits the `'changeSelection'` event.]{: #Selection.clearSelection}
        **/
        Selection.prototype.clearSelection = function () {
            if (!this.$isEmpty) {
                this.$isEmpty = true;
                this._emit("changeSelection");
            }
        };
        /**
        * Selects all the text in the document.
        **/
        Selection.prototype.selectAll = function () {
            var lastRow = this.doc.getLength() - 1;
            this.setSelectionAnchor(0, 0);
            this.moveCursorTo(lastRow, this.doc.getLine(lastRow).length);
        };
        /**
        * Sets the selection to the provided range.
        * @param {Range} range The range of text to select
        * @param {Boolean} reverse Indicates if the range should go backwards (`true`) or not
        *
        *
        * @method setSelectionRange
        * @alias setRange
        **/
        Selection.prototype.setRange = function (range, reverse) {
            this.setSelectionRange(range, reverse);
        };
        Selection.prototype.setSelectionRange = function (range, reverse) {
            if (reverse) {
                this.setSelectionAnchor(range.end.row, range.end.column);
                this.selectTo(range.start.row, range.start.column);
            }
            else {
                this.setSelectionAnchor(range.start.row, range.start.column);
                this.selectTo(range.end.row, range.end.column);
            }
            if (this.getRange().isEmpty())
                this.$isEmpty = true;
            this.$desiredColumn = null;
        };
        Selection.prototype.$moveSelection = function (mover) {
            var lead = this.lead;
            if (this.$isEmpty)
                this.setSelectionAnchor(lead.row, lead.column);
            mover.call(this);
        };
        /**
        * Moves the selection cursor to the indicated row and column.
        * @param {Number} row The row to select to
        * @param {Number} column The column to select to
        *
        *
        *
        **/
        Selection.prototype.selectTo = function (row, column) {
            this.$moveSelection(function () {
                this.moveCursorTo(row, column);
            });
        };
        /**
        * Moves the selection cursor to the row and column indicated by `pos`.
        * @param {Object} pos An object containing the row and column
        *
        *
        *
        **/
        Selection.prototype.selectToPosition = function (pos) {
            this.$moveSelection(function () {
                this.moveCursorToPosition(pos);
            });
        };
        /**
        * Moves the selection cursor to the indicated row and column.
        * @param {Number} row The row to select to
        * @param {Number} column The column to select to
        *
        **/
        Selection.prototype.moveTo = function (row, column) {
            this.clearSelection();
            this.moveCursorTo(row, column);
        };
        /**
        * Moves the selection cursor to the row and column indicated by `pos`.
        * @param {Object} pos An object containing the row and column
        **/
        Selection.prototype.moveToPosition = function (pos) {
            this.clearSelection();
            this.moveCursorToPosition(pos);
        };
        /**
        *
        * Moves the selection up one row.
        **/
        Selection.prototype.selectUp = function () {
            this.$moveSelection(this.moveCursorUp);
        };
        /**
        *
        * Moves the selection down one row.
        **/
        Selection.prototype.selectDown = function () {
            this.$moveSelection(this.moveCursorDown);
        };
        /**
        *
        *
        * Moves the selection right one column.
        **/
        Selection.prototype.selectRight = function () {
            this.$moveSelection(this.moveCursorRight);
        };
        /**
        *
        * Moves the selection left one column.
        **/
        Selection.prototype.selectLeft = function () {
            this.$moveSelection(this.moveCursorLeft);
        };
        /**
        *
        * Moves the selection to the beginning of the current line.
        **/
        Selection.prototype.selectLineStart = function () {
            this.$moveSelection(this.moveCursorLineStart);
        };
        /**
        *
        * Moves the selection to the end of the current line.
        **/
        Selection.prototype.selectLineEnd = function () {
            this.$moveSelection(this.moveCursorLineEnd);
        };
        /**
        *
        * Moves the selection to the end of the file.
        **/
        Selection.prototype.selectFileEnd = function () {
            this.$moveSelection(this.moveCursorFileEnd);
        };
        /**
        *
        * Moves the selection to the start of the file.
        **/
        Selection.prototype.selectFileStart = function () {
            this.$moveSelection(this.moveCursorFileStart);
        };
        /**
        *
        * Moves the selection to the first word on the right.
        **/
        Selection.prototype.selectWordRight = function () {
            this.$moveSelection(this.moveCursorWordRight);
        };
        /**
        *
        * Moves the selection to the first word on the left.
        **/
        Selection.prototype.selectWordLeft = function () {
            this.$moveSelection(this.moveCursorWordLeft);
        };
        /**
        * Moves the selection to highlight the entire word.
        * @related EditSession.getWordRange
        **/
        Selection.prototype.getWordRange = function (row, column) {
            if (typeof column == "undefined") {
                var cursor = row || this.lead;
                row = cursor.row;
                column = cursor.column;
            }
            return this.session.getWordRange(row, column);
        };
        /**
        *
        * Selects an entire word boundary.
        **/
        Selection.prototype.selectWord = function () {
            this.setSelectionRange(this.getWordRange());
        };
        /**
        * Selects a word, including its right whitespace.
        * @related EditSession.getAWordRange
        **/
        Selection.prototype.selectAWord = function () {
            var cursor = this.getCursor();
            var range = this.session.getAWordRange(cursor.row, cursor.column);
            this.setSelectionRange(range);
        };
        Selection.prototype.getLineRange = function (row, excludeLastChar) {
            var rowStart = typeof row == "number" ? row : this.lead.row;
            var rowEnd;
            var foldLine = this.session.getFoldLine(rowStart);
            if (foldLine) {
                rowStart = foldLine.start.row;
                rowEnd = foldLine.end.row;
            }
            else {
                rowEnd = rowStart;
            }
            if (excludeLastChar) {
                return new Range_1.default(rowStart, 0, rowEnd, this.session.getLine(rowEnd).length);
            }
            else {
                return new Range_1.default(rowStart, 0, rowEnd + 1, 0);
            }
        };
        /**
        * Selects the entire line.
        **/
        Selection.prototype.selectLine = function () {
            this.setSelectionRange(this.getLineRange());
        };
        /**
        *
        * Moves the cursor up one row.
        **/
        Selection.prototype.moveCursorUp = function () {
            this.moveCursorBy(-1, 0);
        };
        /**
        *
        * Moves the cursor down one row.
        **/
        Selection.prototype.moveCursorDown = function () {
            this.moveCursorBy(1, 0);
        };
        /**
        *
        * Moves the cursor left one column.
        **/
        Selection.prototype.moveCursorLeft = function () {
            var cursor = this.lead.getPosition(), fold;
            if (fold = this.session.getFoldAt(cursor.row, cursor.column, -1)) {
                this.moveCursorTo(fold.start.row, fold.start.column);
            }
            else if (cursor.column === 0) {
                // cursor is a line (start
                if (cursor.row > 0) {
                    this.moveCursorTo(cursor.row - 1, this.doc.getLine(cursor.row - 1).length);
                }
            }
            else {
                var tabSize = this.session.getTabSize();
                if (this.session.isTabStop(cursor) && this.doc.getLine(cursor.row).slice(cursor.column - tabSize, cursor.column).split(" ").length - 1 == tabSize)
                    this.moveCursorBy(0, -tabSize);
                else
                    this.moveCursorBy(0, -1);
            }
        };
        /**
        *
        * Moves the cursor right one column.
        **/
        Selection.prototype.moveCursorRight = function () {
            var pos = this.lead.getPosition();
            var fold = this.session.getFoldAt(pos.row, pos.column, 1);
            if (fold) {
                this.moveCursorTo(fold.end.row, fold.end.column);
            }
            else if (this.lead.column == this.doc.getLine(this.lead.row).length) {
                if (this.lead.row < this.doc.getLength() - 1) {
                    this.moveCursorTo(this.lead.row + 1, 0);
                }
            }
            else {
                var tabSize = this.session.getTabSize();
                var cursor = this.lead;
                if (this.session.isTabStop(cursor) && this.doc.getLine(cursor.row).slice(cursor.column, cursor.column + tabSize).split(" ").length - 1 == tabSize) {
                    this.moveCursorBy(0, tabSize);
                }
                else {
                    this.moveCursorBy(0, 1);
                }
            }
        };
        /**
        *
        * Moves the cursor to the start of the line.
        **/
        Selection.prototype.moveCursorLineStart = function () {
            var row = this.lead.row;
            var column = this.lead.column;
            var screenRow = this.session.documentToScreenRow(row, column);
            // Determ the doc-position of the first character at the screen line.
            var firstColumnPosition = this.session.screenToDocumentPosition(screenRow, 0);
            // Determ the line
            // How does getDisplayLine get from folding onto session?
            var beforeCursor = this.session['getDisplayLine'](row, null, firstColumnPosition.row, firstColumnPosition.column);
            var leadingSpace = beforeCursor.match(/^\s*/);
            // TODO find better way for emacs mode to override selection behaviors
            if (leadingSpace[0].length != column && !this.session['$useEmacsStyleLineStart'])
                firstColumnPosition.column += leadingSpace[0].length;
            this.moveCursorToPosition(firstColumnPosition);
        };
        /**
        *
        * Moves the cursor to the end of the line.
        **/
        Selection.prototype.moveCursorLineEnd = function () {
            var lead = this.lead;
            var lineEnd = this.session.getDocumentLastRowColumnPosition(lead.row, lead.column);
            if (this.lead.column == lineEnd.column) {
                var line = this.session.getLine(lineEnd.row);
                if (lineEnd.column == line.length) {
                    var textEnd = line.search(/\s+$/);
                    if (textEnd > 0)
                        lineEnd.column = textEnd;
                }
            }
            this.moveCursorTo(lineEnd.row, lineEnd.column);
        };
        /**
        *
        * Moves the cursor to the end of the file.
        **/
        Selection.prototype.moveCursorFileEnd = function () {
            var row = this.doc.getLength() - 1;
            var column = this.doc.getLine(row).length;
            this.moveCursorTo(row, column);
        };
        /**
        *
        * Moves the cursor to the start of the file.
        **/
        Selection.prototype.moveCursorFileStart = function () {
            this.moveCursorTo(0, 0);
        };
        /**
        *
        * Moves the cursor to the word on the right.
        **/
        Selection.prototype.moveCursorLongWordRight = function () {
            var row = this.lead.row;
            var column = this.lead.column;
            var line = this.doc.getLine(row);
            var rightOfCursor = line.substring(column);
            var match;
            this.session.nonTokenRe.lastIndex = 0;
            this.session.tokenRe.lastIndex = 0;
            // skip folds
            var fold = this.session.getFoldAt(row, column, 1);
            if (fold) {
                this.moveCursorTo(fold.end.row, fold.end.column);
                return;
            }
            // first skip space
            if (match = this.session.nonTokenRe.exec(rightOfCursor)) {
                column += this.session.nonTokenRe.lastIndex;
                this.session.nonTokenRe.lastIndex = 0;
                rightOfCursor = line.substring(column);
            }
            // if at line end proceed with next line
            if (column >= line.length) {
                this.moveCursorTo(row, line.length);
                this.moveCursorRight();
                if (row < this.doc.getLength() - 1)
                    this.moveCursorWordRight();
                return;
            }
            // advance to the end of the next token
            if (match = this.session.tokenRe.exec(rightOfCursor)) {
                column += this.session.tokenRe.lastIndex;
                this.session.tokenRe.lastIndex = 0;
            }
            this.moveCursorTo(row, column);
        };
        /**
        *
        * Moves the cursor to the word on the left.
        **/
        Selection.prototype.moveCursorLongWordLeft = function () {
            var row = this.lead.row;
            var column = this.lead.column;
            // skip folds
            var fold;
            if (fold = this.session.getFoldAt(row, column, -1)) {
                this.moveCursorTo(fold.start.row, fold.start.column);
                return;
            }
            // How does this get from the folding adapter onto the session?
            var str = this.session.getFoldStringAt(row, column, -1);
            if (str == null) {
                str = this.doc.getLine(row).substring(0, column);
            }
            var leftOfCursor = lang_1.stringReverse(str);
            var match;
            this.session.nonTokenRe.lastIndex = 0;
            this.session.tokenRe.lastIndex = 0;
            // skip whitespace
            if (match = this.session.nonTokenRe.exec(leftOfCursor)) {
                column -= this.session.nonTokenRe.lastIndex;
                leftOfCursor = leftOfCursor.slice(this.session.nonTokenRe.lastIndex);
                this.session.nonTokenRe.lastIndex = 0;
            }
            // if at begin of the line proceed in line above
            if (column <= 0) {
                this.moveCursorTo(row, 0);
                this.moveCursorLeft();
                if (row > 0)
                    this.moveCursorWordLeft();
                return;
            }
            // move to the begin of the word
            if (match = this.session.tokenRe.exec(leftOfCursor)) {
                column -= this.session.tokenRe.lastIndex;
                this.session.tokenRe.lastIndex = 0;
            }
            this.moveCursorTo(row, column);
        };
        Selection.prototype.$shortWordEndIndex = function (rightOfCursor) {
            var match, index = 0, ch;
            var whitespaceRe = /\s/;
            var tokenRe = this.session.tokenRe;
            tokenRe.lastIndex = 0;
            if (match = this.session.tokenRe.exec(rightOfCursor)) {
                index = this.session.tokenRe.lastIndex;
            }
            else {
                while ((ch = rightOfCursor[index]) && whitespaceRe.test(ch))
                    index++;
                if (index < 1) {
                    tokenRe.lastIndex = 0;
                    while ((ch = rightOfCursor[index]) && !tokenRe.test(ch)) {
                        tokenRe.lastIndex = 0;
                        index++;
                        if (whitespaceRe.test(ch)) {
                            if (index > 2) {
                                index--;
                                break;
                            }
                            else {
                                while ((ch = rightOfCursor[index]) && whitespaceRe.test(ch))
                                    index++;
                                if (index > 2)
                                    break;
                            }
                        }
                    }
                }
            }
            tokenRe.lastIndex = 0;
            return index;
        };
        Selection.prototype.moveCursorShortWordRight = function () {
            var row = this.lead.row;
            var column = this.lead.column;
            var line = this.doc.getLine(row);
            var rightOfCursor = line.substring(column);
            var fold = this.session.getFoldAt(row, column, 1);
            if (fold)
                return this.moveCursorTo(fold.end.row, fold.end.column);
            if (column == line.length) {
                var l = this.doc.getLength();
                do {
                    row++;
                    rightOfCursor = this.doc.getLine(row);
                } while (row < l && /^\s*$/.test(rightOfCursor));
                if (!/^\s+/.test(rightOfCursor))
                    rightOfCursor = "";
                column = 0;
            }
            var index = this.$shortWordEndIndex(rightOfCursor);
            this.moveCursorTo(row, column + index);
        };
        Selection.prototype.moveCursorShortWordLeft = function () {
            var row = this.lead.row;
            var column = this.lead.column;
            var fold;
            if (fold = this.session.getFoldAt(row, column, -1))
                return this.moveCursorTo(fold.start.row, fold.start.column);
            var line = this.session.getLine(row).substring(0, column);
            if (column == 0) {
                do {
                    row--;
                    line = this.doc.getLine(row);
                } while (row > 0 && /^\s*$/.test(line));
                column = line.length;
                if (!/\s+$/.test(line))
                    line = "";
            }
            var leftOfCursor = lang_1.stringReverse(line);
            var index = this.$shortWordEndIndex(leftOfCursor);
            return this.moveCursorTo(row, column - index);
        };
        Selection.prototype.moveCursorWordRight = function () {
            // See keyboard/emacs.js
            if (this.session['$selectLongWords']) {
                this.moveCursorLongWordRight();
            }
            else {
                this.moveCursorShortWordRight();
            }
        };
        Selection.prototype.moveCursorWordLeft = function () {
            // See keyboard/emacs.js
            if (this.session['$selectLongWords']) {
                this.moveCursorLongWordLeft();
            }
            else {
                this.moveCursorShortWordLeft();
            }
        };
        /**
        * Moves the cursor to position indicated by the parameters. Negative numbers move the cursor backwards in the document.
        * @param {Number} rows The number of rows to move by
        * @param {Number} chars The number of characters to move by
        *
        *
        * @related EditSession.documentToScreenPosition
        **/
        Selection.prototype.moveCursorBy = function (rows, chars) {
            var screenPos = this.session.documentToScreenPosition(this.lead.row, this.lead.column);
            if (chars === 0) {
                if (this.$desiredColumn)
                    screenPos.column = this.$desiredColumn;
                else
                    this.$desiredColumn = screenPos.column;
            }
            var docPos = this.session.screenToDocumentPosition(screenPos.row + rows, screenPos.column);
            if (rows !== 0 && chars === 0 && docPos.row === this.lead.row && docPos.column === this.lead.column) {
                if (this.session.lineWidgets && this.session.lineWidgets[docPos.row])
                    docPos.row++;
            }
            // move the cursor and update the desired column
            this.moveCursorTo(docPos.row, docPos.column + chars, chars === 0);
        };
        /**
        * Moves the selection to the position indicated by its `row` and `column`.
        * @param {Object} position The position to move to
        *
        *
        **/
        Selection.prototype.moveCursorToPosition = function (position) {
            this.moveCursorTo(position.row, position.column);
        };
        /**
        * Moves the cursor to the row and column provided. [If `preventUpdateDesiredColumn` is `true`, then the cursor stays in the same column position as its original point.]{: #preventUpdateBoolDesc}
        * @param {number} row The row to move to
        * @param {number} column The column to move to
        * @param {boolean} keepDesiredColumn [If `true`, the cursor move does not respect the previous column]{: #preventUpdateBool}
        */
        Selection.prototype.moveCursorTo = function (row, column, keepDesiredColumn) {
            // Ensure the row/column is not inside of a fold.
            var fold = this.session.getFoldAt(row, column, 1);
            if (fold) {
                row = fold.start.row;
                column = fold.start.column;
            }
            this.$keepDesiredColumnOnChange = true;
            this.lead.setPosition(row, column);
            this.$keepDesiredColumnOnChange = false;
            if (!keepDesiredColumn)
                this.$desiredColumn = null;
        };
        /**
        * Moves the cursor to the screen position indicated by row and column. {:preventUpdateBoolDesc}
        * @param {Number} row The row to move to
        * @param {Number} column The column to move to
        * @param {Boolean} keepDesiredColumn {:preventUpdateBool}
        *
        *
        **/
        Selection.prototype.moveCursorToScreen = function (row, column, keepDesiredColumn) {
            var pos = this.session.screenToDocumentPosition(row, column);
            this.moveCursorTo(pos.row, pos.column, keepDesiredColumn);
        };
        // remove listeners from document
        Selection.prototype.detach = function () {
            this.lead.detach();
            this.anchor.detach();
            this.session = this.doc = null;
        };
        Selection.prototype.fromOrientedRange = function (range) {
            this.setSelectionRange(range, range.cursor == range.start);
            this.$desiredColumn = range.desiredColumn || this.$desiredColumn;
        };
        Selection.prototype.toOrientedRange = function (range) {
            var r = this.getRange();
            if (range) {
                range.start.column = r.start.column;
                range.start.row = r.start.row;
                range.end.column = r.end.column;
                range.end.row = r.end.row;
            }
            else {
                range = r;
            }
            range.cursor = this.isBackwards() ? range.start : range.end;
            range.desiredColumn = this.$desiredColumn;
            return range;
        };
        /**
        * Saves the current cursor position and calls `func` that can change the cursor
        * postion. The result is the range of the starting and eventual cursor position.
        * Will reset the cursor position.
        * @param {Function} The callback that should change the cursor position
        * @returns {Range}
        *
        **/
        Selection.prototype.getRangeOfMovements = function (func) {
            var start = this.getCursor();
            try {
                func.call(null, this);
                var end = this.getCursor();
                return Range_1.default.fromPoints(start, end);
            }
            catch (e) {
                return Range_1.default.fromPoints(start, start);
            }
            finally {
                this.moveCursorToPosition(start);
            }
        };
        Selection.prototype.toJSON = function () {
            if (this.rangeCount) {
                var data = this.ranges.map(function (r) {
                    var r1 = r.clone();
                    r1.isBackwards = r.cursor == r.start;
                    return r1;
                });
            }
            else {
                var data = this.getRange();
                data.isBackwards = this.isBackwards();
            }
            return data;
        };
        Selection.prototype.toSingleRange = function (data) {
            throw new Error("Selection.toSingleRange is unsupported");
        };
        Selection.prototype.addRange = function (data, something) {
            throw new Error("Selection.addRange is unsupported");
        };
        Selection.prototype.fromJSON = function (data) {
            if (data.start == undefined) {
                if (this.rangeList) {
                    this.toSingleRange(data[0]);
                    for (var i = data.length; i--;) {
                        var r = Range_1.default.fromPoints(data[i].start, data[i].end);
                        if (data.isBackwards)
                            r.cursor = r.start;
                        this.addRange(r, true);
                    }
                    return;
                }
                else
                    data = data[0];
            }
            if (this.rangeList)
                this.toSingleRange(data);
            this.setSelectionRange(data, data.isBackwards);
        };
        Selection.prototype.isEqual = function (data) {
            if ((data.length || this.rangeCount) && data.length != this.rangeCount)
                return false;
            if (!data.length || !this.ranges)
                return this.getRange().isEqual(data);
            for (var i = this.ranges.length; i--;) {
                if (!this.ranges[i].isEqual(data[i]))
                    return false;
            }
            return true;
        };
        return Selection;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Selection;
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
define('Tokenizer',["require", "exports"], function (require, exports) {
    // tokenizing lines longer than this makes editor very slow
    var MAX_TOKEN_COUNT = 1000;
    /**
     * This class takes a set of highlighting rules, and creates a tokenizer out of them. For more information, see [the wiki on extending highlighters](https://github.com/ajaxorg/ace/wiki/Creating-or-Extending-an-Edit-Mode#wiki-extendingTheHighlighter).
     * @class Tokenizer
     **/
    /**
     * Constructs a new tokenizer based on the given rules and flags.
     * @param {Object} rules The highlighting rules
     *
     * @constructor
     **/
    var Tokenizer = (function () {
        function Tokenizer(rules) {
            this.states = rules;
            this.regExps = {};
            this.matchMappings = {};
            for (var key in this.states) {
                var state = this.states[key];
                var ruleRegExps = [];
                var matchTotal = 0;
                var mapping = this.matchMappings[key] = { defaultToken: "text" };
                var flag = "g";
                var splitterRules = [];
                for (var i = 0; i < state.length; i++) {
                    var rule = state[i];
                    if (rule.defaultToken)
                        mapping.defaultToken = rule.defaultToken;
                    if (rule.caseInsensitive)
                        flag = "gi";
                    if (rule.regex == null)
                        continue;
                    if (rule.regex instanceof RegExp)
                        rule.regex = rule.regex.toString().slice(1, -1);
                    // Count number of matching groups. 2 extra groups from the full match
                    // And the catch-all on the end (used to force a match);
                    var adjustedregex = rule.regex;
                    var matchcount = new RegExp("(?:(" + adjustedregex + ")|(.))").exec("a").length - 2;
                    if (Array.isArray(rule.token)) {
                        if (rule.token.length == 1 || matchcount == 1) {
                            rule.token = rule.token[0];
                        }
                        else if (matchcount - 1 != rule.token.length) {
                            throw new Error("number of classes and regexp groups in '" +
                                rule.token + "'\n'" + rule.regex + "' doesn't match\n"
                                + (matchcount - 1) + "!=" + rule.token.length);
                        }
                        else {
                            rule.tokenArray = rule.token;
                            rule.token = null;
                            rule.onMatch = this.$arrayTokens;
                        }
                    }
                    else if (typeof rule.token === "function" && !rule.onMatch) {
                        if (matchcount > 1)
                            rule.onMatch = this.$applyToken;
                        else
                            rule.onMatch = rule.token;
                    }
                    if (matchcount > 1) {
                        if (/\\\d/.test(rule.regex)) {
                            // Replace any backreferences and offset appropriately.
                            adjustedregex = rule.regex.replace(/\\([0-9]+)/g, function (match, digit) {
                                return "\\" + (parseInt(digit, 10) + matchTotal + 1);
                            });
                        }
                        else {
                            matchcount = 1;
                            adjustedregex = this.removeCapturingGroups(rule.regex);
                        }
                        if (!rule.splitRegex && typeof rule.token != "string")
                            splitterRules.push(rule); // flag will be known only at the very end
                    }
                    mapping[matchTotal] = i;
                    matchTotal += matchcount;
                    ruleRegExps.push(adjustedregex);
                    // makes property access faster
                    if (!rule.onMatch)
                        rule.onMatch = null;
                }
                if (!ruleRegExps.length) {
                    mapping[0] = 0;
                    ruleRegExps.push("$");
                }
                splitterRules.forEach(function (rule) {
                    rule.splitRegex = this.createSplitterRegexp(rule.regex, flag);
                }, this);
                this.regExps[key] = new RegExp("(" + ruleRegExps.join(")|(") + ")|($)", flag);
            }
        }
        Tokenizer.prototype.$setMaxTokenCount = function (m) {
            MAX_TOKEN_COUNT = m | 0;
        };
        Tokenizer.prototype.$applyToken = function (str) {
            var values = this.splitRegex.exec(str).slice(1);
            var types = this.token.apply(this, values);
            // required for compatibility with old modes
            if (typeof types === "string")
                return [{ type: types, value: str }];
            var tokens = [];
            for (var i = 0, l = types.length; i < l; i++) {
                if (values[i])
                    tokens[tokens.length] = {
                        type: types[i],
                        value: values[i]
                    };
            }
            return tokens;
        };
        Tokenizer.prototype.$arrayTokens = function (str) {
            if (!str) {
                return [];
            }
            var values = this.splitRegex.exec(str);
            if (!values)
                return "text";
            var tokens = [];
            var types = this.tokenArray;
            for (var i = 0, l = types.length; i < l; i++) {
                if (values[i + 1])
                    tokens[tokens.length] = {
                        type: types[i],
                        value: values[i + 1]
                    };
            }
            return tokens;
        };
        Tokenizer.prototype.removeCapturingGroups = function (src) {
            var r = src.replace(/\[(?:\\.|[^\]])*?\]|\\.|\(\?[:=!]|(\()/g, function (x, y) { return y ? "(?:" : x; });
            return r;
        };
        Tokenizer.prototype.createSplitterRegexp = function (src, flag) {
            if (src.indexOf("(?=") != -1) {
                var stack = 0;
                var inChClass = false;
                var lastCapture = {};
                src.replace(/(\\.)|(\((?:\?[=!])?)|(\))|([\[\]])/g, function (m, esc, parenOpen, parenClose, square, index) {
                    if (inChClass) {
                        inChClass = square != "]";
                    }
                    else if (square) {
                        inChClass = true;
                    }
                    else if (parenClose) {
                        if (stack == lastCapture.stack) {
                            lastCapture.end = index + 1;
                            lastCapture.stack = -1;
                        }
                        stack--;
                    }
                    else if (parenOpen) {
                        stack++;
                        if (parenOpen.length != 1) {
                            lastCapture.stack = stack;
                            lastCapture.start = index;
                        }
                    }
                    return m;
                });
                if (lastCapture.end != null && /^\)*$/.test(src.substr(lastCapture.end)))
                    src = src.substring(0, lastCapture.start) + src.substr(lastCapture.end);
            }
            return new RegExp(src, (flag || "").replace("g", ""));
        };
        /**
        * Returns an object containing two properties: `tokens`, which contains all the tokens; and `state`, the current state.
        * @returns {Object}
        **/
        Tokenizer.prototype.getLineTokens = function (line, startState) {
            var stack;
            if (startState && typeof startState !== 'string') {
                stack = startState.slice(0);
                startState = stack[0];
                if (startState === '#tmp') {
                    stack.shift();
                    startState = stack.shift();
                }
            }
            else {
                stack = [];
            }
            var currentState = startState || "start";
            var state = this.states[currentState];
            if (!state) {
                currentState = "start";
                state = this.states[currentState];
            }
            var mapping = this.matchMappings[currentState];
            var re = this.regExps[currentState];
            re.lastIndex = 0;
            var match, tokens = [];
            var lastIndex = 0;
            var token = { type: null, value: "" };
            while (match = re.exec(line)) {
                var type = mapping.defaultToken;
                var rule = null;
                var value = match[0];
                var index = re.lastIndex;
                if (index - value.length > lastIndex) {
                    var skipped = line.substring(lastIndex, index - value.length);
                    if (token.type == type) {
                        token.value += skipped;
                    }
                    else {
                        if (token.type)
                            tokens.push(token);
                        token = { type: type, value: skipped };
                    }
                }
                for (var i = 0; i < match.length - 2; i++) {
                    if (match[i + 1] === undefined)
                        continue;
                    rule = state[mapping[i]];
                    if (rule.onMatch)
                        type = rule.onMatch(value, currentState, stack);
                    else
                        type = rule.token;
                    if (rule.next) {
                        if (typeof rule.next === 'string') {
                            currentState = rule.next;
                        }
                        else {
                            currentState = rule.next(currentState, stack);
                        }
                        state = this.states[currentState];
                        if (!state) {
                            window.console && console.error && console.error(currentState, "doesn't exist");
                            currentState = "start";
                            state = this.states[currentState];
                        }
                        mapping = this.matchMappings[currentState];
                        lastIndex = index;
                        re = this.regExps[currentState];
                        re.lastIndex = index;
                    }
                    break;
                }
                if (value) {
                    if (typeof type == "string") {
                        if ((!rule || rule.merge !== false) && token.type === type) {
                            token.value += value;
                        }
                        else {
                            if (token.type)
                                tokens.push(token);
                            token = { type: type, value: value };
                        }
                    }
                    else if (type) {
                        if (token.type)
                            tokens.push(token);
                        token = { type: null, value: "" };
                        for (var i = 0; i < type.length; i++)
                            tokens.push(type[i]);
                    }
                }
                if (lastIndex == line.length)
                    break;
                lastIndex = index;
                if (tokens.length > MAX_TOKEN_COUNT) {
                    // chrome doens't show contents of text nodes with very long text
                    while (lastIndex < line.length) {
                        if (token.type)
                            tokens.push(token);
                        token = {
                            value: line.substring(lastIndex, lastIndex += 2000),
                            type: "overflow"
                        };
                    }
                    currentState = "start";
                    stack = [];
                    break;
                }
            }
            if (token.type)
                tokens.push(token);
            if (stack.length > 1) {
                if (stack[0] !== currentState) {
                    stack.unshift('#tmp', currentState);
                }
            }
            return {
                tokens: tokens,
                state: stack.length ? stack : currentState
            };
        };
        return Tokenizer;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Tokenizer;
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
define('mode/TextHighlightRules',["require", "exports", "../lib/lang"], function (require, exports, lang_1) {
    var TextHighlightRules = (function () {
        function TextHighlightRules() {
            // regexp must not have capturing parentheses
            // regexps are ordered -> the first match is used
            this.$rules = {
                "start": [{
                        token: "empty_line",
                        regex: '^$'
                    }, {
                        defaultToken: "text"
                    }]
            };
        }
        TextHighlightRules.prototype.addRules = function (rules, prefix) {
            if (!prefix) {
                for (var key in rules)
                    this.$rules[key] = rules[key];
                return;
            }
            for (var key in rules) {
                var state = rules[key];
                for (var i = 0; i < state.length; i++) {
                    var rule = state[i];
                    if (rule.next || rule.onMatch) {
                        if (typeof rule.next != "string") {
                            if (rule.nextState && rule.nextState.indexOf(prefix) !== 0)
                                rule.nextState = prefix + rule.nextState;
                        }
                        else {
                            if (rule.next.indexOf(prefix) !== 0)
                                rule.next = prefix + rule.next;
                        }
                    }
                }
                this.$rules[prefix + key] = state;
            }
        };
        TextHighlightRules.prototype.getRules = function () {
            return this.$rules;
        };
        TextHighlightRules.prototype.embedRules = function (HighlightRules, prefix, escapeRules, states, append) {
            var embedRules = (typeof HighlightRules === "function") ? new HighlightRules().getRules() : HighlightRules;
            if (states) {
                for (var i = 0; i < states.length; i++)
                    states[i] = prefix + states[i];
            }
            else {
                states = [];
                for (var key in embedRules)
                    states.push(prefix + key);
            }
            this.addRules(embedRules, prefix);
            if (escapeRules) {
                var addRules = Array.prototype[append ? "push" : "unshift"];
                for (var i = 0; i < states.length; i++)
                    addRules.apply(this.$rules[states[i]], lang_1.deepCopy(escapeRules));
            }
            if (!this.$embeds)
                this.$embeds = [];
            this.$embeds.push(prefix);
        };
        TextHighlightRules.prototype.getEmbeds = function () {
            return this.$embeds;
        };
        TextHighlightRules.prototype.normalizeRules = function () {
            var pushState = function (currentState, stack) {
                if (currentState != "start" || stack.length)
                    stack.unshift(this.nextState, currentState);
                return this.nextState;
            };
            var popState = function (currentState, stack) {
                // if (stack[0] === currentState)
                stack.shift();
                return stack.shift() || "start";
            };
            var id = 0;
            var rules = this.$rules;
            function processState(key) {
                var state = rules[key];
                state.processed = true;
                for (var i = 0; i < state.length; i++) {
                    var rule = state[i];
                    if (!rule.regex && rule.start) {
                        rule.regex = rule.start;
                        if (!rule.next)
                            rule.next = [];
                        rule.next.push({
                            defaultToken: rule.token
                        }, {
                            token: rule.token + ".end",
                            regex: rule.end || rule.start,
                            next: "pop"
                        });
                        rule.token = rule.token + ".start";
                        rule.push = true;
                    }
                    var next = rule.next || rule.push;
                    if (next && Array.isArray(next)) {
                        var stateName = rule.stateName;
                        if (!stateName) {
                            stateName = rule.token;
                            if (typeof stateName != "string")
                                stateName = stateName[0] || "";
                            if (rules[stateName])
                                stateName += id++;
                        }
                        rules[stateName] = next;
                        rule.next = stateName;
                        processState(stateName);
                    }
                    else if (next == "pop") {
                        rule.next = popState;
                    }
                    if (rule.push) {
                        rule.nextState = rule.next || rule.push;
                        rule.next = pushState;
                        delete rule.push;
                    }
                    if (rule.rules) {
                        for (var r in rule.rules) {
                            if (rules[r]) {
                                if (rules[r].push)
                                    rules[r].push.apply(rules[r], rule.rules[r]);
                            }
                            else {
                                rules[r] = rule.rules[r];
                            }
                        }
                    }
                    if (rule.include || typeof rule === "string") {
                        var includeName = rule.include || rule;
                        var toInsert = rules[includeName];
                    }
                    else if (Array.isArray(rule))
                        toInsert = rule;
                    if (toInsert) {
                        var args = [i, 1].concat(toInsert);
                        if (rule.noEscape) {
                            args = args.filter(function (x) { return !x['next']; });
                        }
                        state.splice.apply(state, args);
                        // skip included rules since they are already processed
                        //i += args.length - 3;
                        i--;
                        toInsert = null;
                    }
                    if (rule.keywordMap) {
                        rule.token = this.createKeywordMapper(rule.keywordMap, rule.defaultToken || "text", rule.caseInsensitive);
                        delete rule.defaultToken;
                    }
                }
            }
            Object.keys(rules).forEach(processState, this);
        };
        TextHighlightRules.prototype.createKeywordMapper = function (map, defaultToken, ignoreCase, splitChar) {
            var keywords = Object.create(null);
            Object.keys(map).forEach(function (className) {
                var a = map[className];
                if (ignoreCase)
                    a = a.toLowerCase();
                var list = a.split(splitChar || "|");
                for (var i = list.length; i--;)
                    keywords[list[i]] = className;
            });
            // in old versions of opera keywords["__proto__"] sets prototype
            // even on objects with __proto__=null
            if (Object.getPrototypeOf(keywords)) {
                keywords.__proto__ = null;
            }
            this.$keywordList = Object.keys(keywords);
            map = null;
            return ignoreCase
                ? function (value) { return keywords[value.toLowerCase()] || defaultToken; }
                : function (value) { return keywords[value] || defaultToken; };
        };
        TextHighlightRules.prototype.getKeywords = function () {
            return this.$keywordList;
        };
        return TextHighlightRules;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = TextHighlightRules;
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
define('mode/Behaviour',["require", "exports"], function (require, exports) {
    var Behaviour = (function () {
        function Behaviour() {
            this.$behaviours = {};
        }
        Behaviour.prototype.add = function (name, action, callback) {
            switch (undefined) {
                case this.$behaviours:
                    this.$behaviours = {};
                case this.$behaviours[name]:
                    this.$behaviours[name] = {};
            }
            this.$behaviours[name][action] = callback;
        };
        Behaviour.prototype.addBehaviours = function (behaviours) {
            for (var key in behaviours) {
                for (var action in behaviours[key]) {
                    this.add(key, action, behaviours[key][action]);
                }
            }
        };
        Behaviour.prototype.remove = function (name) {
            if (this.$behaviours && this.$behaviours[name]) {
                delete this.$behaviours[name];
            }
        };
        Behaviour.prototype.inherit = function (mode, filter) {
            if (typeof mode === 'function') {
                var behaviours = new mode().getBehaviours(filter);
            }
            else {
                var behaviours = mode.getBehaviours(filter);
            }
            this.addBehaviours(behaviours);
        };
        Behaviour.prototype.getBehaviours = function (filter) {
            if (!filter) {
                return this.$behaviours;
            }
            else {
                var ret = {};
                for (var i = 0; i < filter.length; i++) {
                    if (this.$behaviours[filter[i]]) {
                        ret[filter[i]] = this.$behaviours[filter[i]];
                    }
                }
                return ret;
            }
        };
        return Behaviour;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Behaviour;
});

define('unicode',["require", "exports"], function (require, exports) {
    "use strict";
    /*
    XRegExp Unicode plugin pack: Categories 1.0
    (c) 2010 Steven Levithan
    MIT License
    <http://xregexp.com>
    Uses the Unicode 5.2 character database
    
    This package for the XRegExp Unicode plugin enables the following Unicode categories (aka properties):
    
    L - Letter (the top-level Letter category is included in the Unicode plugin base script)
        Ll - Lowercase letter
        Lu - Uppercase letter
        Lt - Titlecase letter
        Lm - Modifier letter
        Lo - Letter without case
    M - Mark
        Mn - Non-spacing mark
        Mc - Spacing combining mark
        Me - Enclosing mark
    N - Number
        Nd - Decimal digit
        Nl - Letter number
        No -  Other number
    P - Punctuation
        Pd - Dash punctuation
        Ps - Open punctuation
        Pe - Close punctuation
        Pi - Initial punctuation
        Pf - Final punctuation
        Pc - Connector punctuation
        Po - Other punctuation
    S - Symbol
        Sm - Math symbol
        Sc - Currency symbol
        Sk - Modifier symbol
        So - Other symbol
    Z - Separator
        Zs - Space separator
        Zl - Line separator
        Zp - Paragraph separator
    C - Other
        Cc - Control
        Cf - Format
        Co - Private use
        Cs - Surrogate
        Cn - Unassigned
    
    Example usage:
    
        \p{N}
        \p{Cn}
    */
    // will be populated by addUnicodePackage
    exports.packages = { L: undefined, Mn: undefined, Mc: undefined, Nd: undefined, Pc: undefined };
    addUnicodePackage({
        L: "0041-005A0061-007A00AA00B500BA00C0-00D600D8-00F600F8-02C102C6-02D102E0-02E402EC02EE0370-037403760377037A-037D03860388-038A038C038E-03A103A3-03F503F7-0481048A-05250531-055605590561-058705D0-05EA05F0-05F20621-064A066E066F0671-06D306D506E506E606EE06EF06FA-06FC06FF07100712-072F074D-07A507B107CA-07EA07F407F507FA0800-0815081A082408280904-0939093D09500958-0961097109720979-097F0985-098C098F09900993-09A809AA-09B009B209B6-09B909BD09CE09DC09DD09DF-09E109F009F10A05-0A0A0A0F0A100A13-0A280A2A-0A300A320A330A350A360A380A390A59-0A5C0A5E0A72-0A740A85-0A8D0A8F-0A910A93-0AA80AAA-0AB00AB20AB30AB5-0AB90ABD0AD00AE00AE10B05-0B0C0B0F0B100B13-0B280B2A-0B300B320B330B35-0B390B3D0B5C0B5D0B5F-0B610B710B830B85-0B8A0B8E-0B900B92-0B950B990B9A0B9C0B9E0B9F0BA30BA40BA8-0BAA0BAE-0BB90BD00C05-0C0C0C0E-0C100C12-0C280C2A-0C330C35-0C390C3D0C580C590C600C610C85-0C8C0C8E-0C900C92-0CA80CAA-0CB30CB5-0CB90CBD0CDE0CE00CE10D05-0D0C0D0E-0D100D12-0D280D2A-0D390D3D0D600D610D7A-0D7F0D85-0D960D9A-0DB10DB3-0DBB0DBD0DC0-0DC60E01-0E300E320E330E40-0E460E810E820E840E870E880E8A0E8D0E94-0E970E99-0E9F0EA1-0EA30EA50EA70EAA0EAB0EAD-0EB00EB20EB30EBD0EC0-0EC40EC60EDC0EDD0F000F40-0F470F49-0F6C0F88-0F8B1000-102A103F1050-1055105A-105D106110651066106E-10701075-1081108E10A0-10C510D0-10FA10FC1100-1248124A-124D1250-12561258125A-125D1260-1288128A-128D1290-12B012B2-12B512B8-12BE12C012C2-12C512C8-12D612D8-13101312-13151318-135A1380-138F13A0-13F41401-166C166F-167F1681-169A16A0-16EA1700-170C170E-17111720-17311740-17511760-176C176E-17701780-17B317D717DC1820-18771880-18A818AA18B0-18F51900-191C1950-196D1970-19741980-19AB19C1-19C71A00-1A161A20-1A541AA71B05-1B331B45-1B4B1B83-1BA01BAE1BAF1C00-1C231C4D-1C4F1C5A-1C7D1CE9-1CEC1CEE-1CF11D00-1DBF1E00-1F151F18-1F1D1F20-1F451F48-1F4D1F50-1F571F591F5B1F5D1F5F-1F7D1F80-1FB41FB6-1FBC1FBE1FC2-1FC41FC6-1FCC1FD0-1FD31FD6-1FDB1FE0-1FEC1FF2-1FF41FF6-1FFC2071207F2090-209421022107210A-211321152119-211D212421262128212A-212D212F-2139213C-213F2145-2149214E218321842C00-2C2E2C30-2C5E2C60-2CE42CEB-2CEE2D00-2D252D30-2D652D6F2D80-2D962DA0-2DA62DA8-2DAE2DB0-2DB62DB8-2DBE2DC0-2DC62DC8-2DCE2DD0-2DD62DD8-2DDE2E2F300530063031-3035303B303C3041-3096309D-309F30A1-30FA30FC-30FF3105-312D3131-318E31A0-31B731F0-31FF3400-4DB54E00-9FCBA000-A48CA4D0-A4FDA500-A60CA610-A61FA62AA62BA640-A65FA662-A66EA67F-A697A6A0-A6E5A717-A71FA722-A788A78BA78CA7FB-A801A803-A805A807-A80AA80C-A822A840-A873A882-A8B3A8F2-A8F7A8FBA90A-A925A930-A946A960-A97CA984-A9B2A9CFAA00-AA28AA40-AA42AA44-AA4BAA60-AA76AA7AAA80-AAAFAAB1AAB5AAB6AAB9-AABDAAC0AAC2AADB-AADDABC0-ABE2AC00-D7A3D7B0-D7C6D7CB-D7FBF900-FA2DFA30-FA6DFA70-FAD9FB00-FB06FB13-FB17FB1DFB1F-FB28FB2A-FB36FB38-FB3CFB3EFB40FB41FB43FB44FB46-FBB1FBD3-FD3DFD50-FD8FFD92-FDC7FDF0-FDFBFE70-FE74FE76-FEFCFF21-FF3AFF41-FF5AFF66-FFBEFFC2-FFC7FFCA-FFCFFFD2-FFD7FFDA-FFDC",
        Ll: "0061-007A00AA00B500BA00DF-00F600F8-00FF01010103010501070109010B010D010F01110113011501170119011B011D011F01210123012501270129012B012D012F01310133013501370138013A013C013E014001420144014601480149014B014D014F01510153015501570159015B015D015F01610163016501670169016B016D016F0171017301750177017A017C017E-0180018301850188018C018D019201950199-019B019E01A101A301A501A801AA01AB01AD01B001B401B601B901BA01BD-01BF01C601C901CC01CE01D001D201D401D601D801DA01DC01DD01DF01E101E301E501E701E901EB01ED01EF01F001F301F501F901FB01FD01FF02010203020502070209020B020D020F02110213021502170219021B021D021F02210223022502270229022B022D022F02310233-0239023C023F0240024202470249024B024D024F-02930295-02AF037103730377037B-037D039003AC-03CE03D003D103D5-03D703D903DB03DD03DF03E103E303E503E703E903EB03ED03EF-03F303F503F803FB03FC0430-045F04610463046504670469046B046D046F04710473047504770479047B047D047F0481048B048D048F04910493049504970499049B049D049F04A104A304A504A704A904AB04AD04AF04B104B304B504B704B904BB04BD04BF04C204C404C604C804CA04CC04CE04CF04D104D304D504D704D904DB04DD04DF04E104E304E504E704E904EB04ED04EF04F104F304F504F704F904FB04FD04FF05010503050505070509050B050D050F05110513051505170519051B051D051F0521052305250561-05871D00-1D2B1D62-1D771D79-1D9A1E011E031E051E071E091E0B1E0D1E0F1E111E131E151E171E191E1B1E1D1E1F1E211E231E251E271E291E2B1E2D1E2F1E311E331E351E371E391E3B1E3D1E3F1E411E431E451E471E491E4B1E4D1E4F1E511E531E551E571E591E5B1E5D1E5F1E611E631E651E671E691E6B1E6D1E6F1E711E731E751E771E791E7B1E7D1E7F1E811E831E851E871E891E8B1E8D1E8F1E911E931E95-1E9D1E9F1EA11EA31EA51EA71EA91EAB1EAD1EAF1EB11EB31EB51EB71EB91EBB1EBD1EBF1EC11EC31EC51EC71EC91ECB1ECD1ECF1ED11ED31ED51ED71ED91EDB1EDD1EDF1EE11EE31EE51EE71EE91EEB1EED1EEF1EF11EF31EF51EF71EF91EFB1EFD1EFF-1F071F10-1F151F20-1F271F30-1F371F40-1F451F50-1F571F60-1F671F70-1F7D1F80-1F871F90-1F971FA0-1FA71FB0-1FB41FB61FB71FBE1FC2-1FC41FC61FC71FD0-1FD31FD61FD71FE0-1FE71FF2-1FF41FF61FF7210A210E210F2113212F21342139213C213D2146-2149214E21842C30-2C5E2C612C652C662C682C6A2C6C2C712C732C742C76-2C7C2C812C832C852C872C892C8B2C8D2C8F2C912C932C952C972C992C9B2C9D2C9F2CA12CA32CA52CA72CA92CAB2CAD2CAF2CB12CB32CB52CB72CB92CBB2CBD2CBF2CC12CC32CC52CC72CC92CCB2CCD2CCF2CD12CD32CD52CD72CD92CDB2CDD2CDF2CE12CE32CE42CEC2CEE2D00-2D25A641A643A645A647A649A64BA64DA64FA651A653A655A657A659A65BA65DA65FA663A665A667A669A66BA66DA681A683A685A687A689A68BA68DA68FA691A693A695A697A723A725A727A729A72BA72DA72F-A731A733A735A737A739A73BA73DA73FA741A743A745A747A749A74BA74DA74FA751A753A755A757A759A75BA75DA75FA761A763A765A767A769A76BA76DA76FA771-A778A77AA77CA77FA781A783A785A787A78CFB00-FB06FB13-FB17FF41-FF5A",
        Lu: "0041-005A00C0-00D600D8-00DE01000102010401060108010A010C010E01100112011401160118011A011C011E01200122012401260128012A012C012E01300132013401360139013B013D013F0141014301450147014A014C014E01500152015401560158015A015C015E01600162016401660168016A016C016E017001720174017601780179017B017D018101820184018601870189-018B018E-0191019301940196-0198019C019D019F01A001A201A401A601A701A901AC01AE01AF01B1-01B301B501B701B801BC01C401C701CA01CD01CF01D101D301D501D701D901DB01DE01E001E201E401E601E801EA01EC01EE01F101F401F6-01F801FA01FC01FE02000202020402060208020A020C020E02100212021402160218021A021C021E02200222022402260228022A022C022E02300232023A023B023D023E02410243-02460248024A024C024E03700372037603860388-038A038C038E038F0391-03A103A3-03AB03CF03D2-03D403D803DA03DC03DE03E003E203E403E603E803EA03EC03EE03F403F703F903FA03FD-042F04600462046404660468046A046C046E04700472047404760478047A047C047E0480048A048C048E04900492049404960498049A049C049E04A004A204A404A604A804AA04AC04AE04B004B204B404B604B804BA04BC04BE04C004C104C304C504C704C904CB04CD04D004D204D404D604D804DA04DC04DE04E004E204E404E604E804EA04EC04EE04F004F204F404F604F804FA04FC04FE05000502050405060508050A050C050E05100512051405160518051A051C051E0520052205240531-055610A0-10C51E001E021E041E061E081E0A1E0C1E0E1E101E121E141E161E181E1A1E1C1E1E1E201E221E241E261E281E2A1E2C1E2E1E301E321E341E361E381E3A1E3C1E3E1E401E421E441E461E481E4A1E4C1E4E1E501E521E541E561E581E5A1E5C1E5E1E601E621E641E661E681E6A1E6C1E6E1E701E721E741E761E781E7A1E7C1E7E1E801E821E841E861E881E8A1E8C1E8E1E901E921E941E9E1EA01EA21EA41EA61EA81EAA1EAC1EAE1EB01EB21EB41EB61EB81EBA1EBC1EBE1EC01EC21EC41EC61EC81ECA1ECC1ECE1ED01ED21ED41ED61ED81EDA1EDC1EDE1EE01EE21EE41EE61EE81EEA1EEC1EEE1EF01EF21EF41EF61EF81EFA1EFC1EFE1F08-1F0F1F18-1F1D1F28-1F2F1F38-1F3F1F48-1F4D1F591F5B1F5D1F5F1F68-1F6F1FB8-1FBB1FC8-1FCB1FD8-1FDB1FE8-1FEC1FF8-1FFB21022107210B-210D2110-211221152119-211D212421262128212A-212D2130-2133213E213F214521832C00-2C2E2C602C62-2C642C672C692C6B2C6D-2C702C722C752C7E-2C802C822C842C862C882C8A2C8C2C8E2C902C922C942C962C982C9A2C9C2C9E2CA02CA22CA42CA62CA82CAA2CAC2CAE2CB02CB22CB42CB62CB82CBA2CBC2CBE2CC02CC22CC42CC62CC82CCA2CCC2CCE2CD02CD22CD42CD62CD82CDA2CDC2CDE2CE02CE22CEB2CEDA640A642A644A646A648A64AA64CA64EA650A652A654A656A658A65AA65CA65EA662A664A666A668A66AA66CA680A682A684A686A688A68AA68CA68EA690A692A694A696A722A724A726A728A72AA72CA72EA732A734A736A738A73AA73CA73EA740A742A744A746A748A74AA74CA74EA750A752A754A756A758A75AA75CA75EA760A762A764A766A768A76AA76CA76EA779A77BA77DA77EA780A782A784A786A78BFF21-FF3A",
        Lt: "01C501C801CB01F21F88-1F8F1F98-1F9F1FA8-1FAF1FBC1FCC1FFC",
        Lm: "02B0-02C102C6-02D102E0-02E402EC02EE0374037A0559064006E506E607F407F507FA081A0824082809710E460EC610FC17D718431AA71C78-1C7D1D2C-1D611D781D9B-1DBF2071207F2090-20942C7D2D6F2E2F30053031-3035303B309D309E30FC-30FEA015A4F8-A4FDA60CA67FA717-A71FA770A788A9CFAA70AADDFF70FF9EFF9F",
        Lo: "01BB01C0-01C3029405D0-05EA05F0-05F20621-063F0641-064A066E066F0671-06D306D506EE06EF06FA-06FC06FF07100712-072F074D-07A507B107CA-07EA0800-08150904-0939093D09500958-096109720979-097F0985-098C098F09900993-09A809AA-09B009B209B6-09B909BD09CE09DC09DD09DF-09E109F009F10A05-0A0A0A0F0A100A13-0A280A2A-0A300A320A330A350A360A380A390A59-0A5C0A5E0A72-0A740A85-0A8D0A8F-0A910A93-0AA80AAA-0AB00AB20AB30AB5-0AB90ABD0AD00AE00AE10B05-0B0C0B0F0B100B13-0B280B2A-0B300B320B330B35-0B390B3D0B5C0B5D0B5F-0B610B710B830B85-0B8A0B8E-0B900B92-0B950B990B9A0B9C0B9E0B9F0BA30BA40BA8-0BAA0BAE-0BB90BD00C05-0C0C0C0E-0C100C12-0C280C2A-0C330C35-0C390C3D0C580C590C600C610C85-0C8C0C8E-0C900C92-0CA80CAA-0CB30CB5-0CB90CBD0CDE0CE00CE10D05-0D0C0D0E-0D100D12-0D280D2A-0D390D3D0D600D610D7A-0D7F0D85-0D960D9A-0DB10DB3-0DBB0DBD0DC0-0DC60E01-0E300E320E330E40-0E450E810E820E840E870E880E8A0E8D0E94-0E970E99-0E9F0EA1-0EA30EA50EA70EAA0EAB0EAD-0EB00EB20EB30EBD0EC0-0EC40EDC0EDD0F000F40-0F470F49-0F6C0F88-0F8B1000-102A103F1050-1055105A-105D106110651066106E-10701075-1081108E10D0-10FA1100-1248124A-124D1250-12561258125A-125D1260-1288128A-128D1290-12B012B2-12B512B8-12BE12C012C2-12C512C8-12D612D8-13101312-13151318-135A1380-138F13A0-13F41401-166C166F-167F1681-169A16A0-16EA1700-170C170E-17111720-17311740-17511760-176C176E-17701780-17B317DC1820-18421844-18771880-18A818AA18B0-18F51900-191C1950-196D1970-19741980-19AB19C1-19C71A00-1A161A20-1A541B05-1B331B45-1B4B1B83-1BA01BAE1BAF1C00-1C231C4D-1C4F1C5A-1C771CE9-1CEC1CEE-1CF12135-21382D30-2D652D80-2D962DA0-2DA62DA8-2DAE2DB0-2DB62DB8-2DBE2DC0-2DC62DC8-2DCE2DD0-2DD62DD8-2DDE3006303C3041-3096309F30A1-30FA30FF3105-312D3131-318E31A0-31B731F0-31FF3400-4DB54E00-9FCBA000-A014A016-A48CA4D0-A4F7A500-A60BA610-A61FA62AA62BA66EA6A0-A6E5A7FB-A801A803-A805A807-A80AA80C-A822A840-A873A882-A8B3A8F2-A8F7A8FBA90A-A925A930-A946A960-A97CA984-A9B2AA00-AA28AA40-AA42AA44-AA4BAA60-AA6FAA71-AA76AA7AAA80-AAAFAAB1AAB5AAB6AAB9-AABDAAC0AAC2AADBAADCABC0-ABE2AC00-D7A3D7B0-D7C6D7CB-D7FBF900-FA2DFA30-FA6DFA70-FAD9FB1DFB1F-FB28FB2A-FB36FB38-FB3CFB3EFB40FB41FB43FB44FB46-FBB1FBD3-FD3DFD50-FD8FFD92-FDC7FDF0-FDFBFE70-FE74FE76-FEFCFF66-FF6FFF71-FF9DFFA0-FFBEFFC2-FFC7FFCA-FFCFFFD2-FFD7FFDA-FFDC",
        M: "0300-036F0483-04890591-05BD05BF05C105C205C405C505C70610-061A064B-065E067006D6-06DC06DE-06E406E706E806EA-06ED07110730-074A07A6-07B007EB-07F30816-0819081B-08230825-08270829-082D0900-0903093C093E-094E0951-0955096209630981-098309BC09BE-09C409C709C809CB-09CD09D709E209E30A01-0A030A3C0A3E-0A420A470A480A4B-0A4D0A510A700A710A750A81-0A830ABC0ABE-0AC50AC7-0AC90ACB-0ACD0AE20AE30B01-0B030B3C0B3E-0B440B470B480B4B-0B4D0B560B570B620B630B820BBE-0BC20BC6-0BC80BCA-0BCD0BD70C01-0C030C3E-0C440C46-0C480C4A-0C4D0C550C560C620C630C820C830CBC0CBE-0CC40CC6-0CC80CCA-0CCD0CD50CD60CE20CE30D020D030D3E-0D440D46-0D480D4A-0D4D0D570D620D630D820D830DCA0DCF-0DD40DD60DD8-0DDF0DF20DF30E310E34-0E3A0E47-0E4E0EB10EB4-0EB90EBB0EBC0EC8-0ECD0F180F190F350F370F390F3E0F3F0F71-0F840F860F870F90-0F970F99-0FBC0FC6102B-103E1056-1059105E-10601062-10641067-106D1071-10741082-108D108F109A-109D135F1712-17141732-1734175217531772177317B6-17D317DD180B-180D18A91920-192B1930-193B19B0-19C019C819C91A17-1A1B1A55-1A5E1A60-1A7C1A7F1B00-1B041B34-1B441B6B-1B731B80-1B821BA1-1BAA1C24-1C371CD0-1CD21CD4-1CE81CED1CF21DC0-1DE61DFD-1DFF20D0-20F02CEF-2CF12DE0-2DFF302A-302F3099309AA66F-A672A67CA67DA6F0A6F1A802A806A80BA823-A827A880A881A8B4-A8C4A8E0-A8F1A926-A92DA947-A953A980-A983A9B3-A9C0AA29-AA36AA43AA4CAA4DAA7BAAB0AAB2-AAB4AAB7AAB8AABEAABFAAC1ABE3-ABEAABECABEDFB1EFE00-FE0FFE20-FE26",
        Mn: "0300-036F0483-04870591-05BD05BF05C105C205C405C505C70610-061A064B-065E067006D6-06DC06DF-06E406E706E806EA-06ED07110730-074A07A6-07B007EB-07F30816-0819081B-08230825-08270829-082D0900-0902093C0941-0948094D0951-095509620963098109BC09C1-09C409CD09E209E30A010A020A3C0A410A420A470A480A4B-0A4D0A510A700A710A750A810A820ABC0AC1-0AC50AC70AC80ACD0AE20AE30B010B3C0B3F0B41-0B440B4D0B560B620B630B820BC00BCD0C3E-0C400C46-0C480C4A-0C4D0C550C560C620C630CBC0CBF0CC60CCC0CCD0CE20CE30D41-0D440D4D0D620D630DCA0DD2-0DD40DD60E310E34-0E3A0E47-0E4E0EB10EB4-0EB90EBB0EBC0EC8-0ECD0F180F190F350F370F390F71-0F7E0F80-0F840F860F870F90-0F970F99-0FBC0FC6102D-10301032-10371039103A103D103E10581059105E-10601071-1074108210851086108D109D135F1712-17141732-1734175217531772177317B7-17BD17C617C9-17D317DD180B-180D18A91920-19221927192819321939-193B1A171A181A561A58-1A5E1A601A621A65-1A6C1A73-1A7C1A7F1B00-1B031B341B36-1B3A1B3C1B421B6B-1B731B801B811BA2-1BA51BA81BA91C2C-1C331C361C371CD0-1CD21CD4-1CE01CE2-1CE81CED1DC0-1DE61DFD-1DFF20D0-20DC20E120E5-20F02CEF-2CF12DE0-2DFF302A-302F3099309AA66FA67CA67DA6F0A6F1A802A806A80BA825A826A8C4A8E0-A8F1A926-A92DA947-A951A980-A982A9B3A9B6-A9B9A9BCAA29-AA2EAA31AA32AA35AA36AA43AA4CAAB0AAB2-AAB4AAB7AAB8AABEAABFAAC1ABE5ABE8ABEDFB1EFE00-FE0FFE20-FE26",
        Mc: "0903093E-09400949-094C094E0982098309BE-09C009C709C809CB09CC09D70A030A3E-0A400A830ABE-0AC00AC90ACB0ACC0B020B030B3E0B400B470B480B4B0B4C0B570BBE0BBF0BC10BC20BC6-0BC80BCA-0BCC0BD70C01-0C030C41-0C440C820C830CBE0CC0-0CC40CC70CC80CCA0CCB0CD50CD60D020D030D3E-0D400D46-0D480D4A-0D4C0D570D820D830DCF-0DD10DD8-0DDF0DF20DF30F3E0F3F0F7F102B102C10311038103B103C105610571062-10641067-106D108310841087-108C108F109A-109C17B617BE-17C517C717C81923-19261929-192B193019311933-193819B0-19C019C819C91A19-1A1B1A551A571A611A631A641A6D-1A721B041B351B3B1B3D-1B411B431B441B821BA11BA61BA71BAA1C24-1C2B1C341C351CE11CF2A823A824A827A880A881A8B4-A8C3A952A953A983A9B4A9B5A9BAA9BBA9BD-A9C0AA2FAA30AA33AA34AA4DAA7BABE3ABE4ABE6ABE7ABE9ABEAABEC",
        Me: "0488048906DE20DD-20E020E2-20E4A670-A672",
        N: "0030-003900B200B300B900BC-00BE0660-066906F0-06F907C0-07C90966-096F09E6-09EF09F4-09F90A66-0A6F0AE6-0AEF0B66-0B6F0BE6-0BF20C66-0C6F0C78-0C7E0CE6-0CEF0D66-0D750E50-0E590ED0-0ED90F20-0F331040-10491090-10991369-137C16EE-16F017E0-17E917F0-17F91810-18191946-194F19D0-19DA1A80-1A891A90-1A991B50-1B591BB0-1BB91C40-1C491C50-1C5920702074-20792080-20892150-21822185-21892460-249B24EA-24FF2776-27932CFD30073021-30293038-303A3192-31953220-32293251-325F3280-328932B1-32BFA620-A629A6E6-A6EFA830-A835A8D0-A8D9A900-A909A9D0-A9D9AA50-AA59ABF0-ABF9FF10-FF19",
        Nd: "0030-00390660-066906F0-06F907C0-07C90966-096F09E6-09EF0A66-0A6F0AE6-0AEF0B66-0B6F0BE6-0BEF0C66-0C6F0CE6-0CEF0D66-0D6F0E50-0E590ED0-0ED90F20-0F291040-10491090-109917E0-17E91810-18191946-194F19D0-19DA1A80-1A891A90-1A991B50-1B591BB0-1BB91C40-1C491C50-1C59A620-A629A8D0-A8D9A900-A909A9D0-A9D9AA50-AA59ABF0-ABF9FF10-FF19",
        Nl: "16EE-16F02160-21822185-218830073021-30293038-303AA6E6-A6EF",
        No: "00B200B300B900BC-00BE09F4-09F90BF0-0BF20C78-0C7E0D70-0D750F2A-0F331369-137C17F0-17F920702074-20792080-20892150-215F21892460-249B24EA-24FF2776-27932CFD3192-31953220-32293251-325F3280-328932B1-32BFA830-A835",
        P: "0021-00230025-002A002C-002F003A003B003F0040005B-005D005F007B007D00A100AB00B700BB00BF037E0387055A-055F0589058A05BE05C005C305C605F305F40609060A060C060D061B061E061F066A-066D06D40700-070D07F7-07F90830-083E0964096509700DF40E4F0E5A0E5B0F04-0F120F3A-0F3D0F850FD0-0FD4104A-104F10FB1361-13681400166D166E169B169C16EB-16ED1735173617D4-17D617D8-17DA1800-180A1944194519DE19DF1A1E1A1F1AA0-1AA61AA8-1AAD1B5A-1B601C3B-1C3F1C7E1C7F1CD32010-20272030-20432045-20512053-205E207D207E208D208E2329232A2768-277527C527C627E6-27EF2983-299829D8-29DB29FC29FD2CF9-2CFC2CFE2CFF2E00-2E2E2E302E313001-30033008-30113014-301F3030303D30A030FBA4FEA4FFA60D-A60FA673A67EA6F2-A6F7A874-A877A8CEA8CFA8F8-A8FAA92EA92FA95FA9C1-A9CDA9DEA9DFAA5C-AA5FAADEAADFABEBFD3EFD3FFE10-FE19FE30-FE52FE54-FE61FE63FE68FE6AFE6BFF01-FF03FF05-FF0AFF0C-FF0FFF1AFF1BFF1FFF20FF3B-FF3DFF3FFF5BFF5DFF5F-FF65",
        Pd: "002D058A05BE140018062010-20152E172E1A301C303030A0FE31FE32FE58FE63FF0D",
        Ps: "0028005B007B0F3A0F3C169B201A201E2045207D208D23292768276A276C276E27702772277427C527E627E827EA27EC27EE2983298529872989298B298D298F299129932995299729D829DA29FC2E222E242E262E283008300A300C300E3010301430163018301A301DFD3EFE17FE35FE37FE39FE3BFE3DFE3FFE41FE43FE47FE59FE5BFE5DFF08FF3BFF5BFF5FFF62",
        Pe: "0029005D007D0F3B0F3D169C2046207E208E232A2769276B276D276F27712773277527C627E727E927EB27ED27EF298429862988298A298C298E2990299229942996299829D929DB29FD2E232E252E272E293009300B300D300F3011301530173019301B301E301FFD3FFE18FE36FE38FE3AFE3CFE3EFE40FE42FE44FE48FE5AFE5CFE5EFF09FF3DFF5DFF60FF63",
        Pi: "00AB2018201B201C201F20392E022E042E092E0C2E1C2E20",
        Pf: "00BB2019201D203A2E032E052E0A2E0D2E1D2E21",
        Pc: "005F203F20402054FE33FE34FE4D-FE4FFF3F",
        Po: "0021-00230025-0027002A002C002E002F003A003B003F0040005C00A100B700BF037E0387055A-055F058905C005C305C605F305F40609060A060C060D061B061E061F066A-066D06D40700-070D07F7-07F90830-083E0964096509700DF40E4F0E5A0E5B0F04-0F120F850FD0-0FD4104A-104F10FB1361-1368166D166E16EB-16ED1735173617D4-17D617D8-17DA1800-18051807-180A1944194519DE19DF1A1E1A1F1AA0-1AA61AA8-1AAD1B5A-1B601C3B-1C3F1C7E1C7F1CD3201620172020-20272030-2038203B-203E2041-20432047-205120532055-205E2CF9-2CFC2CFE2CFF2E002E012E06-2E082E0B2E0E-2E162E182E192E1B2E1E2E1F2E2A-2E2E2E302E313001-3003303D30FBA4FEA4FFA60D-A60FA673A67EA6F2-A6F7A874-A877A8CEA8CFA8F8-A8FAA92EA92FA95FA9C1-A9CDA9DEA9DFAA5C-AA5FAADEAADFABEBFE10-FE16FE19FE30FE45FE46FE49-FE4CFE50-FE52FE54-FE57FE5F-FE61FE68FE6AFE6BFF01-FF03FF05-FF07FF0AFF0CFF0EFF0FFF1AFF1BFF1FFF20FF3CFF61FF64FF65",
        S: "0024002B003C-003E005E0060007C007E00A2-00A900AC00AE-00B100B400B600B800D700F702C2-02C502D2-02DF02E5-02EB02ED02EF-02FF03750384038503F604820606-0608060B060E060F06E906FD06FE07F609F209F309FA09FB0AF10B700BF3-0BFA0C7F0CF10CF20D790E3F0F01-0F030F13-0F170F1A-0F1F0F340F360F380FBE-0FC50FC7-0FCC0FCE0FCF0FD5-0FD8109E109F13601390-139917DB194019E0-19FF1B61-1B6A1B74-1B7C1FBD1FBF-1FC11FCD-1FCF1FDD-1FDF1FED-1FEF1FFD1FFE20442052207A-207C208A-208C20A0-20B8210021012103-21062108210921142116-2118211E-2123212521272129212E213A213B2140-2144214A-214D214F2190-2328232B-23E82400-24262440-244A249C-24E92500-26CD26CF-26E126E326E8-26FF2701-27042706-2709270C-27272729-274B274D274F-27522756-275E2761-276727942798-27AF27B1-27BE27C0-27C427C7-27CA27CC27D0-27E527F0-29822999-29D729DC-29FB29FE-2B4C2B50-2B592CE5-2CEA2E80-2E992E9B-2EF32F00-2FD52FF0-2FFB300430123013302030363037303E303F309B309C319031913196-319F31C0-31E33200-321E322A-32503260-327F328A-32B032C0-32FE3300-33FF4DC0-4DFFA490-A4C6A700-A716A720A721A789A78AA828-A82BA836-A839AA77-AA79FB29FDFCFDFDFE62FE64-FE66FE69FF04FF0BFF1C-FF1EFF3EFF40FF5CFF5EFFE0-FFE6FFE8-FFEEFFFCFFFD",
        Sm: "002B003C-003E007C007E00AC00B100D700F703F60606-060820442052207A-207C208A-208C2140-2144214B2190-2194219A219B21A021A321A621AE21CE21CF21D221D421F4-22FF2308-230B23202321237C239B-23B323DC-23E125B725C125F8-25FF266F27C0-27C427C7-27CA27CC27D0-27E527F0-27FF2900-29822999-29D729DC-29FB29FE-2AFF2B30-2B442B47-2B4CFB29FE62FE64-FE66FF0BFF1C-FF1EFF5CFF5EFFE2FFE9-FFEC",
        Sc: "002400A2-00A5060B09F209F309FB0AF10BF90E3F17DB20A0-20B8A838FDFCFE69FF04FFE0FFE1FFE5FFE6",
        Sk: "005E006000A800AF00B400B802C2-02C502D2-02DF02E5-02EB02ED02EF-02FF0375038403851FBD1FBF-1FC11FCD-1FCF1FDD-1FDF1FED-1FEF1FFD1FFE309B309CA700-A716A720A721A789A78AFF3EFF40FFE3",
        So: "00A600A700A900AE00B000B60482060E060F06E906FD06FE07F609FA0B700BF3-0BF80BFA0C7F0CF10CF20D790F01-0F030F13-0F170F1A-0F1F0F340F360F380FBE-0FC50FC7-0FCC0FCE0FCF0FD5-0FD8109E109F13601390-1399194019E0-19FF1B61-1B6A1B74-1B7C210021012103-21062108210921142116-2118211E-2123212521272129212E213A213B214A214C214D214F2195-2199219C-219F21A121A221A421A521A7-21AD21AF-21CD21D021D121D321D5-21F32300-2307230C-231F2322-2328232B-237B237D-239A23B4-23DB23E2-23E82400-24262440-244A249C-24E92500-25B625B8-25C025C2-25F72600-266E2670-26CD26CF-26E126E326E8-26FF2701-27042706-2709270C-27272729-274B274D274F-27522756-275E2761-276727942798-27AF27B1-27BE2800-28FF2B00-2B2F2B452B462B50-2B592CE5-2CEA2E80-2E992E9B-2EF32F00-2FD52FF0-2FFB300430123013302030363037303E303F319031913196-319F31C0-31E33200-321E322A-32503260-327F328A-32B032C0-32FE3300-33FF4DC0-4DFFA490-A4C6A828-A82BA836A837A839AA77-AA79FDFDFFE4FFE8FFEDFFEEFFFCFFFD",
        Z: "002000A01680180E2000-200A20282029202F205F3000",
        Zs: "002000A01680180E2000-200A202F205F3000",
        Zl: "2028",
        Zp: "2029",
        C: "0000-001F007F-009F00AD03780379037F-0383038B038D03A20526-05300557055805600588058B-059005C8-05CF05EB-05EF05F5-0605061C061D0620065F06DD070E070F074B074C07B2-07BF07FB-07FF082E082F083F-08FF093A093B094F095609570973-097809800984098D098E0991099209A909B109B3-09B509BA09BB09C509C609C909CA09CF-09D609D8-09DB09DE09E409E509FC-0A000A040A0B-0A0E0A110A120A290A310A340A370A3A0A3B0A3D0A43-0A460A490A4A0A4E-0A500A52-0A580A5D0A5F-0A650A76-0A800A840A8E0A920AA90AB10AB40ABA0ABB0AC60ACA0ACE0ACF0AD1-0ADF0AE40AE50AF00AF2-0B000B040B0D0B0E0B110B120B290B310B340B3A0B3B0B450B460B490B4A0B4E-0B550B58-0B5B0B5E0B640B650B72-0B810B840B8B-0B8D0B910B96-0B980B9B0B9D0BA0-0BA20BA5-0BA70BAB-0BAD0BBA-0BBD0BC3-0BC50BC90BCE0BCF0BD1-0BD60BD8-0BE50BFB-0C000C040C0D0C110C290C340C3A-0C3C0C450C490C4E-0C540C570C5A-0C5F0C640C650C70-0C770C800C810C840C8D0C910CA90CB40CBA0CBB0CC50CC90CCE-0CD40CD7-0CDD0CDF0CE40CE50CF00CF3-0D010D040D0D0D110D290D3A-0D3C0D450D490D4E-0D560D58-0D5F0D640D650D76-0D780D800D810D840D97-0D990DB20DBC0DBE0DBF0DC7-0DC90DCB-0DCE0DD50DD70DE0-0DF10DF5-0E000E3B-0E3E0E5C-0E800E830E850E860E890E8B0E8C0E8E-0E930E980EA00EA40EA60EA80EA90EAC0EBA0EBE0EBF0EC50EC70ECE0ECF0EDA0EDB0EDE-0EFF0F480F6D-0F700F8C-0F8F0F980FBD0FCD0FD9-0FFF10C6-10CF10FD-10FF1249124E124F12571259125E125F1289128E128F12B112B612B712BF12C112C612C712D7131113161317135B-135E137D-137F139A-139F13F5-13FF169D-169F16F1-16FF170D1715-171F1737-173F1754-175F176D17711774-177F17B417B517DE17DF17EA-17EF17FA-17FF180F181A-181F1878-187F18AB-18AF18F6-18FF191D-191F192C-192F193C-193F1941-1943196E196F1975-197F19AC-19AF19CA-19CF19DB-19DD1A1C1A1D1A5F1A7D1A7E1A8A-1A8F1A9A-1A9F1AAE-1AFF1B4C-1B4F1B7D-1B7F1BAB-1BAD1BBA-1BFF1C38-1C3A1C4A-1C4C1C80-1CCF1CF3-1CFF1DE7-1DFC1F161F171F1E1F1F1F461F471F4E1F4F1F581F5A1F5C1F5E1F7E1F7F1FB51FC51FD41FD51FDC1FF01FF11FF51FFF200B-200F202A-202E2060-206F20722073208F2095-209F20B9-20CF20F1-20FF218A-218F23E9-23FF2427-243F244B-245F26CE26E226E4-26E727002705270A270B2728274C274E2753-2755275F27602795-279727B027BF27CB27CD-27CF2B4D-2B4F2B5A-2BFF2C2F2C5F2CF2-2CF82D26-2D2F2D66-2D6E2D70-2D7F2D97-2D9F2DA72DAF2DB72DBF2DC72DCF2DD72DDF2E32-2E7F2E9A2EF4-2EFF2FD6-2FEF2FFC-2FFF3040309730983100-3104312E-3130318F31B8-31BF31E4-31EF321F32FF4DB6-4DBF9FCC-9FFFA48D-A48FA4C7-A4CFA62C-A63FA660A661A674-A67BA698-A69FA6F8-A6FFA78D-A7FAA82C-A82FA83A-A83FA878-A87FA8C5-A8CDA8DA-A8DFA8FC-A8FFA954-A95EA97D-A97FA9CEA9DA-A9DDA9E0-A9FFAA37-AA3FAA4EAA4FAA5AAA5BAA7C-AA7FAAC3-AADAAAE0-ABBFABEEABEFABFA-ABFFD7A4-D7AFD7C7-D7CAD7FC-F8FFFA2EFA2FFA6EFA6FFADA-FAFFFB07-FB12FB18-FB1CFB37FB3DFB3FFB42FB45FBB2-FBD2FD40-FD4FFD90FD91FDC8-FDEFFDFEFDFFFE1A-FE1FFE27-FE2FFE53FE67FE6C-FE6FFE75FEFD-FF00FFBF-FFC1FFC8FFC9FFD0FFD1FFD8FFD9FFDD-FFDFFFE7FFEF-FFFBFFFEFFFF",
        Cc: "0000-001F007F-009F",
        Cf: "00AD0600-060306DD070F17B417B5200B-200F202A-202E2060-2064206A-206FFEFFFFF9-FFFB",
        Co: "E000-F8FF",
        Cs: "D800-DFFF",
        Cn: "03780379037F-0383038B038D03A20526-05300557055805600588058B-059005C8-05CF05EB-05EF05F5-05FF06040605061C061D0620065F070E074B074C07B2-07BF07FB-07FF082E082F083F-08FF093A093B094F095609570973-097809800984098D098E0991099209A909B109B3-09B509BA09BB09C509C609C909CA09CF-09D609D8-09DB09DE09E409E509FC-0A000A040A0B-0A0E0A110A120A290A310A340A370A3A0A3B0A3D0A43-0A460A490A4A0A4E-0A500A52-0A580A5D0A5F-0A650A76-0A800A840A8E0A920AA90AB10AB40ABA0ABB0AC60ACA0ACE0ACF0AD1-0ADF0AE40AE50AF00AF2-0B000B040B0D0B0E0B110B120B290B310B340B3A0B3B0B450B460B490B4A0B4E-0B550B58-0B5B0B5E0B640B650B72-0B810B840B8B-0B8D0B910B96-0B980B9B0B9D0BA0-0BA20BA5-0BA70BAB-0BAD0BBA-0BBD0BC3-0BC50BC90BCE0BCF0BD1-0BD60BD8-0BE50BFB-0C000C040C0D0C110C290C340C3A-0C3C0C450C490C4E-0C540C570C5A-0C5F0C640C650C70-0C770C800C810C840C8D0C910CA90CB40CBA0CBB0CC50CC90CCE-0CD40CD7-0CDD0CDF0CE40CE50CF00CF3-0D010D040D0D0D110D290D3A-0D3C0D450D490D4E-0D560D58-0D5F0D640D650D76-0D780D800D810D840D97-0D990DB20DBC0DBE0DBF0DC7-0DC90DCB-0DCE0DD50DD70DE0-0DF10DF5-0E000E3B-0E3E0E5C-0E800E830E850E860E890E8B0E8C0E8E-0E930E980EA00EA40EA60EA80EA90EAC0EBA0EBE0EBF0EC50EC70ECE0ECF0EDA0EDB0EDE-0EFF0F480F6D-0F700F8C-0F8F0F980FBD0FCD0FD9-0FFF10C6-10CF10FD-10FF1249124E124F12571259125E125F1289128E128F12B112B612B712BF12C112C612C712D7131113161317135B-135E137D-137F139A-139F13F5-13FF169D-169F16F1-16FF170D1715-171F1737-173F1754-175F176D17711774-177F17DE17DF17EA-17EF17FA-17FF180F181A-181F1878-187F18AB-18AF18F6-18FF191D-191F192C-192F193C-193F1941-1943196E196F1975-197F19AC-19AF19CA-19CF19DB-19DD1A1C1A1D1A5F1A7D1A7E1A8A-1A8F1A9A-1A9F1AAE-1AFF1B4C-1B4F1B7D-1B7F1BAB-1BAD1BBA-1BFF1C38-1C3A1C4A-1C4C1C80-1CCF1CF3-1CFF1DE7-1DFC1F161F171F1E1F1F1F461F471F4E1F4F1F581F5A1F5C1F5E1F7E1F7F1FB51FC51FD41FD51FDC1FF01FF11FF51FFF2065-206920722073208F2095-209F20B9-20CF20F1-20FF218A-218F23E9-23FF2427-243F244B-245F26CE26E226E4-26E727002705270A270B2728274C274E2753-2755275F27602795-279727B027BF27CB27CD-27CF2B4D-2B4F2B5A-2BFF2C2F2C5F2CF2-2CF82D26-2D2F2D66-2D6E2D70-2D7F2D97-2D9F2DA72DAF2DB72DBF2DC72DCF2DD72DDF2E32-2E7F2E9A2EF4-2EFF2FD6-2FEF2FFC-2FFF3040309730983100-3104312E-3130318F31B8-31BF31E4-31EF321F32FF4DB6-4DBF9FCC-9FFFA48D-A48FA4C7-A4CFA62C-A63FA660A661A674-A67BA698-A69FA6F8-A6FFA78D-A7FAA82C-A82FA83A-A83FA878-A87FA8C5-A8CDA8DA-A8DFA8FC-A8FFA954-A95EA97D-A97FA9CEA9DA-A9DDA9E0-A9FFAA37-AA3FAA4EAA4FAA5AAA5BAA7C-AA7FAAC3-AADAAAE0-ABBFABEEABEFABFA-ABFFD7A4-D7AFD7C7-D7CAD7FC-D7FFFA2EFA2FFA6EFA6FFADA-FAFFFB07-FB12FB18-FB1CFB37FB3DFB3FFB42FB45FBB2-FBD2FD40-FD4FFD90FD91FDC8-FDEFFDFEFDFFFE1A-FE1FFE27-FE2FFE53FE67FE6C-FE6FFE75FEFDFEFEFF00FFBF-FFC1FFC8FFC9FFD0FFD1FFD8FFD9FFDD-FFDFFFE7FFEF-FFF8FFFEFFFF"
    });
    function addUnicodePackage(pack) {
        var codePoint = /\w{4}/g;
        for (var name in pack)
            exports.packages[name] = pack[name].replace(codePoint, "\\u$&");
    }
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
define('mode/Mode',["require", "exports", "../Tokenizer", "./TextHighlightRules", "./Behaviour", "../unicode", "../lib/lang", "../TokenIterator", "../Range"], function (require, exports, Tokenizer_1, TextHighlightRules_1, Behaviour_1, unicode_1, lang_1, TokenIterator_1, Range_1) {
    /**
     * @class Mode
     */
    var Mode = (function () {
        function Mode() {
            this.HighlightRules = TextHighlightRules_1.default;
            this.$behaviour = new Behaviour_1.default();
            this.tokenRe = new RegExp("^["
                + unicode_1.packages.L
                + unicode_1.packages.Mn + unicode_1.packages.Mc
                + unicode_1.packages.Nd
                + unicode_1.packages.Pc + "\\$_]+", "g");
            this.nonTokenRe = new RegExp("^(?:[^"
                + unicode_1.packages.L
                + unicode_1.packages.Mn + unicode_1.packages.Mc
                + unicode_1.packages.Nd
                + unicode_1.packages.Pc + "\\$_]|\\s])+", "g");
            this.lineCommentStart = "";
            this.blockComment = "";
            this.$id = "ace/mode/text";
        }
        Mode.prototype.getTokenizer = function () {
            if (!this.$tokenizer) {
                this.$highlightRules = this.$highlightRules || new this.HighlightRules();
                this.$tokenizer = new Tokenizer_1.default(this.$highlightRules.getRules());
            }
            return this.$tokenizer;
        };
        Mode.prototype.toggleCommentLines = function (state, session, startRow, endRow) {
            var doc = session.doc;
            var ignoreBlankLines = true;
            var shouldRemove = true;
            var minIndent = Infinity;
            var tabSize = session.getTabSize();
            var insertAtTabStop = false;
            if (!this.lineCommentStart) {
                if (!this.blockComment)
                    return false;
                var lineCommentStart = this.blockComment.start;
                var lineCommentEnd = this.blockComment.end;
                var regexpStart = new RegExp("^(\\s*)(?:" + lang_1.escapeRegExp(lineCommentStart) + ")");
                var regexpEnd = new RegExp("(?:" + lang_1.escapeRegExp(lineCommentEnd) + ")\\s*$");
                var comment = function (line, i) {
                    if (testRemove(line, i))
                        return;
                    if (!ignoreBlankLines || /\S/.test(line)) {
                        doc.insertInLine({ row: i, column: line.length }, lineCommentEnd);
                        doc.insertInLine({ row: i, column: minIndent }, lineCommentStart);
                    }
                };
                var uncomment = function (line, i) {
                    var m;
                    if (m = line.match(regexpEnd))
                        doc.removeInLine(i, line.length - m[0].length, line.length);
                    if (m = line.match(regexpStart))
                        doc.removeInLine(i, m[1].length, m[0].length);
                };
                var testRemove = function (line, row) {
                    if (regexpStart.test(line))
                        return true;
                    var tokens = session.getTokens(row);
                    for (var i = 0; i < tokens.length; i++) {
                        if (tokens[i].type === 'comment')
                            return true;
                    }
                };
            }
            else {
                if (Array.isArray(this.lineCommentStart)) {
                    var regexpStartString = this.lineCommentStart.map(lang_1.escapeRegExp).join("|");
                    var lineCommentStart = this.lineCommentStart[0];
                }
                else {
                    var regexpStartString = lang_1.escapeRegExp(this.lineCommentStart);
                    var lineCommentStart = this.lineCommentStart;
                }
                regexpStart = new RegExp("^(\\s*)(?:" + regexpStartString + ") ?");
                insertAtTabStop = session.getUseSoftTabs();
                var uncomment = function (line, i) {
                    var m = line.match(regexpStart);
                    if (!m)
                        return;
                    var start = m[1].length, end = m[0].length;
                    if (!shouldInsertSpace(line, start, end) && m[0][end - 1] == " ")
                        end--;
                    doc.removeInLine(i, start, end);
                };
                var commentWithSpace = lineCommentStart + " ";
                var comment = function (line, i) {
                    if (!ignoreBlankLines || /\S/.test(line)) {
                        if (shouldInsertSpace(line, minIndent, minIndent))
                            doc.insertInLine({ row: i, column: minIndent }, commentWithSpace);
                        else
                            doc.insertInLine({ row: i, column: minIndent }, lineCommentStart);
                    }
                };
                var testRemove = function (line, i) {
                    return regexpStart.test(line);
                };
                var shouldInsertSpace = function (line, before, after) {
                    var spaces = 0;
                    while (before-- && line.charAt(before) == " ")
                        spaces++;
                    if (spaces % tabSize != 0)
                        return false;
                    var spaces = 0;
                    while (line.charAt(after++) == " ")
                        spaces++;
                    if (tabSize > 2)
                        return spaces % tabSize != tabSize - 1;
                    else
                        return spaces % tabSize == 0;
                    return true;
                };
            }
            function iter(fun) {
                for (var i = startRow; i <= endRow; i++)
                    fun(doc.getLine(i), i);
            }
            var minEmptyLength = Infinity;
            iter(function (line, row) {
                var indent = line.search(/\S/);
                if (indent !== -1) {
                    if (indent < minIndent)
                        minIndent = indent;
                    if (shouldRemove && !testRemove(line, row))
                        shouldRemove = false;
                }
                else if (minEmptyLength > line.length) {
                    minEmptyLength = line.length;
                }
            });
            if (minIndent == Infinity) {
                minIndent = minEmptyLength;
                ignoreBlankLines = false;
                shouldRemove = false;
            }
            if (insertAtTabStop && minIndent % tabSize != 0)
                minIndent = Math.floor(minIndent / tabSize) * tabSize;
            iter(shouldRemove ? uncomment : comment);
        };
        Mode.prototype.toggleBlockComment = function (state, session, range, cursor) {
            var comment = this.blockComment;
            if (!comment)
                return;
            if (!comment.start && comment[0])
                comment = comment[0];
            var iterator = new TokenIterator_1.default(session, cursor.row, cursor.column);
            var token = iterator.getCurrentToken();
            var selection = session.getSelection();
            var initialRange = selection.toOrientedRange();
            var startRow, colDiff;
            if (token && /comment/.test(token.type)) {
                var startRange, endRange;
                while (token && /comment/.test(token.type)) {
                    var i = token.value.indexOf(comment.start);
                    if (i != -1) {
                        var row = iterator.getCurrentTokenRow();
                        var column = iterator.getCurrentTokenColumn() + i;
                        startRange = new Range_1.default(row, column, row, column + comment.start.length);
                        break;
                    }
                    token = iterator.stepBackward();
                }
                var iterator = new TokenIterator_1.default(session, cursor.row, cursor.column);
                var token = iterator.getCurrentToken();
                while (token && /comment/.test(token.type)) {
                    var i = token.value.indexOf(comment.end);
                    if (i != -1) {
                        var row = iterator.getCurrentTokenRow();
                        var column = iterator.getCurrentTokenColumn() + i;
                        endRange = new Range_1.default(row, column, row, column + comment.end.length);
                        break;
                    }
                    token = iterator.stepForward();
                }
                if (endRange)
                    session.remove(endRange);
                if (startRange) {
                    session.remove(startRange);
                    startRow = startRange.start.row;
                    colDiff = -comment.start.length;
                }
            }
            else {
                colDiff = comment.start.length;
                startRow = range.start.row;
                session.insert(range.end, comment.end);
                session.insert(range.start, comment.start);
            }
            // todo: selection should have ended up in the right place automatically!
            if (initialRange.start.row == startRow)
                initialRange.start.column += colDiff;
            if (initialRange.end.row == startRow)
                initialRange.end.column += colDiff;
            session.getSelection().fromOrientedRange(initialRange);
        };
        Mode.prototype.getNextLineIndent = function (state, line, tab) {
            return this.$getIndent(line);
        };
        Mode.prototype.checkOutdent = function (state, line, text) {
            return false;
        };
        Mode.prototype.autoOutdent = function (state, session, row) {
            return 0;
        };
        Mode.prototype.$getIndent = function (line) {
            return line.match(/^\s*/)[0];
        };
        Mode.prototype.createWorker = function (session) {
            return null;
        };
        Mode.prototype.createModeDelegates = function (mapping) {
            this.$embeds = [];
            this.$modes = {};
            for (var p in mapping) {
                if (mapping[p]) {
                    this.$embeds.push(p);
                    this.$modes[p] = new mapping[p]();
                }
            }
            var delegations = ['toggleBlockComment', 'toggleCommentLines', 'getNextLineIndent',
                'checkOutdent', 'autoOutdent', 'transformAction', 'getCompletions'];
            for (var k = 0; k < delegations.length; k++) {
                (function (scope) {
                    var functionName = delegations[k];
                    var defaultHandler = scope[functionName];
                    scope[delegations[k]] = function () {
                        return this.$delegator(functionName, arguments, defaultHandler);
                    };
                }(this));
            }
        };
        Mode.prototype.$delegator = function (method, args, defaultHandler) {
            var state = args[0];
            if (typeof state != "string")
                state = state[0];
            for (var i = 0; i < this.$embeds.length; i++) {
                if (!this.$modes[this.$embeds[i]])
                    continue;
                var split = state.split(this.$embeds[i]);
                if (!split[0] && split[1]) {
                    args[0] = split[1];
                    var mode = this.$modes[this.$embeds[i]];
                    return mode[method].apply(mode, args);
                }
            }
            var ret = defaultHandler.apply(this, args);
            return defaultHandler ? ret : undefined;
        };
        Mode.prototype.transformAction = function (state, action, editor, session, param) {
            if (this.$behaviour) {
                var behaviours = this.$behaviour.getBehaviours();
                for (var key in behaviours) {
                    if (behaviours[key][action]) {
                        var ret = behaviours[key][action].apply(this, arguments);
                        if (ret) {
                            return ret;
                        }
                    }
                }
            }
        };
        Mode.prototype.getKeywords = function (append) {
            // this is for autocompletion to pick up regexp'ed keywords
            if (!this.completionKeywords) {
                var rules = this.$tokenizer.states;
                var completionKeywords = [];
                for (var rule in rules) {
                    var ruleItr = rules[rule];
                    for (var r = 0, l = ruleItr.length; r < l; r++) {
                        if (typeof ruleItr[r].token === "string") {
                            if (/keyword|support|storage/.test(ruleItr[r].token))
                                completionKeywords.push(ruleItr[r].regex);
                        }
                        else if (typeof ruleItr[r].token === "object") {
                            for (var a = 0, aLength = ruleItr[r].token.length; a < aLength; a++) {
                                if (/keyword|support|storage/.test(ruleItr[r].token[a])) {
                                    // drop surrounding parens
                                    var rule = ruleItr[r].regex.match(/\(.+?\)/g)[a];
                                    completionKeywords.push(rule.substr(1, rule.length - 2));
                                }
                            }
                        }
                    }
                }
                this.completionKeywords = completionKeywords;
            }
            // this is for highlighting embed rules, like HAML/Ruby or Obj-C/C
            if (!append) {
                return this.$keywordList;
            }
            return completionKeywords.concat(this.$keywordList || []);
        };
        Mode.prototype.$createKeywordList = function () {
            if (!this.$highlightRules)
                this.getTokenizer();
            return this.$keywordList = this.$highlightRules.$keywordList || [];
        };
        Mode.prototype.getCompletions = function (state, session, pos, prefix) {
            var keywords = this.$keywordList || this.$createKeywordList();
            return keywords.map(function (word) {
                return {
                    name: word,
                    value: word,
                    score: 0,
                    meta: "keyword"
                };
            });
        };
        return Mode;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Mode;
});

define('lib/asserts',["require", "exports"], function (require, exports) {
    exports.ENABLE_ASSERTS = true;
    var AssertionError = (function () {
        function AssertionError(message, args) {
            this.name = 'AssertionError';
            this.message = message;
        }
        return AssertionError;
    })();
    exports.AssertionError = AssertionError;
    function doAssertFailure(defaultMessage, defaultArgs, givenMessage, givenArgs) {
        var message = 'Assertion failed';
        if (givenMessage) {
            message += ': ' + givenMessage;
            var args = givenArgs;
        }
        else if (defaultMessage) {
            message += ': ' + defaultMessage;
            args = defaultArgs;
        }
        // The '' + works around an Opera 10 bug in the unit tests. Without it,
        // a stack trace is added to var message above. With this, a stack trace is
        // not added until this line (it causes the extra garbage to be added after
        // the assertion message instead of in the middle of it).
        throw new AssertionError('' + message, args || []);
    }
    function assert(condition, message, args) {
        if (exports.ENABLE_ASSERTS && !condition) {
            doAssertFailure('', null, message, Array.prototype.slice.call(arguments, 2));
        }
        return condition;
    }
    exports.assert = assert;
    ;
});

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('Anchor',["require", "exports", './lib/event_emitter', './lib/asserts'], function (require, exports, event_emitter_1, asserts_1) {
    /**
     *
     * Defines the floating pointer in the document. Whenever text is inserted or deleted before the cursor, the position of the cursor is updated.
     *
     * @class Anchor
     *
     * Creates a new `Anchor` and associates it with a document.
     *
     * @param {EditorDocument} doc The document to associate with the anchor
     * @param {Number} row The starting row position
     * @param {Number} column The starting column position
     *
     * @constructor
     **/
    var Anchor = (function (_super) {
        __extends(Anchor, _super);
        function Anchor(doc, row, column) {
            _super.call(this);
            asserts_1.assert(typeof row === 'number', "row must be a number");
            asserts_1.assert(typeof column === 'number', "column must be a number");
            this.$onChange = this.onChange.bind(this);
            this.attach(doc);
            this.setPosition(row, column);
            this.$insertRight = false;
        }
        /**
         * Returns an object identifying the `row` and `column` position of the current anchor.
         * @returns {Object}
         **/
        Anchor.prototype.getPosition = function () {
            return this.$clipPositionToDocument(this.row, this.column);
        };
        /**
         *
         * Returns the current document.
         * @returns {EditorDocument}
         **/
        Anchor.prototype.getDocument = function () {
            return this.document;
        };
        /**
         * Fires whenever the anchor position changes.
         *
         * Both of these objects have a `row` and `column` property corresponding to the position.
         *
         * Events that can trigger this function include [[Anchor.setPosition `setPosition()`]].
         *
         * @event change
         * @param {Object} e  An object containing information about the anchor position. It has two properties:
         *  - `old`: An object describing the old Anchor position
         *  - `value`: An object describing the new Anchor position
         *
         **/
        Anchor.prototype.onChange = function (e, doc) {
            var delta = e.data;
            var range = delta.range;
            if (range.start.row == range.end.row && range.start.row != this.row)
                return;
            if (range.start.row > this.row)
                return;
            if (range.start.row == this.row && range.start.column > this.column)
                return;
            var row = this.row;
            var column = this.column;
            var start = range.start;
            var end = range.end;
            if (delta.action === "insertText") {
                if (start.row === row && start.column <= column) {
                    if (start.column === column && this.$insertRight) {
                    }
                    else if (start.row === end.row) {
                        column += end.column - start.column;
                    }
                    else {
                        column -= start.column;
                        row += end.row - start.row;
                    }
                }
                else if (start.row !== end.row && start.row < row) {
                    row += end.row - start.row;
                }
            }
            else if (delta.action === "insertLines") {
                if (start.row === row && column === 0 && this.$insertRight) {
                }
                else if (start.row <= row) {
                    row += end.row - start.row;
                }
            }
            else if (delta.action === "removeText") {
                if (start.row === row && start.column < column) {
                    if (end.column >= column)
                        column = start.column;
                    else
                        column = Math.max(0, column - (end.column - start.column));
                }
                else if (start.row !== end.row && start.row < row) {
                    if (end.row === row)
                        column = Math.max(0, column - end.column) + start.column;
                    row -= (end.row - start.row);
                }
                else if (end.row === row) {
                    row -= end.row - start.row;
                    column = Math.max(0, column - end.column) + start.column;
                }
            }
            else if (delta.action == "removeLines") {
                if (start.row <= row) {
                    if (end.row <= row)
                        row -= end.row - start.row;
                    else {
                        row = start.row;
                        column = 0;
                    }
                }
            }
            this.setPosition(row, column, true);
        };
        /**
         * Sets the anchor position to the specified row and column. If `noClip` is `true`, the position is not clipped.
         * @param {Number} row The row index to move the anchor to
         * @param {Number} column The column index to move the anchor to
         * @param {Boolean} noClip Identifies if you want the position to be clipped
         *
         **/
        Anchor.prototype.setPosition = function (row, column, noClip) {
            var pos;
            if (noClip) {
                pos = {
                    row: row,
                    column: column
                };
            }
            else {
                pos = this.$clipPositionToDocument(row, column);
            }
            if (this.row === pos.row && this.column === pos.column) {
                return;
            }
            var old = {
                row: this.row,
                column: this.column
            };
            this.row = pos.row;
            this.column = pos.column;
            this._signal("change", {
                old: old,
                value: pos
            });
        };
        /**
         * When called, the `'change'` event listener is removed.
         *
         **/
        Anchor.prototype.detach = function () {
            this.document.off("change", this.$onChange);
        };
        Anchor.prototype.attach = function (doc) {
            this.document = doc || this.document;
            this.document.on("change", this.$onChange);
        };
        /**
         * Clips the anchor position to the specified row and column.
         * @param {Number} row The row index to clip the anchor to
         * @param {Number} column The column index to clip the anchor to
         *
         **/
        Anchor.prototype.$clipPositionToDocument = function (row, column) {
            var pos = { row: 0, column: 0 };
            if (row >= this.document.getLength()) {
                pos.row = Math.max(0, this.document.getLength() - 1);
                pos.column = this.document.getLine(pos.row).length;
            }
            else if (row < 0) {
                pos.row = 0;
                pos.column = 0;
            }
            else {
                pos.row = row;
                pos.column = Math.min(this.document.getLine(pos.row).length, Math.max(0, column));
            }
            if (column < 0)
                pos.column = 0;
            return pos;
        };
        return Anchor;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Anchor;
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('EditorDocument',["require", "exports", './lib/event_emitter', './Range', './Anchor'], function (require, exports, event_emitter_1, Range_1, Anchor_1) {
    var $split = (function () {
        function foo(text) {
            return text.replace(/\r\n|\r/g, "\n").split("\n");
        }
        function bar(text) {
            return text.split(/\r\n|\r|\n/);
        }
        if ("aaa".split(/a/).length === 0) {
            return foo;
        }
        else {
            return bar;
        }
    })();
    function $clipPosition(doc, position) {
        var length = doc.getLength();
        if (position.row >= length) {
            position.row = Math.max(0, length - 1);
            position.column = doc.getLine(length - 1).length;
        }
        else if (position.row < 0) {
            position.row = 0;
        }
        return position;
    }
    var EditorDocument = (function (_super) {
        __extends(EditorDocument, _super);
        function EditorDocument(text) {
            _super.call(this);
            this.$lines = [];
            this.$autoNewLine = "";
            this.$newLineMode = "auto";
            // There has to be one line at least in the document. If you pass an empty
            // string to the insert function, nothing will happen. Workaround.
            if (text.length === 0) {
                this.$lines = [""];
            }
            else if (Array.isArray(text)) {
                this._insertLines(0, text);
            }
            else {
                this.insert({ row: 0, column: 0 }, text);
            }
        }
        /**
         * Replaces all the lines in the current `EditorDocument` with the value of `text`.
         * @method setValue
         * @param {string} text The text to use
         * @return {void}
         */
        EditorDocument.prototype.setValue = function (text) {
            var len = this.getLength();
            this.remove(new Range_1.default(0, 0, len, this.getLine(len - 1).length));
            this.insert({ row: 0, column: 0 }, text);
        };
        /**
         * Returns all the lines in the document as a single string, joined by the new line character.
         * @method getValue
         * @return {string}
         */
        EditorDocument.prototype.getValue = function () {
            return this.getAllLines().join(this.getNewLineCharacter());
        };
        /**
         * Creates a new `Anchor` to define a floating point in the document.
         * @method createAnchor
         * @param {number} row The row number to use
         * @param {number} column The column number to use
         * @return {Anchor}
         *
         */
        EditorDocument.prototype.createAnchor = function (row, column) {
            return new Anchor_1.default(this, row, column);
        };
        /**
         * Splits a string of text on any newline (`\n`) or carriage-return ('\r') characters.
         *
         * @method $split
         * @param {string} text The text to work with
         */
        EditorDocument.prototype.$detectNewLine = function (text) {
            var match = text.match(/^.*?(\r\n|\r|\n)/m);
            this.$autoNewLine = match ? match[1] : "\n";
            this._signal("changeNewLineMode");
        };
        /**
        * Returns the newline character that's being used, depending on the value of `newLineMode`.
        * @method getNewLineCharacter
        * @returns {String}
        *  If `newLineMode == windows`, `\r\n` is returned.
        *  If `newLineMode == unix`, `\n` is returned.
        *  If `newLineMode == auto`, the value of `autoNewLine` is returned.
        *
        **/
        EditorDocument.prototype.getNewLineCharacter = function () {
            switch (this.$newLineMode) {
                case "windows":
                    return "\r\n";
                case "unix":
                    return "\n";
                default:
                    return this.$autoNewLine || "\n";
            }
        };
        /**
         * Sets the new line mode.
         * @method setNewLineMode
         * @param {String} newLineMode [The newline mode to use; can be either `windows`, `unix`, or `auto`]{: #EditorDocument.setNewLineMode.param}
         * @return {void}
         */
        EditorDocument.prototype.setNewLineMode = function (newLineMode) {
            if (this.$newLineMode === newLineMode)
                return;
            this.$newLineMode = newLineMode;
            this._signal("changeNewLineMode");
        };
        /**
         * Returns the type of newlines being used; either `windows`, `unix`, or `auto`
         * @method getNewLineMode
         * @return {string}
         */
        EditorDocument.prototype.getNewLineMode = function () {
            return this.$newLineMode;
        };
        /**
         * Returns `true` if `text` is a newline character (either `\r\n`, `\r`, or `\n`).
         * @method isNewLine
         * @param {string} text The text to check
         * @return {boolean}
         */
        EditorDocument.prototype.isNewLine = function (text) {
            return (text == "\r\n" || text == "\r" || text == "\n");
        };
        /**
         * Returns a verbatim copy of the given line as it is in the document
         * @param {Number} row The row index to retrieve
         * @return {string}
         */
        EditorDocument.prototype.getLine = function (row) {
            return this.$lines[row] || "";
        };
        /**
        * Returns an array of strings of the rows between `firstRow` and `lastRow`. This function is inclusive of `lastRow`.
        * @param {Number} firstRow The first row index to retrieve
        * @param {Number} lastRow The final row index to retrieve
        *
        **/
        EditorDocument.prototype.getLines = function (firstRow, lastRow) {
            return this.$lines.slice(firstRow, lastRow + 1);
        };
        /**
        * Returns all lines in the document as string array.
        **/
        EditorDocument.prototype.getAllLines = function () {
            return this.getLines(0, this.getLength());
        };
        /**
        * Returns the number of rows in the document.
        **/
        EditorDocument.prototype.getLength = function () {
            return this.$lines.length;
        };
        /**
         * Given a range within the document, returns all the text within that range as a single string.
         * @param {Range} range The range to work with
         *
         */
        EditorDocument.prototype.getTextRange = function (range) {
            if (range.start.row == range.end.row) {
                return this.getLine(range.start.row).substring(range.start.column, range.end.column);
            }
            var lines = this.getLines(range.start.row, range.end.row);
            lines[0] = (lines[0] || "").substring(range.start.column);
            var l = lines.length - 1;
            if (range.end.row - range.start.row == l) {
                lines[l] = lines[l].substring(0, range.end.column);
            }
            return lines.join(this.getNewLineCharacter());
        };
        /**
        * Inserts a block of `text` at the indicated `position`.
        * @param {Object} position The position to start inserting at; it's an object that looks like `{ row: row, column: column}`
        * @param {string} text A chunk of text to insert
        * @returns {Object} The position ({row, column}) of the last line of `text`. If the length of `text` is 0, this function simply returns `position`.
        *
        **/
        EditorDocument.prototype.insert = function (position, text) {
            if (!text || text.length === 0)
                return position;
            position = $clipPosition(this, position);
            // only detect new lines if the document has no line break yet
            if (this.getLength() <= 1) {
                this.$detectNewLine(text);
            }
            var lines = $split(text);
            var firstLine = lines.splice(0, 1)[0];
            var lastLine = lines.length == 0 ? null : lines.splice(lines.length - 1, 1)[0];
            position = this.insertInLine(position, firstLine);
            if (lastLine !== null) {
                position = this.insertNewLine(position); // terminate first line
                position = this._insertLines(position.row, lines);
                position = this.insertInLine(position, lastLine || "");
            }
            return position;
        };
        /**
         * Fires whenever the document changes.
         *
         * Several methods trigger different `"change"` events. Below is a list of each action type, followed by each property that's also available:
         *
         *  * `"insertLines"` (emitted by [[EditorDocument.insertLines]])
         *    * `range`: the [[Range]] of the change within the document
         *    * `lines`: the lines in the document that are changing
         *  * `"insertText"` (emitted by [[EditorDocument.insertNewLine]])
         *    * `range`: the [[Range]] of the change within the document
         *    * `text`: the text that's being added
         *  * `"removeLines"` (emitted by [[EditorDocument.insertLines]])
         *    * `range`: the [[Range]] of the change within the document
         *    * `lines`: the lines in the document that were removed
         *    * `nl`: the new line character (as defined by [[EditorDocument.getNewLineCharacter]])
         *  * `"removeText"` (emitted by [[EditorDocument.removeInLine]] and [[EditorDocument.removeNewLine]])
         *    * `range`: the [[Range]] of the change within the document
         *    * `text`: the text that's being removed
         *
         * @event change
         * @param {Object} e Contains at least one property called `"action"`. `"action"` indicates the action that triggered the change. Each action also has a set of additional properties.
         *
         **/
        /**
        * Inserts the elements in `lines` into the document, starting at the row index given by `row`. This method also triggers the `'change'` event.
        * @param {Number} row The index of the row to insert at
        * @param {Array} lines An array of strings
        * @returns {Object} Contains the final row and column, like this:
        *   ```
        *   {row: endRow, column: 0}
        *   ```
        *   If `lines` is empty, this function returns an object containing the current row, and column, like this:
        *   ```
        *   {row: row, column: 0}
        *   ```
        *
        **/
        EditorDocument.prototype.insertLines = function (row, lines) {
            if (row >= this.getLength())
                return this.insert({ row: row, column: 0 }, "\n" + lines.join("\n"));
            return this._insertLines(Math.max(row, 0), lines);
        };
        EditorDocument.prototype._insertLines = function (row, lines) {
            if (lines.length == 0)
                return { row: row, column: 0 };
            // apply doesn't work for big arrays (smallest threshold is on safari 0xFFFF)
            // to circumvent that we have to break huge inserts into smaller chunks here
            while (lines.length > 0xF000) {
                var end = this._insertLines(row, lines.slice(0, 0xF000));
                lines = lines.slice(0xF000);
                row = end.row;
            }
            var args = [row, 0];
            args.push.apply(args, lines);
            this.$lines.splice.apply(this.$lines, args);
            var range = new Range_1.default(row, 0, row + lines.length, 0);
            var delta = {
                action: "insertLines",
                range: range,
                lines: lines
            };
            this._signal("change", { data: delta });
            return range.end;
        };
        /**
        * Inserts a new line into the document at the current row's `position`. This method also triggers the `'change'` event.
        * @param {Object} position The position to insert at
        * @returns {Object} Returns an object containing the final row and column, like this:<br/>
        *    ```
        *    {row: endRow, column: 0}
        *    ```
        *
        **/
        EditorDocument.prototype.insertNewLine = function (position) {
            position = $clipPosition(this, position);
            var line = this.$lines[position.row] || "";
            this.$lines[position.row] = line.substring(0, position.column);
            this.$lines.splice(position.row + 1, 0, line.substring(position.column, line.length));
            var end = {
                row: position.row + 1,
                column: 0
            };
            var delta = {
                action: "insertText",
                range: Range_1.default.fromPoints(position, end),
                text: this.getNewLineCharacter()
            };
            this._signal("change", { data: delta });
            return end;
        };
        /**
        * Inserts `text` into the `position` at the current row. This method also triggers the `'change'` event.
        * @param {Object} position The position to insert at.
        * @param {String} text A chunk of text
        * @returns {Object} Returns an object containing the final row and column.
        **/
        EditorDocument.prototype.insertInLine = function (position, text) {
            if (text.length == 0)
                return position;
            var line = this.$lines[position.row] || "";
            this.$lines[position.row] = line.substring(0, position.column) + text + line.substring(position.column);
            var end = {
                row: position.row,
                column: position.column + text.length
            };
            var delta = { action: "insertText", range: Range_1.default.fromPoints(position, end), text: text };
            this._signal("change", { data: delta });
            return end;
        };
        /**
        * Removes the `range` from the document.
        * @param {Range} range A specified Range to remove
        * @returns {Object} Returns the new `start` property of the range, which contains `startRow` and `startColumn`. If `range` is empty, this function returns the unmodified value of `range.start`.
        *
        **/
        EditorDocument.prototype.remove = function (range) {
            if (!(range instanceof Range_1.default))
                range = Range_1.default.fromPoints(range.start, range.end);
            // clip to document
            range.start = $clipPosition(this, range.start);
            range.end = $clipPosition(this, range.end);
            if (range.isEmpty())
                return range.start;
            var firstRow = range.start.row;
            var lastRow = range.end.row;
            if (range.isMultiLine()) {
                var firstFullRow = range.start.column == 0 ? firstRow : firstRow + 1;
                var lastFullRow = lastRow - 1;
                if (range.end.column > 0)
                    this.removeInLine(lastRow, 0, range.end.column);
                if (lastFullRow >= firstFullRow)
                    this._removeLines(firstFullRow, lastFullRow);
                if (firstFullRow != firstRow) {
                    this.removeInLine(firstRow, range.start.column, this.getLine(firstRow).length);
                    this.removeNewLine(range.start.row);
                }
            }
            else {
                this.removeInLine(firstRow, range.start.column, range.end.column);
            }
            return range.start;
        };
        /**
        * Removes the specified columns from the `row`. This method also triggers the `'change'` event.
        * @param {Number} row The row to remove from
        * @param {Number} startColumn The column to start removing at
        * @param {Number} endColumn The column to stop removing at
        * @returns {Object} Returns an object containing `startRow` and `startColumn`, indicating the new row and column values.<br/>If `startColumn` is equal to `endColumn`, this function returns nothing.
        *
        **/
        EditorDocument.prototype.removeInLine = function (row, startColumn, endColumn) {
            if (startColumn === endColumn)
                return;
            var range = new Range_1.default(row, startColumn, row, endColumn);
            var line = this.getLine(row);
            var removed = line.substring(startColumn, endColumn);
            var newLine = line.substring(0, startColumn) + line.substring(endColumn, line.length);
            this.$lines.splice(row, 1, newLine);
            var delta = {
                action: "removeText",
                range: range,
                text: removed
            };
            this._signal("change", { data: delta });
            return range.start;
        };
        /**
        * Removes a range of full lines. This method also triggers the `'change'` event.
        * @param {Number} firstRow The first row to be removed
        * @param {Number} lastRow The last row to be removed
        * @returns {[String]} Returns all the removed lines.
        *
        **/
        EditorDocument.prototype.removeLines = function (firstRow, lastRow) {
            if (firstRow < 0 || lastRow >= this.getLength())
                return this.remove(new Range_1.default(firstRow, 0, lastRow + 1, 0));
            return this._removeLines(firstRow, lastRow);
        };
        EditorDocument.prototype._removeLines = function (firstRow, lastRow) {
            var range = new Range_1.default(firstRow, 0, lastRow + 1, 0);
            var removed = this.$lines.splice(firstRow, lastRow - firstRow + 1);
            var delta = {
                action: "removeLines",
                range: range,
                nl: this.getNewLineCharacter(),
                lines: removed
            };
            this._signal("change", { data: delta });
            return removed;
        };
        /**
        * Removes the new line between `row` and the row immediately following it. This method also triggers the `'change'` event.
        * @param {Number} row The row to check
        *
        **/
        EditorDocument.prototype.removeNewLine = function (row) {
            var firstLine = this.getLine(row);
            var secondLine = this.getLine(row + 1);
            var range = new Range_1.default(row, firstLine.length, row + 1, 0);
            var line = firstLine + secondLine;
            this.$lines.splice(row, 2, line);
            var delta = {
                action: "removeText",
                range: range,
                text: this.getNewLineCharacter()
            };
            this._signal("change", { data: delta });
        };
        /**
        * Replaces a range in the document with the new `text`.
        * @param {Range} range A specified Range to replace
        * @param {String} text The new text to use as a replacement
        * @returns {Object} Returns an object containing the final row and column, like this:
        *     {row: endRow, column: 0}
        * If the text and range are empty, this function returns an object containing the current `range.start` value.
        * If the text is the exact same as what currently exists, this function returns an object containing the current `range.end` value.
        *
        **/
        EditorDocument.prototype.replace = function (range, text) {
            if (text.length == 0 && range.isEmpty())
                return range.start;
            // Shortcut: If the text we want to insert is the same as it is already
            // in the document, we don't have to replace anything.
            if (text == this.getTextRange(range))
                return range.end;
            this.remove(range);
            if (text) {
                var end = this.insert(range.start, text);
            }
            else {
                end = range.start;
            }
            return end;
        };
        /**
        * Applies all the changes previously accumulated. These can be either `'includeText'`, `'insertLines'`, `'removeText'`, and `'removeLines'`.
        **/
        EditorDocument.prototype.applyDeltas = function (deltas) {
            for (var i = 0; i < deltas.length; i++) {
                var delta = deltas[i];
                var range = Range_1.default.fromPoints(delta.range.start, delta.range.end);
                if (delta.action == "insertLines")
                    this.insertLines(range.start.row, delta.lines);
                else if (delta.action == "insertText")
                    this.insert(range.start, delta.text);
                else if (delta.action == "removeLines")
                    this._removeLines(range.start.row, range.end.row - 1);
                else if (delta.action == "removeText")
                    this.remove(range);
            }
        };
        /**
        * Reverts any changes previously applied. These can be either `'includeText'`, `'insertLines'`, `'removeText'`, and `'removeLines'`.
        **/
        EditorDocument.prototype.revertDeltas = function (deltas) {
            for (var i = deltas.length - 1; i >= 0; i--) {
                var delta = deltas[i];
                var range = Range_1.default.fromPoints(delta.range.start, delta.range.end);
                if (delta.action == "insertLines")
                    this._removeLines(range.start.row, range.end.row - 1);
                else if (delta.action == "insertText")
                    this.remove(range);
                else if (delta.action == "removeLines")
                    this._insertLines(range.start.row, delta.lines);
                else if (delta.action == "removeText")
                    this.insert(range.start, delta.text);
            }
        };
        /**
         * Converts an index position in a document to a `{row, column}` object.
         *
         * Index refers to the "absolute position" of a character in the document. For example:
         *
         * ```javascript
         * var x = 0; // 10 characters, plus one for newline
         * var y = -1;
         * ```
         *
         * Here, `y` is an index 15: 11 characters for the first row, and 5 characters until `y` in the second.
         *
         * @param {Number} index An index to convert
         * @param {Number} startRow=0 The row from which to start the conversion
         * @returns {Object} A `{row, column}` object of the `index` position
         */
        EditorDocument.prototype.indexToPosition = function (index, startRow) {
            var lines = this.$lines || this.getAllLines();
            var newlineLength = this.getNewLineCharacter().length;
            for (var i = startRow || 0, l = lines.length; i < l; i++) {
                index -= lines[i].length + newlineLength;
                if (index < 0)
                    return { row: i, column: index + lines[i].length + newlineLength };
            }
            return { row: l - 1, column: lines[l - 1].length };
        };
        /**
         * Converts the `{row, column}` position in a document to the character's index.
         *
         * Index refers to the "absolute position" of a character in the document. For example:
         *
         * ```javascript
         * var x = 0; // 10 characters, plus one for newline
         * var y = -1;
         * ```
         *
         * Here, `y` is an index 15: 11 characters for the first row, and 5 characters until `y` in the second.
         *
         * @param {Object} pos The `{row, column}` to convert
         * @param {Number} startRow=0 The row from which to start the conversion
         * @returns {Number} The index position in the document
         */
        EditorDocument.prototype.positionToIndex = function (pos, startRow) {
            var lines = this.$lines || this.getAllLines();
            var newlineLength = this.getNewLineCharacter().length;
            var index = 0;
            var row = Math.min(pos.row, lines.length);
            for (var i = startRow || 0; i < row; ++i)
                index += lines[i].length + newlineLength;
            return index + pos.column;
        };
        return EditorDocument;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = EditorDocument;
});

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('BackgroundTokenizer',["require", "exports", "./lib/event_emitter"], function (require, exports, event_emitter_1) {
    /**
     * Tokenizes the current [[EditorDocument `EditorDocument`]] in the background, and caches the tokenized rows for future use.
     *
     * If a certain row is changed, everything below that row is re-tokenized.
     *
     * @class BackgroundTokenizer
     **/
    /**
     * Creates a new `BackgroundTokenizer` object.
     * @param {Tokenizer} tokenizer The tokenizer to use
     * @param {Editor} editor The editor to associate with
     *
     * @constructor
     **/
    var BackgroundTokenizer = (function (_super) {
        __extends(BackgroundTokenizer, _super);
        function BackgroundTokenizer(tokenizer, editor) {
            _super.call(this);
            /**
             * This is the value returned by setTimeout, so it's really a timer handle.
             * There are some conditionals looking for a falsey value, so we use zero where needed.
             */
            this.running = 0;
            this.lines = [];
            this.states = [];
            this.currentLine = 0;
            this.tokenizer = tokenizer;
            var self = this;
            this.$worker = function () {
                if (!self.running) {
                    return;
                }
                var workerStart = new Date();
                var currentLine = self.currentLine;
                var endLine = -1;
                var doc = self.doc;
                while (self.lines[currentLine])
                    currentLine++;
                var startLine = currentLine;
                var len = doc.getLength();
                var processedLines = 0;
                self.running = 0;
                while (currentLine < len) {
                    self.$tokenizeRow(currentLine);
                    endLine = currentLine;
                    do {
                        currentLine++;
                    } while (self.lines[currentLine]);
                    // only check every 5 lines
                    processedLines++;
                    if ((processedLines % 5 === 0) && (new Date().getTime() - workerStart.getTime()) > 20) {
                        self.running = setTimeout(self.$worker, 20);
                        break;
                    }
                }
                self.currentLine = currentLine;
                if (startLine <= endLine)
                    self.fireUpdateEvent(startLine, endLine);
            };
        }
        /**
         * Sets a new tokenizer for this object.
         *
         * @param {Tokenizer} tokenizer The new tokenizer to use
         *
         **/
        BackgroundTokenizer.prototype.setTokenizer = function (tokenizer) {
            this.tokenizer = tokenizer;
            this.lines = [];
            this.states = [];
            this.start(0);
        };
        /**
         * Sets a new document to associate with this object.
         * @param {EditorDocument} doc The new document to associate with
         **/
        BackgroundTokenizer.prototype.setDocument = function (doc) {
            this.doc = doc;
            this.lines = [];
            this.states = [];
            this.stop();
        };
        /**
        * Fires whenever the background tokeniziers between a range of rows are going to be updated.
        *
        * @event update
        * @param {Object} e An object containing two properties, `first` and `last`, which indicate the rows of the region being updated.
        *
        **/
        /**
         * Emits the `'update'` event. `firstRow` and `lastRow` are used to define the boundaries of the region to be updated.
         * @param {number} firstRow The starting row region
         * @param {number} lastRow The final row region
         *
         **/
        BackgroundTokenizer.prototype.fireUpdateEvent = function (firstRow, lastRow) {
            var data = {
                first: firstRow,
                last: lastRow
            };
            this._signal("update", { data: data });
        };
        /**
         * Starts tokenizing at the row indicated.
         *
         * @param {number} startRow The row to start at
         *
         **/
        BackgroundTokenizer.prototype.start = function (startRow) {
            this.currentLine = Math.min(startRow || 0, this.currentLine, this.doc.getLength());
            // remove all cached items below this line
            this.lines.splice(this.currentLine, this.lines.length);
            this.states.splice(this.currentLine, this.states.length);
            this.stop();
            // pretty long delay to prevent the tokenizer from interfering with the user
            this.running = setTimeout(this.$worker, 700);
        };
        BackgroundTokenizer.prototype.scheduleStart = function () {
            if (!this.running)
                this.running = setTimeout(this.$worker, 700);
        };
        BackgroundTokenizer.prototype.$updateOnChange = function (delta) {
            var range = delta.range;
            var startRow = range.start.row;
            var len = range.end.row - startRow;
            if (len === 0) {
                this.lines[startRow] = null;
            }
            else if (delta.action == "removeText" || delta.action == "removeLines") {
                this.lines.splice(startRow, len + 1, null);
                this.states.splice(startRow, len + 1, null);
            }
            else {
                var args = Array(len + 1);
                args.unshift(startRow, 1);
                this.lines.splice.apply(this.lines, args);
                this.states.splice.apply(this.states, args);
            }
            this.currentLine = Math.min(startRow, this.currentLine, this.doc.getLength());
            this.stop();
        };
        /**
         * Stops tokenizing.
         *
         **/
        BackgroundTokenizer.prototype.stop = function () {
            if (this.running) {
                clearTimeout(this.running);
            }
            this.running = 0;
        };
        /**
         * Gives list of tokens of the row. (tokens are cached)
         *
         * @param {number} row The row to get tokens at
         *
         *
         *
         **/
        BackgroundTokenizer.prototype.getTokens = function (row) {
            return this.lines[row] || this.$tokenizeRow(row);
        };
        /**
         * [Returns the state of tokenization at the end of a row.]{: #BackgroundTokenizer.getState}
         *
         * @param {number} row The row to get state at
         **/
        BackgroundTokenizer.prototype.getState = function (row) {
            if (this.currentLine == row) {
                this.$tokenizeRow(row);
            }
            return this.states[row] || "start";
        };
        BackgroundTokenizer.prototype.$tokenizeRow = function (row) {
            var line = this.doc.getLine(row);
            var state = this.states[row - 1];
            // FIXME: There is no third argument in getLineTokens!
            var data = this.tokenizer.getLineTokens(line, state /*, row*/);
            if (this.states[row] + "" !== data.state + "") {
                this.states[row] = data.state;
                this.lines[row + 1] = null;
                if (this.currentLine > row + 1)
                    this.currentLine = row + 1;
            }
            else if (this.currentLine == row) {
                this.currentLine = row + 1;
            }
            return this.lines[row] = data.tokens;
        };
        return BackgroundTokenizer;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = BackgroundTokenizer;
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
define('SearchHighlight',["require", "exports", "./lib/lang", "./Range"], function (require, exports, lang_1, Range_1) {
    // needed to prevent long lines from freezing the browser
    var MAX_RANGES = 500;
    var SearchHighlight = (function () {
        function SearchHighlight(regExp, clazz, type) {
            this.setRegexp(regExp);
            this.clazz = clazz;
            this.type = type || "text";
        }
        SearchHighlight.prototype.setRegexp = function (regExp) {
            if (this.regExp + "" == regExp + "")
                return;
            this.regExp = regExp;
            this.cache = [];
        };
        SearchHighlight.prototype.update = function (html, markerLayer, session, config) {
            if (!this.regExp)
                return;
            var start = config.firstRow, end = config.lastRow;
            for (var i = start; i <= end; i++) {
                var ranges = this.cache[i];
                if (ranges == null) {
                    var matches = lang_1.getMatchOffsets(session.getLine(i), this.regExp);
                    if (matches.length > MAX_RANGES) {
                        matches = matches.slice(0, MAX_RANGES);
                    }
                    ranges = matches.map(function (match) {
                        return new Range_1.default(i, match.offset, i, match.offset + match.length);
                    });
                    // TODO: The zero-length case was the empty string, but that does not pass the compiler.
                    this.cache[i] = ranges.length ? ranges : [];
                }
                for (var j = ranges.length; j--;) {
                    markerLayer.drawSingleLineMarker(html, session.documentToScreenRange(ranges[j]), this.clazz, config);
                }
            }
        };
        return SearchHighlight;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = SearchHighlight;
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
define('edit_session/BracketMatch',["require", "exports", "../TokenIterator", "../Range"], function (require, exports, TokenIterator_1, Range_1) {
    /**
     * Utility service fo
     */
    var BracketMatch = (function () {
        function BracketMatch(host) {
            this.$brackets = {
                ")": "(",
                "(": ")",
                "]": "[",
                "[": "]",
                "{": "}",
                "}": "{"
            };
            this.$host = host;
        }
        BracketMatch.prototype.findMatchingBracket = function (position, chr) {
            if (position.column === 0)
                return null;
            var charBeforeCursor = chr || this.$host.getLine(position.row).charAt(position.column - 1);
            if (charBeforeCursor === "")
                return null;
            var match = charBeforeCursor.match(/([\(\[\{])|([\)\]\}])/);
            if (!match)
                return null;
            if (match[1])
                return this.$findClosingBracket(match[1], position);
            else
                return this.$findOpeningBracket(match[2], position);
        };
        BracketMatch.prototype.getBracketRange = function (pos) {
            var line = this.$host.getLine(pos.row);
            var before = true;
            var range;
            var chr = line.charAt(pos.column - 1);
            var match = chr && chr.match(/([\(\[\{])|([\)\]\}])/);
            if (!match) {
                chr = line.charAt(pos.column);
                pos = { row: pos.row, column: pos.column + 1 };
                match = chr && chr.match(/([\(\[\{])|([\)\]\}])/);
                before = false;
            }
            if (!match)
                return null;
            if (match[1]) {
                var closingPos = this.$findClosingBracket(match[1], pos);
                if (!closingPos)
                    return null;
                range = Range_1.default.fromPoints(pos, closingPos);
                if (!before) {
                    range.end.column++;
                    range.start.column--;
                }
                range['cursor'] = range.end;
            }
            else {
                var openingPos = this.$findOpeningBracket(match[2], pos);
                if (!openingPos)
                    return null;
                range = Range_1.default.fromPoints(openingPos, pos);
                if (!before) {
                    range.start.column++;
                    range.end.column--;
                }
                range['cursor'] = range.start;
            }
            return range;
        };
        BracketMatch.prototype.$findOpeningBracket = function (bracket, position, typeRe) {
            var openBracket = this.$brackets[bracket];
            var depth = 1;
            var iterator = new TokenIterator_1.default(this.$host, position.row, position.column);
            var token = iterator.getCurrentToken();
            if (!token)
                token = iterator.stepForward();
            if (!token)
                return;
            if (!typeRe) {
                typeRe = new RegExp("(\\.?" + token.type.replace(".", "\\.").replace("rparen", ".paren").replace(/\b(?:end|start|begin)\b/, "") + ")+");
            }
            // Start searching in token, just before the character at position.column
            var valueIndex = position.column - iterator.getCurrentTokenColumn() - 2;
            var value = token.value;
            while (true) {
                while (valueIndex >= 0) {
                    var chr = value.charAt(valueIndex);
                    if (chr == openBracket) {
                        depth -= 1;
                        if (depth === 0) {
                            return {
                                row: iterator.getCurrentTokenRow(),
                                column: valueIndex + iterator.getCurrentTokenColumn()
                            };
                        }
                    }
                    else if (chr === bracket) {
                        depth += 1;
                    }
                    valueIndex -= 1;
                }
                // Scan backward through the document, looking for the next token
                // whose type matches typeRe
                do {
                    token = iterator.stepBackward();
                } while (token && !typeRe.test(token.type));
                if (token === null)
                    break;
                value = token.value;
                valueIndex = value.length - 1;
            }
            return null;
        };
        BracketMatch.prototype.$findClosingBracket = function (bracket, position, typeRe) {
            var closingBracket = this.$brackets[bracket];
            var depth = 1;
            var iterator = new TokenIterator_1.default(this.$host, position.row, position.column);
            var token = iterator.getCurrentToken();
            if (!token)
                token = iterator.stepForward();
            if (!token)
                return;
            if (!typeRe) {
                typeRe = new RegExp("(\\.?" + token.type.replace(".", "\\.").replace("lparen", ".paren").replace(/\b(?:end|start|begin)\b/, "") + ")+");
            }
            // Start searching in token, after the character at position.column
            var valueIndex = position.column - iterator.getCurrentTokenColumn();
            while (true) {
                var value = token.value;
                var valueLength = value.length;
                while (valueIndex < valueLength) {
                    var chr = value.charAt(valueIndex);
                    if (chr == closingBracket) {
                        depth -= 1;
                        if (depth === 0) {
                            return {
                                row: iterator.getCurrentTokenRow(),
                                column: valueIndex + iterator.getCurrentTokenColumn()
                            };
                        }
                    }
                    else if (chr === bracket) {
                        depth += 1;
                    }
                    valueIndex += 1;
                }
                // Scan forward through the document, looking for the next token
                // whose type matches typeRe
                do {
                    token = iterator.stepForward();
                } while (token && !typeRe.test(token.type));
                if (token === null)
                    break;
                valueIndex = 0;
            }
            return null;
        };
        return BracketMatch;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = BracketMatch;
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('EditSession',["require", "exports", "./lib/lang", "./config", "./lib/event_emitter", "./FoldLine", "./Fold", "./Selection", "./mode/Mode", "./Range", "./EditorDocument", "./BackgroundTokenizer", "./SearchHighlight", './lib/asserts', "./edit_session/BracketMatch", './TokenIterator'], function (require, exports, lang_1, config_1, event_emitter_1, FoldLine_1, Fold_1, Selection_1, Mode_1, Range_1, EditorDocument_1, BackgroundTokenizer_1, SearchHighlight_1, asserts_1, BracketMatch_1, TokenIterator_1) {
    // "Tokens"
    var CHAR = 1, CHAR_EXT = 2, PLACEHOLDER_START = 3, PLACEHOLDER_BODY = 4, PUNCTUATION = 9, SPACE = 10, TAB = 11, TAB_SPACE = 12;
    // For every keystroke this gets called once per char in the whole doc!!
    // Wouldn't hurt to make it a bit faster for c >= 0x1100
    function isFullWidth(c) {
        if (c < 0x1100)
            return false;
        return c >= 0x1100 && c <= 0x115F ||
            c >= 0x11A3 && c <= 0x11A7 ||
            c >= 0x11FA && c <= 0x11FF ||
            c >= 0x2329 && c <= 0x232A ||
            c >= 0x2E80 && c <= 0x2E99 ||
            c >= 0x2E9B && c <= 0x2EF3 ||
            c >= 0x2F00 && c <= 0x2FD5 ||
            c >= 0x2FF0 && c <= 0x2FFB ||
            c >= 0x3000 && c <= 0x303E ||
            c >= 0x3041 && c <= 0x3096 ||
            c >= 0x3099 && c <= 0x30FF ||
            c >= 0x3105 && c <= 0x312D ||
            c >= 0x3131 && c <= 0x318E ||
            c >= 0x3190 && c <= 0x31BA ||
            c >= 0x31C0 && c <= 0x31E3 ||
            c >= 0x31F0 && c <= 0x321E ||
            c >= 0x3220 && c <= 0x3247 ||
            c >= 0x3250 && c <= 0x32FE ||
            c >= 0x3300 && c <= 0x4DBF ||
            c >= 0x4E00 && c <= 0xA48C ||
            c >= 0xA490 && c <= 0xA4C6 ||
            c >= 0xA960 && c <= 0xA97C ||
            c >= 0xAC00 && c <= 0xD7A3 ||
            c >= 0xD7B0 && c <= 0xD7C6 ||
            c >= 0xD7CB && c <= 0xD7FB ||
            c >= 0xF900 && c <= 0xFAFF ||
            c >= 0xFE10 && c <= 0xFE19 ||
            c >= 0xFE30 && c <= 0xFE52 ||
            c >= 0xFE54 && c <= 0xFE66 ||
            c >= 0xFE68 && c <= 0xFE6B ||
            c >= 0xFF01 && c <= 0xFF60 ||
            c >= 0xFFE0 && c <= 0xFFE6;
    }
    var EditSession = (function (_super) {
        __extends(EditSession, _super);
        function EditSession(doc, mode, cb) {
            _super.call(this);
            this.$breakpoints = [];
            this.$decorations = [];
            this.$frontMarkers = {};
            this.$backMarkers = {};
            this.$markerId = 1;
            this.$undoSelect = true;
            this.$defaultUndoManager = { undo: function () { }, redo: function () { }, reset: function () { } };
            this.$overwrite = false;
            /**
             *
             */
            this.$modes = {};
            /**
             *
             */
            this.$mode = null;
            this.$modeId = null;
            this.$scrollTop = 0;
            this.$scrollLeft = 0;
            this.$wrapLimit = 80;
            this.$useWrapMode = false;
            this.$wrapLimitRange = {
                min: null,
                max: null
            };
            this.$onChange = this.onChange.bind(this);
            this.lineWidgets = null;
            /**
             * A number is a marker identifier, null indicates that no such marker exists.
             */
            this.$selectionMarker = null;
            this.$bracketMatcher = new BracketMatch_1.default(this);
            /**
            * Returns the annotations for the `EditSession`.
            * @returns {Array}
            **/
            this.getAnnotations = function () {
                return this.$annotations || [];
            };
            // structured folding
            this.$foldStyles = {
                "manual": 1,
                "markbegin": 1,
                "markbeginend": 1
            };
            this.$foldStyle = "markbegin";
            this.$foldData = [];
            this.$foldData.toString = function () {
                return this.join("\n");
            };
            this.on("changeFold", this.onChangeFold.bind(this));
            this.setDocument(doc);
            this.selection = new Selection_1.default(this);
            config_1.resetOptions(this);
            this.setMode(mode, cb);
            config_1._signal("session", this);
        }
        /**
         * Sets the `EditSession` to point to a new `EditorDocument`. If a `BackgroundTokenizer` exists, it also points to `doc`.
         * @method setDocument
         * @param doc {EditorDocument} The new `EditorDocument` to use.
         * @return {void}
         */
        EditSession.prototype.setDocument = function (doc) {
            if (!(doc instanceof EditorDocument_1.default)) {
                throw new Error("doc must be a EditorDocument");
            }
            if (this.doc) {
                this.doc.off("change", this.$onChange);
            }
            this.doc = doc;
            doc.on("change", this.$onChange);
            if (this.bgTokenizer) {
                this.bgTokenizer.setDocument(this.getDocument());
            }
            this.resetCaches();
        };
        /**
         * Returns the `EditorDocument` associated with this session.
         * @method getDocument
         * @return {EditorDocument}
         */
        EditSession.prototype.getDocument = function () {
            return this.doc;
        };
        /**
         * @method $resetRowCache
         * @param {number} row The row to work with
         * @return {void}
         * @private
         */
        EditSession.prototype.$resetRowCache = function (docRow) {
            if (!docRow) {
                this.$docRowCache = [];
                this.$screenRowCache = [];
                return;
            }
            var l = this.$docRowCache.length;
            var i = this.$getRowCacheIndex(this.$docRowCache, docRow) + 1;
            if (l > i) {
                this.$docRowCache.splice(i, l);
                this.$screenRowCache.splice(i, l);
            }
        };
        EditSession.prototype.$getRowCacheIndex = function (cacheArray, val) {
            var low = 0;
            var hi = cacheArray.length - 1;
            while (low <= hi) {
                var mid = (low + hi) >> 1;
                var c = cacheArray[mid];
                if (val > c) {
                    low = mid + 1;
                }
                else if (val < c) {
                    hi = mid - 1;
                }
                else {
                    return mid;
                }
            }
            return low - 1;
        };
        EditSession.prototype.resetCaches = function () {
            this.$modified = true;
            this.$wrapData = [];
            this.$rowLengthCache = [];
            this.$resetRowCache(0);
            if (this.bgTokenizer) {
                this.bgTokenizer.start(0);
            }
        };
        EditSession.prototype.onChangeFold = function (e) {
            var fold = e.data;
            this.$resetRowCache(fold.start.row);
        };
        EditSession.prototype.onChange = function (e, doc) {
            var delta = e.data;
            this.$modified = true;
            this.$resetRowCache(delta.range.start.row);
            var removedFolds = this.$updateInternalDataOnChange(e);
            if (!this.$fromUndo && this.$undoManager && !delta.ignore) {
                this.$deltasDoc.push(delta);
                if (removedFolds && removedFolds.length != 0) {
                    this.$deltasFold.push({
                        action: "removeFolds",
                        folds: removedFolds
                    });
                }
                this.$informUndoManager.schedule();
            }
            this.bgTokenizer.$updateOnChange(delta);
            this._signal("change", e);
        };
        /**
         * Sets the session text.
         * @method setValue
         * @param text {string} The new text to place.
         * @return {void}
         * @private
         */
        EditSession.prototype.setValue = function (text) {
            this.doc.setValue(text);
            this.selection.moveTo(0, 0);
            this.$resetRowCache(0);
            this.$deltas = [];
            this.$deltasDoc = [];
            this.$deltasFold = [];
            this.setUndoManager(this.$undoManager);
            this.getUndoManager().reset();
        };
        /**
        * Returns the current [[EditorDocument `EditorDocument`]] as a string.
        * @method toString
        * @returns {string}
        * @alias EditSession.getValue
        **/
        EditSession.prototype.toString = function () {
            return this.getValue();
        };
        /**
        * Returns the current [[EditorDocument `EditorDocument`]] as a string.
        * @method getValue
        * @returns {string}
        * @alias EditSession.toString
        **/
        EditSession.prototype.getValue = function () {
            return this.doc.getValue();
        };
        /**
         * Returns the string of the current selection.
         */
        EditSession.prototype.getSelection = function () {
            return this.selection;
        };
        EditSession.prototype.setSelection = function (selection) {
            this.selection = selection;
        };
        /**
         * {:BackgroundTokenizer.getState}
         * @param {Number} row The row to start at
         *
         * @related BackgroundTokenizer.getState
         **/
        EditSession.prototype.getState = function (row) {
            return this.bgTokenizer.getState(row);
        };
        /**
         * Starts tokenizing at the row indicated. Returns a list of objects of the tokenized rows.
         * @method getTokens
         * @param row {number} The row to start at.
         **/
        EditSession.prototype.getTokens = function (row) {
            return this.bgTokenizer.getTokens(row);
        };
        /**
        * Returns an object indicating the token at the current row. The object has two properties: `index` and `start`.
        * @param {Number} row The row number to retrieve from
        * @param {Number} column The column number to retrieve from
        *
        *
        **/
        EditSession.prototype.getTokenAt = function (row, column) {
            var tokens = this.bgTokenizer.getTokens(row);
            var token;
            var c = 0;
            if (column == null) {
                i = tokens.length - 1;
                c = this.getLine(row).length;
            }
            else {
                for (var i = 0; i < tokens.length; i++) {
                    c += tokens[i].value.length;
                    if (c >= column)
                        break;
                }
            }
            token = tokens[i];
            if (!token)
                return null;
            token.index = i;
            token.start = c - token.value.length;
            return token;
        };
        /**
        * Sets the undo manager.
        * @param {UndoManager} undoManager The new undo manager
        **/
        EditSession.prototype.setUndoManager = function (undoManager) {
            this.$undoManager = undoManager;
            this.$deltas = [];
            this.$deltasDoc = [];
            this.$deltasFold = [];
            if (this.$informUndoManager)
                this.$informUndoManager.cancel();
            if (undoManager) {
                var self = this;
                this.$syncInformUndoManager = function () {
                    self.$informUndoManager.cancel();
                    if (self.$deltasFold.length) {
                        self.$deltas.push({
                            group: "fold",
                            deltas: self.$deltasFold
                        });
                        self.$deltasFold = [];
                    }
                    if (self.$deltasDoc.length) {
                        self.$deltas.push({
                            group: "doc",
                            deltas: self.$deltasDoc
                        });
                        self.$deltasDoc = [];
                    }
                    if (self.$deltas.length > 0) {
                        undoManager.execute({
                            action: "aceupdate",
                            args: [self.$deltas, self],
                            merge: self.mergeUndoDeltas
                        });
                    }
                    self.mergeUndoDeltas = false;
                    self.$deltas = [];
                };
                this.$informUndoManager = lang_1.delayedCall(this.$syncInformUndoManager);
            }
        };
        /**
         * starts a new group in undo history
         */
        EditSession.prototype.markUndoGroup = function () {
            if (this.$syncInformUndoManager) {
                this.$syncInformUndoManager();
            }
        };
        /**
        * Returns the current undo manager.
        **/
        EditSession.prototype.getUndoManager = function () {
            return this.$undoManager || this.$defaultUndoManager;
        };
        /**
        * Returns the current value for tabs. If the user is using soft tabs, this will be a series of spaces (defined by [[EditSession.getTabSize `getTabSize()`]]); otherwise it's simply `'\t'`.
        **/
        EditSession.prototype.getTabString = function () {
            if (this.getUseSoftTabs()) {
                return lang_1.stringRepeat(" ", this.getTabSize());
            }
            else {
                return "\t";
            }
        };
        /**
        /**
        * Pass `true` to enable the use of soft tabs. Soft tabs means you're using spaces instead of the tab character (`'\t'`).
        * @param {Boolean} useSoftTabs Value indicating whether or not to use soft tabs
        **/
        EditSession.prototype.setUseSoftTabs = function (useSoftTabs) {
            this.setOption("useSoftTabs", useSoftTabs);
        };
        /**
        * Returns `true` if soft tabs are being used, `false` otherwise.
        * @returns {Boolean}
        **/
        EditSession.prototype.getUseSoftTabs = function () {
            // todo might need more general way for changing settings from mode, but this is ok for now
            return this.$useSoftTabs && !this.$mode.$indentWithTabs;
        };
        /**
        * Set the number of spaces that define a soft tab.
        * For example, passing in `4` transforms the soft tabs to be equivalent to four spaces.
        * This function also emits the `changeTabSize` event.
        * @param {Number} tabSize The new tab size
        **/
        EditSession.prototype.setTabSize = function (tabSize) {
            this.setOption("tabSize", tabSize);
        };
        /**
        * Returns the current tab size.
        **/
        EditSession.prototype.getTabSize = function () {
            return this.$tabSize;
        };
        /**
        * Returns `true` if the character at the position is a soft tab.
        * @param {Object} position The position to check
        *
        *
        **/
        EditSession.prototype.isTabStop = function (position) {
            return this.$useSoftTabs && (position.column % this.$tabSize === 0);
        };
        /**
        * Pass in `true` to enable overwrites in your session, or `false` to disable.
        *
        * If overwrites is enabled, any text you enter will type over any text after it. If the value of `overwrite` changes, this function also emites the `changeOverwrite` event.
        *
        * @param {Boolean} overwrite Defines whether or not to set overwrites
        *
        *
        **/
        EditSession.prototype.setOverwrite = function (overwrite) {
            this.setOption("overwrite", overwrite);
        };
        /**
        * Returns `true` if overwrites are enabled; `false` otherwise.
        **/
        EditSession.prototype.getOverwrite = function () {
            return this.$overwrite;
        };
        /**
        * Sets the value of overwrite to the opposite of whatever it currently is.
        **/
        EditSession.prototype.toggleOverwrite = function () {
            this.setOverwrite(!this.$overwrite);
        };
        /**
         * Adds `className` to the `row`, to be used for CSS stylings and whatnot.
         * @param {Number} row The row number
         * @param {String} className The class to add
         */
        EditSession.prototype.addGutterDecoration = function (row, className) {
            if (!this.$decorations[row]) {
                this.$decorations[row] = "";
            }
            this.$decorations[row] += " " + className;
            this._signal("changeBreakpoint", {});
        };
        /**
         * Removes `className` from the `row`.
         * @param {Number} row The row number
         * @param {String} className The class to add
         */
        EditSession.prototype.removeGutterDecoration = function (row, className) {
            this.$decorations[row] = (this.$decorations[row] || "").replace(" " + className, "");
            this._signal("changeBreakpoint", {});
        };
        /**
        * Returns an array of numbers, indicating which rows have breakpoints.
        * @returns {[Number]}
        **/
        EditSession.prototype.getBreakpoints = function () {
            return this.$breakpoints;
        };
        /**
        * Sets a breakpoint on every row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
        * @param {Array} rows An array of row indices
        *
        *
        *
        **/
        EditSession.prototype.setBreakpoints = function (rows) {
            this.$breakpoints = [];
            for (var i = 0; i < rows.length; i++) {
                this.$breakpoints[rows[i]] = "ace_breakpoint";
            }
            this._signal("changeBreakpoint", {});
        };
        /**
        * Removes all breakpoints on the rows. This function also emites the `'changeBreakpoint'` event.
        **/
        EditSession.prototype.clearBreakpoints = function () {
            this.$breakpoints = [];
            this._signal("changeBreakpoint", {});
        };
        /**
        * Sets a breakpoint on the row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
        * @param {Number} row A row index
        * @param {String} className Class of the breakpoint
        *
        *
        **/
        EditSession.prototype.setBreakpoint = function (row, className) {
            if (className === undefined)
                className = "ace_breakpoint";
            if (className)
                this.$breakpoints[row] = className;
            else
                delete this.$breakpoints[row];
            this._signal("changeBreakpoint", {});
        };
        /**
        * Removes a breakpoint on the row number given by `rows`. This function also emites the `'changeBreakpoint'` event.
        * @param {Number} row A row index
        *
        *
        **/
        EditSession.prototype.clearBreakpoint = function (row) {
            delete this.$breakpoints[row];
            this._signal("changeBreakpoint", {});
        };
        /**
        * Adds a new marker to the given `Range`. If `inFront` is `true`, a front marker is defined, and the `'changeFrontMarker'` event fires; otherwise, the `'changeBackMarker'` event fires.
        * @param {Range} range Define the range of the marker
        * @param {String} clazz Set the CSS class for the marker
        * @param {Function | String} type Identify the type of the marker.
        * @param {Boolean} inFront Set to `true` to establish a front marker
        *
        *
        * @return {Number} The new marker id
        **/
        EditSession.prototype.addMarker = function (range, clazz, type, inFront) {
            var id = this.$markerId++;
            // FIXME: Need more type safety here.
            var marker = {
                range: range,
                type: type || "line",
                renderer: typeof type === "function" ? type : null,
                clazz: clazz,
                inFront: !!inFront,
                id: id
            };
            if (inFront) {
                this.$frontMarkers[id] = marker;
                this._signal("changeFrontMarker");
            }
            else {
                this.$backMarkers[id] = marker;
                this._signal("changeBackMarker");
            }
            return id;
        };
        /**
         * Adds a dynamic marker to the session.
         * @param {Object} marker object with update method
         * @param {Boolean} inFront Set to `true` to establish a front marker
         *
         *
         * @return {Object} The added marker
         **/
        EditSession.prototype.addDynamicMarker = function (marker, inFront) {
            if (!marker.update)
                return;
            var id = this.$markerId++;
            marker.id = id;
            marker.inFront = !!inFront;
            if (inFront) {
                this.$frontMarkers[id] = marker;
                this._signal("changeFrontMarker");
            }
            else {
                this.$backMarkers[id] = marker;
                this._signal("changeBackMarker");
            }
            return marker;
        };
        /**
        * Removes the marker with the specified ID. If this marker was in front, the `'changeFrontMarker'` event is emitted. If the marker was in the back, the `'changeBackMarker'` event is emitted.
        * @param {Number} markerId A number representing a marker
        *
        *
        *
        **/
        EditSession.prototype.removeMarker = function (markerId) {
            var marker = this.$frontMarkers[markerId] || this.$backMarkers[markerId];
            if (!marker)
                return;
            var markers = marker.inFront ? this.$frontMarkers : this.$backMarkers;
            if (marker) {
                delete (markers[markerId]);
                this._signal(marker.inFront ? "changeFrontMarker" : "changeBackMarker");
            }
        };
        /**
        * Returns an array containing the IDs of all the markers, either front or back.
        * @param {boolean} inFront If `true`, indicates you only want front markers; `false` indicates only back markers
        *
        * @returns {Array}
        **/
        EditSession.prototype.getMarkers = function (inFront) {
            return inFront ? this.$frontMarkers : this.$backMarkers;
        };
        EditSession.prototype.highlight = function (re) {
            if (!this.$searchHighlight) {
                var highlight = new SearchHighlight_1.default(null, "ace_selected-word", "text");
                this.$searchHighlight = this.addDynamicMarker(highlight);
            }
            this.$searchHighlight.setRegexp(re);
        };
        EditSession.prototype.highlightLines = function (startRow, endRow, clazz, inFront) {
            if (clazz === void 0) { clazz = "ace_step"; }
            var range = new Range_1.default(startRow, 0, endRow, Infinity);
            range.markerId = this.addMarker(range, clazz, "fullLine", inFront);
            return range;
        };
        /*
         * Error:
         *  {
         *    row: 12,
         *    column: 2, //can be undefined
         *    text: "Missing argument",
         *    type: "error" // or "warning" or "info"
         *  }
         */
        /**
        * Sets annotations for the `EditSession`. This functions emits the `'changeAnnotation'` event.
        * @param {Array} annotations A list of annotations
        *
        **/
        EditSession.prototype.setAnnotations = function (annotations) {
            this.$annotations = annotations;
            this._signal("changeAnnotation", {});
        };
        /**
         * Clears all the annotations for this session.
         * This function also triggers the `'changeAnnotation'` event.
         * This is called by the language modes when the worker terminates.
         */
        EditSession.prototype.clearAnnotations = function () {
            this.setAnnotations([]);
        };
        /**
        * If `text` contains either the newline (`\n`) or carriage-return ('\r') characters, `$autoNewLine` stores that value.
        * @param {String} text A block of text
        *
        **/
        EditSession.prototype.$detectNewLine = function (text) {
            var match = text.match(/^.*?(\r?\n)/m);
            if (match) {
                this.$autoNewLine = match[1];
            }
            else {
                this.$autoNewLine = "\n";
            }
        };
        /**
        * Given a starting row and column, this method returns the `Range` of the first word boundary it finds.
        * @param {Number} row The row to start at
        * @param {Number} column The column to start at
        *
        * @returns {Range}
        **/
        EditSession.prototype.getWordRange = function (row, column) {
            var line = this.getLine(row);
            var inToken = false;
            if (column > 0)
                inToken = !!line.charAt(column - 1).match(this.tokenRe);
            if (!inToken)
                inToken = !!line.charAt(column).match(this.tokenRe);
            if (inToken)
                var re = this.tokenRe;
            else if (/^\s+$/.test(line.slice(column - 1, column + 1)))
                var re = /\s/;
            else
                var re = this.nonTokenRe;
            var start = column;
            if (start > 0) {
                do {
                    start--;
                } while (start >= 0 && line.charAt(start).match(re));
                start++;
            }
            var end = column;
            while (end < line.length && line.charAt(end).match(re)) {
                end++;
            }
            return new Range_1.default(row, start, row, end);
        };
        /**
        * Gets the range of a word, including its right whitespace.
        * @param {Number} row The row number to start from
        * @param {Number} column The column number to start from
        *
        * @return {Range}
        **/
        EditSession.prototype.getAWordRange = function (row, column) {
            var wordRange = this.getWordRange(row, column);
            var line = this.getLine(wordRange.end.row);
            while (line.charAt(wordRange.end.column).match(/[ \t]/)) {
                wordRange.end.column += 1;
            }
            return wordRange;
        };
        /**
        * {:EditorDocument.setNewLineMode.desc}
        * @param {String} newLineMode {:EditorDocument.setNewLineMode.param}
        *
        *
        * @related EditorDocument.setNewLineMode
        **/
        EditSession.prototype.setNewLineMode = function (newLineMode) {
            this.doc.setNewLineMode(newLineMode);
        };
        /**
        *
        * Returns the current new line mode.
        * @returns {String}
        * @related EditorDocument.getNewLineMode
        **/
        EditSession.prototype.getNewLineMode = function () {
            return this.doc.getNewLineMode();
        };
        /**
        * Identifies if you want to use a worker for the `EditSession`.
        * @param {Boolean} useWorker Set to `true` to use a worker
        *
        **/
        EditSession.prototype.setUseWorker = function (useWorker) { this.setOption("useWorker", useWorker); };
        /**
        * Returns `true` if workers are being used.
        **/
        EditSession.prototype.getUseWorker = function () { return this.$useWorker; };
        /**
        * Reloads all the tokens on the current session. This function calls [[BackgroundTokenizer.start `BackgroundTokenizer.start ()`]] to all the rows; it also emits the `'tokenizerUpdate'` event.
        **/
        EditSession.prototype.onReloadTokenizer = function (e) {
            var rows = e.data;
            this.bgTokenizer.start(rows.first);
            this._signal("tokenizerUpdate", e);
        };
        /**
        * Sets a new text mode for the `EditSession`. This method also emits the `'changeMode'` event. If a [[BackgroundTokenizer `BackgroundTokenizer`]] is set, the `'tokenizerUpdate'` event is also emitted.
        * @param {TextMode} mode Set a new text mode
        * @param {cb} optional callback
        *
        **/
        EditSession.prototype.setMode = function (mode, cb) {
            if (mode && typeof mode === "object") {
                if (mode.getTokenizer) {
                    return this.$onChangeMode(mode);
                }
                var options = mode;
                var path = options.path;
            }
            else {
                path = mode || "ace/mode/text";
            }
            // this is needed if ace isn't on require path (e.g tests in node)
            if (!this.$modes["ace/mode/text"]) {
                this.$modes["ace/mode/text"] = new Mode_1.default();
            }
            if (this.$modes[path] && !options) {
                this.$onChangeMode(this.$modes[path]);
                cb && cb();
                return;
            }
            // load on demand
            this.$modeId = path;
            config_1.loadModule(["mode", path], function (m) {
                if (this.$modeId !== path)
                    return cb && cb();
                if (this.$modes[path] && !options)
                    return this.$onChangeMode(this.$modes[path]);
                if (m && m.Mode) {
                    m = new m.Mode(options);
                    if (!options) {
                        this.$modes[path] = m;
                        m.$id = path;
                    }
                    this.$onChangeMode(m);
                    cb && cb();
                }
            }.bind(this));
            // set mode to text until loading is finished
            if (!this.$mode) {
                this.$onChangeMode(this.$modes["ace/mode/text"], true);
            }
        };
        EditSession.prototype.$onChangeMode = function (mode, $isPlaceholder) {
            if (!$isPlaceholder) {
                this.$modeId = mode.$id;
            }
            if (this.$mode === mode) {
                // Nothing to do. Be idempotent.
                return;
            }
            this.$mode = mode;
            // TODO: Wouldn't it make more sense to stop the worker, then change the mode?
            this.$stopWorker();
            if (this.$useWorker) {
                this.$startWorker();
            }
            var tokenizer = mode.getTokenizer();
            if (tokenizer['addEventListener'] !== undefined) {
                var onReloadTokenizer = this.onReloadTokenizer.bind(this);
                tokenizer['addEventListener']("update", onReloadTokenizer);
            }
            if (!this.bgTokenizer) {
                this.bgTokenizer = new BackgroundTokenizer_1.default(tokenizer);
                var _self = this;
                this.bgTokenizer.on("update", function (event, bg) {
                    _self._signal("tokenizerUpdate", event);
                });
            }
            else {
                this.bgTokenizer.setTokenizer(tokenizer);
            }
            this.bgTokenizer.setDocument(this.getDocument());
            this.tokenRe = mode.tokenRe;
            this.nonTokenRe = mode.nonTokenRe;
            if (!$isPlaceholder) {
                this.$options.wrapMethod.set.call(this, this.$wrapMethod);
                this.$setFolding(mode.foldingRules);
                this.bgTokenizer.start(0);
                this._emit("changeMode");
            }
        };
        EditSession.prototype.$stopWorker = function () {
            if (this.$worker) {
                this.$worker.terminate();
            }
            this.$worker = null;
        };
        EditSession.prototype.$startWorker = function () {
            try {
                this.$worker = this.$mode.createWorker(this);
            }
            catch (e) {
                this.$worker = null;
            }
        };
        /**
        * Returns the current text mode.
        * @returns {TextMode} The current text mode
        **/
        EditSession.prototype.getMode = function () {
            return this.$mode;
        };
        /**
        * This function sets the scroll top value. It also emits the `'changeScrollTop'` event.
        * @param {Number} scrollTop The new scroll top value
        *
        **/
        EditSession.prototype.setScrollTop = function (scrollTop) {
            // TODO: should we force integer lineheight instead? scrollTop = Math.round(scrollTop); 
            if (this.$scrollTop === scrollTop || isNaN(scrollTop)) {
                return;
            }
            this.$scrollTop = scrollTop;
            this._signal("changeScrollTop", scrollTop);
        };
        /**
        * [Returns the value of the distance between the top of the editor and the topmost part of the visible content.]{: #EditSession.getScrollTop}
        * @returns {Number}
        **/
        EditSession.prototype.getScrollTop = function () {
            return this.$scrollTop;
        };
        /**
        * [Sets the value of the distance between the left of the editor and the leftmost part of the visible content.]{: #EditSession.setScrollLeft}
        **/
        EditSession.prototype.setScrollLeft = function (scrollLeft) {
            // scrollLeft = Math.round(scrollLeft);
            if (this.$scrollLeft === scrollLeft || isNaN(scrollLeft))
                return;
            this.$scrollLeft = scrollLeft;
            this._signal("changeScrollLeft", scrollLeft);
        };
        /**
        * [Returns the value of the distance between the left of the editor and the leftmost part of the visible content.]{: #EditSession.getScrollLeft}
        * @returns {Number}
        **/
        EditSession.prototype.getScrollLeft = function () {
            return this.$scrollLeft;
        };
        /**
        * Returns the width of the screen.
        * @returns {Number}
        **/
        EditSession.prototype.getScreenWidth = function () {
            this.$computeWidth();
            if (this.lineWidgets)
                return Math.max(this.getLineWidgetMaxWidth(), this.screenWidth);
            return this.screenWidth;
        };
        EditSession.prototype.getLineWidgetMaxWidth = function () {
            if (this.lineWidgetsWidth != null)
                return this.lineWidgetsWidth;
            var width = 0;
            this.lineWidgets.forEach(function (w) {
                if (w && w.screenWidth > width)
                    width = w.screenWidth;
            });
            return this.lineWidgetWidth = width;
        };
        EditSession.prototype.$computeWidth = function (force) {
            if (this.$modified || force) {
                this.$modified = false;
                if (this.$useWrapMode) {
                    return this.screenWidth = this.$wrapLimit;
                }
                var lines = this.doc.getAllLines();
                var cache = this.$rowLengthCache;
                var longestScreenLine = 0;
                var foldIndex = 0;
                var foldLine = this.$foldData[foldIndex];
                var foldStart = foldLine ? foldLine.start.row : Infinity;
                var len = lines.length;
                for (var i = 0; i < len; i++) {
                    if (i > foldStart) {
                        i = foldLine.end.row + 1;
                        if (i >= len)
                            break;
                        foldLine = this.$foldData[foldIndex++];
                        foldStart = foldLine ? foldLine.start.row : Infinity;
                    }
                    if (cache[i] == null)
                        cache[i] = this.$getStringScreenWidth(lines[i])[0];
                    if (cache[i] > longestScreenLine)
                        longestScreenLine = cache[i];
                }
                this.screenWidth = longestScreenLine;
            }
        };
        /**
         * Returns a verbatim copy of the given line as it is in the document
         * @param {Number} row The row to retrieve from
         *
        *
         * @returns {String}
        *
        **/
        EditSession.prototype.getLine = function (row) {
            return this.doc.getLine(row);
        };
        /**
         * Returns an array of strings of the rows between `firstRow` and `lastRow`. This function is inclusive of `lastRow`.
         * @param {Number} firstRow The first row index to retrieve
         * @param {Number} lastRow The final row index to retrieve
         *
         * @returns {[String]}
         *
         **/
        EditSession.prototype.getLines = function (firstRow, lastRow) {
            return this.doc.getLines(firstRow, lastRow);
        };
        /**
         * Returns the number of rows in the document.
         * @returns {Number}
         **/
        EditSession.prototype.getLength = function () {
            return this.doc.getLength();
        };
        /**
         * {:EditorDocument.getTextRange.desc}
         * @param {Range} range The range to work with
         *
         * @returns {string}
         **/
        EditSession.prototype.getTextRange = function (range) {
            return this.doc.getTextRange(range || this.selection.getRange());
        };
        /**
         * Inserts a block of `text` and the indicated `position`.
         * @param {Object} position The position {row, column} to start inserting at
         * @param {String} text A chunk of text to insert
         * @returns {Object} The position of the last line of `text`. If the length of `text` is 0, this function simply returns `position`.
         *
         *
         **/
        EditSession.prototype.insert = function (position, text) {
            return this.doc.insert(position, text);
        };
        /**
         * Removes the `range` from the document.
         * @param {Range} range A specified Range to remove
         * @returns {Object} The new `start` property of the range, which contains `startRow` and `startColumn`. If `range` is empty, this function returns the unmodified value of `range.start`.
         *
         * @related EditorDocument.remove
         *
         **/
        EditSession.prototype.remove = function (range) {
            return this.doc.remove(range);
        };
        /**
         * Reverts previous changes to your document.
         * @param {Array} deltas An array of previous changes
         * @param {Boolean} dontSelect [If `true`, doesn't select the range of where the change occured]{: #dontSelect}
         *
         *
         * @returns {Range}
        **/
        EditSession.prototype.undoChanges = function (deltas, dontSelect) {
            if (!deltas.length)
                return;
            this.$fromUndo = true;
            var lastUndoRange = null;
            for (var i = deltas.length - 1; i != -1; i--) {
                var delta = deltas[i];
                if (delta.group == "doc") {
                    this.doc.revertDeltas(delta.deltas);
                    lastUndoRange =
                        this.$getUndoSelection(delta.deltas, true, lastUndoRange);
                }
                else {
                    delta.deltas.forEach(function (foldDelta) {
                        this.addFolds(foldDelta.folds);
                    }, this);
                }
            }
            this.$fromUndo = false;
            lastUndoRange &&
                this.$undoSelect &&
                !dontSelect &&
                this.selection.setSelectionRange(lastUndoRange);
            return lastUndoRange;
        };
        /**
         * Re-implements a previously undone change to your document.
         * @param {Array} deltas An array of previous changes
         * @param {Boolean} dontSelect {:dontSelect}
         *
        *
         * @returns {Range}
        **/
        EditSession.prototype.redoChanges = function (deltas, dontSelect) {
            if (!deltas.length)
                return;
            this.$fromUndo = true;
            var lastUndoRange = null;
            for (var i = 0; i < deltas.length; i++) {
                var delta = deltas[i];
                if (delta.group == "doc") {
                    this.doc.applyDeltas(delta.deltas);
                    lastUndoRange =
                        this.$getUndoSelection(delta.deltas, false, lastUndoRange);
                }
            }
            this.$fromUndo = false;
            lastUndoRange &&
                this.$undoSelect &&
                !dontSelect &&
                this.selection.setSelectionRange(lastUndoRange);
            return lastUndoRange;
        };
        /**
         * Enables or disables highlighting of the range where an undo occurred.
         * @param {Boolean} enable If `true`, selects the range of the reinserted change
        *
        **/
        EditSession.prototype.setUndoSelect = function (enable) {
            this.$undoSelect = enable;
        };
        EditSession.prototype.$getUndoSelection = function (deltas, isUndo, lastUndoRange) {
            function isInsert(delta) {
                var insert = delta.action === "insertText" || delta.action === "insertLines";
                return isUndo ? !insert : insert;
            }
            var delta = deltas[0];
            var range;
            var point;
            var lastDeltaIsInsert = false;
            if (isInsert(delta)) {
                range = Range_1.default.fromPoints(delta.range.start, delta.range.end);
                lastDeltaIsInsert = true;
            }
            else {
                range = Range_1.default.fromPoints(delta.range.start, delta.range.start);
                lastDeltaIsInsert = false;
            }
            for (var i = 1; i < deltas.length; i++) {
                delta = deltas[i];
                if (isInsert(delta)) {
                    point = delta.range.start;
                    if (range.compare(point.row, point.column) === -1) {
                        range.setStart(delta.range.start.row, delta.range.start.column);
                    }
                    point = delta.range.end;
                    if (range.compare(point.row, point.column) === 1) {
                        range.setEnd(delta.range.end.row, delta.range.end.column);
                    }
                    lastDeltaIsInsert = true;
                }
                else {
                    point = delta.range.start;
                    if (range.compare(point.row, point.column) === -1) {
                        range = Range_1.default.fromPoints(delta.range.start, delta.range.start);
                    }
                    lastDeltaIsInsert = false;
                }
            }
            // Check if this range and the last undo range has something in common.
            // If true, merge the ranges.
            if (lastUndoRange != null) {
                if (Range_1.default.comparePoints(lastUndoRange.start, range.start) === 0) {
                    lastUndoRange.start.column += range.end.column - range.start.column;
                    lastUndoRange.end.column += range.end.column - range.start.column;
                }
                var cmp = lastUndoRange.compareRange(range);
                if (cmp === 1) {
                    range.setStart(lastUndoRange.start.row, lastUndoRange.start.column);
                }
                else if (cmp === -1) {
                    range.setEnd(lastUndoRange.end.row, lastUndoRange.start.column);
                }
            }
            return range;
        };
        /**
        * Replaces a range in the document with the new `text`.
        *
        * @param {Range} range A specified Range to replace
        * @param {String} text The new text to use as a replacement
        * @returns {Object} An object containing the final row and column, like this:
        * ```
        * {row: endRow, column: 0}
        * ```
        * If the text and range are empty, this function returns an object containing the current `range.start` value.
        * If the text is the exact same as what currently exists, this function returns an object containing the current `range.end` value.
        *
        *
        *
        * @related EditorDocument.replace
        *
        *
        **/
        EditSession.prototype.replace = function (range, text) {
            return this.doc.replace(range, text);
        };
        /**
        * Moves a range of text from the given range to the given position. `toPosition` is an object that looks like this:
         *  ```json
        *    { row: newRowLocation, column: newColumnLocation }
         *  ```
         * @param {Range} fromRange The range of text you want moved within the document
         * @param {Object} toPosition The location (row and column) where you want to move the text to
         * @returns {Range} The new range where the text was moved to.
        *
        *
        *
        **/
        EditSession.prototype.moveText = function (fromRange, toPosition, copy) {
            var text = this.getTextRange(fromRange);
            var folds = this.getFoldsInRange(fromRange);
            var rowDiff;
            var colDiff;
            var toRange = Range_1.default.fromPoints(toPosition, toPosition);
            if (!copy) {
                this.remove(fromRange);
                rowDiff = fromRange.start.row - fromRange.end.row;
                colDiff = rowDiff ? -fromRange.end.column : fromRange.start.column - fromRange.end.column;
                if (colDiff) {
                    if (toRange.start.row == fromRange.end.row && toRange.start.column > fromRange.end.column) {
                        toRange.start.column += colDiff;
                    }
                    if (toRange.end.row == fromRange.end.row && toRange.end.column > fromRange.end.column) {
                        toRange.end.column += colDiff;
                    }
                }
                if (rowDiff && toRange.start.row >= fromRange.end.row) {
                    toRange.start.row += rowDiff;
                    toRange.end.row += rowDiff;
                }
            }
            toRange.end = this.insert(toRange.start, text);
            if (folds.length) {
                var oldStart = fromRange.start;
                var newStart = toRange.start;
                rowDiff = newStart.row - oldStart.row;
                colDiff = newStart.column - oldStart.column;
                this.addFolds(folds.map(function (x) {
                    x = x.clone();
                    if (x.start.row == oldStart.row) {
                        x.start.column += colDiff;
                    }
                    if (x.end.row == oldStart.row) {
                        x.end.column += colDiff;
                    }
                    x.start.row += rowDiff;
                    x.end.row += rowDiff;
                    return x;
                }));
            }
            return toRange;
        };
        /**
        * Indents all the rows, from `startRow` to `endRow` (inclusive), by prefixing each row with the token in `indentString`.
        *
        * If `indentString` contains the `'\t'` character, it's replaced by whatever is defined by [[EditSession.getTabString `getTabString()`]].
        * @param {Number} startRow Starting row
        * @param {Number} endRow Ending row
        * @param {String} indentString The indent token
        *
        *
        **/
        EditSession.prototype.indentRows = function (startRow, endRow, indentString) {
            indentString = indentString.replace(/\t/g, this.getTabString());
            for (var row = startRow; row <= endRow; row++)
                this.insert({ row: row, column: 0 }, indentString);
        };
        /**
        * Outdents all the rows defined by the `start` and `end` properties of `range`.
        * @param {Range} range A range of rows
        *
        *
        **/
        EditSession.prototype.outdentRows = function (range) {
            var rowRange = range.collapseRows();
            var deleteRange = new Range_1.default(0, 0, 0, 0);
            var size = this.getTabSize();
            for (var i = rowRange.start.row; i <= rowRange.end.row; ++i) {
                var line = this.getLine(i);
                deleteRange.start.row = i;
                deleteRange.end.row = i;
                for (var j = 0; j < size; ++j)
                    if (line.charAt(j) != ' ')
                        break;
                if (j < size && line.charAt(j) == '\t') {
                    deleteRange.start.column = j;
                    deleteRange.end.column = j + 1;
                }
                else {
                    deleteRange.start.column = 0;
                    deleteRange.end.column = j;
                }
                this.remove(deleteRange);
            }
        };
        EditSession.prototype.$moveLines = function (firstRow, lastRow, dir) {
            firstRow = this.getRowFoldStart(firstRow);
            lastRow = this.getRowFoldEnd(lastRow);
            if (dir < 0) {
                var row = this.getRowFoldStart(firstRow + dir);
                if (row < 0)
                    return 0;
                var diff = row - firstRow;
            }
            else if (dir > 0) {
                var row = this.getRowFoldEnd(lastRow + dir);
                if (row > this.doc.getLength() - 1)
                    return 0;
                var diff = row - lastRow;
            }
            else {
                firstRow = this.$clipRowToDocument(firstRow);
                lastRow = this.$clipRowToDocument(lastRow);
                var diff = lastRow - firstRow + 1;
            }
            var range = new Range_1.default(firstRow, 0, lastRow, Number.MAX_VALUE);
            var folds = this.getFoldsInRange(range).map(function (x) {
                x = x.clone();
                x.start.row += diff;
                x.end.row += diff;
                return x;
            });
            var lines = dir == 0
                ? this.doc.getLines(firstRow, lastRow)
                : this.doc.removeLines(firstRow, lastRow);
            this.doc.insertLines(firstRow + diff, lines);
            folds.length && this.addFolds(folds);
            return diff;
        };
        /**
        * Shifts all the lines in the document up one, starting from `firstRow` and ending at `lastRow`.
        * @param {Number} firstRow The starting row to move up
        * @param {Number} lastRow The final row to move up
        * @returns {Number} If `firstRow` is less-than or equal to 0, this function returns 0. Otherwise, on success, it returns -1.
        *
        * @related EditorDocument.insertLines
        *
        **/
        EditSession.prototype.moveLinesUp = function (firstRow, lastRow) {
            return this.$moveLines(firstRow, lastRow, -1);
        };
        /**
        * Shifts all the lines in the document down one, starting from `firstRow` and ending at `lastRow`.
        * @param {Number} firstRow The starting row to move down
        * @param {Number} lastRow The final row to move down
        * @returns {Number} If `firstRow` is less-than or equal to 0, this function returns 0. Otherwise, on success, it returns -1.
        *
        * @related EditorDocument.insertLines
        **/
        EditSession.prototype.moveLinesDown = function (firstRow, lastRow) {
            return this.$moveLines(firstRow, lastRow, 1);
        };
        /**
        * Duplicates all the text between `firstRow` and `lastRow`.
        * @param {Number} firstRow The starting row to duplicate
        * @param {Number} lastRow The final row to duplicate
        * @returns {Number} Returns the number of new rows added; in other words, `lastRow - firstRow + 1`.
        *
        *
        **/
        EditSession.prototype.duplicateLines = function (firstRow, lastRow) {
            return this.$moveLines(firstRow, lastRow, 0);
        };
        EditSession.prototype.$clipRowToDocument = function (row) {
            return Math.max(0, Math.min(row, this.doc.getLength() - 1));
        };
        EditSession.prototype.$clipColumnToRow = function (row, column) {
            if (column < 0)
                return 0;
            return Math.min(this.doc.getLine(row).length, column);
        };
        EditSession.prototype.$clipPositionToDocument = function (row, column) {
            column = Math.max(0, column);
            if (row < 0) {
                row = 0;
                column = 0;
            }
            else {
                var len = this.doc.getLength();
                if (row >= len) {
                    row = len - 1;
                    column = this.doc.getLine(len - 1).length;
                }
                else {
                    column = Math.min(this.doc.getLine(row).length, column);
                }
            }
            return {
                row: row,
                column: column
            };
        };
        EditSession.prototype.$clipRangeToDocument = function (range) {
            if (range.start.row < 0) {
                range.start.row = 0;
                range.start.column = 0;
            }
            else {
                range.start.column = this.$clipColumnToRow(range.start.row, range.start.column);
            }
            var len = this.doc.getLength() - 1;
            if (range.end.row > len) {
                range.end.row = len;
                range.end.column = this.doc.getLine(len).length;
            }
            else {
                range.end.column = this.$clipColumnToRow(range.end.row, range.end.column);
            }
            return range;
        };
        /**
         * Sets whether or not line wrapping is enabled. If `useWrapMode` is different than the current value, the `'changeWrapMode'` event is emitted.
         * @param {Boolean} useWrapMode Enable (or disable) wrap mode
         *
        *
        **/
        EditSession.prototype.setUseWrapMode = function (useWrapMode) {
            if (useWrapMode != this.$useWrapMode) {
                this.$useWrapMode = useWrapMode;
                this.$modified = true;
                this.$resetRowCache(0);
                // If wrapMode is activaed, the wrapData array has to be initialized.
                if (useWrapMode) {
                    var len = this.getLength();
                    this.$wrapData = Array(len);
                    this.$updateWrapData(0, len - 1);
                }
                this._signal("changeWrapMode");
            }
        };
        /**
        * Returns `true` if wrap mode is being used; `false` otherwise.
        * @returns {Boolean}
        **/
        EditSession.prototype.getUseWrapMode = function () {
            return this.$useWrapMode;
        };
        // Allow the wrap limit to move freely between min and max. Either
        // parameter can be null to allow the wrap limit to be unconstrained
        // in that direction. Or set both parameters to the same number to pin
        // the limit to that value.
        /**
         * Sets the boundaries of wrap. Either value can be `null` to have an unconstrained wrap, or, they can be the same number to pin the limit. If the wrap limits for `min` or `max` are different, this method also emits the `'changeWrapMode'` event.
         * @param {Number} min The minimum wrap value (the left side wrap)
         * @param {Number} max The maximum wrap value (the right side wrap)
         *
        *
        **/
        EditSession.prototype.setWrapLimitRange = function (min, max) {
            if (this.$wrapLimitRange.min !== min || this.$wrapLimitRange.max !== max) {
                this.$wrapLimitRange = {
                    min: min,
                    max: max
                };
                this.$modified = true;
                // This will force a recalculation of the wrap limit
                this._signal("changeWrapMode");
            }
        };
        /**
        * This should generally only be called by the renderer when a resize is detected.
        * @param {Number} desiredLimit The new wrap limit
        * @returns {Boolean}
        *
        * @private
        **/
        EditSession.prototype.adjustWrapLimit = function (desiredLimit, $printMargin) {
            var limits = this.$wrapLimitRange;
            if (limits.max < 0)
                limits = { min: $printMargin, max: $printMargin };
            var wrapLimit = this.$constrainWrapLimit(desiredLimit, limits.min, limits.max);
            if (wrapLimit != this.$wrapLimit && wrapLimit > 1) {
                this.$wrapLimit = wrapLimit;
                this.$modified = true;
                if (this.$useWrapMode) {
                    this.$updateWrapData(0, this.getLength() - 1);
                    this.$resetRowCache(0);
                    this._signal("changeWrapLimit");
                }
                return true;
            }
            return false;
        };
        EditSession.prototype.$constrainWrapLimit = function (wrapLimit, min, max) {
            if (min)
                wrapLimit = Math.max(min, wrapLimit);
            if (max)
                wrapLimit = Math.min(max, wrapLimit);
            return wrapLimit;
        };
        /**
        * Returns the value of wrap limit.
        * @returns {Number} The wrap limit.
        **/
        EditSession.prototype.getWrapLimit = function () {
            return this.$wrapLimit;
        };
        /**
         * Sets the line length for soft wrap in the editor. Lines will break
         *  at a minimum of the given length minus 20 chars and at a maximum
         *  of the given number of chars.
         * @param {number} limit The maximum line length in chars, for soft wrapping lines.
         */
        EditSession.prototype.setWrapLimit = function (limit) {
            this.setWrapLimitRange(limit, limit);
        };
        /**
        * Returns an object that defines the minimum and maximum of the wrap limit; it looks something like this:
        *
        *     { min: wrapLimitRange_min, max: wrapLimitRange_max }
        *
        * @returns {Object}
        **/
        EditSession.prototype.getWrapLimitRange = function () {
            // Avoid unexpected mutation by returning a copy
            return {
                min: this.$wrapLimitRange.min,
                max: this.$wrapLimitRange.max
            };
        };
        EditSession.prototype.$updateInternalDataOnChange = function (e) {
            var useWrapMode = this.$useWrapMode;
            var len;
            var action = e.data.action;
            var firstRow = e.data.range.start.row;
            var lastRow = e.data.range.end.row;
            var start = e.data.range.start;
            var end = e.data.range.end;
            var removedFolds = null;
            if (action.indexOf("Lines") != -1) {
                if (action == "insertLines") {
                    lastRow = firstRow + (e.data.lines.length);
                }
                else {
                    lastRow = firstRow;
                }
                len = e.data.lines ? e.data.lines.length : lastRow - firstRow;
            }
            else {
                len = lastRow - firstRow;
            }
            this.$updating = true;
            if (len != 0) {
                if (action.indexOf("remove") != -1) {
                    this[useWrapMode ? "$wrapData" : "$rowLengthCache"].splice(firstRow, len);
                    var foldLines = this.$foldData;
                    removedFolds = this.getFoldsInRange(e.data.range);
                    this.removeFolds(removedFolds);
                    var foldLine = this.getFoldLine(end.row);
                    var idx = 0;
                    if (foldLine) {
                        foldLine.addRemoveChars(end.row, end.column, start.column - end.column);
                        foldLine.shiftRow(-len);
                        var foldLineBefore = this.getFoldLine(firstRow);
                        if (foldLineBefore && foldLineBefore !== foldLine) {
                            foldLineBefore.merge(foldLine);
                            foldLine = foldLineBefore;
                        }
                        idx = foldLines.indexOf(foldLine) + 1;
                    }
                    for (idx; idx < foldLines.length; idx++) {
                        var foldLine = foldLines[idx];
                        if (foldLine.start.row >= end.row) {
                            foldLine.shiftRow(-len);
                        }
                    }
                    lastRow = firstRow;
                }
                else {
                    var args = Array(len);
                    args.unshift(firstRow, 0);
                    var arr = useWrapMode ? this.$wrapData : this.$rowLengthCache;
                    arr.splice.apply(arr, args);
                    // If some new line is added inside of a foldLine, then split
                    // the fold line up.
                    var foldLines = this.$foldData;
                    var foldLine = this.getFoldLine(firstRow);
                    var idx = 0;
                    if (foldLine) {
                        var cmp = foldLine.range.compareInside(start.row, start.column);
                        // Inside of the foldLine range. Need to split stuff up.
                        if (cmp == 0) {
                            foldLine = foldLine.split(start.row, start.column);
                            foldLine.shiftRow(len);
                            foldLine.addRemoveChars(lastRow, 0, end.column - start.column);
                        }
                        else 
                        // Infront of the foldLine but same row. Need to shift column.
                        if (cmp == -1) {
                            foldLine.addRemoveChars(firstRow, 0, end.column - start.column);
                            foldLine.shiftRow(len);
                        }
                        // Nothing to do if the insert is after the foldLine.
                        idx = foldLines.indexOf(foldLine) + 1;
                    }
                    for (idx; idx < foldLines.length; idx++) {
                        var foldLine = foldLines[idx];
                        if (foldLine.start.row >= firstRow) {
                            foldLine.shiftRow(len);
                        }
                    }
                }
            }
            else {
                // Realign folds. E.g. if you add some new chars before a fold, the
                // fold should "move" to the right.
                len = Math.abs(e.data.range.start.column - e.data.range.end.column);
                if (action.indexOf("remove") != -1) {
                    // Get all the folds in the change range and remove them.
                    removedFolds = this.getFoldsInRange(e.data.range);
                    this.removeFolds(removedFolds);
                    len = -len;
                }
                var foldLine = this.getFoldLine(firstRow);
                if (foldLine) {
                    foldLine.addRemoveChars(firstRow, start.column, len);
                }
            }
            if (useWrapMode && this.$wrapData.length != this.doc.getLength()) {
                console.error("doc.getLength() and $wrapData.length have to be the same!");
            }
            this.$updating = false;
            if (useWrapMode)
                this.$updateWrapData(firstRow, lastRow);
            else
                this.$updateRowLengthCache(firstRow, lastRow);
            return removedFolds;
        };
        EditSession.prototype.$updateRowLengthCache = function (firstRow, lastRow, b) {
            this.$rowLengthCache[firstRow] = null;
            this.$rowLengthCache[lastRow] = null;
        };
        EditSession.prototype.$updateWrapData = function (firstRow, lastRow) {
            var lines = this.doc.getAllLines();
            var tabSize = this.getTabSize();
            var wrapData = this.$wrapData;
            var wrapLimit = this.$wrapLimit;
            var tokens;
            var foldLine;
            var row = firstRow;
            lastRow = Math.min(lastRow, lines.length - 1);
            while (row <= lastRow) {
                foldLine = this.getFoldLine(row, foldLine);
                if (!foldLine) {
                    tokens = this.$getDisplayTokens(lines[row]);
                    wrapData[row] = this.$computeWrapSplits(tokens, wrapLimit, tabSize);
                    row++;
                }
                else {
                    tokens = [];
                    foldLine.walk(function (placeholder, row, column, lastColumn) {
                        var walkTokens;
                        if (placeholder != null) {
                            walkTokens = this.$getDisplayTokens(placeholder, tokens.length);
                            walkTokens[0] = PLACEHOLDER_START;
                            for (var i = 1; i < walkTokens.length; i++) {
                                walkTokens[i] = PLACEHOLDER_BODY;
                            }
                        }
                        else {
                            walkTokens = this.$getDisplayTokens(lines[row].substring(lastColumn, column), tokens.length);
                        }
                        tokens = tokens.concat(walkTokens);
                    }.bind(this), foldLine.end.row, lines[foldLine.end.row].length + 1);
                    wrapData[foldLine.start.row] = this.$computeWrapSplits(tokens, wrapLimit, tabSize);
                    row = foldLine.end.row + 1;
                }
            }
        };
        EditSession.prototype.$computeWrapSplits = function (tokens, wrapLimit, tabSize) {
            if (tokens.length == 0) {
                return [];
            }
            var splits = [];
            var displayLength = tokens.length;
            var lastSplit = 0, lastDocSplit = 0;
            var isCode = this.$wrapAsCode;
            function addSplit(screenPos) {
                var displayed = tokens.slice(lastSplit, screenPos);
                // The document size is the current size - the extra width for tabs
                // and multipleWidth characters.
                var len = displayed.length;
                displayed.join("").
                    // Get all the TAB_SPACEs.
                    replace(/12/g, function () {
                    len -= 1;
                    return void 0;
                }).
                    // Get all the CHAR_EXT/multipleWidth characters.
                    replace(/2/g, function () {
                    len -= 1;
                    return void 0;
                });
                lastDocSplit += len;
                splits.push(lastDocSplit);
                lastSplit = screenPos;
            }
            while (displayLength - lastSplit > wrapLimit) {
                // This is, where the split should be.
                var split = lastSplit + wrapLimit;
                // If there is a space or tab at this split position, then making
                // a split is simple.
                if (tokens[split - 1] >= SPACE && tokens[split] >= SPACE) {
                    /* disabled see https://github.com/ajaxorg/ace/issues/1186
                    // Include all following spaces + tabs in this split as well.
                    while (tokens[split] >= SPACE) {
                        split ++;
                    } */
                    addSplit(split);
                    continue;
                }
                // === ELSE ===
                // Check if split is inside of a placeholder. Placeholder are
                // not splitable. Therefore, seek the beginning of the placeholder
                // and try to place the split beofre the placeholder's start.
                if (tokens[split] == PLACEHOLDER_START || tokens[split] == PLACEHOLDER_BODY) {
                    // Seek the start of the placeholder and do the split
                    // before the placeholder. By definition there always
                    // a PLACEHOLDER_START between split and lastSplit.
                    for (split; split != lastSplit - 1; split--) {
                        if (tokens[split] == PLACEHOLDER_START) {
                            // split++; << No incremental here as we want to
                            //  have the position before the Placeholder.
                            break;
                        }
                    }
                    // If the PLACEHOLDER_START is not the index of the
                    // last split, then we can do the split
                    if (split > lastSplit) {
                        addSplit(split);
                        continue;
                    }
                    // If the PLACEHOLDER_START IS the index of the last
                    // split, then we have to place the split after the
                    // placeholder. So, let's seek for the end of the placeholder.
                    split = lastSplit + wrapLimit;
                    for (split; split < tokens.length; split++) {
                        if (tokens[split] != PLACEHOLDER_BODY) {
                            break;
                        }
                    }
                    // If spilt == tokens.length, then the placeholder is the last
                    // thing in the line and adding a new split doesn't make sense.
                    if (split == tokens.length) {
                        break; // Breaks the while-loop.
                    }
                    // Finally, add the split...
                    addSplit(split);
                    continue;
                }
                // === ELSE ===
                // Search for the first non space/tab/placeholder/punctuation token backwards.
                var minSplit = Math.max(split - (isCode ? 10 : wrapLimit - (wrapLimit >> 2)), lastSplit - 1);
                while (split > minSplit && tokens[split] < PLACEHOLDER_START) {
                    split--;
                }
                if (isCode) {
                    while (split > minSplit && tokens[split] < PLACEHOLDER_START) {
                        split--;
                    }
                    while (split > minSplit && tokens[split] == PUNCTUATION) {
                        split--;
                    }
                }
                else {
                    while (split > minSplit && tokens[split] < SPACE) {
                        split--;
                    }
                }
                // If we found one, then add the split.
                if (split > minSplit) {
                    addSplit(++split);
                    continue;
                }
                // === ELSE ===
                split = lastSplit + wrapLimit;
                // The split is inside of a CHAR or CHAR_EXT token and no space
                // around -> force a split.
                addSplit(split);
            }
            return splits;
        };
        /**
        * Given a string, returns an array of the display characters, including tabs and spaces.
        * @param {String} str The string to check
        * @param {Number} offset The value to start at
        *
        *
        **/
        EditSession.prototype.$getDisplayTokens = function (str, offset) {
            var arr = [];
            var tabSize;
            offset = offset || 0;
            for (var i = 0; i < str.length; i++) {
                var c = str.charCodeAt(i);
                // Tab
                if (c == 9) {
                    tabSize = this.getScreenTabSize(arr.length + offset);
                    arr.push(TAB);
                    for (var n = 1; n < tabSize; n++) {
                        arr.push(TAB_SPACE);
                    }
                }
                else if (c == 32) {
                    arr.push(SPACE);
                }
                else if ((c > 39 && c < 48) || (c > 57 && c < 64)) {
                    arr.push(PUNCTUATION);
                }
                else if (c >= 0x1100 && isFullWidth(c)) {
                    arr.push(CHAR, CHAR_EXT);
                }
                else {
                    arr.push(CHAR);
                }
            }
            return arr;
        };
        /**
         * Calculates the width of the string `str` on the screen while assuming that the string starts at the first column on the screen.
        * @param {String} str The string to calculate the screen width of
        * @param {Number} maxScreenColumn
        * @param {Number} screenColumn
        * @returns {[Number]} Returns an `int[]` array with two elements:<br/>
        * The first position indicates the number of columns for `str` on screen.<br/>
        * The second value contains the position of the document column that this function read until.
        *
        **/
        EditSession.prototype.$getStringScreenWidth = function (str, maxScreenColumn, screenColumn) {
            if (maxScreenColumn == 0)
                return [0, 0];
            if (maxScreenColumn == null)
                maxScreenColumn = Infinity;
            screenColumn = screenColumn || 0;
            var c;
            var column;
            for (column = 0; column < str.length; column++) {
                c = str.charCodeAt(column);
                // tab
                if (c == 9) {
                    screenColumn += this.getScreenTabSize(screenColumn);
                }
                else if (c >= 0x1100 && isFullWidth(c)) {
                    screenColumn += 2;
                }
                else {
                    screenColumn += 1;
                }
                if (screenColumn > maxScreenColumn) {
                    break;
                }
            }
            return [screenColumn, column];
        };
        /**
        * Returns number of screenrows in a wrapped line.
        * @param {Number} row The row number to check
        *
        * @returns {Number}
        **/
        EditSession.prototype.getRowLength = function (row) {
            if (this.lineWidgets)
                var h = this.lineWidgets[row] && this.lineWidgets[row].rowCount || 0;
            else
                h = 0;
            if (!this.$useWrapMode || !this.$wrapData[row]) {
                return 1 + h;
            }
            else {
                return this.$wrapData[row].length + 1 + h;
            }
        };
        EditSession.prototype.getRowLineCount = function (row) {
            if (!this.$useWrapMode || !this.$wrapData[row]) {
                return 1;
            }
            else {
                return this.$wrapData[row].length + 1;
            }
        };
        EditSession.prototype.getRowWrapIndent = function (screenRow) {
            if (this.$useWrapMode) {
                var pos = this.screenToDocumentPosition(screenRow, Number.MAX_VALUE);
                var splits = this.$wrapData[pos.row];
                // FIXME: indent does not exists on number[]
                return splits.length && splits[0] < pos.column ? splits['indent'] : 0;
            }
            else {
                return 0;
            }
        };
        /**
         * Returns the position (on screen) for the last character in the provided screen row.
         * @param {Number} screenRow The screen row to check
         * @returns {Number}
         *
         * @related EditSession.documentToScreenColumn
        **/
        EditSession.prototype.getScreenLastRowColumn = function (screenRow) {
            var pos = this.screenToDocumentPosition(screenRow, Number.MAX_VALUE);
            return this.documentToScreenColumn(pos.row, pos.column);
        };
        /**
        * For the given document row and column, this returns the column position of the last screen row.
        * @param {Number} docRow
        *
        * @param {Number} docColumn
        **/
        EditSession.prototype.getDocumentLastRowColumn = function (docRow, docColumn) {
            var screenRow = this.documentToScreenRow(docRow, docColumn);
            return this.getScreenLastRowColumn(screenRow);
        };
        /**
        * For the given document row and column, this returns the document position of the last row.
        * @param {Number} docRow
        * @param {Number} docColumn
        *
        *
        **/
        EditSession.prototype.getDocumentLastRowColumnPosition = function (docRow, docColumn) {
            var screenRow = this.documentToScreenRow(docRow, docColumn);
            return this.screenToDocumentPosition(screenRow, Number.MAX_VALUE / 10);
        };
        /**
        * For the given row, this returns the split data.
        * @returns {String}
        **/
        EditSession.prototype.getRowSplitData = function (row) {
            if (!this.$useWrapMode) {
                return undefined;
            }
            else {
                return this.$wrapData[row];
            }
        };
        /**
         * The distance to the next tab stop at the specified screen column.
         * @methos getScreenTabSize
         * @param screenColumn {number} The screen column to check
         * @return {number}
         */
        EditSession.prototype.getScreenTabSize = function (screenColumn) {
            return this.$tabSize - screenColumn % this.$tabSize;
        };
        EditSession.prototype.screenToDocumentRow = function (screenRow, screenColumn) {
            return this.screenToDocumentPosition(screenRow, screenColumn).row;
        };
        EditSession.prototype.screenToDocumentColumn = function (screenRow, screenColumn) {
            return this.screenToDocumentPosition(screenRow, screenColumn).column;
        };
        /**
        * Converts characters coordinates on the screen to characters coordinates within the document. [This takes into account code folding, word wrap, tab size, and any other visual modifications.]{: #conversionConsiderations}
        * @param {number} screenRow The screen row to check
        * @param {number} screenColumn The screen column to check
        * @returns {Object} The object returned has two properties: `row` and `column`.
        **/
        EditSession.prototype.screenToDocumentPosition = function (screenRow, screenColumn) {
            if (screenRow < 0) {
                return { row: 0, column: 0 };
            }
            var line;
            var docRow = 0;
            var docColumn = 0;
            var column;
            var row = 0;
            var rowLength = 0;
            var rowCache = this.$screenRowCache;
            var i = this.$getRowCacheIndex(rowCache, screenRow);
            var l = rowCache.length;
            if (l && i >= 0) {
                var row = rowCache[i];
                var docRow = this.$docRowCache[i];
                var doCache = screenRow > rowCache[l - 1];
            }
            else {
                var doCache = !l;
            }
            var maxRow = this.getLength() - 1;
            var foldLine = this.getNextFoldLine(docRow);
            var foldStart = foldLine ? foldLine.start.row : Infinity;
            while (row <= screenRow) {
                rowLength = this.getRowLength(docRow);
                if (row + rowLength > screenRow || docRow >= maxRow) {
                    break;
                }
                else {
                    row += rowLength;
                    docRow++;
                    if (docRow > foldStart) {
                        docRow = foldLine.end.row + 1;
                        foldLine = this.getNextFoldLine(docRow, foldLine);
                        foldStart = foldLine ? foldLine.start.row : Infinity;
                    }
                }
                if (doCache) {
                    this.$docRowCache.push(docRow);
                    this.$screenRowCache.push(row);
                }
            }
            if (foldLine && foldLine.start.row <= docRow) {
                line = this.getFoldDisplayLine(foldLine);
                docRow = foldLine.start.row;
            }
            else if (row + rowLength <= screenRow || docRow > maxRow) {
                // clip at the end of the document
                return {
                    row: maxRow,
                    column: this.getLine(maxRow).length
                };
            }
            else {
                line = this.getLine(docRow);
                foldLine = null;
            }
            if (this.$useWrapMode) {
                var splits = this.$wrapData[docRow];
                if (splits) {
                    var splitIndex = Math.floor(screenRow - row);
                    column = splits[splitIndex];
                    if (splitIndex > 0 && splits.length) {
                        docColumn = splits[splitIndex - 1] || splits[splits.length - 1];
                        line = line.substring(docColumn);
                    }
                }
            }
            docColumn += this.$getStringScreenWidth(line, screenColumn)[1];
            // We remove one character at the end so that the docColumn
            // position returned is not associated to the next row on the screen.
            if (this.$useWrapMode && docColumn >= column)
                docColumn = column - 1;
            if (foldLine)
                return foldLine.idxToPosition(docColumn);
            return { row: docRow, column: docColumn };
        };
        /**
        * Converts document coordinates to screen coordinates. {:conversionConsiderations}
        * @param {Number} docRow The document row to check
        * @param {Number} docColumn The document column to check
        * @returns {Object} The object returned by this method has two properties: `row` and `column`.
        *
        * @related EditSession.screenToDocumentPosition
        **/
        EditSession.prototype.documentToScreenPosition = function (docRow, docColumn) {
            var pos;
            // Normalize the passed in arguments.
            if (typeof docColumn === "undefined") {
                pos = this.$clipPositionToDocument(docRow['row'], docRow['column']);
            }
            else {
                asserts_1.assert(typeof docRow === 'number', "docRow must be a number");
                asserts_1.assert(typeof docColumn === 'number', "docColumn must be a number");
                pos = this.$clipPositionToDocument(docRow, docColumn);
            }
            docRow = pos.row;
            docColumn = pos.column;
            asserts_1.assert(typeof docRow === 'number', "docRow must be a number");
            asserts_1.assert(typeof docColumn === 'number', "docColumn must be a number");
            var screenRow = 0;
            var foldStartRow = null;
            var fold = null;
            // Clamp the docRow position in case it's inside of a folded block.
            fold = this.getFoldAt(docRow, docColumn, 1);
            if (fold) {
                docRow = fold.start.row;
                docColumn = fold.start.column;
            }
            var rowEnd, row = 0;
            var rowCache = this.$docRowCache;
            var i = this.$getRowCacheIndex(rowCache, docRow);
            var l = rowCache.length;
            if (l && i >= 0) {
                var row = rowCache[i];
                var screenRow = this.$screenRowCache[i];
                var doCache = docRow > rowCache[l - 1];
            }
            else {
                var doCache = !l;
            }
            var foldLine = this.getNextFoldLine(row);
            var foldStart = foldLine ? foldLine.start.row : Infinity;
            while (row < docRow) {
                if (row >= foldStart) {
                    rowEnd = foldLine.end.row + 1;
                    if (rowEnd > docRow)
                        break;
                    foldLine = this.getNextFoldLine(rowEnd, foldLine);
                    foldStart = foldLine ? foldLine.start.row : Infinity;
                }
                else {
                    rowEnd = row + 1;
                }
                screenRow += this.getRowLength(row);
                row = rowEnd;
                if (doCache) {
                    this.$docRowCache.push(row);
                    this.$screenRowCache.push(screenRow);
                }
            }
            // Calculate the text line that is displayed in docRow on the screen.
            var textLine = "";
            // Check if the final row we want to reach is inside of a fold.
            if (foldLine && row >= foldStart) {
                textLine = this.getFoldDisplayLine(foldLine, docRow, docColumn);
                foldStartRow = foldLine.start.row;
            }
            else {
                textLine = this.getLine(docRow).substring(0, docColumn);
                foldStartRow = docRow;
            }
            // Clamp textLine if in wrapMode.
            if (this.$useWrapMode) {
                var wrapRow = this.$wrapData[foldStartRow];
                if (wrapRow) {
                    var screenRowOffset = 0;
                    while (textLine.length >= wrapRow[screenRowOffset]) {
                        screenRow++;
                        screenRowOffset++;
                    }
                    textLine = textLine.substring(wrapRow[screenRowOffset - 1] || 0, textLine.length);
                }
            }
            return {
                row: screenRow,
                column: this.$getStringScreenWidth(textLine)[0]
            };
        };
        /**
        * For the given document row and column, returns the screen column.
        * @param {Number} docRow
        * @param {Number} docColumn
        * @returns {Number}
        *
        **/
        EditSession.prototype.documentToScreenColumn = function (docRow, docColumn) {
            return this.documentToScreenPosition(docRow, docColumn).column;
        };
        /**
        * For the given document row and column, returns the screen row.
        * @param {Number} docRow
        * @param {Number} docColumn
        **/
        EditSession.prototype.documentToScreenRow = function (docRow, docColumn) {
            return this.documentToScreenPosition(docRow, docColumn).row;
        };
        EditSession.prototype.documentToScreenRange = function (range) {
            var screenPosStart = this.documentToScreenPosition(range.start.row, range.start.column);
            var screenPosEnd = this.documentToScreenPosition(range.end.row, range.end.column);
            return new Range_1.default(screenPosStart.row, screenPosStart.column, screenPosEnd.row, screenPosEnd.column);
        };
        /**
        * Returns the length of the screen.
        * @returns {Number}
        **/
        EditSession.prototype.getScreenLength = function () {
            var screenRows = 0;
            var fold = null;
            if (!this.$useWrapMode) {
                screenRows = this.getLength();
                // Remove the folded lines again.
                var foldData = this.$foldData;
                for (var i = 0; i < foldData.length; i++) {
                    fold = foldData[i];
                    screenRows -= fold.end.row - fold.start.row;
                }
            }
            else {
                var lastRow = this.$wrapData.length;
                var row = 0, i = 0;
                var fold = this.$foldData[i++];
                var foldStart = fold ? fold.start.row : Infinity;
                while (row < lastRow) {
                    var splits = this.$wrapData[row];
                    screenRows += splits ? splits.length + 1 : 1;
                    row++;
                    if (row > foldStart) {
                        row = fold.end.row + 1;
                        fold = this.$foldData[i++];
                        foldStart = fold ? fold.start.row : Infinity;
                    }
                }
            }
            // todo
            if (this.lineWidgets) {
                screenRows += this.$getWidgetScreenLength();
            }
            return screenRows;
        };
        /**
         * @private
         */
        EditSession.prototype.$setFontMetrics = function (fm) {
            // TODO?
        };
        EditSession.prototype.findMatchingBracket = function (position, chr) {
            return this.$bracketMatcher.findMatchingBracket(position, chr);
        };
        EditSession.prototype.getBracketRange = function (position) {
            return this.$bracketMatcher.getBracketRange(position);
        };
        EditSession.prototype.$findOpeningBracket = function (bracket, position, typeRe) {
            return this.$bracketMatcher.$findOpeningBracket(bracket, position, typeRe);
        };
        EditSession.prototype.$findClosingBracket = function (bracket, position, typeRe) {
            return this.$bracketMatcher.$findClosingBracket(bracket, position, typeRe);
        };
        /*
         * Looks up a fold at a given row/column. Possible values for side:
         *   -1: ignore a fold if fold.start = row/column
         *   +1: ignore a fold if fold.end = row/column
         */
        EditSession.prototype.getFoldAt = function (row, column, side) {
            var foldLine = this.getFoldLine(row);
            if (!foldLine)
                return null;
            var folds = foldLine.folds;
            for (var i = 0; i < folds.length; i++) {
                var fold = folds[i];
                if (fold.range.contains(row, column)) {
                    if (side === 1 && fold.range.isEnd(row, column)) {
                        continue;
                    }
                    else if (side === -1 && fold.range.isStart(row, column)) {
                        continue;
                    }
                    return fold;
                }
            }
        };
        /*
         * Returns all folds in the given range. Note, that this will return folds
         *
         */
        EditSession.prototype.getFoldsInRange = function (range) {
            var start = range.start;
            var end = range.end;
            var foldLines = this.$foldData;
            var foundFolds = [];
            start.column += 1;
            end.column -= 1;
            for (var i = 0; i < foldLines.length; i++) {
                var cmp = foldLines[i].range.compareRange(range);
                if (cmp == 2) {
                    // Range is before foldLine. No intersection. This means,
                    // there might be other foldLines that intersect.
                    continue;
                }
                else if (cmp == -2) {
                    // Range is after foldLine. There can't be any other foldLines then,
                    // so let's give up.
                    break;
                }
                var folds = foldLines[i].folds;
                for (var j = 0; j < folds.length; j++) {
                    var fold = folds[j];
                    cmp = fold.range.compareRange(range);
                    if (cmp == -2) {
                        break;
                    }
                    else if (cmp == 2) {
                        continue;
                    }
                    else 
                    // WTF-state: Can happen due to -1/+1 to start/end column.
                    if (cmp == 42) {
                        break;
                    }
                    foundFolds.push(fold);
                }
            }
            start.column -= 1;
            end.column += 1;
            return foundFolds;
        };
        EditSession.prototype.getFoldsInRangeList = function (ranges) {
            if (Array.isArray(ranges)) {
                var folds = [];
                ranges.forEach(function (range) {
                    folds = folds.concat(this.getFoldsInRange(range));
                }, this);
            }
            else {
                var folds = this.getFoldsInRange(ranges);
            }
            return folds;
        };
        /*
         * Returns all folds in the document
         */
        EditSession.prototype.getAllFolds = function () {
            var folds = [];
            var foldLines = this.$foldData;
            for (var i = 0; i < foldLines.length; i++)
                for (var j = 0; j < foldLines[i].folds.length; j++)
                    folds.push(foldLines[i].folds[j]);
            return folds;
        };
        /*
         * Returns the string between folds at the given position.
         * E.g.
         *  foo<fold>b|ar<fold>wolrd -> "bar"
         *  foo<fold>bar<fold>wol|rd -> "world"
         *  foo<fold>bar<fo|ld>wolrd -> <null>
         *
         * where | means the position of row/column
         *
         * The trim option determs if the return string should be trimed according
         * to the "side" passed with the trim value:
         *
         * E.g.
         *  foo<fold>b|ar<fold>wolrd -trim=-1> "b"
         *  foo<fold>bar<fold>wol|rd -trim=+1> "rld"
         *  fo|o<fold>bar<fold>wolrd -trim=00> "foo"
         */
        EditSession.prototype.getFoldStringAt = function (row, column, trim, foldLine) {
            foldLine = foldLine || this.getFoldLine(row);
            if (!foldLine)
                return null;
            var lastFold = {
                end: { column: 0 }
            };
            // TODO: Refactor to use getNextFoldTo function.
            var str;
            var fold;
            for (var i = 0; i < foldLine.folds.length; i++) {
                fold = foldLine.folds[i];
                var cmp = fold.range.compareEnd(row, column);
                if (cmp == -1) {
                    str = this.getLine(fold.start.row).substring(lastFold.end.column, fold.start.column);
                    break;
                }
                else if (cmp === 0) {
                    return null;
                }
                lastFold = fold;
            }
            if (!str)
                str = this.getLine(fold.start.row).substring(lastFold.end.column);
            if (trim == -1)
                return str.substring(0, column - lastFold.end.column);
            else if (trim == 1)
                return str.substring(column - lastFold.end.column);
            else
                return str;
        };
        EditSession.prototype.getFoldLine = function (docRow, startFoldLine) {
            var foldData = this.$foldData;
            var i = 0;
            if (startFoldLine)
                i = foldData.indexOf(startFoldLine);
            if (i == -1)
                i = 0;
            for (i; i < foldData.length; i++) {
                var foldLine = foldData[i];
                if (foldLine.start.row <= docRow && foldLine.end.row >= docRow) {
                    return foldLine;
                }
                else if (foldLine.end.row > docRow) {
                    return null;
                }
            }
            return null;
        };
        // returns the fold which starts after or contains docRow
        EditSession.prototype.getNextFoldLine = function (docRow, startFoldLine) {
            var foldData = this.$foldData;
            var i = 0;
            if (startFoldLine)
                i = foldData.indexOf(startFoldLine);
            if (i == -1)
                i = 0;
            for (i; i < foldData.length; i++) {
                var foldLine = foldData[i];
                if (foldLine.end.row >= docRow) {
                    return foldLine;
                }
            }
            return null;
        };
        EditSession.prototype.getFoldedRowCount = function (first, last) {
            var foldData = this.$foldData;
            var rowCount = last - first + 1;
            for (var i = 0; i < foldData.length; i++) {
                var foldLine = foldData[i], end = foldLine.end.row, start = foldLine.start.row;
                if (end >= last) {
                    if (start < last) {
                        if (start >= first)
                            rowCount -= last - start;
                        else
                            rowCount = 0; //in one fold
                    }
                    break;
                }
                else if (end >= first) {
                    if (start >= first)
                        rowCount -= end - start;
                    else
                        rowCount -= end - first + 1;
                }
            }
            return rowCount;
        };
        EditSession.prototype.$addFoldLine = function (foldLine) {
            this.$foldData.push(foldLine);
            this.$foldData.sort(function (a, b) {
                return a.start.row - b.start.row;
            });
            return foldLine;
        };
        /**
         * Adds a new fold.
         *
         * @returns
         *      The new created Fold object or an existing fold object in case the
         *      passed in range fits an existing fold exactly.
         */
        EditSession.prototype.addFold = function (placeholder, range) {
            var foldData = this.$foldData;
            var added = false;
            var fold;
            if (placeholder instanceof Fold_1.default)
                fold = placeholder;
            else if (typeof placeholder === 'string') {
                fold = new Fold_1.default(range, placeholder);
                fold.collapseChildren = range.collapseChildren;
            }
            else {
                throw new Error("placeholder must be a string or a Fold.");
            }
            // FIXME: $clipRangeToDocument?
            // fold.range = this.clipRange(fold.range);
            fold.range = this.$clipRangeToDocument(fold.range);
            var startRow = fold.start.row;
            var startColumn = fold.start.column;
            var endRow = fold.end.row;
            var endColumn = fold.end.column;
            // --- Some checking ---
            if (!(startRow < endRow ||
                startRow == endRow && startColumn <= endColumn - 2))
                throw new Error("The range has to be at least 2 characters width");
            var startFold = this.getFoldAt(startRow, startColumn, 1);
            var endFold = this.getFoldAt(endRow, endColumn, -1);
            if (startFold && endFold == startFold)
                return startFold.addSubFold(fold);
            if ((startFold && !startFold.range.isStart(startRow, startColumn))
                || (endFold && !endFold.range.isEnd(endRow, endColumn))) {
                throw new Error("A fold can't intersect already existing fold" + fold.range + startFold.range);
            }
            // Check if there are folds in the range we create the new fold for.
            var folds = this.getFoldsInRange(fold.range);
            if (folds.length > 0) {
                // Remove the folds from fold data.
                this.removeFolds(folds);
                // Add the removed folds as subfolds on the new fold.
                folds.forEach(function (subFold) {
                    fold.addSubFold(subFold);
                });
            }
            for (var i = 0; i < foldData.length; i++) {
                var foldLine = foldData[i];
                if (endRow == foldLine.start.row) {
                    foldLine.addFold(fold);
                    added = true;
                    break;
                }
                else if (startRow == foldLine.end.row) {
                    foldLine.addFold(fold);
                    added = true;
                    if (!fold.sameRow) {
                        // Check if we might have to merge two FoldLines.
                        var foldLineNext = foldData[i + 1];
                        if (foldLineNext && foldLineNext.start.row == endRow) {
                            // We need to merge!
                            foldLine.merge(foldLineNext);
                            break;
                        }
                    }
                    break;
                }
                else if (endRow <= foldLine.start.row) {
                    break;
                }
            }
            if (!added)
                foldLine = this.$addFoldLine(new FoldLine_1.default(this.$foldData, fold));
            if (this.$useWrapMode)
                this.$updateWrapData(foldLine.start.row, foldLine.start.row);
            else
                this.$updateRowLengthCache(foldLine.start.row, foldLine.start.row);
            // Notify that fold data has changed.
            this.setModified(true);
            this._emit("changeFold", { data: fold, action: "add" });
            return fold;
        };
        EditSession.prototype.setModified = function (modified) {
        };
        EditSession.prototype.addFolds = function (folds) {
            folds.forEach(function (fold) {
                this.addFold(fold);
            }, this);
        };
        EditSession.prototype.removeFold = function (fold) {
            var foldLine = fold.foldLine;
            var startRow = foldLine.start.row;
            var endRow = foldLine.end.row;
            var foldLines = this.$foldData;
            var folds = foldLine.folds;
            // Simple case where there is only one fold in the FoldLine such that
            // the entire fold line can get removed directly.
            if (folds.length == 1) {
                foldLines.splice(foldLines.indexOf(foldLine), 1);
            }
            else 
            // If the fold is the last fold of the foldLine, just remove it.
            if (foldLine.range.isEnd(fold.end.row, fold.end.column)) {
                folds.pop();
                foldLine.end.row = folds[folds.length - 1].end.row;
                foldLine.end.column = folds[folds.length - 1].end.column;
            }
            else 
            // If the fold is the first fold of the foldLine, just remove it.
            if (foldLine.range.isStart(fold.start.row, fold.start.column)) {
                folds.shift();
                foldLine.start.row = folds[0].start.row;
                foldLine.start.column = folds[0].start.column;
            }
            else 
            // We know there are more then 2 folds and the fold is not at the edge.
            // This means, the fold is somewhere in between.
            //
            // If the fold is in one row, we just can remove it.
            if (fold.sameRow) {
                folds.splice(folds.indexOf(fold), 1);
            }
            else 
            // The fold goes over more then one row. This means remvoing this fold
            // will cause the fold line to get splitted up. newFoldLine is the second part
            {
                var newFoldLine = foldLine.split(fold.start.row, fold.start.column);
                folds = newFoldLine.folds;
                folds.shift();
                newFoldLine.start.row = folds[0].start.row;
                newFoldLine.start.column = folds[0].start.column;
            }
            if (!this.$updating) {
                if (this.$useWrapMode)
                    this.$updateWrapData(startRow, endRow);
                else
                    this.$updateRowLengthCache(startRow, endRow);
            }
            // Notify that fold data has changed.
            this.setModified(true);
            this._emit("changeFold", { data: fold, action: "remove" });
        };
        EditSession.prototype.removeFolds = function (folds) {
            // We need to clone the folds array passed in as it might be the folds
            // array of a fold line and as we call this.removeFold(fold), folds
            // are removed from folds and changes the current index.
            var cloneFolds = [];
            for (var i = 0; i < folds.length; i++) {
                cloneFolds.push(folds[i]);
            }
            cloneFolds.forEach(function (fold) {
                this.removeFold(fold);
            }, this);
            this.setModified(true);
        };
        EditSession.prototype.expandFold = function (fold) {
            this.removeFold(fold);
            fold.subFolds.forEach(function (subFold) {
                fold.restoreRange(subFold);
                this.addFold(subFold);
            }, this);
            if (fold.collapseChildren > 0) {
                this.foldAll(fold.start.row + 1, fold.end.row, fold.collapseChildren - 1);
            }
            fold.subFolds = [];
        };
        EditSession.prototype.expandFolds = function (folds) {
            folds.forEach(function (fold) {
                this.expandFold(fold);
            }, this);
        };
        EditSession.prototype.unfold = function (location, expandInner) {
            var range;
            var folds;
            if (location == null) {
                range = new Range_1.default(0, 0, this.getLength(), 0);
                expandInner = true;
            }
            else if (typeof location == "number")
                range = new Range_1.default(location, 0, location, this.getLine(location).length);
            else if ("row" in location)
                range = Range_1.default.fromPoints(location, location);
            else
                range = location;
            folds = this.getFoldsInRangeList(range);
            if (expandInner) {
                this.removeFolds(folds);
            }
            else {
                var subFolds = folds;
                // TODO: might be better to remove and add folds in one go instead of using
                // expandFolds several times.
                while (subFolds.length) {
                    this.expandFolds(subFolds);
                    subFolds = this.getFoldsInRangeList(range);
                }
            }
            if (folds.length)
                return folds;
        };
        /*
         * Checks if a given documentRow is folded. This is true if there are some
         * folded parts such that some parts of the line is still visible.
         **/
        EditSession.prototype.isRowFolded = function (docRow, startFoldRow) {
            return !!this.getFoldLine(docRow, startFoldRow);
        };
        EditSession.prototype.getRowFoldEnd = function (docRow, startFoldRow) {
            var foldLine = this.getFoldLine(docRow, startFoldRow);
            return foldLine ? foldLine.end.row : docRow;
        };
        EditSession.prototype.getRowFoldStart = function (docRow, startFoldRow) {
            var foldLine = this.getFoldLine(docRow, startFoldRow);
            return foldLine ? foldLine.start.row : docRow;
        };
        EditSession.prototype.getFoldDisplayLine = function (foldLine, endRow, endColumn, startRow, startColumn) {
            if (startRow == null)
                startRow = foldLine.start.row;
            if (startColumn == null)
                startColumn = 0;
            if (endRow == null)
                endRow = foldLine.end.row;
            if (endColumn == null)
                endColumn = this.getLine(endRow).length;
            // Build the textline using the FoldLine walker.
            var self = this;
            var textLine = "";
            foldLine.walk(function (placeholder, row, column, lastColumn) {
                if (row < startRow)
                    return;
                if (row == startRow) {
                    if (column < startColumn)
                        return;
                    lastColumn = Math.max(startColumn, lastColumn);
                }
                if (placeholder != null) {
                    textLine += placeholder;
                }
                else {
                    textLine += self.getLine(row).substring(lastColumn, column);
                }
            }, endRow, endColumn);
            return textLine;
        };
        EditSession.prototype.getDisplayLine = function (row, endColumn, startRow, startColumn) {
            var foldLine = this.getFoldLine(row);
            if (!foldLine) {
                var line;
                line = this.getLine(row);
                return line.substring(startColumn || 0, endColumn || line.length);
            }
            else {
                return this.getFoldDisplayLine(foldLine, row, endColumn, startRow, startColumn);
            }
        };
        EditSession.prototype.$cloneFoldData = function () {
            var fd = [];
            fd = this.$foldData.map(function (foldLine) {
                var folds = foldLine.folds.map(function (fold) {
                    return fold.clone();
                });
                return new FoldLine_1.default(fd, folds);
            });
            return fd;
        };
        EditSession.prototype.toggleFold = function (tryToUnfold) {
            var selection = this.selection;
            var range = selection.getRange();
            var fold;
            var bracketPos;
            if (range.isEmpty()) {
                var cursor = range.start;
                fold = this.getFoldAt(cursor.row, cursor.column);
                if (fold) {
                    this.expandFold(fold);
                    return;
                }
                else if (bracketPos = this.findMatchingBracket(cursor)) {
                    if (range.comparePoint(bracketPos) == 1) {
                        range.end = bracketPos;
                    }
                    else {
                        range.start = bracketPos;
                        range.start.column++;
                        range.end.column--;
                    }
                }
                else if (bracketPos = this.findMatchingBracket({ row: cursor.row, column: cursor.column + 1 })) {
                    if (range.comparePoint(bracketPos) === 1)
                        range.end = bracketPos;
                    else
                        range.start = bracketPos;
                    range.start.column++;
                }
                else {
                    range = this.getCommentFoldRange(cursor.row, cursor.column) || range;
                }
            }
            else {
                var folds = this.getFoldsInRange(range);
                if (tryToUnfold && folds.length) {
                    this.expandFolds(folds);
                    return;
                }
                else if (folds.length == 1) {
                    fold = folds[0];
                }
            }
            if (!fold)
                fold = this.getFoldAt(range.start.row, range.start.column);
            if (fold && fold.range.toString() == range.toString()) {
                this.expandFold(fold);
                return;
            }
            var placeholder = "...";
            if (!range.isMultiLine()) {
                placeholder = this.getTextRange(range);
                if (placeholder.length < 4)
                    return;
                placeholder = placeholder.trim().substring(0, 2) + "..";
            }
            this.addFold(placeholder, range);
        };
        EditSession.prototype.getCommentFoldRange = function (row, column, dir) {
            var iterator = new TokenIterator_1.default(this, row, column);
            var token = iterator.getCurrentToken();
            if (token && /^comment|string/.test(token.type)) {
                var range = new Range_1.default(0, 0, 0, 0);
                var re = new RegExp(token.type.replace(/\..*/, "\\."));
                if (dir != 1) {
                    do {
                        token = iterator.stepBackward();
                    } while (token && re.test(token.type));
                    iterator.stepForward();
                }
                range.start.row = iterator.getCurrentTokenRow();
                range.start.column = iterator.getCurrentTokenColumn() + 2;
                iterator = new TokenIterator_1.default(this, row, column);
                if (dir != -1) {
                    do {
                        token = iterator.stepForward();
                    } while (token && re.test(token.type));
                    token = iterator.stepBackward();
                }
                else
                    token = iterator.getCurrentToken();
                range.end.row = iterator.getCurrentTokenRow();
                range.end.column = iterator.getCurrentTokenColumn() + token.value.length - 2;
                return range;
            }
        };
        EditSession.prototype.foldAll = function (startRow, endRow, depth) {
            if (depth == undefined)
                depth = 100000; // JSON.stringify doesn't hanle Infinity
            var foldWidgets = this.foldWidgets;
            if (!foldWidgets)
                return; // mode doesn't support folding
            endRow = endRow || this.getLength();
            startRow = startRow || 0;
            for (var row = startRow; row < endRow; row++) {
                if (foldWidgets[row] == null)
                    foldWidgets[row] = this.getFoldWidget(row);
                if (foldWidgets[row] != "start")
                    continue;
                var range = this.getFoldWidgetRange(row);
                // sometimes range can be incompatible with existing fold
                // TODO change addFold to return null istead of throwing
                if (range && range.isMultiLine()
                    && range.end.row <= endRow
                    && range.start.row >= startRow) {
                    row = range.end.row;
                    try {
                        // addFold can change the range
                        var fold = this.addFold("...", range);
                        if (fold)
                            fold.collapseChildren = depth;
                    }
                    catch (e) { }
                }
            }
        };
        EditSession.prototype.setFoldStyle = function (style) {
            if (!this.$foldStyles[style])
                throw new Error("invalid fold style: " + style + "[" + Object.keys(this.$foldStyles).join(", ") + "]");
            if (this.$foldStyle === style)
                return;
            this.$foldStyle = style;
            if (style === "manual")
                this.unfold();
            // reset folding
            var mode = this.$foldMode;
            this.$setFolding(null);
            this.$setFolding(mode);
        };
        EditSession.prototype.$setFolding = function (foldMode) {
            if (this.$foldMode == foldMode)
                return;
            this.$foldMode = foldMode;
            this.off('change', this.$updateFoldWidgets);
            this._emit("changeAnnotation");
            if (!foldMode || this.$foldStyle == "manual") {
                this.foldWidgets = null;
                return;
            }
            this.foldWidgets = [];
            this.getFoldWidget = foldMode.getFoldWidget.bind(foldMode, this, this.$foldStyle);
            this.getFoldWidgetRange = foldMode.getFoldWidgetRange.bind(foldMode, this, this.$foldStyle);
            this.$updateFoldWidgets = this.updateFoldWidgets.bind(this);
            this.on('change', this.$updateFoldWidgets);
        };
        EditSession.prototype.getParentFoldRangeData = function (row, ignoreCurrent) {
            var fw = this.foldWidgets;
            if (!fw || (ignoreCurrent && fw[row])) {
                return {};
            }
            var i = row - 1;
            var firstRange;
            while (i >= 0) {
                var c = fw[i];
                if (c == null)
                    c = fw[i] = this.getFoldWidget(i);
                if (c == "start") {
                    var range = this.getFoldWidgetRange(i);
                    if (!firstRange)
                        firstRange = range;
                    if (range && range.end.row >= row)
                        break;
                }
                i--;
            }
            return {
                range: i !== -1 && range,
                firstRange: firstRange
            };
        };
        EditSession.prototype.onFoldWidgetClick = function (row, e) {
            e = e.domEvent;
            var options = {
                children: e.shiftKey,
                all: e.ctrlKey || e.metaKey,
                siblings: e.altKey
            };
            var range = this.$toggleFoldWidget(row, options);
            if (!range) {
                var el = (e.target || e.srcElement);
                if (el && /ace_fold-widget/.test(el.className))
                    el.className += " ace_invalid";
            }
        };
        EditSession.prototype.$toggleFoldWidget = function (row, options) {
            if (!this.getFoldWidget)
                return;
            var type = this.getFoldWidget(row);
            var line = this.getLine(row);
            var dir = type === "end" ? -1 : 1;
            var fold = this.getFoldAt(row, dir === -1 ? 0 : line.length, dir);
            if (fold) {
                if (options.children || options.all)
                    this.removeFold(fold);
                else
                    this.expandFold(fold);
                return;
            }
            var range = this.getFoldWidgetRange(row, true);
            // sometimes singleline folds can be missed by the code above
            if (range && !range.isMultiLine()) {
                fold = this.getFoldAt(range.start.row, range.start.column, 1);
                if (fold && range.isEqual(fold.range)) {
                    this.removeFold(fold);
                    return;
                }
            }
            if (options.siblings) {
                var data = this.getParentFoldRangeData(row);
                if (data.range) {
                    var startRow = data.range.start.row + 1;
                    var endRow = data.range.end.row;
                }
                this.foldAll(startRow, endRow, options.all ? 10000 : 0);
            }
            else if (options.children) {
                endRow = range ? range.end.row : this.getLength();
                this.foldAll(row + 1, range.end.row, options.all ? 10000 : 0);
            }
            else if (range) {
                if (options.all) {
                    // This is a bit ugly, but it corresponds to some code elsewhere.
                    range.collapseChildren = 10000;
                }
                this.addFold("...", range);
            }
            return range;
        };
        EditSession.prototype.toggleFoldWidget = function (toggleParent) {
            var row = this.selection.getCursor().row;
            row = this.getRowFoldStart(row);
            var range = this.$toggleFoldWidget(row, {});
            if (range)
                return;
            // handle toggleParent
            var data = this.getParentFoldRangeData(row, true);
            range = data.range || data.firstRange;
            if (range) {
                row = range.start.row;
                var fold = this.getFoldAt(row, this.getLine(row).length, 1);
                if (fold) {
                    this.removeFold(fold);
                }
                else {
                    this.addFold("...", range);
                }
            }
        };
        EditSession.prototype.updateFoldWidgets = function (e, editSession) {
            var delta = e.data;
            var range = delta.range;
            var firstRow = range.start.row;
            var len = range.end.row - firstRow;
            if (len === 0) {
                this.foldWidgets[firstRow] = null;
            }
            else if (delta.action == "removeText" || delta.action == "removeLines") {
                this.foldWidgets.splice(firstRow, len + 1, null);
            }
            else {
                var args = Array(len + 1);
                args.unshift(firstRow, 1);
                this.foldWidgets.splice.apply(this.foldWidgets, args);
            }
        };
        return EditSession;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = EditSession;
    // FIXME: Restore
    // Folding.call(EditSession.prototype);
    config_1.defineOptions(EditSession.prototype, "session", {
        wrap: {
            set: function (value) {
                if (!value || value == "off")
                    value = false;
                else if (value == "free")
                    value = true;
                else if (value == "printMargin")
                    value = -1;
                else if (typeof value == "string")
                    value = parseInt(value, 10) || false;
                if (this.$wrap == value)
                    return;
                if (!value) {
                    this.setUseWrapMode(false);
                }
                else {
                    var col = typeof value == "number" ? value : null;
                    this.setWrapLimitRange(col, col);
                    this.setUseWrapMode(true);
                }
                this.$wrap = value;
            },
            get: function () {
                if (this.getUseWrapMode()) {
                    if (this.$wrap == -1)
                        return "printMargin";
                    if (!this.getWrapLimitRange().min)
                        return "free";
                    return this.$wrap;
                }
                return "off";
            },
            handlesSet: true
        },
        wrapMethod: {
            // code|text|auto
            set: function (val) {
                val = val == "auto"
                    ? this.$mode.type != "text"
                    : val != "text";
                if (val != this.$wrapAsCode) {
                    this.$wrapAsCode = val;
                    if (this.$useWrapMode) {
                        this.$modified = true;
                        this.$resetRowCache(0);
                        this.$updateWrapData(0, this.getLength() - 1);
                    }
                }
            },
            initialValue: "auto"
        },
        firstLineNumber: {
            set: function () { this._signal("changeBreakpoint"); },
            initialValue: 1
        },
        useWorker: {
            set: function (useWorker) {
                this.$useWorker = useWorker;
                this.$stopWorker();
                if (useWorker)
                    this.$startWorker();
            },
            initialValue: true
        },
        useSoftTabs: { initialValue: true },
        tabSize: {
            set: function (tabSize) {
                if (isNaN(tabSize) || this.$tabSize === tabSize)
                    return;
                this.$modified = true;
                this.$rowLengthCache = [];
                this.$tabSize = tabSize;
                this._signal("changeTabSize");
            },
            initialValue: 4,
            handlesSet: true
        },
        overwrite: {
            set: function (val) { this._signal("changeOverwrite"); },
            initialValue: false
        },
        newLineMode: {
            set: function (val) { this.doc.setNewLineMode(val); },
            get: function () { return this.doc.getNewLineMode(); },
            handlesSet: true
        },
        mode: {
            set: function (val) { this.setMode(val); },
            get: function () { return this.$modeId; }
        }
    });
});

define('UndoManager',["require", "exports"], function (require, exports) {
    /**
     * This object maintains the undo stack for an [[EditSession `EditSession`]].
     * @class UndoManager
     */
    var UndoManager = (function () {
        /**
         * Resets the current undo state.
         * @class UndoManager
         * @constructor
         */
        function UndoManager() {
            this.reset();
        }
        /**
         * Provides a means for implementing your own undo manager. `options` has one property, `args`, an [[Array `Array`]], with two elements:
         *
         * - `args[0]` is an array of deltas
         * - `args[1]` is the document to associate with
         *
         * @param {Object} options Contains additional properties
         *
         **/
        UndoManager.prototype.execute = function (options) {
            var deltas = options.args[0];
            this.$editSession = options.args[1];
            if (options.merge && this.hasUndo()) {
                this.dirtyCounter--;
                deltas = this.$undoStack.pop().concat(deltas);
            }
            this.$undoStack.push(deltas);
            this.$redoStack = [];
            if (this.dirtyCounter < 0) {
                // The user has made a change after undoing past the last clean state.
                // We can never get back to a clean state now until markClean() is called.
                this.dirtyCounter = NaN;
            }
            this.dirtyCounter++;
        };
        /**
         * [Perform an undo operation on the document, reverting the last change.]{: #UndoManager.undo}
         * @param {Boolean} dontSelect {:dontSelect}
         *
         * @returns {Range} The range of the undo.
         **/
        UndoManager.prototype.undo = function (dontSelect) {
            var deltas = this.$undoStack.pop();
            var undoSelectionRange = null;
            if (deltas) {
                undoSelectionRange = this.$editSession.undoChanges(deltas, dontSelect);
                this.$redoStack.push(deltas);
                this.dirtyCounter--;
            }
            return undoSelectionRange;
        };
        /**
         * [Perform a redo operation on the document, reimplementing the last change.]{: #UndoManager.redo}
         * @param {Boolean} dontSelect {:dontSelect}
         **/
        UndoManager.prototype.redo = function (dontSelect) {
            var deltas = this.$redoStack.pop();
            var redoSelectionRange = null;
            if (deltas) {
                redoSelectionRange = this.$editSession.redoChanges(deltas, dontSelect);
                this.$undoStack.push(deltas);
                this.dirtyCounter++;
            }
            return redoSelectionRange;
        };
        /**
         * Destroys the stack of undo and redo redo operations.
         **/
        UndoManager.prototype.reset = function () {
            this.$undoStack = [];
            this.$redoStack = [];
            this.dirtyCounter = 0;
        };
        /**
         *
         * Returns `true` if there are undo operations left to perform.
         */
        UndoManager.prototype.hasUndo = function () {
            return this.$undoStack.length > 0;
        };
        /**
         * Returns `true` if there are redo operations left to perform.
         */
        UndoManager.prototype.hasRedo = function () {
            return this.$redoStack.length > 0;
        };
        /**
         * Marks the current status clean
         */
        UndoManager.prototype.markClean = function () {
            this.dirtyCounter = 0;
        };
        /**
         * Determines whether the current status is clean.
         */
        UndoManager.prototype.isClean = function () {
            return this.dirtyCounter === 0;
        };
        return UndoManager;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = UndoManager;
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('layer/Gutter',["require", "exports", "../lib/dom", "../lib/lang", "../lib/event_emitter"], function (require, exports, dom_1, lang_1, event_emitter_1) {
    var Gutter = (function (_super) {
        __extends(Gutter, _super);
        function Gutter(parentEl) {
            _super.call(this);
            this.gutterWidth = 0;
            this.$annotations = [];
            this.$cells = [];
            this.$fixedWidth = false;
            this.$showLineNumbers = true;
            this.$renderer = "";
            this.$showFoldWidgets = true;
            this.element = dom_1.createElement("div");
            this.element.className = "ace_layer ace_gutter-layer";
            parentEl.appendChild(this.element);
            this.setShowFoldWidgets(this.$showFoldWidgets);
            this.$updateAnnotations = this.$updateAnnotations.bind(this);
        }
        Gutter.prototype.setSession = function (session) {
            if (this.session) {
                this.session.off("change", this.$updateAnnotations);
            }
            this.session = session;
            session.on("change", this.$updateAnnotations);
        };
        // FIXME: The text and html appear to be optional.
        Gutter.prototype.setAnnotations = function (annotations) {
            // iterate over sparse array
            this.$annotations = [];
            for (var i = 0; i < annotations.length; i++) {
                var annotation = annotations[i];
                var row = annotation.row;
                var rowInfo = this.$annotations[row];
                if (!rowInfo)
                    rowInfo = this.$annotations[row] = { text: [] };
                var annoText = annotation.text;
                annoText = annoText ? lang_1.escapeHTML(annoText) : annotation.html || "";
                if (rowInfo.text.indexOf(annoText) === -1)
                    rowInfo.text.push(annoText);
                var type = annotation.type;
                if (type === "error")
                    rowInfo.className = " ace_error";
                else if (type === "warning" && rowInfo.className != " ace_error")
                    rowInfo.className = " ace_warning";
                else if (type === "info" && (!rowInfo.className))
                    rowInfo.className = " ace_info";
            }
        };
        Gutter.prototype.$updateAnnotations = function (e, session) {
            if (!this.$annotations.length)
                return;
            var delta = e.data;
            var range = delta.range;
            var firstRow = range.start.row;
            var len = range.end.row - firstRow;
            if (len === 0) {
            }
            else if (delta.action == "removeText" || delta.action == "removeLines") {
                this.$annotations.splice(firstRow, len + 1, null);
            }
            else {
                var args = new Array(len + 1);
                args.unshift(firstRow, 1);
                this.$annotations.splice.apply(this.$annotations, args);
            }
        };
        Gutter.prototype.update = function (config) {
            var session = this.session;
            var firstRow = config.firstRow;
            var lastRow = Math.min(config.lastRow + config.gutterOffset, // needed to compensate for hor scollbar
            session.getLength() - 1);
            var fold = session.getNextFoldLine(firstRow);
            var foldStart = fold ? fold.start.row : Infinity;
            var foldWidgets = this.$showFoldWidgets && session['foldWidgets'];
            var breakpoints = session.$breakpoints;
            var decorations = session.$decorations;
            var firstLineNumber = session['$firstLineNumber'];
            var lastLineNumber = 0;
            var gutterRenderer = session['gutterRenderer'] || this.$renderer;
            var cell = null;
            var index = -1;
            var row = firstRow;
            while (true) {
                if (row > foldStart) {
                    row = fold.end.row + 1;
                    fold = session.getNextFoldLine(row, fold);
                    foldStart = fold ? fold.start.row : Infinity;
                }
                if (row > lastRow) {
                    while (this.$cells.length > index + 1) {
                        cell = this.$cells.pop();
                        this.element.removeChild(cell.element);
                    }
                    break;
                }
                cell = this.$cells[++index];
                if (!cell) {
                    cell = { element: null, textNode: null, foldWidget: null };
                    cell.element = dom_1.createElement("div");
                    cell.textNode = document.createTextNode('');
                    cell.element.appendChild(cell.textNode);
                    this.element.appendChild(cell.element);
                    this.$cells[index] = cell;
                }
                var className = "ace_gutter-cell ";
                if (breakpoints[row])
                    className += breakpoints[row];
                if (decorations[row])
                    className += decorations[row];
                if (this.$annotations[row])
                    className += this.$annotations[row].className;
                if (cell.element.className != className)
                    cell.element.className = className;
                var height = session.getRowLength(row) * config.lineHeight + "px";
                if (height != cell.element.style.height)
                    cell.element.style.height = height;
                if (foldWidgets) {
                    var c = foldWidgets[row];
                    // check if cached value is invalidated and we need to recompute
                    if (c == null)
                        c = foldWidgets[row] = session.getFoldWidget(row);
                }
                if (c) {
                    if (!cell.foldWidget) {
                        cell.foldWidget = dom_1.createElement("span");
                        cell.element.appendChild(cell.foldWidget);
                    }
                    var className = "ace_fold-widget ace_" + c;
                    if (c == "start" && row == foldStart && row < fold.end.row)
                        className += " ace_closed";
                    else
                        className += " ace_open";
                    if (cell.foldWidget.className != className)
                        cell.foldWidget.className = className;
                    var height = config.lineHeight + "px";
                    if (cell.foldWidget.style.height != height)
                        cell.foldWidget.style.height = height;
                }
                else {
                    if (cell.foldWidget) {
                        cell.element.removeChild(cell.foldWidget);
                        cell.foldWidget = null;
                    }
                }
                var text = lastLineNumber = gutterRenderer
                    ? gutterRenderer.getText(session, row)
                    : row + firstLineNumber;
                if (text != cell.textNode.data)
                    cell.textNode.data = text;
                row++;
            }
            this.element.style.height = config.minHeight + "px";
            if (this.$fixedWidth || session.$useWrapMode)
                lastLineNumber = session.getLength() + firstLineNumber;
            var gutterWidth = gutterRenderer
                ? gutterRenderer.getWidth(session, lastLineNumber, config)
                : lastLineNumber.toString().length * config.characterWidth;
            var padding = this.$padding || this.$computePadding();
            gutterWidth += padding.left + padding.right;
            if (gutterWidth !== this.gutterWidth && !isNaN(gutterWidth)) {
                this.gutterWidth = gutterWidth;
                this.element.style.width = Math.ceil(this.gutterWidth) + "px";
                this._emit("changeGutterWidth", gutterWidth);
            }
        };
        Gutter.prototype.setShowLineNumbers = function (show) {
            this.$renderer = !show && {
                getWidth: function () { return ""; },
                getText: function () { return ""; }
            };
        };
        Gutter.prototype.getShowLineNumbers = function () {
            return this.$showLineNumbers;
        };
        Gutter.prototype.setShowFoldWidgets = function (show) {
            if (show)
                dom_1.addCssClass(this.element, "ace_folding-enabled");
            else
                dom_1.removeCssClass(this.element, "ace_folding-enabled");
            this.$showFoldWidgets = show;
            this.$padding = null;
        };
        Gutter.prototype.getShowFoldWidgets = function () {
            return this.$showFoldWidgets;
        };
        Gutter.prototype.$computePadding = function () {
            if (!this.element.firstChild) {
                return { left: 0, right: 0 };
            }
            // FIXME: The firstChild may not be an HTMLElement.
            var style = window.getComputedStyle(this.element.firstChild);
            this.$padding = {};
            this.$padding.left = parseInt(style.paddingLeft) + 1 || 0;
            this.$padding.right = parseInt(style.paddingRight) || 0;
            return this.$padding;
        };
        /**
         * Returns either "markers", "foldWidgets", or undefined.
         */
        Gutter.prototype.getRegion = function (point) {
            var padding = this.$padding || this.$computePadding();
            var rect = this.element.getBoundingClientRect();
            if (point.clientX < padding.left + rect.left) {
                return "markers";
            }
            if (this.$showFoldWidgets && point.clientX > rect.right - padding.right) {
                return "foldWidgets";
            }
        };
        return Gutter;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Gutter;
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
define('layer/Marker',["require", "exports", "../Range", "../lib/dom"], function (require, exports, Range_1, dom_1) {
    var Marker = (function () {
        function Marker(parentEl) {
            this.$padding = 0;
            this.element = dom_1.createElement("div");
            this.element.className = "ace_layer ace_marker-layer";
            parentEl.appendChild(this.element);
        }
        Marker.prototype.setPadding = function (padding) {
            this.$padding = padding;
        };
        Marker.prototype.setSession = function (session) {
            this.session = session;
        };
        Marker.prototype.setMarkers = function (markers) {
            this.markers = markers;
        };
        Marker.prototype.update = function (config) {
            var config = config || this.config;
            if (!config)
                return;
            this.config = config;
            var html = [];
            for (var key in this.markers) {
                var marker = this.markers[key];
                if (!marker.range) {
                    marker.update(html, this, this.session, config);
                    continue;
                }
                var range = marker.range.clipRows(config.firstRow, config.lastRow);
                if (range.isEmpty())
                    continue;
                range = this.session.documentToScreenRange(range);
                if (marker.renderer) {
                    var top = this.$getTop(range.start.row, config);
                    var left = this.$padding + range.start.column * config.characterWidth;
                    marker.renderer(html, range, left, top, config);
                }
                else if (marker.type == "fullLine") {
                    this.drawFullLineMarker(html, range, marker.clazz, config);
                }
                else if (marker.type == "screenLine") {
                    this.drawScreenLineMarker(html, range, marker.clazz, config);
                }
                else if (range.isMultiLine()) {
                    if (marker.type == "text")
                        this.drawTextMarker(html, range, marker.clazz, config);
                    else
                        this.drawMultiLineMarker(html, range, marker.clazz, config);
                }
                else {
                    this.drawSingleLineMarker(html, range, marker.clazz + " ace_start ace_br15", config);
                }
            }
            this.element.innerHTML = html.join("");
        };
        Marker.prototype.$getTop = function (row, layerConfig) {
            return (row - layerConfig.firstRowScreen) * layerConfig.lineHeight;
        };
        // Draws a marker, which spans a range of text on multiple lines 
        Marker.prototype.drawTextMarker = function (stringBuilder, range, clazz, layerConfig, extraStyle) {
            function getBorderClass(tl, tr, br, bl) {
                return (tl ? 1 : 0) | (tr ? 2 : 0) | (br ? 4 : 0) | (bl ? 8 : 0);
            }
            var session = this.session;
            var start = range.start.row;
            var end = range.end.row;
            var row = start;
            var prev = 0;
            var curr = 0;
            var next = session.getScreenLastRowColumn(row);
            var lineRange = new Range_1.default(row, range.start.column, row, curr);
            for (; row <= end; row++) {
                lineRange.start.row = lineRange.end.row = row;
                lineRange.start.column = row == start ? range.start.column : session.getRowWrapIndent(row);
                lineRange.end.column = next;
                prev = curr;
                curr = next;
                next = row + 1 < end ? session.getScreenLastRowColumn(row + 1) : row == end ? 0 : range.end.column;
                this.drawSingleLineMarker(stringBuilder, lineRange, clazz + (row == start ? " ace_start" : "") + " ace_br" + getBorderClass(row == start || row == start + 1 && range.start.column, prev < curr, curr > next, row == end), layerConfig, row == end ? 0 : 1, extraStyle);
            }
        };
        // Draws a multi line marker, where lines span the full width
        Marker.prototype.drawMultiLineMarker = function (stringBuilder, range, clazz, config, extraStyle) {
            // from selection start to the end of the line
            var padding = this.$padding;
            var height = config.lineHeight;
            var top = this.$getTop(range.start.row, config);
            var left = padding + range.start.column * config.characterWidth;
            extraStyle = extraStyle || "";
            stringBuilder.push("<div class='", clazz, " ace_br1 ace_start' style='", "height:", height, "px;", "right:0;", "top:", top, "px;", "left:", left, "px;", extraStyle, "'></div>");
            // from start of the last line to the selection end
            top = this.$getTop(range.end.row, config);
            var width = range.end.column * config.characterWidth;
            stringBuilder.push("<div class='", clazz, " ace_br12' style='", "height:", height, "px;", "width:", width, "px;", "top:", top, "px;", "left:", padding, "px;", extraStyle, "'></div>");
            // all the complete lines
            height = (range.end.row - range.start.row - 1) * config.lineHeight;
            if (height < 0) {
                return;
            }
            top = this.$getTop(range.start.row + 1, config);
            var radiusClass = (range.start.column ? 1 : 0) | (range.end.column ? 0 : 8);
            stringBuilder.push("<div class='", clazz, (radiusClass ? " ace_br" + radiusClass : ""), "' style='", "height:", height, "px;", "right:0;", "top:", top, "px;", "left:", padding, "px;", extraStyle, "'></div>");
        };
        // Draws a marker which covers part or whole width of a single screen line
        Marker.prototype.drawSingleLineMarker = function (stringBuilder, range, clazz, config, extraLength, extraStyle) {
            var height = config.lineHeight;
            var width = (range.end.column + (extraLength || 0) - range.start.column) * config.characterWidth;
            var top = this.$getTop(range.start.row, config);
            var left = this.$padding + range.start.column * config.characterWidth;
            stringBuilder.push("<div class='", clazz, "' style='", "height:", height, "px;", "width:", width, "px;", "top:", top, "px;", "left:", left, "px;", extraStyle || "", "'></div>");
        };
        Marker.prototype.drawFullLineMarker = function (stringBuilder, range, clazz, config, extraStyle) {
            var top = this.$getTop(range.start.row, config);
            var height = config.lineHeight;
            if (range.start.row != range.end.row) {
                height += this.$getTop(range.end.row, config) - top;
            }
            stringBuilder.push("<div class='", clazz, "' style='", "height:", height, "px;", "top:", top, "px;", "left:0;right:0;", extraStyle || "", "'></div>");
        };
        Marker.prototype.drawScreenLineMarker = function (stringBuilder, range, clazz, config, extraStyle) {
            var top = this.$getTop(range.start.row, config);
            var height = config.lineHeight;
            stringBuilder.push("<div class='", clazz, "' style='", "height:", height, "px;", "top:", top, "px;", "left:0;right:0;", extraStyle || "", "'></div>");
        };
        return Marker;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Marker;
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('layer/Text',["require", "exports", "../lib/dom", "../lib/lang", "../lib/event_emitter"], function (require, exports, dom_1, lang_1, event_emitter_1) {
    var Text = (function (_super) {
        __extends(Text, _super);
        function Text(parentEl) {
            _super.call(this);
            this.element = dom_1.createElement("div");
            this.$padding = 0;
            this.EOF_CHAR = "\xB6";
            this.EOL_CHAR_LF = "\xAC";
            this.EOL_CHAR_CRLF = "\xa4";
            this.TAB_CHAR = "\u2192"; //"\u21E5";
            this.SPACE_CHAR = "\xB7";
            this.showInvisibles = false;
            this.displayIndentGuides = true;
            this.$tabStrings = [];
            this.$textToken = { "text": true, "rparen": true, "lparen": true };
            this.element.className = "ace_layer ace_text-layer";
            parentEl.appendChild(this.element);
            this.$updateEolChar = this.$updateEolChar.bind(this);
            this.EOL_CHAR = this.EOL_CHAR_LF;
        }
        Text.prototype.$updateEolChar = function () {
            var EOL_CHAR = this.session.doc.getNewLineCharacter() == "\n"
                ? this.EOL_CHAR_LF
                : this.EOL_CHAR_CRLF;
            if (this.EOL_CHAR != EOL_CHAR) {
                this.EOL_CHAR = EOL_CHAR;
                return true;
            }
        };
        Text.prototype.setPadding = function (padding) {
            this.$padding = padding;
            this.element.style.padding = "0 " + padding + "px";
        };
        Text.prototype.getLineHeight = function () {
            return this.$fontMetrics.$characterSize.height || 0;
        };
        Text.prototype.getCharacterWidth = function () {
            return this.$fontMetrics.$characterSize.width || 0;
        };
        Text.prototype.$setFontMetrics = function (measure) {
            this.$fontMetrics = measure;
            this.$fontMetrics.on("changeCharacterSize", function (e) {
                this._signal("changeCharacterSize", e);
            }.bind(this));
            this.$pollSizeChanges();
        };
        Text.prototype.checkForSizeChanges = function () {
            this.$fontMetrics.checkForSizeChanges();
        };
        Text.prototype.$pollSizeChanges = function () {
            return this.$pollSizeChangesTimer = this.$fontMetrics.$pollSizeChanges();
        };
        Text.prototype.setSession = function (session) {
            this.session = session;
            this.$computeTabString();
        };
        Text.prototype.setShowInvisibles = function (showInvisibles) {
            if (this.showInvisibles === showInvisibles) {
                return false;
            }
            else {
                this.showInvisibles = showInvisibles;
                this.$computeTabString();
                return true;
            }
        };
        Text.prototype.setDisplayIndentGuides = function (displayIndentGuides) {
            if (this.displayIndentGuides === displayIndentGuides) {
                return false;
            }
            else {
                this.displayIndentGuides = displayIndentGuides;
                this.$computeTabString();
                return true;
            }
        };
        // FIXME: DGH Check that this is consistent with ACE
        Text.prototype.onChangeTabSize = function () {
            this.$computeTabString();
        };
        //    this.onChangeTabSize =
        Text.prototype.$computeTabString = function () {
            var tabSize = this.session.getTabSize();
            this.tabSize = tabSize;
            var tabStr = this.$tabStrings = ["0"];
            for (var i = 1; i < tabSize + 1; i++) {
                if (this.showInvisibles) {
                    tabStr.push("<span class='ace_invisible ace_invisible_tab'>"
                        + this.TAB_CHAR
                        + lang_1.stringRepeat("\xa0", i - 1)
                        + "</span>");
                }
                else {
                    tabStr.push(lang_1.stringRepeat("\xa0", i));
                }
            }
            if (this.displayIndentGuides) {
                this.$indentGuideRe = /\s\S| \t|\t |\s$/;
                var className = "ace_indent-guide";
                var spaceClass = "";
                var tabClass = "";
                if (this.showInvisibles) {
                    className += " ace_invisible";
                    spaceClass = " ace_invisible_space";
                    tabClass = " ace_invisible_tab";
                    var spaceContent = lang_1.stringRepeat(this.SPACE_CHAR, this.tabSize);
                    var tabContent = this.TAB_CHAR + lang_1.stringRepeat("\xa0", this.tabSize - 1);
                }
                else {
                    var spaceContent = lang_1.stringRepeat("\xa0", this.tabSize);
                    var tabContent = spaceContent;
                }
                this.$tabStrings[" "] = "<span class='" + className + spaceClass + "'>" + spaceContent + "</span>";
                this.$tabStrings["\t"] = "<span class='" + className + tabClass + "'>" + tabContent + "</span>";
            }
        };
        Text.prototype.updateLines = function (config, firstRow, lastRow) {
            // Due to wrap line changes there can be new lines if e.g.
            // the line to updated wrapped in the meantime.
            if (this.config.lastRow != config.lastRow ||
                this.config.firstRow != config.firstRow) {
                this.scrollLines(config);
            }
            this.config = config;
            var first = Math.max(firstRow, config.firstRow);
            var last = Math.min(lastRow, config.lastRow);
            var lineElements = this.element.childNodes;
            var lineElementsIdx = 0;
            for (var row = config.firstRow; row < first; row++) {
                var foldLine = this.session.getFoldLine(row);
                if (foldLine) {
                    if (foldLine.containsRow(first)) {
                        first = foldLine.start.row;
                        break;
                    }
                    else {
                        row = foldLine.end.row;
                    }
                }
                lineElementsIdx++;
            }
            var row = first;
            var foldLine = this.session.getNextFoldLine(row);
            var foldStart = foldLine ? foldLine.start.row : Infinity;
            while (true) {
                if (row > foldStart) {
                    row = foldLine.end.row + 1;
                    foldLine = this.session.getNextFoldLine(row, foldLine);
                    foldStart = foldLine ? foldLine.start.row : Infinity;
                }
                if (row > last)
                    break;
                var lineElement = lineElements[lineElementsIdx++];
                if (lineElement) {
                    var html = [];
                    this.$renderLine(html, row, !this.$useLineGroups(), row == foldStart ? foldLine : false);
                    lineElement.style.height = config.lineHeight * this.session.getRowLength(row) + "px";
                    lineElement.innerHTML = html.join("");
                }
                row++;
            }
        };
        Text.prototype.scrollLines = function (config) {
            var oldConfig = this.config;
            this.config = config;
            if (!oldConfig || oldConfig.lastRow < config.firstRow)
                return this.update(config);
            if (config.lastRow < oldConfig.firstRow)
                return this.update(config);
            var el = this.element;
            if (oldConfig.firstRow < config.firstRow) {
                // FIXME: DGH getFoldedRowCount does not exist on EditSession
                for (var row = this.session['getFoldedRowCount'](oldConfig.firstRow, config.firstRow - 1); row > 0; row--) {
                    el.removeChild(el.firstChild);
                }
            }
            if (oldConfig.lastRow > config.lastRow) {
                // FIXME: DGH getFoldedRowCount does not exist on EditSession
                for (var row = this.session['getFoldedRowCount'](config.lastRow + 1, oldConfig.lastRow); row > 0; row--) {
                    el.removeChild(el.lastChild);
                }
            }
            if (config.firstRow < oldConfig.firstRow) {
                var fragment = this.$renderLinesFragment(config, config.firstRow, oldConfig.firstRow - 1);
                if (el.firstChild)
                    el.insertBefore(fragment, el.firstChild);
                else
                    el.appendChild(fragment);
            }
            if (config.lastRow > oldConfig.lastRow) {
                var fragment = this.$renderLinesFragment(config, oldConfig.lastRow + 1, config.lastRow);
                el.appendChild(fragment);
            }
        };
        Text.prototype.$renderLinesFragment = function (config, firstRow, lastRow) {
            var fragment = this.element.ownerDocument.createDocumentFragment();
            var row = firstRow;
            var foldLine = this.session.getNextFoldLine(row);
            var foldStart = foldLine ? foldLine.start.row : Infinity;
            while (true) {
                if (row > foldStart) {
                    row = foldLine.end.row + 1;
                    foldLine = this.session.getNextFoldLine(row, foldLine);
                    foldStart = foldLine ? foldLine.start.row : Infinity;
                }
                if (row > lastRow)
                    break;
                var container = dom_1.createElement("div");
                var html = [];
                // Get the tokens per line as there might be some lines in between
                // beeing folded.
                this.$renderLine(html, row, false, row == foldStart ? foldLine : false);
                // don't use setInnerHtml since we are working with an empty DIV
                container.innerHTML = html.join("");
                if (this.$useLineGroups()) {
                    container.className = 'ace_line_group';
                    fragment.appendChild(container);
                    container.style.height = config.lineHeight * this.session.getRowLength(row) + "px";
                }
                else {
                    while (container.firstChild)
                        fragment.appendChild(container.firstChild);
                }
                row++;
            }
            return fragment;
        };
        Text.prototype.update = function (config) {
            this.config = config;
            var html = [];
            var firstRow = config.firstRow, lastRow = config.lastRow;
            var row = firstRow;
            var foldLine = this.session.getNextFoldLine(row);
            var foldStart = foldLine ? foldLine.start.row : Infinity;
            while (true) {
                if (row > foldStart) {
                    row = foldLine.end.row + 1;
                    foldLine = this.session.getNextFoldLine(row, foldLine);
                    foldStart = foldLine ? foldLine.start.row : Infinity;
                }
                if (row > lastRow)
                    break;
                if (this.$useLineGroups())
                    html.push("<div class='ace_line_group' style='height:", config.lineHeight * this.session.getRowLength(row), "px'>");
                this.$renderLine(html, row, false, row == foldStart ? foldLine : false);
                if (this.$useLineGroups())
                    html.push("</div>"); // end the line group
                row++;
            }
            this.element.innerHTML = html.join("");
        };
        Text.prototype.$renderToken = function (stringBuilder, screenColumn, token, value) {
            var self = this;
            var replaceReg = /\t|&|<|( +)|([\x00-\x1f\x80-\xa0\u1680\u180E\u2000-\u200f\u2028\u2029\u202F\u205F\u3000\uFEFF])|[\u1100-\u115F\u11A3-\u11A7\u11FA-\u11FF\u2329-\u232A\u2E80-\u2E99\u2E9B-\u2EF3\u2F00-\u2FD5\u2FF0-\u2FFB\u3000-\u303E\u3041-\u3096\u3099-\u30FF\u3105-\u312D\u3131-\u318E\u3190-\u31BA\u31C0-\u31E3\u31F0-\u321E\u3220-\u3247\u3250-\u32FE\u3300-\u4DBF\u4E00-\uA48C\uA490-\uA4C6\uA960-\uA97C\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE66\uFE68-\uFE6B\uFF01-\uFF60\uFFE0-\uFFE6]/g;
            var replaceFunc = function (c, a, b, tabIdx, idx4) {
                if (a) {
                    return self.showInvisibles ?
                        "<span class='ace_invisible ace_invisible_space'>" + lang_1.stringRepeat(self.SPACE_CHAR, c.length) + "</span>" :
                        lang_1.stringRepeat("\xa0", c.length);
                }
                else if (c == "&") {
                    return "&#38;";
                }
                else if (c == "<") {
                    return "&#60;";
                }
                else if (c == "\t") {
                    var tabSize = self.session.getScreenTabSize(screenColumn + tabIdx);
                    screenColumn += tabSize - 1;
                    return self.$tabStrings[tabSize];
                }
                else if (c == "\u3000") {
                    // U+3000 is both invisible AND full-width, so must be handled uniquely
                    var classToUse = self.showInvisibles ? "ace_cjk ace_invisible ace_invisible_space" : "ace_cjk";
                    var space = self.showInvisibles ? self.SPACE_CHAR : "";
                    screenColumn += 1;
                    return "<span class='" + classToUse + "' style='width:" +
                        (self.config.characterWidth * 2) +
                        "px'>" + space + "</span>";
                }
                else if (b) {
                    return "<span class='ace_invisible ace_invisible_space ace_invalid'>" + self.SPACE_CHAR + "</span>";
                }
                else {
                    screenColumn += 1;
                    return "<span class='ace_cjk' style='width:" +
                        (self.config.characterWidth * 2) +
                        "px'>" + c + "</span>";
                }
            };
            var output = value.replace(replaceReg, replaceFunc);
            if (!this.$textToken[token.type]) {
                var classes = "ace_" + token.type.replace(/\./g, " ace_");
                var style = "";
                if (token.type == "fold")
                    style = " style='width:" + (token.value.length * this.config.characterWidth) + "px;' ";
                stringBuilder.push("<span class='", classes, "'", style, ">", output, "</span>");
            }
            else {
                stringBuilder.push(output);
            }
            return screenColumn + value.length;
        };
        Text.prototype.renderIndentGuide = function (stringBuilder, value, max) {
            var cols = value.search(this.$indentGuideRe);
            if (cols <= 0 || cols >= max)
                return value;
            if (value[0] == " ") {
                cols -= cols % this.tabSize;
                stringBuilder.push(lang_1.stringRepeat(this.$tabStrings[" "], cols / this.tabSize));
                return value.substr(cols);
            }
            else if (value[0] == "\t") {
                stringBuilder.push(lang_1.stringRepeat(this.$tabStrings["\t"], cols));
                return value.substr(cols);
            }
            return value;
        };
        Text.prototype.$renderWrappedLine = function (stringBuilder, tokens, splits, onlyContents) {
            var chars = 0;
            var split = 0;
            var splitChars = splits[0];
            var screenColumn = 0;
            for (var i = 0; i < tokens.length; i++) {
                var token = tokens[i];
                var value = token.value;
                if (i == 0 && this.displayIndentGuides) {
                    chars = value.length;
                    value = this.renderIndentGuide(stringBuilder, value, splitChars);
                    if (!value)
                        continue;
                    chars -= value.length;
                }
                if (chars + value.length < splitChars) {
                    screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value);
                    chars += value.length;
                }
                else {
                    while (chars + value.length >= splitChars) {
                        screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value.substring(0, splitChars - chars));
                        value = value.substring(splitChars - chars);
                        chars = splitChars;
                        if (!onlyContents) {
                            stringBuilder.push("</div>", "<div class='ace_line' style='height:", this.config.lineHeight, "px'>");
                        }
                        split++;
                        screenColumn = 0;
                        splitChars = splits[split] || Number.MAX_VALUE;
                    }
                    if (value.length != 0) {
                        chars += value.length;
                        screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value);
                    }
                }
            }
        };
        Text.prototype.$renderSimpleLine = function (stringBuilder, tokens) {
            var screenColumn = 0;
            var token = tokens[0];
            var value = token.value;
            if (this.displayIndentGuides)
                value = this.renderIndentGuide(stringBuilder, value);
            if (value)
                screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value);
            for (var i = 1; i < tokens.length; i++) {
                token = tokens[i];
                value = token.value;
                screenColumn = this.$renderToken(stringBuilder, screenColumn, token, value);
            }
        };
        // row is either first row of foldline or not in fold
        Text.prototype.$renderLine = function (stringBuilder, row, onlyContents, foldLine) {
            if (!foldLine && foldLine != false)
                foldLine = this.session.getFoldLine(row);
            if (foldLine)
                var tokens = this.$getFoldLineTokens(row, foldLine);
            else
                var tokens = this.session.getTokens(row);
            if (!onlyContents) {
                stringBuilder.push("<div class='ace_line' style='height:", this.config.lineHeight * (this.$useLineGroups() ? 1 : this.session.getRowLength(row)), "px'>");
            }
            if (tokens.length) {
                var splits = this.session.getRowSplitData(row);
                if (splits && splits.length)
                    this.$renderWrappedLine(stringBuilder, tokens, splits, onlyContents);
                else
                    this.$renderSimpleLine(stringBuilder, tokens);
            }
            if (this.showInvisibles) {
                if (foldLine)
                    row = foldLine.end.row;
                stringBuilder.push("<span class='ace_invisible ace_invisible_eol'>", row == this.session.getLength() - 1 ? this.EOF_CHAR : this.EOL_CHAR, "</span>");
            }
            if (!onlyContents)
                stringBuilder.push("</div>");
        };
        Text.prototype.$getFoldLineTokens = function (row, foldLine) {
            var session = this.session;
            var renderTokens = [];
            function addTokens(tokens, from, to) {
                var idx = 0, col = 0;
                while ((col + tokens[idx].value.length) < from) {
                    col += tokens[idx].value.length;
                    idx++;
                    if (idx == tokens.length)
                        return;
                }
                if (col != from) {
                    var value = tokens[idx].value.substring(from - col);
                    // Check if the token value is longer then the from...to spacing.
                    if (value.length > (to - from))
                        value = value.substring(0, to - from);
                    renderTokens.push({
                        type: tokens[idx].type,
                        value: value
                    });
                    col = from + value.length;
                    idx += 1;
                }
                while (col < to && idx < tokens.length) {
                    var value = tokens[idx].value;
                    if (value.length + col > to) {
                        renderTokens.push({
                            type: tokens[idx].type,
                            value: value.substring(0, to - col)
                        });
                    }
                    else
                        renderTokens.push(tokens[idx]);
                    col += value.length;
                    idx += 1;
                }
            }
            var tokens = session.getTokens(row);
            foldLine.walk(function (placeholder, row, column, lastColumn, isNewRow) {
                if (placeholder != null) {
                    renderTokens.push({
                        type: "fold",
                        value: placeholder
                    });
                }
                else {
                    if (isNewRow)
                        tokens = session.getTokens(row);
                    if (tokens.length)
                        addTokens(tokens, lastColumn, column);
                }
            }, foldLine.end.row, this.session.getLine(foldLine.end.row).length);
            return renderTokens;
        };
        Text.prototype.$useLineGroups = function () {
            // For the updateLines function to work correctly, it's important that the
            // child nodes of this.element correspond on a 1-to-1 basis to rows in the
            // document (as distinct from lines on the screen). For sessions that are
            // wrapped, this means we need to add a layer to the node hierarchy (tagged
            // with the class name ace_line_group).
            return this.session.getUseWrapMode();
        };
        Text.prototype.destroy = function () {
            clearInterval(this.$pollSizeChangesTimer);
            if (this.$measureNode)
                this.$measureNode.parentNode.removeChild(this.$measureNode);
            delete this.$measureNode;
        };
        return Text;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Text;
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
define('layer/Cursor',["require", "exports", "../lib/dom"], function (require, exports, dom_1) {
    var IE8;
    var Cursor = (function () {
        function Cursor(parentEl) {
            this.isVisible = false;
            this.isBlinking = true;
            this.blinkInterval = 1000;
            this.smoothBlinking = false;
            this.cursors = [];
            this.$padding = 0;
            this.element = dom_1.createElement("div");
            this.element.className = "ace_layer ace_cursor-layer";
            parentEl.appendChild(this.element);
            if (IE8 === undefined)
                IE8 = "opacity" in this.element;
            this.cursor = this.addCursor();
            dom_1.addCssClass(this.element, "ace_hidden-cursors");
            this.$updateCursors = this.$updateVisibility.bind(this);
        }
        Cursor.prototype.$updateVisibility = function (val) {
            var cursors = this.cursors;
            for (var i = cursors.length; i--;)
                cursors[i].style.visibility = val ? "" : "hidden";
        };
        Cursor.prototype.$updateOpacity = function (val) {
            var cursors = this.cursors;
            for (var i = cursors.length; i--;)
                cursors[i].style.opacity = val ? "" : "0";
        };
        Cursor.prototype.setPadding = function (padding) {
            this.$padding = padding;
        };
        Cursor.prototype.setSession = function (session) {
            this.session = session;
        };
        Cursor.prototype.setBlinking = function (blinking) {
            if (blinking !== this.isBlinking) {
                this.isBlinking = blinking;
                this.restartTimer();
            }
        };
        Cursor.prototype.setBlinkInterval = function (blinkInterval) {
            if (blinkInterval !== this.blinkInterval) {
                this.blinkInterval = blinkInterval;
                this.restartTimer();
            }
        };
        Cursor.prototype.setSmoothBlinking = function (smoothBlinking) {
            if (smoothBlinking != this.smoothBlinking && !IE8) {
                this.smoothBlinking = smoothBlinking;
                dom_1.setCssClass(this.element, "ace_smooth-blinking", smoothBlinking);
                this.$updateCursors(true);
                this.$updateCursors = (smoothBlinking
                    ? this.$updateOpacity
                    : this.$updateVisibility).bind(this);
                this.restartTimer();
            }
        };
        Cursor.prototype.addCursor = function () {
            var el = dom_1.createElement("div");
            el.className = "ace_cursor";
            this.element.appendChild(el);
            this.cursors.push(el);
            return el;
        };
        Cursor.prototype.removeCursor = function () {
            if (this.cursors.length > 1) {
                var el = this.cursors.pop();
                el.parentNode.removeChild(el);
                return el;
            }
        };
        Cursor.prototype.hideCursor = function () {
            this.isVisible = false;
            dom_1.addCssClass(this.element, "ace_hidden-cursors");
            this.restartTimer();
        };
        Cursor.prototype.showCursor = function () {
            this.isVisible = true;
            dom_1.removeCssClass(this.element, "ace_hidden-cursors");
            this.restartTimer();
        };
        Cursor.prototype.restartTimer = function () {
            var update = this.$updateCursors;
            clearInterval(this.intervalId);
            clearTimeout(this.timeoutId);
            if (this.smoothBlinking) {
                dom_1.removeCssClass(this.element, "ace_smooth-blinking");
            }
            update(true);
            if (!this.isBlinking || !this.blinkInterval || !this.isVisible)
                return;
            if (this.smoothBlinking) {
                setTimeout(function () {
                    dom_1.addCssClass(this.element, "ace_smooth-blinking");
                }.bind(this));
            }
            var blink = function () {
                this.timeoutId = setTimeout(function () {
                    update(false);
                }, 0.6 * this.blinkInterval);
            }.bind(this);
            this.intervalId = setInterval(function () {
                update(true);
                blink();
            }, this.blinkInterval);
            blink();
        };
        Cursor.prototype.getPixelPosition = function (position, onScreen) {
            if (!this.config || !this.session)
                return { left: 0, top: 0 };
            if (!position) {
                position = this.session.getSelection().getCursor();
            }
            var pos = this.session.documentToScreenPosition(position.row, position.column);
            var cursorLeft = this.$padding + pos.column * this.config.characterWidth;
            var cursorTop = (pos.row - (onScreen ? this.config.firstRowScreen : 0)) * this.config.lineHeight;
            return { left: cursorLeft, top: cursorTop };
        };
        Cursor.prototype.update = function (config) {
            this.config = config;
            // Selection markers is a concept from multi selection.
            var selections = this.session['$selectionMarkers'];
            var i = 0, cursorIndex = 0;
            if (selections === undefined || selections.length === 0) {
                selections = [{ cursor: null }];
            }
            for (var i = 0, n = selections.length; i < n; i++) {
                var pixelPos = this.getPixelPosition(selections[i].cursor, true);
                if ((pixelPos.top > config.height + config.offset ||
                    pixelPos.top < 0) && i > 1) {
                    continue;
                }
                var style = (this.cursors[cursorIndex++] || this.addCursor()).style;
                style.left = pixelPos.left + "px";
                style.top = pixelPos.top + "px";
                style.width = config.characterWidth + "px";
                style.height = config.lineHeight + "px";
            }
            while (this.cursors.length > cursorIndex)
                this.removeCursor();
            var overwrite = this.session.getOverwrite();
            this.$setOverwrite(overwrite);
            // cache for textarea and gutter highlight
            this.$pixelPos = pixelPos;
            this.restartTimer();
        };
        Cursor.prototype.$setOverwrite = function (overwrite) {
            if (overwrite != this.overwrite) {
                this.overwrite = overwrite;
                if (overwrite)
                    dom_1.addCssClass(this.element, "ace_overwrite-cursors");
                else
                    dom_1.removeCssClass(this.element, "ace_overwrite-cursors");
            }
        };
        Cursor.prototype.destroy = function () {
            clearInterval(this.intervalId);
            clearTimeout(this.timeoutId);
        };
        return Cursor;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Cursor;
});

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('ScrollBar',["require", "exports", "./lib/dom", "./lib/event", "./lib/event_emitter"], function (require, exports, dom_1, event_1, event_emitter_1) {
    /**
     * An abstract class representing a native scrollbar control.
     * @class ScrollBar
     **/
    var ScrollBar = (function (_super) {
        __extends(ScrollBar, _super);
        /**
         * Creates a new `ScrollBar`. `parent` is the owner of the scroll bar.
         * @param {DOMElement} parent A DOM element
         *
         * @constructor
         **/
        function ScrollBar(parent, classSuffix) {
            _super.call(this);
            this.element = dom_1.createElement("div");
            this.element.className = "ace_scrollbar ace_scrollbar" + classSuffix;
            this.inner = dom_1.createElement("div");
            this.inner.className = "ace_scrollbar-inner";
            this.element.appendChild(this.inner);
            parent.appendChild(this.element);
            this.setVisible(false);
            this.skipEvent = false;
            event_1.addListener(this.element, "mousedown", event.preventDefault);
        }
        ScrollBar.prototype.setVisible = function (isVisible) {
            this.element.style.display = isVisible ? "" : "none";
            this.isVisible = isVisible;
        };
        return ScrollBar;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = ScrollBar;
});

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('VScrollBar',["require", "exports", "./lib/event", './ScrollBar', "./lib/dom"], function (require, exports, event_1, ScrollBar_1, dom_1) {
    /**
     * Represents a vertical scroll bar.
     * @class VScrollBar
     */
    var VScrollBar = (function (_super) {
        __extends(VScrollBar, _super);
        /**
         * Creates a new `VScrollBar`. `parent` is the owner of the scroll bar.
         * @param {DOMElement} parent A DOM element
         * @param {Object} renderer An editor renderer
         *
         * @constructor
         */
        function VScrollBar(parent, renderer) {
            _super.call(this, parent, '-v');
            this._scrollTop = 0;
            // in OSX lion the scrollbars appear to have no width. In this case resize the
            // element to show the scrollbar but still pretend that the scrollbar has a width
            // of 0px
            // in Firefox 6+ scrollbar is hidden if element has the same width as scrollbar
            // make element a little bit wider to retain scrollbar when page is zoomed 
            renderer.$scrollbarWidth = this._width = dom_1.scrollbarWidth(parent.ownerDocument);
            this.inner.style.width = this.element.style.width = (this._width || 15) + 5 + "px";
            event_1.addListener(this.element, "scroll", this.onScroll.bind(this));
        }
        /**
         * Emitted when the scroll bar, well, scrolls.
         * @event scroll
         * @param {Object} e Contains one property, `"data"`, which indicates the current scroll top position
         **/
        VScrollBar.prototype.onScroll = function () {
            if (!this.skipEvent) {
                this._scrollTop = this.element.scrollTop;
                this._emit("scroll", { data: this._scrollTop });
            }
            this.skipEvent = false;
        };
        Object.defineProperty(VScrollBar.prototype, "width", {
            /**
             * Returns the width of the scroll bar.
             * @returns {Number}
             **/
            get: function () {
                return this.isVisible ? this._width : 0;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Sets the height of the scroll bar, in pixels.
         * @param {Number} height The new height
         **/
        VScrollBar.prototype.setHeight = function (height) {
            this.element.style.height = height + "px";
        };
        /**
         * Sets the inner height of the scroll bar, in pixels.
         * @param {Number} height The new inner height
         * @deprecated Use setScrollHeight instead
         **/
        VScrollBar.prototype.setInnerHeight = function (height) {
            this.inner.style.height = height + "px";
        };
        /**
         * Sets the scroll height of the scroll bar, in pixels.
         * @param {Number} height The new scroll height
         **/
        VScrollBar.prototype.setScrollHeight = function (height) {
            this.inner.style.height = height + "px";
        };
        /**
         * Sets the scroll top of the scroll bar.
         * @param {Number} scrollTop The new scroll top
         **/
        // on chrome 17+ for small zoom levels after calling this function
        // this.element.scrollTop != scrollTop which makes page to scroll up.
        VScrollBar.prototype.setScrollTop = function (scrollTop) {
            if (this._scrollTop != scrollTop) {
                this.skipEvent = true;
                this._scrollTop = this.element.scrollTop = scrollTop;
            }
        };
        Object.defineProperty(VScrollBar.prototype, "scrollTop", {
            get: function () {
                return this._scrollTop;
            },
            enumerable: true,
            configurable: true
        });
        return VScrollBar;
    })(ScrollBar_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = VScrollBar;
});

var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('HScrollBar',["require", "exports", "./lib/event", './ScrollBar'], function (require, exports, event_1, ScrollBar_1) {
    /**
     * Represents a horizontal scroll bar.
     * @class HScrollBar
     **/
    var HScrollBar = (function (_super) {
        __extends(HScrollBar, _super);
        /**
         * Creates a new `HScrollBar`. `parent` is the owner of the scroll bar.
         * @param {DOMElement} parent A DOM element
         * @param {Object} renderer An editor renderer
         *
         * @constructor
         **/
        function HScrollBar(parent, renderer) {
            _super.call(this, parent, '-h');
            this._scrollLeft = 0;
            // in OSX lion the scrollbars appear to have no width. In this case resize the
            // element to show the scrollbar but still pretend that the scrollbar has a width
            // of 0px
            // in Firefox 6+ scrollbar is hidden if element has the same width as scrollbar
            // make element a little bit wider to retain scrollbar when page is zoomed 
            this._height = renderer.$scrollbarWidth;
            this.inner.style.height = this.element.style.height = (this._height || 15) + 5 + "px";
            event_1.addListener(this.element, "scroll", this.onScroll.bind(this));
        }
        /**
         * Emitted when the scroll bar, well, scrolls.
         * @event scroll
         * @param {Object} e Contains one property, `"data"`, which indicates the current scroll left position
         **/
        HScrollBar.prototype.onScroll = function () {
            if (!this.skipEvent) {
                this._scrollLeft = this.element.scrollLeft;
                this._emit("scroll", { data: this._scrollLeft });
            }
            this.skipEvent = false;
        };
        Object.defineProperty(HScrollBar.prototype, "height", {
            /**
             * Returns the height of the scroll bar.
             * @returns {Number}
             **/
            get: function () {
                return this.isVisible ? this._height : 0;
            },
            enumerable: true,
            configurable: true
        });
        /**
         * Sets the width of the scroll bar, in pixels.
         * @param {Number} width The new width
         **/
        HScrollBar.prototype.setWidth = function (width) {
            this.element.style.width = width + "px";
        };
        /**
         * Sets the inner width of the scroll bar, in pixels.
         * @param {Number} width The new inner width
         * @deprecated Use setScrollWidth instead
         **/
        HScrollBar.prototype.setInnerWidth = function (width) {
            this.inner.style.width = width + "px";
        };
        /**
         * Sets the scroll width of the scroll bar, in pixels.
         * @param {Number} width The new scroll width
         **/
        HScrollBar.prototype.setScrollWidth = function (width) {
            this.inner.style.width = width + "px";
        };
        /**
         * Sets the scroll left of the scroll bar.
         * @param {Number} scrollTop The new scroll left
         **/
        // on chrome 17+ for small zoom levels after calling this function
        // this.element.scrollTop != scrollTop which makes page to scroll up.
        HScrollBar.prototype.setScrollLeft = function (scrollLeft) {
            if (this._scrollLeft != scrollLeft) {
                this.skipEvent = true;
                this._scrollLeft = this.element.scrollLeft = scrollLeft;
            }
        };
        return HScrollBar;
    })(ScrollBar_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = HScrollBar;
});

define('RenderLoop',["require", "exports", './lib/event'], function (require, exports, event_1) {
    /**
     * Batches changes (that force something to be redrawn) in the background.
     */
    var RenderLoop = (function () {
        function RenderLoop(onRender, $window) {
            if ($window === void 0) { $window = window; }
            this.pending = false;
            this.changes = 0;
            this.onRender = onRender;
            this.$window = $window;
        }
        RenderLoop.prototype.schedule = function (change) {
            this.changes = this.changes | change;
            if (!this.pending && this.changes) {
                this.pending = true;
                var self = this;
                event_1.requestAnimationFrame(function () {
                    self.pending = false;
                    var changes;
                    while (changes = self.changes) {
                        self.changes = 0;
                        self.onRender(changes);
                    }
                }, this.$window);
            }
        };
        return RenderLoop;
    })();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = RenderLoop;
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
;
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('layer/FontMetrics',["require", "exports", "../lib/dom", "../lib/lang", "../lib/useragent", "../lib/event_emitter"], function (require, exports, dom_1, lang_1, useragent_1, event_emitter_1) {
    var CHAR_COUNT = 0;
    var FontMetrics = (function (_super) {
        __extends(FontMetrics, _super);
        function FontMetrics(parentEl, interval) {
            _super.call(this);
            this.$characterSize = { width: 0, height: 0 };
            this.el = dom_1.createElement("div");
            this.$setMeasureNodeStyles(this.el.style, true);
            this.$main = dom_1.createElement("div");
            this.$setMeasureNodeStyles(this.$main.style);
            this.$measureNode = dom_1.createElement("div");
            this.$setMeasureNodeStyles(this.$measureNode.style);
            this.el.appendChild(this.$main);
            this.el.appendChild(this.$measureNode);
            parentEl.appendChild(this.el);
            if (!CHAR_COUNT) {
                this.$testFractionalRect();
            }
            this.$measureNode.innerHTML = lang_1.stringRepeat("X", CHAR_COUNT);
            this.$characterSize = { width: 0, height: 0 };
            this.checkForSizeChanges();
        }
        FontMetrics.prototype.$testFractionalRect = function () {
            var el = dom_1.createElement("div");
            this.$setMeasureNodeStyles(el.style);
            el.style.width = "0.2px";
            document.documentElement.appendChild(el);
            var w = el.getBoundingClientRect().width;
            // TODO; Use a ternary conditional...
            if (w > 0 && w < 1) {
                CHAR_COUNT = 1;
            }
            else {
                CHAR_COUNT = 100;
            }
            el.parentNode.removeChild(el);
        };
        FontMetrics.prototype.$setMeasureNodeStyles = function (style, isRoot) {
            style.width = style.height = "auto";
            style.left = style.top = "-100px";
            style.visibility = "hidden";
            style.position = "fixed";
            style.whiteSpace = "pre";
            if (useragent_1.isIE < 8) {
                style["font-family"] = "inherit";
            }
            else {
                style.font = "inherit";
            }
            style.overflow = isRoot ? "hidden" : "visible";
        };
        FontMetrics.prototype.checkForSizeChanges = function () {
            var size = this.$measureSizes();
            if (size && (this.$characterSize.width !== size.width || this.$characterSize.height !== size.height)) {
                this.$measureNode.style.fontWeight = "bold";
                var boldSize = this.$measureSizes();
                this.$measureNode.style.fontWeight = "";
                this.$characterSize = size;
                this.charSizes = Object.create(null);
                this.allowBoldFonts = boldSize && boldSize.width === size.width && boldSize.height === size.height;
                this._emit("changeCharacterSize", { data: size });
            }
        };
        FontMetrics.prototype.$pollSizeChanges = function () {
            if (this.$pollSizeChangesTimer) {
                return this.$pollSizeChangesTimer;
            }
            var self = this;
            return this.$pollSizeChangesTimer = setInterval(function () {
                self.checkForSizeChanges();
            }, 500);
        };
        FontMetrics.prototype.setPolling = function (val) {
            if (val) {
                this.$pollSizeChanges();
            }
            else {
                if (this.$pollSizeChangesTimer) {
                    this.$pollSizeChangesTimer;
                }
            }
        };
        FontMetrics.prototype.$measureSizes = function () {
            if (CHAR_COUNT === 1) {
                var rect = null;
                try {
                    rect = this.$measureNode.getBoundingClientRect();
                }
                catch (e) {
                    rect = { width: 0, height: 0, left: 0, right: 0, top: 0, bottom: 0 };
                }
                var size = { height: rect.height, width: rect.width };
            }
            else {
                var size = { height: this.$measureNode.clientHeight, width: this.$measureNode.clientWidth / CHAR_COUNT };
            }
            // Size and width can be null if the editor is not visible or
            // detached from the document
            if (size.width === 0 || size.height === 0) {
                return null;
            }
            return size;
        };
        FontMetrics.prototype.$measureCharWidth = function (ch) {
            this.$main.innerHTML = lang_1.stringRepeat(ch, CHAR_COUNT);
            var rect = this.$main.getBoundingClientRect();
            return rect.width / CHAR_COUNT;
        };
        FontMetrics.prototype.getCharacterWidth = function (ch) {
            var w = this.charSizes[ch];
            if (w === undefined) {
                this.charSizes[ch] = this.$measureCharWidth(ch) / this.$characterSize.width;
            }
            return w;
        };
        FontMetrics.prototype.destroy = function () {
            clearInterval(this.$pollSizeChangesTimer);
            if (this.el && this.el.parentNode) {
                this.el.parentNode.removeChild(this.el);
            }
        };
        return FontMetrics;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = FontMetrics;
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
;
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define('VirtualRenderer',["require", "exports", "./lib/dom", "./config", "./lib/useragent", "./layer/Gutter", "./layer/Marker", "./layer/Text", "./layer/Cursor", "./VScrollBar", "./HScrollBar", "./RenderLoop", "./layer/FontMetrics", "./lib/event_emitter"], function (require, exports, dom_1, config_1, useragent_1, Gutter_1, Marker_1, Text_1, Cursor_1, VScrollBar_1, HScrollBar_1, RenderLoop_1, FontMetrics_1, event_emitter_1) {
    // FIXME
    // import editorCss = require("./requirejs/text!./css/editor.css");
    // importCssString(editorCss, "ace_editor");
    var CHANGE_CURSOR = 1;
    var CHANGE_MARKER = 2;
    var CHANGE_GUTTER = 4;
    var CHANGE_SCROLL = 8;
    var CHANGE_LINES = 16;
    var CHANGE_TEXT = 32;
    var CHANGE_SIZE = 64;
    var CHANGE_MARKER_BACK = 128;
    var CHANGE_MARKER_FRONT = 256;
    var CHANGE_FULL = 512;
    var CHANGE_H_SCROLL = 1024;
    /**
     * The class that is responsible for drawing everything you see on the screen!
     * @related editor.renderer
     * @class VirtualRenderer
     **/
    var VirtualRenderer = (function (_super) {
        __extends(VirtualRenderer, _super);
        /**
         * Constructs a new `VirtualRenderer` within the `container` specified.
         * @class VirtualRenderer
         * @constructor
         * @param container {HTMLElement} The root element of the editor
         */
        function VirtualRenderer(container) {
            _super.call(this);
            this.scrollLeft = 0;
            this.scrollTop = 0;
            this.layerConfig = {
                width: 1,
                padding: 0,
                firstRow: 0,
                firstRowScreen: 0,
                lastRow: 0,
                lineHeight: 0,
                characterWidth: 0,
                minHeight: 1,
                maxHeight: 1,
                offset: 0,
                height: 1,
                gutterOffset: 1
            };
            this.$padding = 0;
            this.$frozen = false;
            this.STEPS = 8;
            this.scrollMargin = {
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                v: 0,
                h: 0
            };
            this.$changes = 0;
            var _self = this;
            this.container = container || dom_1.createElement("div");
            // TODO: this breaks rendering in Cloud9 with multiple ace instances
            // // Imports CSS once per DOM document ('ace_editor' serves as an identifier).
            // importCssString(editorCss, "ace_editor", container.ownerDocument);
            // in IE <= 9 the native cursor always shines through
            this.$keepTextAreaAtCursor = !useragent_1.isOldIE;
            dom_1.addCssClass(this.container, "ace_editor");
            this.$gutter = dom_1.createElement("div");
            this.$gutter.className = "ace_gutter";
            this.container.appendChild(this.$gutter);
            this.scroller = dom_1.createElement("div");
            this.scroller.className = "ace_scroller";
            this.container.appendChild(this.scroller);
            this.content = dom_1.createElement("div");
            this.content.className = "ace_content";
            this.scroller.appendChild(this.content);
            this.$gutterLayer = new Gutter_1.default(this.$gutter);
            this.$gutterLayer.on("changeGutterWidth", this.onGutterResize.bind(this));
            this.$markerBack = new Marker_1.default(this.content);
            var textLayer = this.$textLayer = new Text_1.default(this.content);
            this.canvas = textLayer.element;
            this.$markerFront = new Marker_1.default(this.content);
            this.$cursorLayer = new Cursor_1.default(this.content);
            // Indicates whether the horizontal scrollbar is visible
            this.$horizScroll = false;
            this.$vScroll = false;
            this.scrollBarV = new VScrollBar_1.default(this.container, this);
            this.scrollBarH = new HScrollBar_1.default(this.container, this);
            this.scrollBarV.on("scroll", function (event, scrollBar) {
                if (!_self.$scrollAnimation) {
                    _self.session.setScrollTop(event.data - _self.scrollMargin.top);
                }
            });
            this.scrollBarH.on("scroll", function (event, scrollBar) {
                if (!_self.$scrollAnimation) {
                    _self.session.setScrollLeft(event.data - _self.scrollMargin.left);
                }
            });
            this.cursorPos = {
                row: 0,
                column: 0
            };
            this.$fontMetrics = new FontMetrics_1.default(this.container, 500);
            this.$textLayer.$setFontMetrics(this.$fontMetrics);
            this.$textLayer.on("changeCharacterSize", function (event, text) {
                _self.updateCharacterSize();
                _self.onResize(true, _self.gutterWidth, _self.$size.width, _self.$size.height);
                _self._signal("changeCharacterSize", event);
            });
            this.$size = {
                width: 0,
                height: 0,
                scrollerHeight: 0,
                scrollerWidth: 0,
                $dirty: true
            };
            this.$loop = new RenderLoop_1.default(this.$renderChanges.bind(this), this.container.ownerDocument.defaultView);
            this.$loop.schedule(CHANGE_FULL);
            this.updateCharacterSize();
            this.setPadding(4);
            config_1.resetOptions(this);
            config_1._emit("renderer", this);
        }
        Object.defineProperty(VirtualRenderer.prototype, "maxLines", {
            set: function (maxLines) {
                this.$maxLines = maxLines;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(VirtualRenderer.prototype, "keepTextAreaAtCursor", {
            set: function (keepTextAreaAtCursor) {
                this.$keepTextAreaAtCursor = keepTextAreaAtCursor;
            },
            enumerable: true,
            configurable: true
        });
        VirtualRenderer.prototype.setDefaultCursorStyle = function () {
            this.content.style.cursor = "default";
        };
        /**
         * Not sure what the correct semantics should be for this.
         */
        VirtualRenderer.prototype.setCursorLayerOff = function () {
            var noop = function () { };
            this.$cursorLayer.restartTimer = noop;
            this.$cursorLayer.element.style.opacity = "0";
        };
        VirtualRenderer.prototype.updateCharacterSize = function () {
            // FIXME: DGH allowBoldFonts does not exist on Text
            if (this.$textLayer['allowBoldFonts'] != this.$allowBoldFonts) {
                this.$allowBoldFonts = this.$textLayer['allowBoldFonts'];
                this.setStyle("ace_nobold", !this.$allowBoldFonts);
            }
            this.layerConfig.characterWidth = this.characterWidth = this.$textLayer.getCharacterWidth();
            this.layerConfig.lineHeight = this.lineHeight = this.$textLayer.getLineHeight();
            this.$updatePrintMargin();
        };
        /**
         * Associates the renderer with an EditSession.
         */
        VirtualRenderer.prototype.setSession = function (session) {
            if (this.session) {
                this.session.doc.off("changeNewLineMode", this.onChangeNewLineMode);
            }
            this.session = session;
            if (!session) {
                return;
            }
            if (this.scrollMargin.top && session.getScrollTop() <= 0)
                session.setScrollTop(-this.scrollMargin.top);
            this.$cursorLayer.setSession(session);
            this.$markerBack.setSession(session);
            this.$markerFront.setSession(session);
            this.$gutterLayer.setSession(session);
            this.$textLayer.setSession(session);
            this.$loop.schedule(CHANGE_FULL);
            this.session.$setFontMetrics(this.$fontMetrics);
            this.onChangeNewLineMode = this.onChangeNewLineMode.bind(this);
            this.onChangeNewLineMode();
            this.session.doc.on("changeNewLineMode", this.onChangeNewLineMode);
        };
        /**
        * Triggers a partial update of the text, from the range given by the two parameters.
        * @param {Number} firstRow The first row to update
        * @param {Number} lastRow The last row to update
        *
        *
        **/
        VirtualRenderer.prototype.updateLines = function (firstRow, lastRow, force) {
            if (lastRow === undefined) {
                lastRow = Infinity;
            }
            if (!this.$changedLines) {
                this.$changedLines = { firstRow: firstRow, lastRow: lastRow };
            }
            else {
                if (this.$changedLines.firstRow > firstRow) {
                    this.$changedLines.firstRow = firstRow;
                }
                if (this.$changedLines.lastRow < lastRow) {
                    this.$changedLines.lastRow = lastRow;
                }
            }
            // If the change happened offscreen above us then it's possible
            // that a new line wrap will affect the position of the lines on our
            // screen so they need redrawn.
            // TODO: better solution is to not change scroll position when text is changed outside of visible area
            if (this.$changedLines.lastRow < this.layerConfig.firstRow) {
                if (force) {
                    this.$changedLines.lastRow = this.layerConfig.lastRow;
                }
                else {
                    return;
                }
            }
            if (this.$changedLines.firstRow > this.layerConfig.lastRow) {
                return;
            }
            this.$loop.schedule(CHANGE_LINES);
        };
        VirtualRenderer.prototype.onChangeNewLineMode = function () {
            this.$loop.schedule(CHANGE_TEXT);
            this.$textLayer.$updateEolChar();
        };
        VirtualRenderer.prototype.onChangeTabSize = function () {
            if (this.$loop) {
                if (this.$loop.schedule) {
                    this.$loop.schedule(CHANGE_TEXT | CHANGE_MARKER);
                }
                else {
                }
            }
            else {
            }
            if (this.$textLayer) {
                if (this.$textLayer.onChangeTabSize) {
                    this.$textLayer.onChangeTabSize();
                }
                else {
                }
            }
            else {
            }
        };
        /**
         * Triggers a full update of the text, for all the rows.
         */
        VirtualRenderer.prototype.updateText = function () {
            this.$loop.schedule(CHANGE_TEXT);
        };
        /**
         * Triggers a full update of all the layers, for all the rows.
         * @param {Boolean} force If `true`, forces the changes through
         */
        VirtualRenderer.prototype.updateFull = function (force) {
            if (force)
                this.$renderChanges(CHANGE_FULL, true);
            else
                this.$loop.schedule(CHANGE_FULL);
        };
        /**
         * Updates the font size.
         */
        VirtualRenderer.prototype.updateFontSize = function () {
            this.$textLayer.checkForSizeChanges();
        };
        VirtualRenderer.prototype.$updateSizeAsync = function () {
            if (this.$loop.pending) {
                this.$size.$dirty = true;
            }
            else {
                this.onResize();
            }
        };
        /**
        * [Triggers a resize of the editor.]{: #VirtualRenderer.onResize}
        * @param {Boolean} force If `true`, recomputes the size, even if the height and width haven't changed
        * @param {Number} gutterWidth The width of the gutter in pixels
        * @param {Number} width The width of the editor in pixels
        * @param {Number} height The hiehgt of the editor, in pixels
        *
        *
        **/
        VirtualRenderer.prototype.onResize = function (force, gutterWidth, width, height) {
            if (this.resizing > 2)
                return;
            else if (this.resizing > 0)
                this.resizing++;
            else
                this.resizing = force ? 1 : 0;
            // `|| el.scrollHeight` is required for outosizing editors on ie
            // where elements with clientHeight = 0 alsoe have clientWidth = 0
            var el = this.container;
            if (!height)
                height = el.clientHeight || el.scrollHeight;
            if (!width)
                width = el.clientWidth || el.scrollWidth;
            var changes = this.$updateCachedSize(force, gutterWidth, width, height);
            if (!this.$size.scrollerHeight || (!width && !height))
                return this.resizing = 0;
            if (force)
                this.$gutterLayer.$padding = null;
            if (force)
                this.$renderChanges(changes | this.$changes, true);
            else
                this.$loop.schedule(changes | this.$changes);
            if (this.resizing)
                this.resizing = 0;
        };
        VirtualRenderer.prototype.$updateCachedSize = function (force, gutterWidth, width, height) {
            height -= (this.$extraHeight || 0);
            var changes = 0;
            var size = this.$size;
            var oldSize = {
                width: size.width,
                height: size.height,
                scrollerHeight: size.scrollerHeight,
                scrollerWidth: size.scrollerWidth
            };
            if (height && (force || size.height != height)) {
                size.height = height;
                changes |= CHANGE_SIZE;
                size.scrollerHeight = size.height;
                if (this.$horizScroll)
                    size.scrollerHeight -= this.scrollBarH.height;
                this.scrollBarV.element.style.bottom = this.scrollBarH.height + "px";
                changes = changes | CHANGE_SCROLL;
            }
            if (width && (force || size.width != width)) {
                changes |= CHANGE_SIZE;
                size.width = width;
                if (gutterWidth == null)
                    gutterWidth = this.$showGutter ? this.$gutter.offsetWidth : 0;
                this.gutterWidth = gutterWidth;
                this.scrollBarH.element.style.left =
                    this.scroller.style.left = gutterWidth + "px";
                size.scrollerWidth = Math.max(0, width - gutterWidth - this.scrollBarV.width);
                this.scrollBarH.element.style.right =
                    this.scroller.style.right = this.scrollBarV.width + "px";
                this.scroller.style.bottom = this.scrollBarH.height + "px";
                if (this.session && this.session.getUseWrapMode() && this.adjustWrapLimit() || force)
                    changes |= CHANGE_FULL;
            }
            size.$dirty = !width || !height;
            if (changes)
                this._signal("resize", oldSize);
            return changes;
        };
        VirtualRenderer.prototype.onGutterResize = function () {
            var gutterWidth = this.$showGutter ? this.$gutter.offsetWidth : 0;
            if (gutterWidth != this.gutterWidth)
                this.$changes |= this.$updateCachedSize(true, gutterWidth, this.$size.width, this.$size.height);
            if (this.session.getUseWrapMode() && this.adjustWrapLimit()) {
                this.$loop.schedule(CHANGE_FULL);
            }
            else if (this.$size.$dirty) {
                this.$loop.schedule(CHANGE_FULL);
            }
            else {
                this.$computeLayerConfig();
                this.$loop.schedule(CHANGE_MARKER);
            }
        };
        /**
        * Adjusts the wrap limit, which is the number of characters that can fit within the width of the edit area on screen.
        **/
        VirtualRenderer.prototype.adjustWrapLimit = function () {
            var availableWidth = this.$size.scrollerWidth - this.$padding * 2;
            var limit = Math.floor(availableWidth / this.characterWidth);
            return this.session.adjustWrapLimit(limit, this.$showPrintMargin && this.$printMarginColumn);
        };
        /**
        * Identifies whether you want to have an animated scroll or not.
        * @param {Boolean} shouldAnimate Set to `true` to show animated scrolls
        *
        **/
        VirtualRenderer.prototype.setAnimatedScroll = function (shouldAnimate) {
            this.setOption("animatedScroll", shouldAnimate);
        };
        /**
        * Returns whether an animated scroll happens or not.
        * @returns {Boolean}
        **/
        VirtualRenderer.prototype.getAnimatedScroll = function () {
            return this.$animatedScroll;
        };
        /**
         * Identifies whether you want to show invisible characters or not.
         * @param {Boolean} showInvisibles Set to `true` to show invisibles
         */
        VirtualRenderer.prototype.setShowInvisibles = function (showInvisibles) {
            this.setOption("showInvisibles", showInvisibles);
        };
        /**
         * Returns whether invisible characters are being shown or not.
         * @returns {Boolean}
         */
        VirtualRenderer.prototype.getShowInvisibles = function () {
            return this.getOption("showInvisibles");
        };
        VirtualRenderer.prototype.getDisplayIndentGuides = function () {
            return this.getOption("displayIndentGuides");
        };
        VirtualRenderer.prototype.setDisplayIndentGuides = function (displayIndentGuides) {
            this.setOption("displayIndentGuides", displayIndentGuides);
        };
        /**
         * Identifies whether you want to show the print margin or not.
         * @param {Boolean} showPrintMargin Set to `true` to show the print margin
         *
         */
        VirtualRenderer.prototype.setShowPrintMargin = function (showPrintMargin) {
            this.setOption("showPrintMargin", showPrintMargin);
        };
        /**
         * Returns whether the print margin is being shown or not.
         * @returns {Boolean}
         */
        VirtualRenderer.prototype.getShowPrintMargin = function () {
            return this.getOption("showPrintMargin");
        };
        /**
         * Sets the column defining where the print margin should be.
         * @param {Number} printMarginColumn Specifies the new print margin
         */
        VirtualRenderer.prototype.setPrintMarginColumn = function (printMarginColumn) {
            this.setOption("printMarginColumn", printMarginColumn);
        };
        /**
         * Returns the column number of where the print margin is.
         * @returns {Number}
         */
        VirtualRenderer.prototype.getPrintMarginColumn = function () {
            return this.getOption("printMarginColumn");
        };
        /**
         * Returns `true` if the gutter is being shown.
         * @returns {Boolean}
         */
        VirtualRenderer.prototype.getShowGutter = function () {
            return this.getOption("showGutter");
        };
        /**
        * Identifies whether you want to show the gutter or not.
        * @param {Boolean} show Set to `true` to show the gutter
        *
        **/
        VirtualRenderer.prototype.setShowGutter = function (show) {
            return this.setOption("showGutter", show);
        };
        VirtualRenderer.prototype.getFadeFoldWidgets = function () {
            return this.getOption("fadeFoldWidgets");
        };
        VirtualRenderer.prototype.setFadeFoldWidgets = function (show) {
            this.setOption("fadeFoldWidgets", show);
        };
        VirtualRenderer.prototype.setHighlightGutterLine = function (shouldHighlight) {
            this.setOption("highlightGutterLine", shouldHighlight);
        };
        VirtualRenderer.prototype.getHighlightGutterLine = function () {
            return this.getOption("highlightGutterLine");
        };
        VirtualRenderer.prototype.$updateGutterLineHighlight = function () {
            var pos = this.$cursorLayer.$pixelPos;
            var height = this.layerConfig.lineHeight;
            if (this.session.getUseWrapMode()) {
                var cursor = this.session.getSelection().getCursor();
                cursor.column = 0;
                pos = this.$cursorLayer.getPixelPosition(cursor, true);
                height *= this.session.getRowLength(cursor.row);
            }
            this.$gutterLineHighlight.style.top = pos.top - this.layerConfig.offset + "px";
            this.$gutterLineHighlight.style.height = height + "px";
        };
        VirtualRenderer.prototype.$updatePrintMargin = function () {
            if (!this.$showPrintMargin && !this.$printMarginEl)
                return;
            if (!this.$printMarginEl) {
                var containerEl = dom_1.createElement("div");
                containerEl.className = "ace_layer ace_print-margin-layer";
                this.$printMarginEl = dom_1.createElement("div");
                this.$printMarginEl.className = "ace_print-margin";
                containerEl.appendChild(this.$printMarginEl);
                this.content.insertBefore(containerEl, this.content.firstChild);
            }
            var style = this.$printMarginEl.style;
            style.left = ((this.characterWidth * this.$printMarginColumn) + this.$padding) + "px";
            style.visibility = this.$showPrintMargin ? "visible" : "hidden";
            if (this.session && this.session['$wrap'] == -1)
                this.adjustWrapLimit();
        };
        /**
        *
        * Returns the root element containing this renderer.
        * @returns {DOMElement}
        **/
        VirtualRenderer.prototype.getContainerElement = function () {
            return this.container;
        };
        /**
        *
        * Returns the element that the mouse events are attached to
        * @returns {DOMElement}
        **/
        VirtualRenderer.prototype.getMouseEventTarget = function () {
            return this.content;
        };
        /**
        *
        * Returns the element to which the hidden text area is added.
        * @returns {DOMElement}
        **/
        VirtualRenderer.prototype.getTextAreaContainer = function () {
            return this.container;
        };
        // move text input over the cursor
        // this is required for iOS and IME
        VirtualRenderer.prototype.$moveTextAreaToCursor = function () {
            if (!this.$keepTextAreaAtCursor)
                return;
            var config = this.layerConfig;
            var posTop = this.$cursorLayer.$pixelPos.top;
            var posLeft = this.$cursorLayer.$pixelPos.left;
            posTop -= config.offset;
            var h = this.lineHeight;
            if (posTop < 0 || posTop > config.height - h)
                return;
            var w = this.characterWidth;
            if (this.$composition) {
                var val = this.textarea.value.replace(/^\x01+/, "");
                w *= (this.session.$getStringScreenWidth(val)[0] + 2);
                h += 2;
                posTop -= 1;
            }
            posLeft -= this.scrollLeft;
            if (posLeft > this.$size.scrollerWidth - w)
                posLeft = this.$size.scrollerWidth - w;
            posLeft -= this.scrollBarV.width;
            this.textarea.style.height = h + "px";
            this.textarea.style.width = w + "px";
            this.textarea.style.right = Math.max(0, this.$size.scrollerWidth - posLeft - w) + "px";
            this.textarea.style.bottom = Math.max(0, this.$size.height - posTop - h) + "px";
        };
        /**
        *
        * [Returns the index of the first visible row.]{: #VirtualRenderer.getFirstVisibleRow}
        * @returns {Number}
        **/
        VirtualRenderer.prototype.getFirstVisibleRow = function () {
            return this.layerConfig.firstRow;
        };
        /**
        *
        * Returns the index of the first fully visible row. "Fully" here means that the characters in the row are not truncated; that the top and the bottom of the row are on the screen.
        * @returns {Number}
        **/
        VirtualRenderer.prototype.getFirstFullyVisibleRow = function () {
            return this.layerConfig.firstRow + (this.layerConfig.offset === 0 ? 0 : 1);
        };
        /**
        *
        * Returns the index of the last fully visible row. "Fully" here means that the characters in the row are not truncated; that the top and the bottom of the row are on the screen.
        * @returns {Number}
        **/
        VirtualRenderer.prototype.getLastFullyVisibleRow = function () {
            var flint = Math.floor((this.layerConfig.height + this.layerConfig.offset) / this.layerConfig.lineHeight);
            return this.layerConfig.firstRow - 1 + flint;
        };
        /**
        *
        * [Returns the index of the last visible row.]{: #VirtualRenderer.getLastVisibleRow}
        * @returns {Number}
        **/
        VirtualRenderer.prototype.getLastVisibleRow = function () {
            return this.layerConfig.lastRow;
        };
        /**
        * Sets the padding for all the layers.
        * @param {number} padding A new padding value (in pixels)
        **/
        VirtualRenderer.prototype.setPadding = function (padding) {
            this.$padding = padding;
            this.$textLayer.setPadding(padding);
            this.$cursorLayer.setPadding(padding);
            this.$markerFront.setPadding(padding);
            this.$markerBack.setPadding(padding);
            this.$loop.schedule(CHANGE_FULL);
            this.$updatePrintMargin();
        };
        VirtualRenderer.prototype.setScrollMargin = function (top, bottom, left, right) {
            var sm = this.scrollMargin;
            sm.top = top | 0;
            sm.bottom = bottom | 0;
            sm.right = right | 0;
            sm.left = left | 0;
            sm.v = sm.top + sm.bottom;
            sm.h = sm.left + sm.right;
            if (sm.top && this.scrollTop <= 0 && this.session)
                this.session.setScrollTop(-sm.top);
            this.updateFull();
        };
        /**
         * Returns whether the horizontal scrollbar is set to be always visible.
         * @returns {Boolean}
         **/
        VirtualRenderer.prototype.getHScrollBarAlwaysVisible = function () {
            // FIXME
            return this.$hScrollBarAlwaysVisible;
        };
        /**
         * Identifies whether you want to show the horizontal scrollbar or not.
         * @param {Boolean} alwaysVisible Set to `true` to make the horizontal scroll bar visible
         **/
        VirtualRenderer.prototype.setHScrollBarAlwaysVisible = function (alwaysVisible) {
            this.setOption("hScrollBarAlwaysVisible", alwaysVisible);
        };
        /**
         * Returns whether the vertical scrollbar is set to be always visible.
         * @returns {Boolean}
         **/
        VirtualRenderer.prototype.getVScrollBarAlwaysVisible = function () {
            return this.$vScrollBarAlwaysVisible;
        };
        /**
         * Identifies whether you want to show the vertical scrollbar or not.
         * @param {Boolean} alwaysVisible Set to `true` to make the vertical scroll bar visible
         */
        VirtualRenderer.prototype.setVScrollBarAlwaysVisible = function (alwaysVisible) {
            this.setOption("vScrollBarAlwaysVisible", alwaysVisible);
        };
        VirtualRenderer.prototype.$updateScrollBarV = function () {
            var scrollHeight = this.layerConfig.maxHeight;
            var scrollerHeight = this.$size.scrollerHeight;
            if (!this.$maxLines && this.$scrollPastEnd) {
                scrollHeight -= (scrollerHeight - this.lineHeight) * this.$scrollPastEnd;
                if (this.scrollTop > scrollHeight - scrollerHeight) {
                    scrollHeight = this.scrollTop + scrollerHeight;
                    this.scrollBarV.scrollTop = null;
                }
            }
            this.scrollBarV.setScrollHeight(scrollHeight + this.scrollMargin.v);
            this.scrollBarV.setScrollTop(this.scrollTop + this.scrollMargin.top);
        };
        VirtualRenderer.prototype.$updateScrollBarH = function () {
            this.scrollBarH.setScrollWidth(this.layerConfig.width + 2 * this.$padding + this.scrollMargin.h);
            this.scrollBarH.setScrollLeft(this.scrollLeft + this.scrollMargin.left);
        };
        VirtualRenderer.prototype.freeze = function () {
            this.$frozen = true;
        };
        VirtualRenderer.prototype.unfreeze = function () {
            this.$frozen = false;
        };
        VirtualRenderer.prototype.$renderChanges = function (changes, force) {
            if (this.$changes) {
                changes |= this.$changes;
                this.$changes = 0;
            }
            if ((!this.session || !this.container.offsetWidth || this.$frozen) || (!changes && !force)) {
                this.$changes |= changes;
                return;
            }
            if (this.$size.$dirty) {
                this.$changes |= changes;
                return this.onResize(true);
            }
            if (!this.lineHeight) {
                this.$textLayer.checkForSizeChanges();
            }
            // this.$logChanges(changes);
            this._signal("beforeRender");
            var config = this.layerConfig;
            // text, scrolling and resize changes can cause the view port size to change
            if (changes & CHANGE_FULL ||
                changes & CHANGE_SIZE ||
                changes & CHANGE_TEXT ||
                changes & CHANGE_LINES ||
                changes & CHANGE_SCROLL ||
                changes & CHANGE_H_SCROLL) {
                changes |= this.$computeLayerConfig();
                // If a change is made offscreen and wrapMode is on, then the onscreen
                // lines may have been pushed down. If so, the first screen row will not
                // have changed, but the first actual row will. In that case, adjust 
                // scrollTop so that the cursor and onscreen content stays in the same place.
                if (config.firstRow != this.layerConfig.firstRow && config.firstRowScreen == this.layerConfig.firstRowScreen) {
                    this.scrollTop = this.scrollTop + (config.firstRow - this.layerConfig.firstRow) * this.lineHeight;
                    changes = changes | CHANGE_SCROLL;
                    changes |= this.$computeLayerConfig();
                }
                config = this.layerConfig;
                // update scrollbar first to not lose scroll position when gutter calls resize
                this.$updateScrollBarV();
                if (changes & CHANGE_H_SCROLL)
                    this.$updateScrollBarH();
                this.$gutterLayer.element.style.marginTop = (-config.offset) + "px";
                this.content.style.marginTop = (-config.offset) + "px";
                this.content.style.width = config.width + 2 * this.$padding + "px";
                this.content.style.height = config.minHeight + "px";
            }
            // horizontal scrolling
            if (changes & CHANGE_H_SCROLL) {
                this.content.style.marginLeft = -this.scrollLeft + "px";
                this.scroller.className = this.scrollLeft <= 0 ? "ace_scroller" : "ace_scroller ace_scroll-left";
            }
            // full
            if (changes & CHANGE_FULL) {
                this.$textLayer.update(config);
                if (this.$showGutter)
                    this.$gutterLayer.update(config);
                this.$markerBack.update(config);
                this.$markerFront.update(config);
                this.$cursorLayer.update(config);
                this.$moveTextAreaToCursor();
                this.$highlightGutterLine && this.$updateGutterLineHighlight();
                this._signal("afterRender");
                return;
            }
            // scrolling
            if (changes & CHANGE_SCROLL) {
                if (changes & CHANGE_TEXT || changes & CHANGE_LINES)
                    this.$textLayer.update(config);
                else
                    this.$textLayer.scrollLines(config);
                if (this.$showGutter)
                    this.$gutterLayer.update(config);
                this.$markerBack.update(config);
                this.$markerFront.update(config);
                this.$cursorLayer.update(config);
                this.$highlightGutterLine && this.$updateGutterLineHighlight();
                this.$moveTextAreaToCursor();
                this._signal("afterRender");
                return;
            }
            if (changes & CHANGE_TEXT) {
                this.$textLayer.update(config);
                if (this.$showGutter)
                    this.$gutterLayer.update(config);
            }
            else if (changes & CHANGE_LINES) {
                if (this.$updateLines() || (changes & CHANGE_GUTTER) && this.$showGutter)
                    this.$gutterLayer.update(config);
            }
            else if (changes & CHANGE_TEXT || changes & CHANGE_GUTTER) {
                if (this.$showGutter)
                    this.$gutterLayer.update(config);
            }
            if (changes & CHANGE_CURSOR) {
                this.$cursorLayer.update(config);
                this.$moveTextAreaToCursor();
                this.$highlightGutterLine && this.$updateGutterLineHighlight();
            }
            if (changes & (CHANGE_MARKER | CHANGE_MARKER_FRONT)) {
                this.$markerFront.update(config);
            }
            if (changes & (CHANGE_MARKER | CHANGE_MARKER_BACK)) {
                this.$markerBack.update(config);
            }
            this._signal("afterRender");
        };
        VirtualRenderer.prototype.$autosize = function () {
            var height = this.session.getScreenLength() * this.lineHeight;
            var maxHeight = this.$maxLines * this.lineHeight;
            var desiredHeight = Math.max((this.$minLines || 1) * this.lineHeight, Math.min(maxHeight, height)) + this.scrollMargin.v + (this.$extraHeight || 0);
            var vScroll = height > maxHeight;
            if (desiredHeight != this.desiredHeight ||
                this.$size.height != this.desiredHeight || vScroll != this.$vScroll) {
                if (vScroll != this.$vScroll) {
                    this.$vScroll = vScroll;
                    this.scrollBarV.setVisible(vScroll);
                }
                var w = this.container.clientWidth;
                this.container.style.height = desiredHeight + "px";
                this.$updateCachedSize(true, this.$gutterWidth, w, desiredHeight);
                // this.$loop.changes = 0;
                this.desiredHeight = desiredHeight;
            }
        };
        VirtualRenderer.prototype.$computeLayerConfig = function () {
            if (this.$maxLines && this.lineHeight > 1) {
                this.$autosize();
            }
            var session = this.session;
            var size = this.$size;
            var hideScrollbars = size.height <= 2 * this.lineHeight;
            var screenLines = this.session.getScreenLength();
            var maxHeight = screenLines * this.lineHeight;
            var offset = this.scrollTop % this.lineHeight;
            var minHeight = size.scrollerHeight + this.lineHeight;
            var longestLine = this.$getLongestLine();
            var horizScroll = !hideScrollbars && (this.$hScrollBarAlwaysVisible ||
                size.scrollerWidth - longestLine - 2 * this.$padding < 0);
            var hScrollChanged = this.$horizScroll !== horizScroll;
            if (hScrollChanged) {
                this.$horizScroll = horizScroll;
                this.scrollBarH.setVisible(horizScroll);
            }
            if (!this.$maxLines && this.$scrollPastEnd) {
                maxHeight += (size.scrollerHeight - this.lineHeight) * this.$scrollPastEnd;
            }
            var vScroll = !hideScrollbars && (this.$vScrollBarAlwaysVisible ||
                size.scrollerHeight - maxHeight < 0);
            var vScrollChanged = this.$vScroll !== vScroll;
            if (vScrollChanged) {
                this.$vScroll = vScroll;
                this.scrollBarV.setVisible(vScroll);
            }
            this.session.setScrollTop(Math.max(-this.scrollMargin.top, Math.min(this.scrollTop, maxHeight - size.scrollerHeight + this.scrollMargin.bottom)));
            this.session.setScrollLeft(Math.max(-this.scrollMargin.left, Math.min(this.scrollLeft, longestLine + 2 * this.$padding - size.scrollerWidth + this.scrollMargin.right)));
            var lineCount = Math.ceil(minHeight / this.lineHeight) - 1;
            var firstRow = Math.max(0, Math.round((this.scrollTop - offset) / this.lineHeight));
            var lastRow = firstRow + lineCount;
            // Map lines on the screen to lines in the document.
            var firstRowScreen, firstRowHeight;
            var lineHeight = this.lineHeight;
            firstRow = session.screenToDocumentRow(firstRow, 0);
            // Check if firstRow is inside of a foldLine. If true, then use the first
            // row of the foldLine.
            var foldLine = session.getFoldLine(firstRow);
            if (foldLine) {
                firstRow = foldLine.start.row;
            }
            firstRowScreen = session.documentToScreenRow(firstRow, 0);
            firstRowHeight = session.getRowLength(firstRow) * lineHeight;
            lastRow = Math.min(session.screenToDocumentRow(lastRow, 0), session.getLength() - 1);
            minHeight = size.scrollerHeight + session.getRowLength(lastRow) * lineHeight +
                firstRowHeight;
            offset = this.scrollTop - firstRowScreen * lineHeight;
            var changes = 0;
            if (this.layerConfig.width != longestLine)
                changes = CHANGE_H_SCROLL;
            // Horizontal scrollbar visibility may have changed, which changes
            // the client height of the scroller
            if (hScrollChanged || vScrollChanged) {
                changes = this.$updateCachedSize(true, this.gutterWidth, size.width, size.height);
                this._signal("scrollbarVisibilityChanged");
                if (vScrollChanged)
                    longestLine = this.$getLongestLine();
            }
            this.layerConfig = {
                width: longestLine,
                padding: this.$padding,
                firstRow: firstRow,
                firstRowScreen: firstRowScreen,
                lastRow: lastRow,
                lineHeight: lineHeight,
                characterWidth: this.characterWidth,
                minHeight: minHeight,
                maxHeight: maxHeight,
                offset: offset,
                gutterOffset: Math.max(0, Math.ceil((offset + size.height - size.scrollerHeight) / lineHeight)),
                height: this.$size.scrollerHeight
            };
            return changes;
        };
        VirtualRenderer.prototype.$updateLines = function () {
            var firstRow = this.$changedLines.firstRow;
            var lastRow = this.$changedLines.lastRow;
            this.$changedLines = null;
            var layerConfig = this.layerConfig;
            if (firstRow > layerConfig.lastRow + 1) {
                return;
            }
            if (lastRow < layerConfig.firstRow) {
                return;
            }
            // if the last row is unknown -> redraw everything
            if (lastRow === Infinity) {
                if (this.$showGutter)
                    this.$gutterLayer.update(layerConfig);
                this.$textLayer.update(layerConfig);
                return;
            }
            // else update only the changed rows
            this.$textLayer.updateLines(layerConfig, firstRow, lastRow);
            return true;
        };
        VirtualRenderer.prototype.$getLongestLine = function () {
            var charCount = this.session.getScreenWidth();
            if (this.showInvisibles && !this.session.$useWrapMode)
                charCount += 1;
            return Math.max(this.$size.scrollerWidth - 2 * this.$padding, Math.round(charCount * this.characterWidth));
        };
        /**
        *
        * Schedules an update to all the front markers in the document.
        **/
        VirtualRenderer.prototype.updateFrontMarkers = function () {
            this.$markerFront.setMarkers(this.session.getMarkers(true));
            this.$loop.schedule(CHANGE_MARKER_FRONT);
        };
        /**
        *
        * Schedules an update to all the back markers in the document.
        **/
        VirtualRenderer.prototype.updateBackMarkers = function () {
            this.$markerBack.setMarkers(this.session.getMarkers(false));
            this.$loop.schedule(CHANGE_MARKER_BACK);
        };
        /**
        *
        * Redraw breakpoints.
        **/
        VirtualRenderer.prototype.updateBreakpoints = function () {
            this.$loop.schedule(CHANGE_GUTTER);
        };
        /**
        *
        * Sets annotations for the gutter.
        * @param {Array} annotations An array containing annotations
        **/
        VirtualRenderer.prototype.setAnnotations = function (annotations) {
            this.$gutterLayer.setAnnotations(annotations);
            this.$loop.schedule(CHANGE_GUTTER);
        };
        /**
        *
        * Updates the cursor icon.
        **/
        VirtualRenderer.prototype.updateCursor = function () {
            this.$loop.schedule(CHANGE_CURSOR);
        };
        /**
        *
        * Hides the cursor icon.
        **/
        VirtualRenderer.prototype.hideCursor = function () {
            this.$cursorLayer.hideCursor();
        };
        /**
        *
        * Shows the cursor icon.
        **/
        VirtualRenderer.prototype.showCursor = function () {
            this.$cursorLayer.showCursor();
        };
        VirtualRenderer.prototype.scrollSelectionIntoView = function (anchor, lead, offset) {
            // first scroll anchor into view then scroll lead into view
            this.scrollCursorIntoView(anchor, offset);
            this.scrollCursorIntoView(lead, offset);
        };
        /**
        *
        * Scrolls the cursor into the first visibile area of the editor
        **/
        VirtualRenderer.prototype.scrollCursorIntoView = function (cursor, offset, $viewMargin) {
            // the editor is not visible
            if (this.$size.scrollerHeight === 0)
                return;
            var pos = this.$cursorLayer.getPixelPosition(cursor);
            var left = pos.left;
            var top = pos.top;
            var topMargin = $viewMargin && $viewMargin.top || 0;
            var bottomMargin = $viewMargin && $viewMargin.bottom || 0;
            var scrollTop = this.$scrollAnimation ? this.session.getScrollTop() : this.scrollTop;
            if (scrollTop + topMargin > top) {
                if (offset)
                    top -= offset * this.$size.scrollerHeight;
                if (top === 0)
                    top = -this.scrollMargin.top;
                this.session.setScrollTop(top);
            }
            else if (scrollTop + this.$size.scrollerHeight - bottomMargin < top + this.lineHeight) {
                if (offset)
                    top += offset * this.$size.scrollerHeight;
                this.session.setScrollTop(top + this.lineHeight - this.$size.scrollerHeight);
            }
            var scrollLeft = this.scrollLeft;
            if (scrollLeft > left) {
                if (left < this.$padding + 2 * this.layerConfig.characterWidth)
                    left = -this.scrollMargin.left;
                this.session.setScrollLeft(left);
            }
            else if (scrollLeft + this.$size.scrollerWidth < left + this.characterWidth) {
                this.session.setScrollLeft(Math.round(left + this.characterWidth - this.$size.scrollerWidth));
            }
            else if (scrollLeft <= this.$padding && left - scrollLeft < this.characterWidth) {
                this.session.setScrollLeft(0);
            }
        };
        /**
        * {:EditSession.getScrollTop}
        * @related EditSession.getScrollTop
        * @returns {Number}
        **/
        VirtualRenderer.prototype.getScrollTop = function () {
            return this.session.getScrollTop();
        };
        /**
        * {:EditSession.getScrollLeft}
        * @related EditSession.getScrollLeft
        * @returns {Number}
        **/
        VirtualRenderer.prototype.getScrollLeft = function () {
            return this.session.getScrollLeft();
        };
        /**
        *
        * Returns the first visible row, regardless of whether it's fully visible or not.
        * @returns {Number}
        **/
        VirtualRenderer.prototype.getScrollTopRow = function () {
            return this.scrollTop / this.lineHeight;
        };
        /**
        *
        * Returns the last visible row, regardless of whether it's fully visible or not.
        * @returns {Number}
        **/
        VirtualRenderer.prototype.getScrollBottomRow = function () {
            return Math.max(0, Math.floor((this.scrollTop + this.$size.scrollerHeight) / this.lineHeight) - 1);
        };
        /**
        * Gracefully scrolls from the top of the editor to the row indicated.
        * @param {Number} row A row id
        *
        *
        * @related EditSession.setScrollTop
        **/
        VirtualRenderer.prototype.scrollToRow = function (row) {
            this.session.setScrollTop(row * this.lineHeight);
        };
        VirtualRenderer.prototype.alignCursor = function (cursor, alignment) {
            if (typeof cursor == "number")
                cursor = { row: cursor, column: 0 };
            var pos = this.$cursorLayer.getPixelPosition(cursor);
            var h = this.$size.scrollerHeight - this.lineHeight;
            var offset = pos.top - h * (alignment || 0);
            this.session.setScrollTop(offset);
            return offset;
        };
        VirtualRenderer.prototype.$calcSteps = function (fromValue, toValue) {
            var i = 0;
            var l = this.STEPS;
            var steps = [];
            var func = function (t, x_min, dx) {
                return dx * (Math.pow(t - 1, 3) + 1) + x_min;
            };
            for (i = 0; i < l; ++i) {
                steps.push(func(i / this.STEPS, fromValue, toValue - fromValue));
            }
            return steps;
        };
        /**
         * Gracefully scrolls the editor to the row indicated.
         * @param {Number} line A line number
         * @param {Boolean} center If `true`, centers the editor the to indicated line
         * @param {Boolean} animate If `true` animates scrolling
         * @param {Function} callback Function to be called after the animation has finished
         */
        VirtualRenderer.prototype.scrollToLine = function (line, center, animate, callback) {
            var pos = this.$cursorLayer.getPixelPosition({ row: line, column: 0 });
            var offset = pos.top;
            if (center) {
                offset -= this.$size.scrollerHeight / 2;
            }
            var initialScroll = this.scrollTop;
            this.session.setScrollTop(offset);
            if (animate !== false) {
                this.animateScrolling(initialScroll, callback);
            }
        };
        VirtualRenderer.prototype.animateScrolling = function (fromValue, callback) {
            var toValue = this.scrollTop;
            if (!this.$animatedScroll) {
                return;
            }
            var _self = this;
            if (fromValue == toValue)
                return;
            if (this.$scrollAnimation) {
                var oldSteps = this.$scrollAnimation.steps;
                if (oldSteps.length) {
                    fromValue = oldSteps[0];
                    if (fromValue == toValue)
                        return;
                }
            }
            var steps = _self.$calcSteps(fromValue, toValue);
            this.$scrollAnimation = { from: fromValue, to: toValue, steps: steps };
            clearInterval(this.$timer);
            _self.session.setScrollTop(steps.shift());
            // trick session to think it's already scrolled to not loose toValue
            _self.session.$scrollTop = toValue;
            this.$timer = setInterval(function () {
                if (steps.length) {
                    _self.session.setScrollTop(steps.shift());
                    _self.session.$scrollTop = toValue;
                }
                else if (toValue != null) {
                    _self.session.$scrollTop = -1;
                    _self.session.setScrollTop(toValue);
                    toValue = null;
                }
                else {
                    // do this on separate step to not get spurious scroll event from scrollbar
                    _self.$timer = clearInterval(_self.$timer);
                    _self.$scrollAnimation = null;
                    callback && callback();
                }
            }, 10);
        };
        /**
         * Scrolls the editor to the y pixel indicated.
         * @param {Number} scrollTop The position to scroll to
         */
        VirtualRenderer.prototype.scrollToY = function (scrollTop) {
            // after calling scrollBar.setScrollTop
            // scrollbar sends us event with same scrollTop. ignore it
            if (this.scrollTop !== scrollTop) {
                this.scrollTop = scrollTop;
                this.$loop.schedule(CHANGE_SCROLL);
            }
        };
        /**
         * Scrolls the editor across the x-axis to the pixel indicated.
         * @param {Number} scrollLeft The position to scroll to
         **/
        VirtualRenderer.prototype.scrollToX = function (scrollLeft) {
            if (this.scrollLeft !== scrollLeft) {
                this.scrollLeft = scrollLeft;
                this.$loop.schedule(CHANGE_H_SCROLL);
            }
        };
        /**
        * Scrolls the editor across both x- and y-axes.
        * @param {Number} x The x value to scroll to
        * @param {Number} y The y value to scroll to
        **/
        VirtualRenderer.prototype.scrollTo = function (x, y) {
            this.session.setScrollTop(y);
            this.session.setScrollLeft(y);
        };
        /**
        * Scrolls the editor across both x- and y-axes.
        * @param {Number} deltaX The x value to scroll by
        * @param {Number} deltaY The y value to scroll by
        **/
        VirtualRenderer.prototype.scrollBy = function (deltaX, deltaY) {
            deltaY && this.session.setScrollTop(this.session.getScrollTop() + deltaY);
            deltaX && this.session.setScrollLeft(this.session.getScrollLeft() + deltaX);
        };
        /**
        * Returns `true` if you can still scroll by either parameter; in other words, you haven't reached the end of the file or line.
        * @param {Number} deltaX The x value to scroll by
        * @param {Number} deltaY The y value to scroll by
        *
        *
        * @returns {Boolean}
        **/
        VirtualRenderer.prototype.isScrollableBy = function (deltaX, deltaY) {
            if (deltaY < 0 && this.session.getScrollTop() >= 1 - this.scrollMargin.top)
                return true;
            if (deltaY > 0 && this.session.getScrollTop() + this.$size.scrollerHeight
                - this.layerConfig.maxHeight < -1 + this.scrollMargin.bottom)
                return true;
            if (deltaX < 0 && this.session.getScrollLeft() >= 1 - this.scrollMargin.left)
                return true;
            if (deltaX > 0 && this.session.getScrollLeft() + this.$size.scrollerWidth
                - this.layerConfig.width < -1 + this.scrollMargin.right)
                return true;
        };
        VirtualRenderer.prototype.pixelToScreenCoordinates = function (x, y) {
            var canvasPos = this.scroller.getBoundingClientRect();
            var offset = (x + this.scrollLeft - canvasPos.left - this.$padding) / this.characterWidth;
            var row = Math.floor((y + this.scrollTop - canvasPos.top) / this.lineHeight);
            var col = Math.round(offset);
            return { row: row, column: col, side: offset - col > 0 ? 1 : -1 };
        };
        VirtualRenderer.prototype.screenToTextCoordinates = function (clientX, clientY) {
            var canvasPos = this.scroller.getBoundingClientRect();
            var column = Math.round((clientX + this.scrollLeft - canvasPos.left - this.$padding) / this.characterWidth);
            var row = (clientY + this.scrollTop - canvasPos.top) / this.lineHeight;
            return this.session.screenToDocumentPosition(row, Math.max(column, 0));
        };
        /**
        * Returns an object containing the `pageX` and `pageY` coordinates of the document position.
        * @param {Number} row The document row position
        * @param {Number} column The document column position
        * @returns {Object}
        **/
        VirtualRenderer.prototype.textToScreenCoordinates = function (row, column) {
            var canvasPos = this.scroller.getBoundingClientRect();
            var pos = this.session.documentToScreenPosition(row, column);
            var x = this.$padding + Math.round(pos.column * this.characterWidth);
            var y = pos.row * this.lineHeight;
            return {
                pageX: canvasPos.left + x - this.scrollLeft,
                pageY: canvasPos.top + y - this.scrollTop
            };
        };
        /**
        *
        * Focuses the current container.
        **/
        VirtualRenderer.prototype.visualizeFocus = function () {
            dom_1.addCssClass(this.container, "ace_focus");
        };
        /**
        *
        * Blurs the current container.
        **/
        VirtualRenderer.prototype.visualizeBlur = function () {
            dom_1.removeCssClass(this.container, "ace_focus");
        };
        /**
         * @method showComposition
         * @param position
         * @private
         */
        VirtualRenderer.prototype.showComposition = function (position) {
            if (!this.$composition)
                this.$composition = {
                    keepTextAreaAtCursor: this.$keepTextAreaAtCursor,
                    cssText: this.textarea.style.cssText
                };
            this.$keepTextAreaAtCursor = true;
            dom_1.addCssClass(this.textarea, "ace_composition");
            this.textarea.style.cssText = "";
            this.$moveTextAreaToCursor();
        };
        /**
         * @param {String} text A string of text to use
         *
         * Sets the inner text of the current composition to `text`.
         */
        VirtualRenderer.prototype.setCompositionText = function (text) {
            // TODO: Why is the parameter not used?
            this.$moveTextAreaToCursor();
        };
        /**
         * Hides the current composition.
         */
        VirtualRenderer.prototype.hideComposition = function () {
            if (!this.$composition) {
                return;
            }
            dom_1.removeCssClass(this.textarea, "ace_composition");
            this.$keepTextAreaAtCursor = this.$composition.keepTextAreaAtCursor;
            this.textarea.style.cssText = this.$composition.cssText;
            this.$composition = null;
        };
        /**
         * Sets a new theme for the editor.
         * `theme` should exist, and be a directory path, like `ace/theme/textmate`.
         * @param {String} theme The path to a theme
         * @param {Function} cb optional callback
         */
        VirtualRenderer.prototype.setTheme = function (theme, cb) {
            console.log("VirtualRenderer setTheme, theme = " + theme);
            var _self = this;
            this.$themeId = theme;
            _self._dispatchEvent('themeChange', { theme: theme });
            if (!theme || typeof theme === "string") {
                var moduleName = theme || this.getOption("theme").initialValue;
                console.log("moduleName => " + moduleName);
                // Loading a theme will insert a script that, upon execution, will
                // insert a style tag.
                config_1.loadModule(["theme", moduleName], afterLoad, this.container.ownerDocument);
            }
            else {
                afterLoad(theme);
            }
            function afterLoad(modJs) {
                if (_self.$themeId !== theme) {
                    return cb && cb();
                }
                if (!modJs.cssClass) {
                    return;
                }
                dom_1.importCssString(modJs.cssText, modJs.cssClass, _self.container.ownerDocument);
                if (_self.theme) {
                    dom_1.removeCssClass(_self.container, _self.theme.cssClass);
                }
                var padding = "padding" in modJs ? modJs.padding : "padding" in (_self.theme || {}) ? 4 : _self.$padding;
                if (_self.$padding && padding != _self.$padding) {
                    _self.setPadding(padding);
                }
                _self.theme = modJs;
                dom_1.addCssClass(_self.container, modJs.cssClass);
                dom_1.setCssClass(_self.container, "ace_dark", modJs.isDark);
                // force re-measure of the gutter width
                if (_self.$size) {
                    _self.$size.width = 0;
                    _self.$updateSizeAsync();
                }
                _self._dispatchEvent('themeLoaded', { theme: modJs });
                cb && cb();
            }
        };
        /**
         * Returns the path of the current theme.
         * @returns {String}
         */
        VirtualRenderer.prototype.getTheme = function () {
            return this.$themeId;
        };
        // Methods allows to add / remove CSS classnames to the editor element.
        // This feature can be used by plug-ins to provide a visual indication of
        // a certain mode that editor is in.
        /**
         * [Adds a new class, `style`, to the editor.]{: #VirtualRenderer.setStyle}
         * @param {String} style A class name
         *
         */
        VirtualRenderer.prototype.setStyle = function (style, include) {
            dom_1.setCssClass(this.container, style, include !== false);
        };
        /**
         * [Removes the class `style` from the editor.]{: #VirtualRenderer.unsetStyle}
         * @param {String} style A class name
         */
        VirtualRenderer.prototype.unsetStyle = function (style) {
            dom_1.removeCssClass(this.container, style);
        };
        VirtualRenderer.prototype.setCursorStyle = function (style) {
            if (this.content.style.cursor != style) {
                this.content.style.cursor = style;
            }
        };
        /**
         * @param {String} cursorStyle A css cursor style
         */
        VirtualRenderer.prototype.setMouseCursor = function (cursorStyle) {
            this.content.style.cursor = cursorStyle;
        };
        /**
         * Destroys the text and cursor layers for this renderer.
         */
        VirtualRenderer.prototype.destroy = function () {
            this.$textLayer.destroy();
            this.$cursorLayer.destroy();
        };
        return VirtualRenderer;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = VirtualRenderer;
    config_1.defineOptions(VirtualRenderer.prototype, "renderer", {
        animatedScroll: { initialValue: false },
        showInvisibles: {
            set: function (value) {
                if (this.$textLayer.setShowInvisibles(value))
                    this.$loop.schedule(this.CHANGE_TEXT);
            },
            initialValue: false
        },
        showPrintMargin: {
            set: function () { this.$updatePrintMargin(); },
            initialValue: true
        },
        printMarginColumn: {
            set: function () { this.$updatePrintMargin(); },
            initialValue: 80
        },
        printMargin: {
            set: function (val) {
                if (typeof val == "number")
                    this.$printMarginColumn = val;
                this.$showPrintMargin = !!val;
                this.$updatePrintMargin();
            },
            get: function () {
                return this.$showPrintMargin && this.$printMarginColumn;
            }
        },
        showGutter: {
            set: function (show) {
                this.$gutter.style.display = show ? "block" : "none";
                this.$loop.schedule(this.CHANGE_FULL);
                this.onGutterResize();
            },
            initialValue: true
        },
        fadeFoldWidgets: {
            set: function (show) {
                dom_1.setCssClass(this.$gutter, "ace_fade-fold-widgets", show);
            },
            initialValue: false
        },
        showFoldWidgets: {
            set: function (show) { this.$gutterLayer.setShowFoldWidgets(show); },
            initialValue: true
        },
        showLineNumbers: {
            set: function (show) {
                this.$gutterLayer.setShowLineNumbers(show);
                this.$loop.schedule(this.CHANGE_GUTTER);
            },
            initialValue: true
        },
        displayIndentGuides: {
            set: function (show) {
                if (this.$textLayer.setDisplayIndentGuides(show))
                    this.$loop.schedule(this.CHANGE_TEXT);
            },
            initialValue: true
        },
        highlightGutterLine: {
            set: function (shouldHighlight) {
                if (!this.$gutterLineHighlight) {
                    this.$gutterLineHighlight = dom_1.createElement("div");
                    this.$gutterLineHighlight.className = "ace_gutter-active-line";
                    this.$gutter.appendChild(this.$gutterLineHighlight);
                    return;
                }
                this.$gutterLineHighlight.style.display = shouldHighlight ? "" : "none";
                // if cursorlayer have never been updated there's nothing on screen to update
                if (this.$cursorLayer.$pixelPos)
                    this.$updateGutterLineHighlight();
            },
            initialValue: false,
            value: true
        },
        hScrollBarAlwaysVisible: {
            set: function (val) {
                if (!this.$hScrollBarAlwaysVisible || !this.$horizScroll)
                    this.$loop.schedule(this.CHANGE_SCROLL);
            },
            initialValue: false
        },
        vScrollBarAlwaysVisible: {
            set: function (val) {
                if (!this.$vScrollBarAlwaysVisible || !this.$vScroll)
                    this.$loop.schedule(this.CHANGE_SCROLL);
            },
            initialValue: false
        },
        fontSize: {
            set: function (fontSize) {
                var that = this;
                that.container.style.fontSize = fontSize;
                that.updateFontSize();
            },
            initialValue: "12px"
        },
        fontFamily: {
            set: function (fontFamily) {
                var that = this;
                that.container.style.fontFamily = fontFamily;
                that.updateFontSize();
            }
        },
        maxLines: {
            set: function (val) {
                this.updateFull();
            }
        },
        minLines: {
            set: function (val) {
                this.updateFull();
            }
        },
        scrollPastEnd: {
            set: function (val) {
                val = +val || 0;
                if (this.$scrollPastEnd == val)
                    return;
                this.$scrollPastEnd = val;
                this.$loop.schedule(this.CHANGE_SCROLL);
            },
            initialValue: 0,
            handlesSet: true
        },
        fixedWidthGutter: {
            set: function (val) {
                this.$gutterLayer.$fixedWidth = !!val;
                this.$loop.schedule(this.CHANGE_GUTTER);
            }
        },
        theme: {
            set: function (val) { this.setTheme(val); },
            get: function () { return this.$themeId || this.theme; },
            initialValue: "./theme/textmate",
            handlesSet: true
        }
    });
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
define('deuce',["require", "exports", "./lib/dom", "./lib/event", "./Editor", "./EditSession", "./UndoManager", "./VirtualRenderer"], function (require, exports, dom_1, event_1, Editor_1, EditSession_1, UndoManager_1, VirtualRenderer_1) {
    //import {} from './config';
    // The following require()s are for inclusion in the built ace file
    //require("./worker/worker_client");
    //require("./keyboard/hash_handler");
    //require("./placeholder");
    //require("./multi_select");
    //require("./mode/folding/fold_mode");
    //require("./theme/textmate");
    //require("./ext/error_marker");
    // export var config = cfg;
    /**
     * Provides access to require in packed noconflict mode
     * @param {String} moduleName
     * @returns {Object}
     **/
    // FIXME: Trying to export this in the ACE namespace is problematic in TypeScript.
    // export var require = require;
    /**
     * Embeds the Ace editor into the DOM, at the element provided by `el`.
     * @param {String | DOMElement} el Either the id of an element, or the element itself
     */
    function edit(source) {
        var element;
        if (typeof source === 'string') {
            var id = source;
            element = document.getElementById(id);
            if (!element) {
                throw new Error("edit can't find div #" + id);
            }
        }
        else {
            element = source;
        }
        if (element && element['env'] && element['env'].editor instanceof Editor_1.default) {
            return element['env'].editor;
        }
        var value = "";
        if (element && /input|textarea/i.test(element.tagName)) {
            var oldNode = element;
            value = oldNode.value;
            element = document.createElement("pre");
            oldNode.parentNode.replaceChild(element, oldNode);
        }
        else {
            value = dom_1.getInnerText(element);
            element.innerHTML = '';
        }
        var editSession = createEditSession(value);
        var editor = new Editor_1.default(new VirtualRenderer_1.default(element), editSession);
        editor.setSession(editSession);
        // FIXME: The first property is incorrectly named.
        var env = {
            document: editSession,
            editor: editor,
            onResize: editor.resize.bind(editor, null)
        };
        if (oldNode)
            env['textarea'] = oldNode;
        event_1.addListener(window, "resize", env.onResize);
        editor.on("destroy", function () {
            event_1.removeListener(window, "resize", env.onResize);
            env.editor.container['env'] = null; // prevent memory leak on old ie
        });
        editor.container['env'] = editor['env'] = env;
        return editor;
    }
    exports.edit = edit;
    ;
    /**
     * Creates a new [[EditSession]], and returns the associated [[Document]].
     * @param {Document | String} text {:textParam}
     * @param {TextMode} mode {:modeParam}
     *
     **/
    function createEditSession(text, mode) {
        var doc = new EditSession_1.default(text, mode);
        doc.setUndoManager(new UndoManager_1.default());
        return doc;
    }
    exports.createEditSession = createEditSession;
    ;
});

  var library = require('davinci-eight');
  if(typeof module !== 'undefined' && module.exports) {
    module.exports = library;
  } else if(globalDefine) {
    (function (define) {
      define(function () { return library; });
    }(globalDefine));
  } else {
    global['DEUCE'] = library;
  }
}(this));
