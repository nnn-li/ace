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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiRWRpdG9yLnRzIl0sIm5hbWVzIjpbIkVkaXRvciIsIkVkaXRvci5jb25zdHJ1Y3RvciIsIkVkaXRvci5jYW5jZWxNb3VzZUNvbnRleHRNZW51IiwiRWRpdG9yLnNlbGVjdGlvbiIsIkVkaXRvci4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycyIsIkVkaXRvci4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycy5sYXN0IiwiRWRpdG9yLnN0YXJ0T3BlcmF0aW9uIiwiRWRpdG9yLmVuZE9wZXJhdGlvbiIsIkVkaXRvci4kaGlzdG9yeVRyYWNrZXIiLCJFZGl0b3Iuc2V0S2V5Ym9hcmRIYW5kbGVyIiwiRWRpdG9yLmdldEtleWJvYXJkSGFuZGxlciIsIkVkaXRvci5zZXRTZXNzaW9uIiwiRWRpdG9yLmdldFNlc3Npb24iLCJFZGl0b3Iuc2V0VmFsdWUiLCJFZGl0b3IuZ2V0VmFsdWUiLCJFZGl0b3IuZ2V0U2VsZWN0aW9uIiwiRWRpdG9yLnJlc2l6ZSIsIkVkaXRvci5nZXRUaGVtZSIsIkVkaXRvci5zZXRTdHlsZSIsIkVkaXRvci51bnNldFN0eWxlIiwiRWRpdG9yLmdldEZvbnRTaXplIiwiRWRpdG9yLnNldEZvbnRTaXplIiwiRWRpdG9yLiRoaWdobGlnaHRCcmFja2V0cyIsIkVkaXRvci4kaGlnaGxpZ2h0VGFncyIsIkVkaXRvci5mb2N1cyIsIkVkaXRvci5pc0ZvY3VzZWQiLCJFZGl0b3IuYmx1ciIsIkVkaXRvci5vbkZvY3VzIiwiRWRpdG9yLm9uQmx1ciIsIkVkaXRvci4kY3Vyc29yQ2hhbmdlIiwiRWRpdG9yLm9uRG9jdW1lbnRDaGFuZ2UiLCJFZGl0b3Iub25Ub2tlbml6ZXJVcGRhdGUiLCJFZGl0b3Iub25TY3JvbGxUb3BDaGFuZ2UiLCJFZGl0b3Iub25TY3JvbGxMZWZ0Q2hhbmdlIiwiRWRpdG9yLm9uQ3Vyc29yQ2hhbmdlIiwiRWRpdG9yLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lIiwiRWRpdG9yLm9uU2VsZWN0aW9uQ2hhbmdlIiwiRWRpdG9yLiRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAiLCJFZGl0b3Iub25DaGFuZ2VGcm9udE1hcmtlciIsIkVkaXRvci51cGRhdGVGcm9udE1hcmtlcnMiLCJFZGl0b3Iub25DaGFuZ2VCYWNrTWFya2VyIiwiRWRpdG9yLnVwZGF0ZUJhY2tNYXJrZXJzIiwiRWRpdG9yLm9uQ2hhbmdlQnJlYWtwb2ludCIsIkVkaXRvci5vbkNoYW5nZUFubm90YXRpb24iLCJFZGl0b3Iub25DaGFuZ2VNb2RlIiwiRWRpdG9yLm9uQ2hhbmdlV3JhcExpbWl0IiwiRWRpdG9yLm9uQ2hhbmdlV3JhcE1vZGUiLCJFZGl0b3Iub25DaGFuZ2VGb2xkIiwiRWRpdG9yLmdldFNlbGVjdGVkVGV4dCIsIkVkaXRvci5nZXRDb3B5VGV4dCIsIkVkaXRvci5vbkNvcHkiLCJFZGl0b3Iub25DdXQiLCJFZGl0b3Iub25QYXN0ZSIsIkVkaXRvci5leGVjQ29tbWFuZCIsIkVkaXRvci5pbnNlcnQiLCJFZGl0b3Iub24iLCJFZGl0b3Iub2ZmIiwiRWRpdG9yLnNldERlZmF1bHRIYW5kbGVyIiwiRWRpdG9yLl9lbWl0IiwiRWRpdG9yLl9zaWduYWwiLCJFZGl0b3IuaGFzTGlzdGVuZXJzIiwiRWRpdG9yLm9uVGV4dElucHV0IiwiRWRpdG9yLm9uQ29tbWFuZEtleSIsIkVkaXRvci5zZXRPdmVyd3JpdGUiLCJFZGl0b3IuZ2V0T3ZlcndyaXRlIiwiRWRpdG9yLnRvZ2dsZU92ZXJ3cml0ZSIsIkVkaXRvci5zZXRTY3JvbGxTcGVlZCIsIkVkaXRvci5nZXRTY3JvbGxTcGVlZCIsIkVkaXRvci5zZXREcmFnRGVsYXkiLCJFZGl0b3IuZ2V0RHJhZ0RlbGF5IiwiRWRpdG9yLnNldFNlbGVjdGlvblN0eWxlIiwiRWRpdG9yLmdldFNlbGVjdGlvblN0eWxlIiwiRWRpdG9yLnNldEhpZ2hsaWdodEFjdGl2ZUxpbmUiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5zZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiRWRpdG9yLmdldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJFZGl0b3Iuc2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkIiwiRWRpdG9yLmdldEhpZ2hsaWdodFNlbGVjdGVkV29yZCIsIkVkaXRvci5zZXRBbmltYXRlZFNjcm9sbCIsIkVkaXRvci5nZXRBbmltYXRlZFNjcm9sbCIsIkVkaXRvci5zZXRTaG93SW52aXNpYmxlcyIsIkVkaXRvci5nZXRTaG93SW52aXNpYmxlcyIsIkVkaXRvci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiRWRpdG9yLmdldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJFZGl0b3Iuc2V0U2hvd1ByaW50TWFyZ2luIiwiRWRpdG9yLmdldFNob3dQcmludE1hcmdpbiIsIkVkaXRvci5zZXRQcmludE1hcmdpbkNvbHVtbiIsIkVkaXRvci5nZXRQcmludE1hcmdpbkNvbHVtbiIsIkVkaXRvci5zZXRSZWFkT25seSIsIkVkaXRvci5nZXRSZWFkT25seSIsIkVkaXRvci5zZXRCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5nZXRCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5zZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQiLCJFZGl0b3IuZ2V0V3JhcEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLnNldFNob3dGb2xkV2lkZ2V0cyIsIkVkaXRvci5nZXRTaG93Rm9sZFdpZGdldHMiLCJFZGl0b3Iuc2V0RmFkZUZvbGRXaWRnZXRzIiwiRWRpdG9yLmdldEZhZGVGb2xkV2lkZ2V0cyIsIkVkaXRvci5yZW1vdmUiLCJFZGl0b3IucmVtb3ZlV29yZFJpZ2h0IiwiRWRpdG9yLnJlbW92ZVdvcmRMZWZ0IiwiRWRpdG9yLnJlbW92ZVRvTGluZVN0YXJ0IiwiRWRpdG9yLnJlbW92ZVRvTGluZUVuZCIsIkVkaXRvci5zcGxpdExpbmUiLCJFZGl0b3IudHJhbnNwb3NlTGV0dGVycyIsIkVkaXRvci50b0xvd2VyQ2FzZSIsIkVkaXRvci50b1VwcGVyQ2FzZSIsIkVkaXRvci5pbmRlbnQiLCJFZGl0b3IuYmxvY2tJbmRlbnQiLCJFZGl0b3IuYmxvY2tPdXRkZW50IiwiRWRpdG9yLnNvcnRMaW5lcyIsIkVkaXRvci50b2dnbGVDb21tZW50TGluZXMiLCJFZGl0b3IudG9nZ2xlQmxvY2tDb21tZW50IiwiRWRpdG9yLmdldE51bWJlckF0IiwiRWRpdG9yLm1vZGlmeU51bWJlciIsIkVkaXRvci5yZW1vdmVMaW5lcyIsIkVkaXRvci5kdXBsaWNhdGVTZWxlY3Rpb24iLCJFZGl0b3IubW92ZUxpbmVzRG93biIsIkVkaXRvci5tb3ZlTGluZXNVcCIsIkVkaXRvci5tb3ZlVGV4dCIsIkVkaXRvci5jb3B5TGluZXNVcCIsIkVkaXRvci5jb3B5TGluZXNEb3duIiwiRWRpdG9yLiRtb3ZlTGluZXMiLCJFZGl0b3IuJGdldFNlbGVjdGVkUm93cyIsIkVkaXRvci5vbkNvbXBvc2l0aW9uU3RhcnQiLCJFZGl0b3Iub25Db21wb3NpdGlvblVwZGF0ZSIsIkVkaXRvci5vbkNvbXBvc2l0aW9uRW5kIiwiRWRpdG9yLmdldEZpcnN0VmlzaWJsZVJvdyIsIkVkaXRvci5nZXRMYXN0VmlzaWJsZVJvdyIsIkVkaXRvci5pc1Jvd1Zpc2libGUiLCJFZGl0b3IuaXNSb3dGdWxseVZpc2libGUiLCJFZGl0b3IuJGdldFZpc2libGVSb3dDb3VudCIsIkVkaXRvci4kbW92ZUJ5UGFnZSIsIkVkaXRvci5zZWxlY3RQYWdlRG93biIsIkVkaXRvci5zZWxlY3RQYWdlVXAiLCJFZGl0b3IuZ290b1BhZ2VEb3duIiwiRWRpdG9yLmdvdG9QYWdlVXAiLCJFZGl0b3Iuc2Nyb2xsUGFnZURvd24iLCJFZGl0b3Iuc2Nyb2xsUGFnZVVwIiwiRWRpdG9yLnNjcm9sbFRvUm93IiwiRWRpdG9yLnNjcm9sbFRvTGluZSIsIkVkaXRvci5jZW50ZXJTZWxlY3Rpb24iLCJFZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24iLCJFZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW4iLCJFZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UiLCJFZGl0b3Iuc2VsZWN0QWxsIiwiRWRpdG9yLmNsZWFyU2VsZWN0aW9uIiwiRWRpdG9yLm1vdmVDdXJzb3JUbyIsIkVkaXRvci5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbiIsIkVkaXRvci5qdW1wVG9NYXRjaGluZyIsIkVkaXRvci5nb3RvTGluZSIsIkVkaXRvci5uYXZpZ2F0ZVRvIiwiRWRpdG9yLm5hdmlnYXRlVXAiLCJFZGl0b3IubmF2aWdhdGVEb3duIiwiRWRpdG9yLm5hdmlnYXRlTGVmdCIsIkVkaXRvci5uYXZpZ2F0ZVJpZ2h0IiwiRWRpdG9yLm5hdmlnYXRlTGluZVN0YXJ0IiwiRWRpdG9yLm5hdmlnYXRlTGluZUVuZCIsIkVkaXRvci5uYXZpZ2F0ZUZpbGVFbmQiLCJFZGl0b3IubmF2aWdhdGVGaWxlU3RhcnQiLCJFZGl0b3IubmF2aWdhdGVXb3JkUmlnaHQiLCJFZGl0b3IubmF2aWdhdGVXb3JkTGVmdCIsIkVkaXRvci5yZXBsYWNlIiwiRWRpdG9yLnJlcGxhY2VBbGwiLCJFZGl0b3IuJHRyeVJlcGxhY2UiLCJFZGl0b3IuZ2V0TGFzdFNlYXJjaE9wdGlvbnMiLCJFZGl0b3IuZmluZCIsIkVkaXRvci5maW5kTmV4dCIsIkVkaXRvci5maW5kUHJldmlvdXMiLCJFZGl0b3IucmV2ZWFsUmFuZ2UiLCJFZGl0b3IudW5kbyIsIkVkaXRvci5yZWRvIiwiRWRpdG9yLmRlc3Ryb3kiLCJFZGl0b3Iuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3IiwiRWRpdG9yLiRyZXNldEN1cnNvclN0eWxlIiwiRm9sZEhhbmRsZXIiLCJGb2xkSGFuZGxlci5jb25zdHJ1Y3RvciIsIk1vdXNlSGFuZGxlciIsIk1vdXNlSGFuZGxlci5jb25zdHJ1Y3RvciIsIk1vdXNlSGFuZGxlci5vbk1vdXNlRXZlbnQiLCJNb3VzZUhhbmRsZXIub25Nb3VzZU1vdmUiLCJNb3VzZUhhbmRsZXIuZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudCIsIk1vdXNlSGFuZGxlci5zZXRTdGF0ZSIsIk1vdXNlSGFuZGxlci50ZXh0Q29vcmRpbmF0ZXMiLCJNb3VzZUhhbmRsZXIuY2FwdHVyZU1vdXNlIiwiTW91c2VIYW5kbGVyLmNhbmNlbENvbnRleHRNZW51IiwiTW91c2VIYW5kbGVyLnNlbGVjdCIsIk1vdXNlSGFuZGxlci5zZWxlY3RCeUxpbmVzRW5kIiwiTW91c2VIYW5kbGVyLnN0YXJ0U2VsZWN0IiwiTW91c2VIYW5kbGVyLnNlbGVjdEVuZCIsIk1vdXNlSGFuZGxlci5zZWxlY3RBbGxFbmQiLCJNb3VzZUhhbmRsZXIuc2VsZWN0QnlXb3Jkc0VuZCIsIk1vdXNlSGFuZGxlci5mb2N1c1dhaXQiLCJFZGl0b3JNb3VzZUV2ZW50IiwiRWRpdG9yTW91c2VFdmVudC5jb25zdHJ1Y3RvciIsIkVkaXRvck1vdXNlRXZlbnQudG9FbGVtZW50IiwiRWRpdG9yTW91c2VFdmVudC5zdG9wUHJvcGFnYXRpb24iLCJFZGl0b3JNb3VzZUV2ZW50LnByZXZlbnREZWZhdWx0IiwiRWRpdG9yTW91c2VFdmVudC5zdG9wIiwiRWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uIiwiRWRpdG9yTW91c2VFdmVudC5pblNlbGVjdGlvbiIsIkVkaXRvck1vdXNlRXZlbnQuZ2V0QnV0dG9uIiwiRWRpdG9yTW91c2VFdmVudC5nZXRTaGlmdEtleSIsIm1ha2VNb3VzZURvd25IYW5kbGVyIiwibWFrZU1vdXNlV2hlZWxIYW5kbGVyIiwibWFrZURvdWJsZUNsaWNrSGFuZGxlciIsIm1ha2VUcmlwbGVDbGlja0hhbmRsZXIiLCJtYWtlUXVhZENsaWNrSGFuZGxlciIsIm1ha2VFeHRlbmRTZWxlY3Rpb25CeSIsImNhbGNEaXN0YW5jZSIsImNhbGNSYW5nZU9yaWVudGF0aW9uIiwiR3V0dGVySGFuZGxlciIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3IiLCJHdXR0ZXJIYW5kbGVyLmNvbnN0cnVjdG9yLnNob3dUb29sdGlwIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3Rvci5oaWRlVG9vbHRpcCIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3IubW92ZVRvb2x0aXAiLCJHdXR0ZXJUb29sdGlwIiwiR3V0dGVyVG9vbHRpcC5jb25zdHJ1Y3RvciIsIkd1dHRlclRvb2x0aXAuc2V0UG9zaXRpb24iXSwibWFwcGluZ3MiOiJBQW9EQSxZQUFZLENBQUM7T0FFTixFQUFDLEtBQUssRUFBQyxNQUFNLFdBQVc7T0FDeEIsRUFBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBQyxNQUFNLFdBQVc7T0FDMUQsRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUMsTUFBTSxpQkFBaUI7T0FHakUsVUFBVSxNQUFNLHVCQUF1QjtPQUN2QyxTQUFTLE1BQU0sc0JBQXNCO09BSXJDLE1BQU0sTUFBTSxVQUFVO09BR3RCLEtBQUssTUFBTSxTQUFTO09BSXBCLGlCQUFpQixNQUFNLHlCQUF5QjtPQUVoRCxjQUFjLE1BQU0sMkJBQTJCO09BQy9DLGVBQWUsTUFBTSw2QkFBNkI7T0FDbEQsRUFBQyxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDekQsYUFBYSxNQUFNLGlCQUFpQjtPQUNwQyxFQUFDLDBCQUEwQixFQUFDLE1BQU0sbUJBQW1CO09BSXJELEVBQUMsV0FBVyxFQUFFLHFCQUFxQixFQUFFLHlCQUF5QixFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUMsTUFBTSxhQUFhO09BQ2xKLEVBQUMsWUFBWSxFQUFDLE1BQU0sZUFBZTtPQUVuQyxPQUFPLE1BQU0sV0FBVztBQVMvQjtJQTZGSUEsWUFBWUEsUUFBeUJBLEVBQUVBLE9BQW9CQTtRQUN2REMsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsaUJBQWlCQSxDQUFTQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBLENBQUNBLE1BQU1BLEdB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R0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLElBQUlBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxLQUFLQSxTQUFTQSxDQUFDQTtnQkFDcENBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFakNBLFdBQVdBLEdBQUdBLFdBQVdBO21CQUNsQkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQTttQkFDckJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBRWxEQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2pDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxXQUFXQSxHQUFHQSxXQUFXQTttQkFDbEJBLGlCQUFpQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQ0NBLElBQUlBLENBQUNBLGdCQUFnQkEsSUFBSUEsUUFBUUE7ZUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFDN0NBLENBQUNBLENBQUNBLENBQUNBO1lBQ0NBLFdBQVdBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3hCQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQTtZQUNaQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4Q0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUM1Q0EsQ0FBQ0E7SUFTRFIsa0JBQWtCQSxDQUFDQSxlQUFxQ0E7UUFDcERTLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQzdDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxlQUFlQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsZUFBZUEsQ0FBQ0E7WUFDckNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1lBQ2pCQSxVQUFVQSxDQUFDQSxDQUFDQSxZQUFZQSxFQUFFQSxlQUFlQSxDQUFDQSxFQUFFQSxVQUFTQSxNQUFNQTtnQkFDdkQsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLGFBQWEsSUFBSSxlQUFlLENBQUM7b0JBQ3ZDLEtBQUssQ0FBQyxVQUFVLENBQUMsa0JBQWtCLENBQUMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN0RSxDQUFDLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3JDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUN4REEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFRRFQsa0JBQWtCQTtRQUNkVSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxrQkFBa0JBLEVBQUVBLENBQUNBO0lBQ2hEQSxDQUFDQTtJQVVEVixVQUFVQSxDQUFDQSxPQUFvQkE7UUFDM0JXLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEtBQUtBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQzNCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDYkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQTtZQUNuREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsWUFBWUEsRUFBRUEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFDbkRBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUM3REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsZUFBZUEsRUFBRUEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQTtZQUN6REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBQzdEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7WUFDM0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1lBQ3JEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxtQkFBbUJBLEVBQUVBLElBQUlBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsQ0FBQ0E7WUFDakVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUMvREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBQy9EQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxrQkFBa0JBLEVBQUVBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7WUFDMURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUM3REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRS9EQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtZQUM1Q0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsY0FBY0EsRUFBRUEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7WUFDcERBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtRQUM5REEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsT0FBT0EsQ0FBQ0E7UUFDdkJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxREEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQTtZQUM3Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFFbENBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2xEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxZQUFZQSxFQUFFQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtZQUU3Q0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzVEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFFdkRBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDMUVBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGVBQWVBLEVBQUVBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7WUFFbkRBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRXZEQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDMURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGdCQUFnQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQTtZQUVyREEsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDbERBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1lBRTdDQSxJQUFJQSxDQUFDQSxvQkFBb0JBLEdBQUdBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDaEVBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLG1CQUFtQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxDQUFDQTtZQUUzREEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzlEQSxPQUFPQSxDQUFDQSxFQUFFQSxDQUFDQSxrQkFBa0JBLEVBQUVBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7WUFFekRBLElBQUlBLENBQUNBLG1CQUFtQkEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM5REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRXpEQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUV6REEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdERBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7WUFFcERBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRXZEQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUV6REEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7WUFDeENBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLGNBQWNBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBRXhEQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUU5REEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUMxQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFFMUJBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFFOUNBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFFL0NBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLElBQUlBLENBQUNBLGtCQUFr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RUFBRUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9FQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUN0QkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxJQUFJQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsREEsSUFBSUEsS0FBS0EsR0FBVUEsSUFBSUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDdkZBLEtBQUtBLENBQUNBLFFBQVFBLEdBQUdBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLEVBQUVBLGlCQUFpQkEsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7WUFDM0VBLE9BQU9BLENBQUNBLG9CQUFvQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxPQUFPQSxDQUFDQSxvQkFBb0JBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3ZEQSxPQUFPQSxDQUFD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QUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0Q0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzRUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7UUFFdEJBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1FBQzFCQSxJQUFJQSxTQUFTQSxHQUFHQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM3Q0EsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLElBQUlBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzdEQSxJQUFJQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUV2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsSUFBSUEsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUM1QkEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDaERBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLEdBQUdBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pEQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUM1QkEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDekNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEVBQ3RCQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUNuQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckNBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hDQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBLENBQUNBO1lBQ3pHQSxPQUFPQSxD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TUFBTUEsQ0FBQ0E7WUFDbEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQU1EakgsWUFBWUEsQ0FBQ0EsTUFBY0E7UUFDdkJrSCxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUN6Q0EsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFHL0NBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRXhEQSxJQUFJQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUV6REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFM0JBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBRXZDQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDTEEsSUFBSUEsRUFBRUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ3BGQSxJQUFJQSxRQUFRQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFFL0NBLElBQUlBLENBQUNBLEdBQUdBLFVBQVVBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUM3QkEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBRzVCQSxFQUFFQSxDQUFDQSxDQUFDQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDL0JBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNoREEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLENBQUNBO29CQUNKQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDNUNBLENBQUNBO2dCQUVEQSxDQUFDQSxJQUFJQSxNQUFNQSxDQUFDQTtnQkFDWkEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzVCQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFHOUJBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLEtBQUtBLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN6REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBR3hDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUxRkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFNRGxILFdBQVdBO1FBQ1BtSCxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO1FBQ25DQSxJQUFJQSxLQUFLQSxDQUFDQTtRQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxLQUFLQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUM3REEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQ2JBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLEVBQzNEQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUNwREEsQ0FBQ0E7UUFDTkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDM0JBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQzFCQSxDQUFDQTtJQUVEbkgsa0JBQWtCQTtRQUNkb0gsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDekJBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQ3ZCQSxJQUFJQSxLQUFLQSxHQUFHQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUMzQkEsSUFBSUEsT0FBT0EsR0FBR0EsR0FBR0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFDaENBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUMxQkEsR0FBR0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLEtBQUtBLEdBQUdBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQzlDQSxJQUFJQSxRQUFRQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxFQUFFQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxREEsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDcEJBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBRXJCQSxHQUFHQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1FBQzFDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQVFEcEgsYUFBYUE7UUFDVHFILElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFVBQVNBLFFBQVFBLEVBQUVBLE9BQU9BO1lBQ3RDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDekQsQ0FBQyxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQU9EckgsV0FBV0E7UUFDUHNILElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFVBQVNBLFFBQVFBLEVBQUVBLE9BQU9BO1lBQ3RDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDdkQsQ0FBQyxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQWFEdEgsUUFBUUEsQ0FBQ0EsS0FBS0EsRUFBRUEsVUFBVUEsRUFBRUEsSUFBSUE7UUFDNUJ1SCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxFQUFFQSxVQUFVQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUMxREEsQ0FBQ0E7SUFPRHZILFdBQVdBO1FBQ1B3SCxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxVQUFTQSxRQUFRQSxFQUFFQSxPQUFPQTtZQUN0QyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDL0MsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUNiLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFRRHhILGFBQWFBO1FBQ1R5SCxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxVQUFTQSxRQUFRQSxFQUFFQSxPQUFPQTtZQUN0QyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFELENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFRT3pILFVBQVVBLENBQUNBLEtBQUtBO1FBQ3BCMEgsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqRUEsSUFBSUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7WUFDeENBLElBQUlBLFlBQVlBLEdBQW9DQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO1lBQzVFQSxJQUFJQSxVQUFVQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxZQUFZQSxDQUFDQSxLQUFLQSxFQUFFQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN6RUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBO1lBQ3hDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtZQUU3QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0E7Z0JBQy9CQSxJQUFJQSxVQUFVQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDbkJBLElBQUlBLGFBQWFBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO2dCQUM3Q0EsSUFBSUEsSUFBSUEsR0FBR0EsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ2pDQSxJQUFJQSxLQUFLQSxHQUFHQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtnQkFDcENBLE9BQU9BLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO29CQUNUQSxhQUFhQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtvQkFDekNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLGFBQWFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO3dCQUNuQ0EsS0FBS0EsR0FBR0EsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7b0JBQ2xDQSxJQUFJQTt3QkFDQUEsS0FBS0EsQ0FBQ0E7Z0JBQ2RBLENBQUNBO2dCQUNEQSxDQUFDQSxFQUFFQSxDQUFDQTtnQkFFSkEsSUFBSUEsVUFBVUEsR0FBR0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQy9DQSxPQUFPQSxVQUFVQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQTtvQkFDckJBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUN6Q0EsVUFBVUEsRUFBRUEsQ0FBQ0E7Z0JBQ2pCQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUNEQSxTQUFTQSxDQUFDQSxpQkFBaUJBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pEQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUM3Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFTTzFILGdCQUFnQkE7UUFDcEIySCxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBRXBEQSxNQUFNQSxDQUFDQTtZQUNIQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNwREEsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7U0FDbERBLENBQUNBO0lBQ05BLENBQUNBO0lBRUQzSCxrQkFBa0JBLENBQUNBLElBQWFBO1FBQzVCNEgsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUM1REEsQ0FBQ0E7SUFFRDVILG1CQUFtQkEsQ0FBQ0EsSUFBYUE7UUFDN0I2SCxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO0lBQzNDQSxDQUFDQTtJQUVEN0gsZ0JBQWdCQTtRQUNaOEgsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7SUFDcENBLENBQUNBO0lBUUQ5SCxrQkFBa0JBO1FBQ2QrSCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxrQkFBa0JBLEVBQUVBLENBQUNBO0lBQzlDQSxDQUFDQTtJQVFEL0gsaUJBQWlCQTtRQUNiZ0ksTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtJQUM3Q0EsQ0FBQ0E7SUFRRGhJLFlBQVlBLENBQUNBLEdBQVdBO1FBQ3BCaUksTUFBTUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBLENBQUNBO0lBQ2pGQSxDQUFDQTtJQVNEakksaUJBQWlCQSxDQUFDQSxHQUFXQTtRQUN6QmtJLE1BQU1BLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLHVCQUF1QkEsRUFBRUEsSUFBSUEsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esc0JBQXNCQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUM3R0EsQ0FBQ0E7SUFNT2xJLG1CQUFtQkE7UUFDdkJtSSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxrQkFBa0JBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLGVBQWVBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO0lBQ3BGQSxDQUFDQTtJQU9PbkksV0FBV0EsQ0FBQ0EsU0FBaUJBLEVBQUVBLE1BQWdCQTtRQUNuRG9JLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO1FBQzdCQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxXQUFXQSxDQUFDQTtRQUN2Q0EsSUFBSUEsSUFBSUEsR0FBR0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFFckVBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1FBQ3ZCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsY0FBY0EsQ0FBQ0E7Z0JBQzFCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQy9CLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDUEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsS0FBS0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUNwQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFFdkJBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLENBQUNBLFNBQVNBLENBQUNBO1FBRW5DQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxHQUFHQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtRQUUvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFakJBLFFBQVFBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLENBQUNBO1FBRURBLFFBQVFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDekNBLENBQUNBO0lBS0RwSSxjQUFjQTtRQUNWcUksSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDL0JBLENBQUNBO0lBS0RySSxZQUFZQTtRQUNSc0ksSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDL0JBLENBQUNBO0lBS0R0SSxZQUFZQTtRQUNSdUksSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDaENBLENBQUNBO0lBS0R2SSxVQUFVQTtRQUNOd0ksSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDaENBLENBQUNBO0lBS0R4SSxjQUFjQTtRQUNWeUksSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBS0R6SSxZQUFZQTtRQUNSMEksSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDekJBLENBQUNBO0lBTUQxSSxXQUFXQSxDQUFDQSxHQUFXQTtRQUNuQjJJLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO0lBQ25DQSxDQUFDQTtJQVlEM0ksWUFBWUEsQ0FBQ0EsSUFBWUEsRUFBRUEsTUFBZUEsRUFBRUEsT0FBZ0JBLEVBQUVBLFFBQW9CQTtRQUM5RTRJLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLEVBQUVBLE1BQU1BLEVBQUVBLE9BQU9BLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO0lBQ2hFQSxDQUFDQTtJQUtENUksZUFBZUE7UUFDWDZJLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7UUFDckNBLElBQUlBLEdBQUdBLEdBQUdBO1lBQ05BLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3hFQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtTQUN2RkEsQ0FBQ0E7UUFDRkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDeENBLENBQUNBO0lBUUQ3SSxpQkFBaUJBO1FBQ2I4SSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtJQUN0Q0EsQ0FBQ0E7SUFRRDlJLHVCQUF1QkE7UUFDbkIrSSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUFBO1FBQ3JDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSx3QkFBd0JBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO0lBQzVFQSxDQUFDQTtJQU1EL0ksaUJBQWlCQTtRQUNiZ0osTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7SUFDckNBLENBQUNBO0lBUURoSixTQUFTQTtRQUNMaUosSUFBSUEsQ0FBQ0EsZUFBZUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1FBQzNCQSxJQUFJQSxDQUFDQSxlQUFlQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUM5QkEsQ0FBQ0E7SUFNRGpKLGNBQWNBO1FBQ1ZrSixJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtJQUNwQ0EsQ0FBQ0E7SUFVRGxKLFlBQVlBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBLEVBQUVBLE9BQWlCQTtRQUN2RG1KLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3REQSxDQUFDQTtJQVNEbkosb0JBQW9CQSxDQUFDQSxRQUFrQkE7UUFDbkNvSixNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxvQkFBb0JBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3pEQSxDQUFDQTtJQVNEcEosY0FBY0EsQ0FBQ0EsTUFBZUE7UUFDMUJxSixJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1FBQ3RDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMxRUEsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDM0NBLElBQUlBLEtBQUtBLEdBQUdBLFNBQVNBLENBQUNBO1FBRXRCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUVuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDUEEsTUFBTUEsQ0FBQ0E7UUFHWEEsSUFBSUEsU0FBU0EsQ0FBQ0E7UUFDZEEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDbEJBLElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLElBQUlBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3BDQSxJQUFJQSxXQUFXQSxDQUFDQTtRQUNoQkEsSUFBSUEsUUFBUUEsR0FBR0E7WUFDWEEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7U0FDWEEsQ0FBQ0E7UUFFRkEsR0FBR0EsQ0FBQ0E7WUFDQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDM0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsUUFBUUEsQ0FBQ0E7b0JBQ2JBLENBQUNBO29CQUVEQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFFdEZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3JCQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDVEEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBOzRCQUNKQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFDckJBLEtBQUtBLENBQUNBO3dCQUNWQSxLQUFLQSxH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LENBQUNBO2dDQUNsQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7NEJBQ2pCQSxDQUFDQTs0QkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0NBQ2pCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTt3QkFDckJBLENBQUNBO29CQUNMQSxDQUFDQTtnQkFDTEEsQ0FBQ0EsUUFBUUEsU0FBU0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUE7WUFDbENBLENBQUNBO1lBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQ0EsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDbEVBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3hCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxHQUFHQSxHQUFHQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDTkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0Es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LENBQUNBLENBQUNBO1lBQ1ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUNoREEsSUFBSUEsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2ZBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1FBRXBCQSxJQUFJQSxDQUFDQSxlQUFlQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUxQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUN6Q0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFNUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDM0NBLFFBQVFBLEVBQUVBLENBQUNBO1lBQ2ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1FBRTFCQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFT25LLFdBQVdBLENBQUNBLEtBQVlBLEVBQUVBLFdBQW1CQTtRQUNqRG9LLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQzdDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUN2REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNqQkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO0lBQ0xBLENBQUNBO0lBT0RwSyxvQkFBb0JBO1FBQ2hCcUssTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7SUFDckNBLENBQUNBO0lBV0RySyxJQUFJQSxDQUFDQSxNQUF5QkEsRUFBRUEsT0FBT0EsRUFBRUEsT0FBaUJBO1FBQ3REc0ssRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDVEEsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFFakJBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLElBQUlBLFFBQVFBLElBQUlBLE1BQU1BLFlBQVlBLE1BQU1BLENBQUNBO1lBQ3REQSxPQUFPQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0E7WUFDL0JBLEtBQUtBLENBQUNBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRTNCQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekJBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1lBQzFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZFQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNmQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUV2Q0EsSUFBSUEsUUFBUUEs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QUFVQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxjQUFjQSxDQUFDQSxDQUFDQTtZQUNuR0EseUJBQXlCQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxjQUFjQSxDQUFDQSxDQUFDQTtZQUNuR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1BBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLEVBQUVBLFdBQVdBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO2dCQUUxRUEsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsRUFBRUEsV0FBV0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDOUVBLENBQUNBO1FBQ0xBLENBQUNBO1FBR0RBLHFCQUFxQkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsRUFBRUEsSUFBSUEsQ0FBQ0EseUJBQXlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUVqR0EsSUFBSUEsUUFBUUEsR0FBR0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDdkNBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLFdBQVdBLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDcEZBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVB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QUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4RkEsSUFBSUEsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDaENBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO0lBQy9EQSxDQUFDQTtJQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNWQSxNQUFNQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUN0REEsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDRkEsTUFBTUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7SUFDdERBLENBQUNBO0FBQ0xBLENBQUNBO0FBRUQ7SUFDSUMsWUFBWUEsWUFBMEJBO1FBQ2xDQyxJQUFJQSxNQUFNQSxHQUFXQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUN6Q0EsSUFBSUEsTUFBTUEsR0FBV0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7UUFDbERBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLGFBQWFBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNB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RCxXQUFXQSxDQUFDQSxDQUFTQSxFQUFFQSxDQUFTQTtRQUM1QkUsSUFBSUEsV0FBV0EsR0FBR0EsTUFBTUEsQ0FBQ0EsVUFBVUEsSUFBSUEsUUFBUUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7UUFDNUVBLElBQUlBLFlBQVlBLEdBQUdBLE1BQU1BLENBQUNBLFdBQVdBLElBQUlBLFFBQVFBLENBQUNBLGVBQWVBLENBQUNBLFlBQVlBLENBQUNBO1FBQy9FQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUM1QkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7UUFDOUJBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1FBQ1JBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBO1FBQ1JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLEdBQUdBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxXQUFXQSxDQUFDQTtRQUNuQ0EsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsR0FBR0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUNEQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7QUFDTEYsQ0FBQ0E7QUFBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtjb21wdXRlZFN0eWxlLCBoYXNDc3NDbGFzcywgc2V0Q3NzQ2xhc3N9IGZyb20gXCIuL2xpYi9kb21cIjtcbmltcG9ydCB7ZGVsYXllZENhbGwsIHN0cmluZ1JlcGVhdH0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCB7aXNJRSwgaXNNYWMsIGlzTW9iaWxlLCBpc09sZElFLCBpc1dlYktpdH0gZnJvbSBcIi4vbGliL3VzZXJhZ2VudFwiO1xuaW1wb3J0IEd1dHRlciBmcm9tIFwiLi9sYXllci9HdXR0ZXJcIjtcbmltcG9ydCBIYXNoSGFuZGxlciBmcm9tIFwiLi9rZXlib2FyZC9IYXNoSGFuZGxlclwiO1xuaW1wb3J0IEtleUJpbmRpbmcgZnJvbSBcIi4va2V5Ym9hcmQvS2V5QmluZGluZ1wiO1xuaW1wb3J0IFRleHRJbnB1dCBmcm9tIFwiLi9rZXlib2FyZC9UZXh0SW5wdXRcIjtcbmltcG9ydCBEZWx0YSBmcm9tIFwiLi9EZWx0YVwiO1xuaW1wb3J0IERlbHRhRXZlbnQgZnJvbSBcIi4vRGVsdGFFdmVudFwiO1xuaW1wb3J0IEVkaXRTZXNzaW9uIGZyb20gXCIuL0VkaXRTZXNzaW9uXCI7XG5pbXBvcnQgU2VhcmNoIGZyb20gXCIuL1NlYXJjaFwiO1xuaW1wb3J0IEZpcnN0QW5kTGFzdCBmcm9tIFwiLi9GaXJzdEFuZExhc3RcIjtcbmltcG9ydCBQb3NpdGlvbiBmcm9tIFwiLi9Qb3NpdGlvblwiO1xuaW1wb3J0IFJhbmdlIGZyb20gXCIuL1JhbmdlXCI7XG5pbXBvcnQgVGV4dEFuZFNlbGVjdGlvbiBmcm9tIFwiLi9UZXh0QW5kU2VsZWN0aW9uXCI7XG5pbXBvcnQgQ3Vyc29yUmFuZ2UgZnJvbSAnLi9DdXJzb3JSYW5nZSc7XG5pbXBvcnQgRXZlbnRCdXMgZnJvbSBcIi4vRXZlbnRCdXNcIjtcbmltcG9ydCBFdmVudEVtaXR0ZXJDbGFzcyBmcm9tIFwiLi9saWIvRXZlbnRFbWl0dGVyQ2xhc3NcIjtcbmltcG9ydCBDb21tYW5kIGZyb20gXCIuL2NvbW1hbmRzL0NvbW1hbmRcIjtcbmltcG9ydCBDb21tYW5kTWFuYWdlciBmcm9tIFwiLi9jb21tYW5kcy9Db21tYW5kTWFuYWdlclwiO1xuaW1wb3J0IGRlZmF1bHRDb21tYW5kcyBmcm9tIFwiLi9jb21tYW5kcy9kZWZhdWx0X2NvbW1hbmRzXCI7XG5pbXBvcnQge2RlZmluZU9wdGlvbnMsIGxvYWRNb2R1bGUsIHJlc2V0T3B0aW9uc30gZnJvbSBcIi4vY29uZmlnXCI7XG5pbXBvcnQgVG9rZW5JdGVyYXRvciBmcm9tIFwiLi9Ub2tlbkl0ZXJhdG9yXCI7XG5pbXBvcnQge0NPTU1BTkRfTkFNRV9BVVRPX0NPTVBMRVRFfSBmcm9tICcuL2VkaXRvcl9wcm90b2NvbCc7XG5pbXBvcnQgVmlydHVhbFJlbmRlcmVyIGZyb20gJy4vVmlydHVhbFJlbmRlcmVyJztcbmltcG9ydCB7Q29tcGxldGVyfSBmcm9tIFwiLi9hdXRvY29tcGxldGVcIjtcbmltcG9ydCBTZWxlY3Rpb24gZnJvbSAnLi9TZWxlY3Rpb24nO1xuaW1wb3J0IHthZGRMaXN0ZW5lciwgYWRkTW91c2VXaGVlbExpc3RlbmVyLCBhZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyLCBjYXB0dXJlLCBnZXRCdXR0b24sIHByZXZlbnREZWZhdWx0LCBzdG9wRXZlbnQsIHN0b3BQcm9wYWdhdGlvbn0gZnJvbSBcIi4vbGliL2V2ZW50XCI7XG5pbXBvcnQge3RvdWNoTWFuYWdlcn0gZnJvbSAnLi90b3VjaC90b3VjaCc7XG5pbXBvcnQgVGhlbWVMaW5rIGZyb20gXCIuL1RoZW1lTGlua1wiO1xuaW1wb3J0IFRvb2x0aXAgZnJvbSBcIi4vVG9vbHRpcFwiO1xuXG4vL3ZhciBEcmFnZHJvcEhhbmRsZXIgPSByZXF1aXJlKFwiLi9tb3VzZS9kcmFnZHJvcF9oYW5kbGVyXCIpLkRyYWdkcm9wSGFuZGxlcjtcblxuLyoqXG4gKiBUaGUgYEVkaXRvcmAgYWN0cyBhcyBhIGNvbnRyb2xsZXIsIG1lZGlhdGluZyBiZXR3ZWVuIHRoZSBlZGl0U2Vzc2lvbiBhbmQgcmVuZGVyZXIuXG4gKlxuICogQGNsYXNzIEVkaXRvclxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFZGl0b3IgaW1wbGVtZW50cyBFdmVudEJ1czxFZGl0b3I+IHtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSByZW5kZXJlclxuICAgICAqIEB0eXBlIFZpcnR1YWxSZW5kZXJlclxuICAgICAqL1xuICAgIHB1YmxpYyByZW5kZXJlcjogVmlydHVhbFJlbmRlcmVyO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IHNlc3Npb25cbiAgICAgKiBAdHlwZSBFZGl0U2Vzc2lvblxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXNzaW9uOiBFZGl0U2Vzc2lvbjtcblxuICAgIC8qKlxuICAgICAqIEBwcm9wZXJ0eSBldmVudEJ1c1xuICAgICAqIEB0eXBlIEV2ZW50RW1pdHRlckNsYXNzXG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIGV2ZW50QnVzOiBFdmVudEVtaXR0ZXJDbGFzczxFZGl0b3I+O1xuXG4gICAgcHJpdmF0ZSAkdG91Y2hIYW5kbGVyOiBJR2VzdHVyZUhhbmRsZXI7XG4gICAgcHJpdmF0ZSAkbW91c2VIYW5kbGVyOiBJR2VzdHVyZUhhbmRsZXI7XG4gICAgcHVibGljIGdldE9wdGlvbjtcbiAgICBwdWJsaWMgc2V0T3B0aW9uO1xuICAgIHB1YmxpYyBzZXRPcHRpb25zO1xuICAgIHB1YmxpYyAkaXNGb2N1c2VkO1xuICAgIHB1YmxpYyBjb21tYW5kczogQ29tbWFuZE1hbmFnZXI7XG4gICAgcHVibGljIGtleUJpbmRpbmc6IEtleUJpbmRpbmc7XG4gICAgLy8gRklYTUU6IFRoaXMgaXMgcmVhbGx5IGFuIG9wdGlvbmFsIGV4dGVuc2lvbiBhbmQgc28gZG9lcyBub3QgYmVsb25nIGhlcmUuXG4gICAgcHVibGljIGNvbXBsZXRlcnM6IENvbXBsZXRlcltdO1xuXG4gICAgcHVibGljIHdpZGdldE1hbmFnZXI7XG5cbiAgICAvKipcbiAgICAgKiBUaGUgcmVuZGVyZXIgY29udGFpbmVyIGVsZW1lbnQuXG4gICAgICovXG4gICAgcHVibGljIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG4gICAgcHVibGljIHRleHRJbnB1dDtcbiAgICBwdWJsaWMgaW5NdWx0aVNlbGVjdE1vZGU6IGJvb2xlYW47XG4gICAgcHVibGljIG11bHRpU2VsZWN0OiBTZWxlY3Rpb247XG4gICAgcHVibGljIGluVmlydHVhbFNlbGVjdGlvbk1vZGU7XG5cbiAgICBwcml2YXRlICRjdXJzb3JTdHlsZTogc3RyaW5nO1xuICAgIHByaXZhdGUgJGtleWJpbmRpbmdJZDtcbiAgICBwcml2YXRlICRibG9ja1Njcm9sbGluZztcbiAgICBwcml2YXRlICRoaWdobGlnaHRBY3RpdmVMaW5lO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodFBlbmRpbmc7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodFRhZ1BlbmRpbmc7XG4gICAgcHJpdmF0ZSAkbWVyZ2VVbmRvRGVsdGFzO1xuICAgIHB1YmxpYyAkcmVhZE9ubHk7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsQW5jaG9yO1xuICAgIHByaXZhdGUgJHNlYXJjaDogU2VhcmNoO1xuICAgIHByaXZhdGUgXyRlbWl0SW5wdXRFdmVudDtcbiAgICBwcml2YXRlIHNlbGVjdGlvbnM6IGFueVtdO1xuICAgIHByaXZhdGUgJHNlbGVjdGlvblN0eWxlO1xuICAgIHByaXZhdGUgJG9wUmVzZXRUaW1lcjtcbiAgICBwcml2YXRlIGN1ck9wO1xuICAgIHByaXZhdGUgcHJldk9wOiB7IGNvbW1hbmQ/OyBhcmdzP307XG4gICAgcHJpdmF0ZSBsYXN0RmlsZUp1bXBQb3M7XG4gICAgcHJpdmF0ZSBwcmV2aW91c0NvbW1hbmQ7XG4gICAgcHJpdmF0ZSAkbWVyZ2VhYmxlQ29tbWFuZHM6IHN0cmluZ1tdO1xuICAgIHByaXZhdGUgbWVyZ2VOZXh0Q29tbWFuZDtcbiAgICBwcml2YXRlICRtZXJnZU5leHRDb21tYW5kO1xuICAgIHByaXZhdGUgc2VxdWVuY2VTdGFydFRpbWU6IG51bWJlcjtcbiAgICBwcml2YXRlICRvbkRvY3VtZW50Q2hhbmdlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlTW9kZTtcbiAgICBwcml2YXRlICRvblRva2VuaXplclVwZGF0ZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZVRhYlNpemU6IChldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSA9PiBhbnk7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VXcmFwTGltaXQ7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VXcmFwTW9kZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZUZvbGQ7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VGcm9udE1hcmtlcjtcbiAgICBwcml2YXRlICRvbkNoYW5nZUJhY2tNYXJrZXI7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VCcmVha3BvaW50O1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlQW5ub3RhdGlvbjtcbiAgICBwcml2YXRlICRvbkN1cnNvckNoYW5nZTtcbiAgICBwcml2YXRlICRvblNjcm9sbFRvcENoYW5nZTtcbiAgICBwcml2YXRlICRvblNjcm9sbExlZnRDaGFuZ2U7XG4gICAgcHVibGljICRvblNlbGVjdGlvbkNoYW5nZTogKGV2ZW50LCBzZWxlY3Rpb246IFNlbGVjdGlvbikgPT4gdm9pZDtcbiAgICBwdWJsaWMgZXhpdE11bHRpU2VsZWN0TW9kZTtcbiAgICBwdWJsaWMgZm9yRWFjaFNlbGVjdGlvbjtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgYEVkaXRvcmAgb2JqZWN0LlxuICAgICAqXG4gICAgICogQGNsYXNzIEVkaXRvclxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSByZW5kZXJlciB7VmlydHVhbFJlbmRlcmVyfSBUaGUgdmlldy5cbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259IFRoZSBtb2RlbC5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihyZW5kZXJlcjogVmlydHVhbFJlbmRlcmVyLCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLmV2ZW50QnVzID0gbmV3IEV2ZW50RW1pdHRlckNsYXNzPEVkaXRvcj4odGhpcyk7XG4gICAgICAgIHRoaXMuY3VyT3AgPSBudWxsO1xuICAgICAgICB0aGlzLnByZXZPcCA9IHt9O1xuICAgICAgICB0aGlzLiRtZXJnZWFibGVDb21tYW5kcyA9IFtcImJhY2tzcGFjZVwiLCBcImRlbFwiLCBcImluc2VydHN0cmluZ1wiXTtcbiAgICAgICAgdGhpcy5jb21tYW5kcyA9IG5ldyBDb21tYW5kTWFuYWdlcihpc01hYyA/IFwibWFjXCIgOiBcIndpblwiLCBkZWZhdWx0Q29tbWFuZHMpO1xuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IHJlbmRlcmVyLmdldENvbnRhaW5lckVsZW1lbnQoKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlciA9IHJlbmRlcmVyO1xuXG4gICAgICAgIHRoaXMudGV4dElucHV0ID0gbmV3IFRleHRJbnB1dChyZW5kZXJlci5nZXRUZXh0QXJlYUNvbnRhaW5lcigpLCB0aGlzKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci50ZXh0YXJlYSA9IHRoaXMudGV4dElucHV0LmdldEVsZW1lbnQoKTtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nID0gbmV3IEtleUJpbmRpbmcodGhpcyk7XG5cbiAgICAgICAgaWYgKGlzTW9iaWxlKSB7XG4gICAgICAgICAgICB0aGlzLiR0b3VjaEhhbmRsZXIgPSB0b3VjaE1hbmFnZXIodGhpcyk7XG4gICAgICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIgPSBuZXcgTW91c2VIYW5kbGVyKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kdG91Y2hIYW5kbGVyID0gdG91Y2hNYW5hZ2VyKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy4kbW91c2VIYW5kbGVyID0gbmV3IE1vdXNlSGFuZGxlcih0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ldyBGb2xkSGFuZGxlcih0aGlzKTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyA9IDA7XG4gICAgICAgIHRoaXMuJHNlYXJjaCA9IG5ldyBTZWFyY2goKS5zZXQoeyB3cmFwOiB0cnVlIH0pO1xuXG4gICAgICAgIHRoaXMuJGhpc3RvcnlUcmFja2VyID0gdGhpcy4kaGlzdG9yeVRyYWNrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImV4ZWNcIiwgdGhpcy4kaGlzdG9yeVRyYWNrZXIpO1xuXG4gICAgICAgIHRoaXMuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMoKTtcblxuICAgICAgICB0aGlzLl8kZW1pdElucHV0RXZlbnQgPSBkZWxheWVkQ2FsbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImlucHV0XCIsIHt9KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5iZ1Rva2VuaXplciAmJiB0aGlzLnNlc3Npb24uYmdUb2tlbml6ZXIuc2NoZWR1bGVTdGFydCgpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuXyRlbWl0SW5wdXRFdmVudC5zY2hlZHVsZSgzMSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICAvLyBGSVhNRTogVGhpcyB3YXMgYSBzaWduYWwgdG8gYSBnbG9iYWwgY29uZmlnIG9iamVjdC5cbiAgICAgICAgLy8gX3NpZ25hbChcImVkaXRvclwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICBjYW5jZWxNb3VzZUNvbnRleHRNZW51KCkge1xuICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgc2VsZWN0aW9uXG4gICAgICogQHR5cGUgU2VsZWN0aW9uXG4gICAgICovXG4gICAgZ2V0IHNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgIH1cbiAgICBzZXQgc2VsZWN0aW9uKHNlbGVjdGlvbjogU2VsZWN0aW9uKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uKTtcbiAgICB9XG5cbiAgICAkaW5pdE9wZXJhdGlvbkxpc3RlbmVycygpIHtcblxuICAgICAgICBmdW5jdGlvbiBsYXN0PFQ+KGE6IFRbXSk6IFQgeyByZXR1cm4gYVthLmxlbmd0aCAtIDFdIH1cblxuICAgICAgICB0aGlzLnNlbGVjdGlvbnMgPSBbXTtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImV4ZWNcIiwgKGU6IHtjb21tYW5kOiBDb21tYW5kfSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5zdGFydE9wZXJhdGlvbihlKTtcblxuICAgICAgICAgICAgdmFyIGNvbW1hbmQgPSBlLmNvbW1hbmQ7XG4gICAgICAgICAgICBpZiAoY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgPT09IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgIHZhciBwcmV2ID0gdGhpcy5wcmV2T3A7XG4gICAgICAgICAgICAgICAgaWYgKCFwcmV2IHx8IHByZXYuY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgIT09IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmxhc3RGaWxlSnVtcFBvcyA9IGxhc3QodGhpcy5zZWxlY3Rpb25zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMubGFzdEZpbGVKdW1wUG9zID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImFmdGVyRXhlY1wiLCAoZToge2NvbW1hbmQ6IENvbW1hbmR9LCBjbTogQ29tbWFuZE1hbmFnZXIpID0+IHtcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gZS5jb21tYW5kO1xuXG4gICAgICAgICAgICBpZiAoY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgPT09IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmxhc3RGaWxlSnVtcFBvcyAmJiAhdGhpcy5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLmZyb21KU09OKHRoaXMubGFzdEZpbGVKdW1wUG9zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVuZE9wZXJhdGlvbihlKTtcbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy4kb3BSZXNldFRpbWVyID0gZGVsYXllZENhbGwodGhpcy5lbmRPcGVyYXRpb24uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihcImNoYW5nZVwiLCAoKSA9PiB7XG4gICAgICAgICAgICB0aGlzLmN1ck9wIHx8IHRoaXMuc3RhcnRPcGVyYXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AuZG9jQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jdXJPcCB8fCB0aGlzLnN0YXJ0T3BlcmF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9LCB0cnVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHByaXZhdGUgc3RhcnRPcGVyYXRpb24oY29tbWFuZEV2ZW50Pykge1xuICAgICAgICBpZiAodGhpcy5jdXJPcCkge1xuICAgICAgICAgICAgaWYgKCFjb21tYW5kRXZlbnQgfHwgdGhpcy5jdXJPcC5jb21tYW5kKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMucHJldk9wID0gdGhpcy5jdXJPcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWNvbW1hbmRFdmVudCkge1xuICAgICAgICAgICAgdGhpcy5wcmV2aW91c0NvbW1hbmQgPSBudWxsO1xuICAgICAgICAgICAgY29tbWFuZEV2ZW50ID0ge307XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRvcFJlc2V0VGltZXIuc2NoZWR1bGUoKTtcbiAgICAgICAgdGhpcy5jdXJPcCA9IHtcbiAgICAgICAgICAgIGNvbW1hbmQ6IGNvbW1hbmRFdmVudC5jb21tYW5kIHx8IHt9LFxuICAgICAgICAgICAgYXJnczogY29tbWFuZEV2ZW50LmFyZ3MsXG4gICAgICAgICAgICBzY3JvbGxUb3A6IHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9wXG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIGNvbW1hbmQgPSB0aGlzLmN1ck9wLmNvbW1hbmQ7XG4gICAgICAgIGlmIChjb21tYW5kICYmIGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcpXG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9ucy5wdXNoKHRoaXMuc2VsZWN0aW9uLnRvSlNPTigpKTtcbiAgICB9XG5cbiAgICAvLyBGSVhNRTogVGhpcyBwcm9iYWJseSBkb2Vzbid0IHJlcXVpcmUgdGhlIGFyZ3VtZW50LlxuICAgIGVuZE9wZXJhdGlvbih1bnVzZWQ/OiBhbnkpIHtcbiAgICAgICAgaWYgKHRoaXMuY3VyT3ApIHtcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gdGhpcy5jdXJPcC5jb21tYW5kO1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQgJiYgY29tbWFuZC5zY3JvbGxJbnRvVmlldykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgICAgICAgICAgc3dpdGNoIChjb21tYW5kLnNjcm9sbEludG9WaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJjZW50ZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiYW5pbWF0ZVwiOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiY3Vyc29yXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcInNlbGVjdGlvblBhcnRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5yZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPj0gY29uZmlnLmxhc3RSb3cgfHwgcmFuZ2UuZW5kLnJvdyA8PSBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3KHRoaXMuc2VsZWN0aW9uLmFuY2hvciwgdGhpcy5zZWxlY3Rpb24ubGVhZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoY29tbWFuZC5zY3JvbGxJbnRvVmlldyA9PSBcImFuaW1hdGVcIilcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nKHRoaXMuY3VyT3Auc2Nyb2xsVG9wKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wcmV2T3AgPSB0aGlzLmN1ck9wO1xuICAgICAgICAgICAgdGhpcy5jdXJPcCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkaGlzdG9yeVRyYWNrZXIoZTogeyBjb21tYW5kOyBhcmdzIH0pIHtcbiAgICAgICAgaWYgKCF0aGlzLiRtZXJnZVVuZG9EZWx0YXMpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHByZXYgPSB0aGlzLnByZXZPcDtcbiAgICAgICAgdmFyIG1lcmdlYWJsZUNvbW1hbmRzID0gdGhpcy4kbWVyZ2VhYmxlQ29tbWFuZHM7XG4gICAgICAgIC8vIHByZXZpb3VzIGNvbW1hbmQgd2FzIHRoZSBzYW1lXG4gICAgICAgIHZhciBzaG91bGRNZXJnZSA9IHByZXYuY29tbWFuZCAmJiAoZS5jb21tYW5kLm5hbWUgPT0gcHJldi5jb21tYW5kLm5hbWUpO1xuICAgICAgICBpZiAoZS5jb21tYW5kLm5hbWUgPT0gXCJpbnNlcnRzdHJpbmdcIikge1xuICAgICAgICAgICAgdmFyIHRleHQgPSBlLmFyZ3M7XG4gICAgICAgICAgICBpZiAodGhpcy5tZXJnZU5leHRDb21tYW5kID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgdGhpcy5tZXJnZU5leHRDb21tYW5kID0gdHJ1ZTtcblxuICAgICAgICAgICAgc2hvdWxkTWVyZ2UgPSBzaG91bGRNZXJnZVxuICAgICAgICAgICAgICAgICYmIHRoaXMubWVyZ2VOZXh0Q29tbWFuZCAvLyBwcmV2aW91cyBjb21tYW5kIGFsbG93cyB0byBjb2FsZXNjZSB3aXRoXG4gICAgICAgICAgICAgICAgJiYgKCEvXFxzLy50ZXN0KHRleHQpIHx8IC9cXHMvLnRlc3QocHJldi5hcmdzKSk7IC8vIHByZXZpb3VzIGluc2VydGlvbiB3YXMgb2Ygc2FtZSB0eXBlXG5cbiAgICAgICAgICAgIHRoaXMubWVyZ2VOZXh0Q29tbWFuZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IHNob3VsZE1lcmdlXG4gICAgICAgICAgICAgICAgJiYgbWVyZ2VhYmxlQ29tbWFuZHMuaW5kZXhPZihlLmNvbW1hbmQubmFtZSkgIT09IC0xOyAvLyB0aGUgY29tbWFuZCBpcyBtZXJnZWFibGVcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIHRoaXMuJG1lcmdlVW5kb0RlbHRhcyAhPSBcImFsd2F5c1wiXG4gICAgICAgICAgICAmJiBEYXRlLm5vdygpIC0gdGhpcy5zZXF1ZW5jZVN0YXJ0VGltZSA+IDIwMDBcbiAgICAgICAgKSB7XG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IGZhbHNlOyAvLyB0aGUgc2VxdWVuY2UgaXMgdG9vIGxvbmdcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzaG91bGRNZXJnZSlcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5tZXJnZVVuZG9EZWx0YXMgPSB0cnVlO1xuICAgICAgICBlbHNlIGlmIChtZXJnZWFibGVDb21tYW5kcy5pbmRleE9mKGUuY29tbWFuZC5uYW1lKSAhPT0gLTEpXG4gICAgICAgICAgICB0aGlzLnNlcXVlbmNlU3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IGtleSBoYW5kbGVyLCBzdWNoIGFzIFwidmltXCIgb3IgXCJ3aW5kb3dzXCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEtleWJvYXJkSGFuZGxlclxuICAgICAqIEBwYXJhbSBrZXlib2FyZEhhbmRsZXIge3N0cmluZyB8IEhhc2hIYW5kbGVyfSBUaGUgbmV3IGtleSBoYW5kbGVyLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0S2V5Ym9hcmRIYW5kbGVyKGtleWJvYXJkSGFuZGxlcjogc3RyaW5nIHwgSGFzaEhhbmRsZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKCFrZXlib2FyZEhhbmRsZXIpIHtcbiAgICAgICAgICAgIHRoaXMua2V5QmluZGluZy5zZXRLZXlib2FyZEhhbmRsZXIobnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIGtleWJvYXJkSGFuZGxlciA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICAgICAgdGhpcy4ka2V5YmluZGluZ0lkID0ga2V5Ym9hcmRIYW5kbGVyO1xuICAgICAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgICAgIGxvYWRNb2R1bGUoW1wia2V5YmluZGluZ1wiLCBrZXlib2FyZEhhbmRsZXJdLCBmdW5jdGlvbihtb2R1bGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoX3NlbGYuJGtleWJpbmRpbmdJZCA9PSBrZXlib2FyZEhhbmRsZXIpXG4gICAgICAgICAgICAgICAgICAgIF9zZWxmLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKG1vZHVsZSAmJiBtb2R1bGUuaGFuZGxlcik7XG4gICAgICAgICAgICB9LCB0aGlzLmNvbnRhaW5lci5vd25lckRvY3VtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGtleWJpbmRpbmdJZCA9IG51bGw7XG4gICAgICAgICAgICB0aGlzLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKGtleWJvYXJkSGFuZGxlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBrZXlib2FyZCBoYW5kbGVyLCBzdWNoIGFzIFwidmltXCIgb3IgXCJ3aW5kb3dzXCIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEtleWJvYXJkSGFuZGxlclxuICAgICAqIEByZXR1cm4ge0hhc2hIYW5kbGVyfVxuICAgICAqL1xuICAgIGdldEtleWJvYXJkSGFuZGxlcigpOiBIYXNoSGFuZGxlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmtleUJpbmRpbmcuZ2V0S2V5Ym9hcmRIYW5kbGVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyBFZGl0U2Vzc2lvbiB0byB1c2UuXG4gICAgICogVGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTZXNzaW9uJ2AgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNlc3Npb25cbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259IFRoZSBuZXcgc2Vzc2lvbiB0byB1c2UuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRTZXNzaW9uKHNlc3Npb246IEVkaXRTZXNzaW9uKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24gPT09IHNlc3Npb24pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvbGRTZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICBpZiAob2xkU2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVwiLCB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlTW9kZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwidG9rZW5pemVyVXBkYXRlXCIsIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VUYWJTaXplXCIsIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlV3JhcExpbWl0XCIsIHRoaXMuJG9uQ2hhbmdlV3JhcExpbWl0KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VXcmFwTW9kZVwiLCB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJvbkNoYW5nZUZvbGRcIiwgdGhpcy4kb25DaGFuZ2VGb2xkKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VGcm9udE1hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VCYWNrTWFya2VyXCIsIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlcik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZUFubm90YXRpb25cIiwgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VPdmVyd3JpdGVcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVNjcm9sbFRvcFwiLCB0aGlzLiRvblNjcm9sbFRvcENoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCB0aGlzLiRvblNjcm9sbExlZnRDaGFuZ2UpO1xuXG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgICAgICAgICAgc2VsZWN0aW9uLm9mZihcImNoYW5nZUN1cnNvclwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG4gICAgICAgICAgICBzZWxlY3Rpb24ub2ZmKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIGlmIChzZXNzaW9uKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlID0gdGhpcy5vbkRvY3VtZW50Q2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlXCIsIHRoaXMuJG9uRG9jdW1lbnRDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUgPSB0aGlzLm9uQ2hhbmdlTW9kZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZU1vZGVcIiwgdGhpcy4kb25DaGFuZ2VNb2RlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25Ub2tlbml6ZXJVcGRhdGUgPSB0aGlzLm9uVG9rZW5pemVyVXBkYXRlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwidG9rZW5pemVyVXBkYXRlXCIsIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VUYWJTaXplID0gdGhpcy5yZW5kZXJlci5vbkNoYW5nZVRhYlNpemUuYmluZCh0aGlzLnJlbmRlcmVyKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VUYWJTaXplXCIsIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlV3JhcExpbWl0ID0gdGhpcy5vbkNoYW5nZVdyYXBMaW1pdC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZVdyYXBMaW1pdFwiLCB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlV3JhcE1vZGUgPSB0aGlzLm9uQ2hhbmdlV3JhcE1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VXcmFwTW9kZVwiLCB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VGb2xkID0gdGhpcy5vbkNoYW5nZUZvbGQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VGb2xkXCIsIHRoaXMuJG9uQ2hhbmdlRm9sZCk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlRnJvbnRNYXJrZXIgPSB0aGlzLm9uQ2hhbmdlRnJvbnRNYXJrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VGcm9udE1hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VCYWNrTWFya2VyID0gdGhpcy5vbkNoYW5nZUJhY2tNYXJrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VCYWNrTWFya2VyXCIsIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlcik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlQnJlYWtwb2ludCA9IHRoaXMub25DaGFuZ2VCcmVha3BvaW50LmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUFubm90YXRpb24gPSB0aGlzLm9uQ2hhbmdlQW5ub3RhdGlvbi5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZUFubm90YXRpb25cIiwgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DdXJzb3JDaGFuZ2UgPSB0aGlzLm9uQ3Vyc29yQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlT3ZlcndyaXRlXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TY3JvbGxUb3BDaGFuZ2UgPSB0aGlzLm9uU2Nyb2xsVG9wQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHRoaXMuJG9uU2Nyb2xsVG9wQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TY3JvbGxMZWZ0Q2hhbmdlID0gdGhpcy5vblNjcm9sbExlZnRDaGFuZ2UuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHRoaXMuJG9uU2Nyb2xsTGVmdENoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uID0gc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm9uKFwiY2hhbmdlQ3Vyc29yXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UgPSB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5vbihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvblNlbGVjdGlvbkNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VNb2RlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgICAgICB0aGlzLm9uQ3Vyc29yQ2hhbmdlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgICAgIHRoaXMub25TY3JvbGxUb3BDaGFuZ2Uodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgdGhpcy5vblNjcm9sbExlZnRDaGFuZ2Uodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuXG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKHZvaWQgMCwgdGhpcy5zZWxlY3Rpb24pO1xuXG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlRnJvbnRNYXJrZXIodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUJhY2tNYXJrZXIodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUJyZWFrcG9pbnQodm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUFubm90YXRpb24odm9pZCAwLCB0aGlzLnNlc3Npb24pO1xuICAgICAgICAgICAgc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMucmVuZGVyZXIuYWRqdXN0V3JhcExpbWl0KCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVNlc3Npb25cIiwge1xuICAgICAgICAgICAgc2Vzc2lvbjogc2Vzc2lvbixcbiAgICAgICAgICAgIG9sZFNlc3Npb246IG9sZFNlc3Npb25cbiAgICAgICAgfSk7XG5cbiAgICAgICAgb2xkU2Vzc2lvbiAmJiBvbGRTZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VFZGl0b3JcIiwgeyBvbGRFZGl0b3I6IHRoaXMgfSk7XG4gICAgICAgIHNlc3Npb24gJiYgc2Vzc2lvbi5fc2lnbmFsKFwiY2hhbmdlRWRpdG9yXCIsIHsgZWRpdG9yOiB0aGlzIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgc2Vzc2lvbiBiZWluZyB1c2VkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTZXNzaW9uXG4gICAgICogQHJldHVybiB7RWRpdFNlc3Npb259XG4gICAgICovXG4gICAgZ2V0U2Vzc2lvbigpOiBFZGl0U2Vzc2lvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY3VycmVudCBkb2N1bWVudCB0byBgdGV4dGAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFZhbHVlXG4gICAgICogQHBhcmFtIHRleHQge3N0cmluZ30gVGhlIG5ldyB2YWx1ZSB0byBzZXQgZm9yIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSBbY3Vyc29yUG9zXSB7bnVtYmVyfSBXaGVyZSB0byBzZXQgdGhlIG5ldyB2YWx1ZS5gdW5kZWZpbmVkYCBvciAwIGlzIHNlbGVjdEFsbCwgLTEgaXMgYXQgdGhlIGRvY3VtZW50IHN0YXJ0LCBhbmQgKzEgaXMgYXQgdGhlIGVuZFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0VmFsdWUodGV4dDogc3RyaW5nLCBjdXJzb3JQb3M/OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgLy8gRklYTUU6IFRoaXMgbGFja3Mgc3ltbWV0cnkgd2l0aCBnZXRWYWx1ZSgpLlxuICAgICAgICB0aGlzLnNlc3Npb24uZG9jLnNldFZhbHVlKHRleHQpO1xuICAgICAgICAvLyB0aGlzLnNlc3Npb24uc2V0VmFsdWUodGV4dCk7XG5cbiAgICAgICAgaWYgKCFjdXJzb3JQb3MpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0QWxsKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY3Vyc29yUG9zID09ICsxKSB7XG4gICAgICAgICAgICB0aGlzLm5hdmlnYXRlRmlsZUVuZCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGN1cnNvclBvcyA9PSAtMSkge1xuICAgICAgICAgICAgdGhpcy5uYXZpZ2F0ZUZpbGVTdGFydCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZXNzaW9uJ3MgY29udGVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VmFsdWVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICoqL1xuICAgIGdldFZhbHVlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnRseSBoaWdobGlnaHRlZCBzZWxlY3Rpb24uXG4gICAgICogQHJldHVybiB7U3RyaW5nfSBUaGUgaGlnaGxpZ2h0ZWQgc2VsZWN0aW9uXG4gICAgICoqL1xuICAgIGdldFNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Rpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCByZXNpemVcbiAgICAgKiBAcGFyYW0gW2ZvcmNlXSB7Ym9vbGVhbn0gZm9yY2UgSWYgYHRydWVgLCByZWNvbXB1dGVzIHRoZSBzaXplLCBldmVuIGlmIHRoZSBoZWlnaHQgYW5kIHdpZHRoIGhhdmVuJ3QgY2hhbmdlZC5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHJlc2l6ZShmb3JjZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5vblJlc2l6ZShmb3JjZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuZ2V0VGhlbWV9XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9IFRoZSBzZXQgdGhlbWVcbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuZ2V0VGhlbWVcbiAgICAgKiovXG4gICAgZ2V0VGhlbWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0VGhlbWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZX1cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3R5bGUgQSBjbGFzcyBuYW1lXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGVcbiAgICAgKiovXG4gICAgc2V0U3R5bGUoc3R5bGU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFN0eWxlKHN0eWxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlfVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlXG4gICAgICoqL1xuICAgIHVuc2V0U3R5bGUoc3R5bGU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVuc2V0U3R5bGUoc3R5bGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIGN1cnJlbnQgZm9udCBzaXplIG9mIHRoZSBlZGl0b3IgdGV4dC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0Rm9udFNpemVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0Rm9udFNpemUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZm9udFNpemVcIikgfHwgY29tcHV0ZWRTdHlsZSh0aGlzLmNvbnRhaW5lciwgXCJmb250U2l6ZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYSBuZXcgZm9udCBzaXplIChpbiBwaXhlbHMpIGZvciB0aGUgZWRpdG9yIHRleHQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEZvbnRTaXplXG4gICAgICogQHBhcmFtIGZvbnRTaXplIHtzdHJpbmd9IEEgZm9udCBzaXplLCBlLmcuIFwiMTJweFwiKVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0Rm9udFNpemUoZm9udFNpemU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZvbnRTaXplXCIsIGZvbnRTaXplKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRoaWdobGlnaHRCcmFja2V0cygpIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZU1hcmtlcih0aGlzLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0ID0gdm9pZCAwO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJGhpZ2hsaWdodFBlbmRpbmcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHBlcmZvcm0gaGlnaGxpZ2h0IGFzeW5jIHRvIG5vdCBibG9jayB0aGUgYnJvd3NlciBkdXJpbmcgbmF2aWdhdGlvblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodFBlbmRpbmcgPSB0cnVlO1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi4kaGlnaGxpZ2h0UGVuZGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICB2YXIgcG9zID0gc2VsZi5zZXNzaW9uLmZpbmRNYXRjaGluZ0JyYWNrZXQoc2VsZi5nZXRDdXJzb3JQb3NpdGlvbigpKTtcbiAgICAgICAgICAgIGlmIChwb3MpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zLnJvdywgcG9zLmNvbHVtbiwgcG9zLnJvdywgcG9zLmNvbHVtbiArIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2VsZi5zZXNzaW9uLiRtb2RlICYmIHNlbGYuc2Vzc2lvbi4kbW9kZS5nZXRNYXRjaGluZykge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxmLnNlc3Npb24uJG1vZGUuZ2V0TWF0Y2hpbmcoc2VsZi5zZXNzaW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgICAgIHNlbGYuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCA9IHNlbGYuc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2JyYWNrZXRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCA1MCk7XG4gICAgfVxuXG4gICAgLy8gdG9kbzogbW92ZSB0byBtb2RlLmdldE1hdGNoaW5nXG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0VGFncygpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgaWYgKHRoaXMuJGhpZ2hsaWdodFRhZ1BlbmRpbmcpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHBlcmZvcm0gaGlnaGxpZ2h0IGFzeW5jIHRvIG5vdCBibG9jayB0aGUgYnJvd3NlciBkdXJpbmcgbmF2aWdhdGlvblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodFRhZ1BlbmRpbmcgPSB0cnVlO1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi4kaGlnaGxpZ2h0VGFnUGVuZGluZyA9IGZhbHNlO1xuXG4gICAgICAgICAgICB2YXIgcG9zID0gc2VsZi5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3Ioc2VsZi5zZXNzaW9uLCBwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgICAgIHZhciB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuXG4gICAgICAgICAgICBpZiAoIXRva2VuIHx8IHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiR0YWdIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uJHRhZ0hpZ2hsaWdodCA9IG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdGFnID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICB2YXIgZGVwdGggPSAwO1xuICAgICAgICAgICAgdmFyIHByZXZUb2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuXG4gICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09ICc8Jykge1xuICAgICAgICAgICAgICAgIC8vZmluZCBjbG9zaW5nIHRhZ1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgcHJldlRva2VuID0gdG9rZW47XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiBkZXB0aCA+PSAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vZmluZCBvcGVuaW5nIHRhZ1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBwcmV2VG9rZW47XG4gICAgICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi52YWx1ZSA9PT0gdGFnICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoKys7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoLS07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IHdoaWxlIChwcmV2VG9rZW4gJiYgZGVwdGggPD0gMCk7XG5cbiAgICAgICAgICAgICAgICAvL3NlbGVjdCB0YWcgYWdhaW5cbiAgICAgICAgICAgICAgICBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXRva2VuKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgICAgICAgdmFyIGNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpO1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKHJvdywgY29sdW1uLCByb3csIGNvbHVtbiArIHRva2VuLnZhbHVlLmxlbmd0aCk7XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSByYW5nZSBpZiBkaWZmZXJlbnRcbiAgICAgICAgICAgIGlmIChzZXNzaW9uLiR0YWdIaWdobGlnaHQgJiYgcmFuZ2UuY29tcGFyZVJhbmdlKHNlc3Npb24uJGJhY2tNYXJrZXJzW3Nlc3Npb24uJHRhZ0hpZ2hsaWdodF0ucmFuZ2UpICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmFuZ2UgJiYgIXNlc3Npb24uJHRhZ0hpZ2hsaWdodClcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2VfYnJhY2tldFwiLCBcInRleHRcIik7XG4gICAgICAgIH0sIDUwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBCcmluZ3MgdGhlIGN1cnJlbnQgYHRleHRJbnB1dGAgaW50byBmb2N1cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZm9jdXNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGZvY3VzKCk6IHZvaWQge1xuICAgICAgICAvLyBTYWZhcmkgbmVlZHMgdGhlIHRpbWVvdXRcbiAgICAgICAgLy8gaU9TIGFuZCBGaXJlZm94IG5lZWQgaXQgY2FsbGVkIGltbWVkaWF0ZWx5XG4gICAgICAgIC8vIHRvIGJlIG9uIHRoZSBzYXZlIHNpZGUgd2UgZG8gYm90aFxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgX3NlbGYudGV4dElucHV0LmZvY3VzKCk7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnRleHRJbnB1dC5mb2N1cygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBjdXJyZW50IGB0ZXh0SW5wdXRgIGlzIGluIGZvY3VzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpc0ZvY3VzZWRcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIGlzRm9jdXNlZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudGV4dElucHV0LmlzRm9jdXNlZCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGB0ZXh0SW5wdXRgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBibHVyXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBibHVyKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnRleHRJbnB1dC5ibHVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCBvbmNlIHRoZSBlZGl0b3IgY29tZXMgaW50byBmb2N1cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgb25Gb2N1c1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb25Gb2N1cygpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJGlzRm9jdXNlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGlzRm9jdXNlZCA9IHRydWU7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hvd0N1cnNvcigpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnZpc3VhbGl6ZUZvY3VzKCk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgZm9jdXNcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJmb2N1c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIG9uY2UgdGhlIGVkaXRvciBoYXMgYmVlbiBibHVycmVkLlxuICAgICAqIEBtZXRob2Qgb25CbHVyXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvbkJsdXIoKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy4kaXNGb2N1c2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaXNGb2N1c2VkID0gZmFsc2U7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuaGlkZUN1cnNvcigpO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnZpc3VhbGl6ZUJsdXIoKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBibHVyXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiYmx1clwiKTtcbiAgICB9XG5cbiAgICAkY3Vyc29yQ2hhbmdlKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbmV2ZXIgdGhlIGRvY3VtZW50IGlzIGNoYW5nZWQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIG9uRG9jdW1lbnRDaGFuZ2VcbiAgICAgKiBAcGFyYW0gZXZlbnQge0RlbHRhRXZlbnR9IENvbnRhaW5zIGEgc2luZ2xlIHByb3BlcnR5LCBgZGF0YWAsIHdoaWNoIGhhcyB0aGUgZGVsdGEgb2YgY2hhbmdlc1xuICAgICAqIEBwYXJhbSBzZXNzaW9uIHtFZGl0U2Vzc2lvbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBvbkRvY3VtZW50Q2hhbmdlKGV2ZW50OiBEZWx0YUV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICB2YXIgZGVsdGE6IERlbHRhID0gZXZlbnQuZGF0YTtcbiAgICAgICAgdmFyIHJhbmdlID0gZGVsdGEucmFuZ2U7XG4gICAgICAgIHZhciBsYXN0Um93OiBudW1iZXI7XG5cbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA9PT0gcmFuZ2UuZW5kLnJvdyAmJiBkZWx0YS5hY3Rpb24gIT09IFwiaW5zZXJ0TGluZXNcIiAmJiBkZWx0YS5hY3Rpb24gIT09IFwicmVtb3ZlTGluZXNcIikge1xuICAgICAgICAgICAgbGFzdFJvdyA9IHJhbmdlLmVuZC5yb3c7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsYXN0Um93ID0gSW5maW5pdHk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmVuZGVyZXI6IFZpcnR1YWxSZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG4gICAgICAgIHJlbmRlcmVyLnVwZGF0ZUxpbmVzKHJhbmdlLnN0YXJ0LnJvdywgbGFzdFJvdywgc2Vzc2lvbi4kdXNlV3JhcE1vZGUpO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhbmdlXG4gICAgICAgICAqIEBwYXJhbSBldmVudCB7RGVsdGFFdmVudH1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVwiLCBldmVudCk7XG5cbiAgICAgICAgLy8gdXBkYXRlIGN1cnNvciBiZWNhdXNlIHRhYiBjaGFyYWN0ZXJzIGNhbiBpbmZsdWVuY2UgdGhlIGN1cnNvciBwb3NpdGlvblxuICAgICAgICB0aGlzLiRjdXJzb3JDaGFuZ2UoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25Ub2tlbml6ZXJVcGRhdGUoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHZhciByb3dzID0gZXZlbnQuZGF0YTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVMaW5lcyhyb3dzLmZpcnN0LCByb3dzLmxhc3QpO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBvblNjcm9sbFRvcENoYW5nZShldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb1koc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvblNjcm9sbExlZnRDaGFuZ2UoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9YKHNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBIYW5kbGVyIGZvciBjdXJzb3Igb3Igc2VsZWN0aW9uIGNoYW5nZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBvbkN1cnNvckNoYW5nZShldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy4kY3Vyc29yQ2hhbmdlKCk7XG5cbiAgICAgICAgaWYgKCF0aGlzLiRibG9ja1Njcm9sbGluZykge1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0QnJhY2tldHMoKTtcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0VGFncygpO1xuICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIC8vIFRPRE87IEhvdyBpcyBzaWduYWwgZGlmZmVyZW50IGZyb20gZW1pdD9cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VTZWxlY3Rpb25cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICB9XG5cbiAgICBwdWJsaWMgJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKSB7XG5cbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG5cbiAgICAgICAgdmFyIGhpZ2hsaWdodDtcbiAgICAgICAgaWYgKHRoaXMuJGhpZ2hsaWdodEFjdGl2ZUxpbmUpIHtcbiAgICAgICAgICAgIGlmICgodGhpcy4kc2VsZWN0aW9uU3R5bGUgIT0gXCJsaW5lXCIgfHwgIXRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkpKSB7XG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0ID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlbmRlcmVyLiRtYXhMaW5lcyAmJiBzZXNzaW9uLmdldExlbmd0aCgpID09PSAxICYmICEocmVuZGVyZXIuJG1pbkxpbmVzID4gMSkpIHtcbiAgICAgICAgICAgICAgICBoaWdobGlnaHQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyICYmICFoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIubWFya2VySWQpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgJiYgaGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlID0gbmV3IFJhbmdlKGhpZ2hsaWdodC5yb3csIGhpZ2hsaWdodC5jb2x1bW4sIGhpZ2hsaWdodC5yb3csIEluZmluaXR5KTtcbiAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2FjdGl2ZS1saW5lXCIsIFwic2NyZWVuTGluZVwiKTtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgPSByYW5nZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuc3RhcnQucm93ID0gaGlnaGxpZ2h0LnJvdztcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuZW5kLnJvdyA9IGhpZ2hsaWdodC5yb3c7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLnN0YXJ0LmNvbHVtbiA9IGhpZ2hsaWdodC5jb2x1bW47XG4gICAgICAgICAgICBzZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhpcyB2ZXJzaW9uIGhhcyBub3QgYmVlbiBib3VuZCB0byBgdGhpc2AsIHNvIGRvbid0IHVzZSBpdCBkaXJlY3RseS5cbiAgICBwcml2YXRlIG9uU2VsZWN0aW9uQ2hhbmdlKGV2ZW50LCBzZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICBpZiAodHlwZW9mIHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlcik7XG4gICAgICAgICAgICBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLmdldFNlbGVjdGlvblN0eWxlKCk7XG4gICAgICAgICAgICBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2Vfc2VsZWN0aW9uXCIsIHN0eWxlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZSA9IHRoaXMuJGhpZ2hsaWdodFNlbGVjdGVkV29yZCAmJiB0aGlzLiRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmhpZ2hsaWdodChyZSk7XG5cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgIH1cblxuICAgICRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAoKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpIHx8IHNlbGVjdGlvbi5pc011bHRpTGluZSgpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBzdGFydE91dGVyID0gc2VsZWN0aW9uLnN0YXJ0LmNvbHVtbiAtIDE7XG4gICAgICAgIHZhciBlbmRPdXRlciA9IHNlbGVjdGlvbi5lbmQuY29sdW1uICsgMTtcbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoc2VsZWN0aW9uLnN0YXJ0LnJvdyk7XG4gICAgICAgIHZhciBsaW5lQ29scyA9IGxpbmUubGVuZ3RoO1xuICAgICAgICB2YXIgbmVlZGxlID0gbGluZS5zdWJzdHJpbmcoTWF0aC5tYXgoc3RhcnRPdXRlciwgMCksXG4gICAgICAgICAgICBNYXRoLm1pbihlbmRPdXRlciwgbGluZUNvbHMpKTtcblxuICAgICAgICAvLyBNYWtlIHN1cmUgdGhlIG91dGVyIGNoYXJhY3RlcnMgYXJlIG5vdCBwYXJ0IG9mIHRoZSB3b3JkLlxuICAgICAgICBpZiAoKHN0YXJ0T3V0ZXIgPj0gMCAmJiAvXltcXHdcXGRdLy50ZXN0KG5lZWRsZSkpIHx8XG4gICAgICAgICAgICAoZW5kT3V0ZXIgPD0gbGluZUNvbHMgJiYgL1tcXHdcXGRdJC8udGVzdChuZWVkbGUpKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBuZWVkbGUgPSBsaW5lLnN1YnN0cmluZyhzZWxlY3Rpb24uc3RhcnQuY29sdW1uLCBzZWxlY3Rpb24uZW5kLmNvbHVtbik7XG4gICAgICAgIGlmICghL15bXFx3XFxkXSskLy50ZXN0KG5lZWRsZSkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHJlID0gdGhpcy4kc2VhcmNoLiRhc3NlbWJsZVJlZ0V4cCh7XG4gICAgICAgICAgICB3aG9sZVdvcmQ6IHRydWUsXG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlOiB0cnVlLFxuICAgICAgICAgICAgbmVlZGxlOiBuZWVkbGVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25DaGFuZ2VGcm9udE1hcmtlclxuICAgICAqIEBwYXJhbSBldmVudFxuICAgICAqIEBwYXJhbSBzZXNzaW9uIHtFZGl0U2Vzc2lvbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBvbkNoYW5nZUZyb250TWFya2VyKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICB0aGlzLnVwZGF0ZUZyb250TWFya2VycygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdXBkYXRlRnJvbnRNYXJrZXJzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgdXBkYXRlRnJvbnRNYXJrZXJzKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZyb250TWFya2VycygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25DaGFuZ2VCYWNrTWFya2VyXG4gICAgICogQHBhcmFtIGV2ZW50XG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIG9uQ2hhbmdlQmFja01hcmtlcihldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCYWNrTWFya2VycygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdXBkYXRlQmFja01hcmtlcnNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyB1cGRhdGVCYWNrTWFya2VycygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCYWNrTWFya2VycygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VCcmVha3BvaW50KGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCcmVha3BvaW50cygpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUJyZWFrcG9pbnRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VCcmVha3BvaW50XCIsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlQW5ub3RhdGlvbihldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRBbm5vdGF0aW9ucyhzZXNzaW9uLmdldEFubm90YXRpb25zKCkpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUFubm90YXRpb25cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIGV2ZW50KTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgb25DaGFuZ2VNb2RlKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZVRleHQoKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VNb2RlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlTW9kZVwiLCBldmVudCk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlV3JhcExpbWl0KGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlV3JhcE1vZGUoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIub25SZXNpemUodHJ1ZSk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlRm9sZChldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBhY3RpdmUgbGluZSBtYXJrZXIgYXMgZHVlIHRvIGZvbGRpbmcgY2hhbmdlcyB0aGUgY3VycmVudFxuICAgICAgICAvLyBsaW5lIHJhbmdlIG9uIHRoZSBzY3JlZW4gbWlnaHQgaGF2ZSBjaGFuZ2VkLlxuICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIC8vIFRPRE86IFRoaXMgbWlnaHQgYmUgdG9vIG11Y2ggdXBkYXRpbmcuIE9rYXkgZm9yIG5vdy5cbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGdWxsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIG9mIHRleHQgY3VycmVudGx5IGhpZ2hsaWdodGVkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTZWxlY3RlZFRleHRcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0U2VsZWN0ZWRUZXh0KCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgY29waWVkLlxuICAgICAqIEBldmVudCBjb3B5XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIGNvcGllZCB0ZXh0XG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIG9mIHRleHQgY3VycmVudGx5IGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICAgKiBAZGVwcmVjYXRlZCBVc2UgZ2V0U2VsZWN0ZWRUZXh0IGluc3RlYWQuXG4gICAgICoqL1xuICAgIGdldENvcHlUZXh0KCkge1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0U2VsZWN0ZWRUZXh0KCk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY29weVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY29weVwiLCB0ZXh0KTtcbiAgICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImNvcHlcIiBoYXBwZW5zLlxuICAgICAqKi9cbiAgICBvbkNvcHkoKSB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhcImNvcHlcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImN1dFwiIGhhcHBlbnMuXG4gICAgICoqL1xuICAgIG9uQ3V0KCkge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoXCJjdXRcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgcGFzdGVkLlxuICAgICAqIEBldmVudCBwYXN0ZVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBwYXN0ZWQgdGV4dFxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcInBhc3RlXCIgaGFwcGVucy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgcGFzdGVkIHRleHRcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uUGFzdGUodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIC8vIHRvZG8gdGhpcyBzaG91bGQgY2hhbmdlIHdoZW4gcGFzdGUgYmVjb21lcyBhIGNvbW1hbmRcbiAgICAgICAgaWYgKHRoaXMuJHJlYWRPbmx5KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgZSA9IHsgdGV4dDogdGV4dCB9O1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IHBhc3RlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJwYXN0ZVwiLCBlKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoZS50ZXh0LCB0cnVlKTtcbiAgICB9XG5cblxuICAgIGV4ZWNDb21tYW5kKGNvbW1hbmQsIGFyZ3M/KTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhjb21tYW5kLCB0aGlzLCBhcmdzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGB0ZXh0YCBpbnRvIHdoZXJldmVyIHRoZSBjdXJzb3IgaXMgcG9pbnRpbmcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGluc2VydFxuICAgICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IFRoZSBuZXcgdGV4dCB0byBhZGQuXG4gICAgICogQHBhcmFtIFtwYXN0ZWRdIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgaW5zZXJ0KHRleHQ6IHN0cmluZywgcGFzdGVkOiBib29sZWFuKTogdm9pZCB7XG5cbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciBtb2RlID0gc2Vzc2lvbi5nZXRNb2RlKCk7XG4gICAgICAgIHZhciBjdXJzb3I6IFBvc2l0aW9uID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgdHJhbnNmb3JtOiBUZXh0QW5kU2VsZWN0aW9uO1xuXG4gICAgICAgIGlmICh0aGlzLmdldEJlaGF2aW91cnNFbmFibGVkKCkgJiYgIXBhc3RlZCkge1xuICAgICAgICAgICAgLy8gR2V0IGEgdHJhbnNmb3JtIGlmIHRoZSBjdXJyZW50IG1vZGUgd2FudHMgb25lLlxuICAgICAgICAgICAgdHJhbnNmb3JtID0gbW9kZSAmJiA8VGV4dEFuZFNlbGVjdGlvbj5tb2RlLnRyYW5zZm9ybUFjdGlvbihzZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpLCAnaW5zZXJ0aW9uJywgdGhpcywgc2Vzc2lvbiwgdGV4dCk7XG4gICAgICAgICAgICBpZiAodHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRleHQgIT09IHRyYW5zZm9ybS50ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5tZXJnZVVuZG9EZWx0YXMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kbWVyZ2VOZXh0Q29tbWFuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0ZXh0ID0gdHJhbnNmb3JtLnRleHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGV4dCA9PT0gXCJcXHRcIikge1xuICAgICAgICAgICAgdGV4dCA9IHRoaXMuc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlbW92ZSBzZWxlY3RlZCB0ZXh0LlxuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICAgICAgY3Vyc29yID0gdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5zZXNzaW9uLmdldE92ZXJ3cml0ZSgpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGN1cnNvciwgY3Vyc29yKTtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gKz0gdGV4dC5sZW5ndGg7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0ZXh0ID09PSBcIlxcblwiIHx8IHRleHQgPT09IFwiXFxyXFxuXCIpIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICAgICAgaWYgKGN1cnNvci5jb2x1bW4gPiBsaW5lLnNlYXJjaCgvXFxTfCQvKSkge1xuICAgICAgICAgICAgICAgIHZhciBkID0gbGluZS5zdWJzdHIoY3Vyc29yLmNvbHVtbikuc2VhcmNoKC9cXFN8JC8pO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uZG9jLnJlbW92ZUluTGluZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uLCBjdXJzb3IuY29sdW1uICsgZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG5cbiAgICAgICAgdmFyIHN0YXJ0ID0gY3Vyc29yLmNvbHVtbjtcbiAgICAgICAgdmFyIGxpbmVTdGF0ZSA9IHNlc3Npb24uZ2V0U3RhdGUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgc2hvdWxkT3V0ZGVudCA9IG1vZGUuY2hlY2tPdXRkZW50KGxpbmVTdGF0ZSwgbGluZSwgdGV4dCk7XG4gICAgICAgIHZhciBlbmQgPSBzZXNzaW9uLmluc2VydChjdXJzb3IsIHRleHQpO1xuXG4gICAgICAgIGlmICh0cmFuc2Zvcm0gJiYgdHJhbnNmb3JtLnNlbGVjdGlvbikge1xuICAgICAgICAgICAgaWYgKHRyYW5zZm9ybS5zZWxlY3Rpb24ubGVuZ3RoID09PSAyKSB7IC8vIFRyYW5zZm9ybSByZWxhdGl2ZSB0byB0aGUgY3VycmVudCBjb2x1bW5cbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShcbiAgICAgICAgICAgICAgICAgICAgbmV3IFJhbmdlKGN1cnNvci5yb3csIHN0YXJ0ICsgdHJhbnNmb3JtLnNlbGVjdGlvblswXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnNvci5yb3csIHN0YXJ0ICsgdHJhbnNmb3JtLnNlbGVjdGlvblsxXSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7IC8vIFRyYW5zZm9ybSByZWxhdGl2ZSB0byB0aGUgY3VycmVudCByb3cuXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBSYW5nZShjdXJzb3Iucm93ICsgdHJhbnNmb3JtLnNlbGVjdGlvblswXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybS5zZWxlY3Rpb25bMV0sXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJzb3Iucm93ICsgdHJhbnNmb3JtLnNlbGVjdGlvblsyXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyYW5zZm9ybS5zZWxlY3Rpb25bM10pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZXNzaW9uLmdldERvY3VtZW50KCkuaXNOZXdMaW5lKHRleHQpKSB7XG4gICAgICAgICAgICB2YXIgbGluZUluZGVudCA9IG1vZGUuZ2V0TmV4dExpbmVJbmRlbnQobGluZVN0YXRlLCBsaW5lLnNsaWNlKDAsIGN1cnNvci5jb2x1bW4pLCBzZXNzaW9uLmdldFRhYlN0cmluZygpKTtcbiAgICAgICAgICAgIHNlc3Npb24uaW5zZXJ0KHsgcm93OiBjdXJzb3Iucm93ICsgMSwgY29sdW1uOiAwIH0sIGxpbmVJbmRlbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZE91dGRlbnQpIHtcbiAgICAgICAgICAgIG1vZGUuYXV0b091dGRlbnQobGluZVN0YXRlLCBzZXNzaW9uLCBjdXJzb3Iucm93KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25cbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIGVkaXRvcikgPT4gYW55fVxuICAgICAqIEBwYXJhbSBbY2FwdHVyaW5nXSBib29sZWFuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvbihldmVudE5hbWU6IHN0cmluZywgY2FsbGJhY2s6IChkYXRhOiBhbnksIGVkaXRvcjogRWRpdG9yKSA9PiBhbnksIGNhcHR1cmluZz86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihldmVudE5hbWUsIGNhbGxiYWNrLCBjYXB0dXJpbmcpXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvZmZcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvZmYoZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZGF0YTogYW55LCBzb3VyY2U6IEVkaXRvcikgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub2ZmKGV2ZW50TmFtZSwgY2FsbGJhY2spXG4gICAgfVxuXG4gICAgc2V0RGVmYXVsdEhhbmRsZXIoZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZGF0YTogYW55LCBzb3VyY2U6IEVkaXRvcikgPT4gYW55KSB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMuc2V0RGVmYXVsdEhhbmRsZXIoZXZlbnROYW1lLCBjYWxsYmFjaylcbiAgICB9XG5cbiAgICBfZW1pdChldmVudE5hbWU6IHN0cmluZywgZXZlbnQ/OiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChldmVudE5hbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBfc2lnbmFsKGV2ZW50TmFtZTogc3RyaW5nLCBldmVudD86IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoZXZlbnROYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgaGFzTGlzdGVuZXJzKGV2ZW50TmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmV2ZW50QnVzLmhhc0xpc3RlbmVycyhldmVudE5hbWUpO1xuICAgIH1cblxuICAgIG9uVGV4dElucHV0KHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmtleUJpbmRpbmcub25UZXh0SW5wdXQodGV4dCk7XG4gICAgICAgIC8vIFRPRE86IFRoaXMgc2hvdWxkIGJlIHBsdWdnYWJsZS5cbiAgICAgICAgaWYgKHRleHQgPT09ICcuJykge1xuICAgICAgICAgICAgdGhpcy5jb21tYW5kcy5leGVjKENPTU1BTkRfTkFNRV9BVVRPX0NPTVBMRVRFKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLmdldFNlc3Npb24oKS5nZXREb2N1bWVudCgpLmlzTmV3TGluZSh0ZXh0KSkge1xuICAgICAgICAgICAgdmFyIGxpbmVOdW1iZXIgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgLy8gICAgICAgICAgICB2YXIgb3B0aW9uID0gbmV3IFNlcnZpY2VzLkVkaXRvck9wdGlvbnMoKTtcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgb3B0aW9uLk5ld0xpbmVDaGFyYWN0ZXIgPSBcIlxcblwiO1xuICAgICAgICAgICAgLy8gRklYTUU6IFNtYXJ0IEluZGVudGluZ1xuICAgICAgICAgICAgLypcbiAgICAgICAgICAgIHZhciBpbmRlbnQgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0U21hcnRJbmRlbnRBdExpbmVOdW1iZXIoY3VycmVudEZpbGVOYW1lLCBsaW5lTnVtYmVyLCBvcHRpb24pO1xuICAgICAgICAgICAgaWYoaW5kZW50ID4gMClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IuY29tbWFuZHMuZXhlYyhcImluc2VydHRleHRcIiwgZWRpdG9yLCB7dGV4dDpcIiBcIiwgdGltZXM6aW5kZW50fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAqL1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25Db21tYW5kS2V5KGUsIGhhc2hJZDogbnVtYmVyLCBrZXlDb2RlOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nLm9uQ29tbWFuZEtleShlLCBoYXNoSWQsIGtleUNvZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhc3MgaW4gYHRydWVgIHRvIGVuYWJsZSBvdmVyd3JpdGVzIGluIHlvdXIgc2Vzc2lvbiwgb3IgYGZhbHNlYCB0byBkaXNhYmxlLiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGVyIG9yIG5vdCB0byBzZXQgb3ZlcndyaXRlc1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgb3ZlcndyaXRlcyBhcmUgZW5hYmxlZDsgYGZhbHNlYCBvdGhlcndpc2UuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgZ2V0T3ZlcndyaXRlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldE92ZXJ3cml0ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHZhbHVlIG9mIG92ZXJ3cml0ZSB0byB0aGUgb3Bwb3NpdGUgb2Ygd2hhdGV2ZXIgaXQgY3VycmVudGx5IGlzLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnRvZ2dsZU92ZXJ3cml0ZVxuICAgICAqKi9cbiAgICB0b2dnbGVPdmVyd3JpdGUoKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGhvdyBmYXN0IHRoZSBtb3VzZSBzY3JvbGxpbmcgc2hvdWxkIGRvLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzcGVlZCBBIHZhbHVlIGluZGljYXRpbmcgdGhlIG5ldyBzcGVlZCAoaW4gbWlsbGlzZWNvbmRzKVxuICAgICAqKi9cbiAgICBzZXRTY3JvbGxTcGVlZChzcGVlZDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2Nyb2xsU3BlZWRcIiwgc3BlZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHZhbHVlIGluZGljYXRpbmcgaG93IGZhc3QgdGhlIG1vdXNlIHNjcm9sbCBzcGVlZCBpcyAoaW4gbWlsbGlzZWNvbmRzKS5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIGdldFNjcm9sbFNwZWVkKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNjcm9sbFNwZWVkXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGRlbGF5IChpbiBtaWxsaXNlY29uZHMpIG9mIHRoZSBtb3VzZSBkcmFnLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkcmFnRGVsYXkgQSB2YWx1ZSBpbmRpY2F0aW5nIHRoZSBuZXcgZGVsYXlcbiAgICAgKiovXG4gICAgc2V0RHJhZ0RlbGF5KGRyYWdEZWxheTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZHJhZ0RlbGF5XCIsIGRyYWdEZWxheSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBtb3VzZSBkcmFnIGRlbGF5LlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKiovXG4gICAgZ2V0RHJhZ0RlbGF5KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImRyYWdEZWxheVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW4gdGhlIHNlbGVjdGlvbiBzdHlsZSBjaGFuZ2VzLCB2aWEgW1tFZGl0b3Iuc2V0U2VsZWN0aW9uU3R5bGVdXS5cbiAgICAgKiBAZXZlbnQgY2hhbmdlU2VsZWN0aW9uU3R5bGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZGF0YSBDb250YWlucyBvbmUgcHJvcGVydHksIGBkYXRhYCwgd2hpY2ggaW5kaWNhdGVzIHRoZSBuZXcgc2VsZWN0aW9uIHN0eWxlXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIERyYXcgc2VsZWN0aW9uIG1hcmtlcnMgc3Bhbm5pbmcgd2hvbGUgbGluZSwgb3Igb25seSBvdmVyIHNlbGVjdGVkIHRleHQuIERlZmF1bHQgdmFsdWUgaXMgXCJsaW5lXCJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3R5bGUgVGhlIG5ldyBzZWxlY3Rpb24gc3R5bGUgXCJsaW5lXCJ8XCJ0ZXh0XCJcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRTZWxlY3Rpb25TdHlsZSh2YWw6IHN0cmluZykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNlbGVjdGlvblN0eWxlXCIsIHZhbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZWxlY3Rpb24gc3R5bGUuXG4gICAgICogQHJldHVybiB7U3RyaW5nfVxuICAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25TdHlsZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzZWxlY3Rpb25TdHlsZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoZSBjdXJyZW50IGxpbmUgc2hvdWxkIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkSGlnaGxpZ2h0IFNldCB0byBgdHJ1ZWAgdG8gaGlnaGxpZ2h0IHRoZSBjdXJyZW50IGxpbmVcbiAgICAgKiovXG4gICAgc2V0SGlnaGxpZ2h0QWN0aXZlTGluZShzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRBY3RpdmVMaW5lXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgY3VycmVudCBsaW5lcyBhcmUgYWx3YXlzIGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhpZ2hsaWdodEFjdGl2ZUxpbmUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEFjdGl2ZUxpbmVcIik7XG4gICAgfVxuXG4gICAgc2V0SGlnaGxpZ2h0R3V0dGVyTGluZShzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgd29yZCBzaG91bGQgYmUgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG91bGRIaWdobGlnaHQgU2V0IHRvIGB0cnVlYCB0byBoaWdobGlnaHQgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCB3b3JkXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkKHNob3VsZEhpZ2hsaWdodDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodFNlbGVjdGVkV29yZFwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGN1cnJlbnRseSBoaWdobGlnaHRlZCB3b3JkcyBhcmUgdG8gYmUgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkO1xuICAgIH1cblxuICAgIHNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRBbmltYXRlZFNjcm9sbChzaG91bGRBbmltYXRlKTtcbiAgICB9XG5cbiAgICBnZXRBbmltYXRlZFNjcm9sbCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0QW5pbWF0ZWRTY3JvbGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiBgc2hvd0ludmlzaWJsZXNgIGlzIHNldCB0byBgdHJ1ZWAsIGludmlzaWJsZSBjaGFyYWN0ZXJzJm1kYXNoO2xpa2Ugc3BhY2VzIG9yIG5ldyBsaW5lcyZtZGFzaDthcmUgc2hvdyBpbiB0aGUgZWRpdG9yLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd0ludmlzaWJsZXMgU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIHNob3cgaW52aXNpYmxlIGNoYXJhY3RlcnNcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlczogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBpbnZpc2libGUgY2hhcmFjdGVycyBhcmUgYmVpbmcgc2hvd24uXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0U2hvd0ludmlzaWJsZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNob3dJbnZpc2libGVzKCk7XG4gICAgfVxuXG4gICAgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzKTtcbiAgICB9XG5cbiAgICBnZXREaXNwbGF5SW5kZW50R3VpZGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXREaXNwbGF5SW5kZW50R3VpZGVzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHNob3dQcmludE1hcmdpbmAgaXMgc2V0IHRvIGB0cnVlYCwgdGhlIHByaW50IG1hcmdpbiBpcyBzaG93biBpbiB0aGUgZWRpdG9yLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd1ByaW50TWFyZ2luIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzaG93IHRoZSBwcmludCBtYXJnaW5cbiAgICAgKiovXG4gICAgc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbjogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbihzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBwcmludCBtYXJnaW4gaXMgYmVpbmcgc2hvd24uXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93UHJpbnRNYXJnaW4oKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNob3dQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGNvbHVtbiBkZWZpbmluZyB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIHNob3VsZCBiZS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2hvd1ByaW50TWFyZ2luIFNwZWNpZmllcyB0aGUgbmV3IHByaW50IG1hcmdpblxuICAgICAqL1xuICAgIHNldFByaW50TWFyZ2luQ29sdW1uKHNob3dQcmludE1hcmdpbjogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4oc2hvd1ByaW50TWFyZ2luKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjb2x1bW4gbnVtYmVyIG9mIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gaXMuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqL1xuICAgIGdldFByaW50TWFyZ2luQ29sdW1uKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFByaW50TWFyZ2luQ29sdW1uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHJlYWRPbmx5YCBpcyB0cnVlLCB0aGVuIHRoZSBlZGl0b3IgaXMgc2V0IHRvIHJlYWQtb25seSBtb2RlLCBhbmQgbm9uZSBvZiB0aGUgY29udGVudCBjYW4gY2hhbmdlLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gcmVhZE9ubHkgU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGVkaXRvciBjYW4gYmUgbW9kaWZpZWQgb3Igbm90XG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0UmVhZE9ubHkocmVhZE9ubHk6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJyZWFkT25seVwiLCByZWFkT25seSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGVkaXRvciBpcyBzZXQgdG8gcmVhZC1vbmx5IG1vZGUuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0UmVhZE9ubHkoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInJlYWRPbmx5XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwZWNpZmllcyB3aGV0aGVyIHRvIHVzZSBiZWhhdmlvcnMgb3Igbm90LiBbXCJCZWhhdmlvcnNcIiBpbiB0aGlzIGNhc2UgaXMgdGhlIGF1dG8tcGFpcmluZyBvZiBzcGVjaWFsIGNoYXJhY3RlcnMsIGxpa2UgcXVvdGF0aW9uIG1hcmtzLCBwYXJlbnRoZXNpcywgb3IgYnJhY2tldHMuXXs6ICNCZWhhdmlvcnNEZWZ9XG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkIEVuYWJsZXMgb3IgZGlzYWJsZXMgYmVoYXZpb3JzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0QmVoYXZpb3Vyc0VuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImJlaGF2aW91cnNFbmFibGVkXCIsIGVuYWJsZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBiZWhhdmlvcnMgYXJlIGN1cnJlbnRseSBlbmFibGVkLiB7OkJlaGF2aW9yc0RlZn1cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEJlaGF2aW91cnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJiZWhhdmlvdXJzRW5hYmxlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTcGVjaWZpZXMgd2hldGhlciB0byB1c2Ugd3JhcHBpbmcgYmVoYXZpb3JzIG9yIG5vdCwgaS5lLiBhdXRvbWF0aWNhbGx5IHdyYXBwaW5nIHRoZSBzZWxlY3Rpb24gd2l0aCBjaGFyYWN0ZXJzIHN1Y2ggYXMgYnJhY2tldHNcbiAgICAgKiB3aGVuIHN1Y2ggYSBjaGFyYWN0ZXIgaXMgdHlwZWQgaW4uXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkIEVuYWJsZXMgb3IgZGlzYWJsZXMgd3JhcHBpbmcgYmVoYXZpb3JzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0V3JhcEJlaGF2aW91cnNFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ3cmFwQmVoYXZpb3Vyc0VuYWJsZWRcIiwgZW5hYmxlZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHdyYXBwaW5nIGJlaGF2aW9ycyBhcmUgY3VycmVudGx5IGVuYWJsZWQuXG4gICAgICoqL1xuICAgIGdldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwid3JhcEJlaGF2aW91cnNFbmFibGVkXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyB3aGV0aGVyIHRoZSBmb2xkIHdpZGdldHMgc2hvdWxkIGJlIHNob3duIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3cgU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGZvbGQgd2lkZ2V0cyBhcmUgc2hvd25cbiAgICAgKiovXG4gICAgc2V0U2hvd0ZvbGRXaWRnZXRzKHNob3c6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93Rm9sZFdpZGdldHNcIiwgc2hvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGZvbGQgd2lkZ2V0cyBhcmUgc2hvd24uXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93Rm9sZFdpZGdldHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dGb2xkV2lkZ2V0c1wiKTtcbiAgICB9XG5cbiAgICBzZXRGYWRlRm9sZFdpZGdldHMoZmFkZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiLCBmYWRlKTtcbiAgICB9XG5cbiAgICBnZXRGYWRlRm9sZFdpZGdldHMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHdvcmRzIG9mIHRleHQgZnJvbSB0aGUgZWRpdG9yLlxuICAgICAqIEEgXCJ3b3JkXCIgaXMgZGVmaW5lZCBhcyBhIHN0cmluZyBvZiBjaGFyYWN0ZXJzIGJvb2tlbmRlZCBieSB3aGl0ZXNwYWNlLlxuICAgICAqXG4gICAgICogQG1ldGhvZCByZW1vdmVcbiAgICAgKiBAcGFyYW0gZGlyZWN0aW9uIHtzdHJpbmd9IFRoZSBkaXJlY3Rpb24gb2YgdGhlIGRlbGV0aW9uIHRvIG9jY3VyLCBlaXRoZXIgXCJsZWZ0XCIgb3IgXCJyaWdodFwiLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcmVtb3ZlKGRpcmVjdGlvbjogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIGlmIChkaXJlY3Rpb24gPT09IFwibGVmdFwiKVxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExlZnQoKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RSaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNlbGVjdGlvblJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5nZXRCZWhhdmlvdXJzRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHNlc3Npb24uZ2V0U3RhdGUoc2VsZWN0aW9uUmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgICAgIHZhciBuZXdSYW5nZTogUmFuZ2UgPSA8UmFuZ2U+c2Vzc2lvbi5nZXRNb2RlKCkudHJhbnNmb3JtQWN0aW9uKHN0YXRlLCAnZGVsZXRpb24nLCB0aGlzLCBzZXNzaW9uLCBzZWxlY3Rpb25SYW5nZSk7XG5cbiAgICAgICAgICAgIGlmIChzZWxlY3Rpb25SYW5nZS5lbmQuY29sdW1uID09PSAwKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRleHQgPSBzZXNzaW9uLmdldFRleHRSYW5nZShzZWxlY3Rpb25SYW5nZSk7XG4gICAgICAgICAgICAgICAgaWYgKHRleHRbdGV4dC5sZW5ndGggLSAxXSA9PT0gXCJcXG5cIikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShzZWxlY3Rpb25SYW5nZS5lbmQucm93KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKC9eXFxzKyQvLnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvblJhbmdlLmVuZC5jb2x1bW4gPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChuZXdSYW5nZSkge1xuICAgICAgICAgICAgICAgIHNlbGVjdGlvblJhbmdlID0gbmV3UmFuZ2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHNlbGVjdGlvblJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIHdvcmQgZGlyZWN0bHkgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgcmVtb3ZlV29yZFJpZ2h0XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZW1vdmVXb3JkUmlnaHQoKTogdm9pZCB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmRSaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgd29yZCBkaXJlY3RseSB0byB0aGUgbGVmdCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlbW92ZVdvcmRMZWZ0XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZW1vdmVXb3JkTGVmdCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIHdvcmRzIHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgdW50aWwgdGhlIHN0YXJ0IG9mIHRoZSBsaW5lLlxuICAgICAqKi9cbiAgICByZW1vdmVUb0xpbmVTdGFydCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExpbmVTdGFydCgpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYWxsIHRoZSB3b3JkcyB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCB1bnRpbCB0aGUgZW5kIG9mIHRoZSBsaW5lLlxuICAgICAqKi9cbiAgICByZW1vdmVUb0xpbmVFbmQoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RMaW5lRW5kKCk7XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQuY29sdW1uID09PSByYW5nZS5lbmQuY29sdW1uICYmIHJhbmdlLnN0YXJ0LnJvdyA9PT0gcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IDA7XG4gICAgICAgICAgICByYW5nZS5lbmQucm93Kys7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwbGl0cyB0aGUgbGluZSBhdCB0aGUgY3VycmVudCBzZWxlY3Rpb24gKGJ5IGluc2VydGluZyBhbiBgJ1xcbidgKS5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc3BsaXRMaW5lXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzcGxpdExpbmUoKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB0aGlzLmluc2VydChcIlxcblwiLCBmYWxzZSk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oY3Vyc29yKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmFuc3Bvc2VzIGN1cnJlbnQgbGluZS5cbiAgICAgKiovXG4gICAgdHJhbnNwb3NlTGV0dGVycygpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBjb2x1bW4gPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICBpZiAoY29sdW1uID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBzd2FwLCByYW5nZTtcbiAgICAgICAgaWYgKGNvbHVtbiA8IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICBzd2FwID0gbGluZS5jaGFyQXQoY29sdW1uKSArIGxpbmUuY2hhckF0KGNvbHVtbiAtIDEpO1xuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoY3Vyc29yLnJvdywgY29sdW1uIC0gMSwgY3Vyc29yLnJvdywgY29sdW1uICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzd2FwID0gbGluZS5jaGFyQXQoY29sdW1uIC0gMSkgKyBsaW5lLmNoYXJBdChjb2x1bW4gLSAyKTtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKGN1cnNvci5yb3csIGNvbHVtbiAtIDIsIGN1cnNvci5yb3csIGNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHN3YXApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBlbnRpcmVseSBpbnRvIGxvd2VyY2FzZS5cbiAgICAgKiovXG4gICAgdG9Mb3dlckNhc2UoKSB7XG4gICAgICAgIHZhciBvcmlnaW5hbFJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCB0ZXh0LnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShvcmlnaW5hbFJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0cyB0aGUgY3VycmVudCBzZWxlY3Rpb24gZW50aXJlbHkgaW50byB1cHBlcmNhc2UuXG4gICAgICoqL1xuICAgIHRvVXBwZXJDYXNlKCkge1xuICAgICAgICB2YXIgb3JpZ2luYWxSYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgdGV4dC50b1VwcGVyQ2FzZSgpKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2Uob3JpZ2luYWxSYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5zZXJ0cyBhbiBpbmRlbnRhdGlvbiBpbnRvIHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbiBvciBpbmRlbnRzIHRoZSBzZWxlY3RlZCBsaW5lcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgaW5kZW50XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBpbmRlbnQoKTogdm9pZCB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG5cbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA8IHJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICBzZXNzaW9uLmluZGVudFJvd3Mocm93cy5maXJzdCwgcm93cy5sYXN0LCBcIlxcdFwiKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChyYW5nZS5zdGFydC5jb2x1bW4gPCByYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICghL15cXHMrJC8udGVzdCh0ZXh0KSkge1xuICAgICAgICAgICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5pbmRlbnRSb3dzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCwgXCJcXHRcIik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUocmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgdmFyIHBvc2l0aW9uID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBzaXplID0gc2Vzc2lvbi5nZXRUYWJTaXplKCk7XG4gICAgICAgIHZhciBjb2x1bW4gPSBzZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zaXRpb24ucm93LCBwb3NpdGlvbi5jb2x1bW4pO1xuXG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uZ2V0VXNlU29mdFRhYnMoKSkge1xuICAgICAgICAgICAgdmFyIGNvdW50ID0gKHNpemUgLSBjb2x1bW4gJSBzaXplKTtcbiAgICAgICAgICAgIHZhciBpbmRlbnRTdHJpbmcgPSBzdHJpbmdSZXBlYXQoXCIgXCIsIGNvdW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBjb3VudCA9IGNvbHVtbiAlIHNpemU7XG4gICAgICAgICAgICB3aGlsZSAobGluZVtyYW5nZS5zdGFydC5jb2x1bW5dID09PSBcIiBcIiAmJiBjb3VudCkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbi0tO1xuICAgICAgICAgICAgICAgIGNvdW50LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpbmRlbnRTdHJpbmcgPSBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmluc2VydChpbmRlbnRTdHJpbmcsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRlbnRzIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGJsb2NrSW5kZW50XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzXG4gICAgICovXG4gICAgYmxvY2tJbmRlbnQoKTogdm9pZCB7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5pbmRlbnRSb3dzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCwgXCJcXHRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogT3V0ZGVudHMgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5vdXRkZW50Um93c1xuICAgICAqKi9cbiAgICBibG9ja091dGRlbnQoKSB7XG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5vdXRkZW50Um93cyhzZWxlY3Rpb24uZ2V0UmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogbW92ZSBvdXQgb2YgY29yZSB3aGVuIHdlIGhhdmUgZ29vZCBtZWNoYW5pc20gZm9yIG1hbmFnaW5nIGV4dGVuc2lvbnNcbiAgICBzb3J0TGluZXMoKSB7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXG4gICAgICAgIHZhciBsaW5lcyA9IFtdO1xuICAgICAgICBmb3IgKGkgPSByb3dzLmZpcnN0OyBpIDw9IHJvd3MubGFzdDsgaSsrKVxuICAgICAgICAgICAgbGluZXMucHVzaChzZXNzaW9uLmdldExpbmUoaSkpO1xuXG4gICAgICAgIGxpbmVzLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgaWYgKGEudG9Mb3dlckNhc2UoKSA8IGIudG9Mb3dlckNhc2UoKSkgcmV0dXJuIC0xO1xuICAgICAgICAgICAgaWYgKGEudG9Mb3dlckNhc2UoKSA+IGIudG9Mb3dlckNhc2UoKSkgcmV0dXJuIDE7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGRlbGV0ZVJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICBmb3IgKHZhciBpID0gcm93cy5maXJzdDsgaSA8PSByb3dzLmxhc3Q7IGkrKykge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoaSk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLnJvdyA9IGk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICBzZXNzaW9uLnJlcGxhY2UoZGVsZXRlUmFuZ2UsIGxpbmVzW2kgLSByb3dzLmZpcnN0XSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHaXZlbiB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHJhbmdlLCB0aGlzIGZ1bmN0aW9uIGVpdGhlciBjb21tZW50cyBhbGwgdGhlIGxpbmVzLCBvciB1bmNvbW1lbnRzIGFsbCBvZiB0aGVtLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB0b2dnbGVDb21tZW50TGluZXNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHRvZ2dsZUNvbW1lbnRMaW5lcygpOiB2b2lkIHtcbiAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5zZXNzaW9uLmdldFN0YXRlKHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cpO1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0TW9kZSgpLnRvZ2dsZUNvbW1lbnRMaW5lcyhzdGF0ZSwgdGhpcy5zZXNzaW9uLCByb3dzLmZpcnN0LCByb3dzLmxhc3QpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdG9nZ2xlQmxvY2tDb21tZW50XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB0b2dnbGVCbG9ja0NvbW1lbnQoKTogdm9pZCB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXMuc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0TW9kZSgpLnRvZ2dsZUJsb2NrQ29tbWVudChzdGF0ZSwgdGhpcy5zZXNzaW9uLCByYW5nZSwgY3Vyc29yKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBXb3JrcyBsaWtlIFtbRWRpdFNlc3Npb24uZ2V0VG9rZW5BdF1dLCBleGNlcHQgaXQgcmV0dXJucyBhIG51bWJlci5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIGdldE51bWJlckF0KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHsgdmFsdWU6IHN0cmluZzsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBfbnVtYmVyUnggPSAvW1xcLV0/WzAtOV0rKD86XFwuWzAtOV0rKT8vZztcbiAgICAgICAgX251bWJlclJ4Lmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgdmFyIHMgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3cpO1xuICAgICAgICB3aGlsZSAoX251bWJlclJ4Lmxhc3RJbmRleCA8IGNvbHVtbikge1xuICAgICAgICAgICAgdmFyIG06IFJlZ0V4cEV4ZWNBcnJheSA9IF9udW1iZXJSeC5leGVjKHMpO1xuICAgICAgICAgICAgaWYgKG0uaW5kZXggPD0gY29sdW1uICYmIG0uaW5kZXggKyBtWzBdLmxlbmd0aCA+PSBjb2x1bW4pIHtcbiAgICAgICAgICAgICAgICB2YXIgcmV0dmFsID0ge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogbVswXSxcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQ6IG0uaW5kZXgsXG4gICAgICAgICAgICAgICAgICAgIGVuZDogbS5pbmRleCArIG1bMF0ubGVuZ3RoXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmV0dmFsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIHRoZSBjaGFyYWN0ZXIgYmVmb3JlIHRoZSBjdXJzb3IgaXMgYSBudW1iZXIsIHRoaXMgZnVuY3Rpb25zIGNoYW5nZXMgaXRzIHZhbHVlIGJ5IGBhbW91bnRgLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBhbW91bnQgVGhlIHZhbHVlIHRvIGNoYW5nZSB0aGUgbnVtZXJhbCBieSAoY2FuIGJlIG5lZ2F0aXZlIHRvIGRlY3JlYXNlIHZhbHVlKVxuICAgICAqL1xuICAgIG1vZGlmeU51bWJlcihhbW91bnQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCkucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCkuY29sdW1uO1xuXG4gICAgICAgIC8vIGdldCB0aGUgY2hhciBiZWZvcmUgdGhlIGN1cnNvclxuICAgICAgICB2YXIgY2hhclJhbmdlID0gbmV3IFJhbmdlKHJvdywgY29sdW1uIC0gMSwgcm93LCBjb2x1bW4pO1xuXG4gICAgICAgIHZhciBjID0gcGFyc2VGbG9hdCh0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKGNoYXJSYW5nZSkpO1xuICAgICAgICAvLyBpZiB0aGUgY2hhciBpcyBhIGRpZ2l0XG4gICAgICAgIGlmICghaXNOYU4oYykgJiYgaXNGaW5pdGUoYykpIHtcbiAgICAgICAgICAgIC8vIGdldCB0aGUgd2hvbGUgbnVtYmVyIHRoZSBkaWdpdCBpcyBwYXJ0IG9mXG4gICAgICAgICAgICB2YXIgbnIgPSB0aGlzLmdldE51bWJlckF0KHJvdywgY29sdW1uKTtcbiAgICAgICAgICAgIC8vIGlmIG51bWJlciBmb3VuZFxuICAgICAgICAgICAgaWYgKG5yKSB7XG4gICAgICAgICAgICAgICAgdmFyIGZwID0gbnIudmFsdWUuaW5kZXhPZihcIi5cIikgPj0gMCA/IG5yLnN0YXJ0ICsgbnIudmFsdWUuaW5kZXhPZihcIi5cIikgKyAxIDogbnIuZW5kO1xuICAgICAgICAgICAgICAgIHZhciBkZWNpbWFscyA9IG5yLnN0YXJ0ICsgbnIudmFsdWUubGVuZ3RoIC0gZnA7XG5cbiAgICAgICAgICAgICAgICB2YXIgdCA9IHBhcnNlRmxvYXQobnIudmFsdWUpO1xuICAgICAgICAgICAgICAgIHQgKj0gTWF0aC5wb3coMTAsIGRlY2ltYWxzKTtcblxuXG4gICAgICAgICAgICAgICAgaWYgKGZwICE9PSBuci5lbmQgJiYgY29sdW1uIDwgZnApIHtcbiAgICAgICAgICAgICAgICAgICAgYW1vdW50ICo9IE1hdGgucG93KDEwLCBuci5lbmQgLSBjb2x1bW4gLSAxKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhbW91bnQgKj0gTWF0aC5wb3coMTAsIG5yLmVuZCAtIGNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdCArPSBhbW91bnQ7XG4gICAgICAgICAgICAgICAgdCAvPSBNYXRoLnBvdygxMCwgZGVjaW1hbHMpO1xuICAgICAgICAgICAgICAgIHZhciBubnIgPSB0LnRvRml4ZWQoZGVjaW1hbHMpO1xuXG4gICAgICAgICAgICAgICAgLy91cGRhdGUgbnVtYmVyXG4gICAgICAgICAgICAgICAgdmFyIHJlcGxhY2VSYW5nZSA9IG5ldyBSYW5nZShyb3csIG5yLnN0YXJ0LCByb3csIG5yLmVuZCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmVwbGFjZVJhbmdlLCBubnIpO1xuXG4gICAgICAgICAgICAgICAgLy9yZXBvc2l0aW9uIHRoZSBjdXJzb3JcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhyb3csIE1hdGgubWF4KG5yLnN0YXJ0ICsgMSwgY29sdW1uICsgbm5yLmxlbmd0aCAtIG5yLnZhbHVlLmxlbmd0aCkpO1xuXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCB0aGUgbGluZXMgaW4gdGhlIGN1cnJlbnQgc2VsZWN0aW9uXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ucmVtb3ZlXG4gICAgICoqL1xuICAgIHJlbW92ZUxpbmVzKCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB2YXIgcmFuZ2U7XG4gICAgICAgIGlmIChyb3dzLmZpcnN0ID09PSAwIHx8IHJvd3MubGFzdCArIDEgPCB0aGlzLnNlc3Npb24uZ2V0TGVuZ3RoKCkpXG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShyb3dzLmZpcnN0LCAwLCByb3dzLmxhc3QgKyAxLCAwKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoXG4gICAgICAgICAgICAgICAgcm93cy5maXJzdCAtIDEsIHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvd3MuZmlyc3QgLSAxKS5sZW5ndGgsXG4gICAgICAgICAgICAgICAgcm93cy5sYXN0LCB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3dzLmxhc3QpLmxlbmd0aFxuICAgICAgICAgICAgKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICBkdXBsaWNhdGVTZWxlY3Rpb24oKSB7XG4gICAgICAgIHZhciBzZWwgPSB0aGlzLnNlbGVjdGlvbjtcbiAgICAgICAgdmFyIGRvYyA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJhbmdlID0gc2VsLmdldFJhbmdlKCk7XG4gICAgICAgIHZhciByZXZlcnNlID0gc2VsLmlzQmFja3dhcmRzKCk7XG4gICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICBkb2MuZHVwbGljYXRlTGluZXMocm93LCByb3cpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHBvaW50ID0gcmV2ZXJzZSA/IHJhbmdlLnN0YXJ0IDogcmFuZ2UuZW5kO1xuICAgICAgICAgICAgdmFyIGVuZFBvaW50ID0gZG9jLmluc2VydChwb2ludCwgZG9jLmdldFRleHRSYW5nZShyYW5nZSkpO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQgPSBwb2ludDtcbiAgICAgICAgICAgIHJhbmdlLmVuZCA9IGVuZFBvaW50O1xuXG4gICAgICAgICAgICBzZWwuc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UsIHJldmVyc2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgZG93biBvbmUgcm93LlxuICAgICAqXG4gICAgICogQHJldHVybiB7TnVtYmVyfSBPbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVMaW5lc1VwXG4gICAgICoqL1xuICAgIG1vdmVMaW5lc0Rvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlTGluZXNEb3duKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgdXAgb25lIHJvdy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZUxpbmVzRG93blxuICAgICAqKi9cbiAgICBtb3ZlTGluZXNVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLm1vdmVMaW5lc1VwKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICAgKiBgYGBqc29uXG4gICAgICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICAgKiBgYGBcbiAgICAgKiBAcGFyYW0ge1JhbmdlfSBmcm9tUmFuZ2UgVGhlIHJhbmdlIG9mIHRleHQgeW91IHdhbnQgbW92ZWQgd2l0aGluIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0b1Bvc2l0aW9uIFRoZSBsb2NhdGlvbiAocm93IGFuZCBjb2x1bW4pIHdoZXJlIHlvdSB3YW50IHRvIG1vdmUgdGhlIHRleHQgdG9cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1JhbmdlfSBUaGUgbmV3IHJhbmdlIHdoZXJlIHRoZSB0ZXh0IHdhcyBtb3ZlZCB0by5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5tb3ZlVGV4dFxuICAgICAqKi9cbiAgICBtb3ZlVGV4dChyYW5nZSwgdG9Qb3NpdGlvbiwgY29weSkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLm1vdmVUZXh0KHJhbmdlLCB0b1Bvc2l0aW9uLCBjb3B5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyB1cCBvbmUgcm93LlxuICAgICAqIEByZXR1cm4ge051bWJlcn0gT24gc3VjY2VzcywgcmV0dXJucyAwLlxuICAgICAqXG4gICAgICoqL1xuICAgIGNvcHlMaW5lc1VwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlTGluZXMoZnVuY3Rpb24oZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgZG93biBvbmUgcm93LlxuICAgICAqIEByZXR1cm4ge051bWJlcn0gT24gc3VjY2VzcywgcmV0dXJucyB0aGUgbnVtYmVyIG9mIG5ldyByb3dzIGFkZGVkOyBpbiBvdGhlciB3b3JkcywgYGxhc3RSb3cgLSBmaXJzdFJvdyArIDFgLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmR1cGxpY2F0ZUxpbmVzXG4gICAgICpcbiAgICAgKiovXG4gICAgY29weUxpbmVzRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZXMgYSBzcGVjaWZpYyBmdW5jdGlvbiwgd2hpY2ggY2FuIGJlIGFueXRoaW5nIHRoYXQgbWFuaXB1bGF0ZXMgc2VsZWN0ZWQgbGluZXMsIHN1Y2ggYXMgY29weWluZyB0aGVtLCBkdXBsaWNhdGluZyB0aGVtLCBvciBzaGlmdGluZyB0aGVtLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG1vdmVyIEEgbWV0aG9kIHRvIGNhbGwgb24gZWFjaCBzZWxlY3RlZCByb3dcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHByaXZhdGUgJG1vdmVMaW5lcyhtb3Zlcikge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIGlmICghc2VsZWN0aW9uWydpbk11bHRpU2VsZWN0TW9kZSddIHx8IHRoaXMuaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gc2VsZWN0aW9uLnRvT3JpZW50ZWRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGVkUm93czogeyBmaXJzdDogbnVtYmVyOyBsYXN0OiBudW1iZXIgfSA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICAgICAgdmFyIGxpbmVzTW92ZWQgPSBtb3Zlci5jYWxsKHRoaXMsIHNlbGVjdGVkUm93cy5maXJzdCwgc2VsZWN0ZWRSb3dzLmxhc3QpO1xuICAgICAgICAgICAgcmFuZ2UubW92ZUJ5KGxpbmVzTW92ZWQsIDApO1xuICAgICAgICAgICAgc2VsZWN0aW9uLmZyb21PcmllbnRlZFJhbmdlKHJhbmdlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciByYW5nZXMgPSBzZWxlY3Rpb24ucmFuZ2VMaXN0LnJhbmdlcztcbiAgICAgICAgICAgIHNlbGVjdGlvbi5yYW5nZUxpc3QuZGV0YWNoKCk7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSByYW5nZXMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlSW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIHZhciBjb2xsYXBzZWRSb3dzID0gcmFuZ2VzW2ldLmNvbGxhcHNlUm93cygpO1xuICAgICAgICAgICAgICAgIHZhciBsYXN0ID0gY29sbGFwc2VkUm93cy5lbmQucm93O1xuICAgICAgICAgICAgICAgIHZhciBmaXJzdCA9IGNvbGxhcHNlZFJvd3Muc3RhcnQucm93O1xuICAgICAgICAgICAgICAgIHdoaWxlIChpLS0pIHtcbiAgICAgICAgICAgICAgICAgICAgY29sbGFwc2VkUm93cyA9IHJhbmdlc1tpXS5jb2xsYXBzZVJvd3MoKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpcnN0IC0gY29sbGFwc2VkUm93cy5lbmQucm93IDw9IDEpXG4gICAgICAgICAgICAgICAgICAgICAgICBmaXJzdCA9IGNvbGxhcHNlZFJvd3MuZW5kLnJvdztcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGkrKztcblxuICAgICAgICAgICAgICAgIHZhciBsaW5lc01vdmVkID0gbW92ZXIuY2FsbCh0aGlzLCBmaXJzdCwgbGFzdCk7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHJhbmdlSW5kZXggPj0gaSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZXNbcmFuZ2VJbmRleF0ubW92ZUJ5KGxpbmVzTW92ZWQsIDApO1xuICAgICAgICAgICAgICAgICAgICByYW5nZUluZGV4LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VsZWN0aW9uLmZyb21PcmllbnRlZFJhbmdlKHNlbGVjdGlvbi5yYW5nZXNbMF0pO1xuICAgICAgICAgICAgc2VsZWN0aW9uLnJhbmdlTGlzdC5hdHRhY2godGhpcy5zZXNzaW9uKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gb2JqZWN0IGluZGljYXRpbmcgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCByb3dzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCAkZ2V0U2VsZWN0ZWRSb3dzXG4gICAgICogQHJldHVybiB7Rmlyc3RBbmRMYXN0fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSAkZ2V0U2VsZWN0ZWRSb3dzKCk6IEZpcnN0QW5kTGFzdCB7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKS5jb2xsYXBzZVJvd3MoKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZmlyc3Q6IHRoaXMuc2Vzc2lvbi5nZXRSb3dGb2xkU3RhcnQocmFuZ2Uuc3RhcnQucm93KSxcbiAgICAgICAgICAgIGxhc3Q6IHRoaXMuc2Vzc2lvbi5nZXRSb3dGb2xkRW5kKHJhbmdlLmVuZC5yb3cpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvblN0YXJ0KHRleHQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaG93Q29tcG9zaXRpb24odGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpKTtcbiAgICB9XG5cbiAgICBvbkNvbXBvc2l0aW9uVXBkYXRlKHRleHQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQodGV4dCk7XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvbkVuZCgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5oaWRlQ29tcG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3d9XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvd1xuICAgICAqKi9cbiAgICBnZXRGaXJzdFZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3d9XG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93XG4gICAgICoqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kaWNhdGVzIGlmIHRoZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGlzUm93VmlzaWJsZShyb3c6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gKHJvdyA+PSB0aGlzLmdldEZpcnN0VmlzaWJsZVJvdygpICYmIHJvdyA8PSB0aGlzLmdldExhc3RWaXNpYmxlUm93KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyBpZiB0aGUgZW50aXJlIHJvdyBpcyBjdXJyZW50bHkgdmlzaWJsZSBvbiB0aGUgc2NyZWVuLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBjaGVja1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc1Jvd0Z1bGx5VmlzaWJsZShyb3c6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gKHJvdyA+PSB0aGlzLnJlbmRlcmVyLmdldEZpcnN0RnVsbHlWaXNpYmxlUm93KCkgJiYgcm93IDw9IHRoaXMucmVuZGVyZXIuZ2V0TGFzdEZ1bGx5VmlzaWJsZVJvdygpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBudW1iZXIgb2YgY3VycmVudGx5IHZpc2liaWxlIHJvd3MuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBwcml2YXRlICRnZXRWaXNpYmxlUm93Q291bnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0U2Nyb2xsQm90dG9tUm93KCkgLSB0aGlzLnJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdygpICsgMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGSVhNRTogVGhlIHNlbWFudGljcyBvZiBzZWxlY3QgYXJlIG5vdCBlYXNpbHkgdW5kZXJzdG9vZC4gXG4gICAgICogQHBhcmFtIGRpcmVjdGlvbiArMSBmb3IgcGFnZSBkb3duLCAtMSBmb3IgcGFnZSB1cC4gTWF5YmUgTiBmb3IgTiBwYWdlcz9cbiAgICAgKiBAcGFyYW0gc2VsZWN0IHRydWUgfCBmYWxzZSB8IHVuZGVmaW5lZFxuICAgICAqL1xuICAgIHByaXZhdGUgJG1vdmVCeVBhZ2UoZGlyZWN0aW9uOiBudW1iZXIsIHNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcjtcbiAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMucmVuZGVyZXIubGF5ZXJDb25maWc7XG4gICAgICAgIHZhciByb3dzID0gZGlyZWN0aW9uICogTWF0aC5mbG9vcihjb25maWcuaGVpZ2h0IC8gY29uZmlnLmxpbmVIZWlnaHQpO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIGlmIChzZWxlY3QgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLiRtb3ZlU2VsZWN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvckJ5KHJvd3MsIDApO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoc2VsZWN0ID09PSBmYWxzZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckJ5KHJvd3MsIDApO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZy0tO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSByZW5kZXJlci5zY3JvbGxUb3A7XG5cbiAgICAgICAgcmVuZGVyZXIuc2Nyb2xsQnkoMCwgcm93cyAqIGNvbmZpZy5saW5lSGVpZ2h0KTtcbiAgICAgICAgLy8gV2h5IGRvbid0IHdlIGFzc2VydCBvdXIgYXJncyBhbmQgZG8gdHlwZW9mIHNlbGVjdCA9PT0gJ3VuZGVmaW5lZCc/XG4gICAgICAgIGlmIChzZWxlY3QgIT0gbnVsbCkge1xuICAgICAgICAgICAgLy8gVGhpcyBpcyBjYWxsZWQgd2hlbiBzZWxlY3QgaXMgdW5kZWZpbmVkLlxuICAgICAgICAgICAgcmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlbmRlcmVyLmFuaW1hdGVTY3JvbGxpbmcoc2Nyb2xsVG9wKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIHRoZSB0ZXh0IGZyb20gdGhlIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGRvY3VtZW50IHVudGlsIHdoZXJlIGEgXCJwYWdlIGRvd25cIiBmaW5pc2hlcy5cbiAgICAgKiovXG4gICAgc2VsZWN0UGFnZURvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoKzEsIHRydWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgdGhlIHRleHQgZnJvbSB0aGUgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgdW50aWwgd2hlcmUgYSBcInBhZ2UgdXBcIiBmaW5pc2hlcy5cbiAgICAgKiovXG4gICAgc2VsZWN0UGFnZVVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKC0xLCB0cnVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSBkb3duXCIgaXMsIGFzIHdlbGwgYXMgbW92aW5nIHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgICoqL1xuICAgIGdvdG9QYWdlRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgrMSwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIHVwXCIgaXMsIGFzIHdlbGwgYXMgbW92aW5nIHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgICoqL1xuICAgIGdvdG9QYWdlVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoLTEsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgZG93blwiIGlzLCB3aXRob3V0IGNoYW5naW5nIHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgICoqL1xuICAgIHNjcm9sbFBhZ2VEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSB1cFwiIGlzLCB3aXRob3V0IGNoYW5naW5nIHRoZSBjdXJzb3IgcG9zaXRpb24uXG4gICAgICoqL1xuICAgIHNjcm9sbFBhZ2VVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgtMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGVkaXRvciB0byB0aGUgc3BlY2lmaWVkIHJvdy5cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9Sb3dcbiAgICAgKi9cbiAgICBzY3JvbGxUb1Jvdyhyb3c6IG51bWJlcikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvUm93KHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0byBhIGxpbmUuIElmIGBjZW50ZXJgIGlzIGB0cnVlYCwgaXQgcHV0cyB0aGUgbGluZSBpbiBtaWRkbGUgb2Ygc2NyZWVuIChvciBhdHRlbXB0cyB0bykuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxpbmUgVGhlIGxpbmUgdG8gc2Nyb2xsIHRvXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBjZW50ZXIgSWYgYHRydWVgXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY3JvbGxpbmdcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgd2hlbiB0aGUgYW5pbWF0aW9uIGhhcyBmaW5pc2hlZFxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuc2Nyb2xsVG9MaW5lXG4gICAgICoqL1xuICAgIHNjcm9sbFRvTGluZShsaW5lOiBudW1iZXIsIGNlbnRlcjogYm9vbGVhbiwgYW5pbWF0ZTogYm9vbGVhbiwgY2FsbGJhY2s/OiAoKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb0xpbmUobGluZSwgY2VudGVyLCBhbmltYXRlLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gY2VudGVyIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBvbiB0aGUgc2NyZWVuLlxuICAgICAqKi9cbiAgICBjZW50ZXJTZWxlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogTWF0aC5mbG9vcihyYW5nZS5zdGFydC5yb3cgKyAocmFuZ2UuZW5kLnJvdyAtIHJhbmdlLnN0YXJ0LnJvdykgLyAyKSxcbiAgICAgICAgICAgIGNvbHVtbjogTWF0aC5mbG9vcihyYW5nZS5zdGFydC5jb2x1bW4gKyAocmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbikgLyAyKVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmFsaWduQ3Vyc29yKHBvcywgMC41KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEN1cnNvclBvc2l0aW9uXG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb24oKTogUG9zaXRpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc2NyZWVuIHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEN1cnNvclBvc2l0aW9uU2NyZWVuXG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW4oKTogUG9zaXRpb24ge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpXG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0U2VsZWN0aW9uUmFuZ2VcbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBnZXRTZWxlY3Rpb25SYW5nZSgpOiBSYW5nZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgYWxsIHRoZSB0ZXh0IGluIGVkaXRvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2VsZWN0QWxsXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZWxlY3RBbGwoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdEFsbCgpO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgY2xlYXJTZWxlY3Rpb25cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGNsZWFyU2VsZWN0aW9uKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNwZWNpZmllZCByb3cgYW5kIGNvbHVtbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBub3QgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBuZXcgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIG5ldyBjb2x1bW4gbnVtYmVyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBhbmltYXRlXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24ubW92ZUN1cnNvclRvXG4gICAgICoqL1xuICAgIG1vdmVDdXJzb3JUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGFuaW1hdGU/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgcG9zaXRpb24gc3BlY2lmaWVkIGJ5IGBwb3NpdGlvbi5yb3dgIGFuZCBgcG9zaXRpb24uY29sdW1uYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgbW92ZUN1cnNvclRvUG9zaXRpb25cbiAgICAgKiBAcGFyYW0gcG9zaXRpb24ge1Bvc2l0aW9ufSBBbiBvYmplY3Qgd2l0aCB0d28gcHJvcGVydGllcywgcm93IGFuZCBjb2x1bW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG1vdmVDdXJzb3JUb1Bvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuICAgICAgICByZXR1cm4gdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zaXRpb24pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IncyByb3cgYW5kIGNvbHVtbiB0byB0aGUgbmV4dCBtYXRjaGluZyBicmFja2V0IG9yIEhUTUwgdGFnLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBqdW1wVG9NYXRjaGluZ1xuICAgICAqIEBwYXJhbSBzZWxlY3Qge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBqdW1wVG9NYXRjaGluZyhzZWxlY3Q6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcy5zZXNzaW9uLCBjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdmFyIHByZXZUb2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICB2YXIgdG9rZW4gPSBwcmV2VG9rZW47XG5cbiAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcblxuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vZ2V0IG5leHQgY2xvc2luZyB0YWcgb3IgYnJhY2tldFxuICAgICAgICB2YXIgbWF0Y2hUeXBlO1xuICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGRlcHRoID0ge307XG4gICAgICAgIHZhciBpID0gY3Vyc29yLmNvbHVtbiAtIHRva2VuLnN0YXJ0O1xuICAgICAgICB2YXIgYnJhY2tldFR5cGU7XG4gICAgICAgIHZhciBicmFja2V0cyA9IHtcbiAgICAgICAgICAgIFwiKVwiOiBcIihcIixcbiAgICAgICAgICAgIFwiKFwiOiBcIihcIixcbiAgICAgICAgICAgIFwiXVwiOiBcIltcIixcbiAgICAgICAgICAgIFwiW1wiOiBcIltcIixcbiAgICAgICAgICAgIFwie1wiOiBcIntcIixcbiAgICAgICAgICAgIFwifVwiOiBcIntcIlxuICAgICAgICB9O1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGlmICh0b2tlbi52YWx1ZS5tYXRjaCgvW3t9KClcXFtcXF1dL2cpKSB7XG4gICAgICAgICAgICAgICAgZm9yICg7IGkgPCB0b2tlbi52YWx1ZS5sZW5ndGggJiYgIWZvdW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFicmFja2V0c1t0b2tlbi52YWx1ZVtpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYnJhY2tldFR5cGUgPSBicmFja2V0c1t0b2tlbi52YWx1ZVtpXV0gKyAnLicgKyB0b2tlbi50eXBlLnJlcGxhY2UoXCJycGFyZW5cIiwgXCJscGFyZW5cIik7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzTmFOKGRlcHRoW2JyYWNrZXRUeXBlXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW2JyYWNrZXRUeXBlXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHRva2VuLnZhbHVlW2ldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICcoJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1snOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAneyc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICcpJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ10nOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnfSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdLS07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGhbYnJhY2tldFR5cGVdID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaFR5cGUgPSAnYnJhY2tldCc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0b2tlbiAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgaWYgKGlzTmFOKGRlcHRoW3Rva2VuLnZhbHVlXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGhbdG9rZW4udmFsdWVdID0gMDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVwdGhbdG9rZW4udmFsdWVdKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0tLTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZGVwdGhbdG9rZW4udmFsdWVdID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaFR5cGUgPSAndGFnJztcbiAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IHRva2VuO1xuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgICAgICBpID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgIWZvdW5kKTtcblxuICAgICAgICAvL25vIG1hdGNoIGZvdW5kXG4gICAgICAgIGlmICghbWF0Y2hUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICBpZiAobWF0Y2hUeXBlID09PSAnYnJhY2tldCcpIHtcbiAgICAgICAgICAgIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldEJyYWNrZXRSYW5nZShjdXJzb3IpO1xuICAgICAgICAgICAgaWYgKCFyYW5nZSkge1xuICAgICAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyBpIC0gMSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgaSAtIDFcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy5yb3cgPT09IGN1cnNvci5yb3cgJiYgTWF0aC5hYnMocG9zLmNvbHVtbiAtIGN1cnNvci5jb2x1bW4pIDwgMilcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKHBvcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobWF0Y2hUeXBlID09PSAndGFnJykge1xuICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpXG4gICAgICAgICAgICAgICAgdmFyIHRhZyA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpIC0gMixcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSAtIDJcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vZmluZCBtYXRjaGluZyB0YWdcbiAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pID09PSAwKSB7XG4gICAgICAgICAgICAgICAgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gcHJldlRva2VuO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnR5cGUuaW5kZXhPZigndGFnLWNsb3NlJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLCBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW3RhZ10rKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFt0YWddLS07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlcHRoW3RhZ10gPT09IDApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHByZXZUb2tlbiAmJiAhZm91bmQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3dlIGZvdW5kIGl0XG4gICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChwb3Mucm93ID09IGN1cnNvci5yb3cgJiYgTWF0aC5hYnMocG9zLmNvbHVtbiAtIGN1cnNvci5jb2x1bW4pIDwgMilcbiAgICAgICAgICAgICAgICAgICAgcG9zID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcG9zID0gcmFuZ2UgJiYgcmFuZ2VbJ2N1cnNvciddIHx8IHBvcztcbiAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgaWYgKHNlbGVjdCkge1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5pc0VxdWFsKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSkpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFRvKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3BlY2lmaWVkIGxpbmUgbnVtYmVyLCBhbmQgYWxzbyBpbnRvIHRoZSBpbmRpY2lhdGVkIGNvbHVtbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZU51bWJlciBUaGUgbGluZSBudW1iZXIgdG8gZ28gdG9cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIEEgY29sdW1uIG51bWJlciB0byBnbyB0b1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZXMgc2NvbGxpbmdcbiAgICAgKiovXG4gICAgZ290b0xpbmUobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIsIGFuaW1hdGU/OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi51bmZvbGQoeyByb3c6IGxpbmVOdW1iZXIgLSAxLCBjb2x1bW46IGNvbHVtbiB8fCAwIH0pO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgIC8vIHRvZG86IGZpbmQgYSB3YXkgdG8gYXV0b21hdGljYWxseSBleGl0IG11bHRpc2VsZWN0IG1vZGVcbiAgICAgICAgdGhpcy5leGl0TXVsdGlTZWxlY3RNb2RlICYmIHRoaXMuZXhpdE11bHRpU2VsZWN0TW9kZSgpO1xuICAgICAgICB0aGlzLm1vdmVDdXJzb3JUbyhsaW5lTnVtYmVyIC0gMSwgY29sdW1uIHx8IDApO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgIGlmICghdGhpcy5pc1Jvd0Z1bGx5VmlzaWJsZShsaW5lTnVtYmVyIC0gMSkpIHtcbiAgICAgICAgICAgIHRoaXMuc2Nyb2xsVG9MaW5lKGxpbmVOdW1iZXIgLSAxLCB0cnVlLCBhbmltYXRlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNwZWNpZmllZCByb3cgYW5kIGNvbHVtbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIG5ldyByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgbmV3IGNvbHVtbiBudW1iZXJcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yLm1vdmVDdXJzb3JUb1xuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8ocm93LCBjb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdXAgaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlVXAodGltZXM6IG51bWJlcikge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSAmJiAhdGhpcy5zZWxlY3Rpb24uaXNCYWNrd2FyZHMoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gdGhpcy5zZWxlY3Rpb24uYW5jaG9yLmdldFBvc2l0aW9uKCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25TdGFydCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckJ5KC10aW1lcyB8fCAtMSwgMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciBkb3duIGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZURvd24odGltZXM6IG51bWJlcikge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSAmJiB0aGlzLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gdGhpcy5zZWxlY3Rpb24uYW5jaG9yLmdldFBvc2l0aW9uKCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25FbmQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JCeSh0aW1lcyB8fCAxLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGxlZnQgaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGVmdCh0aW1lczogbnVtYmVyKSB7XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uU3RhcnQgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuc3RhcnQ7XG4gICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvblN0YXJ0KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRpbWVzID0gdGltZXMgfHwgMTtcbiAgICAgICAgICAgIHdoaWxlICh0aW1lcy0tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckxlZnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciByaWdodCBpbiB0aGUgZG9jdW1lbnQgdGhlIHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZXMgVGhlIG51bWJlciBvZiB0aW1lcyB0byBjaGFuZ2UgbmF2aWdhdGlvblxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgbmF2aWdhdGVSaWdodCh0aW1lczogbnVtYmVyKSB7XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpLmVuZDtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uRW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRpbWVzID0gdGltZXMgfHwgMTtcbiAgICAgICAgICAgIHdoaWxlICh0aW1lcy0tKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvclJpZ2h0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGN1cnJlbnQgbGluZS4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUxpbmVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVTdGFydCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgbGluZS4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUxpbmVFbmQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JMaW5lRW5kKCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCBmaWxlLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRmlsZUVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckZpbGVFbmQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGN1cnJlbnQgZmlsZS4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZUZpbGVTdGFydCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckZpbGVTdGFydCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSB3b3JkIGltbWVkaWF0ZWx5IHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBwb3NpdGlvbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVdvcmRSaWdodCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvcldvcmRSaWdodCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSB3b3JkIGltbWVkaWF0ZWx5IHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJyZW50IHBvc2l0aW9uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlV29yZExlZnQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkTGVmdCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwbGFjZXMgdGhlIGZpcnN0IG9jY3VyYW5jZSBvZiBgb3B0aW9ucy5uZWVkbGVgIHdpdGggdGhlIHZhbHVlIGluIGByZXBsYWNlbWVudGAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHJlcGxhY2VtZW50IFRoZSB0ZXh0IHRvIHJlcGxhY2Ugd2l0aFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBbW1NlYXJjaCBgU2VhcmNoYF1dIG9wdGlvbnMgdG8gdXNlXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICByZXBsYWNlKHJlcGxhY2VtZW50OiBzdHJpbmcsIG9wdGlvbnMpOiBudW1iZXIge1xuICAgICAgICBpZiAob3B0aW9ucylcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaC5zZXQob3B0aW9ucyk7XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy4kc2VhcmNoLmZpbmQodGhpcy5zZXNzaW9uKTtcbiAgICAgICAgdmFyIHJlcGxhY2VkID0gMDtcbiAgICAgICAgaWYgKCFyYW5nZSlcbiAgICAgICAgICAgIHJldHVybiByZXBsYWNlZDtcblxuICAgICAgICBpZiAodGhpcy4kdHJ5UmVwbGFjZShyYW5nZSwgcmVwbGFjZW1lbnQpKSB7XG4gICAgICAgICAgICByZXBsYWNlZCA9IDE7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJhbmdlICE9PSBudWxsKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3KHJhbmdlLnN0YXJ0LCByYW5nZS5lbmQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcGxhY2VzIGFsbCBvY2N1cmFuY2VzIG9mIGBvcHRpb25zLm5lZWRsZWAgd2l0aCB0aGUgdmFsdWUgaW4gYHJlcGxhY2VtZW50YC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gcmVwbGFjZW1lbnQgVGhlIHRleHQgdG8gcmVwbGFjZSB3aXRoXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgVGhlIFtbU2VhcmNoIGBTZWFyY2hgXV0gb3B0aW9ucyB0byB1c2VcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHJlcGxhY2VBbGwocmVwbGFjZW1lbnQ6IHN0cmluZywgb3B0aW9ucyk6IG51bWJlciB7XG4gICAgICAgIGlmIChvcHRpb25zKSB7XG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlcyA9IHRoaXMuJHNlYXJjaC5maW5kQWxsKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IDA7XG4gICAgICAgIGlmICghcmFuZ2VzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybiByZXBsYWNlZDtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuXG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbygwLCAwKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gcmFuZ2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdHJ5UmVwbGFjZShyYW5nZXNbaV0sIHJlcGxhY2VtZW50KSkge1xuICAgICAgICAgICAgICAgIHJlcGxhY2VkKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShzZWxlY3Rpb24pO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgIHJldHVybiByZXBsYWNlZDtcbiAgICB9XG5cbiAgICBwcml2YXRlICR0cnlSZXBsYWNlKHJhbmdlOiBSYW5nZSwgcmVwbGFjZW1lbnQ6IHN0cmluZyk6IFJhbmdlIHtcbiAgICAgICAgdmFyIGlucHV0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHJlcGxhY2VtZW50ID0gdGhpcy4kc2VhcmNoLnJlcGxhY2UoaW5wdXQsIHJlcGxhY2VtZW50KTtcbiAgICAgICAgaWYgKHJlcGxhY2VtZW50ICE9PSBudWxsKSB7XG4gICAgICAgICAgICByYW5nZS5lbmQgPSB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgcmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlNlYXJjaC5nZXRPcHRpb25zfSBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBgb3B0aW9uc2AsIHNlZSBbW1NlYXJjaCBgU2VhcmNoYF1dLlxuICAgICAqIEByZWxhdGVkIFNlYXJjaC5nZXRPcHRpb25zXG4gICAgICogQHJldHVybiB7T2JqZWN0fVxuICAgICAqKi9cbiAgICBnZXRMYXN0U2VhcmNoT3B0aW9ucygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHNlYXJjaC5nZXRPcHRpb25zKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gZmluZCBgbmVlZGxlYCB3aXRoaW4gdGhlIGRvY3VtZW50LiBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBgb3B0aW9uc2AsIHNlZSBbW1NlYXJjaCBgU2VhcmNoYF1dLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBuZWVkbGUgVGhlIHRleHQgdG8gc2VhcmNoIGZvciAob3B0aW9uYWwpXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgQW4gb2JqZWN0IGRlZmluaW5nIHZhcmlvdXMgc2VhcmNoIHByb3BlcnRpZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlYXJjaC5maW5kXG4gICAgICoqL1xuICAgIGZpbmQobmVlZGxlOiAoc3RyaW5nIHwgUmVnRXhwKSwgb3B0aW9ucywgYW5pbWF0ZT86IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIGlmICghb3B0aW9ucylcbiAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcblxuICAgICAgICBpZiAodHlwZW9mIG5lZWRsZSA9PSBcInN0cmluZ1wiIHx8IG5lZWRsZSBpbnN0YW5jZW9mIFJlZ0V4cClcbiAgICAgICAgICAgIG9wdGlvbnMubmVlZGxlID0gbmVlZGxlO1xuICAgICAgICBlbHNlIGlmICh0eXBlb2YgbmVlZGxlID09IFwib2JqZWN0XCIpXG4gICAgICAgICAgICBtaXhpbihvcHRpb25zLCBuZWVkbGUpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgIGlmIChvcHRpb25zLm5lZWRsZSA9PSBudWxsKSB7XG4gICAgICAgICAgICBuZWVkbGUgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKSB8fCB0aGlzLiRzZWFyY2guJG9wdGlvbnMubmVlZGxlO1xuICAgICAgICAgICAgaWYgKCFuZWVkbGUpIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRXb3JkUmFuZ2UocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIG5lZWRsZSA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldCh7IG5lZWRsZTogbmVlZGxlIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kc2VhcmNoLnNldChvcHRpb25zKTtcbiAgICAgICAgaWYgKCFvcHRpb25zLnN0YXJ0KVxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldCh7IHN0YXJ0OiByYW5nZSB9KTtcblxuICAgICAgICB2YXIgbmV3UmFuZ2UgPSB0aGlzLiRzZWFyY2guZmluZCh0aGlzLnNlc3Npb24pO1xuICAgICAgICBpZiAob3B0aW9ucy5wcmV2ZW50U2Nyb2xsKVxuICAgICAgICAgICAgcmV0dXJuIG5ld1JhbmdlO1xuICAgICAgICBpZiAobmV3UmFuZ2UpIHtcbiAgICAgICAgICAgIHRoaXMucmV2ZWFsUmFuZ2UobmV3UmFuZ2UsIGFuaW1hdGUpO1xuICAgICAgICAgICAgcmV0dXJuIG5ld1JhbmdlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGNsZWFyIHNlbGVjdGlvbiBpZiBub3RoaW5nIGlzIGZvdW5kXG4gICAgICAgIGlmIChvcHRpb25zLmJhY2t3YXJkcylcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcmFuZ2UuZW5kO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZS5lbmQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0UmFuZ2UocmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIGFub3RoZXIgc2VhcmNoIGZvciBgbmVlZGxlYCBpbiB0aGUgZG9jdW1lbnQuIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgc2VhcmNoIG9wdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvci5maW5kXG4gICAgICoqL1xuICAgIGZpbmROZXh0KG5lZWRsZT86IChzdHJpbmcgfCBSZWdFeHApLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICAvLyBGSVhNRTogVGhpcyBsb29rcyBmbGlwcGVkIGNvbXBhcmVkIHRvIGZpbmRQcmV2aW91cy4gXG4gICAgICAgIHRoaXMuZmluZChuZWVkbGUsIHsgc2tpcEN1cnJlbnQ6IHRydWUsIGJhY2t3YXJkczogZmFsc2UgfSwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGVyZm9ybXMgYSBzZWFyY2ggZm9yIGBuZWVkbGVgIGJhY2t3YXJkcy4gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBzZWFyY2ggb3B0aW9uc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZSBzY3JvbGxpbmdcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yLmZpbmRcbiAgICAgKiovXG4gICAgZmluZFByZXZpb3VzKG5lZWRsZT86IChzdHJpbmcgfCBSZWdFeHApLCBhbmltYXRlPzogYm9vbGVhbikge1xuICAgICAgICB0aGlzLmZpbmQobmVlZGxlLCB7IHNraXBDdXJyZW50OiB0cnVlLCBiYWNrd2FyZHM6IHRydWUgfSwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgcmV2ZWFsUmFuZ2UocmFuZ2U6IFJhbmdlLCBhbmltYXRlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi51bmZvbGQocmFuZ2UpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9wO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3KHJhbmdlLnN0YXJ0LCByYW5nZS5lbmQsIDAuNSk7XG4gICAgICAgIGlmIChhbmltYXRlICE9PSBmYWxzZSlcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyhzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VW5kb01hbmFnZXIudW5kb31cbiAgICAgKiBAcmVsYXRlZCBVbmRvTWFuYWdlci51bmRvXG4gICAgICoqL1xuICAgIHVuZG8oKSB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVbmRvTWFuYWdlcigpLnVuZG8oKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VW5kb01hbmFnZXIucmVkb31cbiAgICAgKiBAcmVsYXRlZCBVbmRvTWFuYWdlci5yZWRvXG4gICAgICoqL1xuICAgIHJlZG8oKSB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVbmRvTWFuYWdlcigpLnJlZG8oKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogQ2xlYW5zIHVwIHRoZSBlbnRpcmUgZWRpdG9yLlxuICAgICAqKi9cbiAgICBkZXN0cm95KCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmRlc3Ryb3koKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiZGVzdHJveVwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIGF1dG9tYXRpYyBzY3JvbGxpbmcgb2YgdGhlIGN1cnNvciBpbnRvIHZpZXcgd2hlbiBlZGl0b3IgaXRzZWxmIGlzIGluc2lkZSBzY3JvbGxhYmxlIGVsZW1lbnRcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZSBkZWZhdWx0IHRydWVcbiAgICAgKiovXG4gICAgc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3KGVuYWJsZTogYm9vbGVhbikge1xuICAgICAgICBpZiAoIWVuYWJsZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIHJlY3Q7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdmFyIHNob3VsZFNjcm9sbCA9IGZhbHNlO1xuICAgICAgICBpZiAoIXRoaXMuJHNjcm9sbEFuY2hvcilcbiAgICAgICAgICAgIHRoaXMuJHNjcm9sbEFuY2hvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG4gICAgICAgIHZhciBzY3JvbGxBbmNob3IgPSB0aGlzLiRzY3JvbGxBbmNob3I7XG4gICAgICAgIHNjcm9sbEFuY2hvci5zdHlsZS5jc3NUZXh0ID0gXCJwb3NpdGlvbjphYnNvbHV0ZVwiO1xuICAgICAgICB0aGlzLmNvbnRhaW5lci5pbnNlcnRCZWZvcmUoc2Nyb2xsQW5jaG9yLCB0aGlzLmNvbnRhaW5lci5maXJzdENoaWxkKTtcbiAgICAgICAgdmFyIG9uQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5vbihcImNoYW5nZVNlbGVjdGlvblwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IHRydWU7XG4gICAgICAgIH0pO1xuICAgICAgICAvLyBuZWVkZWQgdG8gbm90IHRyaWdnZXIgc3luYyByZWZsb3dcbiAgICAgICAgdmFyIG9uQmVmb3JlUmVuZGVyID0gdGhpcy5yZW5kZXJlci5vbihcImJlZm9yZVJlbmRlclwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChzaG91bGRTY3JvbGwpXG4gICAgICAgICAgICAgICAgcmVjdCA9IHNlbGYucmVuZGVyZXIuY29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICB9KTtcbiAgICAgICAgdmFyIG9uQWZ0ZXJSZW5kZXIgPSB0aGlzLnJlbmRlcmVyLm9uKFwiYWZ0ZXJSZW5kZXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsICYmIHJlY3QgJiYgc2VsZi5pc0ZvY3VzZWQoKSkge1xuICAgICAgICAgICAgICAgIHZhciByZW5kZXJlciA9IHNlbGYucmVuZGVyZXI7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IHJlbmRlcmVyLiRjdXJzb3JMYXllci4kcGl4ZWxQb3M7XG4gICAgICAgICAgICAgICAgdmFyIGNvbmZpZyA9IHJlbmRlcmVyLmxheWVyQ29uZmlnO1xuICAgICAgICAgICAgICAgIHZhciB0b3AgPSBwb3MudG9wIC0gY29uZmlnLm9mZnNldDtcbiAgICAgICAgICAgICAgICBpZiAocG9zLnRvcCA+PSAwICYmIHRvcCArIHJlY3QudG9wIDwgMCkge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChwb3MudG9wIDwgY29uZmlnLmhlaWdodCAmJlxuICAgICAgICAgICAgICAgICAgICBwb3MudG9wICsgcmVjdC50b3AgKyBjb25maWcubGluZUhlaWdodCA+IHdpbmRvdy5pbm5lckhlaWdodCkge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChzaG91bGRTY3JvbGwgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUudG9wID0gdG9wICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUubGVmdCA9IHBvcy5sZWZ0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUuaGVpZ2h0ID0gY29uZmlnLmxpbmVIZWlnaHQgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbEFuY2hvci5zY3JvbGxJbnRvVmlldyhzaG91bGRTY3JvbGwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSByZWN0ID0gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3ID0gZnVuY3Rpb24oZW5hYmxlKSB7XG4gICAgICAgICAgICBpZiAoZW5hYmxlKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldztcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNlbGVjdGlvblwiLCBvbkNoYW5nZVNlbGVjdGlvbik7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJhZnRlclJlbmRlclwiLCBvbkFmdGVyUmVuZGVyKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImJlZm9yZVJlbmRlclwiLCBvbkJlZm9yZVJlbmRlcik7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHVibGljICRyZXNldEN1cnNvclN0eWxlKCkge1xuICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLiRjdXJzb3JTdHlsZSB8fCBcImFjZVwiO1xuICAgICAgICB2YXIgY3Vyc29yTGF5ZXIgPSB0aGlzLnJlbmRlcmVyLiRjdXJzb3JMYXllcjtcbiAgICAgICAgaWYgKCFjdXJzb3JMYXllcikge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGN1cnNvckxheWVyLnNldFNtb290aEJsaW5raW5nKC9zbW9vdGgvLnRlc3Qoc3R5bGUpKTtcbiAgICAgICAgY3Vyc29yTGF5ZXIuaXNCbGlua2luZyA9ICF0aGlzLiRyZWFkT25seSAmJiBzdHlsZSAhPSBcIndpZGVcIjtcbiAgICAgICAgc2V0Q3NzQ2xhc3MoY3Vyc29yTGF5ZXIuZWxlbWVudCwgXCJhY2Vfc2xpbS1jdXJzb3JzXCIsIC9zbGltLy50ZXN0KHN0eWxlKSk7XG4gICAgfVxufVxuXG5kZWZpbmVPcHRpb25zKEVkaXRvci5wcm90b3R5cGUsIFwiZWRpdG9yXCIsIHtcbiAgICBzZWxlY3Rpb25TdHlsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHN0eWxlKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogRWRpdG9yID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuJG9uU2VsZWN0aW9uQ2hhbmdlKHZvaWQgMCwgdGhhdC5zZWxlY3Rpb24pO1xuICAgICAgICAgICAgdGhhdC5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uU3R5bGVcIiwgeyBkYXRhOiBzdHlsZSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImxpbmVcIlxuICAgIH0sXG4gICAgaGlnaGxpZ2h0QWN0aXZlTGluZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogRWRpdG9yID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuJG9uU2VsZWN0aW9uQ2hhbmdlKHZvaWQgMCwgdGhhdC5zZWxlY3Rpb24pO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIHJlYWRPbmx5OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24ocmVhZE9ubHkpIHtcbiAgICAgICAgICAgIC8vIGRpc2FibGVkIHRvIG5vdCBicmVhayB2aW0gbW9kZSFcbiAgICAgICAgICAgIC8vIHRoaXMudGV4dElucHV0LnNldFJlYWRPbmx5KHJlYWRPbmx5KTtcbiAgICAgICAgICAgIHRoaXMuJHJlc2V0Q3Vyc29yU3R5bGUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgY3Vyc29yU3R5bGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBFZGl0b3IgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC4kcmVzZXRDdXJzb3JTdHlsZSgpO1xuICAgICAgICB9LFxuICAgICAgICB2YWx1ZXM6IFtcImFjZVwiLCBcInNsaW1cIiwgXCJzbW9vdGhcIiwgXCJ3aWRlXCJdLFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwiYWNlXCJcbiAgICB9LFxuICAgIG1lcmdlVW5kb0RlbHRhczoge1xuICAgICAgICB2YWx1ZXM6IFtmYWxzZSwgdHJ1ZSwgXCJhbHdheXNcIl0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgYmVoYXZpb3Vyc0VuYWJsZWQ6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgd3JhcEJlaGF2aW91cnNFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIGF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldzoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKGVuYWJsZTogYm9vbGVhbikge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyhlbmFibGUpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBcInJlbmRlcmVyXCIsXG4gICAgdlNjcm9sbEJhckFsd2F5c1Zpc2libGU6IFwicmVuZGVyZXJcIixcbiAgICBoaWdobGlnaHRHdXR0ZXJMaW5lOiBcInJlbmRlcmVyXCIsXG4gICAgYW5pbWF0ZWRTY3JvbGw6IFwicmVuZGVyZXJcIixcbiAgICBzaG93SW52aXNpYmxlczogXCJyZW5kZXJlclwiLFxuICAgIHNob3dQcmludE1hcmdpbjogXCJyZW5kZXJlclwiLFxuICAgIHByaW50TWFyZ2luQ29sdW1uOiBcInJlbmRlcmVyXCIsXG4gICAgcHJpbnRNYXJnaW46IFwicmVuZGVyZXJcIixcbiAgICBmYWRlRm9sZFdpZGdldHM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93Rm9sZFdpZGdldHM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93TGluZU51bWJlcnM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93R3V0dGVyOiBcInJlbmRlcmVyXCIsXG4gICAgZGlzcGxheUluZGVudEd1aWRlczogXCJyZW5kZXJlclwiLFxuICAgIGZvbnRTaXplOiBcInJlbmRlcmVyXCIsXG4gICAgZm9udEZhbWlseTogXCJyZW5kZXJlclwiLFxuICAgIG1heExpbmVzOiBcInJlbmRlcmVyXCIsXG4gICAgbWluTGluZXM6IFwicmVuZGVyZXJcIixcbiAgICBzY3JvbGxQYXN0RW5kOiBcInJlbmRlcmVyXCIsXG4gICAgZml4ZWRXaWR0aEd1dHRlcjogXCJyZW5kZXJlclwiLFxuICAgIHRoZW1lOiBcInJlbmRlcmVyXCIsXG5cbiAgICBzY3JvbGxTcGVlZDogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZHJhZ0RlbGF5OiBcIiRtb3VzZUhhbmRsZXJcIixcbiAgICBkcmFnRW5hYmxlZDogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZm9jdXNUaW1vdXQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIHRvb2x0aXBGb2xsb3dzTW91c2U6IFwiJG1vdXNlSGFuZGxlclwiLFxuXG4gICAgZmlyc3RMaW5lTnVtYmVyOiBcInNlc3Npb25cIixcbiAgICBvdmVyd3JpdGU6IFwic2Vzc2lvblwiLFxuICAgIG5ld0xpbmVNb2RlOiBcInNlc3Npb25cIixcbiAgICB1c2VXb3JrZXI6IFwic2Vzc2lvblwiLFxuICAgIHVzZVNvZnRUYWJzOiBcInNlc3Npb25cIixcbiAgICB0YWJTaXplOiBcInNlc3Npb25cIixcbiAgICB3cmFwOiBcInNlc3Npb25cIixcbiAgICBmb2xkU3R5bGU6IFwic2Vzc2lvblwiLFxuICAgIG1vZGU6IFwic2Vzc2lvblwiXG59KTtcblxuY2xhc3MgRm9sZEhhbmRsZXIge1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG5cbiAgICAgICAgLy8gVGhlIGZvbGxvd2luZyBoYW5kbGVyIGRldGVjdHMgY2xpY2tzIGluIHRoZSBlZGl0b3IgKG5vdCBndXR0ZXIpIHJlZ2lvblxuICAgICAgICAvLyB0byBkZXRlcm1pbmUgd2hldGhlciB0byByZW1vdmUgb3IgZXhwYW5kIGEgZm9sZC5cbiAgICAgICAgZWRpdG9yLm9uKFwiY2xpY2tcIiwgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5nZXRTZXNzaW9uKCk7XG5cbiAgICAgICAgICAgIC8vIElmIHRoZSB1c2VyIGNsaWNrZWQgb24gYSBmb2xkLCB0aGVuIGV4cGFuZCBpdC5cbiAgICAgICAgICAgIHZhciBmb2xkID0gc2Vzc2lvbi5nZXRGb2xkQXQocG9zaXRpb24ucm93LCBwb3NpdGlvbi5jb2x1bW4sIDEpO1xuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICBpZiAoZS5nZXRBY2NlbEtleSgpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb24uZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZS5zdG9wKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gVGhlIGZvbGxvd2luZyBoYW5kbGVyIGRldGVjdHMgY2xpY2tzIG9uIHRoZSBndXR0ZXIuXG4gICAgICAgIGVkaXRvci5vbignZ3V0dGVyY2xpY2snLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgZ3V0dGVyUmVnaW9uID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXJMYXllci5nZXRSZWdpb24oZSk7XG4gICAgICAgICAgICBpZiAoZ3V0dGVyUmVnaW9uID09PSAnZm9sZFdpZGdldHMnKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5nZXRTZXNzaW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHNlc3Npb25bJ2ZvbGRXaWRnZXRzJ10gJiYgc2Vzc2lvblsnZm9sZFdpZGdldHMnXVtyb3ddKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb25bJ29uRm9sZFdpZGdldENsaWNrJ10ocm93LCBlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFlZGl0b3IuaXNGb2N1c2VkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBlZGl0b3Iub24oJ2d1dHRlcmRibGNsaWNrJywgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXIuZ2V0UmVnaW9uKGUpO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyUmVnaW9uID09ICdmb2xkV2lkZ2V0cycpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm93ID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLmdldFNlc3Npb24oKTtcbiAgICAgICAgICAgICAgICB2YXIgZGF0YSA9IHNlc3Npb25bJ2dldFBhcmVudEZvbGRSYW5nZURhdGEnXShyb3csIHRydWUpO1xuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IGRhdGEucmFuZ2UgfHwgZGF0YS5maXJzdFJhbmdlO1xuXG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGQgPSBzZXNzaW9uLmdldEZvbGRBdChyb3csIHNlc3Npb24uZ2V0TGluZShyb3cpLmxlbmd0aCwgMSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlc3Npb25bJ2FkZEZvbGQnXShcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoeyByb3c6IHJhbmdlLnN0YXJ0LnJvdywgY29sdW1uOiAwIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59XG5cbmludGVyZmFjZSBJR2VzdHVyZUhhbmRsZXIge1xuICAgIGNhbmNlbENvbnRleHRNZW51KCk6IHZvaWQ7XG59XG5cbmNsYXNzIE1vdXNlSGFuZGxlciB7XG4gICAgcHVibGljIGVkaXRvcjogRWRpdG9yO1xuICAgIHByaXZhdGUgJHNjcm9sbFNwZWVkOiBudW1iZXIgPSAyO1xuICAgIHByaXZhdGUgJGRyYWdEZWxheTogbnVtYmVyID0gMDtcbiAgICBwcml2YXRlICRkcmFnRW5hYmxlZDogYm9vbGVhbiA9IHRydWU7XG4gICAgcHVibGljICRmb2N1c1RpbW91dDogbnVtYmVyID0gMDtcbiAgICBwdWJsaWMgJHRvb2x0aXBGb2xsb3dzTW91c2U6IGJvb2xlYW4gPSB0cnVlO1xuICAgIHByaXZhdGUgc3RhdGU6IHN0cmluZztcbiAgICBwcml2YXRlIGNsaWVudFg6IG51bWJlcjtcbiAgICBwcml2YXRlIGNsaWVudFk6IG51bWJlcjtcbiAgICBwdWJsaWMgaXNNb3VzZVByZXNzZWQ6IGJvb2xlYW47XG4gICAgLyoqXG4gICAgICogVGhlIGZ1bmN0aW9uIHRvIGNhbGwgdG8gcmVsZWFzZSBhIGNhcHR1cmVkIG1vdXNlLlxuICAgICAqL1xuICAgIHByaXZhdGUgcmVsZWFzZU1vdXNlOiAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHZvaWQ7XG4gICAgcHJpdmF0ZSBtb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50O1xuICAgIHB1YmxpYyBtb3VzZWRvd25FdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICBwcml2YXRlICRtb3VzZU1vdmVkO1xuICAgIHByaXZhdGUgJG9uQ2FwdHVyZU1vdXNlTW92ZTtcbiAgICBwdWJsaWMgJGNsaWNrU2VsZWN0aW9uOiBSYW5nZSA9IG51bGw7XG4gICAgcHVibGljICRsYXN0U2Nyb2xsVGltZTogbnVtYmVyO1xuICAgIHB1YmxpYyBzZWxlY3RCeUxpbmVzOiAoKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBzZWxlY3RCeVdvcmRzOiAoKSA9PiB2b2lkO1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIC8vIEZJWE1FOiBEaWQgSSBtZW50aW9uIHRoYXQgYHRoaXNgLCBgbmV3YCwgYGNsYXNzYCwgYGJpbmRgIGFyZSB0aGUgNCBob3JzZW1lbj9cbiAgICAgICAgLy8gRklYTUU6IEZ1bmN0aW9uIFNjb3BpbmcgaXMgdGhlIGFuc3dlci5cbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5lZGl0b3IgPSBlZGl0b3I7XG5cbiAgICAgICAgLy8gRklYTUU6IFdlIHNob3VsZCBiZSBjbGVhbmluZyB1cCB0aGVzZSBoYW5kbGVycyBpbiBhIGRpc3Bvc2UgbWV0aG9kLi4uXG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcignbW91c2Vkb3duJywgbWFrZU1vdXNlRG93bkhhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcignbW91c2V3aGVlbCcsIG1ha2VNb3VzZVdoZWVsSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwiZGJsY2xpY2tcIiwgbWFrZURvdWJsZUNsaWNrSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwidHJpcGxlY2xpY2tcIiwgbWFrZVRyaXBsZUNsaWNrSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwicXVhZGNsaWNrXCIsIG1ha2VRdWFkQ2xpY2tIYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuXG4gICAgICAgIHRoaXMuc2VsZWN0QnlMaW5lcyA9IG1ha2VFeHRlbmRTZWxlY3Rpb25CeShlZGl0b3IsIHRoaXMsIFwiZ2V0TGluZVJhbmdlXCIpO1xuICAgICAgICB0aGlzLnNlbGVjdEJ5V29yZHMgPSBtYWtlRXh0ZW5kU2VsZWN0aW9uQnkoZWRpdG9yLCB0aGlzLCBcImdldFdvcmRSYW5nZVwiKTtcblxuICAgICAgICBuZXcgR3V0dGVySGFuZGxlcih0aGlzKTtcbiAgICAgICAgLy8gICAgICBGSVhNRTogbmV3IERyYWdkcm9wSGFuZGxlcih0aGlzKTtcblxuICAgICAgICB2YXIgb25Nb3VzZURvd24gPSBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoIWVkaXRvci5pc0ZvY3VzZWQoKSAmJiBlZGl0b3IudGV4dElucHV0KSB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnRleHRJbnB1dC5tb3ZlVG9Nb3VzZShlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVkaXRvci5mb2N1cygpXG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIG1vdXNlVGFyZ2V0OiBIVE1MRGl2RWxlbWVudCA9IGVkaXRvci5yZW5kZXJlci5nZXRNb3VzZUV2ZW50VGFyZ2V0KCk7XG4gICAgICAgIGFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcImNsaWNrXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJjbGlja1wiKSk7XG4gICAgICAgIGFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcIm1vdXNlbW92ZVwiLCB0aGlzLm9uTW91c2VNb3ZlLmJpbmQodGhpcywgXCJtb3VzZW1vdmVcIikpO1xuICAgICAgICBhZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyKG1vdXNlVGFyZ2V0LCBbNDAwLCAzMDAsIDI1MF0sIHRoaXMsIFwib25Nb3VzZUV2ZW50XCIpO1xuICAgICAgICBpZiAoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYpIHtcbiAgICAgICAgICAgIGFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYuaW5uZXIsIFs0MDAsIDMwMCwgMjUwXSwgdGhpcywgXCJvbk1vdXNlRXZlbnRcIik7XG4gICAgICAgICAgICBhZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJILmlubmVyLCBbNDAwLCAzMDAsIDI1MF0sIHRoaXMsIFwib25Nb3VzZUV2ZW50XCIpO1xuICAgICAgICAgICAgaWYgKGlzSUUpIHtcbiAgICAgICAgICAgICAgICBhZGRMaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFyVi5lbGVtZW50LCBcIm1vdXNlZG93blwiLCBvbk1vdXNlRG93bik7XG4gICAgICAgICAgICAgICAgLy8gVE9ETzogSSB3b25kZXIgaWYgd2Ugc2hvdWxkIGJlIHJlc3BvbmRpbmcgdG8gbW91c2Vkb3duIChieSBzeW1tZXRyeSk/XG4gICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhckguZWxlbWVudCwgXCJtb3VzZW1vdmVcIiwgb25Nb3VzZURvd24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gV2UgaG9vayAnbW91c2V3aGVlbCcgdXNpbmcgdGhlIHBvcnRhYmxlIFxuICAgICAgICBhZGRNb3VzZVdoZWVsTGlzdGVuZXIoZWRpdG9yLmNvbnRhaW5lciwgdGhpcy5lbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50LmJpbmQodGhpcywgXCJtb3VzZXdoZWVsXCIpKTtcblxuICAgICAgICB2YXIgZ3V0dGVyRWwgPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlcjtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vkb3duXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJtb3VzZWRvd25cIikpO1xuICAgICAgICBhZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJjbGlja1wiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVyY2xpY2tcIikpO1xuICAgICAgICBhZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJkYmxjbGlja1wiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVyZGJsY2xpY2tcIikpO1xuICAgICAgICBhZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJtb3VzZW1vdmVcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcm1vdXNlbW92ZVwiKSk7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIobW91c2VUYXJnZXQsIFwibW91c2Vkb3duXCIsIG9uTW91c2VEb3duKTtcblxuICAgICAgICBhZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJtb3VzZWRvd25cIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICByZXR1cm4gcHJldmVudERlZmF1bHQoZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEhhbmRsZSBgbW91c2Vtb3ZlYCB3aGlsZSB0aGUgbW91c2UgaXMgb3ZlciB0aGUgZWRpdGluZyBhcmVhIChhbmQgbm90IHRoZSBndXR0ZXIpLlxuICAgICAgICBlZGl0b3Iub24oJ21vdXNlbW92ZScsIGZ1bmN0aW9uKGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIGlmIChfc2VsZi5zdGF0ZSB8fCBfc2VsZi4kZHJhZ0RlbGF5IHx8ICFfc2VsZi4kZHJhZ0VuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBGSVhNRTogUHJvYmFibHkgcy9iIGNsaWVudFhZXG4gICAgICAgICAgICB2YXIgY2hhciA9IGVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyhlLngsIGUueSk7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3IuZ2V0U2Vzc2lvbigpLmdldFNlbGVjdGlvbigpLmdldFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgcmVuZGVyZXIgPSBlZGl0b3IucmVuZGVyZXI7XG5cbiAgICAgICAgICAgIGlmICghcmFuZ2UuaXNFbXB0eSgpICYmIHJhbmdlLmluc2lkZVN0YXJ0KGNoYXIucm93LCBjaGFyLmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICByZW5kZXJlci5zZXRDdXJzb3JTdHlsZSgnZGVmYXVsdCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuc2V0Q3Vyc29yU3R5bGUoXCJcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIG9uTW91c2VFdmVudChuYW1lOiBzdHJpbmcsIGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbmV3IEVkaXRvck1vdXNlRXZlbnQoZSwgdGhpcy5lZGl0b3IpKTtcbiAgICB9XG5cbiAgICBvbk1vdXNlTW92ZShuYW1lOiBzdHJpbmcsIGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgLy8gSWYgbm9ib2R5IGlzIGxpc3RlbmluZywgYXZvaWQgdGhlIGNyZWF0aW9uIG9mIHRoZSB0ZW1wb3Jhcnkgd3JhcHBlci5cbiAgICAgICAgLy8gb3B0aW1pemF0aW9uLCBiZWNhdXNlIG1vdXNlbW92ZSBkb2Vzbid0IGhhdmUgYSBkZWZhdWx0IGhhbmRsZXIuXG4gICAgICAgIGlmICh0aGlzLmVkaXRvci5oYXNMaXN0ZW5lcnMoJ21vdXNlbW92ZScpKSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5fZW1pdChuYW1lLCBuZXcgRWRpdG9yTW91c2VFdmVudChlLCB0aGlzLmVkaXRvcikpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudChuYW1lOiBzdHJpbmcsIGU6IE1vdXNlV2hlZWxFdmVudCkge1xuICAgICAgICB2YXIgbW91c2VFdmVudCA9IG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKTtcbiAgICAgICAgbW91c2VFdmVudC5zcGVlZCA9IHRoaXMuJHNjcm9sbFNwZWVkICogMjtcbiAgICAgICAgbW91c2VFdmVudC53aGVlbFggPSBlWyd3aGVlbFgnXTtcbiAgICAgICAgbW91c2VFdmVudC53aGVlbFkgPSBlWyd3aGVlbFknXTtcbiAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbW91c2VFdmVudCk7XG4gICAgfVxuXG4gICAgc2V0U3RhdGUoc3RhdGU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnN0YXRlID0gc3RhdGU7XG4gICAgfVxuXG4gICAgdGV4dENvb3JkaW5hdGVzKCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgIH1cblxuICAgIGNhcHR1cmVNb3VzZShldjogRWRpdG9yTW91c2VFdmVudCwgbW91c2VNb3ZlSGFuZGxlcj86IChtb3VzZUV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkKSB7XG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGV2LmNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGV2LmNsaWVudFk7XG5cbiAgICAgICAgdGhpcy5pc01vdXNlUHJlc3NlZCA9IHRydWU7XG5cbiAgICAgICAgLy8gZG8gbm90IG1vdmUgdGV4dGFyZWEgZHVyaW5nIHNlbGVjdGlvblxuICAgICAgICB2YXIgcmVuZGVyZXIgPSB0aGlzLmVkaXRvci5yZW5kZXJlcjtcbiAgICAgICAgaWYgKHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvcikge1xuICAgICAgICAgICAgcmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvbk1vdXNlTW92ZSA9IChmdW5jdGlvbihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihtb3VzZUV2ZW50OiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFtb3VzZUV2ZW50KSByZXR1cm47XG4gICAgICAgICAgICAgICAgLy8gaWYgZWRpdG9yIGlzIGxvYWRlZCBpbnNpZGUgaWZyYW1lLCBhbmQgbW91c2V1cCBldmVudCBpcyBvdXRzaWRlXG4gICAgICAgICAgICAgICAgLy8gd2Ugd29uJ3QgcmVjaWV2ZSBpdCwgc28gd2UgY2FuY2VsIG9uIGZpcnN0IG1vdXNlbW92ZSB3aXRob3V0IGJ1dHRvblxuICAgICAgICAgICAgICAgIGlmIChpc1dlYktpdCAmJiAhbW91c2VFdmVudC53aGljaCAmJiBtb3VzZUhhbmRsZXIucmVsZWFzZU1vdXNlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFRPRE86IEZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBJJ20gcGFzc2luZyB1bmRlZmluZWQsXG4gICAgICAgICAgICAgICAgICAgIC8vIGJ1dCBpdCB3b3VsZCBwcm9iYWJseSBtYWtlIG1vcmUgc2Vuc2UgdG8gcGFzcyB0aGUgbW91c2UgZXZlbnRcbiAgICAgICAgICAgICAgICAgICAgLy8gc2luY2UgdGhhdCBpcyB0aGUgZmluYWwgZXZlbnQuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtb3VzZUhhbmRsZXIucmVsZWFzZU1vdXNlKHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNsaWVudFggPSBtb3VzZUV2ZW50LmNsaWVudFg7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNsaWVudFkgPSBtb3VzZUV2ZW50LmNsaWVudFk7XG4gICAgICAgICAgICAgICAgbW91c2VNb3ZlSGFuZGxlciAmJiBtb3VzZU1vdmVIYW5kbGVyKG1vdXNlRXZlbnQpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5tb3VzZUV2ZW50ID0gbmV3IEVkaXRvck1vdXNlRXZlbnQobW91c2VFdmVudCwgZWRpdG9yKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJG1vdXNlTW92ZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSh0aGlzLmVkaXRvciwgdGhpcyk7XG5cbiAgICAgICAgdmFyIG9uQ2FwdHVyZUVuZCA9IChmdW5jdGlvbihtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHRpbWVySWQpO1xuICAgICAgICAgICAgICAgIG9uQ2FwdHVyZUludGVydmFsKCk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZSArIFwiRW5kXCJdICYmIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGUgKyBcIkVuZFwiXShlKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuc3RhdGUgPSBcIlwiO1xuICAgICAgICAgICAgICAgIGlmIChyZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICByZW5kZXJlci4kbW92ZVRleHRBcmVhVG9DdXJzb3IoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmlzTW91c2VQcmVzc2VkID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRvbkNhcHR1cmVNb3VzZU1vdmUgPSBtb3VzZUhhbmRsZXIucmVsZWFzZU1vdXNlID0gbnVsbDtcbiAgICAgICAgICAgICAgICBlICYmIG1vdXNlSGFuZGxlci5vbk1vdXNlRXZlbnQoXCJtb3VzZXVwXCIsIGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSh0aGlzKTtcblxuICAgICAgICB2YXIgb25DYXB0dXJlSW50ZXJ2YWwgPSAoZnVuY3Rpb24obW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlXSAmJiBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlXSgpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbW91c2VNb3ZlZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KSh0aGlzKTtcblxuICAgICAgICBpZiAoaXNPbGRJRSAmJiBldi5kb21FdmVudC50eXBlID09IFwiZGJsY2xpY2tcIikge1xuICAgICAgICAgICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IG9uQ2FwdHVyZUVuZChldik7IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kb25DYXB0dXJlTW91c2VNb3ZlID0gb25Nb3VzZU1vdmU7XG4gICAgICAgIHRoaXMucmVsZWFzZU1vdXNlID0gY2FwdHVyZSh0aGlzLmVkaXRvci5jb250YWluZXIsIG9uTW91c2VNb3ZlLCBvbkNhcHR1cmVFbmQpO1xuICAgICAgICB2YXIgdGltZXJJZCA9IHNldEludGVydmFsKG9uQ2FwdHVyZUludGVydmFsLCAyMCk7XG4gICAgfVxuXG4gICAgY2FuY2VsQ29udGV4dE1lbnUoKTogdm9pZCB7XG4gICAgICAgIHZhciBzdG9wID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKGUgJiYgZS5kb21FdmVudCAmJiBlLmRvbUV2ZW50LnR5cGUgIT0gXCJjb250ZXh0bWVudVwiKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lZGl0b3Iub2ZmKFwibmF0aXZlY29udGV4dG1lbnVcIiwgc3RvcCk7XG4gICAgICAgICAgICBpZiAoZSAmJiBlLmRvbUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgc3RvcEV2ZW50KGUuZG9tRXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmJpbmQodGhpcyk7XG4gICAgICAgIHNldFRpbWVvdXQoc3RvcCwgMTApO1xuICAgICAgICB0aGlzLmVkaXRvci5vbihcIm5hdGl2ZWNvbnRleHRtZW51XCIsIHN0b3ApO1xuICAgIH1cblxuICAgIHNlbGVjdCgpIHtcbiAgICAgICAgdmFyIGFuY2hvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcblxuICAgICAgICBpZiAodGhpcy4kY2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHZhciBjbXAgPSB0aGlzLiRjbGlja1NlbGVjdGlvbi5jb21wYXJlUG9pbnQoY3Vyc29yKTtcblxuICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLmVuZDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY21wID09IDEpIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSB0aGlzLiRjbGlja1NlbGVjdGlvbi5zdGFydDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGVkUmFuZ2UgPSBjYWxjUmFuZ2VPcmllbnRhdGlvbih0aGlzLiRjbGlja1NlbGVjdGlvbiwgY3Vyc29yKTtcbiAgICAgICAgICAgICAgICBjdXJzb3IgPSBvcmllbnRlZFJhbmdlLmN1cnNvcjtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBvcmllbnRlZFJhbmdlLmFuY2hvcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24oY3Vyc29yKTtcblxuICAgICAgICB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgIH1cblxuICAgIHNlbGVjdEJ5TGluZXNFbmQoKSB7XG4gICAgICAgIHRoaXMuJGNsaWNrU2VsZWN0aW9uID0gbnVsbDtcbiAgICAgICAgdGhpcy5lZGl0b3IudW5zZXRTdHlsZShcImFjZV9zZWxlY3RpbmdcIik7XG4gICAgICAgIGlmICh0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlclsncmVsZWFzZUNhcHR1cmUnXSkge1xuICAgICAgICAgICAgdGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsZXJbJ3JlbGVhc2VDYXB0dXJlJ10oKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0U2VsZWN0KHBvczogUG9zaXRpb24sIHdhaXRGb3JDbGlja1NlbGVjdGlvbj86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgcG9zID0gcG9zIHx8IHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICAgICAgdmFyIGVkaXRvciA9IHRoaXMuZWRpdG9yO1xuICAgICAgICAvLyBhbGxvdyBkb3VibGUvdHJpcGxlIGNsaWNrIGhhbmRsZXJzIHRvIGNoYW5nZSBzZWxlY3Rpb25cbiAgICBcbiAgICAgICAgaWYgKHRoaXMubW91c2Vkb3duRXZlbnQuZ2V0U2hpZnRLZXkoKSkge1xuICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uKHBvcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXdhaXRGb3JDbGlja1NlbGVjdGlvbikge1xuICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbihwb3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0KCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsZXJbJ3NldENhcHR1cmUnXSkge1xuICAgICAgICAgICAgdGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsZXJbJ3NldENhcHR1cmUnXSgpO1xuICAgICAgICB9XG4gICAgICAgIGVkaXRvci5zZXRTdHlsZShcImFjZV9zZWxlY3RpbmdcIik7XG4gICAgICAgIHRoaXMuc2V0U3RhdGUoXCJzZWxlY3RcIik7XG4gICAgfVxuXG4gICAgc2VsZWN0RW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBzZWxlY3RBbGxFbmQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0QnlMaW5lc0VuZCgpO1xuICAgIH1cblxuICAgIHNlbGVjdEJ5V29yZHNFbmQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0QnlMaW5lc0VuZCgpO1xuICAgIH1cblxuICAgIGZvY3VzV2FpdCgpIHtcbiAgICAgICAgdmFyIGRpc3RhbmNlID0gY2FsY0Rpc3RhbmNlKHRoaXMubW91c2Vkb3duRXZlbnQuY2xpZW50WCwgdGhpcy5tb3VzZWRvd25FdmVudC5jbGllbnRZLCB0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgICAgIHZhciB0aW1lID0gRGF0ZS5ub3coKTtcblxuICAgICAgICBpZiAoZGlzdGFuY2UgPiBEUkFHX09GRlNFVCB8fCB0aW1lIC0gdGhpcy5tb3VzZWRvd25FdmVudC50aW1lID4gdGhpcy4kZm9jdXNUaW1vdXQpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRTZWxlY3QodGhpcy5tb3VzZWRvd25FdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCkpO1xuICAgICAgICB9XG4gICAgfVxuXG59XG5cbmRlZmluZU9wdGlvbnMoTW91c2VIYW5kbGVyLnByb3RvdHlwZSwgXCJtb3VzZUhhbmRsZXJcIiwge1xuICAgIHNjcm9sbFNwZWVkOiB7IGluaXRpYWxWYWx1ZTogMiB9LFxuICAgIGRyYWdEZWxheTogeyBpbml0aWFsVmFsdWU6IChpc01hYyA/IDE1MCA6IDApIH0sXG4gICAgZHJhZ0VuYWJsZWQ6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgZm9jdXNUaW1vdXQ6IHsgaW5pdGlhbFZhbHVlOiAwIH0sXG4gICAgdG9vbHRpcEZvbGxvd3NNb3VzZTogeyBpbml0aWFsVmFsdWU6IHRydWUgfVxufSk7XG5cbi8qXG4gKiBDdXN0b20gQWNlIG1vdXNlIGV2ZW50XG4gKi9cbmNsYXNzIEVkaXRvck1vdXNlRXZlbnQge1xuICAgIC8vIFdlIGtlZXAgdGhlIG9yaWdpbmFsIERPTSBldmVudFxuICAgIHB1YmxpYyBkb21FdmVudDogTW91c2VFdmVudDtcbiAgICBwcml2YXRlIGVkaXRvcjogRWRpdG9yO1xuICAgIHB1YmxpYyBjbGllbnRYOiBudW1iZXI7XG4gICAgcHVibGljIGNsaWVudFk6IG51bWJlcjtcbiAgICAvKipcbiAgICAgKiBDYWNoZWQgdGV4dCBjb29yZGluYXRlcyBmb2xsb3dpbmcgZ2V0RG9jdW1lbnRQb3NpdGlvbigpXG4gICAgICovXG4gICAgcHJpdmF0ZSAkcG9zOiBQb3NpdGlvbjtcbiAgICBwcml2YXRlICRpblNlbGVjdGlvbjtcbiAgICBwcml2YXRlIHByb3BhZ2F0aW9uU3RvcHBlZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGVmYXVsdFByZXZlbnRlZCA9IGZhbHNlO1xuICAgIHB1YmxpYyB0aW1lOiBudW1iZXI7XG4gICAgLy8gd2hlZWxZLCB3aGVlbFkgYW5kIHNwZWVkIGFyZSBmb3IgJ21vdXNld2hlZWwnIGV2ZW50cy5cbiAgICBwdWJsaWMgd2hlZWxYOiBudW1iZXI7XG4gICAgcHVibGljIHdoZWVsWTogbnVtYmVyO1xuICAgIHB1YmxpYyBzcGVlZDogbnVtYmVyO1xuICAgIGNvbnN0cnVjdG9yKGRvbUV2ZW50OiBNb3VzZUV2ZW50LCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB0aGlzLmRvbUV2ZW50ID0gZG9tRXZlbnQ7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGRvbUV2ZW50LmNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGRvbUV2ZW50LmNsaWVudFk7XG5cbiAgICAgICAgdGhpcy4kcG9zID0gbnVsbDtcbiAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBudWxsO1xuICAgIH1cblxuICAgIGdldCB0b0VsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvbUV2ZW50LnRvRWxlbWVudDtcbiAgICB9XG5cbiAgICBzdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgICAgIHN0b3BQcm9wYWdhdGlvbih0aGlzLmRvbUV2ZW50KTtcbiAgICAgICAgdGhpcy5wcm9wYWdhdGlvblN0b3BwZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIHByZXZlbnREZWZhdWx0KCkge1xuICAgICAgICBwcmV2ZW50RGVmYXVsdCh0aGlzLmRvbUV2ZW50KTtcbiAgICAgICAgdGhpcy5kZWZhdWx0UHJldmVudGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBzdG9wKCkge1xuICAgICAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICB0aGlzLnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBHZXQgdGhlIGRvY3VtZW50IHBvc2l0aW9uIGJlbG93IHRoZSBtb3VzZSBjdXJzb3JcbiAgICAgKiBcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9ICdyb3cnIGFuZCAnY29sdW1uJyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb25cbiAgICAgKi9cbiAgICBnZXREb2N1bWVudFBvc2l0aW9uKCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICBpZiAoIXRoaXMuJHBvcykge1xuICAgICAgICAgICAgdGhpcy4kcG9zID0gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLiRwb3M7XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogQ2hlY2sgaWYgdGhlIG1vdXNlIGN1cnNvciBpcyBpbnNpZGUgb2YgdGhlIHRleHQgc2VsZWN0aW9uXG4gICAgICogXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gd2hldGhlciB0aGUgbW91c2UgY3Vyc29yIGlzIGluc2lkZSBvZiB0aGUgc2VsZWN0aW9uXG4gICAgICovXG4gICAgaW5TZWxlY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLiRpblNlbGVjdGlvbiAhPT0gbnVsbClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRpblNlbGVjdGlvbjtcblxuICAgICAgICB2YXIgZWRpdG9yID0gdGhpcy5lZGl0b3I7XG5cblxuICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHNlbGVjdGlvblJhbmdlLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gZmFsc2U7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBzZWxlY3Rpb25SYW5nZS5jb250YWlucyhwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLiRpblNlbGVjdGlvbjtcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBHZXQgdGhlIGNsaWNrZWQgbW91c2UgYnV0dG9uXG4gICAgICogXG4gICAgICogQHJldHVybiB7TnVtYmVyfSAwIGZvciBsZWZ0IGJ1dHRvbiwgMSBmb3IgbWlkZGxlIGJ1dHRvbiwgMiBmb3IgcmlnaHQgYnV0dG9uXG4gICAgICovXG4gICAgZ2V0QnV0dG9uKCkge1xuICAgICAgICByZXR1cm4gZ2V0QnV0dG9uKHRoaXMuZG9tRXZlbnQpO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhlIHNoaWZ0IGtleSB3YXMgcHJlc3NlZCB3aGVuIHRoZSBldmVudCB3YXMgZW1pdHRlZFxuICAgICAqL1xuICAgIGdldFNoaWZ0S2V5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb21FdmVudC5zaGlmdEtleTtcbiAgICB9XG5cbiAgICBnZXRBY2NlbEtleSA9IGlzTWFjID8gZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvbUV2ZW50Lm1ldGFLZXk7IH0gOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZG9tRXZlbnQuY3RybEtleTsgfTtcbn1cblxudmFyIERSQUdfT0ZGU0VUID0gMDsgLy8gcGl4ZWxzXG5cbmZ1bmN0aW9uIG1ha2VNb3VzZURvd25IYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihldjogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgaW5TZWxlY3Rpb24gPSBldi5pblNlbGVjdGlvbigpO1xuICAgICAgICB2YXIgcG9zID0gZXYuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICBtb3VzZUhhbmRsZXIubW91c2Vkb3duRXZlbnQgPSBldjtcblxuICAgICAgICB2YXIgYnV0dG9uID0gZXYuZ2V0QnV0dG9uKCk7XG4gICAgICAgIGlmIChidXR0b24gIT09IDApIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25SYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVtcHR5ID0gc2VsZWN0aW9uUmFuZ2UuaXNFbXB0eSgpO1xuXG4gICAgICAgICAgICBpZiAoc2VsZWN0aW9uRW1wdHkpXG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbihwb3MpO1xuXG4gICAgICAgICAgICAvLyAyOiBjb250ZXh0bWVudSwgMTogbGludXggcGFzdGVcbiAgICAgICAgICAgIGVkaXRvci50ZXh0SW5wdXQub25Db250ZXh0TWVudShldi5kb21FdmVudCk7XG4gICAgICAgICAgICByZXR1cm47IC8vIHN0b3BwaW5nIGV2ZW50IGhlcmUgYnJlYWtzIGNvbnRleHRtZW51IG9uIGZmIG1hY1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlZG93bkV2ZW50LnRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICAvLyBpZiB0aGlzIGNsaWNrIGNhdXNlZCB0aGUgZWRpdG9yIHRvIGJlIGZvY3VzZWQgc2hvdWxkIG5vdCBjbGVhciB0aGVcbiAgICAgICAgLy8gc2VsZWN0aW9uXG4gICAgICAgIGlmIChpblNlbGVjdGlvbiAmJiAhZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKTtcbiAgICAgICAgICAgIGlmIChtb3VzZUhhbmRsZXIuJGZvY3VzVGltb3V0ICYmICFtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uICYmICFlZGl0b3IuaW5NdWx0aVNlbGVjdE1vZGUpIHtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJmb2N1c1dhaXRcIik7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShldik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShldik7XG4gICAgICAgIC8vIFRPRE86IF9jbGlja3MgaXMgYSBjdXN0b20gcHJvcGVydHkgYWRkZWQgaW4gZXZlbnQudHMgYnkgdGhlICdtb3VzZWRvd24nIGxpc3RlbmVyLlxuICAgICAgICBtb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QocG9zLCBldi5kb21FdmVudFsnX2NsaWNrcyddID4gMSk7XG4gICAgICAgIHJldHVybiBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZU1vdXNlV2hlZWxIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihldjogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICBpZiAoZXYuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9zaGlmdCB3aGVlbCB0byBob3JpeiBzY3JvbGxcbiAgICAgICAgaWYgKGV2LmdldFNoaWZ0S2V5KCkgJiYgZXYud2hlZWxZICYmICFldi53aGVlbFgpIHtcbiAgICAgICAgICAgIGV2LndoZWVsWCA9IGV2LndoZWVsWTtcbiAgICAgICAgICAgIGV2LndoZWVsWSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdCA9IGV2LmRvbUV2ZW50LnRpbWVTdGFtcDtcbiAgICAgICAgdmFyIGR0ID0gdCAtIChtb3VzZUhhbmRsZXIuJGxhc3RTY3JvbGxUaW1lIHx8IDApO1xuXG4gICAgICAgIHZhciBpc1Njcm9sYWJsZSA9IGVkaXRvci5yZW5kZXJlci5pc1Njcm9sbGFibGVCeShldi53aGVlbFggKiBldi5zcGVlZCwgZXYud2hlZWxZICogZXYuc3BlZWQpO1xuICAgICAgICBpZiAoaXNTY3JvbGFibGUgfHwgZHQgPCAyMDApIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbGFzdFNjcm9sbFRpbWUgPSB0O1xuICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJ5KGV2LndoZWVsWCAqIGV2LnNwZWVkLCBldi53aGVlbFkgKiBldi5zcGVlZCk7XG4gICAgICAgICAgICByZXR1cm4gZXYuc3RvcCgpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlRG91YmxlQ2xpY2tIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihlZGl0b3JNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgIHZhciBwb3MgPSBlZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKHBvcyk7XG4gICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbi0tO1xuICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4rKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdFwiKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRXb3JkUmFuZ2UocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RCeVdvcmRzXCIpO1xuICAgICAgICB9XG4gICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSByYW5nZTtcbiAgICAgICAgbW91c2VIYW5kbGVyLnNlbGVjdCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZVRyaXBsZUNsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgcG9zID0gZWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlMaW5lc1wiKTtcbiAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChyYW5nZS5pc011bHRpTGluZSgpICYmIHJhbmdlLmNvbnRhaW5zKHBvcy5yb3csIHBvcy5jb2x1bW4pKSB7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRMaW5lUmFuZ2UocmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uZW5kID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRMaW5lUmFuZ2UocmFuZ2UuZW5kLnJvdykuZW5kO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHBvcy5yb3cpO1xuICAgICAgICB9XG4gICAgICAgIG1vdXNlSGFuZGxlci5zZWxlY3QoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VRdWFkQ2xpY2tIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihlZGl0b3JNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgIGVkaXRvci5zZWxlY3RBbGwoKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RBbGxcIik7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlRXh0ZW5kU2VsZWN0aW9uQnkoZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyLCB1bml0TmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYW5jaG9yO1xuICAgICAgICB2YXIgY3Vyc29yID0gbW91c2VIYW5kbGVyLnRleHRDb29yZGluYXRlcygpO1xuICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3Iuc2VsZWN0aW9uW3VuaXROYW1lXShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICBpZiAobW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbikge1xuICAgICAgICAgICAgdmFyIGNtcFN0YXJ0ID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5jb21wYXJlUG9pbnQocmFuZ2Uuc3RhcnQpO1xuICAgICAgICAgICAgdmFyIGNtcEVuZCA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uY29tcGFyZVBvaW50KHJhbmdlLmVuZCk7XG5cbiAgICAgICAgICAgIGlmIChjbXBTdGFydCA9PSAtMSAmJiBjbXBFbmQgPD0gMCkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uZW5kO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5lbmQucm93ICE9IGN1cnNvci5yb3cgfHwgcmFuZ2UuZW5kLmNvbHVtbiAhPSBjdXJzb3IuY29sdW1uKVxuICAgICAgICAgICAgICAgICAgICBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcEVuZCA9PSAxICYmIGNtcFN0YXJ0ID49IDApIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgIT0gY3Vyc29yLnJvdyB8fCByYW5nZS5zdGFydC5jb2x1bW4gIT0gY3Vyc29yLmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wU3RhcnQgPT0gLTEgJiYgY21wRW5kID09IDEpIHtcbiAgICAgICAgICAgICAgICBjdXJzb3IgPSByYW5nZS5lbmQ7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50ZWRSYW5nZSA9IGNhbGNSYW5nZU9yaWVudGF0aW9uKG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24sIGN1cnNvcik7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gb3JpZW50ZWRSYW5nZS5jdXJzb3I7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gb3JpZW50ZWRSYW5nZS5hbmNob3I7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLnNldFNlbGVjdGlvbkFuY2hvcihhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBlZGl0b3Iuc2VsZWN0aW9uLnNlbGVjdFRvUG9zaXRpb24oY3Vyc29yKTtcblxuICAgICAgICBlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNhbGNEaXN0YW5jZShheDogbnVtYmVyLCBheTogbnVtYmVyLCBieDogbnVtYmVyLCBieTogbnVtYmVyKSB7XG4gICAgcmV0dXJuIE1hdGguc3FydChNYXRoLnBvdyhieCAtIGF4LCAyKSArIE1hdGgucG93KGJ5IC0gYXksIDIpKTtcbn1cblxuZnVuY3Rpb24gY2FsY1JhbmdlT3JpZW50YXRpb24ocmFuZ2U6IFJhbmdlLCBjdXJzb3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0pOiB7IGN1cnNvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTsgYW5jaG9yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IH0ge1xuICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICB2YXIgY21wID0gMiAqIGN1cnNvci5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW4gLSByYW5nZS5lbmQuY29sdW1uO1xuICAgIH1cbiAgICBlbHNlIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdyAtIDEgJiYgIXJhbmdlLnN0YXJ0LmNvbHVtbiAmJiAhcmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICB2YXIgY21wID0gY3Vyc29yLmNvbHVtbiAtIDQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIgY21wID0gMiAqIGN1cnNvci5yb3cgLSByYW5nZS5zdGFydC5yb3cgLSByYW5nZS5lbmQucm93O1xuICAgIH1cblxuICAgIGlmIChjbXAgPCAwKSB7XG4gICAgICAgIHJldHVybiB7IGN1cnNvcjogcmFuZ2Uuc3RhcnQsIGFuY2hvcjogcmFuZ2UuZW5kIH07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4geyBjdXJzb3I6IHJhbmdlLmVuZCwgYW5jaG9yOiByYW5nZS5zdGFydCB9O1xuICAgIH1cbn1cblxuY2xhc3MgR3V0dGVySGFuZGxlciB7XG4gICAgY29uc3RydWN0b3IobW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgdmFyIGVkaXRvcjogRWRpdG9yID0gbW91c2VIYW5kbGVyLmVkaXRvcjtcbiAgICAgICAgdmFyIGd1dHRlcjogR3V0dGVyID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXJMYXllcjtcbiAgICAgICAgdmFyIHRvb2x0aXAgPSBuZXcgR3V0dGVyVG9vbHRpcChlZGl0b3IuY29udGFpbmVyKTtcblxuICAgICAgICBtb3VzZUhhbmRsZXIuZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwiZ3V0dGVybW91c2Vkb3duXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpIHx8IGUuZ2V0QnV0dG9uKCkgIT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGd1dHRlci5nZXRSZWdpb24oZSk7XG5cbiAgICAgICAgICAgIGlmIChndXR0ZXJSZWdpb24gPT09IFwiZm9sZFdpZGdldHNcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpLmdldFNlbGVjdGlvbigpO1xuXG4gICAgICAgICAgICBpZiAoZS5nZXRTaGlmdEtleSgpKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uLnNlbGVjdFRvKHJvdywgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoZS5kb21FdmVudC5kZXRhaWwgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlMaW5lc1wiKTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZSk7XG4gICAgICAgICAgICByZXR1cm4gZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9KTtcblxuXG4gICAgICAgIHZhciB0b29sdGlwVGltZW91dDogbnVtYmVyO1xuICAgICAgICB2YXIgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICAgICAgdmFyIHRvb2x0aXBBbm5vdGF0aW9uO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNob3dUb29sdGlwKCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IG1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBhbm5vdGF0aW9uID0gZ3V0dGVyLiRhbm5vdGF0aW9uc1tyb3ddO1xuICAgICAgICAgICAgaWYgKCFhbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuICAgICAgICAgICAgdmFyIG1heFJvdyA9IHNlc3Npb24uZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICBpZiAocm93ID09IG1heFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzY3JlZW5Sb3cgPSBlZGl0b3IucmVuZGVyZXIucGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzKDAsIG1vdXNlRXZlbnQuY2xpZW50WSkucm93O1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSBtb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAoc2NyZWVuUm93ID4gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KHBvcy5yb3csIHBvcy5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodG9vbHRpcEFubm90YXRpb24gPT0gYW5ub3RhdGlvbikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRvb2x0aXBBbm5vdGF0aW9uID0gYW5ub3RhdGlvbi50ZXh0LmpvaW4oXCI8YnIvPlwiKTtcblxuICAgICAgICAgICAgdG9vbHRpcC5zZXRIdG1sKHRvb2x0aXBBbm5vdGF0aW9uKTtcblxuICAgICAgICAgICAgdG9vbHRpcC5zaG93KCk7XG5cbiAgICAgICAgICAgIGVkaXRvci5vbihcIm1vdXNld2hlZWxcIiwgaGlkZVRvb2x0aXApO1xuXG4gICAgICAgICAgICBpZiAobW91c2VIYW5kbGVyLiR0b29sdGlwRm9sbG93c01vdXNlKSB7XG4gICAgICAgICAgICAgICAgbW92ZVRvb2x0aXAobW91c2VFdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZ3V0dGVyRWxlbWVudCA9IGd1dHRlci4kY2VsbHNbZWRpdG9yLmdldFNlc3Npb24oKS5kb2N1bWVudFRvU2NyZWVuUm93KHJvdywgMCldLmVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgdmFyIHJlY3QgPSBndXR0ZXJFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgICAgIHZhciBzdHlsZSA9IHRvb2x0aXAuZ2V0RWxlbWVudCgpLnN0eWxlO1xuICAgICAgICAgICAgICAgIHN0eWxlLmxlZnQgPSByZWN0LnJpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgIHN0eWxlLnRvcCA9IHJlY3QuYm90dG9tICsgXCJweFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaGlkZVRvb2x0aXAoZXZlbnQsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgICAgICBpZiAodG9vbHRpcFRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodG9vbHRpcFRpbWVvdXQpO1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcC5oaWRlKCk7XG4gICAgICAgICAgICAgICAgdG9vbHRpcEFubm90YXRpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGVkaXRvci5vZmYoXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG1vdmVUb29sdGlwKGV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICB0b29sdGlwLnNldFBvc2l0aW9uKGV2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlbW92ZVwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogT2JmdXNjYXRpbmcgdGhlIHR5cGUgb2YgdGFyZ2V0IHRvIHRod2FydCBjb21waWxlci5cbiAgICAgICAgICAgIHZhciB0YXJnZXQ6IGFueSA9IGUuZG9tRXZlbnQudGFyZ2V0IHx8IGUuZG9tRXZlbnQuc3JjRWxlbWVudDtcbiAgICAgICAgICAgIGlmIChoYXNDc3NDbGFzcyh0YXJnZXQsIFwiYWNlX2ZvbGQtd2lkZ2V0XCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uICYmIG1vdXNlSGFuZGxlci4kdG9vbHRpcEZvbGxvd3NNb3VzZSkge1xuICAgICAgICAgICAgICAgIG1vdmVUb29sdGlwKGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtb3VzZUV2ZW50ID0gZTtcbiAgICAgICAgICAgIGlmICh0b29sdGlwVGltZW91dCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKG1vdXNlRXZlbnQgJiYgIW1vdXNlSGFuZGxlci5pc01vdXNlUHJlc3NlZClcbiAgICAgICAgICAgICAgICAgICAgc2hvd1Rvb2x0aXAoKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH0sIDUwKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXIsIFwibW91c2VvdXRcIiwgZnVuY3Rpb24oZTogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgbW91c2VFdmVudCA9IG51bGw7XG4gICAgICAgICAgICBpZiAoIXRvb2x0aXBBbm5vdGF0aW9uIHx8IHRvb2x0aXBUaW1lb3V0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICB9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGVkaXRvci5vbihcImNoYW5nZVNlc3Npb25cIiwgaGlkZVRvb2x0aXApO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAY2xhc3MgR3V0dGVyVG9vbHRpcFxuICogQGV4dGVuZHMgVG9vbHRpcFxuICovXG5jbGFzcyBHdXR0ZXJUb29sdGlwIGV4dGVuZHMgVG9vbHRpcCB7XG4gICAgY29uc3RydWN0b3IocGFyZW50Tm9kZTogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50Tm9kZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0UG9zaXRpb25cbiAgICAgKiBAcGFyYW0geCB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSB5IHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRQb3NpdGlvbih4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG4gICAgICAgIHZhciB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodDtcbiAgICAgICAgdmFyIHdpZHRoID0gdGhpcy5nZXRXaWR0aCgpO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHQoKTtcbiAgICAgICAgeCArPSAxNTtcbiAgICAgICAgeSArPSAxNTtcbiAgICAgICAgaWYgKHggKyB3aWR0aCA+IHdpbmRvd1dpZHRoKSB7XG4gICAgICAgICAgICB4IC09ICh4ICsgd2lkdGgpIC0gd2luZG93V2lkdGg7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHkgKyBoZWlnaHQgPiB3aW5kb3dIZWlnaHQpIHtcbiAgICAgICAgICAgIHkgLT0gMjAgKyBoZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgc3VwZXIuc2V0UG9zaXRpb24oeCwgeSk7XG4gICAgfVxufVxuIl19