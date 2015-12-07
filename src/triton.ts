import autoComplete from './mode/typescript/autoComplete';
import CompletionService from './mode/typescript/CompletionService';
import EditorPosition from './mode/typescript/EditorPosition';
import {getPosition} from './mode/typescript/DocumentPositionUtil';
import {parallel} from "./lib/async";
import Editor from './Editor';
import EditSession from './EditSession';
import Range from './Range';
import {deferredCall} from "./lib/lang";
import typeInfoTip from "./typeInfoTip";
import {workspace, Workspace} from './workspace/workspace';
import {COMMAND_NAME_AUTO_COMPLETE} from './editor_protocol';
//import CommandManager = require('./commands/CommandManager');
import {} from './selection';

/**
 * The functional constructor pattern used to create a facade that
 * includes an editor, the HTML element that the editor will be built upon,
 * and the shared workspace.
 * This is called by editing applications.
 */
export function wrap(editor: Editor, rootElement: HTMLElement, workspace, doc: Document = window.document) {

    function show() {
        rootElement.style.display = "block";
        editor.focus();
    }

    function hide() {
        rootElement.style.display = 'none';
    }

    var _fileName: string;
    var _completionService = new CompletionService(editor, workspace);
    var _editorPositionService = new EditorPosition(editor);
    var _syncStop = false; //for stop sync on loadfile
    var _refMarkers: number[] = [];
    var _errorMarkers: number[] = [];

    var _typeInfo = typeInfoTip(doc, editor, workspace, () => _fileName, rootElement);
    var _autoComplete = autoComplete(editor, () => _fileName, _completionService);

    _typeInfo.startUp();

    /**
     * Changes the editor contents and updates the workspace.
     */
    function changeFile(content: string, fileName: string, cursorPos) {
        if (_fileName) {
            if (workspace) {
                workspace.removeScript(_fileName);
            }
            _fileName = null;
        }
        _fileName = fileName;
        _syncStop = true;
        var data = content.replace(/\r\n?/g, '\n');
        editor.setValue(data, cursorPos);
        if (workspace) {
            workspace.ensureScript(fileName, editor.getSession().getDocument().getValue());
        }
        _syncStop = false;
    }

    editor.commands.addCommands([{
        name: COMMAND_NAME_AUTO_COMPLETE,
        bindKey: "Ctrl-Space",
        exec: function(editor) {
            if (!_autoComplete.isActive()) {
                _autoComplete.activate();
            }
        }
    }]);

    editor.addEventListener("mousedown", function(event) {
        if (_autoComplete.isActive()) {
            _autoComplete.deactivate();
        }
    });

    /**
     * This event seems to be pretty rare.
     */
    editor.addEventListener("changeCursor", function(event) {
    });

    function showOccurrences() {
        /*
        var session = _editor.getSession();
        _refMarkers.forEach(function(id) {
            session.removeMarker(id);
        });
        try {
            if (typeof _languageService !== 'undefined') {
                var references = _languageService.getOccurrencesAtPosition(_currentFileName, _editorPositionService.getCurrentCharPosition());
                if (references) {
                    references.forEach(function(reference) {
                        var start = _editorPositionService.getPositionFromChars(reference.minChar);
                        var end = _editorPositionService.getPositionFromChars(reference.limChar);
                        var range = new AceRange(start.row, start.column, end.row, end.column);
                        _refMarkers.push(session.addMarker(range, "typescript-ref", "text", true));
                    });
                }
            }
        }
        catch (e) {
        }
        */
    }

    var deferredShowOccurrences = deferredCall(showOccurrences);

    /**
     * Changing the selection does not trigger any effort on behalf of the worker.
     */
    editor.addEventListener("changeSelection", function(event) {
        // There's not much in the event, just a 'type' property that is 'changeSelection'.
        if (!_syncStop) {
            try {
                deferredShowOccurrences.schedule(200);
            }
            catch (ex) {
                //TODO
            }
        }
    });

    /**
     * When the text in the editor changes, the edit is applied to the workspace.
     * The workspace communicates with the WorkspaceWorker through a WorkerClient proxy.
     * The onUpdate method of the worker is soon triggered followed by the compile method.
     */
    editor.addEventListener("change", function(event: { data: { action: string; range: { start: { row: number; column: number } }; text: string; lines: string[] } }) {
        var data = event.data;
        var action: string = data.action;
        var range = data.range;
        if (_fileName) {
            if (!_syncStop) {
                try {
                    updateWorkspaceFile();
                    updateMarkerModels();
                }
                catch (e) {
                }
            }
        }
        /**
         * Updates the file in the workspace using the (captured) fileName and change event.
         */
        function updateWorkspaceFile() {
            function editLanguageServiceScript(start: number, end: number, text: string) {
                if (workspace) {
                    workspace.editScript(_fileName, start, end, text);
                }
            }
            var end: number;
            var start: number = _editorPositionService.getPositionChars(range.start);
            if (action === "insertText") {
                editLanguageServiceScript(start, start, data.text);
            }
            else if (action === "removeText") {
                end = start + data.text.length;
                editLanguageServiceScript(start, end, "");
            }
            else if (action === "insertLines") {
                var text = data.lines.map(function(line) { return line + '\n'; }).join('');
                editLanguageServiceScript(start, start, text);
            }
            else if (action === "removeLines") {
                var len = _editorPositionService.getLinesChars(data.lines);
                end = start + len;
                editLanguageServiceScript(start, end, "");
            }
            else {
            }
        }

        /**
         * Updates the marker models.
         */
        function updateMarkerModels() {
            var markers = editor.getSession().getMarkers(true);
            var line_count = 0;
            var isNewLine = editor.getSession().getDocument().isNewLine;
            if (action === "insertText") {
                if (isNewLine(data.text)) {
                    line_count = 1;
                }
            }
            else if (action === "insertLines") {
                line_count = data.lines.length;
            }
            else if (action === "removeText") {
                if (isNewLine(data.text)) {
                    line_count = -1;
                }
            }
            else if (action === "removeLines") {
                line_count = -data.lines.length;
            }
            if (line_count !== 0) {
                var markerUpdate = function(id: number) {
                    var marker = markers[id];
                    var row = range.start.row;
                    if (line_count > 0) {
                        row = +1;
                    }
                    if (marker && marker.range.start.row > row) {
                        marker.range.start.row += line_count;
                        marker.range.end.row += line_count;
                    }
                };
                _errorMarkers.forEach(markerUpdate);
                _refMarkers.forEach(markerUpdate);
                // FIXME: This is the odd man out.
                // We should not be triggering a view refresh here?
                editor.onChangeFrontMarker();
            }
        }
    });

    /*
    function languageServiceIndent() {
        var cursor = _editor.getCursorPosition();
        var lineNumber = cursor.row;

        var text = _editor.session.getLine(lineNumber);
        var matches = text.match(/ ^[\t ]* /);
        var preIndent = 0;
        var wordLen = 0;

        if (matches) {
            wordLen = matches[0].length;
            for (var i = 0; i < matches[0].length; i++) {
                var elm = matches[0].charAt(i);
                var spaceLen = (elm == " ") ? 1 : _editor.session.getTabSize();
                preIndent += spaceLen;
            }
        }

        var option = new Services.EditorOptions();
        option.NewLineCharacter = "\n";

        var smartIndent = _languageService.getSmartIndentAtLineNumber(_currentFileName, lineNumber, option);

        if (preIndent > smartIndent) {
            _editor.indent();
        }
        else {
            var indent = smartIndent - preIndent;

            if (indent > 0) {
                _editor.getSelection().moveCursorLineStart();
                _editor.commands.exec("inserttext", _editor, { text: " ", times: indent });
            }

            if (cursor.column > wordLen) {
                cursor.column += indent;
            }
            else {
                cursor.column = indent + wordLen;
            }

            _editor.getSelection().moveCursorToPosition(cursor);
        }
    }

    _editor.commands.addCommands([{
        name: "indent",
        bindKey: "Tab",
        exec: function(editor) {
            languageServiceIndent();
        },
        multiSelectAction: "forEach"
    }]);
    */

    /*
    function refactor() {
        var references = _languageService.getOccurrencesAtPosition(_currentFileName, _editorPositionService.getCurrentCharPosition());

        references.forEach(function(reference) {
            var start = _editorPositionService.getPositionFromChars(reference.minChar);
            var end = _editorPositionService.getPositionFromChars(reference.limChar);
            var range = new AceRange(start.row, start.column, end.row, end.column);
            _editor.session.multiSelect.addRange(range);
        });
    }

    _editor.commands.addCommands([{
        name: "refactor",
        bindKey: "F2",
        exec: function(editor) {
            refactor();
        }
    }]);
    */

    // Handle the compiled notification
    editor.getSession().on("compiled", function(message) {
        var session: EditSession = editor.getSession();
        // FIXME: Document here conflicts with the browser document type.
        var doc: any = session.getDocument();
        function convertError(error: { message: string; start: number; length: number }): { row: number; column: number; text: string; type: string } {
            var minChar = error.start;
            var limChar = minChar + error.length;
            var pos = getPosition(doc, minChar);
            return { row: pos.row, column: pos.column, text: error.message, type: 'error' };
        }
        // FIXME: The type of the callback should be known.
        function getSyntaxErrors(callback) {
            if (workspace && typeof _fileName === 'string') {
                workspace.getSyntaxErrors(_fileName, callback);
            }
            else {
                callback(null, []);
            }
        }
        // FIXME: The type of the callback should be known.
        function getSemanticErrors(callback) {
            if (workspace && typeof _fileName === 'string') {
                workspace.getSemanticErrors(_fileName, callback);
            }
            else {
                callback(null, []);
            }
        }
        // Request syntax and semantic errors from the workspace, set markers and annotations.
        parallel([getSyntaxErrors, getSemanticErrors], function(err, results: any[][]) {
            if (!err) {
                var errors = results[0].concat(results[1]);
                var annotations = [];
                if (errors && errors.length) {
                    errors.forEach(function(error) {
                        annotations.push(convertError(error));
                    });
                }
                // FIXME: EditSession should declare annotation type.
                // See Annotation interface.
                session.setAnnotations(annotations);
                _errorMarkers.forEach(function(id) { session.removeMarker(id); });
                // Add the new compile errors to the editor session and the id(s) to the model.
                errors.forEach(function(error: { message: string; start: number; length: number }) {
                    var minChar = error.start;
                    var limChar = minChar + error.length;
                    var start = _editorPositionService.getPositionFromChars(minChar);
                    var end = _editorPositionService.getPositionFromChars(limChar);
                    var range = new Range(start.row, start.column, end.row, end.column);
                    // Add a new marker to the given Range. The last argument (inFront) causes a
                    // front marker to be defined and the 'changeFrontMarker' event fires.
                    // The class parameter is a css stylesheet class so you must have it in your CSS.
                    _errorMarkers.push(session.addMarker(range, "typescript-error", "text", true));
                });
            }
            else {
            }
        });
        if (workspace && typeof _fileName === 'string') {
            workspace.getOutputFiles(_fileName, function(err, outputFiles) {
                session._emit("outputFiles", { data: outputFiles });
            });
        }
    });

    var editorWrapper = {
        clearSelection: () => { editor.clearSelection(); },
        get fileName(): string { return _fileName; },
        set fileName(value) { _fileName = value; },
        get commands() { return editor.commands; },
        get container() { return editor.container; },
        get session() { return editor.session; },
        getCursorPosition: () => { return editor.getCursorPosition(); },
        getSelection: () => { return editor.getSelection(); },
        getValue: () => { return editor.getValue(); },
        gotoLine: (lineNumber: number, column: number, animate?: boolean) => { return editor.gotoLine(lineNumber, column, animate); },
        focus: () => { editor.focus(); },
        indent: () => { editor.indent(); },
        moveCursorTo: (row: number, column: number, animate?: boolean) => { return editor.moveCursorTo(row, column, animate); },
        resize: (force: boolean) => { return editor.resize(force); },
        selectAll: () => { editor.selectAll(); },
        setAutoScrollEditorIntoView: (enable: boolean) => { return editor.setAutoScrollEditorIntoView(enable); },
        setFontSize: (fontSize: string) => { return editor.setFontSize(fontSize); },
        setOption: (name: string, value: any) => { return editor.setOption(name, value); },
        setOptions: (options: any) => { return editor.setOptions(options); },
        setShowInvisibles: (showInvisibles: boolean) => { return editor.setShowInvisibles(showInvisibles); },
        setTheme: (theme: string, callback?: () => void) => { return editor.setTheme(theme, callback); },
        setValue: (val: string, cursorPos?: number) => { return editor.setValue(val, cursorPos); },
        getSession: () => { return editor.getSession(); },
        addEventListener: (eventName: string, callback: () => void, capturing?: boolean) => { return editor.addEventListener(eventName, callback, capturing); },
        get onTextInput(): any { return editor.onTextInput; },
        set onTextInput(value) { editor.onTextInput = value; },

        getDisplayIndentGuides: () => { return editor.getDisplayIndentGuides(); },
        setDisplayIndentGuides: (displayIndentGuides: boolean) => { return editor.setDisplayIndentGuides(displayIndentGuides); },

        getShowPrintMargin: () => { return editor.getShowPrintMargin(); },
        setShowPrintMargin: (showPrintMargin: boolean) => { return editor.setShowPrintMargin(showPrintMargin); },

        changeFile: changeFile
    };

    return editorWrapper;
}

// We can't export this yet until we can create the inner editor in TypeScript.
function edit(source: any, workspace: Workspace, doc: Document = window.document) {

    var rootElement = (function(): HTMLElement {
        if (typeof source === "string") {

            var element = doc.getElementById(source);
            if (element) {
                return element;
            }
            else {
                throw new Error(source + " must be an element id");
            }
        }
        else {
            return source;
        }
    })();

    var _editor = (function(element: HTMLElement): Editor {
        throw new Error("edit is currently unsupported");
        //    return basic.edit(element);
    })(rootElement);

    return wrap(_editor, rootElement, workspace, doc);
}

export function workspace() {
    return workspace();
}
