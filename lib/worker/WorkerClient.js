"use strict";
import { qualifyURL } from '../lib/net';
import EventEmitterClass from '../lib/event_emitter';
export default class WorkerClient extends EventEmitterClass {
    constructor(workerUrl) {
        super();
        this.callbacks = {};
        this.callbackId = 1;
        this.$sendDeltaQueue = this.$sendDeltaQueue.bind(this);
        this.changeListener = this.changeListener.bind(this);
        this.onMessage = this.onMessage.bind(this);
        var workerUrl = qualifyURL(workerUrl);
        try {
            this.$worker = new Worker(workerUrl);
        }
        catch (e) {
            if (e instanceof window['DOMException']) {
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
        this.$worker.onmessage = this.onMessage;
    }
    init(moduleName) {
        var tlns = {};
        this.$worker.postMessage({ init: true, tlns: tlns, module: moduleName });
    }
    onMessage(event) {
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
    }
    $normalizePath(path) {
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
    call(cmd, args, callback) {
        if (callback) {
            var id = this.callbackId++;
            this.callbacks[id] = callback;
            args.push(id);
        }
        this.send(cmd, args);
    }
    emit(event, data) {
        try {
            this.$worker.postMessage({ event: event, data: { data: data.data } });
        }
        catch (e) {
            console.error(e.stack);
        }
    }
    attachToDocument(doc) {
        if (this.$doc) {
            this.terminate();
        }
        this.$doc = doc;
        this.call("setValue", [doc.getValue()]);
        doc.on('change', this.changeListener);
    }
    detachFromDocument() {
        if (this.$doc) {
            this.$doc.off('change', this.changeListener);
            this.$doc = null;
        }
        else {
            console.warn(`WorkerClient.detachFromDocument called with this.$doc => ${this.$doc}`);
        }
    }
    changeListener(e, doc) {
        if (!this.deltaQueue) {
            this.deltaQueue = [e.data];
            setTimeout(this.$sendDeltaQueue, 0);
        }
        else {
            this.deltaQueue.push(e.data);
        }
    }
    $sendDeltaQueue() {
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
    }
    $workerBlob(workerUrl) {
        var script = "importScripts('" + qualifyURL(workerUrl) + "');";
        try {
            return new Blob([script], { "type": "application/javascript" });
        }
        catch (e) {
            var BlobBuilder = window['BlobBuilder'] || window['WebKitBlobBuilder'] || window['MozBlobBuilder'];
            var blobBuilder = new BlobBuilder();
            blobBuilder.append(script);
            return blobBuilder.getBlob("application/javascript");
        }
    }
}
