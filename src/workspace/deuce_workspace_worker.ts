/// <reference path="../../typings/typescriptServices.d.ts"/>
/**
 * WorkspaceWorker
 */
import protocol = require('./workspace_protocol');

var TypeScript = require('./typescriptServices').TypeScript;

var Services = TypeScript.Services;
var TypeScriptServicesFactory = Services.TypeScriptServicesFactory;

var LineMap1 = TypeScript.LineMap1;
var ScriptSnapshot = TypeScript.ScriptSnapshot;
var TextChangeRange = TypeScript.TextChangeRange;
var TextSpan = TypeScript.TextSpan;

class ScriptInfo {
    fileName: string;
    content: string;
    version: number;
    editRanges: { length: number; textChangeRange: TypeScript.TextChangeRange }[];
    lineMap;
    constructor(fileName: string, content: string) {
        this.fileName = fileName;
        this.version = 1;
        this.editRanges = [];
        this.setContent(content);
    }

    setContent(content: string): void {
        this.content = content;
        this.lineMap = null;
    }

    getLineMap = function() {
        if (!this.lineMap) {
            this.lineMap = LineMap1.fromString(this.content);
        }
        return this.lineMap;
    }

    updateContent(content: string) {
        this.editRanges = [];
        this.setContent(content);
        this.version++;
    }

    editContent(minChar: number, limChar: number, newText: string) {
        // Apply edits
        var prefix: string = this.content.substring(0, minChar);
        var middle: string = newText;
        var suffix: string = this.content.substring(limChar);
        this.setContent(prefix + middle + suffix);

        // Store edit range and the length of the script.
        var length: number = this.content.length;
        var range = new TextChangeRange(TextSpan.fromBounds(minChar, limChar), newText.length);

        this.editRanges.push({ 'length': length, 'textChangeRange': range });

        // Bump the version.
        this.version++;
    }

    getTextChangeRangeSinceVersion(version) {
        if (this.version === version) {
            // No edits.
            return TextChangeRange.unchanged;
        }

        var initialEditRangeIndex = this.editRanges.length - (this.version - version);

        var entries = this.editRanges.slice(initialEditRangeIndex);

        return TextChangeRange.collapseChangesAcrossMultipleVersions(entries.map(function(e) {
            return e.textChangeRange;
        }));
    }
}

class ScriptCache implements TypeScript.Services.ILanguageServiceHost {
    compilationSettings;
    scripts: { [fileName: string]: ScriptInfo };
    maxScriptVersions: number;
    constructor() {
        this.compilationSettings = null;
        this.scripts = {};
        this.maxScriptVersions = 100;
    }

    getScriptFileNames() {
        return Object.keys(this.scripts);
    }

    getFileNames(callback) {
        callback(Object.keys(this.scripts));
    }

    getScriptIsOpen(fileName) {
        return true;
    }

    getScriptByteOrderMark(fileName) {
        return null;
    }

    getLocalizedDiagnosticMessages() {
        return "";
    }

    ///////////////////////////////////////////////////////////////////////
    // IReferenceResolveHost implementation

    fileExists(path) {
        return true;
    }

    directoryExists(path) {
        return true;
    }

    getParentDirectory(path) {
        return "";
    }

    resolveRelativePath(path, directory) {
        return "";
    }

    getScriptSnapshot(fileName) {
        var script = this.scripts[fileName];
        var result = ScriptSnapshot.fromString(script.content);

        // Quick hack: We don't want this to blow up.
        /*
        Uncaught Error: Not yet implemented. typescriptServices.js:1267
        Errors.notYetImplemented typescriptServices.js:1267
        StringScriptSnapshot.getTextChangeRangeSinceVersion typescriptServices.js:4138
        HostCache.getScriptTextChangeRangeSinceVersion typescriptServices.js:64510
        LanguageServiceCompiler.tryUpdateFile typescriptServices.js:64675
        LanguageServiceCompiler.synchronizeHostDataWorker typescriptServices.js:64657
        (anonymous function) typescriptServices.js:64627
        timeFunction typescriptServices.js:27531
        LanguageServiceCompiler.synchronizeHostData typescriptServices.js:64626
        LanguageServiceCompiler.getDocument typescriptServices.js:64717
        LanguageService.getSymbolInfoAtPosition typescriptServices.js:65423
        LanguageService.getOccurrencesAtPosition typescriptServices.js:65510
        showOccurrences main.js:150
        callback
        */
        result["getTextChangeRangeSinceVersion"] = function(version) {
            return null;
            // return new TextChangeRange(new TextSpan(0, script.content.length),script.content.length);
        };

        return result;
    }

    ///////////////////////////////////////////////////////////////////////
    // local implementation

    private addScript(fileName: string, content: string) {
        var script = new ScriptInfo(fileName, content);
        this.scripts[fileName] = script;
    }

    ensureScript(fileName, content) {
        var script = this.scripts[fileName];
        if (script) {
            script.updateContent(content);
        }
        else {
            this.addScript(fileName, content);
        }
    }

    editScript(fileName, minChar, limChar, newText) {
        var script = this.scripts[fileName];
        if (script) {
            script.editContent(minChar, limChar, newText);
        }
        else {
            throw new Error("No script with fileName '" + fileName + "'");
        }
    }

    removeScript(fileName) {
        var script = this.scripts[fileName];
        if (script) {
            delete this.scripts[fileName];
        }
        else {
            throw new Error("No script with fileName '" + fileName + "'");
        }
    }

    ///////////////////////////////////////////////////////////////////////
    // ILogger implementation

    information() {
        return false;
    }

    debug() {
        return false;
    }

    warning() {
        return false;
    }

    error() {
        return false;
    }

    fatal() {
        return false;
    }

    log(s) {

    }

    getDiagnosticsObject() {
        var diagnostics =
            {
                log: function(content) { }
            };
        return diagnostics;
    }

    ///////////////////////////////////////////////////////////////////////
    // ILanguageServiceHost implementation

    getCompilationSettings() {
        return this.compilationSettings;
    }

    setCompilationSettings(value) {
        this.compilationSettings = value;
    }

    getScriptVersion(fileName) {
        var script = this.scripts[fileName];
        return script.version;
    }

    /**
     * Apply an array of text edits to a string, and return the resulting string.
     */
    applyEdits(content, edits) {
        var result = content;
        edits = this.normalizeEdits(edits);

        for (var i = edits.length - 1; i >= 0; i--) {
            var edit = edits[i];
            var prefix = result.substring(0, edit.minChar);
            var middle = edit.text;
            var suffix = result.substring(edit.limChar);
            result = prefix + middle + suffix;
        }
        return result;
    }

    /**
     * Normalize an array of edits by removing overlapping entries and sorting
     * entries on the "minChar" position.
     */
    normalizeEdits(edits) {
        var result = [];

        function mapEdits(edits) {
            var result = [];
            for (var i = 0; i < edits.length; i++) {
                result.push({ 'edit': edits[i], 'index': i });
            }
            return result;
        }

        var temp = mapEdits(edits).sort(function(a, b) {
            var result = a.edit.minChar - b.edit.minChar;
            if (result === 0) {
                result = a.index - b.index;
            }
            return result;
        });

        var current = 0;
        var next = 1;
        while (current < temp.length) {
            var currentEdit = temp[current].edit;

            // Last edit.
            if (next >= temp.length) {
                result.push(currentEdit);
                current++;
                continue;
            }
            var nextEdit = temp[next].edit;

            var gap = nextEdit.minChar - currentEdit.limChar;

            // non-overlapping edits.
            if (gap >= 0) {
                result.push(currentEdit);
                current = next;
                next++;
                continue;
            }

            // overlapping edits: for now, we only support ignoring an next edit
            // entirely contained in the current edit.
            if (currentEdit.limChar >= nextEdit.limChar) {
                next++;
                continue;
            }
            else {
                throw new Error("Trying to apply overlapping edits");
            }
        }
        return result;
    }
}

/**
 * WorkspaceWorker is responsible for maintaining the language service host and language service. 
 */
export class WorkspaceWorker {

    private scriptCache = new ScriptCache();
    private ls: TypeScript.Services.ILanguageService = new TypeScriptServicesFactory().createPullLanguageService(this.scriptCache);

    constructor(sender/*FIXME: ace.WorkerSender*/) {

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
            var names = self.scriptCache.getScriptFileNames();
            var response = { names: names, callbackId: callbackId };
            sender.emit("fileNames", response);
        });

        sender.on('getSyntaxErrors', function(request: { data: { fileName: string; callbackId: number } }) {
            var data = request.data;
            var fileName: string = data.fileName;
            var callbackId: number = data.callbackId;
            var errors = self.ls.getSyntacticDiagnostics(fileName).map((error) => { return { message: error.message(), start: error.start(), length: error.length() }; });
            var response = { errors: errors, callbackId: callbackId };
            sender.emit("syntaxErrors", response);
        });

        sender.on('getSemanticErrors', function(request: { data: { fileName: string; callbackId: number } }) {
            var data = request.data;
            var fileName: string = data.fileName;
            var callbackId: number = data.callbackId;
            try {
                var errors = self.ls.getSemanticDiagnostics(fileName).map((error) => { return { message: error.message(), start: error.start(), length: error.length() }; });
                var response = { errors: errors, callbackId: callbackId };
                sender.emit("semanticErrors", response);
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
                var completions = self.ls.getCompletionsAtPosition(fileName, position, memberMode);
                sender.emit(protocol.EVENT_NAME_COMPLETIONS, { completions: completions, callbackId: callbackId });
            }
            catch (e) {
                // e parameter cannot have a type annotation so we really have to do some introspection.
                // FIXME: It would be nice to ensure a {name, message} structure.
                sender.emit(protocol.EVENT_NAME_COMPLETIONS, { err: e.toString(), callbackId: callbackId });
            }
        });

        sender.on('getTypeAtDocumentPosition', function(request: { data: { fileName: string; documentPosition: { row: number; column: number }; callbackId: number } }) {
            try {
                var data = request.data;
                var fileName: string = data.fileName;
                var documentPosition: { row: number; column: number } = data.documentPosition;
                var callbackId: number = data.callbackId;
                var script: ScriptInfo = self.scriptCache.scripts[fileName];
                var row = documentPosition.row;
                var column = documentPosition.column;
                var position = script.getLineMap().getPosition(row, column);
                var typeInfo: TypeScript.Services.TypeInfo = self.ls.getTypeAtPosition(fileName, position);
                if (typeInfo) {
                    /**
                     * The type information from the source.
                     */
                    var description = null;
                    var memberName = typeInfo.memberName;
                    if (memberName) {
                        // TODO: This API call has several options. Maybe need to query?
                        description = TypeScript.MemberName.memberNameToString(memberName);
                    }
                    var kind = typeInfo.kind;
                    var minChar = typeInfo.minChar;
                    var limChar = typeInfo.limChar;
                    /**
                     * The JS documentation comments with `@param` parsed out.
                     */
                    var docComment = typeInfo.docComment;
                    var fullSymbolName = typeInfo.fullSymbolName;

                    var results = { kind: kind, minChar: minChar, limChar: limChar, description: description, docComment: docComment, fullSymbolName: fullSymbolName };
                    var response = { results: results, callbackId: callbackId };
                    sender.emit("typeAtDocumentPosition", response);
                }
                else {
                    // We should call back, if only to allow the receiver to cleanup quickly.
                    sender.emit("typeAtDocumentPosition", { callbackId: callbackId });
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
                var emitOutput: TypeScript.EmitOutput = self.ls.getEmitOutput(fileName);
                var outputFiles: TypeScript.OutputFile[] = emitOutput.outputFiles;
                var response = { results: outputFiles, callbackId: callbackId };
                sender.emit("outputFiles", response);
            }
            catch (e) {
            }
        });

        sender.emit('initAfter');
    }

    private ensureScript(fileName: string, content: string): void {
        this.scriptCache.ensureScript(fileName, content);
    }

    private editScript(fileName: string, start: number, end: number, text: string): void {
        this.scriptCache.editScript(fileName, start, end, text);
    }

    private removeScript(fileName: string): void {
        this.scriptCache.removeScript(fileName);
    }
}