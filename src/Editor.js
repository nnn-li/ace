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
            if ((this.$selectionStyle !== "line" || !this.selection.isMultiLine())) {
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
    setSelectionStyle(selectionStyle) {
        this.setOption("selectionStyle", selectionStyle);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiRWRpdG9yLnRzIl0sIm5hbWVzIjpbIkVkaXRvciIsIkVkaXRvci5jb25zdHJ1Y3RvciIsIkVkaXRvci5jYW5jZWxNb3VzZUNvbnRleHRNZW51IiwiRWRpdG9yLnNlbGVjdGlvbiIsIkVkaXRvci4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycyIsIkVkaXRvci4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycy5sYXN0IiwiRWRpdG9yLnN0YXJ0T3BlcmF0aW9uIiwiRWRpdG9yLmVuZE9wZXJhdGlvbiIsIkVkaXRvci4kaGlzdG9yeVRyYWNrZXIiLCJFZGl0b3Iuc2V0S2V5Ym9hcmRIYW5kbGVyIiwiRWRpdG9yLmdldEtleWJvYXJkSGFuZGxlciIsIkVkaXRvci5zZXRTZXNzaW9uIiwiRWRpdG9yLmdldFNlc3Npb24iLCJFZGl0b3Iuc2V0VmFsdWUiLCJFZGl0b3IuZ2V0VmFsdWUiLCJFZGl0b3IuZ2V0U2VsZWN0aW9uIiwiRWRpdG9yLnJlc2l6ZSIsIkVkaXRvci5nZXRUaGVtZSIsIkVkaXRvci5zZXRTdHlsZSIsIkVkaXRvci51bnNldFN0eWxlIiwiRWRpdG9yLmdldEZvbnRTaXplIiwiRWRpdG9yLnNldEZvbnRTaXplIiwiRWRpdG9yLiRoaWdobGlnaHRCcmFja2V0cyIsIkVkaXRvci4kaGlnaGxpZ2h0VGFncyIsIkVkaXRvci5mb2N1cyIsIkVkaXRvci5pc0ZvY3VzZWQiLCJFZGl0b3IuYmx1ciIsIkVkaXRvci5vbkZvY3VzIiwiRWRpdG9yLm9uQmx1ciIsIkVkaXRvci4kY3Vyc29yQ2hhbmdlIiwiRWRpdG9yLm9uRG9jdW1lbnRDaGFuZ2UiLCJFZGl0b3Iub25Ub2tlbml6ZXJVcGRhdGUiLCJFZGl0b3Iub25TY3JvbGxUb3BDaGFuZ2UiLCJFZGl0b3Iub25TY3JvbGxMZWZ0Q2hhbmdlIiwiRWRpdG9yLm9uQ3Vyc29yQ2hhbmdlIiwiRWRpdG9yLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lIiwiRWRpdG9yLm9uU2VsZWN0aW9uQ2hhbmdlIiwiRWRpdG9yLiRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAiLCJFZGl0b3Iub25DaGFuZ2VGcm9udE1hcmtlciIsIkVkaXRvci51cGRhdGVGcm9udE1hcmtlcnMiLCJFZGl0b3Iub25DaGFuZ2VCYWNrTWFya2VyIiwiRWRpdG9yLnVwZGF0ZUJhY2tNYXJrZXJzIiwiRWRpdG9yLm9uQ2hhbmdlQnJlYWtwb2ludCIsIkVkaXRvci5vbkNoYW5nZUFubm90YXRpb24iLCJFZGl0b3Iub25DaGFuZ2VNb2RlIiwiRWRpdG9yLm9uQ2hhbmdlV3JhcExpbWl0IiwiRWRpdG9yLm9uQ2hhbmdlV3JhcE1vZGUiLCJFZGl0b3Iub25DaGFuZ2VGb2xkIiwiRWRpdG9yLmdldFNlbGVjdGVkVGV4dCIsIkVkaXRvci5nZXRDb3B5VGV4dCIsIkVkaXRvci5vbkNvcHkiLCJFZGl0b3Iub25DdXQiLCJFZGl0b3Iub25QYXN0ZSIsIkVkaXRvci5leGVjQ29tbWFuZCIsIkVkaXRvci5pbnNlcnQiLCJFZGl0b3Iub24iLCJFZGl0b3Iub2ZmIiwiRWRpdG9yLnNldERlZmF1bHRIYW5kbGVyIiwiRWRpdG9yLl9lbWl0IiwiRWRpdG9yLl9zaWduYWwiLCJFZGl0b3IuaGFzTGlzdGVuZXJzIiwiRWRpdG9yLm9uVGV4dElucHV0IiwiRWRpdG9yLm9uQ29tbWFuZEtleSIsIkVkaXRvci5zZXRPdmVyd3JpdGUiLCJFZGl0b3IuZ2V0T3ZlcndyaXRlIiwiRWRpdG9yLnRvZ2dsZU92ZXJ3cml0ZSIsIkVkaXRvci5zZXRTY3JvbGxTcGVlZCIsIkVkaXRvci5nZXRTY3JvbGxTcGVlZCIsIkVkaXRvci5zZXREcmFnRGVsYXkiLCJFZGl0b3IuZ2V0RHJhZ0RlbGF5IiwiRWRpdG9yLnNldFNlbGVjdGlvblN0eWxlIiwiRWRpdG9yLmdldFNlbGVjdGlvblN0eWxlIiwiRWRpdG9yLnNldEhpZ2hsaWdodEFjdGl2ZUxpbmUiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5zZXRIaWdobGlnaHRHdXR0ZXJMaW5lIiwiRWRpdG9yLmdldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJFZGl0b3Iuc2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkIiwiRWRpdG9yLmdldEhpZ2hsaWdodFNlbGVjdGVkV29yZCIsIkVkaXRvci5zZXRBbmltYXRlZFNjcm9sbCIsIkVkaXRvci5nZXRBbmltYXRlZFNjcm9sbCIsIkVkaXRvci5zZXRTaG93SW52aXNpYmxlcyIsIkVkaXRvci5nZXRTaG93SW52aXNpYmxlcyIsIkVkaXRvci5zZXREaXNwbGF5SW5kZW50R3VpZGVzIiwiRWRpdG9yLmdldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJFZGl0b3Iuc2V0U2hvd1ByaW50TWFyZ2luIiwiRWRpdG9yLmdldFNob3dQcmludE1hcmdpbiIsIkVkaXRvci5zZXRQcmludE1hcmdpbkNvbHVtbiIsIkVkaXRvci5nZXRQcmludE1hcmdpbkNvbHVtbiIsIkVkaXRvci5zZXRSZWFkT25seSIsIkVkaXRvci5nZXRSZWFkT25seSIsIkVkaXRvci5zZXRCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5nZXRCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5zZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQiLCJFZGl0b3IuZ2V0V3JhcEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLnNldFNob3dGb2xkV2lkZ2V0cyIsIkVkaXRvci5nZXRTaG93Rm9sZFdpZGdldHMiLCJFZGl0b3Iuc2V0RmFkZUZvbGRXaWRnZXRzIiwiRWRpdG9yLmdldEZhZGVGb2xkV2lkZ2V0cyIsIkVkaXRvci5yZW1vdmUiLCJFZGl0b3IucmVtb3ZlV29yZFJpZ2h0IiwiRWRpdG9yLnJlbW92ZVdvcmRMZWZ0IiwiRWRpdG9yLnJlbW92ZVRvTGluZVN0YXJ0IiwiRWRpdG9yLnJlbW92ZVRvTGluZUVuZCIsIkVkaXRvci5zcGxpdExpbmUiLCJFZGl0b3IudHJhbnNwb3NlTGV0dGVycyIsIkVkaXRvci50b0xvd2VyQ2FzZSIsIkVkaXRvci50b1VwcGVyQ2FzZSIsIkVkaXRvci5pbmRlbnQiLCJFZGl0b3IuYmxvY2tJbmRlbnQiLCJFZGl0b3IuYmxvY2tPdXRkZW50IiwiRWRpdG9yLnNvcnRMaW5lcyIsIkVkaXRvci50b2dnbGVDb21tZW50TGluZXMiLCJFZGl0b3IudG9nZ2xlQmxvY2tDb21tZW50IiwiRWRpdG9yLmdldE51bWJlckF0IiwiRWRpdG9yLm1vZGlmeU51bWJlciIsIkVkaXRvci5yZW1vdmVMaW5lcyIsIkVkaXRvci5kdXBsaWNhdGVTZWxlY3Rpb24iLCJFZGl0b3IubW92ZUxpbmVzRG93biIsIkVkaXRvci5tb3ZlTGluZXNVcCIsIkVkaXRvci5tb3ZlVGV4dCIsIkVkaXRvci5jb3B5TGluZXNVcCIsIkVkaXRvci5jb3B5TGluZXNEb3duIiwiRWRpdG9yLiRtb3ZlTGluZXMiLCJFZGl0b3IuJGdldFNlbGVjdGVkUm93cyIsIkVkaXRvci5vbkNvbXBvc2l0aW9uU3RhcnQiLCJFZGl0b3Iub25Db21wb3NpdGlvblVwZGF0ZSIsIkVkaXRvci5vbkNvbXBvc2l0aW9uRW5kIiwiRWRpdG9yLmdldEZpcnN0VmlzaWJsZVJvdyIsIkVkaXRvci5nZXRMYXN0VmlzaWJsZVJvdyIsIkVkaXRvci5pc1Jvd1Zpc2libGUiLCJFZGl0b3IuaXNSb3dGdWxseVZpc2libGUiLCJFZGl0b3IuJGdldFZpc2libGVSb3dDb3VudCIsIkVkaXRvci4kbW92ZUJ5UGFnZSIsIkVkaXRvci5zZWxlY3RQYWdlRG93biIsIkVkaXRvci5zZWxlY3RQYWdlVXAiLCJFZGl0b3IuZ290b1BhZ2VEb3duIiwiRWRpdG9yLmdvdG9QYWdlVXAiLCJFZGl0b3Iuc2Nyb2xsUGFnZURvd24iLCJFZGl0b3Iuc2Nyb2xsUGFnZVVwIiwiRWRpdG9yLnNjcm9sbFRvUm93IiwiRWRpdG9yLnNjcm9sbFRvTGluZSIsIkVkaXRvci5jZW50ZXJTZWxlY3Rpb24iLCJFZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb24iLCJFZGl0b3IuZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW4iLCJFZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UiLCJFZGl0b3Iuc2VsZWN0QWxsIiwiRWRpdG9yLmNsZWFyU2VsZWN0aW9uIiwiRWRpdG9yLm1vdmVDdXJzb3JUbyIsIkVkaXRvci5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbiIsIkVkaXRvci5qdW1wVG9NYXRjaGluZyIsIkVkaXRvci5nb3RvTGluZSIsIkVkaXRvci5uYXZpZ2F0ZVRvIiwiRWRpdG9yLm5hdmlnYXRlVXAiLCJFZGl0b3IubmF2aWdhdGVEb3duIiwiRWRpdG9yLm5hdmlnYXRlTGVmdCIsIkVkaXRvci5uYXZpZ2F0ZVJpZ2h0IiwiRWRpdG9yLm5hdmlnYXRlTGluZVN0YXJ0IiwiRWRpdG9yLm5hdmlnYXRlTGluZUVuZCIsIkVkaXRvci5uYXZpZ2F0ZUZpbGVFbmQiLCJFZGl0b3IubmF2aWdhdGVGaWxlU3RhcnQiLCJFZGl0b3IubmF2aWdhdGVXb3JkUmlnaHQiLCJFZGl0b3IubmF2aWdhdGVXb3JkTGVmdCIsIkVkaXRvci5yZXBsYWNlIiwiRWRpdG9yLnJlcGxhY2VBbGwiLCJFZGl0b3IuJHRyeVJlcGxhY2UiLCJFZGl0b3IuZ2V0TGFzdFNlYXJjaE9wdGlvbnMiLCJFZGl0b3IuZmluZCIsIkVkaXRvci5maW5kTmV4dCIsIkVkaXRvci5maW5kUHJldmlvdXMiLCJFZGl0b3IucmV2ZWFsUmFuZ2UiLCJFZGl0b3IudW5kbyIsIkVkaXRvci5yZWRvIiwiRWRpdG9yLmRlc3Ryb3kiLCJFZGl0b3Iuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3IiwiRWRpdG9yLiRyZXNldEN1cnNvclN0eWxlIiwiRm9sZEhhbmRsZXIiLCJGb2xkSGFuZGxlci5jb25zdHJ1Y3RvciIsIk1vdXNlSGFuZGxlciIsIk1vdXNlSGFuZGxlci5jb25zdHJ1Y3RvciIsIk1vdXNlSGFuZGxlci5vbk1vdXNlRXZlbnQiLCJNb3VzZUhhbmRsZXIub25Nb3VzZU1vdmUiLCJNb3VzZUhhbmRsZXIuZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudCIsIk1vdXNlSGFuZGxlci5zZXRTdGF0ZSIsIk1vdXNlSGFuZGxlci50ZXh0Q29vcmRpbmF0ZXMiLCJNb3VzZUhhbmRsZXIuY2FwdHVyZU1vdXNlIiwiTW91c2VIYW5kbGVyLmNhbmNlbENvbnRleHRNZW51IiwiTW91c2VIYW5kbGVyLnNlbGVjdCIsIk1vdXNlSGFuZGxlci5zZWxlY3RCeUxpbmVzRW5kIiwiTW91c2VIYW5kbGVyLnN0YXJ0U2VsZWN0IiwiTW91c2VIYW5kbGVyLnNlbGVjdEVuZCIsIk1vdXNlSGFuZGxlci5zZWxlY3RBbGxFbmQiLCJNb3VzZUhhbmRsZXIuc2VsZWN0QnlXb3Jkc0VuZCIsIk1vdXNlSGFuZGxlci5mb2N1c1dhaXQiLCJFZGl0b3JNb3VzZUV2ZW50IiwiRWRpdG9yTW91c2VFdmVudC5jb25zdHJ1Y3RvciIsIkVkaXRvck1vdXNlRXZlbnQudG9FbGVtZW50IiwiRWRpdG9yTW91c2VFdmVudC5zdG9wUHJvcGFnYXRpb24iLCJFZGl0b3JNb3VzZUV2ZW50LnByZXZlbnREZWZhdWx0IiwiRWRpdG9yTW91c2VFdmVudC5zdG9wIiwiRWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uIiwiRWRpdG9yTW91c2VFdmVudC5pblNlbGVjdGlvbiIsIkVkaXRvck1vdXNlRXZlbnQuZ2V0QnV0dG9uIiwiRWRpdG9yTW91c2VFdmVudC5nZXRTaGlmdEtleSIsIm1ha2VNb3VzZURvd25IYW5kbGVyIiwibWFrZU1vdXNlV2hlZWxIYW5kbGVyIiwibWFrZURvdWJsZUNsaWNrSGFuZGxlciIsIm1ha2VUcmlwbGVDbGlja0hhbmRsZXIiLCJtYWtlUXVhZENsaWNrSGFuZGxlciIsIm1ha2VFeHRlbmRTZWxlY3Rpb25CeSIsImNhbGNEaXN0YW5jZSIsImNhbGNSYW5nZU9yaWVudGF0aW9uIiwiR3V0dGVySGFuZGxlciIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3IiLCJHdXR0ZXJIYW5kbGVyLmNvbnN0cnVjdG9yLnNob3dUb29sdGlwIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3Rvci5oaWRlVG9vbHRpcCIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3IubW92ZVRvb2x0aXAiLCJHdXR0ZXJUb29sdGlwIiwiR3V0dGVyVG9vbHRpcC5jb25zdHJ1Y3RvciIsIkd1dHRlclRvb2x0aXAuc2V0UG9zaXRpb24iXSwibWFwcGluZ3MiOiJBQW9EQSxZQUFZLENBQUM7T0FFTixFQUFDLEtBQUssRUFBQyxNQUFNLFdBQVc7T0FDeEIsRUFBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLFdBQVcsRUFBQyxNQUFNLFdBQVc7T0FDMUQsRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUMsTUFBTSxpQkFBaUI7T0FHakUsVUFBVSxNQUFNLHVCQUF1QjtPQUN2QyxTQUFTLE1BQU0sc0JBQXNCO09BSXJDLE1BQU0sTUFBTSxVQUFVO09BR3RCLEtBQUssTUFBTSxTQUFTO09BSXBCLGlCQUFpQixNQUFNLHlCQUF5QjtPQUVoRCxjQUFjLE1BQU0sMkJBQTJCO09BQy9DLGVBQWUsTUFBTSw2QkFBNkI7T0FDbEQsRUFBQyxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDekQsYUFBYSxNQUFNLGlCQUFpQjtPQUNwQyxFQUFDLDBCQUEwQixFQUFDLE1BQU0sbUJBQW1CO09BS3JELEVBQUMsV0FBVyxFQUFFLHFCQUFxQixFQUFFLHlCQUF5QixFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxlQUFlLEVBQUMsTUFBTSxhQUFhO09BQ2xKLEVBQUMsWUFBWSxFQUFDLE1BQU0sZUFBZTtPQUVuQyxPQUFPLE1BQU0sV0FBVztBQVMvQjtJQTRGSUEsWUFBWUEsUUFBeUJBLEVBQUVBLE9BQW9CQTtRQUN2REMsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsSUFBSUEsaUJBQWlCQSxDQUFTQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2pCQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLENBQUNBLFdBQVdBLEVBQUVBLEtBQUtBLEVBQUVBLGNBQWNBLENBQUNBLENBQUNBO1FBQy9EQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxJQUFJQSxjQUFjQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxHQUFHQSxLQUFLQSxFQUFFQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUMzRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQTtRQUNoREEsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFekJBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLG9CQUFvQkEsRUFBRUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdEVBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1FBQ3JEQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUV2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDeENBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ2hEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN4Q0EsSUFBSUEsQ0FBQ0EsYUFBYUEsR0FBR0EsSUFBSUEsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDaERBLENBQUNBO1FBRURBLElBQUlBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBRXRCQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN6QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsTUFBTUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFaERBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZEQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUUvQ0EsSUFBSUEsQ0FBQ0EsdUJBQXVCQSxFQUFFQSxDQUFDQTtRQUUvQkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxXQUFXQSxDQUFDQTtZQUNoQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztZQUMxQixJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN6RSxDQUFDLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRWRBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2hCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxRQUFRQSxFQUFFQTtZQUNkLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDdkMsQ0FBQyxDQUFDQSxDQUFDQTtRQUVIQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUN6QkEsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFHdkJBLENBQUNBO0lBRURELHNCQUFzQkE7UUFDbEJFLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7SUFDM0NBLENBQUNBO0lBTURGLElBQUlBLFNBQVNBO1FBQ1RHLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQUNESCxJQUFJQSxTQUFTQSxDQUFDQSxTQUFvQkE7UUFDOUJHLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO0lBQ3pDQSxDQUFDQTtJQUVESCx1QkFBdUJBO1FBRW5CSSxjQUFpQkEsQ0FBTUEsSUFBT0MsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQUEsQ0FBQ0EsQ0FBQ0E7UUFFdERELElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3JCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUF1QkE7WUFDN0NBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRXZCQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZUFBZUEsS0FBS0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pDQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtnQkFDdkJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGVBQWVBLEtBQUtBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO29CQUN2REEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pEQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDaENBLENBQUNBO1FBQ0xBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBRVRBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQXVCQSxFQUFFQSxFQUFrQkE7WUFDdEVBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBRXhCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxlQUFlQSxLQUFLQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDekNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3ZEQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtnQkFDbERBLENBQUNBO1lBQ0xBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pCQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUVUQSxJQUFJQSxDQUFDQSxhQUFhQSxHQUFHQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUvREEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUE7WUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1lBQ3BDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNqQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFVEEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQTtZQUNoQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdkNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ2JBLENBQUNBO0lBS09KLGNBQWNBLENBQUNBLFlBQWFBO1FBQ2hDTSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxZQUFZQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTtnQkFDcENBLE1BQU1BLENBQUNBO1lBQ1hBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDNUJBLFlBQVlBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ3RCQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0E7WUFDVEEsT0FBT0EsRUFBRUEsWUFBWUEsQ0FBQ0EsT0FBT0EsSUFBSUEsRUFBRUE7WUFDbkNBLElBQUlBLEVBQUVBLFlBQVlBLENBQUNBLElBQUlBO1lBQ3ZCQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxTQUFTQTtTQUNyQ0EsQ0FBQ0E7UUFFRkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDakNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBO1lBQ2xDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtRQUUzQkEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7SUFDbERBLENBQUNBO0lBR0ROLFlBQVlBLENBQUNBLE1BQVlBO1FBQ3JCTyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUNqQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsSUFBSUEsT0FBT0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtnQkFDdkJBLE1BQU1BLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO29CQUM3QkEsS0FBS0EsUUFBUUE7d0JBQ1RBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQzlDQSxLQUFLQSxDQUFDQTtvQkFDVkEsS0FBS0EsU0FBU0EsQ0FBQ0E7b0JBQ2ZBLEtBQUtBLFFBQVFBO3dCQUNUQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxvQkFBb0JBLEVBQUVBLENBQUNBO3dCQUNyQ0EsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLEtBQUtBLGVBQWVBO3dCQUNoQkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7d0JBQ3RDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxXQUFXQSxDQUFDQTt3QkFDdkNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLE9BQU9BLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBOzRCQUN4RUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTt3QkFDdEZBLENBQUNBO3dCQUNEQSxLQUFLQSxDQUFDQTtvQkFDVkE7d0JBQ0lBLEtBQUtBLENBQUNBO2dCQUNkQSxDQUFDQTtnQkFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsSUFBSUEsU0FBU0EsQ0FBQ0E7b0JBQ3BDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxnQkFBZ0JBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQzdEQSxDQUFDQTtZQUVEQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUN6QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdEJBLENBQUNBO0lBQ0xBLENBQUNBO0lBRURQLGVBQWVBLENBQUNBLENBQW9CQTtRQUNoQ1EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQTtZQUN2QkEsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDdkJBLElBQUlBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQTtRQUVoREEsSUFBSUEsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLElBQUlBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxLQUFLQSxTQUFTQSxDQUFDQTtnQkFDcENBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFakNBLFdBQVdBLEdBQUdBLFdBQVdBO21CQUNsQkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQTttQkFDckJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBRWxEQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2pDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxXQUFXQSxHQUFHQSxXQUFXQTttQkFDbEJBLGlCQUFpQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQ0NBLElBQUlBLENBQUNBLGdCQUFnQkEsSUFBSUEsUUFBUUE7ZUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFDN0NBLENBQUNBLENBQUNBLENBQUNBO1lBQ0NBLFdBQVdB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QUFtQkEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM5REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRXpEQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUV6REEsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdERBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7WUFFcERBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRXZEQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBLGtCQUFrQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxDQUFDQTtZQUV6REEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7WUFDeENBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLGNBQWNBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBRXhEQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZQUU5REEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUMxQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFFMUJBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFFOUNBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFFL0NBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLElBQUlBLENBQUNBLGtCQUFr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RUFBRUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9FQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUN0QkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3Q0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Esb0JBQW9CQSxJQUFJQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsREEsSUFBSUEsS0FBS0EsR0FBVUEsSUFBSUEsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDdkZBLEtBQUtBLENBQUNBLFFBQVFBLEdBQUdBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLEVBQUVBLGlCQUFpQkEsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7WUFDM0VBLE9BQU9BLENBQUNBLG9CQUFvQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxPQUFPQSxDQUFDQSxvQkFBb0JBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3ZEQSxPQUFPQSxDQUFD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QUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdENBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNsREEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0VBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1FBRXRCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUMxQkEsSUFBSUEsU0FBU0EsR0FBR0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZDQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM3REEsSUFBSUEsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFdkNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxN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QSxDQUFDQTtZQUNoREEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3ZDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdEJBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7Z0JBQ25DQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDaERBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUMzQkEsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFDaENBLElBQUlBLE1BQU1BLEdBQUdBLE9BQU9BLENBQUNBLHNCQUFzQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFM0VBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxJQUFJ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QSxDQUFDQTtnQkFDcEZBLElBQUlBLFFBQVFBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBO2dCQUUvQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFHNUJBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUMvQkEsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hEQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBO2dCQUM1Q0EsQ0FBQ0E7Z0JBRURBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBO2dCQUNaQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDNUJBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUc5QkEsSUFBSUEsWUFBWUEsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsS0FBS0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7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Q0E7UUFFRkEsR0FBR0EsQ0FBQ0E7WUFDQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDM0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsUUFBUUEsQ0FBQ0E7b0JBQ2JBLENBQUNBO29CQUVEQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFFdEZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3JCQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDVEEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBOzRCQUNKQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFDckJBLEtBQUtBLENBQUNBO3dCQUNWQSxLQUFL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QUNBLENBQUNBO2dDQUNsQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7NEJBQ2pCQSxDQUFDQTs0QkFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0NBQ2pCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTt3QkFDckJBLENBQUNBO29CQUNMQSxDQUFDQTtnQkFDTEEsQ0FBQ0EsUUFBUUEsU0FBU0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUE7WUFDbENBLENBQUNBO1lBR0RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQ0EsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDbEVBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3hCQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxHQUFHQSxHQUFHQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDTkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FB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QUNBLENBQUNBLENBQUNBO1lBQ1ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUNoREEsSUFBSUEsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2ZBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1FBRXBCQSxJQUFJQSxDQUFDQSxlQUFlQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUxQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUN6Q0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFNUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDM0NBLFFBQVFBLEVBQUVBLENBQUNBO1lBQ2ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1FBRTFCQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFT25LLFdBQVdBLENBQUNBLEtBQVlBLEVBQUVBLFdBQW1CQTtRQUNqRG9LLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQzdDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUN2REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUNqQkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLENBQUNBO0lBQ0xBLENBQUNBO0lBTURwSyxvQkFBb0JBO1FBQ2hCcUssTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7SUFDckNBLENBQUNBO0lBWURySyxJQUFJQSxDQUFDQSxNQUF5QkEsRUFBRUEsT0FBT0EsR0FBa0JBLEVBQUVBLEVBQUVBLE9BQWlCQTtRQUUxRXNLLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLEtBQUtBLFFBQVFBLElBQUlBLE1BQU1BLFlBQVlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3pEQSxPQUFPQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLEtBQUtBLENBQUNBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQzNCQSxDQUFDQTtRQUVEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekJBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1lBQzFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZFQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUVqQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFD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QUNBLFFBQVFBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzlDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxZQUFZQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNsREEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDakNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVEWCxTQUFTQTtRQUNMWSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVEWixZQUFZQTtRQUNSYSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVEYixnQkFBZ0JBO1FBQ1pjLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBRURkLFNBQVNBO1FBQ0xlLElBQUlBLFFBQVFBLEdBQUdBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ2xIQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUV0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsR0FBR0EsV0FBV0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDaEVBLENBQUNBO0lBQ0xB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RUEsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeEZBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUMvREEsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDVkEsTUFBTUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDdERBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLE1BQU1BLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO0lBQ3REQSxDQUFDQTtBQUNMQSxDQUFDQTtBQUVEO0lBQ0lDLFlBQVlBLFlBQTBCQTtRQUNsQ0MsSUFBSUEsTUFBTUEsR0FBV0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDekNBLElBQUlBLE1BQU1BLEdBQVdBLE1BQU1BLENB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Y2Vuc2UgKE1JVClcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNiBEYXZpZCBHZW8gSG9sbWVzIDxkYXZpZC5nZW8uaG9sbWVzQGdtYWlsLmNvbT5cbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW4gYWxsXG4gKiBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEVcbiAqIFNPRlRXQVJFLlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cbi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB7bWl4aW59IGZyb20gXCIuL2xpYi9vb3BcIjtcbmltcG9ydCB7Y29tcHV0ZWRTdHlsZSwgaGFzQ3NzQ2xhc3MsIHNldENzc0NsYXNzfSBmcm9tIFwiLi9saWIvZG9tXCI7XG5pbXBvcnQge2RlbGF5ZWRDYWxsLCBzdHJpbmdSZXBlYXR9IGZyb20gXCIuL2xpYi9sYW5nXCI7XG5pbXBvcnQge2lzSUUsIGlzTWFjLCBpc01vYmlsZSwgaXNPbGRJRSwgaXNXZWJLaXR9IGZyb20gXCIuL2xpYi91c2VyYWdlbnRcIjtcbmltcG9ydCBHdXR0ZXIgZnJvbSBcIi4vbGF5ZXIvR3V0dGVyXCI7XG5pbXBvcnQgSGFzaEhhbmRsZXIgZnJvbSBcIi4va2V5Ym9hcmQvSGFzaEhhbmRsZXJcIjtcbmltcG9ydCBLZXlCaW5kaW5nIGZyb20gXCIuL2tleWJvYXJkL0tleUJpbmRpbmdcIjtcbmltcG9ydCBUZXh0SW5wdXQgZnJvbSBcIi4va2V5Ym9hcmQvVGV4dElucHV0XCI7XG5pbXBvcnQgRGVsdGEgZnJvbSBcIi4vRGVsdGFcIjtcbmltcG9ydCBEZWx0YUV2ZW50IGZyb20gXCIuL0RlbHRhRXZlbnRcIjtcbmltcG9ydCBFZGl0U2Vzc2lvbiBmcm9tIFwiLi9FZGl0U2Vzc2lvblwiO1xuaW1wb3J0IFNlYXJjaCBmcm9tIFwiLi9TZWFyY2hcIjtcbmltcG9ydCBGaXJzdEFuZExhc3QgZnJvbSBcIi4vRmlyc3RBbmRMYXN0XCI7XG5pbXBvcnQgUG9zaXRpb24gZnJvbSBcIi4vUG9zaXRpb25cIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IFRleHRBbmRTZWxlY3Rpb24gZnJvbSBcIi4vVGV4dEFuZFNlbGVjdGlvblwiO1xuaW1wb3J0IEN1cnNvclJhbmdlIGZyb20gJy4vQ3Vyc29yUmFuZ2UnO1xuaW1wb3J0IEV2ZW50QnVzIGZyb20gXCIuL0V2ZW50QnVzXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL0V2ZW50RW1pdHRlckNsYXNzXCI7XG5pbXBvcnQgQ29tbWFuZCBmcm9tIFwiLi9jb21tYW5kcy9Db21tYW5kXCI7XG5pbXBvcnQgQ29tbWFuZE1hbmFnZXIgZnJvbSBcIi4vY29tbWFuZHMvQ29tbWFuZE1hbmFnZXJcIjtcbmltcG9ydCBkZWZhdWx0Q29tbWFuZHMgZnJvbSBcIi4vY29tbWFuZHMvZGVmYXVsdF9jb21tYW5kc1wiO1xuaW1wb3J0IHtkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IFRva2VuSXRlcmF0b3IgZnJvbSBcIi4vVG9rZW5JdGVyYXRvclwiO1xuaW1wb3J0IHtDT01NQU5EX05BTUVfQVVUT19DT01QTEVURX0gZnJvbSAnLi9lZGl0b3JfcHJvdG9jb2wnO1xuaW1wb3J0IFZpcnR1YWxSZW5kZXJlciBmcm9tICcuL1ZpcnR1YWxSZW5kZXJlcic7XG5pbXBvcnQge0NvbXBsZXRlcn0gZnJvbSBcIi4vYXV0b2NvbXBsZXRlXCI7XG5pbXBvcnQgU2VhcmNoT3B0aW9ucyBmcm9tICcuL1NlYXJjaE9wdGlvbnMnO1xuaW1wb3J0IFNlbGVjdGlvbiBmcm9tICcuL1NlbGVjdGlvbic7XG5pbXBvcnQge2FkZExpc3RlbmVyLCBhZGRNb3VzZVdoZWVsTGlzdGVuZXIsIGFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIsIGNhcHR1cmUsIGdldEJ1dHRvbiwgcHJldmVudERlZmF1bHQsIHN0b3BFdmVudCwgc3RvcFByb3BhZ2F0aW9ufSBmcm9tIFwiLi9saWIvZXZlbnRcIjtcbmltcG9ydCB7dG91Y2hNYW5hZ2VyfSBmcm9tICcuL3RvdWNoL3RvdWNoJztcbmltcG9ydCBUaGVtZUxpbmsgZnJvbSBcIi4vVGhlbWVMaW5rXCI7XG5pbXBvcnQgVG9vbHRpcCBmcm9tIFwiLi9Ub29sdGlwXCI7XG5cbi8vdmFyIERyYWdkcm9wSGFuZGxlciA9IHJlcXVpcmUoXCIuL21vdXNlL2RyYWdkcm9wX2hhbmRsZXJcIikuRHJhZ2Ryb3BIYW5kbGVyO1xuXG4vKipcbiAqIFRoZSBgRWRpdG9yYCBhY3RzIGFzIGEgY29udHJvbGxlciwgbWVkaWF0aW5nIGJldHdlZW4gdGhlIGVkaXRTZXNzaW9uIGFuZCByZW5kZXJlci5cbiAqXG4gKiBAY2xhc3MgRWRpdG9yXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVkaXRvciBpbXBsZW1lbnRzIEV2ZW50QnVzPEVkaXRvcj4ge1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IHJlbmRlcmVyXG4gICAgICogQHR5cGUgVmlydHVhbFJlbmRlcmVyXG4gICAgICovXG4gICAgcHVibGljIHJlbmRlcmVyOiBWaXJ0dWFsUmVuZGVyZXI7XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgc2Vzc2lvblxuICAgICAqIEB0eXBlIEVkaXRTZXNzaW9uXG4gICAgICovXG4gICAgcHVibGljIHNlc3Npb246IEVkaXRTZXNzaW9uO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IGV2ZW50QnVzXG4gICAgICogQHR5cGUgRXZlbnRFbWl0dGVyQ2xhc3NcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgZXZlbnRCdXM6IEV2ZW50RW1pdHRlckNsYXNzPEVkaXRvcj47XG5cbiAgICBwcml2YXRlICR0b3VjaEhhbmRsZXI6IElHZXN0dXJlSGFuZGxlcjtcbiAgICBwcml2YXRlICRtb3VzZUhhbmRsZXI6IElHZXN0dXJlSGFuZGxlcjtcbiAgICBwdWJsaWMgZ2V0T3B0aW9uO1xuICAgIHB1YmxpYyBzZXRPcHRpb247XG4gICAgcHVibGljIHNldE9wdGlvbnM7XG4gICAgcHVibGljICRpc0ZvY3VzZWQ7XG4gICAgcHVibGljIGNvbW1hbmRzOiBDb21tYW5kTWFuYWdlcjtcbiAgICBwdWJsaWMga2V5QmluZGluZzogS2V5QmluZGluZztcbiAgICAvLyBGSVhNRTogVGhpcyBpcyByZWFsbHkgYW4gb3B0aW9uYWwgZXh0ZW5zaW9uIGFuZCBzbyBkb2VzIG5vdCBiZWxvbmcgaGVyZS5cbiAgICBwdWJsaWMgY29tcGxldGVyczogQ29tcGxldGVyW107XG5cbiAgICBwdWJsaWMgd2lkZ2V0TWFuYWdlcjtcblxuICAgIC8qKlxuICAgICAqIFRoZSByZW5kZXJlciBjb250YWluZXIgZWxlbWVudC5cbiAgICAgKi9cbiAgICBwdWJsaWMgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMgdGV4dElucHV0O1xuICAgIHB1YmxpYyBpbk11bHRpU2VsZWN0TW9kZTogYm9vbGVhbjtcbiAgICBwdWJsaWMgbXVsdGlTZWxlY3Q6IFNlbGVjdGlvbjtcbiAgICBwdWJsaWMgaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZTtcblxuICAgIHByaXZhdGUgJGN1cnNvclN0eWxlOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSAka2V5YmluZGluZ0lkO1xuICAgIHByaXZhdGUgJGJsb2NrU2Nyb2xsaW5nO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodEFjdGl2ZUxpbmU7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0UGVuZGluZztcbiAgICBwcml2YXRlICRoaWdobGlnaHRTZWxlY3RlZFdvcmQ6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0VGFnUGVuZGluZztcbiAgICBwcml2YXRlICRtZXJnZVVuZG9EZWx0YXM7XG4gICAgcHVibGljICRyZWFkT25seTtcbiAgICBwcml2YXRlICRzY3JvbGxBbmNob3I7XG4gICAgcHJpdmF0ZSAkc2VhcmNoOiBTZWFyY2g7XG4gICAgcHJpdmF0ZSBfJGVtaXRJbnB1dEV2ZW50O1xuICAgIHByaXZhdGUgc2VsZWN0aW9uczogYW55W107XG4gICAgcHJpdmF0ZSAkc2VsZWN0aW9uU3R5bGU6IHN0cmluZztcbiAgICBwcml2YXRlICRvcFJlc2V0VGltZXI7XG4gICAgcHJpdmF0ZSBjdXJPcDtcbiAgICBwcml2YXRlIHByZXZPcDogeyBjb21tYW5kPzsgYXJncz99O1xuICAgIHByaXZhdGUgbGFzdEZpbGVKdW1wUG9zO1xuICAgIHByaXZhdGUgcHJldmlvdXNDb21tYW5kO1xuICAgIHByaXZhdGUgJG1lcmdlYWJsZUNvbW1hbmRzOiBzdHJpbmdbXTtcbiAgICBwcml2YXRlIG1lcmdlTmV4dENvbW1hbmQ7XG4gICAgcHJpdmF0ZSAkbWVyZ2VOZXh0Q29tbWFuZDtcbiAgICBwcml2YXRlIHNlcXVlbmNlU3RhcnRUaW1lOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkb25Eb2N1bWVudENoYW5nZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZU1vZGU7XG4gICAgcHJpdmF0ZSAkb25Ub2tlbml6ZXJVcGRhdGU7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VUYWJTaXplOiAoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikgPT4gYW55O1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlV3JhcExpbWl0O1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlV3JhcE1vZGU7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VGb2xkO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlRnJvbnRNYXJrZXI7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VCYWNrTWFya2VyO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlQnJlYWtwb2ludDtcbiAgICBwcml2YXRlICRvbkNoYW5nZUFubm90YXRpb247XG4gICAgcHJpdmF0ZSAkb25DdXJzb3JDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25TY3JvbGxUb3BDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25TY3JvbGxMZWZ0Q2hhbmdlO1xuICAgIHB1YmxpYyAkb25TZWxlY3Rpb25DaGFuZ2U6IChldmVudCwgc2VsZWN0aW9uOiBTZWxlY3Rpb24pID0+IHZvaWQ7XG4gICAgcHVibGljIGV4aXRNdWx0aVNlbGVjdE1vZGU6ICgpID0+IGFueTtcbiAgICBwdWJsaWMgZm9yRWFjaFNlbGVjdGlvbjtcblxuICAgIC8qKlxuICAgICAqIENyZWF0ZXMgYSBuZXcgYEVkaXRvcmAgb2JqZWN0LlxuICAgICAqXG4gICAgICogQGNsYXNzIEVkaXRvclxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSByZW5kZXJlciB7VmlydHVhbFJlbmRlcmVyfSBUaGUgdmlldy5cbiAgICAgKiBAcGFyYW0gc2Vzc2lvbiB7RWRpdFNlc3Npb259IFRoZSBtb2RlbC5cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3RvcihyZW5kZXJlcjogVmlydHVhbFJlbmRlcmVyLCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLmV2ZW50QnVzID0gbmV3IEV2ZW50RW1pdHRlckNsYXNzPEVkaXRvcj4odGhpcyk7XG4gICAgICAgIHRoaXMuY3VyT3AgPSBudWxsO1xuICAgICAgICB0aGlzLnByZXZPcCA9IHt9O1xuICAgICAgICB0aGlzLiRtZXJnZWFibGVDb21tYW5kcyA9IFtcImJhY2tzcGFjZVwiLCBcImRlbFwiLCBcImluc2VydHN0cmluZ1wiXTtcbiAgICAgICAgdGhpcy5jb21tYW5kcyA9IG5ldyBDb21tYW5kTWFuYWdlcihpc01hYyA/IFwibWFjXCIgOiBcIndpblwiLCBkZWZhdWx0Q29tbWFuZHMpO1xuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IHJlbmRlcmVyLmdldENvbnRhaW5lckVsZW1lbnQoKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlciA9IHJlbmRlcmVyO1xuXG4gICAgICAgIHRoaXMudGV4dElucHV0ID0gbmV3IFRleHRJbnB1dChyZW5kZXJlci5nZXRUZXh0QXJlYUNvbnRhaW5lcigpLCB0aGlzKTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci50ZXh0YXJlYSA9IHRoaXMudGV4dElucHV0LmdldEVsZW1lbnQoKTtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nID0gbmV3IEtleUJpbmRpbmcodGhpcyk7XG5cbiAgICAgICAgaWYgKGlzTW9iaWxlKSB7XG4gICAgICAgICAgICB0aGlzLiR0b3VjaEhhbmRsZXIgPSB0b3VjaE1hbmFnZXIodGhpcyk7XG4gICAgICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIgPSBuZXcgTW91c2VIYW5kbGVyKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kdG91Y2hIYW5kbGVyID0gdG91Y2hNYW5hZ2VyKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy4kbW91c2VIYW5kbGVyID0gbmV3IE1vdXNlSGFuZGxlcih0aGlzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ldyBGb2xkSGFuZGxlcih0aGlzKTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyA9IDA7XG4gICAgICAgIHRoaXMuJHNlYXJjaCA9IG5ldyBTZWFyY2goKS5zZXQoeyB3cmFwOiB0cnVlIH0pO1xuXG4gICAgICAgIHRoaXMuJGhpc3RvcnlUcmFja2VyID0gdGhpcy4kaGlzdG9yeVRyYWNrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImV4ZWNcIiwgdGhpcy4kaGlzdG9yeVRyYWNrZXIpO1xuXG4gICAgICAgIHRoaXMuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMoKTtcblxuICAgICAgICB0aGlzLl8kZW1pdElucHV0RXZlbnQgPSBkZWxheWVkQ2FsbChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImlucHV0XCIsIHt9KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5iZ1Rva2VuaXplciAmJiB0aGlzLnNlc3Npb24uYmdUb2tlbml6ZXIuc2NoZWR1bGVTdGFydCgpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5vbihcImNoYW5nZVwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuXyRlbWl0SW5wdXRFdmVudC5zY2hlZHVsZSgzMSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc2V0U2Vzc2lvbihzZXNzaW9uKTtcbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICAvLyBGSVhNRTogVGhpcyB3YXMgYSBzaWduYWwgdG8gYSBnbG9iYWwgY29uZmlnIG9iamVjdC5cbiAgICAgICAgLy8gX3NpZ25hbChcImVkaXRvclwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICBjYW5jZWxNb3VzZUNvbnRleHRNZW51KCkge1xuICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgc2VsZWN0aW9uXG4gICAgICogQHR5cGUgU2VsZWN0aW9uXG4gICAgICovXG4gICAgZ2V0IHNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgIH1cbiAgICBzZXQgc2VsZWN0aW9uKHNlbGVjdGlvbjogU2VsZWN0aW9uKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uKTtcbiAgICB9XG5cbiAgICAkaW5pdE9wZXJhdGlvbkxpc3RlbmVycygpIHtcblxuICAgICAgICBmdW5jdGlvbiBsYXN0PFQ+KGE6IFRbXSk6IFQgeyByZXR1cm4gYVthLmxlbmd0aCAtIDFdIH1cblxuICAgICAgICB0aGlzLnNlbGVjdGlvbnMgPSBbXTtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImV4ZWNcIiwgKGU6IHsgY29tbWFuZDogQ29tbWFuZCB9KSA9PiB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0T3BlcmF0aW9uKGUpO1xuXG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IGUuY29tbWFuZDtcbiAgICAgICAgICAgIGlmIChjb21tYW5kLmFjZUNvbW1hbmRHcm91cCA9PT0gXCJmaWxlSnVtcFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHByZXYgPSB0aGlzLnByZXZPcDtcbiAgICAgICAgICAgICAgICBpZiAoIXByZXYgfHwgcHJldi5jb21tYW5kLmFjZUNvbW1hbmRHcm91cCAhPT0gXCJmaWxlSnVtcFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGFzdEZpbGVKdW1wUG9zID0gbGFzdCh0aGlzLnNlbGVjdGlvbnMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0RmlsZUp1bXBQb3MgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiYWZ0ZXJFeGVjXCIsIChlOiB7IGNvbW1hbmQ6IENvbW1hbmQgfSwgY206IENvbW1hbmRNYW5hZ2VyKSA9PiB7XG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IGUuY29tbWFuZDtcblxuICAgICAgICAgICAgaWYgKGNvbW1hbmQuYWNlQ29tbWFuZEdyb3VwID09PSBcImZpbGVKdW1wXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5sYXN0RmlsZUp1bXBQb3MgJiYgIXRoaXMuY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5mcm9tSlNPTih0aGlzLmxhc3RGaWxlSnVtcFBvcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lbmRPcGVyYXRpb24oZSk7XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHRoaXMuJG9wUmVzZXRUaW1lciA9IGRlbGF5ZWRDYWxsKHRoaXMuZW5kT3BlcmF0aW9uLmJpbmQodGhpcykpO1xuXG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oXCJjaGFuZ2VcIiwgKCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5jdXJPcCB8fCB0aGlzLnN0YXJ0T3BlcmF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmN1ck9wLmRvY0NoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICB0aGlzLmV2ZW50QnVzLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsICgpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AgfHwgdGhpcy5zdGFydE9wZXJhdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgfSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKi9cbiAgICBwcml2YXRlIHN0YXJ0T3BlcmF0aW9uKGNvbW1hbmRFdmVudD8pIHtcbiAgICAgICAgaWYgKHRoaXMuY3VyT3ApIHtcbiAgICAgICAgICAgIGlmICghY29tbWFuZEV2ZW50IHx8IHRoaXMuY3VyT3AuY29tbWFuZClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB0aGlzLnByZXZPcCA9IHRoaXMuY3VyT3A7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFjb21tYW5kRXZlbnQpIHtcbiAgICAgICAgICAgIHRoaXMucHJldmlvdXNDb21tYW5kID0gbnVsbDtcbiAgICAgICAgICAgIGNvbW1hbmRFdmVudCA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kb3BSZXNldFRpbWVyLnNjaGVkdWxlKCk7XG4gICAgICAgIHRoaXMuY3VyT3AgPSB7XG4gICAgICAgICAgICBjb21tYW5kOiBjb21tYW5kRXZlbnQuY29tbWFuZCB8fCB7fSxcbiAgICAgICAgICAgIGFyZ3M6IGNvbW1hbmRFdmVudC5hcmdzLFxuICAgICAgICAgICAgc2Nyb2xsVG9wOiB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvcFxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBjb21tYW5kID0gdGhpcy5jdXJPcC5jb21tYW5kO1xuICAgICAgICBpZiAoY29tbWFuZCAmJiBjb21tYW5kLnNjcm9sbEludG9WaWV3KVxuICAgICAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcrKztcblxuICAgICAgICB0aGlzLnNlbGVjdGlvbnMucHVzaCh0aGlzLnNlbGVjdGlvbi50b0pTT04oKSk7XG4gICAgfVxuXG4gICAgLy8gRklYTUU6IFRoaXMgcHJvYmFibHkgZG9lc24ndCByZXF1aXJlIHRoZSBhcmd1bWVudC5cbiAgICBlbmRPcGVyYXRpb24odW51c2VkPzogYW55KSB7XG4gICAgICAgIGlmICh0aGlzLmN1ck9wKSB7XG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IHRoaXMuY3VyT3AuY29tbWFuZDtcbiAgICAgICAgICAgIGlmIChjb21tYW5kICYmIGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZy0tO1xuICAgICAgICAgICAgICAgIHN3aXRjaCAoY29tbWFuZC5zY3JvbGxJbnRvVmlldykge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiY2VudGVyXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KG51bGwsIDAuNSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImFuaW1hdGVcIjpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcImN1cnNvclwiOlxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzZWxlY3Rpb25QYXJ0XCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGNvbmZpZyA9IHRoaXMucmVuZGVyZXIubGF5ZXJDb25maWc7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ID49IGNvbmZpZy5sYXN0Um93IHx8IHJhbmdlLmVuZC5yb3cgPD0gY29uZmlnLmZpcnN0Um93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyh0aGlzLnNlbGVjdGlvbi5hbmNob3IsIHRoaXMuc2VsZWN0aW9uLmxlYWQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGNvbW1hbmQuc2Nyb2xsSW50b1ZpZXcgPT0gXCJhbmltYXRlXCIpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyh0aGlzLmN1ck9wLnNjcm9sbFRvcCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMucHJldk9wID0gdGhpcy5jdXJPcDtcbiAgICAgICAgICAgIHRoaXMuY3VyT3AgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgJGhpc3RvcnlUcmFja2VyKGU6IHsgY29tbWFuZDsgYXJncyB9KSB7XG4gICAgICAgIGlmICghdGhpcy4kbWVyZ2VVbmRvRGVsdGFzKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBwcmV2ID0gdGhpcy5wcmV2T3A7XG4gICAgICAgIHZhciBtZXJnZWFibGVDb21tYW5kcyA9IHRoaXMuJG1lcmdlYWJsZUNvbW1hbmRzO1xuICAgICAgICAvLyBwcmV2aW91cyBjb21tYW5kIHdhcyB0aGUgc2FtZVxuICAgICAgICB2YXIgc2hvdWxkTWVyZ2UgPSBwcmV2LmNvbW1hbmQgJiYgKGUuY29tbWFuZC5uYW1lID09IHByZXYuY29tbWFuZC5uYW1lKTtcbiAgICAgICAgaWYgKGUuY29tbWFuZC5uYW1lID09IFwiaW5zZXJ0c3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciB0ZXh0ID0gZS5hcmdzO1xuICAgICAgICAgICAgaWYgKHRoaXMubWVyZ2VOZXh0Q29tbWFuZCA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgIHRoaXMubWVyZ2VOZXh0Q29tbWFuZCA9IHRydWU7XG5cbiAgICAgICAgICAgIHNob3VsZE1lcmdlID0gc2hvdWxkTWVyZ2VcbiAgICAgICAgICAgICAgICAmJiB0aGlzLm1lcmdlTmV4dENvbW1hbmQgLy8gcHJldmlvdXMgY29tbWFuZCBhbGxvd3MgdG8gY29hbGVzY2Ugd2l0aFxuICAgICAgICAgICAgICAgICYmICghL1xccy8udGVzdCh0ZXh0KSB8fCAvXFxzLy50ZXN0KHByZXYuYXJncykpOyAvLyBwcmV2aW91cyBpbnNlcnRpb24gd2FzIG9mIHNhbWUgdHlwZVxuXG4gICAgICAgICAgICB0aGlzLm1lcmdlTmV4dENvbW1hbmQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2hvdWxkTWVyZ2UgPSBzaG91bGRNZXJnZVxuICAgICAgICAgICAgICAgICYmIG1lcmdlYWJsZUNvbW1hbmRzLmluZGV4T2YoZS5jb21tYW5kLm5hbWUpICE9PSAtMTsgLy8gdGhlIGNvbW1hbmQgaXMgbWVyZ2VhYmxlXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgICB0aGlzLiRtZXJnZVVuZG9EZWx0YXMgIT0gXCJhbHdheXNcIlxuICAgICAgICAgICAgJiYgRGF0ZS5ub3coKSAtIHRoaXMuc2VxdWVuY2VTdGFydFRpbWUgPiAyMDAwXG4gICAgICAgICkge1xuICAgICAgICAgICAgc2hvdWxkTWVyZ2UgPSBmYWxzZTsgLy8gdGhlIHNlcXVlbmNlIGlzIHRvbyBsb25nXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2hvdWxkTWVyZ2UpXG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ubWVyZ2VVbmRvRGVsdGFzID0gdHJ1ZTtcbiAgICAgICAgZWxzZSBpZiAobWVyZ2VhYmxlQ29tbWFuZHMuaW5kZXhPZihlLmNvbW1hbmQubmFtZSkgIT09IC0xKVxuICAgICAgICAgICAgdGhpcy5zZXF1ZW5jZVN0YXJ0VGltZSA9IERhdGUubm93KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyBrZXkgaGFuZGxlciwgc3VjaCBhcyBcInZpbVwiIG9yIFwid2luZG93c1wiLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRLZXlib2FyZEhhbmRsZXJcbiAgICAgKiBAcGFyYW0ga2V5Ym9hcmRIYW5kbGVyIHtzdHJpbmcgfCBIYXNoSGFuZGxlcn0gVGhlIG5ldyBrZXkgaGFuZGxlci5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldEtleWJvYXJkSGFuZGxlcihrZXlib2FyZEhhbmRsZXI6IHN0cmluZyB8IEhhc2hIYW5kbGVyKTogdm9pZCB7XG4gICAgICAgIGlmICgha2V5Ym9hcmRIYW5kbGVyKSB7XG4gICAgICAgICAgICB0aGlzLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBrZXlib2FyZEhhbmRsZXIgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHRoaXMuJGtleWJpbmRpbmdJZCA9IGtleWJvYXJkSGFuZGxlcjtcbiAgICAgICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBsb2FkTW9kdWxlKFtcImtleWJpbmRpbmdcIiwga2V5Ym9hcmRIYW5kbGVyXSwgZnVuY3Rpb24obW9kdWxlKSB7XG4gICAgICAgICAgICAgICAgaWYgKF9zZWxmLiRrZXliaW5kaW5nSWQgPT0ga2V5Ym9hcmRIYW5kbGVyKVxuICAgICAgICAgICAgICAgICAgICBfc2VsZi5rZXlCaW5kaW5nLnNldEtleWJvYXJkSGFuZGxlcihtb2R1bGUgJiYgbW9kdWxlLmhhbmRsZXIpO1xuICAgICAgICAgICAgfSwgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRrZXliaW5kaW5nSWQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5rZXlCaW5kaW5nLnNldEtleWJvYXJkSGFuZGxlcihrZXlib2FyZEhhbmRsZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUga2V5Ym9hcmQgaGFuZGxlciwgc3VjaCBhcyBcInZpbVwiIG9yIFwid2luZG93c1wiLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRLZXlib2FyZEhhbmRsZXJcbiAgICAgKiBAcmV0dXJuIHtIYXNoSGFuZGxlcn1cbiAgICAgKi9cbiAgICBnZXRLZXlib2FyZEhhbmRsZXIoKTogSGFzaEhhbmRsZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5rZXlCaW5kaW5nLmdldEtleWJvYXJkSGFuZGxlcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcgRWRpdFNlc3Npb24gdG8gdXNlLlxuICAgICAqIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2Vzc2lvbidgIGV2ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZXNzaW9uXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufSBUaGUgbmV3IHNlc3Npb24gdG8gdXNlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0U2Vzc2lvbihzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uID09PSBzZXNzaW9uKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb2xkU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgaWYgKG9sZFNlc3Npb24pIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VcIiwgdGhpcy4kb25Eb2N1bWVudENoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlTW9kZVwiLCB0aGlzLiRvbkNoYW5nZU1vZGUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcInRva2VuaXplclVwZGF0ZVwiLCB0aGlzLiRvblRva2VuaXplclVwZGF0ZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlVGFiU2l6ZVwiLCB0aGlzLiRvbkNoYW5nZVRhYlNpemUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVdyYXBMaW1pdFwiLCB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlV3JhcE1vZGVcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwib25DaGFuZ2VGb2xkXCIsIHRoaXMuJG9uQ2hhbmdlRm9sZCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlRnJvbnRNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlcik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlQmFja01hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZUJyZWFrcG9pbnRcIiwgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ub2ZmKFwiY2hhbmdlT3ZlcndyaXRlXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5vZmYoXCJjaGFuZ2VTY3JvbGxUb3BcIiwgdGhpcy4kb25TY3JvbGxUb3BDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm9mZihcImNoYW5nZVNjcm9sbExlZnRcIiwgdGhpcy4kb25TY3JvbGxMZWZ0Q2hhbmdlKTtcblxuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5vZmYoXCJjaGFuZ2VDdXJzb3JcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuICAgICAgICAgICAgc2VsZWN0aW9uLm9mZihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvblNlbGVjdGlvbkNoYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoc2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy4kb25Eb2N1bWVudENoYW5nZSA9IHRoaXMub25Eb2N1bWVudENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2Vzc2lvbihzZXNzaW9uKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlID0gdGhpcy5vbkNoYW5nZU1vZGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlTW9kZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlID0gdGhpcy5vblRva2VuaXplclVwZGF0ZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcInRva2VuaXplclVwZGF0ZVwiLCB0aGlzLiRvblRva2VuaXplclVwZGF0ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSA9IHRoaXMucmVuZGVyZXIub25DaGFuZ2VUYWJTaXplLmJpbmQodGhpcy5yZW5kZXJlcik7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlVGFiU2l6ZVwiLCB0aGlzLiRvbkNoYW5nZVRhYlNpemUpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCA9IHRoaXMub25DaGFuZ2VXcmFwTGltaXQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VXcmFwTGltaXRcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTGltaXQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlID0gdGhpcy5vbkNoYW5nZVdyYXBNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlV3JhcE1vZGVcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlRm9sZCA9IHRoaXMub25DaGFuZ2VGb2xkLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLiRvbkNoYW5nZUZvbGQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyID0gdGhpcy5vbkNoYW5nZUZyb250TWFya2VyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlRnJvbnRNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlcik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlciA9IHRoaXMub25DaGFuZ2VCYWNrTWFya2VyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlQmFja01hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQgPSB0aGlzLm9uQ2hhbmdlQnJlYWtwb2ludC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZUJyZWFrcG9pbnRcIiwgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50KTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uID0gdGhpcy5vbkNoYW5nZUFubm90YXRpb24uYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24ub24oXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlID0gdGhpcy5vbkN1cnNvckNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZU92ZXJ3cml0ZVwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2Nyb2xsVG9wQ2hhbmdlID0gdGhpcy5vblNjcm9sbFRvcENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5vbihcImNoYW5nZVNjcm9sbFRvcFwiLCB0aGlzLiRvblNjcm9sbFRvcENoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2Nyb2xsTGVmdENoYW5nZSA9IHRoaXMub25TY3JvbGxMZWZ0Q2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLm9uKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCB0aGlzLiRvblNjcm9sbExlZnRDaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IHNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5vbihcImNoYW5nZUN1cnNvclwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlID0gdGhpcy5vblNlbGVjdGlvbkNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24ub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlTW9kZSh2b2lkIDAsIHRoaXMuc2Vzc2lvbik7XG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICAgICAgdGhpcy5vbkN1cnNvckNoYW5nZSh2b2lkIDAsIHRoaXMuc2Vzc2lvbik7XG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgICAgICB0aGlzLm9uU2Nyb2xsVG9wQ2hhbmdlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25TY3JvbGxMZWZ0Q2hhbmdlKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcblxuICAgICAgICAgICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoaXMuc2VsZWN0aW9uKTtcblxuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUZyb250TWFya2VyKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VCYWNrTWFya2VyKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VCcmVha3BvaW50KHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VBbm5vdGF0aW9uKHZvaWQgMCwgdGhpcy5zZXNzaW9uKTtcbiAgICAgICAgICAgIHNlc3Npb24uZ2V0VXNlV3JhcE1vZGUoKSAmJiB0aGlzLnJlbmRlcmVyLmFkanVzdFdyYXBMaW1pdCgpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGdWxsKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VTZXNzaW9uXCIsIHtcbiAgICAgICAgICAgIHNlc3Npb246IHNlc3Npb24sXG4gICAgICAgICAgICBvbGRTZXNzaW9uOiBvbGRTZXNzaW9uXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG9sZFNlc3Npb24gJiYgb2xkU2Vzc2lvbi5fc2lnbmFsKFwiY2hhbmdlRWRpdG9yXCIsIHsgb2xkRWRpdG9yOiB0aGlzIH0pO1xuICAgICAgICBzZXNzaW9uICYmIHNlc3Npb24uX3NpZ25hbChcImNoYW5nZUVkaXRvclwiLCB7IGVkaXRvcjogdGhpcyB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlc3Npb24gYmVpbmcgdXNlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2Vzc2lvblxuICAgICAqIEByZXR1cm4ge0VkaXRTZXNzaW9ufVxuICAgICAqL1xuICAgIGdldFNlc3Npb24oKTogRWRpdFNlc3Npb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgZG9jdW1lbnQgdG8gYHRleHRgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRWYWx1ZVxuICAgICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IFRoZSBuZXcgdmFsdWUgdG8gc2V0IGZvciB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0gW2N1cnNvclBvc10ge251bWJlcn0gV2hlcmUgdG8gc2V0IHRoZSBuZXcgdmFsdWUuYHVuZGVmaW5lZGAgb3IgMCBpcyBzZWxlY3RBbGwsIC0xIGlzIGF0IHRoZSBkb2N1bWVudCBzdGFydCwgYW5kICsxIGlzIGF0IHRoZSBlbmRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFZhbHVlKHRleHQ6IHN0cmluZywgY3Vyc29yUG9zPzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIEZJWE1FOiBUaGlzIGxhY2tzIHN5bW1ldHJ5IHdpdGggZ2V0VmFsdWUoKS5cbiAgICAgICAgdGhpcy5zZXNzaW9uLmRvYy5zZXRWYWx1ZSh0ZXh0KTtcbiAgICAgICAgLy8gdGhpcy5zZXNzaW9uLnNldFZhbHVlKHRleHQpO1xuXG4gICAgICAgIGlmICghY3Vyc29yUG9zKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdEFsbCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGN1cnNvclBvcyA9PSArMSkge1xuICAgICAgICAgICAgdGhpcy5uYXZpZ2F0ZUZpbGVFbmQoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjdXJzb3JQb3MgPT0gLTEpIHtcbiAgICAgICAgICAgIHRoaXMubmF2aWdhdGVGaWxlU3RhcnQoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgc2Vzc2lvbidzIGNvbnRlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFZhbHVlXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIGdldFZhbHVlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQgc2VsZWN0aW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTZWxlY3Rpb25cbiAgICAgKiBAcmV0dXJuIHtTZWxlY3Rpb259IFRoZSBoaWdobGlnaHRlZCBzZWxlY3Rpb25cbiAgICAgKi9cbiAgICBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgcmVzaXplXG4gICAgICogQHBhcmFtIFtmb3JjZV0ge2Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgcmVjb21wdXRlcyB0aGUgc2l6ZSwgZXZlbiBpZiB0aGUgaGVpZ2h0IGFuZCB3aWR0aCBoYXZlbid0IGNoYW5nZWQuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZXNpemUoZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIub25SZXNpemUoZm9yY2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0VGhlbWVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFRoZSBzZXQgdGhlbWVcbiAgICAgKi9cbiAgICBnZXRUaGVtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRUaGVtZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZVxuICAgICAqKi9cbiAgICBzZXRTdHlsZShzdHlsZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U3R5bGUoc3R5bGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGV9XG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGVcbiAgICAgKiovXG4gICAgdW5zZXRTdHlsZShzdHlsZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudW5zZXRTdHlsZShzdHlsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgY3VycmVudCBmb250IHNpemUgb2YgdGhlIGVkaXRvciB0ZXh0LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRGb250U2l6ZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBnZXRGb250U2l6ZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmb250U2l6ZVwiKSB8fCBjb21wdXRlZFN0eWxlKHRoaXMuY29udGFpbmVyLCBcImZvbnRTaXplXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldCBhIG5ldyBmb250IHNpemUgKGluIHBpeGVscykgZm9yIHRoZSBlZGl0b3IgdGV4dC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0Rm9udFNpemVcbiAgICAgKiBAcGFyYW0gZm9udFNpemUge3N0cmluZ30gQSBmb250IHNpemUsIGUuZy4gXCIxMnB4XCIpXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRGb250U2l6ZShmb250U2l6ZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZm9udFNpemVcIiwgZm9udFNpemUpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGhpZ2hsaWdodEJyYWNrZXRzKCkge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlTWFya2VyKHRoaXMuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQgPSB2b2lkIDA7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0UGVuZGluZykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGVyZm9ybSBoaWdobGlnaHQgYXN5bmMgdG8gbm90IGJsb2NrIHRoZSBicm93c2VyIGR1cmluZyBuYXZpZ2F0aW9uXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0UGVuZGluZyA9IHRydWU7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLiRoaWdobGlnaHRQZW5kaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciBwb3MgPSBzZWxmLnNlc3Npb24uZmluZE1hdGNoaW5nQnJhY2tldChzZWxmLmdldEN1cnNvclBvc2l0aW9uKCkpO1xuICAgICAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShwb3Mucm93LCBwb3MuY29sdW1uLCBwb3Mucm93LCBwb3MuY29sdW1uICsgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzZWxmLnNlc3Npb24uJG1vZGUgJiYgc2VsZi5zZXNzaW9uLiRtb2RlLmdldE1hdGNoaW5nKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlOiBSYW5nZSA9IHNlbGYuc2Vzc2lvbi4kbW9kZS5nZXRNYXRjaGluZyhzZWxmLnNlc3Npb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0ID0gc2VsZi5zZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2VfYnJhY2tldFwiLCBcInRleHRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIDUwKTtcbiAgICB9XG5cbiAgICAvLyB0b2RvOiBtb3ZlIHRvIG1vZGUuZ2V0TWF0Y2hpbmdcbiAgICBwcml2YXRlICRoaWdobGlnaHRUYWdzKCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0VGFnUGVuZGluZykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGVyZm9ybSBoaWdobGlnaHQgYXN5bmMgdG8gbm90IGJsb2NrIHRoZSBicm93c2VyIGR1cmluZyBuYXZpZ2F0aW9uXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0VGFnUGVuZGluZyA9IHRydWU7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLiRoaWdobGlnaHRUYWdQZW5kaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciBwb3MgPSBzZWxmLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcihzZWxmLnNlc3Npb24sIHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgdmFyIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG5cbiAgICAgICAgICAgIGlmICghdG9rZW4gfHwgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB0YWcgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIHZhciBkZXB0aCA9IDA7XG4gICAgICAgICAgICB2YXIgcHJldlRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG5cbiAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgLy9maW5kIGNsb3NpbmcgdGFnXG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSB0b2tlbjtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi52YWx1ZSA9PT0gdGFnICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoKys7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoLS07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHRva2VuICYmIGRlcHRoID49IDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgLy9maW5kIG9wZW5pbmcgdGFnXG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IHByZXZUb2tlbjtcbiAgICAgICAgICAgICAgICAgICAgcHJldlRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnZhbHVlID09PSB0YWcgJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPC8nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGgtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHByZXZUb2tlbiAmJiBkZXB0aCA8PSAwKTtcblxuICAgICAgICAgICAgICAgIC8vc2VsZWN0IHRhZyBhZ2FpblxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghdG9rZW4pIHtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiR0YWdIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uJHRhZ0hpZ2hsaWdodCA9IG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcm93ID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCk7XG4gICAgICAgICAgICB2YXIgY29sdW1uID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCk7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2Uocm93LCBjb2x1bW4sIHJvdywgY29sdW1uICsgdG9rZW4udmFsdWUubGVuZ3RoKTtcblxuICAgICAgICAgICAgLy8gUmVtb3ZlIHJhbmdlIGlmIGRpZmZlcmVudFxuICAgICAgICAgICAgaWYgKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCAmJiByYW5nZS5jb21wYXJlUmFuZ2Uoc2Vzc2lvbi4kYmFja01hcmtlcnNbc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0XS5yYW5nZSkgIT09IDApIHtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiR0YWdIaWdobGlnaHQpO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uJHRhZ0hpZ2hsaWdodCA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyYW5nZSAmJiAhc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KVxuICAgICAgICAgICAgICAgIHNlc3Npb24uJHRhZ0hpZ2hsaWdodCA9IHNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9icmFja2V0XCIsIFwidGV4dFwiKTtcbiAgICAgICAgfSwgNTApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEJyaW5ncyB0aGUgY3VycmVudCBgdGV4dElucHV0YCBpbnRvIGZvY3VzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBmb2N1c1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgZm9jdXMoKTogdm9pZCB7XG4gICAgICAgIC8vIFNhZmFyaSBuZWVkcyB0aGUgdGltZW91dFxuICAgICAgICAvLyBpT1MgYW5kIEZpcmVmb3ggbmVlZCBpdCBjYWxsZWQgaW1tZWRpYXRlbHlcbiAgICAgICAgLy8gdG8gYmUgb24gdGhlIHNhdmUgc2lkZSB3ZSBkbyBib3RoXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBfc2VsZi50ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMudGV4dElucHV0LmZvY3VzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGN1cnJlbnQgYHRleHRJbnB1dGAgaXMgaW4gZm9jdXMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGlzRm9jdXNlZFxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy50ZXh0SW5wdXQuaXNGb2N1c2VkKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQmx1cnMgdGhlIGN1cnJlbnQgYHRleHRJbnB1dGAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGJsdXJcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGJsdXIoKTogdm9pZCB7XG4gICAgICAgIHRoaXMudGV4dElucHV0LmJsdXIoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIG9uY2UgdGhlIGVkaXRvciBjb21lcyBpbnRvIGZvY3VzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBvbkZvY3VzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvbkZvY3VzKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kaXNGb2N1c2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaXNGb2N1c2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaG93Q3Vyc29yKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudmlzdWFsaXplRm9jdXMoKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBmb2N1c1xuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChcImZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgb25jZSB0aGUgZWRpdG9yIGhhcyBiZWVuIGJsdXJyZWQuXG4gICAgICogQG1ldGhvZCBvbkJsdXJcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uQmx1cigpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLiRpc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRpc0ZvY3VzZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5oaWRlQ3Vyc29yKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudmlzdWFsaXplQmx1cigpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGJsdXJcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJibHVyXCIpO1xuICAgIH1cblxuICAgICRjdXJzb3JDaGFuZ2UoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlQ3Vyc29yKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuZXZlciB0aGUgZG9jdW1lbnQgaXMgY2hhbmdlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgb25Eb2N1bWVudENoYW5nZVxuICAgICAqIEBwYXJhbSBldmVudCB7RGVsdGFFdmVudH0gQ29udGFpbnMgYSBzaW5nbGUgcHJvcGVydHksIGBkYXRhYCwgd2hpY2ggaGFzIHRoZSBkZWx0YSBvZiBjaGFuZ2VzXG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIG9uRG9jdW1lbnRDaGFuZ2UoZXZlbnQ6IERlbHRhRXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKTogdm9pZCB7XG4gICAgICAgIHZhciBkZWx0YTogRGVsdGEgPSBldmVudC5kYXRhO1xuICAgICAgICB2YXIgcmFuZ2UgPSBkZWx0YS5yYW5nZTtcbiAgICAgICAgdmFyIGxhc3RSb3c6IG51bWJlcjtcblxuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ID09PSByYW5nZS5lbmQucm93ICYmIGRlbHRhLmFjdGlvbiAhPT0gXCJpbnNlcnRMaW5lc1wiICYmIGRlbHRhLmFjdGlvbiAhPT0gXCJyZW1vdmVMaW5lc1wiKSB7XG4gICAgICAgICAgICBsYXN0Um93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGxhc3RSb3cgPSBJbmZpbml0eTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZW5kZXJlcjogVmlydHVhbFJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcjtcbiAgICAgICAgcmVuZGVyZXIudXBkYXRlTGluZXMocmFuZ2Uuc3RhcnQucm93LCBsYXN0Um93LCBzZXNzaW9uLiR1c2VXcmFwTW9kZSk7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VcbiAgICAgICAgICogQHBhcmFtIGV2ZW50IHtEZWx0YUV2ZW50fVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlXCIsIGV2ZW50KTtcblxuICAgICAgICAvLyB1cGRhdGUgY3Vyc29yIGJlY2F1c2UgdGFiIGNoYXJhY3RlcnMgY2FuIGluZmx1ZW5jZSB0aGUgY3Vyc29yIHBvc2l0aW9uXG4gICAgICAgIHRoaXMuJGN1cnNvckNoYW5nZSgpO1xuICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvblRva2VuaXplclVwZGF0ZShldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdmFyIHJvd3MgPSBldmVudC5kYXRhO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUxpbmVzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG9uU2Nyb2xsVG9wQ2hhbmdlKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvWShzZXNzaW9uLmdldFNjcm9sbFRvcCgpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uU2Nyb2xsTGVmdENoYW5nZShldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb1goc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEhhbmRsZXIgZm9yIGN1cnNvciBvciBzZWxlY3Rpb24gY2hhbmdlcy5cbiAgICAgKi9cbiAgICBwcml2YXRlIG9uQ3Vyc29yQ2hhbmdlKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLiRjdXJzb3JDaGFuZ2UoKTtcblxuICAgICAgICBpZiAoIXRoaXMuJGJsb2NrU2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRoaWdobGlnaHRCcmFja2V0cygpO1xuICAgICAgICB0aGlzLiRoaWdobGlnaHRUYWdzKCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgLy8gVE9ETzsgSG93IGlzIHNpZ25hbCBkaWZmZXJlbnQgZnJvbSBlbWl0P1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZVNlbGVjdGlvblxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgIH1cblxuICAgIHB1YmxpYyAkdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpIHtcblxuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcjtcblxuICAgICAgICB2YXIgaGlnaGxpZ2h0O1xuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0QWN0aXZlTGluZSkge1xuICAgICAgICAgICAgaWYgKCh0aGlzLiRzZWxlY3Rpb25TdHlsZSAhPT0gXCJsaW5lXCIgfHwgIXRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkpKSB7XG4gICAgICAgICAgICAgICAgaGlnaGxpZ2h0ID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlbmRlcmVyLiRtYXhMaW5lcyAmJiBzZXNzaW9uLmdldExlbmd0aCgpID09PSAxICYmICEocmVuZGVyZXIuJG1pbkxpbmVzID4gMSkpIHtcbiAgICAgICAgICAgICAgICBoaWdobGlnaHQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyICYmICFoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIubWFya2VySWQpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgJiYgaGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlID0gbmV3IFJhbmdlKGhpZ2hsaWdodC5yb3csIGhpZ2hsaWdodC5jb2x1bW4sIGhpZ2hsaWdodC5yb3csIEluZmluaXR5KTtcbiAgICAgICAgICAgIHJhbmdlLm1hcmtlcklkID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2FjdGl2ZS1saW5lXCIsIFwic2NyZWVuTGluZVwiKTtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgPSByYW5nZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuc3RhcnQucm93ID0gaGlnaGxpZ2h0LnJvdztcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuZW5kLnJvdyA9IGhpZ2hsaWdodC5yb3c7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLnN0YXJ0LmNvbHVtbiA9IGhpZ2hsaWdodC5jb2x1bW47XG4gICAgICAgICAgICBzZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhpcyB2ZXJzaW9uIGhhcyBub3QgYmVlbiBib3VuZCB0byBgdGhpc2AsIHNvIGRvbid0IHVzZSBpdCBkaXJlY3RseS5cbiAgICBwcml2YXRlIG9uU2VsZWN0aW9uQ2hhbmdlKGV2ZW50LCBzZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICBpZiAodHlwZW9mIHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlcik7XG4gICAgICAgICAgICBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLmdldFNlbGVjdGlvblN0eWxlKCk7XG4gICAgICAgICAgICBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2Vfc2VsZWN0aW9uXCIsIHN0eWxlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZTogUmVnRXhwID0gdGhpcy4kaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkICYmIHRoaXMuJGdldFNlbGVjdGlvbkhpZ2hMaWdodFJlZ2V4cCgpO1xuICAgICAgICB0aGlzLnNlc3Npb24uaGlnaGxpZ2h0KHJlKTtcblxuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgfVxuXG4gICAgJGdldFNlbGVjdGlvbkhpZ2hMaWdodFJlZ2V4cCgpOiBSZWdFeHAge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSB8fCBzZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgc3RhcnRPdXRlciA9IHNlbGVjdGlvbi5zdGFydC5jb2x1bW4gLSAxO1xuICAgICAgICB2YXIgZW5kT3V0ZXIgPSBzZWxlY3Rpb24uZW5kLmNvbHVtbiArIDE7XG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKHNlbGVjdGlvbi5zdGFydC5yb3cpO1xuICAgICAgICB2YXIgbGluZUNvbHMgPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgdmFyIG5lZWRsZSA9IGxpbmUuc3Vic3RyaW5nKE1hdGgubWF4KHN0YXJ0T3V0ZXIsIDApLFxuICAgICAgICAgICAgTWF0aC5taW4oZW5kT3V0ZXIsIGxpbmVDb2xzKSk7XG5cbiAgICAgICAgLy8gTWFrZSBzdXJlIHRoZSBvdXRlciBjaGFyYWN0ZXJzIGFyZSBub3QgcGFydCBvZiB0aGUgd29yZC5cbiAgICAgICAgaWYgKChzdGFydE91dGVyID49IDAgJiYgL15bXFx3XFxkXS8udGVzdChuZWVkbGUpKSB8fFxuICAgICAgICAgICAgKGVuZE91dGVyIDw9IGxpbmVDb2xzICYmIC9bXFx3XFxkXSQvLnRlc3QobmVlZGxlKSkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgbmVlZGxlID0gbGluZS5zdWJzdHJpbmcoc2VsZWN0aW9uLnN0YXJ0LmNvbHVtbiwgc2VsZWN0aW9uLmVuZC5jb2x1bW4pO1xuICAgICAgICBpZiAoIS9eW1xcd1xcZF0rJC8udGVzdChuZWVkbGUpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vIFdoZW4gdGhlIG5lZWRsZSBpcyBhIHN0cmluZywgdGhlIHJldHVybiB0eXBlIHdpbGwgYmUgYSBSZWdFeHAuXG4gICAgICAgIC8vIFRPRE86IFNwbGl0IG91dCB0aGlzIGZ1bmN0aW9uYWxpdHkgZm9yIGNsZWFuZXIgdHlwZSBzYWZldHkuXG4gICAgICAgIHZhciByZSA9IDxSZWdFeHA+dGhpcy4kc2VhcmNoLiRhc3NlbWJsZVJlZ0V4cCh7XG4gICAgICAgICAgICB3aG9sZVdvcmQ6IHRydWUsXG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlOiB0cnVlLFxuICAgICAgICAgICAgbmVlZGxlOiBuZWVkbGVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25DaGFuZ2VGcm9udE1hcmtlclxuICAgICAqIEBwYXJhbSBldmVudFxuICAgICAqIEBwYXJhbSBzZXNzaW9uIHtFZGl0U2Vzc2lvbn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBvbkNoYW5nZUZyb250TWFya2VyKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICB0aGlzLnVwZGF0ZUZyb250TWFya2VycygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdXBkYXRlRnJvbnRNYXJrZXJzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgdXBkYXRlRnJvbnRNYXJrZXJzKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZyb250TWFya2VycygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25DaGFuZ2VCYWNrTWFya2VyXG4gICAgICogQHBhcmFtIGV2ZW50XG4gICAgICogQHBhcmFtIHNlc3Npb24ge0VkaXRTZXNzaW9ufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIG9uQ2hhbmdlQmFja01hcmtlcihldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCYWNrTWFya2VycygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdXBkYXRlQmFja01hcmtlcnNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyB1cGRhdGVCYWNrTWFya2VycygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCYWNrTWFya2VycygpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VCcmVha3BvaW50KGV2ZW50LCBlZGl0U2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCcmVha3BvaW50cygpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUJyZWFrcG9pbnRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VCcmVha3BvaW50XCIsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlQW5ub3RhdGlvbihldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRBbm5vdGF0aW9ucyhzZXNzaW9uLmdldEFubm90YXRpb25zKCkpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUFubm90YXRpb25cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIGV2ZW50KTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgb25DaGFuZ2VNb2RlKGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZVRleHQoKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VNb2RlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlTW9kZVwiLCBldmVudCk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlV3JhcExpbWl0KGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlV3JhcE1vZGUoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIub25SZXNpemUodHJ1ZSk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlRm9sZChldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgLy8gVXBkYXRlIHRoZSBhY3RpdmUgbGluZSBtYXJrZXIgYXMgZHVlIHRvIGZvbGRpbmcgY2hhbmdlcyB0aGUgY3VycmVudFxuICAgICAgICAvLyBsaW5lIHJhbmdlIG9uIHRoZSBzY3JlZW4gbWlnaHQgaGF2ZSBjaGFuZ2VkLlxuICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIC8vIFRPRE86IFRoaXMgbWlnaHQgYmUgdG9vIG11Y2ggdXBkYXRpbmcuIE9rYXkgZm9yIG5vdy5cbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGdWxsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIG9mIHRleHQgY3VycmVudGx5IGhpZ2hsaWdodGVkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTZWxlY3RlZFRleHRcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgZ2V0U2VsZWN0ZWRUZXh0KCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgY29waWVkLlxuICAgICAqIEBldmVudCBjb3B5XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIGNvcGllZCB0ZXh0XG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIG9mIHRleHQgY3VycmVudGx5IGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICAgKiBAZGVwcmVjYXRlZCBVc2UgZ2V0U2VsZWN0ZWRUZXh0IGluc3RlYWQuXG4gICAgICoqL1xuICAgIGdldENvcHlUZXh0KCkge1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0U2VsZWN0ZWRUZXh0KCk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY29weVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY29weVwiLCB0ZXh0KTtcbiAgICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImNvcHlcIiBoYXBwZW5zLlxuICAgICAqKi9cbiAgICBvbkNvcHkoKSB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhcImNvcHlcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImN1dFwiIGhhcHBlbnMuXG4gICAgICoqL1xuICAgIG9uQ3V0KCkge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoXCJjdXRcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgcGFzdGVkLlxuICAgICAqIEBldmVudCBwYXN0ZVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBwYXN0ZWQgdGV4dFxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcInBhc3RlXCIgaGFwcGVucy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgcGFzdGVkIHRleHRcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uUGFzdGUodGV4dDogc3RyaW5nKSB7XG4gICAgICAgIC8vIHRvZG8gdGhpcyBzaG91bGQgY2hhbmdlIHdoZW4gcGFzdGUgYmVjb21lcyBhIGNvbW1hbmRcbiAgICAgICAgaWYgKHRoaXMuJHJlYWRPbmx5KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgZSA9IHsgdGV4dDogdGV4dCB9O1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IHBhc3RlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJwYXN0ZVwiLCBlKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoZS50ZXh0LCB0cnVlKTtcbiAgICB9XG5cblxuICAgIGV4ZWNDb21tYW5kKGNvbW1hbmQsIGFyZ3M/KTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhjb21tYW5kLCB0aGlzLCBhcmdzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGB0ZXh0YCBpbnRvIHdoZXJldmVyIHRoZSBjdXJzb3IgaXMgcG9pbnRpbmcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGluc2VydFxuICAgICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IFRoZSBuZXcgdGV4dCB0byBhZGQuXG4gICAgICogQHBhcmFtIFtwYXN0ZWRdIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgaW5zZXJ0KHRleHQ6IHN0cmluZywgcGFzdGVkPzogYm9vbGVhbik6IHZvaWQge1xuXG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgbW9kZSA9IHNlc3Npb24uZ2V0TW9kZSgpO1xuICAgICAgICB2YXIgY3Vyc29yOiBQb3NpdGlvbiA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHRyYW5zZm9ybTogVGV4dEFuZFNlbGVjdGlvbjtcblxuICAgICAgICBpZiAodGhpcy5nZXRCZWhhdmlvdXJzRW5hYmxlZCgpICYmICFwYXN0ZWQpIHtcbiAgICAgICAgICAgIC8vIEdldCBhIHRyYW5zZm9ybSBpZiB0aGUgY3VycmVudCBtb2RlIHdhbnRzIG9uZS5cbiAgICAgICAgICAgIHRyYW5zZm9ybSA9IG1vZGUgJiYgPFRleHRBbmRTZWxlY3Rpb24+bW9kZS50cmFuc2Zvcm1BY3Rpb24oc2Vzc2lvbi5nZXRTdGF0ZShjdXJzb3Iucm93KSwgJ2luc2VydGlvbicsIHRoaXMsIHNlc3Npb24sIHRleHQpO1xuICAgICAgICAgICAgaWYgKHRyYW5zZm9ybSkge1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0ICE9PSB0cmFuc2Zvcm0udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb24ubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJG1lcmdlTmV4dENvbW1hbmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGV4dCA9IHRyYW5zZm9ybS50ZXh0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRleHQgPT09IFwiXFx0XCIpIHtcbiAgICAgICAgICAgIHRleHQgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU3RyaW5nKCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW1vdmUgc2VsZWN0ZWQgdGV4dC5cbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgICAgIGN1cnNvciA9IHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhjdXJzb3IsIGN1cnNvcik7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uICs9IHRleHQubGVuZ3RoO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGV4dCA9PT0gXCJcXG5cIiB8fCB0ZXh0ID09PSBcIlxcclxcblwiKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgICAgIGlmIChjdXJzb3IuY29sdW1uID4gbGluZS5zZWFyY2goL1xcU3wkLykpIHtcbiAgICAgICAgICAgICAgICB2YXIgZCA9IGxpbmUuc3Vic3RyKGN1cnNvci5jb2x1bW4pLnNlYXJjaCgvXFxTfCQvKTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmRvYy5yZW1vdmVJbkxpbmUoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbiwgY3Vyc29yLmNvbHVtbiArIGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuXG4gICAgICAgIHZhciBzdGFydCA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lU3RhdGUgPSBzZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHNob3VsZE91dGRlbnQgPSBtb2RlLmNoZWNrT3V0ZGVudChsaW5lU3RhdGUsIGxpbmUsIHRleHQpO1xuICAgICAgICB2YXIgZW5kID0gc2Vzc2lvbi5pbnNlcnQoY3Vyc29yLCB0ZXh0KTtcblxuICAgICAgICBpZiAodHJhbnNmb3JtICYmIHRyYW5zZm9ybS5zZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGlmICh0cmFuc2Zvcm0uc2VsZWN0aW9uLmxlbmd0aCA9PT0gMikgeyAvLyBUcmFuc2Zvcm0gcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgY29sdW1uXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBSYW5nZShjdXJzb3Iucm93LCBzdGFydCArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJzb3Iucm93LCBzdGFydCArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMV0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgeyAvLyBUcmFuc2Zvcm0gcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgcm93LlxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBuZXcgUmFuZ2UoY3Vyc29yLnJvdyArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0uc2VsZWN0aW9uWzFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3Vyc29yLnJvdyArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMl0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0uc2VsZWN0aW9uWzNdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2Vzc2lvbi5nZXREb2N1bWVudCgpLmlzTmV3TGluZSh0ZXh0KSkge1xuICAgICAgICAgICAgdmFyIGxpbmVJbmRlbnQgPSBtb2RlLmdldE5leHRMaW5lSW5kZW50KGxpbmVTdGF0ZSwgbGluZS5zbGljZSgwLCBjdXJzb3IuY29sdW1uKSwgc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKSk7XG4gICAgICAgICAgICBzZXNzaW9uLmluc2VydCh7IHJvdzogY3Vyc29yLnJvdyArIDEsIGNvbHVtbjogMCB9LCBsaW5lSW5kZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzaG91bGRPdXRkZW50KSB7XG4gICAgICAgICAgICBtb2RlLmF1dG9PdXRkZW50KGxpbmVTdGF0ZSwgc2Vzc2lvbiwgY3Vyc29yLnJvdyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIG9uXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFjayB7KGV2ZW50LCBlZGl0b3IpID0+IGFueX1cbiAgICAgKiBAcGFyYW0gW2NhcHR1cmluZ10gYm9vbGVhblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb24oZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZGF0YTogYW55LCBlZGl0b3I6IEVkaXRvcikgPT4gYW55LCBjYXB0dXJpbmc/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oZXZlbnROYW1lLCBjYWxsYmFjaywgY2FwdHVyaW5nKVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb2ZmXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFja1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb2ZmKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGRhdGE6IGFueSwgc291cmNlOiBFZGl0b3IpID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9mZihldmVudE5hbWUsIGNhbGxiYWNrKVxuICAgIH1cblxuICAgIHNldERlZmF1bHRIYW5kbGVyKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGRhdGE6IGFueSwgc291cmNlOiBFZGl0b3IpID0+IGFueSkge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLnNldERlZmF1bHRIYW5kbGVyKGV2ZW50TmFtZSwgY2FsbGJhY2spXG4gICAgfVxuXG4gICAgX2VtaXQoZXZlbnROYW1lOiBzdHJpbmcsIGV2ZW50PzogYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoZXZlbnROYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgX3NpZ25hbChldmVudE5hbWU6IHN0cmluZywgZXZlbnQ/OiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKGV2ZW50TmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIGhhc0xpc3RlbmVycyhldmVudE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5ldmVudEJ1cy5oYXNMaXN0ZW5lcnMoZXZlbnROYW1lKTtcbiAgICB9XG5cbiAgICBvblRleHRJbnB1dCh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nLm9uVGV4dElucHV0KHRleHQpO1xuICAgICAgICAvLyBUT0RPOiBUaGlzIHNob3VsZCBiZSBwbHVnZ2FibGUuXG4gICAgICAgIGlmICh0ZXh0ID09PSAnLicpIHtcbiAgICAgICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhDT01NQU5EX05BTUVfQVVUT19DT01QTEVURSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5nZXRTZXNzaW9uKCkuZ2V0RG9jdW1lbnQoKS5pc05ld0xpbmUodGV4dCkpIHtcbiAgICAgICAgICAgIHZhciBsaW5lTnVtYmVyID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgdmFyIG9wdGlvbiA9IG5ldyBTZXJ2aWNlcy5FZGl0b3JPcHRpb25zKCk7XG4gICAgICAgICAgICAvLyAgICAgICAgICAgIG9wdGlvbi5OZXdMaW5lQ2hhcmFjdGVyID0gXCJcXG5cIjtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBTbWFydCBJbmRlbnRpbmdcbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICB2YXIgaW5kZW50ID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldFNtYXJ0SW5kZW50QXRMaW5lTnVtYmVyKGN1cnJlbnRGaWxlTmFtZSwgbGluZU51bWJlciwgb3B0aW9uKTtcbiAgICAgICAgICAgIGlmKGluZGVudCA+IDApXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmNvbW1hbmRzLmV4ZWMoXCJpbnNlcnR0ZXh0XCIsIGVkaXRvciwge3RleHQ6XCIgXCIsIHRpbWVzOmluZGVudH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgKi9cbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uQ29tbWFuZEtleShlLCBoYXNoSWQ6IG51bWJlciwga2V5Q29kZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMua2V5QmluZGluZy5vbkNvbW1hbmRLZXkoZSwgaGFzaElkLCBrZXlDb2RlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXNzIGluIGB0cnVlYCB0byBlbmFibGUgb3ZlcndyaXRlcyBpbiB5b3VyIHNlc3Npb24sIG9yIGBmYWxzZWAgdG8gZGlzYWJsZS4gSWYgb3ZlcndyaXRlcyBpcyBlbmFibGVkLCBhbnkgdGV4dCB5b3UgZW50ZXIgd2lsbCB0eXBlIG92ZXIgYW55IHRleHQgYWZ0ZXIgaXQuIElmIHRoZSB2YWx1ZSBvZiBgb3ZlcndyaXRlYCBjaGFuZ2VzLCB0aGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgY2hhbmdlT3ZlcndyaXRlYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IG92ZXJ3cml0ZSBEZWZpbmVzIHdoZXRlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2V0T3ZlcndyaXRlXG4gICAgICoqL1xuICAgIHNldE92ZXJ3cml0ZShvdmVyd3JpdGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnNldE92ZXJ3cml0ZShvdmVyd3JpdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIG92ZXJ3cml0ZXMgYXJlIGVuYWJsZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0T3ZlcndyaXRlXG4gICAgICoqL1xuICAgIGdldE92ZXJ3cml0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZSBvZiBvdmVyd3JpdGUgdG8gdGhlIG9wcG9zaXRlIG9mIHdoYXRldmVyIGl0IGN1cnJlbnRseSBpcy5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgdG9nZ2xlT3ZlcndyaXRlKCkge1xuICAgICAgICB0aGlzLnNlc3Npb24udG9nZ2xlT3ZlcndyaXRlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBob3cgZmFzdCB0aGUgbW91c2Ugc2Nyb2xsaW5nIHNob3VsZCBkby5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc3BlZWQgQSB2YWx1ZSBpbmRpY2F0aW5nIHRoZSBuZXcgc3BlZWQgKGluIG1pbGxpc2Vjb25kcylcbiAgICAgKiovXG4gICAgc2V0U2Nyb2xsU3BlZWQoc3BlZWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNjcm9sbFNwZWVkXCIsIHNwZWVkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBpbmRpY2F0aW5nIGhvdyBmYXN0IHRoZSBtb3VzZSBzY3JvbGwgc3BlZWQgaXMgKGluIG1pbGxpc2Vjb25kcykuXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXRTY3JvbGxTcGVlZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzY3JvbGxTcGVlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBkZWxheSAoaW4gbWlsbGlzZWNvbmRzKSBvZiB0aGUgbW91c2UgZHJhZy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZHJhZ0RlbGF5IEEgdmFsdWUgaW5kaWNhdGluZyB0aGUgbmV3IGRlbGF5XG4gICAgICoqL1xuICAgIHNldERyYWdEZWxheShkcmFnRGVsYXk6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRyYWdEZWxheVwiLCBkcmFnRGVsYXkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbW91c2UgZHJhZyBkZWxheS5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIGdldERyYWdEZWxheSgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJkcmFnRGVsYXlcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHJhdyBzZWxlY3Rpb24gbWFya2VycyBzcGFubmluZyB3aG9sZSBsaW5lLCBvciBvbmx5IG92ZXIgc2VsZWN0ZWQgdGV4dC5cbiAgICAgKlxuICAgICAqIERlZmF1bHQgdmFsdWUgaXMgXCJsaW5lXCJcbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2VsZWN0aW9uU3R5bGVcbiAgICAgKiBAcGFyYW0gc2VsZWN0aW9uU3R5bGUge3N0cmluZ30gVGhlIG5ldyBzZWxlY3Rpb24gc3R5bGUgXCJsaW5lXCJ8XCJ0ZXh0XCJcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFNlbGVjdGlvblN0eWxlKHNlbGVjdGlvblN0eWxlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzZWxlY3Rpb25TdHlsZVwiLCBzZWxlY3Rpb25TdHlsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZWxlY3Rpb24gc3R5bGUuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNlbGVjdGlvblN0eWxlXG4gICAgICogQHJldHVybiB7U3RyaW5nfVxuICAgICAqL1xuICAgIGdldFNlbGVjdGlvblN0eWxlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNlbGVjdGlvblN0eWxlXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgd2hldGhlciBvciBub3QgdGhlIGN1cnJlbnQgbGluZSBzaG91bGQgYmUgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG91bGRIaWdobGlnaHQgU2V0IHRvIGB0cnVlYCB0byBoaWdobGlnaHQgdGhlIGN1cnJlbnQgbGluZVxuICAgICAqKi9cbiAgICBzZXRIaWdobGlnaHRBY3RpdmVMaW5lKHNob3VsZEhpZ2hsaWdodDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodEFjdGl2ZUxpbmVcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBjdXJyZW50IGxpbmVzIGFyZSBhbHdheXMgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0SGlnaGxpZ2h0QWN0aXZlTGluZSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiaGlnaGxpZ2h0QWN0aXZlTGluZVwiKTtcbiAgICB9XG5cbiAgICBzZXRIaWdobGlnaHRHdXR0ZXJMaW5lKHNob3VsZEhpZ2hsaWdodDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICBnZXRIaWdobGlnaHRHdXR0ZXJMaW5lKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgaWYgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCB3b3JkIHNob3VsZCBiZSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3VsZEhpZ2hsaWdodCBTZXQgdG8gYHRydWVgIHRvIGhpZ2hsaWdodCB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHdvcmRcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgY3VycmVudGx5IGhpZ2hsaWdodGVkIHdvcmRzIGFyZSB0byBiZSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiRoaWdobGlnaHRTZWxlY3RlZFdvcmQ7XG4gICAgfVxuXG4gICAgc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGUpO1xuICAgIH1cblxuICAgIGdldEFuaW1hdGVkU2Nyb2xsKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRBbmltYXRlZFNjcm9sbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGBzaG93SW52aXNpYmxlc2AgaXMgc2V0IHRvIGB0cnVlYCwgaW52aXNpYmxlIGNoYXJhY3RlcnMmbWRhc2g7bGlrZSBzcGFjZXMgb3IgbmV3IGxpbmVzJm1kYXNoO2FyZSBzaG93IGluIHRoZSBlZGl0b3IuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNob3dJbnZpc2libGVzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93SW52aXNpYmxlcyBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gc2hvdyBpbnZpc2libGUgY2hhcmFjdGVycy5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGludmlzaWJsZSBjaGFyYWN0ZXJzIGFyZSBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRTaG93SW52aXNpYmxlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMoKTtcbiAgICB9XG5cbiAgICBzZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXMpO1xuICAgIH1cblxuICAgIGdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiBgc2hvd1ByaW50TWFyZ2luYCBpcyBzZXQgdG8gYHRydWVgLCB0aGUgcHJpbnQgbWFyZ2luIGlzIHNob3duIGluIHRoZSBlZGl0b3IuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93UHJpbnRNYXJnaW4gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIHNob3cgdGhlIHByaW50IG1hcmdpblxuICAgICAqKi9cbiAgICBzZXRTaG93UHJpbnRNYXJnaW4oc2hvd1ByaW50TWFyZ2luOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHByaW50IG1hcmdpbiBpcyBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dQcmludE1hcmdpbigpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0U2hvd1ByaW50TWFyZ2luKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgY29sdW1uIGRlZmluaW5nIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gc2hvdWxkIGJlLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzaG93UHJpbnRNYXJnaW4gU3BlY2lmaWVzIHRoZSBuZXcgcHJpbnQgbWFyZ2luXG4gICAgICovXG4gICAgc2V0UHJpbnRNYXJnaW5Db2x1bW4oc2hvd1ByaW50TWFyZ2luOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRQcmludE1hcmdpbkNvbHVtbihzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGNvbHVtbiBudW1iZXIgb2Ygd2hlcmUgdGhlIHByaW50IG1hcmdpbiBpcy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICovXG4gICAgZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiBgcmVhZE9ubHlgIGlzIHRydWUsIHRoZW4gdGhlIGVkaXRvciBpcyBzZXQgdG8gcmVhZC1vbmx5IG1vZGUsIGFuZCBub25lIG9mIHRoZSBjb250ZW50IGNhbiBjaGFuZ2UuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFJlYWRPbmx5XG4gICAgICogQHBhcmFtIHtCb29sZWFufSByZWFkT25seSBTcGVjaWZpZXMgd2hldGhlciB0aGUgZWRpdG9yIGNhbiBiZSBtb2RpZmllZCBvciBub3QuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRSZWFkT25seShyZWFkT25seTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInJlYWRPbmx5XCIsIHJlYWRPbmx5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZWRpdG9yIGlzIHNldCB0byByZWFkLW9ubHkgbW9kZS5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRSZWFkT25seSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwicmVhZE9ubHlcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BlY2lmaWVzIHdoZXRoZXIgdG8gdXNlIGJlaGF2aW9ycyBvciBub3QuIFtcIkJlaGF2aW9yc1wiIGluIHRoaXMgY2FzZSBpcyB0aGUgYXV0by1wYWlyaW5nIG9mIHNwZWNpYWwgY2hhcmFjdGVycywgbGlrZSBxdW90YXRpb24gbWFya3MsIHBhcmVudGhlc2lzLCBvciBicmFja2V0cy5dezogI0JlaGF2aW9yc0RlZn1cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZWQgRW5hYmxlcyBvciBkaXNhYmxlcyBiZWhhdmlvcnNcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRCZWhhdmlvdXJzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiYmVoYXZpb3Vyc0VuYWJsZWRcIiwgZW5hYmxlZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGJlaGF2aW9ycyBhcmUgY3VycmVudGx5IGVuYWJsZWQuIHs6QmVoYXZpb3JzRGVmfVxuICAgICAqXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0QmVoYXZpb3Vyc0VuYWJsZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImJlaGF2aW91cnNFbmFibGVkXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwZWNpZmllcyB3aGV0aGVyIHRvIHVzZSB3cmFwcGluZyBiZWhhdmlvcnMgb3Igbm90LCBpLmUuIGF1dG9tYXRpY2FsbHkgd3JhcHBpbmcgdGhlIHNlbGVjdGlvbiB3aXRoIGNoYXJhY3RlcnMgc3VjaCBhcyBicmFja2V0c1xuICAgICAqIHdoZW4gc3VjaCBhIGNoYXJhY3RlciBpcyB0eXBlZCBpbi5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZWQgRW5hYmxlcyBvciBkaXNhYmxlcyB3cmFwcGluZyBiZWhhdmlvcnNcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcIndyYXBCZWhhdmlvdXJzRW5hYmxlZFwiLCBlbmFibGVkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgd3JhcHBpbmcgYmVoYXZpb3JzIGFyZSBjdXJyZW50bHkgZW5hYmxlZC5cbiAgICAgKiovXG4gICAgZ2V0V3JhcEJlaGF2aW91cnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJ3cmFwQmVoYXZpb3Vyc0VuYWJsZWRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kaWNhdGVzIHdoZXRoZXIgdGhlIGZvbGQgd2lkZ2V0cyBzaG91bGQgYmUgc2hvd24gb3Igbm90LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdyBTcGVjaWZpZXMgd2hldGhlciB0aGUgZm9sZCB3aWRnZXRzIGFyZSBzaG93blxuICAgICAqKi9cbiAgICBzZXRTaG93Rm9sZFdpZGdldHMoc2hvdzogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNob3dGb2xkV2lkZ2V0c1wiLCBzaG93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZm9sZCB3aWRnZXRzIGFyZSBzaG93bi5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqL1xuICAgIGdldFNob3dGb2xkV2lkZ2V0cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2hvd0ZvbGRXaWRnZXRzXCIpO1xuICAgIH1cblxuICAgIHNldEZhZGVGb2xkV2lkZ2V0cyhmYWRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIsIGZhZGUpO1xuICAgIH1cblxuICAgIGdldEZhZGVGb2xkV2lkZ2V0cygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZmFkZUZvbGRXaWRnZXRzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgd29yZHMgb2YgdGV4dCBmcm9tIHRoZSBlZGl0b3IuXG4gICAgICogQSBcIndvcmRcIiBpcyBkZWZpbmVkIGFzIGEgc3RyaW5nIG9mIGNoYXJhY3RlcnMgYm9va2VuZGVkIGJ5IHdoaXRlc3BhY2UuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlbW92ZVxuICAgICAqIEBwYXJhbSBkaXJlY3Rpb24ge3N0cmluZ30gVGhlIGRpcmVjdGlvbiBvZiB0aGUgZGVsZXRpb24gdG8gb2NjdXIsIGVpdGhlciBcImxlZnRcIiBvciBcInJpZ2h0XCIuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZW1vdmUoZGlyZWN0aW9uOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgaWYgKGRpcmVjdGlvbiA9PT0gXCJsZWZ0XCIpXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0TGVmdCgpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFJpZ2h0KCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmICh0aGlzLmdldEJlaGF2aW91cnNFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICAgICAgdmFyIHN0YXRlID0gc2Vzc2lvbi5nZXRTdGF0ZShzZWxlY3Rpb25SYW5nZS5zdGFydC5yb3cpO1xuICAgICAgICAgICAgdmFyIG5ld1JhbmdlOiBSYW5nZSA9IDxSYW5nZT5zZXNzaW9uLmdldE1vZGUoKS50cmFuc2Zvcm1BY3Rpb24oc3RhdGUsICdkZWxldGlvbicsIHRoaXMsIHNlc3Npb24sIHNlbGVjdGlvblJhbmdlKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGlvblJhbmdlLmVuZC5jb2x1bW4gPT09IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHNlbGVjdGlvblJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAodGV4dFt0ZXh0Lmxlbmd0aCAtIDFdID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKHNlbGVjdGlvblJhbmdlLmVuZC5yb3cpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoL15cXHMrJC8udGVzdChsaW5lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2VsZWN0aW9uUmFuZ2UuZW5kLmNvbHVtbiA9IGxpbmUubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKG5ld1JhbmdlKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uUmFuZ2UgPSBuZXdSYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUoc2VsZWN0aW9uUmFuZ2UpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgd29yZCBkaXJlY3RseSB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCByZW1vdmVXb3JkUmlnaHRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHJlbW92ZVdvcmRSaWdodCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZFJpZ2h0KCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSB3b3JkIGRpcmVjdGx5IHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgcmVtb3ZlV29yZExlZnRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHJlbW92ZVdvcmRMZWZ0KCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZExlZnQoKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCB0aGUgd29yZHMgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCB1bnRpbCB0aGUgc3RhcnQgb2YgdGhlIGxpbmUuXG4gICAgICoqL1xuICAgIHJlbW92ZVRvTGluZVN0YXJ0KCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0TGluZVN0YXJ0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIHdvcmRzIHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24sIHVudGlsIHRoZSBlbmQgb2YgdGhlIGxpbmUuXG4gICAgICoqL1xuICAgIHJlbW92ZVRvTGluZUVuZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExpbmVFbmQoKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5jb2x1bW4gPT09IHJhbmdlLmVuZC5jb2x1bW4gJiYgcmFuZ2Uuc3RhcnQucm93ID09PSByYW5nZS5lbmQucm93KSB7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3crKztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BsaXRzIHRoZSBsaW5lIGF0IHRoZSBjdXJyZW50IHNlbGVjdGlvbiAoYnkgaW5zZXJ0aW5nIGFuIGAnXFxuJ2ApLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzcGxpdExpbmVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNwbGl0TGluZSgpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHRoaXMuaW5zZXJ0KFwiXFxuXCIsIGZhbHNlKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihjdXJzb3IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyYW5zcG9zZXMgY3VycmVudCBsaW5lLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB0cmFuc3Bvc2VMZXR0ZXJzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICB0cmFuc3Bvc2VMZXR0ZXJzKCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIGlmIChjb2x1bW4gPT09IDApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHN3YXAsIHJhbmdlO1xuICAgICAgICBpZiAoY29sdW1uIDwgbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHN3YXAgPSBsaW5lLmNoYXJBdChjb2x1bW4pICsgbGluZS5jaGFyQXQoY29sdW1uIC0gMSk7XG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShjdXJzb3Iucm93LCBjb2x1bW4gLSAxLCBjdXJzb3Iucm93LCBjb2x1bW4gKyAxKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHN3YXAgPSBsaW5lLmNoYXJBdChjb2x1bW4gLSAxKSArIGxpbmUuY2hhckF0KGNvbHVtbiAtIDIpO1xuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoY3Vyc29yLnJvdywgY29sdW1uIC0gMiwgY3Vyc29yLnJvdywgY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgc3dhcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udmVydHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGVudGlyZWx5IGludG8gbG93ZXJjYXNlLlxuICAgICAqKi9cbiAgICB0b0xvd2VyQ2FzZSgpIHtcbiAgICAgICAgdmFyIG9yaWdpbmFsUmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHRleHQgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHRleHQudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKG9yaWdpbmFsUmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBlbnRpcmVseSBpbnRvIHVwcGVyY2FzZS5cbiAgICAgKiovXG4gICAgdG9VcHBlckNhc2UoKSB7XG4gICAgICAgIHZhciBvcmlnaW5hbFJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCB0ZXh0LnRvVXBwZXJDYXNlKCkpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShvcmlnaW5hbFJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGFuIGluZGVudGF0aW9uIGludG8gdGhlIGN1cnJlbnQgY3Vyc29yIHBvc2l0aW9uIG9yIGluZGVudHMgdGhlIHNlbGVjdGVkIGxpbmVzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpbmRlbnRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIGluZGVudCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcblxuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93IDwgcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgICAgIHNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHJhbmdlLnN0YXJ0LmNvbHVtbiA8IHJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciB0ZXh0ID0gc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKCEvXlxccyskLy50ZXN0KHRleHQpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmluZGVudFJvd3Mocm93cy5maXJzdCwgcm93cy5sYXN0LCBcIlxcdFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShyYW5nZS5zdGFydC5yb3cpO1xuICAgICAgICB2YXIgcG9zaXRpb24gPSByYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIHNpemUgPSBzZXNzaW9uLmdldFRhYlNpemUoKTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IHNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtbihwb3NpdGlvbi5yb3csIHBvc2l0aW9uLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VTb2Z0VGFicygpKSB7XG4gICAgICAgICAgICB2YXIgY291bnQgPSAoc2l6ZSAtIGNvbHVtbiAlIHNpemUpO1xuICAgICAgICAgICAgdmFyIGluZGVudFN0cmluZyA9IHN0cmluZ1JlcGVhdChcIiBcIiwgY291bnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGNvdW50ID0gY29sdW1uICUgc2l6ZTtcbiAgICAgICAgICAgIHdoaWxlIChsaW5lW3JhbmdlLnN0YXJ0LmNvbHVtbl0gPT09IFwiIFwiICYmIGNvdW50KSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgY291bnQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGluZGVudFN0cmluZyA9IFwiXFx0XCI7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuaW5zZXJ0KGluZGVudFN0cmluZywgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGVudHMgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgYmxvY2tJbmRlbnRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmluZGVudFJvd3NcbiAgICAgKi9cbiAgICBibG9ja0luZGVudCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmluZGVudFJvd3Mocm93cy5maXJzdCwgcm93cy5sYXN0LCBcIlxcdFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBPdXRkZW50cyB0aGUgY3VycmVudCBsaW5lLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm91dGRlbnRSb3dzXG4gICAgICoqL1xuICAgIGJsb2NrT3V0ZGVudCgpIHtcbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLm91dGRlbnRSb3dzKHNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvLyBUT0RPOiBtb3ZlIG91dCBvZiBjb3JlIHdoZW4gd2UgaGF2ZSBnb29kIG1lY2hhbmlzbSBmb3IgbWFuYWdpbmcgZXh0ZW5zaW9uc1xuICAgIHNvcnRMaW5lcygpIHtcbiAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgdmFyIGxpbmVzID0gW107XG4gICAgICAgIGZvciAoaSA9IHJvd3MuZmlyc3Q7IGkgPD0gcm93cy5sYXN0OyBpKyspXG4gICAgICAgICAgICBsaW5lcy5wdXNoKHNlc3Npb24uZ2V0TGluZShpKSk7XG5cbiAgICAgICAgbGluZXMuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICBpZiAoYS50b0xvd2VyQ2FzZSgpIDwgYi50b0xvd2VyQ2FzZSgpKSByZXR1cm4gLTE7XG4gICAgICAgICAgICBpZiAoYS50b0xvd2VyQ2FzZSgpID4gYi50b0xvd2VyQ2FzZSgpKSByZXR1cm4gMTtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgZGVsZXRlUmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgIGZvciAodmFyIGkgPSByb3dzLmZpcnN0OyBpIDw9IHJvd3MubGFzdDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShpKTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LnJvdyA9IGk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQucm93ID0gaTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgICAgIHNlc3Npb24ucmVwbGFjZShkZWxldGVSYW5nZSwgbGluZXNbaSAtIHJvd3MuZmlyc3RdKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdpdmVuIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgcmFuZ2UsIHRoaXMgZnVuY3Rpb24gZWl0aGVyIGNvbW1lbnRzIGFsbCB0aGUgbGluZXMsIG9yIHVuY29tbWVudHMgYWxsIG9mIHRoZW0uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHRvZ2dsZUNvbW1lbnRMaW5lc1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgdG9nZ2xlQ29tbWVudExpbmVzKCk6IHZvaWQge1xuICAgICAgICB2YXIgc3RhdGUgPSB0aGlzLnNlc3Npb24uZ2V0U3RhdGUodGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyk7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRNb2RlKCkudG9nZ2xlQ29tbWVudExpbmVzKHN0YXRlLCB0aGlzLnNlc3Npb24sIHJvd3MuZmlyc3QsIHJvd3MubGFzdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB0b2dnbGVCbG9ja0NvbW1lbnRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHRvZ2dsZUJsb2NrQ29tbWVudCgpOiB2b2lkIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5zZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRNb2RlKCkudG9nZ2xlQmxvY2tDb21tZW50KHN0YXRlLCB0aGlzLnNlc3Npb24sIHJhbmdlLCBjdXJzb3IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFdvcmtzIGxpa2UgW1tFZGl0U2Vzc2lvbi5nZXRUb2tlbkF0XV0sIGV4Y2VwdCBpdCByZXR1cm5zIGEgbnVtYmVyLlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKiovXG4gICAgZ2V0TnVtYmVyQXQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyB2YWx1ZTogc3RyaW5nOyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlciB9IHtcbiAgICAgICAgdmFyIF9udW1iZXJSeCA9IC9bXFwtXT9bMC05XSsoPzpcXC5bMC05XSspPy9nO1xuICAgICAgICBfbnVtYmVyUngubGFzdEluZGV4ID0gMDtcblxuICAgICAgICB2YXIgcyA9IHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvdyk7XG4gICAgICAgIHdoaWxlIChfbnVtYmVyUngubGFzdEluZGV4IDwgY29sdW1uKSB7XG4gICAgICAgICAgICB2YXIgbTogUmVnRXhwRXhlY0FycmF5ID0gX251bWJlclJ4LmV4ZWMocyk7XG4gICAgICAgICAgICBpZiAobS5pbmRleCA8PSBjb2x1bW4gJiYgbS5pbmRleCArIG1bMF0ubGVuZ3RoID49IGNvbHVtbikge1xuICAgICAgICAgICAgICAgIHZhciByZXR2YWwgPSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBtWzBdLFxuICAgICAgICAgICAgICAgICAgICBzdGFydDogbS5pbmRleCxcbiAgICAgICAgICAgICAgICAgICAgZW5kOiBtLmluZGV4ICsgbVswXS5sZW5ndGhcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJldHVybiByZXR2YWw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdGhlIGNoYXJhY3RlciBiZWZvcmUgdGhlIGN1cnNvciBpcyBhIG51bWJlciwgdGhpcyBmdW5jdGlvbnMgY2hhbmdlcyBpdHMgdmFsdWUgYnkgYGFtb3VudGAuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGFtb3VudCBUaGUgdmFsdWUgdG8gY2hhbmdlIHRoZSBudW1lcmFsIGJ5IChjYW4gYmUgbmVnYXRpdmUgdG8gZGVjcmVhc2UgdmFsdWUpXG4gICAgICovXG4gICAgbW9kaWZ5TnVtYmVyKGFtb3VudDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5jb2x1bW47XG5cbiAgICAgICAgLy8gZ2V0IHRoZSBjaGFyIGJlZm9yZSB0aGUgY3Vyc29yXG4gICAgICAgIHZhciBjaGFyUmFuZ2UgPSBuZXcgUmFuZ2Uocm93LCBjb2x1bW4gLSAxLCByb3csIGNvbHVtbik7XG5cbiAgICAgICAgdmFyIGMgPSBwYXJzZUZsb2F0KHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UoY2hhclJhbmdlKSk7XG4gICAgICAgIC8vIGlmIHRoZSBjaGFyIGlzIGEgZGlnaXRcbiAgICAgICAgaWYgKCFpc05hTihjKSAmJiBpc0Zpbml0ZShjKSkge1xuICAgICAgICAgICAgLy8gZ2V0IHRoZSB3aG9sZSBudW1iZXIgdGhlIGRpZ2l0IGlzIHBhcnQgb2ZcbiAgICAgICAgICAgIHZhciBuciA9IHRoaXMuZ2V0TnVtYmVyQXQocm93LCBjb2x1bW4pO1xuICAgICAgICAgICAgLy8gaWYgbnVtYmVyIGZvdW5kXG4gICAgICAgICAgICBpZiAobnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgZnAgPSBuci52YWx1ZS5pbmRleE9mKFwiLlwiKSA+PSAwID8gbnIuc3RhcnQgKyBuci52YWx1ZS5pbmRleE9mKFwiLlwiKSArIDEgOiBuci5lbmQ7XG4gICAgICAgICAgICAgICAgdmFyIGRlY2ltYWxzID0gbnIuc3RhcnQgKyBuci52YWx1ZS5sZW5ndGggLSBmcDtcblxuICAgICAgICAgICAgICAgIHZhciB0ID0gcGFyc2VGbG9hdChuci52YWx1ZSk7XG4gICAgICAgICAgICAgICAgdCAqPSBNYXRoLnBvdygxMCwgZGVjaW1hbHMpO1xuXG5cbiAgICAgICAgICAgICAgICBpZiAoZnAgIT09IG5yLmVuZCAmJiBjb2x1bW4gPCBmcCkge1xuICAgICAgICAgICAgICAgICAgICBhbW91bnQgKj0gTWF0aC5wb3coMTAsIG5yLmVuZCAtIGNvbHVtbiAtIDEpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGFtb3VudCAqPSBNYXRoLnBvdygxMCwgbnIuZW5kIC0gY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0ICs9IGFtb3VudDtcbiAgICAgICAgICAgICAgICB0IC89IE1hdGgucG93KDEwLCBkZWNpbWFscyk7XG4gICAgICAgICAgICAgICAgdmFyIG5uciA9IHQudG9GaXhlZChkZWNpbWFscyk7XG5cbiAgICAgICAgICAgICAgICAvL3VwZGF0ZSBudW1iZXJcbiAgICAgICAgICAgICAgICB2YXIgcmVwbGFjZVJhbmdlID0gbmV3IFJhbmdlKHJvdywgbnIuc3RhcnQsIHJvdywgbnIuZW5kKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyZXBsYWNlUmFuZ2UsIG5ucik7XG5cbiAgICAgICAgICAgICAgICAvL3JlcG9zaXRpb24gdGhlIGN1cnNvclxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgTWF0aC5tYXgobnIuc3RhcnQgKyAxLCBjb2x1bW4gKyBubnIubGVuZ3RoIC0gbnIudmFsdWUubGVuZ3RoKSk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgY3VycmVudCBzZWxlY3Rpb25cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5yZW1vdmVcbiAgICAgKiovXG4gICAgcmVtb3ZlTGluZXMoKSB7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHZhciByYW5nZTtcbiAgICAgICAgaWYgKHJvd3MuZmlyc3QgPT09IDAgfHwgcm93cy5sYXN0ICsgMSA8IHRoaXMuc2Vzc2lvbi5nZXRMZW5ndGgoKSlcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKHJvd3MuZmlyc3QsIDAsIHJvd3MubGFzdCArIDEsIDApO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShcbiAgICAgICAgICAgICAgICByb3dzLmZpcnN0IC0gMSwgdGhpcy5zZXNzaW9uLmdldExpbmUocm93cy5maXJzdCAtIDEpLmxlbmd0aCxcbiAgICAgICAgICAgICAgICByb3dzLmxhc3QsIHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvd3MubGFzdCkubGVuZ3RoXG4gICAgICAgICAgICApO1xuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIGR1cGxpY2F0ZVNlbGVjdGlvbigpIHtcbiAgICAgICAgdmFyIHNlbCA9IHRoaXMuc2VsZWN0aW9uO1xuICAgICAgICB2YXIgZG9jID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgcmFuZ2UgPSBzZWwuZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIHJldmVyc2UgPSBzZWwuaXNCYWNrd2FyZHMoKTtcbiAgICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGRvYy5kdXBsaWNhdGVMaW5lcyhyb3csIHJvdyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcG9pbnQgPSByZXZlcnNlID8gcmFuZ2Uuc3RhcnQgOiByYW5nZS5lbmQ7XG4gICAgICAgICAgICB2YXIgZW5kUG9pbnQgPSBkb2MuaW5zZXJ0KHBvaW50LCBkb2MuZ2V0VGV4dFJhbmdlKHJhbmdlKSk7XG4gICAgICAgICAgICByYW5nZS5zdGFydCA9IHBvaW50O1xuICAgICAgICAgICAgcmFuZ2UuZW5kID0gZW5kUG9pbnQ7XG5cbiAgICAgICAgICAgIHNlbC5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmV2ZXJzZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyBkb3duIG9uZSByb3cuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZUxpbmVzVXBcbiAgICAgKiovXG4gICAgbW92ZUxpbmVzRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLm1vdmVMaW5lc0Rvd24oZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyB1cCBvbmUgcm93LlxuICAgICAqIEByZXR1cm4ge051bWJlcn0gT24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5tb3ZlTGluZXNEb3duXG4gICAgICoqL1xuICAgIG1vdmVMaW5lc1VwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlTGluZXMoZnVuY3Rpb24oZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24ubW92ZUxpbmVzVXAoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyBhIHJhbmdlIG9mIHRleHQgZnJvbSB0aGUgZ2l2ZW4gcmFuZ2UgdG8gdGhlIGdpdmVuIHBvc2l0aW9uLiBgdG9Qb3NpdGlvbmAgaXMgYW4gb2JqZWN0IHRoYXQgbG9va3MgbGlrZSB0aGlzOlxuICAgICAqIGBgYGpzb25cbiAgICAgKiAgICB7IHJvdzogbmV3Um93TG9jYXRpb24sIGNvbHVtbjogbmV3Q29sdW1uTG9jYXRpb24gfVxuICAgICAqIGBgYFxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IGZyb21SYW5nZSBUaGUgcmFuZ2Ugb2YgdGV4dCB5b3Ugd2FudCBtb3ZlZCB3aXRoaW4gdGhlIGRvY3VtZW50XG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRvUG9zaXRpb24gVGhlIGxvY2F0aW9uIChyb3cgYW5kIGNvbHVtbikgd2hlcmUgeW91IHdhbnQgdG8gbW92ZSB0aGUgdGV4dCB0b1xuICAgICAqXG4gICAgICogQHJldHVybiB7UmFuZ2V9IFRoZSBuZXcgcmFuZ2Ugd2hlcmUgdGhlIHRleHQgd2FzIG1vdmVkIHRvLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVUZXh0XG4gICAgICoqL1xuICAgIG1vdmVUZXh0KHJhbmdlLCB0b1Bvc2l0aW9uLCBjb3B5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24ubW92ZVRleHQocmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvcGllcyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIHVwIG9uZSByb3cuXG4gICAgICogQHJldHVybiB7TnVtYmVyfSBPbiBzdWNjZXNzLCByZXR1cm5zIDAuXG4gICAgICpcbiAgICAgKiovXG4gICAgY29weUxpbmVzVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyBkb3duIG9uZSByb3cuXG4gICAgICogQHJldHVybiB7TnVtYmVyfSBPbiBzdWNjZXNzLCByZXR1cm5zIHRoZSBudW1iZXIgb2YgbmV3IHJvd3MgYWRkZWQ7IGluIG90aGVyIHdvcmRzLCBgbGFzdFJvdyAtIGZpcnN0Um93ICsgMWAuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZHVwbGljYXRlTGluZXNcbiAgICAgKlxuICAgICAqKi9cbiAgICBjb3B5TGluZXNEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlTGluZXMoZnVuY3Rpb24oZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZHVwbGljYXRlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeGVjdXRlcyBhIHNwZWNpZmljIGZ1bmN0aW9uLCB3aGljaCBjYW4gYmUgYW55dGhpbmcgdGhhdCBtYW5pcHVsYXRlcyBzZWxlY3RlZCBsaW5lcywgc3VjaCBhcyBjb3B5aW5nIHRoZW0sIGR1cGxpY2F0aW5nIHRoZW0sIG9yIHNoaWZ0aW5nIHRoZW0uXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbW92ZXIgQSBtZXRob2QgdG8gY2FsbCBvbiBlYWNoIHNlbGVjdGVkIHJvd1xuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgcHJpdmF0ZSAkbW92ZUxpbmVzKG1vdmVyKSB7XG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbjtcbiAgICAgICAgaWYgKCFzZWxlY3Rpb25bJ2luTXVsdGlTZWxlY3RNb2RlJ10gfHwgdGhpcy5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBzZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRSb3dzOiB7IGZpcnN0OiBudW1iZXI7IGxhc3Q6IG51bWJlciB9ID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICB2YXIgbGluZXNNb3ZlZCA9IG1vdmVyLmNhbGwodGhpcywgc2VsZWN0ZWRSb3dzLmZpcnN0LCBzZWxlY3RlZFJvd3MubGFzdCk7XG4gICAgICAgICAgICByYW5nZS5tb3ZlQnkobGluZXNNb3ZlZCwgMCk7XG4gICAgICAgICAgICBzZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UocmFuZ2UpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJhbmdlcyA9IHNlbGVjdGlvbi5yYW5nZUxpc3QucmFuZ2VzO1xuICAgICAgICAgICAgc2VsZWN0aW9uLnJhbmdlTGlzdC5kZXRhY2goKTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHJhbmdlcy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2VJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbGxhcHNlZFJvd3MgPSByYW5nZXNbaV0uY29sbGFwc2VSb3dzKCk7XG4gICAgICAgICAgICAgICAgdmFyIGxhc3QgPSBjb2xsYXBzZWRSb3dzLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0ID0gY29sbGFwc2VkUm93cy5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGktLSkge1xuICAgICAgICAgICAgICAgICAgICBjb2xsYXBzZWRSb3dzID0gcmFuZ2VzW2ldLmNvbGxhcHNlUm93cygpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZmlyc3QgLSBjb2xsYXBzZWRSb3dzLmVuZC5yb3cgPD0gMSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpcnN0ID0gY29sbGFwc2VkUm93cy5lbmQucm93O1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaSsrO1xuXG4gICAgICAgICAgICAgICAgdmFyIGxpbmVzTW92ZWQgPSBtb3Zlci5jYWxsKHRoaXMsIGZpcnN0LCBsYXN0KTtcbiAgICAgICAgICAgICAgICB3aGlsZSAocmFuZ2VJbmRleCA+PSBpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlc1tyYW5nZUluZGV4XS5tb3ZlQnkobGluZXNNb3ZlZCwgMCk7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlSW5kZXgtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2Uoc2VsZWN0aW9uLnJhbmdlc1swXSk7XG4gICAgICAgICAgICBzZWxlY3Rpb24ucmFuZ2VMaXN0LmF0dGFjaCh0aGlzLnNlc3Npb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBvYmplY3QgaW5kaWNhdGluZyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHJvd3MuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kICRnZXRTZWxlY3RlZFJvd3NcbiAgICAgKiBAcmV0dXJuIHtGaXJzdEFuZExhc3R9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlICRnZXRTZWxlY3RlZFJvd3MoKTogRmlyc3RBbmRMYXN0IHtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpLmNvbGxhcHNlUm93cygpO1xuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBmaXJzdDogdGhpcy5zZXNzaW9uLmdldFJvd0ZvbGRTdGFydChyYW5nZS5zdGFydC5yb3cpLFxuICAgICAgICAgICAgbGFzdDogdGhpcy5zZXNzaW9uLmdldFJvd0ZvbGRFbmQocmFuZ2UuZW5kLnJvdylcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBvbkNvbXBvc2l0aW9uU3RhcnQodGV4dD86IHN0cmluZykge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNob3dDb21wb3NpdGlvbih0aGlzLmdldEN1cnNvclBvc2l0aW9uKCkpO1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25VcGRhdGUodGV4dD86IHN0cmluZykge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldENvbXBvc2l0aW9uVGV4dCh0ZXh0KTtcbiAgICB9XG5cbiAgICBvbkNvbXBvc2l0aW9uRW5kKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmhpZGVDb21wb3NpdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvd31cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93XG4gICAgICoqL1xuICAgIGdldEZpcnN0VmlzaWJsZVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvd31cbiAgICAgKlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3dcbiAgICAgKiovXG4gICAgZ2V0TGFzdFZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgaWYgdGhlIHJvdyBpcyBjdXJyZW50bHkgdmlzaWJsZSBvbiB0aGUgc2NyZWVuLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBjaGVja1xuICAgICAqXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgaXNSb3dWaXNpYmxlKHJvdzogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAocm93ID49IHRoaXMuZ2V0Rmlyc3RWaXNpYmxlUm93KCkgJiYgcm93IDw9IHRoaXMuZ2V0TGFzdFZpc2libGVSb3coKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kaWNhdGVzIGlmIHRoZSBlbnRpcmUgcm93IGlzIGN1cnJlbnRseSB2aXNpYmxlIG9uIHRoZSBzY3JlZW4uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIGNoZWNrXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGlzUm93RnVsbHlWaXNpYmxlKHJvdzogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAocm93ID49IHRoaXMucmVuZGVyZXIuZ2V0Rmlyc3RGdWxseVZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5yZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG51bWJlciBvZiBjdXJyZW50bHkgdmlzaWJpbGUgcm93cy5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIHByaXZhdGUgJGdldFZpc2libGVSb3dDb3VudCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRTY3JvbGxCb3R0b21Sb3coKSAtIHRoaXMucmVuZGVyZXIuZ2V0U2Nyb2xsVG9wUm93KCkgKyAxO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZJWE1FOiBUaGUgc2VtYW50aWNzIG9mIHNlbGVjdCBhcmUgbm90IGVhc2lseSB1bmRlcnN0b29kLiBcbiAgICAgKiBAcGFyYW0gZGlyZWN0aW9uICsxIGZvciBwYWdlIGRvd24sIC0xIGZvciBwYWdlIHVwLiBNYXliZSBOIGZvciBOIHBhZ2VzP1xuICAgICAqIEBwYXJhbSBzZWxlY3QgdHJ1ZSB8IGZhbHNlIHwgdW5kZWZpbmVkXG4gICAgICovXG4gICAgcHJpdmF0ZSAkbW92ZUJ5UGFnZShkaXJlY3Rpb246IG51bWJlciwgc2VsZWN0PzogYm9vbGVhbikge1xuICAgICAgICB2YXIgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVyO1xuICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5yZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgdmFyIHJvd3MgPSBkaXJlY3Rpb24gKiBNYXRoLmZsb29yKGNvbmZpZy5oZWlnaHQgLyBjb25maWcubGluZUhlaWdodCk7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcrKztcbiAgICAgICAgaWYgKHNlbGVjdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkocm93cywgMCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzZWxlY3QgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkocm93cywgMCk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHJlbmRlcmVyLnNjcm9sbFRvcDtcblxuICAgICAgICByZW5kZXJlci5zY3JvbGxCeSgwLCByb3dzICogY29uZmlnLmxpbmVIZWlnaHQpO1xuICAgICAgICAvLyBXaHkgZG9uJ3Qgd2UgYXNzZXJ0IG91ciBhcmdzIGFuZCBkbyB0eXBlb2Ygc2VsZWN0ID09PSAndW5kZWZpbmVkJz9cbiAgICAgICAgaWYgKHNlbGVjdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAvLyBUaGlzIGlzIGNhbGxlZCB3aGVuIHNlbGVjdCBpcyB1bmRlZmluZWQuXG4gICAgICAgICAgICByZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyhzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgdGhlIHRleHQgZnJvbSB0aGUgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgdW50aWwgd2hlcmUgYSBcInBhZ2UgZG93blwiIGZpbmlzaGVzLlxuICAgICAqKi9cbiAgICBzZWxlY3RQYWdlRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgrMSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyB0aGUgdGV4dCBmcm9tIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCB1bnRpbCB3aGVyZSBhIFwicGFnZSB1cFwiIGZpbmlzaGVzLlxuICAgICAqKi9cbiAgICBzZWxlY3RQYWdlVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoLTEsIHRydWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIGRvd25cIiBpcywgYXMgd2VsbCBhcyBtb3ZpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgZ290b1BhZ2VEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKCsxLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgdXBcIiBpcywgYXMgd2VsbCBhcyBtb3ZpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgZ290b1BhZ2VVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgtMSwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSBkb3duXCIgaXMsIHdpdGhvdXQgY2hhbmdpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgc2Nyb2xsUGFnZURvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIHVwXCIgaXMsIHdpdGhvdXQgY2hhbmdpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgc2Nyb2xsUGFnZVVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKC0xKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgZWRpdG9yIHRvIHRoZSBzcGVjaWZpZWQgcm93LlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1Jvd1xuICAgICAqL1xuICAgIHNjcm9sbFRvUm93KHJvdzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9Sb3cocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRvIGEgbGluZS4gSWYgYGNlbnRlcmAgaXMgYHRydWVgLCBpdCBwdXRzIHRoZSBsaW5lIGluIG1pZGRsZSBvZiBzY3JlZW4gKG9yIGF0dGVtcHRzIHRvKS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZSBUaGUgbGluZSB0byBzY3JvbGwgdG9cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGNlbnRlciBJZiBgdHJ1ZWBcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGVzIHNjcm9sbGluZ1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBhbmltYXRpb24gaGFzIGZpbmlzaGVkXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmVcbiAgICAgKiovXG4gICAgc2Nyb2xsVG9MaW5lKGxpbmU6IG51bWJlciwgY2VudGVyOiBib29sZWFuLCBhbmltYXRlOiBib29sZWFuLCBjYWxsYmFjaz86ICgpID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvTGluZShsaW5lLCBjZW50ZXIsIGFuaW1hdGUsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBdHRlbXB0cyB0byBjZW50ZXIgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIG9uIHRoZSBzY3JlZW4uXG4gICAgICoqL1xuICAgIGNlbnRlclNlbGVjdGlvbigpOiB2b2lkIHtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgcG9zID0ge1xuICAgICAgICAgICAgcm93OiBNYXRoLmZsb29yKHJhbmdlLnN0YXJ0LnJvdyArIChyYW5nZS5lbmQucm93IC0gcmFuZ2Uuc3RhcnQucm93KSAvIDIpLFxuICAgICAgICAgICAgY29sdW1uOiBNYXRoLmZsb29yKHJhbmdlLnN0YXJ0LmNvbHVtbiArIChyYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uKSAvIDIpXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMucmVuZGVyZXIuYWxpZ25DdXJzb3IocG9zLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0Q3Vyc29yUG9zaXRpb25cbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn1cbiAgICAgKi9cbiAgICBnZXRDdXJzb3JQb3NpdGlvbigpOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzY3JlZW4gcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW5cbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn1cbiAgICAgKi9cbiAgICBnZXRDdXJzb3JQb3NpdGlvblNjcmVlbigpOiBQb3NpdGlvbiB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXRTZWxlY3Rpb25SYW5nZVxuICAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICAqL1xuICAgIGdldFNlbGVjdGlvblJhbmdlKCk6IFJhbmdlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyBhbGwgdGhlIHRleHQgaW4gZWRpdG9yLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZWxlY3RBbGxcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNlbGVjdEFsbCgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0QWxsKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBjbGVhclNlbGVjdGlvblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgY2xlYXJTZWxlY3Rpb24oKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3BlY2lmaWVkIHJvdyBhbmQgY29sdW1uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIG5vdCBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIG5ldyByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgbmV3IGNvbHVtbiBudW1iZXJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IGFuaW1hdGVcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9cbiAgICAgKiovXG4gICAgbW92ZUN1cnNvclRvKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgYW5pbWF0ZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvclRvKHJvdywgY29sdW1uLCBhbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBwb3NpdGlvbiBzcGVjaWZpZWQgYnkgYHBvc2l0aW9uLnJvd2AgYW5kIGBwb3NpdGlvbi5jb2x1bW5gLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBtb3ZlQ3Vyc29yVG9Qb3NpdGlvblxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiB7UG9zaXRpb259IEFuIG9iamVjdCB3aXRoIHR3byBwcm9wZXJ0aWVzLCByb3cgYW5kIGNvbHVtblxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgbW92ZUN1cnNvclRvUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3NpdGlvbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvcidzIHJvdyBhbmQgY29sdW1uIHRvIHRoZSBuZXh0IG1hdGNoaW5nIGJyYWNrZXQgb3IgSFRNTCB0YWcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGp1bXBUb01hdGNoaW5nXG4gICAgICogQHBhcmFtIFtzZWxlY3RdIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAganVtcFRvTWF0Y2hpbmcoc2VsZWN0PzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLnNlc3Npb24sIGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pO1xuICAgICAgICB2YXIgcHJldlRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG4gICAgICAgIHZhciB0b2tlbiA9IHByZXZUb2tlbjtcblxuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuXG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgLy9nZXQgbmV4dCBjbG9zaW5nIHRhZyBvciBicmFja2V0XG4gICAgICAgIHZhciBtYXRjaFR5cGU7XG4gICAgICAgIHZhciBmb3VuZCA9IGZhbHNlO1xuICAgICAgICB2YXIgZGVwdGggPSB7fTtcbiAgICAgICAgdmFyIGkgPSBjdXJzb3IuY29sdW1uIC0gdG9rZW4uc3RhcnQ7XG4gICAgICAgIHZhciBicmFja2V0VHlwZTtcbiAgICAgICAgdmFyIGJyYWNrZXRzID0ge1xuICAgICAgICAgICAgXCIpXCI6IFwiKFwiLFxuICAgICAgICAgICAgXCIoXCI6IFwiKFwiLFxuICAgICAgICAgICAgXCJdXCI6IFwiW1wiLFxuICAgICAgICAgICAgXCJbXCI6IFwiW1wiLFxuICAgICAgICAgICAgXCJ7XCI6IFwie1wiLFxuICAgICAgICAgICAgXCJ9XCI6IFwie1wiXG4gICAgICAgIH07XG5cbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgaWYgKHRva2VuLnZhbHVlLm1hdGNoKC9be30oKVxcW1xcXV0vZykpIHtcbiAgICAgICAgICAgICAgICBmb3IgKDsgaSA8IHRva2VuLnZhbHVlLmxlbmd0aCAmJiAhZm91bmQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWJyYWNrZXRzW3Rva2VuLnZhbHVlW2ldXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBicmFja2V0VHlwZSA9IGJyYWNrZXRzW3Rva2VuLnZhbHVlW2ldXSArICcuJyArIHRva2VuLnR5cGUucmVwbGFjZShcInJwYXJlblwiLCBcImxwYXJlblwiKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNOYU4oZGVwdGhbYnJhY2tldFR5cGVdKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdID0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCAodG9rZW4udmFsdWVbaV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJygnOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnWyc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICd7JzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFticmFja2V0VHlwZV0rKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJyknOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnXSc6XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICd9JzpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFticmFja2V0VHlwZV0tLTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZXB0aFticmFja2V0VHlwZV0gPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoVHlwZSA9ICdicmFja2V0JztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNOYU4oZGVwdGhbdG9rZW4udmFsdWVdKSkge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0gPSAwO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0rKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPC8nKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlcHRoW3Rva2VuLnZhbHVlXS0tO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChkZXB0aFt0b2tlbi52YWx1ZV0gPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIG1hdGNoVHlwZSA9ICd0YWcnO1xuICAgICAgICAgICAgICAgICAgICBmb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgICAgICAgICAgcHJldlRva2VuID0gdG9rZW47XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgICAgIGkgPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IHdoaWxlICh0b2tlbiAmJiAhZm91bmQpO1xuXG4gICAgICAgIC8vbm8gbWF0Y2ggZm91bmRcbiAgICAgICAgaWYgKCFtYXRjaFR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZTogUmFuZ2U7XG4gICAgICAgIGlmIChtYXRjaFR5cGUgPT09ICdicmFja2V0Jykge1xuICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKGN1cnNvcik7XG4gICAgICAgICAgICBpZiAoIXJhbmdlKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIGkgLSAxLFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyBpIC0gMVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyYW5nZSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocG9zLnJvdyA9PT0gY3Vyc29yLnJvdyAmJiBNYXRoLmFicyhwb3MuY29sdW1uIC0gY3Vyc29yLmNvbHVtbikgPCAyKVxuICAgICAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UocG9zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChtYXRjaFR5cGUgPT09ICd0YWcnKSB7XG4gICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSlcbiAgICAgICAgICAgICAgICB2YXIgdGFnID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgLSAyLFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpIC0gMlxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgLy9maW5kIG1hdGNoaW5nIHRhZ1xuICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbikgPT09IDApIHtcbiAgICAgICAgICAgICAgICBmb3VuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBwcmV2VG9rZW47XG4gICAgICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udHlwZS5pbmRleE9mKCd0YWctY2xvc2UnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQoaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbi52YWx1ZSA9PT0gdGFnICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbdGFnXSsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPC8nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW3RhZ10tLTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGhbdGFnXSA9PT0gMClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAocHJldlRva2VuICYmICFmb3VuZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vd2UgZm91bmQgaXRcbiAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykpIHtcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy5yb3cgPT0gY3Vyc29yLnJvdyAmJiBNYXRoLmFicyhwb3MuY29sdW1uIC0gY3Vyc29yLmNvbHVtbikgPCAyKVxuICAgICAgICAgICAgICAgICAgICBwb3MgPSByYW5nZS5lbmQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBwb3MgPSByYW5nZSAmJiByYW5nZVsnY3Vyc29yJ10gfHwgcG9zO1xuICAgICAgICBpZiAocG9zKSB7XG4gICAgICAgICAgICBpZiAoc2VsZWN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmlzRXF1YWwodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKSlcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0VG8ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzcGVjaWZpZWQgbGluZSBudW1iZXIsIGFuZCBhbHNvIGludG8gdGhlIGluZGljaWF0ZWQgY29sdW1uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lTnVtYmVyIFRoZSBsaW5lIG51bWJlciB0byBnbyB0b1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gQSBjb2x1bW4gbnVtYmVyIHRvIGdvIHRvXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY29sbGluZ1xuICAgICAqKi9cbiAgICBnb3RvTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbj86IG51bWJlciwgYW5pbWF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnVuZm9sZCh7IHJvdzogbGluZU51bWJlciAtIDEsIGNvbHVtbjogY29sdW1uIHx8IDAgfSk7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgLy8gdG9kbzogZmluZCBhIHdheSB0byBhdXRvbWF0aWNhbGx5IGV4aXQgbXVsdGlzZWxlY3QgbW9kZVxuICAgICAgICB0aGlzLmV4aXRNdWx0aVNlbGVjdE1vZGUgJiYgdGhpcy5leGl0TXVsdGlTZWxlY3RNb2RlKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxpbmVOdW1iZXIgLSAxLCBjb2x1bW4gfHwgMCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgaWYgKCF0aGlzLmlzUm93RnVsbHlWaXNpYmxlKGxpbmVOdW1iZXIgLSAxKSkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxUb0xpbmUobGluZU51bWJlciAtIDEsIHRydWUsIGFuaW1hdGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3BlY2lmaWVkIHJvdyBhbmQgY29sdW1uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgbmV3IHJvdyBudW1iZXJcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBuZXcgY29sdW1uIG51bWJlclxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0b3IubW92ZUN1cnNvclRvXG4gICAgICoqL1xuICAgIG5hdmlnYXRlVG8ocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbyhyb3csIGNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB1cCBpbiB0aGUgZG9jdW1lbnQgdGhlIHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZXMgVGhlIG51bWJlciBvZiB0aW1lcyB0byBjaGFuZ2UgbmF2aWdhdGlvblxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgbmF2aWdhdGVVcCh0aW1lczogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc011bHRpTGluZSgpICYmICF0aGlzLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uU3RhcnQgPSB0aGlzLnNlbGVjdGlvbi5hbmNob3IuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvblN0YXJ0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkoLXRpbWVzIHx8IC0xLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGRvd24gaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRG93bih0aW1lczogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc011bHRpTGluZSgpICYmIHRoaXMuc2VsZWN0aW9uLmlzQmFja3dhcmRzKCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbmQgPSB0aGlzLnNlbGVjdGlvbi5hbmNob3IuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvbkVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckJ5KHRpbWVzIHx8IDEsIDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgbGVmdCBpbiB0aGUgZG9jdW1lbnQgdGhlIHNwZWNpZmllZCBudW1iZXIgb2YgdGltZXMuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gdGltZXMgVGhlIG51bWJlciBvZiB0aW1lcyB0byBjaGFuZ2UgbmF2aWdhdGlvblxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgbmF2aWdhdGVMZWZ0KHRpbWVzOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25TdGFydCA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKS5zdGFydDtcbiAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oc2VsZWN0aW9uU3RhcnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGltZXMgPSB0aW1lcyB8fCAxO1xuICAgICAgICAgICAgd2hpbGUgKHRpbWVzLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGVmdCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHJpZ2h0IGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVJpZ2h0KHRpbWVzOiBudW1iZXIpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbmQgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuZW5kO1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25FbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGltZXMgPSB0aW1lcyB8fCAxO1xuICAgICAgICAgICAgd2hpbGUgKHRpbWVzLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBsaW5lLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGluZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZVN0YXJ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCBsaW5lLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGluZUVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVFbmQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGZpbGUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVGaWxlRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3RhcnQgb2YgdGhlIGN1cnJlbnQgZmlsZS5cbiAgICAgKiBOb3RlIHRoYXQgdGhpcyBhbHNvIGRlLXNlbGVjdHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBuYXZpZ2F0ZUZpbGVTdGFydFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgbmF2aWdhdGVGaWxlU3RhcnQoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JGaWxlU3RhcnQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBpbW1lZGlhdGVseSB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnQgcG9zaXRpb24uIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVXb3JkUmlnaHQoKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JXb3JkUmlnaHQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgd29yZCBpbW1lZGlhdGVseSB0byB0aGUgbGVmdCBvZiB0aGUgY3VycmVudCBwb3NpdGlvbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVdvcmRMZWZ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZExlZnQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlcGxhY2VzIHRoZSBmaXJzdCBvY2N1cmFuY2Ugb2YgYG9wdGlvbnMubmVlZGxlYCB3aXRoIHRoZSB2YWx1ZSBpbiBgcmVwbGFjZW1lbnRgLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSByZXBsYWNlbWVudCBUaGUgdGV4dCB0byByZXBsYWNlIHdpdGhcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBUaGUgW1tTZWFyY2ggYFNlYXJjaGBdXSBvcHRpb25zIHRvIHVzZVxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgcmVwbGFjZShyZXBsYWNlbWVudDogc3RyaW5nLCBvcHRpb25zKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG9wdGlvbnMpXG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHNlYXJjaC5maW5kKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IDA7XG4gICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG5cbiAgICAgICAgaWYgKHRoaXMuJHRyeVJlcGxhY2UocmFuZ2UsIHJlcGxhY2VtZW50KSkge1xuICAgICAgICAgICAgcmVwbGFjZWQgPSAxO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyYW5nZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXBsYWNlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyBhbGwgb2NjdXJhbmNlcyBvZiBgb3B0aW9ucy5uZWVkbGVgIHdpdGggdGhlIHZhbHVlIGluIGByZXBsYWNlbWVudGAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlcGxhY2VBbGxcbiAgICAgKiBAcGFyYW0gcmVwbGFjZW1lbnQge3N0cmluZ30gVGhlIHRleHQgdG8gcmVwbGFjZSB3aXRoXG4gICAgICogQHBhcmFtIG9wdGlvbnMgVGhlIFtbU2VhcmNoIGBTZWFyY2hgXV0gb3B0aW9ucyB0byB1c2VcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcmVwbGFjZUFsbChyZXBsYWNlbWVudDogc3RyaW5nLCBvcHRpb25zKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaC5zZXQob3B0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2VzID0gdGhpcy4kc2VhcmNoLmZpbmRBbGwodGhpcy5zZXNzaW9uKTtcbiAgICAgICAgdmFyIHJlcGxhY2VkID0gMDtcbiAgICAgICAgaWYgKCFyYW5nZXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nICs9IDE7XG5cbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKDAsIDApO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSByYW5nZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR0cnlSZXBsYWNlKHJhbmdlc1tpXSwgcmVwbGFjZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgcmVwbGFjZWQrKztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHNlbGVjdGlvbik7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgcmV0dXJuIHJlcGxhY2VkO1xuICAgIH1cblxuICAgIHByaXZhdGUgJHRyeVJlcGxhY2UocmFuZ2U6IFJhbmdlLCByZXBsYWNlbWVudDogc3RyaW5nKTogUmFuZ2Uge1xuICAgICAgICB2YXIgaW5wdXQgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgcmVwbGFjZW1lbnQgPSB0aGlzLiRzZWFyY2gucmVwbGFjZShpbnB1dCwgcmVwbGFjZW1lbnQpO1xuICAgICAgICBpZiAocmVwbGFjZW1lbnQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZCA9IHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCByZXBsYWNlbWVudCk7XG4gICAgICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0TGFzdFNlYXJjaE9wdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtTZWFyY2hPcHRpb25zfVxuICAgICAqL1xuICAgIGdldExhc3RTZWFyY2hPcHRpb25zKCk6IFNlYXJjaE9wdGlvbnMge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2VhcmNoLmdldE9wdGlvbnMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBdHRlbXB0cyB0byBmaW5kIGBuZWVkbGVgIHdpdGhpbiB0aGUgZG9jdW1lbnQuXG4gICAgICogRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZmluZFxuICAgICAqIEBwYXJhbSBuZWVkbGUge29iamVjdCB8IHN0cmluZyB8IFJlZ0V4cH0gVGhlIHRleHQgdG8gc2VhcmNoIGZvciAob3B0aW9uYWwpLlxuICAgICAqIEBwYXJhbSBbb3B0aW9uc10ge1NlYXJjaE9wdGlvbnN9IEFuIG9iamVjdCBkZWZpbmluZyB2YXJpb3VzIHNlYXJjaCBwcm9wZXJ0aWVzXG4gICAgICogQHBhcmFtIFthbmltYXRlXSB7Ym9vbGVhbn0gSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgICovXG4gICAgZmluZChuZWVkbGU6IChzdHJpbmcgfCBSZWdFeHApLCBvcHRpb25zOiBTZWFyY2hPcHRpb25zID0ge30sIGFuaW1hdGU/OiBib29sZWFuKTogUmFuZ2Uge1xuXG4gICAgICAgIGlmICh0eXBlb2YgbmVlZGxlID09PSBcInN0cmluZ1wiIHx8IG5lZWRsZSBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgICAgb3B0aW9ucy5uZWVkbGUgPSBuZWVkbGU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIG5lZWRsZSA9PSBcIm9iamVjdFwiKSB7XG4gICAgICAgICAgICBtaXhpbihvcHRpb25zLCBuZWVkbGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgaWYgKG9wdGlvbnMubmVlZGxlID09IG51bGwpIHtcbiAgICAgICAgICAgIG5lZWRsZSA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpIHx8IHRoaXMuJHNlYXJjaC4kb3B0aW9ucy5uZWVkbGU7XG4gICAgICAgICAgICBpZiAoIW5lZWRsZSkge1xuICAgICAgICAgICAgICAgIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldFdvcmRSYW5nZShyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgbmVlZGxlID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KHsgbmVlZGxlOiBuZWVkbGUgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuICAgICAgICBpZiAoIW9wdGlvbnMuc3RhcnQpIHtcbiAgICAgICAgICAgIC8vIFRPRE86IEknbSBndWVzc2luZyB0aGF0IHdlIG5lZWQgcmFuZ2Uuc3RhcnQsIHdhcyBqdXN0IHJhbmdlLlxuICAgICAgICAgICAgdGhpcy4kc2VhcmNoLnNldCh7IHN0YXJ0OiByYW5nZS5zdGFydCB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBuZXdSYW5nZSA9IHRoaXMuJHNlYXJjaC5maW5kKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIGlmIChvcHRpb25zLnByZXZlbnRTY3JvbGwpIHtcbiAgICAgICAgICAgIHJldHVybiBuZXdSYW5nZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAobmV3UmFuZ2UpIHtcbiAgICAgICAgICAgIHRoaXMucmV2ZWFsUmFuZ2UobmV3UmFuZ2UsIGFuaW1hdGUpO1xuICAgICAgICAgICAgcmV0dXJuIG5ld1JhbmdlO1xuICAgICAgICB9XG4gICAgICAgIC8vIGNsZWFyIHNlbGVjdGlvbiBpZiBub3RoaW5nIGlzIGZvdW5kXG4gICAgICAgIGlmIChvcHRpb25zLmJhY2t3YXJkcylcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcmFuZ2UuZW5kO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZS5lbmQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0UmFuZ2UocmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIGFub3RoZXIgc2VhcmNoIGZvciBgbmVlZGxlYCBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICogRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZmluZE5leHRcbiAgICAgKiBAcGFyYW0gW25lZWRsZV0ge3N0cmluZyB8IFJlZ0V4cH1cbiAgICAgKiBAcGFyYW0gW2FuaW1hdGVdIHtib29sZWFufSBJZiBgdHJ1ZWAgYW5pbWF0ZSBzY3JvbGxpbmdcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqKi9cbiAgICBmaW5kTmV4dChuZWVkbGU/OiAoc3RyaW5nIHwgUmVnRXhwKSwgYW5pbWF0ZT86IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5maW5kKG5lZWRsZSwgeyBza2lwQ3VycmVudDogdHJ1ZSwgYmFja3dhcmRzOiBmYWxzZSB9LCBhbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBhIHNlYXJjaCBmb3IgYG5lZWRsZWAgYmFja3dhcmRzLlxuICAgICAqIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGZpbmRQcmV2aW91c1xuICAgICAqIEBwYXJhbSBbbmVlZGxlXSB7c3RyaW5nIHwgUmVnRXhwfVxuICAgICAqIEBwYXJhbSBbYW5pbWF0ZV0ge2Jvb2xlYW59IElmIGB0cnVlYCBhbmltYXRlIHNjcm9sbGluZ1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgZmluZFByZXZpb3VzKG5lZWRsZT86IChzdHJpbmcgfCBSZWdFeHApLCBhbmltYXRlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLmZpbmQobmVlZGxlLCB7IHNraXBDdXJyZW50OiB0cnVlLCBiYWNrd2FyZHM6IHRydWUgfSwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCByZXZlYWxSYW5nZVxuICAgICAqIEBwYXJhbSByYW5nZSB7UmFuZ2V9XG4gICAgICogQHBhcmFtIGFuaW1hdGUge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZXZlYWxSYW5nZShyYW5nZTogUmFuZ2UsIGFuaW1hdGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnVuZm9sZChyYW5nZSk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gdGhpcy5yZW5kZXJlci5zY3JvbGxUb3A7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcocmFuZ2Uuc3RhcnQsIHJhbmdlLmVuZCwgMC41KTtcbiAgICAgICAgaWYgKGFuaW1hdGUgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmFuaW1hdGVTY3JvbGxpbmcoc2Nyb2xsVG9wKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgdW5kb1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICoqL1xuICAgIHVuZG8oKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVbmRvTWFuYWdlcigpLnVuZG8oKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyh2b2lkIDAsIDAuNSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCByZWRvXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZWRvKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0VW5kb01hbmFnZXIoKS5yZWRvKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcodm9pZCAwLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENsZWFucyB1cCB0aGUgZW50aXJlIGVkaXRvci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZGVzdHJveVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgZGVzdHJveSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kZXN0cm95KCk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgZGVzdHJveVxuICAgICAgICAgKiBAcGFyYW0gdGhpcyB7RWRpdG9yfVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiZGVzdHJveVwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIGF1dG9tYXRpYyBzY3JvbGxpbmcgb2YgdGhlIGN1cnNvciBpbnRvIHZpZXcgd2hlbiBlZGl0b3IgaXRzZWxmIGlzIGluc2lkZSBzY3JvbGxhYmxlIGVsZW1lbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlld1xuICAgICAqIEBwYXJhbSBlbmFibGUge2Jvb2xlYW59IGRlZmF1bHQgdHJ1ZVxuICAgICAqL1xuICAgIHNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyhlbmFibGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgaWYgKCFlbmFibGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciByZWN0O1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBzaG91bGRTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgaWYgKCF0aGlzLiRzY3JvbGxBbmNob3IpXG4gICAgICAgICAgICB0aGlzLiRzY3JvbGxBbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB2YXIgc2Nyb2xsQW5jaG9yID0gdGhpcy4kc2Nyb2xsQW5jaG9yO1xuICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246YWJzb2x1dGVcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuaW5zZXJ0QmVmb3JlKHNjcm9sbEFuY2hvciwgdGhpcy5jb250YWluZXIuZmlyc3RDaGlsZCk7XG4gICAgICAgIHZhciBvbkNoYW5nZVNlbGVjdGlvbiA9IHRoaXMub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzaG91bGRTY3JvbGwgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gbmVlZGVkIHRvIG5vdCB0cmlnZ2VyIHN5bmMgcmVmbG93XG4gICAgICAgIHZhciBvbkJlZm9yZVJlbmRlciA9IHRoaXMucmVuZGVyZXIub24oXCJiZWZvcmVSZW5kZXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsKVxuICAgICAgICAgICAgICAgIHJlY3QgPSBzZWxmLnJlbmRlcmVyLmNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBvbkFmdGVyUmVuZGVyID0gdGhpcy5yZW5kZXJlci5vbihcImFmdGVyUmVuZGVyXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHNob3VsZFNjcm9sbCAmJiByZWN0ICYmIHNlbGYuaXNGb2N1c2VkKCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVuZGVyZXIgPSBzZWxmLnJlbmRlcmVyO1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByZW5kZXJlci4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICAgICAgICAgIHZhciBjb25maWcgPSByZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgICAgICAgICB2YXIgdG9wID0gcG9zLnRvcCAtIGNvbmZpZy5vZmZzZXQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy50b3AgPj0gMCAmJiB0b3AgKyByZWN0LnRvcCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocG9zLnRvcCA8IGNvbmZpZy5oZWlnaHQgJiZcbiAgICAgICAgICAgICAgICAgICAgcG9zLnRvcCArIHJlY3QudG9wICsgY29uZmlnLmxpbmVIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLnRvcCA9IHRvcCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmxlZnQgPSBwb3MubGVmdCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmhlaWdodCA9IGNvbmZpZy5saW5lSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc2Nyb2xsSW50b1ZpZXcoc2hvdWxkU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gcmVjdCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyA9IGZ1bmN0aW9uKGVuYWJsZSkge1xuICAgICAgICAgICAgaWYgKGVuYWJsZSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXc7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTZWxlY3Rpb25cIiwgb25DaGFuZ2VTZWxlY3Rpb24pO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWZ0ZXJSZW5kZXJcIiwgb25BZnRlclJlbmRlcik7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJiZWZvcmVSZW5kZXJcIiwgb25CZWZvcmVSZW5kZXIpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHB1YmxpYyAkcmVzZXRDdXJzb3JTdHlsZSgpIHtcbiAgICAgICAgdmFyIHN0eWxlID0gdGhpcy4kY3Vyc29yU3R5bGUgfHwgXCJhY2VcIjtcbiAgICAgICAgdmFyIGN1cnNvckxheWVyID0gdGhpcy5yZW5kZXJlci4kY3Vyc29yTGF5ZXI7XG4gICAgICAgIGlmICghY3Vyc29yTGF5ZXIpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjdXJzb3JMYXllci5zZXRTbW9vdGhCbGlua2luZygvc21vb3RoLy50ZXN0KHN0eWxlKSk7XG4gICAgICAgIGN1cnNvckxheWVyLmlzQmxpbmtpbmcgPSAhdGhpcy4kcmVhZE9ubHkgJiYgc3R5bGUgIT0gXCJ3aWRlXCI7XG4gICAgICAgIHNldENzc0NsYXNzKGN1cnNvckxheWVyLmVsZW1lbnQsIFwiYWNlX3NsaW0tY3Vyc29yc1wiLCAvc2xpbS8udGVzdChzdHlsZSkpO1xuICAgIH1cbn1cblxuZGVmaW5lT3B0aW9ucyhFZGl0b3IucHJvdG90eXBlLCBcImVkaXRvclwiLCB7XG4gICAgc2VsZWN0aW9uU3R5bGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzdHlsZSkge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LiRvblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoYXQuc2VsZWN0aW9uKTtcbiAgICAgICAgICAgIHRoYXQuX3NpZ25hbChcImNoYW5nZVNlbGVjdGlvblN0eWxlXCIsIHsgZGF0YTogc3R5bGUgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCJsaW5lXCJcbiAgICB9LFxuICAgIGhpZ2hsaWdodEFjdGl2ZUxpbmU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBFZGl0b3IgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGhpZ2hsaWdodFNlbGVjdGVkV29yZDoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHNob3VsZEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdmFyIHRoYXQ6IEVkaXRvciA9IHRoaXM7XG4gICAgICAgICAgICB0aGF0LiRvblNlbGVjdGlvbkNoYW5nZSh2b2lkIDAsIHRoYXQuc2VsZWN0aW9uKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICByZWFkT25seToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHJlYWRPbmx5KSB7XG4gICAgICAgICAgICAvLyBkaXNhYmxlZCB0byBub3QgYnJlYWsgdmltIG1vZGUhXG4gICAgICAgICAgICAvLyB0aGlzLnRleHRJbnB1dC5zZXRSZWFkT25seShyZWFkT25seSk7XG4gICAgICAgICAgICB0aGlzLiRyZXNldEN1cnNvclN0eWxlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIGN1cnNvclN0eWxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YXIgdGhhdDogRWRpdG9yID0gdGhpcztcbiAgICAgICAgICAgIHRoYXQuJHJlc2V0Q3Vyc29yU3R5bGUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgdmFsdWVzOiBbXCJhY2VcIiwgXCJzbGltXCIsIFwic21vb3RoXCIsIFwid2lkZVwiXSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImFjZVwiXG4gICAgfSxcbiAgICBtZXJnZVVuZG9EZWx0YXM6IHtcbiAgICAgICAgdmFsdWVzOiBbZmFsc2UsIHRydWUsIFwiYWx3YXlzXCJdLFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGJlaGF2aW91cnNFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIHdyYXBCZWhhdmlvdXJzRW5hYmxlZDogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICBhdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXc6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihlbmFibGU6IGJvb2xlYW4pIHtcbiAgICAgICAgICAgIHZhciB0aGF0OiBFZGl0b3IgPSB0aGlzO1xuICAgICAgICAgICAgdGhhdC5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXcoZW5hYmxlKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTogXCJyZW5kZXJlclwiLFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBcInJlbmRlcmVyXCIsXG4gICAgaGlnaGxpZ2h0R3V0dGVyTGluZTogXCJyZW5kZXJlclwiLFxuICAgIGFuaW1hdGVkU2Nyb2xsOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ludmlzaWJsZXM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93UHJpbnRNYXJnaW46IFwicmVuZGVyZXJcIixcbiAgICBwcmludE1hcmdpbkNvbHVtbjogXCJyZW5kZXJlclwiLFxuICAgIHByaW50TWFyZ2luOiBcInJlbmRlcmVyXCIsXG4gICAgZmFkZUZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0xpbmVOdW1iZXJzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0d1dHRlcjogXCJyZW5kZXJlclwiLFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IFwicmVuZGVyZXJcIixcbiAgICBmb250U2l6ZTogXCJyZW5kZXJlclwiLFxuICAgIGZvbnRGYW1pbHk6IFwicmVuZGVyZXJcIixcbiAgICBtYXhMaW5lczogXCJyZW5kZXJlclwiLFxuICAgIG1pbkxpbmVzOiBcInJlbmRlcmVyXCIsXG4gICAgc2Nyb2xsUGFzdEVuZDogXCJyZW5kZXJlclwiLFxuICAgIGZpeGVkV2lkdGhHdXR0ZXI6IFwicmVuZGVyZXJcIixcbiAgICB0aGVtZTogXCJyZW5kZXJlclwiLFxuXG4gICAgc2Nyb2xsU3BlZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGRyYWdEZWxheTogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZHJhZ0VuYWJsZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGZvY3VzVGltb3V0OiBcIiRtb3VzZUhhbmRsZXJcIixcbiAgICB0b29sdGlwRm9sbG93c01vdXNlOiBcIiRtb3VzZUhhbmRsZXJcIixcblxuICAgIGZpcnN0TGluZU51bWJlcjogXCJzZXNzaW9uXCIsXG4gICAgb3ZlcndyaXRlOiBcInNlc3Npb25cIixcbiAgICBuZXdMaW5lTW9kZTogXCJzZXNzaW9uXCIsXG4gICAgdXNlV29ya2VyOiBcInNlc3Npb25cIixcbiAgICB1c2VTb2Z0VGFiczogXCJzZXNzaW9uXCIsXG4gICAgdGFiU2l6ZTogXCJzZXNzaW9uXCIsXG4gICAgd3JhcDogXCJzZXNzaW9uXCIsXG4gICAgZm9sZFN0eWxlOiBcInNlc3Npb25cIixcbiAgICBtb2RlOiBcInNlc3Npb25cIlxufSk7XG5cbmNsYXNzIEZvbGRIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBpbiB0aGUgZWRpdG9yIChub3QgZ3V0dGVyKSByZWdpb25cbiAgICAgICAgLy8gdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdG8gcmVtb3ZlIG9yIGV4cGFuZCBhIGZvbGQuXG4gICAgICAgIGVkaXRvci5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjbGlja2VkIG9uIGEgZm9sZCwgdGhlbiBleHBhbmQgaXQuXG4gICAgICAgICAgICB2YXIgZm9sZCA9IHNlc3Npb24uZ2V0Rm9sZEF0KHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uLCAxKTtcbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgaWYgKGUuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBvbiB0aGUgZ3V0dGVyLlxuICAgICAgICBlZGl0b3Iub24oJ2d1dHRlcmNsaWNrJywgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXIuZ2V0UmVnaW9uKGUpO1xuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PT0gJ2ZvbGRXaWRnZXRzJykge1xuICAgICAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuICAgICAgICAgICAgICAgIGlmIChzZXNzaW9uWydmb2xkV2lkZ2V0cyddICYmIHNlc3Npb25bJ2ZvbGRXaWRnZXRzJ11bcm93XSkge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uWydvbkZvbGRXaWRnZXRDbGljayddKHJvdywgZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZWRpdG9yLm9uKCdndXR0ZXJkYmxjbGljaycsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlckxheWVyLmdldFJlZ2lvbihlKTtcblxuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PSAnZm9sZFdpZGdldHMnKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5nZXRTZXNzaW9uKCk7XG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSBzZXNzaW9uWydnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhJ10ocm93LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGRhdGEuZmlyc3RSYW5nZTtcblxuICAgICAgICAgICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBzZXNzaW9uLmdldExpbmUocm93KS5sZW5ndGgsIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uWydhZGRGb2xkJ10oXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KHsgcm93OiByYW5nZS5zdGFydC5yb3csIGNvbHVtbjogMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5pbnRlcmZhY2UgSUdlc3R1cmVIYW5kbGVyIHtcbiAgICBjYW5jZWxDb250ZXh0TWVudSgpOiB2b2lkO1xufVxuXG5jbGFzcyBNb3VzZUhhbmRsZXIge1xuICAgIHB1YmxpYyBlZGl0b3I6IEVkaXRvcjtcbiAgICBwcml2YXRlICRzY3JvbGxTcGVlZDogbnVtYmVyID0gMjtcbiAgICBwcml2YXRlICRkcmFnRGVsYXk6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSAkZHJhZ0VuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlO1xuICAgIHB1YmxpYyAkZm9jdXNUaW1vdXQ6IG51bWJlciA9IDA7XG4gICAgcHVibGljICR0b29sdGlwRm9sbG93c01vdXNlOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlIHN0YXRlOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBjbGllbnRYOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBjbGllbnRZOiBudW1iZXI7XG4gICAgcHVibGljIGlzTW91c2VQcmVzc2VkOiBib29sZWFuO1xuICAgIC8qKlxuICAgICAqIFRoZSBmdW5jdGlvbiB0byBjYWxsIHRvIHJlbGVhc2UgYSBjYXB0dXJlZCBtb3VzZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbGVhc2VNb3VzZTogKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICBwdWJsaWMgbW91c2Vkb3duRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSAkbW91c2VNb3ZlZDtcbiAgICBwcml2YXRlICRvbkNhcHR1cmVNb3VzZU1vdmU7XG4gICAgcHVibGljICRjbGlja1NlbGVjdGlvbjogUmFuZ2UgPSBudWxsO1xuICAgIHB1YmxpYyAkbGFzdFNjcm9sbFRpbWU6IG51bWJlcjtcbiAgICBwdWJsaWMgc2VsZWN0QnlMaW5lczogKCkgPT4gdm9pZDtcbiAgICBwdWJsaWMgc2VsZWN0QnlXb3JkczogKCkgPT4gdm9pZDtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICAvLyBGSVhNRTogRGlkIEkgbWVudGlvbiB0aGF0IGB0aGlzYCwgYG5ld2AsIGBjbGFzc2AsIGBiaW5kYCBhcmUgdGhlIDQgaG9yc2VtZW4/XG4gICAgICAgIC8vIEZJWE1FOiBGdW5jdGlvbiBTY29waW5nIGlzIHRoZSBhbnN3ZXIuXG4gICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG4gICAgICAgIC8vIEZJWE1FOiBXZSBzaG91bGQgYmUgY2xlYW5pbmcgdXAgdGhlc2UgaGFuZGxlcnMgaW4gYSBkaXNwb3NlIG1ldGhvZC4uLlxuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoJ21vdXNlZG93bicsIG1ha2VNb3VzZURvd25IYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoJ21vdXNld2hlZWwnLCBtYWtlTW91c2VXaGVlbEhhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImRibGNsaWNrXCIsIG1ha2VEb3VibGVDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcInRyaXBsZWNsaWNrXCIsIG1ha2VUcmlwbGVDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG4gICAgICAgIGVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcInF1YWRjbGlja1wiLCBtYWtlUXVhZENsaWNrSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcblxuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXMgPSBtYWtlRXh0ZW5kU2VsZWN0aW9uQnkoZWRpdG9yLCB0aGlzLCBcImdldExpbmVSYW5nZVwiKTtcbiAgICAgICAgdGhpcy5zZWxlY3RCeVdvcmRzID0gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvciwgdGhpcywgXCJnZXRXb3JkUmFuZ2VcIik7XG5cbiAgICAgICAgbmV3IEd1dHRlckhhbmRsZXIodGhpcyk7XG4gICAgICAgIC8vICAgICAgRklYTUU6IG5ldyBEcmFnZHJvcEhhbmRsZXIodGhpcyk7XG5cbiAgICAgICAgdmFyIG9uTW91c2VEb3duID0gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgaWYgKCFlZGl0b3IuaXNGb2N1c2VkKCkgJiYgZWRpdG9yLnRleHRJbnB1dCkge1xuICAgICAgICAgICAgICAgIGVkaXRvci50ZXh0SW5wdXQubW92ZVRvTW91c2UoZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKVxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBtb3VzZVRhcmdldDogSFRNTERpdkVsZW1lbnQgPSBlZGl0b3IucmVuZGVyZXIuZ2V0TW91c2VFdmVudFRhcmdldCgpO1xuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJjbGlja1wiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiY2xpY2tcIikpO1xuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJtb3VzZW1vdmVcIiwgdGhpcy5vbk1vdXNlTW92ZS5iaW5kKHRoaXMsIFwibW91c2Vtb3ZlXCIpKTtcbiAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihtb3VzZVRhcmdldCwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgaWYgKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWKSB7XG4gICAgICAgICAgICBhZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWLmlubmVyLCBbNDAwLCAzMDAsIDI1MF0sIHRoaXMsIFwib25Nb3VzZUV2ZW50XCIpO1xuICAgICAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFySC5pbm5lciwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgICAgIGlmIChpc0lFKSB7XG4gICAgICAgICAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhclYuZWxlbWVudCwgXCJtb3VzZWRvd25cIiwgb25Nb3VzZURvd24pO1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IEkgd29uZGVyIGlmIHdlIHNob3VsZCBiZSByZXNwb25kaW5nIHRvIG1vdXNlZG93biAoYnkgc3ltbWV0cnkpP1xuICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJILmVsZW1lbnQsIFwibW91c2Vtb3ZlXCIsIG9uTW91c2VEb3duKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdlIGhvb2sgJ21vdXNld2hlZWwnIHVzaW5nIHRoZSBwb3J0YWJsZSBcbiAgICAgICAgYWRkTW91c2VXaGVlbExpc3RlbmVyKGVkaXRvci5jb250YWluZXIsIHRoaXMuZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudC5iaW5kKHRoaXMsIFwibW91c2V3aGVlbFwiKSk7XG5cbiAgICAgICAgdmFyIGd1dHRlckVsID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXI7XG4gICAgICAgIGFkZExpc3RlbmVyKGd1dHRlckVsLCBcIm1vdXNlZG93blwiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVybW91c2Vkb3duXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwiZGJsY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcmRibGNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vtb3ZlXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJtb3VzZW1vdmVcIikpO1xuXG4gICAgICAgIGFkZExpc3RlbmVyKG1vdXNlVGFyZ2V0LCBcIm1vdXNlZG93blwiLCBvbk1vdXNlRG93bik7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vkb3duXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgcmV0dXJuIHByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBIYW5kbGUgYG1vdXNlbW92ZWAgd2hpbGUgdGhlIG1vdXNlIGlzIG92ZXIgdGhlIGVkaXRpbmcgYXJlYSAoYW5kIG5vdCB0aGUgZ3V0dGVyKS5cbiAgICAgICAgZWRpdG9yLm9uKCdtb3VzZW1vdmUnLCBmdW5jdGlvbihlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoX3NlbGYuc3RhdGUgfHwgX3NlbGYuJGRyYWdEZWxheSB8fCAhX3NlbGYuJGRyYWdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gRklYTUU6IFByb2JhYmx5IHMvYiBjbGllbnRYWVxuICAgICAgICAgICAgdmFyIGNoYXIgPSBlZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXMoZS54LCBlLnkpO1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLmdldFNlc3Npb24oKS5nZXRTZWxlY3Rpb24oKS5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHJlbmRlcmVyID0gZWRpdG9yLnJlbmRlcmVyO1xuXG4gICAgICAgICAgICBpZiAoIXJhbmdlLmlzRW1wdHkoKSAmJiByYW5nZS5pbnNpZGVTdGFydChjaGFyLnJvdywgY2hhci5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuc2V0Q3Vyc29yU3R5bGUoJ2RlZmF1bHQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlbmRlcmVyLnNldEN1cnNvclN0eWxlKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbk1vdXNlRXZlbnQobmFtZTogc3RyaW5nLCBlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKSk7XG4gICAgfVxuXG4gICAgb25Nb3VzZU1vdmUobmFtZTogc3RyaW5nLCBlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIC8vIElmIG5vYm9keSBpcyBsaXN0ZW5pbmcsIGF2b2lkIHRoZSBjcmVhdGlvbiBvZiB0aGUgdGVtcG9yYXJ5IHdyYXBwZXIuXG4gICAgICAgIC8vIG9wdGltaXphdGlvbiwgYmVjYXVzZSBtb3VzZW1vdmUgZG9lc24ndCBoYXZlIGEgZGVmYXVsdCBoYW5kbGVyLlxuICAgICAgICBpZiAodGhpcy5lZGl0b3IuaGFzTGlzdGVuZXJzKCdtb3VzZW1vdmUnKSkge1xuICAgICAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbmV3IEVkaXRvck1vdXNlRXZlbnQoZSwgdGhpcy5lZGl0b3IpKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGVtaXRFZGl0b3JNb3VzZVdoZWVsRXZlbnQobmFtZTogc3RyaW5nLCBlOiBNb3VzZVdoZWVsRXZlbnQpIHtcbiAgICAgICAgdmFyIG1vdXNlRXZlbnQgPSBuZXcgRWRpdG9yTW91c2VFdmVudChlLCB0aGlzLmVkaXRvcik7XG4gICAgICAgIG1vdXNlRXZlbnQuc3BlZWQgPSB0aGlzLiRzY3JvbGxTcGVlZCAqIDI7XG4gICAgICAgIG1vdXNlRXZlbnQud2hlZWxYID0gZVsnd2hlZWxYJ107XG4gICAgICAgIG1vdXNlRXZlbnQud2hlZWxZID0gZVsnd2hlZWxZJ107XG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG1vdXNlRXZlbnQpO1xuICAgIH1cblxuICAgIHNldFN0YXRlKHN0YXRlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICAgIH1cblxuICAgIHRleHRDb29yZGluYXRlcygpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICB9XG5cbiAgICBjYXB0dXJlTW91c2UoZXY6IEVkaXRvck1vdXNlRXZlbnQsIG1vdXNlTW92ZUhhbmRsZXI/OiAobW91c2VFdmVudDogTW91c2VFdmVudCkgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLmNsaWVudFggPSBldi5jbGllbnRYO1xuICAgICAgICB0aGlzLmNsaWVudFkgPSBldi5jbGllbnRZO1xuXG4gICAgICAgIHRoaXMuaXNNb3VzZVByZXNzZWQgPSB0cnVlO1xuXG4gICAgICAgIC8vIGRvIG5vdCBtb3ZlIHRleHRhcmVhIGR1cmluZyBzZWxlY3Rpb25cbiAgICAgICAgdmFyIHJlbmRlcmVyID0gdGhpcy5lZGl0b3IucmVuZGVyZXI7XG4gICAgICAgIGlmIChyZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IpIHtcbiAgICAgICAgICAgIHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb25Nb3VzZU1vdmUgPSAoZnVuY3Rpb24oZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24obW91c2VFdmVudDogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgICAgIGlmICghbW91c2VFdmVudCkgcmV0dXJuO1xuICAgICAgICAgICAgICAgIC8vIGlmIGVkaXRvciBpcyBsb2FkZWQgaW5zaWRlIGlmcmFtZSwgYW5kIG1vdXNldXAgZXZlbnQgaXMgb3V0c2lkZVxuICAgICAgICAgICAgICAgIC8vIHdlIHdvbid0IHJlY2lldmUgaXQsIHNvIHdlIGNhbmNlbCBvbiBmaXJzdCBtb3VzZW1vdmUgd2l0aG91dCBidXR0b25cbiAgICAgICAgICAgICAgICBpZiAoaXNXZWJLaXQgJiYgIW1vdXNlRXZlbnQud2hpY2ggJiYgbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBGb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgSSdtIHBhc3NpbmcgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICAvLyBidXQgaXQgd291bGQgcHJvYmFibHkgbWFrZSBtb3JlIHNlbnNlIHRvIHBhc3MgdGhlIG1vdXNlIGV2ZW50XG4gICAgICAgICAgICAgICAgICAgIC8vIHNpbmNlIHRoYXQgaXMgdGhlIGZpbmFsIGV2ZW50LlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSh1bmRlZmluZWQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jbGllbnRYID0gbW91c2VFdmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jbGllbnRZID0gbW91c2VFdmVudC5jbGllbnRZO1xuICAgICAgICAgICAgICAgIG1vdXNlTW92ZUhhbmRsZXIgJiYgbW91c2VNb3ZlSGFuZGxlcihtb3VzZUV2ZW50KTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIubW91c2VFdmVudCA9IG5ldyBFZGl0b3JNb3VzZUV2ZW50KG1vdXNlRXZlbnQsIGVkaXRvcik7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRtb3VzZU1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcy5lZGl0b3IsIHRoaXMpO1xuXG4gICAgICAgIHZhciBvbkNhcHR1cmVFbmQgPSAoZnVuY3Rpb24obW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcklkKTtcbiAgICAgICAgICAgICAgICBvbkNhcHR1cmVJbnRlcnZhbCgpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGUgKyBcIkVuZFwiXSAmJiBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlICsgXCJFbmRcIl0oZSk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLnN0YXRlID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5pc01vdXNlUHJlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kb25DYXB0dXJlTW91c2VNb3ZlID0gbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgZSAmJiBtb3VzZUhhbmRsZXIub25Nb3VzZUV2ZW50KFwibW91c2V1cFwiLCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcyk7XG5cbiAgICAgICAgdmFyIG9uQ2FwdHVyZUludGVydmFsID0gKGZ1bmN0aW9uKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZV0gJiYgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZV0oKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJG1vdXNlTW92ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcyk7XG5cbiAgICAgICAgaWYgKGlzT2xkSUUgJiYgZXYuZG9tRXZlbnQudHlwZSA9PSBcImRibGNsaWNrXCIpIHtcbiAgICAgICAgICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBvbkNhcHR1cmVFbmQoZXYpOyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJG9uQ2FwdHVyZU1vdXNlTW92ZSA9IG9uTW91c2VNb3ZlO1xuICAgICAgICB0aGlzLnJlbGVhc2VNb3VzZSA9IGNhcHR1cmUodGhpcy5lZGl0b3IuY29udGFpbmVyLCBvbk1vdXNlTW92ZSwgb25DYXB0dXJlRW5kKTtcbiAgICAgICAgdmFyIHRpbWVySWQgPSBzZXRJbnRlcnZhbChvbkNhcHR1cmVJbnRlcnZhbCwgMjApO1xuICAgIH1cblxuICAgIGNhbmNlbENvbnRleHRNZW51KCk6IHZvaWQge1xuICAgICAgICB2YXIgc3RvcCA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGlmIChlICYmIGUuZG9tRXZlbnQgJiYgZS5kb21FdmVudC50eXBlICE9IFwiY29udGV4dG1lbnVcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLm9mZihcIm5hdGl2ZWNvbnRleHRtZW51XCIsIHN0b3ApO1xuICAgICAgICAgICAgaWYgKGUgJiYgZS5kb21FdmVudCkge1xuICAgICAgICAgICAgICAgIHN0b3BFdmVudChlLmRvbUV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuICAgICAgICBzZXRUaW1lb3V0KHN0b3AsIDEwKTtcbiAgICAgICAgdGhpcy5lZGl0b3Iub24oXCJuYXRpdmVjb250ZXh0bWVudVwiLCBzdG9wKTtcbiAgICB9XG5cbiAgICBzZWxlY3QoKSB7XG4gICAgICAgIHZhciBhbmNob3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG5cbiAgICAgICAgaWYgKHRoaXMuJGNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB2YXIgY21wID0gdGhpcy4kY2xpY2tTZWxlY3Rpb24uY29tcGFyZVBvaW50KGN1cnNvcik7XG5cbiAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSB0aGlzLiRjbGlja1NlbGVjdGlvbi5lbmQ7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNtcCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gdGhpcy4kY2xpY2tTZWxlY3Rpb24uc3RhcnQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBvcmllbnRlZFJhbmdlID0gY2FsY1JhbmdlT3JpZW50YXRpb24odGhpcy4kY2xpY2tTZWxlY3Rpb24sIGN1cnNvcik7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gb3JpZW50ZWRSYW5nZS5jdXJzb3I7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gb3JpZW50ZWRSYW5nZS5hbmNob3I7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uQW5jaG9yKGFuY2hvci5yb3csIGFuY2hvci5jb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgdGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoKTtcbiAgICB9XG5cbiAgICBzZWxlY3RCeUxpbmVzRW5kKCkge1xuICAgICAgICB0aGlzLiRjbGlja1NlbGVjdGlvbiA9IG51bGw7XG4gICAgICAgIHRoaXMuZWRpdG9yLnVuc2V0U3R5bGUoXCJhY2Vfc2VsZWN0aW5nXCIpO1xuICAgICAgICBpZiAodGhpcy5lZGl0b3IucmVuZGVyZXIuc2Nyb2xsZXJbJ3JlbGVhc2VDYXB0dXJlJ10pIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyWydyZWxlYXNlQ2FwdHVyZSddKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzdGFydFNlbGVjdChwb3M6IFBvc2l0aW9uLCB3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHBvcyA9IHBvcyB8fCB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgICAgIHZhciBlZGl0b3IgPSB0aGlzLmVkaXRvcjtcbiAgICAgICAgLy8gYWxsb3cgZG91YmxlL3RyaXBsZSBjbGljayBoYW5kbGVycyB0byBjaGFuZ2Ugc2VsZWN0aW9uXG4gICAgXG4gICAgICAgIGlmICh0aGlzLm1vdXNlZG93bkV2ZW50LmdldFNoaWZ0S2V5KCkpIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihwb3MpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCF3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghd2FpdEZvckNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyWydzZXRDYXB0dXJlJ10pIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyWydzZXRDYXB0dXJlJ10oKTtcbiAgICAgICAgfVxuICAgICAgICBlZGl0b3Iuc2V0U3R5bGUoXCJhY2Vfc2VsZWN0aW5nXCIpO1xuICAgICAgICB0aGlzLnNldFN0YXRlKFwic2VsZWN0XCIpO1xuICAgIH1cblxuICAgIHNlbGVjdEVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QWxsRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBzZWxlY3RCeVdvcmRzRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBmb2N1c1dhaXQoKSB7XG4gICAgICAgIHZhciBkaXN0YW5jZSA9IGNhbGNEaXN0YW5jZSh0aGlzLm1vdXNlZG93bkV2ZW50LmNsaWVudFgsIHRoaXMubW91c2Vkb3duRXZlbnQuY2xpZW50WSwgdGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB2YXIgdGltZSA9IERhdGUubm93KCk7XG5cbiAgICAgICAgaWYgKGRpc3RhbmNlID4gRFJBR19PRkZTRVQgfHwgdGltZSAtIHRoaXMubW91c2Vkb3duRXZlbnQudGltZSA+IHRoaXMuJGZvY3VzVGltb3V0KSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0U2VsZWN0KHRoaXMubW91c2Vkb3duRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpKTtcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG5kZWZpbmVPcHRpb25zKE1vdXNlSGFuZGxlci5wcm90b3R5cGUsIFwibW91c2VIYW5kbGVyXCIsIHtcbiAgICBzY3JvbGxTcGVlZDogeyBpbml0aWFsVmFsdWU6IDIgfSxcbiAgICBkcmFnRGVsYXk6IHsgaW5pdGlhbFZhbHVlOiAoaXNNYWMgPyAxNTAgOiAwKSB9LFxuICAgIGRyYWdFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIGZvY3VzVGltb3V0OiB7IGluaXRpYWxWYWx1ZTogMCB9LFxuICAgIHRvb2x0aXBGb2xsb3dzTW91c2U6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH1cbn0pO1xuXG4vKipcbiAqIEN1c3RvbSBBY2UgbW91c2UgZXZlbnRcbiAqXG4gKiBAY2xhc3MgRWRpdG9yTW91c2VFdmVudFxuICovXG5jbGFzcyBFZGl0b3JNb3VzZUV2ZW50IHtcbiAgICAvLyBXZSBrZWVwIHRoZSBvcmlnaW5hbCBET00gZXZlbnRcbiAgICBwdWJsaWMgZG9tRXZlbnQ6IE1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSBlZGl0b3I6IEVkaXRvcjtcbiAgICBwdWJsaWMgY2xpZW50WDogbnVtYmVyO1xuICAgIHB1YmxpYyBjbGllbnRZOiBudW1iZXI7XG4gICAgLyoqXG4gICAgICogQ2FjaGVkIHRleHQgY29vcmRpbmF0ZXMgZm9sbG93aW5nIGdldERvY3VtZW50UG9zaXRpb24oKVxuICAgICAqL1xuICAgIHByaXZhdGUgJHBvczogUG9zaXRpb247XG4gICAgcHJpdmF0ZSAkaW5TZWxlY3Rpb246IGJvb2xlYW47XG4gICAgcHJpdmF0ZSBwcm9wYWdhdGlvblN0b3BwZWQgPSBmYWxzZTtcbiAgICBwcml2YXRlIGRlZmF1bHRQcmV2ZW50ZWQgPSBmYWxzZTtcbiAgICBwdWJsaWMgdGltZTogbnVtYmVyO1xuICAgIC8vIHdoZWVsWSwgd2hlZWxZIGFuZCBzcGVlZCBhcmUgZm9yICdtb3VzZXdoZWVsJyBldmVudHMuXG4gICAgcHVibGljIHdoZWVsWDogbnVtYmVyO1xuICAgIHB1YmxpYyB3aGVlbFk6IG51bWJlcjtcbiAgICBwdWJsaWMgc3BlZWQ6IG51bWJlcjtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBFZGl0b3JNb3VzZUV2ZW50XG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICogQHBhcmFtIGRvbUV2ZW50IHtNb3VzZUV2ZW50fVxuICAgICAqIEBwYXJhbSBlZGl0b3Ige0VkaXRvcn1cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihkb21FdmVudDogTW91c2VFdmVudCwgZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgdGhpcy5kb21FdmVudCA9IGRvbUV2ZW50O1xuICAgICAgICB0aGlzLmVkaXRvciA9IGVkaXRvcjtcblxuICAgICAgICB0aGlzLmNsaWVudFggPSBkb21FdmVudC5jbGllbnRYO1xuICAgICAgICB0aGlzLmNsaWVudFkgPSBkb21FdmVudC5jbGllbnRZO1xuXG4gICAgICAgIHRoaXMuJHBvcyA9IG51bGw7XG4gICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gbnVsbDtcbiAgICB9XG5cbiAgICBnZXQgdG9FbGVtZW50KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb21FdmVudC50b0VsZW1lbnQ7XG4gICAgfVxuXG4gICAgc3RvcFByb3BhZ2F0aW9uKCk6IHZvaWQge1xuICAgICAgICBzdG9wUHJvcGFnYXRpb24odGhpcy5kb21FdmVudCk7XG4gICAgICAgIHRoaXMucHJvcGFnYXRpb25TdG9wcGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBwcmV2ZW50RGVmYXVsdCgpIHtcbiAgICAgICAgcHJldmVudERlZmF1bHQodGhpcy5kb21FdmVudCk7XG4gICAgICAgIHRoaXMuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgc3RvcCgpIHtcbiAgICAgICAgdGhpcy5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgdGhpcy5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgZG9jdW1lbnQgcG9zaXRpb24gYmVsb3cgdGhlIG1vdXNlIGN1cnNvclxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXREb2N1bWVudFBvc2l0aW9uXG4gICAgICogQHJldHVybiB7UG9zaXRpb259ICdyb3cnIGFuZCAnY29sdW1uJyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb25cbiAgICAgKi9cbiAgICBnZXREb2N1bWVudFBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcbiAgICAgICAgaWYgKCF0aGlzLiRwb3MpIHtcbiAgICAgICAgICAgIHRoaXMuJHBvcyA9IHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKHRoaXMuY2xpZW50WCwgdGhpcy5jbGllbnRZKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy4kcG9zO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIENoZWNrIGlmIHRoZSBtb3VzZSBjdXJzb3IgaXMgaW5zaWRlIG9mIHRoZSB0ZXh0IHNlbGVjdGlvblxuICAgICAqXG4gICAgICogQG1ldGhvZCBpblNlbGVjdGlvblxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhlIG1vdXNlIGN1cnNvciBpcyBpbnNpZGUgb2YgdGhlIHNlbGVjdGlvblxuICAgICAqL1xuICAgIGluU2VsZWN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy4kaW5TZWxlY3Rpb24gIT09IG51bGwpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kaW5TZWxlY3Rpb247XG5cbiAgICAgICAgdmFyIGVkaXRvciA9IHRoaXMuZWRpdG9yO1xuXG5cbiAgICAgICAgdmFyIHNlbGVjdGlvblJhbmdlID0gZWRpdG9yLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChzZWxlY3Rpb25SYW5nZS5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLiRpblNlbGVjdGlvbiA9IGZhbHNlO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gc2VsZWN0aW9uUmFuZ2UuY29udGFpbnMocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy4kaW5TZWxlY3Rpb247XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogR2V0IHRoZSBjbGlja2VkIG1vdXNlIGJ1dHRvblxuICAgICAqIFxuICAgICAqIEByZXR1cm4ge051bWJlcn0gMCBmb3IgbGVmdCBidXR0b24sIDEgZm9yIG1pZGRsZSBidXR0b24sIDIgZm9yIHJpZ2h0IGJ1dHRvblxuICAgICAqL1xuICAgIGdldEJ1dHRvbigpIHtcbiAgICAgICAgcmV0dXJuIGdldEJ1dHRvbih0aGlzLmRvbUV2ZW50KTtcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufSB3aGV0aGVyIHRoZSBzaGlmdCBrZXkgd2FzIHByZXNzZWQgd2hlbiB0aGUgZXZlbnQgd2FzIGVtaXR0ZWRcbiAgICAgKi9cbiAgICBnZXRTaGlmdEtleSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tRXZlbnQuc2hpZnRLZXk7XG4gICAgfVxuXG4gICAgZ2V0QWNjZWxLZXkgPSBpc01hYyA/IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kb21FdmVudC5tZXRhS2V5OyB9IDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvbUV2ZW50LmN0cmxLZXk7IH07XG59XG5cbnZhciBEUkFHX09GRlNFVCA9IDA7IC8vIHBpeGVsc1xuXG5mdW5jdGlvbiBtYWtlTW91c2VEb3duSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZXY6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgdmFyIGluU2VsZWN0aW9uID0gZXYuaW5TZWxlY3Rpb24oKTtcbiAgICAgICAgdmFyIHBvcyA9IGV2LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlZG93bkV2ZW50ID0gZXY7XG5cbiAgICAgICAgdmFyIGJ1dHRvbiA9IGV2LmdldEJ1dHRvbigpO1xuICAgICAgICBpZiAoYnV0dG9uICE9PSAwKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbXB0eSA9IHNlbGVjdGlvblJhbmdlLmlzRW1wdHkoKTtcblxuICAgICAgICAgICAgaWYgKHNlbGVjdGlvbkVtcHR5KVxuICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcblxuICAgICAgICAgICAgLy8gMjogY29udGV4dG1lbnUsIDE6IGxpbnV4IHBhc3RlXG4gICAgICAgICAgICBlZGl0b3IudGV4dElucHV0Lm9uQ29udGV4dE1lbnUoZXYuZG9tRXZlbnQpO1xuICAgICAgICAgICAgcmV0dXJuOyAvLyBzdG9wcGluZyBldmVudCBoZXJlIGJyZWFrcyBjb250ZXh0bWVudSBvbiBmZiBtYWNcbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5tb3VzZWRvd25FdmVudC50aW1lID0gRGF0ZS5ub3coKTtcbiAgICAgICAgLy8gaWYgdGhpcyBjbGljayBjYXVzZWQgdGhlIGVkaXRvciB0byBiZSBmb2N1c2VkIHNob3VsZCBub3QgY2xlYXIgdGhlXG4gICAgICAgIC8vIHNlbGVjdGlvblxuICAgICAgICBpZiAoaW5TZWxlY3Rpb24gJiYgIWVkaXRvci5pc0ZvY3VzZWQoKSkge1xuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICBpZiAobW91c2VIYW5kbGVyLiRmb2N1c1RpbW91dCAmJiAhbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiAmJiAhZWRpdG9yLmluTXVsdGlTZWxlY3RNb2RlKSB7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwiZm9jdXNXYWl0XCIpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZXYpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZXYpO1xuICAgICAgICAvLyBUT0RPOiBfY2xpY2tzIGlzIGEgY3VzdG9tIHByb3BlcnR5IGFkZGVkIGluIGV2ZW50LnRzIGJ5IHRoZSAnbW91c2Vkb3duJyBsaXN0ZW5lci5cbiAgICAgICAgbW91c2VIYW5kbGVyLnN0YXJ0U2VsZWN0KHBvcywgZXYuZG9tRXZlbnRbJ19jbGlja3MnXSA+IDEpO1xuICAgICAgICByZXR1cm4gZXYucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VNb3VzZVdoZWVsSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZXY6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgaWYgKGV2LmdldEFjY2VsS2V5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vc2hpZnQgd2hlZWwgdG8gaG9yaXogc2Nyb2xsXG4gICAgICAgIGlmIChldi5nZXRTaGlmdEtleSgpICYmIGV2LndoZWVsWSAmJiAhZXYud2hlZWxYKSB7XG4gICAgICAgICAgICBldi53aGVlbFggPSBldi53aGVlbFk7XG4gICAgICAgICAgICBldi53aGVlbFkgPSAwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHQgPSBldi5kb21FdmVudC50aW1lU3RhbXA7XG4gICAgICAgIHZhciBkdCA9IHQgLSAobW91c2VIYW5kbGVyLiRsYXN0U2Nyb2xsVGltZSB8fCAwKTtcblxuICAgICAgICB2YXIgaXNTY3JvbGFibGUgPSBlZGl0b3IucmVuZGVyZXIuaXNTY3JvbGxhYmxlQnkoZXYud2hlZWxYICogZXYuc3BlZWQsIGV2LndoZWVsWSAqIGV2LnNwZWVkKTtcbiAgICAgICAgaWYgKGlzU2Nyb2xhYmxlIHx8IGR0IDwgMjAwKSB7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGxhc3RTY3JvbGxUaW1lID0gdDtcbiAgICAgICAgICAgIGVkaXRvci5yZW5kZXJlci5zY3JvbGxCeShldi53aGVlbFggKiBldi5zcGVlZCwgZXYud2hlZWxZICogZXYuc3BlZWQpO1xuICAgICAgICAgICAgcmV0dXJuIGV2LnN0b3AoKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZURvdWJsZUNsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgcG9zID0gZWRpdG9yTW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLmdldFNlc3Npb24oKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSBzZXNzaW9uLmdldEJyYWNrZXRSYW5nZShwb3MpO1xuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4tLTtcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RcIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZSA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0V29yZFJhbmdlKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlXb3Jkc1wiKTtcbiAgICAgICAgfVxuICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gcmFuZ2U7XG4gICAgICAgIG1vdXNlSGFuZGxlci5zZWxlY3QoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VUcmlwbGVDbGlja0hhbmRsZXIoZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVkaXRvck1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgdmFyIHBvcyA9IGVkaXRvck1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuXG4gICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEJ5TGluZXNcIik7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2UuaXNNdWx0aUxpbmUoKSAmJiByYW5nZS5jb250YWlucyhwb3Mucm93LCBwb3MuY29sdW1uKSkge1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmVuZCA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJhbmdlLmVuZC5yb3cpLmVuZDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShwb3Mucm93KTtcbiAgICAgICAgfVxuICAgICAgICBtb3VzZUhhbmRsZXIuc2VsZWN0KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlUXVhZENsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QWxsXCIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlciwgdW5pdE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFuY2hvcjtcbiAgICAgICAgdmFyIGN1cnNvciA9IG1vdXNlSGFuZGxlci50ZXh0Q29vcmRpbmF0ZXMoKTtcbiAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvblt1bml0TmFtZV0oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHZhciBjbXBTdGFydCA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uY29tcGFyZVBvaW50KHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgIHZhciBjbXBFbmQgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChyYW5nZS5lbmQpO1xuXG4gICAgICAgICAgICBpZiAoY21wU3RhcnQgPT0gLTEgJiYgY21wRW5kIDw9IDApIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmVuZDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuZW5kLnJvdyAhPSBjdXJzb3Iucm93IHx8IHJhbmdlLmVuZC5jb2x1bW4gIT0gY3Vyc29yLmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXBFbmQgPT0gMSAmJiBjbXBTdGFydCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ICE9IGN1cnNvci5yb3cgfHwgcmFuZ2Uuc3RhcnQuY29sdW1uICE9IGN1cnNvci5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGN1cnNvciA9IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcFN0YXJ0ID09IC0xICYmIGNtcEVuZCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGVkUmFuZ2UgPSBjYWxjUmFuZ2VPcmllbnRhdGlvbihtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IG9yaWVudGVkUmFuZ2UuY3Vyc29yO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG9yaWVudGVkUmFuZ2UuYW5jaG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjYWxjRGlzdGFuY2UoYXg6IG51bWJlciwgYXk6IG51bWJlciwgYng6IG51bWJlciwgYnk6IG51bWJlcikge1xuICAgIHJldHVybiBNYXRoLnNxcnQoTWF0aC5wb3coYnggLSBheCwgMikgKyBNYXRoLnBvdyhieSAtIGF5LCAyKSk7XG59XG5cbmZ1bmN0aW9uIGNhbGNSYW5nZU9yaWVudGF0aW9uKHJhbmdlOiBSYW5nZSwgY3Vyc29yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KTogeyBjdXJzb3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07IGFuY2hvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB9IHtcbiAgICBpZiAocmFuZ2Uuc3RhcnQucm93ID09IHJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgdmFyIGNtcCA9IDIgKiBjdXJzb3IuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uIC0gcmFuZ2UuZW5kLmNvbHVtbjtcbiAgICB9XG4gICAgZWxzZSBpZiAocmFuZ2Uuc3RhcnQucm93ID09IHJhbmdlLmVuZC5yb3cgLSAxICYmICFyYW5nZS5zdGFydC5jb2x1bW4gJiYgIXJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgdmFyIGNtcCA9IGN1cnNvci5jb2x1bW4gLSA0O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdmFyIGNtcCA9IDIgKiBjdXJzb3Iucm93IC0gcmFuZ2Uuc3RhcnQucm93IC0gcmFuZ2UuZW5kLnJvdztcbiAgICB9XG5cbiAgICBpZiAoY21wIDwgMCkge1xuICAgICAgICByZXR1cm4geyBjdXJzb3I6IHJhbmdlLnN0YXJ0LCBhbmNob3I6IHJhbmdlLmVuZCB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgY3Vyc29yOiByYW5nZS5lbmQsIGFuY2hvcjogcmFuZ2Uuc3RhcnQgfTtcbiAgICB9XG59XG5cbmNsYXNzIEd1dHRlckhhbmRsZXIge1xuICAgIGNvbnN0cnVjdG9yKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgIHZhciBlZGl0b3I6IEVkaXRvciA9IG1vdXNlSGFuZGxlci5lZGl0b3I7XG4gICAgICAgIHZhciBndXR0ZXI6IEd1dHRlciA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXI7XG4gICAgICAgIHZhciB0b29sdGlwID0gbmV3IEd1dHRlclRvb2x0aXAoZWRpdG9yLmNvbnRhaW5lcik7XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlZG93blwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoIWVkaXRvci5pc0ZvY3VzZWQoKSB8fCBlLmdldEJ1dHRvbigpICE9IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBndXR0ZXIuZ2V0UmVnaW9uKGUpO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyUmVnaW9uID09PSBcImZvbGRXaWRnZXRzXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlc3Npb24oKS5nZXRTZWxlY3Rpb24oKTtcblxuICAgICAgICAgICAgaWYgKGUuZ2V0U2hpZnRLZXkoKSkge1xuICAgICAgICAgICAgICAgIHNlbGVjdGlvbi5zZWxlY3RUbyhyb3csIDApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKGUuZG9tRXZlbnQuZGV0YWlsID09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdEFsbCgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gZWRpdG9yLnNlbGVjdGlvbi5nZXRMaW5lUmFuZ2Uocm93KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEJ5TGluZXNcIik7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuY2FwdHVyZU1vdXNlKGUpO1xuICAgICAgICAgICAgcmV0dXJuIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgfSk7XG5cblxuICAgICAgICB2YXIgdG9vbHRpcFRpbWVvdXQ6IG51bWJlcjtcbiAgICAgICAgdmFyIG1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgICAgIHZhciB0b29sdGlwQW5ub3RhdGlvbjogc3RyaW5nO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNob3dUb29sdGlwKCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IG1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBhbm5vdGF0aW9uID0gZ3V0dGVyLiRhbm5vdGF0aW9uc1tyb3ddO1xuICAgICAgICAgICAgaWYgKCFhbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3IuZ2V0U2Vzc2lvbigpO1xuICAgICAgICAgICAgdmFyIG1heFJvdyA9IHNlc3Npb24uZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICBpZiAocm93ID09IG1heFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzY3JlZW5Sb3cgPSBlZGl0b3IucmVuZGVyZXIucGl4ZWxUb1NjcmVlbkNvb3JkaW5hdGVzKDAsIG1vdXNlRXZlbnQuY2xpZW50WSkucm93O1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSBtb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAoc2NyZWVuUm93ID4gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KHBvcy5yb3csIHBvcy5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUT0RPOiBMb29rcyBsaWtlIHRoZSBndXR0ZXIgYW5ub3RhdGlvbiBtaWdodCBhbHNvIGJlIGEgc3RyaW5nP1xuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uID09IGFubm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBUT0RPOiBUaGUgR3V0dGVyIGFubm90YXRpb25zIGFyZSBzdWJ0bHkgZGlmZmVyZW50IGZyb20gQW5ub3RhdGlvblxuICAgICAgICAgICAgLy8gaW4gdGhhdCB0aGUgdGV4dCBwcm9wZXJ0eSBpcyBhIHN0cmluZ1tdIHJhdGhlciB0aGFuIHN0cmluZy5cbiAgICAgICAgICAgIHRvb2x0aXBBbm5vdGF0aW9uID0gYW5ub3RhdGlvbi50ZXh0LmpvaW4oXCI8YnIvPlwiKTtcblxuICAgICAgICAgICAgdG9vbHRpcC5zZXRIdG1sKHRvb2x0aXBBbm5vdGF0aW9uKTtcblxuICAgICAgICAgICAgdG9vbHRpcC5zaG93KCk7XG5cbiAgICAgICAgICAgIGVkaXRvci5vbihcIm1vdXNld2hlZWxcIiwgaGlkZVRvb2x0aXApO1xuXG4gICAgICAgICAgICBpZiAobW91c2VIYW5kbGVyLiR0b29sdGlwRm9sbG93c01vdXNlKSB7XG4gICAgICAgICAgICAgICAgbW92ZVRvb2x0aXAobW91c2VFdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZ3V0dGVyRWxlbWVudCA9IGd1dHRlci4kY2VsbHNbZWRpdG9yLmdldFNlc3Npb24oKS5kb2N1bWVudFRvU2NyZWVuUm93KHJvdywgMCldLmVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgdmFyIHJlY3QgPSBndXR0ZXJFbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgICAgICAgICAgIHZhciBzdHlsZSA9IHRvb2x0aXAuZ2V0RWxlbWVudCgpLnN0eWxlO1xuICAgICAgICAgICAgICAgIHN0eWxlLmxlZnQgPSByZWN0LnJpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgIHN0eWxlLnRvcCA9IHJlY3QuYm90dG9tICsgXCJweFwiO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaGlkZVRvb2x0aXAoZXZlbnQsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgICAgICBpZiAodG9vbHRpcFRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodG9vbHRpcFRpbWVvdXQpO1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcC5oaWRlKCk7XG4gICAgICAgICAgICAgICAgdG9vbHRpcEFubm90YXRpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIGVkaXRvci5vZmYoXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG1vdmVUb29sdGlwKGV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICB0b29sdGlwLnNldFBvc2l0aW9uKGV2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlbW92ZVwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogT2JmdXNjYXRpbmcgdGhlIHR5cGUgb2YgdGFyZ2V0IHRvIHRod2FydCBjb21waWxlci5cbiAgICAgICAgICAgIHZhciB0YXJnZXQ6IGFueSA9IGUuZG9tRXZlbnQudGFyZ2V0IHx8IGUuZG9tRXZlbnQuc3JjRWxlbWVudDtcbiAgICAgICAgICAgIGlmIChoYXNDc3NDbGFzcyh0YXJnZXQsIFwiYWNlX2ZvbGQtd2lkZ2V0XCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uICYmIG1vdXNlSGFuZGxlci4kdG9vbHRpcEZvbGxvd3NNb3VzZSkge1xuICAgICAgICAgICAgICAgIG1vdmVUb29sdGlwKGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBtb3VzZUV2ZW50ID0gZTtcbiAgICAgICAgICAgIGlmICh0b29sdGlwVGltZW91dCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKG1vdXNlRXZlbnQgJiYgIW1vdXNlSGFuZGxlci5pc01vdXNlUHJlc3NlZClcbiAgICAgICAgICAgICAgICAgICAgc2hvd1Rvb2x0aXAoKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGhpZGVUb29sdGlwKHZvaWQgMCwgZWRpdG9yKTtcbiAgICAgICAgICAgIH0sIDUwKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXIsIFwibW91c2VvdXRcIiwgZnVuY3Rpb24oZTogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgbW91c2VFdmVudCA9IG51bGw7XG4gICAgICAgICAgICBpZiAoIXRvb2x0aXBBbm5vdGF0aW9uIHx8IHRvb2x0aXBUaW1lb3V0KVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHRvb2x0aXBUaW1lb3V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICBoaWRlVG9vbHRpcCh2b2lkIDAsIGVkaXRvcik7XG4gICAgICAgICAgICB9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGVkaXRvci5vbihcImNoYW5nZVNlc3Npb25cIiwgaGlkZVRvb2x0aXApO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAY2xhc3MgR3V0dGVyVG9vbHRpcFxuICogQGV4dGVuZHMgVG9vbHRpcFxuICovXG5jbGFzcyBHdXR0ZXJUb29sdGlwIGV4dGVuZHMgVG9vbHRpcCB7XG4gICAgY29uc3RydWN0b3IocGFyZW50Tm9kZTogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50Tm9kZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0UG9zaXRpb25cbiAgICAgKiBAcGFyYW0geCB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSB5IHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRQb3NpdGlvbih4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG4gICAgICAgIHZhciB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodDtcbiAgICAgICAgdmFyIHdpZHRoID0gdGhpcy5nZXRXaWR0aCgpO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHQoKTtcbiAgICAgICAgeCArPSAxNTtcbiAgICAgICAgeSArPSAxNTtcbiAgICAgICAgaWYgKHggKyB3aWR0aCA+IHdpbmRvd1dpZHRoKSB7XG4gICAgICAgICAgICB4IC09ICh4ICsgd2lkdGgpIC0gd2luZG93V2lkdGg7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHkgKyBoZWlnaHQgPiB3aW5kb3dIZWlnaHQpIHtcbiAgICAgICAgICAgIHkgLT0gMjAgKyBoZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgc3VwZXIuc2V0UG9zaXRpb24oeCwgeSk7XG4gICAgfVxufVxuIl19