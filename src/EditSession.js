import { delayedCall, stringRepeat } from "./lib/lang";
import { defineOptions, resetOptions } from "./config";
import EventEmitterClass from "./lib/EventEmitterClass";
import FoldLine from "./FoldLine";
import Fold from "./Fold";
import Selection from "./Selection";
import Range from "./Range";
import Document from "./Document";
import BackgroundTokenizer from "./BackgroundTokenizer";
import SearchHighlight from "./SearchHighlight";
import { assert } from './lib/asserts';
import BracketMatch from "./BracketMatch";
import TokenIterator from './TokenIterator';
import TextMode from "./mode/TextMode";
var CHAR = 1, CHAR_EXT = 2, PLACEHOLDER_START = 3, PLACEHOLDER_BODY = 4, PUNCTUATION = 9, SPACE = 10, TAB = 11, TAB_SPACE = 12;
function isFullWidth(c) {
    if (c < 0x1100)
        return false;
    return c >= 0x1100 && c <= 0x115F ||
        c >= 0x11A3 && c <= 0x11A7 ||
        c >= 0x11FA && c <= 0x11FF ||
        c >= 0x2329 && c <= 0x232A ||
        c >= 0x2E80 && c <= 0x2E99 ||
        c >= 0x2E9B && c <= 0x2EF3 ||
        c >= 0x2F00 && c <= 0x2FD5 ||
        c >= 0x2FF0 && c <= 0x2FFB ||
        c >= 0x3000 && c <= 0x303E ||
        c >= 0x3041 && c <= 0x3096 ||
        c >= 0x3099 && c <= 0x30FF ||
        c >= 0x3105 && c <= 0x312D ||
        c >= 0x3131 && c <= 0x318E ||
        c >= 0x3190 && c <= 0x31BA ||
        c >= 0x31C0 && c <= 0x31E3 ||
        c >= 0x31F0 && c <= 0x321E ||
        c >= 0x3220 && c <= 0x3247 ||
        c >= 0x3250 && c <= 0x32FE ||
        c >= 0x3300 && c <= 0x4DBF ||
        c >= 0x4E00 && c <= 0xA48C ||
        c >= 0xA490 && c <= 0xA4C6 ||
        c >= 0xA960 && c <= 0xA97C ||
        c >= 0xAC00 && c <= 0xD7A3 ||
        c >= 0xD7B0 && c <= 0xD7C6 ||
        c >= 0xD7CB && c <= 0xD7FB ||
        c >= 0xF900 && c <= 0xFAFF ||
        c >= 0xFE10 && c <= 0xFE19 ||
        c >= 0xFE30 && c <= 0xFE52 ||
        c >= 0xFE54 && c <= 0xFE66 ||
        c >= 0xFE68 && c <= 0xFE6B ||
        c >= 0xFF01 && c <= 0xFF60 ||
        c >= 0xFFE0 && c <= 0xFFE6;
}
export default class EditSession {
    constructor(doc) {
        this.$breakpoints = [];
        this.$decorations = [];
        this.$frontMarkers = {};
        this.$backMarkers = {};
        this.$markerId = 1;
        this.$undoSelect = true;
        this.$defaultUndoManager = { undo: function () { }, redo: function () { }, reset: function () { } };
        this.$overwrite = false;
        this.$modes = {};
        this.$mode = null;
        this.$modeId = null;
        this.$scrollTop = 0;
        this.$scrollLeft = 0;
        this.$wrapLimit = 80;
        this.$useWrapMode = false;
        this.$wrapLimitRange = {
            min: null,
            max: null
        };
        this.$onChange = this.onChange.bind(this);
        this.lineWidgets = null;
        this.$selectionMarker = null;
        this.$bracketMatcher = new BracketMatch(this);
        this.$foldStyles = {
            "manual": 1,
            "markbegin": 1,
            "markbeginend": 1
        };
        this.$foldStyle = "markbegin";
        if (!(doc instanceof Document)) {
            throw new TypeError('doc must be an Document');
        }
        this.eventBus = new EventEmitterClass(this);
        this.$foldData = [];
        this.$foldData.toString = function () {
            return this.join("\n");
        };
        this.eventBus.on("changeFold", this.onChangeFold.bind(this));
        this.setDocument(doc);
        this.selection = new Selection(this);
        resetOptions(this);
        this.setLanguageMode(new TextMode('', []));
    }
    on(eventName, callback) {
        this.eventBus.on(eventName, callback, false);
    }
    off(eventName, callback) {
        this.eventBus.off(eventName, callback);
    }
    _emit(eventName, event) {
        this.eventBus._emit(eventName, event);
    }
    _signal(eventName, event) {
        this.eventBus._signal(eventName, event);
    }
    setDocument(doc) {
        if (!(doc instanceof Document)) {
            throw new Error("doc must be a Document");
        }
        if (this.doc) {
            this.doc.off("change", this.$onChange);
        }
        this.doc = doc;
        doc.on("change", this.$onChange);
        if (this.bgTokenizer) {
            this.bgTokenizer.setDocument(this.getDocument());
        }
        this.resetCaches();
    }
    getDocument() {
        return this.doc;
    }
    $resetRowCache(docRow) {
        if (!docRow) {
            this.$docRowCache = [];
            this.$screenRowCache = [];
            return;
        }
        var l = this.$docRowCache.length;
        var i = this.$getRowCacheIndex(this.$docRowCache, docRow) + 1;
        if (l > i) {
            this.$docRowCache.splice(i, l);
            this.$screenRowCache.splice(i, l);
        }
    }
    $getRowCacheIndex(cacheArray, val) {
        var low = 0;
        var hi = cacheArray.length - 1;
        while (low <= hi) {
            var mid = (low + hi) >> 1;
            var c = cacheArray[mid];
            if (val > c) {
                low = mid + 1;
            }
            else if (val < c) {
                hi = mid - 1;
            }
            else {
                return mid;
            }
        }
        return low - 1;
    }
    resetCaches() {
        this.$modified = true;
        this.$wrapData = [];
        this.$rowLengthCache = [];
        this.$resetRowCache(0);
        if (this.bgTokenizer) {
            this.bgTokenizer.start(0);
        }
    }
    onChangeFold(event) {
        var fold = event.data;
        this.$resetRowCache(fold.start.row);
    }
    onChange(event, doc) {
        var delta = event.data;
        this.$modified = true;
        this.$resetRowCache(delta.range.start.row);
        var removedFolds = this.$updateInternalDataOnChange(event);
        if (!this.$fromUndo && this.$undoManager && !delta.ignore) {
            this.$deltasDoc.push(delta);
            if (removedFolds && removedFolds.length != 0) {
                this.$deltasFold.push({
                    action: "removeFolds",
                    folds: removedFolds
                });
            }
            this.$informUndoManager.schedule();
        }
        if (this.bgTokenizer) {
            this.bgTokenizer.updateOnChange(delta);
        }
        this.eventBus._signal("change", event);
    }
    setValue(text) {
        this.doc.setValue(text);
        this.selection.moveTo(0, 0);
        this.$resetRowCache(0);
        this.$deltas = [];
        this.$deltasDoc = [];
        this.$deltasFold = [];
        this.setUndoManager(this.$undoManager);
        this.getUndoManager().reset();
    }
    toString() {
        return this.getValue();
    }
    getValue() {
        return this.doc.getValue();
    }
    getSelection() {
        return this.selection;
    }
    setSelection(selection) {
        this.selection = selection;
    }
    getState(row) {
        if (this.bgTokenizer) {
            return this.bgTokenizer.getState(row);
        }
        else {
            return void 0;
        }
    }
    getTokens(row) {
        if (this.bgTokenizer) {
            return this.bgTokenizer.getTokens(row);
        }
        else {
            return void 0;
        }
    }
    getTokenAt(row, column) {
        if (this.bgTokenizer) {
            var tokens = this.bgTokenizer.getTokens(row);
            var token;
            var c = 0;
            if (column == null) {
                i = tokens.length - 1;
                c = this.getLine(row).length;
            }
            else {
                for (var i = 0; i < tokens.length; i++) {
                    c += tokens[i].value.length;
                    if (c >= column)
                        break;
                }
            }
            token = tokens[i];
            if (!token)
                return null;
            token.index = i;
            token.start = c - token.value.length;
            return token;
        }
        else {
            return void 0;
        }
    }
    setUndoManager(undoManager) {
        this.$undoManager = undoManager;
        this.$deltas = [];
        this.$deltasDoc = [];
        this.$deltasFold = [];
        if (this.$informUndoManager)
            this.$informUndoManager.cancel();
        if (undoManager) {
            var self = this;
            this.$syncInformUndoManager = function () {
                self.$informUndoManager.cancel();
                if (self.$deltasFold.length) {
                    self.$deltas.push({
                        group: "fold",
                        deltas: self.$deltasFold
                    });
                    self.$deltasFold = [];
                }
                if (self.$deltasDoc.length) {
                    self.$deltas.push({
                        group: "doc",
                        deltas: self.$deltasDoc
                    });
                    self.$deltasDoc = [];
                }
                if (self.$deltas.length > 0) {
                    undoManager.execute({
                        action: "aceupdate",
                        args: [self.$deltas, self],
                        merge: self.mergeUndoDeltas
                    });
                }
                self.mergeUndoDeltas = false;
                self.$deltas = [];
            };
            this.$informUndoManager = delayedCall(this.$syncInformUndoManager);
        }
    }
    markUndoGroup() {
        if (this.$syncInformUndoManager) {
            this.$syncInformUndoManager();
        }
    }
    getUndoManager() {
        return this.$undoManager || this.$defaultUndoManager;
    }
    getTabString() {
        if (this.getUseSoftTabs()) {
            return stringRepeat(" ", this.getTabSize());
        }
        else {
            return "\t";
        }
    }
    setUseSoftTabs(useSoftTabs) {
        this.setOption("useSoftTabs", useSoftTabs);
        return this;
    }
    getUseSoftTabs() {
        return this.$useSoftTabs && !this.$mode.$indentWithTabs;
    }
    setTabSize(tabSize) {
        this.setOption("tabSize", tabSize);
    }
    getTabSize() {
        return this.$tabSize;
    }
    isTabStop(position) {
        return this.$useSoftTabs && (position.column % this.$tabSize === 0);
    }
    setOverwrite(overwrite) {
        this.setOption("overwrite", overwrite);
    }
    getOverwrite() {
        return this.$overwrite;
    }
    toggleOverwrite() {
        this.setOverwrite(!this.$overwrite);
    }
    addGutterDecoration(row, className) {
        if (!this.$decorations[row]) {
            this.$decorations[row] = "";
        }
        this.$decorations[row] += " " + className;
        this.eventBus._signal("changeBreakpoint", {});
    }
    removeGutterDecoration(row, className) {
        this.$decorations[row] = (this.$decorations[row] || "").replace(" " + className, "");
        this.eventBus._signal("changeBreakpoint", {});
    }
    getBreakpoints() {
        return this.$breakpoints;
    }
    setBreakpoints(rows) {
        this.$breakpoints = [];
        for (var i = 0; i < rows.length; i++) {
            this.$breakpoints[rows[i]] = "ace_breakpoint";
        }
        this.eventBus._signal("changeBreakpoint", {});
    }
    clearBreakpoints() {
        this.$breakpoints = [];
        this.eventBus._signal("changeBreakpoint", {});
    }
    setBreakpoint(row, className) {
        if (className === undefined)
            className = "ace_breakpoint";
        if (className)
            this.$breakpoints[row] = className;
        else
            delete this.$breakpoints[row];
        this.eventBus._signal("changeBreakpoint", {});
    }
    clearBreakpoint(row) {
        delete this.$breakpoints[row];
        this.eventBus._signal("changeBreakpoint", {});
    }
    addMarker(range, clazz, type, inFront) {
        var id = this.$markerId++;
        var marker = {
            range: range,
            type: type || "line",
            renderer: typeof type === "function" ? type : null,
            clazz: clazz,
            inFront: !!inFront,
            id: id
        };
        if (inFront) {
            this.$frontMarkers[id] = marker;
            this.eventBus._signal("changeFrontMarker");
        }
        else {
            this.$backMarkers[id] = marker;
            this.eventBus._signal("changeBackMarker");
        }
        return id;
    }
    addDynamicMarker(marker, inFront) {
        if (!marker.update) {
            return;
        }
        var id = this.$markerId++;
        marker.id = id;
        marker.inFront = !!inFront;
        if (inFront) {
            this.$frontMarkers[id] = marker;
            this.eventBus._signal("changeFrontMarker");
        }
        else {
            this.$backMarkers[id] = marker;
            this.eventBus._signal("changeBackMarker");
        }
        return marker;
    }
    removeMarker(markerId) {
        var marker = this.$frontMarkers[markerId] || this.$backMarkers[markerId];
        if (!marker)
            return;
        var markers = marker.inFront ? this.$frontMarkers : this.$backMarkers;
        if (marker) {
            delete (markers[markerId]);
            this.eventBus._signal(marker.inFront ? "changeFrontMarker" : "changeBackMarker");
        }
    }
    getMarkers(inFront) {
        return inFront ? this.$frontMarkers : this.$backMarkers;
    }
    highlight(re) {
        if (!this.$searchHighlight) {
            var highlight = new SearchHighlight(null, "ace_selected-word", "text");
            this.addDynamicMarker(highlight);
            this.$searchHighlight = highlight;
        }
        this.$searchHighlight.setRegexp(re);
    }
    highlightLines(startRow, endRow, clazz = "ace_step", inFront) {
        var range = new Range(startRow, 0, endRow, Infinity);
        range.markerId = this.addMarker(range, clazz, "fullLine", inFront);
        return range;
    }
    setAnnotations(annotations) {
        this.$annotations = annotations;
        this.eventBus._signal("changeAnnotation", {});
    }
    getAnnotations() {
        return this.$annotations || [];
    }
    clearAnnotations() {
        this.setAnnotations([]);
    }
    $detectNewLine(text) {
        var match = text.match(/^.*?(\r?\n)/m);
        if (match) {
            this.$autoNewLine = match[1];
        }
        else {
            this.$autoNewLine = "\n";
        }
    }
    getWordRange(row, column) {
        var line = this.getLine(row);
        var inToken = false;
        if (column > 0)
            inToken = !!line.charAt(column - 1).match(this.tokenRe);
        if (!inToken)
            inToken = !!line.charAt(column).match(this.tokenRe);
        if (inToken)
            var re = this.tokenRe;
        else if (/^\s+$/.test(line.slice(column - 1, column + 1)))
            var re = /\s/;
        else
            var re = this.nonTokenRe;
        var start = column;
        if (start > 0) {
            do {
                start--;
            } while (start >= 0 && line.charAt(start).match(re));
            start++;
        }
        var end = column;
        while (end < line.length && line.charAt(end).match(re)) {
            end++;
        }
        return new Range(row, start, row, end);
    }
    getAWordRange(row, column) {
        var wordRange = this.getWordRange(row, column);
        var line = this.getLine(wordRange.end.row);
        while (line.charAt(wordRange.end.column).match(/[ \t]/)) {
            wordRange.end.column += 1;
        }
        return wordRange;
    }
    setNewLineMode(newLineMode) {
        this.doc.setNewLineMode(newLineMode);
    }
    getNewLineMode() {
        return this.doc.getNewLineMode();
    }
    setUseWorker(useWorker) {
        this.setOption("useWorker", useWorker);
    }
    getUseWorker() { return this.$useWorker; }
    onReloadTokenizer(e) {
        var rows = e.data;
        this.bgTokenizer.start(rows.first);
        this.eventBus._signal("tokenizerUpdate", e);
    }
    setLanguageMode(mode) {
        return this.$onChangeMode(mode, false);
    }
    setMode(modeName) {
        this.importMode(modeName)
            .then(mode => this.setLanguageMode(mode))
            .catch(function (reason) {
            throw new Error(`setMode failed. Reason: ${reason}`);
        });
    }
    importMode(modeName, options) {
        if (typeof modeName !== 'string') {
            throw new TypeError("modeName must be a string");
        }
        if (!this.$mode) {
            this.$onChangeMode(new TextMode('', []), true);
        }
        var self = this;
        return new Promise(function (success, fail) {
            if (self.$modes[modeName] && !options) {
                success(self.$modes[modeName]);
            }
            else {
                if (self.$modes[modeName] && !options) {
                    success(self.$modes[modeName]);
                }
                System.import(modeName)
                    .then(function (m) {
                    if (m && m.default) {
                        var newMode = new m.default(options);
                        success(newMode);
                    }
                    else {
                        fail(new Error(`${modeName} does not define a default export (a LanguageMode class).`));
                    }
                }).catch(function (reason) {
                    fail(reason);
                });
            }
        });
    }
    $onChangeMode(mode, isPlaceholder) {
        if (!isPlaceholder) {
            this.$modeId = mode.$id;
        }
        if (this.$mode === mode) {
            return;
        }
        this.$mode = mode;
        this.$stopWorker();
        if (this.$useWorker) {
            this.$startWorker();
        }
        var tokenizer = mode.getTokenizer();
        if (tokenizer['addEventListener'] !== undefined) {
            var onReloadTokenizer = this.onReloadTokenizer.bind(this);
            tokenizer['addEventListener']("update", onReloadTokenizer);
        }
        if (!this.bgTokenizer) {
            this.bgTokenizer = new BackgroundTokenizer(tokenizer, this);
            this.bgTokenizer.on("update", (event, bg) => {
                this.eventBus._signal("tokenizerUpdate", event);
            });
        }
        else {
            this.bgTokenizer.setTokenizer(tokenizer);
        }
        this.bgTokenizer.setDocument(this.getDocument());
        this.tokenRe = mode.tokenRe;
        this.nonTokenRe = mode.nonTokenRe;
        if (!isPlaceholder) {
            this.$options.wrapMethod.set.call(this, this.$wrapMethod);
            this.$setFolding(mode.foldingRules);
            this.bgTokenizer.start(0);
            this.eventBus._emit("changeMode");
        }
    }
    $stopWorker() {
        if (this.$worker) {
            this.$worker.terminate();
        }
        this.$worker = null;
    }
    $startWorker() {
        try {
            this.$mode.createWorker(this)
                .then(worker => {
                this.$worker = worker;
            })
                .catch(function (e) {
                console.warn(`${e}`);
            });
        }
        catch (e) {
            this.$worker = null;
        }
    }
    getMode() {
        return this.$mode;
    }
    setScrollTop(scrollTop) {
        if (this.$scrollTop === scrollTop || isNaN(scrollTop)) {
            return;
        }
        this.$scrollTop = scrollTop;
        this.eventBus._signal("changeScrollTop", scrollTop);
    }
    getScrollTop() {
        return this.$scrollTop;
    }
    setScrollLeft(scrollLeft) {
        if (this.$scrollLeft === scrollLeft || isNaN(scrollLeft))
            return;
        this.$scrollLeft = scrollLeft;
        this.eventBus._signal("changeScrollLeft", scrollLeft);
    }
    getScrollLeft() {
        return this.$scrollLeft;
    }
    getScreenWidth() {
        this.$computeWidth();
        if (this.lineWidgets)
            return Math.max(this.getLineWidgetMaxWidth(), this.screenWidth);
        return this.screenWidth;
    }
    getLineWidgetMaxWidth() {
        if (this.lineWidgetsWidth != null)
            return this.lineWidgetsWidth;
        var width = 0;
        this.lineWidgets.forEach(function (w) {
            if (w && w.screenWidth > width)
                width = w.screenWidth;
        });
        return this.lineWidgetWidth = width;
    }
    $computeWidth(force) {
        if (this.$modified || force) {
            this.$modified = false;
            if (this.$useWrapMode) {
                return this.screenWidth = this.$wrapLimit;
            }
            var lines = this.doc.getAllLines();
            var cache = this.$rowLengthCache;
            var longestScreenLine = 0;
            var foldIndex = 0;
            var foldLine = this.$foldData[foldIndex];
            var foldStart = foldLine ? foldLine.start.row : Infinity;
            var len = lines.length;
            for (var i = 0; i < len; i++) {
                if (i > foldStart) {
                    i = foldLine.end.row + 1;
                    if (i >= len)
                        break;
                    foldLine = this.$foldData[foldIndex++];
                    foldStart = foldLine ? foldLine.start.row : Infinity;
                }
                if (cache[i] == null)
                    cache[i] = this.$getStringScreenWidth(lines[i])[0];
                if (cache[i] > longestScreenLine)
                    longestScreenLine = cache[i];
            }
            this.screenWidth = longestScreenLine;
        }
    }
    getLine(row) {
        return this.doc.getLine(row);
    }
    getLines(firstRow, lastRow) {
        return this.doc.getLines(firstRow, lastRow);
    }
    getLength() {
        return this.doc.getLength();
    }
    getTextRange(range) {
        return this.doc.getTextRange(range || this.selection.getRange());
    }
    insert(position, text) {
        return this.doc.insert(position, text);
    }
    remove(range) {
        return this.doc.remove(range);
    }
    undoChanges(deltas, dontSelect) {
        if (!deltas.length)
            return;
        this.$fromUndo = true;
        var lastUndoRange = null;
        for (var i = deltas.length - 1; i != -1; i--) {
            var delta = deltas[i];
            if (delta.group === "doc") {
                this.doc.revertDeltas(delta.deltas);
                lastUndoRange =
                    this.$getUndoSelection(delta.deltas, true, lastUndoRange);
            }
            else {
                delta.deltas.forEach((foldDelta) => {
                    this.addFolds(foldDelta.folds);
                }, this);
            }
        }
        this.$fromUndo = false;
        lastUndoRange &&
            this.$undoSelect &&
            !dontSelect &&
            this.selection.setSelectionRange(lastUndoRange);
        return lastUndoRange;
    }
    redoChanges(deltas, dontSelect) {
        if (!deltas.length)
            return;
        this.$fromUndo = true;
        var lastUndoRange = null;
        for (var i = 0; i < deltas.length; i++) {
            var delta = deltas[i];
            if (delta.group == "doc") {
                this.doc.applyDeltas(delta.deltas);
                lastUndoRange =
                    this.$getUndoSelection(delta.deltas, false, lastUndoRange);
            }
        }
        this.$fromUndo = false;
        lastUndoRange &&
            this.$undoSelect &&
            !dontSelect &&
            this.selection.setSelectionRange(lastUndoRange);
        return lastUndoRange;
    }
    setUndoSelect(enable) {
        this.$undoSelect = enable;
    }
    $getUndoSelection(deltas, isUndo, lastUndoRange) {
        function isInsert(delta) {
            var insert = delta.action === "insertText" || delta.action === "insertLines";
            return isUndo ? !insert : insert;
        }
        var delta = deltas[0];
        var range;
        var point;
        var lastDeltaIsInsert = false;
        if (isInsert(delta)) {
            range = Range.fromPoints(delta.range.start, delta.range.end);
            lastDeltaIsInsert = true;
        }
        else {
            range = Range.fromPoints(delta.range.start, delta.range.start);
            lastDeltaIsInsert = false;
        }
        for (var i = 1; i < deltas.length; i++) {
            delta = deltas[i];
            if (isInsert(delta)) {
                point = delta.range.start;
                if (range.compare(point.row, point.column) === -1) {
                    range.setStart(delta.range.start.row, delta.range.start.column);
                }
                point = delta.range.end;
                if (range.compare(point.row, point.column) === 1) {
                    range.setEnd(delta.range.end.row, delta.range.end.column);
                }
                lastDeltaIsInsert = true;
            }
            else {
                point = delta.range.start;
                if (range.compare(point.row, point.column) === -1) {
                    range = Range.fromPoints(delta.range.start, delta.range.start);
                }
                lastDeltaIsInsert = false;
            }
        }
        if (lastUndoRange != null) {
            if (Range.comparePoints(lastUndoRange.start, range.start) === 0) {
                lastUndoRange.start.column += range.end.column - range.start.column;
                lastUndoRange.end.column += range.end.column - range.start.column;
            }
            var cmp = lastUndoRange.compareRange(range);
            if (cmp === 1) {
                range.setStart(lastUndoRange.start.row, lastUndoRange.start.column);
            }
            else if (cmp === -1) {
                range.setEnd(lastUndoRange.end.row, lastUndoRange.start.column);
            }
        }
        return range;
    }
    replace(range, text) {
        return this.doc.replace(range, text);
    }
    moveText(fromRange, toPosition, copy) {
        var text = this.getTextRange(fromRange);
        var folds = this.getFoldsInRange(fromRange);
        var rowDiff;
        var colDiff;
        var toRange = Range.fromPoints(toPosition, toPosition);
        if (!copy) {
            this.remove(fromRange);
            rowDiff = fromRange.start.row - fromRange.end.row;
            colDiff = rowDiff ? -fromRange.end.column : fromRange.start.column - fromRange.end.column;
            if (colDiff) {
                if (toRange.start.row == fromRange.end.row && toRange.start.column > fromRange.end.column) {
                    toRange.start.column += colDiff;
                }
                if (toRange.end.row == fromRange.end.row && toRange.end.column > fromRange.end.column) {
                    toRange.end.column += colDiff;
                }
            }
            if (rowDiff && toRange.start.row >= fromRange.end.row) {
                toRange.start.row += rowDiff;
                toRange.end.row += rowDiff;
            }
        }
        toRange.end = this.insert(toRange.start, text);
        if (folds.length) {
            var oldStart = fromRange.start;
            var newStart = toRange.start;
            rowDiff = newStart.row - oldStart.row;
            colDiff = newStart.column - oldStart.column;
            this.addFolds(folds.map(function (x) {
                x = x.clone();
                if (x.start.row == oldStart.row) {
                    x.start.column += colDiff;
                }
                if (x.end.row == oldStart.row) {
                    x.end.column += colDiff;
                }
                x.start.row += rowDiff;
                x.end.row += rowDiff;
                return x;
            }));
        }
        return toRange;
    }
    indentRows(startRow, endRow, indentString) {
        indentString = indentString.replace(/\t/g, this.getTabString());
        for (var row = startRow; row <= endRow; row++)
            this.insert({ row: row, column: 0 }, indentString);
    }
    outdentRows(range) {
        var rowRange = range.collapseRows();
        var deleteRange = new Range(0, 0, 0, 0);
        var size = this.getTabSize();
        for (var i = rowRange.start.row; i <= rowRange.end.row; ++i) {
            var line = this.getLine(i);
            deleteRange.start.row = i;
            deleteRange.end.row = i;
            for (var j = 0; j < size; ++j)
                if (line.charAt(j) != ' ')
                    break;
            if (j < size && line.charAt(j) == '\t') {
                deleteRange.start.column = j;
                deleteRange.end.column = j + 1;
            }
            else {
                deleteRange.start.column = 0;
                deleteRange.end.column = j;
            }
            this.remove(deleteRange);
        }
    }
    $moveLines(firstRow, lastRow, dir) {
        firstRow = this.getRowFoldStart(firstRow);
        lastRow = this.getRowFoldEnd(lastRow);
        if (dir < 0) {
            var row = this.getRowFoldStart(firstRow + dir);
            if (row < 0)
                return 0;
            var diff = row - firstRow;
        }
        else if (dir > 0) {
            var row = this.getRowFoldEnd(lastRow + dir);
            if (row > this.doc.getLength() - 1)
                return 0;
            var diff = row - lastRow;
        }
        else {
            firstRow = this.$clipRowToDocument(firstRow);
            lastRow = this.$clipRowToDocument(lastRow);
            var diff = lastRow - firstRow + 1;
        }
        var range = new Range(firstRow, 0, lastRow, Number.MAX_VALUE);
        var folds = this.getFoldsInRange(range).map(function (x) {
            x = x.clone();
            x.start.row += diff;
            x.end.row += diff;
            return x;
        });
        var lines = (dir === 0) ? this.doc.getLines(firstRow, lastRow) : this.doc.removeLines(firstRow, lastRow);
        this.doc.insertLines(firstRow + diff, lines);
        folds.length && this.addFolds(folds);
        return diff;
    }
    moveLinesUp(firstRow, lastRow) {
        return this.$moveLines(firstRow, lastRow, -1);
    }
    moveLinesDown(firstRow, lastRow) {
        return this.$moveLines(firstRow, lastRow, 1);
    }
    duplicateLines(firstRow, lastRow) {
        return this.$moveLines(firstRow, lastRow, 0);
    }
    $clipRowToDocument(row) {
        return Math.max(0, Math.min(row, this.doc.getLength() - 1));
    }
    $clipColumnToRow(row, column) {
        if (column < 0)
            return 0;
        return Math.min(this.doc.getLine(row).length, column);
    }
    $clipPositionToDocument(row, column) {
        column = Math.max(0, column);
        if (row < 0) {
            row = 0;
            column = 0;
        }
        else {
            var len = this.doc.getLength();
            if (row >= len) {
                row = len - 1;
                column = this.doc.getLine(len - 1).length;
            }
            else {
                column = Math.min(this.doc.getLine(row).length, column);
            }
        }
        return {
            row: row,
            column: column
        };
    }
    $clipRangeToDocument(range) {
        if (range.start.row < 0) {
            range.start.row = 0;
            range.start.column = 0;
        }
        else {
            range.start.column = this.$clipColumnToRow(range.start.row, range.start.column);
        }
        var len = this.doc.getLength() - 1;
        if (range.end.row > len) {
            range.end.row = len;
            range.end.column = this.doc.getLine(len).length;
        }
        else {
            range.end.column = this.$clipColumnToRow(range.end.row, range.end.column);
        }
        return range;
    }
    setUseWrapMode(useWrapMode) {
        if (useWrapMode != this.$useWrapMode) {
            this.$useWrapMode = useWrapMode;
            this.$modified = true;
            this.$resetRowCache(0);
            if (useWrapMode) {
                var len = this.getLength();
                this.$wrapData = Array(len);
                this.$updateWrapData(0, len - 1);
            }
            this.eventBus._signal("changeWrapMode");
        }
    }
    getUseWrapMode() {
        return this.$useWrapMode;
    }
    setWrapLimitRange(min, max) {
        if (this.$wrapLimitRange.min !== min || this.$wrapLimitRange.max !== max) {
            this.$wrapLimitRange = {
                min: min,
                max: max
            };
            this.$modified = true;
            this.eventBus._signal("changeWrapMode");
        }
    }
    adjustWrapLimit(desiredLimit, $printMargin) {
        var limits = this.$wrapLimitRange;
        if (limits.max < 0)
            limits = { min: $printMargin, max: $printMargin };
        var wrapLimit = this.$constrainWrapLimit(desiredLimit, limits.min, limits.max);
        if (wrapLimit != this.$wrapLimit && wrapLimit > 1) {
            this.$wrapLimit = wrapLimit;
            this.$modified = true;
            if (this.$useWrapMode) {
                this.$updateWrapData(0, this.getLength() - 1);
                this.$resetRowCache(0);
                this.eventBus._signal("changeWrapLimit");
            }
            return true;
        }
        return false;
    }
    $constrainWrapLimit(wrapLimit, min, max) {
        if (min)
            wrapLimit = Math.max(min, wrapLimit);
        if (max)
            wrapLimit = Math.min(max, wrapLimit);
        return wrapLimit;
    }
    getWrapLimit() {
        return this.$wrapLimit;
    }
    setWrapLimit(limit) {
        this.setWrapLimitRange(limit, limit);
    }
    getWrapLimitRange() {
        return {
            min: this.$wrapLimitRange.min,
            max: this.$wrapLimitRange.max
        };
    }
    $updateInternalDataOnChange(e) {
        var useWrapMode = this.$useWrapMode;
        var len;
        var action = e.data.action;
        var firstRow = e.data.range.start.row;
        var lastRow = e.data.range.end.row;
        var start = e.data.range.start;
        var end = e.data.range.end;
        var removedFolds = null;
        if (action.indexOf("Lines") != -1) {
            if (action == "insertLines") {
                lastRow = firstRow + (e.data.lines.length);
            }
            else {
                lastRow = firstRow;
            }
            len = e.data.lines ? e.data.lines.length : lastRow - firstRow;
        }
        else {
            len = lastRow - firstRow;
        }
        this.$updating = true;
        if (len != 0) {
            if (action.indexOf("remove") != -1) {
                this[useWrapMode ? "$wrapData" : "$rowLengthCache"].splice(firstRow, len);
                var foldLines = this.$foldData;
                removedFolds = this.getFoldsInRange(e.data.range);
                this.removeFolds(removedFolds);
                var foldLine = this.getFoldLine(end.row);
                var idx = 0;
                if (foldLine) {
                    foldLine.addRemoveChars(end.row, end.column, start.column - end.column);
                    foldLine.shiftRow(-len);
                    var foldLineBefore = this.getFoldLine(firstRow);
                    if (foldLineBefore && foldLineBefore !== foldLine) {
                        foldLineBefore.merge(foldLine);
                        foldLine = foldLineBefore;
                    }
                    idx = foldLines.indexOf(foldLine) + 1;
                }
                for (idx; idx < foldLines.length; idx++) {
                    var foldLine = foldLines[idx];
                    if (foldLine.start.row >= end.row) {
                        foldLine.shiftRow(-len);
                    }
                }
                lastRow = firstRow;
            }
            else {
                var args = Array(len);
                args.unshift(firstRow, 0);
                var arr = useWrapMode ? this.$wrapData : this.$rowLengthCache;
                arr.splice.apply(arr, args);
                var foldLines = this.$foldData;
                var foldLine = this.getFoldLine(firstRow);
                var idx = 0;
                if (foldLine) {
                    var cmp = foldLine.range.compareInside(start.row, start.column);
                    if (cmp == 0) {
                        foldLine = foldLine.split(start.row, start.column);
                        foldLine.shiftRow(len);
                        foldLine.addRemoveChars(lastRow, 0, end.column - start.column);
                    }
                    else if (cmp == -1) {
                        foldLine.addRemoveChars(firstRow, 0, end.column - start.column);
                        foldLine.shiftRow(len);
                    }
                    idx = foldLines.indexOf(foldLine) + 1;
                }
                for (idx; idx < foldLines.length; idx++) {
                    var foldLine = foldLines[idx];
                    if (foldLine.start.row >= firstRow) {
                        foldLine.shiftRow(len);
                    }
                }
            }
        }
        else {
            len = Math.abs(e.data.range.start.column - e.data.range.end.column);
            if (action.indexOf("remove") != -1) {
                removedFolds = this.getFoldsInRange(e.data.range);
                this.removeFolds(removedFolds);
                len = -len;
            }
            var foldLine = this.getFoldLine(firstRow);
            if (foldLine) {
                foldLine.addRemoveChars(firstRow, start.column, len);
            }
        }
        if (useWrapMode && this.$wrapData.length != this.doc.getLength()) {
            console.error("doc.getLength() and $wrapData.length have to be the same!");
        }
        this.$updating = false;
        if (useWrapMode)
            this.$updateWrapData(firstRow, lastRow);
        else
            this.$updateRowLengthCache(firstRow, lastRow);
        return removedFolds;
    }
    $updateRowLengthCache(firstRow, lastRow, b) {
        this.$rowLengthCache[firstRow] = null;
        this.$rowLengthCache[lastRow] = null;
    }
    $updateWrapData(firstRow, lastRow) {
        var lines = this.doc.getAllLines();
        var tabSize = this.getTabSize();
        var wrapData = this.$wrapData;
        var wrapLimit = this.$wrapLimit;
        var tokens;
        var foldLine;
        var row = firstRow;
        lastRow = Math.min(lastRow, lines.length - 1);
        while (row <= lastRow) {
            foldLine = this.getFoldLine(row, foldLine);
            if (!foldLine) {
                tokens = this.$getDisplayTokens(lines[row]);
                wrapData[row] = this.$computeWrapSplits(tokens, wrapLimit, tabSize);
                row++;
            }
            else {
                tokens = [];
                foldLine.walk(function (placeholder, row, column, lastColumn) {
                    var walkTokens;
                    if (placeholder != null) {
                        walkTokens = this.$getDisplayTokens(placeholder, tokens.length);
                        walkTokens[0] = PLACEHOLDER_START;
                        for (var i = 1; i < walkTokens.length; i++) {
                            walkTokens[i] = PLACEHOLDER_BODY;
                        }
                    }
                    else {
                        walkTokens = this.$getDisplayTokens(lines[row].substring(lastColumn, column), tokens.length);
                    }
                    tokens = tokens.concat(walkTokens);
                }.bind(this), foldLine.end.row, lines[foldLine.end.row].length + 1);
                wrapData[foldLine.start.row] = this.$computeWrapSplits(tokens, wrapLimit, tabSize);
                row = foldLine.end.row + 1;
            }
        }
    }
    $computeWrapSplits(tokens, wrapLimit, tabSize) {
        if (tokens.length == 0) {
            return [];
        }
        var splits = [];
        var displayLength = tokens.length;
        var lastSplit = 0, lastDocSplit = 0;
        var isCode = this.$wrapAsCode;
        function addSplit(screenPos) {
            var displayed = tokens.slice(lastSplit, screenPos);
            var len = displayed.length;
            displayed.join("").
                replace(/12/g, function () {
                len -= 1;
                return void 0;
            }).
                replace(/2/g, function () {
                len -= 1;
                return void 0;
            });
            lastDocSplit += len;
            splits.push(lastDocSplit);
            lastSplit = screenPos;
        }
        while (displayLength - lastSplit > wrapLimit) {
            var split = lastSplit + wrapLimit;
            if (tokens[split - 1] >= SPACE && tokens[split] >= SPACE) {
                addSplit(split);
                continue;
            }
            if (tokens[split] == PLACEHOLDER_START || tokens[split] == PLACEHOLDER_BODY) {
                for (split; split != lastSplit - 1; split--) {
                    if (tokens[split] == PLACEHOLDER_START) {
                        break;
                    }
                }
                if (split > lastSplit) {
                    addSplit(split);
                    continue;
                }
                split = lastSplit + wrapLimit;
                for (split; split < tokens.length; split++) {
                    if (tokens[split] != PLACEHOLDER_BODY) {
                        break;
                    }
                }
                if (split == tokens.length) {
                    break;
                }
                addSplit(split);
                continue;
            }
            var minSplit = Math.max(split - (isCode ? 10 : wrapLimit - (wrapLimit >> 2)), lastSplit - 1);
            while (split > minSplit && tokens[split] < PLACEHOLDER_START) {
                split--;
            }
            if (isCode) {
                while (split > minSplit && tokens[split] < PLACEHOLDER_START) {
                    split--;
                }
                while (split > minSplit && tokens[split] == PUNCTUATION) {
                    split--;
                }
            }
            else {
                while (split > minSplit && tokens[split] < SPACE) {
                    split--;
                }
            }
            if (split > minSplit) {
                addSplit(++split);
                continue;
            }
            split = lastSplit + wrapLimit;
            addSplit(split);
        }
        return splits;
    }
    $getDisplayTokens(str, offset) {
        var arr = [];
        var tabSize;
        offset = offset || 0;
        for (var i = 0; i < str.length; i++) {
            var c = str.charCodeAt(i);
            if (c == 9) {
                tabSize = this.getScreenTabSize(arr.length + offset);
                arr.push(TAB);
                for (var n = 1; n < tabSize; n++) {
                    arr.push(TAB_SPACE);
                }
            }
            else if (c == 32) {
                arr.push(SPACE);
            }
            else if ((c > 39 && c < 48) || (c > 57 && c < 64)) {
                arr.push(PUNCTUATION);
            }
            else if (c >= 0x1100 && isFullWidth(c)) {
                arr.push(CHAR, CHAR_EXT);
            }
            else {
                arr.push(CHAR);
            }
        }
        return arr;
    }
    $getStringScreenWidth(str, maxScreenColumn, screenColumn) {
        if (maxScreenColumn == 0)
            return [0, 0];
        if (maxScreenColumn == null)
            maxScreenColumn = Infinity;
        screenColumn = screenColumn || 0;
        var c;
        var column;
        for (column = 0; column < str.length; column++) {
            c = str.charCodeAt(column);
            if (c == 9) {
                screenColumn += this.getScreenTabSize(screenColumn);
            }
            else if (c >= 0x1100 && isFullWidth(c)) {
                screenColumn += 2;
            }
            else {
                screenColumn += 1;
            }
            if (screenColumn > maxScreenColumn) {
                break;
            }
        }
        return [screenColumn, column];
    }
    getRowLength(row) {
        if (this.lineWidgets)
            var h = this.lineWidgets[row] && this.lineWidgets[row].rowCount || 0;
        else
            h = 0;
        if (!this.$useWrapMode || !this.$wrapData[row]) {
            return 1 + h;
        }
        else {
            return this.$wrapData[row].length + 1 + h;
        }
    }
    getRowLineCount(row) {
        if (!this.$useWrapMode || !this.$wrapData[row]) {
            return 1;
        }
        else {
            return this.$wrapData[row].length + 1;
        }
    }
    getRowWrapIndent(screenRow) {
        if (this.$useWrapMode) {
            var pos = this.screenToDocumentPosition(screenRow, Number.MAX_VALUE);
            var splits = this.$wrapData[pos.row];
            return splits.length && splits[0] < pos.column ? splits['indent'] : 0;
        }
        else {
            return 0;
        }
    }
    getScreenLastRowColumn(screenRow) {
        var pos = this.screenToDocumentPosition(screenRow, Number.MAX_VALUE);
        return this.documentToScreenColumn(pos.row, pos.column);
    }
    getDocumentLastRowColumn(docRow, docColumn) {
        var screenRow = this.documentToScreenRow(docRow, docColumn);
        return this.getScreenLastRowColumn(screenRow);
    }
    getDocumentLastRowColumnPosition(docRow, docColumn) {
        var screenRow = this.documentToScreenRow(docRow, docColumn);
        return this.screenToDocumentPosition(screenRow, Number.MAX_VALUE / 10);
    }
    getRowSplitData(row) {
        if (!this.$useWrapMode) {
            return undefined;
        }
        else {
            return this.$wrapData[row];
        }
    }
    getScreenTabSize(screenColumn) {
        return this.$tabSize - screenColumn % this.$tabSize;
    }
    screenToDocumentRow(screenRow, screenColumn) {
        return this.screenToDocumentPosition(screenRow, screenColumn).row;
    }
    screenToDocumentColumn(screenRow, screenColumn) {
        return this.screenToDocumentPosition(screenRow, screenColumn).column;
    }
    screenToDocumentPosition(screenRow, screenColumn) {
        if (screenRow < 0) {
            return { row: 0, column: 0 };
        }
        var line;
        var docRow = 0;
        var docColumn = 0;
        var column;
        var row = 0;
        var rowLength = 0;
        var rowCache = this.$screenRowCache;
        var i = this.$getRowCacheIndex(rowCache, screenRow);
        var l = rowCache.length;
        if (l && i >= 0) {
            var row = rowCache[i];
            var docRow = this.$docRowCache[i];
            var doCache = screenRow > rowCache[l - 1];
        }
        else {
            var doCache = !l;
        }
        var maxRow = this.getLength() - 1;
        var foldLine = this.getNextFoldLine(docRow);
        var foldStart = foldLine ? foldLine.start.row : Infinity;
        while (row <= screenRow) {
            rowLength = this.getRowLength(docRow);
            if (row + rowLength > screenRow || docRow >= maxRow) {
                break;
            }
            else {
                row += rowLength;
                docRow++;
                if (docRow > foldStart) {
                    docRow = foldLine.end.row + 1;
                    foldLine = this.getNextFoldLine(docRow, foldLine);
                    foldStart = foldLine ? foldLine.start.row : Infinity;
                }
            }
            if (doCache) {
                this.$docRowCache.push(docRow);
                this.$screenRowCache.push(row);
            }
        }
        if (foldLine && foldLine.start.row <= docRow) {
            line = this.getFoldDisplayLine(foldLine);
            docRow = foldLine.start.row;
        }
        else if (row + rowLength <= screenRow || docRow > maxRow) {
            return {
                row: maxRow,
                column: this.getLine(maxRow).length
            };
        }
        else {
            line = this.getLine(docRow);
            foldLine = null;
        }
        if (this.$useWrapMode) {
            var splits = this.$wrapData[docRow];
            if (splits) {
                var splitIndex = Math.floor(screenRow - row);
                column = splits[splitIndex];
                if (splitIndex > 0 && splits.length) {
                    docColumn = splits[splitIndex - 1] || splits[splits.length - 1];
                    line = line.substring(docColumn);
                }
            }
        }
        docColumn += this.$getStringScreenWidth(line, screenColumn)[1];
        if (this.$useWrapMode && docColumn >= column)
            docColumn = column - 1;
        if (foldLine)
            return foldLine.idxToPosition(docColumn);
        return { row: docRow, column: docColumn };
    }
    documentToScreenPosition(docRow, docColumn) {
        var pos;
        if (typeof docColumn === "undefined") {
            pos = this.$clipPositionToDocument(docRow['row'], docRow['column']);
        }
        else {
            assert(typeof docRow === 'number', "docRow must be a number");
            assert(typeof docColumn === 'number', "docColumn must be a number");
            pos = this.$clipPositionToDocument(docRow, docColumn);
        }
        docRow = pos.row;
        docColumn = pos.column;
        assert(typeof docRow === 'number', "docRow must be a number");
        assert(typeof docColumn === 'number', "docColumn must be a number");
        var screenRow = 0;
        var foldStartRow = null;
        var fold = null;
        fold = this.getFoldAt(docRow, docColumn, 1);
        if (fold) {
            docRow = fold.start.row;
            docColumn = fold.start.column;
        }
        var rowEnd, row = 0;
        var rowCache = this.$docRowCache;
        var i = this.$getRowCacheIndex(rowCache, docRow);
        var l = rowCache.length;
        if (l && i >= 0) {
            var row = rowCache[i];
            var screenRow = this.$screenRowCache[i];
            var doCache = docRow > rowCache[l - 1];
        }
        else {
            var doCache = !l;
        }
        var foldLine = this.getNextFoldLine(row);
        var foldStart = foldLine ? foldLine.start.row : Infinity;
        while (row < docRow) {
            if (row >= foldStart) {
                rowEnd = foldLine.end.row + 1;
                if (rowEnd > docRow)
                    break;
                foldLine = this.getNextFoldLine(rowEnd, foldLine);
                foldStart = foldLine ? foldLine.start.row : Infinity;
            }
            else {
                rowEnd = row + 1;
            }
            screenRow += this.getRowLength(row);
            row = rowEnd;
            if (doCache) {
                this.$docRowCache.push(row);
                this.$screenRowCache.push(screenRow);
            }
        }
        var textLine = "";
        if (foldLine && row >= foldStart) {
            textLine = this.getFoldDisplayLine(foldLine, docRow, docColumn);
            foldStartRow = foldLine.start.row;
        }
        else {
            textLine = this.getLine(docRow).substring(0, docColumn);
            foldStartRow = docRow;
        }
        if (this.$useWrapMode) {
            var wrapRow = this.$wrapData[foldStartRow];
            if (wrapRow) {
                var screenRowOffset = 0;
                while (textLine.length >= wrapRow[screenRowOffset]) {
                    screenRow++;
                    screenRowOffset++;
                }
                textLine = textLine.substring(wrapRow[screenRowOffset - 1] || 0, textLine.length);
            }
        }
        return {
            row: screenRow,
            column: this.$getStringScreenWidth(textLine)[0]
        };
    }
    documentToScreenColumn(docRow, docColumn) {
        return this.documentToScreenPosition(docRow, docColumn).column;
    }
    documentToScreenRow(docRow, docColumn) {
        return this.documentToScreenPosition(docRow, docColumn).row;
    }
    documentToScreenRange(range) {
        var screenPosStart = this.documentToScreenPosition(range.start.row, range.start.column);
        var screenPosEnd = this.documentToScreenPosition(range.end.row, range.end.column);
        return new Range(screenPosStart.row, screenPosStart.column, screenPosEnd.row, screenPosEnd.column);
    }
    getScreenLength() {
        var screenRows = 0;
        var fold = null;
        if (!this.$useWrapMode) {
            screenRows = this.getLength();
            var foldData = this.$foldData;
            for (var i = 0; i < foldData.length; i++) {
                fold = foldData[i];
                screenRows -= fold.end.row - fold.start.row;
            }
        }
        else {
            var lastRow = this.$wrapData.length;
            var row = 0, i = 0;
            var fold = this.$foldData[i++];
            var foldStart = fold ? fold.start.row : Infinity;
            while (row < lastRow) {
                var splits = this.$wrapData[row];
                screenRows += splits ? splits.length + 1 : 1;
                row++;
                if (row > foldStart) {
                    row = fold.end.row + 1;
                    fold = this.$foldData[i++];
                    foldStart = fold ? fold.start.row : Infinity;
                }
            }
        }
        if (this.lineWidgets) {
            screenRows += this.$getWidgetScreenLength();
        }
        return screenRows;
    }
    $setFontMetrics(fm) {
    }
    findMatchingBracket(position, chr) {
        return this.$bracketMatcher.findMatchingBracket(position, chr);
    }
    getBracketRange(position) {
        return this.$bracketMatcher.getBracketRange(position);
    }
    findOpeningBracket(bracket, position, typeRe) {
        return this.$bracketMatcher.findOpeningBracket(bracket, position, typeRe);
    }
    findClosingBracket(bracket, position, typeRe) {
        return this.$bracketMatcher.findClosingBracket(bracket, position, typeRe);
    }
    getFoldAt(row, column, side) {
        var foldLine = this.getFoldLine(row);
        if (!foldLine)
            return null;
        var folds = foldLine.folds;
        for (var i = 0; i < folds.length; i++) {
            var fold = folds[i];
            if (fold.range.contains(row, column)) {
                if (side === 1 && fold.range.isEnd(row, column)) {
                    continue;
                }
                else if (side === -1 && fold.range.isStart(row, column)) {
                    continue;
                }
                return fold;
            }
        }
    }
    getFoldsInRange(range) {
        var start = range.start;
        var end = range.end;
        var foldLines = this.$foldData;
        var foundFolds = [];
        start.column += 1;
        end.column -= 1;
        for (var i = 0; i < foldLines.length; i++) {
            var cmp = foldLines[i].range.compareRange(range);
            if (cmp == 2) {
                continue;
            }
            else if (cmp == -2) {
                break;
            }
            var folds = foldLines[i].folds;
            for (var j = 0; j < folds.length; j++) {
                var fold = folds[j];
                cmp = fold.range.compareRange(range);
                if (cmp == -2) {
                    break;
                }
                else if (cmp == 2) {
                    continue;
                }
                else if (cmp == 42) {
                    break;
                }
                foundFolds.push(fold);
            }
        }
        start.column -= 1;
        end.column += 1;
        return foundFolds;
    }
    getFoldsInRangeList(ranges) {
        if (Array.isArray(ranges)) {
            var folds = [];
            ranges.forEach(function (range) {
                folds = folds.concat(this.getFoldsInRange(range));
            }, this);
        }
        else {
            var folds = this.getFoldsInRange(ranges);
        }
        return folds;
    }
    getAllFolds() {
        var folds = [];
        var foldLines = this.$foldData;
        for (var i = 0; i < foldLines.length; i++)
            for (var j = 0; j < foldLines[i].folds.length; j++)
                folds.push(foldLines[i].folds[j]);
        return folds;
    }
    getFoldStringAt(row, column, trim, foldLine) {
        foldLine = foldLine || this.getFoldLine(row);
        if (!foldLine)
            return null;
        var lastFold = {
            end: { column: 0 }
        };
        var str;
        var fold;
        for (var i = 0; i < foldLine.folds.length; i++) {
            fold = foldLine.folds[i];
            var cmp = fold.range.compareEnd(row, column);
            if (cmp == -1) {
                str = this.getLine(fold.start.row).substring(lastFold.end.column, fold.start.column);
                break;
            }
            else if (cmp === 0) {
                return null;
            }
            lastFold = fold;
        }
        if (!str)
            str = this.getLine(fold.start.row).substring(lastFold.end.column);
        if (trim == -1)
            return str.substring(0, column - lastFold.end.column);
        else if (trim == 1)
            return str.substring(column - lastFold.end.column);
        else
            return str;
    }
    getFoldLine(docRow, startFoldLine) {
        var foldData = this.$foldData;
        var i = 0;
        if (startFoldLine)
            i = foldData.indexOf(startFoldLine);
        if (i == -1)
            i = 0;
        for (i; i < foldData.length; i++) {
            var foldLine = foldData[i];
            if (foldLine.start.row <= docRow && foldLine.end.row >= docRow) {
                return foldLine;
            }
            else if (foldLine.end.row > docRow) {
                return null;
            }
        }
        return null;
    }
    getNextFoldLine(docRow, startFoldLine) {
        var foldData = this.$foldData;
        var i = 0;
        if (startFoldLine)
            i = foldData.indexOf(startFoldLine);
        if (i == -1)
            i = 0;
        for (i; i < foldData.length; i++) {
            var foldLine = foldData[i];
            if (foldLine.end.row >= docRow) {
                return foldLine;
            }
        }
        return null;
    }
    getFoldedRowCount(first, last) {
        var foldData = this.$foldData;
        var rowCount = last - first + 1;
        for (var i = 0; i < foldData.length; i++) {
            var foldLine = foldData[i], end = foldLine.end.row, start = foldLine.start.row;
            if (end >= last) {
                if (start < last) {
                    if (start >= first)
                        rowCount -= last - start;
                    else
                        rowCount = 0;
                }
                break;
            }
            else if (end >= first) {
                if (start >= first)
                    rowCount -= end - start;
                else
                    rowCount -= end - first + 1;
            }
        }
        return rowCount;
    }
    $addFoldLine(foldLine) {
        this.$foldData.push(foldLine);
        this.$foldData.sort(function (a, b) {
            return a.start.row - b.start.row;
        });
        return foldLine;
    }
    addFold(placeholder, range) {
        var foldData = this.$foldData;
        var added = false;
        var fold;
        if (placeholder instanceof Fold)
            fold = placeholder;
        else if (typeof placeholder === 'string') {
            fold = new Fold(range, placeholder);
            fold.collapseChildren = range.collapseChildren;
        }
        else {
            throw new Error("placeholder must be a string or a Fold.");
        }
        fold.range = this.$clipRangeToDocument(fold.range);
        var startRow = fold.start.row;
        var startColumn = fold.start.column;
        var endRow = fold.end.row;
        var endColumn = fold.end.column;
        if (!(startRow < endRow ||
            startRow == endRow && startColumn <= endColumn - 2))
            throw new Error("The range has to be at least 2 characters width");
        var startFold = this.getFoldAt(startRow, startColumn, 1);
        var endFold = this.getFoldAt(endRow, endColumn, -1);
        if (startFold && endFold == startFold)
            return startFold.addSubFold(fold);
        if ((startFold && !startFold.range.isStart(startRow, startColumn))
            || (endFold && !endFold.range.isEnd(endRow, endColumn))) {
            throw new Error("A fold can't intersect already existing fold" + fold.range + startFold.range);
        }
        var folds = this.getFoldsInRange(fold.range);
        if (folds.length > 0) {
            this.removeFolds(folds);
            folds.forEach(function (subFold) {
                fold.addSubFold(subFold);
            });
        }
        for (var i = 0; i < foldData.length; i++) {
            var foldLine = foldData[i];
            if (endRow == foldLine.start.row) {
                foldLine.addFold(fold);
                added = true;
                break;
            }
            else if (startRow == foldLine.end.row) {
                foldLine.addFold(fold);
                added = true;
                if (!fold.sameRow) {
                    var foldLineNext = foldData[i + 1];
                    if (foldLineNext && foldLineNext.start.row == endRow) {
                        foldLine.merge(foldLineNext);
                        break;
                    }
                }
                break;
            }
            else if (endRow <= foldLine.start.row) {
                break;
            }
        }
        if (!added)
            foldLine = this.$addFoldLine(new FoldLine(this.$foldData, [fold]));
        if (this.$useWrapMode)
            this.$updateWrapData(foldLine.start.row, foldLine.start.row);
        else
            this.$updateRowLengthCache(foldLine.start.row, foldLine.start.row);
        this.setModified(true);
        var foldEvent = { data: fold, action: "add" };
        this.eventBus._emit("changeFold", foldEvent);
        return fold;
    }
    setModified(modified) {
    }
    addFolds(folds) {
        folds.forEach(function (fold) {
            this.addFold(fold);
        }, this);
    }
    removeFold(fold) {
        var foldLine = fold.foldLine;
        var startRow = foldLine.start.row;
        var endRow = foldLine.end.row;
        var foldLines = this.$foldData;
        var folds = foldLine.folds;
        if (folds.length == 1) {
            foldLines.splice(foldLines.indexOf(foldLine), 1);
        }
        else if (foldLine.range.isEnd(fold.end.row, fold.end.column)) {
            folds.pop();
            foldLine.end.row = folds[folds.length - 1].end.row;
            foldLine.end.column = folds[folds.length - 1].end.column;
        }
        else if (foldLine.range.isStart(fold.start.row, fold.start.column)) {
            folds.shift();
            foldLine.start.row = folds[0].start.row;
            foldLine.start.column = folds[0].start.column;
        }
        else if (fold.sameRow) {
            folds.splice(folds.indexOf(fold), 1);
        }
        else {
            var newFoldLine = foldLine.split(fold.start.row, fold.start.column);
            folds = newFoldLine.folds;
            folds.shift();
            newFoldLine.start.row = folds[0].start.row;
            newFoldLine.start.column = folds[0].start.column;
        }
        if (!this.$updating) {
            if (this.$useWrapMode)
                this.$updateWrapData(startRow, endRow);
            else
                this.$updateRowLengthCache(startRow, endRow);
        }
        this.setModified(true);
        var foldEvent = { data: fold, action: "remove" };
        this.eventBus._emit("changeFold", foldEvent);
    }
    removeFolds(folds) {
        var cloneFolds = [];
        for (var i = 0; i < folds.length; i++) {
            cloneFolds.push(folds[i]);
        }
        cloneFolds.forEach(function (fold) {
            this.removeFold(fold);
        }, this);
        this.setModified(true);
    }
    expandFold(fold) {
        this.removeFold(fold);
        fold.subFolds.forEach(function (subFold) {
            fold.restoreRange(subFold);
            this.addFold(subFold);
        }, this);
        if (fold.collapseChildren > 0) {
            this.foldAll(fold.start.row + 1, fold.end.row, fold.collapseChildren - 1);
        }
        fold.subFolds = [];
    }
    expandFolds(folds) {
        folds.forEach(function (fold) {
            this.expandFold(fold);
        }, this);
    }
    unfold(location, expandInner) {
        var range;
        var folds;
        if (location == null) {
            range = new Range(0, 0, this.getLength(), 0);
            expandInner = true;
        }
        else if (typeof location == "number")
            range = new Range(location, 0, location, this.getLine(location).length);
        else if ("row" in location)
            range = Range.fromPoints(location, location);
        else
            range = location;
        folds = this.getFoldsInRangeList(range);
        if (expandInner) {
            this.removeFolds(folds);
        }
        else {
            var subFolds = folds;
            while (subFolds.length) {
                this.expandFolds(subFolds);
                subFolds = this.getFoldsInRangeList(range);
            }
        }
        if (folds.length)
            return folds;
    }
    isRowFolded(docRow, startFoldRow) {
        return !!this.getFoldLine(docRow, startFoldRow);
    }
    getRowFoldEnd(docRow, startFoldRow) {
        var foldLine = this.getFoldLine(docRow, startFoldRow);
        return foldLine ? foldLine.end.row : docRow;
    }
    getRowFoldStart(docRow, startFoldRow) {
        var foldLine = this.getFoldLine(docRow, startFoldRow);
        return foldLine ? foldLine.start.row : docRow;
    }
    getFoldDisplayLine(foldLine, endRow, endColumn, startRow, startColumn) {
        if (startRow == null)
            startRow = foldLine.start.row;
        if (startColumn == null)
            startColumn = 0;
        if (endRow == null)
            endRow = foldLine.end.row;
        if (endColumn == null)
            endColumn = this.getLine(endRow).length;
        var self = this;
        var textLine = "";
        foldLine.walk(function (placeholder, row, column, lastColumn) {
            if (row < startRow)
                return;
            if (row == startRow) {
                if (column < startColumn)
                    return;
                lastColumn = Math.max(startColumn, lastColumn);
            }
            if (placeholder != null) {
                textLine += placeholder;
            }
            else {
                textLine += self.getLine(row).substring(lastColumn, column);
            }
        }, endRow, endColumn);
        return textLine;
    }
    getDisplayLine(row, endColumn, startRow, startColumn) {
        var foldLine = this.getFoldLine(row);
        if (!foldLine) {
            var line;
            line = this.getLine(row);
            return line.substring(startColumn || 0, endColumn || line.length);
        }
        else {
            return this.getFoldDisplayLine(foldLine, row, endColumn, startRow, startColumn);
        }
    }
    $cloneFoldData() {
        var fd = [];
        fd = this.$foldData.map(function (foldLine) {
            var folds = foldLine.folds.map(function (fold) {
                return fold.clone();
            });
            return new FoldLine(fd, folds);
        });
        return fd;
    }
    toggleFold(tryToUnfold) {
        var selection = this.selection;
        var range = selection.getRange();
        var fold;
        var bracketPos;
        if (range.isEmpty()) {
            var cursor = range.start;
            fold = this.getFoldAt(cursor.row, cursor.column);
            if (fold) {
                this.expandFold(fold);
                return;
            }
            else if (bracketPos = this.findMatchingBracket(cursor)) {
                if (range.comparePoint(bracketPos) == 1) {
                    range.end = bracketPos;
                }
                else {
                    range.start = bracketPos;
                    range.start.column++;
                    range.end.column--;
                }
            }
            else if (bracketPos = this.findMatchingBracket({ row: cursor.row, column: cursor.column + 1 })) {
                if (range.comparePoint(bracketPos) === 1)
                    range.end = bracketPos;
                else
                    range.start = bracketPos;
                range.start.column++;
            }
            else {
                range = this.getCommentFoldRange(cursor.row, cursor.column) || range;
            }
        }
        else {
            var folds = this.getFoldsInRange(range);
            if (tryToUnfold && folds.length) {
                this.expandFolds(folds);
                return;
            }
            else if (folds.length == 1) {
                fold = folds[0];
            }
        }
        if (!fold)
            fold = this.getFoldAt(range.start.row, range.start.column);
        if (fold && fold.range.toString() == range.toString()) {
            this.expandFold(fold);
            return;
        }
        var placeholder = "...";
        if (!range.isMultiLine()) {
            placeholder = this.getTextRange(range);
            if (placeholder.length < 4)
                return;
            placeholder = placeholder.trim().substring(0, 2) + "..";
        }
        this.addFold(placeholder, range);
    }
    getCommentFoldRange(row, column, dir) {
        var iterator = new TokenIterator(this, row, column);
        var token = iterator.getCurrentToken();
        if (token && /^comment|string/.test(token.type)) {
            var range = new Range(0, 0, 0, 0);
            var re = new RegExp(token.type.replace(/\..*/, "\\."));
            if (dir != 1) {
                do {
                    token = iterator.stepBackward();
                } while (token && re.test(token.type));
                iterator.stepForward();
            }
            range.start.row = iterator.getCurrentTokenRow();
            range.start.column = iterator.getCurrentTokenColumn() + 2;
            iterator = new TokenIterator(this, row, column);
            if (dir != -1) {
                do {
                    token = iterator.stepForward();
                } while (token && re.test(token.type));
                token = iterator.stepBackward();
            }
            else
                token = iterator.getCurrentToken();
            range.end.row = iterator.getCurrentTokenRow();
            range.end.column = iterator.getCurrentTokenColumn() + token.value.length - 2;
            return range;
        }
    }
    foldAll(startRow, endRow, depth) {
        if (depth == undefined)
            depth = 100000;
        var foldWidgets = this.foldWidgets;
        if (!foldWidgets)
            return;
        endRow = endRow || this.getLength();
        startRow = startRow || 0;
        for (var row = startRow; row < endRow; row++) {
            if (foldWidgets[row] == null)
                foldWidgets[row] = this.getFoldWidget(row);
            if (foldWidgets[row] != "start")
                continue;
            var range = this.getFoldWidgetRange(row);
            if (range && range.isMultiLine()
                && range.end.row <= endRow
                && range.start.row >= startRow) {
                row = range.end.row;
                try {
                    var fold = this.addFold("...", range);
                    if (fold)
                        fold.collapseChildren = depth;
                }
                catch (e) { }
            }
        }
    }
    setFoldStyle(style) {
        if (!this.$foldStyles[style])
            throw new Error("invalid fold style: " + style + "[" + Object.keys(this.$foldStyles).join(", ") + "]");
        if (this.$foldStyle === style)
            return;
        this.$foldStyle = style;
        if (style === "manual")
            this.unfold();
        var mode = this.$foldMode;
        this.$setFolding(null);
        this.$setFolding(mode);
    }
    $setFolding(foldMode) {
        if (this.$foldMode == foldMode)
            return;
        this.$foldMode = foldMode;
        this.eventBus.off('change', this.$updateFoldWidgets);
        this.eventBus._emit("changeAnnotation");
        if (!foldMode || this.$foldStyle === "manual") {
            this.foldWidgets = null;
            return;
        }
        this.foldWidgets = [];
        this.getFoldWidget = foldMode.getFoldWidget.bind(foldMode, this, this.$foldStyle);
        this.getFoldWidgetRange = foldMode.getFoldWidgetRange.bind(foldMode, this, this.$foldStyle);
        this.$updateFoldWidgets = this.updateFoldWidgets.bind(this);
        this.eventBus.on('change', this.$updateFoldWidgets);
    }
    getParentFoldRangeData(row, ignoreCurrent) {
        var fw = this.foldWidgets;
        if (!fw || (ignoreCurrent && fw[row])) {
            return {};
        }
        var i = row - 1;
        var firstRange;
        while (i >= 0) {
            var c = fw[i];
            if (c == null)
                c = fw[i] = this.getFoldWidget(i);
            if (c == "start") {
                var range = this.getFoldWidgetRange(i);
                if (!firstRange)
                    firstRange = range;
                if (range && range.end.row >= row)
                    break;
            }
            i--;
        }
        return {
            range: i !== -1 && range,
            firstRange: firstRange
        };
    }
    onFoldWidgetClick(row, e) {
        e = e.domEvent;
        var options = {
            children: e.shiftKey,
            all: e.ctrlKey || e.metaKey,
            siblings: e.altKey
        };
        var range = this.$toggleFoldWidget(row, options);
        if (!range) {
            var el = (e.target || e.srcElement);
            if (el && /ace_fold-widget/.test(el.className))
                el.className += " ace_invalid";
        }
    }
    $toggleFoldWidget(row, options) {
        if (!this.getFoldWidget)
            return;
        var type = this.getFoldWidget(row);
        var line = this.getLine(row);
        var dir = type === "end" ? -1 : 1;
        var fold = this.getFoldAt(row, dir === -1 ? 0 : line.length, dir);
        if (fold) {
            if (options.children || options.all)
                this.removeFold(fold);
            else
                this.expandFold(fold);
            return;
        }
        var range = this.getFoldWidgetRange(row, true);
        if (range && !range.isMultiLine()) {
            fold = this.getFoldAt(range.start.row, range.start.column, 1);
            if (fold && range.isEqual(fold.range)) {
                this.removeFold(fold);
                return;
            }
        }
        if (options.siblings) {
            var data = this.getParentFoldRangeData(row);
            if (data.range) {
                var startRow = data.range.start.row + 1;
                var endRow = data.range.end.row;
            }
            this.foldAll(startRow, endRow, options.all ? 10000 : 0);
        }
        else if (options.children) {
            endRow = range ? range.end.row : this.getLength();
            this.foldAll(row + 1, range.end.row, options.all ? 10000 : 0);
        }
        else if (range) {
            if (options.all) {
                range.collapseChildren = 10000;
            }
            this.addFold("...", range);
        }
        return range;
    }
    toggleFoldWidget(toggleParent) {
        var row = this.selection.getCursor().row;
        row = this.getRowFoldStart(row);
        var range = this.$toggleFoldWidget(row, {});
        if (range)
            return;
        var data = this.getParentFoldRangeData(row, true);
        range = data.range || data.firstRange;
        if (range) {
            row = range.start.row;
            var fold = this.getFoldAt(row, this.getLine(row).length, 1);
            if (fold) {
                this.removeFold(fold);
            }
            else {
                this.addFold("...", range);
            }
        }
    }
    updateFoldWidgets(e, editSession) {
        var delta = e.data;
        var range = delta.range;
        var firstRow = range.start.row;
        var len = range.end.row - firstRow;
        if (len === 0) {
            this.foldWidgets[firstRow] = null;
        }
        else if (delta.action == "removeText" || delta.action == "removeLines") {
            this.foldWidgets.splice(firstRow, len + 1, null);
        }
        else {
            var args = Array(len + 1);
            args.unshift(firstRow, 1);
            this.foldWidgets.splice.apply(this.foldWidgets, args);
        }
    }
}
defineOptions(EditSession.prototype, "session", {
    wrap: {
        set: function (value) {
            if (!value || value == "off")
                value = false;
            else if (value == "free")
                value = true;
            else if (value == "printMargin")
                value = -1;
            else if (typeof value == "string")
                value = parseInt(value, 10) || false;
            if (this.$wrap == value)
                return;
            if (!value) {
                this.setUseWrapMode(false);
            }
            else {
                var col = typeof value == "number" ? value : null;
                this.setWrapLimitRange(col, col);
                this.setUseWrapMode(true);
            }
            this.$wrap = value;
        },
        get: function () {
            if (this.getUseWrapMode()) {
                if (this.$wrap == -1)
                    return "printMargin";
                if (!this.getWrapLimitRange().min)
                    return "free";
                return this.$wrap;
            }
            return "off";
        },
        handlesSet: true
    },
    wrapMethod: {
        set: function (val) {
            val = val == "auto"
                ? this.$mode.type != "text"
                : val != "text";
            if (val != this.$wrapAsCode) {
                this.$wrapAsCode = val;
                if (this.$useWrapMode) {
                    this.$modified = true;
                    this.$resetRowCache(0);
                    this.$updateWrapData(0, this.getLength() - 1);
                }
            }
        },
        initialValue: "auto"
    },
    firstLineNumber: {
        set: function () { this._signal("changeBreakpoint"); },
        initialValue: 1
    },
    useWorker: {
        set: function (useWorker) {
            this.$useWorker = useWorker;
            this.$stopWorker();
            if (useWorker) {
                this.$startWorker();
            }
        },
        initialValue: true
    },
    useSoftTabs: { initialValue: true },
    tabSize: {
        set: function (tabSize) {
            if (isNaN(tabSize) || this.$tabSize === tabSize)
                return;
            this.$modified = true;
            this.$rowLengthCache = [];
            this.$tabSize = tabSize;
            this._signal("changeTabSize");
        },
        initialValue: 4,
        handlesSet: true
    },
    overwrite: {
        set: function (val) { this._signal("changeOverwrite"); },
        initialValue: false
    },
    newLineMode: {
        set: function (val) { this.doc.setNewLineMode(val); },
        get: function () { return this.doc.getNewLineMode(); },
        handlesSet: true
    },
    mode: {
        set: function (val) { this.setMode(val); },
        get: function () { return this.$modeId; }
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdFNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJFZGl0U2Vzc2lvbi50cyJdLCJuYW1lcyI6WyJpc0Z1bGxXaWR0aCIsIkVkaXRTZXNzaW9uIiwiRWRpdFNlc3Npb24uY29uc3RydWN0b3IiLCJFZGl0U2Vzc2lvbi5vbiIsIkVkaXRTZXNzaW9uLm9mZiIsIkVkaXRTZXNzaW9uLl9lbWl0IiwiRWRpdFNlc3Npb24uX3NpZ25hbCIsIkVkaXRTZXNzaW9uLnNldERvY3VtZW50IiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kcmVzZXRSb3dDYWNoZSIsIkVkaXRTZXNzaW9uLiRnZXRSb3dDYWNoZUluZGV4IiwiRWRpdFNlc3Npb24ucmVzZXRDYWNoZXMiLCJFZGl0U2Vzc2lvbi5vbkNoYW5nZUZvbGQiLCJFZGl0U2Vzc2lvbi5vbkNoYW5nZSIsIkVkaXRTZXNzaW9uLnNldFZhbHVlIiwiRWRpdFNlc3Npb24udG9TdHJpbmciLCJFZGl0U2Vzc2lvbi5nZXRWYWx1ZSIsIkVkaXRTZXNzaW9uLmdldFNlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLnNldFNlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLmdldFN0YXRlIiwiRWRpdFNlc3Npb24uZ2V0VG9rZW5zIiwiRWRpdFNlc3Npb24uZ2V0VG9rZW5BdCIsIkVkaXRTZXNzaW9uLnNldFVuZG9NYW5hZ2VyIiwiRWRpdFNlc3Npb24ubWFya1VuZG9Hcm91cCIsIkVkaXRTZXNzaW9uLmdldFVuZG9NYW5hZ2VyIiwiRWRpdFNlc3Npb24uZ2V0VGFiU3RyaW5nIiwiRWRpdFNlc3Npb24uc2V0VXNlU29mdFRhYnMiLCJFZGl0U2Vzc2lvbi5nZXRVc2VTb2Z0VGFicyIsIkVkaXRTZXNzaW9uLnNldFRhYlNpemUiLCJFZGl0U2Vzc2lvbi5nZXRUYWJTaXplIiwiRWRpdFNlc3Npb24uaXNUYWJTdG9wIiwiRWRpdFNlc3Npb24uc2V0T3ZlcndyaXRlIiwiRWRpdFNlc3Npb24uZ2V0T3ZlcndyaXRlIiwiRWRpdFNlc3Npb24udG9nZ2xlT3ZlcndyaXRlIiwiRWRpdFNlc3Npb24uYWRkR3V0dGVyRGVjb3JhdGlvbiIsIkVkaXRTZXNzaW9uLnJlbW92ZUd1dHRlckRlY29yYXRpb24iLCJFZGl0U2Vzc2lvbi5nZXRCcmVha3BvaW50cyIsIkVkaXRTZXNzaW9uLnNldEJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uY2xlYXJCcmVha3BvaW50cyIsIkVkaXRTZXNzaW9uLnNldEJyZWFrcG9pbnQiLCJFZGl0U2Vzc2lvbi5jbGVhckJyZWFrcG9pbnQiLCJFZGl0U2Vzc2lvbi5hZGRNYXJrZXIiLCJFZGl0U2Vzc2lvbi5hZGREeW5hbWljTWFya2VyIiwiRWRpdFNlc3Npb24ucmVtb3ZlTWFya2VyIiwiRWRpdFNlc3Npb24uZ2V0TWFya2VycyIsIkVkaXRTZXNzaW9uLmhpZ2hsaWdodCIsIkVkaXRTZXNzaW9uLmhpZ2hsaWdodExpbmVzIiwiRWRpdFNlc3Npb24uc2V0QW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi5nZXRBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLmNsZWFyQW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi4kZGV0ZWN0TmV3TGluZSIsIkVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXROZXdMaW5lTW9kZSIsIkVkaXRTZXNzaW9uLmdldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uc2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24ub25SZWxvYWRUb2tlbml6ZXIiLCJFZGl0U2Vzc2lvbi5zZXRMYW5ndWFnZU1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRNb2RlIiwiRWRpdFNlc3Npb24uaW1wb3J0TW9kZSIsIkVkaXRTZXNzaW9uLiRvbkNoYW5nZU1vZGUiLCJFZGl0U2Vzc2lvbi4kc3RvcFdvcmtlciIsIkVkaXRTZXNzaW9uLiRzdGFydFdvcmtlciIsIkVkaXRTZXNzaW9uLmdldE1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRTY3JvbGxUb3AiLCJFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3AiLCJFZGl0U2Vzc2lvbi5zZXRTY3JvbGxMZWZ0IiwiRWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdCIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbldpZHRoIiwiRWRpdFNlc3Npb24uZ2V0TGluZVdpZGdldE1heFdpZHRoIiwiRWRpdFNlc3Npb24uJGNvbXB1dGVXaWR0aCIsIkVkaXRTZXNzaW9uLmdldExpbmUiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lcyIsIkVkaXRTZXNzaW9uLmdldExlbmd0aCIsIkVkaXRTZXNzaW9uLmdldFRleHRSYW5nZSIsIkVkaXRTZXNzaW9uLmluc2VydCIsIkVkaXRTZXNzaW9uLnJlbW92ZSIsIkVkaXRTZXNzaW9uLnVuZG9DaGFuZ2VzIiwiRWRpdFNlc3Npb24ucmVkb0NoYW5nZXMiLCJFZGl0U2Vzc2lvbi5zZXRVbmRvU2VsZWN0IiwiRWRpdFNlc3Npb24uJGdldFVuZG9TZWxlY3Rpb24iLCJFZGl0U2Vzc2lvbi4kZ2V0VW5kb1NlbGVjdGlvbi5pc0luc2VydCIsIkVkaXRTZXNzaW9uLnJlcGxhY2UiLCJFZGl0U2Vzc2lvbi5tb3ZlVGV4dCIsIkVkaXRTZXNzaW9uLmluZGVudFJvd3MiLCJFZGl0U2Vzc2lvbi5vdXRkZW50Um93cyIsIkVkaXRTZXNzaW9uLiRtb3ZlTGluZXMiLCJFZGl0U2Vzc2lvbi5tb3ZlTGluZXNVcCIsIkVkaXRTZXNzaW9uLm1vdmVMaW5lc0Rvd24iLCJFZGl0U2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyIsIkVkaXRTZXNzaW9uLiRjbGlwUm93VG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRjbGlwQ29sdW1uVG9Sb3ciLCJFZGl0U2Vzc2lvbi4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRjbGlwUmFuZ2VUb0RvY3VtZW50IiwiRWRpdFNlc3Npb24uc2V0VXNlV3JhcE1vZGUiLCJFZGl0U2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSIsIkVkaXRTZXNzaW9uLnNldFdyYXBMaW1pdFJhbmdlIiwiRWRpdFNlc3Npb24uYWRqdXN0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uJGNvbnN0cmFpbldyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLmdldFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLnNldFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLmdldFdyYXBMaW1pdFJhbmdlIiwiRWRpdFNlc3Npb24uJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlIiwiRWRpdFNlc3Npb24uJHVwZGF0ZVJvd0xlbmd0aENhY2hlIiwiRWRpdFNlc3Npb24uJHVwZGF0ZVdyYXBEYXRhIiwiRWRpdFNlc3Npb24uJGNvbXB1dGVXcmFwU3BsaXRzIiwiRWRpdFNlc3Npb24uJGNvbXB1dGVXcmFwU3BsaXRzLmFkZFNwbGl0IiwiRWRpdFNlc3Npb24uJGdldERpc3BsYXlUb2tlbnMiLCJFZGl0U2Vzc2lvbi4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRSb3dMZW5ndGgiLCJFZGl0U2Vzc2lvbi5nZXRSb3dMaW5lQ291bnQiLCJFZGl0U2Vzc2lvbi5nZXRSb3dXcmFwSW5kZW50IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbiIsIkVkaXRTZXNzaW9uLmdldERvY3VtZW50TGFzdFJvd0NvbHVtbiIsIkVkaXRTZXNzaW9uLmdldERvY3VtZW50TGFzdFJvd0NvbHVtblBvc2l0aW9uIiwiRWRpdFNlc3Npb24uZ2V0Um93U3BsaXREYXRhIiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuVGFiU2l6ZSIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3ciLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Q29sdW1uIiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3ciLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUmFuZ2UiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5MZW5ndGgiLCJFZGl0U2Vzc2lvbi4kc2V0Rm9udE1ldHJpY3MiLCJFZGl0U2Vzc2lvbi5maW5kTWF0Y2hpbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZ2V0QnJhY2tldFJhbmdlIiwiRWRpdFNlc3Npb24uZmluZE9wZW5pbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZmluZENsb3NpbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZEF0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlTGlzdCIsIkVkaXRTZXNzaW9uLmdldEFsbEZvbGRzIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZFN0cmluZ0F0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXRGb2xkZWRSb3dDb3VudCIsIkVkaXRTZXNzaW9uLiRhZGRGb2xkTGluZSIsIkVkaXRTZXNzaW9uLmFkZEZvbGQiLCJFZGl0U2Vzc2lvbi5zZXRNb2RpZmllZCIsIkVkaXRTZXNzaW9uLmFkZEZvbGRzIiwiRWRpdFNlc3Npb24ucmVtb3ZlRm9sZCIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGRzIiwiRWRpdFNlc3Npb24uZXhwYW5kRm9sZCIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGRzIiwiRWRpdFNlc3Npb24udW5mb2xkIiwiRWRpdFNlc3Npb24uaXNSb3dGb2xkZWQiLCJFZGl0U2Vzc2lvbi5nZXRSb3dGb2xkRW5kIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uZ2V0RGlzcGxheUxpbmUiLCJFZGl0U2Vzc2lvbi4kY2xvbmVGb2xkRGF0YSIsIkVkaXRTZXNzaW9uLnRvZ2dsZUZvbGQiLCJFZGl0U2Vzc2lvbi5nZXRDb21tZW50Rm9sZFJhbmdlIiwiRWRpdFNlc3Npb24uZm9sZEFsbCIsIkVkaXRTZXNzaW9uLnNldEZvbGRTdHlsZSIsIkVkaXRTZXNzaW9uLiRzZXRGb2xkaW5nIiwiRWRpdFNlc3Npb24uZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YSIsIkVkaXRTZXNzaW9uLm9uRm9sZFdpZGdldENsaWNrIiwiRWRpdFNlc3Npb24uJHRvZ2dsZUZvbGRXaWRnZXQiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udXBkYXRlRm9sZFdpZGdldHMiXSwibWFwcGluZ3MiOiJPQXVETyxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLEVBQUMsYUFBYSxFQUFjLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FNekQsaUJBQWlCLE1BQU0seUJBQXlCO09BQ2hELFFBQVEsTUFBTSxZQUFZO09BQzFCLElBQUksTUFBTSxRQUFRO09BRWxCLFNBQVMsTUFBTSxhQUFhO09BRTVCLEtBQUssTUFBTSxTQUFTO09BR3BCLFFBQVEsTUFBTSxZQUFZO09BQzFCLG1CQUFtQixNQUFNLHVCQUF1QjtPQUNoRCxlQUFlLE1BQU0sbUJBQW1CO09BQ3hDLEVBQUMsTUFBTSxFQUFDLE1BQU0sZUFBZTtPQUM3QixZQUFZLE1BQU0sZ0JBQWdCO09BRWxDLGFBQWEsTUFBTSxpQkFBaUI7T0FPcEMsUUFBUSxNQUFNLGlCQUFpQjtBQUd0QyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQ1IsUUFBUSxHQUFHLENBQUMsRUFDWixpQkFBaUIsR0FBRyxDQUFDLEVBQ3JCLGdCQUFnQixHQUFHLENBQUMsRUFDcEIsV0FBVyxHQUFHLENBQUMsRUFDZixLQUFLLEdBQUcsRUFBRSxFQUNWLEdBQUcsR0FBRyxFQUFFLEVBQ1IsU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUluQixxQkFBcUIsQ0FBUztJQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDWEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzdCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQSxDQUFDQTtBQUNuQ0EsQ0FBQ0E7QUFLRDtJQWlISUMsWUFBWUEsR0FBYUE7UUFoSGxCQyxpQkFBWUEsR0FBYUEsRUFBRUEsQ0FBQ0E7UUFDNUJBLGlCQUFZQSxHQUFhQSxFQUFFQSxDQUFDQTtRQUMzQkEsa0JBQWFBLEdBQW9DQSxFQUFFQSxDQUFDQTtRQUNyREEsaUJBQVlBLEdBQW9DQSxFQUFFQSxDQUFDQTtRQUNsREEsY0FBU0EsR0FBR0Es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LElBQUlBLEdBQUdBLElBQUlBO1lBQ2xEQSxLQUFLQSxFQUFFQSxLQUFLQTtZQUNaQSxPQUFPQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQTtZQUNsQkEsRUFBRUEsRUFBRUEsRUFBRUE7U0FDVEEsQ0FBQ0E7UUFFRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7WUFJaENBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0E7UUFDL0NBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBO1lBSS9CQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBO1FBQzlDQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtJQUNkQSxDQUFDQTtJQVVPeEMsZ0JBQWdCQSxDQUFDQSxNQUFxQkEsRUFBRUEsT0FBaUJBO1FBQzdEeUMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBQ0RBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1FBQzFCQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNmQSxNQUFNQSxDQUFDQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUUzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FB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T0EsQ0FBQ0EsQ0FBQ0E7UUFFeERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1JBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBO1lBQ0FBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRTdCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWkEsR0FBR0EsQ0FBQ0E7Z0JBQ0FBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ1pBLENBQUNBLFFBQ01BLEtBQUtBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBO1lBQ25EQSxLQUFLQSxFQUFFQSxDQUFDQTtRQUNaQSxDQUFDQTtRQUVEQSxJQUFJQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNqQkEsT0FBT0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDckRBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ1ZBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO0lBQzNDQSxDQUFDQTtJQVVNbEQsYUFBYUEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0E7UUFDNUNtRCxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMvQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFM0NBLE9BQU9BLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEVBQUVBLENBQUNBO1lBQ3REQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7SUFDckJBLENBQUNBO0lBUU9uRCxjQUFjQSxDQUFDQSxXQUFtQkE7UUFDdENvRCxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxjQUFjQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFTT3BELGNBQWNBO1FBQ2xCcUQsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsY0FBY0EsRUFBRUEsQ0FBQ0E7SUFDckNBLENBQUNBO0lBU01yRCxZQUFZQSxDQUFDQSxTQUFrQkE7UUFDbENzRCxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUMzQ0EsQ0FBQ0E7SUFRTXRELFlBQVlBLEtBQWN1RCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtJQU9sRHZELGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7UUFDdkJ3RCxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFJbkNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDaERBLENBQUNBO0lBWU14RCxlQUFlQSxDQUFDQSxJQUFrQkE7UUFDckN5RCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUMzQ0EsQ0FBQ0E7SUFZTXpELE9BQU9BLENBQUNBLFFBQWdCQTtRQUMzQjBELElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFFBQVFBLENBQUNBO2FBQ3BCQSxJQUFJQSxDQUFDQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTthQUN4Q0EsS0FBS0EsQ0FBQ0EsVUFBU0EsTUFBTUE7WUFDbEIsTUFBTSxJQUFJLEtBQUssQ0FBQywyQkFBMkIsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN6RCxDQUFDLENBQUNBLENBQUFBO0lBQ1ZBLENBQUNBO0lBWU0xRCxVQUFVQSxDQUFDQSxRQUFnQkEsRUFBRUEsT0FBWUE7UUFFNUMyRCxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxRQUFRQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQkEsTUFBTUEsSUFBSUEsU0FBU0EsQ0FBQ0EsMkJBQTJCQSxDQUFDQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFHREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsRUFBRUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDbkRBLENBQUNBO1FBRURBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBO1FBRWhCQSxNQUFNQSxDQUFDQSxJQUFJQSxPQUFPQSxDQUFlQSxVQUFTQSxPQUFPQSxFQUFFQSxJQUFJQTtZQUNuRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztnQkFFcEMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNuQyxDQUFDO1lBQ0QsSUFBSSxDQUFDLENBQUM7Z0JBQ0YsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7b0JBQ3BDLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7Z0JBQ25DLENBQUM7Z0JBRUQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7cUJBQ2xCLElBQUksQ0FBQyxVQUFTLENBQWlCO29CQUM1QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7d0JBQ2pCLElBQUksT0FBTyxHQUFpQixJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQ25ELE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztvQkFDckIsQ0FBQztvQkFDRCxJQUFJLENBQUMsQ0FBQzt3QkFDRixJQUFJLENBQUMsSUFBSSxLQUFLLENBQUMsR0FBRyxRQUFRLDJEQUEyRCxDQUFDLENBQUMsQ0FBQztvQkFDNUYsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBUyxNQUFNO29CQUNwQixJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQ2pCLENBQUMsQ0FBQyxDQUFDO1lBQ1gsQ0FBQztRQUNMLENBQUMsQ0FBQ0EsQ0FBQ0E7SUFDUEEsQ0FBQ0E7SUFFTzNELGFBQWFBLENBQUNBLElBQWtCQSxFQUFFQSxhQUFzQkE7UUFFNUQ0RCxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEtBQUtBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUdsQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFFbkJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtRQUN4QkEsQ0FBQ0E7UUFFREEsSUFBSUEsU0FBU0EsR0FBY0EsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFFL0NBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOUNBLElBQUlBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxREEsU0FBU0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxDQUFDQSxRQUFRQSxFQUFFQSxpQkFBaUJBLENBQUNBLENBQUNBO1FBQy9EQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsSUFBSUEsbUJBQW1CQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM1REEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsS0FBS0EsRUFBRUEsRUFBdUJBO2dCQUl6REEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNwREEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDUEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBO1FBRWpEQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUM1QkEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFHbENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUMxREEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBSTFCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFPTzVELFdBQVdBO1FBQ2Y2RCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtRQUM3QkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDeEJBLENBQUNBO0lBT083RCxZQUFZQTtRQUNoQjhELElBQUlBLENBQUNBO1lBR0RBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBO2lCQUN4QkEsSUFBSUEsQ0FBQ0EsTUFBTUE7Z0JBQ1JBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLE1BQU1BLENBQUNBO1lBQzFCQSxDQUFDQSxDQUFDQTtpQkFDREEsS0FBS0EsQ0FBQ0EsVUFBU0EsQ0FBQ0E7Z0JBQ2IsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDekIsQ0FBQyxDQUFDQSxDQUFDQTtRQUNYQSxDQUNBQTtRQUFBQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNQQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4QkEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFRTTlELE9BQU9BO1FBQ1YrRCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7SUFTTS9ELFlBQVlBLENBQUNBLFNBQWlCQTtRQUVqQ2dFLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFVBQVVBLEtBQUtBLFNBQVNBLElBQUlBLEtBQUtBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUk1QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsaUJBQWlCQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtJQUN4REEsQ0FBQ0E7SUFRTWhFLFlBQVlBO1FBQ2ZpRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUMzQkEsQ0FBQ0E7SUFTTWpFLGFBQWFBLENBQUNBLFVBQWtCQTtRQUVuQ2tFLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEtBQUtBLFVBQVVBLElBQUlBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1lBQ3JEQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxVQUFVQSxDQUFDQTtRQUk5QkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxVQUFVQSxDQUFDQSxDQUFDQTtJQUMxREEsQ0FBQ0E7SUFRTWxFLGFBQWFBO1FBQ2hCbUUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBUU1uRSxjQUFjQTtRQUNqQm9FLElBQUlBLENBQUNBLGFBQWFBLEVBQUVBLENBQUNBO1FBQ3JCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTtZQUNqQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxFQUFFQSxFQUFFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUNwRUEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7SUFDNUJBLENBQUNBO0lBT09wRSxxQkFBcUJBO1FBQ3pCcUUsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxJQUFJQSxJQUFJQSxDQUFDQTtZQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBO1FBQ2hFQSxJQUFJQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNkQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxDQUFDQTtZQUMvQixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLFdBQVcsR0FBRyxLQUFLLENBQUM7Z0JBQzNCLEtBQUssR0FBRyxDQUFDLENBQUMsV0FBVyxDQUFDO1FBQzlCLENBQUMsQ0FBQ0EsQ0FBQ0E7UUFDSEEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsR0FBR0EsS0FBS0EsQ0FBQ0E7SUFDeENBLENBQUNBO0lBRU1yRSxhQUFhQSxDQUFDQSxLQUFlQTtRQUNoQ3NFLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUV2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7WUFDbkNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBO1lBQ2pDQSxJQUFJQSxpQkFBaUJBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDekNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3pEQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUV2QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaEJBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO29CQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0E7d0JBQ1RBLEtBQUtBLENBQUNBO29CQUNWQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxDQUFDQTtvQkFDdkNBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUN6REEsQ0FBQ0E7Z0JBRURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBO29CQUNqQkEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFdkRBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLGlCQUFpQkEsQ0FBQ0E7b0JBQzdCQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxpQkFBaUJBLENBQUNBO1FBQ3pDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQVNNdEUsT0FBT0EsQ0FBQ0EsR0FBV0E7UUFDdEJ1RSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNqQ0EsQ0FBQ0E7SUFXTXZFLFFBQVFBLENBQUNBLFFBQWdCQSxFQUFFQSxPQUFlQTtRQUM3Q3dFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO0lBQ2hEQSxDQUFDQTtJQVFNeEUsU0FBU0E7UUFDWnlFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQVNNekUsWUFBWUEsQ0FBQ0EsS0FBWUE7UUFDNUIwRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxJQUFJQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUNyRUEsQ0FBQ0E7SUFXTTFFLE1BQU1BLENBQUNBLFFBQWtCQSxFQUFFQSxJQUFZQTtRQUMxQzJFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQzNDQSxDQUFDQTtJQVVNM0UsTUFBTUEsQ0FBQ0EsS0FBWUE7UUFDdEI0RSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtJQUNsQ0EsQ0FBQ0E7SUFZTTVFLFdBQVdBLENBQUNBLE1BQWVBLEVBQUVBLFVBQW9CQTtRQUNwRDZFLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2ZBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RCQSxJQUFJQSxhQUFhQSxHQUFVQSxJQUFJQSxDQUFDQTtRQUNoQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDM0NBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxLQUFLQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeEJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwQ0EsYUFBYUE7b0JBQ1RBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsSUFBSUEsRUFBRUEsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFDbEVBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNGQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxTQUFTQTtvQkFDM0JBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNuQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDYkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDdkJBLGFBQWFBO1lBQ1RBLElBQUlBLENBQUNBLFdBQVdBO1lBQ2hCQSxDQUFDQSxVQUFVQTtZQUNYQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxpQkFBaUJBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3BEQSxNQUFNQSxDQUFDQSxhQUFhQSxDQUFDQTtJQUN6QkEsQ0FBQ0E7SUFVTTdFLFdBQVdBLENBQUNBLE1BQWVBLEVBQUVBLFVBQW9CQTtRQUNwRDhFLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO1lBQ2ZBLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RCQSxJQUFJQSxhQUFhQSxHQUFVQSxJQUFJQSxDQUFDQTtRQUNoQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDckNBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNuQ0EsYUFBYUE7b0JBQ1RBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsS0FBS0EsRUFBRUEsYUFBYUEsQ0FBQ0EsQ0FBQ0E7WUFDbkVBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3ZCQSxhQUFhQTtZQUNUQSxJQUFJQSxDQUFDQSxXQUFXQTtZQUNoQkEsQ0FBQ0EsVUFBVUE7WUFDWEEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUNwREEsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0E7SUFDekJBLENBQUNBO0lBU085RSxhQUFhQSxDQUFDQSxNQUFlQTtRQUNqQytFLElBQUlBLENBQUNBLFdBQVdBLEdBQUdBLE1BQU1BLENBQUNBO0lBQzlCQSxDQUFDQTtJQUVPL0UsaUJBQWlCQSxDQUFDQSxNQUEwQ0EsRUFBRUEsTUFBZUEsRUFBRUEsYUFBb0JBO1FBQ3ZHZ0Ysa0JBQWtCQSxLQUF5QkE7WUFDdkNDLElBQUlBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLFlBQVlBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLGFBQWFBLENBQUNBO1lBQzdFQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNyQ0EsQ0FBQ0E7UUFFREQsSUFBSUEsS0FBS0EsR0FBcUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hEQSxJQUFJQSxLQUFZQSxDQUFDQTtRQUNqQkEsSUFBSUEsS0FBc0NBLENBQUNBO1FBQzNDQSxJQUFJQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQy9EQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwRUEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO2dCQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9DQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDOURBLENBQUNBO2dCQUNEQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBO1lBQzdCQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNuRUEsQ0FBQ0E7Z0JBQ0RBLGlCQUFpQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDOUJBLENBQUNBO1FBQ0xBLENBQUNBO1FBSURBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOURBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNwRUEsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDdEVBLENBQUNBO1lBRURBLElBQUlBLEdBQUdBLEdBQUdBLGFBQWFBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDeEVBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQVlNaEYsT0FBT0EsQ0FBQ0EsS0FBWUEsRUFBRUEsSUFBWUE7UUFDckNrRixNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFhTWxGLFFBQVFBLENBQUNBLFNBQWdCQSxFQUFFQSxVQUFvQkEsRUFBRUEsSUFBYUE7UUFDakVtRixJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeEZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNwQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNwRkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcERBLE9B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QUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUMxREEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFM0JBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN4QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQTtvQkFDdEJBLEtBQUtBLENBQUNBO1lBQ2RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNyQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNuQ0EsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO2dCQUM3QkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQzdCQSxDQUFDQTtJQUNMQSxD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TUEsQ0FBQ0E7UUFDM0JBLElBQUlBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3RDQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNuQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQzNCQSxJQUFJQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUV4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQkEsT0FBT0EsR0FBR0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNGQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7WUFDREEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDbEVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLEdBQUdBLEdBQUdBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBO1FB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QUNBO3dCQUNoRUEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFTEEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxDQUFDQTtnQkFFREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQ3RDQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO3dCQUNqQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFHRkEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVqQ0EsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFD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Q1QsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQ0EsQ0FBQ0E7WUFFUEEsWUFBWUEsSUFBSUEsR0FBR0EsQ0FBQ0E7WUFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1lBQzFCQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFFREQsT0FBT0EsYUFBYUEsR0FBR0EsU0FBU0EsR0FBR0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFFM0NBLElBQUlBLEtBQUtBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1lBSWxDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFNdkRBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoQkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFNREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsaUJBQWlCQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxnQkFBZ0JBLENBQUNBLENBQUNBLENBQUNBO2dCQUkxRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxpQkFBaUJBLENBQUNBLENBQUNBLENBQUNBO3dCQUdyQ0EsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFJREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxR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RUFBRUEsQ0FBQ0E7WUFDbENBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVEEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDckRBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNkQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDL0JBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUN4QkEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaERBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1lBQzFCQSxDQUFDQTtZQUVEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxXQUFXQSxDQUFDQSxD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QSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsSUFBSUEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxJQUFJQSxPQUFPQSxHQUFHQSxTQUFTQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckJBLENBQUNBO1FBRURBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUM1Q0EsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFekRBLE9BQU9BLEdBQUdBLElBQUlBLFNBQVNBLEVBQUVBLENBQUNBO1lBQ3RCQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsR0FBR0EsU0FBU0EsSUFBSUEsTUFBTUEsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0E7Z0JB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LHdCQUF3QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbEZBLE1BQU1BLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBLEdBQUdBLEVBQUVBLGNBQWNBLENBQUNBLE1BQU1BLEVBQUVBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO0lBQ3ZHQSxDQUFDQTtJQVFNM0gsZUFBZUE7UUFDbEI0SCxJQUFJQSxVQUFVQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNuQkEsSUFBSUEsSUFBSUEsR0FBYUEsSUFBSUEsQ0FBQ0E7UUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUc5QkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDOUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN2Q0EsSUFBSUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxVQUFVQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNoREEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDcENBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNB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R0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFaEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNqREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBR1hBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUdqQkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUNwQ0EsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDckNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNaQSxLQUFLQSxDQUFDQTtnQkFDVkEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNsQkEsUUFBUUEsQ0FBQ0E7Z0JBQ2JBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUVGQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDWkEsS0FBS0EsQ0FBQ0E7Z0JBQ1ZBLENBQUNBO2dCQUNMQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBRWhCQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7SUFLRG5JLG1CQUFtQkEsQ0FBQ0EsTUFBTUE7UUFDdEJvSSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsS0FBS0EsR0FBV0EsRUFBRUEsQ0FBQ0E7WUFDdkJBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLEtBQUtBO2dCQUN6QixLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdEQsQ0FBQyxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNiQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUM3Q0EsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBUURwSSxXQUFXQTtRQUNQcUksSUFBSUEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFFL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO1lBQ3JDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtnQkFDOUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRTFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFtQkRySSxlQUFlQSxDQUFDQSxHQUFXQSxFQUFFQSxNQUFjQSxFQUFFQSxJQUFZQSxFQUFFQSxRQUFtQkE7UUFDMUVzSSxRQUFRQSxHQUFHQSxRQUFRQSxJQUFJQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDVkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFFaEJBLElBQUlBLFFBQVFBLEdBQUdBO1lBQ1hBLEdBQUdBLEVBQUVBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO1NBQ3JCQSxDQUFDQTtRQUVGQSxJQUFJQSxHQUFXQSxDQUFDQTtRQUNoQkEsSUFBSUEsSUFBVUEsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDN0NBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyRkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNoQkEsQ0FBQ0E7WUFDREEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO1lBQ0xBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRXRFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMxREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDZkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ25CQSxDQUFDQTtJQUVEdEksV0FBV0EsQ0FBQ0EsTUFBY0EsRUFBRUEsYUFBd0JBO1FBQ2hEdUksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3REEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUdEdkksZUFBZUEsQ0FBQ0EsTUFBY0EsRUFBRUEsYUFBd0JBO1FBQ3BEd0ksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVEeEksaUJBQWlCQSxDQUFDQSxLQUFhQSxFQUFFQSxJQUFZQTtRQUN6Q3lJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQzlCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDdkNBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLEVBQ3RCQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUN0QkEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0E7d0JBQ2ZBLFFBQVFBLElBQUlBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBO29CQUM3QkEsSUFBSUE7d0JBQ0FBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNyQkEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0E7b0JBQ2ZBLFFBQVFBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBO2dCQUM1QkEsSUFBSUE7b0JBQ0FBLFFBQVFBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3BDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFT3pJLFlBQVlBLENBQUNBLFFBQWtCQTtRQUNuQzBJLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQzlCQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFTQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUM3QixNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7UUFDckMsQ0FBQyxDQUFDQSxDQUFDQTtRQUNIQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFTRDFJLE9BQU9BLENBQUNBLFdBQTBCQSxFQUFFQSxLQUFZQTtRQUM1QzJJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQzlCQSxJQUFJQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUNsQkEsSUFBSUEsSUFBVUEsQ0FBQ0E7UUFFZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsWUFBWUEsSUFBSUEsQ0FBQ0E7WUFDNUJBLElBQUlBLEdBQUdBLFdBQVdBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxXQUFXQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2Q0EsSUFBSUEsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsS0FBS0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQTtRQUNuREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EseUNBQXlDQSxDQUFDQSxDQUFDQTtRQUMvREEsQ0FBQ0E7UUFHREEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFBQTtRQUVsREEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDOUJBLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1FBQ3BDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUMxQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFHaENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLEdBQUdBLE1BQU1BO1lBQ25CQSxRQUFRQSxJQUFJQSxNQUFNQSxJQUFJQSxXQUFXQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwREEsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsaURBQWlEQSxDQUFDQSxDQUFDQTtRQUV2RUEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekRBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxPQUFPQSxJQUFJQSxTQUFTQSxDQUFDQTtZQUNsQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFdENBLEVBQUVBLENBQUNBLENBQ0NBLENBQUNBLFNBQVNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO2VBQzNEQSxDQUFDQSxPQUFPQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUMxREEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsOENBQThDQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNuR0EsQ0FBQ0E7UUFHREEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRW5CQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUV4QkEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsT0FBT0E7Z0JBQzFCLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDN0IsQ0FBQyxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUN2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDYkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFaEJBLElBQUlBLFlBQVlBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsSUFBSUEsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBRW5EQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTt3QkFDN0JBLEtBQUtBLENBQUNBO29CQUNWQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDUEEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFdkVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqRUEsSUFBSUE7WUFDQUEsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUd2RUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFLdkJBLElBQUlBLFNBQVNBLEdBQWNBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBO1FBQ3pEQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUU3Q0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRUQzSSxXQUFXQSxDQUFDQSxRQUFpQkE7SUFFN0I0SSxDQUFDQTtJQUVENUksUUFBUUEsQ0FBQ0EsS0FBYUE7UUFDbEI2SSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxJQUFJQTtZQUN2QixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFFRDdJLFVBQVVBLENBQUNBLElBQVVBO1FBQ2pCOEksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDN0JBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ2xDQSxJQUFJQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUU5QkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBO1FBRzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNaQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNuREEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDN0RBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVEQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNkQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN4Q0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDbERBLENBQUNBO1FBQ0RBLElBQUlBLENBS0FBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2ZBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUdOQSxDQUFDQTtZQUNHQSxJQUFJQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwRUEsS0FBS0EsR0FBR0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDMUJBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQzNDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFFYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0Es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QU1BLENBQUNBO1lBQ1hBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUN6QkEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1lBQ05BLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRS9EQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxLQUFLQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwREEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLFdBQVdBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2QkEsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDdkNBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO2dCQUN2QkEsTUFBTUEsQ0FBQ0E7WUFDWEEsV0FBV0EsR0FBR0EsV0FBV0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFD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QUFJQSxDQUFDQSxhQUFhQSxDQUFDQTtZQUNwQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDbkNBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBRTdCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxLQUFLQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFbEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1BBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBO2dCQUNoQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLElBQUlBO2dCQUNBQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUUvQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzlEQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcENBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN0QkEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUNiQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDeENBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3BDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxFQUFFQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM1REEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLE1BQU1BLEdBQUdBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1lBQ2xEQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxPQUFPQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNsRUEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBRWRBLEtBQUtBLENBQUNBLGdCQUFnQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDbkNBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFFRGhLLGdCQUFnQkEsQ0FBQ0EsWUFBWUE7UUFDekJpSyxJQUFJQSxHQUFHQSxHQUFXQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNqREEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDaENBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFNUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ05BLE1BQU1BLENBQUNBO1FBRVhBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDbERBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRXRDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN0QkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFNURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNQQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1lBQy9CQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEakssaUJBQWlCQSxDQUFDQSxDQUE2Q0EsRUFBRUEsV0FBd0JBO1FBQ3JGa0ssSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDbkJBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3hCQSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUMvQkEsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFbkNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUNEQSxJQUFJ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LENBQUM7Z0JBQUMsTUFBTSxDQUFDO1lBRXhELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO1lBQ3hCLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUNELFlBQVksRUFBRSxDQUFDO1FBQ2YsVUFBVSxFQUFFLElBQUk7S0FDbkI7SUFDRCxTQUFTLEVBQUU7UUFDUCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RCxZQUFZLEVBQUUsS0FBSztLQUN0QjtJQUNELFdBQVcsRUFBRTtRQUNULEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDbkQsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUEsQ0FBQyxDQUFDO1FBQ3BELFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsSUFBSSxFQUFFO1FBQ0YsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ3hDLEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFBLENBQUMsQ0FBQztLQUMxQztDQUNKLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG4vLyBcInVzZSBzdHJpY3RcIjsgVW5jYXVnaHQgKGluIHByb21pc2UpIFN5bnRheEVycm9yOiBVbmV4cGVjdGVkIHRva2VuID1cblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgc3RyaW5nUmVwZWF0fSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IEFubm90YXRpb24gZnJvbSAnLi9Bbm5vdGF0aW9uJztcbmltcG9ydCBEZWx0YSBmcm9tIFwiLi9EZWx0YVwiO1xuaW1wb3J0IERlbHRhRXZlbnQgZnJvbSBcIi4vRGVsdGFFdmVudFwiO1xuaW1wb3J0IER5bmFtaWNNYXJrZXIgZnJvbSBcIi4vRHluYW1pY01hcmtlclwiO1xuaW1wb3J0IEV2ZW50QnVzIGZyb20gXCIuL0V2ZW50QnVzXCI7XG5pbXBvcnQgRXZlbnRFbWl0dGVyQ2xhc3MgZnJvbSBcIi4vbGliL0V2ZW50RW1pdHRlckNsYXNzXCI7XG5pbXBvcnQgRm9sZExpbmUgZnJvbSBcIi4vRm9sZExpbmVcIjtcbmltcG9ydCBGb2xkIGZyb20gXCIuL0ZvbGRcIjtcbmltcG9ydCBGb2xkRXZlbnQgZnJvbSBcIi4vRm9sZEV2ZW50XCI7XG5pbXBvcnQgU2VsZWN0aW9uIGZyb20gXCIuL1NlbGVjdGlvblwiO1xuaW1wb3J0IExhbmd1YWdlTW9kZSBmcm9tIFwiLi9MYW5ndWFnZU1vZGVcIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IFRva2VuIGZyb20gXCIuL1Rva2VuXCI7XG5pbXBvcnQgVG9rZW5pemVyIGZyb20gXCIuL1Rva2VuaXplclwiO1xuaW1wb3J0IERvY3VtZW50IGZyb20gXCIuL0RvY3VtZW50XCI7XG5pbXBvcnQgQmFja2dyb3VuZFRva2VuaXplciBmcm9tIFwiLi9CYWNrZ3JvdW5kVG9rZW5pemVyXCI7XG5pbXBvcnQgU2VhcmNoSGlnaGxpZ2h0IGZyb20gXCIuL1NlYXJjaEhpZ2hsaWdodFwiO1xuaW1wb3J0IHthc3NlcnR9IGZyb20gJy4vbGliL2Fzc2VydHMnO1xuaW1wb3J0IEJyYWNrZXRNYXRjaCBmcm9tIFwiLi9CcmFja2V0TWF0Y2hcIjtcbmltcG9ydCBVbmRvTWFuYWdlciBmcm9tICcuL1VuZG9NYW5hZ2VyJ1xuaW1wb3J0IFRva2VuSXRlcmF0b3IgZnJvbSAnLi9Ub2tlbkl0ZXJhdG9yJztcbmltcG9ydCBGb250TWV0cmljcyBmcm9tIFwiLi9sYXllci9Gb250TWV0cmljc1wiO1xuaW1wb3J0IFdvcmtlckNsaWVudCBmcm9tIFwiLi93b3JrZXIvV29ya2VyQ2xpZW50XCI7XG5pbXBvcnQgTGluZVdpZGdldCBmcm9tICcuL0xpbmVXaWRnZXQnO1xuaW1wb3J0IExpbmVXaWRnZXRNYW5hZ2VyIGZyb20gJy4vTGluZVdpZGdldE1hbmFnZXInO1xuaW1wb3J0IFBvc2l0aW9uIGZyb20gJy4vUG9zaXRpb24nO1xuaW1wb3J0IEZvbGRNb2RlIGZyb20gXCIuL21vZGUvZm9sZGluZy9Gb2xkTW9kZVwiO1xuaW1wb3J0IFRleHRNb2RlIGZyb20gXCIuL21vZGUvVGV4dE1vZGVcIjtcblxuLy8gXCJUb2tlbnNcIlxudmFyIENIQVIgPSAxLFxuICAgIENIQVJfRVhUID0gMixcbiAgICBQTEFDRUhPTERFUl9TVEFSVCA9IDMsXG4gICAgUExBQ0VIT0xERVJfQk9EWSA9IDQsXG4gICAgUFVOQ1RVQVRJT04gPSA5LFxuICAgIFNQQUNFID0gMTAsXG4gICAgVEFCID0gMTEsXG4gICAgVEFCX1NQQUNFID0gMTI7XG5cbi8vIEZvciBldmVyeSBrZXlzdHJva2UgdGhpcyBnZXRzIGNhbGxlZCBvbmNlIHBlciBjaGFyIGluIHRoZSB3aG9sZSBkb2MhIVxuLy8gV291bGRuJ3QgaHVydCB0byBtYWtlIGl0IGEgYml0IGZhc3RlciBmb3IgYyA+PSAweDExMDBcbmZ1bmN0aW9uIGlzRnVsbFdpZHRoKGM6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGlmIChjIDwgMHgxMTAwKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGMgPj0gMHgxMTAwICYmIGMgPD0gMHgxMTVGIHx8XG4gICAgICAgIGMgPj0gMHgxMUEzICYmIGMgPD0gMHgxMUE3IHx8XG4gICAgICAgIGMgPj0gMHgxMUZBICYmIGMgPD0gMHgxMUZGIHx8XG4gICAgICAgIGMgPj0gMHgyMzI5ICYmIGMgPD0gMHgyMzJBIHx8XG4gICAgICAgIGMgPj0gMHgyRTgwICYmIGMgPD0gMHgyRTk5IHx8XG4gICAgICAgIGMgPj0gMHgyRTlCICYmIGMgPD0gMHgyRUYzIHx8XG4gICAgICAgIGMgPj0gMHgyRjAwICYmIGMgPD0gMHgyRkQ1IHx8XG4gICAgICAgIGMgPj0gMHgyRkYwICYmIGMgPD0gMHgyRkZCIHx8XG4gICAgICAgIGMgPj0gMHgzMDAwICYmIGMgPD0gMHgzMDNFIHx8XG4gICAgICAgIGMgPj0gMHgzMDQxICYmIGMgPD0gMHgzMDk2IHx8XG4gICAgICAgIGMgPj0gMHgzMDk5ICYmIGMgPD0gMHgzMEZGIHx8XG4gICAgICAgIGMgPj0gMHgzMTA1ICYmIGMgPD0gMHgzMTJEIHx8XG4gICAgICAgIGMgPj0gMHgzMTMxICYmIGMgPD0gMHgzMThFIHx8XG4gICAgICAgIGMgPj0gMHgzMTkwICYmIGMgPD0gMHgzMUJBIHx8XG4gICAgICAgIGMgPj0gMHgzMUMwICYmIGMgPD0gMHgzMUUzIHx8XG4gICAgICAgIGMgPj0gMHgzMUYwICYmIGMgPD0gMHgzMjFFIHx8XG4gICAgICAgIGMgPj0gMHgzMjIwICYmIGMgPD0gMHgzMjQ3IHx8XG4gICAgICAgIGMgPj0gMHgzMjUwICYmIGMgPD0gMHgzMkZFIHx8XG4gICAgICAgIGMgPj0gMHgzMzAwICYmIGMgPD0gMHg0REJGIHx8XG4gICAgICAgIGMgPj0gMHg0RTAwICYmIGMgPD0gMHhBNDhDIHx8XG4gICAgICAgIGMgPj0gMHhBNDkwICYmIGMgPD0gMHhBNEM2IHx8XG4gICAgICAgIGMgPj0gMHhBOTYwICYmIGMgPD0gMHhBOTdDIHx8XG4gICAgICAgIGMgPj0gMHhBQzAwICYmIGMgPD0gMHhEN0EzIHx8XG4gICAgICAgIGMgPj0gMHhEN0IwICYmIGMgPD0gMHhEN0M2IHx8XG4gICAgICAgIGMgPj0gMHhEN0NCICYmIGMgPD0gMHhEN0ZCIHx8XG4gICAgICAgIGMgPj0gMHhGOTAwICYmIGMgPD0gMHhGQUZGIHx8XG4gICAgICAgIGMgPj0gMHhGRTEwICYmIGMgPD0gMHhGRTE5IHx8XG4gICAgICAgIGMgPj0gMHhGRTMwICYmIGMgPD0gMHhGRTUyIHx8XG4gICAgICAgIGMgPj0gMHhGRTU0ICYmIGMgPD0gMHhGRTY2IHx8XG4gICAgICAgIGMgPj0gMHhGRTY4ICYmIGMgPD0gMHhGRTZCIHx8XG4gICAgICAgIGMgPj0gMHhGRjAxICYmIGMgPD0gMHhGRjYwIHx8XG4gICAgICAgIGMgPj0gMHhGRkUwICYmIGMgPD0gMHhGRkU2O1xufVxuXG4vKipcbiAqIEBjbGFzcyBFZGl0U2Vzc2lvblxuICovXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBFZGl0U2Vzc2lvbiBpbXBsZW1lbnRzIEV2ZW50QnVzPEVkaXRTZXNzaW9uPiB7XG4gICAgcHVibGljICRicmVha3BvaW50czogc3RyaW5nW10gPSBbXTtcbiAgICBwdWJsaWMgJGRlY29yYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIHByaXZhdGUgJGZyb250TWFya2VyczogeyBbaWQ6IG51bWJlcl06IER5bmFtaWNNYXJrZXIgfSA9IHt9O1xuICAgIHB1YmxpYyAkYmFja01hcmtlcnM6IHsgW2lkOiBudW1iZXJdOiBEeW5hbWljTWFya2VyIH0gPSB7fTtcbiAgICBwcml2YXRlICRtYXJrZXJJZCA9IDE7XG4gICAgcHJpdmF0ZSAkdW5kb1NlbGVjdCA9IHRydWU7XG4gICAgcHJpdmF0ZSAkZGVsdGFzO1xuICAgIHByaXZhdGUgJGRlbHRhc0RvYztcbiAgICBwcml2YXRlICRkZWx0YXNGb2xkO1xuICAgIHByaXZhdGUgJGZyb21VbmRvO1xuXG4gICAgcHVibGljIHdpZGdldE1hbmFnZXI6IExpbmVXaWRnZXRNYW5hZ2VyO1xuICAgIHByaXZhdGUgJHVwZGF0ZUZvbGRXaWRnZXRzOiAoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikgPT4gYW55O1xuICAgIHByaXZhdGUgJGZvbGREYXRhOiBGb2xkTGluZVtdO1xuICAgIHB1YmxpYyBmb2xkV2lkZ2V0czogYW55W107XG4gICAgcHVibGljIGdldEZvbGRXaWRnZXQ6IChyb3c6IG51bWJlcikgPT4gYW55O1xuICAgIHB1YmxpYyBnZXRGb2xkV2lkZ2V0UmFuZ2U6IChyb3c6IG51bWJlciwgZm9yY2VNdWx0aWxpbmU/OiBib29sZWFuKSA9PiBSYW5nZTtcbiAgICBwdWJsaWMgX2NoYW5nZWRXaWRnZXRzOiBMaW5lV2lkZ2V0W107XG5cbiAgICBwdWJsaWMgZG9jOiBEb2N1bWVudDtcbiAgICBwcml2YXRlICRkZWZhdWx0VW5kb01hbmFnZXIgPSB7IHVuZG86IGZ1bmN0aW9uKCkgeyB9LCByZWRvOiBmdW5jdGlvbigpIHsgfSwgcmVzZXQ6IGZ1bmN0aW9uKCkgeyB9IH07XG4gICAgcHJpdmF0ZSAkdW5kb01hbmFnZXI6IFVuZG9NYW5hZ2VyO1xuICAgIHByaXZhdGUgJGluZm9ybVVuZG9NYW5hZ2VyOiB7IGNhbmNlbDogKCkgPT4gdm9pZDsgc2NoZWR1bGU6ICgpID0+IHZvaWQgfTtcbiAgICBwdWJsaWMgYmdUb2tlbml6ZXI6IEJhY2tncm91bmRUb2tlbml6ZXI7XG4gICAgcHVibGljICRtb2RpZmllZDtcbiAgICBwcml2YXRlIHNlbGVjdGlvbjogU2VsZWN0aW9uO1xuICAgIHByaXZhdGUgJGRvY1Jvd0NhY2hlOiBudW1iZXJbXTtcbiAgICBwcml2YXRlICR3cmFwRGF0YTogbnVtYmVyW11bXTtcbiAgICBwcml2YXRlICRzY3JlZW5Sb3dDYWNoZTogbnVtYmVyW107XG4gICAgcHJpdmF0ZSAkcm93TGVuZ3RoQ2FjaGU7XG4gICAgcHJpdmF0ZSAkb3ZlcndyaXRlID0gZmFsc2U7XG4gICAgcHVibGljICRzZWFyY2hIaWdobGlnaHQ6IFNlYXJjaEhpZ2hsaWdodDtcbiAgICBwcml2YXRlICRhbm5vdGF0aW9uczogQW5ub3RhdGlvbltdO1xuICAgIHByaXZhdGUgJGF1dG9OZXdMaW5lO1xuICAgIHByaXZhdGUgZ2V0T3B0aW9uO1xuICAgIHByaXZhdGUgc2V0T3B0aW9uO1xuXG4gICAgLyoqXG4gICAgICogQHByb3BlcnR5IGV2ZW50QnVzXG4gICAgICogQHR5cGUgRXZlbnRFbWl0dGVyQ2xhc3NcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgZXZlbnRCdXM6IEV2ZW50RW1pdHRlckNsYXNzPEVkaXRTZXNzaW9uPjtcblxuICAgIC8qKlxuICAgICAqIERldGVybWluZXMgd2hldGhlciB0aGUgd29ya2VyIHdpbGwgYmUgc3RhcnRlZC5cbiAgICAgKlxuICAgICAqIEBwcm9wZXJ0eSAkdXNlV29ya2VyXG4gICAgICogQHR5cGUge2Jvb2xlYW59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlICR1c2VXb3JrZXI6IGJvb2xlYW47XG4gICAgLyoqXG4gICAgICpcbiAgICAgKi9cbiAgICBwcml2YXRlICRtb2RlczogeyBbcGF0aDogc3RyaW5nXTogTGFuZ3VhZ2VNb2RlIH0gPSB7fTtcblxuICAgIC8qKlxuICAgICAqXG4gICAgICovXG4gICAgcHVibGljICRtb2RlOiBMYW5ndWFnZU1vZGUgPSBudWxsO1xuICAgIHByaXZhdGUgJG1vZGVJZCA9IG51bGw7XG4gICAgLyoqXG4gICAgICogVGhlIHdvcmtlciBjb3JyZXNwb25kaW5nIHRvIHRoZSBtb2RlIChpLmUuIExhbmd1YWdlKS5cbiAgICAgKi9cbiAgICBwcml2YXRlICR3b3JrZXI6IFdvcmtlckNsaWVudDtcbiAgICBwcml2YXRlICRvcHRpb25zO1xuICAgIHB1YmxpYyB0b2tlblJlOiBSZWdFeHA7XG4gICAgcHVibGljIG5vblRva2VuUmU6IFJlZ0V4cDtcbiAgICBwdWJsaWMgJHNjcm9sbFRvcCA9IDA7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsTGVmdCA9IDA7XG4gICAgLy8gV1JBUE1PREVcbiAgICBwcml2YXRlICR3cmFwQXNDb2RlO1xuICAgIHByaXZhdGUgJHdyYXBMaW1pdCA9IDgwO1xuICAgIHB1YmxpYyAkdXNlV3JhcE1vZGUgPSBmYWxzZTtcbiAgICBwcml2YXRlICR3cmFwTGltaXRSYW5nZSA9IHtcbiAgICAgICAgbWluOiBudWxsLFxuICAgICAgICBtYXg6IG51bGxcbiAgICB9O1xuICAgIHB1YmxpYyAkdXBkYXRpbmc7XG4gICAgcHJpdmF0ZSAkb25DaGFuZ2UgPSB0aGlzLm9uQ2hhbmdlLmJpbmQodGhpcyk7XG4gICAgcHJpdmF0ZSAkc3luY0luZm9ybVVuZG9NYW5hZ2VyOiAoKSA9PiB2b2lkO1xuICAgIHB1YmxpYyBtZXJnZVVuZG9EZWx0YXM6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdXNlU29mdFRhYnM6IGJvb2xlYW47XG4gICAgcHJpdmF0ZSAkdGFiU2l6ZTogbnVtYmVyO1xuICAgIHByaXZhdGUgJHdyYXBNZXRob2Q7XG4gICAgcHJpdmF0ZSBzY3JlZW5XaWR0aDogbnVtYmVyO1xuICAgIHB1YmxpYyBsaW5lV2lkZ2V0czogTGluZVdpZGdldFtdID0gbnVsbDtcbiAgICBwcml2YXRlIGxpbmVXaWRnZXRzV2lkdGg6IG51bWJlcjtcbiAgICBwdWJsaWMgbGluZVdpZGdldFdpZHRoOiBudW1iZXI7XG4gICAgcHVibGljICRnZXRXaWRnZXRTY3JlZW5MZW5ndGg7XG4gICAgLy9cbiAgICBwdWJsaWMgJHRhZ0hpZ2hsaWdodDtcbiAgICAvKipcbiAgICAgKiBUaGlzIGlzIGEgbWFya2VyIGlkZW50aWZpZXIuXG4gICAgICovXG4gICAgcHVibGljICRicmFja2V0SGlnaGxpZ2h0OiBudW1iZXI7XG4gICAgLyoqXG4gICAgICogVGhpcyBpcyByZWFsbHkgYSBSYW5nZSB3aXRoIGFuIGFkZGVkIG1hcmtlciBpZC5cbiAgICAgKi9cbiAgICBwdWJsaWMgJGhpZ2hsaWdodExpbmVNYXJrZXI6IFJhbmdlO1xuICAgIC8qKlxuICAgICAqIEEgbnVtYmVyIGlzIGEgbWFya2VyIGlkZW50aWZpZXIsIG51bGwgaW5kaWNhdGVzIHRoYXQgbm8gc3VjaCBtYXJrZXIgZXhpc3RzLiBcbiAgICAgKi9cbiAgICBwdWJsaWMgJHNlbGVjdGlvbk1hcmtlcjogbnVtYmVyID0gbnVsbDtcbiAgICBwcml2YXRlICRicmFja2V0TWF0Y2hlciA9IG5ldyBCcmFja2V0TWF0Y2godGhpcyk7XG5cbiAgICAvKipcbiAgICAgKiBAY2xhc3MgRWRpdFNlc3Npb25cbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAcGFyYW0gZG9jIHtEb2N1bWVudH1cbiAgICAgKi9cbiAgICBjb25zdHJ1Y3Rvcihkb2M6IERvY3VtZW50KSB7XG4gICAgICAgIGlmICghKGRvYyBpbnN0YW5jZW9mIERvY3VtZW50KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignZG9jIG11c3QgYmUgYW4gRG9jdW1lbnQnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmV2ZW50QnVzID0gbmV3IEV2ZW50RW1pdHRlckNsYXNzPEVkaXRTZXNzaW9uPih0aGlzKTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEgPSBbXTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmpvaW4oXCJcXG5cIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihcImNoYW5nZUZvbGRcIiwgdGhpcy5vbkNoYW5nZUZvbGQuYmluZCh0aGlzKSk7XG4gICAgICAgIHRoaXMuc2V0RG9jdW1lbnQoZG9jKTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHRoaXMpO1xuXG4gICAgICAgIHJlc2V0T3B0aW9ucyh0aGlzKTtcblxuICAgICAgICAvLyBXaXRob3V0IGEgbW9kZSBhbGwgaGVsbCBicmVha3MgbG9vc2UuXG4gICAgICAgIC8vIFdlIGRvbid0IGNhcmUgYWJvdXQgdGhlIHdvcmtlVXJsIG9yIHNjcmlwdEltcG9ydHMgYXJndW1lbnRzXG4gICAgICAgIC8vIGJlY2F1c2UgdGhlcmUgaXMgbm8gdGhyZWFkIGZvciB0ZXh0LlxuICAgICAgICB0aGlzLnNldExhbmd1YWdlTW9kZShuZXcgVGV4dE1vZGUoJycsIFtdKSk7XG5cbiAgICAgICAgLy8gRklYTUU6IFRoaXMgd2FzIGEgc2lnbmFsIHRvIGEgZ2xvYmFsIGNvbmZpZyBvYmplY3QuXG4gICAgICAgIC8vIF9zaWduYWwoXCJzZXNzaW9uXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb25cbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvbihldmVudE5hbWU6IHN0cmluZywgY2FsbGJhY2s6IChldmVudDogYW55LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikgPT4gYW55KTogdm9pZCB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oZXZlbnROYW1lLCBjYWxsYmFjaywgZmFsc2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2Qgb2ZmXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBjYWxsYmFjayB7KGV2ZW50LCBzZXNzaW9uOiBFZGl0U2Vzc2lvbikgPT4gYW55fVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgb2ZmKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNlc3Npb246IEVkaXRTZXNzaW9uKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vZmYoZXZlbnROYW1lLCBjYWxsYmFjayk7XG4gICAgfVxuXG4gICAgX2VtaXQoZXZlbnROYW1lOiBzdHJpbmcsIGV2ZW50PzogYW55KSB7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoZXZlbnROYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgX3NpZ25hbChldmVudE5hbWU6IHN0cmluZywgZXZlbnQ/OiBhbnkpIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKGV2ZW50TmFtZSwgZXZlbnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGBFZGl0U2Vzc2lvbmAgdG8gcG9pbnQgdG8gYSBuZXcgYERvY3VtZW50YC5cbiAgICAgKiBJZiBhIGBCYWNrZ3JvdW5kVG9rZW5pemVyYCBleGlzdHMsIGl0IGFsc28gcG9pbnRzIHRvIGBkb2NgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXREb2N1bWVudFxuICAgICAqIEBwYXJhbSBkb2Mge0RvY3VtZW50fSBUaGUgbmV3IGBEb2N1bWVudGAgdG8gdXNlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXREb2N1bWVudChkb2M6IERvY3VtZW50KTogdm9pZCB7XG4gICAgICAgIGlmICghKGRvYyBpbnN0YW5jZW9mIERvY3VtZW50KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiZG9jIG11c3QgYmUgYSBEb2N1bWVudFwiKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kb2MpIHtcbiAgICAgICAgICAgIHRoaXMuZG9jLm9mZihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmRvYyA9IGRvYztcbiAgICAgICAgZG9jLm9uKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcblxuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZXNldENhY2hlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGBEb2N1bWVudGAgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc2Vzc2lvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0RG9jdW1lbnRcbiAgICAgKiBAcmV0dXJuIHtEb2N1bWVudH1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnQoKTogRG9jdW1lbnQge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCAkcmVzZXRSb3dDYWNoZVxuICAgICAqIEBwYXJhbSBkb2NSb3cge251bWJlcn0gVGhlIHJvdyB0byB3b3JrIHdpdGguXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJHJlc2V0Um93Q2FjaGUoZG9jUm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKCFkb2NSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlID0gW107XG4gICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZSA9IFtdO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBsID0gdGhpcy4kZG9jUm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgodGhpcy4kZG9jUm93Q2FjaGUsIGRvY1JvdykgKyAxO1xuICAgICAgICBpZiAobCA+IGkpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFJvd0NhY2hlSW5kZXgoY2FjaGVBcnJheTogbnVtYmVyW10sIHZhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGxvdyA9IDA7XG4gICAgICAgIHZhciBoaSA9IGNhY2hlQXJyYXkubGVuZ3RoIC0gMTtcblxuICAgICAgICB3aGlsZSAobG93IDw9IGhpKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gKGxvdyArIGhpKSA+PiAxO1xuICAgICAgICAgICAgdmFyIGMgPSBjYWNoZUFycmF5W21pZF07XG5cbiAgICAgICAgICAgIGlmICh2YWwgPiBjKSB7XG4gICAgICAgICAgICAgICAgbG93ID0gbWlkICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbCA8IGMpIHtcbiAgICAgICAgICAgICAgICBoaSA9IG1pZCAtIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWlkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxvdyAtIDE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldENhY2hlcygpIHtcbiAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IFtdO1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VGb2xkKGV2ZW50OiBGb2xkRXZlbnQpOiB2b2lkIHtcbiAgICAgICAgdmFyIGZvbGQgPSBldmVudC5kYXRhO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKGZvbGQuc3RhcnQucm93KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlKGV2ZW50OiBEZWx0YUV2ZW50LCBkb2M6IERvY3VtZW50KTogdm9pZCB7XG4gICAgICAgIHZhciBkZWx0YTogRGVsdGEgPSBldmVudC5kYXRhO1xuICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG5cbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZShkZWx0YS5yYW5nZS5zdGFydC5yb3cpO1xuXG4gICAgICAgIHZhciByZW1vdmVkRm9sZHMgPSB0aGlzLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZShldmVudCk7XG4gICAgICAgIGlmICghdGhpcy4kZnJvbVVuZG8gJiYgdGhpcy4kdW5kb01hbmFnZXIgJiYgIWRlbHRhLmlnbm9yZSkge1xuICAgICAgICAgICAgdGhpcy4kZGVsdGFzRG9jLnB1c2goZGVsdGEpO1xuICAgICAgICAgICAgaWYgKHJlbW92ZWRGb2xkcyAmJiByZW1vdmVkRm9sZHMubGVuZ3RoICE9IDApIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkZWx0YXNGb2xkLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb246IFwicmVtb3ZlRm9sZHNcIixcbiAgICAgICAgICAgICAgICAgICAgZm9sZHM6IHJlbW92ZWRGb2xkc1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlci5zY2hlZHVsZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIudXBkYXRlT25DaGFuZ2UoZGVsdGEpO1xuICAgICAgICB9XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhbmdlXG4gICAgICAgICAqIEBwYXJhbSBldmVudCB7RGVsdGFFdmVudH1cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVwiLCBldmVudCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgc2Vzc2lvbiB0ZXh0LlxuICAgICAqIEBtZXRob2Qgc2V0VmFsdWVcbiAgICAgKiBAcGFyYW0gdGV4dCB7c3RyaW5nfSBUaGUgbmV3IHRleHQgdG8gcGxhY2UuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0VmFsdWUodGV4dDogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuZG9jLnNldFZhbHVlKHRleHQpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbi5tb3ZlVG8oMCwgMCk7XG5cbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNGb2xkID0gW107XG4gICAgICAgIHRoaXMuc2V0VW5kb01hbmFnZXIodGhpcy4kdW5kb01hbmFnZXIpO1xuICAgICAgICB0aGlzLmdldFVuZG9NYW5hZ2VyKCkucmVzZXQoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IERvY3VtZW50IGFzIGEgc3RyaW5nLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB0b1N0cmluZ1xuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKiBAYWxpYXMgRWRpdFNlc3Npb24uZ2V0VmFsdWVcbiAgICAgKi9cbiAgICBwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IERvY3VtZW50IGFzIGEgc3RyaW5nLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRWYWx1ZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKiBAYWxpYXMgRWRpdFNlc3Npb24udG9TdHJpbmdcbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNlbGVjdGlvblxuICAgICAqIEByZXR1cm4ge1NlbGVjdGlvbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0U2VsZWN0aW9uXG4gICAgICogQHBhcmFtIHNlbGVjdGlvbiB7U2VsZWN0aW9ufVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldFNlbGVjdGlvbihzZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IHNlbGVjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGdldFN0YXRlXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U3RhdGUocm93OiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYmdUb2tlbml6ZXIuZ2V0U3RhdGUocm93KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgdG9rZW5pemluZyBhdCB0aGUgcm93IGluZGljYXRlZC4gUmV0dXJucyBhIGxpc3Qgb2Ygb2JqZWN0cyBvZiB0aGUgdG9rZW5pemVkIHJvd3MuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFRva2Vuc1xuICAgICAqIEBwYXJhbSByb3cge251bWJlcn0gVGhlIHJvdyB0byBzdGFydCBhdC5cbiAgICAgKiBAcmV0dXJuIHtUb2tlbltdfSBBbiBhcnJheSBvZiA8Y29kZT5Ub2tlbjwvY29kZT5zLlxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRUb2tlbnMocm93OiBudW1iZXIpOiBUb2tlbltdIHtcbiAgICAgICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFRva2Vucyhyb3cpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gb2JqZWN0IGluZGljYXRpbmcgdGhlIHRva2VuIGF0IHRoZSBjdXJyZW50IHJvdy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VG9rZW5BdFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXIgdG8gcmV0cmlldmUgZnJvbVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiBudW1iZXIgdG8gcmV0cmlldmUgZnJvbS5cbiAgICAgKiBAcmV0dXJuIHtUb2tlbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VG9rZW5BdChyb3c6IG51bWJlciwgY29sdW1uPzogbnVtYmVyKTogVG9rZW4ge1xuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdmFyIHRva2VuczogVG9rZW5bXSA9IHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgICAgICAgICB2YXIgdG9rZW46IFRva2VuO1xuICAgICAgICAgICAgdmFyIGMgPSAwO1xuICAgICAgICAgICAgaWYgKGNvbHVtbiA9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgaSA9IHRva2Vucy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgICAgIGMgPSB0aGlzLmdldExpbmUocm93KS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBjICs9IHRva2Vuc1tpXS52YWx1ZS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjID49IGNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgICAgICAgICAgaWYgKCF0b2tlbilcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIHRva2VuLmluZGV4ID0gaTtcbiAgICAgICAgICAgIHRva2VuLnN0YXJ0ID0gYyAtIHRva2VuLnZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgIHJldHVybiB0b2tlbjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB1bmRvIG1hbmFnZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFVuZG9NYW5hZ2VyXG4gICAgICogQHBhcmFtIHVuZG9NYW5hZ2VyIHtVbmRvTWFuYWdlcn0gVGhlIG5ldyB1bmRvIG1hbmFnZXIuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0VW5kb01hbmFnZXIodW5kb01hbmFnZXI6IFVuZG9NYW5hZ2VyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHVuZG9NYW5hZ2VyID0gdW5kb01hbmFnZXI7XG4gICAgICAgIHRoaXMuJGRlbHRhcyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuXG4gICAgICAgIGlmICh0aGlzLiRpbmZvcm1VbmRvTWFuYWdlcilcbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyLmNhbmNlbCgpO1xuXG4gICAgICAgIGlmICh1bmRvTWFuYWdlcikge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICAgICB0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBzZWxmLiRpbmZvcm1VbmRvTWFuYWdlci5jYW5jZWwoKTtcblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXNGb2xkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBncm91cDogXCJmb2xkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWx0YXM6IHNlbGYuJGRlbHRhc0ZvbGRcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhc0ZvbGQgPSBbXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzRG9jLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBncm91cDogXCJkb2NcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRG9jXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdW5kb01hbmFnZXIuZXhlY3V0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246IFwiYWNldXBkYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzOiBbc2VsZi4kZGVsdGFzLCBzZWxmXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lcmdlOiBzZWxmLm1lcmdlVW5kb0RlbHRhc1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2VsZi5tZXJnZVVuZG9EZWx0YXMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlciA9IGRlbGF5ZWRDYWxsKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgYSBuZXcgZ3JvdXAgaW4gdW5kbyBoaXN0b3J5LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBtYXJrVW5kb0dyb3VwXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgbWFya1VuZG9Hcm91cCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcikge1xuICAgICAgICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHVuZG8gbWFuYWdlci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VW5kb01hbmFnZXJcbiAgICAgKiBAcmV0dXJuIHtVbmRvTWFuYWdlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VW5kb01hbmFnZXIoKTogVW5kb01hbmFnZXIge1xuICAgICAgICAvLyBGSVhNRTogV2FudCBzaW1wbGUgQVBJLCBkb24ndCB3YW50IHRvIGNhc3QuXG4gICAgICAgIHJldHVybiB0aGlzLiR1bmRvTWFuYWdlciB8fCA8VW5kb01hbmFnZXI+dGhpcy4kZGVmYXVsdFVuZG9NYW5hZ2VyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdmFsdWUgZm9yIHRhYnMuXG4gICAgICogSWYgdGhlIHVzZXIgaXMgdXNpbmcgc29mdCB0YWJzLCB0aGlzIHdpbGwgYmUgYSBzZXJpZXMgb2Ygc3BhY2VzIChkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSBgZ2V0VGFiU2l6ZSgpYF1dKTsgb3RoZXJ3aXNlIGl0J3Mgc2ltcGx5IGAnXFx0J2AuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFRhYlN0cmluZ1xuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VGFiU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICAgIGlmICh0aGlzLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBzdHJpbmdSZXBlYXQoXCIgXCIsIHRoaXMuZ2V0VGFiU2l6ZSgpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFzcyBgdHJ1ZWAgdG8gZW5hYmxlIHRoZSB1c2Ugb2Ygc29mdCB0YWJzLlxuICAgICAqIFNvZnQgdGFicyBtZWFucyB5b3UncmUgdXNpbmcgc3BhY2VzIGluc3RlYWQgb2YgdGhlIHRhYiBjaGFyYWN0ZXIgKGAnXFx0J2ApLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRVc2VTb2Z0VGFic1xuICAgICAqIEBwYXJhbSB1c2VTb2Z0VGFicyB7Ym9vbGVhbn0gVmFsdWUgaW5kaWNhdGluZyB3aGV0aGVyIG9yIG5vdCB0byB1c2Ugc29mdCB0YWJzLlxuICAgICAqIEByZXR1cm4ge0VkaXRTZXNzaW9ufVxuICAgICAqIEBjaGFpbmFibGVcbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0VXNlU29mdFRhYnModXNlU29mdFRhYnM6IGJvb2xlYW4pOiBFZGl0U2Vzc2lvbiB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidXNlU29mdFRhYnNcIiwgdXNlU29mdFRhYnMpO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBzb2Z0IHRhYnMgYXJlIGJlaW5nIHVzZWQsIGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRVc2VTb2Z0VGFic1xuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgcHVibGljIGdldFVzZVNvZnRUYWJzKCk6IGJvb2xlYW4ge1xuICAgICAgICAvLyB0b2RvIG1pZ2h0IG5lZWQgbW9yZSBnZW5lcmFsIHdheSBmb3IgY2hhbmdpbmcgc2V0dGluZ3MgZnJvbSBtb2RlLCBidXQgdGhpcyBpcyBvayBmb3Igbm93XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAhdGhpcy4kbW9kZS4kaW5kZW50V2l0aFRhYnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0IHRoZSBudW1iZXIgb2Ygc3BhY2VzIHRoYXQgZGVmaW5lIGEgc29mdCB0YWIuXG4gICAgICogRm9yIGV4YW1wbGUsIHBhc3NpbmcgaW4gYDRgIHRyYW5zZm9ybXMgdGhlIHNvZnQgdGFicyB0byBiZSBlcXVpdmFsZW50IHRvIGZvdXIgc3BhY2VzLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYGNoYW5nZVRhYlNpemVgIGV2ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRUYWJTaXplXG4gICAgICogQHBhcmFtIHRhYlNpemUge251bWJlcn0gVGhlIG5ldyB0YWIgc2l6ZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRUYWJTaXplKHRhYlNpemU6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInRhYlNpemVcIiwgdGFiU2l6ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCB0YWIgc2l6ZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VGFiU2l6ZVxuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VGFiU2l6ZSgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGFiU2l6ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY2hhcmFjdGVyIGF0IHRoZSBwb3NpdGlvbiBpcyBhIHNvZnQgdGFiLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpc1RhYlN0b3BcbiAgICAgKiBAcGFyYW0gcG9zaXRpb24ge1Bvc2l0aW9ufSBUaGUgcG9zaXRpb24gdG8gY2hlY2suXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgaXNUYWJTdG9wKHBvc2l0aW9uOiBQb3NpdGlvbik6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlU29mdFRhYnMgJiYgKHBvc2l0aW9uLmNvbHVtbiAlIHRoaXMuJHRhYlNpemUgPT09IDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhc3MgaW4gYHRydWVgIHRvIGVuYWJsZSBvdmVyd3JpdGVzIGluIHlvdXIgc2Vzc2lvbiwgb3IgYGZhbHNlYCB0byBkaXNhYmxlLlxuICAgICAqXG4gICAgICogSWYgb3ZlcndyaXRlcyBpcyBlbmFibGVkLCBhbnkgdGV4dCB5b3UgZW50ZXIgd2lsbCB0eXBlIG92ZXIgYW55IHRleHQgYWZ0ZXIgaXQuIElmIHRoZSB2YWx1ZSBvZiBgb3ZlcndyaXRlYCBjaGFuZ2VzLCB0aGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgY2hhbmdlT3ZlcndyaXRlYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0T3ZlcndyaXRlXG4gICAgICogQHBhcmFtIG92ZXJ3cml0ZSB7Ym9vbGVhbn0gRGVmaW5lcyB3aGV0aGVyIG9yIG5vdCB0byBzZXQgb3ZlcndyaXRlcy5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwib3ZlcndyaXRlXCIsIG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgb3ZlcndyaXRlcyBhcmUgZW5hYmxlZDsgYGZhbHNlYCBvdGhlcndpc2UuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldE92ZXJ3cml0ZVxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgcHVibGljIGdldE92ZXJ3cml0ZSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG92ZXJ3cml0ZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZSBvZiBvdmVyd3JpdGUgdG8gdGhlIG9wcG9zaXRlIG9mIHdoYXRldmVyIGl0IGN1cnJlbnRseSBpcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdG9nZ2xlT3ZlcndyaXRlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgdG9nZ2xlT3ZlcndyaXRlKCk6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE92ZXJ3cml0ZSghdGhpcy4kb3ZlcndyaXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGBjbGFzc05hbWVgIHRvIHRoZSBgcm93YCwgdG8gYmUgdXNlZCBmb3IgQ1NTIHN0eWxpbmdzIGFuZCB3aGF0bm90LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBhZGRHdXR0ZXJEZWNvcmF0aW9uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgVGhlIGNsYXNzIHRvIGFkZFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIGFkZEd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy4kZGVjb3JhdGlvbnNbcm93XSkge1xuICAgICAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSArPSBcIiBcIiArIGNsYXNzTmFtZTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGBjbGFzc05hbWVgIGZyb20gdGhlIGByb3dgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCByZW1vdmVHdXR0ZXJEZWNvcmF0aW9uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlclxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgVGhlIGNsYXNzIHRvIGFkZFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gPSAodGhpcy4kZGVjb3JhdGlvbnNbcm93XSB8fCBcIlwiKS5yZXBsYWNlKFwiIFwiICsgY2xhc3NOYW1lLCBcIlwiKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHN0cmluZ3MsIGluZGljYXRpbmcgd2hpY2ggcm93cyBoYXZlIGJyZWFrcG9pbnRzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRCcmVha3BvaW50c1xuICAgICAqIEByZXR1cm4ge3N0cmluZ1tdfVxuICAgICAqL1xuICAgIHByaXZhdGUgZ2V0QnJlYWtwb2ludHMoKTogc3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJlYWtwb2ludHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIGJyZWFrcG9pbnQgb24gZXZlcnkgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEJyZWFrcG9pbnRzXG4gICAgICogQHBhcmFtIHtudW1iZXJbXX0gcm93cyBBbiBhcnJheSBvZiByb3cgaW5kaWNlc1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRCcmVha3BvaW50cyhyb3dzOiBudW1iZXJbXSk6IHZvaWQge1xuICAgICAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd3NbaV1dID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgICAgICB9XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhbmdlQnJlYWtwb2ludFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBhbGwgYnJlYWtwb2ludHMgb24gdGhlIHJvd3MuXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGNsZWFyQnJlYWtwb2ludHNcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHByaXZhdGUgY2xlYXJCcmVha3BvaW50cygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYnJlYWtwb2ludHMgPSBbXTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgYnJlYWtwb2ludCBvbiB0aGUgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldEJyZWFrcG9pbnRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBDbGFzcyBvZiB0aGUgYnJlYWtwb2ludFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRCcmVha3BvaW50KHJvdzogbnVtYmVyLCBjbGFzc05hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpZiAoY2xhc3NOYW1lID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBjbGFzc05hbWUgPSBcImFjZV9icmVha3BvaW50XCI7XG4gICAgICAgIGlmIChjbGFzc05hbWUpXG4gICAgICAgICAgICB0aGlzLiRicmVha3BvaW50c1tyb3ddID0gY2xhc3NOYW1lO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBkZWxldGUgdGhpcy4kYnJlYWtwb2ludHNbcm93XTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGEgYnJlYWtwb2ludCBvbiB0aGUgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGNsZWFyQnJlYWtwb2ludFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHByaXZhdGUgY2xlYXJCcmVha3BvaW50KHJvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUJyZWFrcG9pbnRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBuZXcgbWFya2VyIHRvIHRoZSBnaXZlbiBgUmFuZ2VgLlxuICAgICAqIElmIGBpbkZyb250YCBpcyBgdHJ1ZWAsIGEgZnJvbnQgbWFya2VyIGlzIGRlZmluZWQsIGFuZCB0aGUgYCdjaGFuZ2VGcm9udE1hcmtlcidgIGV2ZW50IGZpcmVzOyBvdGhlcndpc2UsIHRoZSBgJ2NoYW5nZUJhY2tNYXJrZXInYCBldmVudCBmaXJlcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgYWRkTWFya2VyXG4gICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgRGVmaW5lIHRoZSByYW5nZSBvZiB0aGUgbWFya2VyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXp6IFNldCB0aGUgQ1NTIGNsYXNzIGZvciB0aGUgbWFya2VyXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbiB8IFN0cmluZ30gdHlwZSBJZGVudGlmeSB0aGUgdHlwZSBvZiB0aGUgbWFya2VyLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5Gcm9udCBTZXQgdG8gYHRydWVgIHRvIGVzdGFibGlzaCBhIGZyb250IG1hcmtlclxuICAgICAqIEByZXR1cm4ge051bWJlcn0gVGhlIG5ldyBtYXJrZXIgaWRcbiAgICAgKi9cbiAgICBwdWJsaWMgYWRkTWFya2VyKHJhbmdlOiBSYW5nZSwgY2xheno6IHN0cmluZywgdHlwZTogc3RyaW5nLCBpbkZyb250PzogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICAgICAgdmFyIG1hcmtlcjogRHluYW1pY01hcmtlciA9IHtcbiAgICAgICAgICAgIHJhbmdlOiByYW5nZSxcbiAgICAgICAgICAgIHR5cGU6IHR5cGUgfHwgXCJsaW5lXCIsXG4gICAgICAgICAgICByZW5kZXJlcjogdHlwZW9mIHR5cGUgPT09IFwiZnVuY3Rpb25cIiA/IHR5cGUgOiBudWxsLFxuICAgICAgICAgICAgY2xheno6IGNsYXp6LFxuICAgICAgICAgICAgaW5Gcm9udDogISFpbkZyb250LFxuICAgICAgICAgICAgaWQ6IGlkXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGluRnJvbnQpIHtcbiAgICAgICAgICAgIHRoaXMuJGZyb250TWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VGcm9udE1hcmtlclxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VGcm9udE1hcmtlclwiKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGJhY2tNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZUJhY2tNYXJrZXJcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgZHluYW1pYyBtYXJrZXIgdG8gdGhlIHNlc3Npb24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGFkZER5bmFtaWNNYXJrZXJcbiAgICAgKiBAcGFyYW0gbWFya2VyIHtEeW5hbWljTWFya2VyfSBvYmplY3Qgd2l0aCB1cGRhdGUgbWV0aG9kLlxuICAgICAqIEBwYXJhbSBbaW5Gcm9udF0ge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyLlxuICAgICAqIEByZXR1cm4ge0R5bmFtaWNNYXJrZXJ9IFRoZSBhZGRlZCBtYXJrZXJcbiAgICAgKi9cbiAgICBwcml2YXRlIGFkZER5bmFtaWNNYXJrZXIobWFya2VyOiBEeW5hbWljTWFya2VyLCBpbkZyb250PzogYm9vbGVhbik6IER5bmFtaWNNYXJrZXIge1xuICAgICAgICBpZiAoIW1hcmtlci51cGRhdGUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgaWQgPSB0aGlzLiRtYXJrZXJJZCsrO1xuICAgICAgICBtYXJrZXIuaWQgPSBpZDtcbiAgICAgICAgbWFya2VyLmluRnJvbnQgPSAhIWluRnJvbnQ7XG5cbiAgICAgICAgaWYgKGluRnJvbnQpIHtcbiAgICAgICAgICAgIHRoaXMuJGZyb250TWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VGcm9udE1hcmtlclxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VGcm9udE1hcmtlclwiKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGJhY2tNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZUJhY2tNYXJrZXJcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgbWFya2VyIHdpdGggdGhlIHNwZWNpZmllZCBJRC5cbiAgICAgKiBJZiB0aGlzIG1hcmtlciB3YXMgaW4gZnJvbnQsIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgaXMgZW1pdHRlZC5cbiAgICAgKiBJZiB0aGUgbWFya2VyIHdhcyBpbiB0aGUgYmFjaywgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlbW92ZU1hcmtlclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXJrZXJJZCBBIG51bWJlciByZXByZXNlbnRpbmcgYSBtYXJrZXJcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyByZW1vdmVNYXJrZXIobWFya2VySWQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgbWFya2VyOiBEeW5hbWljTWFya2VyID0gdGhpcy4kZnJvbnRNYXJrZXJzW21hcmtlcklkXSB8fCB0aGlzLiRiYWNrTWFya2Vyc1ttYXJrZXJJZF07XG4gICAgICAgIGlmICghbWFya2VyKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBtYXJrZXJzOiB7IFtpZDogbnVtYmVyXTogRHluYW1pY01hcmtlciB9ID0gbWFya2VyLmluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICAgICAgaWYgKG1hcmtlcikge1xuICAgICAgICAgICAgZGVsZXRlIChtYXJrZXJzW21hcmtlcklkXSk7XG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwobWFya2VyLmluRnJvbnQgPyBcImNoYW5nZUZyb250TWFya2VyXCIgOiBcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIElEcyBvZiBhbGwgdGhlIG1hcmtlcnMsIGVpdGhlciBmcm9udCBvciBiYWNrLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRNYXJrZXJzXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpbkZyb250IElmIGB0cnVlYCwgaW5kaWNhdGVzIHlvdSBvbmx5IHdhbnQgZnJvbnQgbWFya2VyczsgYGZhbHNlYCBpbmRpY2F0ZXMgb25seSBiYWNrIG1hcmtlcnMuXG4gICAgICogQHJldHVybiB7e1tpZDogbnVtYmVyXTogRHluYW1pY01hcmtlcn19XG4gICAgICovXG4gICAgcHVibGljIGdldE1hcmtlcnMoaW5Gcm9udDogYm9vbGVhbik6IHsgW2lkOiBudW1iZXJdOiBEeW5hbWljTWFya2VyIH0ge1xuICAgICAgICByZXR1cm4gaW5Gcm9udCA/IHRoaXMuJGZyb250TWFya2VycyA6IHRoaXMuJGJhY2tNYXJrZXJzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgaGlnaGxpZ2h0XG4gICAgICogQHBhcmFtIHJlIHtSZWdFeHB9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgaGlnaGxpZ2h0KHJlOiBSZWdFeHApOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzZWFyY2hIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHZhciBoaWdobGlnaHQgPSBuZXcgU2VhcmNoSGlnaGxpZ2h0KG51bGwsIFwiYWNlX3NlbGVjdGVkLXdvcmRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICAgICAgdGhpcy5hZGREeW5hbWljTWFya2VyKGhpZ2hsaWdodCk7XG4gICAgICAgICAgICB0aGlzLiRzZWFyY2hIaWdobGlnaHQgPSBoaWdobGlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0LnNldFJlZ2V4cChyZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoaWdobGlnaHRMaW5lcyhzdGFydFJvdzogbnVtYmVyLCBlbmRSb3c6IG51bWJlciwgY2xheno6IHN0cmluZyA9IFwiYWNlX3N0ZXBcIiwgaW5Gcm9udD86IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRSb3csIDAsIGVuZFJvdywgSW5maW5pdHkpO1xuICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHRoaXMuYWRkTWFya2VyKHJhbmdlLCBjbGF6eiwgXCJmdWxsTGluZVwiLCBpbkZyb250KTtcbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYW5ub3RhdGlvbnMgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICAqIFRoaXMgZnVuY3Rpb25zIGVtaXRzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0QW5ub3RhdGlvbnNcbiAgICAgKiBAcGFyYW0ge0Fubm90YXRpb25bXX0gYW5ub3RhdGlvbnMgQSBsaXN0IG9mIGFubm90YXRpb25zLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldEFubm90YXRpb25zKGFubm90YXRpb25zOiBBbm5vdGF0aW9uW10pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYW5ub3RhdGlvbnMgPSBhbm5vdGF0aW9ucztcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VBbm5vdGF0aW9uXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBhbm5vdGF0aW9ucyBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEFubm90YXRpb25zXG4gICAgICogQHJldHVybiB7QW5ub3RhdGlvbltdfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRBbm5vdGF0aW9ucygpOiBBbm5vdGF0aW9uW10ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYW5ub3RhdGlvbnMgfHwgW107XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2xlYXJzIGFsbCB0aGUgYW5ub3RhdGlvbnMgZm9yIHRoaXMgc2Vzc2lvbi5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gdHJpZ2dlcnMgdGhlIGAnY2hhbmdlQW5ub3RhdGlvbidgIGV2ZW50LlxuICAgICAqIFRoaXMgaXMgY2FsbGVkIGJ5IHRoZSBsYW5ndWFnZSBtb2RlcyB3aGVuIHRoZSB3b3JrZXIgdGVybWluYXRlcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgY2xlYXJBbm5vdGF0aW9uc1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIGNsZWFyQW5ub3RhdGlvbnMoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0QW5ub3RhdGlvbnMoW10pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElmIGB0ZXh0YCBjb250YWlucyBlaXRoZXIgdGhlIG5ld2xpbmUgKGBcXG5gKSBvciBjYXJyaWFnZS1yZXR1cm4gKCdcXHInKSBjaGFyYWN0ZXJzLCBgJGF1dG9OZXdMaW5lYCBzdG9yZXMgdGhhdCB2YWx1ZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgJGRldGVjdE5ld0xpbmVcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBBIGJsb2NrIG9mIHRleHRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSAkZGV0ZWN0TmV3TGluZSh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdmFyIG1hdGNoID0gdGV4dC5tYXRjaCgvXi4qPyhcXHI/XFxuKS9tKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvTmV3TGluZSA9IG1hdGNoWzFdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYXV0b05ld0xpbmUgPSBcIlxcblwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2l2ZW4gYSBzdGFydGluZyByb3cgYW5kIGNvbHVtbiwgdGhpcyBtZXRob2QgcmV0dXJucyB0aGUgYFJhbmdlYCBvZiB0aGUgZmlyc3Qgd29yZCBib3VuZGFyeSBpdCBmaW5kcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0V29yZFJhbmdlXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgICAqIEBwYXJhbSBjb2x1bW4ge251bWJlcn0gVGhlIGNvbHVtbiB0byBzdGFydCBhdC5cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0V29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IFJhbmdlIHtcbiAgICAgICAgdmFyIGxpbmU6IHN0cmluZyA9IHRoaXMuZ2V0TGluZShyb3cpO1xuXG4gICAgICAgIHZhciBpblRva2VuID0gZmFsc2U7XG4gICAgICAgIGlmIChjb2x1bW4gPiAwKVxuICAgICAgICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uIC0gMSkubWF0Y2godGhpcy50b2tlblJlKTtcblxuICAgICAgICBpZiAoIWluVG9rZW4pXG4gICAgICAgICAgICBpblRva2VuID0gISFsaW5lLmNoYXJBdChjb2x1bW4pLm1hdGNoKHRoaXMudG9rZW5SZSk7XG5cbiAgICAgICAgaWYgKGluVG9rZW4pXG4gICAgICAgICAgICB2YXIgcmUgPSB0aGlzLnRva2VuUmU7XG4gICAgICAgIGVsc2UgaWYgKC9eXFxzKyQvLnRlc3QobGluZS5zbGljZShjb2x1bW4gLSAxLCBjb2x1bW4gKyAxKSkpXG4gICAgICAgICAgICB2YXIgcmUgPSAvXFxzLztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdmFyIHJlID0gdGhpcy5ub25Ub2tlblJlO1xuXG4gICAgICAgIHZhciBzdGFydCA9IGNvbHVtbjtcbiAgICAgICAgaWYgKHN0YXJ0ID4gMCkge1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHN0YXJ0LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aGlsZSAoc3RhcnQgPj0gMCAmJiBsaW5lLmNoYXJBdChzdGFydCkubWF0Y2gocmUpKTtcbiAgICAgICAgICAgIHN0YXJ0Kys7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZW5kID0gY29sdW1uO1xuICAgICAgICB3aGlsZSAoZW5kIDwgbGluZS5sZW5ndGggJiYgbGluZS5jaGFyQXQoZW5kKS5tYXRjaChyZSkpIHtcbiAgICAgICAgICAgIGVuZCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShyb3csIHN0YXJ0LCByb3csIGVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0cyB0aGUgcmFuZ2Ugb2YgYSB3b3JkLCBpbmNsdWRpbmcgaXRzIHJpZ2h0IHdoaXRlc3BhY2UuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEFXb3JkUmFuZ2VcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHN0YXJ0IGZyb21cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHN0YXJ0IGZyb21cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0QVdvcmRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBSYW5nZSB7XG4gICAgICAgIHZhciB3b3JkUmFuZ2UgPSB0aGlzLmdldFdvcmRSYW5nZShyb3csIGNvbHVtbik7XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHdvcmRSYW5nZS5lbmQucm93KTtcblxuICAgICAgICB3aGlsZSAobGluZS5jaGFyQXQod29yZFJhbmdlLmVuZC5jb2x1bW4pLm1hdGNoKC9bIFxcdF0vKSkge1xuICAgICAgICAgICAgd29yZFJhbmdlLmVuZC5jb2x1bW4gKz0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB3b3JkUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBzZXROZXdMaW5lTW9kZVxuICAgICAqIEBwYXJhbSBuZXdMaW5lTW9kZSB7c3RyaW5nfVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbmV3IGxpbmUgbW9kZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0TmV3TGluZU1vZGVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICogQHJlbGF0ZWQgRG9jdW1lbnQuZ2V0TmV3TGluZU1vZGVcbiAgICAgKi9cbiAgICBwcml2YXRlIGdldE5ld0xpbmVNb2RlKCk6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIElkZW50aWZpZXMgaWYgeW91IHdhbnQgdG8gdXNlIGEgd29ya2VyIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0VXNlV29ya2VyXG4gICAgICogQHBhcmFtIHtib29sZWFufSB1c2VXb3JrZXIgU2V0IHRvIGB0cnVlYCB0byB1c2UgYSB3b3JrZXIuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0VXNlV29ya2VyKHVzZVdvcmtlcjogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInVzZVdvcmtlclwiLCB1c2VXb3JrZXIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHdvcmtlcnMgYXJlIGJlaW5nIHVzZWQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFVzZVdvcmtlclxuICAgICAqIEByZXR1cm4ge2Jvb2xlYW59XG4gICAgICovXG4gICAgcHVibGljIGdldFVzZVdvcmtlcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuJHVzZVdvcmtlcjsgfVxuXG4gICAgLyoqXG4gICAgICogUmVsb2FkcyBhbGwgdGhlIHRva2VucyBvbiB0aGUgY3VycmVudCBzZXNzaW9uLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gY2FsbHMgW1tCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0IGBCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0ICgpYF1dIHRvIGFsbCB0aGUgcm93czsgaXQgYWxzbyBlbWl0cyB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudC5cbiAgICAgKi9cbiAgICAvLyBUT0RPOiBzdHJvbnR5cGUgdGhlIGV2ZW50LlxuICAgIHByaXZhdGUgb25SZWxvYWRUb2tlbml6ZXIoZSkge1xuICAgICAgICB2YXIgcm93cyA9IGUuZGF0YTtcbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydChyb3dzLmZpcnN0KTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCB0b2tlbml6ZXJVcGRhdGVcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcInRva2VuaXplclVwZGF0ZVwiLCBlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IGxhbmdhdWdlIG1vZGUgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICAqIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlTW9kZSdgIGV2ZW50LlxuICAgICAqIElmIGEgW1tCYWNrZ3JvdW5kVG9rZW5pemVyIGBCYWNrZ3JvdW5kVG9rZW5pemVyYF1dIGlzIHNldCwgdGhlIGAndG9rZW5pemVyVXBkYXRlJ2AgZXZlbnQgaXMgYWxzbyBlbWl0dGVkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRMYW5ndWFnZU1vZGVcbiAgICAgKiBAcGFyYW0gbW9kZSB7TGFuZ3VhZ2VNb2RlfSBTZXQgYSBuZXcgbGFuZ3VhZ2UgbW9kZSBpbnN0YW5jZSBvciBtb2R1bGUgbmFtZS5cbiAgICAgKiBAcGFyYW0ge2NifSBvcHRpb25hbCBjYWxsYmFja1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldExhbmd1YWdlTW9kZShtb2RlOiBMYW5ndWFnZU1vZGUpOiB2b2lkIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG9uQ2hhbmdlTW9kZShtb2RlLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhIG5ldyBsYW5nYXVnZSBtb2RlIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgICAgKiBUaGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZU1vZGUnYCBldmVudC5cbiAgICAgKiBJZiBhIFtbQmFja2dyb3VuZFRva2VuaXplciBgQmFja2dyb3VuZFRva2VuaXplcmBdXSBpcyBzZXQsIHRoZSBgJ3Rva2VuaXplclVwZGF0ZSdgIGV2ZW50IGlzIGFsc28gZW1pdHRlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0TW9kZVxuICAgICAqIEBwYXJhbSBtb2RlTmFtZSB7c3RyaW5nfSBTZXQgYSBuZXcgbGFuZ3VhZ2UgbW9kdWxlIG5hbWUuXG4gICAgICogQHBhcmFtIHtjYn0gb3B0aW9uYWwgY2FsbGJhY2tcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRNb2RlKG1vZGVOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5pbXBvcnRNb2RlKG1vZGVOYW1lKVxuICAgICAgICAgICAgLnRoZW4obW9kZSA9PiB0aGlzLnNldExhbmd1YWdlTW9kZShtb2RlKSlcbiAgICAgICAgICAgIC5jYXRjaChmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYHNldE1vZGUgZmFpbGVkLiBSZWFzb246ICR7cmVhc29ufWApO1xuICAgICAgICAgICAgfSlcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IGxhbmdhdWdlIG1vZGUgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICAqIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlTW9kZSdgIGV2ZW50LlxuICAgICAqIElmIGEgW1tCYWNrZ3JvdW5kVG9rZW5pemVyIGBCYWNrZ3JvdW5kVG9rZW5pemVyYF1dIGlzIHNldCwgdGhlIGAndG9rZW5pemVyVXBkYXRlJ2AgZXZlbnQgaXMgYWxzbyBlbWl0dGVkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRNb2RlXG4gICAgICogQHBhcmFtIG1vZGVOYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIG9wdGlvbnMge09iamVjdH1cbiAgICAgKiBAcmV0dXJuIHtQcm9taXNlPExhbmd1YWdlTW9kZT59XG4gICAgICovXG4gICAgcHVibGljIGltcG9ydE1vZGUobW9kZU5hbWU6IHN0cmluZywgb3B0aW9ucz86IHt9KTogUHJvbWlzZTxMYW5ndWFnZU1vZGU+IHtcblxuICAgICAgICBpZiAodHlwZW9mIG1vZGVOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcIm1vZGVOYW1lIG11c3QgYmUgYSBzdHJpbmdcIik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTZXQgbW9kZSB0byB0ZXh0IHVudGlsIGxvYWRpbmcgaXMgZmluaXNoZWQuXG4gICAgICAgIGlmICghdGhpcy4kbW9kZSkge1xuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKG5ldyBUZXh0TW9kZSgnJywgW10pLCB0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2U8TGFuZ3VhZ2VNb2RlPihmdW5jdGlvbihzdWNjZXNzLCBmYWlsKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi4kbW9kZXNbbW9kZU5hbWVdICYmICFvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgLy8gV2UndmUgYWxyZWFkeSBnb3QgdGhhdCBtb2RlIGNhY2hlZCwgdXNlIGl0LlxuICAgICAgICAgICAgICAgIHN1Y2Nlc3Moc2VsZi4kbW9kZXNbbW9kZU5hbWVdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRtb2Rlc1ttb2RlTmFtZV0gJiYgIW9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzcyhzZWxmLiRtb2Rlc1ttb2RlTmFtZV0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAvLyBsb2FkIGR5bmFtaWNhbGx5LlxuICAgICAgICAgICAgICAgIFN5c3RlbS5pbXBvcnQobW9kZU5hbWUpXG4gICAgICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uKG06IEltcG9ydGVkTW9kdWxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobSAmJiBtLmRlZmF1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV3TW9kZTogTGFuZ3VhZ2VNb2RlID0gbmV3IG0uZGVmYXVsdChvcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzKG5ld01vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmFpbChuZXcgRXJyb3IoYCR7bW9kZU5hbWV9IGRvZXMgbm90IGRlZmluZSBhIGRlZmF1bHQgZXhwb3J0IChhIExhbmd1YWdlTW9kZSBjbGFzcykuYCkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KS5jYXRjaChmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZhaWwocmVhc29uKTtcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHByaXZhdGUgJG9uQ2hhbmdlTW9kZShtb2RlOiBMYW5ndWFnZU1vZGUsIGlzUGxhY2Vob2xkZXI6IGJvb2xlYW4pOiB2b2lkIHtcblxuICAgICAgICBpZiAoIWlzUGxhY2Vob2xkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGVJZCA9IG1vZGUuJGlkO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJG1vZGUgPT09IG1vZGUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJG1vZGUgPSBtb2RlO1xuXG4gICAgICAgIC8vIFRPRE86IFdvdWxkbid0IGl0IG1ha2UgbW9yZSBzZW5zZSB0byBzdG9wIHRoZSB3b3JrZXIsIHRoZW4gY2hhbmdlIHRoZSBtb2RlP1xuICAgICAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdvcmtlcikge1xuICAgICAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0b2tlbml6ZXI6IFRva2VuaXplciA9IG1vZGUuZ2V0VG9rZW5pemVyKCk7XG5cbiAgICAgICAgaWYgKHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhciBvblJlbG9hZFRva2VuaXplciA9IHRoaXMub25SZWxvYWRUb2tlbml6ZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddKFwidXBkYXRlXCIsIG9uUmVsb2FkVG9rZW5pemVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplciA9IG5ldyBCYWNrZ3JvdW5kVG9rZW5pemVyKHRva2VuaXplciwgdGhpcyk7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLm9uKFwidXBkYXRlXCIsIChldmVudCwgYmc6IEJhY2tncm91bmRUb2tlbml6ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgKiBAZXZlbnQgdG9rZW5pemVyVXBkYXRlXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGV2ZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXRUb2tlbml6ZXIodG9rZW5pemVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcblxuICAgICAgICB0aGlzLnRva2VuUmUgPSBtb2RlLnRva2VuUmU7XG4gICAgICAgIHRoaXMubm9uVG9rZW5SZSA9IG1vZGUubm9uVG9rZW5SZTtcblxuXG4gICAgICAgIGlmICghaXNQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgdGhpcy4kb3B0aW9ucy53cmFwTWV0aG9kLnNldC5jYWxsKHRoaXMsIHRoaXMuJHdyYXBNZXRob2QpO1xuICAgICAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlLmZvbGRpbmdSdWxlcyk7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KDApO1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgY2hhbmdlTW9kZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHN0b3BXb3JrZXJcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSAkc3RvcFdvcmtlcigpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHdvcmtlcikge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyLnRlcm1pbmF0ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCAkc3RhcnRXb3JrZXJcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSAkc3RhcnRXb3JrZXIoKTogdm9pZCB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBGSVhNRT8gTm90aWNlIHRoYXQgdGhlIHdvcmtlciBoYXMgYmVlbiBjcmVhdGVkIGJ1dCBtYXkgbm90IGJlIHJlYWR5XG4gICAgICAgICAgICAvLyB0byByZWNlaXZlIG1lc3NhZ2VzIHlldC5cbiAgICAgICAgICAgIHRoaXMuJG1vZGUuY3JlYXRlV29ya2VyKHRoaXMpXG4gICAgICAgICAgICAgICAgLnRoZW4od29ya2VyID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kd29ya2VyID0gd29ya2VyO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGAke2V9YCk7XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IGxhbmd1YWdlIG1vZGUuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldE1vZGVcbiAgICAgKiBAcmV0dXJuIHtMYW5ndWFnZU1vZGV9IFRoZSBjdXJyZW50IGxhbmd1YWdlIG1vZGUuXG4gICAgICovXG4gICAgcHVibGljIGdldE1vZGUoKTogTGFuZ3VhZ2VNb2RlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vZGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhpcyBmdW5jdGlvbiBzZXRzIHRoZSBzY3JvbGwgdG9wIHZhbHVlLiBJdCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNjcm9sbFRvcCdgIGV2ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTY3JvbGxUb3BcbiAgICAgKiBAcGFyYW0gc2Nyb2xsVG9wIHtudW1iZXJ9IFRoZSBuZXcgc2Nyb2xsIHRvcCB2YWx1ZVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBUT0RPOiBzaG91bGQgd2UgZm9yY2UgaW50ZWdlciBsaW5laGVpZ2h0IGluc3RlYWQ/IHNjcm9sbFRvcCA9IE1hdGgucm91bmQoc2Nyb2xsVG9wKTsgXG4gICAgICAgIGlmICh0aGlzLiRzY3JvbGxUb3AgPT09IHNjcm9sbFRvcCB8fCBpc05hTihzY3JvbGxUb3ApKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYWdlU2Nyb2xsVG9wXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VTY3JvbGxUb3BcIiwgc2Nyb2xsVG9wKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgdG9wIG9mIHRoZSBlZGl0b3IgYW5kIHRoZSB0b3Btb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2Nyb2xsVG9wXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHNjcm9sbFRvcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgbGVmdCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgbGVmdG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTY3JvbGxMZWZ0XG4gICAgICogQHBhcmFtIHNjcm9sbExlZnQge251bWJlcn1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRTY3JvbGxMZWZ0KHNjcm9sbExlZnQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICAvLyBzY3JvbGxMZWZ0ID0gTWF0aC5yb3VuZChzY3JvbGxMZWZ0KTtcbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbExlZnQgPT09IHNjcm9sbExlZnQgfHwgaXNOYU4oc2Nyb2xsTGVmdCkpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kc2Nyb2xsTGVmdCA9IHNjcm9sbExlZnQ7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhbmdlU2Nyb2xsTGVmdFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCBzY3JvbGxMZWZ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgbGVmdCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgbGVmdG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTY3JvbGxMZWZ0XG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzY3JvbGxMZWZ0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHdpZHRoIG9mIHRoZSBzY3JlZW4uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNjcmVlbldpZHRoXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5XaWR0aCgpOiBudW1iZXIge1xuICAgICAgICB0aGlzLiRjb21wdXRlV2lkdGgoKTtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSwgdGhpcy5zY3JlZW5XaWR0aCk7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlbldpZHRoO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0TGluZVdpZGdldE1heFdpZHRoXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBnZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHNXaWR0aCAhPSBudWxsKSByZXR1cm4gdGhpcy5saW5lV2lkZ2V0c1dpZHRoO1xuICAgICAgICB2YXIgd2lkdGggPSAwO1xuICAgICAgICB0aGlzLmxpbmVXaWRnZXRzLmZvckVhY2goZnVuY3Rpb24odykge1xuICAgICAgICAgICAgaWYgKHcgJiYgdy5zY3JlZW5XaWR0aCA+IHdpZHRoKVxuICAgICAgICAgICAgICAgIHdpZHRoID0gdy5zY3JlZW5XaWR0aDtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB0aGlzLmxpbmVXaWRnZXRXaWR0aCA9IHdpZHRoO1xuICAgIH1cblxuICAgIHB1YmxpYyAkY29tcHV0ZVdpZHRoKGZvcmNlPzogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLiRtb2RpZmllZCB8fCBmb3JjZSkge1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGggPSB0aGlzLiR3cmFwTGltaXQ7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBsaW5lcyA9IHRoaXMuZG9jLmdldEFsbExpbmVzKCk7XG4gICAgICAgICAgICB2YXIgY2FjaGUgPSB0aGlzLiRyb3dMZW5ndGhDYWNoZTtcbiAgICAgICAgICAgIHZhciBsb25nZXN0U2NyZWVuTGluZSA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZEluZGV4ID0gMDtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuJGZvbGREYXRhW2ZvbGRJbmRleF07XG4gICAgICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIHZhciBsZW4gPSBsaW5lcy5sZW5ndGg7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICBpID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpID49IGxlbilcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuJGZvbGREYXRhW2ZvbGRJbmRleCsrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FjaGVbaV0gPT0gbnVsbClcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVbaV0gPSB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aChsaW5lc1tpXSlbMF07XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FjaGVbaV0gPiBsb25nZXN0U2NyZWVuTGluZSlcbiAgICAgICAgICAgICAgICAgICAgbG9uZ2VzdFNjcmVlbkxpbmUgPSBjYWNoZVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2NyZWVuV2lkdGggPSBsb25nZXN0U2NyZWVuTGluZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSB2ZXJiYXRpbSBjb3B5IG9mIHRoZSBnaXZlbiBsaW5lIGFzIGl0IGlzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0TGluZVxuICAgICAqIEBwYXJhbSByb3cge251bWJlcn0gVGhlIHJvdyB0byByZXRyaWV2ZSBmcm9tLlxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0TGluZShyb3c6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMaW5lKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBhcnJheSBvZiBzdHJpbmdzIG9mIHRoZSByb3dzIGJldHdlZW4gYGZpcnN0Um93YCBhbmQgYGxhc3RSb3dgLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gaXMgaW5jbHVzaXZlIG9mIGBsYXN0Um93YC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0TGluZXNcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgaW5kZXggdG8gcmV0cmlldmVcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmdbXX1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0TGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogc3RyaW5nW10ge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIG51bWJlciBvZiByb3dzIGluIHRoZSBkb2N1bWVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0TGVuZ3RoXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRMZW5ndGgoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6RG9jdW1lbnQuZ2V0VGV4dFJhbmdlLmRlc2N9XG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFRleHRSYW5nZVxuICAgICAqIEBwYXJhbSByYW5nZSB7UmFuZ2V9IFRoZSByYW5nZSB0byB3b3JrIHdpdGguXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRUZXh0UmFuZ2UocmFuZ2U6IFJhbmdlKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFRleHRSYW5nZShyYW5nZSB8fCB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGEgYmxvY2sgb2YgYHRleHRgIGF0IHRoZSBpbmRpY2F0ZWQgYHBvc2l0aW9uYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgaW5zZXJ0XG4gICAgICogQHBhcmFtIHBvc2l0aW9uIHtQb3NpdGlvbn0gVGhlIHBvc2l0aW9uIHRvIHN0YXJ0IGluc2VydGluZyBhdC5cbiAgICAgKiBAcGFyYW0gdGV4dCB7c3RyaW5nfSBBIGNodW5rIG9mIHRleHQgdG8gaW5zZXJ0LlxuICAgICAqIEByZXR1cm4ge1Bvc2l0aW9ufSBUaGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgbGluZSBvZiBgdGV4dGAuXG4gICAgICogSWYgdGhlIGxlbmd0aCBvZiBgdGV4dGAgaXMgMCwgdGhpcyBmdW5jdGlvbiBzaW1wbHkgcmV0dXJucyBgcG9zaXRpb25gLlxuICAgICAqL1xuICAgIHB1YmxpYyBpbnNlcnQocG9zaXRpb246IFBvc2l0aW9uLCB0ZXh0OiBzdHJpbmcpOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5pbnNlcnQocG9zaXRpb24sIHRleHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIGByYW5nZWAgZnJvbSB0aGUgZG9jdW1lbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlbW92ZVxuICAgICAqIEBwYXJhbSByYW5nZSB7UmFuZ2V9IEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlbW92ZS5cbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn0gVGhlIG5ldyBgc3RhcnRgIHByb3BlcnR5IG9mIHRoZSByYW5nZSwgd2hpY2ggY29udGFpbnMgYHN0YXJ0Um93YCBhbmQgYHN0YXJ0Q29sdW1uYC5cbiAgICAgKiBJZiBgcmFuZ2VgIGlzIGVtcHR5LCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgdGhlIHVubW9kaWZpZWQgdmFsdWUgb2YgYHJhbmdlLnN0YXJ0YC5cbiAgICAgKi9cbiAgICBwdWJsaWMgcmVtb3ZlKHJhbmdlOiBSYW5nZSk6IFBvc2l0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlbW92ZShyYW5nZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV2ZXJ0cyBwcmV2aW91cyBjaGFuZ2VzIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHVuZG9DaGFuZ2VzXG4gICAgICogQHBhcmFtIGRlbHRhcyB7RGVsdGFbXX0gQW4gYXJyYXkgb2YgcHJldmlvdXMgY2hhbmdlcy5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGRvbnRTZWxlY3QgW0lmIGB0cnVlYCwgZG9lc24ndCBzZWxlY3QgdGhlIHJhbmdlIG9mIHdoZXJlIHRoZSBjaGFuZ2Ugb2NjdXJlZF17OiAjZG9udFNlbGVjdH1cbiAgICAgKlxuICAgICAqXG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIHVuZG9DaGFuZ2VzKGRlbHRhczogRGVsdGFbXSwgZG9udFNlbGVjdD86IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgICAgIHZhciBsYXN0VW5kb1JhbmdlOiBSYW5nZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSBkZWx0YXMubGVuZ3RoIC0gMTsgaSAhPSAtMTsgaS0tKSB7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsdGEuZ3JvdXAgPT09IFwiZG9jXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRvYy5yZXZlcnREZWx0YXMoZGVsdGEuZGVsdGFzKTtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kZ2V0VW5kb1NlbGVjdGlvbihkZWx0YS5kZWx0YXMsIHRydWUsIGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVsdGEuZGVsdGFzLmZvckVhY2goKGZvbGREZWx0YSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGREZWx0YS5mb2xkcyk7XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZS1pbXBsZW1lbnRzIGEgcHJldmlvdXNseSB1bmRvbmUgY2hhbmdlIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlZG9DaGFuZ2VzXG4gICAgICogQHBhcmFtIGRlbHRhcyB7RGVsdGFbXX0gQW4gYXJyYXkgb2YgcHJldmlvdXMgY2hhbmdlc1xuICAgICAqIEBwYXJhbSBbZG9udFNlbGVjdF0ge2Jvb2xlYW59XG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgICovXG4gICAgcHVibGljIHJlZG9DaGFuZ2VzKGRlbHRhczogRGVsdGFbXSwgZG9udFNlbGVjdD86IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgICAgIHZhciBsYXN0VW5kb1JhbmdlOiBSYW5nZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsdGFzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jLmFwcGx5RGVsdGFzKGRlbHRhLmRlbHRhcyk7XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZSA9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJGdldFVuZG9TZWxlY3Rpb24oZGVsdGEuZGVsdGFzLCBmYWxzZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIG9yIGRpc2FibGVzIGhpZ2hsaWdodGluZyBvZiB0aGUgcmFuZ2Ugd2hlcmUgYW4gdW5kbyBvY2N1cnJlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0VW5kb1NlbGVjdFxuICAgICAqIEBwYXJhbSBlbmFibGUge2Jvb2xlYW59IElmIGB0cnVlYCwgc2VsZWN0cyB0aGUgcmFuZ2Ugb2YgdGhlIHJlaW5zZXJ0ZWQgY2hhbmdlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRVbmRvU2VsZWN0KGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ID0gZW5hYmxlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFVuZG9TZWxlY3Rpb24oZGVsdGFzOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfVtdLCBpc1VuZG86IGJvb2xlYW4sIGxhc3RVbmRvUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICBmdW5jdGlvbiBpc0luc2VydChkZWx0YTogeyBhY3Rpb246IHN0cmluZyB9KSB7XG4gICAgICAgICAgICB2YXIgaW5zZXJ0ID0gZGVsdGEuYWN0aW9uID09PSBcImluc2VydFRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0TGluZXNcIjtcbiAgICAgICAgICAgIHJldHVybiBpc1VuZG8gPyAhaW5zZXJ0IDogaW5zZXJ0O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSA9IGRlbHRhc1swXTtcbiAgICAgICAgdmFyIHJhbmdlOiBSYW5nZTtcbiAgICAgICAgdmFyIHBvaW50OiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgICAgICB2YXIgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5lbmQpO1xuICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5zdGFydCk7XG4gICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRTdGFydChkZWx0YS5yYW5nZS5zdGFydC5yb3csIGRlbHRhLnJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2UuZW5kO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQoZGVsdGEucmFuZ2UuZW5kLnJvdywgZGVsdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgcmFuZ2UgYW5kIHRoZSBsYXN0IHVuZG8gcmFuZ2UgaGFzIHNvbWV0aGluZyBpbiBjb21tb24uXG4gICAgICAgIC8vIElmIHRydWUsIG1lcmdlIHRoZSByYW5nZXMuXG4gICAgICAgIGlmIChsYXN0VW5kb1JhbmdlICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChSYW5nZS5jb21wYXJlUG9pbnRzKGxhc3RVbmRvUmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0KSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZS5lbmQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjbXAgPSBsYXN0VW5kb1JhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoY21wID09PSAxKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc2V0U3RhcnQobGFzdFVuZG9SYW5nZS5zdGFydC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQobGFzdFVuZG9SYW5nZS5lbmQucm93LCBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVwbGFjZXMgYSByYW5nZSBpbiB0aGUgZG9jdW1lbnQgd2l0aCB0aGUgbmV3IGB0ZXh0YC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgcmVwbGFjZVxuICAgICAqIEBwYXJhbSByYW5nZSB7UmFuZ2V9IEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlcGxhY2UuXG4gICAgICogQHBhcmFtIHRleHQge3N0cmluZ30gVGhlIG5ldyB0ZXh0IHRvIHVzZSBhcyBhIHJlcGxhY2VtZW50LlxuICAgICAqIEByZXR1cm4ge1Bvc2l0aW9ufVxuICAgICAqIElmIHRoZSB0ZXh0IGFuZCByYW5nZSBhcmUgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyBhbiBvYmplY3QgY29udGFpbmluZyB0aGUgY3VycmVudCBgcmFuZ2Uuc3RhcnRgIHZhbHVlLlxuICAgICAqIElmIHRoZSB0ZXh0IGlzIHRoZSBleGFjdCBzYW1lIGFzIHdoYXQgY3VycmVudGx5IGV4aXN0cywgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5lbmRgIHZhbHVlLlxuICAgICAqL1xuICAgIHB1YmxpYyByZXBsYWNlKHJhbmdlOiBSYW5nZSwgdGV4dDogc3RyaW5nKTogUG9zaXRpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MucmVwbGFjZShyYW5nZSwgdGV4dCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICAgKiAgYGBganNvblxuICAgICAqICAgIHsgcm93OiBuZXdSb3dMb2NhdGlvbiwgY29sdW1uOiBuZXdDb2x1bW5Mb2NhdGlvbiB9XG4gICAgICogIGBgYFxuICAgICAqIEBtZXRob2QgbW92ZVRleHRcbiAgICAgKiBAcGFyYW0gZnJvbVJhbmdlIHtSYW5nZX0gVGhlIHJhbmdlIG9mIHRleHQgeW91IHdhbnQgbW92ZWQgd2l0aGluIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSB0b1Bvc2l0aW9uIHtQb3NpdGlvbn0gVGhlIGxvY2F0aW9uIChyb3cgYW5kIGNvbHVtbikgd2hlcmUgeW91IHdhbnQgdG8gbW92ZSB0aGUgdGV4dCB0by5cbiAgICAgKiBAcGFyYW0gY29weSB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX0gVGhlIG5ldyByYW5nZSB3aGVyZSB0aGUgdGV4dCB3YXMgbW92ZWQgdG8uXG4gICAgICovXG4gICAgcHVibGljIG1vdmVUZXh0KGZyb21SYW5nZTogUmFuZ2UsIHRvUG9zaXRpb246IFBvc2l0aW9uLCBjb3B5OiBib29sZWFuKTogUmFuZ2Uge1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0VGV4dFJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciByb3dEaWZmOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2xEaWZmOiBudW1iZXI7XG5cbiAgICAgICAgdmFyIHRvUmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKHRvUG9zaXRpb24sIHRvUG9zaXRpb24pO1xuICAgICAgICBpZiAoIWNvcHkpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZyb21SYW5nZSk7XG4gICAgICAgICAgICByb3dEaWZmID0gZnJvbVJhbmdlLnN0YXJ0LnJvdyAtIGZyb21SYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgY29sRGlmZiA9IHJvd0RpZmYgPyAtZnJvbVJhbmdlLmVuZC5jb2x1bW4gOiBmcm9tUmFuZ2Uuc3RhcnQuY29sdW1uIC0gZnJvbVJhbmdlLmVuZC5jb2x1bW47XG4gICAgICAgICAgICBpZiAoY29sRGlmZikge1xuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLnN0YXJ0LnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLnN0YXJ0LmNvbHVtbiA+IGZyb21SYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLmVuZC5yb3cgPT0gZnJvbVJhbmdlLmVuZC5yb3cgJiYgdG9SYW5nZS5lbmQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvd0RpZmYgJiYgdG9SYW5nZS5zdGFydC5yb3cgPj0gZnJvbVJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICB0b1JhbmdlLnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHRvUmFuZ2UuZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdG9SYW5nZS5lbmQgPSB0aGlzLmluc2VydCh0b1JhbmdlLnN0YXJ0LCB0ZXh0KTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIG9sZFN0YXJ0ID0gZnJvbVJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgdmFyIG5ld1N0YXJ0ID0gdG9SYW5nZS5zdGFydDtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBuZXdTdGFydC5yb3cgLSBvbGRTdGFydC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gbmV3U3RhcnQuY29sdW1uIC0gb2xkU3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkcyhmb2xkcy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgIHggPSB4LmNsb25lKCk7XG4gICAgICAgICAgICAgICAgaWYgKHguc3RhcnQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoeC5lbmQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgeC5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICB4LmVuZC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0b1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluZGVudHMgYWxsIHRoZSByb3dzLCBmcm9tIGBzdGFydFJvd2AgdG8gYGVuZFJvd2AgKGluY2x1c2l2ZSksIGJ5IHByZWZpeGluZyBlYWNoIHJvdyB3aXRoIHRoZSB0b2tlbiBpbiBgaW5kZW50U3RyaW5nYC5cbiAgICAgKlxuICAgICAqICBJZiBgaW5kZW50U3RyaW5nYCBjb250YWlucyB0aGUgYCdcXHQnYCBjaGFyYWN0ZXIsIGl0J3MgcmVwbGFjZWQgYnkgd2hhdGV2ZXIgaXMgZGVmaW5lZCBieSBbW0VkaXRTZXNzaW9uLmdldFRhYlN0cmluZyBgZ2V0VGFiU3RyaW5nKClgXV0uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGluZGVudFJvd3NcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gc3RhcnRSb3cgU3RhcnRpbmcgcm93XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGVuZFJvdyBFbmRpbmcgcm93XG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGluZGVudFN0cmluZyBUaGUgaW5kZW50IHRva2VuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgaW5kZW50Um93cyhzdGFydFJvdzogbnVtYmVyLCBlbmRSb3c6IG51bWJlciwgaW5kZW50U3RyaW5nOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnJlcGxhY2UoL1xcdC9nLCB0aGlzLmdldFRhYlN0cmluZygpKTtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8PSBlbmRSb3c7IHJvdysrKVxuICAgICAgICAgICAgdGhpcy5pbnNlcnQoeyByb3c6IHJvdywgY29sdW1uOiAwIH0sIGluZGVudFN0cmluZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogT3V0ZGVudHMgYWxsIHRoZSByb3dzIGRlZmluZWQgYnkgdGhlIGBzdGFydGAgYW5kIGBlbmRgIHByb3BlcnRpZXMgb2YgYHJhbmdlYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgb3V0ZGVudFJvd3NcbiAgICAgKiBAcGFyYW0gcmFuZ2Uge1JhbmdlfSBBIHJhbmdlIG9mIHJvd3MuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKlxuICAgICAqL1xuICAgIHB1YmxpYyBvdXRkZW50Um93cyhyYW5nZTogUmFuZ2UpOiB2b2lkIHtcbiAgICAgICAgdmFyIHJvd1JhbmdlID0gcmFuZ2UuY29sbGFwc2VSb3dzKCk7XG4gICAgICAgIHZhciBkZWxldGVSYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKTtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gcm93UmFuZ2Uuc3RhcnQucm93OyBpIDw9IHJvd1JhbmdlLmVuZC5yb3c7ICsraSkge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUoaSk7XG5cbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LnJvdyA9IGk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQucm93ID0gaTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2l6ZTsgKytqKVxuICAgICAgICAgICAgICAgIGlmIChsaW5lLmNoYXJBdChqKSAhPSAnICcpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgaWYgKGogPCBzaXplICYmIGxpbmUuY2hhckF0KGopID09ICdcXHQnKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQuY29sdW1uID0gajtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gaiArIDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IDA7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGo7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbW92ZShkZWxldGVSYW5nZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRtb3ZlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyLCBkaXI6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGZpcnN0Um93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQoZmlyc3RSb3cpO1xuICAgICAgICBsYXN0Um93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cpO1xuICAgICAgICBpZiAoZGlyIDwgMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KGZpcnN0Um93ICsgZGlyKTtcbiAgICAgICAgICAgIGlmIChyb3cgPCAwKSByZXR1cm4gMDtcbiAgICAgICAgICAgIHZhciBkaWZmID0gcm93IC0gZmlyc3RSb3c7XG4gICAgICAgIH0gZWxzZSBpZiAoZGlyID4gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZEVuZChsYXN0Um93ICsgZGlyKTtcbiAgICAgICAgICAgIGlmIChyb3cgPiB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpIHJldHVybiAwO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSByb3cgLSBsYXN0Um93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZmlyc3RSb3cgPSB0aGlzLiRjbGlwUm93VG9Eb2N1bWVudChmaXJzdFJvdyk7XG4gICAgICAgICAgICBsYXN0Um93ID0gdGhpcy4kY2xpcFJvd1RvRG9jdW1lbnQobGFzdFJvdyk7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IGxhc3RSb3cgLSBmaXJzdFJvdyArIDE7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmFuZ2UgPSBuZXcgUmFuZ2UoZmlyc3RSb3csIDAsIGxhc3RSb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZSkubWFwKGZ1bmN0aW9uKHgpIHtcbiAgICAgICAgICAgIHggPSB4LmNsb25lKCk7XG4gICAgICAgICAgICB4LnN0YXJ0LnJvdyArPSBkaWZmO1xuICAgICAgICAgICAgeC5lbmQucm93ICs9IGRpZmY7XG4gICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgdmFyIGxpbmVzOiBzdHJpbmdbXSA9IChkaXIgPT09IDApID8gdGhpcy5kb2MuZ2V0TGluZXMoZmlyc3RSb3csIGxhc3RSb3cpIDogdGhpcy5kb2MucmVtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICB0aGlzLmRvYy5pbnNlcnRMaW5lcyhmaXJzdFJvdyArIGRpZmYsIGxpbmVzKTtcbiAgICAgICAgZm9sZHMubGVuZ3RoICYmIHRoaXMuYWRkRm9sZHMoZm9sZHMpO1xuICAgICAgICByZXR1cm4gZGlmZjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgdXAgb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSB1cFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSB1cFxuICAgICAqIEByZXR1cm4ge051bWJlcn0gSWYgYGZpcnN0Um93YCBpcyBsZXNzLXRoYW4gb3IgZXF1YWwgdG8gMCwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIDAuIE90aGVyd2lzZSwgb24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAgKlxuICAgICAqIEByZWxhdGVkIERvY3VtZW50Lmluc2VydExpbmVzXG4gICAgICpcbiAgICAgKi9cbiAgICBwcml2YXRlIG1vdmVMaW5lc1VwKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIC0xKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNoaWZ0cyBhbGwgdGhlIGxpbmVzIGluIHRoZSBkb2N1bWVudCBkb3duIG9uZSwgc3RhcnRpbmcgZnJvbSBgZmlyc3RSb3dgIGFuZCBlbmRpbmcgYXQgYGxhc3RSb3dgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSBkb3duXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIG1vdmUgZG93blxuICAgICogQHJldHVybiB7TnVtYmVyfSBJZiBgZmlyc3RSb3dgIGlzIGxlc3MtdGhhbiBvciBlcXVhbCB0byAwLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgMC4gT3RoZXJ3aXNlLCBvbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICpcbiAgICAqIEByZWxhdGVkIERvY3VtZW50Lmluc2VydExpbmVzXG4gICAgKiovXG4gICAgcHJpdmF0ZSBtb3ZlTGluZXNEb3duKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIDEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIER1cGxpY2F0ZXMgYWxsIHRoZSB0ZXh0IGJldHdlZW4gYGZpcnN0Um93YCBhbmQgYGxhc3RSb3dgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBkdXBsaWNhdGVMaW5lc1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIGR1cGxpY2F0ZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gZHVwbGljYXRlXG4gICAgICogQHJldHVybiB7TnVtYmVyfSBSZXR1cm5zIHRoZSBudW1iZXIgb2YgbmV3IHJvd3MgYWRkZWQ7IGluIG90aGVyIHdvcmRzLCBgbGFzdFJvdyAtIGZpcnN0Um93ICsgMWAuXG4gICAgICovXG4gICAgcHVibGljIGR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIDApO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSAkY2xpcFJvd1RvRG9jdW1lbnQocm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gTWF0aC5tYXgoMCwgTWF0aC5taW4ocm93LCB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDEpKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRjbGlwQ29sdW1uVG9Sb3cocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKGNvbHVtbiA8IDApXG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgcmV0dXJuIE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IFBvc2l0aW9uIHtcbiAgICAgICAgY29sdW1uID0gTWF0aC5tYXgoMCwgY29sdW1uKTtcblxuICAgICAgICBpZiAocm93IDwgMCkge1xuICAgICAgICAgICAgcm93ID0gMDtcbiAgICAgICAgICAgIGNvbHVtbiA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgbGVuID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICBpZiAocm93ID49IGxlbikge1xuICAgICAgICAgICAgICAgIHJvdyA9IGxlbiAtIDE7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShsZW4gLSAxKS5sZW5ndGg7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSBNYXRoLm1pbih0aGlzLmRvYy5nZXRMaW5lKHJvdykubGVuZ3RoLCBjb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJvdzogcm93LFxuICAgICAgICAgICAgY29sdW1uOiBjb2x1bW5cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kICRjbGlwUmFuZ2VUb0RvY3VtZW50XG4gICAgICogQHBhcmFtIHJhbmdlIHtSYW5nZX1cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBwdWJsaWMgJGNsaXBSYW5nZVRvRG9jdW1lbnQocmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICBpZiAocmFuZ2Uuc3RhcnQucm93IDwgMCkge1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gMDtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSB0aGlzLiRjbGlwQ29sdW1uVG9Sb3coXG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93LFxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtblxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIGlmIChyYW5nZS5lbmQucm93ID4gbGVuKSB7XG4gICAgICAgICAgICByYW5nZS5lbmQucm93ID0gbGVuO1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUobGVuKS5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gdGhpcy4kY2xpcENvbHVtblRvUm93KFxuICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5yb3csXG4gICAgICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtblxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB3aGV0aGVyIG9yIG5vdCBsaW5lIHdyYXBwaW5nIGlzIGVuYWJsZWQuIElmIGB1c2VXcmFwTW9kZWAgaXMgZGlmZmVyZW50IHRoYW4gdGhlIGN1cnJlbnQgdmFsdWUsIHRoZSBgJ2NoYW5nZVdyYXBNb2RlJ2AgZXZlbnQgaXMgZW1pdHRlZC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IHVzZVdyYXBNb2RlIEVuYWJsZSAob3IgZGlzYWJsZSkgd3JhcCBtb2RlXG4gICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVc2VXcmFwTW9kZSh1c2VXcmFwTW9kZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICBpZiAodXNlV3JhcE1vZGUgIT0gdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHRoaXMuJHVzZVdyYXBNb2RlID0gdXNlV3JhcE1vZGU7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuXG4gICAgICAgICAgICAvLyBJZiB3cmFwTW9kZSBpcyBhY3RpdmFlZCwgdGhlIHdyYXBEYXRhIGFycmF5IGhhcyB0byBiZSBpbml0aWFsaXplZC5cbiAgICAgICAgICAgIGlmICh1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgIHZhciBsZW4gPSB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHdyYXBEYXRhID0gQXJyYXk8bnVtYmVyW10+KGxlbik7XG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgbGVuIC0gMSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZVdyYXBNb2RlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVdyYXBNb2RlXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgd3JhcCBtb2RlIGlzIGJlaW5nIHVzZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRVc2VXcmFwTW9kZVxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICovXG4gICAgZ2V0VXNlV3JhcE1vZGUoKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICB9XG5cbiAgICAvLyBBbGxvdyB0aGUgd3JhcCBsaW1pdCB0byBtb3ZlIGZyZWVseSBiZXR3ZWVuIG1pbiBhbmQgbWF4LiBFaXRoZXJcbiAgICAvLyBwYXJhbWV0ZXIgY2FuIGJlIG51bGwgdG8gYWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gYmUgdW5jb25zdHJhaW5lZFxuICAgIC8vIGluIHRoYXQgZGlyZWN0aW9uLiBPciBzZXQgYm90aCBwYXJhbWV0ZXJzIHRvIHRoZSBzYW1lIG51bWJlciB0byBwaW5cbiAgICAvLyB0aGUgbGltaXQgdG8gdGhhdCB2YWx1ZS5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBib3VuZGFyaWVzIG9mIHdyYXAuXG4gICAgICogRWl0aGVyIHZhbHVlIGNhbiBiZSBgbnVsbGAgdG8gaGF2ZSBhbiB1bmNvbnN0cmFpbmVkIHdyYXAsIG9yLCB0aGV5IGNhbiBiZSB0aGUgc2FtZSBudW1iZXIgdG8gcGluIHRoZSBsaW1pdC5cbiAgICAgKiBJZiB0aGUgd3JhcCBsaW1pdHMgZm9yIGBtaW5gIG9yIGBtYXhgIGFyZSBkaWZmZXJlbnQsIHRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0V3JhcExpbWl0UmFuZ2VcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWluIFRoZSBtaW5pbXVtIHdyYXAgdmFsdWUgKHRoZSBsZWZ0IHNpZGUgd3JhcClcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHdyYXAgdmFsdWUgKHRoZSByaWdodCBzaWRlIHdyYXApXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBzZXRXcmFwTGltaXRSYW5nZShtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbiAhPT0gbWluIHx8IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1heCAhPT0gbWF4KSB7XG4gICAgICAgICAgICB0aGlzLiR3cmFwTGltaXRSYW5nZSA9IHtcbiAgICAgICAgICAgICAgICBtaW46IG1pbixcbiAgICAgICAgICAgICAgICBtYXg6IG1heFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIFRoaXMgd2lsbCBmb3JjZSBhIHJlY2FsY3VsYXRpb24gb2YgdGhlIHdyYXAgbGltaXQuXG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VXcmFwTW9kZVxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoaXMgc2hvdWxkIGdlbmVyYWxseSBvbmx5IGJlIGNhbGxlZCBieSB0aGUgcmVuZGVyZXIgd2hlbiBhIHJlc2l6ZSBpcyBkZXRlY3RlZC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZGVzaXJlZExpbWl0IFRoZSBuZXcgd3JhcCBsaW1pdFxuICAgICAqIEByZXR1cm4ge0Jvb2xlYW59XG4gICAgICpcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHB1YmxpYyBhZGp1c3RXcmFwTGltaXQoZGVzaXJlZExpbWl0OiBudW1iZXIsICRwcmludE1hcmdpbjogbnVtYmVyKTogYm9vbGVhbiB7XG4gICAgICAgIHZhciBsaW1pdHMgPSB0aGlzLiR3cmFwTGltaXRSYW5nZVxuICAgICAgICBpZiAobGltaXRzLm1heCA8IDApXG4gICAgICAgICAgICBsaW1pdHMgPSB7IG1pbjogJHByaW50TWFyZ2luLCBtYXg6ICRwcmludE1hcmdpbiB9O1xuICAgICAgICB2YXIgd3JhcExpbWl0ID0gdGhpcy4kY29uc3RyYWluV3JhcExpbWl0KGRlc2lyZWRMaW1pdCwgbGltaXRzLm1pbiwgbGltaXRzLm1heCk7XG4gICAgICAgIGlmICh3cmFwTGltaXQgIT0gdGhpcy4kd3JhcExpbWl0ICYmIHdyYXBMaW1pdCA+IDEpIHtcbiAgICAgICAgICAgIHRoaXMuJHdyYXBMaW1pdCA9IHdyYXBMaW1pdDtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIHRoaXMuZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VXcmFwTGltaXRcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTGltaXRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY29uc3RyYWluV3JhcExpbWl0KHdyYXBMaW1pdDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAobWluKVxuICAgICAgICAgICAgd3JhcExpbWl0ID0gTWF0aC5tYXgobWluLCB3cmFwTGltaXQpO1xuXG4gICAgICAgIGlmIChtYXgpXG4gICAgICAgICAgICB3cmFwTGltaXQgPSBNYXRoLm1pbihtYXgsIHdyYXBMaW1pdCk7XG5cbiAgICAgICAgcmV0dXJuIHdyYXBMaW1pdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHZhbHVlIG9mIHdyYXAgbGltaXQuXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9IFRoZSB3cmFwIGxpbWl0LlxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0V3JhcExpbWl0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiR3cmFwTGltaXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgbGluZSBsZW5ndGggZm9yIHNvZnQgd3JhcCBpbiB0aGUgZWRpdG9yLiBMaW5lcyB3aWxsIGJyZWFrXG4gICAgICogIGF0IGEgbWluaW11bSBvZiB0aGUgZ2l2ZW4gbGVuZ3RoIG1pbnVzIDIwIGNoYXJzIGFuZCBhdCBhIG1heGltdW1cbiAgICAgKiAgb2YgdGhlIGdpdmVuIG51bWJlciBvZiBjaGFycy5cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gbGltaXQgVGhlIG1heGltdW0gbGluZSBsZW5ndGggaW4gY2hhcnMsIGZvciBzb2Z0IHdyYXBwaW5nIGxpbmVzLlxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0V3JhcExpbWl0KGxpbWl0OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShsaW1pdCwgbGltaXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgdGhhdCBkZWZpbmVzIHRoZSBtaW5pbXVtIGFuZCBtYXhpbXVtIG9mIHRoZSB3cmFwIGxpbWl0OyBpdCBsb29rcyBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICAgICpcbiAgICAqICAgICB7IG1pbjogd3JhcExpbWl0UmFuZ2VfbWluLCBtYXg6IHdyYXBMaW1pdFJhbmdlX21heCB9XG4gICAgKlxuICAgICogQHJldHVybiB7T2JqZWN0fVxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0V3JhcExpbWl0UmFuZ2UoKSB7XG4gICAgICAgIC8vIEF2b2lkIHVuZXhwZWN0ZWQgbXV0YXRpb24gYnkgcmV0dXJuaW5nIGEgY29weVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbWluOiB0aGlzLiR3cmFwTGltaXRSYW5nZS5taW4sXG4gICAgICAgICAgICBtYXg6IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1heFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGU6IERlbHRhRXZlbnQpIHtcbiAgICAgICAgdmFyIHVzZVdyYXBNb2RlID0gdGhpcy4kdXNlV3JhcE1vZGU7XG4gICAgICAgIHZhciBsZW47XG4gICAgICAgIHZhciBhY3Rpb24gPSBlLmRhdGEuYWN0aW9uO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSBlLmRhdGEucmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICB2YXIgbGFzdFJvdyA9IGUuZGF0YS5yYW5nZS5lbmQucm93O1xuICAgICAgICB2YXIgc3RhcnQgPSBlLmRhdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBlbmQgPSBlLmRhdGEucmFuZ2UuZW5kO1xuICAgICAgICB2YXIgcmVtb3ZlZEZvbGRzID0gbnVsbDtcblxuICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJMaW5lc1wiKSAhPSAtMSkge1xuICAgICAgICAgICAgaWYgKGFjdGlvbiA9PSBcImluc2VydExpbmVzXCIpIHtcbiAgICAgICAgICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3cgKyAoZS5kYXRhLmxpbmVzLmxlbmd0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZW4gPSBlLmRhdGEubGluZXMgPyBlLmRhdGEubGluZXMubGVuZ3RoIDogbGFzdFJvdyAtIGZpcnN0Um93O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgbGVuID0gbGFzdFJvdyAtIGZpcnN0Um93O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kdXBkYXRpbmcgPSB0cnVlO1xuICAgICAgICBpZiAobGVuICE9IDApIHtcbiAgICAgICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcInJlbW92ZVwiKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXNbdXNlV3JhcE1vZGUgPyBcIiR3cmFwRGF0YVwiIDogXCIkcm93TGVuZ3RoQ2FjaGVcIl0uc3BsaWNlKGZpcnN0Um93LCBsZW4pO1xuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgICAgIHJlbW92ZWRGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGUuZGF0YS5yYW5nZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhyZW1vdmVkRm9sZHMpO1xuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShlbmQucm93KTtcbiAgICAgICAgICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZW5kLnJvdywgZW5kLmNvbHVtbiwgc3RhcnQuY29sdW1uIC0gZW5kLmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KC1sZW4pO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZUJlZm9yZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmVCZWZvcmUgJiYgZm9sZExpbmVCZWZvcmUgIT09IGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZUJlZm9yZS5tZXJnZShmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lQmVmb3JlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChpZHg7IGlkeCA8IGZvbGRMaW5lcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGRMaW5lc1tpZHhdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93ID49IGVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KC1sZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5KGxlbik7XG4gICAgICAgICAgICAgICAgYXJncy51bnNoaWZ0KGZpcnN0Um93LCAwKTtcbiAgICAgICAgICAgICAgICB2YXIgYXJyID0gdXNlV3JhcE1vZGUgPyB0aGlzLiR3cmFwRGF0YSA6IHRoaXMuJHJvd0xlbmd0aENhY2hlXG4gICAgICAgICAgICAgICAgYXJyLnNwbGljZS5hcHBseShhcnIsIGFyZ3MpO1xuXG4gICAgICAgICAgICAgICAgLy8gSWYgc29tZSBuZXcgbGluZSBpcyBhZGRlZCBpbnNpZGUgb2YgYSBmb2xkTGluZSwgdGhlbiBzcGxpdFxuICAgICAgICAgICAgICAgIC8vIHRoZSBmb2xkIGxpbmUgdXAuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgICAgICAgIHZhciBpZHggPSAwO1xuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY21wID0gZm9sZExpbmUucmFuZ2UuY29tcGFyZUluc2lkZShzdGFydC5yb3csIHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgLy8gSW5zaWRlIG9mIHRoZSBmb2xkTGluZSByYW5nZS4gTmVlZCB0byBzcGxpdCBzdHVmZiB1cC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lLnNwbGl0KHN0YXJ0LnJvdywgc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0Um93LCAwLCBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJbmZyb250IG9mIHRoZSBmb2xkTGluZSBidXQgc2FtZSByb3cuIE5lZWQgdG8gc2hpZnQgY29sdW1uLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGZpcnN0Um93LCAwLCBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBOb3RoaW5nIHRvIGRvIGlmIHRoZSBpbnNlcnQgaXMgYWZ0ZXIgdGhlIGZvbGRMaW5lLlxuICAgICAgICAgICAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBmaXJzdFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIFJlYWxpZ24gZm9sZHMuIEUuZy4gaWYgeW91IGFkZCBzb21lIG5ldyBjaGFycyBiZWZvcmUgYSBmb2xkLCB0aGVcbiAgICAgICAgICAgIC8vIGZvbGQgc2hvdWxkIFwibW92ZVwiIHRvIHRoZSByaWdodC5cbiAgICAgICAgICAgIGxlbiA9IE1hdGguYWJzKGUuZGF0YS5yYW5nZS5zdGFydC5jb2x1bW4gLSBlLmRhdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBmb2xkcyBpbiB0aGUgY2hhbmdlIHJhbmdlIGFuZCByZW1vdmUgdGhlbS5cbiAgICAgICAgICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICAgICAgICAgIGxlbiA9IC1sZW47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGZpcnN0Um93LCBzdGFydC5jb2x1bW4sIGxlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodXNlV3JhcE1vZGUgJiYgdGhpcy4kd3JhcERhdGEubGVuZ3RoICE9IHRoaXMuZG9jLmdldExlbmd0aCgpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZG9jLmdldExlbmd0aCgpIGFuZCAkd3JhcERhdGEubGVuZ3RoIGhhdmUgdG8gYmUgdGhlIHNhbWUhXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHVwZGF0aW5nID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdyk7XG5cbiAgICAgICAgcmV0dXJuIHJlbW92ZWRGb2xkcztcbiAgICB9XG5cbiAgICBwdWJsaWMgJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZpcnN0Um93LCBsYXN0Um93LCBiPykge1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZVtmaXJzdFJvd10gPSBudWxsO1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZVtsYXN0Um93XSA9IG51bGw7XG4gICAgfVxuXG4gICAgcHVibGljICR1cGRhdGVXcmFwRGF0YShmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuZ2V0VGFiU2l6ZSgpO1xuICAgICAgICB2YXIgd3JhcERhdGEgPSB0aGlzLiR3cmFwRGF0YTtcbiAgICAgICAgdmFyIHdyYXBMaW1pdCA9IHRoaXMuJHdyYXBMaW1pdDtcbiAgICAgICAgdmFyIHRva2VucztcbiAgICAgICAgdmFyIGZvbGRMaW5lO1xuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICAgICAgbGFzdFJvdyA9IE1hdGgubWluKGxhc3RSb3csIGxpbmVzLmxlbmd0aCAtIDEpO1xuICAgICAgICB3aGlsZSAocm93IDw9IGxhc3RSb3cpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKGxpbmVzW3Jvd10pO1xuICAgICAgICAgICAgICAgIHdyYXBEYXRhW3Jvd10gPSB0aGlzLiRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnMsIHdyYXBMaW1pdCwgdGFiU2l6ZSk7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IFtdO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLndhbGsoZnVuY3Rpb24ocGxhY2Vob2xkZXIsIHJvdywgY29sdW1uLCBsYXN0Q29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB3YWxrVG9rZW5zOiBudW1iZXJbXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyLCB0b2tlbnMubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnNbMF0gPSBQTEFDRUhPTERFUl9TVEFSVDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgd2Fsa1Rva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnNbaV0gPSBQTEFDRUhPTERFUl9CT0RZO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZXNbcm93XS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbnMubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0b2tlbnMgPSB0b2tlbnMuY29uY2F0KHdhbGtUb2tlbnMpO1xuICAgICAgICAgICAgICAgIH0uYmluZCh0aGlzKSxcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICAgICAgbGluZXNbZm9sZExpbmUuZW5kLnJvd10ubGVuZ3RoICsgMVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICB3cmFwRGF0YVtmb2xkTGluZS5zdGFydC5yb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zOiBudW1iZXJbXSwgd3JhcExpbWl0OiBudW1iZXIsIHRhYlNpemU/OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRva2Vucy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNwbGl0czogbnVtYmVyW10gPSBbXTtcbiAgICAgICAgdmFyIGRpc3BsYXlMZW5ndGggPSB0b2tlbnMubGVuZ3RoO1xuICAgICAgICB2YXIgbGFzdFNwbGl0ID0gMCwgbGFzdERvY1NwbGl0ID0gMDtcblxuICAgICAgICB2YXIgaXNDb2RlID0gdGhpcy4kd3JhcEFzQ29kZTtcblxuICAgICAgICBmdW5jdGlvbiBhZGRTcGxpdChzY3JlZW5Qb3M6IG51bWJlcikge1xuICAgICAgICAgICAgdmFyIGRpc3BsYXllZCA9IHRva2Vucy5zbGljZShsYXN0U3BsaXQsIHNjcmVlblBvcyk7XG5cbiAgICAgICAgICAgIC8vIFRoZSBkb2N1bWVudCBzaXplIGlzIHRoZSBjdXJyZW50IHNpemUgLSB0aGUgZXh0cmEgd2lkdGggZm9yIHRhYnNcbiAgICAgICAgICAgIC8vIGFuZCBtdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICAgICAgICB2YXIgbGVuID0gZGlzcGxheWVkLmxlbmd0aDtcbiAgICAgICAgICAgIGRpc3BsYXllZC5qb2luKFwiXCIpLlxuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgdGhlIFRBQl9TUEFDRXMuXG4gICAgICAgICAgICAgICAgcmVwbGFjZSgvMTIvZywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlbiAtPSAxO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgICAgICAgICAgICAgIH0pLlxuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgdGhlIENIQVJfRVhUL211bHRpcGxlV2lkdGggY2hhcmFjdGVycy5cbiAgICAgICAgICAgICAgICByZXBsYWNlKC8yL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbGFzdERvY1NwbGl0ICs9IGxlbjtcbiAgICAgICAgICAgIHNwbGl0cy5wdXNoKGxhc3REb2NTcGxpdCk7XG4gICAgICAgICAgICBsYXN0U3BsaXQgPSBzY3JlZW5Qb3M7XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoZGlzcGxheUxlbmd0aCAtIGxhc3RTcGxpdCA+IHdyYXBMaW1pdCkge1xuICAgICAgICAgICAgLy8gVGhpcyBpcywgd2hlcmUgdGhlIHNwbGl0IHNob3VsZCBiZS5cbiAgICAgICAgICAgIHZhciBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcblxuICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzcGFjZSBvciB0YWIgYXQgdGhpcyBzcGxpdCBwb3NpdGlvbiwgdGhlbiBtYWtpbmdcbiAgICAgICAgICAgIC8vIGEgc3BsaXQgaXMgc2ltcGxlLlxuICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdCAtIDFdID49IFNQQUNFICYmIHRva2Vuc1tzcGxpdF0gPj0gU1BBQ0UpIHtcbiAgICAgICAgICAgICAgICAvKiBkaXNhYmxlZCBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FqYXhvcmcvYWNlL2lzc3Vlcy8xMTg2XG4gICAgICAgICAgICAgICAgLy8gSW5jbHVkZSBhbGwgZm9sbG93aW5nIHNwYWNlcyArIHRhYnMgaW4gdGhpcyBzcGxpdCBhcyB3ZWxsLlxuICAgICAgICAgICAgICAgIHdoaWxlICh0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0ICsrO1xuICAgICAgICAgICAgICAgIH0gKi9cbiAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgc3BsaXQgaXMgaW5zaWRlIG9mIGEgcGxhY2Vob2xkZXIuIFBsYWNlaG9sZGVyIGFyZVxuICAgICAgICAgICAgLy8gbm90IHNwbGl0YWJsZS4gVGhlcmVmb3JlLCBzZWVrIHRoZSBiZWdpbm5pbmcgb2YgdGhlIHBsYWNlaG9sZGVyXG4gICAgICAgICAgICAvLyBhbmQgdHJ5IHRvIHBsYWNlIHRoZSBzcGxpdCBiZW9mcmUgdGhlIHBsYWNlaG9sZGVyJ3Mgc3RhcnQuXG4gICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9TVEFSVCB8fCB0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX0JPRFkpIHtcbiAgICAgICAgICAgICAgICAvLyBTZWVrIHRoZSBzdGFydCBvZiB0aGUgcGxhY2Vob2xkZXIgYW5kIGRvIHRoZSBzcGxpdFxuICAgICAgICAgICAgICAgIC8vIGJlZm9yZSB0aGUgcGxhY2Vob2xkZXIuIEJ5IGRlZmluaXRpb24gdGhlcmUgYWx3YXlzXG4gICAgICAgICAgICAgICAgLy8gYSBQTEFDRUhPTERFUl9TVEFSVCBiZXR3ZWVuIHNwbGl0IGFuZCBsYXN0U3BsaXQuXG4gICAgICAgICAgICAgICAgZm9yIChzcGxpdDsgc3BsaXQgIT0gbGFzdFNwbGl0IC0gMTsgc3BsaXQtLSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3BsaXQrKzsgPDwgTm8gaW5jcmVtZW50YWwgaGVyZSBhcyB3ZSB3YW50IHRvXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgaGF2ZSB0aGUgcG9zaXRpb24gYmVmb3JlIHRoZSBQbGFjZWhvbGRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIFBMQUNFSE9MREVSX1NUQVJUIGlzIG5vdCB0aGUgaW5kZXggb2YgdGhlXG4gICAgICAgICAgICAgICAgLy8gbGFzdCBzcGxpdCwgdGhlbiB3ZSBjYW4gZG8gdGhlIHNwbGl0XG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0ID4gbGFzdFNwbGl0KSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIFBMQUNFSE9MREVSX1NUQVJUIElTIHRoZSBpbmRleCBvZiB0aGUgbGFzdFxuICAgICAgICAgICAgICAgIC8vIHNwbGl0LCB0aGVuIHdlIGhhdmUgdG8gcGxhY2UgdGhlIHNwbGl0IGFmdGVyIHRoZVxuICAgICAgICAgICAgICAgIC8vIHBsYWNlaG9sZGVyLiBTbywgbGV0J3Mgc2VlayBmb3IgdGhlIGVuZCBvZiB0aGUgcGxhY2Vob2xkZXIuXG4gICAgICAgICAgICAgICAgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG4gICAgICAgICAgICAgICAgZm9yIChzcGxpdDsgc3BsaXQgPCB0b2tlbnMubGVuZ3RoOyBzcGxpdCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdICE9IFBMQUNFSE9MREVSX0JPRFkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgc3BpbHQgPT0gdG9rZW5zLmxlbmd0aCwgdGhlbiB0aGUgcGxhY2Vob2xkZXIgaXMgdGhlIGxhc3RcbiAgICAgICAgICAgICAgICAvLyB0aGluZyBpbiB0aGUgbGluZSBhbmQgYWRkaW5nIGEgbmV3IHNwbGl0IGRvZXNuJ3QgbWFrZSBzZW5zZS5cbiAgICAgICAgICAgICAgICBpZiAoc3BsaXQgPT0gdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBicmVhazsgIC8vIEJyZWFrcyB0aGUgd2hpbGUtbG9vcC5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBGaW5hbGx5LCBhZGQgdGhlIHNwbGl0Li4uXG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIC8vIFNlYXJjaCBmb3IgdGhlIGZpcnN0IG5vbiBzcGFjZS90YWIvcGxhY2Vob2xkZXIvcHVuY3R1YXRpb24gdG9rZW4gYmFja3dhcmRzLlxuICAgICAgICAgICAgdmFyIG1pblNwbGl0ID0gTWF0aC5tYXgoc3BsaXQgLSAoaXNDb2RlID8gMTAgOiB3cmFwTGltaXQgLSAod3JhcExpbWl0ID4+IDIpKSwgbGFzdFNwbGl0IC0gMSk7XG4gICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlzQ29kZSkge1xuICAgICAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdID09IFBVTkNUVUFUSU9OKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgU1BBQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBJZiB3ZSBmb3VuZCBvbmUsIHRoZW4gYWRkIHRoZSBzcGxpdC5cbiAgICAgICAgICAgIGlmIChzcGxpdCA+IG1pblNwbGl0KSB7XG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoKytzcGxpdCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgICAgICAgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG4gICAgICAgICAgICAvLyBUaGUgc3BsaXQgaXMgaW5zaWRlIG9mIGEgQ0hBUiBvciBDSEFSX0VYVCB0b2tlbiBhbmQgbm8gc3BhY2VcbiAgICAgICAgICAgIC8vIGFyb3VuZCAtPiBmb3JjZSBhIHNwbGl0LlxuICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzcGxpdHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBHaXZlbiBhIHN0cmluZywgcmV0dXJucyBhbiBhcnJheSBvZiB0aGUgZGlzcGxheSBjaGFyYWN0ZXJzLCBpbmNsdWRpbmcgdGFicyBhbmQgc3BhY2VzLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHN0ciBUaGUgc3RyaW5nIHRvIGNoZWNrXG4gICAgKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IFRoZSB2YWx1ZSB0byBzdGFydCBhdFxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSAkZ2V0RGlzcGxheVRva2VucyhzdHI6IHN0cmluZywgb2Zmc2V0PzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICB2YXIgYXJyOiBudW1iZXJbXSA9IFtdO1xuICAgICAgICB2YXIgdGFiU2l6ZTogbnVtYmVyO1xuICAgICAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGMgPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgICAgICAgIC8vIFRhYlxuICAgICAgICAgICAgaWYgKGMgPT0gOSkge1xuICAgICAgICAgICAgICAgIHRhYlNpemUgPSB0aGlzLmdldFNjcmVlblRhYlNpemUoYXJyLmxlbmd0aCArIG9mZnNldCk7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goVEFCKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBuID0gMTsgbiA8IHRhYlNpemU7IG4rKykge1xuICAgICAgICAgICAgICAgICAgICBhcnIucHVzaChUQUJfU1BBQ0UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFNwYWNlXG4gICAgICAgICAgICBlbHNlIGlmIChjID09IDMyKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goU1BBQ0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoKGMgPiAzOSAmJiBjIDwgNDgpIHx8IChjID4gNTcgJiYgYyA8IDY0KSkge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFBVTkNUVUFUSU9OKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGZ1bGwgd2lkdGggY2hhcmFjdGVyc1xuICAgICAgICAgICAgZWxzZSBpZiAoYyA+PSAweDExMDAgJiYgaXNGdWxsV2lkdGgoYykpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChDSEFSLCBDSEFSX0VYVCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChDSEFSKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGN1bGF0ZXMgdGhlIHdpZHRoIG9mIHRoZSBzdHJpbmcgYHN0cmAgb24gdGhlIHNjcmVlbiB3aGlsZSBhc3N1bWluZyB0aGF0IHRoZSBzdHJpbmcgc3RhcnRzIGF0IHRoZSBmaXJzdCBjb2x1bW4gb24gdGhlIHNjcmVlbi5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjYWxjdWxhdGUgdGhlIHNjcmVlbiB3aWR0aCBvZlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IG1heFNjcmVlbkNvbHVtblxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcmVlbkNvbHVtblxuICAgICogQHJldHVybiB7W051bWJlcl19IFJldHVybnMgYW4gYGludFtdYCBhcnJheSB3aXRoIHR3byBlbGVtZW50czo8YnIvPlxuICAgICogVGhlIGZpcnN0IHBvc2l0aW9uIGluZGljYXRlcyB0aGUgbnVtYmVyIG9mIGNvbHVtbnMgZm9yIGBzdHJgIG9uIHNjcmVlbi48YnIvPlxuICAgICogVGhlIHNlY29uZCB2YWx1ZSBjb250YWlucyB0aGUgcG9zaXRpb24gb2YgdGhlIGRvY3VtZW50IGNvbHVtbiB0aGF0IHRoaXMgZnVuY3Rpb24gcmVhZCB1bnRpbC5cbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljICRnZXRTdHJpbmdTY3JlZW5XaWR0aChzdHI6IHN0cmluZywgbWF4U2NyZWVuQ29sdW1uPzogbnVtYmVyLCBzY3JlZW5Db2x1bW4/OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIGlmIChtYXhTY3JlZW5Db2x1bW4gPT0gMClcbiAgICAgICAgICAgIHJldHVybiBbMCwgMF07XG4gICAgICAgIGlmIChtYXhTY3JlZW5Db2x1bW4gPT0gbnVsbClcbiAgICAgICAgICAgIG1heFNjcmVlbkNvbHVtbiA9IEluZmluaXR5O1xuICAgICAgICBzY3JlZW5Db2x1bW4gPSBzY3JlZW5Db2x1bW4gfHwgMDtcblxuICAgICAgICB2YXIgYzogbnVtYmVyO1xuICAgICAgICB2YXIgY29sdW1uOiBudW1iZXI7XG4gICAgICAgIGZvciAoY29sdW1uID0gMDsgY29sdW1uIDwgc3RyLmxlbmd0aDsgY29sdW1uKyspIHtcbiAgICAgICAgICAgIGMgPSBzdHIuY2hhckNvZGVBdChjb2x1bW4pO1xuICAgICAgICAgICAgLy8gdGFiXG4gICAgICAgICAgICBpZiAoYyA9PSA5KSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IHRoaXMuZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZnVsbCB3aWR0aCBjaGFyYWN0ZXJzXG4gICAgICAgICAgICBlbHNlIGlmIChjID49IDB4MTEwMCAmJiBpc0Z1bGxXaWR0aChjKSkge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzY3JlZW5Db2x1bW4gPiBtYXhTY3JlZW5Db2x1bW4pIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBbc2NyZWVuQ29sdW1uLCBjb2x1bW5dO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgbnVtYmVyIG9mIHNjcmVlbnJvd3MgaW4gYSB3cmFwcGVkIGxpbmUuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFJvd0xlbmd0aFxuICAgICAqIEBwYXJhbSByb3cge251bWJlcn0gVGhlIHJvdyBudW1iZXIgdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFJvd0xlbmd0aChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzKVxuICAgICAgICAgICAgdmFyIGggPSB0aGlzLmxpbmVXaWRnZXRzW3Jvd10gJiYgdGhpcy5saW5lV2lkZ2V0c1tyb3ddLnJvd0NvdW50IHx8IDA7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGggPSAwXG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgICAgICAgIHJldHVybiAxICsgaDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDEgKyBoO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXRSb3dMaW5lQ291bnRcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRSb3dMaW5lQ291bnQocm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlIHx8ICF0aGlzLiR3cmFwRGF0YVtyb3ddKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Um93V3JhcEluZGVudChzY3JlZW5Sb3c6IG51bWJlcikge1xuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgICAgICAgdmFyIHNwbGl0czogbnVtYmVyW10gPSB0aGlzLiR3cmFwRGF0YVtwb3Mucm93XTtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBpbmRlbnQgZG9lcyBub3QgZXhpc3RzIG9uIG51bWJlcltdXG4gICAgICAgICAgICByZXR1cm4gc3BsaXRzLmxlbmd0aCAmJiBzcGxpdHNbMF0gPCBwb3MuY29sdW1uID8gc3BsaXRzWydpbmRlbnQnXSA6IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHBvc2l0aW9uIChvbiBzY3JlZW4pIGZvciB0aGUgbGFzdCBjaGFyYWN0ZXIgaW4gdGhlIHByb3ZpZGVkIHNjcmVlbiByb3cuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNjcmVlbkxhc3RSb3dDb2x1bW5cbiAgICAgKiBAcGFyYW0gc2NyZWVuUm93IHtudW1iZXJ9IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtblxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBjb2x1bW4gcG9zaXRpb24gb2YgdGhlIGxhc3Qgc2NyZWVuIHJvdy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uXG4gICAgICogQHBhcmFtIGRvY1JvdyB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBkb2NDb2x1bW4ge251bWJlcn1cbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldERvY3VtZW50TGFzdFJvd0NvbHVtbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHRoaXMgcmV0dXJucyB0aGUgZG9jdW1lbnQgcG9zaXRpb24gb2YgdGhlIGxhc3Qgcm93LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvblxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICovXG4gICAgcHVibGljIGdldERvY3VtZW50TGFzdFJvd0NvbHVtblBvc2l0aW9uKGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IFBvc2l0aW9uIHtcbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUgLyAxMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRm9yIHRoZSBnaXZlbiByb3csIHRoaXMgcmV0dXJucyB0aGUgc3BsaXQgZGF0YS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0Um93U3BsaXREYXRhXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfVxuICAgICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0Um93U3BsaXREYXRhKHJvdzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGUgZGlzdGFuY2UgdG8gdGhlIG5leHQgdGFiIHN0b3AgYXQgdGhlIHNwZWNpZmllZCBzY3JlZW4gY29sdW1uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTY3JlZW5UYWJTaXplXG4gICAgICogQHBhcmFtIHNjcmVlbkNvbHVtbiB7bnVtYmVyfSBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVjay5cbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kdGFiU2l6ZSAtIHNjcmVlbkNvbHVtbiAlIHRoaXMuJHRhYlNpemU7XG4gICAgfVxuXG5cbiAgICBwdWJsaWMgc2NyZWVuVG9Eb2N1bWVudFJvdyhzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBzY3JlZW5Db2x1bW4pLnJvdztcbiAgICB9XG5cblxuICAgIHByaXZhdGUgc2NyZWVuVG9Eb2N1bWVudENvbHVtbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBzY3JlZW5Db2x1bW4pLmNvbHVtbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDb252ZXJ0cyBjaGFyYWN0ZXJzIGNvb3JkaW5hdGVzIG9uIHRoZSBzY3JlZW4gdG8gY2hhcmFjdGVycyBjb29yZGluYXRlcyB3aXRoaW4gdGhlIGRvY3VtZW50LlxuICAgICAqIFRoaXMgdGFrZXMgaW50byBhY2NvdW50IGNvZGUgZm9sZGluZywgd29yZCB3cmFwLCB0YWIgc2l6ZSwgYW5kIGFueSBvdGhlciB2aXN1YWwgbW9kaWZpY2F0aW9ucy5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNjcmVlblJvdyBUaGUgc2NyZWVuIHJvdyB0byBjaGVja1xuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Db2x1bW4gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgICovXG4gICAgcHVibGljIHNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBQb3NpdGlvbiB7XG4gICAgICAgIGlmIChzY3JlZW5Sb3cgPCAwKSB7XG4gICAgICAgICAgICByZXR1cm4geyByb3c6IDAsIGNvbHVtbjogMCB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxpbmU7XG4gICAgICAgIHZhciBkb2NSb3cgPSAwO1xuICAgICAgICB2YXIgZG9jQ29sdW1uID0gMDtcbiAgICAgICAgdmFyIGNvbHVtbjtcbiAgICAgICAgdmFyIHJvdyA9IDA7XG4gICAgICAgIHZhciByb3dMZW5ndGggPSAwO1xuXG4gICAgICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJHNjcmVlblJvd0NhY2hlO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIHNjcmVlblJvdyk7XG4gICAgICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb2NSb3cgPSB0aGlzLiRkb2NSb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gc2NyZWVuUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBtYXhSb3cgPSB0aGlzLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHJvdyA8PSBzY3JlZW5Sb3cpIHtcbiAgICAgICAgICAgIHJvd0xlbmd0aCA9IHRoaXMuZ2V0Um93TGVuZ3RoKGRvY1Jvdyk7XG4gICAgICAgICAgICBpZiAocm93ICsgcm93TGVuZ3RoID4gc2NyZWVuUm93IHx8IGRvY1JvdyA+PSBtYXhSb3cpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93ICs9IHJvd0xlbmd0aDtcbiAgICAgICAgICAgICAgICBkb2NSb3crKztcbiAgICAgICAgICAgICAgICBpZiAoZG9jUm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKGRvY1Jvdyk7XG4gICAgICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZvbGRMaW5lICYmIGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cpIHtcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSk7XG4gICAgICAgICAgICBkb2NSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIH0gZWxzZSBpZiAocm93ICsgcm93TGVuZ3RoIDw9IHNjcmVlblJvdyB8fCBkb2NSb3cgPiBtYXhSb3cpIHtcbiAgICAgICAgICAgIC8vIGNsaXAgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgcm93OiBtYXhSb3csXG4gICAgICAgICAgICAgICAgY29sdW1uOiB0aGlzLmdldExpbmUobWF4Um93KS5sZW5ndGhcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KTtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW2RvY1Jvd107XG4gICAgICAgICAgICBpZiAoc3BsaXRzKSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0SW5kZXggPSBNYXRoLmZsb29yKHNjcmVlblJvdyAtIHJvdyk7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXhdO1xuICAgICAgICAgICAgICAgIGlmIChzcGxpdEluZGV4ID4gMCAmJiBzcGxpdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGRvY0NvbHVtbiA9IHNwbGl0c1tzcGxpdEluZGV4IC0gMV0gfHwgc3BsaXRzW3NwbGl0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICAgICAgICAgICAgbGluZSA9IGxpbmUuc3Vic3RyaW5nKGRvY0NvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZG9jQ29sdW1uICs9IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKGxpbmUsIHNjcmVlbkNvbHVtbilbMV07XG5cbiAgICAgICAgLy8gV2UgcmVtb3ZlIG9uZSBjaGFyYWN0ZXIgYXQgdGhlIGVuZCBzbyB0aGF0IHRoZSBkb2NDb2x1bW5cbiAgICAgICAgLy8gcG9zaXRpb24gcmV0dXJuZWQgaXMgbm90IGFzc29jaWF0ZWQgdG8gdGhlIG5leHQgcm93IG9uIHRoZSBzY3JlZW4uXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSAmJiBkb2NDb2x1bW4gPj0gY29sdW1uKVxuICAgICAgICAgICAgZG9jQ29sdW1uID0gY29sdW1uIC0gMTtcblxuICAgICAgICBpZiAoZm9sZExpbmUpXG4gICAgICAgICAgICByZXR1cm4gZm9sZExpbmUuaWR4VG9Qb3NpdGlvbihkb2NDb2x1bW4pO1xuXG4gICAgICAgIHJldHVybiB7IHJvdzogZG9jUm93LCBjb2x1bW46IGRvY0NvbHVtbiB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIGRvY3VtZW50IGNvb3JkaW5hdGVzIHRvIHNjcmVlbiBjb29yZGluYXRlcy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1JvdyBUaGUgZG9jdW1lbnQgcm93IHRvIGNoZWNrXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtbiBUaGUgZG9jdW1lbnQgY29sdW1uIHRvIGNoZWNrXG4gICAgICogQHJldHVybiB7UG9zaXRpb259IFRoZSBvYmplY3QgcmV0dXJuZWQgYnkgdGhpcyBtZXRob2QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgICovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBQb3NpdGlvbiB7XG4gICAgICAgIHZhciBwb3M6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgcGFzc2VkIGluIGFyZ3VtZW50cy5cbiAgICAgICAgaWYgKHR5cGVvZiBkb2NDb2x1bW4gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93Wydyb3cnXSwgZG9jUm93Wydjb2x1bW4nXSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBhc3NlcnQodHlwZW9mIGRvY1JvdyA9PT0gJ251bWJlcicsIFwiZG9jUm93IG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBwb3MgPSB0aGlzLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvY1JvdyA9IHBvcy5yb3c7XG4gICAgICAgIGRvY0NvbHVtbiA9IHBvcy5jb2x1bW47XG4gICAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NDb2x1bW4gPT09ICdudW1iZXInLCBcImRvY0NvbHVtbiBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuXG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSAwO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0Um93ID0gbnVsbDtcbiAgICAgICAgdmFyIGZvbGQgPSBudWxsO1xuXG4gICAgICAgIC8vIENsYW1wIHRoZSBkb2NSb3cgcG9zaXRpb24gaW4gY2FzZSBpdCdzIGluc2lkZSBvZiBhIGZvbGRlZCBibG9jay5cbiAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGRvY1JvdywgZG9jQ29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIGRvY1JvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgZG9jQ29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcm93RW5kLCByb3cgPSAwO1xuXG4gICAgICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJGRvY1Jvd0NhY2hlO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIGRvY1Jvdyk7XG4gICAgICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLiRzY3JlZW5Sb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gZG9jUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlIChyb3cgPCBkb2NSb3cpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPj0gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgcm93RW5kID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgaWYgKHJvd0VuZCA+IGRvY1JvdylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShyb3dFbmQsIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93RW5kID0gcm93ICsgMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2NyZWVuUm93ICs9IHRoaXMuZ2V0Um93TGVuZ3RoKHJvdyk7XG4gICAgICAgICAgICByb3cgPSByb3dFbmQ7XG5cbiAgICAgICAgICAgIGlmIChkb0NhY2hlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnB1c2goc2NyZWVuUm93KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgdGV4dCBsaW5lIHRoYXQgaXMgZGlzcGxheWVkIGluIGRvY1JvdyBvbiB0aGUgc2NyZWVuLlxuICAgICAgICB2YXIgdGV4dExpbmUgPSBcIlwiO1xuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmluYWwgcm93IHdlIHdhbnQgdG8gcmVhY2ggaXMgaW5zaWRlIG9mIGEgZm9sZC5cbiAgICAgICAgaWYgKGZvbGRMaW5lICYmIHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmUsIGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRTdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRMaW5lKGRvY1Jvdykuc3Vic3RyaW5nKDAsIGRvY0NvbHVtbik7XG4gICAgICAgICAgICBmb2xkU3RhcnRSb3cgPSBkb2NSb3c7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2xhbXAgdGV4dExpbmUgaWYgaW4gd3JhcE1vZGUuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHdyYXBSb3cgPSB0aGlzLiR3cmFwRGF0YVtmb2xkU3RhcnRSb3ddO1xuICAgICAgICAgICAgaWYgKHdyYXBSb3cpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2NyZWVuUm93T2Zmc2V0ID0gMDtcbiAgICAgICAgICAgICAgICB3aGlsZSAodGV4dExpbmUubGVuZ3RoID49IHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0XSkge1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Sb3crKztcbiAgICAgICAgICAgICAgICAgICAgc2NyZWVuUm93T2Zmc2V0Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRleHRMaW5lID0gdGV4dExpbmUuc3Vic3RyaW5nKHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0IC0gMV0gfHwgMCwgdGV4dExpbmUubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IHNjcmVlblJvdyxcbiAgICAgICAgICAgIGNvbHVtbjogdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodGV4dExpbmUpWzBdXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgcmV0dXJucyB0aGUgc2NyZWVuIGNvbHVtbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZG9jdW1lbnRUb1NjcmVlbkNvbHVtblxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuQ29sdW1uKGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikuY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiByb3cuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGRvY3VtZW50VG9TY3JlZW5Sb3dcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pLnJvdztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGRvY3VtZW50VG9TY3JlZW5SYW5nZVxuICAgICAqIEBwYXJhbSByYW5nZSB7UmFuZ2V9XG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgICovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5SYW5nZShyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIHZhciBzY3JlZW5Qb3NTdGFydCA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgdmFyIHNjcmVlblBvc0VuZCA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHNjcmVlblBvc1N0YXJ0LnJvdywgc2NyZWVuUG9zU3RhcnQuY29sdW1uLCBzY3JlZW5Qb3NFbmQucm93LCBzY3JlZW5Qb3NFbmQuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBsZW5ndGggb2YgdGhlIHNjcmVlbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2NyZWVuTGVuZ3RoXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5MZW5ndGgoKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIHNjcmVlblJvd3MgPSAwO1xuICAgICAgICB2YXIgZm9sZDogRm9sZExpbmUgPSBudWxsO1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICBzY3JlZW5Sb3dzID0gdGhpcy5nZXRMZW5ndGgoKTtcblxuICAgICAgICAgICAgLy8gUmVtb3ZlIHRoZSBmb2xkZWQgbGluZXMgYWdhaW4uXG4gICAgICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmb2xkID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICAgICAgc2NyZWVuUm93cyAtPSBmb2xkLmVuZC5yb3cgLSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBsYXN0Um93ID0gdGhpcy4kd3JhcERhdGEubGVuZ3RoO1xuICAgICAgICAgICAgdmFyIHJvdyA9IDAsIGkgPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLiRmb2xkRGF0YVtpKytdO1xuICAgICAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGQgPyBmb2xkLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgICAgICB3aGlsZSAocm93IDwgbGFzdFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzcGxpdHMgPSB0aGlzLiR3cmFwRGF0YVtyb3ddO1xuICAgICAgICAgICAgICAgIHNjcmVlblJvd3MgKz0gc3BsaXRzID8gc3BsaXRzLmxlbmd0aCArIDEgOiAxO1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gZm9sZC5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGQgPyBmb2xkLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRvZG9cbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpIHtcbiAgICAgICAgICAgIHNjcmVlblJvd3MgKz0gdGhpcy4kZ2V0V2lkZ2V0U2NyZWVuTGVuZ3RoKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2NyZWVuUm93cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHB1YmxpYyAkc2V0Rm9udE1ldHJpY3MoZm06IEZvbnRNZXRyaWNzKSB7XG4gICAgICAgIC8vIFRPRE8/XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBmaW5kTWF0Y2hpbmdCcmFja2V0XG4gICAgICogQHBhcmFtIHBvc2l0aW9uIHtQb3NpdGlvbn1cbiAgICAgKiBAcGFyYW0gW2Nocl0ge3N0cmluZ31cbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn1cbiAgICAgKi9cbiAgICBmaW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uOiBQb3NpdGlvbiwgY2hyPzogc3RyaW5nKTogUG9zaXRpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZmluZE1hdGNoaW5nQnJhY2tldChwb3NpdGlvbiwgY2hyKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGdldEJyYWNrZXRSYW5nZVxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiB7UG9zaXRpb259XG4gICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgICovXG4gICAgZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uOiBQb3NpdGlvbik6IFJhbmdlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLmdldEJyYWNrZXRSYW5nZShwb3NpdGlvbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBmaW5kT3BlbmluZ0JyYWNrZXRcbiAgICAgKiBAcGFyYW0gYnJhY2tldCB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiB7UG9zaXRpb259XG4gICAgICogQHBhcmFtIFt0eXBlUmVdIHtSZWdFeHB9XG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICovXG4gICAgZmluZE9wZW5pbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IFBvc2l0aW9uLCB0eXBlUmU/OiBSZWdFeHApOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5maW5kT3BlbmluZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBmaW5kQ2xvc2luZ0JyYWNrZXRcbiAgICAgKiBAcGFyYW0gYnJhY2tldCB7c3RyaW5nfVxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiB7UG9zaXRpb259XG4gICAgICogQHBhcmFtIFt0eXBlUmVdIHtSZWdFeHB9XG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICovXG4gICAgZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IFBvc2l0aW9uLCB0eXBlUmU/OiBSZWdFeHApOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5maW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZm9sZE1vZGU6IEZvbGRNb2RlO1xuXG4gICAgLy8gc3RydWN0dXJlZCBmb2xkaW5nXG4gICAgJGZvbGRTdHlsZXMgPSB7XG4gICAgICAgIFwibWFudWFsXCI6IDEsXG4gICAgICAgIFwibWFya2JlZ2luXCI6IDEsXG4gICAgICAgIFwibWFya2JlZ2luZW5kXCI6IDFcbiAgICB9XG4gICAgJGZvbGRTdHlsZSA9IFwibWFya2JlZ2luXCI7XG5cbiAgICAvKlxuICAgICAqIExvb2tzIHVwIGEgZm9sZCBhdCBhIGdpdmVuIHJvdy9jb2x1bW4uIFBvc3NpYmxlIHZhbHVlcyBmb3Igc2lkZTpcbiAgICAgKiAgIC0xOiBpZ25vcmUgYSBmb2xkIGlmIGZvbGQuc3RhcnQgPSByb3cvY29sdW1uXG4gICAgICogICArMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLmVuZCA9IHJvdy9jb2x1bW5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0Rm9sZEF0XG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBjb2x1bW4ge251bWJlcn1cbiAgICAgKiBAcGFyYW0gW3NpZGVdIHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7Rm9sZH1cbiAgICAgKi9cbiAgICBnZXRGb2xkQXQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBzaWRlPzogbnVtYmVyKTogRm9sZCB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcbiAgICAgICAgaWYgKCFmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IGZvbGRzW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGQucmFuZ2UuY29udGFpbnMocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNpZGUgPT09IDEgJiYgZm9sZC5yYW5nZS5pc0VuZChyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHNpZGUgPT09IC0xICYmIGZvbGQucmFuZ2UuaXNTdGFydChyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBSZXR1cm5zIGFsbCBmb2xkcyBpbiB0aGUgZ2l2ZW4gcmFuZ2UuIE5vdGUsIHRoYXQgdGhpcyB3aWxsIHJldHVybiBmb2xkc1xuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRGb2xkc0luUmFuZ2VcbiAgICAgKiBAcGFyYW0gcmFuZ2Uge1JhbmdlfVxuICAgICAqIEByZXR1cm4ge0ZvbGRbXX1cbiAgICAgKi9cbiAgICBnZXRGb2xkc0luUmFuZ2UocmFuZ2U6IFJhbmdlKTogRm9sZFtdIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBlbmQgPSByYW5nZS5lbmQ7XG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGZvdW5kRm9sZHM6IEZvbGRbXSA9IFtdO1xuXG4gICAgICAgIHN0YXJ0LmNvbHVtbiArPSAxO1xuICAgICAgICBlbmQuY29sdW1uIC09IDE7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkTGluZXNbaV0ucmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgICAgICAgIC8vIFJhbmdlIGlzIGJlZm9yZSBmb2xkTGluZS4gTm8gaW50ZXJzZWN0aW9uLiBUaGlzIG1lYW5zLFxuICAgICAgICAgICAgICAgIC8vIHRoZXJlIG1pZ2h0IGJlIG90aGVyIGZvbGRMaW5lcyB0aGF0IGludGVyc2VjdC5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PSAtMikge1xuICAgICAgICAgICAgICAgIC8vIFJhbmdlIGlzIGFmdGVyIGZvbGRMaW5lLiBUaGVyZSBjYW4ndCBiZSBhbnkgb3RoZXIgZm9sZExpbmVzIHRoZW4sXG4gICAgICAgICAgICAgICAgLy8gc28gbGV0J3MgZ2l2ZSB1cC5cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmVzW2ldLmZvbGRzO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIHZhciBmb2xkID0gZm9sZHNbal07XG4gICAgICAgICAgICAgICAgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gLTIpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gV1RGLXN0YXRlOiBDYW4gaGFwcGVuIGR1ZSB0byAtMS8rMSB0byBzdGFydC9lbmQgY29sdW1uLlxuICAgICAgICAgICAgICAgICAgICBpZiAoY21wID09IDQyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvdW5kRm9sZHMucHVzaChmb2xkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzdGFydC5jb2x1bW4gLT0gMTtcbiAgICAgICAgZW5kLmNvbHVtbiArPSAxO1xuXG4gICAgICAgIHJldHVybiBmb3VuZEZvbGRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0Rm9sZHNJblJhbmdlTGlzdFxuICAgICAqL1xuICAgIGdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2VzKTogRm9sZFtdIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmFuZ2VzKSkge1xuICAgICAgICAgICAgdmFyIGZvbGRzOiBGb2xkW10gPSBbXTtcbiAgICAgICAgICAgIHJhbmdlcy5mb3JFYWNoKGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgICAgICAgICAgZm9sZHMgPSBmb2xkcy5jb25jYXQodGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpKTtcbiAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2VzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZm9sZHM7XG4gICAgfVxuICAgIFxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYWxsIGZvbGRzIGluIHRoZSBkb2N1bWVudFxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRBbGxGb2xkc1xuICAgICAqIEByZXR1cm4ge0ZvbGRbXX1cbiAgICAgKi9cbiAgICBnZXRBbGxGb2xkcygpOiBGb2xkW10ge1xuICAgICAgICB2YXIgZm9sZHMgPSBbXTtcbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkTGluZXNbaV0uZm9sZHMubGVuZ3RoOyBqKyspXG4gICAgICAgICAgICAgICAgZm9sZHMucHVzaChmb2xkTGluZXNbaV0uZm9sZHNbal0pO1xuXG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybnMgdGhlIHN0cmluZyBiZXR3ZWVuIGZvbGRzIGF0IHRoZSBnaXZlbiBwb3NpdGlvbi5cbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtPiBcImJhclwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtPiBcIndvcmxkXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvfGxkPndvbHJkIC0+IDxudWxsPlxuICAgICAqXG4gICAgICogd2hlcmUgfCBtZWFucyB0aGUgcG9zaXRpb24gb2Ygcm93L2NvbHVtblxuICAgICAqXG4gICAgICogVGhlIHRyaW0gb3B0aW9uIGRldGVybXMgaWYgdGhlIHJldHVybiBzdHJpbmcgc2hvdWxkIGJlIHRyaW1lZCBhY2NvcmRpbmdcbiAgICAgKiB0byB0aGUgXCJzaWRlXCIgcGFzc2VkIHdpdGggdGhlIHRyaW0gdmFsdWU6XG4gICAgICpcbiAgICAgKiBFLmcuXG4gICAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtdHJpbT0tMT4gXCJiXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvbGQ+d29sfHJkIC10cmltPSsxPiBcInJsZFwiXG4gICAgICogIGZvfG88Zm9sZD5iYXI8Zm9sZD53b2xyZCAtdHJpbT0wMD4gXCJmb29cIlxuICAgICAqL1xuICAgIGdldEZvbGRTdHJpbmdBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHRyaW06IG51bWJlciwgZm9sZExpbmU/OiBGb2xkTGluZSk6IHN0cmluZyB7XG4gICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmUgfHwgdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGxhc3RGb2xkID0ge1xuICAgICAgICAgICAgZW5kOiB7IGNvbHVtbjogMCB9XG4gICAgICAgIH07XG4gICAgICAgIC8vIFRPRE86IFJlZmFjdG9yIHRvIHVzZSBnZXROZXh0Rm9sZFRvIGZ1bmN0aW9uLlxuICAgICAgICB2YXIgc3RyOiBzdHJpbmc7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lLmZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBmb2xkID0gZm9sZExpbmUuZm9sZHNbaV07XG4gICAgICAgICAgICB2YXIgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlRW5kKHJvdywgY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBzdHIgPSB0aGlzLmdldExpbmUoZm9sZC5zdGFydC5yb3cpLnN1YnN0cmluZyhsYXN0Rm9sZC5lbmQuY29sdW1uLCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT09IDApIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxhc3RGb2xkID0gZm9sZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXN0cilcbiAgICAgICAgICAgIHN0ciA9IHRoaXMuZ2V0TGluZShmb2xkLnN0YXJ0LnJvdykuc3Vic3RyaW5nKGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuXG4gICAgICAgIGlmICh0cmltID09IC0xKVxuICAgICAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIGVsc2UgaWYgKHRyaW0gPT0gMSlcbiAgICAgICAgICAgIHJldHVybiBzdHIuc3Vic3RyaW5nKGNvbHVtbiAtIGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgIH1cblxuICAgIGdldEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lPzogRm9sZExpbmUpOiBGb2xkTGluZSB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIGlmIChzdGFydEZvbGRMaW5lKVxuICAgICAgICAgICAgaSA9IGZvbGREYXRhLmluZGV4T2Yoc3RhcnRGb2xkTGluZSk7XG4gICAgICAgIGlmIChpID09IC0xKVxuICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgIGZvciAoaTsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPD0gZG9jUm93ICYmIGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChmb2xkTGluZS5lbmQucm93ID4gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gcmV0dXJucyB0aGUgZm9sZCB3aGljaCBzdGFydHMgYWZ0ZXIgb3IgY29udGFpbnMgZG9jUm93XG4gICAgZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRMaW5lPzogRm9sZExpbmUpOiBGb2xkTGluZSB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIGlmIChzdGFydEZvbGRMaW5lKVxuICAgICAgICAgICAgaSA9IGZvbGREYXRhLmluZGV4T2Yoc3RhcnRGb2xkTGluZSk7XG4gICAgICAgIGlmIChpID09IC0xKVxuICAgICAgICAgICAgaSA9IDA7XG4gICAgICAgIGZvciAoaTsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5lbmQucm93ID49IGRvY1Jvdykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBnZXRGb2xkZWRSb3dDb3VudChmaXJzdDogbnVtYmVyLCBsYXN0OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIHJvd0NvdW50ID0gbGFzdCAtIGZpcnN0ICsgMTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV0sXG4gICAgICAgICAgICAgICAgZW5kID0gZm9sZExpbmUuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICBzdGFydCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIGlmIChlbmQgPj0gbGFzdCkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFydCA8IGxhc3QpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXJ0ID49IGZpcnN0KVxuICAgICAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gbGFzdCAtIHN0YXJ0O1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICByb3dDb3VudCA9IDA7Ly9pbiBvbmUgZm9sZFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZW5kID49IGZpcnN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0ID49IGZpcnN0KSAvL2ZvbGQgaW5zaWRlIHJhbmdlXG4gICAgICAgICAgICAgICAgICAgIHJvd0NvdW50IC09IGVuZCAtIHN0YXJ0O1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gZW5kIC0gZmlyc3QgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByb3dDb3VudDtcbiAgICB9XG5cbiAgICBwcml2YXRlICRhZGRGb2xkTGluZShmb2xkTGluZTogRm9sZExpbmUpIHtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEucHVzaChmb2xkTGluZSk7XG4gICAgICAgIHRoaXMuJGZvbGREYXRhLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGEuc3RhcnQucm93IC0gYi5zdGFydC5yb3c7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIG5ldyBmb2xkLlxuICAgICAqXG4gICAgICogQHJldHVyblxuICAgICAqICAgICAgVGhlIG5ldyBjcmVhdGVkIEZvbGQgb2JqZWN0IG9yIGFuIGV4aXN0aW5nIGZvbGQgb2JqZWN0IGluIGNhc2UgdGhlXG4gICAgICogICAgICBwYXNzZWQgaW4gcmFuZ2UgZml0cyBhbiBleGlzdGluZyBmb2xkIGV4YWN0bHkuXG4gICAgICovXG4gICAgYWRkRm9sZChwbGFjZWhvbGRlcjogc3RyaW5nIHwgRm9sZCwgcmFuZ2U6IFJhbmdlKTogRm9sZCB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgYWRkZWQgPSBmYWxzZTtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG5cbiAgICAgICAgaWYgKHBsYWNlaG9sZGVyIGluc3RhbmNlb2YgRm9sZClcbiAgICAgICAgICAgIGZvbGQgPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgZWxzZSBpZiAodHlwZW9mIHBsYWNlaG9sZGVyID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZm9sZCA9IG5ldyBGb2xkKHJhbmdlLCBwbGFjZWhvbGRlcik7XG4gICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSByYW5nZS5jb2xsYXBzZUNoaWxkcmVuO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwicGxhY2Vob2xkZXIgbXVzdCBiZSBhIHN0cmluZyBvciBhIEZvbGQuXCIpO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZJWE1FOiAkY2xpcFJhbmdlVG9Eb2N1bWVudD9cbiAgICAgICAgLy8gZm9sZC5yYW5nZSA9IHRoaXMuY2xpcFJhbmdlKGZvbGQucmFuZ2UpO1xuICAgICAgICBmb2xkLnJhbmdlID0gdGhpcy4kY2xpcFJhbmdlVG9Eb2N1bWVudChmb2xkLnJhbmdlKVxuXG4gICAgICAgIHZhciBzdGFydFJvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICB2YXIgc3RhcnRDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgdmFyIGVuZFJvdyA9IGZvbGQuZW5kLnJvdztcbiAgICAgICAgdmFyIGVuZENvbHVtbiA9IGZvbGQuZW5kLmNvbHVtbjtcblxuICAgICAgICAvLyAtLS0gU29tZSBjaGVja2luZyAtLS1cbiAgICAgICAgaWYgKCEoc3RhcnRSb3cgPCBlbmRSb3cgfHxcbiAgICAgICAgICAgIHN0YXJ0Um93ID09IGVuZFJvdyAmJiBzdGFydENvbHVtbiA8PSBlbmRDb2x1bW4gLSAyKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSByYW5nZSBoYXMgdG8gYmUgYXQgbGVhc3QgMiBjaGFyYWN0ZXJzIHdpZHRoXCIpO1xuXG4gICAgICAgIHZhciBzdGFydEZvbGQgPSB0aGlzLmdldEZvbGRBdChzdGFydFJvdywgc3RhcnRDb2x1bW4sIDEpO1xuICAgICAgICB2YXIgZW5kRm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGVuZFJvdywgZW5kQ29sdW1uLCAtMSk7XG4gICAgICAgIGlmIChzdGFydEZvbGQgJiYgZW5kRm9sZCA9PSBzdGFydEZvbGQpXG4gICAgICAgICAgICByZXR1cm4gc3RhcnRGb2xkLmFkZFN1YkZvbGQoZm9sZCk7XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHN0YXJ0Rm9sZCAmJiAhc3RhcnRGb2xkLnJhbmdlLmlzU3RhcnQoc3RhcnRSb3csIHN0YXJ0Q29sdW1uKSlcbiAgICAgICAgICAgIHx8IChlbmRGb2xkICYmICFlbmRGb2xkLnJhbmdlLmlzRW5kKGVuZFJvdywgZW5kQ29sdW1uKSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvbGQgY2FuJ3QgaW50ZXJzZWN0IGFscmVhZHkgZXhpc3RpbmcgZm9sZFwiICsgZm9sZC5yYW5nZSArIHN0YXJ0Rm9sZC5yYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgZm9sZHMgaW4gdGhlIHJhbmdlIHdlIGNyZWF0ZSB0aGUgbmV3IGZvbGQgZm9yLlxuICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShmb2xkLnJhbmdlKTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgZm9sZHMgZnJvbSBmb2xkIGRhdGEuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgIC8vIEFkZCB0aGUgcmVtb3ZlZCBmb2xkcyBhcyBzdWJmb2xkcyBvbiB0aGUgbmV3IGZvbGQuXG4gICAgICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgICAgICAgICAgICBmb2xkLmFkZFN1YkZvbGQoc3ViRm9sZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGVuZFJvdyA9PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHN0YXJ0Um93ID09IGZvbGRMaW5lLmVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBpZiAoIWZvbGQuc2FtZVJvdykge1xuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiB3ZSBtaWdodCBoYXZlIHRvIG1lcmdlIHR3byBGb2xkTGluZXMuXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZU5leHQgPSBmb2xkRGF0YVtpICsgMV07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZU5leHQgJiYgZm9sZExpbmVOZXh0LnN0YXJ0LnJvdyA9PSBlbmRSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdlIG5lZWQgdG8gbWVyZ2UhXG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5tZXJnZShmb2xkTGluZU5leHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChlbmRSb3cgPD0gZm9sZExpbmUuc3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWFkZGVkKVxuICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRhZGRGb2xkTGluZShuZXcgRm9sZExpbmUodGhpcy4kZm9sZERhdGEsIFtmb2xkXSkpO1xuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZvbGRMaW5lLnN0YXJ0LnJvdywgZm9sZExpbmUuc3RhcnQucm93KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZm9sZExpbmUuc3RhcnQucm93LCBmb2xkTGluZS5zdGFydC5yb3cpO1xuXG4gICAgICAgIC8vIE5vdGlmeSB0aGF0IGZvbGQgZGF0YSBoYXMgY2hhbmdlZC5cbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VGb2xkXG4gICAgICAgICAqIEBwYXJhbSBmb2xkRXZlbnQge0ZvbGRFdmVudH1cbiAgICAgICAgICovXG4gICAgICAgIHZhciBmb2xkRXZlbnQ6IEZvbGRFdmVudCA9IHsgZGF0YTogZm9sZCwgYWN0aW9uOiBcImFkZFwiIH07XG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VGb2xkXCIsIGZvbGRFdmVudCk7XG5cbiAgICAgICAgcmV0dXJuIGZvbGQ7XG4gICAgfVxuXG4gICAgc2V0TW9kaWZpZWQobW9kaWZpZWQ6IGJvb2xlYW4pIHtcblxuICAgIH1cblxuICAgIGFkZEZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICAgICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH1cblxuICAgIHJlbW92ZUZvbGQoZm9sZDogRm9sZCk6IHZvaWQge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkLmZvbGRMaW5lO1xuICAgICAgICB2YXIgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuXG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHM7XG4gICAgICAgIC8vIFNpbXBsZSBjYXNlIHdoZXJlIHRoZXJlIGlzIG9ubHkgb25lIGZvbGQgaW4gdGhlIEZvbGRMaW5lIHN1Y2ggdGhhdFxuICAgICAgICAvLyB0aGUgZW50aXJlIGZvbGQgbGluZSBjYW4gZ2V0IHJlbW92ZWQgZGlyZWN0bHkuXG4gICAgICAgIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgZm9sZExpbmVzLnNwbGljZShmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSksIDEpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIHRoZSBsYXN0IGZvbGQgb2YgdGhlIGZvbGRMaW5lLCBqdXN0IHJlbW92ZSBpdC5cbiAgICAgICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc0VuZChmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICBmb2xkcy5wb3AoKTtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5lbmQucm93ID0gZm9sZHNbZm9sZHMubGVuZ3RoIC0gMV0uZW5kLnJvdztcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5lbmQuY29sdW1uID0gZm9sZHNbZm9sZHMubGVuZ3RoIC0gMV0uZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgZmlyc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc1N0YXJ0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gV2Uga25vdyB0aGVyZSBhcmUgbW9yZSB0aGVuIDIgZm9sZHMgYW5kIHRoZSBmb2xkIGlzIG5vdCBhdCB0aGUgZWRnZS5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBtZWFucywgdGhlIGZvbGQgaXMgc29tZXdoZXJlIGluIGJldHdlZW4uXG4gICAgICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIGluIG9uZSByb3csIHdlIGp1c3QgY2FuIHJlbW92ZSBpdC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGQuc2FtZVJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMuc3BsaWNlKGZvbGRzLmluZGV4T2YoZm9sZCksIDEpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGZvbGQgZ29lcyBvdmVyIG1vcmUgdGhlbiBvbmUgcm93LiBUaGlzIG1lYW5zIHJlbXZvaW5nIHRoaXMgZm9sZFxuICAgICAgICAgICAgICAgICAgICAvLyB3aWxsIGNhdXNlIHRoZSBmb2xkIGxpbmUgdG8gZ2V0IHNwbGl0dGVkIHVwLiBuZXdGb2xkTGluZSBpcyB0aGUgc2Vjb25kIHBhcnRcbiAgICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIG5ld0ZvbGRMaW5lID0gZm9sZExpbmUuc3BsaXQoZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzID0gbmV3Rm9sZExpbmUuZm9sZHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3Rm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3Rm9sZExpbmUuc3RhcnQuY29sdW1uID0gZm9sZHNbMF0uc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLiR1cGRhdGluZykge1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKHN0YXJ0Um93LCBlbmRSb3cpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKHN0YXJ0Um93LCBlbmRSb3cpO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICAvLyBOb3RpZnkgdGhhdCBmb2xkIGRhdGEgaGFzIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhbmdlRm9sZFxuICAgICAgICAgKiBAcGFyYW0gZm9sZEV2ZW50IHtGb2xkRXZlbnR9XG4gICAgICAgICAqL1xuICAgICAgICB2YXIgZm9sZEV2ZW50OiBGb2xkRXZlbnQgPSB7IGRhdGE6IGZvbGQsIGFjdGlvbjogXCJyZW1vdmVcIiB9O1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlRm9sZFwiLCBmb2xkRXZlbnQpO1xuICAgIH1cblxuICAgIHJlbW92ZUZvbGRzKGZvbGRzOiBGb2xkW10pOiB2b2lkIHtcbiAgICAgICAgLy8gV2UgbmVlZCB0byBjbG9uZSB0aGUgZm9sZHMgYXJyYXkgcGFzc2VkIGluIGFzIGl0IG1pZ2h0IGJlIHRoZSBmb2xkc1xuICAgICAgICAvLyBhcnJheSBvZiBhIGZvbGQgbGluZSBhbmQgYXMgd2UgY2FsbCB0aGlzLnJlbW92ZUZvbGQoZm9sZCksIGZvbGRzXG4gICAgICAgIC8vIGFyZSByZW1vdmVkIGZyb20gZm9sZHMgYW5kIGNoYW5nZXMgdGhlIGN1cnJlbnQgaW5kZXguXG4gICAgICAgIHZhciBjbG9uZUZvbGRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNsb25lRm9sZHMucHVzaChmb2xkc1tpXSk7XG4gICAgICAgIH1cblxuICAgICAgICBjbG9uZUZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICB9XG5cbiAgICBleHBhbmRGb2xkKGZvbGQ6IEZvbGQpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICBmb2xkLnN1YkZvbGRzLmZvckVhY2goZnVuY3Rpb24oc3ViRm9sZCkge1xuICAgICAgICAgICAgZm9sZC5yZXN0b3JlUmFuZ2Uoc3ViRm9sZCk7XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGQoc3ViRm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICBpZiAoZm9sZC5jb2xsYXBzZUNoaWxkcmVuID4gMCkge1xuICAgICAgICAgICAgdGhpcy5mb2xkQWxsKGZvbGQuc3RhcnQucm93ICsgMSwgZm9sZC5lbmQucm93LCBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gLSAxKTtcbiAgICAgICAgfVxuICAgICAgICBmb2xkLnN1YkZvbGRzID0gW107XG4gICAgfVxuXG4gICAgZXhwYW5kRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxuXG4gICAgdW5mb2xkKGxvY2F0aW9uPzogYW55LCBleHBhbmRJbm5lcj86IGJvb2xlYW4pOiBGb2xkW10ge1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICB2YXIgZm9sZHM6IEZvbGRbXTtcbiAgICAgICAgaWYgKGxvY2F0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIHRoaXMuZ2V0TGVuZ3RoKCksIDApO1xuICAgICAgICAgICAgZXhwYW5kSW5uZXIgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBsb2NhdGlvbiA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UobG9jYXRpb24sIDAsIGxvY2F0aW9uLCB0aGlzLmdldExpbmUobG9jYXRpb24pLmxlbmd0aCk7XG4gICAgICAgIGVsc2UgaWYgKFwicm93XCIgaW4gbG9jYXRpb24pXG4gICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMobG9jYXRpb24sIGxvY2F0aW9uKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmFuZ2UgPSBsb2NhdGlvbjtcblxuICAgICAgICBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgIGlmIChleHBhbmRJbm5lcikge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhmb2xkcyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgc3ViRm9sZHMgPSBmb2xkcztcbiAgICAgICAgICAgIC8vIFRPRE86IG1pZ2h0IGJlIGJldHRlciB0byByZW1vdmUgYW5kIGFkZCBmb2xkcyBpbiBvbmUgZ28gaW5zdGVhZCBvZiB1c2luZ1xuICAgICAgICAgICAgLy8gZXhwYW5kRm9sZHMgc2V2ZXJhbCB0aW1lcy5cbiAgICAgICAgICAgIHdoaWxlIChzdWJGb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKHN1YkZvbGRzKTtcbiAgICAgICAgICAgICAgICBzdWJGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIENoZWNrcyBpZiBhIGdpdmVuIGRvY3VtZW50Um93IGlzIGZvbGRlZC4gVGhpcyBpcyB0cnVlIGlmIHRoZXJlIGFyZSBzb21lXG4gICAgICogZm9sZGVkIHBhcnRzIHN1Y2ggdGhhdCBzb21lIHBhcnRzIG9mIHRoZSBsaW5lIGlzIHN0aWxsIHZpc2libGUuXG4gICAgICoqL1xuICAgIGlzUm93Rm9sZGVkKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c6IEZvbGRMaW5lKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgIH1cblxuICAgIGdldFJvd0ZvbGRFbmQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdz86IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLmVuZC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Um93Rm9sZFN0YXJ0KGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c/OiBGb2xkTGluZSk6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgICAgICByZXR1cm4gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSwgZW5kUm93PzogbnVtYmVyLCBlbmRDb2x1bW4/OiBudW1iZXIsIHN0YXJ0Um93PzogbnVtYmVyLCBzdGFydENvbHVtbj86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGlmIChzdGFydFJvdyA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIGlmIChzdGFydENvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRDb2x1bW4gPSAwO1xuICAgICAgICBpZiAoZW5kUm93ID09IG51bGwpXG4gICAgICAgICAgICBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICBpZiAoZW5kQ29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmUoZW5kUm93KS5sZW5ndGg7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSB0ZXh0bGluZSB1c2luZyB0aGUgRm9sZExpbmUgd2Fsa2VyLlxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG5cbiAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlcjogc3RyaW5nLCByb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGxhc3RDb2x1bW46IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHJvdyA8IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmIChyb3cgPT0gc3RhcnRSb3cpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uIDwgc3RhcnRDb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBsYXN0Q29sdW1uID0gTWF0aC5tYXgoc3RhcnRDb2x1bW4sIGxhc3RDb2x1bW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRleHRMaW5lICs9IHBsYWNlaG9sZGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0ZXh0TGluZSArPSBzZWxmLmdldExpbmUocm93KS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZW5kUm93LCBlbmRDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGV4dExpbmU7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUxpbmUocm93OiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBzdGFydFJvdzogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuXG4gICAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBsaW5lOiBzdHJpbmc7XG4gICAgICAgICAgICBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5zdWJzdHJpbmcoc3RhcnRDb2x1bW4gfHwgMCwgZW5kQ29sdW1uIHx8IGxpbmUubGVuZ3RoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldEZvbGREaXNwbGF5TGluZShcbiAgICAgICAgICAgICAgICBmb2xkTGluZSwgcm93LCBlbmRDb2x1bW4sIHN0YXJ0Um93LCBzdGFydENvbHVtbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRjbG9uZUZvbGREYXRhKCkge1xuICAgICAgICB2YXIgZmQgPSBbXTtcbiAgICAgICAgZmQgPSB0aGlzLiRmb2xkRGF0YS5tYXAoZnVuY3Rpb24oZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzLm1hcChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQuY2xvbmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGb2xkTGluZShmZCwgZm9sZHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZmQ7XG4gICAgfVxuXG4gICAgdG9nZ2xlRm9sZCh0cnlUb1VuZm9sZDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG4gICAgICAgIHZhciBicmFja2V0UG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuXG4gICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KGN1cnNvcikpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KHsgcm93OiBjdXJzb3Iucm93LCBjb2x1bW46IGN1cnNvci5jb2x1bW4gKyAxIH0pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PT0gMSlcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gYnJhY2tldFBvcztcblxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuZ2V0Q29tbWVudEZvbGRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSB8fCByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICh0cnlUb1VuZm9sZCAmJiBmb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZm9sZClcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG5cbiAgICAgICAgaWYgKGZvbGQgJiYgZm9sZC5yYW5nZS50b1N0cmluZygpID09IHJhbmdlLnRvU3RyaW5nKCkpIHtcbiAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwbGFjZWhvbGRlciA9IFwiLi4uXCI7XG4gICAgICAgIGlmICghcmFuZ2UuaXNNdWx0aUxpbmUoKSkge1xuICAgICAgICAgICAgcGxhY2Vob2xkZXIgPSB0aGlzLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIubGVuZ3RoIDwgNClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyLnRyaW0oKS5zdWJzdHJpbmcoMCwgMikgKyBcIi4uXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmFkZEZvbGQocGxhY2Vob2xkZXIsIHJhbmdlKTtcbiAgICB9XG5cbiAgICBnZXRDb21tZW50Rm9sZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgZGlyPzogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG4gICAgICAgIHZhciB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICBpZiAodG9rZW4gJiYgL15jb21tZW50fHN0cmluZy8udGVzdCh0b2tlbi50eXBlKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cCh0b2tlbi50eXBlLnJlcGxhY2UoL1xcLi4qLywgXCJcXFxcLlwiKSk7XG4gICAgICAgICAgICBpZiAoZGlyICE9IDEpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgICAgICAgICAgaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCk7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIDI7XG5cbiAgICAgICAgICAgIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcywgcm93LCBjb2x1bW4pO1xuXG4gICAgICAgICAgICBpZiAoZGlyICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG5cbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIHRva2VuLnZhbHVlLmxlbmd0aCAtIDI7XG4gICAgICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb2xkQWxsKHN0YXJ0Um93OiBudW1iZXIsIGVuZFJvdzogbnVtYmVyLCBkZXB0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmIChkZXB0aCA9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBkZXB0aCA9IDEwMDAwMDsgLy8gSlNPTi5zdHJpbmdpZnkgZG9lc24ndCBoYW5sZSBJbmZpbml0eVxuICAgICAgICB2YXIgZm9sZFdpZGdldHMgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgICAgICBpZiAoIWZvbGRXaWRnZXRzKVxuICAgICAgICAgICAgcmV0dXJuOyAvLyBtb2RlIGRvZXNuJ3Qgc3VwcG9ydCBmb2xkaW5nXG4gICAgICAgIGVuZFJvdyA9IGVuZFJvdyB8fCB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgICBzdGFydFJvdyA9IHN0YXJ0Um93IHx8IDA7XG4gICAgICAgIGZvciAodmFyIHJvdyA9IHN0YXJ0Um93OyByb3cgPCBlbmRSb3c7IHJvdysrKSB7XG4gICAgICAgICAgICBpZiAoZm9sZFdpZGdldHNbcm93XSA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGZvbGRXaWRnZXRzW3Jvd10gPSB0aGlzLmdldEZvbGRXaWRnZXQocm93KTtcbiAgICAgICAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddICE9IFwic3RhcnRcIilcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2Uocm93KTtcbiAgICAgICAgICAgIC8vIHNvbWV0aW1lcyByYW5nZSBjYW4gYmUgaW5jb21wYXRpYmxlIHdpdGggZXhpc3RpbmcgZm9sZFxuICAgICAgICAgICAgLy8gVE9ETyBjaGFuZ2UgYWRkRm9sZCB0byByZXR1cm4gbnVsbCBpc3RlYWQgb2YgdGhyb3dpbmdcbiAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5pc011bHRpTGluZSgpXG4gICAgICAgICAgICAgICAgJiYgcmFuZ2UuZW5kLnJvdyA8PSBlbmRSb3dcbiAgICAgICAgICAgICAgICAmJiByYW5nZS5zdGFydC5yb3cgPj0gc3RhcnRSb3dcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJvdyA9IHJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYWRkRm9sZCBjYW4gY2hhbmdlIHRoZSByYW5nZVxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkKVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZC5jb2xsYXBzZUNoaWxkcmVuID0gZGVwdGg7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXRGb2xkU3R5bGUoc3R5bGU6IHN0cmluZykge1xuICAgICAgICBpZiAoIXRoaXMuJGZvbGRTdHlsZXNbc3R5bGVdKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmb2xkIHN0eWxlOiBcIiArIHN0eWxlICsgXCJbXCIgKyBPYmplY3Qua2V5cyh0aGlzLiRmb2xkU3R5bGVzKS5qb2luKFwiLCBcIikgKyBcIl1cIik7XG5cbiAgICAgICAgaWYgKHRoaXMuJGZvbGRTdHlsZSA9PT0gc3R5bGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kZm9sZFN0eWxlID0gc3R5bGU7XG5cbiAgICAgICAgaWYgKHN0eWxlID09PSBcIm1hbnVhbFwiKVxuICAgICAgICAgICAgdGhpcy51bmZvbGQoKTtcbiAgICAgICAgXG4gICAgICAgIC8vIHJlc2V0IGZvbGRpbmdcbiAgICAgICAgdmFyIG1vZGUgPSB0aGlzLiRmb2xkTW9kZTtcbiAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhudWxsKTtcbiAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRzZXRGb2xkaW5nKGZvbGRNb2RlOiBGb2xkTW9kZSkge1xuICAgICAgICBpZiAodGhpcy4kZm9sZE1vZGUgPT0gZm9sZE1vZGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kZm9sZE1vZGUgPSBmb2xkTW9kZTtcblxuICAgICAgICB0aGlzLmV2ZW50QnVzLm9mZignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9lbWl0KFwiY2hhbmdlQW5ub3RhdGlvblwiKTtcblxuICAgICAgICBpZiAoIWZvbGRNb2RlIHx8IHRoaXMuJGZvbGRTdHlsZSA9PT0gXCJtYW51YWxcIikge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cyA9IG51bGw7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmZvbGRXaWRnZXRzID0gW107XG4gICAgICAgIHRoaXMuZ2V0Rm9sZFdpZGdldCA9IGZvbGRNb2RlLmdldEZvbGRXaWRnZXQuYmluZChmb2xkTW9kZSwgdGhpcywgdGhpcy4kZm9sZFN0eWxlKTtcbiAgICAgICAgdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2UgPSBmb2xkTW9kZS5nZXRGb2xkV2lkZ2V0UmFuZ2UuYmluZChmb2xkTW9kZSwgdGhpcywgdGhpcy4kZm9sZFN0eWxlKTtcblxuICAgICAgICB0aGlzLiR1cGRhdGVGb2xkV2lkZ2V0cyA9IHRoaXMudXBkYXRlRm9sZFdpZGdldHMuYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbignY2hhbmdlJywgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMpO1xuXG4gICAgfVxuXG4gICAgZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3c6IG51bWJlciwgaWdub3JlQ3VycmVudD86IGJvb2xlYW4pOiB7IHJhbmdlPzogUmFuZ2U7IGZpcnN0UmFuZ2U/OiBSYW5nZSB9IHtcbiAgICAgICAgdmFyIGZ3ID0gdGhpcy5mb2xkV2lkZ2V0cztcbiAgICAgICAgaWYgKCFmdyB8fCAoaWdub3JlQ3VycmVudCAmJiBmd1tyb3ddKSkge1xuICAgICAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGkgPSByb3cgLSAxO1xuICAgICAgICB2YXIgZmlyc3RSYW5nZTogUmFuZ2U7XG4gICAgICAgIHdoaWxlIChpID49IDApIHtcbiAgICAgICAgICAgIHZhciBjID0gZndbaV07XG4gICAgICAgICAgICBpZiAoYyA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGMgPSBmd1tpXSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChpKTtcblxuICAgICAgICAgICAgaWYgKGMgPT0gXCJzdGFydFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2UoaSk7XG4gICAgICAgICAgICAgICAgaWYgKCFmaXJzdFJhbmdlKVxuICAgICAgICAgICAgICAgICAgICBmaXJzdFJhbmdlID0gcmFuZ2U7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmVuZC5yb3cgPj0gcm93KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGktLTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByYW5nZTogaSAhPT0gLTEgJiYgcmFuZ2UsXG4gICAgICAgICAgICBmaXJzdFJhbmdlOiBmaXJzdFJhbmdlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgb25Gb2xkV2lkZ2V0Q2xpY2socm93OiBudW1iZXIsIGUpIHtcbiAgICAgICAgZSA9IGUuZG9tRXZlbnQ7XG4gICAgICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgICAgICAgY2hpbGRyZW46IGUuc2hpZnRLZXksXG4gICAgICAgICAgICBhbGw6IGUuY3RybEtleSB8fCBlLm1ldGFLZXksXG4gICAgICAgICAgICBzaWJsaW5nczogZS5hbHRLZXlcbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLiR0b2dnbGVGb2xkV2lkZ2V0KHJvdywgb3B0aW9ucyk7XG4gICAgICAgIGlmICghcmFuZ2UpIHtcbiAgICAgICAgICAgIHZhciBlbCA9IChlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQpXG4gICAgICAgICAgICBpZiAoZWwgJiYgL2FjZV9mb2xkLXdpZGdldC8udGVzdChlbC5jbGFzc05hbWUpKVxuICAgICAgICAgICAgICAgIGVsLmNsYXNzTmFtZSArPSBcIiBhY2VfaW52YWxpZFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdG9nZ2xlRm9sZFdpZGdldChyb3c6IG51bWJlciwgb3B0aW9ucyk6IFJhbmdlIHtcbiAgICAgICAgaWYgKCF0aGlzLmdldEZvbGRXaWRnZXQpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciB0eXBlID0gdGhpcy5nZXRGb2xkV2lkZ2V0KHJvdyk7XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICAgICAgdmFyIGRpciA9IHR5cGUgPT09IFwiZW5kXCIgPyAtMSA6IDE7XG4gICAgICAgIHZhciBmb2xkID0gdGhpcy5nZXRGb2xkQXQocm93LCBkaXIgPT09IC0xID8gMCA6IGxpbmUubGVuZ3RoLCBkaXIpO1xuXG4gICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5jaGlsZHJlbiB8fCBvcHRpb25zLmFsbClcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2Uocm93LCB0cnVlKTtcbiAgICAgICAgLy8gc29tZXRpbWVzIHNpbmdsZWxpbmUgZm9sZHMgY2FuIGJlIG1pc3NlZCBieSB0aGUgY29kZSBhYm92ZVxuICAgICAgICBpZiAocmFuZ2UgJiYgIXJhbmdlLmlzTXVsdGlMaW5lKCkpIHtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbiwgMSk7XG4gICAgICAgICAgICBpZiAoZm9sZCAmJiByYW5nZS5pc0VxdWFsKGZvbGQucmFuZ2UpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvcHRpb25zLnNpYmxpbmdzKSB7XG4gICAgICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3cpO1xuICAgICAgICAgICAgaWYgKGRhdGEucmFuZ2UpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhcnRSb3cgPSBkYXRhLnJhbmdlLnN0YXJ0LnJvdyArIDE7XG4gICAgICAgICAgICAgICAgdmFyIGVuZFJvdyA9IGRhdGEucmFuZ2UuZW5kLnJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChzdGFydFJvdywgZW5kUm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAob3B0aW9ucy5jaGlsZHJlbikge1xuICAgICAgICAgICAgZW5kUm93ID0gcmFuZ2UgPyByYW5nZS5lbmQucm93IDogdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChyb3cgKyAxLCByYW5nZS5lbmQucm93LCBvcHRpb25zLmFsbCA/IDEwMDAwIDogMCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLmFsbCkge1xuICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgYSBiaXQgdWdseSwgYnV0IGl0IGNvcnJlc3BvbmRzIHRvIHNvbWUgY29kZSBlbHNld2hlcmUuXG4gICAgICAgICAgICAgICAgcmFuZ2UuY29sbGFwc2VDaGlsZHJlbiA9IDEwMDAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICB0b2dnbGVGb2xkV2lkZ2V0KHRvZ2dsZVBhcmVudCkge1xuICAgICAgICB2YXIgcm93OiBudW1iZXIgPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5yb3c7XG4gICAgICAgIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KHJvdyk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCB7fSk7XG5cbiAgICAgICAgaWYgKHJhbmdlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAvLyBoYW5kbGUgdG9nZ2xlUGFyZW50XG4gICAgICAgIHZhciBkYXRhID0gdGhpcy5nZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdywgdHJ1ZSk7XG4gICAgICAgIHJhbmdlID0gZGF0YS5yYW5nZSB8fCBkYXRhLmZpcnN0UmFuZ2U7XG5cbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICByb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgdGhpcy5nZXRMaW5lKHJvdykubGVuZ3RoLCAxKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB1cGRhdGVGb2xkV2lkZ2V0cyhlOiB7IGRhdGE6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9IH0sIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbik6IHZvaWQge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHZhciByYW5nZSA9IGRlbHRhLnJhbmdlO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBsZW4gPSByYW5nZS5lbmQucm93IC0gZmlyc3RSb3c7XG5cbiAgICAgICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0c1tmaXJzdFJvd10gPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGRlbHRhLmFjdGlvbiA9PSBcInJlbW92ZVRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT0gXCJyZW1vdmVMaW5lc1wiKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzLnNwbGljZShmaXJzdFJvdywgbGVuICsgMSwgbnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5KGxlbiArIDEpO1xuICAgICAgICAgICAgYXJncy51bnNoaWZ0KGZpcnN0Um93LCAxKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMuc3BsaWNlLmFwcGx5KHRoaXMuZm9sZFdpZGdldHMsIGFyZ3MpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBGSVhNRTogUmVzdG9yZVxuLy8gRm9sZGluZy5jYWxsKEVkaXRTZXNzaW9uLnByb3RvdHlwZSk7XG5cbmRlZmluZU9wdGlvbnMoRWRpdFNlc3Npb24ucHJvdG90eXBlLCBcInNlc3Npb25cIiwge1xuICAgIHdyYXA6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSB8fCB2YWx1ZSA9PSBcIm9mZlwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gZmFsc2U7XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcImZyZWVcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHRydWU7XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcInByaW50TWFyZ2luXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSAtMTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKSB8fCBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gdmFsdWUpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0VXNlV3JhcE1vZGUoZmFsc2UpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY29sID0gdHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIgPyB2YWx1ZSA6IG51bGw7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShjb2wsIGNvbCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRVc2VXcmFwTW9kZSh0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuJHdyYXAgPSB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy4kd3JhcCA9PSAtMSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwicHJpbnRNYXJnaW5cIjtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZ2V0V3JhcExpbWl0UmFuZ2UoKS5taW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcImZyZWVcIjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBcIm9mZlwiO1xuICAgICAgICB9LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICB3cmFwTWV0aG9kOiB7XG4gICAgICAgIC8vIGNvZGV8dGV4dHxhdXRvXG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSB2YWwgPT0gXCJhdXRvXCJcbiAgICAgICAgICAgICAgICA/IHRoaXMuJG1vZGUudHlwZSAhPSBcInRleHRcIlxuICAgICAgICAgICAgICAgIDogdmFsICE9IFwidGV4dFwiO1xuICAgICAgICAgICAgaWYgKHZhbCAhPSB0aGlzLiR3cmFwQXNDb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kd3JhcEFzQ29kZSA9IHZhbDtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwiYXV0b1wiXG4gICAgfSxcbiAgICBmaXJzdExpbmVOdW1iZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAxXG4gICAgfSxcbiAgICB1c2VXb3JrZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih1c2VXb3JrZXI6IGJvb2xlYW4pIHtcbiAgICAgICAgICAgIHRoaXMuJHVzZVdvcmtlciA9IHVzZVdvcmtlcjtcblxuICAgICAgICAgICAgdGhpcy4kc3RvcFdvcmtlcigpO1xuICAgICAgICAgICAgaWYgKHVzZVdvcmtlcikge1xuICAgICAgICAgICAgICAgIHRoaXMuJHN0YXJ0V29ya2VyKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgdXNlU29mdFRhYnM6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgdGFiU2l6ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHRhYlNpemUpIHtcbiAgICAgICAgICAgIGlmIChpc05hTih0YWJTaXplKSB8fCB0aGlzLiR0YWJTaXplID09PSB0YWJTaXplKSByZXR1cm47XG5cbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlID0gW107XG4gICAgICAgICAgICB0aGlzLiR0YWJTaXplID0gdGFiU2l6ZTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVRhYlNpemVcIik7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogNCxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgb3ZlcndyaXRlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuX3NpZ25hbChcImNoYW5nZU92ZXJ3cml0ZVwiKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgbmV3TGluZU1vZGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUodmFsKSB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kb2MuZ2V0TmV3TGluZU1vZGUoKSB9LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBtb2RlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuc2V0TW9kZSh2YWwpIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLiRtb2RlSWQgfVxuICAgIH1cbn0pO1xuIl19