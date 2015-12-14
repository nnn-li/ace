import Position from '../../Position';
import HashHandler from '../../keyboard/HashHandler';
import EventEmitterClass from '../../lib/event_emitter';
import Editor from '../../Editor';
import CompletionService from './CompletionService';
import AutoCompleteView from '../../mode/typescript/AutoCompleteView';
//import popup = require('../../autocomplete/popup');

/**
 * Makes a function that can be used to compare completion entries for sorting purposes.
 */
function makeCompareFn(text: string) {
    return function(a: ts.CompletionEntry, b: ts.CompletionEntry) {
        var matchFunc = function(entry: ts.CompletionEntry): number {
            return entry.name.indexOf(text) === 0 ? 1 : 0;
        };
        var matchCompare = function(): number {
            return matchFunc(b) - matchFunc(a);
        };
        var textCompare = function(): number {
            if (a.name === b.name) {
                return 0;
            }
            else {
                return (a.name > b.name) ? 1 : -1;
            }
        };
        var ret = matchCompare();
        return (ret !== 0) ? ret : textCompare();
    };
}

/**
 * Using the functional constructor pattern here because 'this' is too error-prone.
 *
 * Accordingly, the function is camelCase and is not called using the 'new' operator.
 */
export default function autoComplete(editor: Editor, fileNameProvider: () => string, completionService: CompletionService) {
    /**
     * Declare the return object now because the AutoCompleteView needs a reference.
     */
    var AutoComplete = function() {

    };
    var that: { activate: () => void; deactivate: () => void; isActive: () => boolean } = new AutoComplete();
    that.isActive = isActive;
    that.activate = activate;
    that.deactivate = deactivate;

    /**
     *
     */
    var _eventEmitter = new EventEmitterClass();

    /**
     *
     */
    var _active: boolean = false;

    /**
     *
     */
    var _handler: any = new HashHandler();

    /**
     *
     */
    var _view = new AutoCompleteView(editor, that);
    // var _view = new popup.ListViewPopup(document.body || document.documentElement);

    /**
     *
     */
    var _inputText = '';

    _handler.attach = function() {

        editor.on("change", onEditorChange);

        _eventEmitter._emit("attach", { 'sender': that });
        _active = true;
    };

    _handler.detach = function() {
        editor.off("change", onEditorChange);
        _view.hide();
        _eventEmitter._emit("detach", { 'sender': that });
        _active = false;
    };

    _handler.handleKeyboard = function(data, hashId, key, keyCode) {

        if (hashId == -1) {
            if (" -=,[]_/()!';:<>".indexOf(key) != -1) {
                deactivate();
            }
            return null;
        }

        var command = _handler.findKeyCommand(hashId, key);

        if (!command) {

            var defaultCommand = editor.commands.findKeyCommand(hashId, key);
            if (defaultCommand) {
                if (defaultCommand.name == "backspace") {
                    return null;
                }
                deactivate();
            }
            return null;
        }

        if (typeof command !== "string") {
            var args = command.args;
            command = command.command;
        }

        if (typeof command === "string") {
            command = this.commands[command];
        }

        return { 'command': command, 'args': args };

    };

    _handler.bindKeys({ "Up|Ctrl-p": "moveprev", "Down|Ctrl-n": "movenext", "esc|Ctrl-g": "cancel", "Return|Tab": "insert" });

    _handler.addCommands({
        movenext: function(editor) { _view.focusNext(); },
        moveprev: function(editor) { _view.focusPrev(); },
        cancel: function(editor) { deactivate(); },
        insert: function(editor: Editor) {
            editor.off("change", onEditorChange);

            for (var i = 0; i < _inputText.length; i++) {
                editor.remove("left");
            }

            // TODO: This is where the insertion happens.
            var curr: HTMLElement = _view.current();
            if (curr) {
                editor.insert(curr.getAttribute('name'), false);
            }
            deactivate();
        }
    });

    function isActive(): boolean {
        return _active;
    }

    /**
     * Returns the number of completions asynchronously in the callback with the side effect of showing the completions.
     */
    function activateUsingCursor(cursor: Position) {
        completionService.getCompletionsAtCursor(fileNameProvider(), cursor, function(err, completionInfo: ts.CompletionInfo) {
            if (!err) {
                // FIXME: The matchText should not be visisble, or rather part of the callback.
                var text = completionService.matchText;

                _inputText = text;

                var completions = completionInfo ? completionInfo.entries : null;

                if (completions && _inputText.length > 0) {
                    completions = completions.filter(function(elm) {
                        return elm.name.toLowerCase().indexOf(_inputText.toLowerCase()) === 0;
                    });
                }

                completions = completions ? completions.sort(makeCompareFn(_inputText)) : completions;

                showCompletions(completions);

                var count = completions ? completions.length : 0;
                if (count > 0) {
                    editor.keyBinding.addKeyboardHandler(_handler);
                }
            }
            function showCompletions(infos: ts.CompletionEntry[]) {
                // FIXME: The 'view' does not seem to be very well encapsulated here.
                if (infos && infos.length > 0) {
                    editor.container.appendChild(_view.wrap);
                    var html = '';
                    for (var n in infos) {
                        // {name, kind, kindModifiers}
                        var info = infos[n];
                        var name = '<span class="label-name">' + info.name + '</span>';
                        var kind = '<span class="label-kind label-kind-' + info.kind + '">' + info.kind.charAt(0) + '</span>';

                        html += '<li data-name="' + info.name + '">' + kind + name + '</li>';
                    }
                    //                  _view.setData();
                    var coords: { pageX: number; pageY: number } = editor.renderer.textToScreenCoordinates(cursor.row, cursor.column - text.length);
                    var lineHeight = 9;
                    var topdownOnly = false;
                    _view.show(coords/*, lineHeight, topdownOnly*/);
                    _view.listElement.innerHTML = html;
                    _view.ensureFocus();
                }
                else {
                    _view.hide();
                }
            }
        });

    }

    /**
     * Listens for changes in the editor and maybe shows the completions.
     */
    function onEditorChange(event: { data: { action: string; text: string } }): void {
        var cursor = editor.getCursorPosition();
        if (event.data.action == "insertText") {
            activateUsingCursor({ row: cursor.row, column: cursor.column + 1 });
        }
        else if (event.data.action == "removeText") {
            if (event.data.text == '\n') {
                deactivate();
            }
            else {
                activateUsingCursor(cursor);
            }
        }
        else {
            activateUsingCursor(cursor);
        }
    }

    function activate(): void {
        activateUsingCursor(editor.getCursorPosition());
    }

    function deactivate() {
        editor.keyBinding.removeKeyboardHandler(_handler);
    }

    return that;
}