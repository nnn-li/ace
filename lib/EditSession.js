import { delayedCall, stringRepeat } from "./lib/lang";
import { _signal, defineOptions, loadModule, resetOptions } from "./config";
import EventEmitterClass from "./lib/event_emitter";
import FoldLine from "./FoldLine";
import Fold from "./Fold";
import Selection from "./Selection";
import Mode from "./mode/Mode";
import Range from "./Range";
import EditorDocument from "./EditorDocument";
import BackgroundTokenizer from "./BackgroundTokenizer";
import SearchHighlight from "./SearchHighlight";
import { assert } from './lib/asserts';
import BracketMatch from "./edit_session/BracketMatch";
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
export default class EditSession extends EventEmitterClass {
    constructor(doc, mode, cb) {
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
        this.$onChange = this.onChange.bind(this);
        this.lineWidgets = null;
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
        this.$foldData = [];
        this.$foldData.toString = function () {
            return this.join("\n");
        };
        this.on("changeFold", this.onChangeFold.bind(this));
        this.setDocument(doc);
        this.selection = new Selection(this);
        resetOptions(this);
        this.setMode(mode, cb);
        _signal("session", this);
    }
    setDocument(doc) {
        if (!(doc instanceof EditorDocument)) {
            throw new Error("doc must be a EditorDocument");
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
    onChangeFold(e) {
        var fold = e.data;
        this.$resetRowCache(fold.start.row);
    }
    onChange(e, doc) {
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
    setSelection(selection) {
        this.selection = selection;
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
            renderer: typeof type === "function" ? type : null,
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
    highlightLines(startRow, endRow, clazz = "ace_step", inFront) {
        var range = new Range(startRow, 0, endRow, Infinity);
        range.markerId = this.addMarker(range, clazz, "fullLine", inFront);
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
            this.bgTokenizer.on("update", function (event, bg) {
                _self._signal("tokenizerUpdate", event);
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
        this.off('change', this.$updateFoldWidgets);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRWRpdFNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRWRpdFNlc3Npb24udHMiXSwibmFtZXMiOlsiaXNGdWxsV2lkdGgiLCJFZGl0U2Vzc2lvbiIsIkVkaXRTZXNzaW9uLmNvbnN0cnVjdG9yIiwiRWRpdFNlc3Npb24uc2V0RG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5nZXREb2N1bWVudCIsIkVkaXRTZXNzaW9uLiRyZXNldFJvd0NhY2hlIiwiRWRpdFNlc3Npb24uJGdldFJvd0NhY2hlSW5kZXgiLCJFZGl0U2Vzc2lvbi5yZXNldENhY2hlcyIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlRm9sZCIsIkVkaXRTZXNzaW9uLm9uQ2hhbmdlIiwiRWRpdFNlc3Npb24uc2V0VmFsdWUiLCJFZGl0U2Vzc2lvbi50b1N0cmluZyIsIkVkaXRTZXNzaW9uLmdldFZhbHVlIiwiRWRpdFNlc3Npb24uZ2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uc2V0U2VsZWN0aW9uIiwiRWRpdFNlc3Npb24uZ2V0U3RhdGUiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbnMiLCJFZGl0U2Vzc2lvbi5nZXRUb2tlbkF0IiwiRWRpdFNlc3Npb24uc2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5tYXJrVW5kb0dyb3VwIiwiRWRpdFNlc3Npb24uZ2V0VW5kb01hbmFnZXIiLCJFZGl0U2Vzc2lvbi5nZXRUYWJTdHJpbmciLCJFZGl0U2Vzc2lvbi5zZXRVc2VTb2Z0VGFicyIsIkVkaXRTZXNzaW9uLmdldFVzZVNvZnRUYWJzIiwiRWRpdFNlc3Npb24uc2V0VGFiU2l6ZSIsIkVkaXRTZXNzaW9uLmdldFRhYlNpemUiLCJFZGl0U2Vzc2lvbi5pc1RhYlN0b3AiLCJFZGl0U2Vzc2lvbi5zZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5nZXRPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi50b2dnbGVPdmVyd3JpdGUiLCJFZGl0U2Vzc2lvbi5hZGRHdXR0ZXJEZWNvcmF0aW9uIiwiRWRpdFNlc3Npb24ucmVtb3ZlR3V0dGVyRGVjb3JhdGlvbiIsIkVkaXRTZXNzaW9uLmdldEJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludHMiLCJFZGl0U2Vzc2lvbi5jbGVhckJyZWFrcG9pbnRzIiwiRWRpdFNlc3Npb24uc2V0QnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmNsZWFyQnJlYWtwb2ludCIsIkVkaXRTZXNzaW9uLmFkZE1hcmtlciIsIkVkaXRTZXNzaW9uLmFkZER5bmFtaWNNYXJrZXIiLCJFZGl0U2Vzc2lvbi5yZW1vdmVNYXJrZXIiLCJFZGl0U2Vzc2lvbi5nZXRNYXJrZXJzIiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0IiwiRWRpdFNlc3Npb24uaGlnaGxpZ2h0TGluZXMiLCJFZGl0U2Vzc2lvbi5zZXRBbm5vdGF0aW9ucyIsIkVkaXRTZXNzaW9uLmNsZWFyQW5ub3RhdGlvbnMiLCJFZGl0U2Vzc2lvbi4kZGV0ZWN0TmV3TGluZSIsIkVkaXRTZXNzaW9uLmdldFdvcmRSYW5nZSIsIkVkaXRTZXNzaW9uLmdldEFXb3JkUmFuZ2UiLCJFZGl0U2Vzc2lvbi5zZXROZXdMaW5lTW9kZSIsIkVkaXRTZXNzaW9uLmdldE5ld0xpbmVNb2RlIiwiRWRpdFNlc3Npb24uc2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0VXNlV29ya2VyIiwiRWRpdFNlc3Npb24ub25SZWxvYWRUb2tlbml6ZXIiLCJFZGl0U2Vzc2lvbi5zZXRNb2RlIiwiRWRpdFNlc3Npb24uJG9uQ2hhbmdlTW9kZSIsIkVkaXRTZXNzaW9uLiRzdG9wV29ya2VyIiwiRWRpdFNlc3Npb24uJHN0YXJ0V29ya2VyIiwiRWRpdFNlc3Npb24uZ2V0TW9kZSIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLmdldFNjcm9sbFRvcCIsIkVkaXRTZXNzaW9uLnNldFNjcm9sbExlZnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0IiwiRWRpdFNlc3Npb24uZ2V0U2NyZWVuV2lkdGgiLCJFZGl0U2Vzc2lvbi5nZXRMaW5lV2lkZ2V0TWF4V2lkdGgiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdpZHRoIiwiRWRpdFNlc3Npb24uZ2V0TGluZSIsIkVkaXRTZXNzaW9uLmdldExpbmVzIiwiRWRpdFNlc3Npb24uZ2V0TGVuZ3RoIiwiRWRpdFNlc3Npb24uZ2V0VGV4dFJhbmdlIiwiRWRpdFNlc3Npb24uaW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVtb3ZlIiwiRWRpdFNlc3Npb24udW5kb0NoYW5nZXMiLCJFZGl0U2Vzc2lvbi5yZWRvQ2hhbmdlcyIsIkVkaXRTZXNzaW9uLnNldFVuZG9TZWxlY3QiLCJFZGl0U2Vzc2lvbi4kZ2V0VW5kb1NlbGVjdGlvbiIsIkVkaXRTZXNzaW9uLiRnZXRVbmRvU2VsZWN0aW9uLmlzSW5zZXJ0IiwiRWRpdFNlc3Npb24ucmVwbGFjZSIsIkVkaXRTZXNzaW9uLm1vdmVUZXh0IiwiRWRpdFNlc3Npb24uaW5kZW50Um93cyIsIkVkaXRTZXNzaW9uLm91dGRlbnRSb3dzIiwiRWRpdFNlc3Npb24uJG1vdmVMaW5lcyIsIkVkaXRTZXNzaW9uLm1vdmVMaW5lc1VwIiwiRWRpdFNlc3Npb24ubW92ZUxpbmVzRG93biIsIkVkaXRTZXNzaW9uLmR1cGxpY2F0ZUxpbmVzIiwiRWRpdFNlc3Npb24uJGNsaXBSb3dUb0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBDb2x1bW5Ub1JvdyIsIkVkaXRTZXNzaW9uLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50IiwiRWRpdFNlc3Npb24uJGNsaXBSYW5nZVRvRG9jdW1lbnQiLCJFZGl0U2Vzc2lvbi5zZXRVc2VXcmFwTW9kZSIsIkVkaXRTZXNzaW9uLmdldFVzZVdyYXBNb2RlIiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi5hZGp1c3RXcmFwTGltaXQiLCJFZGl0U2Vzc2lvbi4kY29uc3RyYWluV3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uc2V0V3JhcExpbWl0IiwiRWRpdFNlc3Npb24uZ2V0V3JhcExpbWl0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlSW50ZXJuYWxEYXRhT25DaGFuZ2UiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlUm93TGVuZ3RoQ2FjaGUiLCJFZGl0U2Vzc2lvbi4kdXBkYXRlV3JhcERhdGEiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMiLCJFZGl0U2Vzc2lvbi4kY29tcHV0ZVdyYXBTcGxpdHMuYWRkU3BsaXQiLCJFZGl0U2Vzc2lvbi4kZ2V0RGlzcGxheVRva2VucyIsIkVkaXRTZXNzaW9uLiRnZXRTdHJpbmdTY3JlZW5XaWR0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xlbmd0aCIsIkVkaXRTZXNzaW9uLmdldFJvd0xpbmVDb3VudCIsIkVkaXRTZXNzaW9uLmdldFJvd1dyYXBJbmRlbnQiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5MYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uIiwiRWRpdFNlc3Npb24uZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5nZXRSb3dTcGxpdERhdGEiLCJFZGl0U2Vzc2lvbi5nZXRTY3JlZW5UYWJTaXplIiwiRWRpdFNlc3Npb24uc2NyZWVuVG9Eb2N1bWVudFJvdyIsIkVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRDb2x1bW4iLCJFZGl0U2Vzc2lvbi5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24iLCJFZGl0U2Vzc2lvbi5kb2N1bWVudFRvU2NyZWVuQ29sdW1uIiwiRWRpdFNlc3Npb24uZG9jdW1lbnRUb1NjcmVlblJvdyIsIkVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldFNjcmVlbkxlbmd0aCIsIkVkaXRTZXNzaW9uLiRzZXRGb250TWV0cmljcyIsIkVkaXRTZXNzaW9uLmZpbmRNYXRjaGluZ0JyYWNrZXQiLCJFZGl0U2Vzc2lvbi5nZXRCcmFja2V0UmFuZ2UiLCJFZGl0U2Vzc2lvbi4kZmluZE9wZW5pbmdCcmFja2V0IiwiRWRpdFNlc3Npb24uJGZpbmRDbG9zaW5nQnJhY2tldCIsIkVkaXRTZXNzaW9uLmdldEZvbGRBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZSIsIkVkaXRTZXNzaW9uLmdldEZvbGRzSW5SYW5nZUxpc3QiLCJFZGl0U2Vzc2lvbi5nZXRBbGxGb2xkcyIsIkVkaXRTZXNzaW9uLmdldEZvbGRTdHJpbmdBdCIsIkVkaXRTZXNzaW9uLmdldEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0TmV4dEZvbGRMaW5lIiwiRWRpdFNlc3Npb24uZ2V0Rm9sZGVkUm93Q291bnQiLCJFZGl0U2Vzc2lvbi4kYWRkRm9sZExpbmUiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkIiwiRWRpdFNlc3Npb24uc2V0TW9kaWZpZWQiLCJFZGl0U2Vzc2lvbi5hZGRGb2xkcyIsIkVkaXRTZXNzaW9uLnJlbW92ZUZvbGQiLCJFZGl0U2Vzc2lvbi5yZW1vdmVGb2xkcyIsIkVkaXRTZXNzaW9uLmV4cGFuZEZvbGQiLCJFZGl0U2Vzc2lvbi5leHBhbmRGb2xkcyIsIkVkaXRTZXNzaW9uLnVuZm9sZCIsIkVkaXRTZXNzaW9uLmlzUm93Rm9sZGVkIiwiRWRpdFNlc3Npb24uZ2V0Um93Rm9sZEVuZCIsIkVkaXRTZXNzaW9uLmdldFJvd0ZvbGRTdGFydCIsIkVkaXRTZXNzaW9uLmdldEZvbGREaXNwbGF5TGluZSIsIkVkaXRTZXNzaW9uLmdldERpc3BsYXlMaW5lIiwiRWRpdFNlc3Npb24uJGNsb25lRm9sZERhdGEiLCJFZGl0U2Vzc2lvbi50b2dnbGVGb2xkIiwiRWRpdFNlc3Npb24uZ2V0Q29tbWVudEZvbGRSYW5nZSIsIkVkaXRTZXNzaW9uLmZvbGRBbGwiLCJFZGl0U2Vzc2lvbi5zZXRGb2xkU3R5bGUiLCJFZGl0U2Vzc2lvbi4kc2V0Rm9sZGluZyIsIkVkaXRTZXNzaW9uLmdldFBhcmVudEZvbGRSYW5nZURhdGEiLCJFZGl0U2Vzc2lvbi5vbkZvbGRXaWRnZXRDbGljayIsIkVkaXRTZXNzaW9uLiR0b2dnbGVGb2xkV2lkZ2V0IiwiRWRpdFNlc3Npb24udG9nZ2xlRm9sZFdpZGdldCIsIkVkaXRTZXNzaW9uLnVwZGF0ZUZvbGRXaWRnZXRzIl0sIm1hcHBpbmdzIjoiT0ErQk8sRUFBQyxXQUFXLEVBQUUsWUFBWSxFQUFDLE1BQU0sWUFBWTtPQUM3QyxFQUFDLE9BQU8sRUFBRSxhQUFhLEVBQUUsVUFBVSxFQUFFLFlBQVksRUFBQyxNQUFNLFVBQVU7T0FDbEUsaUJBQWlCLE1BQU0scUJBQXFCO09BQzVDLFFBQVEsTUFBTSxZQUFZO09BQzFCLElBQUksTUFBTSxRQUFRO09BQ2xCLFNBQVMsTUFBTSxhQUFhO09BQzVCLElBQUksTUFBTSxhQUFhO09BQ3ZCLEtBQUssTUFBTSxTQUFTO09BQ3BCLGNBQWMsTUFBTSxrQkFBa0I7T0FDdEMsbUJBQW1CLE1BQU0sdUJBQXVCO09BQ2hELGVBQWUsTUFBTSxtQkFBbUI7T0FDeEMsRUFBQyxNQUFNLEVBQUMsTUFBTSxlQUFlO09BQzdCLFlBQVksTUFBTSw2QkFBNkI7T0FFL0MsYUFBYSxNQUFNLGlCQUFpQjtBQVEzQyxJQUFJLElBQUksR0FBRyxDQUFDLEVBQ1IsUUFBUSxHQUFHLENBQUMsRUFDWixpQkFBaUIsR0FBRyxDQUFDLEVBQ3JCLGdCQUFnQixHQUFHLENBQUMsRUFDcEIsV0FBVyxHQUFHLENBQUMsRUFDZixLQUFLLEdBQUcsRUFBRSxFQUNWLEdBQUcsR0FBRyxFQUFFLEVBQ1IsU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUluQixxQkFBcUIsQ0FBUztJQUMxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDWEEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLE1BQU1BLENBQUNBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzdCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0EsSUFBSUEsTUFBTUEsSUFBSUEsQ0FBQ0EsSUFBSUEsTUFBTUE7UUFDMUJBLENBQUNBLElBQUlBLE1BQU1BLElBQUlBLENBQUNBLElBQUlBLE1BQU1BO1FBQzFCQSxDQUFDQSxJQUFJQSxNQUFNQSxJQUFJQSxDQUFDQSxJQUFJQSxNQUFNQTtRQUMxQkEsQ0FBQ0Es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TUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsT0FBT0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFFNURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBO1lBQ1RBLE9BQU9BLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBO1FBRXhEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUNSQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQTtRQUMxQkEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsRUFBRUEsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDdERBLElBQUlBLEVBQUVBLEdBQUdBLElBQUlBLENBQUNBO1FBQ2xCQSxJQUFJQTtZQUNBQSxJQUFJQSxFQUFFQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQTtRQUU3QkEsSUFBSUEsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDbkJBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1pBLEdBQUdBLENBQUNBO2dCQUNBQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNaQSxDQUFDQSxRQUNNQSxLQUFLQSxJQUFJQSxDQUFDQSxJQUFJQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxFQUFFQSxDQUFDQSxFQUFFQTtZQUNuREEsS0FB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LENBQUNBLENBQUNBO1lBQy9EQSxpQkFBaUJBLEdBQUdBLEtBQUtBLENBQUNBO1FBQzlCQSxDQUFDQTtRQUVEQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxNQUFNQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUNyQ0EsS0FBS0EsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbEJBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNsQkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7Z0JBQzFCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDaERBLEtBQUtBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dCQUNwRUEsQ0FBQ0E7Z0JBQ0RBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO2dCQUN4QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQy9DQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFL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O1FBQ3BCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUVwQkEsSUFBSUEsT0FBT0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsVUFBVUEsRUFBRUEsVUFBVUEsQ0FBQ0EsQ0FBQ0E7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1lBQ1JBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLFNBQVNBLENBQUNBLENBQUNBO1lBQ3ZCQSxPQUFPQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNsREEsT0FBT0EsR0FBR0EsT0FBT0EsR0FBR0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7WUFDMUZBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNWQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDeEZBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLElBQUlBLE9BQU9BLENBQUNBO2dCQUNwQ0EsQ0FBQ0E7Z0JBQ0RBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO29CQUNwRkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsSUFBSUEsT0FBT0EsQ0FBQ0E7Z0JBQ2xDQSxDQUFDQTtZQUNMQSxDQUFDQTtZQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxPQUFPQSxJQUFJQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcERBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE9BQU9BLENBQUNBO2dCQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsSUFBSUEsT0FBT0EsQ0FBQ0E7WUFDL0JBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQy9DQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNmQSxJQUFJQSxRQUFRQSxHQUFHQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQTtZQUMvQkEsSUFBSUEsUUFBUUEsR0FBR0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDN0JBLE9BQU9BLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLEdBQUdBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBO1lBQ3RDQSxPQUFPQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxDQUFDQTtZQUM1Q0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsVUFBU0EsQ0FBQ0E7Z0JBQzlCLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2QsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLElBQUksUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLE9BQU8sQ0FBQztnQkFDOUIsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLEdBQUcsSUFBSSxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztvQkFDNUIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksT0FBTyxDQUFDO2dCQUM1QixDQUFDO2dCQUNELENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxJQUFJLE9BQU8sQ0FBQztnQkFDdkIsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDO2dCQUNyQixNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2IsQ0FBQyxDQUFDQSxDQUFDQSxDQUFDQTtRQUNSQSxDQUFDQTtRQUVEQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtJQUNuQkEsQ0FBQ0E7SUFZTTVFLFVBQVVBLENBQUNBLFFBQWdCQSxFQUFFQSxNQUFjQSxFQUFFQSxZQUFvQkE7UUFDcEU2RSxZQUFZQSxHQUFHQSxZQUFZQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNoRUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsR0FBR0EsR0FBR0EsUUFBUUEsRUFBRUEsR0FBR0EsSUFBSUEsTUFBTUEsRUFBRUEsR0FBR0EsRUFBRUE7WUFDekNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLEVBQUVBLEdBQUdBLEVBQUVBLEdBQUdBLEVBQUVBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLFlBQVlBLENBQUNBLENBQUNBO0lBQzNEQSxDQUFDQTtJQVFNN0UsV0FBV0EsQ0FBQ0EsS0FBWUE7UUFDM0I4RSxJQUFJQSxRQUFRQSxHQUFHQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxDQUFDQTtRQUNwQ0EsSUFBSUEsV0FBV0EsR0FBR0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLElBQUlBLElBQUlBLEdBQUdBLElBQUlBLENBQUNBLFVBQVVBLEVBQUVBLENBQUNBO1FBRTdCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQSxJQUFJQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxFQUFFQSxFQUFFQSxDQUFDQSxFQUFFQSxDQUFDQTtZQUMxREEsSUFBSUEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFM0JBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQzFCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUN4QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsRUFBRUEsRUFBRUEsQ0FBQ0E7Z0JBQ3pCQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxDQUFDQTtvQkFDdEJBLEtBQUtBLENBQUNBO1lBQ2RBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO2dCQUNyQ0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzdCQSxXQUFXQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFD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Q0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDYkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7SUFDMURBLENBQUNBO0lBR09wRix1QkFBdUJBLENBQUNBLEdBQVdBLEVBQUVBLE1BQWNBO1FBQ3ZEcUYsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFN0JBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ1ZBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBO1lBQ1JBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBO1FBQ2ZBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLENBQUNBO1lBQ0ZBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1lBQy9CQSxFQUFFQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDYkEsR0FBR0EsR0FBR0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ2RBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBO1lBQzlDQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDRkEsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7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SUEsR0FBR0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3RCQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDMUJBLElBQUlBLEdBQUdBLEdBQUdBLFdBQVdBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLGVBQWVBLENBQUFBO2dCQUM3REEsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBSTVCQSxJQUFJQSxTQUFTQSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQTtnQkFDL0JBLElBQUlBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO2dCQUMxQ0EsSUFBSUEsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1pBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO29CQUNYQSxJQUFJQSxHQUFHQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxhQUFhQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFBQTtvQkFFL0RBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNYQSxRQUFRQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDbkRBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO3dCQUN2QkEsUUFBUUEsQ0FBQ0EsY0FBY0EsQ0FDbkJBLE9BQU9BLEVBQUVBLENBQUNBLEVBQUVBLEdBQUdBLENBQUNBLE1BQU1BLEdBQUdBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO29CQUMvQ0EsQ0FBQ0E7b0JBQUNBLElBQUlBLENBRUZBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO3dCQUNaQSxRQUFRQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxFQUFFQSxHQUFHQSxDQUFDQSxNQUFNQSxHQUFHQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTt3QkFDaEVBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUMzQkEsQ0FBQ0E7b0JBRUxBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO2dCQUMxQ0EsQ0FBQ0E7Z0JBRURBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLEVBQUVBLEdBQUdBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLEdBQUdBLEVBQUVBLEVBQUVBLENBQUNBO29CQUN0Q0EsSUFBSUEsUUFBUUEsR0FBR0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7b0JBQzlCQSxFQUFFQSxDQUFDQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDakNBLFFBQVFBLENBQUNBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO29CQUMzQkEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO1lBQ0xBLENBQUNBO1FBQ0xBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBR0pBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1lBQ3BFQSxFQUFFQSxD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QUdBLEdBQWFBLEVBQUVBLENBQUNBO1FBQ3ZCQSxJQUFJQSxPQUFlQSxDQUFDQTtRQUNwQkEsTUFBTUEsR0FBR0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFckJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLEdBQUdBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQ2xDQSxJQUFJQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUUxQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ1RBLE9BQU9BLEdBQUdBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3JEQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtnQkFDZEEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsT0FBT0EsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7b0JBQy9CQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQTtnQkFDeEJBLENBQUNBO1lBQ0xBLENBQUNBO1lBRURBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO2dCQUNmQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsRUFBRUEsSUFBSUEsQ0FBQ0EsR0FBR0EsRUFBRUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FB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LEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxNQUFNQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUNqQkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDOUNBLENBQUNBO0lBQ0xBLENBQUNBO0lBRU10RyxlQUFlQSxDQUFDQSxHQUFXQTtRQUM5QnVHLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFlBQVlBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUNiQSxDQUFDQTtRQUNEQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUNGQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQTtRQUMxQ0EsQ0FBQ0E7SUFDTEEsQ0FBQ0E7SUFFTXZHLGdCQUFnQkEsQ0FBQ0EsU0FBaUJBO1FBQ3JDd0csRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLElBQUlBLEdBQUdBLEdBQUdBLElBQUlBLENBQUNBLHdCQUF3QkEsQ0FBQ0EsU0FBU0EsRUFBRUEsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0E7WUFDckVBLElBQUlBLE1BQU1BLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBRXJDQSxNQUFNQSxDQUFDQSxNQUFNQSxDQUFDQSxNQUFNQSxJQUFJQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxHQUFHQSxDQUFDQSxNQUFN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SUEsQ0FBQ0EsQ0FBQ0E7WUFDRkEsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2pCQSxDQUFDQTtJQUtEN0gsV0FBV0E7UUFDUDhILElBQUlBLEtBQUtBLEdBQUdBLEVBQUVBLENBQUNBO1FBQ2ZBLElBQUlBLFNBQVNBLEdBQUdBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBO1FBRS9CQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxTQUFTQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtZQUNyQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUE7Z0JBQzlDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUUxQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0E7SUFDakJBLENBQUNBO0lBbUJEOUgsZUFBZUEsQ0FBQ0EsR0FBV0EsRUFBRUEsTUFBY0EsRUFBRUEsSUFBWUEsRUFBRUEsUUFBbUJBO1FBQzFFK0gsUUFBUUEsR0FBR0EsUUFBUUEsSUFBSUEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBO1lBQ1ZBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBO1FBRWhCQSxJQUFJQSxRQUFRQSxHQUFHQTtZQUNYQSxHQUFHQSxFQUFFQSxFQUFFQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQTtTQUNyQkEsQ0FBQ0E7UUFFRkEsSUFBSUEsR0FBV0EsQ0FBQ0E7UUFDaEJBLElBQUlBLElBQVVBLENBQUNBO1FBQ2ZBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBO1lBQzdDQSxJQUFJQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN6QkEsSUFBSUEsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsR0FBR0EsRUFBRUEsTUFBTUEsQ0FBQ0EsQ0FBQ0E7WUFDN0NBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNaQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxNQUFNQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtnQkFDckZBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNqQkEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDaEJBLENBQUNBO1lBQ0RBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3BCQSxDQUFDQTtRQUNEQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNMQSxHQUFHQSxHQUFHQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFH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QUdBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDL0JBLFFBQVFBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUN2QkEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0E7Z0JBQ2JBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLElBQUlBLFFBQVFBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO2dCQUNwQ0EsUUFBUUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDYkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBRWhCQSxJQUFJQSxZQUFZQSxHQUFHQSxRQUFRQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDbkNBLEVBQUVBLENBQUNBLENBQUNBLFlBQVlBLElBQUlBLFlBQVlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLElBQUlBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO3dCQUVuREEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsWUFBWUEsQ0FBQ0EsQ0FBQ0E7d0JBQzdCQSxLQUFLQSxDQUFDQTtvQkFDVkEsQ0FBQ0E7Z0JBQ0xBLENBQUNBO2dCQUNEQSxLQUFLQSxDQUFDQTtZQUNWQSxDQUFDQTtZQUNEQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxNQUFNQSxJQUFJQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcENBLEtBQUtBLENBQUNBO1lBQ1ZBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBO1lBQ1BBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBLElBQUlBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1FBRXZFQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQTtZQUNsQkEsSUFBSUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFDakVBLElBQUlBO1lBQ0FBLElBQUlBLENBQUNBLHFCQUFxQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7UUFHdkVBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxZQUFZQSxFQUFFQSxFQUFFQSxJQUFJQSxFQUFFQSxJQUFJQSxFQUFFQSxNQUFNQSxFQUFFQSxLQUFLQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUV4REEsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7SUFDaEJBLENBQUNBO0lBRURwSSxXQUFXQSxDQUFDQSxRQUFpQkE7SUFFN0JxSSxDQUFDQTtJQUVEckksUUFBUUEsQ0FBQ0EsS0FBYUE7UUFDbEJzSSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxVQUFTQSxJQUFJQTtZQUN2QixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZCLENBQUMsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDYkEsQ0FBQ0E7SUFFRHRJLFVBQVVBLENBQUNBLElBQVVBO1FBQ2pCdUksSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0E7UUFDN0JBLElBQUlBLFFBQVFBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1FBQ2xDQSxJQUFJQSxNQUFNQSxHQUFHQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUU5QkEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7UUFDL0JBLElBQUlBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBO1FBRzNCQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsU0FBU0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDckRBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3REQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxDQUFDQTtZQUNaQSxRQUFRQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNuREEsUUFBUUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDN0RBLENBQUNBO1FBQ0RBLElBQUlBLENBRUFBLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEVBQUVBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQzVEQSxLQUFLQSxDQUFDQSxLQUFLQSxFQUFFQSxDQUFDQTtZQUNkQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUN4Q0EsUUFBUUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsR0FBR0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0E7UUFDbERBLENBQUNBO1FBQ0RBLElBQUlBLENBS0FBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO1lBQ2ZBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pDQSxDQUFDQTtRQUFDQSxJQUFJQSxDQUdOQSxDQUFDQTtZQUNHQSxJQUFJQSxXQUFXQSxHQUFHQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQTtZQUNwRUEsS0FBS0EsR0FBR0EsV0FBV0EsQ0FBQ0EsS0FBS0EsQ0FBQ0E7WUFDMUJBLEtBQUtBLENBQUNBLEtBQUtBLEVBQUVBLENBQUNBO1lBQ2RBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEdBQUdBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLENBQUNBO1lBQzNDQSxXQUFXQSxDQUFD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SUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDbkJBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLEVBQUVBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQzdDQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUN2QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsUUFBUUEsSUFBSUEsUUFBUUEsQ0FBQ0E7WUFDbkNBLEtBQUtBLEdBQUdBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLEVBQUVBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO1FBQzVFQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxLQUFLQSxJQUFJQSxRQUFRQSxDQUFDQTtZQUN2QkEsS0FBS0EsR0FBR0EsS0FBS0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsUUFBUUEsRUFBRUEsUUFBUUEsQ0FBQ0EsQ0FBQ0E7UUFDakRBLElBQUlBO1lBQ0FBLEtBQUtBLEdBQUdBLFFBQVFBLENBQUNBO1FBRXJCQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQ3hDQSxFQUFFQSxDQUFDQSxDQUFDQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNkQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtRQUM1QkEsQ0FBQ0E7UUFBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDSkEsSUFBSUEsUUFBUUEsR0FBR0EsS0FBS0EsQ0FBQ0E7WUFHckJBLE9BQU9BLFFBQVFBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO2dCQUNyQkEsSUFBSUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxRQUFRQSxHQUFH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QSxLQUFLQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO2dCQUN4QkEsTUFBTUEsQ0FBQ0E7WUFDWEEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQzNCQSxJQUFJQSxHQUFHQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNwQkEsQ0FBQ0E7UUFDTEEsQ0FBQ0E7UUFFREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0E7WUFDTkEsSUFBSUEsR0FBR0EsSUFBSUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsRUFBRUEsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0E7UUFFL0RBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLElBQUlBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLEtBQUtBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3BEQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUN0QkEsTUFBTUEsQ0FBQ0E7UUFDWEEsQ0FBQ0E7UUFFREEsSUFBSUEsV0FBV0EsR0FBR0EsS0FBS0EsQ0FBQ0E7UUFDeEJBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLFdBQVdBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBO1lBQ3ZCQSxXQUFXQSxHQUFHQSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQTtZQUN2Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsV0FBV0EsQ0FBQ0EsTUFBTUEsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZCQSxNQUFNQSxDQUFDQTtZQUNYQSxX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QSxHQUFHQSxJQUFJQSxDQUFDQSxTQUFTQSxDQUFDQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxFQUFFQSxLQUFLQSxDQUFDQSxLQUFLQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM5REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsSUFBSUEsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3BDQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTtnQkFDdEJBLE1BQU1BLENBQUNBO1lBQ1hBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ25CQSxJQUFJQSxJQUFJQSxHQUFHQSxJQUFJQSxDQUFDQSxzQkFBc0JBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBO1lBQzVDQSxFQUFFQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDYkEsSUFBSUEsUUFBUUEsR0FBR0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsR0FBR0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3hDQSxJQUFJQSxNQUFNQSxHQUFHQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxDQUFDQSxHQUFHQSxDQUFDQTtZQUNwQ0EsQ0FBQ0E7WUFDREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsUUFBUUEsRUFBRUEsTUFBTUEsRUFBRUEsT0FBT0EsQ0FBQ0EsR0FBR0EsR0FBR0EsS0FBS0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDNURBLENBQUNBO1FBQ0RBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxNQUFNQSxHQUFHQSxLQUFLQSxH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LE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssT0FBTyxDQUFDO2dCQUFDLE1BQU0sQ0FBQztZQUV4RCxJQUFJLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztZQUN0QixJQUFJLENBQUMsZUFBZSxHQUFHLEVBQUUsQ0FBQztZQUMxQixJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztZQUN4QixJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ2xDLENBQUM7UUFDRCxZQUFZLEVBQUUsQ0FBQztRQUNmLFVBQVUsRUFBRSxJQUFJO0tBQ25CO0lBQ0QsU0FBUyxFQUFFO1FBQ1AsR0FBRyxFQUFFLFVBQVMsR0FBRyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkQsWUFBWSxFQUFFLEtBQUs7S0FDdEI7SUFDRCxXQUFXLEVBQUU7UUFDVCxHQUFHLEVBQUUsVUFBUyxHQUFHLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUEsQ0FBQyxDQUFDO1FBQ25ELEdBQUcsRUFBRSxjQUFhLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFBLENBQUMsQ0FBQztRQUNwRCxVQUFVLEVBQUUsSUFBSTtLQUNuQjtJQUNELElBQUksRUFBRTtRQUNGLEdBQUcsRUFBRSxVQUFTLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFBLENBQUMsQ0FBQztRQUN4QyxHQUFHLEVBQUUsY0FBYSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQSxDQUFDLENBQUM7S0FDMUM7Q0FDSixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiAqKioqKiBCRUdJTiBMSUNFTlNFIEJMT0NLICoqKioqXG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIGxpY2Vuc2U6XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEwLCBBamF4Lm9yZyBCLlYuXG4gKiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICpcbiAqIFJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dFxuICogbW9kaWZpY2F0aW9uLCBhcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG4gKiAgICAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodFxuICogICAgICAgbm90aWNlLCB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICogICAgICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHRcbiAqICAgICAgIG5vdGljZSwgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGVcbiAqICAgICAgIGRvY3VtZW50YXRpb24gYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG4gKiAgICAgKiBOZWl0aGVyIHRoZSBuYW1lIG9mIEFqYXgub3JnIEIuVi4gbm9yIHRoZVxuICogICAgICAgbmFtZXMgb2YgaXRzIGNvbnRyaWJ1dG9ycyBtYXkgYmUgdXNlZCB0byBlbmRvcnNlIG9yIHByb21vdGUgcHJvZHVjdHNcbiAqICAgICAgIGRlcml2ZWQgZnJvbSB0aGlzIHNvZnR3YXJlIHdpdGhvdXQgc3BlY2lmaWMgcHJpb3Igd3JpdHRlbiBwZXJtaXNzaW9uLlxuICpcbiAqIFRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuICogQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbiAqIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkVcbiAqIERJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIEFKQVguT1JHIEIuVi4gQkUgTElBQkxFIEZPUiBBTllcbiAqIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4gKiAoSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG4gKiBMT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkRcbiAqIE9OIEFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4gKiAoSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuICogU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuXG4gKlxuICogKioqKiogRU5EIExJQ0VOU0UgQkxPQ0sgKioqKiogKi9cblxuaW1wb3J0IHttaXhpbn0gZnJvbSBcIi4vbGliL29vcFwiO1xuaW1wb3J0IHtkZWxheWVkQ2FsbCwgc3RyaW5nUmVwZWF0fSBmcm9tIFwiLi9saWIvbGFuZ1wiO1xuaW1wb3J0IHtfc2lnbmFsLCBkZWZpbmVPcHRpb25zLCBsb2FkTW9kdWxlLCByZXNldE9wdGlvbnN9IGZyb20gXCIuL2NvbmZpZ1wiO1xuaW1wb3J0IEV2ZW50RW1pdHRlckNsYXNzIGZyb20gXCIuL2xpYi9ldmVudF9lbWl0dGVyXCI7XG5pbXBvcnQgRm9sZExpbmUgZnJvbSBcIi4vRm9sZExpbmVcIjtcbmltcG9ydCBGb2xkIGZyb20gXCIuL0ZvbGRcIjtcbmltcG9ydCBTZWxlY3Rpb24gZnJvbSBcIi4vU2VsZWN0aW9uXCI7XG5pbXBvcnQgTW9kZSBmcm9tIFwiLi9tb2RlL01vZGVcIjtcbmltcG9ydCBSYW5nZSBmcm9tIFwiLi9SYW5nZVwiO1xuaW1wb3J0IEVkaXRvckRvY3VtZW50IGZyb20gXCIuL0VkaXRvckRvY3VtZW50XCI7XG5pbXBvcnQgQmFja2dyb3VuZFRva2VuaXplciBmcm9tIFwiLi9CYWNrZ3JvdW5kVG9rZW5pemVyXCI7XG5pbXBvcnQgU2VhcmNoSGlnaGxpZ2h0IGZyb20gXCIuL1NlYXJjaEhpZ2hsaWdodFwiO1xuaW1wb3J0IHthc3NlcnR9IGZyb20gJy4vbGliL2Fzc2VydHMnO1xuaW1wb3J0IEJyYWNrZXRNYXRjaCBmcm9tIFwiLi9lZGl0X3Nlc3Npb24vQnJhY2tldE1hdGNoXCI7XG5pbXBvcnQgVW5kb01hbmFnZXIgZnJvbSAnLi9VbmRvTWFuYWdlcidcbmltcG9ydCBUb2tlbkl0ZXJhdG9yIGZyb20gJy4vVG9rZW5JdGVyYXRvcic7XG5pbXBvcnQgRm9udE1ldHJpY3MgZnJvbSBcIi4vbGF5ZXIvRm9udE1ldHJpY3NcIjtcbmltcG9ydCBXb3JrZXJDbGllbnQgZnJvbSBcIi4vd29ya2VyL1dvcmtlckNsaWVudFwiO1xuaW1wb3J0IExpbmVXaWRnZXQgZnJvbSAnLi9MaW5lV2lkZ2V0JztcbmltcG9ydCBMaW5lV2lkZ2V0cyBmcm9tICcuL0xpbmVXaWRnZXRzJztcbmltcG9ydCBQb3NpdGlvbiBmcm9tICcuL1Bvc2l0aW9uJztcblxuLy8gXCJUb2tlbnNcIlxudmFyIENIQVIgPSAxLFxuICAgIENIQVJfRVhUID0gMixcbiAgICBQTEFDRUhPTERFUl9TVEFSVCA9IDMsXG4gICAgUExBQ0VIT0xERVJfQk9EWSA9IDQsXG4gICAgUFVOQ1RVQVRJT04gPSA5LFxuICAgIFNQQUNFID0gMTAsXG4gICAgVEFCID0gMTEsXG4gICAgVEFCX1NQQUNFID0gMTI7XG5cbi8vIEZvciBldmVyeSBrZXlzdHJva2UgdGhpcyBnZXRzIGNhbGxlZCBvbmNlIHBlciBjaGFyIGluIHRoZSB3aG9sZSBkb2MhIVxuLy8gV291bGRuJ3QgaHVydCB0byBtYWtlIGl0IGEgYml0IGZhc3RlciBmb3IgYyA+PSAweDExMDBcbmZ1bmN0aW9uIGlzRnVsbFdpZHRoKGM6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGlmIChjIDwgMHgxMTAwKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGMgPj0gMHgxMTAwICYmIGMgPD0gMHgxMTVGIHx8XG4gICAgICAgIGMgPj0gMHgxMUEzICYmIGMgPD0gMHgxMUE3IHx8XG4gICAgICAgIGMgPj0gMHgxMUZBICYmIGMgPD0gMHgxMUZGIHx8XG4gICAgICAgIGMgPj0gMHgyMzI5ICYmIGMgPD0gMHgyMzJBIHx8XG4gICAgICAgIGMgPj0gMHgyRTgwICYmIGMgPD0gMHgyRTk5IHx8XG4gICAgICAgIGMgPj0gMHgyRTlCICYmIGMgPD0gMHgyRUYzIHx8XG4gICAgICAgIGMgPj0gMHgyRjAwICYmIGMgPD0gMHgyRkQ1IHx8XG4gICAgICAgIGMgPj0gMHgyRkYwICYmIGMgPD0gMHgyRkZCIHx8XG4gICAgICAgIGMgPj0gMHgzMDAwICYmIGMgPD0gMHgzMDNFIHx8XG4gICAgICAgIGMgPj0gMHgzMDQxICYmIGMgPD0gMHgzMDk2IHx8XG4gICAgICAgIGMgPj0gMHgzMDk5ICYmIGMgPD0gMHgzMEZGIHx8XG4gICAgICAgIGMgPj0gMHgzMTA1ICYmIGMgPD0gMHgzMTJEIHx8XG4gICAgICAgIGMgPj0gMHgzMTMxICYmIGMgPD0gMHgzMThFIHx8XG4gICAgICAgIGMgPj0gMHgzMTkwICYmIGMgPD0gMHgzMUJBIHx8XG4gICAgICAgIGMgPj0gMHgzMUMwICYmIGMgPD0gMHgzMUUzIHx8XG4gICAgICAgIGMgPj0gMHgzMUYwICYmIGMgPD0gMHgzMjFFIHx8XG4gICAgICAgIGMgPj0gMHgzMjIwICYmIGMgPD0gMHgzMjQ3IHx8XG4gICAgICAgIGMgPj0gMHgzMjUwICYmIGMgPD0gMHgzMkZFIHx8XG4gICAgICAgIGMgPj0gMHgzMzAwICYmIGMgPD0gMHg0REJGIHx8XG4gICAgICAgIGMgPj0gMHg0RTAwICYmIGMgPD0gMHhBNDhDIHx8XG4gICAgICAgIGMgPj0gMHhBNDkwICYmIGMgPD0gMHhBNEM2IHx8XG4gICAgICAgIGMgPj0gMHhBOTYwICYmIGMgPD0gMHhBOTdDIHx8XG4gICAgICAgIGMgPj0gMHhBQzAwICYmIGMgPD0gMHhEN0EzIHx8XG4gICAgICAgIGMgPj0gMHhEN0IwICYmIGMgPD0gMHhEN0M2IHx8XG4gICAgICAgIGMgPj0gMHhEN0NCICYmIGMgPD0gMHhEN0ZCIHx8XG4gICAgICAgIGMgPj0gMHhGOTAwICYmIGMgPD0gMHhGQUZGIHx8XG4gICAgICAgIGMgPj0gMHhGRTEwICYmIGMgPD0gMHhGRTE5IHx8XG4gICAgICAgIGMgPj0gMHhGRTMwICYmIGMgPD0gMHhGRTUyIHx8XG4gICAgICAgIGMgPj0gMHhGRTU0ICYmIGMgPD0gMHhGRTY2IHx8XG4gICAgICAgIGMgPj0gMHhGRTY4ICYmIGMgPD0gMHhGRTZCIHx8XG4gICAgICAgIGMgPj0gMHhGRjAxICYmIGMgPD0gMHhGRjYwIHx8XG4gICAgICAgIGMgPj0gMHhGRkUwICYmIGMgPD0gMHhGRkU2O1xufVxuXG4vKipcbiAqIEBjbGFzcyBFZGl0U2Vzc2lvblxuICogQGV4dGVuZHMgRXZlbnRFbWl0dGVyQ2xhc3NcbiAqL1xuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRWRpdFNlc3Npb24gZXh0ZW5kcyBFdmVudEVtaXR0ZXJDbGFzcyB7XG4gICAgcHVibGljICRicmVha3BvaW50czogc3RyaW5nW10gPSBbXTtcbiAgICBwdWJsaWMgJGRlY29yYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuICAgIHByaXZhdGUgJGZyb250TWFya2VycyA9IHt9O1xuICAgIHB1YmxpYyAkYmFja01hcmtlcnMgPSB7fTtcbiAgICBwcml2YXRlICRtYXJrZXJJZCA9IDE7XG4gICAgcHJpdmF0ZSAkdW5kb1NlbGVjdCA9IHRydWU7XG4gICAgcHJpdmF0ZSAkZGVsdGFzO1xuICAgIHByaXZhdGUgJGRlbHRhc0RvYztcbiAgICBwcml2YXRlICRkZWx0YXNGb2xkO1xuICAgIHByaXZhdGUgJGZyb21VbmRvO1xuXG4gICAgcHVibGljIHdpZGdldE1hbmFnZXI6IExpbmVXaWRnZXRzO1xuICAgIHByaXZhdGUgJHVwZGF0ZUZvbGRXaWRnZXRzOiAoZXZlbnQsIGVkaXRTZXNzaW9uOiBFZGl0U2Vzc2lvbikgPT4gYW55O1xuICAgIHByaXZhdGUgJGZvbGREYXRhOiBGb2xkTGluZVtdO1xuICAgIHB1YmxpYyBmb2xkV2lkZ2V0czogYW55W107XG4gICAgcHVibGljIGdldEZvbGRXaWRnZXQ6IChyb3c6IG51bWJlcikgPT4gYW55O1xuICAgIHB1YmxpYyBnZXRGb2xkV2lkZ2V0UmFuZ2U6IChyb3c6IG51bWJlciwgZm9yY2VNdWx0aWxpbmU/OiBib29sZWFuKSA9PiBSYW5nZTtcbiAgICBwdWJsaWMgX2NoYW5nZWRXaWRnZXRzOiBMaW5lV2lkZ2V0W107XG5cbiAgICBwdWJsaWMgZG9jOiBFZGl0b3JEb2N1bWVudDtcbiAgICBwcml2YXRlICRkZWZhdWx0VW5kb01hbmFnZXIgPSB7IHVuZG86IGZ1bmN0aW9uKCkgeyB9LCByZWRvOiBmdW5jdGlvbigpIHsgfSwgcmVzZXQ6IGZ1bmN0aW9uKCkgeyB9IH07XG4gICAgcHJpdmF0ZSAkdW5kb01hbmFnZXI6IFVuZG9NYW5hZ2VyO1xuICAgIHByaXZhdGUgJGluZm9ybVVuZG9NYW5hZ2VyOiB7IGNhbmNlbDogKCkgPT4gdm9pZDsgc2NoZWR1bGU6ICgpID0+IHZvaWQgfTtcbiAgICBwdWJsaWMgYmdUb2tlbml6ZXI6IEJhY2tncm91bmRUb2tlbml6ZXI7XG4gICAgcHVibGljICRtb2RpZmllZDtcbiAgICBwcml2YXRlIHNlbGVjdGlvbjogU2VsZWN0aW9uO1xuICAgIHByaXZhdGUgJGRvY1Jvd0NhY2hlOiBudW1iZXJbXTtcbiAgICBwcml2YXRlICR3cmFwRGF0YTogbnVtYmVyW11bXTtcbiAgICBwcml2YXRlICRzY3JlZW5Sb3dDYWNoZTogbnVtYmVyW107XG4gICAgcHJpdmF0ZSAkcm93TGVuZ3RoQ2FjaGU7XG4gICAgcHJpdmF0ZSAkb3ZlcndyaXRlID0gZmFsc2U7XG4gICAgcHVibGljICRzZWFyY2hIaWdobGlnaHQ6IFNlYXJjaEhpZ2hsaWdodDtcbiAgICBwcml2YXRlICRhbm5vdGF0aW9ucztcbiAgICBwcml2YXRlICRhdXRvTmV3TGluZTtcbiAgICBwcml2YXRlIGdldE9wdGlvbjtcbiAgICBwcml2YXRlIHNldE9wdGlvbjtcbiAgICBwcml2YXRlICR1c2VXb3JrZXI7XG4gICAgLyoqXG4gICAgICpcbiAgICAgKi9cbiAgICBwcml2YXRlICRtb2RlczogeyBbcGF0aDogc3RyaW5nXTogTW9kZSB9ID0ge307XG5cbiAgICAvKipcbiAgICAgKlxuICAgICAqL1xuICAgIHB1YmxpYyAkbW9kZTogTW9kZSA9IG51bGw7XG4gICAgcHJpdmF0ZSAkbW9kZUlkID0gbnVsbDtcbiAgICAvKipcbiAgICAgKiBUaGUgd29ya2VyIGNvcnJlc3BvbmRpbmcgdG8gdGhlIG1vZGUgKGkuZS4gTGFuZ3VhZ2UpLlxuICAgICAqL1xuICAgIHByaXZhdGUgJHdvcmtlcjogV29ya2VyQ2xpZW50O1xuICAgIHByaXZhdGUgJG9wdGlvbnM7XG4gICAgcHVibGljIHRva2VuUmU6IFJlZ0V4cDtcbiAgICBwdWJsaWMgbm9uVG9rZW5SZTogUmVnRXhwO1xuICAgIHB1YmxpYyAkc2Nyb2xsVG9wID0gMDtcbiAgICBwcml2YXRlICRzY3JvbGxMZWZ0ID0gMDtcbiAgICAvLyBXUkFQTU9ERVxuICAgIHByaXZhdGUgJHdyYXBBc0NvZGU7XG4gICAgcHJpdmF0ZSAkd3JhcExpbWl0ID0gODA7XG4gICAgcHVibGljICR1c2VXcmFwTW9kZSA9IGZhbHNlO1xuICAgIHByaXZhdGUgJHdyYXBMaW1pdFJhbmdlID0ge1xuICAgICAgICBtaW46IG51bGwsXG4gICAgICAgIG1heDogbnVsbFxuICAgIH07XG4gICAgcHVibGljICR1cGRhdGluZztcbiAgICBwcml2YXRlICRvbkNoYW5nZSA9IHRoaXMub25DaGFuZ2UuYmluZCh0aGlzKTtcbiAgICBwcml2YXRlICRzeW5jSW5mb3JtVW5kb01hbmFnZXI6ICgpID0+IHZvaWQ7XG4gICAgcHVibGljIG1lcmdlVW5kb0RlbHRhczogYm9vbGVhbjtcbiAgICBwcml2YXRlICR1c2VTb2Z0VGFiczogYm9vbGVhbjtcbiAgICBwcml2YXRlICR0YWJTaXplOiBudW1iZXI7XG4gICAgcHJpdmF0ZSAkd3JhcE1ldGhvZDtcbiAgICBwcml2YXRlIHNjcmVlbldpZHRoOiBudW1iZXI7XG4gICAgcHVibGljIGxpbmVXaWRnZXRzOiBMaW5lV2lkZ2V0W10gPSBudWxsO1xuICAgIHByaXZhdGUgbGluZVdpZGdldHNXaWR0aDogbnVtYmVyO1xuICAgIHB1YmxpYyBsaW5lV2lkZ2V0V2lkdGg6IG51bWJlcjtcbiAgICBwdWJsaWMgJGdldFdpZGdldFNjcmVlbkxlbmd0aDtcbiAgICAvL1xuICAgIHB1YmxpYyAkdGFnSGlnaGxpZ2h0O1xuICAgIC8qKlxuICAgICAqIFRoaXMgaXMgYSBtYXJrZXIgaWRlbnRpZmllci5cbiAgICAgKi9cbiAgICBwdWJsaWMgJGJyYWNrZXRIaWdobGlnaHQ6IG51bWJlcjtcbiAgICAvKipcbiAgICAgKiBUaGlzIGlzIHJlYWxseSBhIFJhbmdlIHdpdGggYW4gYWRkZWQgbWFya2VyIGlkLlxuICAgICAqL1xuICAgIHB1YmxpYyAkaGlnaGxpZ2h0TGluZU1hcmtlcjogUmFuZ2U7XG4gICAgLyoqXG4gICAgICogQSBudW1iZXIgaXMgYSBtYXJrZXIgaWRlbnRpZmllciwgbnVsbCBpbmRpY2F0ZXMgdGhhdCBubyBzdWNoIG1hcmtlciBleGlzdHMuIFxuICAgICAqL1xuICAgIHB1YmxpYyAkc2VsZWN0aW9uTWFya2VyOiBudW1iZXIgPSBudWxsO1xuICAgIHByaXZhdGUgJGJyYWNrZXRNYXRjaGVyID0gbmV3IEJyYWNrZXRNYXRjaCh0aGlzKTtcblxuICAgIC8qKlxuICAgICAqIEBjbGFzcyBFZGl0U2Vzc2lvblxuICAgICAqIEBjb25zdHJ1Y3RvclxuICAgICAqIEBwYXJhbSBkb2Mge0VkaXRvckRvY3VtZW50fVxuICAgICAqIEBwYXJhbSBbbW9kZV1cbiAgICAgKiBAcGFyYW0gW2NiXVxuICAgICAqL1xuICAgIGNvbnN0cnVjdG9yKGRvYzogRWRpdG9yRG9jdW1lbnQsIG1vZGU/LCBjYj86ICgpID0+IGFueSkge1xuICAgICAgICBzdXBlcigpO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YSA9IFtdO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuam9pbihcIlxcblwiKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9uKFwiY2hhbmdlRm9sZFwiLCB0aGlzLm9uQ2hhbmdlRm9sZC5iaW5kKHRoaXMpKTtcbiAgICAgICAgdGhpcy5zZXREb2N1bWVudChkb2MpO1xuICAgICAgICB0aGlzLnNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24odGhpcyk7XG5cbiAgICAgICAgcmVzZXRPcHRpb25zKHRoaXMpO1xuICAgICAgICB0aGlzLnNldE1vZGUobW9kZSwgY2IpO1xuICAgICAgICBfc2lnbmFsKFwic2Vzc2lvblwiLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBgRWRpdFNlc3Npb25gIHRvIHBvaW50IHRvIGEgbmV3IGBFZGl0b3JEb2N1bWVudGAuXG4gICAgICogSWYgYSBgQmFja2dyb3VuZFRva2VuaXplcmAgZXhpc3RzLCBpdCBhbHNvIHBvaW50cyB0byBgZG9jYC5cbiAgICAgKlxuICAgICAqIEBtZXRob2Qgc2V0RG9jdW1lbnRcbiAgICAgKiBAcGFyYW0gZG9jIHtFZGl0b3JEb2N1bWVudH0gVGhlIG5ldyBgRWRpdG9yRG9jdW1lbnRgIHRvIHVzZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqL1xuICAgIHByaXZhdGUgc2V0RG9jdW1lbnQoZG9jOiBFZGl0b3JEb2N1bWVudCk6IHZvaWQge1xuICAgICAgICBpZiAoIShkb2MgaW5zdGFuY2VvZiBFZGl0b3JEb2N1bWVudCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImRvYyBtdXN0IGJlIGEgRWRpdG9yRG9jdW1lbnRcIik7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZG9jKSB7XG4gICAgICAgICAgICB0aGlzLmRvYy5vZmYoXCJjaGFuZ2VcIiwgdGhpcy4kb25DaGFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5kb2MgPSBkb2M7XG4gICAgICAgIGRvYy5vbihcImNoYW5nZVwiLCB0aGlzLiRvbkNoYW5nZSk7XG5cbiAgICAgICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucmVzZXRDYWNoZXMoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBgRWRpdG9yRG9jdW1lbnRgIGFzc29jaWF0ZWQgd2l0aCB0aGlzIHNlc3Npb24uXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldERvY3VtZW50XG4gICAgICogQHJldHVybiB7RWRpdG9yRG9jdW1lbnR9XG4gICAgICovXG4gICAgcHVibGljIGdldERvY3VtZW50KCk6IEVkaXRvckRvY3VtZW50IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgJHJlc2V0Um93Q2FjaGVcbiAgICAgKiBAcGFyYW0gZG9jUm93IHtudW1iZXJ9IFRoZSByb3cgdG8gd29yayB3aXRoLlxuICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICBwcml2YXRlICRyZXNldFJvd0NhY2hlKGRvY1JvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmICghZG9jUm93KSB7XG4gICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZSA9IFtdO1xuICAgICAgICAgICAgdGhpcy4kc2NyZWVuUm93Q2FjaGUgPSBbXTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB2YXIgbCA9IHRoaXMuJGRvY1Jvd0NhY2hlLmxlbmd0aDtcbiAgICAgICAgdmFyIGkgPSB0aGlzLiRnZXRSb3dDYWNoZUluZGV4KHRoaXMuJGRvY1Jvd0NhY2hlLCBkb2NSb3cpICsgMTtcbiAgICAgICAgaWYgKGwgPiBpKSB7XG4gICAgICAgICAgICB0aGlzLiRkb2NSb3dDYWNoZS5zcGxpY2UoaSwgbCk7XG4gICAgICAgICAgICB0aGlzLiRzY3JlZW5Sb3dDYWNoZS5zcGxpY2UoaSwgbCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRnZXRSb3dDYWNoZUluZGV4KGNhY2hlQXJyYXk6IG51bWJlcltdLCB2YWw6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBsb3cgPSAwO1xuICAgICAgICB2YXIgaGkgPSBjYWNoZUFycmF5Lmxlbmd0aCAtIDE7XG5cbiAgICAgICAgd2hpbGUgKGxvdyA8PSBoaSkge1xuICAgICAgICAgICAgdmFyIG1pZCA9IChsb3cgKyBoaSkgPj4gMTtcbiAgICAgICAgICAgIHZhciBjID0gY2FjaGVBcnJheVttaWRdO1xuXG4gICAgICAgICAgICBpZiAodmFsID4gYykge1xuICAgICAgICAgICAgICAgIGxvdyA9IG1pZCArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh2YWwgPCBjKSB7XG4gICAgICAgICAgICAgICAgaGkgPSBtaWQgLSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG1pZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsb3cgLSAxO1xuICAgIH1cblxuICAgIHByaXZhdGUgcmVzZXRDYWNoZXMoKSB7XG4gICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy4kd3JhcERhdGEgPSBbXTtcbiAgICAgICAgdGhpcy4kcm93TGVuZ3RoQ2FjaGUgPSBbXTtcbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcbiAgICAgICAgaWYgKHRoaXMuYmdUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc3RhcnQoMCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlRm9sZChlKSB7XG4gICAgICAgIHZhciBmb2xkID0gZS5kYXRhO1xuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKGZvbGQuc3RhcnQucm93KTtcbiAgICB9XG5cbiAgICBwcml2YXRlIG9uQ2hhbmdlKGUsIGRvYzogRWRpdG9yRG9jdW1lbnQpIHtcbiAgICAgICAgdmFyIGRlbHRhID0gZS5kYXRhO1xuICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG5cbiAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZShkZWx0YS5yYW5nZS5zdGFydC5yb3cpO1xuXG4gICAgICAgIHZhciByZW1vdmVkRm9sZHMgPSB0aGlzLiR1cGRhdGVJbnRlcm5hbERhdGFPbkNoYW5nZShlKTtcbiAgICAgICAgaWYgKCF0aGlzLiRmcm9tVW5kbyAmJiB0aGlzLiR1bmRvTWFuYWdlciAmJiAhZGVsdGEuaWdub3JlKSB7XG4gICAgICAgICAgICB0aGlzLiRkZWx0YXNEb2MucHVzaChkZWx0YSk7XG4gICAgICAgICAgICBpZiAocmVtb3ZlZEZvbGRzICYmIHJlbW92ZWRGb2xkcy5sZW5ndGggIT0gMCkge1xuICAgICAgICAgICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIGFjdGlvbjogXCJyZW1vdmVGb2xkc1wiLFxuICAgICAgICAgICAgICAgICAgICBmb2xkczogcmVtb3ZlZEZvbGRzXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyLnNjaGVkdWxlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmJnVG9rZW5pemVyLiR1cGRhdGVPbkNoYW5nZShkZWx0YSk7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVwiLCBlKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBzZXNzaW9uIHRleHQuXG4gICAgICogQG1ldGhvZCBzZXRWYWx1ZVxuICAgICAqIEBwYXJhbSB0ZXh0IHtzdHJpbmd9IFRoZSBuZXcgdGV4dCB0byBwbGFjZS5cbiAgICAgKiBAcmV0dXJuIHt2b2lkfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRWYWx1ZSh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5kb2Muc2V0VmFsdWUodGV4dCk7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uLm1vdmVUbygwLCAwKTtcblxuICAgICAgICB0aGlzLiRyZXNldFJvd0NhY2hlKDApO1xuICAgICAgICB0aGlzLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRG9jID0gW107XG4gICAgICAgIHRoaXMuJGRlbHRhc0ZvbGQgPSBbXTtcbiAgICAgICAgdGhpcy5zZXRVbmRvTWFuYWdlcih0aGlzLiR1bmRvTWFuYWdlcik7XG4gICAgICAgIHRoaXMuZ2V0VW5kb01hbmFnZXIoKS5yZXNldCgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgRWRpdG9yRG9jdW1lbnQgYXMgYSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHRvU3RyaW5nXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi5nZXRWYWx1ZVxuICAgICAqL1xuICAgIHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRWYWx1ZSgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgRWRpdG9yRG9jdW1lbnQgYXMgYSBzdHJpbmcuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFZhbHVlXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqIEBhbGlhcyBFZGl0U2Vzc2lvbi50b1N0cmluZ1xuICAgICAqL1xuICAgIHB1YmxpYyBnZXRWYWx1ZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0U2VsZWN0aW9uXG4gICAgICogQHJldHVybiB7U2VsZWN0aW9ufVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGN1cnJlbnQgc2VsZWN0aW9uLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRTZWxlY3Rpb25cbiAgICAgKiBAcGFyYW0gc2VsZWN0aW9uIHtTZWxlY3Rpb259XG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0U2VsZWN0aW9uKHNlbGVjdGlvbjogU2VsZWN0aW9uKTogdm9pZCB7XG4gICAgICAgIHRoaXMuc2VsZWN0aW9uID0gc2VsZWN0aW9uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEBtZXRob2QgZ2V0U3RhdGVcbiAgICAgKiBAcGFyYW0gcm93IHtudW1iZXJ9IFRoZSByb3cgdG8gc3RhcnQgYXQuXG4gICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRTdGF0ZShyb3c6IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHJldHVybiB0aGlzLmJnVG9rZW5pemVyLmdldFN0YXRlKHJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogU3RhcnRzIHRva2VuaXppbmcgYXQgdGhlIHJvdyBpbmRpY2F0ZWQuIFJldHVybnMgYSBsaXN0IG9mIG9iamVjdHMgb2YgdGhlIHRva2VuaXplZCByb3dzLlxuICAgICAqIEBtZXRob2QgZ2V0VG9rZW5zXG4gICAgICogQHBhcmFtIHJvdyB7bnVtYmVyfSBUaGUgcm93IHRvIHN0YXJ0IGF0LlxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRUb2tlbnMocm93OiBudW1iZXIpOiB7IHN0YXJ0OiBudW1iZXI7IHR5cGU6IHN0cmluZzsgdmFsdWU6IHN0cmluZyB9W10ge1xuICAgICAgICByZXR1cm4gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIG9iamVjdCBpbmRpY2F0aW5nIHRoZSB0b2tlbiBhdCB0aGUgY3VycmVudCByb3cuXG4gICAgICogVGhlIG9iamVjdCBoYXMgdHdvIHByb3BlcnRpZXM6IGBpbmRleGAgYW5kIGBzdGFydGAuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFRva2VuQXRcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyIHRvIHJldHJpZXZlIGZyb21cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHJldHJpZXZlIGZyb20uXG4gICAgICovXG4gICAgcHVibGljIGdldFRva2VuQXQocm93OiBudW1iZXIsIGNvbHVtbj86IG51bWJlcikge1xuICAgICAgICB2YXIgdG9rZW5zOiB7IHZhbHVlOiBzdHJpbmcgfVtdID0gdGhpcy5iZ1Rva2VuaXplci5nZXRUb2tlbnMocm93KTtcbiAgICAgICAgdmFyIHRva2VuOiB7IGluZGV4PzogbnVtYmVyOyBzdGFydD86IG51bWJlcjsgdmFsdWU6IHN0cmluZyB9O1xuICAgICAgICB2YXIgYyA9IDA7XG4gICAgICAgIGlmIChjb2x1bW4gPT0gbnVsbCkge1xuICAgICAgICAgICAgaSA9IHRva2Vucy5sZW5ndGggLSAxO1xuICAgICAgICAgICAgYyA9IHRoaXMuZ2V0TGluZShyb3cpLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgYyArPSB0b2tlbnNbaV0udmFsdWUubGVuZ3RoO1xuICAgICAgICAgICAgICAgIGlmIChjID49IGNvbHVtbilcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdG9rZW4gPSB0b2tlbnNbaV07XG4gICAgICAgIGlmICghdG9rZW4pXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgdG9rZW4uaW5kZXggPSBpO1xuICAgICAgICB0b2tlbi5zdGFydCA9IGMgLSB0b2tlbi52YWx1ZS5sZW5ndGg7XG4gICAgICAgIHJldHVybiB0b2tlbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSB1bmRvIG1hbmFnZXIuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIHNldFVuZG9NYW5hZ2VyXG4gICAgICogQHBhcmFtIHVuZG9NYW5hZ2VyIHtVbmRvTWFuYWdlcn0gVGhlIG5ldyB1bmRvIG1hbmFnZXIuXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgc2V0VW5kb01hbmFnZXIodW5kb01hbmFnZXI6IFVuZG9NYW5hZ2VyKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHVuZG9NYW5hZ2VyID0gdW5kb01hbmFnZXI7XG4gICAgICAgIHRoaXMuJGRlbHRhcyA9IFtdO1xuICAgICAgICB0aGlzLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgdGhpcy4kZGVsdGFzRm9sZCA9IFtdO1xuXG4gICAgICAgIGlmICh0aGlzLiRpbmZvcm1VbmRvTWFuYWdlcilcbiAgICAgICAgICAgIHRoaXMuJGluZm9ybVVuZG9NYW5hZ2VyLmNhbmNlbCgpO1xuXG4gICAgICAgIGlmICh1bmRvTWFuYWdlcikge1xuICAgICAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICAgICAgICB0aGlzLiRzeW5jSW5mb3JtVW5kb01hbmFnZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICBzZWxmLiRpbmZvcm1VbmRvTWFuYWdlci5jYW5jZWwoKTtcblxuICAgICAgICAgICAgICAgIGlmIChzZWxmLiRkZWx0YXNGb2xkLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBncm91cDogXCJmb2xkXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBkZWx0YXM6IHNlbGYuJGRlbHRhc0ZvbGRcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIHNlbGYuJGRlbHRhc0ZvbGQgPSBbXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzRG9jLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICBncm91cDogXCJkb2NcIixcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbHRhczogc2VsZi4kZGVsdGFzRG9jXG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXNEb2MgPSBbXTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoc2VsZi4kZGVsdGFzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdW5kb01hbmFnZXIuZXhlY3V0ZSh7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3Rpb246IFwiYWNldXBkYXRlXCIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhcmdzOiBbc2VsZi4kZGVsdGFzLCBzZWxmXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lcmdlOiBzZWxmLm1lcmdlVW5kb0RlbHRhc1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgc2VsZi5tZXJnZVVuZG9EZWx0YXMgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBzZWxmLiRkZWx0YXMgPSBbXTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICB0aGlzLiRpbmZvcm1VbmRvTWFuYWdlciA9IGRlbGF5ZWRDYWxsKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTdGFydHMgYSBuZXcgZ3JvdXAgaW4gdW5kbyBoaXN0b3J5LlxuICAgICAqXG4gICAgICogQG1ldGhvZCBtYXJrVW5kb0dyb3VwXG4gICAgICogQHJldHVybiB7dm9pZH1cbiAgICAgKi9cbiAgICBwdWJsaWMgbWFya1VuZG9Hcm91cCgpOiB2b2lkIHtcbiAgICAgICAgaWYgKHRoaXMuJHN5bmNJbmZvcm1VbmRvTWFuYWdlcikge1xuICAgICAgICAgICAgdGhpcy4kc3luY0luZm9ybVVuZG9NYW5hZ2VyKCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHVuZG8gbWFuYWdlci5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VW5kb01hbmFnZXJcbiAgICAgKiBAcmV0dXJuIHtVbmRvTWFuYWdlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VW5kb01hbmFnZXIoKTogVW5kb01hbmFnZXIge1xuICAgICAgICAvLyBGSVhNRTogV2FudCBzaW1wbGUgQVBJLCBkb24ndCB3YW50IHRvIGNhc3QuXG4gICAgICAgIHJldHVybiB0aGlzLiR1bmRvTWFuYWdlciB8fCA8VW5kb01hbmFnZXI+dGhpcy4kZGVmYXVsdFVuZG9NYW5hZ2VyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdmFsdWUgZm9yIHRhYnMuXG4gICAgICogSWYgdGhlIHVzZXIgaXMgdXNpbmcgc29mdCB0YWJzLCB0aGlzIHdpbGwgYmUgYSBzZXJpZXMgb2Ygc3BhY2VzIChkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU2l6ZSBgZ2V0VGFiU2l6ZSgpYF1dKTsgb3RoZXJ3aXNlIGl0J3Mgc2ltcGx5IGAnXFx0J2AuXG4gICAgICpcbiAgICAgKiBAbWV0aG9kIGdldFRhYlN0cmluZ1xuICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0VGFiU3RyaW5nKCk6IHN0cmluZyB7XG4gICAgICAgIGlmICh0aGlzLmdldFVzZVNvZnRUYWJzKCkpIHtcbiAgICAgICAgICAgIHJldHVybiBzdHJpbmdSZXBlYXQoXCIgXCIsIHRoaXMuZ2V0VGFiU2l6ZSgpKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBcIlxcdFwiO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUGFzcyBgdHJ1ZWAgdG8gZW5hYmxlIHRoZSB1c2Ugb2Ygc29mdCB0YWJzLlxuICAgICAqIFNvZnQgdGFicyBtZWFucyB5b3UncmUgdXNpbmcgc3BhY2VzIGluc3RlYWQgb2YgdGhlIHRhYiBjaGFyYWN0ZXIgKGAnXFx0J2ApLlxuICAgICAqXG4gICAgICogQG1ldGhvZCBzZXRVc2VTb2Z0VGFic1xuICAgICAqIEBwYXJhbSB1c2VTb2Z0VGFicyB7Ym9vbGVhbn0gVmFsdWUgaW5kaWNhdGluZyB3aGV0aGVyIG9yIG5vdCB0byB1c2Ugc29mdCB0YWJzLlxuICAgICAqIEByZXR1cm4ge0VkaXRTZXNzaW9ufVxuICAgICAqIEBjaGFpbmFibGVcbiAgICAgKi9cbiAgICBwcml2YXRlIHNldFVzZVNvZnRUYWJzKHVzZVNvZnRUYWJzOiBib29sZWFuKTogRWRpdFNlc3Npb24ge1xuICAgICAgICB0aGlzLnNldE9wdGlvbihcInVzZVNvZnRUYWJzXCIsIHVzZVNvZnRUYWJzKTtcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgc29mdCB0YWJzIGFyZSBiZWluZyB1c2VkLCBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAgKlxuICAgICAqIEBtZXRob2QgZ2V0VXNlU29mdFRhYnNcbiAgICAgKiBAcmV0dXJuIHtib29sZWFufVxuICAgICAqL1xuICAgIHB1YmxpYyBnZXRVc2VTb2Z0VGFicygpOiBib29sZWFuIHtcbiAgICAgICAgLy8gdG9kbyBtaWdodCBuZWVkIG1vcmUgZ2VuZXJhbCB3YXkgZm9yIGNoYW5naW5nIHNldHRpbmdzIGZyb20gbW9kZSwgYnV0IHRoaXMgaXMgb2sgZm9yIG5vd1xuICAgICAgICByZXR1cm4gdGhpcy4kdXNlU29mdFRhYnMgJiYgIXRoaXMuJG1vZGUuJGluZGVudFdpdGhUYWJzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0IHRoZSBudW1iZXIgb2Ygc3BhY2VzIHRoYXQgZGVmaW5lIGEgc29mdCB0YWIuXG4gICAgKiBGb3IgZXhhbXBsZSwgcGFzc2luZyBpbiBgNGAgdHJhbnNmb3JtcyB0aGUgc29mdCB0YWJzIHRvIGJlIGVxdWl2YWxlbnQgdG8gZm91ciBzcGFjZXMuXG4gICAgKiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdHMgdGhlIGBjaGFuZ2VUYWJTaXplYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSB0YWJTaXplIFRoZSBuZXcgdGFiIHNpemVcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFRhYlNpemUodGFiU2l6ZTogbnVtYmVyKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwidGFiU2l6ZVwiLCB0YWJTaXplKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgdGFiIHNpemUuXG4gICAgKiovXG4gICAgcHVibGljIGdldFRhYlNpemUoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHRhYlNpemU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgY2hhcmFjdGVyIGF0IHRoZSBwb3NpdGlvbiBpcyBhIHNvZnQgdGFiLlxuICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB0byBjaGVja1xuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGlzVGFiU3RvcChwb3NpdGlvbjogeyBjb2x1bW46IG51bWJlciB9KSB7XG4gICAgICAgIHJldHVybiB0aGlzLiR1c2VTb2Z0VGFicyAmJiAocG9zaXRpb24uY29sdW1uICUgdGhpcy4kdGFiU2l6ZSA9PT0gMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBQYXNzIGluIGB0cnVlYCB0byBlbmFibGUgb3ZlcndyaXRlcyBpbiB5b3VyIHNlc3Npb24sIG9yIGBmYWxzZWAgdG8gZGlzYWJsZS5cbiAgICAqXG4gICAgKiBJZiBvdmVyd3JpdGVzIGlzIGVuYWJsZWQsIGFueSB0ZXh0IHlvdSBlbnRlciB3aWxsIHR5cGUgb3ZlciBhbnkgdGV4dCBhZnRlciBpdC4gSWYgdGhlIHZhbHVlIG9mIGBvdmVyd3JpdGVgIGNoYW5nZXMsIHRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGBjaGFuZ2VPdmVyd3JpdGVgIGV2ZW50LlxuICAgICpcbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gb3ZlcndyaXRlIERlZmluZXMgd2hldGhlciBvciBub3QgdG8gc2V0IG92ZXJ3cml0ZXNcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBzZXRPdmVyd3JpdGUob3ZlcndyaXRlOiBib29sZWFuKSB7XG4gICAgICAgIHRoaXMuc2V0T3B0aW9uKFwib3ZlcndyaXRlXCIsIG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGB0cnVlYCBpZiBvdmVyd3JpdGVzIGFyZSBlbmFibGVkOyBgZmFsc2VgIG90aGVyd2lzZS5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0T3ZlcndyaXRlKCk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gdGhpcy4kb3ZlcndyaXRlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyB0aGUgdmFsdWUgb2Ygb3ZlcndyaXRlIHRvIHRoZSBvcHBvc2l0ZSBvZiB3aGF0ZXZlciBpdCBjdXJyZW50bHkgaXMuXG4gICAgKiovXG4gICAgcHVibGljIHRvZ2dsZU92ZXJ3cml0ZSgpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5zZXRPdmVyd3JpdGUoIXRoaXMuJG92ZXJ3cml0ZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQWRkcyBgY2xhc3NOYW1lYCB0byB0aGUgYHJvd2AsIHRvIGJlIHVzZWQgZm9yIENTUyBzdHlsaW5ncyBhbmQgd2hhdG5vdC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIGFkZEd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIGlmICghdGhpcy4kZGVjb3JhdGlvbnNbcm93XSkge1xuICAgICAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZGVjb3JhdGlvbnNbcm93XSArPSBcIiBcIiArIGNsYXNzTmFtZTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmVtb3ZlcyBgY2xhc3NOYW1lYCBmcm9tIHRoZSBgcm93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgbnVtYmVyXG4gICAgICogQHBhcmFtIHtTdHJpbmd9IGNsYXNzTmFtZSBUaGUgY2xhc3MgdG8gYWRkXG4gICAgICovXG4gICAgcHVibGljIHJlbW92ZUd1dHRlckRlY29yYXRpb24ocm93OiBudW1iZXIsIGNsYXNzTmFtZTogc3RyaW5nKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJGRlY29yYXRpb25zW3Jvd10gPSAodGhpcy4kZGVjb3JhdGlvbnNbcm93XSB8fCBcIlwiKS5yZXBsYWNlKFwiIFwiICsgY2xhc3NOYW1lLCBcIlwiKTtcbiAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQnJlYWtwb2ludFwiLCB7fSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIG51bWJlcnMsIGluZGljYXRpbmcgd2hpY2ggcm93cyBoYXZlIGJyZWFrcG9pbnRzLlxuICAgICogQHJldHVybiB7W051bWJlcl19XG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRCcmVha3BvaW50cygpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyZWFrcG9pbnRzO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyBhIGJyZWFrcG9pbnQgb24gZXZlcnkgcm93IG51bWJlciBnaXZlbiBieSBgcm93c2AuIFRoaXMgZnVuY3Rpb24gYWxzbyBlbWl0ZXMgdGhlIGAnY2hhbmdlQnJlYWtwb2ludCdgIGV2ZW50LlxuICAgICogQHBhcmFtIHtBcnJheX0gcm93cyBBbiBhcnJheSBvZiByb3cgaW5kaWNlc1xuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0QnJlYWtwb2ludHMocm93czogbnVtYmVyW10pOiB2b2lkIHtcbiAgICAgICAgdGhpcy4kYnJlYWtwb2ludHMgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByb3dzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLiRicmVha3BvaW50c1tyb3dzW2ldXSA9IFwiYWNlX2JyZWFrcG9pbnRcIjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJlbW92ZXMgYWxsIGJyZWFrcG9pbnRzIG9uIHRoZSByb3dzLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGNsZWFyQnJlYWtwb2ludHMoKSB7XG4gICAgICAgIHRoaXMuJGJyZWFrcG9pbnRzID0gW107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2V0cyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGFzc05hbWUgQ2xhc3Mgb2YgdGhlIGJyZWFrcG9pbnRcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0QnJlYWtwb2ludChyb3c6IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgY2xhc3NOYW1lID0gXCJhY2VfYnJlYWtwb2ludFwiO1xuICAgICAgICBpZiAoY2xhc3NOYW1lKVxuICAgICAgICAgICAgdGhpcy4kYnJlYWtwb2ludHNbcm93XSA9IGNsYXNzTmFtZTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuJGJyZWFrcG9pbnRzW3Jvd107XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUJyZWFrcG9pbnRcIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmVtb3ZlcyBhIGJyZWFrcG9pbnQgb24gdGhlIHJvdyBudW1iZXIgZ2l2ZW4gYnkgYHJvd3NgLiBUaGlzIGZ1bmN0aW9uIGFsc28gZW1pdGVzIHRoZSBgJ2NoYW5nZUJyZWFrcG9pbnQnYCBldmVudC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSByb3cgQSByb3cgaW5kZXhcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgY2xlYXJCcmVha3BvaW50KHJvdzogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLiRicmVha3BvaW50c1tyb3ddO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIsIHt9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEFkZHMgYSBuZXcgbWFya2VyIHRvIHRoZSBnaXZlbiBgUmFuZ2VgLiBJZiBgaW5Gcm9udGAgaXMgYHRydWVgLCBhIGZyb250IG1hcmtlciBpcyBkZWZpbmVkLCBhbmQgdGhlIGAnY2hhbmdlRnJvbnRNYXJrZXInYCBldmVudCBmaXJlczsgb3RoZXJ3aXNlLCB0aGUgYCdjaGFuZ2VCYWNrTWFya2VyJ2AgZXZlbnQgZmlyZXMuXG4gICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBEZWZpbmUgdGhlIHJhbmdlIG9mIHRoZSBtYXJrZXJcbiAgICAqIEBwYXJhbSB7U3RyaW5nfSBjbGF6eiBTZXQgdGhlIENTUyBjbGFzcyBmb3IgdGhlIG1hcmtlclxuICAgICogQHBhcmFtIHtGdW5jdGlvbiB8IFN0cmluZ30gdHlwZSBJZGVudGlmeSB0aGUgdHlwZSBvZiB0aGUgbWFya2VyLlxuICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgKlxuICAgICpcbiAgICAqIEByZXR1cm4ge051bWJlcn0gVGhlIG5ldyBtYXJrZXIgaWRcbiAgICAqKi9cbiAgICBwdWJsaWMgYWRkTWFya2VyKHJhbmdlOiBSYW5nZSwgY2xheno6IHN0cmluZywgdHlwZTogc3RyaW5nLCBpbkZyb250PzogYm9vbGVhbik6IG51bWJlciB7XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG5cbiAgICAgICAgLy8gRklYTUU6IE5lZWQgbW9yZSB0eXBlIHNhZmV0eSBoZXJlLlxuICAgICAgICB2YXIgbWFya2VyID0ge1xuICAgICAgICAgICAgcmFuZ2U6IHJhbmdlLFxuICAgICAgICAgICAgdHlwZTogdHlwZSB8fCBcImxpbmVcIixcbiAgICAgICAgICAgIHJlbmRlcmVyOiB0eXBlb2YgdHlwZSA9PT0gXCJmdW5jdGlvblwiID8gdHlwZSA6IG51bGwsXG4gICAgICAgICAgICBjbGF6ejogY2xhenosXG4gICAgICAgICAgICBpbkZyb250OiAhIWluRnJvbnQsXG4gICAgICAgICAgICBpZDogaWRcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpZDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBBZGRzIGEgZHluYW1pYyBtYXJrZXIgdG8gdGhlIHNlc3Npb24uXG4gICAgICogQHBhcmFtIHtPYmplY3R9IG1hcmtlciBvYmplY3Qgd2l0aCB1cGRhdGUgbWV0aG9kXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBpbkZyb250IFNldCB0byBgdHJ1ZWAgdG8gZXN0YWJsaXNoIGEgZnJvbnQgbWFya2VyXG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIGFkZGVkIG1hcmtlclxuICAgICAqKi9cbiAgICBwcml2YXRlIGFkZER5bmFtaWNNYXJrZXIobWFya2VyLCBpbkZyb250Pykge1xuICAgICAgICBpZiAoIW1hcmtlci51cGRhdGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHZhciBpZCA9IHRoaXMuJG1hcmtlcklkKys7XG4gICAgICAgIG1hcmtlci5pZCA9IGlkO1xuICAgICAgICBtYXJrZXIuaW5Gcm9udCA9ICEhaW5Gcm9udDtcblxuICAgICAgICBpZiAoaW5Gcm9udCkge1xuICAgICAgICAgICAgdGhpcy4kZnJvbnRNYXJrZXJzW2lkXSA9IG1hcmtlcjtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUZyb250TWFya2VyXCIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy4kYmFja01hcmtlcnNbaWRdID0gbWFya2VyO1xuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlQmFja01hcmtlclwiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtYXJrZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZW1vdmVzIHRoZSBtYXJrZXIgd2l0aCB0aGUgc3BlY2lmaWVkIElELiBJZiB0aGlzIG1hcmtlciB3YXMgaW4gZnJvbnQsIHRoZSBgJ2NoYW5nZUZyb250TWFya2VyJ2AgZXZlbnQgaXMgZW1pdHRlZC4gSWYgdGhlIG1hcmtlciB3YXMgaW4gdGhlIGJhY2ssIHRoZSBgJ2NoYW5nZUJhY2tNYXJrZXInYCBldmVudCBpcyBlbWl0dGVkLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IG1hcmtlcklkIEEgbnVtYmVyIHJlcHJlc2VudGluZyBhIG1hcmtlclxuICAgICpcbiAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyByZW1vdmVNYXJrZXIobWFya2VySWQ6IG51bWJlcik6IHZvaWQge1xuICAgICAgICB2YXIgbWFya2VyID0gdGhpcy4kZnJvbnRNYXJrZXJzW21hcmtlcklkXSB8fCB0aGlzLiRiYWNrTWFya2Vyc1ttYXJrZXJJZF07XG4gICAgICAgIGlmICghbWFya2VyKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHZhciBtYXJrZXJzID0gbWFya2VyLmluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICAgICAgaWYgKG1hcmtlcikge1xuICAgICAgICAgICAgZGVsZXRlIChtYXJrZXJzW21hcmtlcklkXSk7XG4gICAgICAgICAgICB0aGlzLl9zaWduYWwobWFya2VyLmluRnJvbnQgPyBcImNoYW5nZUZyb250TWFya2VyXCIgOiBcImNoYW5nZUJhY2tNYXJrZXJcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYW4gYXJyYXkgY29udGFpbmluZyB0aGUgSURzIG9mIGFsbCB0aGUgbWFya2VycywgZWl0aGVyIGZyb250IG9yIGJhY2suXG4gICAgKiBAcGFyYW0ge2Jvb2xlYW59IGluRnJvbnQgSWYgYHRydWVgLCBpbmRpY2F0ZXMgeW91IG9ubHkgd2FudCBmcm9udCBtYXJrZXJzOyBgZmFsc2VgIGluZGljYXRlcyBvbmx5IGJhY2sgbWFya2Vyc1xuICAgICpcbiAgICAqIEByZXR1cm4ge0FycmF5fVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRNYXJrZXJzKGluRnJvbnQ6IGJvb2xlYW4pIHtcbiAgICAgICAgcmV0dXJuIGluRnJvbnQgPyB0aGlzLiRmcm9udE1hcmtlcnMgOiB0aGlzLiRiYWNrTWFya2VycztcbiAgICB9XG5cbiAgICBwdWJsaWMgaGlnaGxpZ2h0KHJlOiBSZWdFeHApIHtcbiAgICAgICAgaWYgKCF0aGlzLiRzZWFyY2hIaWdobGlnaHQpIHtcbiAgICAgICAgICAgIHZhciBoaWdobGlnaHQgPSBuZXcgU2VhcmNoSGlnaGxpZ2h0KG51bGwsIFwiYWNlX3NlbGVjdGVkLXdvcmRcIiwgXCJ0ZXh0XCIpO1xuICAgICAgICAgICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0ID0gdGhpcy5hZGREeW5hbWljTWFya2VyKGhpZ2hsaWdodCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kc2VhcmNoSGlnaGxpZ2h0LnNldFJlZ2V4cChyZSk7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSBoaWdobGlnaHRMaW5lcyhzdGFydFJvdzogbnVtYmVyLCBlbmRSb3c6IG51bWJlciwgY2xheno6IHN0cmluZyA9IFwiYWNlX3N0ZXBcIiwgaW5Gcm9udD86IGJvb2xlYW4pOiBSYW5nZSB7XG4gICAgICAgIHZhciByYW5nZTogUmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRSb3csIDAsIGVuZFJvdywgSW5maW5pdHkpO1xuICAgICAgICByYW5nZS5tYXJrZXJJZCA9IHRoaXMuYWRkTWFya2VyKHJhbmdlLCBjbGF6eiwgXCJmdWxsTGluZVwiLCBpbkZyb250KTtcbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qXG4gICAgICogRXJyb3I6XG4gICAgICogIHtcbiAgICAgKiAgICByb3c6IDEyLFxuICAgICAqICAgIGNvbHVtbjogMiwgLy9jYW4gYmUgdW5kZWZpbmVkXG4gICAgICogICAgdGV4dDogXCJNaXNzaW5nIGFyZ3VtZW50XCIsXG4gICAgICogICAgdHlwZTogXCJlcnJvclwiIC8vIG9yIFwid2FybmluZ1wiIG9yIFwiaW5mb1wiXG4gICAgICogIH1cbiAgICAgKi9cbiAgICAvKipcbiAgICAqIFNldHMgYW5ub3RhdGlvbnMgZm9yIHRoZSBgRWRpdFNlc3Npb25gLiBUaGlzIGZ1bmN0aW9ucyBlbWl0cyB0aGUgYCdjaGFuZ2VBbm5vdGF0aW9uJ2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge0FycmF5fSBhbm5vdGF0aW9ucyBBIGxpc3Qgb2YgYW5ub3RhdGlvbnNcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIHNldEFubm90YXRpb25zKGFubm90YXRpb25zKSB7XG4gICAgICAgIHRoaXMuJGFubm90YXRpb25zID0gYW5ub3RhdGlvbnM7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZUFubm90YXRpb25cIiwge30pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgYW5ub3RhdGlvbnMgZm9yIHRoZSBgRWRpdFNlc3Npb25gLlxuICAgICogQHJldHVybiB7QXJyYXl9XG4gICAgKiovXG4gICAgcHVibGljIGdldEFubm90YXRpb25zID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRhbm5vdGF0aW9ucyB8fCBbXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDbGVhcnMgYWxsIHRoZSBhbm5vdGF0aW9ucyBmb3IgdGhpcyBzZXNzaW9uLlxuICAgICAqIFRoaXMgZnVuY3Rpb24gYWxzbyB0cmlnZ2VycyB0aGUgYCdjaGFuZ2VBbm5vdGF0aW9uJ2AgZXZlbnQuXG4gICAgICogVGhpcyBpcyBjYWxsZWQgYnkgdGhlIGxhbmd1YWdlIG1vZGVzIHdoZW4gdGhlIHdvcmtlciB0ZXJtaW5hdGVzLlxuICAgICAqL1xuICAgIHB1YmxpYyBjbGVhckFubm90YXRpb25zKCkge1xuICAgICAgICB0aGlzLnNldEFubm90YXRpb25zKFtdKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIElmIGB0ZXh0YCBjb250YWlucyBlaXRoZXIgdGhlIG5ld2xpbmUgKGBcXG5gKSBvciBjYXJyaWFnZS1yZXR1cm4gKCdcXHInKSBjaGFyYWN0ZXJzLCBgJGF1dG9OZXdMaW5lYCBzdG9yZXMgdGhhdCB2YWx1ZS5cbiAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgYmxvY2sgb2YgdGV4dFxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlICRkZXRlY3ROZXdMaW5lKHRleHQ6IHN0cmluZykge1xuICAgICAgICB2YXIgbWF0Y2ggPSB0ZXh0Lm1hdGNoKC9eLio/KFxccj9cXG4pL20pO1xuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIHRoaXMuJGF1dG9OZXdMaW5lID0gbWF0Y2hbMV07XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB0aGlzLiRhdXRvTmV3TGluZSA9IFwiXFxuXCI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdpdmVuIGEgc3RhcnRpbmcgcm93IGFuZCBjb2x1bW4sIHRoaXMgbWV0aG9kIHJldHVybnMgdGhlIGBSYW5nZWAgb2YgdGhlIGZpcnN0IHdvcmQgYm91bmRhcnkgaXQgZmluZHMuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gcm93IFRoZSByb3cgdG8gc3RhcnQgYXRcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBjb2x1bW4gVGhlIGNvbHVtbiB0byBzdGFydCBhdFxuICAgICpcbiAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRXb3JkUmFuZ2Uocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgbGluZTogc3RyaW5nID0gdGhpcy5nZXRMaW5lKHJvdyk7XG5cbiAgICAgICAgdmFyIGluVG9rZW4gPSBmYWxzZTtcbiAgICAgICAgaWYgKGNvbHVtbiA+IDApXG4gICAgICAgICAgICBpblRva2VuID0gISFsaW5lLmNoYXJBdChjb2x1bW4gLSAxKS5tYXRjaCh0aGlzLnRva2VuUmUpO1xuXG4gICAgICAgIGlmICghaW5Ub2tlbilcbiAgICAgICAgICAgIGluVG9rZW4gPSAhIWxpbmUuY2hhckF0KGNvbHVtbikubWF0Y2godGhpcy50b2tlblJlKTtcblxuICAgICAgICBpZiAoaW5Ub2tlbilcbiAgICAgICAgICAgIHZhciByZSA9IHRoaXMudG9rZW5SZTtcbiAgICAgICAgZWxzZSBpZiAoL15cXHMrJC8udGVzdChsaW5lLnNsaWNlKGNvbHVtbiAtIDEsIGNvbHVtbiArIDEpKSlcbiAgICAgICAgICAgIHZhciByZSA9IC9cXHMvO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICB2YXIgcmUgPSB0aGlzLm5vblRva2VuUmU7XG5cbiAgICAgICAgdmFyIHN0YXJ0ID0gY29sdW1uO1xuICAgICAgICBpZiAoc3RhcnQgPiAwKSB7XG4gICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgc3RhcnQtLTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdoaWxlIChzdGFydCA+PSAwICYmIGxpbmUuY2hhckF0KHN0YXJ0KS5tYXRjaChyZSkpO1xuICAgICAgICAgICAgc3RhcnQrKztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBlbmQgPSBjb2x1bW47XG4gICAgICAgIHdoaWxlIChlbmQgPCBsaW5lLmxlbmd0aCAmJiBsaW5lLmNoYXJBdChlbmQpLm1hdGNoKHJlKSkge1xuICAgICAgICAgICAgZW5kKys7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHJvdywgc3RhcnQsIHJvdywgZW5kKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdldHMgdGhlIHJhbmdlIG9mIGEgd29yZCwgaW5jbHVkaW5nIGl0cyByaWdodCB3aGl0ZXNwYWNlLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBzdGFydCBmcm9tXG4gICAgKiBAcGFyYW0ge051bWJlcn0gY29sdW1uIFRoZSBjb2x1bW4gbnVtYmVyIHRvIHN0YXJ0IGZyb21cbiAgICAqXG4gICAgKiBAcmV0dXJuIHtSYW5nZX1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0QVdvcmRSYW5nZShyb3c6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBSYW5nZSB7XG4gICAgICAgIHZhciB3b3JkUmFuZ2UgPSB0aGlzLmdldFdvcmRSYW5nZShyb3csIGNvbHVtbik7XG4gICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKHdvcmRSYW5nZS5lbmQucm93KTtcblxuICAgICAgICB3aGlsZSAobGluZS5jaGFyQXQod29yZFJhbmdlLmVuZC5jb2x1bW4pLm1hdGNoKC9bIFxcdF0vKSkge1xuICAgICAgICAgICAgd29yZFJhbmdlLmVuZC5jb2x1bW4gKz0gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB3b3JkUmFuZ2U7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiB7OkVkaXRvckRvY3VtZW50LnNldE5ld0xpbmVNb2RlLmRlc2N9XG4gICAgKiBAcGFyYW0ge1N0cmluZ30gbmV3TGluZU1vZGUgezpFZGl0b3JEb2N1bWVudC5zZXROZXdMaW5lTW9kZS5wYXJhbX1cbiAgICAqXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuc2V0TmV3TGluZU1vZGVcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldE5ld0xpbmVNb2RlKG5ld0xpbmVNb2RlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUobmV3TGluZU1vZGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICpcbiAgICAqIFJldHVybnMgdGhlIGN1cnJlbnQgbmV3IGxpbmUgbW9kZS5cbiAgICAqIEByZXR1cm4ge1N0cmluZ31cbiAgICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50LmdldE5ld0xpbmVNb2RlXG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXROZXdMaW5lTW9kZSgpOiBzdHJpbmcge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TmV3TGluZU1vZGUoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIElkZW50aWZpZXMgaWYgeW91IHdhbnQgdG8gdXNlIGEgd29ya2VyIGZvciB0aGUgYEVkaXRTZXNzaW9uYC5cbiAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gdXNlV29ya2VyIFNldCB0byBgdHJ1ZWAgdG8gdXNlIGEgd29ya2VyXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VXNlV29ya2VyKHVzZVdvcmtlcjogYm9vbGVhbikgeyB0aGlzLnNldE9wdGlvbihcInVzZVdvcmtlclwiLCB1c2VXb3JrZXIpOyB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgYHRydWVgIGlmIHdvcmtlcnMgYXJlIGJlaW5nIHVzZWQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBnZXRVc2VXb3JrZXIoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLiR1c2VXb3JrZXI7IH1cblxuICAgIC8qKlxuICAgICogUmVsb2FkcyBhbGwgdGhlIHRva2VucyBvbiB0aGUgY3VycmVudCBzZXNzaW9uLiBUaGlzIGZ1bmN0aW9uIGNhbGxzIFtbQmFja2dyb3VuZFRva2VuaXplci5zdGFydCBgQmFja2dyb3VuZFRva2VuaXplci5zdGFydCAoKWBdXSB0byBhbGwgdGhlIHJvd3M7IGl0IGFsc28gZW1pdHMgdGhlIGAndG9rZW5pemVyVXBkYXRlJ2AgZXZlbnQuXG4gICAgKiovXG4gICAgcHJpdmF0ZSBvblJlbG9hZFRva2VuaXplcihlKSB7XG4gICAgICAgIHZhciByb3dzID0gZS5kYXRhO1xuICAgICAgICB0aGlzLmJnVG9rZW5pemVyLnN0YXJ0KHJvd3MuZmlyc3QpO1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJ0b2tlbml6ZXJVcGRhdGVcIiwgZSk7XG4gICAgfVxuXG5cbiAgICAvKipcbiAgICAqIFNldHMgYSBuZXcgdGV4dCBtb2RlIGZvciB0aGUgYEVkaXRTZXNzaW9uYC4gVGhpcyBtZXRob2QgYWxzbyBlbWl0cyB0aGUgYCdjaGFuZ2VNb2RlJ2AgZXZlbnQuIElmIGEgW1tCYWNrZ3JvdW5kVG9rZW5pemVyIGBCYWNrZ3JvdW5kVG9rZW5pemVyYF1dIGlzIHNldCwgdGhlIGAndG9rZW5pemVyVXBkYXRlJ2AgZXZlbnQgaXMgYWxzbyBlbWl0dGVkLlxuICAgICogQHBhcmFtIHtUZXh0TW9kZX0gbW9kZSBTZXQgYSBuZXcgdGV4dCBtb2RlXG4gICAgKiBAcGFyYW0ge2NifSBvcHRpb25hbCBjYWxsYmFja1xuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldE1vZGUobW9kZSwgY2I/OiAoKSA9PiBhbnkpOiB2b2lkIHtcbiAgICAgICAgaWYgKG1vZGUgJiYgdHlwZW9mIG1vZGUgPT09IFwib2JqZWN0XCIpIHtcbiAgICAgICAgICAgIGlmIChtb2RlLmdldFRva2VuaXplcikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiRvbkNoYW5nZU1vZGUobW9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IG1vZGU7XG4gICAgICAgICAgICB2YXIgcGF0aCA9IG9wdGlvbnMucGF0aDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHBhdGggPSBtb2RlIHx8IFwiYWNlL21vZGUvdGV4dFwiO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhpcyBpcyBuZWVkZWQgaWYgYWNlIGlzbid0IG9uIHJlcXVpcmUgcGF0aCAoZS5nIHRlc3RzIGluIG5vZGUpXG4gICAgICAgIGlmICghdGhpcy4kbW9kZXNbXCJhY2UvbW9kZS90ZXh0XCJdKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2Rlc1tcImFjZS9tb2RlL3RleHRcIl0gPSBuZXcgTW9kZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMuJG1vZGVzW3BhdGhdICYmICFvcHRpb25zKSB7XG4gICAgICAgICAgICB0aGlzLiRvbkNoYW5nZU1vZGUodGhpcy4kbW9kZXNbcGF0aF0pO1xuICAgICAgICAgICAgY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBsb2FkIG9uIGRlbWFuZFxuICAgICAgICB0aGlzLiRtb2RlSWQgPSBwYXRoO1xuICAgICAgICBsb2FkTW9kdWxlKFtcIm1vZGVcIiwgcGF0aF0sIGZ1bmN0aW9uKG06IGFueSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuJG1vZGVJZCAhPT0gcGF0aClcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IgJiYgY2IoKTtcbiAgICAgICAgICAgIGlmICh0aGlzLiRtb2Rlc1twYXRoXSAmJiAhb3B0aW9ucylcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW3BhdGhdKTtcbiAgICAgICAgICAgIGlmIChtICYmIG0uTW9kZSkge1xuICAgICAgICAgICAgICAgIG0gPSBuZXcgbS5Nb2RlKG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIGlmICghb3B0aW9ucykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRtb2Rlc1twYXRoXSA9IG07XG4gICAgICAgICAgICAgICAgICAgIG0uJGlkID0gcGF0aDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKG0pO1xuICAgICAgICAgICAgICAgIGNiICYmIGNiKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAgICAgLy8gc2V0IG1vZGUgdG8gdGV4dCB1bnRpbCBsb2FkaW5nIGlzIGZpbmlzaGVkXG4gICAgICAgIGlmICghdGhpcy4kbW9kZSkge1xuICAgICAgICAgICAgdGhpcy4kb25DaGFuZ2VNb2RlKHRoaXMuJG1vZGVzW1wiYWNlL21vZGUvdGV4dFwiXSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRvbkNoYW5nZU1vZGUobW9kZTogTW9kZSwgJGlzUGxhY2Vob2xkZXI/OiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIGlmICghJGlzUGxhY2Vob2xkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJG1vZGVJZCA9IG1vZGUuJGlkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLiRtb2RlID09PSBtb2RlKSB7XG4gICAgICAgICAgICAvLyBOb3RoaW5nIHRvIGRvLiBCZSBpZGVtcG90ZW50LlxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy4kbW9kZSA9IG1vZGU7XG5cbiAgICAgICAgLy8gVE9ETzogV291bGRuJ3QgaXQgbWFrZSBtb3JlIHNlbnNlIHRvIHN0b3AgdGhlIHdvcmtlciwgdGhlbiBjaGFuZ2UgdGhlIG1vZGU/XG4gICAgICAgIHRoaXMuJHN0b3BXb3JrZXIoKTtcblxuICAgICAgICBpZiAodGhpcy4kdXNlV29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiRzdGFydFdvcmtlcigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRva2VuaXplciA9IG1vZGUuZ2V0VG9rZW5pemVyKCk7XG5cbiAgICAgICAgaWYgKHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHZhciBvblJlbG9hZFRva2VuaXplciA9IHRoaXMub25SZWxvYWRUb2tlbml6ZXIuYmluZCh0aGlzKTtcbiAgICAgICAgICAgIHRva2VuaXplclsnYWRkRXZlbnRMaXN0ZW5lciddKFwidXBkYXRlXCIsIG9uUmVsb2FkVG9rZW5pemVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5iZ1Rva2VuaXplcikge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplciA9IG5ldyBCYWNrZ3JvdW5kVG9rZW5pemVyKHRva2VuaXplcik7XG4gICAgICAgICAgICB2YXIgX3NlbGYgPSB0aGlzO1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5vbihcInVwZGF0ZVwiLCBmdW5jdGlvbihldmVudCwgYmc6IEJhY2tncm91bmRUb2tlbml6ZXIpIHtcbiAgICAgICAgICAgICAgICBfc2VsZi5fc2lnbmFsKFwidG9rZW5pemVyVXBkYXRlXCIsIGV2ZW50KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zZXRUb2tlbml6ZXIodG9rZW5pemVyKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYmdUb2tlbml6ZXIuc2V0RG9jdW1lbnQodGhpcy5nZXREb2N1bWVudCgpKTtcblxuICAgICAgICB0aGlzLnRva2VuUmUgPSBtb2RlLnRva2VuUmU7XG4gICAgICAgIHRoaXMubm9uVG9rZW5SZSA9IG1vZGUubm9uVG9rZW5SZTtcblxuXG4gICAgICAgIGlmICghJGlzUGxhY2Vob2xkZXIpIHtcbiAgICAgICAgICAgIHRoaXMuJG9wdGlvbnMud3JhcE1ldGhvZC5zZXQuY2FsbCh0aGlzLCB0aGlzLiR3cmFwTWV0aG9kKTtcbiAgICAgICAgICAgIHRoaXMuJHNldEZvbGRpbmcobW9kZS5mb2xkaW5nUnVsZXMpO1xuICAgICAgICAgICAgdGhpcy5iZ1Rva2VuaXplci5zdGFydCgwKTtcbiAgICAgICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VNb2RlXCIpO1xuICAgICAgICB9XG4gICAgfVxuXG5cbiAgICBwcml2YXRlICRzdG9wV29ya2VyKCkge1xuICAgICAgICBpZiAodGhpcy4kd29ya2VyKSB7XG4gICAgICAgICAgICB0aGlzLiR3b3JrZXIudGVybWluYXRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kd29ya2VyID0gbnVsbDtcbiAgICB9XG5cbiAgICBwcml2YXRlICRzdGFydFdvcmtlcigpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHRoaXMuJHdvcmtlciA9IHRoaXMuJG1vZGUuY3JlYXRlV29ya2VyKHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGNhdGNoIChlKSB7XG4gICAgICAgICAgICB0aGlzLiR3b3JrZXIgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSBjdXJyZW50IHRleHQgbW9kZS5cbiAgICAqIEByZXR1cm4ge1RleHRNb2RlfSBUaGUgY3VycmVudCB0ZXh0IG1vZGVcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0TW9kZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vZGU7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBUaGlzIGZ1bmN0aW9uIHNldHMgdGhlIHNjcm9sbCB0b3AgdmFsdWUuIEl0IGFsc28gZW1pdHMgdGhlIGAnY2hhbmdlU2Nyb2xsVG9wJ2AgZXZlbnQuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gc2Nyb2xsVG9wIFRoZSBuZXcgc2Nyb2xsIHRvcCB2YWx1ZVxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG4gICAgICAgIC8vIFRPRE86IHNob3VsZCB3ZSBmb3JjZSBpbnRlZ2VyIGxpbmVoZWlnaHQgaW5zdGVhZD8gc2Nyb2xsVG9wID0gTWF0aC5yb3VuZChzY3JvbGxUb3ApOyBcbiAgICAgICAgaWYgKHRoaXMuJHNjcm9sbFRvcCA9PT0gc2Nyb2xsVG9wIHx8IGlzTmFOKHNjcm9sbFRvcCkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLiRzY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG4gICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVNjcm9sbFRvcFwiLCBzY3JvbGxUb3ApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1JldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSB0b3Agb2YgdGhlIGVkaXRvciBhbmQgdGhlIHRvcG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uZ2V0U2Nyb2xsVG9wfVxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHNjcm9sbFRvcDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFtTZXRzIHRoZSB2YWx1ZSBvZiB0aGUgZGlzdGFuY2UgYmV0d2VlbiB0aGUgbGVmdCBvZiB0aGUgZWRpdG9yIGFuZCB0aGUgbGVmdG1vc3QgcGFydCBvZiB0aGUgdmlzaWJsZSBjb250ZW50Ll17OiAjRWRpdFNlc3Npb24uc2V0U2Nyb2xsTGVmdH1cbiAgICAqKi9cbiAgICBwdWJsaWMgc2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpIHtcbiAgICAgICAgLy8gc2Nyb2xsTGVmdCA9IE1hdGgucm91bmQoc2Nyb2xsTGVmdCk7XG4gICAgICAgIGlmICh0aGlzLiRzY3JvbGxMZWZ0ID09PSBzY3JvbGxMZWZ0IHx8IGlzTmFOKHNjcm9sbExlZnQpKVxuICAgICAgICAgICAgcmV0dXJuO1xuXG4gICAgICAgIHRoaXMuJHNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VTY3JvbGxMZWZ0XCIsIHNjcm9sbExlZnQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogW1JldHVybnMgdGhlIHZhbHVlIG9mIHRoZSBkaXN0YW5jZSBiZXR3ZWVuIHRoZSBsZWZ0IG9mIHRoZSBlZGl0b3IgYW5kIHRoZSBsZWZ0bW9zdCBwYXJ0IG9mIHRoZSB2aXNpYmxlIGNvbnRlbnQuXXs6ICNFZGl0U2Vzc2lvbi5nZXRTY3JvbGxMZWZ0fVxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiRzY3JvbGxMZWZ0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyB0aGUgd2lkdGggb2YgdGhlIHNjcmVlbi5cbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuV2lkdGgoKTogbnVtYmVyIHtcbiAgICAgICAgdGhpcy4kY29tcHV0ZVdpZHRoKCk7XG4gICAgICAgIGlmICh0aGlzLmxpbmVXaWRnZXRzKVxuICAgICAgICAgICAgcmV0dXJuIE1hdGgubWF4KHRoaXMuZ2V0TGluZVdpZGdldE1heFdpZHRoKCksIHRoaXMuc2NyZWVuV2lkdGgpO1xuICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5XaWR0aDtcbiAgICB9XG5cbiAgICBwcml2YXRlIGdldExpbmVXaWRnZXRNYXhXaWR0aCgpOiBudW1iZXIge1xuICAgICAgICBpZiAodGhpcy5saW5lV2lkZ2V0c1dpZHRoICE9IG51bGwpIHJldHVybiB0aGlzLmxpbmVXaWRnZXRzV2lkdGg7XG4gICAgICAgIHZhciB3aWR0aCA9IDA7XG4gICAgICAgIHRoaXMubGluZVdpZGdldHMuZm9yRWFjaChmdW5jdGlvbih3KSB7XG4gICAgICAgICAgICBpZiAodyAmJiB3LnNjcmVlbldpZHRoID4gd2lkdGgpXG4gICAgICAgICAgICAgICAgd2lkdGggPSB3LnNjcmVlbldpZHRoO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHRoaXMubGluZVdpZGdldFdpZHRoID0gd2lkdGg7XG4gICAgfVxuXG4gICAgcHVibGljICRjb21wdXRlV2lkdGgoZm9yY2U/OiBib29sZWFuKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMuJG1vZGlmaWVkIHx8IGZvcmNlKSB7XG4gICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zY3JlZW5XaWR0aCA9IHRoaXMuJHdyYXBMaW1pdDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGxpbmVzID0gdGhpcy5kb2MuZ2V0QWxsTGluZXMoKTtcbiAgICAgICAgICAgIHZhciBjYWNoZSA9IHRoaXMuJHJvd0xlbmd0aENhY2hlO1xuICAgICAgICAgICAgdmFyIGxvbmdlc3RTY3JlZW5MaW5lID0gMDtcbiAgICAgICAgICAgIHZhciBmb2xkSW5kZXggPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy4kZm9sZERhdGFbZm9sZEluZGV4XTtcbiAgICAgICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgdmFyIGxlbiA9IGxpbmVzLmxlbmd0aDtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpID4gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgICAgIGkgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGkgPj0gbGVuKVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy4kZm9sZERhdGFbZm9sZEluZGV4KytdO1xuICAgICAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmIChjYWNoZVtpXSA9PSBudWxsKVxuICAgICAgICAgICAgICAgICAgICBjYWNoZVtpXSA9IHRoaXMuJGdldFN0cmluZ1NjcmVlbldpZHRoKGxpbmVzW2ldKVswXTtcblxuICAgICAgICAgICAgICAgIGlmIChjYWNoZVtpXSA+IGxvbmdlc3RTY3JlZW5MaW5lKVxuICAgICAgICAgICAgICAgICAgICBsb25nZXN0U2NyZWVuTGluZSA9IGNhY2hlW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5zY3JlZW5XaWR0aCA9IGxvbmdlc3RTY3JlZW5MaW5lO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHZlcmJhdGltIGNvcHkgb2YgdGhlIGdpdmVuIGxpbmUgYXMgaXQgaXMgaW4gdGhlIGRvY3VtZW50XG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IHRvIHJldHJpZXZlIGZyb21cbiAgICAgKlxuICAgICpcbiAgICAgKiBAcmV0dXJuIHtTdHJpbmd9XG4gICAgKlxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRMaW5lKHJvdzogbnVtYmVyKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldExpbmUocm93KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGFuIGFycmF5IG9mIHN0cmluZ3Mgb2YgdGhlIHJvd3MgYmV0d2VlbiBgZmlyc3RSb3dgIGFuZCBgbGFzdFJvd2AuIFRoaXMgZnVuY3Rpb24gaXMgaW5jbHVzaXZlIG9mIGBsYXN0Um93YC5cbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIGZpcnN0IHJvdyBpbmRleCB0byByZXRyaWV2ZVxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgaW5kZXggdG8gcmV0cmlldmVcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1tTdHJpbmddfVxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRMaW5lcyhmaXJzdFJvdzogbnVtYmVyLCBsYXN0Um93OiBudW1iZXIpOiBzdHJpbmdbXSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIHJvd3MgaW4gdGhlIGRvY3VtZW50LlxuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKiovXG4gICAgcHVibGljIGdldExlbmd0aCgpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2MuZ2V0TGVuZ3RoKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogezpFZGl0b3JEb2N1bWVudC5nZXRUZXh0UmFuZ2UuZGVzY31cbiAgICAgKiBAcGFyYW0ge1JhbmdlfSByYW5nZSBUaGUgcmFuZ2UgdG8gd29yayB3aXRoXG4gICAgICpcbiAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICoqL1xuICAgIHB1YmxpYyBnZXRUZXh0UmFuZ2UocmFuZ2U6IFJhbmdlKTogc3RyaW5nIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jLmdldFRleHRSYW5nZShyYW5nZSB8fCB0aGlzLnNlbGVjdGlvbi5nZXRSYW5nZSgpKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBJbnNlcnRzIGEgYmxvY2sgb2YgYHRleHRgIGFuZCB0aGUgaW5kaWNhdGVkIGBwb3NpdGlvbmAuXG4gICAgICogQHBhcmFtIHtPYmplY3R9IHBvc2l0aW9uIFRoZSBwb3NpdGlvbiB7cm93LCBjb2x1bW59IHRvIHN0YXJ0IGluc2VydGluZyBhdFxuICAgICAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IEEgY2h1bmsgb2YgdGV4dCB0byBpbnNlcnRcbiAgICAgKiBAcmV0dXJuIHtPYmplY3R9IFRoZSBwb3NpdGlvbiBvZiB0aGUgbGFzdCBsaW5lIG9mIGB0ZXh0YC4gSWYgdGhlIGxlbmd0aCBvZiBgdGV4dGAgaXMgMCwgdGhpcyBmdW5jdGlvbiBzaW1wbHkgcmV0dXJucyBgcG9zaXRpb25gLlxuICAgICAqXG4gICAgICpcbiAgICAgKiovXG4gICAgcHVibGljIGluc2VydChwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgdGV4dDogc3RyaW5nKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5pbnNlcnQocG9zaXRpb24sIHRleHQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJlbW92ZXMgdGhlIGByYW5nZWAgZnJvbSB0aGUgZG9jdW1lbnQuXG4gICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgQSBzcGVjaWZpZWQgUmFuZ2UgdG8gcmVtb3ZlXG4gICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgbmV3IGBzdGFydGAgcHJvcGVydHkgb2YgdGhlIHJhbmdlLCB3aGljaCBjb250YWlucyBgc3RhcnRSb3dgIGFuZCBgc3RhcnRDb2x1bW5gLiBJZiBgcmFuZ2VgIGlzIGVtcHR5LCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgdGhlIHVubW9kaWZpZWQgdmFsdWUgb2YgYHJhbmdlLnN0YXJ0YC5cbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50LnJlbW92ZVxuICAgICAqXG4gICAgICoqL1xuICAgIHB1YmxpYyByZW1vdmUocmFuZ2U6IFJhbmdlKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5yZW1vdmUocmFuZ2UpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldmVydHMgcHJldmlvdXMgY2hhbmdlcyB0byB5b3VyIGRvY3VtZW50LlxuICAgICAqIEBwYXJhbSB7QXJyYXl9IGRlbHRhcyBBbiBhcnJheSBvZiBwcmV2aW91cyBjaGFuZ2VzXG4gICAgICogQHBhcmFtIHtCb29sZWFufSBkb250U2VsZWN0IFtJZiBgdHJ1ZWAsIGRvZXNuJ3Qgc2VsZWN0IHRoZSByYW5nZSBvZiB3aGVyZSB0aGUgY2hhbmdlIG9jY3VyZWRdezogI2RvbnRTZWxlY3R9XG4gICAgICpcbiAgICAgKlxuICAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyB1bmRvQ2hhbmdlcyhkZWx0YXMsIGRvbnRTZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgICAgIHZhciBsYXN0VW5kb1JhbmdlOiBSYW5nZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSBkZWx0YXMubGVuZ3RoIC0gMTsgaSAhPSAtMTsgaS0tKSB7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jLnJldmVydERlbHRhcyhkZWx0YS5kZWx0YXMpO1xuICAgICAgICAgICAgICAgIGxhc3RVbmRvUmFuZ2UgPVxuICAgICAgICAgICAgICAgICAgICB0aGlzLiRnZXRVbmRvU2VsZWN0aW9uKGRlbHRhLmRlbHRhcywgdHJ1ZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGRlbHRhLmRlbHRhcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGREZWx0YSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZEZvbGRzKGZvbGREZWx0YS5mb2xkcyk7XG4gICAgICAgICAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZS1pbXBsZW1lbnRzIGEgcHJldmlvdXNseSB1bmRvbmUgY2hhbmdlIHRvIHlvdXIgZG9jdW1lbnQuXG4gICAgICogQHBhcmFtIHtBcnJheX0gZGVsdGFzIEFuIGFycmF5IG9mIHByZXZpb3VzIGNoYW5nZXNcbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGRvbnRTZWxlY3Qgezpkb250U2VsZWN0fVxuICAgICAqXG4gICAgKlxuICAgICAqIEByZXR1cm4ge1JhbmdlfVxuICAgICoqL1xuICAgIHB1YmxpYyByZWRvQ2hhbmdlcyhkZWx0YXMsIGRvbnRTZWxlY3Q/OiBib29sZWFuKSB7XG4gICAgICAgIGlmICghZGVsdGFzLmxlbmd0aClcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmcm9tVW5kbyA9IHRydWU7XG4gICAgICAgIHZhciBsYXN0VW5kb1JhbmdlOiBSYW5nZSA9IG51bGw7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsdGFzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoZGVsdGEuZ3JvdXAgPT0gXCJkb2NcIikge1xuICAgICAgICAgICAgICAgIHRoaXMuZG9jLmFwcGx5RGVsdGFzKGRlbHRhLmRlbHRhcyk7XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZSA9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJGdldFVuZG9TZWxlY3Rpb24oZGVsdGEuZGVsdGFzLCBmYWxzZSwgbGFzdFVuZG9SYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kZnJvbVVuZG8gPSBmYWxzZTtcbiAgICAgICAgbGFzdFVuZG9SYW5nZSAmJlxuICAgICAgICAgICAgdGhpcy4kdW5kb1NlbGVjdCAmJlxuICAgICAgICAgICAgIWRvbnRTZWxlY3QgJiZcbiAgICAgICAgICAgIHRoaXMuc2VsZWN0aW9uLnNldFNlbGVjdGlvblJhbmdlKGxhc3RVbmRvUmFuZ2UpO1xuICAgICAgICByZXR1cm4gbGFzdFVuZG9SYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFbmFibGVzIG9yIGRpc2FibGVzIGhpZ2hsaWdodGluZyBvZiB0aGUgcmFuZ2Ugd2hlcmUgYW4gdW5kbyBvY2N1cnJlZC5cbiAgICAgKiBAcGFyYW0ge0Jvb2xlYW59IGVuYWJsZSBJZiBgdHJ1ZWAsIHNlbGVjdHMgdGhlIHJhbmdlIG9mIHRoZSByZWluc2VydGVkIGNoYW5nZVxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlIHNldFVuZG9TZWxlY3QoZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG4gICAgICAgIHRoaXMuJHVuZG9TZWxlY3QgPSBlbmFibGU7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkZ2V0VW5kb1NlbGVjdGlvbihkZWx0YXM6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9W10sIGlzVW5kbzogYm9vbGVhbiwgbGFzdFVuZG9SYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIGZ1bmN0aW9uIGlzSW5zZXJ0KGRlbHRhOiB7IGFjdGlvbjogc3RyaW5nIH0pIHtcbiAgICAgICAgICAgIHZhciBpbnNlcnQgPSBkZWx0YS5hY3Rpb24gPT09IFwiaW5zZXJ0VGV4dFwiIHx8IGRlbHRhLmFjdGlvbiA9PT0gXCJpbnNlcnRMaW5lc1wiO1xuICAgICAgICAgICAgcmV0dXJuIGlzVW5kbyA/ICFpbnNlcnQgOiBpbnNlcnQ7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZGVsdGE6IHsgYWN0aW9uOiBzdHJpbmc7IHJhbmdlOiBSYW5nZSB9ID0gZGVsdGFzWzBdO1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlO1xuICAgICAgICB2YXIgcG9pbnQ6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgICAgIHZhciBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLmVuZCk7XG4gICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYW5nZSA9IFJhbmdlLmZyb21Qb2ludHMoZGVsdGEucmFuZ2Uuc3RhcnQsIGRlbHRhLnJhbmdlLnN0YXJ0KTtcbiAgICAgICAgICAgIGxhc3REZWx0YUlzSW5zZXJ0ID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGRlbHRhcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZGVsdGEgPSBkZWx0YXNbaV07XG4gICAgICAgICAgICBpZiAoaXNJbnNlcnQoZGVsdGEpKSB7XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnNldFN0YXJ0KGRlbHRhLnJhbmdlLnN0YXJ0LnJvdywgZGVsdGEucmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5lbmQ7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmUocG9pbnQucm93LCBwb2ludC5jb2x1bW4pID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLnNldEVuZChkZWx0YS5yYW5nZS5lbmQucm93LCBkZWx0YS5yYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgbGFzdERlbHRhSXNJbnNlcnQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcG9pbnQgPSBkZWx0YS5yYW5nZS5zdGFydDtcbiAgICAgICAgICAgICAgICBpZiAocmFuZ2UuY29tcGFyZShwb2ludC5yb3csIHBvaW50LmNvbHVtbikgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlID0gUmFuZ2UuZnJvbVBvaW50cyhkZWx0YS5yYW5nZS5zdGFydCwgZGVsdGEucmFuZ2Uuc3RhcnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBsYXN0RGVsdGFJc0luc2VydCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyByYW5nZSBhbmQgdGhlIGxhc3QgdW5kbyByYW5nZSBoYXMgc29tZXRoaW5nIGluIGNvbW1vbi5cbiAgICAgICAgLy8gSWYgdHJ1ZSwgbWVyZ2UgdGhlIHJhbmdlcy5cbiAgICAgICAgaWYgKGxhc3RVbmRvUmFuZ2UgIT0gbnVsbCkge1xuICAgICAgICAgICAgaWYgKFJhbmdlLmNvbXBhcmVQb2ludHMobGFzdFVuZG9SYW5nZS5zdGFydCwgcmFuZ2Uuc3RhcnQpID09PSAwKSB7XG4gICAgICAgICAgICAgICAgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4gKz0gcmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgICAgICBsYXN0VW5kb1JhbmdlLmVuZC5jb2x1bW4gKz0gcmFuZ2UuZW5kLmNvbHVtbiAtIHJhbmdlLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGNtcCA9IGxhc3RVbmRvUmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT09IDEpIHtcbiAgICAgICAgICAgICAgICByYW5nZS5zZXRTdGFydChsYXN0VW5kb1JhbmdlLnN0YXJ0LnJvdywgbGFzdFVuZG9SYW5nZS5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wID09PSAtMSkge1xuICAgICAgICAgICAgICAgIHJhbmdlLnNldEVuZChsYXN0VW5kb1JhbmdlLmVuZC5yb3csIGxhc3RVbmRvUmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiByYW5nZTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBSZXBsYWNlcyBhIHJhbmdlIGluIHRoZSBkb2N1bWVudCB3aXRoIHRoZSBuZXcgYHRleHRgLlxuICAgICAqXG4gICAgICogQG1ldGhvZCByZXBsYWNlXG4gICAgICogQHBhcmFtIHJhbmdlIHtSYW5nZX0gQSBzcGVjaWZpZWQgUmFuZ2UgdG8gcmVwbGFjZS5cbiAgICAgKiBAcGFyYW0gdGV4dCB7c3RyaW5nfSBUaGUgbmV3IHRleHQgdG8gdXNlIGFzIGEgcmVwbGFjZW1lbnQuXG4gICAgICogQHJldHVybiB7UG9zaXRpb259XG4gICAgICogSWYgdGhlIHRleHQgYW5kIHJhbmdlIGFyZSBlbXB0eSwgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIG9iamVjdCBjb250YWluaW5nIHRoZSBjdXJyZW50IGByYW5nZS5zdGFydGAgdmFsdWUuXG4gICAgICogSWYgdGhlIHRleHQgaXMgdGhlIGV4YWN0IHNhbWUgYXMgd2hhdCBjdXJyZW50bHkgZXhpc3RzLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gb2JqZWN0IGNvbnRhaW5pbmcgdGhlIGN1cnJlbnQgYHJhbmdlLmVuZGAgdmFsdWUuXG4gICAgICovXG4gICAgcHVibGljIHJlcGxhY2UocmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpOiBQb3NpdGlvbiB7XG4gICAgICAgIHJldHVybiB0aGlzLmRvYy5yZXBsYWNlKHJhbmdlLCB0ZXh0KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIE1vdmVzIGEgcmFuZ2Ugb2YgdGV4dCBmcm9tIHRoZSBnaXZlbiByYW5nZSB0byB0aGUgZ2l2ZW4gcG9zaXRpb24uIGB0b1Bvc2l0aW9uYCBpcyBhbiBvYmplY3QgdGhhdCBsb29rcyBsaWtlIHRoaXM6XG4gICAgICogIGBgYGpzb25cbiAgICAqICAgIHsgcm93OiBuZXdSb3dMb2NhdGlvbiwgY29sdW1uOiBuZXdDb2x1bW5Mb2NhdGlvbiB9XG4gICAgICogIGBgYFxuICAgICAqIEBwYXJhbSB7UmFuZ2V9IGZyb21SYW5nZSBUaGUgcmFuZ2Ugb2YgdGV4dCB5b3Ugd2FudCBtb3ZlZCB3aXRoaW4gdGhlIGRvY3VtZW50XG4gICAgICogQHBhcmFtIHtPYmplY3R9IHRvUG9zaXRpb24gVGhlIGxvY2F0aW9uIChyb3cgYW5kIGNvbHVtbikgd2hlcmUgeW91IHdhbnQgdG8gbW92ZSB0aGUgdGV4dCB0b1xuICAgICAqIEByZXR1cm4ge1JhbmdlfSBUaGUgbmV3IHJhbmdlIHdoZXJlIHRoZSB0ZXh0IHdhcyBtb3ZlZCB0by5cbiAgICAqXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgbW92ZVRleHQoZnJvbVJhbmdlOiBSYW5nZSwgdG9Qb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgY29weSkge1xuICAgICAgICB2YXIgdGV4dCA9IHRoaXMuZ2V0VGV4dFJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGZyb21SYW5nZSk7XG4gICAgICAgIHZhciByb3dEaWZmOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2xEaWZmOiBudW1iZXI7XG5cbiAgICAgICAgdmFyIHRvUmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKHRvUG9zaXRpb24sIHRvUG9zaXRpb24pO1xuICAgICAgICBpZiAoIWNvcHkpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlKGZyb21SYW5nZSk7XG4gICAgICAgICAgICByb3dEaWZmID0gZnJvbVJhbmdlLnN0YXJ0LnJvdyAtIGZyb21SYW5nZS5lbmQucm93O1xuICAgICAgICAgICAgY29sRGlmZiA9IHJvd0RpZmYgPyAtZnJvbVJhbmdlLmVuZC5jb2x1bW4gOiBmcm9tUmFuZ2Uuc3RhcnQuY29sdW1uIC0gZnJvbVJhbmdlLmVuZC5jb2x1bW47XG4gICAgICAgICAgICBpZiAoY29sRGlmZikge1xuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLnN0YXJ0LnJvdyA9PSBmcm9tUmFuZ2UuZW5kLnJvdyAmJiB0b1JhbmdlLnN0YXJ0LmNvbHVtbiA+IGZyb21SYW5nZS5lbmQuY29sdW1uKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvUmFuZ2Uuc3RhcnQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICh0b1JhbmdlLmVuZC5yb3cgPT0gZnJvbVJhbmdlLmVuZC5yb3cgJiYgdG9SYW5nZS5lbmQuY29sdW1uID4gZnJvbVJhbmdlLmVuZC5jb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdG9SYW5nZS5lbmQuY29sdW1uICs9IGNvbERpZmY7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJvd0RpZmYgJiYgdG9SYW5nZS5zdGFydC5yb3cgPj0gZnJvbVJhbmdlLmVuZC5yb3cpIHtcbiAgICAgICAgICAgICAgICB0b1JhbmdlLnN0YXJ0LnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgICAgIHRvUmFuZ2UuZW5kLnJvdyArPSByb3dEaWZmO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdG9SYW5nZS5lbmQgPSB0aGlzLmluc2VydCh0b1JhbmdlLnN0YXJ0LCB0ZXh0KTtcbiAgICAgICAgaWYgKGZvbGRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIG9sZFN0YXJ0ID0gZnJvbVJhbmdlLnN0YXJ0O1xuICAgICAgICAgICAgdmFyIG5ld1N0YXJ0ID0gdG9SYW5nZS5zdGFydDtcbiAgICAgICAgICAgIHJvd0RpZmYgPSBuZXdTdGFydC5yb3cgLSBvbGRTdGFydC5yb3c7XG4gICAgICAgICAgICBjb2xEaWZmID0gbmV3U3RhcnQuY29sdW1uIC0gb2xkU3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkcyhmb2xkcy5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgICAgIHggPSB4LmNsb25lKCk7XG4gICAgICAgICAgICAgICAgaWYgKHguc3RhcnQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LnN0YXJ0LmNvbHVtbiArPSBjb2xEaWZmO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoeC5lbmQucm93ID09IG9sZFN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgICAgICB4LmVuZC5jb2x1bW4gKz0gY29sRGlmZjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgeC5zdGFydC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICB4LmVuZC5yb3cgKz0gcm93RGlmZjtcbiAgICAgICAgICAgICAgICByZXR1cm4geDtcbiAgICAgICAgICAgIH0pKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0b1JhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogSW5kZW50cyBhbGwgdGhlIHJvd3MsIGZyb20gYHN0YXJ0Um93YCB0byBgZW5kUm93YCAoaW5jbHVzaXZlKSwgYnkgcHJlZml4aW5nIGVhY2ggcm93IHdpdGggdGhlIHRva2VuIGluIGBpbmRlbnRTdHJpbmdgLlxuICAgICpcbiAgICAqIElmIGBpbmRlbnRTdHJpbmdgIGNvbnRhaW5zIHRoZSBgJ1xcdCdgIGNoYXJhY3RlciwgaXQncyByZXBsYWNlZCBieSB3aGF0ZXZlciBpcyBkZWZpbmVkIGJ5IFtbRWRpdFNlc3Npb24uZ2V0VGFiU3RyaW5nIGBnZXRUYWJTdHJpbmcoKWBdXS5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBzdGFydFJvdyBTdGFydGluZyByb3dcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBlbmRSb3cgRW5kaW5nIHJvd1xuICAgICogQHBhcmFtIHtTdHJpbmd9IGluZGVudFN0cmluZyBUaGUgaW5kZW50IHRva2VuXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgaW5kZW50Um93cyhzdGFydFJvdzogbnVtYmVyLCBlbmRSb3c6IG51bWJlciwgaW5kZW50U3RyaW5nOiBzdHJpbmcpOiB2b2lkIHtcbiAgICAgICAgaW5kZW50U3RyaW5nID0gaW5kZW50U3RyaW5nLnJlcGxhY2UoL1xcdC9nLCB0aGlzLmdldFRhYlN0cmluZygpKTtcbiAgICAgICAgZm9yICh2YXIgcm93ID0gc3RhcnRSb3c7IHJvdyA8PSBlbmRSb3c7IHJvdysrKVxuICAgICAgICAgICAgdGhpcy5pbnNlcnQoeyByb3c6IHJvdywgY29sdW1uOiAwIH0sIGluZGVudFN0cmluZyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBPdXRkZW50cyBhbGwgdGhlIHJvd3MgZGVmaW5lZCBieSB0aGUgYHN0YXJ0YCBhbmQgYGVuZGAgcHJvcGVydGllcyBvZiBgcmFuZ2VgLlxuICAgICogQHBhcmFtIHtSYW5nZX0gcmFuZ2UgQSByYW5nZSBvZiByb3dzXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgb3V0ZGVudFJvd3MocmFuZ2U6IFJhbmdlKSB7XG4gICAgICAgIHZhciByb3dSYW5nZSA9IHJhbmdlLmNvbGxhcHNlUm93cygpO1xuICAgICAgICB2YXIgZGVsZXRlUmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgMCwgMCk7XG4gICAgICAgIHZhciBzaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IHJvd1JhbmdlLnN0YXJ0LnJvdzsgaSA8PSByb3dSYW5nZS5lbmQucm93OyArK2kpIHtcbiAgICAgICAgICAgIHZhciBsaW5lID0gdGhpcy5nZXRMaW5lKGkpO1xuXG4gICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5yb3cgPSBpO1xuICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLnJvdyA9IGk7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNpemU7ICsrailcbiAgICAgICAgICAgICAgICBpZiAobGluZS5jaGFyQXQoaikgIT0gJyAnKVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGlmIChqIDwgc2l6ZSAmJiBsaW5lLmNoYXJBdChqKSA9PSAnXFx0Jykge1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLnN0YXJ0LmNvbHVtbiA9IGo7XG4gICAgICAgICAgICAgICAgZGVsZXRlUmFuZ2UuZW5kLmNvbHVtbiA9IGogKyAxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBkZWxldGVSYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgICAgICAgICAgICAgIGRlbGV0ZVJhbmdlLmVuZC5jb2x1bW4gPSBqO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5yZW1vdmUoZGVsZXRlUmFuZ2UpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkbW92ZUxpbmVzKGZpcnN0Um93OiBudW1iZXIsIGxhc3RSb3c6IG51bWJlciwgZGlyOiBudW1iZXIpIHtcbiAgICAgICAgZmlyc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRTdGFydChmaXJzdFJvdyk7XG4gICAgICAgIGxhc3RSb3cgPSB0aGlzLmdldFJvd0ZvbGRFbmQobGFzdFJvdyk7XG4gICAgICAgIGlmIChkaXIgPCAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQoZmlyc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA8IDApIHJldHVybiAwO1xuICAgICAgICAgICAgdmFyIGRpZmYgPSByb3cgLSBmaXJzdFJvdztcbiAgICAgICAgfSBlbHNlIGlmIChkaXIgPiAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gdGhpcy5nZXRSb3dGb2xkRW5kKGxhc3RSb3cgKyBkaXIpO1xuICAgICAgICAgICAgaWYgKHJvdyA+IHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkgcmV0dXJuIDA7XG4gICAgICAgICAgICB2YXIgZGlmZiA9IHJvdyAtIGxhc3RSb3c7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBmaXJzdFJvdyA9IHRoaXMuJGNsaXBSb3dUb0RvY3VtZW50KGZpcnN0Um93KTtcbiAgICAgICAgICAgIGxhc3RSb3cgPSB0aGlzLiRjbGlwUm93VG9Eb2N1bWVudChsYXN0Um93KTtcbiAgICAgICAgICAgIHZhciBkaWZmID0gbGFzdFJvdyAtIGZpcnN0Um93ICsgMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IG5ldyBSYW5nZShmaXJzdFJvdywgMCwgbGFzdFJvdywgTnVtYmVyLk1BWF9WQUxVRSk7XG4gICAgICAgIHZhciBmb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKHJhbmdlKS5tYXAoZnVuY3Rpb24oeCkge1xuICAgICAgICAgICAgeCA9IHguY2xvbmUoKTtcbiAgICAgICAgICAgIHguc3RhcnQucm93ICs9IGRpZmY7XG4gICAgICAgICAgICB4LmVuZC5yb3cgKz0gZGlmZjtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9KTtcblxuICAgICAgICB2YXIgbGluZXM6IHN0cmluZ1tdID0gKGRpciA9PT0gMCkgPyB0aGlzLmRvYy5nZXRMaW5lcyhmaXJzdFJvdywgbGFzdFJvdykgOiB0aGlzLmRvYy5yZW1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIHRoaXMuZG9jLmluc2VydExpbmVzKGZpcnN0Um93ICsgZGlmZiwgbGluZXMpO1xuICAgICAgICBmb2xkcy5sZW5ndGggJiYgdGhpcy5hZGRGb2xkcyhmb2xkcyk7XG4gICAgICAgIHJldHVybiBkaWZmO1xuICAgIH1cbiAgICAvKipcbiAgICAqIFNoaWZ0cyBhbGwgdGhlIGxpbmVzIGluIHRoZSBkb2N1bWVudCB1cCBvbmUsIHN0YXJ0aW5nIGZyb20gYGZpcnN0Um93YCBhbmQgZW5kaW5nIGF0IGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIG1vdmUgdXBcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSB1cFxuICAgICogQHJldHVybiB7TnVtYmVyfSBJZiBgZmlyc3RSb3dgIGlzIGxlc3MtdGhhbiBvciBlcXVhbCB0byAwLCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgMC4gT3RoZXJ3aXNlLCBvbiBzdWNjZXNzLCBpdCByZXR1cm5zIC0xLlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRvckRvY3VtZW50Lmluc2VydExpbmVzXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgbW92ZUxpbmVzVXAoZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgLTEpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogU2hpZnRzIGFsbCB0aGUgbGluZXMgaW4gdGhlIGRvY3VtZW50IGRvd24gb25lLCBzdGFydGluZyBmcm9tIGBmaXJzdFJvd2AgYW5kIGVuZGluZyBhdCBgbGFzdFJvd2AuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZmlyc3RSb3cgVGhlIHN0YXJ0aW5nIHJvdyB0byBtb3ZlIGRvd25cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBsYXN0Um93IFRoZSBmaW5hbCByb3cgdG8gbW92ZSBkb3duXG4gICAgKiBAcmV0dXJuIHtOdW1iZXJ9IElmIGBmaXJzdFJvd2AgaXMgbGVzcy10aGFuIG9yIGVxdWFsIHRvIDAsIHRoaXMgZnVuY3Rpb24gcmV0dXJucyAwLiBPdGhlcndpc2UsIG9uIHN1Y2Nlc3MsIGl0IHJldHVybnMgLTEuXG4gICAgKlxuICAgICogQHJlbGF0ZWQgRWRpdG9yRG9jdW1lbnQuaW5zZXJ0TGluZXNcbiAgICAqKi9cbiAgICBwcml2YXRlIG1vdmVMaW5lc0Rvd24oZmlyc3RSb3c6IG51bWJlciwgbGFzdFJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJG1vdmVMaW5lcyhmaXJzdFJvdywgbGFzdFJvdywgMSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBEdXBsaWNhdGVzIGFsbCB0aGUgdGV4dCBiZXR3ZWVuIGBmaXJzdFJvd2AgYW5kIGBsYXN0Um93YC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBmaXJzdFJvdyBUaGUgc3RhcnRpbmcgcm93IHRvIGR1cGxpY2F0ZVxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGxhc3RSb3cgVGhlIGZpbmFsIHJvdyB0byBkdXBsaWNhdGVcbiAgICAqIEByZXR1cm4ge051bWJlcn0gUmV0dXJucyB0aGUgbnVtYmVyIG9mIG5ldyByb3dzIGFkZGVkOyBpbiBvdGhlciB3b3JkcywgYGxhc3RSb3cgLSBmaXJzdFJvdyArIDFgLlxuICAgICpcbiAgICAqXG4gICAgKiovXG4gICAgcHVibGljIGR1cGxpY2F0ZUxpbmVzKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRtb3ZlTGluZXMoZmlyc3RSb3csIGxhc3RSb3csIDApO1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSAkY2xpcFJvd1RvRG9jdW1lbnQocm93KSB7XG4gICAgICAgIHJldHVybiBNYXRoLm1heCgwLCBNYXRoLm1pbihyb3csIHRoaXMuZG9jLmdldExlbmd0aCgpIC0gMSkpO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGNsaXBDb2x1bW5Ub1Jvdyhyb3csIGNvbHVtbikge1xuICAgICAgICBpZiAoY29sdW1uIDwgMClcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICByZXR1cm4gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgICB9XG5cblxuICAgIHByaXZhdGUgJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIGNvbHVtbiA9IE1hdGgubWF4KDAsIGNvbHVtbik7XG5cbiAgICAgICAgaWYgKHJvdyA8IDApIHtcbiAgICAgICAgICAgIHJvdyA9IDA7XG4gICAgICAgICAgICBjb2x1bW4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxlbiA9IHRoaXMuZG9jLmdldExlbmd0aCgpO1xuICAgICAgICAgICAgaWYgKHJvdyA+PSBsZW4pIHtcbiAgICAgICAgICAgICAgICByb3cgPSBsZW4gLSAxO1xuICAgICAgICAgICAgICAgIGNvbHVtbiA9IHRoaXMuZG9jLmdldExpbmUobGVuIC0gMSkubGVuZ3RoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29sdW1uID0gTWF0aC5taW4odGhpcy5kb2MuZ2V0TGluZShyb3cpLmxlbmd0aCwgY29sdW1uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IHJvdyxcbiAgICAgICAgICAgIGNvbHVtbjogY29sdW1uXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcHVibGljICRjbGlwUmFuZ2VUb0RvY3VtZW50KHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcbiAgICAgICAgaWYgKHJhbmdlLnN0YXJ0LnJvdyA8IDApIHtcbiAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyA9IDA7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQuY29sdW1uID0gdGhpcy4kY2xpcENvbHVtblRvUm93KFxuICAgICAgICAgICAgICAgIHJhbmdlLnN0YXJ0LnJvdyxcbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW5cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbGVuID0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkgLSAxO1xuICAgICAgICBpZiAocmFuZ2UuZW5kLnJvdyA+IGxlbikge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLnJvdyA9IGxlbjtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSB0aGlzLmRvYy5nZXRMaW5lKGxlbikubGVuZ3RoO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbiA9IHRoaXMuJGNsaXBDb2x1bW5Ub1JvdyhcbiAgICAgICAgICAgICAgICByYW5nZS5lbmQucm93LFxuICAgICAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW5cbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJhbmdlO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFNldHMgd2hldGhlciBvciBub3QgbGluZSB3cmFwcGluZyBpcyBlbmFibGVkLiBJZiBgdXNlV3JhcE1vZGVgIGlzIGRpZmZlcmVudCB0aGFuIHRoZSBjdXJyZW50IHZhbHVlLCB0aGUgYCdjaGFuZ2VXcmFwTW9kZSdgIGV2ZW50IGlzIGVtaXR0ZWQuXG4gICAgICogQHBhcmFtIHtCb29sZWFufSB1c2VXcmFwTW9kZSBFbmFibGUgKG9yIGRpc2FibGUpIHdyYXAgbW9kZVxuICAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHByaXZhdGUgc2V0VXNlV3JhcE1vZGUodXNlV3JhcE1vZGU6IGJvb2xlYW4pIHtcbiAgICAgICAgaWYgKHVzZVdyYXBNb2RlICE9IHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB0aGlzLiR1c2VXcmFwTW9kZSA9IHVzZVdyYXBNb2RlO1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy4kcmVzZXRSb3dDYWNoZSgwKTtcblxuICAgICAgICAgICAgLy8gSWYgd3JhcE1vZGUgaXMgYWN0aXZhZWQsIHRoZSB3cmFwRGF0YSBhcnJheSBoYXMgdG8gYmUgaW5pdGlhbGl6ZWQuXG4gICAgICAgICAgICBpZiAodXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgbGVuID0gdGhpcy5nZXRMZW5ndGgoKTtcbiAgICAgICAgICAgICAgICB0aGlzLiR3cmFwRGF0YSA9IEFycmF5PG51bWJlcltdPihsZW4pO1xuICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIGxlbiAtIDEpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9zaWduYWwoXCJjaGFuZ2VXcmFwTW9kZVwiKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgd3JhcCBtb2RlIGlzIGJlaW5nIHVzZWQ7IGBmYWxzZWAgb3RoZXJ3aXNlLlxuICAgICogQHJldHVybiB7Qm9vbGVhbn1cbiAgICAqKi9cbiAgICBnZXRVc2VXcmFwTW9kZSgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHVzZVdyYXBNb2RlO1xuICAgIH1cblxuICAgIC8vIEFsbG93IHRoZSB3cmFwIGxpbWl0IHRvIG1vdmUgZnJlZWx5IGJldHdlZW4gbWluIGFuZCBtYXguIEVpdGhlclxuICAgIC8vIHBhcmFtZXRlciBjYW4gYmUgbnVsbCB0byBhbGxvdyB0aGUgd3JhcCBsaW1pdCB0byBiZSB1bmNvbnN0cmFpbmVkXG4gICAgLy8gaW4gdGhhdCBkaXJlY3Rpb24uIE9yIHNldCBib3RoIHBhcmFtZXRlcnMgdG8gdGhlIHNhbWUgbnVtYmVyIHRvIHBpblxuICAgIC8vIHRoZSBsaW1pdCB0byB0aGF0IHZhbHVlLlxuICAgIC8qKlxuICAgICAqIFNldHMgdGhlIGJvdW5kYXJpZXMgb2Ygd3JhcC4gRWl0aGVyIHZhbHVlIGNhbiBiZSBgbnVsbGAgdG8gaGF2ZSBhbiB1bmNvbnN0cmFpbmVkIHdyYXAsIG9yLCB0aGV5IGNhbiBiZSB0aGUgc2FtZSBudW1iZXIgdG8gcGluIHRoZSBsaW1pdC4gSWYgdGhlIHdyYXAgbGltaXRzIGZvciBgbWluYCBvciBgbWF4YCBhcmUgZGlmZmVyZW50LCB0aGlzIG1ldGhvZCBhbHNvIGVtaXRzIHRoZSBgJ2NoYW5nZVdyYXBNb2RlJ2AgZXZlbnQuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IG1pbiBUaGUgbWluaW11bSB3cmFwIHZhbHVlICh0aGUgbGVmdCBzaWRlIHdyYXApXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IG1heCBUaGUgbWF4aW11bSB3cmFwIHZhbHVlICh0aGUgcmlnaHQgc2lkZSB3cmFwKVxuICAgICAqXG4gICAgKlxuICAgICoqL1xuICAgIHNldFdyYXBMaW1pdFJhbmdlKG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IHZvaWQge1xuICAgICAgICBpZiAodGhpcy4kd3JhcExpbWl0UmFuZ2UubWluICE9PSBtaW4gfHwgdGhpcy4kd3JhcExpbWl0UmFuZ2UubWF4ICE9PSBtYXgpIHtcbiAgICAgICAgICAgIHRoaXMuJHdyYXBMaW1pdFJhbmdlID0ge1xuICAgICAgICAgICAgICAgIG1pbjogbWluLFxuICAgICAgICAgICAgICAgIG1heDogbWF4XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgLy8gVGhpcyB3aWxsIGZvcmNlIGEgcmVjYWxjdWxhdGlvbiBvZiB0aGUgd3JhcCBsaW1pdFxuICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcE1vZGVcIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFRoaXMgc2hvdWxkIGdlbmVyYWxseSBvbmx5IGJlIGNhbGxlZCBieSB0aGUgcmVuZGVyZXIgd2hlbiBhIHJlc2l6ZSBpcyBkZXRlY3RlZC5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkZXNpcmVkTGltaXQgVGhlIG5ldyB3cmFwIGxpbWl0XG4gICAgKiBAcmV0dXJuIHtCb29sZWFufVxuICAgICpcbiAgICAqIEBwcml2YXRlXG4gICAgKiovXG4gICAgcHVibGljIGFkanVzdFdyYXBMaW1pdChkZXNpcmVkTGltaXQ6IG51bWJlciwgJHByaW50TWFyZ2luOiBudW1iZXIpIHtcbiAgICAgICAgdmFyIGxpbWl0cyA9IHRoaXMuJHdyYXBMaW1pdFJhbmdlXG4gICAgICAgIGlmIChsaW1pdHMubWF4IDwgMClcbiAgICAgICAgICAgIGxpbWl0cyA9IHsgbWluOiAkcHJpbnRNYXJnaW4sIG1heDogJHByaW50TWFyZ2luIH07XG4gICAgICAgIHZhciB3cmFwTGltaXQgPSB0aGlzLiRjb25zdHJhaW5XcmFwTGltaXQoZGVzaXJlZExpbWl0LCBsaW1pdHMubWluLCBsaW1pdHMubWF4KTtcbiAgICAgICAgaWYgKHdyYXBMaW1pdCAhPSB0aGlzLiR3cmFwTGltaXQgJiYgd3JhcExpbWl0ID4gMSkge1xuICAgICAgICAgICAgdGhpcy4kd3JhcExpbWl0ID0gd3JhcExpbWl0O1xuICAgICAgICAgICAgdGhpcy4kbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kdXBkYXRlV3JhcERhdGEoMCwgdGhpcy5nZXRMZW5ndGgoKSAtIDEpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgICAgICAgICAgdGhpcy5fc2lnbmFsKFwiY2hhbmdlV3JhcExpbWl0XCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHByaXZhdGUgJGNvbnN0cmFpbldyYXBMaW1pdCh3cmFwTGltaXQ6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKG1pbilcbiAgICAgICAgICAgIHdyYXBMaW1pdCA9IE1hdGgubWF4KG1pbiwgd3JhcExpbWl0KTtcblxuICAgICAgICBpZiAobWF4KVxuICAgICAgICAgICAgd3JhcExpbWl0ID0gTWF0aC5taW4obWF4LCB3cmFwTGltaXQpO1xuXG4gICAgICAgIHJldHVybiB3cmFwTGltaXQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIHRoZSB2YWx1ZSBvZiB3cmFwIGxpbWl0LlxuICAgICogQHJldHVybiB7TnVtYmVyfSBUaGUgd3JhcCBsaW1pdC5cbiAgICAqKi9cbiAgICBwcml2YXRlIGdldFdyYXBMaW1pdCgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBMaW1pdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBTZXRzIHRoZSBsaW5lIGxlbmd0aCBmb3Igc29mdCB3cmFwIGluIHRoZSBlZGl0b3IuIExpbmVzIHdpbGwgYnJlYWtcbiAgICAgKiAgYXQgYSBtaW5pbXVtIG9mIHRoZSBnaXZlbiBsZW5ndGggbWludXMgMjAgY2hhcnMgYW5kIGF0IGEgbWF4aW11bVxuICAgICAqICBvZiB0aGUgZ2l2ZW4gbnVtYmVyIG9mIGNoYXJzLlxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBsaW1pdCBUaGUgbWF4aW11bSBsaW5lIGxlbmd0aCBpbiBjaGFycywgZm9yIHNvZnQgd3JhcHBpbmcgbGluZXMuXG4gICAgICovXG4gICAgcHJpdmF0ZSBzZXRXcmFwTGltaXQobGltaXQpIHtcbiAgICAgICAgdGhpcy5zZXRXcmFwTGltaXRSYW5nZShsaW1pdCwgbGltaXQpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogUmV0dXJucyBhbiBvYmplY3QgdGhhdCBkZWZpbmVzIHRoZSBtaW5pbXVtIGFuZCBtYXhpbXVtIG9mIHRoZSB3cmFwIGxpbWl0OyBpdCBsb29rcyBzb21ldGhpbmcgbGlrZSB0aGlzOlxuICAgICpcbiAgICAqICAgICB7IG1pbjogd3JhcExpbWl0UmFuZ2VfbWluLCBtYXg6IHdyYXBMaW1pdFJhbmdlX21heCB9XG4gICAgKlxuICAgICogQHJldHVybiB7T2JqZWN0fVxuICAgICoqL1xuICAgIHByaXZhdGUgZ2V0V3JhcExpbWl0UmFuZ2UoKSB7XG4gICAgICAgIC8vIEF2b2lkIHVuZXhwZWN0ZWQgbXV0YXRpb24gYnkgcmV0dXJuaW5nIGEgY29weVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbWluOiB0aGlzLiR3cmFwTGltaXRSYW5nZS5taW4sXG4gICAgICAgICAgICBtYXg6IHRoaXMuJHdyYXBMaW1pdFJhbmdlLm1heFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIHByaXZhdGUgJHVwZGF0ZUludGVybmFsRGF0YU9uQ2hhbmdlKGUpIHtcbiAgICAgICAgdmFyIHVzZVdyYXBNb2RlID0gdGhpcy4kdXNlV3JhcE1vZGU7XG4gICAgICAgIHZhciBsZW47XG4gICAgICAgIHZhciBhY3Rpb24gPSBlLmRhdGEuYWN0aW9uO1xuICAgICAgICB2YXIgZmlyc3RSb3cgPSBlLmRhdGEucmFuZ2Uuc3RhcnQucm93O1xuICAgICAgICB2YXIgbGFzdFJvdyA9IGUuZGF0YS5yYW5nZS5lbmQucm93O1xuICAgICAgICB2YXIgc3RhcnQgPSBlLmRhdGEucmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBlbmQgPSBlLmRhdGEucmFuZ2UuZW5kO1xuICAgICAgICB2YXIgcmVtb3ZlZEZvbGRzID0gbnVsbDtcblxuICAgICAgICBpZiAoYWN0aW9uLmluZGV4T2YoXCJMaW5lc1wiKSAhPSAtMSkge1xuICAgICAgICAgICAgaWYgKGFjdGlvbiA9PSBcImluc2VydExpbmVzXCIpIHtcbiAgICAgICAgICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3cgKyAoZS5kYXRhLmxpbmVzLmxlbmd0aCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxhc3RSb3cgPSBmaXJzdFJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxlbiA9IGUuZGF0YS5saW5lcyA/IGUuZGF0YS5saW5lcy5sZW5ndGggOiBsYXN0Um93IC0gZmlyc3RSb3c7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZW4gPSBsYXN0Um93IC0gZmlyc3RSb3c7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLiR1cGRhdGluZyA9IHRydWU7XG4gICAgICAgIGlmIChsZW4gIT0gMCkge1xuICAgICAgICAgICAgaWYgKGFjdGlvbi5pbmRleE9mKFwicmVtb3ZlXCIpICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgdGhpc1t1c2VXcmFwTW9kZSA/IFwiJHdyYXBEYXRhXCIgOiBcIiRyb3dMZW5ndGhDYWNoZVwiXS5zcGxpY2UoZmlyc3RSb3csIGxlbik7XG5cbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgICAgICAgICAgcmVtb3ZlZEZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZS5kYXRhLnJhbmdlKTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbW92ZUZvbGRzKHJlbW92ZWRGb2xkcyk7XG5cbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGVuZC5yb3cpO1xuICAgICAgICAgICAgICAgIHZhciBpZHggPSAwO1xuICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5hZGRSZW1vdmVDaGFycyhlbmQucm93LCBlbmQuY29sdW1uLCBzdGFydC5jb2x1bW4gLSBlbmQuY29sdW1uKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3coLWxlbik7XG5cbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lQmVmb3JlID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZUJlZm9yZSAmJiBmb2xkTGluZUJlZm9yZSAhPT0gZm9sZExpbmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lQmVmb3JlLm1lcmdlKGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmVCZWZvcmU7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWR4ID0gZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpICsgMTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBmb3IgKGlkeDsgaWR4IDwgZm9sZExpbmVzLmxlbmd0aDsgaWR4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZExpbmVzW2lkeF07XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkTGluZS5zdGFydC5yb3cgPj0gZW5kLnJvdykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3coLWxlbik7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBsYXN0Um93ID0gZmlyc3RSb3c7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuKTtcbiAgICAgICAgICAgICAgICBhcmdzLnVuc2hpZnQoZmlyc3RSb3csIDApO1xuICAgICAgICAgICAgICAgIHZhciBhcnIgPSB1c2VXcmFwTW9kZSA/IHRoaXMuJHdyYXBEYXRhIDogdGhpcy4kcm93TGVuZ3RoQ2FjaGVcbiAgICAgICAgICAgICAgICBhcnIuc3BsaWNlLmFwcGx5KGFyciwgYXJncyk7XG5cbiAgICAgICAgICAgICAgICAvLyBJZiBzb21lIG5ldyBsaW5lIGlzIGFkZGVkIGluc2lkZSBvZiBhIGZvbGRMaW5lLCB0aGVuIHNwbGl0XG4gICAgICAgICAgICAgICAgLy8gdGhlIGZvbGQgbGluZSB1cC5cbiAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gdGhpcy5nZXRGb2xkTGluZShmaXJzdFJvdyk7XG4gICAgICAgICAgICAgICAgdmFyIGlkeCA9IDA7XG4gICAgICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkTGluZS5yYW5nZS5jb21wYXJlSW5zaWRlKHN0YXJ0LnJvdywgc3RhcnQuY29sdW1uKVxuICAgICAgICAgICAgICAgICAgICAvLyBJbnNpZGUgb2YgdGhlIGZvbGRMaW5lIHJhbmdlLiBOZWVkIHRvIHNwbGl0IHN0dWZmIHVwLlxuICAgICAgICAgICAgICAgICAgICBpZiAoY21wID09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lID0gZm9sZExpbmUuc3BsaXQoc3RhcnQucm93LCBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc2hpZnRSb3cobGVuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLmFkZFJlbW92ZUNoYXJzKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3RSb3csIDAsIGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEluZnJvbnQgb2YgdGhlIGZvbGRMaW5lIGJ1dCBzYW1lIHJvdy4gTmVlZCB0byBzaGlmdCBjb2x1bW4uXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZmlyc3RSb3csIDAsIGVuZC5jb2x1bW4gLSBzdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnNoaWZ0Um93KGxlbik7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIC8vIE5vdGhpbmcgdG8gZG8gaWYgdGhlIGluc2VydCBpcyBhZnRlciB0aGUgZm9sZExpbmUuXG4gICAgICAgICAgICAgICAgICAgIGlkeCA9IGZvbGRMaW5lcy5pbmRleE9mKGZvbGRMaW5lKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZm9yIChpZHg7IGlkeCA8IGZvbGRMaW5lcy5sZW5ndGg7IGlkeCsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGRMaW5lc1tpZHhdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93ID49IGZpcnN0Um93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5zaGlmdFJvdyhsZW4pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gUmVhbGlnbiBmb2xkcy4gRS5nLiBpZiB5b3UgYWRkIHNvbWUgbmV3IGNoYXJzIGJlZm9yZSBhIGZvbGQsIHRoZVxuICAgICAgICAgICAgLy8gZm9sZCBzaG91bGQgXCJtb3ZlXCIgdG8gdGhlIHJpZ2h0LlxuICAgICAgICAgICAgbGVuID0gTWF0aC5hYnMoZS5kYXRhLnJhbmdlLnN0YXJ0LmNvbHVtbiAtIGUuZGF0YS5yYW5nZS5lbmQuY29sdW1uKTtcbiAgICAgICAgICAgIGlmIChhY3Rpb24uaW5kZXhPZihcInJlbW92ZVwiKSAhPSAtMSkge1xuICAgICAgICAgICAgICAgIC8vIEdldCBhbGwgdGhlIGZvbGRzIGluIHRoZSBjaGFuZ2UgcmFuZ2UgYW5kIHJlbW92ZSB0aGVtLlxuICAgICAgICAgICAgICAgIHJlbW92ZWRGb2xkcyA9IHRoaXMuZ2V0Rm9sZHNJblJhbmdlKGUuZGF0YS5yYW5nZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhyZW1vdmVkRm9sZHMpO1xuXG4gICAgICAgICAgICAgICAgbGVuID0gLWxlbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZmlyc3RSb3cpO1xuICAgICAgICAgICAgaWYgKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkUmVtb3ZlQ2hhcnMoZmlyc3RSb3csIHN0YXJ0LmNvbHVtbiwgbGVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh1c2VXcmFwTW9kZSAmJiB0aGlzLiR3cmFwRGF0YS5sZW5ndGggIT0gdGhpcy5kb2MuZ2V0TGVuZ3RoKCkpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJkb2MuZ2V0TGVuZ3RoKCkgYW5kICR3cmFwRGF0YS5sZW5ndGggaGF2ZSB0byBiZSB0aGUgc2FtZSFcIik7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy4kdXBkYXRpbmcgPSBmYWxzZTtcblxuICAgICAgICBpZiAodXNlV3JhcE1vZGUpXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShmaXJzdFJvdywgbGFzdFJvdyk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZpcnN0Um93LCBsYXN0Um93KTtcblxuICAgICAgICByZXR1cm4gcmVtb3ZlZEZvbGRzO1xuICAgIH1cblxuICAgIHB1YmxpYyAkdXBkYXRlUm93TGVuZ3RoQ2FjaGUoZmlyc3RSb3csIGxhc3RSb3csIGI/KSB7XG4gICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlW2ZpcnN0Um93XSA9IG51bGw7XG4gICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlW2xhc3RSb3ddID0gbnVsbDtcbiAgICB9XG5cbiAgICBwdWJsaWMgJHVwZGF0ZVdyYXBEYXRhKGZpcnN0Um93LCBsYXN0Um93KSB7XG4gICAgICAgIHZhciBsaW5lcyA9IHRoaXMuZG9jLmdldEFsbExpbmVzKCk7XG4gICAgICAgIHZhciB0YWJTaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG4gICAgICAgIHZhciB3cmFwRGF0YSA9IHRoaXMuJHdyYXBEYXRhO1xuICAgICAgICB2YXIgd3JhcExpbWl0ID0gdGhpcy4kd3JhcExpbWl0O1xuICAgICAgICB2YXIgdG9rZW5zO1xuICAgICAgICB2YXIgZm9sZExpbmU7XG5cbiAgICAgICAgdmFyIHJvdyA9IGZpcnN0Um93O1xuICAgICAgICBsYXN0Um93ID0gTWF0aC5taW4obGFzdFJvdywgbGluZXMubGVuZ3RoIC0gMSk7XG4gICAgICAgIHdoaWxlIChyb3cgPD0gbGFzdFJvdykge1xuICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKHJvdywgZm9sZExpbmUpO1xuICAgICAgICAgICAgaWYgKCFmb2xkTGluZSkge1xuICAgICAgICAgICAgICAgIHRva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMobGluZXNbcm93XSk7XG4gICAgICAgICAgICAgICAgd3JhcERhdGFbcm93XSA9IHRoaXMuJGNvbXB1dGVXcmFwU3BsaXRzKHRva2Vucywgd3JhcExpbWl0LCB0YWJTaXplKTtcbiAgICAgICAgICAgICAgICByb3crKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdG9rZW5zID0gW107XG4gICAgICAgICAgICAgICAgZm9sZExpbmUud2FsayhmdW5jdGlvbihwbGFjZWhvbGRlciwgcm93LCBjb2x1bW4sIGxhc3RDb2x1bW4pIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHdhbGtUb2tlbnM6IG51bWJlcltdO1xuICAgICAgICAgICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2VucyA9IHRoaXMuJGdldERpc3BsYXlUb2tlbnMoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGxhY2Vob2xkZXIsIHRva2Vucy5sZW5ndGgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2Vuc1swXSA9IFBMQUNFSE9MREVSX1NUQVJUO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCB3YWxrVG9rZW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgd2Fsa1Rva2Vuc1tpXSA9IFBMQUNFSE9MREVSX0JPRFk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB3YWxrVG9rZW5zID0gdGhpcy4kZ2V0RGlzcGxheVRva2VucyhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lc1tyb3ddLnN1YnN0cmluZyhsYXN0Q29sdW1uLCBjb2x1bW4pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRva2Vucy5sZW5ndGgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRva2VucyA9IHRva2Vucy5jb25jYXQod2Fsa1Rva2Vucyk7XG4gICAgICAgICAgICAgICAgfS5iaW5kKHRoaXMpLFxuICAgICAgICAgICAgICAgICAgICBmb2xkTGluZS5lbmQucm93LFxuICAgICAgICAgICAgICAgICAgICBsaW5lc1tmb2xkTGluZS5lbmQucm93XS5sZW5ndGggKyAxXG4gICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgIHdyYXBEYXRhW2ZvbGRMaW5lLnN0YXJ0LnJvd10gPSB0aGlzLiRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnMsIHdyYXBMaW1pdCwgdGFiU2l6ZSk7XG4gICAgICAgICAgICAgICAgcm93ID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwcml2YXRlICRjb21wdXRlV3JhcFNwbGl0cyh0b2tlbnM6IG51bWJlcltdLCB3cmFwTGltaXQ6IG51bWJlciwgdGFiU2l6ZT86IG51bWJlcikge1xuICAgICAgICBpZiAodG9rZW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc3BsaXRzOiBudW1iZXJbXSA9IFtdO1xuICAgICAgICB2YXIgZGlzcGxheUxlbmd0aCA9IHRva2Vucy5sZW5ndGg7XG4gICAgICAgIHZhciBsYXN0U3BsaXQgPSAwLCBsYXN0RG9jU3BsaXQgPSAwO1xuXG4gICAgICAgIHZhciBpc0NvZGUgPSB0aGlzLiR3cmFwQXNDb2RlO1xuXG4gICAgICAgIGZ1bmN0aW9uIGFkZFNwbGl0KHNjcmVlblBvczogbnVtYmVyKSB7XG4gICAgICAgICAgICB2YXIgZGlzcGxheWVkID0gdG9rZW5zLnNsaWNlKGxhc3RTcGxpdCwgc2NyZWVuUG9zKTtcblxuICAgICAgICAgICAgLy8gVGhlIGRvY3VtZW50IHNpemUgaXMgdGhlIGN1cnJlbnQgc2l6ZSAtIHRoZSBleHRyYSB3aWR0aCBmb3IgdGFic1xuICAgICAgICAgICAgLy8gYW5kIG11bHRpcGxlV2lkdGggY2hhcmFjdGVycy5cbiAgICAgICAgICAgIHZhciBsZW4gPSBkaXNwbGF5ZWQubGVuZ3RoO1xuICAgICAgICAgICAgZGlzcGxheWVkLmpvaW4oXCJcIikuXG4gICAgICAgICAgICAgICAgLy8gR2V0IGFsbCB0aGUgVEFCX1NQQUNFcy5cbiAgICAgICAgICAgICAgICByZXBsYWNlKC8xMi9nLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgbGVuIC09IDE7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB2b2lkIDA7XG4gICAgICAgICAgICAgICAgfSkuXG4gICAgICAgICAgICAgICAgLy8gR2V0IGFsbCB0aGUgQ0hBUl9FWFQvbXVsdGlwbGVXaWR0aCBjaGFyYWN0ZXJzLlxuICAgICAgICAgICAgICAgIHJlcGxhY2UoLzIvZywgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlbiAtPSAxO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdm9pZCAwO1xuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBsYXN0RG9jU3BsaXQgKz0gbGVuO1xuICAgICAgICAgICAgc3BsaXRzLnB1c2gobGFzdERvY1NwbGl0KTtcbiAgICAgICAgICAgIGxhc3RTcGxpdCA9IHNjcmVlblBvcztcbiAgICAgICAgfVxuXG4gICAgICAgIHdoaWxlIChkaXNwbGF5TGVuZ3RoIC0gbGFzdFNwbGl0ID4gd3JhcExpbWl0KSB7XG4gICAgICAgICAgICAvLyBUaGlzIGlzLCB3aGVyZSB0aGUgc3BsaXQgc2hvdWxkIGJlLlxuICAgICAgICAgICAgdmFyIHNwbGl0ID0gbGFzdFNwbGl0ICsgd3JhcExpbWl0O1xuXG4gICAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBhIHNwYWNlIG9yIHRhYiBhdCB0aGlzIHNwbGl0IHBvc2l0aW9uLCB0aGVuIG1ha2luZ1xuICAgICAgICAgICAgLy8gYSBzcGxpdCBpcyBzaW1wbGUuXG4gICAgICAgICAgICBpZiAodG9rZW5zW3NwbGl0IC0gMV0gPj0gU1BBQ0UgJiYgdG9rZW5zW3NwbGl0XSA+PSBTUEFDRSkge1xuICAgICAgICAgICAgICAgIC8qIGRpc2FibGVkIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYWpheG9yZy9hY2UvaXNzdWVzLzExODZcbiAgICAgICAgICAgICAgICAvLyBJbmNsdWRlIGFsbCBmb2xsb3dpbmcgc3BhY2VzICsgdGFicyBpbiB0aGlzIHNwbGl0IGFzIHdlbGwuXG4gICAgICAgICAgICAgICAgd2hpbGUgKHRva2Vuc1tzcGxpdF0gPj0gU1BBQ0UpIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQgKys7XG4gICAgICAgICAgICAgICAgfSAqL1xuICAgICAgICAgICAgICAgIGFkZFNwbGl0KHNwbGl0KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAgICAgICAvLyBDaGVjayBpZiBzcGxpdCBpcyBpbnNpZGUgb2YgYSBwbGFjZWhvbGRlci4gUGxhY2Vob2xkZXIgYXJlXG4gICAgICAgICAgICAvLyBub3Qgc3BsaXRhYmxlLiBUaGVyZWZvcmUsIHNlZWsgdGhlIGJlZ2lubmluZyBvZiB0aGUgcGxhY2Vob2xkZXJcbiAgICAgICAgICAgIC8vIGFuZCB0cnkgdG8gcGxhY2UgdGhlIHNwbGl0IGJlb2ZyZSB0aGUgcGxhY2Vob2xkZXIncyBzdGFydC5cbiAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX1NUQVJUIHx8IHRva2Vuc1tzcGxpdF0gPT0gUExBQ0VIT0xERVJfQk9EWSkge1xuICAgICAgICAgICAgICAgIC8vIFNlZWsgdGhlIHN0YXJ0IG9mIHRoZSBwbGFjZWhvbGRlciBhbmQgZG8gdGhlIHNwbGl0XG4gICAgICAgICAgICAgICAgLy8gYmVmb3JlIHRoZSBwbGFjZWhvbGRlci4gQnkgZGVmaW5pdGlvbiB0aGVyZSBhbHdheXNcbiAgICAgICAgICAgICAgICAvLyBhIFBMQUNFSE9MREVSX1NUQVJUIGJldHdlZW4gc3BsaXQgYW5kIGxhc3RTcGxpdC5cbiAgICAgICAgICAgICAgICBmb3IgKHNwbGl0OyBzcGxpdCAhPSBsYXN0U3BsaXQgLSAxOyBzcGxpdC0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbnNbc3BsaXRdID09IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzcGxpdCsrOyA8PCBObyBpbmNyZW1lbnRhbCBoZXJlIGFzIHdlIHdhbnQgdG9cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICBoYXZlIHRoZSBwb3NpdGlvbiBiZWZvcmUgdGhlIFBsYWNlaG9sZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgUExBQ0VIT0xERVJfU1RBUlQgaXMgbm90IHRoZSBpbmRleCBvZiB0aGVcbiAgICAgICAgICAgICAgICAvLyBsYXN0IHNwbGl0LCB0aGVuIHdlIGNhbiBkbyB0aGUgc3BsaXRcbiAgICAgICAgICAgICAgICBpZiAoc3BsaXQgPiBsYXN0U3BsaXQpIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkU3BsaXQoc3BsaXQpO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgUExBQ0VIT0xERVJfU1RBUlQgSVMgdGhlIGluZGV4IG9mIHRoZSBsYXN0XG4gICAgICAgICAgICAgICAgLy8gc3BsaXQsIHRoZW4gd2UgaGF2ZSB0byBwbGFjZSB0aGUgc3BsaXQgYWZ0ZXIgdGhlXG4gICAgICAgICAgICAgICAgLy8gcGxhY2Vob2xkZXIuIFNvLCBsZXQncyBzZWVrIGZvciB0aGUgZW5kIG9mIHRoZSBwbGFjZWhvbGRlci5cbiAgICAgICAgICAgICAgICBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcbiAgICAgICAgICAgICAgICBmb3IgKHNwbGl0OyBzcGxpdCA8IHRva2Vucy5sZW5ndGg7IHNwbGl0KyspIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRva2Vuc1tzcGxpdF0gIT0gUExBQ0VIT0xERVJfQk9EWSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBJZiBzcGlsdCA9PSB0b2tlbnMubGVuZ3RoLCB0aGVuIHRoZSBwbGFjZWhvbGRlciBpcyB0aGUgbGFzdFxuICAgICAgICAgICAgICAgIC8vIHRoaW5nIGluIHRoZSBsaW5lIGFuZCBhZGRpbmcgYSBuZXcgc3BsaXQgZG9lc24ndCBtYWtlIHNlbnNlLlxuICAgICAgICAgICAgICAgIGlmIChzcGxpdCA9PSB0b2tlbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrOyAgLy8gQnJlYWtzIHRoZSB3aGlsZS1sb29wLlxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEZpbmFsbHksIGFkZCB0aGUgc3BsaXQuLi5cbiAgICAgICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vID09PSBFTFNFID09PVxuICAgICAgICAgICAgLy8gU2VhcmNoIGZvciB0aGUgZmlyc3Qgbm9uIHNwYWNlL3RhYi9wbGFjZWhvbGRlci9wdW5jdHVhdGlvbiB0b2tlbiBiYWNrd2FyZHMuXG4gICAgICAgICAgICB2YXIgbWluU3BsaXQgPSBNYXRoLm1heChzcGxpdCAtIChpc0NvZGUgPyAxMCA6IHdyYXBMaW1pdCAtICh3cmFwTGltaXQgPj4gMikpLCBsYXN0U3BsaXQgLSAxKTtcbiAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBQTEFDRUhPTERFUl9TVEFSVCkge1xuICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaXNDb2RlKSB7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHNwbGl0ID4gbWluU3BsaXQgJiYgdG9rZW5zW3NwbGl0XSA8IFBMQUNFSE9MREVSX1NUQVJUKSB7XG4gICAgICAgICAgICAgICAgICAgIHNwbGl0LS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPT0gUFVOQ1RVQVRJT04pIHtcbiAgICAgICAgICAgICAgICAgICAgc3BsaXQtLTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHdoaWxlIChzcGxpdCA+IG1pblNwbGl0ICYmIHRva2Vuc1tzcGxpdF0gPCBTUEFDRSkge1xuICAgICAgICAgICAgICAgICAgICBzcGxpdC0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIElmIHdlIGZvdW5kIG9uZSwgdGhlbiBhZGQgdGhlIHNwbGl0LlxuICAgICAgICAgICAgaWYgKHNwbGl0ID4gbWluU3BsaXQpIHtcbiAgICAgICAgICAgICAgICBhZGRTcGxpdCgrK3NwbGl0KTtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gPT09IEVMU0UgPT09XG4gICAgICAgICAgICBzcGxpdCA9IGxhc3RTcGxpdCArIHdyYXBMaW1pdDtcbiAgICAgICAgICAgIC8vIFRoZSBzcGxpdCBpcyBpbnNpZGUgb2YgYSBDSEFSIG9yIENIQVJfRVhUIHRva2VuIGFuZCBubyBzcGFjZVxuICAgICAgICAgICAgLy8gYXJvdW5kIC0+IGZvcmNlIGEgc3BsaXQuXG4gICAgICAgICAgICBhZGRTcGxpdChzcGxpdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHNwbGl0cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEdpdmVuIGEgc3RyaW5nLCByZXR1cm5zIGFuIGFycmF5IG9mIHRoZSBkaXNwbGF5IGNoYXJhY3RlcnMsIGluY2x1ZGluZyB0YWJzIGFuZCBzcGFjZXMuXG4gICAgKiBAcGFyYW0ge1N0cmluZ30gc3RyIFRoZSBzdHJpbmcgdG8gY2hlY2tcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgVGhlIHZhbHVlIHRvIHN0YXJ0IGF0XG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwcml2YXRlICRnZXREaXNwbGF5VG9rZW5zKHN0cjogc3RyaW5nLCBvZmZzZXQ/OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIHZhciBhcnI6IG51bWJlcltdID0gW107XG4gICAgICAgIHZhciB0YWJTaXplOiBudW1iZXI7XG4gICAgICAgIG9mZnNldCA9IG9mZnNldCB8fCAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgYyA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICAgICAgLy8gVGFiXG4gICAgICAgICAgICBpZiAoYyA9PSA5KSB7XG4gICAgICAgICAgICAgICAgdGFiU2l6ZSA9IHRoaXMuZ2V0U2NyZWVuVGFiU2l6ZShhcnIubGVuZ3RoICsgb2Zmc2V0KTtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChUQUIpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIG4gPSAxOyBuIDwgdGFiU2l6ZTsgbisrKSB7XG4gICAgICAgICAgICAgICAgICAgIGFyci5wdXNoKFRBQl9TUEFDRSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gU3BhY2VcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPT0gMzIpIHtcbiAgICAgICAgICAgICAgICBhcnIucHVzaChTUEFDRSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICgoYyA+IDM5ICYmIGMgPCA0OCkgfHwgKGMgPiA1NyAmJiBjIDwgNjQpKSB7XG4gICAgICAgICAgICAgICAgYXJyLnB1c2goUFVOQ1RVQVRJT04pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZnVsbCB3aWR0aCBjaGFyYWN0ZXJzXG4gICAgICAgICAgICBlbHNlIGlmIChjID49IDB4MTEwMCAmJiBpc0Z1bGxXaWR0aChjKSkge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKENIQVIsIENIQVJfRVhUKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGFyci5wdXNoKENIQVIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhcnI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FsY3VsYXRlcyB0aGUgd2lkdGggb2YgdGhlIHN0cmluZyBgc3RyYCBvbiB0aGUgc2NyZWVuIHdoaWxlIGFzc3VtaW5nIHRoYXQgdGhlIHN0cmluZyBzdGFydHMgYXQgdGhlIGZpcnN0IGNvbHVtbiBvbiB0aGUgc2NyZWVuLlxuICAgICogQHBhcmFtIHtTdHJpbmd9IHN0ciBUaGUgc3RyaW5nIHRvIGNhbGN1bGF0ZSB0aGUgc2NyZWVuIHdpZHRoIG9mXG4gICAgKiBAcGFyYW0ge051bWJlcn0gbWF4U2NyZWVuQ29sdW1uXG4gICAgKiBAcGFyYW0ge051bWJlcn0gc2NyZWVuQ29sdW1uXG4gICAgKiBAcmV0dXJuIHtbTnVtYmVyXX0gUmV0dXJucyBhbiBgaW50W11gIGFycmF5IHdpdGggdHdvIGVsZW1lbnRzOjxici8+XG4gICAgKiBUaGUgZmlyc3QgcG9zaXRpb24gaW5kaWNhdGVzIHRoZSBudW1iZXIgb2YgY29sdW1ucyBmb3IgYHN0cmAgb24gc2NyZWVuLjxici8+XG4gICAgKiBUaGUgc2Vjb25kIHZhbHVlIGNvbnRhaW5zIHRoZSBwb3NpdGlvbiBvZiB0aGUgZG9jdW1lbnQgY29sdW1uIHRoYXQgdGhpcyBmdW5jdGlvbiByZWFkIHVudGlsLlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgJGdldFN0cmluZ1NjcmVlbldpZHRoKHN0cjogc3RyaW5nLCBtYXhTY3JlZW5Db2x1bW4/OiBudW1iZXIsIHNjcmVlbkNvbHVtbj86IG51bWJlcik6IG51bWJlcltdIHtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSAwKVxuICAgICAgICAgICAgcmV0dXJuIFswLCAwXTtcbiAgICAgICAgaWYgKG1heFNjcmVlbkNvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgbWF4U2NyZWVuQ29sdW1uID0gSW5maW5pdHk7XG4gICAgICAgIHNjcmVlbkNvbHVtbiA9IHNjcmVlbkNvbHVtbiB8fCAwO1xuXG4gICAgICAgIHZhciBjOiBudW1iZXI7XG4gICAgICAgIHZhciBjb2x1bW46IG51bWJlcjtcbiAgICAgICAgZm9yIChjb2x1bW4gPSAwOyBjb2x1bW4gPCBzdHIubGVuZ3RoOyBjb2x1bW4rKykge1xuICAgICAgICAgICAgYyA9IHN0ci5jaGFyQ29kZUF0KGNvbHVtbik7XG4gICAgICAgICAgICAvLyB0YWJcbiAgICAgICAgICAgIGlmIChjID09IDkpIHtcbiAgICAgICAgICAgICAgICBzY3JlZW5Db2x1bW4gKz0gdGhpcy5nZXRTY3JlZW5UYWJTaXplKHNjcmVlbkNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBmdWxsIHdpZHRoIGNoYXJhY3RlcnNcbiAgICAgICAgICAgIGVsc2UgaWYgKGMgPj0gMHgxMTAwICYmIGlzRnVsbFdpZHRoKGMpKSB7XG4gICAgICAgICAgICAgICAgc2NyZWVuQ29sdW1uICs9IDI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNjcmVlbkNvbHVtbiArPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNjcmVlbkNvbHVtbiA+IG1heFNjcmVlbkNvbHVtbikge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIFtzY3JlZW5Db2x1bW4sIGNvbHVtbl07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBSZXR1cm5zIG51bWJlciBvZiBzY3JlZW5yb3dzIGluIGEgd3JhcHBlZCBsaW5lLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IHJvdyBUaGUgcm93IG51bWJlciB0byBjaGVja1xuICAgICpcbiAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0Um93TGVuZ3RoKHJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpXG4gICAgICAgICAgICB2YXIgaCA9IHRoaXMubGluZVdpZGdldHNbcm93XSAmJiB0aGlzLmxpbmVXaWRnZXRzW3Jvd10ucm93Q291bnQgfHwgMDtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgaCA9IDBcbiAgICAgICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSB8fCAhdGhpcy4kd3JhcERhdGFbcm93XSkge1xuICAgICAgICAgICAgcmV0dXJuIDEgKyBoO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuJHdyYXBEYXRhW3Jvd10ubGVuZ3RoICsgMSArIGg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBwdWJsaWMgZ2V0Um93TGluZUNvdW50KHJvdzogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgaWYgKCF0aGlzLiR1c2VXcmFwTW9kZSB8fCAhdGhpcy4kd3JhcERhdGFbcm93XSkge1xuICAgICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XS5sZW5ndGggKyAxO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHVibGljIGdldFJvd1dyYXBJbmRlbnQoc2NyZWVuUm93OiBudW1iZXIpIHtcbiAgICAgICAgaWYgKHRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICB2YXIgcG9zID0gdGhpcy5zY3JlZW5Ub0RvY3VtZW50UG9zaXRpb24oc2NyZWVuUm93LCBOdW1iZXIuTUFYX1ZBTFVFKTtcbiAgICAgICAgICAgIHZhciBzcGxpdHMgPSB0aGlzLiR3cmFwRGF0YVtwb3Mucm93XTtcbiAgICAgICAgICAgIC8vIEZJWE1FOiBpbmRlbnQgZG9lcyBub3QgZXhpc3RzIG9uIG51bWJlcltdXG4gICAgICAgICAgICByZXR1cm4gc3BsaXRzLmxlbmd0aCAmJiBzcGxpdHNbMF0gPCBwb3MuY29sdW1uID8gc3BsaXRzWydpbmRlbnQnXSA6IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIHBvc2l0aW9uIChvbiBzY3JlZW4pIGZvciB0aGUgbGFzdCBjaGFyYWN0ZXIgaW4gdGhlIHByb3ZpZGVkIHNjcmVlbiByb3cuXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHNjcmVlblJvdyBUaGUgc2NyZWVuIHJvdyB0byBjaGVja1xuICAgICAqIEByZXR1cm4ge051bWJlcn1cbiAgICAgKlxuICAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLmRvY3VtZW50VG9TY3JlZW5Db2x1bW5cbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3c6IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHZhciBwb3MgPSB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUpO1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuQ29sdW1uKHBvcy5yb3csIHBvcy5jb2x1bW4pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBjb2x1bW4gcG9zaXRpb24gb2YgdGhlIGxhc3Qgc2NyZWVuIHJvdy5cbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NSb3dcbiAgICAqXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiovXG4gICAgcHVibGljIGdldERvY3VtZW50TGFzdFJvd0NvbHVtbihkb2NSb3csIGRvY0NvbHVtbikge1xuICAgICAgICB2YXIgc2NyZWVuUm93ID0gdGhpcy5kb2N1bWVudFRvU2NyZWVuUm93KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0U2NyZWVuTGFzdFJvd0NvbHVtbihzY3JlZW5Sb3cpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogRm9yIHRoZSBnaXZlbiBkb2N1bWVudCByb3cgYW5kIGNvbHVtbiwgdGhpcyByZXR1cm5zIHRoZSBkb2N1bWVudCBwb3NpdGlvbiBvZiB0aGUgbGFzdCByb3cuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKlxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgZ2V0RG9jdW1lbnRMYXN0Um93Q29sdW1uUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pIHtcbiAgICAgICAgdmFyIHNjcmVlblJvdyA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblJvdyhkb2NSb3csIGRvY0NvbHVtbik7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIE51bWJlci5NQVhfVkFMVUUgLyAxMCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIHJvdywgdGhpcyByZXR1cm5zIHRoZSBzcGxpdCBkYXRhLlxuICAgICogQHJldHVybiB7U3RyaW5nfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRSb3dTcGxpdERhdGEocm93OiBudW1iZXIpOiBudW1iZXJbXSB7XG4gICAgICAgIGlmICghdGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy4kd3JhcERhdGFbcm93XTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFRoZSBkaXN0YW5jZSB0byB0aGUgbmV4dCB0YWIgc3RvcCBhdCB0aGUgc3BlY2lmaWVkIHNjcmVlbiBjb2x1bW4uXG4gICAgICogQG1ldGhvcyBnZXRTY3JlZW5UYWJTaXplXG4gICAgICogQHBhcmFtIHNjcmVlbkNvbHVtbiB7bnVtYmVyfSBUaGUgc2NyZWVuIGNvbHVtbiB0byBjaGVja1xuICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgKi9cbiAgICBwdWJsaWMgZ2V0U2NyZWVuVGFiU2l6ZShzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLiR0YWJTaXplIC0gc2NyZWVuQ29sdW1uICUgdGhpcy4kdGFiU2l6ZTtcbiAgICB9XG5cblxuICAgIHB1YmxpYyBzY3JlZW5Ub0RvY3VtZW50Um93KHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikucm93O1xuICAgIH1cblxuXG4gICAgcHJpdmF0ZSBzY3JlZW5Ub0RvY3VtZW50Q29sdW1uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IG51bWJlciB7XG4gICAgICAgIHJldHVybiB0aGlzLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvbihzY3JlZW5Sb3csIHNjcmVlbkNvbHVtbikuY29sdW1uO1xuICAgIH1cblxuICAgIC8qKlxuICAgICogQ29udmVydHMgY2hhcmFjdGVycyBjb29yZGluYXRlcyBvbiB0aGUgc2NyZWVuIHRvIGNoYXJhY3RlcnMgY29vcmRpbmF0ZXMgd2l0aGluIHRoZSBkb2N1bWVudC4gW1RoaXMgdGFrZXMgaW50byBhY2NvdW50IGNvZGUgZm9sZGluZywgd29yZCB3cmFwLCB0YWIgc2l6ZSwgYW5kIGFueSBvdGhlciB2aXN1YWwgbW9kaWZpY2F0aW9ucy5dezogI2NvbnZlcnNpb25Db25zaWRlcmF0aW9uc31cbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Sb3cgVGhlIHNjcmVlbiByb3cgdG8gY2hlY2tcbiAgICAqIEBwYXJhbSB7bnVtYmVyfSBzY3JlZW5Db2x1bW4gVGhlIHNjcmVlbiBjb2x1bW4gdG8gY2hlY2tcbiAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIG9iamVjdCByZXR1cm5lZCBoYXMgdHdvIHByb3BlcnRpZXM6IGByb3dgIGFuZCBgY29sdW1uYC5cbiAgICAqKi9cbiAgICBwdWJsaWMgc2NyZWVuVG9Eb2N1bWVudFBvc2l0aW9uKHNjcmVlblJvdzogbnVtYmVyLCBzY3JlZW5Db2x1bW46IG51bWJlcik6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH0ge1xuICAgICAgICBpZiAoc2NyZWVuUm93IDwgMCkge1xuICAgICAgICAgICAgcmV0dXJuIHsgcm93OiAwLCBjb2x1bW46IDAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBsaW5lO1xuICAgICAgICB2YXIgZG9jUm93ID0gMDtcbiAgICAgICAgdmFyIGRvY0NvbHVtbiA9IDA7XG4gICAgICAgIHZhciBjb2x1bW47XG4gICAgICAgIHZhciByb3cgPSAwO1xuICAgICAgICB2YXIgcm93TGVuZ3RoID0gMDtcblxuICAgICAgICB2YXIgcm93Q2FjaGUgPSB0aGlzLiRzY3JlZW5Sb3dDYWNoZTtcbiAgICAgICAgdmFyIGkgPSB0aGlzLiRnZXRSb3dDYWNoZUluZGV4KHJvd0NhY2hlLCBzY3JlZW5Sb3cpO1xuICAgICAgICB2YXIgbCA9IHJvd0NhY2hlLmxlbmd0aDtcbiAgICAgICAgaWYgKGwgJiYgaSA+PSAwKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gcm93Q2FjaGVbaV07XG4gICAgICAgICAgICB2YXIgZG9jUm93ID0gdGhpcy4kZG9jUm93Q2FjaGVbaV07XG4gICAgICAgICAgICB2YXIgZG9DYWNoZSA9IHNjcmVlblJvdyA+IHJvd0NhY2hlW2wgLSAxXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gIWw7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbWF4Um93ID0gdGhpcy5nZXRMZW5ndGgoKSAtIDE7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKGRvY1Jvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlIChyb3cgPD0gc2NyZWVuUm93KSB7XG4gICAgICAgICAgICByb3dMZW5ndGggPSB0aGlzLmdldFJvd0xlbmd0aChkb2NSb3cpO1xuICAgICAgICAgICAgaWYgKHJvdyArIHJvd0xlbmd0aCA+IHNjcmVlblJvdyB8fCBkb2NSb3cgPj0gbWF4Um93KSB7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJvdyArPSByb3dMZW5ndGg7XG4gICAgICAgICAgICAgICAgZG9jUm93Kys7XG4gICAgICAgICAgICAgICAgaWYgKGRvY1JvdyA+IGZvbGRTdGFydCkge1xuICAgICAgICAgICAgICAgICAgICBkb2NSb3cgPSBmb2xkTGluZS5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShkb2NSb3csIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZFN0YXJ0ID0gZm9sZExpbmUgPyBmb2xkTGluZS5zdGFydC5yb3cgOiBJbmZpbml0eTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChkb0NhY2hlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUucHVzaChkb2NSb3cpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnB1c2gocm93KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmb2xkTGluZSAmJiBmb2xkTGluZS5zdGFydC5yb3cgPD0gZG9jUm93KSB7XG4gICAgICAgICAgICBsaW5lID0gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmUpO1xuICAgICAgICAgICAgZG9jUm93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB9IGVsc2UgaWYgKHJvdyArIHJvd0xlbmd0aCA8PSBzY3JlZW5Sb3cgfHwgZG9jUm93ID4gbWF4Um93KSB7XG4gICAgICAgICAgICAvLyBjbGlwIGF0IHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIHJvdzogbWF4Um93LFxuICAgICAgICAgICAgICAgIGNvbHVtbjogdGhpcy5nZXRMaW5lKG1heFJvdykubGVuZ3RoXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaW5lID0gdGhpcy5nZXRMaW5lKGRvY1Jvdyk7XG4gICAgICAgICAgICBmb2xkTGluZSA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpIHtcbiAgICAgICAgICAgIHZhciBzcGxpdHMgPSB0aGlzLiR3cmFwRGF0YVtkb2NSb3ddO1xuICAgICAgICAgICAgaWYgKHNwbGl0cykge1xuICAgICAgICAgICAgICAgIHZhciBzcGxpdEluZGV4ID0gTWF0aC5mbG9vcihzY3JlZW5Sb3cgLSByb3cpO1xuICAgICAgICAgICAgICAgIGNvbHVtbiA9IHNwbGl0c1tzcGxpdEluZGV4XTtcbiAgICAgICAgICAgICAgICBpZiAoc3BsaXRJbmRleCA+IDAgJiYgc3BsaXRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBkb2NDb2x1bW4gPSBzcGxpdHNbc3BsaXRJbmRleCAtIDFdIHx8IHNwbGl0c1tzcGxpdHMubGVuZ3RoIC0gMV07XG4gICAgICAgICAgICAgICAgICAgIGxpbmUgPSBsaW5lLnN1YnN0cmluZyhkb2NDb2x1bW4pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGRvY0NvbHVtbiArPSB0aGlzLiRnZXRTdHJpbmdTY3JlZW5XaWR0aChsaW5lLCBzY3JlZW5Db2x1bW4pWzFdO1xuXG4gICAgICAgIC8vIFdlIHJlbW92ZSBvbmUgY2hhcmFjdGVyIGF0IHRoZSBlbmQgc28gdGhhdCB0aGUgZG9jQ29sdW1uXG4gICAgICAgIC8vIHBvc2l0aW9uIHJldHVybmVkIGlzIG5vdCBhc3NvY2lhdGVkIHRvIHRoZSBuZXh0IHJvdyBvbiB0aGUgc2NyZWVuLlxuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUgJiYgZG9jQ29sdW1uID49IGNvbHVtbilcbiAgICAgICAgICAgIGRvY0NvbHVtbiA9IGNvbHVtbiAtIDE7XG5cbiAgICAgICAgaWYgKGZvbGRMaW5lKVxuICAgICAgICAgICAgcmV0dXJuIGZvbGRMaW5lLmlkeFRvUG9zaXRpb24oZG9jQ29sdW1uKTtcblxuICAgICAgICByZXR1cm4geyByb3c6IGRvY1JvdywgY29sdW1uOiBkb2NDb2x1bW4gfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIENvbnZlcnRzIGRvY3VtZW50IGNvb3JkaW5hdGVzIHRvIHNjcmVlbiBjb29yZGluYXRlcy4gezpjb252ZXJzaW9uQ29uc2lkZXJhdGlvbnN9XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93IFRoZSBkb2N1bWVudCByb3cgdG8gY2hlY2tcbiAgICAqIEBwYXJhbSB7TnVtYmVyfSBkb2NDb2x1bW4gVGhlIGRvY3VtZW50IGNvbHVtbiB0byBjaGVja1xuICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgb2JqZWN0IHJldHVybmVkIGJ5IHRoaXMgbWV0aG9kIGhhcyB0d28gcHJvcGVydGllczogYHJvd2AgYW5kIGBjb2x1bW5gLlxuICAgICpcbiAgICAqIEByZWxhdGVkIEVkaXRTZXNzaW9uLnNjcmVlblRvRG9jdW1lbnRQb3NpdGlvblxuICAgICoqL1xuICAgIHB1YmxpYyBkb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHZhciBwb3M6IHsgcm93OiBudW1iZXI7IGNvbHVtbjogbnVtYmVyIH07XG4gICAgICAgIC8vIE5vcm1hbGl6ZSB0aGUgcGFzc2VkIGluIGFyZ3VtZW50cy5cbiAgICAgICAgaWYgKHR5cGVvZiBkb2NDb2x1bW4gPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgICAgIHBvcyA9IHRoaXMuJGNsaXBQb3NpdGlvblRvRG9jdW1lbnQoZG9jUm93Wydyb3cnXSwgZG9jUm93Wydjb2x1bW4nXSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBhc3NlcnQodHlwZW9mIGRvY1JvdyA9PT0gJ251bWJlcicsIFwiZG9jUm93IG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBhc3NlcnQodHlwZW9mIGRvY0NvbHVtbiA9PT0gJ251bWJlcicsIFwiZG9jQ29sdW1uIG11c3QgYmUgYSBudW1iZXJcIik7XG4gICAgICAgICAgICBwb3MgPSB0aGlzLiRjbGlwUG9zaXRpb25Ub0RvY3VtZW50KGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRvY1JvdyA9IHBvcy5yb3c7XG4gICAgICAgIGRvY0NvbHVtbiA9IHBvcy5jb2x1bW47XG4gICAgICAgIGFzc2VydCh0eXBlb2YgZG9jUm93ID09PSAnbnVtYmVyJywgXCJkb2NSb3cgbXVzdCBiZSBhIG51bWJlclwiKTtcbiAgICAgICAgYXNzZXJ0KHR5cGVvZiBkb2NDb2x1bW4gPT09ICdudW1iZXInLCBcImRvY0NvbHVtbiBtdXN0IGJlIGEgbnVtYmVyXCIpO1xuXG4gICAgICAgIHZhciBzY3JlZW5Sb3cgPSAwO1xuICAgICAgICB2YXIgZm9sZFN0YXJ0Um93ID0gbnVsbDtcbiAgICAgICAgdmFyIGZvbGQgPSBudWxsO1xuXG4gICAgICAgIC8vIENsYW1wIHRoZSBkb2NSb3cgcG9zaXRpb24gaW4gY2FzZSBpdCdzIGluc2lkZSBvZiBhIGZvbGRlZCBibG9jay5cbiAgICAgICAgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KGRvY1JvdywgZG9jQ29sdW1uLCAxKTtcbiAgICAgICAgaWYgKGZvbGQpIHtcbiAgICAgICAgICAgIGRvY1JvdyA9IGZvbGQuc3RhcnQucm93O1xuICAgICAgICAgICAgZG9jQ29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcm93RW5kLCByb3cgPSAwO1xuXG4gICAgICAgIHZhciByb3dDYWNoZSA9IHRoaXMuJGRvY1Jvd0NhY2hlO1xuICAgICAgICB2YXIgaSA9IHRoaXMuJGdldFJvd0NhY2hlSW5kZXgocm93Q2FjaGUsIGRvY1Jvdyk7XG4gICAgICAgIHZhciBsID0gcm93Q2FjaGUubGVuZ3RoO1xuICAgICAgICBpZiAobCAmJiBpID49IDApIHtcbiAgICAgICAgICAgIHZhciByb3cgPSByb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBzY3JlZW5Sb3cgPSB0aGlzLiRzY3JlZW5Sb3dDYWNoZVtpXTtcbiAgICAgICAgICAgIHZhciBkb0NhY2hlID0gZG9jUm93ID4gcm93Q2FjaGVbbCAtIDFdO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGRvQ2FjaGUgPSAhbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0TmV4dEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIHZhciBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgIHdoaWxlIChyb3cgPCBkb2NSb3cpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPj0gZm9sZFN0YXJ0KSB7XG4gICAgICAgICAgICAgICAgcm93RW5kID0gZm9sZExpbmUuZW5kLnJvdyArIDE7XG4gICAgICAgICAgICAgICAgaWYgKHJvd0VuZCA+IGRvY1JvdylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUgPSB0aGlzLmdldE5leHRGb2xkTGluZShyb3dFbmQsIGZvbGRMaW5lKTtcbiAgICAgICAgICAgICAgICBmb2xkU3RhcnQgPSBmb2xkTGluZSA/IGZvbGRMaW5lLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcm93RW5kID0gcm93ICsgMTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc2NyZWVuUm93ICs9IHRoaXMuZ2V0Um93TGVuZ3RoKHJvdyk7XG4gICAgICAgICAgICByb3cgPSByb3dFbmQ7XG5cbiAgICAgICAgICAgIGlmIChkb0NhY2hlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy4kZG9jUm93Q2FjaGUucHVzaChyb3cpO1xuICAgICAgICAgICAgICAgIHRoaXMuJHNjcmVlblJvd0NhY2hlLnB1c2goc2NyZWVuUm93KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgdGV4dCBsaW5lIHRoYXQgaXMgZGlzcGxheWVkIGluIGRvY1JvdyBvbiB0aGUgc2NyZWVuLlxuICAgICAgICB2YXIgdGV4dExpbmUgPSBcIlwiO1xuICAgICAgICAvLyBDaGVjayBpZiB0aGUgZmluYWwgcm93IHdlIHdhbnQgdG8gcmVhY2ggaXMgaW5zaWRlIG9mIGEgZm9sZC5cbiAgICAgICAgaWYgKGZvbGRMaW5lICYmIHJvdyA+PSBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoZm9sZExpbmUsIGRvY1JvdywgZG9jQ29sdW1uKTtcbiAgICAgICAgICAgIGZvbGRTdGFydFJvdyA9IGZvbGRMaW5lLnN0YXJ0LnJvdztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRleHRMaW5lID0gdGhpcy5nZXRMaW5lKGRvY1Jvdykuc3Vic3RyaW5nKDAsIGRvY0NvbHVtbik7XG4gICAgICAgICAgICBmb2xkU3RhcnRSb3cgPSBkb2NSb3c7XG4gICAgICAgIH1cbiAgICAgICAgLy8gQ2xhbXAgdGV4dExpbmUgaWYgaW4gd3JhcE1vZGUuXG4gICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgdmFyIHdyYXBSb3cgPSB0aGlzLiR3cmFwRGF0YVtmb2xkU3RhcnRSb3ddO1xuICAgICAgICAgICAgaWYgKHdyYXBSb3cpIHtcbiAgICAgICAgICAgICAgICB2YXIgc2NyZWVuUm93T2Zmc2V0ID0gMDtcbiAgICAgICAgICAgICAgICB3aGlsZSAodGV4dExpbmUubGVuZ3RoID49IHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0XSkge1xuICAgICAgICAgICAgICAgICAgICBzY3JlZW5Sb3crKztcbiAgICAgICAgICAgICAgICAgICAgc2NyZWVuUm93T2Zmc2V0Kys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRleHRMaW5lID0gdGV4dExpbmUuc3Vic3RyaW5nKHdyYXBSb3dbc2NyZWVuUm93T2Zmc2V0IC0gMV0gfHwgMCwgdGV4dExpbmUubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICByb3c6IHNjcmVlblJvdyxcbiAgICAgICAgICAgIGNvbHVtbjogdGhpcy4kZ2V0U3RyaW5nU2NyZWVuV2lkdGgodGV4dExpbmUpWzBdXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgKiBGb3IgdGhlIGdpdmVuIGRvY3VtZW50IHJvdyBhbmQgY29sdW1uLCByZXR1cm5zIHRoZSBzY3JlZW4gY29sdW1uLlxuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY1Jvd1xuICAgICogQHBhcmFtIHtOdW1iZXJ9IGRvY0NvbHVtblxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICpcbiAgICAqKi9cbiAgICBwdWJsaWMgZG9jdW1lbnRUb1NjcmVlbkNvbHVtbihkb2NSb3c6IG51bWJlciwgZG9jQ29sdW1uOiBudW1iZXIpOiBudW1iZXIge1xuICAgICAgICByZXR1cm4gdGhpcy5kb2N1bWVudFRvU2NyZWVuUG9zaXRpb24oZG9jUm93LCBkb2NDb2x1bW4pLmNvbHVtbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIEZvciB0aGUgZ2l2ZW4gZG9jdW1lbnQgcm93IGFuZCBjb2x1bW4sIHJldHVybnMgdGhlIHNjcmVlbiByb3cuXG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jUm93XG4gICAgKiBAcGFyYW0ge051bWJlcn0gZG9jQ29sdW1uXG4gICAgKiovXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5Sb3coZG9jUm93OiBudW1iZXIsIGRvY0NvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKGRvY1JvdywgZG9jQ29sdW1uKS5yb3c7XG4gICAgfVxuXG4gICAgcHVibGljIGRvY3VtZW50VG9TY3JlZW5SYW5nZShyYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG4gICAgICAgIHZhciBzY3JlZW5Qb3NTdGFydCA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJhbmdlLnN0YXJ0LnJvdywgcmFuZ2Uuc3RhcnQuY29sdW1uKTtcbiAgICAgICAgdmFyIHNjcmVlblBvc0VuZCA9IHRoaXMuZG9jdW1lbnRUb1NjcmVlblBvc2l0aW9uKHJhbmdlLmVuZC5yb3csIHJhbmdlLmVuZC5jb2x1bW4pO1xuICAgICAgICByZXR1cm4gbmV3IFJhbmdlKHNjcmVlblBvc1N0YXJ0LnJvdywgc2NyZWVuUG9zU3RhcnQuY29sdW1uLCBzY3JlZW5Qb3NFbmQucm93LCBzY3JlZW5Qb3NFbmQuY29sdW1uKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAqIFJldHVybnMgdGhlIGxlbmd0aCBvZiB0aGUgc2NyZWVuLlxuICAgICogQHJldHVybiB7TnVtYmVyfVxuICAgICoqL1xuICAgIHB1YmxpYyBnZXRTY3JlZW5MZW5ndGgoKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIHNjcmVlblJvd3MgPSAwO1xuICAgICAgICB2YXIgZm9sZDogRm9sZExpbmUgPSBudWxsO1xuICAgICAgICBpZiAoIXRoaXMuJHVzZVdyYXBNb2RlKSB7XG4gICAgICAgICAgICBzY3JlZW5Sb3dzID0gdGhpcy5nZXRMZW5ndGgoKTtcblxuICAgICAgICAgICAgLy8gUmVtb3ZlIHRoZSBmb2xkZWQgbGluZXMgYWdhaW4uXG4gICAgICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmb2xkID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICAgICAgc2NyZWVuUm93cyAtPSBmb2xkLmVuZC5yb3cgLSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBsYXN0Um93ID0gdGhpcy4kd3JhcERhdGEubGVuZ3RoO1xuICAgICAgICAgICAgdmFyIHJvdyA9IDAsIGkgPSAwO1xuICAgICAgICAgICAgdmFyIGZvbGQgPSB0aGlzLiRmb2xkRGF0YVtpKytdO1xuICAgICAgICAgICAgdmFyIGZvbGRTdGFydCA9IGZvbGQgPyBmb2xkLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuXG4gICAgICAgICAgICB3aGlsZSAocm93IDwgbGFzdFJvdykge1xuICAgICAgICAgICAgICAgIHZhciBzcGxpdHMgPSB0aGlzLiR3cmFwRGF0YVtyb3ddO1xuICAgICAgICAgICAgICAgIHNjcmVlblJvd3MgKz0gc3BsaXRzID8gc3BsaXRzLmxlbmd0aCArIDEgOiAxO1xuICAgICAgICAgICAgICAgIHJvdysrO1xuICAgICAgICAgICAgICAgIGlmIChyb3cgPiBmb2xkU3RhcnQpIHtcbiAgICAgICAgICAgICAgICAgICAgcm93ID0gZm9sZC5lbmQucm93ICsgMTtcbiAgICAgICAgICAgICAgICAgICAgZm9sZCA9IHRoaXMuJGZvbGREYXRhW2krK107XG4gICAgICAgICAgICAgICAgICAgIGZvbGRTdGFydCA9IGZvbGQgPyBmb2xkLnN0YXJ0LnJvdyA6IEluZmluaXR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRvZG9cbiAgICAgICAgaWYgKHRoaXMubGluZVdpZGdldHMpIHtcbiAgICAgICAgICAgIHNjcmVlblJvd3MgKz0gdGhpcy4kZ2V0V2lkZ2V0U2NyZWVuTGVuZ3RoKCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gc2NyZWVuUm93cztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHB1YmxpYyAkc2V0Rm9udE1ldHJpY3MoZm06IEZvbnRNZXRyaWNzKSB7XG4gICAgICAgIC8vIFRPRE8/XG4gICAgfVxuXG4gICAgZmluZE1hdGNoaW5nQnJhY2tldChwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSwgY2hyPzogc3RyaW5nKTogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSB7XG4gICAgICAgIHJldHVybiB0aGlzLiRicmFja2V0TWF0Y2hlci5maW5kTWF0Y2hpbmdCcmFja2V0KHBvc2l0aW9uLCBjaHIpO1xuICAgIH1cblxuICAgIGdldEJyYWNrZXRSYW5nZShwb3NpdGlvbjogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfSk6IFJhbmdlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLmdldEJyYWNrZXRSYW5nZShwb3NpdGlvbik7XG4gICAgfVxuXG4gICAgJGZpbmRPcGVuaW5nQnJhY2tldChicmFja2V0OiBzdHJpbmcsIHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0eXBlUmU/OiBSZWdFeHApOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLiRmaW5kT3BlbmluZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gICAgfVxuXG4gICAgJGZpbmRDbG9zaW5nQnJhY2tldChicmFja2V0OiBzdHJpbmcsIHBvc2l0aW9uOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9LCB0eXBlUmU/OiBSZWdFeHApOiB7IHJvdzogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuJGJyYWNrZXRNYXRjaGVyLiRmaW5kQ2xvc2luZ0JyYWNrZXQoYnJhY2tldCwgcG9zaXRpb24sIHR5cGVSZSk7XG4gICAgfVxuICAgIHByaXZhdGUgJGZvbGRNb2RlO1xuXG4gICAgLy8gc3RydWN0dXJlZCBmb2xkaW5nXG4gICAgJGZvbGRTdHlsZXMgPSB7XG4gICAgICAgIFwibWFudWFsXCI6IDEsXG4gICAgICAgIFwibWFya2JlZ2luXCI6IDEsXG4gICAgICAgIFwibWFya2JlZ2luZW5kXCI6IDFcbiAgICB9XG4gICAgJGZvbGRTdHlsZSA9IFwibWFya2JlZ2luXCI7XG4gICAgLypcbiAgICAgKiBMb29rcyB1cCBhIGZvbGQgYXQgYSBnaXZlbiByb3cvY29sdW1uLiBQb3NzaWJsZSB2YWx1ZXMgZm9yIHNpZGU6XG4gICAgICogICAtMTogaWdub3JlIGEgZm9sZCBpZiBmb2xkLnN0YXJ0ID0gcm93L2NvbHVtblxuICAgICAqICAgKzE6IGlnbm9yZSBhIGZvbGQgaWYgZm9sZC5lbmQgPSByb3cvY29sdW1uXG4gICAgICovXG4gICAgZ2V0Rm9sZEF0KHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgc2lkZT86IG51bWJlcik6IEZvbGQge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKHJvdyk7XG4gICAgICAgIGlmICghZm9sZExpbmUpXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcblxuICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZS5mb2xkcztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGQgPSBmb2xkc1tpXTtcbiAgICAgICAgICAgIGlmIChmb2xkLnJhbmdlLmNvbnRhaW5zKHJvdywgY29sdW1uKSkge1xuICAgICAgICAgICAgICAgIGlmIChzaWRlID09PSAxICYmIGZvbGQucmFuZ2UuaXNFbmQocm93LCBjb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc2lkZSA9PT0gLTEgJiYgZm9sZC5yYW5nZS5pc1N0YXJ0KHJvdywgY29sdW1uKSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvbGQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKlxuICAgICAqIFJldHVybnMgYWxsIGZvbGRzIGluIHRoZSBnaXZlbiByYW5nZS4gTm90ZSwgdGhhdCB0aGlzIHdpbGwgcmV0dXJuIGZvbGRzXG4gICAgICpcbiAgICAgKi9cbiAgICBnZXRGb2xkc0luUmFuZ2UocmFuZ2U6IFJhbmdlKTogRm9sZFtdIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgIHZhciBlbmQgPSByYW5nZS5lbmQ7XG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGZvdW5kRm9sZHM6IEZvbGRbXSA9IFtdO1xuXG4gICAgICAgIHN0YXJ0LmNvbHVtbiArPSAxO1xuICAgICAgICBlbmQuY29sdW1uIC09IDE7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjbXAgPSBmb2xkTGluZXNbaV0ucmFuZ2UuY29tcGFyZVJhbmdlKHJhbmdlKTtcbiAgICAgICAgICAgIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgICAgICAgIC8vIFJhbmdlIGlzIGJlZm9yZSBmb2xkTGluZS4gTm8gaW50ZXJzZWN0aW9uLiBUaGlzIG1lYW5zLFxuICAgICAgICAgICAgICAgIC8vIHRoZXJlIG1pZ2h0IGJlIG90aGVyIGZvbGRMaW5lcyB0aGF0IGludGVyc2VjdC5cbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGNtcCA9PSAtMikge1xuICAgICAgICAgICAgICAgIC8vIFJhbmdlIGlzIGFmdGVyIGZvbGRMaW5lLiBUaGVyZSBjYW4ndCBiZSBhbnkgb3RoZXIgZm9sZExpbmVzIHRoZW4sXG4gICAgICAgICAgICAgICAgLy8gc28gbGV0J3MgZ2l2ZSB1cC5cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGZvbGRzID0gZm9sZExpbmVzW2ldLmZvbGRzO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBmb2xkcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIHZhciBmb2xkID0gZm9sZHNbal07XG4gICAgICAgICAgICAgICAgY21wID0gZm9sZC5yYW5nZS5jb21wYXJlUmFuZ2UocmFuZ2UpO1xuICAgICAgICAgICAgICAgIGlmIChjbXAgPT0gLTIpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjbXAgPT0gMikge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgICAgICAgLy8gV1RGLXN0YXRlOiBDYW4gaGFwcGVuIGR1ZSB0byAtMS8rMSB0byBzdGFydC9lbmQgY29sdW1uLlxuICAgICAgICAgICAgICAgICAgICBpZiAoY21wID09IDQyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGZvdW5kRm9sZHMucHVzaChmb2xkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBzdGFydC5jb2x1bW4gLT0gMTtcbiAgICAgICAgZW5kLmNvbHVtbiArPSAxO1xuXG4gICAgICAgIHJldHVybiBmb3VuZEZvbGRzO1xuICAgIH1cblxuICAgIGdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2VzKTogRm9sZFtdIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocmFuZ2VzKSkge1xuICAgICAgICAgICAgdmFyIGZvbGRzOiBGb2xkW10gPSBbXTtcbiAgICAgICAgICAgIHJhbmdlcy5mb3JFYWNoKGZ1bmN0aW9uKHJhbmdlKSB7XG4gICAgICAgICAgICAgICAgZm9sZHMgPSBmb2xkcy5jb25jYXQodGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2UpKTtcbiAgICAgICAgICAgIH0sIHRoaXMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UocmFuZ2VzKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZm9sZHM7XG4gICAgfVxuICAgIFxuICAgIC8qXG4gICAgICogUmV0dXJucyBhbGwgZm9sZHMgaW4gdGhlIGRvY3VtZW50XG4gICAgICovXG4gICAgZ2V0QWxsRm9sZHMoKTogRm9sZFtdIHtcbiAgICAgICAgdmFyIGZvbGRzID0gW107XG4gICAgICAgIHZhciBmb2xkTGluZXMgPSB0aGlzLiRmb2xkRGF0YTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRMaW5lcy5sZW5ndGg7IGkrKylcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgZm9sZExpbmVzW2ldLmZvbGRzLmxlbmd0aDsgaisrKVxuICAgICAgICAgICAgICAgIGZvbGRzLnB1c2goZm9sZExpbmVzW2ldLmZvbGRzW2pdKTtcblxuICAgICAgICByZXR1cm4gZm9sZHM7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBSZXR1cm5zIHRoZSBzdHJpbmcgYmV0d2VlbiBmb2xkcyBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24uXG4gICAgICogRS5nLlxuICAgICAqICBmb288Zm9sZD5ifGFyPGZvbGQ+d29scmQgLT4gXCJiYXJcIlxuICAgICAqICBmb288Zm9sZD5iYXI8Zm9sZD53b2x8cmQgLT4gXCJ3b3JsZFwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb3xsZD53b2xyZCAtPiA8bnVsbD5cbiAgICAgKlxuICAgICAqIHdoZXJlIHwgbWVhbnMgdGhlIHBvc2l0aW9uIG9mIHJvdy9jb2x1bW5cbiAgICAgKlxuICAgICAqIFRoZSB0cmltIG9wdGlvbiBkZXRlcm1zIGlmIHRoZSByZXR1cm4gc3RyaW5nIHNob3VsZCBiZSB0cmltZWQgYWNjb3JkaW5nXG4gICAgICogdG8gdGhlIFwic2lkZVwiIHBhc3NlZCB3aXRoIHRoZSB0cmltIHZhbHVlOlxuICAgICAqXG4gICAgICogRS5nLlxuICAgICAqICBmb288Zm9sZD5ifGFyPGZvbGQ+d29scmQgLXRyaW09LTE+IFwiYlwiXG4gICAgICogIGZvbzxmb2xkPmJhcjxmb2xkPndvbHxyZCAtdHJpbT0rMT4gXCJybGRcIlxuICAgICAqICBmb3xvPGZvbGQ+YmFyPGZvbGQ+d29scmQgLXRyaW09MDA+IFwiZm9vXCJcbiAgICAgKi9cbiAgICBnZXRGb2xkU3RyaW5nQXQocm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCB0cmltOiBudW1iZXIsIGZvbGRMaW5lPzogRm9sZExpbmUpOiBzdHJpbmcge1xuICAgICAgICBmb2xkTGluZSA9IGZvbGRMaW5lIHx8IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcbiAgICAgICAgaWYgKCFmb2xkTGluZSlcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICAgIHZhciBsYXN0Rm9sZCA9IHtcbiAgICAgICAgICAgIGVuZDogeyBjb2x1bW46IDAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBUT0RPOiBSZWZhY3RvciB0byB1c2UgZ2V0TmV4dEZvbGRUbyBmdW5jdGlvbi5cbiAgICAgICAgdmFyIHN0cjogc3RyaW5nO1xuICAgICAgICB2YXIgZm9sZDogRm9sZDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmb2xkTGluZS5mb2xkcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgZm9sZCA9IGZvbGRMaW5lLmZvbGRzW2ldO1xuICAgICAgICAgICAgdmFyIGNtcCA9IGZvbGQucmFuZ2UuY29tcGFyZUVuZChyb3csIGNvbHVtbik7XG4gICAgICAgICAgICBpZiAoY21wID09IC0xKSB7XG4gICAgICAgICAgICAgICAgc3RyID0gdGhpcy5nZXRMaW5lKGZvbGQuc3RhcnQucm93KS5zdWJzdHJpbmcobGFzdEZvbGQuZW5kLmNvbHVtbiwgZm9sZC5zdGFydC5jb2x1bW4pO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoY21wID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsYXN0Rm9sZCA9IGZvbGQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFzdHIpXG4gICAgICAgICAgICBzdHIgPSB0aGlzLmdldExpbmUoZm9sZC5zdGFydC5yb3cpLnN1YnN0cmluZyhsYXN0Rm9sZC5lbmQuY29sdW1uKTtcblxuICAgICAgICBpZiAodHJpbSA9PSAtMSlcbiAgICAgICAgICAgIHJldHVybiBzdHIuc3Vic3RyaW5nKDAsIGNvbHVtbiAtIGxhc3RGb2xkLmVuZC5jb2x1bW4pO1xuICAgICAgICBlbHNlIGlmICh0cmltID09IDEpXG4gICAgICAgICAgICByZXR1cm4gc3RyLnN1YnN0cmluZyhjb2x1bW4gLSBsYXN0Rm9sZC5lbmQuY29sdW1uKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG5cbiAgICBnZXRGb2xkTGluZShkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkTGluZT86IEZvbGRMaW5lKTogRm9sZExpbmUge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICBpZiAoc3RhcnRGb2xkTGluZSlcbiAgICAgICAgICAgIGkgPSBmb2xkRGF0YS5pbmRleE9mKHN0YXJ0Rm9sZExpbmUpO1xuICAgICAgICBpZiAoaSA9PSAtMSlcbiAgICAgICAgICAgIGkgPSAwO1xuICAgICAgICBmb3IgKGk7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUuc3RhcnQucm93IDw9IGRvY1JvdyAmJiBmb2xkTGluZS5lbmQucm93ID49IGRvY1Jvdykge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkTGluZTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZm9sZExpbmUuZW5kLnJvdyA+IGRvY1Jvdykge1xuICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIC8vIHJldHVybnMgdGhlIGZvbGQgd2hpY2ggc3RhcnRzIGFmdGVyIG9yIGNvbnRhaW5zIGRvY1Jvd1xuICAgIGdldE5leHRGb2xkTGluZShkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkTGluZT86IEZvbGRMaW5lKTogRm9sZExpbmUge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGkgPSAwO1xuICAgICAgICBpZiAoc3RhcnRGb2xkTGluZSlcbiAgICAgICAgICAgIGkgPSBmb2xkRGF0YS5pbmRleE9mKHN0YXJ0Rm9sZExpbmUpO1xuICAgICAgICBpZiAoaSA9PSAtMSlcbiAgICAgICAgICAgIGkgPSAwO1xuICAgICAgICBmb3IgKGk7IGkgPCBmb2xkRGF0YS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZERhdGFbaV07XG4gICAgICAgICAgICBpZiAoZm9sZExpbmUuZW5kLnJvdyA+PSBkb2NSb3cpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm9sZExpbmU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZ2V0Rm9sZGVkUm93Q291bnQoZmlyc3Q6IG51bWJlciwgbGFzdDogbnVtYmVyKTogbnVtYmVyIHtcbiAgICAgICAgdmFyIGZvbGREYXRhID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciByb3dDb3VudCA9IGxhc3QgLSBmaXJzdCArIDE7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZm9sZERhdGEubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBmb2xkTGluZSA9IGZvbGREYXRhW2ldLFxuICAgICAgICAgICAgICAgIGVuZCA9IGZvbGRMaW5lLmVuZC5yb3csXG4gICAgICAgICAgICAgICAgc3RhcnQgPSBmb2xkTGluZS5zdGFydC5yb3c7XG4gICAgICAgICAgICBpZiAoZW5kID49IGxhc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RhcnQgPCBsYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChzdGFydCA+PSBmaXJzdClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvd0NvdW50IC09IGxhc3QgLSBzdGFydDtcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgcm93Q291bnQgPSAwOy8vaW4gb25lIGZvbGRcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGVuZCA+PSBmaXJzdCkge1xuICAgICAgICAgICAgICAgIGlmIChzdGFydCA+PSBmaXJzdCkgLy9mb2xkIGluc2lkZSByYW5nZVxuICAgICAgICAgICAgICAgICAgICByb3dDb3VudCAtPSBlbmQgLSBzdGFydDtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIHJvd0NvdW50IC09IGVuZCAtIGZpcnN0ICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcm93Q291bnQ7XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkYWRkRm9sZExpbmUoZm9sZExpbmU6IEZvbGRMaW5lKSB7XG4gICAgICAgIHRoaXMuJGZvbGREYXRhLnB1c2goZm9sZExpbmUpO1xuICAgICAgICB0aGlzLiRmb2xkRGF0YS5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICAgIHJldHVybiBhLnN0YXJ0LnJvdyAtIGIuc3RhcnQucm93O1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIGZvbGRMaW5lO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEFkZHMgYSBuZXcgZm9sZC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5cbiAgICAgKiAgICAgIFRoZSBuZXcgY3JlYXRlZCBGb2xkIG9iamVjdCBvciBhbiBleGlzdGluZyBmb2xkIG9iamVjdCBpbiBjYXNlIHRoZVxuICAgICAqICAgICAgcGFzc2VkIGluIHJhbmdlIGZpdHMgYW4gZXhpc3RpbmcgZm9sZCBleGFjdGx5LlxuICAgICAqL1xuICAgIGFkZEZvbGQocGxhY2Vob2xkZXI6IHN0cmluZyB8IEZvbGQsIHJhbmdlOiBSYW5nZSk6IEZvbGQge1xuICAgICAgICB2YXIgZm9sZERhdGEgPSB0aGlzLiRmb2xkRGF0YTtcbiAgICAgICAgdmFyIGFkZGVkID0gZmFsc2U7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuXG4gICAgICAgIGlmIChwbGFjZWhvbGRlciBpbnN0YW5jZW9mIEZvbGQpXG4gICAgICAgICAgICBmb2xkID0gcGxhY2Vob2xkZXI7XG4gICAgICAgIGVsc2UgaWYgKHR5cGVvZiBwbGFjZWhvbGRlciA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGZvbGQgPSBuZXcgRm9sZChyYW5nZSwgcGxhY2Vob2xkZXIpO1xuICAgICAgICAgICAgZm9sZC5jb2xsYXBzZUNoaWxkcmVuID0gcmFuZ2UuY29sbGFwc2VDaGlsZHJlbjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInBsYWNlaG9sZGVyIG11c3QgYmUgYSBzdHJpbmcgb3IgYSBGb2xkLlwiKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBGSVhNRTogJGNsaXBSYW5nZVRvRG9jdW1lbnQ/XG4gICAgICAgIC8vIGZvbGQucmFuZ2UgPSB0aGlzLmNsaXBSYW5nZShmb2xkLnJhbmdlKTtcbiAgICAgICAgZm9sZC5yYW5nZSA9IHRoaXMuJGNsaXBSYW5nZVRvRG9jdW1lbnQoZm9sZC5yYW5nZSlcblxuICAgICAgICB2YXIgc3RhcnRSb3cgPSBmb2xkLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIHN0YXJ0Q29sdW1uID0gZm9sZC5zdGFydC5jb2x1bW47XG4gICAgICAgIHZhciBlbmRSb3cgPSBmb2xkLmVuZC5yb3c7XG4gICAgICAgIHZhciBlbmRDb2x1bW4gPSBmb2xkLmVuZC5jb2x1bW47XG5cbiAgICAgICAgLy8gLS0tIFNvbWUgY2hlY2tpbmcgLS0tXG4gICAgICAgIGlmICghKHN0YXJ0Um93IDwgZW5kUm93IHx8XG4gICAgICAgICAgICBzdGFydFJvdyA9PSBlbmRSb3cgJiYgc3RhcnRDb2x1bW4gPD0gZW5kQ29sdW1uIC0gMikpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGUgcmFuZ2UgaGFzIHRvIGJlIGF0IGxlYXN0IDIgY2hhcmFjdGVycyB3aWR0aFwiKTtcblxuICAgICAgICB2YXIgc3RhcnRGb2xkID0gdGhpcy5nZXRGb2xkQXQoc3RhcnRSb3csIHN0YXJ0Q29sdW1uLCAxKTtcbiAgICAgICAgdmFyIGVuZEZvbGQgPSB0aGlzLmdldEZvbGRBdChlbmRSb3csIGVuZENvbHVtbiwgLTEpO1xuICAgICAgICBpZiAoc3RhcnRGb2xkICYmIGVuZEZvbGQgPT0gc3RhcnRGb2xkKVxuICAgICAgICAgICAgcmV0dXJuIHN0YXJ0Rm9sZC5hZGRTdWJGb2xkKGZvbGQpO1xuXG4gICAgICAgIGlmIChcbiAgICAgICAgICAgIChzdGFydEZvbGQgJiYgIXN0YXJ0Rm9sZC5yYW5nZS5pc1N0YXJ0KHN0YXJ0Um93LCBzdGFydENvbHVtbikpXG4gICAgICAgICAgICB8fCAoZW5kRm9sZCAmJiAhZW5kRm9sZC5yYW5nZS5pc0VuZChlbmRSb3csIGVuZENvbHVtbikpXG4gICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQSBmb2xkIGNhbid0IGludGVyc2VjdCBhbHJlYWR5IGV4aXN0aW5nIGZvbGRcIiArIGZvbGQucmFuZ2UgKyBzdGFydEZvbGQucmFuZ2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlcmUgYXJlIGZvbGRzIGluIHRoZSByYW5nZSB3ZSBjcmVhdGUgdGhlIG5ldyBmb2xkIGZvci5cbiAgICAgICAgdmFyIGZvbGRzID0gdGhpcy5nZXRGb2xkc0luUmFuZ2UoZm9sZC5yYW5nZSk7XG4gICAgICAgIGlmIChmb2xkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGZvbGRzIGZyb20gZm9sZCBkYXRhLlxuICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkcyhmb2xkcyk7XG4gICAgICAgICAgICAvLyBBZGQgdGhlIHJlbW92ZWQgZm9sZHMgYXMgc3ViZm9sZHMgb24gdGhlIG5ldyBmb2xkLlxuICAgICAgICAgICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihzdWJGb2xkKSB7XG4gICAgICAgICAgICAgICAgZm9sZC5hZGRTdWJGb2xkKHN1YkZvbGQpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGREYXRhLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZm9sZExpbmUgPSBmb2xkRGF0YVtpXTtcbiAgICAgICAgICAgIGlmIChlbmRSb3cgPT0gZm9sZExpbmUuc3RhcnQucm93KSB7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICBhZGRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChzdGFydFJvdyA9PSBmb2xkTGluZS5lbmQucm93KSB7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuYWRkRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICBhZGRlZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgaWYgKCFmb2xkLnNhbWVSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgd2UgbWlnaHQgaGF2ZSB0byBtZXJnZSB0d28gRm9sZExpbmVzLlxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZExpbmVOZXh0ID0gZm9sZERhdGFbaSArIDFdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmVOZXh0ICYmIGZvbGRMaW5lTmV4dC5zdGFydC5yb3cgPT0gZW5kUm93KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSBuZWVkIHRvIG1lcmdlIVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUubWVyZ2UoZm9sZExpbmVOZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoZW5kUm93IDw9IGZvbGRMaW5lLnN0YXJ0LnJvdykge1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCFhZGRlZClcbiAgICAgICAgICAgIGZvbGRMaW5lID0gdGhpcy4kYWRkRm9sZExpbmUobmV3IEZvbGRMaW5lKHRoaXMuJGZvbGREYXRhLCBbZm9sZF0pKTtcblxuICAgICAgICBpZiAodGhpcy4kdXNlV3JhcE1vZGUpXG4gICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShmb2xkTGluZS5zdGFydC5yb3csIGZvbGRMaW5lLnN0YXJ0LnJvdyk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVJvd0xlbmd0aENhY2hlKGZvbGRMaW5lLnN0YXJ0LnJvdywgZm9sZExpbmUuc3RhcnQucm93KTtcblxuICAgICAgICAvLyBOb3RpZnkgdGhhdCBmb2xkIGRhdGEgaGFzIGNoYW5nZWQuXG4gICAgICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VGb2xkXCIsIHsgZGF0YTogZm9sZCwgYWN0aW9uOiBcImFkZFwiIH0pO1xuXG4gICAgICAgIHJldHVybiBmb2xkO1xuICAgIH1cblxuICAgIHNldE1vZGlmaWVkKG1vZGlmaWVkOiBib29sZWFuKSB7XG5cbiAgICB9XG5cbiAgICBhZGRGb2xkcyhmb2xkczogRm9sZFtdKSB7XG4gICAgICAgIGZvbGRzLmZvckVhY2goZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkKGZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICB9XG5cbiAgICByZW1vdmVGb2xkKGZvbGQ6IEZvbGQpOiB2b2lkIHtcbiAgICAgICAgdmFyIGZvbGRMaW5lID0gZm9sZC5mb2xkTGluZTtcbiAgICAgICAgdmFyIHN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICB2YXIgZW5kUm93ID0gZm9sZExpbmUuZW5kLnJvdztcblxuICAgICAgICB2YXIgZm9sZExpbmVzID0gdGhpcy4kZm9sZERhdGE7XG4gICAgICAgIHZhciBmb2xkcyA9IGZvbGRMaW5lLmZvbGRzO1xuICAgICAgICAvLyBTaW1wbGUgY2FzZSB3aGVyZSB0aGVyZSBpcyBvbmx5IG9uZSBmb2xkIGluIHRoZSBGb2xkTGluZSBzdWNoIHRoYXRcbiAgICAgICAgLy8gdGhlIGVudGlyZSBmb2xkIGxpbmUgY2FuIGdldCByZW1vdmVkIGRpcmVjdGx5LlxuICAgICAgICBpZiAoZm9sZHMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgICAgIGZvbGRMaW5lcy5zcGxpY2UoZm9sZExpbmVzLmluZGV4T2YoZm9sZExpbmUpLCAxKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyB0aGUgbGFzdCBmb2xkIG9mIHRoZSBmb2xkTGluZSwganVzdCByZW1vdmUgaXQuXG4gICAgICAgICAgICBpZiAoZm9sZExpbmUucmFuZ2UuaXNFbmQoZm9sZC5lbmQucm93LCBmb2xkLmVuZC5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgZm9sZHMucG9wKCk7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLnJvdyA9IGZvbGRzW2ZvbGRzLmxlbmd0aCAtIDFdLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgZm9sZExpbmUuZW5kLmNvbHVtbiA9IGZvbGRzW2ZvbGRzLmxlbmd0aCAtIDFdLmVuZC5jb2x1bW47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIGZvbGQgaXMgdGhlIGZpcnN0IGZvbGQgb2YgdGhlIGZvbGRMaW5lLCBqdXN0IHJlbW92ZSBpdC5cbiAgICAgICAgICAgICAgICBpZiAoZm9sZExpbmUucmFuZ2UuaXNTdGFydChmb2xkLnN0YXJ0LnJvdywgZm9sZC5zdGFydC5jb2x1bW4pKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRzLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZvbGRMaW5lLnN0YXJ0LnJvdyA9IGZvbGRzWzBdLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgZm9sZExpbmUuc3RhcnQuY29sdW1uID0gZm9sZHNbMF0uc3RhcnQuY29sdW1uO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIC8vIFdlIGtub3cgdGhlcmUgYXJlIG1vcmUgdGhlbiAyIGZvbGRzIGFuZCB0aGUgZm9sZCBpcyBub3QgYXQgdGhlIGVkZ2UuXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgbWVhbnMsIHRoZSBmb2xkIGlzIHNvbWV3aGVyZSBpbiBiZXR3ZWVuLlxuICAgICAgICAgICAgICAgICAgICAvL1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZm9sZCBpcyBpbiBvbmUgcm93LCB3ZSBqdXN0IGNhbiByZW1vdmUgaXQuXG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkLnNhbWVSb3cpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvbGRzLnNwbGljZShmb2xkcy5pbmRleE9mKGZvbGQpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgICAgICAgIC8vIFRoZSBmb2xkIGdvZXMgb3ZlciBtb3JlIHRoZW4gb25lIHJvdy4gVGhpcyBtZWFucyByZW12b2luZyB0aGlzIGZvbGRcbiAgICAgICAgICAgICAgICAgICAgLy8gd2lsbCBjYXVzZSB0aGUgZm9sZCBsaW5lIHRvIGdldCBzcGxpdHRlZCB1cC4gbmV3Rm9sZExpbmUgaXMgdGhlIHNlY29uZCBwYXJ0XG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBuZXdGb2xkTGluZSA9IGZvbGRMaW5lLnNwbGl0KGZvbGQuc3RhcnQucm93LCBmb2xkLnN0YXJ0LmNvbHVtbik7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb2xkcyA9IG5ld0ZvbGRMaW5lLmZvbGRzO1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZHMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld0ZvbGRMaW5lLnN0YXJ0LnJvdyA9IGZvbGRzWzBdLnN0YXJ0LnJvdztcbiAgICAgICAgICAgICAgICAgICAgICAgIG5ld0ZvbGRMaW5lLnN0YXJ0LmNvbHVtbiA9IGZvbGRzWzBdLnN0YXJ0LmNvbHVtbjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy4kdXBkYXRpbmcpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSlcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVXcmFwRGF0YShzdGFydFJvdywgZW5kUm93KTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICB0aGlzLiR1cGRhdGVSb3dMZW5ndGhDYWNoZShzdGFydFJvdywgZW5kUm93KTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgLy8gTm90aWZ5IHRoYXQgZm9sZCBkYXRhIGhhcyBjaGFuZ2VkLlxuICAgICAgICB0aGlzLnNldE1vZGlmaWVkKHRydWUpO1xuICAgICAgICB0aGlzLl9lbWl0KFwiY2hhbmdlRm9sZFwiLCB7IGRhdGE6IGZvbGQsIGFjdGlvbjogXCJyZW1vdmVcIiB9KTtcbiAgICB9XG5cbiAgICByZW1vdmVGb2xkcyhmb2xkczogRm9sZFtdKTogdm9pZCB7XG4gICAgICAgIC8vIFdlIG5lZWQgdG8gY2xvbmUgdGhlIGZvbGRzIGFycmF5IHBhc3NlZCBpbiBhcyBpdCBtaWdodCBiZSB0aGUgZm9sZHNcbiAgICAgICAgLy8gYXJyYXkgb2YgYSBmb2xkIGxpbmUgYW5kIGFzIHdlIGNhbGwgdGhpcy5yZW1vdmVGb2xkKGZvbGQpLCBmb2xkc1xuICAgICAgICAvLyBhcmUgcmVtb3ZlZCBmcm9tIGZvbGRzIGFuZCBjaGFuZ2VzIHRoZSBjdXJyZW50IGluZGV4LlxuICAgICAgICB2YXIgY2xvbmVGb2xkcyA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZvbGRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjbG9uZUZvbGRzLnB1c2goZm9sZHNbaV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY2xvbmVGb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKGZvbGQpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgfSwgdGhpcyk7XG4gICAgICAgIHRoaXMuc2V0TW9kaWZpZWQodHJ1ZSk7XG4gICAgfVxuXG4gICAgZXhwYW5kRm9sZChmb2xkOiBGb2xkKTogdm9pZCB7XG4gICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgZm9sZC5zdWJGb2xkcy5mb3JFYWNoKGZ1bmN0aW9uKHN1YkZvbGQpIHtcbiAgICAgICAgICAgIGZvbGQucmVzdG9yZVJhbmdlKHN1YkZvbGQpO1xuICAgICAgICAgICAgdGhpcy5hZGRGb2xkKHN1YkZvbGQpO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgICAgaWYgKGZvbGQuY29sbGFwc2VDaGlsZHJlbiA+IDApIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZEFsbChmb2xkLnN0YXJ0LnJvdyArIDEsIGZvbGQuZW5kLnJvdywgZm9sZC5jb2xsYXBzZUNoaWxkcmVuIC0gMSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9sZC5zdWJGb2xkcyA9IFtdO1xuICAgIH1cblxuICAgIGV4cGFuZEZvbGRzKGZvbGRzOiBGb2xkW10pIHtcbiAgICAgICAgZm9sZHMuZm9yRWFjaChmdW5jdGlvbihmb2xkKSB7XG4gICAgICAgICAgICB0aGlzLmV4cGFuZEZvbGQoZm9sZCk7XG4gICAgICAgIH0sIHRoaXMpO1xuICAgIH1cblxuICAgIHVuZm9sZChsb2NhdGlvbj86IGFueSwgZXhwYW5kSW5uZXI/OiBib29sZWFuKTogRm9sZFtdIHtcbiAgICAgICAgdmFyIHJhbmdlOiBSYW5nZTtcbiAgICAgICAgdmFyIGZvbGRzOiBGb2xkW107XG4gICAgICAgIGlmIChsb2NhdGlvbiA9PSBudWxsKSB7XG4gICAgICAgICAgICByYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCB0aGlzLmdldExlbmd0aCgpLCAwKTtcbiAgICAgICAgICAgIGV4cGFuZElubmVyID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgbG9jYXRpb24gPT0gXCJudW1iZXJcIilcbiAgICAgICAgICAgIHJhbmdlID0gbmV3IFJhbmdlKGxvY2F0aW9uLCAwLCBsb2NhdGlvbiwgdGhpcy5nZXRMaW5lKGxvY2F0aW9uKS5sZW5ndGgpO1xuICAgICAgICBlbHNlIGlmIChcInJvd1wiIGluIGxvY2F0aW9uKVxuICAgICAgICAgICAgcmFuZ2UgPSBSYW5nZS5mcm9tUG9pbnRzKGxvY2F0aW9uLCBsb2NhdGlvbik7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHJhbmdlID0gbG9jYXRpb247XG5cbiAgICAgICAgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2UpO1xuICAgICAgICBpZiAoZXhwYW5kSW5uZXIpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZHMoZm9sZHMpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHN1YkZvbGRzID0gZm9sZHM7XG4gICAgICAgICAgICAvLyBUT0RPOiBtaWdodCBiZSBiZXR0ZXIgdG8gcmVtb3ZlIGFuZCBhZGQgZm9sZHMgaW4gb25lIGdvIGluc3RlYWQgb2YgdXNpbmdcbiAgICAgICAgICAgIC8vIGV4cGFuZEZvbGRzIHNldmVyYWwgdGltZXMuXG4gICAgICAgICAgICB3aGlsZSAoc3ViRm9sZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkcyhzdWJGb2xkcyk7XG4gICAgICAgICAgICAgICAgc3ViRm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZUxpc3QocmFuZ2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChmb2xkcy5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm4gZm9sZHM7XG4gICAgfVxuXG4gICAgLypcbiAgICAgKiBDaGVja3MgaWYgYSBnaXZlbiBkb2N1bWVudFJvdyBpcyBmb2xkZWQuIFRoaXMgaXMgdHJ1ZSBpZiB0aGVyZSBhcmUgc29tZVxuICAgICAqIGZvbGRlZCBwYXJ0cyBzdWNoIHRoYXQgc29tZSBwYXJ0cyBvZiB0aGUgbGluZSBpcyBzdGlsbCB2aXNpYmxlLlxuICAgICAqKi9cbiAgICBpc1Jvd0ZvbGRlZChkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkUm93OiBGb2xkTGluZSk6IGJvb2xlYW4ge1xuICAgICAgICByZXR1cm4gISF0aGlzLmdldEZvbGRMaW5lKGRvY1Jvdywgc3RhcnRGb2xkUm93KTtcbiAgICB9XG5cbiAgICBnZXRSb3dGb2xkRW5kKGRvY1JvdzogbnVtYmVyLCBzdGFydEZvbGRSb3c/OiBGb2xkTGluZSk6IG51bWJlciB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUoZG9jUm93LCBzdGFydEZvbGRSb3cpO1xuICAgICAgICByZXR1cm4gZm9sZExpbmUgPyBmb2xkTGluZS5lbmQucm93IDogZG9jUm93O1xuICAgIH1cblxuICAgIGdldFJvd0ZvbGRTdGFydChkb2NSb3c6IG51bWJlciwgc3RhcnRGb2xkUm93PzogRm9sZExpbmUpOiBudW1iZXIge1xuICAgICAgICB2YXIgZm9sZExpbmUgPSB0aGlzLmdldEZvbGRMaW5lKGRvY1Jvdywgc3RhcnRGb2xkUm93KTtcbiAgICAgICAgcmV0dXJuIGZvbGRMaW5lID8gZm9sZExpbmUuc3RhcnQucm93IDogZG9jUm93O1xuICAgIH1cblxuICAgIGdldEZvbGREaXNwbGF5TGluZShmb2xkTGluZTogRm9sZExpbmUsIGVuZFJvdz86IG51bWJlciwgZW5kQ29sdW1uPzogbnVtYmVyLCBzdGFydFJvdz86IG51bWJlciwgc3RhcnRDb2x1bW4/OiBudW1iZXIpOiBzdHJpbmcge1xuICAgICAgICBpZiAoc3RhcnRSb3cgPT0gbnVsbClcbiAgICAgICAgICAgIHN0YXJ0Um93ID0gZm9sZExpbmUuc3RhcnQucm93O1xuICAgICAgICBpZiAoc3RhcnRDb2x1bW4gPT0gbnVsbClcbiAgICAgICAgICAgIHN0YXJ0Q29sdW1uID0gMDtcbiAgICAgICAgaWYgKGVuZFJvdyA9PSBudWxsKVxuICAgICAgICAgICAgZW5kUm93ID0gZm9sZExpbmUuZW5kLnJvdztcbiAgICAgICAgaWYgKGVuZENvbHVtbiA9PSBudWxsKVxuICAgICAgICAgICAgZW5kQ29sdW1uID0gdGhpcy5nZXRMaW5lKGVuZFJvdykubGVuZ3RoO1xuICAgICAgICBcblxuICAgICAgICAvLyBCdWlsZCB0aGUgdGV4dGxpbmUgdXNpbmcgdGhlIEZvbGRMaW5lIHdhbGtlci5cbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICB2YXIgdGV4dExpbmUgPSBcIlwiO1xuXG4gICAgICAgIGZvbGRMaW5lLndhbGsoZnVuY3Rpb24ocGxhY2Vob2xkZXI6IHN0cmluZywgcm93OiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBsYXN0Q29sdW1uOiBudW1iZXIpIHtcbiAgICAgICAgICAgIGlmIChyb3cgPCBzdGFydFJvdylcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBpZiAocm93ID09IHN0YXJ0Um93KSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbHVtbiA8IHN0YXJ0Q29sdW1uKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgbGFzdENvbHVtbiA9IE1hdGgubWF4KHN0YXJ0Q29sdW1uLCBsYXN0Q29sdW1uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKHBsYWNlaG9sZGVyICE9IG51bGwpIHtcbiAgICAgICAgICAgICAgICB0ZXh0TGluZSArPSBwbGFjZWhvbGRlcjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGV4dExpbmUgKz0gc2VsZi5nZXRMaW5lKHJvdykuc3Vic3RyaW5nKGxhc3RDb2x1bW4sIGNvbHVtbik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIGVuZFJvdywgZW5kQ29sdW1uKTtcbiAgICAgICAgcmV0dXJuIHRleHRMaW5lO1xuICAgIH1cblxuICAgIGdldERpc3BsYXlMaW5lKHJvdzogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlciwgc3RhcnRSb3c6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlcik6IHN0cmluZyB7XG4gICAgICAgIHZhciBmb2xkTGluZSA9IHRoaXMuZ2V0Rm9sZExpbmUocm93KTtcblxuICAgICAgICBpZiAoIWZvbGRMaW5lKSB7XG4gICAgICAgICAgICB2YXIgbGluZTogc3RyaW5nO1xuICAgICAgICAgICAgbGluZSA9IHRoaXMuZ2V0TGluZShyb3cpO1xuICAgICAgICAgICAgcmV0dXJuIGxpbmUuc3Vic3RyaW5nKHN0YXJ0Q29sdW1uIHx8IDAsIGVuZENvbHVtbiB8fCBsaW5lLmxlbmd0aCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRGb2xkRGlzcGxheUxpbmUoXG4gICAgICAgICAgICAgICAgZm9sZExpbmUsIHJvdywgZW5kQ29sdW1uLCBzdGFydFJvdywgc3RhcnRDb2x1bW4pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJpdmF0ZSAkY2xvbmVGb2xkRGF0YSgpIHtcbiAgICAgICAgdmFyIGZkID0gW107XG4gICAgICAgIGZkID0gdGhpcy4kZm9sZERhdGEubWFwKGZ1bmN0aW9uKGZvbGRMaW5lKSB7XG4gICAgICAgICAgICB2YXIgZm9sZHMgPSBmb2xkTGluZS5mb2xkcy5tYXAoZnVuY3Rpb24oZm9sZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmb2xkLmNsb25lKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBuZXcgRm9sZExpbmUoZmQsIGZvbGRzKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIGZkO1xuICAgIH1cblxuICAgIHRvZ2dsZUZvbGQodHJ5VG9VbmZvbGQ6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICAgICAgdmFyIHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0aW9uO1xuICAgICAgICB2YXIgcmFuZ2U6IFJhbmdlID0gc2VsZWN0aW9uLmdldFJhbmdlKCk7XG4gICAgICAgIHZhciBmb2xkOiBGb2xkO1xuICAgICAgICB2YXIgYnJhY2tldFBvczogeyByb3c6IG51bWJlcjsgY29sdW1uOiBudW1iZXIgfTtcblxuICAgICAgICBpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG4gICAgICAgICAgICB2YXIgY3Vyc29yID0gcmFuZ2Uuc3RhcnQ7XG4gICAgICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbik7XG5cbiAgICAgICAgICAgIGlmIChmb2xkKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkKGZvbGQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYnJhY2tldFBvcyA9IHRoaXMuZmluZE1hdGNoaW5nQnJhY2tldChjdXJzb3IpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlLmNvbXBhcmVQb2ludChicmFja2V0UG9zKSA9PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLmVuZCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2Uuc3RhcnQgPSBicmFja2V0UG9zO1xuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4rKztcbiAgICAgICAgICAgICAgICAgICAgcmFuZ2UuZW5kLmNvbHVtbi0tO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYnJhY2tldFBvcyA9IHRoaXMuZmluZE1hdGNoaW5nQnJhY2tldCh7IHJvdzogY3Vyc29yLnJvdywgY29sdW1uOiBjdXJzb3IuY29sdW1uICsgMSB9KSkge1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZS5jb21wYXJlUG9pbnQoYnJhY2tldFBvcykgPT09IDEpXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlLmVuZCA9IGJyYWNrZXRQb3M7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICByYW5nZS5zdGFydCA9IGJyYWNrZXRQb3M7XG5cbiAgICAgICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4rKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcmFuZ2UgPSB0aGlzLmdldENvbW1lbnRGb2xkUmFuZ2UoY3Vyc29yLnJvdywgY3Vyc29yLmNvbHVtbikgfHwgcmFuZ2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgZm9sZHMgPSB0aGlzLmdldEZvbGRzSW5SYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAodHJ5VG9VbmZvbGQgJiYgZm9sZHMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5leHBhbmRGb2xkcyhmb2xkcyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChmb2xkcy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgICAgIGZvbGQgPSBmb2xkc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghZm9sZClcbiAgICAgICAgICAgIGZvbGQgPSB0aGlzLmdldEZvbGRBdChyYW5nZS5zdGFydC5yb3csIHJhbmdlLnN0YXJ0LmNvbHVtbik7XG5cbiAgICAgICAgaWYgKGZvbGQgJiYgZm9sZC5yYW5nZS50b1N0cmluZygpID09IHJhbmdlLnRvU3RyaW5nKCkpIHtcbiAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBwbGFjZWhvbGRlciA9IFwiLi4uXCI7XG4gICAgICAgIGlmICghcmFuZ2UuaXNNdWx0aUxpbmUoKSkge1xuICAgICAgICAgICAgcGxhY2Vob2xkZXIgPSB0aGlzLmdldFRleHRSYW5nZShyYW5nZSk7XG4gICAgICAgICAgICBpZiAocGxhY2Vob2xkZXIubGVuZ3RoIDwgNClcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyLnRyaW0oKS5zdWJzdHJpbmcoMCwgMikgKyBcIi4uXCI7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmFkZEZvbGQocGxhY2Vob2xkZXIsIHJhbmdlKTtcbiAgICB9XG5cbiAgICBnZXRDb21tZW50Rm9sZFJhbmdlKHJvdzogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgZGlyPzogbnVtYmVyKTogUmFuZ2Uge1xuICAgICAgICB2YXIgaXRlcmF0b3IgPSBuZXcgVG9rZW5JdGVyYXRvcih0aGlzLCByb3csIGNvbHVtbik7XG4gICAgICAgIHZhciB0b2tlbiA9IGl0ZXJhdG9yLmdldEN1cnJlbnRUb2tlbigpO1xuICAgICAgICBpZiAodG9rZW4gJiYgL15jb21tZW50fHN0cmluZy8udGVzdCh0b2tlbi50eXBlKSkge1xuICAgICAgICAgICAgdmFyIHJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIDAsIDApO1xuICAgICAgICAgICAgdmFyIHJlID0gbmV3IFJlZ0V4cCh0b2tlbi50eXBlLnJlcGxhY2UoL1xcLi4qLywgXCJcXFxcLlwiKSk7XG4gICAgICAgICAgICBpZiAoZGlyICE9IDEpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3Iuc3RlcEJhY2t3YXJkKCk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgICAgICAgICAgaXRlcmF0b3Iuc3RlcEZvcndhcmQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmFuZ2Uuc3RhcnQucm93ID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuUm93KCk7XG4gICAgICAgICAgICByYW5nZS5zdGFydC5jb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIDI7XG5cbiAgICAgICAgICAgIGl0ZXJhdG9yID0gbmV3IFRva2VuSXRlcmF0b3IodGhpcywgcm93LCBjb2x1bW4pO1xuXG4gICAgICAgICAgICBpZiAoZGlyICE9IC0xKSB7XG4gICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICB0b2tlbiA9IGl0ZXJhdG9yLnN0ZXBGb3J3YXJkKCk7XG4gICAgICAgICAgICAgICAgfSB3aGlsZSAodG9rZW4gJiYgcmUudGVzdCh0b2tlbi50eXBlKSk7XG4gICAgICAgICAgICAgICAgdG9rZW4gPSBpdGVyYXRvci5zdGVwQmFja3dhcmQoKTtcbiAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgIHRva2VuID0gaXRlcmF0b3IuZ2V0Q3VycmVudFRva2VuKCk7XG5cbiAgICAgICAgICAgIHJhbmdlLmVuZC5yb3cgPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Sb3coKTtcbiAgICAgICAgICAgIHJhbmdlLmVuZC5jb2x1bW4gPSBpdGVyYXRvci5nZXRDdXJyZW50VG9rZW5Db2x1bW4oKSArIHRva2VuLnZhbHVlLmxlbmd0aCAtIDI7XG4gICAgICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmb2xkQWxsKHN0YXJ0Um93OiBudW1iZXIsIGVuZFJvdzogbnVtYmVyLCBkZXB0aDogbnVtYmVyKTogdm9pZCB7XG4gICAgICAgIGlmIChkZXB0aCA9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICBkZXB0aCA9IDEwMDAwMDsgLy8gSlNPTi5zdHJpbmdpZnkgZG9lc24ndCBoYW5sZSBJbmZpbml0eVxuICAgICAgICB2YXIgZm9sZFdpZGdldHMgPSB0aGlzLmZvbGRXaWRnZXRzO1xuICAgICAgICBpZiAoIWZvbGRXaWRnZXRzKVxuICAgICAgICAgICAgcmV0dXJuOyAvLyBtb2RlIGRvZXNuJ3Qgc3VwcG9ydCBmb2xkaW5nXG4gICAgICAgIGVuZFJvdyA9IGVuZFJvdyB8fCB0aGlzLmdldExlbmd0aCgpO1xuICAgICAgICBzdGFydFJvdyA9IHN0YXJ0Um93IHx8IDA7XG4gICAgICAgIGZvciAodmFyIHJvdyA9IHN0YXJ0Um93OyByb3cgPCBlbmRSb3c7IHJvdysrKSB7XG4gICAgICAgICAgICBpZiAoZm9sZFdpZGdldHNbcm93XSA9PSBudWxsKVxuICAgICAgICAgICAgICAgIGZvbGRXaWRnZXRzW3Jvd10gPSB0aGlzLmdldEZvbGRXaWRnZXQocm93KTtcbiAgICAgICAgICAgIGlmIChmb2xkV2lkZ2V0c1tyb3ddICE9IFwic3RhcnRcIilcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAgICAgdmFyIHJhbmdlID0gdGhpcy5nZXRGb2xkV2lkZ2V0UmFuZ2Uocm93KTtcbiAgICAgICAgICAgIC8vIHNvbWV0aW1lcyByYW5nZSBjYW4gYmUgaW5jb21wYXRpYmxlIHdpdGggZXhpc3RpbmcgZm9sZFxuICAgICAgICAgICAgLy8gVE9ETyBjaGFuZ2UgYWRkRm9sZCB0byByZXR1cm4gbnVsbCBpc3RlYWQgb2YgdGhyb3dpbmdcbiAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5pc011bHRpTGluZSgpXG4gICAgICAgICAgICAgICAgJiYgcmFuZ2UuZW5kLnJvdyA8PSBlbmRSb3dcbiAgICAgICAgICAgICAgICAmJiByYW5nZS5zdGFydC5yb3cgPj0gc3RhcnRSb3dcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJvdyA9IHJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgLy8gYWRkRm9sZCBjYW4gY2hhbmdlIHRoZSByYW5nZVxuICAgICAgICAgICAgICAgICAgICB2YXIgZm9sZCA9IHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkKVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9sZC5jb2xsYXBzZUNoaWxkcmVuID0gZGVwdGg7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkgeyB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBzZXRGb2xkU3R5bGUoc3R5bGU6IHN0cmluZykge1xuICAgICAgICBpZiAoIXRoaXMuJGZvbGRTdHlsZXNbc3R5bGVdKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBmb2xkIHN0eWxlOiBcIiArIHN0eWxlICsgXCJbXCIgKyBPYmplY3Qua2V5cyh0aGlzLiRmb2xkU3R5bGVzKS5qb2luKFwiLCBcIikgKyBcIl1cIik7XG5cbiAgICAgICAgaWYgKHRoaXMuJGZvbGRTdHlsZSA9PT0gc3R5bGUpXG4gICAgICAgICAgICByZXR1cm47XG5cbiAgICAgICAgdGhpcy4kZm9sZFN0eWxlID0gc3R5bGU7XG5cbiAgICAgICAgaWYgKHN0eWxlID09PSBcIm1hbnVhbFwiKVxuICAgICAgICAgICAgdGhpcy51bmZvbGQoKTtcbiAgICAgICAgXG4gICAgICAgIC8vIHJlc2V0IGZvbGRpbmdcbiAgICAgICAgdmFyIG1vZGUgPSB0aGlzLiRmb2xkTW9kZTtcbiAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhudWxsKTtcbiAgICAgICAgdGhpcy4kc2V0Rm9sZGluZyhtb2RlKTtcbiAgICB9XG5cbiAgICBwcml2YXRlICRzZXRGb2xkaW5nKGZvbGRNb2RlKSB7XG4gICAgICAgIGlmICh0aGlzLiRmb2xkTW9kZSA9PSBmb2xkTW9kZSlcbiAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICB0aGlzLiRmb2xkTW9kZSA9IGZvbGRNb2RlO1xuXG4gICAgICAgIHRoaXMub2ZmKCdjaGFuZ2UnLCB0aGlzLiR1cGRhdGVGb2xkV2lkZ2V0cyk7XG4gICAgICAgIHRoaXMuX2VtaXQoXCJjaGFuZ2VBbm5vdGF0aW9uXCIpO1xuXG4gICAgICAgIGlmICghZm9sZE1vZGUgfHwgdGhpcy4kZm9sZFN0eWxlID09IFwibWFudWFsXCIpIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMgPSBudWxsO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cyA9IFtdO1xuICAgICAgICB0aGlzLmdldEZvbGRXaWRnZXQgPSBmb2xkTW9kZS5nZXRGb2xkV2lkZ2V0LmJpbmQoZm9sZE1vZGUsIHRoaXMsIHRoaXMuJGZvbGRTdHlsZSk7XG4gICAgICAgIHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlID0gZm9sZE1vZGUuZ2V0Rm9sZFdpZGdldFJhbmdlLmJpbmQoZm9sZE1vZGUsIHRoaXMsIHRoaXMuJGZvbGRTdHlsZSk7XG5cbiAgICAgICAgdGhpcy4kdXBkYXRlRm9sZFdpZGdldHMgPSB0aGlzLnVwZGF0ZUZvbGRXaWRnZXRzLmJpbmQodGhpcyk7XG4gICAgICAgIHRoaXMub24oJ2NoYW5nZScsIHRoaXMuJHVwZGF0ZUZvbGRXaWRnZXRzKTtcblxuICAgIH1cblxuICAgIGdldFBhcmVudEZvbGRSYW5nZURhdGEocm93OiBudW1iZXIsIGlnbm9yZUN1cnJlbnQ/OiBib29sZWFuKTogeyByYW5nZT86IFJhbmdlOyBmaXJzdFJhbmdlPzogUmFuZ2UgfSB7XG4gICAgICAgIHZhciBmdyA9IHRoaXMuZm9sZFdpZGdldHM7XG4gICAgICAgIGlmICghZncgfHwgKGlnbm9yZUN1cnJlbnQgJiYgZndbcm93XSkpIHtcbiAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpID0gcm93IC0gMTtcbiAgICAgICAgdmFyIGZpcnN0UmFuZ2U6IFJhbmdlO1xuICAgICAgICB3aGlsZSAoaSA+PSAwKSB7XG4gICAgICAgICAgICB2YXIgYyA9IGZ3W2ldO1xuICAgICAgICAgICAgaWYgKGMgPT0gbnVsbClcbiAgICAgICAgICAgICAgICBjID0gZndbaV0gPSB0aGlzLmdldEZvbGRXaWRnZXQoaSk7XG5cbiAgICAgICAgICAgIGlmIChjID09IFwic3RhcnRcIikge1xuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKGkpO1xuICAgICAgICAgICAgICAgIGlmICghZmlyc3RSYW5nZSlcbiAgICAgICAgICAgICAgICAgICAgZmlyc3RSYW5nZSA9IHJhbmdlO1xuICAgICAgICAgICAgICAgIGlmIChyYW5nZSAmJiByYW5nZS5lbmQucm93ID49IHJvdylcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpLS07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgcmFuZ2U6IGkgIT09IC0xICYmIHJhbmdlLFxuICAgICAgICAgICAgZmlyc3RSYW5nZTogZmlyc3RSYW5nZVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIG9uRm9sZFdpZGdldENsaWNrKHJvdzogbnVtYmVyLCBlKSB7XG4gICAgICAgIGUgPSBlLmRvbUV2ZW50O1xuICAgICAgICB2YXIgb3B0aW9ucyA9IHtcbiAgICAgICAgICAgIGNoaWxkcmVuOiBlLnNoaWZ0S2V5LFxuICAgICAgICAgICAgYWxsOiBlLmN0cmxLZXkgfHwgZS5tZXRhS2V5LFxuICAgICAgICAgICAgc2libGluZ3M6IGUuYWx0S2V5XG4gICAgICAgIH07XG5cbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy4kdG9nZ2xlRm9sZFdpZGdldChyb3csIG9wdGlvbnMpO1xuICAgICAgICBpZiAoIXJhbmdlKSB7XG4gICAgICAgICAgICB2YXIgZWwgPSAoZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50KVxuICAgICAgICAgICAgaWYgKGVsICYmIC9hY2VfZm9sZC13aWRnZXQvLnRlc3QoZWwuY2xhc3NOYW1lKSlcbiAgICAgICAgICAgICAgICBlbC5jbGFzc05hbWUgKz0gXCIgYWNlX2ludmFsaWRcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByaXZhdGUgJHRvZ2dsZUZvbGRXaWRnZXQocm93OiBudW1iZXIsIG9wdGlvbnMpOiBSYW5nZSB7XG4gICAgICAgIGlmICghdGhpcy5nZXRGb2xkV2lkZ2V0KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB2YXIgdHlwZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldChyb3cpO1xuICAgICAgICB2YXIgbGluZSA9IHRoaXMuZ2V0TGluZShyb3cpO1xuXG4gICAgICAgIHZhciBkaXIgPSB0eXBlID09PSBcImVuZFwiID8gLTEgOiAxO1xuICAgICAgICB2YXIgZm9sZCA9IHRoaXMuZ2V0Rm9sZEF0KHJvdywgZGlyID09PSAtMSA/IDAgOiBsaW5lLmxlbmd0aCwgZGlyKTtcblxuICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgaWYgKG9wdGlvbnMuY2hpbGRyZW4gfHwgb3B0aW9ucy5hbGwpXG4gICAgICAgICAgICAgICAgdGhpcy5yZW1vdmVGb2xkKGZvbGQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuZXhwYW5kRm9sZChmb2xkKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYW5nZSA9IHRoaXMuZ2V0Rm9sZFdpZGdldFJhbmdlKHJvdywgdHJ1ZSk7XG4gICAgICAgIC8vIHNvbWV0aW1lcyBzaW5nbGVsaW5lIGZvbGRzIGNhbiBiZSBtaXNzZWQgYnkgdGhlIGNvZGUgYWJvdmVcbiAgICAgICAgaWYgKHJhbmdlICYmICFyYW5nZS5pc011bHRpTGluZSgpKSB7XG4gICAgICAgICAgICBmb2xkID0gdGhpcy5nZXRGb2xkQXQocmFuZ2Uuc3RhcnQucm93LCByYW5nZS5zdGFydC5jb2x1bW4sIDEpO1xuICAgICAgICAgICAgaWYgKGZvbGQgJiYgcmFuZ2UuaXNFcXVhbChmb2xkLnJhbmdlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob3B0aW9ucy5zaWJsaW5ncykge1xuICAgICAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmdldFBhcmVudEZvbGRSYW5nZURhdGEocm93KTtcbiAgICAgICAgICAgIGlmIChkYXRhLnJhbmdlKSB7XG4gICAgICAgICAgICAgICAgdmFyIHN0YXJ0Um93ID0gZGF0YS5yYW5nZS5zdGFydC5yb3cgKyAxO1xuICAgICAgICAgICAgICAgIHZhciBlbmRSb3cgPSBkYXRhLnJhbmdlLmVuZC5yb3c7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwoc3RhcnRSb3csIGVuZFJvdywgb3B0aW9ucy5hbGwgPyAxMDAwMCA6IDApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9wdGlvbnMuY2hpbGRyZW4pIHtcbiAgICAgICAgICAgIGVuZFJvdyA9IHJhbmdlID8gcmFuZ2UuZW5kLnJvdyA6IHRoaXMuZ2V0TGVuZ3RoKCk7XG4gICAgICAgICAgICB0aGlzLmZvbGRBbGwocm93ICsgMSwgcmFuZ2UuZW5kLnJvdywgb3B0aW9ucy5hbGwgPyAxMDAwMCA6IDApO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHJhbmdlKSB7XG4gICAgICAgICAgICBpZiAob3B0aW9ucy5hbGwpIHtcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIGEgYml0IHVnbHksIGJ1dCBpdCBjb3JyZXNwb25kcyB0byBzb21lIGNvZGUgZWxzZXdoZXJlLlxuICAgICAgICAgICAgICAgIHJhbmdlLmNvbGxhcHNlQ2hpbGRyZW4gPSAxMDAwMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuYWRkRm9sZChcIi4uLlwiLCByYW5nZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmFuZ2U7XG4gICAgfVxuXG5cblxuICAgIHRvZ2dsZUZvbGRXaWRnZXQodG9nZ2xlUGFyZW50KSB7XG4gICAgICAgIHZhciByb3c6IG51bWJlciA9IHRoaXMuc2VsZWN0aW9uLmdldEN1cnNvcigpLnJvdztcbiAgICAgICAgcm93ID0gdGhpcy5nZXRSb3dGb2xkU3RhcnQocm93KTtcbiAgICAgICAgdmFyIHJhbmdlID0gdGhpcy4kdG9nZ2xlRm9sZFdpZGdldChyb3csIHt9KTtcblxuICAgICAgICBpZiAocmFuZ2UpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIC8vIGhhbmRsZSB0b2dnbGVQYXJlbnRcbiAgICAgICAgdmFyIGRhdGEgPSB0aGlzLmdldFBhcmVudEZvbGRSYW5nZURhdGEocm93LCB0cnVlKTtcbiAgICAgICAgcmFuZ2UgPSBkYXRhLnJhbmdlIHx8IGRhdGEuZmlyc3RSYW5nZTtcblxuICAgICAgICBpZiAocmFuZ2UpIHtcbiAgICAgICAgICAgIHJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgICAgIHZhciBmb2xkID0gdGhpcy5nZXRGb2xkQXQocm93LCB0aGlzLmdldExpbmUocm93KS5sZW5ndGgsIDEpO1xuXG4gICAgICAgICAgICBpZiAoZm9sZCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVtb3ZlRm9sZChmb2xkKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hZGRGb2xkKFwiLi4uXCIsIHJhbmdlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHVwZGF0ZUZvbGRXaWRnZXRzKGU6IHsgZGF0YTogeyBhY3Rpb246IHN0cmluZzsgcmFuZ2U6IFJhbmdlIH0gfSwgZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uKTogdm9pZCB7XG4gICAgICAgIHZhciBkZWx0YSA9IGUuZGF0YTtcbiAgICAgICAgdmFyIHJhbmdlID0gZGVsdGEucmFuZ2U7XG4gICAgICAgIHZhciBmaXJzdFJvdyA9IHJhbmdlLnN0YXJ0LnJvdztcbiAgICAgICAgdmFyIGxlbiA9IHJhbmdlLmVuZC5yb3cgLSBmaXJzdFJvdztcblxuICAgICAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICAgICAgICB0aGlzLmZvbGRXaWRnZXRzW2ZpcnN0Um93XSA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoZGVsdGEuYWN0aW9uID09IFwicmVtb3ZlVGV4dFwiIHx8IGRlbHRhLmFjdGlvbiA9PSBcInJlbW92ZUxpbmVzXCIpIHtcbiAgICAgICAgICAgIHRoaXMuZm9sZFdpZGdldHMuc3BsaWNlKGZpcnN0Um93LCBsZW4gKyAxLCBudWxsKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuICsgMSk7XG4gICAgICAgICAgICBhcmdzLnVuc2hpZnQoZmlyc3RSb3csIDEpO1xuICAgICAgICAgICAgdGhpcy5mb2xkV2lkZ2V0cy5zcGxpY2UuYXBwbHkodGhpcy5mb2xkV2lkZ2V0cywgYXJncyk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbi8vIEZJWE1FOiBSZXN0b3JlXG4vLyBGb2xkaW5nLmNhbGwoRWRpdFNlc3Npb24ucHJvdG90eXBlKTtcblxuZGVmaW5lT3B0aW9ucyhFZGl0U2Vzc2lvbi5wcm90b3R5cGUsIFwic2Vzc2lvblwiLCB7XG4gICAgd3JhcDoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoIXZhbHVlIHx8IHZhbHVlID09IFwib2ZmXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBmYWxzZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlID09IFwiZnJlZVwiKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gdHJ1ZTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHZhbHVlID09IFwicHJpbnRNYXJnaW5cIilcbiAgICAgICAgICAgICAgICB2YWx1ZSA9IC0xO1xuICAgICAgICAgICAgZWxzZSBpZiAodHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIpXG4gICAgICAgICAgICAgICAgdmFsdWUgPSBwYXJzZUludCh2YWx1ZSwgMTApIHx8IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAodGhpcy4kd3JhcCA9PSB2YWx1ZSlcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICBpZiAoIXZhbHVlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRVc2VXcmFwTW9kZShmYWxzZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjb2wgPSB0eXBlb2YgdmFsdWUgPT0gXCJudW1iZXJcIiA/IHZhbHVlIDogbnVsbDtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFdyYXBMaW1pdFJhbmdlKGNvbCwgY29sKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFVzZVdyYXBNb2RlKHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy4kd3JhcCA9IHZhbHVlO1xuICAgICAgICB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuZ2V0VXNlV3JhcE1vZGUoKSkge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLiR3cmFwID09IC0xKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCJwcmludE1hcmdpblwiO1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5nZXRXcmFwTGltaXRSYW5nZSgpLm1pbilcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFwiZnJlZVwiO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiR3cmFwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFwib2ZmXCI7XG4gICAgICAgIH0sXG4gICAgICAgIGhhbmRsZXNTZXQ6IHRydWVcbiAgICB9LFxuICAgIHdyYXBNZXRob2Q6IHtcbiAgICAgICAgLy8gY29kZXx0ZXh0fGF1dG9cbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgIHZhbCA9IHZhbCA9PSBcImF1dG9cIlxuICAgICAgICAgICAgICAgID8gdGhpcy4kbW9kZS50eXBlICE9IFwidGV4dFwiXG4gICAgICAgICAgICAgICAgOiB2YWwgIT0gXCJ0ZXh0XCI7XG4gICAgICAgICAgICBpZiAodmFsICE9IHRoaXMuJHdyYXBBc0NvZGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLiR3cmFwQXNDb2RlID0gdmFsO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLiR1c2VXcmFwTW9kZSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLiRtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJHJlc2V0Um93Q2FjaGUoMCk7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuJHVwZGF0ZVdyYXBEYXRhKDAsIHRoaXMuZ2V0TGVuZ3RoKCkgLSAxKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogXCJhdXRvXCJcbiAgICB9LFxuICAgIGZpcnN0TGluZU51bWJlcjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKCkgeyB0aGlzLl9zaWduYWwoXCJjaGFuZ2VCcmVha3BvaW50XCIpOyB9LFxuICAgICAgICBpbml0aWFsVmFsdWU6IDFcbiAgICB9LFxuICAgIHVzZVdvcmtlcjoge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHVzZVdvcmtlcikge1xuICAgICAgICAgICAgdGhpcy4kdXNlV29ya2VyID0gdXNlV29ya2VyO1xuXG4gICAgICAgICAgICB0aGlzLiRzdG9wV29ya2VyKCk7XG4gICAgICAgICAgICBpZiAodXNlV29ya2VyKVxuICAgICAgICAgICAgICAgIHRoaXMuJHN0YXJ0V29ya2VyKCk7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogdHJ1ZVxuICAgIH0sXG4gICAgdXNlU29mdFRhYnM6IHsgaW5pdGlhbFZhbHVlOiB0cnVlIH0sXG4gICAgdGFiU2l6ZToge1xuICAgICAgICBzZXQ6IGZ1bmN0aW9uKHRhYlNpemUpIHtcbiAgICAgICAgICAgIGlmIChpc05hTih0YWJTaXplKSB8fCB0aGlzLiR0YWJTaXplID09PSB0YWJTaXplKSByZXR1cm47XG5cbiAgICAgICAgICAgIHRoaXMuJG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgIHRoaXMuJHJvd0xlbmd0aENhY2hlID0gW107XG4gICAgICAgICAgICB0aGlzLiR0YWJTaXplID0gdGFiU2l6ZTtcbiAgICAgICAgICAgIHRoaXMuX3NpZ25hbChcImNoYW5nZVRhYlNpemVcIik7XG4gICAgICAgIH0sXG4gICAgICAgIGluaXRpYWxWYWx1ZTogNCxcbiAgICAgICAgaGFuZGxlc1NldDogdHJ1ZVxuICAgIH0sXG4gICAgb3ZlcndyaXRlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuX3NpZ25hbChcImNoYW5nZU92ZXJ3cml0ZVwiKTsgfSxcbiAgICAgICAgaW5pdGlhbFZhbHVlOiBmYWxzZVxuICAgIH0sXG4gICAgbmV3TGluZU1vZGU6IHtcbiAgICAgICAgc2V0OiBmdW5jdGlvbih2YWwpIHsgdGhpcy5kb2Muc2V0TmV3TGluZU1vZGUodmFsKSB9LFxuICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kb2MuZ2V0TmV3TGluZU1vZGUoKSB9LFxuICAgICAgICBoYW5kbGVzU2V0OiB0cnVlXG4gICAgfSxcbiAgICBtb2RlOiB7XG4gICAgICAgIHNldDogZnVuY3Rpb24odmFsKSB7IHRoaXMuc2V0TW9kZSh2YWwpIH0sXG4gICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLiRtb2RlSWQgfVxuICAgIH1cbn0pO1xuIl19