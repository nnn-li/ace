import { copyObject } from "./lib/lang";
import { implement } from "./lib/oop";
import { loadScript } from "./lib/net";
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
export function get(key) {
    if (!options.hasOwnProperty(key)) {
        throw new Error("Unknown config key: " + key);
    }
    return options[key];
}
export function set(key, value) {
    if (!options.hasOwnProperty(key)) {
        throw new Error("Unknown config key: " + key);
    }
    options[key] = value;
}
export function all() {
    return copyObject(options);
}
export function moduleUrl(moduleName, component) {
    if (options.$moduleUrls[moduleName]) {
        return options.$moduleUrls[moduleName];
    }
    var parts = moduleName.split("/");
    component = component || parts[parts.length - 2] || "";
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
export function setModuleUrl(name, subst) {
    return options.$moduleUrls[name] = subst;
}
export var $loading = {};
export function loadModule(what, onLoad, doc = document) {
    var module;
    var moduleName;
    var moduleType;
    if (Array.isArray(what)) {
        moduleType = what[0];
        moduleName = what[1];
    }
    else {
        moduleName = what;
    }
    try {
    }
    catch (e) { }
    if (module && !$loading[moduleName])
        return onLoad && onLoad(module);
    if (!$loading[moduleName]) {
        $loading[moduleName] = [];
    }
    $loading[moduleName].push(onLoad);
    if ($loading[moduleName].length > 1)
        return;
    var afterLoad = function () {
    };
    if (!get("packaged")) {
        return afterLoad();
    }
    loadScript(moduleUrl(moduleName, moduleType), afterLoad, doc);
}
export function init(packaged) {
    options.packaged = packaged || module.packaged;
    if (!global.document)
        return "";
    var scriptOptions = {};
    var scriptUrl = "";
    var currentScript = (document['currentScript'] || document['_currentScript']);
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
;
function deHyphenate(str) {
    return str.replace(/-(.)/g, function (m, m1) { return m1.toUpperCase(); });
}
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
export function defineOptions(obj, path, options) {
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
    implement(obj, optionsProvider);
    return this;
}
export function resetOptions(obj) {
    Object.keys(obj.$options).forEach(function (key) {
        var opt = obj.$options[key];
        if ("value" in opt) {
            obj.setOption(key, opt.value);
        }
    });
}
export function setDefaultValue(path, name, value) {
    var opts = defaultOptions[path] || (defaultOptions[path] = {});
    if (opts[name]) {
        if (opts.forwardTo)
            setDefaultValue(opts.forwardTo, name, value);
        else
            opts[name].value = value;
    }
}
export function setDefaultValues(path, optionHash) {
    Object.keys(optionHash).forEach(function (key) {
        setDefaultValue(path, key, optionHash[key]);
    });
}
