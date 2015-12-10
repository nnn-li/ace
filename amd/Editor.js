/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
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
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
define(["require", "exports", "./lib/oop", "./lib/dom", "./lib/lang", "./lib/useragent", "./keyboard/KeyBinding", "./keyboard/TextInput", "./Search", "./Range", "./lib/event_emitter", "./commands/CommandManager", "./commands/default_commands", "./config", "./TokenIterator", './editor_protocol', "./lib/event", './touch/touch', "./Tooltip"], function (require, exports, oop_1, dom_1, lang_1, useragent_1, KeyBinding_1, TextInput_1, Search_1, Range_1, event_emitter_1, CommandManager_1, default_commands_1, config_1, TokenIterator_1, editor_protocol_1, event_1, touch_1, Tooltip_1) {
    //var DragdropHandler = require("./mouse/dragdrop_handler").DragdropHandler;
    /**
     * The main entry point into the Ace functionality.
     *
     * The `Editor` manages the [[EditSession]] (which manages [[Document]]s), as well as the [[VirtualRenderer]], which draws everything to the screen.
     *
     * Event sessions dealing with the mouse and keyboard are bubbled up from `Document` to the `Editor`, which decides what to do with them.
     * @class Editor
     */
    /**
     * Creates a new `Editor` object.
     *
     * @param {VirtualRenderer} renderer Associated `VirtualRenderer` that draws everything
     * @param {EditSession} session The `EditSession` to refer to
     *
     *
     * @constructor
     */
    var Editor = (function (_super) {
        __extends(Editor, _super);
        function Editor(renderer, session) {
            _super.call(this);
            this.curOp = null;
            this.prevOp = {};
            this.$mergeableCommands = ["backspace", "del", "insertstring"];
            this.commands = new CommandManager_1.default(useragent_1.isMac ? "mac" : "win", default_commands_1.default);
            this.container = renderer.getContainerElement();
            this.renderer = renderer;
            this.textInput = new TextInput_1.default(renderer.getTextAreaContainer(), this);
            this.renderer.textarea = this.textInput.getElement();
            this.keyBinding = new KeyBinding_1.default(this);
            if (useragent_1.isMobile) {
                this.$touchHandler = touch_1.touchManager(this);
                this.$mouseHandler = new MouseHandler(this);
            }
            else {
                this.$touchHandler = touch_1.touchManager(this);
                this.$mouseHandler = new MouseHandler(this);
            }
            new FoldHandler(this);
            this.$blockScrolling = 0;
            this.$search = new Search_1.default().set({ wrap: true });
            this.$historyTracker = this.$historyTracker.bind(this);
            this.commands.on("exec", this.$historyTracker);
            this.$initOperationListeners();
            this._$emitInputEvent = lang_1.delayedCall(function () {
                this._signal("input", {});
                this.session.bgTokenizer && this.session.bgTokenizer.scheduleStart();
            }.bind(this));
            var self = this;
            this.on("change", function () {
                self._$emitInputEvent.schedule(31);
            });
            this.setSession(session);
            config_1.resetOptions(this);
            config_1._signal("editor", this);
        }
        Editor.prototype.cancelMouseContextMenu = function () {
            this.$mouseHandler.cancelContextMenu();
        };
        Object.defineProperty(Editor.prototype, "selection", {
            get: function () {
                return this.session.getSelection();
            },
            set: function (selection) {
                this.session.setSelection(selection);
            },
            enumerable: true,
            configurable: true
        });
        Editor.prototype.$initOperationListeners = function () {
            function last(a) { return a[a.length - 1]; }
            this.selections = [];
            this.commands.on("exec", function (e) {
                this.startOperation(e);
                var command = e.command;
                if (command.aceCommandGroup == "fileJump") {
                    var prev = this.prevOp;
                    if (!prev || prev.command.aceCommandGroup != "fileJump") {
                        this.lastFileJumpPos = last(this.selections);
                    }
                }
                else {
                    this.lastFileJumpPos = null;
                }
            }.bind(this), true);
            this.commands.on("afterExec", function (e) {
                var command = e.command;
                if (command.aceCommandGroup == "fileJump") {
                    if (this.lastFileJumpPos && !this.curOp.selectionChanged) {
                        this.selection.fromJSON(this.lastFileJumpPos);
                    }
                }
                this.endOperation(e);
            }.bind(this), true);
            this.$opResetTimer = lang_1.delayedCall(this.endOperation.bind(this));
            this.on("change", function () {
                this.curOp || this.startOperation();
                this.curOp.docChanged = true;
            }.bind(this), true);
            this.on("changeSelection", function () {
                this.curOp || this.startOperation();
                this.curOp.selectionChanged = true;
            }.bind(this), true);
        };
        Editor.prototype.startOperation = function (commadEvent) {
            if (this.curOp) {
                if (!commadEvent || this.curOp.command)
                    return;
                this.prevOp = this.curOp;
            }
            if (!commadEvent) {
                this.previousCommand = null;
                commadEvent = {};
            }
            this.$opResetTimer.schedule();
            this.curOp = {
                command: commadEvent.command || {},
                args: commadEvent.args,
                scrollTop: this.renderer.scrollTop
            };
            var command = this.curOp.command;
            if (command && command.scrollIntoView)
                this.$blockScrolling++;
            this.selections.push(this.selection.toJSON());
        };
        Editor.prototype.endOperation = function () {
            if (this.curOp) {
                var command = this.curOp.command;
                if (command && command.scrollIntoView) {
                    this.$blockScrolling--;
                    switch (command.scrollIntoView) {
                        case "center":
                            this.renderer.scrollCursorIntoView(null, 0.5);
                            break;
                        case "animate":
                        case "cursor":
                            this.renderer.scrollCursorIntoView();
                            break;
                        case "selectionPart":
                            var range = this.selection.getRange();
                            var config = this.renderer.layerConfig;
                            if (range.start.row >= config.lastRow || range.end.row <= config.firstRow) {
                                this.renderer.scrollSelectionIntoView(this.selection.anchor, this.selection.lead);
                            }
                            break;
                        default:
                            break;
                    }
                    if (command.scrollIntoView == "animate")
                        this.renderer.animateScrolling(this.curOp.scrollTop);
                }
                this.prevOp = this.curOp;
                this.curOp = null;
            }
        };
        Editor.prototype.$historyTracker = function (e) {
            if (!this.$mergeUndoDeltas)
                return;
            var prev = this.prevOp;
            var mergeableCommands = this.$mergeableCommands;
            // previous command was the same
            var shouldMerge = prev.command && (e.command.name == prev.command.name);
            if (e.command.name == "insertstring") {
                var text = e.args;
                if (this.mergeNextCommand === undefined)
                    this.mergeNextCommand = true;
                shouldMerge = shouldMerge
                    && this.mergeNextCommand // previous command allows to coalesce with
                    && (!/\s/.test(text) || /\s/.test(prev.args)); // previous insertion was of same type
                this.mergeNextCommand = true;
            }
            else {
                shouldMerge = shouldMerge
                    && mergeableCommands.indexOf(e.command.name) !== -1; // the command is mergeable
            }
            if (this.$mergeUndoDeltas != "always"
                && Date.now() - this.sequenceStartTime > 2000) {
                shouldMerge = false; // the sequence is too long
            }
            if (shouldMerge)
                this.session.mergeUndoDeltas = true;
            else if (mergeableCommands.indexOf(e.command.name) !== -1)
                this.sequenceStartTime = Date.now();
        };
        /**
         * Sets a new key handler, such as "vim" or "windows".
         * @param {string|HasgHandler} keyboardHandler The new key handler
         *
         **/
        Editor.prototype.setKeyboardHandler = function (keyboardHandler) {
            if (!keyboardHandler) {
                this.keyBinding.setKeyboardHandler(null);
            }
            else if (typeof keyboardHandler === "string") {
                this.$keybindingId = keyboardHandler;
                var _self = this;
                config_1.loadModule(["keybinding", keyboardHandler], function (module) {
                    if (_self.$keybindingId == keyboardHandler)
                        _self.keyBinding.setKeyboardHandler(module && module.handler);
                }, this.container.ownerDocument);
            }
            else {
                this.$keybindingId = null;
                this.keyBinding.setKeyboardHandler(keyboardHandler);
            }
        };
        /**
         * Returns the keyboard handler, such as "vim" or "windows".
         *
         * @returns {String}
         *
         */
        Editor.prototype.getKeyboardHandler = function () {
            return this.keyBinding.getKeyboardHandler();
        };
        /**
         * Emitted whenever the [[EditSession]] changes.
         * @event changeSession
         * @param {Object} e An object with two properties, `oldSession` and `session`, that represent the old and new [[EditSession]]s.
         *
         **/
        /**
         * Sets a new editsession to use. This method also emits the `'changeSession'` event.
         * @param {EditSession} session The new session to use
         *
         **/
        Editor.prototype.setSession = function (session) {
            if (this.session == session)
                return;
            var oldSession = this.session;
            if (oldSession) {
                this.session.off("change", this.$onDocumentChange);
                this.session.off("changeMode", this.$onChangeMode);
                this.session.off("tokenizerUpdate", this.$onTokenizerUpdate);
                this.session.off("changeTabSize", this.$onChangeTabSize);
                this.session.off("changeWrapLimit", this.$onChangeWrapLimit);
                this.session.off("changeWrapMode", this.$onChangeWrapMode);
                this.session.off("onChangeFold", this.$onChangeFold);
                this.session.off("changeFrontMarker", this.$onChangeFrontMarker);
                this.session.off("changeBackMarker", this.$onChangeBackMarker);
                this.session.off("changeBreakpoint", this.$onChangeBreakpoint);
                this.session.off("changeAnnotation", this.$onChangeAnnotation);
                this.session.off("changeOverwrite", this.$onCursorChange);
                this.session.off("changeScrollTop", this.$onScrollTopChange);
                this.session.off("changeScrollLeft", this.$onScrollLeftChange);
                var selection = this.session.getSelection();
                selection.off("changeCursor", this.$onCursorChange);
                selection.off("changeSelection", this.$onSelectionChange);
            }
            this.session = session;
            if (session) {
                this.$onDocumentChange = this.onDocumentChange.bind(this);
                session.on("change", this.$onDocumentChange);
                this.renderer.setSession(session);
                this.$onChangeMode = this.onChangeMode.bind(this);
                session.on("changeMode", this.$onChangeMode);
                this.$onTokenizerUpdate = this.onTokenizerUpdate.bind(this);
                session.on("tokenizerUpdate", this.$onTokenizerUpdate);
                this.$onChangeTabSize = this.renderer.onChangeTabSize.bind(this.renderer);
                session.on("changeTabSize", this.$onChangeTabSize);
                this.$onChangeWrapLimit = this.onChangeWrapLimit.bind(this);
                session.on("changeWrapLimit", this.$onChangeWrapLimit);
                this.$onChangeWrapMode = this.onChangeWrapMode.bind(this);
                session.on("changeWrapMode", this.$onChangeWrapMode);
                this.$onChangeFold = this.onChangeFold.bind(this);
                session.on("changeFold", this.$onChangeFold);
                this.$onChangeFrontMarker = this.onChangeFrontMarker.bind(this);
                session.on("changeFrontMarker", this.$onChangeFrontMarker);
                this.$onChangeBackMarker = this.onChangeBackMarker.bind(this);
                session.on("changeBackMarker", this.$onChangeBackMarker);
                this.$onChangeBreakpoint = this.onChangeBreakpoint.bind(this);
                session.on("changeBreakpoint", this.$onChangeBreakpoint);
                this.$onChangeAnnotation = this.onChangeAnnotation.bind(this);
                session.on("changeAnnotation", this.$onChangeAnnotation);
                this.$onCursorChange = this.onCursorChange.bind(this);
                session.on("changeOverwrite", this.$onCursorChange);
                this.$onScrollTopChange = this.onScrollTopChange.bind(this);
                session.on("changeScrollTop", this.$onScrollTopChange);
                this.$onScrollLeftChange = this.onScrollLeftChange.bind(this);
                session.on("changeScrollLeft", this.$onScrollLeftChange);
                this.selection = session.getSelection();
                this.selection.on("changeCursor", this.$onCursorChange);
                this.$onSelectionChange = this.onSelectionChange.bind(this);
                this.selection.on("changeSelection", this.$onSelectionChange);
                this.onChangeMode(void 0, this.session);
                this.$blockScrolling += 1;
                this.onCursorChange(void 0, this.session);
                this.$blockScrolling -= 1;
                this.onScrollTopChange(void 0, this.session);
                this.onScrollLeftChange(void 0, this.session);
                this.onSelectionChange(void 0, this.selection);
                this.onChangeFrontMarker(void 0, this.session);
                this.onChangeBackMarker(void 0, this.session);
                this.onChangeBreakpoint(void 0, this.session);
                this.onChangeAnnotation(void 0, this.session);
                session.getUseWrapMode() && this.renderer.adjustWrapLimit();
                this.renderer.updateFull();
            }
            this._signal("changeSession", {
                session: session,
                oldSession: oldSession
            });
            oldSession && oldSession._signal("changeEditor", { oldEditor: this });
            session && session._signal("changeEditor", { editor: this });
        };
        /**
         * Returns the current session being used.
         * @returns {EditSession}
         **/
        Editor.prototype.getSession = function () {
            return this.session;
        };
        /**
         * Sets the current document to `val`.
         * @param {String} val The new value to set for the document
         * @param {Number} cursorPos Where to set the new value. `undefined` or 0 is selectAll, -1 is at the document start, and +1 is at the end
         *
         * @returns {String} The current document value
         * @related Document.setValue
         **/
        Editor.prototype.setValue = function (val, cursorPos) {
            this.session.doc.setValue(val);
            if (!cursorPos) {
                this.selectAll();
            }
            else if (cursorPos == +1) {
                this.navigateFileEnd();
            }
            else if (cursorPos == -1) {
                this.navigateFileStart();
            }
            // TODO: Rather crazy! Either return this or the former value?
            return val;
        };
        /**
         * Returns the current session's content.
         *
         * @returns {String}
         * @related EditSession.getValue
         **/
        Editor.prototype.getValue = function () {
            return this.session.getValue();
        };
        /**
         *
         * Returns the currently highlighted selection.
         * @returns {String} The highlighted selection
         **/
        Editor.prototype.getSelection = function () {
            return this.selection;
        };
        /**
         * @method resize
         * @param [force] {boolean} force If `true`, recomputes the size, even if the height and width haven't changed.
         * @return {void}
         */
        Editor.prototype.resize = function (force) {
            this.renderer.onResize(force);
        };
        /**
         * {:VirtualRenderer.setTheme}
         * @param {String} theme The path to a theme
         * @param {Function} cb optional callback called when theme is loaded
         **/
        Editor.prototype.setTheme = function (theme, cb) {
            this.renderer.setTheme(theme, cb);
        };
        /**
         * {:VirtualRenderer.getTheme}
         *
         * @returns {String} The set theme
         * @related VirtualRenderer.getTheme
         **/
        Editor.prototype.getTheme = function () {
            return this.renderer.getTheme();
        };
        /**
         * {:VirtualRenderer.setStyle}
         * @param {String} style A class name
         *
         * @related VirtualRenderer.setStyle
         **/
        Editor.prototype.setStyle = function (style) {
            this.renderer.setStyle(style);
        };
        /**
         * {:VirtualRenderer.unsetStyle}
         * @related VirtualRenderer.unsetStyle
         **/
        Editor.prototype.unsetStyle = function (style) {
            this.renderer.unsetStyle(style);
        };
        /**
         * Gets the current font size of the editor text.
         */
        Editor.prototype.getFontSize = function () {
            return this.getOption("fontSize") || dom_1.computedStyle(this.container, "fontSize");
        };
        /**
         * Set a new font size (in pixels) for the editor text.
         * @param {string} fontSize A font size ( _e.g._ "12px")
         *
         *
         **/
        Editor.prototype.setFontSize = function (fontSize) {
            this.setOption("fontSize", fontSize);
        };
        Editor.prototype.$highlightBrackets = function () {
            if (this.session.$bracketHighlight) {
                this.session.removeMarker(this.session.$bracketHighlight);
                this.session.$bracketHighlight = void 0;
            }
            if (this.$highlightPending) {
                return;
            }
            // perform highlight async to not block the browser during navigation
            var self = this;
            this.$highlightPending = true;
            setTimeout(function () {
                self.$highlightPending = false;
                var pos = self.session.findMatchingBracket(self.getCursorPosition());
                if (pos) {
                    var range = new Range_1.default(pos.row, pos.column, pos.row, pos.column + 1);
                }
                else if (self.session.$mode.getMatching) {
                    var range = self.session.$mode.getMatching(self.session);
                }
                if (range)
                    self.session.$bracketHighlight = self.session.addMarker(range, "ace_bracket", "text");
            }, 50);
        };
        // todo: move to mode.getMatching
        Editor.prototype.$highlightTags = function () {
            var session = this.session;
            if (this.$highlightTagPending) {
                return;
            }
            // perform highlight async to not block the browser during navigation
            var self = this;
            this.$highlightTagPending = true;
            setTimeout(function () {
                self.$highlightTagPending = false;
                var pos = self.getCursorPosition();
                var iterator = new TokenIterator_1.default(self.session, pos.row, pos.column);
                var token = iterator.getCurrentToken();
                if (!token || token.type.indexOf('tag-name') === -1) {
                    session.removeMarker(session.$tagHighlight);
                    session.$tagHighlight = null;
                    return;
                }
                var tag = token.value;
                var depth = 0;
                var prevToken = iterator.stepBackward();
                if (prevToken.value == '<') {
                    //find closing tag
                    do {
                        prevToken = token;
                        token = iterator.stepForward();
                        if (token && token.value === tag && token.type.indexOf('tag-name') !== -1) {
                            if (prevToken.value === '<') {
                                depth++;
                            }
                            else if (prevToken.value === '</') {
                                depth--;
                            }
                        }
                    } while (token && depth >= 0);
                }
                else {
                    //find opening tag
                    do {
                        token = prevToken;
                        prevToken = iterator.stepBackward();
                        if (token && token.value === tag && token.type.indexOf('tag-name') !== -1) {
                            if (prevToken.value === '<') {
                                depth++;
                            }
                            else if (prevToken.value === '</') {
                                depth--;
                            }
                        }
                    } while (prevToken && depth <= 0);
                    //select tag again
                    iterator.stepForward();
                }
                if (!token) {
                    session.removeMarker(session.$tagHighlight);
                    session.$tagHighlight = null;
                    return;
                }
                var row = iterator.getCurrentTokenRow();
                var column = iterator.getCurrentTokenColumn();
                var range = new Range_1.default(row, column, row, column + token.value.length);
                //remove range if different
                if (session.$tagHighlight && range.compareRange(session.$backMarkers[session.$tagHighlight].range) !== 0) {
                    session.removeMarker(session.$tagHighlight);
                    session.$tagHighlight = null;
                }
                if (range && !session.$tagHighlight)
                    session.$tagHighlight = session.addMarker(range, "ace_bracket", "text");
            }, 50);
        };
        /**
         *
         * Brings the current `textInput` into focus.
         **/
        Editor.prototype.focus = function () {
            // Safari needs the timeout
            // iOS and Firefox need it called immediately
            // to be on the save side we do both
            var _self = this;
            setTimeout(function () {
                _self.textInput.focus();
            });
            this.textInput.focus();
        };
        /**
         * Returns `true` if the current `textInput` is in focus.
         * @return {Boolean}
         **/
        Editor.prototype.isFocused = function () {
            return this.textInput.isFocused();
        };
        /**
         *
         * Blurs the current `textInput`.
         **/
        Editor.prototype.blur = function () {
            this.textInput.blur();
        };
        /**
         * Emitted once the editor comes into focus.
         * @event focus
         *
         **/
        Editor.prototype.onFocus = function () {
            if (this.$isFocused) {
                return;
            }
            this.$isFocused = true;
            this.renderer.showCursor();
            this.renderer.visualizeFocus();
            this._emit("focus");
        };
        /**
         * Emitted once the editor has been blurred.
         * @event blur
         *
         *
         **/
        Editor.prototype.onBlur = function () {
            if (!this.$isFocused) {
                return;
            }
            this.$isFocused = false;
            this.renderer.hideCursor();
            this.renderer.visualizeBlur();
            this._emit("blur");
        };
        Editor.prototype.$cursorChange = function () {
            this.renderer.updateCursor();
        };
        /**
         * Emitted whenever the document is changed.
         * @event change
         * @param {Object} e Contains a single property, `data`, which has the delta of changes
         *
         **/
        Editor.prototype.onDocumentChange = function (e, editSession) {
            var delta = e.data;
            var range = delta.range;
            var lastRow;
            if (range.start.row == range.end.row && delta.action != "insertLines" && delta.action != "removeLines")
                lastRow = range.end.row;
            else
                lastRow = Infinity;
            var r = this.renderer;
            r.updateLines(range.start.row, lastRow, this.session.$useWrapMode);
            this._signal("change", e);
            // update cursor because tab characters can influence the cursor position
            this.$cursorChange();
            this.$updateHighlightActiveLine();
        };
        Editor.prototype.onTokenizerUpdate = function (event, editSession) {
            var rows = event.data;
            this.renderer.updateLines(rows.first, rows.last);
        };
        Editor.prototype.onScrollTopChange = function (event, editSession) {
            this.renderer.scrollToY(this.session.getScrollTop());
        };
        Editor.prototype.onScrollLeftChange = function (event, editSession) {
            this.renderer.scrollToX(this.session.getScrollLeft());
        };
        /**
         * Handler for cursor or selection changes.
         */
        Editor.prototype.onCursorChange = function (event, editSession) {
            this.$cursorChange();
            if (!this.$blockScrolling) {
                this.renderer.scrollCursorIntoView();
            }
            this.$highlightBrackets();
            this.$highlightTags();
            this.$updateHighlightActiveLine();
            // TODO; How is signal different from emit?
            this._signal("changeSelection");
        };
        Editor.prototype.$updateHighlightActiveLine = function () {
            var session = this.session;
            var renderer = this.renderer;
            var highlight;
            if (this.$highlightActiveLine) {
                if ((this.$selectionStyle != "line" || !this.selection.isMultiLine())) {
                    highlight = this.getCursorPosition();
                }
                if (renderer.$maxLines && session.getLength() === 1 && !(renderer.$minLines > 1)) {
                    highlight = false;
                }
            }
            if (session.$highlightLineMarker && !highlight) {
                session.removeMarker(session.$highlightLineMarker.markerId);
                session.$highlightLineMarker = null;
            }
            else if (!session.$highlightLineMarker && highlight) {
                var range = new Range_1.default(highlight.row, highlight.column, highlight.row, Infinity);
                range.markerId = session.addMarker(range, "ace_active-line", "screenLine");
                session.$highlightLineMarker = range;
            }
            else if (highlight) {
                session.$highlightLineMarker.start.row = highlight.row;
                session.$highlightLineMarker.end.row = highlight.row;
                session.$highlightLineMarker.start.column = highlight.column;
                session._signal("changeBackMarker");
            }
        };
        // This version has not been bound to `this`, so don't use it directly.
        Editor.prototype.onSelectionChange = function (event, selection) {
            var session = this.session;
            if (typeof session.$selectionMarker === 'number') {
                session.removeMarker(session.$selectionMarker);
                session.$selectionMarker = null;
            }
            if (!this.selection.isEmpty()) {
                var range = this.selection.getRange();
                var style = this.getSelectionStyle();
                session.$selectionMarker = session.addMarker(range, "ace_selection", style);
            }
            else {
                this.$updateHighlightActiveLine();
            }
            var re = this.$highlightSelectedWord && this.$getSelectionHighLightRegexp();
            this.session.highlight(re);
            this._signal("changeSelection");
        };
        Editor.prototype.$getSelectionHighLightRegexp = function () {
            var session = this.session;
            var selection = this.getSelectionRange();
            if (selection.isEmpty() || selection.isMultiLine())
                return;
            var startOuter = selection.start.column - 1;
            var endOuter = selection.end.column + 1;
            var line = session.getLine(selection.start.row);
            var lineCols = line.length;
            var needle = line.substring(Math.max(startOuter, 0), Math.min(endOuter, lineCols));
            // Make sure the outer characters are not part of the word.
            if ((startOuter >= 0 && /^[\w\d]/.test(needle)) ||
                (endOuter <= lineCols && /[\w\d]$/.test(needle)))
                return;
            needle = line.substring(selection.start.column, selection.end.column);
            if (!/^[\w\d]+$/.test(needle))
                return;
            var re = this.$search.$assembleRegExp({
                wholeWord: true,
                caseSensitive: true,
                needle: needle
            });
            return re;
        };
        Editor.prototype.onChangeFrontMarker = function (event, editSession) {
            this.renderer.updateFrontMarkers();
        };
        Editor.prototype.onChangeBackMarker = function (event, editSession) {
            this.renderer.updateBackMarkers();
        };
        Editor.prototype.onChangeBreakpoint = function (event, editSession) {
            this.renderer.updateBreakpoints();
            this._emit("changeBreakpoint", event);
        };
        Editor.prototype.onChangeAnnotation = function (event, editSession) {
            this.renderer.setAnnotations(editSession.getAnnotations());
            this._emit("changeAnnotation", event);
        };
        Editor.prototype.onChangeMode = function (event, editSession) {
            this.renderer.updateText();
            this._emit("changeMode", event);
        };
        Editor.prototype.onChangeWrapLimit = function (event, editSession) {
            this.renderer.updateFull();
        };
        Editor.prototype.onChangeWrapMode = function (event, editSession) {
            this.renderer.onResize(true);
        };
        Editor.prototype.onChangeFold = function (event, editSession) {
            // Update the active line marker as due to folding changes the current
            // line range on the screen might have changed.
            this.$updateHighlightActiveLine();
            // TODO: This might be too much updating. Okay for now.
            this.renderer.updateFull();
        };
        /**
         * Returns the string of text currently highlighted.
         * @returns {String}
         **/
        Editor.prototype.getSelectedText = function () {
            return this.session.getTextRange(this.getSelectionRange());
        };
        /**
         * Emitted when text is copied.
         * @event copy
         * @param {String} text The copied text
         *
         **/
        /**
         * Returns the string of text currently highlighted.
         * @returns {String}
         * @deprecated Use getSelectedText instead.
         **/
        Editor.prototype.getCopyText = function () {
            var text = this.getSelectedText();
            this._signal("copy", text);
            return text;
        };
        /**
         * Called whenever a text "copy" happens.
         **/
        Editor.prototype.onCopy = function () {
            this.commands.exec("copy", this);
        };
        /**
         * Called whenever a text "cut" happens.
         **/
        Editor.prototype.onCut = function () {
            this.commands.exec("cut", this);
        };
        /**
         * Emitted when text is pasted.
         * @event paste
         * @param {String} text The pasted text
         *
         *
         **/
        /**
         * Called whenever a text "paste" happens.
         * @param {String} text The pasted text
         *
         *
         **/
        Editor.prototype.onPaste = function (text) {
            // todo this should change when paste becomes a command
            if (this.$readOnly)
                return;
            var e = { text: text };
            this._signal("paste", e);
            this.insert(e.text, true);
        };
        Editor.prototype.execCommand = function (command, args) {
            this.commands.exec(command, this, args);
        };
        /**
         * Inserts `text` into wherever the cursor is pointing.
         * @param {String} text The new text to add
         *
         **/
        Editor.prototype.insert = function (text, pasted) {
            var session = this.session;
            var mode = session.getMode();
            var cursor = this.getCursorPosition();
            if (this.getBehavioursEnabled() && !pasted) {
                // Get a transform if the current mode wants one.
                var transform = mode.transformAction(session.getState(cursor.row), 'insertion', this, session, text);
                if (transform) {
                    if (text !== transform.text) {
                        this.session.mergeUndoDeltas = false;
                        this.$mergeNextCommand = false;
                    }
                    text = transform.text;
                }
            }
            if (text === "\t") {
                text = this.session.getTabString();
            }
            // remove selected text
            if (!this.selection.isEmpty()) {
                var range = this.getSelectionRange();
                cursor = this.session.remove(range);
                this.clearSelection();
            }
            else if (this.session.getOverwrite()) {
                var range = Range_1.default.fromPoints(cursor, cursor);
                range.end.column += text.length;
                this.session.remove(range);
            }
            if (text === "\n" || text === "\r\n") {
                var line = session.getLine(cursor.row);
                if (cursor.column > line.search(/\S|$/)) {
                    var d = line.substr(cursor.column).search(/\S|$/);
                    session.doc.removeInLine(cursor.row, cursor.column, cursor.column + d);
                }
            }
            this.clearSelection();
            var start = cursor.column;
            var lineState = session.getState(cursor.row);
            var line = session.getLine(cursor.row);
            var shouldOutdent = mode.checkOutdent(lineState, line, text);
            var end = session.insert(cursor, text);
            if (transform && transform.selection) {
                if (transform.selection.length == 2) {
                    this.selection.setSelectionRange(new Range_1.default(cursor.row, start + transform.selection[0], cursor.row, start + transform.selection[1]));
                }
                else {
                    this.selection.setSelectionRange(new Range_1.default(cursor.row + transform.selection[0], transform.selection[1], cursor.row + transform.selection[2], transform.selection[3]));
                }
            }
            if (session.getDocument().isNewLine(text)) {
                var lineIndent = mode.getNextLineIndent(lineState, line.slice(0, cursor.column), session.getTabString());
                session.insert({ row: cursor.row + 1, column: 0 }, lineIndent);
            }
            if (shouldOutdent) {
                mode.autoOutdent(lineState, session, cursor.row);
            }
        };
        Editor.prototype.onTextInput = function (text) {
            this.keyBinding.onTextInput(text);
            // TODO: This should be pluggable.
            if (text === '.') {
                this.commands.exec(editor_protocol_1.COMMAND_NAME_AUTO_COMPLETE);
            }
            else if (this.getSession().getDocument().isNewLine(text)) {
                var lineNumber = this.getCursorPosition().row;
            }
        };
        Editor.prototype.onCommandKey = function (e, hashId, keyCode) {
            this.keyBinding.onCommandKey(e, hashId, keyCode);
        };
        /**
         * Pass in `true` to enable overwrites in your session, or `false` to disable. If overwrites is enabled, any text you enter will type over any text after it. If the value of `overwrite` changes, this function also emites the `changeOverwrite` event.
         * @param {Boolean} overwrite Defines wheter or not to set overwrites
         *
         *
         * @related EditSession.setOverwrite
         **/
        Editor.prototype.setOverwrite = function (overwrite) {
            this.session.setOverwrite(overwrite);
        };
        /**
         * Returns `true` if overwrites are enabled; `false` otherwise.
         * @returns {Boolean}
         * @related EditSession.getOverwrite
         **/
        Editor.prototype.getOverwrite = function () {
            return this.session.getOverwrite();
        };
        /**
         * Sets the value of overwrite to the opposite of whatever it currently is.
         * @related EditSession.toggleOverwrite
         **/
        Editor.prototype.toggleOverwrite = function () {
            this.session.toggleOverwrite();
        };
        /**
         * Sets how fast the mouse scrolling should do.
         * @param {Number} speed A value indicating the new speed (in milliseconds)
         **/
        Editor.prototype.setScrollSpeed = function (speed) {
            this.setOption("scrollSpeed", speed);
        };
        /**
         * Returns the value indicating how fast the mouse scroll speed is (in milliseconds).
         * @returns {Number}
         **/
        Editor.prototype.getScrollSpeed = function () {
            return this.getOption("scrollSpeed");
        };
        /**
         * Sets the delay (in milliseconds) of the mouse drag.
         * @param {Number} dragDelay A value indicating the new delay
         **/
        Editor.prototype.setDragDelay = function (dragDelay) {
            this.setOption("dragDelay", dragDelay);
        };
        /**
         * Returns the current mouse drag delay.
         * @returns {Number}
         **/
        Editor.prototype.getDragDelay = function () {
            return this.getOption("dragDelay");
        };
        /**
         * Emitted when the selection style changes, via [[Editor.setSelectionStyle]].
         * @event changeSelectionStyle
         * @param {Object} data Contains one property, `data`, which indicates the new selection style
         **/
        /**
         * Draw selection markers spanning whole line, or only over selected text. Default value is "line"
         * @param {String} style The new selection style "line"|"text"
         *
         **/
        Editor.prototype.setSelectionStyle = function (val) {
            this.setOption("selectionStyle", val);
        };
        /**
         * Returns the current selection style.
         * @returns {String}
         **/
        Editor.prototype.getSelectionStyle = function () {
            return this.getOption("selectionStyle");
        };
        /**
         * Determines whether or not the current line should be highlighted.
         * @param {Boolean} shouldHighlight Set to `true` to highlight the current line
         **/
        Editor.prototype.setHighlightActiveLine = function (shouldHighlight) {
            this.setOption("highlightActiveLine", shouldHighlight);
        };
        /**
         * Returns `true` if current lines are always highlighted.
         * @return {Boolean}
         **/
        Editor.prototype.getHighlightActiveLine = function () {
            return this.getOption("highlightActiveLine");
        };
        Editor.prototype.setHighlightGutterLine = function (shouldHighlight) {
            this.setOption("highlightGutterLine", shouldHighlight);
        };
        Editor.prototype.getHighlightGutterLine = function () {
            return this.getOption("highlightGutterLine");
        };
        /**
         * Determines if the currently selected word should be highlighted.
         * @param {Boolean} shouldHighlight Set to `true` to highlight the currently selected word
         *
         **/
        Editor.prototype.setHighlightSelectedWord = function (shouldHighlight) {
            this.setOption("highlightSelectedWord", shouldHighlight);
        };
        /**
         * Returns `true` if currently highlighted words are to be highlighted.
         * @returns {Boolean}
         **/
        Editor.prototype.getHighlightSelectedWord = function () {
            return this.$highlightSelectedWord;
        };
        Editor.prototype.setAnimatedScroll = function (shouldAnimate) {
            this.renderer.setAnimatedScroll(shouldAnimate);
        };
        Editor.prototype.getAnimatedScroll = function () {
            return this.renderer.getAnimatedScroll();
        };
        /**
         * If `showInvisibles` is set to `true`, invisible characters&mdash;like spaces or new lines&mdash;are show in the editor.
         * @param {Boolean} showInvisibles Specifies whether or not to show invisible characters
         *
         **/
        Editor.prototype.setShowInvisibles = function (showInvisibles) {
            this.renderer.setShowInvisibles(showInvisibles);
        };
        /**
         * Returns `true` if invisible characters are being shown.
         * @returns {Boolean}
         **/
        Editor.prototype.getShowInvisibles = function () {
            return this.renderer.getShowInvisibles();
        };
        Editor.prototype.setDisplayIndentGuides = function (displayIndentGuides) {
            this.renderer.setDisplayIndentGuides(displayIndentGuides);
        };
        Editor.prototype.getDisplayIndentGuides = function () {
            return this.renderer.getDisplayIndentGuides();
        };
        /**
         * If `showPrintMargin` is set to `true`, the print margin is shown in the editor.
         * @param {Boolean} showPrintMargin Specifies whether or not to show the print margin
         **/
        Editor.prototype.setShowPrintMargin = function (showPrintMargin) {
            this.renderer.setShowPrintMargin(showPrintMargin);
        };
        /**
         * Returns `true` if the print margin is being shown.
         * @returns {Boolean}
         */
        Editor.prototype.getShowPrintMargin = function () {
            return this.renderer.getShowPrintMargin();
        };
        /**
         * Sets the column defining where the print margin should be.
         * @param {Number} showPrintMargin Specifies the new print margin
         */
        Editor.prototype.setPrintMarginColumn = function (showPrintMargin) {
            this.renderer.setPrintMarginColumn(showPrintMargin);
        };
        /**
         * Returns the column number of where the print margin is.
         * @returns {Number}
         */
        Editor.prototype.getPrintMarginColumn = function () {
            return this.renderer.getPrintMarginColumn();
        };
        /**
         * If `readOnly` is true, then the editor is set to read-only mode, and none of the content can change.
         * @param {Boolean} readOnly Specifies whether the editor can be modified or not
         *
         **/
        Editor.prototype.setReadOnly = function (readOnly) {
            this.setOption("readOnly", readOnly);
        };
        /**
         * Returns `true` if the editor is set to read-only mode.
         * @returns {Boolean}
         **/
        Editor.prototype.getReadOnly = function () {
            return this.getOption("readOnly");
        };
        /**
         * Specifies whether to use behaviors or not. ["Behaviors" in this case is the auto-pairing of special characters, like quotation marks, parenthesis, or brackets.]{: #BehaviorsDef}
         * @param {Boolean} enabled Enables or disables behaviors
         *
         **/
        Editor.prototype.setBehavioursEnabled = function (enabled) {
            this.setOption("behavioursEnabled", enabled);
        };
        /**
         * Returns `true` if the behaviors are currently enabled. {:BehaviorsDef}
         *
         * @returns {Boolean}
         **/
        Editor.prototype.getBehavioursEnabled = function () {
            return this.getOption("behavioursEnabled");
        };
        /**
         * Specifies whether to use wrapping behaviors or not, i.e. automatically wrapping the selection with characters such as brackets
         * when such a character is typed in.
         * @param {Boolean} enabled Enables or disables wrapping behaviors
         *
         **/
        Editor.prototype.setWrapBehavioursEnabled = function (enabled) {
            this.setOption("wrapBehavioursEnabled", enabled);
        };
        /**
         * Returns `true` if the wrapping behaviors are currently enabled.
         **/
        Editor.prototype.getWrapBehavioursEnabled = function () {
            return this.getOption("wrapBehavioursEnabled");
        };
        /**
         * Indicates whether the fold widgets should be shown or not.
         * @param {Boolean} show Specifies whether the fold widgets are shown
         **/
        Editor.prototype.setShowFoldWidgets = function (show) {
            this.setOption("showFoldWidgets", show);
        };
        /**
         * Returns `true` if the fold widgets are shown.
         * @return {Boolean}
         */
        Editor.prototype.getShowFoldWidgets = function () {
            return this.getOption("showFoldWidgets");
        };
        Editor.prototype.setFadeFoldWidgets = function (fade) {
            this.setOption("fadeFoldWidgets", fade);
        };
        Editor.prototype.getFadeFoldWidgets = function () {
            return this.getOption("fadeFoldWidgets");
        };
        /**
         * Removes words of text from the editor. A "word" is defined as a string of characters bookended by whitespace.
         * @param {String} direction The direction of the deletion to occur, either "left" or "right"
         *
         **/
        Editor.prototype.remove = function (direction) {
            if (this.selection.isEmpty()) {
                if (direction == "left")
                    this.selection.selectLeft();
                else
                    this.selection.selectRight();
            }
            var range = this.getSelectionRange();
            if (this.getBehavioursEnabled()) {
                var session = this.session;
                var state = session.getState(range.start.row);
                var new_range = session.getMode().transformAction(state, 'deletion', this, session, range);
                if (range.end.column === 0) {
                    var text = session.getTextRange(range);
                    if (text[text.length - 1] == "\n") {
                        var line = session.getLine(range.end.row);
                        if (/^\s+$/.test(line)) {
                            range.end.column = line.length;
                        }
                    }
                }
                if (new_range)
                    range = new_range;
            }
            this.session.remove(range);
            this.clearSelection();
        };
        /**
         * Removes the word directly to the right of the current selection.
         **/
        Editor.prototype.removeWordRight = function () {
            if (this.selection.isEmpty())
                this.selection.selectWordRight();
            this.session.remove(this.getSelectionRange());
            this.clearSelection();
        };
        /**
         * Removes the word directly to the left of the current selection.
         **/
        Editor.prototype.removeWordLeft = function () {
            if (this.selection.isEmpty())
                this.selection.selectWordLeft();
            this.session.remove(this.getSelectionRange());
            this.clearSelection();
        };
        /**
         * Removes all the words to the left of the current selection, until the start of the line.
         **/
        Editor.prototype.removeToLineStart = function () {
            if (this.selection.isEmpty())
                this.selection.selectLineStart();
            this.session.remove(this.getSelectionRange());
            this.clearSelection();
        };
        /**
         * Removes all the words to the right of the current selection, until the end of the line.
         **/
        Editor.prototype.removeToLineEnd = function () {
            if (this.selection.isEmpty())
                this.selection.selectLineEnd();
            var range = this.getSelectionRange();
            if (range.start.column === range.end.column && range.start.row === range.end.row) {
                range.end.column = 0;
                range.end.row++;
            }
            this.session.remove(range);
            this.clearSelection();
        };
        /**
         * Splits the line at the current selection (by inserting an `'\n'`).
         **/
        Editor.prototype.splitLine = function () {
            if (!this.selection.isEmpty()) {
                this.session.remove(this.getSelectionRange());
                this.clearSelection();
            }
            var cursor = this.getCursorPosition();
            this.insert("\n");
            this.moveCursorToPosition(cursor);
        };
        /**
         * Transposes current line.
         **/
        Editor.prototype.transposeLetters = function () {
            if (!this.selection.isEmpty()) {
                return;
            }
            var cursor = this.getCursorPosition();
            var column = cursor.column;
            if (column === 0)
                return;
            var line = this.session.getLine(cursor.row);
            var swap, range;
            if (column < line.length) {
                swap = line.charAt(column) + line.charAt(column - 1);
                range = new Range_1.default(cursor.row, column - 1, cursor.row, column + 1);
            }
            else {
                swap = line.charAt(column - 1) + line.charAt(column - 2);
                range = new Range_1.default(cursor.row, column - 2, cursor.row, column);
            }
            this.session.replace(range, swap);
        };
        /**
         * Converts the current selection entirely into lowercase.
         **/
        Editor.prototype.toLowerCase = function () {
            var originalRange = this.getSelectionRange();
            if (this.selection.isEmpty()) {
                this.selection.selectWord();
            }
            var range = this.getSelectionRange();
            var text = this.session.getTextRange(range);
            this.session.replace(range, text.toLowerCase());
            this.selection.setSelectionRange(originalRange);
        };
        /**
         * Converts the current selection entirely into uppercase.
         **/
        Editor.prototype.toUpperCase = function () {
            var originalRange = this.getSelectionRange();
            if (this.selection.isEmpty()) {
                this.selection.selectWord();
            }
            var range = this.getSelectionRange();
            var text = this.session.getTextRange(range);
            this.session.replace(range, text.toUpperCase());
            this.selection.setSelectionRange(originalRange);
        };
        /**
         * Inserts an indentation into the current cursor position or indents the selected lines.
         *
         * @related EditSession.indentRows
         **/
        Editor.prototype.indent = function () {
            var session = this.session;
            var range = this.getSelectionRange();
            if (range.start.row < range.end.row) {
                var rows = this.$getSelectedRows();
                session.indentRows(rows.first, rows.last, "\t");
                return;
            }
            else if (range.start.column < range.end.column) {
                var text = session.getTextRange(range);
                if (!/^\s+$/.test(text)) {
                    var rows = this.$getSelectedRows();
                    session.indentRows(rows.first, rows.last, "\t");
                    return;
                }
            }
            var line = session.getLine(range.start.row);
            var position = range.start;
            var size = session.getTabSize();
            var column = session.documentToScreenColumn(position.row, position.column);
            if (this.session.getUseSoftTabs()) {
                var count = (size - column % size);
                var indentString = lang_1.stringRepeat(" ", count);
            }
            else {
                var count = column % size;
                while (line[range.start.column] == " " && count) {
                    range.start.column--;
                    count--;
                }
                this.selection.setSelectionRange(range);
                indentString = "\t";
            }
            return this.insert(indentString);
        };
        /**
         * Indents the current line.
         * @related EditSession.indentRows
         **/
        Editor.prototype.blockIndent = function () {
            var rows = this.$getSelectedRows();
            this.session.indentRows(rows.first, rows.last, "\t");
        };
        /**
         * Outdents the current line.
         * @related EditSession.outdentRows
         **/
        Editor.prototype.blockOutdent = function () {
            var selection = this.session.getSelection();
            this.session.outdentRows(selection.getRange());
        };
        // TODO: move out of core when we have good mechanism for managing extensions
        Editor.prototype.sortLines = function () {
            var rows = this.$getSelectedRows();
            var session = this.session;
            var lines = [];
            for (i = rows.first; i <= rows.last; i++)
                lines.push(session.getLine(i));
            lines.sort(function (a, b) {
                if (a.toLowerCase() < b.toLowerCase())
                    return -1;
                if (a.toLowerCase() > b.toLowerCase())
                    return 1;
                return 0;
            });
            var deleteRange = new Range_1.default(0, 0, 0, 0);
            for (var i = rows.first; i <= rows.last; i++) {
                var line = session.getLine(i);
                deleteRange.start.row = i;
                deleteRange.end.row = i;
                deleteRange.end.column = line.length;
                session.replace(deleteRange, lines[i - rows.first]);
            }
        };
        /**
         * Given the currently selected range, this function either comments all the lines, or uncomments all of them.
         **/
        Editor.prototype.toggleCommentLines = function () {
            var state = this.session.getState(this.getCursorPosition().row);
            var rows = this.$getSelectedRows();
            this.session.getMode().toggleCommentLines(state, this.session, rows.first, rows.last);
        };
        Editor.prototype.toggleBlockComment = function () {
            var cursor = this.getCursorPosition();
            var state = this.session.getState(cursor.row);
            var range = this.getSelectionRange();
            this.session.getMode().toggleBlockComment(state, this.session, range, cursor);
        };
        /**
         * Works like [[EditSession.getTokenAt]], except it returns a number.
         * @returns {Number}
         **/
        Editor.prototype.getNumberAt = function (row, column) {
            var _numberRx = /[\-]?[0-9]+(?:\.[0-9]+)?/g;
            _numberRx.lastIndex = 0;
            var s = this.session.getLine(row);
            while (_numberRx.lastIndex < column) {
                var m = _numberRx.exec(s);
                if (m.index <= column && m.index + m[0].length >= column) {
                    var retval = {
                        value: m[0],
                        start: m.index,
                        end: m.index + m[0].length
                    };
                    return retval;
                }
            }
            return null;
        };
        /**
         * If the character before the cursor is a number, this functions changes its value by `amount`.
         * @param {Number} amount The value to change the numeral by (can be negative to decrease value)
         */
        Editor.prototype.modifyNumber = function (amount) {
            var row = this.selection.getCursor().row;
            var column = this.selection.getCursor().column;
            // get the char before the cursor
            var charRange = new Range_1.default(row, column - 1, row, column);
            var c = parseFloat(this.session.getTextRange(charRange));
            // if the char is a digit
            if (!isNaN(c) && isFinite(c)) {
                // get the whole number the digit is part of
                var nr = this.getNumberAt(row, column);
                // if number found
                if (nr) {
                    var fp = nr.value.indexOf(".") >= 0 ? nr.start + nr.value.indexOf(".") + 1 : nr.end;
                    var decimals = nr.start + nr.value.length - fp;
                    var t = parseFloat(nr.value);
                    t *= Math.pow(10, decimals);
                    if (fp !== nr.end && column < fp) {
                        amount *= Math.pow(10, nr.end - column - 1);
                    }
                    else {
                        amount *= Math.pow(10, nr.end - column);
                    }
                    t += amount;
                    t /= Math.pow(10, decimals);
                    var nnr = t.toFixed(decimals);
                    //update number
                    var replaceRange = new Range_1.default(row, nr.start, row, nr.end);
                    this.session.replace(replaceRange, nnr);
                    //reposition the cursor
                    this.moveCursorTo(row, Math.max(nr.start + 1, column + nnr.length - nr.value.length));
                }
            }
        };
        /**
         * Removes all the lines in the current selection
         * @related EditSession.remove
         **/
        Editor.prototype.removeLines = function () {
            var rows = this.$getSelectedRows();
            var range;
            if (rows.first === 0 || rows.last + 1 < this.session.getLength())
                range = new Range_1.default(rows.first, 0, rows.last + 1, 0);
            else
                range = new Range_1.default(rows.first - 1, this.session.getLine(rows.first - 1).length, rows.last, this.session.getLine(rows.last).length);
            this.session.remove(range);
            this.clearSelection();
        };
        Editor.prototype.duplicateSelection = function () {
            var sel = this.selection;
            var doc = this.session;
            var range = sel.getRange();
            var reverse = sel.isBackwards();
            if (range.isEmpty()) {
                var row = range.start.row;
                doc.duplicateLines(row, row);
            }
            else {
                var point = reverse ? range.start : range.end;
                var endPoint = doc.insert(point, doc.getTextRange(range));
                range.start = point;
                range.end = endPoint;
                sel.setSelectionRange(range, reverse);
            }
        };
        /**
         * Shifts all the selected lines down one row.
         *
         * @returns {Number} On success, it returns -1.
         * @related EditSession.moveLinesUp
         **/
        Editor.prototype.moveLinesDown = function () {
            this.$moveLines(function (firstRow, lastRow) {
                return this.session.moveLinesDown(firstRow, lastRow);
            });
        };
        /**
         * Shifts all the selected lines up one row.
         * @returns {Number} On success, it returns -1.
         * @related EditSession.moveLinesDown
         **/
        Editor.prototype.moveLinesUp = function () {
            this.$moveLines(function (firstRow, lastRow) {
                return this.session.moveLinesUp(firstRow, lastRow);
            });
        };
        /**
         * Moves a range of text from the given range to the given position. `toPosition` is an object that looks like this:
         * ```json
         *    { row: newRowLocation, column: newColumnLocation }
         * ```
         * @param {Range} fromRange The range of text you want moved within the document
         * @param {Object} toPosition The location (row and column) where you want to move the text to
         *
         * @returns {Range} The new range where the text was moved to.
         * @related EditSession.moveText
         **/
        Editor.prototype.moveText = function (range, toPosition, copy) {
            return this.session.moveText(range, toPosition, copy);
        };
        /**
         * Copies all the selected lines up one row.
         * @returns {Number} On success, returns 0.
         *
         **/
        Editor.prototype.copyLinesUp = function () {
            this.$moveLines(function (firstRow, lastRow) {
                this.session.duplicateLines(firstRow, lastRow);
                return 0;
            });
        };
        /**
         * Copies all the selected lines down one row.
         * @returns {Number} On success, returns the number of new rows added; in other words, `lastRow - firstRow + 1`.
         * @related EditSession.duplicateLines
         *
         **/
        Editor.prototype.copyLinesDown = function () {
            this.$moveLines(function (firstRow, lastRow) {
                return this.session.duplicateLines(firstRow, lastRow);
            });
        };
        /**
         * Executes a specific function, which can be anything that manipulates selected lines, such as copying them, duplicating them, or shifting them.
         * @param {Function} mover A method to call on each selected row
         *
         *
         **/
        Editor.prototype.$moveLines = function (mover) {
            var selection = this.selection;
            if (!selection['inMultiSelectMode'] || this.inVirtualSelectionMode) {
                var range = selection.toOrientedRange();
                var selectedRows = this.$getSelectedRows();
                var linesMoved = mover.call(this, selectedRows.first, selectedRows.last);
                range.moveBy(linesMoved, 0);
                selection.fromOrientedRange(range);
            }
            else {
                var ranges = selection.rangeList.ranges;
                selection.rangeList.detach();
                for (var i = ranges.length; i--;) {
                    var rangeIndex = i;
                    var collapsedRows = ranges[i].collapseRows();
                    var last = collapsedRows.end.row;
                    var first = collapsedRows.start.row;
                    while (i--) {
                        collapsedRows = ranges[i].collapseRows();
                        if (first - collapsedRows.end.row <= 1)
                            first = collapsedRows.end.row;
                        else
                            break;
                    }
                    i++;
                    var linesMoved = mover.call(this, first, last);
                    while (rangeIndex >= i) {
                        ranges[rangeIndex].moveBy(linesMoved, 0);
                        rangeIndex--;
                    }
                }
                selection.fromOrientedRange(selection.ranges[0]);
                selection.rangeList.attach(this.session);
            }
        };
        /**
         * Returns an object indicating the currently selected rows.
         *
         * @returns {Object}
         **/
        Editor.prototype.$getSelectedRows = function () {
            var range = this.getSelectionRange().collapseRows();
            return {
                first: this.session.getRowFoldStart(range.start.row),
                last: this.session.getRowFoldEnd(range.end.row)
            };
        };
        Editor.prototype.onCompositionStart = function (text) {
            this.renderer.showComposition(this.getCursorPosition());
        };
        Editor.prototype.onCompositionUpdate = function (text) {
            this.renderer.setCompositionText(text);
        };
        Editor.prototype.onCompositionEnd = function () {
            this.renderer.hideComposition();
        };
        /**
         * {:VirtualRenderer.getFirstVisibleRow}
         *
         * @returns {Number}
         * @related VirtualRenderer.getFirstVisibleRow
         **/
        Editor.prototype.getFirstVisibleRow = function () {
            return this.renderer.getFirstVisibleRow();
        };
        /**
         * {:VirtualRenderer.getLastVisibleRow}
         *
         * @returns {Number}
         * @related VirtualRenderer.getLastVisibleRow
         **/
        Editor.prototype.getLastVisibleRow = function () {
            return this.renderer.getLastVisibleRow();
        };
        /**
         * Indicates if the row is currently visible on the screen.
         * @param {Number} row The row to check
         *
         * @returns {Boolean}
         **/
        Editor.prototype.isRowVisible = function (row) {
            return (row >= this.getFirstVisibleRow() && row <= this.getLastVisibleRow());
        };
        /**
         * Indicates if the entire row is currently visible on the screen.
         * @param {Number} row The row to check
         *
         *
         * @returns {Boolean}
         **/
        Editor.prototype.isRowFullyVisible = function (row) {
            return (row >= this.renderer.getFirstFullyVisibleRow() && row <= this.renderer.getLastFullyVisibleRow());
        };
        /**
         * Returns the number of currently visibile rows.
         * @returns {Number}
         **/
        Editor.prototype.$getVisibleRowCount = function () {
            return this.renderer.getScrollBottomRow() - this.renderer.getScrollTopRow() + 1;
        };
        /**
         * FIXME: The semantics of select are not easily understood.
         * @param direction +1 for page down, -1 for page up. Maybe N for N pages?
         * @param select true | false | undefined
         */
        Editor.prototype.$moveByPage = function (direction, select) {
            var renderer = this.renderer;
            var config = this.renderer.layerConfig;
            var rows = direction * Math.floor(config.height / config.lineHeight);
            this.$blockScrolling++;
            if (select === true) {
                this.selection.$moveSelection(function () {
                    this.moveCursorBy(rows, 0);
                });
            }
            else if (select === false) {
                this.selection.moveCursorBy(rows, 0);
                this.selection.clearSelection();
            }
            this.$blockScrolling--;
            var scrollTop = renderer.scrollTop;
            renderer.scrollBy(0, rows * config.lineHeight);
            // Why don't we assert our args and do typeof select === 'undefined'?
            if (select != null) {
                // This is called when select is undefined.
                renderer.scrollCursorIntoView(null, 0.5);
            }
            renderer.animateScrolling(scrollTop);
        };
        /**
         * Selects the text from the current position of the document until where a "page down" finishes.
         **/
        Editor.prototype.selectPageDown = function () {
            this.$moveByPage(+1, true);
        };
        /**
         * Selects the text from the current position of the document until where a "page up" finishes.
         **/
        Editor.prototype.selectPageUp = function () {
            this.$moveByPage(-1, true);
        };
        /**
         * Shifts the document to wherever "page down" is, as well as moving the cursor position.
         **/
        Editor.prototype.gotoPageDown = function () {
            this.$moveByPage(+1, false);
        };
        /**
         * Shifts the document to wherever "page up" is, as well as moving the cursor position.
         **/
        Editor.prototype.gotoPageUp = function () {
            this.$moveByPage(-1, false);
        };
        /**
         * Scrolls the document to wherever "page down" is, without changing the cursor position.
         **/
        Editor.prototype.scrollPageDown = function () {
            this.$moveByPage(1);
        };
        /**
         * Scrolls the document to wherever "page up" is, without changing the cursor position.
         **/
        Editor.prototype.scrollPageUp = function () {
            this.$moveByPage(-1);
        };
        /**
         * Moves the editor to the specified row.
         * @related VirtualRenderer.scrollToRow
         */
        Editor.prototype.scrollToRow = function (row) {
            this.renderer.scrollToRow(row);
        };
        /**
         * Scrolls to a line. If `center` is `true`, it puts the line in middle of screen (or attempts to).
         * @param {Number} line The line to scroll to
         * @param {Boolean} center If `true`
         * @param {Boolean} animate If `true` animates scrolling
         * @param {Function} callback Function to be called when the animation has finished
         *
         *
         * @related VirtualRenderer.scrollToLine
         **/
        Editor.prototype.scrollToLine = function (line, center, animate, callback) {
            this.renderer.scrollToLine(line, center, animate, callback);
        };
        /**
         * Attempts to center the current selection on the screen.
         **/
        Editor.prototype.centerSelection = function () {
            var range = this.getSelectionRange();
            var pos = {
                row: Math.floor(range.start.row + (range.end.row - range.start.row) / 2),
                column: Math.floor(range.start.column + (range.end.column - range.start.column) / 2)
            };
            this.renderer.alignCursor(pos, 0.5);
        };
        /**
         * Gets the current position of the cursor.
         * @returns {Object} An object that looks something like this:
         *
         * ```json
         * { row: currRow, column: currCol }
         * ```
         *
         * @related Selection.getCursor
         **/
        Editor.prototype.getCursorPosition = function () {
            return this.selection.getCursor();
        };
        /**
         * Returns the screen position of the cursor.
         **/
        Editor.prototype.getCursorPositionScreen = function () {
            var cursor = this.getCursorPosition();
            return this.session.documentToScreenPosition(cursor.row, cursor.column);
        };
        /**
         * {:Selection.getRange}
         * @returns {Range}
         * @related Selection.getRange
         **/
        Editor.prototype.getSelectionRange = function () {
            return this.selection.getRange();
        };
        /**
         * Selects all the text in editor.
         * @related Selection.selectAll
         **/
        Editor.prototype.selectAll = function () {
            this.$blockScrolling += 1;
            this.selection.selectAll();
            this.$blockScrolling -= 1;
        };
        /**
         * {:Selection.clearSelection}
         * @related Selection.clearSelection
         **/
        Editor.prototype.clearSelection = function () {
            this.selection.clearSelection();
        };
        /**
         * Moves the cursor to the specified row and column. Note that this does not de-select the current selection.
         * @param {Number} row The new row number
         * @param {Number} column The new column number
         * @param {boolean} animate
         *
         * @related Selection.moveCursorTo
         **/
        Editor.prototype.moveCursorTo = function (row, column, animate) {
            this.selection.moveCursorTo(row, column, animate);
        };
        /**
         * Moves the cursor to the position indicated by `pos.row` and `pos.column`.
         * @param {Object} pos An object with two properties, row and column
         *
         *
         * @related Selection.moveCursorToPosition
         **/
        Editor.prototype.moveCursorToPosition = function (pos) {
            this.selection.moveCursorToPosition(pos);
        };
        /**
         * Moves the cursor's row and column to the next matching bracket or HTML tag.
         *
         **/
        Editor.prototype.jumpToMatching = function (select) {
            var cursor = this.getCursorPosition();
            var iterator = new TokenIterator_1.default(this.session, cursor.row, cursor.column);
            var prevToken = iterator.getCurrentToken();
            var token = prevToken;
            if (!token)
                token = iterator.stepForward();
            if (!token)
                return;
            //get next closing tag or bracket
            var matchType;
            var found = false;
            var depth = {};
            var i = cursor.column - token.start;
            var bracketType;
            var brackets = {
                ")": "(",
                "(": "(",
                "]": "[",
                "[": "[",
                "{": "{",
                "}": "{"
            };
            do {
                if (token.value.match(/[{}()\[\]]/g)) {
                    for (; i < token.value.length && !found; i++) {
                        if (!brackets[token.value[i]]) {
                            continue;
                        }
                        bracketType = brackets[token.value[i]] + '.' + token.type.replace("rparen", "lparen");
                        if (isNaN(depth[bracketType])) {
                            depth[bracketType] = 0;
                        }
                        switch (token.value[i]) {
                            case '(':
                            case '[':
                            case '{':
                                depth[bracketType]++;
                                break;
                            case ')':
                            case ']':
                            case '}':
                                depth[bracketType]--;
                                if (depth[bracketType] === -1) {
                                    matchType = 'bracket';
                                    found = true;
                                }
                                break;
                        }
                    }
                }
                else if (token && token.type.indexOf('tag-name') !== -1) {
                    if (isNaN(depth[token.value])) {
                        depth[token.value] = 0;
                    }
                    if (prevToken.value === '<') {
                        depth[token.value]++;
                    }
                    else if (prevToken.value === '</') {
                        depth[token.value]--;
                    }
                    if (depth[token.value] === -1) {
                        matchType = 'tag';
                        found = true;
                    }
                }
                if (!found) {
                    prevToken = token;
                    token = iterator.stepForward();
                    i = 0;
                }
            } while (token && !found);
            //no match found
            if (!matchType) {
                return;
            }
            var range;
            if (matchType === 'bracket') {
                range = this.session.getBracketRange(cursor);
                if (!range) {
                    range = new Range_1.default(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + i - 1, iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + i - 1);
                    if (!range)
                        return;
                    var pos = range.start;
                    if (pos.row === cursor.row && Math.abs(pos.column - cursor.column) < 2)
                        range = this.session.getBracketRange(pos);
                }
            }
            else if (matchType === 'tag') {
                if (token && token.type.indexOf('tag-name') !== -1)
                    var tag = token.value;
                else
                    return;
                var range = new Range_1.default(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() - 2, iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() - 2);
                //find matching tag
                if (range.compare(cursor.row, cursor.column) === 0) {
                    found = false;
                    do {
                        token = prevToken;
                        prevToken = iterator.stepBackward();
                        if (prevToken) {
                            if (prevToken.type.indexOf('tag-close') !== -1) {
                                range.setEnd(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + 1);
                            }
                            if (token.value === tag && token.type.indexOf('tag-name') !== -1) {
                                if (prevToken.value === '<') {
                                    depth[tag]++;
                                }
                                else if (prevToken.value === '</') {
                                    depth[tag]--;
                                }
                                if (depth[tag] === 0)
                                    found = true;
                            }
                        }
                    } while (prevToken && !found);
                }
                //we found it
                if (token && token.type.indexOf('tag-name')) {
                    var pos = range.start;
                    if (pos.row == cursor.row && Math.abs(pos.column - cursor.column) < 2)
                        pos = range.end;
                }
            }
            pos = range && range['cursor'] || pos;
            if (pos) {
                if (select) {
                    if (range && range.isEqual(this.getSelectionRange()))
                        this.clearSelection();
                    else
                        this.selection.selectTo(pos.row, pos.column);
                }
                else {
                    this.selection.moveTo(pos.row, pos.column);
                }
            }
        };
        /**
         * Moves the cursor to the specified line number, and also into the indiciated column.
         * @param {Number} lineNumber The line number to go to
         * @param {Number} column A column number to go to
         * @param {Boolean} animate If `true` animates scolling
         **/
        Editor.prototype.gotoLine = function (lineNumber, column, animate) {
            this.selection.clearSelection();
            this.session.unfold({ row: lineNumber - 1, column: column || 0 });
            this.$blockScrolling += 1;
            // todo: find a way to automatically exit multiselect mode
            this.exitMultiSelectMode && this.exitMultiSelectMode();
            this.moveCursorTo(lineNumber - 1, column || 0);
            this.$blockScrolling -= 1;
            if (!this.isRowFullyVisible(lineNumber - 1)) {
                this.scrollToLine(lineNumber - 1, true, animate);
            }
        };
        /**
         * Moves the cursor to the specified row and column. Note that this does de-select the current selection.
         * @param {Number} row The new row number
         * @param {Number} column The new column number
         *
         *
         * @related Editor.moveCursorTo
         **/
        Editor.prototype.navigateTo = function (row, column) {
            this.selection.moveTo(row, column);
        };
        /**
         * Moves the cursor up in the document the specified number of times. Note that this does de-select the current selection.
         * @param {Number} times The number of times to change navigation
         *
         *
         **/
        Editor.prototype.navigateUp = function (times) {
            if (this.selection.isMultiLine() && !this.selection.isBackwards()) {
                var selectionStart = this.selection.anchor.getPosition();
                return this.moveCursorToPosition(selectionStart);
            }
            this.selection.clearSelection();
            this.selection.moveCursorBy(-times || -1, 0);
        };
        /**
         * Moves the cursor down in the document the specified number of times. Note that this does de-select the current selection.
         * @param {Number} times The number of times to change navigation
         *
         *
         **/
        Editor.prototype.navigateDown = function (times) {
            if (this.selection.isMultiLine() && this.selection.isBackwards()) {
                var selectionEnd = this.selection.anchor.getPosition();
                return this.moveCursorToPosition(selectionEnd);
            }
            this.selection.clearSelection();
            this.selection.moveCursorBy(times || 1, 0);
        };
        /**
         * Moves the cursor left in the document the specified number of times. Note that this does de-select the current selection.
         * @param {Number} times The number of times to change navigation
         *
         *
         **/
        Editor.prototype.navigateLeft = function (times) {
            if (!this.selection.isEmpty()) {
                var selectionStart = this.getSelectionRange().start;
                this.moveCursorToPosition(selectionStart);
            }
            else {
                times = times || 1;
                while (times--) {
                    this.selection.moveCursorLeft();
                }
            }
            this.clearSelection();
        };
        /**
         * Moves the cursor right in the document the specified number of times. Note that this does de-select the current selection.
         * @param {Number} times The number of times to change navigation
         *
         *
         **/
        Editor.prototype.navigateRight = function (times) {
            if (!this.selection.isEmpty()) {
                var selectionEnd = this.getSelectionRange().end;
                this.moveCursorToPosition(selectionEnd);
            }
            else {
                times = times || 1;
                while (times--) {
                    this.selection.moveCursorRight();
                }
            }
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the start of the current line. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateLineStart = function () {
            this.selection.moveCursorLineStart();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the end of the current line. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateLineEnd = function () {
            this.selection.moveCursorLineEnd();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the end of the current file. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateFileEnd = function () {
            this.selection.moveCursorFileEnd();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the start of the current file. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateFileStart = function () {
            this.selection.moveCursorFileStart();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the word immediately to the right of the current position. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateWordRight = function () {
            this.selection.moveCursorWordRight();
            this.clearSelection();
        };
        /**
         *
         * Moves the cursor to the word immediately to the left of the current position. Note that this does de-select the current selection.
         **/
        Editor.prototype.navigateWordLeft = function () {
            this.selection.moveCursorWordLeft();
            this.clearSelection();
        };
        /**
         * Replaces the first occurance of `options.needle` with the value in `replacement`.
         * @param {String} replacement The text to replace with
         * @param {Object} options The [[Search `Search`]] options to use
         *
         *
         **/
        Editor.prototype.replace = function (replacement, options) {
            if (options)
                this.$search.set(options);
            var range = this.$search.find(this.session);
            var replaced = 0;
            if (!range)
                return replaced;
            if (this.$tryReplace(range, replacement)) {
                replaced = 1;
            }
            if (range !== null) {
                this.selection.setSelectionRange(range);
                this.renderer.scrollSelectionIntoView(range.start, range.end);
            }
            return replaced;
        };
        /**
         * Replaces all occurances of `options.needle` with the value in `replacement`.
         * @param {String} replacement The text to replace with
         * @param {Object} options The [[Search `Search`]] options to use
         *
         *
         **/
        Editor.prototype.replaceAll = function (replacement, options) {
            if (options) {
                this.$search.set(options);
            }
            var ranges = this.$search.findAll(this.session);
            var replaced = 0;
            if (!ranges.length)
                return replaced;
            this.$blockScrolling += 1;
            var selection = this.getSelectionRange();
            this.selection.moveTo(0, 0);
            for (var i = ranges.length - 1; i >= 0; --i) {
                if (this.$tryReplace(ranges[i], replacement)) {
                    replaced++;
                }
            }
            this.selection.setSelectionRange(selection);
            this.$blockScrolling -= 1;
            return replaced;
        };
        Editor.prototype.$tryReplace = function (range, replacement) {
            var input = this.session.getTextRange(range);
            replacement = this.$search.replace(input, replacement);
            if (replacement !== null) {
                range.end = this.session.replace(range, replacement);
                return range;
            }
            else {
                return null;
            }
        };
        /**
         * {:Search.getOptions} For more information on `options`, see [[Search `Search`]].
         * @related Search.getOptions
         * @returns {Object}
         **/
        Editor.prototype.getLastSearchOptions = function () {
            return this.$search.getOptions();
        };
        /**
         * Attempts to find `needle` within the document. For more information on `options`, see [[Search `Search`]].
         * @param {String} needle The text to search for (optional)
         * @param {Object} options An object defining various search properties
         * @param {Boolean} animate If `true` animate scrolling
         *
         *
         * @related Search.find
         **/
        Editor.prototype.find = function (needle, options, animate) {
            if (!options)
                options = {};
            if (typeof needle == "string" || needle instanceof RegExp)
                options.needle = needle;
            else if (typeof needle == "object")
                oop_1.mixin(options, needle);
            var range = this.selection.getRange();
            if (options.needle == null) {
                needle = this.session.getTextRange(range) || this.$search.$options.needle;
                if (!needle) {
                    range = this.session.getWordRange(range.start.row, range.start.column);
                    needle = this.session.getTextRange(range);
                }
                this.$search.set({ needle: needle });
            }
            this.$search.set(options);
            if (!options.start)
                this.$search.set({ start: range });
            var newRange = this.$search.find(this.session);
            if (options.preventScroll)
                return newRange;
            if (newRange) {
                this.revealRange(newRange, animate);
                return newRange;
            }
            // clear selection if nothing is found
            if (options.backwards)
                range.start = range.end;
            else
                range.end = range.start;
            this.selection.setRange(range);
        };
        /**
         * Performs another search for `needle` in the document. For more information on `options`, see [[Search `Search`]].
         * @param {Object} options search options
         * @param {Boolean} animate If `true` animate scrolling
         *
         *
         * @related Editor.find
         **/
        Editor.prototype.findNext = function (needle, animate) {
            // FIXME: This looks flipped compared to findPrevious. 
            this.find(needle, { skipCurrent: true, backwards: false }, animate);
        };
        /**
         * Performs a search for `needle` backwards. For more information on `options`, see [[Search `Search`]].
         * @param {Object} options search options
         * @param {Boolean} animate If `true` animate scrolling
         *
         *
         * @related Editor.find
         **/
        Editor.prototype.findPrevious = function (needle, animate) {
            this.find(needle, { skipCurrent: true, backwards: true }, animate);
        };
        Editor.prototype.revealRange = function (range, animate) {
            this.$blockScrolling += 1;
            this.session.unfold(range);
            this.selection.setSelectionRange(range);
            this.$blockScrolling -= 1;
            var scrollTop = this.renderer.scrollTop;
            this.renderer.scrollSelectionIntoView(range.start, range.end, 0.5);
            if (animate !== false)
                this.renderer.animateScrolling(scrollTop);
        };
        /**
         * {:UndoManager.undo}
         * @related UndoManager.undo
         **/
        Editor.prototype.undo = function () {
            this.$blockScrolling++;
            this.session.getUndoManager().undo();
            this.$blockScrolling--;
            this.renderer.scrollCursorIntoView(null, 0.5);
        };
        /**
         * {:UndoManager.redo}
         * @related UndoManager.redo
         **/
        Editor.prototype.redo = function () {
            this.$blockScrolling++;
            this.session.getUndoManager().redo();
            this.$blockScrolling--;
            this.renderer.scrollCursorIntoView(null, 0.5);
        };
        /**
         *
         * Cleans up the entire editor.
         **/
        Editor.prototype.destroy = function () {
            this.renderer.destroy();
            this._signal("destroy", this);
        };
        /**
         * Enables automatic scrolling of the cursor into view when editor itself is inside scrollable element
         * @param {Boolean} enable default true
         **/
        Editor.prototype.setAutoScrollEditorIntoView = function (enable) {
            if (!enable)
                return;
            var rect;
            var self = this;
            var shouldScroll = false;
            if (!this.$scrollAnchor)
                this.$scrollAnchor = document.createElement("div");
            var scrollAnchor = this.$scrollAnchor;
            scrollAnchor.style.cssText = "position:absolute";
            this.container.insertBefore(scrollAnchor, this.container.firstChild);
            var onChangeSelection = this.on("changeSelection", function () {
                shouldScroll = true;
            });
            // needed to not trigger sync reflow
            var onBeforeRender = this.renderer.on("beforeRender", function () {
                if (shouldScroll)
                    rect = self.renderer.container.getBoundingClientRect();
            });
            var onAfterRender = this.renderer.on("afterRender", function () {
                if (shouldScroll && rect && self.isFocused()) {
                    var renderer = self.renderer;
                    var pos = renderer.$cursorLayer.$pixelPos;
                    var config = renderer.layerConfig;
                    var top = pos.top - config.offset;
                    if (pos.top >= 0 && top + rect.top < 0) {
                        shouldScroll = true;
                    }
                    else if (pos.top < config.height &&
                        pos.top + rect.top + config.lineHeight > window.innerHeight) {
                        shouldScroll = false;
                    }
                    else {
                        shouldScroll = null;
                    }
                    if (shouldScroll != null) {
                        scrollAnchor.style.top = top + "px";
                        scrollAnchor.style.left = pos.left + "px";
                        scrollAnchor.style.height = config.lineHeight + "px";
                        scrollAnchor.scrollIntoView(shouldScroll);
                    }
                    shouldScroll = rect = null;
                }
            });
            this.setAutoScrollEditorIntoView = function (enable) {
                if (enable)
                    return;
                delete this.setAutoScrollEditorIntoView;
                this.removeEventListener("changeSelection", onChangeSelection);
                this.renderer.removeEventListener("afterRender", onAfterRender);
                this.renderer.removeEventListener("beforeRender", onBeforeRender);
            };
        };
        Editor.prototype.$resetCursorStyle = function () {
            var style = this.$cursorStyle || "ace";
            var cursorLayer = this.renderer.$cursorLayer;
            if (!cursorLayer) {
                return;
            }
            cursorLayer.setSmoothBlinking(/smooth/.test(style));
            cursorLayer.isBlinking = !this.$readOnly && style != "wide";
            dom_1.setCssClass(cursorLayer.element, "ace_slim-cursors", /slim/.test(style));
        };
        return Editor;
    })(event_emitter_1.default);
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.default = Editor;
    config_1.defineOptions(Editor.prototype, "editor", {
        selectionStyle: {
            set: function (style) {
                var that = this;
                that.$onSelectionChange(void 0, that.selection);
                that._signal("changeSelectionStyle", { data: style });
            },
            initialValue: "line"
        },
        highlightActiveLine: {
            set: function () {
                var that = this;
                that.$updateHighlightActiveLine();
            },
            initialValue: true
        },
        highlightSelectedWord: {
            set: function (shouldHighlight) {
                var that = this;
                that.$onSelectionChange(void 0, that.selection);
            },
            initialValue: true
        },
        readOnly: {
            set: function (readOnly) {
                // disabled to not break vim mode!
                // this.textInput.setReadOnly(readOnly);
                this.$resetCursorStyle();
            },
            initialValue: false
        },
        cursorStyle: {
            set: function (val) {
                var that = this;
                that.$resetCursorStyle();
            },
            values: ["ace", "slim", "smooth", "wide"],
            initialValue: "ace"
        },
        mergeUndoDeltas: {
            values: [false, true, "always"],
            initialValue: true
        },
        behavioursEnabled: { initialValue: true },
        wrapBehavioursEnabled: { initialValue: true },
        autoScrollEditorIntoView: {
            set: function (enable) {
                var that = this;
                that.setAutoScrollEditorIntoView(enable);
            }
        },
        hScrollBarAlwaysVisible: "renderer",
        vScrollBarAlwaysVisible: "renderer",
        highlightGutterLine: "renderer",
        animatedScroll: "renderer",
        showInvisibles: "renderer",
        showPrintMargin: "renderer",
        printMarginColumn: "renderer",
        printMargin: "renderer",
        fadeFoldWidgets: "renderer",
        showFoldWidgets: "renderer",
        showLineNumbers: "renderer",
        showGutter: "renderer",
        displayIndentGuides: "renderer",
        fontSize: "renderer",
        fontFamily: "renderer",
        maxLines: "renderer",
        minLines: "renderer",
        scrollPastEnd: "renderer",
        fixedWidthGutter: "renderer",
        theme: "renderer",
        scrollSpeed: "$mouseHandler",
        dragDelay: "$mouseHandler",
        dragEnabled: "$mouseHandler",
        focusTimout: "$mouseHandler",
        tooltipFollowsMouse: "$mouseHandler",
        firstLineNumber: "session",
        overwrite: "session",
        newLineMode: "session",
        useWorker: "session",
        useSoftTabs: "session",
        tabSize: "session",
        wrap: "session",
        foldStyle: "session",
        mode: "session"
    });
    var FoldHandler = (function () {
        function FoldHandler(editor) {
            // The following handler detects clicks in the editor (not gutter) region
            // to determine whether to remove or expand a fold.
            editor.on("click", function (e) {
                var position = e.getDocumentPosition();
                var session = editor.session;
                // If the user clicked on a fold, then expand it.
                var fold = session.getFoldAt(position.row, position.column, 1);
                if (fold) {
                    if (e.getAccelKey()) {
                        session.removeFold(fold);
                    }
                    else {
                        session.expandFold(fold);
                    }
                    e.stop();
                }
                else {
                }
            });
            // The following handler detects clicks on the gutter.
            editor.on('gutterclick', function (e) {
                var gutterRegion = editor.renderer.$gutterLayer.getRegion(e);
                if (gutterRegion === 'foldWidgets') {
                    var row = e.getDocumentPosition().row;
                    var session = editor.session;
                    if (session['foldWidgets'] && session['foldWidgets'][row]) {
                        editor.session['onFoldWidgetClick'](row, e);
                    }
                    if (!editor.isFocused()) {
                        editor.focus();
                    }
                    e.stop();
                }
            });
            editor.on('gutterdblclick', function (e) {
                var gutterRegion = editor.renderer.$gutterLayer.getRegion(e);
                if (gutterRegion == 'foldWidgets') {
                    var row = e.getDocumentPosition().row;
                    var session = editor.session;
                    var data = session['getParentFoldRangeData'](row, true);
                    var range = data.range || data.firstRange;
                    if (range) {
                        row = range.start.row;
                        var fold = session.getFoldAt(row, session.getLine(row).length, 1);
                        if (fold) {
                            session.removeFold(fold);
                        }
                        else {
                            session['addFold']("...", range);
                            editor.renderer.scrollCursorIntoView({ row: range.start.row, column: 0 });
                        }
                    }
                    e.stop();
                }
            });
        }
        return FoldHandler;
    })();
    var MouseHandler = (function () {
        function MouseHandler(editor) {
            this.$scrollSpeed = 2;
            this.$dragDelay = 0;
            this.$dragEnabled = true;
            this.$focusTimout = 0;
            this.$tooltipFollowsMouse = true;
            this.$clickSelection = null;
            // FIXME: Did I mention that `this`, `new`, `class`, `bind` are the 4 horsemen?
            // FIXME: Function Scoping is the answer.
            var _self = this;
            this.editor = editor;
            // FIXME: We should be cleaning up these handlers in a dispose method...
            editor.setDefaultHandler('mousedown', makeMouseDownHandler(editor, this));
            editor.setDefaultHandler('mousewheel', makeMouseWheelHandler(editor, this));
            editor.setDefaultHandler("dblclick", makeDoubleClickHandler(editor, this));
            editor.setDefaultHandler("tripleclick", makeTripleClickHandler(editor, this));
            editor.setDefaultHandler("quadclick", makeQuadClickHandler(editor, this));
            this.selectByLines = makeExtendSelectionBy(editor, this, "getLineRange");
            this.selectByWords = makeExtendSelectionBy(editor, this, "getWordRange");
            new GutterHandler(this);
            //      FIXME: new DragdropHandler(this);
            var onMouseDown = function (e) {
                if (!editor.isFocused() && editor.textInput) {
                    editor.textInput.moveToMouse(e);
                }
                editor.focus();
            };
            var mouseTarget = editor.renderer.getMouseEventTarget();
            event_1.addListener(mouseTarget, "click", this.onMouseEvent.bind(this, "click"));
            event_1.addListener(mouseTarget, "mousemove", this.onMouseMove.bind(this, "mousemove"));
            event_1.addMultiMouseDownListener(mouseTarget, [400, 300, 250], this, "onMouseEvent");
            if (editor.renderer.scrollBarV) {
                event_1.addMultiMouseDownListener(editor.renderer.scrollBarV.inner, [400, 300, 250], this, "onMouseEvent");
                event_1.addMultiMouseDownListener(editor.renderer.scrollBarH.inner, [400, 300, 250], this, "onMouseEvent");
                if (useragent_1.isIE) {
                    event_1.addListener(editor.renderer.scrollBarV.element, "mousedown", onMouseDown);
                    // TODO: I wonder if we should be responding to mousedown (by symmetry)?
                    event_1.addListener(editor.renderer.scrollBarH.element, "mousemove", onMouseDown);
                }
            }
            // We hook 'mousewheel' using the portable 
            event_1.addMouseWheelListener(editor.container, this.emitEditorMouseWheelEvent.bind(this, "mousewheel"));
            var gutterEl = editor.renderer.$gutter;
            event_1.addListener(gutterEl, "mousedown", this.onMouseEvent.bind(this, "guttermousedown"));
            event_1.addListener(gutterEl, "click", this.onMouseEvent.bind(this, "gutterclick"));
            event_1.addListener(gutterEl, "dblclick", this.onMouseEvent.bind(this, "gutterdblclick"));
            event_1.addListener(gutterEl, "mousemove", this.onMouseEvent.bind(this, "guttermousemove"));
            event_1.addListener(mouseTarget, "mousedown", onMouseDown);
            event_1.addListener(gutterEl, "mousedown", function (e) {
                editor.focus();
                return event_1.preventDefault(e);
            });
            // Handle `mousemove` while the mouse is over the editing area (and not the gutter).
            editor.on('mousemove', function (e) {
                if (_self.state || _self.$dragDelay || !_self.$dragEnabled) {
                    return;
                }
                // FIXME: Probably s/b clientXY
                var char = editor.renderer.screenToTextCoordinates(e.x, e.y);
                var range = editor.session.getSelection().getRange();
                var renderer = editor.renderer;
                if (!range.isEmpty() && range.insideStart(char.row, char.column)) {
                    renderer.setCursorStyle('default');
                }
                else {
                    renderer.setCursorStyle("");
                }
            });
        }
        MouseHandler.prototype.onMouseEvent = function (name, e) {
            this.editor._emit(name, new EditorMouseEvent(e, this.editor));
        };
        MouseHandler.prototype.onMouseMove = function (name, e) {
            // If nobody is listening, avoid the creation of the temporary wrapper.
            // optimization, because mousemove doesn't have a default handler.
            var listeners = this.editor._eventRegistry && this.editor._eventRegistry['mousemove'];
            if (!listeners || !listeners.length) {
                return;
            }
            this.editor._emit(name, new EditorMouseEvent(e, this.editor));
        };
        MouseHandler.prototype.emitEditorMouseWheelEvent = function (name, e) {
            var mouseEvent = new EditorMouseEvent(e, this.editor);
            mouseEvent.speed = this.$scrollSpeed * 2;
            mouseEvent.wheelX = e['wheelX'];
            mouseEvent.wheelY = e['wheelY'];
            this.editor._emit(name, mouseEvent);
        };
        MouseHandler.prototype.setState = function (state) {
            this.state = state;
        };
        MouseHandler.prototype.textCoordinates = function () {
            return this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
        };
        MouseHandler.prototype.captureMouse = function (ev, mouseMoveHandler) {
            this.clientX = ev.clientX;
            this.clientY = ev.clientY;
            this.isMousePressed = true;
            // do not move textarea during selection
            var renderer = this.editor.renderer;
            if (renderer.$keepTextAreaAtCursor) {
                renderer.$keepTextAreaAtCursor = null;
            }
            var onMouseMove = (function (editor, mouseHandler) {
                return function (mouseEvent) {
                    if (!mouseEvent)
                        return;
                    // if editor is loaded inside iframe, and mouseup event is outside
                    // we won't recieve it, so we cancel on first mousemove without button
                    if (useragent_1.isWebKit && !mouseEvent.which && mouseHandler.releaseMouse) {
                        // TODO: For backwards compatibility I'm passing undefined,
                        // but it would probably make more sense to pass the mouse event
                        // since that is the final event.
                        return mouseHandler.releaseMouse(undefined);
                    }
                    mouseHandler.clientX = mouseEvent.clientX;
                    mouseHandler.clientY = mouseEvent.clientY;
                    mouseMoveHandler && mouseMoveHandler(mouseEvent);
                    mouseHandler.mouseEvent = new EditorMouseEvent(mouseEvent, editor);
                    mouseHandler.$mouseMoved = true;
                };
            })(this.editor, this);
            var onCaptureEnd = (function (mouseHandler) {
                return function (e) {
                    clearInterval(timerId);
                    onCaptureInterval();
                    mouseHandler[mouseHandler.state + "End"] && mouseHandler[mouseHandler.state + "End"](e);
                    mouseHandler.state = "";
                    if (renderer.$keepTextAreaAtCursor == null) {
                        renderer.$keepTextAreaAtCursor = true;
                        renderer.$moveTextAreaToCursor();
                    }
                    mouseHandler.isMousePressed = false;
                    mouseHandler.$onCaptureMouseMove = mouseHandler.releaseMouse = null;
                    e && mouseHandler.onMouseEvent("mouseup", e);
                };
            })(this);
            var onCaptureInterval = (function (mouseHandler) {
                return function () {
                    mouseHandler[mouseHandler.state] && mouseHandler[mouseHandler.state]();
                    mouseHandler.$mouseMoved = false;
                };
            })(this);
            if (useragent_1.isOldIE && ev.domEvent.type == "dblclick") {
                return setTimeout(function () { onCaptureEnd(ev); });
            }
            this.$onCaptureMouseMove = onMouseMove;
            this.releaseMouse = event_1.capture(this.editor.container, onMouseMove, onCaptureEnd);
            var timerId = setInterval(onCaptureInterval, 20);
        };
        MouseHandler.prototype.cancelContextMenu = function () {
            var stop = function (e) {
                if (e && e.domEvent && e.domEvent.type != "contextmenu") {
                    return;
                }
                this.editor.off("nativecontextmenu", stop);
                if (e && e.domEvent) {
                    event_1.stopEvent(e.domEvent);
                }
            }.bind(this);
            setTimeout(stop, 10);
            this.editor.on("nativecontextmenu", stop);
        };
        MouseHandler.prototype.select = function () {
            var anchor;
            var cursor = this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
            if (this.$clickSelection) {
                var cmp = this.$clickSelection.comparePoint(cursor);
                if (cmp == -1) {
                    anchor = this.$clickSelection.end;
                }
                else if (cmp == 1) {
                    anchor = this.$clickSelection.start;
                }
                else {
                    var orientedRange = calcRangeOrientation(this.$clickSelection, cursor);
                    cursor = orientedRange.cursor;
                    anchor = orientedRange.anchor;
                }
                this.editor.selection.setSelectionAnchor(anchor.row, anchor.column);
            }
            this.editor.selection.selectToPosition(cursor);
            this.editor.renderer.scrollCursorIntoView();
        };
        MouseHandler.prototype.selectByLinesEnd = function () {
            this.$clickSelection = null;
            this.editor.unsetStyle("ace_selecting");
            if (this.editor.renderer.scroller.releaseCapture) {
                this.editor.renderer.scroller.releaseCapture();
            }
        };
        MouseHandler.prototype.startSelect = function (pos, waitForClickSelection) {
            pos = pos || this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
            var editor = this.editor;
            // allow double/triple click handlers to change selection
            if (this.mousedownEvent.getShiftKey()) {
                editor.selection.selectToPosition(pos);
            }
            else if (!waitForClickSelection) {
                editor.selection.moveToPosition(pos);
            }
            if (!waitForClickSelection) {
                this.select();
            }
            if (this.editor.renderer.scroller.setCapture) {
                this.editor.renderer.scroller.setCapture();
            }
            editor.setStyle("ace_selecting");
            this.setState("select");
        };
        MouseHandler.prototype.selectEnd = function () {
            this.selectByLinesEnd();
        };
        MouseHandler.prototype.selectAllEnd = function () {
            this.selectByLinesEnd();
        };
        MouseHandler.prototype.selectByWordsEnd = function () {
            this.selectByLinesEnd();
        };
        MouseHandler.prototype.focusWait = function () {
            var distance = calcDistance(this.mousedownEvent.clientX, this.mousedownEvent.clientY, this.clientX, this.clientY);
            var time = Date.now();
            if (distance > DRAG_OFFSET || time - this.mousedownEvent.time > this.$focusTimout) {
                this.startSelect(this.mousedownEvent.getDocumentPosition());
            }
        };
        return MouseHandler;
    })();
    config_1.defineOptions(MouseHandler.prototype, "mouseHandler", {
        scrollSpeed: { initialValue: 2 },
        dragDelay: { initialValue: (useragent_1.isMac ? 150 : 0) },
        dragEnabled: { initialValue: true },
        focusTimout: { initialValue: 0 },
        tooltipFollowsMouse: { initialValue: true }
    });
    /*
     * Custom Ace mouse event
     */
    var EditorMouseEvent = (function () {
        function EditorMouseEvent(domEvent, editor) {
            this.propagationStopped = false;
            this.defaultPrevented = false;
            this.getAccelKey = useragent_1.isMac ? function () { return this.domEvent.metaKey; } : function () { return this.domEvent.ctrlKey; };
            this.domEvent = domEvent;
            this.editor = editor;
            this.clientX = domEvent.clientX;
            this.clientY = domEvent.clientY;
            this.$pos = null;
            this.$inSelection = null;
        }
        Object.defineProperty(EditorMouseEvent.prototype, "toElement", {
            get: function () {
                return this.domEvent.toElement;
            },
            enumerable: true,
            configurable: true
        });
        EditorMouseEvent.prototype.stopPropagation = function () {
            event_1.stopPropagation(this.domEvent);
            this.propagationStopped = true;
        };
        EditorMouseEvent.prototype.preventDefault = function () {
            event_1.preventDefault(this.domEvent);
            this.defaultPrevented = true;
        };
        EditorMouseEvent.prototype.stop = function () {
            this.stopPropagation();
            this.preventDefault();
        };
        /*
         * Get the document position below the mouse cursor
         *
         * @return {Object} 'row' and 'column' of the document position
         */
        EditorMouseEvent.prototype.getDocumentPosition = function () {
            if (!this.$pos) {
                this.$pos = this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
            }
            return this.$pos;
        };
        /*
         * Check if the mouse cursor is inside of the text selection
         *
         * @return {Boolean} whether the mouse cursor is inside of the selection
         */
        EditorMouseEvent.prototype.inSelection = function () {
            if (this.$inSelection !== null)
                return this.$inSelection;
            var editor = this.editor;
            var selectionRange = editor.getSelectionRange();
            if (selectionRange.isEmpty())
                this.$inSelection = false;
            else {
                var pos = this.getDocumentPosition();
                this.$inSelection = selectionRange.contains(pos.row, pos.column);
            }
            return this.$inSelection;
        };
        /*
         * Get the clicked mouse button
         *
         * @return {Number} 0 for left button, 1 for middle button, 2 for right button
         */
        EditorMouseEvent.prototype.getButton = function () {
            return event_1.getButton(this.domEvent);
        };
        /*
         * @return {Boolean} whether the shift key was pressed when the event was emitted
         */
        EditorMouseEvent.prototype.getShiftKey = function () {
            return this.domEvent.shiftKey;
        };
        return EditorMouseEvent;
    })();
    var DRAG_OFFSET = 0; // pixels
    function makeMouseDownHandler(editor, mouseHandler) {
        return function (ev) {
            var inSelection = ev.inSelection();
            var pos = ev.getDocumentPosition();
            mouseHandler.mousedownEvent = ev;
            var button = ev.getButton();
            if (button !== 0) {
                var selectionRange = editor.getSelectionRange();
                var selectionEmpty = selectionRange.isEmpty();
                if (selectionEmpty)
                    editor.selection.moveToPosition(pos);
                // 2: contextmenu, 1: linux paste
                editor.textInput.onContextMenu(ev.domEvent);
                return; // stopping event here breaks contextmenu on ff mac
            }
            mouseHandler.mousedownEvent.time = Date.now();
            // if this click caused the editor to be focused should not clear the
            // selection
            if (inSelection && !editor.isFocused()) {
                editor.focus();
                if (mouseHandler.$focusTimout && !mouseHandler.$clickSelection && !editor.inMultiSelectMode) {
                    mouseHandler.setState("focusWait");
                    mouseHandler.captureMouse(ev);
                    return;
                }
            }
            mouseHandler.captureMouse(ev);
            // TODO: _clicks is a custom property added in event.ts by the 'mousedown' listener.
            mouseHandler.startSelect(pos, ev.domEvent['_clicks'] > 1);
            return ev.preventDefault();
        };
    }
    function makeMouseWheelHandler(editor, mouseHandler) {
        return function (ev) {
            if (ev.getAccelKey()) {
                return;
            }
            //shift wheel to horiz scroll
            if (ev.getShiftKey() && ev.wheelY && !ev.wheelX) {
                ev.wheelX = ev.wheelY;
                ev.wheelY = 0;
            }
            var t = ev.domEvent.timeStamp;
            var dt = t - (mouseHandler.$lastScrollTime || 0);
            var isScrolable = editor.renderer.isScrollableBy(ev.wheelX * ev.speed, ev.wheelY * ev.speed);
            if (isScrolable || dt < 200) {
                mouseHandler.$lastScrollTime = t;
                editor.renderer.scrollBy(ev.wheelX * ev.speed, ev.wheelY * ev.speed);
                return ev.stop();
            }
        };
    }
    function makeDoubleClickHandler(editor, mouseHandler) {
        return function (editorMouseEvent) {
            var pos = editorMouseEvent.getDocumentPosition();
            var session = editor.session;
            var range = session.getBracketRange(pos);
            if (range) {
                if (range.isEmpty()) {
                    range.start.column--;
                    range.end.column++;
                }
                mouseHandler.setState("select");
            }
            else {
                range = editor.selection.getWordRange(pos.row, pos.column);
                mouseHandler.setState("selectByWords");
            }
            mouseHandler.$clickSelection = range;
            mouseHandler.select();
        };
    }
    function makeTripleClickHandler(editor, mouseHandler) {
        return function (editorMouseEvent) {
            var pos = editorMouseEvent.getDocumentPosition();
            mouseHandler.setState("selectByLines");
            var range = editor.getSelectionRange();
            if (range.isMultiLine() && range.contains(pos.row, pos.column)) {
                mouseHandler.$clickSelection = editor.selection.getLineRange(range.start.row);
                mouseHandler.$clickSelection.end = editor.selection.getLineRange(range.end.row).end;
            }
            else {
                mouseHandler.$clickSelection = editor.selection.getLineRange(pos.row);
            }
            mouseHandler.select();
        };
    }
    function makeQuadClickHandler(editor, mouseHandler) {
        return function (editorMouseEvent) {
            editor.selectAll();
            mouseHandler.$clickSelection = editor.getSelectionRange();
            mouseHandler.setState("selectAll");
        };
    }
    function makeExtendSelectionBy(editor, mouseHandler, unitName) {
        return function () {
            var anchor;
            var cursor = mouseHandler.textCoordinates();
            var range = editor.selection[unitName](cursor.row, cursor.column);
            if (mouseHandler.$clickSelection) {
                var cmpStart = mouseHandler.$clickSelection.comparePoint(range.start);
                var cmpEnd = mouseHandler.$clickSelection.comparePoint(range.end);
                if (cmpStart == -1 && cmpEnd <= 0) {
                    anchor = mouseHandler.$clickSelection.end;
                    if (range.end.row != cursor.row || range.end.column != cursor.column)
                        cursor = range.start;
                }
                else if (cmpEnd == 1 && cmpStart >= 0) {
                    anchor = mouseHandler.$clickSelection.start;
                    if (range.start.row != cursor.row || range.start.column != cursor.column)
                        cursor = range.end;
                }
                else if (cmpStart == -1 && cmpEnd == 1) {
                    cursor = range.end;
                    anchor = range.start;
                }
                else {
                    var orientedRange = calcRangeOrientation(mouseHandler.$clickSelection, cursor);
                    cursor = orientedRange.cursor;
                    anchor = orientedRange.anchor;
                }
                editor.selection.setSelectionAnchor(anchor.row, anchor.column);
            }
            editor.selection.selectToPosition(cursor);
            editor.renderer.scrollCursorIntoView();
        };
    }
    function calcDistance(ax, ay, bx, by) {
        return Math.sqrt(Math.pow(bx - ax, 2) + Math.pow(by - ay, 2));
    }
    function calcRangeOrientation(range, cursor) {
        if (range.start.row == range.end.row) {
            var cmp = 2 * cursor.column - range.start.column - range.end.column;
        }
        else if (range.start.row == range.end.row - 1 && !range.start.column && !range.end.column) {
            var cmp = cursor.column - 4;
        }
        else {
            var cmp = 2 * cursor.row - range.start.row - range.end.row;
        }
        if (cmp < 0) {
            return { cursor: range.start, anchor: range.end };
        }
        else {
            return { cursor: range.end, anchor: range.start };
        }
    }
    var GutterHandler = (function () {
        function GutterHandler(mouseHandler) {
            var editor = mouseHandler.editor;
            var gutter = editor.renderer.$gutterLayer;
            var tooltip = new GutterTooltip(editor.container);
            mouseHandler.editor.setDefaultHandler("guttermousedown", function (e) {
                if (!editor.isFocused() || e.getButton() != 0) {
                    return;
                }
                var gutterRegion = gutter.getRegion(e);
                if (gutterRegion === "foldWidgets") {
                    return;
                }
                var row = e.getDocumentPosition().row;
                var selection = editor.session.getSelection();
                if (e.getShiftKey()) {
                    selection.selectTo(row, 0);
                }
                else {
                    if (e.domEvent.detail == 2) {
                        editor.selectAll();
                        return e.preventDefault();
                    }
                    mouseHandler.$clickSelection = editor.selection.getLineRange(row);
                }
                mouseHandler.setState("selectByLines");
                mouseHandler.captureMouse(e);
                return e.preventDefault();
            });
            var tooltipTimeout;
            var mouseEvent;
            var tooltipAnnotation;
            function showTooltip() {
                var row = mouseEvent.getDocumentPosition().row;
                var annotation = gutter.$annotations[row];
                if (!annotation) {
                    return hideTooltip(void 0, editor);
                }
                var maxRow = editor.session.getLength();
                if (row == maxRow) {
                    var screenRow = editor.renderer.pixelToScreenCoordinates(0, mouseEvent.clientY).row;
                    var pos = mouseEvent.getDocumentPosition();
                    if (screenRow > editor.session.documentToScreenRow(pos.row, pos.column)) {
                        return hideTooltip(void 0, editor);
                    }
                }
                if (tooltipAnnotation == annotation) {
                    return;
                }
                tooltipAnnotation = annotation.text.join("<br/>");
                tooltip.setHtml(tooltipAnnotation);
                tooltip.show();
                editor.on("mousewheel", hideTooltip);
                if (mouseHandler.$tooltipFollowsMouse) {
                    moveTooltip(mouseEvent);
                }
                else {
                    var gutterElement = gutter.$cells[editor.session.documentToScreenRow(row, 0)].element;
                    var rect = gutterElement.getBoundingClientRect();
                    var style = tooltip.getElement().style;
                    style.left = rect.right + "px";
                    style.top = rect.bottom + "px";
                }
            }
            function hideTooltip(event, editor) {
                if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = undefined;
                }
                if (tooltipAnnotation) {
                    tooltip.hide();
                    tooltipAnnotation = null;
                    editor.off("mousewheel", hideTooltip);
                }
            }
            function moveTooltip(event) {
                tooltip.setPosition(event.clientX, event.clientY);
            }
            mouseHandler.editor.setDefaultHandler("guttermousemove", function (e) {
                // FIXME: Obfuscating the type of target to thwart compiler.
                var target = e.domEvent.target || e.domEvent.srcElement;
                if (dom_1.hasCssClass(target, "ace_fold-widget")) {
                    return hideTooltip(void 0, editor);
                }
                if (tooltipAnnotation && mouseHandler.$tooltipFollowsMouse) {
                    moveTooltip(e);
                }
                mouseEvent = e;
                if (tooltipTimeout) {
                    return;
                }
                tooltipTimeout = setTimeout(function () {
                    tooltipTimeout = null;
                    if (mouseEvent && !mouseHandler.isMousePressed)
                        showTooltip();
                    else
                        hideTooltip(void 0, editor);
                }, 50);
            });
            event_1.addListener(editor.renderer.$gutter, "mouseout", function (e) {
                mouseEvent = null;
                if (!tooltipAnnotation || tooltipTimeout)
                    return;
                tooltipTimeout = setTimeout(function () {
                    tooltipTimeout = null;
                    hideTooltip(void 0, editor);
                }, 50);
            });
            editor.on("changeSession", hideTooltip);
        }
        return GutterHandler;
    })();
    /**
     * @class GutterTooltip
     * @extends Tooltip
     */
    var GutterTooltip = (function (_super) {
        __extends(GutterTooltip, _super);
        function GutterTooltip(parentNode) {
            _super.call(this, parentNode);
        }
        /**
         * @method setPosition
         * @param x {number}
         * @param y {number}
         * @return {void}
         */
        GutterTooltip.prototype.setPosition = function (x, y) {
            var windowWidth = window.innerWidth || document.documentElement.clientWidth;
            var windowHeight = window.innerHeight || document.documentElement.clientHeight;
            var width = this.getWidth();
            var height = this.getHeight();
            x += 15;
            y += 15;
            if (x + width > windowWidth) {
                x -= (x + width) - windowWidth;
            }
            if (y + height > windowHeight) {
                y -= 20 + height;
            }
            _super.prototype.setPosition.call(this, x, y);
        };
        return GutterTooltip;
    })(Tooltip_1.default);
});
