import { mixin } from "./lib/oop";
import { computedStyle, hasCssClass, setCssClass } from "./lib/dom";
import { delayedCall, stringRepeat } from "./lib/lang";
import { isIE, isMac, isMobile, isOldIE, isWebKit } from "./lib/useragent";
import TextInput from "./keyboard/textinput";
import KeyBinding from "./keyboard/keybinding";
import { EditSession } from "./edit_session";
import Search from "./search";
import { Range } from "./range";
import { EventEmitterClass } from "./lib/event_emitter";
import CommandManager from "./commands/CommandManager";
import defaultCommands from "./commands/default_commands";
import { defineOptions, loadModule, resetOptions, _signal } from "./config";
import TokenIterator from "./TokenIterator";
import { COMMAND_NAME_AUTO_COMPLETE } from './editor_protocol';
import { addListener, addMouseWheelListener, addMultiMouseDownListener, capture, getButton, preventDefault, stopEvent, stopPropagation } from "./lib/event";
import { touchManager } from './touch/touch';
import { Tooltip } from "./tooltip";
export default class Editor extends EventEmitterClass {
    constructor(renderer, session) {
        super();
        this.commands = new CommandManager(isMac ? "mac" : "win", defaultCommands);
        this.curOp = null;
        this.prevOp = {};
        this.$mergeableCommands = ["backspace", "del", "insertstring"];
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
        this.$search = new Search().set({
            wrap: true
        });
        this.$historyTracker = this.$historyTracker.bind(this);
        this.commands.on("exec", this.$historyTracker);
        this.$initOperationListeners();
        this._$emitInputEvent = delayedCall(function () {
            this._signal("input", {});
            this.session.bgTokenizer && this.session.bgTokenizer.scheduleStart();
        }.bind(this));
        this.on("change", function (_, _self) {
            _self._$emitInputEvent.schedule(31);
        });
        this.setSession(session || new EditSession(""));
        resetOptions(this);
        _signal("editor", this);
    }
    cancelMouseContextMenu() {
        this.$mouseHandler.cancelContextMenu();
    }
    get selection() {
        return this.session.getSelection();
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
            });
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
    onDocumentChange(e) {
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
    onTokenizerUpdate(e) {
        var rows = e.data;
        this.renderer.updateLines(rows.first, rows.last);
    }
    onScrollTopChange() {
        this.renderer.scrollToY(this.session.getScrollTop());
    }
    onScrollLeftChange() {
        this.renderer.scrollToX(this.session.getScrollLeft());
    }
    onCursorChange() {
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
            var range = new Range(highlight.row, highlight.column, highlight.row, Infinity);
            range.id = session.addMarker(range, "ace_active-line", "screenLine");
            session.$highlightLineMarker = range;
        }
        else if (highlight) {
            session.$highlightLineMarker.start.row = highlight.row;
            session.$highlightLineMarker.end.row = highlight.row;
            session.$highlightLineMarker.start.column = highlight.column;
            session._signal("changeBackMarker");
        }
    }
    onSelectionChange(e) {
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
    onChangeFrontMarker() {
        this.renderer.updateFrontMarkers();
    }
    onChangeBackMarker() {
        this.renderer.updateBackMarkers();
    }
    onChangeBreakpoint() {
        this.renderer.updateBreakpoints();
    }
    onChangeAnnotation() {
        this.renderer.setAnnotations(this.session.getAnnotations());
    }
    onChangeMode(e) {
        this.renderer.updateText();
        this._emit("changeMode", e);
    }
    onChangeWrapLimit() {
        this.renderer.updateFull();
    }
    onChangeWrapMode() {
        this.renderer.onResize(true);
    }
    onChangeFold() {
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
                var number = {
                    value: m[0],
                    start: m.index,
                    end: m.index + m[0].length
                };
                return number;
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
        if (!cursorLayer)
            return;
        cursorLayer.setSmoothBlinking(/smooth/.test(style));
        cursorLayer.isBlinking = !this.$readOnly && style != "wide";
        setCssClass(cursorLayer.element, "ace_slim-cursors", /slim/.test(style));
    }
}
defineOptions(Editor.prototype, "editor", {
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
    onMouseEvent(name, e) {
        this.editor._emit(name, new EditorMouseEvent(e, this.editor));
    }
    onMouseMove(name, e) {
        var listeners = this.editor._eventRegistry && this.editor._eventRegistry.mousemove;
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
            if (hasCssClass(target, "ace_fold-widget")) {
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
        addListener(editor.renderer.$gutter, "mouseout", function (e) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0VkaXRvci50cyJdLCJuYW1lcyI6WyJFZGl0b3IiLCJFZGl0b3IuY29uc3RydWN0b3IiLCJFZGl0b3IuY2FuY2VsTW91c2VDb250ZXh0TWVudSIsIkVkaXRvci5zZWxlY3Rpb24iLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMiLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMubGFzdCIsIkVkaXRvci5zdGFydE9wZXJhdGlvbiIsIkVkaXRvci5lbmRPcGVyYXRpb24iLCJFZGl0b3IuJGhpc3RvcnlUcmFja2VyIiwiRWRpdG9yLnNldEtleWJvYXJkSGFuZGxlciIsIkVkaXRvci5nZXRLZXlib2FyZEhhbmRsZXIiLCJFZGl0b3Iuc2V0U2Vzc2lvbiIsIkVkaXRvci5nZXRTZXNzaW9uIiwiRWRpdG9yLnNldFZhbHVlIiwiRWRpdG9yLmdldFZhbHVlIiwiRWRpdG9yLmdldFNlbGVjdGlvbiIsIkVkaXRvci5yZXNpemUiLCJFZGl0b3Iuc2V0VGhlbWUiLCJFZGl0b3IuZ2V0VGhlbWUiLCJFZGl0b3Iuc2V0U3R5bGUiLCJFZGl0b3IudW5zZXRTdHlsZSIsIkVkaXRvci5nZXRGb250U2l6ZSIsIkVkaXRvci5zZXRGb250U2l6ZSIsIkVkaXRvci4kaGlnaGxpZ2h0QnJhY2tldHMiLCJFZGl0b3IuJGhpZ2hsaWdodFRhZ3MiLCJFZGl0b3IuZm9jdXMiLCJFZGl0b3IuaXNGb2N1c2VkIiwiRWRpdG9yLmJsdXIiLCJFZGl0b3Iub25Gb2N1cyIsIkVkaXRvci5vbkJsdXIiLCJFZGl0b3IuJGN1cnNvckNoYW5nZSIsIkVkaXRvci5vbkRvY3VtZW50Q2hhbmdlIiwiRWRpdG9yLm9uVG9rZW5pemVyVXBkYXRlIiwiRWRpdG9yLm9uU2Nyb2xsVG9wQ2hhbmdlIiwiRWRpdG9yLm9uU2Nyb2xsTGVmdENoYW5nZSIsIkVkaXRvci5vbkN1cnNvckNoYW5nZSIsIkVkaXRvci4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5vblNlbGVjdGlvbkNoYW5nZSIsIkVkaXRvci4kZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwIiwiRWRpdG9yLm9uQ2hhbmdlRnJvbnRNYXJrZXIiLCJFZGl0b3Iub25DaGFuZ2VCYWNrTWFya2VyIiwiRWRpdG9yLm9uQ2hhbmdlQnJlYWtwb2ludCIsIkVkaXRvci5vbkNoYW5nZUFubm90YXRpb24iLCJFZGl0b3Iub25DaGFuZ2VNb2RlIiwiRWRpdG9yLm9uQ2hhbmdlV3JhcExpbWl0IiwiRWRpdG9yLm9uQ2hhbmdlV3JhcE1vZGUiLCJFZGl0b3Iub25DaGFuZ2VGb2xkIiwiRWRpdG9yLmdldFNlbGVjdGVkVGV4dCIsIkVkaXRvci5nZXRDb3B5VGV4dCIsIkVkaXRvci5vbkNvcHkiLCJFZGl0b3Iub25DdXQiLCJFZGl0b3Iub25QYXN0ZSIsIkVkaXRvci5leGVjQ29tbWFuZCIsIkVkaXRvci5pbnNlcnQiLCJFZGl0b3Iub25UZXh0SW5wdXQiLCJFZGl0b3Iub25Db21tYW5kS2V5IiwiRWRpdG9yLnNldE92ZXJ3cml0ZSIsIkVkaXRvci5nZXRPdmVyd3JpdGUiLCJFZGl0b3IudG9nZ2xlT3ZlcndyaXRlIiwiRWRpdG9yLnNldFNjcm9sbFNwZWVkIiwiRWRpdG9yLmdldFNjcm9sbFNwZWVkIiwiRWRpdG9yLnNldERyYWdEZWxheSIsIkVkaXRvci5nZXREcmFnRGVsYXkiLCJFZGl0b3Iuc2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3IuZ2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3Iuc2V0SGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5nZXRIaWdobGlnaHRBY3RpdmVMaW5lIiwiRWRpdG9yLnNldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIkVkaXRvci5zZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkIiwiRWRpdG9yLnNldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLmdldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLnNldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLmdldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJFZGl0b3IuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIkVkaXRvci5zZXRTaG93UHJpbnRNYXJnaW4iLCJFZGl0b3IuZ2V0U2hvd1ByaW50TWFyZ2luIiwiRWRpdG9yLnNldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLmdldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLnNldFJlYWRPbmx5IiwiRWRpdG9yLmdldFJlYWRPbmx5IiwiRWRpdG9yLnNldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLmdldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLnNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5nZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQiLCJFZGl0b3Iuc2V0U2hvd0ZvbGRXaWRnZXRzIiwiRWRpdG9yLmdldFNob3dGb2xkV2lkZ2V0cyIsIkVkaXRvci5zZXRGYWRlRm9sZFdpZGdldHMiLCJFZGl0b3IuZ2V0RmFkZUZvbGRXaWRnZXRzIiwiRWRpdG9yLnJlbW92ZSIsIkVkaXRvci5yZW1vdmVXb3JkUmlnaHQiLCJFZGl0b3IucmVtb3ZlV29yZExlZnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lU3RhcnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lRW5kIiwiRWRpdG9yLnNwbGl0TGluZSIsIkVkaXRvci50cmFuc3Bvc2VMZXR0ZXJzIiwiRWRpdG9yLnRvTG93ZXJDYXNlIiwiRWRpdG9yLnRvVXBwZXJDYXNlIiwiRWRpdG9yLmluZGVudCIsIkVkaXRvci5ibG9ja0luZGVudCIsIkVkaXRvci5ibG9ja091dGRlbnQiLCJFZGl0b3Iuc29ydExpbmVzIiwiRWRpdG9yLnRvZ2dsZUNvbW1lbnRMaW5lcyIsIkVkaXRvci50b2dnbGVCbG9ja0NvbW1lbnQiLCJFZGl0b3IuZ2V0TnVtYmVyQXQiLCJFZGl0b3IubW9kaWZ5TnVtYmVyIiwiRWRpdG9yLnJlbW92ZUxpbmVzIiwiRWRpdG9yLmR1cGxpY2F0ZVNlbGVjdGlvbiIsIkVkaXRvci5tb3ZlTGluZXNEb3duIiwiRWRpdG9yLm1vdmVMaW5lc1VwIiwiRWRpdG9yLm1vdmVUZXh0IiwiRWRpdG9yLmNvcHlMaW5lc1VwIiwiRWRpdG9yLmNvcHlMaW5lc0Rvd24iLCJFZGl0b3IuJG1vdmVMaW5lcyIsIkVkaXRvci4kZ2V0U2VsZWN0ZWRSb3dzIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25TdGFydCIsIkVkaXRvci5vbkNvbXBvc2l0aW9uVXBkYXRlIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25FbmQiLCJFZGl0b3IuZ2V0Rmlyc3RWaXNpYmxlUm93IiwiRWRpdG9yLmdldExhc3RWaXNpYmxlUm93IiwiRWRpdG9yLmlzUm93VmlzaWJsZSIsIkVkaXRvci5pc1Jvd0Z1bGx5VmlzaWJsZSIsIkVkaXRvci4kZ2V0VmlzaWJsZVJvd0NvdW50IiwiRWRpdG9yLiRtb3ZlQnlQYWdlIiwiRWRpdG9yLnNlbGVjdFBhZ2VEb3duIiwiRWRpdG9yLnNlbGVjdFBhZ2VVcCIsIkVkaXRvci5nb3RvUGFnZURvd24iLCJFZGl0b3IuZ290b1BhZ2VVcCIsIkVkaXRvci5zY3JvbGxQYWdlRG93biIsIkVkaXRvci5zY3JvbGxQYWdlVXAiLCJFZGl0b3Iuc2Nyb2xsVG9Sb3ciLCJFZGl0b3Iuc2Nyb2xsVG9MaW5lIiwiRWRpdG9yLmNlbnRlclNlbGVjdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvblNjcmVlbiIsIkVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSIsIkVkaXRvci5zZWxlY3RBbGwiLCJFZGl0b3IuY2xlYXJTZWxlY3Rpb24iLCJFZGl0b3IubW92ZUN1cnNvclRvIiwiRWRpdG9yLm1vdmVDdXJzb3JUb1Bvc2l0aW9uIiwiRWRpdG9yLmp1bXBUb01hdGNoaW5nIiwiRWRpdG9yLmdvdG9MaW5lIiwiRWRpdG9yLm5hdmlnYXRlVG8iLCJFZGl0b3IubmF2aWdhdGVVcCIsIkVkaXRvci5uYXZpZ2F0ZURvd24iLCJFZGl0b3IubmF2aWdhdGVMZWZ0IiwiRWRpdG9yLm5hdmlnYXRlUmlnaHQiLCJFZGl0b3IubmF2aWdhdGVMaW5lU3RhcnQiLCJFZGl0b3IubmF2aWdhdGVMaW5lRW5kIiwiRWRpdG9yLm5hdmlnYXRlRmlsZUVuZCIsIkVkaXRvci5uYXZpZ2F0ZUZpbGVTdGFydCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRMZWZ0IiwiRWRpdG9yLnJlcGxhY2UiLCJFZGl0b3IucmVwbGFjZUFsbCIsIkVkaXRvci4kdHJ5UmVwbGFjZSIsIkVkaXRvci5nZXRMYXN0U2VhcmNoT3B0aW9ucyIsIkVkaXRvci5maW5kIiwiRWRpdG9yLmZpbmROZXh0IiwiRWRpdG9yLmZpbmRQcmV2aW91cyIsIkVkaXRvci5yZXZlYWxSYW5nZSIsIkVkaXRvci51bmRvIiwiRWRpdG9yLnJlZG8iLCJFZGl0b3IuZGVzdHJveSIsIkVkaXRvci5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXciLCJFZGl0b3IuJHJlc2V0Q3Vyc29yU3R5bGUiLCJGb2xkSGFuZGxlciIsIkZvbGRIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyIiwiTW91c2VIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyLm9uTW91c2VFdmVudCIsIk1vdXNlSGFuZGxlci5vbk1vdXNlTW92ZSIsIk1vdXNlSGFuZGxlci5lbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50IiwiTW91c2VIYW5kbGVyLnNldFN0YXRlIiwiTW91c2VIYW5kbGVyLnRleHRDb29yZGluYXRlcyIsIk1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UiLCJNb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUiLCJNb3VzZUhhbmRsZXIuc2VsZWN0IiwiTW91c2VIYW5kbGVyLnNlbGVjdEJ5TGluZXNFbmQiLCJNb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QiLCJNb3VzZUhhbmRsZXIuc2VsZWN0RW5kIiwiTW91c2VIYW5kbGVyLnNlbGVjdEFsbEVuZCIsIk1vdXNlSGFuZGxlci5zZWxlY3RCeVdvcmRzRW5kIiwiTW91c2VIYW5kbGVyLmZvY3VzV2FpdCIsIkVkaXRvck1vdXNlRXZlbnQiLCJFZGl0b3JNb3VzZUV2ZW50LmNvbnN0cnVjdG9yIiwiRWRpdG9yTW91c2VFdmVudC50b0VsZW1lbnQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3BQcm9wYWdhdGlvbiIsIkVkaXRvck1vdXNlRXZlbnQucHJldmVudERlZmF1bHQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3AiLCJFZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24iLCJFZGl0b3JNb3VzZUV2ZW50LmluU2VsZWN0aW9uIiwiRWRpdG9yTW91c2VFdmVudC5nZXRCdXR0b24iLCJFZGl0b3JNb3VzZUV2ZW50LmdldFNoaWZ0S2V5IiwibWFrZU1vdXNlRG93bkhhbmRsZXIiLCJtYWtlTW91c2VXaGVlbEhhbmRsZXIiLCJtYWtlRG91YmxlQ2xpY2tIYW5kbGVyIiwibWFrZVRyaXBsZUNsaWNrSGFuZGxlciIsIm1ha2VRdWFkQ2xpY2tIYW5kbGVyIiwibWFrZUV4dGVuZFNlbGVjdGlvbkJ5IiwiY2FsY0Rpc3RhbmNlIiwiY2FsY1JhbmdlT3JpZW50YXRpb24iLCJHdXR0ZXJIYW5kbGVyIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3RvciIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3Iuc2hvd1Rvb2x0aXAiLCJHdXR0ZXJIYW5kbGVyLmNvbnN0cnVjdG9yLmhpZGVUb29sdGlwIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3Rvci5tb3ZlVG9vbHRpcCIsIkd1dHRlclRvb2x0aXAiLCJHdXR0ZXJUb29sdGlwLmNvbnN0cnVjdG9yIiwiR3V0dGVyVG9vbHRpcC5zZXRQb3NpdGlvbiJdLCJtYXBwaW5ncyI6Ik9BZ0NPLEVBQUMsS0FBSyxFQUFDLE1BQU0sV0FBVztPQUN4QixFQUFDLGFBQWEsRUFB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UUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxDQUFDQTtZQUMzREEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFFbENBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2xEQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1lBRTNEQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRXJFQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQzFFQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLENBQUNBLGVBQWVBLEVBQUVBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7WUFFakVBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFFckVBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxREEsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7WUFFbkVBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2xEQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1lBRTNEQSxJQUFJQSxDQUFDQSxvQkFBb0JBLEdBQUdBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDaEVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBO1lBRTlFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRTVFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRTVFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRTVFQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBRXZFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRTFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRTVFQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtZQUN4Q0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxjQUFjQSxFQUFFQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtZQUV0RUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzVEQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxnQkFBZ0JBLENBQUNBLGlCQUFpQkEsRUFBRUEsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtZ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QUFTQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQTtnQkFDbEVBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7WUFDekNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFNBQVNBLElBQUlBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEVBQUVBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUM1RkEsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDMUJBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLG9CQUFvQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBLG9CQUFvQkEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7WUFDdERBLE9BQU9BLENBQUNBLG9CQUFvQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDeENBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLG9CQUFvQkEsSUFBSUEsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbERBLElBQUlBLEtBQUtBLEdBQVFBLElBQUlBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1lBQ3JGQSxLQUFLQSxDQUFDQSxFQUFFQSxHQUFHQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxFQUFFQSxpQkFBaUJBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO1lBQ3JFQSxPQUFPQSxDQUFDQSxvQkFBb0JBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3pD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RUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBQzdDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNoQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLElBQUlBLElBQUlBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ2pDQSxJQUFJQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDbERBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzNFQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUV0QkEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0Es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M0JBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEtBQUtBLENBQUNBLENBQUNBO1lBQ2JBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQzVDQSxJQUFJQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQTtRQUNoQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JEQSxLQUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN0RUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekRBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQ2xFQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUN0Q0Es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LENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO2dCQUNoREEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQzNCQSxJQUFJQSxJQUFJQSxHQUFHQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtRQUNoQ0EsSUFBSUEsTUFBTUEsR0FBR0EsT0FBT0EsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUzRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLElBQUlBLEdBQUdBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQSxZQUFZQSxHQUFHQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNoREEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDMUJBLE9BQU9BLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLEtBQUtBLEVBQUVBLENBQUNBO2dCQUM5Q0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ3JCQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNaQSxD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QUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1FBRXpEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUzQkEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFFdkNBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNMQSxJQUFJQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxHQUFHQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQTtnQkFDcEZBLElBQUlBLFFBQVFBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBO2dCQUUvQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFHNUJBLEVBQUVBLENBQUNBLENBQUNBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO29CQUMvQkEsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2hEQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7b0JBQ0pBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBO2dCQUM1Q0EsQ0FBQ0E7Z0JBRURBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBO2dCQUNaQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtnQkFDNUJBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUc5QkEsSUFBSUEsWUFBWUEsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsS0FBS0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFHeENBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBRTFGQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQU1EM0csV0FBV0E7UUFDUDRHLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7UUFDbkNBLElBQUlBLEtBQUtBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1lBQzdEQSxLQUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN2REEsSUFBSUE7WUFDQUEsS0FBS0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FDYkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFDM0RBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLE1BQU1BLENBQ3BEQSxDQUFDQTtRQUNOQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMzQkEsSUFBSUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7SUFDMUJBLENBQUNBO0lBRUQ1RyxrQkFBa0JBO1FBQ2Q2RyxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUN6QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDdkJBLElBQUlBLEtBQUtBLEdBQUdBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1FBQzNCQSxJQUFJQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUNoQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0Es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QUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUVuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDUEEsTUFBTUEsQ0FBQ0E7UUFHWEEsSUFBSUEsU0FBU0EsQ0FBQ0E7UUFDZEEsSUFBSUEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDbEJBLElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLElBQUlBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3BDQSxJQUFJQSxXQUFXQSxDQUFDQTtRQUNoQkEsSUFBSUEsUUFBUUEsR0FBR0E7WUFDWEEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7U0FDWEEsQ0FBQ0E7UUFFRkEsR0FBR0EsQ0FBQ0E7WUFDQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDM0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsUUFBUUEsQ0FBQ0E7b0JBQ2JBLENBQUNBO29CQUVEQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFFdEZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3JCQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDVEEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBOzRCQUNKQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFDckJBLEtBQUtBLENBQUNBO3dCQUNWQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDVEEsS0FBS0EsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLEdBQUdBOzRCQUNKQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFFckJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dDQUM1QkEsU0FBU0EsR0FBR0EsU0FBU0EsQ0FBQ0E7Z0NBQ3RCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTs0QkFDakJBLENBQUNBOzRCQUNEQSxLQUFLQSxDQUFDQTtvQkFDZEEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO1lBQ0xBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENB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LENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQ3pEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUNoQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDakRBLENBQUNBO0lBUURqSixZQUFZQSxDQUFDQSxLQUFLQTtRQUNka0osRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsRUFBRUEsSUFBSUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0RBLElBQUlBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQ3ZEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1FBQ25EQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUNoQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDL0NBLENBQUNBO0lBUURsSixZQUFZQSxDQUFDQSxLQUFLQTtRQUNkbUosRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLElBQUlBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFD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TUFBTUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFNUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDM0NBLFFBQVFBLEVBQUVBLENBQUNBO1lBQ2ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1FBRTFCQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFRDVKLFdBQVdBLENBQUNBLEtBQUtBLEVBQUVBLFdBQVdBO1FBQzFCNkosSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO1FBQ3ZEQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxLQUFLQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDckRBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO1FBQ2pCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNoQkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFPRDdKLG9CQUFvQkE7UUFDaEI4SixNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtJQUNyQ0EsQ0FBQ0E7SUFXRDlKLElBQUlBLENBQUNBLE1BQXlCQSxFQUFFQSxPQUFPQSxFQUFFQSxPQUFPQTtRQUM1QytKLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1RBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBO1FBRWpCQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxNQUFNQSxJQUFJQSxRQUFRQSxJQUFJQSxNQUFNQSxZQUFZQSxNQUFNQSxDQUFDQTtZQUN0REEsT0FBT0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBO1lBQy9CQSxLQUFLQSxDQUFDQSxPQUFPQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUzQkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0E7UUFDdENBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQTttQkFDbENBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLE1BQU1BLENBQUNBO1lBQ3BDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZFQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNmQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxLQUFLQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUV2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBO1lBQ3RCQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1FBQ3BCQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQTtZQUNsQkEsS0FBS0EsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDNUJBLElBQUlBO1lBQ0FBLEtB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Q0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDOUVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSx5QkFBeUJBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLGNBQWNBLENBQUNBLENBQUNBO1lBQ25HQSx5QkFBeUJBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLGNBQWNBLENBQUNBLENBQUNBO1lBQ25HQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDUEEsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsRUFBRUEsV0FBV0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7Z0JBRTFFQSxXQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxPQUFPQSxFQUFFQSxXQUFXQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUM5RUEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFHREEscUJBQXFCQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSx5QkFBeUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1FBRWpHQSxJQUFJQSxRQUFRQSxHQUFHQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUN2Q0EsV0FBV0EsQ0FBQ0EsUUFBUUEsRUFBRUEsV0FBV0EsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsaUJBQWlCQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNwRkEsV0FBV0EsQ0FBQ0EsUUFBUUEsRUFBRUEsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUVBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLFVBQVVBLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbEZBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLFdBQVdBLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFcEZBLFdBQVdBLENBQUNBLFdBQVdBLEVBQUVBLFdBQVdBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO1FBRW5EQSxXQUFXQSxDQUFDQSxRQUFRQSxFQUFFQSxXQUFXQSxFQUFFQSxVQUFTQSxDQUFDQTtZQUN6QyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDZixNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdCLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFHSEEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsV0FBV0EsRUFBRUEsVUFBU0EsQ0FBYUE7WUFDekMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssSUFBSSxLQUFLLENBQUMsVUFBVSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUM7Z0JBQ3pELE1BQU0sQ0FBQztZQUNYLENBQUM7WUFFRCxJQUFJLElBQUksR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdELElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2hELElBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFFL0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9ELFFBQVEsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUM7WUFDdkMsQ0FBQztZQUNELElBQUksQ0FBQyxDQUFDO2dCQUNGLFFBQVEsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDaEMsQ0FBQztRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFFREQsWUFBWUEsQ0FBQ0EsSUFBWUEsRUFBRUEsQ0FBYUE7UUFDcENFLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDbEVBLENBQUNBO0lBRURGLFdBQVdBLENBQUNBLElBQVlBLEVBQUVBLENBQWFBO1FBRW5DRyxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxjQUFjQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxjQUFjQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUNuRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbENBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEVBQUVBLElBQUlBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDbEVBLENBQUNBO0lBRURILHlCQUF5QkEsQ0FBQ0EsSUFBWUEsRUFBRUEsQ0FBa0JBO1FBQ3RESSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxnQkFBZ0JBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3REQSxVQUFVQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN6Q0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDaENBLFVBQVVBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQ2hDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUN4Q0EsQ0FBQ0E7SUFFREosUUFBUUEsQ0FBQ0EsS0FBYUE7UUFDbEJLLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO0lBQ3ZCQSxDQUFDQTtJQUVETCxlQUFlQTtRQUNYTSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSx1QkFBdUJBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3BGQSxDQUFDQTtJQUVETixZQUFZQSxDQUFDQSxFQUFvQkEsRUFBRUEsZ0JBQW1EQTtRQUNsRk8sSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLEVBQUVBLENBQUNBLE9BQU9BLENBQUNBO1FBRTFCQSxJQUFJQSxDQUFDQSxjQUFjQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUczQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDcENBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLFFBQVFBLENBQUNBLHFCQUFxQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDMUNBLENBQUNBO1FBRURBLElBQUlBLFdBQVdBLEdBQUdBLENBQUNBLFVBQVNBLE1BQWNBLEVBQUVBLFlBQTBCQTtZQUNsRSxNQUFNLENBQUMsVUFBUyxVQUFzQjtnQkFDbEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7b0JBQUMsTUFBTSxDQUFDO2dCQUd4QixFQUFFLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxJQUFJLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUk3RCxNQUFNLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDaEQsQ0FBQztnQkFFRCxZQUFZLENBQUMsT0FBTyxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUM7Z0JBQzFDLFlBQVksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQztnQkFDMUMsZ0JBQWdCLElBQUksZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ2pELFlBQVksQ0FBQyxVQUFVLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ25FLFlBQVksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1lBQ3BDLENBQUMsQ0FBQTtRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFdEJBLElBQUlBLFlBQVlBLEdBQUdBLENBQUNBLFVBQVNBLFlBQTBCQTtZQUNuRCxNQUFNLENBQUMsVUFBUyxDQUFDO2dCQUNiLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDdkIsaUJBQWlCLEVBQUUsQ0FBQztnQkFDcEIsWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hGLFlBQVksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUN4QixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMscUJBQXFCLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekMsUUFBUSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQztvQkFDdEMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQ3JDLENBQUM7Z0JBQ0QsWUFBWSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7Z0JBQ3BDLFlBQVksQ0FBQyxtQkFBbUIsR0FBRyxZQUFZLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztnQkFDcEUsQ0FBQyxJQUFJLFlBQVksQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pELENBQUMsQ0FBQTtRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFVEEsSUFBSUEsaUJBQWlCQSxHQUFHQSxDQUFDQSxVQUFTQSxZQUEwQkE7WUFDeEQsTUFBTSxDQUFDO2dCQUNILFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN2RSxZQUFZLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUNyQyxDQUFDLENBQUE7UUFDTCxDQUFDLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBRVRBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLEVBQUVBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLElBQUlBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQzVDQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxjQUFhLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDeERBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLG1CQUFtQkEsR0FBR0EsV0FBV0EsQ0FBQ0E7UUFDdkNBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLEVBQUVBLFdBQVdBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO1FBQzlFQSxJQUFJQSxPQUFPQSxHQUFHQSxXQUFXQSxDQUFDQSxpQkFBaUJBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO0lBQ3JEQSxDQUFDQTtJQUVEUCxpQkFBaUJBO1FBQ2JRLElBQUlBLElBQUlBLEdBQUdBLFVBQVNBLENBQUNBO1lBQ2pCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLGFBQWEsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RELE1BQU0sQ0FBQztZQUNYLENBQUM7WUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMzQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xCLFNBQVMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUM7WUFDMUIsQ0FBQztRQUNMLENBQUMsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDYkEsVUFBVUEsQ0FBQ0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDckJBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLENBQUNBLG1CQUFtQkEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDOUNBLENBQUNBO0lBRURSLE1BQU1BO1FBQ0ZTLElBQUlBLE1BQXVDQSxDQUFDQTtRQUM1Q0EsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsdUJBQXVCQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUV0RkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBRXBEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDdENBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDeENBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxJQUFJQSxhQUFhQSxHQUFHQSxvQkFBb0JBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO2dCQUN2RUEsTUFBTUEsR0FBR0EsYUFBYUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQzlCQSxNQUFNQSxHQUFHQSxhQUFhQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUN4RUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUUvQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0Esb0JBQW9CQSxFQUFFQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFFRFQsZ0JBQWdCQTtRQUNaVSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0E7UUFDeENBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQy9DQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtRQUNuREEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFRFYsV0FBV0EsQ0FBQ0EsR0FBb0NBLEVBQUVBLHFCQUErQkE7UUFDN0VXLEdBQUdBLEdBQUdBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDdEZBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBR3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMzQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EscUJBQXFCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5QkEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsY0FBY0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDekNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekJBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO1FBQ2xCQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFDL0NBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1FBQ2pDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7SUFFRFgsU0FBU0E7UUFDTFksSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7SUFFRFosWUFBWUE7UUFDUmEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7SUFFRGIsZ0JBQWdCQTtRQUNaYyxJQUFJQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVEZCxTQUFTQTtRQUNMZSxJQUFJQSxRQUFRQSxHQUFHQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUNsSEEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFFdEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLEdBQUdBLFdBQVdBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hGQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxtQkFBbUJBLEVBQUVBLENBQUNBLENBQUNBO1FBQ2hFQSxDQUFDQTtJQUNMQSxDQUFDQTtBQUVMZixDQUFDQTtBQUVELGFBQWEsQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLGNBQWMsRUFBRTtJQUNsRCxXQUFXLEVBQUUsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFO0lBQ2hDLFNBQVMsRUFBRSxFQUFFLFlBQVksRUFBRSxDQUFDLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDOUMsV0FBVyxFQUFFLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRTtJQUNuQyxXQUFXLEVBQUUsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFO0lBQ2hDLG1CQUFtQixFQUFFLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRTtDQUM5QyxDQUFDLENBQUM7QUFLSDtJQWtCSWdCLFlBQVlBLFFBQW9CQSxFQUFFQSxNQUFjQTtRQVB4Q0MsdUJBQWtCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUMzQkEscUJBQWdCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQXVGakNBLGdCQUFXQSxHQUFHQSxLQUFLQSxHQUFHQSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBR0EsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUNBO1FBaEY5R0EsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDekJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO1FBRXJCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUNoQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFaENBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2pCQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFFREQsSUFBSUEsU0FBU0E7UUFDVEUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDbkNBLENBQUNBO0lBRURGLGVBQWVBO1FBQ1hHLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQy9CQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBO0lBQ25DQSxDQUFDQTtJQUVESCxjQUFjQTtRQUNWSSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUM5QkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFFREosSUFBSUE7UUFDQUssSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDdkJBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQzFCQSxDQUFDQTtJQU9ETCxtQkFBbUJBO1FBQ2ZNLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDekZBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBO0lBQ3JCQSxDQUFDQTtJQU9ETixXQUFXQTtRQUNQTyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUMzQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7UUFFN0JBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBR3pCQSxJQUFJQSxjQUFjQSxHQUFHQSxNQUFNQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1FBQ2hEQSxFQUFFQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTtZQUN6QkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7WUFDckNBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLGNBQWNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3JFQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFPRFAsU0FBU0E7UUFDTFEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFDcENBLENBQUNBO0lBS0RSLFdBQVdBO1FBQ1BTLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBO0lBQ2xDQSxDQUFDQTtBQUdMVCxDQUFDQTtBQUVELElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztBQUVwQiw4QkFBOEIsTUFBYyxFQUFFLFlBQTBCO0lBQ3BFVSxNQUFNQSxDQUFDQSxVQUFTQSxFQUFvQkE7UUFDaEMsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25DLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ25DLFlBQVksQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDO1FBRWpDLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUM1QixFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNmLElBQUksY0FBYyxHQUFHLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ2hELElBQUksY0FBYyxHQUFHLGNBQWMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUU5QyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUM7Z0JBQ2YsTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7WUFHekMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFHOUMsRUFBRSxDQUFDLENBQUMsV0FBVyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDZixFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7Z0JBQzFGLFlBQVksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ25DLFlBQVksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzlCLE1BQU0sQ0FBQztZQUNYLENBQUM7UUFDTCxDQUFDO1FBRUQsWUFBWSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUU5QixZQUFZLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLENBQUM7SUFDL0IsQ0FBQyxDQUFBQTtBQUNMQSxDQUFDQTtBQUVELCtCQUErQixNQUFjLEVBQUUsWUFBMEI7SUFDckVDLE1BQU1BLENBQUNBLFVBQVNBLEVBQW9CQTtRQUNoQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ25CLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFHRCxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzlDLEVBQUUsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUN0QixFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7UUFDOUIsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGVBQWUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUVqRCxJQUFJLFdBQVcsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0YsRUFBRSxDQUFDLENBQUMsV0FBVyxJQUFJLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzFCLFlBQVksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyRSxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3JCLENBQUM7SUFDTCxDQUFDLENBQUFBO0FBQ0xBLENBQUNBO0FBRUQsZ0NBQWdDLE1BQWMsRUFBRSxZQUEwQjtJQUN0RUMsTUFBTUEsQ0FBQ0EsVUFBU0EsZ0JBQWtDQTtRQUM5QyxJQUFJLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ2pELElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFFN0IsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN6QyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ1IsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDbEIsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDckIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN2QixDQUFDO1lBQ0QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUM7WUFDRixLQUFLLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBQ0QsWUFBWSxDQUFDLGVBQWUsR0FBRyxLQUFLLENBQUM7UUFDckMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQzFCLENBQUMsQ0FBQUE7QUFDTEEsQ0FBQ0E7QUFFRCxnQ0FBZ0MsTUFBYyxFQUFFLFlBQTBCO0lBQ3RFQyxNQUFNQSxDQUFDQSxVQUFTQSxnQkFBa0NBO1FBQzlDLElBQUksR0FBRyxHQUFHLGdCQUFnQixDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFakQsWUFBWSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN2QyxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUN2QyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0QsWUFBWSxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzlFLFlBQVksQ0FBQyxlQUFlLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3hGLENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBQztZQUNGLFlBQVksQ0FBQyxlQUFlLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzFFLENBQUM7UUFDRCxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDMUIsQ0FBQyxDQUFBQTtBQUNMQSxDQUFDQTtBQUVELDhCQUE4QixNQUFjLEVBQUUsWUFBMEI7SUFDcEVDLE1BQU1BLENBQUNBLFVBQVNBLGdCQUFrQ0E7UUFDOUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ25CLFlBQVksQ0FBQyxlQUFlLEdBQUcsTUFBTSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDMUQsWUFBWSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUFBO0FBQ0xBLENBQUNBO0FBRUQsK0JBQStCLE1BQWMsRUFBRSxZQUEwQixFQUFFLFFBQWdCO0lBQ3ZGQyxNQUFNQSxDQUFDQTtRQUNILElBQUksTUFBTSxDQUFDO1FBQ1gsSUFBSSxNQUFNLEdBQUcsWUFBWSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVDLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFbEUsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFDL0IsSUFBSSxRQUFRLEdBQUcsWUFBWSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3RFLElBQUksTUFBTSxHQUFHLFlBQVksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVsRSxFQUFFLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLElBQUksTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hDLE1BQU0sR0FBRyxZQUFZLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQztnQkFDMUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDO29CQUNqRSxNQUFNLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztZQUM3QixDQUFDO1lBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BDLE1BQU0sR0FBRyxZQUFZLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQztnQkFDNUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDO29CQUNyRSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQztZQUMzQixDQUFDO1lBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsSUFBSSxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDckMsTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUM7Z0JBQ25CLE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3pCLENBQUM7WUFDRCxJQUFJLENBQUMsQ0FBQztnQkFDRixJQUFJLGFBQWEsR0FBRyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUMvRSxNQUFNLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztnQkFDOUIsTUFBTSxHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQUM7WUFDbEMsQ0FBQztZQUNELE1BQU0sQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkUsQ0FBQztRQUNELE1BQU0sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0lBQzNDLENBQUMsQ0FBQUE7QUFDTEEsQ0FBQ0E7QUFFRCxzQkFBc0IsRUFBVSxFQUFFLEVBQVUsRUFBRSxFQUFVLEVBQUUsRUFBVTtJQUNoRUMsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7QUFDbEVBLENBQUNBO0FBRUQsOEJBQThCLEtBQVksRUFBRSxNQUF1QztJQUMvRUMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDbkNBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO0lBQ3hFQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4RkEsSUFBSUEsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDaENBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO0lBQy9EQSxDQUFDQTtJQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNWQSxNQUFNQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtJQUN0REEsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDRkEsTUFBTUEsQ0FBQ0EsRUFBRUEsTUFB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IHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG4vL3JlcXVpcmUoXCIuL2xpYi9maXhvbGRicm93c2Vyc1wiKTtcblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtjb21wdXRlZFN0eWxlLCBoYXNDc3NDbGFzcywgc2V0Q3NzQ2xhc3N9IGZyb20gXCIuL2xpYi9kb21cIjtcbmltcG9ydCB7ZGVsYXllZENhbGwsIHN0cmluZ1JlcGVhdH0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCB7aXNJRSwgaXNNYWMsIGlzTW9iaWxlLCBpc09sZElFLCBpc1dlYktpdH0gZnJvbSBcIi4vbGliL3VzZXJhZ2VudFwiO1xuaW1wb3J0IHtHdXR0ZXJ9IGZyb20gXCIuL2xheWVyL2d1dHRlclwiO1xuaW1wb3J0IFRleHRJbnB1dCBmcm9tIFwiLi9rZXlib2FyZC90ZXh0aW5wdXRcIjtcbmltcG9ydCBLZXlCaW5kaW5nIGZyb20gXCIuL2tleWJvYXJkL2tleWJpbmRpbmdcIjtcbmltcG9ydCB7RWRpdFNlc3Npb259IGZyb20gXCIuL2VkaXRfc2Vzc2lvblwiO1xuaW1wb3J0IFNlYXJjaCBmcm9tIFwiLi9zZWFyY2hcIjtcbmltcG9ydCB7UmFuZ2V9IGZyb20gXCIuL3JhbmdlXCI7XG5pbXBvcnQgQ3Vyc29yUmFuZ2UgZnJvbSAnLi9DdXJzb3JSYW5nZSdcbmltcG9ydCB7RXZlbnRFbWl0dGVyQ2xhc3N9IGZyb20gXCIuL2xpYi9ldmVudF9lbWl0dGVyXCI7XG5pbXBvcnQgQ29tbWFuZE1hbmFnZXIgZnJvbSBcIi4vY29tbWFuZHMvQ29tbWFuZE1hbmFnZXJcIjtcbmltcG9ydCBkZWZhdWx0Q29tbWFuZHMgZnJvbSBcIi4vY29tbWFuZHMvZGVmYXVsdF9jb21tYW5kc1wiO1xuaW1wb3J0IHtkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnMsIF9zaWduYWx9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IFRva2VuSXRlcmF0b3IgZnJvbSBcIi4vVG9rZW5JdGVyYXRvclwiO1xuaW1wb3J0IHtDT01NQU5EX05BTUVfQVVUT19DT01QTEVURX0gZnJvbSAnLi9lZGl0b3JfcHJvdG9jb2wnO1xuaW1wb3J0IHtWaXJ0dWFsUmVuZGVyZXJ9IGZyb20gJy4vdmlydHVhbF9yZW5kZXJlcic7XG5pbXBvcnQge0NvbXBsZXRlcn0gZnJvbSBcIi4vYXV0b2NvbXBsZXRlXCI7XG5pbXBvcnQge1NlbGVjdGlvbn0gZnJvbSAnLi9zZWxlY3Rpb24nO1xuaW1wb3J0IHthZGRMaXN0ZW5lciwgYWRkTW91c2VXaGVlbExpc3RlbmVyLCBhZGRNdWx0aU1vdXNlRG93bkxpc3RlbmVyLCBjYXB0dXJlLCBnZXRCdXR0b24sIHByZXZlbnREZWZhdWx0LCBzdG9wRXZlbnQsIHN0b3BQcm9wYWdhdGlvbn0gZnJvbSBcIi4vbGliL2V2ZW50XCI7XG5pbXBvcnQge3RvdWNoTWFuYWdlcn0gZnJvbSAnLi90b3VjaC90b3VjaCc7XG5pbXBvcnQge1Rvb2x0aXB9IGZyb20gXCIuL3Rvb2x0aXBcIjtcblxuLy92YXIgRHJhZ2Ryb3BIYW5kbGVyID0gcmVxdWlyZShcIi4vbW91c2UvZHJhZ2Ryb3BfaGFuZGxlclwiKS5EcmFnZHJvcEhhbmRsZXI7XG5cbi8qKlxuICogVGhlIG1haW4gZW50cnkgcG9pbnQgaW50byB0aGUgQWNlIGZ1bmN0aW9uYWxpdHkuXG4gKlxuICogVGhlIGBFZGl0b3JgIG1hbmFnZXMgdGhlIFtbRWRpdFNlc3Npb25dXSAod2hpY2ggbWFuYWdlcyBbW0RvY3VtZW50XV1zKSwgYXMgd2VsbCBhcyB0aGUgW1tWaXJ0dWFsUmVuZGVyZXJdXSwgd2hpY2ggZHJhd3MgZXZlcnl0aGluZyB0byB0aGUgc2NyZWVuLlxuICpcbiAqIEV2ZW50IHNlc3Npb25zIGRlYWxpbmcgd2l0aCB0aGUgbW91c2UgYW5kIGtleWJvYXJkIGFyZSBidWJibGVkIHVwIGZyb20gYERvY3VtZW50YCB0byB0aGUgYEVkaXRvcmAsIHdoaWNoIGRlY2lkZXMgd2hhdCB0byBkbyB3aXRoIHRoZW0uXG4gKiBAY2xhc3MgRWRpdG9yXG4gKi9cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBFZGl0b3JgIG9iamVjdC5cbiAqXG4gKiBAcGFyYW0ge1ZpcnR1YWxSZW5kZXJlcn0gcmVuZGVyZXIgQXNzb2NpYXRlZCBgVmlydHVhbFJlbmRlcmVyYCB0aGF0IGRyYXdzIGV2ZXJ5dGhpbmdcbiAqIEBwYXJhbSB7RWRpdFNlc3Npb259IHNlc3Npb24gVGhlIGBFZGl0U2Vzc2lvbmAgdG8gcmVmZXIgdG9cbiAqXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEVkaXRvciBleHRlbmRzIEV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwdWJsaWMgcmVuZGVyZXI6IFZpcnR1YWxSZW5kZXJlcjtcbiAgICBwdWJsaWMgc2Vzc2lvbjogRWRpdFNlc3Npb247XG4gICAgcHJpdmF0ZSAkdG91Y2hIYW5kbGVyOiBJR2VzdHVyZUhhbmRsZXI7XG4gICAgcHJpdmF0ZSAkbW91c2VIYW5kbGVyOiBJR2VzdHVyZUhhbmRsZXI7XG4gICAgcHVibGljIGdldE9wdGlvbjtcbiAgICBwdWJsaWMgc2V0T3B0aW9uO1xuICAgIHB1YmxpYyBzZXRPcHRpb25zO1xuICAgIHB1YmxpYyAkaXNGb2N1c2VkO1xuICAgIHB1YmxpYyBjb21tYW5kcyA9IG5ldyBDb21tYW5kTWFuYWdlcihpc01hYyA/IFwibWFjXCIgOiBcIndpblwiLCBkZWZhdWx0Q29tbWFuZHMpO1xuICAgIHB1YmxpYyBrZXlCaW5kaW5nO1xuICAgIC8vIEZJWE1FOiBUaGlzIGlzIHJlYWxseSBhbiBvcHRpb25hbCBleHRlbnNpb24gYW5kIHNvIGRvZXMgbm90IGJlbG9uZyBoZXJlLlxuICAgIHB1YmxpYyBjb21wbGV0ZXJzOiBDb21wbGV0ZXJbXTtcblxuICAgIC8qKlxuICAgICAqIFRoZSByZW5kZXJlciBjb250YWluZXIgZWxlbWVudC5cbiAgICAgKi9cbiAgICBwdWJsaWMgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcbiAgICBwdWJsaWMgdGV4dElucHV0O1xuICAgIHB1YmxpYyBpbk11bHRpU2VsZWN0TW9kZTogYm9vbGVhbjtcbiAgICBwdWJsaWMgaW5WaXJ0dWFsU2VsZWN0aW9uTW9kZTtcblxuICAgIHByaXZhdGUgJGN1cnNvclN0eWxlO1xuICAgIHByaXZhdGUgJGtleWJpbmRpbmdJZDtcbiAgICBwcml2YXRlICRibG9ja1Njcm9sbGluZztcbiAgICBwcml2YXRlICRoaWdobGlnaHRBY3RpdmVMaW5lO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodFBlbmRpbmc7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodFRhZ1BlbmRpbmc7XG4gICAgcHJpdmF0ZSAkbWVyZ2VVbmRvRGVsdGFzO1xuICAgIHB1YmxpYyAkcmVhZE9ubHk7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsQW5jaG9yO1xuICAgIHByaXZhdGUgJHNlYXJjaDtcbiAgICBwcml2YXRlIF8kZW1pdElucHV0RXZlbnQ7XG4gICAgcHJpdmF0ZSBzZWxlY3Rpb25zO1xuICAgIHByaXZhdGUgJHNlbGVjdGlvblN0eWxlO1xuICAgIHByaXZhdGUgJG9wUmVzZXRUaW1lcjtcbiAgICBwcml2YXRlIGN1ck9wID0gbnVsbDtcbiAgICBwcml2YXRlIHByZXZPcDogeyBjb21tYW5kPzsgYXJncz99ID0ge307XG4gICAgcHJpdmF0ZSBwcmV2aW91c0NvbW1hbmQ7XG4gICAgLy8gVE9ETyB1c2UgcHJvcGVydHkgb24gY29tbWFuZHMgaW5zdGVhZCBvZiB0aGlzXG4gICAgcHJpdmF0ZSAkbWVyZ2VhYmxlQ29tbWFuZHMgPSBbXCJiYWNrc3BhY2VcIiwgXCJkZWxcIiwgXCJpbnNlcnRzdHJpbmdcIl07XG4gICAgcHJpdmF0ZSBtZXJnZU5leHRDb21tYW5kO1xuICAgIHByaXZhdGUgJG1lcmdlTmV4dENvbW1hbmQ7XG4gICAgcHJpdmF0ZSBzZXF1ZW5jZVN0YXJ0VGltZTogbnVtYmVyO1xuICAgIHByaXZhdGUgJG9uRG9jdW1lbnRDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VNb2RlO1xuICAgIHByaXZhdGUgJG9uVG9rZW5pemVyVXBkYXRlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlVGFiU2l6ZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZVdyYXBMaW1pdDtcbiAgICBwcml2YXRlICRvbkNoYW5nZVdyYXBNb2RlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlRm9sZDtcbiAgICBwcml2YXRlICRvbkNoYW5nZUZyb250TWFya2VyO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlQmFja01hcmtlcjtcbiAgICBwcml2YXRlICRvbkNoYW5nZUJyZWFrcG9pbnQ7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VBbm5vdGF0aW9uO1xuICAgIHByaXZhdGUgJG9uQ3Vyc29yQ2hhbmdlO1xuICAgIHByaXZhdGUgJG9uU2Nyb2xsVG9wQ2hhbmdlO1xuICAgIHByaXZhdGUgJG9uU2Nyb2xsTGVmdENoYW5nZTtcbiAgICBwcml2YXRlICRvblNlbGVjdGlvbkNoYW5nZTtcbiAgICBwdWJsaWMgZXhpdE11bHRpU2VsZWN0TW9kZTtcbiAgICBwdWJsaWMgZm9yRWFjaFNlbGVjdGlvbjtcbiAgICBjb25zdHJ1Y3RvcihyZW5kZXJlcjogVmlydHVhbFJlbmRlcmVyLCBzZXNzaW9uPzogRWRpdFNlc3Npb24pIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5jb250YWluZXIgPSByZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50KCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSByZW5kZXJlcjtcblxuICAgICAgICB0aGlzLnRleHRJbnB1dCA9IG5ldyBUZXh0SW5wdXQocmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIoKSwgdGhpcyk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudGV4dGFyZWEgPSB0aGlzLnRleHRJbnB1dC5nZXRFbGVtZW50KCk7XG4gICAgICAgIHRoaXMua2V5QmluZGluZyA9IG5ldyBLZXlCaW5kaW5nKHRoaXMpO1xuXG4gICAgICAgIGlmIChpc01vYmlsZSkge1xuICAgICAgICAgICAgdGhpcy4kdG91Y2hIYW5kbGVyID0gdG91Y2hNYW5hZ2VyKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy4kbW91c2VIYW5kbGVyID0gbmV3IE1vdXNlSGFuZGxlcih0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJHRvdWNoSGFuZGxlciA9IHRvdWNoTWFuYWdlcih0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdXNlSGFuZGxlciA9IG5ldyBNb3VzZUhhbmRsZXIodGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICBuZXcgRm9sZEhhbmRsZXIodGhpcyk7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgPSAwO1xuICAgICAgICB0aGlzLiRzZWFyY2ggPSBuZXcgU2VhcmNoKCkuc2V0KHtcbiAgICAgICAgICAgIHdyYXA6IHRydWVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy4kaGlzdG9yeVRyYWNrZXIgPSB0aGlzLiRoaXN0b3J5VHJhY2tlci5iaW5kKHRoaXMpO1xuICAgICAgICB0aGlzLmNvbW1hbmRzLm9uKFwiZXhlY1wiLCB0aGlzLiRoaXN0b3J5VHJhY2tlcik7XG5cbiAgICAgICAgdGhpcy4kaW5pdE9wZXJhdGlvbkxpc3RlbmVycygpO1xuXG4gICAgICAgIHRoaXMuXyRlbWl0SW5wdXRFdmVudCA9IGRlbGF5ZWRDYWxsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiaW5wdXRcIiwge30pO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmJnVG9rZW5pemVyICYmIHRoaXMuc2Vzc2lvbi5iZ1Rva2VuaXplci5zY2hlZHVsZVN0YXJ0KCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5vbihcImNoYW5nZVwiLCBmdW5jdGlvbihfLCBfc2VsZikge1xuICAgICAgICAgICAgX3NlbGYuXyRlbWl0SW5wdXRFdmVudC5zY2hlZHVsZSgzMSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc2V0U2Vzc2lvbihzZXNzaW9uIHx8IG5ldyBFZGl0U2Vzc2lvbihcIlwiKSk7XG4gICAgICAgIHJlc2V0T3B0aW9ucyh0aGlzKTtcbiAgICAgICAgX3NpZ25hbChcImVkaXRvclwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICBjYW5jZWxNb3VzZUNvbnRleHRNZW51KCkge1xuICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUoKTtcbiAgICB9XG5cbiAgICBnZXQgc2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMoKSB7XG4gICAgICAgIGZ1bmN0aW9uIGxhc3QoYSkgeyByZXR1cm4gYVthLmxlbmd0aCAtIDFdIH1cblxuICAgICAgICB0aGlzLnNlbGVjdGlvbnMgPSBbXTtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImV4ZWNcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgdGhpcy5zdGFydE9wZXJhdGlvbihlKTtcblxuICAgICAgICAgICAgdmFyIGNvbW1hbmQgPSBlLmNvbW1hbmQ7XG4gICAgICAgICAgICBpZiAoY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgPT0gXCJmaWxlSnVtcFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHByZXYgPSB0aGlzLnByZXZPcDtcbiAgICAgICAgICAgICAgICBpZiAoIXByZXYgfHwgcHJldi5jb21tYW5kLmFjZUNvbW1hbmRHcm91cCAhPSBcImZpbGVKdW1wXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5sYXN0RmlsZUp1bXBQb3MgPSBsYXN0KHRoaXMuc2VsZWN0aW9ucyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmxhc3RGaWxlSnVtcFBvcyA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKSwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImFmdGVyRXhlY1wiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICB2YXIgY29tbWFuZCA9IGUuY29tbWFuZDtcblxuICAgICAgICAgICAgaWYgKGNvbW1hbmQuYWNlQ29tbWFuZEdyb3VwID09IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLmxhc3RGaWxlSnVtcFBvcyAmJiAhdGhpcy5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLmZyb21KU09OKHRoaXMubGFzdEZpbGVKdW1wUG9zKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVuZE9wZXJhdGlvbihlKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpLCB0cnVlKTtcblxuICAgICAgICB0aGlzLiRvcFJlc2V0VGltZXIgPSBkZWxheWVkQ2FsbCh0aGlzLmVuZE9wZXJhdGlvbi5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5jdXJPcCB8fCB0aGlzLnN0YXJ0T3BlcmF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmN1ck9wLmRvY0NoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9LmJpbmQodGhpcyksIHRydWUpO1xuXG4gICAgICAgIHRoaXMub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLmN1ck9wIHx8IHRoaXMuc3RhcnRPcGVyYXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH0uYmluZCh0aGlzKSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgc3RhcnRPcGVyYXRpb24oY29tbWFkRXZlbnQpIHtcbiAgICAgICAgaWYgKHRoaXMuY3VyT3ApIHtcbiAgICAgICAgICAgIGlmICghY29tbWFkRXZlbnQgfHwgdGhpcy5jdXJPcC5jb21tYW5kKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMucHJldk9wID0gdGhpcy5jdXJPcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWNvbW1hZEV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ29tbWFuZCA9IG51bGw7XG4gICAgICAgICAgICBjb21tYWRFdmVudCA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kb3BSZXNldFRpbWVyLnNjaGVkdWxlKCk7XG4gICAgICAgIHRoaXMuY3VyT3AgPSB7XG4gICAgICAgICAgICBjb21tYW5kOiBjb21tYWRFdmVudC5jb21tYW5kIHx8IHt9LFxuICAgICAgICAgICAgYXJnczogY29tbWFkRXZlbnQuYXJncyxcbiAgICAgICAgICAgIHNjcm9sbFRvcDogdGhpcy5yZW5kZXJlci5zY3JvbGxUb3BcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgY29tbWFuZCA9IHRoaXMuY3VyT3AuY29tbWFuZDtcbiAgICAgICAgaWYgKGNvbW1hbmQgJiYgY29tbWFuZC5zY3JvbGxJbnRvVmlldylcbiAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG5cbiAgICAgICAgdGhpcy5zZWxlY3Rpb25zLnB1c2godGhpcy5zZWxlY3Rpb24udG9KU09OKCkpO1xuICAgIH1cblxuICAgIGVuZE9wZXJhdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuY3VyT3ApIHtcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gdGhpcy5jdXJPcC5jb21tYW5kO1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQgJiYgY29tbWFuZC5zY3JvbGxJbnRvVmlldykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgICAgICAgICAgc3dpdGNoIChjb21tYW5kLnNjcm9sbEludG9WaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJjZW50ZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiYW5pbWF0ZVwiOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiY3Vyc29yXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcInNlbGVjdGlvblBhcnRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5yZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPj0gY29uZmlnLmxhc3RSb3cgfHwgcmFuZ2UuZW5kLnJvdyA8PSBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3KHRoaXMuc2VsZWN0aW9uLmFuY2hvciwgdGhpcy5zZWxlY3Rpb24ubGVhZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoY29tbWFuZC5zY3JvbGxJbnRvVmlldyA9PSBcImFuaW1hdGVcIilcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nKHRoaXMuY3VyT3Auc2Nyb2xsVG9wKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wcmV2T3AgPSB0aGlzLmN1ck9wO1xuICAgICAgICAgICAgdGhpcy5jdXJPcCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkaGlzdG9yeVRyYWNrZXIoZSkge1xuICAgICAgICBpZiAoIXRoaXMuJG1lcmdlVW5kb0RlbHRhcylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcHJldiA9IHRoaXMucHJldk9wO1xuICAgICAgICB2YXIgbWVyZ2VhYmxlQ29tbWFuZHMgPSB0aGlzLiRtZXJnZWFibGVDb21tYW5kcztcbiAgICAgICAgLy8gcHJldmlvdXMgY29tbWFuZCB3YXMgdGhlIHNhbWVcbiAgICAgICAgdmFyIHNob3VsZE1lcmdlID0gcHJldi5jb21tYW5kICYmIChlLmNvbW1hbmQubmFtZSA9PSBwcmV2LmNvbW1hbmQubmFtZSk7XG4gICAgICAgIGlmIChlLmNvbW1hbmQubmFtZSA9PSBcImluc2VydHN0cmluZ1wiKSB7XG4gICAgICAgICAgICB2YXIgdGV4dCA9IGUuYXJncztcbiAgICAgICAgICAgIGlmICh0aGlzLm1lcmdlTmV4dENvbW1hbmQgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICB0aGlzLm1lcmdlTmV4dENvbW1hbmQgPSB0cnVlO1xuXG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IHNob3VsZE1lcmdlXG4gICAgICAgICAgICAgICAgJiYgdGhpcy5tZXJnZU5leHRDb21tYW5kIC8vIHByZXZpb3VzIGNvbW1hbmQgYWxsb3dzIHRvIGNvYWxlc2NlIHdpdGhcbiAgICAgICAgICAgICAgICAmJiAoIS9cXHMvLnRlc3QodGV4dCkgfHwgL1xccy8udGVzdChwcmV2LmFyZ3MpKTsgLy8gcHJldmlvdXMgaW5zZXJ0aW9uIHdhcyBvZiBzYW1lIHR5cGVcblxuICAgICAgICAgICAgdGhpcy5tZXJnZU5leHRDb21tYW5kID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNob3VsZE1lcmdlID0gc2hvdWxkTWVyZ2VcbiAgICAgICAgICAgICAgICAmJiBtZXJnZWFibGVDb21tYW5kcy5pbmRleE9mKGUuY29tbWFuZC5uYW1lKSAhPT0gLTE7IC8vIHRoZSBjb21tYW5kIGlzIG1lcmdlYWJsZVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgdGhpcy4kbWVyZ2VVbmRvRGVsdGFzICE9IFwiYWx3YXlzXCJcbiAgICAgICAgICAgICYmIERhdGUubm93KCkgLSB0aGlzLnNlcXVlbmNlU3RhcnRUaW1lID4gMjAwMFxuICAgICAgICApIHtcbiAgICAgICAgICAgIHNob3VsZE1lcmdlID0gZmFsc2U7IC8vIHRoZSBzZXF1ZW5jZSBpcyB0b28gbG9uZ1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZE1lcmdlKVxuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm1lcmdlVW5kb0RlbHRhcyA9IHRydWU7XG4gICAgICAgIGVsc2UgaWYgKG1lcmdlYWJsZUNvbW1hbmRzLmluZGV4T2YoZS5jb21tYW5kLm5hbWUpICE9PSAtMSlcbiAgICAgICAgICAgIHRoaXMuc2VxdWVuY2VTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcga2V5IGhhbmRsZXIsIHN1Y2ggYXMgXCJ2aW1cIiBvciBcIndpbmRvd3NcIi5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5Ym9hcmRIYW5kbGVyIFRoZSBuZXcga2V5IGhhbmRsZXJcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRLZXlib2FyZEhhbmRsZXIoa2V5Ym9hcmRIYW5kbGVyKSB7XG4gICAgICAgIGlmICgha2V5Ym9hcmRIYW5kbGVyKSB7XG4gICAgICAgICAgICB0aGlzLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBrZXlib2FyZEhhbmRsZXIgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHRoaXMuJGtleWJpbmRpbmdJZCA9IGtleWJvYXJkSGFuZGxlcjtcbiAgICAgICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBsb2FkTW9kdWxlKFtcImtleWJpbmRpbmdcIiwga2V5Ym9hcmRIYW5kbGVyXSwgZnVuY3Rpb24obW9kdWxlKSB7XG4gICAgICAgICAgICAgICAgaWYgKF9zZWxmLiRrZXliaW5kaW5nSWQgPT0ga2V5Ym9hcmRIYW5kbGVyKVxuICAgICAgICAgICAgICAgICAgICBfc2VsZi5rZXlCaW5kaW5nLnNldEtleWJvYXJkSGFuZGxlcihtb2R1bGUgJiYgbW9kdWxlLmhhbmRsZXIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRrZXliaW5kaW5nSWQgPSBudWxsO1xuICAgICAgICAgICAgdGhpcy5rZXlCaW5kaW5nLnNldEtleWJvYXJkSGFuZGxlcihrZXlib2FyZEhhbmRsZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUga2V5Ym9hcmQgaGFuZGxlciwgc3VjaCBhcyBcInZpbVwiIG9yIFwid2luZG93c1wiLlxuICAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKlxuICAgICAqKi9cbiAgICBnZXRLZXlib2FyZEhhbmRsZXIoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmtleUJpbmRpbmcuZ2V0S2V5Ym9hcmRIYW5kbGVyKCk7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW5ldmVyIHRoZSBbW0VkaXRTZXNzaW9uXV0gY2hhbmdlcy5cbiAgICAgKiBAZXZlbnQgY2hhbmdlU2Vzc2lvblxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBlIEFuIG9iamVjdCB3aXRoIHR3byBwcm9wZXJ0aWVzLCBgb2xkU2Vzc2lvbmAgYW5kIGBzZXNzaW9uYCwgdGhhdCByZXByZXNlbnQgdGhlIG9sZCBhbmQgbmV3IFtbRWRpdFNlc3Npb25dXXMuXG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyBlZGl0c2Vzc2lvbiB0byB1c2UuIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2Vzc2lvbidgIGV2ZW50LlxuICAgICAqIEBwYXJhbSB7RWRpdFNlc3Npb259IHNlc3Npb24gVGhlIG5ldyBzZXNzaW9uIHRvIHVzZVxuICAgICAqXG4gICAgICoqL1xuICAgIHNldFNlc3Npb24oc2Vzc2lvbikge1xuICAgICAgICBpZiAodGhpcy5zZXNzaW9uID09IHNlc3Npb24pXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIG9sZFNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIGlmIChvbGRTZXNzaW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlTW9kZVwiLCB0aGlzLiRvbkNoYW5nZU1vZGUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgdGhpcy4kb25Ub2tlbml6ZXJVcGRhdGUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VUYWJTaXplXCIsIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVdyYXBMaW1pdFwiLCB0aGlzLiRvbkNoYW5nZVdyYXBMaW1pdCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVdyYXBNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlV3JhcE1vZGUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJvbkNoYW5nZUZvbGRcIiwgdGhpcy4kb25DaGFuZ2VGb2xkKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlRnJvbnRNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlcik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZUJhY2tNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VCYWNrTWFya2VyKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZU92ZXJ3cml0ZVwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNjcm9sbFRvcFwiLCB0aGlzLiRvblNjcm9sbFRvcENoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNjcm9sbExlZnRcIiwgdGhpcy4kb25TY3JvbGxMZWZ0Q2hhbmdlKTtcblxuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlQ3Vyc29yXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbiA9IHNlc3Npb247XG4gICAgICAgIGlmIChzZXNzaW9uKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkRvY3VtZW50Q2hhbmdlID0gdGhpcy5vbkRvY3VtZW50Q2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgdGhpcy4kb25Eb2N1bWVudENoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNlc3Npb24oc2Vzc2lvbik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZSA9IHRoaXMub25DaGFuZ2VNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VNb2RlXCIsIHRoaXMuJG9uQ2hhbmdlTW9kZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlID0gdGhpcy5vblRva2VuaXplclVwZGF0ZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwidG9rZW5pemVyVXBkYXRlXCIsIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VUYWJTaXplID0gdGhpcy5yZW5kZXJlci5vbkNoYW5nZVRhYlNpemUuYmluZCh0aGlzLnJlbmRlcmVyKTtcbiAgICAgICAgICAgIHNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVRhYlNpemVcIiwgdGhpcy4kb25DaGFuZ2VUYWJTaXplKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VXcmFwTGltaXQgPSB0aGlzLm9uQ2hhbmdlV3JhcExpbWl0LmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VXcmFwTGltaXRcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTGltaXQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlID0gdGhpcy5vbkNoYW5nZVdyYXBNb2RlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VXcmFwTW9kZVwiLCB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VGb2xkID0gdGhpcy5vbkNoYW5nZUZvbGQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZUZvbGRcIiwgdGhpcy4kb25DaGFuZ2VGb2xkKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlciA9IHRoaXMub25DaGFuZ2VGcm9udE1hcmtlci5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VGcm9udE1hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUZyb250TWFya2VyKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VCYWNrTWFya2VyID0gdGhpcy5vbkNoYW5nZUJhY2tNYXJrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlQmFja01hcmtlclwiLCB0aGlzLiRvbkNoYW5nZUJhY2tNYXJrZXIpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQgPSB0aGlzLm9uQ2hhbmdlQnJlYWtwb2ludC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHRoaXMuJG9uQ2hhbmdlQnJlYWtwb2ludCk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbiA9IHRoaXMub25DaGFuZ2VBbm5vdGF0aW9uLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZUFubm90YXRpb25cIiwgdGhpcy4kb25DaGFuZ2VBbm5vdGF0aW9uKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DdXJzb3JDaGFuZ2UgPSB0aGlzLm9uQ3Vyc29yQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZU92ZXJ3cml0ZVwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uU2Nyb2xsVG9wQ2hhbmdlID0gdGhpcy5vblNjcm9sbFRvcENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTY3JvbGxUb3BcIiwgdGhpcy4kb25TY3JvbGxUb3BDaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLiRvblNjcm9sbExlZnRDaGFuZ2UgPSB0aGlzLm9uU2Nyb2xsTGVmdENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHRoaXMuJG9uU2Nyb2xsTGVmdENoYW5nZSk7XG5cbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uID0gc2Vzc2lvbi5nZXRTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VDdXJzb3JcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLiRvblNlbGVjdGlvbkNoYW5nZSA9IHRoaXMub25TZWxlY3Rpb25DaGFuZ2UuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTZWxlY3Rpb25cIiwgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlTW9kZSgpO1xuXG4gICAgICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICAgICAgdGhpcy5vbkN1cnNvckNoYW5nZSgpO1xuICAgICAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcblxuICAgICAgICAgICAgdGhpcy5vblNjcm9sbFRvcENoYW5nZSgpO1xuICAgICAgICAgICAgdGhpcy5vblNjcm9sbExlZnRDaGFuZ2UoKTtcbiAgICAgICAgICAgIHRoaXMub25TZWxlY3Rpb25DaGFuZ2UoKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VGcm9udE1hcmtlcigpO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUJhY2tNYXJrZXIoKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VCcmVha3BvaW50KCk7XG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlQW5ub3RhdGlvbigpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmdldFVzZVdyYXBNb2RlKCkgJiYgdGhpcy5yZW5kZXJlci5hZGp1c3RXcmFwTGltaXQoKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlRnVsbCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2Vzc2lvblwiLCB7XG4gICAgICAgICAgICBzZXNzaW9uOiBzZXNzaW9uLFxuICAgICAgICAgICAgb2xkU2Vzc2lvbjogb2xkU2Vzc2lvblxuICAgICAgICB9KTtcblxuICAgICAgICBvbGRTZXNzaW9uICYmIG9sZFNlc3Npb24uX3NpZ25hbChcImNoYW5nZUVkaXRvclwiLCB7IG9sZEVkaXRvcjogdGhpcyB9KTtcbiAgICAgICAgc2Vzc2lvbiAmJiBzZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VFZGl0b3JcIiwgeyBlZGl0b3I6IHRoaXMgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZXNzaW9uIGJlaW5nIHVzZWQuXG4gICAgICogQHJldHVybnMge0VkaXRTZXNzaW9ufVxuICAgICAqKi9cbiAgICBnZXRTZXNzaW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgZG9jdW1lbnQgdG8gYHZhbGAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHZhbCBUaGUgbmV3IHZhbHVlIHRvIHNldCBmb3IgdGhlIGRvY3VtZW50XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGN1cnNvclBvcyBXaGVyZSB0byBzZXQgdGhlIG5ldyB2YWx1ZS4gYHVuZGVmaW5lZGAgb3IgMCBpcyBzZWxlY3RBbGwsIC0xIGlzIGF0IHRoZSBkb2N1bWVudCBzdGFydCwgYW5kICsxIGlzIGF0IHRoZSBlbmRcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBjdXJyZW50IGRvY3VtZW50IHZhbHVlXG4gICAgICogQHJlbGF0ZWQgRG9jdW1lbnQuc2V0VmFsdWVcbiAgICAgKiovXG4gICAgc2V0VmFsdWUodmFsOiBzdHJpbmcsIGN1cnNvclBvcz86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5kb2Muc2V0VmFsdWUodmFsKTtcblxuICAgICAgICBpZiAoIWN1cnNvclBvcykge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3RBbGwoKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjdXJzb3JQb3MgPT0gKzEpIHtcbiAgICAgICAgICAgIHRoaXMubmF2aWdhdGVGaWxlRW5kKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY3Vyc29yUG9zID09IC0xKSB7XG4gICAgICAgICAgICB0aGlzLm5hdmlnYXRlRmlsZVN0YXJ0KCk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogUmF0aGVyIGNyYXp5ISBFaXRoZXIgcmV0dXJuIHRoaXMgb3IgdGhlIGZvcm1lciB2YWx1ZT9cbiAgICAgICAgcmV0dXJuIHZhbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlc3Npb24ncyBjb250ZW50LlxuICAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICAqKi9cbiAgICBnZXRWYWx1ZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQgc2VsZWN0aW9uLlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBoaWdobGlnaHRlZCBzZWxlY3Rpb25cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHJlc2l6ZVxuICAgICAqIEBwYXJhbSBbZm9yY2VdIHtib29sZWFufSBmb3JjZSBJZiBgdHJ1ZWAsIHJlY29tcHV0ZXMgdGhlIHNpemUsIGV2ZW4gaWYgdGhlIGhlaWdodCBhbmQgd2lkdGggaGF2ZW4ndCBjaGFuZ2VkLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcmVzaXplKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLm9uUmVzaXplKGZvcmNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5zZXRUaGVtZX1cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGhlbWUgVGhlIHBhdGggdG8gYSB0aGVtZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNiIG9wdGlvbmFsIGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZW1lIGlzIGxvYWRlZFxuICAgICAqKi9cbiAgICBzZXRUaGVtZSh0aGVtZTogc3RyaW5nLCBjYj86ICgpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRUaGVtZSh0aGVtZSwgY2IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLmdldFRoZW1lfVxuICAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ30gVGhlIHNldCB0aGVtZVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5nZXRUaGVtZVxuICAgICAqKi9cbiAgICBnZXRUaGVtZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRUaGVtZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLnNldFN0eWxlfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBBIGNsYXNzIG5hbWVcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zZXRTdHlsZVxuICAgICAqKi9cbiAgICBzZXRTdHlsZShzdHlsZSkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFN0eWxlKHN0eWxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlfVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci51bnNldFN0eWxlXG4gICAgICoqL1xuICAgIHVuc2V0U3R5bGUoc3R5bGUpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51bnNldFN0eWxlKHN0eWxlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50IGZvbnQgc2l6ZSBvZiB0aGUgZWRpdG9yIHRleHQuXG4gICAgICovXG4gICAgZ2V0Rm9udFNpemUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZm9udFNpemVcIikgfHwgY29tcHV0ZWRTdHlsZSh0aGlzLmNvbnRhaW5lciwgXCJmb250U2l6ZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYSBuZXcgZm9udCBzaXplIChpbiBwaXhlbHMpIGZvciB0aGUgZWRpdG9yIHRleHQuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGZvbnRTaXplIEEgZm9udCBzaXplICggX2UuZy5fIFwiMTJweFwiKVxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0Rm9udFNpemUoZm9udFNpemU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZvbnRTaXplXCIsIGZvbnRTaXplKTtcbiAgICB9XG5cbiAgICAkaGlnaGxpZ2h0QnJhY2tldHMoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVNYXJrZXIodGhpcy5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0UGVuZGluZykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGVyZm9ybSBoaWdobGlnaHQgYXN5bmMgdG8gbm90IGJsb2NrIHRoZSBicm93c2VyIGR1cmluZyBuYXZpZ2F0aW9uXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0UGVuZGluZyA9IHRydWU7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLiRoaWdobGlnaHRQZW5kaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciBwb3MgPSBzZWxmLnNlc3Npb24uZmluZE1hdGNoaW5nQnJhY2tldChzZWxmLmdldEN1cnNvclBvc2l0aW9uKCkpO1xuICAgICAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShwb3Mucm93LCBwb3MuY29sdW1uLCBwb3Mucm93LCBwb3MuY29sdW1uICsgMSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHNlbGYuc2Vzc2lvbi4kbW9kZS5nZXRNYXRjaGluZykge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxmLnNlc3Npb24uJG1vZGUuZ2V0TWF0Y2hpbmcoc2VsZi5zZXNzaW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyYW5nZSlcbiAgICAgICAgICAgICAgICBzZWxmLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQgPSBzZWxmLnNlc3Npb24uYWRkTWFya2VyKHJhbmdlLCBcImFjZV9icmFja2V0XCIsIFwidGV4dFwiKTtcbiAgICAgICAgfSwgNTApO1xuICAgIH1cblxuICAgIC8vIHRvZG86IG1vdmUgdG8gbW9kZS5nZXRNYXRjaGluZ1xuICAgICRoaWdobGlnaHRUYWdzKCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0VGFnUGVuZGluZykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGVyZm9ybSBoaWdobGlnaHQgYXN5bmMgdG8gbm90IGJsb2NrIHRoZSBicm93c2VyIGR1cmluZyBuYXZpZ2F0aW9uXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0VGFnUGVuZGluZyA9IHRydWU7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLiRoaWdobGlnaHRUYWdQZW5kaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciBwb3MgPSBzZWxmLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcihzZWxmLnNlc3Npb24sIHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgdmFyIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG5cbiAgICAgICAgICAgIGlmICghdG9rZW4gfHwgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciB0YWcgPSB0b2tlbi52YWx1ZTtcbiAgICAgICAgICAgIHZhciBkZXB0aCA9IDA7XG4gICAgICAgICAgICB2YXIgcHJldlRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG5cbiAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgLy9maW5kIGNsb3NpbmcgdGFnXG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSB0b2tlbjtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi52YWx1ZSA9PT0gdGFnICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoKys7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoLS07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHRva2VuICYmIGRlcHRoID49IDApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvL2ZpbmQgb3BlbmluZyB0YWdcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gcHJldlRva2VuO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aCsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8LycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aC0tO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAocHJldlRva2VuICYmIGRlcHRoIDw9IDApO1xuXG4gICAgICAgICAgICAgICAgLy9zZWxlY3QgdGFnIGFnYWluXG4gICAgICAgICAgICAgICAgaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCF0b2tlbikge1xuICAgICAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHRhZ0hpZ2hsaWdodCk7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHZhciBjb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKTtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShyb3csIGNvbHVtbiwgcm93LCBjb2x1bW4gKyB0b2tlbi52YWx1ZS5sZW5ndGgpO1xuXG4gICAgICAgICAgICAvL3JlbW92ZSByYW5nZSBpZiBkaWZmZXJlbnRcbiAgICAgICAgICAgIGlmIChzZXNzaW9uLiR0YWdIaWdobGlnaHQgJiYgcmFuZ2UuY29tcGFyZVJhbmdlKHNlc3Npb24uJGJhY2tNYXJrZXJzW3Nlc3Npb24uJHRhZ0hpZ2hsaWdodF0ucmFuZ2UpICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmFuZ2UgJiYgIXNlc3Npb24uJHRhZ0hpZ2hsaWdodClcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2VfYnJhY2tldFwiLCBcInRleHRcIik7XG4gICAgICAgIH0sIDUwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEJyaW5ncyB0aGUgY3VycmVudCBgdGV4dElucHV0YCBpbnRvIGZvY3VzLlxuICAgICAqKi9cbiAgICBmb2N1cygpIHtcbiAgICAgICAgLy8gU2FmYXJpIG5lZWRzIHRoZSB0aW1lb3V0XG4gICAgICAgIC8vIGlPUyBhbmQgRmlyZWZveCBuZWVkIGl0IGNhbGxlZCBpbW1lZGlhdGVseVxuICAgICAgICAvLyB0byBiZSBvbiB0aGUgc2F2ZSBzaWRlIHdlIGRvIGJvdGhcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIF9zZWxmLnRleHRJbnB1dC5mb2N1cygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy50ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY3VycmVudCBgdGV4dElucHV0YCBpcyBpbiBmb2N1cy5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnRleHRJbnB1dC5pc0ZvY3VzZWQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGB0ZXh0SW5wdXRgLlxuICAgICAqKi9cbiAgICBibHVyKCkge1xuICAgICAgICB0aGlzLnRleHRJbnB1dC5ibHVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCBvbmNlIHRoZSBlZGl0b3IgY29tZXMgaW50byBmb2N1cy5cbiAgICAgKiBAZXZlbnQgZm9jdXNcbiAgICAgKlxuICAgICAqKi9cbiAgICBvbkZvY3VzKCkge1xuICAgICAgICBpZiAodGhpcy4kaXNGb2N1c2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaXNGb2N1c2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaG93Q3Vyc29yKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudmlzdWFsaXplRm9jdXMoKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgb25jZSB0aGUgZWRpdG9yIGhhcyBiZWVuIGJsdXJyZWQuXG4gICAgICogQGV2ZW50IGJsdXJcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uQmx1cigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRpc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRpc0ZvY3VzZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5oaWRlQ3Vyc29yKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudmlzdWFsaXplQmx1cigpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiYmx1clwiKTtcbiAgICB9XG5cbiAgICAkY3Vyc29yQ2hhbmdlKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbmV2ZXIgdGhlIGRvY3VtZW50IGlzIGNoYW5nZWQuXG4gICAgICogQGV2ZW50IGNoYW5nZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBlIENvbnRhaW5zIGEgc2luZ2xlIHByb3BlcnR5LCBgZGF0YWAsIHdoaWNoIGhhcyB0aGUgZGVsdGEgb2YgY2hhbmdlc1xuICAgICAqXG4gICAgICoqL1xuICAgIG9uRG9jdW1lbnRDaGFuZ2UoZSkge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHZhciByYW5nZSA9IGRlbHRhLnJhbmdlO1xuICAgICAgICB2YXIgbGFzdFJvdzogbnVtYmVyO1xuXG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdyAmJiBkZWx0YS5hY3Rpb24gIT0gXCJpbnNlcnRMaW5lc1wiICYmIGRlbHRhLmFjdGlvbiAhPSBcInJlbW92ZUxpbmVzXCIpXG4gICAgICAgICAgICBsYXN0Um93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgbGFzdFJvdyA9IEluZmluaXR5O1xuXG4gICAgICAgIHZhciByOiBWaXJ0dWFsUmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVyO1xuICAgICAgICByLnVwZGF0ZUxpbmVzKHJhbmdlLnN0YXJ0LnJvdywgbGFzdFJvdywgdGhpcy5zZXNzaW9uLiR1c2VXcmFwTW9kZSk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlXCIsIGUpO1xuXG4gICAgICAgIC8vIHVwZGF0ZSBjdXJzb3IgYmVjYXVzZSB0YWIgY2hhcmFjdGVycyBjYW4gaW5mbHVlbmNlIHRoZSBjdXJzb3IgcG9zaXRpb25cbiAgICAgICAgdGhpcy4kY3Vyc29yQ2hhbmdlKCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICB9XG5cbiAgICBvblRva2VuaXplclVwZGF0ZShlKSB7XG4gICAgICAgIHZhciByb3dzID0gZS5kYXRhO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUxpbmVzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCk7XG4gICAgfVxuXG5cbiAgICBvblNjcm9sbFRvcENoYW5nZSgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb1kodGhpcy5zZXNzaW9uLmdldFNjcm9sbFRvcCgpKTtcbiAgICB9XG5cbiAgICBvblNjcm9sbExlZnRDaGFuZ2UoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9YKHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxMZWZ0KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbiB0aGUgc2VsZWN0aW9uIGNoYW5nZXMuXG4gICAgICpcbiAgICAgKiovXG4gICAgb25DdXJzb3JDaGFuZ2UoKSB7XG4gICAgICAgIHRoaXMuJGN1cnNvckNoYW5nZSgpO1xuXG4gICAgICAgIGlmICghdGhpcy4kYmxvY2tTY3JvbGxpbmcpIHtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodEJyYWNrZXRzKCk7XG4gICAgICAgIHRoaXMuJGhpZ2hsaWdodFRhZ3MoKTtcbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTZWxlY3Rpb25cIik7XG4gICAgfVxuXG4gICAgJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5nZXRTZXNzaW9uKCk7XG5cbiAgICAgICAgdmFyIGhpZ2hsaWdodDtcbiAgICAgICAgaWYgKHRoaXMuJGhpZ2hsaWdodEFjdGl2ZUxpbmUpIHtcbiAgICAgICAgICAgIGlmICgodGhpcy4kc2VsZWN0aW9uU3R5bGUgIT0gXCJsaW5lXCIgfHwgIXRoaXMuc2VsZWN0aW9uLmlzTXVsdGlMaW5lKCkpKVxuICAgICAgICAgICAgICAgIGhpZ2hsaWdodCA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgICAgIGlmICh0aGlzLnJlbmRlcmVyLiRtYXhMaW5lcyAmJiB0aGlzLnNlc3Npb24uZ2V0TGVuZ3RoKCkgPT09IDEgJiYgISh0aGlzLnJlbmRlcmVyLiRtaW5MaW5lcyA+IDEpKVxuICAgICAgICAgICAgICAgIGhpZ2hsaWdodCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgJiYgIWhpZ2hsaWdodCkge1xuICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlci5pZCk7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciAmJiBoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHZhciByYW5nZTogYW55ID0gbmV3IFJhbmdlKGhpZ2hsaWdodC5yb3csIGhpZ2hsaWdodC5jb2x1bW4sIGhpZ2hsaWdodC5yb3csIEluZmluaXR5KTtcbiAgICAgICAgICAgIHJhbmdlLmlkID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2FjdGl2ZS1saW5lXCIsIFwic2NyZWVuTGluZVwiKTtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgPSByYW5nZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuc3RhcnQucm93ID0gaGlnaGxpZ2h0LnJvdztcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuZW5kLnJvdyA9IGhpZ2hsaWdodC5yb3c7XG4gICAgICAgICAgICBzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyLnN0YXJ0LmNvbHVtbiA9IGhpZ2hsaWdodC5jb2x1bW47XG4gICAgICAgICAgICBzZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25TZWxlY3Rpb25DaGFuZ2UoZT8pIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG5cbiAgICAgICAgaWYgKHR5cGVvZiBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICBzZXNzaW9uLnJlbW92ZU1hcmtlcihzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kc2VsZWN0aW9uTWFya2VyID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHN0eWxlID0gdGhpcy5nZXRTZWxlY3Rpb25TdHlsZSgpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kc2VsZWN0aW9uTWFya2VyID0gc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX3NlbGVjdGlvblwiLCBzdHlsZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmUgPSB0aGlzLiRoaWdobGlnaHRTZWxlY3RlZFdvcmQgJiYgdGhpcy4kZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5oaWdobGlnaHQocmUpO1xuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNlbGVjdGlvblwiKTtcbiAgICB9XG5cbiAgICAkZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwKCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAoc2VsZWN0aW9uLmlzRW1wdHkoKSB8fCBzZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgc3RhcnRPdXRlciA9IHNlbGVjdGlvbi5zdGFydC5jb2x1bW4gLSAxO1xuICAgICAgICB2YXIgZW5kT3V0ZXIgPSBzZWxlY3Rpb24uZW5kLmNvbHVtbiArIDE7XG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKHNlbGVjdGlvbi5zdGFydC5yb3cpO1xuICAgICAgICB2YXIgbGluZUNvbHMgPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgdmFyIG5lZWRsZSA9IGxpbmUuc3Vic3RyaW5nKE1hdGgubWF4KHN0YXJ0T3V0ZXIsIDApLFxuICAgICAgICAgICAgTWF0aC5taW4oZW5kT3V0ZXIsIGxpbmVDb2xzKSk7XG5cbiAgICAgICAgLy8gTWFrZSBzdXJlIHRoZSBvdXRlciBjaGFyYWN0ZXJzIGFyZSBub3QgcGFydCBvZiB0aGUgd29yZC5cbiAgICAgICAgaWYgKChzdGFydE91dGVyID49IDAgJiYgL15bXFx3XFxkXS8udGVzdChuZWVkbGUpKSB8fFxuICAgICAgICAgICAgKGVuZE91dGVyIDw9IGxpbmVDb2xzICYmIC9bXFx3XFxkXSQvLnRlc3QobmVlZGxlKSkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgbmVlZGxlID0gbGluZS5zdWJzdHJpbmcoc2VsZWN0aW9uLnN0YXJ0LmNvbHVtbiwgc2VsZWN0aW9uLmVuZC5jb2x1bW4pO1xuICAgICAgICBpZiAoIS9eW1xcd1xcZF0rJC8udGVzdChuZWVkbGUpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciByZSA9IHRoaXMuJHNlYXJjaC4kYXNzZW1ibGVSZWdFeHAoe1xuICAgICAgICAgICAgd2hvbGVXb3JkOiB0cnVlLFxuICAgICAgICAgICAgY2FzZVNlbnNpdGl2ZTogdHJ1ZSxcbiAgICAgICAgICAgIG5lZWRsZTogbmVlZGxlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiByZTtcbiAgICB9XG5cblxuICAgIG9uQ2hhbmdlRnJvbnRNYXJrZXIoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlRnJvbnRNYXJrZXJzKCk7XG4gICAgfVxuXG4gICAgb25DaGFuZ2VCYWNrTWFya2VyKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUJhY2tNYXJrZXJzKCk7XG4gICAgfVxuXG5cbiAgICBvbkNoYW5nZUJyZWFrcG9pbnQoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlQnJlYWtwb2ludHMoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZUFubm90YXRpb24oKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0QW5ub3RhdGlvbnModGhpcy5zZXNzaW9uLmdldEFubm90YXRpb25zKCkpO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VNb2RlKGU/KSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlVGV4dCgpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlTW9kZVwiLCBlKTtcbiAgICB9XG5cblxuICAgIG9uQ2hhbmdlV3JhcExpbWl0KCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZVdyYXBNb2RlKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLm9uUmVzaXplKHRydWUpO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VGb2xkKCkge1xuICAgICAgICAvLyBVcGRhdGUgdGhlIGFjdGl2ZSBsaW5lIG1hcmtlciBhcyBkdWUgdG8gZm9sZGluZyBjaGFuZ2VzIHRoZSBjdXJyZW50XG4gICAgICAgIC8vIGxpbmUgcmFuZ2Ugb24gdGhlIHNjcmVlbiBtaWdodCBoYXZlIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgLy8gVE9ETzogVGhpcyBtaWdodCBiZSB0b28gbXVjaCB1cGRhdGluZy4gT2theSBmb3Igbm93LlxuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGV4dCBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0ZWRUZXh0KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbiB0ZXh0IGlzIGNvcGllZC5cbiAgICAgKiBAZXZlbnQgY29weVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBjb3BpZWQgdGV4dFxuICAgICAqXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBvZiB0ZXh0IGN1cnJlbnRseSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqIEBkZXByZWNhdGVkIFVzZSBnZXRTZWxlY3RlZFRleHQgaW5zdGVhZC5cbiAgICAgKiovXG4gICAgZ2V0Q29weVRleHQoKSB7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5nZXRTZWxlY3RlZFRleHQoKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY29weVwiLCB0ZXh0KTtcbiAgICAgICAgcmV0dXJuIHRleHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImNvcHlcIiBoYXBwZW5zLlxuICAgICAqKi9cbiAgICBvbkNvcHkoKSB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhcImNvcHlcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcImN1dFwiIGhhcHBlbnMuXG4gICAgICoqL1xuICAgIG9uQ3V0KCkge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoXCJjdXRcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgcGFzdGVkLlxuICAgICAqIEBldmVudCBwYXN0ZVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBwYXN0ZWQgdGV4dFxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogQ2FsbGVkIHdoZW5ldmVyIGEgdGV4dCBcInBhc3RlXCIgaGFwcGVucy5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBUaGUgcGFzdGVkIHRleHRcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uUGFzdGUodGV4dCkge1xuICAgICAgICAvLyB0b2RvIHRoaXMgc2hvdWxkIGNoYW5nZSB3aGVuIHBhc3RlIGJlY29tZXMgYSBjb21tYW5kXG4gICAgICAgIGlmICh0aGlzLiRyZWFkT25seSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgdmFyIGUgPSB7IHRleHQ6IHRleHQgfTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwicGFzdGVcIiwgZSk7XG4gICAgICAgIHRoaXMuaW5zZXJ0KGUudGV4dCwgdHJ1ZSk7XG4gICAgfVxuXG5cbiAgICBleGVjQ29tbWFuZChjb21tYW5kLCBhcmdzPyk6IHZvaWQge1xuICAgICAgICB0aGlzLmNvbW1hbmRzLmV4ZWMoY29tbWFuZCwgdGhpcywgYXJncyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5zZXJ0cyBgdGV4dGAgaW50byB3aGVyZXZlciB0aGUgY3Vyc29yIGlzIHBvaW50aW5nLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBuZXcgdGV4dCB0byBhZGRcbiAgICAgKlxuICAgICAqKi9cbiAgICBpbnNlcnQodGV4dCwgcGFzdGVkPykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIG1vZGUgPSBzZXNzaW9uLmdldE1vZGUoKTtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcblxuICAgICAgICBpZiAodGhpcy5nZXRCZWhhdmlvdXJzRW5hYmxlZCgpICYmICFwYXN0ZWQpIHtcbiAgICAgICAgICAgIC8vIEdldCBhIHRyYW5zZm9ybSBpZiB0aGUgY3VycmVudCBtb2RlIHdhbnRzIG9uZS5cbiAgICAgICAgICAgIHZhciB0cmFuc2Zvcm0gPSBtb2RlLnRyYW5zZm9ybUFjdGlvbihzZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpLCAnaW5zZXJ0aW9uJywgdGhpcywgc2Vzc2lvbiwgdGV4dCk7XG4gICAgICAgICAgICBpZiAodHJhbnNmb3JtKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRleHQgIT09IHRyYW5zZm9ybS50ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5tZXJnZVVuZG9EZWx0YXMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kbWVyZ2VOZXh0Q29tbWFuZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0ZXh0ID0gdHJhbnNmb3JtLnRleHQ7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0ZXh0ID09IFwiXFx0XCIpXG4gICAgICAgICAgICB0ZXh0ID0gdGhpcy5zZXNzaW9uLmdldFRhYlN0cmluZygpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBzZWxlY3RlZCB0ZXh0XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgICAgICBjdXJzb3IgPSB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLnNlc3Npb24uZ2V0T3ZlcndyaXRlKCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoY3Vyc29yLCBjdXJzb3IpO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiArPSB0ZXh0Lmxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRleHQgPT0gXCJcXG5cIiB8fCB0ZXh0ID09IFwiXFxyXFxuXCIpIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICAgICAgaWYgKGN1cnNvci5jb2x1bW4gPiBsaW5lLnNlYXJjaCgvXFxTfCQvKSkge1xuICAgICAgICAgICAgICAgIHZhciBkID0gbGluZS5zdWJzdHIoY3Vyc29yLmNvbHVtbikuc2VhcmNoKC9cXFN8JC8pO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uZG9jLnJlbW92ZUluTGluZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uLCBjdXJzb3IuY29sdW1uICsgZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuXG4gICAgICAgIHZhciBzdGFydCA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lU3RhdGUgPSBzZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHNob3VsZE91dGRlbnQgPSBtb2RlLmNoZWNrT3V0ZGVudChsaW5lU3RhdGUsIGxpbmUsIHRleHQpO1xuICAgICAgICB2YXIgZW5kID0gc2Vzc2lvbi5pbnNlcnQoY3Vyc29yLCB0ZXh0KTtcblxuICAgICAgICBpZiAodHJhbnNmb3JtICYmIHRyYW5zZm9ybS5zZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGlmICh0cmFuc2Zvcm0uc2VsZWN0aW9uLmxlbmd0aCA9PSAyKSB7IC8vIFRyYW5zZm9ybSByZWxhdGl2ZSB0byB0aGUgY3VycmVudCBjb2x1bW5cbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShcbiAgICAgICAgICAgICAgICAgICAgbmV3IFJhbmdlKGN1cnNvci5yb3csIHN0YXJ0ICsgdHJhbnNmb3JtLnNlbGVjdGlvblswXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnNvci5yb3csIHN0YXJ0ICsgdHJhbnNmb3JtLnNlbGVjdGlvblsxXSkpO1xuICAgICAgICAgICAgfSBlbHNlIHsgLy8gVHJhbnNmb3JtIHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IHJvdy5cbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShcbiAgICAgICAgICAgICAgICAgICAgbmV3IFJhbmdlKGN1cnNvci5yb3cgKyB0cmFuc2Zvcm0uc2VsZWN0aW9uWzBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtLnNlbGVjdGlvblsxXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnNvci5yb3cgKyB0cmFuc2Zvcm0uc2VsZWN0aW9uWzJdLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHJhbnNmb3JtLnNlbGVjdGlvblszXSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNlc3Npb24uZ2V0RG9jdW1lbnQoKS5pc05ld0xpbmUodGV4dCkpIHtcbiAgICAgICAgICAgIHZhciBsaW5lSW5kZW50ID0gbW9kZS5nZXROZXh0TGluZUluZGVudChsaW5lU3RhdGUsIGxpbmUuc2xpY2UoMCwgY3Vyc29yLmNvbHVtbiksIHNlc3Npb24uZ2V0VGFiU3RyaW5nKCkpO1xuXG4gICAgICAgICAgICBzZXNzaW9uLmluc2VydCh7IHJvdzogY3Vyc29yLnJvdyArIDEsIGNvbHVtbjogMCB9LCBsaW5lSW5kZW50KTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2hvdWxkT3V0ZGVudClcbiAgICAgICAgICAgIG1vZGUuYXV0b091dGRlbnQobGluZVN0YXRlLCBzZXNzaW9uLCBjdXJzb3Iucm93KTtcbiAgICB9XG5cbiAgICBvblRleHRJbnB1dCh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nLm9uVGV4dElucHV0KHRleHQpO1xuICAgICAgICAvLyBUT0RPOiBUaGlzIHNob3VsZCBiZSBwbHVnZ2FibGUuXG4gICAgICAgIGlmICh0ZXh0ID09PSAnLicpIHtcbiAgICAgICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhDT01NQU5EX05BTUVfQVVUT19DT01QTEVURSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5nZXRTZXNzaW9uKCkuZ2V0RG9jdW1lbnQoKS5pc05ld0xpbmUodGV4dCkpIHtcbiAgICAgICAgICAgIHZhciBsaW5lTnVtYmVyID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgdmFyIG9wdGlvbiA9IG5ldyBTZXJ2aWNlcy5FZGl0b3JPcHRpb25zKCk7XG4gICAgICAgICAgICAvLyAgICAgICAgICAgIG9wdGlvbi5OZXdMaW5lQ2hhcmFjdGVyID0gXCJcXG5cIjtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBTbWFydCBJbmRlbnRpbmdcbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICB2YXIgaW5kZW50ID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldFNtYXJ0SW5kZW50QXRMaW5lTnVtYmVyKGN1cnJlbnRGaWxlTmFtZSwgbGluZU51bWJlciwgb3B0aW9uKTtcbiAgICAgICAgICAgIGlmKGluZGVudCA+IDApXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgZWRpdG9yLmNvbW1hbmRzLmV4ZWMoXCJpbnNlcnR0ZXh0XCIsIGVkaXRvciwge3RleHQ6XCIgXCIsIHRpbWVzOmluZGVudH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgKi9cbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9uQ29tbWFuZEtleShlLCBoYXNoSWQsIGtleUNvZGUpIHtcbiAgICAgICAgdGhpcy5rZXlCaW5kaW5nLm9uQ29tbWFuZEtleShlLCBoYXNoSWQsIGtleUNvZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhc3MgaW4gYHRydWVgIHRvIGVuYWJsZSBvdmVyd3JpdGVzIGluIHlvdXIgc2Vzc2lvbiwgb3IgYGZhbHNlYCB0byBkaXNhYmxlLiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGVyIG9yIG5vdCB0byBzZXQgb3ZlcndyaXRlc1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNlc3Npb24uc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgb3ZlcndyaXRlcyBhcmUgZW5hYmxlZDsgYGZhbHNlYCBvdGhlcndpc2UuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0T3ZlcndyaXRlXG4gICAgICoqL1xuICAgIGdldE92ZXJ3cml0ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZSBvZiBvdmVyd3JpdGUgdG8gdGhlIG9wcG9zaXRlIG9mIHdoYXRldmVyIGl0IGN1cnJlbnRseSBpcy5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgdG9nZ2xlT3ZlcndyaXRlKCkge1xuICAgICAgICB0aGlzLnNlc3Npb24udG9nZ2xlT3ZlcndyaXRlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBob3cgZmFzdCB0aGUgbW91c2Ugc2Nyb2xsaW5nIHNob3VsZCBkby5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc3BlZWQgQSB2YWx1ZSBpbmRpY2F0aW5nIHRoZSBuZXcgc3BlZWQgKGluIG1pbGxpc2Vjb25kcylcbiAgICAgKiovXG4gICAgc2V0U2Nyb2xsU3BlZWQoc3BlZWQ6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNjcm9sbFNwZWVkXCIsIHNwZWVkKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBpbmRpY2F0aW5nIGhvdyBmYXN0IHRoZSBtb3VzZSBzY3JvbGwgc3BlZWQgaXMgKGluIG1pbGxpc2Vjb25kcykuXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiovXG4gICAgZ2V0U2Nyb2xsU3BlZWQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2Nyb2xsU3BlZWRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgZGVsYXkgKGluIG1pbGxpc2Vjb25kcykgb2YgdGhlIG1vdXNlIGRyYWcuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRyYWdEZWxheSBBIHZhbHVlIGluZGljYXRpbmcgdGhlIG5ldyBkZWxheVxuICAgICAqKi9cbiAgICBzZXREcmFnRGVsYXkoZHJhZ0RlbGF5OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJkcmFnRGVsYXlcIiwgZHJhZ0RlbGF5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IG1vdXNlIGRyYWcgZGVsYXkuXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiovXG4gICAgZ2V0RHJhZ0RlbGF5KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImRyYWdEZWxheVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW4gdGhlIHNlbGVjdGlvbiBzdHlsZSBjaGFuZ2VzLCB2aWEgW1tFZGl0b3Iuc2V0U2VsZWN0aW9uU3R5bGVdXS5cbiAgICAgKiBAZXZlbnQgY2hhbmdlU2VsZWN0aW9uU3R5bGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZGF0YSBDb250YWlucyBvbmUgcHJvcGVydHksIGBkYXRhYCwgd2hpY2ggaW5kaWNhdGVzIHRoZSBuZXcgc2VsZWN0aW9uIHN0eWxlXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIERyYXcgc2VsZWN0aW9uIG1hcmtlcnMgc3Bhbm5pbmcgd2hvbGUgbGluZSwgb3Igb25seSBvdmVyIHNlbGVjdGVkIHRleHQuIERlZmF1bHQgdmFsdWUgaXMgXCJsaW5lXCJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gc3R5bGUgVGhlIG5ldyBzZWxlY3Rpb24gc3R5bGUgXCJsaW5lXCJ8XCJ0ZXh0XCJcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRTZWxlY3Rpb25TdHlsZSh2YWw6IHN0cmluZykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInNlbGVjdGlvblN0eWxlXCIsIHZhbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZWxlY3Rpb24gc3R5bGUuXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAgKiovXG4gICAgZ2V0U2VsZWN0aW9uU3R5bGUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwic2VsZWN0aW9uU3R5bGVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIG9yIG5vdCB0aGUgY3VycmVudCBsaW5lIHNob3VsZCBiZSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3VsZEhpZ2hsaWdodCBTZXQgdG8gYHRydWVgIHRvIGhpZ2hsaWdodCB0aGUgY3VycmVudCBsaW5lXG4gICAgICoqL1xuICAgIHNldEhpZ2hsaWdodEFjdGl2ZUxpbmUoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0QWN0aXZlTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGN1cnJlbnQgbGluZXMgYXJlIGFsd2F5cyBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIaWdobGlnaHRBY3RpdmVMaW5lKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJoaWdobGlnaHRBY3RpdmVMaW5lXCIpO1xuICAgIH1cblxuICAgIHNldEhpZ2hsaWdodEd1dHRlckxpbmUoc2hvdWxkSGlnaGxpZ2h0OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIGdldEhpZ2hsaWdodEd1dHRlckxpbmUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEd1dHRlckxpbmVcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyBpZiB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHdvcmQgc2hvdWxkIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkSGlnaGxpZ2h0IFNldCB0byBgdHJ1ZWAgdG8gaGlnaGxpZ2h0IHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgd29yZFxuICAgICAqXG4gICAgICoqL1xuICAgIHNldEhpZ2hsaWdodFNlbGVjdGVkV29yZChzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRTZWxlY3RlZFdvcmRcIiwgc2hvdWxkSGlnaGxpZ2h0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBjdXJyZW50bHkgaGlnaGxpZ2h0ZWQgd29yZHMgYXJlIHRvIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiRoaWdobGlnaHRTZWxlY3RlZFdvcmQ7XG4gICAgfVxuXG4gICAgc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldEFuaW1hdGVkU2Nyb2xsKHNob3VsZEFuaW1hdGUpO1xuICAgIH1cblxuICAgIGdldEFuaW1hdGVkU2Nyb2xsKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRBbmltYXRlZFNjcm9sbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGBzaG93SW52aXNpYmxlc2AgaXMgc2V0IHRvIGB0cnVlYCwgaW52aXNpYmxlIGNoYXJhY3RlcnMmbWRhc2g7bGlrZSBzcGFjZXMgb3IgbmV3IGxpbmVzJm1kYXNoO2FyZSBzaG93IGluIHRoZSBlZGl0b3IuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93SW52aXNpYmxlcyBTcGVjaWZpZXMgd2hldGhlciBvciBub3QgdG8gc2hvdyBpbnZpc2libGUgY2hhcmFjdGVyc1xuICAgICAqXG4gICAgICoqL1xuICAgIHNldFNob3dJbnZpc2libGVzKHNob3dJbnZpc2libGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGludmlzaWJsZSBjaGFyYWN0ZXJzIGFyZSBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0U2hvd0ludmlzaWJsZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNob3dJbnZpc2libGVzKCk7XG4gICAgfVxuXG4gICAgc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0RGlzcGxheUluZGVudEd1aWRlcyhkaXNwbGF5SW5kZW50R3VpZGVzKTtcbiAgICB9XG5cbiAgICBnZXREaXNwbGF5SW5kZW50R3VpZGVzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXREaXNwbGF5SW5kZW50R3VpZGVzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHNob3dQcmludE1hcmdpbmAgaXMgc2V0IHRvIGB0cnVlYCwgdGhlIHByaW50IG1hcmdpbiBpcyBzaG93biBpbiB0aGUgZWRpdG9yLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvd1ByaW50TWFyZ2luIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzaG93IHRoZSBwcmludCBtYXJnaW5cbiAgICAgKiovXG4gICAgc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbjogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFNob3dQcmludE1hcmdpbihzaG93UHJpbnRNYXJnaW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBwcmludCBtYXJnaW4gaXMgYmVpbmcgc2hvd24uXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd1ByaW50TWFyZ2luKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRTaG93UHJpbnRNYXJnaW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjb2x1bW4gZGVmaW5pbmcgd2hlcmUgdGhlIHByaW50IG1hcmdpbiBzaG91bGQgYmUuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNob3dQcmludE1hcmdpbiBTcGVjaWZpZXMgdGhlIG5ldyBwcmludCBtYXJnaW5cbiAgICAgKi9cbiAgICBzZXRQcmludE1hcmdpbkNvbHVtbihzaG93UHJpbnRNYXJnaW46IG51bWJlcikge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFByaW50TWFyZ2luQ29sdW1uKHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY29sdW1uIG51bWJlciBvZiB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIGlzLlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICovXG4gICAgZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0UHJpbnRNYXJnaW5Db2x1bW4oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiBgcmVhZE9ubHlgIGlzIHRydWUsIHRoZW4gdGhlIGVkaXRvciBpcyBzZXQgdG8gcmVhZC1vbmx5IG1vZGUsIGFuZCBub25lIG9mIHRoZSBjb250ZW50IGNhbiBjaGFuZ2UuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSByZWFkT25seSBTcGVjaWZpZXMgd2hldGhlciB0aGUgZWRpdG9yIGNhbiBiZSBtb2RpZmllZCBvciBub3RcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRSZWFkT25seShyZWFkT25seTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInJlYWRPbmx5XCIsIHJlYWRPbmx5KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZWRpdG9yIGlzIHNldCB0byByZWFkLW9ubHkgbW9kZS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgZ2V0UmVhZE9ubHkoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInJlYWRPbmx5XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwZWNpZmllcyB3aGV0aGVyIHRvIHVzZSBiZWhhdmlvcnMgb3Igbm90LiBbXCJCZWhhdmlvcnNcIiBpbiB0aGlzIGNhc2UgaXMgdGhlIGF1dG8tcGFpcmluZyBvZiBzcGVjaWFsIGNoYXJhY3RlcnMsIGxpa2UgcXVvdGF0aW9uIG1hcmtzLCBwYXJlbnRoZXNpcywgb3IgYnJhY2tldHMuXXs6ICNCZWhhdmlvcnNEZWZ9XG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkIEVuYWJsZXMgb3IgZGlzYWJsZXMgYmVoYXZpb3JzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0QmVoYXZpb3Vyc0VuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImJlaGF2aW91cnNFbmFibGVkXCIsIGVuYWJsZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBiZWhhdmlvcnMgYXJlIGN1cnJlbnRseSBlbmFibGVkLiB7OkJlaGF2aW9yc0RlZn1cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRCZWhhdmlvdXJzRW5hYmxlZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiYmVoYXZpb3Vyc0VuYWJsZWRcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BlY2lmaWVzIHdoZXRoZXIgdG8gdXNlIHdyYXBwaW5nIGJlaGF2aW9ycyBvciBub3QsIGkuZS4gYXV0b21hdGljYWxseSB3cmFwcGluZyB0aGUgc2VsZWN0aW9uIHdpdGggY2hhcmFjdGVycyBzdWNoIGFzIGJyYWNrZXRzXG4gICAgICogd2hlbiBzdWNoIGEgY2hhcmFjdGVyIGlzIHR5cGVkIGluLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlZCBFbmFibGVzIG9yIGRpc2FibGVzIHdyYXBwaW5nIGJlaGF2aW9yc1xuICAgICAqXG4gICAgICoqL1xuICAgIHNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwid3JhcEJlaGF2aW91cnNFbmFibGVkXCIsIGVuYWJsZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSB3cmFwcGluZyBiZWhhdmlvcnMgYXJlIGN1cnJlbnRseSBlbmFibGVkLlxuICAgICAqKi9cbiAgICBnZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcIndyYXBCZWhhdmlvdXJzRW5hYmxlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgd2hldGhlciB0aGUgZm9sZCB3aWRnZXRzIHNob3VsZCBiZSBzaG93biBvciBub3QuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBmb2xkIHdpZGdldHMgYXJlIHNob3duXG4gICAgICoqL1xuICAgIHNldFNob3dGb2xkV2lkZ2V0cyhzaG93OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2hvd0ZvbGRXaWRnZXRzXCIsIHNob3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBmb2xkIHdpZGdldHMgYXJlIHNob3duLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0U2hvd0ZvbGRXaWRnZXRzKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzaG93Rm9sZFdpZGdldHNcIik7XG4gICAgfVxuXG4gICAgc2V0RmFkZUZvbGRXaWRnZXRzKGZhZGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIiwgZmFkZSk7XG4gICAgfVxuXG4gICAgZ2V0RmFkZUZvbGRXaWRnZXRzKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmYWRlRm9sZFdpZGdldHNcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB3b3JkcyBvZiB0ZXh0IGZyb20gdGhlIGVkaXRvci4gQSBcIndvcmRcIiBpcyBkZWZpbmVkIGFzIGEgc3RyaW5nIG9mIGNoYXJhY3RlcnMgYm9va2VuZGVkIGJ5IHdoaXRlc3BhY2UuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGRpcmVjdGlvbiBUaGUgZGlyZWN0aW9uIG9mIHRoZSBkZWxldGlvbiB0byBvY2N1ciwgZWl0aGVyIFwibGVmdFwiIG9yIFwicmlnaHRcIlxuICAgICAqXG4gICAgICoqL1xuICAgIHJlbW92ZShkaXJlY3Rpb246IHN0cmluZykge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICBpZiAoZGlyZWN0aW9uID09IFwibGVmdFwiKVxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExlZnQoKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RSaWdodCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5nZXRCZWhhdmlvdXJzRW5hYmxlZCgpKSB7XG4gICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgICAgIHZhciBzdGF0ZSA9IHNlc3Npb24uZ2V0U3RhdGUocmFuZ2Uuc3RhcnQucm93KTtcbiAgICAgICAgICAgIHZhciBuZXdfcmFuZ2UgPSBzZXNzaW9uLmdldE1vZGUoKS50cmFuc2Zvcm1BY3Rpb24oc3RhdGUsICdkZWxldGlvbicsIHRoaXMsIHNlc3Npb24sIHJhbmdlKTtcblxuICAgICAgICAgICAgaWYgKHJhbmdlLmVuZC5jb2x1bW4gPT09IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgdGV4dCA9IHNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAodGV4dFt0ZXh0Lmxlbmd0aCAtIDFdID09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUocmFuZ2UuZW5kLnJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmICgvXlxccyskLy50ZXN0KGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gbGluZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobmV3X3JhbmdlKVxuICAgICAgICAgICAgICAgIHJhbmdlID0gbmV3X3JhbmdlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZShyYW5nZSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSB3b3JkIGRpcmVjdGx5IHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIHJlbW92ZVdvcmRSaWdodCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmRSaWdodCgpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIHdvcmQgZGlyZWN0bHkgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqKi9cbiAgICByZW1vdmVXb3JkTGVmdCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmRMZWZ0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIHdvcmRzIHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbiwgdW50aWwgdGhlIHN0YXJ0IG9mIHRoZSBsaW5lLlxuICAgICAqKi9cbiAgICByZW1vdmVUb0xpbmVTdGFydCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExpbmVTdGFydCgpO1xuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUodGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYWxsIHRoZSB3b3JkcyB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCB1bnRpbCB0aGUgZW5kIG9mIHRoZSBsaW5lLlxuICAgICAqKi9cbiAgICByZW1vdmVUb0xpbmVFbmQoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RMaW5lRW5kKCk7XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQuY29sdW1uID09PSByYW5nZS5lbmQuY29sdW1uICYmIHJhbmdlLnN0YXJ0LnJvdyA9PT0gcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IDA7XG4gICAgICAgICAgICByYW5nZS5lbmQucm93Kys7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNwbGl0cyB0aGUgbGluZSBhdCB0aGUgY3VycmVudCBzZWxlY3Rpb24gKGJ5IGluc2VydGluZyBhbiBgJ1xcbidgKS5cbiAgICAgKiovXG4gICAgc3BsaXRMaW5lKCkge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoXCJcXG5cIik7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvUG9zaXRpb24oY3Vyc29yKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUcmFuc3Bvc2VzIGN1cnJlbnQgbGluZS5cbiAgICAgKiovXG4gICAgdHJhbnNwb3NlTGV0dGVycygpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgIHZhciBjb2x1bW4gPSBjdXJzb3IuY29sdW1uO1xuICAgICAgICBpZiAoY29sdW1uID09PSAwKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5zZXNzaW9uLmdldExpbmUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciBzd2FwLCByYW5nZTtcbiAgICAgICAgaWYgKGNvbHVtbiA8IGxpbmUubGVuZ3RoKSB7XG4gICAgICAgICAgICBzd2FwID0gbGluZS5jaGFyQXQoY29sdW1uKSArIGxpbmUuY2hhckF0KGNvbHVtbiAtIDEpO1xuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UoY3Vyc29yLnJvdywgY29sdW1uIC0gMSwgY3Vyc29yLnJvdywgY29sdW1uICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzd2FwID0gbGluZS5jaGFyQXQoY29sdW1uIC0gMSkgKyBsaW5lLmNoYXJBdChjb2x1bW4gLSAyKTtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKGN1cnNvci5yb3csIGNvbHVtbiAtIDIsIGN1cnNvci5yb3csIGNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHN3YXApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBlbnRpcmVseSBpbnRvIGxvd2VyY2FzZS5cbiAgICAgKiovXG4gICAgdG9Mb3dlckNhc2UoKSB7XG4gICAgICAgIHZhciBvcmlnaW5hbFJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZWxlY3RXb3JkKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCB0ZXh0LnRvTG93ZXJDYXNlKCkpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShvcmlnaW5hbFJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0cyB0aGUgY3VycmVudCBzZWxlY3Rpb24gZW50aXJlbHkgaW50byB1cHBlcmNhc2UuXG4gICAgICoqL1xuICAgIHRvVXBwZXJDYXNlKCkge1xuICAgICAgICB2YXIgb3JpZ2luYWxSYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgdGV4dC50b1VwcGVyQ2FzZSgpKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2Uob3JpZ2luYWxSYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5zZXJ0cyBhbiBpbmRlbnRhdGlvbiBpbnRvIHRoZSBjdXJyZW50IGN1cnNvciBwb3NpdGlvbiBvciBpbmRlbnRzIHRoZSBzZWxlY3RlZCBsaW5lcy5cbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmluZGVudFJvd3NcbiAgICAgKiovXG4gICAgaW5kZW50KCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuXG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPCByYW5nZS5lbmQucm93KSB7XG4gICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICAgICAgc2Vzc2lvbi5pbmRlbnRSb3dzKHJvd3MuZmlyc3QsIHJvd3MubGFzdCwgXCJcXHRcIik7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAocmFuZ2Uuc3RhcnQuY29sdW1uIDwgcmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICAgICAgdmFyIHRleHQgPSBzZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoIS9eXFxzKyQvLnRlc3QodGV4dCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKHJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgIHZhciBwb3NpdGlvbiA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgc2l6ZSA9IHNlc3Npb24uZ2V0VGFiU2l6ZSgpO1xuICAgICAgICB2YXIgY29sdW1uID0gc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uKHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uKTtcblxuICAgICAgICBpZiAodGhpcy5zZXNzaW9uLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHZhciBjb3VudCA9IChzaXplIC0gY29sdW1uICUgc2l6ZSk7XG4gICAgICAgICAgICB2YXIgaW5kZW50U3RyaW5nID0gc3RyaW5nUmVwZWF0KFwiIFwiLCBjb3VudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgY291bnQgPSBjb2x1bW4gJSBzaXplO1xuICAgICAgICAgICAgd2hpbGUgKGxpbmVbcmFuZ2Uuc3RhcnQuY29sdW1uXSA9PSBcIiBcIiAmJiBjb3VudCkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbi0tO1xuICAgICAgICAgICAgICAgIGNvdW50LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpbmRlbnRTdHJpbmcgPSBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmluc2VydChpbmRlbnRTdHJpbmcpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGVudHMgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzXG4gICAgICoqL1xuICAgIGJsb2NrSW5kZW50KCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB0aGlzLnNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE91dGRlbnRzIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ub3V0ZGVudFJvd3NcbiAgICAgKiovXG4gICAgYmxvY2tPdXRkZW50KCkge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlc3Npb24ub3V0ZGVudFJvd3Moc2VsZWN0aW9uLmdldFJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IG1vdmUgb3V0IG9mIGNvcmUgd2hlbiB3ZSBoYXZlIGdvb2QgbWVjaGFuaXNtIGZvciBtYW5hZ2luZyBleHRlbnNpb25zXG4gICAgc29ydExpbmVzKCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgbGluZXMgPSBbXTtcbiAgICAgICAgZm9yIChpID0gcm93cy5maXJzdDsgaSA8PSByb3dzLmxhc3Q7IGkrKylcbiAgICAgICAgICAgIGxpbmVzLnB1c2goc2Vzc2lvbi5nZXRMaW5lKGkpKTtcblxuICAgICAgICBsaW5lcy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmIChhLnRvTG93ZXJDYXNlKCkgPCBiLnRvTG93ZXJDYXNlKCkpIHJldHVybiAtMTtcbiAgICAgICAgICAgIGlmIChhLnRvTG93ZXJDYXNlKCkgPiBiLnRvTG93ZXJDYXNlKCkpIHJldHVybiAxO1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBkZWxldGVSYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHJvd3MuZmlyc3Q7IGkgPD0gcm93cy5sYXN0OyBpKyspIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGkpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQucm93ID0gaTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGxpbmUubGVuZ3RoO1xuICAgICAgICAgICAgc2Vzc2lvbi5yZXBsYWNlKGRlbGV0ZVJhbmdlLCBsaW5lc1tpIC0gcm93cy5maXJzdF0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCByYW5nZSwgdGhpcyBmdW5jdGlvbiBlaXRoZXIgY29tbWVudHMgYWxsIHRoZSBsaW5lcywgb3IgdW5jb21tZW50cyBhbGwgb2YgdGhlbS5cbiAgICAgKiovXG4gICAgdG9nZ2xlQ29tbWVudExpbmVzKCkge1xuICAgICAgICB2YXIgc3RhdGUgPSB0aGlzLnNlc3Npb24uZ2V0U3RhdGUodGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpLnJvdyk7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRNb2RlKCkudG9nZ2xlQ29tbWVudExpbmVzKHN0YXRlLCB0aGlzLnNlc3Npb24sIHJvd3MuZmlyc3QsIHJvd3MubGFzdCk7XG4gICAgfVxuXG4gICAgdG9nZ2xlQmxvY2tDb21tZW50KCkge1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB2YXIgc3RhdGUgPSB0aGlzLnNlc3Npb24uZ2V0U3RhdGUoY3Vyc29yLnJvdyk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmdldE1vZGUoKS50b2dnbGVCbG9ja0NvbW1lbnQoc3RhdGUsIHRoaXMuc2Vzc2lvbiwgcmFuZ2UsIGN1cnNvcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogV29ya3MgbGlrZSBbW0VkaXRTZXNzaW9uLmdldFRva2VuQXRdXSwgZXhjZXB0IGl0IHJldHVybnMgYSBudW1iZXIuXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiovXG4gICAgZ2V0TnVtYmVyQXQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHZhciBfbnVtYmVyUnggPSAvW1xcLV0/WzAtOV0rKD86XFwuWzAtOV0rKT8vZztcbiAgICAgICAgX251bWJlclJ4Lmxhc3RJbmRleCA9IDA7XG5cbiAgICAgICAgdmFyIHMgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3cpO1xuICAgICAgICB3aGlsZSAoX251bWJlclJ4Lmxhc3RJbmRleCA8IGNvbHVtbikge1xuICAgICAgICAgICAgdmFyIG0gPSBfbnVtYmVyUnguZXhlYyhzKTtcbiAgICAgICAgICAgIGlmIChtLmluZGV4IDw9IGNvbHVtbiAmJiBtLmluZGV4ICsgbVswXS5sZW5ndGggPj0gY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgdmFyIG51bWJlciA9IHtcbiAgICAgICAgICAgICAgICAgICAgdmFsdWU6IG1bMF0sXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0OiBtLmluZGV4LFxuICAgICAgICAgICAgICAgICAgICBlbmQ6IG0uaW5kZXggKyBtWzBdLmxlbmd0aFxuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bWJlcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiB0aGUgY2hhcmFjdGVyIGJlZm9yZSB0aGUgY3Vyc29yIGlzIGEgbnVtYmVyLCB0aGlzIGZ1bmN0aW9ucyBjaGFuZ2VzIGl0cyB2YWx1ZSBieSBgYW1vdW50YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gYW1vdW50IFRoZSB2YWx1ZSB0byBjaGFuZ2UgdGhlIG51bWVyYWwgYnkgKGNhbiBiZSBuZWdhdGl2ZSB0byBkZWNyZWFzZSB2YWx1ZSlcbiAgICAgKi9cbiAgICBtb2RpZnlOdW1iZXIoYW1vdW50KSB7XG4gICAgICAgIHZhciByb3cgPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5yb3c7XG4gICAgICAgIHZhciBjb2x1bW4gPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5jb2x1bW47XG5cbiAgICAgICAgLy8gZ2V0IHRoZSBjaGFyIGJlZm9yZSB0aGUgY3Vyc29yXG4gICAgICAgIHZhciBjaGFyUmFuZ2UgPSBuZXcgUmFuZ2Uocm93LCBjb2x1bW4gLSAxLCByb3csIGNvbHVtbik7XG5cbiAgICAgICAgdmFyIGMgPSBwYXJzZUZsb2F0KHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UoY2hhclJhbmdlKSk7XG4gICAgICAgIC8vIGlmIHRoZSBjaGFyIGlzIGEgZGlnaXRcbiAgICAgICAgaWYgKCFpc05hTihjKSAmJiBpc0Zpbml0ZShjKSkge1xuICAgICAgICAgICAgLy8gZ2V0IHRoZSB3aG9sZSBudW1iZXIgdGhlIGRpZ2l0IGlzIHBhcnQgb2ZcbiAgICAgICAgICAgIHZhciBuciA9IHRoaXMuZ2V0TnVtYmVyQXQocm93LCBjb2x1bW4pO1xuICAgICAgICAgICAgLy8gaWYgbnVtYmVyIGZvdW5kXG4gICAgICAgICAgICBpZiAobnIpIHtcbiAgICAgICAgICAgICAgICB2YXIgZnAgPSBuci52YWx1ZS5pbmRleE9mKFwiLlwiKSA+PSAwID8gbnIuc3RhcnQgKyBuci52YWx1ZS5pbmRleE9mKFwiLlwiKSArIDEgOiBuci5lbmQ7XG4gICAgICAgICAgICAgICAgdmFyIGRlY2ltYWxzID0gbnIuc3RhcnQgKyBuci52YWx1ZS5sZW5ndGggLSBmcDtcblxuICAgICAgICAgICAgICAgIHZhciB0ID0gcGFyc2VGbG9hdChuci52YWx1ZSk7XG4gICAgICAgICAgICAgICAgdCAqPSBNYXRoLnBvdygxMCwgZGVjaW1hbHMpO1xuXG5cbiAgICAgICAgICAgICAgICBpZiAoZnAgIT09IG5yLmVuZCAmJiBjb2x1bW4gPCBmcCkge1xuICAgICAgICAgICAgICAgICAgICBhbW91bnQgKj0gTWF0aC5wb3coMTAsIG5yLmVuZCAtIGNvbHVtbiAtIDEpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGFtb3VudCAqPSBNYXRoLnBvdygxMCwgbnIuZW5kIC0gY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0ICs9IGFtb3VudDtcbiAgICAgICAgICAgICAgICB0IC89IE1hdGgucG93KDEwLCBkZWNpbWFscyk7XG4gICAgICAgICAgICAgICAgdmFyIG5uciA9IHQudG9GaXhlZChkZWNpbWFscyk7XG5cbiAgICAgICAgICAgICAgICAvL3VwZGF0ZSBudW1iZXJcbiAgICAgICAgICAgICAgICB2YXIgcmVwbGFjZVJhbmdlID0gbmV3IFJhbmdlKHJvdywgbnIuc3RhcnQsIHJvdywgbnIuZW5kKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyZXBsYWNlUmFuZ2UsIG5ucik7XG5cbiAgICAgICAgICAgICAgICAvL3JlcG9zaXRpb24gdGhlIGN1cnNvclxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgTWF0aC5tYXgobnIuc3RhcnQgKyAxLCBjb2x1bW4gKyBubnIubGVuZ3RoIC0gbnIudmFsdWUubGVuZ3RoKSk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgY3VycmVudCBzZWxlY3Rpb25cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5yZW1vdmVcbiAgICAgKiovXG4gICAgcmVtb3ZlTGluZXMoKSB7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHZhciByYW5nZTtcbiAgICAgICAgaWYgKHJvd3MuZmlyc3QgPT09IDAgfHwgcm93cy5sYXN0ICsgMSA8IHRoaXMuc2Vzc2lvbi5nZXRMZW5ndGgoKSlcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKHJvd3MuZmlyc3QsIDAsIHJvd3MubGFzdCArIDEsIDApO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShcbiAgICAgICAgICAgICAgICByb3dzLmZpcnN0IC0gMSwgdGhpcy5zZXNzaW9uLmdldExpbmUocm93cy5maXJzdCAtIDEpLmxlbmd0aCxcbiAgICAgICAgICAgICAgICByb3dzLmxhc3QsIHRoaXMuc2Vzc2lvbi5nZXRMaW5lKHJvd3MubGFzdCkubGVuZ3RoXG4gICAgICAgICAgICApO1xuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIGR1cGxpY2F0ZVNlbGVjdGlvbigpIHtcbiAgICAgICAgdmFyIHNlbCA9IHRoaXMuc2VsZWN0aW9uO1xuICAgICAgICB2YXIgZG9jID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgcmFuZ2UgPSBzZWwuZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIHJldmVyc2UgPSBzZWwuaXNCYWNrd2FyZHMoKTtcbiAgICAgICAgaWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGRvYy5kdXBsaWNhdGVMaW5lcyhyb3csIHJvdyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcG9pbnQgPSByZXZlcnNlID8gcmFuZ2Uuc3RhcnQgOiByYW5nZS5lbmQ7XG4gICAgICAgICAgICB2YXIgZW5kUG9pbnQgPSBkb2MuaW5zZXJ0KHBvaW50LCBkb2MuZ2V0VGV4dFJhbmdlKHJhbmdlKSk7XG4gICAgICAgICAgICByYW5nZS5zdGFydCA9IHBvaW50O1xuICAgICAgICAgICAgcmFuZ2UuZW5kID0gZW5kUG9pbnQ7XG5cbiAgICAgICAgICAgIHNlbC5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSwgcmV2ZXJzZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyBkb3duIG9uZSByb3cuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSBPbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVMaW5lc1VwXG4gICAgICoqL1xuICAgIG1vdmVMaW5lc0Rvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlTGluZXNEb3duKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgdXAgb25lIHJvdy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSBPbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVMaW5lc0Rvd25cbiAgICAgKiovXG4gICAgbW92ZUxpbmVzVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlTGluZXNVcChmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIGEgcmFuZ2Ugb2YgdGV4dCBmcm9tIHRoZSBnaXZlbiByYW5nZSB0byB0aGUgZ2l2ZW4gcG9zaXRpb24uIGB0b1Bvc2l0aW9uYCBpcyBhbiBvYmplY3QgdGhhdCBsb29rcyBsaWtlIHRoaXM6XG4gICAgICogYGBganNvblxuICAgICAqICAgIHsgcm93OiBuZXdSb3dMb2NhdGlvbiwgY29sdW1uOiBuZXdDb2x1bW5Mb2NhdGlvbiB9XG4gICAgICogYGBgXG4gICAgICogQHBhcmFtIHtSYW5nZX0gZnJvbVJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHlvdSB3YW50IG1vdmVkIHdpdGhpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UmFuZ2V9IFRoZSBuZXcgcmFuZ2Ugd2hlcmUgdGhlIHRleHQgd2FzIG1vdmVkIHRvLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLm1vdmVUZXh0XG4gICAgICoqL1xuICAgIG1vdmVUZXh0KHJhbmdlLCB0b1Bvc2l0aW9uLCBjb3B5KSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24ubW92ZVRleHQocmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvcGllcyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIHVwIG9uZSByb3cuXG4gICAgICogQHJldHVybnMge051bWJlcn0gT24gc3VjY2VzcywgcmV0dXJucyAwLlxuICAgICAqXG4gICAgICoqL1xuICAgIGNvcHlMaW5lc1VwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlTGluZXMoZnVuY3Rpb24oZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgZG93biBvbmUgcm93LlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIHJldHVybnMgdGhlIG51bWJlciBvZiBuZXcgcm93cyBhZGRlZDsgaW4gb3RoZXIgd29yZHMsIGBsYXN0Um93IC0gZmlyc3RSb3cgKyAxYC5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kdXBsaWNhdGVMaW5lc1xuICAgICAqXG4gICAgICoqL1xuICAgIGNvcHlMaW5lc0Rvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4ZWN1dGVzIGEgc3BlY2lmaWMgZnVuY3Rpb24sIHdoaWNoIGNhbiBiZSBhbnl0aGluZyB0aGF0IG1hbmlwdWxhdGVzIHNlbGVjdGVkIGxpbmVzLCBzdWNoIGFzIGNvcHlpbmcgdGhlbSwgZHVwbGljYXRpbmcgdGhlbSwgb3Igc2hpZnRpbmcgdGhlbS5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBtb3ZlciBBIG1ldGhvZCB0byBjYWxsIG9uIGVhY2ggc2VsZWN0ZWQgcm93XG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICAkbW92ZUxpbmVzKG1vdmVyKSB7XG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbjtcbiAgICAgICAgaWYgKCFzZWxlY3Rpb25bJ2luTXVsdGlTZWxlY3RNb2RlJ10gfHwgdGhpcy5pblZpcnR1YWxTZWxlY3Rpb25Nb2RlKSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBzZWxlY3Rpb24udG9PcmllbnRlZFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgc2VsZWN0ZWRSb3dzOiB7IGZpcnN0OiBudW1iZXI7IGxhc3Q6IG51bWJlciB9ID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgICAgICB2YXIgbGluZXNNb3ZlZCA9IG1vdmVyLmNhbGwodGhpcywgc2VsZWN0ZWRSb3dzLmZpcnN0LCBzZWxlY3RlZFJvd3MubGFzdCk7XG4gICAgICAgICAgICByYW5nZS5tb3ZlQnkobGluZXNNb3ZlZCwgMCk7XG4gICAgICAgICAgICBzZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2UocmFuZ2UpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHJhbmdlcyA9IHNlbGVjdGlvbi5yYW5nZUxpc3QucmFuZ2VzO1xuICAgICAgICAgICAgc2VsZWN0aW9uLnJhbmdlTGlzdC5kZXRhY2goKTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IHJhbmdlcy5sZW5ndGg7IGktLTspIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2VJbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgdmFyIGNvbGxhcHNlZFJvd3MgPSByYW5nZXNbaV0uY29sbGFwc2VSb3dzKCk7XG4gICAgICAgICAgICAgICAgdmFyIGxhc3QgPSBjb2xsYXBzZWRSb3dzLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIGZpcnN0ID0gY29sbGFwc2VkUm93cy5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgd2hpbGUgKGktLSkge1xuICAgICAgICAgICAgICAgICAgICBjb2xsYXBzZWRSb3dzID0gcmFuZ2VzW2ldLmNvbGxhcHNlUm93cygpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZmlyc3QgLSBjb2xsYXBzZWRSb3dzLmVuZC5yb3cgPD0gMSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGZpcnN0ID0gY29sbGFwc2VkUm93cy5lbmQucm93O1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaSsrO1xuXG4gICAgICAgICAgICAgICAgdmFyIGxpbmVzTW92ZWQgPSBtb3Zlci5jYWxsKHRoaXMsIGZpcnN0LCBsYXN0KTtcbiAgICAgICAgICAgICAgICB3aGlsZSAocmFuZ2VJbmRleCA+PSBpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlc1tyYW5nZUluZGV4XS5tb3ZlQnkobGluZXNNb3ZlZCwgMCk7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlSW5kZXgtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBzZWxlY3Rpb24uZnJvbU9yaWVudGVkUmFuZ2Uoc2VsZWN0aW9uLnJhbmdlc1swXSk7XG4gICAgICAgICAgICBzZWxlY3Rpb24ucmFuZ2VMaXN0LmF0dGFjaCh0aGlzLnNlc3Npb24pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBvYmplY3QgaW5kaWNhdGluZyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIHJvd3MuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAgICAqKi9cbiAgICAkZ2V0U2VsZWN0ZWRSb3dzKCk6IHsgZmlyc3Q6IG51bWJlcjsgbGFzdDogbnVtYmVyIH0ge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuY29sbGFwc2VSb3dzKCk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGZpcnN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0KHJhbmdlLnN0YXJ0LnJvdyksXG4gICAgICAgICAgICBsYXN0OiB0aGlzLnNlc3Npb24uZ2V0Um93Rm9sZEVuZChyYW5nZS5lbmQucm93KVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25TdGFydCh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2hvd0NvbXBvc2l0aW9uKHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKSk7XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvblVwZGF0ZSh0ZXh0Pzogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0Q29tcG9zaXRpb25UZXh0KHRleHQpO1xuICAgIH1cblxuICAgIG9uQ29tcG9zaXRpb25FbmQoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuaGlkZUNvbXBvc2l0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93fVxuICAgICAqXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuZ2V0Rmlyc3RWaXNpYmxlUm93XG4gICAgICoqL1xuICAgIGdldEZpcnN0VmlzaWJsZVJvdygpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5nZXRMYXN0VmlzaWJsZVJvd31cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93XG4gICAgICoqL1xuICAgIGdldExhc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kaWNhdGVzIGlmIHRoZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc1Jvd1Zpc2libGUocm93OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChyb3cgPj0gdGhpcy5nZXRGaXJzdFZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5nZXRMYXN0VmlzaWJsZVJvdygpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgaWYgdGhlIGVudGlyZSByb3cgaXMgY3VycmVudGx5IHZpc2libGUgb24gdGhlIHNjcmVlbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gY2hlY2tcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGlzUm93RnVsbHlWaXNpYmxlKHJvdzogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAocm93ID49IHRoaXMucmVuZGVyZXIuZ2V0Rmlyc3RGdWxseVZpc2libGVSb3coKSAmJiByb3cgPD0gdGhpcy5yZW5kZXJlci5nZXRMYXN0RnVsbHlWaXNpYmxlUm93KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG51bWJlciBvZiBjdXJyZW50bHkgdmlzaWJpbGUgcm93cy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICAkZ2V0VmlzaWJsZVJvd0NvdW50KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNjcm9sbEJvdHRvbVJvdygpIC0gdGhpcy5yZW5kZXJlci5nZXRTY3JvbGxUb3BSb3coKSArIDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRklYTUU6IFRoZSBzZW1hbnRpY3Mgb2Ygc2VsZWN0IGFyZSBub3QgZWFzaWx5IHVuZGVyc3Rvb2QuIFxuICAgICAqIEBwYXJhbSBkaXJlY3Rpb24gKzEgZm9yIHBhZ2UgZG93biwgLTEgZm9yIHBhZ2UgdXAuIE1heWJlIE4gZm9yIE4gcGFnZXM/XG4gICAgICogQHBhcmFtIHNlbGVjdCB0cnVlIHwgZmFsc2UgfCB1bmRlZmluZWRcbiAgICAgKi9cbiAgICAkbW92ZUJ5UGFnZShkaXJlY3Rpb246IG51bWJlciwgc2VsZWN0PzogYm9vbGVhbikge1xuICAgICAgICB2YXIgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVyO1xuICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5yZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgdmFyIHJvd3MgPSBkaXJlY3Rpb24gKiBNYXRoLmZsb29yKGNvbmZpZy5oZWlnaHQgLyBjb25maWcubGluZUhlaWdodCk7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcrKztcbiAgICAgICAgaWYgKHNlbGVjdCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uJG1vdmVTZWxlY3Rpb24oZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yQnkocm93cywgMCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzZWxlY3QgPT09IGZhbHNlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkocm93cywgMCk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG5cbiAgICAgICAgdmFyIHNjcm9sbFRvcCA9IHJlbmRlcmVyLnNjcm9sbFRvcDtcblxuICAgICAgICByZW5kZXJlci5zY3JvbGxCeSgwLCByb3dzICogY29uZmlnLmxpbmVIZWlnaHQpO1xuICAgICAgICAvLyBXaHkgZG9uJ3Qgd2UgYXNzZXJ0IG91ciBhcmdzIGFuZCBkbyB0eXBlb2Ygc2VsZWN0ID09PSAndW5kZWZpbmVkJz9cbiAgICAgICAgaWYgKHNlbGVjdCAhPSBudWxsKSB7XG4gICAgICAgICAgICAvLyBUaGlzIGlzIGNhbGxlZCB3aGVuIHNlbGVjdCBpcyB1bmRlZmluZWQuXG4gICAgICAgICAgICByZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyhudWxsLCAwLjUpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVuZGVyZXIuYW5pbWF0ZVNjcm9sbGluZyhzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgdGhlIHRleHQgZnJvbSB0aGUgY3VycmVudCBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgdW50aWwgd2hlcmUgYSBcInBhZ2UgZG93blwiIGZpbmlzaGVzLlxuICAgICAqKi9cbiAgICBzZWxlY3RQYWdlRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgrMSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyB0aGUgdGV4dCBmcm9tIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCB1bnRpbCB3aGVyZSBhIFwicGFnZSB1cFwiIGZpbmlzaGVzLlxuICAgICAqKi9cbiAgICBzZWxlY3RQYWdlVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoLTEsIHRydWUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIGRvd25cIiBpcywgYXMgd2VsbCBhcyBtb3ZpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgZ290b1BhZ2VEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKCsxLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgdXBcIiBpcywgYXMgd2VsbCBhcyBtb3ZpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgZ290b1BhZ2VVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgtMSwgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSBkb3duXCIgaXMsIHdpdGhvdXQgY2hhbmdpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgc2Nyb2xsUGFnZURvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIHVwXCIgaXMsIHdpdGhvdXQgY2hhbmdpbmcgdGhlIGN1cnNvciBwb3NpdGlvbi5cbiAgICAgKiovXG4gICAgc2Nyb2xsUGFnZVVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKC0xKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgZWRpdG9yIHRvIHRoZSBzcGVjaWZpZWQgcm93LlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb1Jvd1xuICAgICAqL1xuICAgIHNjcm9sbFRvUm93KHJvdzogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9Sb3cocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRvIGEgbGluZS4gSWYgYGNlbnRlcmAgaXMgYHRydWVgLCBpdCBwdXRzIHRoZSBsaW5lIGluIG1pZGRsZSBvZiBzY3JlZW4gKG9yIGF0dGVtcHRzIHRvKS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbGluZSBUaGUgbGluZSB0byBzY3JvbGwgdG9cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGNlbnRlciBJZiBgdHJ1ZWBcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGVzIHNjcm9sbGluZ1xuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCB3aGVuIHRoZSBhbmltYXRpb24gaGFzIGZpbmlzaGVkXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5zY3JvbGxUb0xpbmVcbiAgICAgKiovXG4gICAgc2Nyb2xsVG9MaW5lKGxpbmU6IG51bWJlciwgY2VudGVyOiBib29sZWFuLCBhbmltYXRlOiBib29sZWFuLCBjYWxsYmFjaz8pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb0xpbmUobGluZSwgY2VudGVyLCBhbmltYXRlLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQXR0ZW1wdHMgdG8gY2VudGVyIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBvbiB0aGUgc2NyZWVuLlxuICAgICAqKi9cbiAgICBjZW50ZXJTZWxlY3Rpb24oKSB7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHBvcyA9IHtcbiAgICAgICAgICAgIHJvdzogTWF0aC5mbG9vcihyYW5nZS5zdGFydC5yb3cgKyAocmFuZ2UuZW5kLnJvdyAtIHJhbmdlLnN0YXJ0LnJvdykgLyAyKSxcbiAgICAgICAgICAgIGNvbHVtbjogTWF0aC5mbG9vcihyYW5nZS5zdGFydC5jb2x1bW4gKyAocmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbikgLyAyKVxuICAgICAgICB9O1xuICAgICAgICB0aGlzLnJlbmRlcmVyLmFsaWduQ3Vyc29yKHBvcywgMC41KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IuXG4gICAgICogQHJldHVybnMge09iamVjdH0gQW4gb2JqZWN0IHRoYXQgbG9va3Mgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgICAgKlxuICAgICAqIGBgYGpzb25cbiAgICAgKiB7IHJvdzogY3VyclJvdywgY29sdW1uOiBjdXJyQ29sIH1cbiAgICAgKiBgYGBcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5nZXRDdXJzb3JcbiAgICAgKiovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb24oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBzY3JlZW4gcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAgKiovXG4gICAgZ2V0Q3Vyc29yUG9zaXRpb25TY3JlZW4oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBjdXJzb3IgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKClcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWxlY3Rpb24uZ2V0UmFuZ2V9XG4gICAgICogQHJldHVybnMge1JhbmdlfVxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5nZXRSYW5nZVxuICAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25SYW5nZSgpOiBSYW5nZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgYWxsIHRoZSB0ZXh0IGluIGVkaXRvci5cbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24uc2VsZWN0QWxsXG4gICAgICoqL1xuICAgIHNlbGVjdEFsbCgpIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0QWxsKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb259XG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uXG4gICAgICoqL1xuICAgIGNsZWFyU2VsZWN0aW9uKCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNwZWNpZmllZCByb3cgYW5kIGNvbHVtbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBub3QgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBuZXcgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIG5ldyBjb2x1bW4gbnVtYmVyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBhbmltYXRlXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24ubW92ZUN1cnNvclRvXG4gICAgICoqL1xuICAgIG1vdmVDdXJzb3JUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGFuaW1hdGU/OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgcG9zaXRpb24gaW5kaWNhdGVkIGJ5IGBwb3Mucm93YCBhbmQgYHBvcy5jb2x1bW5gLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgQW4gb2JqZWN0IHdpdGggdHdvIHByb3BlcnRpZXMsIHJvdyBhbmQgY29sdW1uXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9Qb3NpdGlvblxuICAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3MpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yJ3Mgcm93IGFuZCBjb2x1bW4gdG8gdGhlIG5leHQgbWF0Y2hpbmcgYnJhY2tldCBvciBIVE1MIHRhZy5cbiAgICAgKlxuICAgICAqKi9cbiAgICBqdW1wVG9NYXRjaGluZyhzZWxlY3QpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcy5zZXNzaW9uLCBjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdmFyIHByZXZUb2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICB2YXIgdG9rZW4gPSBwcmV2VG9rZW47XG5cbiAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcblxuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vZ2V0IG5leHQgY2xvc2luZyB0YWcgb3IgYnJhY2tldFxuICAgICAgICB2YXIgbWF0Y2hUeXBlO1xuICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGRlcHRoID0ge307XG4gICAgICAgIHZhciBpID0gY3Vyc29yLmNvbHVtbiAtIHRva2VuLnN0YXJ0O1xuICAgICAgICB2YXIgYnJhY2tldFR5cGU7XG4gICAgICAgIHZhciBicmFja2V0cyA9IHtcbiAgICAgICAgICAgIFwiKVwiOiBcIihcIixcbiAgICAgICAgICAgIFwiKFwiOiBcIihcIixcbiAgICAgICAgICAgIFwiXVwiOiBcIltcIixcbiAgICAgICAgICAgIFwiW1wiOiBcIltcIixcbiAgICAgICAgICAgIFwie1wiOiBcIntcIixcbiAgICAgICAgICAgIFwifVwiOiBcIntcIlxuICAgICAgICB9O1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGlmICh0b2tlbi52YWx1ZS5tYXRjaCgvW3t9KClcXFtcXF1dL2cpKSB7XG4gICAgICAgICAgICAgICAgZm9yICg7IGkgPCB0b2tlbi52YWx1ZS5sZW5ndGggJiYgIWZvdW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFicmFja2V0c1t0b2tlbi52YWx1ZVtpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYnJhY2tldFR5cGUgPSBicmFja2V0c1t0b2tlbi52YWx1ZVtpXV0gKyAnLicgKyB0b2tlbi50eXBlLnJlcGxhY2UoXCJycGFyZW5cIiwgXCJscGFyZW5cIik7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzTmFOKGRlcHRoW2JyYWNrZXRUeXBlXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW2JyYWNrZXRUeXBlXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHRva2VuLnZhbHVlW2ldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICcoJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1snOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAneyc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICcpJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ10nOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnfSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdLS07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGhbYnJhY2tldFR5cGVdID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaFR5cGUgPSAnYnJhY2tldCc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNOYU4oZGVwdGhbdG9rZW4udmFsdWVdKSkge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0gPSAwO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0rKztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0tLTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZGVwdGhbdG9rZW4udmFsdWVdID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaFR5cGUgPSAndGFnJztcbiAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IHRva2VuO1xuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgICAgICBpID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgIWZvdW5kKTtcblxuICAgICAgICAvL25vIG1hdGNoIGZvdW5kXG4gICAgICAgIGlmICghbWF0Y2hUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICBpZiAobWF0Y2hUeXBlID09PSAnYnJhY2tldCcpIHtcbiAgICAgICAgICAgIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldEJyYWNrZXRSYW5nZShjdXJzb3IpO1xuICAgICAgICAgICAgaWYgKCFyYW5nZSkge1xuICAgICAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyBpIC0gMSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCksXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgaSAtIDFcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy5yb3cgPT09IGN1cnNvci5yb3cgJiYgTWF0aC5hYnMocG9zLmNvbHVtbiAtIGN1cnNvci5jb2x1bW4pIDwgMilcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0QnJhY2tldFJhbmdlKHBvcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAobWF0Y2hUeXBlID09PSAndGFnJykge1xuICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpXG4gICAgICAgICAgICAgICAgdmFyIHRhZyA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpIC0gMixcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSAtIDJcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vZmluZCBtYXRjaGluZyB0YWdcbiAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pID09PSAwKSB7XG4gICAgICAgICAgICAgICAgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gcHJldlRva2VuO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnR5cGUuaW5kZXhPZigndGFnLWNsb3NlJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLCBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW3RhZ10rKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFt0YWddLS07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlcHRoW3RhZ10gPT09IDApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHByZXZUb2tlbiAmJiAhZm91bmQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3dlIGZvdW5kIGl0XG4gICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChwb3Mucm93ID09IGN1cnNvci5yb3cgJiYgTWF0aC5hYnMocG9zLmNvbHVtbiAtIGN1cnNvci5jb2x1bW4pIDwgMilcbiAgICAgICAgICAgICAgICAgICAgcG9zID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcG9zID0gcmFuZ2UgJiYgcmFuZ2VbJ2N1cnNvciddIHx8IHBvcztcbiAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgaWYgKHNlbGVjdCkge1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5pc0VxdWFsKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSkpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFRvKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzcGVjaWZpZWQgbGluZSBudW1iZXIsIGFuZCBhbHNvIGludG8gdGhlIGluZGljaWF0ZWQgY29sdW1uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lTnVtYmVyIFRoZSBsaW5lIG51bWJlciB0byBnbyB0b1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gQSBjb2x1bW4gbnVtYmVyIHRvIGdvIHRvXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY29sbGluZ1xuICAgICAqKi9cbiAgICBnb3RvTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbj86IG51bWJlciwgYW5pbWF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnVuZm9sZCh7IHJvdzogbGluZU51bWJlciAtIDEsIGNvbHVtbjogY29sdW1uIHx8IDAgfSk7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgLy8gdG9kbzogZmluZCBhIHdheSB0byBhdXRvbWF0aWNhbGx5IGV4aXQgbXVsdGlzZWxlY3QgbW9kZVxuICAgICAgICB0aGlzLmV4aXRNdWx0aVNlbGVjdE1vZGUgJiYgdGhpcy5leGl0TXVsdGlTZWxlY3RNb2RlKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxpbmVOdW1iZXIgLSAxLCBjb2x1bW4gfHwgMCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgaWYgKCF0aGlzLmlzUm93RnVsbHlWaXNpYmxlKGxpbmVOdW1iZXIgLSAxKSkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxUb0xpbmUobGluZU51bWJlciAtIDEsIHRydWUsIGFuaW1hdGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3BlY2lmaWVkIHJvdyBhbmQgY29sdW1uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgbmV3IHJvdyBudW1iZXJcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBuZXcgY29sdW1uIG51bWJlclxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0b3IubW92ZUN1cnNvclRvXG4gICAgICoqL1xuICAgIG5hdmlnYXRlVG8ocm93LCBjb2x1bW4pIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHVwIGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVVwKHRpbWVzKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc011bHRpTGluZSgpICYmICF0aGlzLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uU3RhcnQgPSB0aGlzLnNlbGVjdGlvbi5hbmNob3IuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvblN0YXJ0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkoLXRpbWVzIHx8IC0xLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGRvd24gaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRG93bih0aW1lcykge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSAmJiB0aGlzLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gdGhpcy5zZWxlY3Rpb24uYW5jaG9yLmdldFBvc2l0aW9uKCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25FbmQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JCeSh0aW1lcyB8fCAxLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGxlZnQgaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGVmdCh0aW1lcykge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpLnN0YXJ0O1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25TdGFydCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aW1lcyA9IHRpbWVzIHx8IDE7XG4gICAgICAgICAgICB3aGlsZSAodGltZXMtLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JMZWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgcmlnaHQgaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlUmlnaHQodGltZXMpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbmQgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuZW5kO1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25FbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGltZXMgPSB0aW1lcyB8fCAxO1xuICAgICAgICAgICAgd2hpbGUgKHRpbWVzLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBsaW5lLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGluZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZVN0YXJ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCBsaW5lLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGluZUVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVFbmQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGZpbGUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVGaWxlRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBmaWxlLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRmlsZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZVN0YXJ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgaW1tZWRpYXRlbHkgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50IHBvc2l0aW9uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlV29yZFJpZ2h0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZFJpZ2h0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgaW1tZWRpYXRlbHkgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgcG9zaXRpb24uIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVXb3JkTGVmdCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvcldvcmRMZWZ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyB0aGUgZmlyc3Qgb2NjdXJhbmNlIG9mIGBvcHRpb25zLm5lZWRsZWAgd2l0aCB0aGUgdmFsdWUgaW4gYHJlcGxhY2VtZW50YC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gcmVwbGFjZW1lbnQgVGhlIHRleHQgdG8gcmVwbGFjZSB3aXRoXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgVGhlIFtbU2VhcmNoIGBTZWFyY2hgXV0gb3B0aW9ucyB0byB1c2VcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHJlcGxhY2UocmVwbGFjZW1lbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMpXG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHNlYXJjaC5maW5kKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IDA7XG4gICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG5cbiAgICAgICAgaWYgKHRoaXMuJHRyeVJlcGxhY2UocmFuZ2UsIHJlcGxhY2VtZW50KSkge1xuICAgICAgICAgICAgcmVwbGFjZWQgPSAxO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyYW5nZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXBsYWNlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyBhbGwgb2NjdXJhbmNlcyBvZiBgb3B0aW9ucy5uZWVkbGVgIHdpdGggdGhlIHZhbHVlIGluIGByZXBsYWNlbWVudGAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHJlcGxhY2VtZW50IFRoZSB0ZXh0IHRvIHJlcGxhY2Ugd2l0aFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBbW1NlYXJjaCBgU2VhcmNoYF1dIG9wdGlvbnMgdG8gdXNlXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICByZXBsYWNlQWxsKHJlcGxhY2VtZW50LCBvcHRpb25zKSB7XG4gICAgICAgIGlmIChvcHRpb25zKSB7XG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlcyA9IHRoaXMuJHNlYXJjaC5maW5kQWxsKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IDA7XG4gICAgICAgIGlmICghcmFuZ2VzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybiByZXBsYWNlZDtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuXG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbygwLCAwKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gcmFuZ2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdHJ5UmVwbGFjZShyYW5nZXNbaV0sIHJlcGxhY2VtZW50KSkge1xuICAgICAgICAgICAgICAgIHJlcGxhY2VkKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShzZWxlY3Rpb24pO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgIHJldHVybiByZXBsYWNlZDtcbiAgICB9XG5cbiAgICAkdHJ5UmVwbGFjZShyYW5nZSwgcmVwbGFjZW1lbnQpIHtcbiAgICAgICAgdmFyIGlucHV0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHJlcGxhY2VtZW50ID0gdGhpcy4kc2VhcmNoLnJlcGxhY2UoaW5wdXQsIHJlcGxhY2VtZW50KTtcbiAgICAgICAgaWYgKHJlcGxhY2VtZW50ICE9PSBudWxsKSB7XG4gICAgICAgICAgICByYW5nZS5lbmQgPSB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgcmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlNlYXJjaC5nZXRPcHRpb25zfSBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBgb3B0aW9uc2AsIHNlZSBbW1NlYXJjaCBgU2VhcmNoYF1dLlxuICAgICAqIEByZWxhdGVkIFNlYXJjaC5nZXRPcHRpb25zXG4gICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAgKiovXG4gICAgZ2V0TGFzdFNlYXJjaE9wdGlvbnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzZWFyY2guZ2V0T3B0aW9ucygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEF0dGVtcHRzIHRvIGZpbmQgYG5lZWRsZWAgd2l0aGluIHRoZSBkb2N1bWVudC4gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbmVlZGxlIFRoZSB0ZXh0IHRvIHNlYXJjaCBmb3IgKG9wdGlvbmFsKVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIEFuIG9iamVjdCBkZWZpbmluZyB2YXJpb3VzIHNlYXJjaCBwcm9wZXJ0aWVzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlIHNjcm9sbGluZ1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBTZWFyY2guZmluZFxuICAgICAqKi9cbiAgICBmaW5kKG5lZWRsZTogKHN0cmluZyB8IFJlZ0V4cCksIG9wdGlvbnMsIGFuaW1hdGUpIHtcbiAgICAgICAgaWYgKCFvcHRpb25zKVxuICAgICAgICAgICAgb3B0aW9ucyA9IHt9O1xuXG4gICAgICAgIGlmICh0eXBlb2YgbmVlZGxlID09IFwic3RyaW5nXCIgfHwgbmVlZGxlIGluc3RhbmNlb2YgUmVnRXhwKVxuICAgICAgICAgICAgb3B0aW9ucy5uZWVkbGUgPSBuZWVkbGU7XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBuZWVkbGUgPT0gXCJvYmplY3RcIilcbiAgICAgICAgICAgIG1peGluKG9wdGlvbnMsIG5lZWRsZSk7XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgaWYgKG9wdGlvbnMubmVlZGxlID09IG51bGwpIHtcbiAgICAgICAgICAgIG5lZWRsZSA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpXG4gICAgICAgICAgICAgICAgfHwgdGhpcy4kc2VhcmNoLiRvcHRpb25zLm5lZWRsZTtcbiAgICAgICAgICAgIGlmICghbmVlZGxlKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLnNlc3Npb24uZ2V0V29yZFJhbmdlKHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICBuZWVkbGUgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaC5zZXQoeyBuZWVkbGU6IG5lZWRsZSB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJHNlYXJjaC5zZXQob3B0aW9ucyk7XG4gICAgICAgIGlmICghb3B0aW9ucy5zdGFydClcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaC5zZXQoeyBzdGFydDogcmFuZ2UgfSk7XG5cbiAgICAgICAgdmFyIG5ld1JhbmdlID0gdGhpcy4kc2VhcmNoLmZpbmQodGhpcy5zZXNzaW9uKTtcbiAgICAgICAgaWYgKG9wdGlvbnMucHJldmVudFNjcm9sbClcbiAgICAgICAgICAgIHJldHVybiBuZXdSYW5nZTtcbiAgICAgICAgaWYgKG5ld1JhbmdlKSB7XG4gICAgICAgICAgICB0aGlzLnJldmVhbFJhbmdlKG5ld1JhbmdlLCBhbmltYXRlKTtcbiAgICAgICAgICAgIHJldHVybiBuZXdSYW5nZTtcbiAgICAgICAgfVxuICAgICAgICAvLyBjbGVhciBzZWxlY3Rpb24gaWYgbm90aGluZyBpcyBmb3VuZFxuICAgICAgICBpZiAob3B0aW9ucy5iYWNrd2FyZHMpXG4gICAgICAgICAgICByYW5nZS5zdGFydCA9IHJhbmdlLmVuZDtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmFuZ2UuZW5kID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFJhbmdlKHJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBhbm90aGVyIHNlYXJjaCBmb3IgYG5lZWRsZWAgaW4gdGhlIGRvY3VtZW50LiBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBgb3B0aW9uc2AsIHNlZSBbW1NlYXJjaCBgU2VhcmNoYF1dLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIHNlYXJjaCBvcHRpb25zXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlIHNjcm9sbGluZ1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0b3IuZmluZFxuICAgICAqKi9cbiAgICBmaW5kTmV4dChuZWVkbGU/OiAoc3RyaW5nIHwgUmVnRXhwKSwgYW5pbWF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgLy8gRklYTUU6IFRoaXMgbG9va3MgZmxpcHBlZCBjb21wYXJlZCB0byBmaW5kUHJldmlvdXMuIFxuICAgICAgICB0aGlzLmZpbmQobmVlZGxlLCB7IHNraXBDdXJyZW50OiB0cnVlLCBiYWNrd2FyZHM6IGZhbHNlIH0sIGFuaW1hdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBlcmZvcm1zIGEgc2VhcmNoIGZvciBgbmVlZGxlYCBiYWNrd2FyZHMuIEZvciBtb3JlIGluZm9ybWF0aW9uIG9uIGBvcHRpb25zYCwgc2VlIFtbU2VhcmNoIGBTZWFyY2hgXV0uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgc2VhcmNoIG9wdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGFuaW1hdGUgSWYgYHRydWVgIGFuaW1hdGUgc2Nyb2xsaW5nXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvci5maW5kXG4gICAgICoqL1xuICAgIGZpbmRQcmV2aW91cyhuZWVkbGU/OiAoc3RyaW5nIHwgUmVnRXhwKSwgYW5pbWF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5maW5kKG5lZWRsZSwgeyBza2lwQ3VycmVudDogdHJ1ZSwgYmFja3dhcmRzOiB0cnVlIH0sIGFuaW1hdGUpO1xuICAgIH1cblxuICAgIHJldmVhbFJhbmdlKHJhbmdlOiBDdXJzb3JSYW5nZSwgYW5pbWF0ZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuICAgICAgICB0aGlzLnNlc3Npb24udW5mb2xkKHJhbmdlKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgIHZhciBzY3JvbGxUb3AgPSB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhyYW5nZS5zdGFydCwgcmFuZ2UuZW5kLCAwLjUpO1xuICAgICAgICBpZiAoYW5pbWF0ZSAhPT0gZmFsc2UpXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLmFuaW1hdGVTY3JvbGxpbmcoc2Nyb2xsVG9wKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlVuZG9NYW5hZ2VyLnVuZG99XG4gICAgICogQHJlbGF0ZWQgVW5kb01hbmFnZXIudW5kb1xuICAgICAqKi9cbiAgICB1bmRvKCkge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0VW5kb01hbmFnZXIoKS51bmRvKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlVuZG9NYW5hZ2VyLnJlZG99XG4gICAgICogQHJlbGF0ZWQgVW5kb01hbmFnZXIucmVkb1xuICAgICAqKi9cbiAgICByZWRvKCkge1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0VW5kb01hbmFnZXIoKS5yZWRvKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIENsZWFucyB1cCB0aGUgZW50aXJlIGVkaXRvci5cbiAgICAgKiovXG4gICAgZGVzdHJveSgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kZXN0cm95KCk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImRlc3Ryb3lcIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW5hYmxlcyBhdXRvbWF0aWMgc2Nyb2xsaW5nIG9mIHRoZSBjdXJzb3IgaW50byB2aWV3IHdoZW4gZWRpdG9yIGl0c2VsZiBpcyBpbnNpZGUgc2Nyb2xsYWJsZSBlbGVtZW50XG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGUgZGVmYXVsdCB0cnVlXG4gICAgICoqL1xuICAgIHNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyhlbmFibGU6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKCFlbmFibGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciByZWN0O1xuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciBzaG91bGRTY3JvbGwgPSBmYWxzZTtcbiAgICAgICAgaWYgKCF0aGlzLiRzY3JvbGxBbmNob3IpXG4gICAgICAgICAgICB0aGlzLiRzY3JvbGxBbmNob3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICB2YXIgc2Nyb2xsQW5jaG9yID0gdGhpcy4kc2Nyb2xsQW5jaG9yO1xuICAgICAgICBzY3JvbGxBbmNob3Iuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246YWJzb2x1dGVcIjtcbiAgICAgICAgdGhpcy5jb250YWluZXIuaW5zZXJ0QmVmb3JlKHNjcm9sbEFuY2hvciwgdGhpcy5jb250YWluZXIuZmlyc3RDaGlsZCk7XG4gICAgICAgIHZhciBvbkNoYW5nZVNlbGVjdGlvbiA9IHRoaXMub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzaG91bGRTY3JvbGwgPSB0cnVlO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gbmVlZGVkIHRvIG5vdCB0cmlnZ2VyIHN5bmMgcmVmbG93XG4gICAgICAgIHZhciBvbkJlZm9yZVJlbmRlciA9IHRoaXMucmVuZGVyZXIub24oXCJiZWZvcmVSZW5kZXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsKVxuICAgICAgICAgICAgICAgIHJlY3QgPSBzZWxmLnJlbmRlcmVyLmNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHZhciBvbkFmdGVyUmVuZGVyID0gdGhpcy5yZW5kZXJlci5vbihcImFmdGVyUmVuZGVyXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHNob3VsZFNjcm9sbCAmJiByZWN0ICYmIHNlbGYuaXNGb2N1c2VkKCkpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmVuZGVyZXIgPSBzZWxmLnJlbmRlcmVyO1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByZW5kZXJlci4kY3Vyc29yTGF5ZXIuJHBpeGVsUG9zO1xuICAgICAgICAgICAgICAgIHZhciBjb25maWcgPSByZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgICAgICAgICB2YXIgdG9wID0gcG9zLnRvcCAtIGNvbmZpZy5vZmZzZXQ7XG4gICAgICAgICAgICAgICAgaWYgKHBvcy50b3AgPj0gMCAmJiB0b3AgKyByZWN0LnRvcCA8IDApIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAocG9zLnRvcCA8IGNvbmZpZy5oZWlnaHQgJiZcbiAgICAgICAgICAgICAgICAgICAgcG9zLnRvcCArIHJlY3QudG9wICsgY29uZmlnLmxpbmVIZWlnaHQgPiB3aW5kb3cuaW5uZXJIZWlnaHQpIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzaG91bGRTY3JvbGwgPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoc2hvdWxkU2Nyb2xsICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLnRvcCA9IHRvcCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmxlZnQgPSBwb3MubGVmdCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmhlaWdodCA9IGNvbmZpZy5saW5lSGVpZ2h0ICsgXCJweFwiO1xuICAgICAgICAgICAgICAgICAgICBzY3JvbGxBbmNob3Iuc2Nyb2xsSW50b1ZpZXcoc2hvdWxkU2Nyb2xsKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gcmVjdCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnNldEF1dG9TY3JvbGxFZGl0b3JJbnRvVmlldyA9IGZ1bmN0aW9uKGVuYWJsZSkge1xuICAgICAgICAgICAgaWYgKGVuYWJsZSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXc7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTZWxlY3Rpb25cIiwgb25DaGFuZ2VTZWxlY3Rpb24pO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW1vdmVFdmVudExpc3RlbmVyKFwiYWZ0ZXJSZW5kZXJcIiwgb25BZnRlclJlbmRlcik7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJiZWZvcmVSZW5kZXJcIiwgb25CZWZvcmVSZW5kZXIpO1xuICAgICAgICB9O1xuICAgIH1cblxuXG4gICAgJHJlc2V0Q3Vyc29yU3R5bGUoKSB7XG4gICAgICAgIHZhciBzdHlsZSA9IHRoaXMuJGN1cnNvclN0eWxlIHx8IFwiYWNlXCI7XG4gICAgICAgIHZhciBjdXJzb3JMYXllciA9IHRoaXMucmVuZGVyZXIuJGN1cnNvckxheWVyO1xuICAgICAgICBpZiAoIWN1cnNvckxheWVyKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjdXJzb3JMYXllci5zZXRTbW9vdGhCbGlua2luZygvc21vb3RoLy50ZXN0KHN0eWxlKSk7XG4gICAgICAgIGN1cnNvckxheWVyLmlzQmxpbmtpbmcgPSAhdGhpcy4kcmVhZE9ubHkgJiYgc3R5bGUgIT0gXCJ3aWRlXCI7XG4gICAgICAgIHNldENzc0NsYXNzKGN1cnNvckxheWVyLmVsZW1lbnQsIFwiYWNlX3NsaW0tY3Vyc29yc1wiLCAvc2xpbS8udGVzdChzdHlsZSkpO1xuICAgIH1cbn1cblxuZGVmaW5lT3B0aW9ucyhFZGl0b3IucHJvdG90eXBlLCBcImVkaXRvclwiLCB7XG4gICAgc2VsZWN0aW9uU3R5bGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzdHlsZSkge1xuICAgICAgICAgICAgdGhpcy5vblNlbGVjdGlvbkNoYW5nZSgpO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uU3R5bGVcIiwgeyBkYXRhOiBzdHlsZSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImxpbmVcIlxuICAgIH0sXG4gICAgaGlnaGxpZ2h0QWN0aXZlTGluZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgaGlnaGxpZ2h0U2VsZWN0ZWRXb3JkOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oc2hvdWxkSGlnaGxpZ2h0KSB7IHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlKCk7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgcmVhZE9ubHk6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihyZWFkT25seSkge1xuICAgICAgICAgICAgLy8gZGlzYWJsZWQgdG8gbm90IGJyZWFrIHZpbSBtb2RlIVxuICAgICAgICAgICAgLy8gdGhpcy50ZXh0SW5wdXQuc2V0UmVhZE9ubHkocmVhZE9ubHkpO1xuICAgICAgICAgICAgdGhpcy4kcmVzZXRDdXJzb3JTdHlsZSgpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBjdXJzb3JTdHlsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLiRyZXNldEN1cnNvclN0eWxlKCk7IH0sXG4gICAgICAgIHZhbHVlczogW1wiYWNlXCIsIFwic2xpbVwiLCBcInNtb290aFwiLCBcIndpZGVcIl0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCJhY2VcIlxuICAgIH0sXG4gICAgbWVyZ2VVbmRvRGVsdGFzOiB7XG4gICAgICAgIHZhbHVlczogW2ZhbHNlLCB0cnVlLCBcImFsd2F5c1wiXSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBiZWhhdmlvdXJzRW5hYmxlZDogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICB3cmFwQmVoYXZpb3Vyc0VuYWJsZWQ6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgYXV0b1Njcm9sbEVkaXRvckludG9WaWV3OiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3KHZhbCkgfVxuICAgIH0sXG5cbiAgICBoU2Nyb2xsQmFyQWx3YXlzVmlzaWJsZTogXCJyZW5kZXJlclwiLFxuICAgIHZTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBcInJlbmRlcmVyXCIsXG4gICAgaGlnaGxpZ2h0R3V0dGVyTGluZTogXCJyZW5kZXJlclwiLFxuICAgIGFuaW1hdGVkU2Nyb2xsOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ludmlzaWJsZXM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93UHJpbnRNYXJnaW46IFwicmVuZGVyZXJcIixcbiAgICBwcmludE1hcmdpbkNvbHVtbjogXCJyZW5kZXJlclwiLFxuICAgIHByaW50TWFyZ2luOiBcInJlbmRlcmVyXCIsXG4gICAgZmFkZUZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0ZvbGRXaWRnZXRzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0xpbmVOdW1iZXJzOiBcInJlbmRlcmVyXCIsXG4gICAgc2hvd0d1dHRlcjogXCJyZW5kZXJlclwiLFxuICAgIGRpc3BsYXlJbmRlbnRHdWlkZXM6IFwicmVuZGVyZXJcIixcbiAgICBmb250U2l6ZTogXCJyZW5kZXJlclwiLFxuICAgIGZvbnRGYW1pbHk6IFwicmVuZGVyZXJcIixcbiAgICBtYXhMaW5lczogXCJyZW5kZXJlclwiLFxuICAgIG1pbkxpbmVzOiBcInJlbmRlcmVyXCIsXG4gICAgc2Nyb2xsUGFzdEVuZDogXCJyZW5kZXJlclwiLFxuICAgIGZpeGVkV2lkdGhHdXR0ZXI6IFwicmVuZGVyZXJcIixcbiAgICB0aGVtZTogXCJyZW5kZXJlclwiLFxuXG4gICAgc2Nyb2xsU3BlZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGRyYWdEZWxheTogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZHJhZ0VuYWJsZWQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIGZvY3VzVGltb3V0OiBcIiRtb3VzZUhhbmRsZXJcIixcbiAgICB0b29sdGlwRm9sbG93c01vdXNlOiBcIiRtb3VzZUhhbmRsZXJcIixcblxuICAgIGZpcnN0TGluZU51bWJlcjogXCJzZXNzaW9uXCIsXG4gICAgb3ZlcndyaXRlOiBcInNlc3Npb25cIixcbiAgICBuZXdMaW5lTW9kZTogXCJzZXNzaW9uXCIsXG4gICAgdXNlV29ya2VyOiBcInNlc3Npb25cIixcbiAgICB1c2VTb2Z0VGFiczogXCJzZXNzaW9uXCIsXG4gICAgdGFiU2l6ZTogXCJzZXNzaW9uXCIsXG4gICAgd3JhcDogXCJzZXNzaW9uXCIsXG4gICAgZm9sZFN0eWxlOiBcInNlc3Npb25cIixcbiAgICBtb2RlOiBcInNlc3Npb25cIlxufSk7XG5cbmNsYXNzIEZvbGRIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3RvcihlZGl0b3I6IEVkaXRvcikge1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBpbiB0aGUgZWRpdG9yIChub3QgZ3V0dGVyKSByZWdpb25cbiAgICAgICAgLy8gdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdG8gcmVtb3ZlIG9yIGV4cGFuZCBhIGZvbGQuXG4gICAgICAgIGVkaXRvci5vbihcImNsaWNrXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBwb3NpdGlvbiA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3Iuc2Vzc2lvbjtcblxuICAgICAgICAgICAgLy8gSWYgdGhlIHVzZXIgY2xpY2tlZCBvbiBhIGZvbGQsIHRoZW4gZXhwYW5kIGl0LlxuICAgICAgICAgICAgdmFyIGZvbGQgPSBzZXNzaW9uLmdldEZvbGRBdChwb3NpdGlvbi5yb3csIHBvc2l0aW9uLmNvbHVtbiwgMSk7XG4gICAgICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgICAgIGlmIChlLmdldEFjY2VsS2V5KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbi5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBUaGUgZm9sbG93aW5nIGhhbmRsZXIgZGV0ZWN0cyBjbGlja3Mgb24gdGhlIGd1dHRlci5cbiAgICAgICAgZWRpdG9yLm9uKCdndXR0ZXJjbGljaycsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlckxheWVyLmdldFJlZ2lvbihlKTtcbiAgICAgICAgICAgIGlmIChndXR0ZXJSZWdpb24gPT09ICdmb2xkV2lkZ2V0cycpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm93ID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLnNlc3Npb247XG4gICAgICAgICAgICAgICAgaWYgKHNlc3Npb25bJ2ZvbGRXaWRnZXRzJ10gJiYgc2Vzc2lvblsnZm9sZFdpZGdldHMnXVtyb3ddKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5zZXNzaW9uWydvbkZvbGRXaWRnZXRDbGljayddKHJvdywgZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5mb2N1cygpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZWRpdG9yLm9uKCdndXR0ZXJkYmxjbGljaycsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlckxheWVyLmdldFJlZ2lvbihlKTtcblxuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PSAnZm9sZFdpZGdldHMnKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5zZXNzaW9uO1xuICAgICAgICAgICAgICAgIHZhciBkYXRhID0gc2Vzc2lvblsnZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YSddKHJvdywgdHJ1ZSk7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gZGF0YS5yYW5nZSB8fCBkYXRhLmZpcnN0UmFuZ2U7XG5cbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZCA9IHNlc3Npb24uZ2V0Rm9sZEF0KHJvdywgc2Vzc2lvbi5nZXRMaW5lKHJvdykubGVuZ3RoLCAxKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2Vzc2lvblsnYWRkRm9sZCddKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVkaXRvci5yZW5kZXJlci5zY3JvbGxDdXJzb3JJbnRvVmlldyh7IHJvdzogcmFuZ2Uuc3RhcnQucm93LCBjb2x1bW46IDAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZS5zdG9wKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuaW50ZXJmYWNlIElHZXN0dXJlSGFuZGxlciB7XG4gICAgY2FuY2VsQ29udGV4dE1lbnUoKTogdm9pZDtcbn1cblxuY2xhc3MgTW91c2VIYW5kbGVyIHtcbiAgICBwdWJsaWMgZWRpdG9yOiBFZGl0b3I7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsU3BlZWQ6IG51bWJlciA9IDI7XG4gICAgcHJpdmF0ZSAkZHJhZ0RlbGF5OiBudW1iZXIgPSAwO1xuICAgIHByaXZhdGUgJGRyYWdFbmFibGVkOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwdWJsaWMgJGZvY3VzVGltb3V0OiBudW1iZXIgPSAwO1xuICAgIHB1YmxpYyAkdG9vbHRpcEZvbGxvd3NNb3VzZTogYm9vbGVhbiA9IHRydWU7XG4gICAgcHJpdmF0ZSBzdGF0ZTogc3RyaW5nO1xuICAgIHByaXZhdGUgY2xpZW50WDogbnVtYmVyO1xuICAgIHByaXZhdGUgY2xpZW50WTogbnVtYmVyO1xuICAgIHB1YmxpYyBpc01vdXNlUHJlc3NlZDogYm9vbGVhbjtcbiAgICAvKipcbiAgICAgKiBUaGUgZnVuY3Rpb24gdG8gY2FsbCB0byByZWxlYXNlIGEgY2FwdHVyZWQgbW91c2UuXG4gICAgICovXG4gICAgcHJpdmF0ZSByZWxlYXNlTW91c2U6IChldmVudDogTW91c2VFdmVudCkgPT4gdm9pZDtcbiAgICBwcml2YXRlIG1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgcHVibGljIG1vdXNlZG93bkV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50O1xuICAgIHByaXZhdGUgJG1vdXNlTW92ZWQ7XG4gICAgcHJpdmF0ZSAkb25DYXB0dXJlTW91c2VNb3ZlO1xuICAgIHB1YmxpYyAkY2xpY2tTZWxlY3Rpb246IFJhbmdlID0gbnVsbDtcbiAgICBwdWJsaWMgJGxhc3RTY3JvbGxUaW1lOiBudW1iZXI7XG4gICAgcHVibGljIHNlbGVjdEJ5TGluZXM6ICgpID0+IHZvaWQ7XG4gICAgcHVibGljIHNlbGVjdEJ5V29yZHM6ICgpID0+IHZvaWQ7XG4gICAgY29uc3RydWN0b3IoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgLy8gRklYTUU6IERpZCBJIG1lbnRpb24gdGhhdCBgdGhpc2AsIGBuZXdgLCBgY2xhc3NgLCBgYmluZGAgYXJlIHRoZSA0IGhvcnNlbWVuP1xuICAgICAgICAvLyBGSVhNRTogRnVuY3Rpb24gU2NvcGluZyBpcyB0aGUgYW5zd2VyLlxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmVkaXRvciA9IGVkaXRvcjtcblxuICAgICAgICAvLyBGSVhNRTogV2Ugc2hvdWxkIGJlIGNsZWFuaW5nIHVwIHRoZXNlIGhhbmRsZXJzIGluIGEgZGlzcG9zZSBtZXRob2QuLi5cbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKCdtb3VzZWRvd24nLCBtYWtlTW91c2VEb3duSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKCdtb3VzZXdoZWVsJywgbWFrZU1vdXNlV2hlZWxIYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoXCJkYmxjbGlja1wiLCBtYWtlRG91YmxlQ2xpY2tIYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoXCJ0cmlwbGVjbGlja1wiLCBtYWtlVHJpcGxlQ2xpY2tIYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoXCJxdWFkY2xpY2tcIiwgbWFrZVF1YWRDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzID0gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvciwgdGhpcywgXCJnZXRMaW5lUmFuZ2VcIik7XG4gICAgICAgIHRoaXMuc2VsZWN0QnlXb3JkcyA9IG1ha2VFeHRlbmRTZWxlY3Rpb25CeShlZGl0b3IsIHRoaXMsIFwiZ2V0V29yZFJhbmdlXCIpO1xuXG4gICAgICAgIG5ldyBHdXR0ZXJIYW5kbGVyKHRoaXMpO1xuICAgICAgICAvLyAgICAgIEZJWE1FOiBuZXcgRHJhZ2Ryb3BIYW5kbGVyKHRoaXMpO1xuXG4gICAgICAgIHZhciBvbk1vdXNlRG93biA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpICYmIGVkaXRvci50ZXh0SW5wdXQpIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IudGV4dElucHV0Lm1vdmVUb01vdXNlKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKClcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgbW91c2VUYXJnZXQ6IEhUTUxEaXZFbGVtZW50ID0gZWRpdG9yLnJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQoKTtcbiAgICAgICAgYWRkTGlzdGVuZXIobW91c2VUYXJnZXQsIFwiY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImNsaWNrXCIpKTtcbiAgICAgICAgYWRkTGlzdGVuZXIobW91c2VUYXJnZXQsIFwibW91c2Vtb3ZlXCIsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzLCBcIm1vdXNlbW92ZVwiKSk7XG4gICAgICAgIGFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIobW91c2VUYXJnZXQsIFs0MDAsIDMwMCwgMjUwXSwgdGhpcywgXCJvbk1vdXNlRXZlbnRcIik7XG4gICAgICAgIGlmIChlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFyVikge1xuICAgICAgICAgICAgYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFyVi5pbm5lciwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgICAgIGFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhckguaW5uZXIsIFs0MDAsIDMwMCwgMjUwXSwgdGhpcywgXCJvbk1vdXNlRXZlbnRcIik7XG4gICAgICAgICAgICBpZiAoaXNJRSkge1xuICAgICAgICAgICAgICAgIGFkZExpc3RlbmVyKGVkaXRvci5yZW5kZXJlci5zY3JvbGxCYXJWLmVsZW1lbnQsIFwibW91c2Vkb3duXCIsIG9uTW91c2VEb3duKTtcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBJIHdvbmRlciBpZiB3ZSBzaG91bGQgYmUgcmVzcG9uZGluZyB0byBtb3VzZWRvd24gKGJ5IHN5bW1ldHJ5KT9cbiAgICAgICAgICAgICAgICBhZGRMaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFySC5lbGVtZW50LCBcIm1vdXNlbW92ZVwiLCBvbk1vdXNlRG93bik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBXZSBob29rICdtb3VzZXdoZWVsJyB1c2luZyB0aGUgcG9ydGFibGUgXG4gICAgICAgIGFkZE1vdXNlV2hlZWxMaXN0ZW5lcihlZGl0b3IuY29udGFpbmVyLCB0aGlzLmVtaXRFZGl0b3JNb3VzZVdoZWVsRXZlbnQuYmluZCh0aGlzLCBcIm1vdXNld2hlZWxcIikpO1xuXG4gICAgICAgIHZhciBndXR0ZXJFbCA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyO1xuICAgICAgICBhZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJtb3VzZWRvd25cIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcm1vdXNlZG93blwiKSk7XG4gICAgICAgIGFkZExpc3RlbmVyKGd1dHRlckVsLCBcImNsaWNrXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJjbGlja1wiKSk7XG4gICAgICAgIGFkZExpc3RlbmVyKGd1dHRlckVsLCBcImRibGNsaWNrXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJkYmxjbGlja1wiKSk7XG4gICAgICAgIGFkZExpc3RlbmVyKGd1dHRlckVsLCBcIm1vdXNlbW92ZVwiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVybW91c2Vtb3ZlXCIpKTtcblxuICAgICAgICBhZGRMaXN0ZW5lcihtb3VzZVRhcmdldCwgXCJtb3VzZWRvd25cIiwgb25Nb3VzZURvd24pO1xuXG4gICAgICAgIGFkZExpc3RlbmVyKGd1dHRlckVsLCBcIm1vdXNlZG93blwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKTtcbiAgICAgICAgICAgIHJldHVybiBwcmV2ZW50RGVmYXVsdChlKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gSGFuZGxlIGBtb3VzZW1vdmVgIHdoaWxlIHRoZSBtb3VzZSBpcyBvdmVyIHRoZSBlZGl0aW5nIGFyZWEgKGFuZCBub3QgdGhlIGd1dHRlcikuXG4gICAgICAgIGVkaXRvci5vbignbW91c2Vtb3ZlJywgZnVuY3Rpb24oZTogTW91c2VFdmVudCkge1xuICAgICAgICAgICAgaWYgKF9zZWxmLnN0YXRlIHx8IF9zZWxmLiRkcmFnRGVsYXkgfHwgIV9zZWxmLiRkcmFnRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIEZJWE1FOiBQcm9iYWJseSBzL2IgY2xpZW50WFlcbiAgICAgICAgICAgIHZhciBjaGFyID0gZWRpdG9yLnJlbmRlcmVyLnNjcmVlblRvVGV4dENvb3JkaW5hdGVzKGUueCwgZS55KTtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5zZXNzaW9uLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHJlbmRlcmVyID0gZWRpdG9yLnJlbmRlcmVyO1xuXG4gICAgICAgICAgICBpZiAoIXJhbmdlLmlzRW1wdHkoKSAmJiByYW5nZS5pbnNpZGVTdGFydChjaGFyLnJvdywgY2hhci5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgcmVuZGVyZXIuc2V0Q3Vyc29yU3R5bGUoJ2RlZmF1bHQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJlbmRlcmVyLnNldEN1cnNvclN0eWxlKFwiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBvbk1vdXNlRXZlbnQobmFtZTogc3RyaW5nLCBlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKSk7XG4gICAgfVxuXG4gICAgb25Nb3VzZU1vdmUobmFtZTogc3RyaW5nLCBlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgIC8vIG9wdGltaXphdGlvbiwgYmVjYXVzZSBtb3VzZW1vdmUgZG9lc24ndCBoYXZlIGEgZGVmYXVsdCBoYW5kbGVyLlxuICAgICAgICB2YXIgbGlzdGVuZXJzID0gdGhpcy5lZGl0b3IuX2V2ZW50UmVnaXN0cnkgJiYgdGhpcy5lZGl0b3IuX2V2ZW50UmVnaXN0cnkubW91c2Vtb3ZlO1xuICAgICAgICBpZiAoIWxpc3RlbmVycyB8fCAhbGlzdGVuZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbmV3IEVkaXRvck1vdXNlRXZlbnQoZSwgdGhpcy5lZGl0b3IpKTtcbiAgICB9XG5cbiAgICBlbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50KG5hbWU6IHN0cmluZywgZTogTW91c2VXaGVlbEV2ZW50KSB7XG4gICAgICAgIHZhciBtb3VzZUV2ZW50ID0gbmV3IEVkaXRvck1vdXNlRXZlbnQoZSwgdGhpcy5lZGl0b3IpO1xuICAgICAgICBtb3VzZUV2ZW50LnNwZWVkID0gdGhpcy4kc2Nyb2xsU3BlZWQgKiAyO1xuICAgICAgICBtb3VzZUV2ZW50LndoZWVsWCA9IGVbJ3doZWVsWCddO1xuICAgICAgICBtb3VzZUV2ZW50LndoZWVsWSA9IGVbJ3doZWVsWSddO1xuICAgICAgICB0aGlzLmVkaXRvci5fZW1pdChuYW1lLCBtb3VzZUV2ZW50KTtcbiAgICB9XG5cbiAgICBzZXRTdGF0ZShzdGF0ZTogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbiAgICB9XG5cbiAgICB0ZXh0Q29vcmRpbmF0ZXMoKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgfVxuXG4gICAgY2FwdHVyZU1vdXNlKGV2OiBFZGl0b3JNb3VzZUV2ZW50LCBtb3VzZU1vdmVIYW5kbGVyPzogKG1vdXNlRXZlbnQ6IE1vdXNlRXZlbnQpID0+IHZvaWQpIHtcbiAgICAgICAgdGhpcy5jbGllbnRYID0gZXYuY2xpZW50WDtcbiAgICAgICAgdGhpcy5jbGllbnRZID0gZXYuY2xpZW50WTtcblxuICAgICAgICB0aGlzLmlzTW91c2VQcmVzc2VkID0gdHJ1ZTtcblxuICAgICAgICAvLyBkbyBub3QgbW92ZSB0ZXh0YXJlYSBkdXJpbmcgc2VsZWN0aW9uXG4gICAgICAgIHZhciByZW5kZXJlciA9IHRoaXMuZWRpdG9yLnJlbmRlcmVyO1xuICAgICAgICBpZiAocmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yKSB7XG4gICAgICAgICAgICByZW5kZXJlci4ka2VlcFRleHRBcmVhQXRDdXJzb3IgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG9uTW91c2VNb3ZlID0gKGZ1bmN0aW9uKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKG1vdXNlRXZlbnQ6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIW1vdXNlRXZlbnQpIHJldHVybjtcbiAgICAgICAgICAgICAgICAvLyBpZiBlZGl0b3IgaXMgbG9hZGVkIGluc2lkZSBpZnJhbWUsIGFuZCBtb3VzZXVwIGV2ZW50IGlzIG91dHNpZGVcbiAgICAgICAgICAgICAgICAvLyB3ZSB3b24ndCByZWNpZXZlIGl0LCBzbyB3ZSBjYW5jZWwgb24gZmlyc3QgbW91c2Vtb3ZlIHdpdGhvdXQgYnV0dG9uXG4gICAgICAgICAgICAgICAgaWYgKGlzV2ViS2l0ICYmICFtb3VzZUV2ZW50LndoaWNoICYmIG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVE9ETzogRm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IEknbSBwYXNzaW5nIHVuZGVmaW5lZCxcbiAgICAgICAgICAgICAgICAgICAgLy8gYnV0IGl0IHdvdWxkIHByb2JhYmx5IG1ha2UgbW9yZSBzZW5zZSB0byBwYXNzIHRoZSBtb3VzZSBldmVudFxuICAgICAgICAgICAgICAgICAgICAvLyBzaW5jZSB0aGF0IGlzIHRoZSBmaW5hbCBldmVudC5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UodW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuY2xpZW50WCA9IG1vdXNlRXZlbnQuY2xpZW50WDtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuY2xpZW50WSA9IG1vdXNlRXZlbnQuY2xpZW50WTtcbiAgICAgICAgICAgICAgICBtb3VzZU1vdmVIYW5kbGVyICYmIG1vdXNlTW92ZUhhbmRsZXIobW91c2VFdmVudCk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlRXZlbnQgPSBuZXcgRWRpdG9yTW91c2VFdmVudChtb3VzZUV2ZW50LCBlZGl0b3IpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbW91c2VNb3ZlZCA9IHRydWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMuZWRpdG9yLCB0aGlzKTtcblxuICAgICAgICB2YXIgb25DYXB0dXJlRW5kID0gKGZ1bmN0aW9uKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgIGNsZWFySW50ZXJ2YWwodGltZXJJZCk7XG4gICAgICAgICAgICAgICAgb25DYXB0dXJlSW50ZXJ2YWwoKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlICsgXCJFbmRcIl0gJiYgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZSArIFwiRW5kXCJdKGUpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5zdGF0ZSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgaWYgKHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvciA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHJlbmRlcmVyLiRtb3ZlVGV4dEFyZWFUb0N1cnNvcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuaXNNb3VzZVByZXNzZWQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJG9uQ2FwdHVyZU1vdXNlTW92ZSA9IG1vdXNlSGFuZGxlci5yZWxlYXNlTW91c2UgPSBudWxsO1xuICAgICAgICAgICAgICAgIGUgJiYgbW91c2VIYW5kbGVyLm9uTW91c2VFdmVudChcIm1vdXNldXBcIiwgZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMpO1xuXG4gICAgICAgIHZhciBvbkNhcHR1cmVJbnRlcnZhbCA9IChmdW5jdGlvbihtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGVdICYmIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGVdKCk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRtb3VzZU1vdmVkID0gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pKHRoaXMpO1xuXG4gICAgICAgIGlmIChpc09sZElFICYmIGV2LmRvbUV2ZW50LnR5cGUgPT0gXCJkYmxjbGlja1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpIHsgb25DYXB0dXJlRW5kKGV2KTsgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRvbkNhcHR1cmVNb3VzZU1vdmUgPSBvbk1vdXNlTW92ZTtcbiAgICAgICAgdGhpcy5yZWxlYXNlTW91c2UgPSBjYXB0dXJlKHRoaXMuZWRpdG9yLmNvbnRhaW5lciwgb25Nb3VzZU1vdmUsIG9uQ2FwdHVyZUVuZCk7XG4gICAgICAgIHZhciB0aW1lcklkID0gc2V0SW50ZXJ2YWwob25DYXB0dXJlSW50ZXJ2YWwsIDIwKTtcbiAgICB9XG5cbiAgICBjYW5jZWxDb250ZXh0TWVudSgpOiB2b2lkIHtcbiAgICAgICAgdmFyIHN0b3AgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoZSAmJiBlLmRvbUV2ZW50ICYmIGUuZG9tRXZlbnQudHlwZSAhPSBcImNvbnRleHRtZW51XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5vZmYoXCJuYXRpdmVjb250ZXh0bWVudVwiLCBzdG9wKTtcbiAgICAgICAgICAgIGlmIChlICYmIGUuZG9tRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBzdG9wRXZlbnQoZS5kb21FdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKTtcbiAgICAgICAgc2V0VGltZW91dChzdG9wLCAxMCk7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwibmF0aXZlY29udGV4dG1lbnVcIiwgc3RvcCk7XG4gICAgfVxuXG4gICAgc2VsZWN0KCkge1xuICAgICAgICB2YXIgYW5jaG9yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuXG4gICAgICAgIGlmICh0aGlzLiRjbGlja1NlbGVjdGlvbikge1xuICAgICAgICAgICAgdmFyIGNtcCA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChjdXJzb3IpO1xuXG4gICAgICAgICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gdGhpcy4kY2xpY2tTZWxlY3Rpb24uZW5kO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjbXAgPT0gMSkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLnN0YXJ0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50ZWRSYW5nZSA9IGNhbGNSYW5nZU9yaWVudGF0aW9uKHRoaXMuJGNsaWNrU2VsZWN0aW9uLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IG9yaWVudGVkUmFuZ2UuY3Vyc29yO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG9yaWVudGVkUmFuZ2UuYW5jaG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLnNldFNlbGVjdGlvbkFuY2hvcihhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QnlMaW5lc0VuZCgpIHtcbiAgICAgICAgdGhpcy4kY2xpY2tTZWxlY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLmVkaXRvci51bnNldFN0eWxlKFwiYWNlX3NlbGVjdGluZ1wiKTtcbiAgICAgICAgaWYgKHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnJlbGVhc2VDYXB0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5yZWxlYXNlQ2FwdHVyZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRTZWxlY3QocG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24/OiBib29sZWFuKSB7XG4gICAgICAgIHBvcyA9IHBvcyB8fCB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgICAgIHZhciBlZGl0b3IgPSB0aGlzLmVkaXRvcjtcbiAgICAgICAgLy8gYWxsb3cgZG91YmxlL3RyaXBsZSBjbGljayBoYW5kbGVycyB0byBjaGFuZ2Ugc2VsZWN0aW9uXG4gICAgXG4gICAgICAgIGlmICh0aGlzLm1vdXNlZG93bkV2ZW50LmdldFNoaWZ0S2V5KCkpIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihwb3MpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCF3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghd2FpdEZvckNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnNldENhcHR1cmUpIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnNldENhcHR1cmUoKTtcbiAgICAgICAgfVxuICAgICAgICBlZGl0b3Iuc2V0U3R5bGUoXCJhY2Vfc2VsZWN0aW5nXCIpO1xuICAgICAgICB0aGlzLnNldFN0YXRlKFwic2VsZWN0XCIpO1xuICAgIH1cblxuICAgIHNlbGVjdEVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QWxsRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBzZWxlY3RCeVdvcmRzRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBmb2N1c1dhaXQoKSB7XG4gICAgICAgIHZhciBkaXN0YW5jZSA9IGNhbGNEaXN0YW5jZSh0aGlzLm1vdXNlZG93bkV2ZW50LmNsaWVudFgsIHRoaXMubW91c2Vkb3duRXZlbnQuY2xpZW50WSwgdGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB2YXIgdGltZSA9IERhdGUubm93KCk7XG5cbiAgICAgICAgaWYgKGRpc3RhbmNlID4gRFJBR19PRkZTRVQgfHwgdGltZSAtIHRoaXMubW91c2Vkb3duRXZlbnQudGltZSA+IHRoaXMuJGZvY3VzVGltb3V0KSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0U2VsZWN0KHRoaXMubW91c2Vkb3duRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpKTtcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG5kZWZpbmVPcHRpb25zKE1vdXNlSGFuZGxlci5wcm90b3R5cGUsIFwibW91c2VIYW5kbGVyXCIsIHtcbiAgICBzY3JvbGxTcGVlZDogeyBpbml0aWFsVmFsdWU6IDIgfSxcbiAgICBkcmFnRGVsYXk6IHsgaW5pdGlhbFZhbHVlOiAoaXNNYWMgPyAxNTAgOiAwKSB9LFxuICAgIGRyYWdFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIGZvY3VzVGltb3V0OiB7IGluaXRpYWxWYWx1ZTogMCB9LFxuICAgIHRvb2x0aXBGb2xsb3dzTW91c2U6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH1cbn0pO1xuXG4vKlxuICogQ3VzdG9tIEFjZSBtb3VzZSBldmVudFxuICovXG5jbGFzcyBFZGl0b3JNb3VzZUV2ZW50IHtcbiAgICAvLyBXZSBrZWVwIHRoZSBvcmlnaW5hbCBET00gZXZlbnRcbiAgICBwdWJsaWMgZG9tRXZlbnQ6IE1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSBlZGl0b3I6IEVkaXRvcjtcbiAgICBwdWJsaWMgY2xpZW50WDogbnVtYmVyO1xuICAgIHB1YmxpYyBjbGllbnRZOiBudW1iZXI7XG4gICAgLyoqXG4gICAgICogQ2FjaGVkIHRleHQgY29vcmRpbmF0ZXMgZm9sbG93aW5nIGdldERvY3VtZW50UG9zaXRpb24oKVxuICAgICAqL1xuICAgIHByaXZhdGUgJHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICBwcml2YXRlICRpblNlbGVjdGlvbjtcbiAgICBwcml2YXRlIHByb3BhZ2F0aW9uU3RvcHBlZCA9IGZhbHNlO1xuICAgIHByaXZhdGUgZGVmYXVsdFByZXZlbnRlZCA9IGZhbHNlO1xuICAgIHB1YmxpYyB0aW1lOiBudW1iZXI7XG4gICAgLy8gd2hlZWxZLCB3aGVlbFkgYW5kIHNwZWVkIGFyZSBmb3IgJ21vdXNld2hlZWwnIGV2ZW50cy5cbiAgICBwdWJsaWMgd2hlZWxYOiBudW1iZXI7XG4gICAgcHVibGljIHdoZWVsWTogbnVtYmVyO1xuICAgIHB1YmxpYyBzcGVlZDogbnVtYmVyO1xuICAgIGNvbnN0cnVjdG9yKGRvbUV2ZW50OiBNb3VzZUV2ZW50LCBlZGl0b3I6IEVkaXRvcikge1xuICAgICAgICB0aGlzLmRvbUV2ZW50ID0gZG9tRXZlbnQ7XG4gICAgICAgIHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGRvbUV2ZW50LmNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGRvbUV2ZW50LmNsaWVudFk7XG5cbiAgICAgICAgdGhpcy4kcG9zID0gbnVsbDtcbiAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBudWxsO1xuICAgIH1cblxuICAgIGdldCB0b0VsZW1lbnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvbUV2ZW50LnRvRWxlbWVudDtcbiAgICB9XG5cbiAgICBzdG9wUHJvcGFnYXRpb24oKSB7XG4gICAgICAgIHN0b3BQcm9wYWdhdGlvbih0aGlzLmRvbUV2ZW50KTtcbiAgICAgICAgdGhpcy5wcm9wYWdhdGlvblN0b3BwZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIHByZXZlbnREZWZhdWx0KCkge1xuICAgICAgICBwcmV2ZW50RGVmYXVsdCh0aGlzLmRvbUV2ZW50KTtcbiAgICAgICAgdGhpcy5kZWZhdWx0UHJldmVudGVkID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBzdG9wKCkge1xuICAgICAgICB0aGlzLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICB0aGlzLnByZXZlbnREZWZhdWx0KCk7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBHZXQgdGhlIGRvY3VtZW50IHBvc2l0aW9uIGJlbG93IHRoZSBtb3VzZSBjdXJzb3JcbiAgICAgKiBcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9ICdyb3cnIGFuZCAnY29sdW1uJyBvZiB0aGUgZG9jdW1lbnQgcG9zaXRpb25cbiAgICAgKi9cbiAgICBnZXREb2N1bWVudFBvc2l0aW9uKCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICBpZiAoIXRoaXMuJHBvcykge1xuICAgICAgICAgICAgdGhpcy4kcG9zID0gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLiRwb3M7XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogQ2hlY2sgaWYgdGhlIG1vdXNlIGN1cnNvciBpcyBpbnNpZGUgb2YgdGhlIHRleHQgc2VsZWN0aW9uXG4gICAgICogXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gd2hldGhlciB0aGUgbW91c2UgY3Vyc29yIGlzIGluc2lkZSBvZiB0aGUgc2VsZWN0aW9uXG4gICAgICovXG4gICAgaW5TZWxlY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLiRpblNlbGVjdGlvbiAhPT0gbnVsbClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiRpblNlbGVjdGlvbjtcblxuICAgICAgICB2YXIgZWRpdG9yID0gdGhpcy5lZGl0b3I7XG5cblxuICAgICAgICB2YXIgc2VsZWN0aW9uUmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHNlbGVjdGlvblJhbmdlLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuJGluU2VsZWN0aW9uID0gZmFsc2U7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBzZWxlY3Rpb25SYW5nZS5jb250YWlucyhwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0aGlzLiRpblNlbGVjdGlvbjtcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBHZXQgdGhlIGNsaWNrZWQgbW91c2UgYnV0dG9uXG4gICAgICogXG4gICAgICogQHJldHVybiB7TnVtYmVyfSAwIGZvciBsZWZ0IGJ1dHRvbiwgMSBmb3IgbWlkZGxlIGJ1dHRvbiwgMiBmb3IgcmlnaHQgYnV0dG9uXG4gICAgICovXG4gICAgZ2V0QnV0dG9uKCkge1xuICAgICAgICByZXR1cm4gZ2V0QnV0dG9uKHRoaXMuZG9tRXZlbnQpO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IHdoZXRoZXIgdGhlIHNoaWZ0IGtleSB3YXMgcHJlc3NlZCB3aGVuIHRoZSBldmVudCB3YXMgZW1pdHRlZFxuICAgICAqL1xuICAgIGdldFNoaWZ0S2V5KCkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb21FdmVudC5zaGlmdEtleTtcbiAgICB9XG5cbiAgICBnZXRBY2NlbEtleSA9IGlzTWFjID8gZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvbUV2ZW50Lm1ldGFLZXk7IH0gOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZG9tRXZlbnQuY3RybEtleTsgfTtcbn1cblxudmFyIERSQUdfT0ZGU0VUID0gMDsgLy8gcGl4ZWxzXG5cbmZ1bmN0aW9uIG1ha2VNb3VzZURvd25IYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihldjogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgaW5TZWxlY3Rpb24gPSBldi5pblNlbGVjdGlvbigpO1xuICAgICAgICB2YXIgcG9zID0gZXYuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICBtb3VzZUhhbmRsZXIubW91c2Vkb3duRXZlbnQgPSBldjtcblxuICAgICAgICB2YXIgYnV0dG9uID0gZXYuZ2V0QnV0dG9uKCk7XG4gICAgICAgIGlmIChidXR0b24gIT09IDApIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25SYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVtcHR5ID0gc2VsZWN0aW9uUmFuZ2UuaXNFbXB0eSgpO1xuXG4gICAgICAgICAgICBpZiAoc2VsZWN0aW9uRW1wdHkpXG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbihwb3MpO1xuXG4gICAgICAgICAgICAvLyAyOiBjb250ZXh0bWVudSwgMTogbGludXggcGFzdGVcbiAgICAgICAgICAgIGVkaXRvci50ZXh0SW5wdXQub25Db250ZXh0TWVudShldi5kb21FdmVudCk7XG4gICAgICAgICAgICByZXR1cm47IC8vIHN0b3BwaW5nIGV2ZW50IGhlcmUgYnJlYWtzIGNvbnRleHRtZW51IG9uIGZmIG1hY1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlZG93bkV2ZW50LnRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICAvLyBpZiB0aGlzIGNsaWNrIGNhdXNlZCB0aGUgZWRpdG9yIHRvIGJlIGZvY3VzZWQgc2hvdWxkIG5vdCBjbGVhciB0aGVcbiAgICAgICAgLy8gc2VsZWN0aW9uXG4gICAgICAgIGlmIChpblNlbGVjdGlvbiAmJiAhZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKTtcbiAgICAgICAgICAgIGlmIChtb3VzZUhhbmRsZXIuJGZvY3VzVGltb3V0ICYmICFtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uICYmICFlZGl0b3IuaW5NdWx0aVNlbGVjdE1vZGUpIHtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJmb2N1c1dhaXRcIik7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShldik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShldik7XG4gICAgICAgIC8vIFRPRE86IF9jbGlja3MgaXMgYSBjdXN0b20gcHJvcGVydHkgYWRkZWQgaW4gZXZlbnQudHMgYnkgdGhlICdtb3VzZWRvd24nIGxpc3RlbmVyLlxuICAgICAgICBtb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QocG9zLCBldi5kb21FdmVudFsnX2NsaWNrcyddID4gMSk7XG4gICAgICAgIHJldHVybiBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZU1vdXNlV2hlZWxIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihldjogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICBpZiAoZXYuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9zaGlmdCB3aGVlbCB0byBob3JpeiBzY3JvbGxcbiAgICAgICAgaWYgKGV2LmdldFNoaWZ0S2V5KCkgJiYgZXYud2hlZWxZICYmICFldi53aGVlbFgpIHtcbiAgICAgICAgICAgIGV2LndoZWVsWCA9IGV2LndoZWVsWTtcbiAgICAgICAgICAgIGV2LndoZWVsWSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdCA9IGV2LmRvbUV2ZW50LnRpbWVTdGFtcDtcbiAgICAgICAgdmFyIGR0ID0gdCAtIChtb3VzZUhhbmRsZXIuJGxhc3RTY3JvbGxUaW1lIHx8IDApO1xuXG4gICAgICAgIHZhciBpc1Njcm9sYWJsZSA9IGVkaXRvci5yZW5kZXJlci5pc1Njcm9sbGFibGVCeShldi53aGVlbFggKiBldi5zcGVlZCwgZXYud2hlZWxZICogZXYuc3BlZWQpO1xuICAgICAgICBpZiAoaXNTY3JvbGFibGUgfHwgZHQgPCAyMDApIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbGFzdFNjcm9sbFRpbWUgPSB0O1xuICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJ5KGV2LndoZWVsWCAqIGV2LnNwZWVkLCBldi53aGVlbFkgKiBldi5zcGVlZCk7XG4gICAgICAgICAgICByZXR1cm4gZXYuc3RvcCgpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlRG91YmxlQ2xpY2tIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihlZGl0b3JNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgIHZhciBwb3MgPSBlZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3Iuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgcmFuZ2UgPSBzZXNzaW9uLmdldEJyYWNrZXRSYW5nZShwb3MpO1xuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4tLTtcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RcIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZSA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0V29yZFJhbmdlKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlXb3Jkc1wiKTtcbiAgICAgICAgfVxuICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gcmFuZ2U7XG4gICAgICAgIG1vdXNlSGFuZGxlci5zZWxlY3QoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VUcmlwbGVDbGlja0hhbmRsZXIoZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVkaXRvck1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgdmFyIHBvcyA9IGVkaXRvck1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuXG4gICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEJ5TGluZXNcIik7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2UuaXNNdWx0aUxpbmUoKSAmJiByYW5nZS5jb250YWlucyhwb3Mucm93LCBwb3MuY29sdW1uKSkge1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmVuZCA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJhbmdlLmVuZC5yb3cpLmVuZDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShwb3Mucm93KTtcbiAgICAgICAgfVxuICAgICAgICBtb3VzZUhhbmRsZXIuc2VsZWN0KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlUXVhZENsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QWxsXCIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlciwgdW5pdE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFuY2hvcjtcbiAgICAgICAgdmFyIGN1cnNvciA9IG1vdXNlSGFuZGxlci50ZXh0Q29vcmRpbmF0ZXMoKTtcbiAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvblt1bml0TmFtZV0oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHZhciBjbXBTdGFydCA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uY29tcGFyZVBvaW50KHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgIHZhciBjbXBFbmQgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChyYW5nZS5lbmQpO1xuXG4gICAgICAgICAgICBpZiAoY21wU3RhcnQgPT0gLTEgJiYgY21wRW5kIDw9IDApIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmVuZDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuZW5kLnJvdyAhPSBjdXJzb3Iucm93IHx8IHJhbmdlLmVuZC5jb2x1bW4gIT0gY3Vyc29yLmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXBFbmQgPT0gMSAmJiBjbXBTdGFydCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ICE9IGN1cnNvci5yb3cgfHwgcmFuZ2Uuc3RhcnQuY29sdW1uICE9IGN1cnNvci5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGN1cnNvciA9IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcFN0YXJ0ID09IC0xICYmIGNtcEVuZCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGVkUmFuZ2UgPSBjYWxjUmFuZ2VPcmllbnRhdGlvbihtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IG9yaWVudGVkUmFuZ2UuY3Vyc29yO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG9yaWVudGVkUmFuZ2UuYW5jaG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjYWxjRGlzdGFuY2UoYXg6IG51bWJlciwgYXk6IG51bWJlciwgYng6IG51bWJlciwgYnk6IG51bWJlcikge1xuICAgIHJldHVybiBNYXRoLnNxcnQoTWF0aC5wb3coYnggLSBheCwgMikgKyBNYXRoLnBvdyhieSAtIGF5LCAyKSk7XG59XG5cbmZ1bmN0aW9uIGNhbGNSYW5nZU9yaWVudGF0aW9uKHJhbmdlOiBSYW5nZSwgY3Vyc29yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KTogeyBjdXJzb3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07IGFuY2hvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB9IHtcbiAgICBpZiAocmFuZ2Uuc3RhcnQucm93ID09IHJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgdmFyIGNtcCA9IDIgKiBjdXJzb3IuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uIC0gcmFuZ2UuZW5kLmNvbHVtbjtcbiAgICB9XG4gICAgZWxzZSBpZiAocmFuZ2Uuc3RhcnQucm93ID09IHJhbmdlLmVuZC5yb3cgLSAxICYmICFyYW5nZS5zdGFydC5jb2x1bW4gJiYgIXJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgdmFyIGNtcCA9IGN1cnNvci5jb2x1bW4gLSA0O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdmFyIGNtcCA9IDIgKiBjdXJzb3Iucm93IC0gcmFuZ2Uuc3RhcnQucm93IC0gcmFuZ2UuZW5kLnJvdztcbiAgICB9XG5cbiAgICBpZiAoY21wIDwgMCkge1xuICAgICAgICByZXR1cm4geyBjdXJzb3I6IHJhbmdlLnN0YXJ0LCBhbmNob3I6IHJhbmdlLmVuZCB9O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHsgY3Vyc29yOiByYW5nZS5lbmQsIGFuY2hvcjogcmFuZ2Uuc3RhcnQgfTtcbiAgICB9XG59XG5cbmNsYXNzIEd1dHRlckhhbmRsZXIge1xuICAgIGNvbnN0cnVjdG9yKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgIHZhciBlZGl0b3I6IEVkaXRvciA9IG1vdXNlSGFuZGxlci5lZGl0b3I7XG4gICAgICAgIHZhciBndXR0ZXI6IEd1dHRlciA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXI7XG4gICAgICAgIHZhciB0b29sdGlwID0gbmV3IEd1dHRlclRvb2x0aXAoZWRpdG9yLmNvbnRhaW5lcik7XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlZG93blwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBpZiAoIWVkaXRvci5pc0ZvY3VzZWQoKSB8fCBlLmdldEJ1dHRvbigpICE9IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBndXR0ZXJSZWdpb24gPSBndXR0ZXIuZ2V0UmVnaW9uKGUpO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyUmVnaW9uID09PSBcImZvbGRXaWRnZXRzXCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uID0gZWRpdG9yLnNlc3Npb24uc2VsZWN0aW9uO1xuXG4gICAgICAgICAgICBpZiAoZS5nZXRTaGlmdEtleSgpKSB7XG4gICAgICAgICAgICAgICAgc2VsZWN0aW9uLnNlbGVjdFRvKHJvdywgMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpZiAoZS5kb21FdmVudC5kZXRhaWwgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlMaW5lc1wiKTtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UoZSk7XG4gICAgICAgICAgICByZXR1cm4gZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICB9KTtcblxuXG4gICAgICAgIHZhciB0b29sdGlwVGltZW91dDogbnVtYmVyO1xuICAgICAgICB2YXIgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICAgICAgdmFyIHRvb2x0aXBBbm5vdGF0aW9uO1xuXG4gICAgICAgIGZ1bmN0aW9uIHNob3dUb29sdGlwKCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IG1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBhbm5vdGF0aW9uID0gZ3V0dGVyLiRhbm5vdGF0aW9uc1tyb3ddO1xuICAgICAgICAgICAgaWYgKCFhbm5vdGF0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBtYXhSb3cgPSBlZGl0b3Iuc2Vzc2lvbi5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPT0gbWF4Um93KSB7XG4gICAgICAgICAgICAgICAgdmFyIHNjcmVlblJvdyA9IGVkaXRvci5yZW5kZXJlci5waXhlbFRvU2NyZWVuQ29vcmRpbmF0ZXMoMCwgbW91c2VFdmVudC5jbGllbnRZKS5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IG1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChzY3JlZW5Sb3cgPiBlZGl0b3Iuc2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93KHBvcy5yb3csIHBvcy5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBoaWRlVG9vbHRpcCgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHRvb2x0aXBBbm5vdGF0aW9uID09IGFubm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0b29sdGlwQW5ub3RhdGlvbiA9IGFubm90YXRpb24udGV4dC5qb2luKFwiPGJyLz5cIik7XG5cbiAgICAgICAgICAgIHRvb2x0aXAuc2V0SHRtbCh0b29sdGlwQW5ub3RhdGlvbik7XG5cbiAgICAgICAgICAgIHRvb2x0aXAuc2hvdygpO1xuXG4gICAgICAgICAgICBlZGl0b3Iub24oXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcblxuICAgICAgICAgICAgaWYgKG1vdXNlSGFuZGxlci4kdG9vbHRpcEZvbGxvd3NNb3VzZSkge1xuICAgICAgICAgICAgICAgIG1vdmVUb29sdGlwKG1vdXNlRXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGd1dHRlckVsZW1lbnQgPSBndXR0ZXIuJGNlbGxzW2VkaXRvci5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3cocm93LCAwKV0uZWxlbWVudDtcbiAgICAgICAgICAgICAgICB2YXIgcmVjdCA9IGd1dHRlckVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgICAgICAgICAgdmFyIHN0eWxlID0gdG9vbHRpcC5nZXRFbGVtZW50KCkuc3R5bGU7XG4gICAgICAgICAgICAgICAgc3R5bGUubGVmdCA9IHJlY3QucmlnaHQgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgc3R5bGUudG9wID0gcmVjdC5ib3R0b20gKyBcInB4XCI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBoaWRlVG9vbHRpcCgpIHtcbiAgICAgICAgICAgIGlmICh0b29sdGlwVGltZW91dCkge1xuICAgICAgICAgICAgICAgIGNsZWFyVGltZW91dCh0b29sdGlwVGltZW91dCk7XG4gICAgICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodG9vbHRpcEFubm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICB0b29sdGlwLmhpZGUoKTtcbiAgICAgICAgICAgICAgICB0b29sdGlwQW5ub3RhdGlvbiA9IG51bGw7XG4gICAgICAgICAgICAgICAgZWRpdG9yLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXdoZWVsXCIsIGhpZGVUb29sdGlwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIG1vdmVUb29sdGlwKGV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICB0b29sdGlwLnNldFBvc2l0aW9uKGV2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFkpO1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmVkaXRvci5zZXREZWZhdWx0SGFuZGxlcihcImd1dHRlcm1vdXNlbW92ZVwiLCBmdW5jdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAvLyBGSVhNRTogT2JmdXNjYXRpbmcgdGhlIHR5cGUgb2YgdGFyZ2V0IHRvIHRod2FydCBjb21waWxlci5cbiAgICAgICAgICAgIHZhciB0YXJnZXQ6IGFueSA9IGUuZG9tRXZlbnQudGFyZ2V0IHx8IGUuZG9tRXZlbnQuc3JjRWxlbWVudDtcbiAgICAgICAgICAgIGlmIChoYXNDc3NDbGFzcyh0YXJnZXQsIFwiYWNlX2ZvbGQtd2lkZ2V0XCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0b29sdGlwQW5ub3RhdGlvbiAmJiBtb3VzZUhhbmRsZXIuJHRvb2x0aXBGb2xsb3dzTW91c2UpIHtcbiAgICAgICAgICAgICAgICBtb3ZlVG9vbHRpcChlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbW91c2VFdmVudCA9IGU7XG4gICAgICAgICAgICBpZiAodG9vbHRpcFRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChtb3VzZUV2ZW50ICYmICFtb3VzZUhhbmRsZXIuaXNNb3VzZVByZXNzZWQpXG4gICAgICAgICAgICAgICAgICAgIHNob3dUb29sdGlwKCk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBoaWRlVG9vbHRpcCgpO1xuICAgICAgICAgICAgfSwgNTApO1xuICAgICAgICB9KTtcblxuICAgICAgICBhZGRMaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuJGd1dHRlciwgXCJtb3VzZW91dFwiLCBmdW5jdGlvbihlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBtb3VzZUV2ZW50ID0gbnVsbDtcbiAgICAgICAgICAgIGlmICghdG9vbHRpcEFubm90YXRpb24gfHwgdG9vbHRpcFRpbWVvdXQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIGhpZGVUb29sdGlwKCk7XG4gICAgICAgICAgICB9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGVkaXRvci5vbihcImNoYW5nZVNlc3Npb25cIiwgaGlkZVRvb2x0aXApO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAY2xhc3MgR3V0dGVyVG9vbHRpcFxuICogQGV4dGVuZHMgVG9vbHRpcFxuICovXG5jbGFzcyBHdXR0ZXJUb29sdGlwIGV4dGVuZHMgVG9vbHRpcCB7XG4gICAgY29uc3RydWN0b3IocGFyZW50Tm9kZTogSFRNTEVsZW1lbnQpIHtcbiAgICAgICAgc3VwZXIocGFyZW50Tm9kZSk7XG4gICAgfVxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgc2V0UG9zaXRpb25cbiAgICAgKiBAcGFyYW0geCB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSB5IHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRQb3NpdGlvbih4OiBudW1iZXIsIHk6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgd2luZG93V2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGg7XG4gICAgICAgIHZhciB3aW5kb3dIZWlnaHQgPSB3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodDtcbiAgICAgICAgdmFyIHdpZHRoID0gdGhpcy5nZXRXaWR0aCgpO1xuICAgICAgICB2YXIgaGVpZ2h0ID0gdGhpcy5nZXRIZWlnaHQoKTtcbiAgICAgICAgeCArPSAxNTtcbiAgICAgICAgeSArPSAxNTtcbiAgICAgICAgaWYgKHggKyB3aWR0aCA+IHdpbmRvd1dpZHRoKSB7XG4gICAgICAgICAgICB4IC09ICh4ICsgd2lkdGgpIC0gd2luZG93V2lkdGg7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHkgKyBoZWlnaHQgPiB3aW5kb3dIZWlnaHQpIHtcbiAgICAgICAgICAgIHkgLT0gMjAgKyBoZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgc3VwZXIuc2V0UG9zaXRpb24oeCwgeSk7XG4gICAgfVxufVxuIl19