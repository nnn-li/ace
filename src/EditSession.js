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
        else if (typeof location === "number")
            range = new Range(location, 0, location, this.getLine(location).length);
        else if ("row" in location)
            range = Range.fromPoints(location, location);
        else if (location instanceof Range) {
            range = location;
        }
        else {
            throw new TypeError("location must be one of number | Position | Range");
        }
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
        if (depth === void 0) {
            depth = 100000;
        }
        var foldWidgets = this.foldWidgets;
        if (!foldWidgets) {
            return;
        }
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
        if (range) {
            return;
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdFNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJFZGl0U2Vzc2lvbi50cyJdLCJuYW1lcyI6WyJpc0Z1bGxXaWR0aCIsIkVkaXRTZXNzaW9uIiwiRWRpdFNlc3Npb24uY29uc3RydWN0b3IiLCJFZGl0U2Vzc2lvbi5vbiIsIkVkaXRTZXNzaW9uLm9mZiIsIkVkaXRTZXNzaW9uLl9lbWl0IiwiRWRpdFNlc3Npb24uX3NpZ25hbCIsIkVkaXRTZXNzaW9uLnNldERvY3VtZW50IiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kcmVzZXRSb3dDYWNoZSIsIkVkaXRTZXNzaW9uLiRnZXRSb3dDYWNoZUluZGV4IiwiRWRpdFNlc3Npb24ucmVzZXRDYWNoZXMiLCJFZGl0U2Vzc2lvbi5vbkNoYW5nZUZvbGQiLCJFZGl0U2Vzc2lvbi5vbkNoYW5nZSIsIkVkaXRTZXNzaW9uLnNldFZhbHVlIiwiRWRpdFNlc3Npb24udG9TdHJpbmciLCJFZGl0U2Vzc2lvbi5nZXRWYWx1ZSIsIkVkaXRTZXNzaW9uLmdldFNlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLnNldFNlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLmdldFN0YXRlIiwiRWRpdFNlc3Npb24uZ2V0VG9rZW5zIiwiRWRpdFNlc3Npb24uZ2V0VG9rZW5BdCIsIkVkaXRTZXNzaW9uLnNldFVuZG9NYW5hZ2VyIiwiRWRpdFNlc3Npb24ubWFya1VuZG9Hcm91cCIsIkVkaXRTZXNzaW9uLmdldFVuZG9NYW5hZ2VyIiwiRWRpdFNlc3Npb24uZ2V0VGFiU3RyaW5nIiwiRWRpdFNlc3Npb24uc2V0VXNlU29mdFRhYnMiLCJFZGl0U2Vzc2lvbi5nZXRVc2VTb2Z0VGFicyIsIkVkaXRTZXNzaW9uLnNldFRhYlNpemUiLCJFZGl0U2Vzc2lvbi5nZXRUYWJTaXplIiwiRWRpdFNlc3Npb24uaXNUYWJTdG9wIiwiRWRpdFNlc3Npb24uc2V0T3ZlcndyaXRlIiwiRWRpdFNlc3Npb24uZ2V0T3ZlcndyaXRlIiwiRWRpdFNlc3Npb24udG9nZ2xlT3ZlcndyaXRlIiwiRWRpdFNlc3Npb24uYWRkR3V0dGVyRGVjb3JhdGlvbiIsIkVkaXRTZXNzaW9uLnJlbW92ZUd1dHRlckRlY29yYXRpb24iLCJFZGl0U2Vzc2lvbi5nZXRCcmVha3BvaW50cyIsIkVkaXRTZXNzaW9uLnNldEJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uY2xlYXJCcmVha3BvaW50cyIsIkVkaXRTZXNzaW9uLnNldEJyZWFrcG9pbnQiLCJFZGl0U2Vzc2lvbi5jbGVhckJyZWFrcG9pbnQiLCJFZGl0U2Vzc2lvbi5hZGRNYXJrZXIiLCJFZGl0U2Vzc2lvbi5hZGREeW5hbWljTWFya2VyIiwiRWRpdFNlc3Npb24ucmVtb3ZlTWFya2VyIiwiRWRpdFNlc3Npb24uZ2V0TWFya2VycyIsIkVkaXRTZXNzaW9uLmhpZ2hsaWdodCIsIkVkaXRTZXNzaW9uLmhpZ2hsaWdodExpbmVzIiwiRWRpdFNlc3Npb24uc2V0QW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi5nZXRBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLmNsZWFyQW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi4kZGV0ZWN0TmV3TGluZSIsIkVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXROZXdMaW5lTW9kZSIsIkVkaXRTZXNzaW9uLmdldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uc2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24ub25SZWxvYWRUb2tlbml6ZXIiLCJFZGl0U2Vzc2lvbi5zZXRMYW5ndWFnZU1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRNb2RlIiwiRWRpdFNlc3Npb24uaW1wb3J0TW9kZSIsIkVkaXRTZXNzaW9uLiRvbkNoYW5nZU1vZGUiLCJFZGl0U2Vzc2lvbi4kc3RvcFdvcmtlciIsIkVkaXRTZXNzaW9uLiRzdGFydFdvcmtlciIsIkVkaXRTZXNzaW9uLmdldE1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRTY3JvbGxUb3AiLCJFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3AiLCJFZGl0U2Vzc2lvbi5zZXRTY3JvbGxMZWZ0IiwiRWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdCIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbldpZHRoIiwiRWRpdFNlc3Npb24uZ2V0TGluZVdpZGdldE1heFdpZHRoIiwiRWRpdFNlc3Npb24uJGNvbXB1dGVXaWR0aCIsIkVkaXRTZXNzaW9uLmdldExpbmUiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lcyIsIkVkaXRTZXNzaW9uLmdldExlbmd0aCIsIkVkaXRTZXNzaW9uLmdldFRleHRSYW5nZSIsIkVkaXRTZXNzaW9uLmluc2VydCIsIkVkaXRTZXNzaW9uLnJlbW92ZSIsIkVkaXRTZXNzaW9uLnVuZG9DaGFuZ2VzIiwiRWRpdFNlc3Npb24ucmVkb0NoYW5nZXMiLCJFZGl0U2Vzc2lvbi5zZXRVbmRvU2VsZWN0IiwiRWRpdFNlc3Npb24uJGdldFVuZG9TZWxlY3Rpb24iLCJFZGl0U2Vzc2lvbi4kZ2V0VW5kb1NlbGVjdGlvbi5pc0luc2VydCIsIkVkaXRTZXNzaW9uLnJlcGxhY2UiLCJFZGl0U2Vzc2lvbi5tb3ZlVGV4dCIsIkVkaXRTZXNzaW9uLmluZGVudFJvd3MiLCJFZGl0U2Vzc2lvbi5vdXRkZW50Um93cyIsIkVkaXRTZXNzaW9uLiRtb3ZlTGluZXMiLCJFZGl0U2Vzc2lvbi5tb3ZlTGluZXNVcCIsIkVkaXRTZXNzaW9uLm1vdmVMaW5lc0Rvd24iLCJFZGl0U2Vzc2lvbi5kdXBsaWNhdGVMaW5lcyIsIkVkaXRTZXNzaW9uLiRjbGlwUm93VG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRjbGlwQ29sdW1uVG9Sb3ciLCJFZGl0U2Vzc2lvbi4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRjbGlwUmFuZ2VUb0RvY3VtZW50IiwiRWRpdFNlc3Npb24uc2V0VXNlV3JhcE1vZGUiLCJFZGl0U2Vzc2lvbi5nZXRVc2VXcmFwTW9kZSIsIkVkaXRTZXNzaW9uLnNldFdyYXBMaW1pdFJhbmdlIiwiRWRpdFNlc3Npb24uYWRqdXN0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uJGNvbnN0cmFpbldyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLmdldFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLnNldFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLmdldFdyYXBMaW1pdFJhbmdlIiwiRWRpdFNlc3Npb24uJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlIiwiRWRpdFNlc3Npb24uJHVwZGF0ZVJvd0xlbmd0aENhY2hlIiwiRWRpdFNlc3Npb24uJHVwZGF0ZVdyYXBEYXRhIiwiRWRpdFNlc3Npb24uJGNvbXB1dGVXcmFwU3BsaXRzIiwiRWRpdFNlc3Npb24uJGNvbXB1dGVXcmFwU3BsaXRzLmFkZFNwbGl0IiwiRWRpdFNlc3Npb24uJGdldERpc3BsYXlUb2tlbnMiLCJFZGl0U2Vzc2lvbi4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRSb3dMZW5ndGgiLCJFZGl0U2Vzc2lvbi5nZXRSb3dMaW5lQ291bnQiLCJFZGl0U2Vzc2lvbi5nZXRSb3dXcmFwSW5kZW50IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbiIsIkVkaXRTZXNzaW9uLmdldERvY3VtZW50TGFzdFJvd0NvbHVtbiIsIkVkaXRTZXNzaW9uLmdldERvY3VtZW50TGFzdFJvd0NvbHVtblBvc2l0aW9uIiwiRWRpdFNlc3Npb24uZ2V0Um93U3BsaXREYXRhIiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuVGFiU2l6ZSIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRSb3ciLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Q29sdW1uIiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Sb3ciLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUmFuZ2UiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5MZW5ndGgiLCJFZGl0U2Vzc2lvbi4kc2V0Rm9udE1ldHJpY3MiLCJFZGl0U2Vzc2lvbi5maW5kTWF0Y2hpbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZ2V0QnJhY2tldFJhbmdlIiwiRWRpdFNlc3Npb24uZmluZE9wZW5pbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZmluZENsb3NpbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZEF0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlTGlzdCIsIkVkaXRTZXNzaW9uLmdldEFsbEZvbGRzIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZFN0cmluZ0F0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXRGb2xkZWRSb3dDb3VudCIsIkVkaXRTZXNzaW9uLiRhZGRGb2xkTGluZSIsIkVkaXRTZXNzaW9uLmFkZEZvbGQiLCJFZGl0U2Vzc2lvbi5zZXRNb2RpZmllZCIsIkVkaXRTZXNzaW9uLmFkZEZvbGRzIiwiRWRpdFNlc3Npb24ucmVtb3ZlRm9sZCIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGRzIiwiRWRpdFNlc3Npb24uZXhwYW5kRm9sZCIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGRzIiwiRWRpdFNlc3Npb24udW5mb2xkIiwiRWRpdFNlc3Npb24uaXNSb3dGb2xkZWQiLCJFZGl0U2Vzc2lvbi5nZXRSb3dGb2xkRW5kIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uZ2V0RGlzcGxheUxpbmUiLCJFZGl0U2Vzc2lvbi4kY2xvbmVGb2xkRGF0YSIsIkVkaXRTZXNzaW9uLnRvZ2dsZUZvbGQiLCJFZGl0U2Vzc2lvbi5nZXRDb21tZW50Rm9sZFJhbmdlIiwiRWRpdFNlc3Npb24uZm9sZEFsbCIsIkVkaXRTZXNzaW9uLnNldEZvbGRTdHlsZSIsIkVkaXRTZXNzaW9uLiRzZXRGb2xkaW5nIiwiRWRpdFNlc3Npb24uZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YSIsIkVkaXRTZXNzaW9uLm9uRm9sZFdpZGdldENsaWNrIiwiRWRpdFNlc3Npb24uJHRvZ2dsZUZvbGRXaWRnZXQiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udXBkYXRlRm9sZFdpZGdldHMiXSwibWFwcGluZ3MiOiJPQXVETyxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLEVBQUMsYUFBYSxFQUFjLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FNekQsaUJBQWlCLE1BQU0seUJBQXlCO09BQ2hELFFBQVEsTUFBTSxZQUFZO09BQzFCLElBQUksTUFBTSxRQUFRO09BRWxCLFNBQVMsTUFBTSxhQUFhO09BRTVCLEtBQUssTUFBTSxTQUFTO09BR3BCLFFBQVEsTUFBTSxZQUFZO09BQzFCLG1CQUFtQixNQUFNLHVCQUF1QjtPQUNoRCxlQUFlLE1BQU0sbUJBQW1CO09BQ3hDLEVBQUMsTUFBTSxFQUFDLE1BQU0sZUFBZTtPQUM3QixZQUFZLE1BQU0sZ0JBQWdCO09BRWxDLGFBQWEsTUFBTSxpQkFBaUI7T0FPcEMsUUFBUSxNQUFNLGlCQUFpQjtBQUd0QyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQ1IsUUFBUSxHQUFHLENBQUMsRUFDWixpQkFBaUIsR0FBRyxDQUFDLEVBQ3JCLGdCQUFnQixHQUFHLENBQUMsRUFDcEIsV0FBVyxHQUFHLENBQUMsRUFDZixLQUFLLEdBQUcsRUFBRSxFQUNWLEdBQUcsR0FBRyxFQUFFLEVBQ1IsU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUluQixxQkFBcUIsQ0FBUztJQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDWEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzdCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQSxDQUFDQTtBQUNuQ0EsQ0FBQ0E7QUFLRDtJQWlISUMsWUFBWUEsR0FBYUE7UUFoSGxCQyxpQkFBWUEsR0FBYUEsRUFBRUEsQ0FBQ0E7UUFDNUJBLGlCQUFZQSxHQUFhQSxFQUFFQSxDQUFDQTtRQUMzQkEsa0JBQWFBLEdBQTZCQSxFQUFFQSxDQUFDQTtRQUM5Q0EsaUJBQVlBLEdBQTZCQSxFQUFFQSxDQUFDQTtRQUMzQ0EsY0FBU0EsR0FBR0Es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Q0FBQ0EsQ0FBQ0E7UUFFeERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1JBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQzFCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbEJBLElBQUlBO1lBQ0FBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRTdCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWkEsR0FBR0EsQ0FBQ0E7Z0JBQ0FBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ1pBLENBQUNBLFFBQ01BLEtBQUtBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBO1lBQ25EQSxLQUFLQSxFQUFFQSxDQUFDQTtRQUNaQSxDQUFDQTtRQUVEQSxJQUFJQSxHQUFHQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNqQkEsT0FBT0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsTUFBTUEsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDckRBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ1ZBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLEVBQUVBLEdBQUdBLEVB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QUdBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLFlBQVlBLElBQUlBLEtBQUtBLENBQUNBLE1BQU1BLEtBQUtBLGFBQWFBLENBQUNBO1lBQzdFQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNyQ0EsQ0FBQ0E7UUFFREQsSUFBSUEsS0FBS0EsR0FBcUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hEQSxJQUFJQSxLQUFZQSxDQUFDQTtRQUNqQkEsSUFBSUEsS0FBc0NBLENBQUNBO1FBQzNDQSxJQUFJQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDN0RBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQy9EQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwRUEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO2dCQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9DQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDOURBLENBQUNBO2dCQUNEQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBO1lBQzdCQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNuRUEsQ0FBQ0E7Z0JBQ0RBLGlCQUFpQkEsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFDOUJBLENBQUNBO1FBQ0xBLENBQUNBO1FBSURBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOURBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUNwRUEsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDdEVBLENBQUNBO1lBRURBLElBQUlBLEdBQUdBLEdBQUdBLGFBQWFBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDeEVBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQVlNaEYsT0FBT0EsQ0FBQ0EsS0FBWUEsRUFBRUEsSUFBWUE7UUFDckNrRixNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFhTWxGLFFBQVFBLENBQUNBLFNBQWdCQSxFQUFFQSxVQUFvQkEsRUFBRUEsSUFBYUE7UUFDakVtRixJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeEZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNwQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNwRkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcERBLE9BQU9B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QSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUMxREEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFM0JBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN4QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQTtvQkFDdEJBLEtBQUtBLENBQUNBO1lBQ2RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNyQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNuQ0EsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO2dCQUM3QkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1FBQzdCQSxDQUFDQTtJQUNMQSxDQUFD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Q0FBQ0E7UUFDM0JBLElBQUlBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ3RDQSxJQUFJQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNuQ0EsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQzNCQSxJQUFJQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUV4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLGFBQWFBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQkEsT0FBT0EsR0FBR0EsUUFBUUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNGQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN2QkEsQ0FBQ0E7WUFDREEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDbEVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLEdBQUdBLEdBQUdBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBO1FBQzdC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O3dCQUNoRUEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFTEEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxDQUFDQTtnQkFFREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQ3RDQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO3dCQUNqQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFHRkEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVqQ0EsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxZ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TUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQ0EsQ0FBQ0E7WUFFUEEsWUFBWUEsSUFBSUEsR0FBR0EsQ0FBQ0E7WUFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1lBQzFCQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFFREQsT0FBT0EsYUFBYUEsR0FBR0EsU0FBU0EsR0FBR0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFFM0NBLElBQUlBLEtBQUtBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1lBSWxDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFNdkRBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoQkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFNREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsaUJBQWlCQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxnQkFBZ0JBLENBQUNBLENBQUNBLENBQUNBO2dCQUkxRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxpQkFBaUJBLENBQUNBLENBQUNBLENBQUNBO3dCQUdyQ0EsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFJREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3BCQSxRQUFR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RUEsQ0FBQ0E7WUFDbENBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVEEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDckRBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNkQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDL0JBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUN4QkEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaERBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO1lBQzFCQSxDQUFDQTtZQUVEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxXQUFXQSxDQUFDQSxDQUFD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QUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsSUFBSUEsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxJQUFJQSxPQUFPQSxHQUFHQSxTQUFTQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckJBLENBQUNBO1FBRURBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUM1Q0EsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFekRBLE9BQU9BLEdBQUdBLElBQUlBLFNBQVNBLEVBQUVBLENBQUNBO1lBQ3RCQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsR0FBR0EsU0FBU0EsSUFBSUEsTUFBTUEsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0E7Z0JBQ2pC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QUF3QkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDbEZBLE1BQU1BLENBQUNBLElBQUlBLEtBQUtBLENBQUNBLGNBQWNBLENBQUNBLEdBQUdBLEVBQUVBLGNBQWNBLENBQUNBLE1BQU1BLEVBQUVBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLFlBQVlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO0lBQ3ZHQSxDQUFDQTtJQVFNM0gsZUFBZUE7UUFDbEI0SCxJQUFJQSxVQUFVQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNuQkEsSUFBSUEsSUFBSUEsR0FBYUEsSUFBSUEsQ0FBQ0E7UUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUc5QkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDOUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN2Q0EsSUFBSUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxVQUFVQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNoREEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDcENBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLEVB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Q0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFaEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3hDQSxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNqREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBR1hBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUdqQkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUNwQ0EsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDckNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNaQSxLQUFLQSxDQUFDQTtnQkFDVkEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNsQkEsUUFBUUEsQ0FBQ0E7Z0JBQ2JBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUVGQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDWkEsS0FBS0EsQ0FBQ0E7Z0JBQ1ZBLENBQUNBO2dCQUNMQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBRWhCQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7SUFLRG5JLG1CQUFtQkEsQ0FBQ0EsTUFBTUE7UUFDdEJvSSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsS0FBS0EsR0FBV0EsRUFBRUEsQ0FBQ0E7WUFDdkJBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLEtBQUtBO2dCQUN6QixLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdEQsQ0FBQyxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNiQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUM3Q0EsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBUURwSSxXQUFXQTtRQUNQcUksSUFBSUEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFFL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO1lBQ3JDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtnQkFDOUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRTFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFtQkRySSxlQUFlQSxDQUFDQSxHQUFXQSxFQUFFQSxNQUFjQSxFQUFFQSxJQUFZQSxFQUFFQSxRQUFtQkE7UUFDMUVzSSxRQUFRQSxHQUFHQSxRQUFRQSxJQUFJQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDVkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFFaEJBLElBQUlBLFFBQVFBLEdBQUdBO1lBQ1hBLEdBQUdBLEVBQUVBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO1NBQ3JCQSxDQUFDQTtRQUVGQSxJQUFJQSxHQUFXQSxDQUFDQTtRQUNoQkEsSUFBSUEsSUFBVUEsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDN0NBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyRkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNoQkEsQ0FBQ0E7WUFDREEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO1lBQ0xBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRXRFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMxREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDZkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ25CQSxDQUFDQTtJQUVEdEksV0FBV0EsQ0FBQ0EsTUFBY0EsRUFBRUEsYUFBd0JBO1FBQ2hEdUksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3REEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUdEdkksZUFBZUEsQ0FBQ0EsTUFBY0EsRUFBRUEsYUFBd0JBO1FBQ3BEd0ksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ1ZBLEVBQUVBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQ2RBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUM3QkEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDcEJBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVEeEksaUJBQWlCQSxDQUFDQSxLQUFhQSxFQUFFQSxJQUFZQTtRQUN6Q3lJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQzlCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxHQUFHQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDdkNBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLEVBQ3RCQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUN0QkEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0E7d0JBQ2ZBLFFBQVFBLElBQUlBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBO29CQUM3QkEsSUFBSUE7d0JBQ0FBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNyQkEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0E7b0JBQ2ZBLFFBQVFBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBO2dCQUM1QkEsSUFBSUE7b0JBQ0FBLFFBQVFBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3BDQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFFT3pJLFlBQVlBLENBQUNBLFFBQWtCQTtRQUNuQzBJLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQzlCQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFTQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUM3QixNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7UUFDckMsQ0FBQyxDQUFDQSxDQUFDQTtRQUNIQSxNQUFNQSxDQUFDQSxRQUFRQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFTRDFJLE9BQU9BLENBQUNBLFdBQTBCQSxFQUFFQSxLQUFZQTtRQUM1QzJJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQzlCQSxJQUFJQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUNsQkEsSUFBSUEsSUFBVUEsQ0FBQ0E7UUFFZkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsWUFBWUEsSUFBSUEsQ0FBQ0E7WUFDNUJBLElBQUlBLEdBQUdBLFdBQVdBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxXQUFXQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN2Q0EsSUFBSUEsR0FBR0EsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsS0FBS0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQTtRQUNuREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EseUNBQXlDQSxDQUFDQSxDQUFDQTtRQUMvREEsQ0FBQ0E7UUFHREEsSUFBSUEsQ0FBQ0EsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFBQTtRQUVsREEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDOUJBLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1FBQ3BDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUMxQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFHaENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLEdBQUdBLE1BQU1BO1lBQ25CQSxRQUFRQSxJQUFJQSxNQUFNQSxJQUFJQSxXQUFXQSxJQUFJQSxTQUFTQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwREEsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsaURBQWlEQSxDQUFDQSxDQUFDQTtRQUV2RUEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsRUFBRUEsV0FBV0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekRBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ3BEQSxFQUFFQSxDQUFDQSxDQUFDQSxTQUFTQSxJQUFJQSxPQUFPQSxJQUFJQSxTQUFTQSxDQUFDQTtZQUNsQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFdENBLEVBQUVBLENBQUNBLENBQ0NBLENBQUNBLFNBQVNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLFdBQVdBLENBQUNBLENBQUNBO2VBQzNEQSxDQUFDQSxPQUFPQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUMxREEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsOENBQThDQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUNuR0EsQ0FBQ0E7UUFHREEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRW5CQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUV4QkEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsT0FBT0E7Z0JBQzFCLElBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDN0IsQ0FBQyxDQUFDQSxDQUFDQTtRQUNQQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUN2Q0EsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUMvQkEsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDYkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFFaEJBLElBQUlBLFlBQVlBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO29CQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsWUFBWUEsSUFBSUEsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBRW5EQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTt3QkFDN0JBLEtBQUtBLENBQUNBO29CQUNWQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDUEEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFFdkVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqRUEsSUFBSUE7WUFDQUEsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUd2RUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFLdkJBLElBQUlBLFNBQVNBLEdBQWNBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLEVBQUVBLENBQUNBO1FBQ3pEQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUU3Q0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRUQzSSxXQUFXQSxDQUFDQSxRQUFpQkE7SUFFN0I0SSxDQUFDQTtJQUVENUksUUFBUUEsQ0FBQ0EsS0FBYUE7UUFDbEI2SSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxJQUFJQTtZQUN2QixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFFRDdJLFVBQVVBLENBQUNBLElBQVVBO1FBQ2pCOEksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDN0JBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ2xDQSxJQUFJQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUU5QkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBO1FBRzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNaQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNuREEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDN0RBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVEQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNkQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN4Q0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDbERBLENBQUNBO1FBQ0RBLElBQUlBLENBS0FBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2ZBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUdOQSxDQUFDQTtZQUNHQSxJQUFJQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwRUEsS0FBS0EsR0FBR0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDMUJBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQzNDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFFYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FB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LENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN4QkEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3pCQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDTkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FB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RUFBRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFNUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDbERBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRXRDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNSQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN0QkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFNURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNQQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0ZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1lBQy9CQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEakssaUJBQWlCQSxDQUFDQSxDQUE2Q0EsRUFBRUEsV0FBd0JBO1FBQ3JGa0ssSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDbkJBLElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3hCQSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUMvQkEsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFbkNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RDQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxZQUFZQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLElBQUlBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDMURBLENBQUNBO0lBQ0xBLENBQUNBO0FBQ0xsSyxDQUFDQTtBQUtELGFBQWEsQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRTtJQUM1QyxJQUFJLEVBQUU7UUFDRixHQUFHLEVBQUUsVUFBUyxLQUFLO1lBQ2YsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLElBQUksS0FBSyxJQUFJLEtBQUssQ0FBQztnQkFDekIsS0FBSyxHQUFHLEtBQUssQ0FBQztZQUNsQixJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLE1BQU0sQ0FBQztnQkFDckIsS0FBSyxHQUFHLElBQUksQ0FBQztZQUNqQixJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsS0FBSyxJQUFJLGFBQWEsQ0FBQztnQkFDNUIsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ2YsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sS0FBSyxJQUFJLFFBQVEsQ0FBQztnQkFDOUIsS0FBSyxHQUFHLFFBQVEsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDO1lBRXpDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDO2dCQUNwQixNQUFNLENBQUM7WUFDWCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ1QsSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMvQixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxHQUFHLEdBQUcsT0FBTyxLQUFLLElBQUksUUFBUSxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUM7Z0JBQ2xELElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ2pDLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDOUIsQ0FBQztZQUNELElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ3ZCLENBQUM7UUFDRCxHQUFHLEVBQUU7WUFDRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN4QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO29CQUNqQixNQUFNLENBQUMsYUFBYSxDQUFDO2dCQUN6QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLEdBQUcsQ0FBQztvQkFDOUIsTUFBTSxDQUFDLE1BQU0sQ0FBQztnQkFDbEIsTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUM7WUFDdEIsQ0FBQztZQUNELE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDakIsQ0FBQztRQUNELFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsVUFBVSxFQUFFO1FBRVIsR0FBRyxFQUFFLFVBQVMsR0FBRztZQUNiLEdBQUcsR0FBRyxHQUFHLElBQUksTUFBTTtrQkFDYixJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxNQUFNO2tCQUN6QixHQUFHLElBQUksTUFBTSxDQUFDO1lBQ3BCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDMUIsSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUM7Z0JBQ3ZCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO29CQUNwQixJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztvQkFDdEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdkIsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLFNBQVMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUNsRCxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUM7UUFDRCxZQUFZLEVBQUUsTUFBTTtLQUN2QjtJQUNELGVBQWUsRUFBRTtRQUNiLEdBQUcsRUFBRSxjQUFhLElBQUksQ0FBQyxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckQsWUFBWSxFQUFFLENBQUM7S0FDbEI7SUFDRCxTQUFTLEVBQUU7UUFDUCxHQUFHLEVBQUUsVUFBUyxTQUFrQjtZQUM1QixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztZQUU1QixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbkIsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztnQkFDWixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7WUFDeEIsQ0FBQztRQUNMLENBQUM7UUFDRCxZQUFZLEVBQUUsSUFBSTtLQUNyQjtJQUNELFdBQVcsRUFBRSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUU7SUFDbkMsT0FBTyxFQUFFO1FBQ0wsR0FBRyxFQUFFLFVBQVMsT0FBTztZQUNqQixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUM7Z0JBQUMsTUFBTSxDQUFDO1lBRXhELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDO1lBQzFCLElBQUksQ0FBQyxRQUFRLEdBQUcsT0FBTyxDQUFDO1lBQ3hCLElBQUksQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDbEMsQ0FBQztRQUNELFlBQVksRUFBRSxDQUFDO1FBQ2YsVUFBVSxFQUFFLElBQUk7S0FDbkI7SUFDRCxTQUFTLEVBQUU7UUFDUCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2RCxZQUFZLEVBQUUsS0FBSztLQUN0QjtJQUNELFdBQVcsRUFBRTtRQUNULEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDbkQsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsY0FBYyxFQUFFLENBQUEsQ0FBQyxDQUFDO1FBQ3BELFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsSUFBSSxFQUFFO1FBQ0YsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ3hDLEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFBLENBQUMsQ0FBQztLQUMxQztDQUNKLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qICoqKioqIEJFR0lOIExJQ0VOU0UgQkxPQ0sgKioqKipcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE2IERhdmlkIEdlbyBIb2xtZXMgPGRhdmlkLmdlby5ob2xtZXNAZ21haWwuY29tPlxuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpbiBhbGxcbiAqIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRVxuICogU09GVFdBUkUuXG4gKiAqKioqKiBFTkQgTElDRU5TRSBCTE9DSyAqKioqKiAqL1xuLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG4vLyBcInVzZSBzdHJpY3RcIjsgVW5jYXVnaHQgKGluIHByb21pc2UpIFN5bnRheEVycm9yOiBVbmV4cGVjdGVkIHRva2VuID1cblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgc3RyaW5nUmVwZWF0fSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IEFubm90YXRpb24gZnJvbSAnLi9Bbm5vdGF0aW9uJztcbmltcG9ydCBEZWx0YSBmcm9tIFwiLi9EZWx0YVwiO1xuaW1wb3J0IERlbHRhRXZlbnQgZnJvbSBcIi4vRGVsdGFFdmVudFwiO1xuaW1wb3J0IE1hcmtlciBmcm9tIFwiLi9NYXJrZXJcIjtcbmltcG9ydCBFdmVudEJ1cyBmcm9tIFwiLi9FdmVudEJ1c1wiO1xuaW1wb3J0IEV2ZW50RW1pdHRlckNsYXNzIGZyb20gXCIuL2xpYi9FdmVudEVtaXR0ZXJDbGFzc1wiO1xuaW1wb3J0IEZvbGRMaW5lIGZyb20gXCIuL0ZvbGRMaW5lXCI7XG5pbXBvcnQgRm9sZCBmcm9tIFwiLi9Gb2xkXCI7XG5pbXBvcnQgRm9sZEV2ZW50IGZyb20gXCIuL0ZvbGRFdmVudFwiO1xuaW1wb3J0IFNlbGVjdGlvbiBmcm9tIFwiLi9TZWxlY3Rpb25cIjtcbmltcG9ydCBMYW5ndWFnZU1vZGUgZnJvbSBcIi4vTGFuZ3VhZ2VNb2RlXCI7XG5pbXBvcnQgUmFuZ2UgZnJvbSBcIi4vUmFuZ2VcIjtcbmltcG9ydCBUb2tlbiBmcm9tIFwiLi9Ub2tlblwiO1xuaW1wb3J0IFRva2VuaXplciBmcm9tIFwiLi9Ub2tlbml6ZXJcIjtcbmltcG9ydCBEb2N1bWVudCBmcm9tIFwiLi9Eb2N1bWVudFwiO1xuaW1wb3J0IEJhY2tncm91bmRUb2tlbml6ZXIgZnJvbSBcIi4vQmFja2dyb3VuZFRva2VuaXplclwiO1xuaW1wb3J0IFNlYXJjaEhpZ2hsaWdodCBmcm9tIFwiLi9TZWFyY2hIaWdobGlnaHRcIjtcbmltcG9ydCB7YXNzZXJ0fSBmcm9tICcuL2xpYi9hc3NlcnRzJztcbmltcG9ydCBCcmFja2V0TWF0Y2ggZnJvbSBcIi4vQnJhY2tldE1hdGNoXCI7XG5pbXBvcnQgVW5kb01hbmFnZXIgZnJvbSAnLi9VbmRvTWFuYWdlcidcbmltcG9ydCBUb2tlbkl0ZXJhdG9yIGZyb20gJy4vVG9rZW5JdGVyYXRvcic7XG5pbXBvcnQgRm9udE1ldHJpY3MgZnJvbSBcIi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBXb3JrZXJDbGllbnQgZnJvbSBcIi4vd29ya2VyL1dvcmtlckNsaWVudFwiO1xuaW1wb3J0IExpbmVXaWRnZXQgZnJvbSAnLi9MaW5lV2lkZ2V0JztcbmltcG9ydCBMaW5lV2lkZ2V0TWFuYWdlciBmcm9tICcuL0xpbmVXaWRnZXRNYW5hZ2VyJztcbmltcG9ydCBQb3NpdGlvbiBmcm9tICcuL1Bvc2l0aW9uJztcbmltcG9ydCBGb2xkTW9kZSBmcm9tIFwiLi9tb2RlL2ZvbGRpbmcvRm9sZE1vZGVcIjtcbmltcG9ydCBUZXh0TW9kZSBmcm9tIFwiLi9tb2RlL1RleHRNb2RlXCI7XG5cbi8vIFwiVG9rZW5zXCJcbnZhciBDSEFSID0gMSxcbiAgICBDSEFSX0VYVCA9IDIsXG4gICAgUExBQ0VIT0xERVJfU1RBUlQgPSAzLFxuICAgIFBMQUNFSE9MREVSX0JPRFkgPSA0LFxuICAgIFBVTkNUVUFUSU9OID0gOSxcbiAgICBTUEFDRSA9IDEwLFxuICAgIFRBQiA9IDExLFxuICAgIFRBQl9TUEFDRSA9IDEyO1xuXG4vLyBGb3IgZXZlcnkga2V5c3Ryb2tlIHRoaXMgZ2V0cyBjYWxsZWQgb25jZSBwZXIgY2hhciBpbiB0aGUgd2hvbGUgZG9jISFcbi8vIFdvdWxkbid0IGh1cnQgdG8gbWFrZSBpdCBhIGJpdCBmYXN0ZXIgZm9yIGMgPj0gMHgxMTAwXG5mdW5jdGlvbiBpc0Z1bGxXaWR0aChjOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBpZiAoYyA8IDB4MTEwMClcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBjID49IDB4MTEwMCAmJiBjIDw9IDB4MTE1RiB8fFxuICAgICAgICBjID49IDB4MTFBMyAmJiBjIDw9IDB4MTFBNyB8fFxuICAgICAgICBjID49IDB4MTFGQSAmJiBjIDw9IDB4MTFGRiB8fFxuICAgICAgICBjID49IDB4MjMyOSAmJiBjIDw9IDB4MjMyQSB8fFxuICAgICAgICBjID49IDB4MkU4MCAmJiBjIDw9IDB4MkU5OSB8fFxuICAgICAgICBjID49IDB4MkU5QiAmJiBjIDw9IDB4MkVGMyB8fFxuICAgICAgICBjID49IDB4MkYwMCAmJiBjIDw9IDB4MkZENSB8fFxuICAgICAgICBjID49IDB4MkZGMCAmJiBjIDw9IDB4MkZGQiB8fFxuICAgICAgICBjID49IDB4MzAwMCAmJiBjIDw9IDB4MzAzRSB8fFxuICAgICAgICBjID49IDB4MzA0MSAmJiBjIDw9IDB4MzA5NiB8fFxuICAgICAgICBjID49IDB4MzA5OSAmJiBjIDw9IDB4MzBGRiB8fFxuICAgICAgICBjID49IDB4MzEwNSAmJiBjIDw9IDB4MzEyRCB8fFxuICAgICAgICBjID49IDB4MzEzMSAmJiBjIDw9IDB4MzE4RSB8fFxuICAgICAgICBjID49IDB4MzE5MCAmJiBjIDw9IDB4MzFCQSB8fFxuICAgICAgICBjID49IDB4MzFDMCAmJiBjIDw9IDB4MzFFMyB8fFxuICAgICAgICBjID49IDB4MzFGMCAmJiBjIDw9IDB4MzIxRSB8fFxuICAgICAgICBjID49IDB4MzIyMCAmJiBjIDw9IDB4MzI0NyB8fFxuICAgICAgICBjID49IDB4MzI1MCAmJiBjIDw9IDB4MzJGRSB8fFxuICAgICAgICBjID49IDB4MzMwMCAmJiBjIDw9IDB4NERCRiB8fFxuICAgICAgICBjID49IDB4NEUwMCAmJiBjIDw9IDB4QTQ4QyB8fFxuICAgICAgICBjID49IDB4QTQ5MCAmJiBjIDw9IDB4QTRDNiB8fFxuICAgICAgICBjID49IDB4QTk2MCAmJiBjIDw9IDB4QTk3QyB8fFxuICAgICAgICBjID49IDB4QUMwMCAmJiBjIDw9IDB4RDdBMyB8fFxuICAgICAgICBjID49IDB4RDdCMCAmJiBjIDw9IDB4RDdDNiB8fFxuICAgICAgICBjID49IDB4RDdDQiAmJiBjIDw9IDB4RDdGQiB8fFxuICAgICAgICBjID49IDB4RjkwMCAmJiBjIDw9IDB4RkFGRiB8fFxuICAgICAgICBjID49IDB4RkUxMCAmJiBjIDw9IDB4RkUxOSB8fFxuICAgICAgICBjID49IDB4RkUzMCAmJiBjIDw9IDB4RkU1MiB8fFxuICAgICAgICBjID49IDB4RkU1NCAmJiBjIDw9IDB4RkU2NiB8fFxuICAgICAgICBjID49IDB4RkU2OCAmJiBjIDw9IDB4RkU2QiB8fFxuICAgICAgICBjID49IDB4RkYwMSAmJiBjIDw9IDB4RkY2MCB8fFxuICAgICAgICBjID49IDB4RkZFMCAmJiBjIDw9IDB4RkZFNjtcbn1cblxuLyoqXG4gKiBAY2xhc3MgRWRpdFNlc3Npb25cbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRWRpdFNlc3Npb24gaW1wbGVtZW50cyBFdmVudEJ1czxFZGl0U2Vzc2lvbj4ge1xuICAgIHB1YmxpYyAkYnJlYWtwb2ludHM6IHN0cmluZ1tdID0gW107XG4gICAgcHVibGljICRkZWNvcmF0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICBwcml2YXRlICRmcm9udE1hcmtlcnM6IHsgW2lkOiBudW1iZXJdOiBNYXJrZXIgfSA9IHt9O1xuICAgIHB1YmxpYyAkYmFja01hcmtlcnM6IHsgW2lkOiBudW1iZXJdOiBNYXJrZXIgfSA9IHt9O1xuICAgIHByaXZhdGUgJG1hcmtlcklkID0gMTtcbiAgICBwcml2YXRlICR1bmRvU2VsZWN0ID0gdHJ1ZTtcbiAgICBwcml2YXRlICRkZWx0YXM7XG4gICAgcHJpdmF0ZSAkZGVsdGFzRG9jO1xuICAgIHByaXZhdGUgJGRlbHRhc0ZvbGQ7XG4gICAgcHJpdmF0ZSAkZnJvbVVuZG87XG5cbiAgICBwdWJsaWMgd2lkZ2V0TWFuYWdlcjogTGluZVdpZGdldE1hbmFnZXI7XG4gICAgcHJpdmF0ZSAkdXBkYXRlRm9sZFdpZGdldHM6IChldmVudCwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKSA9PiBhbnk7XG4gICAgcHJpdmF0ZSAkZm9sZERhdGE6IEZvbGRMaW5lW107XG4gICAgcHVibGljIGZvbGRXaWRnZXRzOiBhbnlbXTtcbiAgICBwdWJsaWMgZ2V0Rm9sZFdpZGdldDogKHJvdzogbnVtYmVyKSA9PiBhbnk7XG4gICAgcHVibGljIGdldEZvbGRXaWRnZXRSYW5nZTogKHJvdzogbnVtYmVyLCBmb3JjZU11bHRpbGluZT86IGJvb2xlYW4pID0+IFJhbmdlO1xuICAgIHB1YmxpYyBfY2hhbmdlZFdpZGdldHM6IExpbmVXaWRnZXRbXTtcblxuICAgIHB1YmxpYyBkb2M6IERvY3VtZW50O1xuICAgIHByaXZhdGUgJGRlZmF1bHRVbmRvTWFuYWdlciA9IHsgdW5kbzogZnVuY3Rpb24oKSB7IH0sIHJlZG86IGZ1bmN0aW9uKCkgeyB9LCByZXNldDogZnVuY3Rpb24oKSB7IH0gfTtcbiAgICBwcml2YXRlICR1bmRvTWFuYWdlcjogVW5kb01hbmFnZXI7XG4gICAgcHJpdmF0ZSAkaW5mb3JtVW5kb01hbmFnZXI6IHsgY2FuY2VsOiAoKSA9PiB2b2lkOyBzY2hlZHVsZTogKCkgPT4gdm9pZCB9O1xuICAgIHB1YmxpYyBiZ1Rva2VuaXplcjogQmFja2dyb3VuZFRva2VuaXplcjtcbiAgICBwdWJsaWMgJG1vZGlmaWVkO1xuICAgIHByaXZhdGUgc2VsZWN0aW9uOiBTZWxlY3Rpb247XG4gICAgcHJpdmF0ZSAkZG9jUm93Q2FjaGU6IG51bWJlcltdO1xuICAgIHByaXZhdGUgJHdyYXBEYXRhOiBudW1iZXJbXVtdO1xuICAgIHByaXZhdGUgJHNjcmVlblJvd0NhY2hlOiBudW1iZXJbXTtcbiAgICBwcml2YXRlICRyb3dMZW5ndGhDYWNoZTtcbiAgICBwcml2YXRlICRvdmVyd3JpdGUgPSBmYWxzZTtcbiAgICBwdWJsaWMgJHNlYXJjaEhpZ2hsaWdodDogU2VhcmNoSGlnaGxpZ2h0O1xuICAgIHByaXZhdGUgJGFubm90YXRpb25zOiBBbm5vdGF0aW9uW107XG4gICAgcHJpdmF0ZSAkYXV0b05ld0xpbmU7XG4gICAgcHJpdmF0ZSBnZXRPcHRpb247XG4gICAgcHJpdmF0ZSBzZXRPcHRpb247XG5cbiAgICAvKipcbiAgICAgKiBAcHJvcGVydHkgZXZlbnRCdXNcbiAgICAgKiBAdHlwZSBFdmVudEVtaXR0ZXJDbGFzc1xuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBldmVudEJ1czogRXZlbnRFbWl0dGVyQ2xhc3M8RWRpdFNlc3Npb24+O1xuXG4gICAgLyoqXG4gICAgICogRGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSB3b3JrZXIgd2lsbCBiZSBzdGFydGVkLlxuICAgICAqXG4gICAgICogQHByb3BlcnR5ICR1c2VXb3JrZXJcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJHVzZVdvcmtlcjogYm9vbGVhbjtcbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHByaXZhdGUgJG1vZGVzOiB7IFtwYXRoOiBzdHJpbmddOiBMYW5ndWFnZU1vZGUgfSA9IHt9O1xuXG4gICAgLyoqXG4gICAgICpcbiAgICAgKi9cbiAgICBwdWJsaWMgJG1vZGU6IExhbmd1YWdlTW9kZSA9IG51bGw7XG4gICAgcHJpdmF0ZSAkbW9kZUlkID0gbnVsbDtcbiAgICAvKipcbiAgICAgKiBUaGUgd29ya2VyIGNvcnJlc3BvbmRpbmcgdG8gdGhlIG1vZGUgKGkuZS4gTGFuZ3VhZ2UpLlxuICAgICAqL1xuICAgIHByaXZhdGUgJHdvcmtlcjogV29ya2VyQ2xpZW50O1xuICAgIHByaXZhdGUgJG9wdGlvbnM7XG4gICAgcHVibGljIHRva2VuUmU6IFJlZ0V4cDtcbiAgICBwdWJsaWMgbm9uVG9rZW5SZTogUmVnRXhwO1xuICAgIHB1YmxpYyAkc2Nyb2xsVG9wID0gMDtcbiAgICBwcml2YXRlICRzY3JvbGxMZWZ0ID0gMDtcbiAgICAvLyBXUkFQTU9ERVxuICAgIHByaXZhdGUgJHdyYXBBc0NvZGU7XG4gICAgcHJpdmF0ZSAkd3JhcExpbWl0ID0gODA7XG4gICAgcHVibGljICR1c2VXcmFwTW9kZSA9IGZhbHNlO1xuICAgIHByaXZhdGUgJHdyYXBMaW1pdFJhbmdlID0ge1xuICAgICAgICBtaW46IG51bGwsXG4gICAgICAgIG1heDogbnVsbFxuICAgIH07XG4gICAgcHVibGljICR1cGRhdGluZztcbiAgICBwcml2YXRlICRvbkNoYW5nZSA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcbiAgICBwcml2YXRlICRzeW5jSW5mb3JtVW5kb01hbmFnZXI6ICgpID0+IHZvaWQ7XG4gICAgcHVibGljIG1lcmdlVW5kb0RlbHRhczogYm9vbGVhbjtcbiAgICBwcml2YXRlICR1c2VTb2Z0VGFiczogYm9vbGVhbjtcbiAgICBwcml2YXRlICR0YWJTaXplOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkd3JhcE1ldGhvZDtcbiAgICBwcml2YXRlIHNjcmVlbldpZHRoOiBudW1iZXI7XG4gICAgcHVibGljIGxpbmVXaWRnZXRzOiBMaW5lV2lkZ2V0W10gPSBudWxsO1xuICAgIHByaXZhdGUgbGluZVdpZGdldHNXaWR0aDogbnVtYmVyO1xuICAgIHB1YmxpYyBsaW5lV2lkZ2V0V2lkdGg6IG51bWJlcjtcbiAgICBwdWJsaWMgJGdldFdpZGdldFNjcmVlbkxlbmd0aDtcbiAgICAvL1xuICAgIHB1YmxpYyAkdGFnSGlnaGxpZ2h0O1xuICAgIC8qKlxuICAgICAqIFRoaXMgaXMgYSBtYXJrZXIgaWRlbnRpZmllci5cbiAgICAgKi9cbiAgICBwdWJsaWMgJGJyYWNrZXRIaWdobGlnaHQ6IG51bWJlcjtcbiAgICAvKipcbiAgICAgKiBUaGlzIGlzIHJlYWxseSBhIFJhbmdlIHdpdGggYW4gYWRkZWQgbWFya2VyIGlkLlxuICAgICAqL1xuICAgIHB1YmxpYyAkaGlnaGxpZ2h0TGluZU1hcmtlcjogUmFuZ2U7XG4gICAgLyoqXG4gICAgICogQSBudW1iZXIgaXMgYSBtYXJrZXIgaWRlbnRpZmllciwgbnVsbCBpbmRpY2F0ZXMgdGhhdCBubyBzdWNoIG1hcmtlciBleGlzdHMuIFxuICAgICAqL1xuICAgIHB1YmxpYyAkc2VsZWN0aW9uTWFya2VyOiBudW1iZXIgPSBudWxsO1xuICAgIHByaXZhdGUgJGJyYWNrZXRNYXRjaGVyID0gbmV3IEJyYWNrZXRNYXRjaCh0aGlzKTtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBFZGl0U2Vzc2lvblxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSBkb2Mge0RvY3VtZW50fVxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGRvYzogRG9jdW1lbnQpIHtcbiAgICAgICAgaWYgKCEoZG9jIGluc3RhbmNlb2YgRG9jdW1lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdkb2MgbXVzdCBiZSBhbiBEb2N1bWVudCcpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuZXZlbnRCdXMgPSBuZXcgRXZlbnRFbWl0dGVyQ2xhc3M8RWRpdFNlc3Npb24+KHRoaXMpO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YSA9IFtdO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcIlxcblwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmV2ZW50QnVzLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLm9uQ2hhbmdlRm9sZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zZXREb2N1bWVudChkb2MpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24odGhpcyk7XG5cbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuXG4gICAgICAgIC8vIFdpdGhvdXQgYSBtb2RlIGFsbCBoZWxsIGJyZWFrcyBsb29zZS5cbiAgICAgICAgLy8gV2UgZG9uJ3QgY2FyZSBhYm91dCB0aGUgd29ya2VVcmwgb3Igc2NyaXB0SW1wb3J0cyBhcmd1bWVudHNcbiAgICAgICAgLy8gYmVjYXVzZSB0aGVyZSBpcyBubyB0aHJlYWQgZm9yIHRleHQuXG4gICAgICAgIHRoaXMuc2V0TGFuZ3VhZ2VNb2RlKG5ldyBUZXh0TW9kZSgnJywgW10pKTtcblxuICAgICAgICAvLyBGSVhNRTogVGhpcyB3YXMgYSBzaWduYWwgdG8gYSBnbG9iYWwgY29uZmlnIG9iamVjdC5cbiAgICAgICAgLy8gX3NpZ25hbChcInNlc3Npb25cIiwgdGhpcyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvblxuICAgICAqIEBwYXJhbSBldmVudE5hbWUge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gY2FsbGJhY2sgeyhldmVudCwgc2Vzc2lvbjogRWRpdFNlc3Npb24pID0+IGFueX1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIG9uKGV2ZW50TmFtZTogc3RyaW5nLCBjYWxsYmFjazogKGV2ZW50OiBhbnksIHNlc3Npb246IEVkaXRTZXNzaW9uKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vbihldmVudE5hbWUsIGNhbGxiYWNrLCBmYWxzZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBvZmZcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIHtzdHJpbmd9XG4gICAgICogQHBhcmFtIGNhbGxiYWNrIHsoZXZlbnQsIHNlc3Npb246IEVkaXRTZXNzaW9uKSA9PiBhbnl9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBvZmYoZXZlbnROYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXZlbnQ6IGFueSwgc2Vzc2lvbjogRWRpdFNlc3Npb24pID0+IGFueSk6IHZvaWQge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLm9mZihldmVudE5hbWUsIGNhbGxiYWNrKTtcbiAgICB9XG5cbiAgICBfZW1pdChldmVudE5hbWU6IHN0cmluZywgZXZlbnQ/OiBhbnkpIHtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChldmVudE5hbWUsIGV2ZW50KTtcbiAgICB9XG5cbiAgICBfc2lnbmFsKGV2ZW50TmFtZTogc3RyaW5nLCBldmVudD86IGFueSkge1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoZXZlbnROYW1lLCBldmVudCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyB0aGUgYEVkaXRTZXNzaW9uYCB0byBwb2ludCB0byBhIG5ldyBgRG9jdW1lbnRgLlxuICAgICAqIElmIGEgYEJhY2tncm91bmRUb2tlbml6ZXJgIGV4aXN0cywgaXQgYWxzbyBwb2ludHMgdG8gYGRvY2AuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldERvY3VtZW50XG4gICAgICogQHBhcmFtIGRvYyB7RG9jdW1lbnR9IFRoZSBuZXcgYERvY3VtZW50YCB0byB1c2UuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwcml2YXRlIHNldERvY3VtZW50KGRvYzogRG9jdW1lbnQpOiB2b2lkIHtcbiAgICAgICAgaWYgKCEoZG9jIGluc3RhbmNlb2YgRG9jdW1lbnQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJkb2MgbXVzdCBiZSBhIERvY3VtZW50XCIpO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRvYykge1xuICAgICAgICAgICAgdGhpcy5kb2Mub2ZmKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZG9jID0gZG9jO1xuICAgICAgICBkb2Mub24oXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuXG4gICAgICAgIGlmICh0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldERvY3VtZW50KHRoaXMuZ2V0RG9jdW1lbnQoKSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnJlc2V0Q2FjaGVzKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgYERvY3VtZW50YCBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXREb2N1bWVudFxuICAgICAqIEByZXR1cm4ge0RvY3VtZW50fVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXREb2N1bWVudCgpOiBEb2N1bWVudCB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kICRyZXNldFJvd0NhY2hlXG4gICAgICogQHBhcmFtIGRvY1JvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHdvcmsgd2l0aC5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSAkcmVzZXRSb3dDYWNoZShkb2NSb3c6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAoIWRvY1Jvdykge1xuICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlID0gW107XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGwgPSB0aGlzLiRkb2NSb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleCh0aGlzLiRkb2NSb3dDYWNoZSwgZG9jUm93KSArIDE7XG4gICAgICAgIGlmIChsID4gaSkge1xuICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUuc3BsaWNlKGksIGwpO1xuICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUuc3BsaWNlKGksIGwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0Um93Q2FjaGVJbmRleChjYWNoZUFycmF5OiBudW1iZXJbXSwgdmFsOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICB2YXIgbG93ID0gMDtcbiAgICAgICAgdmFyIGhpID0gY2FjaGVBcnJheS5sZW5ndGggLSAxO1xuXG4gICAgICAgIHdoaWxlIChsb3cgPD0gaGkpIHtcbiAgICAgICAgICAgIHZhciBtaWQgPSAobG93ICsgaGkpID4+IDE7XG4gICAgICAgICAgICB2YXIgYyA9IGNhY2hlQXJyYXlbbWlkXTtcblxuICAgICAgICAgICAgaWYgKHZhbCA+IGMpIHtcbiAgICAgICAgICAgICAgICBsb3cgPSBtaWQgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodmFsIDwgYykge1xuICAgICAgICAgICAgICAgIGhpID0gbWlkIC0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiBtaWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbG93IC0gMTtcbiAgICB9XG5cbiAgICBwcml2YXRlIHJlc2V0Q2FjaGVzKCkge1xuICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgIHRoaXMuJHdyYXBEYXRhID0gW107XG4gICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlID0gW107XG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgIGlmICh0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBvbkNoYW5nZUZvbGQoZXZlbnQ6IEZvbGRFdmVudCk6IHZvaWQge1xuICAgICAgICB2YXIgZm9sZCA9IGV2ZW50LmRhdGE7XG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZm9sZC5zdGFydC5yb3cpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2UoZXZlbnQ6IERlbHRhRXZlbnQsIGRvYzogRG9jdW1lbnQpOiB2b2lkIHtcbiAgICAgICAgdmFyIGRlbHRhOiBEZWx0YSA9IGV2ZW50LmRhdGE7XG4gICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKGRlbHRhLnJhbmdlLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgdmFyIHJlbW92ZWRGb2xkcyA9IHRoaXMuJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGV2ZW50KTtcbiAgICAgICAgaWYgKCF0aGlzLiRmcm9tVW5kbyAmJiB0aGlzLiR1bmRvTWFuYWdlciAmJiAhZGVsdGEuaWdub3JlKSB7XG4gICAgICAgICAgICB0aGlzLiRkZWx0YXNEb2MucHVzaChkZWx0YSk7XG4gICAgICAgICAgICBpZiAocmVtb3ZlZEZvbGRzICYmIHJlbW92ZWRGb2xkcy5sZW5ndGggIT0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogXCJyZW1vdmVGb2xkc1wiLFxuICAgICAgICAgICAgICAgICAgICBmb2xkczogcmVtb3ZlZEZvbGRzXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyLnNjaGVkdWxlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci51cGRhdGVPbkNoYW5nZShkZWx0YSk7XG4gICAgICAgIH1cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VcbiAgICAgICAgICogQHBhcmFtIGV2ZW50IHtEZWx0YUV2ZW50fVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlXCIsIGV2ZW50KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzZXNzaW9uIHRleHQuXG4gICAgICogQG1ldGhvZCBzZXRWYWx1ZVxuICAgICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IFRoZSBuZXcgdGV4dCB0byBwbGFjZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRWYWx1ZSh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5kb2Muc2V0VmFsdWUodGV4dCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbygwLCAwKTtcblxuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICB0aGlzLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQgPSBbXTtcbiAgICAgICAgdGhpcy5zZXRVbmRvTWFuYWdlcih0aGlzLiR1bmRvTWFuYWdlcik7XG4gICAgICAgIHRoaXMuZ2V0VW5kb01hbmFnZXIoKS5yZXNldCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgRG9jdW1lbnQgYXMgYSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHRvU3RyaW5nXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICAqL1xuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgRG9jdW1lbnQgYXMgYSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFZhbHVlXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi50b1N0cmluZ1xuICAgICAqL1xuICAgIHB1YmxpYyBnZXRWYWx1ZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2VsZWN0aW9uXG4gICAgICogQHJldHVybiB7U2VsZWN0aW9ufVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZWxlY3Rpb25cbiAgICAgKiBAcGFyYW0gc2VsZWN0aW9uIHtTZWxlY3Rpb259XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0U2VsZWN0aW9uKHNlbGVjdGlvbjogU2VsZWN0aW9uKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uID0gc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0U3RhdGVcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9IFRoZSByb3cgdG8gc3RhcnQgYXQuXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTdGF0ZShyb3c6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGlmICh0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5iZ1Rva2VuaXplci5nZXRTdGF0ZShyb3cpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0YXJ0cyB0b2tlbml6aW5nIGF0IHRoZSByb3cgaW5kaWNhdGVkLiBSZXR1cm5zIGEgbGlzdCBvZiBvYmplY3RzIG9mIHRoZSB0b2tlbml6ZWQgcm93cy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VG9rZW5zXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgICAqIEByZXR1cm4ge1Rva2VuW119IEFuIGFycmF5IG9mIDxjb2RlPlRva2VuPC9jb2RlPnMuXG4gICAgICovXG4gICAgcHVibGljIGdldFRva2Vucyhyb3c6IG51bWJlcik6IFRva2VuW10ge1xuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBvYmplY3QgaW5kaWNhdGluZyB0aGUgdG9rZW4gYXQgdGhlIGN1cnJlbnQgcm93LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRUb2tlbkF0XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byByZXRyaWV2ZSBmcm9tXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIG51bWJlciB0byByZXRyaWV2ZSBmcm9tLlxuICAgICAqIEByZXR1cm4ge1Rva2VufVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRUb2tlbkF0KHJvdzogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIpOiBUb2tlbiB7XG4gICAgICAgIGlmICh0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB2YXIgdG9rZW5zOiBUb2tlbltdID0gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICAgICAgICAgIHZhciB0b2tlbjogVG9rZW47XG4gICAgICAgICAgICB2YXIgYyA9IDA7XG4gICAgICAgICAgICBpZiAoY29sdW1uID09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBpID0gdG9rZW5zLmxlbmd0aCAtIDE7XG4gICAgICAgICAgICAgICAgYyA9IHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGMgKz0gdG9rZW5zW2ldLnZhbHVlLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGMgPj0gY29sdW1uKVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgICAgICAgICBpZiAoIXRva2VuKVxuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgdG9rZW4uaW5kZXggPSBpO1xuICAgICAgICAgICAgdG9rZW4uc3RhcnQgPSBjIC0gdG9rZW4udmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHVuZG8gbWFuYWdlci5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0VW5kb01hbmFnZXJcbiAgICAgKiBAcGFyYW0gdW5kb01hbmFnZXIge1VuZG9NYW5hZ2VyfSBUaGUgbmV3IHVuZG8gbWFuYWdlci5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRVbmRvTWFuYWdlcih1bmRvTWFuYWdlcjogVW5kb01hbmFnZXIpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kdW5kb01hbmFnZXIgPSB1bmRvTWFuYWdlcjtcbiAgICAgICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNGb2xkID0gW107XG5cbiAgICAgICAgaWYgKHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyKVxuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICAgICAgaWYgKHVuZG9NYW5hZ2VyKSB7XG4gICAgICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICAgICAgICAgIHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHNlbGYuJGluZm9ybVVuZG9NYW5hZ2VyLmNhbmNlbCgpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhc0ZvbGQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwOiBcImZvbGRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRm9sZFxuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzRm9sZCA9IFtdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXNEb2MubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGdyb3VwOiBcImRvY1wiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsdGFzOiBzZWxmLiRkZWx0YXNEb2NcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB1bmRvTWFuYWdlci5leGVjdXRlKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbjogXCJhY2V1cGRhdGVcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyZ3M6IFtzZWxmLiRkZWx0YXMsIHNlbGZdLFxuICAgICAgICAgICAgICAgICAgICAgICAgbWVyZ2U6IHNlbGYubWVyZ2VVbmRvRGVsdGFzXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBzZWxmLm1lcmdlVW5kb0RlbHRhcyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhcyA9IFtdO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyID0gZGVsYXllZENhbGwodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFN0YXJ0cyBhIG5ldyBncm91cCBpbiB1bmRvIGhpc3RvcnkuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIG1hcmtVbmRvR3JvdXBcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBtYXJrVW5kb0dyb3VwKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKSB7XG4gICAgICAgICAgICB0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIoKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdW5kbyBtYW5hZ2VyLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRVbmRvTWFuYWdlclxuICAgICAqIEByZXR1cm4ge1VuZG9NYW5hZ2VyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRVbmRvTWFuYWdlcigpOiBVbmRvTWFuYWdlciB7XG4gICAgICAgIC8vIEZJWE1FOiBXYW50IHNpbXBsZSBBUEksIGRvbid0IHdhbnQgdG8gY2FzdC5cbiAgICAgICAgcmV0dXJuIHRoaXMuJHVuZG9NYW5hZ2VyIHx8IDxVbmRvTWFuYWdlcj50aGlzLiRkZWZhdWx0VW5kb01hbmFnZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCB2YWx1ZSBmb3IgdGFicy5cbiAgICAgKiBJZiB0aGUgdXNlciBpcyB1c2luZyBzb2Z0IHRhYnMsIHRoaXMgd2lsbCBiZSBhIHNlcmllcyBvZiBzcGFjZXMgKGRlZmluZWQgYnkgW1tFZGl0U2Vzc2lvbi5nZXRUYWJTaXplIGBnZXRUYWJTaXplKClgXV0pOyBvdGhlcndpc2UgaXQncyBzaW1wbHkgYCdcXHQnYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VGFiU3RyaW5nXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRUYWJTdHJpbmcoKTogc3RyaW5nIHtcbiAgICAgICAgaWYgKHRoaXMuZ2V0VXNlU29mdFRhYnMoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHN0cmluZ1JlcGVhdChcIiBcIiwgdGhpcy5nZXRUYWJTaXplKCkpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFwiXFx0XCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXNzIGB0cnVlYCB0byBlbmFibGUgdGhlIHVzZSBvZiBzb2Z0IHRhYnMuXG4gICAgICogU29mdCB0YWJzIG1lYW5zIHlvdSdyZSB1c2luZyBzcGFjZXMgaW5zdGVhZCBvZiB0aGUgdGFiIGNoYXJhY3RlciAoYCdcXHQnYCkuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFVzZVNvZnRUYWJzXG4gICAgICogQHBhcmFtIHVzZVNvZnRUYWJzIHtib29sZWFufSBWYWx1ZSBpbmRpY2F0aW5nIHdoZXRoZXIgb3Igbm90IHRvIHVzZSBzb2Z0IHRhYnMuXG4gICAgICogQHJldHVybiB7RWRpdFNlc3Npb259XG4gICAgICogQGNoYWluYWJsZVxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRVc2VTb2Z0VGFicyh1c2VTb2Z0VGFiczogYm9vbGVhbik6IEVkaXRTZXNzaW9uIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ1c2VTb2Z0VGFic1wiLCB1c2VTb2Z0VGFicyk7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHNvZnQgdGFicyBhcmUgYmVpbmcgdXNlZCwgYGZhbHNlYCBvdGhlcndpc2UuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFVzZVNvZnRUYWJzXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VXNlU29mdFRhYnMoKTogYm9vbGVhbiB7XG4gICAgICAgIC8vIHRvZG8gbWlnaHQgbmVlZCBtb3JlIGdlbmVyYWwgd2F5IGZvciBjaGFuZ2luZyBzZXR0aW5ncyBmcm9tIG1vZGUsIGJ1dCB0aGlzIGlzIG9rIGZvciBub3dcbiAgICAgICAgcmV0dXJuIHRoaXMuJHVzZVNvZnRUYWJzICYmICF0aGlzLiRtb2RlLiRpbmRlbnRXaXRoVGFicztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXQgdGhlIG51bWJlciBvZiBzcGFjZXMgdGhhdCBkZWZpbmUgYSBzb2Z0IHRhYi5cbiAgICAgKiBGb3IgZXhhbXBsZSwgcGFzc2luZyBpbiBgNGAgdHJhbnNmb3JtcyB0aGUgc29mdCB0YWJzIHRvIGJlIGVxdWl2YWxlbnQgdG8gZm91ciBzcGFjZXMuXG4gICAgICogVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRzIHRoZSBgY2hhbmdlVGFiU2l6ZWAgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFRhYlNpemVcbiAgICAgKiBAcGFyYW0gdGFiU2l6ZSB7bnVtYmVyfSBUaGUgbmV3IHRhYiBzaXplLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldFRhYlNpemUodGFiU2l6ZTogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidGFiU2l6ZVwiLCB0YWJTaXplKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHRhYiBzaXplLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRUYWJTaXplXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRUYWJTaXplKCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0YWJTaXplO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBjaGFyYWN0ZXIgYXQgdGhlIHBvc2l0aW9uIGlzIGEgc29mdCB0YWIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGlzVGFiU3RvcFxuICAgICAqIEBwYXJhbSBwb3NpdGlvbiB7UG9zaXRpb259IFRoZSBwb3NpdGlvbiB0byBjaGVjay5cbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIHB1YmxpYyBpc1RhYlN0b3AocG9zaXRpb246IFBvc2l0aW9uKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAocG9zaXRpb24uY29sdW1uICUgdGhpcy4kdGFiU2l6ZSA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFzcyBpbiBgdHJ1ZWAgdG8gZW5hYmxlIG92ZXJ3cml0ZXMgaW4geW91ciBzZXNzaW9uLCBvciBgZmFsc2VgIHRvIGRpc2FibGUuXG4gICAgICpcbiAgICAgKiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRPdmVyd3JpdGVcbiAgICAgKiBAcGFyYW0gb3ZlcndyaXRlIHtib29sZWFufSBEZWZpbmVzIHdoZXRoZXIgb3Igbm90IHRvIHNldCBvdmVyd3JpdGVzLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldE92ZXJ3cml0ZShvdmVyd3JpdGU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJvdmVyd3JpdGVcIiwgb3ZlcndyaXRlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0T3ZlcndyaXRlXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0T3ZlcndyaXRlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kb3ZlcndyaXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHZhbHVlIG9mIG92ZXJ3cml0ZSB0byB0aGUgb3Bwb3NpdGUgb2Ygd2hhdGV2ZXIgaXQgY3VycmVudGx5IGlzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCB0b2dnbGVPdmVyd3JpdGVcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyB0b2dnbGVPdmVyd3JpdGUoKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3ZlcndyaXRlKCF0aGlzLiRvdmVyd3JpdGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYGNsYXNzTmFtZWAgdG8gdGhlIGByb3dgLCB0byBiZSB1c2VkIGZvciBDU1Mgc3R5bGluZ3MgYW5kIHdoYXRub3QuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGFkZEd1dHRlckRlY29yYXRpb25cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgYWRkR3V0dGVyRGVjb3JhdGlvbihyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKCF0aGlzLiRkZWNvcmF0aW9uc1tyb3ddKSB7XG4gICAgICAgICAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddICs9IFwiIFwiICsgY2xhc3NOYW1lO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUJyZWFrcG9pbnRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYGNsYXNzTmFtZWAgZnJvbSB0aGUgYHJvd2AuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlbW92ZUd1dHRlckRlY29yYXRpb25cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgcmVtb3ZlR3V0dGVyRGVjb3JhdGlvbihyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9ICh0aGlzLiRkZWNvcmF0aW9uc1tyb3ddIHx8IFwiXCIpLnJlcGxhY2UoXCIgXCIgKyBjbGFzc05hbWUsIFwiXCIpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUJyZWFrcG9pbnRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gYXJyYXkgb2Ygc3RyaW5ncywgaW5kaWNhdGluZyB3aGljaCByb3dzIGhhdmUgYnJlYWtwb2ludHMuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEJyZWFrcG9pbnRzXG4gICAgICogQHJldHVybiB7c3RyaW5nW119XG4gICAgICovXG4gICAgcHJpdmF0ZSBnZXRCcmVha3BvaW50cygpOiBzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmVha3BvaW50cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgYnJlYWtwb2ludCBvbiBldmVyeSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0QnJlYWtwb2ludHNcbiAgICAgKiBAcGFyYW0ge251bWJlcltdfSByb3dzIEFuIGFycmF5IG9mIHJvdyBpbmRpY2VzXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwcml2YXRlIHNldEJyZWFrcG9pbnRzKHJvd3M6IG51bWJlcltdKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93c1tpXV0gPSBcImFjZV9icmVha3BvaW50XCI7XG4gICAgICAgIH1cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIGFsbCBicmVha3BvaW50cyBvbiB0aGUgcm93cy5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgY2xlYXJCcmVha3BvaW50c1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHJpdmF0ZSBjbGVhckJyZWFrcG9pbnRzKCk6IHZvaWQge1xuICAgICAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUJyZWFrcG9pbnRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0QnJlYWtwb2ludFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhc3NOYW1lIENsYXNzIG9mIHRoZSBicmVha3BvaW50XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwcml2YXRlIHNldEJyZWFrcG9pbnQocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmIChjbGFzc05hbWUgPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGNsYXNzTmFtZSA9IFwiYWNlX2JyZWFrcG9pbnRcIjtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSlcbiAgICAgICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd10gPSBjbGFzc05hbWU7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUJyZWFrcG9pbnRcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgY2xlYXJCcmVha3BvaW50XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBBIHJvdyBpbmRleFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHJpdmF0ZSBjbGVhckJyZWFrcG9pbnQocm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgZGVsZXRlIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd107XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhbmdlQnJlYWtwb2ludFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIG5ldyBtYXJrZXIgdG8gdGhlIGdpdmVuIGBSYW5nZWAuXG4gICAgICogSWYgYGluRnJvbnRgIGlzIGB0cnVlYCwgYSBmcm9udCBtYXJrZXIgaXMgZGVmaW5lZCwgYW5kIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgZmlyZXM7IG90aGVyd2lzZSwgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGZpcmVzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBhZGRNYXJrZXJcbiAgICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBEZWZpbmUgdGhlIHJhbmdlIG9mIHRoZSBtYXJrZXJcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhenogU2V0IHRoZSBDU1MgY2xhc3MgZm9yIHRoZSBtYXJrZXJcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9uIHwgU3RyaW5nfSB0eXBlIElkZW50aWZ5IHRoZSB0eXBlIG9mIHRoZSBtYXJrZXIuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgICogQHJldHVybiB7TnVtYmVyfSBUaGUgbmV3IG1hcmtlciBpZFxuICAgICAqL1xuICAgIHB1YmxpYyBhZGRNYXJrZXIocmFuZ2U6IFJhbmdlLCBjbGF6ejogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGluRnJvbnQ/OiBib29sZWFuKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGlkID0gdGhpcy4kbWFya2VySWQrKztcblxuICAgICAgICB2YXIgbWFya2VyOiBNYXJrZXIgPSB7XG4gICAgICAgICAgICByYW5nZTogcmFuZ2UsXG4gICAgICAgICAgICB0eXBlOiB0eXBlIHx8IFwibGluZVwiLFxuICAgICAgICAgICAgcmVuZGVyZXI6IHR5cGVvZiB0eXBlID09PSBcImZ1bmN0aW9uXCIgPyB0eXBlIDogbnVsbCxcbiAgICAgICAgICAgIGNsYXp6OiBjbGF6eixcbiAgICAgICAgICAgIGluRnJvbnQ6ICEhaW5Gcm9udCxcbiAgICAgICAgICAgIGlkOiBpZFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpbkZyb250KSB7XG4gICAgICAgICAgICB0aGlzLiRmcm9udE1hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgY2hhbmdlRnJvbnRNYXJrZXJcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlRnJvbnRNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRiYWNrTWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VCYWNrTWFya2VyXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIGR5bmFtaWMgbWFya2VyIHRvIHRoZSBzZXNzaW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBhZGREeW5hbWljTWFya2VyXG4gICAgICogQHBhcmFtIG1hcmtlciB7TWFya2VyfSBvYmplY3Qgd2l0aCB1cGRhdGUgbWV0aG9kLlxuICAgICAqIEBwYXJhbSBbaW5Gcm9udF0ge2Jvb2xlYW59IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyLlxuICAgICAqIEByZXR1cm4ge01hcmtlcn0gVGhlIGFkZGVkIG1hcmtlclxuICAgICAqL1xuICAgIHByaXZhdGUgYWRkRHluYW1pY01hcmtlcihtYXJrZXI6IE1hcmtlciwgaW5Gcm9udD86IGJvb2xlYW4pOiBNYXJrZXIge1xuICAgICAgICBpZiAoIW1hcmtlci51cGRhdGUpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgaWQgPSB0aGlzLiRtYXJrZXJJZCsrO1xuICAgICAgICBtYXJrZXIuaWQgPSBpZDtcbiAgICAgICAgbWFya2VyLmluRnJvbnQgPSAhIWluRnJvbnQ7XG5cbiAgICAgICAgaWYgKGluRnJvbnQpIHtcbiAgICAgICAgICAgIHRoaXMuJGZyb250TWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VGcm9udE1hcmtlclxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VGcm9udE1hcmtlclwiKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGJhY2tNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZUJhY2tNYXJrZXJcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgbWFya2VyIHdpdGggdGhlIHNwZWNpZmllZCBJRC5cbiAgICAgKiBJZiB0aGlzIG1hcmtlciB3YXMgaW4gZnJvbnQsIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgaXMgZW1pdHRlZC5cbiAgICAgKiBJZiB0aGUgbWFya2VyIHdhcyBpbiB0aGUgYmFjaywgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHJlbW92ZU1hcmtlclxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXJrZXJJZCBBIG51bWJlciByZXByZXNlbnRpbmcgYSBtYXJrZXJcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyByZW1vdmVNYXJrZXIobWFya2VySWQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgbWFya2VyOiBNYXJrZXIgPSB0aGlzLiRmcm9udE1hcmtlcnNbbWFya2VySWRdIHx8IHRoaXMuJGJhY2tNYXJrZXJzW21hcmtlcklkXTtcbiAgICAgICAgaWYgKCFtYXJrZXIpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIG1hcmtlcnM6IHsgW2lkOiBudW1iZXJdOiBNYXJrZXIgfSA9IG1hcmtlci5pbkZyb250ID8gdGhpcy4kZnJvbnRNYXJrZXJzIDogdGhpcy4kYmFja01hcmtlcnM7XG4gICAgICAgIGlmIChtYXJrZXIpIHtcbiAgICAgICAgICAgIGRlbGV0ZSAobWFya2Vyc1ttYXJrZXJJZF0pO1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKG1hcmtlci5pbkZyb250ID8gXCJjaGFuZ2VGcm9udE1hcmtlclwiIDogXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBJRHMgb2YgYWxsIHRoZSBtYXJrZXJzLCBlaXRoZXIgZnJvbnQgb3IgYmFjay5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0TWFya2Vyc1xuICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaW5Gcm9udCBJZiBgdHJ1ZWAsIGluZGljYXRlcyB5b3Ugb25seSB3YW50IGZyb250IG1hcmtlcnM7IGBmYWxzZWAgaW5kaWNhdGVzIG9ubHkgYmFjayBtYXJrZXJzLlxuICAgICAqIEByZXR1cm4ge3tbaWQ6IG51bWJlcl06IE1hcmtlcn19XG4gICAgICovXG4gICAgcHVibGljIGdldE1hcmtlcnMoaW5Gcm9udDogYm9vbGVhbik6IHsgW2lkOiBudW1iZXJdOiBNYXJrZXIgfSB7XG4gICAgICAgIHJldHVybiBpbkZyb250ID8gdGhpcy4kZnJvbnRNYXJrZXJzIDogdGhpcy4kYmFja01hcmtlcnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBoaWdobGlnaHRcbiAgICAgKiBAcGFyYW0gcmUge1JlZ0V4cH1cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBoaWdobGlnaHQocmU6IFJlZ0V4cCk6IHZvaWQge1xuICAgICAgICBpZiAoIXRoaXMuJHNlYXJjaEhpZ2hsaWdodCkge1xuICAgICAgICAgICAgdmFyIGhpZ2hsaWdodCA9IG5ldyBTZWFyY2hIaWdobGlnaHQobnVsbCwgXCJhY2Vfc2VsZWN0ZWQtd29yZFwiLCBcInRleHRcIik7XG4gICAgICAgICAgICB0aGlzLmFkZER5bmFtaWNNYXJrZXIoaGlnaGxpZ2h0KTtcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaEhpZ2hsaWdodCA9IGhpZ2hsaWdodDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRzZWFyY2hIaWdobGlnaHQuc2V0UmVnZXhwKHJlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlIGhpZ2hsaWdodExpbmVzKHN0YXJ0Um93OiBudW1iZXIsIGVuZFJvdzogbnVtYmVyLCBjbGF6ejogc3RyaW5nID0gXCJhY2Vfc3RlcFwiLCBpbkZyb250PzogYm9vbGVhbik6IFJhbmdlIHtcbiAgICAgICAgdmFyIHJhbmdlOiBSYW5nZSA9IG5ldyBSYW5nZShzdGFydFJvdywgMCwgZW5kUm93LCBJbmZpbml0eSk7XG4gICAgICAgIHJhbmdlLm1hcmtlcklkID0gdGhpcy5hZGRNYXJrZXIocmFuZ2UsIGNsYXp6LCBcImZ1bGxMaW5lXCIsIGluRnJvbnQpO1xuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU2V0cyBhbm5vdGF0aW9ucyBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICAgICogVGhpcyBmdW5jdGlvbnMgZW1pdHMgdGhlIGAnY2hhbmdlQW5ub3RhdGlvbidgIGV2ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRBbm5vdGF0aW9uc1xuICAgICAqIEBwYXJhbSB7QW5ub3RhdGlvbltdfSBhbm5vdGF0aW9ucyBBIGxpc3Qgb2YgYW5ub3RhdGlvbnMuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnM6IEFubm90YXRpb25bXSk6IHZvaWQge1xuICAgICAgICB0aGlzLiRhbm5vdGF0aW9ucyA9IGFubm90YXRpb25zO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUFubm90YXRpb25cbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZUFubm90YXRpb25cIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0QW5ub3RhdGlvbnNcbiAgICAgKiBAcmV0dXJuIHtBbm5vdGF0aW9uW119XG4gICAgICovXG4gICAgcHVibGljIGdldEFubm90YXRpb25zKCk6IEFubm90YXRpb25bXSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRhbm5vdGF0aW9ucyB8fCBbXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbGVhcnMgYWxsIHRoZSBhbm5vdGF0aW9ucyBmb3IgdGhpcyBzZXNzaW9uLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyB0cmlnZ2VycyB0aGUgYCdjaGFuZ2VBbm5vdGF0aW9uJ2AgZXZlbnQuXG4gICAgICogVGhpcyBpcyBjYWxsZWQgYnkgdGhlIGxhbmd1YWdlIG1vZGVzIHdoZW4gdGhlIHdvcmtlciB0ZXJtaW5hdGVzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBjbGVhckFubm90YXRpb25zXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgY2xlYXJBbm5vdGF0aW9ucygpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRBbm5vdGF0aW9ucyhbXSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWYgYHRleHRgIGNvbnRhaW5zIGVpdGhlciB0aGUgbmV3bGluZSAoYFxcbmApIG9yIGNhcnJpYWdlLXJldHVybiAoJ1xccicpIGNoYXJhY3RlcnMsIGAkYXV0b05ld0xpbmVgIHN0b3JlcyB0aGF0IHZhbHVlLlxuICAgICAqXG4gICAgICogQG1ldGhvZCAkZGV0ZWN0TmV3TGluZVxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgYmxvY2sgb2YgdGV4dFxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlICRkZXRlY3ROZXdMaW5lKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB2YXIgbWF0Y2ggPSB0ZXh0Lm1hdGNoKC9eLio/KFxccj9cXG4pL20pO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gbWF0Y2hbMV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvTmV3TGluZSA9IFwiXFxuXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHaXZlbiBhIHN0YXJ0aW5nIHJvdyBhbmQgY29sdW1uLCB0aGlzIG1ldGhvZCByZXR1cm5zIHRoZSBgUmFuZ2VgIG9mIHRoZSBmaXJzdCB3b3JkIGJvdW5kYXJ5IGl0IGZpbmRzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRXb3JkUmFuZ2VcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9IFRoZSByb3cgdG8gc3RhcnQgYXQuXG4gICAgICogQHBhcmFtIGNvbHVtbiB7bnVtYmVyfSBUaGUgY29sdW1uIHRvIHN0YXJ0IGF0LlxuICAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRXb3JkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgbGluZTogc3RyaW5nID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICAgICAgdmFyIGluVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgaWYgKGNvbHVtbiA+IDApXG4gICAgICAgICAgICBpblRva2VuID0gISFsaW5lLmNoYXJBdChjb2x1bW4gLSAxKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgICAgIGlmICghaW5Ub2tlbilcbiAgICAgICAgICAgIGluVG9rZW4gPSAhIWxpbmUuY2hhckF0KGNvbHVtbikubWF0Y2godGhpcy50b2tlblJlKTtcblxuICAgICAgICBpZiAoaW5Ub2tlbilcbiAgICAgICAgICAgIHZhciByZSA9IHRoaXMudG9rZW5SZTtcbiAgICAgICAgZWxzZSBpZiAoL15cXHMrJC8udGVzdChsaW5lLnNsaWNlKGNvbHVtbiAtIDEsIGNvbHVtbiArIDEpKSlcbiAgICAgICAgICAgIHZhciByZSA9IC9cXHMvO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB2YXIgcmUgPSB0aGlzLm5vblRva2VuUmU7XG5cbiAgICAgICAgdmFyIHN0YXJ0ID0gY29sdW1uO1xuICAgICAgICBpZiAoc3RhcnQgPiAwKSB7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgc3RhcnQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdoaWxlIChzdGFydCA+PSAwICYmIGxpbmUuY2hhckF0KHN0YXJ0KS5tYXRjaChyZSkpO1xuICAgICAgICAgICAgc3RhcnQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBlbmQgPSBjb2x1bW47XG4gICAgICAgIHdoaWxlIChlbmQgPCBsaW5lLmxlbmd0aCAmJiBsaW5lLmNoYXJBdChlbmQpLm1hdGNoKHJlKSkge1xuICAgICAgICAgICAgZW5kKys7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHJvdywgc3RhcnQsIHJvdywgZW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXRzIHRoZSByYW5nZSBvZiBhIHdvcmQsIGluY2x1ZGluZyBpdHMgcmlnaHQgd2hpdGVzcGFjZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0QVdvcmRSYW5nZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXIgdG8gc3RhcnQgZnJvbVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiBudW1iZXIgdG8gc3RhcnQgZnJvbVxuICAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRBV29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IFJhbmdlIHtcbiAgICAgICAgdmFyIHdvcmRSYW5nZSA9IHRoaXMuZ2V0V29yZFJhbmdlKHJvdywgY29sdW1uKTtcbiAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUod29yZFJhbmdlLmVuZC5yb3cpO1xuXG4gICAgICAgIHdoaWxlIChsaW5lLmNoYXJBdCh3b3JkUmFuZ2UuZW5kLmNvbHVtbikubWF0Y2goL1sgXFx0XS8pKSB7XG4gICAgICAgICAgICB3b3JkUmFuZ2UuZW5kLmNvbHVtbiArPSAxO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHdvcmRSYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHNldE5ld0xpbmVNb2RlXG4gICAgICogQHBhcmFtIG5ld0xpbmVNb2RlIHtzdHJpbmd9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZShuZXdMaW5lTW9kZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgY3VycmVudCBuZXcgbGluZSBtb2RlLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXROZXdMaW5lTW9kZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKiBAcmVsYXRlZCBEb2N1bWVudC5nZXROZXdMaW5lTW9kZVxuICAgICAqL1xuICAgIHByaXZhdGUgZ2V0TmV3TGluZU1vZGUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldE5ld0xpbmVNb2RlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSWRlbnRpZmllcyBpZiB5b3Ugd2FudCB0byB1c2UgYSB3b3JrZXIgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRVc2VXb3JrZXJcbiAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IHVzZVdvcmtlciBTZXQgdG8gYHRydWVgIHRvIHVzZSBhIHdvcmtlci5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBzZXRVc2VXb3JrZXIodXNlV29ya2VyOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidXNlV29ya2VyXCIsIHVzZVdvcmtlcik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgd29ya2VycyBhcmUgYmVpbmcgdXNlZC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VXNlV29ya2VyXG4gICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VXNlV29ya2VyKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy4kdXNlV29ya2VyOyB9XG5cbiAgICAvKipcbiAgICAgKiBSZWxvYWRzIGFsbCB0aGUgdG9rZW5zIG9uIHRoZSBjdXJyZW50IHNlc3Npb24uXG4gICAgICogVGhpcyBmdW5jdGlvbiBjYWxscyBbW0JhY2tncm91bmRUb2tlbml6ZXIuc3RhcnQgYEJhY2tncm91bmRUb2tlbml6ZXIuc3RhcnQgKClgXV0gdG8gYWxsIHRoZSByb3dzOyBpdCBhbHNvIGVtaXRzIHRoZSBgJ3Rva2VuaXplclVwZGF0ZSdgIGV2ZW50LlxuICAgICAqL1xuICAgIC8vIFRPRE86IHN0cm9udHlwZSB0aGUgZXZlbnQuXG4gICAgcHJpdmF0ZSBvblJlbG9hZFRva2VuaXplcihlKSB7XG4gICAgICAgIHZhciByb3dzID0gZS5kYXRhO1xuICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KHJvd3MuZmlyc3QpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IHRva2VuaXplclVwZGF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcgbGFuZ2F1Z2UgbW9kZSBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICAgICogVGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VNb2RlJ2AgZXZlbnQuXG4gICAgICogSWYgYSBbW0JhY2tncm91bmRUb2tlbml6ZXIgYEJhY2tncm91bmRUb2tlbml6ZXJgXV0gaXMgc2V0LCB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudCBpcyBhbHNvIGVtaXR0ZWQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldExhbmd1YWdlTW9kZVxuICAgICAqIEBwYXJhbSBtb2RlIHtMYW5ndWFnZU1vZGV9IFNldCBhIG5ldyBsYW5ndWFnZSBtb2RlIGluc3RhbmNlIG9yIG1vZHVsZSBuYW1lLlxuICAgICAqIEBwYXJhbSB7Y2J9IG9wdGlvbmFsIGNhbGxiYWNrXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0TGFuZ3VhZ2VNb2RlKG1vZGU6IExhbmd1YWdlTW9kZSk6IHZvaWQge1xuICAgICAgICByZXR1cm4gdGhpcy4kb25DaGFuZ2VNb2RlKG1vZGUsIGZhbHNlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIGEgbmV3IGxhbmdhdWdlIG1vZGUgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICAqIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlTW9kZSdgIGV2ZW50LlxuICAgICAqIElmIGEgW1tCYWNrZ3JvdW5kVG9rZW5pemVyIGBCYWNrZ3JvdW5kVG9rZW5pemVyYF1dIGlzIHNldCwgdGhlIGAndG9rZW5pemVyVXBkYXRlJ2AgZXZlbnQgaXMgYWxzbyBlbWl0dGVkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRNb2RlXG4gICAgICogQHBhcmFtIG1vZGVOYW1lIHtzdHJpbmd9IFNldCBhIG5ldyBsYW5ndWFnZSBtb2R1bGUgbmFtZS5cbiAgICAgKiBAcGFyYW0ge2NifSBvcHRpb25hbCBjYWxsYmFja1xuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldE1vZGUobW9kZU5hbWU6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmltcG9ydE1vZGUobW9kZU5hbWUpXG4gICAgICAgICAgICAudGhlbihtb2RlID0+IHRoaXMuc2V0TGFuZ3VhZ2VNb2RlKG1vZGUpKVxuICAgICAgICAgICAgLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgc2V0TW9kZSBmYWlsZWQuIFJlYXNvbjogJHtyZWFzb259YCk7XG4gICAgICAgICAgICB9KVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgYSBuZXcgbGFuZ2F1Z2UgbW9kZSBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICAgICogVGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VNb2RlJ2AgZXZlbnQuXG4gICAgICogSWYgYSBbW0JhY2tncm91bmRUb2tlbml6ZXIgYEJhY2tncm91bmRUb2tlbml6ZXJgXV0gaXMgc2V0LCB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudCBpcyBhbHNvIGVtaXR0ZWQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldE1vZGVcbiAgICAgKiBAcGFyYW0gbW9kZU5hbWUge3N0cmluZ31cbiAgICAgKiBAcGFyYW0gb3B0aW9ucyB7T2JqZWN0fVxuICAgICAqIEByZXR1cm4ge1Byb21pc2U8TGFuZ3VhZ2VNb2RlPn1cbiAgICAgKi9cbiAgICBwdWJsaWMgaW1wb3J0TW9kZShtb2RlTmFtZTogc3RyaW5nLCBvcHRpb25zPzoge30pOiBQcm9taXNlPExhbmd1YWdlTW9kZT4ge1xuXG4gICAgICAgIGlmICh0eXBlb2YgbW9kZU5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwibW9kZU5hbWUgbXVzdCBiZSBhIHN0cmluZ1wiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldCBtb2RlIHRvIHRleHQgdW50aWwgbG9hZGluZyBpcyBmaW5pc2hlZC5cbiAgICAgICAgaWYgKCF0aGlzLiRtb2RlKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUobmV3IFRleHRNb2RlKCcnLCBbXSksIHRydWUpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgIHJldHVybiBuZXcgUHJvbWlzZTxMYW5ndWFnZU1vZGU+KGZ1bmN0aW9uKHN1Y2Nlc3MsIGZhaWwpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLiRtb2Rlc1ttb2RlTmFtZV0gJiYgIW9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAvLyBXZSd2ZSBhbHJlYWR5IGdvdCB0aGF0IG1vZGUgY2FjaGVkLCB1c2UgaXQuXG4gICAgICAgICAgICAgICAgc3VjY2VzcyhzZWxmLiRtb2Rlc1ttb2RlTmFtZV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJG1vZGVzW21vZGVOYW1lXSAmJiAhb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICBzdWNjZXNzKHNlbGYuJG1vZGVzW21vZGVOYW1lXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIGxvYWQgZHluYW1pY2FsbHkuXG4gICAgICAgICAgICAgICAgU3lzdGVtLmltcG9ydChtb2RlTmFtZSlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4oZnVuY3Rpb24obTogSW1wb3J0ZWRNb2R1bGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtICYmIG0uZGVmYXVsdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXdNb2RlOiBMYW5ndWFnZU1vZGUgPSBuZXcgbS5kZWZhdWx0KG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3MobmV3TW9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmYWlsKG5ldyBFcnJvcihgJHttb2RlTmFtZX0gZG9lcyBub3QgZGVmaW5lIGEgZGVmYXVsdCBleHBvcnQgKGEgTGFuZ3VhZ2VNb2RlIGNsYXNzKS5gKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pLmNhdGNoKGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZmFpbChyZWFzb24pO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkb25DaGFuZ2VNb2RlKG1vZGU6IExhbmd1YWdlTW9kZSwgaXNQbGFjZWhvbGRlcjogYm9vbGVhbik6IHZvaWQge1xuXG4gICAgICAgIGlmICghaXNQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgdGhpcy4kbW9kZUlkID0gbW9kZS4kaWQ7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kbW9kZSA9PT0gbW9kZSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kbW9kZSA9IG1vZGU7XG5cbiAgICAgICAgLy8gVE9ETzogV291bGRuJ3QgaXQgbWFrZSBtb3JlIHNlbnNlIHRvIHN0b3AgdGhlIHdvcmtlciwgdGhlbiBjaGFuZ2UgdGhlIG1vZGU/XG4gICAgICAgIHRoaXMuJHN0b3BXb3JrZXIoKTtcblxuICAgICAgICBpZiAodGhpcy4kdXNlV29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiRzdGFydFdvcmtlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRva2VuaXplcjogVG9rZW5pemVyID0gbW9kZS5nZXRUb2tlbml6ZXIoKTtcblxuICAgICAgICBpZiAodG9rZW5pemVyWydhZGRFdmVudExpc3RlbmVyJ10gIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdmFyIG9uUmVsb2FkVG9rZW5pemVyID0gdGhpcy5vblJlbG9hZFRva2VuaXplci5iaW5kKHRoaXMpO1xuICAgICAgICAgICAgdG9rZW5pemVyWydhZGRFdmVudExpc3RlbmVyJ10oXCJ1cGRhdGVcIiwgb25SZWxvYWRUb2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0aGlzLmJnVG9rZW5pemVyKSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyID0gbmV3IEJhY2tncm91bmRUb2tlbml6ZXIodG9rZW5pemVyLCB0aGlzKTtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIub24oXCJ1cGRhdGVcIiwgKGV2ZW50LCBiZzogQmFja2dyb3VuZFRva2VuaXplcikgPT4ge1xuICAgICAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICAgICAqIEBldmVudCB0b2tlbml6ZXJVcGRhdGVcbiAgICAgICAgICAgICAgICAgKi9cbiAgICAgICAgICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgZXZlbnQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuXG4gICAgICAgIHRoaXMudG9rZW5SZSA9IG1vZGUudG9rZW5SZTtcbiAgICAgICAgdGhpcy5ub25Ub2tlblJlID0gbW9kZS5ub25Ub2tlblJlO1xuXG5cbiAgICAgICAgaWYgKCFpc1BsYWNlaG9sZGVyKSB7XG4gICAgICAgICAgICB0aGlzLiRvcHRpb25zLndyYXBNZXRob2Quc2V0LmNhbGwodGhpcywgdGhpcy4kd3JhcE1ldGhvZCk7XG4gICAgICAgICAgICB0aGlzLiRzZXRGb2xkaW5nKG1vZGUuZm9sZGluZ1J1bGVzKTtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQoMCk7XG4gICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAqIEBldmVudCBjaGFuZ2VNb2RlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VNb2RlXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCAkc3RvcFdvcmtlclxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlICRzdG9wV29ya2VyKCk6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kd29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiR3b3JrZXIudGVybWluYXRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kICRzdGFydFdvcmtlclxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlICRzdGFydFdvcmtlcigpOiB2b2lkIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIEZJWE1FPyBOb3RpY2UgdGhhdCB0aGUgd29ya2VyIGhhcyBiZWVuIGNyZWF0ZWQgYnV0IG1heSBub3QgYmUgcmVhZHlcbiAgICAgICAgICAgIC8vIHRvIHJlY2VpdmUgbWVzc2FnZXMgeWV0LlxuICAgICAgICAgICAgdGhpcy4kbW9kZS5jcmVhdGVXb3JrZXIodGhpcylcbiAgICAgICAgICAgICAgICAudGhlbih3b3JrZXIgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiR3b3JrZXIgPSB3b3JrZXI7XG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAuY2F0Y2goZnVuY3Rpb24oZSkge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCR7ZX1gKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbGFuZ3VhZ2UgbW9kZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0TW9kZVxuICAgICAqIEByZXR1cm4ge0xhbmd1YWdlTW9kZX0gVGhlIGN1cnJlbnQgbGFuZ3VhZ2UgbW9kZS5cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0TW9kZSgpOiBMYW5ndWFnZU1vZGUge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBUaGlzIGZ1bmN0aW9uIHNldHMgdGhlIHNjcm9sbCB0b3AgdmFsdWUuIEl0IGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2Nyb2xsVG9wJ2AgZXZlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNjcm9sbFRvcFxuICAgICAqIEBwYXJhbSBzY3JvbGxUb3Age251bWJlcn0gVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIFRPRE86IHNob3VsZCB3ZSBmb3JjZSBpbnRlZ2VyIGxpbmVoZWlnaHQgaW5zdGVhZD8gc2Nyb2xsVG9wID0gTWF0aC5yb3VuZChzY3JvbGxUb3ApOyBcbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbFRvcCA9PT0gc2Nyb2xsVG9wIHx8IGlzTmFOKHNjcm9sbFRvcCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRzY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAZXZlbnQgY2hhZ2VTY3JvbGxUb3BcbiAgICAgICAgICovXG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbFRvcFwiLCBzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0b3Agb2YgdGhlIGVkaXRvciBhbmQgdGhlIHRvcG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTY3JvbGxUb3BcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFNjcm9sbFRvcCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kc2Nyb2xsVG9wO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFNjcm9sbExlZnRcbiAgICAgKiBAcGFyYW0gc2Nyb2xsTGVmdCB7bnVtYmVyfVxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICovXG4gICAgcHVibGljIHNldFNjcm9sbExlZnQoc2Nyb2xsTGVmdDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIC8vIHNjcm9sbExlZnQgPSBNYXRoLnJvdW5kKHNjcm9sbExlZnQpO1xuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsTGVmdCA9PT0gc2Nyb2xsTGVmdCB8fCBpc05hTihzY3JvbGxMZWZ0KSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRzY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VTY3JvbGxMZWZ0XG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmV2ZW50QnVzLl9zaWduYWwoXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHNjcm9sbExlZnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNjcm9sbExlZnRcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFNjcm9sbExlZnQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHNjcm9sbExlZnQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIHNjcmVlbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2NyZWVuV2lkdGhcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFNjcmVlbldpZHRoKCk6IG51bWJlciB7XG4gICAgICAgIHRoaXMuJGNvbXB1dGVXaWR0aCgpO1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cylcbiAgICAgICAgICAgIHJldHVybiBNYXRoLm1heCh0aGlzLmdldExpbmVXaWRnZXRNYXhXaWR0aCgpLCB0aGlzLnNjcmVlbldpZHRoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGg7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXRMaW5lV2lkZ2V0TWF4V2lkdGhcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIGdldExpbmVXaWRnZXRNYXhXaWR0aCgpOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0c1dpZHRoICE9IG51bGwpIHJldHVybiB0aGlzLmxpbmVXaWRnZXRzV2lkdGg7XG4gICAgICAgIHZhciB3aWR0aCA9IDA7XG4gICAgICAgIHRoaXMubGluZVdpZGdldHMuZm9yRWFjaChmdW5jdGlvbih3KSB7XG4gICAgICAgICAgICBpZiAodyAmJiB3LnNjcmVlbldpZHRoID4gd2lkdGgpXG4gICAgICAgICAgICAgICAgd2lkdGggPSB3LnNjcmVlbldpZHRoO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXMubGluZVdpZGdldFdpZHRoID0gd2lkdGg7XG4gICAgfVxuXG4gICAgcHVibGljICRjb21wdXRlV2lkdGgoZm9yY2U/OiBib29sZWFuKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMuJG1vZGlmaWVkIHx8IGZvcmNlKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5XaWR0aCA9IHRoaXMuJHdyYXBMaW1pdDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGxpbmVzID0gdGhpcy5kb2MuZ2V0QWxsTGluZXMoKTtcbiAgICAgICAgICAgIHZhciBjYWNoZSA9IHRoaXMuJHJvd0xlbmd0aENhY2hlO1xuICAgICAgICAgICAgdmFyIGxvbmdlc3RTY3JlZW5MaW5lID0gMDtcbiAgICAgICAgICAgIHZhciBmb2xkSW5kZXggPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy4kZm9sZERhdGFbZm9sZEluZGV4XTtcbiAgICAgICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgdmFyIGxlbiA9IGxpbmVzLmxlbmd0aDtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGkgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGkgPj0gbGVuKVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy4kZm9sZERhdGFbZm9sZEluZGV4KytdO1xuICAgICAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChjYWNoZVtpXSA9PSBudWxsKVxuICAgICAgICAgICAgICAgICAgICBjYWNoZVtpXSA9IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKGxpbmVzW2ldKVswXTtcblxuICAgICAgICAgICAgICAgIGlmIChjYWNoZVtpXSA+IGxvbmdlc3RTY3JlZW5MaW5lKVxuICAgICAgICAgICAgICAgICAgICBsb25nZXN0U2NyZWVuTGluZSA9IGNhY2hlW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zY3JlZW5XaWR0aCA9IGxvbmdlc3RTY3JlZW5MaW5lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHZlcmJhdGltIGNvcHkgb2YgdGhlIGdpdmVuIGxpbmUgYXMgaXQgaXMgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRMaW5lXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHJldHJpZXZlIGZyb20uXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRMaW5lKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHN0cmluZ3Mgb2YgdGhlIHJvd3MgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuXG4gICAgICogVGhpcyBmdW5jdGlvbiBpcyBpbmNsdXNpdmUgb2YgYGxhc3RSb3dgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRMaW5lc1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgZmlyc3Qgcm93IGluZGV4IHRvIHJldHJpZXZlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqIEByZXR1cm4ge3N0cmluZ1tdfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIHJvd3MgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRMZW5ndGhcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldExlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpEb2N1bWVudC5nZXRUZXh0UmFuZ2UuZGVzY31cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VGV4dFJhbmdlXG4gICAgICogQHBhcmFtIHJhbmdlIHtSYW5nZX0gVGhlIHJhbmdlIHRvIHdvcmsgd2l0aC5cbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICovXG4gICAgcHVibGljIGdldFRleHRSYW5nZShyYW5nZTogUmFuZ2UpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0VGV4dFJhbmdlKHJhbmdlIHx8IHRoaXMuc2VsZWN0aW9uLmdldFJhbmdlKCkpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEluc2VydHMgYSBibG9jayBvZiBgdGV4dGAgYXQgdGhlIGluZGljYXRlZCBgcG9zaXRpb25gLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBpbnNlcnRcbiAgICAgKiBAcGFyYW0gcG9zaXRpb24ge1Bvc2l0aW9ufSBUaGUgcG9zaXRpb24gdG8gc3RhcnQgaW5zZXJ0aW5nIGF0LlxuICAgICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IEEgY2h1bmsgb2YgdGV4dCB0byBpbnNlcnQuXG4gICAgICogQHJldHVybiB7UG9zaXRpb259IFRoZSBwb3NpdGlvbiBvZiB0aGUgbGFzdCBsaW5lIG9mIGB0ZXh0YC5cbiAgICAgKiBJZiB0aGUgbGVuZ3RoIG9mIGB0ZXh0YCBpcyAwLCB0aGlzIGZ1bmN0aW9uIHNpbXBseSByZXR1cm5zIGBwb3NpdGlvbmAuXG4gICAgICovXG4gICAgcHVibGljIGluc2VydChwb3NpdGlvbjogUG9zaXRpb24sIHRleHQ6IHN0cmluZyk6IFBvc2l0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmluc2VydChwb3NpdGlvbiwgdGV4dCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyB0aGUgYHJhbmdlYCBmcm9tIHRoZSBkb2N1bWVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgcmVtb3ZlXG4gICAgICogQHBhcmFtIHJhbmdlIHtSYW5nZX0gQSBzcGVjaWZpZWQgUmFuZ2UgdG8gcmVtb3ZlLlxuICAgICAqIEByZXR1cm4ge1Bvc2l0aW9ufSBUaGUgbmV3IGBzdGFydGAgcHJvcGVydHkgb2YgdGhlIHJhbmdlLCB3aGljaCBjb250YWlucyBgc3RhcnRSb3dgIGFuZCBgc3RhcnRDb2x1bW5gLlxuICAgICAqIElmIGByYW5nZWAgaXMgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgdW5tb2RpZmllZCB2YWx1ZSBvZiBgcmFuZ2Uuc3RhcnRgLlxuICAgICAqL1xuICAgIHB1YmxpYyByZW1vdmUocmFuZ2U6IFJhbmdlKTogUG9zaXRpb24ge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MucmVtb3ZlKHJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXZlcnRzIHByZXZpb3VzIGNoYW5nZXMgdG8geW91ciBkb2N1bWVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgdW5kb0NoYW5nZXNcbiAgICAgKiBAcGFyYW0gZGVsdGFzIHtEZWx0YVtdfSBBbiBhcnJheSBvZiBwcmV2aW91cyBjaGFuZ2VzLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZG9udFNlbGVjdCBbSWYgYHRydWVgLCBkb2Vzbid0IHNlbGVjdCB0aGUgcmFuZ2Ugb2Ygd2hlcmUgdGhlIGNoYW5nZSBvY2N1cmVkXXs6ICNkb250U2VsZWN0fVxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAqKi9cbiAgICBwdWJsaWMgdW5kb0NoYW5nZXMoZGVsdGFzOiBEZWx0YVtdLCBkb250U2VsZWN0PzogYm9vbGVhbik6IFJhbmdlIHtcbiAgICAgICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICAgICAgdmFyIGxhc3RVbmRvUmFuZ2U6IFJhbmdlID0gbnVsbDtcbiAgICAgICAgZm9yICh2YXIgaSA9IGRlbHRhcy5sZW5ndGggLSAxOyBpICE9IC0xOyBpLS0pIHtcbiAgICAgICAgICAgIHZhciBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgICAgICAgIGlmIChkZWx0YS5ncm91cCA9PT0gXCJkb2NcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jLnJldmVydERlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UgPVxuICAgICAgICAgICAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgdHJ1ZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWx0YS5kZWx0YXMuZm9yRWFjaCgoZm9sZERlbHRhKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYWRkRm9sZHMoZm9sZERlbHRhLmZvbGRzKTtcbiAgICAgICAgICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgICAgICBsYXN0VW5kb1JhbmdlICYmXG4gICAgICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ICYmXG4gICAgICAgICAgICAhZG9udFNlbGVjdCAmJlxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UobGFzdFVuZG9SYW5nZSk7XG4gICAgICAgIHJldHVybiBsYXN0VW5kb1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlLWltcGxlbWVudHMgYSBwcmV2aW91c2x5IHVuZG9uZSBjaGFuZ2UgdG8geW91ciBkb2N1bWVudC5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgcmVkb0NoYW5nZXNcbiAgICAgKiBAcGFyYW0gZGVsdGFzIHtEZWx0YVtdfSBBbiBhcnJheSBvZiBwcmV2aW91cyBjaGFuZ2VzXG4gICAgICogQHBhcmFtIFtkb250U2VsZWN0XSB7Ym9vbGVhbn1cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBwdWJsaWMgcmVkb0NoYW5nZXMoZGVsdGFzOiBEZWx0YVtdLCBkb250U2VsZWN0PzogYm9vbGVhbik6IFJhbmdlIHtcbiAgICAgICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICAgICAgdmFyIGxhc3RVbmRvUmFuZ2U6IFJhbmdlID0gbnVsbDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgICAgICAgIGlmIChkZWx0YS5ncm91cCA9PSBcImRvY1wiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kb2MuYXBwbHlEZWx0YXMoZGVsdGEuZGVsdGFzKTtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kZ2V0VW5kb1NlbGVjdGlvbihkZWx0YS5kZWx0YXMsIGZhbHNlLCBsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgICAgICBsYXN0VW5kb1JhbmdlICYmXG4gICAgICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ICYmXG4gICAgICAgICAgICAhZG9udFNlbGVjdCAmJlxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UobGFzdFVuZG9SYW5nZSk7XG4gICAgICAgIHJldHVybiBsYXN0VW5kb1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVuYWJsZXMgb3IgZGlzYWJsZXMgaGlnaGxpZ2h0aW5nIG9mIHRoZSByYW5nZSB3aGVyZSBhbiB1bmRvIG9jY3VycmVkLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRVbmRvU2VsZWN0XG4gICAgICogQHBhcmFtIGVuYWJsZSB7Ym9vbGVhbn0gSWYgYHRydWVgLCBzZWxlY3RzIHRoZSByYW5nZSBvZiB0aGUgcmVpbnNlcnRlZCBjaGFuZ2UuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFVuZG9TZWxlY3QoZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHVuZG9TZWxlY3QgPSBlbmFibGU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0VW5kb1NlbGVjdGlvbihkZWx0YXM6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9W10sIGlzVW5kbzogYm9vbGVhbiwgbGFzdFVuZG9SYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIGZ1bmN0aW9uIGlzSW5zZXJ0KGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nIH0pIHtcbiAgICAgICAgICAgIHZhciBpbnNlcnQgPSBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0VGV4dFwiIHx8IGRlbHRhLmFjdGlvbiA9PT0gXCJpbnNlcnRMaW5lc1wiO1xuICAgICAgICAgICAgcmV0dXJuIGlzVW5kbyA/ICFpbnNlcnQgOiBpbnNlcnQ7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZGVsdGE6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9ID0gZGVsdGFzWzBdO1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICB2YXIgcG9pbnQ6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgICAgIHZhciBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLmVuZCk7XG4gICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGRlbHRhcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnNldFN0YXJ0KGRlbHRhLnJhbmdlLnN0YXJ0LnJvdywgZGVsdGEucmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5lbmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnNldEVuZChkZWx0YS5yYW5nZS5lbmQucm93LCBkZWx0YS5yYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2Uuc3RhcnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyByYW5nZSBhbmQgdGhlIGxhc3QgdW5kbyByYW5nZSBoYXMgc29tZXRoaW5nIGluIGNvbW1vbi5cbiAgICAgICAgLy8gSWYgdHJ1ZSwgbWVyZ2UgdGhlIHJhbmdlcy5cbiAgICAgICAgaWYgKGxhc3RVbmRvUmFuZ2UgIT0gbnVsbCkge1xuICAgICAgICAgICAgaWYgKFJhbmdlLmNvbXBhcmVQb2ludHMobGFzdFVuZG9SYW5nZS5zdGFydCwgcmFuZ2Uuc3RhcnQpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4gKz0gcmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlLmVuZC5jb2x1bW4gKz0gcmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGNtcCA9IGxhc3RVbmRvUmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT09IDEpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zZXRTdGFydChsYXN0VW5kb1JhbmdlLnN0YXJ0LnJvdywgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnNldEVuZChsYXN0VW5kb1JhbmdlLmVuZC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyBhIHJhbmdlIGluIHRoZSBkb2N1bWVudCB3aXRoIHRoZSBuZXcgYHRleHRgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCByZXBsYWNlXG4gICAgICogQHBhcmFtIHJhbmdlIHtSYW5nZX0gQSBzcGVjaWZpZWQgUmFuZ2UgdG8gcmVwbGFjZS5cbiAgICAgKiBAcGFyYW0gdGV4dCB7c3RyaW5nfSBUaGUgbmV3IHRleHQgdG8gdXNlIGFzIGEgcmVwbGFjZW1lbnQuXG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICogSWYgdGhlIHRleHQgYW5kIHJhbmdlIGFyZSBlbXB0eSwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5zdGFydGAgdmFsdWUuXG4gICAgICogSWYgdGhlIHRleHQgaXMgdGhlIGV4YWN0IHNhbWUgYXMgd2hhdCBjdXJyZW50bHkgZXhpc3RzLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGN1cnJlbnQgYHJhbmdlLmVuZGAgdmFsdWUuXG4gICAgICovXG4gICAgcHVibGljIHJlcGxhY2UocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5yZXBsYWNlKHJhbmdlLCB0ZXh0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBNb3ZlcyBhIHJhbmdlIG9mIHRleHQgZnJvbSB0aGUgZ2l2ZW4gcmFuZ2UgdG8gdGhlIGdpdmVuIHBvc2l0aW9uLiBgdG9Qb3NpdGlvbmAgaXMgYW4gb2JqZWN0IHRoYXQgbG9va3MgbGlrZSB0aGlzOlxuICAgICAqICBgYGBqc29uXG4gICAgICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICAgKiAgYGBgXG4gICAgICogQG1ldGhvZCBtb3ZlVGV4dFxuICAgICAqIEBwYXJhbSBmcm9tUmFuZ2Uge1JhbmdlfSBUaGUgcmFuZ2Ugb2YgdGV4dCB5b3Ugd2FudCBtb3ZlZCB3aXRoaW4gdGhlIGRvY3VtZW50XG4gICAgICogQHBhcmFtIHRvUG9zaXRpb24ge1Bvc2l0aW9ufSBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvLlxuICAgICAqIEBwYXJhbSBjb3B5IHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge1JhbmdlfSBUaGUgbmV3IHJhbmdlIHdoZXJlIHRoZSB0ZXh0IHdhcyBtb3ZlZCB0by5cbiAgICAgKi9cbiAgICBwdWJsaWMgbW92ZVRleHQoZnJvbVJhbmdlOiBSYW5nZSwgdG9Qb3NpdGlvbjogUG9zaXRpb24sIGNvcHk6IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5nZXRUZXh0UmFuZ2UoZnJvbVJhbmdlKTtcbiAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZnJvbVJhbmdlKTtcbiAgICAgICAgdmFyIHJvd0RpZmY6IG51bWJlcjtcbiAgICAgICAgdmFyIGNvbERpZmY6IG51bWJlcjtcblxuICAgICAgICB2YXIgdG9SYW5nZSA9IFJhbmdlLmZyb21Qb2ludHModG9Qb3NpdGlvbiwgdG9Qb3NpdGlvbik7XG4gICAgICAgIGlmICghY29weSkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZnJvbVJhbmdlKTtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBmcm9tUmFuZ2Uuc3RhcnQucm93IC0gZnJvbVJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gcm93RGlmZiA/IC1mcm9tUmFuZ2UuZW5kLmNvbHVtbiA6IGZyb21SYW5nZS5zdGFydC5jb2x1bW4gLSBmcm9tUmFuZ2UuZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIGlmIChjb2xEaWZmKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRvUmFuZ2Uuc3RhcnQucm93ID09IGZyb21SYW5nZS5lbmQucm93ICYmIHRvUmFuZ2Uuc3RhcnQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRvUmFuZ2UuZW5kLnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLmVuZC5jb2x1bW4gPiBmcm9tUmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICB0b1JhbmdlLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocm93RGlmZiAmJiB0b1JhbmdlLnN0YXJ0LnJvdyA+PSBmcm9tUmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0b1JhbmdlLmVuZCA9IHRoaXMuaW5zZXJ0KHRvUmFuZ2Uuc3RhcnQsIHRleHQpO1xuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgb2xkU3RhcnQgPSBmcm9tUmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB2YXIgbmV3U3RhcnQgPSB0b1JhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgcm93RGlmZiA9IG5ld1N0YXJ0LnJvdyAtIG9sZFN0YXJ0LnJvdztcbiAgICAgICAgICAgIGNvbERpZmYgPSBuZXdTdGFydC5jb2x1bW4gLSBvbGRTdGFydC5jb2x1bW47XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGRzLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoeC5zdGFydC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgIHguc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh4LmVuZC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgIHguZW5kLmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB4LnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHguZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRvUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogSW5kZW50cyBhbGwgdGhlIHJvd3MsIGZyb20gYHN0YXJ0Um93YCB0byBgZW5kUm93YCAoaW5jbHVzaXZlKSwgYnkgcHJlZml4aW5nIGVhY2ggcm93IHdpdGggdGhlIHRva2VuIGluIGBpbmRlbnRTdHJpbmdgLlxuICAgICAqXG4gICAgICogIElmIGBpbmRlbnRTdHJpbmdgIGNvbnRhaW5zIHRoZSBgJ1xcdCdgIGNoYXJhY3RlciwgaXQncyByZXBsYWNlZCBieSB3aGF0ZXZlciBpcyBkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU3RyaW5nIGBnZXRUYWJTdHJpbmcoKWBdXS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgaW5kZW50Um93c1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFJvdyBTdGFydGluZyByb3dcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZW5kUm93IEVuZGluZyByb3dcbiAgICAgKiBAcGFyYW0ge1N0cmluZ30gaW5kZW50U3RyaW5nIFRoZSBpbmRlbnQgdG9rZW5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHB1YmxpYyBpbmRlbnRSb3dzKHN0YXJ0Um93OiBudW1iZXIsIGVuZFJvdzogbnVtYmVyLCBpbmRlbnRTdHJpbmc6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICBpbmRlbnRTdHJpbmcgPSBpbmRlbnRTdHJpbmcucmVwbGFjZSgvXFx0L2csIHRoaXMuZ2V0VGFiU3RyaW5nKCkpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSBzdGFydFJvdzsgcm93IDw9IGVuZFJvdzsgcm93KyspXG4gICAgICAgICAgICB0aGlzLmluc2VydCh7IHJvdzogcm93LCBjb2x1bW46IDAgfSwgaW5kZW50U3RyaW5nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBPdXRkZW50cyBhbGwgdGhlIHJvd3MgZGVmaW5lZCBieSB0aGUgYHN0YXJ0YCBhbmQgYGVuZGAgcHJvcGVydGllcyBvZiBgcmFuZ2VgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBvdXRkZW50Um93c1xuICAgICAqIEBwYXJhbSByYW5nZSB7UmFuZ2V9IEEgcmFuZ2Ugb2Ygcm93cy5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqXG4gICAgICovXG4gICAgcHVibGljIG91dGRlbnRSb3dzKHJhbmdlOiBSYW5nZSk6IHZvaWQge1xuICAgICAgICB2YXIgcm93UmFuZ2UgPSByYW5nZS5jb2xsYXBzZVJvd3MoKTtcbiAgICAgICAgdmFyIGRlbGV0ZVJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICB2YXIgc2l6ZSA9IHRoaXMuZ2V0VGFiU2l6ZSgpO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSByb3dSYW5nZS5zdGFydC5yb3c7IGkgPD0gcm93UmFuZ2UuZW5kLnJvdzsgKytpKSB7XG4gICAgICAgICAgICB2YXIgbGluZSA9IHRoaXMuZ2V0TGluZShpKTtcblxuICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQucm93ID0gaTtcbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5yb3cgPSBpO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBzaXplOyArK2opXG4gICAgICAgICAgICAgICAgaWYgKGxpbmUuY2hhckF0KGopICE9ICcgJylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBpZiAoaiA8IHNpemUgJiYgbGluZS5jaGFyQXQoaikgPT0gJ1xcdCcpIHtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5jb2x1bW4gPSBqO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqICsgMTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQuY29sdW1uID0gMDtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gajtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGRlbGV0ZVJhbmdlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJG1vdmVMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIsIGRpcjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgZmlyc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyk7XG4gICAgICAgIGxhc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRFbmQobGFzdFJvdyk7XG4gICAgICAgIGlmIChkaXIgPCAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQoZmlyc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA8IDApIHJldHVybiAwO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSByb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIGlmIChkaXIgPiAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA+IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkgcmV0dXJuIDA7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IHJvdyAtIGxhc3RSb3c7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGZpcnN0Um93KTtcbiAgICAgICAgICAgIGxhc3RSb3cgPSB0aGlzLiRjbGlwUm93VG9Eb2N1bWVudChsYXN0Um93KTtcbiAgICAgICAgICAgIHZhciBkaWZmID0gbGFzdFJvdyAtIGZpcnN0Um93ICsgMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShmaXJzdFJvdywgMCwgbGFzdFJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKS5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgIHguc3RhcnQucm93ICs9IGRpZmY7XG4gICAgICAgICAgICB4LmVuZC5yb3cgKz0gZGlmZjtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbGluZXM6IHN0cmluZ1tdID0gKGRpciA9PT0gMCkgPyB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdykgOiB0aGlzLmRvYy5yZW1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIHRoaXMuZG9jLmluc2VydExpbmVzKGZpcnN0Um93ICsgZGlmZiwgbGluZXMpO1xuICAgICAgICBmb2xkcy5sZW5ndGggJiYgdGhpcy5hZGRGb2xkcyhmb2xkcyk7XG4gICAgICAgIHJldHVybiBkaWZmO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNoaWZ0cyBhbGwgdGhlIGxpbmVzIGluIHRoZSBkb2N1bWVudCB1cCBvbmUsIHN0YXJ0aW5nIGZyb20gYGZpcnN0Um93YCBhbmQgZW5kaW5nIGF0IGBsYXN0Um93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIHN0YXJ0aW5nIHJvdyB0byBtb3ZlIHVwXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBtb3ZlIHVwXG4gICAgICogQHJldHVybiB7TnVtYmVyfSBJZiBgZmlyc3RSb3dgIGlzIGxlc3MtdGhhbiBvciBlcXVhbCB0byAwLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgMC4gT3RoZXJ3aXNlLCBvbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAgKlxuICAgICAqL1xuICAgIHByaXZhdGUgbW92ZUxpbmVzVXAoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgLTEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2hpZnRzIGFsbCB0aGUgbGluZXMgaW4gdGhlIGRvY3VtZW50IGRvd24gb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIHN0YXJ0aW5nIHJvdyB0byBtb3ZlIGRvd25cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSBkb3duXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqKi9cbiAgICBwcml2YXRlIG1vdmVMaW5lc0Rvd24oZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRHVwbGljYXRlcyBhbGwgdGhlIHRleHQgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGR1cGxpY2F0ZUxpbmVzXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gZHVwbGljYXRlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBkdXBsaWNhdGVcbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9IFJldHVybnMgdGhlIG51bWJlciBvZiBuZXcgcm93cyBhZGRlZDsgaW4gb3RoZXIgd29yZHMsIGBsYXN0Um93IC0gZmlyc3RSb3cgKyAxYC5cbiAgICAgKi9cbiAgICBwdWJsaWMgZHVwbGljYXRlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMCk7XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRjbGlwUm93VG9Eb2N1bWVudChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbihyb3csIHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGNsaXBDb2x1bW5Ub1Jvdyhyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAoY29sdW1uIDwgMClcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICByZXR1cm4gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogUG9zaXRpb24ge1xuICAgICAgICBjb2x1bW4gPSBNYXRoLm1heCgwLCBjb2x1bW4pO1xuXG4gICAgICAgIGlmIChyb3cgPCAwKSB7XG4gICAgICAgICAgICByb3cgPSAwO1xuICAgICAgICAgICAgY29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgIGlmIChyb3cgPj0gbGVuKSB7XG4gICAgICAgICAgICAgICAgcm93ID0gbGVuIC0gMTtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbiAtIDEpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbHVtbiA9IE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcm93OiByb3csXG4gICAgICAgICAgICBjb2x1bW46IGNvbHVtblxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJGNsaXBSYW5nZVRvRG9jdW1lbnRcbiAgICAgKiBAcGFyYW0gcmFuZ2Uge1JhbmdlfVxuICAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICAqL1xuICAgIHB1YmxpYyAkY2xpcFJhbmdlVG9Eb2N1bWVudChyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPCAwKSB7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5yb3cgPSAwO1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5yb3csXG4gICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGxlbiA9IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMTtcbiAgICAgICAgaWYgKHJhbmdlLmVuZC5yb3cgPiBsZW4pIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSBsZW47XG4gICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShsZW4pLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLiRjbGlwQ29sdW1uVG9Sb3coXG4gICAgICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHdoZXRoZXIgb3Igbm90IGxpbmUgd3JhcHBpbmcgaXMgZW5hYmxlZC4gSWYgYHVzZVdyYXBNb2RlYCBpcyBkaWZmZXJlbnQgdGhhbiB0aGUgY3VycmVudCB2YWx1ZSwgdGhlIGAnY2hhbmdlV3JhcE1vZGUnYCBldmVudCBpcyBlbWl0dGVkLlxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlV3JhcE1vZGUgRW5hYmxlIChvciBkaXNhYmxlKSB3cmFwIG1vZGVcbiAgICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVdyYXBNb2RlKHVzZVdyYXBNb2RlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSAhPSB0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdGhpcy4kdXNlV3JhcE1vZGUgPSB1c2VXcmFwTW9kZTtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG5cbiAgICAgICAgICAgIC8vIElmIHdyYXBNb2RlIGlzIGFjdGl2YWVkLCB0aGUgd3JhcERhdGEgYXJyYXkgaGFzIHRvIGJlIGluaXRpYWxpemVkLlxuICAgICAgICAgICAgaWYgKHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGxlbiA9IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICAgICAgdGhpcy4kd3JhcERhdGEgPSBBcnJheTxudW1iZXJbXT4obGVuKTtcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCBsZW4gLSAxKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBAZXZlbnQgY2hhbmdlV3JhcE1vZGVcbiAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgdGhpcy5ldmVudEJ1cy5fc2lnbmFsKFwiY2hhbmdlV3JhcE1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB3cmFwIG1vZGUgaXMgYmVpbmcgdXNlZDsgYGZhbHNlYCBvdGhlcndpc2UuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFVzZVdyYXBNb2RlXG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBnZXRVc2VXcmFwTW9kZSgpOiBib29sZWFuIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHVzZVdyYXBNb2RlO1xuICAgIH1cblxuICAgIC8vIEFsbG93IHRoZSB3cmFwIGxpbWl0IHRvIG1vdmUgZnJlZWx5IGJldHdlZW4gbWluIGFuZCBtYXguIEVpdGhlclxuICAgIC8vIHBhcmFtZXRlciBjYW4gYmUgbnVsbCB0byBhbGxvdyB0aGUgd3JhcCBsaW1pdCB0byBiZSB1bmNvbnN0cmFpbmVkXG4gICAgLy8gaW4gdGhhdCBkaXJlY3Rpb24uIE9yIHNldCBib3RoIHBhcmFtZXRlcnMgdG8gdGhlIHNhbWUgbnVtYmVyIHRvIHBpblxuICAgIC8vIHRoZSBsaW1pdCB0byB0aGF0IHZhbHVlLlxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGJvdW5kYXJpZXMgb2Ygd3JhcC5cbiAgICAgKiBFaXRoZXIgdmFsdWUgY2FuIGJlIGBudWxsYCB0byBoYXZlIGFuIHVuY29uc3RyYWluZWQgd3JhcCwgb3IsIHRoZXkgY2FuIGJlIHRoZSBzYW1lIG51bWJlciB0byBwaW4gdGhlIGxpbWl0LlxuICAgICAqIElmIHRoZSB3cmFwIGxpbWl0cyBmb3IgYG1pbmAgb3IgYG1heGAgYXJlIGRpZmZlcmVudCwgdGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VXcmFwTW9kZSdgIGV2ZW50LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRXcmFwTGltaXRSYW5nZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtaW4gVGhlIG1pbmltdW0gd3JhcCB2YWx1ZSAodGhlIGxlZnQgc2lkZSB3cmFwKVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXggVGhlIG1heGltdW0gd3JhcCB2YWx1ZSAodGhlIHJpZ2h0IHNpZGUgd3JhcClcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHNldFdyYXBMaW1pdFJhbmdlKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kd3JhcExpbWl0UmFuZ2UubWluICE9PSBtaW4gfHwgdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4ICE9PSBtYXgpIHtcbiAgICAgICAgICAgIHRoaXMuJHdyYXBMaW1pdFJhbmdlID0ge1xuICAgICAgICAgICAgICAgIG1pbjogbWluLFxuICAgICAgICAgICAgICAgIG1heDogbWF4XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgLy8gVGhpcyB3aWxsIGZvcmNlIGEgcmVjYWxjdWxhdGlvbiBvZiB0aGUgd3JhcCBsaW1pdC5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZVdyYXBNb2RlXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVdyYXBNb2RlXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVGhpcyBzaG91bGQgZ2VuZXJhbGx5IG9ubHkgYmUgY2FsbGVkIGJ5IHRoZSByZW5kZXJlciB3aGVuIGEgcmVzaXplIGlzIGRldGVjdGVkLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZXNpcmVkTGltaXQgVGhlIG5ldyB3cmFwIGxpbWl0XG4gICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAgKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHVibGljIGFkanVzdFdyYXBMaW1pdChkZXNpcmVkTGltaXQ6IG51bWJlciwgJHByaW50TWFyZ2luOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICAgICAgdmFyIGxpbWl0cyA9IHRoaXMuJHdyYXBMaW1pdFJhbmdlXG4gICAgICAgIGlmIChsaW1pdHMubWF4IDwgMClcbiAgICAgICAgICAgIGxpbWl0cyA9IHsgbWluOiAkcHJpbnRNYXJnaW4sIG1heDogJHByaW50TWFyZ2luIH07XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiRjb25zdHJhaW5XcmFwTGltaXQoZGVzaXJlZExpbWl0LCBsaW1pdHMubWluLCBsaW1pdHMubWF4KTtcbiAgICAgICAgaWYgKHdyYXBMaW1pdCAhPSB0aGlzLiR3cmFwTGltaXQgJiYgd3JhcExpbWl0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0ID0gd3JhcExpbWl0O1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogQGV2ZW50IGNoYW5nZVdyYXBMaW1pdFxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIHRoaXMuZXZlbnRCdXMuX3NpZ25hbChcImNoYW5nZVdyYXBMaW1pdFwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRjb25zdHJhaW5XcmFwTGltaXQod3JhcExpbWl0OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmIChtaW4pXG4gICAgICAgICAgICB3cmFwTGltaXQgPSBNYXRoLm1heChtaW4sIHdyYXBMaW1pdCk7XG5cbiAgICAgICAgaWYgKG1heClcbiAgICAgICAgICAgIHdyYXBMaW1pdCA9IE1hdGgubWluKG1heCwgd3JhcExpbWl0KTtcblxuICAgICAgICByZXR1cm4gd3JhcExpbWl0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgdmFsdWUgb2Ygd3JhcCBsaW1pdC5cbiAgICAqIEByZXR1cm4ge051bWJlcn0gVGhlIHdyYXAgbGltaXQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXQoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBMaW1pdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBsaW5lIGxlbmd0aCBmb3Igc29mdCB3cmFwIGluIHRoZSBlZGl0b3IuIExpbmVzIHdpbGwgYnJlYWtcbiAgICAgKiAgYXQgYSBtaW5pbXVtIG9mIHRoZSBnaXZlbiBsZW5ndGggbWludXMgMjAgY2hhcnMgYW5kIGF0IGEgbWF4aW11bVxuICAgICAqICBvZiB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGNoYXJzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsaW1pdCBUaGUgbWF4aW11bSBsaW5lIGxlbmd0aCBpbiBjaGFycywgZm9yIHNvZnQgd3JhcHBpbmcgbGluZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRXcmFwTGltaXQobGltaXQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB0aGlzLnNldFdyYXBMaW1pdFJhbmdlKGxpbWl0LCBsaW1pdCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIG9iamVjdCB0aGF0IGRlZmluZXMgdGhlIG1pbmltdW0gYW5kIG1heGltdW0gb2YgdGhlIHdyYXAgbGltaXQ7IGl0IGxvb2tzIHNvbWV0aGluZyBsaWtlIHRoaXM6XG4gICAgKlxuICAgICogICAgIHsgbWluOiB3cmFwTGltaXRSYW5nZV9taW4sIG1heDogd3JhcExpbWl0UmFuZ2VfbWF4IH1cbiAgICAqXG4gICAgKiBAcmV0dXJuIHtPYmplY3R9XG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRXcmFwTGltaXRSYW5nZSgpIHtcbiAgICAgICAgLy8gQXZvaWQgdW5leHBlY3RlZCBtdXRhdGlvbiBieSByZXR1cm5pbmcgYSBjb3B5XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtaW46IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbixcbiAgICAgICAgICAgIG1heDogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UoZTogRGVsdGFFdmVudCkge1xuICAgICAgICB2YXIgdXNlV3JhcE1vZGUgPSB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICAgICAgdmFyIGxlbjtcbiAgICAgICAgdmFyIGFjdGlvbiA9IGUuZGF0YS5hY3Rpb247XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IGUuZGF0YS5yYW5nZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBsYXN0Um93ID0gZS5kYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICAgIHZhciBzdGFydCA9IGUuZGF0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IGUuZGF0YS5yYW5nZS5lbmQ7XG4gICAgICAgIHZhciByZW1vdmVkRm9sZHMgPSBudWxsO1xuXG4gICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcIkxpbmVzXCIpICE9IC0xKSB7XG4gICAgICAgICAgICBpZiAoYWN0aW9uID09IFwiaW5zZXJ0TGluZXNcIikge1xuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdyArIChlLmRhdGEubGluZXMubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxlbiA9IGUuZGF0YS5saW5lcyA/IGUuZGF0YS5saW5lcy5sZW5ndGggOiBsYXN0Um93IC0gZmlyc3RSb3c7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBsZW4gPSBsYXN0Um93IC0gZmlyc3RSb3c7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiR1cGRhdGluZyA9IHRydWU7XG4gICAgICAgIGlmIChsZW4gIT0gMCkge1xuICAgICAgICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwicmVtb3ZlXCIpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgdGhpc1t1c2VXcmFwTW9kZSA/IFwiJHdyYXBEYXRhXCIgOiBcIiRyb3dMZW5ndGhDYWNoZVwiXS5zcGxpY2UoZmlyc3RSb3csIGxlbik7XG5cbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgICAgICAgICAgcmVtb3ZlZEZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZS5kYXRhLnJhbmdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKHJlbW92ZWRGb2xkcyk7XG5cbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGVuZC5yb3cpO1xuICAgICAgICAgICAgICAgIHZhciBpZHggPSAwO1xuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhlbmQucm93LCBlbmQuY29sdW1uLCBzdGFydC5jb2x1bW4gLSBlbmQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3coLWxlbik7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lQmVmb3JlID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZUJlZm9yZSAmJiBmb2xkTGluZUJlZm9yZSAhPT0gZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lQmVmb3JlLm1lcmdlKGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmVCZWZvcmU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpICsgMTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGlkeDsgaWR4IDwgZm9sZExpbmVzLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZExpbmVzW2lkeF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPj0gZW5kLnJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3coLWxlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3c7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuKTtcbiAgICAgICAgICAgICAgICBhcmdzLnVuc2hpZnQoZmlyc3RSb3csIDApO1xuICAgICAgICAgICAgICAgIHZhciBhcnIgPSB1c2VXcmFwTW9kZSA/IHRoaXMuJHdyYXBEYXRhIDogdGhpcy4kcm93TGVuZ3RoQ2FjaGVcbiAgICAgICAgICAgICAgICBhcnIuc3BsaWNlLmFwcGx5KGFyciwgYXJncyk7XG5cbiAgICAgICAgICAgICAgICAvLyBJZiBzb21lIG5ldyBsaW5lIGlzIGFkZGVkIGluc2lkZSBvZiBhIGZvbGRMaW5lLCB0aGVuIHNwbGl0XG4gICAgICAgICAgICAgICAgLy8gdGhlIGZvbGQgbGluZSB1cC5cbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIGlkeCA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkTGluZS5yYW5nZS5jb21wYXJlSW5zaWRlKHN0YXJ0LnJvdywgc3RhcnQuY29sdW1uKVxuICAgICAgICAgICAgICAgICAgICAvLyBJbnNpZGUgb2YgdGhlIGZvbGRMaW5lIHJhbmdlLiBOZWVkIHRvIHNwbGl0IHN0dWZmIHVwLlxuICAgICAgICAgICAgICAgICAgICBpZiAoY21wID09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmUuc3BsaXQoc3RhcnQucm93LCBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RSb3csIDAsIGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEluZnJvbnQgb2YgdGhlIGZvbGRMaW5lIGJ1dCBzYW1lIHJvdy4gTmVlZCB0byBzaGlmdCBjb2x1bW4uXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZmlyc3RSb3csIDAsIGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vdGhpbmcgdG8gZG8gaWYgdGhlIGluc2VydCBpcyBhZnRlciB0aGUgZm9sZExpbmUuXG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChpZHg7IGlkeCA8IGZvbGRMaW5lcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGRMaW5lc1tpZHhdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93ID49IGZpcnN0Um93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gUmVhbGlnbiBmb2xkcy4gRS5nLiBpZiB5b3UgYWRkIHNvbWUgbmV3IGNoYXJzIGJlZm9yZSBhIGZvbGQsIHRoZVxuICAgICAgICAgICAgLy8gZm9sZCBzaG91bGQgXCJtb3ZlXCIgdG8gdGhlIHJpZ2h0LlxuICAgICAgICAgICAgbGVuID0gTWF0aC5hYnMoZS5kYXRhLnJhbmdlLnN0YXJ0LmNvbHVtbiAtIGUuZGF0YS5yYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcInJlbW92ZVwiKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgdGhlIGZvbGRzIGluIHRoZSBjaGFuZ2UgcmFuZ2UgYW5kIHJlbW92ZSB0aGVtLlxuICAgICAgICAgICAgICAgIHJlbW92ZWRGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGUuZGF0YS5yYW5nZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhyZW1vdmVkRm9sZHMpO1xuXG4gICAgICAgICAgICAgICAgbGVuID0gLWxlbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZmlyc3RSb3csIHN0YXJ0LmNvbHVtbiwgbGVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSAmJiB0aGlzLiR3cmFwRGF0YS5sZW5ndGggIT0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJkb2MuZ2V0TGVuZ3RoKCkgYW5kICR3cmFwRGF0YS5sZW5ndGggaGF2ZSB0byBiZSB0aGUgc2FtZSFcIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kdXBkYXRpbmcgPSBmYWxzZTtcblxuICAgICAgICBpZiAodXNlV3JhcE1vZGUpXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZpcnN0Um93LCBsYXN0Um93KTtcblxuICAgICAgICByZXR1cm4gcmVtb3ZlZEZvbGRzO1xuICAgIH1cblxuICAgIHB1YmxpYyAkdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZmlyc3RSb3csIGxhc3RSb3csIGI/KSB7XG4gICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlW2ZpcnN0Um93XSA9IG51bGw7XG4gICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlW2xhc3RSb3ddID0gbnVsbDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJHVwZGF0ZVdyYXBEYXRhKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgIHZhciBsaW5lcyA9IHRoaXMuZG9jLmdldEFsbExpbmVzKCk7XG4gICAgICAgIHZhciB0YWJTaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG4gICAgICAgIHZhciB3cmFwRGF0YSA9IHRoaXMuJHdyYXBEYXRhO1xuICAgICAgICB2YXIgd3JhcExpbWl0ID0gdGhpcy4kd3JhcExpbWl0O1xuICAgICAgICB2YXIgdG9rZW5zO1xuICAgICAgICB2YXIgZm9sZExpbmU7XG5cbiAgICAgICAgdmFyIHJvdyA9IGZpcnN0Um93O1xuICAgICAgICBsYXN0Um93ID0gTWF0aC5taW4obGFzdFJvdywgbGluZXMubGVuZ3RoIC0gMSk7XG4gICAgICAgIHdoaWxlIChyb3cgPD0gbGFzdFJvdykge1xuICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKHJvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgaWYgKCFmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMobGluZXNbcm93XSk7XG4gICAgICAgICAgICAgICAgd3JhcERhdGFbcm93XSA9IHRoaXMuJGNvbXB1dGVXcmFwU3BsaXRzKHRva2Vucywgd3JhcExpbWl0LCB0YWJTaXplKTtcbiAgICAgICAgICAgICAgICByb3crKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gW107XG4gICAgICAgICAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlciwgcm93LCBjb2x1bW4sIGxhc3RDb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHdhbGtUb2tlbnM6IG51bWJlcltdO1xuICAgICAgICAgICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGxhY2Vob2xkZXIsIHRva2Vucy5sZW5ndGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2Vuc1swXSA9IFBMQUNFSE9MREVSX1NUQVJUO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB3YWxrVG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2Vuc1tpXSA9IFBMQUNFSE9MREVSX0JPRFk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lc1tyb3ddLnN1YnN0cmluZyhsYXN0Q29sdW1uLCBjb2x1bW4pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRva2Vucy5sZW5ndGgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRva2VucyA9IHRva2Vucy5jb25jYXQod2Fsa1Rva2Vucyk7XG4gICAgICAgICAgICAgICAgfS5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5lbmQucm93LFxuICAgICAgICAgICAgICAgICAgICBsaW5lc1tmb2xkTGluZS5lbmQucm93XS5sZW5ndGggKyAxXG4gICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgIHdyYXBEYXRhW2ZvbGRMaW5lLnN0YXJ0LnJvd10gPSB0aGlzLiRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnMsIHdyYXBMaW1pdCwgdGFiU2l6ZSk7XG4gICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnM6IG51bWJlcltdLCB3cmFwTGltaXQ6IG51bWJlciwgdGFiU2l6ZT86IG51bWJlcikge1xuICAgICAgICBpZiAodG9rZW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3BsaXRzOiBudW1iZXJbXSA9IFtdO1xuICAgICAgICB2YXIgZGlzcGxheUxlbmd0aCA9IHRva2Vucy5sZW5ndGg7XG4gICAgICAgIHZhciBsYXN0U3BsaXQgPSAwLCBsYXN0RG9jU3BsaXQgPSAwO1xuXG4gICAgICAgIHZhciBpc0NvZGUgPSB0aGlzLiR3cmFwQXNDb2RlO1xuXG4gICAgICAgIGZ1bmN0aW9uIGFkZFNwbGl0KHNjcmVlblBvczogbnVtYmVyKSB7XG4gICAgICAgICAgICB2YXIgZGlzcGxheWVkID0gdG9rZW5zLnNsaWNlKGxhc3RTcGxpdCwgc2NyZWVuUG9zKTtcblxuICAgICAgICAgICAgLy8gVGhlIGRvY3VtZW50IHNpemUgaXMgdGhlIGN1cnJlbnQgc2l6ZSAtIHRoZSBleHRyYSB3aWR0aCBmb3IgdGFic1xuICAgICAgICAgICAgLy8gYW5kIG11bHRpcGxlV2lkdGggY2hhcmFjdGVycy5cbiAgICAgICAgICAgIHZhciBsZW4gPSBkaXNwbGF5ZWQubGVuZ3RoO1xuICAgICAgICAgICAgZGlzcGxheWVkLmpvaW4oXCJcIikuXG4gICAgICAgICAgICAgICAgLy8gR2V0IGFsbCB0aGUgVEFCX1NQQUNFcy5cbiAgICAgICAgICAgICAgICByZXBsYWNlKC8xMi9nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgbGVuIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgICAgICAgICAgfSkuXG4gICAgICAgICAgICAgICAgLy8gR2V0IGFsbCB0aGUgQ0hBUl9FWFQvbXVsdGlwbGVXaWR0aCBjaGFyYWN0ZXJzLlxuICAgICAgICAgICAgICAgIHJlcGxhY2UoLzIvZywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlbiAtPSAxO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsYXN0RG9jU3BsaXQgKz0gbGVuO1xuICAgICAgICAgICAgc3BsaXRzLnB1c2gobGFzdERvY1NwbGl0KTtcbiAgICAgICAgICAgIGxhc3RTcGxpdCA9IHNjcmVlblBvcztcbiAgICAgICAgfVxuXG4gICAgICAgIHdoaWxlIChkaXNwbGF5TGVuZ3RoIC0gbGFzdFNwbGl0ID4gd3JhcExpbWl0KSB7XG4gICAgICAgICAgICAvLyBUaGlzIGlzLCB3aGVyZSB0aGUgc3BsaXQgc2hvdWxkIGJlLlxuICAgICAgICAgICAgdmFyIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuXG4gICAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBhIHNwYWNlIG9yIHRhYiBhdCB0aGlzIHNwbGl0IHBvc2l0aW9uLCB0aGVuIG1ha2luZ1xuICAgICAgICAgICAgLy8gYSBzcGxpdCBpcyBzaW1wbGUuXG4gICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0IC0gMV0gPj0gU1BBQ0UgJiYgdG9rZW5zW3NwbGl0XSA+PSBTUEFDRSkge1xuICAgICAgICAgICAgICAgIC8qIGRpc2FibGVkIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYWpheG9yZy9hY2UvaXNzdWVzLzExODZcbiAgICAgICAgICAgICAgICAvLyBJbmNsdWRlIGFsbCBmb2xsb3dpbmcgc3BhY2VzICsgdGFicyBpbiB0aGlzIHNwbGl0IGFzIHdlbGwuXG4gICAgICAgICAgICAgICAgd2hpbGUgKHRva2Vuc1tzcGxpdF0gPj0gU1BBQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQgKys7XG4gICAgICAgICAgICAgICAgfSAqL1xuICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAgICAgICAvLyBDaGVjayBpZiBzcGxpdCBpcyBpbnNpZGUgb2YgYSBwbGFjZWhvbGRlci4gUGxhY2Vob2xkZXIgYXJlXG4gICAgICAgICAgICAvLyBub3Qgc3BsaXRhYmxlLiBUaGVyZWZvcmUsIHNlZWsgdGhlIGJlZ2lubmluZyBvZiB0aGUgcGxhY2Vob2xkZXJcbiAgICAgICAgICAgIC8vIGFuZCB0cnkgdG8gcGxhY2UgdGhlIHNwbGl0IGJlb2ZyZSB0aGUgcGxhY2Vob2xkZXIncyBzdGFydC5cbiAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX1NUQVJUIHx8IHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfQk9EWSkge1xuICAgICAgICAgICAgICAgIC8vIFNlZWsgdGhlIHN0YXJ0IG9mIHRoZSBwbGFjZWhvbGRlciBhbmQgZG8gdGhlIHNwbGl0XG4gICAgICAgICAgICAgICAgLy8gYmVmb3JlIHRoZSBwbGFjZWhvbGRlci4gQnkgZGVmaW5pdGlvbiB0aGVyZSBhbHdheXNcbiAgICAgICAgICAgICAgICAvLyBhIFBMQUNFSE9MREVSX1NUQVJUIGJldHdlZW4gc3BsaXQgYW5kIGxhc3RTcGxpdC5cbiAgICAgICAgICAgICAgICBmb3IgKHNwbGl0OyBzcGxpdCAhPSBsYXN0U3BsaXQgLSAxOyBzcGxpdC0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzcGxpdCsrOyA8PCBObyBpbmNyZW1lbnRhbCBoZXJlIGFzIHdlIHdhbnQgdG9cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICBoYXZlIHRoZSBwb3NpdGlvbiBiZWZvcmUgdGhlIFBsYWNlaG9sZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgUExBQ0VIT0xERVJfU1RBUlQgaXMgbm90IHRoZSBpbmRleCBvZiB0aGVcbiAgICAgICAgICAgICAgICAvLyBsYXN0IHNwbGl0LCB0aGVuIHdlIGNhbiBkbyB0aGUgc3BsaXRcbiAgICAgICAgICAgICAgICBpZiAoc3BsaXQgPiBsYXN0U3BsaXQpIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgUExBQ0VIT0xERVJfU1RBUlQgSVMgdGhlIGluZGV4IG9mIHRoZSBsYXN0XG4gICAgICAgICAgICAgICAgLy8gc3BsaXQsIHRoZW4gd2UgaGF2ZSB0byBwbGFjZSB0aGUgc3BsaXQgYWZ0ZXIgdGhlXG4gICAgICAgICAgICAgICAgLy8gcGxhY2Vob2xkZXIuIFNvLCBsZXQncyBzZWVrIGZvciB0aGUgZW5kIG9mIHRoZSBwbGFjZWhvbGRlci5cbiAgICAgICAgICAgICAgICBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcbiAgICAgICAgICAgICAgICBmb3IgKHNwbGl0OyBzcGxpdCA8IHRva2Vucy5sZW5ndGg7IHNwbGl0KyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gIT0gUExBQ0VIT0xERVJfQk9EWSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJZiBzcGlsdCA9PSB0b2tlbnMubGVuZ3RoLCB0aGVuIHRoZSBwbGFjZWhvbGRlciBpcyB0aGUgbGFzdFxuICAgICAgICAgICAgICAgIC8vIHRoaW5nIGluIHRoZSBsaW5lIGFuZCBhZGRpbmcgYSBuZXcgc3BsaXQgZG9lc24ndCBtYWtlIHNlbnNlLlxuICAgICAgICAgICAgICAgIGlmIChzcGxpdCA9PSB0b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrOyAgLy8gQnJlYWtzIHRoZSB3aGlsZS1sb29wLlxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEZpbmFsbHksIGFkZCB0aGUgc3BsaXQuLi5cbiAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgICAgICAgLy8gU2VhcmNoIGZvciB0aGUgZmlyc3Qgbm9uIHNwYWNlL3RhYi9wbGFjZWhvbGRlci9wdW5jdHVhdGlvbiB0b2tlbiBiYWNrd2FyZHMuXG4gICAgICAgICAgICB2YXIgbWluU3BsaXQgPSBNYXRoLm1heChzcGxpdCAtIChpc0NvZGUgPyAxMCA6IHdyYXBMaW1pdCAtICh3cmFwTGltaXQgPj4gMikpLCBsYXN0U3BsaXQgLSAxKTtcbiAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaXNDb2RlKSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPT0gUFVOQ1RVQVRJT04pIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBTUEFDRSkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIElmIHdlIGZvdW5kIG9uZSwgdGhlbiBhZGQgdGhlIHNwbGl0LlxuICAgICAgICAgICAgaWYgKHNwbGl0ID4gbWluU3BsaXQpIHtcbiAgICAgICAgICAgICAgICBhZGRTcGxpdCgrK3NwbGl0KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAgICAgICBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcbiAgICAgICAgICAgIC8vIFRoZSBzcGxpdCBpcyBpbnNpZGUgb2YgYSBDSEFSIG9yIENIQVJfRVhUIHRva2VuIGFuZCBubyBzcGFjZVxuICAgICAgICAgICAgLy8gYXJvdW5kIC0+IGZvcmNlIGEgc3BsaXQuXG4gICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNwbGl0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdpdmVuIGEgc3RyaW5nLCByZXR1cm5zIGFuIGFycmF5IG9mIHRoZSBkaXNwbGF5IGNoYXJhY3RlcnMsIGluY2x1ZGluZyB0YWJzIGFuZCBzcGFjZXMuXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY2hlY2tcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgVGhlIHZhbHVlIHRvIHN0YXJ0IGF0XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlICRnZXREaXNwbGF5VG9rZW5zKHN0cjogc3RyaW5nLCBvZmZzZXQ/OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIHZhciBhcnI6IG51bWJlcltdID0gW107XG4gICAgICAgIHZhciB0YWJTaXplOiBudW1iZXI7XG4gICAgICAgIG9mZnNldCA9IG9mZnNldCB8fCAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgYyA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICAgICAgLy8gVGFiXG4gICAgICAgICAgICBpZiAoYyA9PSA5KSB7XG4gICAgICAgICAgICAgICAgdGFiU2l6ZSA9IHRoaXMuZ2V0U2NyZWVuVGFiU2l6ZShhcnIubGVuZ3RoICsgb2Zmc2V0KTtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChUQUIpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIG4gPSAxOyBuIDwgdGFiU2l6ZTsgbisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyci5wdXNoKFRBQl9TUEFDRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gU3BhY2VcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPT0gMzIpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChTUEFDRSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICgoYyA+IDM5ICYmIGMgPCA0OCkgfHwgKGMgPiA1NyAmJiBjIDwgNjQpKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goUFVOQ1RVQVRJT04pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZnVsbCB3aWR0aCBjaGFyYWN0ZXJzXG4gICAgICAgICAgICBlbHNlIGlmIChjID49IDB4MTEwMCAmJiBpc0Z1bGxXaWR0aChjKSkge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKENIQVIsIENIQVJfRVhUKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKENIQVIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhcnI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsY3VsYXRlcyB0aGUgd2lkdGggb2YgdGhlIHN0cmluZyBgc3RyYCBvbiB0aGUgc2NyZWVuIHdoaWxlIGFzc3VtaW5nIHRoYXQgdGhlIHN0cmluZyBzdGFydHMgYXQgdGhlIGZpcnN0IGNvbHVtbiBvbiB0aGUgc2NyZWVuLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHN0ciBUaGUgc3RyaW5nIHRvIGNhbGN1bGF0ZSB0aGUgc2NyZWVuIHdpZHRoIG9mXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbWF4U2NyZWVuQ29sdW1uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gc2NyZWVuQ29sdW1uXG4gICAgKiBAcmV0dXJuIHtbTnVtYmVyXX0gUmV0dXJucyBhbiBgaW50W11gIGFycmF5IHdpdGggdHdvIGVsZW1lbnRzOjxici8+XG4gICAgKiBUaGUgZmlyc3QgcG9zaXRpb24gaW5kaWNhdGVzIHRoZSBudW1iZXIgb2YgY29sdW1ucyBmb3IgYHN0cmAgb24gc2NyZWVuLjxici8+XG4gICAgKiBUaGUgc2Vjb25kIHZhbHVlIGNvbnRhaW5zIHRoZSBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgY29sdW1uIHRoYXQgdGhpcyBmdW5jdGlvbiByZWFkIHVudGlsLlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgJGdldFN0cmluZ1NjcmVlbldpZHRoKHN0cjogc3RyaW5nLCBtYXhTY3JlZW5Db2x1bW4/OiBudW1iZXIsIHNjcmVlbkNvbHVtbj86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSAwKVxuICAgICAgICAgICAgcmV0dXJuIFswLCAwXTtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgbWF4U2NyZWVuQ29sdW1uID0gSW5maW5pdHk7XG4gICAgICAgIHNjcmVlbkNvbHVtbiA9IHNjcmVlbkNvbHVtbiB8fCAwO1xuXG4gICAgICAgIHZhciBjOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2x1bW46IG51bWJlcjtcbiAgICAgICAgZm9yIChjb2x1bW4gPSAwOyBjb2x1bW4gPCBzdHIubGVuZ3RoOyBjb2x1bW4rKykge1xuICAgICAgICAgICAgYyA9IHN0ci5jaGFyQ29kZUF0KGNvbHVtbik7XG4gICAgICAgICAgICAvLyB0YWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNjcmVlbkNvbHVtbiA+IG1heFNjcmVlbkNvbHVtbikge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFtzY3JlZW5Db2x1bW4sIGNvbHVtbl07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBudW1iZXIgb2Ygc2NyZWVucm93cyBpbiBhIHdyYXBwZWQgbGluZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0Um93TGVuZ3RoXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IG51bWJlciB0byBjaGVja1xuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0Um93TGVuZ3RoKHJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICB2YXIgaCA9IHRoaXMubGluZVdpZGdldHNbcm93XSAmJiB0aGlzLmxpbmVXaWRnZXRzW3Jvd10ucm93Q291bnQgfHwgMDtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgaCA9IDBcbiAgICAgICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSB8fCAhdGhpcy4kd3JhcERhdGFbcm93XSkge1xuICAgICAgICAgICAgcmV0dXJuIDEgKyBoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMSArIGg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGdldFJvd0xpbmVDb3VudFxuICAgICAqIEBwYXJhbSByb3cge251bWJlcn1cbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFJvd0xpbmVDb3VudChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRSb3dXcmFwSW5kZW50KHNjcmVlblJvdzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgICAgICB2YXIgc3BsaXRzOiBudW1iZXJbXSA9IHRoaXMuJHdyYXBEYXRhW3Bvcy5yb3ddO1xuICAgICAgICAgICAgLy8gRklYTUU6IGluZGVudCBkb2VzIG5vdCBleGlzdHMgb24gbnVtYmVyW11cbiAgICAgICAgICAgIHJldHVybiBzcGxpdHMubGVuZ3RoICYmIHNwbGl0c1swXSA8IHBvcy5jb2x1bW4gPyBzcGxpdHNbJ2luZGVudCddIDogMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgcG9zaXRpb24gKG9uIHNjcmVlbikgZm9yIHRoZSBsYXN0IGNoYXJhY3RlciBpbiB0aGUgcHJvdmlkZWQgc2NyZWVuIHJvdy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2NyZWVuTGFzdFJvd0NvbHVtblxuICAgICAqIEBwYXJhbSBzY3JlZW5Sb3cge251bWJlcn0gVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICpcbiAgICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uXG4gICAgICovXG4gICAgcHVibGljIGdldFNjcmVlbkxhc3RSb3dDb2x1bW4oc2NyZWVuUm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICB2YXIgcG9zID0gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBOdW1iZXIuTUFYX1ZBTFVFKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlbkNvbHVtbihwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGNvbHVtbiBwb3NpdGlvbiBvZiB0aGUgbGFzdCBzY3JlZW4gcm93LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXREb2N1bWVudExhc3RSb3dDb2x1bW5cbiAgICAgKiBAcGFyYW0gZG9jUm93IHtudW1iZXJ9XG4gICAgICogQHBhcmFtIGRvY0NvbHVtbiB7bnVtYmVyfVxuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uKGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBkb2N1bWVudCBwb3NpdGlvbiBvZiB0aGUgbGFzdCByb3cuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldERvY3VtZW50TGFzdFJvd0NvbHVtblBvc2l0aW9uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogUG9zaXRpb24ge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSAvIDEwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3IgdGhlIGdpdmVuIHJvdywgdGhpcyByZXR1cm5zIHRoZSBzcGxpdCBkYXRhLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRSb3dTcGxpdERhdGFcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7U3RyaW5nfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRSb3dTcGxpdERhdGEocm93OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBkaXN0YW5jZSB0byB0aGUgbmV4dCB0YWIgc3RvcCBhdCB0aGUgc3BlY2lmaWVkIHNjcmVlbiBjb2x1bW4uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFNjcmVlblRhYlNpemVcbiAgICAgKiBAcGFyYW0gc2NyZWVuQ29sdW1uIHtudW1iZXJ9IFRoZSBzY3JlZW4gY29sdW1uIHRvIGNoZWNrLlxuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0YWJTaXplIC0gc2NyZWVuQ29sdW1uICUgdGhpcy4kdGFiU2l6ZTtcbiAgICB9XG5cblxuICAgIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50Um93KHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikucm93O1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBzY3JlZW5Ub0RvY3VtZW50Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikuY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENvbnZlcnRzIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgb24gdGhlIHNjcmVlbiB0byBjaGFyYWN0ZXJzIGNvb3JkaW5hdGVzIHdpdGhpbiB0aGUgZG9jdW1lbnQuXG4gICAgICogVGhpcyB0YWtlcyBpbnRvIGFjY291bnQgY29kZSBmb2xkaW5nLCB3b3JkIHdyYXAsIHRhYiBzaXplLCBhbmQgYW55IG90aGVyIHZpc3VhbCBtb2RpZmljYXRpb25zLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzY3JlZW5Ub0RvY3VtZW50UG9zaXRpb25cbiAgICAgKiBAcGFyYW0ge251bWJlcn0gc2NyZWVuUm93IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNjcmVlbkNvbHVtbiBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVja1xuICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIG9iamVjdCByZXR1cm5lZCBoYXMgdHdvIHByb3BlcnRpZXM6IGByb3dgIGFuZCBgY29sdW1uYC5cbiAgICAgKi9cbiAgICBwdWJsaWMgc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IFBvc2l0aW9uIHtcbiAgICAgICAgaWYgKHNjcmVlblJvdyA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiB7IHJvdzogMCwgY29sdW1uOiAwIH07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgdmFyIGRvY1JvdyA9IDA7XG4gICAgICAgIHZhciBkb2NDb2x1bW4gPSAwO1xuICAgICAgICB2YXIgY29sdW1uO1xuICAgICAgICB2YXIgcm93ID0gMDtcbiAgICAgICAgdmFyIHJvd0xlbmd0aCA9IDA7XG5cbiAgICAgICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kc2NyZWVuUm93Q2FjaGU7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgc2NyZWVuUm93KTtcbiAgICAgICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvY1JvdyA9IHRoaXMuJGRvY1Jvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSBzY3JlZW5Sb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1heFJvdyA9IHRoaXMuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShkb2NSb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAocm93IDw9IHNjcmVlblJvdykge1xuICAgICAgICAgICAgcm93TGVuZ3RoID0gdGhpcy5nZXRSb3dMZW5ndGgoZG9jUm93KTtcbiAgICAgICAgICAgIGlmIChyb3cgKyByb3dMZW5ndGggPiBzY3JlZW5Sb3cgfHwgZG9jUm93ID49IG1heFJvdykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByb3cgKz0gcm93TGVuZ3RoO1xuICAgICAgICAgICAgICAgIGRvY1JvdysrO1xuICAgICAgICAgICAgICAgIGlmIChkb2NSb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jUm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZG9DYWNoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnB1c2goZG9jUm93KTtcbiAgICAgICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZm9sZExpbmUgJiYgZm9sZExpbmUuc3RhcnQucm93IDw9IGRvY1Jvdykge1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lKTtcbiAgICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfSBlbHNlIGlmIChyb3cgKyByb3dMZW5ndGggPD0gc2NyZWVuUm93IHx8IGRvY1JvdyA+IG1heFJvdykge1xuICAgICAgICAgICAgLy8gY2xpcCBhdCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICByb3c6IG1heFJvdyxcbiAgICAgICAgICAgICAgICBjb2x1bW46IHRoaXMuZ2V0TGluZShtYXhSb3cpLmxlbmd0aFxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0TGluZShkb2NSb3cpO1xuICAgICAgICAgICAgZm9sZExpbmUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbZG9jUm93XTtcbiAgICAgICAgICAgIGlmIChzcGxpdHMpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BsaXRJbmRleCA9IE1hdGguZmxvb3Ioc2NyZWVuUm93IC0gcm93KTtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSBzcGxpdHNbc3BsaXRJbmRleF07XG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0SW5kZXggPiAwICYmIHNwbGl0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jQ29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXggLSAxXSB8fCBzcGxpdHNbc3BsaXRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHJpbmcoZG9jQ29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBkb2NDb2x1bW4gKz0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZSwgc2NyZWVuQ29sdW1uKVsxXTtcblxuICAgICAgICAvLyBXZSByZW1vdmUgb25lIGNoYXJhY3RlciBhdCB0aGUgZW5kIHNvIHRoYXQgdGhlIGRvY0NvbHVtblxuICAgICAgICAvLyBwb3NpdGlvbiByZXR1cm5lZCBpcyBub3QgYXNzb2NpYXRlZCB0byB0aGUgbmV4dCByb3cgb24gdGhlIHNjcmVlbi5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlICYmIGRvY0NvbHVtbiA+PSBjb2x1bW4pXG4gICAgICAgICAgICBkb2NDb2x1bW4gPSBjb2x1bW4gLSAxO1xuXG4gICAgICAgIGlmIChmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBmb2xkTGluZS5pZHhUb1Bvc2l0aW9uKGRvY0NvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiBkb2NSb3csIGNvbHVtbjogZG9jQ29sdW1uIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ29udmVydHMgZG9jdW1lbnQgY29vcmRpbmF0ZXMgdG8gc2NyZWVuIGNvb3JkaW5hdGVzLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBkb2N1bWVudFRvU2NyZWVuUG9zaXRpb25cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93IFRoZSBkb2N1bWVudCByb3cgdG8gY2hlY2tcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uIFRoZSBkb2N1bWVudCBjb2x1bW4gdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn0gVGhlIG9iamVjdCByZXR1cm5lZCBieSB0aGlzIG1ldGhvZCBoYXMgdHdvIHByb3BlcnRpZXM6IGByb3dgIGFuZCBgY29sdW1uYC5cbiAgICAgKi9cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IFBvc2l0aW9uIHtcbiAgICAgICAgdmFyIHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSBwYXNzZWQgaW4gYXJndW1lbnRzLlxuICAgICAgICBpZiAodHlwZW9mIGRvY0NvbHVtbiA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChkb2NSb3dbJ3JvdyddLCBkb2NSb3dbJ2NvbHVtbiddKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgICAgIGFzc2VydCh0eXBlb2YgZG9jQ29sdW1uID09PSAnbnVtYmVyJywgXCJkb2NDb2x1bW4gbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9jUm93ID0gcG9zLnJvdztcbiAgICAgICAgZG9jQ29sdW1uID0gcG9zLmNvbHVtbjtcbiAgICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NSb3cgPT09ICdudW1iZXInLCBcImRvY1JvdyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG5cbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IDA7XG4gICAgICAgIHZhciBmb2xkU3RhcnRSb3cgPSBudWxsO1xuICAgICAgICB2YXIgZm9sZCA9IG51bGw7XG5cbiAgICAgICAgLy8gQ2xhbXAgdGhlIGRvY1JvdyBwb3NpdGlvbiBpbiBjYXNlIGl0J3MgaW5zaWRlIG9mIGEgZm9sZGVkIGJsb2NrLlxuICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQoZG9jUm93LCBkb2NDb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgZG9jUm93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgICAgICBkb2NDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByb3dFbmQsIHJvdyA9IDA7XG5cbiAgICAgICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kZG9jUm93Q2FjaGU7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgZG9jUm93KTtcbiAgICAgICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuJHNjcmVlblJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSBkb2NSb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHJvdyA8IGRvY1Jvdykge1xuICAgICAgICAgICAgaWYgKHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3dFbmQgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBpZiAocm93RW5kID4gZG9jUm93KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvd0VuZCwgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByb3dFbmQgPSByb3cgKyAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzY3JlZW5Sb3cgKz0gdGhpcy5nZXRSb3dMZW5ndGgocm93KTtcbiAgICAgICAgICAgIHJvdyA9IHJvd0VuZDtcblxuICAgICAgICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChzY3JlZW5Sb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSB0ZXh0IGxpbmUgdGhhdCBpcyBkaXNwbGF5ZWQgaW4gZG9jUm93IG9uIHRoZSBzY3JlZW4uXG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBmaW5hbCByb3cgd2Ugd2FudCB0byByZWFjaCBpcyBpbnNpZGUgb2YgYSBmb2xkLlxuICAgICAgICBpZiAoZm9sZExpbmUgJiYgcm93ID49IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgdGV4dExpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSwgZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICAgICAgZm9sZFN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGV4dExpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KS5zdWJzdHJpbmcoMCwgZG9jQ29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRTdGFydFJvdyA9IGRvY1JvdztcbiAgICAgICAgfVxuICAgICAgICAvLyBDbGFtcCB0ZXh0TGluZSBpZiBpbiB3cmFwTW9kZS5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgd3JhcFJvdyA9IHRoaXMuJHdyYXBEYXRhW2ZvbGRTdGFydFJvd107XG4gICAgICAgICAgICBpZiAod3JhcFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzY3JlZW5Sb3dPZmZzZXQgPSAwO1xuICAgICAgICAgICAgICAgIHdoaWxlICh0ZXh0TGluZS5sZW5ndGggPj0gd3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlblJvdysrO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Sb3dPZmZzZXQrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGV4dExpbmUgPSB0ZXh0TGluZS5zdWJzdHJpbmcod3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXQgLSAxXSB8fCAwLCB0ZXh0TGluZS5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJvdzogc2NyZWVuUm93LFxuICAgICAgICAgICAgY29sdW1uOiB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCh0ZXh0TGluZSlbMF1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCByZXR1cm5zIHRoZSBzY3JlZW4gY29sdW1uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBkb2N1bWVudFRvU2NyZWVuQ29sdW1uXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAgKiBAcmV0dXJuIHtOdW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Db2x1bW4oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKS5jb2x1bW47XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgcmV0dXJucyB0aGUgc2NyZWVuIHJvdy5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZG9jdW1lbnRUb1NjcmVlblJvd1xuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgICogQHJldHVybiB7bnVtYmVyfVxuICAgICAqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikucm93O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZG9jdW1lbnRUb1NjcmVlblJhbmdlXG4gICAgICogQHBhcmFtIHJhbmdlIHtSYW5nZX1cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblJhbmdlKHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICAgICAgdmFyIHNjcmVlblBvc1N0YXJ0ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24ocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICB2YXIgc2NyZWVuUG9zRW5kID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24ocmFuZ2UuZW5kLnJvdywgcmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgIHJldHVybiBuZXcgUmFuZ2Uoc2NyZWVuUG9zU3RhcnQucm93LCBzY3JlZW5Qb3NTdGFydC5jb2x1bW4sIHNjcmVlblBvc0VuZC5yb3csIHNjcmVlblBvc0VuZC5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgc2NyZWVuLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRTY3JlZW5MZW5ndGhcbiAgICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAgICovXG4gICAgcHVibGljIGdldFNjcmVlbkxlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICB2YXIgc2NyZWVuUm93cyA9IDA7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkTGluZSA9IG51bGw7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHNjcmVlblJvd3MgPSB0aGlzLmdldExlbmd0aCgpO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGZvbGRlZCBsaW5lcyBhZ2Fpbi5cbiAgICAgICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgICAgICBzY3JlZW5Sb3dzIC09IGZvbGQuZW5kLnJvdyAtIGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiR3cmFwRGF0YS5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgcm93ID0gMCwgaSA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgICAgIHdoaWxlIChyb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgICAgICAgICAgc2NyZWVuUm93cyArPSBzcGxpdHMgPyBzcGxpdHMubGVuZ3RoICsgMSA6IDE7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBmb2xkLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdG9kb1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cykge1xuICAgICAgICAgICAgc2NyZWVuUm93cyArPSB0aGlzLiRnZXRXaWRnZXRTY3JlZW5MZW5ndGgoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzY3JlZW5Sb3dzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHVibGljICRzZXRGb250TWV0cmljcyhmbTogRm9udE1ldHJpY3MpIHtcbiAgICAgICAgLy8gVE9ETz9cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGZpbmRNYXRjaGluZ0JyYWNrZXRcbiAgICAgKiBAcGFyYW0gcG9zaXRpb24ge1Bvc2l0aW9ufVxuICAgICAqIEBwYXJhbSBbY2hyXSB7c3RyaW5nfVxuICAgICAqIEByZXR1cm4ge1Bvc2l0aW9ufVxuICAgICAqL1xuICAgIGZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb246IFBvc2l0aW9uLCBjaHI/OiBzdHJpbmcpOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5maW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uLCBjaHIpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0QnJhY2tldFJhbmdlXG4gICAgICogQHBhcmFtIHBvc2l0aW9uIHtQb3NpdGlvbn1cbiAgICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAgKi9cbiAgICBnZXRCcmFja2V0UmFuZ2UocG9zaXRpb246IFBvc2l0aW9uKTogUmFuZ2Uge1xuICAgICAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGZpbmRPcGVuaW5nQnJhY2tldFxuICAgICAqIEBwYXJhbSBicmFja2V0IHtzdHJpbmd9XG4gICAgICogQHBhcmFtIHBvc2l0aW9uIHtQb3NpdGlvbn1cbiAgICAgKiBAcGFyYW0gW3R5cGVSZV0ge1JlZ0V4cH1cbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn1cbiAgICAgKi9cbiAgICBmaW5kT3BlbmluZ0JyYWNrZXQoYnJhY2tldDogc3RyaW5nLCBwb3NpdGlvbjogUG9zaXRpb24sIHR5cGVSZT86IFJlZ0V4cCk6IFBvc2l0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLmZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGZpbmRDbG9zaW5nQnJhY2tldFxuICAgICAqIEBwYXJhbSBicmFja2V0IHtzdHJpbmd9XG4gICAgICogQHBhcmFtIHBvc2l0aW9uIHtQb3NpdGlvbn1cbiAgICAgKiBAcGFyYW0gW3R5cGVSZV0ge1JlZ0V4cH1cbiAgICAgKiBAcmV0dXJuIHtQb3NpdGlvbn1cbiAgICAgKi9cbiAgICBmaW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldDogc3RyaW5nLCBwb3NpdGlvbjogUG9zaXRpb24sIHR5cGVSZT86IFJlZ0V4cCk6IFBvc2l0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLmZpbmRDbG9zaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRmb2xkTW9kZTogRm9sZE1vZGU7XG5cbiAgICAvLyBzdHJ1Y3R1cmVkIGZvbGRpbmdcbiAgICAkZm9sZFN0eWxlcyA9IHtcbiAgICAgICAgXCJtYW51YWxcIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5cIjogMSxcbiAgICAgICAgXCJtYXJrYmVnaW5lbmRcIjogMVxuICAgIH1cbiAgICAkZm9sZFN0eWxlID0gXCJtYXJrYmVnaW5cIjtcblxuICAgIC8qXG4gICAgICogTG9va3MgdXAgYSBmb2xkIGF0IGEgZ2l2ZW4gcm93L2NvbHVtbi4gUG9zc2libGUgdmFsdWVzIGZvciBzaWRlOlxuICAgICAqICAgLTE6IGlnbm9yZSBhIGZvbGQgaWYgZm9sZC5zdGFydCA9IHJvdy9jb2x1bW5cbiAgICAgKiAgICsxOiBpZ25vcmUgYSBmb2xkIGlmIGZvbGQuZW5kID0gcm93L2NvbHVtblxuICAgICAqXG4gICAgICogQG1ldGhvZCBnZXRGb2xkQXRcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9XG4gICAgICogQHBhcmFtIGNvbHVtbiB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBbc2lkZV0ge251bWJlcn1cbiAgICAgKiBAcmV0dXJuIHtGb2xkfVxuICAgICAqL1xuICAgIGdldEZvbGRBdChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHNpZGU/OiBudW1iZXIpOiBGb2xkIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuICAgICAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHM7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkID0gZm9sZHNbaV07XG4gICAgICAgICAgICBpZiAoZm9sZC5yYW5nZS5jb250YWlucyhyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICAgICAgICBpZiAoc2lkZSA9PT0gMSAmJiBmb2xkLnJhbmdlLmlzRW5kKHJvdywgY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2lkZSA9PT0gLTEgJiYgZm9sZC5yYW5nZS5pc1N0YXJ0KHJvdywgY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybnMgYWxsIGZvbGRzIGluIHRoZSBnaXZlbiByYW5nZS4gTm90ZSwgdGhhdCB0aGlzIHdpbGwgcmV0dXJuIGZvbGRzXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEZvbGRzSW5SYW5nZVxuICAgICAqIEBwYXJhbSByYW5nZSB7UmFuZ2V9XG4gICAgICogQHJldHVybiB7Rm9sZFtdfVxuICAgICAqL1xuICAgIGdldEZvbGRzSW5SYW5nZShyYW5nZTogUmFuZ2UpOiBGb2xkW10ge1xuICAgICAgICB2YXIgc3RhcnQgPSByYW5nZS5zdGFydDtcbiAgICAgICAgdmFyIGVuZCA9IHJhbmdlLmVuZDtcbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgZm91bmRGb2xkczogRm9sZFtdID0gW107XG5cbiAgICAgICAgc3RhcnQuY29sdW1uICs9IDE7XG4gICAgICAgIGVuZC5jb2x1bW4gLT0gMTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGRMaW5lc1tpXS5yYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgaWYgKGNtcCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgLy8gUmFuZ2UgaXMgYmVmb3JlIGZvbGRMaW5lLiBObyBpbnRlcnNlY3Rpb24uIFRoaXMgbWVhbnMsXG4gICAgICAgICAgICAgICAgLy8gdGhlcmUgbWlnaHQgYmUgb3RoZXIgZm9sZExpbmVzIHRoYXQgaW50ZXJzZWN0LlxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wID09IC0yKSB7XG4gICAgICAgICAgICAgICAgLy8gUmFuZ2UgaXMgYWZ0ZXIgZm9sZExpbmUuIFRoZXJlIGNhbid0IGJlIGFueSBvdGhlciBmb2xkTGluZXMgdGhlbixcbiAgICAgICAgICAgICAgICAvLyBzbyBsZXQncyBnaXZlIHVwLlxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZXNbaV0uZm9sZHM7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGZvbGRzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGZvbGQgPSBmb2xkc1tqXTtcbiAgICAgICAgICAgICAgICBjbXAgPSBmb2xkLnJhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAtMikge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNtcCA9PSAyKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBXVEYtc3RhdGU6IENhbiBoYXBwZW4gZHVlIHRvIC0xLysxIHRvIHN0YXJ0L2VuZCBjb2x1bW4uXG4gICAgICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gNDIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZm91bmRGb2xkcy5wdXNoKGZvbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHN0YXJ0LmNvbHVtbiAtPSAxO1xuICAgICAgICBlbmQuY29sdW1uICs9IDE7XG5cbiAgICAgICAgcmV0dXJuIGZvdW5kRm9sZHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCBnZXRGb2xkc0luUmFuZ2VMaXN0XG4gICAgICovXG4gICAgZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZXMpOiBGb2xkW10ge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyYW5nZXMpKSB7XG4gICAgICAgICAgICB2YXIgZm9sZHM6IEZvbGRbXSA9IFtdO1xuICAgICAgICAgICAgcmFuZ2VzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgICAgICBmb2xkcyA9IGZvbGRzLmNvbmNhdCh0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZSkpO1xuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG4gICAgXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhbGwgZm9sZHMgaW4gdGhlIGRvY3VtZW50XG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldEFsbEZvbGRzXG4gICAgICogQHJldHVybiB7Rm9sZFtdfVxuICAgICAqL1xuICAgIGdldEFsbEZvbGRzKCk6IEZvbGRbXSB7XG4gICAgICAgIHZhciBmb2xkcyA9IFtdO1xuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZXMubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGZvbGRMaW5lc1tpXS5mb2xkcy5sZW5ndGg7IGorKylcbiAgICAgICAgICAgICAgICBmb2xkcy5wdXNoKGZvbGRMaW5lc1tpXS5mb2xkc1tqXSk7XG5cbiAgICAgICAgcmV0dXJuIGZvbGRzO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogUmV0dXJucyB0aGUgc3RyaW5nIGJldHdlZW4gZm9sZHMgYXQgdGhlIGdpdmVuIHBvc2l0aW9uLlxuICAgICAqIEUuZy5cbiAgICAgKiAgZm9vPGZvbGQ+Ynxhcjxmb2xkPndvbHJkIC0+IFwiYmFyXCJcbiAgICAgKiAgZm9vPGZvbGQ+YmFyPGZvbGQ+d29sfHJkIC0+IFwid29ybGRcIlxuICAgICAqICBmb288Zm9sZD5iYXI8Zm98bGQ+d29scmQgLT4gPG51bGw+XG4gICAgICpcbiAgICAgKiB3aGVyZSB8IG1lYW5zIHRoZSBwb3NpdGlvbiBvZiByb3cvY29sdW1uXG4gICAgICpcbiAgICAgKiBUaGUgdHJpbSBvcHRpb24gZGV0ZXJtcyBpZiB0aGUgcmV0dXJuIHN0cmluZyBzaG91bGQgYmUgdHJpbWVkIGFjY29yZGluZ1xuICAgICAqIHRvIHRoZSBcInNpZGVcIiBwYXNzZWQgd2l0aCB0aGUgdHJpbSB2YWx1ZTpcbiAgICAgKlxuICAgICAqIEUuZy5cbiAgICAgKiAgZm9vPGZvbGQ+Ynxhcjxmb2xkPndvbHJkIC10cmltPS0xPiBcImJcIlxuICAgICAqICBmb288Zm9sZD5iYXI8Zm9sZD53b2x8cmQgLXRyaW09KzE+IFwicmxkXCJcbiAgICAgKiAgZm98bzxmb2xkPmJhcjxmb2xkPndvbHJkIC10cmltPTAwPiBcImZvb1wiXG4gICAgICovXG4gICAgZ2V0Rm9sZFN0cmluZ0F0KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgdHJpbTogbnVtYmVyLCBmb2xkTGluZT86IEZvbGRMaW5lKTogc3RyaW5nIHtcbiAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZSB8fCB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIGlmICghZm9sZExpbmUpXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcblxuICAgICAgICB2YXIgbGFzdEZvbGQgPSB7XG4gICAgICAgICAgICBlbmQ6IHsgY29sdW1uOiAwIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gVE9ETzogUmVmYWN0b3IgdG8gdXNlIGdldE5leHRGb2xkVG8gZnVuY3Rpb24uXG4gICAgICAgIHZhciBzdHI6IHN0cmluZztcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmUuZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZvbGQgPSBmb2xkTGluZS5mb2xkc1tpXTtcbiAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkLnJhbmdlLmNvbXBhcmVFbmQocm93LCBjb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgIHN0ciA9IHRoaXMuZ2V0TGluZShmb2xkLnN0YXJ0LnJvdykuc3Vic3RyaW5nKGxhc3RGb2xkLmVuZC5jb2x1bW4sIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGFzdEZvbGQgPSBmb2xkO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc3RyKVxuICAgICAgICAgICAgc3RyID0gdGhpcy5nZXRMaW5lKGZvbGQuc3RhcnQucm93KS5zdWJzdHJpbmcobGFzdEZvbGQuZW5kLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKHRyaW0gPT0gLTEpXG4gICAgICAgICAgICByZXR1cm4gc3RyLnN1YnN0cmluZygwLCBjb2x1bW4gLSBsYXN0Rm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgZWxzZSBpZiAodHJpbSA9PSAxKVxuICAgICAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZExpbmUoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZExpbmU/OiBGb2xkTGluZSk6IEZvbGRMaW5lIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZExpbmUpXG4gICAgICAgICAgICBpID0gZm9sZERhdGEuaW5kZXhPZihzdGFydEZvbGRMaW5lKTtcbiAgICAgICAgaWYgKGkgPT0gLTEpXG4gICAgICAgICAgICBpID0gMDtcbiAgICAgICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cgJiYgZm9sZExpbmUuZW5kLnJvdyA+PSBkb2NSb3cpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPiBkb2NSb3cpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIHRoZSBmb2xkIHdoaWNoIHN0YXJ0cyBhZnRlciBvciBjb250YWlucyBkb2NSb3dcbiAgICBnZXROZXh0Rm9sZExpbmUoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZExpbmU/OiBGb2xkTGluZSk6IEZvbGRMaW5lIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZExpbmUpXG4gICAgICAgICAgICBpID0gZm9sZERhdGEuaW5kZXhPZihzdGFydEZvbGRMaW5lKTtcbiAgICAgICAgaWYgKGkgPT0gLTEpXG4gICAgICAgICAgICBpID0gMDtcbiAgICAgICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGdldEZvbGRlZFJvd0NvdW50KGZpcnN0OiBudW1iZXIsIGxhc3Q6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgcm93Q291bnQgPSBsYXN0IC0gZmlyc3QgKyAxO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXSxcbiAgICAgICAgICAgICAgICBlbmQgPSBmb2xkTGluZS5lbmQucm93LFxuICAgICAgICAgICAgICAgIHN0YXJ0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgaWYgKGVuZCA+PSBsYXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0IDwgbGFzdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpXG4gICAgICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBsYXN0IC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvd0NvdW50ID0gMDsvL2luIG9uZSBmb2xkXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlbmQgPj0gZmlyc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpIC8vZm9sZCBpbnNpZGUgcmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gZW5kIC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBlbmQgLSBmaXJzdCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJvd0NvdW50O1xuICAgIH1cblxuICAgIHByaXZhdGUgJGFkZEZvbGRMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSkge1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS5wdXNoKGZvbGRMaW5lKTtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgICByZXR1cm4gYS5zdGFydC5yb3cgLSBiLnN0YXJ0LnJvdztcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgbmV3IGZvbGQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJuXG4gICAgICogICAgICBUaGUgbmV3IGNyZWF0ZWQgRm9sZCBvYmplY3Qgb3IgYW4gZXhpc3RpbmcgZm9sZCBvYmplY3QgaW4gY2FzZSB0aGVcbiAgICAgKiAgICAgIHBhc3NlZCBpbiByYW5nZSBmaXRzIGFuIGV4aXN0aW5nIGZvbGQgZXhhY3RseS5cbiAgICAgKi9cbiAgICBhZGRGb2xkKHBsYWNlaG9sZGVyOiBzdHJpbmcgfCBGb2xkLCByYW5nZTogUmFuZ2UpOiBGb2xkIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBhZGRlZCA9IGZhbHNlO1xuICAgICAgICB2YXIgZm9sZDogRm9sZDtcblxuICAgICAgICBpZiAocGxhY2Vob2xkZXIgaW5zdGFuY2VvZiBGb2xkKVxuICAgICAgICAgICAgZm9sZCA9IHBsYWNlaG9sZGVyO1xuICAgICAgICBlbHNlIGlmICh0eXBlb2YgcGxhY2Vob2xkZXIgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBmb2xkID0gbmV3IEZvbGQocmFuZ2UsIHBsYWNlaG9sZGVyKTtcbiAgICAgICAgICAgIGZvbGQuY29sbGFwc2VDaGlsZHJlbiA9IHJhbmdlLmNvbGxhcHNlQ2hpbGRyZW47XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJwbGFjZWhvbGRlciBtdXN0IGJlIGEgc3RyaW5nIG9yIGEgRm9sZC5cIik7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRklYTUU6ICRjbGlwUmFuZ2VUb0RvY3VtZW50P1xuICAgICAgICAvLyBmb2xkLnJhbmdlID0gdGhpcy5jbGlwUmFuZ2UoZm9sZC5yYW5nZSk7XG4gICAgICAgIGZvbGQucmFuZ2UgPSB0aGlzLiRjbGlwUmFuZ2VUb0RvY3VtZW50KGZvbGQucmFuZ2UpXG5cbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgIHZhciBzdGFydENvbHVtbiA9IGZvbGQuc3RhcnQuY29sdW1uO1xuICAgICAgICB2YXIgZW5kUm93ID0gZm9sZC5lbmQucm93O1xuICAgICAgICB2YXIgZW5kQ29sdW1uID0gZm9sZC5lbmQuY29sdW1uO1xuXG4gICAgICAgIC8vIC0tLSBTb21lIGNoZWNraW5nIC0tLVxuICAgICAgICBpZiAoIShzdGFydFJvdyA8IGVuZFJvdyB8fFxuICAgICAgICAgICAgc3RhcnRSb3cgPT0gZW5kUm93ICYmIHN0YXJ0Q29sdW1uIDw9IGVuZENvbHVtbiAtIDIpKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHJhbmdlIGhhcyB0byBiZSBhdCBsZWFzdCAyIGNoYXJhY3RlcnMgd2lkdGhcIik7XG5cbiAgICAgICAgdmFyIHN0YXJ0Rm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHN0YXJ0Um93LCBzdGFydENvbHVtbiwgMSk7XG4gICAgICAgIHZhciBlbmRGb2xkID0gdGhpcy5nZXRGb2xkQXQoZW5kUm93LCBlbmRDb2x1bW4sIC0xKTtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZCAmJiBlbmRGb2xkID09IHN0YXJ0Rm9sZClcbiAgICAgICAgICAgIHJldHVybiBzdGFydEZvbGQuYWRkU3ViRm9sZChmb2xkKTtcblxuICAgICAgICBpZiAoXG4gICAgICAgICAgICAoc3RhcnRGb2xkICYmICFzdGFydEZvbGQucmFuZ2UuaXNTdGFydChzdGFydFJvdywgc3RhcnRDb2x1bW4pKVxuICAgICAgICAgICAgfHwgKGVuZEZvbGQgJiYgIWVuZEZvbGQucmFuZ2UuaXNFbmQoZW5kUm93LCBlbmRDb2x1bW4pKVxuICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkEgZm9sZCBjYW4ndCBpbnRlcnNlY3QgYWxyZWFkeSBleGlzdGluZyBmb2xkXCIgKyBmb2xkLnJhbmdlICsgc3RhcnRGb2xkLnJhbmdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZXJlIGFyZSBmb2xkcyBpbiB0aGUgcmFuZ2Ugd2UgY3JlYXRlIHRoZSBuZXcgZm9sZCBmb3IuXG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZvbGQucmFuZ2UpO1xuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gUmVtb3ZlIHRoZSBmb2xkcyBmcm9tIGZvbGQgZGF0YS5cbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMoZm9sZHMpO1xuICAgICAgICAgICAgLy8gQWRkIHRoZSByZW1vdmVkIGZvbGRzIGFzIHN1YmZvbGRzIG9uIHRoZSBuZXcgZm9sZC5cbiAgICAgICAgICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oc3ViRm9sZCkge1xuICAgICAgICAgICAgICAgIGZvbGQuYWRkU3ViRm9sZChzdWJGb2xkKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICBpZiAoZW5kUm93ID09IGZvbGRMaW5lLnN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgYWRkZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc3RhcnRSb3cgPT0gZm9sZExpbmUuZW5kLnJvdykge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgYWRkZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmICghZm9sZC5zYW1lUm93KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHdlIG1pZ2h0IGhhdmUgdG8gbWVyZ2UgdHdvIEZvbGRMaW5lcy5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lTmV4dCA9IGZvbGREYXRhW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lTmV4dCAmJiBmb2xkTGluZU5leHQuc3RhcnQucm93ID09IGVuZFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtZXJnZSFcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLm1lcmdlKGZvbGRMaW5lTmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGVuZFJvdyA8PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghYWRkZWQpXG4gICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuJGFkZEZvbGRMaW5lKG5ldyBGb2xkTGluZSh0aGlzLiRmb2xkRGF0YSwgW2ZvbGRdKSk7XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoZm9sZExpbmUuc3RhcnQucm93LCBmb2xkTGluZS5zdGFydC5yb3cpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShmb2xkTGluZS5zdGFydC5yb3csIGZvbGRMaW5lLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgLy8gTm90aWZ5IHRoYXQgZm9sZCBkYXRhIGhhcyBjaGFuZ2VkLlxuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgICAgICAvKipcbiAgICAgICAgICogQGV2ZW50IGNoYW5nZUZvbGRcbiAgICAgICAgICogQHBhcmFtIGZvbGRFdmVudCB7Rm9sZEV2ZW50fVxuICAgICAgICAgKi9cbiAgICAgICAgdmFyIGZvbGRFdmVudDogRm9sZEV2ZW50ID0geyBkYXRhOiBmb2xkLCBhY3Rpb246IFwiYWRkXCIgfTtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChcImNoYW5nZUZvbGRcIiwgZm9sZEV2ZW50KTtcblxuICAgICAgICByZXR1cm4gZm9sZDtcbiAgICB9XG5cbiAgICBzZXRNb2RpZmllZChtb2RpZmllZDogYm9vbGVhbikge1xuXG4gICAgfVxuXG4gICAgYWRkRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxuXG4gICAgcmVtb3ZlRm9sZChmb2xkOiBGb2xkKTogdm9pZCB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGQuZm9sZExpbmU7XG4gICAgICAgIHZhciBzdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGVuZFJvdyA9IGZvbGRMaW5lLmVuZC5yb3c7XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZS5mb2xkcztcbiAgICAgICAgLy8gU2ltcGxlIGNhc2Ugd2hlcmUgdGhlcmUgaXMgb25seSBvbmUgZm9sZCBpbiB0aGUgRm9sZExpbmUgc3VjaCB0aGF0XG4gICAgICAgIC8vIHRoZSBlbnRpcmUgZm9sZCBsaW5lIGNhbiBnZXQgcmVtb3ZlZCBkaXJlY3RseS5cbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICBmb2xkTGluZXMuc3BsaWNlKGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSwgMSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgdGhlIGxhc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnJhbmdlLmlzRW5kKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKSkge1xuICAgICAgICAgICAgICAgIGZvbGRzLnBvcCgpO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5yb3cgPSBmb2xkc1tmb2xkcy5sZW5ndGggLSAxXS5lbmQucm93O1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5jb2x1bW4gPSBmb2xkc1tmb2xkcy5sZW5ndGggLSAxXS5lbmQuY29sdW1uO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBmb2xkIGlzIHRoZSBmaXJzdCBmb2xkIG9mIHRoZSBmb2xkTGluZSwganVzdCByZW1vdmUgaXQuXG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnJhbmdlLmlzU3RhcnQoZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICBmb2xkcy5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zdGFydC5yb3cgPSBmb2xkc1swXS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnN0YXJ0LmNvbHVtbiA9IGZvbGRzWzBdLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBXZSBrbm93IHRoZXJlIGFyZSBtb3JlIHRoZW4gMiBmb2xkcyBhbmQgdGhlIGZvbGQgaXMgbm90IGF0IHRoZSBlZGdlLlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIG1lYW5zLCB0aGUgZm9sZCBpcyBzb21ld2hlcmUgaW4gYmV0d2Vlbi5cbiAgICAgICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgaW4gb25lIHJvdywgd2UganVzdCBjYW4gcmVtb3ZlIGl0LlxuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZC5zYW1lUm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcy5zcGxpY2UoZm9sZHMuaW5kZXhPZihmb2xkKSwgMSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgZm9sZCBnb2VzIG92ZXIgbW9yZSB0aGVuIG9uZSByb3cuIFRoaXMgbWVhbnMgcmVtdm9pbmcgdGhpcyBmb2xkXG4gICAgICAgICAgICAgICAgICAgIC8vIHdpbGwgY2F1c2UgdGhlIGZvbGQgbGluZSB0byBnZXQgc3BsaXR0ZWQgdXAuIG5ld0ZvbGRMaW5lIGlzIHRoZSBzZWNvbmQgcGFydFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV3Rm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMgPSBuZXdGb2xkTGluZS5mb2xkcztcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdGb2xkTGluZS5zdGFydC5yb3cgPSBmb2xkc1swXS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdGb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJHVwZGF0aW5nKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoc3RhcnRSb3csIGVuZFJvdyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoc3RhcnRSb3csIGVuZFJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIE5vdGlmeSB0aGF0IGZvbGQgZGF0YSBoYXMgY2hhbmdlZC5cbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBldmVudCBjaGFuZ2VGb2xkXG4gICAgICAgICAqIEBwYXJhbSBmb2xkRXZlbnQge0ZvbGRFdmVudH1cbiAgICAgICAgICovXG4gICAgICAgIHZhciBmb2xkRXZlbnQ6IEZvbGRFdmVudCA9IHsgZGF0YTogZm9sZCwgYWN0aW9uOiBcInJlbW92ZVwiIH07XG4gICAgICAgIHRoaXMuZXZlbnRCdXMuX2VtaXQoXCJjaGFuZ2VGb2xkXCIsIGZvbGRFdmVudCk7XG4gICAgfVxuXG4gICAgcmVtb3ZlRm9sZHMoZm9sZHM6IEZvbGRbXSk6IHZvaWQge1xuICAgICAgICAvLyBXZSBuZWVkIHRvIGNsb25lIHRoZSBmb2xkcyBhcnJheSBwYXNzZWQgaW4gYXMgaXQgbWlnaHQgYmUgdGhlIGZvbGRzXG4gICAgICAgIC8vIGFycmF5IG9mIGEgZm9sZCBsaW5lIGFuZCBhcyB3ZSBjYWxsIHRoaXMucmVtb3ZlRm9sZChmb2xkKSwgZm9sZHNcbiAgICAgICAgLy8gYXJlIHJlbW92ZWQgZnJvbSBmb2xkcyBhbmQgY2hhbmdlcyB0aGUgY3VycmVudCBpbmRleC5cbiAgICAgICAgdmFyIGNsb25lRm9sZHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY2xvbmVGb2xkcy5wdXNoKGZvbGRzW2ldKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNsb25lRm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgIH1cblxuICAgIGV4cGFuZEZvbGQoZm9sZDogRm9sZCk6IHZvaWQge1xuICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgIGZvbGQuc3ViRm9sZHMuZm9yRWFjaChmdW5jdGlvbihzdWJGb2xkKSB7XG4gICAgICAgICAgICBmb2xkLnJlc3RvcmVSYW5nZShzdWJGb2xkKTtcbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChzdWJGb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIGlmIChmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPiAwKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwoZm9sZC5zdGFydC5yb3cgKyAxLCBmb2xkLmVuZC5yb3csIGZvbGQuY29sbGFwc2VDaGlsZHJlbiAtIDEpO1xuICAgICAgICB9XG4gICAgICAgIGZvbGQuc3ViRm9sZHMgPSBbXTtcbiAgICB9XG5cbiAgICBleHBhbmRGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIHVuZm9sZFxuICAgICAqIEBwYXJhbSBbbG9jYXRpb25dIHtudW1iZXIgfCBQb3NpdGlvbiB8IFJhbmdlfVxuICAgICAqIEBwYXJhbSBbZXhwYW5kSW5uZXJdIHtib29sZWFufVxuICAgICAqIEByZXR1cm4ge0ZvbGRbXX1cbiAgICAgKi9cbiAgICB1bmZvbGQobG9jYXRpb24/OiBudW1iZXIgfCBQb3NpdGlvbiB8IFJhbmdlLCBleHBhbmRJbm5lcj86IGJvb2xlYW4pOiBGb2xkW10ge1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICB2YXIgZm9sZHM6IEZvbGRbXTtcbiAgICAgICAgLy8gRklYTUU6IE5vdCBoYW5kbGluZyB1bmRlZmluZWQuXG4gICAgICAgIGlmIChsb2NhdGlvbiA9PSBudWxsKSB7XG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCB0aGlzLmdldExlbmd0aCgpLCAwKTtcbiAgICAgICAgICAgIGV4cGFuZElubmVyID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0eXBlb2YgbG9jYXRpb24gPT09IFwibnVtYmVyXCIpXG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZShsb2NhdGlvbiwgMCwgbG9jYXRpb24sIHRoaXMuZ2V0TGluZShsb2NhdGlvbikubGVuZ3RoKTtcbiAgICAgICAgZWxzZSBpZiAoXCJyb3dcIiBpbiBsb2NhdGlvbilcbiAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyg8UG9zaXRpb24+bG9jYXRpb24sIDxQb3NpdGlvbj5sb2NhdGlvbik7XG4gICAgICAgIGVsc2UgaWYgKGxvY2F0aW9uIGluc3RhbmNlb2YgUmFuZ2UpIHtcbiAgICAgICAgICAgIHJhbmdlID0gbG9jYXRpb247XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcihcImxvY2F0aW9uIG11c3QgYmUgb25lIG9mIG51bWJlciB8IFBvc2l0aW9uIHwgUmFuZ2VcIik7XG4gICAgICAgIH1cblxuICAgICAgICBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgIGlmIChleHBhbmRJbm5lcikge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhmb2xkcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgc3ViRm9sZHMgPSBmb2xkcztcbiAgICAgICAgICAgIC8vIFRPRE86IG1pZ2h0IGJlIGJldHRlciB0byByZW1vdmUgYW5kIGFkZCBmb2xkcyBpbiBvbmUgZ28gaW5zdGVhZCBvZiB1c2luZ1xuICAgICAgICAgICAgLy8gZXhwYW5kRm9sZHMgc2V2ZXJhbCB0aW1lcy5cbiAgICAgICAgICAgIHdoaWxlIChzdWJGb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKHN1YkZvbGRzKTtcbiAgICAgICAgICAgICAgICBzdWJGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIENoZWNrcyBpZiBhIGdpdmVuIGRvY3VtZW50Um93IGlzIGZvbGRlZC4gVGhpcyBpcyB0cnVlIGlmIHRoZXJlIGFyZSBzb21lXG4gICAgICogZm9sZGVkIHBhcnRzIHN1Y2ggdGhhdCBzb21lIHBhcnRzIG9mIHRoZSBsaW5lIGlzIHN0aWxsIHZpc2libGUuXG4gICAgICoqL1xuICAgIGlzUm93Rm9sZGVkKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c6IEZvbGRMaW5lKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgIH1cblxuICAgIGdldFJvd0ZvbGRFbmQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdz86IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLmVuZC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Um93Rm9sZFN0YXJ0KGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c/OiBGb2xkTGluZSk6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgICAgICByZXR1cm4gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSwgZW5kUm93PzogbnVtYmVyLCBlbmRDb2x1bW4/OiBudW1iZXIsIHN0YXJ0Um93PzogbnVtYmVyLCBzdGFydENvbHVtbj86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGlmIChzdGFydFJvdyA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIGlmIChzdGFydENvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRDb2x1bW4gPSAwO1xuICAgICAgICBpZiAoZW5kUm93ID09IG51bGwpXG4gICAgICAgICAgICBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICBpZiAoZW5kQ29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmUoZW5kUm93KS5sZW5ndGg7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSB0ZXh0bGluZSB1c2luZyB0aGUgRm9sZExpbmUgd2Fsa2VyLlxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG5cbiAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlcjogc3RyaW5nLCByb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGxhc3RDb2x1bW46IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHJvdyA8IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmIChyb3cgPT0gc3RhcnRSb3cpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uIDwgc3RhcnRDb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBsYXN0Q29sdW1uID0gTWF0aC5tYXgoc3RhcnRDb2x1bW4sIGxhc3RDb2x1bW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRleHRMaW5lICs9IHBsYWNlaG9sZGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0ZXh0TGluZSArPSBzZWxmLmdldExpbmUocm93KS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZW5kUm93LCBlbmRDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGV4dExpbmU7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUxpbmUocm93OiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBzdGFydFJvdzogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuXG4gICAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBsaW5lOiBzdHJpbmc7XG4gICAgICAgICAgICBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5zdWJzdHJpbmcoc3RhcnRDb2x1bW4gfHwgMCwgZW5kQ29sdW1uIHx8IGxpbmUubGVuZ3RoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldEZvbGREaXNwbGF5TGluZShcbiAgICAgICAgICAgICAgICBmb2xkTGluZSwgcm93LCBlbmRDb2x1bW4sIHN0YXJ0Um93LCBzdGFydENvbHVtbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRjbG9uZUZvbGREYXRhKCkge1xuICAgICAgICB2YXIgZmQgPSBbXTtcbiAgICAgICAgZmQgPSB0aGlzLiRmb2xkRGF0YS5tYXAoZnVuY3Rpb24oZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzLm1hcChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQuY2xvbmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIG5ldyBGb2xkTGluZShmZCwgZm9sZHMpO1xuICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gZmQ7XG4gICAgfVxuXG4gICAgdG9nZ2xlRm9sZCh0cnlUb1VuZm9sZDogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB2YXIgc2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBzZWxlY3Rpb24uZ2V0UmFuZ2UoKTtcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG4gICAgICAgIHZhciBicmFja2V0UG9zOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuXG4gICAgICAgIGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcbiAgICAgICAgICAgIHZhciBjdXJzb3IgPSByYW5nZS5zdGFydDtcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKTtcblxuICAgICAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KGN1cnNvcikpIHtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZVBvaW50KGJyYWNrZXRQb3MpID09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5lbmQuY29sdW1uLS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KHsgcm93OiBjdXJzb3Iucm93LCBjb2x1bW46IGN1cnNvci5jb2x1bW4gKyAxIH0pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PT0gMSlcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0ID0gYnJhY2tldFBvcztcblxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByYW5nZSA9IHRoaXMuZ2V0Q29tbWVudEZvbGRSYW5nZShjdXJzb3Iucm93LCBjdXJzb3IuY29sdW1uKSB8fCByYW5nZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmICh0cnlUb1VuZm9sZCAmJiBmb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZm9sZClcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG5cbiAgICAgICAgaWYgKGZvbGQgJiYgZm9sZC5yYW5nZS50b1N0cmluZygpID09IHJhbmdlLnRvU3RyaW5nKCkpIHtcbiAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwbGFjZWhvbGRlciA9IFwiLi4uXCI7XG4gICAgICAgIGlmICghcmFuZ2UuaXNNdWx0aUxpbmUoKSkge1xuICAgICAgICAgICAgcGxhY2Vob2xkZXIgPSB0aGlzLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIubGVuZ3RoIDwgNClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyLnRyaW0oKS5zdWJzdHJpbmcoMCwgMikgKyBcIi4uXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmFkZEZvbGQocGxhY2Vob2xkZXIsIHJhbmdlKTtcbiAgICB9XG5cbiAgICBnZXRDb21tZW50Rm9sZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgZGlyPzogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG4gICAgICAgIHZhciB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICBpZiAodG9rZW4gJiYgL15jb21tZW50fHN0cmluZy8udGVzdCh0b2tlbi50eXBlKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cCh0b2tlbi50eXBlLnJlcGxhY2UoL1xcLi4qLywgXCJcXFxcLlwiKSk7XG4gICAgICAgICAgICBpZiAoZGlyICE9IDEpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgICAgICAgICAgaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCk7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIDI7XG5cbiAgICAgICAgICAgIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcywgcm93LCBjb2x1bW4pO1xuXG4gICAgICAgICAgICBpZiAoZGlyICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG5cbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIHRva2VuLnZhbHVlLmxlbmd0aCAtIDI7XG4gICAgICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAbWV0aG9kIGZvbGRBbGxcbiAgICAgKiBAcGFyYW0gW3N0YXJ0Um93XSB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBbZW5kUm93XSB7bnVtYmVyfVxuICAgICAqIEBwYXJhbSBbZGVwdGhdIHtudW1iZXJ9XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBmb2xkQWxsKHN0YXJ0Um93PzogbnVtYmVyLCBlbmRSb3c/OiBudW1iZXIsIGRlcHRoPzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmIChkZXB0aCA9PT0gdm9pZCAwKSB7XG4gICAgICAgICAgICBkZXB0aCA9IDEwMDAwMDsgLy8gSlNPTi5zdHJpbmdpZnkgZG9lc24ndCBoYW5kbGUgSW5maW5pdHlcbiAgICAgICAgfVxuICAgICAgICB2YXIgZm9sZFdpZGdldHMgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgICAgICBpZiAoIWZvbGRXaWRnZXRzKSB7XG4gICAgICAgICAgICByZXR1cm47IC8vIG1vZGUgZG9lc24ndCBzdXBwb3J0IGZvbGRpbmdcbiAgICAgICAgfVxuICAgICAgICBlbmRSb3cgPSBlbmRSb3cgfHwgdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgc3RhcnRSb3cgPSBzdGFydFJvdyB8fCAwO1xuICAgICAgICBmb3IgKHZhciByb3cgPSBzdGFydFJvdzsgcm93IDwgZW5kUm93OyByb3crKykge1xuICAgICAgICAgICAgaWYgKGZvbGRXaWRnZXRzW3Jvd10gPT0gbnVsbClcbiAgICAgICAgICAgICAgICBmb2xkV2lkZ2V0c1tyb3ddID0gdGhpcy5nZXRGb2xkV2lkZ2V0KHJvdyk7XG4gICAgICAgICAgICBpZiAoZm9sZFdpZGdldHNbcm93XSAhPSBcInN0YXJ0XCIpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKHJvdyk7XG4gICAgICAgICAgICAvLyBzb21ldGltZXMgcmFuZ2UgY2FuIGJlIGluY29tcGF0aWJsZSB3aXRoIGV4aXN0aW5nIGZvbGRcbiAgICAgICAgICAgIC8vIFRPRE8gY2hhbmdlIGFkZEZvbGQgdG8gcmV0dXJuIG51bGwgaXN0ZWFkIG9mIHRocm93aW5nXG4gICAgICAgICAgICBpZiAocmFuZ2UgJiYgcmFuZ2UuaXNNdWx0aUxpbmUoKVxuICAgICAgICAgICAgICAgICYmIHJhbmdlLmVuZC5yb3cgPD0gZW5kUm93XG4gICAgICAgICAgICAgICAgJiYgcmFuZ2Uuc3RhcnQucm93ID49IHN0YXJ0Um93XG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgICByb3cgPSByYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZEZvbGQgY2FuIGNoYW5nZSB0aGUgcmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZClcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGQuY29sbGFwc2VDaGlsZHJlbiA9IGRlcHRoO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGUpIHsgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgc2V0Rm9sZFN0eWxlKHN0eWxlOiBzdHJpbmcpIHtcbiAgICAgICAgaWYgKCF0aGlzLiRmb2xkU3R5bGVzW3N0eWxlXSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgZm9sZCBzdHlsZTogXCIgKyBzdHlsZSArIFwiW1wiICsgT2JqZWN0LmtleXModGhpcy4kZm9sZFN0eWxlcykuam9pbihcIiwgXCIpICsgXCJdXCIpO1xuXG4gICAgICAgIGlmICh0aGlzLiRmb2xkU3R5bGUgPT09IHN0eWxlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZvbGRTdHlsZSA9IHN0eWxlO1xuXG4gICAgICAgIGlmIChzdHlsZSA9PT0gXCJtYW51YWxcIilcbiAgICAgICAgICAgIHRoaXMudW5mb2xkKCk7XG4gICAgICAgIFxuICAgICAgICAvLyByZXNldCBmb2xkaW5nXG4gICAgICAgIHZhciBtb2RlID0gdGhpcy4kZm9sZE1vZGU7XG4gICAgICAgIHRoaXMuJHNldEZvbGRpbmcobnVsbCk7XG4gICAgICAgIHRoaXMuJHNldEZvbGRpbmcobW9kZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkc2V0Rm9sZGluZyhmb2xkTW9kZTogRm9sZE1vZGUpIHtcbiAgICAgICAgaWYgKHRoaXMuJGZvbGRNb2RlID09IGZvbGRNb2RlKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZvbGRNb2RlID0gZm9sZE1vZGU7XG5cbiAgICAgICAgdGhpcy5ldmVudEJ1cy5vZmYoJ2NoYW5nZScsIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzKTtcbiAgICAgICAgdGhpcy5ldmVudEJ1cy5fZW1pdChcImNoYW5nZUFubm90YXRpb25cIik7XG5cbiAgICAgICAgaWYgKCFmb2xkTW9kZSB8fCB0aGlzLiRmb2xkU3R5bGUgPT09IFwibWFudWFsXCIpIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMgPSBudWxsO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cyA9IFtdO1xuICAgICAgICB0aGlzLmdldEZvbGRXaWRnZXQgPSBmb2xkTW9kZS5nZXRGb2xkV2lkZ2V0LmJpbmQoZm9sZE1vZGUsIHRoaXMsIHRoaXMuJGZvbGRTdHlsZSk7XG4gICAgICAgIHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlID0gZm9sZE1vZGUuZ2V0Rm9sZFdpZGdldFJhbmdlLmJpbmQoZm9sZE1vZGUsIHRoaXMsIHRoaXMuJGZvbGRTdHlsZSk7XG5cbiAgICAgICAgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMgPSB0aGlzLnVwZGF0ZUZvbGRXaWRnZXRzLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMuZXZlbnRCdXMub24oJ2NoYW5nZScsIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzKTtcblxuICAgIH1cblxuICAgIGdldFBhcmVudEZvbGRSYW5nZURhdGEocm93OiBudW1iZXIsIGlnbm9yZUN1cnJlbnQ/OiBib29sZWFuKTogeyByYW5nZT86IFJhbmdlOyBmaXJzdFJhbmdlPzogUmFuZ2UgfSB7XG4gICAgICAgIHZhciBmdyA9IHRoaXMuZm9sZFdpZGdldHM7XG4gICAgICAgIGlmICghZncgfHwgKGlnbm9yZUN1cnJlbnQgJiYgZndbcm93XSkpIHtcbiAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpID0gcm93IC0gMTtcbiAgICAgICAgdmFyIGZpcnN0UmFuZ2U6IFJhbmdlO1xuICAgICAgICB3aGlsZSAoaSA+PSAwKSB7XG4gICAgICAgICAgICB2YXIgYyA9IGZ3W2ldO1xuICAgICAgICAgICAgaWYgKGMgPT0gbnVsbClcbiAgICAgICAgICAgICAgICBjID0gZndbaV0gPSB0aGlzLmdldEZvbGRXaWRnZXQoaSk7XG5cbiAgICAgICAgICAgIGlmIChjID09IFwic3RhcnRcIikge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKGkpO1xuICAgICAgICAgICAgICAgIGlmICghZmlyc3RSYW5nZSlcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RSYW5nZSA9IHJhbmdlO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5lbmQucm93ID49IHJvdylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpLS07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmFuZ2U6IGkgIT09IC0xICYmIHJhbmdlLFxuICAgICAgICAgICAgZmlyc3RSYW5nZTogZmlyc3RSYW5nZVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG9uRm9sZFdpZGdldENsaWNrKHJvdzogbnVtYmVyLCBlKSB7XG4gICAgICAgIGUgPSBlLmRvbUV2ZW50O1xuICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNoaWxkcmVuOiBlLnNoaWZ0S2V5LFxuICAgICAgICAgICAgYWxsOiBlLmN0cmxLZXkgfHwgZS5tZXRhS2V5LFxuICAgICAgICAgICAgc2libGluZ3M6IGUuYWx0S2V5XG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy4kdG9nZ2xlRm9sZFdpZGdldChyb3csIG9wdGlvbnMpO1xuICAgICAgICBpZiAoIXJhbmdlKSB7XG4gICAgICAgICAgICB2YXIgZWwgPSAoZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50KVxuICAgICAgICAgICAgaWYgKGVsICYmIC9hY2VfZm9sZC13aWRnZXQvLnRlc3QoZWwuY2xhc3NOYW1lKSlcbiAgICAgICAgICAgICAgICBlbC5jbGFzc05hbWUgKz0gXCIgYWNlX2ludmFsaWRcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJHRvZ2dsZUZvbGRXaWRnZXQocm93OiBudW1iZXIsIG9wdGlvbnMpOiBSYW5nZSB7XG4gICAgICAgIGlmICghdGhpcy5nZXRGb2xkV2lkZ2V0KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgdHlwZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChyb3cpO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZ2V0TGluZShyb3cpO1xuXG4gICAgICAgIHZhciBkaXIgPSB0eXBlID09PSBcImVuZFwiID8gLTEgOiAxO1xuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgZGlyID09PSAtMSA/IDAgOiBsaW5lLmxlbmd0aCwgZGlyKTtcblxuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hpbGRyZW4gfHwgb3B0aW9ucy5hbGwpXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKHJvdywgdHJ1ZSk7XG4gICAgICAgIC8vIHNvbWV0aW1lcyBzaW5nbGVsaW5lIGZvbGRzIGNhbiBiZSBtaXNzZWQgYnkgdGhlIGNvZGUgYWJvdmVcbiAgICAgICAgaWYgKHJhbmdlICYmICFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4sIDEpO1xuICAgICAgICAgICAgaWYgKGZvbGQgJiYgcmFuZ2UuaXNFcXVhbChmb2xkLnJhbmdlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob3B0aW9ucy5zaWJsaW5ncykge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmdldFBhcmVudEZvbGRSYW5nZURhdGEocm93KTtcbiAgICAgICAgICAgIGlmIChkYXRhLnJhbmdlKSB7XG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0Um93ID0gZGF0YS5yYW5nZS5zdGFydC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIHZhciBlbmRSb3cgPSBkYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwoc3RhcnRSb3csIGVuZFJvdywgb3B0aW9ucy5hbGwgPyAxMDAwMCA6IDApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9wdGlvbnMuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGVuZFJvdyA9IHJhbmdlID8gcmFuZ2UuZW5kLnJvdyA6IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwocm93ICsgMSwgcmFuZ2UuZW5kLnJvdywgb3B0aW9ucy5hbGwgPyAxMDAwMCA6IDApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5hbGwpIHtcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIGEgYml0IHVnbHksIGJ1dCBpdCBjb3JyZXNwb25kcyB0byBzb21lIGNvZGUgZWxzZXdoZXJlLlxuICAgICAgICAgICAgICAgIHJhbmdlLmNvbGxhcHNlQ2hpbGRyZW4gPSAxMDAwMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQG1ldGhvZCB0b2dnbGVGb2xkV2lkZ2V0XG4gICAgICogQHBhcmFtIFt0b2dnbGVQYXJlbnRdIHtib29sZWFufSBXQVJOSU5HOiB1bnVzZWRcbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHRvZ2dsZUZvbGRXaWRnZXQodG9nZ2xlUGFyZW50PzogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB2YXIgcm93OiBudW1iZXIgPSB0aGlzLnNlbGVjdGlvbi5nZXRDdXJzb3IoKS5yb3c7XG4gICAgICAgIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KHJvdyk7XG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCB7fSk7XG5cbiAgICAgICAgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgLy8gaGFuZGxlIHRvZ2dsZVBhcmVudFxuICAgICAgICB2YXIgZGF0YSA9IHRoaXMuZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3csIHRydWUpO1xuICAgICAgICByYW5nZSA9IGRhdGEucmFuZ2UgfHwgZGF0YS5maXJzdFJhbmdlO1xuXG4gICAgICAgIGlmIChyYW5nZSkge1xuICAgICAgICAgICAgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyb3csIHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aCwgMSk7XG5cbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHVwZGF0ZUZvbGRXaWRnZXRzKGU6IHsgZGF0YTogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH0gfSwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKTogdm9pZCB7XG4gICAgICAgIHZhciBkZWx0YSA9IGUuZGF0YTtcbiAgICAgICAgdmFyIHJhbmdlID0gZGVsdGEucmFuZ2U7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGxlbiA9IHJhbmdlLmVuZC5yb3cgLSBmaXJzdFJvdztcblxuICAgICAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzW2ZpcnN0Um93XSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoZGVsdGEuYWN0aW9uID09IFwicmVtb3ZlVGV4dFwiIHx8IGRlbHRhLmFjdGlvbiA9PSBcInJlbW92ZUxpbmVzXCIpIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMuc3BsaWNlKGZpcnN0Um93LCBsZW4gKyAxLCBudWxsKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuICsgMSk7XG4gICAgICAgICAgICBhcmdzLnVuc2hpZnQoZmlyc3RSb3csIDEpO1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cy5zcGxpY2UuYXBwbHkodGhpcy5mb2xkV2lkZ2V0cywgYXJncyk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIEZJWE1FOiBSZXN0b3JlXG4vLyBGb2xkaW5nLmNhbGwoRWRpdFNlc3Npb24ucHJvdG90eXBlKTtcblxuZGVmaW5lT3B0aW9ucyhFZGl0U2Vzc2lvbi5wcm90b3R5cGUsIFwic2Vzc2lvblwiLCB7XG4gICAgd3JhcDoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoIXZhbHVlIHx8IHZhbHVlID09IFwib2ZmXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBmYWxzZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlID09IFwiZnJlZVwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gdHJ1ZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlID09IFwicHJpbnRNYXJnaW5cIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IC0xO1xuICAgICAgICAgICAgZWxzZSBpZiAodHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUludCh2YWx1ZSwgMTApIHx8IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kd3JhcCA9PSB2YWx1ZSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRVc2VXcmFwTW9kZShmYWxzZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjb2wgPSB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIiA/IHZhbHVlIDogbnVsbDtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFdyYXBMaW1pdFJhbmdlKGNvbCwgY29sKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy4kd3JhcCA9IHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0VXNlV3JhcE1vZGUoKSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLiR3cmFwID09IC0xKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJwcmludE1hcmdpblwiO1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5nZXRXcmFwTGltaXRSYW5nZSgpLm1pbilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiZnJlZVwiO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFwib2ZmXCI7XG4gICAgICAgIH0sXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIHdyYXBNZXRob2Q6IHtcbiAgICAgICAgLy8gY29kZXx0ZXh0fGF1dG9cbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHZhbCA9IHZhbCA9PSBcImF1dG9cIlxuICAgICAgICAgICAgICAgID8gdGhpcy4kbW9kZS50eXBlICE9IFwidGV4dFwiXG4gICAgICAgICAgICAgICAgOiB2YWwgIT0gXCJ0ZXh0XCI7XG4gICAgICAgICAgICBpZiAodmFsICE9IHRoaXMuJHdyYXBBc0NvZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR3cmFwQXNDb2RlID0gdmFsO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIHRoaXMuZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCJhdXRvXCJcbiAgICB9LFxuICAgIGZpcnN0TGluZU51bWJlcjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDFcbiAgICB9LFxuICAgIHVzZVdvcmtlcjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHVzZVdvcmtlcjogYm9vbGVhbikge1xuICAgICAgICAgICAgdGhpcy4kdXNlV29ya2VyID0gdXNlV29ya2VyO1xuXG4gICAgICAgICAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG4gICAgICAgICAgICBpZiAodXNlV29ya2VyKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiB0cnVlXG4gICAgfSxcbiAgICB1c2VTb2Z0VGFiczogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgICB0YWJTaXplOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odGFiU2l6ZSkge1xuICAgICAgICAgICAgaWYgKGlzTmFOKHRhYlNpemUpIHx8IHRoaXMuJHRhYlNpemUgPT09IHRhYlNpemUpIHJldHVybjtcblxuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGUgPSBbXTtcbiAgICAgICAgICAgIHRoaXMuJHRhYlNpemUgPSB0YWJTaXplO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlVGFiU2l6ZVwiKTtcbiAgICAgICAgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiA0LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBvdmVyd3JpdGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlT3ZlcndyaXRlXCIpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gICAgfSxcbiAgICBuZXdMaW5lTW9kZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZSh2YWwpIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpIH0sXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIG1vZGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5zZXRNb2RlKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuJG1vZGVJZCB9XG4gICAgfVxufSk7XG4iXX0=