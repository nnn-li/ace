import ScriptInfo from "./ScriptInfo";

export default class ScriptCache implements ts.LanguageServiceHost {

    compilationSettings: ts.CompilerOptions;

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

    ///////////////////////////////////////////////////////////////////////
    // local implementation

    private addScript(fileName: string, content: string) {
        //        var script = new ScriptInfo(fileName, content);
        //        this.scripts[fileName] = script;
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

    setCompilationSettings(value: ts.CompilerOptions): void {
        this.compilationSettings = value;
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

    getDiagnosticsObject() {
        var diagnostics =
            {
                log: function(content) { }
            };
        return diagnostics;
    }

    ///////////////////////////////////////////////////////////////////////
    // LanguageServiceHost implementation

    /**
     * @method getCompilationSettings
     * @return {CompilerOptions}
     */
    getCompilationSettings(): ts.CompilerOptions {
        return this.compilationSettings;
    }

    getNewLine(): string {
        // Maybe we should get this from the editor?
        return "\n";
    }

    /**
     * @method getScriptVersion
     * @param fileName {string}
     * @return {string}
     */
    getScriptVersion(fileName: string): string {
        var script = this.scripts[fileName];
        return "" + script.version;
    }

    getScriptSnapshot(fileName: string): ts.IScriptSnapshot {
        var script = this.scripts[fileName];
        var result = ts.ScriptSnapshot.fromString(script.content);

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
        //        result["getTextChangeRangeSinceVersion"] = function(version) {
        //            return null;
        // return new TextChangeRange(new TextSpan(0, script.content.length),script.content.length);
        //        };
        return result;
    }

    getCurrentDirectory(): string {
        console.warn("ScriptCache.getCurrentDirector() called!");
        return "";
    }

    getDefaultLibFileName(options: ts.CompilerOptions): string {
        console.warn("ScriptCache.getDefaultLibFileName() called!");
        return "";
    }

    log(s: string): void {
        console.log(s);
    }

    ///////////////////////////////////////////////////////////////////////
    //

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
