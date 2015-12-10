define(["require", "exports", "./lib/lang", "./lib/oop", "./lib/net", './lib/event_emitter'], function (require, exports, lang_1, oop_1, net_1, event_emitter_1) {
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
