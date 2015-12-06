class Editor extends eve.EventEmitterClass {
    constructor(renderer, session) {
        super();
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
        this.$opResetTimer = lang.delayedCall(this.endOperation.bind(this));
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
            config.loadModule(["keybinding", keyboardHandler], function (module) {
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
        return this.getOption("fontSize") || dom.computedStyle(this.container, "fontSize");
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
                var range = new rng.Range(pos.row, pos.column, pos.row, pos.column + 1);
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
            var range = new rng.Range(row, column, row, column + token.value.length);
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
    }
    onTextInput(text) {
        this.keyBinding.onTextInput(text);
        if (text === '.') {
            this.commands.exec(protocol.COMMAND_NAME_AUTO_COMPLETE);
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
            range = new rng.Range(cursor.row, column - 1, cursor.row, column + 1);
        }
        else {
            swap = line.charAt(column - 1) + line.charAt(column - 2);
            range = new rng.Range(cursor.row, column - 2, cursor.row, column);
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
        var deleteRange = new rng.Range(0, 0, 0, 0);
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
    }
    removeLines() {
        var rows = this.$getSelectedRows();
        var range;
        if (rows.first === 0 || rows.last + 1 < this.session.getLength())
            range = new rng.Range(rows.first, 0, rows.last + 1, 0);
        else
            range = new rng.Range(rows.first - 1, this.session.getLine(rows.first - 1).length, rows.last, this.session.getLine(rows.last).length);
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
        dom.setCssClass(cursorLayer.element, "ace_slim-cursors", /slim/.test(style));
    }
}
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
    }
    cancelContextMenu() {
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
config.defineOptions(MouseHandler.prototype, "mouseHandler", {
    scrollSpeed: { initialValue: 2 },
    dragDelay: { initialValue: (userAgent.isMac ? 150 : 0) },
    dragEnabled: { initialValue: true },
    focusTimout: { initialValue: 0 },
    tooltipFollowsMouse: { initialValue: true }
});
class EditorMouseEvent {
    constructor(domEvent, editor) {
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
    get toElement() {
        return this.domEvent.toElement;
    }
    stopPropagation() {
        event.stopPropagation(this.domEvent);
        this.propagationStopped = true;
    }
    preventDefault() {
        event.preventDefault(this.domEvent);
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
        return event.getButton(this.domEvent);
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
}
class GutterTooltip extends ttm.Tooltip {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0VkaXRvci50cyJdLCJuYW1lcyI6WyJFZGl0b3IiLCJFZGl0b3IuY29uc3RydWN0b3IiLCJFZGl0b3IuY2FuY2VsTW91c2VDb250ZXh0TWVudSIsIkVkaXRvci5zZWxlY3Rpb24iLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMiLCJFZGl0b3IuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMubGFzdCIsIkVkaXRvci5zdGFydE9wZXJhdGlvbiIsIkVkaXRvci5lbmRPcGVyYXRpb24iLCJFZGl0b3IuJGhpc3RvcnlUcmFja2VyIiwiRWRpdG9yLnNldEtleWJvYXJkSGFuZGxlciIsIkVkaXRvci5nZXRLZXlib2FyZEhhbmRsZXIiLCJFZGl0b3Iuc2V0U2Vzc2lvbiIsIkVkaXRvci5nZXRTZXNzaW9uIiwiRWRpdG9yLnNldFZhbHVlIiwiRWRpdG9yLmdldFZhbHVlIiwiRWRpdG9yLmdldFNlbGVjdGlvbiIsIkVkaXRvci5yZXNpemUiLCJFZGl0b3Iuc2V0VGhlbWUiLCJFZGl0b3IuZ2V0VGhlbWUiLCJFZGl0b3Iuc2V0U3R5bGUiLCJFZGl0b3IudW5zZXRTdHlsZSIsIkVkaXRvci5nZXRGb250U2l6ZSIsIkVkaXRvci5zZXRGb250U2l6ZSIsIkVkaXRvci4kaGlnaGxpZ2h0QnJhY2tldHMiLCJFZGl0b3IuJGhpZ2hsaWdodFRhZ3MiLCJFZGl0b3IuZm9jdXMiLCJFZGl0b3IuaXNGb2N1c2VkIiwiRWRpdG9yLmJsdXIiLCJFZGl0b3Iub25Gb2N1cyIsIkVkaXRvci5vbkJsdXIiLCJFZGl0b3IuJGN1cnNvckNoYW5nZSIsIkVkaXRvci5vbkRvY3VtZW50Q2hhbmdlIiwiRWRpdG9yLm9uVG9rZW5pemVyVXBkYXRlIiwiRWRpdG9yLm9uU2Nyb2xsVG9wQ2hhbmdlIiwiRWRpdG9yLm9uU2Nyb2xsTGVmdENoYW5nZSIsIkVkaXRvci5vbkN1cnNvckNoYW5nZSIsIkVkaXRvci4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5vblNlbGVjdGlvbkNoYW5nZSIsIkVkaXRvci4kZ2V0U2VsZWN0aW9uSGlnaExpZ2h0UmVnZXhwIiwiRWRpdG9yLm9uQ2hhbmdlRnJvbnRNYXJrZXIiLCJFZGl0b3Iub25DaGFuZ2VCYWNrTWFya2VyIiwiRWRpdG9yLm9uQ2hhbmdlQnJlYWtwb2ludCIsIkVkaXRvci5vbkNoYW5nZUFubm90YXRpb24iLCJFZGl0b3Iub25DaGFuZ2VNb2RlIiwiRWRpdG9yLm9uQ2hhbmdlV3JhcExpbWl0IiwiRWRpdG9yLm9uQ2hhbmdlV3JhcE1vZGUiLCJFZGl0b3Iub25DaGFuZ2VGb2xkIiwiRWRpdG9yLmdldFNlbGVjdGVkVGV4dCIsIkVkaXRvci5nZXRDb3B5VGV4dCIsIkVkaXRvci5vbkNvcHkiLCJFZGl0b3Iub25DdXQiLCJFZGl0b3Iub25QYXN0ZSIsIkVkaXRvci5leGVjQ29tbWFuZCIsIkVkaXRvci5pbnNlcnQiLCJFZGl0b3Iub25UZXh0SW5wdXQiLCJFZGl0b3Iub25Db21tYW5kS2V5IiwiRWRpdG9yLnNldE92ZXJ3cml0ZSIsIkVkaXRvci5nZXRPdmVyd3JpdGUiLCJFZGl0b3IudG9nZ2xlT3ZlcndyaXRlIiwiRWRpdG9yLnNldFNjcm9sbFNwZWVkIiwiRWRpdG9yLmdldFNjcm9sbFNwZWVkIiwiRWRpdG9yLnNldERyYWdEZWxheSIsIkVkaXRvci5nZXREcmFnRGVsYXkiLCJFZGl0b3Iuc2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3IuZ2V0U2VsZWN0aW9uU3R5bGUiLCJFZGl0b3Iuc2V0SGlnaGxpZ2h0QWN0aXZlTGluZSIsIkVkaXRvci5nZXRIaWdobGlnaHRBY3RpdmVMaW5lIiwiRWRpdG9yLnNldEhpZ2hsaWdodEd1dHRlckxpbmUiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSIsIkVkaXRvci5zZXRIaWdobGlnaHRTZWxlY3RlZFdvcmQiLCJFZGl0b3IuZ2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkIiwiRWRpdG9yLnNldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLmdldEFuaW1hdGVkU2Nyb2xsIiwiRWRpdG9yLnNldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLmdldFNob3dJbnZpc2libGVzIiwiRWRpdG9yLnNldERpc3BsYXlJbmRlbnRHdWlkZXMiLCJFZGl0b3IuZ2V0RGlzcGxheUluZGVudEd1aWRlcyIsIkVkaXRvci5zZXRTaG93UHJpbnRNYXJnaW4iLCJFZGl0b3IuZ2V0U2hvd1ByaW50TWFyZ2luIiwiRWRpdG9yLnNldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLmdldFByaW50TWFyZ2luQ29sdW1uIiwiRWRpdG9yLnNldFJlYWRPbmx5IiwiRWRpdG9yLmdldFJlYWRPbmx5IiwiRWRpdG9yLnNldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLmdldEJlaGF2aW91cnNFbmFibGVkIiwiRWRpdG9yLnNldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCIsIkVkaXRvci5nZXRXcmFwQmVoYXZpb3Vyc0VuYWJsZWQiLCJFZGl0b3Iuc2V0U2hvd0ZvbGRXaWRnZXRzIiwiRWRpdG9yLmdldFNob3dGb2xkV2lkZ2V0cyIsIkVkaXRvci5zZXRGYWRlRm9sZFdpZGdldHMiLCJFZGl0b3IuZ2V0RmFkZUZvbGRXaWRnZXRzIiwiRWRpdG9yLnJlbW92ZSIsIkVkaXRvci5yZW1vdmVXb3JkUmlnaHQiLCJFZGl0b3IucmVtb3ZlV29yZExlZnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lU3RhcnQiLCJFZGl0b3IucmVtb3ZlVG9MaW5lRW5kIiwiRWRpdG9yLnNwbGl0TGluZSIsIkVkaXRvci50cmFuc3Bvc2VMZXR0ZXJzIiwiRWRpdG9yLnRvTG93ZXJDYXNlIiwiRWRpdG9yLnRvVXBwZXJDYXNlIiwiRWRpdG9yLmluZGVudCIsIkVkaXRvci5ibG9ja0luZGVudCIsIkVkaXRvci5ibG9ja091dGRlbnQiLCJFZGl0b3Iuc29ydExpbmVzIiwiRWRpdG9yLnRvZ2dsZUNvbW1lbnRMaW5lcyIsIkVkaXRvci50b2dnbGVCbG9ja0NvbW1lbnQiLCJFZGl0b3IuZ2V0TnVtYmVyQXQiLCJFZGl0b3IubW9kaWZ5TnVtYmVyIiwiRWRpdG9yLnJlbW92ZUxpbmVzIiwiRWRpdG9yLmR1cGxpY2F0ZVNlbGVjdGlvbiIsIkVkaXRvci5tb3ZlTGluZXNEb3duIiwiRWRpdG9yLm1vdmVMaW5lc1VwIiwiRWRpdG9yLm1vdmVUZXh0IiwiRWRpdG9yLmNvcHlMaW5lc1VwIiwiRWRpdG9yLmNvcHlMaW5lc0Rvd24iLCJFZGl0b3IuJG1vdmVMaW5lcyIsIkVkaXRvci4kZ2V0U2VsZWN0ZWRSb3dzIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25TdGFydCIsIkVkaXRvci5vbkNvbXBvc2l0aW9uVXBkYXRlIiwiRWRpdG9yLm9uQ29tcG9zaXRpb25FbmQiLCJFZGl0b3IuZ2V0Rmlyc3RWaXNpYmxlUm93IiwiRWRpdG9yLmdldExhc3RWaXNpYmxlUm93IiwiRWRpdG9yLmlzUm93VmlzaWJsZSIsIkVkaXRvci5pc1Jvd0Z1bGx5VmlzaWJsZSIsIkVkaXRvci4kZ2V0VmlzaWJsZVJvd0NvdW50IiwiRWRpdG9yLiRtb3ZlQnlQYWdlIiwiRWRpdG9yLnNlbGVjdFBhZ2VEb3duIiwiRWRpdG9yLnNlbGVjdFBhZ2VVcCIsIkVkaXRvci5nb3RvUGFnZURvd24iLCJFZGl0b3IuZ290b1BhZ2VVcCIsIkVkaXRvci5zY3JvbGxQYWdlRG93biIsIkVkaXRvci5zY3JvbGxQYWdlVXAiLCJFZGl0b3Iuc2Nyb2xsVG9Sb3ciLCJFZGl0b3Iuc2Nyb2xsVG9MaW5lIiwiRWRpdG9yLmNlbnRlclNlbGVjdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvbiIsIkVkaXRvci5nZXRDdXJzb3JQb3NpdGlvblNjcmVlbiIsIkVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSIsIkVkaXRvci5zZWxlY3RBbGwiLCJFZGl0b3IuY2xlYXJTZWxlY3Rpb24iLCJFZGl0b3IubW92ZUN1cnNvclRvIiwiRWRpdG9yLm1vdmVDdXJzb3JUb1Bvc2l0aW9uIiwiRWRpdG9yLmp1bXBUb01hdGNoaW5nIiwiRWRpdG9yLmdvdG9MaW5lIiwiRWRpdG9yLm5hdmlnYXRlVG8iLCJFZGl0b3IubmF2aWdhdGVVcCIsIkVkaXRvci5uYXZpZ2F0ZURvd24iLCJFZGl0b3IubmF2aWdhdGVMZWZ0IiwiRWRpdG9yLm5hdmlnYXRlUmlnaHQiLCJFZGl0b3IubmF2aWdhdGVMaW5lU3RhcnQiLCJFZGl0b3IubmF2aWdhdGVMaW5lRW5kIiwiRWRpdG9yLm5hdmlnYXRlRmlsZUVuZCIsIkVkaXRvci5uYXZpZ2F0ZUZpbGVTdGFydCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRSaWdodCIsIkVkaXRvci5uYXZpZ2F0ZVdvcmRMZWZ0IiwiRWRpdG9yLnJlcGxhY2UiLCJFZGl0b3IucmVwbGFjZUFsbCIsIkVkaXRvci4kdHJ5UmVwbGFjZSIsIkVkaXRvci5nZXRMYXN0U2VhcmNoT3B0aW9ucyIsIkVkaXRvci5maW5kIiwiRWRpdG9yLmZpbmROZXh0IiwiRWRpdG9yLmZpbmRQcmV2aW91cyIsIkVkaXRvci5yZXZlYWxSYW5nZSIsIkVkaXRvci51bmRvIiwiRWRpdG9yLnJlZG8iLCJFZGl0b3IuZGVzdHJveSIsIkVkaXRvci5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXciLCJFZGl0b3IuJHJlc2V0Q3Vyc29yU3R5bGUiLCJGb2xkSGFuZGxlciIsIkZvbGRIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyIiwiTW91c2VIYW5kbGVyLmNvbnN0cnVjdG9yIiwiTW91c2VIYW5kbGVyLm9uTW91c2VFdmVudCIsIk1vdXNlSGFuZGxlci5vbk1vdXNlTW92ZSIsIk1vdXNlSGFuZGxlci5lbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50IiwiTW91c2VIYW5kbGVyLnNldFN0YXRlIiwiTW91c2VIYW5kbGVyLnRleHRDb29yZGluYXRlcyIsIk1vdXNlSGFuZGxlci5jYXB0dXJlTW91c2UiLCJNb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUiLCJNb3VzZUhhbmRsZXIuc2VsZWN0IiwiTW91c2VIYW5kbGVyLnNlbGVjdEJ5TGluZXNFbmQiLCJNb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QiLCJNb3VzZUhhbmRsZXIuc2VsZWN0RW5kIiwiTW91c2VIYW5kbGVyLnNlbGVjdEFsbEVuZCIsIk1vdXNlSGFuZGxlci5zZWxlY3RCeVdvcmRzRW5kIiwiTW91c2VIYW5kbGVyLmZvY3VzV2FpdCIsIkVkaXRvck1vdXNlRXZlbnQiLCJFZGl0b3JNb3VzZUV2ZW50LmNvbnN0cnVjdG9yIiwiRWRpdG9yTW91c2VFdmVudC50b0VsZW1lbnQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3BQcm9wYWdhdGlvbiIsIkVkaXRvck1vdXNlRXZlbnQucHJldmVudERlZmF1bHQiLCJFZGl0b3JNb3VzZUV2ZW50LnN0b3AiLCJFZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24iLCJFZGl0b3JNb3VzZUV2ZW50LmluU2VsZWN0aW9uIiwiRWRpdG9yTW91c2VFdmVudC5nZXRCdXR0b24iLCJFZGl0b3JNb3VzZUV2ZW50LmdldFNoaWZ0S2V5IiwibWFrZU1vdXNlRG93bkhhbmRsZXIiLCJtYWtlTW91c2VXaGVlbEhhbmRsZXIiLCJtYWtlRG91YmxlQ2xpY2tIYW5kbGVyIiwibWFrZVRyaXBsZUNsaWNrSGFuZGxlciIsIm1ha2VRdWFkQ2xpY2tIYW5kbGVyIiwibWFrZUV4dGVuZFNlbGVjdGlvbkJ5IiwiY2FsY0Rpc3RhbmNlIiwiY2FsY1JhbmdlT3JpZW50YXRpb24iLCJHdXR0ZXJIYW5kbGVyIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3RvciIsIkd1dHRlckhhbmRsZXIuY29uc3RydWN0b3Iuc2hvd1Rvb2x0aXAiLCJHdXR0ZXJIYW5kbGVyLmNvbnN0cnVjdG9yLmhpZGVUb29sdGlwIiwiR3V0dGVySGFuZGxlci5jb25zdHJ1Y3Rvci5tb3ZlVG9vbHRpcCIsIkd1dHRlclRvb2x0aXAiLCJHdXR0ZXJUb29sdGlwLmNvbnN0cnVjdG9yIiwiR3V0dGVyVG9vbHRpcC5zZXRQb3NpdGlvbiJdLCJtYXBwaW5ncyI6IkFBNEVBLHFCQUFxQixHQUFHLENBQUMsaUJBQWlCO0lBOER0Q0EsWUFBWUEsUUFBNkJB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SUFBSUEsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLElBQUlBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxLQUFLQSxTQUFTQSxDQUFDQTtnQkFDcENBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFFakNBLFdBQVdBLEdBQUdBLFdBQVdBO21CQUNsQkEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQTttQkFDckJBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBRWxEQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2pDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxXQUFXQSxHQUFHQSxXQUFXQTttQkFDbEJBLGlCQUFpQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQ0NBLElBQUlBLENBQUNBLGdCQUFnQkEsSUFBSUEsUUFBUUE7ZUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFDN0NBLENBQUNBLENBQUNBLENBQUNB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QkFBZ0JBLENBQUNBLGVBQWVBLEVBQUVBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7WUFFakVBLElBQUlBLENBQUNBLGtCQUFrQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsQ0FBQ0E7WUFFckVBLElBQUlBLENBQUNBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxREEsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7WUFFbkVBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2xEQSxPQUFPQSxDQUFDQSxnQkFBZ0JBLENBQUNBLFlBQVlBLEVBQUVBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1lBRTNEQSxJQUFJQSxDQUFDQSxvQkFBb0JBLEdBQUdBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDaEVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBO1lBRTlFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRTVFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRTVFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBO1lBRTVFQSxJQUFJQSxDQUFDQSxlQUFlQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxpQkFBaUJBLEVBQUVBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1lBRXZFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDNURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1lBRTFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDOURBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGdCQUFnQkEsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNB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LENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLFNBQVNBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQy9DQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM1Q0EsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2hEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUMzQkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFDL0NBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBR2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxVQUFVQSxJQUFJQSxDQUFDQSxJQUFJQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUMzQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsUUFBUUEsSUFBSUEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakRBLE1BQU1BLENBQUNBO1FBRVhBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3RFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxN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QSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdENBLElBQUlBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNsREEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0VBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO1FBRXRCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUMxQkEsSUFBSUEsU0FBU0EsR0FBR0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLElBQUlBLElBQUlBLEdBQUdBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3ZDQSxJQUFJQSxhQUFhQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM3REEsSUFBSUEsR0FBR0EsR0FBR0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFdkNBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbENBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FDNUJBLElBQUlBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLEdBQUdBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEVBQ3BEQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxHQUFHQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6REEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FDNUJBLElBQUlBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEVBQzdDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUN0QkEsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsRUFDbkNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4Q0EsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxPQUFPQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUV6R0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDbkVBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFNBQVNBLEVBQUVBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO0lBQ3pEQSxDQUFDQTtJQUVEckQsV0FBV0EsQ0FBQ0EsSUFBWUE7UUFDcEJzRCxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUVsQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsMEJBQTBCQSxDQUFDQSxDQUFDQTtRQUM1REEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdkRBLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFXbERBLENBQUNBO0lBQ0xBLENBQUNBO0lBRUR0RCxZQUFZQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxPQUFPQTtRQUMzQnVELElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3JEQSxDQUFDQTtJQVNEdkQsWUFBWUEsQ0FBQ0EsU0FBa0JBO1FBQzNCd0QsSUFBSUEsQ0FBQ0EsT0FBT0Es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QUVBLE1BQU1BLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQzFFQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6REEsS0FBS0EsR0FBR0EsSUFBSUEsR0FBR0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdEVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ3RDQSxDQUFDQTtJQUtEakcsV0FBV0E7UUFDUGtHLElBQUlBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7UUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzNCQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtRQUNoQ0EsQ0FBQ0E7UUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxDQUFDQTtRQUNyQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBO1FBQ2hE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QSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQTtpQkFDN0JBLENBQUNBO2dCQUNGQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNsQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBTUQxRyxZQUFZQSxDQUFDQSxNQUFNQTtRQUNmMkcsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDekNBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBLE1BQU1BLENBQUNBO1FBRy9DQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUU1REEsSUFBSUEsQ0FBQ0EsR0FBR0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFekRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTNCQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUV2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ0xBLElBQUlBLEVBQUVBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBO2dCQUNwRkEsSUFBSUEsUUFBUUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0E7Z0JBRS9DQSxJQUFJQSxDQUFDQSxHQUFHQSxVQUFVQSxDQUFDQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDN0JBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO2dCQUc1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9CQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxHQUFHQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaERBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtvQkFDSkEsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzVDQSxDQUFDQTtnQkFFREEsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0E7Z0JBQ1pBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO2dCQUM1QkEsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBRzlCQSxJQUFJQSxZQUFZQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxLQUFLQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDN0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO2dCQUd4Q0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFMUZBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBTUQzRyxXQUFXQTtRQUNQNEcsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtRQUNuQ0EsSUFBSUEsS0FBS0EsQ0FBQ0E7UUFDVkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDN0RBLEtBQUtBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQzNEQSxJQUFJQTtZQUNBQSxLQUFLQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUNqQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFB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R0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7WUFDUkEsR0FBR0EsRUFBRUEsR0FBR0E7U0FDWEEsQ0FBQ0E7UUFFRkEsR0FBR0EsQ0FBQ0E7WUFDQUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDM0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsUUFBUUEsQ0FBQ0E7b0JBQ2JBLENBQUNBO29CQUVEQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFFdEZBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM1QkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3JCQSxLQUFLQSxHQUFHQSxDQUFDQTt3QkFDVEEsS0FBS0EsR0FBR0Es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QUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEdBQUdBLENBQUNBLEVBQ3BDQSxRQUFRQSxDQUFDQSxrQkFBa0JBLEVBQUVBLEVBQzdCQSxRQUFRQSxDQUFDQSxxQkFBcUJBLEVBQUVBLEdBQUdBLENBQUNBLENBQ3ZDQSxDQUFDQTtZQUdGQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakRBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO2dCQUNkQSxHQUFHQSxDQUFDQTtvQkFDQUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0E7b0JBQ2xCQSxTQUFTQSxHQUFHQSxRQUFRQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtvQkFFcENBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNaQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDN0NBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLGtCQUFrQkEsRUFBRUEsRUFBRUEsUUFBUUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDdEZBLENBQUNBO3dCQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxLQUFLQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDL0RBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dDQUMxQkEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7NEJBQ2pCQSxDQUFDQTs0QkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0NBQ2xDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQTs0QkFDakJBLENBQUNBOzRCQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQ0FDakJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO3dCQUNyQkEsQ0FBQ0E7b0JBQ0xBLENBQUNBO2dCQUNMQSxDQUFDQSxRQUFRQSxTQUFTQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQTtZQUNsQ0EsQ0FBQ0E7WUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDdEJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUNsRUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDeEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEdBQUdBLEdBQUdBLEtBQUtBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBO1FBQ3RDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNOQSxFQUFFQSxD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QU1BLENBQUNBO1lBQ3REQSxPQUFPQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0E7WUFDL0JBLEdBQUdBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBRS9CQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekJBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBO21CQUNsQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDdkVBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQzlDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBO1lBQ2ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBLENBQUNBO1FBRXZDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUMvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsYUFBYUEsQ0FBQ0E7WUFDdEJBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBO1FBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtZQUNwQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLENBQUNBO1lBQ2xCQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUM1QkEsSUFBSUE7WUFDQUEsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO0lBQ25DQSxDQUFDQTtJQVVEL0osUUFBUUEsQ0FBQ0EsTUFBMEJBLEVBQUVBLE9BQWlCQTtRQUVsRGdLLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLFdBQVdBLEVBQUVBLElBQUlBLEVBQUVBLFNBQVNBLEVBQUVBLEtBQUtBLEVBQUVBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3hFQSxDQUFDQTtJQVVEaEssWUFBWUEsQ0FBQ0EsTUFBMEJBLEVBQUVBLE9BQWlCQTtRQUN0RGlLLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLFdBQVdBLEVBQUVBLElBQUlBLEVBQUVBLFNBQVNBLEVBQUVBLElBQUlBLEVBQUVBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQ3ZFQSxDQUFDQTtJQUVEakssV0FBV0EsQ0FBQ0EsS0FBa0JBLEVBQUVBLE9BQWdCQTtRQUM1Q2tLLElBQUlBLENBQUNBLGVBQWVBLElBQUlBLENBQUNBLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUMzQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsQ0FBQ0EsZUFBZUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFMUJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFNBQVNBLENBQUNBO1FBQ3hDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSx1QkFBdUJBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1FBQ25FQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxLQUFLQSxLQUFLQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUNsREEsQ0FBQ0E7SUFNRGxLLElBQUlBO1FBQ0FtSyxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQTtRQUN2QkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDckNBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxvQkFBb0JBLENBQUNBLElBQUlBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO0lBQ2xEQSxDQUFDQTtJQU1EbkssSUFBSUE7UUFDQW9LLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQSxJQUFJQSxFQUFFQSxDQUFDQTtRQUNyQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDdkJBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDbERBLENBQUNBO0lBTURwSyxPQUFPQTtRQUNIcUssSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsRUFBRUEsQ0FBQ0E7UUFDeEJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ2xDQSxDQUFDQTtJQU1EckssMkJBQTJCQSxDQUFDQSxNQUFlQTtRQUN2Q3NLLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1lBQ1JBLE1BQU1BLENBQUNBO1FBQ1hBLElBQUlBLElBQUlBLENBQUNBO1FBQ1RBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2hCQSxJQUFJQSxZQUFZQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0E7WUFDcEJBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLFFBQVFBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3ZEQSxJQUFJQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQTtRQUN0Q0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsR0FBR0EsbUJBQW1CQSxDQUFDQTtRQUNqREEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsWUFBWUEsRUFBRUEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDckVBLElBQUlBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsaUJBQWlCQSxFQUFFQTtZQUMvQyxZQUFZLEdBQUcsSUFBSSxDQUFDO1FBQ3hCLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFFSEEsSUFBSUEsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsY0FBY0EsRUFBRUE7WUFDbEQsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDO2dCQUNiLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBQy9ELENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDSEEsSUFBSUEsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsYUFBYUEsRUFBRUE7WUFDaEQsRUFBRSxDQUFDLENBQUMsWUFBWSxJQUFJLElBQUksSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUMzQyxJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO2dCQUM3QixJQUFJLEdBQUcsR0FBRyxRQUFRLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQztnQkFDMUMsSUFBSSxNQUFNLEdBQUcsUUFBUSxDQUFDLFdBQVcsQ0FBQztnQkFDbEMsSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDO2dCQUNsQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNyQyxZQUFZLEdBQUcsSUFBSSxDQUFDO2dCQUN4QixDQUFDO2dCQUNELElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxNQUFNO29CQUM1QixHQUFHLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEdBQUcsTUFBTSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztvQkFDOUQsWUFBWSxHQUFHLEtBQUssQ0FBQztnQkFDekIsQ0FBQztnQkFDRCxJQUFJLENBQUMsQ0FBQztvQkFDRixZQUFZLEdBQUcsSUFBSSxDQUFDO2dCQUN4QixDQUFDO2dCQUNELEVBQUUsQ0FBQyxDQUFDLFlBQVksSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUN2QixZQUFZLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDO29CQUNwQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksR0FBRyxHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztvQkFDMUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUM7b0JBQ3JELFlBQVksQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQzlDLENBQUM7Z0JBQ0QsWUFBWSxHQUFHLElBQUksR0FBRyxJQUFJLENBQUM7WUFDL0IsQ0FBQztRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDSEEsSUFBSUEsQ0FBQ0EsMkJBQTJCQSxHQUFHQSxVQUFTQSxNQUFNQTtZQUM5QyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUM7Z0JBQ1AsTUFBTSxDQUFDO1lBQ1gsT0FBTyxJQUFJLENBQUMsMkJBQTJCLENBQUM7WUFDeEMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLENBQUM7WUFDL0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsYUFBYSxDQUFDLENBQUM7WUFDaEUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDdEUsQ0FBQyxDQUFDQTtJQUNOQSxDQUFDQTtJQUdEdEssaUJBQWlCQTtRQUNidUssSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsSUFBSUEsS0FBS0EsQ0FBQ0E7UUFDdkNBLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFlBQVlBLENBQUNBO1FBQzdDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQTtZQUNiQSxNQUFNQSxDQUFDQTtRQUNYQSxXQUFXQSxDQUFDQSxpQkFBaUJBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BEQSxXQUFXQSxDQUFDQSxVQUFVQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxJQUFJQSxLQUFLQSxJQUFJQSxNQUFNQSxDQUFDQTtRQUM1REEsR0FBR0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsT0FBT0EsRUFBRUEsa0JBQWtCQSxFQUFFQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNqRkEsQ0FBQ0E7QUFDTHZLLENBQUNBO0FBSUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLFFBQVEsRUFBRTtJQUM3QyxjQUFjLEVBQUU7UUFDWixHQUFHLEVBQUUsVUFBUyxLQUFLO1lBQ2YsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUM7WUFDekIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxzQkFBc0IsRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQzFELENBQUM7UUFDRCxZQUFZLEVBQUUsTUFBTTtLQUN2QjtJQUNELG1CQUFtQixFQUFFO1FBQ2pCLEdBQUcsRUFBRSxjQUFhLElBQUksQ0FBQywwQkFBMEIsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN0RCxZQUFZLEVBQUUsSUFBSTtLQUNyQjtJQUNELHFCQUFxQixFQUFFO1FBQ25CLEdBQUcsRUFBRSxVQUFTLGVBQWUsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDN0QsWUFBWSxFQUFFLElBQUk7S0FDckI7SUFDRCxRQUFRLEVBQUU7UUFDTixHQUFHLEVBQUUsVUFBUyxRQUFRO1lBR2xCLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQzdCLENBQUM7UUFDRCxZQUFZLEVBQUUsS0FBSztLQUN0QjtJQUNELFdBQVcsRUFBRTtRQUNULEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDaEQsTUFBTSxFQUFFLENBQUMsS0FBSyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDO1FBQ3pDLFlBQVksRUFBRSxLQUFLO0tBQ3RCO0lBQ0QsZUFBZSxFQUFFO1FBQ2IsTUFBTSxFQUFFLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxRQUFRLENBQUM7UUFDL0IsWUFBWSxFQUFFLElBQUk7S0FDckI7SUFDRCxpQkFBaUIsRUFBRSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUU7SUFDekMscUJBQXFCLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFO0lBQzdDLHdCQUF3QixFQUFFO1FBQ3RCLEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsMkJBQTJCLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO0tBQy9EO0lBRUQsdUJBQXVCLEVBQUUsVUFBVTtJQUNuQyx1QkFBdUIsRUFBRSxVQUFVO0lBQ25DLG1CQUFtQixFQUFFLFVBQVU7SUFDL0IsY0FBYyxFQUFFLFVBQVU7SUFDMUIsY0FBYyxFQUFFLFVBQVU7SUFDMUIsZUFBZSxFQUFFLFVBQVU7SUFDM0IsaUJBQWlCLEVBQUUsVUFBVTtJQUM3QixXQUFXLEVBQUUsVUFBVTtJQUN2QixlQUFlLEVBQUUsVUFBVTtJQUMzQixlQUFlLEVBQUUsVUFBVTtJQUMzQixlQUFlLEVBQUUsVUFBVTtJQUMzQixVQUFVLEVBQUUsVUFBVTtJQUN0QixtQkFBbUIsRUFBRSxVQUFVO0lBQy9CLFFBQVEsRUFBRSxVQUFVO0lBQ3BCLFVBQVUsRUFBRSxVQUFVO0lBQ3RCLFFBQVEsRUFBRSxVQUFVO0lBQ3BCLFFBQVEsRUFBRSxVQUFVO0lBQ3BCLGFBQWEsRUFBRSxVQUFVO0lBQ3pCLGdCQUFnQixFQUFFLFVBQVU7SUFDNUIsS0FBSyxFQUFFLFVBQVU7SUFFakIsV0FBVyxFQUFFLGVBQWU7SUFDNUIsU0FBUyxFQUFFLGVBQWU7SUFDMUIsV0FBVyxFQUFFLGVBQWU7SUFDNUIsV0FBVyxFQUFFLGVBQWU7SUFDNUIsbUJBQW1CLEVBQUUsZUFBZTtJQUVwQyxlQUFlLEVBQUUsU0FBUztJQUMxQixTQUFTLEVBQUUsU0FBUztJQUNwQixXQUFXLEVBQUUsU0FBUztJQUN0QixTQUFTLEVBQUUsU0FBUztJQUNwQixXQUFXLEVBQUUsU0FBUztJQUN0QixPQUFPLEVBQUUsU0FBUztJQUNsQixJQUFJLEVBQUUsU0FBUztJQUNmLFNBQVMsRUFBRSxTQUFTO0lBQ3BCLElBQUksRUFBRSxTQUFTO0NBQ2xCLENBQUMsQ0FBQztBQUVIO0lBQ0l3SyxZQUFZQSxNQUFjQTtRQUl0QkMsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsT0FBT0EsRUFBRUEsVUFBU0EsQ0FBbUJBO1lBQzNDLElBQUksUUFBUSxHQUFHLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQ3ZDLElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7WUFHN0IsSUFBSSxJQUFJLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDL0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDUCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUNsQixPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3QixDQUFDO2dCQUNELElBQUksQ0FBQyxDQUFDO29CQUNGLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzdCLENBQUM7Z0JBQ0QsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ2IsQ0FBQztZQUNELElBQUksQ0FBQyxDQUFDO1lBQ04sQ0FBQztRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFHSEEsTUFBTUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsYUFBYUEsRUFBRUEsVUFBU0EsQ0FBbUJBO1lBQ2pELElBQUksWUFBWSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3RCxFQUFFLENBQUMsQ0FBQyxZQUFZLEtBQUssYUFBYSxDQUFDLENBQUMsQ0FBQztnQkFDakMsSUFBSSxHQUFHLEdBQUcsQ0FBQyxDQUFDLG1CQUFtQixFQUFFLENBQUMsR0FBRyxDQUFDO2dCQUN0QyxJQUFJLE9BQU8sR0FBRyxNQUFNLENBQUMsT0FBTyxDQUFDO2dCQUM3QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksT0FBTyxDQUFDLGFBQWEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDeEQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDaEQsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxDQUFDLENBQUM7b0JBQ3RCLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDbkIsQ0FBQztnQkFDRCxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDYixDQUFDO1FBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtRQUVIQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLFVBQVNBLENBQW1CQTtZQUNwRCxJQUFJLFlBQVksR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFFN0QsRUFBRSxDQUFDLENBQUMsWUFBWSxJQUFJLGFBQWEsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hDLElBQUksR0FBRyxHQUFHLENBQUMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDLEdBQUcsQ0FBQztnQkFDdEMsSUFBSSxPQUFPLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQztnQkFDN0IsSUFBSSxJQUFJLEdBQUcsT0FBTyxDQUFDLHdCQUF3QixDQUFDLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO2dCQUN4RCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUM7Z0JBRTFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ1IsR0FBRyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDO29CQUN0QixJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFFbEUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDUCxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUM3QixDQUFDO29CQUNELElBQUksQ0FBQyxDQUFDO3dCQUNGLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQ2pDLE1BQU0sQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7b0JBQzlFLENBQUM7Z0JBQ0wsQ0FBQztnQkFDRCxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDYixDQUFDO1FBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtBQUNMRCxDQUFDQTtBQU1EO0lBdUJJRSxZQUFZQSxNQUFjQTtRQXJCbEJDLGlCQUFZQSxHQUFXQSxDQUFDQSxDQUFDQTtRQUN6QkEsZUFBVUEsR0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLGlCQUFZQSxHQUFZQSxJQUFJQSxDQUFDQTtRQUM5QkEsaUJBQVlBLEdBQVdBLENBQUNBLENBQUNBO1FBQ3pCQSx5QkFBb0JBLEdBQVlBLElBQUlBLENBQUNBO1FBYXJDQSxvQkFBZUEsR0FBY0EsSUFBSUEsQ0FBQ0E7UUFPckNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2pCQSxJQUFJQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUdyQkEsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxXQUFXQSxFQUFFQSxvQkFBb0JBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQzFFQSxNQUFNQSxDQUFDQSxpQkFBaUJBLENBQUNBLFlBQVlBLEVBQUVBLHFCQUFxQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUVBLE1BQU1BLENBQUNBLGlCQUFpQkEsQ0FBQ0EsVUFBVUEsRUFBRUEsc0JBQXNCQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMzRUEsTUFBTUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxhQUFhQSxFQUFFQSxzQkFBc0JBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQzlFQSxNQUFNQSxDQUFDQSxpQkFBaUJBLENBQUNBLFdBQVdBLEVBQUVBLG9CQUFvQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFMUVBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLHFCQUFxQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsRUFBRUEsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDekVBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLHFCQUFxQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsRUFBRUEsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFFekVBLElBQUlBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBR3hCQSxJQUFJQSxXQUFXQSxHQUFHQSxVQUFTQSxDQUFDQTtZQUN4QixFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsSUFBSSxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDMUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsQ0FBQztZQUNELE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQTtRQUNsQixDQUFDLENBQUNBO1FBRUZBLElBQUlBLFdBQVdBLEdBQW1CQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxtQkFBbUJBLEVBQUVBLENBQUNBO1FBQ3hFQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxXQUFXQSxFQUFFQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUMvRUEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsV0FBV0EsRUFBRUEsV0FBV0EsRUFBRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDdEZBLEtBQUtBLENBQUNBLHlCQUF5QkEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsRUFBRUEsY0FBY0EsQ0FBQ0EsQ0FBQ0E7UUFDcEZBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxLQUFLQSxDQUFDQSx5QkFBeUJBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLGNBQWNBLENBQUNBLENBQUNBO1lBQ3pHQSxLQUFLQSxDQUFDQSx5QkFBeUJBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLGNBQWNBLENBQUNBLENBQUNBO1lBQ3pHQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDakJBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLEVBQUVBLFdBQVdBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO2dCQUVoRkEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsT0FBT0EsRUFBRUEsV0FBV0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDcEZBLENBQUNBO1FBQ0xBLENBQUNBO1FBR0RBLEtBQUtBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsRUFBRUEsSUFBSUEsQ0FBQ0EseUJBQXlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUV2R0EsSUFBSUEsUUFBUUEsR0FBR0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDdkNBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLFdBQVdBLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMUZBLEtBQUtBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEVBQUVBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xGQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxFQUFFQSxVQUFVQSxFQUFFQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxnQkFBZ0JBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hGQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxFQUFFQSxXQUFXQSxFQUFFQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxpQkFBaUJBLENBQUNBLENBQUNBLENBQUNBO1FBRTFGQSxLQUFLQSxDQUFDQSxXQUFXQSxDQUFDQSxXQUFXQSxFQUFFQSxXQUFXQSxFQUFFQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUV6REEsS0FBS0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsRUFBRUEsV0FBV0EsRUFBRUEsVUFBU0EsQ0FBQ0E7WUFDL0MsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2YsTUFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkMsQ0FBQyxDQUFDQSxDQUFDQTtRQUdIQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxXQUFXQSxFQUFFQSxVQUFTQSxDQUFhQTtZQUN6QyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQyxVQUFVLElBQUksQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDekQsTUFBTSxDQUFDO1lBQ1gsQ0FBQztZQUVELElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsdUJBQXVCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0QsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7WUFDaEQsSUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUUvQixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsSUFBSSxLQUFLLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDL0QsUUFBUSxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUN2QyxDQUFDO1lBQ0QsSUFBSSxDQUFDLENBQUM7Z0JBQ0YsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNoQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDQSxDQUFDQTtJQUNQQSxDQUFDQTtJQUVERCxZQUFZQSxDQUFDQSxJQUFZQSxFQUFFQSxDQUFhQTtRQUNwQ0UsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNsRUEsQ0FBQ0E7SUFFREYsV0FBV0EsQ0FBQ0EsSUFBWUEsRUFBRUEsQ0FBYUE7UUFFbkNHLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGNBQWNBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLGNBQWNBLENBQUNBLFNBQVNBLENBQUNBO1FBQ25GQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNsRUEsQ0FBQ0E7SUFFREgseUJBQXlCQSxDQUFDQSxJQUFZQSxFQUFFQSxDQUFrQkE7UUFDdERJLElBQUlBLFVBQVVBLEdBQUdBLElBQUlBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdERBLFVBQVVBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3pDQSxVQUFVQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNoQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDaENBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLEVBQUVBLFVBQVVBLENBQUNBLENBQUNBO0lBQ3hDQSxDQUFDQTtJQUVESixRQUFRQSxDQUFDQSxLQUFhQTtRQUNsQkssSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0E7SUFDdkJBLENBQUNBO0lBRURMLGVBQWVBO1FBQ1hNLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7SUFDcEZBLENBQUNBO0lBRUROLFlBQVlBLENBQUNBLEVBQW9CQSxFQUFFQSxnQkFBbURBO1FBQ2xGTyxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsRUFBRUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFMUJBLElBQUlBLENBQUNBLGNBQWNBLEdBQUdBLElBQUlBLENBQUNBO1FBRzNCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUNwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQ0EsUUFBUUEsQ0FBQ0EscUJBQXFCQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUMxQ0EsQ0FBQ0E7UUFFREEsSUFBSUEsV0FBV0EsR0FBR0EsQ0FBQ0EsVUFBU0EsTUFBY0EsRUFBRUEsWUFBMEJBO1lBQ2xFLE1BQU0sQ0FBQyxVQUFTLFVBQXNCO2dCQUNsQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQztvQkFBQyxNQUFNLENBQUM7Z0JBR3hCLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxRQUFRLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxJQUFJLFlBQVksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUl2RSxNQUFNLENBQUMsWUFBWSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsQ0FBQztnQkFDaEQsQ0FBQztnQkFFRCxZQUFZLENBQUMsT0FBTyxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUM7Z0JBQzFDLFlBQVksQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDLE9BQU8sQ0FBQztnQkFDMUMsZ0JBQWdCLElBQUksZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ2pELFlBQVksQ0FBQyxVQUFVLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ25FLFlBQVksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1lBQ3BDLENBQUMsQ0FBQTtRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFdEJBLElBQUlBLFlBQVlBLEdBQUdBLENBQUNBLFVBQVNBLFlBQTBCQTtZQUNuRCxNQUFNLENBQUMsVUFBUyxDQUFDO2dCQUNiLGFBQWEsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDdkIsaUJBQWlCLEVBQUUsQ0FBQztnQkFDcEIsWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hGLFlBQVksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO2dCQUN4QixFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMscUJBQXFCLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDekMsUUFBUSxDQUFDLHFCQUFxQixHQUFHLElBQUksQ0FBQztvQkFDdEMsUUFBUSxDQUFDLHFCQUFxQixFQUFFLENBQUM7Z0JBQ3JDLENBQUM7Z0JBQ0QsWUFBWSxDQUFDLGNBQWMsR0FBRyxLQUFLLENBQUM7Z0JBQ3BDLFlBQVksQ0FBQyxtQkFBbUIsR0FBRyxZQUFZLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztnQkFDcEUsQ0FBQyxJQUFJLFlBQVksQ0FBQyxZQUFZLENBQUMsU0FBUyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pELENBQUMsQ0FBQTtRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFVEEsSUFBSUEsaUJBQWlCQSxHQUFHQSxDQUFDQSxVQUFTQSxZQUEwQkE7WUFDeEQsTUFBTSxDQUFDO2dCQUNILFlBQVksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLElBQUksWUFBWSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUN2RSxZQUFZLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztZQUNyQyxDQUFDLENBQUE7UUFDTCxDQUFDLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBRVRBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLElBQUlBLEVBQUVBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLElBQUlBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxjQUFhLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDeERBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLG1CQUFtQkEsR0FBR0EsV0FBV0EsQ0FBQ0E7UUFDdkNBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLEVBQUVBLFdBQVdBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO1FBQ3BGQSxJQUFJQSxPQUFPQSxHQUFHQSxXQUFXQSxDQUFDQSxpQkFBaUJBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO0lBQ3JEQSxDQUFDQTtJQUVEUCxpQkFBaUJBO1FBQ2JRLElBQUlBLElBQUlBLEdBQUdBLFVBQVNBLENBQUNBO1lBQ2pCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxJQUFJLGFBQWEsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RELE1BQU0sQ0FBQztZQUNYLENBQUM7WUFDRCxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQztZQUMzQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xCLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQ2hDLENBQUM7UUFDTCxDQUFDLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ2JBLFVBQVVBLENBQUNBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO1FBQ3JCQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQSxtQkFBbUJBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQzlDQSxDQUFDQTtJQUVEUixNQUFNQTtRQUNGUyxJQUFJQSxNQUF1Q0EsQ0FBQ0E7UUFDNUNBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFdEZBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUVwREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3RDQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEJBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLEtBQUtBLENBQUNBO1lBQ3hDQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsSUFBSUEsYUFBYUEsR0FBR0Esb0JBQW9CQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDdkVBLE1BQU1BLEdBQUdBLGFBQWFBLENBQUNBLE1BQU1BLENBQUNBO2dCQUM5QkEsTUFBTUEsR0FBR0EsYUFBYUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDbENBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0NBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLG9CQUFvQkEsRUFBRUEsQ0FBQ0E7SUFDaERBLENBQUNBO0lBRURULGdCQUFnQkE7UUFDWlUsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLGVBQWVBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7UUFDbkRBLENBQUNBO0lBQ0xBLENBQUNBO0lBRURWLFdBQVdBLENBQUNBLEdBQW9DQSxFQUFFQSxxQkFBK0JBO1FBQzdFVyxHQUFHQSxHQUFHQSxHQUFHQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSx1QkFBdUJBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBQ3RGQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUd6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDM0NBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUJBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLGNBQWNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxxQkFBcUJBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQTtRQUNsQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0NBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1FBQy9DQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQTtRQUNqQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBRURYLFNBQVNBO1FBQ0xZLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBRURaLFlBQVlBO1FBQ1JhLElBQUlBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBRURiLGdCQUFnQkE7UUFDWmMsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtJQUM1QkEsQ0FBQ0E7SUFFRGQsU0FBU0E7UUFDTGUsSUFBSUEsUUFBUUEsR0FBR0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDbEhBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1FBRXRCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxHQUFHQSxXQUFXQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoRkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsbUJBQW1CQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNoRUEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7QUFFTGYsQ0FBQ0E7QUFFRCxNQUFNLENBQUMsYUFBYSxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsY0FBYyxFQUFFO0lBQ3pELFdBQVcsRUFBRSxFQUFFLFlBQVksRUFBRSxDQUFDLEVBQUU7SUFDaEMsU0FBUyxFQUFFLEVBQUUsWUFBWSxFQUFFLENBQUMsU0FBUyxDQUFDLEtBQUssR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEVBQUU7SUFDeEQsV0FBVyxFQUFFLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRTtJQUNuQyxXQUFXLEVBQUUsRUFBRSxZQUFZLEVBQUUsQ0FBQyxFQUFFO0lBQ2hDLG1CQUFtQixFQUFFLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRTtDQUM5QyxDQUFDLENBQUM7QUFLSDtJQWtCSWdCLFlBQVlBLFFBQW9CQSxFQUFFQSxNQUFjQTtRQVB4Q0MsdUJBQWtCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUMzQkEscUJBQWdCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQXVGakNBLGdCQUFXQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxHQUFHQSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBR0EsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUNBO1FBaEZ4SEEsSUFBSUEsQ0FBQ0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDekJBLElBQUlBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBO1FBRXJCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUNoQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFaENBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2pCQSxJQUFJQSxDQUFDQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFFREQsSUFBSUEsU0FBU0E7UUFDVEUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDbkNBLENBQUNBO0lBRURGLGVBQWVBO1FBQ1hHLEtBQUtBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQ3JDQSxJQUFJQSxDQUFDQSxrQkFBa0JBLEdBQUdBLElBQUlBLENBQUNBO0lBQ25DQSxDQUFDQTtJQUVESCxjQUFjQTtRQUNWSSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtRQUNwQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFFREosSUFBSUE7UUFDQUssSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDdkJBLElBQUlBLENBQUNBLGNBQWNBLEVBQUVBLENBQUNBO0lBQzFCQSxDQUFDQTtJQU9ETCxtQkFBbUJBO1FBQ2ZNLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLHVCQUF1QkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDekZBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBO0lBQ3JCQSxDQUFDQTtJQU9ETixXQUFXQTtRQUNQTyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxLQUFLQSxJQUFJQSxDQUFDQTtZQUMzQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7UUFFN0JBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBO1FBR3pCQSxJQUFJQSxjQUFjQSxHQUFHQSxNQUFNQSxDQUFDQSxpQkFBaUJBLEVBQUVBLENBQUNBO1FBQ2hEQSxFQUFFQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQTtZQUN6QkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLG1CQUFtQkEsRUFBRUEsQ0FBQ0E7WUFDckNBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLGNBQWNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3JFQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtJQUM3QkEsQ0FBQ0E7SUFPRFAsU0FBU0E7UUFDTFEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBS0RSLFdBQVdBO1FBQ1BTLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBO0lBQ2xDQSxDQUFDQTtBQUdMVCxDQUFDQTtBQUVELElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztBQUVwQiw4QkFBOEIsTUFBYyxFQUFFLFlBQTBCO0lBQ3BFVSxNQUFNQSxDQUFDQSxVQUFTQSxFQUFvQkE7UUFDaEMsSUFBSSxXQUFXLEdBQUcsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25DLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ25DLFlBQVksQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDO1FBRWpDLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQyxTQUFTLEVBQUUsQ0FBQztRQUM1QixFQUFFLENBQUMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNmLElBQUksY0FBYyxHQUFHLE1BQU0sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1lBQ2hELElBQUksY0FBYyxHQUFHLGNBQWMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUU5QyxFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUM7Z0JBQ2YsTUFBTSxDQUFDLFNBQVMsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7WUFHekMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFHOUMsRUFBRSxDQUFDLENBQUMsV0FBVyxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDZixFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLGVBQWUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7Z0JBQzFGLFlBQVksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ25DLFlBQVksQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzlCLE1BQU0sQ0FBQztZQUNYLENBQUM7UUFDTCxDQUFDO1FBRUQsWUFBWSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUU5QixZQUFZLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYyxFQUFFLENBQUM7SUFDL0IsQ0FBQyxDQUFBQTtBQUNMQSxDQUFDQTtBQUVELCtCQUErQixNQUFjLEVBQUUsWUFBMEI7SUFDckVDLE1BQU1BLENBQUNBLFVBQVNBLEVBQW9CQTtRQUNoQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ25CLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFHRCxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLElBQUksRUFBRSxDQUFDLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQzlDLEVBQUUsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQztZQUN0QixFQUFFLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNsQixDQUFDO1FBRUQsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUM7UUFDOUIsSUFBSSxFQUFFLEdBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLGVBQWUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUVqRCxJQUFJLFdBQVcsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLE1BQU0sR0FBRyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0YsRUFBRSxDQUFDLENBQUMsV0FBVyxJQUFJLEVBQUUsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzFCLFlBQVksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDO1lBQ2pDLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsTUFBTSxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNyRSxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3JCLENBQUM7SUFDTCxDQUFDLENBQUFBO0FBQ0xBLENBQUNBO0FBRUQsZ0NBQWdDLE1BQWMsRUFBRSxZQUEwQjtJQUN0RUMsTUFBTUEsQ0FBQ0EsVUFBU0EsZ0JBQWtDQTtRQUM5QyxJQUFJLEdBQUcsR0FBRyxnQkFBZ0IsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1FBQ2pELElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxPQUFPLENBQUM7UUFFN0IsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN6QyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ1IsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDbEIsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDckIsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUN2QixDQUFDO1lBQ0QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNwQyxDQUFDO1FBQ0QsSUFBSSxDQUFDLENBQUM7WUFDRixLQUFLLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDM0QsWUFBWSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUMzQyxDQUFDO1FBQ0QsWUFBWSxDQUFDLGVBQWUsR0FBRyxLQUFLLENBQUM7UUFDckMsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDO0lBQzFCLENBQUMsQ0FBQUE7QUFDTEEsQ0FBQ0E7QUFFRCxnQ0FBZ0MsTUFBYyxFQUFFLFlBQTBCO0lBQ3RFQyxNQUFNQSxDQUFDQSxVQUFTQSxnQkFBa0NBO1FBQzlDLElBQUksR0FBRyxHQUFHLGdCQUFnQixDQUFDLG1CQUFtQixFQUFFLENBQUM7UUFFakQsWUFBWSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUN2QyxJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUN2QyxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0QsWUFBWSxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzlFLFlBQVksQ0FBQyxlQUFlLENBQUMsR0FBRyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDO1FBQ3hGLENBQUM7UUFDRCxJQUFJLENBQUMsQ0FBQztZQUNGLFlBQVksQ0FBQyxlQUFlLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxZQUFZLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzFFLENBQUM7UUFDRCxZQUFZLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDMUIsQ0FBQyxDQUFBQTtBQUNMQSxDQUFDQTtBQUVELDhCQUE4QixNQUFjLEVBQUUsWUFBMEI7SUFDcEVDLE1BQU1BLENBQUNBLFVBQVNBLGdCQUFrQ0E7UUFDOUMsTUFBTSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ25CLFlBQVksQ0FBQyxlQUFlLEdBQUcsTUFBTSxDQUFDLGlCQUFpQixFQUFFLENBQUM7UUFDMUQsWUFBWSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUFBO0FBQ0xBLENBQUNBO0FBRUQsK0JBQStCLE1BQWMsRUFBRSxZQUEwQixFQUFFLFFBQWdCO0lBQ3ZGQyxNQUFNQSxDQUFDQTtRQUNILElBQUksTUFBTSxDQUFDO1FBQ1gsSUFBSSxNQUFNLEdBQUcsWUFBWSxDQUFDLGVBQWUsRUFBRSxDQUFDO1FBQzVDLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFbEUsRUFBRSxDQUFDLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDLENBQUM7WUFDL0IsSUFBSSxRQUFRLEdBQUcsWUFBWSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3RFLElBQUksTUFBTSxHQUFHLFlBQVksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUVsRSxFQUFFLENBQUMsQ0FBQyxRQUFRLElBQUksQ0FBQyxDQUFDLElBQUksTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hDLE1BQU0sR0FBRyxZQUFZLENBQUMsZUFBZSxDQUFDLEdBQUcsQ0FBQztnQkFDMUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDO29CQUNqRSxNQUFNLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztZQUM3QixDQUFDO1lBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksUUFBUSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BDLE1BQU0sR0FBRyxZQUFZLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQztnQkFDNUMsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDO29CQUNyRSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQztZQUMzQixDQUFDO1lBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFFBQVEsSUFBSSxDQUFDLENBQUMsSUFBSSxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDckMsTUFBTSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUM7Z0JBQ25CLE1BQU0sR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDO1lBQ3pCLENBQUM7WUFDRCxJQUFJLENBQUMsQ0FBQztnQkFDRixJQUFJLGFBQWEsR0FBRyxvQkFBb0IsQ0FBQyxZQUFZLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUMvRSxNQUFNLEdBQUcsYUFBYSxDQUFDLE1BQU0sQ0FBQztnQkFDOUIsTUFBTSxHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQUM7WUFDbEMsQ0FBQztZQUNELE1BQU0sQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkUsQ0FBQztRQUNELE1BQU0sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFMUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0lBQzNDLENBQUMsQ0FBQUE7QUFDTEEsQ0FBQ0E7QUFFRCxzQkFBc0IsRUFBVSxFQUFFLEVBQVUsRUFBRSxFQUFVLEVBQUUsRUFBVTtJQUNoRUMsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7QUFDbEVBLENBQUNBO0FBRUQsOEJBQThCLEtBQWdCLEVBQUUsTUFBdUM7SUFDbkZDLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ25DQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtJQUN4RUEsQ0FBQ0E7SUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeEZBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNGQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUMvREEsQ0FBQ0E7SUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDVkEsTUFBTUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7SUFDdERBLENBQUNBO0lBQ0RBLElBQUlBLENBQUNBLENBQUNBO1FBQ0ZBLE1BQU1BLENBQUNBLEVBQUVBLE1BQU1BLEVBQUVBLEtB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KioqKipcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgbGljZW5zZTpcbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTAsIEFqYXgub3JnIEIuVi5cbiAqIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKlxuICogUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0XG4gKiBtb2RpZmljYXRpb24sIGFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZVxuICogICAgICAgZG9jdW1lbnRhdGlvbiBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cbiAqICAgICAqIE5laXRoZXIgdGhlIG5hbWUgb2YgQWpheC5vcmcgQi5WLiBub3IgdGhlXG4gKiAgICAgICBuYW1lcyBvZiBpdHMgY29udHJpYnV0b3JzIG1heSBiZSB1c2VkIHRvIGVuZG9yc2Ugb3IgcHJvbW90ZSBwcm9kdWN0c1xuICogICAgICAgZGVyaXZlZCBmcm9tIHRoaXMgc29mdHdhcmUgd2l0aG91dCBzcGVjaWZpYyBwcmlvciB3cml0dGVuIHBlcm1pc3Npb24uXG4gKlxuICogVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG4gKiBBTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuICogV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRVxuICogRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgQUpBWC5PUkcgQi5WLiBCRSBMSUFCTEUgRk9SIEFOWVxuICogRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbiAqIChJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbiAqIExPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORFxuICogT04gQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbiAqIChJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG4gKiBTT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS5cbiAqXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuXG4vL3JlcXVpcmUoXCIuL2xpYi9maXhvbGRicm93c2Vyc1wiKTtcblxuaW1wb3J0IG9vcCA9IHJlcXVpcmUoXCIuL2xpYi9vb3BcIik7XG5pbXBvcnQgZG9tID0gcmVxdWlyZShcIi4vbGliL2RvbVwiKTtcbmltcG9ydCBsYW5nID0gcmVxdWlyZShcIi4vbGliL2xhbmdcIik7XG5pbXBvcnQgdXNlckFnZW50ID0gcmVxdWlyZShcIi4vbGliL3VzZXJhZ2VudFwiKTtcbmltcG9ydCBndW0gPSByZXF1aXJlKFwiLi9sYXllci9ndXR0ZXJcIik7XG5pbXBvcnQgVGV4dElucHV0ID0gcmVxdWlyZShcIi4va2V5Ym9hcmQvdGV4dGlucHV0XCIpO1xuaW1wb3J0IEtleUJpbmRpbmcgPSByZXF1aXJlKFwiLi9rZXlib2FyZC9rZXliaW5kaW5nXCIpO1xuaW1wb3J0IGVzbSA9IHJlcXVpcmUoXCIuL2VkaXRfc2Vzc2lvblwiKTtcbmltcG9ydCBTZWFyY2ggPSByZXF1aXJlKFwiLi9zZWFyY2hcIik7XG5pbXBvcnQgcm5nID0gcmVxdWlyZShcIi4vcmFuZ2VcIik7XG5pbXBvcnQgQ3Vyc29yUmFuZ2UgPSByZXF1aXJlKCcuL0N1cnNvclJhbmdlJylcbmltcG9ydCBldmUgPSByZXF1aXJlKFwiLi9saWIvZXZlbnRfZW1pdHRlclwiKTtcbmltcG9ydCBDb21tYW5kTWFuYWdlciA9IHJlcXVpcmUoXCIuL2NvbW1hbmRzL0NvbW1hbmRNYW5hZ2VyXCIpO1xuaW1wb3J0IGRlZmF1bHRDb21tYW5kcyA9IHJlcXVpcmUoXCIuL2NvbW1hbmRzL2RlZmF1bHRfY29tbWFuZHNcIik7XG5pbXBvcnQgY29uZmlnID0gcmVxdWlyZShcIi4vY29uZmlnXCIpO1xuaW1wb3J0IFRva2VuSXRlcmF0b3IgPSByZXF1aXJlKFwiLi9Ub2tlbkl0ZXJhdG9yXCIpO1xuaW1wb3J0IHByb3RvY29sID0gcmVxdWlyZSgnLi9lZGl0b3JfcHJvdG9jb2wnKTtcbmltcG9ydCB2cm0gPSByZXF1aXJlKCcuL3ZpcnR1YWxfcmVuZGVyZXInKTtcbmltcG9ydCBhY20gPSByZXF1aXJlKFwiLi9hdXRvY29tcGxldGVcIik7XG5pbXBvcnQgc2VtID0gcmVxdWlyZSgnLi9zZWxlY3Rpb24nKTtcbmltcG9ydCBldmVudCA9IHJlcXVpcmUoXCIuL2xpYi9ldmVudFwiKTtcbmltcG9ydCB0b3VjaCA9IHJlcXVpcmUoJy4vdG91Y2gvdG91Y2gnKTtcbmltcG9ydCB0dG0gPSByZXF1aXJlKFwiLi90b29sdGlwXCIpO1xuXG4vL3ZhciBEcmFnZHJvcEhhbmRsZXIgPSByZXF1aXJlKFwiLi9tb3VzZS9kcmFnZHJvcF9oYW5kbGVyXCIpLkRyYWdkcm9wSGFuZGxlcjtcblxuLyoqXG4gKiBUaGUgbWFpbiBlbnRyeSBwb2ludCBpbnRvIHRoZSBBY2UgZnVuY3Rpb25hbGl0eS5cbiAqXG4gKiBUaGUgYEVkaXRvcmAgbWFuYWdlcyB0aGUgW1tFZGl0U2Vzc2lvbl1dICh3aGljaCBtYW5hZ2VzIFtbRG9jdW1lbnRdXXMpLCBhcyB3ZWxsIGFzIHRoZSBbW1ZpcnR1YWxSZW5kZXJlcl1dLCB3aGljaCBkcmF3cyBldmVyeXRoaW5nIHRvIHRoZSBzY3JlZW4uXG4gKlxuICogRXZlbnQgc2Vzc2lvbnMgZGVhbGluZyB3aXRoIHRoZSBtb3VzZSBhbmQga2V5Ym9hcmQgYXJlIGJ1YmJsZWQgdXAgZnJvbSBgRG9jdW1lbnRgIHRvIHRoZSBgRWRpdG9yYCwgd2hpY2ggZGVjaWRlcyB3aGF0IHRvIGRvIHdpdGggdGhlbS5cbiAqIEBjbGFzcyBFZGl0b3JcbiAqL1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEVkaXRvcmAgb2JqZWN0LlxuICpcbiAqIEBwYXJhbSB7VmlydHVhbFJlbmRlcmVyfSByZW5kZXJlciBBc3NvY2lhdGVkIGBWaXJ0dWFsUmVuZGVyZXJgIHRoYXQgZHJhd3MgZXZlcnl0aGluZ1xuICogQHBhcmFtIHtFZGl0U2Vzc2lvbn0gc2Vzc2lvbiBUaGUgYEVkaXRTZXNzaW9uYCB0byByZWZlciB0b1xuICpcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuY2xhc3MgRWRpdG9yIGV4dGVuZHMgZXZlLkV2ZW50RW1pdHRlckNsYXNzIHtcbiAgICBwdWJsaWMgcmVuZGVyZXI6IHZybS5WaXJ0dWFsUmVuZGVyZXI7XG4gICAgcHVibGljIHNlc3Npb246IGVzbS5FZGl0U2Vzc2lvbjtcbiAgICBwcml2YXRlICR0b3VjaEhhbmRsZXI6IElHZXN0dXJlSGFuZGxlcjtcbiAgICBwcml2YXRlICRtb3VzZUhhbmRsZXI6IElHZXN0dXJlSGFuZGxlcjtcbiAgICBwdWJsaWMgZ2V0T3B0aW9uO1xuICAgIHB1YmxpYyBzZXRPcHRpb247XG4gICAgcHVibGljIHNldE9wdGlvbnM7XG4gICAgcHVibGljICRpc0ZvY3VzZWQ7XG4gICAgcHVibGljIGNvbW1hbmRzID0gbmV3IENvbW1hbmRNYW5hZ2VyKHVzZXJBZ2VudC5pc01hYyA/IFwibWFjXCIgOiBcIndpblwiLCBkZWZhdWx0Q29tbWFuZHMpO1xuICAgIHB1YmxpYyBrZXlCaW5kaW5nO1xuICAgIC8vIEZJWE1FOiBUaGlzIGlzIHJlYWxseSBhbiBvcHRpb25hbCBleHRlbnNpb24gYW5kIHNvIGRvZXMgbm90IGJlbG9uZyBoZXJlLlxuICAgIHB1YmxpYyBjb21wbGV0ZXJzOiBhY20uQ29tcGxldGVyW107XG5cbiAgICAvKipcbiAgICAgKiBUaGUgcmVuZGVyZXIgY29udGFpbmVyIGVsZW1lbnQuXG4gICAgICovXG4gICAgcHVibGljIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG4gICAgcHVibGljIHRleHRJbnB1dDtcbiAgICBwdWJsaWMgaW5NdWx0aVNlbGVjdE1vZGU6IGJvb2xlYW47XG4gICAgcHVibGljIGluVmlydHVhbFNlbGVjdGlvbk1vZGU7XG5cbiAgICBwcml2YXRlICRjdXJzb3JTdHlsZTtcbiAgICBwcml2YXRlICRrZXliaW5kaW5nSWQ7XG4gICAgcHJpdmF0ZSAkYmxvY2tTY3JvbGxpbmc7XG4gICAgcHJpdmF0ZSAkaGlnaGxpZ2h0QWN0aXZlTGluZTtcbiAgICBwcml2YXRlICRoaWdobGlnaHRQZW5kaW5nO1xuICAgIHByaXZhdGUgJGhpZ2hsaWdodFNlbGVjdGVkV29yZDtcbiAgICBwcml2YXRlICRoaWdobGlnaHRUYWdQZW5kaW5nO1xuICAgIHByaXZhdGUgJG1lcmdlVW5kb0RlbHRhcztcbiAgICBwdWJsaWMgJHJlYWRPbmx5O1xuICAgIHByaXZhdGUgJHNjcm9sbEFuY2hvcjtcbiAgICBwcml2YXRlICRzZWFyY2g7XG4gICAgcHJpdmF0ZSBfJGVtaXRJbnB1dEV2ZW50O1xuICAgIHByaXZhdGUgc2VsZWN0aW9ucztcbiAgICBwcml2YXRlICRzZWxlY3Rpb25TdHlsZTtcbiAgICBwcml2YXRlICRvcFJlc2V0VGltZXI7XG4gICAgcHJpdmF0ZSBjdXJPcCA9IG51bGw7XG4gICAgcHJpdmF0ZSBwcmV2T3A6IHsgY29tbWFuZD87IGFyZ3M/fSA9IHt9O1xuICAgIHByaXZhdGUgcHJldmlvdXNDb21tYW5kO1xuICAgIC8vIFRPRE8gdXNlIHByb3BlcnR5IG9uIGNvbW1hbmRzIGluc3RlYWQgb2YgdGhpc1xuICAgIHByaXZhdGUgJG1lcmdlYWJsZUNvbW1hbmRzID0gW1wiYmFja3NwYWNlXCIsIFwiZGVsXCIsIFwiaW5zZXJ0c3RyaW5nXCJdO1xuICAgIHByaXZhdGUgbWVyZ2VOZXh0Q29tbWFuZDtcbiAgICBwcml2YXRlICRtZXJnZU5leHRDb21tYW5kO1xuICAgIHByaXZhdGUgc2VxdWVuY2VTdGFydFRpbWU6IG51bWJlcjtcbiAgICBwcml2YXRlICRvbkRvY3VtZW50Q2hhbmdlO1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlTW9kZTtcbiAgICBwcml2YXRlICRvblRva2VuaXplclVwZGF0ZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZVRhYlNpemU7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VXcmFwTGltaXQ7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VXcmFwTW9kZTtcbiAgICBwcml2YXRlICRvbkNoYW5nZUZvbGQ7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VGcm9udE1hcmtlcjtcbiAgICBwcml2YXRlICRvbkNoYW5nZUJhY2tNYXJrZXI7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VCcmVha3BvaW50O1xuICAgIHByaXZhdGUgJG9uQ2hhbmdlQW5ub3RhdGlvbjtcbiAgICBwcml2YXRlICRvbkN1cnNvckNoYW5nZTtcbiAgICBwcml2YXRlICRvblNjcm9sbFRvcENoYW5nZTtcbiAgICBwcml2YXRlICRvblNjcm9sbExlZnRDaGFuZ2U7XG4gICAgcHJpdmF0ZSAkb25TZWxlY3Rpb25DaGFuZ2U7XG4gICAgcHVibGljIGV4aXRNdWx0aVNlbGVjdE1vZGU7XG4gICAgcHVibGljIGZvckVhY2hTZWxlY3Rpb247XG4gICAgY29uc3RydWN0b3IocmVuZGVyZXI6IHZybS5WaXJ0dWFsUmVuZGVyZXIsIHNlc3Npb24/OiBlc20uRWRpdFNlc3Npb24pIHtcbiAgICAgICAgc3VwZXIoKTtcbiAgICAgICAgdGhpcy5jb250YWluZXIgPSByZW5kZXJlci5nZXRDb250YWluZXJFbGVtZW50KCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIgPSByZW5kZXJlcjtcblxuICAgICAgICB0aGlzLnRleHRJbnB1dCA9IG5ldyBUZXh0SW5wdXQocmVuZGVyZXIuZ2V0VGV4dEFyZWFDb250YWluZXIoKSwgdGhpcyk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudGV4dGFyZWEgPSB0aGlzLnRleHRJbnB1dC5nZXRFbGVtZW50KCk7XG4gICAgICAgIHRoaXMua2V5QmluZGluZyA9IG5ldyBLZXlCaW5kaW5nKHRoaXMpO1xuXG4gICAgICAgIGlmICh1c2VyQWdlbnQuaXNNb2JpbGUpIHtcbiAgICAgICAgICAgIHRoaXMuJHRvdWNoSGFuZGxlciA9IHRvdWNoLnRvdWNoTWFuYWdlcih0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuJG1vdXNlSGFuZGxlciA9IG5ldyBNb3VzZUhhbmRsZXIodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiR0b3VjaEhhbmRsZXIgPSB0b3VjaC50b3VjaE1hbmFnZXIodGhpcyk7XG4gICAgICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIgPSBuZXcgTW91c2VIYW5kbGVyKHRoaXMpO1xuICAgICAgICB9XG5cbiAgICAgICAgbmV3IEZvbGRIYW5kbGVyKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nID0gMDtcbiAgICAgICAgdGhpcy4kc2VhcmNoID0gbmV3IFNlYXJjaCgpLnNldCh7XG4gICAgICAgICAgICB3cmFwOiB0cnVlXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuJGhpc3RvcnlUcmFja2VyID0gdGhpcy4kaGlzdG9yeVRyYWNrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5vbihcImV4ZWNcIiwgdGhpcy4kaGlzdG9yeVRyYWNrZXIpO1xuXG4gICAgICAgIHRoaXMuJGluaXRPcGVyYXRpb25MaXN0ZW5lcnMoKTtcblxuICAgICAgICB0aGlzLl8kZW1pdElucHV0RXZlbnQgPSBsYW5nLmRlbGF5ZWRDYWxsKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiaW5wdXRcIiwge30pO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmJnVG9rZW5pemVyICYmIHRoaXMuc2Vzc2lvbi5iZ1Rva2VuaXplci5zY2hlZHVsZVN0YXJ0KCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5vbihcImNoYW5nZVwiLCBmdW5jdGlvbihfLCBfc2VsZikge1xuICAgICAgICAgICAgX3NlbGYuXyRlbWl0SW5wdXRFdmVudC5zY2hlZHVsZSgzMSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuc2V0U2Vzc2lvbihzZXNzaW9uIHx8IG5ldyBlc20uRWRpdFNlc3Npb24oXCJcIikpO1xuICAgICAgICBjb25maWcucmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICBjb25maWcuX3NpZ25hbChcImVkaXRvclwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICBjYW5jZWxNb3VzZUNvbnRleHRNZW51KCkge1xuICAgICAgICB0aGlzLiRtb3VzZUhhbmRsZXIuY2FuY2VsQ29udGV4dE1lbnUoKTtcbiAgICB9XG5cbiAgICBnZXQgc2VsZWN0aW9uKCk6IHNlbS5TZWxlY3Rpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgICRpbml0T3BlcmF0aW9uTGlzdGVuZXJzKCkge1xuICAgICAgICBmdW5jdGlvbiBsYXN0KGEpIHsgcmV0dXJuIGFbYS5sZW5ndGggLSAxXSB9XG5cbiAgICAgICAgdGhpcy5zZWxlY3Rpb25zID0gW107XG4gICAgICAgIHRoaXMuY29tbWFuZHMub24oXCJleGVjXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhcnRPcGVyYXRpb24oZSk7XG5cbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gZS5jb21tYW5kO1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQuYWNlQ29tbWFuZEdyb3VwID09IFwiZmlsZUp1bXBcIikge1xuICAgICAgICAgICAgICAgIHZhciBwcmV2ID0gdGhpcy5wcmV2T3A7XG4gICAgICAgICAgICAgICAgaWYgKCFwcmV2IHx8IHByZXYuY29tbWFuZC5hY2VDb21tYW5kR3JvdXAgIT0gXCJmaWxlSnVtcFwiKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubGFzdEZpbGVKdW1wUG9zID0gbGFzdCh0aGlzLnNlbGVjdGlvbnMpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5sYXN0RmlsZUp1bXBQb3MgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LmJpbmQodGhpcyksIHRydWUpO1xuXG4gICAgICAgIHRoaXMuY29tbWFuZHMub24oXCJhZnRlckV4ZWNcIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgdmFyIGNvbW1hbmQgPSBlLmNvbW1hbmQ7XG5cbiAgICAgICAgICAgIGlmIChjb21tYW5kLmFjZUNvbW1hbmRHcm91cCA9PSBcImZpbGVKdW1wXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5sYXN0RmlsZUp1bXBQb3MgJiYgIXRoaXMuY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5mcm9tSlNPTih0aGlzLmxhc3RGaWxlSnVtcFBvcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lbmRPcGVyYXRpb24oZSk7XG4gICAgICAgIH0uYmluZCh0aGlzKSwgdHJ1ZSk7XG5cbiAgICAgICAgdGhpcy4kb3BSZXNldFRpbWVyID0gbGFuZy5kZWxheWVkQ2FsbCh0aGlzLmVuZE9wZXJhdGlvbi5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5jdXJPcCB8fCB0aGlzLnN0YXJ0T3BlcmF0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLmN1ck9wLmRvY0NoYW5nZWQgPSB0cnVlO1xuICAgICAgICB9LmJpbmQodGhpcyksIHRydWUpO1xuXG4gICAgICAgIHRoaXMub24oXCJjaGFuZ2VTZWxlY3Rpb25cIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLmN1ck9wIHx8IHRoaXMuc3RhcnRPcGVyYXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIH0uYmluZCh0aGlzKSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgc3RhcnRPcGVyYXRpb24oY29tbWFkRXZlbnQpIHtcbiAgICAgICAgaWYgKHRoaXMuY3VyT3ApIHtcbiAgICAgICAgICAgIGlmICghY29tbWFkRXZlbnQgfHwgdGhpcy5jdXJPcC5jb21tYW5kKVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIHRoaXMucHJldk9wID0gdGhpcy5jdXJPcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWNvbW1hZEV2ZW50KSB7XG4gICAgICAgICAgICB0aGlzLnByZXZpb3VzQ29tbWFuZCA9IG51bGw7XG4gICAgICAgICAgICBjb21tYWRFdmVudCA9IHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kb3BSZXNldFRpbWVyLnNjaGVkdWxlKCk7XG4gICAgICAgIHRoaXMuY3VyT3AgPSB7XG4gICAgICAgICAgICBjb21tYW5kOiBjb21tYWRFdmVudC5jb21tYW5kIHx8IHt9LFxuICAgICAgICAgICAgYXJnczogY29tbWFkRXZlbnQuYXJncyxcbiAgICAgICAgICAgIHNjcm9sbFRvcDogdGhpcy5yZW5kZXJlci5zY3JvbGxUb3BcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgY29tbWFuZCA9IHRoaXMuY3VyT3AuY29tbWFuZDtcbiAgICAgICAgaWYgKGNvbW1hbmQgJiYgY29tbWFuZC5zY3JvbGxJbnRvVmlldylcbiAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nKys7XG5cbiAgICAgICAgdGhpcy5zZWxlY3Rpb25zLnB1c2godGhpcy5zZWxlY3Rpb24udG9KU09OKCkpO1xuICAgIH1cblxuICAgIGVuZE9wZXJhdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuY3VyT3ApIHtcbiAgICAgICAgICAgIHZhciBjb21tYW5kID0gdGhpcy5jdXJPcC5jb21tYW5kO1xuICAgICAgICAgICAgaWYgKGNvbW1hbmQgJiYgY29tbWFuZC5zY3JvbGxJbnRvVmlldykge1xuICAgICAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nLS07XG4gICAgICAgICAgICAgICAgc3dpdGNoIChjb21tYW5kLnNjcm9sbEludG9WaWV3KSB7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgXCJjZW50ZXJcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsQ3Vyc29ySW50b1ZpZXcobnVsbCwgMC41KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiYW5pbWF0ZVwiOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIFwiY3Vyc29yXCI6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBcInNlbGVjdGlvblBhcnRcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgY29uZmlnID0gdGhpcy5yZW5kZXJlci5sYXllckNvbmZpZztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPj0gY29uZmlnLmxhc3RSb3cgfHwgcmFuZ2UuZW5kLnJvdyA8PSBjb25maWcuZmlyc3RSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFNlbGVjdGlvbkludG9WaWV3KHRoaXMuc2VsZWN0aW9uLmFuY2hvciwgdGhpcy5zZWxlY3Rpb24ubGVhZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoY29tbWFuZC5zY3JvbGxJbnRvVmlldyA9PSBcImFuaW1hdGVcIilcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nKHRoaXMuY3VyT3Auc2Nyb2xsVG9wKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wcmV2T3AgPSB0aGlzLmN1ck9wO1xuICAgICAgICAgICAgdGhpcy5jdXJPcCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkaGlzdG9yeVRyYWNrZXIoZSkge1xuICAgICAgICBpZiAoIXRoaXMuJG1lcmdlVW5kb0RlbHRhcylcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB2YXIgcHJldiA9IHRoaXMucHJldk9wO1xuICAgICAgICB2YXIgbWVyZ2VhYmxlQ29tbWFuZHMgPSB0aGlzLiRtZXJnZWFibGVDb21tYW5kcztcbiAgICAgICAgLy8gcHJldmlvdXMgY29tbWFuZCB3YXMgdGhlIHNhbWVcbiAgICAgICAgdmFyIHNob3VsZE1lcmdlID0gcHJldi5jb21tYW5kICYmIChlLmNvbW1hbmQubmFtZSA9PSBwcmV2LmNvbW1hbmQubmFtZSk7XG4gICAgICAgIGlmIChlLmNvbW1hbmQubmFtZSA9PSBcImluc2VydHN0cmluZ1wiKSB7XG4gICAgICAgICAgICB2YXIgdGV4dCA9IGUuYXJncztcbiAgICAgICAgICAgIGlmICh0aGlzLm1lcmdlTmV4dENvbW1hbmQgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICB0aGlzLm1lcmdlTmV4dENvbW1hbmQgPSB0cnVlO1xuXG4gICAgICAgICAgICBzaG91bGRNZXJnZSA9IHNob3VsZE1lcmdlXG4gICAgICAgICAgICAgICAgJiYgdGhpcy5tZXJnZU5leHRDb21tYW5kIC8vIHByZXZpb3VzIGNvbW1hbmQgYWxsb3dzIHRvIGNvYWxlc2NlIHdpdGhcbiAgICAgICAgICAgICAgICAmJiAoIS9cXHMvLnRlc3QodGV4dCkgfHwgL1xccy8udGVzdChwcmV2LmFyZ3MpKTsgLy8gcHJldmlvdXMgaW5zZXJ0aW9uIHdhcyBvZiBzYW1lIHR5cGVcblxuICAgICAgICAgICAgdGhpcy5tZXJnZU5leHRDb21tYW5kID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNob3VsZE1lcmdlID0gc2hvdWxkTWVyZ2VcbiAgICAgICAgICAgICAgICAmJiBtZXJnZWFibGVDb21tYW5kcy5pbmRleE9mKGUuY29tbWFuZC5uYW1lKSAhPT0gLTE7IC8vIHRoZSBjb21tYW5kIGlzIG1lcmdlYWJsZVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgdGhpcy4kbWVyZ2VVbmRvRGVsdGFzICE9IFwiYWx3YXlzXCJcbiAgICAgICAgICAgICYmIERhdGUubm93KCkgLSB0aGlzLnNlcXVlbmNlU3RhcnRUaW1lID4gMjAwMFxuICAgICAgICApIHtcbiAgICAgICAgICAgIHNob3VsZE1lcmdlID0gZmFsc2U7IC8vIHRoZSBzZXF1ZW5jZSBpcyB0b28gbG9uZ1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3VsZE1lcmdlKVxuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm1lcmdlVW5kb0RlbHRhcyA9IHRydWU7XG4gICAgICAgIGVsc2UgaWYgKG1lcmdlYWJsZUNvbW1hbmRzLmluZGV4T2YoZS5jb21tYW5kLm5hbWUpICE9PSAtMSlcbiAgICAgICAgICAgIHRoaXMuc2VxdWVuY2VTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcga2V5IGhhbmRsZXIsIHN1Y2ggYXMgXCJ2aW1cIiBvciBcIndpbmRvd3NcIi5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30ga2V5Ym9hcmRIYW5kbGVyIFRoZSBuZXcga2V5IGhhbmRsZXJcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRLZXlib2FyZEhhbmRsZXIoa2V5Ym9hcmRIYW5kbGVyKSB7XG4gICAgICAgIGlmICgha2V5Ym9hcmRIYW5kbGVyKSB7XG4gICAgICAgICAgICB0aGlzLmtleUJpbmRpbmcuc2V0S2V5Ym9hcmRIYW5kbGVyKG51bGwpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBrZXlib2FyZEhhbmRsZXIgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHRoaXMuJGtleWJpbmRpbmdJZCA9IGtleWJvYXJkSGFuZGxlcjtcbiAgICAgICAgICAgIHZhciBfc2VsZiA9IHRoaXM7XG4gICAgICAgICAgICBjb25maWcubG9hZE1vZHVsZShbXCJrZXliaW5kaW5nXCIsIGtleWJvYXJkSGFuZGxlcl0sIGZ1bmN0aW9uKG1vZHVsZSkge1xuICAgICAgICAgICAgICAgIGlmIChfc2VsZi4ka2V5YmluZGluZ0lkID09IGtleWJvYXJkSGFuZGxlcilcbiAgICAgICAgICAgICAgICAgICAgX3NlbGYua2V5QmluZGluZy5zZXRLZXlib2FyZEhhbmRsZXIobW9kdWxlICYmIG1vZHVsZS5oYW5kbGVyKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4ka2V5YmluZGluZ0lkID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMua2V5QmluZGluZy5zZXRLZXlib2FyZEhhbmRsZXIoa2V5Ym9hcmRIYW5kbGVyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGtleWJvYXJkIGhhbmRsZXIsIHN1Y2ggYXMgXCJ2aW1cIiBvciBcIndpbmRvd3NcIi5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICpcbiAgICAgKiovXG4gICAgZ2V0S2V5Ym9hcmRIYW5kbGVyKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5rZXlCaW5kaW5nLmdldEtleWJvYXJkSGFuZGxlcigpO1xuICAgIH1cblxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuZXZlciB0aGUgW1tFZGl0U2Vzc2lvbl1dIGNoYW5nZXMuXG4gICAgICogQGV2ZW50IGNoYW5nZVNlc3Npb25cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZSBBbiBvYmplY3Qgd2l0aCB0d28gcHJvcGVydGllcywgYG9sZFNlc3Npb25gIGFuZCBgc2Vzc2lvbmAsIHRoYXQgcmVwcmVzZW50IHRoZSBvbGQgYW5kIG5ldyBbW0VkaXRTZXNzaW9uXV1zLlxuICAgICAqXG4gICAgICoqL1xuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcgZWRpdHNlc3Npb24gdG8gdXNlLiBUaGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNlc3Npb24nYCBldmVudC5cbiAgICAgKiBAcGFyYW0ge0VkaXRTZXNzaW9ufSBzZXNzaW9uIFRoZSBuZXcgc2Vzc2lvbiB0byB1c2VcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRTZXNzaW9uKHNlc3Npb24pIHtcbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbiA9PSBzZXNzaW9uKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBvbGRTZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICBpZiAob2xkU2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgdGhpcy4kb25Eb2N1bWVudENoYW5nZSk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZU1vZGVcIiwgdGhpcy4kb25DaGFuZ2VNb2RlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwidG9rZW5pemVyVXBkYXRlXCIsIHRoaXMuJG9uVG9rZW5pemVyVXBkYXRlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlVGFiU2l6ZVwiLCB0aGlzLiRvbkNoYW5nZVRhYlNpemUpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VXcmFwTGltaXRcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTGltaXQpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VXcmFwTW9kZVwiLCB0aGlzLiRvbkNoYW5nZVdyYXBNb2RlKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwib25DaGFuZ2VGb2xkXCIsIHRoaXMuJG9uQ2hhbmdlRm9sZCk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZUZyb250TWFya2VyXCIsIHRoaXMuJG9uQ2hhbmdlRnJvbnRNYXJrZXIpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VCYWNrTWFya2VyXCIsIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlcik7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZUJyZWFrcG9pbnRcIiwgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlQW5ub3RhdGlvblwiLCB0aGlzLiRvbkNoYW5nZUFubm90YXRpb24pO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VPdmVyd3JpdGVcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTY3JvbGxUb3BcIiwgdGhpcy4kb25TY3JvbGxUb3BDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHRoaXMuJG9uU2Nyb2xsTGVmdENoYW5nZSk7XG5cbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLnNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgICAgICAgICBzZWxlY3Rpb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZUN1cnNvclwiLCB0aGlzLiRvbkN1cnNvckNoYW5nZSk7XG4gICAgICAgICAgICBzZWxlY3Rpb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVNlbGVjdGlvblwiLCB0aGlzLiRvblNlbGVjdGlvbkNoYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24gPSBzZXNzaW9uO1xuICAgICAgICBpZiAoc2Vzc2lvbikge1xuICAgICAgICAgICAgdGhpcy4kb25Eb2N1bWVudENoYW5nZSA9IHRoaXMub25Eb2N1bWVudENoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIHRoaXMuJG9uRG9jdW1lbnRDaGFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTZXNzaW9uKHNlc3Npb24pO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUgPSB0aGlzLm9uQ2hhbmdlTW9kZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlTW9kZVwiLCB0aGlzLiRvbkNoYW5nZU1vZGUpO1xuXG4gICAgICAgICAgICB0aGlzLiRvblRva2VuaXplclVwZGF0ZSA9IHRoaXMub25Ub2tlbml6ZXJVcGRhdGUuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcInRva2VuaXplclVwZGF0ZVwiLCB0aGlzLiRvblRva2VuaXplclVwZGF0ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSA9IHRoaXMucmVuZGVyZXIub25DaGFuZ2VUYWJTaXplLmJpbmQodGhpcy5yZW5kZXJlcik7XG4gICAgICAgICAgICBzZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VUYWJTaXplXCIsIHRoaXMuJG9uQ2hhbmdlVGFiU2l6ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlV3JhcExpbWl0ID0gdGhpcy5vbkNoYW5nZVdyYXBMaW1pdC5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlV3JhcExpbWl0XCIsIHRoaXMuJG9uQ2hhbmdlV3JhcExpbWl0KTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSA9IHRoaXMub25DaGFuZ2VXcmFwTW9kZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlV3JhcE1vZGVcIiwgdGhpcy4kb25DaGFuZ2VXcmFwTW9kZSk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlRm9sZCA9IHRoaXMub25DaGFuZ2VGb2xkLmJpbmQodGhpcyk7XG4gICAgICAgICAgICBzZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VGb2xkXCIsIHRoaXMuJG9uQ2hhbmdlRm9sZCk7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlRnJvbnRNYXJrZXIgPSB0aGlzLm9uQ2hhbmdlRnJvbnRNYXJrZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlRnJvbnRNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VGcm9udE1hcmtlcik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ2hhbmdlQmFja01hcmtlciA9IHRoaXMub25DaGFuZ2VCYWNrTWFya2VyLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24uYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZUJhY2tNYXJrZXJcIiwgdGhpcy4kb25DaGFuZ2VCYWNrTWFya2VyKTtcblxuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VCcmVha3BvaW50ID0gdGhpcy5vbkNoYW5nZUJyZWFrcG9pbnQuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB0aGlzLiRvbkNoYW5nZUJyZWFrcG9pbnQpO1xuXG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZUFubm90YXRpb24gPSB0aGlzLm9uQ2hhbmdlQW5ub3RhdGlvbi5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHRoaXMuJG9uQ2hhbmdlQW5ub3RhdGlvbik7XG5cbiAgICAgICAgICAgIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlID0gdGhpcy5vbkN1cnNvckNoYW5nZS5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VPdmVyd3JpdGVcIiwgdGhpcy4kb25DdXJzb3JDaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLiRvblNjcm9sbFRvcENoYW5nZSA9IHRoaXMub25TY3JvbGxUb3BDaGFuZ2UuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHRoaXMuJG9uU2Nyb2xsVG9wQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TY3JvbGxMZWZ0Q2hhbmdlID0gdGhpcy5vblNjcm9sbExlZnRDaGFuZ2UuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCB0aGlzLiRvblNjcm9sbExlZnRDaGFuZ2UpO1xuXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IHNlc3Npb24uZ2V0U2VsZWN0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlQ3Vyc29yXCIsIHRoaXMuJG9uQ3Vyc29yQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UgPSB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlU2VsZWN0aW9uXCIsIHRoaXMuJG9uU2VsZWN0aW9uQ2hhbmdlKTtcblxuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZU1vZGUoKTtcblxuICAgICAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgICAgIHRoaXMub25DdXJzb3JDaGFuZ2UoKTtcbiAgICAgICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgICAgIHRoaXMub25TY3JvbGxUb3BDaGFuZ2UoKTtcbiAgICAgICAgICAgIHRoaXMub25TY3JvbGxMZWZ0Q2hhbmdlKCk7XG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKCk7XG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlRnJvbnRNYXJrZXIoKTtcbiAgICAgICAgICAgIHRoaXMub25DaGFuZ2VCYWNrTWFya2VyKCk7XG4gICAgICAgICAgICB0aGlzLm9uQ2hhbmdlQnJlYWtwb2ludCgpO1xuICAgICAgICAgICAgdGhpcy5vbkNoYW5nZUFubm90YXRpb24oKTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSgpICYmIHRoaXMucmVuZGVyZXIuYWRqdXN0V3JhcExpbWl0KCk7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUZ1bGwoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNlc3Npb25cIiwge1xuICAgICAgICAgICAgc2Vzc2lvbjogc2Vzc2lvbixcbiAgICAgICAgICAgIG9sZFNlc3Npb246IG9sZFNlc3Npb25cbiAgICAgICAgfSk7XG5cbiAgICAgICAgb2xkU2Vzc2lvbiAmJiBvbGRTZXNzaW9uLl9zaWduYWwoXCJjaGFuZ2VFZGl0b3JcIiwgeyBvbGRFZGl0b3I6IHRoaXMgfSk7XG4gICAgICAgIHNlc3Npb24gJiYgc2Vzc2lvbi5fc2lnbmFsKFwiY2hhbmdlRWRpdG9yXCIsIHsgZWRpdG9yOiB0aGlzIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgc2Vzc2lvbiBiZWluZyB1c2VkLlxuICAgICAqIEByZXR1cm5zIHtFZGl0U2Vzc2lvbn1cbiAgICAgKiovXG4gICAgZ2V0U2Vzc2lvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjdXJyZW50IGRvY3VtZW50IHRvIGB2YWxgLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB2YWwgVGhlIG5ldyB2YWx1ZSB0byBzZXQgZm9yIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjdXJzb3JQb3MgV2hlcmUgdG8gc2V0IHRoZSBuZXcgdmFsdWUuIGB1bmRlZmluZWRgIG9yIDAgaXMgc2VsZWN0QWxsLCAtMSBpcyBhdCB0aGUgZG9jdW1lbnQgc3RhcnQsIGFuZCArMSBpcyBhdCB0aGUgZW5kXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgY3VycmVudCBkb2N1bWVudCB2YWx1ZVxuICAgICAqIEByZWxhdGVkIERvY3VtZW50LnNldFZhbHVlXG4gICAgICoqL1xuICAgIHNldFZhbHVlKHZhbDogc3RyaW5nLCBjdXJzb3JQb3M/OiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICB0aGlzLnNlc3Npb24uZG9jLnNldFZhbHVlKHZhbCk7XG5cbiAgICAgICAgaWYgKCFjdXJzb3JQb3MpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0QWxsKCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY3Vyc29yUG9zID09ICsxKSB7XG4gICAgICAgICAgICB0aGlzLm5hdmlnYXRlRmlsZUVuZCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGN1cnNvclBvcyA9PSAtMSkge1xuICAgICAgICAgICAgdGhpcy5uYXZpZ2F0ZUZpbGVTdGFydCgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRPRE86IFJhdGhlciBjcmF6eSEgRWl0aGVyIHJldHVybiB0aGlzIG9yIHRoZSBmb3JtZXIgdmFsdWU/XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZXNzaW9uJ3MgY29udGVudC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZ2V0VmFsdWVcbiAgICAgKiovXG4gICAgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudGx5IGhpZ2hsaWdodGVkIHNlbGVjdGlvbi5cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgaGlnaGxpZ2h0ZWQgc2VsZWN0aW9uXG4gICAgICoqL1xuICAgIGdldFNlbGVjdGlvbigpOiBzZW0uU2VsZWN0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgcmVzaXplXG4gICAgICogQHBhcmFtIFtmb3JjZV0ge2Jvb2xlYW59IGZvcmNlIElmIGB0cnVlYCwgcmVjb21wdXRlcyB0aGUgc2l6ZSwgZXZlbiBpZiB0aGUgaGVpZ2h0IGFuZCB3aWR0aCBoYXZlbid0IGNoYW5nZWQuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICByZXNpemUoZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIub25SZXNpemUoZm9yY2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLnNldFRoZW1lfVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0aGVtZSBUaGUgcGF0aCB0byBhIHRoZW1lXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2Igb3B0aW9uYWwgY2FsbGJhY2sgY2FsbGVkIHdoZW4gdGhlbWUgaXMgbG9hZGVkXG4gICAgICoqL1xuICAgIHNldFRoZW1lKHRoZW1lOiBzdHJpbmcsIGNiPzogKCkgPT4gdm9pZCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNldFRoZW1lKHRoZW1lLCBjYik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuZ2V0VGhlbWV9XG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgc2V0IHRoZW1lXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLmdldFRoZW1lXG4gICAgICoqL1xuICAgIGdldFRoZW1lKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFRoZW1lKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpWaXJ0dWFsUmVuZGVyZXIuc2V0U3R5bGV9XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHN0eWxlIEEgY2xhc3MgbmFtZVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNldFN0eWxlXG4gICAgICoqL1xuICAgIHNldFN0eWxlKHN0eWxlKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U3R5bGUoc3R5bGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGV9XG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnVuc2V0U3R5bGVcbiAgICAgKiovXG4gICAgdW5zZXRTdHlsZShzdHlsZSkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVuc2V0U3R5bGUoc3R5bGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIGN1cnJlbnQgZm9udCBzaXplIG9mIHRoZSBlZGl0b3IgdGV4dC5cbiAgICAgKi9cbiAgICBnZXRGb250U2l6ZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJmb250U2l6ZVwiKSB8fCBkb20uY29tcHV0ZWRTdHlsZSh0aGlzLmNvbnRhaW5lciwgXCJmb250U2l6ZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgYSBuZXcgZm9udCBzaXplIChpbiBwaXhlbHMpIGZvciB0aGUgZWRpdG9yIHRleHQuXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGZvbnRTaXplIEEgZm9udCBzaXplICggX2UuZy5fIFwiMTJweFwiKVxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0Rm9udFNpemUoZm9udFNpemU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZvbnRTaXplXCIsIGZvbnRTaXplKTtcbiAgICB9XG5cbiAgICAkaGlnaGxpZ2h0QnJhY2tldHMoKSB7XG4gICAgICAgIGlmICh0aGlzLnNlc3Npb24uJGJyYWNrZXRIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmVNYXJrZXIodGhpcy5zZXNzaW9uLiRicmFja2V0SGlnaGxpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kaGlnaGxpZ2h0UGVuZGluZykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGVyZm9ybSBoaWdobGlnaHQgYXN5bmMgdG8gbm90IGJsb2NrIHRoZSBicm93c2VyIGR1cmluZyBuYXZpZ2F0aW9uXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy4kaGlnaGxpZ2h0UGVuZGluZyA9IHRydWU7XG4gICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBzZWxmLiRoaWdobGlnaHRQZW5kaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciBwb3MgPSBzZWxmLnNlc3Npb24uZmluZE1hdGNoaW5nQnJhY2tldChzZWxmLmdldEN1cnNvclBvc2l0aW9uKCkpO1xuICAgICAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IG5ldyBybmcuUmFuZ2UocG9zLnJvdywgcG9zLmNvbHVtbiwgcG9zLnJvdywgcG9zLmNvbHVtbiArIDEpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChzZWxmLnNlc3Npb24uJG1vZGUuZ2V0TWF0Y2hpbmcpIHtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2U6IHJuZy5SYW5nZSA9IHNlbGYuc2Vzc2lvbi4kbW9kZS5nZXRNYXRjaGluZyhzZWxmLnNlc3Npb24pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJhbmdlKVxuICAgICAgICAgICAgICAgIHNlbGYuc2Vzc2lvbi4kYnJhY2tldEhpZ2hsaWdodCA9IHNlbGYuc2Vzc2lvbi5hZGRNYXJrZXIocmFuZ2UsIFwiYWNlX2JyYWNrZXRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICB9LCA1MCk7XG4gICAgfVxuXG4gICAgLy8gdG9kbzogbW92ZSB0byBtb2RlLmdldE1hdGNoaW5nXG4gICAgJGhpZ2hsaWdodFRhZ3MoKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXG4gICAgICAgIGlmICh0aGlzLiRoaWdobGlnaHRUYWdQZW5kaW5nKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwZXJmb3JtIGhpZ2hsaWdodCBhc3luYyB0byBub3QgYmxvY2sgdGhlIGJyb3dzZXIgZHVyaW5nIG5hdmlnYXRpb25cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLiRoaWdobGlnaHRUYWdQZW5kaW5nID0gdHJ1ZTtcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHNlbGYuJGhpZ2hsaWdodFRhZ1BlbmRpbmcgPSBmYWxzZTtcblxuICAgICAgICAgICAgdmFyIHBvcyA9IHNlbGYuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHNlbGYuc2Vzc2lvbiwgcG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICB2YXIgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcblxuICAgICAgICAgICAgaWYgKCF0b2tlbiB8fCB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRhZyA9IHRva2VuLnZhbHVlO1xuICAgICAgICAgICAgdmFyIGRlcHRoID0gMDtcbiAgICAgICAgICAgIHZhciBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PSAnPCcpIHtcbiAgICAgICAgICAgICAgICAvL2ZpbmQgY2xvc2luZyB0YWdcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IHRva2VuO1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2VuICYmIHRva2VuLnZhbHVlID09PSB0YWcgJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGgrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocHJldlRva2VuLnZhbHVlID09PSAnPC8nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGgtLTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgZGVwdGggPj0gMCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vZmluZCBvcGVuaW5nIHRhZ1xuICAgICAgICAgICAgICAgIGRvIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSBwcmV2VG9rZW47XG4gICAgICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IGl0ZXJhdG9yLnN0ZXBCYWNrd2FyZCgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiAmJiB0b2tlbi52YWx1ZSA9PT0gdGFnICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoKys7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoLS07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IHdoaWxlIChwcmV2VG9rZW4gJiYgZGVwdGggPD0gMCk7XG5cbiAgICAgICAgICAgICAgICAvL3NlbGVjdCB0YWcgYWdhaW5cbiAgICAgICAgICAgICAgICBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXRva2VuKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgICAgICAgdmFyIGNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpO1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IHJuZy5SYW5nZShyb3csIGNvbHVtbiwgcm93LCBjb2x1bW4gKyB0b2tlbi52YWx1ZS5sZW5ndGgpO1xuXG4gICAgICAgICAgICAvL3JlbW92ZSByYW5nZSBpZiBkaWZmZXJlbnRcbiAgICAgICAgICAgIGlmIChzZXNzaW9uLiR0YWdIaWdobGlnaHQgJiYgcmFuZ2UuY29tcGFyZVJhbmdlKHNlc3Npb24uJGJhY2tNYXJrZXJzW3Nlc3Npb24uJHRhZ0hpZ2hsaWdodF0ucmFuZ2UpICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgc2Vzc2lvbi5yZW1vdmVNYXJrZXIoc2Vzc2lvbi4kdGFnSGlnaGxpZ2h0KTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBudWxsO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmFuZ2UgJiYgIXNlc3Npb24uJHRhZ0hpZ2hsaWdodClcbiAgICAgICAgICAgICAgICBzZXNzaW9uLiR0YWdIaWdobGlnaHQgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2VfYnJhY2tldFwiLCBcInRleHRcIik7XG4gICAgICAgIH0sIDUwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEJyaW5ncyB0aGUgY3VycmVudCBgdGV4dElucHV0YCBpbnRvIGZvY3VzLlxuICAgICAqKi9cbiAgICBmb2N1cygpIHtcbiAgICAgICAgLy8gU2FmYXJpIG5lZWRzIHRoZSB0aW1lb3V0XG4gICAgICAgIC8vIGlPUyBhbmQgRmlyZWZveCBuZWVkIGl0IGNhbGxlZCBpbW1lZGlhdGVseVxuICAgICAgICAvLyB0byBiZSBvbiB0aGUgc2F2ZSBzaWRlIHdlIGRvIGJvdGhcbiAgICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIF9zZWxmLnRleHRJbnB1dC5mb2N1cygpO1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy50ZXh0SW5wdXQuZm9jdXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY3VycmVudCBgdGV4dElucHV0YCBpcyBpbiBmb2N1cy5cbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnRleHRJbnB1dC5pc0ZvY3VzZWQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIEJsdXJzIHRoZSBjdXJyZW50IGB0ZXh0SW5wdXRgLlxuICAgICAqKi9cbiAgICBibHVyKCkge1xuICAgICAgICB0aGlzLnRleHRJbnB1dC5ibHVyKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCBvbmNlIHRoZSBlZGl0b3IgY29tZXMgaW50byBmb2N1cy5cbiAgICAgKiBAZXZlbnQgZm9jdXNcbiAgICAgKlxuICAgICAqKi9cbiAgICBvbkZvY3VzKCkge1xuICAgICAgICBpZiAodGhpcy4kaXNGb2N1c2VkKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kaXNGb2N1c2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaG93Q3Vyc29yKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudmlzdWFsaXplRm9jdXMoKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImZvY3VzXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgb25jZSB0aGUgZWRpdG9yIGhhcyBiZWVuIGJsdXJyZWQuXG4gICAgICogQGV2ZW50IGJsdXJcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uQmx1cigpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRpc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRpc0ZvY3VzZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5oaWRlQ3Vyc29yKCk7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudmlzdWFsaXplQmx1cigpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiYmx1clwiKTtcbiAgICB9XG5cbiAgICAkY3Vyc29yQ2hhbmdlKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnVwZGF0ZUN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbmV2ZXIgdGhlIGRvY3VtZW50IGlzIGNoYW5nZWQuXG4gICAgICogQGV2ZW50IGNoYW5nZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBlIENvbnRhaW5zIGEgc2luZ2xlIHByb3BlcnR5LCBgZGF0YWAsIHdoaWNoIGhhcyB0aGUgZGVsdGEgb2YgY2hhbmdlc1xuICAgICAqXG4gICAgICoqL1xuICAgIG9uRG9jdW1lbnRDaGFuZ2UoZSkge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHZhciByYW5nZSA9IGRlbHRhLnJhbmdlO1xuICAgICAgICB2YXIgbGFzdFJvdzogbnVtYmVyO1xuXG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPT0gcmFuZ2UuZW5kLnJvdyAmJiBkZWx0YS5hY3Rpb24gIT0gXCJpbnNlcnRMaW5lc1wiICYmIGRlbHRhLmFjdGlvbiAhPSBcInJlbW92ZUxpbmVzXCIpXG4gICAgICAgICAgICBsYXN0Um93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgbGFzdFJvdyA9IEluZmluaXR5O1xuXG4gICAgICAgIHZhciByOiB2cm0uVmlydHVhbFJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcjtcbiAgICAgICAgci51cGRhdGVMaW5lcyhyYW5nZS5zdGFydC5yb3csIGxhc3RSb3csIHRoaXMuc2Vzc2lvbi4kdXNlV3JhcE1vZGUpO1xuXG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVwiLCBlKTtcblxuICAgICAgICAvLyB1cGRhdGUgY3Vyc29yIGJlY2F1c2UgdGFiIGNoYXJhY3RlcnMgY2FuIGluZmx1ZW5jZSB0aGUgY3Vyc29yIHBvc2l0aW9uXG4gICAgICAgIHRoaXMuJGN1cnNvckNoYW5nZSgpO1xuICAgICAgICB0aGlzLiR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCk7XG4gICAgfVxuXG4gICAgb25Ub2tlbml6ZXJVcGRhdGUoZSkge1xuICAgICAgICB2YXIgcm93cyA9IGUuZGF0YTtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVMaW5lcyhyb3dzLmZpcnN0LCByb3dzLmxhc3QpO1xuICAgIH1cblxuXG4gICAgb25TY3JvbGxUb3BDaGFuZ2UoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsVG9ZKHRoaXMuc2Vzc2lvbi5nZXRTY3JvbGxUb3AoKSk7XG4gICAgfVxuXG4gICAgb25TY3JvbGxMZWZ0Q2hhbmdlKCkge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvWCh0aGlzLnNlc3Npb24uZ2V0U2Nyb2xsTGVmdCgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW4gdGhlIHNlbGVjdGlvbiBjaGFuZ2VzLlxuICAgICAqXG4gICAgICoqL1xuICAgIG9uQ3Vyc29yQ2hhbmdlKCkge1xuICAgICAgICB0aGlzLiRjdXJzb3JDaGFuZ2UoKTtcblxuICAgICAgICBpZiAoIXRoaXMuJGJsb2NrU2Nyb2xsaW5nKSB7XG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRoaWdobGlnaHRCcmFja2V0cygpO1xuICAgICAgICB0aGlzLiRoaWdobGlnaHRUYWdzKCk7XG4gICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgIH1cblxuICAgICR1cGRhdGVIaWdobGlnaHRBY3RpdmVMaW5lKCkge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuZ2V0U2Vzc2lvbigpO1xuXG4gICAgICAgIHZhciBoaWdobGlnaHQ7XG4gICAgICAgIGlmICh0aGlzLiRoaWdobGlnaHRBY3RpdmVMaW5lKSB7XG4gICAgICAgICAgICBpZiAoKHRoaXMuJHNlbGVjdGlvblN0eWxlICE9IFwibGluZVwiIHx8ICF0aGlzLnNlbGVjdGlvbi5pc011bHRpTGluZSgpKSlcbiAgICAgICAgICAgICAgICBoaWdobGlnaHQgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCk7XG4gICAgICAgICAgICBpZiAodGhpcy5yZW5kZXJlci4kbWF4TGluZXMgJiYgdGhpcy5zZXNzaW9uLmdldExlbmd0aCgpID09PSAxICYmICEodGhpcy5yZW5kZXJlci4kbWluTGluZXMgPiAxKSlcbiAgICAgICAgICAgICAgICBoaWdobGlnaHQgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZXNzaW9uLiRoaWdobGlnaHRMaW5lTWFya2VyICYmICFoaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuaWQpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIgJiYgaGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2U6IGFueSA9IG5ldyBybmcuUmFuZ2UoaGlnaGxpZ2h0LnJvdywgaGlnaGxpZ2h0LmNvbHVtbiwgaGlnaGxpZ2h0LnJvdywgSW5maW5pdHkpO1xuICAgICAgICAgICAgcmFuZ2UuaWQgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2VfYWN0aXZlLWxpbmVcIiwgXCJzY3JlZW5MaW5lXCIpO1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlciA9IHJhbmdlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGhpZ2hsaWdodCkge1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlci5zdGFydC5yb3cgPSBoaWdobGlnaHQucm93O1xuICAgICAgICAgICAgc2Vzc2lvbi4kaGlnaGxpZ2h0TGluZU1hcmtlci5lbmQucm93ID0gaGlnaGxpZ2h0LnJvdztcbiAgICAgICAgICAgIHNlc3Npb24uJGhpZ2hsaWdodExpbmVNYXJrZXIuc3RhcnQuY29sdW1uID0gaGlnaGxpZ2h0LmNvbHVtbjtcbiAgICAgICAgICAgIHNlc3Npb24uX3NpZ25hbChcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBvblNlbGVjdGlvbkNoYW5nZShlPykge1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICBpZiAodHlwZW9mIHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlciA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHNlc3Npb24ucmVtb3ZlTWFya2VyKHNlc3Npb24uJHNlbGVjdGlvbk1hcmtlcik7XG4gICAgICAgICAgICBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLmdldFNlbGVjdGlvblN0eWxlKCk7XG4gICAgICAgICAgICBzZXNzaW9uLiRzZWxlY3Rpb25NYXJrZXIgPSBzZXNzaW9uLmFkZE1hcmtlcihyYW5nZSwgXCJhY2Vfc2VsZWN0aW9uXCIsIHN0eWxlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZSA9IHRoaXMuJGhpZ2hsaWdodFNlbGVjdGVkV29yZCAmJiB0aGlzLiRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLmhpZ2hsaWdodChyZSk7XG5cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2VsZWN0aW9uXCIpO1xuICAgIH1cblxuICAgICRnZXRTZWxlY3Rpb25IaWdoTGlnaHRSZWdleHAoKSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuXG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpIHx8IHNlbGVjdGlvbi5pc011bHRpTGluZSgpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBzdGFydE91dGVyID0gc2VsZWN0aW9uLnN0YXJ0LmNvbHVtbiAtIDE7XG4gICAgICAgIHZhciBlbmRPdXRlciA9IHNlbGVjdGlvbi5lbmQuY29sdW1uICsgMTtcbiAgICAgICAgdmFyIGxpbmUgPSBzZXNzaW9uLmdldExpbmUoc2VsZWN0aW9uLnN0YXJ0LnJvdyk7XG4gICAgICAgIHZhciBsaW5lQ29scyA9IGxpbmUubGVuZ3RoO1xuICAgICAgICB2YXIgbmVlZGxlID0gbGluZS5zdWJzdHJpbmcoTWF0aC5tYXgoc3RhcnRPdXRlciwgMCksXG4gICAgICAgICAgICBNYXRoLm1pbihlbmRPdXRlciwgbGluZUNvbHMpKTtcblxuICAgICAgICAvLyBNYWtlIHN1cmUgdGhlIG91dGVyIGNoYXJhY3RlcnMgYXJlIG5vdCBwYXJ0IG9mIHRoZSB3b3JkLlxuICAgICAgICBpZiAoKHN0YXJ0T3V0ZXIgPj0gMCAmJiAvXltcXHdcXGRdLy50ZXN0KG5lZWRsZSkpIHx8XG4gICAgICAgICAgICAoZW5kT3V0ZXIgPD0gbGluZUNvbHMgJiYgL1tcXHdcXGRdJC8udGVzdChuZWVkbGUpKSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICBuZWVkbGUgPSBsaW5lLnN1YnN0cmluZyhzZWxlY3Rpb24uc3RhcnQuY29sdW1uLCBzZWxlY3Rpb24uZW5kLmNvbHVtbik7XG4gICAgICAgIGlmICghL15bXFx3XFxkXSskLy50ZXN0KG5lZWRsZSkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIHJlID0gdGhpcy4kc2VhcmNoLiRhc3NlbWJsZVJlZ0V4cCh7XG4gICAgICAgICAgICB3aG9sZVdvcmQ6IHRydWUsXG4gICAgICAgICAgICBjYXNlU2Vuc2l0aXZlOiB0cnVlLFxuICAgICAgICAgICAgbmVlZGxlOiBuZWVkbGVcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VGcm9udE1hcmtlcigpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVGcm9udE1hcmtlcnMoKTtcbiAgICB9XG5cbiAgICBvbkNoYW5nZUJhY2tNYXJrZXIoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlQmFja01hcmtlcnMoKTtcbiAgICB9XG5cblxuICAgIG9uQ2hhbmdlQnJlYWtwb2ludCgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVCcmVha3BvaW50cygpO1xuICAgIH1cblxuICAgIG9uQ2hhbmdlQW5ub3RhdGlvbigpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRBbm5vdGF0aW9ucyh0aGlzLnNlc3Npb24uZ2V0QW5ub3RhdGlvbnMoKSk7XG4gICAgfVxuXG5cbiAgICBvbkNoYW5nZU1vZGUoZT8pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci51cGRhdGVUZXh0KCk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VNb2RlXCIsIGUpO1xuICAgIH1cblxuXG4gICAgb25DaGFuZ2VXcmFwTGltaXQoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlRnVsbCgpO1xuICAgIH1cblxuICAgIG9uQ2hhbmdlV3JhcE1vZGUoKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIub25SZXNpemUodHJ1ZSk7XG4gICAgfVxuXG5cbiAgICBvbkNoYW5nZUZvbGQoKSB7XG4gICAgICAgIC8vIFVwZGF0ZSB0aGUgYWN0aXZlIGxpbmUgbWFya2VyIGFzIGR1ZSB0byBmb2xkaW5nIGNoYW5nZXMgdGhlIGN1cnJlbnRcbiAgICAgICAgLy8gbGluZSByYW5nZSBvbiB0aGUgc2NyZWVuIG1pZ2h0IGhhdmUgY2hhbmdlZC5cbiAgICAgICAgdGhpcy4kdXBkYXRlSGlnaGxpZ2h0QWN0aXZlTGluZSgpO1xuICAgICAgICAvLyBUT0RPOiBUaGlzIG1pZ2h0IGJlIHRvbyBtdWNoIHVwZGF0aW5nLiBPa2F5IGZvciBub3cuXG4gICAgICAgIHRoaXMucmVuZGVyZXIudXBkYXRlRnVsbCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBvZiB0ZXh0IGN1cnJlbnRseSBoaWdobGlnaHRlZC5cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqKi9cbiAgICBnZXRTZWxlY3RlZFRleHQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRW1pdHRlZCB3aGVuIHRleHQgaXMgY29waWVkLlxuICAgICAqIEBldmVudCBjb3B5XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIGNvcGllZCB0ZXh0XG4gICAgICpcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIG9mIHRleHQgY3VycmVudGx5IGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgICogQGRlcHJlY2F0ZWQgVXNlIGdldFNlbGVjdGVkVGV4dCBpbnN0ZWFkLlxuICAgICAqKi9cbiAgICBnZXRDb3B5VGV4dCgpIHtcbiAgICAgICAgdmFyIHRleHQgPSB0aGlzLmdldFNlbGVjdGVkVGV4dCgpO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjb3B5XCIsIHRleHQpO1xuICAgICAgICByZXR1cm4gdGV4dDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxsZWQgd2hlbmV2ZXIgYSB0ZXh0IFwiY29weVwiIGhhcHBlbnMuXG4gICAgICoqL1xuICAgIG9uQ29weSgpIHtcbiAgICAgICAgdGhpcy5jb21tYW5kcy5leGVjKFwiY29weVwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYWxsZWQgd2hlbmV2ZXIgYSB0ZXh0IFwiY3V0XCIgaGFwcGVucy5cbiAgICAgKiovXG4gICAgb25DdXQoKSB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhcImN1dFwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbWl0dGVkIHdoZW4gdGV4dCBpcyBwYXN0ZWQuXG4gICAgICogQGV2ZW50IHBhc3RlXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIHBhc3RlZCB0ZXh0XG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICAvKipcbiAgICAgKiBDYWxsZWQgd2hlbmV2ZXIgYSB0ZXh0IFwicGFzdGVcIiBoYXBwZW5zLlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBwYXN0ZWQgdGV4dFxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgb25QYXN0ZSh0ZXh0KSB7XG4gICAgICAgIC8vIHRvZG8gdGhpcyBzaG91bGQgY2hhbmdlIHdoZW4gcGFzdGUgYmVjb21lcyBhIGNvbW1hbmRcbiAgICAgICAgaWYgKHRoaXMuJHJlYWRPbmx5KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgZSA9IHsgdGV4dDogdGV4dCB9O1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJwYXN0ZVwiLCBlKTtcbiAgICAgICAgdGhpcy5pbnNlcnQoZS50ZXh0LCB0cnVlKTtcbiAgICB9XG5cblxuICAgIGV4ZWNDb21tYW5kKGNvbW1hbmQsIGFyZ3M/KTogdm9pZCB7XG4gICAgICAgIHRoaXMuY29tbWFuZHMuZXhlYyhjb21tYW5kLCB0aGlzLCBhcmdzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGB0ZXh0YCBpbnRvIHdoZXJldmVyIHRoZSBjdXJzb3IgaXMgcG9pbnRpbmcuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIG5ldyB0ZXh0IHRvIGFkZFxuICAgICAqXG4gICAgICoqL1xuICAgIGluc2VydCh0ZXh0LCBwYXN0ZWQ/KSB7XG4gICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICB2YXIgbW9kZSA9IHNlc3Npb24uZ2V0TW9kZSgpO1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuXG4gICAgICAgIGlmICh0aGlzLmdldEJlaGF2aW91cnNFbmFibGVkKCkgJiYgIXBhc3RlZCkge1xuICAgICAgICAgICAgLy8gR2V0IGEgdHJhbnNmb3JtIGlmIHRoZSBjdXJyZW50IG1vZGUgd2FudHMgb25lLlxuICAgICAgICAgICAgdmFyIHRyYW5zZm9ybSA9IG1vZGUudHJhbnNmb3JtQWN0aW9uKHNlc3Npb24uZ2V0U3RhdGUoY3Vyc29yLnJvdyksICdpbnNlcnRpb24nLCB0aGlzLCBzZXNzaW9uLCB0ZXh0KTtcbiAgICAgICAgICAgIGlmICh0cmFuc2Zvcm0pIHtcbiAgICAgICAgICAgICAgICBpZiAodGV4dCAhPT0gdHJhbnNmb3JtLnRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXNzaW9uLm1lcmdlVW5kb0RlbHRhcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRtZXJnZU5leHRDb21tYW5kID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRleHQgPSB0cmFuc2Zvcm0udGV4dDtcblxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRleHQgPT0gXCJcXHRcIilcbiAgICAgICAgICAgIHRleHQgPSB0aGlzLnNlc3Npb24uZ2V0VGFiU3RyaW5nKCk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIHNlbGVjdGVkIHRleHRcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgICAgIGN1cnNvciA9IHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHRoaXMuc2Vzc2lvbi5nZXRPdmVyd3JpdGUoKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gcm5nLlJhbmdlLmZyb21Qb2ludHMoY3Vyc29yLCBjdXJzb3IpO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiArPSB0ZXh0Lmxlbmd0aDtcbiAgICAgICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRleHQgPT0gXCJcXG5cIiB8fCB0ZXh0ID09IFwiXFxyXFxuXCIpIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gc2Vzc2lvbi5nZXRMaW5lKGN1cnNvci5yb3cpO1xuICAgICAgICAgICAgaWYgKGN1cnNvci5jb2x1bW4gPiBsaW5lLnNlYXJjaCgvXFxTfCQvKSkge1xuICAgICAgICAgICAgICAgIHZhciBkID0gbGluZS5zdWJzdHIoY3Vyc29yLmNvbHVtbikuc2VhcmNoKC9cXFN8JC8pO1xuICAgICAgICAgICAgICAgIHNlc3Npb24uZG9jLnJlbW92ZUluTGluZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uLCBjdXJzb3IuY29sdW1uICsgZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuXG4gICAgICAgIHZhciBzdGFydCA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIHZhciBsaW5lU3RhdGUgPSBzZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHNob3VsZE91dGRlbnQgPSBtb2RlLmNoZWNrT3V0ZGVudChsaW5lU3RhdGUsIGxpbmUsIHRleHQpO1xuICAgICAgICB2YXIgZW5kID0gc2Vzc2lvbi5pbnNlcnQoY3Vyc29yLCB0ZXh0KTtcblxuICAgICAgICBpZiAodHJhbnNmb3JtICYmIHRyYW5zZm9ybS5zZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGlmICh0cmFuc2Zvcm0uc2VsZWN0aW9uLmxlbmd0aCA9PSAyKSB7IC8vIFRyYW5zZm9ybSByZWxhdGl2ZSB0byB0aGUgY3VycmVudCBjb2x1bW5cbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShcbiAgICAgICAgICAgICAgICAgICAgbmV3IHJuZy5SYW5nZShjdXJzb3Iucm93LCBzdGFydCArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJzb3Iucm93LCBzdGFydCArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMV0pKTtcbiAgICAgICAgICAgIH0gZWxzZSB7IC8vIFRyYW5zZm9ybSByZWxhdGl2ZSB0byB0aGUgY3VycmVudCByb3cuXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIG5ldyBybmcuUmFuZ2UoY3Vyc29yLnJvdyArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMF0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0uc2VsZWN0aW9uWzFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY3Vyc29yLnJvdyArIHRyYW5zZm9ybS5zZWxlY3Rpb25bMl0sXG4gICAgICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0uc2VsZWN0aW9uWzNdKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2Vzc2lvbi5nZXREb2N1bWVudCgpLmlzTmV3TGluZSh0ZXh0KSkge1xuICAgICAgICAgICAgdmFyIGxpbmVJbmRlbnQgPSBtb2RlLmdldE5leHRMaW5lSW5kZW50KGxpbmVTdGF0ZSwgbGluZS5zbGljZSgwLCBjdXJzb3IuY29sdW1uKSwgc2Vzc2lvbi5nZXRUYWJTdHJpbmcoKSk7XG5cbiAgICAgICAgICAgIHNlc3Npb24uaW5zZXJ0KHsgcm93OiBjdXJzb3Iucm93ICsgMSwgY29sdW1uOiAwIH0sIGxpbmVJbmRlbnQpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzaG91bGRPdXRkZW50KVxuICAgICAgICAgICAgbW9kZS5hdXRvT3V0ZGVudChsaW5lU3RhdGUsIHNlc3Npb24sIGN1cnNvci5yb3cpO1xuICAgIH1cblxuICAgIG9uVGV4dElucHV0KHRleHQ6IHN0cmluZykge1xuICAgICAgICB0aGlzLmtleUJpbmRpbmcub25UZXh0SW5wdXQodGV4dCk7XG4gICAgICAgIC8vIFRPRE86IFRoaXMgc2hvdWxkIGJlIHBsdWdnYWJsZS5cbiAgICAgICAgaWYgKHRleHQgPT09ICcuJykge1xuICAgICAgICAgICAgdGhpcy5jb21tYW5kcy5leGVjKHByb3RvY29sLkNPTU1BTkRfTkFNRV9BVVRPX0NPTVBMRVRFKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0aGlzLmdldFNlc3Npb24oKS5nZXREb2N1bWVudCgpLmlzTmV3TGluZSh0ZXh0KSkge1xuICAgICAgICAgICAgdmFyIGxpbmVOdW1iZXIgPSB0aGlzLmdldEN1cnNvclBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgLy8gICAgICAgICAgICB2YXIgb3B0aW9uID0gbmV3IFNlcnZpY2VzLkVkaXRvck9wdGlvbnMoKTtcbiAgICAgICAgICAgIC8vICAgICAgICAgICAgb3B0aW9uLk5ld0xpbmVDaGFyYWN0ZXIgPSBcIlxcblwiO1xuICAgICAgICAgICAgLy8gRklYTUU6IFNtYXJ0IEluZGVudGluZ1xuICAgICAgICAgICAgLypcbiAgICAgICAgICAgIHZhciBpbmRlbnQgPSBsYW5ndWFnZVNlcnZpY2UuZ2V0U21hcnRJbmRlbnRBdExpbmVOdW1iZXIoY3VycmVudEZpbGVOYW1lLCBsaW5lTnVtYmVyLCBvcHRpb24pO1xuICAgICAgICAgICAgaWYoaW5kZW50ID4gMClcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IuY29tbWFuZHMuZXhlYyhcImluc2VydHRleHRcIiwgZWRpdG9yLCB7dGV4dDpcIiBcIiwgdGltZXM6aW5kZW50fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAqL1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgb25Db21tYW5kS2V5KGUsIGhhc2hJZCwga2V5Q29kZSkge1xuICAgICAgICB0aGlzLmtleUJpbmRpbmcub25Db21tYW5kS2V5KGUsIGhhc2hJZCwga2V5Q29kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFzcyBpbiBgdHJ1ZWAgdG8gZW5hYmxlIG92ZXJ3cml0ZXMgaW4geW91ciBzZXNzaW9uLCBvciBgZmFsc2VgIHRvIGRpc2FibGUuIElmIG92ZXJ3cml0ZXMgaXMgZW5hYmxlZCwgYW55IHRleHQgeW91IGVudGVyIHdpbGwgdHlwZSBvdmVyIGFueSB0ZXh0IGFmdGVyIGl0LiBJZiB0aGUgdmFsdWUgb2YgYG92ZXJ3cml0ZWAgY2hhbmdlcywgdGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYGNoYW5nZU92ZXJ3cml0ZWAgZXZlbnQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBvdmVyd3JpdGUgRGVmaW5lcyB3aGV0ZXIgb3Igbm90IHRvIHNldCBvdmVyd3JpdGVzXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnNldE92ZXJ3cml0ZVxuICAgICAqKi9cbiAgICBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5zZXRPdmVyd3JpdGUob3ZlcndyaXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGVcbiAgICAgKiovXG4gICAgZ2V0T3ZlcndyaXRlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmdldE92ZXJ3cml0ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHZhbHVlIG9mIG92ZXJ3cml0ZSB0byB0aGUgb3Bwb3NpdGUgb2Ygd2hhdGV2ZXIgaXQgY3VycmVudGx5IGlzLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnRvZ2dsZU92ZXJ3cml0ZVxuICAgICAqKi9cbiAgICB0b2dnbGVPdmVyd3JpdGUoKSB7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGhvdyBmYXN0IHRoZSBtb3VzZSBzY3JvbGxpbmcgc2hvdWxkIGRvLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzcGVlZCBBIHZhbHVlIGluZGljYXRpbmcgdGhlIG5ldyBzcGVlZCAoaW4gbWlsbGlzZWNvbmRzKVxuICAgICAqKi9cbiAgICBzZXRTY3JvbGxTcGVlZChzcGVlZDogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2Nyb2xsU3BlZWRcIiwgc3BlZWQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHZhbHVlIGluZGljYXRpbmcgaG93IGZhc3QgdGhlIG1vdXNlIHNjcm9sbCBzcGVlZCBpcyAoaW4gbWlsbGlzZWNvbmRzKS5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXRTY3JvbGxTcGVlZCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzY3JvbGxTcGVlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBkZWxheSAoaW4gbWlsbGlzZWNvbmRzKSBvZiB0aGUgbW91c2UgZHJhZy5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZHJhZ0RlbGF5IEEgdmFsdWUgaW5kaWNhdGluZyB0aGUgbmV3IGRlbGF5XG4gICAgICoqL1xuICAgIHNldERyYWdEZWxheShkcmFnRGVsYXk6IG51bWJlcikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImRyYWdEZWxheVwiLCBkcmFnRGVsYXkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbW91c2UgZHJhZyBkZWxheS5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqKi9cbiAgICBnZXREcmFnRGVsYXkoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiZHJhZ0RlbGF5XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVtaXR0ZWQgd2hlbiB0aGUgc2VsZWN0aW9uIHN0eWxlIGNoYW5nZXMsIHZpYSBbW0VkaXRvci5zZXRTZWxlY3Rpb25TdHlsZV1dLlxuICAgICAqIEBldmVudCBjaGFuZ2VTZWxlY3Rpb25TdHlsZVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhIENvbnRhaW5zIG9uZSBwcm9wZXJ0eSwgYGRhdGFgLCB3aGljaCBpbmRpY2F0ZXMgdGhlIG5ldyBzZWxlY3Rpb24gc3R5bGVcbiAgICAgKiovXG4gICAgLyoqXG4gICAgICogRHJhdyBzZWxlY3Rpb24gbWFya2VycyBzcGFubmluZyB3aG9sZSBsaW5lLCBvciBvbmx5IG92ZXIgc2VsZWN0ZWQgdGV4dC4gRGVmYXVsdCB2YWx1ZSBpcyBcImxpbmVcIlxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHlsZSBUaGUgbmV3IHNlbGVjdGlvbiBzdHlsZSBcImxpbmVcInxcInRleHRcIlxuICAgICAqXG4gICAgICoqL1xuICAgIHNldFNlbGVjdGlvblN0eWxlKHZhbDogc3RyaW5nKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwic2VsZWN0aW9uU3R5bGVcIiwgdmFsKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlbGVjdGlvbiBzdHlsZS5cbiAgICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICAqKi9cbiAgICBnZXRTZWxlY3Rpb25TdHlsZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJzZWxlY3Rpb25TdHlsZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHRoZSBjdXJyZW50IGxpbmUgc2hvdWxkIGJlIGhpZ2hsaWdodGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gc2hvdWxkSGlnaGxpZ2h0IFNldCB0byBgdHJ1ZWAgdG8gaGlnaGxpZ2h0IHRoZSBjdXJyZW50IGxpbmVcbiAgICAgKiovXG4gICAgc2V0SGlnaGxpZ2h0QWN0aXZlTGluZShzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRBY3RpdmVMaW5lXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgY3VycmVudCBsaW5lcyBhcmUgYWx3YXlzIGhpZ2hsaWdodGVkLlxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhpZ2hsaWdodEFjdGl2ZUxpbmUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImhpZ2hsaWdodEFjdGl2ZUxpbmVcIik7XG4gICAgfVxuXG4gICAgc2V0SGlnaGxpZ2h0R3V0dGVyTGluZShzaG91bGRIaWdobGlnaHQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJoaWdobGlnaHRHdXR0ZXJMaW5lXCIsIHNob3VsZEhpZ2hsaWdodCk7XG4gICAgfVxuXG4gICAgZ2V0SGlnaGxpZ2h0R3V0dGVyTGluZSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwiaGlnaGxpZ2h0R3V0dGVyTGluZVwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgd29yZCBzaG91bGQgYmUgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG91bGRIaWdobGlnaHQgU2V0IHRvIGB0cnVlYCB0byBoaWdobGlnaHQgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCB3b3JkXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0SGlnaGxpZ2h0U2VsZWN0ZWRXb3JkKHNob3VsZEhpZ2hsaWdodDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImhpZ2hsaWdodFNlbGVjdGVkV29yZFwiLCBzaG91bGRIaWdobGlnaHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIGN1cnJlbnRseSBoaWdobGlnaHRlZCB3b3JkcyBhcmUgdG8gYmUgaGlnaGxpZ2h0ZWQuXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEhpZ2hsaWdodFNlbGVjdGVkV29yZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGhpZ2hsaWdodFNlbGVjdGVkV29yZDtcbiAgICB9XG5cbiAgICBzZXRBbmltYXRlZFNjcm9sbChzaG91bGRBbmltYXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0QW5pbWF0ZWRTY3JvbGwoc2hvdWxkQW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgZ2V0QW5pbWF0ZWRTY3JvbGwoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldEFuaW1hdGVkU2Nyb2xsKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHNob3dJbnZpc2libGVzYCBpcyBzZXQgdG8gYHRydWVgLCBpbnZpc2libGUgY2hhcmFjdGVycyZtZGFzaDtsaWtlIHNwYWNlcyBvciBuZXcgbGluZXMmbWRhc2g7YXJlIHNob3cgaW4gdGhlIGVkaXRvci5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3dJbnZpc2libGVzIFNwZWNpZmllcyB3aGV0aGVyIG9yIG5vdCB0byBzaG93IGludmlzaWJsZSBjaGFyYWN0ZXJzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0U2hvd0ludmlzaWJsZXMoc2hvd0ludmlzaWJsZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaG93SW52aXNpYmxlcyhzaG93SW52aXNpYmxlcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgaW52aXNpYmxlIGNoYXJhY3RlcnMgYXJlIGJlaW5nIHNob3duLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRTaG93SW52aXNpYmxlcygpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0U2hvd0ludmlzaWJsZXMoKTtcbiAgICB9XG5cbiAgICBzZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXM6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXREaXNwbGF5SW5kZW50R3VpZGVzKGRpc3BsYXlJbmRlbnRHdWlkZXMpO1xuICAgIH1cblxuICAgIGdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldERpc3BsYXlJbmRlbnRHdWlkZXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJZiBgc2hvd1ByaW50TWFyZ2luYCBpcyBzZXQgdG8gYHRydWVgLCB0aGUgcHJpbnQgbWFyZ2luIGlzIHNob3duIGluIHRoZSBlZGl0b3IuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBzaG93UHJpbnRNYXJnaW4gU3BlY2lmaWVzIHdoZXRoZXIgb3Igbm90IHRvIHNob3cgdGhlIHByaW50IG1hcmdpblxuICAgICAqKi9cbiAgICBzZXRTaG93UHJpbnRNYXJnaW4oc2hvd1ByaW50TWFyZ2luOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0U2hvd1ByaW50TWFyZ2luKHNob3dQcmludE1hcmdpbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHByaW50IG1hcmdpbiBpcyBiZWluZyBzaG93bi5cbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93UHJpbnRNYXJnaW4oKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldFNob3dQcmludE1hcmdpbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGNvbHVtbiBkZWZpbmluZyB3aGVyZSB0aGUgcHJpbnQgbWFyZ2luIHNob3VsZCBiZS5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc2hvd1ByaW50TWFyZ2luIFNwZWNpZmllcyB0aGUgbmV3IHByaW50IG1hcmdpblxuICAgICAqL1xuICAgIHNldFByaW50TWFyZ2luQ29sdW1uKHNob3dQcmludE1hcmdpbjogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UHJpbnRNYXJnaW5Db2x1bW4oc2hvd1ByaW50TWFyZ2luKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjb2x1bW4gbnVtYmVyIG9mIHdoZXJlIHRoZSBwcmludCBtYXJnaW4gaXMuXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKi9cbiAgICBnZXRQcmludE1hcmdpbkNvbHVtbigpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5yZW5kZXJlci5nZXRQcmludE1hcmdpbkNvbHVtbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGByZWFkT25seWAgaXMgdHJ1ZSwgdGhlbiB0aGUgZWRpdG9yIGlzIHNldCB0byByZWFkLW9ubHkgbW9kZSwgYW5kIG5vbmUgb2YgdGhlIGNvbnRlbnQgY2FuIGNoYW5nZS5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHJlYWRPbmx5IFNwZWNpZmllcyB3aGV0aGVyIHRoZSBlZGl0b3IgY2FuIGJlIG1vZGlmaWVkIG9yIG5vdFxuICAgICAqXG4gICAgICoqL1xuICAgIHNldFJlYWRPbmx5KHJlYWRPbmx5OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwicmVhZE9ubHlcIiwgcmVhZE9ubHkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBlZGl0b3IgaXMgc2V0IHRvIHJlYWQtb25seSBtb2RlLlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqKi9cbiAgICBnZXRSZWFkT25seSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwicmVhZE9ubHlcIik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BlY2lmaWVzIHdoZXRoZXIgdG8gdXNlIGJlaGF2aW9ycyBvciBub3QuIFtcIkJlaGF2aW9yc1wiIGluIHRoaXMgY2FzZSBpcyB0aGUgYXV0by1wYWlyaW5nIG9mIHNwZWNpYWwgY2hhcmFjdGVycywgbGlrZSBxdW90YXRpb24gbWFya3MsIHBhcmVudGhlc2lzLCBvciBicmFja2V0cy5dezogI0JlaGF2aW9yc0RlZn1cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZWQgRW5hYmxlcyBvciBkaXNhYmxlcyBiZWhhdmlvcnNcbiAgICAgKlxuICAgICAqKi9cbiAgICBzZXRCZWhhdmlvdXJzRW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwiYmVoYXZpb3Vyc0VuYWJsZWRcIiwgZW5hYmxlZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGJlaGF2aW9ycyBhcmUgY3VycmVudGx5IGVuYWJsZWQuIHs6QmVoYXZpb3JzRGVmfVxuICAgICAqXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGdldEJlaGF2aW91cnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRPcHRpb24oXCJiZWhhdmlvdXJzRW5hYmxlZFwiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTcGVjaWZpZXMgd2hldGhlciB0byB1c2Ugd3JhcHBpbmcgYmVoYXZpb3JzIG9yIG5vdCwgaS5lLiBhdXRvbWF0aWNhbGx5IHdyYXBwaW5nIHRoZSBzZWxlY3Rpb24gd2l0aCBjaGFyYWN0ZXJzIHN1Y2ggYXMgYnJhY2tldHNcbiAgICAgKiB3aGVuIHN1Y2ggYSBjaGFyYWN0ZXIgaXMgdHlwZWQgaW4uXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGVkIEVuYWJsZXMgb3IgZGlzYWJsZXMgd3JhcHBpbmcgYmVoYXZpb3JzXG4gICAgICpcbiAgICAgKiovXG4gICAgc2V0V3JhcEJlaGF2aW91cnNFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ3cmFwQmVoYXZpb3Vyc0VuYWJsZWRcIiwgZW5hYmxlZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHdyYXBwaW5nIGJlaGF2aW9ycyBhcmUgY3VycmVudGx5IGVuYWJsZWQuXG4gICAgICoqL1xuICAgIGdldFdyYXBCZWhhdmlvdXJzRW5hYmxlZCgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0T3B0aW9uKFwid3JhcEJlaGF2aW91cnNFbmFibGVkXCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyB3aGV0aGVyIHRoZSBmb2xkIHdpZGdldHMgc2hvdWxkIGJlIHNob3duIG9yIG5vdC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHNob3cgU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGZvbGQgd2lkZ2V0cyBhcmUgc2hvd25cbiAgICAgKiovXG4gICAgc2V0U2hvd0ZvbGRXaWRnZXRzKHNob3c6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJzaG93Rm9sZFdpZGdldHNcIiwgc2hvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGZvbGQgd2lkZ2V0cyBhcmUgc2hvd24uXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRTaG93Rm9sZFdpZGdldHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcInNob3dGb2xkV2lkZ2V0c1wiKTtcbiAgICB9XG5cbiAgICBzZXRGYWRlRm9sZFdpZGdldHMoZmFkZTogYm9vbGVhbikge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiLCBmYWRlKTtcbiAgICB9XG5cbiAgICBnZXRGYWRlRm9sZFdpZGdldHMoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE9wdGlvbihcImZhZGVGb2xkV2lkZ2V0c1wiKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHdvcmRzIG9mIHRleHQgZnJvbSB0aGUgZWRpdG9yLiBBIFwid29yZFwiIGlzIGRlZmluZWQgYXMgYSBzdHJpbmcgb2YgY2hhcmFjdGVycyBib29rZW5kZWQgYnkgd2hpdGVzcGFjZS5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gZGlyZWN0aW9uIFRoZSBkaXJlY3Rpb24gb2YgdGhlIGRlbGV0aW9uIHRvIG9jY3VyLCBlaXRoZXIgXCJsZWZ0XCIgb3IgXCJyaWdodFwiXG4gICAgICpcbiAgICAgKiovXG4gICAgcmVtb3ZlKGRpcmVjdGlvbjogc3RyaW5nKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIGlmIChkaXJlY3Rpb24gPT0gXCJsZWZ0XCIpXG4gICAgICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0TGVmdCgpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFJpZ2h0KCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmICh0aGlzLmdldEJlaGF2aW91cnNFbmFibGVkKCkpIHtcbiAgICAgICAgICAgIHZhciBzZXNzaW9uID0gdGhpcy5zZXNzaW9uO1xuICAgICAgICAgICAgdmFyIHN0YXRlID0gc2Vzc2lvbi5nZXRTdGF0ZShyYW5nZS5zdGFydC5yb3cpO1xuICAgICAgICAgICAgdmFyIG5ld19yYW5nZSA9IHNlc3Npb24uZ2V0TW9kZSgpLnRyYW5zZm9ybUFjdGlvbihzdGF0ZSwgJ2RlbGV0aW9uJywgdGhpcywgc2Vzc2lvbiwgcmFuZ2UpO1xuXG4gICAgICAgICAgICBpZiAocmFuZ2UuZW5kLmNvbHVtbiA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHZhciB0ZXh0ID0gc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGlmICh0ZXh0W3RleHQubGVuZ3RoIC0gMV0gPT0gXCJcXG5cIikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShyYW5nZS5lbmQucm93KTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKC9eXFxzKyQvLnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChuZXdfcmFuZ2UpXG4gICAgICAgICAgICAgICAgcmFuZ2UgPSBuZXdfcmFuZ2U7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIHdvcmQgZGlyZWN0bHkgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgcmVtb3ZlV29yZFJpZ2h0KCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZFJpZ2h0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgd29yZCBkaXJlY3RseSB0byB0aGUgbGVmdCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIHJlbW92ZVdvcmRMZWZ0KCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZExlZnQoKTtcblxuICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCB0aGUgd29yZHMgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLCB1bnRpbCB0aGUgc3RhcnQgb2YgdGhlIGxpbmUuXG4gICAgICoqL1xuICAgIHJlbW92ZVRvTGluZVN0YXJ0KCkge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0TGluZVN0YXJ0KCk7XG5cbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlbW92ZSh0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgdGhlIHdvcmRzIHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24sIHVudGlsIHRoZSBlbmQgb2YgdGhlIGxpbmUuXG4gICAgICoqL1xuICAgIHJlbW92ZVRvTGluZUVuZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSlcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdExpbmVFbmQoKTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5jb2x1bW4gPT09IHJhbmdlLmVuZC5jb2x1bW4gJiYgcmFuZ2Uuc3RhcnQucm93ID09PSByYW5nZS5lbmQucm93KSB7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gMDtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3crKztcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3BsaXRzIHRoZSBsaW5lIGF0IHRoZSBjdXJyZW50IHNlbGVjdGlvbiAoYnkgaW5zZXJ0aW5nIGFuIGAnXFxuJ2ApLlxuICAgICAqKi9cbiAgICBzcGxpdExpbmUoKSB7XG4gICAgICAgIGlmICghdGhpcy5zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVtb3ZlKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSk7XG4gICAgICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpO1xuICAgICAgICB0aGlzLmluc2VydChcIlxcblwiKTtcbiAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihjdXJzb3IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRyYW5zcG9zZXMgY3VycmVudCBsaW5lLlxuICAgICAqKi9cbiAgICB0cmFuc3Bvc2VMZXR0ZXJzKCkge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IGN1cnNvci5jb2x1bW47XG4gICAgICAgIGlmIChjb2x1bW4gPT09IDApXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLnNlc3Npb24uZ2V0TGluZShjdXJzb3Iucm93KTtcbiAgICAgICAgdmFyIHN3YXAsIHJhbmdlO1xuICAgICAgICBpZiAoY29sdW1uIDwgbGluZS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHN3YXAgPSBsaW5lLmNoYXJBdChjb2x1bW4pICsgbGluZS5jaGFyQXQoY29sdW1uIC0gMSk7XG4gICAgICAgICAgICByYW5nZSA9IG5ldyBybmcuUmFuZ2UoY3Vyc29yLnJvdywgY29sdW1uIC0gMSwgY3Vyc29yLnJvdywgY29sdW1uICsgMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzd2FwID0gbGluZS5jaGFyQXQoY29sdW1uIC0gMSkgKyBsaW5lLmNoYXJBdChjb2x1bW4gLSAyKTtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IHJuZy5SYW5nZShjdXJzb3Iucm93LCBjb2x1bW4gLSAyLCBjdXJzb3Iucm93LCBjb2x1bW4pO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZXBsYWNlKHJhbmdlLCBzd2FwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0cyB0aGUgY3VycmVudCBzZWxlY3Rpb24gZW50aXJlbHkgaW50byBsb3dlcmNhc2UuXG4gICAgICoqL1xuICAgIHRvTG93ZXJDYXNlKCkge1xuICAgICAgICB2YXIgb3JpZ2luYWxSYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgaWYgKHRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0V29yZCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgdGV4dC50b0xvd2VyQ2FzZSgpKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2Uob3JpZ2luYWxSYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udmVydHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGVudGlyZWx5IGludG8gdXBwZXJjYXNlLlxuICAgICAqKi9cbiAgICB0b1VwcGVyQ2FzZSgpIHtcbiAgICAgICAgdmFyIG9yaWdpbmFsUmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFdvcmQoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgdmFyIHRleHQgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnJlcGxhY2UocmFuZ2UsIHRleHQudG9VcHBlckNhc2UoKSk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKG9yaWdpbmFsUmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluc2VydHMgYW4gaW5kZW50YXRpb24gaW50byB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24gb3IgaW5kZW50cyB0aGUgc2VsZWN0ZWQgbGluZXMuXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzXG4gICAgICoqL1xuICAgIGluZGVudCgpIHtcbiAgICAgICAgdmFyIHNlc3Npb24gPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcblxuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93IDwgcmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgICAgIHNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKHJhbmdlLnN0YXJ0LmNvbHVtbiA8IHJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciB0ZXh0ID0gc2Vzc2lvbi5nZXRUZXh0UmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKCEvXlxccyskLy50ZXN0KHRleHQpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJvd3MgPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgICAgICAgICBzZXNzaW9uLmluZGVudFJvd3Mocm93cy5maXJzdCwgcm93cy5sYXN0LCBcIlxcdFwiKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShyYW5nZS5zdGFydC5yb3cpO1xuICAgICAgICB2YXIgcG9zaXRpb24gPSByYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIHNpemUgPSBzZXNzaW9uLmdldFRhYlNpemUoKTtcbiAgICAgICAgdmFyIGNvbHVtbiA9IHNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtbihwb3NpdGlvbi5yb3csIHBvc2l0aW9uLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKHRoaXMuc2Vzc2lvbi5nZXRVc2VTb2Z0VGFicygpKSB7XG4gICAgICAgICAgICB2YXIgY291bnQgPSAoc2l6ZSAtIGNvbHVtbiAlIHNpemUpO1xuICAgICAgICAgICAgdmFyIGluZGVudFN0cmluZyA9IGxhbmcuc3RyaW5nUmVwZWF0KFwiIFwiLCBjb3VudCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgY291bnQgPSBjb2x1bW4gJSBzaXplO1xuICAgICAgICAgICAgd2hpbGUgKGxpbmVbcmFuZ2Uuc3RhcnQuY29sdW1uXSA9PSBcIiBcIiAmJiBjb3VudCkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbi0tO1xuICAgICAgICAgICAgICAgIGNvdW50LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpbmRlbnRTdHJpbmcgPSBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLmluc2VydChpbmRlbnRTdHJpbmcpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGVudHMgdGhlIGN1cnJlbnQgbGluZS5cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzXG4gICAgICoqL1xuICAgIGJsb2NrSW5kZW50KCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB0aGlzLnNlc3Npb24uaW5kZW50Um93cyhyb3dzLmZpcnN0LCByb3dzLmxhc3QsIFwiXFx0XCIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE91dGRlbnRzIHRoZSBjdXJyZW50IGxpbmUuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ub3V0ZGVudFJvd3NcbiAgICAgKiovXG4gICAgYmxvY2tPdXRkZW50KCkge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZXNzaW9uLmdldFNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlc3Npb24ub3V0ZGVudFJvd3Moc2VsZWN0aW9uLmdldFJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8vIFRPRE86IG1vdmUgb3V0IG9mIGNvcmUgd2hlbiB3ZSBoYXZlIGdvb2QgbWVjaGFuaXNtIGZvciBtYW5hZ2luZyBleHRlbnNpb25zXG4gICAgc29ydExpbmVzKCkge1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB2YXIgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgbGluZXMgPSBbXTtcbiAgICAgICAgZm9yIChpID0gcm93cy5maXJzdDsgaSA8PSByb3dzLmxhc3Q7IGkrKylcbiAgICAgICAgICAgIGxpbmVzLnB1c2goc2Vzc2lvbi5nZXRMaW5lKGkpKTtcblxuICAgICAgICBsaW5lcy5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIGlmIChhLnRvTG93ZXJDYXNlKCkgPCBiLnRvTG93ZXJDYXNlKCkpIHJldHVybiAtMTtcbiAgICAgICAgICAgIGlmIChhLnRvTG93ZXJDYXNlKCkgPiBiLnRvTG93ZXJDYXNlKCkpIHJldHVybiAxO1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBkZWxldGVSYW5nZSA9IG5ldyBybmcuUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgIGZvciAodmFyIGkgPSByb3dzLmZpcnN0OyBpIDw9IHJvd3MubGFzdDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHNlc3Npb24uZ2V0TGluZShpKTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LnJvdyA9IGk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQucm93ID0gaTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBsaW5lLmxlbmd0aDtcbiAgICAgICAgICAgIHNlc3Npb24ucmVwbGFjZShkZWxldGVSYW5nZSwgbGluZXNbaSAtIHJvd3MuZmlyc3RdKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdpdmVuIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgcmFuZ2UsIHRoaXMgZnVuY3Rpb24gZWl0aGVyIGNvbW1lbnRzIGFsbCB0aGUgbGluZXMsIG9yIHVuY29tbWVudHMgYWxsIG9mIHRoZW0uXG4gICAgICoqL1xuICAgIHRvZ2dsZUNvbW1lbnRMaW5lcygpIHtcbiAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5zZXNzaW9uLmdldFN0YXRlKHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKS5yb3cpO1xuICAgICAgICB2YXIgcm93cyA9IHRoaXMuJGdldFNlbGVjdGVkUm93cygpO1xuICAgICAgICB0aGlzLnNlc3Npb24uZ2V0TW9kZSgpLnRvZ2dsZUNvbW1lbnRMaW5lcyhzdGF0ZSwgdGhpcy5zZXNzaW9uLCByb3dzLmZpcnN0LCByb3dzLmxhc3QpO1xuICAgIH1cblxuICAgIHRvZ2dsZUJsb2NrQ29tbWVudCgpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5zZXNzaW9uLmdldFN0YXRlKGN1cnNvci5yb3cpO1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5nZXRNb2RlKCkudG9nZ2xlQmxvY2tDb21tZW50KHN0YXRlLCB0aGlzLnNlc3Npb24sIHJhbmdlLCBjdXJzb3IpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFdvcmtzIGxpa2UgW1tFZGl0U2Vzc2lvbi5nZXRUb2tlbkF0XV0sIGV4Y2VwdCBpdCByZXR1cm5zIGEgbnVtYmVyLlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIGdldE51bWJlckF0KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuICAgICAgICB2YXIgX251bWJlclJ4ID0gL1tcXC1dP1swLTldKyg/OlxcLlswLTldKyk/L2c7XG4gICAgICAgIF9udW1iZXJSeC5sYXN0SW5kZXggPSAwO1xuXG4gICAgICAgIHZhciBzID0gdGhpcy5zZXNzaW9uLmdldExpbmUocm93KTtcbiAgICAgICAgd2hpbGUgKF9udW1iZXJSeC5sYXN0SW5kZXggPCBjb2x1bW4pIHtcbiAgICAgICAgICAgIHZhciBtID0gX251bWJlclJ4LmV4ZWMocyk7XG4gICAgICAgICAgICBpZiAobS5pbmRleCA8PSBjb2x1bW4gJiYgbS5pbmRleCArIG1bMF0ubGVuZ3RoID49IGNvbHVtbikge1xuICAgICAgICAgICAgICAgIHZhciBudW1iZXIgPSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlOiBtWzBdLFxuICAgICAgICAgICAgICAgICAgICBzdGFydDogbS5pbmRleCxcbiAgICAgICAgICAgICAgICAgICAgZW5kOiBtLmluZGV4ICsgbVswXS5sZW5ndGhcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIHJldHVybiBudW1iZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgdGhlIGNoYXJhY3RlciBiZWZvcmUgdGhlIGN1cnNvciBpcyBhIG51bWJlciwgdGhpcyBmdW5jdGlvbnMgY2hhbmdlcyBpdHMgdmFsdWUgYnkgYGFtb3VudGAuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGFtb3VudCBUaGUgdmFsdWUgdG8gY2hhbmdlIHRoZSBudW1lcmFsIGJ5IChjYW4gYmUgbmVnYXRpdmUgdG8gZGVjcmVhc2UgdmFsdWUpXG4gICAgICovXG4gICAgbW9kaWZ5TnVtYmVyKGFtb3VudCkge1xuICAgICAgICB2YXIgcm93ID0gdGhpcy5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCkucm93O1xuICAgICAgICB2YXIgY29sdW1uID0gdGhpcy5zZWxlY3Rpb24uZ2V0Q3Vyc29yKCkuY29sdW1uO1xuXG4gICAgICAgIC8vIGdldCB0aGUgY2hhciBiZWZvcmUgdGhlIGN1cnNvclxuICAgICAgICB2YXIgY2hhclJhbmdlID0gbmV3IHJuZy5SYW5nZShyb3csIGNvbHVtbiAtIDEsIHJvdywgY29sdW1uKTtcblxuICAgICAgICB2YXIgYyA9IHBhcnNlRmxvYXQodGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShjaGFyUmFuZ2UpKTtcbiAgICAgICAgLy8gaWYgdGhlIGNoYXIgaXMgYSBkaWdpdFxuICAgICAgICBpZiAoIWlzTmFOKGMpICYmIGlzRmluaXRlKGMpKSB7XG4gICAgICAgICAgICAvLyBnZXQgdGhlIHdob2xlIG51bWJlciB0aGUgZGlnaXQgaXMgcGFydCBvZlxuICAgICAgICAgICAgdmFyIG5yID0gdGhpcy5nZXROdW1iZXJBdChyb3csIGNvbHVtbik7XG4gICAgICAgICAgICAvLyBpZiBudW1iZXIgZm91bmRcbiAgICAgICAgICAgIGlmIChucikge1xuICAgICAgICAgICAgICAgIHZhciBmcCA9IG5yLnZhbHVlLmluZGV4T2YoXCIuXCIpID49IDAgPyBuci5zdGFydCArIG5yLnZhbHVlLmluZGV4T2YoXCIuXCIpICsgMSA6IG5yLmVuZDtcbiAgICAgICAgICAgICAgICB2YXIgZGVjaW1hbHMgPSBuci5zdGFydCArIG5yLnZhbHVlLmxlbmd0aCAtIGZwO1xuXG4gICAgICAgICAgICAgICAgdmFyIHQgPSBwYXJzZUZsb2F0KG5yLnZhbHVlKTtcbiAgICAgICAgICAgICAgICB0ICo9IE1hdGgucG93KDEwLCBkZWNpbWFscyk7XG5cblxuICAgICAgICAgICAgICAgIGlmIChmcCAhPT0gbnIuZW5kICYmIGNvbHVtbiA8IGZwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFtb3VudCAqPSBNYXRoLnBvdygxMCwgbnIuZW5kIC0gY29sdW1uIC0gMSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgYW1vdW50ICo9IE1hdGgucG93KDEwLCBuci5lbmQgLSBjb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHQgKz0gYW1vdW50O1xuICAgICAgICAgICAgICAgIHQgLz0gTWF0aC5wb3coMTAsIGRlY2ltYWxzKTtcbiAgICAgICAgICAgICAgICB2YXIgbm5yID0gdC50b0ZpeGVkKGRlY2ltYWxzKTtcblxuICAgICAgICAgICAgICAgIC8vdXBkYXRlIG51bWJlclxuICAgICAgICAgICAgICAgIHZhciByZXBsYWNlUmFuZ2UgPSBuZXcgcm5nLlJhbmdlKHJvdywgbnIuc3RhcnQsIHJvdywgbnIuZW5kKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNlc3Npb24ucmVwbGFjZShyZXBsYWNlUmFuZ2UsIG5ucik7XG5cbiAgICAgICAgICAgICAgICAvL3JlcG9zaXRpb24gdGhlIGN1cnNvclxuICAgICAgICAgICAgICAgIHRoaXMubW92ZUN1cnNvclRvKHJvdywgTWF0aC5tYXgobnIuc3RhcnQgKyAxLCBjb2x1bW4gKyBubnIubGVuZ3RoIC0gbnIudmFsdWUubGVuZ3RoKSk7XG5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgY3VycmVudCBzZWxlY3Rpb25cbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5yZW1vdmVcbiAgICAgKiovXG4gICAgcmVtb3ZlTGluZXMoKSB7XG4gICAgICAgIHZhciByb3dzID0gdGhpcy4kZ2V0U2VsZWN0ZWRSb3dzKCk7XG4gICAgICAgIHZhciByYW5nZTtcbiAgICAgICAgaWYgKHJvd3MuZmlyc3QgPT09IDAgfHwgcm93cy5sYXN0ICsgMSA8IHRoaXMuc2Vzc2lvbi5nZXRMZW5ndGgoKSlcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IHJuZy5SYW5nZShyb3dzLmZpcnN0LCAwLCByb3dzLmxhc3QgKyAxLCAwKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgcm5nLlJhbmdlKFxuICAgICAgICAgICAgICAgIHJvd3MuZmlyc3QgLSAxLCB0aGlzLnNlc3Npb24uZ2V0TGluZShyb3dzLmZpcnN0IC0gMSkubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHJvd3MubGFzdCwgdGhpcy5zZXNzaW9uLmdldExpbmUocm93cy5sYXN0KS5sZW5ndGhcbiAgICAgICAgICAgICk7XG4gICAgICAgIHRoaXMuc2Vzc2lvbi5yZW1vdmUocmFuZ2UpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgZHVwbGljYXRlU2VsZWN0aW9uKCkge1xuICAgICAgICB2YXIgc2VsID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciBkb2MgPSB0aGlzLnNlc3Npb247XG4gICAgICAgIHZhciByYW5nZSA9IHNlbC5nZXRSYW5nZSgpO1xuICAgICAgICB2YXIgcmV2ZXJzZSA9IHNlbC5pc0JhY2t3YXJkcygpO1xuICAgICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgZG9jLmR1cGxpY2F0ZUxpbmVzKHJvdywgcm93KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwb2ludCA9IHJldmVyc2UgPyByYW5nZS5zdGFydCA6IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIHZhciBlbmRQb2ludCA9IGRvYy5pbnNlcnQocG9pbnQsIGRvYy5nZXRUZXh0UmFuZ2UocmFuZ2UpKTtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gcG9pbnQ7XG4gICAgICAgICAgICByYW5nZS5lbmQgPSBlbmRQb2ludDtcblxuICAgICAgICAgICAgc2VsLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlLCByZXZlcnNlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyBhbGwgdGhlIHNlbGVjdGVkIGxpbmVzIGRvd24gb25lIHJvdy5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZUxpbmVzVXBcbiAgICAgKiovXG4gICAgbW92ZUxpbmVzRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLm1vdmVMaW5lc0Rvd24oZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyB1cCBvbmUgcm93LlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9IE9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZUxpbmVzRG93blxuICAgICAqKi9cbiAgICBtb3ZlTGluZXNVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLm1vdmVMaW5lc1VwKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICAgKiBgYGBqc29uXG4gICAgICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICAgKiBgYGBcbiAgICAgKiBAcGFyYW0ge1JhbmdlfSBmcm9tUmFuZ2UgVGhlIHJhbmdlIG9mIHRleHQgeW91IHdhbnQgbW92ZWQgd2l0aGluIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSB0b1Bvc2l0aW9uIFRoZSBsb2NhdGlvbiAocm93IGFuZCBjb2x1bW4pIHdoZXJlIHlvdSB3YW50IHRvIG1vdmUgdGhlIHRleHQgdG9cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtSYW5nZX0gVGhlIG5ldyByYW5nZSB3aGVyZSB0aGUgdGV4dCB3YXMgbW92ZWQgdG8uXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24ubW92ZVRleHRcbiAgICAgKiovXG4gICAgbW92ZVRleHQocmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2Vzc2lvbi5tb3ZlVGV4dChyYW5nZSwgdG9Qb3NpdGlvbiwgY29weSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29waWVzIGFsbCB0aGUgc2VsZWN0ZWQgbGluZXMgdXAgb25lIHJvdy5cbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfSBPbiBzdWNjZXNzLCByZXR1cm5zIDAuXG4gICAgICpcbiAgICAgKiovXG4gICAgY29weUxpbmVzVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVMaW5lcyhmdW5jdGlvbihmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICAgICAgdGhpcy5zZXNzaW9uLmR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb3BpZXMgYWxsIHRoZSBzZWxlY3RlZCBsaW5lcyBkb3duIG9uZSByb3cuXG4gICAgICogQHJldHVybnMge051bWJlcn0gT24gc3VjY2VzcywgcmV0dXJucyB0aGUgbnVtYmVyIG9mIG5ldyByb3dzIGFkZGVkOyBpbiBvdGhlciB3b3JkcywgYGxhc3RSb3cgLSBmaXJzdFJvdyArIDFgLlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmR1cGxpY2F0ZUxpbmVzXG4gICAgICpcbiAgICAgKiovXG4gICAgY29weUxpbmVzRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUxpbmVzKGZ1bmN0aW9uKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXhlY3V0ZXMgYSBzcGVjaWZpYyBmdW5jdGlvbiwgd2hpY2ggY2FuIGJlIGFueXRoaW5nIHRoYXQgbWFuaXB1bGF0ZXMgc2VsZWN0ZWQgbGluZXMsIHN1Y2ggYXMgY29weWluZyB0aGVtLCBkdXBsaWNhdGluZyB0aGVtLCBvciBzaGlmdGluZyB0aGVtLlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG1vdmVyIEEgbWV0aG9kIHRvIGNhbGwgb24gZWFjaCBzZWxlY3RlZCByb3dcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgICRtb3ZlTGluZXMobW92ZXIpIHtcbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0aW9uO1xuICAgICAgICBpZiAoIXNlbGVjdGlvblsnaW5NdWx0aVNlbGVjdE1vZGUnXSB8fCB0aGlzLmluVmlydHVhbFNlbGVjdGlvbk1vZGUpIHtcbiAgICAgICAgICAgIHZhciByYW5nZSA9IHNlbGVjdGlvbi50b09yaWVudGVkUmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciBzZWxlY3RlZFJvd3M6IHsgZmlyc3Q6IG51bWJlcjsgbGFzdDogbnVtYmVyIH0gPSB0aGlzLiRnZXRTZWxlY3RlZFJvd3MoKTtcbiAgICAgICAgICAgIHZhciBsaW5lc01vdmVkID0gbW92ZXIuY2FsbCh0aGlzLCBzZWxlY3RlZFJvd3MuZmlyc3QsIHNlbGVjdGVkUm93cy5sYXN0KTtcbiAgICAgICAgICAgIHJhbmdlLm1vdmVCeShsaW5lc01vdmVkLCAwKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5mcm9tT3JpZW50ZWRSYW5nZShyYW5nZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcmFuZ2VzID0gc2VsZWN0aW9uLnJhbmdlTGlzdC5yYW5nZXM7XG4gICAgICAgICAgICBzZWxlY3Rpb24ucmFuZ2VMaXN0LmRldGFjaCgpO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gcmFuZ2VzLmxlbmd0aDsgaS0tOykge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZUluZGV4ID0gaTtcbiAgICAgICAgICAgICAgICB2YXIgY29sbGFwc2VkUm93cyA9IHJhbmdlc1tpXS5jb2xsYXBzZVJvd3MoKTtcbiAgICAgICAgICAgICAgICB2YXIgbGFzdCA9IGNvbGxhcHNlZFJvd3MuZW5kLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgZmlyc3QgPSBjb2xsYXBzZWRSb3dzLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICB3aGlsZSAoaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbGxhcHNlZFJvd3MgPSByYW5nZXNbaV0uY29sbGFwc2VSb3dzKCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmaXJzdCAtIGNvbGxhcHNlZFJvd3MuZW5kLnJvdyA8PSAxKVxuICAgICAgICAgICAgICAgICAgICAgICAgZmlyc3QgPSBjb2xsYXBzZWRSb3dzLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpKys7XG5cbiAgICAgICAgICAgICAgICB2YXIgbGluZXNNb3ZlZCA9IG1vdmVyLmNhbGwodGhpcywgZmlyc3QsIGxhc3QpO1xuICAgICAgICAgICAgICAgIHdoaWxlIChyYW5nZUluZGV4ID49IGkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2VzW3JhbmdlSW5kZXhdLm1vdmVCeShsaW5lc01vdmVkLCAwKTtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2VJbmRleC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHNlbGVjdGlvbi5mcm9tT3JpZW50ZWRSYW5nZShzZWxlY3Rpb24ucmFuZ2VzWzBdKTtcbiAgICAgICAgICAgIHNlbGVjdGlvbi5yYW5nZUxpc3QuYXR0YWNoKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgcm93cy5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9XG4gICAgICoqL1xuICAgICRnZXRTZWxlY3RlZFJvd3MoKTogeyBmaXJzdDogbnVtYmVyOyBsYXN0OiBudW1iZXIgfSB7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKS5jb2xsYXBzZVJvd3MoKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgZmlyc3Q6IHRoaXMuc2Vzc2lvbi5nZXRSb3dGb2xkU3RhcnQocmFuZ2Uuc3RhcnQucm93KSxcbiAgICAgICAgICAgIGxhc3Q6IHRoaXMuc2Vzc2lvbi5nZXRSb3dGb2xkRW5kKHJhbmdlLmVuZC5yb3cpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvblN0YXJ0KHRleHQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zaG93Q29tcG9zaXRpb24odGhpcy5nZXRDdXJzb3JQb3NpdGlvbigpKTtcbiAgICB9XG5cbiAgICBvbkNvbXBvc2l0aW9uVXBkYXRlKHRleHQ/OiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRDb21wb3NpdGlvblRleHQodGV4dCk7XG4gICAgfVxuXG4gICAgb25Db21wb3NpdGlvbkVuZCgpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5oaWRlQ29tcG9zaXRpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3d9XG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqIEByZWxhdGVkIFZpcnR1YWxSZW5kZXJlci5nZXRGaXJzdFZpc2libGVSb3dcbiAgICAgKiovXG4gICAgZ2V0Rmlyc3RWaXNpYmxlUm93KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnJlbmRlcmVyLmdldEZpcnN0VmlzaWJsZVJvdygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6VmlydHVhbFJlbmRlcmVyLmdldExhc3RWaXNpYmxlUm93fVxuICAgICAqXG4gICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAgKiBAcmVsYXRlZCBWaXJ0dWFsUmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3dcbiAgICAgKiovXG4gICAgZ2V0TGFzdFZpc2libGVSb3coKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0TGFzdFZpc2libGVSb3coKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbmRpY2F0ZXMgaWYgdGhlIHJvdyBpcyBjdXJyZW50bHkgdmlzaWJsZSBvbiB0aGUgc2NyZWVuLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBjaGVja1xuICAgICAqXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICoqL1xuICAgIGlzUm93VmlzaWJsZShyb3c6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gKHJvdyA+PSB0aGlzLmdldEZpcnN0VmlzaWJsZVJvdygpICYmIHJvdyA8PSB0aGlzLmdldExhc3RWaXNpYmxlUm93KCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGljYXRlcyBpZiB0aGUgZW50aXJlIHJvdyBpcyBjdXJyZW50bHkgdmlzaWJsZSBvbiB0aGUgc2NyZWVuLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBjaGVja1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKiovXG4gICAgaXNSb3dGdWxseVZpc2libGUocm93OiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIChyb3cgPj0gdGhpcy5yZW5kZXJlci5nZXRGaXJzdEZ1bGx5VmlzaWJsZVJvdygpICYmIHJvdyA8PSB0aGlzLnJlbmRlcmVyLmdldExhc3RGdWxseVZpc2libGVSb3coKSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGN1cnJlbnRseSB2aXNpYmlsZSByb3dzLlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgICRnZXRWaXNpYmxlUm93Q291bnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucmVuZGVyZXIuZ2V0U2Nyb2xsQm90dG9tUm93KCkgLSB0aGlzLnJlbmRlcmVyLmdldFNjcm9sbFRvcFJvdygpICsgMTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGSVhNRTogVGhlIHNlbWFudGljcyBvZiBzZWxlY3QgYXJlIG5vdCBlYXNpbHkgdW5kZXJzdG9vZC4gXG4gICAgICogQHBhcmFtIGRpcmVjdGlvbiArMSBmb3IgcGFnZSBkb3duLCAtMSBmb3IgcGFnZSB1cC4gTWF5YmUgTiBmb3IgTiBwYWdlcz9cbiAgICAgKiBAcGFyYW0gc2VsZWN0IHRydWUgfCBmYWxzZSB8IHVuZGVmaW5lZFxuICAgICAqL1xuICAgICRtb3ZlQnlQYWdlKGRpcmVjdGlvbjogbnVtYmVyLCBzZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIHZhciByZW5kZXJlciA9IHRoaXMucmVuZGVyZXI7XG4gICAgICAgIHZhciBjb25maWcgPSB0aGlzLnJlbmRlcmVyLmxheWVyQ29uZmlnO1xuICAgICAgICB2YXIgcm93cyA9IGRpcmVjdGlvbiAqIE1hdGguZmxvb3IoY29uZmlnLmhlaWdodCAvIGNvbmZpZy5saW5lSGVpZ2h0KTtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZysrO1xuICAgICAgICBpZiAoc2VsZWN0ID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi4kbW92ZVNlbGVjdGlvbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1vdmVDdXJzb3JCeShyb3dzLCAwKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHNlbGVjdCA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JCeShyb3dzLCAwKTtcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmctLTtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gcmVuZGVyZXIuc2Nyb2xsVG9wO1xuXG4gICAgICAgIHJlbmRlcmVyLnNjcm9sbEJ5KDAsIHJvd3MgKiBjb25maWcubGluZUhlaWdodCk7XG4gICAgICAgIC8vIFdoeSBkb24ndCB3ZSBhc3NlcnQgb3VyIGFyZ3MgYW5kIGRvIHR5cGVvZiBzZWxlY3QgPT09ICd1bmRlZmluZWQnP1xuICAgICAgICBpZiAoc2VsZWN0ICE9IG51bGwpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgY2FsbGVkIHdoZW4gc2VsZWN0IGlzIHVuZGVmaW5lZC5cbiAgICAgICAgICAgIHJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KG51bGwsIDAuNSk7XG4gICAgICAgIH1cblxuICAgICAgICByZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nKHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2VsZWN0cyB0aGUgdGV4dCBmcm9tIHRoZSBjdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCB1bnRpbCB3aGVyZSBhIFwicGFnZSBkb3duXCIgZmluaXNoZXMuXG4gICAgICoqL1xuICAgIHNlbGVjdFBhZ2VEb3duKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKCsxLCB0cnVlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZWxlY3RzIHRoZSB0ZXh0IGZyb20gdGhlIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGRvY3VtZW50IHVudGlsIHdoZXJlIGEgXCJwYWdlIHVwXCIgZmluaXNoZXMuXG4gICAgICoqL1xuICAgIHNlbGVjdFBhZ2VVcCgpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgtMSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2hpZnRzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgZG93blwiIGlzLCBhcyB3ZWxsIGFzIG1vdmluZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBnb3RvUGFnZURvd24oKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoKzEsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgdGhlIGRvY3VtZW50IHRvIHdoZXJldmVyIFwicGFnZSB1cFwiIGlzLCBhcyB3ZWxsIGFzIG1vdmluZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBnb3RvUGFnZVVwKCkge1xuICAgICAgICB0aGlzLiRtb3ZlQnlQYWdlKC0xLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2Nyb2xscyB0aGUgZG9jdW1lbnQgdG8gd2hlcmV2ZXIgXCJwYWdlIGRvd25cIiBpcywgd2l0aG91dCBjaGFuZ2luZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBzY3JvbGxQYWdlRG93bigpIHtcbiAgICAgICAgdGhpcy4kbW92ZUJ5UGFnZSgxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTY3JvbGxzIHRoZSBkb2N1bWVudCB0byB3aGVyZXZlciBcInBhZ2UgdXBcIiBpcywgd2l0aG91dCBjaGFuZ2luZyB0aGUgY3Vyc29yIHBvc2l0aW9uLlxuICAgICAqKi9cbiAgICBzY3JvbGxQYWdlVXAoKSB7XG4gICAgICAgIHRoaXMuJG1vdmVCeVBhZ2UoLTEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBlZGl0b3IgdG8gdGhlIHNwZWNpZmllZCByb3cuXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvUm93XG4gICAgICovXG4gICAgc2Nyb2xsVG9Sb3cocm93OiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxUb1Jvdyhyb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNjcm9sbHMgdG8gYSBsaW5lLiBJZiBgY2VudGVyYCBpcyBgdHJ1ZWAsIGl0IHB1dHMgdGhlIGxpbmUgaW4gbWlkZGxlIG9mIHNjcmVlbiAob3IgYXR0ZW1wdHMgdG8pLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lIFRoZSBsaW5lIHRvIHNjcm9sbCB0b1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gY2VudGVyIElmIGB0cnVlYFxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZXMgc2Nyb2xsaW5nXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIHdoZW4gdGhlIGFuaW1hdGlvbiBoYXMgZmluaXNoZWRcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgVmlydHVhbFJlbmRlcmVyLnNjcm9sbFRvTGluZVxuICAgICAqKi9cbiAgICBzY3JvbGxUb0xpbmUobGluZTogbnVtYmVyLCBjZW50ZXI6IGJvb2xlYW4sIGFuaW1hdGU6IGJvb2xlYW4sIGNhbGxiYWNrPykge1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbFRvTGluZShsaW5lLCBjZW50ZXIsIGFuaW1hdGUsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBdHRlbXB0cyB0byBjZW50ZXIgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIG9uIHRoZSBzY3JlZW4uXG4gICAgICoqL1xuICAgIGNlbnRlclNlbGVjdGlvbigpIHtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICB2YXIgcG9zID0ge1xuICAgICAgICAgICAgcm93OiBNYXRoLmZsb29yKHJhbmdlLnN0YXJ0LnJvdyArIChyYW5nZS5lbmQucm93IC0gcmFuZ2Uuc3RhcnQucm93KSAvIDIpLFxuICAgICAgICAgICAgY29sdW1uOiBNYXRoLmZsb29yKHJhbmdlLnN0YXJ0LmNvbHVtbiArIChyYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uKSAvIDIpXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMucmVuZGVyZXIuYWxpZ25DdXJzb3IocG9zLCAwLjUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldHMgdGhlIGN1cnJlbnQgcG9zaXRpb24gb2YgdGhlIGN1cnNvci5cbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBBbiBvYmplY3QgdGhhdCBsb29rcyBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICAgICAqXG4gICAgICogYGBganNvblxuICAgICAqIHsgcm93OiBjdXJyUm93LCBjb2x1bW46IGN1cnJDb2wgfVxuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLmdldEN1cnNvclxuICAgICAqKi9cbiAgICBnZXRDdXJzb3JQb3NpdGlvbigpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHNjcmVlbiBwb3NpdGlvbiBvZiB0aGUgY3Vyc29yLlxuICAgICAqKi9cbiAgICBnZXRDdXJzb3JQb3NpdGlvblNjcmVlbigpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKVxuICAgICAgICByZXR1cm4gdGhpcy5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlNlbGVjdGlvbi5nZXRSYW5nZX1cbiAgICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLmdldFJhbmdlXG4gICAgICoqL1xuICAgIGdldFNlbGVjdGlvblJhbmdlKCk6IHJuZy5SYW5nZSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNlbGVjdHMgYWxsIHRoZSB0ZXh0IGluIGVkaXRvci5cbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24uc2VsZWN0QWxsXG4gICAgICoqL1xuICAgIHNlbGVjdEFsbCgpIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2VsZWN0QWxsKCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpTZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb259XG4gICAgICogQHJlbGF0ZWQgU2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uXG4gICAgICoqL1xuICAgIGNsZWFyU2VsZWN0aW9uKCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHNwZWNpZmllZCByb3cgYW5kIGNvbHVtbi4gTm90ZSB0aGF0IHRoaXMgZG9lcyBub3QgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSBuZXcgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIG5ldyBjb2x1bW4gbnVtYmVyXG4gICAgICogQHBhcmFtIHtib29sZWFufSBhbmltYXRlXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBTZWxlY3Rpb24ubW92ZUN1cnNvclRvXG4gICAgICoqL1xuICAgIG1vdmVDdXJzb3JUbyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGFuaW1hdGU/OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JUbyhyb3csIGNvbHVtbiwgYW5pbWF0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgcG9zaXRpb24gaW5kaWNhdGVkIGJ5IGBwb3Mucm93YCBhbmQgYHBvcy5jb2x1bW5gLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwb3MgQW4gb2JqZWN0IHdpdGggdHdvIHByb3BlcnRpZXMsIHJvdyBhbmQgY29sdW1uXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIFNlbGVjdGlvbi5tb3ZlQ3Vyc29yVG9Qb3NpdGlvblxuICAgICAqKi9cbiAgICBtb3ZlQ3Vyc29yVG9Qb3NpdGlvbihwb3MpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvclRvUG9zaXRpb24ocG9zKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yJ3Mgcm93IGFuZCBjb2x1bW4gdG8gdGhlIG5leHQgbWF0Y2hpbmcgYnJhY2tldCBvciBIVE1MIHRhZy5cbiAgICAgKlxuICAgICAqKi9cbiAgICBqdW1wVG9NYXRjaGluZyhzZWxlY3QpIHtcbiAgICAgICAgdmFyIGN1cnNvciA9IHRoaXMuZ2V0Q3Vyc29yUG9zaXRpb24oKTtcbiAgICAgICAgdmFyIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcy5zZXNzaW9uLCBjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcbiAgICAgICAgdmFyIHByZXZUb2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICB2YXIgdG9rZW4gPSBwcmV2VG9rZW47XG5cbiAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcblxuICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIC8vZ2V0IG5leHQgY2xvc2luZyB0YWcgb3IgYnJhY2tldFxuICAgICAgICB2YXIgbWF0Y2hUeXBlO1xuICAgICAgICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGRlcHRoID0ge307XG4gICAgICAgIHZhciBpID0gY3Vyc29yLmNvbHVtbiAtIHRva2VuLnN0YXJ0O1xuICAgICAgICB2YXIgYnJhY2tldFR5cGU7XG4gICAgICAgIHZhciBicmFja2V0cyA9IHtcbiAgICAgICAgICAgIFwiKVwiOiBcIihcIixcbiAgICAgICAgICAgIFwiKFwiOiBcIihcIixcbiAgICAgICAgICAgIFwiXVwiOiBcIltcIixcbiAgICAgICAgICAgIFwiW1wiOiBcIltcIixcbiAgICAgICAgICAgIFwie1wiOiBcIntcIixcbiAgICAgICAgICAgIFwifVwiOiBcIntcIlxuICAgICAgICB9O1xuXG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIGlmICh0b2tlbi52YWx1ZS5tYXRjaCgvW3t9KClcXFtcXF1dL2cpKSB7XG4gICAgICAgICAgICAgICAgZm9yICg7IGkgPCB0b2tlbi52YWx1ZS5sZW5ndGggJiYgIWZvdW5kOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFicmFja2V0c1t0b2tlbi52YWx1ZVtpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYnJhY2tldFR5cGUgPSBicmFja2V0c1t0b2tlbi52YWx1ZVtpXV0gKyAnLicgKyB0b2tlbi50eXBlLnJlcGxhY2UoXCJycGFyZW5cIiwgXCJscGFyZW5cIik7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzTmFOKGRlcHRoW2JyYWNrZXRUeXBlXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW2JyYWNrZXRUeXBlXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzd2l0Y2ggKHRva2VuLnZhbHVlW2ldKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICcoJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ1snOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAneyc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICcpJzpcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJ10nOlxuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnfSc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVwdGhbYnJhY2tldFR5cGVdLS07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGhbYnJhY2tldFR5cGVdID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtYXRjaFR5cGUgPSAnYnJhY2tldCc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRva2VuICYmIHRva2VuLnR5cGUuaW5kZXhPZigndGFnLW5hbWUnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpZiAoaXNOYU4oZGVwdGhbdG9rZW4udmFsdWVdKSkge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0gPSAwO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChwcmV2VG9rZW4udmFsdWUgPT09ICc8Jykge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0rKztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICBkZXB0aFt0b2tlbi52YWx1ZV0tLTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoZGVwdGhbdG9rZW4udmFsdWVdID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICBtYXRjaFR5cGUgPSAndGFnJztcbiAgICAgICAgICAgICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFmb3VuZCkge1xuICAgICAgICAgICAgICAgIHByZXZUb2tlbiA9IHRva2VuO1xuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgICAgICBpID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgIWZvdW5kKTtcblxuICAgICAgICAvL25vIG1hdGNoIGZvdW5kXG4gICAgICAgIGlmICghbWF0Y2hUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2U6IHJuZy5SYW5nZTtcbiAgICAgICAgaWYgKG1hdGNoVHlwZSA9PT0gJ2JyYWNrZXQnKSB7XG4gICAgICAgICAgICByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UoY3Vyc29yKTtcbiAgICAgICAgICAgIGlmICghcmFuZ2UpIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IG5ldyBybmcuUmFuZ2UoXG4gICAgICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIGkgLSAxLFxuICAgICAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICAgICAgaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuQ29sdW1uKCkgKyBpIC0gMVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgaWYgKCFyYW5nZSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHZhciBwb3MgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocG9zLnJvdyA9PT0gY3Vyc29yLnJvdyAmJiBNYXRoLmFicyhwb3MuY29sdW1uIC0gY3Vyc29yLmNvbHVtbikgPCAyKVxuICAgICAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuc2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UocG9zKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChtYXRjaFR5cGUgPT09ICd0YWcnKSB7XG4gICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpICE9PSAtMSlcbiAgICAgICAgICAgICAgICB2YXIgdGFnID0gdG9rZW4udmFsdWU7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgcm5nLlJhbmdlKFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLFxuICAgICAgICAgICAgICAgIGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpIC0gMixcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKSxcbiAgICAgICAgICAgICAgICBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSAtIDJcbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIC8vZmluZCBtYXRjaGluZyB0YWdcbiAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKGN1cnNvci5yb3csIGN1cnNvci5jb2x1bW4pID09PSAwKSB7XG4gICAgICAgICAgICAgICAgZm91bmQgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gcHJldlRva2VuO1xuICAgICAgICAgICAgICAgICAgICBwcmV2VG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocHJldlRva2VuLnR5cGUuaW5kZXhPZigndGFnLWNsb3NlJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc2V0RW5kKGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpLCBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW4udmFsdWUgPT09IHRhZyAmJiB0b2tlbi50eXBlLmluZGV4T2YoJ3RhZy1uYW1lJykgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlcHRoW3RhZ10rKztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZUb2tlbi52YWx1ZSA9PT0gJzwvJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZXB0aFt0YWddLS07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRlcHRoW3RhZ10gPT09IDApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gd2hpbGUgKHByZXZUb2tlbiAmJiAhZm91bmQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvL3dlIGZvdW5kIGl0XG4gICAgICAgICAgICBpZiAodG9rZW4gJiYgdG9rZW4udHlwZS5pbmRleE9mKCd0YWctbmFtZScpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBvcyA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgICAgIGlmIChwb3Mucm93ID09IGN1cnNvci5yb3cgJiYgTWF0aC5hYnMocG9zLmNvbHVtbiAtIGN1cnNvci5jb2x1bW4pIDwgMilcbiAgICAgICAgICAgICAgICAgICAgcG9zID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcG9zID0gcmFuZ2UgJiYgcmFuZ2VbJ2N1cnNvciddIHx8IHBvcztcbiAgICAgICAgaWYgKHBvcykge1xuICAgICAgICAgICAgaWYgKHNlbGVjdCkge1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5pc0VxdWFsKHRoaXMuZ2V0U2VsZWN0aW9uUmFuZ2UoKSkpXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNlbGVjdFRvKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzcGVjaWZpZWQgbGluZSBudW1iZXIsIGFuZCBhbHNvIGludG8gdGhlIGluZGljaWF0ZWQgY29sdW1uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsaW5lTnVtYmVyIFRoZSBsaW5lIG51bWJlciB0byBnbyB0b1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gQSBjb2x1bW4gbnVtYmVyIHRvIGdvIHRvXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlcyBzY29sbGluZ1xuICAgICAqKi9cbiAgICBnb3RvTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbj86IG51bWJlciwgYW5pbWF0ZT86IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24uY2xlYXJTZWxlY3Rpb24oKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnVuZm9sZCh7IHJvdzogbGluZU51bWJlciAtIDEsIGNvbHVtbjogY29sdW1uIHx8IDAgfSk7XG5cbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgLy8gdG9kbzogZmluZCBhIHdheSB0byBhdXRvbWF0aWNhbGx5IGV4aXQgbXVsdGlzZWxlY3QgbW9kZVxuICAgICAgICB0aGlzLmV4aXRNdWx0aVNlbGVjdE1vZGUgJiYgdGhpcy5leGl0TXVsdGlTZWxlY3RNb2RlKCk7XG4gICAgICAgIHRoaXMubW92ZUN1cnNvclRvKGxpbmVOdW1iZXIgLSAxLCBjb2x1bW4gfHwgMCk7XG4gICAgICAgIHRoaXMuJGJsb2NrU2Nyb2xsaW5nIC09IDE7XG5cbiAgICAgICAgaWYgKCF0aGlzLmlzUm93RnVsbHlWaXNpYmxlKGxpbmVOdW1iZXIgLSAxKSkge1xuICAgICAgICAgICAgdGhpcy5zY3JvbGxUb0xpbmUobGluZU51bWJlciAtIDEsIHRydWUsIGFuaW1hdGUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgc3BlY2lmaWVkIHJvdyBhbmQgY29sdW1uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgbmV3IHJvdyBudW1iZXJcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBuZXcgY29sdW1uIG51bWJlclxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0b3IubW92ZUN1cnNvclRvXG4gICAgICoqL1xuICAgIG5hdmlnYXRlVG8ocm93LCBjb2x1bW4pIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKHJvdywgY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHVwIGluIHRoZSBkb2N1bWVudCB0aGUgc3BlY2lmaWVkIG51bWJlciBvZiB0aW1lcy4gTm90ZSB0aGF0IHRoaXMgZG9lcyBkZS1zZWxlY3QgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lcyBUaGUgbnVtYmVyIG9mIHRpbWVzIHRvIGNoYW5nZSBuYXZpZ2F0aW9uXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICBuYXZpZ2F0ZVVwKHRpbWVzKSB7XG4gICAgICAgIGlmICh0aGlzLnNlbGVjdGlvbi5pc011bHRpTGluZSgpICYmICF0aGlzLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uU3RhcnQgPSB0aGlzLnNlbGVjdGlvbi5hbmNob3IuZ2V0UG9zaXRpb24oKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLm1vdmVDdXJzb3JUb1Bvc2l0aW9uKHNlbGVjdGlvblN0YXJ0KTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5jbGVhclNlbGVjdGlvbigpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yQnkoLXRpbWVzIHx8IC0xLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGRvd24gaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRG93bih0aW1lcykge1xuICAgICAgICBpZiAodGhpcy5zZWxlY3Rpb24uaXNNdWx0aUxpbmUoKSAmJiB0aGlzLnNlbGVjdGlvbi5pc0JhY2t3YXJkcygpKSB7XG4gICAgICAgICAgICB2YXIgc2VsZWN0aW9uRW5kID0gdGhpcy5zZWxlY3Rpb24uYW5jaG9yLmdldFBvc2l0aW9uKCk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25FbmQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JCeSh0aW1lcyB8fCAxLCAwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIGxlZnQgaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGVmdCh0aW1lcykge1xuICAgICAgICBpZiAoIXRoaXMuc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvblN0YXJ0ID0gdGhpcy5nZXRTZWxlY3Rpb25SYW5nZSgpLnN0YXJ0O1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25TdGFydCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aW1lcyA9IHRpbWVzIHx8IDE7XG4gICAgICAgICAgICB3aGlsZSAodGltZXMtLSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVDdXJzb3JMZWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgcmlnaHQgaW4gdGhlIGRvY3VtZW50IHRoZSBzcGVjaWZpZWQgbnVtYmVyIG9mIHRpbWVzLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVzIFRoZSBudW1iZXIgb2YgdGltZXMgdG8gY2hhbmdlIG5hdmlnYXRpb25cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIG5hdmlnYXRlUmlnaHQodGltZXMpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25FbmQgPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCkuZW5kO1xuICAgICAgICAgICAgdGhpcy5tb3ZlQ3Vyc29yVG9Qb3NpdGlvbihzZWxlY3Rpb25FbmQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGltZXMgPSB0aW1lcyB8fCAxO1xuICAgICAgICAgICAgd2hpbGUgKHRpbWVzLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yUmlnaHQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBsaW5lLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGluZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yTGluZVN0YXJ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgY3VycmVudCBsaW5lLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlTGluZUVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvckxpbmVFbmQoKTtcbiAgICAgICAgdGhpcy5jbGVhclNlbGVjdGlvbigpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqXG4gICAgICogTW92ZXMgdGhlIGN1cnNvciB0byB0aGUgZW5kIG9mIHRoZSBjdXJyZW50IGZpbGUuIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVGaWxlRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZUVuZCgpO1xuICAgICAgICB0aGlzLmNsZWFyU2VsZWN0aW9uKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBNb3ZlcyB0aGUgY3Vyc29yIHRvIHRoZSBzdGFydCBvZiB0aGUgY3VycmVudCBmaWxlLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlRmlsZVN0YXJ0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yRmlsZVN0YXJ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgaW1tZWRpYXRlbHkgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50IHBvc2l0aW9uLiBOb3RlIHRoYXQgdGhpcyBkb2VzIGRlLXNlbGVjdCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICoqL1xuICAgIG5hdmlnYXRlV29yZFJpZ2h0KCkge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlQ3Vyc29yV29yZFJpZ2h0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqIE1vdmVzIHRoZSBjdXJzb3IgdG8gdGhlIHdvcmQgaW1tZWRpYXRlbHkgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnJlbnQgcG9zaXRpb24uIE5vdGUgdGhhdCB0aGlzIGRvZXMgZGUtc2VsZWN0IHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKiovXG4gICAgbmF2aWdhdGVXb3JkTGVmdCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZUN1cnNvcldvcmRMZWZ0KCk7XG4gICAgICAgIHRoaXMuY2xlYXJTZWxlY3Rpb24oKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyB0aGUgZmlyc3Qgb2NjdXJhbmNlIG9mIGBvcHRpb25zLm5lZWRsZWAgd2l0aCB0aGUgdmFsdWUgaW4gYHJlcGxhY2VtZW50YC5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gcmVwbGFjZW1lbnQgVGhlIHRleHQgdG8gcmVwbGFjZSB3aXRoXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgVGhlIFtbU2VhcmNoIGBTZWFyY2hgXV0gb3B0aW9ucyB0byB1c2VcbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHJlcGxhY2UocmVwbGFjZW1lbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMpXG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHNlYXJjaC5maW5kKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IDA7XG4gICAgICAgIGlmICghcmFuZ2UpXG4gICAgICAgICAgICByZXR1cm4gcmVwbGFjZWQ7XG5cbiAgICAgICAgaWYgKHRoaXMuJHRyeVJlcGxhY2UocmFuZ2UsIHJlcGxhY2VtZW50KSkge1xuICAgICAgICAgICAgcmVwbGFjZWQgPSAxO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyYW5nZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5zY3JvbGxTZWxlY3Rpb25JbnRvVmlldyhyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByZXBsYWNlZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyBhbGwgb2NjdXJhbmNlcyBvZiBgb3B0aW9ucy5uZWVkbGVgIHdpdGggdGhlIHZhbHVlIGluIGByZXBsYWNlbWVudGAuXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IHJlcGxhY2VtZW50IFRoZSB0ZXh0IHRvIHJlcGxhY2Ugd2l0aFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIFRoZSBbW1NlYXJjaCBgU2VhcmNoYF1dIG9wdGlvbnMgdG8gdXNlXG4gICAgICpcbiAgICAgKlxuICAgICAqKi9cbiAgICByZXBsYWNlQWxsKHJlcGxhY2VtZW50LCBvcHRpb25zKSB7XG4gICAgICAgIGlmIChvcHRpb25zKSB7XG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlcyA9IHRoaXMuJHNlYXJjaC5maW5kQWxsKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIHZhciByZXBsYWNlZCA9IDA7XG4gICAgICAgIGlmICghcmFuZ2VzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybiByZXBsYWNlZDtcblxuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyArPSAxO1xuXG4gICAgICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvblJhbmdlKCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbygwLCAwKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gcmFuZ2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdHJ5UmVwbGFjZShyYW5nZXNbaV0sIHJlcGxhY2VtZW50KSkge1xuICAgICAgICAgICAgICAgIHJlcGxhY2VkKys7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShzZWxlY3Rpb24pO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZyAtPSAxO1xuXG4gICAgICAgIHJldHVybiByZXBsYWNlZDtcbiAgICB9XG5cbiAgICAkdHJ5UmVwbGFjZShyYW5nZSwgcmVwbGFjZW1lbnQpIHtcbiAgICAgICAgdmFyIGlucHV0ID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgIHJlcGxhY2VtZW50ID0gdGhpcy4kc2VhcmNoLnJlcGxhY2UoaW5wdXQsIHJlcGxhY2VtZW50KTtcbiAgICAgICAgaWYgKHJlcGxhY2VtZW50ICE9PSBudWxsKSB7XG4gICAgICAgICAgICByYW5nZS5lbmQgPSB0aGlzLnNlc3Npb24ucmVwbGFjZShyYW5nZSwgcmVwbGFjZW1lbnQpO1xuICAgICAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiB7OlNlYXJjaC5nZXRPcHRpb25zfSBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBgb3B0aW9uc2AsIHNlZSBbW1NlYXJjaCBgU2VhcmNoYF1dLlxuICAgICAqIEByZWxhdGVkIFNlYXJjaC5nZXRPcHRpb25zXG4gICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAgKiovXG4gICAgZ2V0TGFzdFNlYXJjaE9wdGlvbnMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzZWFyY2guZ2V0T3B0aW9ucygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEF0dGVtcHRzIHRvIGZpbmQgYG5lZWRsZWAgd2l0aGluIHRoZSBkb2N1bWVudC4gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gbmVlZGxlIFRoZSB0ZXh0IHRvIHNlYXJjaCBmb3IgKG9wdGlvbmFsKVxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIEFuIG9iamVjdCBkZWZpbmluZyB2YXJpb3VzIHNlYXJjaCBwcm9wZXJ0aWVzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlIHNjcm9sbGluZ1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBTZWFyY2guZmluZFxuICAgICAqKi9cbiAgICBmaW5kKG5lZWRsZTogKHN0cmluZyB8IFJlZ0V4cCksIG9wdGlvbnMsIGFuaW1hdGUpIHtcbiAgICAgICAgaWYgKCFvcHRpb25zKVxuICAgICAgICAgICAgb3B0aW9ucyA9IHt9O1xuXG4gICAgICAgIGlmICh0eXBlb2YgbmVlZGxlID09IFwic3RyaW5nXCIgfHwgbmVlZGxlIGluc3RhbmNlb2YgUmVnRXhwKVxuICAgICAgICAgICAgb3B0aW9ucy5uZWVkbGUgPSBuZWVkbGU7XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBuZWVkbGUgPT0gXCJvYmplY3RcIilcbiAgICAgICAgICAgIG9vcC5taXhpbihvcHRpb25zLCBuZWVkbGUpO1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgIGlmIChvcHRpb25zLm5lZWRsZSA9PSBudWxsKSB7XG4gICAgICAgICAgICBuZWVkbGUgPSB0aGlzLnNlc3Npb24uZ2V0VGV4dFJhbmdlKHJhbmdlKVxuICAgICAgICAgICAgICAgIHx8IHRoaXMuJHNlYXJjaC4kb3B0aW9ucy5uZWVkbGU7XG4gICAgICAgICAgICBpZiAoIW5lZWRsZSkge1xuICAgICAgICAgICAgICAgIHJhbmdlID0gdGhpcy5zZXNzaW9uLmdldFdvcmRSYW5nZShyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgbmVlZGxlID0gdGhpcy5zZXNzaW9uLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KHsgbmVlZGxlOiBuZWVkbGUgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRzZWFyY2guc2V0KG9wdGlvbnMpO1xuICAgICAgICBpZiAoIW9wdGlvbnMuc3RhcnQpXG4gICAgICAgICAgICB0aGlzLiRzZWFyY2guc2V0KHsgc3RhcnQ6IHJhbmdlIH0pO1xuXG4gICAgICAgIHZhciBuZXdSYW5nZSA9IHRoaXMuJHNlYXJjaC5maW5kKHRoaXMuc2Vzc2lvbik7XG4gICAgICAgIGlmIChvcHRpb25zLnByZXZlbnRTY3JvbGwpXG4gICAgICAgICAgICByZXR1cm4gbmV3UmFuZ2U7XG4gICAgICAgIGlmIChuZXdSYW5nZSkge1xuICAgICAgICAgICAgdGhpcy5yZXZlYWxSYW5nZShuZXdSYW5nZSwgYW5pbWF0ZSk7XG4gICAgICAgICAgICByZXR1cm4gbmV3UmFuZ2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gY2xlYXIgc2VsZWN0aW9uIGlmIG5vdGhpbmcgaXMgZm91bmRcbiAgICAgICAgaWYgKG9wdGlvbnMuYmFja3dhcmRzKVxuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQgPSByYW5nZS5lbmQ7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJhbmdlLmVuZCA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRSYW5nZShyYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGVyZm9ybXMgYW5vdGhlciBzZWFyY2ggZm9yIGBuZWVkbGVgIGluIHRoZSBkb2N1bWVudC4gRm9yIG1vcmUgaW5mb3JtYXRpb24gb24gYG9wdGlvbnNgLCBzZWUgW1tTZWFyY2ggYFNlYXJjaGBdXS5cbiAgICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBzZWFyY2ggb3B0aW9uc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gYW5pbWF0ZSBJZiBgdHJ1ZWAgYW5pbWF0ZSBzY3JvbGxpbmdcbiAgICAgKlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdG9yLmZpbmRcbiAgICAgKiovXG4gICAgZmluZE5leHQobmVlZGxlPzogKHN0cmluZyB8IFJlZ0V4cCksIGFuaW1hdGU/OiBib29sZWFuKSB7XG4gICAgICAgIC8vIEZJWE1FOiBUaGlzIGxvb2tzIGZsaXBwZWQgY29tcGFyZWQgdG8gZmluZFByZXZpb3VzLiBcbiAgICAgICAgdGhpcy5maW5kKG5lZWRsZSwgeyBza2lwQ3VycmVudDogdHJ1ZSwgYmFja3dhcmRzOiBmYWxzZSB9LCBhbmltYXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQZXJmb3JtcyBhIHNlYXJjaCBmb3IgYG5lZWRsZWAgYmFja3dhcmRzLiBGb3IgbW9yZSBpbmZvcm1hdGlvbiBvbiBgb3B0aW9uc2AsIHNlZSBbW1NlYXJjaCBgU2VhcmNoYF1dLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIHNlYXJjaCBvcHRpb25zXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBhbmltYXRlIElmIGB0cnVlYCBhbmltYXRlIHNjcm9sbGluZ1xuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0b3IuZmluZFxuICAgICAqKi9cbiAgICBmaW5kUHJldmlvdXMobmVlZGxlPzogKHN0cmluZyB8IFJlZ0V4cCksIGFuaW1hdGU/OiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuZmluZChuZWVkbGUsIHsgc2tpcEN1cnJlbnQ6IHRydWUsIGJhY2t3YXJkczogdHJ1ZSB9LCBhbmltYXRlKTtcbiAgICB9XG5cbiAgICByZXZlYWxSYW5nZShyYW5nZTogQ3Vyc29yUmFuZ2UsIGFuaW1hdGU6IGJvb2xlYW4pIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgKz0gMTtcbiAgICAgICAgdGhpcy5zZXNzaW9uLnVuZm9sZChyYW5nZSk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKHJhbmdlKTtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcgLT0gMTtcblxuICAgICAgICB2YXIgc2Nyb2xsVG9wID0gdGhpcy5yZW5kZXJlci5zY3JvbGxUb3A7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2Nyb2xsU2VsZWN0aW9uSW50b1ZpZXcocmFuZ2Uuc3RhcnQsIHJhbmdlLmVuZCwgMC41KTtcbiAgICAgICAgaWYgKGFuaW1hdGUgIT09IGZhbHNlKVxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5hbmltYXRlU2Nyb2xsaW5nKHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpVbmRvTWFuYWdlci51bmRvfVxuICAgICAqIEByZWxhdGVkIFVuZG9NYW5hZ2VyLnVuZG9cbiAgICAgKiovXG4gICAgdW5kbygpIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcrKztcbiAgICAgICAgdGhpcy5zZXNzaW9uLmdldFVuZG9NYW5hZ2VyKCkudW5kbygpO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZy0tO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KG51bGwsIDAuNSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpVbmRvTWFuYWdlci5yZWRvfVxuICAgICAqIEByZWxhdGVkIFVuZG9NYW5hZ2VyLnJlZG9cbiAgICAgKiovXG4gICAgcmVkbygpIHtcbiAgICAgICAgdGhpcy4kYmxvY2tTY3JvbGxpbmcrKztcbiAgICAgICAgdGhpcy5zZXNzaW9uLmdldFVuZG9NYW5hZ2VyKCkucmVkbygpO1xuICAgICAgICB0aGlzLiRibG9ja1Njcm9sbGluZy0tO1xuICAgICAgICB0aGlzLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KG51bGwsIDAuNSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKiBDbGVhbnMgdXAgdGhlIGVudGlyZSBlZGl0b3IuXG4gICAgICoqL1xuICAgIGRlc3Ryb3koKSB7XG4gICAgICAgIHRoaXMucmVuZGVyZXIuZGVzdHJveSgpO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJkZXN0cm95XCIsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVuYWJsZXMgYXV0b21hdGljIHNjcm9sbGluZyBvZiB0aGUgY3Vyc29yIGludG8gdmlldyB3aGVuIGVkaXRvciBpdHNlbGYgaXMgaW5zaWRlIHNjcm9sbGFibGUgZWxlbWVudFxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZW5hYmxlIGRlZmF1bHQgdHJ1ZVxuICAgICAqKi9cbiAgICBzZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXcoZW5hYmxlOiBib29sZWFuKSB7XG4gICAgICAgIGlmICghZW5hYmxlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgcmVjdDtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgc2hvdWxkU2Nyb2xsID0gZmFsc2U7XG4gICAgICAgIGlmICghdGhpcy4kc2Nyb2xsQW5jaG9yKVxuICAgICAgICAgICAgdGhpcy4kc2Nyb2xsQW5jaG9yID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbiAgICAgICAgdmFyIHNjcm9sbEFuY2hvciA9IHRoaXMuJHNjcm9sbEFuY2hvcjtcbiAgICAgICAgc2Nyb2xsQW5jaG9yLnN0eWxlLmNzc1RleHQgPSBcInBvc2l0aW9uOmFic29sdXRlXCI7XG4gICAgICAgIHRoaXMuY29udGFpbmVyLmluc2VydEJlZm9yZShzY3JvbGxBbmNob3IsIHRoaXMuY29udGFpbmVyLmZpcnN0Q2hpbGQpO1xuICAgICAgICB2YXIgb25DaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLm9uKFwiY2hhbmdlU2VsZWN0aW9uXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gdHJ1ZTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIG5lZWRlZCB0byBub3QgdHJpZ2dlciBzeW5jIHJlZmxvd1xuICAgICAgICB2YXIgb25CZWZvcmVSZW5kZXIgPSB0aGlzLnJlbmRlcmVyLm9uKFwiYmVmb3JlUmVuZGVyXCIsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHNob3VsZFNjcm9sbClcbiAgICAgICAgICAgICAgICByZWN0ID0gc2VsZi5yZW5kZXJlci5jb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICAgIH0pO1xuICAgICAgICB2YXIgb25BZnRlclJlbmRlciA9IHRoaXMucmVuZGVyZXIub24oXCJhZnRlclJlbmRlclwiLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmIChzaG91bGRTY3JvbGwgJiYgcmVjdCAmJiBzZWxmLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJlbmRlcmVyID0gc2VsZi5yZW5kZXJlcjtcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gcmVuZGVyZXIuJGN1cnNvckxheWVyLiRwaXhlbFBvcztcbiAgICAgICAgICAgICAgICB2YXIgY29uZmlnID0gcmVuZGVyZXIubGF5ZXJDb25maWc7XG4gICAgICAgICAgICAgICAgdmFyIHRvcCA9IHBvcy50b3AgLSBjb25maWcub2Zmc2V0O1xuICAgICAgICAgICAgICAgIGlmIChwb3MudG9wID49IDAgJiYgdG9wICsgcmVjdC50b3AgPCAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHBvcy50b3AgPCBjb25maWcuaGVpZ2h0ICYmXG4gICAgICAgICAgICAgICAgICAgIHBvcy50b3AgKyByZWN0LnRvcCArIGNvbmZpZy5saW5lSGVpZ2h0ID4gd2luZG93LmlubmVySGVpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkU2Nyb2xsID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHNob3VsZFNjcm9sbCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbEFuY2hvci5zdHlsZS50b3AgPSB0b3AgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbEFuY2hvci5zdHlsZS5sZWZ0ID0gcG9zLmxlZnQgKyBcInB4XCI7XG4gICAgICAgICAgICAgICAgICAgIHNjcm9sbEFuY2hvci5zdHlsZS5oZWlnaHQgPSBjb25maWcubGluZUhlaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICAgICAgc2Nyb2xsQW5jaG9yLnNjcm9sbEludG9WaWV3KHNob3VsZFNjcm9sbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNob3VsZFNjcm9sbCA9IHJlY3QgPSBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXcgPSBmdW5jdGlvbihlbmFibGUpIHtcbiAgICAgICAgICAgIGlmIChlbmFibGUpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuc2V0QXV0b1Njcm9sbEVkaXRvckludG9WaWV3O1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVFdmVudExpc3RlbmVyKFwiY2hhbmdlU2VsZWN0aW9uXCIsIG9uQ2hhbmdlU2VsZWN0aW9uKTtcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImFmdGVyUmVuZGVyXCIsIG9uQWZ0ZXJSZW5kZXIpO1xuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5yZW1vdmVFdmVudExpc3RlbmVyKFwiYmVmb3JlUmVuZGVyXCIsIG9uQmVmb3JlUmVuZGVyKTtcbiAgICAgICAgfTtcbiAgICB9XG5cblxuICAgICRyZXNldEN1cnNvclN0eWxlKCkge1xuICAgICAgICB2YXIgc3R5bGUgPSB0aGlzLiRjdXJzb3JTdHlsZSB8fCBcImFjZVwiO1xuICAgICAgICB2YXIgY3Vyc29yTGF5ZXIgPSB0aGlzLnJlbmRlcmVyLiRjdXJzb3JMYXllcjtcbiAgICAgICAgaWYgKCFjdXJzb3JMYXllcilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY3Vyc29yTGF5ZXIuc2V0U21vb3RoQmxpbmtpbmcoL3Ntb290aC8udGVzdChzdHlsZSkpO1xuICAgICAgICBjdXJzb3JMYXllci5pc0JsaW5raW5nID0gIXRoaXMuJHJlYWRPbmx5ICYmIHN0eWxlICE9IFwid2lkZVwiO1xuICAgICAgICBkb20uc2V0Q3NzQ2xhc3MoY3Vyc29yTGF5ZXIuZWxlbWVudCwgXCJhY2Vfc2xpbS1jdXJzb3JzXCIsIC9zbGltLy50ZXN0KHN0eWxlKSk7XG4gICAgfVxufVxuXG5leHBvcnQgPSBFZGl0b3I7XG5cbmNvbmZpZy5kZWZpbmVPcHRpb25zKEVkaXRvci5wcm90b3R5cGUsIFwiZWRpdG9yXCIsIHtcbiAgICBzZWxlY3Rpb25TdHlsZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHN0eWxlKSB7XG4gICAgICAgICAgICB0aGlzLm9uU2VsZWN0aW9uQ2hhbmdlKCk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTZWxlY3Rpb25TdHlsZVwiLCB7IGRhdGE6IHN0eWxlIH0pO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwibGluZVwiXG4gICAgfSxcbiAgICBoaWdobGlnaHRBY3RpdmVMaW5lOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24oKSB7IHRoaXMuJHVwZGF0ZUhpZ2hsaWdodEFjdGl2ZUxpbmUoKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICBoaWdobGlnaHRTZWxlY3RlZFdvcmQ6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbihzaG91bGRIaWdobGlnaHQpIHsgdGhpcy4kb25TZWxlY3Rpb25DaGFuZ2UoKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICByZWFkT25seToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHJlYWRPbmx5KSB7XG4gICAgICAgICAgICAvLyBkaXNhYmxlZCB0byBub3QgYnJlYWsgdmltIG1vZGUhXG4gICAgICAgICAgICAvLyB0aGlzLnRleHRJbnB1dC5zZXRSZWFkT25seShyZWFkT25seSk7XG4gICAgICAgICAgICB0aGlzLiRyZXNldEN1cnNvclN0eWxlKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIGN1cnNvclN0eWxlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuJHJlc2V0Q3Vyc29yU3R5bGUoKTsgfSxcbiAgICAgICAgdmFsdWVzOiBbXCJhY2VcIiwgXCJzbGltXCIsIFwic21vb3RoXCIsIFwid2lkZVwiXSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBcImFjZVwiXG4gICAgfSxcbiAgICBtZXJnZVVuZG9EZWx0YXM6IHtcbiAgICAgICAgdmFsdWVzOiBbZmFsc2UsIHRydWUsIFwiYWx3YXlzXCJdLFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIGJlaGF2aW91cnNFbmFibGVkOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIHdyYXBCZWhhdmlvdXJzRW5hYmxlZDogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICBhdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXc6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5zZXRBdXRvU2Nyb2xsRWRpdG9ySW50b1ZpZXcodmFsKSB9XG4gICAgfSxcblxuICAgIGhTY3JvbGxCYXJBbHdheXNWaXNpYmxlOiBcInJlbmRlcmVyXCIsXG4gICAgdlNjcm9sbEJhckFsd2F5c1Zpc2libGU6IFwicmVuZGVyZXJcIixcbiAgICBoaWdobGlnaHRHdXR0ZXJMaW5lOiBcInJlbmRlcmVyXCIsXG4gICAgYW5pbWF0ZWRTY3JvbGw6IFwicmVuZGVyZXJcIixcbiAgICBzaG93SW52aXNpYmxlczogXCJyZW5kZXJlclwiLFxuICAgIHNob3dQcmludE1hcmdpbjogXCJyZW5kZXJlclwiLFxuICAgIHByaW50TWFyZ2luQ29sdW1uOiBcInJlbmRlcmVyXCIsXG4gICAgcHJpbnRNYXJnaW46IFwicmVuZGVyZXJcIixcbiAgICBmYWRlRm9sZFdpZGdldHM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93Rm9sZFdpZGdldHM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93TGluZU51bWJlcnM6IFwicmVuZGVyZXJcIixcbiAgICBzaG93R3V0dGVyOiBcInJlbmRlcmVyXCIsXG4gICAgZGlzcGxheUluZGVudEd1aWRlczogXCJyZW5kZXJlclwiLFxuICAgIGZvbnRTaXplOiBcInJlbmRlcmVyXCIsXG4gICAgZm9udEZhbWlseTogXCJyZW5kZXJlclwiLFxuICAgIG1heExpbmVzOiBcInJlbmRlcmVyXCIsXG4gICAgbWluTGluZXM6IFwicmVuZGVyZXJcIixcbiAgICBzY3JvbGxQYXN0RW5kOiBcInJlbmRlcmVyXCIsXG4gICAgZml4ZWRXaWR0aEd1dHRlcjogXCJyZW5kZXJlclwiLFxuICAgIHRoZW1lOiBcInJlbmRlcmVyXCIsXG5cbiAgICBzY3JvbGxTcGVlZDogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZHJhZ0RlbGF5OiBcIiRtb3VzZUhhbmRsZXJcIixcbiAgICBkcmFnRW5hYmxlZDogXCIkbW91c2VIYW5kbGVyXCIsXG4gICAgZm9jdXNUaW1vdXQ6IFwiJG1vdXNlSGFuZGxlclwiLFxuICAgIHRvb2x0aXBGb2xsb3dzTW91c2U6IFwiJG1vdXNlSGFuZGxlclwiLFxuXG4gICAgZmlyc3RMaW5lTnVtYmVyOiBcInNlc3Npb25cIixcbiAgICBvdmVyd3JpdGU6IFwic2Vzc2lvblwiLFxuICAgIG5ld0xpbmVNb2RlOiBcInNlc3Npb25cIixcbiAgICB1c2VXb3JrZXI6IFwic2Vzc2lvblwiLFxuICAgIHVzZVNvZnRUYWJzOiBcInNlc3Npb25cIixcbiAgICB0YWJTaXplOiBcInNlc3Npb25cIixcbiAgICB3cmFwOiBcInNlc3Npb25cIixcbiAgICBmb2xkU3R5bGU6IFwic2Vzc2lvblwiLFxuICAgIG1vZGU6IFwic2Vzc2lvblwiXG59KTtcblxuY2xhc3MgRm9sZEhhbmRsZXIge1xuICAgIGNvbnN0cnVjdG9yKGVkaXRvcjogRWRpdG9yKSB7XG5cbiAgICAgICAgLy8gVGhlIGZvbGxvd2luZyBoYW5kbGVyIGRldGVjdHMgY2xpY2tzIGluIHRoZSBlZGl0b3IgKG5vdCBndXR0ZXIpIHJlZ2lvblxuICAgICAgICAvLyB0byBkZXRlcm1pbmUgd2hldGhlciB0byByZW1vdmUgb3IgZXhwYW5kIGEgZm9sZC5cbiAgICAgICAgZWRpdG9yLm9uKFwiY2xpY2tcIiwgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIHBvc2l0aW9uID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgICAgICB2YXIgc2Vzc2lvbiA9IGVkaXRvci5zZXNzaW9uO1xuXG4gICAgICAgICAgICAvLyBJZiB0aGUgdXNlciBjbGlja2VkIG9uIGEgZm9sZCwgdGhlbiBleHBhbmQgaXQuXG4gICAgICAgICAgICB2YXIgZm9sZCA9IHNlc3Npb24uZ2V0Rm9sZEF0KHBvc2l0aW9uLnJvdywgcG9zaXRpb24uY29sdW1uLCAxKTtcbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgaWYgKGUuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaGFuZGxlciBkZXRlY3RzIGNsaWNrcyBvbiB0aGUgZ3V0dGVyLlxuICAgICAgICBlZGl0b3Iub24oJ2d1dHRlcmNsaWNrJywgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXIuZ2V0UmVnaW9uKGUpO1xuICAgICAgICAgICAgaWYgKGd1dHRlclJlZ2lvbiA9PT0gJ2ZvbGRXaWRnZXRzJykge1xuICAgICAgICAgICAgICAgIHZhciByb3cgPSBlLmdldERvY3VtZW50UG9zaXRpb24oKS5yb3c7XG4gICAgICAgICAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3Iuc2Vzc2lvbjtcbiAgICAgICAgICAgICAgICBpZiAoc2Vzc2lvblsnZm9sZFdpZGdldHMnXSAmJiBzZXNzaW9uWydmb2xkV2lkZ2V0cyddW3Jvd10pIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnNlc3Npb25bJ29uRm9sZFdpZGdldENsaWNrJ10ocm93LCBlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKCFlZGl0b3IuaXNGb2N1c2VkKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGUuc3RvcCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBlZGl0b3Iub24oJ2d1dHRlcmRibGNsaWNrJywgZnVuY3Rpb24oZTogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGVkaXRvci5yZW5kZXJlci4kZ3V0dGVyTGF5ZXIuZ2V0UmVnaW9uKGUpO1xuXG4gICAgICAgICAgICBpZiAoZ3V0dGVyUmVnaW9uID09ICdmb2xkV2lkZ2V0cycpIHtcbiAgICAgICAgICAgICAgICB2YXIgcm93ID0gZS5nZXREb2N1bWVudFBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgICAgIHZhciBzZXNzaW9uID0gZWRpdG9yLnNlc3Npb247XG4gICAgICAgICAgICAgICAgdmFyIGRhdGEgPSBzZXNzaW9uWydnZXRQYXJlbnRGb2xkUmFuZ2VEYXRhJ10ocm93LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB2YXIgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGRhdGEuZmlyc3RSYW5nZTtcblxuICAgICAgICAgICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkID0gc2Vzc2lvbi5nZXRGb2xkQXQocm93LCBzZXNzaW9uLmdldExpbmUocm93KS5sZW5ndGgsIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZXNzaW9uWydhZGRGb2xkJ10oXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KHsgcm93OiByYW5nZS5zdGFydC5yb3csIGNvbHVtbjogMCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxufVxuXG5pbnRlcmZhY2UgSUdlc3R1cmVIYW5kbGVyIHtcbiAgICBjYW5jZWxDb250ZXh0TWVudSgpOiB2b2lkO1xufVxuXG5jbGFzcyBNb3VzZUhhbmRsZXIge1xuICAgIHB1YmxpYyBlZGl0b3I6IEVkaXRvcjtcbiAgICBwcml2YXRlICRzY3JvbGxTcGVlZDogbnVtYmVyID0gMjtcbiAgICBwcml2YXRlICRkcmFnRGVsYXk6IG51bWJlciA9IDA7XG4gICAgcHJpdmF0ZSAkZHJhZ0VuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlO1xuICAgIHB1YmxpYyAkZm9jdXNUaW1vdXQ6IG51bWJlciA9IDA7XG4gICAgcHVibGljICR0b29sdGlwRm9sbG93c01vdXNlOiBib29sZWFuID0gdHJ1ZTtcbiAgICBwcml2YXRlIHN0YXRlOiBzdHJpbmc7XG4gICAgcHJpdmF0ZSBjbGllbnRYOiBudW1iZXI7XG4gICAgcHJpdmF0ZSBjbGllbnRZOiBudW1iZXI7XG4gICAgcHVibGljIGlzTW91c2VQcmVzc2VkOiBib29sZWFuO1xuICAgIC8qKlxuICAgICAqIFRoZSBmdW5jdGlvbiB0byBjYWxsIHRvIHJlbGVhc2UgYSBjYXB0dXJlZCBtb3VzZS5cbiAgICAgKi9cbiAgICBwcml2YXRlIHJlbGVhc2VNb3VzZTogKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkO1xuICAgIHByaXZhdGUgbW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudDtcbiAgICBwdWJsaWMgbW91c2Vkb3duRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQ7XG4gICAgcHJpdmF0ZSAkbW91c2VNb3ZlZDtcbiAgICBwcml2YXRlICRvbkNhcHR1cmVNb3VzZU1vdmU7XG4gICAgcHVibGljICRjbGlja1NlbGVjdGlvbjogcm5nLlJhbmdlID0gbnVsbDtcbiAgICBwdWJsaWMgJGxhc3RTY3JvbGxUaW1lOiBudW1iZXI7XG4gICAgcHVibGljIHNlbGVjdEJ5TGluZXM6ICgpID0+IHZvaWQ7XG4gICAgcHVibGljIHNlbGVjdEJ5V29yZHM6ICgpID0+IHZvaWQ7XG4gICAgY29uc3RydWN0b3IoZWRpdG9yOiBFZGl0b3IpIHtcbiAgICAgICAgLy8gRklYTUU6IERpZCBJIG1lbnRpb24gdGhhdCBgdGhpc2AsIGBuZXdgLCBgY2xhc3NgLCBgYmluZGAgYXJlIHRoZSA0IGhvcnNlbWVuP1xuICAgICAgICAvLyBGSVhNRTogRnVuY3Rpb24gU2NvcGluZyBpcyB0aGUgYW5zd2VyLlxuICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICB0aGlzLmVkaXRvciA9IGVkaXRvcjtcblxuICAgICAgICAvLyBGSVhNRTogV2Ugc2hvdWxkIGJlIGNsZWFuaW5nIHVwIHRoZXNlIGhhbmRsZXJzIGluIGEgZGlzcG9zZSBtZXRob2QuLi5cbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKCdtb3VzZWRvd24nLCBtYWtlTW91c2VEb3duSGFuZGxlcihlZGl0b3IsIHRoaXMpKTtcbiAgICAgICAgZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKCdtb3VzZXdoZWVsJywgbWFrZU1vdXNlV2hlZWxIYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoXCJkYmxjbGlja1wiLCBtYWtlRG91YmxlQ2xpY2tIYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoXCJ0cmlwbGVjbGlja1wiLCBtYWtlVHJpcGxlQ2xpY2tIYW5kbGVyKGVkaXRvciwgdGhpcykpO1xuICAgICAgICBlZGl0b3Iuc2V0RGVmYXVsdEhhbmRsZXIoXCJxdWFkY2xpY2tcIiwgbWFrZVF1YWRDbGlja0hhbmRsZXIoZWRpdG9yLCB0aGlzKSk7XG5cbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzID0gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvciwgdGhpcywgXCJnZXRMaW5lUmFuZ2VcIik7XG4gICAgICAgIHRoaXMuc2VsZWN0QnlXb3JkcyA9IG1ha2VFeHRlbmRTZWxlY3Rpb25CeShlZGl0b3IsIHRoaXMsIFwiZ2V0V29yZFJhbmdlXCIpO1xuXG4gICAgICAgIG5ldyBHdXR0ZXJIYW5kbGVyKHRoaXMpO1xuICAgICAgICAvLyAgICAgIEZJWE1FOiBuZXcgRHJhZ2Ryb3BIYW5kbGVyKHRoaXMpO1xuXG4gICAgICAgIHZhciBvbk1vdXNlRG93biA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpICYmIGVkaXRvci50ZXh0SW5wdXQpIHtcbiAgICAgICAgICAgICAgICBlZGl0b3IudGV4dElucHV0Lm1vdmVUb01vdXNlKGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKClcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgbW91c2VUYXJnZXQ6IEhUTUxEaXZFbGVtZW50ID0gZWRpdG9yLnJlbmRlcmVyLmdldE1vdXNlRXZlbnRUYXJnZXQoKTtcbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIobW91c2VUYXJnZXQsIFwiY2xpY2tcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImNsaWNrXCIpKTtcbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIobW91c2VUYXJnZXQsIFwibW91c2Vtb3ZlXCIsIHRoaXMub25Nb3VzZU1vdmUuYmluZCh0aGlzLCBcIm1vdXNlbW92ZVwiKSk7XG4gICAgICAgIGV2ZW50LmFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIobW91c2VUYXJnZXQsIFs0MDAsIDMwMCwgMjUwXSwgdGhpcywgXCJvbk1vdXNlRXZlbnRcIik7XG4gICAgICAgIGlmIChlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFyVikge1xuICAgICAgICAgICAgZXZlbnQuYWRkTXVsdGlNb3VzZURvd25MaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFyVi5pbm5lciwgWzQwMCwgMzAwLCAyNTBdLCB0aGlzLCBcIm9uTW91c2VFdmVudFwiKTtcbiAgICAgICAgICAgIGV2ZW50LmFkZE11bHRpTW91c2VEb3duTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhckguaW5uZXIsIFs0MDAsIDMwMCwgMjUwXSwgdGhpcywgXCJvbk1vdXNlRXZlbnRcIik7XG4gICAgICAgICAgICBpZiAodXNlckFnZW50LmlzSUUpIHtcbiAgICAgICAgICAgICAgICBldmVudC5hZGRMaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuc2Nyb2xsQmFyVi5lbGVtZW50LCBcIm1vdXNlZG93blwiLCBvbk1vdXNlRG93bik7XG4gICAgICAgICAgICAgICAgLy8gVE9ETzogSSB3b25kZXIgaWYgd2Ugc2hvdWxkIGJlIHJlc3BvbmRpbmcgdG8gbW91c2Vkb3duIChieSBzeW1tZXRyeSk/XG4gICAgICAgICAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIoZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJhckguZWxlbWVudCwgXCJtb3VzZW1vdmVcIiwgb25Nb3VzZURvd24pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gV2UgaG9vayAnbW91c2V3aGVlbCcgdXNpbmcgdGhlIHBvcnRhYmxlIFxuICAgICAgICBldmVudC5hZGRNb3VzZVdoZWVsTGlzdGVuZXIoZWRpdG9yLmNvbnRhaW5lciwgdGhpcy5lbWl0RWRpdG9yTW91c2VXaGVlbEV2ZW50LmJpbmQodGhpcywgXCJtb3VzZXdoZWVsXCIpKTtcblxuICAgICAgICB2YXIgZ3V0dGVyRWwgPSBlZGl0b3IucmVuZGVyZXIuJGd1dHRlcjtcbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIoZ3V0dGVyRWwsIFwibW91c2Vkb3duXCIsIHRoaXMub25Nb3VzZUV2ZW50LmJpbmQodGhpcywgXCJndXR0ZXJtb3VzZWRvd25cIikpO1xuICAgICAgICBldmVudC5hZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJjbGlja1wiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVyY2xpY2tcIikpO1xuICAgICAgICBldmVudC5hZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJkYmxjbGlja1wiLCB0aGlzLm9uTW91c2VFdmVudC5iaW5kKHRoaXMsIFwiZ3V0dGVyZGJsY2xpY2tcIikpO1xuICAgICAgICBldmVudC5hZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJtb3VzZW1vdmVcIiwgdGhpcy5vbk1vdXNlRXZlbnQuYmluZCh0aGlzLCBcImd1dHRlcm1vdXNlbW92ZVwiKSk7XG5cbiAgICAgICAgZXZlbnQuYWRkTGlzdGVuZXIobW91c2VUYXJnZXQsIFwibW91c2Vkb3duXCIsIG9uTW91c2VEb3duKTtcblxuICAgICAgICBldmVudC5hZGRMaXN0ZW5lcihndXR0ZXJFbCwgXCJtb3VzZWRvd25cIiwgZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgZWRpdG9yLmZvY3VzKCk7XG4gICAgICAgICAgICByZXR1cm4gZXZlbnQucHJldmVudERlZmF1bHQoZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEhhbmRsZSBgbW91c2Vtb3ZlYCB3aGlsZSB0aGUgbW91c2UgaXMgb3ZlciB0aGUgZWRpdGluZyBhcmVhIChhbmQgbm90IHRoZSBndXR0ZXIpLlxuICAgICAgICBlZGl0b3Iub24oJ21vdXNlbW92ZScsIGZ1bmN0aW9uKGU6IE1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIGlmIChfc2VsZi5zdGF0ZSB8fCBfc2VsZi4kZHJhZ0RlbGF5IHx8ICFfc2VsZi4kZHJhZ0VuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBGSVhNRTogUHJvYmFibHkgcy9iIGNsaWVudFhZXG4gICAgICAgICAgICB2YXIgY2hhciA9IGVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyhlLngsIGUueSk7XG4gICAgICAgICAgICB2YXIgcmFuZ2UgPSBlZGl0b3Iuc2Vzc2lvbi5zZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgICAgIHZhciByZW5kZXJlciA9IGVkaXRvci5yZW5kZXJlcjtcblxuICAgICAgICAgICAgaWYgKCFyYW5nZS5pc0VtcHR5KCkgJiYgcmFuZ2UuaW5zaWRlU3RhcnQoY2hhci5yb3csIGNoYXIuY29sdW1uKSkge1xuICAgICAgICAgICAgICAgIHJlbmRlcmVyLnNldEN1cnNvclN0eWxlKCdkZWZhdWx0Jyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZW5kZXJlci5zZXRDdXJzb3JTdHlsZShcIlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgb25Nb3VzZUV2ZW50KG5hbWU6IHN0cmluZywgZTogTW91c2VFdmVudCkge1xuICAgICAgICB0aGlzLmVkaXRvci5fZW1pdChuYW1lLCBuZXcgRWRpdG9yTW91c2VFdmVudChlLCB0aGlzLmVkaXRvcikpO1xuICAgIH1cblxuICAgIG9uTW91c2VNb3ZlKG5hbWU6IHN0cmluZywgZTogTW91c2VFdmVudCkge1xuICAgICAgICAvLyBvcHRpbWl6YXRpb24sIGJlY2F1c2UgbW91c2Vtb3ZlIGRvZXNuJ3QgaGF2ZSBhIGRlZmF1bHQgaGFuZGxlci5cbiAgICAgICAgdmFyIGxpc3RlbmVycyA9IHRoaXMuZWRpdG9yLl9ldmVudFJlZ2lzdHJ5ICYmIHRoaXMuZWRpdG9yLl9ldmVudFJlZ2lzdHJ5Lm1vdXNlbW92ZTtcbiAgICAgICAgaWYgKCFsaXN0ZW5lcnMgfHwgIWxpc3RlbmVycy5sZW5ndGgpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZWRpdG9yLl9lbWl0KG5hbWUsIG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKSk7XG4gICAgfVxuXG4gICAgZW1pdEVkaXRvck1vdXNlV2hlZWxFdmVudChuYW1lOiBzdHJpbmcsIGU6IE1vdXNlV2hlZWxFdmVudCkge1xuICAgICAgICB2YXIgbW91c2VFdmVudCA9IG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIHRoaXMuZWRpdG9yKTtcbiAgICAgICAgbW91c2VFdmVudC5zcGVlZCA9IHRoaXMuJHNjcm9sbFNwZWVkICogMjtcbiAgICAgICAgbW91c2VFdmVudC53aGVlbFggPSBlWyd3aGVlbFgnXTtcbiAgICAgICAgbW91c2VFdmVudC53aGVlbFkgPSBlWyd3aGVlbFknXTtcbiAgICAgICAgdGhpcy5lZGl0b3IuX2VtaXQobmFtZSwgbW91c2VFdmVudCk7XG4gICAgfVxuXG4gICAgc2V0U3RhdGUoc3RhdGU6IHN0cmluZykge1xuICAgICAgICB0aGlzLnN0YXRlID0gc3RhdGU7XG4gICAgfVxuXG4gICAgdGV4dENvb3JkaW5hdGVzKCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICByZXR1cm4gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgIH1cblxuICAgIGNhcHR1cmVNb3VzZShldjogRWRpdG9yTW91c2VFdmVudCwgbW91c2VNb3ZlSGFuZGxlcj86IChtb3VzZUV2ZW50OiBNb3VzZUV2ZW50KSA9PiB2b2lkKSB7XG4gICAgICAgIHRoaXMuY2xpZW50WCA9IGV2LmNsaWVudFg7XG4gICAgICAgIHRoaXMuY2xpZW50WSA9IGV2LmNsaWVudFk7XG5cbiAgICAgICAgdGhpcy5pc01vdXNlUHJlc3NlZCA9IHRydWU7XG5cbiAgICAgICAgLy8gZG8gbm90IG1vdmUgdGV4dGFyZWEgZHVyaW5nIHNlbGVjdGlvblxuICAgICAgICB2YXIgcmVuZGVyZXIgPSB0aGlzLmVkaXRvci5yZW5kZXJlcjtcbiAgICAgICAgaWYgKHJlbmRlcmVyLiRrZWVwVGV4dEFyZWFBdEN1cnNvcikge1xuICAgICAgICAgICAgcmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBvbk1vdXNlTW92ZSA9IChmdW5jdGlvbihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihtb3VzZUV2ZW50OiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKCFtb3VzZUV2ZW50KSByZXR1cm47XG4gICAgICAgICAgICAgICAgLy8gaWYgZWRpdG9yIGlzIGxvYWRlZCBpbnNpZGUgaWZyYW1lLCBhbmQgbW91c2V1cCBldmVudCBpcyBvdXRzaWRlXG4gICAgICAgICAgICAgICAgLy8gd2Ugd29uJ3QgcmVjaWV2ZSBpdCwgc28gd2UgY2FuY2VsIG9uIGZpcnN0IG1vdXNlbW92ZSB3aXRob3V0IGJ1dHRvblxuICAgICAgICAgICAgICAgIGlmICh1c2VyQWdlbnQuaXNXZWJLaXQgJiYgIW1vdXNlRXZlbnQud2hpY2ggJiYgbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBUT0RPOiBGb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgSSdtIHBhc3NpbmcgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICAvLyBidXQgaXQgd291bGQgcHJvYmFibHkgbWFrZSBtb3JlIHNlbnNlIHRvIHBhc3MgdGhlIG1vdXNlIGV2ZW50XG4gICAgICAgICAgICAgICAgICAgIC8vIHNpbmNlIHRoYXQgaXMgdGhlIGZpbmFsIGV2ZW50LlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSh1bmRlZmluZWQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jbGllbnRYID0gbW91c2VFdmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5jbGllbnRZID0gbW91c2VFdmVudC5jbGllbnRZO1xuICAgICAgICAgICAgICAgIG1vdXNlTW92ZUhhbmRsZXIgJiYgbW91c2VNb3ZlSGFuZGxlcihtb3VzZUV2ZW50KTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIubW91c2VFdmVudCA9IG5ldyBFZGl0b3JNb3VzZUV2ZW50KG1vdXNlRXZlbnQsIGVkaXRvcik7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRtb3VzZU1vdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcy5lZGl0b3IsIHRoaXMpO1xuXG4gICAgICAgIHZhciBvbkNhcHR1cmVFbmQgPSAoZnVuY3Rpb24obW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbCh0aW1lcklkKTtcbiAgICAgICAgICAgICAgICBvbkNhcHR1cmVJbnRlcnZhbCgpO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlclttb3VzZUhhbmRsZXIuc3RhdGUgKyBcIkVuZFwiXSAmJiBtb3VzZUhhbmRsZXJbbW91c2VIYW5kbGVyLnN0YXRlICsgXCJFbmRcIl0oZSk7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLnN0YXRlID0gXCJcIjtcbiAgICAgICAgICAgICAgICBpZiAocmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuJGtlZXBUZXh0QXJlYUF0Q3Vyc29yID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcmVuZGVyZXIuJG1vdmVUZXh0QXJlYVRvQ3Vyc29yKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci5pc01vdXNlUHJlc3NlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kb25DYXB0dXJlTW91c2VNb3ZlID0gbW91c2VIYW5kbGVyLnJlbGVhc2VNb3VzZSA9IG51bGw7XG4gICAgICAgICAgICAgICAgZSAmJiBtb3VzZUhhbmRsZXIub25Nb3VzZUV2ZW50KFwibW91c2V1cFwiLCBlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcyk7XG5cbiAgICAgICAgdmFyIG9uQ2FwdHVyZUludGVydmFsID0gKGZ1bmN0aW9uKG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZV0gJiYgbW91c2VIYW5kbGVyW21vdXNlSGFuZGxlci5zdGF0ZV0oKTtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuJG1vdXNlTW92ZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkodGhpcyk7XG5cbiAgICAgICAgaWYgKHVzZXJBZ2VudC5pc09sZElFICYmIGV2LmRvbUV2ZW50LnR5cGUgPT0gXCJkYmxjbGlja1wiKSB7XG4gICAgICAgICAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpIHsgb25DYXB0dXJlRW5kKGV2KTsgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiRvbkNhcHR1cmVNb3VzZU1vdmUgPSBvbk1vdXNlTW92ZTtcbiAgICAgICAgdGhpcy5yZWxlYXNlTW91c2UgPSBldmVudC5jYXB0dXJlKHRoaXMuZWRpdG9yLmNvbnRhaW5lciwgb25Nb3VzZU1vdmUsIG9uQ2FwdHVyZUVuZCk7XG4gICAgICAgIHZhciB0aW1lcklkID0gc2V0SW50ZXJ2YWwob25DYXB0dXJlSW50ZXJ2YWwsIDIwKTtcbiAgICB9XG5cbiAgICBjYW5jZWxDb250ZXh0TWVudSgpOiB2b2lkIHtcbiAgICAgICAgdmFyIHN0b3AgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICBpZiAoZSAmJiBlLmRvbUV2ZW50ICYmIGUuZG9tRXZlbnQudHlwZSAhPSBcImNvbnRleHRtZW51XCIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5vZmYoXCJuYXRpdmVjb250ZXh0bWVudVwiLCBzdG9wKTtcbiAgICAgICAgICAgIGlmIChlICYmIGUuZG9tRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBldmVudC5zdG9wRXZlbnQoZS5kb21FdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKTtcbiAgICAgICAgc2V0VGltZW91dChzdG9wLCAxMCk7XG4gICAgICAgIHRoaXMuZWRpdG9yLm9uKFwibmF0aXZlY29udGV4dG1lbnVcIiwgc3RvcCk7XG4gICAgfVxuXG4gICAgc2VsZWN0KCkge1xuICAgICAgICB2YXIgYW5jaG9yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgICAgICB2YXIgY3Vyc29yID0gdGhpcy5lZGl0b3IucmVuZGVyZXIuc2NyZWVuVG9UZXh0Q29vcmRpbmF0ZXModGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuXG4gICAgICAgIGlmICh0aGlzLiRjbGlja1NlbGVjdGlvbikge1xuICAgICAgICAgICAgdmFyIGNtcCA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChjdXJzb3IpO1xuXG4gICAgICAgICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gdGhpcy4kY2xpY2tTZWxlY3Rpb24uZW5kO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChjbXAgPT0gMSkge1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHRoaXMuJGNsaWNrU2VsZWN0aW9uLnN0YXJ0O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZW50ZWRSYW5nZSA9IGNhbGNSYW5nZU9yaWVudGF0aW9uKHRoaXMuJGNsaWNrU2VsZWN0aW9uLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IG9yaWVudGVkUmFuZ2UuY3Vyc29yO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG9yaWVudGVkUmFuZ2UuYW5jaG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5lZGl0b3Iuc2VsZWN0aW9uLnNldFNlbGVjdGlvbkFuY2hvcihhbmNob3Iucm93LCBhbmNob3IuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihjdXJzb3IpO1xuXG4gICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QnlMaW5lc0VuZCgpIHtcbiAgICAgICAgdGhpcy4kY2xpY2tTZWxlY3Rpb24gPSBudWxsO1xuICAgICAgICB0aGlzLmVkaXRvci51bnNldFN0eWxlKFwiYWNlX3NlbGVjdGluZ1wiKTtcbiAgICAgICAgaWYgKHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnJlbGVhc2VDYXB0dXJlKSB7XG4gICAgICAgICAgICB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JvbGxlci5yZWxlYXNlQ2FwdHVyZSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgc3RhcnRTZWxlY3QocG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24/OiBib29sZWFuKSB7XG4gICAgICAgIHBvcyA9IHBvcyB8fCB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgICAgIHZhciBlZGl0b3IgPSB0aGlzLmVkaXRvcjtcbiAgICAgICAgLy8gYWxsb3cgZG91YmxlL3RyaXBsZSBjbGljayBoYW5kbGVycyB0byBjaGFuZ2Ugc2VsZWN0aW9uXG4gICAgXG4gICAgICAgIGlmICh0aGlzLm1vdXNlZG93bkV2ZW50LmdldFNoaWZ0S2V5KCkpIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24uc2VsZWN0VG9Qb3NpdGlvbihwb3MpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCF3YWl0Rm9yQ2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIGVkaXRvci5zZWxlY3Rpb24ubW92ZVRvUG9zaXRpb24ocG9zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghd2FpdEZvckNsaWNrU2VsZWN0aW9uKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdCgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnNldENhcHR1cmUpIHtcbiAgICAgICAgICAgIHRoaXMuZWRpdG9yLnJlbmRlcmVyLnNjcm9sbGVyLnNldENhcHR1cmUoKTtcbiAgICAgICAgfVxuICAgICAgICBlZGl0b3Iuc2V0U3R5bGUoXCJhY2Vfc2VsZWN0aW5nXCIpO1xuICAgICAgICB0aGlzLnNldFN0YXRlKFwic2VsZWN0XCIpO1xuICAgIH1cblxuICAgIHNlbGVjdEVuZCgpIHtcbiAgICAgICAgdGhpcy5zZWxlY3RCeUxpbmVzRW5kKCk7XG4gICAgfVxuXG4gICAgc2VsZWN0QWxsRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBzZWxlY3RCeVdvcmRzRW5kKCkge1xuICAgICAgICB0aGlzLnNlbGVjdEJ5TGluZXNFbmQoKTtcbiAgICB9XG5cbiAgICBmb2N1c1dhaXQoKSB7XG4gICAgICAgIHZhciBkaXN0YW5jZSA9IGNhbGNEaXN0YW5jZSh0aGlzLm1vdXNlZG93bkV2ZW50LmNsaWVudFgsIHRoaXMubW91c2Vkb3duRXZlbnQuY2xpZW50WSwgdGhpcy5jbGllbnRYLCB0aGlzLmNsaWVudFkpO1xuICAgICAgICB2YXIgdGltZSA9IERhdGUubm93KCk7XG5cbiAgICAgICAgaWYgKGRpc3RhbmNlID4gRFJBR19PRkZTRVQgfHwgdGltZSAtIHRoaXMubW91c2Vkb3duRXZlbnQudGltZSA+IHRoaXMuJGZvY3VzVGltb3V0KSB7XG4gICAgICAgICAgICB0aGlzLnN0YXJ0U2VsZWN0KHRoaXMubW91c2Vkb3duRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpKTtcbiAgICAgICAgfVxuICAgIH1cblxufVxuXG5jb25maWcuZGVmaW5lT3B0aW9ucyhNb3VzZUhhbmRsZXIucHJvdG90eXBlLCBcIm1vdXNlSGFuZGxlclwiLCB7XG4gICAgc2Nyb2xsU3BlZWQ6IHsgaW5pdGlhbFZhbHVlOiAyIH0sXG4gICAgZHJhZ0RlbGF5OiB7IGluaXRpYWxWYWx1ZTogKHVzZXJBZ2VudC5pc01hYyA/IDE1MCA6IDApIH0sXG4gICAgZHJhZ0VuYWJsZWQ6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgZm9jdXNUaW1vdXQ6IHsgaW5pdGlhbFZhbHVlOiAwIH0sXG4gICAgdG9vbHRpcEZvbGxvd3NNb3VzZTogeyBpbml0aWFsVmFsdWU6IHRydWUgfVxufSk7XG5cbi8qXG4gKiBDdXN0b20gQWNlIG1vdXNlIGV2ZW50XG4gKi9cbmNsYXNzIEVkaXRvck1vdXNlRXZlbnQge1xuICAgIC8vIFdlIGtlZXAgdGhlIG9yaWdpbmFsIERPTSBldmVudFxuICAgIHB1YmxpYyBkb21FdmVudDogTW91c2VFdmVudDtcbiAgICBwcml2YXRlIGVkaXRvcjogRWRpdG9yO1xuICAgIHB1YmxpYyBjbGllbnRYOiBudW1iZXI7XG4gICAgcHVibGljIGNsaWVudFk6IG51bWJlcjtcbiAgICAvKipcbiAgICAgKiBDYWNoZWQgdGV4dCBjb29yZGluYXRlcyBmb2xsb3dpbmcgZ2V0RG9jdW1lbnRQb3NpdGlvbigpXG4gICAgICovXG4gICAgcHJpdmF0ZSAkcG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgIHByaXZhdGUgJGluU2VsZWN0aW9uO1xuICAgIHByaXZhdGUgcHJvcGFnYXRpb25TdG9wcGVkID0gZmFsc2U7XG4gICAgcHJpdmF0ZSBkZWZhdWx0UHJldmVudGVkID0gZmFsc2U7XG4gICAgcHVibGljIHRpbWU6IG51bWJlcjtcbiAgICAvLyB3aGVlbFksIHdoZWVsWSBhbmQgc3BlZWQgYXJlIGZvciAnbW91c2V3aGVlbCcgZXZlbnRzLlxuICAgIHB1YmxpYyB3aGVlbFg6IG51bWJlcjtcbiAgICBwdWJsaWMgd2hlZWxZOiBudW1iZXI7XG4gICAgcHVibGljIHNwZWVkOiBudW1iZXI7XG4gICAgY29uc3RydWN0b3IoZG9tRXZlbnQ6IE1vdXNlRXZlbnQsIGVkaXRvcjogRWRpdG9yKSB7XG4gICAgICAgIHRoaXMuZG9tRXZlbnQgPSBkb21FdmVudDtcbiAgICAgICAgdGhpcy5lZGl0b3IgPSBlZGl0b3I7XG5cbiAgICAgICAgdGhpcy5jbGllbnRYID0gZG9tRXZlbnQuY2xpZW50WDtcbiAgICAgICAgdGhpcy5jbGllbnRZID0gZG9tRXZlbnQuY2xpZW50WTtcblxuICAgICAgICB0aGlzLiRwb3MgPSBudWxsO1xuICAgICAgICB0aGlzLiRpblNlbGVjdGlvbiA9IG51bGw7XG4gICAgfVxuXG4gICAgZ2V0IHRvRWxlbWVudCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9tRXZlbnQudG9FbGVtZW50O1xuICAgIH1cblxuICAgIHN0b3BQcm9wYWdhdGlvbigpIHtcbiAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKHRoaXMuZG9tRXZlbnQpO1xuICAgICAgICB0aGlzLnByb3BhZ2F0aW9uU3RvcHBlZCA9IHRydWU7XG4gICAgfVxuXG4gICAgcHJldmVudERlZmF1bHQoKSB7XG4gICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KHRoaXMuZG9tRXZlbnQpO1xuICAgICAgICB0aGlzLmRlZmF1bHRQcmV2ZW50ZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIHN0b3AoKSB7XG4gICAgICAgIHRoaXMuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgIHRoaXMucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIEdldCB0aGUgZG9jdW1lbnQgcG9zaXRpb24gYmVsb3cgdGhlIG1vdXNlIGN1cnNvclxuICAgICAqIFxuICAgICAqIEByZXR1cm4ge09iamVjdH0gJ3JvdycgYW5kICdjb2x1bW4nIG9mIHRoZSBkb2N1bWVudCBwb3NpdGlvblxuICAgICAqL1xuICAgIGdldERvY3VtZW50UG9zaXRpb24oKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIGlmICghdGhpcy4kcG9zKSB7XG4gICAgICAgICAgICB0aGlzLiRwb3MgPSB0aGlzLmVkaXRvci5yZW5kZXJlci5zY3JlZW5Ub1RleHRDb29yZGluYXRlcyh0aGlzLmNsaWVudFgsIHRoaXMuY2xpZW50WSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuJHBvcztcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBDaGVjayBpZiB0aGUgbW91c2UgY3Vyc29yIGlzIGluc2lkZSBvZiB0aGUgdGV4dCBzZWxlY3Rpb25cbiAgICAgKiBcbiAgICAgKiBAcmV0dXJuIHtCb29sZWFufSB3aGV0aGVyIHRoZSBtb3VzZSBjdXJzb3IgaXMgaW5zaWRlIG9mIHRoZSBzZWxlY3Rpb25cbiAgICAgKi9cbiAgICBpblNlbGVjdGlvbigpIHtcbiAgICAgICAgaWYgKHRoaXMuJGluU2VsZWN0aW9uICE9PSBudWxsKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJGluU2VsZWN0aW9uO1xuXG4gICAgICAgIHZhciBlZGl0b3IgPSB0aGlzLmVkaXRvcjtcblxuXG4gICAgICAgIHZhciBzZWxlY3Rpb25SYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAoc2VsZWN0aW9uUmFuZ2UuaXNFbXB0eSgpKVxuICAgICAgICAgICAgdGhpcy4kaW5TZWxlY3Rpb24gPSBmYWxzZTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcG9zID0gdGhpcy5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgICAgICB0aGlzLiRpblNlbGVjdGlvbiA9IHNlbGVjdGlvblJhbmdlLmNvbnRhaW5zKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRoaXMuJGluU2VsZWN0aW9uO1xuICAgIH1cbiAgICBcbiAgICAvKlxuICAgICAqIEdldCB0aGUgY2xpY2tlZCBtb3VzZSBidXR0b25cbiAgICAgKiBcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IDAgZm9yIGxlZnQgYnV0dG9uLCAxIGZvciBtaWRkbGUgYnV0dG9uLCAyIGZvciByaWdodCBidXR0b25cbiAgICAgKi9cbiAgICBnZXRCdXR0b24oKSB7XG4gICAgICAgIHJldHVybiBldmVudC5nZXRCdXR0b24odGhpcy5kb21FdmVudCk7XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn0gd2hldGhlciB0aGUgc2hpZnQga2V5IHdhcyBwcmVzc2VkIHdoZW4gdGhlIGV2ZW50IHdhcyBlbWl0dGVkXG4gICAgICovXG4gICAgZ2V0U2hpZnRLZXkoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvbUV2ZW50LnNoaWZ0S2V5O1xuICAgIH1cblxuICAgIGdldEFjY2VsS2V5ID0gdXNlckFnZW50LmlzTWFjID8gZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvbUV2ZW50Lm1ldGFLZXk7IH0gOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZG9tRXZlbnQuY3RybEtleTsgfTtcbn1cblxudmFyIERSQUdfT0ZGU0VUID0gMDsgLy8gcGl4ZWxzXG5cbmZ1bmN0aW9uIG1ha2VNb3VzZURvd25IYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihldjogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICB2YXIgaW5TZWxlY3Rpb24gPSBldi5pblNlbGVjdGlvbigpO1xuICAgICAgICB2YXIgcG9zID0gZXYuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuICAgICAgICBtb3VzZUhhbmRsZXIubW91c2Vkb3duRXZlbnQgPSBldjtcblxuICAgICAgICB2YXIgYnV0dG9uID0gZXYuZ2V0QnV0dG9uKCk7XG4gICAgICAgIGlmIChidXR0b24gIT09IDApIHtcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb25SYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkVtcHR5ID0gc2VsZWN0aW9uUmFuZ2UuaXNFbXB0eSgpO1xuXG4gICAgICAgICAgICBpZiAoc2VsZWN0aW9uRW1wdHkpXG4gICAgICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5tb3ZlVG9Qb3NpdGlvbihwb3MpO1xuXG4gICAgICAgICAgICAvLyAyOiBjb250ZXh0bWVudSwgMTogbGludXggcGFzdGVcbiAgICAgICAgICAgIGVkaXRvci50ZXh0SW5wdXQub25Db250ZXh0TWVudShldi5kb21FdmVudCk7XG4gICAgICAgICAgICByZXR1cm47IC8vIHN0b3BwaW5nIGV2ZW50IGhlcmUgYnJlYWtzIGNvbnRleHRtZW51IG9uIGZmIG1hY1xuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLm1vdXNlZG93bkV2ZW50LnRpbWUgPSBEYXRlLm5vdygpO1xuICAgICAgICAvLyBpZiB0aGlzIGNsaWNrIGNhdXNlZCB0aGUgZWRpdG9yIHRvIGJlIGZvY3VzZWQgc2hvdWxkIG5vdCBjbGVhciB0aGVcbiAgICAgICAgLy8gc2VsZWN0aW9uXG4gICAgICAgIGlmIChpblNlbGVjdGlvbiAmJiAhZWRpdG9yLmlzRm9jdXNlZCgpKSB7XG4gICAgICAgICAgICBlZGl0b3IuZm9jdXMoKTtcbiAgICAgICAgICAgIGlmIChtb3VzZUhhbmRsZXIuJGZvY3VzVGltb3V0ICYmICFtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uICYmICFlZGl0b3IuaW5NdWx0aVNlbGVjdE1vZGUpIHtcbiAgICAgICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJmb2N1c1dhaXRcIik7XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShldik7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShldik7XG4gICAgICAgIC8vIFRPRE86IF9jbGlja3MgaXMgYSBjdXN0b20gcHJvcGVydHkgYWRkZWQgaW4gZXZlbnQudHMgYnkgdGhlICdtb3VzZWRvd24nIGxpc3RlbmVyLlxuICAgICAgICBtb3VzZUhhbmRsZXIuc3RhcnRTZWxlY3QocG9zLCBldi5kb21FdmVudFsnX2NsaWNrcyddID4gMSk7XG4gICAgICAgIHJldHVybiBldi5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZU1vdXNlV2hlZWxIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihldjogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICBpZiAoZXYuZ2V0QWNjZWxLZXkoKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy9zaGlmdCB3aGVlbCB0byBob3JpeiBzY3JvbGxcbiAgICAgICAgaWYgKGV2LmdldFNoaWZ0S2V5KCkgJiYgZXYud2hlZWxZICYmICFldi53aGVlbFgpIHtcbiAgICAgICAgICAgIGV2LndoZWVsWCA9IGV2LndoZWVsWTtcbiAgICAgICAgICAgIGV2LndoZWVsWSA9IDA7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgdCA9IGV2LmRvbUV2ZW50LnRpbWVTdGFtcDtcbiAgICAgICAgdmFyIGR0ID0gdCAtIChtb3VzZUhhbmRsZXIuJGxhc3RTY3JvbGxUaW1lIHx8IDApO1xuXG4gICAgICAgIHZhciBpc1Njcm9sYWJsZSA9IGVkaXRvci5yZW5kZXJlci5pc1Njcm9sbGFibGVCeShldi53aGVlbFggKiBldi5zcGVlZCwgZXYud2hlZWxZICogZXYuc3BlZWQpO1xuICAgICAgICBpZiAoaXNTY3JvbGFibGUgfHwgZHQgPCAyMDApIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kbGFzdFNjcm9sbFRpbWUgPSB0O1xuICAgICAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEJ5KGV2LndoZWVsWCAqIGV2LnNwZWVkLCBldi53aGVlbFkgKiBldi5zcGVlZCk7XG4gICAgICAgICAgICByZXR1cm4gZXYuc3RvcCgpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlRG91YmxlQ2xpY2tIYW5kbGVyKGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgIHJldHVybiBmdW5jdGlvbihlZGl0b3JNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50KSB7XG4gICAgICAgIHZhciBwb3MgPSBlZGl0b3JNb3VzZUV2ZW50LmdldERvY3VtZW50UG9zaXRpb24oKTtcbiAgICAgICAgdmFyIHNlc3Npb24gPSBlZGl0b3Iuc2Vzc2lvbjtcblxuICAgICAgICB2YXIgcmFuZ2UgPSBzZXNzaW9uLmdldEJyYWNrZXRSYW5nZShwb3MpO1xuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4tLTtcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uKys7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RcIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZSA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0V29yZFJhbmdlKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QnlXb3Jkc1wiKTtcbiAgICAgICAgfVxuICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uID0gcmFuZ2U7XG4gICAgICAgIG1vdXNlSGFuZGxlci5zZWxlY3QoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VUcmlwbGVDbGlja0hhbmRsZXIoZWRpdG9yOiBFZGl0b3IsIG1vdXNlSGFuZGxlcjogTW91c2VIYW5kbGVyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGVkaXRvck1vdXNlRXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgdmFyIHBvcyA9IGVkaXRvck1vdXNlRXZlbnQuZ2V0RG9jdW1lbnRQb3NpdGlvbigpO1xuXG4gICAgICAgIG1vdXNlSGFuZGxlci5zZXRTdGF0ZShcInNlbGVjdEJ5TGluZXNcIik7XG4gICAgICAgIHZhciByYW5nZSA9IGVkaXRvci5nZXRTZWxlY3Rpb25SYW5nZSgpO1xuICAgICAgICBpZiAocmFuZ2UuaXNNdWx0aUxpbmUoKSAmJiByYW5nZS5jb250YWlucyhwb3Mucm93LCBwb3MuY29sdW1uKSkge1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJhbmdlLnN0YXJ0LnJvdyk7XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmVuZCA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJhbmdlLmVuZC5yb3cpLmVuZDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3Iuc2VsZWN0aW9uLmdldExpbmVSYW5nZShwb3Mucm93KTtcbiAgICAgICAgfVxuICAgICAgICBtb3VzZUhhbmRsZXIuc2VsZWN0KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBtYWtlUXVhZENsaWNrSGFuZGxlcihlZGl0b3I6IEVkaXRvciwgbW91c2VIYW5kbGVyOiBNb3VzZUhhbmRsZXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oZWRpdG9yTW91c2VFdmVudDogRWRpdG9yTW91c2VFdmVudCkge1xuICAgICAgICBlZGl0b3Iuc2VsZWN0QWxsKCk7XG4gICAgICAgIG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uUmFuZ2UoKTtcbiAgICAgICAgbW91c2VIYW5kbGVyLnNldFN0YXRlKFwic2VsZWN0QWxsXCIpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gbWFrZUV4dGVuZFNlbGVjdGlvbkJ5KGVkaXRvcjogRWRpdG9yLCBtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlciwgdW5pdE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFuY2hvcjtcbiAgICAgICAgdmFyIGN1cnNvciA9IG1vdXNlSGFuZGxlci50ZXh0Q29vcmRpbmF0ZXMoKTtcbiAgICAgICAgdmFyIHJhbmdlID0gZWRpdG9yLnNlbGVjdGlvblt1bml0TmFtZV0oY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24pIHtcbiAgICAgICAgICAgIHZhciBjbXBTdGFydCA9IG1vdXNlSGFuZGxlci4kY2xpY2tTZWxlY3Rpb24uY29tcGFyZVBvaW50KHJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgIHZhciBjbXBFbmQgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmNvbXBhcmVQb2ludChyYW5nZS5lbmQpO1xuXG4gICAgICAgICAgICBpZiAoY21wU3RhcnQgPT0gLTEgJiYgY21wRW5kIDw9IDApIHtcbiAgICAgICAgICAgICAgICBhbmNob3IgPSBtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLmVuZDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuZW5kLnJvdyAhPSBjdXJzb3Iucm93IHx8IHJhbmdlLmVuZC5jb2x1bW4gIT0gY3Vyc29yLmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXBFbmQgPT0gMSAmJiBjbXBTdGFydCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgYW5jaG9yID0gbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbi5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93ICE9IGN1cnNvci5yb3cgfHwgcmFuZ2Uuc3RhcnQuY29sdW1uICE9IGN1cnNvci5jb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIGN1cnNvciA9IHJhbmdlLmVuZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcFN0YXJ0ID09IC0xICYmIGNtcEVuZCA9PSAxKSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gcmFuZ2UuZW5kO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWVudGVkUmFuZ2UgPSBjYWxjUmFuZ2VPcmllbnRhdGlvbihtb3VzZUhhbmRsZXIuJGNsaWNrU2VsZWN0aW9uLCBjdXJzb3IpO1xuICAgICAgICAgICAgICAgIGN1cnNvciA9IG9yaWVudGVkUmFuZ2UuY3Vyc29yO1xuICAgICAgICAgICAgICAgIGFuY2hvciA9IG9yaWVudGVkUmFuZ2UuYW5jaG9yO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25BbmNob3IoYW5jaG9yLnJvdywgYW5jaG9yLmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgZWRpdG9yLnNlbGVjdGlvbi5zZWxlY3RUb1Bvc2l0aW9uKGN1cnNvcik7XG5cbiAgICAgICAgZWRpdG9yLnJlbmRlcmVyLnNjcm9sbEN1cnNvckludG9WaWV3KCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBjYWxjRGlzdGFuY2UoYXg6IG51bWJlciwgYXk6IG51bWJlciwgYng6IG51bWJlciwgYnk6IG51bWJlcikge1xuICAgIHJldHVybiBNYXRoLnNxcnQoTWF0aC5wb3coYnggLSBheCwgMikgKyBNYXRoLnBvdyhieSAtIGF5LCAyKSk7XG59XG5cbmZ1bmN0aW9uIGNhbGNSYW5nZU9yaWVudGF0aW9uKHJhbmdlOiBybmcuUmFuZ2UsIGN1cnNvcjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSk6IHsgY3Vyc29yOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9OyBhbmNob3I6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0gfSB7XG4gICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA9PSByYW5nZS5lbmQucm93KSB7XG4gICAgICAgIHZhciBjbXAgPSAyICogY3Vyc29yLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbiAtIHJhbmdlLmVuZC5jb2x1bW47XG4gICAgfVxuICAgIGVsc2UgaWYgKHJhbmdlLnN0YXJ0LnJvdyA9PSByYW5nZS5lbmQucm93IC0gMSAmJiAhcmFuZ2Uuc3RhcnQuY29sdW1uICYmICFyYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgIHZhciBjbXAgPSBjdXJzb3IuY29sdW1uIC0gNDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciBjbXAgPSAyICogY3Vyc29yLnJvdyAtIHJhbmdlLnN0YXJ0LnJvdyAtIHJhbmdlLmVuZC5yb3c7XG4gICAgfVxuXG4gICAgaWYgKGNtcCA8IDApIHtcbiAgICAgICAgcmV0dXJuIHsgY3Vyc29yOiByYW5nZS5zdGFydCwgYW5jaG9yOiByYW5nZS5lbmQgfTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJldHVybiB7IGN1cnNvcjogcmFuZ2UuZW5kLCBhbmNob3I6IHJhbmdlLnN0YXJ0IH07XG4gICAgfVxufVxuXG5jbGFzcyBHdXR0ZXJIYW5kbGVyIHtcbiAgICBjb25zdHJ1Y3Rvcihtb3VzZUhhbmRsZXI6IE1vdXNlSGFuZGxlcikge1xuICAgICAgICB2YXIgZWRpdG9yOiBFZGl0b3IgPSBtb3VzZUhhbmRsZXIuZWRpdG9yO1xuICAgICAgICB2YXIgZ3V0dGVyOiBndW0uR3V0dGVyID0gZWRpdG9yLnJlbmRlcmVyLiRndXR0ZXJMYXllcjtcbiAgICAgICAgdmFyIHRvb2x0aXAgPSBuZXcgR3V0dGVyVG9vbHRpcChlZGl0b3IuY29udGFpbmVyKTtcblxuICAgICAgICBtb3VzZUhhbmRsZXIuZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwiZ3V0dGVybW91c2Vkb3duXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghZWRpdG9yLmlzRm9jdXNlZCgpIHx8IGUuZ2V0QnV0dG9uKCkgIT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGd1dHRlclJlZ2lvbiA9IGd1dHRlci5nZXRSZWdpb24oZSk7XG5cbiAgICAgICAgICAgIGlmIChndXR0ZXJSZWdpb24gPT09IFwiZm9sZFdpZGdldHNcIikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHJvdyA9IGUuZ2V0RG9jdW1lbnRQb3NpdGlvbigpLnJvdztcbiAgICAgICAgICAgIHZhciBzZWxlY3Rpb24gPSBlZGl0b3Iuc2Vzc2lvbi5zZWxlY3Rpb247XG5cbiAgICAgICAgICAgIGlmIChlLmdldFNoaWZ0S2V5KCkpIHtcbiAgICAgICAgICAgICAgICBzZWxlY3Rpb24uc2VsZWN0VG8ocm93LCAwKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChlLmRvbUV2ZW50LmRldGFpbCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRvci5zZWxlY3RBbGwoKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbW91c2VIYW5kbGVyLiRjbGlja1NlbGVjdGlvbiA9IGVkaXRvci5zZWxlY3Rpb24uZ2V0TGluZVJhbmdlKHJvdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtb3VzZUhhbmRsZXIuc2V0U3RhdGUoXCJzZWxlY3RCeUxpbmVzXCIpO1xuICAgICAgICAgICAgbW91c2VIYW5kbGVyLmNhcHR1cmVNb3VzZShlKTtcbiAgICAgICAgICAgIHJldHVybiBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIH0pO1xuXG5cbiAgICAgICAgdmFyIHRvb2x0aXBUaW1lb3V0OiBudW1iZXI7XG4gICAgICAgIHZhciBtb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50O1xuICAgICAgICB2YXIgdG9vbHRpcEFubm90YXRpb247XG5cbiAgICAgICAgZnVuY3Rpb24gc2hvd1Rvb2x0aXAoKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gbW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCkucm93O1xuICAgICAgICAgICAgdmFyIGFubm90YXRpb24gPSBndXR0ZXIuJGFubm90YXRpb25zW3Jvd107XG4gICAgICAgICAgICBpZiAoIWFubm90YXRpb24pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaGlkZVRvb2x0aXAoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIG1heFJvdyA9IGVkaXRvci5zZXNzaW9uLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA9PSBtYXhSb3cpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2NyZWVuUm93ID0gZWRpdG9yLnJlbmRlcmVyLnBpeGVsVG9TY3JlZW5Db29yZGluYXRlcygwLCBtb3VzZUV2ZW50LmNsaWVudFkpLnJvdztcbiAgICAgICAgICAgICAgICB2YXIgcG9zID0gbW91c2VFdmVudC5nZXREb2N1bWVudFBvc2l0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHNjcmVlblJvdyA+IGVkaXRvci5zZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3cocG9zLnJvdywgcG9zLmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodG9vbHRpcEFubm90YXRpb24gPT0gYW5ub3RhdGlvbikge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRvb2x0aXBBbm5vdGF0aW9uID0gYW5ub3RhdGlvbi50ZXh0LmpvaW4oXCI8YnIvPlwiKTtcblxuICAgICAgICAgICAgdG9vbHRpcC5zZXRIdG1sKHRvb2x0aXBBbm5vdGF0aW9uKTtcblxuICAgICAgICAgICAgdG9vbHRpcC5zaG93KCk7XG5cbiAgICAgICAgICAgIGVkaXRvci5vbihcIm1vdXNld2hlZWxcIiwgaGlkZVRvb2x0aXApO1xuXG4gICAgICAgICAgICBpZiAobW91c2VIYW5kbGVyLiR0b29sdGlwRm9sbG93c01vdXNlKSB7XG4gICAgICAgICAgICAgICAgbW92ZVRvb2x0aXAobW91c2VFdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgZ3V0dGVyRWxlbWVudCA9IGd1dHRlci4kY2VsbHNbZWRpdG9yLnNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyhyb3csIDApXS5lbGVtZW50O1xuICAgICAgICAgICAgICAgIHZhciByZWN0ID0gZ3V0dGVyRWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgICAgICAgICAgICB2YXIgc3R5bGUgPSB0b29sdGlwLmdldEVsZW1lbnQoKS5zdHlsZTtcbiAgICAgICAgICAgICAgICBzdHlsZS5sZWZ0ID0gcmVjdC5yaWdodCArIFwicHhcIjtcbiAgICAgICAgICAgICAgICBzdHlsZS50b3AgPSByZWN0LmJvdHRvbSArIFwicHhcIjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGhpZGVUb29sdGlwKCkge1xuICAgICAgICAgICAgaWYgKHRvb2x0aXBUaW1lb3V0KSB7XG4gICAgICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRvb2x0aXBUaW1lb3V0KTtcbiAgICAgICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0b29sdGlwQW5ub3RhdGlvbikge1xuICAgICAgICAgICAgICAgIHRvb2x0aXAuaGlkZSgpO1xuICAgICAgICAgICAgICAgIHRvb2x0aXBBbm5vdGF0aW9uID0gbnVsbDtcbiAgICAgICAgICAgICAgICBlZGl0b3IucmVtb3ZlRXZlbnRMaXN0ZW5lcihcIm1vdXNld2hlZWxcIiwgaGlkZVRvb2x0aXApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gbW92ZVRvb2x0aXAoZXZlbnQ6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIHRvb2x0aXAuc2V0UG9zaXRpb24oZXZlbnQuY2xpZW50WCwgZXZlbnQuY2xpZW50WSk7XG4gICAgICAgIH1cblxuICAgICAgICBtb3VzZUhhbmRsZXIuZWRpdG9yLnNldERlZmF1bHRIYW5kbGVyKFwiZ3V0dGVybW91c2Vtb3ZlXCIsIGZ1bmN0aW9uKGU6IEVkaXRvck1vdXNlRXZlbnQpIHtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBPYmZ1c2NhdGluZyB0aGUgdHlwZSBvZiB0YXJnZXQgdG8gdGh3YXJ0IGNvbXBpbGVyLlxuICAgICAgICAgICAgdmFyIHRhcmdldDogYW55ID0gZS5kb21FdmVudC50YXJnZXQgfHwgZS5kb21FdmVudC5zcmNFbGVtZW50O1xuICAgICAgICAgICAgaWYgKGRvbS5oYXNDc3NDbGFzcyh0YXJnZXQsIFwiYWNlX2ZvbGQtd2lkZ2V0XCIpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGhpZGVUb29sdGlwKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0b29sdGlwQW5ub3RhdGlvbiAmJiBtb3VzZUhhbmRsZXIuJHRvb2x0aXBGb2xsb3dzTW91c2UpIHtcbiAgICAgICAgICAgICAgICBtb3ZlVG9vbHRpcChlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbW91c2VFdmVudCA9IGU7XG4gICAgICAgICAgICBpZiAodG9vbHRpcFRpbWVvdXQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChtb3VzZUV2ZW50ICYmICFtb3VzZUhhbmRsZXIuaXNNb3VzZVByZXNzZWQpXG4gICAgICAgICAgICAgICAgICAgIHNob3dUb29sdGlwKCk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBoaWRlVG9vbHRpcCgpO1xuICAgICAgICAgICAgfSwgNTApO1xuICAgICAgICB9KTtcblxuICAgICAgICBldmVudC5hZGRMaXN0ZW5lcihlZGl0b3IucmVuZGVyZXIuJGd1dHRlciwgXCJtb3VzZW91dFwiLCBmdW5jdGlvbihlOiBNb3VzZUV2ZW50KSB7XG4gICAgICAgICAgICBtb3VzZUV2ZW50ID0gbnVsbDtcbiAgICAgICAgICAgIGlmICghdG9vbHRpcEFubm90YXRpb24gfHwgdG9vbHRpcFRpbWVvdXQpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgICAgICB0b29sdGlwVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgdG9vbHRpcFRpbWVvdXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIGhpZGVUb29sdGlwKCk7XG4gICAgICAgICAgICB9LCA1MCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGVkaXRvci5vbihcImNoYW5nZVNlc3Npb25cIiwgaGlkZVRvb2x0aXApO1xuICAgIH1cbn1cblxuLyoqXG4gKiBAY2xhc3MgR3V0dGVyVG9vbHRpcFxuICogQGV4dGVuZHMgVG9vbHRpcFxuICovXG5jbGFzcyBHdXR0ZXJUb29sdGlwIGV4dGVuZHMgdHRtLlRvb2x0aXAge1xuICAgIGNvbnN0cnVjdG9yKHBhcmVudE5vZGU6IEhUTUxFbGVtZW50KSB7XG4gICAgICAgIHN1cGVyKHBhcmVudE5vZGUpO1xuICAgIH1cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldFBvc2l0aW9uXG4gICAgICogQHBhcmFtIHgge251bWJlcn1cbiAgICAgKiBAcGFyYW0geSB7bnVtYmVyfVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgc2V0UG9zaXRpb24oeDogbnVtYmVyLCB5OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdmFyIHdpbmRvd1dpZHRoID0gd2luZG93LmlubmVyV2lkdGggfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudFdpZHRoO1xuICAgICAgICB2YXIgd2luZG93SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQ7XG4gICAgICAgIHZhciB3aWR0aCA9IHRoaXMuZ2V0V2lkdGgoKTtcbiAgICAgICAgdmFyIGhlaWdodCA9IHRoaXMuZ2V0SGVpZ2h0KCk7XG4gICAgICAgIHggKz0gMTU7XG4gICAgICAgIHkgKz0gMTU7XG4gICAgICAgIGlmICh4ICsgd2lkdGggPiB3aW5kb3dXaWR0aCkge1xuICAgICAgICAgICAgeCAtPSAoeCArIHdpZHRoKSAtIHdpbmRvd1dpZHRoO1xuICAgICAgICB9XG4gICAgICAgIGlmICh5ICsgaGVpZ2h0ID4gd2luZG93SGVpZ2h0KSB7XG4gICAgICAgICAgICB5IC09IDIwICsgaGVpZ2h0O1xuICAgICAgICB9XG4gICAgICAgIHN1cGVyLnNldFBvc2l0aW9uKHgsIHkpO1xuICAgIH1cbn1cbiJdfQ==