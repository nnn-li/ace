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
        if (this.session === session) {
            return;
        }
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
        if (text === "\t") {
            text = this.session.getTabString();
        }
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
        if (shouldOutdent) {
            mode.autoOutdent(lineState, session, cursor.row);
        }
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
            var session = editor.getSession();
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
                var session = editor.getSession();
                if (session['foldWidgets'] && session['foldWidgets'][row]) {
                    session['onFoldWidgetClick'](row, e);
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
                var session = editor.getSession();
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
            var range = editor.getSession().getSelection().getRange();
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
        var session = editor.getSession();
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
            var selection = editor.getSession().getSelection();
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
            var session = editor.getSession();
            var maxRow = session.getLength();
            if (row == maxRow) {
                var screenRow = editor.renderer.pixelToScreenCoordinates(0, mouseEvent.clientY).row;
                var pos = mouseEvent.getDocumentPosition();
                if (screenRow > session.documentToScreenRow(pos.row, pos.column)) {
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
                var gutterElement = gutter.$cells[editor.getSession().documentToScreenRow(row, 0)].element;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0VkaXRvci50cyJdLCJuYW1lcyI6WyJFZGl0b3IiLCJFZGl0b3IuY29uc3RydWN0b3IiLCJFZGl0b3IuY2FuY2VsTW91c2VDb250ZXh0TWVudSIsIkVkaXRvci5zZWxlY3Rpb24iLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMiLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMubGFzdCIsIkVkaXRvci5zdGFydE9wZXJhdGlvbiIsIkVkaXRvci5lbmRPcGVyYXRpb24iLCJFZGl0b3IuJGhpc3RvcnlUcmFja2VyIiwiRWRpdG9yLnNldEtleWJvYXJkSGFuZGxlciIsIkVkaXRvci5nZXRLZXlib2FyZEhhbmRsZXIiLCJFZGl0b3Iuc2V0U2Vzc2lvbiIsIkVkaXRvci5nZXRTZXNzaW9uIiwiRWRpdG9yLnNldFZhbHVlIiwiRWRpdG9yLmdldFZhbHVlIiwiRWRpdG9yLmdldFNlbGVjdGlvbiIsIkVkaXRvci5yZXNpemUiLCJFZGl0b3Iuc2V0VGhlbWUiLCJFZGl0b3IuZ2V0VGhlbWUiLCJFZGl0b3Iuc2V0U3R5bGUiLCJFZGl0b3IudW5zZXRTdHlsZSIsIkVkaXRvci5nZXRGb250U2l6ZSIsIkVkaXRvci5zZXRGb250U2l6ZSIsIkVkaXRvci4kaGlnaGxpZ2h0QnJhY2tldHMiLCJFZGl0b3IuJGhpZ2hsaWdodFRhZ3MiLCJFZGl0b3IuZm9jdXMiLCJFZGl0b3IuaXNGb2N1c2VkIiwiRWRpdG9yLmJsdXIiLCJFZGl0b3Iub25Gb2N1cyIsIkVkaXRvci5vbkJsdXIiLCJFZGl0b3IuJGN1cnNvckNoYW5nZSIsIkVkaXRvci5vbkRvY3VtZW50Q2hhbmdlIiwiRWRpdG9yLm9uVG9rZW5pemVyVXBkYXRlIiwiRWRpdG9yLm9uU2Nyb2xsVG9wQ2hhbmdlIiwiRWRpdG9yLm9uU2Nyb2xsTGVmdENoYW5nZSIsIkVkaXRvci5vbkN1cnNvckNoYW5nZSIsIkVkaXRvci4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5vblNlbGVjdGlvbkNoYW5nZSIsIkVkaXRvci4kZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwIiwiRWRpdG9yLm9uQ2hhbmdlRnJvbnRNYXJrZXIiLCJFZGl0b3Iub25DaGFuZ2VCYWNrTWFya2VyIiwiRWRpdG9yLm9uQ2hhbmdlQnJlYWtwb2ludCIsIkVkaXRvci5vbkNoYW5nZUFubm90YXRpb24iLCJFZGl0b3Iub25DaGFuZ2VNb2RlIiwiRWRpdG9yLm9uQ2hhbmdlV3JhcExpbWl0IiwiRWRpdG9yLm9uQ2hhbmdlV3JhcE1vZGUiLCJFZGl0b3Iub25DaGFuZ2VGb2xkIiwiRWRpdG9yLmdldFNlbGVjdGVkVGV4dCIsIkVkaXRvci5nZXRDb3B5VGV4dCIsIkVkaXRvci5vbkNvcHkiLCJFZGl0b3Iub25DdXQiLCJFZGl0b3Iub25QYXN0ZSIsIkVkaXRvci5leGVjQ29tbWFuZCIsIkVkaXRvci5pbnNlcnQiLCJFZGl0b3Iub25UZXh0SW5wdXQiLCJFZGl0b3Iub25Db21tYW5kS2V5IiwiRWRpdG9yLnNldE92ZXJ3cml0ZSIsIkVkaXRvci5nZXRPdmVyd3JpdGUiLCJFZGl0b3IudG9nZ2xlT3ZlcndyaXRlIiwiRWRpdG9yLnNldFNjcm9sbFNwZWVkIiwiRWRpdG9yLmdldFNjcm9sbFNwZWVkIiwiRWRpdG9yLnNldERyYWdEZWxheSIsIkVkaXRvci5nZXREcmFnRGVsYXkiLCJFZGl0b3Iuc2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3IuZ2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3Iuc2V0SGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5nZXRIaWdobGlnaHRBY3RpdmVMaW5lIiwiRWRpdG9yLnNldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIkVkaXRvci5zZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkIiwiRWRpdG9yLnNldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLmdldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLnNldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLmdldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJFZGl0b3IuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIkVkaXRvci5zZXRTaG93UHJpbnRNYXJnaW4iLCJFZGl0b3IuZ2V0U2hvd1ByaW50TWFyZ2luIiwiRWRpdG9yLnNldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLmdldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLnNldFJlYWRPbmx5IiwiRWRpdG9yLmdldFJlYWRPbmx5IiwiRWRpdG9yLnNldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLmdldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLnNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5nZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQiLCJFZGl0b3Iuc2V0U2hvd0ZvbGRXaWRnZXRzIiwiRWRpdG9yLmdldFNob3dGb2xkV2lkZ2V0cyIsIkVkaXRvci5zZXRGYWRlRm9sZFdpZGdldHMiLCJFZGl0b3IuZ2V0RmFkZUZvbGRXaWRnZXRzIiwiRWRpdG9yLnJlbW92ZSIsIkVkaXRvci5yZW1vdmVXb3JkUmlnaHQiLCJFZGl0b3IucmVtb3ZlV29yZExlZnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lU3RhcnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lRW5kIiwiRWRpdG9yLnNwbGl0TGluZSIsIkVkaXRvci50cmFuc3Bvc2VMZXR0ZXJzIiwiRWRpdG9yLnRvTG93ZXJDYXNlIiwiRWRpdG9yLnRvVXBwZXJDYXNlIiwiRWRpdG9yLmluZGVudCIsIkVkaXRvci5ibG9ja0luZGVudCIsIkVkaXRvci5ibG9ja091dGRlbnQiLCJFZGl0b3Iuc29ydExpbmVzIiwiRWRpdG9yLnRvZ2dsZUNvbW1lbnRMaW5lcyIsIkVkaXRvci50b2dnbGVCbG9ja0NvbW1lbnQiLCJFZGl0b3IuZ2V0TnVtYmVyQXQiLCJFZGl0b3IubW9kaWZ5TnVtYmVyIiwiRWRpdG9yLnJlbW92ZUxpbmVzIiwiRWRpdG9yLmR1cGxpY2F0ZVNlbGVjdGlvbiIsIkVkaXRvci5tb3ZlTGluZXNEb3duIiwiRWRpdG9yLm1vdmVMaW5lc1VwIiwiRWRpdG9yLm1vdmVUZXh0IiwiRWRpdG9yLmNvcHlMaW5lc1VwIiwiRWRpdG9yLmNvcHlMaW5lc0Rvd24iLCJFZGl0b3IuJG1vdmVMaW5lcyIsIkVkaXRvci4kZ2V0U2VsZWN0ZWRSb3dzIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25TdGFydCIsIkVkaXRvci5vbkNvbXBvc2l0aW9uVXBkYXRlIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25FbmQiLCJFZGl0b3IuZ2V0Rmlyc3RWaXNpYmxlUm93IiwiRWRpdG9yLmdldExhc3RWaXNpYmxlUm93IiwiRWRpdG9yLmlzUm93VmlzaWJsZSIsIkVkaXRvci5pc1Jvd0Z1bGx5VmlzaWJsZSIsIkVkaXRvci4kZ2V0VmlzaWJsZVJvd0NvdW50IiwiRWRpdG9yLiRtb3ZlQnlQYWdlIiwiRWRpdG9yLnNlbGVjdFBhZ2VEb3duIiwiRWRpdG9yLnNlbGVjdFBhZ2VVcCIsIkVkaXRvci5nb3RvUGFnZURvd24iLCJFZGl0b3IuZ290b1BhZ2VVcCIsIkVkaXRvci5zY3JvbGxQYWdlRG93biIsIkVkaXRvci5zY3JvbGxQYWdlVXAiLCJFZGl0b3Iuc2Nyb2xsVG9Sb3ciLCJFZGl0b3Iuc2Nyb2xsVG9MaW5lIiwiRWRpdG9yLmNlbnRlclNlbGVjdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvblNjcmVlbiIsIkVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSIsIkVkaXRvci5zZWxlY3RBbGwiLCJFZGl0b3IuY2xlYXJTZWxlY3Rpb24iLCJFZGl0b3IubW92ZUN1cnNvclRvIiwiRWRpdG9yLm1vdmVDdXJzb3JUb1Bvc2l0aW9uIiwiRWRpdG9yLmp1bXBUb01hdGNoaW5nIiwiRWRpdG9yLmdvdG9MaW5lIiwiRWRpdG9yLm5hdmlnYXRlVG8iLCJFZGl0b3IubmF2aWdhdGVVcCIsIkVkaXRvci5uYXZpZ2F0ZURvd24iLCJFZGl0b3IubmF2aWdhdGVMZWZ0IiwiRWRpdG9yLm5hdmlnYXRlUmlnaHQiLCJFZGl0b3IubmF2aWdhdGVMaW5lU3RhcnQiLCJFZGl0b3IubmF2aWdhdGVMaW5lRW5kIiwiRWRpdG9yLm5hdmlnYXRlRmlsZUVuZCIsIkVkaXRvci5uYXZpZ2F0ZUZpbGVTdGFydCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRMZWZ0IiwiRWRpdG9yLnJlcGxhY2UiLCJFZGl0b3IucmVwbGFjZUFsbCIsIkVkaXRvci4kdHJ5UmVwbGFjZSIsIkVkaXRvci5nZXRMYXN0U2VhcmNoT3B0aW9ucyIsIkVkaXRvci5maW5kIiwiRWRpdG9yLmZpbmROZXh0IiwiRWRpdG9yLmZpbmRQcmV2aW91cyIsIkVkaXRvci5yZXZlYWxSYW5nZSIsIkVkaXRvci51bmRvIiwiRWRpdG9yLnJlZG8iLCJFZGl0b3IuZGVzdHJveSIsIkVkaXRvci5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXciLCJFZGl0b3IuJHJlc2V0Q3Vyc29yU3R5bGUiLCJGb2xkSGFuZGxlciIsIkZvbGRIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyIiwiTW91c2VIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyLm9uTW91c2VFdmVudCIsIk1vdXNlSGFuZGxlci5vbk1vdXNlTW92ZSIsIk1vdXNlSGFuZGxlci5lbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50IiwiTW91c2VIYW5kbGVyLnNldFN0YXRlIiwiTW91c2VIYW5kbGVyLnRleHRDb29yZGluYXRlcyIsIk1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UiLCJNb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUiLCJNb3VzZUhhbmRsZXIuc2VsZWN0IiwiTW91c2VIYW5kbGVyLnNlbGVjdEJ5TGluZXNFbmQiLCJNb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QiLCJNb3VzZUhhbmRsZXIuc2VsZWN0RW5kIiwiTW91c2VIYW5kbGVyLnNlbGVjdEFsbEVuZCIsIk1vdXNlSGFuZGxlci5zZWxlY3RCeVdvcmRzRW5kIiwiTW91c2VIYW5kbGVyLmZvY3VzV2FpdCIsIkVkaXRvck1vdXNlRXZlbnQiLCJFZGl0b3JNb3VzZUV2ZW50LmNvbnN0cnVjdG9yIiwiRWRpdG9yTW91c2VFdmVudC50b0VsZW1lbnQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3BQcm9wYWdhdGlvbiIsIkVkaXRvck1vdXNlRXZlbnQucHJldmVudERlZmF1bHQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3AiLCJFZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24iLCJFZGl0b3JNb3VzZUV2ZW50LmluU2VsZWN0aW9uIiwiRWRpdG9yTW91c2VFdmVudC5nZXRCdXR0b24iLCJFZGl0b3JNb3VzZUV2ZW50LmdldFNoaWZ0S2V5IiwibWFrZU1vdXNlRG93bkhhbmRsZXIiLCJtYWtlTW91c2VXaGVlbEhhbmRsZXIiLCJtYWtlRG91YmxlQ2xpY2tIYW5kbGVyIiwibWFrZVRyaXBsZUNsaWNrSGFuZGxlciIsIm1ha2VRdWFkQ2xpY2tIYW5kbGVyIiwibWFrZUV4dGVuZFNlbGVjdGlvbkJ5IiwiY2FsY0Rpc3RhbmNlIiwiY2FsY1JhbmdlT3JpZW50YXRpb24iLCJHdXR0ZXJIYW5kbGVyIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3RvciIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3Iuc2hvd1Rvb2x0aXAiLCJHdXR0ZXJIYW5kbGVyLmNvbnN0cnVjdG9yLmhpZGVUb29sdGlwIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3Rvci5tb3ZlVG9vbHRpcCIsIkd1dHRlclRvb2x0aXAiLCJHdXR0ZXJUb29sdGlwLmNvbnN0cnVjdG9yIiwiR3V0dGVyVG9vbHRpcC5zZXRQb3NpdGlvbiJdLCJtYXBwaW5ncyI6Ik9BZ0NPLEVBQUMsS0FBSyxFQUFDLE1BQU0sV0FBVztPQUN4QixFQUFDLGFBQWEsRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFDLE1BQU0sV0FBVztPQUMxRCxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLEVBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBQyxNQUFNLGlCQUFpQjtPQUdqRSxVQUFVLE1BQU0sdUJBQXVCO09BQ3ZDLFNBQVMsTUFBTSxzQkFBc0I7T0FFckMsTUFBTSxNQUFNLFVBQVU7T0FDdEIsS0FBSyxNQUFNLFNBQVM7T0FFcEIsaUJBQWlCLE1BQU0scUJBQXFCO09BQzVDLGNBQWMsTUFBTSwyQkFBMkI7T0FDL0MsZUFBZSxNQUFNLDZCQUE2QjtPQUNsRCxFQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBQyxNQUFNLFVBQVU7T0FDbEUsYUFBYSxNQUFNLGlCQUFpQjtPQUNwQyxFQUFDLDBCQUEwQixFQUFDLE1BQU0sbUJBQW1CO09BSXJELEVBQUMsV0FBVyxFQUFFLHFCQUFxQixFQUFFLHlCQUF5QixFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUMsTUFBTSxhQUFhO09BQ2xKLEVBQUMsWUFBWSxFQUFDLE1BQU0sZUFBZTtPQUNuQyxPQUFPLE1BQU0sV0FBVztBQVUvQixvQ0FBb0MsaUJBQWlCO0lBb0ZqREEsWUFBWUEsUUFBeUJBLEVBQUVBLE9BQW9CQTtRQUN2REMsT0FBT0EsQ0FBQ0E7UUFDUkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2pCQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLENBQUNBLFdBQVdBLEVBQUVBLEtBQUtBLEVBQUVBLGNBQWNBLENBQUNBLENBQUNBO1FBQy9EQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxjQUFjQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxHQUFHQSxLQUFLQSxFQUFFQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUMzRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQTtRQUNoREEsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFekJBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLG9CQUFvQkEsRUFBRUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdEVBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1FBQ3JEQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUV2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDeENBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ2hEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN4Q0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDaERBLENBQUNBO1FBRURBLElBQUlBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBRXRCQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN6QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsTUFBTUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFaERBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZEQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUUvQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxDQUFDQTtRQUUvQkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUNoQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN6RSxDQUFDLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRWRBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2hCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxRQUFRQSxFQUFFQTtZQUNkLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkMsQ0FBQyxDQUFDQSxDQUFDQTtRQUVIQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUN6QkEsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDbkJBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVERCxzQkFBc0JBO1FBQ2xCRSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO0lBQzNDQSxDQUFDQTtJQU1ERixJQUFJQSxTQUFTQTtRQUNURyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtJQUN2Q0EsQ0FBQ0E7SUFDREgsSUFBSUEsU0FBU0EsQ0FBQ0EsU0FBb0JBO1FBQzlCRyxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFFREgsdUJBQXVCQTtRQUNuQkksY0FBY0EsQ0FBQ0EsSUFBSUMsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0EsQ0FBQ0E7UUFFM0NELElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3JCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFTQSxDQUFDQTtZQUMvQixJQUFJLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBRXZCLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDeEIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLGVBQWUsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDO2dCQUN2QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDO29CQUN0RCxJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ2pELENBQUM7WUFDTCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLENBQUM7WUFDaEMsQ0FBQztRQUNMLENBQUMsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFcEJBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLFdBQVdBLEVBQUVBLFVBQVNBLENBQUNBO1lBQ3BDLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFFeEIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLGVBQWUsSUFBSSxVQUFVLENBQUMsQ0FBQyxDQUFDO2dCQUN4QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZELElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztZQUNMLENBQUM7WUFDRCxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3pCLENBQUMsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFcEJBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRS9EQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxRQUFRQSxFQUFFQTtZQUNkLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztRQUNqQyxDQUFDLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBRXBCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxpQkFBaUJBLEVBQUVBO1lBQ3ZCLElBQUksQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3BDLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1FBQ3ZDLENBQUMsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBRURKLGNBQWNBLENBQUNBLFdBQVdBO1FBQ3RCTSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTtnQkFDbkNBLE1BQU1BLENBQUNBO1lBQ1hBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUM1QkEsV0FBV0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDckJBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1FBQzlCQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQTtZQUNUQSxPQUFPQSxFQUFFQSxXQUFXQSxDQUFDQSxPQUFPQSxJQUFJQSxFQUFFQTtZQUNsQ0EsSUFBSUEsRUFBRUEsV0FBV0EsQ0FBQ0EsSUFBSUE7WUFDdEJBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFNBQVNBO1NBQ3JDQSxDQUFDQTtRQUVGQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUNqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsT0FBT0EsQ0FBQ0EsY0FBY0EsQ0FBQ0E7WUFDbENBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1FBRTNCQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNsREEsQ0FBQ0E7SUFFRE4sWUFBWUE7UUFDUk8sRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDYkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDakNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7Z0JBQ3ZCQSxNQUFNQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDN0JBLEtBQUtBLFFBQVFBO3dCQUNUQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxvQkFBb0JBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO3dCQUM5Q0EsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLEtBQUtBLFNBQVNBLENBQUNBO29CQUNmQSxLQUFLQSxRQUFRQTt3QkFDVEEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esb0JBQW9CQSxFQUFFQSxDQUFDQTt3QkFDckNBLEtBQUtBLENBQUNBO29CQUNWQSxLQUFLQSxlQUFlQTt3QkFDaEJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO3dCQUN0Q0EsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7d0JBQ3ZDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxPQUFPQSxJQUFJQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDeEVBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7d0JBQ3RGQSxDQUFDQTt3QkFDREEsS0FBS0EsQ0FBQ0E7b0JBQ1ZBO3dCQUNJQSxLQUFLQSxDQUFDQTtnQkFDZEEsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLElBQUlBLFNBQVNBLENBQUNBO29CQUNwQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUM3REEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDekJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RCQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEUCxlQUFlQSxDQUFDQSxDQUFvQkE7UUFDaENRLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0E7WUFDdkJBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBQ3ZCQSxJQUFJQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0E7UUFFaERBLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3hFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxJQUFJQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQ0EsSUFBSUEsSUFBSUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsS0FBS0EsU0FBU0EsQ0FBQ0E7Z0JBQ3BDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBO1lBRWpDQSxXQUFXQSxHQUFHQSxXQUFXQTttQkFDbEJBLElBQUlBLENBQUNBLGdCQUFnQkE7bUJBQ3JCQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVsREEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsV0FBV0EsR0FBR0EsV0FBV0E7bUJBQ2xCQSxpQkFBaUJBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1FBQzVEQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUNDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLElBQUlBLFFBQVFBO2VBQzlCQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEdBQUdBLElBQzdDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNDQSxXQUFXQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN4QkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0E7WUFDWkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDeENBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDNUNBLENBQUNBO0lBU0RSLGtCQUFrQkEsQ0FBQ0EsZUFBcUNBO1FBQ3BEUyxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM3Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsZUFBZUEsS0FBS0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0NBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLGVBQWVBLENBQUNBO1lBQ3JDQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNqQkEsVUFBVUEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsRUFBRUEsZUFBZUEsQ0FBQ0EsRUFBRUEsVUFBU0EsTUFBTUE7Z0JBQ3ZELEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxhQUFhLElBQUksZUFBZSxDQUFDO29CQUN2QyxLQUFLLENBQUMsVUFBVSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDdEUsQ0FBQyxFQUFFQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUNyQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDMUJBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDeERBLENBQUNBO0lBQ0xBLENBQUNBO0lBUURULGtCQUFrQkE7UUFDZFUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFVRFYsVUFBVUEsQ0FBQ0EsT0FBb0JBO1FBQzNCVyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxLQUFLQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDOUJBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1lBQ25EQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGVBQWVBLEVBQUVBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7WUFDekRBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUM3REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO1lBQzNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxjQUFjQSxFQUFFQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtZQUNyREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBO1lBQ2pFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxrQkFBa0JBLEVBQUVBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUMvREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBQy9EQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBQzFEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUUvREEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7WUFDNUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBQ3BEQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7UUFDOURBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLE9BQU9BLENBQUNBO1FBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNWQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDMURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBRWxDQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNsREEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsWUFBWUEsRUFBRUEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFFN0NBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRXZEQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQzFFQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxlQUFlQSxFQUFFQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBO1lBRW5EQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUV2REEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzFEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7WUFFckRBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2xEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxZQUFZQSxFQUFFQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtZQUU3Q0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2hFQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxtQkFBbUJBLEVBQUVBLElBQUlBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsQ0FBQ0E7WUFFM0RBLElBQUlBLENBQUNBLG1CQUFtQkEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM5REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRXpEQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUV6REEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzlEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxrQkFBa0JBLEVBQUVBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7WUFFekRBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ3REQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBRXBEQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUV2REEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzlEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxrQkFBa0JBLEVBQUVBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7WUFFekRBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxjQUFjQSxFQUFFQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtZQUV4REEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzVEQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFFOURBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQ3hDQSxJQUFJQSxDQUFDQSxlQUFlQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDMUNBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1lBRTFCQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBRTlDQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBRS9DQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQy9DQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQzlDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQzlDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1lBQzlDQSxPQUFPQSxDQUFDQSxjQUFjQSxFQUFFQSxJQUFJQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtZQUM1REEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGVBQWVBLEVBQUVBO1lBQzFCQSxPQUFPQSxFQUFFQSxPQUFPQTtZQUNoQkEsVUFBVUEsRUFBRUEsVUFBVUE7U0FDekJBLENBQUNBLENBQUNBO1FBRUhBLFVBQVVBLElBQUlBLFVBQVVBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLEVBQUVBLEVBQUVBLFNBQVNBLEVBQUVBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBO1FBQ3RFQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxjQUFjQSxFQUFFQSxFQUFFQSxNQUFNQSxFQUFFQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNqRUEsQ0FBQ0E7SUFRRFgsVUFBVUE7UUFDTlksTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBVURaLFFBQVFBLENBQUNBLEdBQVdBLEVBQUVBLFNBQWtCQTtRQUNwQ2EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFL0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDM0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNmQSxDQUFDQTtJQVFEYixRQUFRQTtRQUNKYyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtJQUNuQ0EsQ0FBQ0E7SUFPRGQsWUFBWUE7UUFDUmUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDMUJBLENBQUNBO0lBT0RmLE1BQU1BLENBQUNBLEtBQWVBO1FBQ2xCZ0IsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDbENBLENBQUNBO0lBT0RoQixRQUFRQSxDQUFDQSxLQUFhQSxFQUFFQSxFQUFlQTtRQUNuQ2lCLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO0lBQ3RDQSxDQUFDQTtJQVFEakIsUUFBUUE7UUFDSmtCLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO0lBQ3BDQSxDQUFDQTtJQVFEbEIsUUFBUUEsQ0FBQ0EsS0FBYUE7UUFDbEJtQixJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFNRG5CLFVBQVVBLENBQUNBLEtBQWFBO1FBQ3BCb0IsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDcENBLENBQUNBO0lBS0RwQixXQUFXQTtRQUNQcUIsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsYUFBYUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDbkZBLENBQUNBO0lBUURyQixXQUFXQSxDQUFDQSxRQUFnQkE7UUFDeEJzQixJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxVQUFVQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFFT3RCLGtCQUFrQkE7UUFDdEJ1QixFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO1lBQzFEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBO1FBQzVDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUdEQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNoQkEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUM5QkEsVUFBVUEsQ0FBQ0E7WUFDUCxJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO1lBRS9CLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztZQUNyRSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNOLElBQUksS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7WUFDeEUsQ0FBQztZQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO2dCQUN4QyxJQUFJLEtBQUssR0FBVSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BFLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUM7Z0JBQ04sSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsYUFBYSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzlGLENBQUMsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDWEEsQ0FBQ0E7SUFHT3ZCLGNBQWNBO1FBQ2xCd0IsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFM0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBR0RBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2hCQSxJQUFJQSxDQUFDQSxvQkFBb0JBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2pDQSxVQUFVQSxDQUFDQTtZQUNQLElBQUksQ0FBQyxvQkFBb0IsR0FBRyxLQUFLLENBQUM7WUFFbEMsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDbkMsSUFBSSxRQUFRLEdBQUcsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwRSxJQUFJLEtBQUssR0FBRyxRQUFRLENBQUMsZUFBZSxFQUFFLENBQUM7WUFFdkMsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNsRCxPQUFPLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDNUMsT0FBTyxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7Z0JBQzdCLE1BQU0sQ0FBQztZQUNYLENBQUM7WUFFRCxJQUFJLEdBQUcsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3RCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztZQUNkLElBQUksU0FBUyxHQUFHLFFBQVEsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUV4QyxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBRXpCLEdBQUcsQ0FBQztvQkFDQSxTQUFTLEdBQUcsS0FBSyxDQUFDO29CQUNsQixLQUFLLEdBQUcsUUFBUSxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUUvQixFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLEtBQUssS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN4RSxFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsS0FBSyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7NEJBQzFCLEtBQUssRUFBRSxDQUFDO3dCQUNaLENBQUM7d0JBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQzs0QkFDbEMsS0FBSyxFQUFFLENBQUM7d0JBQ1osQ0FBQztvQkFDTCxDQUFDO2dCQUVMLENBQUMsUUFBUSxLQUFLLElBQUksS0FBSyxJQUFJLENBQUMsRUFBRTtZQUNsQyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBRUosR0FBRyxDQUFDO29CQUNBLEtBQUssR0FBRyxTQUFTLENBQUM7b0JBQ2xCLFNBQVMsR0FBRyxRQUFRLENBQUMsWUFBWSxFQUFFLENBQUM7b0JBRXBDLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3hFLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQzs0QkFDMUIsS0FBSyxFQUFFLENBQUM7d0JBQ1osQ0FBQzt3QkFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDOzRCQUNsQyxLQUFLLEVBQUUsQ0FBQzt3QkFDWixDQUFDO29CQUNMLENBQUM7Z0JBQ0wsQ0FBQyxRQUFRLFNBQVMsSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFO2dCQUdsQyxRQUFRLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDM0IsQ0FBQztZQUVELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztnQkFDVCxPQUFPLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsQ0FBQztnQkFDNUMsT0FBTyxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7Z0JBQzdCLE1BQU0sQ0FBQztZQUNYLENBQUM7WUFFRCxJQUFJLEdBQUcsR0FBRyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztZQUN4QyxJQUFJLE1BQU0sR0FBRyxRQUFRLENBQUMscUJBQXFCLEVBQUUsQ0FBQztZQUM5QyxJQUFJLEtBQUssR0FBRyxJQUFJLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLEdBQUcsRUFBRSxNQUFNLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUdyRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxJQUFJLEtBQUssQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkcsT0FBTyxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7Z0JBQzVDLE9BQU8sQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDO1lBQ2pDLENBQUM7WUFFRCxFQUFFLENBQUMsQ0FBQyxLQUFLLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDO2dCQUNoQyxPQUFPLENBQUMsYUFBYSxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLGFBQWEsRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNoRixDQUFDLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO0lBQ1hBLENBQUNBO0lBTUR4QixLQUFLQTtRQUlEeUIsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDakJBLFVBQVVBLENBQUNBO1lBQ1AsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUM1QixDQUFDLENBQUNBLENBQUNBO1FBQ0hBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO0lBQzNCQSxDQUFDQTtJQU1EekIsU0FBU0E7UUFDTDBCLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO0lBQ3RDQSxDQUFDQTtJQU1EMUIsSUFBSUE7UUFDQTJCLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO0lBQzFCQSxDQUFDQTtJQU9EM0IsT0FBT0E7UUFDSDRCLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN2QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFDM0JBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1FBQy9CQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUN4QkEsQ0FBQ0E7SUFRRDVCLE1BQU1BO1FBQ0Y2QixFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDeEJBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1FBQzNCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxFQUFFQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDdkJBLENBQUNBO0lBRUQ3QixhQUFhQTtRQUNUOEIsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7SUFDakNBLENBQUNBO0lBUUQ5QixnQkFBZ0JBLENBQUNBLENBQUNBLEVBQUVBLFdBQXdCQTtRQUN4QytCLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1FBQ25CQSxJQUFJQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUN4QkEsSUFBSUEsT0FBZUEsQ0FBQ0E7UUFFcEJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLGFBQWFBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLGFBQWFBLENBQUNBO1lBQ25HQSxPQUFPQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUM1QkEsSUFBSUE7WUFDQUEsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFdkJBLElBQUlBLENBQUNBLEdBQW9CQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUN2Q0EsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFFbkVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBRzFCQSxJQUFJQSxDQUFDQSxhQUFhQSxFQUFFQSxDQUFDQTtRQUNyQkEsSUFBSUEsQ0FBQ0EsMEJBQTBCQSxFQUFFQSxDQUFDQTtJQUN0Q0EsQ0FBQ0E7SUFFRC9CLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBd0JBO1FBQzdDZ0MsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDdEJBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQ3JEQSxDQUFDQTtJQUdEaEMsaUJBQWlCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUF3QkE7UUFDN0NpQyxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUN6REEsQ0FBQ0E7SUFFRGpDLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBd0JBO1FBQzlDa0MsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDMURBLENBQUNBO0lBS0RsQyxjQUFjQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUF3QkE7UUFDMUNtQyxJQUFJQSxDQUFDQSxhQUFhQSxFQUFFQSxDQUFDQTtRQUVyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLG9CQUFvQkEsRUFBRUEsQ0FBQ0E7UUFDekNBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLGtCQUFrQkEsRUFBRUEsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1FBQ3RCQSxJQUFJQSxDQUFDQSwwQkFBMEJBLEVBQUVBLENBQUNBO1FBRWxDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxpQkFBaUJBLENBQUNBLENBQUNBO0lBQ3BDQSxDQUFDQTtJQUVNbkMsMEJBQTBCQTtRQUU3Qm9DLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQzNCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUU3QkEsSUFBSUEsU0FBU0EsQ0FBQ0E7UUFDZEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BFQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1lBQ3pDQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxTQUFTQSxJQUFJQSxPQUFPQSxDQUFDQSxTQUFTQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0VBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO1lBQ3RCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxvQkFBb0JBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxPQUFPQSxDQUFDQSxvQkFBb0JBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQzVEQSxPQUFPQSxDQUFDQSxvQkFBb0JBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3hDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxvQkFBb0JBLElBQUlBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xEQSxJQUFJQSxLQUFLQSxHQUFVQSxJQUFJQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUN2RkEsS0FBS0EsQ0FBQ0EsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsRUFBRUEsaUJBQWlCQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtZQUMzRUEsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLE9BQU9BLENBQUNBLG9CQUFvQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDdkRBLE9BQU9BLENBQUNBLG9CQUFvQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDckRBLE9BQU9BLENBQUNBLG9CQUFvQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDN0RBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO0lBQ0xBLENBQUNBO0lBR09wQyxpQkFBaUJBLENBQUNBLEtBQUtBLEVBQUVBLFNBQW9CQTtRQUNqRHFDLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBRTNCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQy9DQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLENBQUNBLENBQUNBO1lBQy9DQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3BDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7WUFDdENBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7WUFDckNBLE9BQU9BLENBQUNBLGdCQUFnQkEsR0FBR0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsRUFBRUEsZUFBZUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDaEZBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLENBQUNBLDBCQUEwQkEsRUFBRUEsQ0FBQ0E7UUFDdENBLENBQUNBO1FBRURBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLHNCQUFzQkEsSUFBSUEsSUFBSUEsQ0FBQ0EsNEJBQTRCQSxFQUFFQSxDQUFDQTtRQUM1RUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFM0JBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7SUFDcENBLENBQUNBO0lBRURyQyw0QkFBNEJBO1FBQ3hCc0MsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFM0JBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7UUFDekNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLFNBQVNBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQy9DQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM1Q0EsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2hEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUMzQkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFDL0NBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBR2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxVQUFVQSxJQUFJQSxDQUFDQSxJQUFJQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMzQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsUUFBUUEsSUFBSUEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakRBLE1BQU1BLENBQUNBO1FBRVhBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3RFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMxQkEsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsQ0FBQ0E7WUFDbENBLFNBQVNBLEVBQUVBLElBQUlBO1lBQ2ZBLGFBQWFBLEVBQUVBLElBQUlBO1lBQ25CQSxNQUFNQSxFQUFFQSxNQUFNQTtTQUNqQkEsQ0FBQ0EsQ0FBQ0E7UUFFSEEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7SUFDZEEsQ0FBQ0E7SUFHRHRDLG1CQUFtQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBd0JBO1FBQy9DdUMsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxDQUFDQTtJQUN2Q0EsQ0FBQ0E7SUFFRHZDLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBd0JBO1FBQzlDd0MsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtJQUN0Q0EsQ0FBQ0E7SUFHRHhDLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBd0JBO1FBQzlDeUMsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUNsQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUMxQ0EsQ0FBQ0E7SUFFRHpDLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBd0JBO1FBQzlDMEMsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDM0RBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGtCQUFrQkEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBR0QxQyxZQUFZQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUF3QkE7UUFDeEMyQyxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtRQUMzQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDcENBLENBQUNBO0lBR0QzQyxpQkFBaUJBLENBQUNBLEtBQUtBLEVBQUVBLFdBQXdCQTtRQUM3QzRDLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO0lBQy9CQSxDQUFDQTtJQUVENUMsZ0JBQWdCQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUF3QkE7UUFDNUM2QyxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFHRDdDLFlBQVlBLENBQUNBLEtBQUtBLEVBQUVBLFdBQXdCQTtRQUd4QzhDLElBQUlBLENBQUNBLDBCQUEwQkEsRUFBRUEsQ0FBQ0E7UUFFbENBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO0lBQy9CQSxDQUFDQTtJQU1EOUMsZUFBZUE7UUFDWCtDLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDL0RBLENBQUNBO0lBYUQvQyxXQUFXQTtRQUNQZ0QsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDbENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzNCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtJQUNoQkEsQ0FBQ0E7SUFLRGhELE1BQU1BO1FBQ0ZpRCxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNyQ0EsQ0FBQ0E7SUFLRGpELEtBQUtBO1FBQ0RrRCxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNwQ0EsQ0FBQ0E7SUFlRGxELE9BQU9BLENBQUNBLElBQVlBO1FBRWhCbUQsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDZkEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDdkJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pCQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUM5QkEsQ0FBQ0E7SUFHRG5ELFdBQVdBLENBQUNBLE9BQU9BLEVBQUVBLElBQUtBO1FBQ3RCb0QsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDNUNBLENBQUNBO0lBT0RwRCxNQUFNQSxDQUFDQSxJQUFZQSxFQUFFQSxNQUFnQkE7UUFDakNxRCxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUMzQkEsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDN0JBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7UUFFdENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLG9CQUFvQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFekNBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLFdBQVdBLEVBQUVBLElBQUlBLEVBQUVBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQ3JHQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxHQUFHQSxLQUFLQSxDQUFDQTtvQkFDckNBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7Z0JBQ25DQSxDQUFDQTtnQkFDREEsSUFBSUEsR0FBR0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFFMUJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hCQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtRQUN2Q0EsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7WUFDckNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3BDQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBQzdDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNoQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLEtBQUtBLElBQUlBLElBQUlBLElBQUlBLEtBQUtBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDbERBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzNFQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUV0QkEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDMUJBLElBQUlBLFNBQVNBLEdB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QSxDQUFDQSxDQUFDQSxNQUFNQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNiQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM1Q0EsSUFBSUEsSUFBSUEsRUFBRUEsS0FBS0EsQ0FBQ0E7UUFDaEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyREEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdEVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pEQSxLQUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNsRUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDdENBLENBQUNBO0lB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QUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDaERBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUMzQkEsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFDaENBLElBQUlBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLHNCQUFzQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFM0VBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxJQUFJQSxHQUFHQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNuQ0EsSUFBSUEsWUFBWUEsR0FBR0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDaERBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBO1lBQzFCQSxPQUFPQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxLQUFLQSxFQUFFQSxDQUFDQTtnQkFDOUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUNyQkEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDWkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN4Q0EsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDeEJBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQU1EcEcsV0FBV0E7UUFDUHFHLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7UUFDbkNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ3pEQSxDQUFDQTtJQU1EckcsWUFBWUE7UUFDUnNHLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBQzVDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNuREEsQ0FBQ0E7SUFHRHRHLFNBQVNBO1FBQ0x1RyxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO1FBQ25DQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUUzQkEsSUFBSUEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsRUFBRUE7WUFDcENBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRW5DQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFTQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNwQixFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNqRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLEdBQUcsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDaEQsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsV0FBV0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQzNDQSxJQUFJQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5QkEsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3hCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNyQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsV0FBV0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeERBLENBQUNBO0lBQ0xBLENBQUNBO0lBS0R2RyxrQkFBa0JBO1FBQ2R3RyxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2hFQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO1FBQ25DQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQSxrQkFBa0JBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQzFGQSxDQUFDQTtJQUVEeEcsa0JBQWtCQTtRQUNkeUcsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUN0Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7UUFDckNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsS0FBS0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDbEZBLENBQUNBO0lBTUR6RyxXQUFXQSxDQUFDQSxHQUFXQSxFQUFFQSxNQUFjQTtRQUNuQzBHLElBQUlBLFNBQVNBLEdBQUdBLDJCQUEyQkEsQ0FBQ0E7UUFDNUNBLFNBQVNBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBRXhCQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsT0FBT0EsU0FBU0EsQ0FBQ0EsU0FBU0EsR0FBR0EsTUFBTUEsRUFBRUEsQ0FBQ0E7WUFDbENBLElBQUlBLENBQUNBLEdBQW9CQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZEQSxJQUFJQSxNQUFNQSxHQUFHQTtvQkFDVEEsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1hBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBO29CQUNkQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQTtpQkFDN0JBLENBQUNBO2dCQUNGQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBTUQxRyxZQUFZQSxDQUFDQSxNQUFjQTtRQUN2QjJHLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3pDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUcvQ0EsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFeERBLElBQUlBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1FBRXpEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUzQkEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFFdkNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNMQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQTtnQkFDcEZBLElBQUlBLFFBQVFBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBO2dCQUUvQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFHNUJBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUMvQkEsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hEQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBO2dCQUM1Q0EsQ0FBQ0E7Z0JBRURBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBO2dCQUNaQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDNUJBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUc5QkEsSUFBSUEsWUFBWUEsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsS0FBS0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFHeENBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBRTFGQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU1EM0csV0FBV0E7UUFDUDRHLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7UUFDbkNBLElBQUlBLEtBQUtBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1lBQzdEQSxLQUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUE7WUFDQUEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FDYkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFDM0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLE1BQU1BLENBQ3BEQSxDQUFDQTtRQUNOQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMzQkEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7SUFDMUJBLENBQUNBO0lBRUQ1RyxrQkFBa0JBO1FBQ2Q2RyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUN6QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDdkJBLElBQUlBLEtBQUtBLEdBQUdBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1FBQzNCQSxJQUFJQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0Es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Q0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7b0JBRXRGQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDNUJBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUMzQkEsQ0FBQ0E7b0JBRURBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNyQkEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBLENBQUNBO3dCQUNUQSxLQUFLQSxHQUFHQTs0QkFDSkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7NEJBQ3JCQSxLQUFLQSxDQUFDQTt3QkFDVkEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBLENBQUNBO3dCQUNUQSxLQUFLQSxHQUFHQTs0QkFDSkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7NEJBRXJCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQ0FDNUJBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO2dDQUN0QkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7NEJBQ2pCQSxDQUFDQTs0QkFDREEsS0FBS0EsQ0FBQ0E7b0JBQ2RBLENBQUNBO2dCQUNMQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeERBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUM1QkEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxDQUFDQTtnQkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFCQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFDekJBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDbENBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBO2dCQUN6QkEsQ0FBQ0E7Z0JBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUM1QkEsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7b0JBQ2xCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDakJBLENBQUNBO1lBQ0xBLENBQUNBO1lBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNUQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtnQkFDbEJBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO2dCQUMvQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7UUFDTEEsQ0FBQ0EsUUFBUUEsS0FBS0EsSUFBSUEsQ0FBQ0Es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S0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxFQUFFQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO3dCQUN0RkEsQ0FBQ0E7d0JBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBOzRCQUMvREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0NBQzFCQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFDakJBLENBQUNBOzRCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQ0FDbENBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBOzRCQUNqQkEsQ0FBQ0E7NEJBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dDQUNqQkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7d0JBQ3JCQSxDQUFDQTtvQkFDTEEsQ0FBQ0E7Z0JBQ0xBLENBQUNBLFFBQVFBLFNBQVNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBO1lBQ2xDQSxDQUFDQTtZQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUNBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO2dCQUN0QkEsRUFBRUEsQ0FBQ0Es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QUNBLE1BQU1BLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBRTVCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUMxQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNDQSxRQUFRQSxFQUFFQSxDQUFDQTtZQUNmQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxpQkFBaUJBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxDQUFDQSxlQUFlQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUxQkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7SUFDcEJBLENBQUNBO0lBRU81SixXQUFXQSxDQUFDQSxLQUFZQSxFQUFFQSxXQUFtQkE7UUFDakQ2SixJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUM3Q0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUNyREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDakJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBQ2hCQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU9EN0osb0JBQW9CQTtRQUNoQjhKLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO0lBQ3JDQSxDQUFDQTtJQVdEOUosSUFBSUEsQ0FBQ0EsTUFBeUJBLEVBQUVBLE9BQU9BLEVBQUVBLE9BQWlCQTtRQUN0RCtKLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1RBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBO1FBRWpCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxNQUFNQSxJQUFJQSxRQUFRQSxJQUFJQSxNQUFNQSxZQUFZQSxNQUFNQSxDQUFDQTtZQUN0REEsT0FBT0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBO1lBQy9CQSxLQUFLQSxDQUFDQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUzQkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7UUFDdENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUMxRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUN2RUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDZkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFdkNBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQy9DQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxhQUFhQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ1hBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1lBQ3BDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUNwQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDbEJBLEtBQUtBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQzVCQSxJQUFJQTtZQUNB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QUFFLEVBQVUsRUFBRSxFQUFVO0lBQ2hFQyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtBQUNsRUEsQ0FBQ0E7QUFFRCw4QkFBOEIsS0FBWSxFQUFFLE1BQXVDO0lBQy9FQyxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNuQ0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7SUFDeEVBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1FBQ3hGQSxJQUFJQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNoQ0EsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDRkEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0Es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SUFBSUEsRUFBRUEsQ0FBQ0E7UUFDUkEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDUkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsR0FBR0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLFdBQVdBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxNQUFNQSxHQUFHQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1QkEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDckJBLENBQUNBO1FBQ0RBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO0lBQzVCQSxDQUFDQTtBQUNMRixDQUFDQTtBQUFBIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbi8vcmVxdWlyZShcIi4vbGliL2ZpeG9sZGJyb3dzZXJzXCIpO1xuXG5pbXBvcnQge21peGlufSBmcm9tIFwiLi9saWIvb29wXCI7XG5pbXBvcnQge2NvbXB1dGVkU3R5bGUsIGhhc0Nzc0NsYXNzLCBzZXRDc3NDbGFzc30gZnJvbSBcIi4vbGliL2RvbVwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgc3RyaW5nUmVwZWF0fSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtpc0lFLCBpc01hYywgaXNNb2JpbGUsIGlzT2xkSUUsIGlzV2ViS2l0fSBmcm9tIFwiLi9saWIvdXNlcmFnZW50XCI7XG5pbXBvcnQgR3V0dGVyIGZyb20gXCIuL2xheWVyL0d1dHRlclwiO1xuaW1wb3J0IEhhc2hIYW5kbGVyIGZyb20gXCIuL2tleWJvYXJkL0hhc2hIYW5kbGVyXCI7XG5pbXBvcnQgS2V5QmluZGluZyBmcm9tIFwiLi9rZXlib2FyZC9LZXlCaW5kaW5nXCI7XG5pbXBvcnQgVGV4dElucHV0IGZyb20gXCIuL2tleWJvYXJkL1RleHRJbnB1dFwiO1xuaW1wb3J0IEVkaXRTZXNzaW9uIGZyb20gXCIuL0VkaXRTZXNzaW9uXCI7XG5pbXBvcnQgU2VhcmNoIGZyb20gXCIuL1NlYXJjaFwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5pbXBvcnQgQ3Vyc29yUmFuZ2UgZnJvbSAnLi9DdXJzb3JSYW5nZSdcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuaW1wb3J0IENvbW1hbmRNYW5hZ2VyIGZyb20gXCIuL2NvbW1hbmRzL0NvbW1hbmRNYW5hZ2VyXCI7XG5pbXBvcnQgZGVmYXVsdENvbW1hbmRzIGZyb20gXCIuL2NvbW1hbmRzL2RlZmF1bHRfY29tbWFuZHNcIjtcbmltcG9ydCB7ZGVmaW5lT3B0aW9ucywgbG9hZE1vZHVsZSwgcmVzZXRPcHRpb25zLCBfc2lnbmFsfSBmcm9tIFwiLi9jb25maWdcIjtcbmltcG9ydCBUb2tlbkl0ZXJhdG9yIGZyb20gXCIuL1Rva2VuSXRlcmF0b3JcIjtcbmltcG9ydCB7Q09NTUFORF9OQU1FX0FVVE9fQ09NUExFVEV9IGZyb20gJy4vZWRpdG9yX3Byb3RvY29sJztcbmltcG9ydCBWaXJ0dWFsUmVuZGVyZXIgZnJvbSAnLi9WaXJ0dWFsUmVuZGVyZXInO1xuaW1wb3J0IHtDb21wbGV0ZXJ9IGZyb20gXCIuL2F1dG9jb21wbGV0ZVwiO1xuaW1wb3J0IFNlbGVjdGlvbiBmcm9tICcuL1NlbGVjdGlvbic7XG5pbXBvcnQge2FkZExpc3RlbmVyLCBhZGRNb3VzZVdoZWVsTGlzdGVuZXIsIGFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIsIGNhcHR1cmUsIGdldEJ1dHRvbiwgcHJldmVudERlZmF1bHQsIHN0b3BFdmVudCwgc3RvcFByb3BhZ2F0aW9ufSBmcm9tIFwiLi9saWIvZXZlbnRcIjtcbmltcG9ydCB7dG91Y2hNYW5hZ2VyfSBmcm9tICcuL3RvdWNoL3RvdWNoJztcbmltcG9ydCBUb29sdGlwIGZyb20gXCIuL1Rvb2x0aXBcIjtcblxuLy92YXIgRHJhZ2Ryb3BIYW5kbGVyID0gcmVxdWlyZShcIi4vbW91c2UvZHJhZ2Ryb3BfaGFuZGxlclwiKS5EcmFnZHJvcEhhbmRsZXI7XG5cbi8qKlxuICogVGhlIGBFZGl0b3JgIGFjdHMgYXMgYSBjb250cm9sbGVyLCBtZWRpYXRpbmcgYmV0d2VlbiB0aGUgZWRpdFNlc3Npb24gYW5kIHJlbmRlcmVyLlxuICpcbiAqIEBjbGFzcyBFZGl0b3JcbiAqIEBleHRlbmRzIEV2ZW50RW1pdHRlckNsYXNzXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVkaXRvciBleHRlbmRzIEV2ZW50RW1pdHRlckNsYXNzIHtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSByZW5kZXJlclxuICAgICAqIEB0eXBlIFZpcnR1YWxSZW5kZXJlclxuICAgICAqL1xuICAgIHB1YmxpYyByZW5kZXJlcjogVmlydHVhbFJlbmRlcmVyO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IHNlc3Npb25cbiAgICAgKiBAdHlwZSBFZGl0U2Vzc2lvblxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXNzaW9uOiBFZGl0U2Vzc2lvbjtcblxuICAgIHByaXZhdGUgJHRvdWNoSGFuZGxlcjogSUdlc3R1cmVIYW5kbGVyO1xuICAgIHByaXZhdGUgJG1vdXNlSGFuZGxlcjogSUdlc3R1cmVIYW5kbGVyO1xuICAgIHB1YmxpYyBnZXRPcHRpb247XG4gICAgcHVibGljIHNldE9wdGlvbjtcbiAgICBwdWJsaWMgc2V0T3B0aW9ucztcbiAgICBwdWJsaWMgJGlzRm9jdXNlZDtcbiAgICBwdWJsaWMgY29tbWFuZHM6IENvbW1hbmRNYW5hZ2VyO1xuICAgIHB1YmxpYyBrZXlCaW5kaW5nOiBLZXlCaW5kaW5nO1xuICAgIC8vIEZJWE1FOiBUaGlzIGlzIHJlYWxseSBhbiBvcHRpb25hbCBleHRlbnNpb24gYW5kIHNvIGRvZXMgbm90IGJlbG9uZyBoZXJlLlxuICAgIHB1YmxpYyBjb21wbGV0ZXJzOiBDb21wbGV0ZXJbXTtcblxuICAgIHB1YmxpYyB3aWRnZXRNYW5hZ2VyO1xuXG4gICAgLyoqXG4gICAgICogVGhlIHJlbmRlcmVyIGNvbnRhaW5lciBlbGVtZW50LlxuICAgICAqL1xuICAgIHB1YmxpYyBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuICAgIHB1YmxpYyB0ZXh0SW5wdXQ7XG4gICAgcHVibGljIGluTXVsdGlTZWxlY3RNb2RlOiBib29sZWFuO1xuICAgIHB1YmxpYyBpblZpcnR1YWxTZWxlY3Rpb25Nb2RlO1xuXG4gICAgcHJpdmF0ZSAkY3Vyc29yU3R5bGU6IHN0cmluZztcbiAgICBwcml2YXRlICRrZXliaW5kaW5nSWQ7XG4gICAgcHJpdmF0ZSAkYmxvY2tTY3JvbGxpbmc7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0QWN0aXZlTGluZTtcbiAgICBwcml2YXRlICRoaWdobGlnaHRQZW5kaW5nO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodFNlbGVjdGVkV29yZDtcbiAgICBwcml2YXRlICRoaWdobGlnaHRUYWdQZW5kaW5nO1xuICAgIHByaXZhdGUgJG1lcmdlVW5kb0RlbHRhcztcbiAgICBwdWJsaWMgJHJlYWRPbmx5O1xuICAgIHByaXZhdGUgJHNjcm9sbEFuY2hvcjtcbiAgICBwcml2YXRlICRzZWFyY2g6IFNlYXJjaDtcbiAgICBwcml2YXRlIF8kZW1pdElucHV0RXZlbnQ7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25zO1xuICAgIHByaXZhdGUgJHNlbGVjdGlvblN0eWxlO1xuICAgIHByaXZhdGUgJG9wUmVzZXRUaW1lcjtcbiAgICBwcml2YXRlIGN1ck9wO1xuICAgIHByaXZhdGUgcHJldk9wOiB7IGNvbW1hbmQ/OyBhcmdzP307XG4gICAgcHJpdmF0ZSBwcmV2aW91c0NvbW1hbmQ7XG4gICAgcHJpdmF0ZSAkbWVyZ2VhYmxlQ29tbWFuZHM6IHN0cmluZ1tdO1xuICAgIHByaXZhdGUgbWVyZ2VOZXh0Q29tbWFuZDtcbiAgICBwcml2YXRlICRtZXJnZU5leHRDb21tYW5kO1xuICAgIHByaXZhdGUgc2VxdWVuY2VTdGFydFRpbWU6IG51bWJlcjtcbiAgICBwcml2YXRlICRvbkRvY3VtZW50Q2hhbmdlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlTW9kZTtcbiAgICBwcml2YXRlICRvblRva2VuaXplclVwZGF0ZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZVRhYlNpemU6IChldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSA9PiBhbnk7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VXcmFwTGltaXQ7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VXcmFwTW9kZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZUZvbGQ7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VGcm9udE1hcmtlcjtcbiAgICBwcml2YXRlICRvbkNoYW5nZUJhY2tNYXJrZXI7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VCcmVha3BvaW50O1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlQW5ub3RhdGlvbjtcbiAgICBwcml2YXRlICRvbkN1cnNvckNoYW5nZTtcbiAgICBwcml2YXRlICRvblNjcm9sbFRvcENoYW5nZTtcbiAgICBwcml2YXRlICRvblNjcm9sbExlZnRDaGFuZ2U7XG4gICAgcHVibGljICRvblNlbGVjdGlvbkNoYW5nZTogKGV2ZW50LCBzZWxlY3Rpb246IFNlbGVjdGlvbikgPT4gdm9pZDtcbiAgICBwdWJsaWMgZXhpdE11bHRpU2VsZWN0TW9kZTtcbiAgICBwdWJsaWMgZm9yRWFjaFNlbGVjdGlvbjtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgYEVkaXRvcmAgb2JqZWN0LlxuICAgICAqXG4gICAgICogQGNsYXNzXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIHJlbmRlcmVyIHtWaXJ0dWFsUmVuZGVyZXJ9IFRoZSB2aWV3LlxuICAgICAqIEBwYXJhbSBzZXNzaW9uIHtFZGl0U2Vzc2lvbn0gVGhlIG1vZGVsLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHJlbmRlcmVyOiBWaXJ0dWFsUmVuZGVyZXIsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHN1cGVyKCk7XG4gICAgICAgIHRoaXMuY3VyT3AgPSBudWxsO1xuICAgICAgICB0aGlzLnByZXZPcCA9IHt9O1xuICAgICAgICB0aGlzLiRtZXJnZWFibGVDb21tYW5kcyA9IFtcImJhY2tzcGFjZVwiLCBcImRlbFwiLCBcImluc2VydHN0cmluZ1wiXTtcbiAgICAgICAgdGhpcy5jb21tYW5kcyA9IG5ldyBDb21tYW5kTWFuYWdlcihpc01hYyA/IFwibWFjXCIgOiBcIndpblwiLCBkZWZhdWx0Q29tbWFuZHMpO1xuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IHJlbmRlcmVyLmdldENvbnRhaW5lckVsZW1lbnQoKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlciA9IHJlbmRlcmVyO1xuXG4gICAgICAgIHRoaXMudGV4dElucHV0ID0gbmV3IFRleHRJbnB1dChyZW5kZXJlci5nZXRUZXh0QXJlYUNvbnRhaW5lcigpLCB0aGlzKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci50ZXh0YXJlYSA9IHRoaXMudGV4dElucHV0LmdldEVsZW1lbnQoKTtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nID0gbmV3IEtleUJpbmRpbmcodGhpcyk7XG5cbiAgICAgICAgaWYgKGlzTW9iaWxlKSB7XG4gICAgICAgICAgICB0aGlzLiR0b3VjaEhhbmRsZXIgPSB0b3VjaE1hbmFnZXIodGhpcyk7XG4gICAgICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIgPSBuZXcgTW91c2VIYW5kbGVyKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kdG91Y2hIYW5kbGVyID0gdG91Y2hNYW5hZ2VyKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy4kbW91c2VIYW5kbGVyID0gbmV3IE1vdXNlSGFuZGxlcih0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ldyBGb2xkSGFuZGxlcih0aGlzKTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyA9IDA7XG4gICAgICAgIHRoaXMuJHNlYXJjaCA9IG5ldyBTZWFyY2goKS5zZXQoeyB3cmFwOiB0cnVlIH0pO1xuXG4gICAgICAgIHRoaXMuJGhpc3RvcnlUcmFja2VyID0gdGhpcy4kaGlzdG9yeVRyYWNrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImV4ZWNcIiwgdGhpcy4kaGlzdG9yeVRyYWNrZXIpO1xuXG4gICAgICAgIHRoaXMuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMoKTtcblxuICAgICAgICB0aGlzLl8kZW1pdElucHV0RXZlbnQgPSBkZWxheWVkQ2FsbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImlucHV0XCIsIHt9KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5iZ1Rva2VuaXplciAmJiB0aGlzLnNlc3Npb24uYmdUb2tlbml6ZXIuc2NoZWR1bGVTdGFydCgpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuXyRlbWl0SW5wdXRFdmVudC5zY2hlZHVsZSgzMSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICBfc2lnbmFsKFwiZWRpdG9yXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIGNhbmNlbE1vdXNlQ29udGV4dE1lbnUoKSB7XG4gICAgICAgIHRoaXMuJG1vdXNlSGFuZGxlci5jYW5jZWxDb250ZXh0TWVudSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBzZWxlY3Rpb25cbiAgICAgKiBAdHlwZSBTZWxlY3Rpb25cbiAgICAgKi9cbiAgICBnZXQgc2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgfVxuICAgIHNldCBzZWxlY3Rpb24oc2VsZWN0aW9uOiBTZWxlY3Rpb24pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNlbGVjdGlvbihzZWxlY3Rpb24pO1xuICAgIH1cblxuICAgICRpbml0T3BlcmF0aW9uTGlzdGVuZXJzKCkge1xuICAgICAgICBmdW5jdGlvbiBsYXN0KGEpIHsgcmV0dXJuIGFbYS5sZW5ndGggLSAxXSB9XG5cbiAgICAgICAgdGhpcy5zZWxlY3Rpb25zID0gW107XG4gICAgICAgIHRoaXMuY29tbWFuZHMub24oXCJleGVjXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRPcGVyYXRpb24oZSk7XG5cbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gZS5jb21tYW5kO1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQuYWNlQ29tbWFuZEdyb3VwID09IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgIHZhciBwcmV2ID0gdGhpcy5wcmV2T3A7XG4gICAgICAgICAgICAgICAgaWYgKCFwcmV2IHx8IHByZXYuY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgIT0gXCJmaWxlSnVtcFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGFzdEZpbGVKdW1wUG9zID0gbGFzdCh0aGlzLnNlbGVjdGlvbnMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0RmlsZUp1bXBQb3MgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmJpbmQodGhpcyksIHRydWUpO1xuXG4gICAgICAgIHRoaXMuY29tbWFuZHMub24oXCJhZnRlckV4ZWNcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgdmFyIGNvbW1hbmQgPSBlLmNvbW1hbmQ7XG5cbiAgICAgICAgICAgIGlmIChjb21tYW5kLmFjZUNvbW1hbmRHcm91cCA9PSBcImZpbGVKdW1wXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5sYXN0RmlsZUp1bXBQb3MgJiYgIXRoaXMuY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5mcm9tSlNPTih0aGlzLmxhc3RGaWxlSnVtcFBvcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lbmRPcGVyYXRpb24oZSk7XG4gICAgICAgIH0uYmluZCh0aGlzKSwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy4kb3BSZXNldFRpbWVyID0gZGVsYXllZENhbGwodGhpcy5lbmRPcGVyYXRpb24uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AgfHwgdGhpcy5zdGFydE9wZXJhdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5jdXJPcC5kb2NDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgfS5iaW5kKHRoaXMpLCB0cnVlKTtcblxuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5jdXJPcCB8fCB0aGlzLnN0YXJ0T3BlcmF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9LmJpbmQodGhpcyksIHRydWUpO1xuICAgIH1cblxuICAgIHN0YXJ0T3BlcmF0aW9uKGNvbW1hZEV2ZW50KSB7XG4gICAgICAgIGlmICh0aGlzLmN1ck9wKSB7XG4gICAgICAgICAgICBpZiAoIWNvbW1hZEV2ZW50IHx8IHRoaXMuY3VyT3AuY29tbWFuZClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLnByZXZPcCA9IHRoaXMuY3VyT3A7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFjb21tYWRFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5wcmV2aW91c0NvbW1hbmQgPSBudWxsO1xuICAgICAgICAgICAgY29tbWFkRXZlbnQgPSB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJG9wUmVzZXRUaW1lci5zY2hlZHVsZSgpO1xuICAgICAgICB0aGlzLmN1ck9wID0ge1xuICAgICAgICAgICAgY29tbWFuZDogY29tbWFkRXZlbnQuY29tbWFuZCB8fCB7fSxcbiAgICAgICAgICAgIGFyZ3M6IGNvbW1hZEV2ZW50LmFyZ3MsXG4gICAgICAgICAgICBzY3JvbGxUb3A6IHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9wXG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIGNvbW1hbmQgPSB0aGlzLmN1ck9wLmNvbW1hbmQ7XG4gICAgICAgIGlmIChjb21tYW5kICYmIGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcpXG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9ucy5wdXNoKHRoaXMuc2VsZWN0aW9uLnRvSlNPTigpKTtcbiAgICB9XG5cbiAgICBlbmRPcGVyYXRpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLmN1ck9wKSB7XG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IHRoaXMuY3VyT3AuY29tbWFuZDtcbiAgICAgICAgICAgIGlmIChjb21tYW5kICYmIGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZy0tO1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoY29tbWFuZC5zY3JvbGxJbnRvVmlldykge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiY2VudGVyXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KG51bGwsIDAuNSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImFuaW1hdGVcIjpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImN1cnNvclwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzZWxlY3Rpb25QYXJ0XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMucmVuZGVyZXIubGF5ZXJDb25maWc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ID49IGNvbmZpZy5sYXN0Um93IHx8IHJhbmdlLmVuZC5yb3cgPD0gY29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyh0aGlzLnNlbGVjdGlvbi5hbmNob3IsIHRoaXMuc2VsZWN0aW9uLmxlYWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcgPT0gXCJhbmltYXRlXCIpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyh0aGlzLmN1ck9wLnNjcm9sbFRvcCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMucHJldk9wID0gdGhpcy5jdXJPcDtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgJGhpc3RvcnlUcmFja2VyKGU6IHsgY29tbWFuZDsgYXJncyB9KSB7XG4gICAgICAgIGlmICghdGhpcy4kbWVyZ2VVbmRvRGVsdGFzKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBwcmV2ID0gdGhpcy5wcmV2T3A7XG4gICAgICAgIHZhciBtZXJnZWFibGVDb21tYW5kcyA9IHRoaXMuJG1lcmdlYWJsZUNvbW1hbmRzO1xuICAgICAgICAvLyBwcmV2aW91cyBjb21tYW5kIHdhcyB0aGUgc2FtZVxuICAgICAgICB2YXIgc2hvdWxkTWVyZ2UgPSBwcmV2LmNvbW1hbmQgJiYgKGUuY29tbWFuZC5uYW1lID09IHByZXYuY29tbWFuZC5uYW1lKTtcbiAgICAgICAgaWYgKGUuY29tbWFuZC5uYW1lID09IFwiaW5zZXJ0c3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciB0ZXh0ID0gZS5hcmdzO1xuICAgICAgICAgICAgaWYgKHRoaXMubWVyZ2VOZXh0Q29tbWFuZCA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgIHRoaXMubWVyZ2VOZXh0Q29tbWFuZCA9IHRydWU7XG5cbiAgICAgICAgICAgIHNob3VsZE1lcmdlID0gc2hvdWxkTWVyZ2VcbiAgICAgICAgICAgICAgICAmJiB0aGlzLm1lcmdlTmV4dENvbW1hbmQgLy8gcHJldmlvdXMgY29tbWFuZCBhbGxvd3MgdG8gY29hbGVzY2Ugd2l0aFxuICAgICAgICAgICAgICAgICYmICghL1xccy8udGVzdCh0ZXh0KSB8fCAvXFxzLy50ZXN0KHByZXYuYXJncykpOyAvLyBwcmV2aW91cyBpbnNlcnRpb24gd2FzIG9mIHNhbWUgdHlwZVxuXG4gICAgICAgICAgICB0aGlzLm1lcmdlTmV4dENvbW1hbmQgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2hvdWxkTWVyZ2UgPSBzaG91bGRNZXJnZVxuICAgICAgICAgICAgICAgICYmIG1lcmdlYWJsZUNvbW1hbmRzLmluZGV4T2YoZS5jb21tYW5kLm5hbWUpICE9PSAtMTsgLy8gdGhlIGNvbW1hbmQgaXMgbWVyZ2VhYmxlXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgICB0aGlzLiRtZXJnZVVuZG9EZWx0YXMgIT0gXCJhbHdheXNcIlxuICAgICAgICAgICAgJiYgRGF0ZS5ub3coKSAtIHRoaXMuc2VxdWVuY2VTdGFydFRpbWUgPiAyMDAwXG4gICAgICAgICkge1xuICAgICAgICAgICAgc2hvdWxkTWVyZ2UgPSBmYWxzZTsgLy8gdGhlIHNlcXVlbmNlIGlzIHRvbyBsb25nXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2hvdWxkTWVyZ2UpXG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ubWVyZ2VVbmRvRGVsdGFzID0gdHJ1ZTtcbiAgICAgICAgZWxzZSBpZiAobWVyZ2VhYmxlQ29tbWFuZHMuaW5kZXhPZihlLmNvbW1hbmQubmFtZSkgIT09IC0xKVxuICAgICAgICAgICAgdGhpcy5zZXF1ZW5jZVN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyBrZXkgaGFuZGxlciwgc3VjaCBhcyBcInZpbVwiIG9yIFwid2luZG93c1wiLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRLZXlib2FyZEhhbmRsZXJcbiAgICAgKiBAcGFyYW0ga2V5Ym9hcmRIYW5kbGVyIHtzdHJpbmcgfCBIYXNoSGFuZGxlcn0gVGhlIG5ldyBrZXkgaGFuZGxlci5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEtleWJvYXJkSGFuZGxlcihrZXlib2FyZEhhbmRsZXI6IHN0cmluZyB8IEhhc2hIYW5kbGVyKTogdm9pZCB7XG4gICAgICAgIGlmICgha2V5Ym9hcmRIYW5kbGVyKSB7XG4gICAgICAgICAgICB0aGlzLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBrZXlib2FyZEhhbmRsZXIgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHRoaXMuJGtleWJpbmRpbmdJZCA9IGtleWJvYXJkSGFuZGxlcjtcbiAgICAgICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBsb2FkTW9kdWxlKFtcImtleWJpbmRpbmdcIiwga2V5Ym9hcmRIYW5kbGVyXSwgZnVuY3Rpb24obW9kdWxlKSB7XG4gICAgICAgICAgICAgICAgaWYgKF9zZWxmLiRrZXliaW5kaW5nSWQgPT0ga2V5Ym9hcmRIYW5kbGVyKVxuICAgICAgICAgICAgICAgICAgICBfc2VsZi5rZXlCaW5kaW5nLnNldEtleWJvYXJkSGFuZGxlcihtb2R1bGUgJiYgbW9kdWxlLmhhbmRsZXIpO1xuICAgICAgICAgICAgfSwgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRrZXliaW5kaW5nSWQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5rZXlCaW5kaW5nLnNldEtleWJvYXJkSGFuZGxlcihrZXlib2FyZEhhbmRsZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUga2V5Ym9hcmQgaGFuZGxlciwgc3VjaCBhcyBcInZpbVwiIG9yIFwid2luZG93c1wiLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRLZXlib2FyZEhhbmRsZXJcbiAgICAgKiBAcmV0dXJuIHtIYXNoSGFuZGxlcn1cbiAgICAgKi9cbiAgICBnZXRLZXlib2FyZEhhbmRsZXIoKTogSGFzaEhhbmRsZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5rZXlCaW5kaW5nLmdldEtleWJvYXJkSGFuZGxlcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcgRWRpdFNlc3Npb24gdG8gdXNlLlxuICAgICAqIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2Vzc2lvbidgIGV2ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZXNzaW9uXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufSBUaGUgbmV3IHNlc3Npb24gdG8gdXNlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2Vzc2lvbihzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uID09PSBzZXNzaW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb2xkU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgaWYgKG9sZFNlc3Npb24pIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VcIiwgdGhpcy4kb25Eb2N1bWVudENoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlTW9kZVwiLCB0aGlzLiRvbkNoYW5nZU1vZGUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcInRva2VuaXplclVwZGF0ZVwiLCB0aGlzLiRvblRva2VuaXplclVwZGF0ZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlVGFiU2l6ZVwiLCB0aGlzLiRvbkNoYW5nZVRhYlNpemUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVdyYXBMaW1pdFwiLCB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlV3JhcE1vZGVcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwib25DaGFuZ2VGb2xkXCIsIHRoaXMuJG9uQ2hhbmdlRm9sZCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlRnJvbnRNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlcik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlQmFja01hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZUJyZWFrcG9pbnRcIiwgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlT3ZlcndyaXRlXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VTY3JvbGxUb3BcIiwgdGhpcy4kb25TY3JvbGxUb3BDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVNjcm9sbExlZnRcIiwgdGhpcy4kb25TY3JvbGxMZWZ0Q2hhbmdlKTtcblxuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5vZmYoXCJjaGFuZ2VDdXJzb3JcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuICAgICAgICAgICAgc2VsZWN0aW9uLm9mZihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvblNlbGVjdGlvbkNoYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoc2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy4kb25Eb2N1bWVudENoYW5nZSA9IHRoaXMub25Eb2N1bWVudENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlID0gdGhpcy5vbkNoYW5nZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlTW9kZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlID0gdGhpcy5vblRva2VuaXplclVwZGF0ZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcInRva2VuaXplclVwZGF0ZVwiLCB0aGlzLiRvblRva2VuaXplclVwZGF0ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSA9IHRoaXMucmVuZGVyZXIub25DaGFuZ2VUYWJTaXplLmJpbmQodGhpcy5yZW5kZXJlcik7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlVGFiU2l6ZVwiLCB0aGlzLiRvbkNoYW5nZVRhYlNpemUpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCA9IHRoaXMub25DaGFuZ2VXcmFwTGltaXQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VXcmFwTGltaXRcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTGltaXQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlID0gdGhpcy5vbkNoYW5nZVdyYXBNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlV3JhcE1vZGVcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlRm9sZCA9IHRoaXMub25DaGFuZ2VGb2xkLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLiRvbkNoYW5nZUZvbGQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyID0gdGhpcy5vbkNoYW5nZUZyb250TWFya2VyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlRnJvbnRNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlcik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlciA9IHRoaXMub25DaGFuZ2VCYWNrTWFya2VyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlQmFja01hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQgPSB0aGlzLm9uQ2hhbmdlQnJlYWtwb2ludC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZUJyZWFrcG9pbnRcIiwgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50KTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uID0gdGhpcy5vbkNoYW5nZUFubm90YXRpb24uYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlID0gdGhpcy5vbkN1cnNvckNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZU92ZXJ3cml0ZVwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2Nyb2xsVG9wQ2hhbmdlID0gdGhpcy5vblNjcm9sbFRvcENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZVNjcm9sbFRvcFwiLCB0aGlzLiRvblNjcm9sbFRvcENoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2Nyb2xsTGVmdENoYW5nZSA9IHRoaXMub25TY3JvbGxMZWZ0Q2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCB0aGlzLiRvblNjcm9sbExlZnRDaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IHNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5vbihcImNoYW5nZUN1cnNvclwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlID0gdGhpcy5vblNlbGVjdGlvbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlTW9kZSh2b2lkIDAsIHRoaXMuc2Vzc2lvbik7XG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICAgICAgdGhpcy5vbkN1cnNvckNoYW5nZSh2b2lkIDAsIHRoaXMuc2Vzc2lvbik7XG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgICAgICB0aGlzLm9uU2Nyb2xsVG9wQ2hhbmdlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25TY3JvbGxMZWZ0Q2hhbmdlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcblxuICAgICAgICAgICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoaXMuc2VsZWN0aW9uKTtcblxuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUZyb250TWFya2VyKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VCYWNrTWFya2VyKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VCcmVha3BvaW50KHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VBbm5vdGF0aW9uKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLnJlbmRlcmVyLmFkanVzdFdyYXBMaW1pdCgpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGdWxsKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTZXNzaW9uXCIsIHtcbiAgICAgICAgICAgIHNlc3Npb246IHNlc3Npb24sXG4gICAgICAgICAgICBvbGRTZXNzaW9uOiBvbGRTZXNzaW9uXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG9sZFNlc3Npb24gJiYgb2xkU2Vzc2lvbi5fc2lnbmFsKFwiY2hhbmdlRWRpdG9yXCIsIHsgb2xkRWRpdG9yOiB0aGlzIH0pO1xuICAgICAgICBzZXNzaW9uICYmIHNlc3Npb24uX3NpZ25hbChcImNoYW5nZUVkaXRvclwiLCB7IGVkaXRvcjogdGhpcyB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlc3Npb24gYmVpbmcgdXNlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2Vzc2lvblxuICAgICAqIEByZXR1cm4ge0VkaXRTZXNzaW9ufVxuICAgICAqL1xuICAgIGdldFNlc3Npb24oKTogRWRpdFNlc3Npb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgZG9jdW1lbnQgdG8gYHZhbGAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHZhbCBUaGUgbmV3IHZhbHVlIHRvIHNldCBmb3IgdGhlIGRvY3VtZW50XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGN1cnNvclBvcyBXaGVyZSB0byBzZXQgdGhlIG5ldyB2YWx1ZS4gYHVuZGVmaW5lZGAgb3IgMCBpcyBzZWxlY3RBbGwsIC0xIGlzIGF0IHRoZSBkb2N1bWVudCBzdGFydCwgYW5kICsxIGlzIGF0IHRoZSBlbmRcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1N0cmluZ30gVGhlIGN1cnJlbnQgZG9jdW1lbnQgdmFsdWVcbiAgICAgKiBAcmVsYXRlZCBEb2N1bWVudC5zZXRWYWx1ZVxuICAgICAqKi9cbiAgICBzZXRWYWx1ZSh2YWw6IHN0cmluZywgY3Vyc29yUG9zPzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5zZXRWYWx1ZSh2YWwpO1xuXG4gICAgICAgIGlmICghY3Vyc29yUG9zKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGN1cnNvclBvcyA9PSArMSkge1xuICAgICAgICAgICAgdGhpcy5uYXZpZ2F0ZUZpbGVFbmQoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjdXJzb3JQb3MgPT0gLTEpIHtcbiAgICAgICAgICAgIHRoaXMubmF2aWdhdGVGaWxlU3RhcnQoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBUT0RPOiBSYXRoZXIgY3JhenkhIEVpdGhlciByZXR1cm4gdGhpcyBvciB0aGUgZm9ybWVyIHZhbHVlP1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgc2Vzc2lvbidzIGNvbnRlbnQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9XG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0VmFsdWVcbiAgICAgKiovXG4gICAgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudGx5IGhpZ2hsaWdodGVkIHNlbGVjdGlvbi5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSBoaWdobGlnaHRlZCBzZWxlY3Rpb25cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHJlc2l6ZVxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIHJlY29tcHV0ZXMgdGhlIHNpemUsIGV2ZW4gaWYgdGhlIGhlaWdodCBhbmQgd2lkdGggaGF2ZW4ndCBjaGFuZ2VkLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcmVzaXplKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLm9uUmVzaXplKGZvcmNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZX1cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGhlbWUgVGhlIHBhdGggdG8gYSB0aGVtZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIG9wdGlvbmFsIGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZW1lIGlzIGxvYWRlZFxuICAgICAqKi9cbiAgICBzZXRUaGVtZSh0aGVtZTogc3RyaW5nLCBjYj86ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRUaGVtZSh0aGVtZSwgY2IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLmdldFRoZW1lfVxuICAgICAqXG4gICAgICogQHJldHVybiB7U3RyaW5nfSBUaGUgc2V0IHRoZW1lXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLmdldFRoZW1lXG4gICAgICoqL1xuICAgIGdldFRoZW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFRoZW1lKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNldFN0eWxlXG4gICAgICoqL1xuICAgIHNldFN0eWxlKHN0eWxlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTdHlsZShzdHlsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIudW5zZXRTdHlsZX1cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIudW5zZXRTdHlsZVxuICAgICAqKi9cbiAgICB1bnNldFN0eWxlKHN0eWxlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51bnNldFN0eWxlKHN0eWxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50IGZvbnQgc2l6ZSBvZiB0aGUgZWRpdG9yIHRleHQuXG4gICAgICovXG4gICAgZ2V0Rm9udFNpemUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZm9udFNpemVcIikgfHwgY29tcHV0ZWRTdHlsZSh0aGlzLmNvbnRhaW5lciwgXCJmb250U2l6ZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYSBuZXcgZm9udCBzaXplIChpbiBwaXhlbHMpIGZvciB0aGUgZWRpdG9yIHRleHQuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGZvbnRTaXplIEEgZm9udCBzaXplICggX2UuZy5fIFwiMTJweFwiKVxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0Rm9udFNpemUoZm9udFNpemU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZvbnRTaXplXCIsIGZvbnRTaXplKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRoaWdobGlnaHRCcmFja2V0cygpIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZU1hcmtlcih0aGlzLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0ID0gdm9pZCAwO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJGhpZ2hsaWdodFBlbmRpbmcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHBlcmZvcm0gaGlnaGxpZ2h0IGFzeW5jIHRvIG5vdCBibG9jayB0aGUgYnJvd3NlciBkdXJpbmcgbmF2aWdhdGlvblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi4kaGlnaGxpZ2h0UGVuZGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICB2YXIgcG9zID0gc2VsZi5zZXNzaW9uLmZpbmRNYXRjaGluZ0JyYWNrZXQoc2VsZi5nZXRDdXJzb3JQb3NpdGlvbigpKTtcbiAgICAgICAgICAgIGlmIChwb3MpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zLnJvdywgcG9zLmNvbHVtbiwgcG9zLnJvdywgcG9zLmNvbHVtbiArIDEpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzZWxmLnNlc3Npb24uJG1vZGUuZ2V0TWF0Y2hpbmcpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlID0gc2VsZi5zZXNzaW9uLiRtb2RlLmdldE1hdGNoaW5nKHNlbGYuc2Vzc2lvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmFuZ2UpXG4gICAgICAgICAgICAgICAgc2VsZi5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0ID0gc2VsZi5zZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2VfYnJhY2tldFwiLCBcInRleHRcIik7XG4gICAgICAgIH0sIDUwKTtcbiAgICB9XG5cbiAgICAvLyB0b2RvOiBtb3ZlIHRvIG1vZGUuZ2V0TWF0Y2hpbmdcbiAgICBwcml2YXRlICRoaWdobGlnaHRUYWdzKCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0VGFnUGVuZGluZykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGVyZm9ybSBoaWdobGlnaHQgYXN5bmMgdG8gbm90IGJsb2NrIHRoZSBicm93c2VyIGR1cmluZyBuYXZpZ2F0aW9uXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0VGFnUGVuZGluZyA9IHRydWU7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLiRoaWdobGlnaHRUYWdQZW5kaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciBwb3MgPSBzZWxmLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcihzZWxmLnNlc3Npb24sIHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgdmFyIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG5cbiAgICAgICAgICAgIGlmICghdG9rZW4gfHwgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB0YWcgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIHZhciBkZXB0aCA9IDA7XG4gICAgICAgICAgICB2YXIgcHJldlRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG5cbiAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgLy9maW5kIGNsb3NpbmcgdGFnXG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSB0b2tlbjtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi52YWx1ZSA9PT0gdGFnICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoKys7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoLS07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHRva2VuICYmIGRlcHRoID49IDApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL2ZpbmQgb3BlbmluZyB0YWdcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gcHJldlRva2VuO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAocHJldlRva2VuICYmIGRlcHRoIDw9IDApO1xuXG4gICAgICAgICAgICAgICAgLy9zZWxlY3QgdGFnIGFnYWluXG4gICAgICAgICAgICAgICAgaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHZhciBjb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKTtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShyb3csIGNvbHVtbiwgcm93LCBjb2x1bW4gKyB0b2tlbi52YWx1ZS5sZW5ndGgpO1xuXG4gICAgICAgICAgICAvL3JlbW92ZSByYW5nZSBpZiBkaWZmZXJlbnRcbiAgICAgICAgICAgIGlmIChzZXNzaW9uLiR0YWdIaWdobGlnaHQgJiYgcmFuZ2UuY29tcGFyZVJhbmdlKHNlc3Npb24uJGJhY2tNYXJrZXJzW3Nlc3Npb24uJHRhZ0hpZ2hsaWdodF0ucmFuZ2UpICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmFuZ2UgJiYgIXNlc3Npb24uJHRhZ0hpZ2hsaWdodClcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2VfYnJhY2tldFwiLCBcInRleHRcIik7XG4gICAgICAgIH0sIDUwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEJyaW5ncyB0aGUgY3VycmVudCBgdGV4dElucHV0YCBpbnRvIGZvY3VzLlxuICAgICAqKi9cbiAgICBmb2N1cygpIHtcbiAgICAgICAgLy8gU2FmYXJpIG5lZWRzIHRoZSB0aW1lb3V0XG4gICAgICAgIC8vIGlPUyBhbmQgRmlyZWZveCBuZWVkIGl0IGNhbGxlZCBpbW1lZGlhdGVseVxuICAgICAgICAvLyB0byBiZSBvbiB0aGUgc2F2ZSBzaWRlIHdlIGRvIGJvdGhcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIF9zZWxmLnRleHRJbnB1dC5mb2N1cygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy50ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY3VycmVudCBgdGV4dElucHV0YCBpcyBpbiBmb2N1cy5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnRleHRJbnB1dC5pc0ZvY3VzZWQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGB0ZXh0SW5wdXRgLlxuICAgICAqKi9cbiAgICBibHVyKCkge1xuICAgICAgICB0aGlzLnRleHRJbnB1dC5ibHVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCBvbmNlIHRoZSBlZGl0b3IgY29tZXMgaW50byBmb2N1cy5cbiAgICAgKiBAZXZlbnQgZm9jdXNcbiAgICAgKlxuICAgICAqKi9cbiAgICBvbkZvY3VzKCkge1xuICAgICAgICBpZiAodGhpcy4kaXNGb2N1c2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaXNGb2N1c2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaG93Q3Vyc29yKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudmlzdWFsaXplRm9jdXMoKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgb25jZSB0aGUgZWRpdG9yIGhhcyBiZWVuIGJsdXJyZWQuXG4gICAgICogQGV2ZW50IGJsdXJcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uQmx1cigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRpc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRpc0ZvY3VzZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5oaWRlQ3Vyc29yKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudmlzdWFsaXplQmx1cigpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiYmx1clwiKTtcbiAgICB9XG5cbiAgICAkY3Vyc29yQ2hhbmdlKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbmV2ZXIgdGhlIGRvY3VtZW50IGlzIGNoYW5nZWQuXG4gICAgICogQGV2ZW50IGNoYW5nZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBlIENvbnRhaW5zIGEgc2luZ2xlIHByb3BlcnR5LCBgZGF0YWAsIHdoaWNoIGhhcyB0aGUgZGVsdGEgb2YgY2hhbmdlc1xuICAgICAqXG4gICAgICoqL1xuICAgIG9uRG9jdW1lbnRDaGFuZ2UoZSwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHZhciBkZWx0YSA9IGUuZGF0YTtcbiAgICAgICAgdmFyIHJhbmdlID0gZGVsdGEucmFuZ2U7XG4gICAgICAgIHZhciBsYXN0Um93OiBudW1iZXI7XG5cbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA9PSByYW5nZS5lbmQucm93ICYmIGRlbHRhLmFjdGlvbiAhPSBcImluc2VydExpbmVzXCIgJiYgZGVsdGEuYWN0aW9uICE9IFwicmVtb3ZlTGluZXNcIilcbiAgICAgICAgICAgIGxhc3RSb3cgPSByYW5nZS5lbmQucm93O1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBsYXN0Um93ID0gSW5maW5pdHk7XG5cbiAgICAgICAgdmFyIHI6IFZpcnR1YWxSZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG4gICAgICAgIHIudXBkYXRlTGluZXMocmFuZ2Uuc3RhcnQucm93LCBsYXN0Um93LCB0aGlzLnNlc3Npb24uJHVzZVdyYXBNb2RlKTtcblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VcIiwgZSk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGN1cnNvciBiZWNhdXNlIHRhYiBjaGFyYWN0ZXJzIGNhbiBpbmZsdWVuY2UgdGhlIGN1cnNvciBwb3NpdGlvblxuICAgICAgICB0aGlzLiRjdXJzb3JDaGFuZ2UoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgIH1cblxuICAgIG9uVG9rZW5pemVyVXBkYXRlKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdmFyIHJvd3MgPSBldmVudC5kYXRhO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUxpbmVzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCk7XG4gICAgfVxuXG5cbiAgICBvblNjcm9sbFRvcENoYW5nZShldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9ZKHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSk7XG4gICAgfVxuXG4gICAgb25TY3JvbGxMZWZ0Q2hhbmdlKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb1godGhpcy5zZXNzaW9uLmdldFNjcm9sbExlZnQoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGFuZGxlciBmb3IgY3Vyc29yIG9yIHNlbGVjdGlvbiBjaGFuZ2VzLlxuICAgICAqL1xuICAgIG9uQ3Vyc29yQ2hhbmdlKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yQ2hhbmdlKCk7XG5cbiAgICAgICAgaWYgKCF0aGlzLiRibG9ja1Njcm9sbGluZykge1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0QnJhY2tldHMoKTtcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0VGFncygpO1xuICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIC8vIFRPRE87IEhvdyBpcyBzaWduYWwgZGlmZmVyZW50IGZyb20gZW1pdD9cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgIH1cblxuICAgIHB1YmxpYyAkdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpIHtcblxuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcjtcblxuICAgICAgICB2YXIgaGlnaGxpZ2h0O1xuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0QWN0aXZlTGluZSkge1xuICAgICAgICAgICAgaWYgKCh0aGlzLiRzZWxlY3Rpb25TdHlsZSAhPSBcImxpbmVcIiB8fCAhdGhpcy5zZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSkpIHtcbiAgICAgICAgICAgICAgICBoaWdobGlnaHQgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVuZGVyZXIuJG1heExpbmVzICYmIHNlc3Npb24uZ2V0TGVuZ3RoKCkgPT09IDEgJiYgIShyZW5kZXJlci4kbWluTGluZXMgPiAxKSkge1xuICAgICAgICAgICAgICAgIGhpZ2hsaWdodCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgJiYgIWhpZ2hsaWdodCkge1xuICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlci5tYXJrZXJJZCk7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciAmJiBoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBuZXcgUmFuZ2UoaGlnaGxpZ2h0LnJvdywgaGlnaGxpZ2h0LmNvbHVtbiwgaGlnaGxpZ2h0LnJvdywgSW5maW5pdHkpO1xuICAgICAgICAgICAgcmFuZ2UubWFya2VySWQgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2VfYWN0aXZlLWxpbmVcIiwgXCJzY3JlZW5MaW5lXCIpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciA9IHJhbmdlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGhpZ2hsaWdodCkge1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlci5zdGFydC5yb3cgPSBoaWdobGlnaHQucm93O1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlci5lbmQucm93ID0gaGlnaGxpZ2h0LnJvdztcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuc3RhcnQuY29sdW1uID0gaGlnaGxpZ2h0LmNvbHVtbjtcbiAgICAgICAgICAgIHNlc3Npb24uX3NpZ25hbChcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBUaGlzIHZlcnNpb24gaGFzIG5vdCBiZWVuIGJvdW5kIHRvIGB0aGlzYCwgc28gZG9uJ3QgdXNlIGl0IGRpcmVjdGx5LlxuICAgIHByaXZhdGUgb25TZWxlY3Rpb25DaGFuZ2UoZXZlbnQsIHNlbGVjdGlvbjogU2VsZWN0aW9uKTogdm9pZCB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXG4gICAgICAgIGlmICh0eXBlb2Ygc2Vzc2lvbi4kc2VsZWN0aW9uTWFya2VyID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kc2VsZWN0aW9uTWFya2VyKTtcbiAgICAgICAgICAgIHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciBzdHlsZSA9IHRoaXMuZ2V0U2VsZWN0aW9uU3R5bGUoKTtcbiAgICAgICAgICAgIHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlciA9IHNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9zZWxlY3Rpb25cIiwgc3R5bGUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlID0gdGhpcy4kaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkICYmIHRoaXMuJGdldFNlbGVjdGlvbkhpZ2hMaWdodFJlZ2V4cCgpO1xuICAgICAgICB0aGlzLnNlc3Npb24uaGlnaGxpZ2h0KHJlKTtcblxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgfVxuXG4gICAgJGdldFNlbGVjdGlvbkhpZ2hMaWdodFJlZ2V4cCgpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkgfHwgc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHN0YXJ0T3V0ZXIgPSBzZWxlY3Rpb24uc3RhcnQuY29sdW1uIC0gMTtcbiAgICAgICAgdmFyIGVuZE91dGVyID0gc2VsZWN0aW9uLmVuZC5jb2x1bW4gKyAxO1xuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShzZWxlY3Rpb24uc3RhcnQucm93KTtcbiAgICAgICAgdmFyIGxpbmVDb2xzID0gbGluZS5sZW5ndGg7XG4gICAgICAgIHZhciBuZWVkbGUgPSBsaW5lLnN1YnN0cmluZyhNYXRoLm1heChzdGFydE91dGVyLCAwKSxcbiAgICAgICAgICAgIE1hdGgubWluKGVuZE91dGVyLCBsaW5lQ29scykpO1xuXG4gICAgICAgIC8vIE1ha2Ugc3VyZSB0aGUgb3V0ZXIgY2hhcmFjdGVycyBhcmUgbm90IHBhcnQgb2YgdGhlIHdvcmQuXG4gICAgICAgIGlmICgoc3RhcnRPdXRlciA+PSAwICYmIC9eW1xcd1xcZF0vLnRlc3QobmVlZGxlKSkgfHxcbiAgICAgICAgICAgIChlbmRPdXRlciA8PSBsaW5lQ29scyAmJiAvW1xcd1xcZF0kLy50ZXN0KG5lZWRsZSkpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIG5lZWRsZSA9IGxpbmUuc3Vic3RyaW5nKHNlbGVjdGlvbi5zdGFydC5jb2x1bW4sIHNlbGVjdGlvbi5lbmQuY29sdW1uKTtcbiAgICAgICAgaWYgKCEvXltcXHdcXGRdKyQvLnRlc3QobmVlZGxlKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcmUgPSB0aGlzLiRzZWFyY2guJGFzc2VtYmxlUmVnRXhwKHtcbiAgICAgICAgICAgIHdob2xlV29yZDogdHJ1ZSxcbiAgICAgICAgICAgIGNhc2VTZW5zaXRpdmU6IHRydWUsXG4gICAgICAgICAgICBuZWVkbGU6IG5lZWRsZVxuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcmU7XG4gICAgfVxuXG5cbiAgICBvbkNoYW5nZUZyb250TWFya2VyKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGcm9udE1hcmtlcnMoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZUJhY2tNYXJrZXIoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUJhY2tNYXJrZXJzKCk7XG4gICAgfVxuXG5cbiAgICBvbkNoYW5nZUJyZWFrcG9pbnQoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUJyZWFrcG9pbnRzKCk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VCcmVha3BvaW50XCIsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZUFubm90YXRpb24oZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldEFubm90YXRpb25zKGVkaXRTZXNzaW9uLmdldEFubm90YXRpb25zKCkpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlQW5ub3RhdGlvblwiLCBldmVudCk7XG4gICAgfVxuXG5cbiAgICBvbkNoYW5nZU1vZGUoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZVRleHQoKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZU1vZGVcIiwgZXZlbnQpO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VXcmFwTGltaXQoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZVdyYXBNb2RlKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5vblJlc2l6ZSh0cnVlKTtcbiAgICB9XG5cblxuICAgIG9uQ2hhbmdlRm9sZChldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgYWN0aXZlIGxpbmUgbWFya2VyIGFzIGR1ZSB0byBmb2xkaW5nIGNoYW5nZXMgdGhlIGN1cnJlbnRcbiAgICAgICAgLy8gbGluZSByYW5nZSBvbiB0aGUgc2NyZWVuIG1pZ2h0IGhhdmUgY2hhbmdlZC5cbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICAvLyBUT0RPOiBUaGlzIG1pZ2h0IGJlIHRvbyBtdWNoIHVwZGF0aW5nLiBPa2F5IGZvciBub3cuXG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlRnVsbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBvZiB0ZXh0IGN1cnJlbnRseSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9XG4gICAgICoqL1xuICAgIGdldFNlbGVjdGVkVGV4dCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW4gdGV4dCBpcyBjb3BpZWQuXG4gICAgICogQGV2ZW50IGNvcHlcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgY29waWVkIHRleHRcbiAgICAgKlxuICAgICAqKi9cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGV4dCBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHJldHVybiB7U3RyaW5nfVxuICAgICAqIEBkZXByZWNhdGVkIFVzZSBnZXRTZWxlY3RlZFRleHQgaW5zdGVhZC5cbiAgICAgKiovXG4gICAgZ2V0Q29weVRleHQoKSB7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5nZXRTZWxlY3RlZFRleHQoKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY29weVwiLCB0ZXh0KTtcbiAgICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImNvcHlcIiBoYXBwZW5zLlxuICAgICAqKi9cbiAgICBvbkNvcHkoKSB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhcImNvcHlcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImN1dFwiIGhhcHBlbnMuXG4gICAgICoqL1xuICAgIG9uQ3V0KCkge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoXCJjdXRcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgcGFzdGVkLlxuICAgICAqIEBldmVudCBwYXN0ZVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBwYXN0ZWQgdGV4dFxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcInBhc3RlXCIgaGFwcGVucy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgcGFzdGVkIHRleHRcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uUGFzdGUodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIC8vIHRvZG8gdGhpcyBzaG91bGQgY2hhbmdlIHdoZW4gcGFzdGUgYmVjb21lcyBhIGNvbW1hbmRcbiAgICAgICAgaWYgKHRoaXMuJHJlYWRPbmx5KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgZSA9IHsgdGV4dDogdGV4dCB9O1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJwYXN0ZVwiLCBlKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoZS50ZXh0LCB0cnVlKTtcbiAgICB9XG5cblxuICAgIGV4ZWNDb21tYW5kKGNvbW1hbmQsIGFyZ3M/KTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhjb21tYW5kLCB0aGlzLCBhcmdzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGB0ZXh0YCBpbnRvIHdoZXJldmVyIHRoZSBjdXJzb3IgaXMgcG9pbnRpbmcuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIG5ldyB0ZXh0IHRvIGFkZFxuICAgICAqXG4gICAgICoqL1xuICAgIGluc2VydCh0ZXh0OiBzdHJpbmcsIHBhc3RlZD86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciBtb2RlID0gc2Vzc2lvbi5nZXRNb2RlKCk7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuZ2V0QmVoYXZpb3Vyc0VuYWJsZWQoKSAmJiAhcGFzdGVkKSB7XG4gICAgICAgICAgICAvLyBHZXQgYSB0cmFuc2Zvcm0gaWYgdGhlIGN1cnJlbnQgbW9kZSB3YW50cyBvbmUuXG4gICAgICAgICAgICB2YXIgdHJhbnNmb3JtID0gbW9kZS50cmFuc2Zvcm1BY3Rpb24oc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KSwgJ2luc2VydGlvbicsIHRoaXMsIHNlc3Npb24sIHRleHQpO1xuICAgICAgICAgICAgaWYgKHRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0ICE9PSB0cmFuc2Zvcm0udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb24ubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1lcmdlTmV4dENvbW1hbmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGV4dCA9IHRyYW5zZm9ybS50ZXh0O1xuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGV4dCA9PT0gXCJcXHRcIikge1xuICAgICAgICAgICAgdGV4dCA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlbW92ZSBzZWxlY3RlZCB0ZXh0XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgICAgICBjdXJzb3IgPSB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLnNlc3Npb24uZ2V0T3ZlcndyaXRlKCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoY3Vyc29yLCBjdXJzb3IpO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiArPSB0ZXh0Lmxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRleHQgPT09IFwiXFxuXCIgfHwgdGV4dCA9PT0gXCJcXHJcXG5cIikge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgICAgICBpZiAoY3Vyc29yLmNvbHVtbiA+IGxpbmUuc2VhcmNoKC9cXFN8JC8pKSB7XG4gICAgICAgICAgICAgICAgdmFyIGQgPSBsaW5lLnN1YnN0cihjdXJzb3IuY29sdW1uKS5zZWFyY2goL1xcU3wkLyk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5kb2MucmVtb3ZlSW5MaW5lKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4sIGN1cnNvci5jb2x1bW4gKyBkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG5cbiAgICAgICAgdmFyIHN0YXJ0ID0gY3Vyc29yLmNvbHVtbjtcbiAgICAgICAgdmFyIGxpbmVTdGF0ZSA9IHNlc3Npb24uZ2V0U3RhdGUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgc2hvdWxkT3V0ZGVudCA9IG1vZGUuY2hlY2tPdXRkZW50KGxpbmVTdGF0ZSwgbGluZSwgdGV4dCk7XG4gICAgICAgIHZhciBlbmQgPSBzZXNzaW9uLmluc2VydChjdXJzb3IsIHRleHQpO1xuXG4gICAgICAgIGlmICh0cmFuc2Zvcm0gJiYgdHJhbnNmb3JtLnNlbGVjdGlvbikge1xuICAgICAgICAgICAgaWYgKHRyYW5zZm9ybS5zZWxlY3Rpb24ubGVuZ3RoID09IDIpIHsgLy8gVHJhbnNmb3JtIHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IGNvbHVtblxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBuZXcgUmFuZ2UoY3Vyc29yLnJvdywgc3RhcnQgKyB0cmFuc2Zvcm0uc2VsZWN0aW9uWzBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3Vyc29yLnJvdywgc3RhcnQgKyB0cmFuc2Zvcm0uc2VsZWN0aW9uWzFdKSk7XG4gICAgICAgICAgICB9IGVsc2UgeyAvLyBUcmFuc2Zvcm0gcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgcm93LlxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBuZXcgUmFuZ2UoY3Vyc29yLnJvdyArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0uc2VsZWN0aW9uWzFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3Vyc29yLnJvdyArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMl0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0uc2VsZWN0aW9uWzNdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2Vzc2lvbi5nZXREb2N1bWVudCgpLmlzTmV3TGluZSh0ZXh0KSkge1xuICAgICAgICAgICAgdmFyIGxpbmVJbmRlbnQgPSBtb2RlLmdldE5leHRMaW5lSW5kZW50KGxpbmVTdGF0ZSwgbGluZS5zbGljZSgwLCBjdXJzb3IuY29sdW1uKSwgc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKSk7XG5cbiAgICAgICAgICAgIHNlc3Npb24uaW5zZXJ0KHsgcm93OiBjdXJzb3Iucm93ICsgMSwgY29sdW1uOiAwIH0sIGxpbmVJbmRlbnQpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzaG91bGRPdXRkZW50KSB7XG4gICAgICAgICAgICBtb2RlLmF1dG9PdXRkZW50KGxpbmVTdGF0ZSwgc2Vzc2lvbiwgY3Vyc29yLnJvdyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvblRleHRJbnB1dCh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nLm9uVGV4dElucHV0KHRleHQpO1xuICAgICAgICAvLyBUT0RPOiBUaGlzIHNob3VsZCBiZSBwbHVnZ2FibGUuXG4gICAgICAgIGlmICh0ZXh0ID09PSAnLicpIHtcbiAgICAgICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhDT01NQU5EX05BTUVfQVVUT19DT01QTEVURSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5nZXRTZXNzaW9uKCkuZ2V0RG9jdW1lbnQoKS5pc05ld0xpbmUodGV4dCkpIHtcbiAgICAgICAgICAgIHZhciBsaW5lTnVtYmVyID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgdmFyIG9wdGlvbiA9IG5ldyBTZXJ2aWNlcy5FZGl0b3JPcHRpb25zKCk7XG4gICAgICAgICAgICAvLyAgICAgICAgICAgIG9wdGlvbi5OZXdMaW5lQ2hhcmFjdGVyID0gXCJcXG5cIjtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBTbWFydCBJbmRlbnRpbmdcbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICB2YXIgaW5kZW50ID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldFNtYXJ0SW5kZW50QXRMaW5lTnVtYmVyKGN1cnJlbnRGaWxlTmFtZSwgbGluZU51bWJlciwgb3B0aW9uKTtcbiAgICAgICAgICAgIGlmKGluZGVudCA+IDApXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmNvbW1hbmRzLmV4ZWMoXCJpbnNlcnR0ZXh0XCIsIGVkaXRvciwge3RleHQ6XCIgXCIsIHRpbWVzOmluZGVudH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgKi9cbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uQ29tbWFuZEtleShlLCBoYXNoSWQ6IG51bWJlciwga2V5Q29kZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMua2V5QmluZGluZy5vbkNvbW1hbmRLZXkoZSwgaGFzaElkLCBrZXlDb2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXNzIGluIGB0cnVlYCB0byBlbmFibGUgb3ZlcndyaXRlcyBpbiB5b3VyIHNlc3Npb24sIG9yIGBmYWxzZWAgdG8gZGlzYWJsZS4gSWYgb3ZlcndyaXRlcyBpcyBlbmFibGVkLCBhbnkgdGV4dCB5b3UgZW50ZXIgd2lsbCB0eXBlIG92ZXIgYW55IHRleHQgYWZ0ZXIgaXQuIElmIHRoZSB2YWx1ZSBvZiBgb3ZlcndyaXRlYCBjaGFuZ2VzLCB0aGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgY2hhbmdlT3ZlcndyaXRlYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IG92ZXJ3cml0ZSBEZWZpbmVzIHdoZXRlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0T3ZlcndyaXRlXG4gICAgICoqL1xuICAgIHNldE92ZXJ3cml0ZShvdmVyd3JpdGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldE92ZXJ3cml0ZShvdmVyd3JpdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIG92ZXJ3cml0ZXMgYXJlIGVuYWJsZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0T3ZlcndyaXRlXG4gICAgICoqL1xuICAgIGdldE92ZXJ3cml0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZSBvZiBvdmVyd3JpdGUgdG8gdGhlIG9wcG9zaXRlIG9mIHdoYXRldmVyIGl0IGN1cnJlbnRseSBpcy5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgdG9nZ2xlT3ZlcndyaXRlKCkge1xuICAgICAgICB0aGlzLnNlc3Npb24udG9nZ2xlT3ZlcndyaXRlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBob3cgZmFzdCB0aGUgbW91c2Ugc2Nyb2xsaW5nIHNob3VsZCBkby5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc3BlZWQgQSB2YWx1ZSBpbmRpY2F0aW5nIHRoZSBuZXcgc3BlZWQgKGluIG1pbGxpc2Vjb25kcylcbiAgICAgKiovXG4gICAgc2V0U2Nyb2xsU3BlZWQoc3BlZWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNjcm9sbFNwZWVkXCIsIHNwZWVkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBpbmRpY2F0aW5nIGhvdyBmYXN0IHRoZSBtb3VzZSBzY3JvbGwgc3BlZWQgaXMgKGluIG1pbGxpc2Vjb25kcykuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXRTY3JvbGxTcGVlZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzY3JvbGxTcGVlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBkZWxheSAoaW4gbWlsbGlzZWNvbmRzKSBvZiB0aGUgbW91c2UgZHJhZy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZHJhZ0RlbGF5IEEgdmFsdWUgaW5kaWNhdGluZyB0aGUgbmV3IGRlbGF5XG4gICAgICoqL1xuICAgIHNldERyYWdEZWxheShkcmFnRGVsYXk6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRyYWdEZWxheVwiLCBkcmFnRGVsYXkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbW91c2UgZHJhZyBkZWxheS5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIGdldERyYWdEZWxheSgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJkcmFnRGVsYXlcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRoZSBzZWxlY3Rpb24gc3R5bGUgY2hhbmdlcywgdmlhIFtbRWRpdG9yLnNldFNlbGVjdGlvblN0eWxlXV0uXG4gICAgICogQGV2ZW50IGNoYW5nZVNlbGVjdGlvblN0eWxlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGRhdGEgQ29udGFpbnMgb25lIHByb3BlcnR5LCBgZGF0YWAsIHdoaWNoIGluZGljYXRlcyB0aGUgbmV3IHNlbGVjdGlvbiBzdHlsZVxuICAgICAqKi9cbiAgICAvKipcbiAgICAgKiBEcmF3IHNlbGVjdGlvbiBtYXJrZXJzIHNwYW5uaW5nIHdob2xlIGxpbmUsIG9yIG9ubHkgb3ZlciBzZWxlY3RlZCB0ZXh0LiBEZWZhdWx0IHZhbHVlIGlzIFwibGluZVwiXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIFRoZSBuZXcgc2VsZWN0aW9uIHN0eWxlIFwibGluZVwifFwidGV4dFwiXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0U2VsZWN0aW9uU3R5bGUodmFsOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzZWxlY3Rpb25TdHlsZVwiLCB2YWwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIHN0eWxlLlxuICAgICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uU3R5bGUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2VsZWN0aW9uU3R5bGVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGUgY3VycmVudCBsaW5lIHNob3VsZCBiZSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3VsZEhpZ2hsaWdodCBTZXQgdG8gYHRydWVgIHRvIGhpZ2hsaWdodCB0aGUgY3VycmVudCBsaW5lXG4gICAgICoqL1xuICAgIHNldEhpZ2hsaWdodEFjdGl2ZUxpbmUoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0QWN0aXZlTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGN1cnJlbnQgbGluZXMgYXJlIGFsd2F5cyBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIaWdobGlnaHRBY3RpdmVMaW5lKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRBY3RpdmVMaW5lXCIpO1xuICAgIH1cblxuICAgIHNldEhpZ2hsaWdodEd1dHRlckxpbmUoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIGdldEhpZ2hsaWdodEd1dHRlckxpbmUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyBpZiB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHdvcmQgc2hvdWxkIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkSGlnaGxpZ2h0IFNldCB0byBgdHJ1ZWAgdG8gaGlnaGxpZ2h0IHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgd29yZFxuICAgICAqXG4gICAgICoqL1xuICAgIHNldEhpZ2hsaWdodFNlbGVjdGVkV29yZChzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRTZWxlY3RlZFdvcmRcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQgd29yZHMgYXJlIHRvIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhpZ2hsaWdodFNlbGVjdGVkV29yZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGhpZ2hsaWdodFNlbGVjdGVkV29yZDtcbiAgICB9XG5cbiAgICBzZXRBbmltYXRlZFNjcm9sbChzaG91bGRBbmltYXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldEFuaW1hdGVkU2Nyb2xsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHNob3dJbnZpc2libGVzYCBpcyBzZXQgdG8gYHRydWVgLCBpbnZpc2libGUgY2hhcmFjdGVycyZtZGFzaDtsaWtlIHNwYWNlcyBvciBuZXcgbGluZXMmbWRhc2g7YXJlIHNob3cgaW4gdGhlIGVkaXRvci5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dJbnZpc2libGVzIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzaG93IGludmlzaWJsZSBjaGFyYWN0ZXJzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgaW52aXNpYmxlIGNoYXJhY3RlcnMgYXJlIGJlaW5nIHNob3duLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldFNob3dJbnZpc2libGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRTaG93SW52aXNpYmxlcygpO1xuICAgIH1cblxuICAgIHNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlcyk7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUluZGVudEd1aWRlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGBzaG93UHJpbnRNYXJnaW5gIGlzIHNldCB0byBgdHJ1ZWAsIHRoZSBwcmludCBtYXJnaW4gaXMgc2hvd24gaW4gdGhlIGVkaXRvci5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dQcmludE1hcmdpbiBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luXG4gICAgICoqL1xuICAgIHNldFNob3dQcmludE1hcmdpbihzaG93UHJpbnRNYXJnaW46IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaG93UHJpbnRNYXJnaW4oc2hvd1ByaW50TWFyZ2luKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgcHJpbnQgbWFyZ2luIGlzIGJlaW5nIHNob3duLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd1ByaW50TWFyZ2luKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjb2x1bW4gZGVmaW5pbmcgd2hlcmUgdGhlIHByaW50IG1hcmdpbiBzaG91bGQgYmUuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNob3dQcmludE1hcmdpbiBTcGVjaWZpZXMgdGhlIG5ldyBwcmludCBtYXJnaW5cbiAgICAgKi9cbiAgICBzZXRQcmludE1hcmdpbkNvbHVtbihzaG93UHJpbnRNYXJnaW46IG51bWJlcikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFByaW50TWFyZ2luQ29sdW1uKHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29sdW1uIG51bWJlciBvZiB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIGlzLlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKi9cbiAgICBnZXRQcmludE1hcmdpbkNvbHVtbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRQcmludE1hcmdpbkNvbHVtbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGByZWFkT25seWAgaXMgdHJ1ZSwgdGhlbiB0aGUgZWRpdG9yIGlzIHNldCB0byByZWFkLW9ubHkgbW9kZSwgYW5kIG5vbmUgb2YgdGhlIGNvbnRlbnQgY2FuIGNoYW5nZS5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJlYWRPbmx5IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBlZGl0b3IgY2FuIGJlIG1vZGlmaWVkIG9yIG5vdFxuICAgICAqXG4gICAgICoqL1xuICAgIHNldFJlYWRPbmx5KHJlYWRPbmx5OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwicmVhZE9ubHlcIiwgcmVhZE9ubHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBlZGl0b3IgaXMgc2V0IHRvIHJlYWQtb25seSBtb2RlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldFJlYWRPbmx5KCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJyZWFkT25seVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTcGVjaWZpZXMgd2hldGhlciB0byB1c2UgYmVoYXZpb3JzIG9yIG5vdC4gW1wiQmVoYXZpb3JzXCIgaW4gdGhpcyBjYXNlIGlzIHRoZSBhdXRvLXBhaXJpbmcgb2Ygc3BlY2lhbCBjaGFyYWN0ZXJzLCBsaWtlIHF1b3RhdGlvbiBtYXJrcywgcGFyZW50aGVzaXMsIG9yIGJyYWNrZXRzLl17OiAjQmVoYXZpb3JzRGVmfVxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZCBFbmFibGVzIG9yIGRpc2FibGVzIGJlaGF2aW9yc1xuICAgICAqXG4gICAgICoqL1xuICAgIHNldEJlaGF2aW91cnNFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJiZWhhdmlvdXJzRW5hYmxlZFwiLCBlbmFibGVkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYmVoYXZpb3JzIGFyZSBjdXJyZW50bHkgZW5hYmxlZC4gezpCZWhhdmlvcnNEZWZ9XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRCZWhhdmlvdXJzRW5hYmxlZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiYmVoYXZpb3Vyc0VuYWJsZWRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BlY2lmaWVzIHdoZXRoZXIgdG8gdXNlIHdyYXBwaW5nIGJlaGF2aW9ycyBvciBub3QsIGkuZS4gYXV0b21hdGljYWxseSB3cmFwcGluZyB0aGUgc2VsZWN0aW9uIHdpdGggY2hhcmFjdGVycyBzdWNoIGFzIGJyYWNrZXRzXG4gICAgICogd2hlbiBzdWNoIGEgY2hhcmFjdGVyIGlzIHR5cGVkIGluLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZCBFbmFibGVzIG9yIGRpc2FibGVzIHdyYXBwaW5nIGJlaGF2aW9yc1xuICAgICAqXG4gICAgICoqL1xuICAgIHNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwid3JhcEJlaGF2aW91cnNFbmFibGVkXCIsIGVuYWJsZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSB3cmFwcGluZyBiZWhhdmlvcnMgYXJlIGN1cnJlbnRseSBlbmFibGVkLlxuICAgICAqKi9cbiAgICBnZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcIndyYXBCZWhhdmlvdXJzRW5hYmxlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgd2hldGhlciB0aGUgZm9sZCB3aWRnZXRzIHNob3VsZCBiZSBzaG93biBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBmb2xkIHdpZGdldHMgYXJlIHNob3duXG4gICAgICoqL1xuICAgIHNldFNob3dGb2xkV2lkZ2V0cyhzaG93OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ZvbGRXaWRnZXRzXCIsIHNob3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBmb2xkIHdpZGdldHMgYXJlIHNob3duLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ZvbGRXaWRnZXRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93Rm9sZFdpZGdldHNcIik7XG4gICAgfVxuXG4gICAgc2V0RmFkZUZvbGRXaWRnZXRzKGZhZGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIiwgZmFkZSk7XG4gICAgfVxuXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB3b3JkcyBvZiB0ZXh0IGZyb20gdGhlIGVkaXRvci4gQSBcIndvcmRcIiBpcyBkZWZpbmVkIGFzIGEgc3RyaW5nIG9mIGNoYXJhY3RlcnMgYm9va2VuZGVkIGJ5IHdoaXRlc3BhY2UuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGRpcmVjdGlvbiBUaGUgZGlyZWN0aW9uIG9mIHRoZSBkZWxldGlvbiB0byBvY2N1ciwgZWl0aGVyIFwibGVmdFwiIG9yIFwicmlnaHRcIlxuICAgICAqXG4gICAgICoqL1xuICAgIHJlbW92ZShkaXJlY3Rpb246IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICBpZiAoZGlyZWN0aW9uID09IFwibGVmdFwiKVxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExlZnQoKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RSaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5nZXRCZWhhdmlvdXJzRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHNlc3Npb24uZ2V0U3RhdGUocmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgICAgIHZhciBuZXdfcmFuZ2UgPSBzZXNzaW9uLmdldE1vZGUoKS50cmFuc2Zvcm1BY3Rpb24oc3RhdGUsICdkZWxldGlvbicsIHRoaXMsIHNlc3Npb24sIHJhbmdlKTtcblxuICAgICAgICAgICAgaWYgKHJhbmdlLmVuZC5jb2x1bW4gPT09IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAodGV4dFt0ZXh0Lmxlbmd0aCAtIDFdID09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUocmFuZ2UuZW5kLnJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgvXlxccyskLy50ZXN0KGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmV3X3JhbmdlKVxuICAgICAgICAgICAgICAgIHJhbmdlID0gbmV3X3JhbmdlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSB3b3JkIGRpcmVjdGx5IHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIHJlbW92ZVdvcmRSaWdodCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmRSaWdodCgpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIHdvcmQgZGlyZWN0bHkgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICByZW1vdmVXb3JkTGVmdCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIHdvcmRzIHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgdW50aWwgdGhlIHN0YXJ0IG9mIHRoZSBsaW5lLlxuICAgICAqKi9cbiAgICByZW1vdmVUb0xpbmVTdGFydCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExpbmVTdGFydCgpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYWxsIHRoZSB3b3JkcyB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCB1bnRpbCB0aGUgZW5kIG9mIHRoZSBsaW5lLlxuICAgICAqKi9cbiAgICByZW1vdmVUb0xpbmVFbmQoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RMaW5lRW5kKCk7XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQuY29sdW1uID09PSByYW5nZS5lbmQuY29sdW1uICYmIHJhbmdlLnN0YXJ0LnJvdyA9PT0gcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IDA7XG4gICAgICAgICAgICByYW5nZS5lbmQucm93Kys7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwbGl0cyB0aGUgbGluZSBhdCB0aGUgY3VycmVudCBzZWxlY3Rpb24gKGJ5IGluc2VydGluZyBhbiBgJ1xcbidgKS5cbiAgICAgKiovXG4gICAgc3BsaXRMaW5lKCkge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoXCJcXG5cIik7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oY3Vyc29yKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmFuc3Bvc2VzIGN1cnJlbnQgbGluZS5cbiAgICAgKiovXG4gICAgdHJhbnNwb3NlTGV0dGVycygpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBjb2x1bW4gPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICBpZiAoY29sdW1uID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBzd2FwLCByYW5nZTtcbiAgICAgICAgaWYgKGNvbHVtbiA8IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICBzd2FwID0gbGluZS5jaGFyQXQoY29sdW1uKSArIGxpbmUuY2hhckF0KGNvbHVtbiAtIDEpO1xuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoY3Vyc29yLnJvdywgY29sdW1uIC0gMSwgY3Vyc29yLnJvdywgY29sdW1uICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzd2FwID0gbGluZS5jaGFyQXQoY29sdW1uIC0gMSkgKyBsaW5lLmNoYXJBdChjb2x1bW4gLSAyKTtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKGN1cnNvci5yb3csIGNvbHVtbiAtIDIsIGN1cnNvci5yb3csIGNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHN3YXApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBlbnRpcmVseSBpbnRvIGxvd2VyY2FzZS5cbiAgICAgKiovXG4gICAgdG9Mb3dlckNhc2UoKSB7XG4gICAgICAgIHZhciBvcmlnaW5hbFJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCB0ZXh0LnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShvcmlnaW5hbFJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0cyB0aGUgY3VycmVudCBzZWxlY3Rpb24gZW50aXJlbHkgaW50byB1cHBlcmNhc2UuXG4gICAgICoqL1xuICAgIHRvVXBwZXJDYXNlKCkge1xuICAgICAgICB2YXIgb3JpZ2luYWxSYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgdGV4dC50b1VwcGVyQ2FzZSgpKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2Uob3JpZ2luYWxSYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5zZXJ0cyBhbiBpbmRlbnRhdGlvbiBpbnRvIHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbiBvciBpbmRlbnRzIHRoZSBzZWxlY3RlZCBsaW5lcy5cbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmluZGVudFJvd3NcbiAgICAgKiovXG4gICAgaW5kZW50KCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuXG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPCByYW5nZS5lbmQucm93KSB7XG4gICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICAgICAgc2Vzc2lvbi5pbmRlbnRSb3dzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCwgXCJcXHRcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAocmFuZ2Uuc3RhcnQuY29sdW1uIDwgcmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICAgICAgdmFyIHRleHQgPSBzZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoIS9eXFxzKyQvLnRlc3QodGV4dCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKHJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgIHZhciBwb3NpdGlvbiA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgc2l6ZSA9IHNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICB2YXIgY29sdW1uID0gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uKHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uKTtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHZhciBjb3VudCA9IChzaXplIC0gY29sdW1uICUgc2l6ZSk7XG4gICAgICAgICAgICB2YXIgaW5kZW50U3RyaW5nID0gc3RyaW5nUmVwZWF0KFwiIFwiLCBjb3VudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgY291bnQgPSBjb2x1bW4gJSBzaXplO1xuICAgICAgICAgICAgd2hpbGUgKGxpbmVbcmFuZ2Uuc3RhcnQuY29sdW1uXSA9PSBcIiBcIiAmJiBjb3VudCkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbi0tO1xuICAgICAgICAgICAgICAgIGNvdW50LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpbmRlbnRTdHJpbmcgPSBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmluc2VydChpbmRlbnRTdHJpbmcpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGVudHMgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzXG4gICAgICoqL1xuICAgIGJsb2NrSW5kZW50KCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB0aGlzLnNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE91dGRlbnRzIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ub3V0ZGVudFJvd3NcbiAgICAgKiovXG4gICAgYmxvY2tPdXRkZW50KCkge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlc3Npb24ub3V0ZGVudFJvd3Moc2VsZWN0aW9uLmdldFJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IG1vdmUgb3V0IG9mIGNvcmUgd2hlbiB3ZSBoYXZlIGdvb2QgbWVjaGFuaXNtIGZvciBtYW5hZ2luZyBleHRlbnNpb25zXG4gICAgc29ydExpbmVzKCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgbGluZXMgPSBbXTtcbiAgICAgICAgZm9yIChpID0gcm93cy5maXJzdDsgaSA8PSByb3dzLmxhc3Q7IGkrKylcbiAgICAgICAgICAgIGxpbmVzLnB1c2goc2Vzc2lvbi5nZXRMaW5lKGkpKTtcblxuICAgICAgICBsaW5lcy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmIChhLnRvTG93ZXJDYXNlKCkgPCBiLnRvTG93ZXJDYXNlKCkpIHJldHVybiAtMTtcbiAgICAgICAgICAgIGlmIChhLnRvTG93ZXJDYXNlKCkgPiBiLnRvTG93ZXJDYXNlKCkpIHJldHVybiAxO1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBkZWxldGVSYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHJvd3MuZmlyc3Q7IGkgPD0gcm93cy5sYXN0OyBpKyspIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGkpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQucm93ID0gaTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGxpbmUubGVuZ3RoO1xuICAgICAgICAgICAgc2Vzc2lvbi5yZXBsYWNlKGRlbGV0ZVJhbmdlLCBsaW5lc1tpIC0gcm93cy5maXJzdF0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCByYW5nZSwgdGhpcyBmdW5jdGlvbiBlaXRoZXIgY29tbWVudHMgYWxsIHRoZSBsaW5lcywgb3IgdW5jb21tZW50cyBhbGwgb2YgdGhlbS5cbiAgICAgKiovXG4gICAgdG9nZ2xlQ29tbWVudExpbmVzKCkge1xuICAgICAgICB2YXIgc3RhdGUgPSB0aGlzLnNlc3Npb24uZ2V0U3RhdGUodGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyk7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRNb2RlKCkudG9nZ2xlQ29tbWVudExpbmVzKHN0YXRlLCB0aGlzLnNlc3Npb24sIHJvd3MuZmlyc3QsIHJvd3MubGFzdCk7XG4gICAgfVxuXG4gICAgdG9nZ2xlQmxvY2tDb21tZW50KCkge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgc3RhdGUgPSB0aGlzLnNlc3Npb24uZ2V0U3RhdGUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmdldE1vZGUoKS50b2dnbGVCbG9ja0NvbW1lbnQoc3RhdGUsIHRoaXMuc2Vzc2lvbiwgcmFuZ2UsIGN1cnNvcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV29ya3MgbGlrZSBbW0VkaXRTZXNzaW9uLmdldFRva2VuQXRdXSwgZXhjZXB0IGl0IHJldHVybnMgYSBudW1iZXIuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXROdW1iZXJBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHZhbHVlOiBzdHJpbmc7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgX251bWJlclJ4ID0gL1tcXC1dP1swLTldKyg/OlxcLlswLTldKyk/L2c7XG4gICAgICAgIF9udW1iZXJSeC5sYXN0SW5kZXggPSAwO1xuXG4gICAgICAgIHZhciBzID0gdGhpcy5zZXNzaW9uLmdldExpbmUocm93KTtcbiAgICAgICAgd2hpbGUgKF9udW1iZXJSeC5sYXN0SW5kZXggPCBjb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciBtOiBSZWdFeHBFeGVjQXJyYXkgPSBfbnVtYmVyUnguZXhlYyhzKTtcbiAgICAgICAgICAgIGlmIChtLmluZGV4IDw9IGNvbHVtbiAmJiBtLmluZGV4ICsgbVswXS5sZW5ndGggPj0gY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJldHZhbCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG1bMF0sXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBtLmluZGV4LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IG0uaW5kZXggKyBtWzBdLmxlbmd0aFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJldHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0aGUgY2hhcmFjdGVyIGJlZm9yZSB0aGUgY3Vyc29yIGlzIGEgbnVtYmVyLCB0aGlzIGZ1bmN0aW9ucyBjaGFuZ2VzIGl0cyB2YWx1ZSBieSBgYW1vdW50YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gYW1vdW50IFRoZSB2YWx1ZSB0byBjaGFuZ2UgdGhlIG51bWVyYWwgYnkgKGNhbiBiZSBuZWdhdGl2ZSB0byBkZWNyZWFzZSB2YWx1ZSlcbiAgICAgKi9cbiAgICBtb2RpZnlOdW1iZXIoYW1vdW50OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLmNvbHVtbjtcblxuICAgICAgICAvLyBnZXQgdGhlIGNoYXIgYmVmb3JlIHRoZSBjdXJzb3JcbiAgICAgICAgdmFyIGNoYXJSYW5nZSA9IG5ldyBSYW5nZShyb3csIGNvbHVtbiAtIDEsIHJvdywgY29sdW1uKTtcblxuICAgICAgICB2YXIgYyA9IHBhcnNlRmxvYXQodGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShjaGFyUmFuZ2UpKTtcbiAgICAgICAgLy8gaWYgdGhlIGNoYXIgaXMgYSBkaWdpdFxuICAgICAgICBpZiAoIWlzTmFOKGMpICYmIGlzRmluaXRlKGMpKSB7XG4gICAgICAgICAgICAvLyBnZXQgdGhlIHdob2xlIG51bWJlciB0aGUgZGlnaXQgaXMgcGFydCBvZlxuICAgICAgICAgICAgdmFyIG5yID0gdGhpcy5nZXROdW1iZXJBdChyb3csIGNvbHVtbik7XG4gICAgICAgICAgICAvLyBpZiBudW1iZXIgZm91bmRcbiAgICAgICAgICAgIGlmIChucikge1xuICAgICAgICAgICAgICAgIHZhciBmcCA9IG5yLnZhbHVlLmluZGV4T2YoXCIuXCIpID49IDAgPyBuci5zdGFydCArIG5yLnZhbHVlLmluZGV4T2YoXCIuXCIpICsgMSA6IG5yLmVuZDtcbiAgICAgICAgICAgICAgICB2YXIgZGVjaW1hbHMgPSBuci5zdGFydCArIG5yLnZhbHVlLmxlbmd0aCAtIGZwO1xuXG4gICAgICAgICAgICAgICAgdmFyIHQgPSBwYXJzZUZsb2F0KG5yLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB0ICo9IE1hdGgucG93KDEwLCBkZWNpbWFscyk7XG5cblxuICAgICAgICAgICAgICAgIGlmIChmcCAhPT0gbnIuZW5kICYmIGNvbHVtbiA8IGZwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFtb3VudCAqPSBNYXRoLnBvdygxMCwgbnIuZW5kIC0gY29sdW1uIC0gMSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYW1vdW50ICo9IE1hdGgucG93KDEwLCBuci5lbmQgLSBjb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHQgKz0gYW1vdW50O1xuICAgICAgICAgICAgICAgIHQgLz0gTWF0aC5wb3coMTAsIGRlY2ltYWxzKTtcbiAgICAgICAgICAgICAgICB2YXIgbm5yID0gdC50b0ZpeGVkKGRlY2ltYWxzKTtcblxuICAgICAgICAgICAgICAgIC8vdXBkYXRlIG51bWJlclxuICAgICAgICAgICAgICAgIHZhciByZXBsYWNlUmFuZ2UgPSBuZXcgUmFuZ2Uocm93LCBuci5zdGFydCwgcm93LCBuci5lbmQpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJlcGxhY2VSYW5nZSwgbm5yKTtcblxuICAgICAgICAgICAgICAgIC8vcmVwb3NpdGlvbiB0aGUgY3Vyc29yXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBNYXRoLm1heChuci5zdGFydCArIDEsIGNvbHVtbiArIG5uci5sZW5ndGggLSBuci52YWx1ZS5sZW5ndGgpKTtcblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIGxpbmVzIGluIHRoZSBjdXJyZW50IHNlbGVjdGlvblxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnJlbW92ZVxuICAgICAqKi9cbiAgICByZW1vdmVMaW5lcygpIHtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdmFyIHJhbmdlO1xuICAgICAgICBpZiAocm93cy5maXJzdCA9PT0gMCB8fCByb3dzLmxhc3QgKyAxIDwgdGhpcy5zZXNzaW9uLmdldExlbmd0aCgpKVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2Uocm93cy5maXJzdCwgMCwgcm93cy5sYXN0ICsgMSwgMCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgIHJvd3MuZmlyc3QgLSAxLCB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3dzLmZpcnN0IC0gMSkubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHJvd3MubGFzdCwgdGhpcy5zZXNzaW9uLmdldExpbmUocm93cy5sYXN0KS5sZW5ndGhcbiAgICAgICAgICAgICk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgZHVwbGljYXRlU2VsZWN0aW9uKCkge1xuICAgICAgICB2YXIgc2VsID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciBkb2MgPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByYW5nZSA9IHNlbC5nZXRSYW5nZSgpO1xuICAgICAgICB2YXIgcmV2ZXJzZSA9IHNlbC5pc0JhY2t3YXJkcygpO1xuICAgICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgZG9jLmR1cGxpY2F0ZUxpbmVzKHJvdywgcm93KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwb2ludCA9IHJldmVyc2UgPyByYW5nZS5zdGFydCA6IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIHZhciBlbmRQb2ludCA9IGRvYy5pbnNlcnQocG9pbnQsIGRvYy5nZXRUZXh0UmFuZ2UocmFuZ2UpKTtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcG9pbnQ7XG4gICAgICAgICAgICByYW5nZS5lbmQgPSBlbmRQb2ludDtcblxuICAgICAgICAgICAgc2VsLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlLCByZXZlcnNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIGRvd24gb25lIHJvdy5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge051bWJlcn0gT24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5tb3ZlTGluZXNVcFxuICAgICAqKi9cbiAgICBtb3ZlTGluZXNEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlTGluZXMoZnVuY3Rpb24oZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24ubW92ZUxpbmVzRG93bihmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIHVwIG9uZSByb3cuXG4gICAgICogQHJldHVybiB7TnVtYmVyfSBPbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVMaW5lc0Rvd25cbiAgICAgKiovXG4gICAgbW92ZUxpbmVzVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlTGluZXNVcChmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIGEgcmFuZ2Ugb2YgdGV4dCBmcm9tIHRoZSBnaXZlbiByYW5nZSB0byB0aGUgZ2l2ZW4gcG9zaXRpb24uIGB0b1Bvc2l0aW9uYCBpcyBhbiBvYmplY3QgdGhhdCBsb29rcyBsaWtlIHRoaXM6XG4gICAgICogYGBganNvblxuICAgICAqICAgIHsgcm93OiBuZXdSb3dMb2NhdGlvbiwgY29sdW1uOiBuZXdDb2x1bW5Mb2NhdGlvbiB9XG4gICAgICogYGBgXG4gICAgICogQHBhcmFtIHtSYW5nZX0gZnJvbVJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHlvdSB3YW50IG1vdmVkIHdpdGhpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtSYW5nZX0gVGhlIG5ldyByYW5nZSB3aGVyZSB0aGUgdGV4dCB3YXMgbW92ZWQgdG8uXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZVRleHRcbiAgICAgKiovXG4gICAgbW92ZVRleHQocmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlVGV4dChyYW5nZSwgdG9Qb3NpdGlvbiwgY29weSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgdXAgb25lIHJvdy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIHJldHVybnMgMC5cbiAgICAgKlxuICAgICAqKi9cbiAgICBjb3B5TGluZXNVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uZHVwbGljYXRlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvcGllcyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIGRvd24gb25lIHJvdy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIHJldHVybnMgdGhlIG51bWJlciBvZiBuZXcgcm93cyBhZGRlZDsgaW4gb3RoZXIgd29yZHMsIGBsYXN0Um93IC0gZmlyc3RSb3cgKyAxYC5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kdXBsaWNhdGVMaW5lc1xuICAgICAqXG4gICAgICoqL1xuICAgIGNvcHlMaW5lc0Rvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGVzIGEgc3BlY2lmaWMgZnVuY3Rpb24sIHdoaWNoIGNhbiBiZSBhbnl0aGluZyB0aGF0IG1hbmlwdWxhdGVzIHNlbGVjdGVkIGxpbmVzLCBzdWNoIGFzIGNvcHlpbmcgdGhlbSwgZHVwbGljYXRpbmcgdGhlbSwgb3Igc2hpZnRpbmcgdGhlbS5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBtb3ZlciBBIG1ldGhvZCB0byBjYWxsIG9uIGVhY2ggc2VsZWN0ZWQgcm93XG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBwcml2YXRlICRtb3ZlTGluZXMobW92ZXIpIHtcbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0aW9uO1xuICAgICAgICBpZiAoIXNlbGVjdGlvblsnaW5NdWx0aVNlbGVjdE1vZGUnXSB8fCB0aGlzLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHNlbGVjdGlvbi50b09yaWVudGVkUmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZFJvd3M6IHsgZmlyc3Q6IG51bWJlcjsgbGFzdDogbnVtYmVyIH0gPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgICAgIHZhciBsaW5lc01vdmVkID0gbW92ZXIuY2FsbCh0aGlzLCBzZWxlY3RlZFJvd3MuZmlyc3QsIHNlbGVjdGVkUm93cy5sYXN0KTtcbiAgICAgICAgICAgIHJhbmdlLm1vdmVCeShsaW5lc01vdmVkLCAwKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5mcm9tT3JpZW50ZWRSYW5nZShyYW5nZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2VzID0gc2VsZWN0aW9uLnJhbmdlTGlzdC5yYW5nZXM7XG4gICAgICAgICAgICBzZWxlY3Rpb24ucmFuZ2VMaXN0LmRldGFjaCgpO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gcmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZUluZGV4ID0gaTtcbiAgICAgICAgICAgICAgICB2YXIgY29sbGFwc2VkUm93cyA9IHJhbmdlc1tpXS5jb2xsYXBzZVJvd3MoKTtcbiAgICAgICAgICAgICAgICB2YXIgbGFzdCA9IGNvbGxhcHNlZFJvd3MuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgZmlyc3QgPSBjb2xsYXBzZWRSb3dzLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICB3aGlsZSAoaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbGxhcHNlZFJvd3MgPSByYW5nZXNbaV0uY29sbGFwc2VSb3dzKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaXJzdCAtIGNvbGxhcHNlZFJvd3MuZW5kLnJvdyA8PSAxKVxuICAgICAgICAgICAgICAgICAgICAgICAgZmlyc3QgPSBjb2xsYXBzZWRSb3dzLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpKys7XG5cbiAgICAgICAgICAgICAgICB2YXIgbGluZXNNb3ZlZCA9IG1vdmVyLmNhbGwodGhpcywgZmlyc3QsIGxhc3QpO1xuICAgICAgICAgICAgICAgIHdoaWxlIChyYW5nZUluZGV4ID49IGkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2VzW3JhbmdlSW5kZXhdLm1vdmVCeShsaW5lc01vdmVkLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2VJbmRleC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGVjdGlvbi5mcm9tT3JpZW50ZWRSYW5nZShzZWxlY3Rpb24ucmFuZ2VzWzBdKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5yYW5nZUxpc3QuYXR0YWNoKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgcm93cy5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH1cbiAgICAgKiovXG4gICAgcHJpdmF0ZSAkZ2V0U2VsZWN0ZWRSb3dzKCk6IHsgZmlyc3Q6IG51bWJlcjsgbGFzdDogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuY29sbGFwc2VSb3dzKCk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGZpcnN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0KHJhbmdlLnN0YXJ0LnJvdyksXG4gICAgICAgICAgICBsYXN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZEVuZChyYW5nZS5lbmQucm93KVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25TdGFydCh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hvd0NvbXBvc2l0aW9uKHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKSk7XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvblVwZGF0ZSh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q29tcG9zaXRpb25UZXh0KHRleHQpO1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25FbmQoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93fVxuICAgICAqXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3dcbiAgICAgKiovXG4gICAgZ2V0Rmlyc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93fVxuICAgICAqXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvd1xuICAgICAqKi9cbiAgICBnZXRMYXN0VmlzaWJsZVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvdygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyBpZiB0aGUgcm93IGlzIGN1cnJlbnRseSB2aXNpYmxlIG9uIHRoZSBzY3JlZW4uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIGNoZWNrXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc1Jvd1Zpc2libGUocm93OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChyb3cgPj0gdGhpcy5nZXRGaXJzdFZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5nZXRMYXN0VmlzaWJsZVJvdygpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgaWYgdGhlIGVudGlyZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgaXNSb3dGdWxseVZpc2libGUocm93OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChyb3cgPj0gdGhpcy5yZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdygpICYmIHJvdyA8PSB0aGlzLnJlbmRlcmVyLmdldExhc3RGdWxseVZpc2libGVSb3coKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGN1cnJlbnRseSB2aXNpYmlsZSByb3dzLlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKiovXG4gICAgcHJpdmF0ZSAkZ2V0VmlzaWJsZVJvd0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNjcm9sbEJvdHRvbVJvdygpIC0gdGhpcy5yZW5kZXJlci5nZXRTY3JvbGxUb3BSb3coKSArIDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRklYTUU6IFRoZSBzZW1hbnRpY3Mgb2Ygc2VsZWN0IGFyZSBub3QgZWFzaWx5IHVuZGVyc3Rvb2QuIFxuICAgICAqIEBwYXJhbSBkaXJlY3Rpb24gKzEgZm9yIHBhZ2UgZG93biwgLTEgZm9yIHBhZ2UgdXAuIE1heWJlIE4gZm9yIE4gcGFnZXM/XG4gICAgICogQHBhcmFtIHNlbGVjdCB0cnVlIHwgZmFsc2UgfCB1bmRlZmluZWRcbiAgICAgKi9cbiAgICBwcml2YXRlICRtb3ZlQnlQYWdlKGRpcmVjdGlvbjogbnVtYmVyLCBzZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIHZhciByZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLnJlbmRlcmVyLmxheWVyQ29uZmlnO1xuICAgICAgICB2YXIgcm93cyA9IGRpcmVjdGlvbiAqIE1hdGguZmxvb3IoY29uZmlnLmhlaWdodCAvIGNvbmZpZy5saW5lSGVpZ2h0KTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICBpZiAoc2VsZWN0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeShyb3dzLCAwKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNlbGVjdCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JCeShyb3dzLCAwKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gcmVuZGVyZXIuc2Nyb2xsVG9wO1xuXG4gICAgICAgIHJlbmRlcmVyLnNjcm9sbEJ5KDAsIHJvd3MgKiBjb25maWcubGluZUhlaWdodCk7XG4gICAgICAgIC8vIFdoeSBkb24ndCB3ZSBhc3NlcnQgb3VyIGFyZ3MgYW5kIGRvIHR5cGVvZiBzZWxlY3QgPT09ICd1bmRlZmluZWQnP1xuICAgICAgICBpZiAoc2VsZWN0ICE9IG51bGwpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdoZW4gc2VsZWN0IGlzIHVuZGVmaW5lZC5cbiAgICAgICAgICAgIHJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KG51bGwsIDAuNSk7XG4gICAgICAgIH1cblxuICAgICAgICByZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nKHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyB0aGUgdGV4dCBmcm9tIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCB1bnRpbCB3aGVyZSBhIFwicGFnZSBkb3duXCIgZmluaXNoZXMuXG4gICAgICoqL1xuICAgIHNlbGVjdFBhZ2VEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKCsxLCB0cnVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIHRoZSB0ZXh0IGZyb20gdGhlIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGRvY3VtZW50IHVudGlsIHdoZXJlIGEgXCJwYWdlIHVwXCIgZmluaXNoZXMuXG4gICAgICoqL1xuICAgIHNlbGVjdFBhZ2VVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgtMSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgZG93blwiIGlzLCBhcyB3ZWxsIGFzIG1vdmluZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBnb3RvUGFnZURvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoKzEsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSB1cFwiIGlzLCBhcyB3ZWxsIGFzIG1vdmluZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBnb3RvUGFnZVVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKC0xLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIGRvd25cIiBpcywgd2l0aG91dCBjaGFuZ2luZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBzY3JvbGxQYWdlRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgdXBcIiBpcywgd2l0aG91dCBjaGFuZ2luZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBzY3JvbGxQYWdlVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoLTEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBlZGl0b3IgdG8gdGhlIHNwZWNpZmllZCByb3cuXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvUm93XG4gICAgICovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb1Jvdyhyb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdG8gYSBsaW5lLiBJZiBgY2VudGVyYCBpcyBgdHJ1ZWAsIGl0IHB1dHMgdGhlIGxpbmUgaW4gbWlkZGxlIG9mIHNjcmVlbiAob3IgYXR0ZW1wdHMgdG8pLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lIFRoZSBsaW5lIHRvIHNjcm9sbCB0b1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gY2VudGVyIElmIGB0cnVlYFxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZXMgc2Nyb2xsaW5nXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGFuaW1hdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvTGluZVxuICAgICAqKi9cbiAgICBzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBjZW50ZXI6IGJvb2xlYW4sIGFuaW1hdGU6IGJvb2xlYW4sIGNhbGxiYWNrPzogKCkgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9MaW5lKGxpbmUsIGNlbnRlciwgYW5pbWF0ZSwgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEF0dGVtcHRzIHRvIGNlbnRlciB0aGUgY3VycmVudCBzZWxlY3Rpb24gb24gdGhlIHNjcmVlbi5cbiAgICAgKiovXG4gICAgY2VudGVyU2VsZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciBwb3MgPSB7XG4gICAgICAgICAgICByb3c6IE1hdGguZmxvb3IocmFuZ2Uuc3RhcnQucm93ICsgKHJhbmdlLmVuZC5yb3cgLSByYW5nZS5zdGFydC5yb3cpIC8gMiksXG4gICAgICAgICAgICBjb2x1bW46IE1hdGguZmxvb3IocmFuZ2Uuc3RhcnQuY29sdW1uICsgKHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW4pIC8gMilcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5hbGlnbkN1cnNvcihwb3MsIDAuNSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgY3Vyc29yLlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gQW4gb2JqZWN0IHRoYXQgbG9va3Mgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgICAgKlxuICAgICAqIGBgYGpzb25cbiAgICAgKiB7IHJvdzogY3VyclJvdywgY29sdW1uOiBjdXJyQ29sIH1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5nZXRDdXJzb3JcbiAgICAgKiovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb24oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzY3JlZW4gcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAgKiovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW4oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWxlY3Rpb24uZ2V0UmFuZ2V9XG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLmdldFJhbmdlXG4gICAgICoqL1xuICAgIGdldFNlbGVjdGlvblJhbmdlKCk6IFJhbmdlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyBhbGwgdGhlIHRleHQgaW4gZWRpdG9yLlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5zZWxlY3RBbGxcbiAgICAgKiovXG4gICAgc2VsZWN0QWxsKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RBbGwoKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbn1cbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb25cbiAgICAgKiovXG4gICAgY2xlYXJTZWxlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3BlY2lmaWVkIHJvdyBhbmQgY29sdW1uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIG5vdCBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIG5ldyByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgbmV3IGNvbHVtbiBudW1iZXJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGFuaW1hdGVcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9cbiAgICAgKiovXG4gICAgbW92ZUN1cnNvclRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgYW5pbWF0ZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvclRvKHJvdywgY29sdW1uLCBhbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBwb3NpdGlvbiBpbmRpY2F0ZWQgYnkgYHBvcy5yb3dgIGFuZCBgcG9zLmNvbHVtbmAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBvcyBBbiBvYmplY3Qgd2l0aCB0d28gcHJvcGVydGllcywgcm93IGFuZCBjb2x1bW5cbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLm1vdmVDdXJzb3JUb1Bvc2l0aW9uXG4gICAgICoqL1xuICAgIG1vdmVDdXJzb3JUb1Bvc2l0aW9uKHBvcykge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3MpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IncyByb3cgYW5kIGNvbHVtbiB0byB0aGUgbmV4dCBtYXRjaGluZyBicmFja2V0IG9yIEhUTUwgdGFnLlxuICAgICAqXG4gICAgICoqL1xuICAgIGp1bXBUb01hdGNoaW5nKHNlbGVjdDogYm9vbGVhbikge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLnNlc3Npb24sIGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pO1xuICAgICAgICB2YXIgcHJldlRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG4gICAgICAgIHZhciB0b2tlbiA9IHByZXZUb2tlbjtcblxuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuXG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgLy9nZXQgbmV4dCBjbG9zaW5nIHRhZyBvciBicmFja2V0XG4gICAgICAgIHZhciBtYXRjaFR5cGU7XG4gICAgICAgIHZhciBmb3VuZCA9IGZhbHNlO1xuICAgICAgICB2YXIgZGVwdGggPSB7fTtcbiAgICAgICAgdmFyIGkgPSBjdXJzb3IuY29sdW1uIC0gdG9rZW4uc3RhcnQ7XG4gICAgICAgIHZhciBicmFja2V0VHlwZTtcbiAgICAgICAgdmFyIGJyYWNrZXRzID0ge1xuICAgICAgICAgICAgXCIpXCI6IFwiKFwiLFxuICAgICAgICAgICAgXCIoXCI6IFwiKFwiLFxuICAgICAgICAgICAgXCJdXCI6IFwiW1wiLFxuICAgICAgICAgICAgXCJbXCI6IFwiW1wiLFxuICAgICAgICAgICAgXCJ7XCI6IFwie1wiLFxuICAgICAgICAgICAgXCJ9XCI6IFwie1wiXG4gICAgICAgIH07XG5cbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlLm1hdGNoKC9be30oKVxcW1xcXV0vZykpIHtcbiAgICAgICAgICAgICAgICBmb3IgKDsgaSA8IHRva2VuLnZhbHVlLmxlbmd0aCAmJiAhZm91bmQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWJyYWNrZXRzW3Rva2VuLnZhbHVlW2ldXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBicmFja2V0VHlwZSA9IGJyYWNrZXRzW3Rva2VuLnZhbHVlW2ldXSArICcuJyArIHRva2VuLnR5cGUucmVwbGFjZShcInJwYXJlblwiLCBcImxwYXJlblwiKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNOYU4oZGVwdGhbYnJhY2tldFR5cGVdKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWVbaV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJygnOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnWyc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICd7JzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFticmFja2V0VHlwZV0rKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJyknOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnXSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICd9JzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFticmFja2V0VHlwZV0tLTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZXB0aFticmFja2V0VHlwZV0gPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoVHlwZSA9ICdicmFja2V0JztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGlmIChpc05hTihkZXB0aFt0b2tlbi52YWx1ZV0pKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoW3Rva2VuLnZhbHVlXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoW3Rva2VuLnZhbHVlXSsrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPC8nKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoW3Rva2VuLnZhbHVlXS0tO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChkZXB0aFt0b2tlbi52YWx1ZV0gPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoVHlwZSA9ICd0YWcnO1xuICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgICAgICAgICAgcHJldlRva2VuID0gdG9rZW47XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgICAgIGkgPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiAhZm91bmQpO1xuXG4gICAgICAgIC8vbm8gbWF0Y2ggZm91bmRcbiAgICAgICAgaWYgKCFtYXRjaFR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZTogUmFuZ2U7XG4gICAgICAgIGlmIChtYXRjaFR5cGUgPT09ICdicmFja2V0Jykge1xuICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKGN1cnNvcik7XG4gICAgICAgICAgICBpZiAoIXJhbmdlKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIGkgLSAxLFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyBpIC0gMVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyYW5nZSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocG9zLnJvdyA9PT0gY3Vyc29yLnJvdyAmJiBNYXRoLmFicyhwb3MuY29sdW1uIC0gY3Vyc29yLmNvbHVtbikgPCAyKVxuICAgICAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UocG9zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChtYXRjaFR5cGUgPT09ICd0YWcnKSB7XG4gICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSlcbiAgICAgICAgICAgICAgICB2YXIgdGFnID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgLSAyLFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpIC0gMlxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgLy9maW5kIG1hdGNoaW5nIHRhZ1xuICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbikgPT09IDApIHtcbiAgICAgICAgICAgICAgICBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBwcmV2VG9rZW47XG4gICAgICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udHlwZS5pbmRleE9mKCd0YWctY2xvc2UnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQoaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbi52YWx1ZSA9PT0gdGFnICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbdGFnXSsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPC8nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW3RhZ10tLTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGhbdGFnXSA9PT0gMClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAocHJldlRva2VuICYmICFmb3VuZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vd2UgZm91bmQgaXRcbiAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykpIHtcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy5yb3cgPT0gY3Vyc29yLnJvdyAmJiBNYXRoLmFicyhwb3MuY29sdW1uIC0gY3Vyc29yLmNvbHVtbikgPCAyKVxuICAgICAgICAgICAgICAgICAgICBwb3MgPSByYW5nZS5lbmQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBwb3MgPSByYW5nZSAmJiByYW5nZVsnY3Vyc29yJ10gfHwgcG9zO1xuICAgICAgICBpZiAocG9zKSB7XG4gICAgICAgICAgICBpZiAoc2VsZWN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmlzRXF1YWwodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0VG8ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbyhwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNwZWNpZmllZCBsaW5lIG51bWJlciwgYW5kIGFsc28gaW50byB0aGUgaW5kaWNpYXRlZCBjb2x1bW4uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxpbmVOdW1iZXIgVGhlIGxpbmUgbnVtYmVyIHRvIGdvIHRvXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBBIGNvbHVtbiBudW1iZXIgdG8gZ28gdG9cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGVzIHNjb2xsaW5nXG4gICAgICoqL1xuICAgIGdvdG9MaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uPzogbnVtYmVyLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlc3Npb24udW5mb2xkKHsgcm93OiBsaW5lTnVtYmVyIC0gMSwgY29sdW1uOiBjb2x1bW4gfHwgMCB9KTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICAvLyB0b2RvOiBmaW5kIGEgd2F5IHRvIGF1dG9tYXRpY2FsbHkgZXhpdCBtdWx0aXNlbGVjdCBtb2RlXG4gICAgICAgIHRoaXMuZXhpdE11bHRpU2VsZWN0TW9kZSAmJiB0aGlzLmV4aXRNdWx0aVNlbGVjdE1vZGUoKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGluZU51bWJlciAtIDEsIGNvbHVtbiB8fCAwKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcblxuICAgICAgICBpZiAoIXRoaXMuaXNSb3dGdWxseVZpc2libGUobGluZU51bWJlciAtIDEpKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFRvTGluZShsaW5lTnVtYmVyIC0gMSwgdHJ1ZSwgYW5pbWF0ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzcGVjaWZpZWQgcm93IGFuZCBjb2x1bW4uIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBuZXcgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIG5ldyBjb2x1bW4gbnVtYmVyXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvci5tb3ZlQ3Vyc29yVG9cbiAgICAgKiovXG4gICAgbmF2aWdhdGVUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHVwIGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVVwKHRpbWVzOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkgJiYgIXRoaXMuc2VsZWN0aW9uLmlzQmFja3dhcmRzKCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25TdGFydCA9IHRoaXMuc2VsZWN0aW9uLmFuY2hvci5nZXRQb3NpdGlvbigpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uU3RhcnQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JCeSgtdGltZXMgfHwgLTEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgZG93biBpbiB0aGUgZG9jdW1lbnQgdGhlIHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZXMgVGhlIG51bWJlciBvZiB0aW1lcyB0byBjaGFuZ2UgbmF2aWdhdGlvblxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgbmF2aWdhdGVEb3duKHRpbWVzOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkgJiYgdGhpcy5zZWxlY3Rpb24uaXNCYWNrd2FyZHMoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVuZCA9IHRoaXMuc2VsZWN0aW9uLmFuY2hvci5nZXRQb3NpdGlvbigpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uRW5kKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkodGltZXMgfHwgMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciBsZWZ0IGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUxlZnQodGltZXM6IG51bWJlcikge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpLnN0YXJ0O1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25TdGFydCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aW1lcyA9IHRpbWVzIHx8IDE7XG4gICAgICAgICAgICB3aGlsZSAodGltZXMtLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JMZWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgcmlnaHQgaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlUmlnaHQodGltZXM6IG51bWJlcikge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVuZCA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKS5lbmQ7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvbkVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aW1lcyA9IHRpbWVzIHx8IDE7XG4gICAgICAgICAgICB3aGlsZSAodGltZXMtLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JSaWdodCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHN0YXJ0IG9mIHRoZSBjdXJyZW50IGxpbmUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVMaW5lU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JMaW5lU3RhcnQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGxpbmUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVMaW5lRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZUVuZCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgZmlsZS4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUZpbGVFbmQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlRW5kKCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHN0YXJ0IG9mIHRoZSBjdXJyZW50IGZpbGUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVGaWxlU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlU3RhcnQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBpbW1lZGlhdGVseSB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnQgcG9zaXRpb24uIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVXb3JkUmlnaHQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkUmlnaHQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBpbW1lZGlhdGVseSB0byB0aGUgbGVmdCBvZiB0aGUgY3VycmVudCBwb3NpdGlvbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVdvcmRMZWZ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZExlZnQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcGxhY2VzIHRoZSBmaXJzdCBvY2N1cmFuY2Ugb2YgYG9wdGlvbnMubmVlZGxlYCB3aXRoIHRoZSB2YWx1ZSBpbiBgcmVwbGFjZW1lbnRgLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSByZXBsYWNlbWVudCBUaGUgdGV4dCB0byByZXBsYWNlIHdpdGhcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBUaGUgW1tTZWFyY2ggYFNlYXJjaGBdXSBvcHRpb25zIHRvIHVzZVxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgcmVwbGFjZShyZXBsYWNlbWVudDogc3RyaW5nLCBvcHRpb25zKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG9wdGlvbnMpXG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHNlYXJjaC5maW5kKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IDA7XG4gICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG5cbiAgICAgICAgaWYgKHRoaXMuJHRyeVJlcGxhY2UocmFuZ2UsIHJlcGxhY2VtZW50KSkge1xuICAgICAgICAgICAgcmVwbGFjZWQgPSAxO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyYW5nZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXBsYWNlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyBhbGwgb2NjdXJhbmNlcyBvZiBgb3B0aW9ucy5uZWVkbGVgIHdpdGggdGhlIHZhbHVlIGluIGByZXBsYWNlbWVudGAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHJlcGxhY2VtZW50IFRoZSB0ZXh0IHRvIHJlcGxhY2Ugd2l0aFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBbW1NlYXJjaCBgU2VhcmNoYF1dIG9wdGlvbnMgdG8gdXNlXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICByZXBsYWNlQWxsKHJlcGxhY2VtZW50OiBzdHJpbmcsIG9wdGlvbnMpOiBudW1iZXIge1xuICAgICAgICBpZiAob3B0aW9ucykge1xuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldChvcHRpb25zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZXMgPSB0aGlzLiRzZWFyY2guZmluZEFsbCh0aGlzLnNlc3Npb24pO1xuICAgICAgICB2YXIgcmVwbGFjZWQgPSAwO1xuICAgICAgICBpZiAoIXJhbmdlcy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcblxuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8oMCwgMCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IHJhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IC0taSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHRyeVJlcGxhY2UocmFuZ2VzW2ldLCByZXBsYWNlbWVudCkpIHtcbiAgICAgICAgICAgICAgICByZXBsYWNlZCsrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2Uoc2VsZWN0aW9uKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcblxuICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdHJ5UmVwbGFjZShyYW5nZTogUmFuZ2UsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBSYW5nZSB7XG4gICAgICAgIHZhciBpbnB1dCA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICByZXBsYWNlbWVudCA9IHRoaXMuJHNlYXJjaC5yZXBsYWNlKGlucHV0LCByZXBsYWNlbWVudCk7XG4gICAgICAgIGlmIChyZXBsYWNlbWVudCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgcmFuZ2UuZW5kID0gdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHJlcGxhY2VtZW50KTtcbiAgICAgICAgICAgIHJldHVybiByYW5nZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWFyY2guZ2V0T3B0aW9uc30gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcmVsYXRlZCBTZWFyY2guZ2V0T3B0aW9uc1xuICAgICAqIEByZXR1cm4ge09iamVjdH1cbiAgICAgKiovXG4gICAgZ2V0TGFzdFNlYXJjaE9wdGlvbnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzZWFyY2guZ2V0T3B0aW9ucygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEF0dGVtcHRzIHRvIGZpbmQgYG5lZWRsZWAgd2l0aGluIHRoZSBkb2N1bWVudC4gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbmVlZGxlIFRoZSB0ZXh0IHRvIHNlYXJjaCBmb3IgKG9wdGlvbmFsKVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIEFuIG9iamVjdCBkZWZpbmluZyB2YXJpb3VzIHNlYXJjaCBwcm9wZXJ0aWVzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlIHNjcm9sbGluZ1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBTZWFyY2guZmluZFxuICAgICAqKi9cbiAgICBmaW5kKG5lZWRsZTogKHN0cmluZyB8IFJlZ0V4cCksIG9wdGlvbnMsIGFuaW1hdGU/OiBib29sZWFuKTogUmFuZ2Uge1xuICAgICAgICBpZiAoIW9wdGlvbnMpXG4gICAgICAgICAgICBvcHRpb25zID0ge307XG5cbiAgICAgICAgaWYgKHR5cGVvZiBuZWVkbGUgPT0gXCJzdHJpbmdcIiB8fCBuZWVkbGUgaW5zdGFuY2VvZiBSZWdFeHApXG4gICAgICAgICAgICBvcHRpb25zLm5lZWRsZSA9IG5lZWRsZTtcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIG5lZWRsZSA9PSBcIm9iamVjdFwiKVxuICAgICAgICAgICAgbWl4aW4ob3B0aW9ucywgbmVlZGxlKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICBpZiAob3B0aW9ucy5uZWVkbGUgPT0gbnVsbCkge1xuICAgICAgICAgICAgbmVlZGxlID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSkgfHwgdGhpcy4kc2VhcmNoLiRvcHRpb25zLm5lZWRsZTtcbiAgICAgICAgICAgIGlmICghbmVlZGxlKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0V29yZFJhbmdlKHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICBuZWVkbGUgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaC5zZXQoeyBuZWVkbGU6IG5lZWRsZSB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJHNlYXJjaC5zZXQob3B0aW9ucyk7XG4gICAgICAgIGlmICghb3B0aW9ucy5zdGFydClcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaC5zZXQoeyBzdGFydDogcmFuZ2UgfSk7XG5cbiAgICAgICAgdmFyIG5ld1JhbmdlID0gdGhpcy4kc2VhcmNoLmZpbmQodGhpcy5zZXNzaW9uKTtcbiAgICAgICAgaWYgKG9wdGlvbnMucHJldmVudFNjcm9sbClcbiAgICAgICAgICAgIHJldHVybiBuZXdSYW5nZTtcbiAgICAgICAgaWYgKG5ld1JhbmdlKSB7XG4gICAgICAgICAgICB0aGlzLnJldmVhbFJhbmdlKG5ld1JhbmdlLCBhbmltYXRlKTtcbiAgICAgICAgICAgIHJldHVybiBuZXdSYW5nZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBjbGVhciBzZWxlY3Rpb24gaWYgbm90aGluZyBpcyBmb3VuZFxuICAgICAgICBpZiAob3B0aW9ucy5iYWNrd2FyZHMpXG4gICAgICAgICAgICByYW5nZS5zdGFydCA9IHJhbmdlLmVuZDtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmFuZ2UuZW5kID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFJhbmdlKHJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBhbm90aGVyIHNlYXJjaCBmb3IgYG5lZWRsZWAgaW4gdGhlIGRvY3VtZW50LiBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBgb3B0aW9uc2AsIHNlZSBbW1NlYXJjaCBgU2VhcmNoYF1dLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIHNlYXJjaCBvcHRpb25zXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlIHNjcm9sbGluZ1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0b3IuZmluZFxuICAgICAqKi9cbiAgICBmaW5kTmV4dChuZWVkbGU/OiAoc3RyaW5nIHwgUmVnRXhwKSwgYW5pbWF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgLy8gRklYTUU6IFRoaXMgbG9va3MgZmxpcHBlZCBjb21wYXJlZCB0byBmaW5kUHJldmlvdXMuIFxuICAgICAgICB0aGlzLmZpbmQobmVlZGxlLCB7IHNraXBDdXJyZW50OiB0cnVlLCBiYWNrd2FyZHM6IGZhbHNlIH0sIGFuaW1hdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIGEgc2VhcmNoIGZvciBgbmVlZGxlYCBiYWNrd2FyZHMuIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgc2VhcmNoIG9wdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvci5maW5kXG4gICAgICoqL1xuICAgIGZpbmRQcmV2aW91cyhuZWVkbGU/OiAoc3RyaW5nIHwgUmVnRXhwKSwgYW5pbWF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5maW5kKG5lZWRsZSwgeyBza2lwQ3VycmVudDogdHJ1ZSwgYmFja3dhcmRzOiB0cnVlIH0sIGFuaW1hdGUpO1xuICAgIH1cblxuICAgIHJldmVhbFJhbmdlKHJhbmdlOiBSYW5nZSwgYW5pbWF0ZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICB0aGlzLnNlc3Npb24udW5mb2xkKHJhbmdlKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhyYW5nZS5zdGFydCwgcmFuZ2UuZW5kLCAwLjUpO1xuICAgICAgICBpZiAoYW5pbWF0ZSAhPT0gZmFsc2UpXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmFuaW1hdGVTY3JvbGxpbmcoc2Nyb2xsVG9wKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlVuZG9NYW5hZ2VyLnVuZG99XG4gICAgICogQHJlbGF0ZWQgVW5kb01hbmFnZXIudW5kb1xuICAgICAqKi9cbiAgICB1bmRvKCkge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0VW5kb01hbmFnZXIoKS51bmRvKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlVuZG9NYW5hZ2VyLnJlZG99XG4gICAgICogQHJlbGF0ZWQgVW5kb01hbmFnZXIucmVkb1xuICAgICAqKi9cbiAgICByZWRvKCkge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0VW5kb01hbmFnZXIoKS5yZWRvKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIENsZWFucyB1cCB0aGUgZW50aXJlIGVkaXRvci5cbiAgICAgKiovXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImRlc3Ryb3lcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5hYmxlcyBhdXRvbWF0aWMgc2Nyb2xsaW5nIG9mIHRoZSBjdXJzb3IgaW50byB2aWV3IHdoZW4gZWRpdG9yIGl0c2VsZiBpcyBpbnNpZGUgc2Nyb2xsYWJsZSBlbGVtZW50XG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGUgZGVmYXVsdCB0cnVlXG4gICAgICoqL1xuICAgIHNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyhlbmFibGU6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKCFlbmFibGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciByZWN0O1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBzaG91bGRTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgaWYgKCF0aGlzLiRzY3JvbGxBbmNob3IpXG4gICAgICAgICAgICB0aGlzLiRzY3JvbGxBbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB2YXIgc2Nyb2xsQW5jaG9yID0gdGhpcy4kc2Nyb2xsQW5jaG9yO1xuICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246YWJzb2x1dGVcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuaW5zZXJ0QmVmb3JlKHNjcm9sbEFuY2hvciwgdGhpcy5jb250YWluZXIuZmlyc3RDaGlsZCk7XG4gICAgICAgIHZhciBvbkNoYW5nZVNlbGVjdGlvbiA9IHRoaXMub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzaG91bGRTY3JvbGwgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gbmVlZGVkIHRvIG5vdCB0cmlnZ2VyIHN5bmMgcmVmbG93XG4gICAgICAgIHZhciBvbkJlZm9yZVJlbmRlciA9IHRoaXMucmVuZGVyZXIub24oXCJiZWZvcmVSZW5kZXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsKVxuICAgICAgICAgICAgICAgIHJlY3QgPSBzZWxmLnJlbmRlcmVyLmNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBvbkFmdGVyUmVuZGVyID0gdGhpcy5yZW5kZXJlci5vbihcImFmdGVyUmVuZGVyXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHNob3VsZFNjcm9sbCAmJiByZWN0ICYmIHNlbGYuaXNGb2N1c2VkKCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVuZGVyZXIgPSBzZWxmLnJlbmRlcmVyO1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByZW5kZXJlci4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICAgICAgICAgIHZhciBjb25maWcgPSByZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgICAgICAgICB2YXIgdG9wID0gcG9zLnRvcCAtIGNvbmZpZy5vZmZzZXQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy50b3AgPj0gMCAmJiB0b3AgKyByZWN0LnRvcCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocG9zLnRvcCA8IGNvbmZpZy5oZWlnaHQgJiZcbiAgICAgICAgICAgICAgICAgICAgcG9zLnRvcCArIHJlY3QudG9wICsgY29uZmlnLmxpbmVIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLnRvcCA9IHRvcCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmxlZnQgPSBwb3MubGVmdCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmhlaWdodCA9IGNvbmZpZy5saW5lSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc2Nyb2xsSW50b1ZpZXcoc2hvdWxkU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gcmVjdCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyA9IGZ1bmN0aW9uKGVuYWJsZSkge1xuICAgICAgICAgICAgaWYgKGVuYWJsZSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXc7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTZWxlY3Rpb25cIiwgb25DaGFuZ2VTZWxlY3Rpb24pO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWZ0ZXJSZW5kZXJcIiwgb25BZnRlclJlbmRlcik7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJiZWZvcmVSZW5kZXJcIiwgb25CZWZvcmVSZW5kZXIpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyAkcmVzZXRDdXJzb3JTdHlsZSgpIHtcbiAgICAgICAgdmFyIHN0eWxlID0gdGhpcy4kY3Vyc29yU3R5bGUgfHwgXCJhY2VcIjtcbiAgICAgICAgdmFyIGN1cnNvckxheWVyID0gdGhpcy5yZW5kZXJlci4kY3Vyc29yTGF5ZXI7XG4gICAgICAgIGlmICghY3Vyc29yTGF5ZXIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjdXJzb3JMYXllci5zZXRTbW9vdGhCbGlua2luZygvc21vb3RoLy50ZXN0KHN0eWxlKSk7XG4gICAgICAgIGN1cnNvckxheWVyLmlzQmxpbmtpbmcgPSAhdGhpcy4kcmVhZE9ubHkgJiYgc3R5bGUgIT0gXCJ3aWRlXCI7XG4gICAgICAgIHNldENzc0NsYXNzKGN1cnNvckxheWVyLmVsZW1lbnQsIFwiYWNlX3NsaW0tY3Vyc29yc1wiLCAvc2xpbS8udGVzdChzdHlsZSkpO1xuICAgIH1cbn1cblxuZGVmaW5lT3B0aW9ucyhFZGl0b3IucHJvdG90eXBlLCBcImVkaXRvclwiLCB7XG4gICAgc2VsZWN0aW9uU3R5bGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzdHlsZSkge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LiRvblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoYXQuc2VsZWN0aW9uKTtcbiAgICAgICAgICAgIHRoYXQuX3NpZ25hbChcImNoYW5nZVNlbGVjdGlvblN0eWxlXCIsIHsgZGF0YTogc3R5bGUgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCJsaW5lXCJcbiAgICB9LFxuICAgIGhpZ2hsaWdodEFjdGl2ZUxpbmU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBFZGl0b3IgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhpZ2hsaWdodFNlbGVjdGVkV29yZDoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3VsZEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LiRvblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoYXQuc2VsZWN0aW9uKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICByZWFkT25seToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHJlYWRPbmx5KSB7XG4gICAgICAgICAgICAvLyBkaXNhYmxlZCB0byBub3QgYnJlYWsgdmltIG1vZGUhXG4gICAgICAgICAgICAvLyB0aGlzLnRleHRJbnB1dC5zZXRSZWFkT25seShyZWFkT25seSk7XG4gICAgICAgICAgICB0aGlzLiRyZXNldEN1cnNvclN0eWxlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIGN1cnNvclN0eWxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogRWRpdG9yID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuJHJlc2V0Q3Vyc29yU3R5bGUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgdmFsdWVzOiBbXCJhY2VcIiwgXCJzbGltXCIsIFwic21vb3RoXCIsIFwid2lkZVwiXSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImFjZVwiXG4gICAgfSxcbiAgICBtZXJnZVVuZG9EZWx0YXM6IHtcbiAgICAgICAgdmFsdWVzOiBbZmFsc2UsIHRydWUsIFwiYWx3YXlzXCJdLFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGJlaGF2aW91cnNFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIHdyYXBCZWhhdmlvdXJzRW5hYmxlZDogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICBhdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXc6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihlbmFibGU6IGJvb2xlYW4pIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBFZGl0b3IgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXcoZW5hYmxlKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTogXCJyZW5kZXJlclwiLFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBcInJlbmRlcmVyXCIsXG4gICAgaGlnaGxpZ2h0R3V0dGVyTGluZTogXCJyZW5kZXJlclwiLFxuICAgIGFuaW1hdGVkU2Nyb2xsOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ludmlzaWJsZXM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93UHJpbnRNYXJnaW46IFwicmVuZGVyZXJcIixcbiAgICBwcmludE1hcmdpbkNvbHVtbjogXCJyZW5kZXJlclwiLFxuICAgIHByaW50TWFyZ2luOiBcInJlbmRlcmVyXCIsXG4gICAgZmFkZUZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0xpbmVOdW1iZXJzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0d1dHRlcjogXCJyZW5kZXJlclwiLFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IFwicmVuZGVyZXJcIixcbiAgICBmb250U2l6ZTogXCJyZW5kZXJlclwiLFxuICAgIGZvbnRGYW1pbHk6IFwicmVuZGVyZXJcIixcbiAgICBtYXhMaW5lczogXCJyZW5kZXJlclwiLFxuICAgIG1pbkxpbmVzOiBcInJlbmRlcmVyXCIsXG4gICAgc2Nyb2xsUGFzdEVuZDogXCJyZW5kZXJlclwiLFxuICAgIGZpeGVkV2lkdGhHdXR0ZXI6IFwicmVuZGVyZXJcIixcbiAgICB0aGVtZTogXCJyZW5kZXJlclwiLFxuXG4gICAgc2Nyb2xsU3BlZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGRyYWdEZWxheTogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZHJhZ0VuYWJsZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGZvY3VzVGltb3V0OiBcIiRtb3VzZUhhbmRsZXJcIixcbiAgICB0b29sdGlwRm9sbG93c01vdXNlOiBcIiRtb3VzZUhhbmRsZXJcIixcblxuICAgIGZpcnN0TGluZU51bWJlcjogXCJzZXNzaW9uXCIsXG4gICAgb3ZlcndyaXRlOiBcInNlc3Npb25cIixcbiAgICBuZXdMaW5lTW9kZTogXCJzZXNzaW9uXCIsXG4gICAgdXNlV29ya2VyOiBcInNlc3Npb25cIixcbiAgICB1c2VTb2Z0VGFiczogXCJzZXNzaW9uXCIsXG4gICAgdGFiU2l6ZTogXCJzZXNzaW9uXCIsXG4gICAgd3JhcDogXCJzZXNzaW9uXCIsXG4gICAgZm9sZFN0eWxlOiBcInNlc3Npb25cIixcbiAgICBtb2RlOiBcInNlc3Npb25cIlxufSk7XG5cbmNsYXNzIEZvbGRIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBpbiB0aGUgZWRpdG9yIChub3QgZ3V0dGVyKSByZWdpb25cbiAgICAgICAgLy8gdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdG8gcmVtb3ZlIG9yIGV4cGFuZCBhIGZvbGQuXG4gICAgICAgIGVkaXRvci5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjbGlja2VkIG9uIGEgZm9sZCwgdGhlbiBleHBhbmQgaXQuXG4gICAgICAgICAgICB2YXIgZm9sZCA9IHNlc3Npb24uZ2V0Rm9sZEF0KHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uLCAxKTtcbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgaWYgKGUuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBvbiB0aGUgZ3V0dGVyLlxuICAgICAgICBlZGl0b3Iub24oJ2d1dHRlcmNsaWNrJywgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXIuZ2V0UmVnaW9uKGUpO1xuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PT0gJ2ZvbGRXaWRnZXRzJykge1xuICAgICAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuICAgICAgICAgICAgICAgIGlmIChzZXNzaW9uWydmb2xkV2lkZ2V0cyddICYmIHNlc3Npb25bJ2ZvbGRXaWRnZXRzJ11bcm93XSkge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uWydvbkZvbGRXaWRnZXRDbGljayddKHJvdywgZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZWRpdG9yLm9uKCdndXR0ZXJkYmxjbGljaycsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlckxheWVyLmdldFJlZ2lvbihlKTtcblxuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PSAnZm9sZFdpZGdldHMnKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5nZXRTZXNzaW9uKCk7XG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSBzZXNzaW9uWydnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhJ10ocm93LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGRhdGEuZmlyc3RSYW5nZTtcblxuICAgICAgICAgICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBzZXNzaW9uLmdldExpbmUocm93KS5sZW5ndGgsIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uWydhZGRGb2xkJ10oXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KHsgcm93OiByYW5nZS5zdGFydC5yb3csIGNvbHVtbjogMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5pbnRlcmZhY2UgSUdlc3R1cmVIYW5kbGVyIHtcbiAgICBjYW5jZWxDb250ZXh0TWVudSgpOiB2b2lkO1xufVxuXG5jbGFzcyBNb3VzZUhhbmRsZXIge1xuICAgIHB1YmxpYyBlZGl0b3I6IEVkaXRvcjtcbiAgICBwcml2YXRlICRzY3JvbGxTcGVlZDogbnVtYmVyID0gMjtcbiAgICBwcml2YXRlICRkcmFnRGVsYXk6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSAkZHJhZ0VuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlO1xuICAgIHB1YmxpYyAkZm9jdXNUaW1vdXQ6IG51bWJlciA9IDA7XG4gICAgcHVibGljICR0b29sdGlwRm9sbG93c01vdXNlOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlIHN0YXRlOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBjbGllbnRYOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBjbGllbnRZOiBudW1iZXI7XG4gICAgcHVibGljIGlzTW91c2VQcmVzc2VkOiBib29sZWFuO1xuICAgIC8qKlxuICAgICAqIFRoZSBmdW5jdGlvbiB0byBjYWxsIHRvIHJlbGVhc2UgYSBjYXB0dXJlZCBtb3VzZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbGVhc2VNb3VzZTogKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICBwdWJsaWMgbW91c2Vkb3duRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSAkbW91c2VNb3ZlZDtcbiAgICBwcml2YXRlICRvbkNhcHR1cmVNb3VzZU1vdmU7XG4gICAgcHVibGljICRjbGlja1NlbGVjdGlvbjogUmFuZ2UgPSBudWxsO1xuICAgIHB1YmxpYyAkbGFzdFNjcm9sbFRpbWU6IG51bWJlcjtcbiAgICBwdWJsaWMgc2VsZWN0QnlMaW5lczogKCkgPT4gdm9pZDtcbiAgICBwdWJsaWMgc2VsZWN0QnlXb3JkczogKCkgPT4gdm9pZDtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICAvLyBGSVhNRTogRGlkIEkgbWVudGlvbiB0aGF0IGB0aGlzYCwgYG5ld2AsIGBjbGFzc2AsIGBiaW5kYCBhcmUgdGhlIDQgaG9yc2VtZW4/XG4gICAgICAgIC8vIEZJWE1FOiBGdW5jdGlvbiBTY29waW5nIGlzIHRoZSBhbnN3ZXIuXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG4gICAgICAgIC8vIEZJWE1FOiBXZSBzaG91bGQgYmUgY2xlYW5pbmcgdXAgdGhlc2UgaGFuZGxlcnMgaW4gYSBkaXNwb3NlIG1ldGhvZC4uLlxuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoJ21vdXNlZG93bicsIG1ha2VNb3VzZURvd25IYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoJ21vdXNld2hlZWwnLCBtYWtlTW91c2VXaGVlbEhhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImRibGNsaWNrXCIsIG1ha2VEb3VibGVDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcInRyaXBsZWNsaWNrXCIsIG1ha2VUcmlwbGVDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcInF1YWRjbGlja1wiLCBtYWtlUXVhZENsaWNrSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcblxuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXMgPSBtYWtlRXh0ZW5kU2VsZWN0aW9uQnkoZWRpdG9yLCB0aGlzLCBcImdldExpbmVSYW5nZVwiKTtcbiAgICAgICAgdGhpcy5zZWxlY3RCeVdvcmRzID0gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvciwgdGhpcywgXCJnZXRXb3JkUmFuZ2VcIik7XG5cbiAgICAgICAgbmV3IEd1dHRlckhhbmRsZXIodGhpcyk7XG4gICAgICAgIC8vICAgICAgRklYTUU6IG5ldyBEcmFnZHJvcEhhbmRsZXIodGhpcyk7XG5cbiAgICAgICAgdmFyIG9uTW91c2VEb3duID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFlZGl0b3IuaXNGb2N1c2VkKCkgJiYgZWRpdG9yLnRleHRJbnB1dCkge1xuICAgICAgICAgICAgICAgIGVkaXRvci50ZXh0SW5wdXQubW92ZVRvTW91c2UoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBtb3VzZVRhcmdldDogSFRNTERpdkVsZW1lbnQgPSBlZGl0b3IucmVuZGVyZXIuZ2V0TW91c2VFdmVudFRhcmdldCgpO1xuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJjbGlja1wiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiY2xpY2tcIikpO1xuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJtb3VzZW1vdmVcIiwgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMsIFwibW91c2Vtb3ZlXCIpKTtcbiAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihtb3VzZVRhcmdldCwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgaWYgKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWKSB7XG4gICAgICAgICAgICBhZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWLmlubmVyLCBbNDAwLCAzMDAsIDI1MF0sIHRoaXMsIFwib25Nb3VzZUV2ZW50XCIpO1xuICAgICAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFySC5pbm5lciwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgICAgIGlmIChpc0lFKSB7XG4gICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYuZWxlbWVudCwgXCJtb3VzZWRvd25cIiwgb25Nb3VzZURvd24pO1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IEkgd29uZGVyIGlmIHdlIHNob3VsZCBiZSByZXNwb25kaW5nIHRvIG1vdXNlZG93biAoYnkgc3ltbWV0cnkpP1xuICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJILmVsZW1lbnQsIFwibW91c2Vtb3ZlXCIsIG9uTW91c2VEb3duKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdlIGhvb2sgJ21vdXNld2hlZWwnIHVzaW5nIHRoZSBwb3J0YWJsZSBcbiAgICAgICAgYWRkTW91c2VXaGVlbExpc3RlbmVyKGVkaXRvci5jb250YWluZXIsIHRoaXMuZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudC5iaW5kKHRoaXMsIFwibW91c2V3aGVlbFwiKSk7XG5cbiAgICAgICAgdmFyIGd1dHRlckVsID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXI7XG4gICAgICAgIGFkZExpc3RlbmVyKGd1dHRlckVsLCBcIm1vdXNlZG93blwiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVybW91c2Vkb3duXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiZGJsY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmRibGNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vtb3ZlXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJtb3VzZW1vdmVcIikpO1xuXG4gICAgICAgIGFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcIm1vdXNlZG93blwiLCBvbk1vdXNlRG93bik7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vkb3duXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgcmV0dXJuIHByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBIYW5kbGUgYG1vdXNlbW92ZWAgd2hpbGUgdGhlIG1vdXNlIGlzIG92ZXIgdGhlIGVkaXRpbmcgYXJlYSAoYW5kIG5vdCB0aGUgZ3V0dGVyKS5cbiAgICAgICAgZWRpdG9yLm9uKCdtb3VzZW1vdmUnLCBmdW5jdGlvbihlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoX3NlbGYuc3RhdGUgfHwgX3NlbGYuJGRyYWdEZWxheSB8fCAhX3NlbGYuJGRyYWdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRklYTUU6IFByb2JhYmx5IHMvYiBjbGllbnRYWVxuICAgICAgICAgICAgdmFyIGNoYXIgPSBlZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoZS54LCBlLnkpO1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlc3Npb24oKS5nZXRTZWxlY3Rpb24oKS5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHJlbmRlcmVyID0gZWRpdG9yLnJlbmRlcmVyO1xuXG4gICAgICAgICAgICBpZiAoIXJhbmdlLmlzRW1wdHkoKSAmJiByYW5nZS5pbnNpZGVTdGFydChjaGFyLnJvdywgY2hhci5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuc2V0Q3Vyc29yU3R5bGUoJ2RlZmF1bHQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlbmRlcmVyLnNldEN1cnNvclN0eWxlKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbk1vdXNlRXZlbnQobmFtZTogc3RyaW5nLCBlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKSk7XG4gICAgfVxuXG4gICAgb25Nb3VzZU1vdmUobmFtZTogc3RyaW5nLCBlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIC8vIElmIG5vYm9keSBpcyBsaXN0ZW5pbmcsIGF2b2lkIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGVtcG9yYXJ5IHdyYXBwZXIuXG4gICAgICAgIC8vIG9wdGltaXphdGlvbiwgYmVjYXVzZSBtb3VzZW1vdmUgZG9lc24ndCBoYXZlIGEgZGVmYXVsdCBoYW5kbGVyLlxuICAgICAgICB2YXIgbGlzdGVuZXJzID0gdGhpcy5lZGl0b3IuX2V2ZW50UmVnaXN0cnkgJiYgdGhpcy5lZGl0b3IuX2V2ZW50UmVnaXN0cnlbJ21vdXNlbW92ZSddO1xuICAgICAgICBpZiAoIWxpc3RlbmVycyB8fCAhbGlzdGVuZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbmV3IEVkaXRvck1vdXNlRXZlbnQoZSwgdGhpcy5lZGl0b3IpKTtcbiAgICB9XG5cbiAgICBlbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50KG5hbWU6IHN0cmluZywgZTogTW91c2VXaGVlbEV2ZW50KSB7XG4gICAgICAgIHZhciBtb3VzZUV2ZW50ID0gbmV3IEVkaXRvck1vdXNlRXZlbnQoZSwgdGhpcy5lZGl0b3IpO1xuICAgICAgICBtb3VzZUV2ZW50LnNwZWVkID0gdGhpcy4kc2Nyb2xsU3BlZWQgKiAyO1xuICAgICAgICBtb3VzZUV2ZW50LndoZWVsWCA9IGVbJ3doZWVsWCddO1xuICAgICAgICBtb3VzZUV2ZW50LndoZWVsWSA9IGVbJ3doZWVsWSddO1xuICAgICAgICB0aGlzLmVkaXRvci5fZW1pdChuYW1lLCBtb3VzZUV2ZW50KTtcbiAgICB9XG5cbiAgICBzZXRTdGF0ZShzdGF0ZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbiAgICB9XG5cbiAgICB0ZXh0Q29vcmRpbmF0ZXMoKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgfVxuXG4gICAgY2FwdHVyZU1vdXNlKGV2OiBFZGl0b3JNb3VzZUV2ZW50LCBtb3VzZU1vdmVIYW5kbGVyPzogKG1vdXNlRXZlbnQ6IE1vdXNlRXZlbnQpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5jbGllbnRYID0gZXYuY2xpZW50WDtcbiAgICAgICAgdGhpcy5jbGllbnRZID0gZXYuY2xpZW50WTtcblxuICAgICAgICB0aGlzLmlzTW91c2VQcmVzc2VkID0gdHJ1ZTtcblxuICAgICAgICAvLyBkbyBub3QgbW92ZSB0ZXh0YXJlYSBkdXJpbmcgc2VsZWN0aW9uXG4gICAgICAgIHZhciByZW5kZXJlciA9IHRoaXMuZWRpdG9yLnJlbmRlcmVyO1xuICAgICAgICBpZiAocmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yKSB7XG4gICAgICAgICAgICByZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG9uTW91c2VNb3ZlID0gKGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKG1vdXNlRXZlbnQ6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIW1vdXNlRXZlbnQpIHJldHVybjtcbiAgICAgICAgICAgICAgICAvLyBpZiBlZGl0b3IgaXMgbG9hZGVkIGluc2lkZSBpZnJhbWUsIGFuZCBtb3VzZXVwIGV2ZW50IGlzIG91dHNpZGVcbiAgICAgICAgICAgICAgICAvLyB3ZSB3b24ndCByZWNpZXZlIGl0LCBzbyB3ZSBjYW5jZWwgb24gZmlyc3QgbW91c2Vtb3ZlIHdpdGhvdXQgYnV0dG9uXG4gICAgICAgICAgICAgICAgaWYgKGlzV2ViS2l0ICYmICFtb3VzZUV2ZW50LndoaWNoICYmIG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogRm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IEknbSBwYXNzaW5nIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgLy8gYnV0IGl0IHdvdWxkIHByb2JhYmx5IG1ha2UgbW9yZSBzZW5zZSB0byBwYXNzIHRoZSBtb3VzZSBldmVudFxuICAgICAgICAgICAgICAgICAgICAvLyBzaW5jZSB0aGF0IGlzIHRoZSBmaW5hbCBldmVudC5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UodW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuY2xpZW50WCA9IG1vdXNlRXZlbnQuY2xpZW50WDtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuY2xpZW50WSA9IG1vdXNlRXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgICBtb3VzZU1vdmVIYW5kbGVyICYmIG1vdXNlTW92ZUhhbmRsZXIobW91c2VFdmVudCk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlRXZlbnQgPSBuZXcgRWRpdG9yTW91c2VFdmVudChtb3VzZUV2ZW50LCBlZGl0b3IpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbW91c2VNb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMuZWRpdG9yLCB0aGlzKTtcblxuICAgICAgICB2YXIgb25DYXB0dXJlRW5kID0gKGZ1bmN0aW9uKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXJJZCk7XG4gICAgICAgICAgICAgICAgb25DYXB0dXJlSW50ZXJ2YWwoKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlICsgXCJFbmRcIl0gJiYgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZSArIFwiRW5kXCJdKGUpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zdGF0ZSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlcmVyLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuaXNNb3VzZVByZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJG9uQ2FwdHVyZU1vdXNlTW92ZSA9IG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UgPSBudWxsO1xuICAgICAgICAgICAgICAgIGUgJiYgbW91c2VIYW5kbGVyLm9uTW91c2VFdmVudChcIm1vdXNldXBcIiwgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMpO1xuXG4gICAgICAgIHZhciBvbkNhcHR1cmVJbnRlcnZhbCA9IChmdW5jdGlvbihtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGVdICYmIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGVdKCk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRtb3VzZU1vdmVkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMpO1xuXG4gICAgICAgIGlmIChpc09sZElFICYmIGV2LmRvbUV2ZW50LnR5cGUgPT0gXCJkYmxjbGlja1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpIHsgb25DYXB0dXJlRW5kKGV2KTsgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRvbkNhcHR1cmVNb3VzZU1vdmUgPSBvbk1vdXNlTW92ZTtcbiAgICAgICAgdGhpcy5yZWxlYXNlTW91c2UgPSBjYXB0dXJlKHRoaXMuZWRpdG9yLmNvbnRhaW5lciwgb25Nb3VzZU1vdmUsIG9uQ2FwdHVyZUVuZCk7XG4gICAgICAgIHZhciB0aW1lcklkID0gc2V0SW50ZXJ2YWwob25DYXB0dXJlSW50ZXJ2YWwsIDIwKTtcbiAgICB9XG5cbiAgICBjYW5jZWxDb250ZXh0TWVudSgpOiB2b2lkIHtcbiAgICAgICAgdmFyIHN0b3AgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoZSAmJiBlLmRvbUV2ZW50ICYmIGUuZG9tRXZlbnQudHlwZSAhPSBcImNvbnRleHRtZW51XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5vZmYoXCJuYXRpdmVjb250ZXh0bWVudVwiLCBzdG9wKTtcbiAgICAgICAgICAgIGlmIChlICYmIGUuZG9tRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBzdG9wRXZlbnQoZS5kb21FdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKTtcbiAgICAgICAgc2V0VGltZW91dChzdG9wLCAxMCk7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwibmF0aXZlY29udGV4dG1lbnVcIiwgc3RvcCk7XG4gICAgfVxuXG4gICAgc2VsZWN0KCkge1xuICAgICAgICB2YXIgYW5jaG9yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuXG4gICAgICAgIGlmICh0aGlzLiRjbGlja1NlbGVjdGlvbikge1xuICAgICAgICAgICAgdmFyIGNtcCA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChjdXJzb3IpO1xuXG4gICAgICAgICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gdGhpcy4kY2xpY2tTZWxlY3Rpb24uZW5kO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjbXAgPT0gMSkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLnN0YXJ0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50ZWRSYW5nZSA9IGNhbGNSYW5nZU9yaWVudGF0aW9uKHRoaXMuJGNsaWNrU2VsZWN0aW9uLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IG9yaWVudGVkUmFuZ2UuY3Vyc29yO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG9yaWVudGVkUmFuZ2UuYW5jaG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLnNldFNlbGVjdGlvbkFuY2hvcihhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QnlMaW5lc0VuZCgpIHtcbiAgICAgICAgdGhpcy4kY2xpY2tTZWxlY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLmVkaXRvci51bnNldFN0eWxlKFwiYWNlX3NlbGVjdGluZ1wiKTtcbiAgICAgICAgaWYgKHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnJlbGVhc2VDYXB0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5yZWxlYXNlQ2FwdHVyZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRTZWxlY3QocG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24/OiBib29sZWFuKSB7XG4gICAgICAgIHBvcyA9IHBvcyB8fCB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgICAgIHZhciBlZGl0b3IgPSB0aGlzLmVkaXRvcjtcbiAgICAgICAgLy8gYWxsb3cgZG91YmxlL3RyaXBsZSBjbGljayBoYW5kbGVycyB0byBjaGFuZ2Ugc2VsZWN0aW9uXG4gICAgXG4gICAgICAgIGlmICh0aGlzLm1vdXNlZG93bkV2ZW50LmdldFNoaWZ0S2V5KCkpIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihwb3MpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCF3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghd2FpdEZvckNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnNldENhcHR1cmUpIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnNldENhcHR1cmUoKTtcbiAgICAgICAgfVxuICAgICAgICBlZGl0b3Iuc2V0U3R5bGUoXCJhY2Vfc2VsZWN0aW5nXCIpO1xuICAgICAgICB0aGlzLnNldFN0YXRlKFwic2VsZWN0XCIpO1xuICAgIH1cblxuICAgIHNlbGVjdEVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QWxsRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBzZWxlY3RCeVdvcmRzRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBmb2N1c1dhaXQoKSB7XG4gICAgICAgIHZhciBkaXN0YW5jZSA9IGNhbGNEaXN0YW5jZSh0aGlzLm1vdXNlZG93bkV2ZW50LmNsaWVudFgsIHRoaXMubW91c2Vkb3duRXZlbnQuY2xpZW50WSwgdGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB2YXIgdGltZSA9IERhdGUubm93KCk7XG5cbiAgICAgICAgaWYgKGRpc3RhbmNlID4gRFJBR19PRkZTRVQgfHwgdGltZSAtIHRoaXMubW91c2Vkb3duRXZlbnQudGltZSA+IHRoaXMuJGZvY3VzVGltb3V0KSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0U2VsZWN0KHRoaXMubW91c2Vkb3duRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpKTtcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG5kZWZpbmVPcHRpb25zKE1vdXNlSGFuZGxlci5wcm90b3R5cGUsIFwibW91c2VIYW5kbGVyXCIsIHtcbiAgICBzY3JvbGxTcGVlZDogeyBpbml0aWFsVmFsdWU6IDIgfSxcbiAgICBkcmFnRGVsYXk6IHsgaW5pdGlhbFZhbHVlOiAoaXNNYWMgPyAxNTAgOiAwKSB9LFxuICAgIGRyYWdFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIGZvY3VzVGltb3V0OiB7IGluaXRpYWxWYWx1ZTogMCB9LFxuICAgIHRvb2x0aXBGb2xsb3dzTW91c2U6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH1cbn0pO1xuXG4vKlxuICogQ3VzdG9tIEFjZSBtb3VzZSBldmVudFxuICovXG5jbGFzcyBFZGl0b3JNb3VzZUV2ZW50IHtcbiAgICAvLyBXZSBrZWVwIHRoZSBvcmlnaW5hbCBET00gZXZlbnRcbiAgICBwdWJsaWMgZG9tRXZlbnQ6IE1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSBlZGl0b3I6IEVkaXRvcjtcbiAgICBwdWJsaWMgY2xpZW50WDogbnVtYmVyO1xuICAgIHB1YmxpYyBjbGllbnRZOiBudW1iZXI7XG4gICAgLyoqXG4gICAgICogQ2FjaGVkIHRleHQgY29vcmRpbmF0ZXMgZm9sbG93aW5nIGdldERvY3VtZW50UG9zaXRpb24oKVxuICAgICAqL1xuICAgIHByaXZhdGUgJHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICBwcml2YXRlICRpblNlbGVjdGlvbjtcbiAgICBwcml2YXRlIHByb3BhZ2F0aW9uU3RvcHBlZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGVmYXVsdFByZXZlbnRlZCA9IGZhbHNlO1xuICAgIHB1YmxpYyB0aW1lOiBudW1iZXI7XG4gICAgLy8gd2hlZWxZLCB3aGVlbFkgYW5kIHNwZWVkIGFyZSBmb3IgJ21vdXNld2hlZWwnIGV2ZW50cy5cbiAgICBwdWJsaWMgd2hlZWxYOiBudW1iZXI7XG4gICAgcHVibGljIHdoZWVsWTogbnVtYmVyO1xuICAgIHB1YmxpYyBzcGVlZDogbnVtYmVyO1xuICAgIGNvbnN0cnVjdG9yKGRvbUV2ZW50OiBNb3VzZUV2ZW50LCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB0aGlzLmRvbUV2ZW50ID0gZG9tRXZlbnQ7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGRvbUV2ZW50LmNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGRvbUV2ZW50LmNsaWVudFk7XG5cbiAgICAgICAgdGhpcy4kcG9zID0gbnVsbDtcbiAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBudWxsO1xuICAgIH1cblxuICAgIGdldCB0b0VsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvbUV2ZW50LnRvRWxlbWVudDtcbiAgICB9XG5cbiAgICBzdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgICAgIHN0b3BQcm9wYWdhdGlvbih0aGlzLmRvbUV2ZW50KTtcbiAgICAgICAgdGhpcy5wcm9wYWdhdGlvblN0b3BwZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIHByZXZlbnREZWZhdWx0KCkge1xuICAgICAgICBwcmV2ZW50RGVmYXVsdCh0aGlzLmRvbUV2ZW50KTtcbiAgICAgICAgdGhpcy5kZWZhdWx0UHJldmVudGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBzdG9wKCkge1xuICAgICAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICB0aGlzLnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBHZXQgdGhlIGRvY3VtZW50IHBvc2l0aW9uIGJlbG93IHRoZSBtb3VzZSBjdXJzb3JcbiAgICAgKiBcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9ICdyb3cnIGFuZCAnY29sdW1uJyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb25cbiAgICAgKi9cbiAgICBnZXREb2N1bWVudFBvc2l0aW9uKCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICBpZiAoIXRoaXMuJHBvcykge1xuICAgICAgICAgICAgdGhpcy4kcG9zID0gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLiRwb3M7XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogQ2hlY2sgaWYgdGhlIG1vdXNlIGN1cnNvciBpcyBpbnNpZGUgb2YgdGhlIHRleHQgc2VsZWN0aW9uXG4gICAgICogXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gd2hldGhlciB0aGUgbW91c2UgY3Vyc29yIGlzIGluc2lkZSBvZiB0aGUgc2VsZWN0aW9uXG4gICAgICovXG4gICAgaW5TZWxlY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLiRpblNlbGVjdGlvbiAhPT0gbnVsbClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRpblNlbGVjdGlvbjtcblxuICAgICAgICB2YXIgZWRpdG9yID0gdGhpcy5lZGl0b3I7XG5cblxuICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHNlbGVjdGlvblJhbmdlLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gZmFsc2U7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBzZWxlY3Rpb25SYW5nZS5jb250YWlucyhwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLiRpblNlbGVjdGlvbjtcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBHZXQgdGhlIGNsaWNrZWQgbW91c2UgYnV0dG9uXG4gICAgICogXG4gICAgICogQHJldHVybiB7TnVtYmVyfSAwIGZvciBsZWZ0IGJ1dHRvbiwgMSBmb3IgbWlkZGxlIGJ1dHRvbiwgMiBmb3IgcmlnaHQgYnV0dG9uXG4gICAgICovXG4gICAgZ2V0QnV0dG9uKCkge1xuICAgICAgICByZXR1cm4gZ2V0QnV0dG9uKHRoaXMuZG9tRXZlbnQpO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhlIHNoaWZ0IGtleSB3YXMgcHJlc3NlZCB3aGVuIHRoZSBldmVudCB3YXMgZW1pdHRlZFxuICAgICAqL1xuICAgIGdldFNoaWZ0S2V5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb21FdmVudC5zaGlmdEtleTtcbiAgICB9XG5cbiAgICBnZXRBY2NlbEtleSA9IGlzTWFjID8gZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvbUV2ZW50Lm1ldGFLZXk7IH0gOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZG9tRXZlbnQuY3RybEtleTsgfTtcbn1cblxudmFyIERSQUdfT0ZGU0VUID0gMDsgLy8gcGl4ZWxzXG5cbmZ1bmN0aW9uIG1ha2VNb3VzZURvd25IYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihldjogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgaW5TZWxlY3Rpb24gPSBldi5pblNlbGVjdGlvbigpO1xuICAgICAgICB2YXIgcG9zID0gZXYuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICBtb3VzZUhhbmRsZXIubW91c2Vkb3duRXZlbnQgPSBldjtcblxuICAgICAgICB2YXIgYnV0dG9uID0gZXYuZ2V0QnV0dG9uKCk7XG4gICAgICAgIGlmIChidXR0b24gIT09IDApIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25SYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVtcHR5ID0gc2VsZWN0aW9uUmFuZ2UuaXNFbXB0eSgpO1xuXG4gICAgICAgICAgICBpZiAoc2VsZWN0aW9uRW1wdHkpXG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbihwb3MpO1xuXG4gICAgICAgICAgICAvLyAyOiBjb250ZXh0bWVudSwgMTogbGludXggcGFzdGVcbiAgICAgICAgICAgIGVkaXRvci50ZXh0SW5wdXQub25Db250ZXh0TWVudShldi5kb21FdmVudCk7XG4gICAgICAgICAgICByZXR1cm47IC8vIHN0b3BwaW5nIGV2ZW50IGhlcmUgYnJlYWtzIGNvbnRleHRtZW51IG9uIGZmIG1hY1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlZG93bkV2ZW50LnRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICAvLyBpZiB0aGlzIGNsaWNrIGNhdXNlZCB0aGUgZWRpdG9yIHRvIGJlIGZvY3VzZWQgc2hvdWxkIG5vdCBjbGVhciB0aGVcbiAgICAgICAgLy8gc2VsZWN0aW9uXG4gICAgICAgIGlmIChpblNlbGVjdGlvbiAmJiAhZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKTtcbiAgICAgICAgICAgIGlmIChtb3VzZUhhbmRsZXIuJGZvY3VzVGltb3V0ICYmICFtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uICYmICFlZGl0b3IuaW5NdWx0aVNlbGVjdE1vZGUpIHtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJmb2N1c1dhaXRcIik7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShldik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShldik7XG4gICAgICAgIC8vIFRPRE86IF9jbGlja3MgaXMgYSBjdXN0b20gcHJvcGVydHkgYWRkZWQgaW4gZXZlbnQudHMgYnkgdGhlICdtb3VzZWRvd24nIGxpc3RlbmVyLlxuICAgICAgICBtb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QocG9zLCBldi5kb21FdmVudFsnX2NsaWNrcyddID4gMSk7XG4gICAgICAgIHJldHVybiBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZU1vdXNlV2hlZWxIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihldjogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICBpZiAoZXYuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9zaGlmdCB3aGVlbCB0byBob3JpeiBzY3JvbGxcbiAgICAgICAgaWYgKGV2LmdldFNoaWZ0S2V5KCkgJiYgZXYud2hlZWxZICYmICFldi53aGVlbFgpIHtcbiAgICAgICAgICAgIGV2LndoZWVsWCA9IGV2LndoZWVsWTtcbiAgICAgICAgICAgIGV2LndoZWVsWSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdCA9IGV2LmRvbUV2ZW50LnRpbWVTdGFtcDtcbiAgICAgICAgdmFyIGR0ID0gdCAtIChtb3VzZUhhbmRsZXIuJGxhc3RTY3JvbGxUaW1lIHx8IDApO1xuXG4gICAgICAgIHZhciBpc1Njcm9sYWJsZSA9IGVkaXRvci5yZW5kZXJlci5pc1Njcm9sbGFibGVCeShldi53aGVlbFggKiBldi5zcGVlZCwgZXYud2hlZWxZICogZXYuc3BlZWQpO1xuICAgICAgICBpZiAoaXNTY3JvbGFibGUgfHwgZHQgPCAyMDApIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbGFzdFNjcm9sbFRpbWUgPSB0O1xuICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJ5KGV2LndoZWVsWCAqIGV2LnNwZWVkLCBldi53aGVlbFkgKiBldi5zcGVlZCk7XG4gICAgICAgICAgICByZXR1cm4gZXYuc3RvcCgpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlRG91YmxlQ2xpY2tIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihlZGl0b3JNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgIHZhciBwb3MgPSBlZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKHBvcyk7XG4gICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbi0tO1xuICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4rKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdFwiKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRXb3JkUmFuZ2UocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RCeVdvcmRzXCIpO1xuICAgICAgICB9XG4gICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSByYW5nZTtcbiAgICAgICAgbW91c2VIYW5kbGVyLnNlbGVjdCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZVRyaXBsZUNsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgcG9zID0gZWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlMaW5lc1wiKTtcbiAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChyYW5nZS5pc011bHRpTGluZSgpICYmIHJhbmdlLmNvbnRhaW5zKHBvcy5yb3csIHBvcy5jb2x1bW4pKSB7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRMaW5lUmFuZ2UocmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uZW5kID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRMaW5lUmFuZ2UocmFuZ2UuZW5kLnJvdykuZW5kO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHBvcy5yb3cpO1xuICAgICAgICB9XG4gICAgICAgIG1vdXNlSGFuZGxlci5zZWxlY3QoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VRdWFkQ2xpY2tIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihlZGl0b3JNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgIGVkaXRvci5zZWxlY3RBbGwoKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RBbGxcIik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlRXh0ZW5kU2VsZWN0aW9uQnkoZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyLCB1bml0TmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYW5jaG9yO1xuICAgICAgICB2YXIgY3Vyc29yID0gbW91c2VIYW5kbGVyLnRleHRDb29yZGluYXRlcygpO1xuICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3Iuc2VsZWN0aW9uW3VuaXROYW1lXShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICBpZiAobW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbikge1xuICAgICAgICAgICAgdmFyIGNtcFN0YXJ0ID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5jb21wYXJlUG9pbnQocmFuZ2Uuc3RhcnQpO1xuICAgICAgICAgICAgdmFyIGNtcEVuZCA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uY29tcGFyZVBvaW50KHJhbmdlLmVuZCk7XG5cbiAgICAgICAgICAgIGlmIChjbXBTdGFydCA9PSAtMSAmJiBjbXBFbmQgPD0gMCkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uZW5kO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5lbmQucm93ICE9IGN1cnNvci5yb3cgfHwgcmFuZ2UuZW5kLmNvbHVtbiAhPSBjdXJzb3IuY29sdW1uKVxuICAgICAgICAgICAgICAgICAgICBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcEVuZCA9PSAxICYmIGNtcFN0YXJ0ID49IDApIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgIT0gY3Vyc29yLnJvdyB8fCByYW5nZS5zdGFydC5jb2x1bW4gIT0gY3Vyc29yLmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wU3RhcnQgPT0gLTEgJiYgY21wRW5kID09IDEpIHtcbiAgICAgICAgICAgICAgICBjdXJzb3IgPSByYW5nZS5lbmQ7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50ZWRSYW5nZSA9IGNhbGNSYW5nZU9yaWVudGF0aW9uKG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24sIGN1cnNvcik7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gb3JpZW50ZWRSYW5nZS5jdXJzb3I7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gb3JpZW50ZWRSYW5nZS5hbmNob3I7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLnNldFNlbGVjdGlvbkFuY2hvcihhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24oY3Vyc29yKTtcblxuICAgICAgICBlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNhbGNEaXN0YW5jZShheDogbnVtYmVyLCBheTogbnVtYmVyLCBieDogbnVtYmVyLCBieTogbnVtYmVyKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyhieCAtIGF4LCAyKSArIE1hdGgucG93KGJ5IC0gYXksIDIpKTtcbn1cblxuZnVuY3Rpb24gY2FsY1JhbmdlT3JpZW50YXRpb24ocmFuZ2U6IFJhbmdlLCBjdXJzb3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0pOiB7IGN1cnNvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTsgYW5jaG9yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IH0ge1xuICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICB2YXIgY21wID0gMiAqIGN1cnNvci5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW4gLSByYW5nZS5lbmQuY29sdW1uO1xuICAgIH1cbiAgICBlbHNlIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdyAtIDEgJiYgIXJhbmdlLnN0YXJ0LmNvbHVtbiAmJiAhcmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICB2YXIgY21wID0gY3Vyc29yLmNvbHVtbiAtIDQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIgY21wID0gMiAqIGN1cnNvci5yb3cgLSByYW5nZS5zdGFydC5yb3cgLSByYW5nZS5lbmQucm93O1xuICAgIH1cblxuICAgIGlmIChjbXAgPCAwKSB7XG4gICAgICAgIHJldHVybiB7IGN1cnNvcjogcmFuZ2Uuc3RhcnQsIGFuY2hvcjogcmFuZ2UuZW5kIH07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4geyBjdXJzb3I6IHJhbmdlLmVuZCwgYW5jaG9yOiByYW5nZS5zdGFydCB9O1xuICAgIH1cbn1cblxuY2xhc3MgR3V0dGVySGFuZGxlciB7XG4gICAgY29uc3RydWN0b3IobW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgdmFyIGVkaXRvcjogRWRpdG9yID0gbW91c2VIYW5kbGVyLmVkaXRvcjtcbiAgICAgICAgdmFyIGd1dHRlcjogR3V0dGVyID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXJMYXllcjtcbiAgICAgICAgdmFyIHRvb2x0aXAgPSBuZXcgR3V0dGVyVG9vbHRpcChlZGl0b3IuY29udGFpbmVyKTtcblxuICAgICAgICBtb3VzZUhhbmRsZXIuZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwiZ3V0dGVybW91c2Vkb3duXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpIHx8IGUuZ2V0QnV0dG9uKCkgIT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGd1dHRlci5nZXRSZWdpb24oZSk7XG5cbiAgICAgICAgICAgIGlmIChndXR0ZXJSZWdpb24gPT09IFwiZm9sZFdpZGdldHNcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpLmdldFNlbGVjdGlvbigpO1xuXG4gICAgICAgICAgICBpZiAoZS5nZXRTaGlmdEtleSgpKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uLnNlbGVjdFRvKHJvdywgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoZS5kb21FdmVudC5kZXRhaWwgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlMaW5lc1wiKTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZSk7XG4gICAgICAgICAgICByZXR1cm4gZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9KTtcblxuXG4gICAgICAgIHZhciB0b29sdGlwVGltZW91dDogbnVtYmVyO1xuICAgICAgICB2YXIgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICAgICAgdmFyIHRvb2x0aXBBbm5vdGF0aW9uO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNob3dUb29sdGlwKCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IG1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBhbm5vdGF0aW9uID0gZ3V0dGVyLiRhbm5vdGF0aW9uc1tyb3ddO1xuICAgICAgICAgICAgaWYgKCFhbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuICAgICAgICAgICAgdmFyIG1heFJvdyA9IHNlc3Npb24uZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICBpZiAocm93ID09IG1heFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzY3JlZW5Sb3cgPSBlZGl0b3IucmVuZGVyZXIucGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzKDAsIG1vdXNlRXZlbnQuY2xpZW50WSkucm93O1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSBtb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAoc2NyZWVuUm93ID4gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KHBvcy5yb3csIHBvcy5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodG9vbHRpcEFubm90YXRpb24gPT0gYW5ub3RhdGlvbikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRvb2x0aXBBbm5vdGF0aW9uID0gYW5ub3RhdGlvbi50ZXh0LmpvaW4oXCI8YnIvPlwiKTtcblxuICAgICAgICAgICAgdG9vbHRpcC5zZXRIdG1sKHRvb2x0aXBBbm5vdGF0aW9uKTtcblxuICAgICAgICAgICAgdG9vbHRpcC5zaG93KCk7XG5cbiAgICAgICAgICAgIGVkaXRvci5vbihcIm1vdXNld2hlZWxcIiwgaGlkZVRvb2x0aXApO1xuXG4gICAgICAgICAgICBpZiAobW91c2VIYW5kbGVyLiR0b29sdGlwRm9sbG93c01vdXNlKSB7XG4gICAgICAgICAgICAgICAgbW92ZVRvb2x0aXAobW91c2VFdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZ3V0dGVyRWxlbWVudCA9IGd1dHRlci4kY2VsbHNbZWRpdG9yLmdldFNlc3Npb24oKS5kb2N1bWVudFRvU2NyZWVuUm93KHJvdywgMCldLmVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgdmFyIHJlY3QgPSBndXR0ZXJFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgICAgIHZhciBzdHlsZSA9IHRvb2x0aXAuZ2V0RWxlbWVudCgpLnN0eWxlO1xuICAgICAgICAgICAgICAgIHN0eWxlLmxlZnQgPSByZWN0LnJpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgIHN0eWxlLnRvcCA9IHJlY3QuYm90dG9tICsgXCJweFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaGlkZVRvb2x0aXAoZXZlbnQsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgICAgICBpZiAodG9vbHRpcFRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodG9vbHRpcFRpbWVvdXQpO1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcC5oaWRlKCk7XG4gICAgICAgICAgICAgICAgdG9vbHRpcEFubm90YXRpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGVkaXRvci5vZmYoXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG1vdmVUb29sdGlwKGV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICB0b29sdGlwLnNldFBvc2l0aW9uKGV2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlbW92ZVwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogT2JmdXNjYXRpbmcgdGhlIHR5cGUgb2YgdGFyZ2V0IHRvIHRod2FydCBjb21waWxlci5cbiAgICAgICAgICAgIHZhciB0YXJnZXQ6IGFueSA9IGUuZG9tRXZlbnQudGFyZ2V0IHx8IGUuZG9tRXZlbnQuc3JjRWxlbWVudDtcbiAgICAgICAgICAgIGlmIChoYXNDc3NDbGFzcyh0YXJnZXQsIFwiYWNlX2ZvbGQtd2lkZ2V0XCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uICYmIG1vdXNlSGFuZGxlci4kdG9vbHRpcEZvbGxvd3NNb3VzZSkge1xuICAgICAgICAgICAgICAgIG1vdmVUb29sdGlwKGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtb3VzZUV2ZW50ID0gZTtcbiAgICAgICAgICAgIGlmICh0b29sdGlwVGltZW91dCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKG1vdXNlRXZlbnQgJiYgIW1vdXNlSGFuZGxlci5pc01vdXNlUHJlc3NlZClcbiAgICAgICAgICAgICAgICAgICAgc2hvd1Rvb2x0aXAoKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH0sIDUwKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXIsIFwibW91c2VvdXRcIiwgZnVuY3Rpb24oZTogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgbW91c2VFdmVudCA9IG51bGw7XG4gICAgICAgICAgICBpZiAoIXRvb2x0aXBBbm5vdGF0aW9uIHx8IHRvb2x0aXBUaW1lb3V0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICB9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGVkaXRvci5vbihcImNoYW5nZVNlc3Npb25cIiwgaGlkZVRvb2x0aXApO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAY2xhc3MgR3V0dGVyVG9vbHRpcFxuICogQGV4dGVuZHMgVG9vbHRpcFxuICovXG5jbGFzcyBHdXR0ZXJUb29sdGlwIGV4dGVuZHMgVG9vbHRpcCB7XG4gICAgY29uc3RydWN0b3IocGFyZW50Tm9kZTogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50Tm9kZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0UG9zaXRpb25cbiAgICAgKiBAcGFyYW0geCB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSB5IHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRQb3NpdGlvbih4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG4gICAgICAgIHZhciB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodDtcbiAgICAgICAgdmFyIHdpZHRoID0gdGhpcy5nZXRXaWR0aCgpO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHQoKTtcbiAgICAgICAgeCArPSAxNTtcbiAgICAgICAgeSArPSAxNTtcbiAgICAgICAgaWYgKHggKyB3aWR0aCA+IHdpbmRvd1dpZHRoKSB7XG4gICAgICAgICAgICB4IC09ICh4ICsgd2lkdGgpIC0gd2luZG93V2lkdGg7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHkgKyBoZWlnaHQgPiB3aW5kb3dIZWlnaHQpIHtcbiAgICAgICAgICAgIHkgLT0gMjAgKyBoZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgc3VwZXIuc2V0UG9zaXRpb24oeCwgeSk7XG4gICAgfVxufVxuIl19