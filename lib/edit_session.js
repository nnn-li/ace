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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWRpdF9zZXNzaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2VkaXRfc2Vzc2lvbi50cyJdLCJuYW1lcyI6WyJpc0Z1bGxXaWR0aCIsIkVkaXRTZXNzaW9uIiwiRWRpdFNlc3Npb24uY29uc3RydWN0b3IiLCJFZGl0U2Vzc2lvbi5zZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLmdldERvY3VtZW50IiwiRWRpdFNlc3Npb24uJHJlc2V0Um93Q2FjaGUiLCJFZGl0U2Vzc2lvbi4kZ2V0Um93Q2FjaGVJbmRleCIsIkVkaXRTZXNzaW9uLnJlc2V0Q2FjaGVzIiwiRWRpdFNlc3Npb24ub25DaGFuZ2VGb2xkIiwiRWRpdFNlc3Npb24ub25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXRWYWx1ZSIsIkVkaXRTZXNzaW9uLnRvU3RyaW5nIiwiRWRpdFNlc3Npb24uZ2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi5nZXRTZWxlY3Rpb24iLCJFZGl0U2Vzc2lvbi5nZXRTdGF0ZSIsIkVkaXRTZXNzaW9uLmdldFRva2VucyIsIkVkaXRTZXNzaW9uLmdldFRva2VuQXQiLCJFZGl0U2Vzc2lvbi5zZXRVbmRvTWFuYWdlciIsIkVkaXRTZXNzaW9uLm1hcmtVbmRvR3JvdXAiLCJFZGl0U2Vzc2lvbi5nZXRVbmRvTWFuYWdlciIsIkVkaXRTZXNzaW9uLmdldFRhYlN0cmluZyIsIkVkaXRTZXNzaW9uLnNldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uZ2V0VXNlU29mdFRhYnMiLCJFZGl0U2Vzc2lvbi5zZXRUYWJTaXplIiwiRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmlzVGFiU3RvcCIsIkVkaXRTZXNzaW9uLnNldE92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLmdldE92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLnRvZ2dsZU92ZXJ3cml0ZSIsIkVkaXRTZXNzaW9uLmFkZEd1dHRlckRlY29yYXRpb24iLCJFZGl0U2Vzc2lvbi5yZW1vdmVHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24uZ2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5zZXRCcmVha3BvaW50cyIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5zZXRCcmVha3BvaW50IiwiRWRpdFNlc3Npb24uY2xlYXJCcmVha3BvaW50IiwiRWRpdFNlc3Npb24uYWRkTWFya2VyIiwiRWRpdFNlc3Npb24uYWRkRHluYW1pY01hcmtlciIsIkVkaXRTZXNzaW9uLnJlbW92ZU1hcmtlciIsIkVkaXRTZXNzaW9uLmdldE1hcmtlcnMiLCJFZGl0U2Vzc2lvbi5oaWdobGlnaHQiLCJFZGl0U2Vzc2lvbi5oaWdobGlnaHRMaW5lcyIsIkVkaXRTZXNzaW9uLnNldEFubm90YXRpb25zIiwiRWRpdFNlc3Npb24uY2xlYXJBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLiRkZXRlY3ROZXdMaW5lIiwiRWRpdFNlc3Npb24uZ2V0V29yZFJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0QVdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLnNldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uZ2V0TmV3TGluZU1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRVc2VXb3JrZXIiLCJFZGl0U2Vzc2lvbi5vblJlbG9hZFRva2VuaXplciIsIkVkaXRTZXNzaW9uLnNldE1vZGUiLCJFZGl0U2Vzc2lvbi4kb25DaGFuZ2VNb2RlIiwiRWRpdFNlc3Npb24uJHN0b3BXb3JrZXIiLCJFZGl0U2Vzc2lvbi4kc3RhcnRXb3JrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNb2RlIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wIiwiRWRpdFNlc3Npb24uc2V0U2Nyb2xsTGVmdCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldExpbmVXaWRnZXRNYXhXaWR0aCIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TGluZXMiLCJFZGl0U2Vzc2lvbi5nZXRMZW5ndGgiLCJFZGl0U2Vzc2lvbi5nZXRUZXh0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5pbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZW1vdmUiLCJFZGl0U2Vzc2lvbi51bmRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnJlZG9DaGFuZ2VzIiwiRWRpdFNlc3Npb24uc2V0VW5kb1NlbGVjdCIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uJGdldFVuZG9TZWxlY3Rpb24uaXNJbnNlcnQiLCJFZGl0U2Vzc2lvbi5yZXBsYWNlIiwiRWRpdFNlc3Npb24ubW92ZVRleHQiLCJFZGl0U2Vzc2lvbi5pbmRlbnRSb3dzIiwiRWRpdFNlc3Npb24ub3V0ZGVudFJvd3MiLCJFZGl0U2Vzc2lvbi4kbW92ZUxpbmVzIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzVXAiLCJFZGl0U2Vzc2lvbi5tb3ZlTGluZXNEb3duIiwiRWRpdFNlc3Npb24uZHVwbGljYXRlTGluZXMiLCJFZGl0U2Vzc2lvbi4kY2xpcFJvd1RvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcENvbHVtblRvUm93IiwiRWRpdFNlc3Npb24uJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi4kY2xpcFJhbmdlVG9Eb2N1bWVudCIsIkVkaXRTZXNzaW9uLnNldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uZ2V0VXNlV3JhcE1vZGUiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLmFkanVzdFdyYXBMaW1pdCIsIkVkaXRTZXNzaW9uLiRjb25zdHJhaW5XcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5zZXRXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi5nZXRXcmFwTGltaXRSYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVSb3dMZW5ndGhDYWNoZSIsIkVkaXRTZXNzaW9uLiR1cGRhdGVXcmFwRGF0YSIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cyIsIkVkaXRTZXNzaW9uLiRjb21wdXRlV3JhcFNwbGl0cy5hZGRTcGxpdCIsIkVkaXRTZXNzaW9uLiRnZXREaXNwbGF5VG9rZW5zIiwiRWRpdFNlc3Npb24uJGdldFN0cmluZ1NjcmVlbldpZHRoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0Um93TGluZUNvdW50IiwiRWRpdFNlc3Npb24uZ2V0Um93V3JhcEluZGVudCIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW4iLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmdldFJvd1NwbGl0RGF0YSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlblRhYlNpemUiLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50Um93IiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudENvbHVtbiIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbiIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUm93IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuTGVuZ3RoIiwiRWRpdFNlc3Npb24uJHNldEZvbnRNZXRyaWNzIiwiRWRpdFNlc3Npb24uZmluZE1hdGNoaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEJyYWNrZXRSYW5nZSIsIkVkaXRTZXNzaW9uLiRmaW5kT3BlbmluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi4kZmluZENsb3NpbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZEF0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZHNJblJhbmdlTGlzdCIsIkVkaXRTZXNzaW9uLmdldEFsbEZvbGRzIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZFN0cmluZ0F0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXROZXh0Rm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5nZXRGb2xkZWRSb3dDb3VudCIsIkVkaXRTZXNzaW9uLiRhZGRGb2xkTGluZSIsIkVkaXRTZXNzaW9uLmFkZEZvbGQiLCJFZGl0U2Vzc2lvbi5zZXRNb2RpZmllZCIsIkVkaXRTZXNzaW9uLmFkZEZvbGRzIiwiRWRpdFNlc3Npb24ucmVtb3ZlRm9sZCIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGRzIiwiRWRpdFNlc3Npb24uZXhwYW5kRm9sZCIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGRzIiwiRWRpdFNlc3Npb24udW5mb2xkIiwiRWRpdFNlc3Npb24uaXNSb3dGb2xkZWQiLCJFZGl0U2Vzc2lvbi5nZXRSb3dGb2xkRW5kIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZFN0YXJ0IiwiRWRpdFNlc3Npb24uZ2V0Rm9sZERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uZ2V0RGlzcGxheUxpbmUiLCJFZGl0U2Vzc2lvbi4kY2xvbmVGb2xkRGF0YSIsIkVkaXRTZXNzaW9uLnRvZ2dsZUZvbGQiLCJFZGl0U2Vzc2lvbi5nZXRDb21tZW50Rm9sZFJhbmdlIiwiRWRpdFNlc3Npb24uZm9sZEFsbCIsIkVkaXRTZXNzaW9uLnNldEZvbGRTdHlsZSIsIkVkaXRTZXNzaW9uLiRzZXRGb2xkaW5nIiwiRWRpdFNlc3Npb24uZ2V0UGFyZW50Rm9sZFJhbmdlRGF0YSIsIkVkaXRTZXNzaW9uLm9uRm9sZFdpZGdldENsaWNrIiwiRWRpdFNlc3Npb24uJHRvZ2dsZUZvbGRXaWRnZXQiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udXBkYXRlRm9sZFdpZGdldHMiXSwibWFwcGluZ3MiOiJPQStCTyxFQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUMsTUFBTSxZQUFZO09BQzdDLEVBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFDLE1BQU0sVUFBVTtPQUNsRSxFQUFDLGlCQUFpQixFQUFDLE1BQU0scUJBQXFCO09BQzlDLFFBQVEsTUFBTSxhQUFhO09BQzNCLElBQUksTUFBTSxRQUFRO09BQ2xCLEVBQUMsU0FBUyxFQUFDLE1BQU0sYUFBYTtPQUM5QixJQUFJLE1BQU0sYUFBYTtPQUN2QixFQUFDLEtBQUssRUFBQyxNQUFNLFNBQVM7T0FDdEIsRUFBQyxRQUFRLEVBQUMsTUFBTSxZQUFZO09BQzVCLEVBQUMsbUJBQW1CLEVBQUMsTUFBTSx3QkFBd0I7T0FDbkQsRUFBQyxlQUFlLEVBQUMsTUFBTSxvQkFBb0I7T0FDM0MsRUFBQyxNQUFNLEVBQUMsTUFBTSxlQUFlO09BQzdCLFlBQVksTUFBTSw4QkFBOEI7T0FFaEQsYUFBYSxNQUFNLGlCQUFpQjtBQUczQyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQ1IsUUFBUSxHQUFHLENBQUMsRUFDWixpQkFBaUIsR0FBRyxDQUFDLEVBQ3JCLGdCQUFnQixHQUFHLENBQUMsRUFDcEIsV0FBVyxHQUFHLENBQUMsRUFDZixLQUFLLEdBQUcsRUFBRSxFQUNWLEdBQUcsR0FBRyxFQUFFLEVBQ1IsU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUluQixxQkFBcUIsQ0FBUztJQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDWEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzdCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFB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T0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDM0JBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLG1CQUFtQkEsR0FBR0Esa0JBQWtCQSxDQUFDQSxDQUFDQTtRQUM1RUEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFRTXJDLFVBQVVBLENBQUNBLE9BQWdCQTtRQUM5QnNDLE1BQU1BLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO0lBQzVEQSxDQUFDQTtJQUVNdEMsU0FBU0EsQ0FBQ0EsRUFBRUE7UUFDZnVDLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDekJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLGVBQWVBLENBQUNBLElBQUlBLEVBQUVBLG1CQUFtQkEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDdkVBLElBQUlBLENBQUNBLGdCQUFnQkEsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUM3REEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtJQUN4Q0EsQ0FBQ0E7SUFHT3ZDLGNBQWNBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLEVBQUVBLEtBQUtBLEVBQUVBLE9BQU9BO1FBQ25Ed0MsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNUJBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBO1lBQ2ZBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBO1FBQ3RCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxLQUFLQSxHQUFHQSxVQUFVQSxDQUFDQTtRQUV2QkEsSUFBSUEsS0FBS0EsR0FBUUEsSUFBSUEsS0FBS0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsRUFBRUEsTUFBTUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDMURBLEtBQUtBLENBQUNBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLEVBQUVBLFVBQVVBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1FBQzdEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFnQk14QyxjQUFjQSxDQUFDQSxXQUFXQTtRQUM3QnlDLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLFdBQVdBLENBQUNBO1FBQ2hDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxrQkFBa0JBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBO0lBQ3pDQSxDQUFDQTtJQWVNekMsZ0JBQWdCQTtRQUNuQjBDLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBO0lBQzVCQSxDQUFDQTtJQU9PMUMsY0FBY0EsQ0FBQ0EsSUFBWUE7UUFDL0IyQyxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQTtRQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsSUFBSUEsQ0FBQ0EsWUFBWUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakNBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLENBQUNBLFlBQVlBLEdBQUdBLElBQUlBLENBQUNBO1FBQzdCQSxDQUFDQTtJQUNMQSxDQUFDQTtJQVNNM0MsWUFBWUEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0E7UUFDM0M0QyxJQUFJQSxJQUFJQSxHQUFXQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUVyQ0EsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDcEJBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1lBQ1hBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRTVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUNUQSxPQUFPQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUV4REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDUkEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDMUJBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNsQkEsSUFBSUE7WUFDQUEsSUFBSUEsRUFBRUEsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFN0JBLElBQUlBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ25CQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNaQSxHQUFHQSxDQUFDQTtnQkFDQUEsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDWkEsQ0FBQ0EsUUFDTUEsS0FBS0EsSUFBSUEsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUE7WUFDbkRBLEtBQUtBLEVBQUVBLENBQUNBO1FBQ1pBLENBQUNBO1FBRURBLElBQUlBLEdBQUdBLEdBQUdBLE1BQU1BLENBQUNBO1FBQ2pCQSxPQUFPQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUNyREEsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDVkEsQ0FBQ0E7UUFFREEsTUFBTUEsQ0FBQ0EsSUFBSUEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsRUFBRUEsR0FBR0EsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDM0NBLENBQUNBO0lBU001QyxhQUFhQSxDQUFDQSxHQUFXQSxFQUFFQSxNQUFjQTtRQUM1QzZDLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLEdBQUdBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1FBQy9DQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUUzQ0EsT0FBT0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDdERBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQTtJQUNyQkEsQ0FBQ0E7SUFTTzdDLGNBQWNBLENBQUNBLFdBQW1CQTtRQUN0QzhDLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLGNBQWNBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBO0lBQ3pDQSxDQUFDQTtJQVFPOUMsY0FBY0E7UUFDbEIrQyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxjQUFjQSxFQUFFQSxDQUFDQTtJQUNyQ0EsQ0FBQ0E7SUFPTy9DLFlBQVlBLENBQUNBLFNBQVNBLElBQUlnRCxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxXQUFXQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUtuRWhELFlBQVlBLEtBQUtpRCxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUsxQ2pELGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7UUFDdkJrRCxJQUFJQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQTtRQUNsQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDbkNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDdkNBLENBQUNBO0lBU09sRCxPQUFPQSxDQUFDQSxJQUFJQSxFQUFFQSxFQUFHQTtRQUNyQm1ELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLE9BQU9BLElBQUlBLEtBQUtBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ3BDQSxDQUFDQTtZQUNEQSxJQUFJQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNuQkEsSUFBSUEsSUFBSUEsR0FBR0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDNUJBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLElBQUlBLElBQUlBLGVBQWVBLENBQUNBO1FBQ25DQSxDQUFDQTtRQUdEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsR0FBR0EsSUFBSUEsSUFBSUEsRUFBRUEsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2hDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0Q0EsRUFBRUEsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDWEEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLFVBQVVBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLEVBQUVBLFVBQVNBLENBQU1BO1lBQ3RDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLEtBQUssSUFBSSxDQUFDO2dCQUN0QixNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxDQUFDO1lBQ3RCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUM7Z0JBQzlCLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNqRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ2QsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDeEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO29CQUNYLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUN0QixDQUFDLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQztnQkFDakIsQ0FBQztnQkFDRCxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN0QixFQUFFLElBQUksRUFBRSxFQUFFLENBQUM7WUFDZixDQUFDO1FBQ0wsQ0FBQyxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUdkQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxlQUFlQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUMzREEsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFT25ELGFBQWFBLENBQUNBLElBQVVBLEVBQUVBLGNBQXdCQTtRQUN0RG9ELEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFDREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFdEJBLE1BQU1BLENBQUNBO1FBQ1hBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO1FBR2xCQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQTtRQUVuQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLENBQUNBLFlBQVlBLEVBQUVBLENBQUNBO1FBQ3hCQSxDQUFDQTtRQUVEQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtRQUVwQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxLQUFLQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5Q0EsSUFBSUEsaUJBQWlCQSxHQUFHQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzFEQSxTQUFTQSxDQUFDQSxrQkFBa0JBLENBQUNBLENBQUNBLFFBQVFBLEVBQUVBLGlCQUFpQkEsQ0FBQ0EsQ0FBQ0E7UUFDL0RBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BCQSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxJQUFJQSxtQkFBbUJBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3REQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtZQUNqQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxRQUFRQSxFQUFFQSxVQUFTQSxDQUFDQTtnQkFDbEQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN4QyxDQUFDLENBQUNBLENBQUNBO1FBQ1BBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFlBQVlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1FBQzdDQSxDQUFDQTtRQUVEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUVqREEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBO1FBR2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxjQUFjQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7WUFDMURBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1lBQ3BDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7UUFDN0JBLENBQUNBO0lBQ0xBLENBQUNBO0lBR09wRCxXQUFXQTtRQUNmcUQsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDZkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7UUFDN0JBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQUVPckQsWUFBWUE7UUFDaEJzRCxJQUFJQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNqREEsQ0FDQUE7UUFBQUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDeEJBLENBQUNBO0lBQ0xBLENBQUNBO0lBTU10RCxPQUFPQTtRQUNWdUQsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDdEJBLENBQUNBO0lBT012RCxZQUFZQSxDQUFDQSxTQUFpQkE7UUFFakN3RCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxVQUFVQSxLQUFLQSxTQUFTQSxJQUFJQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwREEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsVUFBVUEsR0FBR0EsU0FBU0EsQ0FBQ0E7UUFDNUJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGlCQUFpQkEsRUFBRUEsU0FBU0EsQ0FBQ0EsQ0FBQ0E7SUFDL0NBLENBQUNBO0lBTU14RCxZQUFZQTtRQUNmeUQsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7SUFDM0JBLENBQUNBO0lBS016RCxhQUFhQSxDQUFDQSxVQUFrQkE7UUFFbkMwRCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxXQUFXQSxLQUFLQSxVQUFVQSxJQUFJQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtZQUNyREEsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsVUFBVUEsQ0FBQ0E7UUFDOUJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLGtCQUFrQkEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7SUFDakRBLENBQUNBO0lBTU0xRCxhQUFhQTtRQUNoQjJELE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO0lBQzVCQSxDQUFDQTtJQU1NM0QsY0FBY0E7UUFDakI0RCxJQUFJQSxDQUFDQSxhQUFhQSxFQUFFQSxDQUFDQTtRQUNyQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0E7WUFDakJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLHFCQUFxQkEsRUFBRUEsRUFBRUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsQ0FBQ0E7UUFDcEVBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBO0lBQzVCQSxDQUFDQTtJQUVPNUQscUJBQXFCQTtRQUN6QjZELEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsSUFBSUEsSUFBSUEsQ0FBQ0E7WUFBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQTtRQUNoRUEsSUFBSUEsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZEEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsQ0FBQ0E7WUFDL0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO2dCQUMzQixLQUFLLEdBQUcsQ0FBQyxDQUFDLFdBQVcsQ0FBQztRQUM5QixDQUFDLENBQUNBLENBQUNBO1FBQ0hBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLEdBQUdBLEtBQUtBLENBQUNBO0lBQ3hDQSxDQUFDQTtJQUVNN0QsYUFBYUEsQ0FBQ0EsS0FBTUE7UUFDdkI4RCxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFFdkJBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO2dCQUNsQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7WUFFOUNBLElBQUlBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBO1lBQ25DQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtZQUNqQ0EsSUFBSUEsaUJBQWlCQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3pDQSxJQUFJQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtZQUN6REEsSUFBSUEsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFFdkJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hCQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDekJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEdBQUdBLENBQUNBO3dCQUNUQSxLQUFLQSxDQUFDQTtvQkFDVkEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7b0JBQ3ZDQSxTQUFTQSxHQUFHQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQTtnQkFDekRBLENBQUNBO2dCQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQTtvQkFDakJBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBRXZEQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxpQkFBaUJBLENBQUNBO29CQUM3QkEsaUJBQWlCQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsV0FBV0EsR0FBR0EsaUJBQWlCQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFVTTlELE9BQU9BLENBQUNBLEdBQVdBO1FBQ3RCK0QsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7SUFDakNBLENBQUNBO0lBVU0vRCxRQUFRQSxDQUFDQSxRQUFnQkEsRUFBRUEsT0FBZUE7UUFDN0NnRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxDQUFDQSxRQUFRQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtJQUNoREEsQ0FBQ0E7SUFNTWhFLFNBQVNBO1FBQ1ppRSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxFQUFFQSxDQUFDQTtJQUNoQ0EsQ0FBQ0E7SUFRTWpFLFlBQVlBLENBQUNBLEtBQXVGQTtRQUN2R2tFLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLENBQUNBLEtBQUtBLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO0lBQ3JFQSxDQUFDQTtJQVVNbEUsTUFBTUEsQ0FBQ0EsUUFBeUNBLEVBQUVBLElBQVlBO1FBQ2pFbUUsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDM0NBLENBQUNBO0lBVU1uRSxNQUFNQSxDQUFDQSxLQUFLQTtRQUNmb0UsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDbENBLENBQUNBO0lBVU1wRSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFvQkE7UUFDM0NxRSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNmQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0QkEsSUFBSUEsYUFBYUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDekJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQzNDQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcENBLGFBQWFBO29CQUNUQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLEVBQUVBLGFBQWFBLENBQUNBLENBQUNBO1lBQ2xFQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsU0FBU0E7b0JBQ25DLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUNuQyxDQUFDLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1lBQ2JBLENBQUNBO1FBQ0xBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ3ZCQSxhQUFhQTtZQUNUQSxJQUFJQSxDQUFDQSxXQUFXQTtZQUNoQkEsQ0FBQ0EsVUFBVUE7WUFDWEEsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUNwREEsTUFBTUEsQ0FBQ0EsYUFBYUEsQ0FBQ0E7SUFDekJBLENBQUNBO0lBVU1yRSxXQUFXQSxDQUFDQSxNQUFNQSxFQUFFQSxVQUFvQkE7UUFDM0NzRSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUNmQSxNQUFNQSxDQUFDQTtRQUVYQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0QkEsSUFBSUEsYUFBYUEsR0FBVUEsSUFBSUEsQ0FBQ0E7UUFDaENBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLE1BQU1BLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3JDQSxJQUFJQSxLQUFLQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDbkNBLGFBQWFBO29CQUNUQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLEtBQUtBLEVBQUVBLGFBQWFBLENBQUNBLENBQUNBO1lBQ25FQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUN2QkEsYUFBYUE7WUFDVEEsSUFBSUEsQ0FBQ0EsV0FBV0E7WUFDaEJBLENBQUNBLFVBQVVBO1lBQ1hBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFDcERBLE1BQU1BLENBQUNBLGFBQWFBLENBQUNBO0lBQ3pCQSxDQUFDQTtJQU9PdEUsYUFBYUEsQ0FBQ0EsTUFBZUE7UUFDakN1RSxJQUFJQSxDQUFDQSxXQUFXQSxHQUFHQSxNQUFNQSxDQUFDQTtJQUM5QkEsQ0FBQ0E7SUFFT3ZFLGlCQUFpQkEsQ0FBQ0EsTUFBMENBLEVBQUVBLE1BQWVBLEVBQUVBLGFBQW9CQTtRQUN2R3dFLGtCQUFrQkEsS0FBeUJBO1lBQ3ZDQyxJQUFJQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxLQUFLQSxZQUFZQSxJQUFJQSxLQUFLQSxDQUFDQSxNQUFNQSxLQUFLQSxhQUFhQSxDQUFDQTtZQUM3RUEsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDckNBLENBQUNBO1FBRURELElBQUlBLEtBQUtBLEdBQXFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4REEsSUFBSUEsS0FBWUEsQ0FBQ0E7UUFDakJBLElBQUlBLEtBQXNDQSxDQUFDQTtRQUMzQ0EsSUFBSUEsaUJBQWlCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLFVBQVVBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzdEQSxpQkFBaUJBLEdBQUdBLElBQUlBLENBQUNBO1FBQzdCQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNKQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUMvREEsaUJBQWlCQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUM5QkEsQ0FBQ0E7UUFFREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDckNBLEtBQUtBLEdBQUdBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbEJBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBO2dCQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hEQSxLQUFLQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDcEVBLENBQUNBO2dCQUNEQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtnQkFDeEJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUMvQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0Es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QWVBLENBQUNBO1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeEZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNwQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNwRkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcERBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDN0JBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3RDQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUM1Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBU0EsQ0FBQ0E7Z0JBQzlCLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQztnQkFDOUIsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDO2dCQUM1QixDQUFDO2dCQUNELENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQztnQkFDdkIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDO2dCQUNyQixNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2IsQ0FBQyxDQUFDQSxDQUFDQSxDQUFDQTtRQUNSQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtJQUNuQkEsQ0FBQ0E7SUFZTTNFLFVBQVVBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLEVBQUVBLFlBQVlBO1FBQzVDNEUsWUFBWUEsR0FBR0EsWUFBWUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFDaEVBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLEVBQUVBLEdBQUdBLElBQUlBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBO1lBQ3pDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxFQUFFQSxHQUFHQSxFQUFFQSxHQUFHQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxZQUFZQSxDQUFDQSxDQUFDQTtJQUMzREEsQ0FBQ0E7SUFRTTVFLFdBQVdBLENBQUNBLEtBQVlBO1FBQzNCNkUsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsWUFBWUEsRUFBRUEsQ0FBQ0E7UUFDcENBLElBQUlBLFdBQVdBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hDQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxFQUFFQSxDQUFDQTtRQUU3QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDMURBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTNCQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUMxQkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUN6QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsR0FBR0EsQ0FBQ0E7b0JBQ3RCQSxLQUFLQSxDQUFDQTtZQUNkQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDckNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO2dCQUM3QkEsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FB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QSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNYQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNiQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtJQUMxREEsQ0FBQ0E7SUFHT25GLHVCQUF1QkEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0E7UUFDdkRvRixNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUU3QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDVkEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDUkEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDZkEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDL0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNiQSxHQUFHQSxHQUFHQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDZEEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDOUNBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLENBQUNBO2dCQUNGQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUM1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QUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDdEJBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUMxQkEsSUFBSUEsR0FBR0EsR0FBR0EsV0FBV0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQUE7Z0JBQzdEQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFJNUJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO2dCQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDWkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ1hBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUFBO29CQUUvREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ1hBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUNuREEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3ZCQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUNuQkEsT0FBT0EsRUFBRUEsQ0FBQ0EsRUFBRUEsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7b0JBQy9DQSxDQUFDQTtvQkFBQ0EsSUFBSUEsQ0FFRkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ1pBLFFBQVFBLENBQUNBLGNBQWNBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO3dCQUNoRUEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtvQkFFTEEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzFDQSxDQUFDQTtnQkFFREEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsR0FBR0EsR0FBR0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQ3RDQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtvQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO3dCQUNqQ0EsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzNCQSxDQUFDQTtnQkFDTEEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFHSkEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUVqQ0EsWUFBWUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQTtnQkFFL0JBLEdBQUdBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBO1lBQ2ZBLENBQUNBO1lBQ0RBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQzFDQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWEEsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsUUFBUUEsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDekRBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLFdBQVdBLElBQUlBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLElBQUlBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQy9EQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSwyREFBMkRBLENBQUNBLENBQUNBO1FBQy9FQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxTQUFTQSxHQUFHQSxLQUFLQSxDQUFDQTtRQUV2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0E7WUFDWkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsUUFBUUEsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFbERBLE1BQU1BLENBQUNBLFlBQVlBLENBQUNBO0lBQ3hCQSxDQUFDQTtJQUVNOUYscUJBQXFCQSxDQUFDQSxRQUFRQSxFQUFFQSxPQUFPQSxFQUFFQSxDQUFFQTtRQUM5QytGLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3RDQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtJQUN6Q0EsQ0FBQ0E7SUFFTS9GLGVBQWVBLENBQUNBLFFBQVFBLEVBQUVBLE9BQU9BO1FBQ3BDZ0csSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsV0FBV0EsRUFBRUEsQ0FBQ0E7UUFDbkNBLElBQUlBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1FBQ2hDQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtRQUM5QkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFDaENBLElBQUlBLE1BQU1BLENBQUNBO1FBQ1hBLElBQUlBLFFBQVFBLENBQUNBO1FBRWJBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBQ25CQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxPQUFPQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUM5Q0EsT0FBT0EsR0FBR0EsSUFBSUEsT0FBT0EsRUFBRUEsQ0FBQ0E7WUFDcEJBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1lBQzNDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDWkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDNUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BFQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsTUFBTUEsR0FBR0EsRUFBRUEsQ0FBQ0E7Z0JBQ1pBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFVBQVNBLFdBQVdBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLFVBQVVBO29CQUN2RCxJQUFJLFVBQW9CLENBQUM7b0JBQ3pCLEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUN0QixVQUFVLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUMvQixXQUFXLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUNoQyxVQUFVLENBQUMsQ0FBQyxDQUFDLEdBQUcsaUJBQWlCLENBQUM7d0JBQ2xDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7NEJBQ3pDLFVBQVUsQ0FBQyxDQUFDLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQzt3QkFDckMsQ0FBQztvQkFDTCxDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNKLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQy9CLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxFQUN4QyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ3ZCLENBQUM7b0JBQ0QsTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQ3ZDLENBQUMsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFDUkEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsRUFDaEJBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQ3JDQSxDQUFDQTtnQkFFRkEsUUFBUUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxNQUFNQSxFQUFFQSxTQUFTQSxFQUFFQSxPQUFPQSxDQUFDQSxDQUFDQTtnQkFDbkZBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQy9CQSxDQUFDQTtRQUNMQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVPaEcsa0JBQWtCQSxDQUFDQSxNQUFnQkEsRUFBRUEsU0FBaUJBLEVBQUVBLE9BQWdCQTtRQUM1RWlHLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxNQUFNQSxDQUFDQSxFQUFFQSxDQUFDQTtRQUNkQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFhQSxFQUFFQSxDQUFDQTtRQUMxQkEsSUFBSUEsYUFBYUEsR0FBR0EsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDbENBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLEVBQUVBLFlBQVlBLEdBQUdBLENBQUNBLENBQUNBO1FBRXBDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQTtRQUU5QkEsa0JBQWtCQSxTQUFpQkE7WUFDL0JDLElBQUlBLFNBQVNBLEdBQUdBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLFNBQVNBLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1lBSW5EQSxJQUFJQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUMzQkEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBRWRBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBO2dCQUNYLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQ1QsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQ0E7Z0JBRUZBLE9BQU9BLENBQUNBLElBQUlBLEVBQUVBO2dCQUNWLEdBQUcsSUFBSSxDQUFDLENBQUM7Z0JBQ1QsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ2xCLENBQUMsQ0FBQ0EsQ0FBQ0E7WUFFUEEsWUFBWUEsSUFBSUEsR0FBR0EsQ0FBQ0E7WUFDcEJBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO1lBQzFCQSxTQUFTQSxHQUFHQSxTQUFTQSxDQUFDQTtRQUMxQkEsQ0FBQ0E7UUFFREQsT0FBT0EsYUFBYUEsR0FBR0EsU0FBU0EsR0FBR0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFFM0NBLElBQUlBLEtBQUtBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLENBQUNBO1lBSWxDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxHQUFHQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFNdkRBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUNoQkEsUUFBUUEsQ0FBQ0E7WUFDYkEsQ0FBQ0E7WUFNREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsaUJBQWlCQSxJQUFJQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxnQkFBZ0JBLENBQUNBLENBQUNBLENBQUNBO2dCQUkxRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsSUFBSUEsU0FBU0EsR0FBR0EsQ0FBQ0EsRUFBRUEsS0FBS0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JB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R0FBYUEsRUFBRUEsQ0FBQ0E7UUFDdkJBLElBQUlBLE9BQWVBLENBQUNBO1FBQ3BCQSxNQUFNQSxHQUFHQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUVyQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDbENBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBRTFCQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVEEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDckRBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUNkQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxPQUFPQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtvQkFDL0JBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO2dCQUN4QkEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2ZBLEdBQUdBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBQ3BCQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxH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QUNBO1FBQ1pBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBRWxCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtRQUNwQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxRQUFRQSxFQUFFQSxTQUFTQSxDQUFDQSxDQUFDQTtRQUNwREEsSUFBSUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsSUFBSUEsT0FBT0EsR0FBR0EsU0FBU0EsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUVEQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNsQ0EsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDNUNBLElBQUlBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXpEQSxPQUFPQSxHQUFHQSxJQUFJQSxTQUFTQSxFQUFFQSxDQUFDQTtZQUN0QkEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDdENBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLFNBQVNBLEdBQUdBLFNBQVNBLElBQUlBLE1BQU1BLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO2dCQUNsREEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ0pBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBO2dCQUNqQkEsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ1RBLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO29CQUNyQkEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxFQUFFQSxRQUFRQSxDQUFDQSxDQUFDQTtvQkFDbERBLFNBQVNBLEdBQUdBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO2dCQUN6REEsQ0FBQ0E7WUFDTEEsQ0FBQ0E7WUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1ZBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUMvQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDbkNBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQzNDQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1lBQ3pDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNoQ0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsR0FBR0EsU0FBU0EsSUFBSUEsU0FBU0EsSUFBSUEsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFekRBLE1BQU1BLENBQUNBO2dCQUNIQSxHQUFHQSxFQUFFQSxNQUFNQTtnQkFDWEEsTUFBTUEsRUFBRUEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsTUFBTUE7YUFDdENBLENBQUFBO1FBQ0xBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ0pBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQzVCQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNwQkEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3BDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDVEEsSUFBSUEsVUFBVUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdDQSxNQUFNQSxHQUFHQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQTtnQkFDNUJBLEVBQUVBLENBQUNBLENBQUNBLFVBQVVBLEdBQUdBLENBQUNBLElBQUlBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNsQ0EsU0FBU0EsR0FBR0EsTUFBTUEsQ0FBQ0EsVUFBVUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsTUFBTUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ2hFQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDckNBLENBQUNBO1lBQ0xBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLFNBQVNBLElBQUlBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFJL0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLFNBQVNBLElBQUlBLE1BQU1BLENBQUNBO1lBQ3pDQSxTQUFTQSxHQUFHQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUUzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDVEEsTUFBTUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7UUFFN0NBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLE1BQU1BLEVBQUVBLFNBQVNBLEVBQUVBLENBQUNBO0lBQzlDQSxDQUFDQTtJQVVNL0csd0JBQXdCQSxDQUFDQSxNQUFjQSxFQUFFQSxTQUFpQkE7UUFDN0RnSCxJQUFJQSxHQUFvQ0EsQ0FBQ0E7UUFFekNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLFNBQVNBLEtBQUtBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQ25DQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLEVBQUVBLE1BQU1BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hFQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxNQUFNQSxDQUFDQSxPQUFPQSxNQUFNQSxLQUFLQSxRQUFRQSxFQUFFQSx5QkFBeUJBLENBQUNBLENBQUNBO1lBQzlEQSxNQUFNQSxDQUFDQSxPQUFPQSxTQUFTQSxLQUFLQSxRQUFRQSxFQUFFQSw0QkFBNEJBLENBQUNBLENBQUNBO1lBQ3BFQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSx1QkFBdUJBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLENBQUNBO1FBQzFEQSxDQUFDQTtRQUVEQSxNQUFNQSxHQUFHQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNqQkEsU0FBU0EsR0FBR0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDdkJBLE1BQU1BLENBQUNBLE9BQU9BLE1BQU1BLEtBQUtBLFFBQVFBLEVBQUVBLHlCQUF5QkEsQ0FBQ0EsQ0FBQ0E7UUFDOURBLE1BQU1BLENBQUNBLE9BQU9BLFNBQVNBLEtBQUtBLFFBQVFBLEVBQUVBLDRCQUE0QkEsQ0FBQ0EsQ0FBQ0E7UUFFcEVBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xCQSxJQUFJQSxZQUFZQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN4QkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFHaEJBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNQQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN4QkEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDbENBLENBQUNBO1FBRURBLElBQUlBLE1BQU1BLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1FBRXBCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtRQUNqQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNqREEsSUFBSUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2RBLElBQUlBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3RCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4Q0EsSUFBSUEsT0FBT0EsR0FBR0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDM0NBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JCQSxDQUFDQTtRQUVEQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUN6Q0EsSUFBSUEsU0FBU0EsR0FBR0EsUUFBUUEsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsQ0FBQ0E7UUFFekRBLE9BQU9BLEdBQUdBLEdBQUdBLE1BQU1BLEVBQUVBLENBQUNBO1lBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbkJBLE1BQU1BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUM5QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7b0JBQ2hCQSxLQUFLQSxDQUFDQTtnQkFDVkEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ2xEQSxTQUFTQSxHQUFHQSxR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QUFDQTtZQUNqREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBR1hBLFFBQVFBLENBQUNBO1lBQ2JBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUdqQkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFFREEsSUFBSUEsS0FBS0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO2dCQUNwQ0EsSUFBSUEsSUFBSUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BCQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtnQkFDckNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNaQSxLQUFLQSxDQUFDQTtnQkFDVkEsQ0FBQ0E7Z0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNsQkEsUUFBUUEsQ0FBQ0E7Z0JBQ2JBLENBQUNBO2dCQUFDQSxJQUFJQSxDQUVGQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDWkEsS0FBS0EsQ0FBQ0E7Z0JBQ1ZBLENBQUNBO2dCQUNMQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFDREEsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDbEJBLEdBQUdBLENBQUNBLE1BQU1BLElBQUlBLENBQUNBLENBQUNBO1FBRWhCQSxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQTtJQUN0QkEsQ0FBQ0E7SUFFRDFILG1CQUFtQkEsQ0FBQ0EsTUFBTUE7UUFDdEIySCxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsS0FBS0EsR0FBV0EsRUFBRUEsQ0FBQ0E7WUFDdkJBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLFVBQVNBLEtBQUtBO2dCQUN6QixLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDdEQsQ0FBQyxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNiQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUM3Q0EsQ0FBQ0E7UUFDREEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBS0QzSCxXQUFXQTtRQUNQNEgsSUFBSUEsS0FBS0EsR0FBR0EsRUFBRUEsQ0FBQ0E7UUFDZkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFFL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO1lBQ3JDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtnQkFDOUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRTFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFtQkQ1SCxlQUFlQSxDQUFDQSxHQUFXQSxFQUFFQSxNQUFjQSxFQUFFQSxJQUFZQSxFQUFFQSxRQUFtQkE7UUFDMUU2SCxRQUFRQSxHQUFHQSxRQUFRQSxJQUFJQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7WUFDVkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFFaEJBLElBQUlBLFFBQVFBLEdBQUdBO1lBQ1hBLEdBQUdBLEVBQUVBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBO1NBQ3JCQSxDQUFDQTtRQUVGQSxJQUFJQSxHQUFXQSxDQUFDQTtRQUNoQkEsSUFBSUEsSUFBVUEsQ0FBQ0E7UUFDZkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDN0NBLElBQUlBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3pCQSxJQUFJQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNyRkEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2pCQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTtZQUNoQkEsQ0FBQ0E7WUFDREEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDcEJBLENBQUNBO1FBQ0RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBO1lBQ0xBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLFNBQVNBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBRXRFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxFQUFFQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUMxREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDZkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLElBQUlBO1lBQ0FBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBO0lBQ25CQSxDQUFD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QU1BLElBQUlBLFdBQVdBLElBQUlBLFNBQVNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSxpREFBaURBLENBQUNBLENBQUNBO1FBRXZFQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxFQUFFQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN6REEsSUFBSUEsT0FBT0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDcERBLEVBQUVBLENBQUNBLENBQUNBLFNBQVNBLElBQUlBLE9BQU9BLElBQUlBLFNBQVNBLENBQUNBO1lBQ2xDQSxNQUFNQSxDQUFDQSxTQUFTQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUV0Q0EsRUFBRUEsQ0FBQ0EsQ0FDQ0EsQ0FBQ0EsU0FBU0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsV0FBV0EsQ0FBQ0EsQ0FBQ0E7ZUFDM0RBLENBQUNBLE9BQU9BLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLFNBQVNBLENBQUNBLENBQzFEQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNDQSxNQUFNQSxJQUFJQSxLQUFLQSxDQUFDQSw4Q0FBOENBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLFNBQVNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ25HQSxDQUFDQTtRQUdEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUM3Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFbkJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1lBRXhCQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxPQUFPQTtnQkFDMUIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUM3QixDQUFDLENBQUNBLENBQUNBO1FBQ1BBLENBQUNBO1FBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ3ZDQSxJQUFJQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMzQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQy9CQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdkJBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO2dCQUNiQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDdENBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ2JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO29CQUVoQkEsSUFBSUEsWUFBWUEsR0FBR0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ25DQSxFQUFFQSxDQUFDQSxDQUFDQSxZQUFZQSxJQUFJQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFFbkRBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLENBQUNBLENBQUNBO3dCQUM3QkEsS0FBS0EsQ0FBQ0E7b0JBQ1ZBLENBQUNBO2dCQUNMQSxDQUFDQTtnQkFDREEsS0FBS0EsQ0FBQ0E7WUFDVkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsTUFBTUEsSUFBSUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RDQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUNQQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUVyRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7WUFDbEJBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2pFQSxJQUFJQTtZQUNBQSxJQUFJQSxDQUFDQSxxQkFBcUJBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBR3ZFQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUN2QkEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsRUFBRUEsRUFBRUEsSUFBSUEsRUFBRUEsSUFBSUEsRUFBRUEsTUFBTUEsRUFBRUEsS0FBS0EsRUFBRUEsQ0FBQ0EsQ0FBQ0E7UUFFeERBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVEbEksV0FBV0EsQ0FBQ0EsUUFBaUJBO0lBRTdCbUksQ0FBQ0E7SUFFRG5JLFFBQVFBLENBQUNBLEtBQWFBO1FBQ2xCb0ksS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsVUFBU0EsSUFBSUE7WUFDdkIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QixDQUFDLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO0lBQ2JBLENBQUNBO0lBRURwSSxVQUFVQSxDQUFDQSxJQUFVQTtRQUNqQnFJLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBO1FBQzdCQSxJQUFJQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNsQ0EsSUFBSUEsTUFBTUEsR0FBR0EsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFFOUJBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBQy9CQSxJQUFJQSxLQUFLQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUczQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLFNBQVNBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUVGQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN0REEsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0E7WUFDWkEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDbkRBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBO1FBQzdEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUVGQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1REEsS0FBS0EsQ0FBQ0EsS0FBS0EsRUFBRUEsQ0FBQ0E7WUFDZEEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDeENBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBO1FBQ2xEQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUtGQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN6Q0EsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FHTkEsQ0FBQ0E7WUFDR0EsSUFBSUEsV0FBV0EsR0FBR0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDcEVBLEtBQUtBLEdBQUdBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBO1lBQzFCQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNkQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUMzQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDckRBLENBQUNBO1FBRWJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO1lBQ2xCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtnQkFDbEJBLElBQUlBLENBQUNBLGVBQWVBLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBO1lBQzNDQSxJQUFJQTtnQkFDQUEsSUFBSUEsQ0FBQ0EscUJBQXFCQSxDQUFDQSxRQUFRQSxFQUFFQSxNQUFNQSxDQUFDQSxDQUFDQTtRQUNyREEsQ0FBQ0E7UUFHREEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDdkJBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFlBQVlBLEVBQUVBLEVBQUVBLElBQUlBLEVBQUVBLElBQUlBLEVBQUVBLE1BQU1BLEVBQUVBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBO0lBQy9EQSxDQUFDQTtJQUVEckksV0FBV0EsQ0FBQ0EsS0FBYUE7UUFJckJzSSxJQUFJQSxVQUFVQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNwQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDcENBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxVQUFVQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxJQUFJQTtZQUM1QixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFCLENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDVEEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDM0JBLENBQUNBO0lBRUR0SSxVQUFVQSxDQUFDQSxJQUFVQTtRQUNqQnVJLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3RCQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxPQUFPQTtZQUNsQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzNCLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDMUIsQ0FBQyxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNUQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxFQUFFQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQzlFQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxRQUFRQSxHQUFHQSxF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QUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNUQSxJQUFJQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFBQTtZQUNuQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsRUFBRUEsSUFBSUEsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDM0NBLEVBQUVBLENBQUNBLFNBQVNBLElBQUlBLGNBQWNBLENBQUNBO1FBQ3ZDQSxDQUFDQTtJQUNMQSxDQUFDQTtJQUVEdEosaUJBQWlCQSxDQUFDQSxHQUFHQSxFQUFFQSxPQUFPQTtRQUMxQnVKLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBO1lBQ3BCQSxNQUFNQSxDQUFDQTtRQUNYQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNuQ0EsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFFN0JBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLEtBQUtBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1FBQ2xDQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxNQUFNQSxFQUFFQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUVsRUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDUEEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsSUFBSUEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7Z0JBQ2hDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUE7Z0JBQ0FBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzFCQSxNQUFNQSxDQUFDQTtRQUNYQSxDQUFDQTtRQUVEQSxJQUFJQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxrQkFBa0JBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBRS9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxXQUFXQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNoQ0EsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDOURBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RCQSxNQUFNQSxDQUFDQTtZQUNYQSxDQUFDQTtRQUNMQSxDQUFDQTtRQUVEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuQkEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUM1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2JBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO2dCQUN4Q0EsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7WUFDcENBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLEVBQUVBLE1BQU1BLEVBQUVBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQzVEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsTUFBTUEsR0FBR0EsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0E7WUFDbERBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQ2xFQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNiQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFFZEEsS0FBS0EsQ0FBQ0EsZ0JBQWdCQSxHQUFHQSxLQUFLQSxDQUFDQTtZQUNuQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO1FBRURBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUlEdkosZ0JBQWdCQSxDQUFDQSxZQUFZQTtRQUN6QndKLElBQUlBLEdBQUdBLEdBQVdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBO1FBQ2pEQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNoQ0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUU1Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDTkEsTUFBTUEsQ0FBQ0E7UUFFWEEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0Esc0JBQXNCQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtRQUNsREEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsSUFBSUEsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0E7UUFFdENBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3RCQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUU1REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1BBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQzFCQSxDQUFDQTtZQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDSkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1FBQ0xBLENBQUNBO0lBQ0xBLENBQUNBO0lBRUR4SixpQkFBaUJBLENBQUNBLENBQTZDQTtRQUMzRHlKLElBQUlBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBO1FBQ25CQSxJQUFJQSxLQUFLQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQTtRQUN4QkEsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBO1FBRW5DQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNaQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN0Q0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsWUFBWUEsSUFBSUEsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBLFFBQVFBLEVBQUVBLEdBQUdBLEdBQUdBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ3JEQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxJQUFJQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUMxQkEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLFdBQVdBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQzFEQSxDQUFDQTtJQUNMQSxDQUFDQTtBQUNMekosQ0FBQ0E7QUFLRCxhQUFhLENBQUMsV0FBVyxDQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUU7SUFDNUMsSUFBSSxFQUFFO1FBQ0YsR0FBRyxFQUFFLFVBQVMsS0FBSztZQUNmLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxJQUFJLEtBQUssSUFBSSxLQUFLLENBQUM7Z0JBQ3pCLEtBQUssR0FBRyxLQUFLLENBQUM7WUFDbEIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxNQUFNLENBQUM7Z0JBQ3JCLEtBQUssR0FBRyxJQUFJLENBQUM7WUFDakIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxhQUFhLENBQUM7Z0JBQzVCLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQztZQUNmLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxPQUFPLEtBQUssSUFBSSxRQUFRLENBQUM7Z0JBQzlCLEtBQUssR0FBRyxRQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQztZQUV6QyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLEtBQUssQ0FBQztnQkFDcEIsTUFBTSxDQUFDO1lBQ1gsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNULElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDL0IsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLElBQUksR0FBRyxHQUFHLE9BQU8sS0FBSyxJQUFJLFFBQVEsR0FBRyxLQUFLLEdBQUcsSUFBSSxDQUFDO2dCQUNsRCxJQUFJLENBQUMsaUJBQWlCLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDO2dCQUNqQyxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzlCLENBQUM7WUFDRCxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUN2QixDQUFDO1FBQ0QsR0FBRyxFQUFFO1lBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDeEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDakIsTUFBTSxDQUFDLGFBQWEsQ0FBQztnQkFDekIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxHQUFHLENBQUM7b0JBQzlCLE1BQU0sQ0FBQyxNQUFNLENBQUM7Z0JBQ2xCLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ3RCLENBQUM7WUFDRCxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFDRCxVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELFVBQVUsRUFBRTtRQUVSLEdBQUcsRUFBRSxVQUFTLEdBQUc7WUFDYixHQUFHLEdBQUcsR0FBRyxJQUFJLE1BQU07a0JBQ2IsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksTUFBTTtrQkFDekIsR0FBRyxJQUFJLE1BQU0sQ0FBQztZQUNwQixFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUM7Z0JBQzFCLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDO2dCQUN2QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztvQkFDcEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7b0JBQ3RCLElBQUksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLElBQUksQ0FBQyxlQUFlLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxTQUFTLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDbEQsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBQ0QsWUFBWSxFQUFFLE1BQU07S0FDdkI7SUFDRCxlQUFlLEVBQUU7UUFDYixHQUFHLEVBQUUsY0FBYSxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JELFlBQVksRUFBRSxDQUFDO0tBQ2xCO0lBQ0QsU0FBUyxFQUFFO1FBQ1AsR0FBRyxFQUFFLFVBQVMsU0FBUztZQUNuQixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztZQUU1QixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDbkIsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDO2dCQUNWLElBQUksQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUM1QixDQUFDO1FBQ0QsWUFBWSxFQUFFLElBQUk7S0FDckI7SUFDRCxXQUFXLEVBQUUsRUFBRSxZQUFZLEVBQUUsSUFBSSxFQUFFO0lBQ25DLE9BQU8sRUFBRTtRQUNMLEdBQUcsRUFBRSxVQUFTLE9BQU87WUFDakIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssT0FBTyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztZQUV4RCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztZQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztZQUN4QixJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFDRCxZQUFZLEVBQUUsQ0FBQztRQUNmLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsU0FBUyxFQUFFO1FBQ1AsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxXQUFXLEVBQUU7UUFDVCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ25ELEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFBLENBQUMsQ0FBQztRQUNwRCxVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELElBQUksRUFBRTtRQUNGLEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUN4QyxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQSxDQUFDLENBQUM7S0FDMUM7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgc3RyaW5nUmVwZWF0fSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtfc2lnbmFsLCBkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IHtFdmVudEVtaXR0ZXJDbGFzc30gZnJvbSBcIi4vbGliL2V2ZW50X2VtaXR0ZXJcIjtcbmltcG9ydCBGb2xkTGluZSBmcm9tIFwiLi9mb2xkX2xpbmVcIjtcbmltcG9ydCBGb2xkIGZyb20gXCIuL2ZvbGRcIjtcbmltcG9ydCB7U2VsZWN0aW9ufSBmcm9tIFwiLi9zZWxlY3Rpb25cIjtcbmltcG9ydCBNb2RlIGZyb20gXCIuL21vZGUvTW9kZVwiO1xuaW1wb3J0IHtSYW5nZX0gZnJvbSBcIi4vcmFuZ2VcIjtcbmltcG9ydCB7RG9jdW1lbnR9IGZyb20gXCIuL2RvY3VtZW50XCI7XG5pbXBvcnQge0JhY2tncm91bmRUb2tlbml6ZXJ9IGZyb20gXCIuL2JhY2tncm91bmRfdG9rZW5pemVyXCI7XG5pbXBvcnQge1NlYXJjaEhpZ2hsaWdodH0gZnJvbSBcIi4vc2VhcmNoX2hpZ2hsaWdodFwiO1xuaW1wb3J0IHthc3NlcnR9IGZyb20gJy4vbGliL2Fzc2VydHMnO1xuaW1wb3J0IEJyYWNrZXRNYXRjaCBmcm9tIFwiLi9lZGl0X3Nlc3Npb24vYnJhY2tldF9tYXRjaFwiO1xuaW1wb3J0IHtVbmRvTWFuYWdlcn0gZnJvbSAnLi91bmRvbWFuYWdlcidcbmltcG9ydCBUb2tlbkl0ZXJhdG9yIGZyb20gJy4vVG9rZW5JdGVyYXRvcic7XG5cbi8vIFwiVG9rZW5zXCJcbnZhciBDSEFSID0gMSxcbiAgICBDSEFSX0VYVCA9IDIsXG4gICAgUExBQ0VIT0xERVJfU1RBUlQgPSAzLFxuICAgIFBMQUNFSE9MREVSX0JPRFkgPSA0LFxuICAgIFBVTkNUVUFUSU9OID0gOSxcbiAgICBTUEFDRSA9IDEwLFxuICAgIFRBQiA9IDExLFxuICAgIFRBQl9TUEFDRSA9IDEyO1xuXG4vLyBGb3IgZXZlcnkga2V5c3Ryb2tlIHRoaXMgZ2V0cyBjYWxsZWQgb25jZSBwZXIgY2hhciBpbiB0aGUgd2hvbGUgZG9jISFcbi8vIFdvdWxkbid0IGh1cnQgdG8gbWFrZSBpdCBhIGJpdCBmYXN0ZXIgZm9yIGMgPj0gMHgxMTAwXG5mdW5jdGlvbiBpc0Z1bGxXaWR0aChjOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBpZiAoYyA8IDB4MTEwMClcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBjID49IDB4MTEwMCAmJiBjIDw9IDB4MTE1RiB8fFxuICAgICAgICBjID49IDB4MTFBMyAmJiBjIDw9IDB4MTFBNyB8fFxuICAgICAgICBjID49IDB4MTFGQSAmJiBjIDw9IDB4MTFGRiB8fFxuICAgICAgICBjID49IDB4MjMyOSAmJiBjIDw9IDB4MjMyQSB8fFxuICAgICAgICBjID49IDB4MkU4MCAmJiBjIDw9IDB4MkU5OSB8fFxuICAgICAgICBjID49IDB4MkU5QiAmJiBjIDw9IDB4MkVGMyB8fFxuICAgICAgICBjID49IDB4MkYwMCAmJiBjIDw9IDB4MkZENSB8fFxuICAgICAgICBjID49IDB4MkZGMCAmJiBjIDw9IDB4MkZGQiB8fFxuICAgICAgICBjID49IDB4MzAwMCAmJiBjIDw9IDB4MzAzRSB8fFxuICAgICAgICBjID49IDB4MzA0MSAmJiBjIDw9IDB4MzA5NiB8fFxuICAgICAgICBjID49IDB4MzA5OSAmJiBjIDw9IDB4MzBGRiB8fFxuICAgICAgICBjID49IDB4MzEwNSAmJiBjIDw9IDB4MzEyRCB8fFxuICAgICAgICBjID49IDB4MzEzMSAmJiBjIDw9IDB4MzE4RSB8fFxuICAgICAgICBjID49IDB4MzE5MCAmJiBjIDw9IDB4MzFCQSB8fFxuICAgICAgICBjID49IDB4MzFDMCAmJiBjIDw9IDB4MzFFMyB8fFxuICAgICAgICBjID49IDB4MzFGMCAmJiBjIDw9IDB4MzIxRSB8fFxuICAgICAgICBjID49IDB4MzIyMCAmJiBjIDw9IDB4MzI0NyB8fFxuICAgICAgICBjID49IDB4MzI1MCAmJiBjIDw9IDB4MzJGRSB8fFxuICAgICAgICBjID49IDB4MzMwMCAmJiBjIDw9IDB4NERCRiB8fFxuICAgICAgICBjID49IDB4NEUwMCAmJiBjIDw9IDB4QTQ4QyB8fFxuICAgICAgICBjID49IDB4QTQ5MCAmJiBjIDw9IDB4QTRDNiB8fFxuICAgICAgICBjID49IDB4QTk2MCAmJiBjIDw9IDB4QTk3QyB8fFxuICAgICAgICBjID49IDB4QUMwMCAmJiBjIDw9IDB4RDdBMyB8fFxuICAgICAgICBjID49IDB4RDdCMCAmJiBjIDw9IDB4RDdDNiB8fFxuICAgICAgICBjID49IDB4RDdDQiAmJiBjIDw9IDB4RDdGQiB8fFxuICAgICAgICBjID49IDB4RjkwMCAmJiBjIDw9IDB4RkFGRiB8fFxuICAgICAgICBjID49IDB4RkUxMCAmJiBjIDw9IDB4RkUxOSB8fFxuICAgICAgICBjID49IDB4RkUzMCAmJiBjIDw9IDB4RkU1MiB8fFxuICAgICAgICBjID49IDB4RkU1NCAmJiBjIDw9IDB4RkU2NiB8fFxuICAgICAgICBjID49IDB4RkU2OCAmJiBjIDw9IDB4RkU2QiB8fFxuICAgICAgICBjID49IDB4RkYwMSAmJiBjIDw9IDB4RkY2MCB8fFxuICAgICAgICBjID49IDB4RkZFMCAmJiBjIDw9IDB4RkZFNjtcbn1cblxuLyoqXG4gKiBTdG9yZXMgYWxsIHRoZSBkYXRhIGFib3V0IFtbRWRpdG9yIGBFZGl0b3JgXV0gc3RhdGUgcHJvdmlkaW5nIGVhc3kgd2F5IHRvIGNoYW5nZSBlZGl0b3JzIHN0YXRlLlxuICpcbiAqIGBFZGl0U2Vzc2lvbmAgY2FuIGJlIGF0dGFjaGVkIHRvIG9ubHkgb25lIFtbRG9jdW1lbnQgYERvY3VtZW50YF1dLiBTYW1lIGBEb2N1bWVudGAgY2FuIGJlIGF0dGFjaGVkIHRvIHNldmVyYWwgYEVkaXRTZXNzaW9uYHMuXG4gKiBAY2xhc3MgRWRpdFNlc3Npb25cbiAqKi9cblxuLy97IGV2ZW50c1xuLyoqXG4gKlxuICogRW1pdHRlZCB3aGVuIHRoZSBkb2N1bWVudCBjaGFuZ2VzLlxuICogQGV2ZW50IGNoYW5nZVxuICogQHBhcmFtIHtPYmplY3R9IGUgQW4gb2JqZWN0IGNvbnRhaW5pbmcgYSBgZGVsdGFgIG9mIGluZm9ybWF0aW9uIGFib3V0IHRoZSBjaGFuZ2UuXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgdGFiIHNpemUgY2hhbmdlcywgdmlhIFtbRWRpdFNlc3Npb24uc2V0VGFiU2l6ZV1dLlxuICpcbiAqIEBldmVudCBjaGFuZ2VUYWJTaXplXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgYWJpbGl0eSB0byBvdmVyd3JpdGUgdGV4dCBjaGFuZ2VzLCB2aWEgW1tFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGVdXS5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlT3ZlcndyaXRlXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgZ3V0dGVyIGNoYW5nZXMsIGVpdGhlciBieSBzZXR0aW5nIG9yIHJlbW92aW5nIGJyZWFrcG9pbnRzLCBvciB3aGVuIHRoZSBndXR0ZXIgZGVjb3JhdGlvbnMgY2hhbmdlLlxuICpcbiAqIEBldmVudCBjaGFuZ2VCcmVha3BvaW50XG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhIGZyb250IG1hcmtlciBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VGcm9udE1hcmtlclxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBiYWNrIG1hcmtlciBjaGFuZ2VzLlxuICpcbiAqIEBldmVudCBjaGFuZ2VCYWNrTWFya2VyXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiBhbiBhbm5vdGF0aW9uIGNoYW5nZXMsIGxpa2UgdGhyb3VnaCBbW0VkaXRTZXNzaW9uLnNldEFubm90YXRpb25zXV0uXG4gKlxuICogQGV2ZW50IGNoYW5nZUFubm90YXRpb25cbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIGEgYmFja2dyb3VuZCB0b2tlbml6ZXIgYXN5bmNocm9ub3VzbHkgcHJvY2Vzc2VzIG5ldyByb3dzLlxuICogQGV2ZW50IHRva2VuaXplclVwZGF0ZVxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBlIEFuIG9iamVjdCBjb250YWluaW5nIG9uZSBwcm9wZXJ0eSwgYFwiZGF0YVwiYCwgdGhhdCBjb250YWlucyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgY2hhbmdpbmcgcm93c1xuICpcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSBjdXJyZW50IG1vZGUgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlTW9kZVxuICpcbiAqKi9cbi8qKlxuICogRW1pdHRlZCB3aGVuIHRoZSB3cmFwIG1vZGUgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlV3JhcE1vZGVcbiAqXG4gKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgd3JhcHBpbmcgbGltaXQgY2hhbmdlcy5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlV3JhcExpbWl0XG4gKlxuICoqL1xuLyoqXG4gKiBFbWl0dGVkIHdoZW4gYSBjb2RlIGZvbGQgaXMgYWRkZWQgb3IgcmVtb3ZlZC5cbiAqXG4gKiBAZXZlbnQgY2hhbmdlRm9sZFxuICpcbiAqKi9cbi8qKlxuKiBFbWl0dGVkIHdoZW4gdGhlIHNjcm9sbCB0b3AgY2hhbmdlcy5cbiogQGV2ZW50IGNoYW5nZVNjcm9sbFRvcFxuKlxuKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBuZXcgc2Nyb2xsIHRvcCB2YWx1ZVxuKiovXG4vKipcbiAqIEVtaXR0ZWQgd2hlbiB0aGUgc2Nyb2xsIGxlZnQgY2hhbmdlcy5cbiAqIEBldmVudCBjaGFuZ2VTY3JvbGxMZWZ0XG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHNjcm9sbExlZnQgVGhlIG5ldyBzY3JvbGwgbGVmdCB2YWx1ZVxuICoqL1xuLy99XG5cbi8qKlxuICpcbiAqIFNldHMgdXAgYSBuZXcgYEVkaXRTZXNzaW9uYCBhbmQgYXNzb2NpYXRlcyBpdCB3aXRoIHRoZSBnaXZlbiBgRG9jdW1lbnRgIGFuZCBgVGV4dE1vZGVgLlxuICogQHBhcmFtIHtEb2N1bWVudCB8IFN0cmluZ30gdGV4dCBbSWYgYHRleHRgIGlzIGEgYERvY3VtZW50YCwgaXQgYXNzb2NpYXRlcyB0aGUgYEVkaXRTZXNzaW9uYCB3aXRoIGl0LiBPdGhlcndpc2UsIGEgbmV3IGBEb2N1bWVudGAgaXMgY3JlYXRlZCwgd2l0aCB0aGUgaW5pdGlhbCB0ZXh0XXs6ICN0ZXh0UGFyYW19XG4gKiBAcGFyYW0ge1RleHRNb2RlfSBtb2RlIFtUaGUgaW5pdGFsIGxhbmd1YWdlIG1vZGUgdG8gdXNlIGZvciB0aGUgZG9jdW1lbnRdezogI21vZGVQYXJhbX1cbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqKi9cblxuZXhwb3J0IGNsYXNzIEVkaXRTZXNzaW9uIGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3Mge1xuICAgIHB1YmxpYyAkYnJlYWtwb2ludHM6IHN0cmluZ1tdID0gW107XG4gICAgcHVibGljICRkZWNvcmF0aW9uczogc3RyaW5nW10gPSBbXTtcbiAgICBwcml2YXRlICRmcm9udE1hcmtlcnMgPSB7fTtcbiAgICBwdWJsaWMgJGJhY2tNYXJrZXJzID0ge307XG4gICAgcHJpdmF0ZSAkbWFya2VySWQgPSAxO1xuICAgIHByaXZhdGUgJHVuZG9TZWxlY3QgPSB0cnVlO1xuICAgIHByaXZhdGUgJGRlbHRhcztcbiAgICBwcml2YXRlICRkZWx0YXNEb2M7XG4gICAgcHJpdmF0ZSAkZGVsdGFzRm9sZDtcbiAgICBwcml2YXRlICRmcm9tVW5kbztcblxuICAgIHByaXZhdGUgJHVwZGF0ZUZvbGRXaWRnZXRzOiAoKSA9PiBhbnk7XG4gICAgcHJpdmF0ZSAkZm9sZERhdGE6IEZvbGRMaW5lW107XG4gICAgcHVibGljIGZvbGRXaWRnZXRzOiBhbnlbXTtcbiAgICBwdWJsaWMgZ2V0Rm9sZFdpZGdldDogKHJvdzogbnVtYmVyKSA9PiBhbnk7XG4gICAgcHVibGljIGdldEZvbGRXaWRnZXRSYW5nZTogKHJvdzogbnVtYmVyLCBmb3JjZU11bHRpbGluZT86IGJvb2xlYW4pID0+IFJhbmdlO1xuXG4gICAgcHVibGljIGRvYzogRG9jdW1lbnQ7XG4gICAgcHJpdmF0ZSAkZGVmYXVsdFVuZG9NYW5hZ2VyID0geyB1bmRvOiBmdW5jdGlvbigpIHsgfSwgcmVkbzogZnVuY3Rpb24oKSB7IH0sIHJlc2V0OiBmdW5jdGlvbigpIHsgfSB9O1xuICAgIHByaXZhdGUgJHVuZG9NYW5hZ2VyOiBVbmRvTWFuYWdlcjtcbiAgICBwcml2YXRlICRpbmZvcm1VbmRvTWFuYWdlcjogeyBjYW5jZWw6ICgpID0+IHZvaWQ7IHNjaGVkdWxlOiAoKSA9PiB2b2lkIH07XG4gICAgcHVibGljIGJnVG9rZW5pemVyOiBCYWNrZ3JvdW5kVG9rZW5pemVyO1xuICAgIHB1YmxpYyAkbW9kaWZpZWQ7XG4gICAgcHVibGljIHNlbGVjdGlvbjogU2VsZWN0aW9uO1xuICAgIHByaXZhdGUgJGRvY1Jvd0NhY2hlOiBudW1iZXJbXTtcbiAgICBwcml2YXRlICR3cmFwRGF0YTogbnVtYmVyW11bXTtcbiAgICBwcml2YXRlICRzY3JlZW5Sb3dDYWNoZTogbnVtYmVyW107XG4gICAgcHJpdmF0ZSAkcm93TGVuZ3RoQ2FjaGU7XG4gICAgcHJpdmF0ZSAkb3ZlcndyaXRlID0gZmFsc2U7XG4gICAgcHVibGljICRzZWFyY2hIaWdobGlnaHQ7XG4gICAgcHJpdmF0ZSAkYW5ub3RhdGlvbnM7XG4gICAgcHJpdmF0ZSAkYXV0b05ld0xpbmU7XG4gICAgcHJpdmF0ZSBnZXRPcHRpb247XG4gICAgcHJpdmF0ZSBzZXRPcHRpb247XG4gICAgcHJpdmF0ZSAkdXNlV29ya2VyO1xuICAgIC8qKlxuICAgICAqXG4gICAgICovXG4gICAgcHJpdmF0ZSAkbW9kZXM6IHsgW3BhdGg6IHN0cmluZ106IE1vZGUgfSA9IHt9O1xuICAgIC8qKlxuICAgICAqXG4gICAgICovXG4gICAgcHVibGljICRtb2RlOiBNb2RlID0gbnVsbDtcbiAgICBwcml2YXRlICRtb2RlSWQgPSBudWxsO1xuICAgIHByaXZhdGUgJHdvcmtlcjtcbiAgICBwcml2YXRlICRvcHRpb25zO1xuICAgIHB1YmxpYyB0b2tlblJlOiBSZWdFeHA7XG4gICAgcHVibGljIG5vblRva2VuUmU6IFJlZ0V4cDtcbiAgICBwdWJsaWMgJHNjcm9sbFRvcCA9IDA7XG4gICAgcHJpdmF0ZSAkc2Nyb2xsTGVmdCA9IDA7XG4gICAgLy8gV1JBUE1PREVcbiAgICBwcml2YXRlICR3cmFwQXNDb2RlO1xuICAgIHByaXZhdGUgJHdyYXBMaW1pdCA9IDgwO1xuICAgIHB1YmxpYyAkdXNlV3JhcE1vZGUgPSBmYWxzZTtcbiAgICBwcml2YXRlICR3cmFwTGltaXRSYW5nZSA9IHtcbiAgICAgICAgbWluOiBudWxsLFxuICAgICAgICBtYXg6IG51bGxcbiAgICB9O1xuICAgIHB1YmxpYyAkdXBkYXRpbmc7XG4gICAgcHVibGljIGxpbmVXaWRnZXRzID0gbnVsbDtcbiAgICBwcml2YXRlICRvbkNoYW5nZSA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcbiAgICBwcml2YXRlICRzeW5jSW5mb3JtVW5kb01hbmFnZXI6ICgpID0+IHZvaWQ7XG4gICAgcHVibGljIG1lcmdlVW5kb0RlbHRhczogYm9vbGVhbjtcbiAgICBwcml2YXRlICR1c2VTb2Z0VGFiczogYm9vbGVhbjtcbiAgICBwcml2YXRlICR0YWJTaXplOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkd3JhcE1ldGhvZDtcbiAgICBwcml2YXRlIHNjcmVlbldpZHRoO1xuICAgIHByaXZhdGUgbGluZVdpZGdldHNXaWR0aDtcbiAgICBwcml2YXRlIGxpbmVXaWRnZXRXaWR0aDtcbiAgICBwcml2YXRlICRnZXRXaWRnZXRTY3JlZW5MZW5ndGg7XG4gICAgLy9cbiAgICBwdWJsaWMgJHRhZ0hpZ2hsaWdodDtcbiAgICBwdWJsaWMgJGJyYWNrZXRIaWdobGlnaHQ6IG51bWJlcjsgICAvLyBhIG1hcmtlci5cbiAgICBwdWJsaWMgJGhpZ2hsaWdodExpbmVNYXJrZXI7ICAgICAgICAvLyBOb3QgYSBtYXJrZXIhXG4gICAgLyoqXG4gICAgICogQSBudW1iZXIgaXMgYSBtYXJrZXIgaWRlbnRpZmllciwgbnVsbCBpbmRpY2F0ZXMgdGhhdCBubyBzdWNoIG1hcmtlciBleGlzdHMuIFxuICAgICAqL1xuICAgIHB1YmxpYyAkc2VsZWN0aW9uTWFya2VyOiBudW1iZXIgPSBudWxsO1xuICAgIHByaXZhdGUgJGJyYWNrZXRNYXRjaGVyID0gbmV3IEJyYWNrZXRNYXRjaCh0aGlzKTtcbiAgICAvKipcbiAgICAgKiBAcGFyYW0gW3RleHRdIHtzdHJpbmd8RG9jdW1lbnR9IFRoZSBkb2N1bWVudCBvciBzdHJpbmcgb3ZlciB3aGljaCB0aGlzIGVkaXQgc2Vzc2lvbiB3b3Jrcy5cbiAgICAgKiBAcGFyYW0gW21vZGVdXG4gICAgICovXG4gICAgY29uc3RydWN0b3IodGV4dDogYW55LCBtb2RlPykge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcIlxcblwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLm9uQ2hhbmdlRm9sZC5iaW5kKHRoaXMpKTtcblxuICAgICAgICAvLyBUaGUgZmlyc3QgYXJndW1lbnQgbWF5IGJlIGVpdGhlciBhIHN0cmluZyBvciBhIERvY3VtZW50LlxuICAgICAgICAvLyBJdCBtaWdodCBldmVuIGJlIGEgc3RyaW5nW10uXG4gICAgICAgIC8vIEZJWE1FOiBNYXkgYmUgYmV0dGVyIGZvciBjb25zdHJ1Y3RvcnMgdG8gbWFrZSBhIGNob2ljZS5cbiAgICAgICAgLy8gQ29udmVuaWVuY2UgZnVuY3Rpb24gY291bGQgYmUgYWRkZWQuXG4gICAgICAgIGlmICh0eXBlb2YgdGV4dCAhPT0gXCJvYmplY3RcIiB8fCAhdGV4dC5nZXRMaW5lKSB7XG4gICAgICAgICAgICB0aGlzLnNldERvY3VtZW50KG5ldyBEb2N1bWVudCh0ZXh0KSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnNldERvY3VtZW50KHRleHQpXG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24odGhpcyk7XG5cbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICB0aGlzLnNldE1vZGUobW9kZSk7XG4gICAgICAgIF9zaWduYWwoXCJzZXNzaW9uXCIsIHRoaXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGBFZGl0U2Vzc2lvbmAgdG8gcG9pbnQgdG8gYSBuZXcgYERvY3VtZW50YC4gSWYgYSBgQmFja2dyb3VuZFRva2VuaXplcmAgZXhpc3RzLCBpdCBhbHNvIHBvaW50cyB0byBgZG9jYC5cbiAgICAgKiBAbWV0aG9kIHNldERvY3VtZW50XG4gICAgICogQHBhcmFtIGRvYyB7RG9jdW1lbnR9IFRoZSBuZXcgYERvY3VtZW50YCB0byB1c2UuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwcml2YXRlIHNldERvY3VtZW50KGRvYzogRG9jdW1lbnQpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuZG9jKSB7XG4gICAgICAgICAgICB0aGlzLmRvYy5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmRvYyA9IGRvYztcbiAgICAgICAgZG9jLm9uKFwiY2hhbmdlXCIsIHRoaXMuJG9uQ2hhbmdlKTtcblxuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZXNldENhY2hlcygpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGBEb2N1bWVudGAgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc2Vzc2lvbi5cbiAgICAgKiBAbWV0aG9kIGdldERvY3VtZW50XG4gICAgICogQHJldHVybiB7RG9jdW1lbnR9XG4gICAgICovXG4gICAgcHVibGljIGdldERvY3VtZW50KCk6IERvY3VtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHJlc2V0Um93Q2FjaGVcbiAgICAgKiBAcGFyYW0ge251bWJlcn0gcm93IFRoZSByb3cgdG8gd29yayB3aXRoXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHByaXZhdGUgJHJlc2V0Um93Q2FjaGUoZG9jUm93OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKCFkb2NSb3cpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlID0gW107XG4gICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZSA9IFtdO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHZhciBsID0gdGhpcy4kZG9jUm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgodGhpcy4kZG9jUm93Q2FjaGUsIGRvY1JvdykgKyAxO1xuICAgICAgICBpZiAobCA+IGkpIHtcbiAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnNwbGljZShpLCBsKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFJvd0NhY2hlSW5kZXgoY2FjaGVBcnJheTogbnVtYmVyW10sIHZhbDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGxvdyA9IDA7XG4gICAgICAgIHZhciBoaSA9IGNhY2hlQXJyYXkubGVuZ3RoIC0gMTtcblxuICAgICAgICB3aGlsZSAobG93IDw9IGhpKSB7XG4gICAgICAgICAgICB2YXIgbWlkID0gKGxvdyArIGhpKSA+PiAxO1xuICAgICAgICAgICAgdmFyIGMgPSBjYWNoZUFycmF5W21pZF07XG5cbiAgICAgICAgICAgIGlmICh2YWwgPiBjKSB7XG4gICAgICAgICAgICAgICAgbG93ID0gbWlkICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbCA8IGMpIHtcbiAgICAgICAgICAgICAgICBoaSA9IG1pZCAtIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbWlkO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxvdyAtIDE7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSByZXNldENhY2hlcygpIHtcbiAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IFtdO1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICBpZiAodGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2VGb2xkKGUpIHtcbiAgICAgICAgdmFyIGZvbGQgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoZm9sZC5zdGFydC5yb3cpO1xuICAgIH1cblxuICAgIHByaXZhdGUgb25DaGFuZ2UoZSkge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcblxuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKGRlbHRhLnJhbmdlLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgdmFyIHJlbW92ZWRGb2xkcyA9IHRoaXMuJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGUpO1xuICAgICAgICBpZiAoIXRoaXMuJGZyb21VbmRvICYmIHRoaXMuJHVuZG9NYW5hZ2VyICYmICFkZWx0YS5pZ25vcmUpIHtcbiAgICAgICAgICAgIHRoaXMuJGRlbHRhc0RvYy5wdXNoKGRlbHRhKTtcbiAgICAgICAgICAgIGlmIChyZW1vdmVkRm9sZHMgJiYgcmVtb3ZlZEZvbGRzLmxlbmd0aCAhPSAwKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZGVsdGFzRm9sZC5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcInJlbW92ZUZvbGRzXCIsXG4gICAgICAgICAgICAgICAgICAgIGZvbGRzOiByZW1vdmVkRm9sZHNcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIuc2NoZWR1bGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuJHVwZGF0ZU9uQ2hhbmdlKGRlbHRhKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlXCIsIGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIHNlc3Npb24gdGV4dC5cbiAgICAgKiBAbWV0aG9kIHNldFZhbHVlXG4gICAgICogQHBhcmFtIHRleHQge3N0cmluZ30gVGhlIG5ldyB0ZXh0IHRvIHBsYWNlLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFZhbHVlKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuICAgICAgICB0aGlzLmRvYy5zZXRWYWx1ZSh0ZXh0KTtcbiAgICAgICAgdGhpcy5zZWxlY3Rpb24ubW92ZVRvKDAsIDApO1xuXG4gICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgIHRoaXMuJGRlbHRhcyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuICAgICAgICB0aGlzLnNldFVuZG9NYW5hZ2VyKHRoaXMuJHVuZG9NYW5hZ2VyKTtcbiAgICAgICAgdGhpcy5nZXRVbmRvTWFuYWdlcigpLnJlc2V0KCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IFtbRG9jdW1lbnQgYERvY3VtZW50YF1dIGFzIGEgc3RyaW5nLlxuICAgICogQG1ldGhvZCB0b1N0cmluZ1xuICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICoqL1xuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCBbW0RvY3VtZW50IGBEb2N1bWVudGBdXSBhcyBhIHN0cmluZy5cbiAgICAqIEBtZXRob2QgZ2V0VmFsdWVcbiAgICAqIEByZXR1cm5zIHtzdHJpbmd9XG4gICAgKiBAYWxpYXMgRWRpdFNlc3Npb24udG9TdHJpbmdcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VmFsdWUoKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFZhbHVlKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgb2YgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6QmFja2dyb3VuZFRva2VuaXplci5nZXRTdGF0ZX1cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc3RhcnQgYXRcbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEJhY2tncm91bmRUb2tlbml6ZXIuZ2V0U3RhdGVcbiAgICAgKiovXG4gICAgcHVibGljIGdldFN0YXRlKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYmdUb2tlbml6ZXIuZ2V0U3RhdGUocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgdG9rZW5pemluZyBhdCB0aGUgcm93IGluZGljYXRlZC4gUmV0dXJucyBhIGxpc3Qgb2Ygb2JqZWN0cyBvZiB0aGUgdG9rZW5pemVkIHJvd3MuXG4gICAgICogQG1ldGhvZCBnZXRUb2tlbnNcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9IFRoZSByb3cgdG8gc3RhcnQgYXQuXG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRUb2tlbnMocm93OiBudW1iZXIpOiB7IHN0YXJ0OiBudW1iZXI7IHR5cGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gb2JqZWN0IGluZGljYXRpbmcgdGhlIHRva2VuIGF0IHRoZSBjdXJyZW50IHJvdy4gVGhlIG9iamVjdCBoYXMgdHdvIHByb3BlcnRpZXM6IGBpbmRleGAgYW5kIGBzdGFydGAuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiBudW1iZXIgdG8gcmV0cmlldmUgZnJvbVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGdldFRva2VuQXQocm93OiBudW1iZXIsIGNvbHVtbj86IG51bWJlcikge1xuICAgICAgICB2YXIgdG9rZW5zOiB7IHZhbHVlOiBzdHJpbmcgfVtdID0gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICAgICAgdmFyIHRva2VuOiB7IGluZGV4PzogbnVtYmVyOyBzdGFydD86IG51bWJlcjsgdmFsdWU6IHN0cmluZyB9O1xuICAgICAgICB2YXIgYyA9IDA7XG4gICAgICAgIGlmIChjb2x1bW4gPT0gbnVsbCkge1xuICAgICAgICAgICAgaSA9IHRva2Vucy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgYyA9IHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgYyArPSB0b2tlbnNbaV0udmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlmIChjID49IGNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgdG9rZW4uaW5kZXggPSBpO1xuICAgICAgICB0b2tlbi5zdGFydCA9IGMgLSB0b2tlbi52YWx1ZS5sZW5ndGg7XG4gICAgICAgIHJldHVybiB0b2tlbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgdGhlIHVuZG8gbWFuYWdlci5cbiAgICAqIEBwYXJhbSB7VW5kb01hbmFnZXJ9IHVuZG9NYW5hZ2VyIFRoZSBuZXcgdW5kbyBtYW5hZ2VyXG4gICAgKiovXG4gICAgcHVibGljIHNldFVuZG9NYW5hZ2VyKHVuZG9NYW5hZ2VyOiBVbmRvTWFuYWdlcik6IHZvaWQge1xuICAgICAgICB0aGlzLiR1bmRvTWFuYWdlciA9IHVuZG9NYW5hZ2VyO1xuICAgICAgICB0aGlzLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQgPSBbXTtcblxuICAgICAgICBpZiAodGhpcy4kaW5mb3JtVW5kb01hbmFnZXIpXG4gICAgICAgICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlci5jYW5jZWwoKTtcblxuICAgICAgICBpZiAodW5kb01hbmFnZXIpIHtcbiAgICAgICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgc2VsZi4kaW5mb3JtVW5kb01hbmFnZXIuY2FuY2VsKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzRm9sZC5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgZ3JvdXA6IFwiZm9sZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsdGFzOiBzZWxmLiRkZWx0YXNGb2xkXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXNGb2xkID0gW107XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhc0RvYy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICAgICAgZ3JvdXA6IFwiZG9jXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWx0YXM6IHNlbGYuJGRlbHRhc0RvY1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzRG9jID0gW107XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGYuJGRlbHRhcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHVuZG9NYW5hZ2VyLmV4ZWN1dGUoe1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aW9uOiBcImFjZXVwZGF0ZVwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgYXJnczogW3NlbGYuJGRlbHRhcywgc2VsZl0sXG4gICAgICAgICAgICAgICAgICAgICAgICBtZXJnZTogc2VsZi5tZXJnZVVuZG9EZWx0YXNcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHNlbGYubWVyZ2VVbmRvRGVsdGFzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgc2VsZi4kZGVsdGFzID0gW107XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGhpcy4kaW5mb3JtVW5kb01hbmFnZXIgPSBkZWxheWVkQ2FsbCh0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogc3RhcnRzIGEgbmV3IGdyb3VwIGluIHVuZG8gaGlzdG9yeVxuICAgICAqKi9cbiAgICBwcml2YXRlIG1hcmtVbmRvR3JvdXAoKSB7XG4gICAgICAgIGlmICh0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIpXG4gICAgICAgICAgICB0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdW5kbyBtYW5hZ2VyLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRVbmRvTWFuYWdlcigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHVuZG9NYW5hZ2VyIHx8IHRoaXMuJGRlZmF1bHRVbmRvTWFuYWdlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdmFsdWUgZm9yIHRhYnMuIElmIHRoZSB1c2VyIGlzIHVzaW5nIHNvZnQgdGFicywgdGhpcyB3aWxsIGJlIGEgc2VyaWVzIG9mIHNwYWNlcyAoZGVmaW5lZCBieSBbW0VkaXRTZXNzaW9uLmdldFRhYlNpemUgYGdldFRhYlNpemUoKWBdXSk7IG90aGVyd2lzZSBpdCdzIHNpbXBseSBgJ1xcdCdgLlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRUYWJTdHJpbmcoKSB7XG4gICAgICAgIGlmICh0aGlzLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBzdHJpbmdSZXBlYXQoXCIgXCIsIHRoaXMuZ2V0VGFiU2l6ZSgpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgLyoqXG4gICAgKiBQYXNzIGB0cnVlYCB0byBlbmFibGUgdGhlIHVzZSBvZiBzb2Z0IHRhYnMuIFNvZnQgdGFicyBtZWFucyB5b3UncmUgdXNpbmcgc3BhY2VzIGluc3RlYWQgb2YgdGhlIHRhYiBjaGFyYWN0ZXIgKGAnXFx0J2ApLlxuICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VTb2Z0VGFicyBWYWx1ZSBpbmRpY2F0aW5nIHdoZXRoZXIgb3Igbm90IHRvIHVzZSBzb2Z0IHRhYnNcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVzZVNvZnRUYWJzKHZhbCkge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInVzZVNvZnRUYWJzXCIsIHZhbCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBzb2Z0IHRhYnMgYXJlIGJlaW5nIHVzZWQsIGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgcHVibGljIGdldFVzZVNvZnRUYWJzKCkge1xuICAgICAgICAvLyB0b2RvIG1pZ2h0IG5lZWQgbW9yZSBnZW5lcmFsIHdheSBmb3IgY2hhbmdpbmcgc2V0dGluZ3MgZnJvbSBtb2RlLCBidXQgdGhpcyBpcyBvayBmb3Igbm93XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAhdGhpcy4kbW9kZS4kaW5kZW50V2l0aFRhYnM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBTZXQgdGhlIG51bWJlciBvZiBzcGFjZXMgdGhhdCBkZWZpbmUgYSBzb2Z0IHRhYi5cbiAgICAqIEZvciBleGFtcGxlLCBwYXNzaW5nIGluIGA0YCB0cmFuc2Zvcm1zIHRoZSBzb2Z0IHRhYnMgdG8gYmUgZXF1aXZhbGVudCB0byBmb3VyIHNwYWNlcy5cbiAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0cyB0aGUgYGNoYW5nZVRhYlNpemVgIGV2ZW50LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHRhYlNpemUgVGhlIG5ldyB0YWIgc2l6ZVxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VGFiU2l6ZSh0YWJTaXplOiBudW1iZXIpIHtcbiAgICAgICAgdGhpcy5zZXRPcHRpb24oXCJ0YWJTaXplXCIsIHRhYlNpemUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB0YWIgc2l6ZS5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0VGFiU2l6ZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHRhYlNpemU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY2hhcmFjdGVyIGF0IHRoZSBwb3NpdGlvbiBpcyBhIHNvZnQgdGFiLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB0byBjaGVja1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGlzVGFiU3RvcChwb3NpdGlvbjogeyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAocG9zaXRpb24uY29sdW1uICUgdGhpcy4kdGFiU2l6ZSA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBQYXNzIGluIGB0cnVlYCB0byBlbmFibGUgb3ZlcndyaXRlcyBpbiB5b3VyIHNlc3Npb24sIG9yIGBmYWxzZWAgdG8gZGlzYWJsZS5cbiAgICAqXG4gICAgKiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICpcbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGhlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwib3ZlcndyaXRlXCIsIG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0T3ZlcndyaXRlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kb3ZlcndyaXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgdmFsdWUgb2Ygb3ZlcndyaXRlIHRvIHRoZSBvcHBvc2l0ZSBvZiB3aGF0ZXZlciBpdCBjdXJyZW50bHkgaXMuXG4gICAgKiovXG4gICAgcHVibGljIHRvZ2dsZU92ZXJ3cml0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPdmVyd3JpdGUoIXRoaXMuJG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBgY2xhc3NOYW1lYCB0byB0aGUgYHJvd2AsIHRvIGJlIHVzZWQgZm9yIENTUyBzdHlsaW5ncyBhbmQgd2hhdG5vdC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIGFkZEd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy4kZGVjb3JhdGlvbnNbcm93XSkge1xuICAgICAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSArPSBcIiBcIiArIGNsYXNzTmFtZTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBgY2xhc3NOYW1lYCBmcm9tIHRoZSBgcm93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gPSAodGhpcy4kZGVjb3JhdGlvbnNbcm93XSB8fCBcIlwiKS5yZXBsYWNlKFwiIFwiICsgY2xhc3NOYW1lLCBcIlwiKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIG51bWJlcnMsIGluZGljYXRpbmcgd2hpY2ggcm93cyBoYXZlIGJyZWFrcG9pbnRzLlxuICAgICogQHJldHVybnMge1tOdW1iZXJdfVxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0QnJlYWtwb2ludHMoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmVha3BvaW50cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgYSBicmVha3BvaW50IG9uIGV2ZXJ5IHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7QXJyYXl9IHJvd3MgQW4gYXJyYXkgb2Ygcm93IGluZGljZXNcbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldEJyZWFrcG9pbnRzKHJvd3M6IG51bWJlcltdKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcm93cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93c1tpXV0gPSBcImFjZV9icmVha3BvaW50XCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZW1vdmVzIGFsbCBicmVha3BvaW50cyBvbiB0aGUgcm93cy4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBjbGVhckJyZWFrcG9pbnRzKCkge1xuICAgICAgICB0aGlzLiRicmVha3BvaW50cyA9IFtdO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNldHMgYSBicmVha3BvaW50IG9uIHRoZSByb3cgbnVtYmVyIGdpdmVuIGJ5IGByb3dzYC4gVGhpcyBmdW5jdGlvbiBhbHNvIGVtaXRlcyB0aGUgYCdjaGFuZ2VCcmVha3BvaW50J2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IEEgcm93IGluZGV4XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhc3NOYW1lIENsYXNzIG9mIHRoZSBicmVha3BvaW50XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldEJyZWFrcG9pbnQocm93LCBjbGFzc05hbWUpIHtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgY2xhc3NOYW1lID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgICAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93XSA9IGNsYXNzTmFtZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVtb3ZlcyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgY2xlYXJCcmVha3BvaW50KHJvdykge1xuICAgICAgICBkZWxldGUgdGhpcy4kYnJlYWtwb2ludHNbcm93XTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBBZGRzIGEgbmV3IG1hcmtlciB0byB0aGUgZ2l2ZW4gYFJhbmdlYC4gSWYgYGluRnJvbnRgIGlzIGB0cnVlYCwgYSBmcm9udCBtYXJrZXIgaXMgZGVmaW5lZCwgYW5kIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgZmlyZXM7IG90aGVyd2lzZSwgdGhlIGAnY2hhbmdlQmFja01hcmtlcidgIGV2ZW50IGZpcmVzLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgRGVmaW5lIHRoZSByYW5nZSBvZiB0aGUgbWFya2VyXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gY2xhenogU2V0IHRoZSBDU1MgY2xhc3MgZm9yIHRoZSBtYXJrZXJcbiAgICAqIEBwYXJhbSB7RnVuY3Rpb24gfCBTdHJpbmd9IHR5cGUgSWRlbnRpZnkgdGhlIHR5cGUgb2YgdGhlIG1hcmtlclxuICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge051bWJlcn0gVGhlIG5ldyBtYXJrZXIgaWRcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRkTWFya2VyKHJhbmdlOiBSYW5nZSwgY2xheno6IHN0cmluZywgdHlwZSwgaW5Gcm9udD86IGJvb2xlYW4pOiBudW1iZXIge1xuICAgICAgICB2YXIgaWQgPSB0aGlzLiRtYXJrZXJJZCsrO1xuXG4gICAgICAgIHZhciBtYXJrZXIgPSB7XG4gICAgICAgICAgICByYW5nZTogcmFuZ2UsXG4gICAgICAgICAgICB0eXBlOiB0eXBlIHx8IFwibGluZVwiLFxuICAgICAgICAgICAgcmVuZGVyZXI6IHR5cGVvZiB0eXBlID09IFwiZnVuY3Rpb25cIiA/IHR5cGUgOiBudWxsLFxuICAgICAgICAgICAgY2xheno6IGNsYXp6LFxuICAgICAgICAgICAgaW5Gcm9udDogISFpbkZyb250LFxuICAgICAgICAgICAgaWQ6IGlkXG4gICAgICAgIH07XG5cbiAgICAgICAgaWYgKGluRnJvbnQpIHtcbiAgICAgICAgICAgIHRoaXMuJGZyb250TWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VGcm9udE1hcmtlclwiKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGJhY2tNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaWQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIGR5bmFtaWMgbWFya2VyIHRvIHRoZSBzZXNzaW9uLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBtYXJrZXIgb2JqZWN0IHdpdGggdXBkYXRlIG1ldGhvZFxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gaW5Gcm9udCBTZXQgdG8gYHRydWVgIHRvIGVzdGFibGlzaCBhIGZyb250IG1hcmtlclxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBhZGRlZCBtYXJrZXJcbiAgICAgKiovXG4gICAgcHJpdmF0ZSBhZGREeW5hbWljTWFya2VyKG1hcmtlciwgaW5Gcm9udD8pIHtcbiAgICAgICAgaWYgKCFtYXJrZXIudXBkYXRlKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgaWQgPSB0aGlzLiRtYXJrZXJJZCsrO1xuICAgICAgICBtYXJrZXIuaWQgPSBpZDtcbiAgICAgICAgbWFya2VyLmluRnJvbnQgPSAhIWluRnJvbnQ7XG5cbiAgICAgICAgaWYgKGluRnJvbnQpIHtcbiAgICAgICAgICAgIHRoaXMuJGZyb250TWFya2Vyc1tpZF0gPSBtYXJrZXI7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VGcm9udE1hcmtlclwiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuJGJhY2tNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbWFya2VyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVtb3ZlcyB0aGUgbWFya2VyIHdpdGggdGhlIHNwZWNpZmllZCBJRC4gSWYgdGhpcyBtYXJrZXIgd2FzIGluIGZyb250LCB0aGUgYCdjaGFuZ2VGcm9udE1hcmtlcidgIGV2ZW50IGlzIGVtaXR0ZWQuIElmIHRoZSBtYXJrZXIgd2FzIGluIHRoZSBiYWNrLCB0aGUgYCdjaGFuZ2VCYWNrTWFya2VyJ2AgZXZlbnQgaXMgZW1pdHRlZC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXJrZXJJZCBBIG51bWJlciByZXByZXNlbnRpbmcgYSBtYXJrZXJcbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgcmVtb3ZlTWFya2VyKG1hcmtlcklkKSB7XG4gICAgICAgIHZhciBtYXJrZXIgPSB0aGlzLiRmcm9udE1hcmtlcnNbbWFya2VySWRdIHx8IHRoaXMuJGJhY2tNYXJrZXJzW21hcmtlcklkXTtcbiAgICAgICAgaWYgKCFtYXJrZXIpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdmFyIG1hcmtlcnMgPSBtYXJrZXIuaW5Gcm9udCA/IHRoaXMuJGZyb250TWFya2VycyA6IHRoaXMuJGJhY2tNYXJrZXJzO1xuICAgICAgICBpZiAobWFya2VyKSB7XG4gICAgICAgICAgICBkZWxldGUgKG1hcmtlcnNbbWFya2VySWRdKTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChtYXJrZXIuaW5Gcm9udCA/IFwiY2hhbmdlRnJvbnRNYXJrZXJcIiA6IFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBJRHMgb2YgYWxsIHRoZSBtYXJrZXJzLCBlaXRoZXIgZnJvbnQgb3IgYmFjay5cbiAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gaW5Gcm9udCBJZiBgdHJ1ZWAsIGluZGljYXRlcyB5b3Ugb25seSB3YW50IGZyb250IG1hcmtlcnM7IGBmYWxzZWAgaW5kaWNhdGVzIG9ubHkgYmFjayBtYXJrZXJzXG4gICAgKlxuICAgICogQHJldHVybnMge0FycmF5fVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNYXJrZXJzKGluRnJvbnQ6IGJvb2xlYW4pIHtcbiAgICAgICAgcmV0dXJuIGluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGlnaGxpZ2h0KHJlKSB7XG4gICAgICAgIGlmICghdGhpcy4kc2VhcmNoSGlnaGxpZ2h0KSB7XG4gICAgICAgICAgICB2YXIgaGlnaGxpZ2h0ID0gbmV3IFNlYXJjaEhpZ2hsaWdodChudWxsLCBcImFjZV9zZWxlY3RlZC13b3JkXCIsIFwidGV4dFwiKTtcbiAgICAgICAgICAgIHRoaXMuJHNlYXJjaEhpZ2hsaWdodCA9IHRoaXMuYWRkRHluYW1pY01hcmtlcihoaWdobGlnaHQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHNlYXJjaEhpZ2hsaWdodC5zZXRSZWdleHAocmUpO1xuICAgIH1cblxuICAgIC8vIGV4cGVyaW1lbnRhbFxuICAgIHByaXZhdGUgaGlnaGxpZ2h0TGluZXMoc3RhcnRSb3csIGVuZFJvdywgY2xhenosIGluRnJvbnQpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBlbmRSb3cgIT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAgY2xhenogPSBlbmRSb3c7XG4gICAgICAgICAgICBlbmRSb3cgPSBzdGFydFJvdztcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWNsYXp6KVxuICAgICAgICAgICAgY2xhenogPSBcImFjZV9zdGVwXCI7XG5cbiAgICAgICAgdmFyIHJhbmdlOiBhbnkgPSBuZXcgUmFuZ2Uoc3RhcnRSb3csIDAsIGVuZFJvdywgSW5maW5pdHkpO1xuICAgICAgICByYW5nZS5pZCA9IHRoaXMuYWRkTWFya2VyKHJhbmdlLCBjbGF6eiwgXCJmdWxsTGluZVwiLCBpbkZyb250KTtcbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogRXJyb3I6XG4gICAgICogIHtcbiAgICAgKiAgICByb3c6IDEyLFxuICAgICAqICAgIGNvbHVtbjogMiwgLy9jYW4gYmUgdW5kZWZpbmVkXG4gICAgICogICAgdGV4dDogXCJNaXNzaW5nIGFyZ3VtZW50XCIsXG4gICAgICogICAgdHlwZTogXCJlcnJvclwiIC8vIG9yIFwid2FybmluZ1wiIG9yIFwiaW5mb1wiXG4gICAgICogIH1cbiAgICAgKi9cbiAgICAvKipcbiAgICAqIFNldHMgYW5ub3RhdGlvbnMgZm9yIHRoZSBgRWRpdFNlc3Npb25gLiBUaGlzIGZ1bmN0aW9ucyBlbWl0cyB0aGUgYCdjaGFuZ2VBbm5vdGF0aW9uJ2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge0FycmF5fSBhbm5vdGF0aW9ucyBBIGxpc3Qgb2YgYW5ub3RhdGlvbnNcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIHNldEFubm90YXRpb25zKGFubm90YXRpb25zKSB7XG4gICAgICAgIHRoaXMuJGFubm90YXRpb25zID0gYW5ub3RhdGlvbnM7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUFubm90YXRpb25cIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgYW5ub3RhdGlvbnMgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICogQHJldHVybnMge0FycmF5fVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRBbm5vdGF0aW9ucyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kYW5ub3RhdGlvbnMgfHwgW107XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2xlYXJzIGFsbCB0aGUgYW5ub3RhdGlvbnMgZm9yIHRoaXMgc2Vzc2lvbi5cbiAgICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gdHJpZ2dlcnMgdGhlIGAnY2hhbmdlQW5ub3RhdGlvbidgIGV2ZW50LlxuICAgICAqIFRoaXMgaXMgY2FsbGVkIGJ5IHRoZSBsYW5ndWFnZSBtb2RlcyB3aGVuIHRoZSB3b3JrZXIgdGVybWluYXRlcy5cbiAgICAgKi9cbiAgICBwdWJsaWMgY2xlYXJBbm5vdGF0aW9ucygpIHtcbiAgICAgICAgdGhpcy5zZXRBbm5vdGF0aW9ucyhbXSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJZiBgdGV4dGAgY29udGFpbnMgZWl0aGVyIHRoZSBuZXdsaW5lIChgXFxuYCkgb3IgY2FycmlhZ2UtcmV0dXJuICgnXFxyJykgY2hhcmFjdGVycywgYCRhdXRvTmV3TGluZWAgc3RvcmVzIHRoYXQgdmFsdWUuXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBBIGJsb2NrIG9mIHRleHRcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSAkZGV0ZWN0TmV3TGluZSh0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgdmFyIG1hdGNoID0gdGV4dC5tYXRjaCgvXi4qPyhcXHI/XFxuKS9tKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvTmV3TGluZSA9IG1hdGNoWzFdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYXV0b05ld0xpbmUgPSBcIlxcblwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBHaXZlbiBhIHN0YXJ0aW5nIHJvdyBhbmQgY29sdW1uLCB0aGlzIG1ldGhvZCByZXR1cm5zIHRoZSBgUmFuZ2VgIG9mIHRoZSBmaXJzdCB3b3JkIGJvdW5kYXJ5IGl0IGZpbmRzLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHN0YXJ0IGF0XG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gdG8gc3RhcnQgYXRcbiAgICAqXG4gICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIGdldFdvcmRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGxpbmU6IHN0cmluZyA9IHRoaXMuZ2V0TGluZShyb3cpO1xuXG4gICAgICAgIHZhciBpblRva2VuID0gZmFsc2U7XG4gICAgICAgIGlmIChjb2x1bW4gPiAwKVxuICAgICAgICAgICAgaW5Ub2tlbiA9ICEhbGluZS5jaGFyQXQoY29sdW1uIC0gMSkubWF0Y2godGhpcy50b2tlblJlKTtcblxuICAgICAgICBpZiAoIWluVG9rZW4pXG4gICAgICAgICAgICBpblRva2VuID0gISFsaW5lLmNoYXJBdChjb2x1bW4pLm1hdGNoKHRoaXMudG9rZW5SZSk7XG5cbiAgICAgICAgaWYgKGluVG9rZW4pXG4gICAgICAgICAgICB2YXIgcmUgPSB0aGlzLnRva2VuUmU7XG4gICAgICAgIGVsc2UgaWYgKC9eXFxzKyQvLnRlc3QobGluZS5zbGljZShjb2x1bW4gLSAxLCBjb2x1bW4gKyAxKSkpXG4gICAgICAgICAgICB2YXIgcmUgPSAvXFxzLztcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgdmFyIHJlID0gdGhpcy5ub25Ub2tlblJlO1xuXG4gICAgICAgIHZhciBzdGFydCA9IGNvbHVtbjtcbiAgICAgICAgaWYgKHN0YXJ0ID4gMCkge1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIHN0YXJ0LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3aGlsZSAoc3RhcnQgPj0gMCAmJiBsaW5lLmNoYXJBdChzdGFydCkubWF0Y2gocmUpKTtcbiAgICAgICAgICAgIHN0YXJ0Kys7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZW5kID0gY29sdW1uO1xuICAgICAgICB3aGlsZSAoZW5kIDwgbGluZS5sZW5ndGggJiYgbGluZS5jaGFyQXQoZW5kKS5tYXRjaChyZSkpIHtcbiAgICAgICAgICAgIGVuZCsrO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBSYW5nZShyb3csIHN0YXJ0LCByb3csIGVuZCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBHZXRzIHRoZSByYW5nZSBvZiBhIHdvcmQsIGluY2x1ZGluZyBpdHMgcmlnaHQgd2hpdGVzcGFjZS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyBudW1iZXIgdG8gc3RhcnQgZnJvbVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGNvbHVtbiBUaGUgY29sdW1uIG51bWJlciB0byBzdGFydCBmcm9tXG4gICAgKlxuICAgICogQHJldHVybiB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIGdldEFXb3JkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSB7XG4gICAgICAgIHZhciB3b3JkUmFuZ2UgPSB0aGlzLmdldFdvcmRSYW5nZShyb3csIGNvbHVtbik7XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHdvcmRSYW5nZS5lbmQucm93KTtcblxuICAgICAgICB3aGlsZSAobGluZS5jaGFyQXQod29yZFJhbmdlLmVuZC5jb2x1bW4pLm1hdGNoKC9bIFxcdF0vKSkge1xuICAgICAgICAgICAgd29yZFJhbmdlLmVuZC5jb2x1bW4gKz0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB3b3JkUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiB7OkRvY3VtZW50LnNldE5ld0xpbmVNb2RlLmRlc2N9XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gbmV3TGluZU1vZGUgezpEb2N1bWVudC5zZXROZXdMaW5lTW9kZS5wYXJhbX1cbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRG9jdW1lbnQuc2V0TmV3TGluZU1vZGVcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlOiBzdHJpbmcpIHtcbiAgICAgICAgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbmV3IGxpbmUgbW9kZS5cbiAgICAqIEByZXR1cm5zIHtTdHJpbmd9XG4gICAgKiBAcmVsYXRlZCBEb2N1bWVudC5nZXROZXdMaW5lTW9kZVxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0TmV3TGluZU1vZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXROZXdMaW5lTW9kZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSWRlbnRpZmllcyBpZiB5b3Ugd2FudCB0byB1c2UgYSB3b3JrZXIgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VXb3JrZXIgU2V0IHRvIGB0cnVlYCB0byB1c2UgYSB3b3JrZXJcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVc2VXb3JrZXIodXNlV29ya2VyKSB7IHRoaXMuc2V0T3B0aW9uKFwidXNlV29ya2VyXCIsIHVzZVdvcmtlcik7IH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgd29ya2VycyBhcmUgYmVpbmcgdXNlZC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldFVzZVdvcmtlcigpIHsgcmV0dXJuIHRoaXMuJHVzZVdvcmtlcjsgfVxuXG4gICAgLyoqXG4gICAgKiBSZWxvYWRzIGFsbCB0aGUgdG9rZW5zIG9uIHRoZSBjdXJyZW50IHNlc3Npb24uIFRoaXMgZnVuY3Rpb24gY2FsbHMgW1tCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0IGBCYWNrZ3JvdW5kVG9rZW5pemVyLnN0YXJ0ICgpYF1dIHRvIGFsbCB0aGUgcm93czsgaXQgYWxzbyBlbWl0cyB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudC5cbiAgICAqKi9cbiAgICBwcml2YXRlIG9uUmVsb2FkVG9rZW5pemVyKGUpIHtcbiAgICAgICAgdmFyIHJvd3MgPSBlLmRhdGE7XG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQocm93cy5maXJzdCk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcInRva2VuaXplclVwZGF0ZVwiLCBlKTtcbiAgICB9XG5cblxuICAgIC8qKlxuICAgICogU2V0cyBhIG5ldyB0ZXh0IG1vZGUgZm9yIHRoZSBgRWRpdFNlc3Npb25gLiBUaGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZU1vZGUnYCBldmVudC4gSWYgYSBbW0JhY2tncm91bmRUb2tlbml6ZXIgYEJhY2tncm91bmRUb2tlbml6ZXJgXV0gaXMgc2V0LCB0aGUgYCd0b2tlbml6ZXJVcGRhdGUnYCBldmVudCBpcyBhbHNvIGVtaXR0ZWQuXG4gICAgKiBAcGFyYW0ge1RleHRNb2RlfSBtb2RlIFNldCBhIG5ldyB0ZXh0IG1vZGVcbiAgICAqIEBwYXJhbSB7Y2J9IG9wdGlvbmFsIGNhbGxiYWNrXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0TW9kZShtb2RlLCBjYj8pIHtcbiAgICAgICAgaWYgKG1vZGUgJiYgdHlwZW9mIG1vZGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIGlmIChtb2RlLmdldFRva2VuaXplcikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiRvbkNoYW5nZU1vZGUobW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IG1vZGU7XG4gICAgICAgICAgICB2YXIgcGF0aCA9IG9wdGlvbnMucGF0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHBhdGggPSBtb2RlIHx8IFwiYWNlL21vZGUvdGV4dFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhpcyBpcyBuZWVkZWQgaWYgYWNlIGlzbid0IG9uIHJlcXVpcmUgcGF0aCAoZS5nIHRlc3RzIGluIG5vZGUpXG4gICAgICAgIGlmICghdGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0gPSBuZXcgTW9kZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJG1vZGVzW3BhdGhdICYmICFvcHRpb25zKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbcGF0aF0pO1xuICAgICAgICAgICAgY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBsb2FkIG9uIGRlbWFuZFxuICAgICAgICB0aGlzLiRtb2RlSWQgPSBwYXRoO1xuICAgICAgICBsb2FkTW9kdWxlKFtcIm1vZGVcIiwgcGF0aF0sIGZ1bmN0aW9uKG06IGFueSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJG1vZGVJZCAhPT0gcGF0aClcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRtb2Rlc1twYXRoXSAmJiAhb3B0aW9ucylcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW3BhdGhdKTtcbiAgICAgICAgICAgIGlmIChtICYmIG0uTW9kZSkge1xuICAgICAgICAgICAgICAgIG0gPSBuZXcgbS5Nb2RlKG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRtb2Rlc1twYXRoXSA9IG07XG4gICAgICAgICAgICAgICAgICAgIG0uJGlkID0gcGF0aDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKG0pO1xuICAgICAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgLy8gc2V0IG1vZGUgdG8gdGV4dCB1bnRpbCBsb2FkaW5nIGlzIGZpbmlzaGVkXG4gICAgICAgIGlmICghdGhpcy4kbW9kZSkge1xuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW1wiYWNlL21vZGUvdGV4dFwiXSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRvbkNoYW5nZU1vZGUobW9kZTogTW9kZSwgJGlzUGxhY2Vob2xkZXI/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmICghJGlzUGxhY2Vob2xkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGVJZCA9IG1vZGUuJGlkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiRtb2RlID09PSBtb2RlKSB7XG4gICAgICAgICAgICAvLyBOb3RoaW5nIHRvIGRvLiBCZSBpZGVtcG90ZW50LlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kbW9kZSA9IG1vZGU7XG5cbiAgICAgICAgLy8gVE9ETzogV291bGRuJ3QgaXQgbWFrZSBtb3JlIHNlbnNlIHRvIHN0b3AgdGhlIHdvcmtlciwgdGhlbiBjaGFuZ2UgdGhlIG1vZGU/XG4gICAgICAgIHRoaXMuJHN0b3BXb3JrZXIoKTtcblxuICAgICAgICBpZiAodGhpcy4kdXNlV29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiRzdGFydFdvcmtlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRva2VuaXplciA9IG1vZGUuZ2V0VG9rZW5pemVyKCk7XG5cbiAgICAgICAgaWYgKHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhciBvblJlbG9hZFRva2VuaXplciA9IHRoaXMub25SZWxvYWRUb2tlbml6ZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddKFwidXBkYXRlXCIsIG9uUmVsb2FkVG9rZW5pemVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplciA9IG5ldyBCYWNrZ3JvdW5kVG9rZW5pemVyKHRva2VuaXplcik7XG4gICAgICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5hZGRFdmVudExpc3RlbmVyKFwidXBkYXRlXCIsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnNldFRva2VuaXplcih0b2tlbml6ZXIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXREb2N1bWVudCh0aGlzLmdldERvY3VtZW50KCkpO1xuXG4gICAgICAgIHRoaXMudG9rZW5SZSA9IG1vZGUudG9rZW5SZTtcbiAgICAgICAgdGhpcy5ub25Ub2tlblJlID0gbW9kZS5ub25Ub2tlblJlO1xuXG5cbiAgICAgICAgaWYgKCEkaXNQbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgdGhpcy4kb3B0aW9ucy53cmFwTWV0aG9kLnNldC5jYWxsKHRoaXMsIHRoaXMuJHdyYXBNZXRob2QpO1xuICAgICAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlLmZvbGRpbmdSdWxlcyk7XG4gICAgICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KDApO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZU1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cblxuICAgIHByaXZhdGUgJHN0b3BXb3JrZXIoKSB7XG4gICAgICAgIGlmICh0aGlzLiR3b3JrZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJHdvcmtlci50ZXJtaW5hdGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuJHdvcmtlciA9IG51bGw7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkc3RhcnRXb3JrZXIoKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLiR3b3JrZXIgPSB0aGlzLiRtb2RlLmNyZWF0ZVdvcmtlcih0aGlzKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZSkge1xuICAgICAgICAgICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgY3VycmVudCB0ZXh0IG1vZGUuXG4gICAgKiBAcmV0dXJucyB7VGV4dE1vZGV9IFRoZSBjdXJyZW50IHRleHQgbW9kZVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNb2RlKCkge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW9kZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRoaXMgZnVuY3Rpb24gc2V0cyB0aGUgc2Nyb2xsIHRvcCB2YWx1ZS4gSXQgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VTY3JvbGxUb3AnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JvbGxUb3AgVGhlIG5ldyBzY3JvbGwgdG9wIHZhbHVlXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcbiAgICAgICAgLy8gVE9ETzogc2hvdWxkIHdlIGZvcmNlIGludGVnZXIgbGluZWhlaWdodCBpbnN0ZWFkPyBzY3JvbGxUb3AgPSBNYXRoLnJvdW5kKHNjcm9sbFRvcCk7IFxuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsVG9wID09PSBzY3JvbGxUb3AgfHwgaXNOYU4oc2Nyb2xsVG9wKSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2Nyb2xsVG9wXCIsIHNjcm9sbFRvcCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIHRvcCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgdG9wbW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxUb3B9XG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxUb3AoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzY3JvbGxUb3A7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBbU2V0cyB0aGUgdmFsdWUgb2YgdGhlIGRpc3RhbmNlIGJldHdlZW4gdGhlIGxlZnQgb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxlZnRtb3N0IHBhcnQgb2YgdGhlIHZpc2libGUgY29udGVudC5dezogI0VkaXRTZXNzaW9uLnNldFNjcm9sbExlZnR9XG4gICAgKiovXG4gICAgcHVibGljIHNldFNjcm9sbExlZnQoc2Nyb2xsTGVmdDogbnVtYmVyKSB7XG4gICAgICAgIC8vIHNjcm9sbExlZnQgPSBNYXRoLnJvdW5kKHNjcm9sbExlZnQpO1xuICAgICAgICBpZiAodGhpcy4kc2Nyb2xsTGVmdCA9PT0gc2Nyb2xsTGVmdCB8fCBpc05hTihzY3JvbGxMZWZ0KSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRzY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlU2Nyb2xsTGVmdFwiLCBzY3JvbGxMZWZ0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtSZXR1cm5zIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgbGVmdCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgbGVmdG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uZ2V0U2Nyb2xsTGVmdH1cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcm9sbExlZnQoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzY3JvbGxMZWZ0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcmVlbldpZHRoKCk6IG51bWJlciB7XG4gICAgICAgIHRoaXMuJGNvbXB1dGVXaWR0aCgpO1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cylcbiAgICAgICAgICAgIHJldHVybiBNYXRoLm1heCh0aGlzLmdldExpbmVXaWRnZXRNYXhXaWR0aCgpLCB0aGlzLnNjcmVlbldpZHRoKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGg7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBnZXRMaW5lV2lkZ2V0TWF4V2lkdGgoKSB7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzV2lkdGggIT0gbnVsbCkgcmV0dXJuIHRoaXMubGluZVdpZGdldHNXaWR0aDtcbiAgICAgICAgdmFyIHdpZHRoID0gMDtcbiAgICAgICAgdGhpcy5saW5lV2lkZ2V0cy5mb3JFYWNoKGZ1bmN0aW9uKHcpIHtcbiAgICAgICAgICAgIGlmICh3ICYmIHcuc2NyZWVuV2lkdGggPiB3aWR0aClcbiAgICAgICAgICAgICAgICB3aWR0aCA9IHcuc2NyZWVuV2lkdGg7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdGhpcy5saW5lV2lkZ2V0V2lkdGggPSB3aWR0aDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJGNvbXB1dGVXaWR0aChmb3JjZT8pIHtcbiAgICAgICAgaWYgKHRoaXMuJG1vZGlmaWVkIHx8IGZvcmNlKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuV2lkdGggPSB0aGlzLiR3cmFwTGltaXQ7XG5cbiAgICAgICAgICAgIHZhciBsaW5lcyA9IHRoaXMuZG9jLmdldEFsbExpbmVzKCk7XG4gICAgICAgICAgICB2YXIgY2FjaGUgPSB0aGlzLiRyb3dMZW5ndGhDYWNoZTtcbiAgICAgICAgICAgIHZhciBsb25nZXN0U2NyZWVuTGluZSA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZEluZGV4ID0gMDtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuJGZvbGREYXRhW2ZvbGRJbmRleF07XG4gICAgICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgIHZhciBsZW4gPSBsaW5lcy5sZW5ndGg7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaSA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICBpID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgICAgIGlmIChpID49IGxlbilcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuJGZvbGREYXRhW2ZvbGRJbmRleCsrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FjaGVbaV0gPT0gbnVsbClcbiAgICAgICAgICAgICAgICAgICAgY2FjaGVbaV0gPSB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aChsaW5lc1tpXSlbMF07XG5cbiAgICAgICAgICAgICAgICBpZiAoY2FjaGVbaV0gPiBsb25nZXN0U2NyZWVuTGluZSlcbiAgICAgICAgICAgICAgICAgICAgbG9uZ2VzdFNjcmVlbkxpbmUgPSBjYWNoZVtpXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuc2NyZWVuV2lkdGggPSBsb25nZXN0U2NyZWVuTGluZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSB2ZXJiYXRpbSBjb3B5IG9mIHRoZSBnaXZlbiBsaW5lIGFzIGl0IGlzIGluIHRoZSBkb2N1bWVudFxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgVGhlIHJvdyB0byByZXRyaWV2ZSBmcm9tXG4gICAgICpcbiAgICAqXG4gICAgICogQHJldHVybnMge1N0cmluZ31cbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGdldExpbmUocm93OiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGluZShyb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYW4gYXJyYXkgb2Ygc3RyaW5ncyBvZiB0aGUgcm93cyBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC4gVGhpcyBmdW5jdGlvbiBpcyBpbmNsdXNpdmUgb2YgYGxhc3RSb3dgLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgZmlyc3Qgcm93IGluZGV4IHRvIHJldHJpZXZlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqXG4gICAgICogQHJldHVybnMge1tTdHJpbmddfVxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIHJvd3MgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRMZW5ndGgoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIHs6RG9jdW1lbnQuZ2V0VGV4dFJhbmdlLmRlc2N9XG4gICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgVGhlIHJhbmdlIHRvIHdvcmsgd2l0aFxuICAgICAqXG4gICAgICogQHJldHVybnMge3N0cmluZ31cbiAgICAgKiovXG4gICAgcHVibGljIGdldFRleHRSYW5nZShyYW5nZTogeyBzdGFydDogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTsgZW5kOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IH0pIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFRleHRSYW5nZShyYW5nZSB8fCB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGEgYmxvY2sgb2YgYHRleHRgIGFuZCB0aGUgaW5kaWNhdGVkIGBwb3NpdGlvbmAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB7cm93LCBjb2x1bW59IHRvIHN0YXJ0IGluc2VydGluZyBhdFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgY2h1bmsgb2YgdGV4dCB0byBpbnNlcnRcbiAgICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgbGluZSBvZiBgdGV4dGAuIElmIHRoZSBsZW5ndGggb2YgYHRleHRgIGlzIDAsIHRoaXMgZnVuY3Rpb24gc2ltcGx5IHJldHVybnMgYHBvc2l0aW9uYC5cbiAgICAgKlxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyBpbnNlcnQocG9zaXRpb246IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0sIHRleHQ6IHN0cmluZykge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuaW5zZXJ0KHBvc2l0aW9uLCB0ZXh0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZW1vdmVzIHRoZSBgcmFuZ2VgIGZyb20gdGhlIGRvY3VtZW50LlxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlbW92ZVxuICAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBuZXcgYHN0YXJ0YCBwcm9wZXJ0eSBvZiB0aGUgcmFuZ2UsIHdoaWNoIGNvbnRhaW5zIGBzdGFydFJvd2AgYW5kIGBzdGFydENvbHVtbmAuIElmIGByYW5nZWAgaXMgZW1wdHksIHRoaXMgZnVuY3Rpb24gcmV0dXJucyB0aGUgdW5tb2RpZmllZCB2YWx1ZSBvZiBgcmFuZ2Uuc3RhcnRgLlxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRG9jdW1lbnQucmVtb3ZlXG4gICAgICpcbiAgICAgKiovXG4gICAgcHVibGljIHJlbW92ZShyYW5nZSkge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MucmVtb3ZlKHJhbmdlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXZlcnRzIHByZXZpb3VzIGNoYW5nZXMgdG8geW91ciBkb2N1bWVudC5cbiAgICAgKiBAcGFyYW0ge0FycmF5fSBkZWx0YXMgQW4gYXJyYXkgb2YgcHJldmlvdXMgY2hhbmdlc1xuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gZG9udFNlbGVjdCBbSWYgYHRydWVgLCBkb2Vzbid0IHNlbGVjdCB0aGUgcmFuZ2Ugb2Ygd2hlcmUgdGhlIGNoYW5nZSBvY2N1cmVkXXs6ICNkb250U2VsZWN0fVxuICAgICAqXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIHVuZG9DaGFuZ2VzKGRlbHRhcywgZG9udFNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICAgICAgdmFyIGxhc3RVbmRvUmFuZ2UgPSBudWxsO1xuICAgICAgICBmb3IgKHZhciBpID0gZGVsdGFzLmxlbmd0aCAtIDE7IGkgIT0gLTE7IGktLSkge1xuICAgICAgICAgICAgdmFyIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgICAgICAgaWYgKGRlbHRhLmdyb3VwID09IFwiZG9jXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmRvYy5yZXZlcnREZWx0YXMoZGVsdGEuZGVsdGFzKTtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kZ2V0VW5kb1NlbGVjdGlvbihkZWx0YS5kZWx0YXMsIHRydWUsIGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWx0YS5kZWx0YXMuZm9yRWFjaChmdW5jdGlvbihmb2xkRGVsdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hZGRGb2xkcyhmb2xkRGVsdGEuZm9sZHMpO1xuICAgICAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gZmFsc2U7XG4gICAgICAgIGxhc3RVbmRvUmFuZ2UgJiZcbiAgICAgICAgICAgIHRoaXMuJHVuZG9TZWxlY3QgJiZcbiAgICAgICAgICAgICFkb250U2VsZWN0ICYmXG4gICAgICAgICAgICB0aGlzLnNlbGVjdGlvbi5zZXRTZWxlY3Rpb25SYW5nZShsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgcmV0dXJuIGxhc3RVbmRvUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmUtaW1wbGVtZW50cyBhIHByZXZpb3VzbHkgdW5kb25lIGNoYW5nZSB0byB5b3VyIGRvY3VtZW50LlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGRlbHRhcyBBbiBhcnJheSBvZiBwcmV2aW91cyBjaGFuZ2VzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBkb250U2VsZWN0IHs6ZG9udFNlbGVjdH1cbiAgICAgKlxuICAgICpcbiAgICAgKiBAcmV0dXJucyB7UmFuZ2V9XG4gICAgKiovXG4gICAgcHVibGljIHJlZG9DaGFuZ2VzKGRlbHRhcywgZG9udFNlbGVjdD86IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKCFkZWx0YXMubGVuZ3RoKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJGZyb21VbmRvID0gdHJ1ZTtcbiAgICAgICAgdmFyIGxhc3RVbmRvUmFuZ2U6IFJhbmdlID0gbnVsbDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBkZWx0YSA9IGRlbHRhc1tpXTtcbiAgICAgICAgICAgIGlmIChkZWx0YS5ncm91cCA9PSBcImRvY1wiKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5kb2MuYXBwbHlEZWx0YXMoZGVsdGEuZGVsdGFzKTtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlID1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kZ2V0VW5kb1NlbGVjdGlvbihkZWx0YS5kZWx0YXMsIGZhbHNlLCBsYXN0VW5kb1JhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IGZhbHNlO1xuICAgICAgICBsYXN0VW5kb1JhbmdlICYmXG4gICAgICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ICYmXG4gICAgICAgICAgICAhZG9udFNlbGVjdCAmJlxuICAgICAgICAgICAgdGhpcy5zZWxlY3Rpb24uc2V0U2VsZWN0aW9uUmFuZ2UobGFzdFVuZG9SYW5nZSk7XG4gICAgICAgIHJldHVybiBsYXN0VW5kb1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVuYWJsZXMgb3IgZGlzYWJsZXMgaGlnaGxpZ2h0aW5nIG9mIHRoZSByYW5nZSB3aGVyZSBhbiB1bmRvIG9jY3VyZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBlbmFibGUgSWYgYHRydWVgLCBzZWxlY3RzIHRoZSByYW5nZSBvZiB0aGUgcmVpbnNlcnRlZCBjaGFuZ2VcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSBzZXRVbmRvU2VsZWN0KGVuYWJsZTogYm9vbGVhbik6IHZvaWQge1xuICAgICAgICB0aGlzLiR1bmRvU2VsZWN0ID0gZW5hYmxlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGdldFVuZG9TZWxlY3Rpb24oZGVsdGFzOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfVtdLCBpc1VuZG86IGJvb2xlYW4sIGxhc3RVbmRvUmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuICAgICAgICBmdW5jdGlvbiBpc0luc2VydChkZWx0YTogeyBhY3Rpb246IHN0cmluZyB9KSB7XG4gICAgICAgICAgICB2YXIgaW5zZXJ0ID0gZGVsdGEuYWN0aW9uID09PSBcImluc2VydFRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0TGluZXNcIjtcbiAgICAgICAgICAgIHJldHVybiBpc1VuZG8gPyAhaW5zZXJ0IDogaW5zZXJ0O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nOyByYW5nZTogUmFuZ2UgfSA9IGRlbHRhc1swXTtcbiAgICAgICAgdmFyIHJhbmdlOiBSYW5nZTtcbiAgICAgICAgdmFyIHBvaW50OiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9O1xuICAgICAgICB2YXIgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5lbmQpO1xuICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGRlbHRhLnJhbmdlLnN0YXJ0LCBkZWx0YS5yYW5nZS5zdGFydCk7XG4gICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBkZWx0YXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGRlbHRhID0gZGVsdGFzW2ldO1xuICAgICAgICAgICAgaWYgKGlzSW5zZXJ0KGRlbHRhKSkge1xuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRTdGFydChkZWx0YS5yYW5nZS5zdGFydC5yb3csIGRlbHRhLnJhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2UuZW5kO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlKHBvaW50LnJvdywgcG9pbnQuY29sdW1uKSA9PT0gMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQoZGVsdGEucmFuZ2UuZW5kLnJvdywgZGVsdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHBvaW50ID0gZGVsdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHRoaXMgcmFuZ2UgYW5kIHRoZSBsYXN0IHVuZG8gcmFuZ2UgaGFzIHNvbWV0aGluZyBpbiBjb21tb24uXG4gICAgICAgIC8vIElmIHRydWUsIG1lcmdlIHRoZSByYW5nZXMuXG4gICAgICAgIGlmIChsYXN0VW5kb1JhbmdlICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmIChSYW5nZS5jb21wYXJlUG9pbnRzKGxhc3RVbmRvUmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0KSA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZS5lbmQuY29sdW1uICs9IHJhbmdlLmVuZC5jb2x1bW4gLSByYW5nZS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBjbXAgPSBsYXN0VW5kb1JhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoY21wID09PSAxKSB7XG4gICAgICAgICAgICAgICAgcmFuZ2Uuc2V0U3RhcnQobGFzdFVuZG9SYW5nZS5zdGFydC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zZXRFbmQobGFzdFVuZG9SYW5nZS5lbmQucm93LCBsYXN0VW5kb1JhbmdlLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXBsYWNlcyBhIHJhbmdlIGluIHRoZSBkb2N1bWVudCB3aXRoIHRoZSBuZXcgYHRleHRgLlxuICAgICpcbiAgICAqIEBwYXJhbSB7UmFuZ2V9IHJhbmdlIEEgc3BlY2lmaWVkIFJhbmdlIHRvIHJlcGxhY2VcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IFRoZSBuZXcgdGV4dCB0byB1c2UgYXMgYSByZXBsYWNlbWVudFxuICAgICogQHJldHVybnMge09iamVjdH0gQW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGZpbmFsIHJvdyBhbmQgY29sdW1uLCBsaWtlIHRoaXM6XG4gICAgKiBgYGBcbiAgICAqIHtyb3c6IGVuZFJvdywgY29sdW1uOiAwfVxuICAgICogYGBgXG4gICAgKiBJZiB0aGUgdGV4dCBhbmQgcmFuZ2UgYXJlIGVtcHR5LCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGN1cnJlbnQgYHJhbmdlLnN0YXJ0YCB2YWx1ZS5cbiAgICAqIElmIHRoZSB0ZXh0IGlzIHRoZSBleGFjdCBzYW1lIGFzIHdoYXQgY3VycmVudGx5IGV4aXN0cywgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5lbmRgIHZhbHVlLlxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRG9jdW1lbnQucmVwbGFjZVxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIHJlcGxhY2UocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogTW92ZXMgYSByYW5nZSBvZiB0ZXh0IGZyb20gdGhlIGdpdmVuIHJhbmdlIHRvIHRoZSBnaXZlbiBwb3NpdGlvbi4gYHRvUG9zaXRpb25gIGlzIGFuIG9iamVjdCB0aGF0IGxvb2tzIGxpa2UgdGhpczpcbiAgICAgKiAgYGBganNvblxuICAgICogICAgeyByb3c6IG5ld1Jvd0xvY2F0aW9uLCBjb2x1bW46IG5ld0NvbHVtbkxvY2F0aW9uIH1cbiAgICAgKiAgYGBgXG4gICAgICogQHBhcmFtIHtSYW5nZX0gZnJvbVJhbmdlIFRoZSByYW5nZSBvZiB0ZXh0IHlvdSB3YW50IG1vdmVkIHdpdGhpbiB0aGUgZG9jdW1lbnRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gdG9Qb3NpdGlvbiBUaGUgbG9jYXRpb24gKHJvdyBhbmQgY29sdW1uKSB3aGVyZSB5b3Ugd2FudCB0byBtb3ZlIHRoZSB0ZXh0IHRvXG4gICAgICogQHJldHVybnMge1JhbmdlfSBUaGUgbmV3IHJhbmdlIHdoZXJlIHRoZSB0ZXh0IHdhcyBtb3ZlZCB0by5cbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgbW92ZVRleHQoZnJvbVJhbmdlLCB0b1Bvc2l0aW9uLCBjb3B5KSB7XG4gICAgICAgIHZhciB0ZXh0ID0gdGhpcy5nZXRUZXh0UmFuZ2UoZnJvbVJhbmdlKTtcbiAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZnJvbVJhbmdlKTtcbiAgICAgICAgdmFyIHJvd0RpZmY6IG51bWJlcjtcbiAgICAgICAgdmFyIGNvbERpZmY6IG51bWJlcjtcblxuICAgICAgICB2YXIgdG9SYW5nZSA9IFJhbmdlLmZyb21Qb2ludHModG9Qb3NpdGlvbiwgdG9Qb3NpdGlvbik7XG4gICAgICAgIGlmICghY29weSkge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZnJvbVJhbmdlKTtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBmcm9tUmFuZ2Uuc3RhcnQucm93IC0gZnJvbVJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gcm93RGlmZiA/IC1mcm9tUmFuZ2UuZW5kLmNvbHVtbiA6IGZyb21SYW5nZS5zdGFydC5jb2x1bW4gLSBmcm9tUmFuZ2UuZW5kLmNvbHVtbjtcbiAgICAgICAgICAgIGlmIChjb2xEaWZmKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRvUmFuZ2Uuc3RhcnQucm93ID09IGZyb21SYW5nZS5lbmQucm93ICYmIHRvUmFuZ2Uuc3RhcnQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5zdGFydC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHRvUmFuZ2UuZW5kLnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLmVuZC5jb2x1bW4gPiBmcm9tUmFuZ2UuZW5kLmNvbHVtbikge1xuICAgICAgICAgICAgICAgICAgICB0b1JhbmdlLmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocm93RGlmZiAmJiB0b1JhbmdlLnN0YXJ0LnJvdyA+PSBmcm9tUmFuZ2UuZW5kLnJvdykge1xuICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQucm93ICs9IHJvd0RpZmY7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0b1JhbmdlLmVuZCA9IHRoaXMuaW5zZXJ0KHRvUmFuZ2Uuc3RhcnQsIHRleHQpO1xuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB2YXIgb2xkU3RhcnQgPSBmcm9tUmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICB2YXIgbmV3U3RhcnQgPSB0b1JhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgcm93RGlmZiA9IG5ld1N0YXJ0LnJvdyAtIG9sZFN0YXJ0LnJvdztcbiAgICAgICAgICAgIGNvbERpZmYgPSBuZXdTdGFydC5jb2x1bW4gLSBvbGRTdGFydC5jb2x1bW47XG4gICAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGRzLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgICAgICBpZiAoeC5zdGFydC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgIHguc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh4LmVuZC5yb3cgPT0gb2xkU3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgICAgIHguZW5kLmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB4LnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHguZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICAgICAgfSkpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRvUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBJbmRlbnRzIGFsbCB0aGUgcm93cywgZnJvbSBgc3RhcnRSb3dgIHRvIGBlbmRSb3dgIChpbmNsdXNpdmUpLCBieSBwcmVmaXhpbmcgZWFjaCByb3cgd2l0aCB0aGUgdG9rZW4gaW4gYGluZGVudFN0cmluZ2AuXG4gICAgKlxuICAgICogSWYgYGluZGVudFN0cmluZ2AgY29udGFpbnMgdGhlIGAnXFx0J2AgY2hhcmFjdGVyLCBpdCdzIHJlcGxhY2VkIGJ5IHdoYXRldmVyIGlzIGRlZmluZWQgYnkgW1tFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmcgYGdldFRhYlN0cmluZygpYF1dLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHN0YXJ0Um93IFN0YXJ0aW5nIHJvd1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGVuZFJvdyBFbmRpbmcgcm93XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gaW5kZW50U3RyaW5nIFRoZSBpbmRlbnQgdG9rZW5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBpbmRlbnRSb3dzKHN0YXJ0Um93LCBlbmRSb3csIGluZGVudFN0cmluZykge1xuICAgICAgICBpbmRlbnRTdHJpbmcgPSBpbmRlbnRTdHJpbmcucmVwbGFjZSgvXFx0L2csIHRoaXMuZ2V0VGFiU3RyaW5nKCkpO1xuICAgICAgICBmb3IgKHZhciByb3cgPSBzdGFydFJvdzsgcm93IDw9IGVuZFJvdzsgcm93KyspXG4gICAgICAgICAgICB0aGlzLmluc2VydCh7IHJvdzogcm93LCBjb2x1bW46IDAgfSwgaW5kZW50U3RyaW5nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE91dGRlbnRzIGFsbCB0aGUgcm93cyBkZWZpbmVkIGJ5IHRoZSBgc3RhcnRgIGFuZCBgZW5kYCBwcm9wZXJ0aWVzIG9mIGByYW5nZWAuXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBBIHJhbmdlIG9mIHJvd3NcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBvdXRkZW50Um93cyhyYW5nZTogUmFuZ2UpIHtcbiAgICAgICAgdmFyIHJvd1JhbmdlID0gcmFuZ2UuY29sbGFwc2VSb3dzKCk7XG4gICAgICAgIHZhciBkZWxldGVSYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKTtcbiAgICAgICAgdmFyIHNpemUgPSB0aGlzLmdldFRhYlNpemUoKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gcm93UmFuZ2Uuc3RhcnQucm93OyBpIDw9IHJvd1JhbmdlLmVuZC5yb3c7ICsraSkge1xuICAgICAgICAgICAgdmFyIGxpbmUgPSB0aGlzLmdldExpbmUoaSk7XG5cbiAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LnJvdyA9IGk7XG4gICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQucm93ID0gaTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc2l6ZTsgKytqKVxuICAgICAgICAgICAgICAgIGlmIChsaW5lLmNoYXJBdChqKSAhPSAnICcpXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgaWYgKGogPCBzaXplICYmIGxpbmUuY2hhckF0KGopID09ICdcXHQnKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2Uuc3RhcnQuY29sdW1uID0gajtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5lbmQuY29sdW1uID0gaiArIDE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IDA7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGo7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnJlbW92ZShkZWxldGVSYW5nZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRtb3ZlTGluZXMoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyLCBkaXI6IG51bWJlcikge1xuICAgICAgICBmaXJzdFJvdyA9IHRoaXMuZ2V0Um93Rm9sZFN0YXJ0KGZpcnN0Um93KTtcbiAgICAgICAgbGFzdFJvdyA9IHRoaXMuZ2V0Um93Rm9sZEVuZChsYXN0Um93KTtcbiAgICAgICAgaWYgKGRpciA8IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyArIGRpcik7XG4gICAgICAgICAgICBpZiAocm93IDwgMCkgcmV0dXJuIDA7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IHJvdyAtIGZpcnN0Um93O1xuICAgICAgICB9IGVsc2UgaWYgKGRpciA+IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSB0aGlzLmdldFJvd0ZvbGRFbmQobGFzdFJvdyArIGRpcik7XG4gICAgICAgICAgICBpZiAocm93ID4gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxKSByZXR1cm4gMDtcbiAgICAgICAgICAgIHZhciBkaWZmID0gcm93IC0gbGFzdFJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZpcnN0Um93ID0gdGhpcy4kY2xpcFJvd1RvRG9jdW1lbnQoZmlyc3RSb3cpO1xuICAgICAgICAgICAgbGFzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGxhc3RSb3cpO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSBsYXN0Um93IC0gZmlyc3RSb3cgKyAxO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKGZpcnN0Um93LCAwLCBsYXN0Um93LCBOdW1iZXIuTUFYX1ZBTFVFKTtcbiAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpLm1hcChmdW5jdGlvbih4KSB7XG4gICAgICAgICAgICB4ID0geC5jbG9uZSgpO1xuICAgICAgICAgICAgeC5zdGFydC5yb3cgKz0gZGlmZjtcbiAgICAgICAgICAgIHguZW5kLnJvdyArPSBkaWZmO1xuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciBsaW5lcyA9IGRpciA9PSAwXG4gICAgICAgICAgICA/IHRoaXMuZG9jLmdldExpbmVzKGZpcnN0Um93LCBsYXN0Um93KVxuICAgICAgICAgICAgOiB0aGlzLmRvYy5yZW1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIHRoaXMuZG9jLmluc2VydExpbmVzKGZpcnN0Um93ICsgZGlmZiwgbGluZXMpO1xuICAgICAgICBmb2xkcy5sZW5ndGggJiYgdGhpcy5hZGRGb2xkcyhmb2xkcyk7XG4gICAgICAgIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICAvKipcbiAgICAqIFNoaWZ0cyBhbGwgdGhlIGxpbmVzIGluIHRoZSBkb2N1bWVudCB1cCBvbmUsIHN0YXJ0aW5nIGZyb20gYGZpcnN0Um93YCBhbmQgZW5kaW5nIGF0IGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgdXBcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSB1cFxuICAgICogQHJldHVybnMge051bWJlcn0gSWYgYGZpcnN0Um93YCBpcyBsZXNzLXRoYW4gb3IgZXF1YWwgdG8gMCwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIDAuIE90aGVyd2lzZSwgb24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAqXG4gICAgKiBAcmVsYXRlZCBEb2N1bWVudC5pbnNlcnRMaW5lc1xuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIG1vdmVMaW5lc1VwKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIC0xKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFNoaWZ0cyBhbGwgdGhlIGxpbmVzIGluIHRoZSBkb2N1bWVudCBkb3duIG9uZSwgc3RhcnRpbmcgZnJvbSBgZmlyc3RSb3dgIGFuZCBlbmRpbmcgYXQgYGxhc3RSb3dgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gbW92ZSBkb3duXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIG1vdmUgZG93blxuICAgICogQHJldHVybnMge051bWJlcn0gSWYgYGZpcnN0Um93YCBpcyBsZXNzLXRoYW4gb3IgZXF1YWwgdG8gMCwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIDAuIE90aGVyd2lzZSwgb24gc3VjY2VzcywgaXQgcmV0dXJucyAtMS5cbiAgICAqXG4gICAgKiBAcmVsYXRlZCBEb2N1bWVudC5pbnNlcnRMaW5lc1xuICAgICoqL1xuICAgIHByaXZhdGUgbW92ZUxpbmVzRG93bihmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy4kbW92ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93LCAxKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIER1cGxpY2F0ZXMgYWxsIHRoZSB0ZXh0IGJldHdlZW4gYGZpcnN0Um93YCBhbmQgYGxhc3RSb3dgLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGZpcnN0Um93IFRoZSBzdGFydGluZyByb3cgdG8gZHVwbGljYXRlXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbGFzdFJvdyBUaGUgZmluYWwgcm93IHRvIGR1cGxpY2F0ZVxuICAgICogQHJldHVybnMge051bWJlcn0gUmV0dXJucyB0aGUgbnVtYmVyIG9mIG5ldyByb3dzIGFkZGVkOyBpbiBvdGhlciB3b3JkcywgYGxhc3RSb3cgLSBmaXJzdFJvdyArIDFgLlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIDApO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSAkY2xpcFJvd1RvRG9jdW1lbnQocm93KSB7XG4gICAgICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbihyb3csIHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGNsaXBDb2x1bW5Ub1Jvdyhyb3csIGNvbHVtbikge1xuICAgICAgICBpZiAoY29sdW1uIDwgMClcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICByZXR1cm4gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIGNvbHVtbiA9IE1hdGgubWF4KDAsIGNvbHVtbik7XG5cbiAgICAgICAgaWYgKHJvdyA8IDApIHtcbiAgICAgICAgICAgIHJvdyA9IDA7XG4gICAgICAgICAgICBjb2x1bW4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxlbiA9IHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA+PSBsZW4pIHtcbiAgICAgICAgICAgICAgICByb3cgPSBsZW4gLSAxO1xuICAgICAgICAgICAgICAgIGNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUobGVuIC0gMSkubGVuZ3RoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IHJvdyxcbiAgICAgICAgICAgIGNvbHVtbjogY29sdW1uXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHVibGljICRjbGlwUmFuZ2VUb0RvY3VtZW50KHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA8IDApIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyA9IDA7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gdGhpcy4kY2xpcENvbHVtblRvUm93KFxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyxcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW5cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVuID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICBpZiAocmFuZ2UuZW5kLnJvdyA+IGxlbikge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IGxlbjtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbikubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQucm93LFxuICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW5cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgd2hldGhlciBvciBub3QgbGluZSB3cmFwcGluZyBpcyBlbmFibGVkLiBJZiBgdXNlV3JhcE1vZGVgIGlzIGRpZmZlcmVudCB0aGFuIHRoZSBjdXJyZW50IHZhbHVlLCB0aGUgYCdjaGFuZ2VXcmFwTW9kZSdgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VXcmFwTW9kZSBFbmFibGUgKG9yIGRpc2FibGUpIHdyYXAgbW9kZVxuICAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VXNlV3JhcE1vZGUodXNlV3JhcE1vZGU6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlICE9IHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB0aGlzLiR1c2VXcmFwTW9kZSA9IHVzZVdyYXBNb2RlO1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcblxuICAgICAgICAgICAgLy8gSWYgd3JhcE1vZGUgaXMgYWN0aXZhZWQsIHRoZSB3cmFwRGF0YSBhcnJheSBoYXMgdG8gYmUgaW5pdGlhbGl6ZWQuXG4gICAgICAgICAgICBpZiAodXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgbGVuID0gdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IEFycmF5PG51bWJlcltdPihsZW4pO1xuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIGxlbiAtIDEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgd3JhcCBtb2RlIGlzIGJlaW5nIHVzZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKiovXG4gICAgZ2V0VXNlV3JhcE1vZGUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VXcmFwTW9kZTtcbiAgICB9XG5cbiAgICAvLyBBbGxvdyB0aGUgd3JhcCBsaW1pdCB0byBtb3ZlIGZyZWVseSBiZXR3ZWVuIG1pbiBhbmQgbWF4LiBFaXRoZXJcbiAgICAvLyBwYXJhbWV0ZXIgY2FuIGJlIG51bGwgdG8gYWxsb3cgdGhlIHdyYXAgbGltaXQgdG8gYmUgdW5jb25zdHJhaW5lZFxuICAgIC8vIGluIHRoYXQgZGlyZWN0aW9uLiBPciBzZXQgYm90aCBwYXJhbWV0ZXJzIHRvIHRoZSBzYW1lIG51bWJlciB0byBwaW5cbiAgICAvLyB0aGUgbGltaXQgdG8gdGhhdCB2YWx1ZS5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBib3VuZGFyaWVzIG9mIHdyYXAuIEVpdGhlciB2YWx1ZSBjYW4gYmUgYG51bGxgIHRvIGhhdmUgYW4gdW5jb25zdHJhaW5lZCB3cmFwLCBvciwgdGhleSBjYW4gYmUgdGhlIHNhbWUgbnVtYmVyIHRvIHBpbiB0aGUgbGltaXQuIElmIHRoZSB3cmFwIGxpbWl0cyBmb3IgYG1pbmAgb3IgYG1heGAgYXJlIGRpZmZlcmVudCwgdGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VXcmFwTW9kZSdgIGV2ZW50LlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtaW4gVGhlIG1pbmltdW0gd3JhcCB2YWx1ZSAodGhlIGxlZnQgc2lkZSB3cmFwKVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBtYXggVGhlIG1heGltdW0gd3JhcCB2YWx1ZSAodGhlIHJpZ2h0IHNpZGUgd3JhcClcbiAgICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBzZXRXcmFwTGltaXRSYW5nZShtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1pbiAhPT0gbWluIHx8IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1heCAhPT0gbWF4KSB7XG4gICAgICAgICAgICB0aGlzLiR3cmFwTGltaXRSYW5nZSA9IHtcbiAgICAgICAgICAgICAgICBtaW46IG1pbixcbiAgICAgICAgICAgICAgICBtYXg6IG1heFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIC8vIFRoaXMgd2lsbCBmb3JjZSBhIHJlY2FsY3VsYXRpb24gb2YgdGhlIHdyYXAgbGltaXRcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVdyYXBNb2RlXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBUaGlzIHNob3VsZCBnZW5lcmFsbHkgb25seSBiZSBjYWxsZWQgYnkgdGhlIHJlbmRlcmVyIHdoZW4gYSByZXNpemUgaXMgZGV0ZWN0ZWQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZGVzaXJlZExpbWl0IFRoZSBuZXcgd3JhcCBsaW1pdFxuICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgKlxuICAgICogQHByaXZhdGVcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRqdXN0V3JhcExpbWl0KGRlc2lyZWRMaW1pdDogbnVtYmVyLCAkcHJpbnRNYXJnaW46IG51bWJlcikge1xuICAgICAgICB2YXIgbGltaXRzID0gdGhpcy4kd3JhcExpbWl0UmFuZ2VcbiAgICAgICAgaWYgKGxpbWl0cy5tYXggPCAwKVxuICAgICAgICAgICAgbGltaXRzID0geyBtaW46ICRwcmludE1hcmdpbiwgbWF4OiAkcHJpbnRNYXJnaW4gfTtcbiAgICAgICAgdmFyIHdyYXBMaW1pdCA9IHRoaXMuJGNvbnN0cmFpbldyYXBMaW1pdChkZXNpcmVkTGltaXQsIGxpbWl0cy5taW4sIGxpbWl0cy5tYXgpO1xuICAgICAgICBpZiAod3JhcExpbWl0ICE9IHRoaXMuJHdyYXBMaW1pdCAmJiB3cmFwTGltaXQgPiAxKSB7XG4gICAgICAgICAgICB0aGlzLiR3cmFwTGltaXQgPSB3cmFwTGltaXQ7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTGltaXRcIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY29uc3RyYWluV3JhcExpbWl0KHdyYXBMaW1pdDogbnVtYmVyLCBtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICBpZiAobWluKVxuICAgICAgICAgICAgd3JhcExpbWl0ID0gTWF0aC5tYXgobWluLCB3cmFwTGltaXQpO1xuXG4gICAgICAgIGlmIChtYXgpXG4gICAgICAgICAgICB3cmFwTGltaXQgPSBNYXRoLm1pbihtYXgsIHdyYXBMaW1pdCk7XG5cbiAgICAgICAgcmV0dXJuIHdyYXBMaW1pdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIHZhbHVlIG9mIHdyYXAgbGltaXQuXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfSBUaGUgd3JhcCBsaW1pdC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldFdyYXBMaW1pdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBMaW1pdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBsaW5lIGxlbmd0aCBmb3Igc29mdCB3cmFwIGluIHRoZSBlZGl0b3IuIExpbmVzIHdpbGwgYnJlYWtcbiAgICAgKiAgYXQgYSBtaW5pbXVtIG9mIHRoZSBnaXZlbiBsZW5ndGggbWludXMgMjAgY2hhcnMgYW5kIGF0IGEgbWF4aW11bVxuICAgICAqICBvZiB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGNoYXJzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsaW1pdCBUaGUgbWF4aW11bSBsaW5lIGxlbmd0aCBpbiBjaGFycywgZm9yIHNvZnQgd3JhcHBpbmcgbGluZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRXcmFwTGltaXQobGltaXQpIHtcbiAgICAgICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShsaW1pdCwgbGltaXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgdGhhdCBkZWZpbmVzIHRoZSBtaW5pbXVtIGFuZCBtYXhpbXVtIG9mIHRoZSB3cmFwIGxpbWl0OyBpdCBsb29rcyBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICAgICpcbiAgICAqICAgICB7IG1pbjogd3JhcExpbWl0UmFuZ2VfbWluLCBtYXg6IHdyYXBMaW1pdFJhbmdlX21heCB9XG4gICAgKlxuICAgICogQHJldHVybnMge09iamVjdH1cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldFdyYXBMaW1pdFJhbmdlKCkge1xuICAgICAgICAvLyBBdm9pZCB1bmV4cGVjdGVkIG11dGF0aW9uIGJ5IHJldHVybmluZyBhIGNvcHlcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIG1pbjogdGhpcy4kd3JhcExpbWl0UmFuZ2UubWluLFxuICAgICAgICAgICAgbWF4OiB0aGlzLiR3cmFwTGltaXRSYW5nZS5tYXhcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBwcml2YXRlICR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZShlKSB7XG4gICAgICAgIHZhciB1c2VXcmFwTW9kZSA9IHRoaXMuJHVzZVdyYXBNb2RlO1xuICAgICAgICB2YXIgbGVuO1xuICAgICAgICB2YXIgYWN0aW9uID0gZS5kYXRhLmFjdGlvbjtcbiAgICAgICAgdmFyIGZpcnN0Um93ID0gZS5kYXRhLnJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGxhc3RSb3cgPSBlLmRhdGEucmFuZ2UuZW5kLnJvdztcbiAgICAgICAgdmFyIHN0YXJ0ID0gZS5kYXRhLnJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgZW5kID0gZS5kYXRhLnJhbmdlLmVuZDtcbiAgICAgICAgdmFyIHJlbW92ZWRGb2xkcyA9IG51bGw7XG5cbiAgICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwiTGluZXNcIikgIT0gLTEpIHtcbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT0gXCJpbnNlcnRMaW5lc1wiKSB7XG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93ICsgKGUuZGF0YS5saW5lcy5sZW5ndGgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZW4gPSBlLmRhdGEubGluZXMgPyBlLmRhdGEubGluZXMubGVuZ3RoIDogbGFzdFJvdyAtIGZpcnN0Um93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGVuID0gbGFzdFJvdyAtIGZpcnN0Um93O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kdXBkYXRpbmcgPSB0cnVlO1xuICAgICAgICBpZiAobGVuICE9IDApIHtcbiAgICAgICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcInJlbW92ZVwiKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgIHRoaXNbdXNlV3JhcE1vZGUgPyBcIiR3cmFwRGF0YVwiIDogXCIkcm93TGVuZ3RoQ2FjaGVcIl0uc3BsaWNlKGZpcnN0Um93LCBsZW4pO1xuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgICAgIHJlbW92ZWRGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGUuZGF0YS5yYW5nZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhyZW1vdmVkRm9sZHMpO1xuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShlbmQucm93KTtcbiAgICAgICAgICAgICAgICB2YXIgaWR4ID0gMDtcbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZW5kLnJvdywgZW5kLmNvbHVtbiwgc3RhcnQuY29sdW1uIC0gZW5kLmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KC1sZW4pO1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZUJlZm9yZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmVCZWZvcmUgJiYgZm9sZExpbmVCZWZvcmUgIT09IGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZUJlZm9yZS5tZXJnZShmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lQmVmb3JlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChpZHg7IGlkeCA8IGZvbGRMaW5lcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGRMaW5lc1tpZHhdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93ID49IGVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KC1sZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbGFzdFJvdyA9IGZpcnN0Um93O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5KGxlbik7XG4gICAgICAgICAgICAgICAgYXJncy51bnNoaWZ0KGZpcnN0Um93LCAwKTtcbiAgICAgICAgICAgICAgICB2YXIgYXJyID0gdXNlV3JhcE1vZGUgPyB0aGlzLiR3cmFwRGF0YSA6IHRoaXMuJHJvd0xlbmd0aENhY2hlXG4gICAgICAgICAgICAgICAgYXJyLnNwbGljZS5hcHBseShhcnIsIGFyZ3MpO1xuXG4gICAgICAgICAgICAgICAgLy8gSWYgc29tZSBuZXcgbGluZSBpcyBhZGRlZCBpbnNpZGUgb2YgYSBmb2xkTGluZSwgdGhlbiBzcGxpdFxuICAgICAgICAgICAgICAgIC8vIHRoZSBmb2xkIGxpbmUgdXAuXG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgICAgICAgIHZhciBpZHggPSAwO1xuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgY21wID0gZm9sZExpbmUucmFuZ2UuY29tcGFyZUluc2lkZShzdGFydC5yb3csIHN0YXJ0LmNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgLy8gSW5zaWRlIG9mIHRoZSBmb2xkTGluZSByYW5nZS4gTmVlZCB0byBzcGxpdCBzdHVmZiB1cC5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lLnNwbGl0KHN0YXJ0LnJvdywgc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0Um93LCAwLCBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBJbmZyb250IG9mIHRoZSBmb2xkTGluZSBidXQgc2FtZSByb3cuIE5lZWQgdG8gc2hpZnQgY29sdW1uLlxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGZpcnN0Um93LCAwLCBlbmQuY29sdW1uIC0gc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyBOb3RoaW5nIHRvIGRvIGlmIHRoZSBpbnNlcnQgaXMgYWZ0ZXIgdGhlIGZvbGRMaW5lLlxuICAgICAgICAgICAgICAgICAgICBpZHggPSBmb2xkTGluZXMuaW5kZXhPZihmb2xkTGluZSkgKyAxO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGZvciAoaWR4OyBpZHggPCBmb2xkTGluZXMubGVuZ3RoOyBpZHgrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkTGluZXNbaWR4XTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA+PSBmaXJzdFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFJlYWxpZ24gZm9sZHMuIEUuZy4gaWYgeW91IGFkZCBzb21lIG5ldyBjaGFycyBiZWZvcmUgYSBmb2xkLCB0aGVcbiAgICAgICAgICAgIC8vIGZvbGQgc2hvdWxkIFwibW92ZVwiIHRvIHRoZSByaWdodC5cbiAgICAgICAgICAgIGxlbiA9IE1hdGguYWJzKGUuZGF0YS5yYW5nZS5zdGFydC5jb2x1bW4gLSBlLmRhdGEucmFuZ2UuZW5kLmNvbHVtbik7XG4gICAgICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJyZW1vdmVcIikgIT0gLTEpIHtcbiAgICAgICAgICAgICAgICAvLyBHZXQgYWxsIHRoZSBmb2xkcyBpbiB0aGUgY2hhbmdlIHJhbmdlIGFuZCByZW1vdmUgdGhlbS5cbiAgICAgICAgICAgICAgICByZW1vdmVkRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShlLmRhdGEucmFuZ2UpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMocmVtb3ZlZEZvbGRzKTtcblxuICAgICAgICAgICAgICAgIGxlbiA9IC1sZW47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGZpcnN0Um93KTtcbiAgICAgICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKGZpcnN0Um93LCBzdGFydC5jb2x1bW4sIGxlbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodXNlV3JhcE1vZGUgJiYgdGhpcy4kd3JhcERhdGEubGVuZ3RoICE9IHRoaXMuZG9jLmdldExlbmd0aCgpKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiZG9jLmdldExlbmd0aCgpIGFuZCAkd3JhcERhdGEubGVuZ3RoIGhhdmUgdG8gYmUgdGhlIHNhbWUhXCIpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuJHVwZGF0aW5nID0gZmFsc2U7XG5cbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoZmlyc3RSb3csIGxhc3RSb3cpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShmaXJzdFJvdywgbGFzdFJvdyk7XG5cbiAgICAgICAgcmV0dXJuIHJlbW92ZWRGb2xkcztcbiAgICB9XG5cbiAgICBwdWJsaWMgJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZpcnN0Um93LCBsYXN0Um93LCBiPykge1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZVtmaXJzdFJvd10gPSBudWxsO1xuICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZVtsYXN0Um93XSA9IG51bGw7XG4gICAgfVxuXG4gICAgcHVibGljICR1cGRhdGVXcmFwRGF0YShmaXJzdFJvdywgbGFzdFJvdykge1xuICAgICAgICB2YXIgbGluZXMgPSB0aGlzLmRvYy5nZXRBbGxMaW5lcygpO1xuICAgICAgICB2YXIgdGFiU2l6ZSA9IHRoaXMuZ2V0VGFiU2l6ZSgpO1xuICAgICAgICB2YXIgd3JhcERhdGEgPSB0aGlzLiR3cmFwRGF0YTtcbiAgICAgICAgdmFyIHdyYXBMaW1pdCA9IHRoaXMuJHdyYXBMaW1pdDtcbiAgICAgICAgdmFyIHRva2VucztcbiAgICAgICAgdmFyIGZvbGRMaW5lO1xuXG4gICAgICAgIHZhciByb3cgPSBmaXJzdFJvdztcbiAgICAgICAgbGFzdFJvdyA9IE1hdGgubWluKGxhc3RSb3csIGxpbmVzLmxlbmd0aCAtIDEpO1xuICAgICAgICB3aGlsZSAocm93IDw9IGxhc3RSb3cpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICB0b2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKGxpbmVzW3Jvd10pO1xuICAgICAgICAgICAgICAgIHdyYXBEYXRhW3Jvd10gPSB0aGlzLiRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnMsIHdyYXBMaW1pdCwgdGFiU2l6ZSk7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IFtdO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLndhbGsoZnVuY3Rpb24ocGxhY2Vob2xkZXIsIHJvdywgY29sdW1uLCBsYXN0Q29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB3YWxrVG9rZW5zOiBudW1iZXJbXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnMgPSB0aGlzLiRnZXREaXNwbGF5VG9rZW5zKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyLCB0b2tlbnMubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnNbMF0gPSBQTEFDRUhPTERFUl9TVEFSVDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgd2Fsa1Rva2Vucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdhbGtUb2tlbnNbaV0gPSBQTEFDRUhPTERFUl9CT0RZO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGluZXNbcm93XS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b2tlbnMubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB0b2tlbnMgPSB0b2tlbnMuY29uY2F0KHdhbGtUb2tlbnMpO1xuICAgICAgICAgICAgICAgIH0uYmluZCh0aGlzKSxcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLnJvdyxcbiAgICAgICAgICAgICAgICAgICAgbGluZXNbZm9sZExpbmUuZW5kLnJvd10ubGVuZ3RoICsgMVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICB3cmFwRGF0YVtmb2xkTGluZS5zdGFydC5yb3ddID0gdGhpcy4kY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zLCB3cmFwTGltaXQsIHRhYlNpemUpO1xuICAgICAgICAgICAgICAgIHJvdyA9IGZvbGRMaW5lLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY29tcHV0ZVdyYXBTcGxpdHModG9rZW5zOiBudW1iZXJbXSwgd3JhcExpbWl0OiBudW1iZXIsIHRhYlNpemU/OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRva2Vucy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNwbGl0czogbnVtYmVyW10gPSBbXTtcbiAgICAgICAgdmFyIGRpc3BsYXlMZW5ndGggPSB0b2tlbnMubGVuZ3RoO1xuICAgICAgICB2YXIgbGFzdFNwbGl0ID0gMCwgbGFzdERvY1NwbGl0ID0gMDtcblxuICAgICAgICB2YXIgaXNDb2RlID0gdGhpcy4kd3JhcEFzQ29kZTtcblxuICAgICAgICBmdW5jdGlvbiBhZGRTcGxpdChzY3JlZW5Qb3M6IG51bWJlcikge1xuICAgICAgICAgICAgdmFyIGRpc3BsYXllZCA9IHRva2Vucy5zbGljZShsYXN0U3BsaXQsIHNjcmVlblBvcyk7XG5cbiAgICAgICAgICAgIC8vIFRoZSBkb2N1bWVudCBzaXplIGlzIHRoZSBjdXJyZW50IHNpemUgLSB0aGUgZXh0cmEgd2lkdGggZm9yIHRhYnNcbiAgICAgICAgICAgIC8vIGFuZCBtdWx0aXBsZVdpZHRoIGNoYXJhY3RlcnMuXG4gICAgICAgICAgICB2YXIgbGVuID0gZGlzcGxheWVkLmxlbmd0aDtcbiAgICAgICAgICAgIGRpc3BsYXllZC5qb2luKFwiXCIpLlxuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgdGhlIFRBQl9TUEFDRXMuXG4gICAgICAgICAgICAgICAgcmVwbGFjZSgvMTIvZywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlbiAtPSAxO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgICAgICAgICAgICAgIH0pLlxuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgdGhlIENIQVJfRVhUL211bHRpcGxlV2lkdGggY2hhcmFjdGVycy5cbiAgICAgICAgICAgICAgICByZXBsYWNlKC8yL2csIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBsZW4gLT0gMTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZvaWQgMDtcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgbGFzdERvY1NwbGl0ICs9IGxlbjtcbiAgICAgICAgICAgIHNwbGl0cy5wdXNoKGxhc3REb2NTcGxpdCk7XG4gICAgICAgICAgICBsYXN0U3BsaXQgPSBzY3JlZW5Qb3M7XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoZGlzcGxheUxlbmd0aCAtIGxhc3RTcGxpdCA+IHdyYXBMaW1pdCkge1xuICAgICAgICAgICAgLy8gVGhpcyBpcywgd2hlcmUgdGhlIHNwbGl0IHNob3VsZCBiZS5cbiAgICAgICAgICAgIHZhciBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcblxuICAgICAgICAgICAgLy8gSWYgdGhlcmUgaXMgYSBzcGFjZSBvciB0YWIgYXQgdGhpcyBzcGxpdCBwb3NpdGlvbiwgdGhlbiBtYWtpbmdcbiAgICAgICAgICAgIC8vIGEgc3BsaXQgaXMgc2ltcGxlLlxuICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdCAtIDFdID49IFNQQUNFICYmIHRva2Vuc1tzcGxpdF0gPj0gU1BBQ0UpIHtcbiAgICAgICAgICAgICAgICAvKiBkaXNhYmxlZCBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FqYXhvcmcvYWNlL2lzc3Vlcy8xMTg2XG4gICAgICAgICAgICAgICAgLy8gSW5jbHVkZSBhbGwgZm9sbG93aW5nIHNwYWNlcyArIHRhYnMgaW4gdGhpcyBzcGxpdCBhcyB3ZWxsLlxuICAgICAgICAgICAgICAgIHdoaWxlICh0b2tlbnNbc3BsaXRdID49IFNQQUNFKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0ICsrO1xuICAgICAgICAgICAgICAgIH0gKi9cbiAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgc3BsaXQgaXMgaW5zaWRlIG9mIGEgcGxhY2Vob2xkZXIuIFBsYWNlaG9sZGVyIGFyZVxuICAgICAgICAgICAgLy8gbm90IHNwbGl0YWJsZS4gVGhlcmVmb3JlLCBzZWVrIHRoZSBiZWdpbm5pbmcgb2YgdGhlIHBsYWNlaG9sZGVyXG4gICAgICAgICAgICAvLyBhbmQgdHJ5IHRvIHBsYWNlIHRoZSBzcGxpdCBiZW9mcmUgdGhlIHBsYWNlaG9sZGVyJ3Mgc3RhcnQuXG4gICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9TVEFSVCB8fCB0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX0JPRFkpIHtcbiAgICAgICAgICAgICAgICAvLyBTZWVrIHRoZSBzdGFydCBvZiB0aGUgcGxhY2Vob2xkZXIgYW5kIGRvIHRoZSBzcGxpdFxuICAgICAgICAgICAgICAgIC8vIGJlZm9yZSB0aGUgcGxhY2Vob2xkZXIuIEJ5IGRlZmluaXRpb24gdGhlcmUgYWx3YXlzXG4gICAgICAgICAgICAgICAgLy8gYSBQTEFDRUhPTERFUl9TVEFSVCBiZXR3ZWVuIHNwbGl0IGFuZCBsYXN0U3BsaXQuXG4gICAgICAgICAgICAgICAgZm9yIChzcGxpdDsgc3BsaXQgIT0gbGFzdFNwbGl0IC0gMTsgc3BsaXQtLSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0XSA9PSBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gc3BsaXQrKzsgPDwgTm8gaW5jcmVtZW50YWwgaGVyZSBhcyB3ZSB3YW50IHRvXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgaGF2ZSB0aGUgcG9zaXRpb24gYmVmb3JlIHRoZSBQbGFjZWhvbGRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIFBMQUNFSE9MREVSX1NUQVJUIGlzIG5vdCB0aGUgaW5kZXggb2YgdGhlXG4gICAgICAgICAgICAgICAgLy8gbGFzdCBzcGxpdCwgdGhlbiB3ZSBjYW4gZG8gdGhlIHNwbGl0XG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0ID4gbGFzdFNwbGl0KSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIFBMQUNFSE9MREVSX1NUQVJUIElTIHRoZSBpbmRleCBvZiB0aGUgbGFzdFxuICAgICAgICAgICAgICAgIC8vIHNwbGl0LCB0aGVuIHdlIGhhdmUgdG8gcGxhY2UgdGhlIHNwbGl0IGFmdGVyIHRoZVxuICAgICAgICAgICAgICAgIC8vIHBsYWNlaG9sZGVyLiBTbywgbGV0J3Mgc2VlayBmb3IgdGhlIGVuZCBvZiB0aGUgcGxhY2Vob2xkZXIuXG4gICAgICAgICAgICAgICAgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG4gICAgICAgICAgICAgICAgZm9yIChzcGxpdDsgc3BsaXQgPCB0b2tlbnMubGVuZ3RoOyBzcGxpdCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdICE9IFBMQUNFSE9MREVSX0JPRFkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gSWYgc3BpbHQgPT0gdG9rZW5zLmxlbmd0aCwgdGhlbiB0aGUgcGxhY2Vob2xkZXIgaXMgdGhlIGxhc3RcbiAgICAgICAgICAgICAgICAvLyB0aGluZyBpbiB0aGUgbGluZSBhbmQgYWRkaW5nIGEgbmV3IHNwbGl0IGRvZXNuJ3QgbWFrZSBzZW5zZS5cbiAgICAgICAgICAgICAgICBpZiAoc3BsaXQgPT0gdG9rZW5zLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBicmVhazsgIC8vIEJyZWFrcyB0aGUgd2hpbGUtbG9vcC5cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBGaW5hbGx5LCBhZGQgdGhlIHNwbGl0Li4uXG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyA9PT0gRUxTRSA9PT1cbiAgICAgICAgICAgIC8vIFNlYXJjaCBmb3IgdGhlIGZpcnN0IG5vbiBzcGFjZS90YWIvcGxhY2Vob2xkZXIvcHVuY3R1YXRpb24gdG9rZW4gYmFja3dhcmRzLlxuICAgICAgICAgICAgdmFyIG1pblNwbGl0ID0gTWF0aC5tYXgoc3BsaXQgLSAoaXNDb2RlID8gMTAgOiB3cmFwTGltaXQgLSAod3JhcExpbWl0ID4+IDIpKSwgbGFzdFNwbGl0IC0gMSk7XG4gICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgUExBQ0VIT0xERVJfU1RBUlQpIHtcbiAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlzQ29kZSkge1xuICAgICAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdID09IFBVTkNUVUFUSU9OKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB3aGlsZSAoc3BsaXQgPiBtaW5TcGxpdCAmJiB0b2tlbnNbc3BsaXRdIDwgU1BBQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBJZiB3ZSBmb3VuZCBvbmUsIHRoZW4gYWRkIHRoZSBzcGxpdC5cbiAgICAgICAgICAgIGlmIChzcGxpdCA+IG1pblNwbGl0KSB7XG4gICAgICAgICAgICAgICAgYWRkU3BsaXQoKytzcGxpdCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgICAgICAgc3BsaXQgPSBsYXN0U3BsaXQgKyB3cmFwTGltaXQ7XG4gICAgICAgICAgICAvLyBUaGUgc3BsaXQgaXMgaW5zaWRlIG9mIGEgQ0hBUiBvciBDSEFSX0VYVCB0b2tlbiBhbmQgbm8gc3BhY2VcbiAgICAgICAgICAgIC8vIGFyb3VuZCAtPiBmb3JjZSBhIHNwbGl0LlxuICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzcGxpdHM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBHaXZlbiBhIHN0cmluZywgcmV0dXJucyBhbiBhcnJheSBvZiB0aGUgZGlzcGxheSBjaGFyYWN0ZXJzLCBpbmNsdWRpbmcgdGFicyBhbmQgc3BhY2VzLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHN0ciBUaGUgc3RyaW5nIHRvIGNoZWNrXG4gICAgKiBAcGFyYW0ge051bWJlcn0gb2Zmc2V0IFRoZSB2YWx1ZSB0byBzdGFydCBhdFxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHJpdmF0ZSAkZ2V0RGlzcGxheVRva2VucyhzdHI6IHN0cmluZywgb2Zmc2V0PzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICB2YXIgYXJyOiBudW1iZXJbXSA9IFtdO1xuICAgICAgICB2YXIgdGFiU2l6ZTogbnVtYmVyO1xuICAgICAgICBvZmZzZXQgPSBvZmZzZXQgfHwgMDtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGMgPSBzdHIuY2hhckNvZGVBdChpKTtcbiAgICAgICAgICAgIC8vIFRhYlxuICAgICAgICAgICAgaWYgKGMgPT0gOSkge1xuICAgICAgICAgICAgICAgIHRhYlNpemUgPSB0aGlzLmdldFNjcmVlblRhYlNpemUoYXJyLmxlbmd0aCArIG9mZnNldCk7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goVEFCKTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBuID0gMTsgbiA8IHRhYlNpemU7IG4rKykge1xuICAgICAgICAgICAgICAgICAgICBhcnIucHVzaChUQUJfU1BBQ0UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFNwYWNlXG4gICAgICAgICAgICBlbHNlIGlmIChjID09IDMyKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goU1BBQ0UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoKGMgPiAzOSAmJiBjIDwgNDgpIHx8IChjID4gNTcgJiYgYyA8IDY0KSkge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKFBVTkNUVUFUSU9OKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGZ1bGwgd2lkdGggY2hhcmFjdGVyc1xuICAgICAgICAgICAgZWxzZSBpZiAoYyA+PSAweDExMDAgJiYgaXNGdWxsV2lkdGgoYykpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChDSEFSLCBDSEFSX0VYVCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChDSEFSKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYXJyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbGN1bGF0ZXMgdGhlIHdpZHRoIG9mIHRoZSBzdHJpbmcgYHN0cmAgb24gdGhlIHNjcmVlbiB3aGlsZSBhc3N1bWluZyB0aGF0IHRoZSBzdHJpbmcgc3RhcnRzIGF0IHRoZSBmaXJzdCBjb2x1bW4gb24gdGhlIHNjcmVlbi5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBzdHIgVGhlIHN0cmluZyB0byBjYWxjdWxhdGUgdGhlIHNjcmVlbiB3aWR0aCBvZlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IG1heFNjcmVlbkNvbHVtblxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcmVlbkNvbHVtblxuICAgICogQHJldHVybnMge1tOdW1iZXJdfSBSZXR1cm5zIGFuIGBpbnRbXWAgYXJyYXkgd2l0aCB0d28gZWxlbWVudHM6PGJyLz5cbiAgICAqIFRoZSBmaXJzdCBwb3NpdGlvbiBpbmRpY2F0ZXMgdGhlIG51bWJlciBvZiBjb2x1bW5zIGZvciBgc3RyYCBvbiBzY3JlZW4uPGJyLz5cbiAgICAqIFRoZSBzZWNvbmQgdmFsdWUgY29udGFpbnMgdGhlIHBvc2l0aW9uIG9mIHRoZSBkb2N1bWVudCBjb2x1bW4gdGhhdCB0aGlzIGZ1bmN0aW9uIHJlYWQgdW50aWwuXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyAkZ2V0U3RyaW5nU2NyZWVuV2lkdGgoc3RyOiBzdHJpbmcsIG1heFNjcmVlbkNvbHVtbj86IG51bWJlciwgc2NyZWVuQ29sdW1uPzogbnVtYmVyKTogbnVtYmVyW10ge1xuICAgICAgICBpZiAobWF4U2NyZWVuQ29sdW1uID09IDApXG4gICAgICAgICAgICByZXR1cm4gWzAsIDBdO1xuICAgICAgICBpZiAobWF4U2NyZWVuQ29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBtYXhTY3JlZW5Db2x1bW4gPSBJbmZpbml0eTtcbiAgICAgICAgc2NyZWVuQ29sdW1uID0gc2NyZWVuQ29sdW1uIHx8IDA7XG5cbiAgICAgICAgdmFyIGM6IG51bWJlcjtcbiAgICAgICAgdmFyIGNvbHVtbjogbnVtYmVyO1xuICAgICAgICBmb3IgKGNvbHVtbiA9IDA7IGNvbHVtbiA8IHN0ci5sZW5ndGg7IGNvbHVtbisrKSB7XG4gICAgICAgICAgICBjID0gc3RyLmNoYXJDb2RlQXQoY29sdW1uKTtcbiAgICAgICAgICAgIC8vIHRhYlxuICAgICAgICAgICAgaWYgKGMgPT0gOSkge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSB0aGlzLmdldFNjcmVlblRhYlNpemUoc2NyZWVuQ29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGZ1bGwgd2lkdGggY2hhcmFjdGVyc1xuICAgICAgICAgICAgZWxzZSBpZiAoYyA+PSAweDExMDAgJiYgaXNGdWxsV2lkdGgoYykpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoc2NyZWVuQ29sdW1uID4gbWF4U2NyZWVuQ29sdW1uKSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gW3NjcmVlbkNvbHVtbiwgY29sdW1uXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgbnVtYmVyIG9mIHNjcmVlbnJvd3MgaW4gYSB3cmFwcGVkIGxpbmUuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIGNoZWNrXG4gICAgKlxuICAgICogQHJldHVybnMge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0Um93TGVuZ3RoKHJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICB2YXIgaCA9IHRoaXMubGluZVdpZGdldHNbcm93XSAmJiB0aGlzLmxpbmVXaWRnZXRzW3Jvd10ucm93Q291bnQgfHwgMDtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgaCA9IDBcbiAgICAgICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSB8fCAhdGhpcy4kd3JhcERhdGFbcm93XSkge1xuICAgICAgICAgICAgcmV0dXJuIDEgKyBoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMSArIGg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIGdldFJvd0xpbmVDb3VudChyb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUgfHwgIXRoaXMuJHdyYXBEYXRhW3Jvd10pIHtcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHB1YmxpYyBnZXRSb3dXcmFwSW5kZW50KHNjcmVlblJvdzogbnVtYmVyKSB7XG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbcG9zLnJvd107XG4gICAgICAgICAgICAvLyBGSVhNRTogaW5kZW50IGRvZXMgbm90IGV4aXN0cyBvbiBudW1iZXJbXVxuICAgICAgICAgICAgcmV0dXJuIHNwbGl0cy5sZW5ndGggJiYgc3BsaXRzWzBdIDwgcG9zLmNvbHVtbiA/IHNwbGl0c1snaW5kZW50J10gOiAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBwb3NpdGlvbiAob24gc2NyZWVuKSBmb3IgdGhlIGxhc3QgY2hhcmFjdGVyIGluIHRoZSBwcm92aWRlZCBzY3JlZW4gcm93LlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICAqXG4gICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlbkNvbHVtblxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIHBvcyA9IHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHJldHVybiB0aGlzLmRvY3VtZW50VG9TY3JlZW5Db2x1bW4ocG9zLnJvdywgcG9zLmNvbHVtbik7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGNvbHVtbiBwb3NpdGlvbiBvZiB0aGUgbGFzdCBzY3JlZW4gcm93LlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICpcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uKGRvY1JvdywgZG9jQ29sdW1uKSB7XG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLmRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRTY3JlZW5MYXN0Um93Q29sdW1uKHNjcmVlblJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCB0aGlzIHJldHVybnMgdGhlIGRvY3VtZW50IHBvc2l0aW9uIG9mIHRoZSBsYXN0IHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW5cbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXREb2N1bWVudExhc3RSb3dDb2x1bW5Qb3NpdGlvbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdywgTnVtYmVyLk1BWF9WQUxVRSAvIDEwKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gcm93LCB0aGlzIHJldHVybnMgdGhlIHNwbGl0IGRhdGEuXG4gICAgKiBAcmV0dXJucyB7U3RyaW5nfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRSb3dTcGxpdERhdGEocm93OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBkaXN0YW5jZSB0byB0aGUgbmV4dCB0YWIgc3RvcCBhdCB0aGUgc3BlY2lmaWVkIHNjcmVlbiBjb2x1bW4uXG4gICAgICogQG1ldGhvcyBnZXRTY3JlZW5UYWJTaXplXG4gICAgICogQHBhcmFtIHNjcmVlbkNvbHVtbiB7bnVtYmVyfSBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVja1xuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0YWJTaXplIC0gc2NyZWVuQ29sdW1uICUgdGhpcy4kdGFiU2l6ZTtcbiAgICB9XG5cblxuICAgIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50Um93KHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikucm93O1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBzY3JlZW5Ub0RvY3VtZW50Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikuY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQ29udmVydHMgY2hhcmFjdGVycyBjb29yZGluYXRlcyBvbiB0aGUgc2NyZWVuIHRvIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgd2l0aGluIHRoZSBkb2N1bWVudC4gW1RoaXMgdGFrZXMgaW50byBhY2NvdW50IGNvZGUgZm9sZGluZywgd29yZCB3cmFwLCB0YWIgc2l6ZSwgYW5kIGFueSBvdGhlciB2aXN1YWwgbW9kaWZpY2F0aW9ucy5dezogI2NvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Db2x1bW4gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgKiovXG4gICAgcHVibGljIHNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3c6IG51bWJlciwgc2NyZWVuQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgaWYgKHNjcmVlblJvdyA8IDApIHtcbiAgICAgICAgICAgIHJldHVybiB7IHJvdzogMCwgY29sdW1uOiAwIH07XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGluZTtcbiAgICAgICAgdmFyIGRvY1JvdyA9IDA7XG4gICAgICAgIHZhciBkb2NDb2x1bW4gPSAwO1xuICAgICAgICB2YXIgY29sdW1uO1xuICAgICAgICB2YXIgcm93ID0gMDtcbiAgICAgICAgdmFyIHJvd0xlbmd0aCA9IDA7XG5cbiAgICAgICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kc2NyZWVuUm93Q2FjaGU7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgc2NyZWVuUm93KTtcbiAgICAgICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvY1JvdyA9IHRoaXMuJGRvY1Jvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSBzY3JlZW5Sb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1heFJvdyA9IHRoaXMuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShkb2NSb3cpO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcblxuICAgICAgICB3aGlsZSAocm93IDw9IHNjcmVlblJvdykge1xuICAgICAgICAgICAgcm93TGVuZ3RoID0gdGhpcy5nZXRSb3dMZW5ndGgoZG9jUm93KTtcbiAgICAgICAgICAgIGlmIChyb3cgKyByb3dMZW5ndGggPiBzY3JlZW5Sb3cgfHwgZG9jUm93ID49IG1heFJvdykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByb3cgKz0gcm93TGVuZ3RoO1xuICAgICAgICAgICAgICAgIGRvY1JvdysrO1xuICAgICAgICAgICAgICAgIGlmIChkb2NSb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jUm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUoZG9jUm93LCBmb2xkTGluZSk7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoZG9DYWNoZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGRvY1Jvd0NhY2hlLnB1c2goZG9jUm93KTtcbiAgICAgICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZm9sZExpbmUgJiYgZm9sZExpbmUuc3RhcnQucm93IDw9IGRvY1Jvdykge1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lKTtcbiAgICAgICAgICAgIGRvY1JvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfSBlbHNlIGlmIChyb3cgKyByb3dMZW5ndGggPD0gc2NyZWVuUm93IHx8IGRvY1JvdyA+IG1heFJvdykge1xuICAgICAgICAgICAgLy8gY2xpcCBhdCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudFxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICByb3c6IG1heFJvdyxcbiAgICAgICAgICAgICAgICBjb2x1bW46IHRoaXMuZ2V0TGluZShtYXhSb3cpLmxlbmd0aFxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0TGluZShkb2NSb3cpO1xuICAgICAgICAgICAgZm9sZExpbmUgPSBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgc3BsaXRzID0gdGhpcy4kd3JhcERhdGFbZG9jUm93XTtcbiAgICAgICAgICAgIGlmIChzcGxpdHMpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3BsaXRJbmRleCA9IE1hdGguZmxvb3Ioc2NyZWVuUm93IC0gcm93KTtcbiAgICAgICAgICAgICAgICBjb2x1bW4gPSBzcGxpdHNbc3BsaXRJbmRleF07XG4gICAgICAgICAgICAgICAgaWYgKHNwbGl0SW5kZXggPiAwICYmIHNwbGl0cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgZG9jQ29sdW1uID0gc3BsaXRzW3NwbGl0SW5kZXggLSAxXSB8fCBzcGxpdHNbc3BsaXRzLmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICBsaW5lID0gbGluZS5zdWJzdHJpbmcoZG9jQ29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBkb2NDb2x1bW4gKz0gdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgobGluZSwgc2NyZWVuQ29sdW1uKVsxXTtcblxuICAgICAgICAvLyBXZSByZW1vdmUgb25lIGNoYXJhY3RlciBhdCB0aGUgZW5kIHNvIHRoYXQgdGhlIGRvY0NvbHVtblxuICAgICAgICAvLyBwb3NpdGlvbiByZXR1cm5lZCBpcyBub3QgYXNzb2NpYXRlZCB0byB0aGUgbmV4dCByb3cgb24gdGhlIHNjcmVlbi5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlICYmIGRvY0NvbHVtbiA+PSBjb2x1bW4pXG4gICAgICAgICAgICBkb2NDb2x1bW4gPSBjb2x1bW4gLSAxO1xuXG4gICAgICAgIGlmIChmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBmb2xkTGluZS5pZHhUb1Bvc2l0aW9uKGRvY0NvbHVtbik7XG5cbiAgICAgICAgcmV0dXJuIHsgcm93OiBkb2NSb3csIGNvbHVtbjogZG9jQ29sdW1uIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBDb252ZXJ0cyBkb2N1bWVudCBjb29yZGluYXRlcyB0byBzY3JlZW4gY29vcmRpbmF0ZXMuIHs6Y29udmVyc2lvbkNvbnNpZGVyYXRpb25zfVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1JvdyBUaGUgZG9jdW1lbnQgcm93IHRvIGNoZWNrXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uIFRoZSBkb2N1bWVudCBjb2x1bW4gdG8gY2hlY2tcbiAgICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBvYmplY3QgcmV0dXJuZWQgYnkgdGhpcyBtZXRob2QgaGFzIHR3byBwcm9wZXJ0aWVzOiBgcm93YCBhbmQgYGNvbHVtbmAuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Qb3NpdGlvbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgdmFyIHBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcbiAgICAgICAgLy8gTm9ybWFsaXplIHRoZSBwYXNzZWQgaW4gYXJndW1lbnRzLlxuICAgICAgICBpZiAodHlwZW9mIGRvY0NvbHVtbiA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgcG9zID0gdGhpcy4kY2xpcFBvc2l0aW9uVG9Eb2N1bWVudChkb2NSb3dbJ3JvdyddLCBkb2NSb3dbJ2NvbHVtbiddKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgICAgIGFzc2VydCh0eXBlb2YgZG9jQ29sdW1uID09PSAnbnVtYmVyJywgXCJkb2NDb2x1bW4gbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICB9XG5cbiAgICAgICAgZG9jUm93ID0gcG9zLnJvdztcbiAgICAgICAgZG9jQ29sdW1uID0gcG9zLmNvbHVtbjtcbiAgICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NSb3cgPT09ICdudW1iZXInLCBcImRvY1JvdyBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuICAgICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG5cbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IDA7XG4gICAgICAgIHZhciBmb2xkU3RhcnRSb3cgPSBudWxsO1xuICAgICAgICB2YXIgZm9sZCA9IG51bGw7XG5cbiAgICAgICAgLy8gQ2xhbXAgdGhlIGRvY1JvdyBwb3NpdGlvbiBpbiBjYXNlIGl0J3MgaW5zaWRlIG9mIGEgZm9sZGVkIGJsb2NrLlxuICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQoZG9jUm93LCBkb2NDb2x1bW4sIDEpO1xuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgZG9jUm93ID0gZm9sZC5zdGFydC5yb3c7XG4gICAgICAgICAgICBkb2NDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByb3dFbmQsIHJvdyA9IDA7XG5cbiAgICAgICAgdmFyIHJvd0NhY2hlID0gdGhpcy4kZG9jUm93Q2FjaGU7XG4gICAgICAgIHZhciBpID0gdGhpcy4kZ2V0Um93Q2FjaGVJbmRleChyb3dDYWNoZSwgZG9jUm93KTtcbiAgICAgICAgdmFyIGwgPSByb3dDYWNoZS5sZW5ndGg7XG4gICAgICAgIGlmIChsICYmIGkgPj0gMCkge1xuICAgICAgICAgICAgdmFyIHJvdyA9IHJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuJHNjcmVlblJvd0NhY2hlW2ldO1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSBkb2NSb3cgPiByb3dDYWNoZVtsIC0gMV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9ICFsO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXROZXh0Rm9sZExpbmUocm93KTtcbiAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgd2hpbGUgKHJvdyA8IGRvY1Jvdykge1xuICAgICAgICAgICAgaWYgKHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICByb3dFbmQgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICBpZiAocm93RW5kID4gZG9jUm93KVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvd0VuZCwgZm9sZExpbmUpO1xuICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICByb3dFbmQgPSByb3cgKyAxO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzY3JlZW5Sb3cgKz0gdGhpcy5nZXRSb3dMZW5ndGgocm93KTtcbiAgICAgICAgICAgIHJvdyA9IHJvd0VuZDtcblxuICAgICAgICAgICAgaWYgKGRvQ2FjaGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5wdXNoKHJvdyk7XG4gICAgICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUucHVzaChzY3JlZW5Sb3cpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSB0ZXh0IGxpbmUgdGhhdCBpcyBkaXNwbGF5ZWQgaW4gZG9jUm93IG9uIHRoZSBzY3JlZW4uXG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBmaW5hbCByb3cgd2Ugd2FudCB0byByZWFjaCBpcyBpbnNpZGUgb2YgYSBmb2xkLlxuICAgICAgICBpZiAoZm9sZExpbmUgJiYgcm93ID49IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgdGV4dExpbmUgPSB0aGlzLmdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZSwgZG9jUm93LCBkb2NDb2x1bW4pO1xuICAgICAgICAgICAgZm9sZFN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGV4dExpbmUgPSB0aGlzLmdldExpbmUoZG9jUm93KS5zdWJzdHJpbmcoMCwgZG9jQ29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRTdGFydFJvdyA9IGRvY1JvdztcbiAgICAgICAgfVxuICAgICAgICAvLyBDbGFtcCB0ZXh0TGluZSBpZiBpbiB3cmFwTW9kZS5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgd3JhcFJvdyA9IHRoaXMuJHdyYXBEYXRhW2ZvbGRTdGFydFJvd107XG4gICAgICAgICAgICBpZiAod3JhcFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzY3JlZW5Sb3dPZmZzZXQgPSAwO1xuICAgICAgICAgICAgICAgIHdoaWxlICh0ZXh0TGluZS5sZW5ndGggPj0gd3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXRdKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjcmVlblJvdysrO1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Sb3dPZmZzZXQrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGV4dExpbmUgPSB0ZXh0TGluZS5zdWJzdHJpbmcod3JhcFJvd1tzY3JlZW5Sb3dPZmZzZXQgLSAxXSB8fCAwLCB0ZXh0TGluZS5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHJvdzogc2NyZWVuUm93LFxuICAgICAgICAgICAgY29sdW1uOiB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCh0ZXh0TGluZSlbMF1cbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiBjb2x1bW4uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiBAcmV0dXJucyB7TnVtYmVyfVxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlbkNvbHVtbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pLmNvbHVtbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiByb3cuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKS5yb3c7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBsZW5ndGggb2YgdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gICAgKiovXG4gICAgcHVibGljIGdldFNjcmVlbkxlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICB2YXIgc2NyZWVuUm93cyA9IDA7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkTGluZSA9IG51bGw7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHNjcmVlblJvd3MgPSB0aGlzLmdldExlbmd0aCgpO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGZvbGRlZCBsaW5lcyBhZ2Fpbi5cbiAgICAgICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgICAgICBzY3JlZW5Sb3dzIC09IGZvbGQuZW5kLnJvdyAtIGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxhc3RSb3cgPSB0aGlzLiR3cmFwRGF0YS5sZW5ndGg7XG4gICAgICAgICAgICB2YXIgcm93ID0gMCwgaSA9IDA7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgICB2YXIgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG5cbiAgICAgICAgICAgIHdoaWxlIChyb3cgPCBsYXN0Um93KSB7XG4gICAgICAgICAgICAgICAgdmFyIHNwbGl0cyA9IHRoaXMuJHdyYXBEYXRhW3Jvd107XG4gICAgICAgICAgICAgICAgc2NyZWVuUm93cyArPSBzcGxpdHMgPyBzcGxpdHMubGVuZ3RoICsgMSA6IDE7XG4gICAgICAgICAgICAgICAgcm93Kys7XG4gICAgICAgICAgICAgICAgaWYgKHJvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICByb3cgPSBmb2xkLmVuZC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgICAgICBmb2xkID0gdGhpcy4kZm9sZERhdGFbaSsrXTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZCA/IGZvbGQuc3RhcnQucm93IDogSW5maW5pdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdG9kb1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0cykge1xuICAgICAgICAgICAgc2NyZWVuUm93cyArPSB0aGlzLiRnZXRXaWRnZXRTY3JlZW5MZW5ndGgoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzY3JlZW5Sb3dzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHVibGljICRzZXRGb250TWV0cmljcyhmbSkge1xuICAgICAgICAvLyB0b2RvXG4gICAgfVxuXG4gICAgZmluZE1hdGNoaW5nQnJhY2tldChwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgY2hyPzogc3RyaW5nKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5maW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uLCBjaHIpO1xuICAgIH1cblxuICAgIGdldEJyYWNrZXRSYW5nZShwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSk6IFJhbmdlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLmdldEJyYWNrZXRSYW5nZShwb3NpdGlvbik7XG4gICAgfVxuXG4gICAgJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0OiBzdHJpbmcsIHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0eXBlUmU/OiBSZWdFeHApOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLiRmaW5kT3BlbmluZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gICAgfVxuXG4gICAgJGZpbmRDbG9zaW5nQnJhY2tldChicmFja2V0OiBzdHJpbmcsIHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0eXBlUmU/OiBSZWdFeHApOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLiRmaW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gICAgfVxuICAgIHByaXZhdGUgJGZvbGRNb2RlO1xuXG4gICAgLy8gc3RydWN0dXJlZCBmb2xkaW5nXG4gICAgJGZvbGRTdHlsZXMgPSB7XG4gICAgICAgIFwibWFudWFsXCI6IDEsXG4gICAgICAgIFwibWFya2JlZ2luXCI6IDEsXG4gICAgICAgIFwibWFya2JlZ2luZW5kXCI6IDFcbiAgICB9XG4gICAgJGZvbGRTdHlsZSA9IFwibWFya2JlZ2luXCI7XG4gICAgLypcbiAgICAgKiBMb29rcyB1cCBhIGZvbGQgYXQgYSBnaXZlbiByb3cvY29sdW1uLiBQb3NzaWJsZSB2YWx1ZXMgZm9yIHNpZGU6XG4gICAgICogICAtMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLnN0YXJ0ID0gcm93L2NvbHVtblxuICAgICAqICAgKzE6IGlnbm9yZSBhIGZvbGQgaWYgZm9sZC5lbmQgPSByb3cvY29sdW1uXG4gICAgICovXG4gICAgZ2V0Rm9sZEF0KHJvdzogbnVtYmVyLCBjb2x1bW4sIHNpZGU/KSB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcbiAgICAgICAgaWYgKCFmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZCA9IGZvbGRzW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGQucmFuZ2UuY29udGFpbnMocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgaWYgKHNpZGUgPT0gMSAmJiBmb2xkLnJhbmdlLmlzRW5kKHJvdywgY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHNpZGUgPT0gLTEgJiYgZm9sZC5yYW5nZS5pc1N0YXJ0KHJvdywgY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybnMgYWxsIGZvbGRzIGluIHRoZSBnaXZlbiByYW5nZS4gTm90ZSwgdGhhdCB0aGlzIHdpbGwgcmV0dXJuIGZvbGRzXG4gICAgICpcbiAgICAgKi9cbiAgICBnZXRGb2xkc0luUmFuZ2UocmFuZ2U6IFJhbmdlKSB7XG4gICAgICAgIHZhciBzdGFydCA9IHJhbmdlLnN0YXJ0O1xuICAgICAgICB2YXIgZW5kID0gcmFuZ2UuZW5kO1xuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBmb3VuZEZvbGRzOiBGb2xkW10gPSBbXTtcblxuICAgICAgICBzdGFydC5jb2x1bW4gKz0gMTtcbiAgICAgICAgZW5kLmNvbHVtbiAtPSAxO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY21wID0gZm9sZExpbmVzW2ldLnJhbmdlLmNvbXBhcmVSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAoY21wID09IDIpIHtcbiAgICAgICAgICAgICAgICAvLyBSYW5nZSBpcyBiZWZvcmUgZm9sZExpbmUuIE5vIGludGVyc2VjdGlvbi4gVGhpcyBtZWFucyxcbiAgICAgICAgICAgICAgICAvLyB0aGVyZSBtaWdodCBiZSBvdGhlciBmb2xkTGluZXMgdGhhdCBpbnRlcnNlY3QuXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChjbXAgPT0gLTIpIHtcbiAgICAgICAgICAgICAgICAvLyBSYW5nZSBpcyBhZnRlciBmb2xkTGluZS4gVGhlcmUgY2FuJ3QgYmUgYW55IG90aGVyIGZvbGRMaW5lcyB0aGVuLFxuICAgICAgICAgICAgICAgIC8vIHNvIGxldCdzIGdpdmUgdXAuXG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lc1tpXS5mb2xkcztcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZm9sZHMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgZm9sZCA9IGZvbGRzW2pdO1xuICAgICAgICAgICAgICAgIGNtcCA9IGZvbGQucmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgICAgICBpZiAoY21wID09IC0yKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY21wID09IDIpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIC8vIFdURi1zdGF0ZTogQ2FuIGhhcHBlbiBkdWUgdG8gLTEvKzEgdG8gc3RhcnQvZW5kIGNvbHVtbi5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGNtcCA9PSA0Mikge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBmb3VuZEZvbGRzLnB1c2goZm9sZCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgc3RhcnQuY29sdW1uIC09IDE7XG4gICAgICAgIGVuZC5jb2x1bW4gKz0gMTtcblxuICAgICAgICByZXR1cm4gZm91bmRGb2xkcztcbiAgICB9XG5cbiAgICBnZXRGb2xkc0luUmFuZ2VMaXN0KHJhbmdlcykge1xuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyYW5nZXMpKSB7XG4gICAgICAgICAgICB2YXIgZm9sZHM6IEZvbGRbXSA9IFtdO1xuICAgICAgICAgICAgcmFuZ2VzLmZvckVhY2goZnVuY3Rpb24ocmFuZ2UpIHtcbiAgICAgICAgICAgICAgICBmb2xkcyA9IGZvbGRzLmNvbmNhdCh0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZSkpO1xuICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZXMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG4gICAgXG4gICAgLypcbiAgICAgKiBSZXR1cm5zIGFsbCBmb2xkcyBpbiB0aGUgZG9jdW1lbnRcbiAgICAgKi9cbiAgICBnZXRBbGxGb2xkcygpIHtcbiAgICAgICAgdmFyIGZvbGRzID0gW107XG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lcy5sZW5ndGg7IGkrKylcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZm9sZExpbmVzW2ldLmZvbGRzLmxlbmd0aDsgaisrKVxuICAgICAgICAgICAgICAgIGZvbGRzLnB1c2goZm9sZExpbmVzW2ldLmZvbGRzW2pdKTtcblxuICAgICAgICByZXR1cm4gZm9sZHM7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgYmV0d2VlbiBmb2xkcyBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24uXG4gICAgICogRS5nLlxuICAgICAqICBmb288Zm9sZD5ifGFyPGZvbGQ+d29scmQgLT4gXCJiYXJcIlxuICAgICAqICBmb288Zm9sZD5iYXI8Zm9sZD53b2x8cmQgLT4gXCJ3b3JsZFwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb3xsZD53b2xyZCAtPiA8bnVsbD5cbiAgICAgKlxuICAgICAqIHdoZXJlIHwgbWVhbnMgdGhlIHBvc2l0aW9uIG9mIHJvdy9jb2x1bW5cbiAgICAgKlxuICAgICAqIFRoZSB0cmltIG9wdGlvbiBkZXRlcm1zIGlmIHRoZSByZXR1cm4gc3RyaW5nIHNob3VsZCBiZSB0cmltZWQgYWNjb3JkaW5nXG4gICAgICogdG8gdGhlIFwic2lkZVwiIHBhc3NlZCB3aXRoIHRoZSB0cmltIHZhbHVlOlxuICAgICAqXG4gICAgICogRS5nLlxuICAgICAqICBmb288Zm9sZD5ifGFyPGZvbGQ+d29scmQgLXRyaW09LTE+IFwiYlwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtdHJpbT0rMT4gXCJybGRcIlxuICAgICAqICBmb3xvPGZvbGQ+YmFyPGZvbGQ+d29scmQgLXRyaW09MDA+IFwiZm9vXCJcbiAgICAgKi9cbiAgICBnZXRGb2xkU3RyaW5nQXQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCB0cmltOiBudW1iZXIsIGZvbGRMaW5lPzogRm9sZExpbmUpIHtcbiAgICAgICAgZm9sZExpbmUgPSBmb2xkTGluZSB8fCB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIGlmICghZm9sZExpbmUpXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcblxuICAgICAgICB2YXIgbGFzdEZvbGQgPSB7XG4gICAgICAgICAgICBlbmQ6IHsgY29sdW1uOiAwIH1cbiAgICAgICAgfTtcbiAgICAgICAgLy8gVE9ETzogUmVmYWN0b3IgdG8gdXNlIGdldE5leHRGb2xkVG8gZnVuY3Rpb24uXG4gICAgICAgIHZhciBzdHI6IHN0cmluZztcbiAgICAgICAgdmFyIGZvbGQ6IEZvbGQ7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZExpbmUuZm9sZHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGZvbGQgPSBmb2xkTGluZS5mb2xkc1tpXTtcbiAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkLnJhbmdlLmNvbXBhcmVFbmQocm93LCBjb2x1bW4pO1xuICAgICAgICAgICAgaWYgKGNtcCA9PSAtMSkge1xuICAgICAgICAgICAgICAgIHN0ciA9IHRoaXMuZ2V0TGluZShmb2xkLnN0YXJ0LnJvdykuc3Vic3RyaW5nKGxhc3RGb2xkLmVuZC5jb2x1bW4sIGZvbGQuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGFzdEZvbGQgPSBmb2xkO1xuICAgICAgICB9XG4gICAgICAgIGlmICghc3RyKVxuICAgICAgICAgICAgc3RyID0gdGhpcy5nZXRMaW5lKGZvbGQuc3RhcnQucm93KS5zdWJzdHJpbmcobGFzdEZvbGQuZW5kLmNvbHVtbik7XG5cbiAgICAgICAgaWYgKHRyaW0gPT0gLTEpXG4gICAgICAgICAgICByZXR1cm4gc3RyLnN1YnN0cmluZygwLCBjb2x1bW4gLSBsYXN0Rm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgZWxzZSBpZiAodHJpbSA9PSAxKVxuICAgICAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHJpbmcoY29sdW1uIC0gbGFzdEZvbGQuZW5kLmNvbHVtbik7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZExpbmUoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZExpbmU/OiBGb2xkTGluZSk6IEZvbGRMaW5lIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZExpbmUpXG4gICAgICAgICAgICBpID0gZm9sZERhdGEuaW5kZXhPZihzdGFydEZvbGRMaW5lKTtcbiAgICAgICAgaWYgKGkgPT0gLTEpXG4gICAgICAgICAgICBpID0gMDtcbiAgICAgICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnN0YXJ0LnJvdyA8PSBkb2NSb3cgJiYgZm9sZExpbmUuZW5kLnJvdyA+PSBkb2NSb3cpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPiBkb2NSb3cpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICAvLyByZXR1cm5zIHRoZSBmb2xkIHdoaWNoIHN0YXJ0cyBhZnRlciBvciBjb250YWlucyBkb2NSb3dcbiAgICBnZXROZXh0Rm9sZExpbmUoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZExpbmU/OiBGb2xkTGluZSk6IEZvbGRMaW5lIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgaWYgKHN0YXJ0Rm9sZExpbmUpXG4gICAgICAgICAgICBpID0gZm9sZERhdGEuaW5kZXhPZihzdGFydEZvbGRMaW5lKTtcbiAgICAgICAgaWYgKGkgPT0gLTEpXG4gICAgICAgICAgICBpID0gMDtcbiAgICAgICAgZm9yIChpOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLmVuZC5yb3cgPj0gZG9jUm93KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGdldEZvbGRlZFJvd0NvdW50KGZpcnN0OiBudW1iZXIsIGxhc3Q6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkRGF0YSA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgcm93Q291bnQgPSBsYXN0IC0gZmlyc3QgKyAxO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXSxcbiAgICAgICAgICAgICAgICBlbmQgPSBmb2xkTGluZS5lbmQucm93LFxuICAgICAgICAgICAgICAgIHN0YXJ0ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICAgICAgaWYgKGVuZCA+PSBsYXN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKHN0YXJ0IDwgbGFzdCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpXG4gICAgICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBsYXN0IC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvd0NvdW50ID0gMDsvL2luIG9uZSBmb2xkXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlbmQgPj0gZmlyc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPj0gZmlyc3QpIC8vZm9sZCBpbnNpZGUgcmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgLT0gZW5kIC0gc3RhcnQ7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBlbmQgLSBmaXJzdCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJvd0NvdW50O1xuICAgIH1cblxuICAgICRhZGRGb2xkTGluZShmb2xkTGluZTogRm9sZExpbmUpIHtcbiAgICAgICAgdGhpcy4kZm9sZERhdGEucHVzaChmb2xkTGluZSk7XG4gICAgICAgIHRoaXMuJGZvbGREYXRhLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgICAgcmV0dXJuIGEuc3RhcnQucm93IC0gYi5zdGFydC5yb3c7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIG5ldyBmb2xkLlxuICAgICAqXG4gICAgICogQHJldHVybnNcbiAgICAgKiAgICAgIFRoZSBuZXcgY3JlYXRlZCBGb2xkIG9iamVjdCBvciBhbiBleGlzdGluZyBmb2xkIG9iamVjdCBpbiBjYXNlIHRoZVxuICAgICAqICAgICAgcGFzc2VkIGluIHJhbmdlIGZpdHMgYW4gZXhpc3RpbmcgZm9sZCBleGFjdGx5LlxuICAgICAqL1xuICAgIGFkZEZvbGQocGxhY2Vob2xkZXI6IHN0cmluZyB8IEZvbGQsIHJhbmdlOiBSYW5nZSkge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGFkZGVkID0gZmFsc2U7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuXG4gICAgICAgIGlmIChwbGFjZWhvbGRlciBpbnN0YW5jZW9mIEZvbGQpXG4gICAgICAgICAgICBmb2xkID0gcGxhY2Vob2xkZXI7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZm9sZCA9IG5ldyBGb2xkKHJhbmdlLCBwbGFjZWhvbGRlcik7XG4gICAgICAgICAgICBmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPSByYW5nZS5jb2xsYXBzZUNoaWxkcmVuO1xuICAgICAgICB9XG4gICAgICAgIC8vIEZJWE1FOiAkY2xpcFJhbmdlVG9Eb2N1bWVudD9cbiAgICAgICAgLy8gZm9sZC5yYW5nZSA9IHRoaXMuY2xpcFJhbmdlKGZvbGQucmFuZ2UpO1xuICAgICAgICBmb2xkLnJhbmdlID0gdGhpcy4kY2xpcFJhbmdlVG9Eb2N1bWVudChmb2xkLnJhbmdlKVxuXG4gICAgICAgIHZhciBzdGFydFJvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICB2YXIgc3RhcnRDb2x1bW4gPSBmb2xkLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgdmFyIGVuZFJvdyA9IGZvbGQuZW5kLnJvdztcbiAgICAgICAgdmFyIGVuZENvbHVtbiA9IGZvbGQuZW5kLmNvbHVtbjtcblxuICAgICAgICAvLyAtLS0gU29tZSBjaGVja2luZyAtLS1cbiAgICAgICAgaWYgKCEoc3RhcnRSb3cgPCBlbmRSb3cgfHxcbiAgICAgICAgICAgIHN0YXJ0Um93ID09IGVuZFJvdyAmJiBzdGFydENvbHVtbiA8PSBlbmRDb2x1bW4gLSAyKSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSByYW5nZSBoYXMgdG8gYmUgYXQgbGVhc3QgMiBjaGFyYWN0ZXJzIHdpZHRoXCIpO1xuXG4gICAgICAgIHZhciBzdGFydEZvbGQgPSB0aGlzLmdldEZvbGRBdChzdGFydFJvdywgc3RhcnRDb2x1bW4sIDEpO1xuICAgICAgICB2YXIgZW5kRm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGVuZFJvdywgZW5kQ29sdW1uLCAtMSk7XG4gICAgICAgIGlmIChzdGFydEZvbGQgJiYgZW5kRm9sZCA9PSBzdGFydEZvbGQpXG4gICAgICAgICAgICByZXR1cm4gc3RhcnRGb2xkLmFkZFN1YkZvbGQoZm9sZCk7XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgICAgKHN0YXJ0Rm9sZCAmJiAhc3RhcnRGb2xkLnJhbmdlLmlzU3RhcnQoc3RhcnRSb3csIHN0YXJ0Q29sdW1uKSlcbiAgICAgICAgICAgIHx8IChlbmRGb2xkICYmICFlbmRGb2xkLnJhbmdlLmlzRW5kKGVuZFJvdywgZW5kQ29sdW1uKSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvbGQgY2FuJ3QgaW50ZXJzZWN0IGFscmVhZHkgZXhpc3RpbmcgZm9sZFwiICsgZm9sZC5yYW5nZSArIHN0YXJ0Rm9sZC5yYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiB0aGVyZSBhcmUgZm9sZHMgaW4gdGhlIHJhbmdlIHdlIGNyZWF0ZSB0aGUgbmV3IGZvbGQgZm9yLlxuICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShmb2xkLnJhbmdlKTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgZm9sZHMgZnJvbSBmb2xkIGRhdGEuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKGZvbGRzKTtcbiAgICAgICAgICAgIC8vIEFkZCB0aGUgcmVtb3ZlZCBmb2xkcyBhcyBzdWJmb2xkcyBvbiB0aGUgbmV3IGZvbGQuXG4gICAgICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgICAgICAgICAgICBmb2xkLmFkZFN1YkZvbGQoc3ViRm9sZCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldO1xuICAgICAgICAgICAgaWYgKGVuZFJvdyA9PSBmb2xkTGluZS5zdGFydC5yb3cpIHtcbiAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIGFkZGVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhcnRSb3cgPT0gZm9sZExpbmUuZW5kLnJvdykge1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZEZvbGQoZm9sZCk7XG4gICAgICAgICAgICAgICAgYWRkZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGlmICghZm9sZC5zYW1lUm93KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHdlIG1pZ2h0IGhhdmUgdG8gbWVyZ2UgdHdvIEZvbGRMaW5lcy5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lTmV4dCA9IGZvbGREYXRhW2kgKyAxXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lTmV4dCAmJiBmb2xkTGluZU5leHQuc3RhcnQucm93ID09IGVuZFJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBtZXJnZSFcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLm1lcmdlKGZvbGRMaW5lTmV4dCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZW5kUm93IDw9IGZvbGRMaW5lLnN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFhZGRlZClcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy4kYWRkRm9sZExpbmUobmV3IEZvbGRMaW5lKHRoaXMuJGZvbGREYXRhLCBmb2xkKSk7XG5cbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKVxuICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoZm9sZExpbmUuc3RhcnQucm93LCBmb2xkTGluZS5zdGFydC5yb3cpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShmb2xkTGluZS5zdGFydC5yb3csIGZvbGRMaW5lLnN0YXJ0LnJvdyk7XG5cbiAgICAgICAgLy8gTm90aWZ5IHRoYXQgZm9sZCBkYXRhIGhhcyBjaGFuZ2VkLlxuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlRm9sZFwiLCB7IGRhdGE6IGZvbGQsIGFjdGlvbjogXCJhZGRcIiB9KTtcblxuICAgICAgICByZXR1cm4gZm9sZDtcbiAgICB9XG5cbiAgICBzZXRNb2RpZmllZChtb2RpZmllZDogYm9vbGVhbikge1xuXG4gICAgfVxuXG4gICAgYWRkRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgICAgICBmb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgfVxuXG4gICAgcmVtb3ZlRm9sZChmb2xkOiBGb2xkKSB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGQuZm9sZExpbmU7XG4gICAgICAgIHZhciBzdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGVuZFJvdyA9IGZvbGRMaW5lLmVuZC5yb3c7XG5cbiAgICAgICAgdmFyIGZvbGRMaW5lcyA9IHRoaXMuJGZvbGREYXRhO1xuICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZS5mb2xkcztcbiAgICAgICAgLy8gU2ltcGxlIGNhc2Ugd2hlcmUgdGhlcmUgaXMgb25seSBvbmUgZm9sZCBpbiB0aGUgRm9sZExpbmUgc3VjaCB0aGF0XG4gICAgICAgIC8vIHRoZSBlbnRpcmUgZm9sZCBsaW5lIGNhbiBnZXQgcmVtb3ZlZCBkaXJlY3RseS5cbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgICAgICBmb2xkTGluZXMuc3BsaWNlKGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSwgMSk7XG4gICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgdGhlIGxhc3QgZm9sZCBvZiB0aGUgZm9sZExpbmUsIGp1c3QgcmVtb3ZlIGl0LlxuICAgICAgICAgICAgaWYgKGZvbGRMaW5lLnJhbmdlLmlzRW5kKGZvbGQuZW5kLnJvdywgZm9sZC5lbmQuY29sdW1uKSkge1xuICAgICAgICAgICAgICAgIGZvbGRzLnBvcCgpO1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5yb3cgPSBmb2xkc1tmb2xkcy5sZW5ndGggLSAxXS5lbmQucm93O1xuICAgICAgICAgICAgICAgIGZvbGRMaW5lLmVuZC5jb2x1bW4gPSBmb2xkc1tmb2xkcy5sZW5ndGggLSAxXS5lbmQuY29sdW1uO1xuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgdGhlIGZpcnN0IGZvbGQgb2YgdGhlIGZvbGRMaW5lLCBqdXN0IHJlbW92ZSBpdC5cbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUucmFuZ2UuaXNTdGFydChmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnN0YXJ0LnJvdyA9IGZvbGRzWzBdLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc3RhcnQuY29sdW1uID0gZm9sZHNbMF0uc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBXZSBrbm93IHRoZXJlIGFyZSBtb3JlIHRoZW4gMiBmb2xkcyBhbmQgdGhlIGZvbGQgaXMgbm90IGF0IHRoZSBlZGdlLlxuICAgICAgICAgICAgICAgICAgICAvLyBUaGlzIG1lYW5zLCB0aGUgZm9sZCBpcyBzb21ld2hlcmUgaW4gYmV0d2Vlbi5cbiAgICAgICAgICAgICAgICAgICAgLy9cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgaW4gb25lIHJvdywgd2UganVzdCBjYW4gcmVtb3ZlIGl0LlxuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZC5zYW1lUm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcy5zcGxpY2UoZm9sZHMuaW5kZXhPZihmb2xkKSwgMSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgZm9sZCBnb2VzIG92ZXIgbW9yZSB0aGVuIG9uZSByb3cuIFRoaXMgbWVhbnMgcmVtdm9pbmcgdGhpcyBmb2xkXG4gICAgICAgICAgICAgICAgICAgIC8vIHdpbGwgY2F1c2UgdGhlIGZvbGQgbGluZSB0byBnZXQgc3BsaXR0ZWQgdXAuIG5ld0ZvbGRMaW5lIGlzIHRoZSBzZWNvbmQgcGFydFxuICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbmV3Rm9sZExpbmUgPSBmb2xkTGluZS5zcGxpdChmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMgPSBuZXdGb2xkTGluZS5mb2xkcztcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdGb2xkTGluZS5zdGFydC5yb3cgPSBmb2xkc1swXS5zdGFydC5yb3c7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdGb2xkTGluZS5zdGFydC5jb2x1bW4gPSBmb2xkc1swXS5zdGFydC5jb2x1bW47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuJHVwZGF0aW5nKSB7XG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoc3RhcnRSb3csIGVuZFJvdyk7XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUoc3RhcnRSb3csIGVuZFJvdyk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIC8vIE5vdGlmeSB0aGF0IGZvbGQgZGF0YSBoYXMgY2hhbmdlZC5cbiAgICAgICAgdGhpcy5zZXRNb2RpZmllZCh0cnVlKTtcbiAgICAgICAgdGhpcy5fZW1pdChcImNoYW5nZUZvbGRcIiwgeyBkYXRhOiBmb2xkLCBhY3Rpb246IFwicmVtb3ZlXCIgfSk7XG4gICAgfVxuXG4gICAgcmVtb3ZlRm9sZHMoZm9sZHM6IEZvbGRbXSkge1xuICAgICAgICAvLyBXZSBuZWVkIHRvIGNsb25lIHRoZSBmb2xkcyBhcnJheSBwYXNzZWQgaW4gYXMgaXQgbWlnaHQgYmUgdGhlIGZvbGRzXG4gICAgICAgIC8vIGFycmF5IG9mIGEgZm9sZCBsaW5lIGFuZCBhcyB3ZSBjYWxsIHRoaXMucmVtb3ZlRm9sZChmb2xkKSwgZm9sZHNcbiAgICAgICAgLy8gYXJlIHJlbW92ZWQgZnJvbSBmb2xkcyBhbmQgY2hhbmdlcyB0aGUgY3VycmVudCBpbmRleC5cbiAgICAgICAgdmFyIGNsb25lRm9sZHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgY2xvbmVGb2xkcy5wdXNoKGZvbGRzW2ldKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNsb25lRm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgIH1cblxuICAgIGV4cGFuZEZvbGQoZm9sZDogRm9sZCkge1xuICAgICAgICB0aGlzLnJlbW92ZUZvbGQoZm9sZCk7XG4gICAgICAgIGZvbGQuc3ViRm9sZHMuZm9yRWFjaChmdW5jdGlvbihzdWJGb2xkKSB7XG4gICAgICAgICAgICBmb2xkLnJlc3RvcmVSYW5nZShzdWJGb2xkKTtcbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChzdWJGb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIGlmIChmb2xkLmNvbGxhcHNlQ2hpbGRyZW4gPiAwKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwoZm9sZC5zdGFydC5yb3cgKyAxLCBmb2xkLmVuZC5yb3csIGZvbGQuY29sbGFwc2VDaGlsZHJlbiAtIDEpO1xuICAgICAgICB9XG4gICAgICAgIGZvbGQuc3ViRm9sZHMgPSBbXTtcbiAgICB9XG5cbiAgICBleHBhbmRGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICB9XG5cbiAgICB1bmZvbGQobG9jYXRpb24/LCBleHBhbmRJbm5lcj8pIHtcbiAgICAgICAgdmFyIHJhbmdlLCBmb2xkcztcbiAgICAgICAgaWYgKGxvY2F0aW9uID09IG51bGwpIHtcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIHRoaXMuZ2V0TGVuZ3RoKCksIDApO1xuICAgICAgICAgICAgZXhwYW5kSW5uZXIgPSB0cnVlO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBsb2NhdGlvbiA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgcmFuZ2UgPSBuZXcgUmFuZ2UobG9jYXRpb24sIDAsIGxvY2F0aW9uLCB0aGlzLmdldExpbmUobG9jYXRpb24pLmxlbmd0aCk7XG4gICAgICAgIGVsc2UgaWYgKFwicm93XCIgaW4gbG9jYXRpb24pXG4gICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMobG9jYXRpb24sIGxvY2F0aW9uKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmFuZ2UgPSBsb2NhdGlvbjtcblxuICAgICAgICBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgIGlmIChleHBhbmRJbm5lcikge1xuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhmb2xkcyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgc3ViRm9sZHMgPSBmb2xkcztcbiAgICAgICAgICAgIC8vIFRPRE86IG1pZ2h0IGJlIGJldHRlciB0byByZW1vdmUgYW5kIGFkZCBmb2xkcyBpbiBvbmUgZ28gaW5zdGVhZCBvZiB1c2luZ1xuICAgICAgICAgICAgLy8gZXhwYW5kRm9sZHMgc2V2ZXJhbCB0aW1lcy5cbiAgICAgICAgICAgIHdoaWxlIChzdWJGb2xkcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGRzKHN1YkZvbGRzKTtcbiAgICAgICAgICAgICAgICBzdWJGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlTGlzdChyYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybiBmb2xkcztcbiAgICB9XG5cbiAgICAvKlxuICAgICAqIENoZWNrcyBpZiBhIGdpdmVuIGRvY3VtZW50Um93IGlzIGZvbGRlZC4gVGhpcyBpcyB0cnVlIGlmIHRoZXJlIGFyZSBzb21lXG4gICAgICogZm9sZGVkIHBhcnRzIHN1Y2ggdGhhdCBzb21lIHBhcnRzIG9mIHRoZSBsaW5lIGlzIHN0aWxsIHZpc2libGUuXG4gICAgICoqL1xuICAgIGlzUm93Rm9sZGVkKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c6IEZvbGRMaW5lKTogYm9vbGVhbiB7XG4gICAgICAgIHJldHVybiAhIXRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgIH1cblxuICAgIGdldFJvd0ZvbGRFbmQoZG9jUm93OiBudW1iZXIsIHN0YXJ0Rm9sZFJvdz86IEZvbGRMaW5lKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShkb2NSb3csIHN0YXJ0Rm9sZFJvdyk7XG4gICAgICAgIHJldHVybiBmb2xkTGluZSA/IGZvbGRMaW5lLmVuZC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Um93Rm9sZFN0YXJ0KGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c/OiBGb2xkTGluZSk6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgICAgICByZXR1cm4gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBkb2NSb3c7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZERpc3BsYXlMaW5lKGZvbGRMaW5lOiBGb2xkTGluZSwgZW5kUm93PzogbnVtYmVyLCBlbmRDb2x1bW4/OiBudW1iZXIsIHN0YXJ0Um93PzogbnVtYmVyLCBzdGFydENvbHVtbj86IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIGlmIChzdGFydFJvdyA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRSb3cgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgIGlmIChzdGFydENvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgc3RhcnRDb2x1bW4gPSAwO1xuICAgICAgICBpZiAoZW5kUm93ID09IG51bGwpXG4gICAgICAgICAgICBlbmRSb3cgPSBmb2xkTGluZS5lbmQucm93O1xuICAgICAgICBpZiAoZW5kQ29sdW1uID09IG51bGwpXG4gICAgICAgICAgICBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmUoZW5kUm93KS5sZW5ndGg7XG4gICAgICAgIFxuXG4gICAgICAgIC8vIEJ1aWxkIHRoZSB0ZXh0bGluZSB1c2luZyB0aGUgRm9sZExpbmUgd2Fsa2VyLlxuICAgICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICAgIHZhciB0ZXh0TGluZSA9IFwiXCI7XG5cbiAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlcjogc3RyaW5nLCByb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGxhc3RDb2x1bW46IG51bWJlcikge1xuICAgICAgICAgICAgaWYgKHJvdyA8IHN0YXJ0Um93KVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIGlmIChyb3cgPT0gc3RhcnRSb3cpIHtcbiAgICAgICAgICAgICAgICBpZiAoY29sdW1uIDwgc3RhcnRDb2x1bW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICBsYXN0Q29sdW1uID0gTWF0aC5tYXgoc3RhcnRDb2x1bW4sIGxhc3RDb2x1bW4pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIHRleHRMaW5lICs9IHBsYWNlaG9sZGVyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0ZXh0TGluZSArPSBzZWxmLmdldExpbmUocm93KS5zdWJzdHJpbmcobGFzdENvbHVtbiwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgZW5kUm93LCBlbmRDb2x1bW4pO1xuICAgICAgICByZXR1cm4gdGV4dExpbmU7XG4gICAgfVxuXG4gICAgZ2V0RGlzcGxheUxpbmUocm93OiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyLCBzdGFydFJvdzogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShyb3cpO1xuXG4gICAgICAgIGlmICghZm9sZExpbmUpIHtcbiAgICAgICAgICAgIHZhciBsaW5lOiBzdHJpbmc7XG4gICAgICAgICAgICBsaW5lID0gdGhpcy5nZXRMaW5lKHJvdyk7XG4gICAgICAgICAgICByZXR1cm4gbGluZS5zdWJzdHJpbmcoc3RhcnRDb2x1bW4gfHwgMCwgZW5kQ29sdW1uIHx8IGxpbmUubGVuZ3RoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmdldEZvbGREaXNwbGF5TGluZShcbiAgICAgICAgICAgICAgICBmb2xkTGluZSwgcm93LCBlbmRDb2x1bW4sIHN0YXJ0Um93LCBzdGFydENvbHVtbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkY2xvbmVGb2xkRGF0YSgpIHtcbiAgICAgICAgdmFyIGZkID0gW107XG4gICAgICAgIGZkID0gdGhpcy4kZm9sZERhdGEubWFwKGZ1bmN0aW9uKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZS5mb2xkcy5tYXAoZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkLmNsb25lKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRm9sZExpbmUoZmQsIGZvbGRzKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGZkO1xuICAgIH1cblxuICAgIHRvZ2dsZUZvbGQodHJ5VG9VbmZvbGQpIHtcbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0aW9uO1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlID0gc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgIHZhciBmb2xkO1xuICAgICAgICB2YXIgYnJhY2tldFBvcztcblxuICAgICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYnJhY2tldFBvcyA9IHRoaXMuZmluZE1hdGNoaW5nQnJhY2tldChjdXJzb3IpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLmVuZCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQgPSBicmFja2V0UG9zO1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4rKztcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbi0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYnJhY2tldFBvcyA9IHRoaXMuZmluZE1hdGNoaW5nQnJhY2tldCh7IHJvdzogY3Vyc29yLnJvdywgY29sdW1uOiBjdXJzb3IuY29sdW1uICsgMSB9KSkge1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlUG9pbnQoYnJhY2tldFBvcykgPT09IDEpXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLmVuZCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG5cbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4rKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLmdldENvbW1lbnRGb2xkUmFuZ2UoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbikgfHwgcmFuZ2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAodHJ5VG9VbmZvbGQgJiYgZm9sZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkcyhmb2xkcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZm9sZClcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG5cbiAgICAgICAgaWYgKGZvbGQgJiYgZm9sZC5yYW5nZS50b1N0cmluZygpID09IHJhbmdlLnRvU3RyaW5nKCkpIHtcbiAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwbGFjZWhvbGRlciA9IFwiLi4uXCI7XG4gICAgICAgIGlmICghcmFuZ2UuaXNNdWx0aUxpbmUoKSkge1xuICAgICAgICAgICAgcGxhY2Vob2xkZXIgPSB0aGlzLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIubGVuZ3RoIDwgNClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyLnRyaW0oKS5zdWJzdHJpbmcoMCwgMikgKyBcIi4uXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmFkZEZvbGQocGxhY2Vob2xkZXIsIHJhbmdlKTtcbiAgICB9XG5cbiAgICBnZXRDb21tZW50Rm9sZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgZGlyPzogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG4gICAgICAgIHZhciB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICBpZiAodG9rZW4gJiYgL15jb21tZW50fHN0cmluZy8udGVzdCh0b2tlbi50eXBlKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cCh0b2tlbi50eXBlLnJlcGxhY2UoL1xcLi4qLywgXCJcXFxcLlwiKSk7XG4gICAgICAgICAgICBpZiAoZGlyICE9IDEpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgICAgICAgICAgaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCk7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIDI7XG5cbiAgICAgICAgICAgIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcywgcm93LCBjb2x1bW4pO1xuXG4gICAgICAgICAgICBpZiAoZGlyICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG5cbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIHRva2VuLnZhbHVlLmxlbmd0aCAtIDI7XG4gICAgICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb2xkQWxsKHN0YXJ0Um93OiBudW1iZXIsIGVuZFJvdzogbnVtYmVyLCBkZXB0aDogbnVtYmVyKSB7XG4gICAgICAgIGlmIChkZXB0aCA9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBkZXB0aCA9IDEwMDAwMDsgLy8gSlNPTi5zdHJpbmdpZnkgZG9lc24ndCBoYW5sZSBJbmZpbml0eVxuICAgICAgICB2YXIgZm9sZFdpZGdldHMgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgICAgICBpZiAoIWZvbGRXaWRnZXRzKVxuICAgICAgICAgICAgcmV0dXJuOyAvLyBtb2RlIGRvZXNuJ3Qgc3VwcG9ydCBmb2xkaW5nXG4gICAgICAgIGVuZFJvdyA9IGVuZFJvdyB8fCB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgICBzdGFydFJvdyA9IHN0YXJ0Um93IHx8IDA7XG4gICAgICAgIGZvciAodmFyIHJvdyA9IHN0YXJ0Um93OyByb3cgPCBlbmRSb3c7IHJvdysrKSB7XG4gICAgICAgICAgICBpZiAoZm9sZFdpZGdldHNbcm93XSA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGZvbGRXaWRnZXRzW3Jvd10gPSB0aGlzLmdldEZvbGRXaWRnZXQocm93KTtcbiAgICAgICAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddICE9IFwic3RhcnRcIilcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2Uocm93KTtcbiAgICAgICAgICAgIC8vIHNvbWV0aW1lcyByYW5nZSBjYW4gYmUgaW5jb21wYXRpYmxlIHdpdGggZXhpc3RpbmcgZm9sZFxuICAgICAgICAgICAgLy8gVE9ETyBjaGFuZ2UgYWRkRm9sZCB0byByZXR1cm4gbnVsbCBpc3RlYWQgb2YgdGhyb3dpbmdcbiAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5pc011bHRpTGluZSgpXG4gICAgICAgICAgICAgICAgJiYgcmFuZ2UuZW5kLnJvdyA8PSBlbmRSb3dcbiAgICAgICAgICAgICAgICAmJiByYW5nZS5zdGFydC5yb3cgPj0gc3RhcnRSb3dcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJvdyA9IHJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYWRkRm9sZCBjYW4gY2hhbmdlIHRoZSByYW5nZVxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkKVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZC5jb2xsYXBzZUNoaWxkcmVuID0gZGVwdGg7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXRGb2xkU3R5bGUoc3R5bGU6IHN0cmluZykge1xuICAgICAgICBpZiAoIXRoaXMuJGZvbGRTdHlsZXNbc3R5bGVdKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmb2xkIHN0eWxlOiBcIiArIHN0eWxlICsgXCJbXCIgKyBPYmplY3Qua2V5cyh0aGlzLiRmb2xkU3R5bGVzKS5qb2luKFwiLCBcIikgKyBcIl1cIik7XG5cbiAgICAgICAgaWYgKHRoaXMuJGZvbGRTdHlsZSA9PT0gc3R5bGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kZm9sZFN0eWxlID0gc3R5bGU7XG5cbiAgICAgICAgaWYgKHN0eWxlID09PSBcIm1hbnVhbFwiKVxuICAgICAgICAgICAgdGhpcy51bmZvbGQoKTtcbiAgICAgICAgXG4gICAgICAgIC8vIHJlc2V0IGZvbGRpbmdcbiAgICAgICAgdmFyIG1vZGUgPSB0aGlzLiRmb2xkTW9kZTtcbiAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhudWxsKTtcbiAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlKTtcbiAgICB9XG5cbiAgICAkc2V0Rm9sZGluZyhmb2xkTW9kZSkge1xuICAgICAgICBpZiAodGhpcy4kZm9sZE1vZGUgPT0gZm9sZE1vZGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kZm9sZE1vZGUgPSBmb2xkTW9kZTtcblxuICAgICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKCdjaGFuZ2UnLCB0aGlzLiR1cGRhdGVGb2xkV2lkZ2V0cyk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VBbm5vdGF0aW9uXCIpO1xuXG4gICAgICAgIGlmICghZm9sZE1vZGUgfHwgdGhpcy4kZm9sZFN0eWxlID09IFwibWFudWFsXCIpIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMgPSBudWxsO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cyA9IFtdO1xuICAgICAgICB0aGlzLmdldEZvbGRXaWRnZXQgPSBmb2xkTW9kZS5nZXRGb2xkV2lkZ2V0LmJpbmQoZm9sZE1vZGUsIHRoaXMsIHRoaXMuJGZvbGRTdHlsZSk7XG4gICAgICAgIHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlID0gZm9sZE1vZGUuZ2V0Rm9sZFdpZGdldFJhbmdlLmJpbmQoZm9sZE1vZGUsIHRoaXMsIHRoaXMuJGZvbGRTdHlsZSk7XG5cbiAgICAgICAgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMgPSB0aGlzLnVwZGF0ZUZvbGRXaWRnZXRzLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub24oJ2NoYW5nZScsIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzKTtcblxuICAgIH1cblxuICAgIGdldFBhcmVudEZvbGRSYW5nZURhdGEocm93OiBudW1iZXIsIGlnbm9yZUN1cnJlbnQ/OiBib29sZWFuKTogeyByYW5nZT86IFJhbmdlOyBmaXJzdFJhbmdlPzogUmFuZ2UgfSB7XG4gICAgICAgIHZhciBmdyA9IHRoaXMuZm9sZFdpZGdldHM7XG4gICAgICAgIGlmICghZncgfHwgKGlnbm9yZUN1cnJlbnQgJiYgZndbcm93XSkpIHtcbiAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpID0gcm93IC0gMTtcbiAgICAgICAgdmFyIGZpcnN0UmFuZ2U6IFJhbmdlO1xuICAgICAgICB3aGlsZSAoaSA+PSAwKSB7XG4gICAgICAgICAgICB2YXIgYyA9IGZ3W2ldO1xuICAgICAgICAgICAgaWYgKGMgPT0gbnVsbClcbiAgICAgICAgICAgICAgICBjID0gZndbaV0gPSB0aGlzLmdldEZvbGRXaWRnZXQoaSk7XG5cbiAgICAgICAgICAgIGlmIChjID09IFwic3RhcnRcIikge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKGkpO1xuICAgICAgICAgICAgICAgIGlmICghZmlyc3RSYW5nZSlcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RSYW5nZSA9IHJhbmdlO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5lbmQucm93ID49IHJvdylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpLS07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmFuZ2U6IGkgIT09IC0xICYmIHJhbmdlLFxuICAgICAgICAgICAgZmlyc3RSYW5nZTogZmlyc3RSYW5nZVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG9uRm9sZFdpZGdldENsaWNrKHJvdywgZSkge1xuICAgICAgICBlID0gZS5kb21FdmVudDtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSB7XG4gICAgICAgICAgICBjaGlsZHJlbjogZS5zaGlmdEtleSxcbiAgICAgICAgICAgIGFsbDogZS5jdHJsS2V5IHx8IGUubWV0YUtleSxcbiAgICAgICAgICAgIHNpYmxpbmdzOiBlLmFsdEtleVxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuJHRvZ2dsZUZvbGRXaWRnZXQocm93LCBvcHRpb25zKTtcbiAgICAgICAgaWYgKCFyYW5nZSkge1xuICAgICAgICAgICAgdmFyIGVsID0gKGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudClcbiAgICAgICAgICAgIGlmIChlbCAmJiAvYWNlX2ZvbGQtd2lkZ2V0Ly50ZXN0KGVsLmNsYXNzTmFtZSkpXG4gICAgICAgICAgICAgICAgZWwuY2xhc3NOYW1lICs9IFwiIGFjZV9pbnZhbGlkXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAkdG9nZ2xlRm9sZFdpZGdldChyb3csIG9wdGlvbnMpOiBSYW5nZSB7XG4gICAgICAgIGlmICghdGhpcy5nZXRGb2xkV2lkZ2V0KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgdHlwZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChyb3cpO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZ2V0TGluZShyb3cpO1xuXG4gICAgICAgIHZhciBkaXIgPSB0eXBlID09PSBcImVuZFwiID8gLTEgOiAxO1xuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgZGlyID09PSAtMSA/IDAgOiBsaW5lLmxlbmd0aCwgZGlyKTtcblxuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hpbGRyZW4gfHwgb3B0aW9ucy5hbGwpXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKHJvdywgdHJ1ZSk7XG4gICAgICAgIC8vIHNvbWV0aW1lcyBzaW5nbGVsaW5lIGZvbGRzIGNhbiBiZSBtaXNzZWQgYnkgdGhlIGNvZGUgYWJvdmVcbiAgICAgICAgaWYgKHJhbmdlICYmICFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4sIDEpO1xuICAgICAgICAgICAgaWYgKGZvbGQgJiYgcmFuZ2UuaXNFcXVhbChmb2xkLnJhbmdlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob3B0aW9ucy5zaWJsaW5ncykge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmdldFBhcmVudEZvbGRSYW5nZURhdGEocm93KTtcbiAgICAgICAgICAgIGlmIChkYXRhLnJhbmdlKSB7XG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0Um93ID0gZGF0YS5yYW5nZS5zdGFydC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIHZhciBlbmRSb3cgPSBkYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwoc3RhcnRSb3csIGVuZFJvdywgb3B0aW9ucy5hbGwgPyAxMDAwMCA6IDApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9wdGlvbnMuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGVuZFJvdyA9IHJhbmdlID8gcmFuZ2UuZW5kLnJvdyA6IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwocm93ICsgMSwgcmFuZ2UuZW5kLnJvdywgb3B0aW9ucy5hbGwgPyAxMDAwMCA6IDApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5hbGwpIHtcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIGEgYml0IHVnbHksIGJ1dCBpdCBjb3JyZXNwb25kcyB0byBzb21lIGNvZGUgZWxzZXdoZXJlLlxuICAgICAgICAgICAgICAgIHJhbmdlLmNvbGxhcHNlQ2hpbGRyZW4gPSAxMDAwMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG5cblxuICAgIHRvZ2dsZUZvbGRXaWRnZXQodG9nZ2xlUGFyZW50KSB7XG4gICAgICAgIHZhciByb3c6IG51bWJlciA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLnJvdztcbiAgICAgICAgcm93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQocm93KTtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy4kdG9nZ2xlRm9sZFdpZGdldChyb3csIHt9KTtcblxuICAgICAgICBpZiAocmFuZ2UpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIC8vIGhhbmRsZSB0b2dnbGVQYXJlbnRcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmdldFBhcmVudEZvbGRSYW5nZURhdGEocm93LCB0cnVlKTtcbiAgICAgICAgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGRhdGEuZmlyc3RSYW5nZTtcblxuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIHJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIHZhciBmb2xkID0gdGhpcy5nZXRGb2xkQXQocm93LCB0aGlzLmdldExpbmUocm93KS5sZW5ndGgsIDEpO1xuXG4gICAgICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHVwZGF0ZUZvbGRXaWRnZXRzKGU6IHsgZGF0YTogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH0gfSk6IHZvaWQge1xuICAgICAgICB2YXIgZGVsdGEgPSBlLmRhdGE7XG4gICAgICAgIHZhciByYW5nZSA9IGRlbHRhLnJhbmdlO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSByYW5nZS5zdGFydC5yb3c7XG4gICAgICAgIHZhciBsZW4gPSByYW5nZS5lbmQucm93IC0gZmlyc3RSb3c7XG5cbiAgICAgICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0c1tmaXJzdFJvd10gPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGRlbHRhLmFjdGlvbiA9PSBcInJlbW92ZVRleHRcIiB8fCBkZWx0YS5hY3Rpb24gPT0gXCJyZW1vdmVMaW5lc1wiKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzLnNwbGljZShmaXJzdFJvdywgbGVuICsgMSwgbnVsbCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgYXJncyA9IEFycmF5KGxlbiArIDEpO1xuICAgICAgICAgICAgYXJncy51bnNoaWZ0KGZpcnN0Um93LCAxKTtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMuc3BsaWNlLmFwcGx5KHRoaXMuZm9sZFdpZGdldHMsIGFyZ3MpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyBGSVhNRTogUmVzdG9yZVxuLy8gRm9sZGluZy5jYWxsKEVkaXRTZXNzaW9uLnByb3RvdHlwZSk7XG5cbmRlZmluZU9wdGlvbnMoRWRpdFNlc3Npb24ucHJvdG90eXBlLCBcInNlc3Npb25cIiwge1xuICAgIHdyYXA6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSB8fCB2YWx1ZSA9PSBcIm9mZlwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gZmFsc2U7XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcImZyZWVcIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHRydWU7XG4gICAgICAgICAgICBlbHNlIGlmICh2YWx1ZSA9PSBcInByaW50TWFyZ2luXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSAtMTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PSBcInN0cmluZ1wiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKSB8fCBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuJHdyYXAgPT0gdmFsdWUpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgaWYgKCF2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0VXNlV3JhcE1vZGUoZmFsc2UpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY29sID0gdHlwZW9mIHZhbHVlID09IFwibnVtYmVyXCIgPyB2YWx1ZSA6IG51bGw7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShjb2wsIGNvbCk7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRVc2VXcmFwTW9kZSh0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuJHdyYXAgPSB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmdldFVzZVdyYXBNb2RlKCkpIHtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy4kd3JhcCA9PSAtMSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwicHJpbnRNYXJnaW5cIjtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuZ2V0V3JhcExpbWl0UmFuZ2UoKS5taW4pXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBcImZyZWVcIjtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBcIm9mZlwiO1xuICAgICAgICB9LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICB3cmFwTWV0aG9kOiB7XG4gICAgICAgIC8vIGNvZGV8dGV4dHxhdXRvXG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICB2YWwgPSB2YWwgPT0gXCJhdXRvXCJcbiAgICAgICAgICAgICAgICA/IHRoaXMuJG1vZGUudHlwZSAhPSBcInRleHRcIlxuICAgICAgICAgICAgICAgIDogdmFsICE9IFwidGV4dFwiO1xuICAgICAgICAgICAgaWYgKHZhbCAhPSB0aGlzLiR3cmFwQXNDb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kd3JhcEFzQ29kZSA9IHZhbDtcbiAgICAgICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YSgwLCB0aGlzLmdldExlbmd0aCgpIC0gMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IFwiYXV0b1wiXG4gICAgfSxcbiAgICBmaXJzdExpbmVOdW1iZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbigpIHsgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiAxXG4gICAgfSxcbiAgICB1c2VXb3JrZXI6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih1c2VXb3JrZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJHVzZVdvcmtlciA9IHVzZVdvcmtlcjtcblxuICAgICAgICAgICAgdGhpcy4kc3RvcFdvcmtlcigpO1xuICAgICAgICAgICAgaWYgKHVzZVdvcmtlcilcbiAgICAgICAgICAgICAgICB0aGlzLiRzdGFydFdvcmtlcigpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IHRydWVcbiAgICB9LFxuICAgIHVzZVNvZnRUYWJzOiB7IGluaXRpYWxWYWx1ZTogdHJ1ZSB9LFxuICAgIHRhYlNpemU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih0YWJTaXplKSB7XG4gICAgICAgICAgICBpZiAoaXNOYU4odGFiU2l6ZSkgfHwgdGhpcy4kdGFiU2l6ZSA9PT0gdGFiU2l6ZSkgcmV0dXJuO1xuXG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLiRyb3dMZW5ndGhDYWNoZSA9IFtdO1xuICAgICAgICAgICAgdGhpcy4kdGFiU2l6ZSA9IHRhYlNpemU7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VUYWJTaXplXCIpO1xuICAgICAgICB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDQsXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIG92ZXJ3cml0ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLl9zaWduYWwoXCJjaGFuZ2VPdmVyd3JpdGVcIik7IH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogZmFsc2VcbiAgICB9LFxuICAgIG5ld0xpbmVNb2RlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuZG9jLnNldE5ld0xpbmVNb2RlKHZhbCkgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZG9jLmdldE5ld0xpbmVNb2RlKCkgfSxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgbW9kZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbCkgeyB0aGlzLnNldE1vZGUodmFsKSB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy4kbW9kZUlkIH1cbiAgICB9XG59KTtcbiJdfQ==