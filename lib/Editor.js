var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var oop = require("./lib/oop");
var dom = require("./lib/dom");
var lang = require("./lib/lang");
var userAgent = require("./lib/useragent");
var TextInput = require("./keyboard/textinput");
var KeyBinding = require("./keyboard/keybinding");
var esm = require("./edit_session");
var Search = require("./search");
var rng = require("./range");
var eve = require("./lib/event_emitter");
var CommandManager = require("./commands/CommandManager");
var defaultCommands = require("./commands/default_commands");
var config = require("./config");
var TokenIterator = require("./TokenIterator");
var protocol = require('./editor_protocol');
var event = require("./lib/event");
var touch = require('./touch/touch');
var ttm = require("./tooltip");
var Editor = (function (_super) {
    __extends(Editor, _super);
    function Editor(renderer, session) {
        _super.call(this);
        this.commands = new CommandManager(userAgent.isMac ? "mac" : "win", defaultCommands);
        this.curOp = null;
        this.prevOp = {};
        this.$mergeableCommands = ["backspace", "del", "insertstring"];
        this.container = renderer.getContainerElement();
        this.renderer = renderer;
        this.textInput = new TextInput(renderer.getTextAreaContainer(), this);
        this.renderer.textarea = this.textInput.getElement();
        this.keyBinding = new KeyBinding(this);
        if (userAgent.isMobile) {
            this.$touchHandler = touch.touchManager(this);
            this.$mouseHandler = new MouseHandler(this);
        }
        else {
            this.$touchHandler = touch.touchManager(this);
            this.$mouseHandler = new MouseHandler(this);
        }
        new FoldHandler(this);
        this.$blockScrolling = 0;
        this.$search = new Search().set({
            wrap: true
        });
        this.$historyTracker = this.$historyTracker.bind(this);
        this.commands.on("exec", this.$historyTracker);
        this.$initOperationListeners();
        this._$emitInputEvent = lang.delayedCall(function () {
            this._signal("input", {});
            this.session.bgTokenizer && this.session.bgTokenizer.scheduleStart();
        }.bind(this));
        this.on("change", function (_, _self) {
            _self._$emitInputEvent.schedule(31);
        });
        this.setSession(session || new esm.EditSession(""));
        config.resetOptions(this);
        config._signal("editor", this);
    }
    Editor.prototype.cancelMouseContextMenu = function () {
        this.$mouseHandler.cancelContextMenu();
    };
    Object.defineProperty(Editor.prototype, "selection", {
        get: function () {
            return this.session.getSelection();
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
        this.$opResetTimer = lang.delayedCall(this.endOperation.bind(this));
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
        var shouldMerge = prev.command && (e.command.name == prev.command.name);
        if (e.command.name == "insertstring") {
            var text = e.args;
            if (this.mergeNextCommand === undefined)
                this.mergeNextCommand = true;
            shouldMerge = shouldMerge
                && this.mergeNextCommand
                && (!/\s/.test(text) || /\s/.test(prev.args));
            this.mergeNextCommand = true;
        }
        else {
            shouldMerge = shouldMerge
                && mergeableCommands.indexOf(e.command.name) !== -1;
        }
        if (this.$mergeUndoDeltas != "always"
            && Date.now() - this.sequenceStartTime > 2000) {
            shouldMerge = false;
        }
        if (shouldMerge)
            this.session.mergeUndoDeltas = true;
        else if (mergeableCommands.indexOf(e.command.name) !== -1)
            this.sequenceStartTime = Date.now();
    };
    Editor.prototype.setKeyboardHandler = function (keyboardHandler) {
        if (!keyboardHandler) {
            this.keyBinding.setKeyboardHandler(null);
        }
        else if (typeof keyboardHandler === "string") {
            this.$keybindingId = keyboardHandler;
            var _self = this;
            config.loadModule(["keybinding", keyboardHandler], function (module) {
                if (_self.$keybindingId == keyboardHandler)
                    _self.keyBinding.setKeyboardHandler(module && module.handler);
            });
        }
        else {
            this.$keybindingId = null;
            this.keyBinding.setKeyboardHandler(keyboardHandler);
        }
    };
    Editor.prototype.getKeyboardHandler = function () {
        return this.keyBinding.getKeyboardHandler();
    };
    Editor.prototype.setSession = function (session) {
        if (this.session == session)
            return;
        var oldSession = this.session;
        if (oldSession) {
            this.session.removeEventListener("change", this.$onDocumentChange);
            this.session.removeEventListener("changeMode", this.$onChangeMode);
            this.session.removeEventListener("tokenizerUpdate", this.$onTokenizerUpdate);
            this.session.removeEventListener("changeTabSize", this.$onChangeTabSize);
            this.session.removeEventListener("changeWrapLimit", this.$onChangeWrapLimit);
            this.session.removeEventListener("changeWrapMode", this.$onChangeWrapMode);
            this.session.removeEventListener("onChangeFold", this.$onChangeFold);
            this.session.removeEventListener("changeFrontMarker", this.$onChangeFrontMarker);
            this.session.removeEventListener("changeBackMarker", this.$onChangeBackMarker);
            this.session.removeEventListener("changeBreakpoint", this.$onChangeBreakpoint);
            this.session.removeEventListener("changeAnnotation", this.$onChangeAnnotation);
            this.session.removeEventListener("changeOverwrite", this.$onCursorChange);
            this.session.removeEventListener("changeScrollTop", this.$onScrollTopChange);
            this.session.removeEventListener("changeScrollLeft", this.$onScrollLeftChange);
            var selection = this.session.getSelection();
            selection.removeEventListener("changeCursor", this.$onCursorChange);
            selection.removeEventListener("changeSelection", this.$onSelectionChange);
        }
        this.session = session;
        if (session) {
            this.$onDocumentChange = this.onDocumentChange.bind(this);
            session.addEventListener("change", this.$onDocumentChange);
            this.renderer.setSession(session);
            this.$onChangeMode = this.onChangeMode.bind(this);
            session.addEventListener("changeMode", this.$onChangeMode);
            this.$onTokenizerUpdate = this.onTokenizerUpdate.bind(this);
            session.addEventListener("tokenizerUpdate", this.$onTokenizerUpdate);
            this.$onChangeTabSize = this.renderer.onChangeTabSize.bind(this.renderer);
            session.addEventListener("changeTabSize", this.$onChangeTabSize);
            this.$onChangeWrapLimit = this.onChangeWrapLimit.bind(this);
            session.addEventListener("changeWrapLimit", this.$onChangeWrapLimit);
            this.$onChangeWrapMode = this.onChangeWrapMode.bind(this);
            session.addEventListener("changeWrapMode", this.$onChangeWrapMode);
            this.$onChangeFold = this.onChangeFold.bind(this);
            session.addEventListener("changeFold", this.$onChangeFold);
            this.$onChangeFrontMarker = this.onChangeFrontMarker.bind(this);
            this.session.addEventListener("changeFrontMarker", this.$onChangeFrontMarker);
            this.$onChangeBackMarker = this.onChangeBackMarker.bind(this);
            this.session.addEventListener("changeBackMarker", this.$onChangeBackMarker);
            this.$onChangeBreakpoint = this.onChangeBreakpoint.bind(this);
            this.session.addEventListener("changeBreakpoint", this.$onChangeBreakpoint);
            this.$onChangeAnnotation = this.onChangeAnnotation.bind(this);
            this.session.addEventListener("changeAnnotation", this.$onChangeAnnotation);
            this.$onCursorChange = this.onCursorChange.bind(this);
            this.session.addEventListener("changeOverwrite", this.$onCursorChange);
            this.$onScrollTopChange = this.onScrollTopChange.bind(this);
            this.session.addEventListener("changeScrollTop", this.$onScrollTopChange);
            this.$onScrollLeftChange = this.onScrollLeftChange.bind(this);
            this.session.addEventListener("changeScrollLeft", this.$onScrollLeftChange);
            this.selection = session.getSelection();
            this.selection.addEventListener("changeCursor", this.$onCursorChange);
            this.$onSelectionChange = this.onSelectionChange.bind(this);
            this.selection.addEventListener("changeSelection", this.$onSelectionChange);
            this.onChangeMode();
            this.$blockScrolling += 1;
            this.onCursorChange();
            this.$blockScrolling -= 1;
            this.onScrollTopChange();
            this.onScrollLeftChange();
            this.onSelectionChange();
            this.onChangeFrontMarker();
            this.onChangeBackMarker();
            this.onChangeBreakpoint();
            this.onChangeAnnotation();
            this.session.getUseWrapMode() && this.renderer.adjustWrapLimit();
            this.renderer.updateFull();
        }
        this._signal("changeSession", {
            session: session,
            oldSession: oldSession
        });
        oldSession && oldSession._signal("changeEditor", { oldEditor: this });
        session && session._signal("changeEditor", { editor: this });
    };
    Editor.prototype.getSession = function () {
        return this.session;
    };
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
        return val;
    };
    Editor.prototype.getValue = function () {
        return this.session.getValue();
    };
    Editor.prototype.getSelection = function () {
        return this.selection;
    };
    Editor.prototype.resize = function (force) {
        this.renderer.onResize(force);
    };
    Editor.prototype.setTheme = function (theme, cb) {
        this.renderer.setTheme(theme, cb);
    };
    Editor.prototype.getTheme = function () {
        return this.renderer.getTheme();
    };
    Editor.prototype.setStyle = function (style) {
        this.renderer.setStyle(style);
    };
    Editor.prototype.unsetStyle = function (style) {
        this.renderer.unsetStyle(style);
    };
    Editor.prototype.getFontSize = function () {
        return this.getOption("fontSize") || dom.computedStyle(this.container, "fontSize");
    };
    Editor.prototype.setFontSize = function (fontSize) {
        this.setOption("fontSize", fontSize);
    };
    Editor.prototype.$highlightBrackets = function () {
        if (this.session.$bracketHighlight) {
            this.session.removeMarker(this.session.$bracketHighlight);
            this.session.$bracketHighlight = null;
        }
        if (this.$highlightPending) {
            return;
        }
        var self = this;
        this.$highlightPending = true;
        setTimeout(function () {
            self.$highlightPending = false;
            var pos = self.session.findMatchingBracket(self.getCursorPosition());
            if (pos) {
                var range = new rng.Range(pos.row, pos.column, pos.row, pos.column + 1);
            }
            else if (self.session.$mode.getMatching) {
                var range = self.session.$mode.getMatching(self.session);
            }
            if (range)
                self.session.$bracketHighlight = self.session.addMarker(range, "ace_bracket", "text");
        }, 50);
    };
    Editor.prototype.$highlightTags = function () {
        var session = this.session;
        if (this.$highlightTagPending) {
            return;
        }
        var self = this;
        this.$highlightTagPending = true;
        setTimeout(function () {
            self.$highlightTagPending = false;
            var pos = self.getCursorPosition();
            var iterator = new TokenIterator(self.session, pos.row, pos.column);
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
                iterator.stepForward();
            }
            if (!token) {
                session.removeMarker(session.$tagHighlight);
                session.$tagHighlight = null;
                return;
            }
            var row = iterator.getCurrentTokenRow();
            var column = iterator.getCurrentTokenColumn();
            var range = new rng.Range(row, column, row, column + token.value.length);
            if (session.$tagHighlight && range.compareRange(session.$backMarkers[session.$tagHighlight].range) !== 0) {
                session.removeMarker(session.$tagHighlight);
                session.$tagHighlight = null;
            }
            if (range && !session.$tagHighlight)
                session.$tagHighlight = session.addMarker(range, "ace_bracket", "text");
        }, 50);
    };
    Editor.prototype.focus = function () {
        var _self = this;
        setTimeout(function () {
            _self.textInput.focus();
        });
        this.textInput.focus();
    };
    Editor.prototype.isFocused = function () {
        return this.textInput.isFocused();
    };
    Editor.prototype.blur = function () {
        this.textInput.blur();
    };
    Editor.prototype.onFocus = function () {
        if (this.$isFocused) {
            return;
        }
        this.$isFocused = true;
        this.renderer.showCursor();
        this.renderer.visualizeFocus();
        this._emit("focus");
    };
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
    Editor.prototype.onDocumentChange = function (e) {
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
        this.$cursorChange();
        this.$updateHighlightActiveLine();
    };
    Editor.prototype.onTokenizerUpdate = function (e) {
        var rows = e.data;
        this.renderer.updateLines(rows.first, rows.last);
    };
    Editor.prototype.onScrollTopChange = function () {
        this.renderer.scrollToY(this.session.getScrollTop());
    };
    Editor.prototype.onScrollLeftChange = function () {
        this.renderer.scrollToX(this.session.getScrollLeft());
    };
    Editor.prototype.onCursorChange = function () {
        this.$cursorChange();
        if (!this.$blockScrolling) {
            this.renderer.scrollCursorIntoView();
        }
        this.$highlightBrackets();
        this.$highlightTags();
        this.$updateHighlightActiveLine();
        this._signal("changeSelection");
    };
    Editor.prototype.$updateHighlightActiveLine = function () {
        var session = this.getSession();
        var highlight;
        if (this.$highlightActiveLine) {
            if ((this.$selectionStyle != "line" || !this.selection.isMultiLine()))
                highlight = this.getCursorPosition();
            if (this.renderer.$maxLines && this.session.getLength() === 1 && !(this.renderer.$minLines > 1))
                highlight = false;
        }
        if (session.$highlightLineMarker && !highlight) {
            session.removeMarker(session.$highlightLineMarker.id);
            session.$highlightLineMarker = null;
        }
        else if (!session.$highlightLineMarker && highlight) {
            var range = new rng.Range(highlight.row, highlight.column, highlight.row, Infinity);
            range.id = session.addMarker(range, "ace_active-line", "screenLine");
            session.$highlightLineMarker = range;
        }
        else if (highlight) {
            session.$highlightLineMarker.start.row = highlight.row;
            session.$highlightLineMarker.end.row = highlight.row;
            session.$highlightLineMarker.start.column = highlight.column;
            session._signal("changeBackMarker");
        }
    };
    Editor.prototype.onSelectionChange = function (e) {
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
    Editor.prototype.onChangeFrontMarker = function () {
        this.renderer.updateFrontMarkers();
    };
    Editor.prototype.onChangeBackMarker = function () {
        this.renderer.updateBackMarkers();
    };
    Editor.prototype.onChangeBreakpoint = function () {
        this.renderer.updateBreakpoints();
    };
    Editor.prototype.onChangeAnnotation = function () {
        this.renderer.setAnnotations(this.session.getAnnotations());
    };
    Editor.prototype.onChangeMode = function (e) {
        this.renderer.updateText();
        this._emit("changeMode", e);
    };
    Editor.prototype.onChangeWrapLimit = function () {
        this.renderer.updateFull();
    };
    Editor.prototype.onChangeWrapMode = function () {
        this.renderer.onResize(true);
    };
    Editor.prototype.onChangeFold = function () {
        this.$updateHighlightActiveLine();
        this.renderer.updateFull();
    };
    Editor.prototype.getSelectedText = function () {
        return this.session.getTextRange(this.getSelectionRange());
    };
    Editor.prototype.getCopyText = function () {
        var text = this.getSelectedText();
        this._signal("copy", text);
        return text;
    };
    Editor.prototype.onCopy = function () {
        this.commands.exec("copy", this);
    };
    Editor.prototype.onCut = function () {
        this.commands.exec("cut", this);
    };
    Editor.prototype.onPaste = function (text) {
        if (this.$readOnly)
            return;
        var e = { text: text };
        this._signal("paste", e);
        this.insert(e.text, true);
    };
    Editor.prototype.execCommand = function (command, args) {
        this.commands.exec(command, this, args);
    };
    Editor.prototype.insert = function (text, pasted) {
        var session = this.session;
        var mode = session.getMode();
        var cursor = this.getCursorPosition();
        if (this.getBehavioursEnabled() && !pasted) {
            var transform = mode.transformAction(session.getState(cursor.row), 'insertion', this, session, text);
            if (transform) {
                if (text !== transform.text) {
                    this.session.mergeUndoDeltas = false;
                    this.$mergeNextCommand = false;
                }
                text = transform.text;
            }
        }
        if (text == "\t")
            text = this.session.getTabString();
        if (!this.selection.isEmpty()) {
            var range = this.getSelectionRange();
            cursor = this.session.remove(range);
            this.clearSelection();
        }
        else if (this.session.getOverwrite()) {
            var range = rng.Range.fromPoints(cursor, cursor);
            range.end.column += text.length;
            this.session.remove(range);
        }
        if (text == "\n" || text == "\r\n") {
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
                this.selection.setSelectionRange(new rng.Range(cursor.row, start + transform.selection[0], cursor.row, start + transform.selection[1]));
            }
            else {
                this.selection.setSelectionRange(new rng.Range(cursor.row + transform.selection[0], transform.selection[1], cursor.row + transform.selection[2], transform.selection[3]));
            }
        }
        if (session.getDocument().isNewLine(text)) {
            var lineIndent = mode.getNextLineIndent(lineState, line.slice(0, cursor.column), session.getTabString());
            session.insert({ row: cursor.row + 1, column: 0 }, lineIndent);
        }
        if (shouldOutdent)
            mode.autoOutdent(lineState, session, cursor.row);
    };
    Editor.prototype.onTextInput = function (text) {
        this.keyBinding.onTextInput(text);
        if (text === '.') {
            this.commands.exec(protocol.COMMAND_NAME_AUTO_COMPLETE);
        }
        else if (this.getSession().getDocument().isNewLine(text)) {
            var lineNumber = this.getCursorPosition().row;
        }
    };
    Editor.prototype.onCommandKey = function (e, hashId, keyCode) {
        this.keyBinding.onCommandKey(e, hashId, keyCode);
    };
    Editor.prototype.setOverwrite = function (overwrite) {
        this.session.setOverwrite(overwrite);
    };
    Editor.prototype.getOverwrite = function () {
        return this.session.getOverwrite();
    };
    Editor.prototype.toggleOverwrite = function () {
        this.session.toggleOverwrite();
    };
    Editor.prototype.setScrollSpeed = function (speed) {
        this.setOption("scrollSpeed", speed);
    };
    Editor.prototype.getScrollSpeed = function () {
        return this.getOption("scrollSpeed");
    };
    Editor.prototype.setDragDelay = function (dragDelay) {
        this.setOption("dragDelay", dragDelay);
    };
    Editor.prototype.getDragDelay = function () {
        return this.getOption("dragDelay");
    };
    Editor.prototype.setSelectionStyle = function (val) {
        this.setOption("selectionStyle", val);
    };
    Editor.prototype.getSelectionStyle = function () {
        return this.getOption("selectionStyle");
    };
    Editor.prototype.setHighlightActiveLine = function (shouldHighlight) {
        this.setOption("highlightActiveLine", shouldHighlight);
    };
    Editor.prototype.getHighlightActiveLine = function () {
        return this.getOption("highlightActiveLine");
    };
    Editor.prototype.setHighlightGutterLine = function (shouldHighlight) {
        this.setOption("highlightGutterLine", shouldHighlight);
    };
    Editor.prototype.getHighlightGutterLine = function () {
        return this.getOption("highlightGutterLine");
    };
    Editor.prototype.setHighlightSelectedWord = function (shouldHighlight) {
        this.setOption("highlightSelectedWord", shouldHighlight);
    };
    Editor.prototype.getHighlightSelectedWord = function () {
        return this.$highlightSelectedWord;
    };
    Editor.prototype.setAnimatedScroll = function (shouldAnimate) {
        this.renderer.setAnimatedScroll(shouldAnimate);
    };
    Editor.prototype.getAnimatedScroll = function () {
        return this.renderer.getAnimatedScroll();
    };
    Editor.prototype.setShowInvisibles = function (showInvisibles) {
        this.renderer.setShowInvisibles(showInvisibles);
    };
    Editor.prototype.getShowInvisibles = function () {
        return this.renderer.getShowInvisibles();
    };
    Editor.prototype.setDisplayIndentGuides = function (displayIndentGuides) {
        this.renderer.setDisplayIndentGuides(displayIndentGuides);
    };
    Editor.prototype.getDisplayIndentGuides = function () {
        return this.renderer.getDisplayIndentGuides();
    };
    Editor.prototype.setShowPrintMargin = function (showPrintMargin) {
        this.renderer.setShowPrintMargin(showPrintMargin);
    };
    Editor.prototype.getShowPrintMargin = function () {
        return this.renderer.getShowPrintMargin();
    };
    Editor.prototype.setPrintMarginColumn = function (showPrintMargin) {
        this.renderer.setPrintMarginColumn(showPrintMargin);
    };
    Editor.prototype.getPrintMarginColumn = function () {
        return this.renderer.getPrintMarginColumn();
    };
    Editor.prototype.setReadOnly = function (readOnly) {
        this.setOption("readOnly", readOnly);
    };
    Editor.prototype.getReadOnly = function () {
        return this.getOption("readOnly");
    };
    Editor.prototype.setBehavioursEnabled = function (enabled) {
        this.setOption("behavioursEnabled", enabled);
    };
    Editor.prototype.getBehavioursEnabled = function () {
        return this.getOption("behavioursEnabled");
    };
    Editor.prototype.setWrapBehavioursEnabled = function (enabled) {
        this.setOption("wrapBehavioursEnabled", enabled);
    };
    Editor.prototype.getWrapBehavioursEnabled = function () {
        return this.getOption("wrapBehavioursEnabled");
    };
    Editor.prototype.setShowFoldWidgets = function (show) {
        this.setOption("showFoldWidgets", show);
    };
    Editor.prototype.getShowFoldWidgets = function () {
        return this.getOption("showFoldWidgets");
    };
    Editor.prototype.setFadeFoldWidgets = function (fade) {
        this.setOption("fadeFoldWidgets", fade);
    };
    Editor.prototype.getFadeFoldWidgets = function () {
        return this.getOption("fadeFoldWidgets");
    };
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
    Editor.prototype.removeWordRight = function () {
        if (this.selection.isEmpty())
            this.selection.selectWordRight();
        this.session.remove(this.getSelectionRange());
        this.clearSelection();
    };
    Editor.prototype.removeWordLeft = function () {
        if (this.selection.isEmpty())
            this.selection.selectWordLeft();
        this.session.remove(this.getSelectionRange());
        this.clearSelection();
    };
    Editor.prototype.removeToLineStart = function () {
        if (this.selection.isEmpty())
            this.selection.selectLineStart();
        this.session.remove(this.getSelectionRange());
        this.clearSelection();
    };
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
    Editor.prototype.splitLine = function () {
        if (!this.selection.isEmpty()) {
            this.session.remove(this.getSelectionRange());
            this.clearSelection();
        }
        var cursor = this.getCursorPosition();
        this.insert("\n");
        this.moveCursorToPosition(cursor);
    };
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
            range = new rng.Range(cursor.row, column - 1, cursor.row, column + 1);
        }
        else {
            swap = line.charAt(column - 1) + line.charAt(column - 2);
            range = new rng.Range(cursor.row, column - 2, cursor.row, column);
        }
        this.session.replace(range, swap);
    };
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
            var indentString = lang.stringRepeat(" ", count);
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
    Editor.prototype.blockIndent = function () {
        var rows = this.$getSelectedRows();
        this.session.indentRows(rows.first, rows.last, "\t");
    };
    Editor.prototype.blockOutdent = function () {
        var selection = this.session.getSelection();
        this.session.outdentRows(selection.getRange());
    };
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
        var deleteRange = new rng.Range(0, 0, 0, 0);
        for (var i = rows.first; i <= rows.last; i++) {
            var line = session.getLine(i);
            deleteRange.start.row = i;
            deleteRange.end.row = i;
            deleteRange.end.column = line.length;
            session.replace(deleteRange, lines[i - rows.first]);
        }
    };
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
    Editor.prototype.getNumberAt = function (row, column) {
        var _numberRx = /[\-]?[0-9]+(?:\.[0-9]+)?/g;
        _numberRx.lastIndex = 0;
        var s = this.session.getLine(row);
        while (_numberRx.lastIndex < column) {
            var m = _numberRx.exec(s);
            if (m.index <= column && m.index + m[0].length >= column) {
                var number = {
                    value: m[0],
                    start: m.index,
                    end: m.index + m[0].length
                };
                return number;
            }
        }
        return null;
    };
    Editor.prototype.modifyNumber = function (amount) {
        var row = this.selection.getCursor().row;
        var column = this.selection.getCursor().column;
        var charRange = new rng.Range(row, column - 1, row, column);
        var c = parseFloat(this.session.getTextRange(charRange));
        if (!isNaN(c) && isFinite(c)) {
            var nr = this.getNumberAt(row, column);
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
                var replaceRange = new rng.Range(row, nr.start, row, nr.end);
                this.session.replace(replaceRange, nnr);
                this.moveCursorTo(row, Math.max(nr.start + 1, column + nnr.length - nr.value.length));
            }
        }
    };
    Editor.prototype.removeLines = function () {
        var rows = this.$getSelectedRows();
        var range;
        if (rows.first === 0 || rows.last + 1 < this.session.getLength())
            range = new rng.Range(rows.first, 0, rows.last + 1, 0);
        else
            range = new rng.Range(rows.first - 1, this.session.getLine(rows.first - 1).length, rows.last, this.session.getLine(rows.last).length);
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
    Editor.prototype.moveLinesDown = function () {
        this.$moveLines(function (firstRow, lastRow) {
            return this.session.moveLinesDown(firstRow, lastRow);
        });
    };
    Editor.prototype.moveLinesUp = function () {
        this.$moveLines(function (firstRow, lastRow) {
            return this.session.moveLinesUp(firstRow, lastRow);
        });
    };
    Editor.prototype.moveText = function (range, toPosition, copy) {
        return this.session.moveText(range, toPosition, copy);
    };
    Editor.prototype.copyLinesUp = function () {
        this.$moveLines(function (firstRow, lastRow) {
            this.session.duplicateLines(firstRow, lastRow);
            return 0;
        });
    };
    Editor.prototype.copyLinesDown = function () {
        this.$moveLines(function (firstRow, lastRow) {
            return this.session.duplicateLines(firstRow, lastRow);
        });
    };
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
    Editor.prototype.getFirstVisibleRow = function () {
        return this.renderer.getFirstVisibleRow();
    };
    Editor.prototype.getLastVisibleRow = function () {
        return this.renderer.getLastVisibleRow();
    };
    Editor.prototype.isRowVisible = function (row) {
        return (row >= this.getFirstVisibleRow() && row <= this.getLastVisibleRow());
    };
    Editor.prototype.isRowFullyVisible = function (row) {
        return (row >= this.renderer.getFirstFullyVisibleRow() && row <= this.renderer.getLastFullyVisibleRow());
    };
    Editor.prototype.$getVisibleRowCount = function () {
        return this.renderer.getScrollBottomRow() - this.renderer.getScrollTopRow() + 1;
    };
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
        if (select != null) {
            renderer.scrollCursorIntoView(null, 0.5);
        }
        renderer.animateScrolling(scrollTop);
    };
    Editor.prototype.selectPageDown = function () {
        this.$moveByPage(+1, true);
    };
    Editor.prototype.selectPageUp = function () {
        this.$moveByPage(-1, true);
    };
    Editor.prototype.gotoPageDown = function () {
        this.$moveByPage(+1, false);
    };
    Editor.prototype.gotoPageUp = function () {
        this.$moveByPage(-1, false);
    };
    Editor.prototype.scrollPageDown = function () {
        this.$moveByPage(1);
    };
    Editor.prototype.scrollPageUp = function () {
        this.$moveByPage(-1);
    };
    Editor.prototype.scrollToRow = function (row) {
        this.renderer.scrollToRow(row);
    };
    Editor.prototype.scrollToLine = function (line, center, animate, callback) {
        this.renderer.scrollToLine(line, center, animate, callback);
    };
    Editor.prototype.centerSelection = function () {
        var range = this.getSelectionRange();
        var pos = {
            row: Math.floor(range.start.row + (range.end.row - range.start.row) / 2),
            column: Math.floor(range.start.column + (range.end.column - range.start.column) / 2)
        };
        this.renderer.alignCursor(pos, 0.5);
    };
    Editor.prototype.getCursorPosition = function () {
        return this.selection.getCursor();
    };
    Editor.prototype.getCursorPositionScreen = function () {
        var cursor = this.getCursorPosition();
        return this.session.documentToScreenPosition(cursor.row, cursor.column);
    };
    Editor.prototype.getSelectionRange = function () {
        return this.selection.getRange();
    };
    Editor.prototype.selectAll = function () {
        this.$blockScrolling += 1;
        this.selection.selectAll();
        this.$blockScrolling -= 1;
    };
    Editor.prototype.clearSelection = function () {
        this.selection.clearSelection();
    };
    Editor.prototype.moveCursorTo = function (row, column, animate) {
        this.selection.moveCursorTo(row, column, animate);
    };
    Editor.prototype.moveCursorToPosition = function (pos) {
        this.selection.moveCursorToPosition(pos);
    };
    Editor.prototype.jumpToMatching = function (select) {
        var cursor = this.getCursorPosition();
        var iterator = new TokenIterator(this.session, cursor.row, cursor.column);
        var prevToken = iterator.getCurrentToken();
        var token = prevToken;
        if (!token)
            token = iterator.stepForward();
        if (!token)
            return;
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
        if (!matchType) {
            return;
        }
        var range;
        if (matchType === 'bracket') {
            range = this.session.getBracketRange(cursor);
            if (!range) {
                range = new rng.Range(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + i - 1, iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + i - 1);
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
            var range = new rng.Range(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() - 2, iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() - 2);
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
    Editor.prototype.gotoLine = function (lineNumber, column, animate) {
        this.selection.clearSelection();
        this.session.unfold({ row: lineNumber - 1, column: column || 0 });
        this.$blockScrolling += 1;
        this.exitMultiSelectMode && this.exitMultiSelectMode();
        this.moveCursorTo(lineNumber - 1, column || 0);
        this.$blockScrolling -= 1;
        if (!this.isRowFullyVisible(lineNumber - 1)) {
            this.scrollToLine(lineNumber - 1, true, animate);
        }
    };
    Editor.prototype.navigateTo = function (row, column) {
        this.selection.moveTo(row, column);
    };
    Editor.prototype.navigateUp = function (times) {
        if (this.selection.isMultiLine() && !this.selection.isBackwards()) {
            var selectionStart = this.selection.anchor.getPosition();
            return this.moveCursorToPosition(selectionStart);
        }
        this.selection.clearSelection();
        this.selection.moveCursorBy(-times || -1, 0);
    };
    Editor.prototype.navigateDown = function (times) {
        if (this.selection.isMultiLine() && this.selection.isBackwards()) {
            var selectionEnd = this.selection.anchor.getPosition();
            return this.moveCursorToPosition(selectionEnd);
        }
        this.selection.clearSelection();
        this.selection.moveCursorBy(times || 1, 0);
    };
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
    Editor.prototype.navigateLineStart = function () {
        this.selection.moveCursorLineStart();
        this.clearSelection();
    };
    Editor.prototype.navigateLineEnd = function () {
        this.selection.moveCursorLineEnd();
        this.clearSelection();
    };
    Editor.prototype.navigateFileEnd = function () {
        this.selection.moveCursorFileEnd();
        this.clearSelection();
    };
    Editor.prototype.navigateFileStart = function () {
        this.selection.moveCursorFileStart();
        this.clearSelection();
    };
    Editor.prototype.navigateWordRight = function () {
        this.selection.moveCursorWordRight();
        this.clearSelection();
    };
    Editor.prototype.navigateWordLeft = function () {
        this.selection.moveCursorWordLeft();
        this.clearSelection();
    };
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
    Editor.prototype.getLastSearchOptions = function () {
        return this.$search.getOptions();
    };
    Editor.prototype.find = function (needle, options, animate) {
        if (!options)
            options = {};
        if (typeof needle == "string" || needle instanceof RegExp)
            options.needle = needle;
        else if (typeof needle == "object")
            oop.mixin(options, needle);
        var range = this.selection.getRange();
        if (options.needle == null) {
            needle = this.session.getTextRange(range)
                || this.$search.$options.needle;
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
        if (options.backwards)
            range.start = range.end;
        else
            range.end = range.start;
        this.selection.setRange(range);
    };
    Editor.prototype.findNext = function (needle, animate) {
        this.find(needle, { skipCurrent: true, backwards: false }, animate);
    };
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
    Editor.prototype.undo = function () {
        this.$blockScrolling++;
        this.session.getUndoManager().undo();
        this.$blockScrolling--;
        this.renderer.scrollCursorIntoView(null, 0.5);
    };
    Editor.prototype.redo = function () {
        this.$blockScrolling++;
        this.session.getUndoManager().redo();
        this.$blockScrolling--;
        this.renderer.scrollCursorIntoView(null, 0.5);
    };
    Editor.prototype.destroy = function () {
        this.renderer.destroy();
        this._signal("destroy", this);
    };
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
        if (!cursorLayer)
            return;
        cursorLayer.setSmoothBlinking(/smooth/.test(style));
        cursorLayer.isBlinking = !this.$readOnly && style != "wide";
        dom.setCssClass(cursorLayer.element, "ace_slim-cursors", /slim/.test(style));
    };
    return Editor;
})(eve.EventEmitterClass);
config.defineOptions(Editor.prototype, "editor", {
    selectionStyle: {
        set: function (style) {
            this.onSelectionChange();
            this._signal("changeSelectionStyle", { data: style });
        },
        initialValue: "line"
    },
    highlightActiveLine: {
        set: function () { this.$updateHighlightActiveLine(); },
        initialValue: true
    },
    highlightSelectedWord: {
        set: function (shouldHighlight) { this.$onSelectionChange(); },
        initialValue: true
    },
    readOnly: {
        set: function (readOnly) {
            this.$resetCursorStyle();
        },
        initialValue: false
    },
    cursorStyle: {
        set: function (val) { this.$resetCursorStyle(); },
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
        set: function (val) { this.setAutoScrollEditorIntoView(val); }
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
        editor.on("click", function (e) {
            var position = e.getDocumentPosition();
            var session = editor.session;
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
        var _self = this;
        this.editor = editor;
        editor.setDefaultHandler('mousedown', makeMouseDownHandler(editor, this));
        editor.setDefaultHandler('mousewheel', makeMouseWheelHandler(editor, this));
        editor.setDefaultHandler("dblclick", makeDoubleClickHandler(editor, this));
        editor.setDefaultHandler("tripleclick", makeTripleClickHandler(editor, this));
        editor.setDefaultHandler("quadclick", makeQuadClickHandler(editor, this));
        this.selectByLines = makeExtendSelectionBy(editor, this, "getLineRange");
        this.selectByWords = makeExtendSelectionBy(editor, this, "getWordRange");
        new GutterHandler(this);
        var onMouseDown = function (e) {
            if (!editor.isFocused() && editor.textInput) {
                editor.textInput.moveToMouse(e);
            }
            editor.focus();
        };
        var mouseTarget = editor.renderer.getMouseEventTarget();
        event.addListener(mouseTarget, "click", this.onMouseEvent.bind(this, "click"));
        event.addListener(mouseTarget, "mousemove", this.onMouseMove.bind(this, "mousemove"));
        event.addMultiMouseDownListener(mouseTarget, [400, 300, 250], this, "onMouseEvent");
        if (editor.renderer.scrollBarV) {
            event.addMultiMouseDownListener(editor.renderer.scrollBarV.inner, [400, 300, 250], this, "onMouseEvent");
            event.addMultiMouseDownListener(editor.renderer.scrollBarH.inner, [400, 300, 250], this, "onMouseEvent");
            if (userAgent.isIE) {
                event.addListener(editor.renderer.scrollBarV.element, "mousedown", onMouseDown);
                event.addListener(editor.renderer.scrollBarH.element, "mousemove", onMouseDown);
            }
        }
        event.addMouseWheelListener(editor.container, this.emitEditorMouseWheelEvent.bind(this, "mousewheel"));
        var gutterEl = editor.renderer.$gutter;
        event.addListener(gutterEl, "mousedown", this.onMouseEvent.bind(this, "guttermousedown"));
        event.addListener(gutterEl, "click", this.onMouseEvent.bind(this, "gutterclick"));
        event.addListener(gutterEl, "dblclick", this.onMouseEvent.bind(this, "gutterdblclick"));
        event.addListener(gutterEl, "mousemove", this.onMouseEvent.bind(this, "guttermousemove"));
        event.addListener(mouseTarget, "mousedown", onMouseDown);
        event.addListener(gutterEl, "mousedown", function (e) {
            editor.focus();
            return event.preventDefault(e);
        });
        editor.on('mousemove', function (e) {
            if (_self.state || _self.$dragDelay || !_self.$dragEnabled) {
                return;
            }
            var char = editor.renderer.screenToTextCoordinates(e.x, e.y);
            var range = editor.session.selection.getRange();
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
        var listeners = this.editor._eventRegistry && this.editor._eventRegistry.mousemove;
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
        var renderer = this.editor.renderer;
        if (renderer.$keepTextAreaAtCursor) {
            renderer.$keepTextAreaAtCursor = null;
        }
        var onMouseMove = (function (editor, mouseHandler) {
            return function (mouseEvent) {
                if (!mouseEvent)
                    return;
                if (userAgent.isWebKit && !mouseEvent.which && mouseHandler.releaseMouse) {
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
        if (userAgent.isOldIE && ev.domEvent.type == "dblclick") {
            return setTimeout(function () { onCaptureEnd(ev); });
        }
        this.$onCaptureMouseMove = onMouseMove;
        this.releaseMouse = event.capture(this.editor.container, onMouseMove, onCaptureEnd);
        var timerId = setInterval(onCaptureInterval, 20);
    };
    MouseHandler.prototype.cancelContextMenu = function () {
        var stop = function (e) {
            if (e && e.domEvent && e.domEvent.type != "contextmenu") {
                return;
            }
            this.editor.off("nativecontextmenu", stop);
            if (e && e.domEvent) {
                event.stopEvent(e.domEvent);
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
config.defineOptions(MouseHandler.prototype, "mouseHandler", {
    scrollSpeed: { initialValue: 2 },
    dragDelay: { initialValue: (userAgent.isMac ? 150 : 0) },
    dragEnabled: { initialValue: true },
    focusTimout: { initialValue: 0 },
    tooltipFollowsMouse: { initialValue: true }
});
var EditorMouseEvent = (function () {
    function EditorMouseEvent(domEvent, editor) {
        this.propagationStopped = false;
        this.defaultPrevented = false;
        this.getAccelKey = userAgent.isMac ? function () { return this.domEvent.metaKey; } : function () { return this.domEvent.ctrlKey; };
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
        event.stopPropagation(this.domEvent);
        this.propagationStopped = true;
    };
    EditorMouseEvent.prototype.preventDefault = function () {
        event.preventDefault(this.domEvent);
        this.defaultPrevented = true;
    };
    EditorMouseEvent.prototype.stop = function () {
        this.stopPropagation();
        this.preventDefault();
    };
    EditorMouseEvent.prototype.getDocumentPosition = function () {
        if (!this.$pos) {
            this.$pos = this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
        }
        return this.$pos;
    };
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
    EditorMouseEvent.prototype.getButton = function () {
        return event.getButton(this.domEvent);
    };
    EditorMouseEvent.prototype.getShiftKey = function () {
        return this.domEvent.shiftKey;
    };
    return EditorMouseEvent;
})();
var DRAG_OFFSET = 0;
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
            editor.textInput.onContextMenu(ev.domEvent);
            return;
        }
        mouseHandler.mousedownEvent.time = Date.now();
        if (inSelection && !editor.isFocused()) {
            editor.focus();
            if (mouseHandler.$focusTimout && !mouseHandler.$clickSelection && !editor.inMultiSelectMode) {
                mouseHandler.setState("focusWait");
                mouseHandler.captureMouse(ev);
                return;
            }
        }
        mouseHandler.captureMouse(ev);
        mouseHandler.startSelect(pos, ev.domEvent['_clicks'] > 1);
        return ev.preventDefault();
    };
}
function makeMouseWheelHandler(editor, mouseHandler) {
    return function (ev) {
        if (ev.getAccelKey()) {
            return;
        }
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
            var selection = editor.session.selection;
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
                return hideTooltip();
            }
            var maxRow = editor.session.getLength();
            if (row == maxRow) {
                var screenRow = editor.renderer.pixelToScreenCoordinates(0, mouseEvent.clientY).row;
                var pos = mouseEvent.getDocumentPosition();
                if (screenRow > editor.session.documentToScreenRow(pos.row, pos.column)) {
                    return hideTooltip();
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
        function hideTooltip() {
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = undefined;
            }
            if (tooltipAnnotation) {
                tooltip.hide();
                tooltipAnnotation = null;
                editor.removeEventListener("mousewheel", hideTooltip);
            }
        }
        function moveTooltip(event) {
            tooltip.setPosition(event.clientX, event.clientY);
        }
        mouseHandler.editor.setDefaultHandler("guttermousemove", function (e) {
            var target = e.domEvent.target || e.domEvent.srcElement;
            if (dom.hasCssClass(target, "ace_fold-widget")) {
                return hideTooltip();
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
                    hideTooltip();
            }, 50);
        });
        event.addListener(editor.renderer.$gutter, "mouseout", function (e) {
            mouseEvent = null;
            if (!tooltipAnnotation || tooltipTimeout)
                return;
            tooltipTimeout = setTimeout(function () {
                tooltipTimeout = null;
                hideTooltip();
            }, 50);
        });
        editor.on("changeSession", hideTooltip);
    }
    return GutterHandler;
})();
var GutterTooltip = (function (_super) {
    __extends(GutterTooltip, _super);
    function GutterTooltip(parentNode) {
        _super.call(this, parentNode);
    }
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
})(ttm.Tooltip);
module.exports = Editor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0VkaXRvci50cyJdLCJuYW1lcyI6WyJFZGl0b3IiLCJFZGl0b3IuY29uc3RydWN0b3IiLCJFZGl0b3IuY2FuY2VsTW91c2VDb250ZXh0TWVudSIsIkVkaXRvci5zZWxlY3Rpb24iLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMiLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMubGFzdCIsIkVkaXRvci5zdGFydE9wZXJhdGlvbiIsIkVkaXRvci5lbmRPcGVyYXRpb24iLCJFZGl0b3IuJGhpc3RvcnlUcmFja2VyIiwiRWRpdG9yLnNldEtleWJvYXJkSGFuZGxlciIsIkVkaXRvci5nZXRLZXlib2FyZEhhbmRsZXIiLCJFZGl0b3Iuc2V0U2Vzc2lvbiIsIkVkaXRvci5nZXRTZXNzaW9uIiwiRWRpdG9yLnNldFZhbHVlIiwiRWRpdG9yLmdldFZhbHVlIiwiRWRpdG9yLmdldFNlbGVjdGlvbiIsIkVkaXRvci5yZXNpemUiLCJFZGl0b3Iuc2V0VGhlbWUiLCJFZGl0b3IuZ2V0VGhlbWUiLCJFZGl0b3Iuc2V0U3R5bGUiLCJFZGl0b3IudW5zZXRTdHlsZSIsIkVkaXRvci5nZXRGb250U2l6ZSIsIkVkaXRvci5zZXRGb250U2l6ZSIsIkVkaXRvci4kaGlnaGxpZ2h0QnJhY2tldHMiLCJFZGl0b3IuJGhpZ2hsaWdodFRhZ3MiLCJFZGl0b3IuZm9jdXMiLCJFZGl0b3IuaXNGb2N1c2VkIiwiRWRpdG9yLmJsdXIiLCJFZGl0b3Iub25Gb2N1cyIsIkVkaXRvci5vbkJsdXIiLCJFZGl0b3IuJGN1cnNvckNoYW5nZSIsIkVkaXRvci5vbkRvY3VtZW50Q2hhbmdlIiwiRWRpdG9yLm9uVG9rZW5pemVyVXBkYXRlIiwiRWRpdG9yLm9uU2Nyb2xsVG9wQ2hhbmdlIiwiRWRpdG9yLm9uU2Nyb2xsTGVmdENoYW5nZSIsIkVkaXRvci5vbkN1cnNvckNoYW5nZSIsIkVkaXRvci4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5vblNlbGVjdGlvbkNoYW5nZSIsIkVkaXRvci4kZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwIiwiRWRpdG9yLm9uQ2hhbmdlRnJvbnRNYXJrZXIiLCJFZGl0b3Iub25DaGFuZ2VCYWNrTWFya2VyIiwiRWRpdG9yLm9uQ2hhbmdlQnJlYWtwb2ludCIsIkVkaXRvci5vbkNoYW5nZUFubm90YXRpb24iLCJFZGl0b3Iub25DaGFuZ2VNb2RlIiwiRWRpdG9yLm9uQ2hhbmdlV3JhcExpbWl0IiwiRWRpdG9yLm9uQ2hhbmdlV3JhcE1vZGUiLCJFZGl0b3Iub25DaGFuZ2VGb2xkIiwiRWRpdG9yLmdldFNlbGVjdGVkVGV4dCIsIkVkaXRvci5nZXRDb3B5VGV4dCIsIkVkaXRvci5vbkNvcHkiLCJFZGl0b3Iub25DdXQiLCJFZGl0b3Iub25QYXN0ZSIsIkVkaXRvci5leGVjQ29tbWFuZCIsIkVkaXRvci5pbnNlcnQiLCJFZGl0b3Iub25UZXh0SW5wdXQiLCJFZGl0b3Iub25Db21tYW5kS2V5IiwiRWRpdG9yLnNldE92ZXJ3cml0ZSIsIkVkaXRvci5nZXRPdmVyd3JpdGUiLCJFZGl0b3IudG9nZ2xlT3ZlcndyaXRlIiwiRWRpdG9yLnNldFNjcm9sbFNwZWVkIiwiRWRpdG9yLmdldFNjcm9sbFNwZWVkIiwiRWRpdG9yLnNldERyYWdEZWxheSIsIkVkaXRvci5nZXREcmFnRGVsYXkiLCJFZGl0b3Iuc2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3IuZ2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3Iuc2V0SGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5nZXRIaWdobGlnaHRBY3RpdmVMaW5lIiwiRWRpdG9yLnNldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIkVkaXRvci5zZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkIiwiRWRpdG9yLnNldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLmdldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLnNldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLmdldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJFZGl0b3IuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIkVkaXRvci5zZXRTaG93UHJpbnRNYXJnaW4iLCJFZGl0b3IuZ2V0U2hvd1ByaW50TWFyZ2luIiwiRWRpdG9yLnNldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLmdldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLnNldFJlYWRPbmx5IiwiRWRpdG9yLmdldFJlYWRPbmx5IiwiRWRpdG9yLnNldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLmdldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLnNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5nZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQiLCJFZGl0b3Iuc2V0U2hvd0ZvbGRXaWRnZXRzIiwiRWRpdG9yLmdldFNob3dGb2xkV2lkZ2V0cyIsIkVkaXRvci5zZXRGYWRlRm9sZFdpZGdldHMiLCJFZGl0b3IuZ2V0RmFkZUZvbGRXaWRnZXRzIiwiRWRpdG9yLnJlbW92ZSIsIkVkaXRvci5yZW1vdmVXb3JkUmlnaHQiLCJFZGl0b3IucmVtb3ZlV29yZExlZnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lU3RhcnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lRW5kIiwiRWRpdG9yLnNwbGl0TGluZSIsIkVkaXRvci50cmFuc3Bvc2VMZXR0ZXJzIiwiRWRpdG9yLnRvTG93ZXJDYXNlIiwiRWRpdG9yLnRvVXBwZXJDYXNlIiwiRWRpdG9yLmluZGVudCIsIkVkaXRvci5ibG9ja0luZGVudCIsIkVkaXRvci5ibG9ja091dGRlbnQiLCJFZGl0b3Iuc29ydExpbmVzIiwiRWRpdG9yLnRvZ2dsZUNvbW1lbnRMaW5lcyIsIkVkaXRvci50b2dnbGVCbG9ja0NvbW1lbnQiLCJFZGl0b3IuZ2V0TnVtYmVyQXQiLCJFZGl0b3IubW9kaWZ5TnVtYmVyIiwiRWRpdG9yLnJlbW92ZUxpbmVzIiwiRWRpdG9yLmR1cGxpY2F0ZVNlbGVjdGlvbiIsIkVkaXRvci5tb3ZlTGluZXNEb3duIiwiRWRpdG9yLm1vdmVMaW5lc1VwIiwiRWRpdG9yLm1vdmVUZXh0IiwiRWRpdG9yLmNvcHlMaW5lc1VwIiwiRWRpdG9yLmNvcHlMaW5lc0Rvd24iLCJFZGl0b3IuJG1vdmVMaW5lcyIsIkVkaXRvci4kZ2V0U2VsZWN0ZWRSb3dzIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25TdGFydCIsIkVkaXRvci5vbkNvbXBvc2l0aW9uVXBkYXRlIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25FbmQiLCJFZGl0b3IuZ2V0Rmlyc3RWaXNpYmxlUm93IiwiRWRpdG9yLmdldExhc3RWaXNpYmxlUm93IiwiRWRpdG9yLmlzUm93VmlzaWJsZSIsIkVkaXRvci5pc1Jvd0Z1bGx5VmlzaWJsZSIsIkVkaXRvci4kZ2V0VmlzaWJsZVJvd0NvdW50IiwiRWRpdG9yLiRtb3ZlQnlQYWdlIiwiRWRpdG9yLnNlbGVjdFBhZ2VEb3duIiwiRWRpdG9yLnNlbGVjdFBhZ2VVcCIsIkVkaXRvci5nb3RvUGFnZURvd24iLCJFZGl0b3IuZ290b1BhZ2VVcCIsIkVkaXRvci5zY3JvbGxQYWdlRG93biIsIkVkaXRvci5zY3JvbGxQYWdlVXAiLCJFZGl0b3Iuc2Nyb2xsVG9Sb3ciLCJFZGl0b3Iuc2Nyb2xsVG9MaW5lIiwiRWRpdG9yLmNlbnRlclNlbGVjdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvblNjcmVlbiIsIkVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSIsIkVkaXRvci5zZWxlY3RBbGwiLCJFZGl0b3IuY2xlYXJTZWxlY3Rpb24iLCJFZGl0b3IubW92ZUN1cnNvclRvIiwiRWRpdG9yLm1vdmVDdXJzb3JUb1Bvc2l0aW9uIiwiRWRpdG9yLmp1bXBUb01hdGNoaW5nIiwiRWRpdG9yLmdvdG9MaW5lIiwiRWRpdG9yLm5hdmlnYXRlVG8iLCJFZGl0b3IubmF2aWdhdGVVcCIsIkVkaXRvci5uYXZpZ2F0ZURvd24iLCJFZGl0b3IubmF2aWdhdGVMZWZ0IiwiRWRpdG9yLm5hdmlnYXRlUmlnaHQiLCJFZGl0b3IubmF2aWdhdGVMaW5lU3RhcnQiLCJFZGl0b3IubmF2aWdhdGVMaW5lRW5kIiwiRWRpdG9yLm5hdmlnYXRlRmlsZUVuZCIsIkVkaXRvci5uYXZpZ2F0ZUZpbGVTdGFydCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRMZWZ0IiwiRWRpdG9yLnJlcGxhY2UiLCJFZGl0b3IucmVwbGFjZUFsbCIsIkVkaXRvci4kdHJ5UmVwbGFjZSIsIkVkaXRvci5nZXRMYXN0U2VhcmNoT3B0aW9ucyIsIkVkaXRvci5maW5kIiwiRWRpdG9yLmZpbmROZXh0IiwiRWRpdG9yLmZpbmRQcmV2aW91cyIsIkVkaXRvci5yZXZlYWxSYW5nZSIsIkVkaXRvci51bmRvIiwiRWRpdG9yLnJlZG8iLCJFZGl0b3IuZGVzdHJveSIsIkVkaXRvci5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXciLCJFZGl0b3IuJHJlc2V0Q3Vyc29yU3R5bGUiLCJGb2xkSGFuZGxlciIsIkZvbGRIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyIiwiTW91c2VIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyLm9uTW91c2VFdmVudCIsIk1vdXNlSGFuZGxlci5vbk1vdXNlTW92ZSIsIk1vdXNlSGFuZGxlci5lbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50IiwiTW91c2VIYW5kbGVyLnNldFN0YXRlIiwiTW91c2VIYW5kbGVyLnRleHRDb29yZGluYXRlcyIsIk1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UiLCJNb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUiLCJNb3VzZUhhbmRsZXIuc2VsZWN0IiwiTW91c2VIYW5kbGVyLnNlbGVjdEJ5TGluZXNFbmQiLCJNb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QiLCJNb3VzZUhhbmRsZXIuc2VsZWN0RW5kIiwiTW91c2VIYW5kbGVyLnNlbGVjdEFsbEVuZCIsIk1vdXNlSGFuZGxlci5zZWxlY3RCeVdvcmRzRW5kIiwiTW91c2VIYW5kbGVyLmZvY3VzV2FpdCIsIkVkaXRvck1vdXNlRXZlbnQiLCJFZGl0b3JNb3VzZUV2ZW50LmNvbnN0cnVjdG9yIiwiRWRpdG9yTW91c2VFdmVudC50b0VsZW1lbnQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3BQcm9wYWdhdGlvbiIsIkVkaXRvck1vdXNlRXZlbnQucHJldmVudERlZmF1bHQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3AiLCJFZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24iLCJFZGl0b3JNb3VzZUV2ZW50LmluU2VsZWN0aW9uIiwiRWRpdG9yTW91c2VFdmVudC5nZXRCdXR0b24iLCJFZGl0b3JNb3VzZUV2ZW50LmdldFNoaWZ0S2V5IiwibWFrZU1vdXNlRG93bkhhbmRsZXIiLCJtYWtlTW91c2VXaGVlbEhhbmRsZXIiLCJtYWtlRG91YmxlQ2xpY2tIYW5kbGVyIiwibWFrZVRyaXBsZUNsaWNrSGFuZGxlciIsIm1ha2VRdWFkQ2xpY2tIYW5kbGVyIiwibWFrZUV4dGVuZFNlbGVjdGlvbkJ5IiwiY2FsY0Rpc3RhbmNlIiwiY2FsY1JhbmdlT3JpZW50YXRpb24iLCJHdXR0ZXJIYW5kbGVyIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3RvciIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3Iuc2hvd1Rvb2x0aXAiLCJHdXR0ZXJIYW5kbGVyLmNvbnN0cnVjdG9yLmhpZGVUb29sdGlwIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3Rvci5tb3ZlVG9vbHRpcCIsIkd1dHRlclRvb2x0aXAiLCJHdXR0ZXJUb29sdGlwLmNvbnN0cnVjdG9yIiwiR3V0dGVyVG9vbHRpcC5zZXRQb3NpdGlvbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFnQ0EsSUFBTyxHQUFHLFdBQVcsV0FBVyxDQUFDLENBQUM7QUFDbEMsSUFB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QUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7WUFFNUVBLElBQUlBLENBQUNBLG1CQUFtQkEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM5REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxrQkFBa0JBLEVBQUVBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7WUFFNUVBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ3REQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7WUFFdkVBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFFMUVBLElBQUlBLENBQUNBLG1CQUFtQkEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM5REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxrQkFBa0JBLEVBQUVBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7WUFFNUVBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxnQkFBZ0JBLENBQUNBLGNBQWNBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBRXRFQSxJ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ekNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLFNBQVNBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQy9DQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM1Q0EsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2hEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUMzQkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFDL0NBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBR2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxVQUFVQSxJQUFJQSxDQUFDQSxJQUFJQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMzQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsUUFBUUEsSUFBSUEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakRBLE1BQU1BLENBQUNBO1FBRVhBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3RFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMxQkEsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsQ0FBQ0E7WUFDbENBLFNBQVNBLEVBQUVBLElBQUlBO1lBQ2ZBLGFBQWFBLEVBQUVBLElBQUlBO1lBQ25CQSxNQUFNQSxFQUFFQSxNQUFNQTtTQUNqQkEsQ0FBQ0EsQ0FBQ0E7UUFFSEEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7SUFDZEEsQ0FBQ0E7SUFHRHRDLG9DQUFtQkEsR0FBbkJBO1FBQ0l1QyxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxrQkFBa0JBLEVBQUVBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQUVEdkMsbUNBQWtCQSxHQUFsQkE7UUFDSXdDLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7SUFDdENBLENBQUNBO0lBR0R4QyxtQ0FBa0JBLEdBQWxCQTtRQUNJeUMsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtJQUN0Q0EsQ0FBQ0E7SUFFRHpDLG1DQUFrQkEsR0FBbEJBO1FBQ0kwQyxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNoRUEsQ0FBQ0E7SUFHRDFDLDZCQUFZQSxHQUFaQSxVQUFhQSxDQUFFQTtRQUNYMkMsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFDM0JBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUdEM0Msa0NBQWlCQSxHQUFqQkE7UUFDSTRDLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO0lBQy9CQSxDQUFDQTtJQUVENUMsaUNBQWdCQSxHQUFoQkE7UUFDSTZDLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQ2pDQSxDQUFDQTtJQUdEN0MsNkJBQVlBLEdBQVpBO1FBR0k4QyxJQUFJQSxDQUFDQSwwQkFBMEJBLEVBQUVBLENBQUNBO1FBRWxDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtJQUMvQkEsQ0FBQ0E7SUFNRDlDLGdDQUFlQSxHQUFmQTtRQUNJK0MsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUMvREEsQ0FBQ0E7SUFhRC9DLDRCQUFXQSxHQUFYQTtRQUNJZ0QsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDbENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzNCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFLRGhELHVCQUFNQSxHQUFOQTtRQUNJaUQsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDckNBLENBQUNBO0lBS0RqRCxzQkFBS0EsR0FBTEE7UUFDSWtELElBQUlBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ3BDQSxDQUFDQTtJQWVEbEQsd0JBQU9BLEdBQVBBLFVBQVFBLElBQUlBO1FBRVJtRCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNmQSxNQUFNQSxDQUFDQTtRQUNYQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxDQUFDQTtRQUN2QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekJBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQzlCQSxDQUFDQTtJQUdEbkQsNEJBQVdBLEdBQVhBLFVBQVlBLE9BQU9BLEVBQUVBLElBQUtBO1FBQ3RCb0QsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDNUNBLENBQUNBO0lBT0RwRCx1QkFBTUEsR0FBTkEsVUFBT0EsSUFBSUEsRUFBRUEsTUFBT0E7UUFDaEJxRCxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUMzQkEsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDN0JBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7UUFFdENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLG9CQUFvQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFekNBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLFdBQVdBLEVBQUVBLElBQUlBLEVBQUVBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQ3JHQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxHQUFHQSxLQUFLQSxDQUFDQTtvQkFDckNBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7Z0JBQ25DQSxDQUFDQTtnQkFDREEsSUFBSUEsR0FBR0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFFMUJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBO1lBQ2JBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBR3ZDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtZQUNyQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1FBQzFCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQ0EsSUFBSUEsS0FBS0EsR0FBR0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDakRBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1lBQ2hDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMvQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsSUFBSUEsSUFBSUEsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3ZDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdENBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNsREEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0VBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1FBRXRCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUMxQkEsSUFBSUEsU0FBU0EsR0FBR0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZDQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM3REEsSUFBSUEsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFdkNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlB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QSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNiQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM1Q0EsSUFBSUEsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyREEsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMUVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pEQSxLQUFLQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUN0RUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDdENBLENB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QSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDaERBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUMzQkEsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFDaENBLElBQUlBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLHNCQUFzQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFM0VBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxJQUFJQSxHQUFHQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNuQ0EsSUFBSUEsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBO1lBQzFCQSxPQUFPQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxLQUFLQSxFQUFFQSxDQUFDQTtnQkFDOUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dC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QUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUU1REEsSUFBSUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFekRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTNCQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUV2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ0xBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBO2dCQUNwRkEsSUFBSUEsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0E7Z0JBRS9DQSxJQUFJQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDN0JBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO2dCQUc1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9CQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaERBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDSkEsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzVDQSxDQUFDQTtnQkFFREEsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0E7Z0JBQ1pBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO2dCQUM1QkEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBRzlCQSxJQUFJQSxZQUFZQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxLQUFLQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDN0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUd4Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFMUZBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xB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QTt3QkFDVEEsS0FBS0EsR0FBR0E7NEJBQ0pBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLEVBQUVBLENBQUNBOzRCQUVyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0NBQzVCQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtnQ0FDdEJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBOzRCQUNqQkEsQ0FBQ0E7NEJBQ0RBLEtBQUtBLENBQUNBO29CQUNkQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDNUJBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMzQkEsQ0FBQ0E7Z0JBRURBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUMxQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ3pCQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2xDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDekJBLENBQUNBO2dCQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDNUJBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO29CQUNsQkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ2pCQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVEEsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7Z0JBQ2xCQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtnQkFDL0JBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ1ZBLENBQUNBO1FBQ0xBLENBQUNBLFFBQVFBLEtBQUtBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBO1FBRzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxJQUFJQSxLQUFnQkEsQ0FBQ0E7UUFDckJBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLEtBQUtBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLEtBQUtBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLEtBQUtBLENBQ2pCQSxRQUFRQSxDQUFDQSxrQkFBa0JBLEVBQUVBLEVBQzdCQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEVBQ3hDQSxRQUFRQSxDQUFDQSxrQkFBa0JBLEVBQUVBLEVBQzdCQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQzNDQSxDQUFDQTtnQkFDRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7b0JBQ1BBLE1BQU1BLENBQUNBO2dCQUNYQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDdEJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEtBQUtBLE1BQU1BLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUNuRUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbERBLENBQUNBO1FBQ0xBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLEtBQUtBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0NBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1lBQzFCQSxJQUFJQTtnQkFDQUEsTUFBTUEsQ0FBQ0E7WUFFWEEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FDckJBLFFBQVFBLENBQUNBLGtCQUFrQkEsRUFBRUEsRUFDN0JBLFFBQVFBLENBQUNBLHFCQUFxQkEsRUFBRUEsR0FBR0EsQ0FBQ0EsRUFDcENBLFFBQVFBLENBQUNBLGtCQUFrQkEsRUFBRUEsRUFDN0JBLFFBQVFBLENBQUNBLHFCQUFxQkEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FDdkNBLENBQUNBO1lBR0ZBLEVB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QUFPQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0E7WUFDL0JBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRS9CQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekJBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBO21CQUNsQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDdkVBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQzlDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNB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Q0FBQ0E7WUFDN0JBLEtBQUtBLENBQUNBLHlCQUF5QkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsY0FBY0EsQ0FBQ0EsQ0FBQ0E7WUFDekdBLEtBQUtBLENBQUNBLHlCQUF5QkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsY0FBY0EsQ0FBQ0EsQ0FBQ0E7WUFDekdBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsRUFBRUEsV0FBV0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7Z0JBRWhGQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxFQUFFQSxXQUFXQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUNwRkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFHREEsS0FBS0EsQ0FBQ0EscUJBQXFCQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1FBRXZHQSxJQUFJQSxRQUFRQSxHQUFHQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUN2Q0EsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsRUFBRUEsV0FBV0EsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0Es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QUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsV0FBV0EsQ0FBQ0E7UUFDbkNBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLEdBQUdBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFDREEsZ0JBQUtBLENBQUNBLFdBQVdBLFlBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUNMRixvQkFBQ0E7QUFBREEsQ0FBQ0EsQUF6QkQsRUFBNEIsR0FBRyxDQUFDLE9BQU8sRUF5QnRDO0FBaDNCRCxpQkFBUyxNQUFNLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuLy9yZXF1aXJlKFwiLi9saWIvZml4b2xkYnJvd3NlcnNcIik7XG5cbmltcG9ydCBvb3AgPSByZXF1aXJlKFwiLi9saWIvb29wXCIpO1xuaW1wb3J0IGRvbSA9IHJlcXVpcmUoXCIuL2xpYi9kb21cIik7XG5pbXBvcnQgbGFuZyA9IHJlcXVpcmUoXCIuL2xpYi9sYW5nXCIpO1xuaW1wb3J0IHVzZXJBZ2VudCA9IHJlcXVpcmUoXCIuL2xpYi91c2VyYWdlbnRcIik7XG5pbXBvcnQgZ3VtID0gcmVxdWlyZShcIi4vbGF5ZXIvZ3V0dGVyXCIpO1xuaW1wb3J0IFRleHRJbnB1dCA9IHJlcXVpcmUoXCIuL2tleWJvYXJkL3RleHRpbnB1dFwiKTtcbmltcG9ydCBLZXlCaW5kaW5nID0gcmVxdWlyZShcIi4va2V5Ym9hcmQva2V5YmluZGluZ1wiKTtcbmltcG9ydCBlc20gPSByZXF1aXJlKFwiLi9lZGl0X3Nlc3Npb25cIik7XG5pbXBvcnQgU2VhcmNoID0gcmVxdWlyZShcIi4vc2VhcmNoXCIpO1xuaW1wb3J0IHJuZyA9IHJlcXVpcmUoXCIuL3JhbmdlXCIpO1xuaW1wb3J0IEN1cnNvclJhbmdlID0gcmVxdWlyZSgnLi9DdXJzb3JSYW5nZScpXG5pbXBvcnQgZXZlID0gcmVxdWlyZShcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIik7XG5pbXBvcnQgQ29tbWFuZE1hbmFnZXIgPSByZXF1aXJlKFwiLi9jb21tYW5kcy9Db21tYW5kTWFuYWdlclwiKTtcbmltcG9ydCBkZWZhdWx0Q29tbWFuZHMgPSByZXF1aXJlKFwiLi9jb21tYW5kcy9kZWZhdWx0X2NvbW1hbmRzXCIpO1xuaW1wb3J0IGNvbmZpZyA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbmltcG9ydCBUb2tlbkl0ZXJhdG9yID0gcmVxdWlyZShcIi4vVG9rZW5JdGVyYXRvclwiKTtcbmltcG9ydCBwcm90b2NvbCA9IHJlcXVpcmUoJy4vZWRpdG9yX3Byb3RvY29sJyk7XG5pbXBvcnQgdnJtID0gcmVxdWlyZSgnLi92aXJ0dWFsX3JlbmRlcmVyJyk7XG5pbXBvcnQgYWNtID0gcmVxdWlyZShcIi4vYXV0b2NvbXBsZXRlXCIpO1xuaW1wb3J0IHNlbSA9IHJlcXVpcmUoJy4vc2VsZWN0aW9uJyk7XG5pbXBvcnQgZXZlbnQgPSByZXF1aXJlKFwiLi9saWIvZXZlbnRcIik7XG5pbXBvcnQgdG91Y2ggPSByZXF1aXJlKCcuL3RvdWNoL3RvdWNoJyk7XG5pbXBvcnQgdHRtID0gcmVxdWlyZShcIi4vdG9vbHRpcFwiKTtcblxuLy92YXIgRHJhZ2Ryb3BIYW5kbGVyID0gcmVxdWlyZShcIi4vbW91c2UvZHJhZ2Ryb3BfaGFuZGxlclwiKS5EcmFnZHJvcEhhbmRsZXI7XG5cbi8qKlxuICogVGhlIG1haW4gZW50cnkgcG9pbnQgaW50byB0aGUgQWNlIGZ1bmN0aW9uYWxpdHkuXG4gKlxuICogVGhlIGBFZGl0b3JgIG1hbmFnZXMgdGhlIFtbRWRpdFNlc3Npb25dXSAod2hpY2ggbWFuYWdlcyBbW0RvY3VtZW50XV1zKSwgYXMgd2VsbCBhcyB0aGUgW1tWaXJ0dWFsUmVuZGVyZXJdXSwgd2hpY2ggZHJhd3MgZXZlcnl0aGluZyB0byB0aGUgc2NyZWVuLlxuICpcbiAqIEV2ZW50IHNlc3Npb25zIGRlYWxpbmcgd2l0aCB0aGUgbW91c2UgYW5kIGtleWJvYXJkIGFyZSBidWJibGVkIHVwIGZyb20gYERvY3VtZW50YCB0byB0aGUgYEVkaXRvcmAsIHdoaWNoIGRlY2lkZXMgd2hhdCB0byBkbyB3aXRoIHRoZW0uXG4gKiBAY2xhc3MgRWRpdG9yXG4gKi9cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBFZGl0b3JgIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge1ZpcnR1YWxSZW5kZXJlcn0gcmVuZGVyZXIgQXNzb2NpYXRlZCBgVmlydHVhbFJlbmRlcmVyYCB0aGF0IGRyYXdzIGV2ZXJ5dGhpbmdcbiAqIEBwYXJhbSB7RWRpdFNlc3Npb259IHNlc3Npb24gVGhlIGBFZGl0U2Vzc2lvbmAgdG8gcmVmZXIgdG9cbiAqXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmNsYXNzIEVkaXRvciBleHRlbmRzIGV2ZS5FdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHVibGljIHJlbmRlcmVyOiB2cm0uVmlydHVhbFJlbmRlcmVyO1xuICAgIHB1YmxpYyBzZXNzaW9uOiBlc20uRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSAkdG91Y2hIYW5kbGVyOiBJR2VzdHVyZUhhbmRsZXI7XG4gICAgcHJpdmF0ZSAkbW91c2VIYW5kbGVyOiBJR2VzdHVyZUhhbmRsZXI7XG4gICAgcHVibGljIGdldE9wdGlvbjtcbiAgICBwdWJsaWMgc2V0T3B0aW9uO1xuICAgIHB1YmxpYyBzZXRPcHRpb25zO1xuICAgIHB1YmxpYyAkaXNGb2N1c2VkO1xuICAgIHB1YmxpYyBjb21tYW5kcyA9IG5ldyBDb21tYW5kTWFuYWdlcih1c2VyQWdlbnQuaXNNYWMgPyBcIm1hY1wiIDogXCJ3aW5cIiwgZGVmYXVsdENvbW1hbmRzKTtcbiAgICBwdWJsaWMga2V5QmluZGluZztcbiAgICAvLyBGSVhNRTogVGhpcyBpcyByZWFsbHkgYW4gb3B0aW9uYWwgZXh0ZW5zaW9uIGFuZCBzbyBkb2VzIG5vdCBiZWxvbmcgaGVyZS5cbiAgICBwdWJsaWMgY29tcGxldGVyczogYWNtLkNvbXBsZXRlcltdO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHJlbmRlcmVyIGNvbnRhaW5lciBlbGVtZW50LlxuICAgICAqL1xuICAgIHB1YmxpYyBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICAgIHB1YmxpYyB0ZXh0SW5wdXQ7XG4gICAgcHVibGljIGluTXVsdGlTZWxlY3RNb2RlOiBib29sZWFuO1xuICAgIHB1YmxpYyBpblZpcnR1YWxTZWxlY3Rpb25Nb2RlO1xuXG4gICAgcHJpdmF0ZSAkY3Vyc29yU3R5bGU7XG4gICAgcHJpdmF0ZSAka2V5YmluZGluZ0lkO1xuICAgIHByaXZhdGUgJGJsb2NrU2Nyb2xsaW5nO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEFjdGl2ZUxpbmU7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0UGVuZGluZztcbiAgICBwcml2YXRlICRoaWdobGlnaHRTZWxlY3RlZFdvcmQ7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0VGFnUGVuZGluZztcbiAgICBwcml2YXRlICRtZXJnZVVuZG9EZWx0YXM7XG4gICAgcHVibGljICRyZWFkT25seTtcbiAgICBwcml2YXRlICRzY3JvbGxBbmNob3I7XG4gICAgcHJpdmF0ZSAkc2VhcmNoO1xuICAgIHByaXZhdGUgXyRlbWl0SW5wdXRFdmVudDtcbiAgICBwcml2YXRlIHNlbGVjdGlvbnM7XG4gICAgcHJpdmF0ZSAkc2VsZWN0aW9uU3R5bGU7XG4gICAgcHJpdmF0ZSAkb3BSZXNldFRpbWVyO1xuICAgIHByaXZhdGUgY3VyT3AgPSBudWxsO1xuICAgIHByaXZhdGUgcHJldk9wOiB7IGNvbW1hbmQ/OyBhcmdzP30gPSB7fTtcbiAgICBwcml2YXRlIHByZXZpb3VzQ29tbWFuZDtcbiAgICAvLyBUT0RPIHVzZSBwcm9wZXJ0eSBvbiBjb21tYW5kcyBpbnN0ZWFkIG9mIHRoaXNcbiAgICBwcml2YXRlICRtZXJnZWFibGVDb21tYW5kcyA9IFtcImJhY2tzcGFjZVwiLCBcImRlbFwiLCBcImluc2VydHN0cmluZ1wiXTtcbiAgICBwcml2YXRlIG1lcmdlTmV4dENvbW1hbmQ7XG4gICAgcHJpdmF0ZSAkbWVyZ2VOZXh0Q29tbWFuZDtcbiAgICBwcml2YXRlIHNlcXVlbmNlU3RhcnRUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkb25Eb2N1bWVudENoYW5nZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZU1vZGU7XG4gICAgcHJpdmF0ZSAkb25Ub2tlbml6ZXJVcGRhdGU7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VUYWJTaXplO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlV3JhcExpbWl0O1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlV3JhcE1vZGU7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VGb2xkO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlRnJvbnRNYXJrZXI7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VCYWNrTWFya2VyO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlQnJlYWtwb2ludDtcbiAgICBwcml2YXRlICRvbkNoYW5nZUFubm90YXRpb247XG4gICAgcHJpdmF0ZSAkb25DdXJzb3JDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25TY3JvbGxUb3BDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25TY3JvbGxMZWZ0Q2hhbmdlO1xuICAgIHByaXZhdGUgJG9uU2VsZWN0aW9uQ2hhbmdlO1xuICAgIHB1YmxpYyBleGl0TXVsdGlTZWxlY3RNb2RlO1xuICAgIHB1YmxpYyBmb3JFYWNoU2VsZWN0aW9uO1xuICAgIGNvbnN0cnVjdG9yKHJlbmRlcmVyOiB2cm0uVmlydHVhbFJlbmRlcmVyLCBzZXNzaW9uPzogZXNtLkVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuY29udGFpbmVyID0gcmVuZGVyZXIuZ2V0Q29udGFpbmVyRWxlbWVudCgpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyID0gcmVuZGVyZXI7XG5cbiAgICAgICAgdGhpcy50ZXh0SW5wdXQgPSBuZXcgVGV4dElucHV0KHJlbmRlcmVyLmdldFRleHRBcmVhQ29udGFpbmVyKCksIHRoaXMpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnRleHRhcmVhID0gdGhpcy50ZXh0SW5wdXQuZ2V0RWxlbWVudCgpO1xuICAgICAgICB0aGlzLmtleUJpbmRpbmcgPSBuZXcgS2V5QmluZGluZyh0aGlzKTtcblxuICAgICAgICBpZiAodXNlckFnZW50LmlzTW9iaWxlKSB7XG4gICAgICAgICAgICB0aGlzLiR0b3VjaEhhbmRsZXIgPSB0b3VjaC50b3VjaE1hbmFnZXIodGhpcyk7XG4gICAgICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIgPSBuZXcgTW91c2VIYW5kbGVyKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kdG91Y2hIYW5kbGVyID0gdG91Y2gudG91Y2hNYW5hZ2VyKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy4kbW91c2VIYW5kbGVyID0gbmV3IE1vdXNlSGFuZGxlcih0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ldyBGb2xkSGFuZGxlcih0aGlzKTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyA9IDA7XG4gICAgICAgIHRoaXMuJHNlYXJjaCA9IG5ldyBTZWFyY2goKS5zZXQoe1xuICAgICAgICAgICAgd3JhcDogdHJ1ZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLiRoaXN0b3J5VHJhY2tlciA9IHRoaXMuJGhpc3RvcnlUcmFja2VyLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuY29tbWFuZHMub24oXCJleGVjXCIsIHRoaXMuJGhpc3RvcnlUcmFja2VyKTtcblxuICAgICAgICB0aGlzLiRpbml0T3BlcmF0aW9uTGlzdGVuZXJzKCk7XG5cbiAgICAgICAgdGhpcy5fJGVtaXRJbnB1dEV2ZW50ID0gbGFuZy5kZWxheWVkQ2FsbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImlucHV0XCIsIHt9KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5iZ1Rva2VuaXplciAmJiB0aGlzLnNlc3Npb24uYmdUb2tlbml6ZXIuc2NoZWR1bGVTdGFydCgpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMub24oXCJjaGFuZ2VcIiwgZnVuY3Rpb24oXywgX3NlbGYpIHtcbiAgICAgICAgICAgIF9zZWxmLl8kZW1pdElucHV0RXZlbnQuc2NoZWR1bGUoMzEpO1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnNldFNlc3Npb24oc2Vzc2lvbiB8fCBuZXcgZXNtLkVkaXRTZXNzaW9uKFwiXCIpKTtcbiAgICAgICAgY29uZmlnLnJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgY29uZmlnLl9zaWduYWwoXCJlZGl0b3JcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgY2FuY2VsTW91c2VDb250ZXh0TWVudSgpIHtcbiAgICAgICAgdGhpcy4kbW91c2VIYW5kbGVyLmNhbmNlbENvbnRleHRNZW51KCk7XG4gICAgfVxuXG4gICAgZ2V0IHNlbGVjdGlvbigpOiBzZW0uU2VsZWN0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAkaW5pdE9wZXJhdGlvbkxpc3RlbmVycygpIHtcbiAgICAgICAgZnVuY3Rpb24gbGFzdChhKSB7IHJldHVybiBhW2EubGVuZ3RoIC0gMV0gfVxuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9ucyA9IFtdO1xuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiZXhlY1wiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3BlcmF0aW9uKGUpO1xuXG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IGUuY29tbWFuZDtcbiAgICAgICAgICAgIGlmIChjb21tYW5kLmFjZUNvbW1hbmRHcm91cCA9PSBcImZpbGVKdW1wXCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJldiA9IHRoaXMucHJldk9wO1xuICAgICAgICAgICAgICAgIGlmICghcHJldiB8fCBwcmV2LmNvbW1hbmQuYWNlQ29tbWFuZEdyb3VwICE9IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RGaWxlSnVtcFBvcyA9IGxhc3QodGhpcy5zZWxlY3Rpb25zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubGFzdEZpbGVKdW1wUG9zID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpLCB0cnVlKTtcblxuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiYWZ0ZXJFeGVjXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gZS5jb21tYW5kO1xuXG4gICAgICAgICAgICBpZiAoY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgPT0gXCJmaWxlSnVtcFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubGFzdEZpbGVKdW1wUG9zICYmICF0aGlzLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uZnJvbUpTT04odGhpcy5sYXN0RmlsZUp1bXBQb3MpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZW5kT3BlcmF0aW9uKGUpO1xuICAgICAgICB9LmJpbmQodGhpcyksIHRydWUpO1xuXG4gICAgICAgIHRoaXMuJG9wUmVzZXRUaW1lciA9IGxhbmcuZGVsYXllZENhbGwodGhpcy5lbmRPcGVyYXRpb24uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AgfHwgdGhpcy5zdGFydE9wZXJhdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5jdXJPcC5kb2NDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgfS5iaW5kKHRoaXMpLCB0cnVlKTtcblxuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5jdXJPcCB8fCB0aGlzLnN0YXJ0T3BlcmF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9LmJpbmQodGhpcyksIHRydWUpO1xuICAgIH1cblxuICAgIHN0YXJ0T3BlcmF0aW9uKGNvbW1hZEV2ZW50KSB7XG4gICAgICAgIGlmICh0aGlzLmN1ck9wKSB7XG4gICAgICAgICAgICBpZiAoIWNvbW1hZEV2ZW50IHx8IHRoaXMuY3VyT3AuY29tbWFuZClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLnByZXZPcCA9IHRoaXMuY3VyT3A7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFjb21tYWRFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5wcmV2aW91c0NvbW1hbmQgPSBudWxsO1xuICAgICAgICAgICAgY29tbWFkRXZlbnQgPSB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJG9wUmVzZXRUaW1lci5zY2hlZHVsZSgpO1xuICAgICAgICB0aGlzLmN1ck9wID0ge1xuICAgICAgICAgICAgY29tbWFuZDogY29tbWFkRXZlbnQuY29tbWFuZCB8fCB7fSxcbiAgICAgICAgICAgIGFyZ3M6IGNvbW1hZEV2ZW50LmFyZ3MsXG4gICAgICAgICAgICBzY3JvbGxUb3A6IHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9wXG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIGNvbW1hbmQgPSB0aGlzLmN1ck9wLmNvbW1hbmQ7XG4gICAgICAgIGlmIChjb21tYW5kICYmIGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcpXG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9ucy5wdXNoKHRoaXMuc2VsZWN0aW9uLnRvSlNPTigpKTtcbiAgICB9XG5cbiAgICBlbmRPcGVyYXRpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLmN1ck9wKSB7XG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IHRoaXMuY3VyT3AuY29tbWFuZDtcbiAgICAgICAgICAgIGlmIChjb21tYW5kICYmIGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZy0tO1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoY29tbWFuZC5zY3JvbGxJbnRvVmlldykge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiY2VudGVyXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KG51bGwsIDAuNSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImFuaW1hdGVcIjpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImN1cnNvclwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzZWxlY3Rpb25QYXJ0XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMucmVuZGVyZXIubGF5ZXJDb25maWc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ID49IGNvbmZpZy5sYXN0Um93IHx8IHJhbmdlLmVuZC5yb3cgPD0gY29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyh0aGlzLnNlbGVjdGlvbi5hbmNob3IsIHRoaXMuc2VsZWN0aW9uLmxlYWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcgPT0gXCJhbmltYXRlXCIpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyh0aGlzLmN1ck9wLnNjcm9sbFRvcCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMucHJldk9wID0gdGhpcy5jdXJPcDtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgJGhpc3RvcnlUcmFja2VyKGUpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRtZXJnZVVuZG9EZWx0YXMpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHByZXYgPSB0aGlzLnByZXZPcDtcbiAgICAgICAgdmFyIG1lcmdlYWJsZUNvbW1hbmRzID0gdGhpcy4kbWVyZ2VhYmxlQ29tbWFuZHM7XG4gICAgICAgIC8vIHByZXZpb3VzIGNvbW1hbmQgd2FzIHRoZSBzYW1lXG4gICAgICAgIHZhciBzaG91bGRNZXJnZSA9IHByZXYuY29tbWFuZCAmJiAoZS5jb21tYW5kLm5hbWUgPT0gcHJldi5jb21tYW5kLm5hbWUpO1xuICAgICAgICBpZiAoZS5jb21tYW5kLm5hbWUgPT0gXCJpbnNlcnRzdHJpbmdcIikge1xuICAgICAgICAgICAgdmFyIHRleHQgPSBlLmFyZ3M7XG4gICAgICAgICAgICBpZiAodGhpcy5tZXJnZU5leHRDb21tYW5kID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgdGhpcy5tZXJnZU5leHRDb21tYW5kID0gdHJ1ZTtcblxuICAgICAgICAgICAgc2hvdWxkTWVyZ2UgPSBzaG91bGRNZXJnZVxuICAgICAgICAgICAgICAgICYmIHRoaXMubWVyZ2VOZXh0Q29tbWFuZCAvLyBwcmV2aW91cyBjb21tYW5kIGFsbG93cyB0byBjb2FsZXNjZSB3aXRoXG4gICAgICAgICAgICAgICAgJiYgKCEvXFxzLy50ZXN0KHRleHQpIHx8IC9cXHMvLnRlc3QocHJldi5hcmdzKSk7IC8vIHByZXZpb3VzIGluc2VydGlvbiB3YXMgb2Ygc2FtZSB0eXBlXG5cbiAgICAgICAgICAgIHRoaXMubWVyZ2VOZXh0Q29tbWFuZCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IHNob3VsZE1lcmdlXG4gICAgICAgICAgICAgICAgJiYgbWVyZ2VhYmxlQ29tbWFuZHMuaW5kZXhPZihlLmNvbW1hbmQubmFtZSkgIT09IC0xOyAvLyB0aGUgY29tbWFuZCBpcyBtZXJnZWFibGVcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuJG1lcmdlVW5kb0RlbHRhcyAhPSBcImFsd2F5c1wiXG4gICAgICAgICAgICAmJiBEYXRlLm5vdygpIC0gdGhpcy5zZXF1ZW5jZVN0YXJ0VGltZSA+IDIwMDBcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IGZhbHNlOyAvLyB0aGUgc2VxdWVuY2UgaXMgdG9vIGxvbmdcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzaG91bGRNZXJnZSlcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5tZXJnZVVuZG9EZWx0YXMgPSB0cnVlO1xuICAgICAgICBlbHNlIGlmIChtZXJnZWFibGVDb21tYW5kcy5pbmRleE9mKGUuY29tbWFuZC5uYW1lKSAhPT0gLTEpXG4gICAgICAgICAgICB0aGlzLnNlcXVlbmNlU3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IGtleSBoYW5kbGVyLCBzdWNoIGFzIFwidmltXCIgb3IgXCJ3aW5kb3dzXCIuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGtleWJvYXJkSGFuZGxlciBUaGUgbmV3IGtleSBoYW5kbGVyXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0S2V5Ym9hcmRIYW5kbGVyKGtleWJvYXJkSGFuZGxlcikge1xuICAgICAgICBpZiAoIWtleWJvYXJkSGFuZGxlcikge1xuICAgICAgICAgICAgdGhpcy5rZXlCaW5kaW5nLnNldEtleWJvYXJkSGFuZGxlcihudWxsKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0eXBlb2Yga2V5Ym9hcmRIYW5kbGVyID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB0aGlzLiRrZXliaW5kaW5nSWQgPSBrZXlib2FyZEhhbmRsZXI7XG4gICAgICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICAgICAgY29uZmlnLmxvYWRNb2R1bGUoW1wia2V5YmluZGluZ1wiLCBrZXlib2FyZEhhbmRsZXJdLCBmdW5jdGlvbihtb2R1bGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoX3NlbGYuJGtleWJpbmRpbmdJZCA9PSBrZXlib2FyZEhhbmRsZXIpXG4gICAgICAgICAgICAgICAgICAgIF9zZWxmLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKG1vZHVsZSAmJiBtb2R1bGUuaGFuZGxlcik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGtleWJpbmRpbmdJZCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKGtleWJvYXJkSGFuZGxlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBrZXlib2FyZCBoYW5kbGVyLCBzdWNoIGFzIFwidmltXCIgb3IgXCJ3aW5kb3dzXCIuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqXG4gICAgICoqL1xuICAgIGdldEtleWJvYXJkSGFuZGxlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMua2V5QmluZGluZy5nZXRLZXlib2FyZEhhbmRsZXIoKTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbmV2ZXIgdGhlIFtbRWRpdFNlc3Npb25dXSBjaGFuZ2VzLlxuICAgICAqIEBldmVudCBjaGFuZ2VTZXNzaW9uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGUgQW4gb2JqZWN0IHdpdGggdHdvIHByb3BlcnRpZXMsIGBvbGRTZXNzaW9uYCBhbmQgYHNlc3Npb25gLCB0aGF0IHJlcHJlc2VudCB0aGUgb2xkIGFuZCBuZXcgW1tFZGl0U2Vzc2lvbl1dcy5cbiAgICAgKlxuICAgICAqKi9cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IGVkaXRzZXNzaW9uIHRvIHVzZS4gVGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZXNzaW9uJ2AgZXZlbnQuXG4gICAgICogQHBhcmFtIHtFZGl0U2Vzc2lvbn0gc2Vzc2lvbiBUaGUgbmV3IHNlc3Npb24gdG8gdXNlXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0U2Vzc2lvbihzZXNzaW9uKSB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24gPT0gc2Vzc2lvbilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgb2xkU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgaWYgKG9sZFNlc3Npb24pIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIHRoaXMuJG9uRG9jdW1lbnRDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlTW9kZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcInRva2VuaXplclVwZGF0ZVwiLCB0aGlzLiRvblRva2VuaXplclVwZGF0ZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVRhYlNpemVcIiwgdGhpcy4kb25DaGFuZ2VUYWJTaXplKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlV3JhcExpbWl0XCIsIHRoaXMuJG9uQ2hhbmdlV3JhcExpbWl0KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlV3JhcE1vZGVcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm9uQ2hhbmdlRm9sZFwiLCB0aGlzLiRvbkNoYW5nZUZvbGQpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VGcm9udE1hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlQmFja01hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHRoaXMuJG9uQ2hhbmdlQnJlYWtwb2ludCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZUFubm90YXRpb25cIiwgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlT3ZlcndyaXRlXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHRoaXMuJG9uU2Nyb2xsVG9wQ2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCB0aGlzLiRvblNjcm9sbExlZnRDaGFuZ2UpO1xuXG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgICAgICAgICAgc2VsZWN0aW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VDdXJzb3JcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuICAgICAgICAgICAgc2VsZWN0aW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTZWxlY3Rpb25cIiwgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uID0gc2Vzc2lvbjtcbiAgICAgICAgaWYgKHNlc3Npb24pIHtcbiAgICAgICAgICAgIHRoaXMuJG9uRG9jdW1lbnRDaGFuZ2UgPSB0aGlzLm9uRG9jdW1lbnRDaGFuZ2UuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlID0gdGhpcy5vbkNoYW5nZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZU1vZGVcIiwgdGhpcy4kb25DaGFuZ2VNb2RlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25Ub2tlbml6ZXJVcGRhdGUgPSB0aGlzLm9uVG9rZW5pemVyVXBkYXRlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgdGhpcy4kb25Ub2tlbml6ZXJVcGRhdGUpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVRhYlNpemUgPSB0aGlzLnJlbmRlcmVyLm9uQ2hhbmdlVGFiU2l6ZS5iaW5kKHRoaXMucmVuZGVyZXIpO1xuICAgICAgICAgICAgc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlVGFiU2l6ZVwiLCB0aGlzLiRvbkNoYW5nZVRhYlNpemUpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCA9IHRoaXMub25DaGFuZ2VXcmFwTGltaXQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVdyYXBMaW1pdFwiLCB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlV3JhcE1vZGUgPSB0aGlzLm9uQ2hhbmdlV3JhcE1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVdyYXBNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlV3JhcE1vZGUpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUZvbGQgPSB0aGlzLm9uQ2hhbmdlRm9sZC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlRm9sZFwiLCB0aGlzLiRvbkNoYW5nZUZvbGQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyID0gdGhpcy5vbkNoYW5nZUZyb250TWFya2VyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZUZyb250TWFya2VyXCIsIHRoaXMuJG9uQ2hhbmdlRnJvbnRNYXJrZXIpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIgPSB0aGlzLm9uQ2hhbmdlQmFja01hcmtlci5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VCYWNrTWFya2VyXCIsIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlcik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlQnJlYWtwb2ludCA9IHRoaXMub25DaGFuZ2VCcmVha3BvaW50LmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZUJyZWFrcG9pbnRcIiwgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50KTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uID0gdGhpcy5vbkNoYW5nZUFubm90YXRpb24uYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlQW5ub3RhdGlvblwiLCB0aGlzLiRvbkNoYW5nZUFubm90YXRpb24pO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkN1cnNvckNoYW5nZSA9IHRoaXMub25DdXJzb3JDaGFuZ2UuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlT3ZlcndyaXRlXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TY3JvbGxUb3BDaGFuZ2UgPSB0aGlzLm9uU2Nyb2xsVG9wQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNjcm9sbFRvcFwiLCB0aGlzLiRvblNjcm9sbFRvcENoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2Nyb2xsTGVmdENoYW5nZSA9IHRoaXMub25TY3JvbGxMZWZ0Q2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNjcm9sbExlZnRcIiwgdGhpcy4kb25TY3JvbGxMZWZ0Q2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24gPSBzZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZUN1cnNvclwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlID0gdGhpcy5vblNlbGVjdGlvbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvblNlbGVjdGlvbkNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VNb2RlKCk7XG5cbiAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgICAgICB0aGlzLm9uQ3Vyc29yQ2hhbmdlKCk7XG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgICAgICB0aGlzLm9uU2Nyb2xsVG9wQ2hhbmdlKCk7XG4gICAgICAgICAgICB0aGlzLm9uU2Nyb2xsTGVmdENoYW5nZSgpO1xuICAgICAgICAgICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSgpO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUZyb250TWFya2VyKCk7XG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlQmFja01hcmtlcigpO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUJyZWFrcG9pbnQoKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VBbm5vdGF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLnJlbmRlcmVyLmFkanVzdFdyYXBMaW1pdCgpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGdWxsKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTZXNzaW9uXCIsIHtcbiAgICAgICAgICAgIHNlc3Npb246IHNlc3Npb24sXG4gICAgICAgICAgICBvbGRTZXNzaW9uOiBvbGRTZXNzaW9uXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG9sZFNlc3Npb24gJiYgb2xkU2Vzc2lvbi5fc2lnbmFsKFwiY2hhbmdlRWRpdG9yXCIsIHsgb2xkRWRpdG9yOiB0aGlzIH0pO1xuICAgICAgICBzZXNzaW9uICYmIHNlc3Npb24uX3NpZ25hbChcImNoYW5nZUVkaXRvclwiLCB7IGVkaXRvcjogdGhpcyB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlc3Npb24gYmVpbmcgdXNlZC5cbiAgICAgKiBAcmV0dXJucyB7RWRpdFNlc3Npb259XG4gICAgICoqL1xuICAgIGdldFNlc3Npb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY3VycmVudCBkb2N1bWVudCB0byBgdmFsYC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdmFsIFRoZSBuZXcgdmFsdWUgdG8gc2V0IGZvciB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY3Vyc29yUG9zIFdoZXJlIHRvIHNldCB0aGUgbmV3IHZhbHVlLiBgdW5kZWZpbmVkYCBvciAwIGlzIHNlbGVjdEFsbCwgLTEgaXMgYXQgdGhlIGRvY3VtZW50IHN0YXJ0LCBhbmQgKzEgaXMgYXQgdGhlIGVuZFxuICAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIGN1cnJlbnQgZG9jdW1lbnQgdmFsdWVcbiAgICAgKiBAcmVsYXRlZCBEb2N1bWVudC5zZXRWYWx1ZVxuICAgICAqKi9cbiAgICBzZXRWYWx1ZSh2YWw6IHN0cmluZywgY3Vyc29yUG9zPzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5zZXRWYWx1ZSh2YWwpO1xuXG4gICAgICAgIGlmICghY3Vyc29yUG9zKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGN1cnNvclBvcyA9PSArMSkge1xuICAgICAgICAgICAgdGhpcy5uYXZpZ2F0ZUZpbGVFbmQoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjdXJzb3JQb3MgPT0gLTEpIHtcbiAgICAgICAgICAgIHRoaXMubmF2aWdhdGVGaWxlU3RhcnQoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBUT0RPOiBSYXRoZXIgY3JhenkhIEVpdGhlciByZXR1cm4gdGhpcyBvciB0aGUgZm9ybWVyIHZhbHVlP1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgc2Vzc2lvbidzIGNvbnRlbnQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmdldFZhbHVlXG4gICAgICoqL1xuICAgIGdldFZhbHVlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnRseSBoaWdobGlnaHRlZCBzZWxlY3Rpb24uXG4gICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIGhpZ2hsaWdodGVkIHNlbGVjdGlvblxuICAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb24oKTogc2VtLlNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHJlc2l6ZVxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIHJlY29tcHV0ZXMgdGhlIHNpemUsIGV2ZW4gaWYgdGhlIGhlaWdodCBhbmQgd2lkdGggaGF2ZW4ndCBjaGFuZ2VkLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcmVzaXplKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLm9uUmVzaXplKGZvcmNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZX1cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGhlbWUgVGhlIHBhdGggdG8gYSB0aGVtZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIG9wdGlvbmFsIGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZW1lIGlzIGxvYWRlZFxuICAgICAqKi9cbiAgICBzZXRUaGVtZSh0aGVtZTogc3RyaW5nLCBjYj86ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRUaGVtZSh0aGVtZSwgY2IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLmdldFRoZW1lfVxuICAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIHNldCB0aGVtZVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZVxuICAgICAqKi9cbiAgICBnZXRUaGVtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRUaGVtZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZVxuICAgICAqKi9cbiAgICBzZXRTdHlsZShzdHlsZSkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFN0eWxlKHN0eWxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlfVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlXG4gICAgICoqL1xuICAgIHVuc2V0U3R5bGUoc3R5bGUpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51bnNldFN0eWxlKHN0eWxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50IGZvbnQgc2l6ZSBvZiB0aGUgZWRpdG9yIHRleHQuXG4gICAgICovXG4gICAgZ2V0Rm9udFNpemUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZm9udFNpemVcIikgfHwgZG9tLmNvbXB1dGVkU3R5bGUodGhpcy5jb250YWluZXIsIFwiZm9udFNpemVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGEgbmV3IGZvbnQgc2l6ZSAoaW4gcGl4ZWxzKSBmb3IgdGhlIGVkaXRvciB0ZXh0LlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBmb250U2l6ZSBBIGZvbnQgc2l6ZSAoIF9lLmcuXyBcIjEycHhcIilcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHNldEZvbnRTaXplKGZvbnRTaXplOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmb250U2l6ZVwiLCBmb250U2l6ZSk7XG4gICAgfVxuXG4gICAgJGhpZ2hsaWdodEJyYWNrZXRzKCkge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlTWFya2VyKHRoaXMuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJGhpZ2hsaWdodFBlbmRpbmcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHBlcmZvcm0gaGlnaGxpZ2h0IGFzeW5jIHRvIG5vdCBibG9jayB0aGUgYnJvd3NlciBkdXJpbmcgbmF2aWdhdGlvblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi4kaGlnaGxpZ2h0UGVuZGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICB2YXIgcG9zID0gc2VsZi5zZXNzaW9uLmZpbmRNYXRjaGluZ0JyYWNrZXQoc2VsZi5nZXRDdXJzb3JQb3NpdGlvbigpKTtcbiAgICAgICAgICAgIGlmIChwb3MpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgcm5nLlJhbmdlKHBvcy5yb3csIHBvcy5jb2x1bW4sIHBvcy5yb3csIHBvcy5jb2x1bW4gKyAxKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2VsZi5zZXNzaW9uLiRtb2RlLmdldE1hdGNoaW5nKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlOiBybmcuUmFuZ2UgPSBzZWxmLnNlc3Npb24uJG1vZGUuZ2V0TWF0Y2hpbmcoc2VsZi5zZXNzaW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyYW5nZSlcbiAgICAgICAgICAgICAgICBzZWxmLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQgPSBzZWxmLnNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9icmFja2V0XCIsIFwidGV4dFwiKTtcbiAgICAgICAgfSwgNTApO1xuICAgIH1cblxuICAgIC8vIHRvZG86IG1vdmUgdG8gbW9kZS5nZXRNYXRjaGluZ1xuICAgICRoaWdobGlnaHRUYWdzKCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0VGFnUGVuZGluZykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGVyZm9ybSBoaWdobGlnaHQgYXN5bmMgdG8gbm90IGJsb2NrIHRoZSBicm93c2VyIGR1cmluZyBuYXZpZ2F0aW9uXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0VGFnUGVuZGluZyA9IHRydWU7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLiRoaWdobGlnaHRUYWdQZW5kaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciBwb3MgPSBzZWxmLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcihzZWxmLnNlc3Npb24sIHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgdmFyIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG5cbiAgICAgICAgICAgIGlmICghdG9rZW4gfHwgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB0YWcgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIHZhciBkZXB0aCA9IDA7XG4gICAgICAgICAgICB2YXIgcHJldlRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG5cbiAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgLy9maW5kIGNsb3NpbmcgdGFnXG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSB0b2tlbjtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi52YWx1ZSA9PT0gdGFnICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoKys7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoLS07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHRva2VuICYmIGRlcHRoID49IDApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL2ZpbmQgb3BlbmluZyB0YWdcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gcHJldlRva2VuO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAocHJldlRva2VuICYmIGRlcHRoIDw9IDApO1xuXG4gICAgICAgICAgICAgICAgLy9zZWxlY3QgdGFnIGFnYWluXG4gICAgICAgICAgICAgICAgaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHZhciBjb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKTtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBybmcuUmFuZ2Uocm93LCBjb2x1bW4sIHJvdywgY29sdW1uICsgdG9rZW4udmFsdWUubGVuZ3RoKTtcblxuICAgICAgICAgICAgLy9yZW1vdmUgcmFuZ2UgaWYgZGlmZmVyZW50XG4gICAgICAgICAgICBpZiAoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ICYmIHJhbmdlLmNvbXBhcmVSYW5nZShzZXNzaW9uLiRiYWNrTWFya2Vyc1tzZXNzaW9uLiR0YWdIaWdobGlnaHRdLnJhbmdlKSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJhbmdlICYmICFzZXNzaW9uLiR0YWdIaWdobGlnaHQpXG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2JyYWNrZXRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICB9LCA1MCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBCcmluZ3MgdGhlIGN1cnJlbnQgYHRleHRJbnB1dGAgaW50byBmb2N1cy5cbiAgICAgKiovXG4gICAgZm9jdXMoKSB7XG4gICAgICAgIC8vIFNhZmFyaSBuZWVkcyB0aGUgdGltZW91dFxuICAgICAgICAvLyBpT1MgYW5kIEZpcmVmb3ggbmVlZCBpdCBjYWxsZWQgaW1tZWRpYXRlbHlcbiAgICAgICAgLy8gdG8gYmUgb24gdGhlIHNhdmUgc2lkZSB3ZSBkbyBib3RoXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBfc2VsZi50ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudGV4dElucHV0LmZvY3VzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGN1cnJlbnQgYHRleHRJbnB1dGAgaXMgaW4gZm9jdXMuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy50ZXh0SW5wdXQuaXNGb2N1c2VkKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBCbHVycyB0aGUgY3VycmVudCBgdGV4dElucHV0YC5cbiAgICAgKiovXG4gICAgYmx1cigpIHtcbiAgICAgICAgdGhpcy50ZXh0SW5wdXQuYmx1cigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgb25jZSB0aGUgZWRpdG9yIGNvbWVzIGludG8gZm9jdXMuXG4gICAgICogQGV2ZW50IGZvY3VzXG4gICAgICpcbiAgICAgKiovXG4gICAgb25Gb2N1cygpIHtcbiAgICAgICAgaWYgKHRoaXMuJGlzRm9jdXNlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGlzRm9jdXNlZCA9IHRydWU7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hvd0N1cnNvcigpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnZpc3VhbGl6ZUZvY3VzKCk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJmb2N1c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIG9uY2UgdGhlIGVkaXRvciBoYXMgYmVlbiBibHVycmVkLlxuICAgICAqIEBldmVudCBibHVyXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBvbkJsdXIoKSB7XG4gICAgICAgIGlmICghdGhpcy4kaXNGb2N1c2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaXNGb2N1c2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuaGlkZUN1cnNvcigpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnZpc3VhbGl6ZUJsdXIoKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImJsdXJcIik7XG4gICAgfVxuXG4gICAgJGN1cnNvckNoYW5nZSgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW5ldmVyIHRoZSBkb2N1bWVudCBpcyBjaGFuZ2VkLlxuICAgICAqIEBldmVudCBjaGFuZ2VcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZSBDb250YWlucyBhIHNpbmdsZSBwcm9wZXJ0eSwgYGRhdGFgLCB3aGljaCBoYXMgdGhlIGRlbHRhIG9mIGNoYW5nZXNcbiAgICAgKlxuICAgICAqKi9cbiAgICBvbkRvY3VtZW50Q2hhbmdlKGUpIHtcbiAgICAgICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgICAgICB2YXIgcmFuZ2UgPSBkZWx0YS5yYW5nZTtcbiAgICAgICAgdmFyIGxhc3RSb3c6IG51bWJlcjtcblxuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ID09IHJhbmdlLmVuZC5yb3cgJiYgZGVsdGEuYWN0aW9uICE9IFwiaW5zZXJ0TGluZXNcIiAmJiBkZWx0YS5hY3Rpb24gIT0gXCJyZW1vdmVMaW5lc1wiKVxuICAgICAgICAgICAgbGFzdFJvdyA9IHJhbmdlLmVuZC5yb3c7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGxhc3RSb3cgPSBJbmZpbml0eTtcblxuICAgICAgICB2YXIgcjogdnJtLlZpcnR1YWxSZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG4gICAgICAgIHIudXBkYXRlTGluZXMocmFuZ2Uuc3RhcnQucm93LCBsYXN0Um93LCB0aGlzLnNlc3Npb24uJHVzZVdyYXBNb2RlKTtcblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VcIiwgZSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGN1cnNvciBiZWNhdXNlIHRhYiBjaGFyYWN0ZXJzIGNhbiBpbmZsdWVuY2UgdGhlIGN1cnNvciBwb3NpdGlvblxuICAgICAgICB0aGlzLiRjdXJzb3JDaGFuZ2UoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgIH1cblxuICAgIG9uVG9rZW5pemVyVXBkYXRlKGUpIHtcbiAgICAgICAgdmFyIHJvd3MgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlTGluZXMocm93cy5maXJzdCwgcm93cy5sYXN0KTtcbiAgICB9XG5cblxuICAgIG9uU2Nyb2xsVG9wQ2hhbmdlKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvWSh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkpO1xuICAgIH1cblxuICAgIG9uU2Nyb2xsTGVmdENoYW5nZSgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb1godGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRoZSBzZWxlY3Rpb24gY2hhbmdlcy5cbiAgICAgKlxuICAgICAqKi9cbiAgICBvbkN1cnNvckNoYW5nZSgpIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yQ2hhbmdlKCk7XG5cbiAgICAgICAgaWYgKCF0aGlzLiRibG9ja1Njcm9sbGluZykge1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0QnJhY2tldHMoKTtcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0VGFncygpO1xuICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICB9XG5cbiAgICAkdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLmdldFNlc3Npb24oKTtcblxuICAgICAgICB2YXIgaGlnaGxpZ2h0O1xuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0QWN0aXZlTGluZSkge1xuICAgICAgICAgICAgaWYgKCh0aGlzLiRzZWxlY3Rpb25TdHlsZSAhPSBcImxpbmVcIiB8fCAhdGhpcy5zZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSkpXG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0ID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgaWYgKHRoaXMucmVuZGVyZXIuJG1heExpbmVzICYmIHRoaXMuc2Vzc2lvbi5nZXRMZW5ndGgoKSA9PT0gMSAmJiAhKHRoaXMucmVuZGVyZXIuJG1pbkxpbmVzID4gMSkpXG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0ID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciAmJiAhaGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLmlkKTtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyICYmIGhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdmFyIHJhbmdlOiBhbnkgPSBuZXcgcm5nLlJhbmdlKGhpZ2hsaWdodC5yb3csIGhpZ2hsaWdodC5jb2x1bW4sIGhpZ2hsaWdodC5yb3csIEluZmluaXR5KTtcbiAgICAgICAgICAgIHJhbmdlLmlkID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2FjdGl2ZS1saW5lXCIsIFwic2NyZWVuTGluZVwiKTtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgPSByYW5nZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuc3RhcnQucm93ID0gaGlnaGxpZ2h0LnJvdztcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuZW5kLnJvdyA9IGhpZ2hsaWdodC5yb3c7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLnN0YXJ0LmNvbHVtbiA9IGhpZ2hsaWdodC5jb2x1bW47XG4gICAgICAgICAgICBzZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25TZWxlY3Rpb25DaGFuZ2UoZT8pIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgaWYgKHR5cGVvZiBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kc2VsZWN0aW9uTWFya2VyID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHN0eWxlID0gdGhpcy5nZXRTZWxlY3Rpb25TdHlsZSgpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kc2VsZWN0aW9uTWFya2VyID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX3NlbGVjdGlvblwiLCBzdHlsZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmUgPSB0aGlzLiRoaWdobGlnaHRTZWxlY3RlZFdvcmQgJiYgdGhpcy4kZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5oaWdobGlnaHQocmUpO1xuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICB9XG5cbiAgICAkZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwKCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSB8fCBzZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgc3RhcnRPdXRlciA9IHNlbGVjdGlvbi5zdGFydC5jb2x1bW4gLSAxO1xuICAgICAgICB2YXIgZW5kT3V0ZXIgPSBzZWxlY3Rpb24uZW5kLmNvbHVtbiArIDE7XG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKHNlbGVjdGlvbi5zdGFydC5yb3cpO1xuICAgICAgICB2YXIgbGluZUNvbHMgPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgdmFyIG5lZWRsZSA9IGxpbmUuc3Vic3RyaW5nKE1hdGgubWF4KHN0YXJ0T3V0ZXIsIDApLFxuICAgICAgICAgICAgTWF0aC5taW4oZW5kT3V0ZXIsIGxpbmVDb2xzKSk7XG5cbiAgICAgICAgLy8gTWFrZSBzdXJlIHRoZSBvdXRlciBjaGFyYWN0ZXJzIGFyZSBub3QgcGFydCBvZiB0aGUgd29yZC5cbiAgICAgICAgaWYgKChzdGFydE91dGVyID49IDAgJiYgL15bXFx3XFxkXS8udGVzdChuZWVkbGUpKSB8fFxuICAgICAgICAgICAgKGVuZE91dGVyIDw9IGxpbmVDb2xzICYmIC9bXFx3XFxkXSQvLnRlc3QobmVlZGxlKSkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgbmVlZGxlID0gbGluZS5zdWJzdHJpbmcoc2VsZWN0aW9uLnN0YXJ0LmNvbHVtbiwgc2VsZWN0aW9uLmVuZC5jb2x1bW4pO1xuICAgICAgICBpZiAoIS9eW1xcd1xcZF0rJC8udGVzdChuZWVkbGUpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciByZSA9IHRoaXMuJHNlYXJjaC4kYXNzZW1ibGVSZWdFeHAoe1xuICAgICAgICAgICAgd2hvbGVXb3JkOiB0cnVlLFxuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZTogdHJ1ZSxcbiAgICAgICAgICAgIG5lZWRsZTogbmVlZGxlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByZTtcbiAgICB9XG5cblxuICAgIG9uQ2hhbmdlRnJvbnRNYXJrZXIoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlRnJvbnRNYXJrZXJzKCk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VCYWNrTWFya2VyKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUJhY2tNYXJrZXJzKCk7XG4gICAgfVxuXG5cbiAgICBvbkNoYW5nZUJyZWFrcG9pbnQoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlQnJlYWtwb2ludHMoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZUFubm90YXRpb24oKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0QW5ub3RhdGlvbnModGhpcy5zZXNzaW9uLmdldEFubm90YXRpb25zKCkpO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VNb2RlKGU/KSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlVGV4dCgpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlTW9kZVwiLCBlKTtcbiAgICB9XG5cblxuICAgIG9uQ2hhbmdlV3JhcExpbWl0KCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZVdyYXBNb2RlKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLm9uUmVzaXplKHRydWUpO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VGb2xkKCkge1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGFjdGl2ZSBsaW5lIG1hcmtlciBhcyBkdWUgdG8gZm9sZGluZyBjaGFuZ2VzIHRoZSBjdXJyZW50XG4gICAgICAgIC8vIGxpbmUgcmFuZ2Ugb24gdGhlIHNjcmVlbiBtaWdodCBoYXZlIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgLy8gVE9ETzogVGhpcyBtaWdodCBiZSB0b28gbXVjaCB1cGRhdGluZy4gT2theSBmb3Igbm93LlxuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGV4dCBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0ZWRUZXh0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbiB0ZXh0IGlzIGNvcGllZC5cbiAgICAgKiBAZXZlbnQgY29weVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBjb3BpZWQgdGV4dFxuICAgICAqXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBvZiB0ZXh0IGN1cnJlbnRseSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqIEBkZXByZWNhdGVkIFVzZSBnZXRTZWxlY3RlZFRleHQgaW5zdGVhZC5cbiAgICAgKiovXG4gICAgZ2V0Q29weVRleHQoKSB7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5nZXRTZWxlY3RlZFRleHQoKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY29weVwiLCB0ZXh0KTtcbiAgICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImNvcHlcIiBoYXBwZW5zLlxuICAgICAqKi9cbiAgICBvbkNvcHkoKSB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhcImNvcHlcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImN1dFwiIGhhcHBlbnMuXG4gICAgICoqL1xuICAgIG9uQ3V0KCkge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoXCJjdXRcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgcGFzdGVkLlxuICAgICAqIEBldmVudCBwYXN0ZVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBwYXN0ZWQgdGV4dFxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcInBhc3RlXCIgaGFwcGVucy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgcGFzdGVkIHRleHRcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uUGFzdGUodGV4dCkge1xuICAgICAgICAvLyB0b2RvIHRoaXMgc2hvdWxkIGNoYW5nZSB3aGVuIHBhc3RlIGJlY29tZXMgYSBjb21tYW5kXG4gICAgICAgIGlmICh0aGlzLiRyZWFkT25seSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGUgPSB7IHRleHQ6IHRleHQgfTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwicGFzdGVcIiwgZSk7XG4gICAgICAgIHRoaXMuaW5zZXJ0KGUudGV4dCwgdHJ1ZSk7XG4gICAgfVxuXG5cbiAgICBleGVjQ29tbWFuZChjb21tYW5kLCBhcmdzPyk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoY29tbWFuZCwgdGhpcywgYXJncyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5zZXJ0cyBgdGV4dGAgaW50byB3aGVyZXZlciB0aGUgY3Vyc29yIGlzIHBvaW50aW5nLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBuZXcgdGV4dCB0byBhZGRcbiAgICAgKlxuICAgICAqKi9cbiAgICBpbnNlcnQodGV4dCwgcGFzdGVkPykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIG1vZGUgPSBzZXNzaW9uLmdldE1vZGUoKTtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcblxuICAgICAgICBpZiAodGhpcy5nZXRCZWhhdmlvdXJzRW5hYmxlZCgpICYmICFwYXN0ZWQpIHtcbiAgICAgICAgICAgIC8vIEdldCBhIHRyYW5zZm9ybSBpZiB0aGUgY3VycmVudCBtb2RlIHdhbnRzIG9uZS5cbiAgICAgICAgICAgIHZhciB0cmFuc2Zvcm0gPSBtb2RlLnRyYW5zZm9ybUFjdGlvbihzZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpLCAnaW5zZXJ0aW9uJywgdGhpcywgc2Vzc2lvbiwgdGV4dCk7XG4gICAgICAgICAgICBpZiAodHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRleHQgIT09IHRyYW5zZm9ybS50ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5tZXJnZVVuZG9EZWx0YXMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kbWVyZ2VOZXh0Q29tbWFuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0ZXh0ID0gdHJhbnNmb3JtLnRleHQ7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0ZXh0ID09IFwiXFx0XCIpXG4gICAgICAgICAgICB0ZXh0ID0gdGhpcy5zZXNzaW9uLmdldFRhYlN0cmluZygpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBzZWxlY3RlZCB0ZXh0XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgICAgICBjdXJzb3IgPSB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLnNlc3Npb24uZ2V0T3ZlcndyaXRlKCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHJuZy5SYW5nZS5mcm9tUG9pbnRzKGN1cnNvciwgY3Vyc29yKTtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gKz0gdGV4dC5sZW5ndGg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0ZXh0ID09IFwiXFxuXCIgfHwgdGV4dCA9PSBcIlxcclxcblwiKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgICAgIGlmIChjdXJzb3IuY29sdW1uID4gbGluZS5zZWFyY2goL1xcU3wkLykpIHtcbiAgICAgICAgICAgICAgICB2YXIgZCA9IGxpbmUuc3Vic3RyKGN1cnNvci5jb2x1bW4pLnNlYXJjaCgvXFxTfCQvKTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmRvYy5yZW1vdmVJbkxpbmUoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbiwgY3Vyc29yLmNvbHVtbiArIGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcblxuICAgICAgICB2YXIgc3RhcnQgPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICB2YXIgbGluZVN0YXRlID0gc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBzaG91bGRPdXRkZW50ID0gbW9kZS5jaGVja091dGRlbnQobGluZVN0YXRlLCBsaW5lLCB0ZXh0KTtcbiAgICAgICAgdmFyIGVuZCA9IHNlc3Npb24uaW5zZXJ0KGN1cnNvciwgdGV4dCk7XG5cbiAgICAgICAgaWYgKHRyYW5zZm9ybSAmJiB0cmFuc2Zvcm0uc2VsZWN0aW9uKSB7XG4gICAgICAgICAgICBpZiAodHJhbnNmb3JtLnNlbGVjdGlvbi5sZW5ndGggPT0gMikgeyAvLyBUcmFuc2Zvcm0gcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgY29sdW1uXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBybmcuUmFuZ2UoY3Vyc29yLnJvdywgc3RhcnQgKyB0cmFuc2Zvcm0uc2VsZWN0aW9uWzBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3Vyc29yLnJvdywgc3RhcnQgKyB0cmFuc2Zvcm0uc2VsZWN0aW9uWzFdKSk7XG4gICAgICAgICAgICB9IGVsc2UgeyAvLyBUcmFuc2Zvcm0gcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgcm93LlxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBuZXcgcm5nLlJhbmdlKGN1cnNvci5yb3cgKyB0cmFuc2Zvcm0uc2VsZWN0aW9uWzBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtLnNlbGVjdGlvblsxXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnNvci5yb3cgKyB0cmFuc2Zvcm0uc2VsZWN0aW9uWzJdLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtLnNlbGVjdGlvblszXSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNlc3Npb24uZ2V0RG9jdW1lbnQoKS5pc05ld0xpbmUodGV4dCkpIHtcbiAgICAgICAgICAgIHZhciBsaW5lSW5kZW50ID0gbW9kZS5nZXROZXh0TGluZUluZGVudChsaW5lU3RhdGUsIGxpbmUuc2xpY2UoMCwgY3Vyc29yLmNvbHVtbiksIHNlc3Npb24uZ2V0VGFiU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICBzZXNzaW9uLmluc2VydCh7IHJvdzogY3Vyc29yLnJvdyArIDEsIGNvbHVtbjogMCB9LCBsaW5lSW5kZW50KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2hvdWxkT3V0ZGVudClcbiAgICAgICAgICAgIG1vZGUuYXV0b091dGRlbnQobGluZVN0YXRlLCBzZXNzaW9uLCBjdXJzb3Iucm93KTtcbiAgICB9XG5cbiAgICBvblRleHRJbnB1dCh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nLm9uVGV4dElucHV0KHRleHQpO1xuICAgICAgICAvLyBUT0RPOiBUaGlzIHNob3VsZCBiZSBwbHVnZ2FibGUuXG4gICAgICAgIGlmICh0ZXh0ID09PSAnLicpIHtcbiAgICAgICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhwcm90b2NvbC5DT01NQU5EX05BTUVfQVVUT19DT01QTEVURSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5nZXRTZXNzaW9uKCkuZ2V0RG9jdW1lbnQoKS5pc05ld0xpbmUodGV4dCkpIHtcbiAgICAgICAgICAgIHZhciBsaW5lTnVtYmVyID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgdmFyIG9wdGlvbiA9IG5ldyBTZXJ2aWNlcy5FZGl0b3JPcHRpb25zKCk7XG4gICAgICAgICAgICAvLyAgICAgICAgICAgIG9wdGlvbi5OZXdMaW5lQ2hhcmFjdGVyID0gXCJcXG5cIjtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBTbWFydCBJbmRlbnRpbmdcbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICB2YXIgaW5kZW50ID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldFNtYXJ0SW5kZW50QXRMaW5lTnVtYmVyKGN1cnJlbnRGaWxlTmFtZSwgbGluZU51bWJlciwgb3B0aW9uKTtcbiAgICAgICAgICAgIGlmKGluZGVudCA+IDApXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmNvbW1hbmRzLmV4ZWMoXCJpbnNlcnR0ZXh0XCIsIGVkaXRvciwge3RleHQ6XCIgXCIsIHRpbWVzOmluZGVudH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgKi9cbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uQ29tbWFuZEtleShlLCBoYXNoSWQsIGtleUNvZGUpIHtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nLm9uQ29tbWFuZEtleShlLCBoYXNoSWQsIGtleUNvZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhc3MgaW4gYHRydWVgIHRvIGVuYWJsZSBvdmVyd3JpdGVzIGluIHlvdXIgc2Vzc2lvbiwgb3IgYGZhbHNlYCB0byBkaXNhYmxlLiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGVyIG9yIG5vdCB0byBzZXQgb3ZlcndyaXRlc1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgb3ZlcndyaXRlcyBhcmUgZW5hYmxlZDsgYGZhbHNlYCBvdGhlcndpc2UuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0T3ZlcndyaXRlXG4gICAgICoqL1xuICAgIGdldE92ZXJ3cml0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZSBvZiBvdmVyd3JpdGUgdG8gdGhlIG9wcG9zaXRlIG9mIHdoYXRldmVyIGl0IGN1cnJlbnRseSBpcy5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgdG9nZ2xlT3ZlcndyaXRlKCkge1xuICAgICAgICB0aGlzLnNlc3Npb24udG9nZ2xlT3ZlcndyaXRlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBob3cgZmFzdCB0aGUgbW91c2Ugc2Nyb2xsaW5nIHNob3VsZCBkby5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc3BlZWQgQSB2YWx1ZSBpbmRpY2F0aW5nIHRoZSBuZXcgc3BlZWQgKGluIG1pbGxpc2Vjb25kcylcbiAgICAgKiovXG4gICAgc2V0U2Nyb2xsU3BlZWQoc3BlZWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNjcm9sbFNwZWVkXCIsIHNwZWVkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBpbmRpY2F0aW5nIGhvdyBmYXN0IHRoZSBtb3VzZSBzY3JvbGwgc3BlZWQgaXMgKGluIG1pbGxpc2Vjb25kcykuXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiovXG4gICAgZ2V0U2Nyb2xsU3BlZWQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2Nyb2xsU3BlZWRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgZGVsYXkgKGluIG1pbGxpc2Vjb25kcykgb2YgdGhlIG1vdXNlIGRyYWcuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRyYWdEZWxheSBBIHZhbHVlIGluZGljYXRpbmcgdGhlIG5ldyBkZWxheVxuICAgICAqKi9cbiAgICBzZXREcmFnRGVsYXkoZHJhZ0RlbGF5OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJkcmFnRGVsYXlcIiwgZHJhZ0RlbGF5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IG1vdXNlIGRyYWcgZGVsYXkuXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiovXG4gICAgZ2V0RHJhZ0RlbGF5KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImRyYWdEZWxheVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW4gdGhlIHNlbGVjdGlvbiBzdHlsZSBjaGFuZ2VzLCB2aWEgW1tFZGl0b3Iuc2V0U2VsZWN0aW9uU3R5bGVdXS5cbiAgICAgKiBAZXZlbnQgY2hhbmdlU2VsZWN0aW9uU3R5bGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZGF0YSBDb250YWlucyBvbmUgcHJvcGVydHksIGBkYXRhYCwgd2hpY2ggaW5kaWNhdGVzIHRoZSBuZXcgc2VsZWN0aW9uIHN0eWxlXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIERyYXcgc2VsZWN0aW9uIG1hcmtlcnMgc3Bhbm5pbmcgd2hvbGUgbGluZSwgb3Igb25seSBvdmVyIHNlbGVjdGVkIHRleHQuIERlZmF1bHQgdmFsdWUgaXMgXCJsaW5lXCJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3R5bGUgVGhlIG5ldyBzZWxlY3Rpb24gc3R5bGUgXCJsaW5lXCJ8XCJ0ZXh0XCJcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRTZWxlY3Rpb25TdHlsZSh2YWw6IHN0cmluZykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNlbGVjdGlvblN0eWxlXCIsIHZhbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZWxlY3Rpb24gc3R5bGUuXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uU3R5bGUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2VsZWN0aW9uU3R5bGVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGUgY3VycmVudCBsaW5lIHNob3VsZCBiZSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3VsZEhpZ2hsaWdodCBTZXQgdG8gYHRydWVgIHRvIGhpZ2hsaWdodCB0aGUgY3VycmVudCBsaW5lXG4gICAgICoqL1xuICAgIHNldEhpZ2hsaWdodEFjdGl2ZUxpbmUoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0QWN0aXZlTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGN1cnJlbnQgbGluZXMgYXJlIGFsd2F5cyBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIaWdobGlnaHRBY3RpdmVMaW5lKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRBY3RpdmVMaW5lXCIpO1xuICAgIH1cblxuICAgIHNldEhpZ2hsaWdodEd1dHRlckxpbmUoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIGdldEhpZ2hsaWdodEd1dHRlckxpbmUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyBpZiB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHdvcmQgc2hvdWxkIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkSGlnaGxpZ2h0IFNldCB0byBgdHJ1ZWAgdG8gaGlnaGxpZ2h0IHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgd29yZFxuICAgICAqXG4gICAgICoqL1xuICAgIHNldEhpZ2hsaWdodFNlbGVjdGVkV29yZChzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRTZWxlY3RlZFdvcmRcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQgd29yZHMgYXJlIHRvIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiRoaWdobGlnaHRTZWxlY3RlZFdvcmQ7XG4gICAgfVxuXG4gICAgc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGUpO1xuICAgIH1cblxuICAgIGdldEFuaW1hdGVkU2Nyb2xsKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRBbmltYXRlZFNjcm9sbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGBzaG93SW52aXNpYmxlc2AgaXMgc2V0IHRvIGB0cnVlYCwgaW52aXNpYmxlIGNoYXJhY3RlcnMmbWRhc2g7bGlrZSBzcGFjZXMgb3IgbmV3IGxpbmVzJm1kYXNoO2FyZSBzaG93IGluIHRoZSBlZGl0b3IuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93SW52aXNpYmxlcyBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gc2hvdyBpbnZpc2libGUgY2hhcmFjdGVyc1xuICAgICAqXG4gICAgICoqL1xuICAgIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGludmlzaWJsZSBjaGFyYWN0ZXJzIGFyZSBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0U2hvd0ludmlzaWJsZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNob3dJbnZpc2libGVzKCk7XG4gICAgfVxuXG4gICAgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzKTtcbiAgICB9XG5cbiAgICBnZXREaXNwbGF5SW5kZW50R3VpZGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXREaXNwbGF5SW5kZW50R3VpZGVzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHNob3dQcmludE1hcmdpbmAgaXMgc2V0IHRvIGB0cnVlYCwgdGhlIHByaW50IG1hcmdpbiBpcyBzaG93biBpbiB0aGUgZWRpdG9yLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd1ByaW50TWFyZ2luIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzaG93IHRoZSBwcmludCBtYXJnaW5cbiAgICAgKiovXG4gICAgc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbjogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbihzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBwcmludCBtYXJnaW4gaXMgYmVpbmcgc2hvd24uXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd1ByaW50TWFyZ2luKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjb2x1bW4gZGVmaW5pbmcgd2hlcmUgdGhlIHByaW50IG1hcmdpbiBzaG91bGQgYmUuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNob3dQcmludE1hcmdpbiBTcGVjaWZpZXMgdGhlIG5ldyBwcmludCBtYXJnaW5cbiAgICAgKi9cbiAgICBzZXRQcmludE1hcmdpbkNvbHVtbihzaG93UHJpbnRNYXJnaW46IG51bWJlcikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFByaW50TWFyZ2luQ29sdW1uKHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29sdW1uIG51bWJlciBvZiB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIGlzLlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICovXG4gICAgZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiBgcmVhZE9ubHlgIGlzIHRydWUsIHRoZW4gdGhlIGVkaXRvciBpcyBzZXQgdG8gcmVhZC1vbmx5IG1vZGUsIGFuZCBub25lIG9mIHRoZSBjb250ZW50IGNhbiBjaGFuZ2UuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSByZWFkT25seSBTcGVjaWZpZXMgd2hldGhlciB0aGUgZWRpdG9yIGNhbiBiZSBtb2RpZmllZCBvciBub3RcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRSZWFkT25seShyZWFkT25seTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInJlYWRPbmx5XCIsIHJlYWRPbmx5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZWRpdG9yIGlzIHNldCB0byByZWFkLW9ubHkgbW9kZS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0UmVhZE9ubHkoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInJlYWRPbmx5XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwZWNpZmllcyB3aGV0aGVyIHRvIHVzZSBiZWhhdmlvcnMgb3Igbm90LiBbXCJCZWhhdmlvcnNcIiBpbiB0aGlzIGNhc2UgaXMgdGhlIGF1dG8tcGFpcmluZyBvZiBzcGVjaWFsIGNoYXJhY3RlcnMsIGxpa2UgcXVvdGF0aW9uIG1hcmtzLCBwYXJlbnRoZXNpcywgb3IgYnJhY2tldHMuXXs6ICNCZWhhdmlvcnNEZWZ9XG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkIEVuYWJsZXMgb3IgZGlzYWJsZXMgYmVoYXZpb3JzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0QmVoYXZpb3Vyc0VuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImJlaGF2aW91cnNFbmFibGVkXCIsIGVuYWJsZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBiZWhhdmlvcnMgYXJlIGN1cnJlbnRseSBlbmFibGVkLiB7OkJlaGF2aW9yc0RlZn1cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRCZWhhdmlvdXJzRW5hYmxlZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiYmVoYXZpb3Vyc0VuYWJsZWRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BlY2lmaWVzIHdoZXRoZXIgdG8gdXNlIHdyYXBwaW5nIGJlaGF2aW9ycyBvciBub3QsIGkuZS4gYXV0b21hdGljYWxseSB3cmFwcGluZyB0aGUgc2VsZWN0aW9uIHdpdGggY2hhcmFjdGVycyBzdWNoIGFzIGJyYWNrZXRzXG4gICAgICogd2hlbiBzdWNoIGEgY2hhcmFjdGVyIGlzIHR5cGVkIGluLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZCBFbmFibGVzIG9yIGRpc2FibGVzIHdyYXBwaW5nIGJlaGF2aW9yc1xuICAgICAqXG4gICAgICoqL1xuICAgIHNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwid3JhcEJlaGF2aW91cnNFbmFibGVkXCIsIGVuYWJsZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSB3cmFwcGluZyBiZWhhdmlvcnMgYXJlIGN1cnJlbnRseSBlbmFibGVkLlxuICAgICAqKi9cbiAgICBnZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcIndyYXBCZWhhdmlvdXJzRW5hYmxlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgd2hldGhlciB0aGUgZm9sZCB3aWRnZXRzIHNob3VsZCBiZSBzaG93biBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBmb2xkIHdpZGdldHMgYXJlIHNob3duXG4gICAgICoqL1xuICAgIHNldFNob3dGb2xkV2lkZ2V0cyhzaG93OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ZvbGRXaWRnZXRzXCIsIHNob3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBmb2xkIHdpZGdldHMgYXJlIHNob3duLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ZvbGRXaWRnZXRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93Rm9sZFdpZGdldHNcIik7XG4gICAgfVxuXG4gICAgc2V0RmFkZUZvbGRXaWRnZXRzKGZhZGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIiwgZmFkZSk7XG4gICAgfVxuXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB3b3JkcyBvZiB0ZXh0IGZyb20gdGhlIGVkaXRvci4gQSBcIndvcmRcIiBpcyBkZWZpbmVkIGFzIGEgc3RyaW5nIG9mIGNoYXJhY3RlcnMgYm9va2VuZGVkIGJ5IHdoaXRlc3BhY2UuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGRpcmVjdGlvbiBUaGUgZGlyZWN0aW9uIG9mIHRoZSBkZWxldGlvbiB0byBvY2N1ciwgZWl0aGVyIFwibGVmdFwiIG9yIFwicmlnaHRcIlxuICAgICAqXG4gICAgICoqL1xuICAgIHJlbW92ZShkaXJlY3Rpb246IHN0cmluZykge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICBpZiAoZGlyZWN0aW9uID09IFwibGVmdFwiKVxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExlZnQoKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RSaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5nZXRCZWhhdmlvdXJzRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHNlc3Npb24uZ2V0U3RhdGUocmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgICAgIHZhciBuZXdfcmFuZ2UgPSBzZXNzaW9uLmdldE1vZGUoKS50cmFuc2Zvcm1BY3Rpb24oc3RhdGUsICdkZWxldGlvbicsIHRoaXMsIHNlc3Npb24sIHJhbmdlKTtcblxuICAgICAgICAgICAgaWYgKHJhbmdlLmVuZC5jb2x1bW4gPT09IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAodGV4dFt0ZXh0Lmxlbmd0aCAtIDFdID09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUocmFuZ2UuZW5kLnJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgvXlxccyskLy50ZXN0KGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmV3X3JhbmdlKVxuICAgICAgICAgICAgICAgIHJhbmdlID0gbmV3X3JhbmdlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSB3b3JkIGRpcmVjdGx5IHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIHJlbW92ZVdvcmRSaWdodCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmRSaWdodCgpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIHdvcmQgZGlyZWN0bHkgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICByZW1vdmVXb3JkTGVmdCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIHdvcmRzIHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgdW50aWwgdGhlIHN0YXJ0IG9mIHRoZSBsaW5lLlxuICAgICAqKi9cbiAgICByZW1vdmVUb0xpbmVTdGFydCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExpbmVTdGFydCgpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYWxsIHRoZSB3b3JkcyB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCB1bnRpbCB0aGUgZW5kIG9mIHRoZSBsaW5lLlxuICAgICAqKi9cbiAgICByZW1vdmVUb0xpbmVFbmQoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RMaW5lRW5kKCk7XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQuY29sdW1uID09PSByYW5nZS5lbmQuY29sdW1uICYmIHJhbmdlLnN0YXJ0LnJvdyA9PT0gcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IDA7XG4gICAgICAgICAgICByYW5nZS5lbmQucm93Kys7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwbGl0cyB0aGUgbGluZSBhdCB0aGUgY3VycmVudCBzZWxlY3Rpb24gKGJ5IGluc2VydGluZyBhbiBgJ1xcbidgKS5cbiAgICAgKiovXG4gICAgc3BsaXRMaW5lKCkge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoXCJcXG5cIik7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oY3Vyc29yKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmFuc3Bvc2VzIGN1cnJlbnQgbGluZS5cbiAgICAgKiovXG4gICAgdHJhbnNwb3NlTGV0dGVycygpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBjb2x1bW4gPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICBpZiAoY29sdW1uID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBzd2FwLCByYW5nZTtcbiAgICAgICAgaWYgKGNvbHVtbiA8IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICBzd2FwID0gbGluZS5jaGFyQXQoY29sdW1uKSArIGxpbmUuY2hhckF0KGNvbHVtbiAtIDEpO1xuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgcm5nLlJhbmdlKGN1cnNvci5yb3csIGNvbHVtbiAtIDEsIGN1cnNvci5yb3csIGNvbHVtbiArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc3dhcCA9IGxpbmUuY2hhckF0KGNvbHVtbiAtIDEpICsgbGluZS5jaGFyQXQoY29sdW1uIC0gMik7XG4gICAgICAgICAgICByYW5nZSA9IG5ldyBybmcuUmFuZ2UoY3Vyc29yLnJvdywgY29sdW1uIC0gMiwgY3Vyc29yLnJvdywgY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgc3dhcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udmVydHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGVudGlyZWx5IGludG8gbG93ZXJjYXNlLlxuICAgICAqKi9cbiAgICB0b0xvd2VyQ2FzZSgpIHtcbiAgICAgICAgdmFyIG9yaWdpbmFsUmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHRleHQgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHRleHQudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKG9yaWdpbmFsUmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBlbnRpcmVseSBpbnRvIHVwcGVyY2FzZS5cbiAgICAgKiovXG4gICAgdG9VcHBlckNhc2UoKSB7XG4gICAgICAgIHZhciBvcmlnaW5hbFJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCB0ZXh0LnRvVXBwZXJDYXNlKCkpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShvcmlnaW5hbFJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGFuIGluZGVudGF0aW9uIGludG8gdGhlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uIG9yIGluZGVudHMgdGhlIHNlbGVjdGVkIGxpbmVzLlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uaW5kZW50Um93c1xuICAgICAqKi9cbiAgICBpbmRlbnQoKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG5cbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA8IHJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICBzZXNzaW9uLmluZGVudFJvd3Mocm93cy5maXJzdCwgcm93cy5sYXN0LCBcIlxcdFwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChyYW5nZS5zdGFydC5jb2x1bW4gPCByYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICghL15cXHMrJC8udGVzdCh0ZXh0KSkge1xuICAgICAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5pbmRlbnRSb3dzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCwgXCJcXHRcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUocmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBzaXplID0gc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgIHZhciBjb2x1bW4gPSBzZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zaXRpb24ucm93LCBwb3NpdGlvbi5jb2x1bW4pO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlU29mdFRhYnMoKSkge1xuICAgICAgICAgICAgdmFyIGNvdW50ID0gKHNpemUgLSBjb2x1bW4gJSBzaXplKTtcbiAgICAgICAgICAgIHZhciBpbmRlbnRTdHJpbmcgPSBsYW5nLnN0cmluZ1JlcGVhdChcIiBcIiwgY291bnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGNvdW50ID0gY29sdW1uICUgc2l6ZTtcbiAgICAgICAgICAgIHdoaWxlIChsaW5lW3JhbmdlLnN0YXJ0LmNvbHVtbl0gPT0gXCIgXCIgJiYgY291bnQpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4tLTtcbiAgICAgICAgICAgICAgICBjb3VudC0tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaW5kZW50U3RyaW5nID0gXCJcXHRcIjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5pbnNlcnQoaW5kZW50U3RyaW5nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRlbnRzIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uaW5kZW50Um93c1xuICAgICAqKi9cbiAgICBibG9ja0luZGVudCgpIHtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmluZGVudFJvd3Mocm93cy5maXJzdCwgcm93cy5sYXN0LCBcIlxcdFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBPdXRkZW50cyB0aGUgY3VycmVudCBsaW5lLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm91dGRlbnRSb3dzXG4gICAgICoqL1xuICAgIGJsb2NrT3V0ZGVudCgpIHtcbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLm91dGRlbnRSb3dzKHNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBtb3ZlIG91dCBvZiBjb3JlIHdoZW4gd2UgaGF2ZSBnb29kIG1lY2hhbmlzbSBmb3IgbWFuYWdpbmcgZXh0ZW5zaW9uc1xuICAgIHNvcnRMaW5lcygpIHtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgdmFyIGxpbmVzID0gW107XG4gICAgICAgIGZvciAoaSA9IHJvd3MuZmlyc3Q7IGkgPD0gcm93cy5sYXN0OyBpKyspXG4gICAgICAgICAgICBsaW5lcy5wdXNoKHNlc3Npb24uZ2V0TGluZShpKSk7XG5cbiAgICAgICAgbGluZXMuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBpZiAoYS50b0xvd2VyQ2FzZSgpIDwgYi50b0xvd2VyQ2FzZSgpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoYS50b0xvd2VyQ2FzZSgpID4gYi50b0xvd2VyQ2FzZSgpKSByZXR1cm4gMTtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGVsZXRlUmFuZ2UgPSBuZXcgcm5nLlJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICBmb3IgKHZhciBpID0gcm93cy5maXJzdDsgaSA8PSByb3dzLmxhc3Q7IGkrKykge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoaSk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLnJvdyA9IGk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICBzZXNzaW9uLnJlcGxhY2UoZGVsZXRlUmFuZ2UsIGxpbmVzW2kgLSByb3dzLmZpcnN0XSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHaXZlbiB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHJhbmdlLCB0aGlzIGZ1bmN0aW9uIGVpdGhlciBjb21tZW50cyBhbGwgdGhlIGxpbmVzLCBvciB1bmNvbW1lbnRzIGFsbCBvZiB0aGVtLlxuICAgICAqKi9cbiAgICB0b2dnbGVDb21tZW50TGluZXMoKSB7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXMuc2Vzc2lvbi5nZXRTdGF0ZSh0aGlzLmdldEN1cnNvclBvc2l0aW9uKCkucm93KTtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmdldE1vZGUoKS50b2dnbGVDb21tZW50TGluZXMoc3RhdGUsIHRoaXMuc2Vzc2lvbiwgcm93cy5maXJzdCwgcm93cy5sYXN0KTtcbiAgICB9XG5cbiAgICB0b2dnbGVCbG9ja0NvbW1lbnQoKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXMuc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0TW9kZSgpLnRvZ2dsZUJsb2NrQ29tbWVudChzdGF0ZSwgdGhpcy5zZXNzaW9uLCByYW5nZSwgY3Vyc29yKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXb3JrcyBsaWtlIFtbRWRpdFNlc3Npb24uZ2V0VG9rZW5BdF1dLCBleGNlcHQgaXQgcmV0dXJucyBhIG51bWJlci5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXROdW1iZXJBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIF9udW1iZXJSeCA9IC9bXFwtXT9bMC05XSsoPzpcXC5bMC05XSspPy9nO1xuICAgICAgICBfbnVtYmVyUngubGFzdEluZGV4ID0gMDtcblxuICAgICAgICB2YXIgcyA9IHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvdyk7XG4gICAgICAgIHdoaWxlIChfbnVtYmVyUngubGFzdEluZGV4IDwgY29sdW1uKSB7XG4gICAgICAgICAgICB2YXIgbSA9IF9udW1iZXJSeC5leGVjKHMpO1xuICAgICAgICAgICAgaWYgKG0uaW5kZXggPD0gY29sdW1uICYmIG0uaW5kZXggKyBtWzBdLmxlbmd0aCA+PSBjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICB2YXIgbnVtYmVyID0ge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogbVswXSxcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IG0uaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIGVuZDogbS5pbmRleCArIG1bMF0ubGVuZ3RoXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVtYmVyO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRoZSBjaGFyYWN0ZXIgYmVmb3JlIHRoZSBjdXJzb3IgaXMgYSBudW1iZXIsIHRoaXMgZnVuY3Rpb25zIGNoYW5nZXMgaXRzIHZhbHVlIGJ5IGBhbW91bnRgLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBhbW91bnQgVGhlIHZhbHVlIHRvIGNoYW5nZSB0aGUgbnVtZXJhbCBieSAoY2FuIGJlIG5lZ2F0aXZlIHRvIGRlY3JlYXNlIHZhbHVlKVxuICAgICAqL1xuICAgIG1vZGlmeU51bWJlcihhbW91bnQpIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLmNvbHVtbjtcblxuICAgICAgICAvLyBnZXQgdGhlIGNoYXIgYmVmb3JlIHRoZSBjdXJzb3JcbiAgICAgICAgdmFyIGNoYXJSYW5nZSA9IG5ldyBybmcuUmFuZ2Uocm93LCBjb2x1bW4gLSAxLCByb3csIGNvbHVtbik7XG5cbiAgICAgICAgdmFyIGMgPSBwYXJzZUZsb2F0KHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UoY2hhclJhbmdlKSk7XG4gICAgICAgIC8vIGlmIHRoZSBjaGFyIGlzIGEgZGlnaXRcbiAgICAgICAgaWYgKCFpc05hTihjKSAmJiBpc0Zpbml0ZShjKSkge1xuICAgICAgICAgICAgLy8gZ2V0IHRoZSB3aG9sZSBudW1iZXIgdGhlIGRpZ2l0IGlzIHBhcnQgb2ZcbiAgICAgICAgICAgIHZhciBuciA9IHRoaXMuZ2V0TnVtYmVyQXQocm93LCBjb2x1bW4pO1xuICAgICAgICAgICAgLy8gaWYgbnVtYmVyIGZvdW5kXG4gICAgICAgICAgICBpZiAobnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgZnAgPSBuci52YWx1ZS5pbmRleE9mKFwiLlwiKSA+PSAwID8gbnIuc3RhcnQgKyBuci52YWx1ZS5pbmRleE9mKFwiLlwiKSArIDEgOiBuci5lbmQ7XG4gICAgICAgICAgICAgICAgdmFyIGRlY2ltYWxzID0gbnIuc3RhcnQgKyBuci52YWx1ZS5sZW5ndGggLSBmcDtcblxuICAgICAgICAgICAgICAgIHZhciB0ID0gcGFyc2VGbG9hdChuci52YWx1ZSk7XG4gICAgICAgICAgICAgICAgdCAqPSBNYXRoLnBvdygxMCwgZGVjaW1hbHMpO1xuXG5cbiAgICAgICAgICAgICAgICBpZiAoZnAgIT09IG5yLmVuZCAmJiBjb2x1bW4gPCBmcCkge1xuICAgICAgICAgICAgICAgICAgICBhbW91bnQgKj0gTWF0aC5wb3coMTAsIG5yLmVuZCAtIGNvbHVtbiAtIDEpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGFtb3VudCAqPSBNYXRoLnBvdygxMCwgbnIuZW5kIC0gY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0ICs9IGFtb3VudDtcbiAgICAgICAgICAgICAgICB0IC89IE1hdGgucG93KDEwLCBkZWNpbWFscyk7XG4gICAgICAgICAgICAgICAgdmFyIG5uciA9IHQudG9GaXhlZChkZWNpbWFscyk7XG5cbiAgICAgICAgICAgICAgICAvL3VwZGF0ZSBudW1iZXJcbiAgICAgICAgICAgICAgICB2YXIgcmVwbGFjZVJhbmdlID0gbmV3IHJuZy5SYW5nZShyb3csIG5yLnN0YXJ0LCByb3csIG5yLmVuZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmVwbGFjZVJhbmdlLCBubnIpO1xuXG4gICAgICAgICAgICAgICAgLy9yZXBvc2l0aW9uIHRoZSBjdXJzb3JcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIE1hdGgubWF4KG5yLnN0YXJ0ICsgMSwgY29sdW1uICsgbm5yLmxlbmd0aCAtIG5yLnZhbHVlLmxlbmd0aCkpO1xuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCB0aGUgbGluZXMgaW4gdGhlIGN1cnJlbnQgc2VsZWN0aW9uXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ucmVtb3ZlXG4gICAgICoqL1xuICAgIHJlbW92ZUxpbmVzKCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB2YXIgcmFuZ2U7XG4gICAgICAgIGlmIChyb3dzLmZpcnN0ID09PSAwIHx8IHJvd3MubGFzdCArIDEgPCB0aGlzLnNlc3Npb24uZ2V0TGVuZ3RoKCkpXG4gICAgICAgICAgICByYW5nZSA9IG5ldyBybmcuUmFuZ2Uocm93cy5maXJzdCwgMCwgcm93cy5sYXN0ICsgMSwgMCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IHJuZy5SYW5nZShcbiAgICAgICAgICAgICAgICByb3dzLmZpcnN0IC0gMSwgdGhpcy5zZXNzaW9uLmdldExpbmUocm93cy5maXJzdCAtIDEpLmxlbmd0aCxcbiAgICAgICAgICAgICAgICByb3dzLmxhc3QsIHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvd3MubGFzdCkubGVuZ3RoXG4gICAgICAgICAgICApO1xuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIGR1cGxpY2F0ZVNlbGVjdGlvbigpIHtcbiAgICAgICAgdmFyIHNlbCA9IHRoaXMuc2VsZWN0aW9uO1xuICAgICAgICB2YXIgZG9jID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgcmFuZ2UgPSBzZWwuZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIHJldmVyc2UgPSBzZWwuaXNCYWNrd2FyZHMoKTtcbiAgICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGRvYy5kdXBsaWNhdGVMaW5lcyhyb3csIHJvdyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcG9pbnQgPSByZXZlcnNlID8gcmFuZ2Uuc3RhcnQgOiByYW5nZS5lbmQ7XG4gICAgICAgICAgICB2YXIgZW5kUG9pbnQgPSBkb2MuaW5zZXJ0KHBvaW50LCBkb2MuZ2V0VGV4dFJhbmdlKHJhbmdlKSk7XG4gICAgICAgICAgICByYW5nZS5zdGFydCA9IHBvaW50O1xuICAgICAgICAgICAgcmFuZ2UuZW5kID0gZW5kUG9pbnQ7XG5cbiAgICAgICAgICAgIHNlbC5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmV2ZXJzZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyBkb3duIG9uZSByb3cuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSBPbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVMaW5lc1VwXG4gICAgICoqL1xuICAgIG1vdmVMaW5lc0Rvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlTGluZXNEb3duKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgdXAgb25lIHJvdy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSBPbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVMaW5lc0Rvd25cbiAgICAgKiovXG4gICAgbW92ZUxpbmVzVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlTGluZXNVcChmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIGEgcmFuZ2Ugb2YgdGV4dCBmcm9tIHRoZSBnaXZlbiByYW5nZSB0byB0aGUgZ2l2ZW4gcG9zaXRpb24uIGB0b1Bvc2l0aW9uYCBpcyBhbiBvYmplY3QgdGhhdCBsb29rcyBsaWtlIHRoaXM6XG4gICAgICogYGBganNvblxuICAgICAqICAgIHsgcm93OiBuZXdSb3dMb2NhdGlvbiwgY29sdW1uOiBuZXdDb2x1bW5Mb2NhdGlvbiB9XG4gICAgICogYGBgXG4gICAgICogQHBhcmFtIHtSYW5nZX0gZnJvbVJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHlvdSB3YW50IG1vdmVkIHdpdGhpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UmFuZ2V9IFRoZSBuZXcgcmFuZ2Ugd2hlcmUgdGhlIHRleHQgd2FzIG1vdmVkIHRvLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVUZXh0XG4gICAgICoqL1xuICAgIG1vdmVUZXh0KHJhbmdlLCB0b1Bvc2l0aW9uLCBjb3B5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24ubW92ZVRleHQocmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvcGllcyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIHVwIG9uZSByb3cuXG4gICAgICogQHJldHVybnMge051bWJlcn0gT24gc3VjY2VzcywgcmV0dXJucyAwLlxuICAgICAqXG4gICAgICoqL1xuICAgIGNvcHlMaW5lc1VwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlTGluZXMoZnVuY3Rpb24oZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgZG93biBvbmUgcm93LlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIHJldHVybnMgdGhlIG51bWJlciBvZiBuZXcgcm93cyBhZGRlZDsgaW4gb3RoZXIgd29yZHMsIGBsYXN0Um93IC0gZmlyc3RSb3cgKyAxYC5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kdXBsaWNhdGVMaW5lc1xuICAgICAqXG4gICAgICoqL1xuICAgIGNvcHlMaW5lc0Rvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGVzIGEgc3BlY2lmaWMgZnVuY3Rpb24sIHdoaWNoIGNhbiBiZSBhbnl0aGluZyB0aGF0IG1hbmlwdWxhdGVzIHNlbGVjdGVkIGxpbmVzLCBzdWNoIGFzIGNvcHlpbmcgdGhlbSwgZHVwbGljYXRpbmcgdGhlbSwgb3Igc2hpZnRpbmcgdGhlbS5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBtb3ZlciBBIG1ldGhvZCB0byBjYWxsIG9uIGVhY2ggc2VsZWN0ZWQgcm93XG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICAkbW92ZUxpbmVzKG1vdmVyKSB7XG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbjtcbiAgICAgICAgaWYgKCFzZWxlY3Rpb25bJ2luTXVsdGlTZWxlY3RNb2RlJ10gfHwgdGhpcy5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBzZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRSb3dzOiB7IGZpcnN0OiBudW1iZXI7IGxhc3Q6IG51bWJlciB9ID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICB2YXIgbGluZXNNb3ZlZCA9IG1vdmVyLmNhbGwodGhpcywgc2VsZWN0ZWRSb3dzLmZpcnN0LCBzZWxlY3RlZFJvd3MubGFzdCk7XG4gICAgICAgICAgICByYW5nZS5tb3ZlQnkobGluZXNNb3ZlZCwgMCk7XG4gICAgICAgICAgICBzZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UocmFuZ2UpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJhbmdlcyA9IHNlbGVjdGlvbi5yYW5nZUxpc3QucmFuZ2VzO1xuICAgICAgICAgICAgc2VsZWN0aW9uLnJhbmdlTGlzdC5kZXRhY2goKTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHJhbmdlcy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2VJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbGxhcHNlZFJvd3MgPSByYW5nZXNbaV0uY29sbGFwc2VSb3dzKCk7XG4gICAgICAgICAgICAgICAgdmFyIGxhc3QgPSBjb2xsYXBzZWRSb3dzLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0ID0gY29sbGFwc2VkUm93cy5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGktLSkge1xuICAgICAgICAgICAgICAgICAgICBjb2xsYXBzZWRSb3dzID0gcmFuZ2VzW2ldLmNvbGxhcHNlUm93cygpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZmlyc3QgLSBjb2xsYXBzZWRSb3dzLmVuZC5yb3cgPD0gMSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpcnN0ID0gY29sbGFwc2VkUm93cy5lbmQucm93O1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaSsrO1xuXG4gICAgICAgICAgICAgICAgdmFyIGxpbmVzTW92ZWQgPSBtb3Zlci5jYWxsKHRoaXMsIGZpcnN0LCBsYXN0KTtcbiAgICAgICAgICAgICAgICB3aGlsZSAocmFuZ2VJbmRleCA+PSBpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlc1tyYW5nZUluZGV4XS5tb3ZlQnkobGluZXNNb3ZlZCwgMCk7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlSW5kZXgtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2Uoc2VsZWN0aW9uLnJhbmdlc1swXSk7XG4gICAgICAgICAgICBzZWxlY3Rpb24ucmFuZ2VMaXN0LmF0dGFjaCh0aGlzLnNlc3Npb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBvYmplY3QgaW5kaWNhdGluZyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHJvd3MuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICAqKi9cbiAgICAkZ2V0U2VsZWN0ZWRSb3dzKCk6IHsgZmlyc3Q6IG51bWJlcjsgbGFzdDogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuY29sbGFwc2VSb3dzKCk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGZpcnN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0KHJhbmdlLnN0YXJ0LnJvdyksXG4gICAgICAgICAgICBsYXN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZEVuZChyYW5nZS5lbmQucm93KVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25TdGFydCh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hvd0NvbXBvc2l0aW9uKHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKSk7XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvblVwZGF0ZSh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q29tcG9zaXRpb25UZXh0KHRleHQpO1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25FbmQoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93fVxuICAgICAqXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93XG4gICAgICoqL1xuICAgIGdldEZpcnN0VmlzaWJsZVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvd31cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93XG4gICAgICoqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kaWNhdGVzIGlmIHRoZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc1Jvd1Zpc2libGUocm93OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChyb3cgPj0gdGhpcy5nZXRGaXJzdFZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5nZXRMYXN0VmlzaWJsZVJvdygpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgaWYgdGhlIGVudGlyZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGlzUm93RnVsbHlWaXNpYmxlKHJvdzogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAocm93ID49IHRoaXMucmVuZGVyZXIuZ2V0Rmlyc3RGdWxseVZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5yZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG51bWJlciBvZiBjdXJyZW50bHkgdmlzaWJpbGUgcm93cy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICAkZ2V0VmlzaWJsZVJvd0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNjcm9sbEJvdHRvbVJvdygpIC0gdGhpcy5yZW5kZXJlci5nZXRTY3JvbGxUb3BSb3coKSArIDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRklYTUU6IFRoZSBzZW1hbnRpY3Mgb2Ygc2VsZWN0IGFyZSBub3QgZWFzaWx5IHVuZGVyc3Rvb2QuIFxuICAgICAqIEBwYXJhbSBkaXJlY3Rpb24gKzEgZm9yIHBhZ2UgZG93biwgLTEgZm9yIHBhZ2UgdXAuIE1heWJlIE4gZm9yIE4gcGFnZXM/XG4gICAgICogQHBhcmFtIHNlbGVjdCB0cnVlIHwgZmFsc2UgfCB1bmRlZmluZWRcbiAgICAgKi9cbiAgICAkbW92ZUJ5UGFnZShkaXJlY3Rpb246IG51bWJlciwgc2VsZWN0PzogYm9vbGVhbikge1xuICAgICAgICB2YXIgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVyO1xuICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5yZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgdmFyIHJvd3MgPSBkaXJlY3Rpb24gKiBNYXRoLmZsb29yKGNvbmZpZy5oZWlnaHQgLyBjb25maWcubGluZUhlaWdodCk7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcrKztcbiAgICAgICAgaWYgKHNlbGVjdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkocm93cywgMCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzZWxlY3QgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkocm93cywgMCk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHJlbmRlcmVyLnNjcm9sbFRvcDtcblxuICAgICAgICByZW5kZXJlci5zY3JvbGxCeSgwLCByb3dzICogY29uZmlnLmxpbmVIZWlnaHQpO1xuICAgICAgICAvLyBXaHkgZG9uJ3Qgd2UgYXNzZXJ0IG91ciBhcmdzIGFuZCBkbyB0eXBlb2Ygc2VsZWN0ID09PSAndW5kZWZpbmVkJz9cbiAgICAgICAgaWYgKHNlbGVjdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAvLyBUaGlzIGlzIGNhbGxlZCB3aGVuIHNlbGVjdCBpcyB1bmRlZmluZWQuXG4gICAgICAgICAgICByZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyhzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgdGhlIHRleHQgZnJvbSB0aGUgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgdW50aWwgd2hlcmUgYSBcInBhZ2UgZG93blwiIGZpbmlzaGVzLlxuICAgICAqKi9cbiAgICBzZWxlY3RQYWdlRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgrMSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyB0aGUgdGV4dCBmcm9tIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCB1bnRpbCB3aGVyZSBhIFwicGFnZSB1cFwiIGZpbmlzaGVzLlxuICAgICAqKi9cbiAgICBzZWxlY3RQYWdlVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoLTEsIHRydWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIGRvd25cIiBpcywgYXMgd2VsbCBhcyBtb3ZpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgZ290b1BhZ2VEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKCsxLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgdXBcIiBpcywgYXMgd2VsbCBhcyBtb3ZpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgZ290b1BhZ2VVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgtMSwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSBkb3duXCIgaXMsIHdpdGhvdXQgY2hhbmdpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgc2Nyb2xsUGFnZURvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIHVwXCIgaXMsIHdpdGhvdXQgY2hhbmdpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgc2Nyb2xsUGFnZVVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKC0xKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgZWRpdG9yIHRvIHRoZSBzcGVjaWZpZWQgcm93LlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1Jvd1xuICAgICAqL1xuICAgIHNjcm9sbFRvUm93KHJvdzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9Sb3cocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRvIGEgbGluZS4gSWYgYGNlbnRlcmAgaXMgYHRydWVgLCBpdCBwdXRzIHRoZSBsaW5lIGluIG1pZGRsZSBvZiBzY3JlZW4gKG9yIGF0dGVtcHRzIHRvKS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZSBUaGUgbGluZSB0byBzY3JvbGwgdG9cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGNlbnRlciBJZiBgdHJ1ZWBcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGVzIHNjcm9sbGluZ1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBhbmltYXRpb24gaGFzIGZpbmlzaGVkXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmVcbiAgICAgKiovXG4gICAgc2Nyb2xsVG9MaW5lKGxpbmU6IG51bWJlciwgY2VudGVyOiBib29sZWFuLCBhbmltYXRlOiBib29sZWFuLCBjYWxsYmFjaz8pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb0xpbmUobGluZSwgY2VudGVyLCBhbmltYXRlLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gY2VudGVyIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBvbiB0aGUgc2NyZWVuLlxuICAgICAqKi9cbiAgICBjZW50ZXJTZWxlY3Rpb24oKSB7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogTWF0aC5mbG9vcihyYW5nZS5zdGFydC5yb3cgKyAocmFuZ2UuZW5kLnJvdyAtIHJhbmdlLnN0YXJ0LnJvdykgLyAyKSxcbiAgICAgICAgICAgIGNvbHVtbjogTWF0aC5mbG9vcihyYW5nZS5zdGFydC5jb2x1bW4gKyAocmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbikgLyAyKVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmFsaWduQ3Vyc29yKHBvcywgMC41KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IuXG4gICAgICogQHJldHVybnMge09iamVjdH0gQW4gb2JqZWN0IHRoYXQgbG9va3Mgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgICAgKlxuICAgICAqIGBgYGpzb25cbiAgICAgKiB7IHJvdzogY3VyclJvdywgY29sdW1uOiBjdXJyQ29sIH1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5nZXRDdXJzb3JcbiAgICAgKiovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb24oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzY3JlZW4gcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAgKiovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW4oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWxlY3Rpb24uZ2V0UmFuZ2V9XG4gICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5nZXRSYW5nZVxuICAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25SYW5nZSgpOiBybmcuUmFuZ2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIGFsbCB0aGUgdGV4dCBpbiBlZGl0b3IuXG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLnNlbGVjdEFsbFxuICAgICAqKi9cbiAgICBzZWxlY3RBbGwoKSB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdEFsbCgpO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6U2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9ufVxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5jbGVhclNlbGVjdGlvblxuICAgICAqKi9cbiAgICBjbGVhclNlbGVjdGlvbigpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzcGVjaWZpZWQgcm93IGFuZCBjb2x1bW4uIE5vdGUgdGhhdCB0aGlzIGRvZXMgbm90IGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgbmV3IHJvdyBudW1iZXJcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBuZXcgY29sdW1uIG51bWJlclxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gYW5pbWF0ZVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLm1vdmVDdXJzb3JUb1xuICAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4sIGFuaW1hdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHBvc2l0aW9uIGluZGljYXRlZCBieSBgcG9zLnJvd2AgYW5kIGBwb3MuY29sdW1uYC5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gcG9zIEFuIG9iamVjdCB3aXRoIHR3byBwcm9wZXJ0aWVzLCByb3cgYW5kIGNvbHVtblxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb25cbiAgICAgKiovXG4gICAgbW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHBvcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvcidzIHJvdyBhbmQgY29sdW1uIHRvIHRoZSBuZXh0IG1hdGNoaW5nIGJyYWNrZXQgb3IgSFRNTCB0YWcuXG4gICAgICpcbiAgICAgKiovXG4gICAganVtcFRvTWF0Y2hpbmcoc2VsZWN0KSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMuc2Vzc2lvbiwgY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgICAgIHZhciBwcmV2VG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgdmFyIHRva2VuID0gcHJldlRva2VuO1xuXG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG5cbiAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAvL2dldCBuZXh0IGNsb3NpbmcgdGFnIG9yIGJyYWNrZXRcbiAgICAgICAgdmFyIG1hdGNoVHlwZTtcbiAgICAgICAgdmFyIGZvdW5kID0gZmFsc2U7XG4gICAgICAgIHZhciBkZXB0aCA9IHt9O1xuICAgICAgICB2YXIgaSA9IGN1cnNvci5jb2x1bW4gLSB0b2tlbi5zdGFydDtcbiAgICAgICAgdmFyIGJyYWNrZXRUeXBlO1xuICAgICAgICB2YXIgYnJhY2tldHMgPSB7XG4gICAgICAgICAgICBcIilcIjogXCIoXCIsXG4gICAgICAgICAgICBcIihcIjogXCIoXCIsXG4gICAgICAgICAgICBcIl1cIjogXCJbXCIsXG4gICAgICAgICAgICBcIltcIjogXCJbXCIsXG4gICAgICAgICAgICBcIntcIjogXCJ7XCIsXG4gICAgICAgICAgICBcIn1cIjogXCJ7XCJcbiAgICAgICAgfTtcblxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBpZiAodG9rZW4udmFsdWUubWF0Y2goL1t7fSgpXFxbXFxdXS9nKSkge1xuICAgICAgICAgICAgICAgIGZvciAoOyBpIDwgdG9rZW4udmFsdWUubGVuZ3RoICYmICFmb3VuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYnJhY2tldHNbdG9rZW4udmFsdWVbaV1dKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGJyYWNrZXRUeXBlID0gYnJhY2tldHNbdG9rZW4udmFsdWVbaV1dICsgJy4nICsgdG9rZW4udHlwZS5yZXBsYWNlKFwicnBhcmVuXCIsIFwibHBhcmVuXCIpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc05hTihkZXB0aFticmFja2V0VHlwZV0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFticmFja2V0VHlwZV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZVtpXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnKCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdbJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3snOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW2JyYWNrZXRUeXBlXSsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnKSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICddJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ30nOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW2JyYWNrZXRUeXBlXS0tO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlcHRoW2JyYWNrZXRUeXBlXSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hUeXBlID0gJ2JyYWNrZXQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0b2tlbiAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzTmFOKGRlcHRoW3Rva2VuLnZhbHVlXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGhbdG9rZW4udmFsdWVdID0gMDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGhbdG9rZW4udmFsdWVdKys7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGhbdG9rZW4udmFsdWVdLS07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGRlcHRoW3Rva2VuLnZhbHVlXSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hUeXBlID0gJ3RhZyc7XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghZm91bmQpIHtcbiAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSB0b2tlbjtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gd2hpbGUgKHRva2VuICYmICFmb3VuZCk7XG5cbiAgICAgICAgLy9ubyBtYXRjaCBmb3VuZFxuICAgICAgICBpZiAoIW1hdGNoVHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlOiBybmcuUmFuZ2U7XG4gICAgICAgIGlmIChtYXRjaFR5cGUgPT09ICdicmFja2V0Jykge1xuICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKGN1cnNvcik7XG4gICAgICAgICAgICBpZiAoIXJhbmdlKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2UgPSBuZXcgcm5nLlJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyBpIC0gMSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgaSAtIDFcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy5yb3cgPT09IGN1cnNvci5yb3cgJiYgTWF0aC5hYnMocG9zLmNvbHVtbiAtIGN1cnNvci5jb2x1bW4pIDwgMilcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKHBvcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAobWF0Y2hUeXBlID09PSAndGFnJykge1xuICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpXG4gICAgICAgICAgICAgICAgdmFyIHRhZyA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IHJuZy5SYW5nZShcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSAtIDIsXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgLSAyXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAvL2ZpbmQgbWF0Y2hpbmcgdGFnXG4gICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHByZXZUb2tlbjtcbiAgICAgICAgICAgICAgICAgICAgcHJldlRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi50eXBlLmluZGV4T2YoJ3RhZy1jbG9zZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJhbmdlLnNldEVuZChpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSwgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSB0YWcgJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFt0YWddKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbdGFnXS0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZXB0aFt0YWddID09PSAwKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IHdoaWxlIChwcmV2VG9rZW4gJiYgIWZvdW5kKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy93ZSBmb3VuZCBpdFxuICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSkge1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocG9zLnJvdyA9PSBjdXJzb3Iucm93ICYmIE1hdGguYWJzKHBvcy5jb2x1bW4gLSBjdXJzb3IuY29sdW1uKSA8IDIpXG4gICAgICAgICAgICAgICAgICAgIHBvcyA9IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHBvcyA9IHJhbmdlICYmIHJhbmdlWydjdXJzb3InXSB8fCBwb3M7XG4gICAgICAgIGlmIChwb3MpIHtcbiAgICAgICAgICAgIGlmIChzZWxlY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UgJiYgcmFuZ2UuaXNFcXVhbCh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RUbyhwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3BlY2lmaWVkIGxpbmUgbnVtYmVyLCBhbmQgYWxzbyBpbnRvIHRoZSBpbmRpY2lhdGVkIGNvbHVtbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZU51bWJlciBUaGUgbGluZSBudW1iZXIgdG8gZ28gdG9cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIEEgY29sdW1uIG51bWJlciB0byBnbyB0b1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZXMgc2NvbGxpbmdcbiAgICAgKiovXG4gICAgZ290b0xpbmUobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIsIGFuaW1hdGU/OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi51bmZvbGQoeyByb3c6IGxpbmVOdW1iZXIgLSAxLCBjb2x1bW46IGNvbHVtbiB8fCAwIH0pO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgIC8vIHRvZG86IGZpbmQgYSB3YXkgdG8gYXV0b21hdGljYWxseSBleGl0IG11bHRpc2VsZWN0IG1vZGVcbiAgICAgICAgdGhpcy5leGl0TXVsdGlTZWxlY3RNb2RlICYmIHRoaXMuZXhpdE11bHRpU2VsZWN0TW9kZSgpO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsaW5lTnVtYmVyIC0gMSwgY29sdW1uIHx8IDApO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgIGlmICghdGhpcy5pc1Jvd0Z1bGx5VmlzaWJsZShsaW5lTnVtYmVyIC0gMSkpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9MaW5lKGxpbmVOdW1iZXIgLSAxLCB0cnVlLCBhbmltYXRlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNwZWNpZmllZCByb3cgYW5kIGNvbHVtbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIG5ldyByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgbmV3IGNvbHVtbiBudW1iZXJcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yLm1vdmVDdXJzb3JUb1xuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVRvKHJvdywgY29sdW1uKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB1cCBpbiB0aGUgZG9jdW1lbnQgdGhlIHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZXMgVGhlIG51bWJlciBvZiB0aW1lcyB0byBjaGFuZ2UgbmF2aWdhdGlvblxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgbmF2aWdhdGVVcCh0aW1lcykge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSAmJiAhdGhpcy5zZWxlY3Rpb24uaXNCYWNrd2FyZHMoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gdGhpcy5zZWxlY3Rpb24uYW5jaG9yLmdldFBvc2l0aW9uKCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25TdGFydCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckJ5KC10aW1lcyB8fCAtMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciBkb3duIGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZURvd24odGltZXMpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkgJiYgdGhpcy5zZWxlY3Rpb24uaXNCYWNrd2FyZHMoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVuZCA9IHRoaXMuc2VsZWN0aW9uLmFuY2hvci5nZXRQb3NpdGlvbigpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uRW5kKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkodGltZXMgfHwgMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciBsZWZ0IGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUxlZnQodGltZXMpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25TdGFydCA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKS5zdGFydDtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uU3RhcnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGltZXMgPSB0aW1lcyB8fCAxO1xuICAgICAgICAgICAgd2hpbGUgKHRpbWVzLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGVmdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHJpZ2h0IGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVJpZ2h0KHRpbWVzKSB7XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpLmVuZDtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uRW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRpbWVzID0gdGltZXMgfHwgMTtcbiAgICAgICAgICAgIHdoaWxlICh0aW1lcy0tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvclJpZ2h0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGN1cnJlbnQgbGluZS4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUxpbmVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVTdGFydCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgbGluZS4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUxpbmVFbmQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JMaW5lRW5kKCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCBmaWxlLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRmlsZUVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckZpbGVFbmQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGN1cnJlbnQgZmlsZS4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUZpbGVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckZpbGVTdGFydCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSB3b3JkIGltbWVkaWF0ZWx5IHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBwb3NpdGlvbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVdvcmRSaWdodCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvcldvcmRSaWdodCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSB3b3JkIGltbWVkaWF0ZWx5IHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJyZW50IHBvc2l0aW9uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlV29yZExlZnQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkTGVmdCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwbGFjZXMgdGhlIGZpcnN0IG9jY3VyYW5jZSBvZiBgb3B0aW9ucy5uZWVkbGVgIHdpdGggdGhlIHZhbHVlIGluIGByZXBsYWNlbWVudGAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHJlcGxhY2VtZW50IFRoZSB0ZXh0IHRvIHJlcGxhY2Ugd2l0aFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBbW1NlYXJjaCBgU2VhcmNoYF1dIG9wdGlvbnMgdG8gdXNlXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICByZXBsYWNlKHJlcGxhY2VtZW50LCBvcHRpb25zKSB7XG4gICAgICAgIGlmIChvcHRpb25zKVxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldChvcHRpb25zKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLiRzZWFyY2guZmluZCh0aGlzLnNlc3Npb24pO1xuICAgICAgICB2YXIgcmVwbGFjZWQgPSAwO1xuICAgICAgICBpZiAoIXJhbmdlKVxuICAgICAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuXG4gICAgICAgIGlmICh0aGlzLiR0cnlSZXBsYWNlKHJhbmdlLCByZXBsYWNlbWVudCkpIHtcbiAgICAgICAgICAgIHJlcGxhY2VkID0gMTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmFuZ2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcocmFuZ2Uuc3RhcnQsIHJhbmdlLmVuZCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwbGFjZXMgYWxsIG9jY3VyYW5jZXMgb2YgYG9wdGlvbnMubmVlZGxlYCB3aXRoIHRoZSB2YWx1ZSBpbiBgcmVwbGFjZW1lbnRgLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSByZXBsYWNlbWVudCBUaGUgdGV4dCB0byByZXBsYWNlIHdpdGhcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBUaGUgW1tTZWFyY2ggYFNlYXJjaGBdXSBvcHRpb25zIHRvIHVzZVxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgcmVwbGFjZUFsbChyZXBsYWNlbWVudCwgb3B0aW9ucykge1xuICAgICAgICBpZiAob3B0aW9ucykge1xuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldChvcHRpb25zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZXMgPSB0aGlzLiRzZWFyY2guZmluZEFsbCh0aGlzLnNlc3Npb24pO1xuICAgICAgICB2YXIgcmVwbGFjZWQgPSAwO1xuICAgICAgICBpZiAoIXJhbmdlcy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcblxuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8oMCwgMCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IHJhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRyeVJlcGxhY2UocmFuZ2VzW2ldLCByZXBsYWNlbWVudCkpIHtcbiAgICAgICAgICAgICAgICByZXBsYWNlZCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2Uoc2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcblxuICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG4gICAgfVxuXG4gICAgJHRyeVJlcGxhY2UocmFuZ2UsIHJlcGxhY2VtZW50KSB7XG4gICAgICAgIHZhciBpbnB1dCA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICByZXBsYWNlbWVudCA9IHRoaXMuJHNlYXJjaC5yZXBsYWNlKGlucHV0LCByZXBsYWNlbWVudCk7XG4gICAgICAgIGlmIChyZXBsYWNlbWVudCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgcmFuZ2UuZW5kID0gdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHJlcGxhY2VtZW50KTtcbiAgICAgICAgICAgIHJldHVybiByYW5nZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWFyY2guZ2V0T3B0aW9uc30gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcmVsYXRlZCBTZWFyY2guZ2V0T3B0aW9uc1xuICAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgICoqL1xuICAgIGdldExhc3RTZWFyY2hPcHRpb25zKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2VhcmNoLmdldE9wdGlvbnMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBdHRlbXB0cyB0byBmaW5kIGBuZWVkbGVgIHdpdGhpbiB0aGUgZG9jdW1lbnQuIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IG5lZWRsZSBUaGUgdGV4dCB0byBzZWFyY2ggZm9yIChvcHRpb25hbClcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBBbiBvYmplY3QgZGVmaW5pbmcgdmFyaW91cyBzZWFyY2ggcHJvcGVydGllc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZSBzY3JvbGxpbmdcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgU2VhcmNoLmZpbmRcbiAgICAgKiovXG4gICAgZmluZChuZWVkbGU6IChzdHJpbmcgfCBSZWdFeHApLCBvcHRpb25zLCBhbmltYXRlKSB7XG4gICAgICAgIGlmICghb3B0aW9ucylcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcblxuICAgICAgICBpZiAodHlwZW9mIG5lZWRsZSA9PSBcInN0cmluZ1wiIHx8IG5lZWRsZSBpbnN0YW5jZW9mIFJlZ0V4cClcbiAgICAgICAgICAgIG9wdGlvbnMubmVlZGxlID0gbmVlZGxlO1xuICAgICAgICBlbHNlIGlmICh0eXBlb2YgbmVlZGxlID09IFwib2JqZWN0XCIpXG4gICAgICAgICAgICBvb3AubWl4aW4ob3B0aW9ucywgbmVlZGxlKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICBpZiAob3B0aW9ucy5uZWVkbGUgPT0gbnVsbCkge1xuICAgICAgICAgICAgbmVlZGxlID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSlcbiAgICAgICAgICAgICAgICB8fCB0aGlzLiRzZWFyY2guJG9wdGlvbnMubmVlZGxlO1xuICAgICAgICAgICAgaWYgKCFuZWVkbGUpIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRXb3JkUmFuZ2UocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIG5lZWRsZSA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldCh7IG5lZWRsZTogbmVlZGxlIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kc2VhcmNoLnNldChvcHRpb25zKTtcbiAgICAgICAgaWYgKCFvcHRpb25zLnN0YXJ0KVxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldCh7IHN0YXJ0OiByYW5nZSB9KTtcblxuICAgICAgICB2YXIgbmV3UmFuZ2UgPSB0aGlzLiRzZWFyY2guZmluZCh0aGlzLnNlc3Npb24pO1xuICAgICAgICBpZiAob3B0aW9ucy5wcmV2ZW50U2Nyb2xsKVxuICAgICAgICAgICAgcmV0dXJuIG5ld1JhbmdlO1xuICAgICAgICBpZiAobmV3UmFuZ2UpIHtcbiAgICAgICAgICAgIHRoaXMucmV2ZWFsUmFuZ2UobmV3UmFuZ2UsIGFuaW1hdGUpO1xuICAgICAgICAgICAgcmV0dXJuIG5ld1JhbmdlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGNsZWFyIHNlbGVjdGlvbiBpZiBub3RoaW5nIGlzIGZvdW5kXG4gICAgICAgIGlmIChvcHRpb25zLmJhY2t3YXJkcylcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcmFuZ2UuZW5kO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZS5lbmQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0UmFuZ2UocmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIGFub3RoZXIgc2VhcmNoIGZvciBgbmVlZGxlYCBpbiB0aGUgZG9jdW1lbnQuIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgc2VhcmNoIG9wdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvci5maW5kXG4gICAgICoqL1xuICAgIGZpbmROZXh0KG5lZWRsZT86IChzdHJpbmcgfCBSZWdFeHApLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICAvLyBGSVhNRTogVGhpcyBsb29rcyBmbGlwcGVkIGNvbXBhcmVkIHRvIGZpbmRQcmV2aW91cy4gXG4gICAgICAgIHRoaXMuZmluZChuZWVkbGUsIHsgc2tpcEN1cnJlbnQ6IHRydWUsIGJhY2t3YXJkczogZmFsc2UgfSwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGVyZm9ybXMgYSBzZWFyY2ggZm9yIGBuZWVkbGVgIGJhY2t3YXJkcy4gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBzZWFyY2ggb3B0aW9uc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZSBzY3JvbGxpbmdcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yLmZpbmRcbiAgICAgKiovXG4gICAgZmluZFByZXZpb3VzKG5lZWRsZT86IChzdHJpbmcgfCBSZWdFeHApLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICB0aGlzLmZpbmQobmVlZGxlLCB7IHNraXBDdXJyZW50OiB0cnVlLCBiYWNrd2FyZHM6IHRydWUgfSwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgcmV2ZWFsUmFuZ2UocmFuZ2U6IEN1cnNvclJhbmdlLCBhbmltYXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi51bmZvbGQocmFuZ2UpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9wO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3KHJhbmdlLnN0YXJ0LCByYW5nZS5lbmQsIDAuNSk7XG4gICAgICAgIGlmIChhbmltYXRlICE9PSBmYWxzZSlcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyhzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VW5kb01hbmFnZXIudW5kb31cbiAgICAgKiBAcmVsYXRlZCBVbmRvTWFuYWdlci51bmRvXG4gICAgICoqL1xuICAgIHVuZG8oKSB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVbmRvTWFuYWdlcigpLnVuZG8oKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VW5kb01hbmFnZXIucmVkb31cbiAgICAgKiBAcmVsYXRlZCBVbmRvTWFuYWdlci5yZWRvXG4gICAgICoqL1xuICAgIHJlZG8oKSB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVbmRvTWFuYWdlcigpLnJlZG8oKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQ2xlYW5zIHVwIHRoZSBlbnRpcmUgZWRpdG9yLlxuICAgICAqKi9cbiAgICBkZXN0cm95KCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiZGVzdHJveVwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIGF1dG9tYXRpYyBzY3JvbGxpbmcgb2YgdGhlIGN1cnNvciBpbnRvIHZpZXcgd2hlbiBlZGl0b3IgaXRzZWxmIGlzIGluc2lkZSBzY3JvbGxhYmxlIGVsZW1lbnRcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZSBkZWZhdWx0IHRydWVcbiAgICAgKiovXG4gICAgc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3KGVuYWJsZTogYm9vbGVhbikge1xuICAgICAgICBpZiAoIWVuYWJsZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHJlY3Q7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHNob3VsZFNjcm9sbCA9IGZhbHNlO1xuICAgICAgICBpZiAoIXRoaXMuJHNjcm9sbEFuY2hvcilcbiAgICAgICAgICAgIHRoaXMuJHNjcm9sbEFuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHZhciBzY3JvbGxBbmNob3IgPSB0aGlzLiRzY3JvbGxBbmNob3I7XG4gICAgICAgIHNjcm9sbEFuY2hvci5zdHlsZS5jc3NUZXh0ID0gXCJwb3NpdGlvbjphYnNvbHV0ZVwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5pbnNlcnRCZWZvcmUoc2Nyb2xsQW5jaG9yLCB0aGlzLmNvbnRhaW5lci5maXJzdENoaWxkKTtcbiAgICAgICAgdmFyIG9uQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5vbihcImNoYW5nZVNlbGVjdGlvblwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBuZWVkZWQgdG8gbm90IHRyaWdnZXIgc3luYyByZWZsb3dcbiAgICAgICAgdmFyIG9uQmVmb3JlUmVuZGVyID0gdGhpcy5yZW5kZXJlci5vbihcImJlZm9yZVJlbmRlclwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChzaG91bGRTY3JvbGwpXG4gICAgICAgICAgICAgICAgcmVjdCA9IHNlbGYucmVuZGVyZXIuY29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdmFyIG9uQWZ0ZXJSZW5kZXIgPSB0aGlzLnJlbmRlcmVyLm9uKFwiYWZ0ZXJSZW5kZXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsICYmIHJlY3QgJiYgc2VsZi5pc0ZvY3VzZWQoKSkge1xuICAgICAgICAgICAgICAgIHZhciByZW5kZXJlciA9IHNlbGYucmVuZGVyZXI7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IHJlbmRlcmVyLiRjdXJzb3JMYXllci4kcGl4ZWxQb3M7XG4gICAgICAgICAgICAgICAgdmFyIGNvbmZpZyA9IHJlbmRlcmVyLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgICAgIHZhciB0b3AgPSBwb3MudG9wIC0gY29uZmlnLm9mZnNldDtcbiAgICAgICAgICAgICAgICBpZiAocG9zLnRvcCA+PSAwICYmIHRvcCArIHJlY3QudG9wIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChwb3MudG9wIDwgY29uZmlnLmhlaWdodCAmJlxuICAgICAgICAgICAgICAgICAgICBwb3MudG9wICsgcmVjdC50b3AgKyBjb25maWcubGluZUhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCkge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzaG91bGRTY3JvbGwgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUudG9wID0gdG9wICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUubGVmdCA9IHBvcy5sZWZ0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLmxpbmVIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbEFuY2hvci5zY3JvbGxJbnRvVmlldyhzaG91bGRTY3JvbGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSByZWN0ID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3ID0gZnVuY3Rpb24oZW5hYmxlKSB7XG4gICAgICAgICAgICBpZiAoZW5hYmxlKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldztcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNlbGVjdGlvblwiLCBvbkNoYW5nZVNlbGVjdGlvbik7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhZnRlclJlbmRlclwiLCBvbkFmdGVyUmVuZGVyKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImJlZm9yZVJlbmRlclwiLCBvbkJlZm9yZVJlbmRlcik7XG4gICAgICAgIH07XG4gICAgfVxuXG5cbiAgICAkcmVzZXRDdXJzb3JTdHlsZSgpIHtcbiAgICAgICAgdmFyIHN0eWxlID0gdGhpcy4kY3Vyc29yU3R5bGUgfHwgXCJhY2VcIjtcbiAgICAgICAgdmFyIGN1cnNvckxheWVyID0gdGhpcy5yZW5kZXJlci4kY3Vyc29yTGF5ZXI7XG4gICAgICAgIGlmICghY3Vyc29yTGF5ZXIpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGN1cnNvckxheWVyLnNldFNtb290aEJsaW5raW5nKC9zbW9vdGgvLnRlc3Qoc3R5bGUpKTtcbiAgICAgICAgY3Vyc29yTGF5ZXIuaXNCbGlua2luZyA9ICF0aGlzLiRyZWFkT25seSAmJiBzdHlsZSAhPSBcIndpZGVcIjtcbiAgICAgICAgZG9tLnNldENzc0NsYXNzKGN1cnNvckxheWVyLmVsZW1lbnQsIFwiYWNlX3NsaW0tY3Vyc29yc1wiLCAvc2xpbS8udGVzdChzdHlsZSkpO1xuICAgIH1cbn1cblxuZXhwb3J0ID0gRWRpdG9yO1xuXG5jb25maWcuZGVmaW5lT3B0aW9ucyhFZGl0b3IucHJvdG90eXBlLCBcImVkaXRvclwiLCB7XG4gICAgc2VsZWN0aW9uU3R5bGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzdHlsZSkge1xuICAgICAgICAgICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSgpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uU3R5bGVcIiwgeyBkYXRhOiBzdHlsZSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImxpbmVcIlxuICAgIH0sXG4gICAgaGlnaGxpZ2h0QWN0aXZlTGluZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7IHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgcmVhZE9ubHk6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihyZWFkT25seSkge1xuICAgICAgICAgICAgLy8gZGlzYWJsZWQgdG8gbm90IGJyZWFrIHZpbSBtb2RlIVxuICAgICAgICAgICAgLy8gdGhpcy50ZXh0SW5wdXQuc2V0UmVhZE9ubHkocmVhZE9ubHkpO1xuICAgICAgICAgICAgdGhpcy4kcmVzZXRDdXJzb3JTdHlsZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBjdXJzb3JTdHlsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLiRyZXNldEN1cnNvclN0eWxlKCk7IH0sXG4gICAgICAgIHZhbHVlczogW1wiYWNlXCIsIFwic2xpbVwiLCBcInNtb290aFwiLCBcIndpZGVcIl0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCJhY2VcIlxuICAgIH0sXG4gICAgbWVyZ2VVbmRvRGVsdGFzOiB7XG4gICAgICAgIHZhbHVlczogW2ZhbHNlLCB0cnVlLCBcImFsd2F5c1wiXSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBiZWhhdmlvdXJzRW5hYmxlZDogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICB3cmFwQmVoYXZpb3Vyc0VuYWJsZWQ6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgYXV0b1Njcm9sbEVkaXRvckludG9WaWV3OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3KHZhbCkgfVxuICAgIH0sXG5cbiAgICBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTogXCJyZW5kZXJlclwiLFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBcInJlbmRlcmVyXCIsXG4gICAgaGlnaGxpZ2h0R3V0dGVyTGluZTogXCJyZW5kZXJlclwiLFxuICAgIGFuaW1hdGVkU2Nyb2xsOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ludmlzaWJsZXM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93UHJpbnRNYXJnaW46IFwicmVuZGVyZXJcIixcbiAgICBwcmludE1hcmdpbkNvbHVtbjogXCJyZW5kZXJlclwiLFxuICAgIHByaW50TWFyZ2luOiBcInJlbmRlcmVyXCIsXG4gICAgZmFkZUZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0xpbmVOdW1iZXJzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0d1dHRlcjogXCJyZW5kZXJlclwiLFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IFwicmVuZGVyZXJcIixcbiAgICBmb250U2l6ZTogXCJyZW5kZXJlclwiLFxuICAgIGZvbnRGYW1pbHk6IFwicmVuZGVyZXJcIixcbiAgICBtYXhMaW5lczogXCJyZW5kZXJlclwiLFxuICAgIG1pbkxpbmVzOiBcInJlbmRlcmVyXCIsXG4gICAgc2Nyb2xsUGFzdEVuZDogXCJyZW5kZXJlclwiLFxuICAgIGZpeGVkV2lkdGhHdXR0ZXI6IFwicmVuZGVyZXJcIixcbiAgICB0aGVtZTogXCJyZW5kZXJlclwiLFxuXG4gICAgc2Nyb2xsU3BlZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGRyYWdEZWxheTogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZHJhZ0VuYWJsZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGZvY3VzVGltb3V0OiBcIiRtb3VzZUhhbmRsZXJcIixcbiAgICB0b29sdGlwRm9sbG93c01vdXNlOiBcIiRtb3VzZUhhbmRsZXJcIixcblxuICAgIGZpcnN0TGluZU51bWJlcjogXCJzZXNzaW9uXCIsXG4gICAgb3ZlcndyaXRlOiBcInNlc3Npb25cIixcbiAgICBuZXdMaW5lTW9kZTogXCJzZXNzaW9uXCIsXG4gICAgdXNlV29ya2VyOiBcInNlc3Npb25cIixcbiAgICB1c2VTb2Z0VGFiczogXCJzZXNzaW9uXCIsXG4gICAgdGFiU2l6ZTogXCJzZXNzaW9uXCIsXG4gICAgd3JhcDogXCJzZXNzaW9uXCIsXG4gICAgZm9sZFN0eWxlOiBcInNlc3Npb25cIixcbiAgICBtb2RlOiBcInNlc3Npb25cIlxufSk7XG5cbmNsYXNzIEZvbGRIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBpbiB0aGUgZWRpdG9yIChub3QgZ3V0dGVyKSByZWdpb25cbiAgICAgICAgLy8gdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdG8gcmVtb3ZlIG9yIGV4cGFuZCBhIGZvbGQuXG4gICAgICAgIGVkaXRvci5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3Iuc2Vzc2lvbjtcblxuICAgICAgICAgICAgLy8gSWYgdGhlIHVzZXIgY2xpY2tlZCBvbiBhIGZvbGQsIHRoZW4gZXhwYW5kIGl0LlxuICAgICAgICAgICAgdmFyIGZvbGQgPSBzZXNzaW9uLmdldEZvbGRBdChwb3NpdGlvbi5yb3csIHBvc2l0aW9uLmNvbHVtbiwgMSk7XG4gICAgICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgICAgIGlmIChlLmdldEFjY2VsS2V5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbi5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBUaGUgZm9sbG93aW5nIGhhbmRsZXIgZGV0ZWN0cyBjbGlja3Mgb24gdGhlIGd1dHRlci5cbiAgICAgICAgZWRpdG9yLm9uKCdndXR0ZXJjbGljaycsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlckxheWVyLmdldFJlZ2lvbihlKTtcbiAgICAgICAgICAgIGlmIChndXR0ZXJSZWdpb24gPT09ICdmb2xkV2lkZ2V0cycpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm93ID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLnNlc3Npb247XG4gICAgICAgICAgICAgICAgaWYgKHNlc3Npb25bJ2ZvbGRXaWRnZXRzJ10gJiYgc2Vzc2lvblsnZm9sZFdpZGdldHMnXVtyb3ddKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5zZXNzaW9uWydvbkZvbGRXaWRnZXRDbGljayddKHJvdywgZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZWRpdG9yLm9uKCdndXR0ZXJkYmxjbGljaycsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlckxheWVyLmdldFJlZ2lvbihlKTtcblxuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PSAnZm9sZFdpZGdldHMnKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5zZXNzaW9uO1xuICAgICAgICAgICAgICAgIHZhciBkYXRhID0gc2Vzc2lvblsnZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YSddKHJvdywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gZGF0YS5yYW5nZSB8fCBkYXRhLmZpcnN0UmFuZ2U7XG5cbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZCA9IHNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgc2Vzc2lvbi5nZXRMaW5lKHJvdykubGVuZ3RoLCAxKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Vzc2lvblsnYWRkRm9sZCddKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVkaXRvci5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyh7IHJvdzogcmFuZ2Uuc3RhcnQucm93LCBjb2x1bW46IDAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZS5zdG9wKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuaW50ZXJmYWNlIElHZXN0dXJlSGFuZGxlciB7XG4gICAgY2FuY2VsQ29udGV4dE1lbnUoKTogdm9pZDtcbn1cblxuY2xhc3MgTW91c2VIYW5kbGVyIHtcbiAgICBwdWJsaWMgZWRpdG9yOiBFZGl0b3I7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsU3BlZWQ6IG51bWJlciA9IDI7XG4gICAgcHJpdmF0ZSAkZHJhZ0RlbGF5OiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgJGRyYWdFbmFibGVkOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwdWJsaWMgJGZvY3VzVGltb3V0OiBudW1iZXIgPSAwO1xuICAgIHB1YmxpYyAkdG9vbHRpcEZvbGxvd3NNb3VzZTogYm9vbGVhbiA9IHRydWU7XG4gICAgcHJpdmF0ZSBzdGF0ZTogc3RyaW5nO1xuICAgIHByaXZhdGUgY2xpZW50WDogbnVtYmVyO1xuICAgIHByaXZhdGUgY2xpZW50WTogbnVtYmVyO1xuICAgIHB1YmxpYyBpc01vdXNlUHJlc3NlZDogYm9vbGVhbjtcbiAgICAvKipcbiAgICAgKiBUaGUgZnVuY3Rpb24gdG8gY2FsbCB0byByZWxlYXNlIGEgY2FwdHVyZWQgbW91c2UuXG4gICAgICovXG4gICAgcHJpdmF0ZSByZWxlYXNlTW91c2U6IChldmVudDogTW91c2VFdmVudCkgPT4gdm9pZDtcbiAgICBwcml2YXRlIG1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgcHVibGljIG1vdXNlZG93bkV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50O1xuICAgIHByaXZhdGUgJG1vdXNlTW92ZWQ7XG4gICAgcHJpdmF0ZSAkb25DYXB0dXJlTW91c2VNb3ZlO1xuICAgIHB1YmxpYyAkY2xpY2tTZWxlY3Rpb246IHJuZy5SYW5nZSA9IG51bGw7XG4gICAgcHVibGljICRsYXN0U2Nyb2xsVGltZTogbnVtYmVyO1xuICAgIHB1YmxpYyBzZWxlY3RCeUxpbmVzOiAoKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBzZWxlY3RCeVdvcmRzOiAoKSA9PiB2b2lkO1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIC8vIEZJWE1FOiBEaWQgSSBtZW50aW9uIHRoYXQgYHRoaXNgLCBgbmV3YCwgYGNsYXNzYCwgYGJpbmRgIGFyZSB0aGUgNCBob3JzZW1lbj9cbiAgICAgICAgLy8gRklYTUU6IEZ1bmN0aW9uIFNjb3BpbmcgaXMgdGhlIGFuc3dlci5cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5lZGl0b3IgPSBlZGl0b3I7XG5cbiAgICAgICAgLy8gRklYTUU6IFdlIHNob3VsZCBiZSBjbGVhbmluZyB1cCB0aGVzZSBoYW5kbGVycyBpbiBhIGRpc3Bvc2UgbWV0aG9kLi4uXG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcignbW91c2Vkb3duJywgbWFrZU1vdXNlRG93bkhhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcignbW91c2V3aGVlbCcsIG1ha2VNb3VzZVdoZWVsSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwiZGJsY2xpY2tcIiwgbWFrZURvdWJsZUNsaWNrSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwidHJpcGxlY2xpY2tcIiwgbWFrZVRyaXBsZUNsaWNrSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwicXVhZGNsaWNrXCIsIG1ha2VRdWFkQ2xpY2tIYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0QnlMaW5lcyA9IG1ha2VFeHRlbmRTZWxlY3Rpb25CeShlZGl0b3IsIHRoaXMsIFwiZ2V0TGluZVJhbmdlXCIpO1xuICAgICAgICB0aGlzLnNlbGVjdEJ5V29yZHMgPSBtYWtlRXh0ZW5kU2VsZWN0aW9uQnkoZWRpdG9yLCB0aGlzLCBcImdldFdvcmRSYW5nZVwiKTtcblxuICAgICAgICBuZXcgR3V0dGVySGFuZGxlcih0aGlzKTtcbiAgICAgICAgLy8gICAgICBGSVhNRTogbmV3IERyYWdkcm9wSGFuZGxlcih0aGlzKTtcblxuICAgICAgICB2YXIgb25Nb3VzZURvd24gPSBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoIWVkaXRvci5pc0ZvY3VzZWQoKSAmJiBlZGl0b3IudGV4dElucHV0KSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnRleHRJbnB1dC5tb3ZlVG9Nb3VzZShlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVkaXRvci5mb2N1cygpXG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIG1vdXNlVGFyZ2V0OiBIVE1MRGl2RWxlbWVudCA9IGVkaXRvci5yZW5kZXJlci5nZXRNb3VzZUV2ZW50VGFyZ2V0KCk7XG4gICAgICAgIGV2ZW50LmFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcImNsaWNrXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJjbGlja1wiKSk7XG4gICAgICAgIGV2ZW50LmFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcIm1vdXNlbW92ZVwiLCB0aGlzLm9uTW91c2VNb3ZlLmJpbmQodGhpcywgXCJtb3VzZW1vdmVcIikpO1xuICAgICAgICBldmVudC5hZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyKG1vdXNlVGFyZ2V0LCBbNDAwLCAzMDAsIDI1MF0sIHRoaXMsIFwib25Nb3VzZUV2ZW50XCIpO1xuICAgICAgICBpZiAoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYpIHtcbiAgICAgICAgICAgIGV2ZW50LmFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYuaW5uZXIsIFs0MDAsIDMwMCwgMjUwXSwgdGhpcywgXCJvbk1vdXNlRXZlbnRcIik7XG4gICAgICAgICAgICBldmVudC5hZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJILmlubmVyLCBbNDAwLCAzMDAsIDI1MF0sIHRoaXMsIFwib25Nb3VzZUV2ZW50XCIpO1xuICAgICAgICAgICAgaWYgKHVzZXJBZ2VudC5pc0lFKSB7XG4gICAgICAgICAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYuZWxlbWVudCwgXCJtb3VzZWRvd25cIiwgb25Nb3VzZURvd24pO1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IEkgd29uZGVyIGlmIHdlIHNob3VsZCBiZSByZXNwb25kaW5nIHRvIG1vdXNlZG93biAoYnkgc3ltbWV0cnkpP1xuICAgICAgICAgICAgICAgIGV2ZW50LmFkZExpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJILmVsZW1lbnQsIFwibW91c2Vtb3ZlXCIsIG9uTW91c2VEb3duKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdlIGhvb2sgJ21vdXNld2hlZWwnIHVzaW5nIHRoZSBwb3J0YWJsZSBcbiAgICAgICAgZXZlbnQuYWRkTW91c2VXaGVlbExpc3RlbmVyKGVkaXRvci5jb250YWluZXIsIHRoaXMuZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudC5iaW5kKHRoaXMsIFwibW91c2V3aGVlbFwiKSk7XG5cbiAgICAgICAgdmFyIGd1dHRlckVsID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXI7XG4gICAgICAgIGV2ZW50LmFkZExpc3RlbmVyKGd1dHRlckVsLCBcIm1vdXNlZG93blwiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVybW91c2Vkb3duXCIpKTtcbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmNsaWNrXCIpKTtcbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiZGJsY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmRibGNsaWNrXCIpKTtcbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vtb3ZlXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJtb3VzZW1vdmVcIikpO1xuXG4gICAgICAgIGV2ZW50LmFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcIm1vdXNlZG93blwiLCBvbk1vdXNlRG93bik7XG5cbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vkb3duXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgcmV0dXJuIGV2ZW50LnByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBIYW5kbGUgYG1vdXNlbW92ZWAgd2hpbGUgdGhlIG1vdXNlIGlzIG92ZXIgdGhlIGVkaXRpbmcgYXJlYSAoYW5kIG5vdCB0aGUgZ3V0dGVyKS5cbiAgICAgICAgZWRpdG9yLm9uKCdtb3VzZW1vdmUnLCBmdW5jdGlvbihlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoX3NlbGYuc3RhdGUgfHwgX3NlbGYuJGRyYWdEZWxheSB8fCAhX3NlbGYuJGRyYWdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRklYTUU6IFByb2JhYmx5IHMvYiBjbGllbnRYWVxuICAgICAgICAgICAgdmFyIGNoYXIgPSBlZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoZS54LCBlLnkpO1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlc3Npb24uc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgcmVuZGVyZXIgPSBlZGl0b3IucmVuZGVyZXI7XG5cbiAgICAgICAgICAgIGlmICghcmFuZ2UuaXNFbXB0eSgpICYmIHJhbmdlLmluc2lkZVN0YXJ0KGNoYXIucm93LCBjaGFyLmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICByZW5kZXJlci5zZXRDdXJzb3JTdHlsZSgnZGVmYXVsdCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuc2V0Q3Vyc29yU3R5bGUoXCJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9uTW91c2VFdmVudChuYW1lOiBzdHJpbmcsIGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbmV3IEVkaXRvck1vdXNlRXZlbnQoZSwgdGhpcy5lZGl0b3IpKTtcbiAgICB9XG5cbiAgICBvbk1vdXNlTW92ZShuYW1lOiBzdHJpbmcsIGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgLy8gb3B0aW1pemF0aW9uLCBiZWNhdXNlIG1vdXNlbW92ZSBkb2Vzbid0IGhhdmUgYSBkZWZhdWx0IGhhbmRsZXIuXG4gICAgICAgIHZhciBsaXN0ZW5lcnMgPSB0aGlzLmVkaXRvci5fZXZlbnRSZWdpc3RyeSAmJiB0aGlzLmVkaXRvci5fZXZlbnRSZWdpc3RyeS5tb3VzZW1vdmU7XG4gICAgICAgIGlmICghbGlzdGVuZXJzIHx8ICFsaXN0ZW5lcnMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmVkaXRvci5fZW1pdChuYW1lLCBuZXcgRWRpdG9yTW91c2VFdmVudChlLCB0aGlzLmVkaXRvcikpO1xuICAgIH1cblxuICAgIGVtaXRFZGl0b3JNb3VzZVdoZWVsRXZlbnQobmFtZTogc3RyaW5nLCBlOiBNb3VzZVdoZWVsRXZlbnQpIHtcbiAgICAgICAgdmFyIG1vdXNlRXZlbnQgPSBuZXcgRWRpdG9yTW91c2VFdmVudChlLCB0aGlzLmVkaXRvcik7XG4gICAgICAgIG1vdXNlRXZlbnQuc3BlZWQgPSB0aGlzLiRzY3JvbGxTcGVlZCAqIDI7XG4gICAgICAgIG1vdXNlRXZlbnQud2hlZWxYID0gZVsnd2hlZWxYJ107XG4gICAgICAgIG1vdXNlRXZlbnQud2hlZWxZID0gZVsnd2hlZWxZJ107XG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG1vdXNlRXZlbnQpO1xuICAgIH1cblxuICAgIHNldFN0YXRlKHN0YXRlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICAgIH1cblxuICAgIHRleHRDb29yZGluYXRlcygpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICB9XG5cbiAgICBjYXB0dXJlTW91c2UoZXY6IEVkaXRvck1vdXNlRXZlbnQsIG1vdXNlTW92ZUhhbmRsZXI/OiAobW91c2VFdmVudDogTW91c2VFdmVudCkgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLmNsaWVudFggPSBldi5jbGllbnRYO1xuICAgICAgICB0aGlzLmNsaWVudFkgPSBldi5jbGllbnRZO1xuXG4gICAgICAgIHRoaXMuaXNNb3VzZVByZXNzZWQgPSB0cnVlO1xuXG4gICAgICAgIC8vIGRvIG5vdCBtb3ZlIHRleHRhcmVhIGR1cmluZyBzZWxlY3Rpb25cbiAgICAgICAgdmFyIHJlbmRlcmVyID0gdGhpcy5lZGl0b3IucmVuZGVyZXI7XG4gICAgICAgIGlmIChyZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IpIHtcbiAgICAgICAgICAgIHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb25Nb3VzZU1vdmUgPSAoZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24obW91c2VFdmVudDogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgICAgIGlmICghbW91c2VFdmVudCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIC8vIGlmIGVkaXRvciBpcyBsb2FkZWQgaW5zaWRlIGlmcmFtZSwgYW5kIG1vdXNldXAgZXZlbnQgaXMgb3V0c2lkZVxuICAgICAgICAgICAgICAgIC8vIHdlIHdvbid0IHJlY2lldmUgaXQsIHNvIHdlIGNhbmNlbCBvbiBmaXJzdCBtb3VzZW1vdmUgd2l0aG91dCBidXR0b25cbiAgICAgICAgICAgICAgICBpZiAodXNlckFnZW50LmlzV2ViS2l0ICYmICFtb3VzZUV2ZW50LndoaWNoICYmIG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogRm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IEknbSBwYXNzaW5nIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgLy8gYnV0IGl0IHdvdWxkIHByb2JhYmx5IG1ha2UgbW9yZSBzZW5zZSB0byBwYXNzIHRoZSBtb3VzZSBldmVudFxuICAgICAgICAgICAgICAgICAgICAvLyBzaW5jZSB0aGF0IGlzIHRoZSBmaW5hbCBldmVudC5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UodW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuY2xpZW50WCA9IG1vdXNlRXZlbnQuY2xpZW50WDtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuY2xpZW50WSA9IG1vdXNlRXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgICBtb3VzZU1vdmVIYW5kbGVyICYmIG1vdXNlTW92ZUhhbmRsZXIobW91c2VFdmVudCk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlRXZlbnQgPSBuZXcgRWRpdG9yTW91c2VFdmVudChtb3VzZUV2ZW50LCBlZGl0b3IpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbW91c2VNb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMuZWRpdG9yLCB0aGlzKTtcblxuICAgICAgICB2YXIgb25DYXB0dXJlRW5kID0gKGZ1bmN0aW9uKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXJJZCk7XG4gICAgICAgICAgICAgICAgb25DYXB0dXJlSW50ZXJ2YWwoKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlICsgXCJFbmRcIl0gJiYgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZSArIFwiRW5kXCJdKGUpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zdGF0ZSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlcmVyLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuaXNNb3VzZVByZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJG9uQ2FwdHVyZU1vdXNlTW92ZSA9IG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UgPSBudWxsO1xuICAgICAgICAgICAgICAgIGUgJiYgbW91c2VIYW5kbGVyLm9uTW91c2VFdmVudChcIm1vdXNldXBcIiwgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMpO1xuXG4gICAgICAgIHZhciBvbkNhcHR1cmVJbnRlcnZhbCA9IChmdW5jdGlvbihtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGVdICYmIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGVdKCk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRtb3VzZU1vdmVkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMpO1xuXG4gICAgICAgIGlmICh1c2VyQWdlbnQuaXNPbGRJRSAmJiBldi5kb21FdmVudC50eXBlID09IFwiZGJsY2xpY2tcIikge1xuICAgICAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IG9uQ2FwdHVyZUVuZChldik7IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kb25DYXB0dXJlTW91c2VNb3ZlID0gb25Nb3VzZU1vdmU7XG4gICAgICAgIHRoaXMucmVsZWFzZU1vdXNlID0gZXZlbnQuY2FwdHVyZSh0aGlzLmVkaXRvci5jb250YWluZXIsIG9uTW91c2VNb3ZlLCBvbkNhcHR1cmVFbmQpO1xuICAgICAgICB2YXIgdGltZXJJZCA9IHNldEludGVydmFsKG9uQ2FwdHVyZUludGVydmFsLCAyMCk7XG4gICAgfVxuXG4gICAgY2FuY2VsQ29udGV4dE1lbnUoKTogdm9pZCB7XG4gICAgICAgIHZhciBzdG9wID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKGUgJiYgZS5kb21FdmVudCAmJiBlLmRvbUV2ZW50LnR5cGUgIT0gXCJjb250ZXh0bWVudVwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwibmF0aXZlY29udGV4dG1lbnVcIiwgc3RvcCk7XG4gICAgICAgICAgICBpZiAoZSAmJiBlLmRvbUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgZXZlbnQuc3RvcEV2ZW50KGUuZG9tRXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmJpbmQodGhpcyk7XG4gICAgICAgIHNldFRpbWVvdXQoc3RvcCwgMTApO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcIm5hdGl2ZWNvbnRleHRtZW51XCIsIHN0b3ApO1xuICAgIH1cblxuICAgIHNlbGVjdCgpIHtcbiAgICAgICAgdmFyIGFuY2hvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcblxuICAgICAgICBpZiAodGhpcy4kY2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHZhciBjbXAgPSB0aGlzLiRjbGlja1NlbGVjdGlvbi5jb21wYXJlUG9pbnQoY3Vyc29yKTtcblxuICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLmVuZDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY21wID09IDEpIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSB0aGlzLiRjbGlja1NlbGVjdGlvbi5zdGFydDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGVkUmFuZ2UgPSBjYWxjUmFuZ2VPcmllbnRhdGlvbih0aGlzLiRjbGlja1NlbGVjdGlvbiwgY3Vyc29yKTtcbiAgICAgICAgICAgICAgICBjdXJzb3IgPSBvcmllbnRlZFJhbmdlLmN1cnNvcjtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBvcmllbnRlZFJhbmdlLmFuY2hvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24oY3Vyc29yKTtcblxuICAgICAgICB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgIH1cblxuICAgIHNlbGVjdEJ5TGluZXNFbmQoKSB7XG4gICAgICAgIHRoaXMuJGNsaWNrU2VsZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3IudW5zZXRTdHlsZShcImFjZV9zZWxlY3RpbmdcIik7XG4gICAgICAgIGlmICh0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5yZWxlYXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgdGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsZXIucmVsZWFzZUNhcHR1cmUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0U2VsZWN0KHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgd2FpdEZvckNsaWNrU2VsZWN0aW9uPzogYm9vbGVhbikge1xuICAgICAgICBwb3MgPSBwb3MgfHwgdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB2YXIgZWRpdG9yID0gdGhpcy5lZGl0b3I7XG4gICAgICAgIC8vIGFsbG93IGRvdWJsZS90cmlwbGUgY2xpY2sgaGFuZGxlcnMgdG8gY2hhbmdlIHNlbGVjdGlvblxuICAgIFxuICAgICAgICBpZiAodGhpcy5tb3VzZWRvd25FdmVudC5nZXRTaGlmdEtleSgpKSB7XG4gICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghd2FpdEZvckNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLm1vdmVUb1Bvc2l0aW9uKHBvcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXdhaXRGb3JDbGlja1NlbGVjdGlvbikge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3QoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5zZXRDYXB0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5zZXRDYXB0dXJlKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWRpdG9yLnNldFN0eWxlKFwiYWNlX3NlbGVjdGluZ1wiKTtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZShcInNlbGVjdFwiKTtcbiAgICB9XG5cbiAgICBzZWxlY3RFbmQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0QnlMaW5lc0VuZCgpO1xuICAgIH1cblxuICAgIHNlbGVjdEFsbEVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QnlXb3Jkc0VuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgZm9jdXNXYWl0KCkge1xuICAgICAgICB2YXIgZGlzdGFuY2UgPSBjYWxjRGlzdGFuY2UodGhpcy5tb3VzZWRvd25FdmVudC5jbGllbnRYLCB0aGlzLm1vdXNlZG93bkV2ZW50LmNsaWVudFksIHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICAgICAgdmFyIHRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgIGlmIChkaXN0YW5jZSA+IERSQUdfT0ZGU0VUIHx8IHRpbWUgLSB0aGlzLm1vdXNlZG93bkV2ZW50LnRpbWUgPiB0aGlzLiRmb2N1c1RpbW91dCkge1xuICAgICAgICAgICAgdGhpcy5zdGFydFNlbGVjdCh0aGlzLm1vdXNlZG93bkV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbn1cblxuY29uZmlnLmRlZmluZU9wdGlvbnMoTW91c2VIYW5kbGVyLnByb3RvdHlwZSwgXCJtb3VzZUhhbmRsZXJcIiwge1xuICAgIHNjcm9sbFNwZWVkOiB7IGluaXRpYWxWYWx1ZTogMiB9LFxuICAgIGRyYWdEZWxheTogeyBpbml0aWFsVmFsdWU6ICh1c2VyQWdlbnQuaXNNYWMgPyAxNTAgOiAwKSB9LFxuICAgIGRyYWdFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIGZvY3VzVGltb3V0OiB7IGluaXRpYWxWYWx1ZTogMCB9LFxuICAgIHRvb2x0aXBGb2xsb3dzTW91c2U6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH1cbn0pO1xuXG4vKlxuICogQ3VzdG9tIEFjZSBtb3VzZSBldmVudFxuICovXG5jbGFzcyBFZGl0b3JNb3VzZUV2ZW50IHtcbiAgICAvLyBXZSBrZWVwIHRoZSBvcmlnaW5hbCBET00gZXZlbnRcbiAgICBwdWJsaWMgZG9tRXZlbnQ6IE1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSBlZGl0b3I6IEVkaXRvcjtcbiAgICBwdWJsaWMgY2xpZW50WDogbnVtYmVyO1xuICAgIHB1YmxpYyBjbGllbnRZOiBudW1iZXI7XG4gICAgLyoqXG4gICAgICogQ2FjaGVkIHRleHQgY29vcmRpbmF0ZXMgZm9sbG93aW5nIGdldERvY3VtZW50UG9zaXRpb24oKVxuICAgICAqL1xuICAgIHByaXZhdGUgJHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICBwcml2YXRlICRpblNlbGVjdGlvbjtcbiAgICBwcml2YXRlIHByb3BhZ2F0aW9uU3RvcHBlZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGVmYXVsdFByZXZlbnRlZCA9IGZhbHNlO1xuICAgIHB1YmxpYyB0aW1lOiBudW1iZXI7XG4gICAgLy8gd2hlZWxZLCB3aGVlbFkgYW5kIHNwZWVkIGFyZSBmb3IgJ21vdXNld2hlZWwnIGV2ZW50cy5cbiAgICBwdWJsaWMgd2hlZWxYOiBudW1iZXI7XG4gICAgcHVibGljIHdoZWVsWTogbnVtYmVyO1xuICAgIHB1YmxpYyBzcGVlZDogbnVtYmVyO1xuICAgIGNvbnN0cnVjdG9yKGRvbUV2ZW50OiBNb3VzZUV2ZW50LCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB0aGlzLmRvbUV2ZW50ID0gZG9tRXZlbnQ7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGRvbUV2ZW50LmNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGRvbUV2ZW50LmNsaWVudFk7XG5cbiAgICAgICAgdGhpcy4kcG9zID0gbnVsbDtcbiAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBudWxsO1xuICAgIH1cblxuICAgIGdldCB0b0VsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvbUV2ZW50LnRvRWxlbWVudDtcbiAgICB9XG5cbiAgICBzdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgICAgIGV2ZW50LnN0b3BQcm9wYWdhdGlvbih0aGlzLmRvbUV2ZW50KTtcbiAgICAgICAgdGhpcy5wcm9wYWdhdGlvblN0b3BwZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIHByZXZlbnREZWZhdWx0KCkge1xuICAgICAgICBldmVudC5wcmV2ZW50RGVmYXVsdCh0aGlzLmRvbUV2ZW50KTtcbiAgICAgICAgdGhpcy5kZWZhdWx0UHJldmVudGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBzdG9wKCkge1xuICAgICAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICB0aGlzLnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBHZXQgdGhlIGRvY3VtZW50IHBvc2l0aW9uIGJlbG93IHRoZSBtb3VzZSBjdXJzb3JcbiAgICAgKiBcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9ICdyb3cnIGFuZCAnY29sdW1uJyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb25cbiAgICAgKi9cbiAgICBnZXREb2N1bWVudFBvc2l0aW9uKCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICBpZiAoIXRoaXMuJHBvcykge1xuICAgICAgICAgICAgdGhpcy4kcG9zID0gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLiRwb3M7XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogQ2hlY2sgaWYgdGhlIG1vdXNlIGN1cnNvciBpcyBpbnNpZGUgb2YgdGhlIHRleHQgc2VsZWN0aW9uXG4gICAgICogXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gd2hldGhlciB0aGUgbW91c2UgY3Vyc29yIGlzIGluc2lkZSBvZiB0aGUgc2VsZWN0aW9uXG4gICAgICovXG4gICAgaW5TZWxlY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLiRpblNlbGVjdGlvbiAhPT0gbnVsbClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRpblNlbGVjdGlvbjtcblxuICAgICAgICB2YXIgZWRpdG9yID0gdGhpcy5lZGl0b3I7XG5cblxuICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHNlbGVjdGlvblJhbmdlLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gZmFsc2U7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBzZWxlY3Rpb25SYW5nZS5jb250YWlucyhwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLiRpblNlbGVjdGlvbjtcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBHZXQgdGhlIGNsaWNrZWQgbW91c2UgYnV0dG9uXG4gICAgICogXG4gICAgICogQHJldHVybiB7TnVtYmVyfSAwIGZvciBsZWZ0IGJ1dHRvbiwgMSBmb3IgbWlkZGxlIGJ1dHRvbiwgMiBmb3IgcmlnaHQgYnV0dG9uXG4gICAgICovXG4gICAgZ2V0QnV0dG9uKCkge1xuICAgICAgICByZXR1cm4gZXZlbnQuZ2V0QnV0dG9uKHRoaXMuZG9tRXZlbnQpO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhlIHNoaWZ0IGtleSB3YXMgcHJlc3NlZCB3aGVuIHRoZSBldmVudCB3YXMgZW1pdHRlZFxuICAgICAqL1xuICAgIGdldFNoaWZ0S2V5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb21FdmVudC5zaGlmdEtleTtcbiAgICB9XG5cbiAgICBnZXRBY2NlbEtleSA9IHVzZXJBZ2VudC5pc01hYyA/IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kb21FdmVudC5tZXRhS2V5OyB9IDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvbUV2ZW50LmN0cmxLZXk7IH07XG59XG5cbnZhciBEUkFHX09GRlNFVCA9IDA7IC8vIHBpeGVsc1xuXG5mdW5jdGlvbiBtYWtlTW91c2VEb3duSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZXY6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgdmFyIGluU2VsZWN0aW9uID0gZXYuaW5TZWxlY3Rpb24oKTtcbiAgICAgICAgdmFyIHBvcyA9IGV2LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlZG93bkV2ZW50ID0gZXY7XG5cbiAgICAgICAgdmFyIGJ1dHRvbiA9IGV2LmdldEJ1dHRvbigpO1xuICAgICAgICBpZiAoYnV0dG9uICE9PSAwKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbXB0eSA9IHNlbGVjdGlvblJhbmdlLmlzRW1wdHkoKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGlvbkVtcHR5KVxuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcblxuICAgICAgICAgICAgLy8gMjogY29udGV4dG1lbnUsIDE6IGxpbnV4IHBhc3RlXG4gICAgICAgICAgICBlZGl0b3IudGV4dElucHV0Lm9uQ29udGV4dE1lbnUoZXYuZG9tRXZlbnQpO1xuICAgICAgICAgICAgcmV0dXJuOyAvLyBzdG9wcGluZyBldmVudCBoZXJlIGJyZWFrcyBjb250ZXh0bWVudSBvbiBmZiBtYWNcbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5tb3VzZWRvd25FdmVudC50aW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gaWYgdGhpcyBjbGljayBjYXVzZWQgdGhlIGVkaXRvciB0byBiZSBmb2N1c2VkIHNob3VsZCBub3QgY2xlYXIgdGhlXG4gICAgICAgIC8vIHNlbGVjdGlvblxuICAgICAgICBpZiAoaW5TZWxlY3Rpb24gJiYgIWVkaXRvci5pc0ZvY3VzZWQoKSkge1xuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICBpZiAobW91c2VIYW5kbGVyLiRmb2N1c1RpbW91dCAmJiAhbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiAmJiAhZWRpdG9yLmluTXVsdGlTZWxlY3RNb2RlKSB7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwiZm9jdXNXYWl0XCIpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZXYpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZXYpO1xuICAgICAgICAvLyBUT0RPOiBfY2xpY2tzIGlzIGEgY3VzdG9tIHByb3BlcnR5IGFkZGVkIGluIGV2ZW50LnRzIGJ5IHRoZSAnbW91c2Vkb3duJyBsaXN0ZW5lci5cbiAgICAgICAgbW91c2VIYW5kbGVyLnN0YXJ0U2VsZWN0KHBvcywgZXYuZG9tRXZlbnRbJ19jbGlja3MnXSA+IDEpO1xuICAgICAgICByZXR1cm4gZXYucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VNb3VzZVdoZWVsSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZXY6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgaWYgKGV2LmdldEFjY2VsS2V5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vc2hpZnQgd2hlZWwgdG8gaG9yaXogc2Nyb2xsXG4gICAgICAgIGlmIChldi5nZXRTaGlmdEtleSgpICYmIGV2LndoZWVsWSAmJiAhZXYud2hlZWxYKSB7XG4gICAgICAgICAgICBldi53aGVlbFggPSBldi53aGVlbFk7XG4gICAgICAgICAgICBldi53aGVlbFkgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHQgPSBldi5kb21FdmVudC50aW1lU3RhbXA7XG4gICAgICAgIHZhciBkdCA9IHQgLSAobW91c2VIYW5kbGVyLiRsYXN0U2Nyb2xsVGltZSB8fCAwKTtcblxuICAgICAgICB2YXIgaXNTY3JvbGFibGUgPSBlZGl0b3IucmVuZGVyZXIuaXNTY3JvbGxhYmxlQnkoZXYud2hlZWxYICogZXYuc3BlZWQsIGV2LndoZWVsWSAqIGV2LnNwZWVkKTtcbiAgICAgICAgaWYgKGlzU2Nyb2xhYmxlIHx8IGR0IDwgMjAwKSB7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGxhc3RTY3JvbGxUaW1lID0gdDtcbiAgICAgICAgICAgIGVkaXRvci5yZW5kZXJlci5zY3JvbGxCeShldi53aGVlbFggKiBldi5zcGVlZCwgZXYud2hlZWxZICogZXYuc3BlZWQpO1xuICAgICAgICAgICAgcmV0dXJuIGV2LnN0b3AoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZURvdWJsZUNsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgcG9zID0gZWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLnNlc3Npb247XG5cbiAgICAgICAgdmFyIHJhbmdlID0gc2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UocG9zKTtcbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbisrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0XCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UgPSBlZGl0b3Iuc2VsZWN0aW9uLmdldFdvcmRSYW5nZShwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEJ5V29yZHNcIik7XG4gICAgICAgIH1cbiAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IHJhbmdlO1xuICAgICAgICBtb3VzZUhhbmRsZXIuc2VsZWN0KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlVHJpcGxlQ2xpY2tIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihlZGl0b3JNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgIHZhciBwb3MgPSBlZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcblxuICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RCeUxpbmVzXCIpO1xuICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHJhbmdlLmlzTXVsdGlMaW5lKCkgJiYgcmFuZ2UuY29udGFpbnMocG9zLnJvdywgcG9zLmNvbHVtbikpIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyYW5nZS5zdGFydC5yb3cpO1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5lbmQgPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyYW5nZS5lbmQucm93KS5lbmQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRMaW5lUmFuZ2UocG9zLnJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgbW91c2VIYW5kbGVyLnNlbGVjdCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZVF1YWRDbGlja0hhbmRsZXIoZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVkaXRvck1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgZWRpdG9yLnNlbGVjdEFsbCgpO1xuICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEFsbFwiKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VFeHRlbmRTZWxlY3Rpb25CeShlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIsIHVuaXROYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhbmNob3I7XG4gICAgICAgIHZhciBjdXJzb3IgPSBtb3VzZUhhbmRsZXIudGV4dENvb3JkaW5hdGVzKCk7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5zZWxlY3Rpb25bdW5pdE5hbWVdKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pO1xuXG4gICAgICAgIGlmIChtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB2YXIgY21wU3RhcnQgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChyYW5nZS5zdGFydCk7XG4gICAgICAgICAgICB2YXIgY21wRW5kID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5jb21wYXJlUG9pbnQocmFuZ2UuZW5kKTtcblxuICAgICAgICAgICAgaWYgKGNtcFN0YXJ0ID09IC0xICYmIGNtcEVuZCA8PSAwKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5lbmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmVuZC5yb3cgIT0gY3Vyc29yLnJvdyB8fCByYW5nZS5lbmQuY29sdW1uICE9IGN1cnNvci5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGN1cnNvciA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wRW5kID09IDEgJiYgY21wU3RhcnQgPj0gMCkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyAhPSBjdXJzb3Iucm93IHx8IHJhbmdlLnN0YXJ0LmNvbHVtbiAhPSBjdXJzb3IuY29sdW1uKVxuICAgICAgICAgICAgICAgICAgICBjdXJzb3IgPSByYW5nZS5lbmQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXBTdGFydCA9PSAtMSAmJiBjbXBFbmQgPT0gMSkge1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IHJhbmdlLmVuZDtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBvcmllbnRlZFJhbmdlID0gY2FsY1JhbmdlT3JpZW50YXRpb24obW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiwgY3Vyc29yKTtcbiAgICAgICAgICAgICAgICBjdXJzb3IgPSBvcmllbnRlZFJhbmdlLmN1cnNvcjtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBvcmllbnRlZFJhbmdlLmFuY2hvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIGVkaXRvci5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY2FsY0Rpc3RhbmNlKGF4OiBudW1iZXIsIGF5OiBudW1iZXIsIGJ4OiBudW1iZXIsIGJ5OiBudW1iZXIpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KE1hdGgucG93KGJ4IC0gYXgsIDIpICsgTWF0aC5wb3coYnkgLSBheSwgMikpO1xufVxuXG5mdW5jdGlvbiBjYWxjUmFuZ2VPcmllbnRhdGlvbihyYW5nZTogcm5nLlJhbmdlLCBjdXJzb3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0pOiB7IGN1cnNvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTsgYW5jaG9yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IH0ge1xuICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICB2YXIgY21wID0gMiAqIGN1cnNvci5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW4gLSByYW5nZS5lbmQuY29sdW1uO1xuICAgIH1cbiAgICBlbHNlIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdyAtIDEgJiYgIXJhbmdlLnN0YXJ0LmNvbHVtbiAmJiAhcmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICB2YXIgY21wID0gY3Vyc29yLmNvbHVtbiAtIDQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIgY21wID0gMiAqIGN1cnNvci5yb3cgLSByYW5nZS5zdGFydC5yb3cgLSByYW5nZS5lbmQucm93O1xuICAgIH1cblxuICAgIGlmIChjbXAgPCAwKSB7XG4gICAgICAgIHJldHVybiB7IGN1cnNvcjogcmFuZ2Uuc3RhcnQsIGFuY2hvcjogcmFuZ2UuZW5kIH07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4geyBjdXJzb3I6IHJhbmdlLmVuZCwgYW5jaG9yOiByYW5nZS5zdGFydCB9O1xuICAgIH1cbn1cblxuY2xhc3MgR3V0dGVySGFuZGxlciB7XG4gICAgY29uc3RydWN0b3IobW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgdmFyIGVkaXRvcjogRWRpdG9yID0gbW91c2VIYW5kbGVyLmVkaXRvcjtcbiAgICAgICAgdmFyIGd1dHRlcjogZ3VtLkd1dHRlciA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXI7XG4gICAgICAgIHZhciB0b29sdGlwID0gbmV3IEd1dHRlclRvb2x0aXAoZWRpdG9yLmNvbnRhaW5lcik7XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlZG93blwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoIWVkaXRvci5pc0ZvY3VzZWQoKSB8fCBlLmdldEJ1dHRvbigpICE9IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBndXR0ZXIuZ2V0UmVnaW9uKGUpO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyUmVnaW9uID09PSBcImZvbGRXaWRnZXRzXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uID0gZWRpdG9yLnNlc3Npb24uc2VsZWN0aW9uO1xuXG4gICAgICAgICAgICBpZiAoZS5nZXRTaGlmdEtleSgpKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uLnNlbGVjdFRvKHJvdywgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoZS5kb21FdmVudC5kZXRhaWwgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlMaW5lc1wiKTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZSk7XG4gICAgICAgICAgICByZXR1cm4gZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9KTtcblxuXG4gICAgICAgIHZhciB0b29sdGlwVGltZW91dDogbnVtYmVyO1xuICAgICAgICB2YXIgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICAgICAgdmFyIHRvb2x0aXBBbm5vdGF0aW9uO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNob3dUb29sdGlwKCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IG1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBhbm5vdGF0aW9uID0gZ3V0dGVyLiRhbm5vdGF0aW9uc1tyb3ddO1xuICAgICAgICAgICAgaWYgKCFhbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXhSb3cgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPT0gbWF4Um93KSB7XG4gICAgICAgICAgICAgICAgdmFyIHNjcmVlblJvdyA9IGVkaXRvci5yZW5kZXJlci5waXhlbFRvU2NyZWVuQ29vcmRpbmF0ZXMoMCwgbW91c2VFdmVudC5jbGllbnRZKS5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IG1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChzY3JlZW5Sb3cgPiBlZGl0b3Iuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KHBvcy5yb3csIHBvcy5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoaWRlVG9vbHRpcCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uID09IGFubm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0b29sdGlwQW5ub3RhdGlvbiA9IGFubm90YXRpb24udGV4dC5qb2luKFwiPGJyLz5cIik7XG5cbiAgICAgICAgICAgIHRvb2x0aXAuc2V0SHRtbCh0b29sdGlwQW5ub3RhdGlvbik7XG5cbiAgICAgICAgICAgIHRvb2x0aXAuc2hvdygpO1xuXG4gICAgICAgICAgICBlZGl0b3Iub24oXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcblxuICAgICAgICAgICAgaWYgKG1vdXNlSGFuZGxlci4kdG9vbHRpcEZvbGxvd3NNb3VzZSkge1xuICAgICAgICAgICAgICAgIG1vdmVUb29sdGlwKG1vdXNlRXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGd1dHRlckVsZW1lbnQgPSBndXR0ZXIuJGNlbGxzW2VkaXRvci5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3cocm93LCAwKV0uZWxlbWVudDtcbiAgICAgICAgICAgICAgICB2YXIgcmVjdCA9IGd1dHRlckVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICAgICAgdmFyIHN0eWxlID0gdG9vbHRpcC5nZXRFbGVtZW50KCkuc3R5bGU7XG4gICAgICAgICAgICAgICAgc3R5bGUubGVmdCA9IHJlY3QucmlnaHQgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgc3R5bGUudG9wID0gcmVjdC5ib3R0b20gKyBcInB4XCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBoaWRlVG9vbHRpcCgpIHtcbiAgICAgICAgICAgIGlmICh0b29sdGlwVGltZW91dCkge1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0b29sdGlwVGltZW91dCk7XG4gICAgICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodG9vbHRpcEFubm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICB0b29sdGlwLmhpZGUoKTtcbiAgICAgICAgICAgICAgICB0b29sdGlwQW5ub3RhdGlvbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG1vdmVUb29sdGlwKGV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICB0b29sdGlwLnNldFBvc2l0aW9uKGV2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlbW92ZVwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogT2JmdXNjYXRpbmcgdGhlIHR5cGUgb2YgdGFyZ2V0IHRvIHRod2FydCBjb21waWxlci5cbiAgICAgICAgICAgIHZhciB0YXJnZXQ6IGFueSA9IGUuZG9tRXZlbnQudGFyZ2V0IHx8IGUuZG9tRXZlbnQuc3JjRWxlbWVudDtcbiAgICAgICAgICAgIGlmIChkb20uaGFzQ3NzQ2xhc3ModGFyZ2V0LCBcImFjZV9mb2xkLXdpZGdldFwiKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBoaWRlVG9vbHRpcCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodG9vbHRpcEFubm90YXRpb24gJiYgbW91c2VIYW5kbGVyLiR0b29sdGlwRm9sbG93c01vdXNlKSB7XG4gICAgICAgICAgICAgICAgbW92ZVRvb2x0aXAoZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG1vdXNlRXZlbnQgPSBlO1xuICAgICAgICAgICAgaWYgKHRvb2x0aXBUaW1lb3V0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICBpZiAobW91c2VFdmVudCAmJiAhbW91c2VIYW5kbGVyLmlzTW91c2VQcmVzc2VkKVxuICAgICAgICAgICAgICAgICAgICBzaG93VG9vbHRpcCgpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgaGlkZVRvb2x0aXAoKTtcbiAgICAgICAgICAgIH0sIDUwKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXIsIFwibW91c2VvdXRcIiwgZnVuY3Rpb24oZTogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgbW91c2VFdmVudCA9IG51bGw7XG4gICAgICAgICAgICBpZiAoIXRvb2x0aXBBbm5vdGF0aW9uIHx8IHRvb2x0aXBUaW1lb3V0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICBoaWRlVG9vbHRpcCgpO1xuICAgICAgICAgICAgfSwgNTApO1xuICAgICAgICB9KTtcblxuICAgICAgICBlZGl0b3Iub24oXCJjaGFuZ2VTZXNzaW9uXCIsIGhpZGVUb29sdGlwKTtcbiAgICB9XG59XG5cbi8qKlxuICogQGNsYXNzIEd1dHRlclRvb2x0aXBcbiAqIEBleHRlbmRzIFRvb2x0aXBcbiAqL1xuY2xhc3MgR3V0dGVyVG9vbHRpcCBleHRlbmRzIHR0bS5Ub29sdGlwIHtcbiAgICBjb25zdHJ1Y3RvcihwYXJlbnROb2RlOiBIVE1MRWxlbWVudCkge1xuICAgICAgICBzdXBlcihwYXJlbnROb2RlKTtcbiAgICB9XG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXRQb3NpdGlvblxuICAgICAqIEBwYXJhbSB4IHtudW1iZXJ9XG4gICAgICogQHBhcmFtIHkge251bWJlcn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFBvc2l0aW9uKHg6IG51bWJlciwgeTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHZhciB3aW5kb3dXaWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoIHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRXaWR0aDtcbiAgICAgICAgdmFyIHdpbmRvd0hlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0O1xuICAgICAgICB2YXIgd2lkdGggPSB0aGlzLmdldFdpZHRoKCk7XG4gICAgICAgIHZhciBoZWlnaHQgPSB0aGlzLmdldEhlaWdodCgpO1xuICAgICAgICB4ICs9IDE1O1xuICAgICAgICB5ICs9IDE1O1xuICAgICAgICBpZiAoeCArIHdpZHRoID4gd2luZG93V2lkdGgpIHtcbiAgICAgICAgICAgIHggLT0gKHggKyB3aWR0aCkgLSB3aW5kb3dXaWR0aDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoeSArIGhlaWdodCA+IHdpbmRvd0hlaWdodCkge1xuICAgICAgICAgICAgeSAtPSAyMCArIGhlaWdodDtcbiAgICAgICAgfVxuICAgICAgICBzdXBlci5zZXRQb3NpdGlvbih4LCB5KTtcbiAgICB9XG59XG4iXX0=