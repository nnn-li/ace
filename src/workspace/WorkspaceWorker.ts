/**
 * WorkspaceWorker
 */
import {EVENT_NAME_COMPLETIONS} from './workspace_protocol';
import WorkerCallback from "../WorkerCallback";
import DefaultLanguageServiceHost from "./DefaultLanguageServiceHost";
// FIXME: Make this an implementation detail.
import ScriptInfo from "./ScriptInfo";

/**
 * WorkspaceWorker is responsible for maintaining the language service host and language service.
 *
 * @class WorkspaceWorker
 */
export default class WorkspaceWorker {

    /**
     * @property host
     * @type DefaultLanguageServiceHost
     * @private
     */
    private host: DefaultLanguageServiceHost;

    /**
     * @property service
     * @type LanguageService
     * @private
     */
    private service: ts.LanguageService;

    /**
     * 1. Create a DefaultLanguageServiceHost that will mirror what is in the main thread.
     *    This cache also supports the require LanguageServiceHost interface.
     *
     * 2. Create a LanguageService that uses the DefaultLanguageServiceHost.
     *
     * 3. Register for events that either:
     *    a) provide the DefaultLanguageServiceHost with updates in the form of deltas or new files.
     *    b) request information back from the LanguageService.
     *
     * 4. Send an 'initAfter' notification that we have completed our initialization.
     * @class WorkspaceWorker
     * @constructor
     * @param sender {WorkerCallback}
     * @param ts typescriptServices injected by thread code.
     */
    constructor(sender: WorkerCallback, ts) {
        // console.log("WorkspaceWorker constructor()");

        this.host = new DefaultLanguageServiceHost(ts);
        if (ts) {
            // console.warn("WorkspaceWorker calling createLanguageService");
            this.service = ts.createLanguageService(this.host);
        }
        else {
            console.warn("TypeScript namespace has not been injected.")
        }

        var self = this;

        sender.on('ensureScript', function(message: { data: { fileName: string; content: string } }) {
            // This call, in turn will add the library to the lsHost.
            self.ensureScript(message.data.fileName, message.data.content);
        });

        sender.on('editScript', function(message: { data: { fileName: string; start: number; end: number; text: string } }) {
            var data = message.data;
            var fileName = data.fileName;
            var start = data.start;
            var end = data.end;
            var text = data.text;
            self.editScript(fileName, start, end, text);
        });

        sender.on('removeScript', function(message: { data: { fileName: string; content: string } }) {
            self.removeScript(message.data.fileName);
        });

        sender.on('getFileNames', function(request: { data: { callbackId: number } }) {
            var data = request.data;
            var callbackId: number = data.callbackId;
            var names = self.host.getScriptFileNames();
            var response = { names: names, callbackId: callbackId };
            sender.emit("fileNames", response);
        });

        sender.on('getSyntaxErrors', function(request: { data: { fileName: string; callbackId: number } }) {
            var data = request.data;
            var fileName: string = data.fileName;
            var callbackId: number = data.callbackId;
            // TODO: More information available in diagnostic.
            if (self.service) {
                var errors = self.service.getSyntacticDiagnostics(fileName).map((error: ts.Diagnostic) => { return { message: error.messageText, start: error.start, length: error.length }; });
                var response = { errors: errors, callbackId: callbackId };
                sender.emit("syntaxErrors", response);
            }
        });

        sender.on('getSemanticErrors', function(request: { data: { fileName: string; callbackId: number } }) {
            var data = request.data;
            var fileName: string = data.fileName;
            var callbackId: number = data.callbackId;
            try {
                if (self.service) {
                    var errors = self.service.getSemanticDiagnostics(fileName).map((error: ts.Diagnostic) => { return { message: error.messageText, start: error.start, length: error.length }; });
                    var response = { errors: errors, callbackId: callbackId };
                    sender.emit("semanticErrors", response);
                }
            }
            catch (e) {
            }
        });

        sender.on('getCompletionsAtPosition', function(request: { data: { fileName: string; position: number; memberMode: boolean; callbackId: number } }) {
            try {
                var data = request.data;
                var fileName: string = data.fileName;
                var position: number = data.position;
                var memberMode: boolean = data.memberMode;
                var callbackId: number = data.callbackId;
                if (typeof position !== 'number' || isNaN(position)) {
                    throw new Error("position must be a number and not NaN");
                }
                if (self.service) {
                    var completions: ts.CompletionInfo = self.service.getCompletionsAtPosition(fileName, position);
                    sender.emit(EVENT_NAME_COMPLETIONS, { completions: completions, callbackId: callbackId });
                }
            }
            catch (e) {
                // e parameter cannot have a type annotation so we really have to do some introspection.
                // FIXME: It would be nice to ensure a {name, message} structure.
                sender.emit(EVENT_NAME_COMPLETIONS, { err: e.toString(), callbackId: callbackId });
            }
        });

        // FIXME: Name change
        sender.on('getTypeAtDocumentPosition', function(request: { data: { fileName: string; documentPosition: { row: number; column: number }; callbackId: number } }) {
            try {
                var data = request.data;
                var fileName: string = data.fileName;
                var documentPosition: { row: number; column: number } = data.documentPosition;
                var callbackId: number = data.callbackId;
                var script: ScriptInfo = self.host.scripts[fileName];
                var row = documentPosition.row;
                var column = documentPosition.column;
                var position = script.getLineMap().getPosition(row, column);
                if (self.service) {
                    var typeInfo: ts.DefinitionInfo[] = self.service.getTypeDefinitionAtPosition(fileName, position);
                    // TODO: Why do we now have an array?
                    if (typeInfo) {
                        var description = null;
                        var memberName;// = typeInfo.memberName;
                        if (memberName) {
                            // TODO: This API call has several options. Maybe need to query?
                            //description = TypeScript.MemberName.memberNameToString(memberName);
                        }
                        var kind;// = typeInfo.kind;
                        var minChar;// = typeInfo.minChar;
                        var limChar;// = typeInfo.limChar;
                        var docComment;// = typeInfo.docComment;
                        var fullSymbolName;// = typeInfo.fullSymbolName;

                        var results = { kind: kind, minChar: minChar, limChar: limChar, description: description, docComment: docComment, fullSymbolName: fullSymbolName };
                        var response = { results: results, callbackId: callbackId };
                        sender.emit("typeAtDocumentPosition", response);
                    }
                    else {
                        // We should call back, if only to allow the receiver to cleanup quickly.
                        sender.emit("typeAtDocumentPosition", { callbackId: callbackId });
                    }
                }
            }
            catch (e) {
                sender.emit("typeAtDocumentPosition", { err: "" + e, callbackId: callbackId });
            }
        });

        sender.on('getOutputFiles', function(request: { data: { fileName: string; callbackId: number } }) {
            var data = request.data;
            var fileName: string = data.fileName;
            var callbackId: number = data.callbackId;
            try {
                if (self.service) {
                    var emitOutput: ts.EmitOutput = self.service.getEmitOutput(fileName);
                    var outputFiles: ts.OutputFile[] = emitOutput.outputFiles;
                    var response = { results: outputFiles, callbackId: callbackId };
                    sender.emit("outputFiles", response);
                }
            }
            catch (e) {
            }
        });

        var host = this.host;
        System.defaultJSExtensions = false;
        System.import(this.host.getDefaultLibFileName({}))
            .then(function(m: Module) {
                host.ensureScript(m.name, m.source);
                // console.log("WorkspaceWorker ready.")
                sender.emit('initAfter');
            })
            .catch(function(reason: any) {
                console.warn(`Failed to load defaultLib: ${reason}`);
                sender.emit('initFail');
            });
    }

    /**
     * @method ensureScript
     * @param fileName {string}
     * @param content {string}
     * @return {void}
     * @private
     */
    private ensureScript(fileName: string, content: string): void {
        this.host.ensureScript(fileName, content);
    }

    /**
     * @method editScript
     * @param fileName {string}
     * @param start {number}
     * @param end {number}
     * @param text {string}
     * @return {void}
     * @private
     */
    private editScript(fileName: string, start: number, end: number, text: string): void {
        console.log(`WorkspaceWorker.editScript(${fileName}, ${start}, ${end}, ${text})`);
        this.host.editScript(fileName, start, end, text);
    }

    private removeScript(fileName: string): void {
        this.host.removeScript(fileName);
    }
}