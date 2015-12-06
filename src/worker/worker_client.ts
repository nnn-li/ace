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
import {} from '../lib/oop';
import {qualifyURL} from '../lib/net';
import {Document} from "../document";
import {EventEmitterClass} from '../lib/event_emitter';
import {get, moduleUrl} from "../config";

/**
 * WorkerClient manages the communication with a Web Worker.
 */
export class WorkerClient extends EventEmitterClass {
    private $worker
    private deltaQueue;
    private callbacks = {};
    private callbackId: number = 1;
    private $doc: Document;
    constructor(topLevelNamespaces: string[], mod: string, classname: string, workerUrl?: string) {
        super();
        this.$sendDeltaQueue = this.$sendDeltaQueue.bind(this);
        this.changeListener = this.changeListener.bind(this);
        this.onMessage = this.onMessage.bind(this);

        // FIXME: We need to populate this
        /**
         *
         */
        var tlns: { [ns: string]: string } = {};

        // nameToUrl is renamed to toUrl in requirejs 2
        // FIXME: Get this working again without AMD.
        /*
        if (require['nameToUrl'] && !require.toUrl) {
            require.toUrl = require['nameToUrl'];
        }

        if (get("packaged") || !require.toUrl) {
            workerUrl = workerUrl || moduleUrl(mod, "worker");
        }
        else {
            var normalizePath = this.$normalizePath;
            // This path is intentionally not relative.
            workerUrl = workerUrl || normalizePath(require.toUrl("ace/worker/worker.js"));

            var tlns = {};
            topLevelNamespaces.forEach(function(ns) {
                tlns[ns] = normalizePath(require.toUrl(ns).replace(/(\.js)?(\?.*)?$/, ""));
            });
        }
        */

        try {
            this.$worker = new Worker(workerUrl);
        }
        catch (e) {
            if (e instanceof window['DOMException']) {
                // Likely same origin problem. Use importScripts from a shim Worker
                var blob: Blob = this.$workerBlob(workerUrl);
                var URL: URL = window['URL'] || window['webkitURL'];
                var blobURL: string = URL.createObjectURL(blob);

                this.$worker = new Worker(blobURL);
                URL.revokeObjectURL(blobURL);
            } else {
                throw e;
            }
        }
        // Sending a postMessage starts the worker.
        this.$worker.postMessage({
            init: true,
            tlns: tlns,
            module: mod,
            classname: classname
        });

        this.$worker.onmessage = this.onMessage;
    }
    onMessage(e) {
        var msg = e.data;
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
    }

    private $normalizePath(path: string): string {
        return qualifyURL(path);
    }

    terminate() {
        this._signal("terminate", {});
        this.deltaQueue = null;
        this.$worker.terminate();
        this.$worker = null;
        this.detachFromDocument();
    }

    send(cmd, args) {
        this.$worker.postMessage({ command: cmd, args: args });
    }

    call(cmd, args, callback?) {
        if (callback) {
            var id = this.callbackId++;
            this.callbacks[id] = callback;
            args.push(id);
        }
        this.send(cmd, args);
    }

    emit(event: string, data) {
        try {
            // firefox refuses to clone objects which have function properties
            // TODO: cleanup event
            this.$worker.postMessage({ event: event, data: { data: data.data } });
        }
        catch (ex) {
            console.error(ex.stack);
        }
    }

    attachToDocument(doc: Document) {
        if (this.$doc) {
            this.terminate();
        }
        this.$doc = doc;
        this.call("setValue", [doc.getValue()]);
        doc.addEventListener('change', this.changeListener);
    }

    detachFromDocument() {
        this.$doc.removeEventListener('change', this.changeListener);
        this.$doc = null;
    }

    /**
     * This function is used as the basis for a function where this is bound safely.
     * It handles changes to the document by placing the messages in a queue
     */
    private changeListener(e: { data }) {
        if (!this.deltaQueue) {
            this.deltaQueue = [e.data];
            setTimeout(this.$sendDeltaQueue, 0);
        } else {
            this.deltaQueue.push(e.data);
        }
    }

    private $sendDeltaQueue() {
        var doc = this.$doc;
        var q = this.deltaQueue;
        if (!q) return;
        this.deltaQueue = null;
        if (q.length > 20 && q.length > doc.getLength() >> 1) {
            this.call("setValue", [doc.getValue()]);
        } else
            this.emit("change", { data: q });
    }

    $workerBlob(workerUrl: string): Blob {
        // workerUrl can be protocol relative
        // importScripts only takes fully qualified urls
        var script = "importScripts('" + qualifyURL(workerUrl) + "');";
        try {
            return new Blob([script], { "type": "application/javascript" });
        }
        catch (e) { // Backwards-compatibility
            var BlobBuilder = window['BlobBuilder'] || window['WebKitBlobBuilder'] || window['MozBlobBuilder'];
            var blobBuilder = new BlobBuilder();
            blobBuilder.append(script);
            return blobBuilder.getBlob("application/javascript");
        }
    }
}

