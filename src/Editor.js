"use strict";
import { mixin } from "./lib/oop";
import { computedStyle, hasCssClass, setCssClass } from "./lib/dom";
import { delayedCall, stringRepeat } from "./lib/lang";
import { isIE, isMac, isMobile, isOldIE, isWebKit } from "./lib/useragent";
import KeyBinding from "./keyboard/KeyBinding";
import TextInput from "./keyboard/TextInput";
import Search from "./Search";
import Range from "./Range";
import EventEmitterClass from "./lib/EventEmitterClass";
import CommandManager from "./commands/CommandManager";
import defaultCommands from "./commands/default_commands";
import { defineOptions, loadModule, resetOptions } from "./config";
import TokenIterator from "./TokenIterator";
import { COMMAND_NAME_AUTO_COMPLETE } from './editor_protocol';
import { addListener, addMouseWheelListener, addMultiMouseDownListener, capture, getButton, preventDefault, stopEvent, stopPropagation } from "./lib/event";
import { touchManager } from './touch/touch';
import Tooltip from "./Tooltip";
export default class Editor {
    constructor(renderer, session) {
        this.eventBus = new EventEmitterClass(this);
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
        this.commands.on("exec", (e) => {
            this.startOperation(e);
            var command = e.command;
            if (command.aceCommandGroup === "fileJump") {
                var prev = this.prevOp;
                if (!prev || prev.command.aceCommandGroup !== "fileJump") {
                    this.lastFileJumpPos = last(this.selections);
                }
            }
            else {
                this.lastFileJumpPos = null;
            }
        }, true);
        this.commands.on("afterExec", (e, cm) => {
            var command = e.command;
            if (command.aceCommandGroup === "fileJump") {
                if (this.lastFileJumpPos && !this.curOp.selectionChanged) {
                    this.selection.fromJSON(this.lastFileJumpPos);
                }
            }
            this.endOperation(e);
        }, true);
        this.$opResetTimer = delayedCall(this.endOperation.bind(this));
        this.eventBus.on("change", () => {
            this.curOp || this.startOperation();
            this.curOp.docChanged = true;
        }, true);
        this.eventBus.on("changeSelection", () => {
            this.curOp || this.startOperation();
            this.curOp.selectionChanged = true;
        }, true);
    }
    startOperation(commandEvent) {
        if (this.curOp) {
            if (!commandEvent || this.curOp.command)
                return;
            this.prevOp = this.curOp;
        }
        if (!commandEvent) {
            this.previousCommand = null;
            commandEvent = {};
        }
        this.$opResetTimer.schedule();
        this.curOp = {
            command: commandEvent.command || {},
            args: commandEvent.args,
            scrollTop: this.renderer.scrollTop
        };
        var command = this.curOp.command;
        if (command && command.scrollIntoView)
            this.$blockScrolling++;
        this.selections.push(this.selection.toJSON());
    }
    endOperation(unused) {
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
        this.eventBus._signal("changeSession", {
            session: session,
            oldSession: oldSession
        });
        oldSession && oldSession._signal("changeEditor", { oldEditor: this });
        session && session._signal("changeEditor", { editor: this });
    }
    getSession() {
        return this.session;
    }
    setValue(text, cursorPos) {
        this.session.doc.setValue(text);
        if (!cursorPos) {
            this.selectAll();
        }
        else if (cursorPos == +1) {
            this.navigateFileEnd();
        }
        else if (cursorPos == -1) {
            this.navigateFileStart();
        }
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
            else if (self.session.$mode && self.session.$mode.getMatching) {
                var range = self.session.$mode.getMatching(self.session);
            }
            if (range) {
                self.session.$bracketHighlight = self.session.addMarker(range, "ace_bracket", "text");
            }
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
        this.eventBus._emit("focus");
    }
    onBlur() {
        if (!this.$isFocused) {
            return;
        }
        this.$isFocused = false;
        this.renderer.hideCursor();
        this.renderer.visualizeBlur();
        this.eventBus._emit("blur");
    }
    $cursorChange() {
        this.renderer.updateCursor();
    }
    onDocumentChange(event, session) {
        var delta = event.data;
        var range = delta.range;
        var lastRow;
        if (range.start.row === range.end.row && delta.action !== "insertLines" && delta.action !== "removeLines") {
            lastRow = range.end.row;
        }
        else {
            lastRow = Infinity;
        }
        var renderer = this.renderer;
        renderer.updateLines(range.start.row, lastRow, session.$useWrapMode);
        this.eventBus._signal("change", event);
        this.$cursorChange();
        this.$updateHighlightActiveLine();
    }
    onTokenizerUpdate(event, session) {
        var rows = event.data;
        this.renderer.updateLines(rows.first, rows.last);
    }
    onScrollTopChange(event, session) {
        this.renderer.scrollToY(session.getScrollTop());
    }
    onScrollLeftChange(event, session) {
        this.renderer.scrollToX(session.getScrollLeft());
    }
    onCursorChange(event, session) {
        this.$cursorChange();
        if (!this.$blockScrolling) {
            this.renderer.scrollCursorIntoView();
        }
        this.$highlightBrackets();
        this.$highlightTags();
        this.$updateHighlightActiveLine();
        this.eventBus._signal("changeSelection");
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
        this.eventBus._signal("changeSelection");
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
    onChangeFrontMarker(event, session) {
        this.updateFrontMarkers();
    }
    updateFrontMarkers() {
        this.renderer.updateFrontMarkers();
    }
    onChangeBackMarker(event, session) {
        this.renderer.updateBackMarkers();
    }
    updateBackMarkers() {
        this.renderer.updateBackMarkers();
    }
    onChangeBreakpoint(event, editSession) {
        this.renderer.updateBreakpoints();
        this.eventBus._emit("changeBreakpoint", event);
    }
    onChangeAnnotation(event, session) {
        this.renderer.setAnnotations(session.getAnnotations());
        this.eventBus._emit("changeAnnotation", event);
    }
    onChangeMode(event, session) {
        this.renderer.updateText();
        this.eventBus._emit("changeMode", event);
    }
    onChangeWrapLimit(event, session) {
        this.renderer.updateFull();
    }
    onChangeWrapMode(event, session) {
        this.renderer.onResize(true);
    }
    onChangeFold(event, session) {
        this.$updateHighlightActiveLine();
        this.renderer.updateFull();
    }
    getSelectedText() {
        return this.session.getTextRange(this.getSelectionRange());
    }
    getCopyText() {
        var text = this.getSelectedText();
        this.eventBus._signal("copy", text);
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
        this.eventBus._signal("paste", e);
        this.insert(e.text, true);
    }
    execCommand(command, args) {
        this.commands.exec(command, this, args);
    }
    insert(text, pasted) {
        var session = this.session;
        var mode = session.getMode();
        var cursor = this.getCursorPosition();
        var transform;
        if (this.getBehavioursEnabled() && !pasted) {
            transform = mode && mode.transformAction(session.getState(cursor.row), 'insertion', this, session, text);
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
            if (transform.selection.length === 2) {
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
    on(eventName, callback, capturing) {
        this.eventBus.on(eventName, callback, capturing);
    }
    off(eventName, callback) {
        this.eventBus.off(eventName, callback);
    }
    setDefaultHandler(eventName, callback) {
        this.eventBus.setDefaultHandler(eventName, callback);
    }
    _emit(eventName, event) {
        this.eventBus._emit(eventName, event);
    }
    _signal(eventName, event) {
        this.eventBus._signal(eventName, event);
    }
    hasListeners(eventName) {
        return this.eventBus.hasListeners(eventName);
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
            if (direction === "left")
                this.selection.selectLeft();
            else
                this.selection.selectRight();
        }
        var selectionRange = this.getSelectionRange();
        if (this.getBehavioursEnabled()) {
            var session = this.session;
            var state = session.getState(selectionRange.start.row);
            var newRange = session.getMode().transformAction(state, 'deletion', this, session, selectionRange);
            if (selectionRange.end.column === 0) {
                var text = session.getTextRange(selectionRange);
                if (text[text.length - 1] === "\n") {
                    var line = session.getLine(selectionRange.end.row);
                    if (/^\s+$/.test(line)) {
                        selectionRange.end.column = line.length;
                    }
                }
            }
            if (newRange) {
                selectionRange = newRange;
            }
        }
        this.session.remove(selectionRange);
        this.clearSelection();
    }
    removeWordRight() {
        if (this.selection.isEmpty()) {
            this.selection.selectWordRight();
        }
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
        this.insert("\n", false);
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
            while (line[range.start.column] === " " && count) {
                range.start.column--;
                count--;
            }
            this.selection.setSelectionRange(range);
            indentString = "\t";
        }
        return this.insert(indentString, false);
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
    moveCursorToPosition(position) {
        return this.selection.moveCursorToPosition(position);
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
    find(needle, options = {}, animate) {
        if (typeof needle === "string" || needle instanceof RegExp) {
            options.needle = needle;
        }
        else if (typeof needle == "object") {
            mixin(options, needle);
        }
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
        if (!options.start) {
            this.$search.set({ start: range.start });
        }
        var newRange = this.$search.find(this.session);
        if (options.preventScroll) {
            return newRange;
        }
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
        if (animate !== false) {
            this.renderer.animateScrolling(scrollTop);
        }
    }
    undo() {
        this.$blockScrolling++;
        this.session.getUndoManager().undo();
        this.$blockScrolling--;
        this.renderer.scrollCursorIntoView(void 0, 0.5);
    }
    redo() {
        this.$blockScrolling++;
        this.session.getUndoManager().redo();
        this.$blockScrolling--;
        this.renderer.scrollCursorIntoView(void 0, 0.5);
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
        if (this.editor.hasListeners('mousemove')) {
            this.editor._emit(name, new EditorMouseEvent(e, this.editor));
        }
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
        if (this.editor.renderer.scroller['releaseCapture']) {
            this.editor.renderer.scroller['releaseCapture']();
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
        if (this.editor.renderer.scroller['setCapture']) {
            this.editor.renderer.scroller['setCapture']();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiRWRpdG9yLnRzIl0sIm5hbWVzIjpbIkVkaXRvciIsIkVkaXRvci5jb25zdHJ1Y3RvciIsIkVkaXRvci5jYW5jZWxNb3VzZUNvbnRleHRNZW51IiwiRWRpdG9yLnNlbGVjdGlvbiIsIkVkaXRvci4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycyIsIkVkaXRvci4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycy5sYXN0IiwiRWRpdG9yLnN0YXJ0T3BlcmF0aW9uIiwiRWRpdG9yLmVuZE9wZXJhdGlvbiIsIkVkaXRvci4kaGlzdG9yeVRyYWNrZXIiLCJFZGl0b3Iuc2V0S2V5Ym9hcmRIYW5kbGVyIiwiRWRpdG9yLmdldEtleWJvYXJkSGFuZGxlciIsIkVkaXRvci5zZXRTZXNzaW9uIiwiRWRpdG9yLmdldFNlc3Npb24iLCJFZGl0b3Iuc2V0VmFsdWUiLCJFZGl0b3IuZ2V0VmFsdWUiLCJFZGl0b3IuZ2V0U2VsZWN0aW9uIiwiRWRpdG9yLnJlc2l6ZSIsIkVkaXRvci5nZXRUaGVtZSIsIkVkaXRvci5zZXRTdHlsZSIsIkVkaXRvci51bnNldFN0eWxlIiwiRWRpdG9yLmdldEZvbnRTaXplIiwiRWRpdG9yLnNldEZvbnRTaXplIiwiRWRpdG9yLiRoaWdobGlnaHRCcmFja2V0cyIsIkVkaXRvci4kaGlnaGxpZ2h0VGFncyIsIkVkaXRvci5mb2N1cyIsIkVkaXRvci5pc0ZvY3VzZWQiLCJFZGl0b3IuYmx1ciIsIkVkaXRvci5vbkZvY3VzIiwiRWRpdG9yLm9uQmx1ciIsIkVkaXRvci4kY3Vyc29yQ2hhbmdlIiwiRWRpdG9yLm9uRG9jdW1lbnRDaGFuZ2UiLCJFZGl0b3Iub25Ub2tlbml6ZXJVcGRhdGUiLCJFZGl0b3Iub25TY3JvbGxUb3BDaGFuZ2UiLCJFZGl0b3Iub25TY3JvbGxMZWZ0Q2hhbmdlIiwiRWRpdG9yLm9uQ3Vyc29yQ2hhbmdlIiwiRWRpdG9yLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lIiwiRWRpdG9yLm9uU2VsZWN0aW9uQ2hhbmdlIiwiRWRpdG9yLiRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAiLCJFZGl0b3Iub25DaGFuZ2VGcm9udE1hcmtlciIsIkVkaXRvci51cGRhdGVGcm9udE1hcmtlcnMiLCJFZGl0b3Iub25DaGFuZ2VCYWNrTWFya2VyIiwiRWRpdG9yLnVwZGF0ZUJhY2tNYXJrZXJzIiwiRWRpdG9yLm9uQ2hhbmdlQnJlYWtwb2ludCIsIkVkaXRvci5vbkNoYW5nZUFubm90YXRpb24iLCJFZGl0b3Iub25DaGFuZ2VNb2RlIiwiRWRpdG9yLm9uQ2hhbmdlV3JhcExpbWl0IiwiRWRpdG9yLm9uQ2hhbmdlV3JhcE1vZGUiLCJFZGl0b3Iub25DaGFuZ2VGb2xkIiwiRWRpdG9yLmdldFNlbGVjdGVkVGV4dCIsIkVkaXRvci5nZXRDb3B5VGV4dCIsIkVkaXRvci5vbkNvcHkiLCJFZGl0b3Iub25DdXQiLCJFZGl0b3Iub25QYXN0ZSIsIkVkaXRvci5leGVjQ29tbWFuZCIsIkVkaXRvci5pbnNlcnQiLCJFZGl0b3Iub24iLCJFZGl0b3Iub2ZmIiwiRWRpdG9yLnNldERlZmF1bHRIYW5kbGVyIiwiRWRpdG9yLl9lbWl0IiwiRWRpdG9yLl9zaWduYWwiLCJFZGl0b3IuaGFzTGlzdGVuZXJzIiwiRWRpdG9yLm9uVGV4dElucHV0IiwiRWRpdG9yLm9uQ29tbWFuZEtleSIsIkVkaXRvci5zZXRPdmVyd3JpdGUiLCJFZGl0b3IuZ2V0T3ZlcndyaXRlIiwiRWRpdG9yLnRvZ2dsZU92ZXJ3cml0ZSIsIkVkaXRvci5zZXRTY3JvbGxTcGVlZCIsIkVkaXRvci5nZXRTY3JvbGxTcGVlZCIsIkVkaXRvci5zZXREcmFnRGVsYXkiLCJFZGl0b3IuZ2V0RHJhZ0RlbGF5IiwiRWRpdG9yLnNldFNlbGVjdGlvblN0eWxlIiwiRWRpdG9yLmdldFNlbGVjdGlvblN0eWxlIiwiRWRpdG9yLnNldEhpZ2hsaWdodEFjdGl2ZUxpbmUiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5zZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiRWRpdG9yLmdldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJFZGl0b3Iuc2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkIiwiRWRpdG9yLmdldEhpZ2hsaWdodFNlbGVjdGVkV29yZCIsIkVkaXRvci5zZXRBbmltYXRlZFNjcm9sbCIsIkVkaXRvci5nZXRBbmltYXRlZFNjcm9sbCIsIkVkaXRvci5zZXRTaG93SW52aXNpYmxlcyIsIkVkaXRvci5nZXRTaG93SW52aXNpYmxlcyIsIkVkaXRvci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiRWRpdG9yLmdldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJFZGl0b3Iuc2V0U2hvd1ByaW50TWFyZ2luIiwiRWRpdG9yLmdldFNob3dQcmludE1hcmdpbiIsIkVkaXRvci5zZXRQcmludE1hcmdpbkNvbHVtbiIsIkVkaXRvci5nZXRQcmludE1hcmdpbkNvbHVtbiIsIkVkaXRvci5zZXRSZWFkT25seSIsIkVkaXRvci5nZXRSZWFkT25seSIsIkVkaXRvci5zZXRCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5nZXRCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5zZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQiLCJFZGl0b3IuZ2V0V3JhcEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLnNldFNob3dGb2xkV2lkZ2V0cyIsIkVkaXRvci5nZXRTaG93Rm9sZFdpZGdldHMiLCJFZGl0b3Iuc2V0RmFkZUZvbGRXaWRnZXRzIiwiRWRpdG9yLmdldEZhZGVGb2xkV2lkZ2V0cyIsIkVkaXRvci5yZW1vdmUiLCJFZGl0b3IucmVtb3ZlV29yZFJpZ2h0IiwiRWRpdG9yLnJlbW92ZVdvcmRMZWZ0IiwiRWRpdG9yLnJlbW92ZVRvTGluZVN0YXJ0IiwiRWRpdG9yLnJlbW92ZVRvTGluZUVuZCIsIkVkaXRvci5zcGxpdExpbmUiLCJFZGl0b3IudHJhbnNwb3NlTGV0dGVycyIsIkVkaXRvci50b0xvd2VyQ2FzZSIsIkVkaXRvci50b1VwcGVyQ2FzZSIsIkVkaXRvci5pbmRlbnQiLCJFZGl0b3IuYmxvY2tJbmRlbnQiLCJFZGl0b3IuYmxvY2tPdXRkZW50IiwiRWRpdG9yLnNvcnRMaW5lcyIsIkVkaXRvci50b2dnbGVDb21tZW50TGluZXMiLCJFZGl0b3IudG9nZ2xlQmxvY2tDb21tZW50IiwiRWRpdG9yLmdldE51bWJlckF0IiwiRWRpdG9yLm1vZGlmeU51bWJlciIsIkVkaXRvci5yZW1vdmVMaW5lcyIsIkVkaXRvci5kdXBsaWNhdGVTZWxlY3Rpb24iLCJFZGl0b3IubW92ZUxpbmVzRG93biIsIkVkaXRvci5tb3ZlTGluZXNVcCIsIkVkaXRvci5tb3ZlVGV4dCIsIkVkaXRvci5jb3B5TGluZXNVcCIsIkVkaXRvci5jb3B5TGluZXNEb3duIiwiRWRpdG9yLiRtb3ZlTGluZXMiLCJFZGl0b3IuJGdldFNlbGVjdGVkUm93cyIsIkVkaXRvci5vbkNvbXBvc2l0aW9uU3RhcnQiLCJFZGl0b3Iub25Db21wb3NpdGlvblVwZGF0ZSIsIkVkaXRvci5vbkNvbXBvc2l0aW9uRW5kIiwiRWRpdG9yLmdldEZpcnN0VmlzaWJsZVJvdyIsIkVkaXRvci5nZXRMYXN0VmlzaWJsZVJvdyIsIkVkaXRvci5pc1Jvd1Zpc2libGUiLCJFZGl0b3IuaXNSb3dGdWxseVZpc2libGUiLCJFZGl0b3IuJGdldFZpc2libGVSb3dDb3VudCIsIkVkaXRvci4kbW92ZUJ5UGFnZSIsIkVkaXRvci5zZWxlY3RQYWdlRG93biIsIkVkaXRvci5zZWxlY3RQYWdlVXAiLCJFZGl0b3IuZ290b1BhZ2VEb3duIiwiRWRpdG9yLmdvdG9QYWdlVXAiLCJFZGl0b3Iuc2Nyb2xsUGFnZURvd24iLCJFZGl0b3Iuc2Nyb2xsUGFnZVVwIiwiRWRpdG9yLnNjcm9sbFRvUm93IiwiRWRpdG9yLnNjcm9sbFRvTGluZSIsIkVkaXRvci5jZW50ZXJTZWxlY3Rpb24iLCJFZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24iLCJFZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW4iLCJFZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UiLCJFZGl0b3Iuc2VsZWN0QWxsIiwiRWRpdG9yLmNsZWFyU2VsZWN0aW9uIiwiRWRpdG9yLm1vdmVDdXJzb3JUbyIsIkVkaXRvci5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbiIsIkVkaXRvci5qdW1wVG9NYXRjaGluZyIsIkVkaXRvci5nb3RvTGluZSIsIkVkaXRvci5uYXZpZ2F0ZVRvIiwiRWRpdG9yLm5hdmlnYXRlVXAiLCJFZGl0b3IubmF2aWdhdGVEb3duIiwiRWRpdG9yLm5hdmlnYXRlTGVmdCIsIkVkaXRvci5uYXZpZ2F0ZVJpZ2h0IiwiRWRpdG9yLm5hdmlnYXRlTGluZVN0YXJ0IiwiRWRpdG9yLm5hdmlnYXRlTGluZUVuZCIsIkVkaXRvci5uYXZpZ2F0ZUZpbGVFbmQiLCJFZGl0b3IubmF2aWdhdGVGaWxlU3RhcnQiLCJFZGl0b3IubmF2aWdhdGVXb3JkUmlnaHQiLCJFZGl0b3IubmF2aWdhdGVXb3JkTGVmdCIsIkVkaXRvci5yZXBsYWNlIiwiRWRpdG9yLnJlcGxhY2VBbGwiLCJFZGl0b3IuJHRyeVJlcGxhY2UiLCJFZGl0b3IuZ2V0TGFzdFNlYXJjaE9wdGlvbnMiLCJFZGl0b3IuZmluZCIsIkVkaXRvci5maW5kTmV4dCIsIkVkaXRvci5maW5kUHJldmlvdXMiLCJFZGl0b3IucmV2ZWFsUmFuZ2UiLCJFZGl0b3IudW5kbyIsIkVkaXRvci5yZWRvIiwiRWRpdG9yLmRlc3Ryb3kiLCJFZGl0b3Iuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3IiwiRWRpdG9yLiRyZXNldEN1cnNvclN0eWxlIiwiRm9sZEhhbmRsZXIiLCJGb2xkSGFuZGxlci5jb25zdHJ1Y3RvciIsIk1vdXNlSGFuZGxlciIsIk1vdXNlSGFuZGxlci5jb25zdHJ1Y3RvciIsIk1vdXNlSGFuZGxlci5vbk1vdXNlRXZlbnQiLCJNb3VzZUhhbmRsZXIub25Nb3VzZU1vdmUiLCJNb3VzZUhhbmRsZXIuZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudCIsIk1vdXNlSGFuZGxlci5zZXRTdGF0ZSIsIk1vdXNlSGFuZGxlci50ZXh0Q29vcmRpbmF0ZXMiLCJNb3VzZUhhbmRsZXIuY2FwdHVyZU1vdXNlIiwiTW91c2VIYW5kbGVyLmNhbmNlbENvbnRleHRNZW51IiwiTW91c2VIYW5kbGVyLnNlbGVjdCIsIk1vdXNlSGFuZGxlci5zZWxlY3RCeUxpbmVzRW5kIiwiTW91c2VIYW5kbGVyLnN0YXJ0U2VsZWN0IiwiTW91c2VIYW5kbGVyLnNlbGVjdEVuZCIsIk1vdXNlSGFuZGxlci5zZWxlY3RBbGxFbmQiLCJNb3VzZUhhbmRsZXIuc2VsZWN0QnlXb3Jkc0VuZCIsIk1vdXNlSGFuZGxlci5mb2N1c1dhaXQiLCJFZGl0b3JNb3VzZUV2ZW50IiwiRWRpdG9yTW91c2VFdmVudC5jb25zdHJ1Y3RvciIsIkVkaXRvck1vdXNlRXZlbnQudG9FbGVtZW50IiwiRWRpdG9yTW91c2VFdmVudC5zdG9wUHJvcGFnYXRpb24iLCJFZGl0b3JNb3VzZUV2ZW50LnByZXZlbnREZWZhdWx0IiwiRWRpdG9yTW91c2VFdmVudC5zdG9wIiwiRWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uIiwiRWRpdG9yTW91c2VFdmVudC5pblNlbGVjdGlvbiIsIkVkaXRvck1vdXNlRXZlbnQuZ2V0QnV0dG9uIiwiRWRpdG9yTW91c2VFdmVudC5nZXRTaGlmdEtleSIsIm1ha2VNb3VzZURvd25IYW5kbGVyIiwibWFrZU1vdXNlV2hlZWxIYW5kbGVyIiwibWFrZURvdWJsZUNsaWNrSGFuZGxlciIsIm1ha2VUcmlwbGVDbGlja0hhbmRsZXIiLCJtYWtlUXVhZENsaWNrSGFuZGxlciIsIm1ha2VFeHRlbmRTZWxlY3Rpb25CeSIsImNhbGNEaXN0YW5jZSIsImNhbGNSYW5nZU9yaWVudGF0aW9uIiwiR3V0dGVySGFuZGxlciIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3IiLCJHdXR0ZXJIYW5kbGVyLmNvbnN0cnVjdG9yLnNob3dUb29sdGlwIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3Rvci5oaWRlVG9vbHRpcCIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3IubW92ZVRvb2x0aXAiLCJHdXR0ZXJUb29sdGlwIiwiR3V0dGVyVG9vbHRpcC5jb25zdHJ1Y3RvciIsIkd1dHRlclRvb2x0aXAuc2V0UG9zaXRpb24iXSwibWFwcGluZ3MiOiJBQW9EQSxZQUFZLENBQUM7T0FFTixFQUFDLEtBQUssRUFBQyxNQUFNLFdBQVc7T0FDeEIsRUFBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBQyxNQUFNLFdBQVc7T0FDMUQsRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUMsTUFBTSxpQkFBaUI7T0FHakUsVUFBVSxNQUFNLHVCQUF1QjtPQUN2QyxTQUFTLE1BQU0sc0JBQXNCO09BSXJDLE1BQU0sTUFBTSxVQUFVO09BR3RCLEtBQUssTUFBTSxTQUFTO09BSXBCLGlCQUFpQixNQUFNLHlCQUF5QjtPQUVoRCxjQUFjLE1BQU0sMkJBQTJCO09BQy9DLGVBQWUsTUFBTSw2QkFBNkI7T0FDbEQsRUFBQyxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDekQsYUFBYSxNQUFNLGlCQUFpQjtPQUNwQyxFQUFDLDBCQUEwQixFQUFDLE1BQU0sbUJBQW1CO09BS3JELEVBQUMsV0FBVyxFQUFFLHFCQUFxQixFQUFFLHlCQUF5QixFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUMsTUFBTSxhQUFhO09BQ2xKLEVBQUMsWUFBWSxFQUFDLE1BQU0sZUFBZTtPQUVuQyxPQUFPLE1BQU0sV0FBVztBQVMvQjtJQTZGSUEsWUFBWUEsUUFBeUJBLEVBQUVBLE9BQW9CQTtRQUN2REMsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsaUJBQWlCQSxDQUFTQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBLENBQUNBLE1BQU1BLEdB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R0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLElBQUlBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxLQUFLQSxTQUFTQSxDQUFDQTtnQkFDcENBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFakNBLFdBQVdBLEdBQUdBLFdBQVdBO21CQUNsQkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQTttQkFDckJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBRWxEQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2pDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxXQUFXQSxHQUFHQSxXQUFXQTttQkFDbEJBLGlCQUFpQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQ0NBLElBQUlBLENBQUNBLGdCQUFnQkEsSUFBSUEsUUFBUUE7ZUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFDN0NBLENBQUNBLENBQUNBLENBQUNBO1lBQ0NBLFdBQVdB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QUFtQkEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM5REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRXpEQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUV6REEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdERBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7WUFFcERBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRXZEQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUV6REEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7WUFDeENBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLGNBQWNBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBRXhEQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUU5REEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUMxQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFFMUJBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFFOUNBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFFL0NBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLElBQUlBLENBQUNBLGtCQUFr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RUFBRUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9FQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUN0QkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxJQUFJQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsREEsSUFBSUEsS0FBS0EsR0FBVUEsSUFBSUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDdkZBLEtBQUtBLENBQUNBLFFBQVFBLEdBQUdBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLEVBQUVBLGlCQUFpQkEsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7WUFDM0VBLE9BQU9BLENBQUNBLG9CQUFvQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxPQUFPQSxDQUFDQSxvQkFBb0JBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3ZEQSxPQUFPQSxDQUFD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QUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0Q0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzRUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7UUFFdEJBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQzFCQSxJQUFJQSxTQUFTQSxHQUFHQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM3Q0EsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLElBQUlBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzdEQSxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUV2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsSUFBSUEsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUM1QkEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDaERBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLEdBQUdBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pEQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUM1QkEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDekNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEVBQ3RCQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUNuQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckNBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hDQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3pHQSxPQUFPQSxD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TUFBTUEsQ0FBQ0E7WUFDbEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQU1EakgsWUFBWUEsQ0FBQ0EsTUFBY0E7UUFDdkJrSCxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUN6Q0EsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFHL0NBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRXhEQSxJQUFJQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUV6REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFM0JBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBRXZDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDTEEsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ3BGQSxJQUFJQSxRQUFRQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFFL0NBLElBQUlBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUM3QkEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBRzVCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDL0JBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNoREEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUNKQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDNUNBLENBQUNBO2dCQUVEQSxDQUFDQSxJQUFJQSxNQUFNQSxDQUFDQTtnQkFDWkEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzVCQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFHOUJBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLEtBQUtBLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN6REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBR3hDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUxRkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRGxILFdBQVdBO1FBQ1BtSCxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO1FBQ25DQSxJQUFJQSxLQUFLQSxDQUFDQTtRQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUM3REEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQ2JBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLEVBQzNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxD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UUFFRkEsR0FBR0EsQ0FBQ0E7WUFDQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDM0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsUUFBUUEsQ0FBQ0E7b0JBQ2JBLENBQUNBO29CQUVEQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFFdEZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3JCQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDVEEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBOzRCQUNKQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFDckJBLEtBQUtBLENBQUNBO3dCQUNWQSxLQUFLQSxH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LENBQUNBO2dDQUNsQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7NEJBQ2pCQSxDQUFDQTs0QkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0NBQ2pCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTt3QkFDckJBLENBQUNBO29CQUNMQSxDQUFDQTtnQkFDTEEsQ0FBQ0EsUUFBUUEsU0FBU0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUE7WUFDbENBLENBQUNBO1lBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQ0EsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDbEVBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3hCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxHQUFHQSxHQUFHQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDTkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0Es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LENBQUNBLENBQUNBO1lBQ1ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUNoREEsSUFBSUEsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2ZBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1FBRXBCQSxJQUFJQSxDQUFDQSxlQUFlQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUxQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUN6Q0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFNUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDM0NBLFFBQVFBLEVBQUVBLENBQUNBO1lBQ2ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1FBRTFCQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFT25LLFdBQVdBLENBQUNBLEtBQVlBLEVBQUVBLFdBQW1CQTtRQUNqRG9LLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQzdDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUN2REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNqQkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO0lBQ0xBLENBQUNBO0lBTURwSyxvQkFBb0JBO1FBQ2hCcUssTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7SUFDckNBLENBQUNBO0lBWURySyxJQUFJQSxDQUFDQSxNQUF5QkEsRUFBRUEsT0FBT0EsR0FBa0JBLEVBQUVBLEVBQUVBLE9BQWlCQTtRQUUxRXNLLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLEtBQUtBLFFBQVFBLElBQUlBLE1BQU1BLFlBQVlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3pEQSxPQUFPQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLEtBQUtBLENBQUNBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQzNCQSxDQUFDQTtRQUVEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekJBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1lBQzFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZFQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVqQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDN0NB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LFFBQVFBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxZQUFZQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNsREEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVEWCxTQUFTQTtRQUNMWSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVEWixZQUFZQTtRQUNSYSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVEYixnQkFBZ0JBO1FBQ1pjLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBRURkLFNBQVNBO1FBQ0xlLElBQUlBLFFBQVFBLEdBQUdBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ2xIQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUV0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsR0FBR0EsV0FBV0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDaEVBLENBQUNBO0lBQ0xBLENB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Q0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeEZBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUMvREEsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDVkEsTUFBTUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDdERBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLE1BQU1BLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO0lBQ3REQSxDQUFDQTtBQUNMQSxDQUFDQTtBQUVEO0lBQ0lDLFlBQVlBLFlBQTBCQTtRQUNsQ0MsSUFBSUEsTUFBTUEsR0FBV0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDekNBLElBQUlBLE1BQU1BLEdBQVdBLE1BQU1BLENBQUNB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c2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cbi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7bWl4aW59IGZyb20gXCIuL2xpYi9vb3BcIjtcbmltcG9ydCB7Y29tcHV0ZWRTdHlsZSwgaGFzQ3NzQ2xhc3MsIHNldENzc0NsYXNzfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQge2RlbGF5ZWRDYWxsLCBzdHJpbmdSZXBlYXR9IGZyb20gXCIuL2xpYi9sYW5nXCI7XG5pbXBvcnQge2lzSUUsIGlzTWFjLCBpc01vYmlsZSwgaXNPbGRJRSwgaXNXZWJLaXR9IGZyb20gXCIuL2xpYi91c2VyYWdlbnRcIjtcbmltcG9ydCBHdXR0ZXIgZnJvbSBcIi4vbGF5ZXIvR3V0dGVyXCI7XG5pbXBvcnQgSGFzaEhhbmRsZXIgZnJvbSBcIi4va2V5Ym9hcmQvSGFzaEhhbmRsZXJcIjtcbmltcG9ydCBLZXlCaW5kaW5nIGZyb20gXCIuL2tleWJvYXJkL0tleUJpbmRpbmdcIjtcbmltcG9ydCBUZXh0SW5wdXQgZnJvbSBcIi4va2V5Ym9hcmQvVGV4dElucHV0XCI7XG5pbXBvcnQgRGVsdGEgZnJvbSBcIi4vRGVsdGFcIjtcbmltcG9ydCBEZWx0YUV2ZW50IGZyb20gXCIuL0RlbHRhRXZlbnRcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi9FZGl0U2Vzc2lvblwiO1xuaW1wb3J0IFNlYXJjaCBmcm9tIFwiLi9TZWFyY2hcIjtcbmltcG9ydCBGaXJzdEFuZExhc3QgZnJvbSBcIi4vRmlyc3RBbmRMYXN0XCI7XG5pbXBvcnQgUG9zaXRpb24gZnJvbSBcIi4vUG9zaXRpb25cIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IFRleHRBbmRTZWxlY3Rpb24gZnJvbSBcIi4vVGV4dEFuZFNlbGVjdGlvblwiO1xuaW1wb3J0IEN1cnNvclJhbmdlIGZyb20gJy4vQ3Vyc29yUmFuZ2UnO1xuaW1wb3J0IEV2ZW50QnVzIGZyb20gXCIuL0V2ZW50QnVzXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL0V2ZW50RW1pdHRlckNsYXNzXCI7XG5pbXBvcnQgQ29tbWFuZCBmcm9tIFwiLi9jb21tYW5kcy9Db21tYW5kXCI7XG5pbXBvcnQgQ29tbWFuZE1hbmFnZXIgZnJvbSBcIi4vY29tbWFuZHMvQ29tbWFuZE1hbmFnZXJcIjtcbmltcG9ydCBkZWZhdWx0Q29tbWFuZHMgZnJvbSBcIi4vY29tbWFuZHMvZGVmYXVsdF9jb21tYW5kc1wiO1xuaW1wb3J0IHtkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IFRva2VuSXRlcmF0b3IgZnJvbSBcIi4vVG9rZW5JdGVyYXRvclwiO1xuaW1wb3J0IHtDT01NQU5EX05BTUVfQVVUT19DT01QTEVURX0gZnJvbSAnLi9lZGl0b3JfcHJvdG9jb2wnO1xuaW1wb3J0IFZpcnR1YWxSZW5kZXJlciBmcm9tICcuL1ZpcnR1YWxSZW5kZXJlcic7XG5pbXBvcnQge0NvbXBsZXRlcn0gZnJvbSBcIi4vYXV0b2NvbXBsZXRlXCI7XG5pbXBvcnQgU2VhcmNoT3B0aW9ucyBmcm9tICcuL1NlYXJjaE9wdGlvbnMnO1xuaW1wb3J0IFNlbGVjdGlvbiBmcm9tICcuL1NlbGVjdGlvbic7XG5pbXBvcnQge2FkZExpc3RlbmVyLCBhZGRNb3VzZVdoZWVsTGlzdGVuZXIsIGFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIsIGNhcHR1cmUsIGdldEJ1dHRvbiwgcHJldmVudERlZmF1bHQsIHN0b3BFdmVudCwgc3RvcFByb3BhZ2F0aW9ufSBmcm9tIFwiLi9saWIvZXZlbnRcIjtcbmltcG9ydCB7dG91Y2hNYW5hZ2VyfSBmcm9tICcuL3RvdWNoL3RvdWNoJztcbmltcG9ydCBUaGVtZUxpbmsgZnJvbSBcIi4vVGhlbWVMaW5rXCI7XG5pbXBvcnQgVG9vbHRpcCBmcm9tIFwiLi9Ub29sdGlwXCI7XG5cbi8vdmFyIERyYWdkcm9wSGFuZGxlciA9IHJlcXVpcmUoXCIuL21vdXNlL2RyYWdkcm9wX2hhbmRsZXJcIikuRHJhZ2Ryb3BIYW5kbGVyO1xuXG4vKipcbiAqIFRoZSBgRWRpdG9yYCBhY3RzIGFzIGEgY29udHJvbGxlciwgbWVkaWF0aW5nIGJldHdlZW4gdGhlIGVkaXRTZXNzaW9uIGFuZCByZW5kZXJlci5cbiAqXG4gKiBAY2xhc3MgRWRpdG9yXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVkaXRvciBpbXBsZW1lbnRzIEV2ZW50QnVzPEVkaXRvcj4ge1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IHJlbmRlcmVyXG4gICAgICogQHR5cGUgVmlydHVhbFJlbmRlcmVyXG4gICAgICovXG4gICAgcHVibGljIHJlbmRlcmVyOiBWaXJ0dWFsUmVuZGVyZXI7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgc2Vzc2lvblxuICAgICAqIEB0eXBlIEVkaXRTZXNzaW9uXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IGV2ZW50QnVzXG4gICAgICogQHR5cGUgRXZlbnRFbWl0dGVyQ2xhc3NcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgZXZlbnRCdXM6IEV2ZW50RW1pdHRlckNsYXNzPEVkaXRvcj47XG5cbiAgICBwcml2YXRlICR0b3VjaEhhbmRsZXI6IElHZXN0dXJlSGFuZGxlcjtcbiAgICBwcml2YXRlICRtb3VzZUhhbmRsZXI6IElHZXN0dXJlSGFuZGxlcjtcbiAgICBwdWJsaWMgZ2V0T3B0aW9uO1xuICAgIHB1YmxpYyBzZXRPcHRpb247XG4gICAgcHVibGljIHNldE9wdGlvbnM7XG4gICAgcHVibGljICRpc0ZvY3VzZWQ7XG4gICAgcHVibGljIGNvbW1hbmRzOiBDb21tYW5kTWFuYWdlcjtcbiAgICBwdWJsaWMga2V5QmluZGluZzogS2V5QmluZGluZztcbiAgICAvLyBGSVhNRTogVGhpcyBpcyByZWFsbHkgYW4gb3B0aW9uYWwgZXh0ZW5zaW9uIGFuZCBzbyBkb2VzIG5vdCBiZWxvbmcgaGVyZS5cbiAgICBwdWJsaWMgY29tcGxldGVyczogQ29tcGxldGVyW107XG5cbiAgICBwdWJsaWMgd2lkZ2V0TWFuYWdlcjtcblxuICAgIC8qKlxuICAgICAqIFRoZSByZW5kZXJlciBjb250YWluZXIgZWxlbWVudC5cbiAgICAgKi9cbiAgICBwdWJsaWMgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMgdGV4dElucHV0O1xuICAgIHB1YmxpYyBpbk11bHRpU2VsZWN0TW9kZTogYm9vbGVhbjtcbiAgICBwdWJsaWMgbXVsdGlTZWxlY3Q6IFNlbGVjdGlvbjtcbiAgICBwdWJsaWMgaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZTtcblxuICAgIHByaXZhdGUgJGN1cnNvclN0eWxlOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSAka2V5YmluZGluZ0lkO1xuICAgIHByaXZhdGUgJGJsb2NrU2Nyb2xsaW5nO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEFjdGl2ZUxpbmU7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0UGVuZGluZztcbiAgICBwcml2YXRlICRoaWdobGlnaHRTZWxlY3RlZFdvcmQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0VGFnUGVuZGluZztcbiAgICBwcml2YXRlICRtZXJnZVVuZG9EZWx0YXM7XG4gICAgcHVibGljICRyZWFkT25seTtcbiAgICBwcml2YXRlICRzY3JvbGxBbmNob3I7XG4gICAgcHJpdmF0ZSAkc2VhcmNoOiBTZWFyY2g7XG4gICAgcHJpdmF0ZSBfJGVtaXRJbnB1dEV2ZW50O1xuICAgIHByaXZhdGUgc2VsZWN0aW9uczogYW55W107XG4gICAgcHJpdmF0ZSAkc2VsZWN0aW9uU3R5bGU7XG4gICAgcHJpdmF0ZSAkb3BSZXNldFRpbWVyO1xuICAgIHByaXZhdGUgY3VyT3A7XG4gICAgcHJpdmF0ZSBwcmV2T3A6IHsgY29tbWFuZD87IGFyZ3M/fTtcbiAgICBwcml2YXRlIGxhc3RGaWxlSnVtcFBvcztcbiAgICBwcml2YXRlIHByZXZpb3VzQ29tbWFuZDtcbiAgICBwcml2YXRlICRtZXJnZWFibGVDb21tYW5kczogc3RyaW5nW107XG4gICAgcHJpdmF0ZSBtZXJnZU5leHRDb21tYW5kO1xuICAgIHByaXZhdGUgJG1lcmdlTmV4dENvbW1hbmQ7XG4gICAgcHJpdmF0ZSBzZXF1ZW5jZVN0YXJ0VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgJG9uRG9jdW1lbnRDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VNb2RlO1xuICAgIHByaXZhdGUgJG9uVG9rZW5pemVyVXBkYXRlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlVGFiU2l6ZTogKGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pID0+IGFueTtcbiAgICBwcml2YXRlICRvbkNoYW5nZVdyYXBMaW1pdDtcbiAgICBwcml2YXRlICRvbkNoYW5nZVdyYXBNb2RlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlRm9sZDtcbiAgICBwcml2YXRlICRvbkNoYW5nZUZyb250TWFya2VyO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlQmFja01hcmtlcjtcbiAgICBwcml2YXRlICRvbkNoYW5nZUJyZWFrcG9pbnQ7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VBbm5vdGF0aW9uO1xuICAgIHByaXZhdGUgJG9uQ3Vyc29yQ2hhbmdlO1xuICAgIHByaXZhdGUgJG9uU2Nyb2xsVG9wQ2hhbmdlO1xuICAgIHByaXZhdGUgJG9uU2Nyb2xsTGVmdENoYW5nZTtcbiAgICBwdWJsaWMgJG9uU2VsZWN0aW9uQ2hhbmdlOiAoZXZlbnQsIHNlbGVjdGlvbjogU2VsZWN0aW9uKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBleGl0TXVsdGlTZWxlY3RNb2RlO1xuICAgIHB1YmxpYyBmb3JFYWNoU2VsZWN0aW9uO1xuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBgRWRpdG9yYCBvYmplY3QuXG4gICAgICpcbiAgICAgKiBAY2xhc3MgRWRpdG9yXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIHJlbmRlcmVyIHtWaXJ0dWFsUmVuZGVyZXJ9IFRoZSB2aWV3LlxuICAgICAqIEBwYXJhbSBzZXNzaW9uIHtFZGl0U2Vzc2lvbn0gVGhlIG1vZGVsLlxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKHJlbmRlcmVyOiBWaXJ0dWFsUmVuZGVyZXIsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMgPSBuZXcgRXZlbnRFbWl0dGVyQ2xhc3M8RWRpdG9yPih0aGlzKTtcbiAgICAgICAgdGhpcy5jdXJPcCA9IG51bGw7XG4gICAgICAgIHRoaXMucHJldk9wID0ge307XG4gICAgICAgIHRoaXMuJG1lcmdlYWJsZUNvbW1hbmRzID0gW1wiYmFja3NwYWNlXCIsIFwiZGVsXCIsIFwiaW5zZXJ0c3RyaW5nXCJdO1xuICAgICAgICB0aGlzLmNvbW1hbmRzID0gbmV3IENvbW1hbmRNYW5hZ2VyKGlzTWFjID8gXCJtYWNcIiA6IFwid2luXCIsIGRlZmF1bHRDb21tYW5kcyk7XG4gICAgICAgIHRoaXMuY29udGFpbmVyID0gcmVuZGVyZXIuZ2V0Q29udGFpbmVyRWxlbWVudCgpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyID0gcmVuZGVyZXI7XG5cbiAgICAgICAgdGhpcy50ZXh0SW5wdXQgPSBuZXcgVGV4dElucHV0KHJlbmRlcmVyLmdldFRleHRBcmVhQ29udGFpbmVyKCksIHRoaXMpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnRleHRhcmVhID0gdGhpcy50ZXh0SW5wdXQuZ2V0RWxlbWVudCgpO1xuICAgICAgICB0aGlzLmtleUJpbmRpbmcgPSBuZXcgS2V5QmluZGluZyh0aGlzKTtcblxuICAgICAgICBpZiAoaXNNb2JpbGUpIHtcbiAgICAgICAgICAgIHRoaXMuJHRvdWNoSGFuZGxlciA9IHRvdWNoTWFuYWdlcih0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdXNlSGFuZGxlciA9IG5ldyBNb3VzZUhhbmRsZXIodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiR0b3VjaEhhbmRsZXIgPSB0b3VjaE1hbmFnZXIodGhpcyk7XG4gICAgICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIgPSBuZXcgTW91c2VIYW5kbGVyKHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgbmV3IEZvbGRIYW5kbGVyKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nID0gMDtcbiAgICAgICAgdGhpcy4kc2VhcmNoID0gbmV3IFNlYXJjaCgpLnNldCh7IHdyYXA6IHRydWUgfSk7XG5cbiAgICAgICAgdGhpcy4kaGlzdG9yeVRyYWNrZXIgPSB0aGlzLiRoaXN0b3J5VHJhY2tlci5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiZXhlY1wiLCB0aGlzLiRoaXN0b3J5VHJhY2tlcik7XG5cbiAgICAgICAgdGhpcy4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycygpO1xuXG4gICAgICAgIHRoaXMuXyRlbWl0SW5wdXRFdmVudCA9IGRlbGF5ZWRDYWxsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiaW5wdXRcIiwge30pO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmJnVG9rZW5pemVyICYmIHRoaXMuc2Vzc2lvbi5iZ1Rva2VuaXplci5zY2hlZHVsZVN0YXJ0KCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi5fJGVtaXRJbnB1dEV2ZW50LnNjaGVkdWxlKDMxKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5zZXRTZXNzaW9uKHNlc3Npb24pO1xuICAgICAgICByZXNldE9wdGlvbnModGhpcyk7XG4gICAgICAgIC8vIEZJWE1FOiBUaGlzIHdhcyBhIHNpZ25hbCB0byBhIGdsb2JhbCBjb25maWcgb2JqZWN0LlxuICAgICAgICAvLyBfc2lnbmFsKFwiZWRpdG9yXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIGNhbmNlbE1vdXNlQ29udGV4dE1lbnUoKSB7XG4gICAgICAgIHRoaXMuJG1vdXNlSGFuZGxlci5jYW5jZWxDb250ZXh0TWVudSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBzZWxlY3Rpb25cbiAgICAgKiBAdHlwZSBTZWxlY3Rpb25cbiAgICAgKi9cbiAgICBnZXQgc2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgfVxuICAgIHNldCBzZWxlY3Rpb24oc2VsZWN0aW9uOiBTZWxlY3Rpb24pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldFNlbGVjdGlvbihzZWxlY3Rpb24pO1xuICAgIH1cblxuICAgICRpbml0T3BlcmF0aW9uTGlzdGVuZXJzKCkge1xuXG4gICAgICAgIGZ1bmN0aW9uIGxhc3Q8VD4oYTogVFtdKTogVCB7IHJldHVybiBhW2EubGVuZ3RoIC0gMV0gfVxuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9ucyA9IFtdO1xuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiZXhlY1wiLCAoZTogeyBjb21tYW5kOiBDb21tYW5kIH0pID0+IHtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRPcGVyYXRpb24oZSk7XG5cbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gZS5jb21tYW5kO1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQuYWNlQ29tbWFuZEdyb3VwID09PSBcImZpbGVKdW1wXCIpIHtcbiAgICAgICAgICAgICAgICB2YXIgcHJldiA9IHRoaXMucHJldk9wO1xuICAgICAgICAgICAgICAgIGlmICghcHJldiB8fCBwcmV2LmNvbW1hbmQuYWNlQ29tbWFuZEdyb3VwICE9PSBcImZpbGVKdW1wXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXN0RmlsZUp1bXBQb3MgPSBsYXN0KHRoaXMuc2VsZWN0aW9ucyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RGaWxlSnVtcFBvcyA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHRoaXMuY29tbWFuZHMub24oXCJhZnRlckV4ZWNcIiwgKGU6IHsgY29tbWFuZDogQ29tbWFuZCB9LCBjbTogQ29tbWFuZE1hbmFnZXIpID0+IHtcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gZS5jb21tYW5kO1xuXG4gICAgICAgICAgICBpZiAoY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgPT09IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmxhc3RGaWxlSnVtcFBvcyAmJiAhdGhpcy5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLmZyb21KU09OKHRoaXMubGFzdEZpbGVKdW1wUG9zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVuZE9wZXJhdGlvbihlKTtcbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy4kb3BSZXNldFRpbWVyID0gZGVsYXllZENhbGwodGhpcy5lbmRPcGVyYXRpb24uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihcImNoYW5nZVwiLCAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmN1ck9wIHx8IHRoaXMuc3RhcnRPcGVyYXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AuZG9jQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jdXJPcCB8fCB0aGlzLnN0YXJ0T3BlcmF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9LCB0cnVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHByaXZhdGUgc3RhcnRPcGVyYXRpb24oY29tbWFuZEV2ZW50Pykge1xuICAgICAgICBpZiAodGhpcy5jdXJPcCkge1xuICAgICAgICAgICAgaWYgKCFjb21tYW5kRXZlbnQgfHwgdGhpcy5jdXJPcC5jb21tYW5kKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMucHJldk9wID0gdGhpcy5jdXJPcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWNvbW1hbmRFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5wcmV2aW91c0NvbW1hbmQgPSBudWxsO1xuICAgICAgICAgICAgY29tbWFuZEV2ZW50ID0ge307XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRvcFJlc2V0VGltZXIuc2NoZWR1bGUoKTtcbiAgICAgICAgdGhpcy5jdXJPcCA9IHtcbiAgICAgICAgICAgIGNvbW1hbmQ6IGNvbW1hbmRFdmVudC5jb21tYW5kIHx8IHt9LFxuICAgICAgICAgICAgYXJnczogY29tbWFuZEV2ZW50LmFyZ3MsXG4gICAgICAgICAgICBzY3JvbGxUb3A6IHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9wXG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIGNvbW1hbmQgPSB0aGlzLmN1ck9wLmNvbW1hbmQ7XG4gICAgICAgIGlmIChjb21tYW5kICYmIGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcpXG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9ucy5wdXNoKHRoaXMuc2VsZWN0aW9uLnRvSlNPTigpKTtcbiAgICB9XG5cbiAgICAvLyBGSVhNRTogVGhpcyBwcm9iYWJseSBkb2Vzbid0IHJlcXVpcmUgdGhlIGFyZ3VtZW50LlxuICAgIGVuZE9wZXJhdGlvbih1bnVzZWQ/OiBhbnkpIHtcbiAgICAgICAgaWYgKHRoaXMuY3VyT3ApIHtcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gdGhpcy5jdXJPcC5jb21tYW5kO1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQgJiYgY29tbWFuZC5zY3JvbGxJbnRvVmlldykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgICAgICAgICAgc3dpdGNoIChjb21tYW5kLnNjcm9sbEludG9WaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJjZW50ZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiYW5pbWF0ZVwiOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiY3Vyc29yXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcInNlbGVjdGlvblBhcnRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5yZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPj0gY29uZmlnLmxhc3RSb3cgfHwgcmFuZ2UuZW5kLnJvdyA8PSBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3KHRoaXMuc2VsZWN0aW9uLmFuY2hvciwgdGhpcy5zZWxlY3Rpb24ubGVhZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoY29tbWFuZC5zY3JvbGxJbnRvVmlldyA9PSBcImFuaW1hdGVcIilcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nKHRoaXMuY3VyT3Auc2Nyb2xsVG9wKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wcmV2T3AgPSB0aGlzLmN1ck9wO1xuICAgICAgICAgICAgdGhpcy5jdXJPcCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkaGlzdG9yeVRyYWNrZXIoZTogeyBjb21tYW5kOyBhcmdzIH0pIHtcbiAgICAgICAgaWYgKCF0aGlzLiRtZXJnZVVuZG9EZWx0YXMpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHByZXYgPSB0aGlzLnByZXZPcDtcbiAgICAgICAgdmFyIG1lcmdlYWJsZUNvbW1hbmRzID0gdGhpcy4kbWVyZ2VhYmxlQ29tbWFuZHM7XG4gICAgICAgIC8vIHByZXZpb3VzIGNvbW1hbmQgd2FzIHRoZSBzYW1lXG4gICAgICAgIHZhciBzaG91bGRNZXJnZSA9IHByZXYuY29tbWFuZCAmJiAoZS5jb21tYW5kLm5hbWUgPT0gcHJldi5jb21tYW5kLm5hbWUpO1xuICAgICAgICBpZiAoZS5jb21tYW5kLm5hbWUgPT0gXCJpbnNlcnRzdHJpbmdcIikge1xuICAgICAgICAgICAgdmFyIHRleHQgPSBlLmFyZ3M7XG4gICAgICAgICAgICBpZiAodGhpcy5tZXJnZU5leHRDb21tYW5kID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgdGhpcy5tZXJnZU5leHRDb21tYW5kID0gdHJ1ZTtcblxuICAgICAgICAgICAgc2hvdWxkTWVyZ2UgPSBzaG91bGRNZXJnZVxuICAgICAgICAgICAgICAgICYmIHRoaXMubWVyZ2VOZXh0Q29tbWFuZCAvLyBwcmV2aW91cyBjb21tYW5kIGFsbG93cyB0byBjb2FsZXNjZSB3aXRoXG4gICAgICAgICAgICAgICAgJiYgKCEvXFxzLy50ZXN0KHRleHQpIHx8IC9cXHMvLnRlc3QocHJldi5hcmdzKSk7IC8vIHByZXZpb3VzIGluc2VydGlvbiB3YXMgb2Ygc2FtZSB0eXBlXG5cbiAgICAgICAgICAgIHRoaXMubWVyZ2VOZXh0Q29tbWFuZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IHNob3VsZE1lcmdlXG4gICAgICAgICAgICAgICAgJiYgbWVyZ2VhYmxlQ29tbWFuZHMuaW5kZXhPZihlLmNvbW1hbmQubmFtZSkgIT09IC0xOyAvLyB0aGUgY29tbWFuZCBpcyBtZXJnZWFibGVcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuJG1lcmdlVW5kb0RlbHRhcyAhPSBcImFsd2F5c1wiXG4gICAgICAgICAgICAmJiBEYXRlLm5vdygpIC0gdGhpcy5zZXF1ZW5jZVN0YXJ0VGltZSA+IDIwMDBcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IGZhbHNlOyAvLyB0aGUgc2VxdWVuY2UgaXMgdG9vIGxvbmdcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzaG91bGRNZXJnZSlcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5tZXJnZVVuZG9EZWx0YXMgPSB0cnVlO1xuICAgICAgICBlbHNlIGlmIChtZXJnZWFibGVDb21tYW5kcy5pbmRleE9mKGUuY29tbWFuZC5uYW1lKSAhPT0gLTEpXG4gICAgICAgICAgICB0aGlzLnNlcXVlbmNlU3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IGtleSBoYW5kbGVyLCBzdWNoIGFzIFwidmltXCIgb3IgXCJ3aW5kb3dzXCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEtleWJvYXJkSGFuZGxlclxuICAgICAqIEBwYXJhbSBrZXlib2FyZEhhbmRsZXIge3N0cmluZyB8IEhhc2hIYW5kbGVyfSBUaGUgbmV3IGtleSBoYW5kbGVyLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0S2V5Ym9hcmRIYW5kbGVyKGtleWJvYXJkSGFuZGxlcjogc3RyaW5nIHwgSGFzaEhhbmRsZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKCFrZXlib2FyZEhhbmRsZXIpIHtcbiAgICAgICAgICAgIHRoaXMua2V5QmluZGluZy5zZXRLZXlib2FyZEhhbmRsZXIobnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIGtleWJvYXJkSGFuZGxlciA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdGhpcy4ka2V5YmluZGluZ0lkID0ga2V5Ym9hcmRIYW5kbGVyO1xuICAgICAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoW1wia2V5YmluZGluZ1wiLCBrZXlib2FyZEhhbmRsZXJdLCBmdW5jdGlvbihtb2R1bGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoX3NlbGYuJGtleWJpbmRpbmdJZCA9PSBrZXlib2FyZEhhbmRsZXIpXG4gICAgICAgICAgICAgICAgICAgIF9zZWxmLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKG1vZHVsZSAmJiBtb2R1bGUuaGFuZGxlcik7XG4gICAgICAgICAgICB9LCB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGtleWJpbmRpbmdJZCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKGtleWJvYXJkSGFuZGxlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBrZXlib2FyZCBoYW5kbGVyLCBzdWNoIGFzIFwidmltXCIgb3IgXCJ3aW5kb3dzXCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEtleWJvYXJkSGFuZGxlclxuICAgICAqIEByZXR1cm4ge0hhc2hIYW5kbGVyfVxuICAgICAqL1xuICAgIGdldEtleWJvYXJkSGFuZGxlcigpOiBIYXNoSGFuZGxlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmtleUJpbmRpbmcuZ2V0S2V5Ym9hcmRIYW5kbGVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyBFZGl0U2Vzc2lvbiB0byB1c2UuXG4gICAgICogVGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZXNzaW9uJ2AgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNlc3Npb25cbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259IFRoZSBuZXcgc2Vzc2lvbiB0byB1c2UuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRTZXNzaW9uKHNlc3Npb246IEVkaXRTZXNzaW9uKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24gPT09IHNlc3Npb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvbGRTZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICBpZiAob2xkU2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVwiLCB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlTW9kZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwidG9rZW5pemVyVXBkYXRlXCIsIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VUYWJTaXplXCIsIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlV3JhcExpbWl0XCIsIHRoaXMuJG9uQ2hhbmdlV3JhcExpbWl0KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VXcmFwTW9kZVwiLCB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJvbkNoYW5nZUZvbGRcIiwgdGhpcy4kb25DaGFuZ2VGb2xkKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VGcm9udE1hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VCYWNrTWFya2VyXCIsIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlcik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZUFubm90YXRpb25cIiwgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VPdmVyd3JpdGVcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVNjcm9sbFRvcFwiLCB0aGlzLiRvblNjcm9sbFRvcENoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCB0aGlzLiRvblNjcm9sbExlZnRDaGFuZ2UpO1xuXG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgICAgICAgICAgc2VsZWN0aW9uLm9mZihcImNoYW5nZUN1cnNvclwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG4gICAgICAgICAgICBzZWxlY3Rpb24ub2ZmKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIGlmIChzZXNzaW9uKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlID0gdGhpcy5vbkRvY3VtZW50Q2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlXCIsIHRoaXMuJG9uRG9jdW1lbnRDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUgPSB0aGlzLm9uQ2hhbmdlTW9kZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZU1vZGVcIiwgdGhpcy4kb25DaGFuZ2VNb2RlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25Ub2tlbml6ZXJVcGRhdGUgPSB0aGlzLm9uVG9rZW5pemVyVXBkYXRlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwidG9rZW5pemVyVXBkYXRlXCIsIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VUYWJTaXplID0gdGhpcy5yZW5kZXJlci5vbkNoYW5nZVRhYlNpemUuYmluZCh0aGlzLnJlbmRlcmVyKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VUYWJTaXplXCIsIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlV3JhcExpbWl0ID0gdGhpcy5vbkNoYW5nZVdyYXBMaW1pdC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZVdyYXBMaW1pdFwiLCB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlV3JhcE1vZGUgPSB0aGlzLm9uQ2hhbmdlV3JhcE1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VXcmFwTW9kZVwiLCB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VGb2xkID0gdGhpcy5vbkNoYW5nZUZvbGQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VGb2xkXCIsIHRoaXMuJG9uQ2hhbmdlRm9sZCk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlRnJvbnRNYXJrZXIgPSB0aGlzLm9uQ2hhbmdlRnJvbnRNYXJrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VGcm9udE1hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VCYWNrTWFya2VyID0gdGhpcy5vbkNoYW5nZUJhY2tNYXJrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VCYWNrTWFya2VyXCIsIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlcik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlQnJlYWtwb2ludCA9IHRoaXMub25DaGFuZ2VCcmVha3BvaW50LmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUFubm90YXRpb24gPSB0aGlzLm9uQ2hhbmdlQW5ub3RhdGlvbi5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZUFubm90YXRpb25cIiwgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DdXJzb3JDaGFuZ2UgPSB0aGlzLm9uQ3Vyc29yQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlT3ZlcndyaXRlXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TY3JvbGxUb3BDaGFuZ2UgPSB0aGlzLm9uU2Nyb2xsVG9wQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHRoaXMuJG9uU2Nyb2xsVG9wQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TY3JvbGxMZWZ0Q2hhbmdlID0gdGhpcy5vblNjcm9sbExlZnRDaGFuZ2UuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHRoaXMuJG9uU2Nyb2xsTGVmdENoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uID0gc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm9uKFwiY2hhbmdlQ3Vyc29yXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UgPSB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5vbihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvblNlbGVjdGlvbkNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VNb2RlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgICAgICB0aGlzLm9uQ3Vyc29yQ2hhbmdlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgICAgIHRoaXMub25TY3JvbGxUb3BDaGFuZ2Uodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgdGhpcy5vblNjcm9sbExlZnRDaGFuZ2Uodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuXG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKHZvaWQgMCwgdGhpcy5zZWxlY3Rpb24pO1xuXG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlRnJvbnRNYXJrZXIodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUJhY2tNYXJrZXIodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUJyZWFrcG9pbnQodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUFubm90YXRpb24odm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMucmVuZGVyZXIuYWRqdXN0V3JhcExpbWl0KCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVNlc3Npb25cIiwge1xuICAgICAgICAgICAgc2Vzc2lvbjogc2Vzc2lvbixcbiAgICAgICAgICAgIG9sZFNlc3Npb246IG9sZFNlc3Npb25cbiAgICAgICAgfSk7XG5cbiAgICAgICAgb2xkU2Vzc2lvbiAmJiBvbGRTZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VFZGl0b3JcIiwgeyBvbGRFZGl0b3I6IHRoaXMgfSk7XG4gICAgICAgIHNlc3Npb24gJiYgc2Vzc2lvbi5fc2lnbmFsKFwiY2hhbmdlRWRpdG9yXCIsIHsgZWRpdG9yOiB0aGlzIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgc2Vzc2lvbiBiZWluZyB1c2VkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTZXNzaW9uXG4gICAgICogQHJldHVybiB7RWRpdFNlc3Npb259XG4gICAgICovXG4gICAgZ2V0U2Vzc2lvbigpOiBFZGl0U2Vzc2lvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY3VycmVudCBkb2N1bWVudCB0byBgdGV4dGAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFZhbHVlXG4gICAgICogQHBhcmFtIHRleHQge3N0cmluZ30gVGhlIG5ldyB2YWx1ZSB0byBzZXQgZm9yIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSBbY3Vyc29yUG9zXSB7bnVtYmVyfSBXaGVyZSB0byBzZXQgdGhlIG5ldyB2YWx1ZS5gdW5kZWZpbmVkYCBvciAwIGlzIHNlbGVjdEFsbCwgLTEgaXMgYXQgdGhlIGRvY3VtZW50IHN0YXJ0LCBhbmQgKzEgaXMgYXQgdGhlIGVuZFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0VmFsdWUodGV4dDogc3RyaW5nLCBjdXJzb3JQb3M/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gRklYTUU6IFRoaXMgbGFja3Mgc3ltbWV0cnkgd2l0aCBnZXRWYWx1ZSgpLlxuICAgICAgICB0aGlzLnNlc3Npb24uZG9jLnNldFZhbHVlKHRleHQpO1xuICAgICAgICAvLyB0aGlzLnNlc3Npb24uc2V0VmFsdWUodGV4dCk7XG5cbiAgICAgICAgaWYgKCFjdXJzb3JQb3MpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0QWxsKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY3Vyc29yUG9zID09ICsxKSB7XG4gICAgICAgICAgICB0aGlzLm5hdmlnYXRlRmlsZUVuZCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGN1cnNvclBvcyA9PSAtMSkge1xuICAgICAgICAgICAgdGhpcy5uYXZpZ2F0ZUZpbGVTdGFydCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZXNzaW9uJ3MgY29udGVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VmFsdWVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnRseSBoaWdobGlnaHRlZCBzZWxlY3Rpb24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNlbGVjdGlvblxuICAgICAqIEByZXR1cm4ge1NlbGVjdGlvbn0gVGhlIGhpZ2hsaWdodGVkIHNlbGVjdGlvblxuICAgICAqL1xuICAgIGdldFNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Rpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCByZXNpemVcbiAgICAgKiBAcGFyYW0gW2ZvcmNlXSB7Ym9vbGVhbn0gZm9yY2UgSWYgYHRydWVgLCByZWNvbXB1dGVzIHRoZSBzaXplLCBldmVuIGlmIHRoZSBoZWlnaHQgYW5kIHdpZHRoIGhhdmVuJ3QgY2hhbmdlZC5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHJlc2l6ZShmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5vblJlc2l6ZShmb3JjZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXRUaGVtZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ30gVGhlIHNldCB0aGVtZVxuICAgICAqL1xuICAgIGdldFRoZW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFRoZW1lKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNldFN0eWxlXG4gICAgICoqL1xuICAgIHNldFN0eWxlKHN0eWxlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTdHlsZShzdHlsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIudW5zZXRTdHlsZX1cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIudW5zZXRTdHlsZVxuICAgICAqKi9cbiAgICB1bnNldFN0eWxlKHN0eWxlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51bnNldFN0eWxlKHN0eWxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50IGZvbnQgc2l6ZSBvZiB0aGUgZWRpdG9yIHRleHQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEZvbnRTaXplXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGdldEZvbnRTaXplKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImZvbnRTaXplXCIpIHx8IGNvbXB1dGVkU3R5bGUodGhpcy5jb250YWluZXIsIFwiZm9udFNpemVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IGEgbmV3IGZvbnQgc2l6ZSAoaW4gcGl4ZWxzKSBmb3IgdGhlIGVkaXRvciB0ZXh0LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRGb250U2l6ZVxuICAgICAqIEBwYXJhbSBmb250U2l6ZSB7c3RyaW5nfSBBIGZvbnQgc2l6ZSwgZS5nLiBcIjEycHhcIilcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEZvbnRTaXplKGZvbnRTaXplOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmb250U2l6ZVwiLCBmb250U2l6ZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0QnJhY2tldHMoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVNYXJrZXIodGhpcy5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCA9IHZvaWQgMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiRoaWdobGlnaHRQZW5kaW5nKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwZXJmb3JtIGhpZ2hsaWdodCBhc3luYyB0byBub3QgYmxvY2sgdGhlIGJyb3dzZXIgZHVyaW5nIG5hdmlnYXRpb25cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLiRoaWdobGlnaHRQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuJGhpZ2hsaWdodFBlbmRpbmcgPSBmYWxzZTtcblxuICAgICAgICAgICAgdmFyIHBvcyA9IHNlbGYuc2Vzc2lvbi5maW5kTWF0Y2hpbmdCcmFja2V0KHNlbGYuZ2V0Q3Vyc29yUG9zaXRpb24oKSk7XG4gICAgICAgICAgICBpZiAocG9zKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKHBvcy5yb3csIHBvcy5jb2x1bW4sIHBvcy5yb3csIHBvcy5jb2x1bW4gKyAxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHNlbGYuc2Vzc2lvbi4kbW9kZSAmJiBzZWxmLnNlc3Npb24uJG1vZGUuZ2V0TWF0Y2hpbmcpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlID0gc2VsZi5zZXNzaW9uLiRtb2RlLmdldE1hdGNoaW5nKHNlbGYuc2Vzc2lvbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQgPSBzZWxmLnNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9icmFja2V0XCIsIFwidGV4dFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgNTApO1xuICAgIH1cblxuICAgIC8vIHRvZG86IG1vdmUgdG8gbW9kZS5nZXRNYXRjaGluZ1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodFRhZ3MoKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXG4gICAgICAgIGlmICh0aGlzLiRoaWdobGlnaHRUYWdQZW5kaW5nKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwZXJmb3JtIGhpZ2hsaWdodCBhc3luYyB0byBub3QgYmxvY2sgdGhlIGJyb3dzZXIgZHVyaW5nIG5hdmlnYXRpb25cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLiRoaWdobGlnaHRUYWdQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuJGhpZ2hsaWdodFRhZ1BlbmRpbmcgPSBmYWxzZTtcblxuICAgICAgICAgICAgdmFyIHBvcyA9IHNlbGYuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHNlbGYuc2Vzc2lvbiwgcG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcblxuICAgICAgICAgICAgaWYgKCF0b2tlbiB8fCB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRhZyA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgdmFyIGRlcHRoID0gMDtcbiAgICAgICAgICAgIHZhciBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAvL2ZpbmQgY2xvc2luZyB0YWdcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IHRva2VuO1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnZhbHVlID09PSB0YWcgJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPC8nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGgtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgZGVwdGggPj0gMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL2ZpbmQgb3BlbmluZyB0YWdcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gcHJldlRva2VuO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAocHJldlRva2VuICYmIGRlcHRoIDw9IDApO1xuXG4gICAgICAgICAgICAgICAgLy9zZWxlY3QgdGFnIGFnYWluXG4gICAgICAgICAgICAgICAgaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHZhciBjb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKTtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShyb3csIGNvbHVtbiwgcm93LCBjb2x1bW4gKyB0b2tlbi52YWx1ZS5sZW5ndGgpO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgcmFuZ2UgaWYgZGlmZmVyZW50XG4gICAgICAgICAgICBpZiAoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ICYmIHJhbmdlLmNvbXBhcmVSYW5nZShzZXNzaW9uLiRiYWNrTWFya2Vyc1tzZXNzaW9uLiR0YWdIaWdobGlnaHRdLnJhbmdlKSAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHJhbmdlICYmICFzZXNzaW9uLiR0YWdIaWdobGlnaHQpXG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2JyYWNrZXRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICB9LCA1MCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQnJpbmdzIHRoZSBjdXJyZW50IGB0ZXh0SW5wdXRgIGludG8gZm9jdXMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGZvY3VzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBmb2N1cygpOiB2b2lkIHtcbiAgICAgICAgLy8gU2FmYXJpIG5lZWRzIHRoZSB0aW1lb3V0XG4gICAgICAgIC8vIGlPUyBhbmQgRmlyZWZveCBuZWVkIGl0IGNhbGxlZCBpbW1lZGlhdGVseVxuICAgICAgICAvLyB0byBiZSBvbiB0aGUgc2F2ZSBzaWRlIHdlIGRvIGJvdGhcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIF9zZWxmLnRleHRJbnB1dC5mb2N1cygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy50ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY3VycmVudCBgdGV4dElucHV0YCBpcyBpbiBmb2N1cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgaXNGb2N1c2VkXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnRleHRJbnB1dC5pc0ZvY3VzZWQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCbHVycyB0aGUgY3VycmVudCBgdGV4dElucHV0YC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgYmx1clxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgYmx1cigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy50ZXh0SW5wdXQuYmx1cigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgb25jZSB0aGUgZWRpdG9yIGNvbWVzIGludG8gZm9jdXMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIG9uRm9jdXNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uRm9jdXMoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLiRpc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRpc0ZvY3VzZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNob3dDdXJzb3IoKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci52aXN1YWxpemVGb2N1cygpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGZvY3VzXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiZm9jdXNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCBvbmNlIHRoZSBlZGl0b3IgaGFzIGJlZW4gYmx1cnJlZC5cbiAgICAgKiBAbWV0aG9kIG9uQmx1clxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb25CbHVyKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuJGlzRm9jdXNlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGlzRm9jdXNlZCA9IGZhbHNlO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmhpZGVDdXJzb3IoKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci52aXN1YWxpemVCbHVyKCk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgYmx1clxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChcImJsdXJcIik7XG4gICAgfVxuXG4gICAgJGN1cnNvckNoYW5nZSgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW5ldmVyIHRoZSBkb2N1bWVudCBpcyBjaGFuZ2VkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBvbkRvY3VtZW50Q2hhbmdlXG4gICAgICogQHBhcmFtIGV2ZW50IHtEZWx0YUV2ZW50fSBDb250YWlucyBhIHNpbmdsZSBwcm9wZXJ0eSwgYGRhdGFgLCB3aGljaCBoYXMgdGhlIGRlbHRhIG9mIGNoYW5nZXNcbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgb25Eb2N1bWVudENoYW5nZShldmVudDogRGVsdGFFdmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgdmFyIGRlbHRhOiBEZWx0YSA9IGV2ZW50LmRhdGE7XG4gICAgICAgIHZhciByYW5nZSA9IGRlbHRhLnJhbmdlO1xuICAgICAgICB2YXIgbGFzdFJvdzogbnVtYmVyO1xuXG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPT09IHJhbmdlLmVuZC5yb3cgJiYgZGVsdGEuYWN0aW9uICE9PSBcImluc2VydExpbmVzXCIgJiYgZGVsdGEuYWN0aW9uICE9PSBcInJlbW92ZUxpbmVzXCIpIHtcbiAgICAgICAgICAgIGxhc3RSb3cgPSByYW5nZS5lbmQucm93O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbGFzdFJvdyA9IEluZmluaXR5O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlbmRlcmVyOiBWaXJ0dWFsUmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVyO1xuICAgICAgICByZW5kZXJlci51cGRhdGVMaW5lcyhyYW5nZS5zdGFydC5yb3csIGxhc3RSb3csIHNlc3Npb24uJHVzZVdyYXBNb2RlKTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZVxuICAgICAgICAgKiBAcGFyYW0gZXZlbnQge0RlbHRhRXZlbnR9XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VcIiwgZXZlbnQpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBjdXJzb3IgYmVjYXVzZSB0YWIgY2hhcmFjdGVycyBjYW4gaW5mbHVlbmNlIHRoZSBjdXJzb3IgcG9zaXRpb25cbiAgICAgICAgdGhpcy4kY3Vyc29yQ2hhbmdlKCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uVG9rZW5pemVyVXBkYXRlKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB2YXIgcm93cyA9IGV2ZW50LmRhdGE7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlTGluZXMocm93cy5maXJzdCwgcm93cy5sYXN0KTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgb25TY3JvbGxUb3BDaGFuZ2UoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9ZKHNlc3Npb24uZ2V0U2Nyb2xsVG9wKCkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25TY3JvbGxMZWZ0Q2hhbmdlKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvWChzZXNzaW9uLmdldFNjcm9sbExlZnQoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSGFuZGxlciBmb3IgY3Vyc29yIG9yIHNlbGVjdGlvbiBjaGFuZ2VzLlxuICAgICAqL1xuICAgIHByaXZhdGUgb25DdXJzb3JDaGFuZ2UoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMuJGN1cnNvckNoYW5nZSgpO1xuXG4gICAgICAgIGlmICghdGhpcy4kYmxvY2tTY3JvbGxpbmcpIHtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodEJyYWNrZXRzKCk7XG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodFRhZ3MoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICAvLyBUT0RPOyBIb3cgaXMgc2lnbmFsIGRpZmZlcmVudCBmcm9tIGVtaXQ/XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhbmdlU2VsZWN0aW9uXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgfVxuXG4gICAgcHVibGljICR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCkge1xuXG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVyO1xuXG4gICAgICAgIHZhciBoaWdobGlnaHQ7XG4gICAgICAgIGlmICh0aGlzLiRoaWdobGlnaHRBY3RpdmVMaW5lKSB7XG4gICAgICAgICAgICBpZiAoKHRoaXMuJHNlbGVjdGlvblN0eWxlICE9IFwibGluZVwiIHx8ICF0aGlzLnNlbGVjdGlvbi5pc011bHRpTGluZSgpKSkge1xuICAgICAgICAgICAgICAgIGhpZ2hsaWdodCA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZW5kZXJlci4kbWF4TGluZXMgJiYgc2Vzc2lvbi5nZXRMZW5ndGgoKSA9PT0gMSAmJiAhKHJlbmRlcmVyLiRtaW5MaW5lcyA+IDEpKSB7XG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0ID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciAmJiAhaGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLm1hcmtlcklkKTtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyICYmIGhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdmFyIHJhbmdlOiBSYW5nZSA9IG5ldyBSYW5nZShoaWdobGlnaHQucm93LCBoaWdobGlnaHQuY29sdW1uLCBoaWdobGlnaHQucm93LCBJbmZpbml0eSk7XG4gICAgICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9hY3RpdmUtbGluZVwiLCBcInNjcmVlbkxpbmVcIik7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyID0gcmFuZ2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLnN0YXJ0LnJvdyA9IGhpZ2hsaWdodC5yb3c7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLmVuZC5yb3cgPSBoaWdobGlnaHQucm93O1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlci5zdGFydC5jb2x1bW4gPSBoaWdobGlnaHQuY29sdW1uO1xuICAgICAgICAgICAgc2Vzc2lvbi5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIFRoaXMgdmVyc2lvbiBoYXMgbm90IGJlZW4gYm91bmQgdG8gYHRoaXNgLCBzbyBkb24ndCB1c2UgaXQgZGlyZWN0bHkuXG4gICAgcHJpdmF0ZSBvblNlbGVjdGlvbkNoYW5nZShldmVudCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgaWYgKHR5cGVvZiBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kc2VsZWN0aW9uTWFya2VyID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHN0eWxlID0gdGhpcy5nZXRTZWxlY3Rpb25TdHlsZSgpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kc2VsZWN0aW9uTWFya2VyID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX3NlbGVjdGlvblwiLCBzdHlsZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmU6IFJlZ0V4cCA9IHRoaXMuJGhpZ2hsaWdodFNlbGVjdGVkV29yZCAmJiB0aGlzLiRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmhpZ2hsaWdodChyZSk7XG5cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgIH1cblxuICAgICRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAoKTogUmVnRXhwIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkgfHwgc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHN0YXJ0T3V0ZXIgPSBzZWxlY3Rpb24uc3RhcnQuY29sdW1uIC0gMTtcbiAgICAgICAgdmFyIGVuZE91dGVyID0gc2VsZWN0aW9uLmVuZC5jb2x1bW4gKyAxO1xuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShzZWxlY3Rpb24uc3RhcnQucm93KTtcbiAgICAgICAgdmFyIGxpbmVDb2xzID0gbGluZS5sZW5ndGg7XG4gICAgICAgIHZhciBuZWVkbGUgPSBsaW5lLnN1YnN0cmluZyhNYXRoLm1heChzdGFydE91dGVyLCAwKSxcbiAgICAgICAgICAgIE1hdGgubWluKGVuZE91dGVyLCBsaW5lQ29scykpO1xuXG4gICAgICAgIC8vIE1ha2Ugc3VyZSB0aGUgb3V0ZXIgY2hhcmFjdGVycyBhcmUgbm90IHBhcnQgb2YgdGhlIHdvcmQuXG4gICAgICAgIGlmICgoc3RhcnRPdXRlciA+PSAwICYmIC9eW1xcd1xcZF0vLnRlc3QobmVlZGxlKSkgfHxcbiAgICAgICAgICAgIChlbmRPdXRlciA8PSBsaW5lQ29scyAmJiAvW1xcd1xcZF0kLy50ZXN0KG5lZWRsZSkpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIG5lZWRsZSA9IGxpbmUuc3Vic3RyaW5nKHNlbGVjdGlvbi5zdGFydC5jb2x1bW4sIHNlbGVjdGlvbi5lbmQuY29sdW1uKTtcbiAgICAgICAgaWYgKCEvXltcXHdcXGRdKyQvLnRlc3QobmVlZGxlKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAvLyBXaGVuIHRoZSBuZWVkbGUgaXMgYSBzdHJpbmcsIHRoZSByZXR1cm4gdHlwZSB3aWxsIGJlIGEgUmVnRXhwLlxuICAgICAgICAvLyBUT0RPOiBTcGxpdCBvdXQgdGhpcyBmdW5jdGlvbmFsaXR5IGZvciBjbGVhbmVyIHR5cGUgc2FmZXR5LlxuICAgICAgICB2YXIgcmUgPSA8UmVnRXhwPnRoaXMuJHNlYXJjaC4kYXNzZW1ibGVSZWdFeHAoe1xuICAgICAgICAgICAgd2hvbGVXb3JkOiB0cnVlLFxuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZTogdHJ1ZSxcbiAgICAgICAgICAgIG5lZWRsZTogbmVlZGxlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9uQ2hhbmdlRnJvbnRNYXJrZXJcbiAgICAgKiBAcGFyYW0gZXZlbnRcbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgb25DaGFuZ2VGcm9udE1hcmtlcihldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgdGhpcy51cGRhdGVGcm9udE1hcmtlcnMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHVwZGF0ZUZyb250TWFya2Vyc1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHVwZGF0ZUZyb250TWFya2VycygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGcm9udE1hcmtlcnMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9uQ2hhbmdlQmFja01hcmtlclxuICAgICAqIEBwYXJhbSBldmVudFxuICAgICAqIEBwYXJhbSBzZXNzaW9uIHtFZGl0U2Vzc2lvbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBvbkNoYW5nZUJhY2tNYXJrZXIoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlQmFja01hcmtlcnMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHVwZGF0ZUJhY2tNYXJrZXJzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgdXBkYXRlQmFja01hcmtlcnMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlQmFja01hcmtlcnMoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlQnJlYWtwb2ludChldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlQnJlYWtwb2ludHMoKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlQnJlYWtwb2ludFwiLCBldmVudCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZUFubm90YXRpb24oZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0QW5ub3RhdGlvbnMoc2Vzc2lvbi5nZXRBbm5vdGF0aW9ucygpKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VBbm5vdGF0aW9uXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlQW5ub3RhdGlvblwiLCBldmVudCk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlTW9kZShldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVUZXh0KCk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhbmdlTW9kZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChcImNoYW5nZU1vZGVcIiwgZXZlbnQpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVdyYXBMaW1pdChldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGdWxsKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZVdyYXBNb2RlKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLm9uUmVzaXplKHRydWUpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZUZvbGQoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgYWN0aXZlIGxpbmUgbWFya2VyIGFzIGR1ZSB0byBmb2xkaW5nIGNoYW5nZXMgdGhlIGN1cnJlbnRcbiAgICAgICAgLy8gbGluZSByYW5nZSBvbiB0aGUgc2NyZWVuIG1pZ2h0IGhhdmUgY2hhbmdlZC5cbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICAvLyBUT0RPOiBUaGlzIG1pZ2h0IGJlIHRvbyBtdWNoIHVwZGF0aW5nLiBPa2F5IGZvciBub3cuXG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlRnVsbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBvZiB0ZXh0IGN1cnJlbnRseSBoaWdobGlnaHRlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2VsZWN0ZWRUZXh0XG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGdldFNlbGVjdGVkVGV4dCgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbiB0ZXh0IGlzIGNvcGllZC5cbiAgICAgKiBAZXZlbnQgY29weVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBjb3BpZWQgdGV4dFxuICAgICAqXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBvZiB0ZXh0IGN1cnJlbnRseSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9XG4gICAgICogQGRlcHJlY2F0ZWQgVXNlIGdldFNlbGVjdGVkVGV4dCBpbnN0ZWFkLlxuICAgICAqKi9cbiAgICBnZXRDb3B5VGV4dCgpIHtcbiAgICAgICAgdmFyIHRleHQgPSB0aGlzLmdldFNlbGVjdGVkVGV4dCgpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNvcHlcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNvcHlcIiwgdGV4dCk7XG4gICAgICAgIHJldHVybiB0ZXh0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGxlZCB3aGVuZXZlciBhIHRleHQgXCJjb3B5XCIgaGFwcGVucy5cbiAgICAgKiovXG4gICAgb25Db3B5KCkge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoXCJjb3B5XCIsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGxlZCB3aGVuZXZlciBhIHRleHQgXCJjdXRcIiBoYXBwZW5zLlxuICAgICAqKi9cbiAgICBvbkN1dCgpIHtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5leGVjKFwiY3V0XCIsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbiB0ZXh0IGlzIHBhc3RlZC5cbiAgICAgKiBAZXZlbnQgcGFzdGVcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgcGFzdGVkIHRleHRcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIENhbGxlZCB3aGVuZXZlciBhIHRleHQgXCJwYXN0ZVwiIGhhcHBlbnMuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIHBhc3RlZCB0ZXh0XG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBvblBhc3RlKHRleHQ6IHN0cmluZykge1xuICAgICAgICAvLyB0b2RvIHRoaXMgc2hvdWxkIGNoYW5nZSB3aGVuIHBhc3RlIGJlY29tZXMgYSBjb21tYW5kXG4gICAgICAgIGlmICh0aGlzLiRyZWFkT25seSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGUgPSB7IHRleHQ6IHRleHQgfTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBwYXN0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwicGFzdGVcIiwgZSk7XG4gICAgICAgIHRoaXMuaW5zZXJ0KGUudGV4dCwgdHJ1ZSk7XG4gICAgfVxuXG5cbiAgICBleGVjQ29tbWFuZChjb21tYW5kLCBhcmdzPyk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoY29tbWFuZCwgdGhpcywgYXJncyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5zZXJ0cyBgdGV4dGAgaW50byB3aGVyZXZlciB0aGUgY3Vyc29yIGlzIHBvaW50aW5nLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpbnNlcnRcbiAgICAgKiBAcGFyYW0gdGV4dCB7c3RyaW5nfSBUaGUgbmV3IHRleHQgdG8gYWRkLlxuICAgICAqIEBwYXJhbSBbcGFzdGVkXSB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGluc2VydCh0ZXh0OiBzdHJpbmcsIHBhc3RlZDogYm9vbGVhbik6IHZvaWQge1xuXG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgbW9kZSA9IHNlc3Npb24uZ2V0TW9kZSgpO1xuICAgICAgICB2YXIgY3Vyc29yOiBQb3NpdGlvbiA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHRyYW5zZm9ybTogVGV4dEFuZFNlbGVjdGlvbjtcblxuICAgICAgICBpZiAodGhpcy5nZXRCZWhhdmlvdXJzRW5hYmxlZCgpICYmICFwYXN0ZWQpIHtcbiAgICAgICAgICAgIC8vIEdldCBhIHRyYW5zZm9ybSBpZiB0aGUgY3VycmVudCBtb2RlIHdhbnRzIG9uZS5cbiAgICAgICAgICAgIHRyYW5zZm9ybSA9IG1vZGUgJiYgPFRleHRBbmRTZWxlY3Rpb24+bW9kZS50cmFuc2Zvcm1BY3Rpb24oc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KSwgJ2luc2VydGlvbicsIHRoaXMsIHNlc3Npb24sIHRleHQpO1xuICAgICAgICAgICAgaWYgKHRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0ICE9PSB0cmFuc2Zvcm0udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb24ubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1lcmdlTmV4dENvbW1hbmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGV4dCA9IHRyYW5zZm9ybS50ZXh0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRleHQgPT09IFwiXFx0XCIpIHtcbiAgICAgICAgICAgIHRleHQgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW1vdmUgc2VsZWN0ZWQgdGV4dC5cbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgICAgIGN1cnNvciA9IHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhjdXJzb3IsIGN1cnNvcik7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uICs9IHRleHQubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGV4dCA9PT0gXCJcXG5cIiB8fCB0ZXh0ID09PSBcIlxcclxcblwiKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgICAgIGlmIChjdXJzb3IuY29sdW1uID4gbGluZS5zZWFyY2goL1xcU3wkLykpIHtcbiAgICAgICAgICAgICAgICB2YXIgZCA9IGxpbmUuc3Vic3RyKGN1cnNvci5jb2x1bW4pLnNlYXJjaCgvXFxTfCQvKTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmRvYy5yZW1vdmVJbkxpbmUoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbiwgY3Vyc29yLmNvbHVtbiArIGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuXG4gICAgICAgIHZhciBzdGFydCA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lU3RhdGUgPSBzZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHNob3VsZE91dGRlbnQgPSBtb2RlLmNoZWNrT3V0ZGVudChsaW5lU3RhdGUsIGxpbmUsIHRleHQpO1xuICAgICAgICB2YXIgZW5kID0gc2Vzc2lvbi5pbnNlcnQoY3Vyc29yLCB0ZXh0KTtcblxuICAgICAgICBpZiAodHJhbnNmb3JtICYmIHRyYW5zZm9ybS5zZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGlmICh0cmFuc2Zvcm0uc2VsZWN0aW9uLmxlbmd0aCA9PT0gMikgeyAvLyBUcmFuc2Zvcm0gcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgY29sdW1uXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBSYW5nZShjdXJzb3Iucm93LCBzdGFydCArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJzb3Iucm93LCBzdGFydCArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgeyAvLyBUcmFuc2Zvcm0gcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgcm93LlxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBuZXcgUmFuZ2UoY3Vyc29yLnJvdyArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0uc2VsZWN0aW9uWzFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3Vyc29yLnJvdyArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMl0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0uc2VsZWN0aW9uWzNdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2Vzc2lvbi5nZXREb2N1bWVudCgpLmlzTmV3TGluZSh0ZXh0KSkge1xuICAgICAgICAgICAgdmFyIGxpbmVJbmRlbnQgPSBtb2RlLmdldE5leHRMaW5lSW5kZW50KGxpbmVTdGF0ZSwgbGluZS5zbGljZSgwLCBjdXJzb3IuY29sdW1uKSwgc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKSk7XG4gICAgICAgICAgICBzZXNzaW9uLmluc2VydCh7IHJvdzogY3Vyc29yLnJvdyArIDEsIGNvbHVtbjogMCB9LCBsaW5lSW5kZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzaG91bGRPdXRkZW50KSB7XG4gICAgICAgICAgICBtb2RlLmF1dG9PdXRkZW50KGxpbmVTdGF0ZSwgc2Vzc2lvbiwgY3Vyc29yLnJvdyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9uXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFjayB7KGV2ZW50LCBlZGl0b3IpID0+IGFueX1cbiAgICAgKiBAcGFyYW0gW2NhcHR1cmluZ10gYm9vbGVhblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb24oZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZGF0YTogYW55LCBlZGl0b3I6IEVkaXRvcikgPT4gYW55LCBjYXB0dXJpbmc/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oZXZlbnROYW1lLCBjYWxsYmFjaywgY2FwdHVyaW5nKVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb2ZmXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFja1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb2ZmKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGRhdGE6IGFueSwgc291cmNlOiBFZGl0b3IpID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9mZihldmVudE5hbWUsIGNhbGxiYWNrKVxuICAgIH1cblxuICAgIHNldERlZmF1bHRIYW5kbGVyKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGRhdGE6IGFueSwgc291cmNlOiBFZGl0b3IpID0+IGFueSkge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLnNldERlZmF1bHRIYW5kbGVyKGV2ZW50TmFtZSwgY2FsbGJhY2spXG4gICAgfVxuXG4gICAgX2VtaXQoZXZlbnROYW1lOiBzdHJpbmcsIGV2ZW50PzogYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoZXZlbnROYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgX3NpZ25hbChldmVudE5hbWU6IHN0cmluZywgZXZlbnQ/OiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKGV2ZW50TmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIGhhc0xpc3RlbmVycyhldmVudE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5ldmVudEJ1cy5oYXNMaXN0ZW5lcnMoZXZlbnROYW1lKTtcbiAgICB9XG5cbiAgICBvblRleHRJbnB1dCh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nLm9uVGV4dElucHV0KHRleHQpO1xuICAgICAgICAvLyBUT0RPOiBUaGlzIHNob3VsZCBiZSBwbHVnZ2FibGUuXG4gICAgICAgIGlmICh0ZXh0ID09PSAnLicpIHtcbiAgICAgICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhDT01NQU5EX05BTUVfQVVUT19DT01QTEVURSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5nZXRTZXNzaW9uKCkuZ2V0RG9jdW1lbnQoKS5pc05ld0xpbmUodGV4dCkpIHtcbiAgICAgICAgICAgIHZhciBsaW5lTnVtYmVyID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgdmFyIG9wdGlvbiA9IG5ldyBTZXJ2aWNlcy5FZGl0b3JPcHRpb25zKCk7XG4gICAgICAgICAgICAvLyAgICAgICAgICAgIG9wdGlvbi5OZXdMaW5lQ2hhcmFjdGVyID0gXCJcXG5cIjtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBTbWFydCBJbmRlbnRpbmdcbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICB2YXIgaW5kZW50ID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldFNtYXJ0SW5kZW50QXRMaW5lTnVtYmVyKGN1cnJlbnRGaWxlTmFtZSwgbGluZU51bWJlciwgb3B0aW9uKTtcbiAgICAgICAgICAgIGlmKGluZGVudCA+IDApXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmNvbW1hbmRzLmV4ZWMoXCJpbnNlcnR0ZXh0XCIsIGVkaXRvciwge3RleHQ6XCIgXCIsIHRpbWVzOmluZGVudH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgKi9cbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uQ29tbWFuZEtleShlLCBoYXNoSWQ6IG51bWJlciwga2V5Q29kZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMua2V5QmluZGluZy5vbkNvbW1hbmRLZXkoZSwgaGFzaElkLCBrZXlDb2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXNzIGluIGB0cnVlYCB0byBlbmFibGUgb3ZlcndyaXRlcyBpbiB5b3VyIHNlc3Npb24sIG9yIGBmYWxzZWAgdG8gZGlzYWJsZS4gSWYgb3ZlcndyaXRlcyBpcyBlbmFibGVkLCBhbnkgdGV4dCB5b3UgZW50ZXIgd2lsbCB0eXBlIG92ZXIgYW55IHRleHQgYWZ0ZXIgaXQuIElmIHRoZSB2YWx1ZSBvZiBgb3ZlcndyaXRlYCBjaGFuZ2VzLCB0aGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgY2hhbmdlT3ZlcndyaXRlYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IG92ZXJ3cml0ZSBEZWZpbmVzIHdoZXRlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0T3ZlcndyaXRlXG4gICAgICoqL1xuICAgIHNldE92ZXJ3cml0ZShvdmVyd3JpdGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldE92ZXJ3cml0ZShvdmVyd3JpdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIG92ZXJ3cml0ZXMgYXJlIGVuYWJsZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0T3ZlcndyaXRlXG4gICAgICoqL1xuICAgIGdldE92ZXJ3cml0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZSBvZiBvdmVyd3JpdGUgdG8gdGhlIG9wcG9zaXRlIG9mIHdoYXRldmVyIGl0IGN1cnJlbnRseSBpcy5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgdG9nZ2xlT3ZlcndyaXRlKCkge1xuICAgICAgICB0aGlzLnNlc3Npb24udG9nZ2xlT3ZlcndyaXRlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBob3cgZmFzdCB0aGUgbW91c2Ugc2Nyb2xsaW5nIHNob3VsZCBkby5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc3BlZWQgQSB2YWx1ZSBpbmRpY2F0aW5nIHRoZSBuZXcgc3BlZWQgKGluIG1pbGxpc2Vjb25kcylcbiAgICAgKiovXG4gICAgc2V0U2Nyb2xsU3BlZWQoc3BlZWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNjcm9sbFNwZWVkXCIsIHNwZWVkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBpbmRpY2F0aW5nIGhvdyBmYXN0IHRoZSBtb3VzZSBzY3JvbGwgc3BlZWQgaXMgKGluIG1pbGxpc2Vjb25kcykuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXRTY3JvbGxTcGVlZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzY3JvbGxTcGVlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBkZWxheSAoaW4gbWlsbGlzZWNvbmRzKSBvZiB0aGUgbW91c2UgZHJhZy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZHJhZ0RlbGF5IEEgdmFsdWUgaW5kaWNhdGluZyB0aGUgbmV3IGRlbGF5XG4gICAgICoqL1xuICAgIHNldERyYWdEZWxheShkcmFnRGVsYXk6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRyYWdEZWxheVwiLCBkcmFnRGVsYXkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbW91c2UgZHJhZyBkZWxheS5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIGdldERyYWdEZWxheSgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJkcmFnRGVsYXlcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRoZSBzZWxlY3Rpb24gc3R5bGUgY2hhbmdlcywgdmlhIFtbRWRpdG9yLnNldFNlbGVjdGlvblN0eWxlXV0uXG4gICAgICogQGV2ZW50IGNoYW5nZVNlbGVjdGlvblN0eWxlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGRhdGEgQ29udGFpbnMgb25lIHByb3BlcnR5LCBgZGF0YWAsIHdoaWNoIGluZGljYXRlcyB0aGUgbmV3IHNlbGVjdGlvbiBzdHlsZVxuICAgICAqKi9cbiAgICAvKipcbiAgICAgKiBEcmF3IHNlbGVjdGlvbiBtYXJrZXJzIHNwYW5uaW5nIHdob2xlIGxpbmUsIG9yIG9ubHkgb3ZlciBzZWxlY3RlZCB0ZXh0LiBEZWZhdWx0IHZhbHVlIGlzIFwibGluZVwiXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIFRoZSBuZXcgc2VsZWN0aW9uIHN0eWxlIFwibGluZVwifFwidGV4dFwiXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0U2VsZWN0aW9uU3R5bGUodmFsOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzZWxlY3Rpb25TdHlsZVwiLCB2YWwpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIHN0eWxlLlxuICAgICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uU3R5bGUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2VsZWN0aW9uU3R5bGVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGUgY3VycmVudCBsaW5lIHNob3VsZCBiZSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3VsZEhpZ2hsaWdodCBTZXQgdG8gYHRydWVgIHRvIGhpZ2hsaWdodCB0aGUgY3VycmVudCBsaW5lXG4gICAgICoqL1xuICAgIHNldEhpZ2hsaWdodEFjdGl2ZUxpbmUoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0QWN0aXZlTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGN1cnJlbnQgbGluZXMgYXJlIGFsd2F5cyBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIaWdobGlnaHRBY3RpdmVMaW5lKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRBY3RpdmVMaW5lXCIpO1xuICAgIH1cblxuICAgIHNldEhpZ2hsaWdodEd1dHRlckxpbmUoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIGdldEhpZ2hsaWdodEd1dHRlckxpbmUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyBpZiB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHdvcmQgc2hvdWxkIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkSGlnaGxpZ2h0IFNldCB0byBgdHJ1ZWAgdG8gaGlnaGxpZ2h0IHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgd29yZFxuICAgICAqXG4gICAgICoqL1xuICAgIHNldEhpZ2hsaWdodFNlbGVjdGVkV29yZChzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRTZWxlY3RlZFdvcmRcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQgd29yZHMgYXJlIHRvIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhpZ2hsaWdodFNlbGVjdGVkV29yZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGhpZ2hsaWdodFNlbGVjdGVkV29yZDtcbiAgICB9XG5cbiAgICBzZXRBbmltYXRlZFNjcm9sbChzaG91bGRBbmltYXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldEFuaW1hdGVkU2Nyb2xsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHNob3dJbnZpc2libGVzYCBpcyBzZXQgdG8gYHRydWVgLCBpbnZpc2libGUgY2hhcmFjdGVycyZtZGFzaDtsaWtlIHNwYWNlcyBvciBuZXcgbGluZXMmbWRhc2g7YXJlIHNob3cgaW4gdGhlIGVkaXRvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2hvd0ludmlzaWJsZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dJbnZpc2libGVzIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzaG93IGludmlzaWJsZSBjaGFyYWN0ZXJzLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgaW52aXNpYmxlIGNoYXJhY3RlcnMgYXJlIGJlaW5nIHNob3duLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldFNob3dJbnZpc2libGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRTaG93SW52aXNpYmxlcygpO1xuICAgIH1cblxuICAgIHNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlczogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldERpc3BsYXlJbmRlbnRHdWlkZXMoZGlzcGxheUluZGVudEd1aWRlcyk7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUluZGVudEd1aWRlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0RGlzcGxheUluZGVudEd1aWRlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGBzaG93UHJpbnRNYXJnaW5gIGlzIHNldCB0byBgdHJ1ZWAsIHRoZSBwcmludCBtYXJnaW4gaXMgc2hvd24gaW4gdGhlIGVkaXRvci5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dQcmludE1hcmdpbiBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gc2hvdyB0aGUgcHJpbnQgbWFyZ2luXG4gICAgICoqL1xuICAgIHNldFNob3dQcmludE1hcmdpbihzaG93UHJpbnRNYXJnaW46IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaG93UHJpbnRNYXJnaW4oc2hvd1ByaW50TWFyZ2luKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgcHJpbnQgbWFyZ2luIGlzIGJlaW5nIHNob3duLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd1ByaW50TWFyZ2luKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjb2x1bW4gZGVmaW5pbmcgd2hlcmUgdGhlIHByaW50IG1hcmdpbiBzaG91bGQgYmUuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNob3dQcmludE1hcmdpbiBTcGVjaWZpZXMgdGhlIG5ldyBwcmludCBtYXJnaW5cbiAgICAgKi9cbiAgICBzZXRQcmludE1hcmdpbkNvbHVtbihzaG93UHJpbnRNYXJnaW46IG51bWJlcikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFByaW50TWFyZ2luQ29sdW1uKHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29sdW1uIG51bWJlciBvZiB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIGlzLlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKi9cbiAgICBnZXRQcmludE1hcmdpbkNvbHVtbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRQcmludE1hcmdpbkNvbHVtbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGByZWFkT25seWAgaXMgdHJ1ZSwgdGhlbiB0aGUgZWRpdG9yIGlzIHNldCB0byByZWFkLW9ubHkgbW9kZSwgYW5kIG5vbmUgb2YgdGhlIGNvbnRlbnQgY2FuIGNoYW5nZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0UmVhZE9ubHlcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJlYWRPbmx5IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBlZGl0b3IgY2FuIGJlIG1vZGlmaWVkIG9yIG5vdC5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFJlYWRPbmx5KHJlYWRPbmx5OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwicmVhZE9ubHlcIiwgcmVhZE9ubHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBlZGl0b3IgaXMgc2V0IHRvIHJlYWQtb25seSBtb2RlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldFJlYWRPbmx5KCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJyZWFkT25seVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTcGVjaWZpZXMgd2hldGhlciB0byB1c2UgYmVoYXZpb3JzIG9yIG5vdC4gW1wiQmVoYXZpb3JzXCIgaW4gdGhpcyBjYXNlIGlzIHRoZSBhdXRvLXBhaXJpbmcgb2Ygc3BlY2lhbCBjaGFyYWN0ZXJzLCBsaWtlIHF1b3RhdGlvbiBtYXJrcywgcGFyZW50aGVzaXMsIG9yIGJyYWNrZXRzLl17OiAjQmVoYXZpb3JzRGVmfVxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZCBFbmFibGVzIG9yIGRpc2FibGVzIGJlaGF2aW9yc1xuICAgICAqXG4gICAgICoqL1xuICAgIHNldEJlaGF2aW91cnNFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJiZWhhdmlvdXJzRW5hYmxlZFwiLCBlbmFibGVkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgYmVoYXZpb3JzIGFyZSBjdXJyZW50bHkgZW5hYmxlZC4gezpCZWhhdmlvcnNEZWZ9XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRCZWhhdmlvdXJzRW5hYmxlZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiYmVoYXZpb3Vyc0VuYWJsZWRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BlY2lmaWVzIHdoZXRoZXIgdG8gdXNlIHdyYXBwaW5nIGJlaGF2aW9ycyBvciBub3QsIGkuZS4gYXV0b21hdGljYWxseSB3cmFwcGluZyB0aGUgc2VsZWN0aW9uIHdpdGggY2hhcmFjdGVycyBzdWNoIGFzIGJyYWNrZXRzXG4gICAgICogd2hlbiBzdWNoIGEgY2hhcmFjdGVyIGlzIHR5cGVkIGluLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZCBFbmFibGVzIG9yIGRpc2FibGVzIHdyYXBwaW5nIGJlaGF2aW9yc1xuICAgICAqXG4gICAgICoqL1xuICAgIHNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwid3JhcEJlaGF2aW91cnNFbmFibGVkXCIsIGVuYWJsZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSB3cmFwcGluZyBiZWhhdmlvcnMgYXJlIGN1cnJlbnRseSBlbmFibGVkLlxuICAgICAqKi9cbiAgICBnZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcIndyYXBCZWhhdmlvdXJzRW5hYmxlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgd2hldGhlciB0aGUgZm9sZCB3aWRnZXRzIHNob3VsZCBiZSBzaG93biBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBmb2xkIHdpZGdldHMgYXJlIHNob3duXG4gICAgICoqL1xuICAgIHNldFNob3dGb2xkV2lkZ2V0cyhzaG93OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ZvbGRXaWRnZXRzXCIsIHNob3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBmb2xkIHdpZGdldHMgYXJlIHNob3duLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ZvbGRXaWRnZXRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93Rm9sZFdpZGdldHNcIik7XG4gICAgfVxuXG4gICAgc2V0RmFkZUZvbGRXaWRnZXRzKGZhZGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIiwgZmFkZSk7XG4gICAgfVxuXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB3b3JkcyBvZiB0ZXh0IGZyb20gdGhlIGVkaXRvci5cbiAgICAgKiBBIFwid29yZFwiIGlzIGRlZmluZWQgYXMgYSBzdHJpbmcgb2YgY2hhcmFjdGVycyBib29rZW5kZWQgYnkgd2hpdGVzcGFjZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgcmVtb3ZlXG4gICAgICogQHBhcmFtIGRpcmVjdGlvbiB7c3RyaW5nfSBUaGUgZGlyZWN0aW9uIG9mIHRoZSBkZWxldGlvbiB0byBvY2N1ciwgZWl0aGVyIFwibGVmdFwiIG9yIFwicmlnaHRcIi5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHJlbW92ZShkaXJlY3Rpb246IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICBpZiAoZGlyZWN0aW9uID09PSBcImxlZnRcIilcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RMZWZ0KCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0UmlnaHQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzZWxlY3Rpb25SYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHRoaXMuZ2V0QmVoYXZpb3Vyc0VuYWJsZWQoKSkge1xuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgICAgICB2YXIgc3RhdGUgPSBzZXNzaW9uLmdldFN0YXRlKHNlbGVjdGlvblJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgICAgICB2YXIgbmV3UmFuZ2U6IFJhbmdlID0gPFJhbmdlPnNlc3Npb24uZ2V0TW9kZSgpLnRyYW5zZm9ybUFjdGlvbihzdGF0ZSwgJ2RlbGV0aW9uJywgdGhpcywgc2Vzc2lvbiwgc2VsZWN0aW9uUmFuZ2UpO1xuXG4gICAgICAgICAgICBpZiAoc2VsZWN0aW9uUmFuZ2UuZW5kLmNvbHVtbiA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHZhciB0ZXh0ID0gc2Vzc2lvbi5nZXRUZXh0UmFuZ2Uoc2VsZWN0aW9uUmFuZ2UpO1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0W3RleHQubGVuZ3RoIC0gMV0gPT09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoc2VsZWN0aW9uUmFuZ2UuZW5kLnJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgvXlxccyskLy50ZXN0KGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25SYW5nZS5lbmQuY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmV3UmFuZ2UpIHtcbiAgICAgICAgICAgICAgICBzZWxlY3Rpb25SYW5nZSA9IG5ld1JhbmdlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZShzZWxlY3Rpb25SYW5nZSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSB3b3JkIGRpcmVjdGx5IHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlbW92ZVdvcmRSaWdodFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcmVtb3ZlV29yZFJpZ2h0KCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RXb3JkUmlnaHQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIHdvcmQgZGlyZWN0bHkgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCByZW1vdmVXb3JkTGVmdFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcmVtb3ZlV29yZExlZnQoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RXb3JkTGVmdCgpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYWxsIHRoZSB3b3JkcyB0byB0aGUgbGVmdCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24sIHVudGlsIHRoZSBzdGFydCBvZiB0aGUgbGluZS5cbiAgICAgKiovXG4gICAgcmVtb3ZlVG9MaW5lU3RhcnQoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RMaW5lU3RhcnQoKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCB0aGUgd29yZHMgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgdW50aWwgdGhlIGVuZCBvZiB0aGUgbGluZS5cbiAgICAgKiovXG4gICAgcmVtb3ZlVG9MaW5lRW5kKCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0TGluZUVuZCgpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LmNvbHVtbiA9PT0gcmFuZ2UuZW5kLmNvbHVtbiAmJiByYW5nZS5zdGFydC5yb3cgPT09IHJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdysrO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTcGxpdHMgdGhlIGxpbmUgYXQgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIChieSBpbnNlcnRpbmcgYW4gYCdcXG4nYCkuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNwbGl0TGluZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc3BsaXRMaW5lKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoXCJcXG5cIiwgZmFsc2UpO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKGN1cnNvcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVHJhbnNwb3NlcyBjdXJyZW50IGxpbmUuXG4gICAgICoqL1xuICAgIHRyYW5zcG9zZUxldHRlcnMoKSB7XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgY29sdW1uID0gY3Vyc29yLmNvbHVtbjtcbiAgICAgICAgaWYgKGNvbHVtbiA9PT0gMClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgbGluZSA9IHRoaXMuc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgc3dhcCwgcmFuZ2U7XG4gICAgICAgIGlmIChjb2x1bW4gPCBsaW5lLmxlbmd0aCkge1xuICAgICAgICAgICAgc3dhcCA9IGxpbmUuY2hhckF0KGNvbHVtbikgKyBsaW5lLmNoYXJBdChjb2x1bW4gLSAxKTtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKGN1cnNvci5yb3csIGNvbHVtbiAtIDEsIGN1cnNvci5yb3csIGNvbHVtbiArIDEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc3dhcCA9IGxpbmUuY2hhckF0KGNvbHVtbiAtIDEpICsgbGluZS5jaGFyQXQoY29sdW1uIC0gMik7XG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShjdXJzb3Iucm93LCBjb2x1bW4gLSAyLCBjdXJzb3Iucm93LCBjb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCBzd2FwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0cyB0aGUgY3VycmVudCBzZWxlY3Rpb24gZW50aXJlbHkgaW50byBsb3dlcmNhc2UuXG4gICAgICoqL1xuICAgIHRvTG93ZXJDYXNlKCkge1xuICAgICAgICB2YXIgb3JpZ2luYWxSYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgdGV4dC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2Uob3JpZ2luYWxSYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udmVydHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGVudGlyZWx5IGludG8gdXBwZXJjYXNlLlxuICAgICAqKi9cbiAgICB0b1VwcGVyQ2FzZSgpIHtcbiAgICAgICAgdmFyIG9yaWdpbmFsUmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHRleHQgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHRleHQudG9VcHBlckNhc2UoKSk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKG9yaWdpbmFsUmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluc2VydHMgYW4gaW5kZW50YXRpb24gaW50byB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24gb3IgaW5kZW50cyB0aGUgc2VsZWN0ZWQgbGluZXMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGluZGVudFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgaW5kZW50KCk6IHZvaWQge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuXG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPCByYW5nZS5lbmQucm93KSB7XG4gICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICAgICAgc2Vzc2lvbi5pbmRlbnRSb3dzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCwgXCJcXHRcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocmFuZ2Uuc3RhcnQuY29sdW1uIDwgcmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICAgICAgdmFyIHRleHQgPSBzZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoIS9eXFxzKyQvLnRlc3QodGV4dCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKHJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgIHZhciBwb3NpdGlvbiA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgc2l6ZSA9IHNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICB2YXIgY29sdW1uID0gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uKHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uKTtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHZhciBjb3VudCA9IChzaXplIC0gY29sdW1uICUgc2l6ZSk7XG4gICAgICAgICAgICB2YXIgaW5kZW50U3RyaW5nID0gc3RyaW5nUmVwZWF0KFwiIFwiLCBjb3VudCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgY291bnQgPSBjb2x1bW4gJSBzaXplO1xuICAgICAgICAgICAgd2hpbGUgKGxpbmVbcmFuZ2Uuc3RhcnQuY29sdW1uXSA9PT0gXCIgXCIgJiYgY291bnQpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4tLTtcbiAgICAgICAgICAgICAgICBjb3VudC0tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaW5kZW50U3RyaW5nID0gXCJcXHRcIjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5pbnNlcnQoaW5kZW50U3RyaW5nLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kZW50cyB0aGUgY3VycmVudCBsaW5lLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBibG9ja0luZGVudFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uaW5kZW50Um93c1xuICAgICAqL1xuICAgIGJsb2NrSW5kZW50KCk6IHZvaWQge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB0aGlzLnNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE91dGRlbnRzIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ub3V0ZGVudFJvd3NcbiAgICAgKiovXG4gICAgYmxvY2tPdXRkZW50KCkge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlc3Npb24ub3V0ZGVudFJvd3Moc2VsZWN0aW9uLmdldFJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IG1vdmUgb3V0IG9mIGNvcmUgd2hlbiB3ZSBoYXZlIGdvb2QgbWVjaGFuaXNtIGZvciBtYW5hZ2luZyBleHRlbnNpb25zXG4gICAgc29ydExpbmVzKCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgbGluZXMgPSBbXTtcbiAgICAgICAgZm9yIChpID0gcm93cy5maXJzdDsgaSA8PSByb3dzLmxhc3Q7IGkrKylcbiAgICAgICAgICAgIGxpbmVzLnB1c2goc2Vzc2lvbi5nZXRMaW5lKGkpKTtcblxuICAgICAgICBsaW5lcy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmIChhLnRvTG93ZXJDYXNlKCkgPCBiLnRvTG93ZXJDYXNlKCkpIHJldHVybiAtMTtcbiAgICAgICAgICAgIGlmIChhLnRvTG93ZXJDYXNlKCkgPiBiLnRvTG93ZXJDYXNlKCkpIHJldHVybiAxO1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBkZWxldGVSYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHJvd3MuZmlyc3Q7IGkgPD0gcm93cy5sYXN0OyBpKyspIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGkpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQucm93ID0gaTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGxpbmUubGVuZ3RoO1xuICAgICAgICAgICAgc2Vzc2lvbi5yZXBsYWNlKGRlbGV0ZVJhbmdlLCBsaW5lc1tpIC0gcm93cy5maXJzdF0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCByYW5nZSwgdGhpcyBmdW5jdGlvbiBlaXRoZXIgY29tbWVudHMgYWxsIHRoZSBsaW5lcywgb3IgdW5jb21tZW50cyBhbGwgb2YgdGhlbS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdG9nZ2xlQ29tbWVudExpbmVzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB0b2dnbGVDb21tZW50TGluZXMoKTogdm9pZCB7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXMuc2Vzc2lvbi5nZXRTdGF0ZSh0aGlzLmdldEN1cnNvclBvc2l0aW9uKCkucm93KTtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmdldE1vZGUoKS50b2dnbGVDb21tZW50TGluZXMoc3RhdGUsIHRoaXMuc2Vzc2lvbiwgcm93cy5maXJzdCwgcm93cy5sYXN0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHRvZ2dsZUJsb2NrQ29tbWVudFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdG9nZ2xlQmxvY2tDb21tZW50KCk6IHZvaWQge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgc3RhdGUgPSB0aGlzLnNlc3Npb24uZ2V0U3RhdGUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmdldE1vZGUoKS50b2dnbGVCbG9ja0NvbW1lbnQoc3RhdGUsIHRoaXMuc2Vzc2lvbiwgcmFuZ2UsIGN1cnNvcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV29ya3MgbGlrZSBbW0VkaXRTZXNzaW9uLmdldFRva2VuQXRdXSwgZXhjZXB0IGl0IHJldHVybnMgYSBudW1iZXIuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXROdW1iZXJBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHZhbHVlOiBzdHJpbmc7IHN0YXJ0OiBudW1iZXI7IGVuZDogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgX251bWJlclJ4ID0gL1tcXC1dP1swLTldKyg/OlxcLlswLTldKyk/L2c7XG4gICAgICAgIF9udW1iZXJSeC5sYXN0SW5kZXggPSAwO1xuXG4gICAgICAgIHZhciBzID0gdGhpcy5zZXNzaW9uLmdldExpbmUocm93KTtcbiAgICAgICAgd2hpbGUgKF9udW1iZXJSeC5sYXN0SW5kZXggPCBjb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciBtOiBSZWdFeHBFeGVjQXJyYXkgPSBfbnVtYmVyUnguZXhlYyhzKTtcbiAgICAgICAgICAgIGlmIChtLmluZGV4IDw9IGNvbHVtbiAmJiBtLmluZGV4ICsgbVswXS5sZW5ndGggPj0gY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJldHZhbCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG1bMF0sXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBtLmluZGV4LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IG0uaW5kZXggKyBtWzBdLmxlbmd0aFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJldHZhbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0aGUgY2hhcmFjdGVyIGJlZm9yZSB0aGUgY3Vyc29yIGlzIGEgbnVtYmVyLCB0aGlzIGZ1bmN0aW9ucyBjaGFuZ2VzIGl0cyB2YWx1ZSBieSBgYW1vdW50YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gYW1vdW50IFRoZSB2YWx1ZSB0byBjaGFuZ2UgdGhlIG51bWVyYWwgYnkgKGNhbiBiZSBuZWdhdGl2ZSB0byBkZWNyZWFzZSB2YWx1ZSlcbiAgICAgKi9cbiAgICBtb2RpZnlOdW1iZXIoYW1vdW50OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdmFyIHJvdyA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLnJvdztcbiAgICAgICAgdmFyIGNvbHVtbiA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLmNvbHVtbjtcblxuICAgICAgICAvLyBnZXQgdGhlIGNoYXIgYmVmb3JlIHRoZSBjdXJzb3JcbiAgICAgICAgdmFyIGNoYXJSYW5nZSA9IG5ldyBSYW5nZShyb3csIGNvbHVtbiAtIDEsIHJvdywgY29sdW1uKTtcblxuICAgICAgICB2YXIgYyA9IHBhcnNlRmxvYXQodGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShjaGFyUmFuZ2UpKTtcbiAgICAgICAgLy8gaWYgdGhlIGNoYXIgaXMgYSBkaWdpdFxuICAgICAgICBpZiAoIWlzTmFOKGMpICYmIGlzRmluaXRlKGMpKSB7XG4gICAgICAgICAgICAvLyBnZXQgdGhlIHdob2xlIG51bWJlciB0aGUgZGlnaXQgaXMgcGFydCBvZlxuICAgICAgICAgICAgdmFyIG5yID0gdGhpcy5nZXROdW1iZXJBdChyb3csIGNvbHVtbik7XG4gICAgICAgICAgICAvLyBpZiBudW1iZXIgZm91bmRcbiAgICAgICAgICAgIGlmIChucikge1xuICAgICAgICAgICAgICAgIHZhciBmcCA9IG5yLnZhbHVlLmluZGV4T2YoXCIuXCIpID49IDAgPyBuci5zdGFydCArIG5yLnZhbHVlLmluZGV4T2YoXCIuXCIpICsgMSA6IG5yLmVuZDtcbiAgICAgICAgICAgICAgICB2YXIgZGVjaW1hbHMgPSBuci5zdGFydCArIG5yLnZhbHVlLmxlbmd0aCAtIGZwO1xuXG4gICAgICAgICAgICAgICAgdmFyIHQgPSBwYXJzZUZsb2F0KG5yLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB0ICo9IE1hdGgucG93KDEwLCBkZWNpbWFscyk7XG5cblxuICAgICAgICAgICAgICAgIGlmIChmcCAhPT0gbnIuZW5kICYmIGNvbHVtbiA8IGZwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFtb3VudCAqPSBNYXRoLnBvdygxMCwgbnIuZW5kIC0gY29sdW1uIC0gMSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYW1vdW50ICo9IE1hdGgucG93KDEwLCBuci5lbmQgLSBjb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHQgKz0gYW1vdW50O1xuICAgICAgICAgICAgICAgIHQgLz0gTWF0aC5wb3coMTAsIGRlY2ltYWxzKTtcbiAgICAgICAgICAgICAgICB2YXIgbm5yID0gdC50b0ZpeGVkKGRlY2ltYWxzKTtcblxuICAgICAgICAgICAgICAgIC8vdXBkYXRlIG51bWJlclxuICAgICAgICAgICAgICAgIHZhciByZXBsYWNlUmFuZ2UgPSBuZXcgUmFuZ2Uocm93LCBuci5zdGFydCwgcm93LCBuci5lbmQpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJlcGxhY2VSYW5nZSwgbm5yKTtcblxuICAgICAgICAgICAgICAgIC8vcmVwb3NpdGlvbiB0aGUgY3Vyc29yXG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8ocm93LCBNYXRoLm1heChuci5zdGFydCArIDEsIGNvbHVtbiArIG5uci5sZW5ndGggLSBuci52YWx1ZS5sZW5ndGgpKTtcblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIGxpbmVzIGluIHRoZSBjdXJyZW50IHNlbGVjdGlvblxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnJlbW92ZVxuICAgICAqKi9cbiAgICByZW1vdmVMaW5lcygpIHtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdmFyIHJhbmdlO1xuICAgICAgICBpZiAocm93cy5maXJzdCA9PT0gMCB8fCByb3dzLmxhc3QgKyAxIDwgdGhpcy5zZXNzaW9uLmdldExlbmd0aCgpKVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2Uocm93cy5maXJzdCwgMCwgcm93cy5sYXN0ICsgMSwgMCk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgIHJvd3MuZmlyc3QgLSAxLCB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3dzLmZpcnN0IC0gMSkubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHJvd3MubGFzdCwgdGhpcy5zZXNzaW9uLmdldExpbmUocm93cy5sYXN0KS5sZW5ndGhcbiAgICAgICAgICAgICk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgZHVwbGljYXRlU2VsZWN0aW9uKCkge1xuICAgICAgICB2YXIgc2VsID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciBkb2MgPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByYW5nZSA9IHNlbC5nZXRSYW5nZSgpO1xuICAgICAgICB2YXIgcmV2ZXJzZSA9IHNlbC5pc0JhY2t3YXJkcygpO1xuICAgICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgZG9jLmR1cGxpY2F0ZUxpbmVzKHJvdywgcm93KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwb2ludCA9IHJldmVyc2UgPyByYW5nZS5zdGFydCA6IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIHZhciBlbmRQb2ludCA9IGRvYy5pbnNlcnQocG9pbnQsIGRvYy5nZXRUZXh0UmFuZ2UocmFuZ2UpKTtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcG9pbnQ7XG4gICAgICAgICAgICByYW5nZS5lbmQgPSBlbmRQb2ludDtcblxuICAgICAgICAgICAgc2VsLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlLCByZXZlcnNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIGRvd24gb25lIHJvdy5cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge051bWJlcn0gT24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5tb3ZlTGluZXNVcFxuICAgICAqKi9cbiAgICBtb3ZlTGluZXNEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlTGluZXMoZnVuY3Rpb24oZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24ubW92ZUxpbmVzRG93bihmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIHVwIG9uZSByb3cuXG4gICAgICogQHJldHVybiB7TnVtYmVyfSBPbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVMaW5lc0Rvd25cbiAgICAgKiovXG4gICAgbW92ZUxpbmVzVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlTGluZXNVcChmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIGEgcmFuZ2Ugb2YgdGV4dCBmcm9tIHRoZSBnaXZlbiByYW5nZSB0byB0aGUgZ2l2ZW4gcG9zaXRpb24uIGB0b1Bvc2l0aW9uYCBpcyBhbiBvYmplY3QgdGhhdCBsb29rcyBsaWtlIHRoaXM6XG4gICAgICogYGBganNvblxuICAgICAqICAgIHsgcm93OiBuZXdSb3dMb2NhdGlvbiwgY29sdW1uOiBuZXdDb2x1bW5Mb2NhdGlvbiB9XG4gICAgICogYGBgXG4gICAgICogQHBhcmFtIHtSYW5nZX0gZnJvbVJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHlvdSB3YW50IG1vdmVkIHdpdGhpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtSYW5nZX0gVGhlIG5ldyByYW5nZSB3aGVyZSB0aGUgdGV4dCB3YXMgbW92ZWQgdG8uXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZVRleHRcbiAgICAgKiovXG4gICAgbW92ZVRleHQocmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlVGV4dChyYW5nZSwgdG9Qb3NpdGlvbiwgY29weSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgdXAgb25lIHJvdy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIHJldHVybnMgMC5cbiAgICAgKlxuICAgICAqKi9cbiAgICBjb3B5TGluZXNVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uZHVwbGljYXRlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvcGllcyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIGRvd24gb25lIHJvdy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIHJldHVybnMgdGhlIG51bWJlciBvZiBuZXcgcm93cyBhZGRlZDsgaW4gb3RoZXIgd29yZHMsIGBsYXN0Um93IC0gZmlyc3RSb3cgKyAxYC5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kdXBsaWNhdGVMaW5lc1xuICAgICAqXG4gICAgICoqL1xuICAgIGNvcHlMaW5lc0Rvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGVzIGEgc3BlY2lmaWMgZnVuY3Rpb24sIHdoaWNoIGNhbiBiZSBhbnl0aGluZyB0aGF0IG1hbmlwdWxhdGVzIHNlbGVjdGVkIGxpbmVzLCBzdWNoIGFzIGNvcHlpbmcgdGhlbSwgZHVwbGljYXRpbmcgdGhlbSwgb3Igc2hpZnRpbmcgdGhlbS5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBtb3ZlciBBIG1ldGhvZCB0byBjYWxsIG9uIGVhY2ggc2VsZWN0ZWQgcm93XG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBwcml2YXRlICRtb3ZlTGluZXMobW92ZXIpIHtcbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0aW9uO1xuICAgICAgICBpZiAoIXNlbGVjdGlvblsnaW5NdWx0aVNlbGVjdE1vZGUnXSB8fCB0aGlzLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHNlbGVjdGlvbi50b09yaWVudGVkUmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZFJvd3M6IHsgZmlyc3Q6IG51bWJlcjsgbGFzdDogbnVtYmVyIH0gPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgICAgIHZhciBsaW5lc01vdmVkID0gbW92ZXIuY2FsbCh0aGlzLCBzZWxlY3RlZFJvd3MuZmlyc3QsIHNlbGVjdGVkUm93cy5sYXN0KTtcbiAgICAgICAgICAgIHJhbmdlLm1vdmVCeShsaW5lc01vdmVkLCAwKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5mcm9tT3JpZW50ZWRSYW5nZShyYW5nZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2VzID0gc2VsZWN0aW9uLnJhbmdlTGlzdC5yYW5nZXM7XG4gICAgICAgICAgICBzZWxlY3Rpb24ucmFuZ2VMaXN0LmRldGFjaCgpO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gcmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZUluZGV4ID0gaTtcbiAgICAgICAgICAgICAgICB2YXIgY29sbGFwc2VkUm93cyA9IHJhbmdlc1tpXS5jb2xsYXBzZVJvd3MoKTtcbiAgICAgICAgICAgICAgICB2YXIgbGFzdCA9IGNvbGxhcHNlZFJvd3MuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgZmlyc3QgPSBjb2xsYXBzZWRSb3dzLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICB3aGlsZSAoaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbGxhcHNlZFJvd3MgPSByYW5nZXNbaV0uY29sbGFwc2VSb3dzKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaXJzdCAtIGNvbGxhcHNlZFJvd3MuZW5kLnJvdyA8PSAxKVxuICAgICAgICAgICAgICAgICAgICAgICAgZmlyc3QgPSBjb2xsYXBzZWRSb3dzLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpKys7XG5cbiAgICAgICAgICAgICAgICB2YXIgbGluZXNNb3ZlZCA9IG1vdmVyLmNhbGwodGhpcywgZmlyc3QsIGxhc3QpO1xuICAgICAgICAgICAgICAgIHdoaWxlIChyYW5nZUluZGV4ID49IGkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2VzW3JhbmdlSW5kZXhdLm1vdmVCeShsaW5lc01vdmVkLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2VJbmRleC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGVjdGlvbi5mcm9tT3JpZW50ZWRSYW5nZShzZWxlY3Rpb24ucmFuZ2VzWzBdKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5yYW5nZUxpc3QuYXR0YWNoKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgcm93cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgJGdldFNlbGVjdGVkUm93c1xuICAgICAqIEByZXR1cm4ge0ZpcnN0QW5kTGFzdH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJGdldFNlbGVjdGVkUm93cygpOiBGaXJzdEFuZExhc3Qge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuY29sbGFwc2VSb3dzKCk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGZpcnN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0KHJhbmdlLnN0YXJ0LnJvdyksXG4gICAgICAgICAgICBsYXN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZEVuZChyYW5nZS5lbmQucm93KVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25TdGFydCh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hvd0NvbXBvc2l0aW9uKHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKSk7XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvblVwZGF0ZSh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q29tcG9zaXRpb25UZXh0KHRleHQpO1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25FbmQoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93fVxuICAgICAqXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3dcbiAgICAgKiovXG4gICAgZ2V0Rmlyc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93fVxuICAgICAqXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvd1xuICAgICAqKi9cbiAgICBnZXRMYXN0VmlzaWJsZVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvdygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyBpZiB0aGUgcm93IGlzIGN1cnJlbnRseSB2aXNpYmxlIG9uIHRoZSBzY3JlZW4uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIGNoZWNrXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc1Jvd1Zpc2libGUocm93OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChyb3cgPj0gdGhpcy5nZXRGaXJzdFZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5nZXRMYXN0VmlzaWJsZVJvdygpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgaWYgdGhlIGVudGlyZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgaXNSb3dGdWxseVZpc2libGUocm93OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChyb3cgPj0gdGhpcy5yZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdygpICYmIHJvdyA8PSB0aGlzLnJlbmRlcmVyLmdldExhc3RGdWxseVZpc2libGVSb3coKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGN1cnJlbnRseSB2aXNpYmlsZSByb3dzLlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKiovXG4gICAgcHJpdmF0ZSAkZ2V0VmlzaWJsZVJvd0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNjcm9sbEJvdHRvbVJvdygpIC0gdGhpcy5yZW5kZXJlci5nZXRTY3JvbGxUb3BSb3coKSArIDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRklYTUU6IFRoZSBzZW1hbnRpY3Mgb2Ygc2VsZWN0IGFyZSBub3QgZWFzaWx5IHVuZGVyc3Rvb2QuIFxuICAgICAqIEBwYXJhbSBkaXJlY3Rpb24gKzEgZm9yIHBhZ2UgZG93biwgLTEgZm9yIHBhZ2UgdXAuIE1heWJlIE4gZm9yIE4gcGFnZXM/XG4gICAgICogQHBhcmFtIHNlbGVjdCB0cnVlIHwgZmFsc2UgfCB1bmRlZmluZWRcbiAgICAgKi9cbiAgICBwcml2YXRlICRtb3ZlQnlQYWdlKGRpcmVjdGlvbjogbnVtYmVyLCBzZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIHZhciByZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLnJlbmRlcmVyLmxheWVyQ29uZmlnO1xuICAgICAgICB2YXIgcm93cyA9IGRpcmVjdGlvbiAqIE1hdGguZmxvb3IoY29uZmlnLmhlaWdodCAvIGNvbmZpZy5saW5lSGVpZ2h0KTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICBpZiAoc2VsZWN0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeShyb3dzLCAwKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNlbGVjdCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JCeShyb3dzLCAwKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gcmVuZGVyZXIuc2Nyb2xsVG9wO1xuXG4gICAgICAgIHJlbmRlcmVyLnNjcm9sbEJ5KDAsIHJvd3MgKiBjb25maWcubGluZUhlaWdodCk7XG4gICAgICAgIC8vIFdoeSBkb24ndCB3ZSBhc3NlcnQgb3VyIGFyZ3MgYW5kIGRvIHR5cGVvZiBzZWxlY3QgPT09ICd1bmRlZmluZWQnP1xuICAgICAgICBpZiAoc2VsZWN0ICE9IG51bGwpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdoZW4gc2VsZWN0IGlzIHVuZGVmaW5lZC5cbiAgICAgICAgICAgIHJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KG51bGwsIDAuNSk7XG4gICAgICAgIH1cblxuICAgICAgICByZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nKHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyB0aGUgdGV4dCBmcm9tIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCB1bnRpbCB3aGVyZSBhIFwicGFnZSBkb3duXCIgZmluaXNoZXMuXG4gICAgICoqL1xuICAgIHNlbGVjdFBhZ2VEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKCsxLCB0cnVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIHRoZSB0ZXh0IGZyb20gdGhlIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGRvY3VtZW50IHVudGlsIHdoZXJlIGEgXCJwYWdlIHVwXCIgZmluaXNoZXMuXG4gICAgICoqL1xuICAgIHNlbGVjdFBhZ2VVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgtMSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgZG93blwiIGlzLCBhcyB3ZWxsIGFzIG1vdmluZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBnb3RvUGFnZURvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoKzEsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSB1cFwiIGlzLCBhcyB3ZWxsIGFzIG1vdmluZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBnb3RvUGFnZVVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKC0xLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIGRvd25cIiBpcywgd2l0aG91dCBjaGFuZ2luZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBzY3JvbGxQYWdlRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgdXBcIiBpcywgd2l0aG91dCBjaGFuZ2luZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBzY3JvbGxQYWdlVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoLTEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBlZGl0b3IgdG8gdGhlIHNwZWNpZmllZCByb3cuXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvUm93XG4gICAgICovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb1Jvdyhyb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdG8gYSBsaW5lLiBJZiBgY2VudGVyYCBpcyBgdHJ1ZWAsIGl0IHB1dHMgdGhlIGxpbmUgaW4gbWlkZGxlIG9mIHNjcmVlbiAob3IgYXR0ZW1wdHMgdG8pLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lIFRoZSBsaW5lIHRvIHNjcm9sbCB0b1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gY2VudGVyIElmIGB0cnVlYFxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZXMgc2Nyb2xsaW5nXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGFuaW1hdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvTGluZVxuICAgICAqKi9cbiAgICBzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBjZW50ZXI6IGJvb2xlYW4sIGFuaW1hdGU6IGJvb2xlYW4sIGNhbGxiYWNrPzogKCkgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9MaW5lKGxpbmUsIGNlbnRlciwgYW5pbWF0ZSwgY2FsbGJhY2spO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEF0dGVtcHRzIHRvIGNlbnRlciB0aGUgY3VycmVudCBzZWxlY3Rpb24gb24gdGhlIHNjcmVlbi5cbiAgICAgKiovXG4gICAgY2VudGVyU2VsZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciBwb3MgPSB7XG4gICAgICAgICAgICByb3c6IE1hdGguZmxvb3IocmFuZ2Uuc3RhcnQucm93ICsgKHJhbmdlLmVuZC5yb3cgLSByYW5nZS5zdGFydC5yb3cpIC8gMiksXG4gICAgICAgICAgICBjb2x1bW46IE1hdGguZmxvb3IocmFuZ2Uuc3RhcnQuY29sdW1uICsgKHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW4pIC8gMilcbiAgICAgICAgfTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5hbGlnbkN1cnNvcihwb3MsIDAuNSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgY3Vyc29yLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRDdXJzb3JQb3NpdGlvblxuICAgICAqIEByZXR1cm4ge1Bvc2l0aW9ufVxuICAgICAqL1xuICAgIGdldEN1cnNvclBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHNjcmVlbiBwb3NpdGlvbiBvZiB0aGUgY3Vyc29yLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRDdXJzb3JQb3NpdGlvblNjcmVlblxuICAgICAqIEByZXR1cm4ge1Bvc2l0aW9ufVxuICAgICAqL1xuICAgIGdldEN1cnNvclBvc2l0aW9uU2NyZWVuKCk6IFBvc2l0aW9uIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKVxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGdldFNlbGVjdGlvblJhbmdlXG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgICovXG4gICAgZ2V0U2VsZWN0aW9uUmFuZ2UoKTogUmFuZ2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIGFsbCB0aGUgdGV4dCBpbiBlZGl0b3IuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNlbGVjdEFsbFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2VsZWN0QWxsKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RBbGwoKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGNsZWFyU2VsZWN0aW9uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBjbGVhclNlbGVjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzcGVjaWZpZWQgcm93IGFuZCBjb2x1bW4uIE5vdGUgdGhhdCB0aGlzIGRvZXMgbm90IGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgbmV3IHJvdyBudW1iZXJcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBuZXcgY29sdW1uIG51bWJlclxuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gYW5pbWF0ZVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLm1vdmVDdXJzb3JUb1xuICAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBhbmltYXRlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG8ocm93LCBjb2x1bW4sIGFuaW1hdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHBvc2l0aW9uIHNwZWNpZmllZCBieSBgcG9zaXRpb24ucm93YCBhbmQgYHBvc2l0aW9uLmNvbHVtbmAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIG1vdmVDdXJzb3JUb1Bvc2l0aW9uXG4gICAgICogQHBhcmFtIHBvc2l0aW9uIHtQb3NpdGlvbn0gQW4gb2JqZWN0IHdpdGggdHdvIHByb3BlcnRpZXMsIHJvdyBhbmQgY29sdW1uXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBtb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiB2b2lkIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yJ3Mgcm93IGFuZCBjb2x1bW4gdG8gdGhlIG5leHQgbWF0Y2hpbmcgYnJhY2tldCBvciBIVE1MIHRhZy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QganVtcFRvTWF0Y2hpbmdcbiAgICAgKiBAcGFyYW0gc2VsZWN0IHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAganVtcFRvTWF0Y2hpbmcoc2VsZWN0OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMuc2Vzc2lvbiwgY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgICAgIHZhciBwcmV2VG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcbiAgICAgICAgdmFyIHRva2VuID0gcHJldlRva2VuO1xuXG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG5cbiAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAvL2dldCBuZXh0IGNsb3NpbmcgdGFnIG9yIGJyYWNrZXRcbiAgICAgICAgdmFyIG1hdGNoVHlwZTtcbiAgICAgICAgdmFyIGZvdW5kID0gZmFsc2U7XG4gICAgICAgIHZhciBkZXB0aCA9IHt9O1xuICAgICAgICB2YXIgaSA9IGN1cnNvci5jb2x1bW4gLSB0b2tlbi5zdGFydDtcbiAgICAgICAgdmFyIGJyYWNrZXRUeXBlO1xuICAgICAgICB2YXIgYnJhY2tldHMgPSB7XG4gICAgICAgICAgICBcIilcIjogXCIoXCIsXG4gICAgICAgICAgICBcIihcIjogXCIoXCIsXG4gICAgICAgICAgICBcIl1cIjogXCJbXCIsXG4gICAgICAgICAgICBcIltcIjogXCJbXCIsXG4gICAgICAgICAgICBcIntcIjogXCJ7XCIsXG4gICAgICAgICAgICBcIn1cIjogXCJ7XCJcbiAgICAgICAgfTtcblxuICAgICAgICBkbyB7XG4gICAgICAgICAgICBpZiAodG9rZW4udmFsdWUubWF0Y2goL1t7fSgpXFxbXFxdXS9nKSkge1xuICAgICAgICAgICAgICAgIGZvciAoOyBpIDwgdG9rZW4udmFsdWUubGVuZ3RoICYmICFmb3VuZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYnJhY2tldHNbdG9rZW4udmFsdWVbaV1dKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGJyYWNrZXRUeXBlID0gYnJhY2tldHNbdG9rZW4udmFsdWVbaV1dICsgJy4nICsgdG9rZW4udHlwZS5yZXBsYWNlKFwicnBhcmVuXCIsIFwibHBhcmVuXCIpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc05hTihkZXB0aFticmFja2V0VHlwZV0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFticmFja2V0VHlwZV0gPSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgc3dpdGNoICh0b2tlbi52YWx1ZVtpXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnKCc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdbJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ3snOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW2JyYWNrZXRUeXBlXSsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnKSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICddJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ30nOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW2JyYWNrZXRUeXBlXS0tO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlcHRoW2JyYWNrZXRUeXBlXSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hUeXBlID0gJ2JyYWNrZXQnO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGlmIChpc05hTihkZXB0aFt0b2tlbi52YWx1ZV0pKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoW3Rva2VuLnZhbHVlXSA9IDA7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoW3Rva2VuLnZhbHVlXSsrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGhbdG9rZW4udmFsdWVdLS07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGRlcHRoW3Rva2VuLnZhbHVlXSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hUeXBlID0gJ3RhZyc7XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghZm91bmQpIHtcbiAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSB0b2tlbjtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gd2hpbGUgKHRva2VuICYmICFmb3VuZCk7XG5cbiAgICAgICAgLy9ubyBtYXRjaCBmb3VuZFxuICAgICAgICBpZiAoIW1hdGNoVHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlOiBSYW5nZTtcbiAgICAgICAgaWYgKG1hdGNoVHlwZSA9PT0gJ2JyYWNrZXQnKSB7XG4gICAgICAgICAgICByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UoY3Vyc29yKTtcbiAgICAgICAgICAgIGlmICghcmFuZ2UpIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgaSAtIDEsXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIGkgLSAxXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoIXJhbmdlKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChwb3Mucm93ID09PSBjdXJzb3Iucm93ICYmIE1hdGguYWJzKHBvcy5jb2x1bW4gLSBjdXJzb3IuY29sdW1uKSA8IDIpXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldEJyYWNrZXRSYW5nZShwb3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG1hdGNoVHlwZSA9PT0gJ3RhZycpIHtcbiAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKVxuICAgICAgICAgICAgICAgIHZhciB0YWcgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSAtIDIsXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgLSAyXG4gICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAvL2ZpbmQgbWF0Y2hpbmcgdGFnXG4gICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGZvdW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHByZXZUb2tlbjtcbiAgICAgICAgICAgICAgICAgICAgcHJldlRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi50eXBlLmluZGV4T2YoJ3RhZy1jbG9zZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJhbmdlLnNldEVuZChpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSwgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlID09PSB0YWcgJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFt0YWddKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbdGFnXS0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZXB0aFt0YWddID09PSAwKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IHdoaWxlIChwcmV2VG9rZW4gJiYgIWZvdW5kKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy93ZSBmb3VuZCBpdFxuICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSkge1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocG9zLnJvdyA9PSBjdXJzb3Iucm93ICYmIE1hdGguYWJzKHBvcy5jb2x1bW4gLSBjdXJzb3IuY29sdW1uKSA8IDIpXG4gICAgICAgICAgICAgICAgICAgIHBvcyA9IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHBvcyA9IHJhbmdlICYmIHJhbmdlWydjdXJzb3InXSB8fCBwb3M7XG4gICAgICAgIGlmIChwb3MpIHtcbiAgICAgICAgICAgIGlmIChzZWxlY3QpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UgJiYgcmFuZ2UuaXNFcXVhbCh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpKVxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RUbyhwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbyhwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNwZWNpZmllZCBsaW5lIG51bWJlciwgYW5kIGFsc28gaW50byB0aGUgaW5kaWNpYXRlZCBjb2x1bW4uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxpbmVOdW1iZXIgVGhlIGxpbmUgbnVtYmVyIHRvIGdvIHRvXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBBIGNvbHVtbiBudW1iZXIgdG8gZ28gdG9cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGVzIHNjb2xsaW5nXG4gICAgICoqL1xuICAgIGdvdG9MaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uPzogbnVtYmVyLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlc3Npb24udW5mb2xkKHsgcm93OiBsaW5lTnVtYmVyIC0gMSwgY29sdW1uOiBjb2x1bW4gfHwgMCB9KTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICAvLyB0b2RvOiBmaW5kIGEgd2F5IHRvIGF1dG9tYXRpY2FsbHkgZXhpdCBtdWx0aXNlbGVjdCBtb2RlXG4gICAgICAgIHRoaXMuZXhpdE11bHRpU2VsZWN0TW9kZSAmJiB0aGlzLmV4aXRNdWx0aVNlbGVjdE1vZGUoKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG8obGluZU51bWJlciAtIDEsIGNvbHVtbiB8fCAwKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcblxuICAgICAgICBpZiAoIXRoaXMuaXNSb3dGdWxseVZpc2libGUobGluZU51bWJlciAtIDEpKSB7XG4gICAgICAgICAgICB0aGlzLnNjcm9sbFRvTGluZShsaW5lTnVtYmVyIC0gMSwgdHJ1ZSwgYW5pbWF0ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzcGVjaWZpZWQgcm93IGFuZCBjb2x1bW4uIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBuZXcgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIG5ldyBjb2x1bW4gbnVtYmVyXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvci5tb3ZlQ3Vyc29yVG9cbiAgICAgKiovXG4gICAgbmF2aWdhdGVUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHVwIGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVVwKHRpbWVzOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkgJiYgIXRoaXMuc2VsZWN0aW9uLmlzQmFja3dhcmRzKCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25TdGFydCA9IHRoaXMuc2VsZWN0aW9uLmFuY2hvci5nZXRQb3NpdGlvbigpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uU3RhcnQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JCeSgtdGltZXMgfHwgLTEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgZG93biBpbiB0aGUgZG9jdW1lbnQgdGhlIHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZXMgVGhlIG51bWJlciBvZiB0aW1lcyB0byBjaGFuZ2UgbmF2aWdhdGlvblxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgbmF2aWdhdGVEb3duKHRpbWVzOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkgJiYgdGhpcy5zZWxlY3Rpb24uaXNCYWNrd2FyZHMoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVuZCA9IHRoaXMuc2VsZWN0aW9uLmFuY2hvci5nZXRQb3NpdGlvbigpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uRW5kKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkodGltZXMgfHwgMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciBsZWZ0IGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUxlZnQodGltZXM6IG51bWJlcikge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpLnN0YXJ0O1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25TdGFydCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aW1lcyA9IHRpbWVzIHx8IDE7XG4gICAgICAgICAgICB3aGlsZSAodGltZXMtLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JMZWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgcmlnaHQgaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlUmlnaHQodGltZXM6IG51bWJlcikge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVuZCA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKS5lbmQ7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvbkVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aW1lcyA9IHRpbWVzIHx8IDE7XG4gICAgICAgICAgICB3aGlsZSAodGltZXMtLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JSaWdodCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHN0YXJ0IG9mIHRoZSBjdXJyZW50IGxpbmUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVMaW5lU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JMaW5lU3RhcnQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGxpbmUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVMaW5lRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZUVuZCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgZmlsZS4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUZpbGVFbmQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlRW5kKCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHN0YXJ0IG9mIHRoZSBjdXJyZW50IGZpbGUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVGaWxlU3RhcnQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlU3RhcnQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBpbW1lZGlhdGVseSB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnQgcG9zaXRpb24uIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVXb3JkUmlnaHQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkUmlnaHQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBpbW1lZGlhdGVseSB0byB0aGUgbGVmdCBvZiB0aGUgY3VycmVudCBwb3NpdGlvbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVdvcmRMZWZ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZExlZnQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcGxhY2VzIHRoZSBmaXJzdCBvY2N1cmFuY2Ugb2YgYG9wdGlvbnMubmVlZGxlYCB3aXRoIHRoZSB2YWx1ZSBpbiBgcmVwbGFjZW1lbnRgLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSByZXBsYWNlbWVudCBUaGUgdGV4dCB0byByZXBsYWNlIHdpdGhcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBUaGUgW1tTZWFyY2ggYFNlYXJjaGBdXSBvcHRpb25zIHRvIHVzZVxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgcmVwbGFjZShyZXBsYWNlbWVudDogc3RyaW5nLCBvcHRpb25zKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG9wdGlvbnMpXG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHNlYXJjaC5maW5kKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IDA7XG4gICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG5cbiAgICAgICAgaWYgKHRoaXMuJHRyeVJlcGxhY2UocmFuZ2UsIHJlcGxhY2VtZW50KSkge1xuICAgICAgICAgICAgcmVwbGFjZWQgPSAxO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyYW5nZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXBsYWNlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyBhbGwgb2NjdXJhbmNlcyBvZiBgb3B0aW9ucy5uZWVkbGVgIHdpdGggdGhlIHZhbHVlIGluIGByZXBsYWNlbWVudGAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlcGxhY2VBbGxcbiAgICAgKiBAcGFyYW0gcmVwbGFjZW1lbnQge3N0cmluZ30gVGhlIHRleHQgdG8gcmVwbGFjZSB3aXRoXG4gICAgICogQHBhcmFtIG9wdGlvbnMgVGhlIFtbU2VhcmNoIGBTZWFyY2hgXV0gb3B0aW9ucyB0byB1c2VcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcmVwbGFjZUFsbChyZXBsYWNlbWVudDogc3RyaW5nLCBvcHRpb25zKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaC5zZXQob3B0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy4kc2VhcmNoLmZpbmRBbGwodGhpcy5zZXNzaW9uKTtcbiAgICAgICAgdmFyIHJlcGxhY2VkID0gMDtcbiAgICAgICAgaWYgKCFyYW5nZXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG5cbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKDAsIDApO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSByYW5nZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0cnlSZXBsYWNlKHJhbmdlc1tpXSwgcmVwbGFjZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgcmVwbGFjZWQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHNlbGVjdGlvbik7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHRyeVJlcGxhY2UocmFuZ2U6IFJhbmdlLCByZXBsYWNlbWVudDogc3RyaW5nKTogUmFuZ2Uge1xuICAgICAgICB2YXIgaW5wdXQgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgcmVwbGFjZW1lbnQgPSB0aGlzLiRzZWFyY2gucmVwbGFjZShpbnB1dCwgcmVwbGFjZW1lbnQpO1xuICAgICAgICBpZiAocmVwbGFjZW1lbnQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZCA9IHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCByZXBsYWNlbWVudCk7XG4gICAgICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0TGFzdFNlYXJjaE9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtTZWFyY2hPcHRpb25zfVxuICAgICAqL1xuICAgIGdldExhc3RTZWFyY2hPcHRpb25zKCk6IFNlYXJjaE9wdGlvbnMge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2VhcmNoLmdldE9wdGlvbnMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBdHRlbXB0cyB0byBmaW5kIGBuZWVkbGVgIHdpdGhpbiB0aGUgZG9jdW1lbnQuXG4gICAgICogRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZmluZFxuICAgICAqIEBwYXJhbSBuZWVkbGUge29iamVjdCB8IHN0cmluZyB8IFJlZ0V4cH0gVGhlIHRleHQgdG8gc2VhcmNoIGZvciAob3B0aW9uYWwpLlxuICAgICAqIEBwYXJhbSBbb3B0aW9uc10ge1NlYXJjaE9wdGlvbnN9IEFuIG9iamVjdCBkZWZpbmluZyB2YXJpb3VzIHNlYXJjaCBwcm9wZXJ0aWVzXG4gICAgICogQHBhcmFtIFthbmltYXRlXSB7Ym9vbGVhbn0gSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgICovXG4gICAgZmluZChuZWVkbGU6IChzdHJpbmcgfCBSZWdFeHApLCBvcHRpb25zOiBTZWFyY2hPcHRpb25zID0ge30sIGFuaW1hdGU/OiBib29sZWFuKTogUmFuZ2Uge1xuXG4gICAgICAgIGlmICh0eXBlb2YgbmVlZGxlID09PSBcInN0cmluZ1wiIHx8IG5lZWRsZSBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgICAgb3B0aW9ucy5uZWVkbGUgPSBuZWVkbGU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIG5lZWRsZSA9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICBtaXhpbihvcHRpb25zLCBuZWVkbGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgaWYgKG9wdGlvbnMubmVlZGxlID09IG51bGwpIHtcbiAgICAgICAgICAgIG5lZWRsZSA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpIHx8IHRoaXMuJHNlYXJjaC4kb3B0aW9ucy5uZWVkbGU7XG4gICAgICAgICAgICBpZiAoIW5lZWRsZSkge1xuICAgICAgICAgICAgICAgIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldFdvcmRSYW5nZShyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgbmVlZGxlID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KHsgbmVlZGxlOiBuZWVkbGUgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuICAgICAgICBpZiAoIW9wdGlvbnMuc3RhcnQpIHtcbiAgICAgICAgICAgIC8vIFRPRE86IEknbSBndWVzc2luZyB0aGF0IHdlIG5lZWQgcmFuZ2Uuc3RhcnQsIHdhcyBqdXN0IHJhbmdlLlxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldCh7IHN0YXJ0OiByYW5nZS5zdGFydCB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuZXdSYW5nZSA9IHRoaXMuJHNlYXJjaC5maW5kKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIGlmIChvcHRpb25zLnByZXZlbnRTY3JvbGwpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXdSYW5nZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobmV3UmFuZ2UpIHtcbiAgICAgICAgICAgIHRoaXMucmV2ZWFsUmFuZ2UobmV3UmFuZ2UsIGFuaW1hdGUpO1xuICAgICAgICAgICAgcmV0dXJuIG5ld1JhbmdlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGNsZWFyIHNlbGVjdGlvbiBpZiBub3RoaW5nIGlzIGZvdW5kXG4gICAgICAgIGlmIChvcHRpb25zLmJhY2t3YXJkcylcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcmFuZ2UuZW5kO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZS5lbmQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0UmFuZ2UocmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIGFub3RoZXIgc2VhcmNoIGZvciBgbmVlZGxlYCBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICogRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZmluZE5leHRcbiAgICAgKiBAcGFyYW0gW25lZWRsZV0ge3N0cmluZyB8IFJlZ0V4cH1cbiAgICAgKiBAcGFyYW0gW2FuaW1hdGVdIHtib29sZWFufSBJZiBgdHJ1ZWAgYW5pbWF0ZSBzY3JvbGxpbmdcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqKi9cbiAgICBmaW5kTmV4dChuZWVkbGU/OiAoc3RyaW5nIHwgUmVnRXhwKSwgYW5pbWF0ZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5maW5kKG5lZWRsZSwgeyBza2lwQ3VycmVudDogdHJ1ZSwgYmFja3dhcmRzOiBmYWxzZSB9LCBhbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBhIHNlYXJjaCBmb3IgYG5lZWRsZWAgYmFja3dhcmRzLlxuICAgICAqIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGZpbmRQcmV2aW91c1xuICAgICAqIEBwYXJhbSBbbmVlZGxlXSB7c3RyaW5nIHwgUmVnRXhwfVxuICAgICAqIEBwYXJhbSBbYW5pbWF0ZV0ge2Jvb2xlYW59IElmIGB0cnVlYCBhbmltYXRlIHNjcm9sbGluZ1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgZmluZFByZXZpb3VzKG5lZWRsZT86IChzdHJpbmcgfCBSZWdFeHApLCBhbmltYXRlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLmZpbmQobmVlZGxlLCB7IHNraXBDdXJyZW50OiB0cnVlLCBiYWNrd2FyZHM6IHRydWUgfSwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCByZXZlYWxSYW5nZVxuICAgICAqIEBwYXJhbSByYW5nZSB7UmFuZ2V9XG4gICAgICogQHBhcmFtIGFuaW1hdGUge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZXZlYWxSYW5nZShyYW5nZTogUmFuZ2UsIGFuaW1hdGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnVuZm9sZChyYW5nZSk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gdGhpcy5yZW5kZXJlci5zY3JvbGxUb3A7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcocmFuZ2Uuc3RhcnQsIHJhbmdlLmVuZCwgMC41KTtcbiAgICAgICAgaWYgKGFuaW1hdGUgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmFuaW1hdGVTY3JvbGxpbmcoc2Nyb2xsVG9wKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdW5kb1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICoqL1xuICAgIHVuZG8oKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVbmRvTWFuYWdlcigpLnVuZG8oKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyh2b2lkIDAsIDAuNSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCByZWRvXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZWRvKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0VW5kb01hbmFnZXIoKS5yZWRvKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcodm9pZCAwLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsZWFucyB1cCB0aGUgZW50aXJlIGVkaXRvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZGVzdHJveVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kZXN0cm95KCk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgZGVzdHJveVxuICAgICAgICAgKiBAcGFyYW0gdGhpcyB7RWRpdG9yfVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiZGVzdHJveVwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIGF1dG9tYXRpYyBzY3JvbGxpbmcgb2YgdGhlIGN1cnNvciBpbnRvIHZpZXcgd2hlbiBlZGl0b3IgaXRzZWxmIGlzIGluc2lkZSBzY3JvbGxhYmxlIGVsZW1lbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlld1xuICAgICAqIEBwYXJhbSBlbmFibGUge2Jvb2xlYW59IGRlZmF1bHQgdHJ1ZVxuICAgICAqL1xuICAgIHNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyhlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKCFlbmFibGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciByZWN0O1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBzaG91bGRTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgaWYgKCF0aGlzLiRzY3JvbGxBbmNob3IpXG4gICAgICAgICAgICB0aGlzLiRzY3JvbGxBbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB2YXIgc2Nyb2xsQW5jaG9yID0gdGhpcy4kc2Nyb2xsQW5jaG9yO1xuICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246YWJzb2x1dGVcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuaW5zZXJ0QmVmb3JlKHNjcm9sbEFuY2hvciwgdGhpcy5jb250YWluZXIuZmlyc3RDaGlsZCk7XG4gICAgICAgIHZhciBvbkNoYW5nZVNlbGVjdGlvbiA9IHRoaXMub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzaG91bGRTY3JvbGwgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gbmVlZGVkIHRvIG5vdCB0cmlnZ2VyIHN5bmMgcmVmbG93XG4gICAgICAgIHZhciBvbkJlZm9yZVJlbmRlciA9IHRoaXMucmVuZGVyZXIub24oXCJiZWZvcmVSZW5kZXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsKVxuICAgICAgICAgICAgICAgIHJlY3QgPSBzZWxmLnJlbmRlcmVyLmNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBvbkFmdGVyUmVuZGVyID0gdGhpcy5yZW5kZXJlci5vbihcImFmdGVyUmVuZGVyXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHNob3VsZFNjcm9sbCAmJiByZWN0ICYmIHNlbGYuaXNGb2N1c2VkKCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVuZGVyZXIgPSBzZWxmLnJlbmRlcmVyO1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByZW5kZXJlci4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICAgICAgICAgIHZhciBjb25maWcgPSByZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgICAgICAgICB2YXIgdG9wID0gcG9zLnRvcCAtIGNvbmZpZy5vZmZzZXQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy50b3AgPj0gMCAmJiB0b3AgKyByZWN0LnRvcCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocG9zLnRvcCA8IGNvbmZpZy5oZWlnaHQgJiZcbiAgICAgICAgICAgICAgICAgICAgcG9zLnRvcCArIHJlY3QudG9wICsgY29uZmlnLmxpbmVIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLnRvcCA9IHRvcCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmxlZnQgPSBwb3MubGVmdCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmhlaWdodCA9IGNvbmZpZy5saW5lSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc2Nyb2xsSW50b1ZpZXcoc2hvdWxkU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gcmVjdCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyA9IGZ1bmN0aW9uKGVuYWJsZSkge1xuICAgICAgICAgICAgaWYgKGVuYWJsZSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXc7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTZWxlY3Rpb25cIiwgb25DaGFuZ2VTZWxlY3Rpb24pO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWZ0ZXJSZW5kZXJcIiwgb25BZnRlclJlbmRlcik7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJiZWZvcmVSZW5kZXJcIiwgb25CZWZvcmVSZW5kZXIpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyAkcmVzZXRDdXJzb3JTdHlsZSgpIHtcbiAgICAgICAgdmFyIHN0eWxlID0gdGhpcy4kY3Vyc29yU3R5bGUgfHwgXCJhY2VcIjtcbiAgICAgICAgdmFyIGN1cnNvckxheWVyID0gdGhpcy5yZW5kZXJlci4kY3Vyc29yTGF5ZXI7XG4gICAgICAgIGlmICghY3Vyc29yTGF5ZXIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjdXJzb3JMYXllci5zZXRTbW9vdGhCbGlua2luZygvc21vb3RoLy50ZXN0KHN0eWxlKSk7XG4gICAgICAgIGN1cnNvckxheWVyLmlzQmxpbmtpbmcgPSAhdGhpcy4kcmVhZE9ubHkgJiYgc3R5bGUgIT0gXCJ3aWRlXCI7XG4gICAgICAgIHNldENzc0NsYXNzKGN1cnNvckxheWVyLmVsZW1lbnQsIFwiYWNlX3NsaW0tY3Vyc29yc1wiLCAvc2xpbS8udGVzdChzdHlsZSkpO1xuICAgIH1cbn1cblxuZGVmaW5lT3B0aW9ucyhFZGl0b3IucHJvdG90eXBlLCBcImVkaXRvclwiLCB7XG4gICAgc2VsZWN0aW9uU3R5bGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzdHlsZSkge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LiRvblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoYXQuc2VsZWN0aW9uKTtcbiAgICAgICAgICAgIHRoYXQuX3NpZ25hbChcImNoYW5nZVNlbGVjdGlvblN0eWxlXCIsIHsgZGF0YTogc3R5bGUgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCJsaW5lXCJcbiAgICB9LFxuICAgIGhpZ2hsaWdodEFjdGl2ZUxpbmU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBFZGl0b3IgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhpZ2hsaWdodFNlbGVjdGVkV29yZDoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3VsZEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LiRvblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoYXQuc2VsZWN0aW9uKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICByZWFkT25seToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHJlYWRPbmx5KSB7XG4gICAgICAgICAgICAvLyBkaXNhYmxlZCB0byBub3QgYnJlYWsgdmltIG1vZGUhXG4gICAgICAgICAgICAvLyB0aGlzLnRleHRJbnB1dC5zZXRSZWFkT25seShyZWFkT25seSk7XG4gICAgICAgICAgICB0aGlzLiRyZXNldEN1cnNvclN0eWxlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIGN1cnNvclN0eWxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogRWRpdG9yID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuJHJlc2V0Q3Vyc29yU3R5bGUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgdmFsdWVzOiBbXCJhY2VcIiwgXCJzbGltXCIsIFwic21vb3RoXCIsIFwid2lkZVwiXSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImFjZVwiXG4gICAgfSxcbiAgICBtZXJnZVVuZG9EZWx0YXM6IHtcbiAgICAgICAgdmFsdWVzOiBbZmFsc2UsIHRydWUsIFwiYWx3YXlzXCJdLFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGJlaGF2aW91cnNFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIHdyYXBCZWhhdmlvdXJzRW5hYmxlZDogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICBhdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXc6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihlbmFibGU6IGJvb2xlYW4pIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBFZGl0b3IgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXcoZW5hYmxlKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTogXCJyZW5kZXJlclwiLFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBcInJlbmRlcmVyXCIsXG4gICAgaGlnaGxpZ2h0R3V0dGVyTGluZTogXCJyZW5kZXJlclwiLFxuICAgIGFuaW1hdGVkU2Nyb2xsOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ludmlzaWJsZXM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93UHJpbnRNYXJnaW46IFwicmVuZGVyZXJcIixcbiAgICBwcmludE1hcmdpbkNvbHVtbjogXCJyZW5kZXJlclwiLFxuICAgIHByaW50TWFyZ2luOiBcInJlbmRlcmVyXCIsXG4gICAgZmFkZUZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0xpbmVOdW1iZXJzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0d1dHRlcjogXCJyZW5kZXJlclwiLFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IFwicmVuZGVyZXJcIixcbiAgICBmb250U2l6ZTogXCJyZW5kZXJlclwiLFxuICAgIGZvbnRGYW1pbHk6IFwicmVuZGVyZXJcIixcbiAgICBtYXhMaW5lczogXCJyZW5kZXJlclwiLFxuICAgIG1pbkxpbmVzOiBcInJlbmRlcmVyXCIsXG4gICAgc2Nyb2xsUGFzdEVuZDogXCJyZW5kZXJlclwiLFxuICAgIGZpeGVkV2lkdGhHdXR0ZXI6IFwicmVuZGVyZXJcIixcbiAgICB0aGVtZTogXCJyZW5kZXJlclwiLFxuXG4gICAgc2Nyb2xsU3BlZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGRyYWdEZWxheTogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZHJhZ0VuYWJsZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGZvY3VzVGltb3V0OiBcIiRtb3VzZUhhbmRsZXJcIixcbiAgICB0b29sdGlwRm9sbG93c01vdXNlOiBcIiRtb3VzZUhhbmRsZXJcIixcblxuICAgIGZpcnN0TGluZU51bWJlcjogXCJzZXNzaW9uXCIsXG4gICAgb3ZlcndyaXRlOiBcInNlc3Npb25cIixcbiAgICBuZXdMaW5lTW9kZTogXCJzZXNzaW9uXCIsXG4gICAgdXNlV29ya2VyOiBcInNlc3Npb25cIixcbiAgICB1c2VTb2Z0VGFiczogXCJzZXNzaW9uXCIsXG4gICAgdGFiU2l6ZTogXCJzZXNzaW9uXCIsXG4gICAgd3JhcDogXCJzZXNzaW9uXCIsXG4gICAgZm9sZFN0eWxlOiBcInNlc3Npb25cIixcbiAgICBtb2RlOiBcInNlc3Npb25cIlxufSk7XG5cbmNsYXNzIEZvbGRIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBpbiB0aGUgZWRpdG9yIChub3QgZ3V0dGVyKSByZWdpb25cbiAgICAgICAgLy8gdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdG8gcmVtb3ZlIG9yIGV4cGFuZCBhIGZvbGQuXG4gICAgICAgIGVkaXRvci5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjbGlja2VkIG9uIGEgZm9sZCwgdGhlbiBleHBhbmQgaXQuXG4gICAgICAgICAgICB2YXIgZm9sZCA9IHNlc3Npb24uZ2V0Rm9sZEF0KHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uLCAxKTtcbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgaWYgKGUuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBvbiB0aGUgZ3V0dGVyLlxuICAgICAgICBlZGl0b3Iub24oJ2d1dHRlcmNsaWNrJywgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXIuZ2V0UmVnaW9uKGUpO1xuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PT0gJ2ZvbGRXaWRnZXRzJykge1xuICAgICAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuICAgICAgICAgICAgICAgIGlmIChzZXNzaW9uWydmb2xkV2lkZ2V0cyddICYmIHNlc3Npb25bJ2ZvbGRXaWRnZXRzJ11bcm93XSkge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uWydvbkZvbGRXaWRnZXRDbGljayddKHJvdywgZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZWRpdG9yLm9uKCdndXR0ZXJkYmxjbGljaycsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlckxheWVyLmdldFJlZ2lvbihlKTtcblxuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PSAnZm9sZFdpZGdldHMnKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5nZXRTZXNzaW9uKCk7XG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSBzZXNzaW9uWydnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhJ10ocm93LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGRhdGEuZmlyc3RSYW5nZTtcblxuICAgICAgICAgICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBzZXNzaW9uLmdldExpbmUocm93KS5sZW5ndGgsIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uWydhZGRGb2xkJ10oXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KHsgcm93OiByYW5nZS5zdGFydC5yb3csIGNvbHVtbjogMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5pbnRlcmZhY2UgSUdlc3R1cmVIYW5kbGVyIHtcbiAgICBjYW5jZWxDb250ZXh0TWVudSgpOiB2b2lkO1xufVxuXG5jbGFzcyBNb3VzZUhhbmRsZXIge1xuICAgIHB1YmxpYyBlZGl0b3I6IEVkaXRvcjtcbiAgICBwcml2YXRlICRzY3JvbGxTcGVlZDogbnVtYmVyID0gMjtcbiAgICBwcml2YXRlICRkcmFnRGVsYXk6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSAkZHJhZ0VuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlO1xuICAgIHB1YmxpYyAkZm9jdXNUaW1vdXQ6IG51bWJlciA9IDA7XG4gICAgcHVibGljICR0b29sdGlwRm9sbG93c01vdXNlOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlIHN0YXRlOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBjbGllbnRYOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBjbGllbnRZOiBudW1iZXI7XG4gICAgcHVibGljIGlzTW91c2VQcmVzc2VkOiBib29sZWFuO1xuICAgIC8qKlxuICAgICAqIFRoZSBmdW5jdGlvbiB0byBjYWxsIHRvIHJlbGVhc2UgYSBjYXB0dXJlZCBtb3VzZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbGVhc2VNb3VzZTogKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICBwdWJsaWMgbW91c2Vkb3duRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSAkbW91c2VNb3ZlZDtcbiAgICBwcml2YXRlICRvbkNhcHR1cmVNb3VzZU1vdmU7XG4gICAgcHVibGljICRjbGlja1NlbGVjdGlvbjogUmFuZ2UgPSBudWxsO1xuICAgIHB1YmxpYyAkbGFzdFNjcm9sbFRpbWU6IG51bWJlcjtcbiAgICBwdWJsaWMgc2VsZWN0QnlMaW5lczogKCkgPT4gdm9pZDtcbiAgICBwdWJsaWMgc2VsZWN0QnlXb3JkczogKCkgPT4gdm9pZDtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICAvLyBGSVhNRTogRGlkIEkgbWVudGlvbiB0aGF0IGB0aGlzYCwgYG5ld2AsIGBjbGFzc2AsIGBiaW5kYCBhcmUgdGhlIDQgaG9yc2VtZW4/XG4gICAgICAgIC8vIEZJWE1FOiBGdW5jdGlvbiBTY29waW5nIGlzIHRoZSBhbnN3ZXIuXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG4gICAgICAgIC8vIEZJWE1FOiBXZSBzaG91bGQgYmUgY2xlYW5pbmcgdXAgdGhlc2UgaGFuZGxlcnMgaW4gYSBkaXNwb3NlIG1ldGhvZC4uLlxuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoJ21vdXNlZG93bicsIG1ha2VNb3VzZURvd25IYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoJ21vdXNld2hlZWwnLCBtYWtlTW91c2VXaGVlbEhhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImRibGNsaWNrXCIsIG1ha2VEb3VibGVDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcInRyaXBsZWNsaWNrXCIsIG1ha2VUcmlwbGVDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcInF1YWRjbGlja1wiLCBtYWtlUXVhZENsaWNrSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcblxuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXMgPSBtYWtlRXh0ZW5kU2VsZWN0aW9uQnkoZWRpdG9yLCB0aGlzLCBcImdldExpbmVSYW5nZVwiKTtcbiAgICAgICAgdGhpcy5zZWxlY3RCeVdvcmRzID0gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvciwgdGhpcywgXCJnZXRXb3JkUmFuZ2VcIik7XG5cbiAgICAgICAgbmV3IEd1dHRlckhhbmRsZXIodGhpcyk7XG4gICAgICAgIC8vICAgICAgRklYTUU6IG5ldyBEcmFnZHJvcEhhbmRsZXIodGhpcyk7XG5cbiAgICAgICAgdmFyIG9uTW91c2VEb3duID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFlZGl0b3IuaXNGb2N1c2VkKCkgJiYgZWRpdG9yLnRleHRJbnB1dCkge1xuICAgICAgICAgICAgICAgIGVkaXRvci50ZXh0SW5wdXQubW92ZVRvTW91c2UoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBtb3VzZVRhcmdldDogSFRNTERpdkVsZW1lbnQgPSBlZGl0b3IucmVuZGVyZXIuZ2V0TW91c2VFdmVudFRhcmdldCgpO1xuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJjbGlja1wiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiY2xpY2tcIikpO1xuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJtb3VzZW1vdmVcIiwgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMsIFwibW91c2Vtb3ZlXCIpKTtcbiAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihtb3VzZVRhcmdldCwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgaWYgKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWKSB7XG4gICAgICAgICAgICBhZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWLmlubmVyLCBbNDAwLCAzMDAsIDI1MF0sIHRoaXMsIFwib25Nb3VzZUV2ZW50XCIpO1xuICAgICAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFySC5pbm5lciwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgICAgIGlmIChpc0lFKSB7XG4gICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYuZWxlbWVudCwgXCJtb3VzZWRvd25cIiwgb25Nb3VzZURvd24pO1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IEkgd29uZGVyIGlmIHdlIHNob3VsZCBiZSByZXNwb25kaW5nIHRvIG1vdXNlZG93biAoYnkgc3ltbWV0cnkpP1xuICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJILmVsZW1lbnQsIFwibW91c2Vtb3ZlXCIsIG9uTW91c2VEb3duKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdlIGhvb2sgJ21vdXNld2hlZWwnIHVzaW5nIHRoZSBwb3J0YWJsZSBcbiAgICAgICAgYWRkTW91c2VXaGVlbExpc3RlbmVyKGVkaXRvci5jb250YWluZXIsIHRoaXMuZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudC5iaW5kKHRoaXMsIFwibW91c2V3aGVlbFwiKSk7XG5cbiAgICAgICAgdmFyIGd1dHRlckVsID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXI7XG4gICAgICAgIGFkZExpc3RlbmVyKGd1dHRlckVsLCBcIm1vdXNlZG93blwiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVybW91c2Vkb3duXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiZGJsY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmRibGNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vtb3ZlXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJtb3VzZW1vdmVcIikpO1xuXG4gICAgICAgIGFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcIm1vdXNlZG93blwiLCBvbk1vdXNlRG93bik7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vkb3duXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgcmV0dXJuIHByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBIYW5kbGUgYG1vdXNlbW92ZWAgd2hpbGUgdGhlIG1vdXNlIGlzIG92ZXIgdGhlIGVkaXRpbmcgYXJlYSAoYW5kIG5vdCB0aGUgZ3V0dGVyKS5cbiAgICAgICAgZWRpdG9yLm9uKCdtb3VzZW1vdmUnLCBmdW5jdGlvbihlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoX3NlbGYuc3RhdGUgfHwgX3NlbGYuJGRyYWdEZWxheSB8fCAhX3NlbGYuJGRyYWdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRklYTUU6IFByb2JhYmx5IHMvYiBjbGllbnRYWVxuICAgICAgICAgICAgdmFyIGNoYXIgPSBlZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoZS54LCBlLnkpO1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlc3Npb24oKS5nZXRTZWxlY3Rpb24oKS5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHJlbmRlcmVyID0gZWRpdG9yLnJlbmRlcmVyO1xuXG4gICAgICAgICAgICBpZiAoIXJhbmdlLmlzRW1wdHkoKSAmJiByYW5nZS5pbnNpZGVTdGFydChjaGFyLnJvdywgY2hhci5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuc2V0Q3Vyc29yU3R5bGUoJ2RlZmF1bHQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlbmRlcmVyLnNldEN1cnNvclN0eWxlKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbk1vdXNlRXZlbnQobmFtZTogc3RyaW5nLCBlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKSk7XG4gICAgfVxuXG4gICAgb25Nb3VzZU1vdmUobmFtZTogc3RyaW5nLCBlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIC8vIElmIG5vYm9keSBpcyBsaXN0ZW5pbmcsIGF2b2lkIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGVtcG9yYXJ5IHdyYXBwZXIuXG4gICAgICAgIC8vIG9wdGltaXphdGlvbiwgYmVjYXVzZSBtb3VzZW1vdmUgZG9lc24ndCBoYXZlIGEgZGVmYXVsdCBoYW5kbGVyLlxuICAgICAgICBpZiAodGhpcy5lZGl0b3IuaGFzTGlzdGVuZXJzKCdtb3VzZW1vdmUnKSkge1xuICAgICAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbmV3IEVkaXRvck1vdXNlRXZlbnQoZSwgdGhpcy5lZGl0b3IpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGVtaXRFZGl0b3JNb3VzZVdoZWVsRXZlbnQobmFtZTogc3RyaW5nLCBlOiBNb3VzZVdoZWVsRXZlbnQpIHtcbiAgICAgICAgdmFyIG1vdXNlRXZlbnQgPSBuZXcgRWRpdG9yTW91c2VFdmVudChlLCB0aGlzLmVkaXRvcik7XG4gICAgICAgIG1vdXNlRXZlbnQuc3BlZWQgPSB0aGlzLiRzY3JvbGxTcGVlZCAqIDI7XG4gICAgICAgIG1vdXNlRXZlbnQud2hlZWxYID0gZVsnd2hlZWxYJ107XG4gICAgICAgIG1vdXNlRXZlbnQud2hlZWxZID0gZVsnd2hlZWxZJ107XG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG1vdXNlRXZlbnQpO1xuICAgIH1cblxuICAgIHNldFN0YXRlKHN0YXRlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICAgIH1cblxuICAgIHRleHRDb29yZGluYXRlcygpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICB9XG5cbiAgICBjYXB0dXJlTW91c2UoZXY6IEVkaXRvck1vdXNlRXZlbnQsIG1vdXNlTW92ZUhhbmRsZXI/OiAobW91c2VFdmVudDogTW91c2VFdmVudCkgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLmNsaWVudFggPSBldi5jbGllbnRYO1xuICAgICAgICB0aGlzLmNsaWVudFkgPSBldi5jbGllbnRZO1xuXG4gICAgICAgIHRoaXMuaXNNb3VzZVByZXNzZWQgPSB0cnVlO1xuXG4gICAgICAgIC8vIGRvIG5vdCBtb3ZlIHRleHRhcmVhIGR1cmluZyBzZWxlY3Rpb25cbiAgICAgICAgdmFyIHJlbmRlcmVyID0gdGhpcy5lZGl0b3IucmVuZGVyZXI7XG4gICAgICAgIGlmIChyZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IpIHtcbiAgICAgICAgICAgIHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb25Nb3VzZU1vdmUgPSAoZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24obW91c2VFdmVudDogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgICAgIGlmICghbW91c2VFdmVudCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIC8vIGlmIGVkaXRvciBpcyBsb2FkZWQgaW5zaWRlIGlmcmFtZSwgYW5kIG1vdXNldXAgZXZlbnQgaXMgb3V0c2lkZVxuICAgICAgICAgICAgICAgIC8vIHdlIHdvbid0IHJlY2lldmUgaXQsIHNvIHdlIGNhbmNlbCBvbiBmaXJzdCBtb3VzZW1vdmUgd2l0aG91dCBidXR0b25cbiAgICAgICAgICAgICAgICBpZiAoaXNXZWJLaXQgJiYgIW1vdXNlRXZlbnQud2hpY2ggJiYgbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBGb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgSSdtIHBhc3NpbmcgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICAvLyBidXQgaXQgd291bGQgcHJvYmFibHkgbWFrZSBtb3JlIHNlbnNlIHRvIHBhc3MgdGhlIG1vdXNlIGV2ZW50XG4gICAgICAgICAgICAgICAgICAgIC8vIHNpbmNlIHRoYXQgaXMgdGhlIGZpbmFsIGV2ZW50LlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSh1bmRlZmluZWQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jbGllbnRYID0gbW91c2VFdmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jbGllbnRZID0gbW91c2VFdmVudC5jbGllbnRZO1xuICAgICAgICAgICAgICAgIG1vdXNlTW92ZUhhbmRsZXIgJiYgbW91c2VNb3ZlSGFuZGxlcihtb3VzZUV2ZW50KTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIubW91c2VFdmVudCA9IG5ldyBFZGl0b3JNb3VzZUV2ZW50KG1vdXNlRXZlbnQsIGVkaXRvcik7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRtb3VzZU1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcy5lZGl0b3IsIHRoaXMpO1xuXG4gICAgICAgIHZhciBvbkNhcHR1cmVFbmQgPSAoZnVuY3Rpb24obW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcklkKTtcbiAgICAgICAgICAgICAgICBvbkNhcHR1cmVJbnRlcnZhbCgpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGUgKyBcIkVuZFwiXSAmJiBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlICsgXCJFbmRcIl0oZSk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLnN0YXRlID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5pc01vdXNlUHJlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kb25DYXB0dXJlTW91c2VNb3ZlID0gbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgZSAmJiBtb3VzZUhhbmRsZXIub25Nb3VzZUV2ZW50KFwibW91c2V1cFwiLCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcyk7XG5cbiAgICAgICAgdmFyIG9uQ2FwdHVyZUludGVydmFsID0gKGZ1bmN0aW9uKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZV0gJiYgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZV0oKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJG1vdXNlTW92ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcyk7XG5cbiAgICAgICAgaWYgKGlzT2xkSUUgJiYgZXYuZG9tRXZlbnQudHlwZSA9PSBcImRibGNsaWNrXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBvbkNhcHR1cmVFbmQoZXYpOyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJG9uQ2FwdHVyZU1vdXNlTW92ZSA9IG9uTW91c2VNb3ZlO1xuICAgICAgICB0aGlzLnJlbGVhc2VNb3VzZSA9IGNhcHR1cmUodGhpcy5lZGl0b3IuY29udGFpbmVyLCBvbk1vdXNlTW92ZSwgb25DYXB0dXJlRW5kKTtcbiAgICAgICAgdmFyIHRpbWVySWQgPSBzZXRJbnRlcnZhbChvbkNhcHR1cmVJbnRlcnZhbCwgMjApO1xuICAgIH1cblxuICAgIGNhbmNlbENvbnRleHRNZW51KCk6IHZvaWQge1xuICAgICAgICB2YXIgc3RvcCA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGlmIChlICYmIGUuZG9tRXZlbnQgJiYgZS5kb21FdmVudC50eXBlICE9IFwiY29udGV4dG1lbnVcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLm9mZihcIm5hdGl2ZWNvbnRleHRtZW51XCIsIHN0b3ApO1xuICAgICAgICAgICAgaWYgKGUgJiYgZS5kb21FdmVudCkge1xuICAgICAgICAgICAgICAgIHN0b3BFdmVudChlLmRvbUV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuICAgICAgICBzZXRUaW1lb3V0KHN0b3AsIDEwKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJuYXRpdmVjb250ZXh0bWVudVwiLCBzdG9wKTtcbiAgICB9XG5cbiAgICBzZWxlY3QoKSB7XG4gICAgICAgIHZhciBhbmNob3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG5cbiAgICAgICAgaWYgKHRoaXMuJGNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB2YXIgY21wID0gdGhpcy4kY2xpY2tTZWxlY3Rpb24uY29tcGFyZVBvaW50KGN1cnNvcik7XG5cbiAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSB0aGlzLiRjbGlja1NlbGVjdGlvbi5lbmQ7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNtcCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gdGhpcy4kY2xpY2tTZWxlY3Rpb24uc3RhcnQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBvcmllbnRlZFJhbmdlID0gY2FsY1JhbmdlT3JpZW50YXRpb24odGhpcy4kY2xpY2tTZWxlY3Rpb24sIGN1cnNvcik7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gb3JpZW50ZWRSYW5nZS5jdXJzb3I7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gb3JpZW50ZWRSYW5nZS5hbmNob3I7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgdGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoKTtcbiAgICB9XG5cbiAgICBzZWxlY3RCeUxpbmVzRW5kKCkge1xuICAgICAgICB0aGlzLiRjbGlja1NlbGVjdGlvbiA9IG51bGw7XG4gICAgICAgIHRoaXMuZWRpdG9yLnVuc2V0U3R5bGUoXCJhY2Vfc2VsZWN0aW5nXCIpO1xuICAgICAgICBpZiAodGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsZXJbJ3JlbGVhc2VDYXB0dXJlJ10pIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyWydyZWxlYXNlQ2FwdHVyZSddKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGFydFNlbGVjdChwb3M6IFBvc2l0aW9uLCB3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHBvcyA9IHBvcyB8fCB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgICAgIHZhciBlZGl0b3IgPSB0aGlzLmVkaXRvcjtcbiAgICAgICAgLy8gYWxsb3cgZG91YmxlL3RyaXBsZSBjbGljayBoYW5kbGVycyB0byBjaGFuZ2Ugc2VsZWN0aW9uXG4gICAgXG4gICAgICAgIGlmICh0aGlzLm1vdXNlZG93bkV2ZW50LmdldFNoaWZ0S2V5KCkpIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihwb3MpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCF3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghd2FpdEZvckNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyWydzZXRDYXB0dXJlJ10pIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyWydzZXRDYXB0dXJlJ10oKTtcbiAgICAgICAgfVxuICAgICAgICBlZGl0b3Iuc2V0U3R5bGUoXCJhY2Vfc2VsZWN0aW5nXCIpO1xuICAgICAgICB0aGlzLnNldFN0YXRlKFwic2VsZWN0XCIpO1xuICAgIH1cblxuICAgIHNlbGVjdEVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QWxsRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBzZWxlY3RCeVdvcmRzRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBmb2N1c1dhaXQoKSB7XG4gICAgICAgIHZhciBkaXN0YW5jZSA9IGNhbGNEaXN0YW5jZSh0aGlzLm1vdXNlZG93bkV2ZW50LmNsaWVudFgsIHRoaXMubW91c2Vkb3duRXZlbnQuY2xpZW50WSwgdGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB2YXIgdGltZSA9IERhdGUubm93KCk7XG5cbiAgICAgICAgaWYgKGRpc3RhbmNlID4gRFJBR19PRkZTRVQgfHwgdGltZSAtIHRoaXMubW91c2Vkb3duRXZlbnQudGltZSA+IHRoaXMuJGZvY3VzVGltb3V0KSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0U2VsZWN0KHRoaXMubW91c2Vkb3duRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpKTtcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG5kZWZpbmVPcHRpb25zKE1vdXNlSGFuZGxlci5wcm90b3R5cGUsIFwibW91c2VIYW5kbGVyXCIsIHtcbiAgICBzY3JvbGxTcGVlZDogeyBpbml0aWFsVmFsdWU6IDIgfSxcbiAgICBkcmFnRGVsYXk6IHsgaW5pdGlhbFZhbHVlOiAoaXNNYWMgPyAxNTAgOiAwKSB9LFxuICAgIGRyYWdFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIGZvY3VzVGltb3V0OiB7IGluaXRpYWxWYWx1ZTogMCB9LFxuICAgIHRvb2x0aXBGb2xsb3dzTW91c2U6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH1cbn0pO1xuXG4vKipcbiAqIEN1c3RvbSBBY2UgbW91c2UgZXZlbnRcbiAqXG4gKiBAY2xhc3MgRWRpdG9yTW91c2VFdmVudFxuICovXG5jbGFzcyBFZGl0b3JNb3VzZUV2ZW50IHtcbiAgICAvLyBXZSBrZWVwIHRoZSBvcmlnaW5hbCBET00gZXZlbnRcbiAgICBwdWJsaWMgZG9tRXZlbnQ6IE1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSBlZGl0b3I6IEVkaXRvcjtcbiAgICBwdWJsaWMgY2xpZW50WDogbnVtYmVyO1xuICAgIHB1YmxpYyBjbGllbnRZOiBudW1iZXI7XG4gICAgLyoqXG4gICAgICogQ2FjaGVkIHRleHQgY29vcmRpbmF0ZXMgZm9sbG93aW5nIGdldERvY3VtZW50UG9zaXRpb24oKVxuICAgICAqL1xuICAgIHByaXZhdGUgJHBvczogUG9zaXRpb247XG4gICAgcHJpdmF0ZSAkaW5TZWxlY3Rpb246IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBwcm9wYWdhdGlvblN0b3BwZWQgPSBmYWxzZTtcbiAgICBwcml2YXRlIGRlZmF1bHRQcmV2ZW50ZWQgPSBmYWxzZTtcbiAgICBwdWJsaWMgdGltZTogbnVtYmVyO1xuICAgIC8vIHdoZWVsWSwgd2hlZWxZIGFuZCBzcGVlZCBhcmUgZm9yICdtb3VzZXdoZWVsJyBldmVudHMuXG4gICAgcHVibGljIHdoZWVsWDogbnVtYmVyO1xuICAgIHB1YmxpYyB3aGVlbFk6IG51bWJlcjtcbiAgICBwdWJsaWMgc3BlZWQ6IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBFZGl0b3JNb3VzZUV2ZW50XG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGRvbUV2ZW50IHtNb3VzZUV2ZW50fVxuICAgICAqIEBwYXJhbSBlZGl0b3Ige0VkaXRvcn1cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihkb21FdmVudDogTW91c2VFdmVudCwgZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdGhpcy5kb21FdmVudCA9IGRvbUV2ZW50O1xuICAgICAgICB0aGlzLmVkaXRvciA9IGVkaXRvcjtcblxuICAgICAgICB0aGlzLmNsaWVudFggPSBkb21FdmVudC5jbGllbnRYO1xuICAgICAgICB0aGlzLmNsaWVudFkgPSBkb21FdmVudC5jbGllbnRZO1xuXG4gICAgICAgIHRoaXMuJHBvcyA9IG51bGw7XG4gICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gbnVsbDtcbiAgICB9XG5cbiAgICBnZXQgdG9FbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb21FdmVudC50b0VsZW1lbnQ7XG4gICAgfVxuXG4gICAgc3RvcFByb3BhZ2F0aW9uKCk6IHZvaWQge1xuICAgICAgICBzdG9wUHJvcGFnYXRpb24odGhpcy5kb21FdmVudCk7XG4gICAgICAgIHRoaXMucHJvcGFnYXRpb25TdG9wcGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcmV2ZW50RGVmYXVsdCgpIHtcbiAgICAgICAgcHJldmVudERlZmF1bHQodGhpcy5kb21FdmVudCk7XG4gICAgICAgIHRoaXMuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgc3RvcCgpIHtcbiAgICAgICAgdGhpcy5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgdGhpcy5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgZG9jdW1lbnQgcG9zaXRpb24gYmVsb3cgdGhlIG1vdXNlIGN1cnNvclxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXREb2N1bWVudFBvc2l0aW9uXG4gICAgICogQHJldHVybiB7UG9zaXRpb259ICdyb3cnIGFuZCAnY29sdW1uJyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb25cbiAgICAgKi9cbiAgICBnZXREb2N1bWVudFBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcbiAgICAgICAgaWYgKCF0aGlzLiRwb3MpIHtcbiAgICAgICAgICAgIHRoaXMuJHBvcyA9IHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy4kcG9zO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIENoZWNrIGlmIHRoZSBtb3VzZSBjdXJzb3IgaXMgaW5zaWRlIG9mIHRoZSB0ZXh0IHNlbGVjdGlvblxuICAgICAqXG4gICAgICogQG1ldGhvZCBpblNlbGVjdGlvblxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhlIG1vdXNlIGN1cnNvciBpcyBpbnNpZGUgb2YgdGhlIHNlbGVjdGlvblxuICAgICAqL1xuICAgIGluU2VsZWN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy4kaW5TZWxlY3Rpb24gIT09IG51bGwpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kaW5TZWxlY3Rpb247XG5cbiAgICAgICAgdmFyIGVkaXRvciA9IHRoaXMuZWRpdG9yO1xuXG5cbiAgICAgICAgdmFyIHNlbGVjdGlvblJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChzZWxlY3Rpb25SYW5nZS5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLiRpblNlbGVjdGlvbiA9IGZhbHNlO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gc2VsZWN0aW9uUmFuZ2UuY29udGFpbnMocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy4kaW5TZWxlY3Rpb247XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogR2V0IHRoZSBjbGlja2VkIG1vdXNlIGJ1dHRvblxuICAgICAqIFxuICAgICAqIEByZXR1cm4ge051bWJlcn0gMCBmb3IgbGVmdCBidXR0b24sIDEgZm9yIG1pZGRsZSBidXR0b24sIDIgZm9yIHJpZ2h0IGJ1dHRvblxuICAgICAqL1xuICAgIGdldEJ1dHRvbigpIHtcbiAgICAgICAgcmV0dXJuIGdldEJ1dHRvbih0aGlzLmRvbUV2ZW50KTtcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufSB3aGV0aGVyIHRoZSBzaGlmdCBrZXkgd2FzIHByZXNzZWQgd2hlbiB0aGUgZXZlbnQgd2FzIGVtaXR0ZWRcbiAgICAgKi9cbiAgICBnZXRTaGlmdEtleSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tRXZlbnQuc2hpZnRLZXk7XG4gICAgfVxuXG4gICAgZ2V0QWNjZWxLZXkgPSBpc01hYyA/IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kb21FdmVudC5tZXRhS2V5OyB9IDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvbUV2ZW50LmN0cmxLZXk7IH07XG59XG5cbnZhciBEUkFHX09GRlNFVCA9IDA7IC8vIHBpeGVsc1xuXG5mdW5jdGlvbiBtYWtlTW91c2VEb3duSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZXY6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgdmFyIGluU2VsZWN0aW9uID0gZXYuaW5TZWxlY3Rpb24oKTtcbiAgICAgICAgdmFyIHBvcyA9IGV2LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlZG93bkV2ZW50ID0gZXY7XG5cbiAgICAgICAgdmFyIGJ1dHRvbiA9IGV2LmdldEJ1dHRvbigpO1xuICAgICAgICBpZiAoYnV0dG9uICE9PSAwKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbXB0eSA9IHNlbGVjdGlvblJhbmdlLmlzRW1wdHkoKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGlvbkVtcHR5KVxuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcblxuICAgICAgICAgICAgLy8gMjogY29udGV4dG1lbnUsIDE6IGxpbnV4IHBhc3RlXG4gICAgICAgICAgICBlZGl0b3IudGV4dElucHV0Lm9uQ29udGV4dE1lbnUoZXYuZG9tRXZlbnQpO1xuICAgICAgICAgICAgcmV0dXJuOyAvLyBzdG9wcGluZyBldmVudCBoZXJlIGJyZWFrcyBjb250ZXh0bWVudSBvbiBmZiBtYWNcbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5tb3VzZWRvd25FdmVudC50aW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gaWYgdGhpcyBjbGljayBjYXVzZWQgdGhlIGVkaXRvciB0byBiZSBmb2N1c2VkIHNob3VsZCBub3QgY2xlYXIgdGhlXG4gICAgICAgIC8vIHNlbGVjdGlvblxuICAgICAgICBpZiAoaW5TZWxlY3Rpb24gJiYgIWVkaXRvci5pc0ZvY3VzZWQoKSkge1xuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICBpZiAobW91c2VIYW5kbGVyLiRmb2N1c1RpbW91dCAmJiAhbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiAmJiAhZWRpdG9yLmluTXVsdGlTZWxlY3RNb2RlKSB7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwiZm9jdXNXYWl0XCIpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZXYpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZXYpO1xuICAgICAgICAvLyBUT0RPOiBfY2xpY2tzIGlzIGEgY3VzdG9tIHByb3BlcnR5IGFkZGVkIGluIGV2ZW50LnRzIGJ5IHRoZSAnbW91c2Vkb3duJyBsaXN0ZW5lci5cbiAgICAgICAgbW91c2VIYW5kbGVyLnN0YXJ0U2VsZWN0KHBvcywgZXYuZG9tRXZlbnRbJ19jbGlja3MnXSA+IDEpO1xuICAgICAgICByZXR1cm4gZXYucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VNb3VzZVdoZWVsSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZXY6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgaWYgKGV2LmdldEFjY2VsS2V5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vc2hpZnQgd2hlZWwgdG8gaG9yaXogc2Nyb2xsXG4gICAgICAgIGlmIChldi5nZXRTaGlmdEtleSgpICYmIGV2LndoZWVsWSAmJiAhZXYud2hlZWxYKSB7XG4gICAgICAgICAgICBldi53aGVlbFggPSBldi53aGVlbFk7XG4gICAgICAgICAgICBldi53aGVlbFkgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHQgPSBldi5kb21FdmVudC50aW1lU3RhbXA7XG4gICAgICAgIHZhciBkdCA9IHQgLSAobW91c2VIYW5kbGVyLiRsYXN0U2Nyb2xsVGltZSB8fCAwKTtcblxuICAgICAgICB2YXIgaXNTY3JvbGFibGUgPSBlZGl0b3IucmVuZGVyZXIuaXNTY3JvbGxhYmxlQnkoZXYud2hlZWxYICogZXYuc3BlZWQsIGV2LndoZWVsWSAqIGV2LnNwZWVkKTtcbiAgICAgICAgaWYgKGlzU2Nyb2xhYmxlIHx8IGR0IDwgMjAwKSB7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGxhc3RTY3JvbGxUaW1lID0gdDtcbiAgICAgICAgICAgIGVkaXRvci5yZW5kZXJlci5zY3JvbGxCeShldi53aGVlbFggKiBldi5zcGVlZCwgZXYud2hlZWxZICogZXYuc3BlZWQpO1xuICAgICAgICAgICAgcmV0dXJuIGV2LnN0b3AoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZURvdWJsZUNsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgcG9zID0gZWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLmdldFNlc3Npb24oKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSBzZXNzaW9uLmdldEJyYWNrZXRSYW5nZShwb3MpO1xuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4tLTtcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RcIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZSA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0V29yZFJhbmdlKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlXb3Jkc1wiKTtcbiAgICAgICAgfVxuICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gcmFuZ2U7XG4gICAgICAgIG1vdXNlSGFuZGxlci5zZWxlY3QoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VUcmlwbGVDbGlja0hhbmRsZXIoZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVkaXRvck1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgdmFyIHBvcyA9IGVkaXRvck1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuXG4gICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEJ5TGluZXNcIik7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2UuaXNNdWx0aUxpbmUoKSAmJiByYW5nZS5jb250YWlucyhwb3Mucm93LCBwb3MuY29sdW1uKSkge1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmVuZCA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJhbmdlLmVuZC5yb3cpLmVuZDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShwb3Mucm93KTtcbiAgICAgICAgfVxuICAgICAgICBtb3VzZUhhbmRsZXIuc2VsZWN0KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlUXVhZENsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QWxsXCIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlciwgdW5pdE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFuY2hvcjtcbiAgICAgICAgdmFyIGN1cnNvciA9IG1vdXNlSGFuZGxlci50ZXh0Q29vcmRpbmF0ZXMoKTtcbiAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvblt1bml0TmFtZV0oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHZhciBjbXBTdGFydCA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uY29tcGFyZVBvaW50KHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgIHZhciBjbXBFbmQgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChyYW5nZS5lbmQpO1xuXG4gICAgICAgICAgICBpZiAoY21wU3RhcnQgPT0gLTEgJiYgY21wRW5kIDw9IDApIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmVuZDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuZW5kLnJvdyAhPSBjdXJzb3Iucm93IHx8IHJhbmdlLmVuZC5jb2x1bW4gIT0gY3Vyc29yLmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXBFbmQgPT0gMSAmJiBjbXBTdGFydCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ICE9IGN1cnNvci5yb3cgfHwgcmFuZ2Uuc3RhcnQuY29sdW1uICE9IGN1cnNvci5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGN1cnNvciA9IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcFN0YXJ0ID09IC0xICYmIGNtcEVuZCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGVkUmFuZ2UgPSBjYWxjUmFuZ2VPcmllbnRhdGlvbihtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IG9yaWVudGVkUmFuZ2UuY3Vyc29yO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG9yaWVudGVkUmFuZ2UuYW5jaG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjYWxjRGlzdGFuY2UoYXg6IG51bWJlciwgYXk6IG51bWJlciwgYng6IG51bWJlciwgYnk6IG51bWJlcikge1xuICAgIHJldHVybiBNYXRoLnNxcnQoTWF0aC5wb3coYnggLSBheCwgMikgKyBNYXRoLnBvdyhieSAtIGF5LCAyKSk7XG59XG5cbmZ1bmN0aW9uIGNhbGNSYW5nZU9yaWVudGF0aW9uKHJhbmdlOiBSYW5nZSwgY3Vyc29yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KTogeyBjdXJzb3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07IGFuY2hvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB9IHtcbiAgICBpZiAocmFuZ2Uuc3RhcnQucm93ID09IHJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgdmFyIGNtcCA9IDIgKiBjdXJzb3IuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uIC0gcmFuZ2UuZW5kLmNvbHVtbjtcbiAgICB9XG4gICAgZWxzZSBpZiAocmFuZ2Uuc3RhcnQucm93ID09IHJhbmdlLmVuZC5yb3cgLSAxICYmICFyYW5nZS5zdGFydC5jb2x1bW4gJiYgIXJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgdmFyIGNtcCA9IGN1cnNvci5jb2x1bW4gLSA0O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdmFyIGNtcCA9IDIgKiBjdXJzb3Iucm93IC0gcmFuZ2Uuc3RhcnQucm93IC0gcmFuZ2UuZW5kLnJvdztcbiAgICB9XG5cbiAgICBpZiAoY21wIDwgMCkge1xuICAgICAgICByZXR1cm4geyBjdXJzb3I6IHJhbmdlLnN0YXJ0LCBhbmNob3I6IHJhbmdlLmVuZCB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgY3Vyc29yOiByYW5nZS5lbmQsIGFuY2hvcjogcmFuZ2Uuc3RhcnQgfTtcbiAgICB9XG59XG5cbmNsYXNzIEd1dHRlckhhbmRsZXIge1xuICAgIGNvbnN0cnVjdG9yKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgIHZhciBlZGl0b3I6IEVkaXRvciA9IG1vdXNlSGFuZGxlci5lZGl0b3I7XG4gICAgICAgIHZhciBndXR0ZXI6IEd1dHRlciA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXI7XG4gICAgICAgIHZhciB0b29sdGlwID0gbmV3IEd1dHRlclRvb2x0aXAoZWRpdG9yLmNvbnRhaW5lcik7XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlZG93blwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoIWVkaXRvci5pc0ZvY3VzZWQoKSB8fCBlLmdldEJ1dHRvbigpICE9IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBndXR0ZXIuZ2V0UmVnaW9uKGUpO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyUmVnaW9uID09PSBcImZvbGRXaWRnZXRzXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlc3Npb24oKS5nZXRTZWxlY3Rpb24oKTtcblxuICAgICAgICAgICAgaWYgKGUuZ2V0U2hpZnRLZXkoKSkge1xuICAgICAgICAgICAgICAgIHNlbGVjdGlvbi5zZWxlY3RUbyhyb3csIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGUuZG9tRXZlbnQuZGV0YWlsID09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdEFsbCgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRMaW5lUmFuZ2Uocm93KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEJ5TGluZXNcIik7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuY2FwdHVyZU1vdXNlKGUpO1xuICAgICAgICAgICAgcmV0dXJuIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfSk7XG5cblxuICAgICAgICB2YXIgdG9vbHRpcFRpbWVvdXQ6IG51bWJlcjtcbiAgICAgICAgdmFyIG1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgICAgIHZhciB0b29sdGlwQW5ub3RhdGlvbjtcblxuICAgICAgICBmdW5jdGlvbiBzaG93VG9vbHRpcCgpIHtcbiAgICAgICAgICAgIHZhciByb3cgPSBtb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICB2YXIgYW5ub3RhdGlvbiA9IGd1dHRlci4kYW5ub3RhdGlvbnNbcm93XTtcbiAgICAgICAgICAgIGlmICghYW5ub3RhdGlvbikge1xuICAgICAgICAgICAgICAgIHJldHVybiBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLmdldFNlc3Npb24oKTtcbiAgICAgICAgICAgIHZhciBtYXhSb3cgPSBzZXNzaW9uLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA9PSBtYXhSb3cpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2NyZWVuUm93ID0gZWRpdG9yLnJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcygwLCBtb3VzZUV2ZW50LmNsaWVudFkpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gbW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHNjcmVlblJvdyA+IHNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyhwb3Mucm93LCBwb3MuY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGlkZVRvb2x0aXAodm9pZCAwLCBlZGl0b3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uID09IGFubm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0b29sdGlwQW5ub3RhdGlvbiA9IGFubm90YXRpb24udGV4dC5qb2luKFwiPGJyLz5cIik7XG5cbiAgICAgICAgICAgIHRvb2x0aXAuc2V0SHRtbCh0b29sdGlwQW5ub3RhdGlvbik7XG5cbiAgICAgICAgICAgIHRvb2x0aXAuc2hvdygpO1xuXG4gICAgICAgICAgICBlZGl0b3Iub24oXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcblxuICAgICAgICAgICAgaWYgKG1vdXNlSGFuZGxlci4kdG9vbHRpcEZvbGxvd3NNb3VzZSkge1xuICAgICAgICAgICAgICAgIG1vdmVUb29sdGlwKG1vdXNlRXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGd1dHRlckVsZW1lbnQgPSBndXR0ZXIuJGNlbGxzW2VkaXRvci5nZXRTZXNzaW9uKCkuZG9jdW1lbnRUb1NjcmVlblJvdyhyb3csIDApXS5lbGVtZW50O1xuICAgICAgICAgICAgICAgIHZhciByZWN0ID0gZ3V0dGVyRWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgICAgICB2YXIgc3R5bGUgPSB0b29sdGlwLmdldEVsZW1lbnQoKS5zdHlsZTtcbiAgICAgICAgICAgICAgICBzdHlsZS5sZWZ0ID0gcmVjdC5yaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICBzdHlsZS50b3AgPSByZWN0LmJvdHRvbSArIFwicHhcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGhpZGVUb29sdGlwKGV2ZW50LCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICAgICAgaWYgKHRvb2x0aXBUaW1lb3V0KSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRvb2x0aXBUaW1lb3V0KTtcbiAgICAgICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b29sdGlwQW5ub3RhdGlvbikge1xuICAgICAgICAgICAgICAgIHRvb2x0aXAuaGlkZSgpO1xuICAgICAgICAgICAgICAgIHRvb2x0aXBBbm5vdGF0aW9uID0gbnVsbDtcbiAgICAgICAgICAgICAgICBlZGl0b3Iub2ZmKFwibW91c2V3aGVlbFwiLCBoaWRlVG9vbHRpcCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBtb3ZlVG9vbHRpcChldmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdG9vbHRpcC5zZXRQb3NpdGlvbihldmVudC5jbGllbnRYLCBldmVudC5jbGllbnRZKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5lZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoXCJndXR0ZXJtb3VzZW1vdmVcIiwgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgLy8gRklYTUU6IE9iZnVzY2F0aW5nIHRoZSB0eXBlIG9mIHRhcmdldCB0byB0aHdhcnQgY29tcGlsZXIuXG4gICAgICAgICAgICB2YXIgdGFyZ2V0OiBhbnkgPSBlLmRvbUV2ZW50LnRhcmdldCB8fCBlLmRvbUV2ZW50LnNyY0VsZW1lbnQ7XG4gICAgICAgICAgICBpZiAoaGFzQ3NzQ2xhc3ModGFyZ2V0LCBcImFjZV9mb2xkLXdpZGdldFwiKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0b29sdGlwQW5ub3RhdGlvbiAmJiBtb3VzZUhhbmRsZXIuJHRvb2x0aXBGb2xsb3dzTW91c2UpIHtcbiAgICAgICAgICAgICAgICBtb3ZlVG9vbHRpcChlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbW91c2VFdmVudCA9IGU7XG4gICAgICAgICAgICBpZiAodG9vbHRpcFRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChtb3VzZUV2ZW50ICYmICFtb3VzZUhhbmRsZXIuaXNNb3VzZVByZXNzZWQpXG4gICAgICAgICAgICAgICAgICAgIHNob3dUb29sdGlwKCk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICB9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGFkZExpc3RlbmVyKGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyLCBcIm1vdXNlb3V0XCIsIGZ1bmN0aW9uKGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIG1vdXNlRXZlbnQgPSBudWxsO1xuICAgICAgICAgICAgaWYgKCF0b29sdGlwQW5ub3RhdGlvbiB8fCB0b29sdGlwVGltZW91dClcbiAgICAgICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgaGlkZVRvb2x0aXAodm9pZCAwLCBlZGl0b3IpO1xuICAgICAgICAgICAgfSwgNTApO1xuICAgICAgICB9KTtcblxuICAgICAgICBlZGl0b3Iub24oXCJjaGFuZ2VTZXNzaW9uXCIsIGhpZGVUb29sdGlwKTtcbiAgICB9XG59XG5cbi8qKlxuICogQGNsYXNzIEd1dHRlclRvb2x0aXBcbiAqIEBleHRlbmRzIFRvb2x0aXBcbiAqL1xuY2xhc3MgR3V0dGVyVG9vbHRpcCBleHRlbmRzIFRvb2x0aXAge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudE5vZGU6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudE5vZGUpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldFBvc2l0aW9uXG4gICAgICogQHBhcmFtIHgge251bWJlcn1cbiAgICAgKiBAcGFyYW0geSB7bnVtYmVyfVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0UG9zaXRpb24oeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdmFyIHdpbmRvd1dpZHRoID0gd2luZG93LmlubmVyV2lkdGggfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudFdpZHRoO1xuICAgICAgICB2YXIgd2luZG93SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQ7XG4gICAgICAgIHZhciB3aWR0aCA9IHRoaXMuZ2V0V2lkdGgoKTtcbiAgICAgICAgdmFyIGhlaWdodCA9IHRoaXMuZ2V0SGVpZ2h0KCk7XG4gICAgICAgIHggKz0gMTU7XG4gICAgICAgIHkgKz0gMTU7XG4gICAgICAgIGlmICh4ICsgd2lkdGggPiB3aW5kb3dXaWR0aCkge1xuICAgICAgICAgICAgeCAtPSAoeCArIHdpZHRoKSAtIHdpbmRvd1dpZHRoO1xuICAgICAgICB9XG4gICAgICAgIGlmICh5ICsgaGVpZ2h0ID4gd2luZG93SGVpZ2h0KSB7XG4gICAgICAgICAgICB5IC09IDIwICsgaGVpZ2h0O1xuICAgICAgICB9XG4gICAgICAgIHN1cGVyLnNldFBvc2l0aW9uKHgsIHkpO1xuICAgIH1cbn1cbiJdfQ==