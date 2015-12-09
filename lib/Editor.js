import { mixin } from "./lib/oop";
import { computedStyle, hasCssClass, setCssClass } from "./lib/dom";
import { delayedCall, stringRepeat } from "./lib/lang";
import { isIE, isMac, isMobile, isOldIE, isWebKit } from "./lib/useragent";
import KeyBinding from "./keyboard/KeyBinding";
import TextInput from "./keyboard/TextInput";
import Search from "./Search";
import Range from "./Range";
import EventEmitterClass from "./lib/event_emitter";
import CommandManager from "./commands/CommandManager";
import defaultCommands from "./commands/default_commands";
import { defineOptions, loadModule, resetOptions, _signal } from "./config";
import TokenIterator from "./TokenIterator";
import { COMMAND_NAME_AUTO_COMPLETE } from './editor_protocol';
import { addListener, addMouseWheelListener, addMultiMouseDownListener, capture, getButton, preventDefault, stopEvent, stopPropagation } from "./lib/event";
import { touchManager } from './touch/touch';
import Tooltip from "./Tooltip";
export default class Editor extends EventEmitterClass {
    constructor(renderer, session) {
        super();
        this.curOp = null;
        this.prevOp = {};
        this.$mergeableCommands = ["backspace", "del", "insertstring"];
        this.commands = new CommandManager(isMac ? "mac" : "win", defaultCommands);
        this.container = renderer.getContainerElement();
        this.renderer = renderer;
        this.textInput = new TextInput(renderer.getTextAreaContainer(), this);
        this.renderer.textarea = this.textInput.getElement();
        this.keyBinding = new KeyBinding(this);
        if (isMobile) {
            this.$touchHandler = touchManager(this);
            this.$mouseHandler = new MouseHandler(this);
        }
        else {
            this.$touchHandler = touchManager(this);
            this.$mouseHandler = new MouseHandler(this);
        }
        new FoldHandler(this);
        this.$blockScrolling = 0;
        this.$search = new Search().set({ wrap: true });
        this.$historyTracker = this.$historyTracker.bind(this);
        this.commands.on("exec", this.$historyTracker);
        this.$initOperationListeners();
        this._$emitInputEvent = delayedCall(function () {
            this._signal("input", {});
            this.session.bgTokenizer && this.session.bgTokenizer.scheduleStart();
        }.bind(this));
        var self = this;
        this.on("change", function () {
            self._$emitInputEvent.schedule(31);
        });
        this.setSession(session);
        resetOptions(this);
        _signal("editor", this);
    }
    cancelMouseContextMenu() {
        this.$mouseHandler.cancelContextMenu();
    }
    get selection() {
        return this.session.getSelection();
    }
    set selection(selection) {
        this.session.setSelection(selection);
    }
    $initOperationListeners() {
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
        this.$opResetTimer = delayedCall(this.endOperation.bind(this));
        this.on("change", function () {
            this.curOp || this.startOperation();
            this.curOp.docChanged = true;
        }.bind(this), true);
        this.on("changeSelection", function () {
            this.curOp || this.startOperation();
            this.curOp.selectionChanged = true;
        }.bind(this), true);
    }
    startOperation(commadEvent) {
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
    }
    endOperation() {
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
    }
    $historyTracker(e) {
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
    }
    setKeyboardHandler(keyboardHandler) {
        if (!keyboardHandler) {
            this.keyBinding.setKeyboardHandler(null);
        }
        else if (typeof keyboardHandler === "string") {
            this.$keybindingId = keyboardHandler;
            var _self = this;
            loadModule(["keybinding", keyboardHandler], function (module) {
                if (_self.$keybindingId == keyboardHandler)
                    _self.keyBinding.setKeyboardHandler(module && module.handler);
            }, this.container.ownerDocument);
        }
        else {
            this.$keybindingId = null;
            this.keyBinding.setKeyboardHandler(keyboardHandler);
        }
    }
    getKeyboardHandler() {
        return this.keyBinding.getKeyboardHandler();
    }
    setSession(session) {
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
    }
    getSession() {
        return this.session;
    }
    setValue(val, cursorPos) {
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
    }
    getValue() {
        return this.session.getValue();
    }
    getSelection() {
        return this.selection;
    }
    resize(force) {
        this.renderer.onResize(force);
    }
    setTheme(theme, cb) {
        this.renderer.setTheme(theme, cb);
    }
    getTheme() {
        return this.renderer.getTheme();
    }
    setStyle(style) {
        this.renderer.setStyle(style);
    }
    unsetStyle(style) {
        this.renderer.unsetStyle(style);
    }
    getFontSize() {
        return this.getOption("fontSize") || computedStyle(this.container, "fontSize");
    }
    setFontSize(fontSize) {
        this.setOption("fontSize", fontSize);
    }
    $highlightBrackets() {
        if (this.session.$bracketHighlight) {
            this.session.removeMarker(this.session.$bracketHighlight);
            this.session.$bracketHighlight = void 0;
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
                var range = new Range(pos.row, pos.column, pos.row, pos.column + 1);
            }
            else if (self.session.$mode.getMatching) {
                var range = self.session.$mode.getMatching(self.session);
            }
            if (range)
                self.session.$bracketHighlight = self.session.addMarker(range, "ace_bracket", "text");
        }, 50);
    }
    $highlightTags() {
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
            var range = new Range(row, column, row, column + token.value.length);
            if (session.$tagHighlight && range.compareRange(session.$backMarkers[session.$tagHighlight].range) !== 0) {
                session.removeMarker(session.$tagHighlight);
                session.$tagHighlight = null;
            }
            if (range && !session.$tagHighlight)
                session.$tagHighlight = session.addMarker(range, "ace_bracket", "text");
        }, 50);
    }
    focus() {
        var _self = this;
        setTimeout(function () {
            _self.textInput.focus();
        });
        this.textInput.focus();
    }
    isFocused() {
        return this.textInput.isFocused();
    }
    blur() {
        this.textInput.blur();
    }
    onFocus() {
        if (this.$isFocused) {
            return;
        }
        this.$isFocused = true;
        this.renderer.showCursor();
        this.renderer.visualizeFocus();
        this._emit("focus");
    }
    onBlur() {
        if (!this.$isFocused) {
            return;
        }
        this.$isFocused = false;
        this.renderer.hideCursor();
        this.renderer.visualizeBlur();
        this._emit("blur");
    }
    $cursorChange() {
        this.renderer.updateCursor();
    }
    onDocumentChange(e, editSession) {
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
    }
    onTokenizerUpdate(event, editSession) {
        var rows = event.data;
        this.renderer.updateLines(rows.first, rows.last);
    }
    onScrollTopChange(event, editSession) {
        this.renderer.scrollToY(this.session.getScrollTop());
    }
    onScrollLeftChange(event, editSession) {
        this.renderer.scrollToX(this.session.getScrollLeft());
    }
    onCursorChange(event, editSession) {
        this.$cursorChange();
        if (!this.$blockScrolling) {
            this.renderer.scrollCursorIntoView();
        }
        this.$highlightBrackets();
        this.$highlightTags();
        this.$updateHighlightActiveLine();
        this._signal("changeSelection");
    }
    $updateHighlightActiveLine() {
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
            var range = new Range(highlight.row, highlight.column, highlight.row, Infinity);
            range.markerId = session.addMarker(range, "ace_active-line", "screenLine");
            session.$highlightLineMarker = range;
        }
        else if (highlight) {
            session.$highlightLineMarker.start.row = highlight.row;
            session.$highlightLineMarker.end.row = highlight.row;
            session.$highlightLineMarker.start.column = highlight.column;
            session._signal("changeBackMarker");
        }
    }
    onSelectionChange(event, selection) {
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
    }
    $getSelectionHighLightRegexp() {
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
    }
    onChangeFrontMarker(event, editSession) {
        this.renderer.updateFrontMarkers();
    }
    onChangeBackMarker(event, editSession) {
        this.renderer.updateBackMarkers();
    }
    onChangeBreakpoint(event, editSession) {
        this.renderer.updateBreakpoints();
        this._emit("changeBreakpoint", event);
    }
    onChangeAnnotation(event, editSession) {
        this.renderer.setAnnotations(editSession.getAnnotations());
        this._emit("changeAnnotation", event);
    }
    onChangeMode(event, editSession) {
        this.renderer.updateText();
        this._emit("changeMode", event);
    }
    onChangeWrapLimit(event, editSession) {
        this.renderer.updateFull();
    }
    onChangeWrapMode(event, editSession) {
        this.renderer.onResize(true);
    }
    onChangeFold(event, editSession) {
        this.$updateHighlightActiveLine();
        this.renderer.updateFull();
    }
    getSelectedText() {
        return this.session.getTextRange(this.getSelectionRange());
    }
    getCopyText() {
        var text = this.getSelectedText();
        this._signal("copy", text);
        return text;
    }
    onCopy() {
        this.commands.exec("copy", this);
    }
    onCut() {
        this.commands.exec("cut", this);
    }
    onPaste(text) {
        if (this.$readOnly)
            return;
        var e = { text: text };
        this._signal("paste", e);
        this.insert(e.text, true);
    }
    execCommand(command, args) {
        this.commands.exec(command, this, args);
    }
    insert(text, pasted) {
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
            var range = Range.fromPoints(cursor, cursor);
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
                this.selection.setSelectionRange(new Range(cursor.row, start + transform.selection[0], cursor.row, start + transform.selection[1]));
            }
            else {
                this.selection.setSelectionRange(new Range(cursor.row + transform.selection[0], transform.selection[1], cursor.row + transform.selection[2], transform.selection[3]));
            }
        }
        if (session.getDocument().isNewLine(text)) {
            var lineIndent = mode.getNextLineIndent(lineState, line.slice(0, cursor.column), session.getTabString());
            session.insert({ row: cursor.row + 1, column: 0 }, lineIndent);
        }
        if (shouldOutdent)
            mode.autoOutdent(lineState, session, cursor.row);
    }
    onTextInput(text) {
        this.keyBinding.onTextInput(text);
        if (text === '.') {
            this.commands.exec(COMMAND_NAME_AUTO_COMPLETE);
        }
        else if (this.getSession().getDocument().isNewLine(text)) {
            var lineNumber = this.getCursorPosition().row;
        }
    }
    onCommandKey(e, hashId, keyCode) {
        this.keyBinding.onCommandKey(e, hashId, keyCode);
    }
    setOverwrite(overwrite) {
        this.session.setOverwrite(overwrite);
    }
    getOverwrite() {
        return this.session.getOverwrite();
    }
    toggleOverwrite() {
        this.session.toggleOverwrite();
    }
    setScrollSpeed(speed) {
        this.setOption("scrollSpeed", speed);
    }
    getScrollSpeed() {
        return this.getOption("scrollSpeed");
    }
    setDragDelay(dragDelay) {
        this.setOption("dragDelay", dragDelay);
    }
    getDragDelay() {
        return this.getOption("dragDelay");
    }
    setSelectionStyle(val) {
        this.setOption("selectionStyle", val);
    }
    getSelectionStyle() {
        return this.getOption("selectionStyle");
    }
    setHighlightActiveLine(shouldHighlight) {
        this.setOption("highlightActiveLine", shouldHighlight);
    }
    getHighlightActiveLine() {
        return this.getOption("highlightActiveLine");
    }
    setHighlightGutterLine(shouldHighlight) {
        this.setOption("highlightGutterLine", shouldHighlight);
    }
    getHighlightGutterLine() {
        return this.getOption("highlightGutterLine");
    }
    setHighlightSelectedWord(shouldHighlight) {
        this.setOption("highlightSelectedWord", shouldHighlight);
    }
    getHighlightSelectedWord() {
        return this.$highlightSelectedWord;
    }
    setAnimatedScroll(shouldAnimate) {
        this.renderer.setAnimatedScroll(shouldAnimate);
    }
    getAnimatedScroll() {
        return this.renderer.getAnimatedScroll();
    }
    setShowInvisibles(showInvisibles) {
        this.renderer.setShowInvisibles(showInvisibles);
    }
    getShowInvisibles() {
        return this.renderer.getShowInvisibles();
    }
    setDisplayIndentGuides(displayIndentGuides) {
        this.renderer.setDisplayIndentGuides(displayIndentGuides);
    }
    getDisplayIndentGuides() {
        return this.renderer.getDisplayIndentGuides();
    }
    setShowPrintMargin(showPrintMargin) {
        this.renderer.setShowPrintMargin(showPrintMargin);
    }
    getShowPrintMargin() {
        return this.renderer.getShowPrintMargin();
    }
    setPrintMarginColumn(showPrintMargin) {
        this.renderer.setPrintMarginColumn(showPrintMargin);
    }
    getPrintMarginColumn() {
        return this.renderer.getPrintMarginColumn();
    }
    setReadOnly(readOnly) {
        this.setOption("readOnly", readOnly);
    }
    getReadOnly() {
        return this.getOption("readOnly");
    }
    setBehavioursEnabled(enabled) {
        this.setOption("behavioursEnabled", enabled);
    }
    getBehavioursEnabled() {
        return this.getOption("behavioursEnabled");
    }
    setWrapBehavioursEnabled(enabled) {
        this.setOption("wrapBehavioursEnabled", enabled);
    }
    getWrapBehavioursEnabled() {
        return this.getOption("wrapBehavioursEnabled");
    }
    setShowFoldWidgets(show) {
        this.setOption("showFoldWidgets", show);
    }
    getShowFoldWidgets() {
        return this.getOption("showFoldWidgets");
    }
    setFadeFoldWidgets(fade) {
        this.setOption("fadeFoldWidgets", fade);
    }
    getFadeFoldWidgets() {
        return this.getOption("fadeFoldWidgets");
    }
    remove(direction) {
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
    }
    removeWordRight() {
        if (this.selection.isEmpty())
            this.selection.selectWordRight();
        this.session.remove(this.getSelectionRange());
        this.clearSelection();
    }
    removeWordLeft() {
        if (this.selection.isEmpty())
            this.selection.selectWordLeft();
        this.session.remove(this.getSelectionRange());
        this.clearSelection();
    }
    removeToLineStart() {
        if (this.selection.isEmpty())
            this.selection.selectLineStart();
        this.session.remove(this.getSelectionRange());
        this.clearSelection();
    }
    removeToLineEnd() {
        if (this.selection.isEmpty())
            this.selection.selectLineEnd();
        var range = this.getSelectionRange();
        if (range.start.column === range.end.column && range.start.row === range.end.row) {
            range.end.column = 0;
            range.end.row++;
        }
        this.session.remove(range);
        this.clearSelection();
    }
    splitLine() {
        if (!this.selection.isEmpty()) {
            this.session.remove(this.getSelectionRange());
            this.clearSelection();
        }
        var cursor = this.getCursorPosition();
        this.insert("\n");
        this.moveCursorToPosition(cursor);
    }
    transposeLetters() {
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
            range = new Range(cursor.row, column - 1, cursor.row, column + 1);
        }
        else {
            swap = line.charAt(column - 1) + line.charAt(column - 2);
            range = new Range(cursor.row, column - 2, cursor.row, column);
        }
        this.session.replace(range, swap);
    }
    toLowerCase() {
        var originalRange = this.getSelectionRange();
        if (this.selection.isEmpty()) {
            this.selection.selectWord();
        }
        var range = this.getSelectionRange();
        var text = this.session.getTextRange(range);
        this.session.replace(range, text.toLowerCase());
        this.selection.setSelectionRange(originalRange);
    }
    toUpperCase() {
        var originalRange = this.getSelectionRange();
        if (this.selection.isEmpty()) {
            this.selection.selectWord();
        }
        var range = this.getSelectionRange();
        var text = this.session.getTextRange(range);
        this.session.replace(range, text.toUpperCase());
        this.selection.setSelectionRange(originalRange);
    }
    indent() {
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
            var indentString = stringRepeat(" ", count);
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
    }
    blockIndent() {
        var rows = this.$getSelectedRows();
        this.session.indentRows(rows.first, rows.last, "\t");
    }
    blockOutdent() {
        var selection = this.session.getSelection();
        this.session.outdentRows(selection.getRange());
    }
    sortLines() {
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
        var deleteRange = new Range(0, 0, 0, 0);
        for (var i = rows.first; i <= rows.last; i++) {
            var line = session.getLine(i);
            deleteRange.start.row = i;
            deleteRange.end.row = i;
            deleteRange.end.column = line.length;
            session.replace(deleteRange, lines[i - rows.first]);
        }
    }
    toggleCommentLines() {
        var state = this.session.getState(this.getCursorPosition().row);
        var rows = this.$getSelectedRows();
        this.session.getMode().toggleCommentLines(state, this.session, rows.first, rows.last);
    }
    toggleBlockComment() {
        var cursor = this.getCursorPosition();
        var state = this.session.getState(cursor.row);
        var range = this.getSelectionRange();
        this.session.getMode().toggleBlockComment(state, this.session, range, cursor);
    }
    getNumberAt(row, column) {
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
    }
    modifyNumber(amount) {
        var row = this.selection.getCursor().row;
        var column = this.selection.getCursor().column;
        var charRange = new Range(row, column - 1, row, column);
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
                var replaceRange = new Range(row, nr.start, row, nr.end);
                this.session.replace(replaceRange, nnr);
                this.moveCursorTo(row, Math.max(nr.start + 1, column + nnr.length - nr.value.length));
            }
        }
    }
    removeLines() {
        var rows = this.$getSelectedRows();
        var range;
        if (rows.first === 0 || rows.last + 1 < this.session.getLength())
            range = new Range(rows.first, 0, rows.last + 1, 0);
        else
            range = new Range(rows.first - 1, this.session.getLine(rows.first - 1).length, rows.last, this.session.getLine(rows.last).length);
        this.session.remove(range);
        this.clearSelection();
    }
    duplicateSelection() {
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
    }
    moveLinesDown() {
        this.$moveLines(function (firstRow, lastRow) {
            return this.session.moveLinesDown(firstRow, lastRow);
        });
    }
    moveLinesUp() {
        this.$moveLines(function (firstRow, lastRow) {
            return this.session.moveLinesUp(firstRow, lastRow);
        });
    }
    moveText(range, toPosition, copy) {
        return this.session.moveText(range, toPosition, copy);
    }
    copyLinesUp() {
        this.$moveLines(function (firstRow, lastRow) {
            this.session.duplicateLines(firstRow, lastRow);
            return 0;
        });
    }
    copyLinesDown() {
        this.$moveLines(function (firstRow, lastRow) {
            return this.session.duplicateLines(firstRow, lastRow);
        });
    }
    $moveLines(mover) {
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
    }
    $getSelectedRows() {
        var range = this.getSelectionRange().collapseRows();
        return {
            first: this.session.getRowFoldStart(range.start.row),
            last: this.session.getRowFoldEnd(range.end.row)
        };
    }
    onCompositionStart(text) {
        this.renderer.showComposition(this.getCursorPosition());
    }
    onCompositionUpdate(text) {
        this.renderer.setCompositionText(text);
    }
    onCompositionEnd() {
        this.renderer.hideComposition();
    }
    getFirstVisibleRow() {
        return this.renderer.getFirstVisibleRow();
    }
    getLastVisibleRow() {
        return this.renderer.getLastVisibleRow();
    }
    isRowVisible(row) {
        return (row >= this.getFirstVisibleRow() && row <= this.getLastVisibleRow());
    }
    isRowFullyVisible(row) {
        return (row >= this.renderer.getFirstFullyVisibleRow() && row <= this.renderer.getLastFullyVisibleRow());
    }
    $getVisibleRowCount() {
        return this.renderer.getScrollBottomRow() - this.renderer.getScrollTopRow() + 1;
    }
    $moveByPage(direction, select) {
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
    }
    selectPageDown() {
        this.$moveByPage(+1, true);
    }
    selectPageUp() {
        this.$moveByPage(-1, true);
    }
    gotoPageDown() {
        this.$moveByPage(+1, false);
    }
    gotoPageUp() {
        this.$moveByPage(-1, false);
    }
    scrollPageDown() {
        this.$moveByPage(1);
    }
    scrollPageUp() {
        this.$moveByPage(-1);
    }
    scrollToRow(row) {
        this.renderer.scrollToRow(row);
    }
    scrollToLine(line, center, animate, callback) {
        this.renderer.scrollToLine(line, center, animate, callback);
    }
    centerSelection() {
        var range = this.getSelectionRange();
        var pos = {
            row: Math.floor(range.start.row + (range.end.row - range.start.row) / 2),
            column: Math.floor(range.start.column + (range.end.column - range.start.column) / 2)
        };
        this.renderer.alignCursor(pos, 0.5);
    }
    getCursorPosition() {
        return this.selection.getCursor();
    }
    getCursorPositionScreen() {
        var cursor = this.getCursorPosition();
        return this.session.documentToScreenPosition(cursor.row, cursor.column);
    }
    getSelectionRange() {
        return this.selection.getRange();
    }
    selectAll() {
        this.$blockScrolling += 1;
        this.selection.selectAll();
        this.$blockScrolling -= 1;
    }
    clearSelection() {
        this.selection.clearSelection();
    }
    moveCursorTo(row, column, animate) {
        this.selection.moveCursorTo(row, column, animate);
    }
    moveCursorToPosition(pos) {
        this.selection.moveCursorToPosition(pos);
    }
    jumpToMatching(select) {
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
                range = new Range(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + i - 1, iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() + i - 1);
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
            var range = new Range(iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() - 2, iterator.getCurrentTokenRow(), iterator.getCurrentTokenColumn() - 2);
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
    }
    gotoLine(lineNumber, column, animate) {
        this.selection.clearSelection();
        this.session.unfold({ row: lineNumber - 1, column: column || 0 });
        this.$blockScrolling += 1;
        this.exitMultiSelectMode && this.exitMultiSelectMode();
        this.moveCursorTo(lineNumber - 1, column || 0);
        this.$blockScrolling -= 1;
        if (!this.isRowFullyVisible(lineNumber - 1)) {
            this.scrollToLine(lineNumber - 1, true, animate);
        }
    }
    navigateTo(row, column) {
        this.selection.moveTo(row, column);
    }
    navigateUp(times) {
        if (this.selection.isMultiLine() && !this.selection.isBackwards()) {
            var selectionStart = this.selection.anchor.getPosition();
            return this.moveCursorToPosition(selectionStart);
        }
        this.selection.clearSelection();
        this.selection.moveCursorBy(-times || -1, 0);
    }
    navigateDown(times) {
        if (this.selection.isMultiLine() && this.selection.isBackwards()) {
            var selectionEnd = this.selection.anchor.getPosition();
            return this.moveCursorToPosition(selectionEnd);
        }
        this.selection.clearSelection();
        this.selection.moveCursorBy(times || 1, 0);
    }
    navigateLeft(times) {
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
    }
    navigateRight(times) {
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
    }
    navigateLineStart() {
        this.selection.moveCursorLineStart();
        this.clearSelection();
    }
    navigateLineEnd() {
        this.selection.moveCursorLineEnd();
        this.clearSelection();
    }
    navigateFileEnd() {
        this.selection.moveCursorFileEnd();
        this.clearSelection();
    }
    navigateFileStart() {
        this.selection.moveCursorFileStart();
        this.clearSelection();
    }
    navigateWordRight() {
        this.selection.moveCursorWordRight();
        this.clearSelection();
    }
    navigateWordLeft() {
        this.selection.moveCursorWordLeft();
        this.clearSelection();
    }
    replace(replacement, options) {
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
    }
    replaceAll(replacement, options) {
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
    }
    $tryReplace(range, replacement) {
        var input = this.session.getTextRange(range);
        replacement = this.$search.replace(input, replacement);
        if (replacement !== null) {
            range.end = this.session.replace(range, replacement);
            return range;
        }
        else {
            return null;
        }
    }
    getLastSearchOptions() {
        return this.$search.getOptions();
    }
    find(needle, options, animate) {
        if (!options)
            options = {};
        if (typeof needle == "string" || needle instanceof RegExp)
            options.needle = needle;
        else if (typeof needle == "object")
            mixin(options, needle);
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
        if (options.backwards)
            range.start = range.end;
        else
            range.end = range.start;
        this.selection.setRange(range);
    }
    findNext(needle, animate) {
        this.find(needle, { skipCurrent: true, backwards: false }, animate);
    }
    findPrevious(needle, animate) {
        this.find(needle, { skipCurrent: true, backwards: true }, animate);
    }
    revealRange(range, animate) {
        this.$blockScrolling += 1;
        this.session.unfold(range);
        this.selection.setSelectionRange(range);
        this.$blockScrolling -= 1;
        var scrollTop = this.renderer.scrollTop;
        this.renderer.scrollSelectionIntoView(range.start, range.end, 0.5);
        if (animate !== false)
            this.renderer.animateScrolling(scrollTop);
    }
    undo() {
        this.$blockScrolling++;
        this.session.getUndoManager().undo();
        this.$blockScrolling--;
        this.renderer.scrollCursorIntoView(null, 0.5);
    }
    redo() {
        this.$blockScrolling++;
        this.session.getUndoManager().redo();
        this.$blockScrolling--;
        this.renderer.scrollCursorIntoView(null, 0.5);
    }
    destroy() {
        this.renderer.destroy();
        this._signal("destroy", this);
    }
    setAutoScrollEditorIntoView(enable) {
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
    }
    $resetCursorStyle() {
        var style = this.$cursorStyle || "ace";
        var cursorLayer = this.renderer.$cursorLayer;
        if (!cursorLayer) {
            return;
        }
        cursorLayer.setSmoothBlinking(/smooth/.test(style));
        cursorLayer.isBlinking = !this.$readOnly && style != "wide";
        setCssClass(cursorLayer.element, "ace_slim-cursors", /slim/.test(style));
    }
}
defineOptions(Editor.prototype, "editor", {
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
class FoldHandler {
    constructor(editor) {
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
}
class MouseHandler {
    constructor(editor) {
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
        addListener(mouseTarget, "click", this.onMouseEvent.bind(this, "click"));
        addListener(mouseTarget, "mousemove", this.onMouseMove.bind(this, "mousemove"));
        addMultiMouseDownListener(mouseTarget, [400, 300, 250], this, "onMouseEvent");
        if (editor.renderer.scrollBarV) {
            addMultiMouseDownListener(editor.renderer.scrollBarV.inner, [400, 300, 250], this, "onMouseEvent");
            addMultiMouseDownListener(editor.renderer.scrollBarH.inner, [400, 300, 250], this, "onMouseEvent");
            if (isIE) {
                addListener(editor.renderer.scrollBarV.element, "mousedown", onMouseDown);
                addListener(editor.renderer.scrollBarH.element, "mousemove", onMouseDown);
            }
        }
        addMouseWheelListener(editor.container, this.emitEditorMouseWheelEvent.bind(this, "mousewheel"));
        var gutterEl = editor.renderer.$gutter;
        addListener(gutterEl, "mousedown", this.onMouseEvent.bind(this, "guttermousedown"));
        addListener(gutterEl, "click", this.onMouseEvent.bind(this, "gutterclick"));
        addListener(gutterEl, "dblclick", this.onMouseEvent.bind(this, "gutterdblclick"));
        addListener(gutterEl, "mousemove", this.onMouseEvent.bind(this, "guttermousemove"));
        addListener(mouseTarget, "mousedown", onMouseDown);
        addListener(gutterEl, "mousedown", function (e) {
            editor.focus();
            return preventDefault(e);
        });
        editor.on('mousemove', function (e) {
            if (_self.state || _self.$dragDelay || !_self.$dragEnabled) {
                return;
            }
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
    onMouseEvent(name, e) {
        this.editor._emit(name, new EditorMouseEvent(e, this.editor));
    }
    onMouseMove(name, e) {
        var listeners = this.editor._eventRegistry && this.editor._eventRegistry['mousemove'];
        if (!listeners || !listeners.length) {
            return;
        }
        this.editor._emit(name, new EditorMouseEvent(e, this.editor));
    }
    emitEditorMouseWheelEvent(name, e) {
        var mouseEvent = new EditorMouseEvent(e, this.editor);
        mouseEvent.speed = this.$scrollSpeed * 2;
        mouseEvent.wheelX = e['wheelX'];
        mouseEvent.wheelY = e['wheelY'];
        this.editor._emit(name, mouseEvent);
    }
    setState(state) {
        this.state = state;
    }
    textCoordinates() {
        return this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
    }
    captureMouse(ev, mouseMoveHandler) {
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
                if (isWebKit && !mouseEvent.which && mouseHandler.releaseMouse) {
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
        if (isOldIE && ev.domEvent.type == "dblclick") {
            return setTimeout(function () { onCaptureEnd(ev); });
        }
        this.$onCaptureMouseMove = onMouseMove;
        this.releaseMouse = capture(this.editor.container, onMouseMove, onCaptureEnd);
        var timerId = setInterval(onCaptureInterval, 20);
    }
    cancelContextMenu() {
        var stop = function (e) {
            if (e && e.domEvent && e.domEvent.type != "contextmenu") {
                return;
            }
            this.editor.off("nativecontextmenu", stop);
            if (e && e.domEvent) {
                stopEvent(e.domEvent);
            }
        }.bind(this);
        setTimeout(stop, 10);
        this.editor.on("nativecontextmenu", stop);
    }
    select() {
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
    }
    selectByLinesEnd() {
        this.$clickSelection = null;
        this.editor.unsetStyle("ace_selecting");
        if (this.editor.renderer.scroller.releaseCapture) {
            this.editor.renderer.scroller.releaseCapture();
        }
    }
    startSelect(pos, waitForClickSelection) {
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
    }
    selectEnd() {
        this.selectByLinesEnd();
    }
    selectAllEnd() {
        this.selectByLinesEnd();
    }
    selectByWordsEnd() {
        this.selectByLinesEnd();
    }
    focusWait() {
        var distance = calcDistance(this.mousedownEvent.clientX, this.mousedownEvent.clientY, this.clientX, this.clientY);
        var time = Date.now();
        if (distance > DRAG_OFFSET || time - this.mousedownEvent.time > this.$focusTimout) {
            this.startSelect(this.mousedownEvent.getDocumentPosition());
        }
    }
}
defineOptions(MouseHandler.prototype, "mouseHandler", {
    scrollSpeed: { initialValue: 2 },
    dragDelay: { initialValue: (isMac ? 150 : 0) },
    dragEnabled: { initialValue: true },
    focusTimout: { initialValue: 0 },
    tooltipFollowsMouse: { initialValue: true }
});
class EditorMouseEvent {
    constructor(domEvent, editor) {
        this.propagationStopped = false;
        this.defaultPrevented = false;
        this.getAccelKey = isMac ? function () { return this.domEvent.metaKey; } : function () { return this.domEvent.ctrlKey; };
        this.domEvent = domEvent;
        this.editor = editor;
        this.clientX = domEvent.clientX;
        this.clientY = domEvent.clientY;
        this.$pos = null;
        this.$inSelection = null;
    }
    get toElement() {
        return this.domEvent.toElement;
    }
    stopPropagation() {
        stopPropagation(this.domEvent);
        this.propagationStopped = true;
    }
    preventDefault() {
        preventDefault(this.domEvent);
        this.defaultPrevented = true;
    }
    stop() {
        this.stopPropagation();
        this.preventDefault();
    }
    getDocumentPosition() {
        if (!this.$pos) {
            this.$pos = this.editor.renderer.screenToTextCoordinates(this.clientX, this.clientY);
        }
        return this.$pos;
    }
    inSelection() {
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
    }
    getButton() {
        return getButton(this.domEvent);
    }
    getShiftKey() {
        return this.domEvent.shiftKey;
    }
}
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
class GutterHandler {
    constructor(mouseHandler) {
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
            var target = e.domEvent.target || e.domEvent.srcElement;
            if (hasCssClass(target, "ace_fold-widget")) {
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
        addListener(editor.renderer.$gutter, "mouseout", function (e) {
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
}
class GutterTooltip extends Tooltip {
    constructor(parentNode) {
        super(parentNode);
    }
    setPosition(x, y) {
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
        super.setPosition(x, y);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0VkaXRvci50cyJdLCJuYW1lcyI6WyJFZGl0b3IiLCJFZGl0b3IuY29uc3RydWN0b3IiLCJFZGl0b3IuY2FuY2VsTW91c2VDb250ZXh0TWVudSIsIkVkaXRvci5zZWxlY3Rpb24iLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMiLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMubGFzdCIsIkVkaXRvci5zdGFydE9wZXJhdGlvbiIsIkVkaXRvci5lbmRPcGVyYXRpb24iLCJFZGl0b3IuJGhpc3RvcnlUcmFja2VyIiwiRWRpdG9yLnNldEtleWJvYXJkSGFuZGxlciIsIkVkaXRvci5nZXRLZXlib2FyZEhhbmRsZXIiLCJFZGl0b3Iuc2V0U2Vzc2lvbiIsIkVkaXRvci5nZXRTZXNzaW9uIiwiRWRpdG9yLnNldFZhbHVlIiwiRWRpdG9yLmdldFZhbHVlIiwiRWRpdG9yLmdldFNlbGVjdGlvbiIsIkVkaXRvci5yZXNpemUiLCJFZGl0b3Iuc2V0VGhlbWUiLCJFZGl0b3IuZ2V0VGhlbWUiLCJFZGl0b3Iuc2V0U3R5bGUiLCJFZGl0b3IudW5zZXRTdHlsZSIsIkVkaXRvci5nZXRGb250U2l6ZSIsIkVkaXRvci5zZXRGb250U2l6ZSIsIkVkaXRvci4kaGlnaGxpZ2h0QnJhY2tldHMiLCJFZGl0b3IuJGhpZ2hsaWdodFRhZ3MiLCJFZGl0b3IuZm9jdXMiLCJFZGl0b3IuaXNGb2N1c2VkIiwiRWRpdG9yLmJsdXIiLCJFZGl0b3Iub25Gb2N1cyIsIkVkaXRvci5vbkJsdXIiLCJFZGl0b3IuJGN1cnNvckNoYW5nZSIsIkVkaXRvci5vbkRvY3VtZW50Q2hhbmdlIiwiRWRpdG9yLm9uVG9rZW5pemVyVXBkYXRlIiwiRWRpdG9yLm9uU2Nyb2xsVG9wQ2hhbmdlIiwiRWRpdG9yLm9uU2Nyb2xsTGVmdENoYW5nZSIsIkVkaXRvci5vbkN1cnNvckNoYW5nZSIsIkVkaXRvci4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5vblNlbGVjdGlvbkNoYW5nZSIsIkVkaXRvci4kZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwIiwiRWRpdG9yLm9uQ2hhbmdlRnJvbnRNYXJrZXIiLCJFZGl0b3Iub25DaGFuZ2VCYWNrTWFya2VyIiwiRWRpdG9yLm9uQ2hhbmdlQnJlYWtwb2ludCIsIkVkaXRvci5vbkNoYW5nZUFubm90YXRpb24iLCJFZGl0b3Iub25DaGFuZ2VNb2RlIiwiRWRpdG9yLm9uQ2hhbmdlV3JhcExpbWl0IiwiRWRpdG9yLm9uQ2hhbmdlV3JhcE1vZGUiLCJFZGl0b3Iub25DaGFuZ2VGb2xkIiwiRWRpdG9yLmdldFNlbGVjdGVkVGV4dCIsIkVkaXRvci5nZXRDb3B5VGV4dCIsIkVkaXRvci5vbkNvcHkiLCJFZGl0b3Iub25DdXQiLCJFZGl0b3Iub25QYXN0ZSIsIkVkaXRvci5leGVjQ29tbWFuZCIsIkVkaXRvci5pbnNlcnQiLCJFZGl0b3Iub25UZXh0SW5wdXQiLCJFZGl0b3Iub25Db21tYW5kS2V5IiwiRWRpdG9yLnNldE92ZXJ3cml0ZSIsIkVkaXRvci5nZXRPdmVyd3JpdGUiLCJFZGl0b3IudG9nZ2xlT3ZlcndyaXRlIiwiRWRpdG9yLnNldFNjcm9sbFNwZWVkIiwiRWRpdG9yLmdldFNjcm9sbFNwZWVkIiwiRWRpdG9yLnNldERyYWdEZWxheSIsIkVkaXRvci5nZXREcmFnRGVsYXkiLCJFZGl0b3Iuc2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3IuZ2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3Iuc2V0SGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5nZXRIaWdobGlnaHRBY3RpdmVMaW5lIiwiRWRpdG9yLnNldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIkVkaXRvci5zZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkIiwiRWRpdG9yLnNldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLmdldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLnNldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLmdldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJFZGl0b3IuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIkVkaXRvci5zZXRTaG93UHJpbnRNYXJnaW4iLCJFZGl0b3IuZ2V0U2hvd1ByaW50TWFyZ2luIiwiRWRpdG9yLnNldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLmdldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLnNldFJlYWRPbmx5IiwiRWRpdG9yLmdldFJlYWRPbmx5IiwiRWRpdG9yLnNldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLmdldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLnNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5nZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQiLCJFZGl0b3Iuc2V0U2hvd0ZvbGRXaWRnZXRzIiwiRWRpdG9yLmdldFNob3dGb2xkV2lkZ2V0cyIsIkVkaXRvci5zZXRGYWRlRm9sZFdpZGdldHMiLCJFZGl0b3IuZ2V0RmFkZUZvbGRXaWRnZXRzIiwiRWRpdG9yLnJlbW92ZSIsIkVkaXRvci5yZW1vdmVXb3JkUmlnaHQiLCJFZGl0b3IucmVtb3ZlV29yZExlZnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lU3RhcnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lRW5kIiwiRWRpdG9yLnNwbGl0TGluZSIsIkVkaXRvci50cmFuc3Bvc2VMZXR0ZXJzIiwiRWRpdG9yLnRvTG93ZXJDYXNlIiwiRWRpdG9yLnRvVXBwZXJDYXNlIiwiRWRpdG9yLmluZGVudCIsIkVkaXRvci5ibG9ja0luZGVudCIsIkVkaXRvci5ibG9ja091dGRlbnQiLCJFZGl0b3Iuc29ydExpbmVzIiwiRWRpdG9yLnRvZ2dsZUNvbW1lbnRMaW5lcyIsIkVkaXRvci50b2dnbGVCbG9ja0NvbW1lbnQiLCJFZGl0b3IuZ2V0TnVtYmVyQXQiLCJFZGl0b3IubW9kaWZ5TnVtYmVyIiwiRWRpdG9yLnJlbW92ZUxpbmVzIiwiRWRpdG9yLmR1cGxpY2F0ZVNlbGVjdGlvbiIsIkVkaXRvci5tb3ZlTGluZXNEb3duIiwiRWRpdG9yLm1vdmVMaW5lc1VwIiwiRWRpdG9yLm1vdmVUZXh0IiwiRWRpdG9yLmNvcHlMaW5lc1VwIiwiRWRpdG9yLmNvcHlMaW5lc0Rvd24iLCJFZGl0b3IuJG1vdmVMaW5lcyIsIkVkaXRvci4kZ2V0U2VsZWN0ZWRSb3dzIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25TdGFydCIsIkVkaXRvci5vbkNvbXBvc2l0aW9uVXBkYXRlIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25FbmQiLCJFZGl0b3IuZ2V0Rmlyc3RWaXNpYmxlUm93IiwiRWRpdG9yLmdldExhc3RWaXNpYmxlUm93IiwiRWRpdG9yLmlzUm93VmlzaWJsZSIsIkVkaXRvci5pc1Jvd0Z1bGx5VmlzaWJsZSIsIkVkaXRvci4kZ2V0VmlzaWJsZVJvd0NvdW50IiwiRWRpdG9yLiRtb3ZlQnlQYWdlIiwiRWRpdG9yLnNlbGVjdFBhZ2VEb3duIiwiRWRpdG9yLnNlbGVjdFBhZ2VVcCIsIkVkaXRvci5nb3RvUGFnZURvd24iLCJFZGl0b3IuZ290b1BhZ2VVcCIsIkVkaXRvci5zY3JvbGxQYWdlRG93biIsIkVkaXRvci5zY3JvbGxQYWdlVXAiLCJFZGl0b3Iuc2Nyb2xsVG9Sb3ciLCJFZGl0b3Iuc2Nyb2xsVG9MaW5lIiwiRWRpdG9yLmNlbnRlclNlbGVjdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvblNjcmVlbiIsIkVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSIsIkVkaXRvci5zZWxlY3RBbGwiLCJFZGl0b3IuY2xlYXJTZWxlY3Rpb24iLCJFZGl0b3IubW92ZUN1cnNvclRvIiwiRWRpdG9yLm1vdmVDdXJzb3JUb1Bvc2l0aW9uIiwiRWRpdG9yLmp1bXBUb01hdGNoaW5nIiwiRWRpdG9yLmdvdG9MaW5lIiwiRWRpdG9yLm5hdmlnYXRlVG8iLCJFZGl0b3IubmF2aWdhdGVVcCIsIkVkaXRvci5uYXZpZ2F0ZURvd24iLCJFZGl0b3IubmF2aWdhdGVMZWZ0IiwiRWRpdG9yLm5hdmlnYXRlUmlnaHQiLCJFZGl0b3IubmF2aWdhdGVMaW5lU3RhcnQiLCJFZGl0b3IubmF2aWdhdGVMaW5lRW5kIiwiRWRpdG9yLm5hdmlnYXRlRmlsZUVuZCIsIkVkaXRvci5uYXZpZ2F0ZUZpbGVTdGFydCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRMZWZ0IiwiRWRpdG9yLnJlcGxhY2UiLCJFZGl0b3IucmVwbGFjZUFsbCIsIkVkaXRvci4kdHJ5UmVwbGFjZSIsIkVkaXRvci5nZXRMYXN0U2VhcmNoT3B0aW9ucyIsIkVkaXRvci5maW5kIiwiRWRpdG9yLmZpbmROZXh0IiwiRWRpdG9yLmZpbmRQcmV2aW91cyIsIkVkaXRvci5yZXZlYWxSYW5nZSIsIkVkaXRvci51bmRvIiwiRWRpdG9yLnJlZG8iLCJFZGl0b3IuZGVzdHJveSIsIkVkaXRvci5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXciLCJFZGl0b3IuJHJlc2V0Q3Vyc29yU3R5bGUiLCJGb2xkSGFuZGxlciIsIkZvbGRIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyIiwiTW91c2VIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyLm9uTW91c2VFdmVudCIsIk1vdXNlSGFuZGxlci5vbk1vdXNlTW92ZSIsIk1vdXNlSGFuZGxlci5lbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50IiwiTW91c2VIYW5kbGVyLnNldFN0YXRlIiwiTW91c2VIYW5kbGVyLnRleHRDb29yZGluYXRlcyIsIk1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UiLCJNb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUiLCJNb3VzZUhhbmRsZXIuc2VsZWN0IiwiTW91c2VIYW5kbGVyLnNlbGVjdEJ5TGluZXNFbmQiLCJNb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QiLCJNb3VzZUhhbmRsZXIuc2VsZWN0RW5kIiwiTW91c2VIYW5kbGVyLnNlbGVjdEFsbEVuZCIsIk1vdXNlSGFuZGxlci5zZWxlY3RCeVdvcmRzRW5kIiwiTW91c2VIYW5kbGVyLmZvY3VzV2FpdCIsIkVkaXRvck1vdXNlRXZlbnQiLCJFZGl0b3JNb3VzZUV2ZW50LmNvbnN0cnVjdG9yIiwiRWRpdG9yTW91c2VFdmVudC50b0VsZW1lbnQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3BQcm9wYWdhdGlvbiIsIkVkaXRvck1vdXNlRXZlbnQucHJldmVudERlZmF1bHQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3AiLCJFZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24iLCJFZGl0b3JNb3VzZUV2ZW50LmluU2VsZWN0aW9uIiwiRWRpdG9yTW91c2VFdmVudC5nZXRCdXR0b24iLCJFZGl0b3JNb3VzZUV2ZW50LmdldFNoaWZ0S2V5IiwibWFrZU1vdXNlRG93bkhhbmRsZXIiLCJtYWtlTW91c2VXaGVlbEhhbmRsZXIiLCJtYWtlRG91YmxlQ2xpY2tIYW5kbGVyIiwibWFrZVRyaXBsZUNsaWNrSGFuZGxlciIsIm1ha2VRdWFkQ2xpY2tIYW5kbGVyIiwibWFrZUV4dGVuZFNlbGVjdGlvbkJ5IiwiY2FsY0Rpc3RhbmNlIiwiY2FsY1JhbmdlT3JpZW50YXRpb24iLCJHdXR0ZXJIYW5kbGVyIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3RvciIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3Iuc2hvd1Rvb2x0aXAiLCJHdXR0ZXJIYW5kbGVyLmNvbnN0cnVjdG9yLmhpZGVUb29sdGlwIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3Rvci5tb3ZlVG9vbHRpcCIsIkd1dHRlclRvb2x0aXAiLCJHdXR0ZXJUb29sdGlwLmNvbnN0cnVjdG9yIiwiR3V0dGVyVG9vbHRpcC5zZXRQb3NpdGlvbiJdLCJtYXBwaW5ncyI6Ik9BZ0NPLEVBQUMsS0FBSyxFQUFDLE1BQU0sV0FBVztPQUN4QixFQUFDLGFBQWEsRUFB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Z0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzFEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUVsQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDbERBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1lBRTdDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUV2REEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUMxRUEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsZUFBZUEsRUFBRUEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtZQUVuREEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzVEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFFdkRBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JB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QUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUN4Q0EsSUFBSUEsQ0FBQ0EsZUFBZUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQzFDQSxJQUFJQSxDQUFDQSxlQUFlQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUUxQkEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUU5Q0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUUvQ0EsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUMvQ0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUM5Q0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUM5Q0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUM5Q0EsT0FBT0EsQ0FBQ0EsY0FBY0EsRUFBRUEsSUFBSUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7WUFDNURBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1FBQy9C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QUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBQzdDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNoQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLElBQUlBLElBQUlBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ2pDQSxJQUFJQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDbERBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzNFQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUV0QkEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDMUJBLElBQUlBLFNBQVNBLEdBQUdBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENB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LEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQTtRQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JEQSxLQUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN0RUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekRBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQ2xFQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUN0Q0EsQ0FBQ0E7SUFLRGpHLFdBQVdBO1FBQ1BrRyxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1FBQzdD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QUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTNCQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUV2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ0xBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBO2dCQUNwRkEsSUFBSUEsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0E7Z0JBRS9DQSxJQUFJQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDN0JBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO2dCQUc1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9CQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaERBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFD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S0EsQ0FBQ0E7WUFDUEEsTUFBTUEsQ0FBQ0E7UUFHWEEsSUFBSUEsU0FBU0EsQ0FBQ0E7UUFDZEEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDbEJBLElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLElBQUlBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3BDQSxJQUFJQSxXQUFXQSxDQUFDQTtRQUNoQkEsSUFBSUEsUUFBUUEsR0FBR0E7WUFDWEEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7U0FDWEEsQ0FBQ0E7UUFFRkEsR0FBR0EsQ0FBQ0E7WUFDQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDM0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsUUFBUUEsQ0FBQ0E7b0JBQ2JBLENBQUNBO29CQUVEQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFFdEZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3JCQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDVEEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBOzRCQUNKQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFDckJBLEtBQUtBLENBQUNBO3dCQUNWQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDVEEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBOzRCQUNKQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFFckJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dDQUM1QkEsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0E7Z0NBQ3RCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTs0QkFDakJBLENBQUNBOzRCQUNEQSxLQUFLQSxDQUFDQTtvQkFDZEEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO1lBQ0xBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN4REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FB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QkEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3RGQSxDQUFDQTt3QkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7NEJBQy9EQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQ0FDMUJBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBOzRCQUNqQkEsQ0FBQ0E7NEJBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dDQUNsQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7NEJBQ2pCQSxDQUFDQTs0QkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0NBQ2pCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTt3QkFDckJBLENBQUNBO29CQUNMQSxDQUFDQTtnQkFDTEEsQ0FBQ0EsUUFBUUEsU0FBU0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUE7WUFDbENBLENBQUNBO1lBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQ0EsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxD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Z0JBQ3ZFQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNmQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUV2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBO1lBQ3RCQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1FBQ3BCQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNsQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDNUJBLElBQUlBO1lBQ0FBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQzVCQSxJQUFJQSxDQUFDQSxTQUFT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Y0EsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDdEZBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxnQkFBZ0JBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO0lBQ2xFQSxDQUFDQTtJQUVESCx5QkFBeUJBLENBQUNBLElBQVlBLEVBQUVBLENBQWtCQTtRQUN0REksSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUN0REEsVUFBVUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDekNBLFVBQVVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQ2hDQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNoQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDeENBLENBQUNBO0lBRURKLFFBQVFBLENBQUNBLEtBQWFBO1FBQ2xCSyxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQTtJQUN2QkEsQ0FBQ0E7SUFFREwsZUFBZUE7UUFDWE0sTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxJ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QUVBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0FBQ2xFQSxDQUFDQTtBQUVELDhCQUE4QixLQUFZLEVBQUUsTUFBdUM7SUFDL0VDLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ25DQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtJQUN4RUEsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeEZBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUMvREEsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FB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Q0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsV0FBV0EsQ0FBQ0E7UUFDbkNBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLEdBQUdBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxDQUFDQSxJQUFJQSxFQUFFQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNyQkEsQ0FBQ0E7UUFDREEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0FBQ0xGLENBQUNBO0FBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuLy9yZXF1aXJlKFwiLi9saWIvZml4b2xkYnJvd3NlcnNcIik7XG5cbmltcG9ydCB7bWl4aW59IGZyb20gXCIuL2xpYi9vb3BcIjtcbmltcG9ydCB7Y29tcHV0ZWRTdHlsZSwgaGFzQ3NzQ2xhc3MsIHNldENzc0NsYXNzfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQge2RlbGF5ZWRDYWxsLCBzdHJpbmdSZXBlYXR9IGZyb20gXCIuL2xpYi9sYW5nXCI7XG5pbXBvcnQge2lzSUUsIGlzTWFjLCBpc01vYmlsZSwgaXNPbGRJRSwgaXNXZWJLaXR9IGZyb20gXCIuL2xpYi91c2VyYWdlbnRcIjtcbmltcG9ydCBHdXR0ZXIgZnJvbSBcIi4vbGF5ZXIvR3V0dGVyXCI7XG5pbXBvcnQgSGFzaEhhbmRsZXIgZnJvbSBcIi4va2V5Ym9hcmQvSGFzaEhhbmRsZXJcIjtcbmltcG9ydCBLZXlCaW5kaW5nIGZyb20gXCIuL2tleWJvYXJkL0tleUJpbmRpbmdcIjtcbmltcG9ydCBUZXh0SW5wdXQgZnJvbSBcIi4va2V5Ym9hcmQvVGV4dElucHV0XCI7XG5pbXBvcnQgRWRpdFNlc3Npb24gZnJvbSBcIi4vRWRpdFNlc3Npb25cIjtcbmltcG9ydCBTZWFyY2ggZnJvbSBcIi4vU2VhcmNoXCI7XG5pbXBvcnQgUmFuZ2UgZnJvbSBcIi4vUmFuZ2VcIjtcbmltcG9ydCBDdXJzb3JSYW5nZSBmcm9tICcuL0N1cnNvclJhbmdlJ1xuaW1wb3J0IEV2ZW50RW1pdHRlckNsYXNzIGZyb20gXCIuL2xpYi9ldmVudF9lbWl0dGVyXCI7XG5pbXBvcnQgQ29tbWFuZE1hbmFnZXIgZnJvbSBcIi4vY29tbWFuZHMvQ29tbWFuZE1hbmFnZXJcIjtcbmltcG9ydCBkZWZhdWx0Q29tbWFuZHMgZnJvbSBcIi4vY29tbWFuZHMvZGVmYXVsdF9jb21tYW5kc1wiO1xuaW1wb3J0IHtkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnMsIF9zaWduYWx9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IFRva2VuSXRlcmF0b3IgZnJvbSBcIi4vVG9rZW5JdGVyYXRvclwiO1xuaW1wb3J0IHtDT01NQU5EX05BTUVfQVVUT19DT01QTEVURX0gZnJvbSAnLi9lZGl0b3JfcHJvdG9jb2wnO1xuaW1wb3J0IFZpcnR1YWxSZW5kZXJlciBmcm9tICcuL1ZpcnR1YWxSZW5kZXJlcic7XG5pbXBvcnQge0NvbXBsZXRlcn0gZnJvbSBcIi4vYXV0b2NvbXBsZXRlXCI7XG5pbXBvcnQgU2VsZWN0aW9uIGZyb20gJy4vU2VsZWN0aW9uJztcbmltcG9ydCB7YWRkTGlzdGVuZXIsIGFkZE1vdXNlV2hlZWxMaXN0ZW5lciwgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lciwgY2FwdHVyZSwgZ2V0QnV0dG9uLCBwcmV2ZW50RGVmYXVsdCwgc3RvcEV2ZW50LCBzdG9wUHJvcGFnYXRpb259IGZyb20gXCIuL2xpYi9ldmVudFwiO1xuaW1wb3J0IHt0b3VjaE1hbmFnZXJ9IGZyb20gJy4vdG91Y2gvdG91Y2gnO1xuaW1wb3J0IFRvb2x0aXAgZnJvbSBcIi4vVG9vbHRpcFwiO1xuXG4vL3ZhciBEcmFnZHJvcEhhbmRsZXIgPSByZXF1aXJlKFwiLi9tb3VzZS9kcmFnZHJvcF9oYW5kbGVyXCIpLkRyYWdkcm9wSGFuZGxlcjtcblxuLyoqXG4gKiBUaGUgbWFpbiBlbnRyeSBwb2ludCBpbnRvIHRoZSBBY2UgZnVuY3Rpb25hbGl0eS5cbiAqXG4gKiBUaGUgYEVkaXRvcmAgbWFuYWdlcyB0aGUgW1tFZGl0U2Vzc2lvbl1dICh3aGljaCBtYW5hZ2VzIFtbRG9jdW1lbnRdXXMpLCBhcyB3ZWxsIGFzIHRoZSBbW1ZpcnR1YWxSZW5kZXJlcl1dLCB3aGljaCBkcmF3cyBldmVyeXRoaW5nIHRvIHRoZSBzY3JlZW4uXG4gKlxuICogRXZlbnQgc2Vzc2lvbnMgZGVhbGluZyB3aXRoIHRoZSBtb3VzZSBhbmQga2V5Ym9hcmQgYXJlIGJ1YmJsZWQgdXAgZnJvbSBgRG9jdW1lbnRgIHRvIHRoZSBgRWRpdG9yYCwgd2hpY2ggZGVjaWRlcyB3aGF0IHRvIGRvIHdpdGggdGhlbS5cbiAqIEBjbGFzcyBFZGl0b3JcbiAqL1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEVkaXRvcmAgb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7VmlydHVhbFJlbmRlcmVyfSByZW5kZXJlciBBc3NvY2lhdGVkIGBWaXJ0dWFsUmVuZGVyZXJgIHRoYXQgZHJhd3MgZXZlcnl0aGluZ1xuICogQHBhcmFtIHtFZGl0U2Vzc2lvbn0gc2Vzc2lvbiBUaGUgYEVkaXRTZXNzaW9uYCB0byByZWZlciB0b1xuICpcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRWRpdG9yIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyByZW5kZXJlcjogVmlydHVhbFJlbmRlcmVyO1xuICAgIHB1YmxpYyBzZXNzaW9uOiBFZGl0U2Vzc2lvbjtcbiAgICBwcml2YXRlICR0b3VjaEhhbmRsZXI6IElHZXN0dXJlSGFuZGxlcjtcbiAgICBwcml2YXRlICRtb3VzZUhhbmRsZXI6IElHZXN0dXJlSGFuZGxlcjtcbiAgICBwdWJsaWMgZ2V0T3B0aW9uO1xuICAgIHB1YmxpYyBzZXRPcHRpb247XG4gICAgcHVibGljIHNldE9wdGlvbnM7XG4gICAgcHVibGljICRpc0ZvY3VzZWQ7XG4gICAgcHVibGljIGNvbW1hbmRzOiBDb21tYW5kTWFuYWdlcjtcbiAgICBwdWJsaWMga2V5QmluZGluZzogS2V5QmluZGluZztcbiAgICAvLyBGSVhNRTogVGhpcyBpcyByZWFsbHkgYW4gb3B0aW9uYWwgZXh0ZW5zaW9uIGFuZCBzbyBkb2VzIG5vdCBiZWxvbmcgaGVyZS5cbiAgICBwdWJsaWMgY29tcGxldGVyczogQ29tcGxldGVyW107XG5cbiAgICBwdWJsaWMgd2lkZ2V0TWFuYWdlcjtcblxuICAgIC8qKlxuICAgICAqIFRoZSByZW5kZXJlciBjb250YWluZXIgZWxlbWVudC5cbiAgICAgKi9cbiAgICBwdWJsaWMgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMgdGV4dElucHV0O1xuICAgIHB1YmxpYyBpbk11bHRpU2VsZWN0TW9kZTogYm9vbGVhbjtcbiAgICBwdWJsaWMgaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZTtcblxuICAgIHByaXZhdGUgJGN1cnNvclN0eWxlOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSAka2V5YmluZGluZ0lkO1xuICAgIHByaXZhdGUgJGJsb2NrU2Nyb2xsaW5nO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEFjdGl2ZUxpbmU7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0UGVuZGluZztcbiAgICBwcml2YXRlICRoaWdobGlnaHRTZWxlY3RlZFdvcmQ7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0VGFnUGVuZGluZztcbiAgICBwcml2YXRlICRtZXJnZVVuZG9EZWx0YXM7XG4gICAgcHVibGljICRyZWFkT25seTtcbiAgICBwcml2YXRlICRzY3JvbGxBbmNob3I7XG4gICAgcHJpdmF0ZSAkc2VhcmNoOiBTZWFyY2g7XG4gICAgcHJpdmF0ZSBfJGVtaXRJbnB1dEV2ZW50O1xuICAgIHByaXZhdGUgc2VsZWN0aW9ucztcbiAgICBwcml2YXRlICRzZWxlY3Rpb25TdHlsZTtcbiAgICBwcml2YXRlICRvcFJlc2V0VGltZXI7XG4gICAgcHJpdmF0ZSBjdXJPcDtcbiAgICBwcml2YXRlIHByZXZPcDogeyBjb21tYW5kPzsgYXJncz99O1xuICAgIHByaXZhdGUgcHJldmlvdXNDb21tYW5kO1xuICAgIHByaXZhdGUgJG1lcmdlYWJsZUNvbW1hbmRzOiBzdHJpbmdbXTtcbiAgICBwcml2YXRlIG1lcmdlTmV4dENvbW1hbmQ7XG4gICAgcHJpdmF0ZSAkbWVyZ2VOZXh0Q29tbWFuZDtcbiAgICBwcml2YXRlIHNlcXVlbmNlU3RhcnRUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkb25Eb2N1bWVudENoYW5nZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZU1vZGU7XG4gICAgcHJpdmF0ZSAkb25Ub2tlbml6ZXJVcGRhdGU7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VUYWJTaXplOiAoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikgPT4gYW55O1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlV3JhcExpbWl0O1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlV3JhcE1vZGU7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VGb2xkO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlRnJvbnRNYXJrZXI7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VCYWNrTWFya2VyO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlQnJlYWtwb2ludDtcbiAgICBwcml2YXRlICRvbkNoYW5nZUFubm90YXRpb247XG4gICAgcHJpdmF0ZSAkb25DdXJzb3JDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25TY3JvbGxUb3BDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25TY3JvbGxMZWZ0Q2hhbmdlO1xuICAgIHB1YmxpYyAkb25TZWxlY3Rpb25DaGFuZ2U6IChldmVudCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24pID0+IHZvaWQ7XG4gICAgcHVibGljIGV4aXRNdWx0aVNlbGVjdE1vZGU7XG4gICAgcHVibGljIGZvckVhY2hTZWxlY3Rpb247XG4gICAgY29uc3RydWN0b3IocmVuZGVyZXI6IFZpcnR1YWxSZW5kZXJlciwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5jdXJPcCA9IG51bGw7XG4gICAgICAgIHRoaXMucHJldk9wID0ge307XG4gICAgICAgIHRoaXMuJG1lcmdlYWJsZUNvbW1hbmRzID0gW1wiYmFja3NwYWNlXCIsIFwiZGVsXCIsIFwiaW5zZXJ0c3RyaW5nXCJdO1xuICAgICAgICB0aGlzLmNvbW1hbmRzID0gbmV3IENvbW1hbmRNYW5hZ2VyKGlzTWFjID8gXCJtYWNcIiA6IFwid2luXCIsIGRlZmF1bHRDb21tYW5kcyk7XG4gICAgICAgIHRoaXMuY29udGFpbmVyID0gcmVuZGVyZXIuZ2V0Q29udGFpbmVyRWxlbWVudCgpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyID0gcmVuZGVyZXI7XG5cbiAgICAgICAgdGhpcy50ZXh0SW5wdXQgPSBuZXcgVGV4dElucHV0KHJlbmRlcmVyLmdldFRleHRBcmVhQ29udGFpbmVyKCksIHRoaXMpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnRleHRhcmVhID0gdGhpcy50ZXh0SW5wdXQuZ2V0RWxlbWVudCgpO1xuICAgICAgICB0aGlzLmtleUJpbmRpbmcgPSBuZXcgS2V5QmluZGluZyh0aGlzKTtcblxuICAgICAgICBpZiAoaXNNb2JpbGUpIHtcbiAgICAgICAgICAgIHRoaXMuJHRvdWNoSGFuZGxlciA9IHRvdWNoTWFuYWdlcih0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdXNlSGFuZGxlciA9IG5ldyBNb3VzZUhhbmRsZXIodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiR0b3VjaEhhbmRsZXIgPSB0b3VjaE1hbmFnZXIodGhpcyk7XG4gICAgICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIgPSBuZXcgTW91c2VIYW5kbGVyKHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgbmV3IEZvbGRIYW5kbGVyKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nID0gMDtcbiAgICAgICAgdGhpcy4kc2VhcmNoID0gbmV3IFNlYXJjaCgpLnNldCh7IHdyYXA6IHRydWUgfSk7XG5cbiAgICAgICAgdGhpcy4kaGlzdG9yeVRyYWNrZXIgPSB0aGlzLiRoaXN0b3J5VHJhY2tlci5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiZXhlY1wiLCB0aGlzLiRoaXN0b3J5VHJhY2tlcik7XG5cbiAgICAgICAgdGhpcy4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycygpO1xuXG4gICAgICAgIHRoaXMuXyRlbWl0SW5wdXRFdmVudCA9IGRlbGF5ZWRDYWxsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiaW5wdXRcIiwge30pO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmJnVG9rZW5pemVyICYmIHRoaXMuc2Vzc2lvbi5iZ1Rva2VuaXplci5zY2hlZHVsZVN0YXJ0KCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi5fJGVtaXRJbnB1dEV2ZW50LnNjaGVkdWxlKDMxKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICByZXNldE9wdGlvbnModGhpcyk7XG4gICAgICAgIF9zaWduYWwoXCJlZGl0b3JcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgY2FuY2VsTW91c2VDb250ZXh0TWVudSgpIHtcbiAgICAgICAgdGhpcy4kbW91c2VIYW5kbGVyLmNhbmNlbENvbnRleHRNZW51KCk7XG4gICAgfVxuXG4gICAgZ2V0IHNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgIH1cbiAgICBzZXQgc2VsZWN0aW9uKHNlbGVjdGlvbjogU2VsZWN0aW9uKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uKTtcbiAgICB9XG5cbiAgICAkaW5pdE9wZXJhdGlvbkxpc3RlbmVycygpIHtcbiAgICAgICAgZnVuY3Rpb24gbGFzdChhKSB7IHJldHVybiBhW2EubGVuZ3RoIC0gMV0gfVxuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9ucyA9IFtdO1xuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiZXhlY1wiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3BlcmF0aW9uKGUpO1xuXG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IGUuY29tbWFuZDtcbiAgICAgICAgICAgIGlmIChjb21tYW5kLmFjZUNvbW1hbmRHcm91cCA9PSBcImZpbGVKdW1wXCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJldiA9IHRoaXMucHJldk9wO1xuICAgICAgICAgICAgICAgIGlmICghcHJldiB8fCBwcmV2LmNvbW1hbmQuYWNlQ29tbWFuZEdyb3VwICE9IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RGaWxlSnVtcFBvcyA9IGxhc3QodGhpcy5zZWxlY3Rpb25zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubGFzdEZpbGVKdW1wUG9zID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpLCB0cnVlKTtcblxuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiYWZ0ZXJFeGVjXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gZS5jb21tYW5kO1xuXG4gICAgICAgICAgICBpZiAoY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgPT0gXCJmaWxlSnVtcFwiKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMubGFzdEZpbGVKdW1wUG9zICYmICF0aGlzLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uZnJvbUpTT04odGhpcy5sYXN0RmlsZUp1bXBQb3MpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZW5kT3BlcmF0aW9uKGUpO1xuICAgICAgICB9LmJpbmQodGhpcyksIHRydWUpO1xuXG4gICAgICAgIHRoaXMuJG9wUmVzZXRUaW1lciA9IGRlbGF5ZWRDYWxsKHRoaXMuZW5kT3BlcmF0aW9uLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMub24oXCJjaGFuZ2VcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLmN1ck9wIHx8IHRoaXMuc3RhcnRPcGVyYXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AuZG9jQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH0uYmluZCh0aGlzKSwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy5vbihcImNoYW5nZVNlbGVjdGlvblwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AgfHwgdGhpcy5zdGFydE9wZXJhdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgfS5iaW5kKHRoaXMpLCB0cnVlKTtcbiAgICB9XG5cbiAgICBzdGFydE9wZXJhdGlvbihjb21tYWRFdmVudCkge1xuICAgICAgICBpZiAodGhpcy5jdXJPcCkge1xuICAgICAgICAgICAgaWYgKCFjb21tYWRFdmVudCB8fCB0aGlzLmN1ck9wLmNvbW1hbmQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgdGhpcy5wcmV2T3AgPSB0aGlzLmN1ck9wO1xuICAgICAgICB9XG4gICAgICAgIGlmICghY29tbWFkRXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDb21tYW5kID0gbnVsbDtcbiAgICAgICAgICAgIGNvbW1hZEV2ZW50ID0ge307XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRvcFJlc2V0VGltZXIuc2NoZWR1bGUoKTtcbiAgICAgICAgdGhpcy5jdXJPcCA9IHtcbiAgICAgICAgICAgIGNvbW1hbmQ6IGNvbW1hZEV2ZW50LmNvbW1hbmQgfHwge30sXG4gICAgICAgICAgICBhcmdzOiBjb21tYWRFdmVudC5hcmdzLFxuICAgICAgICAgICAgc2Nyb2xsVG9wOiB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvcFxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBjb21tYW5kID0gdGhpcy5jdXJPcC5jb21tYW5kO1xuICAgICAgICBpZiAoY29tbWFuZCAmJiBjb21tYW5kLnNjcm9sbEludG9WaWV3KVxuICAgICAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcrKztcblxuICAgICAgICB0aGlzLnNlbGVjdGlvbnMucHVzaCh0aGlzLnNlbGVjdGlvbi50b0pTT04oKSk7XG4gICAgfVxuXG4gICAgZW5kT3BlcmF0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5jdXJPcCkge1xuICAgICAgICAgICAgdmFyIGNvbW1hbmQgPSB0aGlzLmN1ck9wLmNvbW1hbmQ7XG4gICAgICAgICAgICBpZiAoY29tbWFuZCAmJiBjb21tYW5kLnNjcm9sbEludG9WaWV3KSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgICAgICAgICBzd2l0Y2ggKGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImNlbnRlclwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJhbmltYXRlXCI6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJjdXJzb3JcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwic2VsZWN0aW9uUGFydFwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBjb25maWcgPSB0aGlzLnJlbmRlcmVyLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA+PSBjb25maWcubGFzdFJvdyB8fCByYW5nZS5lbmQucm93IDw9IGNvbmZpZy5maXJzdFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcodGhpcy5zZWxlY3Rpb24uYW5jaG9yLCB0aGlzLnNlbGVjdGlvbi5sZWFkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChjb21tYW5kLnNjcm9sbEludG9WaWV3ID09IFwiYW5pbWF0ZVwiKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmFuaW1hdGVTY3JvbGxpbmcodGhpcy5jdXJPcC5zY3JvbGxUb3ApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnByZXZPcCA9IHRoaXMuY3VyT3A7XG4gICAgICAgICAgICB0aGlzLmN1ck9wID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgICRoaXN0b3J5VHJhY2tlcihlOiB7IGNvbW1hbmQ7IGFyZ3MgfSkge1xuICAgICAgICBpZiAoIXRoaXMuJG1lcmdlVW5kb0RlbHRhcylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcHJldiA9IHRoaXMucHJldk9wO1xuICAgICAgICB2YXIgbWVyZ2VhYmxlQ29tbWFuZHMgPSB0aGlzLiRtZXJnZWFibGVDb21tYW5kcztcbiAgICAgICAgLy8gcHJldmlvdXMgY29tbWFuZCB3YXMgdGhlIHNhbWVcbiAgICAgICAgdmFyIHNob3VsZE1lcmdlID0gcHJldi5jb21tYW5kICYmIChlLmNvbW1hbmQubmFtZSA9PSBwcmV2LmNvbW1hbmQubmFtZSk7XG4gICAgICAgIGlmIChlLmNvbW1hbmQubmFtZSA9PSBcImluc2VydHN0cmluZ1wiKSB7XG4gICAgICAgICAgICB2YXIgdGV4dCA9IGUuYXJncztcbiAgICAgICAgICAgIGlmICh0aGlzLm1lcmdlTmV4dENvbW1hbmQgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICB0aGlzLm1lcmdlTmV4dENvbW1hbmQgPSB0cnVlO1xuXG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IHNob3VsZE1lcmdlXG4gICAgICAgICAgICAgICAgJiYgdGhpcy5tZXJnZU5leHRDb21tYW5kIC8vIHByZXZpb3VzIGNvbW1hbmQgYWxsb3dzIHRvIGNvYWxlc2NlIHdpdGhcbiAgICAgICAgICAgICAgICAmJiAoIS9cXHMvLnRlc3QodGV4dCkgfHwgL1xccy8udGVzdChwcmV2LmFyZ3MpKTsgLy8gcHJldmlvdXMgaW5zZXJ0aW9uIHdhcyBvZiBzYW1lIHR5cGVcblxuICAgICAgICAgICAgdGhpcy5tZXJnZU5leHRDb21tYW5kID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNob3VsZE1lcmdlID0gc2hvdWxkTWVyZ2VcbiAgICAgICAgICAgICAgICAmJiBtZXJnZWFibGVDb21tYW5kcy5pbmRleE9mKGUuY29tbWFuZC5uYW1lKSAhPT0gLTE7IC8vIHRoZSBjb21tYW5kIGlzIG1lcmdlYWJsZVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgdGhpcy4kbWVyZ2VVbmRvRGVsdGFzICE9IFwiYWx3YXlzXCJcbiAgICAgICAgICAgICYmIERhdGUubm93KCkgLSB0aGlzLnNlcXVlbmNlU3RhcnRUaW1lID4gMjAwMFxuICAgICAgICApIHtcbiAgICAgICAgICAgIHNob3VsZE1lcmdlID0gZmFsc2U7IC8vIHRoZSBzZXF1ZW5jZSBpcyB0b28gbG9uZ1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZE1lcmdlKVxuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm1lcmdlVW5kb0RlbHRhcyA9IHRydWU7XG4gICAgICAgIGVsc2UgaWYgKG1lcmdlYWJsZUNvbW1hbmRzLmluZGV4T2YoZS5jb21tYW5kLm5hbWUpICE9PSAtMSlcbiAgICAgICAgICAgIHRoaXMuc2VxdWVuY2VTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcga2V5IGhhbmRsZXIsIHN1Y2ggYXMgXCJ2aW1cIiBvciBcIndpbmRvd3NcIi5cbiAgICAgKiBAcGFyYW0ge3N0cmluZ3xIYXNnSGFuZGxlcn0ga2V5Ym9hcmRIYW5kbGVyIFRoZSBuZXcga2V5IGhhbmRsZXJcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRLZXlib2FyZEhhbmRsZXIoa2V5Ym9hcmRIYW5kbGVyOiBzdHJpbmcgfCBIYXNoSGFuZGxlcikge1xuICAgICAgICBpZiAoIWtleWJvYXJkSGFuZGxlcikge1xuICAgICAgICAgICAgdGhpcy5rZXlCaW5kaW5nLnNldEtleWJvYXJkSGFuZGxlcihudWxsKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0eXBlb2Yga2V5Ym9hcmRIYW5kbGVyID09PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICB0aGlzLiRrZXliaW5kaW5nSWQgPSBrZXlib2FyZEhhbmRsZXI7XG4gICAgICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICAgICAgbG9hZE1vZHVsZShbXCJrZXliaW5kaW5nXCIsIGtleWJvYXJkSGFuZGxlcl0sIGZ1bmN0aW9uKG1vZHVsZSkge1xuICAgICAgICAgICAgICAgIGlmIChfc2VsZi4ka2V5YmluZGluZ0lkID09IGtleWJvYXJkSGFuZGxlcilcbiAgICAgICAgICAgICAgICAgICAgX3NlbGYua2V5QmluZGluZy5zZXRLZXlib2FyZEhhbmRsZXIobW9kdWxlICYmIG1vZHVsZS5oYW5kbGVyKTtcbiAgICAgICAgICAgIH0sIHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4ka2V5YmluZGluZ0lkID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMua2V5QmluZGluZy5zZXRLZXlib2FyZEhhbmRsZXIoa2V5Ym9hcmRIYW5kbGVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGtleWJvYXJkIGhhbmRsZXIsIHN1Y2ggYXMgXCJ2aW1cIiBvciBcIndpbmRvd3NcIi5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICpcbiAgICAgKi9cbiAgICBnZXRLZXlib2FyZEhhbmRsZXIoKTogSGFzaEhhbmRsZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5rZXlCaW5kaW5nLmdldEtleWJvYXJkSGFuZGxlcigpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuZXZlciB0aGUgW1tFZGl0U2Vzc2lvbl1dIGNoYW5nZXMuXG4gICAgICogQGV2ZW50IGNoYW5nZVNlc3Npb25cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZSBBbiBvYmplY3Qgd2l0aCB0d28gcHJvcGVydGllcywgYG9sZFNlc3Npb25gIGFuZCBgc2Vzc2lvbmAsIHRoYXQgcmVwcmVzZW50IHRoZSBvbGQgYW5kIG5ldyBbW0VkaXRTZXNzaW9uXV1zLlxuICAgICAqXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcgZWRpdHNlc3Npb24gdG8gdXNlLiBUaGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNlc3Npb24nYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge0VkaXRTZXNzaW9ufSBzZXNzaW9uIFRoZSBuZXcgc2Vzc2lvbiB0byB1c2VcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRTZXNzaW9uKHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24gPT0gc2Vzc2lvbilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgb2xkU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgaWYgKG9sZFNlc3Npb24pIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VcIiwgdGhpcy4kb25Eb2N1bWVudENoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlTW9kZVwiLCB0aGlzLiRvbkNoYW5nZU1vZGUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcInRva2VuaXplclVwZGF0ZVwiLCB0aGlzLiRvblRva2VuaXplclVwZGF0ZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlVGFiU2l6ZVwiLCB0aGlzLiRvbkNoYW5nZVRhYlNpemUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVdyYXBMaW1pdFwiLCB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlV3JhcE1vZGVcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwib25DaGFuZ2VGb2xkXCIsIHRoaXMuJG9uQ2hhbmdlRm9sZCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlRnJvbnRNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlcik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlQmFja01hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZUJyZWFrcG9pbnRcIiwgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlT3ZlcndyaXRlXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VTY3JvbGxUb3BcIiwgdGhpcy4kb25TY3JvbGxUb3BDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVNjcm9sbExlZnRcIiwgdGhpcy4kb25TY3JvbGxMZWZ0Q2hhbmdlKTtcblxuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5vZmYoXCJjaGFuZ2VDdXJzb3JcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuICAgICAgICAgICAgc2VsZWN0aW9uLm9mZihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvblNlbGVjdGlvbkNoYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoc2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy4kb25Eb2N1bWVudENoYW5nZSA9IHRoaXMub25Eb2N1bWVudENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlID0gdGhpcy5vbkNoYW5nZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlTW9kZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlID0gdGhpcy5vblRva2VuaXplclVwZGF0ZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcInRva2VuaXplclVwZGF0ZVwiLCB0aGlzLiRvblRva2VuaXplclVwZGF0ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSA9IHRoaXMucmVuZGVyZXIub25DaGFuZ2VUYWJTaXplLmJpbmQodGhpcy5yZW5kZXJlcik7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlVGFiU2l6ZVwiLCB0aGlzLiRvbkNoYW5nZVRhYlNpemUpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCA9IHRoaXMub25DaGFuZ2VXcmFwTGltaXQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VXcmFwTGltaXRcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTGltaXQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlID0gdGhpcy5vbkNoYW5nZVdyYXBNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlV3JhcE1vZGVcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlRm9sZCA9IHRoaXMub25DaGFuZ2VGb2xkLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLiRvbkNoYW5nZUZvbGQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyID0gdGhpcy5vbkNoYW5nZUZyb250TWFya2VyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlRnJvbnRNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlcik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlciA9IHRoaXMub25DaGFuZ2VCYWNrTWFya2VyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlQmFja01hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQgPSB0aGlzLm9uQ2hhbmdlQnJlYWtwb2ludC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZUJyZWFrcG9pbnRcIiwgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50KTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uID0gdGhpcy5vbkNoYW5nZUFubm90YXRpb24uYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlID0gdGhpcy5vbkN1cnNvckNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZU92ZXJ3cml0ZVwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2Nyb2xsVG9wQ2hhbmdlID0gdGhpcy5vblNjcm9sbFRvcENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZVNjcm9sbFRvcFwiLCB0aGlzLiRvblNjcm9sbFRvcENoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2Nyb2xsTGVmdENoYW5nZSA9IHRoaXMub25TY3JvbGxMZWZ0Q2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCB0aGlzLiRvblNjcm9sbExlZnRDaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IHNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5vbihcImNoYW5nZUN1cnNvclwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlID0gdGhpcy5vblNlbGVjdGlvbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlTW9kZSh2b2lkIDAsIHRoaXMuc2Vzc2lvbik7XG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICAgICAgdGhpcy5vbkN1cnNvckNoYW5nZSh2b2lkIDAsIHRoaXMuc2Vzc2lvbik7XG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgICAgICB0aGlzLm9uU2Nyb2xsVG9wQ2hhbmdlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25TY3JvbGxMZWZ0Q2hhbmdlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcblxuICAgICAgICAgICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoaXMuc2VsZWN0aW9uKTtcblxuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUZyb250TWFya2VyKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VCYWNrTWFya2VyKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VCcmVha3BvaW50KHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VBbm5vdGF0aW9uKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLnJlbmRlcmVyLmFkanVzdFdyYXBMaW1pdCgpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGdWxsKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTZXNzaW9uXCIsIHtcbiAgICAgICAgICAgIHNlc3Npb246IHNlc3Npb24sXG4gICAgICAgICAgICBvbGRTZXNzaW9uOiBvbGRTZXNzaW9uXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG9sZFNlc3Npb24gJiYgb2xkU2Vzc2lvbi5fc2lnbmFsKFwiY2hhbmdlRWRpdG9yXCIsIHsgb2xkRWRpdG9yOiB0aGlzIH0pO1xuICAgICAgICBzZXNzaW9uICYmIHNlc3Npb24uX3NpZ25hbChcImNoYW5nZUVkaXRvclwiLCB7IGVkaXRvcjogdGhpcyB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlc3Npb24gYmVpbmcgdXNlZC5cbiAgICAgKiBAcmV0dXJucyB7RWRpdFNlc3Npb259XG4gICAgICoqL1xuICAgIGdldFNlc3Npb24oKTogRWRpdFNlc3Npb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgZG9jdW1lbnQgdG8gYHZhbGAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHZhbCBUaGUgbmV3IHZhbHVlIHRvIHNldCBmb3IgdGhlIGRvY3VtZW50XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGN1cnNvclBvcyBXaGVyZSB0byBzZXQgdGhlIG5ldyB2YWx1ZS4gYHVuZGVmaW5lZGAgb3IgMCBpcyBzZWxlY3RBbGwsIC0xIGlzIGF0IHRoZSBkb2N1bWVudCBzdGFydCwgYW5kICsxIGlzIGF0IHRoZSBlbmRcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBjdXJyZW50IGRvY3VtZW50IHZhbHVlXG4gICAgICogQHJlbGF0ZWQgRG9jdW1lbnQuc2V0VmFsdWVcbiAgICAgKiovXG4gICAgc2V0VmFsdWUodmFsOiBzdHJpbmcsIGN1cnNvclBvcz86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Muc2V0VmFsdWUodmFsKTtcblxuICAgICAgICBpZiAoIWN1cnNvclBvcykge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGwoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjdXJzb3JQb3MgPT0gKzEpIHtcbiAgICAgICAgICAgIHRoaXMubmF2aWdhdGVGaWxlRW5kKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY3Vyc29yUG9zID09IC0xKSB7XG4gICAgICAgICAgICB0aGlzLm5hdmlnYXRlRmlsZVN0YXJ0KCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogUmF0aGVyIGNyYXp5ISBFaXRoZXIgcmV0dXJuIHRoaXMgb3IgdGhlIGZvcm1lciB2YWx1ZT9cbiAgICAgICAgcmV0dXJuIHZhbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlc3Npb24ncyBjb250ZW50LlxuICAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICAqKi9cbiAgICBnZXRWYWx1ZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQgc2VsZWN0aW9uLlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBoaWdobGlnaHRlZCBzZWxlY3Rpb25cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHJlc2l6ZVxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIHJlY29tcHV0ZXMgdGhlIHNpemUsIGV2ZW4gaWYgdGhlIGhlaWdodCBhbmQgd2lkdGggaGF2ZW4ndCBjaGFuZ2VkLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcmVzaXplKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLm9uUmVzaXplKGZvcmNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZX1cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGhlbWUgVGhlIHBhdGggdG8gYSB0aGVtZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIG9wdGlvbmFsIGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZW1lIGlzIGxvYWRlZFxuICAgICAqKi9cbiAgICBzZXRUaGVtZSh0aGVtZTogc3RyaW5nLCBjYj86ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRUaGVtZSh0aGVtZSwgY2IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLmdldFRoZW1lfVxuICAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIHNldCB0aGVtZVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZVxuICAgICAqKi9cbiAgICBnZXRUaGVtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRUaGVtZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZVxuICAgICAqKi9cbiAgICBzZXRTdHlsZShzdHlsZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U3R5bGUoc3R5bGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGV9XG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGVcbiAgICAgKiovXG4gICAgdW5zZXRTdHlsZShzdHlsZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudW5zZXRTdHlsZShzdHlsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgY3VycmVudCBmb250IHNpemUgb2YgdGhlIGVkaXRvciB0ZXh0LlxuICAgICAqL1xuICAgIGdldEZvbnRTaXplKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImZvbnRTaXplXCIpIHx8IGNvbXB1dGVkU3R5bGUodGhpcy5jb250YWluZXIsIFwiZm9udFNpemVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGEgbmV3IGZvbnQgc2l6ZSAoaW4gcGl4ZWxzKSBmb3IgdGhlIGVkaXRvciB0ZXh0LlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBmb250U2l6ZSBBIGZvbnQgc2l6ZSAoIF9lLmcuXyBcIjEycHhcIilcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHNldEZvbnRTaXplKGZvbnRTaXplOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmb250U2l6ZVwiLCBmb250U2l6ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0QnJhY2tldHMoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVNYXJrZXIodGhpcy5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCA9IHZvaWQgMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiRoaWdobGlnaHRQZW5kaW5nKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwZXJmb3JtIGhpZ2hsaWdodCBhc3luYyB0byBub3QgYmxvY2sgdGhlIGJyb3dzZXIgZHVyaW5nIG5hdmlnYXRpb25cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLiRoaWdobGlnaHRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuJGhpZ2hsaWdodFBlbmRpbmcgPSBmYWxzZTtcblxuICAgICAgICAgICAgdmFyIHBvcyA9IHNlbGYuc2Vzc2lvbi5maW5kTWF0Y2hpbmdCcmFja2V0KHNlbGYuZ2V0Q3Vyc29yUG9zaXRpb24oKSk7XG4gICAgICAgICAgICBpZiAocG9zKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKHBvcy5yb3csIHBvcy5jb2x1bW4sIHBvcy5yb3csIHBvcy5jb2x1bW4gKyAxKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc2VsZi5zZXNzaW9uLiRtb2RlLmdldE1hdGNoaW5nKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlOiBSYW5nZSA9IHNlbGYuc2Vzc2lvbi4kbW9kZS5nZXRNYXRjaGluZyhzZWxmLnNlc3Npb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJhbmdlKVxuICAgICAgICAgICAgICAgIHNlbGYuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCA9IHNlbGYuc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2JyYWNrZXRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICB9LCA1MCk7XG4gICAgfVxuXG4gICAgLy8gdG9kbzogbW92ZSB0byBtb2RlLmdldE1hdGNoaW5nXG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0VGFncygpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgaWYgKHRoaXMuJGhpZ2hsaWdodFRhZ1BlbmRpbmcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHBlcmZvcm0gaGlnaGxpZ2h0IGFzeW5jIHRvIG5vdCBibG9jayB0aGUgYnJvd3NlciBkdXJpbmcgbmF2aWdhdGlvblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodFRhZ1BlbmRpbmcgPSB0cnVlO1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi4kaGlnaGxpZ2h0VGFnUGVuZGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICB2YXIgcG9zID0gc2VsZi5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3Ioc2VsZi5zZXNzaW9uLCBwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuXG4gICAgICAgICAgICBpZiAoIXRva2VuIHx8IHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiR0YWdIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uJHRhZ0hpZ2hsaWdodCA9IG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdGFnID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICB2YXIgZGVwdGggPSAwO1xuICAgICAgICAgICAgdmFyIHByZXZUb2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuXG4gICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09ICc8Jykge1xuICAgICAgICAgICAgICAgIC8vZmluZCBjbG9zaW5nIHRhZ1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldlRva2VuID0gdG9rZW47XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiBkZXB0aCA+PSAwKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy9maW5kIG9wZW5pbmcgdGFnXG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHByZXZUb2tlbjtcbiAgICAgICAgICAgICAgICAgICAgcHJldlRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnZhbHVlID09PSB0YWcgJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPC8nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGgtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHByZXZUb2tlbiAmJiBkZXB0aCA8PSAwKTtcblxuICAgICAgICAgICAgICAgIC8vc2VsZWN0IHRhZyBhZ2FpblxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghdG9rZW4pIHtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiR0YWdIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uJHRhZ0hpZ2hsaWdodCA9IG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcm93ID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCk7XG4gICAgICAgICAgICB2YXIgY29sdW1uID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCk7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2Uocm93LCBjb2x1bW4sIHJvdywgY29sdW1uICsgdG9rZW4udmFsdWUubGVuZ3RoKTtcblxuICAgICAgICAgICAgLy9yZW1vdmUgcmFuZ2UgaWYgZGlmZmVyZW50XG4gICAgICAgICAgICBpZiAoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ICYmIHJhbmdlLmNvbXBhcmVSYW5nZShzZXNzaW9uLiRiYWNrTWFya2Vyc1tzZXNzaW9uLiR0YWdIaWdobGlnaHRdLnJhbmdlKSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJhbmdlICYmICFzZXNzaW9uLiR0YWdIaWdobGlnaHQpXG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2JyYWNrZXRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICB9LCA1MCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBCcmluZ3MgdGhlIGN1cnJlbnQgYHRleHRJbnB1dGAgaW50byBmb2N1cy5cbiAgICAgKiovXG4gICAgZm9jdXMoKSB7XG4gICAgICAgIC8vIFNhZmFyaSBuZWVkcyB0aGUgdGltZW91dFxuICAgICAgICAvLyBpT1MgYW5kIEZpcmVmb3ggbmVlZCBpdCBjYWxsZWQgaW1tZWRpYXRlbHlcbiAgICAgICAgLy8gdG8gYmUgb24gdGhlIHNhdmUgc2lkZSB3ZSBkbyBib3RoXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBfc2VsZi50ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudGV4dElucHV0LmZvY3VzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGN1cnJlbnQgYHRleHRJbnB1dGAgaXMgaW4gZm9jdXMuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy50ZXh0SW5wdXQuaXNGb2N1c2VkKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBCbHVycyB0aGUgY3VycmVudCBgdGV4dElucHV0YC5cbiAgICAgKiovXG4gICAgYmx1cigpIHtcbiAgICAgICAgdGhpcy50ZXh0SW5wdXQuYmx1cigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgb25jZSB0aGUgZWRpdG9yIGNvbWVzIGludG8gZm9jdXMuXG4gICAgICogQGV2ZW50IGZvY3VzXG4gICAgICpcbiAgICAgKiovXG4gICAgb25Gb2N1cygpIHtcbiAgICAgICAgaWYgKHRoaXMuJGlzRm9jdXNlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGlzRm9jdXNlZCA9IHRydWU7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hvd0N1cnNvcigpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnZpc3VhbGl6ZUZvY3VzKCk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJmb2N1c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIG9uY2UgdGhlIGVkaXRvciBoYXMgYmVlbiBibHVycmVkLlxuICAgICAqIEBldmVudCBibHVyXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBvbkJsdXIoKSB7XG4gICAgICAgIGlmICghdGhpcy4kaXNGb2N1c2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaXNGb2N1c2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuaGlkZUN1cnNvcigpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnZpc3VhbGl6ZUJsdXIoKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImJsdXJcIik7XG4gICAgfVxuXG4gICAgJGN1cnNvckNoYW5nZSgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW5ldmVyIHRoZSBkb2N1bWVudCBpcyBjaGFuZ2VkLlxuICAgICAqIEBldmVudCBjaGFuZ2VcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZSBDb250YWlucyBhIHNpbmdsZSBwcm9wZXJ0eSwgYGRhdGFgLCB3aGljaCBoYXMgdGhlIGRlbHRhIG9mIGNoYW5nZXNcbiAgICAgKlxuICAgICAqKi9cbiAgICBvbkRvY3VtZW50Q2hhbmdlKGUsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHZhciByYW5nZSA9IGRlbHRhLnJhbmdlO1xuICAgICAgICB2YXIgbGFzdFJvdzogbnVtYmVyO1xuXG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdyAmJiBkZWx0YS5hY3Rpb24gIT0gXCJpbnNlcnRMaW5lc1wiICYmIGRlbHRhLmFjdGlvbiAhPSBcInJlbW92ZUxpbmVzXCIpXG4gICAgICAgICAgICBsYXN0Um93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgbGFzdFJvdyA9IEluZmluaXR5O1xuXG4gICAgICAgIHZhciByOiBWaXJ0dWFsUmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVyO1xuICAgICAgICByLnVwZGF0ZUxpbmVzKHJhbmdlLnN0YXJ0LnJvdywgbGFzdFJvdywgdGhpcy5zZXNzaW9uLiR1c2VXcmFwTW9kZSk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlXCIsIGUpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBjdXJzb3IgYmVjYXVzZSB0YWIgY2hhcmFjdGVycyBjYW4gaW5mbHVlbmNlIHRoZSBjdXJzb3IgcG9zaXRpb25cbiAgICAgICAgdGhpcy4kY3Vyc29yQ2hhbmdlKCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICB9XG5cbiAgICBvblRva2VuaXplclVwZGF0ZShldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHZhciByb3dzID0gZXZlbnQuZGF0YTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVMaW5lcyhyb3dzLmZpcnN0LCByb3dzLmxhc3QpO1xuICAgIH1cblxuXG4gICAgb25TY3JvbGxUb3BDaGFuZ2UoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvWSh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkpO1xuICAgIH1cblxuICAgIG9uU2Nyb2xsTGVmdENoYW5nZShldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9YKHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhhbmRsZXIgZm9yIGN1cnNvciBvciBzZWxlY3Rpb24gY2hhbmdlcy5cbiAgICAgKi9cbiAgICBvbkN1cnNvckNoYW5nZShldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMuJGN1cnNvckNoYW5nZSgpO1xuXG4gICAgICAgIGlmICghdGhpcy4kYmxvY2tTY3JvbGxpbmcpIHtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodEJyYWNrZXRzKCk7XG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodFRhZ3MoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICAvLyBUT0RPOyBIb3cgaXMgc2lnbmFsIGRpZmZlcmVudCBmcm9tIGVtaXQ/XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKSB7XG5cbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG5cbiAgICAgICAgdmFyIGhpZ2hsaWdodDtcbiAgICAgICAgaWYgKHRoaXMuJGhpZ2hsaWdodEFjdGl2ZUxpbmUpIHtcbiAgICAgICAgICAgIGlmICgodGhpcy4kc2VsZWN0aW9uU3R5bGUgIT0gXCJsaW5lXCIgfHwgIXRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkpKSB7XG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0ID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlbmRlcmVyLiRtYXhMaW5lcyAmJiBzZXNzaW9uLmdldExlbmd0aCgpID09PSAxICYmICEocmVuZGVyZXIuJG1pbkxpbmVzID4gMSkpIHtcbiAgICAgICAgICAgICAgICBoaWdobGlnaHQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyICYmICFoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIubWFya2VySWQpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgJiYgaGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlID0gbmV3IFJhbmdlKGhpZ2hsaWdodC5yb3csIGhpZ2hsaWdodC5jb2x1bW4sIGhpZ2hsaWdodC5yb3csIEluZmluaXR5KTtcbiAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2FjdGl2ZS1saW5lXCIsIFwic2NyZWVuTGluZVwiKTtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgPSByYW5nZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuc3RhcnQucm93ID0gaGlnaGxpZ2h0LnJvdztcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuZW5kLnJvdyA9IGhpZ2hsaWdodC5yb3c7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLnN0YXJ0LmNvbHVtbiA9IGhpZ2hsaWdodC5jb2x1bW47XG4gICAgICAgICAgICBzZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhpcyB2ZXJzaW9uIGhhcyBub3QgYmVlbiBib3VuZCB0byBgdGhpc2AsIHNvIGRvbid0IHVzZSBpdCBkaXJlY3RseS5cbiAgICBwcml2YXRlIG9uU2VsZWN0aW9uQ2hhbmdlKGV2ZW50LCBzZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICBpZiAodHlwZW9mIHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlcik7XG4gICAgICAgICAgICBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLmdldFNlbGVjdGlvblN0eWxlKCk7XG4gICAgICAgICAgICBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2Vfc2VsZWN0aW9uXCIsIHN0eWxlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZSA9IHRoaXMuJGhpZ2hsaWdodFNlbGVjdGVkV29yZCAmJiB0aGlzLiRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmhpZ2hsaWdodChyZSk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgIH1cblxuICAgICRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAoKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpIHx8IHNlbGVjdGlvbi5pc011bHRpTGluZSgpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBzdGFydE91dGVyID0gc2VsZWN0aW9uLnN0YXJ0LmNvbHVtbiAtIDE7XG4gICAgICAgIHZhciBlbmRPdXRlciA9IHNlbGVjdGlvbi5lbmQuY29sdW1uICsgMTtcbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoc2VsZWN0aW9uLnN0YXJ0LnJvdyk7XG4gICAgICAgIHZhciBsaW5lQ29scyA9IGxpbmUubGVuZ3RoO1xuICAgICAgICB2YXIgbmVlZGxlID0gbGluZS5zdWJzdHJpbmcoTWF0aC5tYXgoc3RhcnRPdXRlciwgMCksXG4gICAgICAgICAgICBNYXRoLm1pbihlbmRPdXRlciwgbGluZUNvbHMpKTtcblxuICAgICAgICAvLyBNYWtlIHN1cmUgdGhlIG91dGVyIGNoYXJhY3RlcnMgYXJlIG5vdCBwYXJ0IG9mIHRoZSB3b3JkLlxuICAgICAgICBpZiAoKHN0YXJ0T3V0ZXIgPj0gMCAmJiAvXltcXHdcXGRdLy50ZXN0KG5lZWRsZSkpIHx8XG4gICAgICAgICAgICAoZW5kT3V0ZXIgPD0gbGluZUNvbHMgJiYgL1tcXHdcXGRdJC8udGVzdChuZWVkbGUpKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBuZWVkbGUgPSBsaW5lLnN1YnN0cmluZyhzZWxlY3Rpb24uc3RhcnQuY29sdW1uLCBzZWxlY3Rpb24uZW5kLmNvbHVtbik7XG4gICAgICAgIGlmICghL15bXFx3XFxkXSskLy50ZXN0KG5lZWRsZSkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHJlID0gdGhpcy4kc2VhcmNoLiRhc3NlbWJsZVJlZ0V4cCh7XG4gICAgICAgICAgICB3aG9sZVdvcmQ6IHRydWUsXG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlOiB0cnVlLFxuICAgICAgICAgICAgbmVlZGxlOiBuZWVkbGVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VGcm9udE1hcmtlcihldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlRnJvbnRNYXJrZXJzKCk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VCYWNrTWFya2VyKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCYWNrTWFya2VycygpO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VCcmVha3BvaW50KGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCcmVha3BvaW50cygpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlQnJlYWtwb2ludFwiLCBldmVudCk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VBbm5vdGF0aW9uKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRBbm5vdGF0aW9ucyhlZGl0U2Vzc2lvbi5nZXRBbm5vdGF0aW9ucygpKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZUFubm90YXRpb25cIiwgZXZlbnQpO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VNb2RlKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVUZXh0KCk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VNb2RlXCIsIGV2ZW50KTtcbiAgICB9XG5cblxuICAgIG9uQ2hhbmdlV3JhcExpbWl0KGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGdWxsKCk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VXcmFwTW9kZShldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIub25SZXNpemUodHJ1ZSk7XG4gICAgfVxuXG5cbiAgICBvbkNoYW5nZUZvbGQoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGFjdGl2ZSBsaW5lIG1hcmtlciBhcyBkdWUgdG8gZm9sZGluZyBjaGFuZ2VzIHRoZSBjdXJyZW50XG4gICAgICAgIC8vIGxpbmUgcmFuZ2Ugb24gdGhlIHNjcmVlbiBtaWdodCBoYXZlIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgLy8gVE9ETzogVGhpcyBtaWdodCBiZSB0b28gbXVjaCB1cGRhdGluZy4gT2theSBmb3Igbm93LlxuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGV4dCBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0ZWRUZXh0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbiB0ZXh0IGlzIGNvcGllZC5cbiAgICAgKiBAZXZlbnQgY29weVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBjb3BpZWQgdGV4dFxuICAgICAqXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBvZiB0ZXh0IGN1cnJlbnRseSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqIEBkZXByZWNhdGVkIFVzZSBnZXRTZWxlY3RlZFRleHQgaW5zdGVhZC5cbiAgICAgKiovXG4gICAgZ2V0Q29weVRleHQoKSB7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5nZXRTZWxlY3RlZFRleHQoKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY29weVwiLCB0ZXh0KTtcbiAgICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImNvcHlcIiBoYXBwZW5zLlxuICAgICAqKi9cbiAgICBvbkNvcHkoKSB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhcImNvcHlcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImN1dFwiIGhhcHBlbnMuXG4gICAgICoqL1xuICAgIG9uQ3V0KCkge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoXCJjdXRcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgcGFzdGVkLlxuICAgICAqIEBldmVudCBwYXN0ZVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBwYXN0ZWQgdGV4dFxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcInBhc3RlXCIgaGFwcGVucy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgcGFzdGVkIHRleHRcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uUGFzdGUodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIC8vIHRvZG8gdGhpcyBzaG91bGQgY2hhbmdlIHdoZW4gcGFzdGUgYmVjb21lcyBhIGNvbW1hbmRcbiAgICAgICAgaWYgKHRoaXMuJHJlYWRPbmx5KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgZSA9IHsgdGV4dDogdGV4dCB9O1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJwYXN0ZVwiLCBlKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoZS50ZXh0LCB0cnVlKTtcbiAgICB9XG5cblxuICAgIGV4ZWNDb21tYW5kKGNvbW1hbmQsIGFyZ3M/KTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhjb21tYW5kLCB0aGlzLCBhcmdzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGB0ZXh0YCBpbnRvIHdoZXJldmVyIHRoZSBjdXJzb3IgaXMgcG9pbnRpbmcuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIG5ldyB0ZXh0IHRvIGFkZFxuICAgICAqXG4gICAgICoqL1xuICAgIGluc2VydCh0ZXh0OiBzdHJpbmcsIHBhc3RlZD86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciBtb2RlID0gc2Vzc2lvbi5nZXRNb2RlKCk7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuZ2V0QmVoYXZpb3Vyc0VuYWJsZWQoKSAmJiAhcGFzdGVkKSB7XG4gICAgICAgICAgICAvLyBHZXQgYSB0cmFuc2Zvcm0gaWYgdGhlIGN1cnJlbnQgbW9kZSB3YW50cyBvbmUuXG4gICAgICAgICAgICB2YXIgdHJhbnNmb3JtID0gbW9kZS50cmFuc2Zvcm1BY3Rpb24oc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KSwgJ2luc2VydGlvbicsIHRoaXMsIHNlc3Npb24sIHRleHQpO1xuICAgICAgICAgICAgaWYgKHRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0ICE9PSB0cmFuc2Zvcm0udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb24ubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1lcmdlTmV4dENvbW1hbmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGV4dCA9IHRyYW5zZm9ybS50ZXh0O1xuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGV4dCA9PSBcIlxcdFwiKVxuICAgICAgICAgICAgdGV4dCA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKTtcblxuICAgICAgICAvLyByZW1vdmUgc2VsZWN0ZWQgdGV4dFxuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICAgICAgY3Vyc29yID0gdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5zZXNzaW9uLmdldE92ZXJ3cml0ZSgpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGN1cnNvciwgY3Vyc29yKTtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gKz0gdGV4dC5sZW5ndGg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0ZXh0ID09IFwiXFxuXCIgfHwgdGV4dCA9PSBcIlxcclxcblwiKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgICAgIGlmIChjdXJzb3IuY29sdW1uID4gbGluZS5zZWFyY2goL1xcU3wkLykpIHtcbiAgICAgICAgICAgICAgICB2YXIgZCA9IGxpbmUuc3Vic3RyKGN1cnNvci5jb2x1bW4pLnNlYXJjaCgvXFxTfCQvKTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmRvYy5yZW1vdmVJbkxpbmUoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbiwgY3Vyc29yLmNvbHVtbiArIGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcblxuICAgICAgICB2YXIgc3RhcnQgPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICB2YXIgbGluZVN0YXRlID0gc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBzaG91bGRPdXRkZW50ID0gbW9kZS5jaGVja091dGRlbnQobGluZVN0YXRlLCBsaW5lLCB0ZXh0KTtcbiAgICAgICAgdmFyIGVuZCA9IHNlc3Npb24uaW5zZXJ0KGN1cnNvciwgdGV4dCk7XG5cbiAgICAgICAgaWYgKHRyYW5zZm9ybSAmJiB0cmFuc2Zvcm0uc2VsZWN0aW9uKSB7XG4gICAgICAgICAgICBpZiAodHJhbnNmb3JtLnNlbGVjdGlvbi5sZW5ndGggPT0gMikgeyAvLyBUcmFuc2Zvcm0gcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgY29sdW1uXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBSYW5nZShjdXJzb3Iucm93LCBzdGFydCArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJzb3Iucm93LCBzdGFydCArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMV0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7IC8vIFRyYW5zZm9ybSByZWxhdGl2ZSB0byB0aGUgY3VycmVudCByb3cuXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBSYW5nZShjdXJzb3Iucm93ICsgdHJhbnNmb3JtLnNlbGVjdGlvblswXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybS5zZWxlY3Rpb25bMV0sXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJzb3Iucm93ICsgdHJhbnNmb3JtLnNlbGVjdGlvblsyXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybS5zZWxlY3Rpb25bM10pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZXNzaW9uLmdldERvY3VtZW50KCkuaXNOZXdMaW5lKHRleHQpKSB7XG4gICAgICAgICAgICB2YXIgbGluZUluZGVudCA9IG1vZGUuZ2V0TmV4dExpbmVJbmRlbnQobGluZVN0YXRlLCBsaW5lLnNsaWNlKDAsIGN1cnNvci5jb2x1bW4pLCBzZXNzaW9uLmdldFRhYlN0cmluZygpKTtcblxuICAgICAgICAgICAgc2Vzc2lvbi5pbnNlcnQoeyByb3c6IGN1cnNvci5yb3cgKyAxLCBjb2x1bW46IDAgfSwgbGluZUluZGVudCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNob3VsZE91dGRlbnQpXG4gICAgICAgICAgICBtb2RlLmF1dG9PdXRkZW50KGxpbmVTdGF0ZSwgc2Vzc2lvbiwgY3Vyc29yLnJvdyk7XG4gICAgfVxuXG4gICAgb25UZXh0SW5wdXQodGV4dDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMua2V5QmluZGluZy5vblRleHRJbnB1dCh0ZXh0KTtcbiAgICAgICAgLy8gVE9ETzogVGhpcyBzaG91bGQgYmUgcGx1Z2dhYmxlLlxuICAgICAgICBpZiAodGV4dCA9PT0gJy4nKSB7XG4gICAgICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoQ09NTUFORF9OQU1FX0FVVE9fQ09NUExFVEUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuZ2V0U2Vzc2lvbigpLmdldERvY3VtZW50KCkuaXNOZXdMaW5lKHRleHQpKSB7XG4gICAgICAgICAgICB2YXIgbGluZU51bWJlciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICAvLyAgICAgICAgICAgIHZhciBvcHRpb24gPSBuZXcgU2VydmljZXMuRWRpdG9yT3B0aW9ucygpO1xuICAgICAgICAgICAgLy8gICAgICAgICAgICBvcHRpb24uTmV3TGluZUNoYXJhY3RlciA9IFwiXFxuXCI7XG4gICAgICAgICAgICAvLyBGSVhNRTogU21hcnQgSW5kZW50aW5nXG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgdmFyIGluZGVudCA9IGxhbmd1YWdlU2VydmljZS5nZXRTbWFydEluZGVudEF0TGluZU51bWJlcihjdXJyZW50RmlsZU5hbWUsIGxpbmVOdW1iZXIsIG9wdGlvbik7XG4gICAgICAgICAgICBpZihpbmRlbnQgPiAwKVxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGVkaXRvci5jb21tYW5kcy5leGVjKFwiaW5zZXJ0dGV4dFwiLCBlZGl0b3IsIHt0ZXh0OlwiIFwiLCB0aW1lczppbmRlbnR9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgICovXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvbkNvbW1hbmRLZXkoZSwgaGFzaElkOiBudW1iZXIsIGtleUNvZGU6IG51bWJlcikge1xuICAgICAgICB0aGlzLmtleUJpbmRpbmcub25Db21tYW5kS2V5KGUsIGhhc2hJZCwga2V5Q29kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFzcyBpbiBgdHJ1ZWAgdG8gZW5hYmxlIG92ZXJ3cml0ZXMgaW4geW91ciBzZXNzaW9uLCBvciBgZmFsc2VgIHRvIGRpc2FibGUuIElmIG92ZXJ3cml0ZXMgaXMgZW5hYmxlZCwgYW55IHRleHQgeW91IGVudGVyIHdpbGwgdHlwZSBvdmVyIGFueSB0ZXh0IGFmdGVyIGl0LiBJZiB0aGUgdmFsdWUgb2YgYG92ZXJ3cml0ZWAgY2hhbmdlcywgdGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYGNoYW5nZU92ZXJ3cml0ZWAgZXZlbnQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBvdmVyd3JpdGUgRGVmaW5lcyB3aGV0ZXIgb3Igbm90IHRvIHNldCBvdmVyd3JpdGVzXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnNldE92ZXJ3cml0ZVxuICAgICAqKi9cbiAgICBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRPdmVyd3JpdGUob3ZlcndyaXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgZ2V0T3ZlcndyaXRlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldE92ZXJ3cml0ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHZhbHVlIG9mIG92ZXJ3cml0ZSB0byB0aGUgb3Bwb3NpdGUgb2Ygd2hhdGV2ZXIgaXQgY3VycmVudGx5IGlzLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnRvZ2dsZU92ZXJ3cml0ZVxuICAgICAqKi9cbiAgICB0b2dnbGVPdmVyd3JpdGUoKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGhvdyBmYXN0IHRoZSBtb3VzZSBzY3JvbGxpbmcgc2hvdWxkIGRvLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzcGVlZCBBIHZhbHVlIGluZGljYXRpbmcgdGhlIG5ldyBzcGVlZCAoaW4gbWlsbGlzZWNvbmRzKVxuICAgICAqKi9cbiAgICBzZXRTY3JvbGxTcGVlZChzcGVlZDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2Nyb2xsU3BlZWRcIiwgc3BlZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHZhbHVlIGluZGljYXRpbmcgaG93IGZhc3QgdGhlIG1vdXNlIHNjcm9sbCBzcGVlZCBpcyAoaW4gbWlsbGlzZWNvbmRzKS5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXRTY3JvbGxTcGVlZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzY3JvbGxTcGVlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBkZWxheSAoaW4gbWlsbGlzZWNvbmRzKSBvZiB0aGUgbW91c2UgZHJhZy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZHJhZ0RlbGF5IEEgdmFsdWUgaW5kaWNhdGluZyB0aGUgbmV3IGRlbGF5XG4gICAgICoqL1xuICAgIHNldERyYWdEZWxheShkcmFnRGVsYXk6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRyYWdEZWxheVwiLCBkcmFnRGVsYXkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbW91c2UgZHJhZyBkZWxheS5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXREcmFnRGVsYXkoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZHJhZ0RlbGF5XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbiB0aGUgc2VsZWN0aW9uIHN0eWxlIGNoYW5nZXMsIHZpYSBbW0VkaXRvci5zZXRTZWxlY3Rpb25TdHlsZV1dLlxuICAgICAqIEBldmVudCBjaGFuZ2VTZWxlY3Rpb25TdHlsZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhIENvbnRhaW5zIG9uZSBwcm9wZXJ0eSwgYGRhdGFgLCB3aGljaCBpbmRpY2F0ZXMgdGhlIG5ldyBzZWxlY3Rpb24gc3R5bGVcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogRHJhdyBzZWxlY3Rpb24gbWFya2VycyBzcGFubmluZyB3aG9sZSBsaW5lLCBvciBvbmx5IG92ZXIgc2VsZWN0ZWQgdGV4dC4gRGVmYXVsdCB2YWx1ZSBpcyBcImxpbmVcIlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBUaGUgbmV3IHNlbGVjdGlvbiBzdHlsZSBcImxpbmVcInxcInRleHRcIlxuICAgICAqXG4gICAgICoqL1xuICAgIHNldFNlbGVjdGlvblN0eWxlKHZhbDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2VsZWN0aW9uU3R5bGVcIiwgdmFsKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBzdHlsZS5cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25TdHlsZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzZWxlY3Rpb25TdHlsZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoZSBjdXJyZW50IGxpbmUgc2hvdWxkIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkSGlnaGxpZ2h0IFNldCB0byBgdHJ1ZWAgdG8gaGlnaGxpZ2h0IHRoZSBjdXJyZW50IGxpbmVcbiAgICAgKiovXG4gICAgc2V0SGlnaGxpZ2h0QWN0aXZlTGluZShzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRBY3RpdmVMaW5lXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgY3VycmVudCBsaW5lcyBhcmUgYWx3YXlzIGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhpZ2hsaWdodEFjdGl2ZUxpbmUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEFjdGl2ZUxpbmVcIik7XG4gICAgfVxuXG4gICAgc2V0SGlnaGxpZ2h0R3V0dGVyTGluZShzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgd29yZCBzaG91bGQgYmUgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG91bGRIaWdobGlnaHQgU2V0IHRvIGB0cnVlYCB0byBoaWdobGlnaHQgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCB3b3JkXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkKHNob3VsZEhpZ2hsaWdodDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodFNlbGVjdGVkV29yZFwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGN1cnJlbnRseSBoaWdobGlnaHRlZCB3b3JkcyBhcmUgdG8gYmUgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhpZ2hsaWdodFNlbGVjdGVkV29yZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGhpZ2hsaWdodFNlbGVjdGVkV29yZDtcbiAgICB9XG5cbiAgICBzZXRBbmltYXRlZFNjcm9sbChzaG91bGRBbmltYXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldEFuaW1hdGVkU2Nyb2xsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHNob3dJbnZpc2libGVzYCBpcyBzZXQgdG8gYHRydWVgLCBpbnZpc2libGUgY2hhcmFjdGVycyZtZGFzaDtsaWtlIHNwYWNlcyBvciBuZXcgbGluZXMmbWRhc2g7YXJlIHNob3cgaW4gdGhlIGVkaXRvci5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dJbnZpc2libGVzIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzaG93IGludmlzaWJsZSBjaGFyYWN0ZXJzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgaW52aXNpYmxlIGNoYXJhY3RlcnMgYXJlIGJlaW5nIHNob3duLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRTaG93SW52aXNpYmxlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMoKTtcbiAgICB9XG5cbiAgICBzZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXMpO1xuICAgIH1cblxuICAgIGdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiBgc2hvd1ByaW50TWFyZ2luYCBpcyBzZXQgdG8gYHRydWVgLCB0aGUgcHJpbnQgbWFyZ2luIGlzIHNob3duIGluIHRoZSBlZGl0b3IuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93UHJpbnRNYXJnaW4gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIHNob3cgdGhlIHByaW50IG1hcmdpblxuICAgICAqKi9cbiAgICBzZXRTaG93UHJpbnRNYXJnaW4oc2hvd1ByaW50TWFyZ2luOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHByaW50IG1hcmdpbiBpcyBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93UHJpbnRNYXJnaW4oKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNob3dQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGNvbHVtbiBkZWZpbmluZyB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIHNob3VsZCBiZS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2hvd1ByaW50TWFyZ2luIFNwZWNpZmllcyB0aGUgbmV3IHByaW50IG1hcmdpblxuICAgICAqL1xuICAgIHNldFByaW50TWFyZ2luQ29sdW1uKHNob3dQcmludE1hcmdpbjogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4oc2hvd1ByaW50TWFyZ2luKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjb2x1bW4gbnVtYmVyIG9mIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gaXMuXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKi9cbiAgICBnZXRQcmludE1hcmdpbkNvbHVtbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRQcmludE1hcmdpbkNvbHVtbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGByZWFkT25seWAgaXMgdHJ1ZSwgdGhlbiB0aGUgZWRpdG9yIGlzIHNldCB0byByZWFkLW9ubHkgbW9kZSwgYW5kIG5vbmUgb2YgdGhlIGNvbnRlbnQgY2FuIGNoYW5nZS5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJlYWRPbmx5IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBlZGl0b3IgY2FuIGJlIG1vZGlmaWVkIG9yIG5vdFxuICAgICAqXG4gICAgICoqL1xuICAgIHNldFJlYWRPbmx5KHJlYWRPbmx5OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwicmVhZE9ubHlcIiwgcmVhZE9ubHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBlZGl0b3IgaXMgc2V0IHRvIHJlYWQtb25seSBtb2RlLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRSZWFkT25seSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwicmVhZE9ubHlcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BlY2lmaWVzIHdoZXRoZXIgdG8gdXNlIGJlaGF2aW9ycyBvciBub3QuIFtcIkJlaGF2aW9yc1wiIGluIHRoaXMgY2FzZSBpcyB0aGUgYXV0by1wYWlyaW5nIG9mIHNwZWNpYWwgY2hhcmFjdGVycywgbGlrZSBxdW90YXRpb24gbWFya3MsIHBhcmVudGhlc2lzLCBvciBicmFja2V0cy5dezogI0JlaGF2aW9yc0RlZn1cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZWQgRW5hYmxlcyBvciBkaXNhYmxlcyBiZWhhdmlvcnNcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRCZWhhdmlvdXJzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiYmVoYXZpb3Vyc0VuYWJsZWRcIiwgZW5hYmxlZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGJlaGF2aW9ycyBhcmUgY3VycmVudGx5IGVuYWJsZWQuIHs6QmVoYXZpb3JzRGVmfVxuICAgICAqXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEJlaGF2aW91cnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJiZWhhdmlvdXJzRW5hYmxlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTcGVjaWZpZXMgd2hldGhlciB0byB1c2Ugd3JhcHBpbmcgYmVoYXZpb3JzIG9yIG5vdCwgaS5lLiBhdXRvbWF0aWNhbGx5IHdyYXBwaW5nIHRoZSBzZWxlY3Rpb24gd2l0aCBjaGFyYWN0ZXJzIHN1Y2ggYXMgYnJhY2tldHNcbiAgICAgKiB3aGVuIHN1Y2ggYSBjaGFyYWN0ZXIgaXMgdHlwZWQgaW4uXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkIEVuYWJsZXMgb3IgZGlzYWJsZXMgd3JhcHBpbmcgYmVoYXZpb3JzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0V3JhcEJlaGF2aW91cnNFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ3cmFwQmVoYXZpb3Vyc0VuYWJsZWRcIiwgZW5hYmxlZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHdyYXBwaW5nIGJlaGF2aW9ycyBhcmUgY3VycmVudGx5IGVuYWJsZWQuXG4gICAgICoqL1xuICAgIGdldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwid3JhcEJlaGF2aW91cnNFbmFibGVkXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyB3aGV0aGVyIHRoZSBmb2xkIHdpZGdldHMgc2hvdWxkIGJlIHNob3duIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3cgU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGZvbGQgd2lkZ2V0cyBhcmUgc2hvd25cbiAgICAgKiovXG4gICAgc2V0U2hvd0ZvbGRXaWRnZXRzKHNob3c6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93Rm9sZFdpZGdldHNcIiwgc2hvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGZvbGQgd2lkZ2V0cyBhcmUgc2hvd24uXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93Rm9sZFdpZGdldHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dGb2xkV2lkZ2V0c1wiKTtcbiAgICB9XG5cbiAgICBzZXRGYWRlRm9sZFdpZGdldHMoZmFkZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiLCBmYWRlKTtcbiAgICB9XG5cbiAgICBnZXRGYWRlRm9sZFdpZGdldHMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHdvcmRzIG9mIHRleHQgZnJvbSB0aGUgZWRpdG9yLiBBIFwid29yZFwiIGlzIGRlZmluZWQgYXMgYSBzdHJpbmcgb2YgY2hhcmFjdGVycyBib29rZW5kZWQgYnkgd2hpdGVzcGFjZS5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZGlyZWN0aW9uIFRoZSBkaXJlY3Rpb24gb2YgdGhlIGRlbGV0aW9uIHRvIG9jY3VyLCBlaXRoZXIgXCJsZWZ0XCIgb3IgXCJyaWdodFwiXG4gICAgICpcbiAgICAgKiovXG4gICAgcmVtb3ZlKGRpcmVjdGlvbjogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIGlmIChkaXJlY3Rpb24gPT0gXCJsZWZ0XCIpXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0TGVmdCgpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFJpZ2h0KCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmICh0aGlzLmdldEJlaGF2aW91cnNFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICAgICAgdmFyIHN0YXRlID0gc2Vzc2lvbi5nZXRTdGF0ZShyYW5nZS5zdGFydC5yb3cpO1xuICAgICAgICAgICAgdmFyIG5ld19yYW5nZSA9IHNlc3Npb24uZ2V0TW9kZSgpLnRyYW5zZm9ybUFjdGlvbihzdGF0ZSwgJ2RlbGV0aW9uJywgdGhpcywgc2Vzc2lvbiwgcmFuZ2UpO1xuXG4gICAgICAgICAgICBpZiAocmFuZ2UuZW5kLmNvbHVtbiA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHZhciB0ZXh0ID0gc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0W3RleHQubGVuZ3RoIC0gMV0gPT0gXCJcXG5cIikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShyYW5nZS5lbmQucm93KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKC9eXFxzKyQvLnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChuZXdfcmFuZ2UpXG4gICAgICAgICAgICAgICAgcmFuZ2UgPSBuZXdfcmFuZ2U7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIHdvcmQgZGlyZWN0bHkgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgcmVtb3ZlV29yZFJpZ2h0KCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZFJpZ2h0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgd29yZCBkaXJlY3RseSB0byB0aGUgbGVmdCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIHJlbW92ZVdvcmRMZWZ0KCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZExlZnQoKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCB0aGUgd29yZHMgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCB1bnRpbCB0aGUgc3RhcnQgb2YgdGhlIGxpbmUuXG4gICAgICoqL1xuICAgIHJlbW92ZVRvTGluZVN0YXJ0KCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0TGluZVN0YXJ0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIHdvcmRzIHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24sIHVudGlsIHRoZSBlbmQgb2YgdGhlIGxpbmUuXG4gICAgICoqL1xuICAgIHJlbW92ZVRvTGluZUVuZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExpbmVFbmQoKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5jb2x1bW4gPT09IHJhbmdlLmVuZC5jb2x1bW4gJiYgcmFuZ2Uuc3RhcnQucm93ID09PSByYW5nZS5lbmQucm93KSB7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3crKztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BsaXRzIHRoZSBsaW5lIGF0IHRoZSBjdXJyZW50IHNlbGVjdGlvbiAoYnkgaW5zZXJ0aW5nIGFuIGAnXFxuJ2ApLlxuICAgICAqKi9cbiAgICBzcGxpdExpbmUoKSB7XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB0aGlzLmluc2VydChcIlxcblwiKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihjdXJzb3IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyYW5zcG9zZXMgY3VycmVudCBsaW5lLlxuICAgICAqKi9cbiAgICB0cmFuc3Bvc2VMZXR0ZXJzKCkge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIGlmIChjb2x1bW4gPT09IDApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHN3YXAsIHJhbmdlO1xuICAgICAgICBpZiAoY29sdW1uIDwgbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHN3YXAgPSBsaW5lLmNoYXJBdChjb2x1bW4pICsgbGluZS5jaGFyQXQoY29sdW1uIC0gMSk7XG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShjdXJzb3Iucm93LCBjb2x1bW4gLSAxLCBjdXJzb3Iucm93LCBjb2x1bW4gKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHN3YXAgPSBsaW5lLmNoYXJBdChjb2x1bW4gLSAxKSArIGxpbmUuY2hhckF0KGNvbHVtbiAtIDIpO1xuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoY3Vyc29yLnJvdywgY29sdW1uIC0gMiwgY3Vyc29yLnJvdywgY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgc3dhcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udmVydHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGVudGlyZWx5IGludG8gbG93ZXJjYXNlLlxuICAgICAqKi9cbiAgICB0b0xvd2VyQ2FzZSgpIHtcbiAgICAgICAgdmFyIG9yaWdpbmFsUmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHRleHQgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHRleHQudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKG9yaWdpbmFsUmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBlbnRpcmVseSBpbnRvIHVwcGVyY2FzZS5cbiAgICAgKiovXG4gICAgdG9VcHBlckNhc2UoKSB7XG4gICAgICAgIHZhciBvcmlnaW5hbFJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCB0ZXh0LnRvVXBwZXJDYXNlKCkpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShvcmlnaW5hbFJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGFuIGluZGVudGF0aW9uIGludG8gdGhlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uIG9yIGluZGVudHMgdGhlIHNlbGVjdGVkIGxpbmVzLlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uaW5kZW50Um93c1xuICAgICAqKi9cbiAgICBpbmRlbnQoKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG5cbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA8IHJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICBzZXNzaW9uLmluZGVudFJvd3Mocm93cy5maXJzdCwgcm93cy5sYXN0LCBcIlxcdFwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChyYW5nZS5zdGFydC5jb2x1bW4gPCByYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICghL15cXHMrJC8udGVzdCh0ZXh0KSkge1xuICAgICAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5pbmRlbnRSb3dzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCwgXCJcXHRcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUocmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBzaXplID0gc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgIHZhciBjb2x1bW4gPSBzZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zaXRpb24ucm93LCBwb3NpdGlvbi5jb2x1bW4pO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlU29mdFRhYnMoKSkge1xuICAgICAgICAgICAgdmFyIGNvdW50ID0gKHNpemUgLSBjb2x1bW4gJSBzaXplKTtcbiAgICAgICAgICAgIHZhciBpbmRlbnRTdHJpbmcgPSBzdHJpbmdSZXBlYXQoXCIgXCIsIGNvdW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBjb3VudCA9IGNvbHVtbiAlIHNpemU7XG4gICAgICAgICAgICB3aGlsZSAobGluZVtyYW5nZS5zdGFydC5jb2x1bW5dID09IFwiIFwiICYmIGNvdW50KSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgY291bnQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGluZGVudFN0cmluZyA9IFwiXFx0XCI7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuaW5zZXJ0KGluZGVudFN0cmluZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kZW50cyB0aGUgY3VycmVudCBsaW5lLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmluZGVudFJvd3NcbiAgICAgKiovXG4gICAgYmxvY2tJbmRlbnQoKSB7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5pbmRlbnRSb3dzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCwgXCJcXHRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogT3V0ZGVudHMgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5vdXRkZW50Um93c1xuICAgICAqKi9cbiAgICBibG9ja091dGRlbnQoKSB7XG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5vdXRkZW50Um93cyhzZWxlY3Rpb24uZ2V0UmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogbW92ZSBvdXQgb2YgY29yZSB3aGVuIHdlIGhhdmUgZ29vZCBtZWNoYW5pc20gZm9yIG1hbmFnaW5nIGV4dGVuc2lvbnNcbiAgICBzb3J0TGluZXMoKSB7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXG4gICAgICAgIHZhciBsaW5lcyA9IFtdO1xuICAgICAgICBmb3IgKGkgPSByb3dzLmZpcnN0OyBpIDw9IHJvd3MubGFzdDsgaSsrKVxuICAgICAgICAgICAgbGluZXMucHVzaChzZXNzaW9uLmdldExpbmUoaSkpO1xuXG4gICAgICAgIGxpbmVzLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgaWYgKGEudG9Mb3dlckNhc2UoKSA8IGIudG9Mb3dlckNhc2UoKSkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKGEudG9Mb3dlckNhc2UoKSA+IGIudG9Mb3dlckNhc2UoKSkgcmV0dXJuIDE7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRlbGV0ZVJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICBmb3IgKHZhciBpID0gcm93cy5maXJzdDsgaSA8PSByb3dzLmxhc3Q7IGkrKykge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoaSk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLnJvdyA9IGk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICBzZXNzaW9uLnJlcGxhY2UoZGVsZXRlUmFuZ2UsIGxpbmVzW2kgLSByb3dzLmZpcnN0XSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHaXZlbiB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHJhbmdlLCB0aGlzIGZ1bmN0aW9uIGVpdGhlciBjb21tZW50cyBhbGwgdGhlIGxpbmVzLCBvciB1bmNvbW1lbnRzIGFsbCBvZiB0aGVtLlxuICAgICAqKi9cbiAgICB0b2dnbGVDb21tZW50TGluZXMoKSB7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXMuc2Vzc2lvbi5nZXRTdGF0ZSh0aGlzLmdldEN1cnNvclBvc2l0aW9uKCkucm93KTtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmdldE1vZGUoKS50b2dnbGVDb21tZW50TGluZXMoc3RhdGUsIHRoaXMuc2Vzc2lvbiwgcm93cy5maXJzdCwgcm93cy5sYXN0KTtcbiAgICB9XG5cbiAgICB0b2dnbGVCbG9ja0NvbW1lbnQoKSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXMuc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0TW9kZSgpLnRvZ2dsZUJsb2NrQ29tbWVudChzdGF0ZSwgdGhpcy5zZXNzaW9uLCByYW5nZSwgY3Vyc29yKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXb3JrcyBsaWtlIFtbRWRpdFNlc3Npb24uZ2V0VG9rZW5BdF1dLCBleGNlcHQgaXQgcmV0dXJucyBhIG51bWJlci5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXROdW1iZXJBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHZhbHVlOiBzdHJpbmc7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgX251bWJlclJ4ID0gL1tcXC1dP1swLTldKyg/OlxcLlswLTldKyk/L2c7XG4gICAgICAgIF9udW1iZXJSeC5sYXN0SW5kZXggPSAwO1xuXG4gICAgICAgIHZhciBzID0gdGhpcy5zZXNzaW9uLmdldExpbmUocm93KTtcbiAgICAgICAgd2hpbGUgKF9udW1iZXJSeC5sYXN0SW5kZXggPCBjb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciBtOiBSZWdFeHBFeGVjQXJyYXkgPSBfbnVtYmVyUnguZXhlYyhzKTtcbiAgICAgICAgICAgIGlmIChtLmluZGV4IDw9IGNvbHVtbiAmJiBtLmluZGV4ICsgbVswXS5sZW5ndGggPj0gY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJldHZhbCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG1bMF0sXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBtLmluZGV4LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IG0uaW5kZXggKyBtWzBdLmxlbmd0aFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJldHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0aGUgY2hhcmFjdGVyIGJlZm9yZSB0aGUgY3Vyc29yIGlzIGEgbnVtYmVyLCB0aGlzIGZ1bmN0aW9ucyBjaGFuZ2VzIGl0cyB2YWx1ZSBieSBgYW1vdW50YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gYW1vdW50IFRoZSB2YWx1ZSB0byBjaGFuZ2UgdGhlIG51bWVyYWwgYnkgKGNhbiBiZSBuZWdhdGl2ZSB0byBkZWNyZWFzZSB2YWx1ZSlcbiAgICAgKi9cbiAgICBtb2RpZnlOdW1iZXIoYW1vdW50OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLmNvbHVtbjtcblxuICAgICAgICAvLyBnZXQgdGhlIGNoYXIgYmVmb3JlIHRoZSBjdXJzb3JcbiAgICAgICAgdmFyIGNoYXJSYW5nZSA9IG5ldyBSYW5nZShyb3csIGNvbHVtbiAtIDEsIHJvdywgY29sdW1uKTtcblxuICAgICAgICB2YXIgYyA9IHBhcnNlRmxvYXQodGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShjaGFyUmFuZ2UpKTtcbiAgICAgICAgLy8gaWYgdGhlIGNoYXIgaXMgYSBkaWdpdFxuICAgICAgICBpZiAoIWlzTmFOKGMpICYmIGlzRmluaXRlKGMpKSB7XG4gICAgICAgICAgICAvLyBnZXQgdGhlIHdob2xlIG51bWJlciB0aGUgZGlnaXQgaXMgcGFydCBvZlxuICAgICAgICAgICAgdmFyIG5yID0gdGhpcy5nZXROdW1iZXJBdChyb3csIGNvbHVtbik7XG4gICAgICAgICAgICAvLyBpZiBudW1iZXIgZm91bmRcbiAgICAgICAgICAgIGlmIChucikge1xuICAgICAgICAgICAgICAgIHZhciBmcCA9IG5yLnZhbHVlLmluZGV4T2YoXCIuXCIpID49IDAgPyBuci5zdGFydCArIG5yLnZhbHVlLmluZGV4T2YoXCIuXCIpICsgMSA6IG5yLmVuZDtcbiAgICAgICAgICAgICAgICB2YXIgZGVjaW1hbHMgPSBuci5zdGFydCArIG5yLnZhbHVlLmxlbmd0aCAtIGZwO1xuXG4gICAgICAgICAgICAgICAgdmFyIHQgPSBwYXJzZUZsb2F0KG5yLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB0ICo9IE1hdGgucG93KDEwLCBkZWNpbWFscyk7XG5cblxuICAgICAgICAgICAgICAgIGlmIChmcCAhPT0gbnIuZW5kICYmIGNvbHVtbiA8IGZwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFtb3VudCAqPSBNYXRoLnBvdygxMCwgbnIuZW5kIC0gY29sdW1uIC0gMSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYW1vdW50ICo9IE1hdGgucG93KDEwLCBuci5lbmQgLSBjb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHQgKz0gYW1vdW50O1xuICAgICAgICAgICAgICAgIHQgLz0gTWF0aC5wb3coMTAsIGRlY2ltYWxzKTtcbiAgICAgICAgICAgICAgICB2YXIgbm5yID0gdC50b0ZpeGVkKGRlY2ltYWxzKTtcblxuICAgICAgICAgICAgICAgIC8vdXBkYXRlIG51bWJlclxuICAgICAgICAgICAgICAgIHZhciByZXBsYWNlUmFuZ2UgPSBuZXcgUmFuZ2Uocm93LCBuci5zdGFydCwgcm93LCBuci5lbmQpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJlcGxhY2VSYW5nZSwgbm5yKTtcblxuICAgICAgICAgICAgICAgIC8vcmVwb3NpdGlvbiB0aGUgY3Vyc29yXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBNYXRoLm1heChuci5zdGFydCArIDEsIGNvbHVtbiArIG5uci5sZW5ndGggLSBuci52YWx1ZS5sZW5ndGgpKTtcblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIGxpbmVzIGluIHRoZSBjdXJyZW50IHNlbGVjdGlvblxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnJlbW92ZVxuICAgICAqKi9cbiAgICByZW1vdmVMaW5lcygpIHtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdmFyIHJhbmdlO1xuICAgICAgICBpZiAocm93cy5maXJzdCA9PT0gMCB8fCByb3dzLmxhc3QgKyAxIDwgdGhpcy5zZXNzaW9uLmdldExlbmd0aCgpKVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2Uocm93cy5maXJzdCwgMCwgcm93cy5sYXN0ICsgMSwgMCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgIHJvd3MuZmlyc3QgLSAxLCB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3dzLmZpcnN0IC0gMSkubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHJvd3MubGFzdCwgdGhpcy5zZXNzaW9uLmdldExpbmUocm93cy5sYXN0KS5sZW5ndGhcbiAgICAgICAgICAgICk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgZHVwbGljYXRlU2VsZWN0aW9uKCkge1xuICAgICAgICB2YXIgc2VsID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciBkb2MgPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByYW5nZSA9IHNlbC5nZXRSYW5nZSgpO1xuICAgICAgICB2YXIgcmV2ZXJzZSA9IHNlbC5pc0JhY2t3YXJkcygpO1xuICAgICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgZG9jLmR1cGxpY2F0ZUxpbmVzKHJvdywgcm93KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwb2ludCA9IHJldmVyc2UgPyByYW5nZS5zdGFydCA6IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIHZhciBlbmRQb2ludCA9IGRvYy5pbnNlcnQocG9pbnQsIGRvYy5nZXRUZXh0UmFuZ2UocmFuZ2UpKTtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcG9pbnQ7XG4gICAgICAgICAgICByYW5nZS5lbmQgPSBlbmRQb2ludDtcblxuICAgICAgICAgICAgc2VsLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlLCByZXZlcnNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIGRvd24gb25lIHJvdy5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZUxpbmVzVXBcbiAgICAgKiovXG4gICAgbW92ZUxpbmVzRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLm1vdmVMaW5lc0Rvd24oZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyB1cCBvbmUgcm93LlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZUxpbmVzRG93blxuICAgICAqKi9cbiAgICBtb3ZlTGluZXNVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLm1vdmVMaW5lc1VwKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICAgKiBgYGBqc29uXG4gICAgICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICAgKiBgYGBcbiAgICAgKiBAcGFyYW0ge1JhbmdlfSBmcm9tUmFuZ2UgVGhlIHJhbmdlIG9mIHRleHQgeW91IHdhbnQgbW92ZWQgd2l0aGluIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0b1Bvc2l0aW9uIFRoZSBsb2NhdGlvbiAocm93IGFuZCBjb2x1bW4pIHdoZXJlIHlvdSB3YW50IHRvIG1vdmUgdGhlIHRleHQgdG9cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtSYW5nZX0gVGhlIG5ldyByYW5nZSB3aGVyZSB0aGUgdGV4dCB3YXMgbW92ZWQgdG8uXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZVRleHRcbiAgICAgKiovXG4gICAgbW92ZVRleHQocmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlVGV4dChyYW5nZSwgdG9Qb3NpdGlvbiwgY29weSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgdXAgb25lIHJvdy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSBPbiBzdWNjZXNzLCByZXR1cm5zIDAuXG4gICAgICpcbiAgICAgKiovXG4gICAgY29weUxpbmVzVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyBkb3duIG9uZSByb3cuXG4gICAgICogQHJldHVybnMge051bWJlcn0gT24gc3VjY2VzcywgcmV0dXJucyB0aGUgbnVtYmVyIG9mIG5ldyByb3dzIGFkZGVkOyBpbiBvdGhlciB3b3JkcywgYGxhc3RSb3cgLSBmaXJzdFJvdyArIDFgLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmR1cGxpY2F0ZUxpbmVzXG4gICAgICpcbiAgICAgKiovXG4gICAgY29weUxpbmVzRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZXMgYSBzcGVjaWZpYyBmdW5jdGlvbiwgd2hpY2ggY2FuIGJlIGFueXRoaW5nIHRoYXQgbWFuaXB1bGF0ZXMgc2VsZWN0ZWQgbGluZXMsIHN1Y2ggYXMgY29weWluZyB0aGVtLCBkdXBsaWNhdGluZyB0aGVtLCBvciBzaGlmdGluZyB0aGVtLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG1vdmVyIEEgbWV0aG9kIHRvIGNhbGwgb24gZWFjaCBzZWxlY3RlZCByb3dcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHByaXZhdGUgJG1vdmVMaW5lcyhtb3Zlcikge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIGlmICghc2VsZWN0aW9uWydpbk11bHRpU2VsZWN0TW9kZSddIHx8IHRoaXMuaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gc2VsZWN0aW9uLnRvT3JpZW50ZWRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGVkUm93czogeyBmaXJzdDogbnVtYmVyOyBsYXN0OiBudW1iZXIgfSA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICAgICAgdmFyIGxpbmVzTW92ZWQgPSBtb3Zlci5jYWxsKHRoaXMsIHNlbGVjdGVkUm93cy5maXJzdCwgc2VsZWN0ZWRSb3dzLmxhc3QpO1xuICAgICAgICAgICAgcmFuZ2UubW92ZUJ5KGxpbmVzTW92ZWQsIDApO1xuICAgICAgICAgICAgc2VsZWN0aW9uLmZyb21PcmllbnRlZFJhbmdlKHJhbmdlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciByYW5nZXMgPSBzZWxlY3Rpb24ucmFuZ2VMaXN0LnJhbmdlcztcbiAgICAgICAgICAgIHNlbGVjdGlvbi5yYW5nZUxpc3QuZGV0YWNoKCk7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSByYW5nZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlSW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIHZhciBjb2xsYXBzZWRSb3dzID0gcmFuZ2VzW2ldLmNvbGxhcHNlUm93cygpO1xuICAgICAgICAgICAgICAgIHZhciBsYXN0ID0gY29sbGFwc2VkUm93cy5lbmQucm93O1xuICAgICAgICAgICAgICAgIHZhciBmaXJzdCA9IGNvbGxhcHNlZFJvd3Muc3RhcnQucm93O1xuICAgICAgICAgICAgICAgIHdoaWxlIChpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29sbGFwc2VkUm93cyA9IHJhbmdlc1tpXS5jb2xsYXBzZVJvd3MoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpcnN0IC0gY29sbGFwc2VkUm93cy5lbmQucm93IDw9IDEpXG4gICAgICAgICAgICAgICAgICAgICAgICBmaXJzdCA9IGNvbGxhcHNlZFJvd3MuZW5kLnJvdztcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGkrKztcblxuICAgICAgICAgICAgICAgIHZhciBsaW5lc01vdmVkID0gbW92ZXIuY2FsbCh0aGlzLCBmaXJzdCwgbGFzdCk7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHJhbmdlSW5kZXggPj0gaSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZXNbcmFuZ2VJbmRleF0ubW92ZUJ5KGxpbmVzTW92ZWQsIDApO1xuICAgICAgICAgICAgICAgICAgICByYW5nZUluZGV4LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VsZWN0aW9uLmZyb21PcmllbnRlZFJhbmdlKHNlbGVjdGlvbi5yYW5nZXNbMF0pO1xuICAgICAgICAgICAgc2VsZWN0aW9uLnJhbmdlTGlzdC5hdHRhY2godGhpcy5zZXNzaW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gb2JqZWN0IGluZGljYXRpbmcgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCByb3dzLlxuICAgICAqXG4gICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAgKiovXG4gICAgcHJpdmF0ZSAkZ2V0U2VsZWN0ZWRSb3dzKCk6IHsgZmlyc3Q6IG51bWJlcjsgbGFzdDogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuY29sbGFwc2VSb3dzKCk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGZpcnN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0KHJhbmdlLnN0YXJ0LnJvdyksXG4gICAgICAgICAgICBsYXN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZEVuZChyYW5nZS5lbmQucm93KVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25TdGFydCh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hvd0NvbXBvc2l0aW9uKHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKSk7XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvblVwZGF0ZSh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q29tcG9zaXRpb25UZXh0KHRleHQpO1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25FbmQoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93fVxuICAgICAqXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93XG4gICAgICoqL1xuICAgIGdldEZpcnN0VmlzaWJsZVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvd31cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93XG4gICAgICoqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kaWNhdGVzIGlmIHRoZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc1Jvd1Zpc2libGUocm93OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChyb3cgPj0gdGhpcy5nZXRGaXJzdFZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5nZXRMYXN0VmlzaWJsZVJvdygpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgaWYgdGhlIGVudGlyZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGlzUm93RnVsbHlWaXNpYmxlKHJvdzogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAocm93ID49IHRoaXMucmVuZGVyZXIuZ2V0Rmlyc3RGdWxseVZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5yZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG51bWJlciBvZiBjdXJyZW50bHkgdmlzaWJpbGUgcm93cy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBwcml2YXRlICRnZXRWaXNpYmxlUm93Q291bnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0U2Nyb2xsQm90dG9tUm93KCkgLSB0aGlzLnJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdygpICsgMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGSVhNRTogVGhlIHNlbWFudGljcyBvZiBzZWxlY3QgYXJlIG5vdCBlYXNpbHkgdW5kZXJzdG9vZC4gXG4gICAgICogQHBhcmFtIGRpcmVjdGlvbiArMSBmb3IgcGFnZSBkb3duLCAtMSBmb3IgcGFnZSB1cC4gTWF5YmUgTiBmb3IgTiBwYWdlcz9cbiAgICAgKiBAcGFyYW0gc2VsZWN0IHRydWUgfCBmYWxzZSB8IHVuZGVmaW5lZFxuICAgICAqL1xuICAgIHByaXZhdGUgJG1vdmVCeVBhZ2UoZGlyZWN0aW9uOiBudW1iZXIsIHNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcjtcbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMucmVuZGVyZXIubGF5ZXJDb25maWc7XG4gICAgICAgIHZhciByb3dzID0gZGlyZWN0aW9uICogTWF0aC5mbG9vcihjb25maWcuaGVpZ2h0IC8gY29uZmlnLmxpbmVIZWlnaHQpO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIGlmIChzZWxlY3QgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLiRtb3ZlU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KHJvd3MsIDApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2VsZWN0ID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckJ5KHJvd3MsIDApO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZy0tO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSByZW5kZXJlci5zY3JvbGxUb3A7XG5cbiAgICAgICAgcmVuZGVyZXIuc2Nyb2xsQnkoMCwgcm93cyAqIGNvbmZpZy5saW5lSGVpZ2h0KTtcbiAgICAgICAgLy8gV2h5IGRvbid0IHdlIGFzc2VydCBvdXIgYXJncyBhbmQgZG8gdHlwZW9mIHNlbGVjdCA9PT0gJ3VuZGVmaW5lZCc/XG4gICAgICAgIGlmIChzZWxlY3QgIT0gbnVsbCkge1xuICAgICAgICAgICAgLy8gVGhpcyBpcyBjYWxsZWQgd2hlbiBzZWxlY3QgaXMgdW5kZWZpbmVkLlxuICAgICAgICAgICAgcmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlbmRlcmVyLmFuaW1hdGVTY3JvbGxpbmcoc2Nyb2xsVG9wKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIHRoZSB0ZXh0IGZyb20gdGhlIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGRvY3VtZW50IHVudGlsIHdoZXJlIGEgXCJwYWdlIGRvd25cIiBmaW5pc2hlcy5cbiAgICAgKiovXG4gICAgc2VsZWN0UGFnZURvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoKzEsIHRydWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgdGhlIHRleHQgZnJvbSB0aGUgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgdW50aWwgd2hlcmUgYSBcInBhZ2UgdXBcIiBmaW5pc2hlcy5cbiAgICAgKiovXG4gICAgc2VsZWN0UGFnZVVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKC0xLCB0cnVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSBkb3duXCIgaXMsIGFzIHdlbGwgYXMgbW92aW5nIHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgICoqL1xuICAgIGdvdG9QYWdlRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgrMSwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIHVwXCIgaXMsIGFzIHdlbGwgYXMgbW92aW5nIHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgICoqL1xuICAgIGdvdG9QYWdlVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoLTEsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgZG93blwiIGlzLCB3aXRob3V0IGNoYW5naW5nIHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgICoqL1xuICAgIHNjcm9sbFBhZ2VEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSB1cFwiIGlzLCB3aXRob3V0IGNoYW5naW5nIHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgICoqL1xuICAgIHNjcm9sbFBhZ2VVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgtMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGVkaXRvciB0byB0aGUgc3BlY2lmaWVkIHJvdy5cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3dcbiAgICAgKi9cbiAgICBzY3JvbGxUb1Jvdyhyb3c6IG51bWJlcikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvUm93KHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0byBhIGxpbmUuIElmIGBjZW50ZXJgIGlzIGB0cnVlYCwgaXQgcHV0cyB0aGUgbGluZSBpbiBtaWRkbGUgb2Ygc2NyZWVuIChvciBhdHRlbXB0cyB0bykuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgVGhlIGxpbmUgdG8gc2Nyb2xsIHRvXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBjZW50ZXIgSWYgYHRydWVgXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY3JvbGxpbmdcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgd2hlbiB0aGUgYW5pbWF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9MaW5lXG4gICAgICoqL1xuICAgIHNjcm9sbFRvTGluZShsaW5lOiBudW1iZXIsIGNlbnRlcjogYm9vbGVhbiwgYW5pbWF0ZTogYm9vbGVhbiwgY2FsbGJhY2s/OiAoKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb0xpbmUobGluZSwgY2VudGVyLCBhbmltYXRlLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gY2VudGVyIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBvbiB0aGUgc2NyZWVuLlxuICAgICAqKi9cbiAgICBjZW50ZXJTZWxlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogTWF0aC5mbG9vcihyYW5nZS5zdGFydC5yb3cgKyAocmFuZ2UuZW5kLnJvdyAtIHJhbmdlLnN0YXJ0LnJvdykgLyAyKSxcbiAgICAgICAgICAgIGNvbHVtbjogTWF0aC5mbG9vcihyYW5nZS5zdGFydC5jb2x1bW4gKyAocmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbikgLyAyKVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmFsaWduQ3Vyc29yKHBvcywgMC41KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IuXG4gICAgICogQHJldHVybnMge09iamVjdH0gQW4gb2JqZWN0IHRoYXQgbG9va3Mgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgICAgKlxuICAgICAqIGBgYGpzb25cbiAgICAgKiB7IHJvdzogY3VyclJvdywgY29sdW1uOiBjdXJyQ29sIH1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5nZXRDdXJzb3JcbiAgICAgKiovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb24oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzY3JlZW4gcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAgKiovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW4oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWxlY3Rpb24uZ2V0UmFuZ2V9XG4gICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5nZXRSYW5nZVxuICAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25SYW5nZSgpOiBSYW5nZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgYWxsIHRoZSB0ZXh0IGluIGVkaXRvci5cbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24uc2VsZWN0QWxsXG4gICAgICoqL1xuICAgIHNlbGVjdEFsbCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0QWxsKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb259XG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uXG4gICAgICoqL1xuICAgIGNsZWFyU2VsZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNwZWNpZmllZCByb3cgYW5kIGNvbHVtbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBub3QgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBuZXcgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIG5ldyBjb2x1bW4gbnVtYmVyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBhbmltYXRlXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24ubW92ZUN1cnNvclRvXG4gICAgICoqL1xuICAgIG1vdmVDdXJzb3JUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGFuaW1hdGU/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgcG9zaXRpb24gaW5kaWNhdGVkIGJ5IGBwb3Mucm93YCBhbmQgYHBvcy5jb2x1bW5gLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgQW4gb2JqZWN0IHdpdGggdHdvIHByb3BlcnRpZXMsIHJvdyBhbmQgY29sdW1uXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9Qb3NpdGlvblxuICAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3MpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yJ3Mgcm93IGFuZCBjb2x1bW4gdG8gdGhlIG5leHQgbWF0Y2hpbmcgYnJhY2tldCBvciBIVE1MIHRhZy5cbiAgICAgKlxuICAgICAqKi9cbiAgICBqdW1wVG9NYXRjaGluZyhzZWxlY3Q6IGJvb2xlYW4pIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcy5zZXNzaW9uLCBjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdmFyIHByZXZUb2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICB2YXIgdG9rZW4gPSBwcmV2VG9rZW47XG5cbiAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcblxuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vZ2V0IG5leHQgY2xvc2luZyB0YWcgb3IgYnJhY2tldFxuICAgICAgICB2YXIgbWF0Y2hUeXBlO1xuICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGRlcHRoID0ge307XG4gICAgICAgIHZhciBpID0gY3Vyc29yLmNvbHVtbiAtIHRva2VuLnN0YXJ0O1xuICAgICAgICB2YXIgYnJhY2tldFR5cGU7XG4gICAgICAgIHZhciBicmFja2V0cyA9IHtcbiAgICAgICAgICAgIFwiKVwiOiBcIihcIixcbiAgICAgICAgICAgIFwiKFwiOiBcIihcIixcbiAgICAgICAgICAgIFwiXVwiOiBcIltcIixcbiAgICAgICAgICAgIFwiW1wiOiBcIltcIixcbiAgICAgICAgICAgIFwie1wiOiBcIntcIixcbiAgICAgICAgICAgIFwifVwiOiBcIntcIlxuICAgICAgICB9O1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGlmICh0b2tlbi52YWx1ZS5tYXRjaCgvW3t9KClcXFtcXF1dL2cpKSB7XG4gICAgICAgICAgICAgICAgZm9yICg7IGkgPCB0b2tlbi52YWx1ZS5sZW5ndGggJiYgIWZvdW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFicmFja2V0c1t0b2tlbi52YWx1ZVtpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYnJhY2tldFR5cGUgPSBicmFja2V0c1t0b2tlbi52YWx1ZVtpXV0gKyAnLicgKyB0b2tlbi50eXBlLnJlcGxhY2UoXCJycGFyZW5cIiwgXCJscGFyZW5cIik7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzTmFOKGRlcHRoW2JyYWNrZXRUeXBlXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW2JyYWNrZXRUeXBlXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHRva2VuLnZhbHVlW2ldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICcoJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1snOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAneyc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICcpJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ10nOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnfSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdLS07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGhbYnJhY2tldFR5cGVdID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaFR5cGUgPSAnYnJhY2tldCc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNOYU4oZGVwdGhbdG9rZW4udmFsdWVdKSkge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0gPSAwO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0rKztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0tLTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZGVwdGhbdG9rZW4udmFsdWVdID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaFR5cGUgPSAndGFnJztcbiAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IHRva2VuO1xuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgICAgICBpID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgIWZvdW5kKTtcblxuICAgICAgICAvL25vIG1hdGNoIGZvdW5kXG4gICAgICAgIGlmICghbWF0Y2hUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICBpZiAobWF0Y2hUeXBlID09PSAnYnJhY2tldCcpIHtcbiAgICAgICAgICAgIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldEJyYWNrZXRSYW5nZShjdXJzb3IpO1xuICAgICAgICAgICAgaWYgKCFyYW5nZSkge1xuICAgICAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyBpIC0gMSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgaSAtIDFcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy5yb3cgPT09IGN1cnNvci5yb3cgJiYgTWF0aC5hYnMocG9zLmNvbHVtbiAtIGN1cnNvci5jb2x1bW4pIDwgMilcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKHBvcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAobWF0Y2hUeXBlID09PSAndGFnJykge1xuICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpXG4gICAgICAgICAgICAgICAgdmFyIHRhZyA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpIC0gMixcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSAtIDJcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vZmluZCBtYXRjaGluZyB0YWdcbiAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pID09PSAwKSB7XG4gICAgICAgICAgICAgICAgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gcHJldlRva2VuO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnR5cGUuaW5kZXhPZigndGFnLWNsb3NlJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLCBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW3RhZ10rKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFt0YWddLS07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlcHRoW3RhZ10gPT09IDApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHByZXZUb2tlbiAmJiAhZm91bmQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3dlIGZvdW5kIGl0XG4gICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChwb3Mucm93ID09IGN1cnNvci5yb3cgJiYgTWF0aC5hYnMocG9zLmNvbHVtbiAtIGN1cnNvci5jb2x1bW4pIDwgMilcbiAgICAgICAgICAgICAgICAgICAgcG9zID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcG9zID0gcmFuZ2UgJiYgcmFuZ2VbJ2N1cnNvciddIHx8IHBvcztcbiAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgaWYgKHNlbGVjdCkge1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5pc0VxdWFsKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSkpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFRvKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzcGVjaWZpZWQgbGluZSBudW1iZXIsIGFuZCBhbHNvIGludG8gdGhlIGluZGljaWF0ZWQgY29sdW1uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lTnVtYmVyIFRoZSBsaW5lIG51bWJlciB0byBnbyB0b1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gQSBjb2x1bW4gbnVtYmVyIHRvIGdvIHRvXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY29sbGluZ1xuICAgICAqKi9cbiAgICBnb3RvTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbj86IG51bWJlciwgYW5pbWF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnVuZm9sZCh7IHJvdzogbGluZU51bWJlciAtIDEsIGNvbHVtbjogY29sdW1uIHx8IDAgfSk7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgLy8gdG9kbzogZmluZCBhIHdheSB0byBhdXRvbWF0aWNhbGx5IGV4aXQgbXVsdGlzZWxlY3QgbW9kZVxuICAgICAgICB0aGlzLmV4aXRNdWx0aVNlbGVjdE1vZGUgJiYgdGhpcy5leGl0TXVsdGlTZWxlY3RNb2RlKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxpbmVOdW1iZXIgLSAxLCBjb2x1bW4gfHwgMCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgaWYgKCF0aGlzLmlzUm93RnVsbHlWaXNpYmxlKGxpbmVOdW1iZXIgLSAxKSkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxUb0xpbmUobGluZU51bWJlciAtIDEsIHRydWUsIGFuaW1hdGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3BlY2lmaWVkIHJvdyBhbmQgY29sdW1uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgbmV3IHJvdyBudW1iZXJcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBuZXcgY29sdW1uIG51bWJlclxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0b3IubW92ZUN1cnNvclRvXG4gICAgICoqL1xuICAgIG5hdmlnYXRlVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB1cCBpbiB0aGUgZG9jdW1lbnQgdGhlIHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZXMgVGhlIG51bWJlciBvZiB0aW1lcyB0byBjaGFuZ2UgbmF2aWdhdGlvblxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgbmF2aWdhdGVVcCh0aW1lczogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc011bHRpTGluZSgpICYmICF0aGlzLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uU3RhcnQgPSB0aGlzLnNlbGVjdGlvbi5hbmNob3IuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvblN0YXJ0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkoLXRpbWVzIHx8IC0xLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGRvd24gaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRG93bih0aW1lczogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc011bHRpTGluZSgpICYmIHRoaXMuc2VsZWN0aW9uLmlzQmFja3dhcmRzKCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbmQgPSB0aGlzLnNlbGVjdGlvbi5hbmNob3IuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvbkVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckJ5KHRpbWVzIHx8IDEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgbGVmdCBpbiB0aGUgZG9jdW1lbnQgdGhlIHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZXMgVGhlIG51bWJlciBvZiB0aW1lcyB0byBjaGFuZ2UgbmF2aWdhdGlvblxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgbmF2aWdhdGVMZWZ0KHRpbWVzOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25TdGFydCA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKS5zdGFydDtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uU3RhcnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGltZXMgPSB0aW1lcyB8fCAxO1xuICAgICAgICAgICAgd2hpbGUgKHRpbWVzLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGVmdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHJpZ2h0IGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVJpZ2h0KHRpbWVzOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbmQgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuZW5kO1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25FbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGltZXMgPSB0aW1lcyB8fCAxO1xuICAgICAgICAgICAgd2hpbGUgKHRpbWVzLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBsaW5lLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGluZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZVN0YXJ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCBsaW5lLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGluZUVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVFbmQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGZpbGUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVGaWxlRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBmaWxlLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRmlsZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZVN0YXJ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgaW1tZWRpYXRlbHkgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50IHBvc2l0aW9uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlV29yZFJpZ2h0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZFJpZ2h0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgaW1tZWRpYXRlbHkgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgcG9zaXRpb24uIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVXb3JkTGVmdCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvcldvcmRMZWZ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyB0aGUgZmlyc3Qgb2NjdXJhbmNlIG9mIGBvcHRpb25zLm5lZWRsZWAgd2l0aCB0aGUgdmFsdWUgaW4gYHJlcGxhY2VtZW50YC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gcmVwbGFjZW1lbnQgVGhlIHRleHQgdG8gcmVwbGFjZSB3aXRoXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgVGhlIFtbU2VhcmNoIGBTZWFyY2hgXV0gb3B0aW9ucyB0byB1c2VcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHJlcGxhY2UocmVwbGFjZW1lbnQ6IHN0cmluZywgb3B0aW9ucyk6IG51bWJlciB7XG4gICAgICAgIGlmIChvcHRpb25zKVxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldChvcHRpb25zKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLiRzZWFyY2guZmluZCh0aGlzLnNlc3Npb24pO1xuICAgICAgICB2YXIgcmVwbGFjZWQgPSAwO1xuICAgICAgICBpZiAoIXJhbmdlKVxuICAgICAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuXG4gICAgICAgIGlmICh0aGlzLiR0cnlSZXBsYWNlKHJhbmdlLCByZXBsYWNlbWVudCkpIHtcbiAgICAgICAgICAgIHJlcGxhY2VkID0gMTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmFuZ2UgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcocmFuZ2Uuc3RhcnQsIHJhbmdlLmVuZCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwbGFjZXMgYWxsIG9jY3VyYW5jZXMgb2YgYG9wdGlvbnMubmVlZGxlYCB3aXRoIHRoZSB2YWx1ZSBpbiBgcmVwbGFjZW1lbnRgLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSByZXBsYWNlbWVudCBUaGUgdGV4dCB0byByZXBsYWNlIHdpdGhcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBUaGUgW1tTZWFyY2ggYFNlYXJjaGBdXSBvcHRpb25zIHRvIHVzZVxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgcmVwbGFjZUFsbChyZXBsYWNlbWVudDogc3RyaW5nLCBvcHRpb25zKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaC5zZXQob3B0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy4kc2VhcmNoLmZpbmRBbGwodGhpcy5zZXNzaW9uKTtcbiAgICAgICAgdmFyIHJlcGxhY2VkID0gMDtcbiAgICAgICAgaWYgKCFyYW5nZXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG5cbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKDAsIDApO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSByYW5nZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0cnlSZXBsYWNlKHJhbmdlc1tpXSwgcmVwbGFjZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgcmVwbGFjZWQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHNlbGVjdGlvbik7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHRyeVJlcGxhY2UocmFuZ2U6IFJhbmdlLCByZXBsYWNlbWVudDogc3RyaW5nKTogUmFuZ2Uge1xuICAgICAgICB2YXIgaW5wdXQgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgcmVwbGFjZW1lbnQgPSB0aGlzLiRzZWFyY2gucmVwbGFjZShpbnB1dCwgcmVwbGFjZW1lbnQpO1xuICAgICAgICBpZiAocmVwbGFjZW1lbnQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZCA9IHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCByZXBsYWNlbWVudCk7XG4gICAgICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6U2VhcmNoLmdldE9wdGlvbnN9IEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICogQHJlbGF0ZWQgU2VhcmNoLmdldE9wdGlvbnNcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICAqKi9cbiAgICBnZXRMYXN0U2VhcmNoT3B0aW9ucygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHNlYXJjaC5nZXRPcHRpb25zKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gZmluZCBgbmVlZGxlYCB3aXRoaW4gdGhlIGRvY3VtZW50LiBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBgb3B0aW9uc2AsIHNlZSBbW1NlYXJjaCBgU2VhcmNoYF1dLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBuZWVkbGUgVGhlIHRleHQgdG8gc2VhcmNoIGZvciAob3B0aW9uYWwpXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQW4gb2JqZWN0IGRlZmluaW5nIHZhcmlvdXMgc2VhcmNoIHByb3BlcnRpZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlYXJjaC5maW5kXG4gICAgICoqL1xuICAgIGZpbmQobmVlZGxlOiAoc3RyaW5nIHwgUmVnRXhwKSwgb3B0aW9ucywgYW5pbWF0ZT86IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIGlmICghb3B0aW9ucylcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcblxuICAgICAgICBpZiAodHlwZW9mIG5lZWRsZSA9PSBcInN0cmluZ1wiIHx8IG5lZWRsZSBpbnN0YW5jZW9mIFJlZ0V4cClcbiAgICAgICAgICAgIG9wdGlvbnMubmVlZGxlID0gbmVlZGxlO1xuICAgICAgICBlbHNlIGlmICh0eXBlb2YgbmVlZGxlID09IFwib2JqZWN0XCIpXG4gICAgICAgICAgICBtaXhpbihvcHRpb25zLCBuZWVkbGUpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgIGlmIChvcHRpb25zLm5lZWRsZSA9PSBudWxsKSB7XG4gICAgICAgICAgICBuZWVkbGUgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKSB8fCB0aGlzLiRzZWFyY2guJG9wdGlvbnMubmVlZGxlO1xuICAgICAgICAgICAgaWYgKCFuZWVkbGUpIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRXb3JkUmFuZ2UocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIG5lZWRsZSA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldCh7IG5lZWRsZTogbmVlZGxlIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kc2VhcmNoLnNldChvcHRpb25zKTtcbiAgICAgICAgaWYgKCFvcHRpb25zLnN0YXJ0KVxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldCh7IHN0YXJ0OiByYW5nZSB9KTtcblxuICAgICAgICB2YXIgbmV3UmFuZ2UgPSB0aGlzLiRzZWFyY2guZmluZCh0aGlzLnNlc3Npb24pO1xuICAgICAgICBpZiAob3B0aW9ucy5wcmV2ZW50U2Nyb2xsKVxuICAgICAgICAgICAgcmV0dXJuIG5ld1JhbmdlO1xuICAgICAgICBpZiAobmV3UmFuZ2UpIHtcbiAgICAgICAgICAgIHRoaXMucmV2ZWFsUmFuZ2UobmV3UmFuZ2UsIGFuaW1hdGUpO1xuICAgICAgICAgICAgcmV0dXJuIG5ld1JhbmdlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGNsZWFyIHNlbGVjdGlvbiBpZiBub3RoaW5nIGlzIGZvdW5kXG4gICAgICAgIGlmIChvcHRpb25zLmJhY2t3YXJkcylcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcmFuZ2UuZW5kO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZS5lbmQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0UmFuZ2UocmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIGFub3RoZXIgc2VhcmNoIGZvciBgbmVlZGxlYCBpbiB0aGUgZG9jdW1lbnQuIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgc2VhcmNoIG9wdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvci5maW5kXG4gICAgICoqL1xuICAgIGZpbmROZXh0KG5lZWRsZT86IChzdHJpbmcgfCBSZWdFeHApLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICAvLyBGSVhNRTogVGhpcyBsb29rcyBmbGlwcGVkIGNvbXBhcmVkIHRvIGZpbmRQcmV2aW91cy4gXG4gICAgICAgIHRoaXMuZmluZChuZWVkbGUsIHsgc2tpcEN1cnJlbnQ6IHRydWUsIGJhY2t3YXJkczogZmFsc2UgfSwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGVyZm9ybXMgYSBzZWFyY2ggZm9yIGBuZWVkbGVgIGJhY2t3YXJkcy4gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBzZWFyY2ggb3B0aW9uc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZSBzY3JvbGxpbmdcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yLmZpbmRcbiAgICAgKiovXG4gICAgZmluZFByZXZpb3VzKG5lZWRsZT86IChzdHJpbmcgfCBSZWdFeHApLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICB0aGlzLmZpbmQobmVlZGxlLCB7IHNraXBDdXJyZW50OiB0cnVlLCBiYWNrd2FyZHM6IHRydWUgfSwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgcmV2ZWFsUmFuZ2UocmFuZ2U6IFJhbmdlLCBhbmltYXRlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi51bmZvbGQocmFuZ2UpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9wO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3KHJhbmdlLnN0YXJ0LCByYW5nZS5lbmQsIDAuNSk7XG4gICAgICAgIGlmIChhbmltYXRlICE9PSBmYWxzZSlcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyhzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VW5kb01hbmFnZXIudW5kb31cbiAgICAgKiBAcmVsYXRlZCBVbmRvTWFuYWdlci51bmRvXG4gICAgICoqL1xuICAgIHVuZG8oKSB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVbmRvTWFuYWdlcigpLnVuZG8oKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VW5kb01hbmFnZXIucmVkb31cbiAgICAgKiBAcmVsYXRlZCBVbmRvTWFuYWdlci5yZWRvXG4gICAgICoqL1xuICAgIHJlZG8oKSB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVbmRvTWFuYWdlcigpLnJlZG8oKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQ2xlYW5zIHVwIHRoZSBlbnRpcmUgZWRpdG9yLlxuICAgICAqKi9cbiAgICBkZXN0cm95KCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiZGVzdHJveVwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIGF1dG9tYXRpYyBzY3JvbGxpbmcgb2YgdGhlIGN1cnNvciBpbnRvIHZpZXcgd2hlbiBlZGl0b3IgaXRzZWxmIGlzIGluc2lkZSBzY3JvbGxhYmxlIGVsZW1lbnRcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZSBkZWZhdWx0IHRydWVcbiAgICAgKiovXG4gICAgc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3KGVuYWJsZTogYm9vbGVhbikge1xuICAgICAgICBpZiAoIWVuYWJsZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHJlY3Q7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHNob3VsZFNjcm9sbCA9IGZhbHNlO1xuICAgICAgICBpZiAoIXRoaXMuJHNjcm9sbEFuY2hvcilcbiAgICAgICAgICAgIHRoaXMuJHNjcm9sbEFuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHZhciBzY3JvbGxBbmNob3IgPSB0aGlzLiRzY3JvbGxBbmNob3I7XG4gICAgICAgIHNjcm9sbEFuY2hvci5zdHlsZS5jc3NUZXh0ID0gXCJwb3NpdGlvbjphYnNvbHV0ZVwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5pbnNlcnRCZWZvcmUoc2Nyb2xsQW5jaG9yLCB0aGlzLmNvbnRhaW5lci5maXJzdENoaWxkKTtcbiAgICAgICAgdmFyIG9uQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5vbihcImNoYW5nZVNlbGVjdGlvblwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBuZWVkZWQgdG8gbm90IHRyaWdnZXIgc3luYyByZWZsb3dcbiAgICAgICAgdmFyIG9uQmVmb3JlUmVuZGVyID0gdGhpcy5yZW5kZXJlci5vbihcImJlZm9yZVJlbmRlclwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChzaG91bGRTY3JvbGwpXG4gICAgICAgICAgICAgICAgcmVjdCA9IHNlbGYucmVuZGVyZXIuY29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdmFyIG9uQWZ0ZXJSZW5kZXIgPSB0aGlzLnJlbmRlcmVyLm9uKFwiYWZ0ZXJSZW5kZXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsICYmIHJlY3QgJiYgc2VsZi5pc0ZvY3VzZWQoKSkge1xuICAgICAgICAgICAgICAgIHZhciByZW5kZXJlciA9IHNlbGYucmVuZGVyZXI7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IHJlbmRlcmVyLiRjdXJzb3JMYXllci4kcGl4ZWxQb3M7XG4gICAgICAgICAgICAgICAgdmFyIGNvbmZpZyA9IHJlbmRlcmVyLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgICAgIHZhciB0b3AgPSBwb3MudG9wIC0gY29uZmlnLm9mZnNldDtcbiAgICAgICAgICAgICAgICBpZiAocG9zLnRvcCA+PSAwICYmIHRvcCArIHJlY3QudG9wIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChwb3MudG9wIDwgY29uZmlnLmhlaWdodCAmJlxuICAgICAgICAgICAgICAgICAgICBwb3MudG9wICsgcmVjdC50b3AgKyBjb25maWcubGluZUhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCkge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzaG91bGRTY3JvbGwgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUudG9wID0gdG9wICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUubGVmdCA9IHBvcy5sZWZ0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLmxpbmVIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbEFuY2hvci5zY3JvbGxJbnRvVmlldyhzaG91bGRTY3JvbGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSByZWN0ID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3ID0gZnVuY3Rpb24oZW5hYmxlKSB7XG4gICAgICAgICAgICBpZiAoZW5hYmxlKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldztcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNlbGVjdGlvblwiLCBvbkNoYW5nZVNlbGVjdGlvbik7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhZnRlclJlbmRlclwiLCBvbkFmdGVyUmVuZGVyKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImJlZm9yZVJlbmRlclwiLCBvbkJlZm9yZVJlbmRlcik7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHVibGljICRyZXNldEN1cnNvclN0eWxlKCkge1xuICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLiRjdXJzb3JTdHlsZSB8fCBcImFjZVwiO1xuICAgICAgICB2YXIgY3Vyc29yTGF5ZXIgPSB0aGlzLnJlbmRlcmVyLiRjdXJzb3JMYXllcjtcbiAgICAgICAgaWYgKCFjdXJzb3JMYXllcikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGN1cnNvckxheWVyLnNldFNtb290aEJsaW5raW5nKC9zbW9vdGgvLnRlc3Qoc3R5bGUpKTtcbiAgICAgICAgY3Vyc29yTGF5ZXIuaXNCbGlua2luZyA9ICF0aGlzLiRyZWFkT25seSAmJiBzdHlsZSAhPSBcIndpZGVcIjtcbiAgICAgICAgc2V0Q3NzQ2xhc3MoY3Vyc29yTGF5ZXIuZWxlbWVudCwgXCJhY2Vfc2xpbS1jdXJzb3JzXCIsIC9zbGltLy50ZXN0KHN0eWxlKSk7XG4gICAgfVxufVxuXG5kZWZpbmVPcHRpb25zKEVkaXRvci5wcm90b3R5cGUsIFwiZWRpdG9yXCIsIHtcbiAgICBzZWxlY3Rpb25TdHlsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHN0eWxlKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogRWRpdG9yID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuJG9uU2VsZWN0aW9uQ2hhbmdlKHZvaWQgMCwgdGhhdC5zZWxlY3Rpb24pO1xuICAgICAgICAgICAgdGhhdC5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uU3R5bGVcIiwgeyBkYXRhOiBzdHlsZSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImxpbmVcIlxuICAgIH0sXG4gICAgaGlnaGxpZ2h0QWN0aXZlTGluZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogRWRpdG9yID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuJG9uU2VsZWN0aW9uQ2hhbmdlKHZvaWQgMCwgdGhhdC5zZWxlY3Rpb24pO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIHJlYWRPbmx5OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24ocmVhZE9ubHkpIHtcbiAgICAgICAgICAgIC8vIGRpc2FibGVkIHRvIG5vdCBicmVhayB2aW0gbW9kZSFcbiAgICAgICAgICAgIC8vIHRoaXMudGV4dElucHV0LnNldFJlYWRPbmx5KHJlYWRPbmx5KTtcbiAgICAgICAgICAgIHRoaXMuJHJlc2V0Q3Vyc29yU3R5bGUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgY3Vyc29yU3R5bGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBFZGl0b3IgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC4kcmVzZXRDdXJzb3JTdHlsZSgpO1xuICAgICAgICB9LFxuICAgICAgICB2YWx1ZXM6IFtcImFjZVwiLCBcInNsaW1cIiwgXCJzbW9vdGhcIiwgXCJ3aWRlXCJdLFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwiYWNlXCJcbiAgICB9LFxuICAgIG1lcmdlVW5kb0RlbHRhczoge1xuICAgICAgICB2YWx1ZXM6IFtmYWxzZSwgdHJ1ZSwgXCJhbHdheXNcIl0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgYmVoYXZpb3Vyc0VuYWJsZWQ6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgd3JhcEJlaGF2aW91cnNFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIGF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldzoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKGVuYWJsZTogYm9vbGVhbikge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyhlbmFibGUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBcInJlbmRlcmVyXCIsXG4gICAgdlNjcm9sbEJhckFsd2F5c1Zpc2libGU6IFwicmVuZGVyZXJcIixcbiAgICBoaWdobGlnaHRHdXR0ZXJMaW5lOiBcInJlbmRlcmVyXCIsXG4gICAgYW5pbWF0ZWRTY3JvbGw6IFwicmVuZGVyZXJcIixcbiAgICBzaG93SW52aXNpYmxlczogXCJyZW5kZXJlclwiLFxuICAgIHNob3dQcmludE1hcmdpbjogXCJyZW5kZXJlclwiLFxuICAgIHByaW50TWFyZ2luQ29sdW1uOiBcInJlbmRlcmVyXCIsXG4gICAgcHJpbnRNYXJnaW46IFwicmVuZGVyZXJcIixcbiAgICBmYWRlRm9sZFdpZGdldHM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93Rm9sZFdpZGdldHM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93TGluZU51bWJlcnM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93R3V0dGVyOiBcInJlbmRlcmVyXCIsXG4gICAgZGlzcGxheUluZGVudEd1aWRlczogXCJyZW5kZXJlclwiLFxuICAgIGZvbnRTaXplOiBcInJlbmRlcmVyXCIsXG4gICAgZm9udEZhbWlseTogXCJyZW5kZXJlclwiLFxuICAgIG1heExpbmVzOiBcInJlbmRlcmVyXCIsXG4gICAgbWluTGluZXM6IFwicmVuZGVyZXJcIixcbiAgICBzY3JvbGxQYXN0RW5kOiBcInJlbmRlcmVyXCIsXG4gICAgZml4ZWRXaWR0aEd1dHRlcjogXCJyZW5kZXJlclwiLFxuICAgIHRoZW1lOiBcInJlbmRlcmVyXCIsXG5cbiAgICBzY3JvbGxTcGVlZDogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZHJhZ0RlbGF5OiBcIiRtb3VzZUhhbmRsZXJcIixcbiAgICBkcmFnRW5hYmxlZDogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZm9jdXNUaW1vdXQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIHRvb2x0aXBGb2xsb3dzTW91c2U6IFwiJG1vdXNlSGFuZGxlclwiLFxuXG4gICAgZmlyc3RMaW5lTnVtYmVyOiBcInNlc3Npb25cIixcbiAgICBvdmVyd3JpdGU6IFwic2Vzc2lvblwiLFxuICAgIG5ld0xpbmVNb2RlOiBcInNlc3Npb25cIixcbiAgICB1c2VXb3JrZXI6IFwic2Vzc2lvblwiLFxuICAgIHVzZVNvZnRUYWJzOiBcInNlc3Npb25cIixcbiAgICB0YWJTaXplOiBcInNlc3Npb25cIixcbiAgICB3cmFwOiBcInNlc3Npb25cIixcbiAgICBmb2xkU3R5bGU6IFwic2Vzc2lvblwiLFxuICAgIG1vZGU6IFwic2Vzc2lvblwiXG59KTtcblxuY2xhc3MgRm9sZEhhbmRsZXIge1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG5cbiAgICAgICAgLy8gVGhlIGZvbGxvd2luZyBoYW5kbGVyIGRldGVjdHMgY2xpY2tzIGluIHRoZSBlZGl0b3IgKG5vdCBndXR0ZXIpIHJlZ2lvblxuICAgICAgICAvLyB0byBkZXRlcm1pbmUgd2hldGhlciB0byByZW1vdmUgb3IgZXhwYW5kIGEgZm9sZC5cbiAgICAgICAgZWRpdG9yLm9uKFwiY2xpY2tcIiwgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5zZXNzaW9uO1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjbGlja2VkIG9uIGEgZm9sZCwgdGhlbiBleHBhbmQgaXQuXG4gICAgICAgICAgICB2YXIgZm9sZCA9IHNlc3Npb24uZ2V0Rm9sZEF0KHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uLCAxKTtcbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgaWYgKGUuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBvbiB0aGUgZ3V0dGVyLlxuICAgICAgICBlZGl0b3Iub24oJ2d1dHRlcmNsaWNrJywgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXIuZ2V0UmVnaW9uKGUpO1xuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PT0gJ2ZvbGRXaWRnZXRzJykge1xuICAgICAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgICAgICAgICBpZiAoc2Vzc2lvblsnZm9sZFdpZGdldHMnXSAmJiBzZXNzaW9uWydmb2xkV2lkZ2V0cyddW3Jvd10pIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnNlc3Npb25bJ29uRm9sZFdpZGdldENsaWNrJ10ocm93LCBlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFlZGl0b3IuaXNGb2N1c2VkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBlZGl0b3Iub24oJ2d1dHRlcmRibGNsaWNrJywgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXIuZ2V0UmVnaW9uKGUpO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyUmVnaW9uID09ICdmb2xkV2lkZ2V0cycpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm93ID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLnNlc3Npb247XG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSBzZXNzaW9uWydnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhJ10ocm93LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGRhdGEuZmlyc3RSYW5nZTtcblxuICAgICAgICAgICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBzZXNzaW9uLmdldExpbmUocm93KS5sZW5ndGgsIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uWydhZGRGb2xkJ10oXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KHsgcm93OiByYW5nZS5zdGFydC5yb3csIGNvbHVtbjogMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5pbnRlcmZhY2UgSUdlc3R1cmVIYW5kbGVyIHtcbiAgICBjYW5jZWxDb250ZXh0TWVudSgpOiB2b2lkO1xufVxuXG5jbGFzcyBNb3VzZUhhbmRsZXIge1xuICAgIHB1YmxpYyBlZGl0b3I6IEVkaXRvcjtcbiAgICBwcml2YXRlICRzY3JvbGxTcGVlZDogbnVtYmVyID0gMjtcbiAgICBwcml2YXRlICRkcmFnRGVsYXk6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSAkZHJhZ0VuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlO1xuICAgIHB1YmxpYyAkZm9jdXNUaW1vdXQ6IG51bWJlciA9IDA7XG4gICAgcHVibGljICR0b29sdGlwRm9sbG93c01vdXNlOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlIHN0YXRlOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBjbGllbnRYOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBjbGllbnRZOiBudW1iZXI7XG4gICAgcHVibGljIGlzTW91c2VQcmVzc2VkOiBib29sZWFuO1xuICAgIC8qKlxuICAgICAqIFRoZSBmdW5jdGlvbiB0byBjYWxsIHRvIHJlbGVhc2UgYSBjYXB0dXJlZCBtb3VzZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbGVhc2VNb3VzZTogKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICBwdWJsaWMgbW91c2Vkb3duRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSAkbW91c2VNb3ZlZDtcbiAgICBwcml2YXRlICRvbkNhcHR1cmVNb3VzZU1vdmU7XG4gICAgcHVibGljICRjbGlja1NlbGVjdGlvbjogUmFuZ2UgPSBudWxsO1xuICAgIHB1YmxpYyAkbGFzdFNjcm9sbFRpbWU6IG51bWJlcjtcbiAgICBwdWJsaWMgc2VsZWN0QnlMaW5lczogKCkgPT4gdm9pZDtcbiAgICBwdWJsaWMgc2VsZWN0QnlXb3JkczogKCkgPT4gdm9pZDtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICAvLyBGSVhNRTogRGlkIEkgbWVudGlvbiB0aGF0IGB0aGlzYCwgYG5ld2AsIGBjbGFzc2AsIGBiaW5kYCBhcmUgdGhlIDQgaG9yc2VtZW4/XG4gICAgICAgIC8vIEZJWE1FOiBGdW5jdGlvbiBTY29waW5nIGlzIHRoZSBhbnN3ZXIuXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG4gICAgICAgIC8vIEZJWE1FOiBXZSBzaG91bGQgYmUgY2xlYW5pbmcgdXAgdGhlc2UgaGFuZGxlcnMgaW4gYSBkaXNwb3NlIG1ldGhvZC4uLlxuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoJ21vdXNlZG93bicsIG1ha2VNb3VzZURvd25IYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoJ21vdXNld2hlZWwnLCBtYWtlTW91c2VXaGVlbEhhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImRibGNsaWNrXCIsIG1ha2VEb3VibGVDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcInRyaXBsZWNsaWNrXCIsIG1ha2VUcmlwbGVDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcInF1YWRjbGlja1wiLCBtYWtlUXVhZENsaWNrSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcblxuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXMgPSBtYWtlRXh0ZW5kU2VsZWN0aW9uQnkoZWRpdG9yLCB0aGlzLCBcImdldExpbmVSYW5nZVwiKTtcbiAgICAgICAgdGhpcy5zZWxlY3RCeVdvcmRzID0gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvciwgdGhpcywgXCJnZXRXb3JkUmFuZ2VcIik7XG5cbiAgICAgICAgbmV3IEd1dHRlckhhbmRsZXIodGhpcyk7XG4gICAgICAgIC8vICAgICAgRklYTUU6IG5ldyBEcmFnZHJvcEhhbmRsZXIodGhpcyk7XG5cbiAgICAgICAgdmFyIG9uTW91c2VEb3duID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFlZGl0b3IuaXNGb2N1c2VkKCkgJiYgZWRpdG9yLnRleHRJbnB1dCkge1xuICAgICAgICAgICAgICAgIGVkaXRvci50ZXh0SW5wdXQubW92ZVRvTW91c2UoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBtb3VzZVRhcmdldDogSFRNTERpdkVsZW1lbnQgPSBlZGl0b3IucmVuZGVyZXIuZ2V0TW91c2VFdmVudFRhcmdldCgpO1xuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJjbGlja1wiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiY2xpY2tcIikpO1xuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJtb3VzZW1vdmVcIiwgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMsIFwibW91c2Vtb3ZlXCIpKTtcbiAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihtb3VzZVRhcmdldCwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgaWYgKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWKSB7XG4gICAgICAgICAgICBhZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWLmlubmVyLCBbNDAwLCAzMDAsIDI1MF0sIHRoaXMsIFwib25Nb3VzZUV2ZW50XCIpO1xuICAgICAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFySC5pbm5lciwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgICAgIGlmIChpc0lFKSB7XG4gICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYuZWxlbWVudCwgXCJtb3VzZWRvd25cIiwgb25Nb3VzZURvd24pO1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IEkgd29uZGVyIGlmIHdlIHNob3VsZCBiZSByZXNwb25kaW5nIHRvIG1vdXNlZG93biAoYnkgc3ltbWV0cnkpP1xuICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJILmVsZW1lbnQsIFwibW91c2Vtb3ZlXCIsIG9uTW91c2VEb3duKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdlIGhvb2sgJ21vdXNld2hlZWwnIHVzaW5nIHRoZSBwb3J0YWJsZSBcbiAgICAgICAgYWRkTW91c2VXaGVlbExpc3RlbmVyKGVkaXRvci5jb250YWluZXIsIHRoaXMuZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudC5iaW5kKHRoaXMsIFwibW91c2V3aGVlbFwiKSk7XG5cbiAgICAgICAgdmFyIGd1dHRlckVsID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXI7XG4gICAgICAgIGFkZExpc3RlbmVyKGd1dHRlckVsLCBcIm1vdXNlZG93blwiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVybW91c2Vkb3duXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiZGJsY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmRibGNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vtb3ZlXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJtb3VzZW1vdmVcIikpO1xuXG4gICAgICAgIGFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcIm1vdXNlZG93blwiLCBvbk1vdXNlRG93bik7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vkb3duXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgcmV0dXJuIHByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBIYW5kbGUgYG1vdXNlbW92ZWAgd2hpbGUgdGhlIG1vdXNlIGlzIG92ZXIgdGhlIGVkaXRpbmcgYXJlYSAoYW5kIG5vdCB0aGUgZ3V0dGVyKS5cbiAgICAgICAgZWRpdG9yLm9uKCdtb3VzZW1vdmUnLCBmdW5jdGlvbihlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoX3NlbGYuc3RhdGUgfHwgX3NlbGYuJGRyYWdEZWxheSB8fCAhX3NlbGYuJGRyYWdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRklYTUU6IFByb2JhYmx5IHMvYiBjbGllbnRYWVxuICAgICAgICAgICAgdmFyIGNoYXIgPSBlZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoZS54LCBlLnkpO1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCkuZ2V0UmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciByZW5kZXJlciA9IGVkaXRvci5yZW5kZXJlcjtcblxuICAgICAgICAgICAgaWYgKCFyYW5nZS5pc0VtcHR5KCkgJiYgcmFuZ2UuaW5zaWRlU3RhcnQoY2hhci5yb3csIGNoYXIuY29sdW1uKSkge1xuICAgICAgICAgICAgICAgIHJlbmRlcmVyLnNldEN1cnNvclN0eWxlKCdkZWZhdWx0Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZW5kZXJlci5zZXRDdXJzb3JTdHlsZShcIlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgb25Nb3VzZUV2ZW50KG5hbWU6IHN0cmluZywgZTogTW91c2VFdmVudCkge1xuICAgICAgICB0aGlzLmVkaXRvci5fZW1pdChuYW1lLCBuZXcgRWRpdG9yTW91c2VFdmVudChlLCB0aGlzLmVkaXRvcikpO1xuICAgIH1cblxuICAgIG9uTW91c2VNb3ZlKG5hbWU6IHN0cmluZywgZTogTW91c2VFdmVudCkge1xuICAgICAgICAvLyBJZiBub2JvZHkgaXMgbGlzdGVuaW5nLCBhdm9pZCB0aGUgY3JlYXRpb24gb2YgdGhlIHRlbXBvcmFyeSB3cmFwcGVyLlxuICAgICAgICAvLyBvcHRpbWl6YXRpb24sIGJlY2F1c2UgbW91c2Vtb3ZlIGRvZXNuJ3QgaGF2ZSBhIGRlZmF1bHQgaGFuZGxlci5cbiAgICAgICAgdmFyIGxpc3RlbmVycyA9IHRoaXMuZWRpdG9yLl9ldmVudFJlZ2lzdHJ5ICYmIHRoaXMuZWRpdG9yLl9ldmVudFJlZ2lzdHJ5Wydtb3VzZW1vdmUnXTtcbiAgICAgICAgaWYgKCFsaXN0ZW5lcnMgfHwgIWxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKSk7XG4gICAgfVxuXG4gICAgZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudChuYW1lOiBzdHJpbmcsIGU6IE1vdXNlV2hlZWxFdmVudCkge1xuICAgICAgICB2YXIgbW91c2VFdmVudCA9IG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKTtcbiAgICAgICAgbW91c2VFdmVudC5zcGVlZCA9IHRoaXMuJHNjcm9sbFNwZWVkICogMjtcbiAgICAgICAgbW91c2VFdmVudC53aGVlbFggPSBlWyd3aGVlbFgnXTtcbiAgICAgICAgbW91c2VFdmVudC53aGVlbFkgPSBlWyd3aGVlbFknXTtcbiAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbW91c2VFdmVudCk7XG4gICAgfVxuXG4gICAgc2V0U3RhdGUoc3RhdGU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnN0YXRlID0gc3RhdGU7XG4gICAgfVxuXG4gICAgdGV4dENvb3JkaW5hdGVzKCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgIH1cblxuICAgIGNhcHR1cmVNb3VzZShldjogRWRpdG9yTW91c2VFdmVudCwgbW91c2VNb3ZlSGFuZGxlcj86IChtb3VzZUV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkKSB7XG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGV2LmNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGV2LmNsaWVudFk7XG5cbiAgICAgICAgdGhpcy5pc01vdXNlUHJlc3NlZCA9IHRydWU7XG5cbiAgICAgICAgLy8gZG8gbm90IG1vdmUgdGV4dGFyZWEgZHVyaW5nIHNlbGVjdGlvblxuICAgICAgICB2YXIgcmVuZGVyZXIgPSB0aGlzLmVkaXRvci5yZW5kZXJlcjtcbiAgICAgICAgaWYgKHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvcikge1xuICAgICAgICAgICAgcmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvbk1vdXNlTW92ZSA9IChmdW5jdGlvbihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihtb3VzZUV2ZW50OiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFtb3VzZUV2ZW50KSByZXR1cm47XG4gICAgICAgICAgICAgICAgLy8gaWYgZWRpdG9yIGlzIGxvYWRlZCBpbnNpZGUgaWZyYW1lLCBhbmQgbW91c2V1cCBldmVudCBpcyBvdXRzaWRlXG4gICAgICAgICAgICAgICAgLy8gd2Ugd29uJ3QgcmVjaWV2ZSBpdCwgc28gd2UgY2FuY2VsIG9uIGZpcnN0IG1vdXNlbW92ZSB3aXRob3V0IGJ1dHRvblxuICAgICAgICAgICAgICAgIGlmIChpc1dlYktpdCAmJiAhbW91c2VFdmVudC53aGljaCAmJiBtb3VzZUhhbmRsZXIucmVsZWFzZU1vdXNlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IEZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBJJ20gcGFzc2luZyB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIC8vIGJ1dCBpdCB3b3VsZCBwcm9iYWJseSBtYWtlIG1vcmUgc2Vuc2UgdG8gcGFzcyB0aGUgbW91c2UgZXZlbnRcbiAgICAgICAgICAgICAgICAgICAgLy8gc2luY2UgdGhhdCBpcyB0aGUgZmluYWwgZXZlbnQuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtb3VzZUhhbmRsZXIucmVsZWFzZU1vdXNlKHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNsaWVudFggPSBtb3VzZUV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNsaWVudFkgPSBtb3VzZUV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICAgICAgbW91c2VNb3ZlSGFuZGxlciAmJiBtb3VzZU1vdmVIYW5kbGVyKG1vdXNlRXZlbnQpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5tb3VzZUV2ZW50ID0gbmV3IEVkaXRvck1vdXNlRXZlbnQobW91c2VFdmVudCwgZWRpdG9yKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJG1vdXNlTW92ZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSh0aGlzLmVkaXRvciwgdGhpcyk7XG5cbiAgICAgICAgdmFyIG9uQ2FwdHVyZUVuZCA9IChmdW5jdGlvbihtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVySWQpO1xuICAgICAgICAgICAgICAgIG9uQ2FwdHVyZUludGVydmFsKCk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZSArIFwiRW5kXCJdICYmIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGUgKyBcIkVuZFwiXShlKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuc3RhdGUgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChyZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJlci4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmlzTW91c2VQcmVzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRvbkNhcHR1cmVNb3VzZU1vdmUgPSBtb3VzZUhhbmRsZXIucmVsZWFzZU1vdXNlID0gbnVsbDtcbiAgICAgICAgICAgICAgICBlICYmIG1vdXNlSGFuZGxlci5vbk1vdXNlRXZlbnQoXCJtb3VzZXVwXCIsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSh0aGlzKTtcblxuICAgICAgICB2YXIgb25DYXB0dXJlSW50ZXJ2YWwgPSAoZnVuY3Rpb24obW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlXSAmJiBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlXSgpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbW91c2VNb3ZlZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSh0aGlzKTtcblxuICAgICAgICBpZiAoaXNPbGRJRSAmJiBldi5kb21FdmVudC50eXBlID09IFwiZGJsY2xpY2tcIikge1xuICAgICAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IG9uQ2FwdHVyZUVuZChldik7IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kb25DYXB0dXJlTW91c2VNb3ZlID0gb25Nb3VzZU1vdmU7XG4gICAgICAgIHRoaXMucmVsZWFzZU1vdXNlID0gY2FwdHVyZSh0aGlzLmVkaXRvci5jb250YWluZXIsIG9uTW91c2VNb3ZlLCBvbkNhcHR1cmVFbmQpO1xuICAgICAgICB2YXIgdGltZXJJZCA9IHNldEludGVydmFsKG9uQ2FwdHVyZUludGVydmFsLCAyMCk7XG4gICAgfVxuXG4gICAgY2FuY2VsQ29udGV4dE1lbnUoKTogdm9pZCB7XG4gICAgICAgIHZhciBzdG9wID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKGUgJiYgZS5kb21FdmVudCAmJiBlLmRvbUV2ZW50LnR5cGUgIT0gXCJjb250ZXh0bWVudVwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwibmF0aXZlY29udGV4dG1lbnVcIiwgc3RvcCk7XG4gICAgICAgICAgICBpZiAoZSAmJiBlLmRvbUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgc3RvcEV2ZW50KGUuZG9tRXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmJpbmQodGhpcyk7XG4gICAgICAgIHNldFRpbWVvdXQoc3RvcCwgMTApO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcIm5hdGl2ZWNvbnRleHRtZW51XCIsIHN0b3ApO1xuICAgIH1cblxuICAgIHNlbGVjdCgpIHtcbiAgICAgICAgdmFyIGFuY2hvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcblxuICAgICAgICBpZiAodGhpcy4kY2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHZhciBjbXAgPSB0aGlzLiRjbGlja1NlbGVjdGlvbi5jb21wYXJlUG9pbnQoY3Vyc29yKTtcblxuICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLmVuZDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY21wID09IDEpIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSB0aGlzLiRjbGlja1NlbGVjdGlvbi5zdGFydDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGVkUmFuZ2UgPSBjYWxjUmFuZ2VPcmllbnRhdGlvbih0aGlzLiRjbGlja1NlbGVjdGlvbiwgY3Vyc29yKTtcbiAgICAgICAgICAgICAgICBjdXJzb3IgPSBvcmllbnRlZFJhbmdlLmN1cnNvcjtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBvcmllbnRlZFJhbmdlLmFuY2hvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24oY3Vyc29yKTtcblxuICAgICAgICB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgIH1cblxuICAgIHNlbGVjdEJ5TGluZXNFbmQoKSB7XG4gICAgICAgIHRoaXMuJGNsaWNrU2VsZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3IudW5zZXRTdHlsZShcImFjZV9zZWxlY3RpbmdcIik7XG4gICAgICAgIGlmICh0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5yZWxlYXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgdGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsZXIucmVsZWFzZUNhcHR1cmUoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0U2VsZWN0KHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgd2FpdEZvckNsaWNrU2VsZWN0aW9uPzogYm9vbGVhbikge1xuICAgICAgICBwb3MgPSBwb3MgfHwgdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB2YXIgZWRpdG9yID0gdGhpcy5lZGl0b3I7XG4gICAgICAgIC8vIGFsbG93IGRvdWJsZS90cmlwbGUgY2xpY2sgaGFuZGxlcnMgdG8gY2hhbmdlIHNlbGVjdGlvblxuICAgIFxuICAgICAgICBpZiAodGhpcy5tb3VzZWRvd25FdmVudC5nZXRTaGlmdEtleSgpKSB7XG4gICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghd2FpdEZvckNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLm1vdmVUb1Bvc2l0aW9uKHBvcyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXdhaXRGb3JDbGlja1NlbGVjdGlvbikge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3QoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5zZXRDYXB0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5zZXRDYXB0dXJlKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWRpdG9yLnNldFN0eWxlKFwiYWNlX3NlbGVjdGluZ1wiKTtcbiAgICAgICAgdGhpcy5zZXRTdGF0ZShcInNlbGVjdFwiKTtcbiAgICB9XG5cbiAgICBzZWxlY3RFbmQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0QnlMaW5lc0VuZCgpO1xuICAgIH1cblxuICAgIHNlbGVjdEFsbEVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QnlXb3Jkc0VuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgZm9jdXNXYWl0KCkge1xuICAgICAgICB2YXIgZGlzdGFuY2UgPSBjYWxjRGlzdGFuY2UodGhpcy5tb3VzZWRvd25FdmVudC5jbGllbnRYLCB0aGlzLm1vdXNlZG93bkV2ZW50LmNsaWVudFksIHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICAgICAgdmFyIHRpbWUgPSBEYXRlLm5vdygpO1xuXG4gICAgICAgIGlmIChkaXN0YW5jZSA+IERSQUdfT0ZGU0VUIHx8IHRpbWUgLSB0aGlzLm1vdXNlZG93bkV2ZW50LnRpbWUgPiB0aGlzLiRmb2N1c1RpbW91dCkge1xuICAgICAgICAgICAgdGhpcy5zdGFydFNlbGVjdCh0aGlzLm1vdXNlZG93bkV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKSk7XG4gICAgICAgIH1cbiAgICB9XG5cbn1cblxuZGVmaW5lT3B0aW9ucyhNb3VzZUhhbmRsZXIucHJvdG90eXBlLCBcIm1vdXNlSGFuZGxlclwiLCB7XG4gICAgc2Nyb2xsU3BlZWQ6IHsgaW5pdGlhbFZhbHVlOiAyIH0sXG4gICAgZHJhZ0RlbGF5OiB7IGluaXRpYWxWYWx1ZTogKGlzTWFjID8gMTUwIDogMCkgfSxcbiAgICBkcmFnRW5hYmxlZDogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICBmb2N1c1RpbW91dDogeyBpbml0aWFsVmFsdWU6IDAgfSxcbiAgICB0b29sdGlwRm9sbG93c01vdXNlOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9XG59KTtcblxuLypcbiAqIEN1c3RvbSBBY2UgbW91c2UgZXZlbnRcbiAqL1xuY2xhc3MgRWRpdG9yTW91c2VFdmVudCB7XG4gICAgLy8gV2Uga2VlcCB0aGUgb3JpZ2luYWwgRE9NIGV2ZW50XG4gICAgcHVibGljIGRvbUV2ZW50OiBNb3VzZUV2ZW50O1xuICAgIHByaXZhdGUgZWRpdG9yOiBFZGl0b3I7XG4gICAgcHVibGljIGNsaWVudFg6IG51bWJlcjtcbiAgICBwdWJsaWMgY2xpZW50WTogbnVtYmVyO1xuICAgIC8qKlxuICAgICAqIENhY2hlZCB0ZXh0IGNvb3JkaW5hdGVzIGZvbGxvd2luZyBnZXREb2N1bWVudFBvc2l0aW9uKClcbiAgICAgKi9cbiAgICBwcml2YXRlICRwb3M6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgcHJpdmF0ZSAkaW5TZWxlY3Rpb247XG4gICAgcHJpdmF0ZSBwcm9wYWdhdGlvblN0b3BwZWQgPSBmYWxzZTtcbiAgICBwcml2YXRlIGRlZmF1bHRQcmV2ZW50ZWQgPSBmYWxzZTtcbiAgICBwdWJsaWMgdGltZTogbnVtYmVyO1xuICAgIC8vIHdoZWVsWSwgd2hlZWxZIGFuZCBzcGVlZCBhcmUgZm9yICdtb3VzZXdoZWVsJyBldmVudHMuXG4gICAgcHVibGljIHdoZWVsWDogbnVtYmVyO1xuICAgIHB1YmxpYyB3aGVlbFk6IG51bWJlcjtcbiAgICBwdWJsaWMgc3BlZWQ6IG51bWJlcjtcbiAgICBjb25zdHJ1Y3Rvcihkb21FdmVudDogTW91c2VFdmVudCwgZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdGhpcy5kb21FdmVudCA9IGRvbUV2ZW50O1xuICAgICAgICB0aGlzLmVkaXRvciA9IGVkaXRvcjtcblxuICAgICAgICB0aGlzLmNsaWVudFggPSBkb21FdmVudC5jbGllbnRYO1xuICAgICAgICB0aGlzLmNsaWVudFkgPSBkb21FdmVudC5jbGllbnRZO1xuXG4gICAgICAgIHRoaXMuJHBvcyA9IG51bGw7XG4gICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gbnVsbDtcbiAgICB9XG5cbiAgICBnZXQgdG9FbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb21FdmVudC50b0VsZW1lbnQ7XG4gICAgfVxuXG4gICAgc3RvcFByb3BhZ2F0aW9uKCkge1xuICAgICAgICBzdG9wUHJvcGFnYXRpb24odGhpcy5kb21FdmVudCk7XG4gICAgICAgIHRoaXMucHJvcGFnYXRpb25TdG9wcGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcmV2ZW50RGVmYXVsdCgpIHtcbiAgICAgICAgcHJldmVudERlZmF1bHQodGhpcy5kb21FdmVudCk7XG4gICAgICAgIHRoaXMuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgc3RvcCgpIHtcbiAgICAgICAgdGhpcy5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgdGhpcy5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogR2V0IHRoZSBkb2N1bWVudCBwb3NpdGlvbiBiZWxvdyB0aGUgbW91c2UgY3Vyc29yXG4gICAgICogXG4gICAgICogQHJldHVybiB7T2JqZWN0fSAncm93JyBhbmQgJ2NvbHVtbicgb2YgdGhlIGRvY3VtZW50IHBvc2l0aW9uXG4gICAgICovXG4gICAgZ2V0RG9jdW1lbnRQb3NpdGlvbigpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgaWYgKCF0aGlzLiRwb3MpIHtcbiAgICAgICAgICAgIHRoaXMuJHBvcyA9IHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy4kcG9zO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIENoZWNrIGlmIHRoZSBtb3VzZSBjdXJzb3IgaXMgaW5zaWRlIG9mIHRoZSB0ZXh0IHNlbGVjdGlvblxuICAgICAqIFxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhlIG1vdXNlIGN1cnNvciBpcyBpbnNpZGUgb2YgdGhlIHNlbGVjdGlvblxuICAgICAqL1xuICAgIGluU2VsZWN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy4kaW5TZWxlY3Rpb24gIT09IG51bGwpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kaW5TZWxlY3Rpb247XG5cbiAgICAgICAgdmFyIGVkaXRvciA9IHRoaXMuZWRpdG9yO1xuXG5cbiAgICAgICAgdmFyIHNlbGVjdGlvblJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChzZWxlY3Rpb25SYW5nZS5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLiRpblNlbGVjdGlvbiA9IGZhbHNlO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gc2VsZWN0aW9uUmFuZ2UuY29udGFpbnMocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy4kaW5TZWxlY3Rpb247XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogR2V0IHRoZSBjbGlja2VkIG1vdXNlIGJ1dHRvblxuICAgICAqIFxuICAgICAqIEByZXR1cm4ge051bWJlcn0gMCBmb3IgbGVmdCBidXR0b24sIDEgZm9yIG1pZGRsZSBidXR0b24sIDIgZm9yIHJpZ2h0IGJ1dHRvblxuICAgICAqL1xuICAgIGdldEJ1dHRvbigpIHtcbiAgICAgICAgcmV0dXJuIGdldEJ1dHRvbih0aGlzLmRvbUV2ZW50KTtcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufSB3aGV0aGVyIHRoZSBzaGlmdCBrZXkgd2FzIHByZXNzZWQgd2hlbiB0aGUgZXZlbnQgd2FzIGVtaXR0ZWRcbiAgICAgKi9cbiAgICBnZXRTaGlmdEtleSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tRXZlbnQuc2hpZnRLZXk7XG4gICAgfVxuXG4gICAgZ2V0QWNjZWxLZXkgPSBpc01hYyA/IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kb21FdmVudC5tZXRhS2V5OyB9IDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvbUV2ZW50LmN0cmxLZXk7IH07XG59XG5cbnZhciBEUkFHX09GRlNFVCA9IDA7IC8vIHBpeGVsc1xuXG5mdW5jdGlvbiBtYWtlTW91c2VEb3duSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZXY6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgdmFyIGluU2VsZWN0aW9uID0gZXYuaW5TZWxlY3Rpb24oKTtcbiAgICAgICAgdmFyIHBvcyA9IGV2LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlZG93bkV2ZW50ID0gZXY7XG5cbiAgICAgICAgdmFyIGJ1dHRvbiA9IGV2LmdldEJ1dHRvbigpO1xuICAgICAgICBpZiAoYnV0dG9uICE9PSAwKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbXB0eSA9IHNlbGVjdGlvblJhbmdlLmlzRW1wdHkoKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGlvbkVtcHR5KVxuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcblxuICAgICAgICAgICAgLy8gMjogY29udGV4dG1lbnUsIDE6IGxpbnV4IHBhc3RlXG4gICAgICAgICAgICBlZGl0b3IudGV4dElucHV0Lm9uQ29udGV4dE1lbnUoZXYuZG9tRXZlbnQpO1xuICAgICAgICAgICAgcmV0dXJuOyAvLyBzdG9wcGluZyBldmVudCBoZXJlIGJyZWFrcyBjb250ZXh0bWVudSBvbiBmZiBtYWNcbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5tb3VzZWRvd25FdmVudC50aW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gaWYgdGhpcyBjbGljayBjYXVzZWQgdGhlIGVkaXRvciB0byBiZSBmb2N1c2VkIHNob3VsZCBub3QgY2xlYXIgdGhlXG4gICAgICAgIC8vIHNlbGVjdGlvblxuICAgICAgICBpZiAoaW5TZWxlY3Rpb24gJiYgIWVkaXRvci5pc0ZvY3VzZWQoKSkge1xuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICBpZiAobW91c2VIYW5kbGVyLiRmb2N1c1RpbW91dCAmJiAhbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiAmJiAhZWRpdG9yLmluTXVsdGlTZWxlY3RNb2RlKSB7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwiZm9jdXNXYWl0XCIpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZXYpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZXYpO1xuICAgICAgICAvLyBUT0RPOiBfY2xpY2tzIGlzIGEgY3VzdG9tIHByb3BlcnR5IGFkZGVkIGluIGV2ZW50LnRzIGJ5IHRoZSAnbW91c2Vkb3duJyBsaXN0ZW5lci5cbiAgICAgICAgbW91c2VIYW5kbGVyLnN0YXJ0U2VsZWN0KHBvcywgZXYuZG9tRXZlbnRbJ19jbGlja3MnXSA+IDEpO1xuICAgICAgICByZXR1cm4gZXYucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VNb3VzZVdoZWVsSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZXY6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgaWYgKGV2LmdldEFjY2VsS2V5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vc2hpZnQgd2hlZWwgdG8gaG9yaXogc2Nyb2xsXG4gICAgICAgIGlmIChldi5nZXRTaGlmdEtleSgpICYmIGV2LndoZWVsWSAmJiAhZXYud2hlZWxYKSB7XG4gICAgICAgICAgICBldi53aGVlbFggPSBldi53aGVlbFk7XG4gICAgICAgICAgICBldi53aGVlbFkgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHQgPSBldi5kb21FdmVudC50aW1lU3RhbXA7XG4gICAgICAgIHZhciBkdCA9IHQgLSAobW91c2VIYW5kbGVyLiRsYXN0U2Nyb2xsVGltZSB8fCAwKTtcblxuICAgICAgICB2YXIgaXNTY3JvbGFibGUgPSBlZGl0b3IucmVuZGVyZXIuaXNTY3JvbGxhYmxlQnkoZXYud2hlZWxYICogZXYuc3BlZWQsIGV2LndoZWVsWSAqIGV2LnNwZWVkKTtcbiAgICAgICAgaWYgKGlzU2Nyb2xhYmxlIHx8IGR0IDwgMjAwKSB7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGxhc3RTY3JvbGxUaW1lID0gdDtcbiAgICAgICAgICAgIGVkaXRvci5yZW5kZXJlci5zY3JvbGxCeShldi53aGVlbFggKiBldi5zcGVlZCwgZXYud2hlZWxZICogZXYuc3BlZWQpO1xuICAgICAgICAgICAgcmV0dXJuIGV2LnN0b3AoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZURvdWJsZUNsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgcG9zID0gZWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLnNlc3Npb247XG5cbiAgICAgICAgdmFyIHJhbmdlID0gc2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UocG9zKTtcbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbisrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0XCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UgPSBlZGl0b3Iuc2VsZWN0aW9uLmdldFdvcmRSYW5nZShwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEJ5V29yZHNcIik7XG4gICAgICAgIH1cbiAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IHJhbmdlO1xuICAgICAgICBtb3VzZUhhbmRsZXIuc2VsZWN0KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlVHJpcGxlQ2xpY2tIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihlZGl0b3JNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgIHZhciBwb3MgPSBlZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcblxuICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RCeUxpbmVzXCIpO1xuICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHJhbmdlLmlzTXVsdGlMaW5lKCkgJiYgcmFuZ2UuY29udGFpbnMocG9zLnJvdywgcG9zLmNvbHVtbikpIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyYW5nZS5zdGFydC5yb3cpO1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5lbmQgPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyYW5nZS5lbmQucm93KS5lbmQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRMaW5lUmFuZ2UocG9zLnJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgbW91c2VIYW5kbGVyLnNlbGVjdCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZVF1YWRDbGlja0hhbmRsZXIoZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVkaXRvck1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgZWRpdG9yLnNlbGVjdEFsbCgpO1xuICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEFsbFwiKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VFeHRlbmRTZWxlY3Rpb25CeShlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIsIHVuaXROYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhbmNob3I7XG4gICAgICAgIHZhciBjdXJzb3IgPSBtb3VzZUhhbmRsZXIudGV4dENvb3JkaW5hdGVzKCk7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5zZWxlY3Rpb25bdW5pdE5hbWVdKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pO1xuXG4gICAgICAgIGlmIChtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB2YXIgY21wU3RhcnQgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChyYW5nZS5zdGFydCk7XG4gICAgICAgICAgICB2YXIgY21wRW5kID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5jb21wYXJlUG9pbnQocmFuZ2UuZW5kKTtcblxuICAgICAgICAgICAgaWYgKGNtcFN0YXJ0ID09IC0xICYmIGNtcEVuZCA8PSAwKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5lbmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmVuZC5yb3cgIT0gY3Vyc29yLnJvdyB8fCByYW5nZS5lbmQuY29sdW1uICE9IGN1cnNvci5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGN1cnNvciA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wRW5kID09IDEgJiYgY21wU3RhcnQgPj0gMCkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyAhPSBjdXJzb3Iucm93IHx8IHJhbmdlLnN0YXJ0LmNvbHVtbiAhPSBjdXJzb3IuY29sdW1uKVxuICAgICAgICAgICAgICAgICAgICBjdXJzb3IgPSByYW5nZS5lbmQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXBTdGFydCA9PSAtMSAmJiBjbXBFbmQgPT0gMSkge1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IHJhbmdlLmVuZDtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBvcmllbnRlZFJhbmdlID0gY2FsY1JhbmdlT3JpZW50YXRpb24obW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiwgY3Vyc29yKTtcbiAgICAgICAgICAgICAgICBjdXJzb3IgPSBvcmllbnRlZFJhbmdlLmN1cnNvcjtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBvcmllbnRlZFJhbmdlLmFuY2hvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIGVkaXRvci5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY2FsY0Rpc3RhbmNlKGF4OiBudW1iZXIsIGF5OiBudW1iZXIsIGJ4OiBudW1iZXIsIGJ5OiBudW1iZXIpIHtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KE1hdGgucG93KGJ4IC0gYXgsIDIpICsgTWF0aC5wb3coYnkgLSBheSwgMikpO1xufVxuXG5mdW5jdGlvbiBjYWxjUmFuZ2VPcmllbnRhdGlvbihyYW5nZTogUmFuZ2UsIGN1cnNvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSk6IHsgY3Vyc29yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9OyBhbmNob3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0gfSB7XG4gICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA9PSByYW5nZS5lbmQucm93KSB7XG4gICAgICAgIHZhciBjbXAgPSAyICogY3Vyc29yLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbiAtIHJhbmdlLmVuZC5jb2x1bW47XG4gICAgfVxuICAgIGVsc2UgaWYgKHJhbmdlLnN0YXJ0LnJvdyA9PSByYW5nZS5lbmQucm93IC0gMSAmJiAhcmFuZ2Uuc3RhcnQuY29sdW1uICYmICFyYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgIHZhciBjbXAgPSBjdXJzb3IuY29sdW1uIC0gNDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciBjbXAgPSAyICogY3Vyc29yLnJvdyAtIHJhbmdlLnN0YXJ0LnJvdyAtIHJhbmdlLmVuZC5yb3c7XG4gICAgfVxuXG4gICAgaWYgKGNtcCA8IDApIHtcbiAgICAgICAgcmV0dXJuIHsgY3Vyc29yOiByYW5nZS5zdGFydCwgYW5jaG9yOiByYW5nZS5lbmQgfTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiB7IGN1cnNvcjogcmFuZ2UuZW5kLCBhbmNob3I6IHJhbmdlLnN0YXJ0IH07XG4gICAgfVxufVxuXG5jbGFzcyBHdXR0ZXJIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3Rvcihtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICB2YXIgZWRpdG9yOiBFZGl0b3IgPSBtb3VzZUhhbmRsZXIuZWRpdG9yO1xuICAgICAgICB2YXIgZ3V0dGVyOiBHdXR0ZXIgPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlckxheWVyO1xuICAgICAgICB2YXIgdG9vbHRpcCA9IG5ldyBHdXR0ZXJUb29sdGlwKGVkaXRvci5jb250YWluZXIpO1xuXG4gICAgICAgIG1vdXNlSGFuZGxlci5lZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoXCJndXR0ZXJtb3VzZWRvd25cIiwgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgaWYgKCFlZGl0b3IuaXNGb2N1c2VkKCkgfHwgZS5nZXRCdXR0b24oKSAhPSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZ3V0dGVyUmVnaW9uID0gZ3V0dGVyLmdldFJlZ2lvbihlKTtcblxuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PT0gXCJmb2xkV2lkZ2V0c1wiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcm93ID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbiA9IGVkaXRvci5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuXG4gICAgICAgICAgICBpZiAoZS5nZXRTaGlmdEtleSgpKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uLnNlbGVjdFRvKHJvdywgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoZS5kb21FdmVudC5kZXRhaWwgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlMaW5lc1wiKTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZSk7XG4gICAgICAgICAgICByZXR1cm4gZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9KTtcblxuXG4gICAgICAgIHZhciB0b29sdGlwVGltZW91dDogbnVtYmVyO1xuICAgICAgICB2YXIgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICAgICAgdmFyIHRvb2x0aXBBbm5vdGF0aW9uO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNob3dUb29sdGlwKCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IG1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBhbm5vdGF0aW9uID0gZ3V0dGVyLiRhbm5vdGF0aW9uc1tyb3ddO1xuICAgICAgICAgICAgaWYgKCFhbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1heFJvdyA9IGVkaXRvci5zZXNzaW9uLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA9PSBtYXhSb3cpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2NyZWVuUm93ID0gZWRpdG9yLnJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcygwLCBtb3VzZUV2ZW50LmNsaWVudFkpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gbW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHNjcmVlblJvdyA+IGVkaXRvci5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3cocG9zLnJvdywgcG9zLmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0b29sdGlwQW5ub3RhdGlvbiA9PSBhbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG9vbHRpcEFubm90YXRpb24gPSBhbm5vdGF0aW9uLnRleHQuam9pbihcIjxici8+XCIpO1xuXG4gICAgICAgICAgICB0b29sdGlwLnNldEh0bWwodG9vbHRpcEFubm90YXRpb24pO1xuXG4gICAgICAgICAgICB0b29sdGlwLnNob3coKTtcblxuICAgICAgICAgICAgZWRpdG9yLm9uKFwibW91c2V3aGVlbFwiLCBoaWRlVG9vbHRpcCk7XG5cbiAgICAgICAgICAgIGlmIChtb3VzZUhhbmRsZXIuJHRvb2x0aXBGb2xsb3dzTW91c2UpIHtcbiAgICAgICAgICAgICAgICBtb3ZlVG9vbHRpcChtb3VzZUV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBndXR0ZXJFbGVtZW50ID0gZ3V0dGVyLiRjZWxsc1tlZGl0b3Iuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KHJvdywgMCldLmVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgdmFyIHJlY3QgPSBndXR0ZXJFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgICAgIHZhciBzdHlsZSA9IHRvb2x0aXAuZ2V0RWxlbWVudCgpLnN0eWxlO1xuICAgICAgICAgICAgICAgIHN0eWxlLmxlZnQgPSByZWN0LnJpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgIHN0eWxlLnRvcCA9IHJlY3QuYm90dG9tICsgXCJweFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaGlkZVRvb2x0aXAoZXZlbnQsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgICAgICBpZiAodG9vbHRpcFRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodG9vbHRpcFRpbWVvdXQpO1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcC5oaWRlKCk7XG4gICAgICAgICAgICAgICAgdG9vbHRpcEFubm90YXRpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGVkaXRvci5vZmYoXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG1vdmVUb29sdGlwKGV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICB0b29sdGlwLnNldFBvc2l0aW9uKGV2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlbW92ZVwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogT2JmdXNjYXRpbmcgdGhlIHR5cGUgb2YgdGFyZ2V0IHRvIHRod2FydCBjb21waWxlci5cbiAgICAgICAgICAgIHZhciB0YXJnZXQ6IGFueSA9IGUuZG9tRXZlbnQudGFyZ2V0IHx8IGUuZG9tRXZlbnQuc3JjRWxlbWVudDtcbiAgICAgICAgICAgIGlmIChoYXNDc3NDbGFzcyh0YXJnZXQsIFwiYWNlX2ZvbGQtd2lkZ2V0XCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uICYmIG1vdXNlSGFuZGxlci4kdG9vbHRpcEZvbGxvd3NNb3VzZSkge1xuICAgICAgICAgICAgICAgIG1vdmVUb29sdGlwKGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtb3VzZUV2ZW50ID0gZTtcbiAgICAgICAgICAgIGlmICh0b29sdGlwVGltZW91dCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKG1vdXNlRXZlbnQgJiYgIW1vdXNlSGFuZGxlci5pc01vdXNlUHJlc3NlZClcbiAgICAgICAgICAgICAgICAgICAgc2hvd1Rvb2x0aXAoKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH0sIDUwKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXIsIFwibW91c2VvdXRcIiwgZnVuY3Rpb24oZTogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgbW91c2VFdmVudCA9IG51bGw7XG4gICAgICAgICAgICBpZiAoIXRvb2x0aXBBbm5vdGF0aW9uIHx8IHRvb2x0aXBUaW1lb3V0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICB9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGVkaXRvci5vbihcImNoYW5nZVNlc3Npb25cIiwgaGlkZVRvb2x0aXApO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAY2xhc3MgR3V0dGVyVG9vbHRpcFxuICogQGV4dGVuZHMgVG9vbHRpcFxuICovXG5jbGFzcyBHdXR0ZXJUb29sdGlwIGV4dGVuZHMgVG9vbHRpcCB7XG4gICAgY29uc3RydWN0b3IocGFyZW50Tm9kZTogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50Tm9kZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0UG9zaXRpb25cbiAgICAgKiBAcGFyYW0geCB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSB5IHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRQb3NpdGlvbih4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG4gICAgICAgIHZhciB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodDtcbiAgICAgICAgdmFyIHdpZHRoID0gdGhpcy5nZXRXaWR0aCgpO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHQoKTtcbiAgICAgICAgeCArPSAxNTtcbiAgICAgICAgeSArPSAxNTtcbiAgICAgICAgaWYgKHggKyB3aWR0aCA+IHdpbmRvd1dpZHRoKSB7XG4gICAgICAgICAgICB4IC09ICh4ICsgd2lkdGgpIC0gd2luZG93V2lkdGg7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHkgKyBoZWlnaHQgPiB3aW5kb3dIZWlnaHQpIHtcbiAgICAgICAgICAgIHkgLT0gMjAgKyBoZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgc3VwZXIuc2V0UG9zaXRpb24oeCwgeSk7XG4gICAgfVxufVxuIl19