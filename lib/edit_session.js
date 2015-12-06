import { delayedCall, stringRepeat } from "./lib/lang";
import { _signal, defineOptions, loadModule, resetOptions } from "./config";
import { EventEmitterClass } from "./lib/event_emitter";
import { Selection } from "./selection";
import { Mode } from "./mode/text";
import { Range } from "./range";
import { Document } from "./document";
import { BackgroundTokenizer } from "./background_tokenizer";
import { SearchHighlight } from "./search_highlight";
import { assert } from './lib/asserts';
import { BracketMatchService } from "./edit_session/bracket_match";
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
export class EditSession extends EventEmitterClass {
    constructor(text, mode) {
        super();
        this.$breakpoints = [];
        this.$decorations = [];
        this.$frontMarkers = {};
        this.$backMarkers = {};
        this.$markerId = 1;
        this.$undoSelect = true;
        this.$foldData = [];
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
        this.lineWidgets = null;
        this.$onChange = this.onChange.bind(this);
        this.$selectionMarker = null;
        this.$bracketMatcher = new BracketMatchService(this);
        this.getAnnotations = function () {
            return this.$annotations || [];
        };
        this.$foldData.toString = function () {
            return this.join("\n");
        };
        this.on("changeFold", this.onChangeFold.bind(this));
        if (typeof text !== "object" || !text.getLine) {
            this.setDocument(new Document(text));
        }
        else {
            this.setDocument(text);
        }
        this.selection = new Selection(this);
        resetOptions(this);
        this.setMode(mode);
        _signal("session", this);
    }
    setDocument(doc) {
        if (this.doc) {
            this.doc.removeListener("change", this.$onChange);
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
    onChangeFold(e) {
        var fold = e.data;
        this.$resetRowCache(fold.start.row);
    }
    onChange(e) {
        var delta = e.data;
        this.$modified = true;
        this.$resetRowCache(delta.range.start.row);
        var removedFolds = this.$updateInternalDataOnChange(e);
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
        this.bgTokenizer.$updateOnChange(delta);
        this._signal("change", e);
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
    getState(row) {
        return this.bgTokenizer.getState(row);
    }
    getTokens(row) {
        return this.bgTokenizer.getTokens(row);
    }
    getTokenAt(row, column) {
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
        if (this.$syncInformUndoManager)
            this.$syncInformUndoManager();
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
    setUseSoftTabs(val) {
        this.setOption("useSoftTabs", val);
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
        this._signal("changeBreakpoint", {});
    }
    removeGutterDecoration(row, className) {
        this.$decorations[row] = (this.$decorations[row] || "").replace(" " + className, "");
        this._signal("changeBreakpoint", {});
    }
    getBreakpoints() {
        return this.$breakpoints;
    }
    setBreakpoints(rows) {
        this.$breakpoints = [];
        for (var i = 0; i < rows.length; i++) {
            this.$breakpoints[rows[i]] = "ace_breakpoint";
        }
        this._signal("changeBreakpoint", {});
    }
    clearBreakpoints() {
        this.$breakpoints = [];
        this._signal("changeBreakpoint", {});
    }
    setBreakpoint(row, className) {
        if (className === undefined)
            className = "ace_breakpoint";
        if (className)
            this.$breakpoints[row] = className;
        else
            delete this.$breakpoints[row];
        this._signal("changeBreakpoint", {});
    }
    clearBreakpoint(row) {
        delete this.$breakpoints[row];
        this._signal("changeBreakpoint", {});
    }
    addMarker(range, clazz, type, inFront) {
        var id = this.$markerId++;
        var marker = {
            range: range,
            type: type || "line",
            renderer: typeof type == "function" ? type : null,
            clazz: clazz,
            inFront: !!inFront,
            id: id
        };
        if (inFront) {
            this.$frontMarkers[id] = marker;
            this._signal("changeFrontMarker");
        }
        else {
            this.$backMarkers[id] = marker;
            this._signal("changeBackMarker");
        }
        return id;
    }
    addDynamicMarker(marker, inFront) {
        if (!marker.update)
            return;
        var id = this.$markerId++;
        marker.id = id;
        marker.inFront = !!inFront;
        if (inFront) {
            this.$frontMarkers[id] = marker;
            this._signal("changeFrontMarker");
        }
        else {
            this.$backMarkers[id] = marker;
            this._signal("changeBackMarker");
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
            this._signal(marker.inFront ? "changeFrontMarker" : "changeBackMarker");
        }
    }
    getMarkers(inFront) {
        return inFront ? this.$frontMarkers : this.$backMarkers;
    }
    highlight(re) {
        if (!this.$searchHighlight) {
            var highlight = new SearchHighlight(null, "ace_selected-word", "text");
            this.$searchHighlight = this.addDynamicMarker(highlight);
        }
        this.$searchHighlight.setRegexp(re);
    }
    highlightLines(startRow, endRow, clazz, inFront) {
        if (typeof endRow != "number") {
            clazz = endRow;
            endRow = startRow;
        }
        if (!clazz)
            clazz = "ace_step";
        var range = new Range(startRow, 0, endRow, Infinity);
        range.id = this.addMarker(range, clazz, "fullLine", inFront);
        return range;
    }
    setAnnotations(annotations) {
        this.$annotations = annotations;
        this._signal("changeAnnotation", {});
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
    setUseWorker(useWorker) { this.setOption("useWorker", useWorker); }
    getUseWorker() { return this.$useWorker; }
    onReloadTokenizer(e) {
        var rows = e.data;
        this.bgTokenizer.start(rows.first);
        this._signal("tokenizerUpdate", e);
    }
    setMode(mode, cb) {
        if (mode && typeof mode === "object") {
            if (mode.getTokenizer) {
                return this.$onChangeMode(mode);
            }
            var options = mode;
            var path = options.path;
        }
        else {
            path = mode || "ace/mode/text";
        }
        if (!this.$modes["ace/mode/text"])
            this.$modes["ace/mode/text"] = new Mode();
        if (this.$modes[path] && !options) {
            this.$onChangeMode(this.$modes[path]);
            cb && cb();
            return;
        }
        this.$modeId = path;
        loadModule(["mode", path], function (m) {
            if (this.$modeId !== path)
                return cb && cb();
            if (this.$modes[path] && !options)
                return this.$onChangeMode(this.$modes[path]);
            if (m && m.Mode) {
                m = new m.Mode(options);
                if (!options) {
                    this.$modes[path] = m;
                    m.$id = path;
                }
                this.$onChangeMode(m);
                cb && cb();
            }
        }.bind(this));
        if (!this.$mode) {
            this.$onChangeMode(this.$modes["ace/mode/text"], true);
        }
    }
    $onChangeMode(mode, $isPlaceholder) {
        if (!$isPlaceholder)
            this.$modeId = mode.$id;
        if (this.$mode === mode)
            return;
        this.$mode = mode;
        this.$stopWorker();
        if (this.$useWorker)
            this.$startWorker();
        var tokenizer = mode.getTokenizer();
        if (tokenizer.addEventListener !== undefined) {
            var onReloadTokenizer = this.onReloadTokenizer.bind(this);
            tokenizer.addEventListener("update", onReloadTokenizer);
        }
        if (!this.bgTokenizer) {
            this.bgTokenizer = new BackgroundTokenizer(tokenizer);
            var _self = this;
            this.bgTokenizer.addEventListener("update", function (e) {
                _self._signal("tokenizerUpdate", e);
            });
        }
        else {
            this.bgTokenizer.setTokenizer(tokenizer);
        }
        this.bgTokenizer.setDocument(this.getDocument());
        this.tokenRe = mode.tokenRe;
        this.nonTokenRe = mode.nonTokenRe;
        if (!$isPlaceholder) {
            this.$options.wrapMethod.set.call(this, this.$wrapMethod);
            this.$setFolding(mode.foldingRules);
            this.bgTokenizer.start(0);
            this._emit("changeMode");
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
            this.$worker = this.$mode.createWorker(this);
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
        this._signal("changeScrollTop", scrollTop);
    }
    getScrollTop() {
        return this.$scrollTop;
    }
    setScrollLeft(scrollLeft) {
        if (this.$scrollLeft === scrollLeft || isNaN(scrollLeft))
            return;
        this.$scrollLeft = scrollLeft;
        this._signal("changeScrollLeft", scrollLeft);
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
            if (this.$useWrapMode)
                return this.screenWidth = this.$wrapLimit;
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
            if (delta.group == "doc") {
                this.doc.revertDeltas(delta.deltas);
                lastUndoRange =
                    this.$getUndoSelection(delta.deltas, true, lastUndoRange);
            }
            else {
                delta.deltas.forEach(function (foldDelta) {
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
        var lines = dir == 0
            ? this.doc.getLines(firstRow, lastRow)
            : this.doc.removeLines(firstRow, lastRow);
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
            this._signal("changeWrapMode");
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
            this._signal("changeWrapMode");
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
                this._signal("changeWrapLimit");
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
    $findOpeningBracket(bracket, position, typeRe) {
        return this.$bracketMatcher.$findOpeningBracket(bracket, position, typeRe);
    }
    $findClosingBracket(bracket, position, typeRe) {
        return this.$bracketMatcher.$findClosingBracket(bracket, position, typeRe);
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
            if (useWorker)
                this.$startWorker();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdF9zZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2VkaXRfc2Vzc2lvbi50cyJdLCJuYW1lcyI6WyJpc0Z1bGxXaWR0aCIsIkVkaXRTZXNzaW9uIiwiRWRpdFNlc3Npb24uY29uc3RydWN0b3IiLCJFZGl0U2Vzc2lvbi5zZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLmdldERvY3VtZW50IiwiRWRpdFNlc3Npb24uJHJlc2V0Um93Q2FjaGUiLCJFZGl0U2Vzc2lvbi4kZ2V0Um93Q2FjaGVJbmRleCIsIkVkaXRTZXNzaW9uLnJlc2V0Q2FjaGVzIiwiRWRpdFNlc3Npb24ub25DaGFuZ2VGb2xkIiwiRWRpdFNlc3Npb24ub25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXRWYWx1ZSIsIkVkaXRTZXNzaW9uLnRvU3RyaW5nIiwiRWRpdFNlc3Npb24uZ2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi5nZXRTZWxlY3Rpb24iLCJFZGl0U2Vzc2lvbi5nZXRTdGF0ZSIsIkVkaXRTZXNzaW9uLmdldFRva2VucyIsIkVkaXRTZXNzaW9uLmdldFRva2VuQXQiLCJFZGl0U2Vzc2lvbi5zZXRVbmRvTWFuYWdlciIsIkVkaXRTZXNzaW9uLm1hcmtVbmRvR3JvdXAiLCJFZGl0U2Vzc2lvbi5nZXRVbmRvTWFuYWdlciIsIkVkaXRTZXNzaW9uLmdldFRhYlN0cmluZyIsIkVkaXRTZXNzaW9uLnNldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uZ2V0VXNlU29mdFRhYnMiLCJFZGl0U2Vzc2lvbi5zZXRUYWJTaXplIiwiRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmlzVGFiU3RvcCIsIkVkaXRTZXNzaW9uLnNldE92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLmdldE92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLnRvZ2dsZU92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLmFkZEd1dHRlckRlY29yYXRpb24iLCJFZGl0U2Vzc2lvbi5yZW1vdmVHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24uZ2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5zZXRCcmVha3BvaW50cyIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5zZXRCcmVha3BvaW50IiwiRWRpdFNlc3Npb24uY2xlYXJCcmVha3BvaW50IiwiRWRpdFNlc3Npb24uYWRkTWFya2VyIiwiRWRpdFNlc3Npb24uYWRkRHluYW1pY01hcmtlciIsIkVkaXRTZXNzaW9uLnJlbW92ZU1hcmtlciIsIkVkaXRTZXNzaW9uLmdldE1hcmtlcnMiLCJFZGl0U2Vzc2lvbi5oaWdobGlnaHQiLCJFZGl0U2Vzc2lvbi5oaWdobGlnaHRMaW5lcyIsIkVkaXRTZXNzaW9uLnNldEFubm90YXRpb25zIiwiRWRpdFNlc3Npb24uY2xlYXJBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLiRkZXRlY3ROZXdMaW5lIiwiRWRpdFNlc3Npb24uZ2V0V29yZFJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0QVdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLnNldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uZ2V0TmV3TGluZU1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5vblJlbG9hZFRva2VuaXplciIsIkVkaXRTZXNzaW9uLnNldE1vZGUiLCJFZGl0U2Vzc2lvbi4kb25DaGFuZ2VNb2RlIiwiRWRpdFNlc3Npb24uJHN0b3BXb3JrZXIiLCJFZGl0U2Vzc2lvbi4kc3RhcnRXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNb2RlIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsTGVmdCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldExpbmVXaWRnZXRNYXhXaWR0aCIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TGluZXMiLCJFZGl0U2Vzc2lvbi5nZXRMZW5ndGgiLCJFZGl0U2Vzc2lvbi5nZXRUZXh0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5pbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZW1vdmUiLCJFZGl0U2Vzc2lvbi51bmRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnJlZG9DaGFuZ2VzIiwiRWRpdFNlc3Npb24uc2V0VW5kb1NlbGVjdCIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uJGdldFVuZG9TZWxlY3Rpb24uaXNJbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZXBsYWNlIiwiRWRpdFNlc3Npb24ubW92ZVRleHQiLCJFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzIiwiRWRpdFNlc3Npb24ub3V0ZGVudFJvd3MiLCJFZGl0U2Vzc2lvbi4kbW92ZUxpbmVzIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzVXAiLCJFZGl0U2Vzc2lvbi5tb3ZlTGluZXNEb3duIiwiRWRpdFNlc3Npb24uZHVwbGljYXRlTGluZXMiLCJFZGl0U2Vzc2lvbi4kY2xpcFJvd1RvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcENvbHVtblRvUm93IiwiRWRpdFNlc3Npb24uJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcFJhbmdlVG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLnNldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uZ2V0VXNlV3JhcE1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLmFkanVzdFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLiRjb25zdHJhaW5XcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVSb3dMZW5ndGhDYWNoZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVXcmFwRGF0YSIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cyIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cy5hZGRTcGxpdCIsIkVkaXRTZXNzaW9uLiRnZXREaXNwbGF5VG9rZW5zIiwiRWRpdFNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGluZUNvdW50IiwiRWRpdFNlc3Npb24uZ2V0Um93V3JhcEluZGVudCIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmdldFJvd1NwbGl0RGF0YSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlblRhYlNpemUiLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93IiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudENvbHVtbiIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoIiwiRWRpdFNlc3Npb24uJHNldEZvbnRNZXRyaWNzIiwiRWRpdFNlc3Npb24uZmluZE1hdGNoaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEJyYWNrZXRSYW5nZSIsIkVkaXRTZXNzaW9uLiRmaW5kT3BlbmluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi4kZmluZENsb3NpbmdCcmFja2V0Il0sIm1hcHBpbmdzIjoiT0ErQk8sRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDbEUsRUFBQyxpQkFBaUIsRUFBQyxNQUFNLHFCQUFxQjtPQUU5QyxFQUFDLFNBQVMsRUFBQyxNQUFNLGFBQWE7T0FDOUIsRUFBQyxJQUFJLEVBQUMsTUFBTSxhQUFhO09BQ3pCLEVBQUMsS0FBSyxFQUFDLE1BQU0sU0FBUztPQUN0QixFQUFDLFFBQVEsRUFBQyxNQUFNLFlBQVk7T0FDNUIsRUFBQyxtQkFBbUIsRUFBQyxNQUFNLHdCQUF3QjtPQUNuRCxFQUFDLGVBQWUsRUFBQyxNQUFNLG9CQUFvQjtPQUMzQyxFQUFDLE1BQU0sRUFBQyxNQUFNLGVBQWU7T0FDN0IsRUFBaUIsbUJBQW1CLEVBQUMsTUFBTSw4QkFBOEI7QUFJaEYsSUFBSSxJQUFJLEdBQUcsQ0FBQyxFQUNWLFFBQVEsR0FBRyxDQUFDLEVBQ1osaUJBQWlCLEdBQUcsQ0FBQyxFQUNyQixnQkFBZ0IsR0FBRyxDQUFDLEVBQ3BCLFdBQVcsR0FBRyxDQUFDLEVBQ2YsS0FBSyxHQUFHLEVBQUUsRUFDVixHQUFHLEdBQUcsRUFBRSxFQUNSLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFJakIscUJBQXFCLENBQVM7SUFDNUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ2JBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2ZBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQy9CQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNB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QUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFTTWQsVUFBVUEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBZUE7UUFDNUNlLElBQUlBLE1BQU1BLEdBQXdCQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsRUEsSUFBSUEsS0FBd0RBLENBQUNBO1FBQzdEQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1FBQy9CQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDdkNBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO2dCQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0E7b0JBQ2RBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1FBQ0hBLENBQUNBO1FBQ0RBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNUQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNkQSxLQUFLQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFD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QUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcEJBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO2dCQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2xEQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDbEVBLENBQUNBO2dCQUNEQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtnQkFDeEJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNqREEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzVEQSxDQUFDQTtnQkFDREEsaUJBQWlCQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUMzQkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO2dCQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFB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LFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1lBQ2xEQSxPQUFPQSxHQUFHQSxPQUFPQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUMxRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUMxRkEsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtnQkFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3RGQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxPQUFPQSxDQUFDQTtnQkFDaENBLENBQUNBO1lBQ0hBLENBQUNBO1lBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLElBQUlBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUN0REEsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FB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R0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDNURBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTNCQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMxQkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0E7b0JBQ3hCQSxLQUFLQSxDQUFDQTtZQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdkNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO2dCQUM3QkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNOQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDN0JBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1lBQzdCQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtRQUMzQkEsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFFTzdFLFVBQVVBLENBQUNBLFFBQWdCQSxFQUFFQSxPQUFlQSxFQUFFQSxHQUFXQTtRQUMvRDhFLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQzFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsSUFBSUEsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxPQUFPQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUM1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQSxJQUFJQSxHQUFHQSxHQUFHQSxHQUFHQSxPQUFPQSxDQUFDQTtRQUMzQkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDTkEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUM3Q0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxP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QUFDQSxHQUFHQSxDQUFDQTtRQUN0Q0EsSUFBSUEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDbkNBLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQy9CQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUMzQkEsSUFBSUEsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFFeEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDNUJBLE9BQU9BLEdBQUdBLFFBQVFBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQzdDQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDTkEsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFDckJBLENBQUNBO1lBQ0RBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBO1FBQ2hFQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNOQSxHQUFHQSxHQUFHQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQTtRQUMzQkEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDdEJBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNuQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsV0FBV0EsR0FBR0EsaUJBQWlCQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxRQUFRQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFFMUVBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO2dCQUMvQkEsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtnQkFFL0JBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN6Q0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNiQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtvQkFDeEVBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUV4QkEsSUFBSUEsY0FBY0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7b0JBQ2hEQSxFQUFFQSxDQUFDQSxDQUFDQSxjQUFjQSxJQUFJQSxjQUFjQSxLQUFLQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDbERBLGNBQWNBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO3dCQUMvQkEsUUFBUUEsR0FBR0EsY0FBY0EsQ0FBQ0E7b0JBQzVCQSxDQUFDQTtvQkFDREEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hDQSxDQUFDQTtnQkFFREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQ3hDQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO3dCQUNsQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzFCQSxDQUFDQTtnQkFDSEEsQ0FBQ0E7Z0JBRURBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBO1lBQ3JCQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDTkEsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUJBLElBQUlBLEdBQUdBLEdBQUdBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUFBO2dCQUM3REEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBSTVCQSxJQUFJQSxT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QUFHQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtnQkFDOUJBLEdBQUdBLENBQUNBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLEVBQUVBLEVBQUVBLENBQUNBO29CQUMzQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDdENBLEtBQUtBLENBQUNBO29CQUNSQSxDQUFDQTtnQkFDSEEsQ0FBQ0E7Z0JBSURBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUMzQkEsS0FBS0EsQ0FBQ0E7Z0JBQ1JBLENBQUNBO2dCQUdEQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDaEJBLFFBQVFBLENBQUNBO1lBQ1hBLENBQUNBO1lBSURBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEVBQUVBLEdBQUdBLFNBQVNBLEdBQUdBLENBQUNBLFNBQVNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQzdGQSxPQUFPQSxLQUFLQSxHQUFHQSxRQUFRQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxpQkFBaUJBLEVBQUVBLENBQUNBO2dCQUM3REEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1hBLE9BQU9BLEtBQUtBLEdBQUdBLFFBQVFBLElBQUlBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLGlCQUFpQkEsRUFBRUEsQ0FBQ0E7b0JBQzdEQSxLQUFLQSxFQUFFQSxDQUFDQTtnQkFDVkEsQ0FB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QSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMvQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO0lBQ0hBLENBQUNBO0lBRU10RyxnQkFBZ0JBLENBQUNBLFNBQWlCQTtRQUN2Q3VHLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSx3QkFBd0JBLENBQUNBLFNBQVNBLEVBQUVBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3JFQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUVyQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsSUFBSUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDeEVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1FBQ1hBLENBQUNBO0lBQ0hBLENBQUNBO0lBU012RyxzQkFBc0JBLENBQUNBLFNBQWlCQTtRQUM3Q3dHLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDckVBLE1BQU1B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Q0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaEJBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsSUFBSUEsT0FBT0EsR0FBR0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ05BLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ25CQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXpEQSxPQUFPQSxHQUFHQSxJQUFJQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUN4QkEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDdENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLElBQUlBLE1BQU1BLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNwREEsS0FBS0EsQ0FBQ0E7WUFDUkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ05BLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBO2dCQUNqQkEsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ1RBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO29CQUN2QkEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFDbERBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUN2REEsQ0FBQ0E7WUFDSEEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDakNBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQ3pDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsSUFBSUEsU0FBU0EsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFM0RBLE1BQU1BLENBQUNBO2dCQUNMQSxHQUFHQSxFQUFFQSxNQUFNQTtnQkFDWEEsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUE7YUFDcENBLENBQUFBO1FBQ0hBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ05BLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQzVCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNsQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdEJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3BDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtnQkFDNUJBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEdBQUdBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNwQ0EsU0FBU0EsR0FBR0EsTUFBTUEsQ0FBQ0EsVUFBVUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hFQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDbkNBLENBQUNBO1lBQ0hBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLFNBQVNBLElBQUlBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFJL0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLFNBQVNBLElBQUlBLE1BQU1BLENBQUNBO1lBQzNDQSxTQUFTQSxHQUFHQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUV6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDWEEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFFM0NBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLE1BQU1BLEVBQUVBLFNBQVNBLEVBQUVBLENBQUNBO0lBQzVDQSxDQUFDQTtJQVVNL0csd0JBQXdCQSxDQUFDQSxNQUFjQSxFQUFFQSxTQUFpQkE7UUFDL0RnSCxJQUFJQSxHQUFvQ0EsQ0FBQ0E7UUFFekNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLFNBQVNBLEtBQUtBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBQ3RFQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxNQUFNQSxDQUFDQSxPQUFPQSxNQUFNQSxLQUFLQSxRQUFRQSxFQUFFQSx5QkFBeUJBLENBQUNBLENBQUNBO1lBQzlEQSxNQUFNQSxDQUFDQSxPQUFPQSxTQUFTQSxLQUFLQSxRQUFRQSxFQUFFQSw0QkFBNEJBLENBQUNBLENBQUNBO1lBQ3BFQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQ3hEQSxDQUFDQTtRQUVEQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNqQkEsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDdkJBLE1BQU1BLENBQUNBLE9BQU9BLE1BQU1BLEtBQUtBLFFBQVFBLEVBQUVBLHlCQUF5QkEsQ0FBQ0EsQ0FBQ0E7UUFDOURBLE1BQU1BLENBQUNBLE9BQU9BLFNBQVNBLEtBQUtBLFFBQVFBLEVBQUVBLDRCQUE0QkEsQ0FBQ0EsQ0FBQ0E7UUFFcEVBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xCQSxJQUFJQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4QkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFHaEJBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNUQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN4QkEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDaENBLENBQUNBO1FBRURBLElBQUlBLE1BQU1BLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1FBRXBCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtRQUNqQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNqREEsSUFBSUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2hCQSxJQUFJQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLElBQUlBLE9BQU9BLEdBQUdBLE1B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QUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUNuRCxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQSxDQUFDLENBQUM7UUFDcEQsVUFBVSxFQUFFLElBQUk7S0FDakI7SUFDRCxJQUFJLEVBQUU7UUFDSixHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQSxDQUFDLENBQUM7UUFDeEMsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUEsQ0FBQyxDQUFDO0tBQ3hDO0NBQ0YsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7fSBmcm9tIFwiLi9saWIvb29wXCI7XG5pbXBvcnQge2RlbGF5ZWRDYWxsLCBzdHJpbmdSZXBlYXR9IGZyb20gXCIuL2xpYi9sYW5nXCI7XG5pbXBvcnQge19zaWduYWwsIGRlZmluZU9wdGlvbnMsIGxvYWRNb2R1bGUsIHJlc2V0T3B0aW9uc30gZnJvbSBcIi4vY29uZmlnXCI7XG5pbXBvcnQge0V2ZW50RW1pdHRlckNsYXNzfSBmcm9tIFwiLi9saWIvZXZlbnRfZW1pdHRlclwiO1xuLy9pbXBvcnQgZmxkID0gcmVxdWlyZShcIi4vZWRpdF9zZXNzaW9uL2ZvbGRpbmdcIilcbmltcG9ydCB7U2VsZWN0aW9ufSBmcm9tIFwiLi9zZWxlY3Rpb25cIjtcbmltcG9ydCB7TW9kZX0gZnJvbSBcIi4vbW9kZS90ZXh0XCI7XG5pbXBvcnQge1JhbmdlfSBmcm9tIFwiLi9yYW5nZVwiO1xuaW1wb3J0IHtEb2N1bWVudH0gZnJvbSBcIi4vZG9jdW1lbnRcIjtcbmltcG9ydCB7QmFja2dyb3VuZFRva2VuaXplcn0gZnJvbSBcIi4vYmFja2dyb3VuZF90b2tlbml6ZXJcIjtcbmltcG9ydCB7U2VhcmNoSGlnaGxpZ2h0fSBmcm9tIFwiLi9zZWFyY2hfaGlnaGxpZ2h0XCI7XG5pbXBvcnQge2Fzc2VydH0gZnJvbSAnLi9saWIvYXNzZXJ0cyc7XG5pbXBvcnQge0JyYWNrZXRNYXRjaGVyLCBCcmFja2V0TWF0Y2hTZXJ2aWNlfSBmcm9tIFwiLi9lZGl0X3Nlc3Npb24vYnJhY2tldF9tYXRjaFwiO1xuaW1wb3J0IHtVbmRvTWFuYWdlcn0gZnJvbSAnLi91bmRvbWFuYWdlcidcblxuLy8gXCJUb2tlbnNcIlxudmFyIENIQVIgPSAxLFxuICBDSEFSX0VYVCA9IDIsXG4gIFBMQUNFSE9MREVSX1NUQVJUID0gMyxcbiAgUExBQ0VIT0xERVJfQk9EWSA9IDQsXG4gIFBVTkNUVUFUSU9OID0gOSxcbiAgU1BBQ0UgPSAxMCxcbiAgVEFCID0gMTEsXG4gIFRBQl9TUEFDRSA9IDEyO1xuXG4vLyBGb3IgZXZlcnkga2V5c3Ryb2tlIHRoaXMgZ2V0cyBjYWxsZWQgb25jZSBwZXIgY2hhciBpbiB0aGUgd2hvbGUgZG9jISFcbi8vIFdvdWxkbid0IGh1cnQgdG8gbWFrZSBpdCBhIGJpdCBmYXN0ZXIgZm9yIGMgPj0gMHgxMTAwXG5mdW5jdGlvbiBpc0Z1bGxXaWR0aChjOiBudW1iZXIpOiBib29sZWFuIHtcbiAgaWYgKGMgPCAweDExMDApXG4gICAgcmV0dXJuIGZhbHNlO1xuICByZXR1cm4gYyA+PSAweDExMDAgJiYgYyA8PSAweDExNUYgfHxcbiAgICBjID49IDB4MTFBMyAmJiBjIDw9IDB4MTFBNyB8fFxuICAgIGMgPj0gMHgxMUZBICYmIGMgPD0gMHgxMUZGIHx8XG4gICAgYyA+PSAweDIzMjkgJiYgYyA8PSAweDIzMkEgfHxcbiAgICBjID49IDB4MkU4MCAmJiBjIDw9IDB4MkU5OSB8fFxuICAgIGMgPj0gMHgyRTlCICYmIGMgPD0gMHgyRUYzIHx8XG4gICAgYyA+PSAweDJGMDAgJiYgYyA8PSAweDJGRDUgfHxcbiAgICBjID49IDB4MkZGMCAmJiBjIDw9IDB4MkZGQiB8fFxuICAgIGMgPj0gMHgzMDAwICYmIGMgPD0gMHgzMDNFIHx8XG4gICAgYyA+PSAweDMwNDEgJiYgYyA8PSAweDMwOTYgfHxcbiAgICBjID49IDB4MzA5OSAmJiBjIDw9IDB4MzBGRiB8fFxuICAgIGMgPj0gMHgzMTA1ICYmIGMgPD0gMHgzMTJEIHx8XG4gICAgYyA+PSAweDMxMzEgJiYgYyA8PSAweDMxOEUgfHxcbiAgICBjID49IDB4MzE5MCAmJiBjIDw9IDB4MzFCQSB8fFxuICAgIGMgPj0gMHgzMUMwICYmIGMgPD0gMHgzMUUzIHx8XG4gICAgYyA+PSAweDMxRjAgJiYgYyA8PSAweDMyMUUgfHxcbiAgICBjID49IDB4MzIyMCAmJiBjIDw9IDB4MzI0NyB8fFxuICAgIGMgPj0gMHgzMjUwICYmIGMgPD0gMHgzMkZFIHx8XG4gICAgYyA+PSAweDMzMDAgJiYgYyA8PSAweDREQkYgfHxcbiAgICBjID49IDB4NEUwMCAmJiBjIDw9IDB4QTQ4QyB8fFxuICAgIGMgPj0gMHhBNDkwICYmIGMgPD0gMHhBNEM2IHx8XG4gICAgYyA+PSAweEE5NjAgJiYgYyA8PSAweEE5N0MgfHxcbiAgICBjID49IDB4QUMwMCAmJiBjIDw9IDB4RDdBMyB8fFxuICAgIGMgPj0gMHhEN0IwICYmIGMgPD0gMHhEN0M2IHx8XG4gICAgYyA+PSAweEQ3Q0IgJiYgYyA8PSAweEQ3RkIgfHxcbiAgICBjID49IDB4RjkwMCAmJiBjIDw9IDB4RkFGRiB8fFxuICAgIGMgPj0gMHhGRTEwICYmIGMgPD0gMHhGRTE5IHx8XG4gICAgYyA+PSAweEZFMzAgJiYgYyA8PSAweEZFNTIgfHxcbiAgICBjID49IDB4RkU1NCAmJiBjIDw9IDB4RkU2NiB8fFxuICAgIGMgPj0gMHhGRTY4ICYmIGMgPD0gMHhGRTZCIHx8XG4gICAgYyA+PSAweEZGMDEgJiYgYyA8PSAweEZGNjAgfHxcbiAgICBjID49IDB4RkZFMCAmJiBjIDw9IDB4RkZFNjtcbn1cblxuLyoqXG4gKiBTdG9yZXMgYWxsIHRoZSBkYXRhIGFib3V0IFtbRWRpdG9yIGBFZGl0b3JgXV0gc3RhdGUgcHJvdmlkaW5nIGVhc3kgd2F5IHRvIGNoYW5nZSBlZGl0b3JzIHN0YXRlLlxuICpcbiAqIGBFZGl0U2Vzc2lvbmAgY2FuIGJlIGF0dGFjaGVkIHRvIG9ubHkgb25lIFtbRG9jdW1lbnQgYERvY3VtZW50YF1dLiBTYW1lIGBEb2N1bWVudGAgY2FuIGJlIGF0dGFjaGVkIHRvIHNldmVyYWwgYEVkaXRTZXNzaW9uYHMuXG4gKiBAY2xhc3MgRWRpdFNlc3Npb25cbiAqKi9cblxuLy97IGV2ZW50c1xuLyoqXG4gKlxuICogRW1pdHRlZCB3aGVuIHRoZSBkb2N1bWVudCBjaGFuZ2VzLlxuICogQGV2ZW50IGNoYW5nZVxuICogQHBhcmFtIHtPYmplY3R9IGUgQW4gb2JqZWN0IGNvbnRhaW5pbmcgYSBgZGVsdGFgIG9mIGluZm9ybWF0aW9uIGFib3V0IHRoZSBjaGFuZ2UuXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgdGFiIHNpemUgY2hhbmdlcywgdmlhIFtbRWRpdFNlc3Npb24uc2V0VGFiU2l6ZV1dLlxuICpcbiAqIEBldmVudCBjaGFuZ2VUYWJTaXplXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgYWJpbGl0eSB0byBvdmVyd3JpdGUgdGV4dCBjaGFuZ2VzLCB2aWEgW1tFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGVdXS5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlT3ZlcndyaXRlXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgZ3V0dGVyIGNoYW5nZXMsIGVpdGhlciBieSBzZXR0aW5nIG9yIHJlbW92aW5nIGJyZWFrcG9pbnRzLCBvciB3aGVuIHRoZSBndXR0ZXIgZGVjb3JhdGlvbnMgY2hhbmdlLlxuICpcbiAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhIGZyb250IG1hcmtlciBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VGcm9udE1hcmtlclxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBiYWNrIG1hcmtlciBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VCYWNrTWFya2VyXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhbiBhbm5vdGF0aW9uIGNoYW5nZXMsIGxpa2UgdGhyb3VnaCBbW0VkaXRTZXNzaW9uLnNldEFubm90YXRpb25zXV0uXG4gKlxuICogQGV2ZW50IGNoYW5nZUFubm90YXRpb25cbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIGEgYmFja2dyb3VuZCB0b2tlbml6ZXIgYXN5bmNocm9ub3VzbHkgcHJvY2Vzc2VzIG5ldyByb3dzLlxuICogQGV2ZW50IHRva2VuaXplclVwZGF0ZVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBlIEFuIG9iamVjdCBjb250YWluaW5nIG9uZSBwcm9wZXJ0eSwgYFwiZGF0YVwiYCwgdGhhdCBjb250YWlucyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgY2hhbmdpbmcgcm93c1xuICpcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBjdXJyZW50IG1vZGUgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlTW9kZVxuICpcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSB3cmFwIG1vZGUgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlV3JhcE1vZGVcbiAqXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgd3JhcHBpbmcgbGltaXQgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlV3JhcExpbWl0XG4gKlxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBjb2RlIGZvbGQgaXMgYWRkZWQgb3IgcmVtb3ZlZC5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlRm9sZFxuICpcbiAqKi9cbi8qKlxuKiBFbWl0dGVkIHdoZW4gdGhlIHNjcm9sbCB0b3AgY2hhbmdlcy5cbiogQGV2ZW50IGNoYW5nZVNjcm9sbFRvcFxuKlxuKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBuZXcgc2Nyb2xsIHRvcCB2YWx1ZVxuKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgc2Nyb2xsIGxlZnQgY2hhbmdlcy5cbiAqIEBldmVudCBjaGFuZ2VTY3JvbGxMZWZ0XG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbExlZnQgVGhlIG5ldyBzY3JvbGwgbGVmdCB2YWx1ZVxuICoqL1xuLy99XG5cbi8qKlxuICpcbiAqIFNldHMgdXAgYSBuZXcgYEVkaXRTZXNzaW9uYCBhbmQgYXNzb2NpYXRlcyBpdCB3aXRoIHRoZSBnaXZlbiBgRG9jdW1lbnRgIGFuZCBgVGV4dE1vZGVgLlxuICogQHBhcmFtIHtEb2N1bWVudCB8IFN0cmluZ30gdGV4dCBbSWYgYHRleHRgIGlzIGEgYERvY3VtZW50YCwgaXQgYXNzb2NpYXRlcyB0aGUgYEVkaXRTZXNzaW9uYCB3aXRoIGl0LiBPdGhlcndpc2UsIGEgbmV3IGBEb2N1bWVudGAgaXMgY3JlYXRlZCwgd2l0aCB0aGUgaW5pdGlhbCB0ZXh0XXs6ICN0ZXh0UGFyYW19XG4gKiBAcGFyYW0ge1RleHRNb2RlfSBtb2RlIFtUaGUgaW5pdGFsIGxhbmd1YWdlIG1vZGUgdG8gdXNlIGZvciB0aGUgZG9jdW1lbnRdezogI21vZGVQYXJhbX1cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqKi9cblxuZXhwb3J0IGNsYXNzIEVkaXRTZXNzaW9uIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3MgaW1wbGVtZW50cyBCcmFja2V0TWF0Y2hlciB7XG4gIHB1YmxpYyAkYnJlYWtwb2ludHM6IHN0cmluZ1tdID0gW107XG4gIHB1YmxpYyAkZGVjb3JhdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIHByaXZhdGUgJGZyb250TWFya2VycyA9IHt9O1xuICBwdWJsaWMgJGJhY2tNYXJrZXJzID0ge307XG4gIHByaXZhdGUgJG1hcmtlcklkID0gMTtcbiAgcHJpdmF0ZSAkdW5kb1NlbGVjdCA9IHRydWU7XG4gIHByaXZhdGUgJGRlbHRhcztcbiAgcHJpdmF0ZSAkZGVsdGFzRG9jO1xuICBwcml2YXRlICRkZWx0YXNGb2xkO1xuICBwcml2YXRlICRmcm9tVW5kbztcbiAgcHJpdmF0ZSAkZm9sZERhdGEgPSBbXTtcbiAgcHVibGljIGRvYzogRG9jdW1lbnQ7XG4gIHByaXZhdGUgJGRlZmF1bHRVbmRvTWFuYWdlciA9IHsgdW5kbzogZnVuY3Rpb24oKSB7IH0sIHJlZG86IGZ1bmN0aW9uKCkgeyB9LCByZXNldDogZnVuY3Rpb24oKSB7IH0gfTtcbiAgcHJpdmF0ZSAkdW5kb01hbmFnZXI6IFVuZG9NYW5hZ2VyO1xuICBwcml2YXRlICRpbmZvcm1VbmRvTWFuYWdlcjogeyBjYW5jZWw6ICgpID0+IHZvaWQ7IHNjaGVkdWxlOiAoKSA9PiB2b2lkIH07XG4gIHB1YmxpYyBiZ1Rva2VuaXplcjogQmFja2dyb3VuZFRva2VuaXplcjtcbiAgcHVibGljICRtb2RpZmllZDtcbiAgcHVibGljIHNlbGVjdGlvbjogU2VsZWN0aW9uO1xuICBwcml2YXRlICRkb2NSb3dDYWNoZTogbnVtYmVyW107XG4gIHByaXZhdGUgJHdyYXBEYXRhOiBudW1iZXJbXVtdO1xuICBwcml2YXRlICRzY3JlZW5Sb3dDYWNoZTogbnVtYmVyW107XG4gIHByaXZhdGUgJHJvd0xlbmd0aENhY2hlO1xuICBwcml2YXRlICRvdmVyd3JpdGUgPSBmYWxzZTtcbiAgcHVibGljICRzZWFyY2hIaWdobGlnaHQ7XG4gIHByaXZhdGUgJGFubm90YXRpb25zO1xuICBwcml2YXRlICRhdXRvTmV3TGluZTtcbiAgcHJpdmF0ZSBnZXRPcHRpb247XG4gIHByaXZhdGUgc2V0T3B0aW9uO1xuICBwcml2YXRlICR1c2VXb3JrZXI7XG4gIHByaXZhdGUgJG1vZGVzID0ge307XG4gIHB1YmxpYyAkbW9kZSA9IG51bGw7XG4gIHByaXZhdGUgJG1vZGVJZCA9IG51bGw7XG4gIHByaXZhdGUgJHdvcmtlcjtcbiAgcHJpdmF0ZSAkb3B0aW9ucztcbiAgcHVibGljIHRva2VuUmU6IFJlZ0V4cDtcbiAgcHVibGljIG5vblRva2VuUmU6IFJlZ0V4cDtcbiAgcHVibGljICRzY3JvbGxUb3AgPSAwO1xuICBwcml2YXRlICRzY3JvbGxMZWZ0ID0gMDtcbiAgLy8gV1JBUE1PREVcbiAgcHJpdmF0ZSAkd3JhcEFzQ29kZTtcbiAgcHJpdmF0ZSAkd3JhcExpbWl0ID0gODA7XG4gIHB1YmxpYyAkdXNlV3JhcE1vZGUgPSBmYWxzZTtcbiAgcHJpdmF0ZSAkd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgbWluOiBudWxsLFxuICAgIG1heDogbnVsbFxuICB9O1xuICBwdWJsaWMgJHVwZGF0aW5nO1xuICBwdWJsaWMgbGluZVdpZGdldHMgPSBudWxsO1xuICBwcml2YXRlICRvbkNoYW5nZSA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcbiAgcHJpdmF0ZSAkc3luY0luZm9ybVVuZG9NYW5hZ2VyOiAoKSA9PiB2b2lkO1xuICBwdWJsaWMgbWVyZ2VVbmRvRGVsdGFzOiBib29sZWFuO1xuICBwcml2YXRlICR1c2VTb2Z0VGFiczogYm9vbGVhbjtcbiAgcHJpdmF0ZSAkdGFiU2l6ZTogbnVtYmVyO1xuICBwcml2YXRlICR3cmFwTWV0aG9kO1xuICBwcml2YXRlIHNjcmVlbldpZHRoO1xuICBwcml2YXRlIGxpbmVXaWRnZXRzV2lkdGg7XG4gIHByaXZhdGUgbGluZVdpZGdldFdpZHRoO1xuICBwcml2YXRlICRnZXRXaWRnZXRTY3JlZW5MZW5ndGg7XG4gIC8vIFRPRE86IEZPTERJTkc6IFRoZXNlIGNvbWUgZnJvbSBhIHVuZGVyLXRoZS1yYWRhciBtaXhpbi4gVXNlIHRoZSBUeXBlU2NyaXB0IHdheSBpbnN0ZWFkLlxuICBwdWJsaWMgZ2V0TmV4dEZvbGRMaW5lXG4gIHByaXZhdGUgYWRkRm9sZHNcbiAgcHJpdmF0ZSBnZXRGb2xkc0luUmFuZ2U7XG4gIHB1YmxpYyBnZXRSb3dGb2xkU3RhcnQ7XG4gIHB1YmxpYyBnZXRSb3dGb2xkRW5kO1xuICBwcml2YXRlICRzZXRGb2xkaW5nO1xuICBwcml2YXRlIHJlbW92ZUZvbGRzO1xuICBwdWJsaWMgZ2V0Rm9sZExpbmU7XG4gIHByaXZhdGUgZ2V0Rm9sZERpc3BsYXlMaW5lO1xuICBwdWJsaWMgZ2V0Rm9sZEF0O1xuICBwdWJsaWMgcmVtb3ZlRm9sZDtcbiAgcHVibGljIGV4cGFuZEZvbGQ7XG4gIC8vXG4gIHB1YmxpYyAkdGFnSGlnaGxpZ2h0O1xuICBwdWJsaWMgJGJyYWNrZXRIaWdobGlnaHQ6IG51bWJlcjsgICAvLyBhIG1hcmtlci5cbiAgcHVibGljICRoaWdobGlnaHRMaW5lTWFya2VyOyAgICAgICAgLy8gTm90IGEgbWFya2VyIVxuICAvKipcbiAgICogQSBudW1iZXIgaXMgYSBtYXJrZXIgaWRlbnRpZmllciwgbnVsbCBpbmRpY2F0ZXMgdGhhdCBubyBzdWNoIG1hcmtlciBleGlzdHMuIFxuICAgKi9cbiAgcHVibGljICRzZWxlY3Rpb25NYXJrZXI6IG51bWJlciA9IG51bGw7XG4gIHByaXZhdGUgJGJyYWNrZXRNYXRjaGVyOiBCcmFja2V0TWF0Y2hTZXJ2aWNlID0gbmV3IEJyYWNrZXRNYXRjaFNlcnZpY2UodGhpcyk7XG4gIC8vIEZJWE1FOiBJIGRvbid0IHNlZSB3aGVyZSB0aGlzIGlzIGluaXRpYWxpemVkLlxuICBwdWJsaWMgdW5mb2xkO1xuICAvKipcbiAgICogQHBhcmFtIFt0ZXh0XSB7c3RyaW5nfERvY3VtZW50fSBUaGUgZG9jdW1lbnQgb3Igc3RyaW5nIG92ZXIgd2hpY2ggdGhpcyBlZGl0IHNlc3Npb24gd29ya3MuXG4gICAqIEBwYXJhbSBbbW9kZV1cbiAgICovXG4gIGNvbnN0cnVjdG9yKHRleHQ6IGFueSwgbW9kZT8pIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMuJGZvbGREYXRhLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdGhpcy5qb2luKFwiXFxuXCIpO1xuICAgIH1cbiAgICB0aGlzLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLm9uQ2hhbmdlRm9sZC5iaW5kKHRoaXMpKTtcblxuICAgIC8vIFRoZSBmaXJzdCBhcmd1bWVudCBtYXkgYmUgZWl0aGVyIGEgc3RyaW5nIG9yIGEgRG9jdW1lbnQuXG4gICAgLy8gSXQgbWlnaHQgZXZlbiBiZSBhIHN0cmluZ1tdLlxuICAgIC8vIEZJWE1FOiBNYXkgYmUgYmV0dGVyIGZvciBjb25zdHJ1Y3RvcnMgdG8gbWFrZSBhIGNob2ljZS5cbiAgICAvLyBDb252ZW5pZW5jZSBmdW5jdGlvbiBjb3VsZCBiZSBhZGRlZC5cbiAgICBpZiAodHlwZW9mIHRleHQgIT09IFwib2JqZWN0XCIgfHwgIXRleHQuZ2V0TGluZSkge1xuICAgICAgdGhpcy5zZXREb2N1bWVudChuZXcgRG9jdW1lbnQodGV4dCkpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHRoaXMuc2V0RG9jdW1lbnQodGV4dClcbiAgICB9XG5cbiAgICB0aGlzLnNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24odGhpcyk7XG5cbiAgICByZXNldE9wdGlvbnModGhpcyk7XG4gICAgdGhpcy5zZXRNb2RlKG1vZGUpO1xuICAgIF9zaWduYWwoXCJzZXNzaW9uXCIsIHRoaXMpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIGBFZGl0U2Vzc2lvbmAgdG8gcG9pbnQgdG8gYSBuZXcgYERvY3VtZW50YC4gSWYgYSBgQmFja2dyb3VuZFRva2VuaXplcmAgZXhpc3RzLCBpdCBhbHNvIHBvaW50cyB0byBgZG9jYC5cbiAgICogQG1ldGhvZCBzZXREb2N1bWVudFxuICAgKiBAcGFyYW0gZG9jIHtEb2N1bWVudH0gVGhlIG5ldyBgRG9jdW1lbnRgIHRvIHVzZS5cbiAgICogQHJldHVybiB7dm9pZH1cbiAgICovXG4gIHByaXZhdGUgc2V0RG9jdW1lbnQoZG9jOiBEb2N1bWVudCk6IHZvaWQge1xuICAgIGlmICh0aGlzLmRvYykge1xuICAgICAgdGhpcy5kb2MucmVtb3ZlTGlzdGVuZXIoXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgIH1cblxuICAgIHRoaXMuZG9jID0gZG9jO1xuICAgIGRvYy5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG5cbiAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuICAgIH1cblxuICAgIHRoaXMucmVzZXRDYWNoZXMoKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIHRoZSBgRG9jdW1lbnRgIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb24uXG4gICAqIEBtZXRob2QgZ2V0RG9jdW1lbnRcbiAgICogQHJldHVybiB7RG9jdW1lbnR9XG4gICAqL1xuICBwdWJsaWMgZ2V0RG9jdW1lbnQoKTogRG9jdW1lbnQge1xuICAgIHJldHVybiB0aGlzLmRvYztcbiAgfVxuXG4gIC8qKlxuICAgKiBAbWV0aG9kICRyZXNldFJvd0NhY2hlXG4gICAqIEBwYXJhbSB7bnVtYmVyfSByb3cgVGhlIHJvdyB0byB3b3JrIHdpdGhcbiAgICogQHJldHVybiB7dm9pZH1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgJHJlc2V0Um93Q2FjaGUoZG9jUm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAoIWRvY1Jvdykge1xuICAgICAgdGhpcy4kZG9jUm93Q2FjaGUgPSBbXTtcbiAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlID0gW107XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBsID0gdGhpcy4kZG9jUm93Q2FjaGUubGVuZ3RoO1xuICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleCh0aGlzLiRkb2NSb3dDYWNoZSwgZG9jUm93KSArIDE7XG4gICAgaWYgKGwgPiBpKSB7XG4gICAgICB0aGlzLiRkb2NSb3dDYWNoZS5zcGxpY2UoaSwgbCk7XG4gICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5zcGxpY2UoaSwgbCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSAkZ2V0Um93Q2FjaGVJbmRleChjYWNoZUFycmF5OiBudW1iZXJbXSwgdmFsOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHZhciBsb3cgPSAwO1xuICAgIHZhciBoaSA9IGNhY2hlQXJyYXkubGVuZ3RoIC0gMTtcblxuICAgIHdoaWxlIChsb3cgPD0gaGkpIHtcbiAgICAgIHZhciBtaWQgPSAobG93ICsgaGkpID4+IDE7XG4gICAgICB2YXIgYyA9IGNhY2hlQXJyYXlbbWlkXTtcblxuICAgICAgaWYgKHZhbCA+IGMpIHtcbiAgICAgICAgbG93ID0gbWlkICsgMTtcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKHZhbCA8IGMpIHtcbiAgICAgICAgaGkgPSBtaWQgLSAxO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHJldHVybiBtaWQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGxvdyAtIDE7XG4gIH1cblxuICBwcml2YXRlIHJlc2V0Q2FjaGVzKCkge1xuICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICB0aGlzLiR3cmFwRGF0YSA9IFtdO1xuICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlID0gW107XG4gICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIG9uQ2hhbmdlRm9sZChlKSB7XG4gICAgdmFyIGZvbGQgPSBlLmRhdGE7XG4gICAgdGhpcy4kcmVzZXRSb3dDYWNoZShmb2xkLnN0YXJ0LnJvdyk7XG4gIH1cblxuICBwcml2YXRlIG9uQ2hhbmdlKGUpIHtcbiAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuXG4gICAgdGhpcy4kcmVzZXRSb3dDYWNoZShkZWx0YS5yYW5nZS5zdGFydC5yb3cpO1xuXG4gICAgdmFyIHJlbW92ZWRGb2xkcyA9IHRoaXMuJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGUpO1xuICAgIGlmICghdGhpcy4kZnJvbVVuZG8gJiYgdGhpcy4kdW5kb01hbmFnZXIgJiYgIWRlbHRhLmlnbm9yZSkge1xuICAgICAgdGhpcy4kZGVsdGFzRG9jLnB1c2goZGVsdGEpO1xuICAgICAgaWYgKHJlbW92ZWRGb2xkcyAmJiByZW1vdmVkRm9sZHMubGVuZ3RoICE9IDApIHtcbiAgICAgICAgdGhpcy4kZGVsdGFzRm9sZC5wdXNoKHtcbiAgICAgICAgICBhY3Rpb246IFwicmVtb3ZlRm9sZHNcIixcbiAgICAgICAgICBmb2xkczogcmVtb3ZlZEZvbGRzXG4gICAgICAgIH0pO1xuICAgICAgfVxuXG4gICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlci5zY2hlZHVsZSgpO1xuICAgIH1cblxuICAgIHRoaXMuYmdUb2tlbml6ZXIuJHVwZGF0ZU9uQ2hhbmdlKGRlbHRhKTtcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VcIiwgZSk7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgc2Vzc2lvbiB0ZXh0LlxuICAgKiBAbWV0aG9kIHNldFZhbHVlXG4gICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IFRoZSBuZXcgdGV4dCB0byBwbGFjZS5cbiAgICogQHJldHVybiB7dm9pZH1cbiAgICogQHByaXZhdGVcbiAgICovXG4gIHByaXZhdGUgc2V0VmFsdWUodGV4dDogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy5kb2Muc2V0VmFsdWUodGV4dCk7XG4gICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKDAsIDApO1xuXG4gICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICB0aGlzLiRkZWx0YXMgPSBbXTtcbiAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICB0aGlzLiRkZWx0YXNGb2xkID0gW107XG4gICAgdGhpcy5zZXRVbmRvTWFuYWdlcih0aGlzLiR1bmRvTWFuYWdlcik7XG4gICAgdGhpcy5nZXRVbmRvTWFuYWdlcigpLnJlc2V0KCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IFtbRG9jdW1lbnQgYERvY3VtZW50YF1dIGFzIGEgc3RyaW5nLlxuICAqIEBtZXRob2QgdG9TdHJpbmdcbiAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAqKi9cbiAgcHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0VmFsdWUoKTtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIGN1cnJlbnQgW1tEb2N1bWVudCBgRG9jdW1lbnRgXV0gYXMgYSBzdHJpbmcuXG4gICogQG1ldGhvZCBnZXRWYWx1ZVxuICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICogQGFsaWFzIEVkaXRTZXNzaW9uLnRvU3RyaW5nXG4gICoqL1xuICBwdWJsaWMgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5kb2MuZ2V0VmFsdWUoKTtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIHN0cmluZyBvZiB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG4gICoqL1xuICBwdWJsaWMgZ2V0U2VsZWN0aW9uKCk6IFNlbGVjdGlvbiB7XG4gICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uO1xuICB9XG5cbiAgLyoqXG4gICAqIHs6QmFja2dyb3VuZFRva2VuaXplci5nZXRTdGF0ZX1cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHN0YXJ0IGF0XG4gICAqXG4gICAqIEByZWxhdGVkIEJhY2tncm91bmRUb2tlbml6ZXIuZ2V0U3RhdGVcbiAgICoqL1xuICBwdWJsaWMgZ2V0U3RhdGUocm93OiBudW1iZXIpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFN0YXRlKHJvdyk7XG4gIH1cblxuICAvKipcbiAgICogU3RhcnRzIHRva2VuaXppbmcgYXQgdGhlIHJvdyBpbmRpY2F0ZWQuIFJldHVybnMgYSBsaXN0IG9mIG9iamVjdHMgb2YgdGhlIHRva2VuaXplZCByb3dzLlxuICAgKiBAbWV0aG9kIGdldFRva2Vuc1xuICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9IFRoZSByb3cgdG8gc3RhcnQgYXQuXG4gICAqKi9cbiAgcHVibGljIGdldFRva2Vucyhyb3c6IG51bWJlcik6IHsgdHlwZTogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH1bXSB7XG4gICAgcmV0dXJuIHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSB0b2tlbiBhdCB0aGUgY3VycmVudCByb3cuIFRoZSBvYmplY3QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgaW5kZXhgIGFuZCBgc3RhcnRgLlxuICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXIgdG8gcmV0cmlldmUgZnJvbVxuICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiBudW1iZXIgdG8gcmV0cmlldmUgZnJvbVxuICAqXG4gICpcbiAgKiovXG4gIHB1YmxpYyBnZXRUb2tlbkF0KHJvdzogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIpIHtcbiAgICB2YXIgdG9rZW5zOiB7IHZhbHVlOiBzdHJpbmcgfVtdID0gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICB2YXIgdG9rZW46IHsgaW5kZXg/OiBudW1iZXI7IHN0YXJ0PzogbnVtYmVyOyB2YWx1ZTogc3RyaW5nIH07XG4gICAgdmFyIGMgPSAwO1xuICAgIGlmIChjb2x1bW4gPT0gbnVsbCkge1xuICAgICAgaSA9IHRva2Vucy5sZW5ndGggLSAxO1xuICAgICAgYyA9IHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICBjICs9IHRva2Vuc1tpXS52YWx1ZS5sZW5ndGg7XG4gICAgICAgIGlmIChjID49IGNvbHVtbilcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gICAgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgaWYgKCF0b2tlbilcbiAgICAgIHJldHVybiBudWxsO1xuICAgIHRva2VuLmluZGV4ID0gaTtcbiAgICB0b2tlbi5zdGFydCA9IGMgLSB0b2tlbi52YWx1ZS5sZW5ndGg7XG4gICAgcmV0dXJuIHRva2VuO1xuICB9XG5cbiAgLyoqXG4gICogU2V0cyB0aGUgdW5kbyBtYW5hZ2VyLlxuICAqIEBwYXJhbSB7VW5kb01hbmFnZXJ9IHVuZG9NYW5hZ2VyIFRoZSBuZXcgdW5kbyBtYW5hZ2VyXG4gICoqL1xuICBwdWJsaWMgc2V0VW5kb01hbmFnZXIodW5kb01hbmFnZXI6IFVuZG9NYW5hZ2VyKTogdm9pZCB7XG4gICAgdGhpcy4kdW5kb01hbmFnZXIgPSB1bmRvTWFuYWdlcjtcbiAgICB0aGlzLiRkZWx0YXMgPSBbXTtcbiAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICB0aGlzLiRkZWx0YXNGb2xkID0gW107XG5cbiAgICBpZiAodGhpcy4kaW5mb3JtVW5kb01hbmFnZXIpXG4gICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlci5jYW5jZWwoKTtcblxuICAgIGlmICh1bmRvTWFuYWdlcikge1xuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICB0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgc2VsZi4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICAgICAgaWYgKHNlbGYuJGRlbHRhc0ZvbGQubGVuZ3RoKSB7XG4gICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgZ3JvdXA6IFwiZm9sZFwiLFxuICAgICAgICAgICAgZGVsdGFzOiBzZWxmLiRkZWx0YXNGb2xkXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgc2VsZi4kZGVsdGFzRm9sZCA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNlbGYuJGRlbHRhc0RvYy5sZW5ndGgpIHtcbiAgICAgICAgICBzZWxmLiRkZWx0YXMucHVzaCh7XG4gICAgICAgICAgICBncm91cDogXCJkb2NcIixcbiAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRG9jXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgc2VsZi4kZGVsdGFzRG9jID0gW107XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2VsZi4kZGVsdGFzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICB1bmRvTWFuYWdlci5leGVjdXRlKHtcbiAgICAgICAgICAgIGFjdGlvbjogXCJhY2V1cGRhdGVcIixcbiAgICAgICAgICAgIGFyZ3M6IFtzZWxmLiRkZWx0YXMsIHNlbGZdLFxuICAgICAgICAgICAgbWVyZ2U6IHNlbGYubWVyZ2VVbmRvRGVsdGFzXG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5tZXJnZVVuZG9EZWx0YXMgPSBmYWxzZTtcbiAgICAgICAgc2VsZi4kZGVsdGFzID0gW107XG4gICAgICB9O1xuICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIgPSBkZWxheWVkQ2FsbCh0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgYSBuZXcgZ3JvdXAgaW4gdW5kbyBoaXN0b3J5XG4gICAqKi9cbiAgcHJpdmF0ZSBtYXJrVW5kb0dyb3VwKCkge1xuICAgIGlmICh0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIpXG4gICAgICB0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIoKTtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdW5kbyBtYW5hZ2VyLlxuICAqKi9cbiAgcHVibGljIGdldFVuZG9NYW5hZ2VyKCkge1xuICAgIHJldHVybiB0aGlzLiR1bmRvTWFuYWdlciB8fCB0aGlzLiRkZWZhdWx0VW5kb01hbmFnZXI7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHZhbHVlIGZvciB0YWJzLiBJZiB0aGUgdXNlciBpcyB1c2luZyBzb2Z0IHRhYnMsIHRoaXMgd2lsbCBiZSBhIHNlcmllcyBvZiBzcGFjZXMgKGRlZmluZWQgYnkgW1tFZGl0U2Vzc2lvbi5nZXRUYWJTaXplIGBnZXRUYWJTaXplKClgXV0pOyBvdGhlcndpc2UgaXQncyBzaW1wbHkgYCdcXHQnYC5cbiAgKiovXG4gIHB1YmxpYyBnZXRUYWJTdHJpbmcoKSB7XG4gICAgaWYgKHRoaXMuZ2V0VXNlU29mdFRhYnMoKSkge1xuICAgICAgcmV0dXJuIHN0cmluZ1JlcGVhdChcIiBcIiwgdGhpcy5nZXRUYWJTaXplKCkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gXCJcXHRcIjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgLyoqXG4gICogUGFzcyBgdHJ1ZWAgdG8gZW5hYmxlIHRoZSB1c2Ugb2Ygc29mdCB0YWJzLiBTb2Z0IHRhYnMgbWVhbnMgeW91J3JlIHVzaW5nIHNwYWNlcyBpbnN0ZWFkIG9mIHRoZSB0YWIgY2hhcmFjdGVyIChgJ1xcdCdgKS5cbiAgKiBAcGFyYW0ge0Jvb2xlYW59IHVzZVNvZnRUYWJzIFZhbHVlIGluZGljYXRpbmcgd2hldGhlciBvciBub3QgdG8gdXNlIHNvZnQgdGFic1xuICAqKi9cbiAgcHJpdmF0ZSBzZXRVc2VTb2Z0VGFicyh2YWwpIHtcbiAgICB0aGlzLnNldE9wdGlvbihcInVzZVNvZnRUYWJzXCIsIHZhbCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGB0cnVlYCBpZiBzb2Z0IHRhYnMgYXJlIGJlaW5nIHVzZWQsIGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAqKi9cbiAgcHVibGljIGdldFVzZVNvZnRUYWJzKCkge1xuICAgIC8vIHRvZG8gbWlnaHQgbmVlZCBtb3JlIGdlbmVyYWwgd2F5IGZvciBjaGFuZ2luZyBzZXR0aW5ncyBmcm9tIG1vZGUsIGJ1dCB0aGlzIGlzIG9rIGZvciBub3dcbiAgICByZXR1cm4gdGhpcy4kdXNlU29mdFRhYnMgJiYgIXRoaXMuJG1vZGUuJGluZGVudFdpdGhUYWJzO1xuICB9XG5cbiAgLyoqXG4gICogU2V0IHRoZSBudW1iZXIgb2Ygc3BhY2VzIHRoYXQgZGVmaW5lIGEgc29mdCB0YWIuXG4gICogRm9yIGV4YW1wbGUsIHBhc3NpbmcgaW4gYDRgIHRyYW5zZm9ybXMgdGhlIHNvZnQgdGFicyB0byBiZSBlcXVpdmFsZW50IHRvIGZvdXIgc3BhY2VzLlxuICAqIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYGNoYW5nZVRhYlNpemVgIGV2ZW50LlxuICAqIEBwYXJhbSB7TnVtYmVyfSB0YWJTaXplIFRoZSBuZXcgdGFiIHNpemVcbiAgKiovXG4gIHByaXZhdGUgc2V0VGFiU2l6ZSh0YWJTaXplOiBudW1iZXIpIHtcbiAgICB0aGlzLnNldE9wdGlvbihcInRhYlNpemVcIiwgdGFiU2l6ZSk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHRhYiBzaXplLlxuICAqKi9cbiAgcHVibGljIGdldFRhYlNpemUoKSB7XG4gICAgcmV0dXJuIHRoaXMuJHRhYlNpemU7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY2hhcmFjdGVyIGF0IHRoZSBwb3NpdGlvbiBpcyBhIHNvZnQgdGFiLlxuICAqIEBwYXJhbSB7T2JqZWN0fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24gdG8gY2hlY2tcbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgaXNUYWJTdG9wKHBvc2l0aW9uOiB7IGNvbHVtbjogbnVtYmVyIH0pIHtcbiAgICByZXR1cm4gdGhpcy4kdXNlU29mdFRhYnMgJiYgKHBvc2l0aW9uLmNvbHVtbiAlIHRoaXMuJHRhYlNpemUgPT09IDApO1xuICB9XG5cbiAgLyoqXG4gICogUGFzcyBpbiBgdHJ1ZWAgdG8gZW5hYmxlIG92ZXJ3cml0ZXMgaW4geW91ciBzZXNzaW9uLCBvciBgZmFsc2VgIHRvIGRpc2FibGUuXG4gICpcbiAgKiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAqXG4gICogQHBhcmFtIHtCb29sZWFufSBvdmVyd3JpdGUgRGVmaW5lcyB3aGV0aGVyIG9yIG5vdCB0byBzZXQgb3ZlcndyaXRlc1xuICAqXG4gICpcbiAgKiovXG4gIHB1YmxpYyBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKSB7XG4gICAgdGhpcy5zZXRPcHRpb24oXCJvdmVyd3JpdGVcIiwgb3ZlcndyaXRlKTtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgYHRydWVgIGlmIG92ZXJ3cml0ZXMgYXJlIGVuYWJsZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAqKi9cbiAgcHVibGljIGdldE92ZXJ3cml0ZSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy4kb3ZlcndyaXRlO1xuICB9XG5cbiAgLyoqXG4gICogU2V0cyB0aGUgdmFsdWUgb2Ygb3ZlcndyaXRlIHRvIHRoZSBvcHBvc2l0ZSBvZiB3aGF0ZXZlciBpdCBjdXJyZW50bHkgaXMuXG4gICoqL1xuICBwdWJsaWMgdG9nZ2xlT3ZlcndyaXRlKCk6IHZvaWQge1xuICAgIHRoaXMuc2V0T3ZlcndyaXRlKCF0aGlzLiRvdmVyd3JpdGUpO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgYGNsYXNzTmFtZWAgdG8gdGhlIGByb3dgLCB0byBiZSB1c2VkIGZvciBDU1Mgc3R5bGluZ3MgYW5kIHdoYXRub3QuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAqL1xuICBwdWJsaWMgYWRkR3V0dGVyRGVjb3JhdGlvbihyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuJGRlY29yYXRpb25zW3Jvd10pIHtcbiAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gPSBcIlwiO1xuICAgIH1cbiAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddICs9IFwiIFwiICsgY2xhc3NOYW1lO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlbW92ZXMgYGNsYXNzTmFtZWAgZnJvbSB0aGUgYHJvd2AuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXJcbiAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAqL1xuICBwdWJsaWMgcmVtb3ZlR3V0dGVyRGVjb3JhdGlvbihyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddID0gKHRoaXMuJGRlY29yYXRpb25zW3Jvd10gfHwgXCJcIikucmVwbGFjZShcIiBcIiArIGNsYXNzTmFtZSwgXCJcIik7XG4gICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIG51bWJlcnMsIGluZGljYXRpbmcgd2hpY2ggcm93cyBoYXZlIGJyZWFrcG9pbnRzLlxuICAqIEByZXR1cm5zIHtbTnVtYmVyXX1cbiAgKiovXG4gIHByaXZhdGUgZ2V0QnJlYWtwb2ludHMoKSB7XG4gICAgcmV0dXJuIHRoaXMuJGJyZWFrcG9pbnRzO1xuICB9XG5cbiAgLyoqXG4gICogU2V0cyBhIGJyZWFrcG9pbnQgb24gZXZlcnkgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGAnY2hhbmdlQnJlYWtwb2ludCdgIGV2ZW50LlxuICAqIEBwYXJhbSB7QXJyYXl9IHJvd3MgQW4gYXJyYXkgb2Ygcm93IGluZGljZXNcbiAgKlxuICAqXG4gICpcbiAgKiovXG4gIHByaXZhdGUgc2V0QnJlYWtwb2ludHMocm93czogbnVtYmVyW10pOiB2b2lkIHtcbiAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93c1tpXV0gPSBcImFjZV9icmVha3BvaW50XCI7XG4gICAgfVxuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogUmVtb3ZlcyBhbGwgYnJlYWtwb2ludHMgb24gdGhlIHJvd3MuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGAnY2hhbmdlQnJlYWtwb2ludCdgIGV2ZW50LlxuICAqKi9cbiAgcHJpdmF0ZSBjbGVhckJyZWFrcG9pbnRzKCkge1xuICAgIHRoaXMuJGJyZWFrcG9pbnRzID0gW107XG4gICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gIH1cblxuICAvKipcbiAgKiBTZXRzIGEgYnJlYWtwb2ludCBvbiB0aGUgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGAnY2hhbmdlQnJlYWtwb2ludCdgIGV2ZW50LlxuICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgKiBAcGFyYW0ge1N0cmluZ30gY2xhc3NOYW1lIENsYXNzIG9mIHRoZSBicmVha3BvaW50XG4gICpcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSBzZXRCcmVha3BvaW50KHJvdywgY2xhc3NOYW1lKSB7XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gdW5kZWZpbmVkKVxuICAgICAgY2xhc3NOYW1lID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgIGlmIChjbGFzc05hbWUpXG4gICAgICB0aGlzLiRicmVha3BvaW50c1tyb3ddID0gY2xhc3NOYW1lO1xuICAgIGVsc2VcbiAgICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogUmVtb3ZlcyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICpcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSBjbGVhckJyZWFrcG9pbnQocm93KSB7XG4gICAgZGVsZXRlIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd107XG4gICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gIH1cblxuICAvKipcbiAgKiBBZGRzIGEgbmV3IG1hcmtlciB0byB0aGUgZ2l2ZW4gYFJhbmdlYC4gSWYgYGluRnJvbnRgIGlzIGB0cnVlYCwgYSBmcm9udCBtYXJrZXIgaXMgZGVmaW5lZCwgYW5kIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgZmlyZXM7IG90aGVyd2lzZSwgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGZpcmVzLlxuICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIERlZmluZSB0aGUgcmFuZ2Ugb2YgdGhlIG1hcmtlclxuICAqIEBwYXJhbSB7U3RyaW5nfSBjbGF6eiBTZXQgdGhlIENTUyBjbGFzcyBmb3IgdGhlIG1hcmtlclxuICAqIEBwYXJhbSB7RnVuY3Rpb24gfCBTdHJpbmd9IHR5cGUgSWRlbnRpZnkgdGhlIHR5cGUgb2YgdGhlIG1hcmtlclxuICAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5Gcm9udCBTZXQgdG8gYHRydWVgIHRvIGVzdGFibGlzaCBhIGZyb250IG1hcmtlclxuICAqXG4gICpcbiAgKiBAcmV0dXJuIHtOdW1iZXJ9IFRoZSBuZXcgbWFya2VyIGlkXG4gICoqL1xuICBwdWJsaWMgYWRkTWFya2VyKHJhbmdlOiBSYW5nZSwgY2xheno6IHN0cmluZywgdHlwZSwgaW5Gcm9udD86IGJvb2xlYW4pOiBudW1iZXIge1xuICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICB2YXIgbWFya2VyID0ge1xuICAgICAgcmFuZ2U6IHJhbmdlLFxuICAgICAgdHlwZTogdHlwZSB8fCBcImxpbmVcIixcbiAgICAgIHJlbmRlcmVyOiB0eXBlb2YgdHlwZSA9PSBcImZ1bmN0aW9uXCIgPyB0eXBlIDogbnVsbCxcbiAgICAgIGNsYXp6OiBjbGF6eixcbiAgICAgIGluRnJvbnQ6ICEhaW5Gcm9udCxcbiAgICAgIGlkOiBpZFxuICAgIH07XG5cbiAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHRoaXMuJGJhY2tNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIGlkO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgYSBkeW5hbWljIG1hcmtlciB0byB0aGUgc2Vzc2lvbi5cbiAgICogQHBhcmFtIHtPYmplY3R9IG1hcmtlciBvYmplY3Qgd2l0aCB1cGRhdGUgbWV0aG9kXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5Gcm9udCBTZXQgdG8gYHRydWVgIHRvIGVzdGFibGlzaCBhIGZyb250IG1hcmtlclxuICAgKlxuICAgKlxuICAgKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBhZGRlZCBtYXJrZXJcbiAgICoqL1xuICBwcml2YXRlIGFkZER5bmFtaWNNYXJrZXIobWFya2VyLCBpbkZyb250Pykge1xuICAgIGlmICghbWFya2VyLnVwZGF0ZSlcbiAgICAgIHJldHVybjtcbiAgICB2YXIgaWQgPSB0aGlzLiRtYXJrZXJJZCsrO1xuICAgIG1hcmtlci5pZCA9IGlkO1xuICAgIG1hcmtlci5pbkZyb250ID0gISFpbkZyb250O1xuXG4gICAgaWYgKGluRnJvbnQpIHtcbiAgICAgIHRoaXMuJGZyb250TWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VGcm9udE1hcmtlclwiKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4gbWFya2VyO1xuICB9XG5cbiAgLyoqXG4gICogUmVtb3ZlcyB0aGUgbWFya2VyIHdpdGggdGhlIHNwZWNpZmllZCBJRC4gSWYgdGhpcyBtYXJrZXIgd2FzIGluIGZyb250LCB0aGUgYCdjaGFuZ2VGcm9udE1hcmtlcidgIGV2ZW50IGlzIGVtaXR0ZWQuIElmIHRoZSBtYXJrZXIgd2FzIGluIHRoZSBiYWNrLCB0aGUgYCdjaGFuZ2VCYWNrTWFya2VyJ2AgZXZlbnQgaXMgZW1pdHRlZC5cbiAgKiBAcGFyYW0ge051bWJlcn0gbWFya2VySWQgQSBudW1iZXIgcmVwcmVzZW50aW5nIGEgbWFya2VyXG4gICpcbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgcmVtb3ZlTWFya2VyKG1hcmtlcklkKSB7XG4gICAgdmFyIG1hcmtlciA9IHRoaXMuJGZyb250TWFya2Vyc1ttYXJrZXJJZF0gfHwgdGhpcy4kYmFja01hcmtlcnNbbWFya2VySWRdO1xuICAgIGlmICghbWFya2VyKVxuICAgICAgcmV0dXJuO1xuXG4gICAgdmFyIG1hcmtlcnMgPSBtYXJrZXIuaW5Gcm9udCA/IHRoaXMuJGZyb250TWFya2VycyA6IHRoaXMuJGJhY2tNYXJrZXJzO1xuICAgIGlmIChtYXJrZXIpIHtcbiAgICAgIGRlbGV0ZSAobWFya2Vyc1ttYXJrZXJJZF0pO1xuICAgICAgdGhpcy5fc2lnbmFsKG1hcmtlci5pbkZyb250ID8gXCJjaGFuZ2VGcm9udE1hcmtlclwiIDogXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgSURzIG9mIGFsbCB0aGUgbWFya2VycywgZWl0aGVyIGZyb250IG9yIGJhY2suXG4gICogQHBhcmFtIHtib29sZWFufSBpbkZyb250IElmIGB0cnVlYCwgaW5kaWNhdGVzIHlvdSBvbmx5IHdhbnQgZnJvbnQgbWFya2VyczsgYGZhbHNlYCBpbmRpY2F0ZXMgb25seSBiYWNrIG1hcmtlcnNcbiAgKlxuICAqIEByZXR1cm5zIHtBcnJheX1cbiAgKiovXG4gIHB1YmxpYyBnZXRNYXJrZXJzKGluRnJvbnQ6IGJvb2xlYW4pIHtcbiAgICByZXR1cm4gaW5Gcm9udCA/IHRoaXMuJGZyb250TWFya2VycyA6IHRoaXMuJGJhY2tNYXJrZXJzO1xuICB9XG5cbiAgcHVibGljIGhpZ2hsaWdodChyZSkge1xuICAgIGlmICghdGhpcy4kc2VhcmNoSGlnaGxpZ2h0KSB7XG4gICAgICB2YXIgaGlnaGxpZ2h0ID0gbmV3IFNlYXJjaEhpZ2hsaWdodChudWxsLCBcImFjZV9zZWxlY3RlZC13b3JkXCIsIFwidGV4dFwiKTtcbiAgICAgIHRoaXMuJHNlYXJjaEhpZ2hsaWdodCA9IHRoaXMuYWRkRHluYW1pY01hcmtlcihoaWdobGlnaHQpO1xuICAgIH1cbiAgICB0aGlzLiRzZWFyY2hIaWdobGlnaHQuc2V0UmVnZXhwKHJlKTtcbiAgfVxuXG4gIC8vIGV4cGVyaW1lbnRhbFxuICBwcml2YXRlIGhpZ2hsaWdodExpbmVzKHN0YXJ0Um93LCBlbmRSb3csIGNsYXp6LCBpbkZyb250KSB7XG4gICAgaWYgKHR5cGVvZiBlbmRSb3cgIT0gXCJudW1iZXJcIikge1xuICAgICAgY2xhenogPSBlbmRSb3c7XG4gICAgICBlbmRSb3cgPSBzdGFydFJvdztcbiAgICB9XG4gICAgaWYgKCFjbGF6eilcbiAgICAgIGNsYXp6ID0gXCJhY2Vfc3RlcFwiO1xuXG4gICAgdmFyIHJhbmdlOiBhbnkgPSBuZXcgUmFuZ2Uoc3RhcnRSb3csIDAsIGVuZFJvdywgSW5maW5pdHkpO1xuICAgIHJhbmdlLmlkID0gdGhpcy5hZGRNYXJrZXIocmFuZ2UsIGNsYXp6LCBcImZ1bGxMaW5lXCIsIGluRnJvbnQpO1xuICAgIHJldHVybiByYW5nZTtcbiAgfVxuXG4gIC8qXG4gICAqIEVycm9yOlxuICAgKiAge1xuICAgKiAgICByb3c6IDEyLFxuICAgKiAgICBjb2x1bW46IDIsIC8vY2FuIGJlIHVuZGVmaW5lZFxuICAgKiAgICB0ZXh0OiBcIk1pc3NpbmcgYXJndW1lbnRcIixcbiAgICogICAgdHlwZTogXCJlcnJvclwiIC8vIG9yIFwid2FybmluZ1wiIG9yIFwiaW5mb1wiXG4gICAqICB9XG4gICAqL1xuICAvKipcbiAgKiBTZXRzIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC4gVGhpcyBmdW5jdGlvbnMgZW1pdHMgdGhlIGAnY2hhbmdlQW5ub3RhdGlvbidgIGV2ZW50LlxuICAqIEBwYXJhbSB7QXJyYXl9IGFubm90YXRpb25zIEEgbGlzdCBvZiBhbm5vdGF0aW9uc1xuICAqXG4gICoqL1xuICBwdWJsaWMgc2V0QW5ub3RhdGlvbnMoYW5ub3RhdGlvbnMpIHtcbiAgICB0aGlzLiRhbm5vdGF0aW9ucyA9IGFubm90YXRpb25zO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUFubm90YXRpb25cIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgYW5ub3RhdGlvbnMgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAqIEByZXR1cm5zIHtBcnJheX1cbiAgKiovXG4gIHB1YmxpYyBnZXRBbm5vdGF0aW9ucyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLiRhbm5vdGF0aW9ucyB8fCBbXTtcbiAgfVxuXG4gIC8qKlxuICAqIENsZWFycyBhbGwgdGhlIGFubm90YXRpb25zIGZvciB0aGlzIHNlc3Npb24uIFRoaXMgZnVuY3Rpb24gYWxzbyB0cmlnZ2VycyB0aGUgYCdjaGFuZ2VBbm5vdGF0aW9uJ2AgZXZlbnQuXG4gICoqL1xuICBwcml2YXRlIGNsZWFyQW5ub3RhdGlvbnMoKSB7XG4gICAgdGhpcy5zZXRBbm5vdGF0aW9ucyhbXSk7XG4gIH1cblxuICAvKipcbiAgKiBJZiBgdGV4dGAgY29udGFpbnMgZWl0aGVyIHRoZSBuZXdsaW5lIChgXFxuYCkgb3IgY2FycmlhZ2UtcmV0dXJuICgnXFxyJykgY2hhcmFjdGVycywgYCRhdXRvTmV3TGluZWAgc3RvcmVzIHRoYXQgdmFsdWUuXG4gICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBibG9jayBvZiB0ZXh0XG4gICpcbiAgKiovXG4gIHByaXZhdGUgJGRldGVjdE5ld0xpbmUodGV4dDogc3RyaW5nKSB7XG4gICAgdmFyIG1hdGNoID0gdGV4dC5tYXRjaCgvXi4qPyhcXHI/XFxuKS9tKTtcbiAgICBpZiAobWF0Y2gpIHtcbiAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gbWF0Y2hbMV07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdGhpcy4kYXV0b05ld0xpbmUgPSBcIlxcblwiO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAqIEdpdmVuIGEgc3RhcnRpbmcgcm93IGFuZCBjb2x1bW4sIHRoaXMgbWV0aG9kIHJldHVybnMgdGhlIGBSYW5nZWAgb2YgdGhlIGZpcnN0IHdvcmQgYm91bmRhcnkgaXQgZmluZHMuXG4gICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHN0YXJ0IGF0XG4gICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIHRvIHN0YXJ0IGF0XG4gICpcbiAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICoqL1xuICBwdWJsaWMgZ2V0V29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuICAgIHZhciBsaW5lOiBzdHJpbmcgPSB0aGlzLmdldExpbmUocm93KTtcblxuICAgIHZhciBpblRva2VuID0gZmFsc2U7XG4gICAgaWYgKGNvbHVtbiA+IDApXG4gICAgICBpblRva2VuID0gISFsaW5lLmNoYXJBdChjb2x1bW4gLSAxKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgaWYgKCFpblRva2VuKVxuICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgaWYgKGluVG9rZW4pXG4gICAgICB2YXIgcmUgPSB0aGlzLnRva2VuUmU7XG4gICAgZWxzZSBpZiAoL15cXHMrJC8udGVzdChsaW5lLnNsaWNlKGNvbHVtbiAtIDEsIGNvbHVtbiArIDEpKSlcbiAgICAgIHZhciByZSA9IC9cXHMvO1xuICAgIGVsc2VcbiAgICAgIHZhciByZSA9IHRoaXMubm9uVG9rZW5SZTtcblxuICAgIHZhciBzdGFydCA9IGNvbHVtbjtcbiAgICBpZiAoc3RhcnQgPiAwKSB7XG4gICAgICBkbyB7XG4gICAgICAgIHN0YXJ0LS07XG4gICAgICB9XG4gICAgICB3aGlsZSAoc3RhcnQgPj0gMCAmJiBsaW5lLmNoYXJBdChzdGFydCkubWF0Y2gocmUpKTtcbiAgICAgIHN0YXJ0Kys7XG4gICAgfVxuXG4gICAgdmFyIGVuZCA9IGNvbHVtbjtcbiAgICB3aGlsZSAoZW5kIDwgbGluZS5sZW5ndGggJiYgbGluZS5jaGFyQXQoZW5kKS5tYXRjaChyZSkpIHtcbiAgICAgIGVuZCsrO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgUmFuZ2Uocm93LCBzdGFydCwgcm93LCBlbmQpO1xuICB9XG5cbiAgLyoqXG4gICogR2V0cyB0aGUgcmFuZ2Ugb2YgYSB3b3JkLCBpbmNsdWRpbmcgaXRzIHJpZ2h0IHdoaXRlc3BhY2UuXG4gICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBzdGFydCBmcm9tXG4gICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIG51bWJlciB0byBzdGFydCBmcm9tXG4gICpcbiAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgKiovXG4gIHB1YmxpYyBnZXRBV29yZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuICAgIHZhciB3b3JkUmFuZ2UgPSB0aGlzLmdldFdvcmRSYW5nZShyb3csIGNvbHVtbik7XG4gICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUod29yZFJhbmdlLmVuZC5yb3cpO1xuXG4gICAgd2hpbGUgKGxpbmUuY2hhckF0KHdvcmRSYW5nZS5lbmQuY29sdW1uKS5tYXRjaCgvWyBcXHRdLykpIHtcbiAgICAgIHdvcmRSYW5nZS5lbmQuY29sdW1uICs9IDE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHdvcmRSYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAqIHs6RG9jdW1lbnQuc2V0TmV3TGluZU1vZGUuZGVzY31cbiAgKiBAcGFyYW0ge1N0cmluZ30gbmV3TGluZU1vZGUgezpEb2N1bWVudC5zZXROZXdMaW5lTW9kZS5wYXJhbX1cbiAgKlxuICAqXG4gICogQHJlbGF0ZWQgRG9jdW1lbnQuc2V0TmV3TGluZU1vZGVcbiAgKiovXG4gIHByaXZhdGUgc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGU6IHN0cmluZykge1xuICAgIHRoaXMuZG9jLnNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlKTtcbiAgfVxuXG4gIC8qKlxuICAqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCBuZXcgbGluZSBtb2RlLlxuICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICogQHJlbGF0ZWQgRG9jdW1lbnQuZ2V0TmV3TGluZU1vZGVcbiAgKiovXG4gIHByaXZhdGUgZ2V0TmV3TGluZU1vZGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmdldE5ld0xpbmVNb2RlKCk7XG4gIH1cblxuICAvKipcbiAgKiBJZGVudGlmaWVzIGlmIHlvdSB3YW50IHRvIHVzZSBhIHdvcmtlciBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuXG4gICogQHBhcmFtIHtCb29sZWFufSB1c2VXb3JrZXIgU2V0IHRvIGB0cnVlYCB0byB1c2UgYSB3b3JrZXJcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSBzZXRVc2VXb3JrZXIodXNlV29ya2VyKSB7IHRoaXMuc2V0T3B0aW9uKFwidXNlV29ya2VyXCIsIHVzZVdvcmtlcik7IH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGB0cnVlYCBpZiB3b3JrZXJzIGFyZSBiZWluZyB1c2VkLlxuICAqKi9cbiAgcHJpdmF0ZSBnZXRVc2VXb3JrZXIoKSB7IHJldHVybiB0aGlzLiR1c2VXb3JrZXI7IH1cblxuICAvKipcbiAgKiBSZWxvYWRzIGFsbCB0aGUgdG9rZW5zIG9uIHRoZSBjdXJyZW50IHNlc3Npb24uIFRoaXMgZnVuY3Rpb24gY2FsbHMgW1tCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0IGBCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0ICgpYF1dIHRvIGFsbCB0aGUgcm93czsgaXQgYWxzbyBlbWl0cyB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudC5cbiAgKiovXG4gIHByaXZhdGUgb25SZWxvYWRUb2tlbml6ZXIoZSkge1xuICAgIHZhciByb3dzID0gZS5kYXRhO1xuICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQocm93cy5maXJzdCk7XG4gICAgdGhpcy5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGUpO1xuICB9XG5cblxuICAvKipcbiAgKiBTZXRzIGEgbmV3IHRleHQgbW9kZSBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuIFRoaXMgbWV0aG9kIGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlTW9kZSdgIGV2ZW50LiBJZiBhIFtbQmFja2dyb3VuZFRva2VuaXplciBgQmFja2dyb3VuZFRva2VuaXplcmBdXSBpcyBzZXQsIHRoZSBgJ3Rva2VuaXplclVwZGF0ZSdgIGV2ZW50IGlzIGFsc28gZW1pdHRlZC5cbiAgKiBAcGFyYW0ge1RleHRNb2RlfSBtb2RlIFNldCBhIG5ldyB0ZXh0IG1vZGVcbiAgKiBAcGFyYW0ge2NifSBvcHRpb25hbCBjYWxsYmFja1xuICAqXG4gICoqL1xuICBwcml2YXRlIHNldE1vZGUobW9kZSwgY2I/KSB7XG4gICAgaWYgKG1vZGUgJiYgdHlwZW9mIG1vZGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgIGlmIChtb2RlLmdldFRva2VuaXplcikge1xuICAgICAgICByZXR1cm4gdGhpcy4kb25DaGFuZ2VNb2RlKG1vZGUpO1xuICAgICAgfVxuICAgICAgdmFyIG9wdGlvbnMgPSBtb2RlO1xuICAgICAgdmFyIHBhdGggPSBvcHRpb25zLnBhdGg7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcGF0aCA9IG1vZGUgfHwgXCJhY2UvbW9kZS90ZXh0XCI7XG4gICAgfVxuXG4gICAgLy8gdGhpcyBpcyBuZWVkZWQgaWYgYWNlIGlzbid0IG9uIHJlcXVpcmUgcGF0aCAoZS5nIHRlc3RzIGluIG5vZGUpXG4gICAgaWYgKCF0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0pXG4gICAgICB0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0gPSBuZXcgTW9kZSgpO1xuXG4gICAgaWYgKHRoaXMuJG1vZGVzW3BhdGhdICYmICFvcHRpb25zKSB7XG4gICAgICB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbcGF0aF0pO1xuICAgICAgY2IgJiYgY2IoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gbG9hZCBvbiBkZW1hbmRcbiAgICB0aGlzLiRtb2RlSWQgPSBwYXRoO1xuICAgIGxvYWRNb2R1bGUoW1wibW9kZVwiLCBwYXRoXSwgZnVuY3Rpb24obSkge1xuICAgICAgaWYgKHRoaXMuJG1vZGVJZCAhPT0gcGF0aClcbiAgICAgICAgcmV0dXJuIGNiICYmIGNiKCk7XG4gICAgICBpZiAodGhpcy4kbW9kZXNbcGF0aF0gJiYgIW9wdGlvbnMpXG4gICAgICAgIHJldHVybiB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbcGF0aF0pO1xuICAgICAgaWYgKG0gJiYgbS5Nb2RlKSB7XG4gICAgICAgIG0gPSBuZXcgbS5Nb2RlKG9wdGlvbnMpO1xuICAgICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgICB0aGlzLiRtb2Rlc1twYXRoXSA9IG07XG4gICAgICAgICAgbS4kaWQgPSBwYXRoO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZShtKTtcbiAgICAgICAgY2IgJiYgY2IoKTtcbiAgICAgIH1cbiAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgLy8gc2V0IG1vZGUgdG8gdGV4dCB1bnRpbCBsb2FkaW5nIGlzIGZpbmlzaGVkXG4gICAgaWYgKCF0aGlzLiRtb2RlKSB7XG4gICAgICB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdLCB0cnVlKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlICRvbkNoYW5nZU1vZGUobW9kZSwgJGlzUGxhY2Vob2xkZXI/KSB7XG4gICAgaWYgKCEkaXNQbGFjZWhvbGRlcilcbiAgICAgIHRoaXMuJG1vZGVJZCA9IG1vZGUuJGlkO1xuICAgIGlmICh0aGlzLiRtb2RlID09PSBtb2RlKVxuICAgICAgcmV0dXJuO1xuXG4gICAgdGhpcy4kbW9kZSA9IG1vZGU7XG5cbiAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG5cbiAgICBpZiAodGhpcy4kdXNlV29ya2VyKVxuICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcblxuICAgIHZhciB0b2tlbml6ZXIgPSBtb2RlLmdldFRva2VuaXplcigpO1xuXG4gICAgaWYgKHRva2VuaXplci5hZGRFdmVudExpc3RlbmVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHZhciBvblJlbG9hZFRva2VuaXplciA9IHRoaXMub25SZWxvYWRUb2tlbml6ZXIuYmluZCh0aGlzKTtcbiAgICAgIHRva2VuaXplci5hZGRFdmVudExpc3RlbmVyKFwidXBkYXRlXCIsIG9uUmVsb2FkVG9rZW5pemVyKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIgPSBuZXcgQmFja2dyb3VuZFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIuYWRkRXZlbnRMaXN0ZW5lcihcInVwZGF0ZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIF9zZWxmLl9zaWduYWwoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgZSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aGlzLmJnVG9rZW5pemVyLnNldFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgIH1cblxuICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcblxuICAgIHRoaXMudG9rZW5SZSA9IG1vZGUudG9rZW5SZTtcbiAgICB0aGlzLm5vblRva2VuUmUgPSBtb2RlLm5vblRva2VuUmU7XG5cblxuICAgIGlmICghJGlzUGxhY2Vob2xkZXIpIHtcbiAgICAgIHRoaXMuJG9wdGlvbnMud3JhcE1ldGhvZC5zZXQuY2FsbCh0aGlzLCB0aGlzLiR3cmFwTWV0aG9kKTtcbiAgICAgIHRoaXMuJHNldEZvbGRpbmcobW9kZS5mb2xkaW5nUnVsZXMpO1xuICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VNb2RlXCIpO1xuICAgIH1cbiAgfVxuXG5cbiAgcHJpdmF0ZSAkc3RvcFdvcmtlcigpIHtcbiAgICBpZiAodGhpcy4kd29ya2VyKSB7XG4gICAgICB0aGlzLiR3b3JrZXIudGVybWluYXRlKCk7XG4gICAgfVxuXG4gICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgJHN0YXJ0V29ya2VyKCkge1xuICAgIHRyeSB7XG4gICAgICB0aGlzLiR3b3JrZXIgPSB0aGlzLiRtb2RlLmNyZWF0ZVdvcmtlcih0aGlzKTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCB0ZXh0IG1vZGUuXG4gICogQHJldHVybnMge1RleHRNb2RlfSBUaGUgY3VycmVudCB0ZXh0IG1vZGVcbiAgKiovXG4gIHB1YmxpYyBnZXRNb2RlKCkge1xuICAgIHJldHVybiB0aGlzLiRtb2RlO1xuICB9XG5cbiAgLyoqXG4gICogVGhpcyBmdW5jdGlvbiBzZXRzIHRoZSBzY3JvbGwgdG9wIHZhbHVlLiBJdCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNjcm9sbFRvcCdgIGV2ZW50LlxuICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4gICpcbiAgKiovXG4gIHB1YmxpYyBzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcbiAgICAvLyBUT0RPOiBzaG91bGQgd2UgZm9yY2UgaW50ZWdlciBsaW5laGVpZ2h0IGluc3RlYWQ/IHNjcm9sbFRvcCA9IE1hdGgucm91bmQoc2Nyb2xsVG9wKTsgXG4gICAgaWYgKHRoaXMuJHNjcm9sbFRvcCA9PT0gc2Nyb2xsVG9wIHx8IGlzTmFOKHNjcm9sbFRvcCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy4kc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbFRvcFwiLCBzY3JvbGxUb3ApO1xuICB9XG5cbiAgLyoqXG4gICogW1JldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0b3Agb2YgdGhlIGVkaXRvciBhbmQgdGhlIHRvcG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wfVxuICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICoqL1xuICBwdWJsaWMgZ2V0U2Nyb2xsVG9wKCkge1xuICAgIHJldHVybiB0aGlzLiRzY3JvbGxUb3A7XG4gIH1cblxuICAvKipcbiAgKiBbU2V0cyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGxlZnQgb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxlZnRtb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLnNldFNjcm9sbExlZnR9XG4gICoqL1xuICBwdWJsaWMgc2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpIHtcbiAgICAvLyBzY3JvbGxMZWZ0ID0gTWF0aC5yb3VuZChzY3JvbGxMZWZ0KTtcbiAgICBpZiAodGhpcy4kc2Nyb2xsTGVmdCA9PT0gc2Nyb2xsTGVmdCB8fCBpc05hTihzY3JvbGxMZWZ0KSlcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuJHNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbExlZnRcIiwgc2Nyb2xsTGVmdCk7XG4gIH1cblxuICAvKipcbiAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGxlZnQgb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxlZnRtb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLmdldFNjcm9sbExlZnR9XG4gICogQHJldHVybnMge051bWJlcn1cbiAgKiovXG4gIHB1YmxpYyBnZXRTY3JvbGxMZWZ0KCkge1xuICAgIHJldHVybiB0aGlzLiRzY3JvbGxMZWZ0O1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIHNjcmVlbi5cbiAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAqKi9cbiAgcHVibGljIGdldFNjcmVlbldpZHRoKCk6IG51bWJlciB7XG4gICAgdGhpcy4kY29tcHV0ZVdpZHRoKCk7XG4gICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSwgdGhpcy5zY3JlZW5XaWR0aCk7XG4gICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGg7XG4gIH1cblxuICBwcml2YXRlIGdldExpbmVXaWRnZXRNYXhXaWR0aCgpIHtcbiAgICBpZiAodGhpcy5saW5lV2lkZ2V0c1dpZHRoICE9IG51bGwpIHJldHVybiB0aGlzLmxpbmVXaWRnZXRzV2lkdGg7XG4gICAgdmFyIHdpZHRoID0gMDtcbiAgICB0aGlzLmxpbmVXaWRnZXRzLmZvckVhY2goZnVuY3Rpb24odykge1xuICAgICAgaWYgKHcgJiYgdy5zY3JlZW5XaWR0aCA+IHdpZHRoKVxuICAgICAgICB3aWR0aCA9IHcuc2NyZWVuV2lkdGg7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMubGluZVdpZGdldFdpZHRoID0gd2lkdGg7XG4gIH1cblxuICBwdWJsaWMgJGNvbXB1dGVXaWR0aChmb3JjZT8pIHtcbiAgICBpZiAodGhpcy4kbW9kaWZpZWQgfHwgZm9yY2UpIHtcbiAgICAgIHRoaXMuJG1vZGlmaWVkID0gZmFsc2U7XG5cbiAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGggPSB0aGlzLiR3cmFwTGltaXQ7XG5cbiAgICAgIHZhciBsaW5lcyA9IHRoaXMuZG9jLmdldEFsbExpbmVzKCk7XG4gICAgICB2YXIgY2FjaGUgPSB0aGlzLiRyb3dMZW5ndGhDYWNoZTtcbiAgICAgIHZhciBsb25nZXN0U2NyZWVuTGluZSA9IDA7XG4gICAgICB2YXIgZm9sZEluZGV4ID0gMDtcbiAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuJGZvbGREYXRhW2ZvbGRJbmRleF07XG4gICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgIHZhciBsZW4gPSBsaW5lcy5sZW5ndGg7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgaWYgKGkgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICBpID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgaWYgKGkgPj0gbGVuKVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXgrK107XG4gICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjYWNoZVtpXSA9PSBudWxsKVxuICAgICAgICAgIGNhY2hlW2ldID0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZXNbaV0pWzBdO1xuXG4gICAgICAgIGlmIChjYWNoZVtpXSA+IGxvbmdlc3RTY3JlZW5MaW5lKVxuICAgICAgICAgIGxvbmdlc3RTY3JlZW5MaW5lID0gY2FjaGVbaV07XG4gICAgICB9XG4gICAgICB0aGlzLnNjcmVlbldpZHRoID0gbG9uZ2VzdFNjcmVlbkxpbmU7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSB2ZXJiYXRpbSBjb3B5IG9mIHRoZSBnaXZlbiBsaW5lIGFzIGl0IGlzIGluIHRoZSBkb2N1bWVudFxuICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gcmV0cmlldmUgZnJvbVxuICAgKlxuICAqXG4gICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICpcbiAgKiovXG4gIHB1YmxpYyBnZXRMaW5lKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYW4gYXJyYXkgb2Ygc3RyaW5ncyBvZiB0aGUgcm93cyBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC4gVGhpcyBmdW5jdGlvbiBpcyBpbmNsdXNpdmUgb2YgYGxhc3RSb3dgLlxuICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IGluZGV4IHRvIHJldHJpZXZlXG4gICAqXG4gICAqIEByZXR1cm5zIHtbU3RyaW5nXX1cbiAgICpcbiAgICoqL1xuICBwdWJsaWMgZ2V0TGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogc3RyaW5nW10ge1xuICAgIHJldHVybiB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIHJvd3MgaW4gdGhlIGRvY3VtZW50LlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKiovXG4gIHB1YmxpYyBnZXRMZW5ndGgoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gIH1cblxuICAvKipcbiAgICogezpEb2N1bWVudC5nZXRUZXh0UmFuZ2UuZGVzY31cbiAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgVGhlIHJhbmdlIHRvIHdvcmsgd2l0aFxuICAgKlxuICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgKiovXG4gIHB1YmxpYyBnZXRUZXh0UmFuZ2UocmFuZ2U6IHsgc3RhcnQ6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07IGVuZDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB9KSB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmdldFRleHRSYW5nZShyYW5nZSB8fCB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnNlcnRzIGEgYmxvY2sgb2YgYHRleHRgIGFuZCB0aGUgaW5kaWNhdGVkIGBwb3NpdGlvbmAuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24ge3JvdywgY29sdW1ufSB0byBzdGFydCBpbnNlcnRpbmcgYXRcbiAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBjaHVuayBvZiB0ZXh0IHRvIGluc2VydFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgbGluZSBvZiBgdGV4dGAuIElmIHRoZSBsZW5ndGggb2YgYHRleHRgIGlzIDAsIHRoaXMgZnVuY3Rpb24gc2ltcGx5IHJldHVybnMgYHBvc2l0aW9uYC5cbiAgICpcbiAgICpcbiAgICoqL1xuICBwdWJsaWMgaW5zZXJ0KHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0ZXh0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5kb2MuaW5zZXJ0KHBvc2l0aW9uLCB0ZXh0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIHRoZSBgcmFuZ2VgIGZyb20gdGhlIGRvY3VtZW50LlxuICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHNwZWNpZmllZCBSYW5nZSB0byByZW1vdmVcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIG5ldyBgc3RhcnRgIHByb3BlcnR5IG9mIHRoZSByYW5nZSwgd2hpY2ggY29udGFpbnMgYHN0YXJ0Um93YCBhbmQgYHN0YXJ0Q29sdW1uYC4gSWYgYHJhbmdlYCBpcyBlbXB0eSwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIHRoZSB1bm1vZGlmaWVkIHZhbHVlIG9mIGByYW5nZS5zdGFydGAuXG4gICAqXG4gICAqIEByZWxhdGVkIERvY3VtZW50LnJlbW92ZVxuICAgKlxuICAgKiovXG4gIHB1YmxpYyByZW1vdmUocmFuZ2UpIHtcbiAgICByZXR1cm4gdGhpcy5kb2MucmVtb3ZlKHJhbmdlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXZlcnRzIHByZXZpb3VzIGNoYW5nZXMgdG8geW91ciBkb2N1bWVudC5cbiAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICogQHBhcmFtIHtCb29sZWFufSBkb250U2VsZWN0IFtJZiBgdHJ1ZWAsIGRvZXNuJ3Qgc2VsZWN0IHRoZSByYW5nZSBvZiB3aGVyZSB0aGUgY2hhbmdlIG9jY3VyZWRdezogI2RvbnRTZWxlY3R9XG4gICAqXG4gICAqXG4gICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgKiovXG4gIHB1YmxpYyB1bmRvQ2hhbmdlcyhkZWx0YXMsIGRvbnRTZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgcmV0dXJuO1xuXG4gICAgdGhpcy4kZnJvbVVuZG8gPSB0cnVlO1xuICAgIHZhciBsYXN0VW5kb1JhbmdlID0gbnVsbDtcbiAgICBmb3IgKHZhciBpID0gZGVsdGFzLmxlbmd0aCAtIDE7IGkgIT0gLTE7IGktLSkge1xuICAgICAgdmFyIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgaWYgKGRlbHRhLmdyb3VwID09IFwiZG9jXCIpIHtcbiAgICAgICAgdGhpcy5kb2MucmV2ZXJ0RGVsdGFzKGRlbHRhLmRlbHRhcyk7XG4gICAgICAgIGxhc3RVbmRvUmFuZ2UgPVxuICAgICAgICAgIHRoaXMuJGdldFVuZG9TZWxlY3Rpb24oZGVsdGEuZGVsdGFzLCB0cnVlLCBsYXN0VW5kb1JhbmdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbHRhLmRlbHRhcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGREZWx0YSkge1xuICAgICAgICAgIHRoaXMuYWRkRm9sZHMoZm9sZERlbHRhLmZvbGRzKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuJGZyb21VbmRvID0gZmFsc2U7XG4gICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgIHJldHVybiBsYXN0VW5kb1JhbmdlO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlLWltcGxlbWVudHMgYSBwcmV2aW91c2x5IHVuZG9uZSBjaGFuZ2UgdG8geW91ciBkb2N1bWVudC5cbiAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICogQHBhcmFtIHtCb29sZWFufSBkb250U2VsZWN0IHs6ZG9udFNlbGVjdH1cbiAgICpcbiAgKlxuICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICoqL1xuICBwdWJsaWMgcmVkb0NoYW5nZXMoZGVsdGFzLCBkb250U2VsZWN0PzogYm9vbGVhbikge1xuICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICB2YXIgbGFzdFVuZG9SYW5nZTogUmFuZ2UgPSBudWxsO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsdGFzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICB0aGlzLmRvYy5hcHBseURlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgZmFsc2UsIGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgIGxhc3RVbmRvUmFuZ2UgJiZcbiAgICAgIHRoaXMuJHVuZG9TZWxlY3QgJiZcbiAgICAgICFkb250U2VsZWN0ICYmXG4gICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShsYXN0VW5kb1JhbmdlKTtcbiAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFbmFibGVzIG9yIGRpc2FibGVzIGhpZ2hsaWdodGluZyBvZiB0aGUgcmFuZ2Ugd2hlcmUgYW4gdW5kbyBvY2N1cmVkLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZSBJZiBgdHJ1ZWAsIHNlbGVjdHMgdGhlIHJhbmdlIG9mIHRoZSByZWluc2VydGVkIGNoYW5nZVxuICAqXG4gICoqL1xuICBwcml2YXRlIHNldFVuZG9TZWxlY3QoZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy4kdW5kb1NlbGVjdCA9IGVuYWJsZTtcbiAgfVxuXG4gIHByaXZhdGUgJGdldFVuZG9TZWxlY3Rpb24oZGVsdGFzOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfVtdLCBpc1VuZG86IGJvb2xlYW4sIGxhc3RVbmRvUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgIGZ1bmN0aW9uIGlzSW5zZXJ0KGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nIH0pIHtcbiAgICAgIHZhciBpbnNlcnQgPSBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0VGV4dFwiIHx8IGRlbHRhLmFjdGlvbiA9PT0gXCJpbnNlcnRMaW5lc1wiO1xuICAgICAgcmV0dXJuIGlzVW5kbyA/ICFpbnNlcnQgOiBpbnNlcnQ7XG4gICAgfVxuXG4gICAgdmFyIGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSA9IGRlbHRhc1swXTtcbiAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgIHZhciBwb2ludDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICB2YXIgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLmVuZCk7XG4gICAgICBsYXN0RGVsdGFJc0luc2VydCA9IHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2Uuc3RhcnQpO1xuICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGRlbHRhcy5sZW5ndGg7IGkrKykge1xuICAgICAgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gLTEpIHtcbiAgICAgICAgICByYW5nZS5zZXRTdGFydChkZWx0YS5yYW5nZS5zdGFydC5yb3csIGRlbHRhLnJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5lbmQ7XG4gICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gMSkge1xuICAgICAgICAgIHJhbmdlLnNldEVuZChkZWx0YS5yYW5nZS5lbmQucm93LCBkZWx0YS5yYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IHRydWU7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2Uuc3RhcnQpO1xuICAgICAgICB9XG4gICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyByYW5nZSBhbmQgdGhlIGxhc3QgdW5kbyByYW5nZSBoYXMgc29tZXRoaW5nIGluIGNvbW1vbi5cbiAgICAvLyBJZiB0cnVlLCBtZXJnZSB0aGUgcmFuZ2VzLlxuICAgIGlmIChsYXN0VW5kb1JhbmdlICE9IG51bGwpIHtcbiAgICAgIGlmIChSYW5nZS5jb21wYXJlUG9pbnRzKGxhc3RVbmRvUmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0KSA9PT0gMCkge1xuICAgICAgICBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbiArPSByYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uO1xuICAgICAgICBsYXN0VW5kb1JhbmdlLmVuZC5jb2x1bW4gKz0gcmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbjtcbiAgICAgIH1cblxuICAgICAgdmFyIGNtcCA9IGxhc3RVbmRvUmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgIGlmIChjbXAgPT09IDEpIHtcbiAgICAgICAgcmFuZ2Uuc2V0U3RhcnQobGFzdFVuZG9SYW5nZS5zdGFydC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKGNtcCA9PT0gLTEpIHtcbiAgICAgICAgcmFuZ2Uuc2V0RW5kKGxhc3RVbmRvUmFuZ2UuZW5kLnJvdywgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAqIFJlcGxhY2VzIGEgcmFuZ2UgaW4gdGhlIGRvY3VtZW50IHdpdGggdGhlIG5ldyBgdGV4dGAuXG4gICpcbiAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHNwZWNpZmllZCBSYW5nZSB0byByZXBsYWNlXG4gICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIG5ldyB0ZXh0IHRvIHVzZSBhcyBhIHJlcGxhY2VtZW50XG4gICogQHJldHVybnMge09iamVjdH0gQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZpbmFsIHJvdyBhbmQgY29sdW1uLCBsaWtlIHRoaXM6XG4gICogYGBgXG4gICoge3JvdzogZW5kUm93LCBjb2x1bW46IDB9XG4gICogYGBgXG4gICogSWYgdGhlIHRleHQgYW5kIHJhbmdlIGFyZSBlbXB0eSwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5zdGFydGAgdmFsdWUuXG4gICogSWYgdGhlIHRleHQgaXMgdGhlIGV4YWN0IHNhbWUgYXMgd2hhdCBjdXJyZW50bHkgZXhpc3RzLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGN1cnJlbnQgYHJhbmdlLmVuZGAgdmFsdWUuXG4gICpcbiAgKlxuICAqXG4gICogQHJlbGF0ZWQgRG9jdW1lbnQucmVwbGFjZVxuICAqXG4gICpcbiAgKiovXG4gIHB1YmxpYyByZXBsYWNlKHJhbmdlOiBSYW5nZSwgdGV4dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuICB9XG5cbiAgLyoqXG4gICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICogIGBgYGpzb25cbiAgKiAgICB7IHJvdzogbmV3Um93TG9jYXRpb24sIGNvbHVtbjogbmV3Q29sdW1uTG9jYXRpb24gfVxuICAgKiAgYGBgXG4gICAqIEBwYXJhbSB7UmFuZ2V9IGZyb21SYW5nZSBUaGUgcmFuZ2Ugb2YgdGV4dCB5b3Ugd2FudCBtb3ZlZCB3aXRoaW4gdGhlIGRvY3VtZW50XG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0b1Bvc2l0aW9uIFRoZSBsb2NhdGlvbiAocm93IGFuZCBjb2x1bW4pIHdoZXJlIHlvdSB3YW50IHRvIG1vdmUgdGhlIHRleHQgdG9cbiAgICogQHJldHVybnMge1JhbmdlfSBUaGUgbmV3IHJhbmdlIHdoZXJlIHRoZSB0ZXh0IHdhcyBtb3ZlZCB0by5cbiAgKlxuICAqXG4gICpcbiAgKiovXG4gIHB1YmxpYyBtb3ZlVGV4dChmcm9tUmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpIHtcbiAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0VGV4dFJhbmdlKGZyb21SYW5nZSk7XG4gICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZnJvbVJhbmdlKTtcbiAgICB2YXIgcm93RGlmZjogbnVtYmVyO1xuICAgIHZhciBjb2xEaWZmOiBudW1iZXI7XG5cbiAgICB2YXIgdG9SYW5nZSA9IFJhbmdlLmZyb21Qb2ludHModG9Qb3NpdGlvbiwgdG9Qb3NpdGlvbik7XG4gICAgaWYgKCFjb3B5KSB7XG4gICAgICB0aGlzLnJlbW92ZShmcm9tUmFuZ2UpO1xuICAgICAgcm93RGlmZiA9IGZyb21SYW5nZS5zdGFydC5yb3cgLSBmcm9tUmFuZ2UuZW5kLnJvdztcbiAgICAgIGNvbERpZmYgPSByb3dEaWZmID8gLWZyb21SYW5nZS5lbmQuY29sdW1uIDogZnJvbVJhbmdlLnN0YXJ0LmNvbHVtbiAtIGZyb21SYW5nZS5lbmQuY29sdW1uO1xuICAgICAgaWYgKGNvbERpZmYpIHtcbiAgICAgICAgaWYgKHRvUmFuZ2Uuc3RhcnQucm93ID09IGZyb21SYW5nZS5lbmQucm93ICYmIHRvUmFuZ2Uuc3RhcnQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICB0b1JhbmdlLnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0b1JhbmdlLmVuZC5yb3cgPT0gZnJvbVJhbmdlLmVuZC5yb3cgJiYgdG9SYW5nZS5lbmQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICB0b1JhbmdlLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHJvd0RpZmYgJiYgdG9SYW5nZS5zdGFydC5yb3cgPj0gZnJvbVJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgdG9SYW5nZS5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgdG9SYW5nZS5lbmQucm93ICs9IHJvd0RpZmY7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdG9SYW5nZS5lbmQgPSB0aGlzLmluc2VydCh0b1JhbmdlLnN0YXJ0LCB0ZXh0KTtcbiAgICBpZiAoZm9sZHMubGVuZ3RoKSB7XG4gICAgICB2YXIgb2xkU3RhcnQgPSBmcm9tUmFuZ2Uuc3RhcnQ7XG4gICAgICB2YXIgbmV3U3RhcnQgPSB0b1JhbmdlLnN0YXJ0O1xuICAgICAgcm93RGlmZiA9IG5ld1N0YXJ0LnJvdyAtIG9sZFN0YXJ0LnJvdztcbiAgICAgIGNvbERpZmYgPSBuZXdTdGFydC5jb2x1bW4gLSBvbGRTdGFydC5jb2x1bW47XG4gICAgICB0aGlzLmFkZEZvbGRzKGZvbGRzLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgIHggPSB4LmNsb25lKCk7XG4gICAgICAgIGlmICh4LnN0YXJ0LnJvdyA9PSBvbGRTdGFydC5yb3cpIHtcbiAgICAgICAgICB4LnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICB9XG4gICAgICAgIGlmICh4LmVuZC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgeC5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgIH1cbiAgICAgICAgeC5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgeC5lbmQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgIHJldHVybiB4O1xuICAgICAgfSkpO1xuICAgIH1cblxuICAgIHJldHVybiB0b1JhbmdlO1xuICB9XG5cbiAgLyoqXG4gICogSW5kZW50cyBhbGwgdGhlIHJvd3MsIGZyb20gYHN0YXJ0Um93YCB0byBgZW5kUm93YCAoaW5jbHVzaXZlKSwgYnkgcHJlZml4aW5nIGVhY2ggcm93IHdpdGggdGhlIHRva2VuIGluIGBpbmRlbnRTdHJpbmdgLlxuICAqXG4gICogSWYgYGluZGVudFN0cmluZ2AgY29udGFpbnMgdGhlIGAnXFx0J2AgY2hhcmFjdGVyLCBpdCdzIHJlcGxhY2VkIGJ5IHdoYXRldmVyIGlzIGRlZmluZWQgYnkgW1tFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmcgYGdldFRhYlN0cmluZygpYF1dLlxuICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFJvdyBTdGFydGluZyByb3dcbiAgKiBAcGFyYW0ge051bWJlcn0gZW5kUm93IEVuZGluZyByb3dcbiAgKiBAcGFyYW0ge1N0cmluZ30gaW5kZW50U3RyaW5nIFRoZSBpbmRlbnQgdG9rZW5cbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgaW5kZW50Um93cyhzdGFydFJvdywgZW5kUm93LCBpbmRlbnRTdHJpbmcpIHtcbiAgICBpbmRlbnRTdHJpbmcgPSBpbmRlbnRTdHJpbmcucmVwbGFjZSgvXFx0L2csIHRoaXMuZ2V0VGFiU3RyaW5nKCkpO1xuICAgIGZvciAodmFyIHJvdyA9IHN0YXJ0Um93OyByb3cgPD0gZW5kUm93OyByb3crKylcbiAgICAgIHRoaXMuaW5zZXJ0KHsgcm93OiByb3csIGNvbHVtbjogMCB9LCBpbmRlbnRTdHJpbmcpO1xuICB9XG5cbiAgLyoqXG4gICogT3V0ZGVudHMgYWxsIHRoZSByb3dzIGRlZmluZWQgYnkgdGhlIGBzdGFydGAgYW5kIGBlbmRgIHByb3BlcnRpZXMgb2YgYHJhbmdlYC5cbiAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHJhbmdlIG9mIHJvd3NcbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgb3V0ZGVudFJvd3MocmFuZ2U6IFJhbmdlKSB7XG4gICAgdmFyIHJvd1JhbmdlID0gcmFuZ2UuY29sbGFwc2VSb3dzKCk7XG4gICAgdmFyIGRlbGV0ZVJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgIHZhciBzaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG5cbiAgICBmb3IgKHZhciBpID0gcm93UmFuZ2Uuc3RhcnQucm93OyBpIDw9IHJvd1JhbmdlLmVuZC5yb3c7ICsraSkge1xuICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUoaSk7XG5cbiAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LnJvdyA9IGk7XG4gICAgICBkZWxldGVSYW5nZS5lbmQucm93ID0gaTtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2l6ZTsgKytqKVxuICAgICAgICBpZiAobGluZS5jaGFyQXQoaikgIT0gJyAnKVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgaWYgKGogPCBzaXplICYmIGxpbmUuY2hhckF0KGopID09ICdcXHQnKSB7XG4gICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IGo7XG4gICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqICsgMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IDA7XG4gICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqO1xuICAgICAgfVxuICAgICAgdGhpcy5yZW1vdmUoZGVsZXRlUmFuZ2UpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgJG1vdmVMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIsIGRpcjogbnVtYmVyKSB7XG4gICAgZmlyc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyk7XG4gICAgbGFzdFJvdyA9IHRoaXMuZ2V0Um93Rm9sZEVuZChsYXN0Um93KTtcbiAgICBpZiAoZGlyIDwgMCkge1xuICAgICAgdmFyIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KGZpcnN0Um93ICsgZGlyKTtcbiAgICAgIGlmIChyb3cgPCAwKSByZXR1cm4gMDtcbiAgICAgIHZhciBkaWZmID0gcm93IC0gZmlyc3RSb3c7XG4gICAgfSBlbHNlIGlmIChkaXIgPiAwKSB7XG4gICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cgKyBkaXIpO1xuICAgICAgaWYgKHJvdyA+IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkgcmV0dXJuIDA7XG4gICAgICB2YXIgZGlmZiA9IHJvdyAtIGxhc3RSb3c7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpcnN0Um93ID0gdGhpcy4kY2xpcFJvd1RvRG9jdW1lbnQoZmlyc3RSb3cpO1xuICAgICAgbGFzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGxhc3RSb3cpO1xuICAgICAgdmFyIGRpZmYgPSBsYXN0Um93IC0gZmlyc3RSb3cgKyAxO1xuICAgIH1cblxuICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShmaXJzdFJvdywgMCwgbGFzdFJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICB4ID0geC5jbG9uZSgpO1xuICAgICAgeC5zdGFydC5yb3cgKz0gZGlmZjtcbiAgICAgIHguZW5kLnJvdyArPSBkaWZmO1xuICAgICAgcmV0dXJuIHg7XG4gICAgfSk7XG5cbiAgICB2YXIgbGluZXMgPSBkaXIgPT0gMFxuICAgICAgPyB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdylcbiAgICAgIDogdGhpcy5kb2MucmVtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgIHRoaXMuZG9jLmluc2VydExpbmVzKGZpcnN0Um93ICsgZGlmZiwgbGluZXMpO1xuICAgIGZvbGRzLmxlbmd0aCAmJiB0aGlzLmFkZEZvbGRzKGZvbGRzKTtcbiAgICByZXR1cm4gZGlmZjtcbiAgfVxuICAvKipcbiAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgdXAgb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSB1cFxuICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSB1cFxuICAqIEByZXR1cm5zIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICpcbiAgKiBAcmVsYXRlZCBEb2N1bWVudC5pbnNlcnRMaW5lc1xuICAqXG4gICoqL1xuICBwcml2YXRlIG1vdmVMaW5lc1VwKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgLTEpO1xuICB9XG5cbiAgLyoqXG4gICogU2hpZnRzIGFsbCB0aGUgbGluZXMgaW4gdGhlIGRvY3VtZW50IGRvd24gb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSBkb3duXG4gICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBtb3ZlIGRvd25cbiAgKiBAcmV0dXJucyB7TnVtYmVyfSBJZiBgZmlyc3RSb3dgIGlzIGxlc3MtdGhhbiBvciBlcXVhbCB0byAwLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgMC4gT3RoZXJ3aXNlLCBvbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAqXG4gICogQHJlbGF0ZWQgRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgKiovXG4gIHByaXZhdGUgbW92ZUxpbmVzRG93bihmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIDEpO1xuICB9XG5cbiAgLyoqXG4gICogRHVwbGljYXRlcyBhbGwgdGhlIHRleHQgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gZHVwbGljYXRlXG4gICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBkdXBsaWNhdGVcbiAgKiBAcmV0dXJucyB7TnVtYmVyfSBSZXR1cm5zIHRoZSBudW1iZXIgb2YgbmV3IHJvd3MgYWRkZWQ7IGluIG90aGVyIHdvcmRzLCBgbGFzdFJvdyAtIGZpcnN0Um93ICsgMWAuXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIGR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMCk7XG4gIH1cblxuXG4gIHByaXZhdGUgJGNsaXBSb3dUb0RvY3VtZW50KHJvdykge1xuICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbihyb3csIHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkpO1xuICB9XG5cbiAgcHJpdmF0ZSAkY2xpcENvbHVtblRvUm93KHJvdywgY29sdW1uKSB7XG4gICAgaWYgKGNvbHVtbiA8IDApXG4gICAgICByZXR1cm4gMDtcbiAgICByZXR1cm4gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgfVxuXG5cbiAgcHJpdmF0ZSAkY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICBjb2x1bW4gPSBNYXRoLm1heCgwLCBjb2x1bW4pO1xuXG4gICAgaWYgKHJvdyA8IDApIHtcbiAgICAgIHJvdyA9IDA7XG4gICAgICBjb2x1bW4gPSAwO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICAgIGlmIChyb3cgPj0gbGVuKSB7XG4gICAgICAgIHJvdyA9IGxlbiAtIDE7XG4gICAgICAgIGNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUobGVuIC0gMSkubGVuZ3RoO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIGNvbHVtbiA9IE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJvdzogcm93LFxuICAgICAgY29sdW1uOiBjb2x1bW5cbiAgICB9O1xuICB9XG5cbiAgcHVibGljICRjbGlwUmFuZ2VUb0RvY3VtZW50KHJhbmdlOiBSYW5nZSkge1xuICAgIGlmIChyYW5nZS5zdGFydC5yb3cgPCAwKSB7XG4gICAgICByYW5nZS5zdGFydC5yb3cgPSAwO1xuICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gMDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSB0aGlzLiRjbGlwQ29sdW1uVG9Sb3coXG4gICAgICAgIHJhbmdlLnN0YXJ0LnJvdyxcbiAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uXG4gICAgICApO1xuICAgIH1cblxuICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgaWYgKHJhbmdlLmVuZC5yb3cgPiBsZW4pIHtcbiAgICAgIHJhbmdlLmVuZC5yb3cgPSBsZW47XG4gICAgICByYW5nZS5lbmQuY29sdW1uID0gdGhpcy5kb2MuZ2V0TGluZShsZW4pLmxlbmd0aDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByYW5nZS5lbmQuY29sdW1uID0gdGhpcy4kY2xpcENvbHVtblRvUm93KFxuICAgICAgICByYW5nZS5lbmQucm93LFxuICAgICAgICByYW5nZS5lbmQuY29sdW1uXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmFuZ2U7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB3aGV0aGVyIG9yIG5vdCBsaW5lIHdyYXBwaW5nIGlzIGVuYWJsZWQuIElmIGB1c2VXcmFwTW9kZWAgaXMgZGlmZmVyZW50IHRoYW4gdGhlIGN1cnJlbnQgdmFsdWUsIHRoZSBgJ2NoYW5nZVdyYXBNb2RlJ2AgZXZlbnQgaXMgZW1pdHRlZC5cbiAgICogQHBhcmFtIHtCb29sZWFufSB1c2VXcmFwTW9kZSBFbmFibGUgKG9yIGRpc2FibGUpIHdyYXAgbW9kZVxuICAgKlxuICAqXG4gICoqL1xuICBwcml2YXRlIHNldFVzZVdyYXBNb2RlKHVzZVdyYXBNb2RlOiBib29sZWFuKSB7XG4gICAgaWYgKHVzZVdyYXBNb2RlICE9IHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICB0aGlzLiR1c2VXcmFwTW9kZSA9IHVzZVdyYXBNb2RlO1xuICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcblxuICAgICAgLy8gSWYgd3JhcE1vZGUgaXMgYWN0aXZhZWQsIHRoZSB3cmFwRGF0YSBhcnJheSBoYXMgdG8gYmUgaW5pdGlhbGl6ZWQuXG4gICAgICBpZiAodXNlV3JhcE1vZGUpIHtcbiAgICAgICAgdmFyIGxlbiA9IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgIHRoaXMuJHdyYXBEYXRhID0gQXJyYXk8bnVtYmVyW10+KGxlbik7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIGxlbiAtIDEpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGB0cnVlYCBpZiB3cmFwIG1vZGUgaXMgYmVpbmcgdXNlZDsgYGZhbHNlYCBvdGhlcndpc2UuXG4gICogQHJldHVybnMge0Jvb2xlYW59XG4gICoqL1xuICBnZXRVc2VXcmFwTW9kZSgpIHtcbiAgICByZXR1cm4gdGhpcy4kdXNlV3JhcE1vZGU7XG4gIH1cblxuICAvLyBBbGxvdyB0aGUgd3JhcCBsaW1pdCB0byBtb3ZlIGZyZWVseSBiZXR3ZWVuIG1pbiBhbmQgbWF4LiBFaXRoZXJcbiAgLy8gcGFyYW1ldGVyIGNhbiBiZSBudWxsIHRvIGFsbG93IHRoZSB3cmFwIGxpbWl0IHRvIGJlIHVuY29uc3RyYWluZWRcbiAgLy8gaW4gdGhhdCBkaXJlY3Rpb24uIE9yIHNldCBib3RoIHBhcmFtZXRlcnMgdG8gdGhlIHNhbWUgbnVtYmVyIHRvIHBpblxuICAvLyB0aGUgbGltaXQgdG8gdGhhdCB2YWx1ZS5cbiAgLyoqXG4gICAqIFNldHMgdGhlIGJvdW5kYXJpZXMgb2Ygd3JhcC4gRWl0aGVyIHZhbHVlIGNhbiBiZSBgbnVsbGAgdG8gaGF2ZSBhbiB1bmNvbnN0cmFpbmVkIHdyYXAsIG9yLCB0aGV5IGNhbiBiZSB0aGUgc2FtZSBudW1iZXIgdG8gcGluIHRoZSBsaW1pdC4gSWYgdGhlIHdyYXAgbGltaXRzIGZvciBgbWluYCBvciBgbWF4YCBhcmUgZGlmZmVyZW50LCB0aGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVdyYXBNb2RlJ2AgZXZlbnQuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBtaW4gVGhlIG1pbmltdW0gd3JhcCB2YWx1ZSAodGhlIGxlZnQgc2lkZSB3cmFwKVxuICAgKiBAcGFyYW0ge051bWJlcn0gbWF4IFRoZSBtYXhpbXVtIHdyYXAgdmFsdWUgKHRoZSByaWdodCBzaWRlIHdyYXApXG4gICAqXG4gICpcbiAgKiovXG4gIHNldFdyYXBMaW1pdFJhbmdlKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICh0aGlzLiR3cmFwTGltaXRSYW5nZS5taW4gIT09IG1pbiB8fCB0aGlzLiR3cmFwTGltaXRSYW5nZS5tYXggIT09IG1heCkge1xuICAgICAgdGhpcy4kd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgICAgIG1pbjogbWluLFxuICAgICAgICBtYXg6IG1heFxuICAgICAgfTtcbiAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgIC8vIFRoaXMgd2lsbCBmb3JjZSBhIHJlY2FsY3VsYXRpb24gb2YgdGhlIHdyYXAgbGltaXRcbiAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVdyYXBNb2RlXCIpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAqIFRoaXMgc2hvdWxkIGdlbmVyYWxseSBvbmx5IGJlIGNhbGxlZCBieSB0aGUgcmVuZGVyZXIgd2hlbiBhIHJlc2l6ZSBpcyBkZXRlY3RlZC5cbiAgKiBAcGFyYW0ge051bWJlcn0gZGVzaXJlZExpbWl0IFRoZSBuZXcgd3JhcCBsaW1pdFxuICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAqXG4gICogQHByaXZhdGVcbiAgKiovXG4gIHB1YmxpYyBhZGp1c3RXcmFwTGltaXQoZGVzaXJlZExpbWl0OiBudW1iZXIsICRwcmludE1hcmdpbjogbnVtYmVyKSB7XG4gICAgdmFyIGxpbWl0cyA9IHRoaXMuJHdyYXBMaW1pdFJhbmdlXG4gICAgaWYgKGxpbWl0cy5tYXggPCAwKVxuICAgICAgbGltaXRzID0geyBtaW46ICRwcmludE1hcmdpbiwgbWF4OiAkcHJpbnRNYXJnaW4gfTtcbiAgICB2YXIgd3JhcExpbWl0ID0gdGhpcy4kY29uc3RyYWluV3JhcExpbWl0KGRlc2lyZWRMaW1pdCwgbGltaXRzLm1pbiwgbGltaXRzLm1heCk7XG4gICAgaWYgKHdyYXBMaW1pdCAhPSB0aGlzLiR3cmFwTGltaXQgJiYgd3JhcExpbWl0ID4gMSkge1xuICAgICAgdGhpcy4kd3JhcExpbWl0ID0gd3JhcExpbWl0O1xuICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIHRoaXMuZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcExpbWl0XCIpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHByaXZhdGUgJGNvbnN0cmFpbldyYXBMaW1pdCh3cmFwTGltaXQ6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAobWluKVxuICAgICAgd3JhcExpbWl0ID0gTWF0aC5tYXgobWluLCB3cmFwTGltaXQpO1xuXG4gICAgaWYgKG1heClcbiAgICAgIHdyYXBMaW1pdCA9IE1hdGgubWluKG1heCwgd3JhcExpbWl0KTtcblxuICAgIHJldHVybiB3cmFwTGltaXQ7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBvZiB3cmFwIGxpbWl0LlxuICAqIEByZXR1cm5zIHtOdW1iZXJ9IFRoZSB3cmFwIGxpbWl0LlxuICAqKi9cbiAgcHJpdmF0ZSBnZXRXcmFwTGltaXQoKSB7XG4gICAgcmV0dXJuIHRoaXMuJHdyYXBMaW1pdDtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXRzIHRoZSBsaW5lIGxlbmd0aCBmb3Igc29mdCB3cmFwIGluIHRoZSBlZGl0b3IuIExpbmVzIHdpbGwgYnJlYWtcbiAgICogIGF0IGEgbWluaW11bSBvZiB0aGUgZ2l2ZW4gbGVuZ3RoIG1pbnVzIDIwIGNoYXJzIGFuZCBhdCBhIG1heGltdW1cbiAgICogIG9mIHRoZSBnaXZlbiBudW1iZXIgb2YgY2hhcnMuXG4gICAqIEBwYXJhbSB7bnVtYmVyfSBsaW1pdCBUaGUgbWF4aW11bSBsaW5lIGxlbmd0aCBpbiBjaGFycywgZm9yIHNvZnQgd3JhcHBpbmcgbGluZXMuXG4gICAqL1xuICBwcml2YXRlIHNldFdyYXBMaW1pdChsaW1pdCkge1xuICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UobGltaXQsIGxpbWl0KTtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgYW4gb2JqZWN0IHRoYXQgZGVmaW5lcyB0aGUgbWluaW11bSBhbmQgbWF4aW11bSBvZiB0aGUgd3JhcCBsaW1pdDsgaXQgbG9va3Mgc29tZXRoaW5nIGxpa2UgdGhpczpcbiAgKlxuICAqICAgICB7IG1pbjogd3JhcExpbWl0UmFuZ2VfbWluLCBtYXg6IHdyYXBMaW1pdFJhbmdlX21heCB9XG4gICpcbiAgKiBAcmV0dXJucyB7T2JqZWN0fVxuICAqKi9cbiAgcHJpdmF0ZSBnZXRXcmFwTGltaXRSYW5nZSgpIHtcbiAgICAvLyBBdm9pZCB1bmV4cGVjdGVkIG11dGF0aW9uIGJ5IHJldHVybmluZyBhIGNvcHlcbiAgICByZXR1cm4ge1xuICAgICAgbWluOiB0aGlzLiR3cmFwTGltaXRSYW5nZS5taW4sXG4gICAgICBtYXg6IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1heFxuICAgIH07XG4gIH1cblxuICBwcml2YXRlICR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZShlKSB7XG4gICAgdmFyIHVzZVdyYXBNb2RlID0gdGhpcy4kdXNlV3JhcE1vZGU7XG4gICAgdmFyIGxlbjtcbiAgICB2YXIgYWN0aW9uID0gZS5kYXRhLmFjdGlvbjtcbiAgICB2YXIgZmlyc3RSb3cgPSBlLmRhdGEucmFuZ2Uuc3RhcnQucm93O1xuICAgIHZhciBsYXN0Um93ID0gZS5kYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgdmFyIHN0YXJ0ID0gZS5kYXRhLnJhbmdlLnN0YXJ0O1xuICAgIHZhciBlbmQgPSBlLmRhdGEucmFuZ2UuZW5kO1xuICAgIHZhciByZW1vdmVkRm9sZHMgPSBudWxsO1xuXG4gICAgaWYgKGFjdGlvbi5pbmRleE9mKFwiTGluZXNcIikgIT0gLTEpIHtcbiAgICAgIGlmIChhY3Rpb24gPT0gXCJpbnNlcnRMaW5lc1wiKSB7XG4gICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdyArIChlLmRhdGEubGluZXMubGVuZ3RoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgIH1cbiAgICAgIGxlbiA9IGUuZGF0YS5saW5lcyA/IGUuZGF0YS5saW5lcy5sZW5ndGggOiBsYXN0Um93IC0gZmlyc3RSb3c7XG4gICAgfSBlbHNlIHtcbiAgICAgIGxlbiA9IGxhc3RSb3cgLSBmaXJzdFJvdztcbiAgICB9XG5cbiAgICB0aGlzLiR1cGRhdGluZyA9IHRydWU7XG4gICAgaWYgKGxlbiAhPSAwKSB7XG4gICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgdGhpc1t1c2VXcmFwTW9kZSA/IFwiJHdyYXBEYXRhXCIgOiBcIiRyb3dMZW5ndGhDYWNoZVwiXS5zcGxpY2UoZmlyc3RSb3csIGxlbik7XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKHJlbW92ZWRGb2xkcyk7XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShlbmQucm93KTtcbiAgICAgICAgdmFyIGlkeCA9IDA7XG4gICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGVuZC5yb3csIGVuZC5jb2x1bW4sIHN0YXJ0LmNvbHVtbiAtIGVuZC5jb2x1bW4pO1xuICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KC1sZW4pO1xuXG4gICAgICAgICAgdmFyIGZvbGRMaW5lQmVmb3JlID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgaWYgKGZvbGRMaW5lQmVmb3JlICYmIGZvbGRMaW5lQmVmb3JlICE9PSBmb2xkTGluZSkge1xuICAgICAgICAgICAgZm9sZExpbmVCZWZvcmUubWVyZ2UoZm9sZExpbmUpO1xuICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZUJlZm9yZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWR4ID0gZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpICsgMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGRMaW5lc1tpZHhdO1xuICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPj0gZW5kLnJvdykge1xuICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3coLWxlbik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW4pO1xuICAgICAgICBhcmdzLnVuc2hpZnQoZmlyc3RSb3csIDApO1xuICAgICAgICB2YXIgYXJyID0gdXNlV3JhcE1vZGUgPyB0aGlzLiR3cmFwRGF0YSA6IHRoaXMuJHJvd0xlbmd0aENhY2hlXG4gICAgICAgIGFyci5zcGxpY2UuYXBwbHkoYXJyLCBhcmdzKTtcblxuICAgICAgICAvLyBJZiBzb21lIG5ldyBsaW5lIGlzIGFkZGVkIGluc2lkZSBvZiBhIGZvbGRMaW5lLCB0aGVuIHNwbGl0XG4gICAgICAgIC8vIHRoZSBmb2xkIGxpbmUgdXAuXG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgIHZhciBpZHggPSAwO1xuICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICB2YXIgY21wID0gZm9sZExpbmUucmFuZ2UuY29tcGFyZUluc2lkZShzdGFydC5yb3csIHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAvLyBJbnNpZGUgb2YgdGhlIGZvbGRMaW5lIHJhbmdlLiBOZWVkIHRvIHNwbGl0IHN0dWZmIHVwLlxuICAgICAgICAgIGlmIChjbXAgPT0gMCkge1xuICAgICAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChzdGFydC5yb3csIHN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoXG4gICAgICAgICAgICAgIGxhc3RSb3csIDAsIGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgLy8gSW5mcm9udCBvZiB0aGUgZm9sZExpbmUgYnV0IHNhbWUgcm93LiBOZWVkIHRvIHNoaWZ0IGNvbHVtbi5cbiAgICAgICAgICAgIGlmIChjbXAgPT0gLTEpIHtcbiAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZmlyc3RSb3csIDAsIGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vdGhpbmcgdG8gZG8gaWYgdGhlIGluc2VydCBpcyBhZnRlciB0aGUgZm9sZExpbmUuXG4gICAgICAgICAgaWR4ID0gZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpICsgMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGRMaW5lc1tpZHhdO1xuICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPj0gZmlyc3RSb3cpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJlYWxpZ24gZm9sZHMuIEUuZy4gaWYgeW91IGFkZCBzb21lIG5ldyBjaGFycyBiZWZvcmUgYSBmb2xkLCB0aGVcbiAgICAgIC8vIGZvbGQgc2hvdWxkIFwibW92ZVwiIHRvIHRoZSByaWdodC5cbiAgICAgIGxlbiA9IE1hdGguYWJzKGUuZGF0YS5yYW5nZS5zdGFydC5jb2x1bW4gLSBlLmRhdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgLy8gR2V0IGFsbCB0aGUgZm9sZHMgaW4gdGhlIGNoYW5nZSByYW5nZSBhbmQgcmVtb3ZlIHRoZW0uXG4gICAgICAgIHJlbW92ZWRGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGUuZGF0YS5yYW5nZSk7XG4gICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICBsZW4gPSAtbGVuO1xuICAgICAgfVxuICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZmlyc3RSb3csIHN0YXJ0LmNvbHVtbiwgbGVuKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodXNlV3JhcE1vZGUgJiYgdGhpcy4kd3JhcERhdGEubGVuZ3RoICE9IHRoaXMuZG9jLmdldExlbmd0aCgpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiZG9jLmdldExlbmd0aCgpIGFuZCAkd3JhcERhdGEubGVuZ3RoIGhhdmUgdG8gYmUgdGhlIHNhbWUhXCIpO1xuICAgIH1cbiAgICB0aGlzLiR1cGRhdGluZyA9IGZhbHNlO1xuXG4gICAgaWYgKHVzZVdyYXBNb2RlKVxuICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgIGVsc2VcbiAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZpcnN0Um93LCBsYXN0Um93KTtcblxuICAgIHJldHVybiByZW1vdmVkRm9sZHM7XG4gIH1cblxuICBwdWJsaWMgJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZpcnN0Um93LCBsYXN0Um93LCBiPykge1xuICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlW2ZpcnN0Um93XSA9IG51bGw7XG4gICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGVbbGFzdFJvd10gPSBudWxsO1xuICB9XG5cbiAgcHVibGljICR1cGRhdGVXcmFwRGF0YShmaXJzdFJvdywgbGFzdFJvdykge1xuICAgIHZhciBsaW5lcyA9IHRoaXMuZG9jLmdldEFsbExpbmVzKCk7XG4gICAgdmFyIHRhYlNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcbiAgICB2YXIgd3JhcERhdGEgPSB0aGlzLiR3cmFwRGF0YTtcbiAgICB2YXIgd3JhcExpbWl0ID0gdGhpcy4kd3JhcExpbWl0O1xuICAgIHZhciB0b2tlbnM7XG4gICAgdmFyIGZvbGRMaW5lO1xuXG4gICAgdmFyIHJvdyA9IGZpcnN0Um93O1xuICAgIGxhc3RSb3cgPSBNYXRoLm1pbihsYXN0Um93LCBsaW5lcy5sZW5ndGggLSAxKTtcbiAgICB3aGlsZSAocm93IDw9IGxhc3RSb3cpIHtcbiAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgdG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhsaW5lc1tyb3ddKTtcbiAgICAgICAgd3JhcERhdGFbcm93XSA9IHRoaXMuJGNvbXB1dGVXcmFwU3BsaXRzKHRva2Vucywgd3JhcExpbWl0LCB0YWJTaXplKTtcbiAgICAgICAgcm93Kys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0b2tlbnMgPSBbXTtcbiAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlciwgcm93LCBjb2x1bW4sIGxhc3RDb2x1bW4pIHtcbiAgICAgICAgICB2YXIgd2Fsa1Rva2VuczogbnVtYmVyW107XG4gICAgICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICBwbGFjZWhvbGRlciwgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgICB3YWxrVG9rZW5zWzBdID0gUExBQ0VIT0xERVJfU1RBUlQ7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IHdhbGtUb2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgd2Fsa1Rva2Vuc1tpXSA9IFBMQUNFSE9MREVSX0JPRFk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICBsaW5lc1tyb3ddLnN1YnN0cmluZyhsYXN0Q29sdW1uLCBjb2x1bW4pLFxuICAgICAgICAgICAgICB0b2tlbnMubGVuZ3RoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdG9rZW5zID0gdG9rZW5zLmNvbmNhdCh3YWxrVG9rZW5zKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpLFxuICAgICAgICAgIGZvbGRMaW5lLmVuZC5yb3csXG4gICAgICAgICAgbGluZXNbZm9sZExpbmUuZW5kLnJvd10ubGVuZ3RoICsgMVxuICAgICAgICApO1xuXG4gICAgICAgIHdyYXBEYXRhW2ZvbGRMaW5lLnN0YXJ0LnJvd10gPSB0aGlzLiRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnMsIHdyYXBMaW1pdCwgdGFiU2l6ZSk7XG4gICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgJGNvbXB1dGVXcmFwU3BsaXRzKHRva2VuczogbnVtYmVyW10sIHdyYXBMaW1pdDogbnVtYmVyLCB0YWJTaXplPzogbnVtYmVyKSB7XG4gICAgaWYgKHRva2Vucy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIFtdO1xuICAgIH1cblxuICAgIHZhciBzcGxpdHM6IG51bWJlcltdID0gW107XG4gICAgdmFyIGRpc3BsYXlMZW5ndGggPSB0b2tlbnMubGVuZ3RoO1xuICAgIHZhciBsYXN0U3BsaXQgPSAwLCBsYXN0RG9jU3BsaXQgPSAwO1xuXG4gICAgdmFyIGlzQ29kZSA9IHRoaXMuJHdyYXBBc0NvZGU7XG5cbiAgICBmdW5jdGlvbiBhZGRTcGxpdChzY3JlZW5Qb3M6IG51bWJlcikge1xuICAgICAgdmFyIGRpc3BsYXllZCA9IHRva2Vucy5zbGljZShsYXN0U3BsaXQsIHNjcmVlblBvcyk7XG5cbiAgICAgIC8vIFRoZSBkb2N1bWVudCBzaXplIGlzIHRoZSBjdXJyZW50IHNpemUgLSB0aGUgZXh0cmEgd2lkdGggZm9yIHRhYnNcbiAgICAgIC8vIGFuZCBtdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICB2YXIgbGVuID0gZGlzcGxheWVkLmxlbmd0aDtcbiAgICAgIGRpc3BsYXllZC5qb2luKFwiXCIpLlxuICAgICAgICAvLyBHZXQgYWxsIHRoZSBUQUJfU1BBQ0VzLlxuICAgICAgICByZXBsYWNlKC8xMi9nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgICAgICB9KS5cbiAgICAgICAgLy8gR2V0IGFsbCB0aGUgQ0hBUl9FWFQvbXVsdGlwbGVXaWR0aCBjaGFyYWN0ZXJzLlxuICAgICAgICByZXBsYWNlKC8yL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGxlbiAtPSAxO1xuICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgIH0pO1xuXG4gICAgICBsYXN0RG9jU3BsaXQgKz0gbGVuO1xuICAgICAgc3BsaXRzLnB1c2gobGFzdERvY1NwbGl0KTtcbiAgICAgIGxhc3RTcGxpdCA9IHNjcmVlblBvcztcbiAgICB9XG5cbiAgICB3aGlsZSAoZGlzcGxheUxlbmd0aCAtIGxhc3RTcGxpdCA+IHdyYXBMaW1pdCkge1xuICAgICAgLy8gVGhpcyBpcywgd2hlcmUgdGhlIHNwbGl0IHNob3VsZCBiZS5cbiAgICAgIHZhciBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcblxuICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzcGFjZSBvciB0YWIgYXQgdGhpcyBzcGxpdCBwb3NpdGlvbiwgdGhlbiBtYWtpbmdcbiAgICAgIC8vIGEgc3BsaXQgaXMgc2ltcGxlLlxuICAgICAgaWYgKHRva2Vuc1tzcGxpdCAtIDFdID49IFNQQUNFICYmIHRva2Vuc1tzcGxpdF0gPj0gU1BBQ0UpIHtcbiAgICAgICAgLyogZGlzYWJsZWQgc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hamF4b3JnL2FjZS9pc3N1ZXMvMTE4NlxuICAgICAgICAvLyBJbmNsdWRlIGFsbCBmb2xsb3dpbmcgc3BhY2VzICsgdGFicyBpbiB0aGlzIHNwbGl0IGFzIHdlbGwuXG4gICAgICAgIHdoaWxlICh0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgICAgICBzcGxpdCArKztcbiAgICAgICAgfSAqL1xuICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgIC8vIENoZWNrIGlmIHNwbGl0IGlzIGluc2lkZSBvZiBhIHBsYWNlaG9sZGVyLiBQbGFjZWhvbGRlciBhcmVcbiAgICAgIC8vIG5vdCBzcGxpdGFibGUuIFRoZXJlZm9yZSwgc2VlayB0aGUgYmVnaW5uaW5nIG9mIHRoZSBwbGFjZWhvbGRlclxuICAgICAgLy8gYW5kIHRyeSB0byBwbGFjZSB0aGUgc3BsaXQgYmVvZnJlIHRoZSBwbGFjZWhvbGRlcidzIHN0YXJ0LlxuICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQgfHwgdG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgIC8vIFNlZWsgdGhlIHN0YXJ0IG9mIHRoZSBwbGFjZWhvbGRlciBhbmQgZG8gdGhlIHNwbGl0XG4gICAgICAgIC8vIGJlZm9yZSB0aGUgcGxhY2Vob2xkZXIuIEJ5IGRlZmluaXRpb24gdGhlcmUgYWx3YXlzXG4gICAgICAgIC8vIGEgUExBQ0VIT0xERVJfU1RBUlQgYmV0d2VlbiBzcGxpdCBhbmQgbGFzdFNwbGl0LlxuICAgICAgICBmb3IgKHNwbGl0OyBzcGxpdCAhPSBsYXN0U3BsaXQgLSAxOyBzcGxpdC0tKSB7XG4gICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgIC8vIHNwbGl0Kys7IDw8IE5vIGluY3JlbWVudGFsIGhlcmUgYXMgd2Ugd2FudCB0b1xuICAgICAgICAgICAgLy8gIGhhdmUgdGhlIHBvc2l0aW9uIGJlZm9yZSB0aGUgUGxhY2Vob2xkZXIuXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGUgUExBQ0VIT0xERVJfU1RBUlQgaXMgbm90IHRoZSBpbmRleCBvZiB0aGVcbiAgICAgICAgLy8gbGFzdCBzcGxpdCwgdGhlbiB3ZSBjYW4gZG8gdGhlIHNwbGl0XG4gICAgICAgIGlmIChzcGxpdCA+IGxhc3RTcGxpdCkge1xuICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSBQTEFDRUhPTERFUl9TVEFSVCBJUyB0aGUgaW5kZXggb2YgdGhlIGxhc3RcbiAgICAgICAgLy8gc3BsaXQsIHRoZW4gd2UgaGF2ZSB0byBwbGFjZSB0aGUgc3BsaXQgYWZ0ZXIgdGhlXG4gICAgICAgIC8vIHBsYWNlaG9sZGVyLiBTbywgbGV0J3Mgc2VlayBmb3IgdGhlIGVuZCBvZiB0aGUgcGxhY2Vob2xkZXIuXG4gICAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgICBmb3IgKHNwbGl0OyBzcGxpdCA8IHRva2Vucy5sZW5ndGg7IHNwbGl0KyspIHtcbiAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSAhPSBQTEFDRUhPTERFUl9CT0RZKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiBzcGlsdCA9PSB0b2tlbnMubGVuZ3RoLCB0aGVuIHRoZSBwbGFjZWhvbGRlciBpcyB0aGUgbGFzdFxuICAgICAgICAvLyB0aGluZyBpbiB0aGUgbGluZSBhbmQgYWRkaW5nIGEgbmV3IHNwbGl0IGRvZXNuJ3QgbWFrZSBzZW5zZS5cbiAgICAgICAgaWYgKHNwbGl0ID09IHRva2Vucy5sZW5ndGgpIHtcbiAgICAgICAgICBicmVhazsgIC8vIEJyZWFrcyB0aGUgd2hpbGUtbG9vcC5cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpbmFsbHksIGFkZCB0aGUgc3BsaXQuLi5cbiAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAvLyBTZWFyY2ggZm9yIHRoZSBmaXJzdCBub24gc3BhY2UvdGFiL3BsYWNlaG9sZGVyL3B1bmN0dWF0aW9uIHRva2VuIGJhY2t3YXJkcy5cbiAgICAgIHZhciBtaW5TcGxpdCA9IE1hdGgubWF4KHNwbGl0IC0gKGlzQ29kZSA/IDEwIDogd3JhcExpbWl0IC0gKHdyYXBMaW1pdCA+PiAyKSksIGxhc3RTcGxpdCAtIDEpO1xuICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgIHNwbGl0LS07XG4gICAgICB9XG4gICAgICBpZiAoaXNDb2RlKSB7XG4gICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA9PSBQVU5DVFVBVElPTikge1xuICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBTUEFDRSkge1xuICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIElmIHdlIGZvdW5kIG9uZSwgdGhlbiBhZGQgdGhlIHNwbGl0LlxuICAgICAgaWYgKHNwbGl0ID4gbWluU3BsaXQpIHtcbiAgICAgICAgYWRkU3BsaXQoKytzcGxpdCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuICAgICAgLy8gVGhlIHNwbGl0IGlzIGluc2lkZSBvZiBhIENIQVIgb3IgQ0hBUl9FWFQgdG9rZW4gYW5kIG5vIHNwYWNlXG4gICAgICAvLyBhcm91bmQgLT4gZm9yY2UgYSBzcGxpdC5cbiAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICB9XG4gICAgcmV0dXJuIHNwbGl0cztcbiAgfVxuXG4gIC8qKlxuICAqIEdpdmVuIGEgc3RyaW5nLCByZXR1cm5zIGFuIGFycmF5IG9mIHRoZSBkaXNwbGF5IGNoYXJhY3RlcnMsIGluY2x1ZGluZyB0YWJzIGFuZCBzcGFjZXMuXG4gICogQHBhcmFtIHtTdHJpbmd9IHN0ciBUaGUgc3RyaW5nIHRvIGNoZWNrXG4gICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBUaGUgdmFsdWUgdG8gc3RhcnQgYXRcbiAgKlxuICAqXG4gICoqL1xuICBwcml2YXRlICRnZXREaXNwbGF5VG9rZW5zKHN0cjogc3RyaW5nLCBvZmZzZXQ/OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgdmFyIGFycjogbnVtYmVyW10gPSBbXTtcbiAgICB2YXIgdGFiU2l6ZTogbnVtYmVyO1xuICAgIG9mZnNldCA9IG9mZnNldCB8fCAwO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBjID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAvLyBUYWJcbiAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgdGFiU2l6ZSA9IHRoaXMuZ2V0U2NyZWVuVGFiU2l6ZShhcnIubGVuZ3RoICsgb2Zmc2V0KTtcbiAgICAgICAgYXJyLnB1c2goVEFCKTtcbiAgICAgICAgZm9yICh2YXIgbiA9IDE7IG4gPCB0YWJTaXplOyBuKyspIHtcbiAgICAgICAgICBhcnIucHVzaChUQUJfU1BBQ0UpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBTcGFjZVxuICAgICAgZWxzZSBpZiAoYyA9PSAzMikge1xuICAgICAgICBhcnIucHVzaChTUEFDRSk7XG4gICAgICB9XG4gICAgICBlbHNlIGlmICgoYyA+IDM5ICYmIGMgPCA0OCkgfHwgKGMgPiA1NyAmJiBjIDwgNjQpKSB7XG4gICAgICAgIGFyci5wdXNoKFBVTkNUVUFUSU9OKTtcbiAgICAgIH1cbiAgICAgIC8vIGZ1bGwgd2lkdGggY2hhcmFjdGVyc1xuICAgICAgZWxzZSBpZiAoYyA+PSAweDExMDAgJiYgaXNGdWxsV2lkdGgoYykpIHtcbiAgICAgICAgYXJyLnB1c2goQ0hBUiwgQ0hBUl9FWFQpO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIGFyci5wdXNoKENIQVIpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXJyO1xuICB9XG5cbiAgLyoqXG4gICAqIENhbGN1bGF0ZXMgdGhlIHdpZHRoIG9mIHRoZSBzdHJpbmcgYHN0cmAgb24gdGhlIHNjcmVlbiB3aGlsZSBhc3N1bWluZyB0aGF0IHRoZSBzdHJpbmcgc3RhcnRzIGF0IHRoZSBmaXJzdCBjb2x1bW4gb24gdGhlIHNjcmVlbi5cbiAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY2FsY3VsYXRlIHRoZSBzY3JlZW4gd2lkdGggb2ZcbiAgKiBAcGFyYW0ge051bWJlcn0gbWF4U2NyZWVuQ29sdW1uXG4gICogQHBhcmFtIHtOdW1iZXJ9IHNjcmVlbkNvbHVtblxuICAqIEByZXR1cm5zIHtbTnVtYmVyXX0gUmV0dXJucyBhbiBgaW50W11gIGFycmF5IHdpdGggdHdvIGVsZW1lbnRzOjxici8+XG4gICogVGhlIGZpcnN0IHBvc2l0aW9uIGluZGljYXRlcyB0aGUgbnVtYmVyIG9mIGNvbHVtbnMgZm9yIGBzdHJgIG9uIHNjcmVlbi48YnIvPlxuICAqIFRoZSBzZWNvbmQgdmFsdWUgY29udGFpbnMgdGhlIHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCBjb2x1bW4gdGhhdCB0aGlzIGZ1bmN0aW9uIHJlYWQgdW50aWwuXG4gICpcbiAgKiovXG4gIHB1YmxpYyAkZ2V0U3RyaW5nU2NyZWVuV2lkdGgoc3RyOiBzdHJpbmcsIG1heFNjcmVlbkNvbHVtbj86IG51bWJlciwgc2NyZWVuQ29sdW1uPzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgIGlmIChtYXhTY3JlZW5Db2x1bW4gPT0gMClcbiAgICAgIHJldHVybiBbMCwgMF07XG4gICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSBudWxsKVxuICAgICAgbWF4U2NyZWVuQ29sdW1uID0gSW5maW5pdHk7XG4gICAgc2NyZWVuQ29sdW1uID0gc2NyZWVuQ29sdW1uIHx8IDA7XG5cbiAgICB2YXIgYzogbnVtYmVyO1xuICAgIHZhciBjb2x1bW46IG51bWJlcjtcbiAgICBmb3IgKGNvbHVtbiA9IDA7IGNvbHVtbiA8IHN0ci5sZW5ndGg7IGNvbHVtbisrKSB7XG4gICAgICBjID0gc3RyLmNoYXJDb2RlQXQoY29sdW1uKTtcbiAgICAgIC8vIHRhYlxuICAgICAgaWYgKGMgPT0gOSkge1xuICAgICAgICBzY3JlZW5Db2x1bW4gKz0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbik7XG4gICAgICB9XG4gICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgIHNjcmVlbkNvbHVtbiArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2NyZWVuQ29sdW1uICs9IDE7XG4gICAgICB9XG4gICAgICBpZiAoc2NyZWVuQ29sdW1uID4gbWF4U2NyZWVuQ29sdW1uKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBbc2NyZWVuQ29sdW1uLCBjb2x1bW5dO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBudW1iZXIgb2Ygc2NyZWVucm93cyBpbiBhIHdyYXBwZWQgbGluZS5cbiAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIGNoZWNrXG4gICpcbiAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAqKi9cbiAgcHVibGljIGdldFJvd0xlbmd0aChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICB2YXIgaCA9IHRoaXMubGluZVdpZGdldHNbcm93XSAmJiB0aGlzLmxpbmVXaWRnZXRzW3Jvd10ucm93Q291bnQgfHwgMDtcbiAgICBlbHNlXG4gICAgICBoID0gMFxuICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgIHJldHVybiAxICsgaDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMSArIGg7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBnZXRSb3dMaW5lQ291bnQocm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgIHJldHVybiAxO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDE7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGdldFJvd1dyYXBJbmRlbnQoc2NyZWVuUm93OiBudW1iZXIpIHtcbiAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Bvcy5yb3ddO1xuICAgICAgLy8gRklYTUU6IGluZGVudCBkb2VzIG5vdCBleGlzdHMgb24gbnVtYmVyW11cbiAgICAgIHJldHVybiBzcGxpdHMubGVuZ3RoICYmIHNwbGl0c1swXSA8IHBvcy5jb2x1bW4gPyBzcGxpdHNbJ2luZGVudCddIDogMDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgcG9zaXRpb24gKG9uIHNjcmVlbikgZm9yIHRoZSBsYXN0IGNoYXJhY3RlciBpbiB0aGUgcHJvdmlkZWQgc2NyZWVuIHJvdy5cbiAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcmVlblJvdyBUaGUgc2NyZWVuIHJvdyB0byBjaGVja1xuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKlxuICAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uXG4gICoqL1xuICBwdWJsaWMgZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlbkNvbHVtbihwb3Mucm93LCBwb3MuY29sdW1uKTtcbiAgfVxuXG4gIC8qKlxuICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHRoaXMgcmV0dXJucyB0aGUgY29sdW1uIHBvc2l0aW9uIG9mIHRoZSBsYXN0IHNjcmVlbiByb3cuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAqXG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAqKi9cbiAgcHVibGljIGdldERvY3VtZW50TGFzdFJvd0NvbHVtbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgIHJldHVybiB0aGlzLmdldFNjcmVlbkxhc3RSb3dDb2x1bW4oc2NyZWVuUm93KTtcbiAgfVxuXG4gIC8qKlxuICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHRoaXMgcmV0dXJucyB0aGUgZG9jdW1lbnQgcG9zaXRpb24gb2YgdGhlIGxhc3Qgcm93LlxuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIGdldERvY3VtZW50TGFzdFJvd0NvbHVtblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKSB7XG4gICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSAvIDEwKTtcbiAgfVxuXG4gIC8qKlxuICAqIEZvciB0aGUgZ2l2ZW4gcm93LCB0aGlzIHJldHVybnMgdGhlIHNwbGl0IGRhdGEuXG4gICogQHJldHVybnMge1N0cmluZ31cbiAgKiovXG4gIHB1YmxpYyBnZXRSb3dTcGxpdERhdGEocm93OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoZSBkaXN0YW5jZSB0byB0aGUgbmV4dCB0YWIgc3RvcCBhdCB0aGUgc3BlY2lmaWVkIHNjcmVlbiBjb2x1bW4uXG4gICAqIEBtZXRob3MgZ2V0U2NyZWVuVGFiU2l6ZVxuICAgKiBAcGFyYW0gc2NyZWVuQ29sdW1uIHtudW1iZXJ9IFRoZSBzY3JlZW4gY29sdW1uIHRvIGNoZWNrXG4gICAqIEByZXR1cm4ge251bWJlcn1cbiAgICovXG4gIHB1YmxpYyBnZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy4kdGFiU2l6ZSAtIHNjcmVlbkNvbHVtbiAlIHRoaXMuJHRhYlNpemU7XG4gIH1cblxuXG4gIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50Um93KHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgc2NyZWVuQ29sdW1uKS5yb3c7XG4gIH1cblxuXG4gIHByaXZhdGUgc2NyZWVuVG9Eb2N1bWVudENvbHVtbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikuY29sdW1uO1xuICB9XG5cbiAgLyoqXG4gICogQ29udmVydHMgY2hhcmFjdGVycyBjb29yZGluYXRlcyBvbiB0aGUgc2NyZWVuIHRvIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgd2l0aGluIHRoZSBkb2N1bWVudC4gW1RoaXMgdGFrZXMgaW50byBhY2NvdW50IGNvZGUgZm9sZGluZywgd29yZCB3cmFwLCB0YWIgc2l6ZSwgYW5kIGFueSBvdGhlciB2aXN1YWwgbW9kaWZpY2F0aW9ucy5dezogI2NvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgKiBAcGFyYW0ge251bWJlcn0gc2NyZWVuUm93IFRoZSBzY3JlZW4gcm93IHRvIGNoZWNrXG4gICogQHBhcmFtIHtudW1iZXJ9IHNjcmVlbkNvbHVtbiBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVja1xuICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICoqL1xuICBwdWJsaWMgc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgIGlmIChzY3JlZW5Sb3cgPCAwKSB7XG4gICAgICByZXR1cm4geyByb3c6IDAsIGNvbHVtbjogMCB9O1xuICAgIH1cblxuICAgIHZhciBsaW5lO1xuICAgIHZhciBkb2NSb3cgPSAwO1xuICAgIHZhciBkb2NDb2x1bW4gPSAwO1xuICAgIHZhciBjb2x1bW47XG4gICAgdmFyIHJvdyA9IDA7XG4gICAgdmFyIHJvd0xlbmd0aCA9IDA7XG5cbiAgICB2YXIgcm93Q2FjaGUgPSB0aGlzLiRzY3JlZW5Sb3dDYWNoZTtcbiAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIHNjcmVlblJvdyk7XG4gICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgaWYgKGwgJiYgaSA+PSAwKSB7XG4gICAgICB2YXIgcm93ID0gcm93Q2FjaGVbaV07XG4gICAgICB2YXIgZG9jUm93ID0gdGhpcy4kZG9jUm93Q2FjaGVbaV07XG4gICAgICB2YXIgZG9DYWNoZSA9IHNjcmVlblJvdyA+IHJvd0NhY2hlW2wgLSAxXTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICB9XG5cbiAgICB2YXIgbWF4Um93ID0gdGhpcy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93KTtcbiAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgIHdoaWxlIChyb3cgPD0gc2NyZWVuUm93KSB7XG4gICAgICByb3dMZW5ndGggPSB0aGlzLmdldFJvd0xlbmd0aChkb2NSb3cpO1xuICAgICAgaWYgKHJvdyArIHJvd0xlbmd0aCA+IHNjcmVlblJvdyB8fCBkb2NSb3cgPj0gbWF4Um93KSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcm93ICs9IHJvd0xlbmd0aDtcbiAgICAgICAgZG9jUm93Kys7XG4gICAgICAgIGlmIChkb2NSb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICBkb2NSb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKGRvY1JvdywgZm9sZExpbmUpO1xuICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUucHVzaChkb2NSb3cpO1xuICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZvbGRMaW5lICYmIGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cpIHtcbiAgICAgIGxpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSk7XG4gICAgICBkb2NSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgfSBlbHNlIGlmIChyb3cgKyByb3dMZW5ndGggPD0gc2NyZWVuUm93IHx8IGRvY1JvdyA+IG1heFJvdykge1xuICAgICAgLy8gY2xpcCBhdCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgcm93OiBtYXhSb3csXG4gICAgICAgIGNvbHVtbjogdGhpcy5nZXRMaW5lKG1heFJvdykubGVuZ3RoXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KTtcbiAgICAgIGZvbGRMaW5lID0gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgIHZhciBzcGxpdHMgPSB0aGlzLiR3cmFwRGF0YVtkb2NSb3ddO1xuICAgICAgaWYgKHNwbGl0cykge1xuICAgICAgICB2YXIgc3BsaXRJbmRleCA9IE1hdGguZmxvb3Ioc2NyZWVuUm93IC0gcm93KTtcbiAgICAgICAgY29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXhdO1xuICAgICAgICBpZiAoc3BsaXRJbmRleCA+IDAgJiYgc3BsaXRzLmxlbmd0aCkge1xuICAgICAgICAgIGRvY0NvbHVtbiA9IHNwbGl0c1tzcGxpdEluZGV4IC0gMV0gfHwgc3BsaXRzW3NwbGl0cy5sZW5ndGggLSAxXTtcbiAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHJpbmcoZG9jQ29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGRvY0NvbHVtbiArPSB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aChsaW5lLCBzY3JlZW5Db2x1bW4pWzFdO1xuXG4gICAgLy8gV2UgcmVtb3ZlIG9uZSBjaGFyYWN0ZXIgYXQgdGhlIGVuZCBzbyB0aGF0IHRoZSBkb2NDb2x1bW5cbiAgICAvLyBwb3NpdGlvbiByZXR1cm5lZCBpcyBub3QgYXNzb2NpYXRlZCB0byB0aGUgbmV4dCByb3cgb24gdGhlIHNjcmVlbi5cbiAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUgJiYgZG9jQ29sdW1uID49IGNvbHVtbilcbiAgICAgIGRvY0NvbHVtbiA9IGNvbHVtbiAtIDE7XG5cbiAgICBpZiAoZm9sZExpbmUpXG4gICAgICByZXR1cm4gZm9sZExpbmUuaWR4VG9Qb3NpdGlvbihkb2NDb2x1bW4pO1xuXG4gICAgcmV0dXJuIHsgcm93OiBkb2NSb3csIGNvbHVtbjogZG9jQ29sdW1uIH07XG4gIH1cblxuICAvKipcbiAgKiBDb252ZXJ0cyBkb2N1bWVudCBjb29yZGluYXRlcyB0byBzY3JlZW4gY29vcmRpbmF0ZXMuIHs6Y29udmVyc2lvbkNvbnNpZGVyYXRpb25zfVxuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3cgVGhlIGRvY3VtZW50IHJvdyB0byBjaGVja1xuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW4gVGhlIGRvY3VtZW50IGNvbHVtbiB0byBjaGVja1xuICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgYnkgdGhpcyBtZXRob2QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICpcbiAgKiBAcmVsYXRlZCBFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb25cbiAgKiovXG4gIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgdmFyIHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAvLyBOb3JtYWxpemUgdGhlIHBhc3NlZCBpbiBhcmd1bWVudHMuXG4gICAgaWYgKHR5cGVvZiBkb2NDb2x1bW4gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93Wydyb3cnXSwgZG9jUm93Wydjb2x1bW4nXSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NSb3cgPT09ICdudW1iZXInLCBcImRvY1JvdyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NDb2x1bW4gPT09ICdudW1iZXInLCBcImRvY0NvbHVtbiBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgcG9zID0gdGhpcy4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgfVxuXG4gICAgZG9jUm93ID0gcG9zLnJvdztcbiAgICBkb2NDb2x1bW4gPSBwb3MuY29sdW1uO1xuICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG5cbiAgICB2YXIgc2NyZWVuUm93ID0gMDtcbiAgICB2YXIgZm9sZFN0YXJ0Um93ID0gbnVsbDtcbiAgICB2YXIgZm9sZCA9IG51bGw7XG5cbiAgICAvLyBDbGFtcCB0aGUgZG9jUm93IHBvc2l0aW9uIGluIGNhc2UgaXQncyBpbnNpZGUgb2YgYSBmb2xkZWQgYmxvY2suXG4gICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGRvY1JvdywgZG9jQ29sdW1uLCAxKTtcbiAgICBpZiAoZm9sZCkge1xuICAgICAgZG9jUm93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICBkb2NDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICB9XG5cbiAgICB2YXIgcm93RW5kLCByb3cgPSAwO1xuXG4gICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kZG9jUm93Q2FjaGU7XG4gICAgdmFyIGkgPSB0aGlzLiRnZXRSb3dDYWNoZUluZGV4KHJvd0NhY2hlLCBkb2NSb3cpO1xuICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuJHNjcmVlblJvd0NhY2hlW2ldO1xuICAgICAgdmFyIGRvQ2FjaGUgPSBkb2NSb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICB9XG5cbiAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShyb3cpO1xuICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgd2hpbGUgKHJvdyA8IGRvY1Jvdykge1xuICAgICAgaWYgKHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgcm93RW5kID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgIGlmIChyb3dFbmQgPiBkb2NSb3cpXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUocm93RW5kLCBmb2xkTGluZSk7XG4gICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcm93RW5kID0gcm93ICsgMTtcbiAgICAgIH1cblxuICAgICAgc2NyZWVuUm93ICs9IHRoaXMuZ2V0Um93TGVuZ3RoKHJvdyk7XG4gICAgICByb3cgPSByb3dFbmQ7XG5cbiAgICAgIGlmIChkb0NhY2hlKSB7XG4gICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnB1c2gocm93KTtcbiAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChzY3JlZW5Sb3cpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENhbGN1bGF0ZSB0aGUgdGV4dCBsaW5lIHRoYXQgaXMgZGlzcGxheWVkIGluIGRvY1JvdyBvbiB0aGUgc2NyZWVuLlxuICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG4gICAgLy8gQ2hlY2sgaWYgdGhlIGZpbmFsIHJvdyB3ZSB3YW50IHRvIHJlYWNoIGlzIGluc2lkZSBvZiBhIGZvbGQuXG4gICAgaWYgKGZvbGRMaW5lICYmIHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmUsIGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgIGZvbGRTdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICB9IGVsc2Uge1xuICAgICAgdGV4dExpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KS5zdWJzdHJpbmcoMCwgZG9jQ29sdW1uKTtcbiAgICAgIGZvbGRTdGFydFJvdyA9IGRvY1JvdztcbiAgICB9XG4gICAgLy8gQ2xhbXAgdGV4dExpbmUgaWYgaW4gd3JhcE1vZGUuXG4gICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICB2YXIgd3JhcFJvdyA9IHRoaXMuJHdyYXBEYXRhW2ZvbGRTdGFydFJvd107XG4gICAgICBpZiAod3JhcFJvdykge1xuICAgICAgICB2YXIgc2NyZWVuUm93T2Zmc2V0ID0gMDtcbiAgICAgICAgd2hpbGUgKHRleHRMaW5lLmxlbmd0aCA+PSB3cmFwUm93W3NjcmVlblJvd09mZnNldF0pIHtcbiAgICAgICAgICBzY3JlZW5Sb3crKztcbiAgICAgICAgICBzY3JlZW5Sb3dPZmZzZXQrKztcbiAgICAgICAgfVxuICAgICAgICB0ZXh0TGluZSA9IHRleHRMaW5lLnN1YnN0cmluZyh3cmFwUm93W3NjcmVlblJvd09mZnNldCAtIDFdIHx8IDAsIHRleHRMaW5lLmxlbmd0aCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJvdzogc2NyZWVuUm93LFxuICAgICAgY29sdW1uOiB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCh0ZXh0TGluZSlbMF1cbiAgICB9O1xuICB9XG5cbiAgLyoqXG4gICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgcmV0dXJucyB0aGUgc2NyZWVuIGNvbHVtbi5cbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICpcbiAgKiovXG4gIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuQ29sdW1uKGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKS5jb2x1bW47XG4gIH1cblxuICAvKipcbiAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCByZXR1cm5zIHRoZSBzY3JlZW4gcm93LlxuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICoqL1xuICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikucm93O1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgbGVuZ3RoIG9mIHRoZSBzY3JlZW4uXG4gICogQHJldHVybnMge051bWJlcn1cbiAgKiovXG4gIHB1YmxpYyBnZXRTY3JlZW5MZW5ndGgoKTogbnVtYmVyIHtcbiAgICB2YXIgc2NyZWVuUm93cyA9IDA7XG4gICAgdmFyIGZvbGQgPSBudWxsO1xuICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgIHNjcmVlblJvd3MgPSB0aGlzLmdldExlbmd0aCgpO1xuXG4gICAgICAvLyBSZW1vdmUgdGhlIGZvbGRlZCBsaW5lcyBhZ2Fpbi5cbiAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICBmb2xkID0gZm9sZERhdGFbaV07XG4gICAgICAgIHNjcmVlblJvd3MgLT0gZm9sZC5lbmQucm93IC0gZm9sZC5zdGFydC5yb3c7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBsYXN0Um93ID0gdGhpcy4kd3JhcERhdGEubGVuZ3RoO1xuICAgICAgdmFyIHJvdyA9IDAsIGkgPSAwO1xuICAgICAgdmFyIGZvbGQgPSB0aGlzLiRmb2xkRGF0YVtpKytdO1xuICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGQgPyBmb2xkLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICB3aGlsZSAocm93IDwgbGFzdFJvdykge1xuICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICAgICAgc2NyZWVuUm93cyArPSBzcGxpdHMgPyBzcGxpdHMubGVuZ3RoICsgMSA6IDE7XG4gICAgICAgIHJvdysrO1xuICAgICAgICBpZiAocm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgcm93ID0gZm9sZC5lbmQucm93ICsgMTtcbiAgICAgICAgICBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkID8gZm9sZC5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHRvZG9cbiAgICBpZiAodGhpcy5saW5lV2lkZ2V0cykge1xuICAgICAgc2NyZWVuUm93cyArPSB0aGlzLiRnZXRXaWRnZXRTY3JlZW5MZW5ndGgoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2NyZWVuUm93cztcbiAgfVxuXG4gIC8qKlxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgcHVibGljICRzZXRGb250TWV0cmljcyhmbSkge1xuICAgIC8vIHRvZG9cbiAgfVxuXG4gIGZpbmRNYXRjaGluZ0JyYWNrZXQocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIGNocj86IHN0cmluZyk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5maW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uLCBjaHIpO1xuICB9XG5cbiAgZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9KTogUmFuZ2Uge1xuICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5nZXRCcmFja2V0UmFuZ2UocG9zaXRpb24pO1xuICB9XG5cbiAgJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0OiBzdHJpbmcsIHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0eXBlUmU/OiBSZWdFeHApOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0LCBwb3NpdGlvbiwgdHlwZVJlKTtcbiAgfVxuXG4gICRmaW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldDogc3RyaW5nLCBwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgdHlwZVJlPzogUmVnRXhwKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLiRmaW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gIH1cbn1cblxuLy8gRklYTUU6IFJlc3RvcmVcbi8vIGZsZC5Gb2xkaW5nLmNhbGwoRWRpdFNlc3Npb24ucHJvdG90eXBlKTtcblxuZGVmaW5lT3B0aW9ucyhFZGl0U2Vzc2lvbi5wcm90b3R5cGUsIFwic2Vzc2lvblwiLCB7XG4gIHdyYXA6IHtcbiAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAoIXZhbHVlIHx8IHZhbHVlID09IFwib2ZmXCIpXG4gICAgICAgIHZhbHVlID0gZmFsc2U7XG4gICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcImZyZWVcIilcbiAgICAgICAgdmFsdWUgPSB0cnVlO1xuICAgICAgZWxzZSBpZiAodmFsdWUgPT0gXCJwcmludE1hcmdpblwiKVxuICAgICAgICB2YWx1ZSA9IC0xO1xuICAgICAgZWxzZSBpZiAodHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIpXG4gICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKSB8fCBmYWxzZTtcblxuICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gdmFsdWUpXG4gICAgICAgIHJldHVybjtcbiAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgdGhpcy5zZXRVc2VXcmFwTW9kZShmYWxzZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgY29sID0gdHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIgPyB2YWx1ZSA6IG51bGw7XG4gICAgICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UoY29sLCBjb2wpO1xuICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKHRydWUpO1xuICAgICAgfVxuICAgICAgdGhpcy4kd3JhcCA9IHZhbHVlO1xuICAgIH0sXG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICh0aGlzLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gLTEpXG4gICAgICAgICAgcmV0dXJuIFwicHJpbnRNYXJnaW5cIjtcbiAgICAgICAgaWYgKCF0aGlzLmdldFdyYXBMaW1pdFJhbmdlKCkubWluKVxuICAgICAgICAgIHJldHVybiBcImZyZWVcIjtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXA7XG4gICAgICB9XG4gICAgICByZXR1cm4gXCJvZmZcIjtcbiAgICB9LFxuICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgfSxcbiAgd3JhcE1ldGhvZDoge1xuICAgIC8vIGNvZGV8dGV4dHxhdXRvXG4gICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgIHZhbCA9IHZhbCA9PSBcImF1dG9cIlxuICAgICAgICA/IHRoaXMuJG1vZGUudHlwZSAhPSBcInRleHRcIlxuICAgICAgICA6IHZhbCAhPSBcInRleHRcIjtcbiAgICAgIGlmICh2YWwgIT0gdGhpcy4kd3JhcEFzQ29kZSkge1xuICAgICAgICB0aGlzLiR3cmFwQXNDb2RlID0gdmFsO1xuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIGluaXRpYWxWYWx1ZTogXCJhdXRvXCJcbiAgfSxcbiAgZmlyc3RMaW5lTnVtYmVyOiB7XG4gICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiKTsgfSxcbiAgICBpbml0aWFsVmFsdWU6IDFcbiAgfSxcbiAgdXNlV29ya2VyOiB7XG4gICAgc2V0OiBmdW5jdGlvbih1c2VXb3JrZXIpIHtcbiAgICAgIHRoaXMuJHVzZVdvcmtlciA9IHVzZVdvcmtlcjtcblxuICAgICAgdGhpcy4kc3RvcFdvcmtlcigpO1xuICAgICAgaWYgKHVzZVdvcmtlcilcbiAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcbiAgICB9LFxuICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICB9LFxuICB1c2VTb2Z0VGFiczogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgdGFiU2l6ZToge1xuICAgIHNldDogZnVuY3Rpb24odGFiU2l6ZSkge1xuICAgICAgaWYgKGlzTmFOKHRhYlNpemUpIHx8IHRoaXMuJHRhYlNpemUgPT09IHRhYlNpemUpIHJldHVybjtcblxuICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGUgPSBbXTtcbiAgICAgIHRoaXMuJHRhYlNpemUgPSB0YWJTaXplO1xuICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlVGFiU2l6ZVwiKTtcbiAgICB9LFxuICAgIGluaXRpYWxWYWx1ZTogNCxcbiAgICBoYW5kbGVzU2V0OiB0cnVlXG4gIH0sXG4gIG92ZXJ3cml0ZToge1xuICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuX3NpZ25hbChcImNoYW5nZU92ZXJ3cml0ZVwiKTsgfSxcbiAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gIH0sXG4gIG5ld0xpbmVNb2RlOiB7XG4gICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUodmFsKSB9LFxuICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpIH0sXG4gICAgaGFuZGxlc1NldDogdHJ1ZVxuICB9LFxuICBtb2RlOiB7XG4gICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5zZXRNb2RlKHZhbCkgfSxcbiAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy4kbW9kZUlkIH1cbiAgfVxufSk7XG4iXX0=