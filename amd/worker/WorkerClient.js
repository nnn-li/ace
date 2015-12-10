var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", '../lib/net', '../lib/event_emitter'], function (require, exports, net_1, event_emitter_1) {
    /**
     * WorkerClient manages the communication with a Web Worker.
     */
    var WorkerClient = (function (_super) {
        __extends(WorkerClient, _super);
        function WorkerClient(workerUrl) {
            _super.call(this);
            this.callbacks = {};
            this.callbackId = 1;
            this.$sendDeltaQueue = this.$sendDeltaQueue.bind(this);
            this.changeListener = this.changeListener.bind(this);
            this.onMessage = this.onMessage.bind(this);
            var workerUrl = net_1.qualifyURL(workerUrl);
            try {
                this.$worker = new Worker(workerUrl);
            }
            catch (e) {
                if (e instanceof window['DOMException']) {
                    // Likely same origin problem. Use importScripts from a shim Worker.
                    var blob = this.$workerBlob(workerUrl);
                    var URL = window['URL'] || window['webkitURL'];
                    var blobURL = URL.createObjectURL(blob);
                    this.$worker = new Worker(blobURL);
                    URL.revokeObjectURL(blobURL);
                }
                else {
                    throw e;
                }
            }
            // Add an EventListener for data the worker returns.
            this.$worker.onmessage = this.onMessage;
        }
        WorkerClient.prototype.init = function (moduleName, className) {
            var tlns = {};
            // Sending a postMessage starts the worker.
            this.$worker.postMessage({ init: true, tlns: tlns, module: moduleName, classname: className });
        };
        WorkerClient.prototype.onMessage = function (event) {
            var origin = event.origin;
            var source = event.source;
            var msg = event.data;
            switch (msg.type) {
                case "log":
                    window.console && console.log && console.log.apply(console, msg.data);
                    break;
                case "event":
                    this._signal(msg.name, { data: msg.data });
                    break;
                case "call":
                    var callback = this.callbacks[msg.id];
                    if (callback) {
                        callback(msg.data);
                        delete this.callbacks[msg.id];
                    }
                    break;
            }
        };
        WorkerClient.prototype.$normalizePath = function (path) {
            return net_1.qualifyURL(path);
        };
        WorkerClient.prototype.terminate = function () {
            this._signal("terminate", {});
            this.deltaQueue = null;
            this.$worker.terminate();
            this.$worker = null;
            this.detachFromDocument();
        };
        WorkerClient.prototype.send = function (cmd, args) {
            this.$worker.postMessage({ command: cmd, args: args });
        };
        WorkerClient.prototype.call = function (cmd, args, callback) {
            if (callback) {
                var id = this.callbackId++;
                this.callbacks[id] = callback;
                args.push(id);
            }
            this.send(cmd, args);
        };
        WorkerClient.prototype.emit = function (event, data) {
            try {
                // firefox refuses to clone objects which have function properties
                // TODO: cleanup event
                this.$worker.postMessage({ event: event, data: { data: data.data } });
            }
            catch (e) {
                console.error(e.stack);
            }
        };
        WorkerClient.prototype.attachToDocument = function (doc) {
            if (this.$doc) {
                this.terminate();
            }
            this.$doc = doc;
            this.call("setValue", [doc.getValue()]);
            doc.on('change', this.changeListener);
        };
        WorkerClient.prototype.detachFromDocument = function () {
            this.$doc.off('change', this.changeListener);
            this.$doc = null;
        };
        /**
         * This function is used as the basis for a function where this is bound safely.
         * It handles changes to the document by placing the messages in a queue
         */
        WorkerClient.prototype.changeListener = function (e, doc) {
            if (!this.deltaQueue) {
                this.deltaQueue = [e.data];
                setTimeout(this.$sendDeltaQueue, 0);
            }
            else {
                this.deltaQueue.push(e.data);
            }
        };
        WorkerClient.prototype.$sendDeltaQueue = function () {
            var doc = this.$doc;
            var q = this.deltaQueue;
            if (!q)
                return;
            this.deltaQueue = null;
            if (q.length > 20 && q.length > doc.getLength() >> 1) {
                this.call("setValue", [doc.getValue()]);
            }
            else
                this.emit("change", { data: q });
        };
        WorkerClient.prototype.$workerBlob = function (workerUrl) {
            // workerUrl can be protocol relative
            // importScripts only takes fully qualified urls
            var script = "importScripts('" + net_1.qualifyURL(workerUrl) + "');";
            try {
                return new Blob([script], { "type": "application/javascript" });
            }
            catch (e) {
                var BlobBuilder = window['BlobBuilder'] || window['WebKitBlobBuilder'] || window['MozBlobBuilder'];
                var blobBuilder = new BlobBuilder();
                blobBuilder.append(script);
                return blobBuilder.getBlob("application/javascript");
            }
        };
        return WorkerClient;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = WorkerClient;
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
