"no use strict";
;
(function (window) {
    if (typeof window.window !== 'undefined' && window.document) {
        return;
    }
    window.console = function () {
        var msgs = Array.prototype.slice.call(arguments, 0);
        window.postMessage({ type: "log", data: msgs });
    };
    window.console.error =
        window.console.warn =
            window.console.log =
                window.console.trace = window.console;
    importScripts('/jspm_packages/system.js', '/config.js');
    window.window = window;
    window.onerror = function (message, file, line, col, err) {
        console.error("Worker " + (err ? err.stack : message));
    };
    window.normalizeModule = function (parentId, moduleName) {
        if (moduleName.indexOf("!") !== -1) {
            var chunks = moduleName.split("!");
            return window.normalizeModule(parentId, chunks[0]) + "!" + window.normalizeModule(parentId, chunks[1]);
        }
        if (moduleName.charAt(0) == ".") {
            var base = parentId ? parentId.split("/").slice(0, -1).join("/") : void 0;
            moduleName = (base ? base + "/" : "") + moduleName;
            while (moduleName.indexOf(".") !== -1 && previous != moduleName) {
                var previous = moduleName;
                moduleName = moduleName.replace(/^\.\//, "").replace(/\/\.\//, "/").replace(/[^\/]+\/\.\.\//, "");
            }
        }
        return moduleName;
    };
    function initDelegate(name) {
        System.import('ace')
            .then(function (ace) {
            sender = new ace.Sender(window);
            System.import('ace')
                .then(function (m) {
                main = window.main = new m.default(sender);
            })
                .catch(function (error) {
                console.error(error);
            });
        })
            .catch(function (error) {
            console.error(error);
        });
    }
    ;
    var main = window.main = null;
    var sender = null;
    window.onmessage = function (event) {
        var data = event.data;
        var msg = data;
        var origin = event.origin;
        var source = event.source;
        if (msg.command) {
            if (main) {
                if (main[msg.command]) {
                    main[msg.command].apply(main, msg.args);
                }
                else {
                    throw new Error("Unknown command:" + msg.command + "(" + JSON.stringify(msg.args) + ")");
                }
            }
            else {
                console.warn("Not initialized. Unable to process command " + msg.command + "(" + JSON.stringify(msg.args) + ")");
            }
        }
        else if (msg.init) {
            initDelegate(msg.module);
        }
        else if (msg.event && sender) {
            sender._signal(msg.event, msg.data);
        }
        else {
            console.warn('worker-system.onMessage() DROPPED ' + JSON.stringify(msg));
        }
    };
})(this);
