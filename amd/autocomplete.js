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
define(["require", "exports", "./keyboard/HashHandler", "./autocomplete/popup", "./autocomplete/util", "./lib/lang", "./snippets", './Range'], function (require, exports, HashHandler_1, popup_1, util_1, lang_1, snippets_1, Range_1) {
    var EDITOR_EXT_COMPLETER = 'completer';
    function getCompleter(editor) {
        return editor[EDITOR_EXT_COMPLETER];
    }
    exports.getCompleter = getCompleter;
    function setCompleter(editor, completer) {
        editor[EDITOR_EXT_COMPLETER] = completer;
    }
    exports.setCompleter = setCompleter;
    var CompleterAggregate = (function () {
        function CompleterAggregate(editor) {
            this.keyboardHandler = new HashHandler_1.default();
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
                "Space": function (editor) { getCompleter(editor).detach(); editor.insert(" "); },
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
            this.changeTimer = lang_1.delayedCall(function () { this.updateCompletions(true); }.bind(this));
        }
        /**
         * Implementation of the Completer interface.
         */
        CompleterAggregate.prototype.insertMatch = function (data) {
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
                    // TODO: Assignment in conditional expression.
                    // TODO: Assignment in conditional expression.
                    // It's cute but also may halt prematurely and so hide bugs.
                    // Replace by length variable and test?
                    // Use assertion within the loop to look for falsey values.
                    for (var i = 0, range; range = ranges[i]; i++) {
                        range.start.column -= this.completions.filterText.length;
                        this.editor.session.remove(range);
                    }
                }
                if (data.snippet) {
                    snippets_1.snippetManager.insertSnippet(this.editor, data.snippet);
                }
                else {
                    this.editor.execCommand("insertstring", data.value || data);
                }
            }
            this.detach();
        };
        /**
         * Implementation of the Completer interface.
         */
        CompleterAggregate.prototype.detach = function () {
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
        };
        /**
         * Implementation of the Completer interface.
         */
        CompleterAggregate.prototype.goTo = function (where) {
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
        };
        /**
         * Implementation of the Completer interface.
         */
        CompleterAggregate.prototype.getCompletions = function (editor, session, pos, prefix, callback) {
            this.base = session.doc.createAnchor(pos.row, pos.column - prefix.length);
            var matches = [];
            var total = editor.completers.length;
            editor.completers.forEach(function (completer, i) {
                completer.getCompletions(editor, session, pos, prefix, function (err, results) {
                    if (!err)
                        matches = matches.concat(results);
                    // Fetch prefix again, because they may have changed by now
                    var pos = editor.getCursorPosition();
                    var line = session.getLine(pos.row);
                    callback(null, {
                        prefix: util_1.retrievePrecedingIdentifier(line, pos.column, results[0] && results[0].identifierRegex),
                        matches: matches,
                        finished: (--total === 0)
                    });
                });
            });
            return true;
        };
        CompleterAggregate.prototype.updateCompletions = function (keepPopupPosition) {
            var pos = this.editor.getCursorPosition();
            var prefix;
            if (keepPopupPosition && this.base && this.completions) {
                var range = new Range_1.default(this.base.row, this.base.column, pos.row, pos.column);
                prefix = this.editor.session.getTextRange(range);
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
                prefix = util_1.retrievePrecedingIdentifier(line, pos.column);
                this.getCompletions(this.editor, session, this.editor.getCursorPosition(), prefix, function (err, results) {
                    // Only detach if result gathering is finished
                    var detachIfFinished = function () {
                        if (!results.finished)
                            return;
                        return this.detach();
                    }.bind(this);
                    var prefix = results.prefix;
                    var matches = results && results.matches;
                    if (!matches || !matches.length)
                        return detachIfFinished();
                    // Wrong prefix or wrong session -> ignore
                    if (prefix.indexOf(results.prefix) !== 0 || _id != this.gatherCompletionsId)
                        return;
                    this.completions = new FilteredList(matches);
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
        };
        CompleterAggregate.prototype.openPopup = function (editor, prefix, keepPopupPosition) {
            if (!this.popup) {
                this.popup = new popup_1.ListViewPopup(document.body || document.documentElement);
                this.popup.on("click", function (e) { this.insertMatch(); e.stop(); }.bind(this));
                this.popup.focus = this.editor.focus.bind(this.editor);
            }
            this.popup.setData(this.completions.filtered);
            this.popup.setRow(this.autoSelect ? 0 : -1);
            if (!keepPopupPosition) {
                this.popup.setTheme(editor.getTheme());
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
        };
        CompleterAggregate.prototype.changeListener = function (e) {
            var cursor = this.editor.selection.lead;
            if (cursor.row != this.base.row || cursor.column < this.base.column) {
                this.detach();
            }
            if (this.activated)
                this.changeTimer.schedule();
            else
                this.detach();
        };
        CompleterAggregate.prototype.blurListener = function () {
            // we have to check if activeElement is a child of popup because
            // on IE preventDefault doesn't stop scrollbar from being focussed
            var el = document.activeElement;
            if (el != this.editor.textInput.getElement() && el.parentNode != this.popup.container) {
                this.detach();
            }
        };
        CompleterAggregate.prototype.mousedownListener = function (e) {
            this.detach();
        };
        CompleterAggregate.prototype.mousewheelListener = function (e) {
            this.detach();
        };
        CompleterAggregate.prototype.cancelContextMenu = function () {
            this.editor.cancelMouseContextMenu();
        };
        return CompleterAggregate;
    })();
    exports.CompleterAggregate = CompleterAggregate;
    // TODO: Should we implement Completer or is it really just implementation?
    var Autocomplete = (function () {
        function Autocomplete() {
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
                // needed for firefox on mac
                aggregate.cancelContextMenu();
            },
            bindKey: "Ctrl-Space|Ctrl-Shift-Space|Alt-Space"
        };
        return Autocomplete;
    })();
    exports.Autocomplete = Autocomplete;
    var FilteredList = (function () {
        function FilteredList(all, filterText, mutateData) {
            this.all = all;
            this.filtered = all;
            this.filterText = filterText || "";
        }
        FilteredList.prototype.setFilter = function (str) {
            var matches;
            if (str.length > this.filterText && str.lastIndexOf(this.filterText, 0) === 0)
                matches = this.filtered;
            else
                matches = this.all;
            this.filterText = str;
            matches = this.filterCompletions(matches, this.filterText);
            matches = matches.sort(function (a, b) {
                return b.exactMatch - a.exactMatch || b.score - a.score;
            });
            // make unique
            var prev = null;
            matches = matches.filter(function (item) {
                var caption = item.value || item.caption || item.snippet;
                if (caption === prev)
                    return false;
                prev = caption;
                return true;
            });
            this.filtered = matches;
        };
        FilteredList.prototype.filterCompletions = function (items, needle) {
            var results = [];
            var upper = needle.toUpperCase();
            var lower = needle.toLowerCase();
            // TODO: Assignment in conditional expression.
            // It's cute but also may halt prematurely and so hide bugs.
            // Replace by length variable and test?
            // Use assertion within the loop to look for falsey values.
            loop: for (var i = 0, length = items.length; i < length; i++) {
                var item = items[i];
                var caption = item.value || item.caption || item.snippet;
                if (!caption)
                    continue;
                var lastIndex = -1;
                var matchMask = 0;
                var penalty = 0;
                var index, distance;
                // caption char iteration is faster in Chrome but slower in Firefox, so lets use indexOf
                for (var j = 0; j < needle.length; j++) {
                    // TODO add penalty on case mismatch
                    var i1 = caption.indexOf(lower[j], lastIndex + 1);
                    var i2 = caption.indexOf(upper[j], lastIndex + 1);
                    index = (i1 >= 0) ? ((i2 < 0 || i1 < i2) ? i1 : i2) : i2;
                    if (index < 0)
                        continue loop;
                    distance = index - lastIndex - 1;
                    if (distance > 0) {
                        // first char mismatch should be more sensitive
                        if (lastIndex === -1)
                            penalty += 10;
                        penalty += distance;
                    }
                    matchMask = matchMask | (1 << index);
                    lastIndex = index;
                }
                item.matchMask = matchMask;
                item.exactMatch = penalty ? 0 : 1;
                item.score = (item.score || 0) - penalty;
                results.push(item);
            }
            return results;
        };
        return FilteredList;
    })();
    exports.FilteredList = FilteredList;
});
