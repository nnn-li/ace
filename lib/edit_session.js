import { delayedCall, stringRepeat } from "./lib/lang";
import { _signal, defineOptions, loadModule, resetOptions } from "./config";
import { EventEmitterClass } from "./lib/event_emitter";
import FoldLine from "./fold_line";
import Fold from "./fold";
import { Selection } from "./selection";
import Mode from "./mode/Mode";
import { Range } from "./range";
import { Document } from "./document";
import { BackgroundTokenizer } from "./background_tokenizer";
import { SearchHighlight } from "./search_highlight";
import { assert } from './lib/asserts';
import BracketMatch from "./edit_session/bracket_match";
import TokenIterator from './TokenIterator';
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
        this.$bracketMatcher = new BracketMatch(this);
        this.getAnnotations = function () {
            return this.$annotations || [];
        };
        this.$foldStyles = {
            "manual": 1,
            "markbegin": 1,
            "markbeginend": 1
        };
        this.$foldStyle = "markbegin";
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
        if (!this.$modes["ace/mode/text"]) {
            this.$modes["ace/mode/text"] = new Mode();
        }
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
        if (!$isPlaceholder) {
            this.$modeId = mode.$id;
        }
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
    getFoldAt(row, column, side) {
        var foldLine = this.getFoldLine(row);
        if (!foldLine)
            return null;
        var folds = foldLine.folds;
        for (var i = 0; i < folds.length; i++) {
            var fold = folds[i];
            if (fold.range.contains(row, column)) {
                if (side == 1 && fold.range.isEnd(row, column)) {
                    continue;
                }
                else if (side == -1 && fold.range.isStart(row, column)) {
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
        else {
            fold = new Fold(range, placeholder);
            fold.collapseChildren = range.collapseChildren;
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
            foldLine = this.$addFoldLine(new FoldLine(this.$foldData, fold));
        if (this.$useWrapMode)
            this.$updateWrapData(foldLine.start.row, foldLine.start.row);
        else
            this.$updateRowLengthCache(foldLine.start.row, foldLine.start.row);
        this.setModified(true);
        this._emit("changeFold", { data: fold, action: "add" });
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
        this._emit("changeFold", { data: fold, action: "remove" });
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
        var range, folds;
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
        this.removeListener('change', this.$updateFoldWidgets);
        this._emit("changeAnnotation");
        if (!foldMode || this.$foldStyle == "manual") {
            this.foldWidgets = null;
            return;
        }
        this.foldWidgets = [];
        this.getFoldWidget = foldMode.getFoldWidget.bind(foldMode, this, this.$foldStyle);
        this.getFoldWidgetRange = foldMode.getFoldWidgetRange.bind(foldMode, this, this.$foldStyle);
        this.$updateFoldWidgets = this.updateFoldWidgets.bind(this);
        this.on('change', this.$updateFoldWidgets);
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
    updateFoldWidgets(e) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdF9zZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2VkaXRfc2Vzc2lvbi50cyJdLCJuYW1lcyI6WyJpc0Z1bGxXaWR0aCIsIkVkaXRTZXNzaW9uIiwiRWRpdFNlc3Npb24uY29uc3RydWN0b3IiLCJFZGl0U2Vzc2lvbi5zZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLmdldERvY3VtZW50IiwiRWRpdFNlc3Npb24uJHJlc2V0Um93Q2FjaGUiLCJFZGl0U2Vzc2lvbi4kZ2V0Um93Q2FjaGVJbmRleCIsIkVkaXRTZXNzaW9uLnJlc2V0Q2FjaGVzIiwiRWRpdFNlc3Npb24ub25DaGFuZ2VGb2xkIiwiRWRpdFNlc3Npb24ub25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXRWYWx1ZSIsIkVkaXRTZXNzaW9uLnRvU3RyaW5nIiwiRWRpdFNlc3Npb24uZ2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi5nZXRTZWxlY3Rpb24iLCJFZGl0U2Vzc2lvbi5nZXRTdGF0ZSIsIkVkaXRTZXNzaW9uLmdldFRva2VucyIsIkVkaXRTZXNzaW9uLmdldFRva2VuQXQiLCJFZGl0U2Vzc2lvbi5zZXRVbmRvTWFuYWdlciIsIkVkaXRTZXNzaW9uLm1hcmtVbmRvR3JvdXAiLCJFZGl0U2Vzc2lvbi5nZXRVbmRvTWFuYWdlciIsIkVkaXRTZXNzaW9uLmdldFRhYlN0cmluZyIsIkVkaXRTZXNzaW9uLnNldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uZ2V0VXNlU29mdFRhYnMiLCJFZGl0U2Vzc2lvbi5zZXRUYWJTaXplIiwiRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmlzVGFiU3RvcCIsIkVkaXRTZXNzaW9uLnNldE92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLmdldE92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLnRvZ2dsZU92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLmFkZEd1dHRlckRlY29yYXRpb24iLCJFZGl0U2Vzc2lvbi5yZW1vdmVHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24uZ2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5zZXRCcmVha3BvaW50cyIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5zZXRCcmVha3BvaW50IiwiRWRpdFNlc3Npb24uY2xlYXJCcmVha3BvaW50IiwiRWRpdFNlc3Npb24uYWRkTWFya2VyIiwiRWRpdFNlc3Npb24uYWRkRHluYW1pY01hcmtlciIsIkVkaXRTZXNzaW9uLnJlbW92ZU1hcmtlciIsIkVkaXRTZXNzaW9uLmdldE1hcmtlcnMiLCJFZGl0U2Vzc2lvbi5oaWdobGlnaHQiLCJFZGl0U2Vzc2lvbi5oaWdobGlnaHRMaW5lcyIsIkVkaXRTZXNzaW9uLnNldEFubm90YXRpb25zIiwiRWRpdFNlc3Npb24uY2xlYXJBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLiRkZXRlY3ROZXdMaW5lIiwiRWRpdFNlc3Npb24uZ2V0V29yZFJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0QVdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLnNldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uZ2V0TmV3TGluZU1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5vblJlbG9hZFRva2VuaXplciIsIkVkaXRTZXNzaW9uLnNldE1vZGUiLCJFZGl0U2Vzc2lvbi4kb25DaGFuZ2VNb2RlIiwiRWRpdFNlc3Npb24uJHN0b3BXb3JrZXIiLCJFZGl0U2Vzc2lvbi4kc3RhcnRXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNb2RlIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsTGVmdCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldExpbmVXaWRnZXRNYXhXaWR0aCIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TGluZXMiLCJFZGl0U2Vzc2lvbi5nZXRMZW5ndGgiLCJFZGl0U2Vzc2lvbi5nZXRUZXh0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5pbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZW1vdmUiLCJFZGl0U2Vzc2lvbi51bmRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnJlZG9DaGFuZ2VzIiwiRWRpdFNlc3Npb24uc2V0VW5kb1NlbGVjdCIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uJGdldFVuZG9TZWxlY3Rpb24uaXNJbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZXBsYWNlIiwiRWRpdFNlc3Npb24ubW92ZVRleHQiLCJFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzIiwiRWRpdFNlc3Npb24ub3V0ZGVudFJvd3MiLCJFZGl0U2Vzc2lvbi4kbW92ZUxpbmVzIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzVXAiLCJFZGl0U2Vzc2lvbi5tb3ZlTGluZXNEb3duIiwiRWRpdFNlc3Npb24uZHVwbGljYXRlTGluZXMiLCJFZGl0U2Vzc2lvbi4kY2xpcFJvd1RvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcENvbHVtblRvUm93IiwiRWRpdFNlc3Npb24uJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcFJhbmdlVG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLnNldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uZ2V0VXNlV3JhcE1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLmFkanVzdFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLiRjb25zdHJhaW5XcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVSb3dMZW5ndGhDYWNoZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVXcmFwRGF0YSIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cyIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cy5hZGRTcGxpdCIsIkVkaXRTZXNzaW9uLiRnZXREaXNwbGF5VG9rZW5zIiwiRWRpdFNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGluZUNvdW50IiwiRWRpdFNlc3Npb24uZ2V0Um93V3JhcEluZGVudCIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmdldFJvd1NwbGl0RGF0YSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlblRhYlNpemUiLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93IiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudENvbHVtbiIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoIiwiRWRpdFNlc3Npb24uJHNldEZvbnRNZXRyaWNzIiwiRWRpdFNlc3Npb24uZmluZE1hdGNoaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEJyYWNrZXRSYW5nZSIsIkVkaXRTZXNzaW9uLiRmaW5kT3BlbmluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi4kZmluZENsb3NpbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZEF0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlTGlzdCIsIkVkaXRTZXNzaW9uLmdldEFsbEZvbGRzIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZFN0cmluZ0F0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXRGb2xkZWRSb3dDb3VudCIsIkVkaXRTZXNzaW9uLiRhZGRGb2xkTGluZSIsIkVkaXRTZXNzaW9uLmFkZEZvbGQiLCJFZGl0U2Vzc2lvbi5zZXRNb2RpZmllZCIsIkVkaXRTZXNzaW9uLmFkZEZvbGRzIiwiRWRpdFNlc3Npb24ucmVtb3ZlRm9sZCIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGRzIiwiRWRpdFNlc3Npb24uZXhwYW5kRm9sZCIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGRzIiwiRWRpdFNlc3Npb24udW5mb2xkIiwiRWRpdFNlc3Npb24uaXNSb3dGb2xkZWQiLCJFZGl0U2Vzc2lvbi5nZXRSb3dGb2xkRW5kIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uZ2V0RGlzcGxheUxpbmUiLCJFZGl0U2Vzc2lvbi4kY2xvbmVGb2xkRGF0YSIsIkVkaXRTZXNzaW9uLnRvZ2dsZUZvbGQiLCJFZGl0U2Vzc2lvbi5nZXRDb21tZW50Rm9sZFJhbmdlIiwiRWRpdFNlc3Npb24uZm9sZEFsbCIsIkVkaXRTZXNzaW9uLnNldEZvbGRTdHlsZSIsIkVkaXRTZXNzaW9uLiRzZXRGb2xkaW5nIiwiRWRpdFNlc3Npb24uZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YSIsIkVkaXRTZXNzaW9uLm9uRm9sZFdpZGdldENsaWNrIiwiRWRpdFNlc3Npb24uJHRvZ2dsZUZvbGRXaWRnZXQiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udXBkYXRlRm9sZFdpZGdldHMiXSwibWFwcGluZ3MiOiJPQStCTyxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLEVBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFDLE1BQU0sVUFBVTtPQUNsRSxFQUFDLGlCQUFpQixFQUFDLE1BQU0scUJBQXFCO09BQzlDLFFBQVEsTUFBTSxhQUFhO09BQzNCLElBQUksTUFBTSxRQUFRO09BQ2xCLEVBQUMsU0FBUyxFQUFDLE1BQU0sYUFBYTtPQUM5QixJQUFJLE1BQU0sYUFBYTtPQUN2QixFQUFDLEtBQUssRUFBQyxNQUFNLFNBQVM7T0FDdEIsRUFBQyxRQUFRLEVBQUMsTUFBTSxZQUFZO09BQzVCLEVBQUMsbUJBQW1CLEVBQUMsTUFBTSx3QkFBd0I7T0FDbkQsRUFBQyxlQUFlLEVBQUMsTUFBTSxvQkFBb0I7T0FDM0MsRUFBQyxNQUFNLEVBQUMsTUFBTSxlQUFlO09BQzdCLFlBQVksTUFBTSw4QkFBOEI7T0FFaEQsYUFBYSxNQUFNLGlCQUFpQjtBQUczQyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQ1YsUUFBUSxHQUFHLENBQUMsRUFDWixpQkFBaUIsR0FBRyxDQUFDLEVBQ3JCLGdCQUFnQixHQUFHLENBQUMsRUFDcEIsV0FBVyxHQUFHLENBQUMsRUFDZixLQUFLLEdBQUcsRUFBRSxFQUNWLEdBQUcsR0FBRyxFQUFFLEVBQ1IsU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUlqQixxQkFBcUIsQ0FBUztJQUM1QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDYkEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDZkEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDL0JBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJ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QUlBLE9BQU9BLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3BCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNiQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUUxREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDWEEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFdERBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1ZBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBO1FBQ3hCQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4REEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDaEJBLElBQUlBO1lBQ0ZBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBRTNCQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQTtRQUNuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZEEsR0FBR0EsQ0FBQ0E7Z0JBQ0ZBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ1ZBLENBQUNBLFFBQ01BLEtBQUtBLElBQUlBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtB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S0EsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3ZDQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDMUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNsREEsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xFQSxDQUFDQTtnQkFDREEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ3hCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDakRBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUM1REEsQ0FBQ0E7Z0JBQ0RBLGlCQUFpQkEsR0FBR0EsSUFBSUEsQ0FBQ0E7WUFDM0JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNKQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDMUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNsREEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pFQSxDQUFDQTtnQkFDREEsaUJBQWlCQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUM1QkEsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFJREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsYUFBYUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNoRUEsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7Z0JBQ3BFQSxhQUFhQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNwRUEsQ0FBQ0E7WUFFREEsSUFBSUEsR0FBR0EsR0FBR0EsYUFBYUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDNUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNkQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUN0RUEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxhQUFhQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNsRUEsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDZkEsQ0FBQ0E7SUFvQk14RSxPQUFPQSxDQUFDQSxLQUFZQSxFQUFFQSxJQUFZQTtRQUN2QzBFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ3ZDQSxDQUFDQTtJQWNNMUUsUUFBUUEsQ0FBQ0EsU0FBU0EsRUFBRUEsVUFBVUEsRUFBRUEsSUFBSUE7UUFDekMyRSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNaQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDMUZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNsQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUN0RkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2hDQSxDQUFDQTtZQUNIQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdERBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDN0JBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNqQkEsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBO1lBQzdCQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN0Q0EsT0FBT0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDNUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLFVBQVNBLENBQUNBO2dCQUNoQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDO2dCQUNkLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUNoQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sSUFBSSxPQUFPLENBQUM7Z0JBQzVCLENBQUM7Z0JBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQztnQkFDMUIsQ0FBQztnQkFDRCxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsSUFBSSxPQUFPLENBQUM7Z0JBQ3ZCLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQztnQkFDckIsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNYLENBQUMsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDTkEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBWU0zRSxVQUFVQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxFQUFFQSxZQUFZQTtRQUM5QzRFLFlBQVlBLEdBQUdBLFlBQVlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBLENBQUNBO1FBQ2hFQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxFQUFFQSxHQUFHQSxJQUFJQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQTtZQUMzQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsRUFBRUEsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0E7SUFDdkRBLENBQUNBO0lBUU01RSxXQUFXQSxDQUFDQSxLQUFZQTtRQUM3QjZFLElBQUlBLFFBQVFBLEdBQUdBLEtBQUtBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBQ3BDQSxJQUFJQSxXQUFXQSxHQUFHQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4Q0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsRUFBRUEsQ0FBQ0E7UUFFN0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQzVEQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUzQkEsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ3hCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxFQUFFQSxDQUFDQTtnQkFDM0JBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBO29CQUN4QkEsS0FBS0EsQ0FBQ0E7WUFDVkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDN0JBLFdBQVdBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ2pDQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxD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QUFHQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDZEEsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7d0JBQ2hFQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDekJBLENBQUNBO29CQUVIQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDeENBLENBQUNBO2dCQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDeENBLElBQUlBLFFBQVFBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsSUFBSUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ25DQSxRQUFRQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDekJBLENBQUNBO2dCQUNIQSxDQUFDQTtZQUNIQSxDQUFDQTtRQUNIQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUdOQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEs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QSxNQUFNQSxHQUFHQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUVyQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDckRBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNkQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDakNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUN0QkEsQ0FBQ0E7WUFDSEEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNsQkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQTtZQUN4QkEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtZQUMzQkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ2pCQSxDQUFDQTtRQUNIQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtJQUNiQSxDQUFDQTtJQVlNbkcscUJBQXFCQSxDQUFDQSxHQUFXQSxFQUFFQSxlQUF3QkEsRUFBRUEsWUFBcUJBO1FBQ3ZGb0csRUFBRUEsQ0FBQ0EsQ0FBQ0EsZUFBZUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDdkJBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ2hCQSxFQUFFQSxDQUFDQSxDQUFDQSxlQUFlQSxJQUFJQSxJQUFJQSxDQUFDQTtZQUMxQkEsZUFBZUEsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFDN0JBLFlBQVlBLEdBQUdBLFlBQVlBLElBQUlBLENBQUNBLENBQUNBO1FBRWpDQSxJQUFJQSxDQUFTQSxDQUFDQTtRQUNkQSxJQUFJQSxNQUFjQSxDQUFDQTtRQUNuQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDL0NBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBRTNCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsWUFBWUEsSUFBSUEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtZQUN0REEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZDQSxZQUFZQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ05BLFlBQVlBLElBQUlBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxHQUFHQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbkNBLEtBQUtBLENBQUNBO1lBQ1JBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLENBQUNBLFlBQVlBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO0lBQ2hDQSxDQUFDQTtJQVFNcEcsWUFBWUEsQ0FBQ0EsR0FBV0E7UUFDN0JxRyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTtZQUNuQkEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkVBLElBQUlBO1lBQ0ZBLENBQUNBLEdBQUdBLENBQUNBLENBQUFBO1FBQ1BBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQy9DQSxNQUFNQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNmQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNOQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM1Q0EsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFFT3JHLGVBQWVBLENBQUNBLEdBQVdBO1FBQ2pDc0csRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDL0NBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1FBQ1hBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1FBQ3hDQSxDQUFDQTtJQUNIQSxDQUFDQTtJQUVNdEcsZ0JBQWdCQSxDQUFDQSxTQUFpQkE7UUFDdkN1RyxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0Esd0JBQXdCQSxDQUFDQSxTQUFTQSxFQUFFQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtZQUNyRUEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFFckNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FB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QUFDQTtRQUNuQkEsSUFBSUEsSUFBSUEsR0FBYUEsSUFBSUEsQ0FBQ0E7UUFDMUJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUc5QkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDOUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN6Q0EsSUFBSUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxVQUFVQSxJQUFJQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUM5Q0EsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDcENBLElBQUlBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtZQUMvQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7WUFFakRBLE9BQU9BLEdBQUdBLEdBQUdBLE9BQU9BLEVBQUVBLENBQUNBO2dCQUNyQkEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pDQSxVQUFVQSxJQUFJQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDN0NBLEdBQUdBLEVBQUVBLENBQUNBO2dCQUNOQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDcEJBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO29CQUN2QkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxTQUFTQSxHQUFHQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtnQkFDL0NBLENBQUNBO1lBQ0hBLENBQUNBO1FBQ0hBLENBQUNBO1FBR0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxVQUFVQSxJQUFJQSxJQUFJQSxDQUFDQSxzQkFBc0JBLEVBQUVBLENBQUNBO1FBQzlDQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUNwQkEsQ0FBQ0E7SUFLTW5ILGVBQWVBLENBQUNBLEVBQUVBO0lBRXpCb0gsQ0FBQ0E7SUFFRHBILG1CQUFtQkEsQ0FBQ0EsUUFBeUNBLEVBQUVBLEdBQVlBO1FBQ3pFcUgsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsbUJBQW1CQSxDQUFDQSxRQUFRQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtJQUNqRUEsQ0FBQ0E7SUFFRHJILGVBQWVBLENBQUNBLFFBQXlDQTtRQUN2RHNILE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLGVBQWVBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO0lBQ3hEQSxDQUFDQTtJQUVEdEgsbUJBQW1CQSxDQUFDQSxPQUFlQSxFQUFFQSxRQUF5Q0EsRUFBRUEsTUFBZUE7UUFDN0Z1SCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxtQkFBbUJBLENBQUNBLE9BQU9BLEVBQUVBLFFBQVFBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO0lBQzdFQSxDQUFDQTtJQUVEdkgsbUJBQW1CQSxDQUFDQSxPQUFlQSxFQUFFQSxRQUF5Q0EsRUFBRUEsTUFBZUE7UUFDN0Z3SCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxtQkFBbUJBLENBQUNBLE9BQU9BLEVBQUVBLFFBQVFBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO0lBQzdFQSxDQUFDQTtJQWVEeEgsU0FBU0EsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBTUEsRUFBRUEsSUFBS0E7UUFDbEN5SCxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNyQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDWkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFFZEEsSUFBSUEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFDM0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3RDQSxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDL0NBLFFBQVFBLENBQUNBO2dCQUNYQSxDQUFDQTtnQkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ3pEQSxRQUFRQSxDQUFDQTtnQkFDWEEsQ0FBQ0E7Z0JBQ0RBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1lBQ2RBLENBQUNBO1FBQ0hBLENBQUNBO0lBQ0hBLENBQUNBO0lBTUR6SCxlQUFlQSxDQUFDQSxLQUFZQTtRQUMxQjBILElBQUlBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO1FBQ3hCQSxJQUFJQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNwQkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLElBQUlBLFVBQVVBLEdBQVdBLEVBQUVBLENBQUNBO1FBRTVCQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNsQkEsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFaEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQzFDQSxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNqREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBR2JBLFFBQVFBLENBQUNBO1lBQ1hBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUduQkEsS0FBS0EsQ0FBQ0E7WUFDUkEsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN0Q0EsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDckNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNkQSxLQUFLQSxDQUFDQTtnQkFDUkEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNwQkEsUUFBUUEsQ0FBQ0E7Z0JBQ1hBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUVKQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDZEEsS0FBS0EsQ0FBQ0E7Z0JBQ1JBLENBQUNBO2dCQUNIQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN4QkEsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFDREEsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FB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LENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyRkEsS0FBS0EsQ0FBQ0E7WUFDUkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25CQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNkQSxDQUFDQTtZQUNEQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNsQkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDUEEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFcEVBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ2JBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLEVBQUVBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQ3hEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNqQkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDckRBLElBQUlBO1lBQ0ZBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ2ZBLENBQUNBO0lBRUQ3SCxXQUFXQSxDQUFDQSxNQUFjQSxFQUFFQSxhQUF3QkE7UUFDbEQ4SCxJQUFJ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QUNBLENBQUNBO3dCQUVyREEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7d0JBQzdCQSxLQUFLQSxDQUFDQTtvQkFDUkEsQ0FBQ0E7Z0JBQ0hBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNSQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDeENBLEtBQUtBLENBQUNBO1lBQ1JBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ1RBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBRW5FQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtZQUNwQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDL0RBLElBQUlBO1lBQ0ZBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHckVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUV4REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDZEEsQ0FBQ0E7SUFFRGxJLFdBQVdBLENBQUNBLFFBQWlCQTtJQUU3Qm1JLENBQUNBO0lBRURuSSxRQUFRQSxDQUFDQSxLQUFhQTtRQUNwQm9JLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLElBQUlBO1lBQ3pCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDckIsQ0FBQyxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtJQUNYQSxDQUFDQTtJQUVEcEksVUFBVUEsQ0FBQ0EsSUFBVUE7UUFDbkJxSSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQTtRQUM3QkEsSUFBSUEsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDbENBLElBQUlBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1FBRTlCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUMvQkEsSUFBSUEsS0FBS0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7UUFHM0JBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNuREEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FFSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeERBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLENBQUNBO1lBQ1pBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1lBQ25EQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUMzREEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FFSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOURBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3hDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNoREEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FLSkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDakJBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3ZDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUdOQSxDQUFDQTtZQUNDQSxJQUFJQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFL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QUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0E7WUFDdkVBLENBQUNBO1FBQ0hBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ05BLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDaENBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN4QkEsTUFBTUEsQ0FBQ0E7WUFDVEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsQ0FBQ0E7UUFDSEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDUkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFN0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0E7UUFDVEEsQ0FBQ0E7UUFFREEsSUFBSUEsV0FBV0Es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Q0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLE1BQU1BLENBQUNBO1FBQ1RBLENBQUNBO1FBRURBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFL0NBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdEJBLE1BQU1BLENBQUNBO1lBQ1RBLENBQUNBO1FBQ0hBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDZkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsRUFBRUEsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDMURBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQzFCQSxNQUFNQSxHQUFHQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUNsREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsRUFBRUEsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDaEVBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ2ZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUVoQkEsS0FBS0EsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUNqQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2ZBLENBQUNBO0lBSUR2SixnQkFBZ0JBLENBQUNBLFlBQVlBO1FBQzNCd0osSUFBSUEsR0FBR0EsR0FBV0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDakRBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNB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LENBQUM7UUFDeEMsR0FBRyxFQUFFLGNBQWEsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUEsQ0FBQyxDQUFDO0tBQ3hDO0NBQ0YsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogKioqKiogQkVHSU4gTElDRU5TRSBCTE9DSyAqKioqKlxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBsaWNlbnNlOlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxMCwgQWpheC5vcmcgQi5WLlxuICogQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqXG4gKiBSZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXRcbiAqIG1vZGlmaWNhdGlvbiwgYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuICogICAgICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAqICAgICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0XG4gKiAgICAgICBub3RpY2UsIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlXG4gKiAgICAgICBkb2N1bWVudGF0aW9uIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuICogICAgICogTmVpdGhlciB0aGUgbmFtZSBvZiBBamF4Lm9yZyBCLlYuIG5vciB0aGVcbiAqICAgICAgIG5hbWVzIG9mIGl0cyBjb250cmlidXRvcnMgbWF5IGJlIHVzZWQgdG8gZW5kb3JzZSBvciBwcm9tb3RlIHByb2R1Y3RzXG4gKiAgICAgICBkZXJpdmVkIGZyb20gdGhpcyBzb2Z0d2FyZSB3aXRob3V0IHNwZWNpZmljIHByaW9yIHdyaXR0ZW4gcGVybWlzc2lvbi5cbiAqXG4gKiBUSElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbiAqIEFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG4gKiBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG4gKiBESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBBSkFYLk9SRyBCLlYuIEJFIExJQUJMRSBGT1IgQU5ZXG4gKiBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuICogKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuICogTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EXG4gKiBPTiBBTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuICogKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcbiAqIFNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLlxuICpcbiAqICoqKioqIEVORCBMSUNFTlNFIEJMT0NLICoqKioqICovXG5cbmltcG9ydCB7bWl4aW59IGZyb20gXCIuL2xpYi9vb3BcIjtcbmltcG9ydCB7ZGVsYXllZENhbGwsIHN0cmluZ1JlcGVhdH0gZnJvbSBcIi4vbGliL2xhbmdcIjtcbmltcG9ydCB7X3NpZ25hbCwgZGVmaW5lT3B0aW9ucywgbG9hZE1vZHVsZSwgcmVzZXRPcHRpb25zfSBmcm9tIFwiLi9jb25maWdcIjtcbmltcG9ydCB7RXZlbnRFbWl0dGVyQ2xhc3N9IGZyb20gXCIuL2xpYi9ldmVudF9lbWl0dGVyXCI7XG5pbXBvcnQgRm9sZExpbmUgZnJvbSBcIi4vZm9sZF9saW5lXCI7XG5pbXBvcnQgRm9sZCBmcm9tIFwiLi9mb2xkXCI7XG5pbXBvcnQge1NlbGVjdGlvbn0gZnJvbSBcIi4vc2VsZWN0aW9uXCI7XG5pbXBvcnQgTW9kZSBmcm9tIFwiLi9tb2RlL01vZGVcIjtcbmltcG9ydCB7UmFuZ2V9IGZyb20gXCIuL3JhbmdlXCI7XG5pbXBvcnQge0RvY3VtZW50fSBmcm9tIFwiLi9kb2N1bWVudFwiO1xuaW1wb3J0IHtCYWNrZ3JvdW5kVG9rZW5pemVyfSBmcm9tIFwiLi9iYWNrZ3JvdW5kX3Rva2VuaXplclwiO1xuaW1wb3J0IHtTZWFyY2hIaWdobGlnaHR9IGZyb20gXCIuL3NlYXJjaF9oaWdobGlnaHRcIjtcbmltcG9ydCB7YXNzZXJ0fSBmcm9tICcuL2xpYi9hc3NlcnRzJztcbmltcG9ydCBCcmFja2V0TWF0Y2ggZnJvbSBcIi4vZWRpdF9zZXNzaW9uL2JyYWNrZXRfbWF0Y2hcIjtcbmltcG9ydCB7VW5kb01hbmFnZXJ9IGZyb20gJy4vdW5kb21hbmFnZXInXG5pbXBvcnQgVG9rZW5JdGVyYXRvciBmcm9tICcuL1Rva2VuSXRlcmF0b3InO1xuXG4vLyBcIlRva2Vuc1wiXG52YXIgQ0hBUiA9IDEsXG4gIENIQVJfRVhUID0gMixcbiAgUExBQ0VIT0xERVJfU1RBUlQgPSAzLFxuICBQTEFDRUhPTERFUl9CT0RZID0gNCxcbiAgUFVOQ1RVQVRJT04gPSA5LFxuICBTUEFDRSA9IDEwLFxuICBUQUIgPSAxMSxcbiAgVEFCX1NQQUNFID0gMTI7XG5cbi8vIEZvciBldmVyeSBrZXlzdHJva2UgdGhpcyBnZXRzIGNhbGxlZCBvbmNlIHBlciBjaGFyIGluIHRoZSB3aG9sZSBkb2MhIVxuLy8gV291bGRuJ3QgaHVydCB0byBtYWtlIGl0IGEgYml0IGZhc3RlciBmb3IgYyA+PSAweDExMDBcbmZ1bmN0aW9uIGlzRnVsbFdpZHRoKGM6IG51bWJlcik6IGJvb2xlYW4ge1xuICBpZiAoYyA8IDB4MTEwMClcbiAgICByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBjID49IDB4MTEwMCAmJiBjIDw9IDB4MTE1RiB8fFxuICAgIGMgPj0gMHgxMUEzICYmIGMgPD0gMHgxMUE3IHx8XG4gICAgYyA+PSAweDExRkEgJiYgYyA8PSAweDExRkYgfHxcbiAgICBjID49IDB4MjMyOSAmJiBjIDw9IDB4MjMyQSB8fFxuICAgIGMgPj0gMHgyRTgwICYmIGMgPD0gMHgyRTk5IHx8XG4gICAgYyA+PSAweDJFOUIgJiYgYyA8PSAweDJFRjMgfHxcbiAgICBjID49IDB4MkYwMCAmJiBjIDw9IDB4MkZENSB8fFxuICAgIGMgPj0gMHgyRkYwICYmIGMgPD0gMHgyRkZCIHx8XG4gICAgYyA+PSAweDMwMDAgJiYgYyA8PSAweDMwM0UgfHxcbiAgICBjID49IDB4MzA0MSAmJiBjIDw9IDB4MzA5NiB8fFxuICAgIGMgPj0gMHgzMDk5ICYmIGMgPD0gMHgzMEZGIHx8XG4gICAgYyA+PSAweDMxMDUgJiYgYyA8PSAweDMxMkQgfHxcbiAgICBjID49IDB4MzEzMSAmJiBjIDw9IDB4MzE4RSB8fFxuICAgIGMgPj0gMHgzMTkwICYmIGMgPD0gMHgzMUJBIHx8XG4gICAgYyA+PSAweDMxQzAgJiYgYyA8PSAweDMxRTMgfHxcbiAgICBjID49IDB4MzFGMCAmJiBjIDw9IDB4MzIxRSB8fFxuICAgIGMgPj0gMHgzMjIwICYmIGMgPD0gMHgzMjQ3IHx8XG4gICAgYyA+PSAweDMyNTAgJiYgYyA8PSAweDMyRkUgfHxcbiAgICBjID49IDB4MzMwMCAmJiBjIDw9IDB4NERCRiB8fFxuICAgIGMgPj0gMHg0RTAwICYmIGMgPD0gMHhBNDhDIHx8XG4gICAgYyA+PSAweEE0OTAgJiYgYyA8PSAweEE0QzYgfHxcbiAgICBjID49IDB4QTk2MCAmJiBjIDw9IDB4QTk3QyB8fFxuICAgIGMgPj0gMHhBQzAwICYmIGMgPD0gMHhEN0EzIHx8XG4gICAgYyA+PSAweEQ3QjAgJiYgYyA8PSAweEQ3QzYgfHxcbiAgICBjID49IDB4RDdDQiAmJiBjIDw9IDB4RDdGQiB8fFxuICAgIGMgPj0gMHhGOTAwICYmIGMgPD0gMHhGQUZGIHx8XG4gICAgYyA+PSAweEZFMTAgJiYgYyA8PSAweEZFMTkgfHxcbiAgICBjID49IDB4RkUzMCAmJiBjIDw9IDB4RkU1MiB8fFxuICAgIGMgPj0gMHhGRTU0ICYmIGMgPD0gMHhGRTY2IHx8XG4gICAgYyA+PSAweEZFNjggJiYgYyA8PSAweEZFNkIgfHxcbiAgICBjID49IDB4RkYwMSAmJiBjIDw9IDB4RkY2MCB8fFxuICAgIGMgPj0gMHhGRkUwICYmIGMgPD0gMHhGRkU2O1xufVxuXG4vKipcbiAqIFN0b3JlcyBhbGwgdGhlIGRhdGEgYWJvdXQgW1tFZGl0b3IgYEVkaXRvcmBdXSBzdGF0ZSBwcm92aWRpbmcgZWFzeSB3YXkgdG8gY2hhbmdlIGVkaXRvcnMgc3RhdGUuXG4gKlxuICogYEVkaXRTZXNzaW9uYCBjYW4gYmUgYXR0YWNoZWQgdG8gb25seSBvbmUgW1tEb2N1bWVudCBgRG9jdW1lbnRgXV0uIFNhbWUgYERvY3VtZW50YCBjYW4gYmUgYXR0YWNoZWQgdG8gc2V2ZXJhbCBgRWRpdFNlc3Npb25gcy5cbiAqIEBjbGFzcyBFZGl0U2Vzc2lvblxuICoqL1xuXG4vL3sgZXZlbnRzXG4vKipcbiAqXG4gKiBFbWl0dGVkIHdoZW4gdGhlIGRvY3VtZW50IGNoYW5nZXMuXG4gKiBAZXZlbnQgY2hhbmdlXG4gKiBAcGFyYW0ge09iamVjdH0gZSBBbiBvYmplY3QgY29udGFpbmluZyBhIGBkZWx0YWAgb2YgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGNoYW5nZS5cbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSB0YWIgc2l6ZSBjaGFuZ2VzLCB2aWEgW1tFZGl0U2Vzc2lvbi5zZXRUYWJTaXplXV0uXG4gKlxuICogQGV2ZW50IGNoYW5nZVRhYlNpemVcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBhYmlsaXR5IHRvIG92ZXJ3cml0ZSB0ZXh0IGNoYW5nZXMsIHZpYSBbW0VkaXRTZXNzaW9uLnNldE92ZXJ3cml0ZV1dLlxuICpcbiAqIEBldmVudCBjaGFuZ2VPdmVyd3JpdGVcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBndXR0ZXIgY2hhbmdlcywgZWl0aGVyIGJ5IHNldHRpbmcgb3IgcmVtb3ZpbmcgYnJlYWtwb2ludHMsIG9yIHdoZW4gdGhlIGd1dHRlciBkZWNvcmF0aW9ucyBjaGFuZ2UuXG4gKlxuICogQGV2ZW50IGNoYW5nZUJyZWFrcG9pbnRcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIGEgZnJvbnQgbWFya2VyIGNoYW5nZXMuXG4gKlxuICogQGV2ZW50IGNoYW5nZUZyb250TWFya2VyXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhIGJhY2sgbWFya2VyIGNoYW5nZXMuXG4gKlxuICogQGV2ZW50IGNoYW5nZUJhY2tNYXJrZXJcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIGFuIGFubm90YXRpb24gY2hhbmdlcywgbGlrZSB0aHJvdWdoIFtbRWRpdFNlc3Npb24uc2V0QW5ub3RhdGlvbnNdXS5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlQW5ub3RhdGlvblxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBiYWNrZ3JvdW5kIHRva2VuaXplciBhc3luY2hyb25vdXNseSBwcm9jZXNzZXMgbmV3IHJvd3MuXG4gKiBAZXZlbnQgdG9rZW5pemVyVXBkYXRlXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IGUgQW4gb2JqZWN0IGNvbnRhaW5pbmcgb25lIHByb3BlcnR5LCBgXCJkYXRhXCJgLCB0aGF0IGNvbnRhaW5zIGluZm9ybWF0aW9uIGFib3V0IHRoZSBjaGFuZ2luZyByb3dzXG4gKlxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gdGhlIGN1cnJlbnQgbW9kZSBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VNb2RlXG4gKlxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gdGhlIHdyYXAgbW9kZSBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VXcmFwTW9kZVxuICpcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSB3cmFwcGluZyBsaW1pdCBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VXcmFwTGltaXRcbiAqXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhIGNvZGUgZm9sZCBpcyBhZGRlZCBvciByZW1vdmVkLlxuICpcbiAqIEBldmVudCBjaGFuZ2VGb2xkXG4gKlxuICoqL1xuLyoqXG4qIEVtaXR0ZWQgd2hlbiB0aGUgc2Nyb2xsIHRvcCBjaGFuZ2VzLlxuKiBAZXZlbnQgY2hhbmdlU2Nyb2xsVG9wXG4qXG4qIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4qKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBzY3JvbGwgbGVmdCBjaGFuZ2VzLlxuICogQGV2ZW50IGNoYW5nZVNjcm9sbExlZnRcbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsTGVmdCBUaGUgbmV3IHNjcm9sbCBsZWZ0IHZhbHVlXG4gKiovXG4vL31cblxuLyoqXG4gKlxuICogU2V0cyB1cCBhIG5ldyBgRWRpdFNlc3Npb25gIGFuZCBhc3NvY2lhdGVzIGl0IHdpdGggdGhlIGdpdmVuIGBEb2N1bWVudGAgYW5kIGBUZXh0TW9kZWAuXG4gKiBAcGFyYW0ge0RvY3VtZW50IHwgU3RyaW5nfSB0ZXh0IFtJZiBgdGV4dGAgaXMgYSBgRG9jdW1lbnRgLCBpdCBhc3NvY2lhdGVzIHRoZSBgRWRpdFNlc3Npb25gIHdpdGggaXQuIE90aGVyd2lzZSwgYSBuZXcgYERvY3VtZW50YCBpcyBjcmVhdGVkLCB3aXRoIHRoZSBpbml0aWFsIHRleHRdezogI3RleHRQYXJhbX1cbiAqIEBwYXJhbSB7VGV4dE1vZGV9IG1vZGUgW1RoZSBpbml0YWwgbGFuZ3VhZ2UgbW9kZSB0byB1c2UgZm9yIHRoZSBkb2N1bWVudF17OiAjbW9kZVBhcmFtfVxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICoqL1xuXG5leHBvcnQgY2xhc3MgRWRpdFNlc3Npb24gZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyB7XG4gIHB1YmxpYyAkYnJlYWtwb2ludHM6IHN0cmluZ1tdID0gW107XG4gIHB1YmxpYyAkZGVjb3JhdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIHByaXZhdGUgJGZyb250TWFya2VycyA9IHt9O1xuICBwdWJsaWMgJGJhY2tNYXJrZXJzID0ge307XG4gIHByaXZhdGUgJG1hcmtlcklkID0gMTtcbiAgcHJpdmF0ZSAkdW5kb1NlbGVjdCA9IHRydWU7XG4gIHByaXZhdGUgJGRlbHRhcztcbiAgcHJpdmF0ZSAkZGVsdGFzRG9jO1xuICBwcml2YXRlICRkZWx0YXNGb2xkO1xuICBwcml2YXRlICRmcm9tVW5kbztcblxuICBwcml2YXRlICR1cGRhdGVGb2xkV2lkZ2V0czogKCkgPT4gYW55O1xuICBwcml2YXRlICRmb2xkRGF0YTogRm9sZExpbmVbXTtcbiAgcHVibGljIGZvbGRXaWRnZXRzOiBhbnlbXTtcbiAgcHVibGljIGdldEZvbGRXaWRnZXQ6IChyb3c6IG51bWJlcikgPT4gYW55O1xuICBwdWJsaWMgZ2V0Rm9sZFdpZGdldFJhbmdlOiAocm93OiBudW1iZXIsIGZvcmNlTXVsdGlsaW5lPzogYm9vbGVhbikgPT4gUmFuZ2U7XG5cbiAgcHVibGljIGRvYzogRG9jdW1lbnQ7XG4gIHByaXZhdGUgJGRlZmF1bHRVbmRvTWFuYWdlciA9IHsgdW5kbzogZnVuY3Rpb24oKSB7IH0sIHJlZG86IGZ1bmN0aW9uKCkgeyB9LCByZXNldDogZnVuY3Rpb24oKSB7IH0gfTtcbiAgcHJpdmF0ZSAkdW5kb01hbmFnZXI6IFVuZG9NYW5hZ2VyO1xuICBwcml2YXRlICRpbmZvcm1VbmRvTWFuYWdlcjogeyBjYW5jZWw6ICgpID0+IHZvaWQ7IHNjaGVkdWxlOiAoKSA9PiB2b2lkIH07XG4gIHB1YmxpYyBiZ1Rva2VuaXplcjogQmFja2dyb3VuZFRva2VuaXplcjtcbiAgcHVibGljICRtb2RpZmllZDtcbiAgcHVibGljIHNlbGVjdGlvbjogU2VsZWN0aW9uO1xuICBwcml2YXRlICRkb2NSb3dDYWNoZTogbnVtYmVyW107XG4gIHByaXZhdGUgJHdyYXBEYXRhOiBudW1iZXJbXVtdO1xuICBwcml2YXRlICRzY3JlZW5Sb3dDYWNoZTogbnVtYmVyW107XG4gIHByaXZhdGUgJHJvd0xlbmd0aENhY2hlO1xuICBwcml2YXRlICRvdmVyd3JpdGUgPSBmYWxzZTtcbiAgcHVibGljICRzZWFyY2hIaWdobGlnaHQ7XG4gIHByaXZhdGUgJGFubm90YXRpb25zO1xuICBwcml2YXRlICRhdXRvTmV3TGluZTtcbiAgcHJpdmF0ZSBnZXRPcHRpb247XG4gIHByaXZhdGUgc2V0T3B0aW9uO1xuICBwcml2YXRlICR1c2VXb3JrZXI7XG4gIC8qKlxuICAgKlxuICAgKi9cbiAgcHJpdmF0ZSAkbW9kZXM6IHsgW3BhdGg6IHN0cmluZ106IE1vZGUgfSA9IHt9O1xuICAvKipcbiAgICpcbiAgICovXG4gIHB1YmxpYyAkbW9kZTogTW9kZSA9IG51bGw7XG4gIHByaXZhdGUgJG1vZGVJZCA9IG51bGw7XG4gIHByaXZhdGUgJHdvcmtlcjtcbiAgcHJpdmF0ZSAkb3B0aW9ucztcbiAgcHVibGljIHRva2VuUmU6IFJlZ0V4cDtcbiAgcHVibGljIG5vblRva2VuUmU6IFJlZ0V4cDtcbiAgcHVibGljICRzY3JvbGxUb3AgPSAwO1xuICBwcml2YXRlICRzY3JvbGxMZWZ0ID0gMDtcbiAgLy8gV1JBUE1PREVcbiAgcHJpdmF0ZSAkd3JhcEFzQ29kZTtcbiAgcHJpdmF0ZSAkd3JhcExpbWl0ID0gODA7XG4gIHB1YmxpYyAkdXNlV3JhcE1vZGUgPSBmYWxzZTtcbiAgcHJpdmF0ZSAkd3JhcExpbWl0UmFuZ2UgPSB7XG4gICAgbWluOiBudWxsLFxuICAgIG1heDogbnVsbFxuICB9O1xuICBwdWJsaWMgJHVwZGF0aW5nO1xuICBwdWJsaWMgbGluZVdpZGdldHMgPSBudWxsO1xuICBwcml2YXRlICRvbkNoYW5nZSA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcbiAgcHJpdmF0ZSAkc3luY0luZm9ybVVuZG9NYW5hZ2VyOiAoKSA9PiB2b2lkO1xuICBwdWJsaWMgbWVyZ2VVbmRvRGVsdGFzOiBib29sZWFuO1xuICBwcml2YXRlICR1c2VTb2Z0VGFiczogYm9vbGVhbjtcbiAgcHJpdmF0ZSAkdGFiU2l6ZTogbnVtYmVyO1xuICBwcml2YXRlICR3cmFwTWV0aG9kO1xuICBwcml2YXRlIHNjcmVlbldpZHRoO1xuICBwcml2YXRlIGxpbmVXaWRnZXRzV2lkdGg7XG4gIHByaXZhdGUgbGluZVdpZGdldFdpZHRoO1xuICBwcml2YXRlICRnZXRXaWRnZXRTY3JlZW5MZW5ndGg7XG4gIC8vXG4gIHB1YmxpYyAkdGFnSGlnaGxpZ2h0O1xuICBwdWJsaWMgJGJyYWNrZXRIaWdobGlnaHQ6IG51bWJlcjsgICAvLyBhIG1hcmtlci5cbiAgcHVibGljICRoaWdobGlnaHRMaW5lTWFya2VyOyAgICAgICAgLy8gTm90IGEgbWFya2VyIVxuICAvKipcbiAgICogQSBudW1iZXIgaXMgYSBtYXJrZXIgaWRlbnRpZmllciwgbnVsbCBpbmRpY2F0ZXMgdGhhdCBubyBzdWNoIG1hcmtlciBleGlzdHMuIFxuICAgKi9cbiAgcHVibGljICRzZWxlY3Rpb25NYXJrZXI6IG51bWJlciA9IG51bGw7XG4gIHByaXZhdGUgJGJyYWNrZXRNYXRjaGVyID0gbmV3IEJyYWNrZXRNYXRjaCh0aGlzKTtcbiAgLyoqXG4gICAqIEBwYXJhbSBbdGV4dF0ge3N0cmluZ3xEb2N1bWVudH0gVGhlIGRvY3VtZW50IG9yIHN0cmluZyBvdmVyIHdoaWNoIHRoaXMgZWRpdCBzZXNzaW9uIHdvcmtzLlxuICAgKiBAcGFyYW0gW21vZGVdXG4gICAqL1xuICBjb25zdHJ1Y3Rvcih0ZXh0OiBhbnksIG1vZGU/KSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLiRmb2xkRGF0YS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHRoaXMuam9pbihcIlxcblwiKTtcbiAgICB9XG4gICAgdGhpcy5vbihcImNoYW5nZUZvbGRcIiwgdGhpcy5vbkNoYW5nZUZvbGQuYmluZCh0aGlzKSk7XG5cbiAgICAvLyBUaGUgZmlyc3QgYXJndW1lbnQgbWF5IGJlIGVpdGhlciBhIHN0cmluZyBvciBhIERvY3VtZW50LlxuICAgIC8vIEl0IG1pZ2h0IGV2ZW4gYmUgYSBzdHJpbmdbXS5cbiAgICAvLyBGSVhNRTogTWF5IGJlIGJldHRlciBmb3IgY29uc3RydWN0b3JzIHRvIG1ha2UgYSBjaG9pY2UuXG4gICAgLy8gQ29udmVuaWVuY2UgZnVuY3Rpb24gY291bGQgYmUgYWRkZWQuXG4gICAgaWYgKHR5cGVvZiB0ZXh0ICE9PSBcIm9iamVjdFwiIHx8ICF0ZXh0LmdldExpbmUpIHtcbiAgICAgIHRoaXMuc2V0RG9jdW1lbnQobmV3IERvY3VtZW50KHRleHQpKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aGlzLnNldERvY3VtZW50KHRleHQpXG4gICAgfVxuXG4gICAgdGhpcy5zZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHRoaXMpO1xuXG4gICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgIHRoaXMuc2V0TW9kZShtb2RlKTtcbiAgICBfc2lnbmFsKFwic2Vzc2lvblwiLCB0aGlzKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTZXRzIHRoZSBgRWRpdFNlc3Npb25gIHRvIHBvaW50IHRvIGEgbmV3IGBEb2N1bWVudGAuIElmIGEgYEJhY2tncm91bmRUb2tlbml6ZXJgIGV4aXN0cywgaXQgYWxzbyBwb2ludHMgdG8gYGRvY2AuXG4gICAqIEBtZXRob2Qgc2V0RG9jdW1lbnRcbiAgICogQHBhcmFtIGRvYyB7RG9jdW1lbnR9IFRoZSBuZXcgYERvY3VtZW50YCB0byB1c2UuXG4gICAqIEByZXR1cm4ge3ZvaWR9XG4gICAqL1xuICBwcml2YXRlIHNldERvY3VtZW50KGRvYzogRG9jdW1lbnQpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5kb2MpIHtcbiAgICAgIHRoaXMuZG9jLnJlbW92ZUxpc3RlbmVyKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcbiAgICB9XG5cbiAgICB0aGlzLmRvYyA9IGRvYztcbiAgICBkb2Mub24oXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuXG4gICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcbiAgICB9XG5cbiAgICB0aGlzLnJlc2V0Q2FjaGVzKCk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgYERvY3VtZW50YCBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uLlxuICAgKiBAbWV0aG9kIGdldERvY3VtZW50XG4gICAqIEByZXR1cm4ge0RvY3VtZW50fVxuICAgKi9cbiAgcHVibGljIGdldERvY3VtZW50KCk6IERvY3VtZW50IHtcbiAgICByZXR1cm4gdGhpcy5kb2M7XG4gIH1cblxuICAvKipcbiAgICogQG1ldGhvZCAkcmVzZXRSb3dDYWNoZVxuICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSByb3cgdG8gd29yayB3aXRoXG4gICAqIEByZXR1cm4ge3ZvaWR9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlICRyZXNldFJvd0NhY2hlKGRvY1JvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCFkb2NSb3cpIHtcbiAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlID0gW107XG4gICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZSA9IFtdO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgbCA9IHRoaXMuJGRvY1Jvd0NhY2hlLmxlbmd0aDtcbiAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgodGhpcy4kZG9jUm93Q2FjaGUsIGRvY1JvdykgKyAxO1xuICAgIGlmIChsID4gaSkge1xuICAgICAgdGhpcy4kZG9jUm93Q2FjaGUuc3BsaWNlKGksIGwpO1xuICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUuc3BsaWNlKGksIGwpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgJGdldFJvd0NhY2hlSW5kZXgoY2FjaGVBcnJheTogbnVtYmVyW10sIHZhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICB2YXIgbG93ID0gMDtcbiAgICB2YXIgaGkgPSBjYWNoZUFycmF5Lmxlbmd0aCAtIDE7XG5cbiAgICB3aGlsZSAobG93IDw9IGhpKSB7XG4gICAgICB2YXIgbWlkID0gKGxvdyArIGhpKSA+PiAxO1xuICAgICAgdmFyIGMgPSBjYWNoZUFycmF5W21pZF07XG5cbiAgICAgIGlmICh2YWwgPiBjKSB7XG4gICAgICAgIGxvdyA9IG1pZCArIDE7XG4gICAgICB9XG4gICAgICBlbHNlIGlmICh2YWwgPCBjKSB7XG4gICAgICAgIGhpID0gbWlkIC0gMTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICByZXR1cm4gbWlkO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBsb3cgLSAxO1xuICB9XG5cbiAgcHJpdmF0ZSByZXNldENhY2hlcygpIHtcbiAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgdGhpcy4kd3JhcERhdGEgPSBbXTtcbiAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQoMCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBvbkNoYW5nZUZvbGQoZSkge1xuICAgIHZhciBmb2xkID0gZS5kYXRhO1xuICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZm9sZC5zdGFydC5yb3cpO1xuICB9XG5cbiAgcHJpdmF0ZSBvbkNoYW5nZShlKSB7XG4gICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcblxuICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZGVsdGEucmFuZ2Uuc3RhcnQucm93KTtcblxuICAgIHZhciByZW1vdmVkRm9sZHMgPSB0aGlzLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZShlKTtcbiAgICBpZiAoIXRoaXMuJGZyb21VbmRvICYmIHRoaXMuJHVuZG9NYW5hZ2VyICYmICFkZWx0YS5pZ25vcmUpIHtcbiAgICAgIHRoaXMuJGRlbHRhc0RvYy5wdXNoKGRlbHRhKTtcbiAgICAgIGlmIChyZW1vdmVkRm9sZHMgJiYgcmVtb3ZlZEZvbGRzLmxlbmd0aCAhPSAwKSB7XG4gICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQucHVzaCh7XG4gICAgICAgICAgYWN0aW9uOiBcInJlbW92ZUZvbGRzXCIsXG4gICAgICAgICAgZm9sZHM6IHJlbW92ZWRGb2xkc1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuc2NoZWR1bGUoKTtcbiAgICB9XG5cbiAgICB0aGlzLmJnVG9rZW5pemVyLiR1cGRhdGVPbkNoYW5nZShkZWx0YSk7XG4gICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlXCIsIGUpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIHNlc3Npb24gdGV4dC5cbiAgICogQG1ldGhvZCBzZXRWYWx1ZVxuICAgKiBAcGFyYW0gdGV4dCB7c3RyaW5nfSBUaGUgbmV3IHRleHQgdG8gcGxhY2UuXG4gICAqIEByZXR1cm4ge3ZvaWR9XG4gICAqIEBwcml2YXRlXG4gICAqL1xuICBwcml2YXRlIHNldFZhbHVlKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMuZG9jLnNldFZhbHVlKHRleHQpO1xuICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbygwLCAwKTtcblxuICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuICAgIHRoaXMuc2V0VW5kb01hbmFnZXIodGhpcy4kdW5kb01hbmFnZXIpO1xuICAgIHRoaXMuZ2V0VW5kb01hbmFnZXIoKS5yZXNldCgpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCBbW0RvY3VtZW50IGBEb2N1bWVudGBdXSBhcyBhIHN0cmluZy5cbiAgKiBAbWV0aG9kIHRvU3RyaW5nXG4gICogQHJldHVybnMge3N0cmluZ31cbiAgKiBAYWxpYXMgRWRpdFNlc3Npb24uZ2V0VmFsdWVcbiAgKiovXG4gIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLmdldFZhbHVlKCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IFtbRG9jdW1lbnQgYERvY3VtZW50YF1dIGFzIGEgc3RyaW5nLlxuICAqIEBtZXRob2QgZ2V0VmFsdWVcbiAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi50b1N0cmluZ1xuICAqKi9cbiAgcHVibGljIGdldFZhbHVlKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmdldFZhbHVlKCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAqKi9cbiAgcHVibGljIGdldFNlbGVjdGlvbigpOiBTZWxlY3Rpb24ge1xuICAgIHJldHVybiB0aGlzLnNlbGVjdGlvbjtcbiAgfVxuXG4gIC8qKlxuICAgKiB7OkJhY2tncm91bmRUb2tlbml6ZXIuZ2V0U3RhdGV9XG4gICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzdGFydCBhdFxuICAgKlxuICAgKiBAcmVsYXRlZCBCYWNrZ3JvdW5kVG9rZW5pemVyLmdldFN0YXRlXG4gICAqKi9cbiAgcHVibGljIGdldFN0YXRlKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5iZ1Rva2VuaXplci5nZXRTdGF0ZShyb3cpO1xuICB9XG5cbiAgLyoqXG4gICAqIFN0YXJ0cyB0b2tlbml6aW5nIGF0IHRoZSByb3cgaW5kaWNhdGVkLiBSZXR1cm5zIGEgbGlzdCBvZiBvYmplY3RzIG9mIHRoZSB0b2tlbml6ZWQgcm93cy5cbiAgICogQG1ldGhvZCBnZXRUb2tlbnNcbiAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgKiovXG4gIHB1YmxpYyBnZXRUb2tlbnMocm93OiBudW1iZXIpOiB7IHN0YXJ0OiBudW1iZXI7IHR5cGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10ge1xuICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFRva2Vucyhyb3cpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBhbiBvYmplY3QgaW5kaWNhdGluZyB0aGUgdG9rZW4gYXQgdGhlIGN1cnJlbnQgcm93LiBUaGUgb2JqZWN0IGhhcyB0d28gcHJvcGVydGllczogYGluZGV4YCBhbmQgYHN0YXJ0YC5cbiAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgZ2V0VG9rZW5BdChyb3c6IG51bWJlciwgY29sdW1uPzogbnVtYmVyKSB7XG4gICAgdmFyIHRva2VuczogeyB2YWx1ZTogc3RyaW5nIH1bXSA9IHRoaXMuYmdUb2tlbml6ZXIuZ2V0VG9rZW5zKHJvdyk7XG4gICAgdmFyIHRva2VuOiB7IGluZGV4PzogbnVtYmVyOyBzdGFydD86IG51bWJlcjsgdmFsdWU6IHN0cmluZyB9O1xuICAgIHZhciBjID0gMDtcbiAgICBpZiAoY29sdW1uID09IG51bGwpIHtcbiAgICAgIGkgPSB0b2tlbnMubGVuZ3RoIC0gMTtcbiAgICAgIGMgPSB0aGlzLmdldExpbmUocm93KS5sZW5ndGg7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYyArPSB0b2tlbnNbaV0udmFsdWUubGVuZ3RoO1xuICAgICAgICBpZiAoYyA+PSBjb2x1bW4pXG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHRva2VuID0gdG9rZW5zW2ldO1xuICAgIGlmICghdG9rZW4pXG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB0b2tlbi5pbmRleCA9IGk7XG4gICAgdG9rZW4uc3RhcnQgPSBjIC0gdG9rZW4udmFsdWUubGVuZ3RoO1xuICAgIHJldHVybiB0b2tlbjtcbiAgfVxuXG4gIC8qKlxuICAqIFNldHMgdGhlIHVuZG8gbWFuYWdlci5cbiAgKiBAcGFyYW0ge1VuZG9NYW5hZ2VyfSB1bmRvTWFuYWdlciBUaGUgbmV3IHVuZG8gbWFuYWdlclxuICAqKi9cbiAgcHVibGljIHNldFVuZG9NYW5hZ2VyKHVuZG9NYW5hZ2VyOiBVbmRvTWFuYWdlcik6IHZvaWQge1xuICAgIHRoaXMuJHVuZG9NYW5hZ2VyID0gdW5kb01hbmFnZXI7XG4gICAgdGhpcy4kZGVsdGFzID0gW107XG4gICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuXG4gICAgaWYgKHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyKVxuICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICBpZiAodW5kb01hbmFnZXIpIHtcbiAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHNlbGYuJGluZm9ybVVuZG9NYW5hZ2VyLmNhbmNlbCgpO1xuXG4gICAgICAgIGlmIChzZWxmLiRkZWx0YXNGb2xkLmxlbmd0aCkge1xuICAgICAgICAgIHNlbGYuJGRlbHRhcy5wdXNoKHtcbiAgICAgICAgICAgIGdyb3VwOiBcImZvbGRcIixcbiAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRm9sZFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHNlbGYuJGRlbHRhc0ZvbGQgPSBbXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChzZWxmLiRkZWx0YXNEb2MubGVuZ3RoKSB7XG4gICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgZ3JvdXA6IFwiZG9jXCIsXG4gICAgICAgICAgICBkZWx0YXM6IHNlbGYuJGRlbHRhc0RvY1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHNlbGYuJGRlbHRhc0RvYyA9IFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNlbGYuJGRlbHRhcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgdW5kb01hbmFnZXIuZXhlY3V0ZSh7XG4gICAgICAgICAgICBhY3Rpb246IFwiYWNldXBkYXRlXCIsXG4gICAgICAgICAgICBhcmdzOiBbc2VsZi4kZGVsdGFzLCBzZWxmXSxcbiAgICAgICAgICAgIG1lcmdlOiBzZWxmLm1lcmdlVW5kb0RlbHRhc1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHNlbGYubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgIHNlbGYuJGRlbHRhcyA9IFtdO1xuICAgICAgfTtcbiAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyID0gZGVsYXllZENhbGwodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIGEgbmV3IGdyb3VwIGluIHVuZG8gaGlzdG9yeVxuICAgKiovXG4gIHByaXZhdGUgbWFya1VuZG9Hcm91cCgpIHtcbiAgICBpZiAodGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKVxuICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHVuZG8gbWFuYWdlci5cbiAgKiovXG4gIHB1YmxpYyBnZXRVbmRvTWFuYWdlcigpIHtcbiAgICByZXR1cm4gdGhpcy4kdW5kb01hbmFnZXIgfHwgdGhpcy4kZGVmYXVsdFVuZG9NYW5hZ2VyO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCB2YWx1ZSBmb3IgdGFicy4gSWYgdGhlIHVzZXIgaXMgdXNpbmcgc29mdCB0YWJzLCB0aGlzIHdpbGwgYmUgYSBzZXJpZXMgb2Ygc3BhY2VzIChkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSBgZ2V0VGFiU2l6ZSgpYF1dKTsgb3RoZXJ3aXNlIGl0J3Mgc2ltcGx5IGAnXFx0J2AuXG4gICoqL1xuICBwdWJsaWMgZ2V0VGFiU3RyaW5nKCkge1xuICAgIGlmICh0aGlzLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgIHJldHVybiBzdHJpbmdSZXBlYXQoXCIgXCIsIHRoaXMuZ2V0VGFiU2l6ZSgpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIFwiXFx0XCI7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gIC8qKlxuICAqIFBhc3MgYHRydWVgIHRvIGVuYWJsZSB0aGUgdXNlIG9mIHNvZnQgdGFicy4gU29mdCB0YWJzIG1lYW5zIHlvdSdyZSB1c2luZyBzcGFjZXMgaW5zdGVhZCBvZiB0aGUgdGFiIGNoYXJhY3RlciAoYCdcXHQnYCkuXG4gICogQHBhcmFtIHtCb29sZWFufSB1c2VTb2Z0VGFicyBWYWx1ZSBpbmRpY2F0aW5nIHdoZXRoZXIgb3Igbm90IHRvIHVzZSBzb2Z0IHRhYnNcbiAgKiovXG4gIHByaXZhdGUgc2V0VXNlU29mdFRhYnModmFsKSB7XG4gICAgdGhpcy5zZXRPcHRpb24oXCJ1c2VTb2Z0VGFic1wiLCB2YWwpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBgdHJ1ZWAgaWYgc29mdCB0YWJzIGFyZSBiZWluZyB1c2VkLCBgZmFsc2VgIG90aGVyd2lzZS5cbiAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgKiovXG4gIHB1YmxpYyBnZXRVc2VTb2Z0VGFicygpIHtcbiAgICAvLyB0b2RvIG1pZ2h0IG5lZWQgbW9yZSBnZW5lcmFsIHdheSBmb3IgY2hhbmdpbmcgc2V0dGluZ3MgZnJvbSBtb2RlLCBidXQgdGhpcyBpcyBvayBmb3Igbm93XG4gICAgcmV0dXJuIHRoaXMuJHVzZVNvZnRUYWJzICYmICF0aGlzLiRtb2RlLiRpbmRlbnRXaXRoVGFicztcbiAgfVxuXG4gIC8qKlxuICAqIFNldCB0aGUgbnVtYmVyIG9mIHNwYWNlcyB0aGF0IGRlZmluZSBhIHNvZnQgdGFiLlxuICAqIEZvciBleGFtcGxlLCBwYXNzaW5nIGluIGA0YCB0cmFuc2Zvcm1zIHRoZSBzb2Z0IHRhYnMgdG8gYmUgZXF1aXZhbGVudCB0byBmb3VyIHNwYWNlcy5cbiAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGBjaGFuZ2VUYWJTaXplYCBldmVudC5cbiAgKiBAcGFyYW0ge051bWJlcn0gdGFiU2l6ZSBUaGUgbmV3IHRhYiBzaXplXG4gICoqL1xuICBwcml2YXRlIHNldFRhYlNpemUodGFiU2l6ZTogbnVtYmVyKSB7XG4gICAgdGhpcy5zZXRPcHRpb24oXCJ0YWJTaXplXCIsIHRhYlNpemUpO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCB0YWIgc2l6ZS5cbiAgKiovXG4gIHB1YmxpYyBnZXRUYWJTaXplKCkge1xuICAgIHJldHVybiB0aGlzLiR0YWJTaXplO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIGNoYXJhY3RlciBhdCB0aGUgcG9zaXRpb24gaXMgYSBzb2Z0IHRhYi5cbiAgKiBAcGFyYW0ge09iamVjdH0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIHRvIGNoZWNrXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIGlzVGFiU3RvcChwb3NpdGlvbjogeyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgcmV0dXJuIHRoaXMuJHVzZVNvZnRUYWJzICYmIChwb3NpdGlvbi5jb2x1bW4gJSB0aGlzLiR0YWJTaXplID09PSAwKTtcbiAgfVxuXG4gIC8qKlxuICAqIFBhc3MgaW4gYHRydWVgIHRvIGVuYWJsZSBvdmVyd3JpdGVzIGluIHlvdXIgc2Vzc2lvbiwgb3IgYGZhbHNlYCB0byBkaXNhYmxlLlxuICAqXG4gICogSWYgb3ZlcndyaXRlcyBpcyBlbmFibGVkLCBhbnkgdGV4dCB5b3UgZW50ZXIgd2lsbCB0eXBlIG92ZXIgYW55IHRleHQgYWZ0ZXIgaXQuIElmIHRoZSB2YWx1ZSBvZiBgb3ZlcndyaXRlYCBjaGFuZ2VzLCB0aGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgY2hhbmdlT3ZlcndyaXRlYCBldmVudC5cbiAgKlxuICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGhlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgc2V0T3ZlcndyaXRlKG92ZXJ3cml0ZTogYm9vbGVhbikge1xuICAgIHRoaXMuc2V0T3B0aW9uKFwib3ZlcndyaXRlXCIsIG92ZXJ3cml0ZSk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgKiovXG4gIHB1YmxpYyBnZXRPdmVyd3JpdGUoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuJG92ZXJ3cml0ZTtcbiAgfVxuXG4gIC8qKlxuICAqIFNldHMgdGhlIHZhbHVlIG9mIG92ZXJ3cml0ZSB0byB0aGUgb3Bwb3NpdGUgb2Ygd2hhdGV2ZXIgaXQgY3VycmVudGx5IGlzLlxuICAqKi9cbiAgcHVibGljIHRvZ2dsZU92ZXJ3cml0ZSgpOiB2b2lkIHtcbiAgICB0aGlzLnNldE92ZXJ3cml0ZSghdGhpcy4kb3ZlcndyaXRlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGRzIGBjbGFzc05hbWVgIHRvIHRoZSBgcm93YCwgdG8gYmUgdXNlZCBmb3IgQ1NTIHN0eWxpbmdzIGFuZCB3aGF0bm90LlxuICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgVGhlIGNsYXNzIHRvIGFkZFxuICAgKi9cbiAgcHVibGljIGFkZEd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLiRkZWNvcmF0aW9uc1tyb3ddKSB7XG4gICAgICB0aGlzLiRkZWNvcmF0aW9uc1tyb3ddID0gXCJcIjtcbiAgICB9XG4gICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSArPSBcIiBcIiArIGNsYXNzTmFtZTtcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGBjbGFzc05hbWVgIGZyb20gdGhlIGByb3dgLlxuICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgVGhlIGNsYXNzIHRvIGFkZFxuICAgKi9cbiAgcHVibGljIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9ICh0aGlzLiRkZWNvcmF0aW9uc1tyb3ddIHx8IFwiXCIpLnJlcGxhY2UoXCIgXCIgKyBjbGFzc05hbWUsIFwiXCIpO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBhbiBhcnJheSBvZiBudW1iZXJzLCBpbmRpY2F0aW5nIHdoaWNoIHJvd3MgaGF2ZSBicmVha3BvaW50cy5cbiAgKiBAcmV0dXJucyB7W051bWJlcl19XG4gICoqL1xuICBwcml2YXRlIGdldEJyZWFrcG9pbnRzKCkge1xuICAgIHJldHVybiB0aGlzLiRicmVha3BvaW50cztcbiAgfVxuXG4gIC8qKlxuICAqIFNldHMgYSBicmVha3BvaW50IG9uIGV2ZXJ5IHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgKiBAcGFyYW0ge0FycmF5fSByb3dzIEFuIGFycmF5IG9mIHJvdyBpbmRpY2VzXG4gICpcbiAgKlxuICAqXG4gICoqL1xuICBwcml2YXRlIHNldEJyZWFrcG9pbnRzKHJvd3M6IG51bWJlcltdKTogdm9pZCB7XG4gICAgdGhpcy4kYnJlYWtwb2ludHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvd3MubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd3NbaV1dID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgIH1cbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAqIFJlbW92ZXMgYWxsIGJyZWFrcG9pbnRzIG9uIHRoZSByb3dzLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgKiovXG4gIHByaXZhdGUgY2xlYXJCcmVha3BvaW50cygpIHtcbiAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogU2V0cyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBDbGFzcyBvZiB0aGUgYnJlYWtwb2ludFxuICAqXG4gICpcbiAgKiovXG4gIHByaXZhdGUgc2V0QnJlYWtwb2ludChyb3csIGNsYXNzTmFtZSkge1xuICAgIGlmIChjbGFzc05hbWUgPT09IHVuZGVmaW5lZClcbiAgICAgIGNsYXNzTmFtZSA9IFwiYWNlX2JyZWFrcG9pbnRcIjtcbiAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93XSA9IGNsYXNzTmFtZTtcbiAgICBlbHNlXG4gICAgICBkZWxldGUgdGhpcy4kYnJlYWtwb2ludHNbcm93XTtcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAqIFJlbW92ZXMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBBIHJvdyBpbmRleFxuICAqXG4gICpcbiAgKiovXG4gIHByaXZhdGUgY2xlYXJCcmVha3BvaW50KHJvdykge1xuICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICB9XG5cbiAgLyoqXG4gICogQWRkcyBhIG5ldyBtYXJrZXIgdG8gdGhlIGdpdmVuIGBSYW5nZWAuIElmIGBpbkZyb250YCBpcyBgdHJ1ZWAsIGEgZnJvbnQgbWFya2VyIGlzIGRlZmluZWQsIGFuZCB0aGUgYCdjaGFuZ2VGcm9udE1hcmtlcidgIGV2ZW50IGZpcmVzOyBvdGhlcndpc2UsIHRoZSBgJ2NoYW5nZUJhY2tNYXJrZXInYCBldmVudCBmaXJlcy5cbiAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBEZWZpbmUgdGhlIHJhbmdlIG9mIHRoZSBtYXJrZXJcbiAgKiBAcGFyYW0ge1N0cmluZ30gY2xhenogU2V0IHRoZSBDU1MgY2xhc3MgZm9yIHRoZSBtYXJrZXJcbiAgKiBAcGFyYW0ge0Z1bmN0aW9uIHwgU3RyaW5nfSB0eXBlIElkZW50aWZ5IHRoZSB0eXBlIG9mIHRoZSBtYXJrZXJcbiAgKiBAcGFyYW0ge0Jvb2xlYW59IGluRnJvbnQgU2V0IHRvIGB0cnVlYCB0byBlc3RhYmxpc2ggYSBmcm9udCBtYXJrZXJcbiAgKlxuICAqXG4gICogQHJldHVybiB7TnVtYmVyfSBUaGUgbmV3IG1hcmtlciBpZFxuICAqKi9cbiAgcHVibGljIGFkZE1hcmtlcihyYW5nZTogUmFuZ2UsIGNsYXp6OiBzdHJpbmcsIHR5cGUsIGluRnJvbnQ/OiBib29sZWFuKTogbnVtYmVyIHtcbiAgICB2YXIgaWQgPSB0aGlzLiRtYXJrZXJJZCsrO1xuXG4gICAgdmFyIG1hcmtlciA9IHtcbiAgICAgIHJhbmdlOiByYW5nZSxcbiAgICAgIHR5cGU6IHR5cGUgfHwgXCJsaW5lXCIsXG4gICAgICByZW5kZXJlcjogdHlwZW9mIHR5cGUgPT0gXCJmdW5jdGlvblwiID8gdHlwZSA6IG51bGwsXG4gICAgICBjbGF6ejogY2xhenosXG4gICAgICBpbkZyb250OiAhIWluRnJvbnQsXG4gICAgICBpZDogaWRcbiAgICB9O1xuXG4gICAgaWYgKGluRnJvbnQpIHtcbiAgICAgIHRoaXMuJGZyb250TWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VGcm9udE1hcmtlclwiKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aGlzLiRiYWNrTWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCYWNrTWFya2VyXCIpO1xuICAgIH1cblxuICAgIHJldHVybiBpZDtcbiAgfVxuXG4gIC8qKlxuICAgKiBBZGRzIGEgZHluYW1pYyBtYXJrZXIgdG8gdGhlIHNlc3Npb24uXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBtYXJrZXIgb2JqZWN0IHdpdGggdXBkYXRlIG1ldGhvZFxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGluRnJvbnQgU2V0IHRvIGB0cnVlYCB0byBlc3RhYmxpc2ggYSBmcm9udCBtYXJrZXJcbiAgICpcbiAgICpcbiAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgYWRkZWQgbWFya2VyXG4gICAqKi9cbiAgcHJpdmF0ZSBhZGREeW5hbWljTWFya2VyKG1hcmtlciwgaW5Gcm9udD8pIHtcbiAgICBpZiAoIW1hcmtlci51cGRhdGUpXG4gICAgICByZXR1cm47XG4gICAgdmFyIGlkID0gdGhpcy4kbWFya2VySWQrKztcbiAgICBtYXJrZXIuaWQgPSBpZDtcbiAgICBtYXJrZXIuaW5Gcm9udCA9ICEhaW5Gcm9udDtcblxuICAgIGlmIChpbkZyb250KSB7XG4gICAgICB0aGlzLiRmcm9udE1hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlRnJvbnRNYXJrZXJcIik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuJGJhY2tNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1hcmtlcjtcbiAgfVxuXG4gIC8qKlxuICAqIFJlbW92ZXMgdGhlIG1hcmtlciB3aXRoIHRoZSBzcGVjaWZpZWQgSUQuIElmIHRoaXMgbWFya2VyIHdhcyBpbiBmcm9udCwgdGhlIGAnY2hhbmdlRnJvbnRNYXJrZXInYCBldmVudCBpcyBlbWl0dGVkLiBJZiB0aGUgbWFya2VyIHdhcyBpbiB0aGUgYmFjaywgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICogQHBhcmFtIHtOdW1iZXJ9IG1hcmtlcklkIEEgbnVtYmVyIHJlcHJlc2VudGluZyBhIG1hcmtlclxuICAqXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIHJlbW92ZU1hcmtlcihtYXJrZXJJZCkge1xuICAgIHZhciBtYXJrZXIgPSB0aGlzLiRmcm9udE1hcmtlcnNbbWFya2VySWRdIHx8IHRoaXMuJGJhY2tNYXJrZXJzW21hcmtlcklkXTtcbiAgICBpZiAoIW1hcmtlcilcbiAgICAgIHJldHVybjtcblxuICAgIHZhciBtYXJrZXJzID0gbWFya2VyLmluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICBpZiAobWFya2VyKSB7XG4gICAgICBkZWxldGUgKG1hcmtlcnNbbWFya2VySWRdKTtcbiAgICAgIHRoaXMuX3NpZ25hbChtYXJrZXIuaW5Gcm9udCA/IFwiY2hhbmdlRnJvbnRNYXJrZXJcIiA6IFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGFuIGFycmF5IGNvbnRhaW5pbmcgdGhlIElEcyBvZiBhbGwgdGhlIG1hcmtlcnMsIGVpdGhlciBmcm9udCBvciBiYWNrLlxuICAqIEBwYXJhbSB7Ym9vbGVhbn0gaW5Gcm9udCBJZiBgdHJ1ZWAsIGluZGljYXRlcyB5b3Ugb25seSB3YW50IGZyb250IG1hcmtlcnM7IGBmYWxzZWAgaW5kaWNhdGVzIG9ubHkgYmFjayBtYXJrZXJzXG4gICpcbiAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICoqL1xuICBwdWJsaWMgZ2V0TWFya2VycyhpbkZyb250OiBib29sZWFuKSB7XG4gICAgcmV0dXJuIGluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgfVxuXG4gIHB1YmxpYyBoaWdobGlnaHQocmUpIHtcbiAgICBpZiAoIXRoaXMuJHNlYXJjaEhpZ2hsaWdodCkge1xuICAgICAgdmFyIGhpZ2hsaWdodCA9IG5ldyBTZWFyY2hIaWdobGlnaHQobnVsbCwgXCJhY2Vfc2VsZWN0ZWQtd29yZFwiLCBcInRleHRcIik7XG4gICAgICB0aGlzLiRzZWFyY2hIaWdobGlnaHQgPSB0aGlzLmFkZER5bmFtaWNNYXJrZXIoaGlnaGxpZ2h0KTtcbiAgICB9XG4gICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0LnNldFJlZ2V4cChyZSk7XG4gIH1cblxuICAvLyBleHBlcmltZW50YWxcbiAgcHJpdmF0ZSBoaWdobGlnaHRMaW5lcyhzdGFydFJvdywgZW5kUm93LCBjbGF6eiwgaW5Gcm9udCkge1xuICAgIGlmICh0eXBlb2YgZW5kUm93ICE9IFwibnVtYmVyXCIpIHtcbiAgICAgIGNsYXp6ID0gZW5kUm93O1xuICAgICAgZW5kUm93ID0gc3RhcnRSb3c7XG4gICAgfVxuICAgIGlmICghY2xhenopXG4gICAgICBjbGF6eiA9IFwiYWNlX3N0ZXBcIjtcblxuICAgIHZhciByYW5nZTogYW55ID0gbmV3IFJhbmdlKHN0YXJ0Um93LCAwLCBlbmRSb3csIEluZmluaXR5KTtcbiAgICByYW5nZS5pZCA9IHRoaXMuYWRkTWFya2VyKHJhbmdlLCBjbGF6eiwgXCJmdWxsTGluZVwiLCBpbkZyb250KTtcbiAgICByZXR1cm4gcmFuZ2U7XG4gIH1cblxuICAvKlxuICAgKiBFcnJvcjpcbiAgICogIHtcbiAgICogICAgcm93OiAxMixcbiAgICogICAgY29sdW1uOiAyLCAvL2NhbiBiZSB1bmRlZmluZWRcbiAgICogICAgdGV4dDogXCJNaXNzaW5nIGFyZ3VtZW50XCIsXG4gICAqICAgIHR5cGU6IFwiZXJyb3JcIiAvLyBvciBcIndhcm5pbmdcIiBvciBcImluZm9cIlxuICAgKiAgfVxuICAgKi9cbiAgLyoqXG4gICogU2V0cyBhbm5vdGF0aW9ucyBmb3IgdGhlIGBFZGl0U2Vzc2lvbmAuIFRoaXMgZnVuY3Rpb25zIGVtaXRzIHRoZSBgJ2NoYW5nZUFubm90YXRpb24nYCBldmVudC5cbiAgKiBAcGFyYW0ge0FycmF5fSBhbm5vdGF0aW9ucyBBIGxpc3Qgb2YgYW5ub3RhdGlvbnNcbiAgKlxuICAqKi9cbiAgcHVibGljIHNldEFubm90YXRpb25zKGFubm90YXRpb25zKSB7XG4gICAgdGhpcy4kYW5ub3RhdGlvbnMgPSBhbm5vdGF0aW9ucztcbiAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VBbm5vdGF0aW9uXCIsIHt9KTtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIGFubm90YXRpb25zIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgKiBAcmV0dXJucyB7QXJyYXl9XG4gICoqL1xuICBwdWJsaWMgZ2V0QW5ub3RhdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy4kYW5ub3RhdGlvbnMgfHwgW107XG4gIH1cblxuICAvKipcbiAgKiBDbGVhcnMgYWxsIHRoZSBhbm5vdGF0aW9ucyBmb3IgdGhpcyBzZXNzaW9uLiBUaGlzIGZ1bmN0aW9uIGFsc28gdHJpZ2dlcnMgdGhlIGAnY2hhbmdlQW5ub3RhdGlvbidgIGV2ZW50LlxuICAqKi9cbiAgcHJpdmF0ZSBjbGVhckFubm90YXRpb25zKCkge1xuICAgIHRoaXMuc2V0QW5ub3RhdGlvbnMoW10pO1xuICB9XG5cbiAgLyoqXG4gICogSWYgYHRleHRgIGNvbnRhaW5zIGVpdGhlciB0aGUgbmV3bGluZSAoYFxcbmApIG9yIGNhcnJpYWdlLXJldHVybiAoJ1xccicpIGNoYXJhY3RlcnMsIGAkYXV0b05ld0xpbmVgIHN0b3JlcyB0aGF0IHZhbHVlLlxuICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgYmxvY2sgb2YgdGV4dFxuICAqXG4gICoqL1xuICBwcml2YXRlICRkZXRlY3ROZXdMaW5lKHRleHQ6IHN0cmluZykge1xuICAgIHZhciBtYXRjaCA9IHRleHQubWF0Y2goL14uKj8oXFxyP1xcbikvbSk7XG4gICAgaWYgKG1hdGNoKSB7XG4gICAgICB0aGlzLiRhdXRvTmV3TGluZSA9IG1hdGNoWzFdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gXCJcXG5cIjtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgKiBHaXZlbiBhIHN0YXJ0aW5nIHJvdyBhbmQgY29sdW1uLCB0aGlzIG1ldGhvZCByZXR1cm5zIHRoZSBgUmFuZ2VgIG9mIHRoZSBmaXJzdCB3b3JkIGJvdW5kYXJ5IGl0IGZpbmRzLlxuICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byBzdGFydCBhdFxuICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBzdGFydCBhdFxuICAqXG4gICogQHJldHVybnMge1JhbmdlfVxuICAqKi9cbiAgcHVibGljIGdldFdvcmRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcbiAgICB2YXIgbGluZTogc3RyaW5nID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICB2YXIgaW5Ub2tlbiA9IGZhbHNlO1xuICAgIGlmIChjb2x1bW4gPiAwKVxuICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uIC0gMSkubWF0Y2godGhpcy50b2tlblJlKTtcblxuICAgIGlmICghaW5Ub2tlbilcbiAgICAgIGluVG9rZW4gPSAhIWxpbmUuY2hhckF0KGNvbHVtbikubWF0Y2godGhpcy50b2tlblJlKTtcblxuICAgIGlmIChpblRva2VuKVxuICAgICAgdmFyIHJlID0gdGhpcy50b2tlblJlO1xuICAgIGVsc2UgaWYgKC9eXFxzKyQvLnRlc3QobGluZS5zbGljZShjb2x1bW4gLSAxLCBjb2x1bW4gKyAxKSkpXG4gICAgICB2YXIgcmUgPSAvXFxzLztcbiAgICBlbHNlXG4gICAgICB2YXIgcmUgPSB0aGlzLm5vblRva2VuUmU7XG5cbiAgICB2YXIgc3RhcnQgPSBjb2x1bW47XG4gICAgaWYgKHN0YXJ0ID4gMCkge1xuICAgICAgZG8ge1xuICAgICAgICBzdGFydC0tO1xuICAgICAgfVxuICAgICAgd2hpbGUgKHN0YXJ0ID49IDAgJiYgbGluZS5jaGFyQXQoc3RhcnQpLm1hdGNoKHJlKSk7XG4gICAgICBzdGFydCsrO1xuICAgIH1cblxuICAgIHZhciBlbmQgPSBjb2x1bW47XG4gICAgd2hpbGUgKGVuZCA8IGxpbmUubGVuZ3RoICYmIGxpbmUuY2hhckF0KGVuZCkubWF0Y2gocmUpKSB7XG4gICAgICBlbmQrKztcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFJhbmdlKHJvdywgc3RhcnQsIHJvdywgZW5kKTtcbiAgfVxuXG4gIC8qKlxuICAqIEdldHMgdGhlIHJhbmdlIG9mIGEgd29yZCwgaW5jbHVkaW5nIGl0cyByaWdodCB3aGl0ZXNwYWNlLlxuICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXIgdG8gc3RhcnQgZnJvbVxuICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiBudW1iZXIgdG8gc3RhcnQgZnJvbVxuICAqXG4gICogQHJldHVybiB7UmFuZ2V9XG4gICoqL1xuICBwdWJsaWMgZ2V0QVdvcmRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcbiAgICB2YXIgd29yZFJhbmdlID0gdGhpcy5nZXRXb3JkUmFuZ2Uocm93LCBjb2x1bW4pO1xuICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHdvcmRSYW5nZS5lbmQucm93KTtcblxuICAgIHdoaWxlIChsaW5lLmNoYXJBdCh3b3JkUmFuZ2UuZW5kLmNvbHVtbikubWF0Y2goL1sgXFx0XS8pKSB7XG4gICAgICB3b3JkUmFuZ2UuZW5kLmNvbHVtbiArPSAxO1xuICAgIH1cblxuICAgIHJldHVybiB3b3JkUmFuZ2U7XG4gIH1cblxuICAvKipcbiAgKiB7OkRvY3VtZW50LnNldE5ld0xpbmVNb2RlLmRlc2N9XG4gICogQHBhcmFtIHtTdHJpbmd9IG5ld0xpbmVNb2RlIHs6RG9jdW1lbnQuc2V0TmV3TGluZU1vZGUucGFyYW19XG4gICpcbiAgKlxuICAqIEByZWxhdGVkIERvY3VtZW50LnNldE5ld0xpbmVNb2RlXG4gICoqL1xuICBwcml2YXRlIHNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlOiBzdHJpbmcpIHtcbiAgICB0aGlzLmRvYy5zZXROZXdMaW5lTW9kZShuZXdMaW5lTW9kZSk7XG4gIH1cblxuICAvKipcbiAgKlxuICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbmV3IGxpbmUgbW9kZS5cbiAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAqIEByZWxhdGVkIERvY3VtZW50LmdldE5ld0xpbmVNb2RlXG4gICoqL1xuICBwcml2YXRlIGdldE5ld0xpbmVNb2RlKCkge1xuICAgIHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpO1xuICB9XG5cbiAgLyoqXG4gICogSWRlbnRpZmllcyBpZiB5b3Ugd2FudCB0byB1c2UgYSB3b3JrZXIgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlV29ya2VyIFNldCB0byBgdHJ1ZWAgdG8gdXNlIGEgd29ya2VyXG4gICpcbiAgKiovXG4gIHByaXZhdGUgc2V0VXNlV29ya2VyKHVzZVdvcmtlcikgeyB0aGlzLnNldE9wdGlvbihcInVzZVdvcmtlclwiLCB1c2VXb3JrZXIpOyB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBgdHJ1ZWAgaWYgd29ya2VycyBhcmUgYmVpbmcgdXNlZC5cbiAgKiovXG4gIHByaXZhdGUgZ2V0VXNlV29ya2VyKCkgeyByZXR1cm4gdGhpcy4kdXNlV29ya2VyOyB9XG5cbiAgLyoqXG4gICogUmVsb2FkcyBhbGwgdGhlIHRva2VucyBvbiB0aGUgY3VycmVudCBzZXNzaW9uLiBUaGlzIGZ1bmN0aW9uIGNhbGxzIFtbQmFja2dyb3VuZFRva2VuaXplci5zdGFydCBgQmFja2dyb3VuZFRva2VuaXplci5zdGFydCAoKWBdXSB0byBhbGwgdGhlIHJvd3M7IGl0IGFsc28gZW1pdHMgdGhlIGAndG9rZW5pemVyVXBkYXRlJ2AgZXZlbnQuXG4gICoqL1xuICBwcml2YXRlIG9uUmVsb2FkVG9rZW5pemVyKGUpIHtcbiAgICB2YXIgcm93cyA9IGUuZGF0YTtcbiAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KHJvd3MuZmlyc3QpO1xuICAgIHRoaXMuX3NpZ25hbChcInRva2VuaXplclVwZGF0ZVwiLCBlKTtcbiAgfVxuXG5cbiAgLyoqXG4gICogU2V0cyBhIG5ldyB0ZXh0IG1vZGUgZm9yIHRoZSBgRWRpdFNlc3Npb25gLiBUaGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZU1vZGUnYCBldmVudC4gSWYgYSBbW0JhY2tncm91bmRUb2tlbml6ZXIgYEJhY2tncm91bmRUb2tlbml6ZXJgXV0gaXMgc2V0LCB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudCBpcyBhbHNvIGVtaXR0ZWQuXG4gICogQHBhcmFtIHtUZXh0TW9kZX0gbW9kZSBTZXQgYSBuZXcgdGV4dCBtb2RlXG4gICogQHBhcmFtIHtjYn0gb3B0aW9uYWwgY2FsbGJhY2tcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSBzZXRNb2RlKG1vZGUsIGNiPykge1xuICAgIGlmIChtb2RlICYmIHR5cGVvZiBtb2RlID09PSBcIm9iamVjdFwiKSB7XG4gICAgICBpZiAobW9kZS5nZXRUb2tlbml6ZXIpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG9uQ2hhbmdlTW9kZShtb2RlKTtcbiAgICAgIH1cbiAgICAgIHZhciBvcHRpb25zID0gbW9kZTtcbiAgICAgIHZhciBwYXRoID0gb3B0aW9ucy5wYXRoO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHBhdGggPSBtb2RlIHx8IFwiYWNlL21vZGUvdGV4dFwiO1xuICAgIH1cblxuICAgIC8vIHRoaXMgaXMgbmVlZGVkIGlmIGFjZSBpc24ndCBvbiByZXF1aXJlIHBhdGggKGUuZyB0ZXN0cyBpbiBub2RlKVxuICAgIGlmICghdGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdKSB7XG4gICAgICB0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0gPSBuZXcgTW9kZSgpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLiRtb2Rlc1twYXRoXSAmJiAhb3B0aW9ucykge1xuICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW3BhdGhdKTtcbiAgICAgIGNiICYmIGNiKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIGxvYWQgb24gZGVtYW5kXG4gICAgdGhpcy4kbW9kZUlkID0gcGF0aDtcbiAgICBsb2FkTW9kdWxlKFtcIm1vZGVcIiwgcGF0aF0sIGZ1bmN0aW9uKG06IGFueSkge1xuICAgICAgaWYgKHRoaXMuJG1vZGVJZCAhPT0gcGF0aClcbiAgICAgICAgcmV0dXJuIGNiICYmIGNiKCk7XG4gICAgICBpZiAodGhpcy4kbW9kZXNbcGF0aF0gJiYgIW9wdGlvbnMpXG4gICAgICAgIHJldHVybiB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbcGF0aF0pO1xuICAgICAgaWYgKG0gJiYgbS5Nb2RlKSB7XG4gICAgICAgIG0gPSBuZXcgbS5Nb2RlKG9wdGlvbnMpO1xuICAgICAgICBpZiAoIW9wdGlvbnMpIHtcbiAgICAgICAgICB0aGlzLiRtb2Rlc1twYXRoXSA9IG07XG4gICAgICAgICAgbS4kaWQgPSBwYXRoO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJG9uQ2hhbmdlTW9kZShtKTtcbiAgICAgICAgY2IgJiYgY2IoKTtcbiAgICAgIH1cbiAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgLy8gc2V0IG1vZGUgdG8gdGV4dCB1bnRpbCBsb2FkaW5nIGlzIGZpbmlzaGVkXG4gICAgaWYgKCF0aGlzLiRtb2RlKSB7XG4gICAgICB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdLCB0cnVlKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlICRvbkNoYW5nZU1vZGUobW9kZTogTW9kZSwgJGlzUGxhY2Vob2xkZXI/KSB7XG4gICAgaWYgKCEkaXNQbGFjZWhvbGRlcikge1xuICAgICAgdGhpcy4kbW9kZUlkID0gbW9kZS4kaWQ7XG4gICAgfVxuICAgIGlmICh0aGlzLiRtb2RlID09PSBtb2RlKVxuICAgICAgcmV0dXJuO1xuXG4gICAgdGhpcy4kbW9kZSA9IG1vZGU7XG5cbiAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG5cbiAgICBpZiAodGhpcy4kdXNlV29ya2VyKVxuICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcblxuICAgIHZhciB0b2tlbml6ZXIgPSBtb2RlLmdldFRva2VuaXplcigpO1xuXG4gICAgaWYgKHRva2VuaXplci5hZGRFdmVudExpc3RlbmVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHZhciBvblJlbG9hZFRva2VuaXplciA9IHRoaXMub25SZWxvYWRUb2tlbml6ZXIuYmluZCh0aGlzKTtcbiAgICAgIHRva2VuaXplci5hZGRFdmVudExpc3RlbmVyKFwidXBkYXRlXCIsIG9uUmVsb2FkVG9rZW5pemVyKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIgPSBuZXcgQmFja2dyb3VuZFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgdmFyIF9zZWxmID0gdGhpcztcbiAgICAgIHRoaXMuYmdUb2tlbml6ZXIuYWRkRXZlbnRMaXN0ZW5lcihcInVwZGF0ZVwiLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIF9zZWxmLl9zaWduYWwoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgZSk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB0aGlzLmJnVG9rZW5pemVyLnNldFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgIH1cblxuICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcblxuICAgIHRoaXMudG9rZW5SZSA9IG1vZGUudG9rZW5SZTtcbiAgICB0aGlzLm5vblRva2VuUmUgPSBtb2RlLm5vblRva2VuUmU7XG5cblxuICAgIGlmICghJGlzUGxhY2Vob2xkZXIpIHtcbiAgICAgIHRoaXMuJG9wdGlvbnMud3JhcE1ldGhvZC5zZXQuY2FsbCh0aGlzLCB0aGlzLiR3cmFwTWV0aG9kKTtcbiAgICAgIHRoaXMuJHNldEZvbGRpbmcobW9kZS5mb2xkaW5nUnVsZXMpO1xuICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VNb2RlXCIpO1xuICAgIH1cbiAgfVxuXG5cbiAgcHJpdmF0ZSAkc3RvcFdvcmtlcigpIHtcbiAgICBpZiAodGhpcy4kd29ya2VyKSB7XG4gICAgICB0aGlzLiR3b3JrZXIudGVybWluYXRlKCk7XG4gICAgfVxuXG4gICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgJHN0YXJ0V29ya2VyKCkge1xuICAgIHRyeSB7XG4gICAgICB0aGlzLiR3b3JrZXIgPSB0aGlzLiRtb2RlLmNyZWF0ZVdvcmtlcih0aGlzKTtcbiAgICB9XG4gICAgY2F0Y2ggKGUpIHtcbiAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgY3VycmVudCB0ZXh0IG1vZGUuXG4gICogQHJldHVybnMge1RleHRNb2RlfSBUaGUgY3VycmVudCB0ZXh0IG1vZGVcbiAgKiovXG4gIHB1YmxpYyBnZXRNb2RlKCkge1xuICAgIHJldHVybiB0aGlzLiRtb2RlO1xuICB9XG5cbiAgLyoqXG4gICogVGhpcyBmdW5jdGlvbiBzZXRzIHRoZSBzY3JvbGwgdG9wIHZhbHVlLiBJdCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVNjcm9sbFRvcCdgIGV2ZW50LlxuICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4gICpcbiAgKiovXG4gIHB1YmxpYyBzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcbiAgICAvLyBUT0RPOiBzaG91bGQgd2UgZm9yY2UgaW50ZWdlciBsaW5laGVpZ2h0IGluc3RlYWQ/IHNjcm9sbFRvcCA9IE1hdGgucm91bmQoc2Nyb2xsVG9wKTsgXG4gICAgaWYgKHRoaXMuJHNjcm9sbFRvcCA9PT0gc2Nyb2xsVG9wIHx8IGlzTmFOKHNjcm9sbFRvcCkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy4kc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbFRvcFwiLCBzY3JvbGxUb3ApO1xuICB9XG5cbiAgLyoqXG4gICogW1JldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0b3Agb2YgdGhlIGVkaXRvciBhbmQgdGhlIHRvcG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wfVxuICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICoqL1xuICBwdWJsaWMgZ2V0U2Nyb2xsVG9wKCkge1xuICAgIHJldHVybiB0aGlzLiRzY3JvbGxUb3A7XG4gIH1cblxuICAvKipcbiAgKiBbU2V0cyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGxlZnQgb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxlZnRtb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLnNldFNjcm9sbExlZnR9XG4gICoqL1xuICBwdWJsaWMgc2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpIHtcbiAgICAvLyBzY3JvbGxMZWZ0ID0gTWF0aC5yb3VuZChzY3JvbGxMZWZ0KTtcbiAgICBpZiAodGhpcy4kc2Nyb2xsTGVmdCA9PT0gc2Nyb2xsTGVmdCB8fCBpc05hTihzY3JvbGxMZWZ0KSlcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuJHNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbExlZnRcIiwgc2Nyb2xsTGVmdCk7XG4gIH1cblxuICAvKipcbiAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGxlZnQgb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxlZnRtb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLmdldFNjcm9sbExlZnR9XG4gICogQHJldHVybnMge051bWJlcn1cbiAgKiovXG4gIHB1YmxpYyBnZXRTY3JvbGxMZWZ0KCkge1xuICAgIHJldHVybiB0aGlzLiRzY3JvbGxMZWZ0O1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIHNjcmVlbi5cbiAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAqKi9cbiAgcHVibGljIGdldFNjcmVlbldpZHRoKCk6IG51bWJlciB7XG4gICAgdGhpcy4kY29tcHV0ZVdpZHRoKCk7XG4gICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICByZXR1cm4gTWF0aC5tYXgodGhpcy5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSwgdGhpcy5zY3JlZW5XaWR0aCk7XG4gICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGg7XG4gIH1cblxuICBwcml2YXRlIGdldExpbmVXaWRnZXRNYXhXaWR0aCgpIHtcbiAgICBpZiAodGhpcy5saW5lV2lkZ2V0c1dpZHRoICE9IG51bGwpIHJldHVybiB0aGlzLmxpbmVXaWRnZXRzV2lkdGg7XG4gICAgdmFyIHdpZHRoID0gMDtcbiAgICB0aGlzLmxpbmVXaWRnZXRzLmZvckVhY2goZnVuY3Rpb24odykge1xuICAgICAgaWYgKHcgJiYgdy5zY3JlZW5XaWR0aCA+IHdpZHRoKVxuICAgICAgICB3aWR0aCA9IHcuc2NyZWVuV2lkdGg7XG4gICAgfSk7XG4gICAgcmV0dXJuIHRoaXMubGluZVdpZGdldFdpZHRoID0gd2lkdGg7XG4gIH1cblxuICBwdWJsaWMgJGNvbXB1dGVXaWR0aChmb3JjZT8pIHtcbiAgICBpZiAodGhpcy4kbW9kaWZpZWQgfHwgZm9yY2UpIHtcbiAgICAgIHRoaXMuJG1vZGlmaWVkID0gZmFsc2U7XG5cbiAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGggPSB0aGlzLiR3cmFwTGltaXQ7XG5cbiAgICAgIHZhciBsaW5lcyA9IHRoaXMuZG9jLmdldEFsbExpbmVzKCk7XG4gICAgICB2YXIgY2FjaGUgPSB0aGlzLiRyb3dMZW5ndGhDYWNoZTtcbiAgICAgIHZhciBsb25nZXN0U2NyZWVuTGluZSA9IDA7XG4gICAgICB2YXIgZm9sZEluZGV4ID0gMDtcbiAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuJGZvbGREYXRhW2ZvbGRJbmRleF07XG4gICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgIHZhciBsZW4gPSBsaW5lcy5sZW5ndGg7XG5cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgaWYgKGkgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICBpID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgaWYgKGkgPj0gbGVuKVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgZm9sZExpbmUgPSB0aGlzLiRmb2xkRGF0YVtmb2xkSW5kZXgrK107XG4gICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjYWNoZVtpXSA9PSBudWxsKVxuICAgICAgICAgIGNhY2hlW2ldID0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZXNbaV0pWzBdO1xuXG4gICAgICAgIGlmIChjYWNoZVtpXSA+IGxvbmdlc3RTY3JlZW5MaW5lKVxuICAgICAgICAgIGxvbmdlc3RTY3JlZW5MaW5lID0gY2FjaGVbaV07XG4gICAgICB9XG4gICAgICB0aGlzLnNjcmVlbldpZHRoID0gbG9uZ2VzdFNjcmVlbkxpbmU7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYSB2ZXJiYXRpbSBjb3B5IG9mIHRoZSBnaXZlbiBsaW5lIGFzIGl0IGlzIGluIHRoZSBkb2N1bWVudFxuICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gcmV0cmlldmUgZnJvbVxuICAgKlxuICAqXG4gICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICpcbiAgKiovXG4gIHB1YmxpYyBnZXRMaW5lKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgYW4gYXJyYXkgb2Ygc3RyaW5ncyBvZiB0aGUgcm93cyBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC4gVGhpcyBmdW5jdGlvbiBpcyBpbmNsdXNpdmUgb2YgYGxhc3RSb3dgLlxuICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IGluZGV4IHRvIHJldHJpZXZlXG4gICAqXG4gICAqIEByZXR1cm5zIHtbU3RyaW5nXX1cbiAgICpcbiAgICoqL1xuICBwdWJsaWMgZ2V0TGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogc3RyaW5nW10ge1xuICAgIHJldHVybiB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIHJvd3MgaW4gdGhlIGRvY3VtZW50LlxuICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgKiovXG4gIHB1YmxpYyBnZXRMZW5ndGgoKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gIH1cblxuICAvKipcbiAgICogezpEb2N1bWVudC5nZXRUZXh0UmFuZ2UuZGVzY31cbiAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgVGhlIHJhbmdlIHRvIHdvcmsgd2l0aFxuICAgKlxuICAgKiBAcmV0dXJucyB7c3RyaW5nfVxuICAgKiovXG4gIHB1YmxpYyBnZXRUZXh0UmFuZ2UocmFuZ2U6IHsgc3RhcnQ6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07IGVuZDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB9KSB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLmdldFRleHRSYW5nZShyYW5nZSB8fCB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBJbnNlcnRzIGEgYmxvY2sgb2YgYHRleHRgIGFuZCB0aGUgaW5kaWNhdGVkIGBwb3NpdGlvbmAuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwb3NpdGlvbiBUaGUgcG9zaXRpb24ge3JvdywgY29sdW1ufSB0byBzdGFydCBpbnNlcnRpbmcgYXRcbiAgICogQHBhcmFtIHtTdHJpbmd9IHRleHQgQSBjaHVuayBvZiB0ZXh0IHRvIGluc2VydFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgbGluZSBvZiBgdGV4dGAuIElmIHRoZSBsZW5ndGggb2YgYHRleHRgIGlzIDAsIHRoaXMgZnVuY3Rpb24gc2ltcGx5IHJldHVybnMgYHBvc2l0aW9uYC5cbiAgICpcbiAgICpcbiAgICoqL1xuICBwdWJsaWMgaW5zZXJ0KHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0ZXh0OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5kb2MuaW5zZXJ0KHBvc2l0aW9uLCB0ZXh0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIHRoZSBgcmFuZ2VgIGZyb20gdGhlIGRvY3VtZW50LlxuICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHNwZWNpZmllZCBSYW5nZSB0byByZW1vdmVcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIG5ldyBgc3RhcnRgIHByb3BlcnR5IG9mIHRoZSByYW5nZSwgd2hpY2ggY29udGFpbnMgYHN0YXJ0Um93YCBhbmQgYHN0YXJ0Q29sdW1uYC4gSWYgYHJhbmdlYCBpcyBlbXB0eSwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIHRoZSB1bm1vZGlmaWVkIHZhbHVlIG9mIGByYW5nZS5zdGFydGAuXG4gICAqXG4gICAqIEByZWxhdGVkIERvY3VtZW50LnJlbW92ZVxuICAgKlxuICAgKiovXG4gIHB1YmxpYyByZW1vdmUocmFuZ2UpIHtcbiAgICByZXR1cm4gdGhpcy5kb2MucmVtb3ZlKHJhbmdlKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXZlcnRzIHByZXZpb3VzIGNoYW5nZXMgdG8geW91ciBkb2N1bWVudC5cbiAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICogQHBhcmFtIHtCb29sZWFufSBkb250U2VsZWN0IFtJZiBgdHJ1ZWAsIGRvZXNuJ3Qgc2VsZWN0IHRoZSByYW5nZSBvZiB3aGVyZSB0aGUgY2hhbmdlIG9jY3VyZWRdezogI2RvbnRTZWxlY3R9XG4gICAqXG4gICAqXG4gICAqIEByZXR1cm5zIHtSYW5nZX1cbiAgKiovXG4gIHB1YmxpYyB1bmRvQ2hhbmdlcyhkZWx0YXMsIGRvbnRTZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgcmV0dXJuO1xuXG4gICAgdGhpcy4kZnJvbVVuZG8gPSB0cnVlO1xuICAgIHZhciBsYXN0VW5kb1JhbmdlID0gbnVsbDtcbiAgICBmb3IgKHZhciBpID0gZGVsdGFzLmxlbmd0aCAtIDE7IGkgIT0gLTE7IGktLSkge1xuICAgICAgdmFyIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgaWYgKGRlbHRhLmdyb3VwID09IFwiZG9jXCIpIHtcbiAgICAgICAgdGhpcy5kb2MucmV2ZXJ0RGVsdGFzKGRlbHRhLmRlbHRhcyk7XG4gICAgICAgIGxhc3RVbmRvUmFuZ2UgPVxuICAgICAgICAgIHRoaXMuJGdldFVuZG9TZWxlY3Rpb24oZGVsdGEuZGVsdGFzLCB0cnVlLCBsYXN0VW5kb1JhbmdlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbHRhLmRlbHRhcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGREZWx0YSkge1xuICAgICAgICAgIHRoaXMuYWRkRm9sZHMoZm9sZERlbHRhLmZvbGRzKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuJGZyb21VbmRvID0gZmFsc2U7XG4gICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgIHJldHVybiBsYXN0VW5kb1JhbmdlO1xuICB9XG5cbiAgLyoqXG4gICAqIFJlLWltcGxlbWVudHMgYSBwcmV2aW91c2x5IHVuZG9uZSBjaGFuZ2UgdG8geW91ciBkb2N1bWVudC5cbiAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICogQHBhcmFtIHtCb29sZWFufSBkb250U2VsZWN0IHs6ZG9udFNlbGVjdH1cbiAgICpcbiAgKlxuICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICoqL1xuICBwdWJsaWMgcmVkb0NoYW5nZXMoZGVsdGFzLCBkb250U2VsZWN0PzogYm9vbGVhbikge1xuICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgIHJldHVybjtcblxuICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICB2YXIgbGFzdFVuZG9SYW5nZTogUmFuZ2UgPSBudWxsO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsdGFzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICB0aGlzLmRvYy5hcHBseURlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgZmFsc2UsIGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgIGxhc3RVbmRvUmFuZ2UgJiZcbiAgICAgIHRoaXMuJHVuZG9TZWxlY3QgJiZcbiAgICAgICFkb250U2VsZWN0ICYmXG4gICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShsYXN0VW5kb1JhbmdlKTtcbiAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBFbmFibGVzIG9yIGRpc2FibGVzIGhpZ2hsaWdodGluZyBvZiB0aGUgcmFuZ2Ugd2hlcmUgYW4gdW5kbyBvY2N1cmVkLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZSBJZiBgdHJ1ZWAsIHNlbGVjdHMgdGhlIHJhbmdlIG9mIHRoZSByZWluc2VydGVkIGNoYW5nZVxuICAqXG4gICoqL1xuICBwcml2YXRlIHNldFVuZG9TZWxlY3QoZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy4kdW5kb1NlbGVjdCA9IGVuYWJsZTtcbiAgfVxuXG4gIHByaXZhdGUgJGdldFVuZG9TZWxlY3Rpb24oZGVsdGFzOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfVtdLCBpc1VuZG86IGJvb2xlYW4sIGxhc3RVbmRvUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgIGZ1bmN0aW9uIGlzSW5zZXJ0KGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nIH0pIHtcbiAgICAgIHZhciBpbnNlcnQgPSBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0VGV4dFwiIHx8IGRlbHRhLmFjdGlvbiA9PT0gXCJpbnNlcnRMaW5lc1wiO1xuICAgICAgcmV0dXJuIGlzVW5kbyA/ICFpbnNlcnQgOiBpbnNlcnQ7XG4gICAgfVxuXG4gICAgdmFyIGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSA9IGRlbHRhc1swXTtcbiAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgIHZhciBwb2ludDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICB2YXIgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLmVuZCk7XG4gICAgICBsYXN0RGVsdGFJc0luc2VydCA9IHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2Uuc3RhcnQpO1xuICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICB9XG5cbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGRlbHRhcy5sZW5ndGg7IGkrKykge1xuICAgICAgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gLTEpIHtcbiAgICAgICAgICByYW5nZS5zZXRTdGFydChkZWx0YS5yYW5nZS5zdGFydC5yb3csIGRlbHRhLnJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgIH1cbiAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5lbmQ7XG4gICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gMSkge1xuICAgICAgICAgIHJhbmdlLnNldEVuZChkZWx0YS5yYW5nZS5lbmQucm93LCBkZWx0YS5yYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IHRydWU7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2Uuc3RhcnQpO1xuICAgICAgICB9XG4gICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyByYW5nZSBhbmQgdGhlIGxhc3QgdW5kbyByYW5nZSBoYXMgc29tZXRoaW5nIGluIGNvbW1vbi5cbiAgICAvLyBJZiB0cnVlLCBtZXJnZSB0aGUgcmFuZ2VzLlxuICAgIGlmIChsYXN0VW5kb1JhbmdlICE9IG51bGwpIHtcbiAgICAgIGlmIChSYW5nZS5jb21wYXJlUG9pbnRzKGxhc3RVbmRvUmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0KSA9PT0gMCkge1xuICAgICAgICBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbiArPSByYW5nZS5lbmQuY29sdW1uIC0gcmFuZ2Uuc3RhcnQuY29sdW1uO1xuICAgICAgICBsYXN0VW5kb1JhbmdlLmVuZC5jb2x1bW4gKz0gcmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbjtcbiAgICAgIH1cblxuICAgICAgdmFyIGNtcCA9IGxhc3RVbmRvUmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgIGlmIChjbXAgPT09IDEpIHtcbiAgICAgICAgcmFuZ2Uuc2V0U3RhcnQobGFzdFVuZG9SYW5nZS5zdGFydC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgIH1cbiAgICAgIGVsc2UgaWYgKGNtcCA9PT0gLTEpIHtcbiAgICAgICAgcmFuZ2Uuc2V0RW5kKGxhc3RVbmRvUmFuZ2UuZW5kLnJvdywgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfVxuXG4gIC8qKlxuICAqIFJlcGxhY2VzIGEgcmFuZ2UgaW4gdGhlIGRvY3VtZW50IHdpdGggdGhlIG5ldyBgdGV4dGAuXG4gICpcbiAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHNwZWNpZmllZCBSYW5nZSB0byByZXBsYWNlXG4gICogQHBhcmFtIHtTdHJpbmd9IHRleHQgVGhlIG5ldyB0ZXh0IHRvIHVzZSBhcyBhIHJlcGxhY2VtZW50XG4gICogQHJldHVybnMge09iamVjdH0gQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZpbmFsIHJvdyBhbmQgY29sdW1uLCBsaWtlIHRoaXM6XG4gICogYGBgXG4gICoge3JvdzogZW5kUm93LCBjb2x1bW46IDB9XG4gICogYGBgXG4gICogSWYgdGhlIHRleHQgYW5kIHJhbmdlIGFyZSBlbXB0eSwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5zdGFydGAgdmFsdWUuXG4gICogSWYgdGhlIHRleHQgaXMgdGhlIGV4YWN0IHNhbWUgYXMgd2hhdCBjdXJyZW50bHkgZXhpc3RzLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGN1cnJlbnQgYHJhbmdlLmVuZGAgdmFsdWUuXG4gICpcbiAgKlxuICAqXG4gICogQHJlbGF0ZWQgRG9jdW1lbnQucmVwbGFjZVxuICAqXG4gICpcbiAgKiovXG4gIHB1YmxpYyByZXBsYWNlKHJhbmdlOiBSYW5nZSwgdGV4dDogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9jLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuICB9XG5cbiAgLyoqXG4gICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICogIGBgYGpzb25cbiAgKiAgICB7IHJvdzogbmV3Um93TG9jYXRpb24sIGNvbHVtbjogbmV3Q29sdW1uTG9jYXRpb24gfVxuICAgKiAgYGBgXG4gICAqIEBwYXJhbSB7UmFuZ2V9IGZyb21SYW5nZSBUaGUgcmFuZ2Ugb2YgdGV4dCB5b3Ugd2FudCBtb3ZlZCB3aXRoaW4gdGhlIGRvY3VtZW50XG4gICAqIEBwYXJhbSB7T2JqZWN0fSB0b1Bvc2l0aW9uIFRoZSBsb2NhdGlvbiAocm93IGFuZCBjb2x1bW4pIHdoZXJlIHlvdSB3YW50IHRvIG1vdmUgdGhlIHRleHQgdG9cbiAgICogQHJldHVybnMge1JhbmdlfSBUaGUgbmV3IHJhbmdlIHdoZXJlIHRoZSB0ZXh0IHdhcyBtb3ZlZCB0by5cbiAgKlxuICAqXG4gICpcbiAgKiovXG4gIHB1YmxpYyBtb3ZlVGV4dChmcm9tUmFuZ2UsIHRvUG9zaXRpb24sIGNvcHkpIHtcbiAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0VGV4dFJhbmdlKGZyb21SYW5nZSk7XG4gICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZnJvbVJhbmdlKTtcbiAgICB2YXIgcm93RGlmZjogbnVtYmVyO1xuICAgIHZhciBjb2xEaWZmOiBudW1iZXI7XG5cbiAgICB2YXIgdG9SYW5nZSA9IFJhbmdlLmZyb21Qb2ludHModG9Qb3NpdGlvbiwgdG9Qb3NpdGlvbik7XG4gICAgaWYgKCFjb3B5KSB7XG4gICAgICB0aGlzLnJlbW92ZShmcm9tUmFuZ2UpO1xuICAgICAgcm93RGlmZiA9IGZyb21SYW5nZS5zdGFydC5yb3cgLSBmcm9tUmFuZ2UuZW5kLnJvdztcbiAgICAgIGNvbERpZmYgPSByb3dEaWZmID8gLWZyb21SYW5nZS5lbmQuY29sdW1uIDogZnJvbVJhbmdlLnN0YXJ0LmNvbHVtbiAtIGZyb21SYW5nZS5lbmQuY29sdW1uO1xuICAgICAgaWYgKGNvbERpZmYpIHtcbiAgICAgICAgaWYgKHRvUmFuZ2Uuc3RhcnQucm93ID09IGZyb21SYW5nZS5lbmQucm93ICYmIHRvUmFuZ2Uuc3RhcnQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICB0b1JhbmdlLnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0b1JhbmdlLmVuZC5yb3cgPT0gZnJvbVJhbmdlLmVuZC5yb3cgJiYgdG9SYW5nZS5lbmQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICB0b1JhbmdlLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHJvd0RpZmYgJiYgdG9SYW5nZS5zdGFydC5yb3cgPj0gZnJvbVJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgdG9SYW5nZS5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgdG9SYW5nZS5lbmQucm93ICs9IHJvd0RpZmY7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdG9SYW5nZS5lbmQgPSB0aGlzLmluc2VydCh0b1JhbmdlLnN0YXJ0LCB0ZXh0KTtcbiAgICBpZiAoZm9sZHMubGVuZ3RoKSB7XG4gICAgICB2YXIgb2xkU3RhcnQgPSBmcm9tUmFuZ2Uuc3RhcnQ7XG4gICAgICB2YXIgbmV3U3RhcnQgPSB0b1JhbmdlLnN0YXJ0O1xuICAgICAgcm93RGlmZiA9IG5ld1N0YXJ0LnJvdyAtIG9sZFN0YXJ0LnJvdztcbiAgICAgIGNvbERpZmYgPSBuZXdTdGFydC5jb2x1bW4gLSBvbGRTdGFydC5jb2x1bW47XG4gICAgICB0aGlzLmFkZEZvbGRzKGZvbGRzLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgIHggPSB4LmNsb25lKCk7XG4gICAgICAgIGlmICh4LnN0YXJ0LnJvdyA9PSBvbGRTdGFydC5yb3cpIHtcbiAgICAgICAgICB4LnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICB9XG4gICAgICAgIGlmICh4LmVuZC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgeC5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgIH1cbiAgICAgICAgeC5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgeC5lbmQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgIHJldHVybiB4O1xuICAgICAgfSkpO1xuICAgIH1cblxuICAgIHJldHVybiB0b1JhbmdlO1xuICB9XG5cbiAgLyoqXG4gICogSW5kZW50cyBhbGwgdGhlIHJvd3MsIGZyb20gYHN0YXJ0Um93YCB0byBgZW5kUm93YCAoaW5jbHVzaXZlKSwgYnkgcHJlZml4aW5nIGVhY2ggcm93IHdpdGggdGhlIHRva2VuIGluIGBpbmRlbnRTdHJpbmdgLlxuICAqXG4gICogSWYgYGluZGVudFN0cmluZ2AgY29udGFpbnMgdGhlIGAnXFx0J2AgY2hhcmFjdGVyLCBpdCdzIHJlcGxhY2VkIGJ5IHdoYXRldmVyIGlzIGRlZmluZWQgYnkgW1tFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmcgYGdldFRhYlN0cmluZygpYF1dLlxuICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFJvdyBTdGFydGluZyByb3dcbiAgKiBAcGFyYW0ge051bWJlcn0gZW5kUm93IEVuZGluZyByb3dcbiAgKiBAcGFyYW0ge1N0cmluZ30gaW5kZW50U3RyaW5nIFRoZSBpbmRlbnQgdG9rZW5cbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgaW5kZW50Um93cyhzdGFydFJvdywgZW5kUm93LCBpbmRlbnRTdHJpbmcpIHtcbiAgICBpbmRlbnRTdHJpbmcgPSBpbmRlbnRTdHJpbmcucmVwbGFjZSgvXFx0L2csIHRoaXMuZ2V0VGFiU3RyaW5nKCkpO1xuICAgIGZvciAodmFyIHJvdyA9IHN0YXJ0Um93OyByb3cgPD0gZW5kUm93OyByb3crKylcbiAgICAgIHRoaXMuaW5zZXJ0KHsgcm93OiByb3csIGNvbHVtbjogMCB9LCBpbmRlbnRTdHJpbmcpO1xuICB9XG5cbiAgLyoqXG4gICogT3V0ZGVudHMgYWxsIHRoZSByb3dzIGRlZmluZWQgYnkgdGhlIGBzdGFydGAgYW5kIGBlbmRgIHByb3BlcnRpZXMgb2YgYHJhbmdlYC5cbiAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHJhbmdlIG9mIHJvd3NcbiAgKlxuICAqXG4gICoqL1xuICBwdWJsaWMgb3V0ZGVudFJvd3MocmFuZ2U6IFJhbmdlKSB7XG4gICAgdmFyIHJvd1JhbmdlID0gcmFuZ2UuY29sbGFwc2VSb3dzKCk7XG4gICAgdmFyIGRlbGV0ZVJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgIHZhciBzaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG5cbiAgICBmb3IgKHZhciBpID0gcm93UmFuZ2Uuc3RhcnQucm93OyBpIDw9IHJvd1JhbmdlLmVuZC5yb3c7ICsraSkge1xuICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUoaSk7XG5cbiAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LnJvdyA9IGk7XG4gICAgICBkZWxldGVSYW5nZS5lbmQucm93ID0gaTtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2l6ZTsgKytqKVxuICAgICAgICBpZiAobGluZS5jaGFyQXQoaikgIT0gJyAnKVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgaWYgKGogPCBzaXplICYmIGxpbmUuY2hhckF0KGopID09ICdcXHQnKSB7XG4gICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IGo7XG4gICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqICsgMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IDA7XG4gICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqO1xuICAgICAgfVxuICAgICAgdGhpcy5yZW1vdmUoZGVsZXRlUmFuZ2UpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgJG1vdmVMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIsIGRpcjogbnVtYmVyKSB7XG4gICAgZmlyc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyk7XG4gICAgbGFzdFJvdyA9IHRoaXMuZ2V0Um93Rm9sZEVuZChsYXN0Um93KTtcbiAgICBpZiAoZGlyIDwgMCkge1xuICAgICAgdmFyIHJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KGZpcnN0Um93ICsgZGlyKTtcbiAgICAgIGlmIChyb3cgPCAwKSByZXR1cm4gMDtcbiAgICAgIHZhciBkaWZmID0gcm93IC0gZmlyc3RSb3c7XG4gICAgfSBlbHNlIGlmIChkaXIgPiAwKSB7XG4gICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cgKyBkaXIpO1xuICAgICAgaWYgKHJvdyA+IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkgcmV0dXJuIDA7XG4gICAgICB2YXIgZGlmZiA9IHJvdyAtIGxhc3RSb3c7XG4gICAgfSBlbHNlIHtcbiAgICAgIGZpcnN0Um93ID0gdGhpcy4kY2xpcFJvd1RvRG9jdW1lbnQoZmlyc3RSb3cpO1xuICAgICAgbGFzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGxhc3RSb3cpO1xuICAgICAgdmFyIGRpZmYgPSBsYXN0Um93IC0gZmlyc3RSb3cgKyAxO1xuICAgIH1cblxuICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShmaXJzdFJvdywgMCwgbGFzdFJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICB4ID0geC5jbG9uZSgpO1xuICAgICAgeC5zdGFydC5yb3cgKz0gZGlmZjtcbiAgICAgIHguZW5kLnJvdyArPSBkaWZmO1xuICAgICAgcmV0dXJuIHg7XG4gICAgfSk7XG5cbiAgICB2YXIgbGluZXMgPSBkaXIgPT0gMFxuICAgICAgPyB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdylcbiAgICAgIDogdGhpcy5kb2MucmVtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgIHRoaXMuZG9jLmluc2VydExpbmVzKGZpcnN0Um93ICsgZGlmZiwgbGluZXMpO1xuICAgIGZvbGRzLmxlbmd0aCAmJiB0aGlzLmFkZEZvbGRzKGZvbGRzKTtcbiAgICByZXR1cm4gZGlmZjtcbiAgfVxuICAvKipcbiAgKiBTaGlmdHMgYWxsIHRoZSBsaW5lcyBpbiB0aGUgZG9jdW1lbnQgdXAgb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSB1cFxuICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSB1cFxuICAqIEByZXR1cm5zIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICpcbiAgKiBAcmVsYXRlZCBEb2N1bWVudC5pbnNlcnRMaW5lc1xuICAqXG4gICoqL1xuICBwcml2YXRlIG1vdmVMaW5lc1VwKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgLTEpO1xuICB9XG5cbiAgLyoqXG4gICogU2hpZnRzIGFsbCB0aGUgbGluZXMgaW4gdGhlIGRvY3VtZW50IGRvd24gb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSBkb3duXG4gICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBtb3ZlIGRvd25cbiAgKiBAcmV0dXJucyB7TnVtYmVyfSBJZiBgZmlyc3RSb3dgIGlzIGxlc3MtdGhhbiBvciBlcXVhbCB0byAwLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgMC4gT3RoZXJ3aXNlLCBvbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAqXG4gICogQHJlbGF0ZWQgRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgKiovXG4gIHByaXZhdGUgbW92ZUxpbmVzRG93bihmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIDEpO1xuICB9XG5cbiAgLyoqXG4gICogRHVwbGljYXRlcyBhbGwgdGhlIHRleHQgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gZHVwbGljYXRlXG4gICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBkdXBsaWNhdGVcbiAgKiBAcmV0dXJucyB7TnVtYmVyfSBSZXR1cm5zIHRoZSBudW1iZXIgb2YgbmV3IHJvd3MgYWRkZWQ7IGluIG90aGVyIHdvcmRzLCBgbGFzdFJvdyAtIGZpcnN0Um93ICsgMWAuXG4gICpcbiAgKlxuICAqKi9cbiAgcHVibGljIGR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMCk7XG4gIH1cblxuXG4gIHByaXZhdGUgJGNsaXBSb3dUb0RvY3VtZW50KHJvdykge1xuICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbihyb3csIHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkpO1xuICB9XG5cbiAgcHJpdmF0ZSAkY2xpcENvbHVtblRvUm93KHJvdywgY29sdW1uKSB7XG4gICAgaWYgKGNvbHVtbiA8IDApXG4gICAgICByZXR1cm4gMDtcbiAgICByZXR1cm4gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgfVxuXG5cbiAgcHJpdmF0ZSAkY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICBjb2x1bW4gPSBNYXRoLm1heCgwLCBjb2x1bW4pO1xuXG4gICAgaWYgKHJvdyA8IDApIHtcbiAgICAgIHJvdyA9IDA7XG4gICAgICBjb2x1bW4gPSAwO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHZhciBsZW4gPSB0aGlzLmRvYy5nZXRMZW5ndGgoKTtcbiAgICAgIGlmIChyb3cgPj0gbGVuKSB7XG4gICAgICAgIHJvdyA9IGxlbiAtIDE7XG4gICAgICAgIGNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUobGVuIC0gMSkubGVuZ3RoO1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIGNvbHVtbiA9IE1hdGgubWluKHRoaXMuZG9jLmdldExpbmUocm93KS5sZW5ndGgsIGNvbHVtbik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHJvdzogcm93LFxuICAgICAgY29sdW1uOiBjb2x1bW5cbiAgICB9O1xuICB9XG5cbiAgcHVibGljICRjbGlwUmFuZ2VUb0RvY3VtZW50KHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICBpZiAocmFuZ2Uuc3RhcnQucm93IDwgMCkge1xuICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gMDtcbiAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IDA7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gdGhpcy4kY2xpcENvbHVtblRvUm93KFxuICAgICAgICByYW5nZS5zdGFydC5yb3csXG4gICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtblxuICAgICAgKTtcbiAgICB9XG5cbiAgICB2YXIgbGVuID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgIGlmIChyYW5nZS5lbmQucm93ID4gbGVuKSB7XG4gICAgICByYW5nZS5lbmQucm93ID0gbGVuO1xuICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUobGVuKS5sZW5ndGg7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgcmFuZ2UuZW5kLnJvdyxcbiAgICAgICAgcmFuZ2UuZW5kLmNvbHVtblxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHJhbmdlO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgd2hldGhlciBvciBub3QgbGluZSB3cmFwcGluZyBpcyBlbmFibGVkLiBJZiBgdXNlV3JhcE1vZGVgIGlzIGRpZmZlcmVudCB0aGFuIHRoZSBjdXJyZW50IHZhbHVlLCB0aGUgYCdjaGFuZ2VXcmFwTW9kZSdgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlV3JhcE1vZGUgRW5hYmxlIChvciBkaXNhYmxlKSB3cmFwIG1vZGVcbiAgICpcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSBzZXRVc2VXcmFwTW9kZSh1c2VXcmFwTW9kZTogYm9vbGVhbikge1xuICAgIGlmICh1c2VXcmFwTW9kZSAhPSB0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgdGhpcy4kdXNlV3JhcE1vZGUgPSB1c2VXcmFwTW9kZTtcbiAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG5cbiAgICAgIC8vIElmIHdyYXBNb2RlIGlzIGFjdGl2YWVkLCB0aGUgd3JhcERhdGEgYXJyYXkgaGFzIHRvIGJlIGluaXRpYWxpemVkLlxuICAgICAgaWYgKHVzZVdyYXBNb2RlKSB7XG4gICAgICAgIHZhciBsZW4gPSB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IEFycmF5PG51bWJlcltdPihsZW4pO1xuICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCBsZW4gLSAxKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcE1vZGVcIik7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyBgdHJ1ZWAgaWYgd3JhcCBtb2RlIGlzIGJlaW5nIHVzZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAqKi9cbiAgZ2V0VXNlV3JhcE1vZGUoKSB7XG4gICAgcmV0dXJuIHRoaXMuJHVzZVdyYXBNb2RlO1xuICB9XG5cbiAgLy8gQWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gbW92ZSBmcmVlbHkgYmV0d2VlbiBtaW4gYW5kIG1heC4gRWl0aGVyXG4gIC8vIHBhcmFtZXRlciBjYW4gYmUgbnVsbCB0byBhbGxvdyB0aGUgd3JhcCBsaW1pdCB0byBiZSB1bmNvbnN0cmFpbmVkXG4gIC8vIGluIHRoYXQgZGlyZWN0aW9uLiBPciBzZXQgYm90aCBwYXJhbWV0ZXJzIHRvIHRoZSBzYW1lIG51bWJlciB0byBwaW5cbiAgLy8gdGhlIGxpbWl0IHRvIHRoYXQgdmFsdWUuXG4gIC8qKlxuICAgKiBTZXRzIHRoZSBib3VuZGFyaWVzIG9mIHdyYXAuIEVpdGhlciB2YWx1ZSBjYW4gYmUgYG51bGxgIHRvIGhhdmUgYW4gdW5jb25zdHJhaW5lZCB3cmFwLCBvciwgdGhleSBjYW4gYmUgdGhlIHNhbWUgbnVtYmVyIHRvIHBpbiB0aGUgbGltaXQuIElmIHRoZSB3cmFwIGxpbWl0cyBmb3IgYG1pbmAgb3IgYG1heGAgYXJlIGRpZmZlcmVudCwgdGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VXcmFwTW9kZSdgIGV2ZW50LlxuICAgKiBAcGFyYW0ge051bWJlcn0gbWluIFRoZSBtaW5pbXVtIHdyYXAgdmFsdWUgKHRoZSBsZWZ0IHNpZGUgd3JhcClcbiAgICogQHBhcmFtIHtOdW1iZXJ9IG1heCBUaGUgbWF4aW11bSB3cmFwIHZhbHVlICh0aGUgcmlnaHQgc2lkZSB3cmFwKVxuICAgKlxuICAqXG4gICoqL1xuICBzZXRXcmFwTGltaXRSYW5nZShtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiB2b2lkIHtcbiAgICBpZiAodGhpcy4kd3JhcExpbWl0UmFuZ2UubWluICE9PSBtaW4gfHwgdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4ICE9PSBtYXgpIHtcbiAgICAgIHRoaXMuJHdyYXBMaW1pdFJhbmdlID0ge1xuICAgICAgICBtaW46IG1pbixcbiAgICAgICAgbWF4OiBtYXhcbiAgICAgIH07XG4gICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAvLyBUaGlzIHdpbGwgZm9yY2UgYSByZWNhbGN1bGF0aW9uIG9mIHRoZSB3cmFwIGxpbWl0XG4gICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgKiBUaGlzIHNob3VsZCBnZW5lcmFsbHkgb25seSBiZSBjYWxsZWQgYnkgdGhlIHJlbmRlcmVyIHdoZW4gYSByZXNpemUgaXMgZGV0ZWN0ZWQuXG4gICogQHBhcmFtIHtOdW1iZXJ9IGRlc2lyZWRMaW1pdCBUaGUgbmV3IHdyYXAgbGltaXRcbiAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgKlxuICAqIEBwcml2YXRlXG4gICoqL1xuICBwdWJsaWMgYWRqdXN0V3JhcExpbWl0KGRlc2lyZWRMaW1pdDogbnVtYmVyLCAkcHJpbnRNYXJnaW46IG51bWJlcikge1xuICAgIHZhciBsaW1pdHMgPSB0aGlzLiR3cmFwTGltaXRSYW5nZVxuICAgIGlmIChsaW1pdHMubWF4IDwgMClcbiAgICAgIGxpbWl0cyA9IHsgbWluOiAkcHJpbnRNYXJnaW4sIG1heDogJHByaW50TWFyZ2luIH07XG4gICAgdmFyIHdyYXBMaW1pdCA9IHRoaXMuJGNvbnN0cmFpbldyYXBMaW1pdChkZXNpcmVkTGltaXQsIGxpbWl0cy5taW4sIGxpbWl0cy5tYXgpO1xuICAgIGlmICh3cmFwTGltaXQgIT0gdGhpcy4kd3JhcExpbWl0ICYmIHdyYXBMaW1pdCA+IDEpIHtcbiAgICAgIHRoaXMuJHdyYXBMaW1pdCA9IHdyYXBMaW1pdDtcbiAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVdyYXBMaW1pdFwiKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlICRjb25zdHJhaW5XcmFwTGltaXQod3JhcExpbWl0OiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG4gICAgaWYgKG1pbilcbiAgICAgIHdyYXBMaW1pdCA9IE1hdGgubWF4KG1pbiwgd3JhcExpbWl0KTtcblxuICAgIGlmIChtYXgpXG4gICAgICB3cmFwTGltaXQgPSBNYXRoLm1pbihtYXgsIHdyYXBMaW1pdCk7XG5cbiAgICByZXR1cm4gd3JhcExpbWl0O1xuICB9XG5cbiAgLyoqXG4gICogUmV0dXJucyB0aGUgdmFsdWUgb2Ygd3JhcCBsaW1pdC5cbiAgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgd3JhcCBsaW1pdC5cbiAgKiovXG4gIHByaXZhdGUgZ2V0V3JhcExpbWl0KCkge1xuICAgIHJldHVybiB0aGlzLiR3cmFwTGltaXQ7XG4gIH1cblxuICAvKipcbiAgICogU2V0cyB0aGUgbGluZSBsZW5ndGggZm9yIHNvZnQgd3JhcCBpbiB0aGUgZWRpdG9yLiBMaW5lcyB3aWxsIGJyZWFrXG4gICAqICBhdCBhIG1pbmltdW0gb2YgdGhlIGdpdmVuIGxlbmd0aCBtaW51cyAyMCBjaGFycyBhbmQgYXQgYSBtYXhpbXVtXG4gICAqICBvZiB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGNoYXJzLlxuICAgKiBAcGFyYW0ge251bWJlcn0gbGltaXQgVGhlIG1heGltdW0gbGluZSBsZW5ndGggaW4gY2hhcnMsIGZvciBzb2Z0IHdyYXBwaW5nIGxpbmVzLlxuICAgKi9cbiAgcHJpdmF0ZSBzZXRXcmFwTGltaXQobGltaXQpIHtcbiAgICB0aGlzLnNldFdyYXBMaW1pdFJhbmdlKGxpbWl0LCBsaW1pdCk7XG4gIH1cblxuICAvKipcbiAgKiBSZXR1cm5zIGFuIG9iamVjdCB0aGF0IGRlZmluZXMgdGhlIG1pbmltdW0gYW5kIG1heGltdW0gb2YgdGhlIHdyYXAgbGltaXQ7IGl0IGxvb2tzIHNvbWV0aGluZyBsaWtlIHRoaXM6XG4gICpcbiAgKiAgICAgeyBtaW46IHdyYXBMaW1pdFJhbmdlX21pbiwgbWF4OiB3cmFwTGltaXRSYW5nZV9tYXggfVxuICAqXG4gICogQHJldHVybnMge09iamVjdH1cbiAgKiovXG4gIHByaXZhdGUgZ2V0V3JhcExpbWl0UmFuZ2UoKSB7XG4gICAgLy8gQXZvaWQgdW5leHBlY3RlZCBtdXRhdGlvbiBieSByZXR1cm5pbmcgYSBjb3B5XG4gICAgcmV0dXJuIHtcbiAgICAgIG1pbjogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWluLFxuICAgICAgbWF4OiB0aGlzLiR3cmFwTGltaXRSYW5nZS5tYXhcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSAkdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UoZSkge1xuICAgIHZhciB1c2VXcmFwTW9kZSA9IHRoaXMuJHVzZVdyYXBNb2RlO1xuICAgIHZhciBsZW47XG4gICAgdmFyIGFjdGlvbiA9IGUuZGF0YS5hY3Rpb247XG4gICAgdmFyIGZpcnN0Um93ID0gZS5kYXRhLnJhbmdlLnN0YXJ0LnJvdztcbiAgICB2YXIgbGFzdFJvdyA9IGUuZGF0YS5yYW5nZS5lbmQucm93O1xuICAgIHZhciBzdGFydCA9IGUuZGF0YS5yYW5nZS5zdGFydDtcbiAgICB2YXIgZW5kID0gZS5kYXRhLnJhbmdlLmVuZDtcbiAgICB2YXIgcmVtb3ZlZEZvbGRzID0gbnVsbDtcblxuICAgIGlmIChhY3Rpb24uaW5kZXhPZihcIkxpbmVzXCIpICE9IC0xKSB7XG4gICAgICBpZiAoYWN0aW9uID09IFwiaW5zZXJ0TGluZXNcIikge1xuICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3cgKyAoZS5kYXRhLmxpbmVzLmxlbmd0aCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3c7XG4gICAgICB9XG4gICAgICBsZW4gPSBlLmRhdGEubGluZXMgPyBlLmRhdGEubGluZXMubGVuZ3RoIDogbGFzdFJvdyAtIGZpcnN0Um93O1xuICAgIH0gZWxzZSB7XG4gICAgICBsZW4gPSBsYXN0Um93IC0gZmlyc3RSb3c7XG4gICAgfVxuXG4gICAgdGhpcy4kdXBkYXRpbmcgPSB0cnVlO1xuICAgIGlmIChsZW4gIT0gMCkge1xuICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwicmVtb3ZlXCIpICE9IC0xKSB7XG4gICAgICAgIHRoaXNbdXNlV3JhcE1vZGUgPyBcIiR3cmFwRGF0YVwiIDogXCIkcm93TGVuZ3RoQ2FjaGVcIl0uc3BsaWNlKGZpcnN0Um93LCBsZW4pO1xuXG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgcmVtb3ZlZEZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZS5kYXRhLnJhbmdlKTtcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhyZW1vdmVkRm9sZHMpO1xuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZW5kLnJvdyk7XG4gICAgICAgIHZhciBpZHggPSAwO1xuICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhlbmQucm93LCBlbmQuY29sdW1uLCBzdGFydC5jb2x1bW4gLSBlbmQuY29sdW1uKTtcbiAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdygtbGVuKTtcblxuICAgICAgICAgIHZhciBmb2xkTGluZUJlZm9yZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgIGlmIChmb2xkTGluZUJlZm9yZSAmJiBmb2xkTGluZUJlZm9yZSAhPT0gZm9sZExpbmUpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lQmVmb3JlLm1lcmdlKGZvbGRMaW5lKTtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmVCZWZvcmU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlkeCA9IGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSArIDE7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGlkeDsgaWR4IDwgZm9sZExpbmVzLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93ID49IGVuZC5yb3cpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KC1sZW4pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuKTtcbiAgICAgICAgYXJncy51bnNoaWZ0KGZpcnN0Um93LCAwKTtcbiAgICAgICAgdmFyIGFyciA9IHVzZVdyYXBNb2RlID8gdGhpcy4kd3JhcERhdGEgOiB0aGlzLiRyb3dMZW5ndGhDYWNoZVxuICAgICAgICBhcnIuc3BsaWNlLmFwcGx5KGFyciwgYXJncyk7XG5cbiAgICAgICAgLy8gSWYgc29tZSBuZXcgbGluZSBpcyBhZGRlZCBpbnNpZGUgb2YgYSBmb2xkTGluZSwgdGhlbiBzcGxpdFxuICAgICAgICAvLyB0aGUgZm9sZCBsaW5lIHVwLlxuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgdmFyIGNtcCA9IGZvbGRMaW5lLnJhbmdlLmNvbXBhcmVJbnNpZGUoc3RhcnQucm93LCBzdGFydC5jb2x1bW4pXG4gICAgICAgICAgLy8gSW5zaWRlIG9mIHRoZSBmb2xkTGluZSByYW5nZS4gTmVlZCB0byBzcGxpdCBzdHVmZiB1cC5cbiAgICAgICAgICBpZiAoY21wID09IDApIHtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmUuc3BsaXQoc3RhcnQucm93LCBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKFxuICAgICAgICAgICAgICBsYXN0Um93LCAwLCBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgIC8vIEluZnJvbnQgb2YgdGhlIGZvbGRMaW5lIGJ1dCBzYW1lIHJvdy4gTmVlZCB0byBzaGlmdCBjb2x1bW4uXG4gICAgICAgICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGZpcnN0Um93LCAwLCBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAvLyBOb3RoaW5nIHRvIGRvIGlmIHRoZSBpbnNlcnQgaXMgYWZ0ZXIgdGhlIGZvbGRMaW5lLlxuICAgICAgICAgIGlkeCA9IGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSArIDE7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGlkeDsgaWR4IDwgZm9sZExpbmVzLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93ID49IGZpcnN0Um93KSB7XG4gICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBSZWFsaWduIGZvbGRzLiBFLmcuIGlmIHlvdSBhZGQgc29tZSBuZXcgY2hhcnMgYmVmb3JlIGEgZm9sZCwgdGhlXG4gICAgICAvLyBmb2xkIHNob3VsZCBcIm1vdmVcIiB0byB0aGUgcmlnaHQuXG4gICAgICBsZW4gPSBNYXRoLmFicyhlLmRhdGEucmFuZ2Uuc3RhcnQuY29sdW1uIC0gZS5kYXRhLnJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwicmVtb3ZlXCIpICE9IC0xKSB7XG4gICAgICAgIC8vIEdldCBhbGwgdGhlIGZvbGRzIGluIHRoZSBjaGFuZ2UgcmFuZ2UgYW5kIHJlbW92ZSB0aGVtLlxuICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKHJlbW92ZWRGb2xkcyk7XG5cbiAgICAgICAgbGVuID0gLWxlbjtcbiAgICAgIH1cbiAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGZpcnN0Um93LCBzdGFydC5jb2x1bW4sIGxlbik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHVzZVdyYXBNb2RlICYmIHRoaXMuJHdyYXBEYXRhLmxlbmd0aCAhPSB0aGlzLmRvYy5nZXRMZW5ndGgoKSkge1xuICAgICAgY29uc29sZS5lcnJvcihcImRvYy5nZXRMZW5ndGgoKSBhbmQgJHdyYXBEYXRhLmxlbmd0aCBoYXZlIHRvIGJlIHRoZSBzYW1lIVwiKTtcbiAgICB9XG4gICAgdGhpcy4kdXBkYXRpbmcgPSBmYWxzZTtcblxuICAgIGlmICh1c2VXcmFwTW9kZSlcbiAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKGZpcnN0Um93LCBsYXN0Um93KTtcbiAgICBlbHNlXG4gICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdyk7XG5cbiAgICByZXR1cm4gcmVtb3ZlZEZvbGRzO1xuICB9XG5cbiAgcHVibGljICR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdywgYj8pIHtcbiAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZVtmaXJzdFJvd10gPSBudWxsO1xuICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlW2xhc3RSb3ddID0gbnVsbDtcbiAgfVxuXG4gIHB1YmxpYyAkdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpIHtcbiAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgIHZhciB0YWJTaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG4gICAgdmFyIHdyYXBEYXRhID0gdGhpcy4kd3JhcERhdGE7XG4gICAgdmFyIHdyYXBMaW1pdCA9IHRoaXMuJHdyYXBMaW1pdDtcbiAgICB2YXIgdG9rZW5zO1xuICAgIHZhciBmb2xkTGluZTtcblxuICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICBsYXN0Um93ID0gTWF0aC5taW4obGFzdFJvdywgbGluZXMubGVuZ3RoIC0gMSk7XG4gICAgd2hpbGUgKHJvdyA8PSBsYXN0Um93KSB7XG4gICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93LCBmb2xkTGluZSk7XG4gICAgICBpZiAoIWZvbGRMaW5lKSB7XG4gICAgICAgIHRva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMobGluZXNbcm93XSk7XG4gICAgICAgIHdyYXBEYXRhW3Jvd10gPSB0aGlzLiRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnMsIHdyYXBMaW1pdCwgdGFiU2l6ZSk7XG4gICAgICAgIHJvdysrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdG9rZW5zID0gW107XG4gICAgICAgIGZvbGRMaW5lLndhbGsoZnVuY3Rpb24ocGxhY2Vob2xkZXIsIHJvdywgY29sdW1uLCBsYXN0Q29sdW1uKSB7XG4gICAgICAgICAgdmFyIHdhbGtUb2tlbnM6IG51bWJlcltdO1xuICAgICAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgICAgICB3YWxrVG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhcbiAgICAgICAgICAgICAgcGxhY2Vob2xkZXIsIHRva2Vucy5sZW5ndGgpO1xuICAgICAgICAgICAgd2Fsa1Rva2Vuc1swXSA9IFBMQUNFSE9MREVSX1NUQVJUO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB3YWxrVG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgIHdhbGtUb2tlbnNbaV0gPSBQTEFDRUhPTERFUl9CT0RZO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB3YWxrVG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhcbiAgICAgICAgICAgICAgbGluZXNbcm93XS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKSxcbiAgICAgICAgICAgICAgdG9rZW5zLmxlbmd0aCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRva2VucyA9IHRva2Vucy5jb25jYXQod2Fsa1Rva2Vucyk7XG4gICAgICAgIH0uYmluZCh0aGlzKSxcbiAgICAgICAgICBmb2xkTGluZS5lbmQucm93LFxuICAgICAgICAgIGxpbmVzW2ZvbGRMaW5lLmVuZC5yb3ddLmxlbmd0aCArIDFcbiAgICAgICAgKTtcblxuICAgICAgICB3cmFwRGF0YVtmb2xkTGluZS5zdGFydC5yb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICByb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcml2YXRlICRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnM6IG51bWJlcltdLCB3cmFwTGltaXQ6IG51bWJlciwgdGFiU2l6ZT86IG51bWJlcikge1xuICAgIGlmICh0b2tlbnMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiBbXTtcbiAgICB9XG5cbiAgICB2YXIgc3BsaXRzOiBudW1iZXJbXSA9IFtdO1xuICAgIHZhciBkaXNwbGF5TGVuZ3RoID0gdG9rZW5zLmxlbmd0aDtcbiAgICB2YXIgbGFzdFNwbGl0ID0gMCwgbGFzdERvY1NwbGl0ID0gMDtcblxuICAgIHZhciBpc0NvZGUgPSB0aGlzLiR3cmFwQXNDb2RlO1xuXG4gICAgZnVuY3Rpb24gYWRkU3BsaXQoc2NyZWVuUG9zOiBudW1iZXIpIHtcbiAgICAgIHZhciBkaXNwbGF5ZWQgPSB0b2tlbnMuc2xpY2UobGFzdFNwbGl0LCBzY3JlZW5Qb3MpO1xuXG4gICAgICAvLyBUaGUgZG9jdW1lbnQgc2l6ZSBpcyB0aGUgY3VycmVudCBzaXplIC0gdGhlIGV4dHJhIHdpZHRoIGZvciB0YWJzXG4gICAgICAvLyBhbmQgbXVsdGlwbGVXaWR0aCBjaGFyYWN0ZXJzLlxuICAgICAgdmFyIGxlbiA9IGRpc3BsYXllZC5sZW5ndGg7XG4gICAgICBkaXNwbGF5ZWQuam9pbihcIlwiKS5cbiAgICAgICAgLy8gR2V0IGFsbCB0aGUgVEFCX1NQQUNFcy5cbiAgICAgICAgcmVwbGFjZSgvMTIvZywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgbGVuIC09IDE7XG4gICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgfSkuXG4gICAgICAgIC8vIEdldCBhbGwgdGhlIENIQVJfRVhUL211bHRpcGxlV2lkdGggY2hhcmFjdGVycy5cbiAgICAgICAgcmVwbGFjZSgvMi9nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgICAgICB9KTtcblxuICAgICAgbGFzdERvY1NwbGl0ICs9IGxlbjtcbiAgICAgIHNwbGl0cy5wdXNoKGxhc3REb2NTcGxpdCk7XG4gICAgICBsYXN0U3BsaXQgPSBzY3JlZW5Qb3M7XG4gICAgfVxuXG4gICAgd2hpbGUgKGRpc3BsYXlMZW5ndGggLSBsYXN0U3BsaXQgPiB3cmFwTGltaXQpIHtcbiAgICAgIC8vIFRoaXMgaXMsIHdoZXJlIHRoZSBzcGxpdCBzaG91bGQgYmUuXG4gICAgICB2YXIgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG5cbiAgICAgIC8vIElmIHRoZXJlIGlzIGEgc3BhY2Ugb3IgdGFiIGF0IHRoaXMgc3BsaXQgcG9zaXRpb24sIHRoZW4gbWFraW5nXG4gICAgICAvLyBhIHNwbGl0IGlzIHNpbXBsZS5cbiAgICAgIGlmICh0b2tlbnNbc3BsaXQgLSAxXSA+PSBTUEFDRSAmJiB0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgIC8qIGRpc2FibGVkIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYWpheG9yZy9hY2UvaXNzdWVzLzExODZcbiAgICAgICAgLy8gSW5jbHVkZSBhbGwgZm9sbG93aW5nIHNwYWNlcyArIHRhYnMgaW4gdGhpcyBzcGxpdCBhcyB3ZWxsLlxuICAgICAgICB3aGlsZSAodG9rZW5zW3NwbGl0XSA+PSBTUEFDRSkge1xuICAgICAgICAgICAgc3BsaXQgKys7XG4gICAgICAgIH0gKi9cbiAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAvLyBDaGVjayBpZiBzcGxpdCBpcyBpbnNpZGUgb2YgYSBwbGFjZWhvbGRlci4gUGxhY2Vob2xkZXIgYXJlXG4gICAgICAvLyBub3Qgc3BsaXRhYmxlLiBUaGVyZWZvcmUsIHNlZWsgdGhlIGJlZ2lubmluZyBvZiB0aGUgcGxhY2Vob2xkZXJcbiAgICAgIC8vIGFuZCB0cnkgdG8gcGxhY2UgdGhlIHNwbGl0IGJlb2ZyZSB0aGUgcGxhY2Vob2xkZXIncyBzdGFydC5cbiAgICAgIGlmICh0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX1NUQVJUIHx8IHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfQk9EWSkge1xuICAgICAgICAvLyBTZWVrIHRoZSBzdGFydCBvZiB0aGUgcGxhY2Vob2xkZXIgYW5kIGRvIHRoZSBzcGxpdFxuICAgICAgICAvLyBiZWZvcmUgdGhlIHBsYWNlaG9sZGVyLiBCeSBkZWZpbml0aW9uIHRoZXJlIGFsd2F5c1xuICAgICAgICAvLyBhIFBMQUNFSE9MREVSX1NUQVJUIGJldHdlZW4gc3BsaXQgYW5kIGxhc3RTcGxpdC5cbiAgICAgICAgZm9yIChzcGxpdDsgc3BsaXQgIT0gbGFzdFNwbGl0IC0gMTsgc3BsaXQtLSkge1xuICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAvLyBzcGxpdCsrOyA8PCBObyBpbmNyZW1lbnRhbCBoZXJlIGFzIHdlIHdhbnQgdG9cbiAgICAgICAgICAgIC8vICBoYXZlIHRoZSBwb3NpdGlvbiBiZWZvcmUgdGhlIFBsYWNlaG9sZGVyLlxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlIFBMQUNFSE9MREVSX1NUQVJUIGlzIG5vdCB0aGUgaW5kZXggb2YgdGhlXG4gICAgICAgIC8vIGxhc3Qgc3BsaXQsIHRoZW4gd2UgY2FuIGRvIHRoZSBzcGxpdFxuICAgICAgICBpZiAoc3BsaXQgPiBsYXN0U3BsaXQpIHtcbiAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGUgUExBQ0VIT0xERVJfU1RBUlQgSVMgdGhlIGluZGV4IG9mIHRoZSBsYXN0XG4gICAgICAgIC8vIHNwbGl0LCB0aGVuIHdlIGhhdmUgdG8gcGxhY2UgdGhlIHNwbGl0IGFmdGVyIHRoZVxuICAgICAgICAvLyBwbGFjZWhvbGRlci4gU28sIGxldCdzIHNlZWsgZm9yIHRoZSBlbmQgb2YgdGhlIHBsYWNlaG9sZGVyLlxuICAgICAgICBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcbiAgICAgICAgZm9yIChzcGxpdDsgc3BsaXQgPCB0b2tlbnMubGVuZ3RoOyBzcGxpdCsrKSB7XG4gICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gIT0gUExBQ0VIT0xERVJfQk9EWSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgc3BpbHQgPT0gdG9rZW5zLmxlbmd0aCwgdGhlbiB0aGUgcGxhY2Vob2xkZXIgaXMgdGhlIGxhc3RcbiAgICAgICAgLy8gdGhpbmcgaW4gdGhlIGxpbmUgYW5kIGFkZGluZyBhIG5ldyBzcGxpdCBkb2Vzbid0IG1ha2Ugc2Vuc2UuXG4gICAgICAgIGlmIChzcGxpdCA9PSB0b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgYnJlYWs7ICAvLyBCcmVha3MgdGhlIHdoaWxlLWxvb3AuXG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5LCBhZGQgdGhlIHNwbGl0Li4uXG4gICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgLy8gU2VhcmNoIGZvciB0aGUgZmlyc3Qgbm9uIHNwYWNlL3RhYi9wbGFjZWhvbGRlci9wdW5jdHVhdGlvbiB0b2tlbiBiYWNrd2FyZHMuXG4gICAgICB2YXIgbWluU3BsaXQgPSBNYXRoLm1heChzcGxpdCAtIChpc0NvZGUgPyAxMCA6IHdyYXBMaW1pdCAtICh3cmFwTGltaXQgPj4gMikpLCBsYXN0U3BsaXQgLSAxKTtcbiAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICBzcGxpdC0tO1xuICAgICAgfVxuICAgICAgaWYgKGlzQ29kZSkge1xuICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICB9XG4gICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPT0gUFVOQ1RVQVRJT04pIHtcbiAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgU1BBQ0UpIHtcbiAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBJZiB3ZSBmb3VuZCBvbmUsIHRoZW4gYWRkIHRoZSBzcGxpdC5cbiAgICAgIGlmIChzcGxpdCA+IG1pblNwbGl0KSB7XG4gICAgICAgIGFkZFNwbGl0KCsrc3BsaXQpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcbiAgICAgIC8vIFRoZSBzcGxpdCBpcyBpbnNpZGUgb2YgYSBDSEFSIG9yIENIQVJfRVhUIHRva2VuIGFuZCBubyBzcGFjZVxuICAgICAgLy8gYXJvdW5kIC0+IGZvcmNlIGEgc3BsaXQuXG4gICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgfVxuICAgIHJldHVybiBzcGxpdHM7XG4gIH1cblxuICAvKipcbiAgKiBHaXZlbiBhIHN0cmluZywgcmV0dXJucyBhbiBhcnJheSBvZiB0aGUgZGlzcGxheSBjaGFyYWN0ZXJzLCBpbmNsdWRpbmcgdGFicyBhbmQgc3BhY2VzLlxuICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjaGVja1xuICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgVGhlIHZhbHVlIHRvIHN0YXJ0IGF0XG4gICpcbiAgKlxuICAqKi9cbiAgcHJpdmF0ZSAkZ2V0RGlzcGxheVRva2VucyhzdHI6IHN0cmluZywgb2Zmc2V0PzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgIHZhciBhcnI6IG51bWJlcltdID0gW107XG4gICAgdmFyIHRhYlNpemU6IG51bWJlcjtcbiAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgYyA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgLy8gVGFiXG4gICAgICBpZiAoYyA9PSA5KSB7XG4gICAgICAgIHRhYlNpemUgPSB0aGlzLmdldFNjcmVlblRhYlNpemUoYXJyLmxlbmd0aCArIG9mZnNldCk7XG4gICAgICAgIGFyci5wdXNoKFRBQik7XG4gICAgICAgIGZvciAodmFyIG4gPSAxOyBuIDwgdGFiU2l6ZTsgbisrKSB7XG4gICAgICAgICAgYXJyLnB1c2goVEFCX1NQQUNFKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gU3BhY2VcbiAgICAgIGVsc2UgaWYgKGMgPT0gMzIpIHtcbiAgICAgICAgYXJyLnB1c2goU1BBQ0UpO1xuICAgICAgfVxuICAgICAgZWxzZSBpZiAoKGMgPiAzOSAmJiBjIDwgNDgpIHx8IChjID4gNTcgJiYgYyA8IDY0KSkge1xuICAgICAgICBhcnIucHVzaChQVU5DVFVBVElPTik7XG4gICAgICB9XG4gICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgIGFyci5wdXNoKENIQVIsIENIQVJfRVhUKTtcbiAgICAgIH1cbiAgICAgIGVsc2Uge1xuICAgICAgICBhcnIucHVzaChDSEFSKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGFycjtcbiAgfVxuXG4gIC8qKlxuICAgKiBDYWxjdWxhdGVzIHRoZSB3aWR0aCBvZiB0aGUgc3RyaW5nIGBzdHJgIG9uIHRoZSBzY3JlZW4gd2hpbGUgYXNzdW1pbmcgdGhhdCB0aGUgc3RyaW5nIHN0YXJ0cyBhdCB0aGUgZmlyc3QgY29sdW1uIG9uIHRoZSBzY3JlZW4uXG4gICogQHBhcmFtIHtTdHJpbmd9IHN0ciBUaGUgc3RyaW5nIHRvIGNhbGN1bGF0ZSB0aGUgc2NyZWVuIHdpZHRoIG9mXG4gICogQHBhcmFtIHtOdW1iZXJ9IG1heFNjcmVlbkNvbHVtblxuICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Db2x1bW5cbiAgKiBAcmV0dXJucyB7W051bWJlcl19IFJldHVybnMgYW4gYGludFtdYCBhcnJheSB3aXRoIHR3byBlbGVtZW50czo8YnIvPlxuICAqIFRoZSBmaXJzdCBwb3NpdGlvbiBpbmRpY2F0ZXMgdGhlIG51bWJlciBvZiBjb2x1bW5zIGZvciBgc3RyYCBvbiBzY3JlZW4uPGJyLz5cbiAgKiBUaGUgc2Vjb25kIHZhbHVlIGNvbnRhaW5zIHRoZSBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgY29sdW1uIHRoYXQgdGhpcyBmdW5jdGlvbiByZWFkIHVudGlsLlxuICAqXG4gICoqL1xuICBwdWJsaWMgJGdldFN0cmluZ1NjcmVlbldpZHRoKHN0cjogc3RyaW5nLCBtYXhTY3JlZW5Db2x1bW4/OiBudW1iZXIsIHNjcmVlbkNvbHVtbj86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICBpZiAobWF4U2NyZWVuQ29sdW1uID09IDApXG4gICAgICByZXR1cm4gWzAsIDBdO1xuICAgIGlmIChtYXhTY3JlZW5Db2x1bW4gPT0gbnVsbClcbiAgICAgIG1heFNjcmVlbkNvbHVtbiA9IEluZmluaXR5O1xuICAgIHNjcmVlbkNvbHVtbiA9IHNjcmVlbkNvbHVtbiB8fCAwO1xuXG4gICAgdmFyIGM6IG51bWJlcjtcbiAgICB2YXIgY29sdW1uOiBudW1iZXI7XG4gICAgZm9yIChjb2x1bW4gPSAwOyBjb2x1bW4gPCBzdHIubGVuZ3RoOyBjb2x1bW4rKykge1xuICAgICAgYyA9IHN0ci5jaGFyQ29kZUF0KGNvbHVtbik7XG4gICAgICAvLyB0YWJcbiAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgc2NyZWVuQ29sdW1uICs9IHRoaXMuZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW4pO1xuICAgICAgfVxuICAgICAgLy8gZnVsbCB3aWR0aCBjaGFyYWN0ZXJzXG4gICAgICBlbHNlIGlmIChjID49IDB4MTEwMCAmJiBpc0Z1bGxXaWR0aChjKSkge1xuICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHNjcmVlbkNvbHVtbiA+IG1heFNjcmVlbkNvbHVtbikge1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gW3NjcmVlbkNvbHVtbiwgY29sdW1uXTtcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgbnVtYmVyIG9mIHNjcmVlbnJvd3MgaW4gYSB3cmFwcGVkIGxpbmUuXG4gICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBjaGVja1xuICAqXG4gICogQHJldHVybnMge051bWJlcn1cbiAgKiovXG4gIHB1YmxpYyBnZXRSb3dMZW5ndGgocm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzKVxuICAgICAgdmFyIGggPSB0aGlzLmxpbmVXaWRnZXRzW3Jvd10gJiYgdGhpcy5saW5lV2lkZ2V0c1tyb3ddLnJvd0NvdW50IHx8IDA7XG4gICAgZWxzZVxuICAgICAgaCA9IDBcbiAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlIHx8ICF0aGlzLiR3cmFwRGF0YVtyb3ddKSB7XG4gICAgICByZXR1cm4gMSArIGg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddLmxlbmd0aCArIDEgKyBoO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgZ2V0Um93TGluZUNvdW50KHJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlIHx8ICF0aGlzLiR3cmFwRGF0YVtyb3ddKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XS5sZW5ndGggKyAxO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBnZXRSb3dXcmFwSW5kZW50KHNjcmVlblJvdzogbnVtYmVyKSB7XG4gICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICB2YXIgcG9zID0gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBOdW1iZXIuTUFYX1ZBTFVFKTtcbiAgICAgIHZhciBzcGxpdHMgPSB0aGlzLiR3cmFwRGF0YVtwb3Mucm93XTtcbiAgICAgIC8vIEZJWE1FOiBpbmRlbnQgZG9lcyBub3QgZXhpc3RzIG9uIG51bWJlcltdXG4gICAgICByZXR1cm4gc3BsaXRzLmxlbmd0aCAmJiBzcGxpdHNbMF0gPCBwb3MuY29sdW1uID8gc3BsaXRzWydpbmRlbnQnXSA6IDA7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgcmV0dXJuIDA7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFJldHVybnMgdGhlIHBvc2l0aW9uIChvbiBzY3JlZW4pIGZvciB0aGUgbGFzdCBjaGFyYWN0ZXIgaW4gdGhlIHByb3ZpZGVkIHNjcmVlbiByb3cuXG4gICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICogQHJldHVybnMge051bWJlcn1cbiAgICpcbiAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtblxuICAqKi9cbiAgcHVibGljIGdldFNjcmVlbkxhc3RSb3dDb2x1bW4oc2NyZWVuUm93OiBudW1iZXIpOiBudW1iZXIge1xuICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gIH1cblxuICAvKipcbiAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGNvbHVtbiBwb3NpdGlvbiBvZiB0aGUgbGFzdCBzY3JlZW4gcm93LlxuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgKlxuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgKiovXG4gIHB1YmxpYyBnZXREb2N1bWVudExhc3RSb3dDb2x1bW4oZG9jUm93LCBkb2NDb2x1bW4pIHtcbiAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICByZXR1cm4gdGhpcy5nZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdyk7XG4gIH1cblxuICAvKipcbiAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGRvY3VtZW50IHBvc2l0aW9uIG9mIHRoZSBsYXN0IHJvdy5cbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAqXG4gICpcbiAgKiovXG4gIHB1YmxpYyBnZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUgLyAxMCk7XG4gIH1cblxuICAvKipcbiAgKiBGb3IgdGhlIGdpdmVuIHJvdywgdGhpcyByZXR1cm5zIHRoZSBzcGxpdCBkYXRhLlxuICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICoqL1xuICBwdWJsaWMgZ2V0Um93U3BsaXREYXRhKHJvdzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB0aGlzLiR3cmFwRGF0YVtyb3ddO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBUaGUgZGlzdGFuY2UgdG8gdGhlIG5leHQgdGFiIHN0b3AgYXQgdGhlIHNwZWNpZmllZCBzY3JlZW4gY29sdW1uLlxuICAgKiBAbWV0aG9zIGdldFNjcmVlblRhYlNpemVcbiAgICogQHBhcmFtIHNjcmVlbkNvbHVtbiB7bnVtYmVyfSBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVja1xuICAgKiBAcmV0dXJuIHtudW1iZXJ9XG4gICAqL1xuICBwdWJsaWMgZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuJHRhYlNpemUgLSBzY3JlZW5Db2x1bW4gJSB0aGlzLiR0YWJTaXplO1xuICB9XG5cblxuICBwdWJsaWMgc2NyZWVuVG9Eb2N1bWVudFJvdyhzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikucm93O1xuICB9XG5cblxuICBwcml2YXRlIHNjcmVlblRvRG9jdW1lbnRDb2x1bW4oc2NyZWVuUm93OiBudW1iZXIsIHNjcmVlbkNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBzY3JlZW5Db2x1bW4pLmNvbHVtbjtcbiAgfVxuXG4gIC8qKlxuICAqIENvbnZlcnRzIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgb24gdGhlIHNjcmVlbiB0byBjaGFyYWN0ZXJzIGNvb3JkaW5hdGVzIHdpdGhpbiB0aGUgZG9jdW1lbnQuIFtUaGlzIHRha2VzIGludG8gYWNjb3VudCBjb2RlIGZvbGRpbmcsIHdvcmQgd3JhcCwgdGFiIHNpemUsIGFuZCBhbnkgb3RoZXIgdmlzdWFsIG1vZGlmaWNhdGlvbnMuXXs6ICNjb252ZXJzaW9uQ29uc2lkZXJhdGlvbnN9XG4gICogQHBhcmFtIHtudW1iZXJ9IHNjcmVlblJvdyBUaGUgc2NyZWVuIHJvdyB0byBjaGVja1xuICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Db2x1bW4gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgb2JqZWN0IHJldHVybmVkIGhhcyB0d28gcHJvcGVydGllczogYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAqKi9cbiAgcHVibGljIHNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICBpZiAoc2NyZWVuUm93IDwgMCkge1xuICAgICAgcmV0dXJuIHsgcm93OiAwLCBjb2x1bW46IDAgfTtcbiAgICB9XG5cbiAgICB2YXIgbGluZTtcbiAgICB2YXIgZG9jUm93ID0gMDtcbiAgICB2YXIgZG9jQ29sdW1uID0gMDtcbiAgICB2YXIgY29sdW1uO1xuICAgIHZhciByb3cgPSAwO1xuICAgIHZhciByb3dMZW5ndGggPSAwO1xuXG4gICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kc2NyZWVuUm93Q2FjaGU7XG4gICAgdmFyIGkgPSB0aGlzLiRnZXRSb3dDYWNoZUluZGV4KHJvd0NhY2hlLCBzY3JlZW5Sb3cpO1xuICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgdmFyIGRvY1JvdyA9IHRoaXMuJGRvY1Jvd0NhY2hlW2ldO1xuICAgICAgdmFyIGRvQ2FjaGUgPSBzY3JlZW5Sb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBkb0NhY2hlID0gIWw7XG4gICAgfVxuXG4gICAgdmFyIG1heFJvdyA9IHRoaXMuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKGRvY1Jvdyk7XG4gICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICB3aGlsZSAocm93IDw9IHNjcmVlblJvdykge1xuICAgICAgcm93TGVuZ3RoID0gdGhpcy5nZXRSb3dMZW5ndGgoZG9jUm93KTtcbiAgICAgIGlmIChyb3cgKyByb3dMZW5ndGggPiBzY3JlZW5Sb3cgfHwgZG9jUm93ID49IG1heFJvdykge1xuICAgICAgICBicmVhaztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJvdyArPSByb3dMZW5ndGg7XG4gICAgICAgIGRvY1JvdysrO1xuICAgICAgICBpZiAoZG9jUm93ID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgZG9jUm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShkb2NSb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChkb0NhY2hlKSB7XG4gICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnB1c2goZG9jUm93KTtcbiAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChmb2xkTGluZSAmJiBmb2xkTGluZS5zdGFydC5yb3cgPD0gZG9jUm93KSB7XG4gICAgICBsaW5lID0gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmUpO1xuICAgICAgZG9jUm93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgIH0gZWxzZSBpZiAocm93ICsgcm93TGVuZ3RoIDw9IHNjcmVlblJvdyB8fCBkb2NSb3cgPiBtYXhSb3cpIHtcbiAgICAgIC8vIGNsaXAgYXQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnRcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHJvdzogbWF4Um93LFxuICAgICAgICBjb2x1bW46IHRoaXMuZ2V0TGluZShtYXhSb3cpLmxlbmd0aFxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBsaW5lID0gdGhpcy5nZXRMaW5lKGRvY1Jvdyk7XG4gICAgICBmb2xkTGluZSA9IG51bGw7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbZG9jUm93XTtcbiAgICAgIGlmIChzcGxpdHMpIHtcbiAgICAgICAgdmFyIHNwbGl0SW5kZXggPSBNYXRoLmZsb29yKHNjcmVlblJvdyAtIHJvdyk7XG4gICAgICAgIGNvbHVtbiA9IHNwbGl0c1tzcGxpdEluZGV4XTtcbiAgICAgICAgaWYgKHNwbGl0SW5kZXggPiAwICYmIHNwbGl0cy5sZW5ndGgpIHtcbiAgICAgICAgICBkb2NDb2x1bW4gPSBzcGxpdHNbc3BsaXRJbmRleCAtIDFdIHx8IHNwbGl0c1tzcGxpdHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgbGluZSA9IGxpbmUuc3Vic3RyaW5nKGRvY0NvbHVtbik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBkb2NDb2x1bW4gKz0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZSwgc2NyZWVuQ29sdW1uKVsxXTtcblxuICAgIC8vIFdlIHJlbW92ZSBvbmUgY2hhcmFjdGVyIGF0IHRoZSBlbmQgc28gdGhhdCB0aGUgZG9jQ29sdW1uXG4gICAgLy8gcG9zaXRpb24gcmV0dXJuZWQgaXMgbm90IGFzc29jaWF0ZWQgdG8gdGhlIG5leHQgcm93IG9uIHRoZSBzY3JlZW4uXG4gICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlICYmIGRvY0NvbHVtbiA+PSBjb2x1bW4pXG4gICAgICBkb2NDb2x1bW4gPSBjb2x1bW4gLSAxO1xuXG4gICAgaWYgKGZvbGRMaW5lKVxuICAgICAgcmV0dXJuIGZvbGRMaW5lLmlkeFRvUG9zaXRpb24oZG9jQ29sdW1uKTtcblxuICAgIHJldHVybiB7IHJvdzogZG9jUm93LCBjb2x1bW46IGRvY0NvbHVtbiB9O1xuICB9XG5cbiAgLyoqXG4gICogQ29udmVydHMgZG9jdW1lbnQgY29vcmRpbmF0ZXMgdG8gc2NyZWVuIGNvb3JkaW5hdGVzLiB7OmNvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93IFRoZSBkb2N1bWVudCByb3cgdG8gY2hlY2tcbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uIFRoZSBkb2N1bWVudCBjb2x1bW4gdG8gY2hlY2tcbiAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgb2JqZWN0IHJldHVybmVkIGJ5IHRoaXMgbWV0aG9kIGhhcyB0d28gcHJvcGVydGllczogYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAqXG4gICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uXG4gICoqL1xuICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdzogbnVtYmVyLCBkb2NDb2x1bW46IG51bWJlcik6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgIHZhciBwb3M6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgLy8gTm9ybWFsaXplIHRoZSBwYXNzZWQgaW4gYXJndW1lbnRzLlxuICAgIGlmICh0eXBlb2YgZG9jQ29sdW1uID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICBwb3MgPSB0aGlzLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KGRvY1Jvd1sncm93J10sIGRvY1Jvd1snY29sdW1uJ10pO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgIGFzc2VydCh0eXBlb2YgZG9jQ29sdW1uID09PSAnbnVtYmVyJywgXCJkb2NDb2x1bW4gbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgIH1cblxuICAgIGRvY1JvdyA9IHBvcy5yb3c7XG4gICAgZG9jQ29sdW1uID0gcG9zLmNvbHVtbjtcbiAgICBhc3NlcnQodHlwZW9mIGRvY1JvdyA9PT0gJ251bWJlcicsIFwiZG9jUm93IG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgYXNzZXJ0KHR5cGVvZiBkb2NDb2x1bW4gPT09ICdudW1iZXInLCBcImRvY0NvbHVtbiBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuXG4gICAgdmFyIHNjcmVlblJvdyA9IDA7XG4gICAgdmFyIGZvbGRTdGFydFJvdyA9IG51bGw7XG4gICAgdmFyIGZvbGQgPSBudWxsO1xuXG4gICAgLy8gQ2xhbXAgdGhlIGRvY1JvdyBwb3NpdGlvbiBpbiBjYXNlIGl0J3MgaW5zaWRlIG9mIGEgZm9sZGVkIGJsb2NrLlxuICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChkb2NSb3csIGRvY0NvbHVtbiwgMSk7XG4gICAgaWYgKGZvbGQpIHtcbiAgICAgIGRvY1JvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgZG9jQ29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgfVxuXG4gICAgdmFyIHJvd0VuZCwgcm93ID0gMDtcblxuICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJGRvY1Jvd0NhY2hlO1xuICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgZG9jUm93KTtcbiAgICB2YXIgbCA9IHJvd0NhY2hlLmxlbmd0aDtcbiAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLiRzY3JlZW5Sb3dDYWNoZVtpXTtcbiAgICAgIHZhciBkb0NhY2hlID0gZG9jUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHZhciBkb0NhY2hlID0gIWw7XG4gICAgfVxuXG4gICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgIHdoaWxlIChyb3cgPCBkb2NSb3cpIHtcbiAgICAgIGlmIChyb3cgPj0gZm9sZFN0YXJ0KSB7XG4gICAgICAgIHJvd0VuZCA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICBpZiAocm93RW5kID4gZG9jUm93KVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvd0VuZCwgZm9sZExpbmUpO1xuICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHJvd0VuZCA9IHJvdyArIDE7XG4gICAgICB9XG5cbiAgICAgIHNjcmVlblJvdyArPSB0aGlzLmdldFJvd0xlbmd0aChyb3cpO1xuICAgICAgcm93ID0gcm93RW5kO1xuXG4gICAgICBpZiAoZG9DYWNoZSkge1xuICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnB1c2goc2NyZWVuUm93KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDYWxjdWxhdGUgdGhlIHRleHQgbGluZSB0aGF0IGlzIGRpc3BsYXllZCBpbiBkb2NSb3cgb24gdGhlIHNjcmVlbi5cbiAgICB2YXIgdGV4dExpbmUgPSBcIlwiO1xuICAgIC8vIENoZWNrIGlmIHRoZSBmaW5hbCByb3cgd2Ugd2FudCB0byByZWFjaCBpcyBpbnNpZGUgb2YgYSBmb2xkLlxuICAgIGlmIChmb2xkTGluZSAmJiByb3cgPj0gZm9sZFN0YXJ0KSB7XG4gICAgICB0ZXh0TGluZSA9IHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lLCBkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgICBmb2xkU3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRMaW5lKGRvY1Jvdykuc3Vic3RyaW5nKDAsIGRvY0NvbHVtbik7XG4gICAgICBmb2xkU3RhcnRSb3cgPSBkb2NSb3c7XG4gICAgfVxuICAgIC8vIENsYW1wIHRleHRMaW5lIGlmIGluIHdyYXBNb2RlLlxuICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgdmFyIHdyYXBSb3cgPSB0aGlzLiR3cmFwRGF0YVtmb2xkU3RhcnRSb3ddO1xuICAgICAgaWYgKHdyYXBSb3cpIHtcbiAgICAgICAgdmFyIHNjcmVlblJvd09mZnNldCA9IDA7XG4gICAgICAgIHdoaWxlICh0ZXh0TGluZS5sZW5ndGggPj0gd3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXRdKSB7XG4gICAgICAgICAgc2NyZWVuUm93Kys7XG4gICAgICAgICAgc2NyZWVuUm93T2Zmc2V0Kys7XG4gICAgICAgIH1cbiAgICAgICAgdGV4dExpbmUgPSB0ZXh0TGluZS5zdWJzdHJpbmcod3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXQgLSAxXSB8fCAwLCB0ZXh0TGluZS5sZW5ndGgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByb3c6IHNjcmVlblJvdyxcbiAgICAgIGNvbHVtbjogdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodGV4dExpbmUpWzBdXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiBjb2x1bW4uXG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAqXG4gICoqL1xuICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlbkNvbHVtbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikuY29sdW1uO1xuICB9XG5cbiAgLyoqXG4gICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgcmV0dXJucyB0aGUgc2NyZWVuIHJvdy5cbiAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAqKi9cbiAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pLnJvdztcbiAgfVxuXG4gIC8qKlxuICAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgc2NyZWVuLlxuICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICoqL1xuICBwdWJsaWMgZ2V0U2NyZWVuTGVuZ3RoKCk6IG51bWJlciB7XG4gICAgdmFyIHNjcmVlblJvd3MgPSAwO1xuICAgIHZhciBmb2xkOiBGb2xkTGluZSA9IG51bGw7XG4gICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgc2NyZWVuUm93cyA9IHRoaXMuZ2V0TGVuZ3RoKCk7XG5cbiAgICAgIC8vIFJlbW92ZSB0aGUgZm9sZGVkIGxpbmVzIGFnYWluLlxuICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGZvbGQgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgc2NyZWVuUm93cyAtPSBmb2xkLmVuZC5yb3cgLSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB2YXIgbGFzdFJvdyA9IHRoaXMuJHdyYXBEYXRhLmxlbmd0aDtcbiAgICAgIHZhciByb3cgPSAwLCBpID0gMDtcbiAgICAgIHZhciBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkID8gZm9sZC5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgd2hpbGUgKHJvdyA8IGxhc3RSb3cpIHtcbiAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgIHNjcmVlblJvd3MgKz0gc3BsaXRzID8gc3BsaXRzLmxlbmd0aCArIDEgOiAxO1xuICAgICAgICByb3crKztcbiAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgIHJvdyA9IGZvbGQuZW5kLnJvdyArIDE7XG4gICAgICAgICAgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyB0b2RvXG4gICAgaWYgKHRoaXMubGluZVdpZGdldHMpIHtcbiAgICAgIHNjcmVlblJvd3MgKz0gdGhpcy4kZ2V0V2lkZ2V0U2NyZWVuTGVuZ3RoKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNjcmVlblJvd3M7XG4gIH1cblxuICAvKipcbiAgICogQHByaXZhdGVcbiAgICovXG4gIHB1YmxpYyAkc2V0Rm9udE1ldHJpY3MoZm0pIHtcbiAgICAvLyB0b2RvXG4gIH1cblxuICBmaW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCBjaHI/OiBzdHJpbmcpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZmluZE1hdGNoaW5nQnJhY2tldChwb3NpdGlvbiwgY2hyKTtcbiAgfVxuXG4gIGdldEJyYWNrZXRSYW5nZShwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSk6IFJhbmdlIHtcbiAgICByZXR1cm4gdGhpcy4kYnJhY2tldE1hdGNoZXIuZ2V0QnJhY2tldFJhbmdlKHBvc2l0aW9uKTtcbiAgfVxuXG4gICRmaW5kT3BlbmluZ0JyYWNrZXQoYnJhY2tldDogc3RyaW5nLCBwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgdHlwZVJlPzogUmVnRXhwKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLiRmaW5kT3BlbmluZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gIH1cblxuICAkZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQ6IHN0cmluZywgcG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHR5cGVSZT86IFJlZ0V4cCk6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci4kZmluZENsb3NpbmdCcmFja2V0KGJyYWNrZXQsIHBvc2l0aW9uLCB0eXBlUmUpO1xuICB9XG4gIHByaXZhdGUgJGZvbGRNb2RlO1xuXG4gIC8vIHN0cnVjdHVyZWQgZm9sZGluZ1xuICAkZm9sZFN0eWxlcyA9IHtcbiAgICBcIm1hbnVhbFwiOiAxLFxuICAgIFwibWFya2JlZ2luXCI6IDEsXG4gICAgXCJtYXJrYmVnaW5lbmRcIjogMVxuICB9XG4gICRmb2xkU3R5bGUgPSBcIm1hcmtiZWdpblwiO1xuICAvKlxuICAgKiBMb29rcyB1cCBhIGZvbGQgYXQgYSBnaXZlbiByb3cvY29sdW1uLiBQb3NzaWJsZSB2YWx1ZXMgZm9yIHNpZGU6XG4gICAqICAgLTE6IGlnbm9yZSBhIGZvbGQgaWYgZm9sZC5zdGFydCA9IHJvdy9jb2x1bW5cbiAgICogICArMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLmVuZCA9IHJvdy9jb2x1bW5cbiAgICovXG4gIGdldEZvbGRBdChyb3c6IG51bWJlciwgY29sdW1uLCBzaWRlPykge1xuICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcbiAgICBpZiAoIWZvbGRMaW5lKVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICB2YXIgZm9sZHMgPSBmb2xkTGluZS5mb2xkcztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgZm9sZCA9IGZvbGRzW2ldO1xuICAgICAgaWYgKGZvbGQucmFuZ2UuY29udGFpbnMocm93LCBjb2x1bW4pKSB7XG4gICAgICAgIGlmIChzaWRlID09IDEgJiYgZm9sZC5yYW5nZS5pc0VuZChyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfSBlbHNlIGlmIChzaWRlID09IC0xICYmIGZvbGQucmFuZ2UuaXNTdGFydChyb3csIGNvbHVtbikpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZm9sZDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKlxuICAgKiBSZXR1cm5zIGFsbCBmb2xkcyBpbiB0aGUgZ2l2ZW4gcmFuZ2UuIE5vdGUsIHRoYXQgdGhpcyB3aWxsIHJldHVybiBmb2xkc1xuICAgKlxuICAgKi9cbiAgZ2V0Rm9sZHNJblJhbmdlKHJhbmdlOiBSYW5nZSkge1xuICAgIHZhciBzdGFydCA9IHJhbmdlLnN0YXJ0O1xuICAgIHZhciBlbmQgPSByYW5nZS5lbmQ7XG4gICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgIHZhciBmb3VuZEZvbGRzOiBGb2xkW10gPSBbXTtcblxuICAgIHN0YXJ0LmNvbHVtbiArPSAxO1xuICAgIGVuZC5jb2x1bW4gLT0gMTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgY21wID0gZm9sZExpbmVzW2ldLnJhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICBpZiAoY21wID09IDIpIHtcbiAgICAgICAgLy8gUmFuZ2UgaXMgYmVmb3JlIGZvbGRMaW5lLiBObyBpbnRlcnNlY3Rpb24uIFRoaXMgbWVhbnMsXG4gICAgICAgIC8vIHRoZXJlIG1pZ2h0IGJlIG90aGVyIGZvbGRMaW5lcyB0aGF0IGludGVyc2VjdC5cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBlbHNlIGlmIChjbXAgPT0gLTIpIHtcbiAgICAgICAgLy8gUmFuZ2UgaXMgYWZ0ZXIgZm9sZExpbmUuIFRoZXJlIGNhbid0IGJlIGFueSBvdGhlciBmb2xkTGluZXMgdGhlbixcbiAgICAgICAgLy8gc28gbGV0J3MgZ2l2ZSB1cC5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lc1tpXS5mb2xkcztcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZm9sZHMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgdmFyIGZvbGQgPSBmb2xkc1tqXTtcbiAgICAgICAgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICBpZiAoY21wID09IC0yKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH0gZWxzZSBpZiAoY21wID09IDIpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfSBlbHNlXG4gICAgICAgICAgLy8gV1RGLXN0YXRlOiBDYW4gaGFwcGVuIGR1ZSB0byAtMS8rMSB0byBzdGFydC9lbmQgY29sdW1uLlxuICAgICAgICAgIGlmIChjbXAgPT0gNDIpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgZm91bmRGb2xkcy5wdXNoKGZvbGQpO1xuICAgICAgfVxuICAgIH1cbiAgICBzdGFydC5jb2x1bW4gLT0gMTtcbiAgICBlbmQuY29sdW1uICs9IDE7XG5cbiAgICByZXR1cm4gZm91bmRGb2xkcztcbiAgfVxuXG4gIGdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2VzKSB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocmFuZ2VzKSkge1xuICAgICAgdmFyIGZvbGRzOiBGb2xkW10gPSBbXTtcbiAgICAgIHJhbmdlcy5mb3JFYWNoKGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgIGZvbGRzID0gZm9sZHMuY29uY2F0KHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKSk7XG4gICAgICB9LCB0aGlzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZXMpO1xuICAgIH1cbiAgICByZXR1cm4gZm9sZHM7XG4gIH1cbiAgICBcbiAgLypcbiAgICogUmV0dXJucyBhbGwgZm9sZHMgaW4gdGhlIGRvY3VtZW50XG4gICAqL1xuICBnZXRBbGxGb2xkcygpIHtcbiAgICB2YXIgZm9sZHMgPSBbXTtcbiAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lcy5sZW5ndGg7IGkrKylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZm9sZExpbmVzW2ldLmZvbGRzLmxlbmd0aDsgaisrKVxuICAgICAgICBmb2xkcy5wdXNoKGZvbGRMaW5lc1tpXS5mb2xkc1tqXSk7XG5cbiAgICByZXR1cm4gZm9sZHM7XG4gIH1cblxuICAvKlxuICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgYmV0d2VlbiBmb2xkcyBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24uXG4gICAqIEUuZy5cbiAgICogIGZvbzxmb2xkPmJ8YXI8Zm9sZD53b2xyZCAtPiBcImJhclwiXG4gICAqICBmb288Zm9sZD5iYXI8Zm9sZD53b2x8cmQgLT4gXCJ3b3JsZFwiXG4gICAqICBmb288Zm9sZD5iYXI8Zm98bGQ+d29scmQgLT4gPG51bGw+XG4gICAqXG4gICAqIHdoZXJlIHwgbWVhbnMgdGhlIHBvc2l0aW9uIG9mIHJvdy9jb2x1bW5cbiAgICpcbiAgICogVGhlIHRyaW0gb3B0aW9uIGRldGVybXMgaWYgdGhlIHJldHVybiBzdHJpbmcgc2hvdWxkIGJlIHRyaW1lZCBhY2NvcmRpbmdcbiAgICogdG8gdGhlIFwic2lkZVwiIHBhc3NlZCB3aXRoIHRoZSB0cmltIHZhbHVlOlxuICAgKlxuICAgKiBFLmcuXG4gICAqICBmb288Zm9sZD5ifGFyPGZvbGQ+d29scmQgLXRyaW09LTE+IFwiYlwiXG4gICAqICBmb288Zm9sZD5iYXI8Zm9sZD53b2x8cmQgLXRyaW09KzE+IFwicmxkXCJcbiAgICogIGZvfG88Zm9sZD5iYXI8Zm9sZD53b2xyZCAtdHJpbT0wMD4gXCJmb29cIlxuICAgKi9cbiAgZ2V0Rm9sZFN0cmluZ0F0KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgdHJpbTogbnVtYmVyLCBmb2xkTGluZT86IEZvbGRMaW5lKSB7XG4gICAgZm9sZExpbmUgPSBmb2xkTGluZSB8fCB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgaWYgKCFmb2xkTGluZSlcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgdmFyIGxhc3RGb2xkID0ge1xuICAgICAgZW5kOiB7IGNvbHVtbjogMCB9XG4gICAgfTtcbiAgICAvLyBUT0RPOiBSZWZhY3RvciB0byB1c2UgZ2V0TmV4dEZvbGRUbyBmdW5jdGlvbi5cbiAgICB2YXIgc3RyOiBzdHJpbmc7XG4gICAgdmFyIGZvbGQ6IEZvbGQ7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZS5mb2xkcy5sZW5ndGg7IGkrKykge1xuICAgICAgZm9sZCA9IGZvbGRMaW5lLmZvbGRzW2ldO1xuICAgICAgdmFyIGNtcCA9IGZvbGQucmFuZ2UuY29tcGFyZUVuZChyb3csIGNvbHVtbik7XG4gICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgIHN0ciA9IHRoaXMuZ2V0TGluZShmb2xkLnN0YXJ0LnJvdykuc3Vic3RyaW5nKGxhc3RGb2xkLmVuZC5jb2x1bW4sIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBlbHNlIGlmIChjbXAgPT09IDApIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgICBsYXN0Rm9sZCA9IGZvbGQ7XG4gICAgfVxuICAgIGlmICghc3RyKVxuICAgICAgc3RyID0gdGhpcy5nZXRMaW5lKGZvbGQuc3RhcnQucm93KS5zdWJzdHJpbmcobGFzdEZvbGQuZW5kLmNvbHVtbik7XG5cbiAgICBpZiAodHJpbSA9PSAtMSlcbiAgICAgIHJldHVybiBzdHIuc3Vic3RyaW5nKDAsIGNvbHVtbiAtIGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuICAgIGVsc2UgaWYgKHRyaW0gPT0gMSlcbiAgICAgIHJldHVybiBzdHIuc3Vic3RyaW5nKGNvbHVtbiAtIGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuICAgIGVsc2VcbiAgICAgIHJldHVybiBzdHI7XG4gIH1cblxuICBnZXRGb2xkTGluZShkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkTGluZT86IEZvbGRMaW5lKTogRm9sZExpbmUge1xuICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgIHZhciBpID0gMDtcbiAgICBpZiAoc3RhcnRGb2xkTGluZSlcbiAgICAgIGkgPSBmb2xkRGF0YS5pbmRleE9mKHN0YXJ0Rm9sZExpbmUpO1xuICAgIGlmIChpID09IC0xKVxuICAgICAgaSA9IDA7XG4gICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cgJiYgZm9sZExpbmUuZW5kLnJvdyA+PSBkb2NSb3cpIHtcbiAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgfSBlbHNlIGlmIChmb2xkTGluZS5lbmQucm93ID4gZG9jUm93KSB7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIC8vIHJldHVybnMgdGhlIGZvbGQgd2hpY2ggc3RhcnRzIGFmdGVyIG9yIGNvbnRhaW5zIGRvY1Jvd1xuICBnZXROZXh0Rm9sZExpbmUoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZExpbmU/OiBGb2xkTGluZSk6IEZvbGRMaW5lIHtcbiAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICB2YXIgaSA9IDA7XG4gICAgaWYgKHN0YXJ0Rm9sZExpbmUpXG4gICAgICBpID0gZm9sZERhdGEuaW5kZXhPZihzdGFydEZvbGRMaW5lKTtcbiAgICBpZiAoaSA9PSAtMSlcbiAgICAgIGkgPSAwO1xuICAgIGZvciAoaTsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgIGlmIChmb2xkTGluZS5lbmQucm93ID49IGRvY1Jvdykge1xuICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgZ2V0Rm9sZGVkUm93Q291bnQoZmlyc3Q6IG51bWJlciwgbGFzdDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICB2YXIgcm93Q291bnQgPSBsYXN0IC0gZmlyc3QgKyAxO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldLFxuICAgICAgICBlbmQgPSBmb2xkTGluZS5lbmQucm93LFxuICAgICAgICBzdGFydCA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgIGlmIChlbmQgPj0gbGFzdCkge1xuICAgICAgICBpZiAoc3RhcnQgPCBsYXN0KSB7XG4gICAgICAgICAgaWYgKHN0YXJ0ID49IGZpcnN0KVxuICAgICAgICAgICAgcm93Q291bnQgLT0gbGFzdCAtIHN0YXJ0O1xuICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJvd0NvdW50ID0gMDsvL2luIG9uZSBmb2xkXG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGVsc2UgaWYgKGVuZCA+PSBmaXJzdCkge1xuICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpIC8vZm9sZCBpbnNpZGUgcmFuZ2VcbiAgICAgICAgICByb3dDb3VudCAtPSBlbmQgLSBzdGFydDtcbiAgICAgICAgZWxzZVxuICAgICAgICAgIHJvd0NvdW50IC09IGVuZCAtIGZpcnN0ICsgMTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJvd0NvdW50O1xuICB9XG5cbiAgJGFkZEZvbGRMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSkge1xuICAgIHRoaXMuJGZvbGREYXRhLnB1c2goZm9sZExpbmUpO1xuICAgIHRoaXMuJGZvbGREYXRhLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgcmV0dXJuIGEuc3RhcnQucm93IC0gYi5zdGFydC5yb3c7XG4gICAgfSk7XG4gICAgcmV0dXJuIGZvbGRMaW5lO1xuICB9XG5cbiAgLyoqXG4gICAqIEFkZHMgYSBuZXcgZm9sZC5cbiAgICpcbiAgICogQHJldHVybnNcbiAgICogICAgICBUaGUgbmV3IGNyZWF0ZWQgRm9sZCBvYmplY3Qgb3IgYW4gZXhpc3RpbmcgZm9sZCBvYmplY3QgaW4gY2FzZSB0aGVcbiAgICogICAgICBwYXNzZWQgaW4gcmFuZ2UgZml0cyBhbiBleGlzdGluZyBmb2xkIGV4YWN0bHkuXG4gICAqL1xuICBhZGRGb2xkKHBsYWNlaG9sZGVyOiBzdHJpbmcgfCBGb2xkLCByYW5nZTogUmFuZ2UpIHtcbiAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICB2YXIgYWRkZWQgPSBmYWxzZTtcbiAgICB2YXIgZm9sZDogRm9sZDtcblxuICAgIGlmIChwbGFjZWhvbGRlciBpbnN0YW5jZW9mIEZvbGQpXG4gICAgICBmb2xkID0gcGxhY2Vob2xkZXI7XG4gICAgZWxzZSB7XG4gICAgICBmb2xkID0gbmV3IEZvbGQocmFuZ2UsIHBsYWNlaG9sZGVyKTtcbiAgICAgIGZvbGQuY29sbGFwc2VDaGlsZHJlbiA9IHJhbmdlLmNvbGxhcHNlQ2hpbGRyZW47XG4gICAgfVxuICAgIC8vIEZJWE1FOiAkY2xpcFJhbmdlVG9Eb2N1bWVudD9cbiAgICAvLyBmb2xkLnJhbmdlID0gdGhpcy5jbGlwUmFuZ2UoZm9sZC5yYW5nZSk7XG4gICAgZm9sZC5yYW5nZSA9IHRoaXMuJGNsaXBSYW5nZVRvRG9jdW1lbnQoZm9sZC5yYW5nZSlcblxuICAgIHZhciBzdGFydFJvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgIHZhciBzdGFydENvbHVtbiA9IGZvbGQuc3RhcnQuY29sdW1uO1xuICAgIHZhciBlbmRSb3cgPSBmb2xkLmVuZC5yb3c7XG4gICAgdmFyIGVuZENvbHVtbiA9IGZvbGQuZW5kLmNvbHVtbjtcblxuICAgIC8vIC0tLSBTb21lIGNoZWNraW5nIC0tLVxuICAgIGlmICghKHN0YXJ0Um93IDwgZW5kUm93IHx8XG4gICAgICBzdGFydFJvdyA9PSBlbmRSb3cgJiYgc3RhcnRDb2x1bW4gPD0gZW5kQ29sdW1uIC0gMikpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgcmFuZ2UgaGFzIHRvIGJlIGF0IGxlYXN0IDIgY2hhcmFjdGVycyB3aWR0aFwiKTtcblxuICAgIHZhciBzdGFydEZvbGQgPSB0aGlzLmdldEZvbGRBdChzdGFydFJvdywgc3RhcnRDb2x1bW4sIDEpO1xuICAgIHZhciBlbmRGb2xkID0gdGhpcy5nZXRGb2xkQXQoZW5kUm93LCBlbmRDb2x1bW4sIC0xKTtcbiAgICBpZiAoc3RhcnRGb2xkICYmIGVuZEZvbGQgPT0gc3RhcnRGb2xkKVxuICAgICAgcmV0dXJuIHN0YXJ0Rm9sZC5hZGRTdWJGb2xkKGZvbGQpO1xuXG4gICAgaWYgKFxuICAgICAgKHN0YXJ0Rm9sZCAmJiAhc3RhcnRGb2xkLnJhbmdlLmlzU3RhcnQoc3RhcnRSb3csIHN0YXJ0Q29sdW1uKSlcbiAgICAgIHx8IChlbmRGb2xkICYmICFlbmRGb2xkLnJhbmdlLmlzRW5kKGVuZFJvdywgZW5kQ29sdW1uKSlcbiAgICApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkEgZm9sZCBjYW4ndCBpbnRlcnNlY3QgYWxyZWFkeSBleGlzdGluZyBmb2xkXCIgKyBmb2xkLnJhbmdlICsgc3RhcnRGb2xkLnJhbmdlKTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgZm9sZHMgaW4gdGhlIHJhbmdlIHdlIGNyZWF0ZSB0aGUgbmV3IGZvbGQgZm9yLlxuICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZvbGQucmFuZ2UpO1xuICAgIGlmIChmb2xkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBSZW1vdmUgdGhlIGZvbGRzIGZyb20gZm9sZCBkYXRhLlxuICAgICAgdGhpcy5yZW1vdmVGb2xkcyhmb2xkcyk7XG4gICAgICAvLyBBZGQgdGhlIHJlbW92ZWQgZm9sZHMgYXMgc3ViZm9sZHMgb24gdGhlIG5ldyBmb2xkLlxuICAgICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihzdWJGb2xkKSB7XG4gICAgICAgIGZvbGQuYWRkU3ViRm9sZChzdWJGb2xkKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgaWYgKGVuZFJvdyA9PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgZm9sZExpbmUuYWRkRm9sZChmb2xkKTtcbiAgICAgICAgYWRkZWQgPSB0cnVlO1xuICAgICAgICBicmVhaztcbiAgICAgIH0gZWxzZSBpZiAoc3RhcnRSb3cgPT0gZm9sZExpbmUuZW5kLnJvdykge1xuICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICBhZGRlZCA9IHRydWU7XG4gICAgICAgIGlmICghZm9sZC5zYW1lUm93KSB7XG4gICAgICAgICAgLy8gQ2hlY2sgaWYgd2UgbWlnaHQgaGF2ZSB0byBtZXJnZSB0d28gRm9sZExpbmVzLlxuICAgICAgICAgIHZhciBmb2xkTGluZU5leHQgPSBmb2xkRGF0YVtpICsgMV07XG4gICAgICAgICAgaWYgKGZvbGRMaW5lTmV4dCAmJiBmb2xkTGluZU5leHQuc3RhcnQucm93ID09IGVuZFJvdykge1xuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtZXJnZSFcbiAgICAgICAgICAgIGZvbGRMaW5lLm1lcmdlKGZvbGRMaW5lTmV4dCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9IGVsc2UgaWYgKGVuZFJvdyA8PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKCFhZGRlZClcbiAgICAgIGZvbGRMaW5lID0gdGhpcy4kYWRkRm9sZExpbmUobmV3IEZvbGRMaW5lKHRoaXMuJGZvbGREYXRhLCBmb2xkKSk7XG5cbiAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShmb2xkTGluZS5zdGFydC5yb3csIGZvbGRMaW5lLnN0YXJ0LnJvdyk7XG4gICAgZWxzZVxuICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZm9sZExpbmUuc3RhcnQucm93LCBmb2xkTGluZS5zdGFydC5yb3cpO1xuXG4gICAgLy8gTm90aWZ5IHRoYXQgZm9sZCBkYXRhIGhhcyBjaGFuZ2VkLlxuICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgdGhpcy5fZW1pdChcImNoYW5nZUZvbGRcIiwgeyBkYXRhOiBmb2xkLCBhY3Rpb246IFwiYWRkXCIgfSk7XG5cbiAgICByZXR1cm4gZm9sZDtcbiAgfVxuXG4gIHNldE1vZGlmaWVkKG1vZGlmaWVkOiBib29sZWFuKSB7XG5cbiAgfVxuXG4gIGFkZEZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgIHRoaXMuYWRkRm9sZChmb2xkKTtcbiAgICB9LCB0aGlzKTtcbiAgfVxuXG4gIHJlbW92ZUZvbGQoZm9sZDogRm9sZCkge1xuICAgIHZhciBmb2xkTGluZSA9IGZvbGQuZm9sZExpbmU7XG4gICAgdmFyIHN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgIHZhciBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuXG4gICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgIC8vIFNpbXBsZSBjYXNlIHdoZXJlIHRoZXJlIGlzIG9ubHkgb25lIGZvbGQgaW4gdGhlIEZvbGRMaW5lIHN1Y2ggdGhhdFxuICAgIC8vIHRoZSBlbnRpcmUgZm9sZCBsaW5lIGNhbiBnZXQgcmVtb3ZlZCBkaXJlY3RseS5cbiAgICBpZiAoZm9sZHMubGVuZ3RoID09IDEpIHtcbiAgICAgIGZvbGRMaW5lcy5zcGxpY2UoZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpLCAxKTtcbiAgICB9IGVsc2VcbiAgICAgIC8vIElmIHRoZSBmb2xkIGlzIHRoZSBsYXN0IGZvbGQgb2YgdGhlIGZvbGRMaW5lLCBqdXN0IHJlbW92ZSBpdC5cbiAgICAgIGlmIChmb2xkTGluZS5yYW5nZS5pc0VuZChmb2xkLmVuZC5yb3csIGZvbGQuZW5kLmNvbHVtbikpIHtcbiAgICAgICAgZm9sZHMucG9wKCk7XG4gICAgICAgIGZvbGRMaW5lLmVuZC5yb3cgPSBmb2xkc1tmb2xkcy5sZW5ndGggLSAxXS5lbmQucm93O1xuICAgICAgICBmb2xkTGluZS5lbmQuY29sdW1uID0gZm9sZHNbZm9sZHMubGVuZ3RoIC0gMV0uZW5kLmNvbHVtbjtcbiAgICAgIH0gZWxzZVxuICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgZmlyc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICBpZiAoZm9sZExpbmUucmFuZ2UuaXNTdGFydChmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pKSB7XG4gICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICBmb2xkTGluZS5zdGFydC5yb3cgPSBmb2xkc1swXS5zdGFydC5yb3c7XG4gICAgICAgICAgZm9sZExpbmUuc3RhcnQuY29sdW1uID0gZm9sZHNbMF0uc3RhcnQuY29sdW1uO1xuICAgICAgICB9IGVsc2VcbiAgICAgICAgICAvLyBXZSBrbm93IHRoZXJlIGFyZSBtb3JlIHRoZW4gMiBmb2xkcyBhbmQgdGhlIGZvbGQgaXMgbm90IGF0IHRoZSBlZGdlLlxuICAgICAgICAgIC8vIFRoaXMgbWVhbnMsIHRoZSBmb2xkIGlzIHNvbWV3aGVyZSBpbiBiZXR3ZWVuLlxuICAgICAgICAgIC8vXG4gICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgaW4gb25lIHJvdywgd2UganVzdCBjYW4gcmVtb3ZlIGl0LlxuICAgICAgICAgIGlmIChmb2xkLnNhbWVSb3cpIHtcbiAgICAgICAgICAgIGZvbGRzLnNwbGljZShmb2xkcy5pbmRleE9mKGZvbGQpLCAxKTtcbiAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAvLyBUaGUgZm9sZCBnb2VzIG92ZXIgbW9yZSB0aGVuIG9uZSByb3cuIFRoaXMgbWVhbnMgcmVtdm9pbmcgdGhpcyBmb2xkXG4gICAgICAgICAgLy8gd2lsbCBjYXVzZSB0aGUgZm9sZCBsaW5lIHRvIGdldCBzcGxpdHRlZCB1cC4gbmV3Rm9sZExpbmUgaXMgdGhlIHNlY29uZCBwYXJ0XG4gICAgICAgICAge1xuICAgICAgICAgICAgdmFyIG5ld0ZvbGRMaW5lID0gZm9sZExpbmUuc3BsaXQoZm9sZC5zdGFydC5yb3csIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRzID0gbmV3Rm9sZExpbmUuZm9sZHM7XG4gICAgICAgICAgICBmb2xkcy5zaGlmdCgpO1xuICAgICAgICAgICAgbmV3Rm9sZExpbmUuc3RhcnQucm93ID0gZm9sZHNbMF0uc3RhcnQucm93O1xuICAgICAgICAgICAgbmV3Rm9sZExpbmUuc3RhcnQuY29sdW1uID0gZm9sZHNbMF0uc3RhcnQuY29sdW1uO1xuICAgICAgICAgIH1cblxuICAgIGlmICghdGhpcy4kdXBkYXRpbmcpIHtcbiAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoc3RhcnRSb3csIGVuZFJvdyk7XG4gICAgICBlbHNlXG4gICAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKHN0YXJ0Um93LCBlbmRSb3cpO1xuICAgIH1cbiAgICAgICAgXG4gICAgLy8gTm90aWZ5IHRoYXQgZm9sZCBkYXRhIGhhcyBjaGFuZ2VkLlxuICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgdGhpcy5fZW1pdChcImNoYW5nZUZvbGRcIiwgeyBkYXRhOiBmb2xkLCBhY3Rpb246IFwicmVtb3ZlXCIgfSk7XG4gIH1cblxuICByZW1vdmVGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgLy8gV2UgbmVlZCB0byBjbG9uZSB0aGUgZm9sZHMgYXJyYXkgcGFzc2VkIGluIGFzIGl0IG1pZ2h0IGJlIHRoZSBmb2xkc1xuICAgIC8vIGFycmF5IG9mIGEgZm9sZCBsaW5lIGFuZCBhcyB3ZSBjYWxsIHRoaXMucmVtb3ZlRm9sZChmb2xkKSwgZm9sZHNcbiAgICAvLyBhcmUgcmVtb3ZlZCBmcm9tIGZvbGRzIGFuZCBjaGFuZ2VzIHRoZSBjdXJyZW50IGluZGV4LlxuICAgIHZhciBjbG9uZUZvbGRzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkcy5sZW5ndGg7IGkrKykge1xuICAgICAgY2xvbmVGb2xkcy5wdXNoKGZvbGRzW2ldKTtcbiAgICB9XG5cbiAgICBjbG9uZUZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgIH0sIHRoaXMpO1xuICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gIH1cblxuICBleHBhbmRGb2xkKGZvbGQ6IEZvbGQpIHtcbiAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgZm9sZC5zdWJGb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgIGZvbGQucmVzdG9yZVJhbmdlKHN1YkZvbGQpO1xuICAgICAgdGhpcy5hZGRGb2xkKHN1YkZvbGQpO1xuICAgIH0sIHRoaXMpO1xuICAgIGlmIChmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPiAwKSB7XG4gICAgICB0aGlzLmZvbGRBbGwoZm9sZC5zdGFydC5yb3cgKyAxLCBmb2xkLmVuZC5yb3csIGZvbGQuY29sbGFwc2VDaGlsZHJlbiAtIDEpO1xuICAgIH1cbiAgICBmb2xkLnN1YkZvbGRzID0gW107XG4gIH1cblxuICBleHBhbmRGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgfSwgdGhpcyk7XG4gIH1cblxuICB1bmZvbGQobG9jYXRpb24/LCBleHBhbmRJbm5lcj8pIHtcbiAgICB2YXIgcmFuZ2UsIGZvbGRzO1xuICAgIGlmIChsb2NhdGlvbiA9PSBudWxsKSB7XG4gICAgICByYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCB0aGlzLmdldExlbmd0aCgpLCAwKTtcbiAgICAgIGV4cGFuZElubmVyID0gdHJ1ZTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBsb2NhdGlvbiA9PSBcIm51bWJlclwiKVxuICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UobG9jYXRpb24sIDAsIGxvY2F0aW9uLCB0aGlzLmdldExpbmUobG9jYXRpb24pLmxlbmd0aCk7XG4gICAgZWxzZSBpZiAoXCJyb3dcIiBpbiBsb2NhdGlvbilcbiAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhsb2NhdGlvbiwgbG9jYXRpb24pO1xuICAgIGVsc2VcbiAgICAgIHJhbmdlID0gbG9jYXRpb247XG5cbiAgICBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgaWYgKGV4cGFuZElubmVyKSB7XG4gICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHN1YkZvbGRzID0gZm9sZHM7XG4gICAgICAvLyBUT0RPOiBtaWdodCBiZSBiZXR0ZXIgdG8gcmVtb3ZlIGFuZCBhZGQgZm9sZHMgaW4gb25lIGdvIGluc3RlYWQgb2YgdXNpbmdcbiAgICAgIC8vIGV4cGFuZEZvbGRzIHNldmVyYWwgdGltZXMuXG4gICAgICB3aGlsZSAoc3ViRm9sZHMubGVuZ3RoKSB7XG4gICAgICAgIHRoaXMuZXhwYW5kRm9sZHMoc3ViRm9sZHMpO1xuICAgICAgICBzdWJGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChmb2xkcy5sZW5ndGgpXG4gICAgICByZXR1cm4gZm9sZHM7XG4gIH1cblxuICAvKlxuICAgKiBDaGVja3MgaWYgYSBnaXZlbiBkb2N1bWVudFJvdyBpcyBmb2xkZWQuIFRoaXMgaXMgdHJ1ZSBpZiB0aGVyZSBhcmUgc29tZVxuICAgKiBmb2xkZWQgcGFydHMgc3VjaCB0aGF0IHNvbWUgcGFydHMgb2YgdGhlIGxpbmUgaXMgc3RpbGwgdmlzaWJsZS5cbiAgICoqL1xuICBpc1Jvd0ZvbGRlZChkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkUm93OiBGb2xkTGluZSk6IGJvb2xlYW4ge1xuICAgIHJldHVybiAhIXRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICB9XG5cbiAgZ2V0Um93Rm9sZEVuZChkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkUm93PzogRm9sZExpbmUpOiBudW1iZXIge1xuICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLmVuZC5yb3cgOiBkb2NSb3c7XG4gIH1cblxuICBnZXRSb3dGb2xkU3RhcnQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdz86IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGRvY1Jvdywgc3RhcnRGb2xkUm93KTtcbiAgICByZXR1cm4gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBkb2NSb3c7XG4gIH1cblxuICBnZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmU6IEZvbGRMaW5lLCBlbmRSb3c/OiBudW1iZXIsIGVuZENvbHVtbj86IG51bWJlciwgc3RhcnRSb3c/OiBudW1iZXIsIHN0YXJ0Q29sdW1uPzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICBpZiAoc3RhcnRSb3cgPT0gbnVsbClcbiAgICAgIHN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgIGlmIChzdGFydENvbHVtbiA9PSBudWxsKVxuICAgICAgc3RhcnRDb2x1bW4gPSAwO1xuICAgIGlmIChlbmRSb3cgPT0gbnVsbClcbiAgICAgIGVuZFJvdyA9IGZvbGRMaW5lLmVuZC5yb3c7XG4gICAgaWYgKGVuZENvbHVtbiA9PSBudWxsKVxuICAgICAgZW5kQ29sdW1uID0gdGhpcy5nZXRMaW5lKGVuZFJvdykubGVuZ3RoO1xuICAgICAgICBcblxuICAgIC8vIEJ1aWxkIHRoZSB0ZXh0bGluZSB1c2luZyB0aGUgRm9sZExpbmUgd2Fsa2VyLlxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB2YXIgdGV4dExpbmUgPSBcIlwiO1xuXG4gICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlcjogc3RyaW5nLCByb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGxhc3RDb2x1bW46IG51bWJlcikge1xuICAgICAgaWYgKHJvdyA8IHN0YXJ0Um93KVxuICAgICAgICByZXR1cm47XG4gICAgICBpZiAocm93ID09IHN0YXJ0Um93KSB7XG4gICAgICAgIGlmIChjb2x1bW4gPCBzdGFydENvbHVtbilcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIGxhc3RDb2x1bW4gPSBNYXRoLm1heChzdGFydENvbHVtbiwgbGFzdENvbHVtbik7XG4gICAgICB9XG5cbiAgICAgIGlmIChwbGFjZWhvbGRlciAhPSBudWxsKSB7XG4gICAgICAgIHRleHRMaW5lICs9IHBsYWNlaG9sZGVyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dExpbmUgKz0gc2VsZi5nZXRMaW5lKHJvdykuc3Vic3RyaW5nKGxhc3RDb2x1bW4sIGNvbHVtbik7XG4gICAgICB9XG4gICAgfSwgZW5kUm93LCBlbmRDb2x1bW4pO1xuICAgIHJldHVybiB0ZXh0TGluZTtcbiAgfVxuXG4gIGdldERpc3BsYXlMaW5lKHJvdzogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgc3RhcnRSb3c6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlcik6IHN0cmluZyB7XG4gICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuXG4gICAgaWYgKCFmb2xkTGluZSkge1xuICAgICAgdmFyIGxpbmU6IHN0cmluZztcbiAgICAgIGxpbmUgPSB0aGlzLmdldExpbmUocm93KTtcbiAgICAgIHJldHVybiBsaW5lLnN1YnN0cmluZyhzdGFydENvbHVtbiB8fCAwLCBlbmRDb2x1bW4gfHwgbGluZS5sZW5ndGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoXG4gICAgICAgIGZvbGRMaW5lLCByb3csIGVuZENvbHVtbiwgc3RhcnRSb3csIHN0YXJ0Q29sdW1uKTtcbiAgICB9XG4gIH1cblxuICAkY2xvbmVGb2xkRGF0YSgpIHtcbiAgICB2YXIgZmQgPSBbXTtcbiAgICBmZCA9IHRoaXMuJGZvbGREYXRhLm1hcChmdW5jdGlvbihmb2xkTGluZSkge1xuICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmUuZm9sZHMubWFwKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgcmV0dXJuIGZvbGQuY2xvbmUoKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIG5ldyBGb2xkTGluZShmZCwgZm9sZHMpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIGZkO1xuICB9XG5cbiAgdG9nZ2xlRm9sZCh0cnlUb1VuZm9sZCkge1xuICAgIHZhciBzZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbjtcbiAgICB2YXIgcmFuZ2U6IFJhbmdlID0gc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgdmFyIGZvbGQ7XG4gICAgdmFyIGJyYWNrZXRQb3M7XG5cbiAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICB2YXIgY3Vyc29yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfSBlbHNlIGlmIChicmFja2V0UG9zID0gdGhpcy5maW5kTWF0Y2hpbmdCcmFja2V0KGN1cnNvcikpIHtcbiAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PSAxKSB7XG4gICAgICAgICAgcmFuZ2UuZW5kID0gYnJhY2tldFBvcztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uKys7XG4gICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbi0tO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGJyYWNrZXRQb3MgPSB0aGlzLmZpbmRNYXRjaGluZ0JyYWNrZXQoeyByb3c6IGN1cnNvci5yb3csIGNvbHVtbjogY3Vyc29yLmNvbHVtbiArIDEgfSkpIHtcbiAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PT0gMSlcbiAgICAgICAgICByYW5nZS5lbmQgPSBicmFja2V0UG9zO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgcmFuZ2Uuc3RhcnQgPSBicmFja2V0UG9zO1xuXG4gICAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbisrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmFuZ2UgPSB0aGlzLmdldENvbW1lbnRGb2xkUmFuZ2UoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbikgfHwgcmFuZ2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKTtcbiAgICAgIGlmICh0cnlUb1VuZm9sZCAmJiBmb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5leHBhbmRGb2xkcyhmb2xkcyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH0gZWxzZSBpZiAoZm9sZHMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgZm9sZCA9IGZvbGRzWzBdO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghZm9sZClcbiAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG5cbiAgICBpZiAoZm9sZCAmJiBmb2xkLnJhbmdlLnRvU3RyaW5nKCkgPT0gcmFuZ2UudG9TdHJpbmcoKSkge1xuICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBwbGFjZWhvbGRlciA9IFwiLi4uXCI7XG4gICAgaWYgKCFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICBwbGFjZWhvbGRlciA9IHRoaXMuZ2V0VGV4dFJhbmdlKHJhbmdlKTtcbiAgICAgIGlmIChwbGFjZWhvbGRlci5sZW5ndGggPCA0KVxuICAgICAgICByZXR1cm47XG4gICAgICBwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyLnRyaW0oKS5zdWJzdHJpbmcoMCwgMikgKyBcIi4uXCI7XG4gICAgfVxuXG4gICAgdGhpcy5hZGRGb2xkKHBsYWNlaG9sZGVyLCByYW5nZSk7XG4gIH1cblxuICBnZXRDb21tZW50Rm9sZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgZGlyPzogbnVtYmVyKTogUmFuZ2Uge1xuICAgIHZhciBpdGVyYXRvciA9IG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMsIHJvdywgY29sdW1uKTtcbiAgICB2YXIgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcbiAgICBpZiAodG9rZW4gJiYgL15jb21tZW50fHN0cmluZy8udGVzdCh0b2tlbi50eXBlKSkge1xuICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cCh0b2tlbi50eXBlLnJlcGxhY2UoL1xcLi4qLywgXCJcXFxcLlwiKSk7XG4gICAgICBpZiAoZGlyICE9IDEpIHtcbiAgICAgICAgZG8ge1xuICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG4gICAgICAgIH0gd2hpbGUgKHRva2VuICYmIHJlLnRlc3QodG9rZW4udHlwZSkpO1xuICAgICAgICBpdGVyYXRvci5zdGVwRm9yd2FyZCgpO1xuICAgICAgfVxuXG4gICAgICByYW5nZS5zdGFydC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgIHJhbmdlLnN0YXJ0LmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgMjtcblxuICAgICAgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG5cbiAgICAgIGlmIChkaXIgIT0gLTEpIHtcbiAgICAgICAgZG8ge1xuICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG4gICAgICB9IGVsc2VcbiAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW4oKTtcblxuICAgICAgcmFuZ2UuZW5kLnJvdyA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlblJvdygpO1xuICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbkNvbHVtbigpICsgdG9rZW4udmFsdWUubGVuZ3RoIC0gMjtcbiAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG4gIH1cblxuICBmb2xkQWxsKHN0YXJ0Um93OiBudW1iZXIsIGVuZFJvdzogbnVtYmVyLCBkZXB0aDogbnVtYmVyKSB7XG4gICAgaWYgKGRlcHRoID09IHVuZGVmaW5lZClcbiAgICAgIGRlcHRoID0gMTAwMDAwOyAvLyBKU09OLnN0cmluZ2lmeSBkb2Vzbid0IGhhbmxlIEluZmluaXR5XG4gICAgdmFyIGZvbGRXaWRnZXRzID0gdGhpcy5mb2xkV2lkZ2V0cztcbiAgICBpZiAoIWZvbGRXaWRnZXRzKVxuICAgICAgcmV0dXJuOyAvLyBtb2RlIGRvZXNuJ3Qgc3VwcG9ydCBmb2xkaW5nXG4gICAgZW5kUm93ID0gZW5kUm93IHx8IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgc3RhcnRSb3cgPSBzdGFydFJvdyB8fCAwO1xuICAgIGZvciAodmFyIHJvdyA9IHN0YXJ0Um93OyByb3cgPCBlbmRSb3c7IHJvdysrKSB7XG4gICAgICBpZiAoZm9sZFdpZGdldHNbcm93XSA9PSBudWxsKVxuICAgICAgICBmb2xkV2lkZ2V0c1tyb3ddID0gdGhpcy5nZXRGb2xkV2lkZ2V0KHJvdyk7XG4gICAgICBpZiAoZm9sZFdpZGdldHNbcm93XSAhPSBcInN0YXJ0XCIpXG4gICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShyb3cpO1xuICAgICAgLy8gc29tZXRpbWVzIHJhbmdlIGNhbiBiZSBpbmNvbXBhdGlibGUgd2l0aCBleGlzdGluZyBmb2xkXG4gICAgICAvLyBUT0RPIGNoYW5nZSBhZGRGb2xkIHRvIHJldHVybiBudWxsIGlzdGVhZCBvZiB0aHJvd2luZ1xuICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmlzTXVsdGlMaW5lKClcbiAgICAgICAgJiYgcmFuZ2UuZW5kLnJvdyA8PSBlbmRSb3dcbiAgICAgICAgJiYgcmFuZ2Uuc3RhcnQucm93ID49IHN0YXJ0Um93XG4gICAgICApIHtcbiAgICAgICAgcm93ID0gcmFuZ2UuZW5kLnJvdztcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvLyBhZGRGb2xkIGNhbiBjaGFuZ2UgdGhlIHJhbmdlXG4gICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgICAgICAgIGlmIChmb2xkKVxuICAgICAgICAgICAgZm9sZC5jb2xsYXBzZUNoaWxkcmVuID0gZGVwdGg7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHsgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHNldEZvbGRTdHlsZShzdHlsZTogc3RyaW5nKSB7XG4gICAgaWYgKCF0aGlzLiRmb2xkU3R5bGVzW3N0eWxlXSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgZm9sZCBzdHlsZTogXCIgKyBzdHlsZSArIFwiW1wiICsgT2JqZWN0LmtleXModGhpcy4kZm9sZFN0eWxlcykuam9pbihcIiwgXCIpICsgXCJdXCIpO1xuXG4gICAgaWYgKHRoaXMuJGZvbGRTdHlsZSA9PT0gc3R5bGUpXG4gICAgICByZXR1cm47XG5cbiAgICB0aGlzLiRmb2xkU3R5bGUgPSBzdHlsZTtcblxuICAgIGlmIChzdHlsZSA9PT0gXCJtYW51YWxcIilcbiAgICAgIHRoaXMudW5mb2xkKCk7XG4gICAgICAgIFxuICAgIC8vIHJlc2V0IGZvbGRpbmdcbiAgICB2YXIgbW9kZSA9IHRoaXMuJGZvbGRNb2RlO1xuICAgIHRoaXMuJHNldEZvbGRpbmcobnVsbCk7XG4gICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlKTtcbiAgfVxuXG4gICRzZXRGb2xkaW5nKGZvbGRNb2RlKSB7XG4gICAgaWYgKHRoaXMuJGZvbGRNb2RlID09IGZvbGRNb2RlKVxuICAgICAgcmV0dXJuO1xuXG4gICAgdGhpcy4kZm9sZE1vZGUgPSBmb2xkTW9kZTtcblxuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIoJ2NoYW5nZScsIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzKTtcbiAgICB0aGlzLl9lbWl0KFwiY2hhbmdlQW5ub3RhdGlvblwiKTtcblxuICAgIGlmICghZm9sZE1vZGUgfHwgdGhpcy4kZm9sZFN0eWxlID09IFwibWFudWFsXCIpIHtcbiAgICAgIHRoaXMuZm9sZFdpZGdldHMgPSBudWxsO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuZm9sZFdpZGdldHMgPSBbXTtcbiAgICB0aGlzLmdldEZvbGRXaWRnZXQgPSBmb2xkTW9kZS5nZXRGb2xkV2lkZ2V0LmJpbmQoZm9sZE1vZGUsIHRoaXMsIHRoaXMuJGZvbGRTdHlsZSk7XG4gICAgdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2UgPSBmb2xkTW9kZS5nZXRGb2xkV2lkZ2V0UmFuZ2UuYmluZChmb2xkTW9kZSwgdGhpcywgdGhpcy4kZm9sZFN0eWxlKTtcblxuICAgIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzID0gdGhpcy51cGRhdGVGb2xkV2lkZ2V0cy5iaW5kKHRoaXMpO1xuICAgIHRoaXMub24oJ2NoYW5nZScsIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzKTtcblxuICB9XG5cbiAgZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YShyb3c6IG51bWJlciwgaWdub3JlQ3VycmVudD86IGJvb2xlYW4pOiB7IHJhbmdlPzogUmFuZ2U7IGZpcnN0UmFuZ2U/OiBSYW5nZSB9IHtcbiAgICB2YXIgZncgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgIGlmICghZncgfHwgKGlnbm9yZUN1cnJlbnQgJiYgZndbcm93XSkpIHtcbiAgICAgIHJldHVybiB7fTtcbiAgICB9XG5cbiAgICB2YXIgaSA9IHJvdyAtIDE7XG4gICAgdmFyIGZpcnN0UmFuZ2U6IFJhbmdlO1xuICAgIHdoaWxlIChpID49IDApIHtcbiAgICAgIHZhciBjID0gZndbaV07XG4gICAgICBpZiAoYyA9PSBudWxsKVxuICAgICAgICBjID0gZndbaV0gPSB0aGlzLmdldEZvbGRXaWRnZXQoaSk7XG5cbiAgICAgIGlmIChjID09IFwic3RhcnRcIikge1xuICAgICAgICB2YXIgcmFuZ2UgPSB0aGlzLmdldEZvbGRXaWRnZXRSYW5nZShpKTtcbiAgICAgICAgaWYgKCFmaXJzdFJhbmdlKVxuICAgICAgICAgIGZpcnN0UmFuZ2UgPSByYW5nZTtcbiAgICAgICAgaWYgKHJhbmdlICYmIHJhbmdlLmVuZC5yb3cgPj0gcm93KVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaS0tO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICByYW5nZTogaSAhPT0gLTEgJiYgcmFuZ2UsXG4gICAgICBmaXJzdFJhbmdlOiBmaXJzdFJhbmdlXG4gICAgfTtcbiAgfVxuXG4gIG9uRm9sZFdpZGdldENsaWNrKHJvdywgZSkge1xuICAgIGUgPSBlLmRvbUV2ZW50O1xuICAgIHZhciBvcHRpb25zID0ge1xuICAgICAgY2hpbGRyZW46IGUuc2hpZnRLZXksXG4gICAgICBhbGw6IGUuY3RybEtleSB8fCBlLm1ldGFLZXksXG4gICAgICBzaWJsaW5nczogZS5hbHRLZXlcbiAgICB9O1xuXG4gICAgdmFyIHJhbmdlID0gdGhpcy4kdG9nZ2xlRm9sZFdpZGdldChyb3csIG9wdGlvbnMpO1xuICAgIGlmICghcmFuZ2UpIHtcbiAgICAgIHZhciBlbCA9IChlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQpXG4gICAgICBpZiAoZWwgJiYgL2FjZV9mb2xkLXdpZGdldC8udGVzdChlbC5jbGFzc05hbWUpKVxuICAgICAgICBlbC5jbGFzc05hbWUgKz0gXCIgYWNlX2ludmFsaWRcIjtcbiAgICB9XG4gIH1cblxuICAkdG9nZ2xlRm9sZFdpZGdldChyb3csIG9wdGlvbnMpOiBSYW5nZSB7XG4gICAgaWYgKCF0aGlzLmdldEZvbGRXaWRnZXQpXG4gICAgICByZXR1cm47XG4gICAgdmFyIHR5cGUgPSB0aGlzLmdldEZvbGRXaWRnZXQocm93KTtcbiAgICB2YXIgbGluZSA9IHRoaXMuZ2V0TGluZShyb3cpO1xuXG4gICAgdmFyIGRpciA9IHR5cGUgPT09IFwiZW5kXCIgPyAtMSA6IDE7XG4gICAgdmFyIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyb3csIGRpciA9PT0gLTEgPyAwIDogbGluZS5sZW5ndGgsIGRpcik7XG5cbiAgICBpZiAoZm9sZCkge1xuICAgICAgaWYgKG9wdGlvbnMuY2hpbGRyZW4gfHwgb3B0aW9ucy5hbGwpXG4gICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgIGVsc2VcbiAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKHJvdywgdHJ1ZSk7XG4gICAgLy8gc29tZXRpbWVzIHNpbmdsZWxpbmUgZm9sZHMgY2FuIGJlIG1pc3NlZCBieSB0aGUgY29kZSBhYm92ZVxuICAgIGlmIChyYW5nZSAmJiAhcmFuZ2UuaXNNdWx0aUxpbmUoKSkge1xuICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uLCAxKTtcbiAgICAgIGlmIChmb2xkICYmIHJhbmdlLmlzRXF1YWwoZm9sZC5yYW5nZSkpIHtcbiAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKG9wdGlvbnMuc2libGluZ3MpIHtcbiAgICAgIHZhciBkYXRhID0gdGhpcy5nZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdyk7XG4gICAgICBpZiAoZGF0YS5yYW5nZSkge1xuICAgICAgICB2YXIgc3RhcnRSb3cgPSBkYXRhLnJhbmdlLnN0YXJ0LnJvdyArIDE7XG4gICAgICAgIHZhciBlbmRSb3cgPSBkYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICB9XG4gICAgICB0aGlzLmZvbGRBbGwoc3RhcnRSb3csIGVuZFJvdywgb3B0aW9ucy5hbGwgPyAxMDAwMCA6IDApO1xuICAgIH1cbiAgICBlbHNlIGlmIChvcHRpb25zLmNoaWxkcmVuKSB7XG4gICAgICBlbmRSb3cgPSByYW5nZSA/IHJhbmdlLmVuZC5yb3cgOiB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgdGhpcy5mb2xkQWxsKHJvdyArIDEsIHJhbmdlLmVuZC5yb3csIG9wdGlvbnMuYWxsID8gMTAwMDAgOiAwKTtcbiAgICB9XG4gICAgZWxzZSBpZiAocmFuZ2UpIHtcbiAgICAgIGlmIChvcHRpb25zLmFsbCkge1xuICAgICAgICAvLyBUaGlzIGlzIGEgYml0IHVnbHksIGJ1dCBpdCBjb3JyZXNwb25kcyB0byBzb21lIGNvZGUgZWxzZXdoZXJlLlxuICAgICAgICByYW5nZS5jb2xsYXBzZUNoaWxkcmVuID0gMTAwMDA7XG4gICAgICB9XG4gICAgICB0aGlzLmFkZEZvbGQoXCIuLi5cIiwgcmFuZ2UpO1xuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfVxuXG5cblxuICB0b2dnbGVGb2xkV2lkZ2V0KHRvZ2dsZVBhcmVudCkge1xuICAgIHZhciByb3c6IG51bWJlciA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLnJvdztcbiAgICByb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChyb3cpO1xuICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCB7fSk7XG5cbiAgICBpZiAocmFuZ2UpXG4gICAgICByZXR1cm47XG4gICAgLy8gaGFuZGxlIHRvZ2dsZVBhcmVudFxuICAgIHZhciBkYXRhID0gdGhpcy5nZXRQYXJlbnRGb2xkUmFuZ2VEYXRhKHJvdywgdHJ1ZSk7XG4gICAgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGRhdGEuZmlyc3RSYW5nZTtcblxuICAgIGlmIChyYW5nZSkge1xuICAgICAgcm93ID0gcmFuZ2Uuc3RhcnQucm93O1xuICAgICAgdmFyIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyb3csIHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aCwgMSk7XG5cbiAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlRm9sZFdpZGdldHMoZTogeyBkYXRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSB9KTogdm9pZCB7XG4gICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgIHZhciByYW5nZSA9IGRlbHRhLnJhbmdlO1xuICAgIHZhciBmaXJzdFJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICB2YXIgbGVuID0gcmFuZ2UuZW5kLnJvdyAtIGZpcnN0Um93O1xuXG4gICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgdGhpcy5mb2xkV2lkZ2V0c1tmaXJzdFJvd10gPSBudWxsO1xuICAgIH1cbiAgICBlbHNlIGlmIChkZWx0YS5hY3Rpb24gPT0gXCJyZW1vdmVUZXh0XCIgfHwgZGVsdGEuYWN0aW9uID09IFwicmVtb3ZlTGluZXNcIikge1xuICAgICAgdGhpcy5mb2xkV2lkZ2V0cy5zcGxpY2UoZmlyc3RSb3csIGxlbiArIDEsIG51bGwpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuICsgMSk7XG4gICAgICBhcmdzLnVuc2hpZnQoZmlyc3RSb3csIDEpO1xuICAgICAgdGhpcy5mb2xkV2lkZ2V0cy5zcGxpY2UuYXBwbHkodGhpcy5mb2xkV2lkZ2V0cywgYXJncyk7XG4gICAgfVxuICB9XG59XG5cbi8vIEZJWE1FOiBSZXN0b3JlXG4vLyBGb2xkaW5nLmNhbGwoRWRpdFNlc3Npb24ucHJvdG90eXBlKTtcblxuZGVmaW5lT3B0aW9ucyhFZGl0U2Vzc2lvbi5wcm90b3R5cGUsIFwic2Vzc2lvblwiLCB7XG4gIHdyYXA6IHtcbiAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAoIXZhbHVlIHx8IHZhbHVlID09IFwib2ZmXCIpXG4gICAgICAgIHZhbHVlID0gZmFsc2U7XG4gICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcImZyZWVcIilcbiAgICAgICAgdmFsdWUgPSB0cnVlO1xuICAgICAgZWxzZSBpZiAodmFsdWUgPT0gXCJwcmludE1hcmdpblwiKVxuICAgICAgICB2YWx1ZSA9IC0xO1xuICAgICAgZWxzZSBpZiAodHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIpXG4gICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKSB8fCBmYWxzZTtcblxuICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gdmFsdWUpXG4gICAgICAgIHJldHVybjtcbiAgICAgIGlmICghdmFsdWUpIHtcbiAgICAgICAgdGhpcy5zZXRVc2VXcmFwTW9kZShmYWxzZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgY29sID0gdHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIgPyB2YWx1ZSA6IG51bGw7XG4gICAgICAgIHRoaXMuc2V0V3JhcExpbWl0UmFuZ2UoY29sLCBjb2wpO1xuICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKHRydWUpO1xuICAgICAgfVxuICAgICAgdGhpcy4kd3JhcCA9IHZhbHVlO1xuICAgIH0sXG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICh0aGlzLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gLTEpXG4gICAgICAgICAgcmV0dXJuIFwicHJpbnRNYXJnaW5cIjtcbiAgICAgICAgaWYgKCF0aGlzLmdldFdyYXBMaW1pdFJhbmdlKCkubWluKVxuICAgICAgICAgIHJldHVybiBcImZyZWVcIjtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXA7XG4gICAgICB9XG4gICAgICByZXR1cm4gXCJvZmZcIjtcbiAgICB9LFxuICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgfSxcbiAgd3JhcE1ldGhvZDoge1xuICAgIC8vIGNvZGV8dGV4dHxhdXRvXG4gICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgIHZhbCA9IHZhbCA9PSBcImF1dG9cIlxuICAgICAgICA/IHRoaXMuJG1vZGUudHlwZSAhPSBcInRleHRcIlxuICAgICAgICA6IHZhbCAhPSBcInRleHRcIjtcbiAgICAgIGlmICh2YWwgIT0gdGhpcy4kd3JhcEFzQ29kZSkge1xuICAgICAgICB0aGlzLiR3cmFwQXNDb2RlID0gdmFsO1xuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICAgIGluaXRpYWxWYWx1ZTogXCJhdXRvXCJcbiAgfSxcbiAgZmlyc3RMaW5lTnVtYmVyOiB7XG4gICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiKTsgfSxcbiAgICBpbml0aWFsVmFsdWU6IDFcbiAgfSxcbiAgdXNlV29ya2VyOiB7XG4gICAgc2V0OiBmdW5jdGlvbih1c2VXb3JrZXIpIHtcbiAgICAgIHRoaXMuJHVzZVdvcmtlciA9IHVzZVdvcmtlcjtcblxuICAgICAgdGhpcy4kc3RvcFdvcmtlcigpO1xuICAgICAgaWYgKHVzZVdvcmtlcilcbiAgICAgICAgdGhpcy4kc3RhcnRXb3JrZXIoKTtcbiAgICB9LFxuICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICB9LFxuICB1c2VTb2Z0VGFiczogeyBpbml0aWFsVmFsdWU6IHRydWUgfSxcbiAgdGFiU2l6ZToge1xuICAgIHNldDogZnVuY3Rpb24odGFiU2l6ZSkge1xuICAgICAgaWYgKGlzTmFOKHRhYlNpemUpIHx8IHRoaXMuJHRhYlNpemUgPT09IHRhYlNpemUpIHJldHVybjtcblxuICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGUgPSBbXTtcbiAgICAgIHRoaXMuJHRhYlNpemUgPSB0YWJTaXplO1xuICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlVGFiU2l6ZVwiKTtcbiAgICB9LFxuICAgIGluaXRpYWxWYWx1ZTogNCxcbiAgICBoYW5kbGVzU2V0OiB0cnVlXG4gIH0sXG4gIG92ZXJ3cml0ZToge1xuICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuX3NpZ25hbChcImNoYW5nZU92ZXJ3cml0ZVwiKTsgfSxcbiAgICBpbml0aWFsVmFsdWU6IGZhbHNlXG4gIH0sXG4gIG5ld0xpbmVNb2RlOiB7XG4gICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUodmFsKSB9LFxuICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpIH0sXG4gICAgaGFuZGxlc1NldDogdHJ1ZVxuICB9LFxuICBtb2RlOiB7XG4gICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5zZXRNb2RlKHZhbCkgfSxcbiAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy4kbW9kZUlkIH1cbiAgfVxufSk7XG4iXX0=