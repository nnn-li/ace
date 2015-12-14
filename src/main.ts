"use strict";

import Editor from './Editor';
import EditorDocument from './EditorDocument';
import EditSession from './EditSession';
import VirtualRenderer from './VirtualRenderer';

import TextMode from './mode/TextMode';
import CssMode from './mode/CssMode';
import HtmlMode from './mode/HtmlMode';
import JavaScriptMode from './mode/JavaScriptMode';
import TypeScriptMode from './mode/TypeScriptMode';

import Workspace from './workspace/Workspace';
import createWorkspace from './workspace/createWorkspace';
import createAutoComplete from './mode/typescript/autoComplete';
import CompletionService from './mode/typescript/CompletionService';
import {COMMAND_NAME_AUTO_COMPLETE} from './editor_protocol';
import EditorPosition from './mode/typescript/EditorPosition';
import {getPosition} from './mode/typescript/DocumentPositionUtil';
import {parallel} from "./lib/async";
import LanguageMode from './LanguageMode';
import Range from './Range';
import ThemeLink from './ThemeLink';
import {appendHTMLLinkElement} from './lib/dom'

var systemNormalize = System.normalize;
System.normalize = function(name: string, parentName: string, parentAddress: string): Promise<string> {
    return systemNormalize.call(this, name, parentName, parentAddress);
}

var systemLocate = System.locate;
System.locate = function(load): string {
    // The name is already a URL?
    return systemLocate.call(this, load);
}

var systemTranslate = System.translate;
System.translate = function(load) {
    return systemTranslate.call(this, load);
}

// var text = new TextMode()
// var mode = new CssMode()
// var mode = new HtmlMode()
// var mode = new JavaScriptMode()
// var mode = new TypeScriptMode()

var code = '// comment\n"use strict";\nvar x = 0;\nvar y = 1;\n';
//var code = '';

var doc = new EditorDocument(code);

var editSession = new EditSession(doc);
// editSession.setUseWorker(false);
// We can use module names to set the language mode.
// FIXME: Separate out the synchronous from the async?
//editSession.setMode(text);
editSession.importMode('lib/mode/TypeScriptMode')
    .then(function(mode: LanguageMode) {
        editSession.setMode(mode);
    }).catch(function(reason) {
        console.warn(`importMode() failed. Reason:  ${reason}`);
    });
editSession.setTabSize(2);
editSession.setUseSoftTabs(true);

var element = document.getElementById('editor')
var renderer = new VirtualRenderer(element);
//renderer.setAnnotations([]);
//renderer.setPadding(10);
renderer.importThemeLink('lib/theme/twilight')
    .then(function(themeLink: ThemeLink) {
        renderer.setThemeLink(themeLink)
    })
    .catch(function(reason) {
        console.warn(`importThemeLink() failed. Reason:  ${reason}`);
    });
//renderer.setAnimatedScroll(true);
//renderer.setCompositionText("Hello");
//renderer.setCursorStyle('yahoo');

//renderer.setDefaultHandler('', function() {
//});

//renderer.setMouseCursor('cursor-style');
//renderer.setScrollMargin(5, 5, 5, 5);
//renderer.setShowGutter(true);
//renderer.setShowInvisibles(true);
//renderer.setCursorLayerOff();
//renderer.setDefaultCursorStyle();
//renderer.setDisplayIndentGuides(true);
//renderer.setFadeFoldWidgets(true);
//renderer.setHighlightGutterLine(true);
//renderer.setPrintMarginColumn(23);
//renderer.setShowPrintMargin(true);
//renderer.setHScrollBarAlwaysVisible(true);
//renderer.setVScrollBarAlwaysVisible(true);

// The Editor acts as a controller between the renderer and the EditSession.
var editor = new Editor(renderer, editSession);
editor.setFontSize("20px");
//editor.setHighlightActiveLine(true);
// editor.setHighlightGutterLine(true); Why repeated?
//editor.setHighlightSelectedWord(true);
//editor.setAnimatedScroll(false);  // Why repeated?
//editor.setShowInvisibles(true); // Why repeated

; (function() {
    createWorkspace()
        .then(function(workspace: Workspace) {
            var _fileName: string;
            ///////////////////////////////////////////////////////////////////////////////
            function changeFile(content: string, fileName: string, cursorPos?: number): void {
                if (_fileName) {
                    if (workspace) {
                        workspace.removeScript(fileName);
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
            ///////////////////////////////////////////////////////////////////////////////
            var completionService = new CompletionService(editor, workspace);
            var autoComplete = createAutoComplete(editor, () => _fileName, completionService);
            editor.commands.addCommands([{
                name: COMMAND_NAME_AUTO_COMPLETE,
                bindKey: "Ctrl-Space",
                exec: function(editor: Editor) {
                    if (!autoComplete.isActive()) {
                        autoComplete.activate();
                    }
                }
            }]);

            editor.on("mousedown", function(event) {
                if (autoComplete.isActive()) {
                    autoComplete.deactivate();
                }
            });
            ///////////////////////////////////////////////////////////////////////////////
            var _editorPositionService = new EditorPosition(editor);
            var _syncStop = false; //for stop sync on loadfile
            var _refMarkers: number[] = [];
            var _errorMarkers: number[] = [];

            //
            // When the text in the editor changes, the edit is applied to the workspace.
            // The workspace communicates with the WorkspaceWorker through a WorkerClient proxy.
            // The onUpdate method of the worker is soon triggered followed by the compile method.
            //
            editor.on("change", function(event: { data: { action: string; range: { start: { row: number; column: number } }; text: string; lines: string[] } }) {
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
                            console.warn(`exception from change ${e}`);
                        }
                    }
                    else {
                        // console.warn("change ignored because of syncStop");
                    }
                }
                else {
                    console.warn("change ignored because no fileName");
                }
                //
                // Updates the file in the workspace using the (captured) fileName and change event.
                //
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

                //
                // Updates the marker models.
                //
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
                        // It seems very artificial to fake the editSession event, can we do better?
                        editor.onChangeFrontMarker(void 0, editor.getSession());
                    }
                }
            });

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

            ///////////////////////////////////////////////////////////////////////////////
            changeFile(code, "example.ts");
        })
        .catch(function(reason: any) {
            console.warn(`No workspace because ${reason}`);
        });
})();