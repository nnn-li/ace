import HashHandler from "./keyboard/HashHandler";
import ListViewPopup from "./autocomplete/ListViewPopup";
import { retrievePrecedingIdentifier } from "./autocomplete/util";
import { delayedCall } from "./lib/lang";
import { snippetManager } from "./snippets";
import Range from './Range';
import CompletionList from "./CompletionList";
var EDITOR_EXT_COMPLETER = 'completer';
export function getCompleter(editor) {
    return editor[EDITOR_EXT_COMPLETER];
}
export function setCompleter(editor, completer) {
    editor[EDITOR_EXT_COMPLETER] = completer;
}
export class CompleterAggregate {
    constructor(editor) {
        this.keyboardHandler = new HashHandler();
        this.gatherCompletionsId = 0;
        this.autoSelect = true;
        this.autoInsert = true;
        this.showPopup = function (editor) {
            if (this.editor) {
                this.detach();
            }
            this.activated = true;
            this.editor = editor;
            if (getCompleter(editor) != this) {
                if (getCompleter(editor)) {
                    getCompleter(editor).detach();
                }
                setCompleter(editor, this);
            }
            editor.keyBinding.addKeyboardHandler(this.keyboardHandler);
            editor.on("changeSelection", this.changeListener);
            editor.on("blur", this.blurListener);
            editor.on("mousedown", this.mousedownListener);
            editor.on("mousewheel", this.mousewheelListener);
            this.updateCompletions();
        };
        this.editor = editor;
        this.commands = {
            "Up": function (editor) { getCompleter(editor).goTo("up"); },
            "Down": function (editor) { getCompleter(editor).goTo("down"); },
            "Ctrl-Up|Ctrl-Home": function (editor) { getCompleter(editor).goTo("start"); },
            "Ctrl-Down|Ctrl-End": function (editor) { getCompleter(editor).goTo("end"); },
            "Esc": function (editor) { getCompleter(editor).detach(); },
            "Space": function (editor) { getCompleter(editor).detach(); editor.insert(" ", false); },
            "Return": function (editor) { return getCompleter(editor).insertMatch(); },
            "Shift-Return": function (editor) { getCompleter(editor).insertMatch(true); },
            "Tab": function (editor) {
                var result = getCompleter(editor).insertMatch();
                if (!result && !editor['tabstopManager']) {
                    getCompleter(editor).goTo("down");
                }
                else
                    return result;
            },
            "PageUp": function (editor) { getCompleter(editor).goTo('pageUp'); },
            "PageDown": function (editor) { getCompleter(editor).goTo('pageDown'); }
        };
        this.keyboardHandler.bindKeys(this.commands);
        this.blurListener = this.blurListener.bind(this);
        this.changeListener = this.changeListener.bind(this);
        this.mousedownListener = this.mousedownListener.bind(this);
        this.mousewheelListener = this.mousewheelListener.bind(this);
        this.changeTimer = delayedCall(function () { this.updateCompletions(true); }.bind(this));
    }
    insertMatch(data) {
        if (!data) {
            data = this.popup.getData(this.popup.getRow());
        }
        if (!data) {
            return;
        }
        if (data.completer && data.completer.insertMatch) {
            data.completer.insertMatch(this.editor);
        }
        else {
            if (this.completions.filterText) {
                var ranges = this.editor.selection['getAllRanges']();
                for (var i = 0, range; range = ranges[i]; i++) {
                    range.start.column -= this.completions.filterText.length;
                    this.editor.getSession().remove(range);
                }
            }
            if (data.snippet) {
                snippetManager.insertSnippet(this.editor, data.snippet);
            }
            else {
                this.editor.execCommand("insertstring", data.value || data);
            }
        }
        this.detach();
    }
    detach() {
        this.editor.keyBinding.removeKeyboardHandler(this.keyboardHandler);
        this.editor.off("changeSelection", this.changeListener);
        this.editor.off("blur", this.blurListener);
        this.editor.off("mousedown", this.mousedownListener);
        this.editor.off("mousewheel", this.mousewheelListener);
        this.changeTimer.cancel();
        if (this.popup && this.popup.isOpen) {
            this.gatherCompletionsId += 1;
            this.popup.hide();
        }
        if (this.base)
            this.base.detach();
        this.activated = false;
        this.completions = this.base = null;
    }
    goTo(where) {
        var row = this.popup.getRow();
        var max = this.popup.getLength() - 1;
        switch (where) {
            case "up":
                row = row <= 0 ? max : row - 1;
                break;
            case "down":
                row = row >= max ? -1 : row + 1;
                break;
            case "start":
                row = 0;
                break;
            case "end":
                row = max;
                break;
        }
        this.popup.setRow(row);
    }
    getCompletions(editor, session, pos, prefix, callback) {
        this.base = session.doc.createAnchor(pos.row, pos.column - prefix.length);
        var matches = [];
        var total = editor.completers.length;
        editor.completers.forEach(function (completer, index) {
            completer.getCompletions(editor, session, pos, prefix, function (err, results) {
                if (!err)
                    matches = matches.concat(results);
                var pos = editor.getCursorPosition();
                var line = session.getLine(pos.row);
                callback(null, {
                    prefix: retrievePrecedingIdentifier(line, pos.column, results[0] && results[0].identifierRegex),
                    matches: matches,
                    finished: (--total === 0)
                });
            });
        });
        return true;
    }
    updateCompletions(keepPopupPosition) {
        var pos = this.editor.getCursorPosition();
        var prefix;
        if (keepPopupPosition && this.base && this.completions) {
            var range = new Range(this.base.row, this.base.column, pos.row, pos.column);
            prefix = this.editor.getSession().getTextRange(range);
            if (prefix == this.completions.filterText)
                return;
            this.completions.setFilter(prefix);
            if (!this.completions.filtered.length)
                return this.detach();
            if (this.completions.filtered.length == 1 && this.completions.filtered[0].value == prefix && !this.completions.filtered[0].snippet) {
                return this.detach();
            }
            this.openPopup(this.editor, prefix, keepPopupPosition);
        }
        else {
            var _id = this.gatherCompletionsId;
            var editor = this.editor;
            var session = editor.getSession();
            var line = session.getLine(pos.row);
            prefix = retrievePrecedingIdentifier(line, pos.column);
            this.getCompletions(this.editor, session, this.editor.getCursorPosition(), prefix, function (err, results) {
                var detachIfFinished = function () {
                    if (!results.finished)
                        return;
                    return this.detach();
                }.bind(this);
                var prefix = results.prefix;
                var matches = results && results.matches;
                if (!matches || !matches.length)
                    return detachIfFinished();
                if (prefix.indexOf(results.prefix) !== 0 || _id != this.gatherCompletionsId)
                    return;
                this.completions = new CompletionList(matches);
                this.completions.setFilter(prefix);
                var filtered = this.completions.filtered;
                if (!filtered.length)
                    return detachIfFinished();
                if (filtered.length == 1 && filtered[0].value == prefix && !filtered[0].snippet)
                    return detachIfFinished();
                if (this.autoInsert && filtered.length == 1)
                    return this.insertMatch(filtered[0]);
                this.openPopup(this.editor, prefix, keepPopupPosition);
            }.bind(this));
        }
    }
    openPopup(editor, prefix, keepPopupPosition) {
        if (!this.popup) {
            this.popup = new ListViewPopup(document.body || document.documentElement);
            this.popup.on("click", function (e) { this.insertMatch(); e.stop(); }.bind(this));
            this.popup.focus = this.editor.focus.bind(this.editor);
        }
        this.popup.setData(this.completions.filtered);
        this.popup.setRow(this.autoSelect ? 0 : -1);
        if (!keepPopupPosition) {
            this.popup.setFontSize(editor.getFontSize());
            var lineHeight = editor.renderer.layerConfig.lineHeight;
            var pos = editor.renderer.$cursorLayer.getPixelPosition(this.base, true);
            pos.left -= this.popup.getTextLeftOffset();
            var rect = editor.container.getBoundingClientRect();
            pos.top += rect.top - editor.renderer.layerConfig.offset;
            pos.left += rect.left - editor.renderer.scrollLeft;
            pos.left += editor.renderer.$gutterLayer.gutterWidth;
            this.popup.show(pos, lineHeight);
        }
    }
    changeListener(e) {
        var cursor = this.editor.selection.lead;
        if (cursor.row != this.base.row || cursor.column < this.base.column) {
            this.detach();
        }
        if (this.activated)
            this.changeTimer.schedule();
        else
            this.detach();
    }
    blurListener() {
        var el = document.activeElement;
        if (el != this.editor.textInput.getElement() && el.parentNode != this.popup.container) {
            this.detach();
        }
    }
    mousedownListener(e) {
        this.detach();
    }
    mousewheelListener(e) {
        this.detach();
    }
    cancelContextMenu() {
        this.editor.cancelMouseContextMenu();
    }
}
export class Autocomplete {
}
Autocomplete.startCommand = {
    name: "startAutocomplete",
    exec: function (editor) {
        var aggregate = getCompleter(editor);
        if (!aggregate) {
            aggregate = new CompleterAggregate(editor);
            setCompleter(editor, aggregate);
        }
        aggregate.autoInsert = true;
        aggregate.autoSelect = true;
        aggregate.showPopup(editor);
        aggregate.cancelContextMenu();
    },
    bindKey: "Ctrl-Space|Ctrl-Shift-Space|Alt-Space"
};
