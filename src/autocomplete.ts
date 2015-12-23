/* ***** BEGIN LICENSE BLOCK *****
 * The MIT License (MIT)
 *
 * Copyright (c) 2014-2016 David Geo Holmes <david.geo.holmes@gmail.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * ***** END LICENSE BLOCK ***** */
/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2012, Ajax.org B.V.
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

import HashHandler from "./keyboard/HashHandler";
import ListViewPopup from "./autocomplete/ListViewPopup";
import {retrievePrecedingIdentifier} from "./autocomplete/util";
import {} from "./lib/event";
import {delayedCall} from "./lib/lang";
import {snippetManager} from "./snippets";
import Editor from './Editor';
import EditSession from './EditSession';
import Anchor from './Anchor';
import Position from './Position';
import Range from './Range';
import ThemeLink from './ThemeLink';
import Completion from "./Completion";
import CompletionList from "./CompletionList";

var EDITOR_EXT_COMPLETER = 'completer';

export interface Completer {
    getCompletions(editor: Editor, session: EditSession, pos: Position, prefix: string, callback: (err, results: Completion[]) => any);
}

export function getCompleter(editor: Editor): CompleterAggregate {
    return editor[EDITOR_EXT_COMPLETER];
}

export function setCompleter(editor: Editor, completer: CompleterAggregate) {
    editor[EDITOR_EXT_COMPLETER] = completer;
}

export class CompleterAggregate implements Completer {
    private editor: Editor;
    private keyboardHandler = new HashHandler();
    public activated: boolean;
    private changeTimer;
    private gatherCompletionsId = 0;
    private base: Anchor;
    private completions: CompletionList;
    private commands: { [name: string]: (editor: Editor) => void };
    public autoSelect = true;
    public autoInsert = true;
    constructor(editor: Editor) {
        this.editor = editor;
        this.commands = {
            "Up": function(editor: Editor) { getCompleter(editor).goTo("up"); },
            "Down": function(editor: Editor) { getCompleter(editor).goTo("down"); },
            "Ctrl-Up|Ctrl-Home": function(editor: Editor) { getCompleter(editor).goTo("start"); },
            "Ctrl-Down|Ctrl-End": function(editor: Editor) { getCompleter(editor).goTo("end"); },

            "Esc": function(editor: Editor) { getCompleter(editor).detach(); },
            "Space": function(editor: Editor) { getCompleter(editor).detach(); editor.insert(" ", false); },
            "Return": function(editor: Editor) { return getCompleter(editor).insertMatch(); },
            "Shift-Return": function(editor: Editor) { getCompleter(editor).insertMatch(true); },
            "Tab": function(editor: Editor) {
                var result = getCompleter(editor).insertMatch();
                if (!result && !editor['tabstopManager']) {
                    getCompleter(editor).goTo("down");
                }
                else
                    return result;
            },

            "PageUp": function(editor: Editor) { getCompleter(editor).goTo('pageUp'); },
            "PageDown": function(editor: Editor) { getCompleter(editor).goTo('pageDown'); }
        };

        this.keyboardHandler.bindKeys(this.commands);

        this.blurListener = this.blurListener.bind(this);
        this.changeListener = this.changeListener.bind(this);
        this.mousedownListener = this.mousedownListener.bind(this);
        this.mousewheelListener = this.mousewheelListener.bind(this);

        this.changeTimer = delayedCall(function() { this.updateCompletions(true); }.bind(this));
    }
    public popup: ListViewPopup;

    /**
     * Implementation of the Completer interface.
     */
    public insertMatch(data?) {
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
                // FIXME: getAllRanges on Selection?
                var ranges: Range[] = this.editor.selection['getAllRanges']();
                // TODO: Assignment in conditional expression.
                // TODO: Assignment in conditional expression.
                // It's cute but also may halt prematurely and so hide bugs.
                // Replace by length variable and test?
                // Use assertion within the loop to look for falsey values.
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

    /**
     * Implementation of the Completer interface.
     */
    public detach() {
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

    /**
     * Implementation of the Completer interface.
     */
    public goTo(where: string): void {
        var row = this.popup.getRow();
        var max = this.popup.getLength() - 1;

        switch (where) {
            case "up": row = row <= 0 ? max : row - 1; break;
            case "down": row = row >= max ? -1 : row + 1; break;
            case "start": row = 0; break;
            case "end": row = max; break;
        }

        this.popup.setRow(row);
    }

    /**
     * Implementation of the Completer interface.
     */
    public getCompletions(editor: Editor, session: EditSession, pos: Position, prefix: string, callback) {

        this.base = new Anchor(session.doc, pos.row, pos.column - prefix.length);

        var matches: Completion[] = [];
        var total = editor.completers.length;
        editor.completers.forEach(function(completer: Completer, index: number) {
            completer.getCompletions(editor, session, pos, prefix, function(err, results: Completion[]) {
                if (!err)
                    matches = matches.concat(results);
                // Fetch prefix again, because they may have changed by now
                var pos: Position = editor.getCursorPosition();
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

    private updateCompletions(keepPopupPosition: boolean): void {
        var pos = this.editor.getCursorPosition();
        var prefix: string;
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
            // Save current gatherCompletions session, session is close when a match is insert
            var _id = this.gatherCompletionsId;
            var editor = this.editor;
            var session = editor.getSession();
            var line = session.getLine(pos.row);
            prefix = retrievePrecedingIdentifier(line, pos.column);
            this.getCompletions(this.editor, session, this.editor.getCursorPosition(), prefix, function(err, results: { prefix: string; matches: Completion[]; finished: boolean }) {
                // Only detach if result gathering is finished
                var detachIfFinished = function() {
                    if (!results.finished) return;
                    return this.detach();
                }.bind(this);

                var prefix = results.prefix;
                var matches = results && results.matches;

                if (!matches || !matches.length)
                    return detachIfFinished();
    
                // Wrong prefix or wrong session -> ignore
                if (prefix.indexOf(results.prefix) !== 0 || _id != this.gatherCompletionsId)
                    return;

                this.completions = new CompletionList(matches);
                this.completions.setFilter(prefix);
                var filtered = this.completions.filtered;
    
                // No results
                if (!filtered.length)
                    return detachIfFinished();
    
                // One result equals to the prefix
                if (filtered.length == 1 && filtered[0].value == prefix && !filtered[0].snippet)
                    return detachIfFinished();
    
                // Autoinsert if one result
                if (this.autoInsert && filtered.length == 1)
                    return this.insertMatch(filtered[0]);

                this.openPopup(this.editor, prefix, keepPopupPosition);
            }.bind(this));
        }
    }

    private openPopup(editor: Editor, prefix: string, keepPopupPosition: boolean) {
        if (!this.popup) {
            this.popup = new ListViewPopup(document.body || document.documentElement);
            this.popup.on("click", function(e) { this.insertMatch(); e.stop(); }.bind(this));
            this.popup.focus = this.editor.focus.bind(this.editor);
        }

        this.popup.setData(this.completions.filtered);

        this.popup.setRow(this.autoSelect ? 0 : -1);

        if (!keepPopupPosition) {
            // FIXME: Seems like we can do better by using a cached theme?
            //this.popup.importThemeLink(editor.getTheme())
            //    .then(function(theme: ThemeLink) {
            //        console.warn("TODO: Handle theme in popop.")
            //    })
            //    .catch(function(reason) {
            //        console.warn(`popup.importThemeLink failed. Reason: ${reason}`);
            //    });
            this.popup.setFontSize(editor.getFontSize());

            var lineHeight = editor.renderer.layerConfig.lineHeight;

            var pos: { left: number; top: number } = editor.renderer.$cursorLayer.getPixelPosition(this.base, true);
            pos.left -= this.popup.getTextLeftOffset();

            var rect = editor.container.getBoundingClientRect();
            pos.top += rect.top - editor.renderer.layerConfig.offset;
            pos.left += rect.left - editor.renderer.scrollLeft;
            pos.left += editor.renderer.$gutterLayer.gutterWidth;

            this.popup.show(pos, lineHeight);
        }
    }

    private changeListener(e) {
        var cursor = this.editor.selection.lead;
        if (cursor.row != this.base.row || cursor.column < this.base.column) {
            this.detach();
        }
        if (this.activated)
            this.changeTimer.schedule();
        else
            this.detach();
    }

    private blurListener() {
        // we have to check if activeElement is a child of popup because
        // on IE preventDefault doesn't stop scrollbar from being focussed
        var el = document.activeElement;
        if (el != this.editor.textInput.getElement() && el.parentNode != this.popup.container) {
            this.detach();
        }
    }

    private mousedownListener(e) {
        this.detach();
    }

    private mousewheelListener(e) {
        this.detach();
    }

    public showPopup = function(editor: Editor) {

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
    }
    public cancelContextMenu() {
        this.editor.cancelMouseContextMenu();
    }
}

// TODO: Should we implement Completer or is it really just implementation?
export class Autocomplete {
    static startCommand = {
        name: "startAutocomplete",
        exec: function(editor: Editor) {
            var aggregate: CompleterAggregate = getCompleter(editor);
            if (!aggregate) {
                aggregate = new CompleterAggregate(editor);
                setCompleter(editor, aggregate);
            }
            aggregate.autoInsert = true;
            aggregate.autoSelect = true;
            aggregate.showPopup(editor);
            // needed for firefox on mac
            aggregate.cancelContextMenu();
        },
        bindKey: "Ctrl-Space|Ctrl-Shift-Space|Alt-Space"
    };
}
