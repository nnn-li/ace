import WorkerClient from '../worker/WorkerClient';
import {EVENT_NAME_COMPLETIONS} from './workspace_protocol';
import Workspace from './Workspace'

/**
 * @return a workspace instance.
 * 
 * This is a functional constructor; do not use the 'new' operator to call it.
 *                                   do not use 'this' in the code below.
 */
export default function createWorkspace(): Promise<Workspace> {

    // console.log("createWorkspace()");

    var workerProxy = new WorkerClient('lib/worker/worker-systemjs.js');

    var callbacks = {};
    var callbackId = 1;

    workerProxy.on("fileNames", function(response: { data: { names: string[]; callbackId: number } }) {
        var data = response.data;
        var names: string[] = data.names;
        var id: number = data.callbackId;
        var callback: (err, results) => void = callbacks[id];
        delete callbacks[id];
        callback(null, names);
    });

    workerProxy.on("syntaxErrors", function(response: { data: { errors: any[]; callbackId: number } }) {
        var data = response.data;
        var errors = data.errors;
        var id: number = data.callbackId;
        var callback: (err, results) => void = callbacks[id];
        delete callbacks[id];
        callback(null, errors);
    });

    workerProxy.on("semanticErrors", function(response: { data: { errors: any[]; callbackId: number } }) {
        var data = response.data;
        var errors = data.errors;
        var id: number = data.callbackId;
        var callback: (err, results) => void = callbacks[id];
        delete callbacks[id];
        callback(null, errors);
    });

    workerProxy.on(EVENT_NAME_COMPLETIONS, function(response: { data: { err: any; completions: any[]; callbackId: number } }) {
        // TODO: Standardize and introduce assertions and logging.
        var data = response.data;
        var id: number = data.callbackId;
        var callback: (err, results?) => void = callbacks[id];
        delete callbacks[id];
        if ('err' in data) {

            callback(data.err);
        }
        else {
            callback(null, data.completions);
        }
    });

    workerProxy.on("typeAtDocumentPosition", function(response: { data: { err: string; results: { description: string; docComment: string }; callbackId: number } }) {
        doCallback(response.data);
    });

    workerProxy.on("outputFiles", function(response: { data: { err: string; results: any; callbackId: number } }) {
        doCallback(response.data);
    });

    function doCallback(data: { err: string; results: any; callbackId: number }) {
        var info = data.results;
        var id: number = data.callbackId;
        var callback: (err, results?) => void = callbacks[id];
        delete callbacks[id];
        if (data.err) {
            callback(data.err);
        }
        else {
            callback(null, data.results);
        }
    }

    function ensureScript(fileName: string, content: string) {
        var message =
            {
                data: { 'fileName': fileName, 'content': content.replace(/\r\n?/g, '\n') }
            };
        workerProxy.emit("ensureScript", message);
    }

    function editScript(fileName: string, start: number, end: number, text: string) {
        console.log(`Workspace.editScript(${fileName})`);
        var message =
            {
                data: { fileName: fileName, start: start, end: end, text: text }
            };
        workerProxy.emit("editScript", message);
    }

    function removeScript(fileName: string): void {
        workerProxy.emit("removeScript", { data: { 'fileName': fileName } });
    }

    function getFileNames(callback): void {
        var id = callbackId++;
        callbacks[id] = callback;
        var message = { data: { callbackId: id } };
        workerProxy.emit("getFileNames", message);
    }

    function getSyntaxErrors(fileName: string, callback: (err, results) => void): void {
        var id = callbackId++;
        callbacks[id] = callback;
        var message = { data: { fileName: fileName, callbackId: id } };
        workerProxy.emit("getSyntaxErrors", message);
    }

    function getSemanticErrors(fileName: string, callback: (err, results) => void): void {
        var id = callbackId++;
        callbacks[id] = callback;
        var message = { data: { fileName: fileName, callbackId: id } };
        workerProxy.emit("getSemanticErrors", message);
    }

    function getCompletionsAtPosition(fileName: string, position: number, memberMode: boolean, callback: (err, results) => void): void {
        var id = callbackId++;
        callbacks[id] = callback;
        var message = { data: { fileName: fileName, position: position, memberMode: memberMode, callbackId: id } };
        workerProxy.emit("getCompletionsAtPosition", message);
    }

    function getTypeAtDocumentPosition(fileName: string, documentPosition: { row: number; column: number }, callback: (err, typeInfo: ts.Type) => void): void {
        var id = callbackId++;
        callbacks[id] = callback;
        var message = { data: { fileName: fileName, documentPosition: documentPosition, callbackId: id } };
        workerProxy.emit("getTypeAtDocumentPosition", message);
    }

    function getOutputFiles(fileName: string, callback: (err, results) => void): void {
        var id = callbackId++;
        callbacks[id] = callback;
        var message = { data: { fileName: fileName, callbackId: id } };
        workerProxy.emit("getOutputFiles", message);
    }

    return new Promise<Workspace>(function(resolve, reject) {

        workerProxy.on("initAfter", function(event) {
            console.log(`workerProxy.initAfter(${JSON.stringify(event)})`);
            var ws: Workspace = {
                ensureScript: ensureScript,
                editScript: editScript,
                removeScript: removeScript,
                getFileNames: getFileNames,
                getSyntaxErrors: getSyntaxErrors,
                getSemanticErrors: getSemanticErrors,
                getCompletionsAtPosition: getCompletionsAtPosition,
                getTypeAtDocumentPosition: getTypeAtDocumentPosition,
                getOutputFiles: getOutputFiles
            };
            resolve(ws);
        });

        workerProxy.on("initFail", function(event) {
            // console.log(`workerProxy.initFail(${JSON.stringify(event)})`);
            reject(new Error("initFail received from worker thread."))
        });

        workerProxy.init('lib/workspace/WorkspaceWorker');
    });
};
