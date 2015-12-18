/// <reference path="../../typings/systemjs.d.ts" />
/**
 * Remember! This is a Web Worker. SystemJS has not been loaded yet.
 */
"no use strict";
;
(function(window/*: WorkerGlobalScope*/) {
    if (typeof window.window !== 'undefined' && window.document) {
        return;
    }

    window.console = function() {
        var msgs = Array.prototype.slice.call(arguments, 0);
        window.postMessage({ type: "log", data: msgs });  // FIXME: targetOrigin
    };
    window.console.error =
        window.console.warn =
        window.console.log =
        window.console.trace = window.console;

    // importScripts is synchronous and scripts are loaded in argument order.
    // importScripts('jspm_packages/system.js', 'config.js');
    importScripts('/jspm_packages/system.js', '/config.js');
    // importScripts('../../jspm_packages/system.js', '../../config.js');

    window.window = window;

    // Called when a runtime error occurs in a worker.
    window.onerror = function(message, file, line, col, err) {
        console.error("Worker " + (err ? err.stack : message));
    };

    // FIXME: We have an issue with relative dependencies; the parentId is null.
    window.normalizeModule = function(parentId: string, moduleName: string): string {
        // normalize plugin dependencies.
        if (moduleName.indexOf("!") !== -1) {
            var chunks = moduleName.split("!");
            return window.normalizeModule(parentId, chunks[0]) + "!" + window.normalizeModule(parentId, chunks[1]);
        }
        // normalize relative dependencies.
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

    function initDelegate(name: string): void {
        // FIXME: Pass in the first part...
        System.import('ace')
            .then(function(ace: any) {
                sender = new ace.Sender(window)
                // This could be somewhere else.
                System.import('ace')
                    .then(function(m: any/*Module*/) {
                        // We also need th class name!
                        main = window.main = new m.default(sender)
                    })
                    .catch(function(error) {
                        console.error(error);
                    });
            })
            .catch(function(error) {
                console.error(error);
            });
    };

    /**
     * main is the instance that we are creating?
     */
    var main = window.main = null;
    /**
     * sender allows us to communicate back to the WorkerClient?
     */
    var sender = null;

    window.onmessage = function(event: MessageEvent) {
        // The type here is probably a union of all possible message types!
        var data = event.data;  // The object passed from the other window.
        var msg: { args; command?; data; event; init?: boolean; module: string; tlns: { [ns: string]: string } } = data;
        var origin: string = event.origin;  // The origin of the window that sent the message.
        // We can do some security checks by checking the origin and source here.
        // Failure to do so enables cross-site scripting attacks.
        // See Mozilla Window.postMessage() article.
        var source: Window = event.source; // A reference to the window object that sent the message.
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
                // Initialization must have failed.
                console.warn("Not initialized. Unable to process command " + msg.command + "(" + JSON.stringify(msg.args) + ")");
            }
        }
        else if (msg.init) {
            initDelegate(msg.module);
        }
        else if (msg.event && sender) {
            // Expect "change" events as the user edits the document.
            sender._signal(msg.event, msg.data);
        }
        else {
            console.warn('worker-system.onMessage() DROPPED ' + JSON.stringify(msg));
        }
    };
})(this);